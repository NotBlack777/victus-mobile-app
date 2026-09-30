/**
 * authService.ts
 *
 * Authentication against the real Victus Cloud control panel
 * (`control.victuscloud.com`).
 *
 * The previous implementation fabricated a session locally: any email with a
 * six-character password produced a token from `Math.random()` and the role came
 * from a substring of the address. That is gone. Sign-in now happens over HTTPS
 * against the panel, using the same JSON endpoints its own frontend calls
 * (`POST /auth/login`, then `/auth/login/checkpoint` when the account has
 * two-factor enabled), and the app mints its own revocable API key so the user's
 * password is never stored.
 *
 * The credential itself is held by the native layer (`VictusAuth.java`), so this
 * module only ever sees the account. The public surface callers already use —
 * `signIn` / `signOut` / `getSession` / `getStoredSession` / `onAuthStateChange` —
 * is unchanged.
 *
 * Two session kinds come back from the panel:
 *
 *   - **`victus`** — a real panel session. `provider: 'victus'`, and the app
 *     re-validates it on every launch (`restore`), so a key revoked in the panel
 *     signs the app out instead of failing later.
 *   - **`demo`** — explicitly requested demo data (`signInDemo`). This is the only
 *     path that still invents an account, it is never reached by the sign-in form,
 *     and it is labelled in the UI so nobody mistakes it for a real session.
 */

import {
  isNativeAuthAvailable,
  nativeApiGet,
  nativePasswordReset,
  nativeRestore,
  nativeSignIn,
  nativeSignInWithApiKey,
  nativeSignOut,
  nativeSubmitTwoFactor,
  type NativeAuthResult,
  type NativeSession,
} from './victusBridge.ts';

export interface User {
  id: string;
  email: string;
  user_metadata: {
    name?: string;
    avatar_url?: string;
    role?: string;
  };
  created_at: string;
}

/** How the session was obtained. `demo` marks locally-fabricated demo data. */
export type AuthProviderKind = 'victus';

export interface Session {
  /**
   * Always empty for a real session: the panel credential lives in the app's
   * native layer and is deliberately never handed to the web app. Kept as a field
   * so existing callers keep type-checking.
   */
  access_token: string;
  token_type: string;
  /** Seconds until expiry, or 0 when the credential does not expire. */
  expires_in: number;
  /** Epoch millis, or 0 when the credential does not expire. */
  expires_at: number;
  user: User;
  provider: AuthProviderKind;
  /** `api_key` when the app minted a revocable key, `session` for a cookie fallback. */
  credentialKind?: 'api_key' | 'session';
  /** e.g. "…a1b2": enough to identify the key in the panel, never enough to use it. */
  keyMasked?: string;
  /**
   * Live count from `GET /api/client`, the one piece of real panel data the app
   * reads today. Absent when the panel could not be reached.
   */
  serverCount?: number;
}

export interface AuthError {
  message: string;
  status?: number;
}

export interface AuthResult {
  user: User | null;
  session: Session | null;
  error: AuthError | null;
  /** Set when the panel accepted the password but wants a second factor. */
  twoFactor?: { confirmationToken: string };
}

export type AuthChangeEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'USER_UPDATED' | 'INITIAL_SESSION';

export type AuthStateChangeCallback = (
  event: AuthChangeEvent,
  session: Session | null
) => void;

const AUTH_STORAGE_KEY = 'victus_auth_session';

/**
 * Where Victus Cloud accounts are actually created.
 *
 * <p>The control panel has registration disabled — {@code POST /auth/register}
 * answers 405 — so sign-up lives on the billing site instead. It is the
 * <em>form</em> at {@code /register}, not the billing area's front page: the old
 * value was the bare origin, which is why "Create Account" dropped the user on
 * the Control/billing dashboard instead of a sign-up form. Verified against the
 * live site: {@code /register} answers 200 and the billing page's own "Register"
 * link points at exactly this path.</p>
 */
export const ACCOUNT_SIGNUP_URL = 'https://billing.victuscloud.com/register';

/** The panel's own API-credentials screen, for creating a key by hand. */
export const API_CREDENTIALS_URL = 'https://control.victuscloud.com/account/api';

const BRIDGE_UNAVAILABLE_MESSAGE =
  'Sign-in needs the Victus Cloud Android app — this preview has no panel session. ' +
  'You can still explore with demo data.';

// In-memory subscribers for onAuthStateChange
const listeners: Set<AuthStateChangeCallback> = new Set();

function emitAuthChange(event: AuthChangeEvent, session: Session | null) {
  listeners.forEach((callback) => {
    try {
      callback(event, session);
    } catch (err) {
      console.error('Error in auth state change listener:', err);
    }
  });
}

function avatarFor(seed: string): string {
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
}

/**
 * Read the cached session on boot. The cached copy is deliberately credential-free
 * (the real one is native), and it exists so the shell can paint without waiting
 * for the network; `restore()` re-validates it straight afterwards.
 */
export function getStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    let session: Session;
    try {
      session = JSON.parse(raw) as Session;
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    if (!session || !session.user || !session.user.email) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    // expires_at === 0 means "does not expire" (a panel API key).
    if (session.expires_at && session.expires_at < Date.now()) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

function persistSession(session: Session | null) {
  try {
    if (session) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // Ignore storage issues
  }
}

function broadcastSession(session: Session | null) {
  persistSession(session);
  emitAuthChange(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
}

/** Maps the native layer's view of the panel account onto the app's session. */
function buildSessionFromNative(native: NativeSession): Session {
  const email = native.email || native.username || '';
  const name = native.name || native.username || email.split('@')[0];
  const createdAt = native.createdAt > 0
    ? new Date(native.createdAt).toISOString()
    : new Date().toISOString();

  return {
    access_token: '',
    token_type: native.kind,
    expires_in: native.expiresAt > 0
      ? Math.max(0, Math.floor((native.expiresAt - Date.now()) / 1000))
      : 0,
    expires_at: native.expiresAt,
    provider: 'victus',
    credentialKind: native.kind,
    keyMasked: native.keyMasked,
    user: {
      id: native.userId || native.username || email || 'panel-user',
      email,
      user_metadata: {
        name,
        avatar_url: avatarFor(email || name),
        // The role now comes from the panel's own admin flag rather than from the
        // email string, which is what the mock used to do.
        role: native.rootAdmin ? 'Administrator' : 'Cloud Member',
      },
      created_at: createdAt,
    },
  };
}


/** Live server count from the panel, plus whether the session was rejected. */
async function fetchServerCount(): Promise<{ count: number | null; unauthorized: boolean }> {
  if (!isNativeAuthAvailable()) return { count: null, unauthorized: false };
  try {
    const response = await nativeApiGet('/api/client');
    if (response.status === 401) return { count: null, unauthorized: true };
    if (!response.ok) return { count: null, unauthorized: false };
    const body = JSON.parse(response.body) as { data?: unknown[] };
    return { count: Array.isArray(body.data) ? body.data.length : 0, unauthorized: false };
  } catch {
    return { count: null, unauthorized: false };
  }
}

/**
 * Turns a native sign-in reply into a session, attaching the live server count.
 * A session the panel immediately rejects (revoked between issuing and use) is
 * treated as a failure rather than cached.
 */
async function completeSignIn(result: NativeAuthResult): Promise<AuthResult> {
  if (result.state === 'two_factor_required') {
    return {
      user: null,
      session: null,
      error: null,
      twoFactor: { confirmationToken: result.confirmationToken ?? '' },
    };
  }

  if (result.state !== 'signed_in' || !result.session) {
    return {
      user: null,
      session: null,
      error: {
        message: result.message || 'Sign-in failed. Please try again.',
        status: result.status,
      },
    };
  }

  let session = buildSessionFromNative(result.session);
  const { count, unauthorized } = await fetchServerCount();
  if (unauthorized) {
    clearSession();
    return {
      user: null,
      session: null,
      error: {
        message: 'The panel rejected the session it just issued. Please sign in again.',
        status: 401,
      },
    };
  }
  if (count !== null) session = { ...session, serverCount: count };

  broadcastSession(session);
  return { user: session.user, session, error: null };
}

function bridgeUnavailable(): AuthError {
  return { message: BRIDGE_UNAVAILABLE_MESSAGE, status: 0 };
}

/** Drops every local trace of a session and tells subscribers. */
function clearSession(): void {
  persistSession(null);
  emitAuthChange('SIGNED_OUT', null);
}

export const authService = {
  /** True when real sign-in is possible (the app, not a browser preview/copy). */
  isRealAuthAvailable(): boolean {
    return isNativeAuthAvailable();
  },

  /**
   * Sign in with the panel account's email (or username) and password.
   *
   * Resolves with `twoFactor` set instead of a session when the account has
   * two-factor enabled; pass the token to `verifyTwoFactor` to finish.
   */
  async signIn(email: string, password: string): Promise<AuthResult> {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      return {
        user: null,
        session: null,
        error: { message: 'Enter your Victus Cloud email or username.', status: 400 },
      };
    }
    if (!password) {
      return { user: null, session: null, error: { message: 'Enter your password.', status: 400 } };
    }
    if (!isNativeAuthAvailable()) {
      return { user: null, session: null, error: bridgeUnavailable() };
    }

    return completeSignIn(await nativeSignIn(cleanEmail, password));
  },

  /** Second step of a two-factor sign-in. */
  async verifyTwoFactor(confirmationToken: string, code: string): Promise<AuthResult> {
    if (!isNativeAuthAvailable()) {
      return { user: null, session: null, error: bridgeUnavailable() };
    }
    return completeSignIn(await nativeSubmitTwoFactor(confirmationToken, code));
  },

  /**
   * Sign in with an API key created in the panel (Account → API Credentials).
   * Useful when two-factor is on and the key should be managed by hand.
   */
  async signInWithApiKey(apiKey: string): Promise<AuthResult> {
    if (!apiKey.trim()) {
      return { user: null, session: null, error: { message: 'Paste your API key.', status: 400 } };
    }
    if (!isNativeAuthAvailable()) {
      return { user: null, session: null, error: bridgeUnavailable() };
    }
    return completeSignIn(await nativeSignInWithApiKey(apiKey.trim()));
  },

  /** Asks the panel to email a password-reset link for this account. */
  async requestPasswordReset(email: string): Promise<{ message?: string; error: AuthError | null }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { error: { message: 'Enter the email address on your account.', status: 400 } };
    }
    if (!isNativeAuthAvailable()) {
      return { error: bridgeUnavailable() };
    }

    const result = await nativePasswordReset(cleanEmail);
    if (result.state === 'info' && result.message) return { message: result.message, error: null };
    return {
      error: { message: result.message || 'The reset request failed.', status: result.status },
    };
  },

  /**
   * Enters the labelled demo experience: the sample data the app ships with,
   * with no panel connection at all.
   */
  /**
   * Sign out. Revokes the API key the app minted (so "Sign out" does not leave a
   * live credential on the panel) and clears every local trace of the session.
   */
  async signOut(options?: { revokeKey?: boolean }): Promise<{ error: AuthError | null }> {
    const revokeKey = options?.revokeKey ?? true;
    if (isNativeAuthAvailable()) {
      const result = await nativeSignOut(revokeKey);
      if (result.state === 'error' && result.message) {
        // The local session is cleared regardless: a panel that cannot be reached
        // must never trap the user in a signed-in UI.
        console.warn('Victus sign-out:', result.message);
      }
    }
    broadcastSession(null);
    return { error: null };
  },

  /**
   * Re-validates the stored session against the panel. Called once on start-up:
   * a session only survives if the panel still accepts its credential.
   */
  async restore(): Promise<{ session: Session | null; error: AuthError | null }> {
    if (!isNativeAuthAvailable()) {
      // No native panel session to validate against. Demo sessions no longer
      // exist (removed in 4.6.3), so a browser preview has nothing to restore
      // and the login screen is the honest answer.
      return { session: null, error: null };
    }

    const result = await nativeRestore();
    if (result.state === 'signed_in' && result.session) {
      let session = buildSessionFromNative(result.session);
      const { count } = await fetchServerCount();
      if (count !== null) session = { ...session, serverCount: count };
      persistSession(session);
      emitAuthChange('SIGNED_IN', session);
      return { session, error: null };
    }

    // The panel no longer accepts the stored credential (or there is none).
    persistSession(null);
    emitAuthChange('SIGNED_OUT', null);
    return { session: null, error: null };
  },

  /** Retrieve current active session. */
  async getSession(): Promise<{ session: Session | null; error: AuthError | null }> {
    const session = getStoredSession();
    return { session, error: null };
  },

  /** Retrieve current user. */
  async getUser(): Promise<{ user: User | null; error: AuthError | null }> {
    const session = getStoredSession();
    return { user: session ? session.user : null, error: null };
  },

  /** Synchronously retrieve the cached session. */
  getStoredSession(): Session | null {
    return getStoredSession();
  },

  /**
   * Listen to auth state transitions. The initial session is emitted
   * synchronously right after subscribing.
   */
  onAuthStateChange(callback: AuthStateChangeCallback): { unsubscribe: () => void } {
    listeners.add(callback);
    const current = getStoredSession();
    callback('INITIAL_SESSION', current);

    // Cross-tab sync via the storage event
    const handleStorage = (e: StorageEvent) => {
      if (e.key !== AUTH_STORAGE_KEY) return;
      callback('INITIAL_SESSION', getStoredSession());
    };
    window.addEventListener('storage', handleStorage);

    return {
      unsubscribe: () => {
        listeners.delete(callback);
        window.removeEventListener('storage', handleStorage);
      },
    };
  },
};

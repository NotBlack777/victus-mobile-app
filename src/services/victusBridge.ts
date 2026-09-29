/**
 * victusBridge.ts
 *
 * The JavaScript side of the app's native bridge (`window.VictusNative`).
 *
 * Authentication is implemented natively (see `VictusAuth.java`) because the
 * bundled bundle runs on `appassets.androidplatform.net`: a `fetch` from here to
 * `control.victuscloud.com` would be a cross-origin request the panel does not
 * answer for us, and it would also put the user's API key inside the WebView's
 * JavaScript context. Instead every call is forwarded to Java, and the pane's
 * replies come back through a promise.
 *
 * Calls are asynchronous in both directions: Java methods are injected into the
 * page, but they run on the WebView's own thread, so each call carries a callback
 * id and the native side resolves it by evaluating
 * `window.__victusBridge.resolve(id, payload)` on the UI thread.
 */

/** The panel account, as the native layer describes it. Carries no credential. */
export interface NativeSession {
  kind: 'api_key' | 'session';
  userId: string;
  username: string;
  email: string;
  name: string;
  rootAdmin: boolean;
  twoFactorEnabled: boolean;
  createdAt: number;
  /** Epoch millis, or 0 when the credential does not expire. */
  expiresAt: number;
  /** e.g. "…a1b2" — enough to identify the key, never enough to use it. */
  keyMasked: string;
}

export interface NativeAuthResult {
  ok: boolean;
  state: 'signed_in' | 'two_factor_required' | 'signed_out' | 'info' | 'error';
  message?: string;
  status?: number;
  confirmationToken?: string;
  session?: NativeSession;
}

export interface NativeApiResponse {
  ok: boolean;
  state: string;
  status: number;
  /** Raw panel body; parse it at the call site. */
  body: string;
  message?: string;
}

/** A native method that takes a callback id as its last argument. */
type BridgeMethod =
  | 'authSignIn'
  | 'authSubmitTwoFactor'
  | 'authSignInWithApiKey'
  | 'authRestore'
  | 'authSignOut'
  | 'authPasswordReset'
  | 'apiGet'
  | 'apiPost';

const BRIDGE_TIMEOUT_MS = 20_000;

let nextCallbackId = 1;
const pending = new Map<number, (payload: string) => void>();

/**
 * Installs the resolver the native side calls back into. Idempotent, and safe to
 * call before the bridge exists (a browser has no native side at all).
 */
function installResolver(): void {
  if (typeof window === 'undefined') return;
  const target = window as unknown as {
    __victusBridge?: { resolve: (id: number, payload: string) => void };
  };
  if (target.__victusBridge) return;

  target.__victusBridge = {
    resolve(id: number, payload: string) {
      const settle = pending.get(Number(id));
      if (!settle) return; // already timed out
      pending.delete(Number(id));
      settle(payload);
    },
  };
}

/**
 * True when the app is running inside the Android shell with the auth bridge.
 *
 * Deliberately checks that *any* auth method exists rather than one specific one:
 * a shell build older than this app bundle exposes the navigation half of the
 * bridge only, and must degrade to the browser behaviour instead of pretending
 * sign-in is available and then failing on the first call.
 */
export function isNativeAuthAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const native = (window as unknown as { VictusNative?: Record<string, unknown> }).VictusNative;
  if (!native) return false;
  return AUTH_METHODS.some((method) => typeof native[method] === 'function');
}

const AUTH_METHODS: BridgeMethod[] = [
  'authSignIn',
  'authSubmitTwoFactor',
  'authSignInWithApiKey',
  'authRestore',
  'authSignOut',
  'authPasswordReset',
];

function nativeMethods(): Record<string, unknown> | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { VictusNative?: Record<string, unknown> }).VictusNative;
}

/**
 * Invokes a native bridge method and resolves with its raw JSON payload.
 *
 * Rejects when the bridge is missing, when the native call throws (a URL or path
 * the app refused, for instance), or when no answer arrives in time — the last
 * case matters because a dropped reply would otherwise leave the sign-in button
 * spinning forever.
 */
function invoke(method: BridgeMethod, ...args: unknown[]): Promise<string> {
  installResolver();
  const methods = nativeMethods();
  const fn = methods?.[method];
  if (typeof fn !== 'function') {
    return Promise.reject(new Error('This build has no Victus Cloud sign-in — open the app.'));
  }

  const callbackId = nextCallbackId++;
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(callbackId);
      reject(new Error('The panel did not answer in time. Check your connection and try again.'));
    }, BRIDGE_TIMEOUT_MS);

    pending.set(callbackId, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });

    try {
      (fn as (...callArgs: unknown[]) => void).call(methods, ...args, String(callbackId));
    } catch (err) {
      clearTimeout(timer);
      pending.delete(callbackId);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/** Parses a native payload, never throwing: a malformed reply is just a failure. */
function parsePayload<T>(payload: string, fallbackMessage: string): T {
  try {
    const parsed = JSON.parse(payload) as T;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // Falls through to the synthetic failure below.
  }
  return { ok: false, state: 'error', message: fallbackMessage } as unknown as T;
}

function failure(message: string, status?: number): NativeAuthResult {
  return { ok: false, state: 'error', message, status };
}

/** Signs in with the panel account's email (or username) and password. */
export async function nativeSignIn(user: string, password: string): Promise<NativeAuthResult> {
  try {
    return parsePayload<NativeAuthResult>(
      await invoke('authSignIn', user, password),
      'The app could not read the panel response.'
    );
  } catch (err) {
    return failure(err instanceof Error ? err.message : 'Sign-in failed.');
  }
}

/** Completes a two-factor sign-in with a 6-digit code or a recovery code. */
export async function nativeSubmitTwoFactor(
  confirmationToken: string,
  code: string
): Promise<NativeAuthResult> {
  try {
    return parsePayload<NativeAuthResult>(
      await invoke('authSubmitTwoFactor', confirmationToken, code),
      'The app could not read the panel response.'
    );
  } catch (err) {
    return failure(err instanceof Error ? err.message : 'That code could not be checked.');
  }
}

/** Signs in with an API key from the panel's Account → API Credentials screen. */
export async function nativeSignInWithApiKey(apiKey: string): Promise<NativeAuthResult> {
  try {
    return parsePayload<NativeAuthResult>(
      await invoke('authSignInWithApiKey', apiKey),
      'The app could not read the panel response.'
    );
  } catch (err) {
    return failure(err instanceof Error ? err.message : 'That key could not be checked.');
  }
}

/** Restores the stored session and re-validates it against the panel. */
export async function nativeRestore(): Promise<NativeAuthResult> {
  try {
    return parsePayload<NativeAuthResult>(
      await invoke('authRestore'),
      'The app could not read the stored session.'
    );
  } catch (err) {
    return failure(err instanceof Error ? err.message : 'The stored session could not be read.');
  }
}

/** Signs out; `revoke` also deletes the API key this app created. */
export async function nativeSignOut(revoke: boolean): Promise<NativeAuthResult> {
  try {
    return parsePayload<NativeAuthResult>(
      await invoke('authSignOut', revoke),
      'Sign-out did not complete.'
    );
  } catch (err) {
    return failure(err instanceof Error ? err.message : 'Sign-out did not complete.');
  }
}

/** Asks the panel to email a password-reset link. */
export async function nativePasswordReset(email: string): Promise<NativeAuthResult> {
  try {
    return parsePayload<NativeAuthResult>(
      await invoke('authPasswordReset', email),
      'The reset request could not be read.'
    );
  } catch (err) {
    return failure(err instanceof Error ? err.message : 'The reset request failed.');
  }
}

/** An authenticated `GET /api/client…` through the stored session. */
export async function nativeApiGet(path: string): Promise<NativeApiResponse> {
  const payload = await invoke('apiGet', path);
  return parsePayload<NativeApiResponse>(payload, 'The panel response could not be read.');
}

/**
 * An authenticated `POST /api/client…` — power actions and console commands.
 * The path is re-checked natively against the client-API allowlist, and the body
 * is size-limited, so a page cannot use this as a general-purpose proxy.
 */
export async function nativeApiPost(
  path: string,
  body: string
): Promise<NativeApiResponse> {
  const payload = await invoke('apiPost', path, body);
  return parsePayload<NativeApiResponse>(payload, 'The panel response could not be read.');
}

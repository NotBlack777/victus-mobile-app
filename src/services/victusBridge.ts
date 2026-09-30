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

/* ==========================================================================
 * Shell half of the bridge
 *
 * Since 4.5.0 the Android shell draws no chrome of its own: there is exactly
 * one menu, and it is this app's header + channel chips. These helpers are how
 * that single menu drives the native layer (back/refresh, channel navigation,
 * the glass Appearance sheet, clear-session, update checks, admin areas).
 *
 * Every method here is synchronous in the native layer and simply absent in a
 * plain browser, so each one is a no-op outside the APK.
 * ========================================================================== */

/** Snapshot the shell exposes to the single menu. */
export interface ShellUiState {
  /** A newer signed build is published and not yet installed. */
  updateAvailable: boolean;
  /** The available version's name, or '' when there is none. */
  updateVersion: string;
  /** The URL currently loaded in the shell's WebView. */
  currentUrl: string;
  /** The WebView has history to go back to. */
  canGoBack: boolean;
  /** The user asked for reduced motion natively (Appearance → Reduce animations). */
  reduceMotion: boolean;
  /** Admin-area base URLs that apply to {@link currentUrl}; `[]` for normal accounts. */
  adminAreas: string[];
}

const EMPTY_SHELL_STATE: ShellUiState = {
  updateAvailable: false,
  updateVersion: '',
  currentUrl: '',
  canGoBack: false,
  reduceMotion: false,
  adminAreas: [],
};

/**
 * True when running inside the 4.5.0+ shell, i.e. when the single menu can drive
 * navigation, refresh and the native Appearance sheets.
 */
export function hasShellBridge(): boolean {
  return typeof window.VictusNative?.shellUiState === 'function';
}

/** Reads the shell snapshot; safe (and cheap) to call on every render. */
export function shellUiState(): ShellUiState {
  const read = window.VictusNative?.shellUiState;
  if (typeof read !== 'function') return EMPTY_SHELL_STATE;
  try {
    const parsed = JSON.parse(read.call(window.VictusNative)) as Partial<ShellUiState>;
    return {
      updateAvailable: Boolean(parsed.updateAvailable),
      updateVersion: typeof parsed.updateVersion === 'string' ? parsed.updateVersion : '',
      currentUrl: typeof parsed.currentUrl === 'string' ? parsed.currentUrl : '',
      canGoBack: Boolean(parsed.canGoBack),
      reduceMotion: Boolean(parsed.reduceMotion),
      adminAreas: Array.isArray(parsed.adminAreas)
        ? parsed.adminAreas.filter((area): area is string => typeof area === 'string')
        : [],
    };
  } catch {
    // A malformed snapshot must never take the menu down with it.
    return EMPTY_SHELL_STATE;
  }
}

/** System-back behaviour: WebView history first, then Home, then leave the app. */
export function shellBack(): void {
  window.VictusNative?.shellBack?.();
}

/** Reloads the page in the shell (the header's refresh button). */
export function shellRefresh(): void {
  window.VictusNative?.shellRefresh?.();
}

/** Loads an allowlisted Victus https page in the shell — the channel chips. */
export function shellNavigate(url: string): void {
  window.VictusNative?.shellNavigate?.(url);
}

/** Opens the glass native sheet: `settings` (Appearance), `device` or `updates`. */
export function shellOpenNativeMenu(which: 'settings' | 'device' | 'updates'): void {
  window.VictusNative?.shellOpenNativeMenu?.(which);
}

/** Wipes WebView cookies/storage/cache; call only after a user confirmation. */
export function shellClearSession(): void {
  window.VictusNative?.shellClearSession?.();
}

/** Hands the page currently on screen to the device browser. */
export function shellOpenExternal(): void {
  window.VictusNative?.shellOpenExternal?.();
}

/**
 * Which admin areas the signed-in account may use. Empty outside the APK, for a
 * demo account, and for any account without an admin role — so a normal user
 * never sees an admin toggle, a hint, or a preview of one.
 *
 * This decides *visibility* only. Every admin request is still authorised by the
 * panel itself; nothing here grants or caches a permission.
 */
export function shellAdminAreas(): string[] {
  const read = window.VictusNative?.shellAdminAreas;
  if (typeof read !== 'function') return [];
  try {
    const parsed = JSON.parse(read.call(window.VictusNative)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((area): area is string => typeof area === 'string' && area.length > 0);
  } catch {
    return [];
  }
}

/**
 * The authenticator's 30-second window, measured on the panel's clock.
 *
 * An authenticator code is derived from a 30-second step of the *server's* clock,
 * so a phone whose clock is off — or a code read off the screen one second before
 * it rotated — produces a perfectly correct code the panel rejects. This is the
 * shell's view of that window; the sign-in screen uses it to show when the next
 * code starts. No code, secret or account data is involved.
 */
export interface TotpWindowState {
  /** Whole seconds (1–30) left in the current code, on the server's clock. */
  secondsRemaining: number;
  /** Milliseconds until the next code begins, on the server's clock. */
  millisUntilNext: number;
  /** The step length; always 30. */
  periodSeconds: number;
  /** True once a real `Date` sample from the panel has been taken. */
  synced: boolean;
  /** Panel time minus device time, in millis. */
  offsetMillis: number;
}

const FALLBACK_TOTP_WINDOW: TotpWindowState = {
  secondsRemaining: 30,
  millisUntilNext: 30_000,
  periodSeconds: 30,
  synced: false,
  offsetMillis: 0,
};

/**
 * Reads the shell's authenticator window. In a browser there is no shell, so this
 * falls back to the device clock with the standard period — which is exactly what
 * the browser build can honestly offer.
 */
export function totpWindowState(): TotpWindowState {
  const read = window.VictusNative?.authTotpState;
  if (typeof read !== 'function') {
    return { ...FALLBACK_TOTP_WINDOW, millisUntilNext: msToNextWindow(Date.now()) };
  }
  try {
    const parsed = JSON.parse(read.call(window.VictusNative)) as Partial<TotpWindowState>;
    const secondsRemaining = Number(parsed.secondsRemaining);
    return {
      secondsRemaining:
        Number.isFinite(secondsRemaining) && secondsRemaining > 0
          ? Math.min(30, Math.round(secondsRemaining))
          : 30,
      millisUntilNext: Number(parsed.millisUntilNext) || 0,
      periodSeconds: Number(parsed.periodSeconds) || 30,
      synced: Boolean(parsed.synced),
      offsetMillis: Number(parsed.offsetMillis) || 0,
    };
  } catch {
    return FALLBACK_TOTP_WINDOW;
  }
}

/** Milliseconds until the next 30-second boundary on a raw (device) timeline. */
function msToNextWindow(epochMillis: number): number {
  const period = 30_000;
  return period - (((epochMillis % period) + period) % period);
}

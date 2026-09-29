/// <reference types="vite/client" />

/**
 * The Android shell's native bridge, injected by MainActivity.WebAppBridge as
 * `window.VictusNative`.
 *
 * It carries two capabilities. Navigation (`openWebView`/`openBrowser`) exists
 * because the live Victus Cloud portals cannot be framed (x-frame-options /
 * frame-ancestors), so "Web View" has to be a real WebView surface rather than an
 * iframe. Authentication (`auth*`, `apiGet`) exists because sign-in must talk to
 * `control.victuscloud.com` from the native layer: the bundle's own origin is
 * `appassets.androidplatform.net`, so a request from here would be cross-origin,
 * and the resulting API key would sit inside the WebView. It is held by Java
 * instead and never crosses this bridge.
 *
 * Every method is optional: in a plain browser (dev server, hosted build) there
 * is no native side, callers check `isNativeAuthAvailable()` and fall back
 * (navigation uses `window.open`, sign-in offers the labelled demo data).
 *
 * The async methods take a callback id as their final argument; the native side
 * answers by calling `window.__victusBridge.resolve(id, jsonPayload)`.
 */
interface VictusNativeBridge {
  /** Opens a https *.victuscloud.com page in the app's in-app browser surface. */
  openWebView?: (url: string, title?: string) => void;
  /** Opens any https page in the device browser. */
  openBrowser?: (url: string) => void;
  /** Email (or username) plus password against the Victus Cloud panel. */
  authSignIn?: (user: string, password: string, callbackId: string) => void;
  /** Second factor: a 6-digit authenticator code, or a recovery code. */
  authSubmitTwoFactor?: (confirmationToken: string, code: string, callbackId: string) => void;
  /** Panel API key from Account → API Credentials. */
  authSignInWithApiKey?: (apiKey: string, callbackId: string) => void;
  /** Re-validates the stored session against the panel. */
  authRestore?: (callbackId: string) => void;
  /** `revokeKey` also deletes the API key this app created. */
  authSignOut?: (revokeKey: boolean, callbackId: string) => void;
  /** Asks the panel to email a password-reset link. */
  authPasswordReset?: (email: string, callbackId: string) => void;
  /** Authenticated GET for a path inside `/api/client`. */
  apiGet?: (path: string, callbackId: string) => void;
  /** Authenticated POST for a path inside `/api/client` (power actions, console). */
  apiPost?: (path: string, body: string, callbackId: string) => void;
}

interface Window {
  VictusNative?: VictusNativeBridge;
  /** Installed by the JS bridge; the native side resolves pending calls here. */
  __victusBridge?: { resolve: (id: number, payload: string) => void };
}

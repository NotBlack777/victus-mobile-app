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

  /* ---------------------------------------------------------------- shell
   * The shell draws no chrome of its own since 4.5.0: the single web menu is
   * the only menu, so these are how it drives the native layer. They are all
   * synchronous pure reads / UI-thread commands — no callback id, no promise. */

  /** JSON snapshot: update availability, current URL, back/refresh state, admin areas. */
  shellUiState?: () => string;
  /** The installed binary's versionName, so the UI can name the running build. */
  appVersion?: () => string;
  /** Re-runs the admin-role probe immediately, ignoring its interval floor. */
  shellRefreshAdminAccess?: () => void;
  /**
   * Where the draggable chat bubble is, in device pixels, so the shell can
   * protect a touch landing on it before any parent layout can intercept.
   * Null clears the region. See shellSetDragRegion for why this must be known
   * in advance rather than reported once a drag has started.
   */
  shellSetDragRegion?: (encoded: string) => void;
  /**
   * The page's inner scroller moved off the top, so pull-to-refresh must stand
   * down. The WebView cannot derive this itself: the document never scrolls.
   */
  shellSetPageScrolledAwayFromTop?: (away: boolean) => void;
  /** The system back button's behaviour: WebView history, then Home, then exit. */
  shellBack?: () => void;
  /** Reloads the page currently in the WebView (the web header's refresh). */
  shellRefresh?: () => void;
  /** Loads an allowlisted Victus https URL in the shell (the channel chips). */
  shellNavigate?: (url: string) => void;
  /** Opens the glass native sheet: "settings" | "device" | "updates". */
  shellOpenNativeMenu?: (which: string) => void;
  /** Clears cookies/storage/cache after the web menu's own confirmation. */
  shellClearSession?: () => void;
  /**
   * Tells the shell a custom drag (the chat bubble) is in progress, so the
   * pull-to-refresh wrapper stands down instead of claiming the gesture.
   */
  shellSetDragging?: (dragging: boolean) => void;
  /**
   * Applies a colour-mode change made in the web app to the native layer, so
   * the system bars, native sheets and the engine's own widgets follow it.
   */
  shellSetColorMode?: (mode: 'dark' | 'light' | 'system') => void;
  /** Hands the page currently on screen to the device browser. */
  shellOpenExternal?: () => void;
  /** JSON array of admin-area base URLs this account may use; `[]` for everyone else. */
  shellAdminAreas?: () => string;
  /**
   * JSON authenticator window on the panel's clock: seconds remaining until the
   * next code, whether a real server sample was taken, and the clock offset.
   * Carries no code, secret or account data.
   */
  authTotpState?: () => string;
}

interface Window {
  VictusNative?: VictusNativeBridge;
  /** Installed by the JS bridge; the native side resolves pending calls here. */
  __victusBridge?: { resolve: (id: number, payload: string) => void };
}

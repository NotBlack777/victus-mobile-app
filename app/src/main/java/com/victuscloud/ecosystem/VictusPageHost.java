package com.victuscloud.ecosystem;

import android.content.Context;
import android.webkit.SslErrorHandler;

/**
 * The surface-level callbacks a Victus WebView needs from whatever hosts it.
 *
 * <p>There are two such surfaces: the shell's own WebView
 * ({@link MainActivity}) and the in-app browser overlay ({@link InAppBrowser}).
 * Both must share exactly one routing and TLS policy, so
 * {@link VictusWebViewClient} talks to this interface instead of to a concrete
 * Activity — the alternative (a second client that re-implements the SSL
 * decision matrix) would put two copies of the security-critical branch in the
 * tree and let them drift.</p>
 */
interface VictusPageHost {

    /** Context for strings, intents and theme look-ups. */
    Context context();

    void onPageLoadStarted(String url);

    void onPageLoadFinished(String url);

    /** Non-TLS load failure (DNS, refused connection, HTTP layer). */
    void showError(String message, String failingUrl);

    /**
     * A certificate failure that the shared policy refused to auto-accept.
     * Implementations must keep {@code handler} and either proceed, cancel or
     * cancel-then-reload; they must never leave it pending, because a pending
     * {@link SslErrorHandler} holds the WebView's next navigation open.
     */
    void showSslError(SslErrorHandler handler, String message, String failingUrl,
                      boolean offerWebViewUpdate, boolean isInternalHost);

    /**
     * True when Victus links tapped inside a loaded page belong in the OS browser
     * (the "Open links externally" appearance setting). The in-app browser always
     * answers false: it is itself the Victus surface, so it keeps its own links.
     */
    boolean shouldOpenInternalExternally();
}

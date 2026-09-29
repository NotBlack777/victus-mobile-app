package com.victuscloud.ecosystem;

import android.content.Intent;
import android.net.Uri;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.net.http.SslError;

import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;

import java.util.Locale;

/**
 * Modern replacement for the original VictusWebViewClient.
 *
 * <p>Only the current (API 23+) callback signatures are implemented — the old
 * {@code shouldOverrideUrlLoading(WebView, String)} and
 * {@code onReceivedError(WebView, int, String, String)} overloads are deprecated
 * and intentionally absent.</p>
 *
 * <p>Routing policy:</p>
 * <ul>
 *   <li>victuscloud.com (any subdomain) and the bundled-asset origin → stay in the WebView</li>
 *   <li>everything else (mailto:, tel:, intent://, market:, foreign https links) →
 *       handed to the system via an Intent so external apps/browsers handle it</li>
 * </ul>
 */
final class VictusWebViewClient extends WebViewClient {

    private static final String ROOT_DOMAIN = "victuscloud.com";
    private static final String ASSETS_HOST = "appassets.androidplatform.net";
    private static final String ASSETS_HOST_URL = "https://" + ASSETS_HOST;

    private final MainActivity activity;
    private final WebViewAssetLoader assetLoader;

    VictusWebViewClient(MainActivity activity, WebViewAssetLoader assetLoader) {
        this.activity = activity;
        this.assetLoader = assetLoader;
    }

    /** Serves the bundled React app (assets/index.html + its /assets/* bundles,
     *  icons and manifest) over https — no file:// URLs. */
    @Nullable
    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        WebResourceResponse intercepted = assetLoader.shouldInterceptRequest(request.getUrl());
        return intercepted != null ? intercepted : super.shouldInterceptRequest(view, request);
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (isInternalHost(uri)) {
            // Reference-app setting: when "Open links externally" is on, Victus
            // Cloud links tapped inside a loaded page go to the device browser.
            // The bundled home screen and the top-bar dock always stay in-app.
            String from = view.getUrl();
            boolean fromBundledHome = from != null && from.startsWith(ASSETS_HOST_URL);
            if (!fromBundledHome && ThemeManager.isOpenLinksExternally(activity)) {
                return openExternally(uri);
            }
            return false; // stay inside the app
        }
        return openExternally(uri);
    }

    private boolean isInternalHost(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) {
            return false;
        }
        String host = uri.getHost();
        if (host == null) return false;
        host = host.toLowerCase(Locale.US);
        return ASSETS_HOST.equals(host)
                || ROOT_DOMAIN.equals(host)
                || host.endsWith("." + ROOT_DOMAIN);
    }

    /**
     * True when the failing certificate belongs to the page currently loaded —
     * i.e. this is (very likely) the main frame or a same-host subresource, and
     * the user should see the error screen. A different host means an embedded
     * third-party resource, which is refused without blanking the page.
     */
    private static boolean isSameHostAsPage(WebView view, String failingUrl) {
        String current = view.getUrl();
        if (current == null) return true; // can't tell → show the error screen (fail closed)
        String failingHost = Uri.parse(failingUrl).getHost();
        String currentHost = Uri.parse(current).getHost();
        if (failingHost == null || currentHost == null) return true;
        return failingHost.equalsIgnoreCase(currentHost);
    }

    /**
     * Hands a non-internal link to the system. Handles the {@code intent://}
     * scheme properly (including Play-Store and browser-fallback fallbacks).
     */
    private boolean openExternally(Uri uri) {
        try {
            Intent intent;
            if ("intent".equalsIgnoreCase(uri.getScheme())) {
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                if (intent.getPackage() != null) {
                    try {
                        activity.startActivity(new Intent(Intent.ACTION_VIEW,
                                Uri.parse("market://details?id=" + intent.getPackage())));
                        return true;
                    } catch (Exception ignored) { /* Play Store absent */ }
                }
                String fallback = intent.getStringExtra("browser_fallback_url");
                if (fallback != null) {
                    activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fallback)));
                    return true;
                }
            } else {
                intent = new Intent(Intent.ACTION_VIEW, uri);
            }
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            activity.startActivity(intent);
        } catch (Exception e) {
            // No handler installed for this scheme — stay put, inform the user.
            android.widget.Toast.makeText(activity,
                    activity.getString(R.string.no_app_to_handle),
                    android.widget.Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    @Override
    public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
        activity.onPageLoadStarted(url);
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        activity.onPageLoadFinished(url);
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (!request.isForMainFrame()) return; // subresource failures don't justify an overlay
        CharSequence description = error.getDescription();
        activity.showError(
                (description == null ? "" : description)
                        + " (code " + error.getErrorCode() + ")",
                request.getUrl().toString());
    }

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request,
                                    WebResourceResponse errorResponse) {
        if (!request.isForMainFrame()) return;
        int status = errorResponse.getStatusCode();
        if (status >= 400) {
            activity.showError("HTTP " + status + " — " + errorResponse.getReasonPhrase(),
                    request.getUrl().toString());
        }
    }

    /**
     * Secure-by-default TLS policy. Three rules, in order:
     *
     * <ol>
     *   <li><b>Third-party subresources (CDNs, fonts, analytics) are refused
     *       silently.</b> A single embedded resource on a foreign host with a bad
     *       certificate must not blank the entire page with a scary error screen —
     *       the resource is cancelled, the page renders without it. (The page's
     *       own host failing still gets the full-screen treatment.)</li>
     *   <li><b>The "Trust Victus Cloud certificates" setting (default on) only
     *       covers {@code SSL_UNTRUSTED} and {@code SSL_NOTYETVALID} on real
     *       *.victuscloud.com hosts</b> — the two codes actually caused by an
     *       outdated device root store or a wrong clock. It never blesses an
     *       expired or hostname-mismatched certificate: those are blocked even
     *       for trusted domains, because proceeding there would be genuinely
     *       unsafe.</li>
     *   <li><b>Everything else is cancelled.</b> Silently calling
     *       {@code handler.proceed()} for any other case would turn off
     *       certificate validation — a real security hole and a Play Store
     *       policy violation.</li>
     * </ol>
     *
     * <p>Blocked main-frame errors still get the error screen, whose message
     * already points at the two realistic benign causes (stale Android System
     * WebView, wrong device date &amp; time).</p>
     */
    @Override
    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
        String url = error.getUrl() != null ? error.getUrl() : view.getUrl();
        boolean isInternal = false;
        if (url != null) {
            try {
                isInternal = isInternalHost(Uri.parse(url));
            } catch (Exception ignored) {
            }
        }

        // Embedded third-party content on a foreign host: refuse the resource,
        // keep the page. (If we can't tell whose request it was, fall through
        // and show the full error screen — fail closed, not open.)
        if (url != null && !isSameHostAsPage(view, url)) {
            handler.cancel();
            return;
        }

        int code = error.getPrimaryError();
        boolean deviceTrustIssue = code == SslError.SSL_UNTRUSTED || code == SslError.SSL_NOTYETVALID;

        // Settings → Security → "Trust Victus Cloud certificates": accept a
        // Victus certificate the device's root store doesn't know yet. Scoped
        // to *.victuscloud.com AND to the two device-side error codes — an
        // expired or mismatched certificate is never auto-accepted.
        if (isInternal && deviceTrustIssue && ThemeManager.isTrustVictusSsl(activity)) {
            handler.proceed();
            return;
        }

        String message;
        boolean offerWebViewUpdate;
        switch (code) {
            case SslError.SSL_UNTRUSTED:
                message = activity.getString(R.string.error_ssl_untrusted);
                offerWebViewUpdate = true;
                break;
            case SslError.SSL_NOTYETVALID:
                message = activity.getString(R.string.error_ssl_notyetvalid);
                offerWebViewUpdate = true;
                break;
            case SslError.SSL_EXPIRED:
                message = activity.getString(R.string.error_ssl_expired);
                offerWebViewUpdate = false;
                break;
            case SslError.SSL_IDMISMATCH:
                message = activity.getString(R.string.error_ssl_mismatch);
                offerWebViewUpdate = false;
                break;
            default:
                message = activity.getString(R.string.error_ssl_generic, code);
                offerWebViewUpdate = false;
                break;
        }
        activity.showSslError(handler, message, url, offerWebViewUpdate, isInternal);
    }
}

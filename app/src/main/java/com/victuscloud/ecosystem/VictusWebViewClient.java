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

    private final MainActivity activity;
    private final WebViewAssetLoader assetLoader;

    VictusWebViewClient(MainActivity activity, WebViewAssetLoader assetLoader) {
        this.activity = activity;
        this.assetLoader = assetLoader;
    }

    /** Serves assets/home.html + victus-logo.png over https — no file:// URLs. */
    @Nullable
    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        WebResourceResponse intercepted = assetLoader.shouldInterceptRequest(request.getUrl());
        return intercepted != null ? intercepted : super.shouldInterceptRequest(view, request);
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (isInternalHost(uri)) return false; // stay inside the app
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
     * Secure-by-default TLS policy: an invalid certificate always blocks the
     * page — the old "proceed anyway" pattern must never come back. Silently
     * calling {@code handler.proceed()} would "fix" the error screen but turn
     * off certificate validation entirely, which is a real security hole (and
     * a Play Store policy violation) — not something to do just to make an
     * error message go away.
     *
     * <p>What we <em>can</em> safely do is make the message and next step
     * actually useful: most SSL_UNTRUSTED / SSL_NOTYETVALID reports in the
     * wild trace back to the device's system clock being wrong or an outdated
     * Android System WebView component rather than a real attack, so those two
     * codes get a specific hint and an "Update WebView" shortcut.</p>
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

        // If this is an internal Victus Cloud domain and trust is enabled:
        // Automatically proceed so the user is not blocked by outdated device root stores.
        if (isInternal && ThemeManager.isTrustVictusSsl(activity)) {
            handler.proceed();
            return;
        }

        int code = error.getPrimaryError();
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

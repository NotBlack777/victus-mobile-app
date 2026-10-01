package com.victuscloud.ecosystem;

import android.os.Build;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

/**
 * The shell's WebSettings, applied to <em>every</em> Victus WebView surface — the
 * main shell WebView and the {@link InAppBrowser} overlay — so both behave
 * identically instead of drifting apart:
 *
 * <ul>
 *   <li>scripts + DOM storage on (<code>victuscloud.com</code> is a
 *       client-rendered panel), database off the (removed) app cache;</li>
 *   <li>no file/content access and mixed content refused outright;</li>
 *   <li>the {@code "; wv"} user-agent token dropped so Cloudflare-fronted pages
 *       treat the embedded browser as a standard Chrome mobile browser;</li>
 *   <li>algorithmic darkening follows the system/theme setting rather than
 *       forcing one.</li>
 * </ul>
 */
final class WebViewSetup {

    /**
     * Origin the bundled React app is served from. Package-private rather than a
     * private constant on {@code MainActivity} so the security-relevant checks
     * that ask "is this the bundled app?" (currently the WebRTC origin check)
     * all read the same value instead of each keeping its own copy.
     */
    static final String ASSETS_HOST = "appassets.androidplatform.net";

    private WebViewSetup() {
    }

    static void apply(WebView webView) {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        // The engine's own colour scheme, for the parts CSS does not paint:
        // form controls, scrollbars, the caret and the soft keyboard. Applied
        // again on every theme change; this is the launch-time default.
        applyColorScheme(webView, ThemeManager.isDark(webView.getContext()));

        String defaultUa = s.getUserAgentString();
        if (defaultUa != null && defaultUa.contains("; wv")) {
            s.setUserAgentString(defaultUa.replace("; wv", ""));
        }

        // Algorithmic darkening is a cosmetic nicety, and it is the one call on
        // the launch path that can still throw on a real device: feature
        // detection reports support from the provider's feature list, and some
        // custom-ROM WebViews (and providers mid-update) advertise the feature
        // they cannot actually service, at which point the androidx compat shim
        // raises UnsupportedOperationException. Letting that escape would kill
        // the app on the first frame over a colour preference, so the branch is
        // tried and abandoned rather than trusted.
        try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                WebSettingsCompat.setAlgorithmicDarkeningAllowed(s, true);
            } else if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
                WebSettingsCompat.setForceDark(s, WebSettingsCompat.FORCE_DARK_AUTO);
            }
        } catch (Throwable unsupported) {
            // UnsupportedOperationException on older providers; nothing else
            // here is worth a crash either. The page simply renders un-darkened.
        }
    }

    /**
     * Tells the WebView engine which colour scheme the page is currently using.
     *
     * <p>This is the half of the theme switch that lives outside CSS. The web app
     * repaints itself from its own tokens, but the engine also decides the colour
     * of form controls, scrollbars, the caret and the soft keyboard — so without
     * it a light app could still raise a dark keyboard and vice versa.</p>
     *
     * <p>Algorithmic darkening / {@code FORCE_DARK} is deliberately <em>not</em>
     * used to achieve this. Force-dark inverts third-party pages behind the app's
     * back, which is not what the user's Appearance choice means; the engine is
     * asked to leave the page's own colours alone and simply report the right
     * scheme for its own widgets.</p>
     */
    static void applyColorScheme(WebView webView, boolean dark) {
        if (webView == null || Build.VERSION.SDK_INT < 26) return;
        try {
            // Never let the engine invert a page that already styles itself.
            webView.setForceDarkAllowed(false);
            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                // OFF, not ON: the app paints itself. We only want the scheme.
                WebSettingsCompat.setAlgorithmicDarkeningAllowed(
                        webView.getSettings(), false);
            }
        } catch (Throwable unsupported) {
            // A provider that cannot service the hint must not take the app down
            // over a colour; the CSS tokens still paint the page correctly.
        }
    }
}

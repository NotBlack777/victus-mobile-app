package com.victuscloud.ecosystem;

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
}

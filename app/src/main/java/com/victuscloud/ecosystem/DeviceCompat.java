package com.victuscloud.ecosystem;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.WebView;

import androidx.webkit.WebViewCompat;

import org.json.JSONObject;

/**
 * What this app needs from the device, checked at runtime rather than assumed.
 *
 * <p>Victus Cloud is installed on GrapheneOS, CalyxOS, LineageOS and other AOSP
 * builds, where three assumptions that hold on stock Android do not:</p>
 *
 * <ol>
 *   <li><b>There may be no WebView.</b> Some minimal builds ship none, and users
 *       disable it. Constructing a {@link WebView} then throws and takes the
 *       process down, so {@link #isWebViewAvailable(Context)} is checked before the
 *       shell is built at all.</li>
 *   <li><b>The WebView is probably not Google's.</b> Vanadium, LineageOS WebView,
 *       Chromium and Mulch all exist, so the provider is read from the platform
 *       (with {@link RomSupport} as a static fallback) instead of being
 *       hardcoded.</li>
 *   <li><b>There may be no Google Play Services.</b> Nothing in this app requires
 *       them — the whole point of keeping the dependency list tiny — but the
 *       diagnostics screen says so plainly rather than leaving the user to
 *       guess.</li>
 * </ol>
 */
final class DeviceCompat {

    static final String PACKAGE_GMS = "com.google.android.gms";
    static final String PACKAGE_PLAY_STORE = "com.android.vending";
    static final String PACKAGE_FDROID = "org.fdroid.fdroid";

    private DeviceCompat() {
    }

    /** This device's distribution, from the strings Android exposes. */
    static RomSupport.Rom rom() {
        return RomSupport.detect(Build.FINGERPRINT, Build.DISPLAY, Build.MANUFACTURER);
    }

    // --------------------------------------------------------------- webview

    /**
     * Whether a WebView is installed and enabled.
     *
     * <p>{@code WebViewCompat.getCurrentWebViewPackage} returns null exactly when
     * the platform has no usable provider, which is the condition that makes
     * {@code new WebView(context)} throw. It is safe to call on every API level we
     * support (androidx.webkit backports it).</p>
     */
    static boolean isWebViewAvailable(Context context) {
        try {
            return WebViewCompat.getCurrentWebViewPackage(context) != null;
        } catch (Exception unsupported) {
            // A provider that cannot even be queried is not one we can render in.
            return false;
        }
    }

    /** The WebView provider's package and version, or nulls when there is none. */
    static String[] webViewProvider(Context context) {
        try {
            PackageInfo info = WebViewCompat.getCurrentWebViewPackage(context);
            if (info != null) {
                return new String[]{info.packageName, info.versionName};
            }
        } catch (Exception ignored) {
            // Falls through to the ROM-based guess below.
        }
        String fallback = RomSupport.fallbackWebViewPackage(rom());
        return new String[]{fallback, null};
    }

    /** True when the device's WebView is not Google's, i.e. a custom-ROM provider. */
    static boolean usesNonGoogleWebView(Context context) {
        String[] provider = webViewProvider(context);
        String packageName = provider[0];
        return packageName != null && !packageName.equals("com.google.android.webview")
                && !packageName.equals("com.android.webview");
    }

    static int webViewMajorVersion(Context context) {
        String[] provider = webViewProvider(context);
        String version = provider[1];
        if (version == null) return 0;
        int dot = version.indexOf('.');
        try {
            return Integer.parseInt(dot > 0 ? version.substring(0, dot) : version);
        } catch (NumberFormatException notAVersion) {
            return 0;
        }
    }

    // ------------------------------------------------------------- packages

    /**
     * Whether a package is installed. Package visibility on Android 11+ means this
     * only answers for packages declared in {@code <queries>} — which is exactly
     * the set this app asks about (see AndroidManifest.xml).
     */
    static boolean isInstalled(Context context, String packageName) {
        try {
            context.getPackageManager().getPackageInfo(packageName, 0);
            return true;
        } catch (Exception notInstalled) {
            return false;
        }
    }

    static boolean hasPlayServices(Context context) {
        return isInstalled(context, PACKAGE_GMS);
    }

    static boolean hasPlayStore(Context context) {
        return isInstalled(context, PACKAGE_PLAY_STORE);
    }

    static boolean hasFDroid(Context context) {
        return isInstalled(context, PACKAGE_FDROID);
    }

    // -------------------------------------------------------------- keystore

    /**
     * Proves the Keystore can actually seal and open a value on this build.
     *
     * <p>Worth checking rather than assuming: a ROM update, a wiped Keystore or an
     * enforcing ROM policy can leave the provider unusable, in which case the app
     * must tell the user their session will not survive a restart instead of
     * failing silently at sign-in.</p>
     */
    static boolean keystoreRoundTrip(Context context) {
        SecureStore scratch = null;
        try {
            scratch = SecureStore.scratch(context);
            String probe = "victus-self-test-" + System.currentTimeMillis();
            if (!scratch.save(probe)) return false;
            boolean ok = probe.equals(scratch.load());
            return ok && scratch.isEncrypted();
        } catch (Exception failure) {
            return false;
        } finally {
            if (scratch != null) scratch.wipeEverything();
        }
    }

    // ----------------------------------------------------------- diagnostics

    /**
     * The report the Device &amp; compatibility screen renders, as JSON.
     *
     * @param signedInKind {@code "api_key"}, {@code "session"}, or null when signed out
     */
    static String report(Context context, String signedInKind) {
        String[] provider = webViewProvider(context);
        boolean playStore = hasPlayStore(context);
        boolean fDroid = hasFDroid(context);
        boolean gms = hasPlayServices(context);
        RomSupport.Rom rom = rom();
        boolean keystore = keystoreRoundTrip(context);

        JSONObject json = new JSONObject();
        try {
            json.put("rom", rom.displayName);
            json.put("romCustom", rom.custom);
            json.put("romLine", RomSupport.describe(rom, Build.VERSION.SDK_INT, gms));
            json.put("manufacturer", safe(Build.MANUFACTURER));
            json.put("model", safe(Build.MODEL));
            json.put("sdk", Build.VERSION.SDK_INT);
            json.put("release", safe(Build.VERSION.RELEASE));

            json.put("webViewAvailable", provider[0] != null && isWebViewAvailable(context));
            json.put("webViewPackage", safe(provider[0]));
            json.put("webViewVersion", provider[1] == null ? "" : provider[1]);
            json.put("webViewIsGoogle", !usesNonGoogleWebView(context));

            json.put("playServices", gms);
            json.put("playStore", playStore);
            json.put("fDroid", fDroid);
            json.put("webViewSource",
                    RomSupport.webViewSource(playStore, fDroid).name().toLowerCase(java.util.Locale.US));

            json.put("keystoreOk", keystore);
            json.put("sessionKind", signedInKind == null ? "" : signedInKind);
            json.put("signedIn", signedInKind != null);
            json.put("appVersion", appVersion(context));
        } catch (Exception impossible) {
            // JSONObject.put only rejects null keys.
        }
        return json.toString();
    }

    /**
     * A connection test against the panel. Blocking — call it from a background
     * thread. Returns {@code {ok, status, ms}} so the UI can show a real result
     * rather than a spinner that always succeeds.
     */
    static String testPanelConnection() {
        long startedAt = System.currentTimeMillis();
        VictusHttp.Response response = new VictusHttp().get(VictusApi.PATH_LOGIN);
        long elapsed = System.currentTimeMillis() - startedAt;

        JSONObject json = new JSONObject();
        try {
            boolean reachable = !response.isNetworkFailure();
            json.put("ok", reachable);
            json.put("status", response.status);
            json.put("ms", elapsed);
            json.put("detail", reachable
                    ? "Reached control.victuscloud.com (HTTP " + response.status + ")"
                    : "Could not reach control.victuscloud.com"
                            + (response.failure == null ? "" : " — " + response.failure));
            json.put("failure", response.failure == null ? "" : response.failure);
        } catch (Exception impossible) {
            // Same as above.
        }
        return json.toString();
    }

    static String appVersion(Context context) {
        try {
            return context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
        } catch (Exception unknown) {
            return "";
        }
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}

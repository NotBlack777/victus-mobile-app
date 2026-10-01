package com.victuscloud.ecosystem;

import java.util.Locale;

/**
 * Custom-ROM support policy: recognising the Android build an APK was installed
 * on, and deciding what that means for this app.
 *
 * <p>Victus Cloud ships to phones running LineageOS, GrapheneOS, CalyxOS,
 * DivestOS, /e/OS and the rest of the AOSP family, not just stock Android. Those
 * builds differ in ways that break apps which assume Google's stack:</p>
 *
 * <ul>
 *   <li><b>No Google Play Services.</b> The app has no GMS/Firebase dependency at
 *       all (deliberately), so nothing here silently degrades — but any UI that
 *       offers "install from the Play Store" is wrong on those devices and must
 *       offer the provider's own package instead.</li>
 *   <li><b>A different System WebView.</b> GrapheneOS ships Vanadium
 *       ({@code app.vanadium.webview}), LineageOS ships
 *       {@code org.lineageos.webview}, CalyxOS ships Chromium, and many users
 *       install Mulch or Bromite from F-Droid. Hardcoding
 *       {@code com.google.android.webview} sends those users to a listing they
 *       cannot install.</li>
 *   <li><b>No WebView at all</b> on some minimal builds, or a user-disabled one —
 *       constructing a {@code WebView} then crashes the process.</li>
 * </ul>
 *
 * <p>Everything here is pure Java (no Android imports) so the classification and
 * the policy around it are covered by JVM unit tests, in the same spirit as
 * {@link UpdateCommands} and {@link InAppLinks}.</p>
 */
final class RomSupport {

    /** Known AOSP-family distributions, most specific match first. */
    enum Rom {
        GRAPHENE_OS("GrapheneOS", true),
        CALYX_OS("CalyxOS", true),
        DIVEST_OS("DivestOS", true),
        LINEAGE_OS("LineageOS", true),
        E_OS("/e/OS", true),
        IODEA_OS("iodéOS", true),
        ARROW_OS("ArrowOS", true),
        CR_DROID("crDroid", true),
        PIXEL_EXPERIENCE("PixelExperience", true),
        EVOLUTION_X("Evolution X", true),
        OMNI_ROM("OmniROM", true),
        PARANOID_ANDROID("Paranoid Android", true),
        HAVOC_OS("Havoc-OS", true),
        AOSP("AOSP build", true),
        /** A stock OEM build (Pixel, Samsung, Xiaomi, …). */
        STOCK("Stock Android", false),
        /** Nothing conclusive: treated exactly like stock. */
        UNKNOWN("Android", false);

        final String displayName;
        /** True for community/AOSP-family builds, which is what changes the advice. */
        final boolean custom;

        Rom(String displayName, boolean custom) {
            this.displayName = displayName;
            this.custom = custom;
        }
    }

    /** Where a WebView replacement can actually be obtained on this device. */
    enum WebViewSource {
        /** The device has a Play Store client, so a Play listing is usable. */
        PLAY_STORE,
        /** No Play Store, but F-Droid is installed. */
        F_DROID,
        /** The provider's own web page is the only route. */
        WEB_PAGE
    }

    private RomSupport() {
    }

    /**
     * Classifies a build from the strings Android exposes.
     *
     * <p>{@code fingerprint} is {@code Build.FINGERPRINT}, {@code display} is
     * {@code Build.DISPLAY}, {@code manufacturer} is {@code Build.MANUFACTURER}.
     * All three are used because ROMs mark themselves in different places: /e/OS
     * brands the display string, LineageOS stamps the fingerprint and often the
     * display, GrapheneOS marks the fingerprint.</p>
     */
    static Rom detect(String fingerprint, String display, String manufacturer) {
        String haystack = join(fingerprint, display, manufacturer);

        // GrapheneOS and CalyxOS both derive from AOSP; GrapheneOS fingerprints
        // contain "graphene", CalyxOS uses "calyx".
        if (contains(haystack, "graphene")) return Rom.GRAPHENE_OS;
        if (contains(haystack, "calyx")) return Rom.CALYX_OS;
        if (contains(haystack, "divest")) return Rom.DIVEST_OS;
        if (contains(haystack, "lineage")) return Rom.LINEAGE_OS;
        // /e/OS brands itself as "e_os_<device>-user" in the display string, and its
        // fingerprint uses the "e/os/..." form.
        if (contains(haystack, "e_os") || contains(haystack, "/e/os")
                || contains(haystack, "e os") || contains(haystack, "eelo")) {
            return Rom.E_OS;
        }
        if (contains(haystack, "iode")) return Rom.IODEA_OS;
        if (contains(haystack, "arrow")) return Rom.ARROW_OS;
        if (contains(haystack, "crdroid")) return Rom.CR_DROID;
        if (contains(haystack, "pixelexperience")) return Rom.PIXEL_EXPERIENCE;
        if (contains(haystack, "evolution")) return Rom.EVOLUTION_X;
        if (contains(haystack, "omni")) return Rom.OMNI_ROM;
        if (contains(haystack, "aospa") || contains(haystack, "paranoid")) return Rom.PARANOID_ANDROID;
        if (contains(haystack, "havoc")) return Rom.HAVOC_OS;

        // "aosp" appears in stock Pixel fingerprints too, so it only counts when
        // the fingerprint is otherwise a generic AOSP one.
        if (contains(haystack, "aosp") && contains(haystack, "generic")) return Rom.AOSP;

        boolean knownOem = contains(haystack, "google") || contains(haystack, "samsung")
                || contains(haystack, "xiaomi") || contains(haystack, "redmi")
                || contains(haystack, "oneplus") || contains(haystack, "oppo")
                || contains(haystack, "vivo") || contains(haystack, "motorola")
                || contains(haystack, "nothing") || contains(haystack, "sony")
                || contains(haystack, "fairphone") || contains(haystack, "asus")
                || contains(haystack, "realme") || contains(haystack, "honor")
                || contains(haystack, "huawei");
        return knownOem ? Rom.STOCK : Rom.UNKNOWN;
    }

    /**
     * The package this device's WebView is most likely to come from, used only as a
     * fallback when the live provider cannot be queried. Values match what the
     * ROMs actually ship; {@code null} means "ask the platform instead".
     */
    static String fallbackWebViewPackage(Rom rom) {
        switch (rom) {
            case GRAPHENE_OS:
                return "app.vanadium.webview";
            case LINEAGE_OS:
            case E_OS:
            case IODEA_OS:
            case ARROW_OS:
            case CR_DROID:
            case PIXEL_EXPERIENCE:
            case EVOLUTION_X:
            case OMNI_ROM:
            case PARANOID_ANDROID:
            case HAVOC_OS:
            case DIVEST_OS:
                return "org.lineageos.webview";
            case CALYX_OS:
                return "org.chromium.chrome";
            default:
                return "com.google.android.webview";
        }
    }

    /**
     * Every package that may legitimately be this device's WebView, so a
     * {@code <queries>} declaration and the "install a WebView" advice can name
     * them all rather than just Google's.
     */
    static String[] knownWebViewPackages() {
        return new String[]{
                "com.google.android.webview",
                "com.android.webview",
                "com.android.chrome",
                "org.chromium.chrome",
                "app.vanadium.webview",
                "org.lineageos.webview",
                "us.spotco.mulch_wv",
                "com.system.webview",
        };
    }

    /**
     * Which install route to offer. A Play listing is useless without a Play Store
     * client — which is the normal case on GrapheneOS, CalyxOS and GMS-free
     * LineageOS — so the presence of the store (not the ROM) decides it.
     *
     * @param playStoreInstalled whether the Play Store client is present
     * @param fDroidInstalled    whether F-Droid is present
     */
    static WebViewSource webViewSource(boolean playStoreInstalled, boolean fDroidInstalled) {
        if (playStoreInstalled) return WebViewSource.PLAY_STORE;
        if (fDroidInstalled) return WebViewSource.F_DROID;
        return WebViewSource.WEB_PAGE;
    }

    /** The F-Droid listing for Mulch WebView, the WebView F-Droid actually ships. */
    static String fDroidWebViewUrl() {
        return "https://f-droid.org/packages/us.spotco.mulch_wv/";
    }

    /**
     * A one-line description of the build, for the diagnostics screen. Never says
     * "supported" or "unsupported": every one of these builds runs the app, and
     * claiming otherwise would be wrong.
     */
    static String describe(Rom rom, int sdkInt, boolean gmsPresent) {
        StringBuilder text = new StringBuilder(rom.displayName);
        text.append(" · Android ").append(sdkInt);
        text.append(gmsPresent ? " · Google Play Services present" : " · No Google Play Services");
        return text.toString();
    }

    /**
     * Whether the app should offer anything that requires Google Play Services.
     * Nothing in the app does today; this exists so that stays true by construction
     * rather than by memory, and so a future feature has one place to ask.
     */
    static boolean playServicesFeaturesAllowed(boolean gmsPresent) {
        return gmsPresent;
    }

    // ------------------------------------------------------------- helpers

    private static String join(String... parts) {
        StringBuilder joined = new StringBuilder();
        for (String part : parts) {
            if (part == null) continue;
            if (joined.length() > 0) joined.append(' ');
            joined.append(part);
        }
        return joined.toString().toLowerCase(Locale.US);
    }

    private static boolean contains(String haystack, String needle) {
        return haystack.contains(needle);
    }
}

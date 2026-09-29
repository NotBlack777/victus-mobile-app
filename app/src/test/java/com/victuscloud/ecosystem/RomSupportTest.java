package com.victuscloud.ecosystem;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Covers custom-ROM recognition and the support decisions that follow from it.
 *
 * <p>The build strings are the real shapes those ROMs stamp: GrapheneOS marks the
 * fingerprint and display, LineageOS marks both, /e/OS brands the display, and
 * CalyxOS uses its own vendor string.</p>
 */
public class RomSupportTest {

    @Test
    public void recognisesGrapheneOsFromFingerprintOrDisplay() {
        assertEquals(RomSupport.Rom.GRAPHENE_OS, RomSupport.detect(
                "grapheneos/panther/panther:14/AP1A.240505.004/2024.05.12:user/release-keys",
                "AP1A.240505.004", "Google"));
        // Display-only branding (as set by some builds) is caught too.
        assertEquals(RomSupport.Rom.GRAPHENE_OS, RomSupport.detect(
                "google/panther/panther:14/x/y", "GrapheneOS", "Google"));
    }

    @Test
    public void recognisesCalyxOsLineageOsAndTheRestOfTheFamily() {
        assertEquals(RomSupport.Rom.CALYX_OS, RomSupport.detect(
                "calyx/fp4/fp4:14/x/y", "CalyxOS 5.6.0", "Fairphone"));
        assertEquals(RomSupport.Rom.LINEAGE_OS, RomSupport.detect(
                "lineage/bacon/bacon:14/x/y", "lineage-21.0-20240512", "OnePlus"));
        assertEquals(RomSupport.Rom.E_OS, RomSupport.detect(
                "google/panther/panther:13/x/y", "e_os_panther-user 13", "Google"));
        assertEquals(RomSupport.Rom.DIVEST_OS, RomSupport.detect(
                "divest/lmi/lmi:14/x/y", "divest-20", "Xiaomi"));
        assertEquals(RomSupport.Rom.CR_DROID, RomSupport.detect(
                "crdroid/mi845/mi845:14/x/y", "crDroid 10.4", "Xiaomi"));
        assertEquals(RomSupport.Rom.PIXEL_EXPERIENCE, RomSupport.detect(
                "pixelexperience/redfin/redfin:14/x/y", "PE 14", "Google"));
        assertEquals(RomSupport.Rom.ARROW_OS, RomSupport.detect(
                "arrow/beryllium/beryllium:13/x/y", "ArrowOS 13.1", "Xiaomi"));
        assertEquals(RomSupport.Rom.IODEA_OS, RomSupport.detect(
                "iode/FP4/FP4:14/x/y", "iode-4.9", "Fairphone"));
    }

    @Test
    public void doesNotMistakeAForeignPackageForTheRom() {
        // A stock Pixel's fingerprint/keyword soup must not match a custom ROM just
        // because an unrelated package name happens to contain its letters.
        assertEquals(RomSupport.Rom.STOCK, RomSupport.detect(
                "google/panther/panther:14/AP1A/2024:user/release-keys",
                "AP1A.240505.004", "Google"));
        assertEquals(RomSupport.Rom.STOCK, RomSupport.detect(
                "samsung/a54x/a54x:14/UP1A/x", "UP1A.231005.007", "samsung"));
        assertEquals(RomSupport.Rom.UNKNOWN, RomSupport.detect("unknown/unknown/unknown", "", null));
        assertEquals(RomSupport.Rom.UNKNOWN, RomSupport.detect(null, null, null));
    }

    @Test
    public void genericAospIsRecognisedWithoutSwallowingStockPixels() {
        assertEquals(RomSupport.Rom.AOSP, RomSupport.detect(
                "aosp/generic_x86_64/generic_x86_64:14/x/y", "aosp_x86_64-userdebug", "AOSP"));
        // Stock Pixel fingerprints also contain "aosp" but are not AOSP builds.
        assertEquals(RomSupport.Rom.STOCK, RomSupport.detect(
                "google/panther/panther:14/aosp/2024:user/release-keys", "", "Google"));
    }

    @Test
    public void everyCustomRomIsMarkedCustomAndStockIsNot() {
        assertTrue(RomSupport.Rom.GRAPHENE_OS.custom);
        assertTrue(RomSupport.Rom.CALYX_OS.custom);
        assertTrue(RomSupport.Rom.LINEAGE_OS.custom);
        assertTrue(RomSupport.Rom.E_OS.custom);
        assertFalse(RomSupport.Rom.STOCK.custom);
        assertFalse(RomSupport.Rom.UNKNOWN.custom);
    }

    @Test
    public void theWebViewFallbackMatchesWhatEachRomActuallyShips() {
        assertEquals("app.vanadium.webview",
                RomSupport.fallbackWebViewPackage(RomSupport.Rom.GRAPHENE_OS));
        assertEquals("org.lineageos.webview",
                RomSupport.fallbackWebViewPackage(RomSupport.Rom.LINEAGE_OS));
        assertEquals("org.lineageos.webview",
                RomSupport.fallbackWebViewPackage(RomSupport.Rom.E_OS));
        assertEquals("org.chromium.chrome",
                RomSupport.fallbackWebViewPackage(RomSupport.Rom.CALYX_OS));
        assertEquals("com.google.android.webview",
                RomSupport.fallbackWebViewPackage(RomSupport.Rom.STOCK));
    }

    @Test
    public void knownWebViewPackagesCoverTheWholeFamilyExactlyOnce() {
        String[] packages = RomSupport.knownWebViewPackages();
        assertEquals(8, packages.length);
        for (String expected : new String[]{
                "app.vanadium.webview", "org.lineageos.webview",
                "us.spotco.mulch_wv", "com.google.android.webview"}) {
            int seen = 0;
            for (String candidate : packages) {
                if (candidate.equals(expected)) seen++;
            }
            assertEquals("missing or duplicated: " + expected, 1, seen);
        }
    }

    @Test
    public void theInstallRouteFollowsWhatIsActuallyInstalledNotTheRom() {
        // A Play Store client means a Play listing works, even on GrapheneOS.
        assertEquals(RomSupport.WebViewSource.PLAY_STORE, RomSupport.webViewSource(true, false));
        assertEquals(RomSupport.WebViewSource.PLAY_STORE, RomSupport.webViewSource(true, true));
        // Without one, the Play listing is a dead end: F-Droid ships Mulch WebView.
        assertEquals(RomSupport.WebViewSource.F_DROID, RomSupport.webViewSource(false, true));
        assertEquals(RomSupport.WebViewSource.WEB_PAGE, RomSupport.webViewSource(false, false));
        assertTrue(RomSupport.fDroidWebViewUrl().startsWith("https://"));
    }

    @Test
    public void diagnosticsLineNamesTheBuildAndTheGoogleStackHonestly() {
        String withGms = RomSupport.describe(RomSupport.Rom.LINEAGE_OS, 34, true);
        assertTrue(withGms.contains("LineageOS"));
        assertTrue(withGms.contains("Android 34"));
        assertTrue(withGms.contains("Google Play Services present"));

        String withoutGms = RomSupport.describe(RomSupport.Rom.GRAPHENE_OS, 35, false);
        assertTrue(withoutGms.contains("GrapheneOS"));
        assertTrue(withoutGms.contains("No Google Play Services"));
    }

    @Test
    public void noFeatureMayRequirePlayServicesWhenNoneIsInstalled() {
        assertTrue(RomSupport.playServicesFeaturesAllowed(true));
        assertFalse(RomSupport.playServicesFeaturesAllowed(false));
        assertNotNull(RomSupport.Rom.STOCK.displayName);
    }
}

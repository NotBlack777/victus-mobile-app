package com.victuscloud.ecosystem;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.junit.Test;

/** Covers the updater's parsing + "is this actually newer?" decision logic. */
public class UpdateManifestTest {

    private static final String MANIFEST = "{"
            + "\"versionCode\": 23,"
            + "\"versionName\": \"2.1.2\","
            + "\"apkUrl\": \"https://example.com/victus-2.1.2.apk\","
            + "\"sha256\": \"b1331f3dbda0cc48b627aee4300c8ef1ae4eaaebf18b97073204f9d3afd5c1f8\","
            + "\"sizeBytes\": 3155187,"
            + "\"changelog\": \"Fixes and polish\""
            + "}";

    private static final String GITHUB_RELEASE = "{"
            + "\"tag_name\": \"v2.1.2\","
            + "\"name\": \"Victus Cloud 2.1.2\","
            + "\"body\": \"- Bundled React app\\n- Updater\","
            + "\"assets\": ["
            + "  {\"name\": \"notes.txt\", \"browser_download_url\": \"https://x/notes.txt\", \"size\": 10},"
            + "  {\"name\": \"victus-cloud-2.1.2.apk\","
            + "   \"browser_download_url\": \"https://github.com/o/r/releases/download/v2.1.2/victus.apk\","
            + "   \"digest\": \"sha256:b1331f3dbda0cc48b627aee4300c8ef1ae4eaaebf18b97073204f9d3afd5c1f8\","
            + "   \"size\": 3155187}"
            + "]"
            + "}";

    @Test
    public void parsesAPlainManifest() throws Exception {
        UpdateManifest manifest = UpdateManifest.parse(MANIFEST);

        assertEquals(23, manifest.versionCode);
        assertEquals("2.1.2", manifest.versionName);
        assertEquals("https://example.com/victus-2.1.2.apk", manifest.apkUrl);
        assertEquals("b1331f3dbda0cc48b627aee4300c8ef1ae4eaaebf18b97073204f9d3afd5c1f8", manifest.sha256);
        assertEquals(3155187L, manifest.sizeBytes);
        assertEquals("Fixes and polish", manifest.changelog);
    }

    @Test
    public void parsesAGitHubReleaseAndPicksTheApkAsset() throws Exception {
        UpdateManifest manifest = UpdateManifest.parse(GITHUB_RELEASE);

        assertEquals(0, manifest.versionCode); // GitHub publishes no versionCode
        assertEquals("2.1.2", manifest.versionName); // "v" prefix stripped
        assertEquals("https://github.com/o/r/releases/download/v2.1.2/victus.apk", manifest.apkUrl);
        assertEquals("b1331f3dbda0cc48b627aee4300c8ef1ae4eaaebf18b97073204f9d3afd5c1f8", manifest.sha256);
        assertEquals(3155187L, manifest.sizeBytes);
        assertTrue(manifest.changelog.startsWith("- Bundled React app"));
    }

    @Test
    public void ignoresAnUnusableDigest() throws Exception {
        String body = "{\"versionCode\": 2, \"apkUrl\": \"https://x/a.apk\", \"sha256\": \"not-a-hash\"}";
        assertNull(UpdateManifest.parse(body).sha256);
    }

    @Test
    public void rejectsPayloadsWithNothingToDownload() {
        assertThrows("{\"versionName\": \"2.1.2\"}");
        assertThrows("{\"tag_name\": \"v9\", \"assets\": []}");
    }

    private void assertThrows(String body) {
        try {
            UpdateManifest.parse(body);
            fail("Expected parsing to fail for: " + body);
        } catch (Exception expected) {
            assertNotNull(expected);
        }
    }

    @Test
    public void comparesVersionNamesNumerically() {
        assertTrue(UpdateManifest.compareVersions("2.1.2", "2.1.1") > 0);
        assertTrue(UpdateManifest.compareVersions("2.2", "2.1.9") > 0);
        assertTrue(UpdateManifest.compareVersions("10.0", "9.9.9") > 0);
        assertEquals(0, UpdateManifest.compareVersions("2.1", "2.1.0"));
        assertEquals(0, UpdateManifest.compareVersions("2.1.2-beta", "2.1.2"));
        assertTrue(UpdateManifest.compareVersions("2.1.1", "2.1.2") < 0);
    }

    @Test
    public void prefersVersionCodeWhenTheSourceProvidesOne() throws Exception {
        UpdateManifest manifest = UpdateManifest.parse(MANIFEST);
        assertTrue(manifest.isNewerThan(22, "2.1.1"));
        assertFalse(manifest.isNewerThan(23, "2.1.2"));
        assertFalse(manifest.isNewerThan(24, "2.2.0"));
    }

    @Test
    public void fallsBackToVersionNameWhenTheSourceHasNoVersionCode() throws Exception {
        UpdateManifest manifest = UpdateManifest.parse(GITHUB_RELEASE);
        assertTrue(manifest.isNewerThan(22, "2.1.1"));
        assertFalse(manifest.isNewerThan(22, "2.1.2"));
        assertFalse(manifest.isNewerThan(22, "2.2.0"));
    }

    @Test
    public void neverClaimsAnUpdateWithoutVersionInformation() throws Exception {
        UpdateManifest manifest = UpdateManifest.parse("{\"apkUrl\": \"https://x/a.apk\"}");
        assertFalse(manifest.isNewerThan(22, "2.1.1"));
    }

    @Test
    public void parsesTheRealDefaultSourceSlug() {
        // The default source the app ships with must be a valid https URL, and the
        // GitHub shape above is what that endpoint actually returns.
        assertTrue(UpdateCommands.isAcceptableUrl(
                "https://api.github.com/repos/NotBlack777/victus-mobile-app/releases/latest"));
    }
}

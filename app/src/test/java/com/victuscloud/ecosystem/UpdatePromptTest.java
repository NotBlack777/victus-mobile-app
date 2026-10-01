package com.victuscloud.ecosystem;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

/**
 * The automatic update offer: shown when a release feed reports a newer build,
 * and shown once for that build.
 *
 * <p>The previous behaviour checked the release feed "quietly ... and never
 * prompts", so the only signal a phone ever got was a badge inside the tools
 * menu. A user who never opened that menu stayed on an old build for ever,
 * which is the opposite of what a release feed is for.</p>
 */
@RunWith(RobolectricTestRunner.class)
public class UpdatePromptTest {

    private Context context;

    private static UpdateManifest build(int versionCode, String versionName) throws Exception {
        return UpdateManifest.parse("{"
                + "\"versionCode\": " + versionCode + ","
                + "\"versionName\": \"" + versionName + "\","
                + "\"apkUrl\": \"https://example.com/victus.apk\","
                + "\"sha256\": \"b1331f3dbda0cc48b627aee4300c8ef1ae4eaaebf18b97073204f9d3afd5c1f8\","
                + "\"sizeBytes\": 3155187,"
                + "\"changelog\": \"Notes\""
                + "}");
    }

    @Before
    public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        // Each test starts from a device that has never been prompted.
        UpdateChecker.forgetPrompt(context);
        UpdateChecker.forgetAvailability(context);
    }

    @Test
    public void aNewerBuildIsOffered() throws Exception {
        assertTrue(UpdateChecker.shouldAutoPrompt(context, build(53, "4.6.5")));
    }

    @Test
    public void nothingToOfferWhenThereIsNoUpdate() {
        assertFalse(UpdateChecker.shouldAutoPrompt(context, null));
    }

    @Test
    public void aBuildWithoutAVersionCodeIsNotOffered() throws Exception {
        // An unknown code cannot be compared or recorded, so offering it would
        // either nag forever or crash on the comparison.
        assertFalse(UpdateChecker.shouldAutoPrompt(context, build(0, "")));
    }

    @Test
    public void theSameBuildIsOfferedOnlyOnce() throws Exception {
        UpdateManifest found = build(53, "4.6.5");
        assertTrue(UpdateChecker.shouldAutoPrompt(context, found));
        UpdateChecker.markPrompted(context, found);
        assertFalse("a build already offered must not nag on every launch",
                UpdateChecker.shouldAutoPrompt(context, found));
    }

    @Test
    public void aDifferentNewerBuildIsOfferedAgain() throws Exception {
        UpdateChecker.markPrompted(context, build(53, "4.6.5"));
        assertTrue("a genuinely newer release is a new decision, not a repeat",
                UpdateChecker.shouldAutoPrompt(context, build(54, "4.7.0")));
    }

    @Test
    public void markingNothingIsHarmless() throws Exception {
        UpdateChecker.markPrompted(context, null);
        assertTrue(UpdateChecker.shouldAutoPrompt(context, build(53, "4.6.5")));
    }

    @Test
    public void forgettingAvailabilityAlsoClearsThePromptRecord() throws Exception {
        // Installing an update clears availability; the prompt record must not
        // survive it, or a reinstall of the same build could never re-offer.
        UpdateChecker.markPrompted(context, build(53, "4.6.5"));
        UpdateChecker.forgetAvailability(context);
        assertTrue(UpdateChecker.shouldAutoPrompt(context, build(53, "4.6.5")));
    }
}

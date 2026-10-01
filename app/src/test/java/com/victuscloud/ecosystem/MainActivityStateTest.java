package com.victuscloud.ecosystem;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import android.widget.FrameLayout;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

import java.util.ArrayList;
import java.util.List;

/**
 * The launch/恢复 paths that {@link MainActivityLaunchTest} does not cover, plus
 * the state bugs found by the 4.6.2 sweep.
 *
 * <p>Each test here corresponds to a defect that was live in a shipped build.
 * They are grouped in this file rather than scattered because they all exercise
 * the same object — a real, running {@code MainActivity} — and because the
 * pattern is the one that let four crashing releases through in the first place:
 * a code path nobody ever executed.</p>
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class MainActivityStateTest {

    /**
     * Robolectric ships no WebView provider, so the shell's own guard would stop
     * at the "install a web engine" screen. Overriding the seam is the only way to
     * reach the code under test.
     */
    public static class ForcedWebViewActivity extends MainActivity {
        @Override
        protected boolean isWebViewUsable() {
            return true;
        }
    }

    private static ActivityController<ForcedWebViewActivity> launch() {
        return Robolectric.buildActivity(ForcedWebViewActivity.class);
    }

    // ------------------------------------------------- error overlay fade race

    /**
     * A second error arriving while the overlay is still fading out used to be
     * swallowed, leaving a blank page with no message and no buttons.
     *
     * <p>The overlay is only re-shown when it is not already VISIBLE, and a
     * fade-out keeps it VISIBLE for its whole 160ms while animating alpha to 0 —
     * then sets it GONE in its end action. So the race was: load fails → retry →
     * it fails again inside 160ms → the new message is written but the overlay
     * is not re-shown, and the in-flight fade-out then hides it permanently.</p>
     */
    @Test
    public void aSecondErrorDuringTheFadeOutStillShowsTheOverlay() {
        try (ActivityController<ForcedWebViewActivity> controller = launch()) {
            ForcedWebViewActivity activity = controller.setup().get();

            activity.showError("first failure", "https://victuscloud.com/");
            assertEquals("the first error should be visible",
                    View.VISIBLE, overlay(activity).getVisibility());

            // Start the fade-out, exactly as retrying does…
            activity.hideErrorOverlayForTest();
            // …and fail again before it finishes.
            activity.showError("second failure", "https://victuscloud.com/");

            FrameLayout overlay = overlay(activity);
            assertEquals("a new error must not be hidden by an in-flight fade-out",
                    View.VISIBLE, overlay.getVisibility());
        }
    }

    /**
     * The overlay must be left actually visible, not merely flagged VISIBLE.
     *
     * <p>{@code assertTrue(alpha >= 0f)} would be vacuous, so this drives the
     * animator to its end and checks the value the user would really see: the
     * second error's overlay has to end up opaque, not stuck at the alpha the
     * cancelled fade-out had reached.</p>
     */
    @Test
    public void theErrorOverlayIsNotLeftFadedOut() {
        try (ActivityController<ForcedWebViewActivity> controller = launch()) {
            ForcedWebViewActivity activity = controller.setup().get();
            activity.showError("first", "https://victuscloud.com/");
            activity.hideErrorOverlayForTest();
            activity.showError("second", "https://victuscloud.com/");

            FrameLayout overlay = overlay(activity);
            assertEquals(View.VISIBLE, overlay.getVisibility());

            org.robolectric.shadows.ShadowLooper.idleMainLooper();
            org.robolectric.shadows.ShadowLooper.runUiThreadTasksIncludingDelayedTasks();

            assertEquals("the second error's overlay must end up fully opaque",
                    1f, overlay.getAlpha(), 0.001f);
        }
    }

    /** Hiding the overlay twice, or after it is already gone, must not throw. */
    @Test
    public void hidingTheOverlayRepeatedlyIsHarmless() {
        try (ActivityController<ForcedWebViewActivity> controller = launch()) {
            ForcedWebViewActivity activity = controller.setup().get();
            activity.showError("boom", "https://victuscloud.com/");
            activity.hideErrorOverlayForTest();
            activity.hideErrorOverlayForTest();
            activity.showError("boom again", "https://victuscloud.com/");
            assertEquals(View.VISIBLE, overlay(activity).getVisibility());
        }
    }

    // ------------------------------------------------------------ saved tab

    /**
     * The saved tab was parsed and then thrown away, so after a rotation or a
     * low-memory restore {@code selectedDock} was always TAB_HOME. Back
     * navigation consults it to choose between "go Home" and "leave the app", so
     * pressing back from the Control tab closed the app instead.
     */
    @Test
    public void theSelectedTabSurvivesARecreate() {
        Bundle saved = new Bundle();
        saved.putInt(MainActivity.selectedTabKeyForTest(), MainActivity.TAB_CONTROL);

        try (ActivityController<ForcedWebViewActivity> controller = launch()) {
            ForcedWebViewActivity restored = Robolectric.buildActivity(ForcedWebViewActivity.class)
                    .create(saved).start().resume().get();
            assertNotNull(restored);
            // The tab must be back in the shell's own bookkeeping.
            assertEquals(MainActivity.TAB_CONTROL, restored.selectedDockForTest());
        }
    }

    /** An out-of-range saved tab must fall back to Home rather than crash later. */
    @Test
    public void aCorruptSavedTabFallsBackToHome() {
        Bundle saved = new Bundle();
        saved.putInt(MainActivity.selectedTabKeyForTest(), 9999);
        try (ActivityController<ForcedWebViewActivity> controller = launch()) {
            ForcedWebViewActivity restored = Robolectric.buildActivity(ForcedWebViewActivity.class)
                    .create(saved).start().resume().get();
            assertEquals(MainActivity.TAB_HOME, restored.selectedDockForTest());
        }
    }

    // ------------------------------------------------------- launcher shortcut

    /**
     * A {@code victus://} shortcut that arrived while the app was already running
     * was acted on but never stored, because {@code onNewIntent} never called
     * {@code setIntent}. The framework kept re-delivering the intent the task was
     * launched with, so the destination was forgotten as soon as the process was
     * recreated.
     */
    @Test
    public void aShortcutArrivingWhileRunningIsRemembered() {
        try (ActivityController<ForcedWebViewActivity> controller = launch()) {
            ForcedWebViewActivity activity = controller.setup().get();

            Intent shortcut = new Intent(Intent.ACTION_VIEW, Uri.parse("victus://billing"));
            activity.onNewIntent(shortcut);

            assertEquals("the activity must adopt the new intent",
                    "victus://billing", activity.getIntent().getDataString());
        }
    }

    /** A normal https deep link must be adopted the same way. */
    @Test
    public void aDeepLinkArrivingWhileRunningIsRemembered() {
        try (ActivityController<ForcedWebViewActivity> controller = launch()) {
            ForcedWebViewActivity activity = controller.setup().get();
            activity.onNewIntent(new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://victuscloud.com/support")));
            assertEquals("https://victuscloud.com/support",
                    activity.getIntent().getDataString());
        }
    }

    // --------------------------------------------------------- file picker leak

    /**
     * A document picker left open across a destroy left the page's
     * {@code <input type="file">} blocked forever: its {@code ValueCallback} was
     * never answered, so the WebView considered the request still in flight and
     * ignored every later tap.
     */
    @Test
    public void destroyingTheActivityAnswersAPendingFilePicker() {
        final List<Object> received = new ArrayList<>();
        ValueCallback<Uri[]> callback = value -> received.add(value == null ? "cancelled" : value);

        ActivityController<ForcedWebViewActivity> controller = launch();
        ForcedWebViewActivity activity = controller.setup().get();
        activity.setFilePathCallbackForTest(callback);

        controller.pause().stop().destroy();

        assertEquals("the pending file chooser must be answered exactly once",
                1, received.size());
        assertEquals("cancelled", received.get(0));
    }

    /** Destroying with no picker open must not fabricate one. */
    @Test
    public void destroyingWithoutAPickerIsHarmless() {
        try (ActivityController<ForcedWebViewActivity> controller = launch()) {
            controller.setup();
            controller.pause().stop().destroy();
        }
    }

    // ------------------------------------------------------------- WebView teardown

    /** The shell's WebView must be detached before destroy, never left parented. */
    @Test
    public void theWebViewIsDetachedOnDestroy() {
        ActivityController<ForcedWebViewActivity> controller = launch();
        ForcedWebViewActivity activity = controller.setup().get();
        WebView webView = activity.webViewForTest();
        assertNotNull("no WebView was built", webView);
        assertNotNull("the WebView was never attached", webView.getParent());

        controller.pause().stop().destroy();
        assertTrue("the WebView outlived its parent", webView.getParent() == null);
    }

    // ----------------------------------------------------------------- helpers

    private static FrameLayout overlay(MainActivity activity) {
        return activity.errorOverlayForTest();
    }
}

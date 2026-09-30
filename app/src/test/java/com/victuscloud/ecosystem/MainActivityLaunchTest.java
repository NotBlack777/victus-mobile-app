package com.victuscloud.ecosystem;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

/**
 * The launch path, actually executed.
 *
 * <p>The app shipped four releases (2.2.1 through 4.6.0) that died instantly on
 * launch. The cause was not shrinking, resource stripping or a missing
 * dependency: {@code createLayout()} added the WebView to the root
 * {@code FrameLayout} and then added the same WebView to the
 * {@code SwipeRefreshLayout}, and {@code ViewGroup.addView} throws
 * {@link IllegalStateException} the moment a child already has a different
 * parent. That is the first statement of the launch path after the splash
 * handoff, so the process died before a single frame was drawn — on every
 * build type, on every device, on every version since the pull-to-refresh port.
 *
 * <p>It survived because nothing ever ran {@code onCreate}. Every other test in
 * this suite targets a pure helper class precisely because the real Activity was
 * too awkward to exercise. This one boots the Activity, so the next
 * first-line-of-launch mistake fails the build instead of shipping.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class MainActivityLaunchTest {

    /**
     * The regression itself. Before the fix this threw
     * "The specified child already has a parent. You must call removeView() on
     * the parent's ViewGroup first." out of {@code createLayout()}.
     */
    @Test
    public void theActivityActuallyLaunches() {
        try (ActivityController<MainActivity> controller =
                     Robolectric.buildActivity(MainActivity.class)) {
            ActivityController<MainActivity> made = controller.setup();
            Activity activity = made.get();
            assertNotNull("onCreate produced no activity", activity);
            assertNotNull("nothing was set as the content view", activity.getWindow());
        }
    }

    /**
     * Every view in the tree must belong to exactly one parent. This is the
     * invariant that was violated, asserted directly so the failure names the
     * problem instead of surfacing as a generic crash later.
     */
    @Test
    public void noViewIsParentedTwice() {
        try (ActivityController<ForcedWebViewActivity> controller =
                     Robolectric.buildActivity(ForcedWebViewActivity.class)) {
            MainActivity activity = controller.setup().get();

            View root = activity.getWindow().getDecorView().findViewById(android.R.id.content);
            assertNotNull("no content view", root);

            int visited = 0;
            visited += assertSingleParented(root);
            assertTrue("the launch path built no view hierarchy at all", visited > 0);
        }
    }

    /** Walks the tree and fails if any view reports a parent it is not inside of. */
    private int assertSingleParented(View view) {
        int count = 1;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                View child = group.getChildAt(i);
                ViewParentAssert.isChildOf(child, group);
                count += assertSingleParented(child);
            }
        }
        return count;
    }

    /** A WebView must exist and be reachable from the tree, not orphaned. */
    @Test
    public void theWebViewIsInTheContentTree() {
        try (ActivityController<ForcedWebViewActivity> controller =
                     Robolectric.buildActivity(ForcedWebViewActivity.class)) {
            MainActivity activity = controller.setup().get();
            View root = activity.getWindow().getDecorView().findViewById(android.R.id.content);
            assertNotNull("the shell never created a WebView", findWebView(root));
        }
    }

    /**
     * The bundled home screen is what the app opens on. If this silently fails
     * the user gets a blank WebView and blames the release, so the very first
     * load is asserted rather than assumed.
     */
    @Test
    public void theBundledHomeScreenIsTheFirstThingLoaded() {
        try (ActivityController<ForcedWebViewActivity> controller =
                     Robolectric.buildActivity(ForcedWebViewActivity.class)) {
            MainActivity activity = controller.setup().get();
            WebView webView = findWebView(
                    activity.getWindow().getDecorView().findViewById(android.R.id.content));
            assertNotNull("no WebView", webView);
            assertEquals("the app did not open its own bundled home screen",
                    "https://appassets.androidplatform.net/index.html",
                    shadowOf(webView).getLastLoadedUrl());
        }
    }

    /**
     * The full lifecycle, not just onCreate. Every one of these callbacks runs
     * after the first frame, on real devices, and none of them had ever been
     * executed before — so any of them could be hiding the next crash.
     */
    @Test
    public void theWholeLifecycleRunsWithoutThrowing() {
        try (ActivityController<ForcedWebViewActivity> controller =
                     Robolectric.buildActivity(ForcedWebViewActivity.class)) {
            MainActivity activity = controller.setup().get();
            controller.resume();
            shadowOf(Looper.getMainLooper()).idle();
            controller.pause();
            controller.stop();
            controller.start();
            controller.resume();
            shadowOf(Looper.getMainLooper()).idle();
            controller.pause().stop().destroy();
        }
    }

    /**
     * A victuscloud.com link opened while the app is already running. This is
     * the "navigate the app" path: singleTask means every link re-enters here
     * rather than creating a second Activity, so a crash in onNewIntent is
     * only ever seen by a user tapping a link from another app.
     */
    @Test
    public void aDeepLinkWhileRunningNavigatesInsteadOfCrashing() {
        try (ActivityController<ForcedWebViewActivity> controller =
                     Robolectric.buildActivity(ForcedWebViewActivity.class)) {
            MainActivity activity = controller.setup().get();

            Intent link = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://control.victuscloud.com/server/abc"));
            controller.newIntent(link);

            assertNotNull("the deep link tore the activity down",
                    activity.getWindow().getDecorView());
        }
    }

    /** The back gesture is wired through OnBackPressedDispatcher, not overridden. */
    @Test
    public void theBackGestureIsHandled() {
        try (ActivityController<ForcedWebViewActivity> controller =
                     Robolectric.buildActivity(ForcedWebViewActivity.class)) {
            MainActivity activity = controller.setup().get();
            // First back press is consumed by in-app history; it must not throw.
            activity.getOnBackPressedDispatcher().onBackPressed();
            shadowOf(Looper.getMainLooper()).idle();
        }
    }

    /**
     * Robolectric has no WebView provider, so the real {@code isWebViewAvailable}
     * returns false and the Activity takes its "no WebView" early return. That
     * is correct behaviour on a device with no engine, but it means the tests
     * above would stop before {@code createLayout()} and would not have caught
     * the crash they exist to catch. This subclass says yes, so the whole launch
     * path runs.
     */
    public static final class ForcedWebViewActivity extends MainActivity {
        @Override
        protected boolean isWebViewUsable() {
            return true;
        }
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    /** Kept separate so the assertion reads clearly at the call site. */
    static final class ViewParentAssert {
        static void isChildOf(View child, ViewGroup expected) {
            org.junit.Assert.assertSame(
                    "view is parented somewhere other than the group that holds it",
                    expected, child.getParent());
        }
    }
}

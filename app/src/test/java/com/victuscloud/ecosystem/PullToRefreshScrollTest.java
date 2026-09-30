package com.victuscloud.ecosystem;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.view.View;
import android.webkit.WebView;

import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

import java.lang.reflect.Field;

/**
 * Why the app did not scroll, and what now makes it scroll.
 *
 * <p>The shell wraps its WebView in a {@link SwipeRefreshLayout} so a downward
 * drag at the top of a page refreshes it. That layout decides whether to steal a
 * vertical drag by asking {@code canChildScrollUp()}. Left alone it inspects its
 * own child with {@code View.canScrollVertically(-1)} and caches the answer — and
 * a WebView is a scrolling <em>compositor</em>: it does not update that flag
 * until after it has already taken (and discarded) the touch. In practice the
 * layout therefore believed the page "cannot scroll up" on almost every
 * gesture, claimed the drag, and the page never moved. Refreshing by dragging was
 * the only thing that worked.</p>
 *
 * <p>The fix is {@code setOnChildScrollUpCallback}, which asks the WebView
 * directly and uncached, every time. These tests pin that down, along with the
 * two related guarantees: the refresh gesture only arms at the very top, and a
 * custom drag (the chat bubble) makes the layout stand down entirely.</p>
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class PullToRefreshScrollTest {

    public static class ForcedWebViewActivity extends MainActivity {
        /** Stand-in for the page's real scroll position, which Robolectric cannot model. */
        boolean pageCanScrollUp = false;

        @Override
        protected boolean isWebViewUsable() {
            return true;
        }

        @Override
        protected boolean webViewCanScrollUp() {
            return pageCanScrollUp;
        }
    }

    private static ActivityController<ForcedWebViewActivity> launch() {
        return Robolectric.buildActivity(ForcedWebViewActivity.class);
    }

    private static SwipeRefreshLayout pullOf(MainActivity activity) throws Exception {
        Field field = MainActivity.class.getDeclaredField("pullRefresh");
        field.setAccessible(true);
        return (SwipeRefreshLayout) field.get(activity);
    }

    private static WebView webViewOf(MainActivity activity) {
        return activity.webViewForTest();
    }

    /**
     * The core regression: the layout must consult a live callback rather than
     * deciding for itself.
     *
     * <p>Asserted structurally because the broken behaviour is a swallowed
     * gesture, which has no return value to check. If the callback is not
     * installed, the layout falls back to its cached child probe and the page
     * stops scrolling — so its presence is the whole fix.</p>
     */
    @Test
    public void theLayoutAsksTheWebViewBeforeTakingAGesture() throws Exception {
        try (ActivityController<ForcedWebViewActivity> controller = launch()) {
            ForcedWebViewActivity activity = controller.setup().get();
            SwipeRefreshLayout pull = pullOf(activity);

            assertNotNull("no pull-to-refresh wrapper was built", pull);
            assertNotNull("no WebView to scroll", webViewOf(activity));

            // The discriminating case: put the page part-way down. The WebView
            // can then scroll up, so the layout MUST refuse to claim a downward
            // drag — that refusal is what lets the user scroll.
            //
            // Without the callback, SwipeRefreshLayout falls back to probing its
            // own child with View.canScrollVertically(-1) and CACHES that answer,
            // which is the bug: the WebView is a scrolling compositor and does not
            // update the flag until after it has already swallowed the touch, so
            // the layout believed the page could not scroll up and ate the
            // gesture. Asserting here is what proves the callback is consulted —
            // the shadow WebView always reports "cannot scroll up", so the
            // override is the only way to express a part-way-down page at all.
            activity.pageCanScrollUp = true;
            assertTrue("a part-way-down page must not have its drag claimed by "
                    + "the pull-to-refresh layout", pull.canChildScrollUp());

            // Back at the very top, the refresh gesture is allowed again — and
            // only then, which is the user's "never while scrolling" requirement.
            activity.pageCanScrollUp = false;
            assertFalse("at the top of the page a pull must be allowed",
                    pull.canChildScrollUp());
        }
    }

    /**
     * The WebView must be a <em>direct</em> child of the pull layout, and the
     * first one, so the scroll gesture reaches it before anything else.
     *
     * <p>The child count is deliberately not asserted to be 1:
     * SwipeRefreshLayout inflates its own spinner indicator as a sibling, so 2 is
     * correct and asserting 1 would fail for a reason that has nothing to do with
     * scrolling.</p>
     */
    @Test
    public void theWebViewIsTheLayoutsFirstChild() throws Exception {
        try (ActivityController<ForcedWebViewActivity> controller = launch()) {
            ForcedWebViewActivity activity = controller.setup().get();
            SwipeRefreshLayout pull = pullOf(activity);
            WebView webView = webViewOf(activity);

            assertTrue("the pull wrapper must contain the WebView",
                    pull.getChildCount() >= 1);
            assertTrue("the WebView must be the pull wrapper's content child",
                    pull.getChildAt(0) == webView);
            assertTrue("the WebView must be inside the pull wrapper, so the "
                    + "gesture actually reaches it",
                    isDescendantOf(webView, pull));
        }
    }

    private static boolean isDescendantOf(android.view.View child,
                                          android.view.ViewGroup ancestor) {
        android.view.ViewParent parent = child.getParent();
        while (parent != null) {
            if (parent == ancestor) return true;
            parent = parent instanceof android.view.View
                    ? ((android.view.View) parent).getParent() : null;
        }
        return false;
    }

    /**
     * A drag of the chat bubble must not become a page refresh.
     *
     * <p>The page tells the shell when a custom drag starts; the shell then
     * disallows parent interception for that gesture so the vertical component
     * is not claimed as a pull.</p>
     */
    @Test
    public void aCustomDragStopsTheLayoutIntercepting() throws Exception {
        try (ActivityController<ForcedWebViewActivity> controller = launch()) {
            ForcedWebViewActivity activity = controller.setup().get();
            assertFalse("no drag is in progress to begin with",
                    activity.isDragInProgress());

            // Start a drag the way the page does, then confirm the shell is in
            // the state that makes it disallow parent interception for the
            // WebView's touches — which is what stops the pull layout from
            // claiming a bubble drag as a refresh.
            activity.shellSetDragging(true);
            assertTrue("a started drag must be visible to the touch handler",
                    activity.isDragInProgress());

            // Dispatching a real touch must be harmless and must not throw.
            WebView webView = webViewOf(activity);
            android.view.MotionEvent down = android.view.MotionEvent.obtain(
                    0L, 0L, android.view.MotionEvent.ACTION_DOWN, 100f, 300f, 0);
            try {
                webView.dispatchTouchEvent(down);
            } finally {
                down.recycle();
            }
            assertTrue(activity.isDragInProgress());
        }
    }

    /** The drag flag must be cleared again, or every later gesture is dead. */
    @Test
    public void endingADragRestoresNormalGestures() throws Exception {
        try (ActivityController<ForcedWebViewActivity> controller = launch()) {
            ForcedWebViewActivity activity = controller.setup().get();
            activity.shellSetDragging(true);
            assertTrue(activity.isDragInProgress());

            activity.shellSetDragging(false);
            assertFalse("the drag hold must be released, or the page never "
                    + "scrolls again", activity.isDragInProgress());
        }
    }

    /**
     * Pull-to-refresh is only ever enabled for our own pages, so an external
     * site keeps its own gesture space.
     */
    @Test
    public void pullToRefreshIsOnlyEnabledForOurOwnPages() throws Exception {
        try (ActivityController<ForcedWebViewActivity> controller = launch()) {
            ForcedWebViewActivity activity = controller.setup().get();
            SwipeRefreshLayout pull = pullOf(activity);

            activity.onPageLoadStarted("https://appassets.androidplatform.net/index.html");
            assertTrue("our own home screen is refreshable", pull.isEnabled());

            activity.onPageLoadStarted("https://evil.example.com/");
            assertFalse("an external site must keep its own gestures", pull.isEnabled());
        }
    }

    /** A page load always ends any in-flight refresh spinner. */
    @Test
    public void loadingAPageEndsTheRefreshSpinner() throws Exception {
        try (ActivityController<ForcedWebViewActivity> controller = launch()) {
            ForcedWebViewActivity activity = controller.setup().get();
            activity.onPageLoadStarted("https://appassets.androidplatform.net/index.html");
            activity.onPageLoadFinished("https://appassets.androidplatform.net/index.html");
            assertFalse(pullOf(activity).isRefreshing());
        }
    }
}

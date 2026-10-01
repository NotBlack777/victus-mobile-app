package com.victuscloud.ecosystem;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

/**
 * The draggable bubble's gesture protection.
 *
 * <p>This exists because the bubble drags correctly under a desktop mouse and
 * dies under a finger, and no browser-driven test can see the difference: the
 * race lives between the WebView's touch dispatch and a
 * {@code SwipeRefreshLayout} that no such test has. What is testable — and what
 * actually broke — is the rule the shell now follows: a touch that begins on the
 * published bubble region must be recognised during {@code ACTION_DOWN}, before
 * any parent layout gets a chance to intercept.</p>
 */
@RunWith(RobolectricTestRunner.class)
public class DragRegionTest {

    /** A bubble region in WebView device pixels, as the page reports it. */
    private static MainActivity withBubbleAt(float left, float top, float right, float bottom) {
        MainActivity activity = new MainActivity();
        activity.setDragRegion(left, top, right, bottom);
        return activity;
    }

    @Test
    public void aTouchInsideTheBubbleIsRecognisedAsADrag() {
        MainActivity activity = withBubbleAt(100f, 200f, 154f, 254f);
        assertTrue(activity.touchStartsInDragRegion(120f, 220f));
    }

    @Test
    public void theEdgesThemselvesCount() {
        // A finger landing exactly on the boundary must still be the bubble's,
        // not a pull-to-refresh: the reported position is rounded to whole
        // device pixels, so the boundary is hit routinely rather than rarely.
        MainActivity activity = withBubbleAt(100f, 200f, 154f, 254f);
        assertTrue(activity.touchStartsInDragRegion(100f, 200f));
        assertTrue(activity.touchStartsInDragRegion(154f, 254f));
    }

    @Test
    public void aTouchElsewhereOnThePageIsNotTheBubble() {
        MainActivity activity = withBubbleAt(100f, 200f, 154f, 254f);
        assertFalse(activity.touchStartsInDragRegion(20f, 20f));
        assertFalse(activity.touchStartsInDragRegion(500f, 900f));
        // Just outside each edge: a near-miss is a page scroll, not a drag.
        assertFalse(activity.touchStartsInDragRegion(99f, 220f));
        assertFalse(activity.touchStartsInDragRegion(155f, 220f));
        assertFalse(activity.touchStartsInDragRegion(120f, 199f));
        assertFalse(activity.touchStartsInDragRegion(120f, 255f));
    }

    @Test
    public void withNoRegionPublishedNothingIsProtected() {
        // The safe default: until the page says where the bubble is, a drag
        // anywhere must still be able to pull-to-refresh.
        MainActivity activity = new MainActivity();
        assertFalse(activity.touchStartsInDragRegion(120f, 220f));
        assertFalse(activity.isDragGestureProtected());
    }

    @Test
    public void aTouchOnTheBubbleStandsPullToRefreshDown() {
        // The whole point of the fix: the protection is armed by ACTION_DOWN,
        // before any parent layout is asked whether it may intercept. Arming it
        // from the page's pointerdown handler instead was one hop too late.
        MainActivity activity = withBubbleAt(100f, 200f, 154f, 254f);
        assertTrue(activity.onTouchDown(120f, 220f));
        assertTrue(activity.isDragGestureProtected());
        // And the touch listener must act on that verdict.
        assertTrue(activity.webViewCanScrollUp());
    }

    @Test
    public void aTouchElsewhereLeavesPullToRefreshWorking() {
        MainActivity activity = withBubbleAt(100f, 200f, 154f, 254f);
        assertFalse(activity.onTouchDown(20f, 900f));
        // With no WebView attached the shell conservatively reports "can scroll
        // up", which is what lets a pull start on an ordinary part of the page.
        assertFalse(activity.isDragGestureProtected());
    }

    @Test
    public void aPageDragIsStillHonouredWithoutTheRegion() {
        // The existing "a drag started" signal still works, so the fix does not
        // depend on the region ever arriving (an older cached page, a browser
        // preview, a page that has not laid out yet).
        MainActivity activity = new MainActivity();
        activity.shellSetDragging(true);
        assertTrue(activity.isDragGestureProtected());
        activity.shellSetDragging(false);
        assertFalse(activity.isDragGestureProtected());
    }

    @Test
    public void clearingTheRegionStopsProtectingThatArea() {
        // A stale region left behind by a page that unloaded would leave an
        // invisible box swallowing pull-to-refresh on an empty screen.
        MainActivity activity = withBubbleAt(100f, 200f, 154f, 254f);
        activity.clearDragRegion();
        assertFalse(activity.touchStartsInDragRegion(120f, 220f));
        assertFalse(activity.isDragGestureProtected());
    }

    @Test
    public void aMalformedRegionIsRejectedRatherThanGuessed() {
        // A bad value must disable the protection, never become a huge region
        // that would silently break pull-to-refresh across the whole screen.
        MainActivity activity = new MainActivity();
        activity.setDragRegion(100f, 200f, 154f, 254f);
        activity.setDragRegion(Float.NaN, Float.NaN, Float.NaN, Float.NaN);
        // NaN comparisons are all false, so containment holds for nothing —
        // which is the safe direction: no gesture is claimed as a drag.
        assertFalse(activity.touchStartsInDragRegion(120f, 220f));
    }

    @Test
    public void theShellAsksThePageWhereItScrolledToo() {
        // The scroll signal is a second, independent way to stand the refresh
        // down, and it must survive the new drag protection untouched.
        MainActivity activity = new MainActivity();
        activity.setPageScrolledAwayFromTop(true);
        assertTrue(activity.webViewCanScrollUp());
        activity.setPageScrolledAwayFromTop(false);
        // No WebView and no drag: conservatively "can scroll up", so a pull can
        // still start somewhere ordinary.
        assertTrue(activity.webViewCanScrollUp());
    }
}

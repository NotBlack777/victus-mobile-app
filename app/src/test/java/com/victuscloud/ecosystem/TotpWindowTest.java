package com.victuscloud.ecosystem;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The authenticator window, at its edges.
 *
 * <p>These are the cases that turn a correct code into "invalid": the first
 * millisecond of a window, the last, the moment just after the boundary, and a
 * device clock that is minutes fast or slow. Everything is measured on the
 * panel's clock, which is the clock the verifier actually uses.</p>
 */
public class TotpWindowTest {

    /** A round server timestamp that is exactly on a 30-second boundary. */
    private static final long BASE = 1_756_999_980_000L;

    private static TotpWindow syncedWindow(long offsetMillis) {
        TotpWindow window = new TotpWindow();
        window.observe(BASE, BASE + offsetMillis);
        return window;
    }

    @Test
    public void startsOutUnsyncedAndZeroed() {
        TotpWindow window = new TotpWindow();
        assertFalse(window.isSynced());
        assertEquals(0L, window.offsetMillis());
    }

    @Test
    public void observesThePanelClock() {
        TotpWindow window = syncedWindow(45_000L);
        assertTrue(window.isSynced());
        assertEquals(45_000L, window.offsetMillis());
        assertEquals(BASE + 50_000L, window.serverNow(BASE + 5_000L));
    }

    @Test
    public void ignoresSubSecondJitterButAdoptsARealClockChange() {
        TotpWindow window = syncedWindow(45_000L);
        // HTTP rounds Date to whole seconds: a ±400 ms wobble must not move the ring.
        window.observe(BASE, BASE + 45_400L);
        assertEquals(45_000L, window.offsetMillis());
        window.observe(BASE, BASE + 44_600L);
        assertEquals(45_000L, window.offsetMillis());
        // A five-second difference is the clock actually moving: adopt it.
        window.observe(BASE, BASE + 50_000L);
        assertEquals(50_000L, window.offsetMillis());
    }

    @Test
    public void windowStartFloorsToTheStepBoundary() {
        assertEquals(BASE, TotpWindow.windowStart(BASE));
        assertEquals(BASE, TotpWindow.windowStart(BASE + 29_999L));
        assertEquals(BASE + 30_000L, TotpWindow.windowStart(BASE + 30_000L));
    }

    @Test
    public void windowStartIsCorrectBeforeTheEpoch() {
        // A phone whose clock reads 1970 must not produce a positive remainder.
        assertEquals(-30_000L, TotpWindow.windowStart(-1L));
        assertEquals(-30_000L, TotpWindow.windowStart(-30_000L));
    }

    @Test
    public void reportsAWholeWindowAtItsStart() {
        TotpWindow window = new TotpWindow();
        assertEquals(30, window.secondsRemaining(BASE));
    }

    @Test
    public void reportsOneSecondAtTheVeryEnd() {
        TotpWindow window = new TotpWindow();
        // BASE + 29s: one second of this code is left, not zero — a code with zero
        // seconds left is already the next code's and must never be displayed.
        assertEquals(1, window.secondsRemaining(BASE + 29_000L));
    }

    @Test
    public void rollsOverExactlyAtTheBoundary() {
        TotpWindow window = new TotpWindow();
        assertEquals(30, window.secondsRemaining(BASE + 30_000L));
        assertEquals(29, window.secondsRemaining(BASE + 31_000L));
    }

    @Test
    public void aClockMinutesFastStillLandsOnTheServerWindow() {
        // The phone thinks it is five minutes ahead; the panel's window is what counts.
        long phoneNow = BASE + 300_000L;
        TotpWindow window = syncedWindow(-300_000L);
        assertEquals(30, window.secondsRemaining(phoneNow));
        assertEquals(1, window.secondsRemaining(phoneNow + 29_000L));
        assertEquals(30, window.secondsRemaining(phoneNow + 30_000L));
    }

    @Test
    public void millisUntilNextWindowIsAlwaysInsideOneStep() {
        TotpWindow window = new TotpWindow();
        long[] samples = {0L, 1L, 999L, 1_000L, 15_000L, 29_999L, 30_000L, 123_456L};
        for (long offset : samples) {
            long until = window.millisUntilNextWindow(BASE + offset);
            assertTrue("offset " + offset + " gave " + until,
                    until > 0L && until <= TotpWindow.PERIOD_MILLIS);
        }
        assertEquals(30_000L, window.millisUntilNextWindow(BASE));
        assertEquals(1L, window.millisUntilNextWindow(BASE + 29_999L));
    }

    @Test
    public void anOffsetMovesTheCountdownToTheServersWindowNotTheDevices() {
        // The device reads 1.5s ahead of the panel, so the panel's window started
        // 1.5s ago and a fresh code is already 1.5s old.
        TotpWindow window = syncedWindow(1_500L);
        assertEquals(29, window.secondsRemaining(BASE));
        assertEquals(28_500L, window.millisUntilNextWindow(BASE));
        assertEquals(30_000L, window.millisUntilNextWindow(BASE + 28_500L));
        // Half a step later the panel is 1.5s into the NEXT window, so a fresh
        // code is already 1.5s old on the server's clock.
        assertEquals(29, window.secondsRemaining(BASE + 30_000L));
    }

    @Test
    public void knowsWhenACodeIsAboutToRotate() {
        TotpWindow window = new TotpWindow();
        assertFalse(window.isRotating(BASE + 20_000L, 4));
        assertTrue(window.isRotating(BASE + 27_000L, 4));
        assertTrue(window.isRotating(BASE + 29_500L, 4));
        // Just after the boundary it is the fresh code, so not "rotating".
        assertFalse(window.isRotating(BASE + 30_100L, 4));
    }

    @Test
    public void parsesAnHttpDateHeader() {
        assertEquals(1_790_760_800_000L,
                TotpWindow.parseHttpDate("Wed, 30 Sep 2026 09:33:20 GMT"));
        assertEquals(1_790_760_800_000L,
                TotpWindow.parseHttpDate("Wed, 30 Sep 2026 11:33:20 +0200"));
    }

    @Test
    public void refusesAMissingOrNonsenseDateHeader() {
        assertEquals(-1L, TotpWindow.parseHttpDate(null));
        assertEquals(-1L, TotpWindow.parseHttpDate(""));
        assertEquals(-1L, TotpWindow.parseHttpDate("   "));
        assertEquals(-1L, TotpWindow.parseHttpDate("not-a-date"));
        assertEquals(-1L, TotpWindow.parseHttpDate("Wed, 99 Xxx 2026 99:99:99 GMT"));
    }
}
package com.victuscloud.ecosystem;

import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * The 30-second authenticator window, measured against <em>server</em> time.
 *
 * <p>An authenticator code is {@code HMAC(secret, floor(unixTime / 30))}, and the
 * panel checks it against its own clock. A phone whose clock has drifted by more
 * than a step therefore produces codes the panel rejects — and when the code is
 * entered just after the boundary it has already rotated, which is the other half
 * of "the app says my code is invalid".</p>
 *
 * <p>This class keeps an offset measured from the panel's own {@code Date} response
 * header, so everything here is expressed in server time regardless of how wrong
 * the device clock is. It never computes, stores or transmits a code: only the
 * remaining seconds of the current window, so the screen can show the user exactly
 * when the next code starts.</p>
 *
 * <p>Pure Java and free of Android imports, so every window edge case is covered by
 * ordinary JVM unit tests.</p>
 */
final class TotpWindow {

    /** The RFC 6238 period every authenticator app uses by default. */
    static final int PERIOD_SECONDS = 30;

    static final long PERIOD_MILLIS = PERIOD_SECONDS * 1000L;

    /** ServerTime minus deviceTime, in millis. Zero until a sample arrives. */
    private long offsetMillis;

    /** Whether a real server sample has been seen (an unsynced offset is a guess). */
    private boolean synced;

    /**
     * Records one observation of the panel's clock.
     *
     * <p>HTTP rounds {@code Date} to whole seconds, so a single sample is accurate
     * to about a second — comfortably inside one TOTP step, which is all the ring
     * needs. The offset is a running median-ish value: it only moves when a new
     * sample differs by more than a second, so ordinary clock jitter (and a
     * half-second rounding difference between two responses) does not make the
     * countdown jump backwards.</p>
     */
    void observe(long deviceNowMillis, long serverNowMillis) {
        if (deviceNowMillis <= 0L || serverNowMillis <= 0L) return;
        long sampled = serverNowMillis - deviceNowMillis;
        if (!synced) {
            offsetMillis = sampled;
            synced = true;
            return;
        }
        // Ignore sub-second jitter; adopt anything that means the clock really moved.
        if (Math.abs(sampled - offsetMillis) >= 1000L) {
            offsetMillis = sampled;
        }
    }

    /** True once a real server sample has been taken. */
    boolean isSynced() {
        return synced;
    }

    /** ServerTime minus deviceTime, in millis. */
    long offsetMillis() {
        return offsetMillis;
    }

    /** This device's clock, expressed on the panel's timeline. */
    long serverNow(long deviceNowMillis) {
        return deviceNowMillis + offsetMillis;
    }

    /**
     * The start of the window containing {@code epochMillis}: the value a TOTP
     * implementation actually feeds into the HMAC. Uses a floor division so a
     * pre-epoch clock cannot produce a positive remainder.
     */
    static long windowStart(long epochMillis) {
        return epochMillis - Math.floorMod(epochMillis, PERIOD_MILLIS);
    }

    /**
     * Whole seconds left in the current window, on the server timeline, as a value
     * from 1 to 30 inclusive. Never returns 0: a code with zero seconds left is
     * already the next code's, and showing "0" would invite the user to read a
     * number that is about to expire.
     */
    int secondsRemaining(long deviceNowMillis) {
        long now = serverNow(deviceNowMillis);
        long elapsed = Math.floorMod(now, PERIOD_MILLIS);
        // Round up: at 29.5s a whole second of this code is still valid, and
        // flooring would report zero and hide the imminent rollover instead.
        long remaining = (PERIOD_MILLIS - elapsed + 999L) / 1000L;
        if (remaining <= 0L) remaining = PERIOD_SECONDS;
        if (remaining > PERIOD_SECONDS) remaining = PERIOD_SECONDS;
        return (int) remaining;
    }

    /** Milliseconds until the next code begins, on the server timeline. */
    long millisUntilNextWindow(long deviceNowMillis) {
        long now = serverNow(deviceNowMillis);
        return PERIOD_MILLIS - Math.floorMod(now, PERIOD_MILLIS);
    }

    /**
     * Whether the code shown right now is about to be replaced — the moment a user
     * is most likely to read a number off their authenticator just as it rotates.
     * The screen uses this to say "waiting for the next code" rather than to reject
     * what they typed.
     */
    boolean isRotating(long deviceNowMillis, int thresholdSeconds) {
        return secondsRemaining(deviceNowMillis) <= thresholdSeconds;
    }

    /**
     * Parses an HTTP {@code Date} header (RFC 7231, e.g.
     * {@code Wed, 30 Sep 2026 09:49:11 GMT}) into epoch millis.
     *
     * <p>Returns -1 rather than throwing: a missing or oddly formatted header only
     * means "no sample", which is not an error worth surfacing to a user.</p>
     */
    static long parseHttpDate(String header) {
        if (header == null) return -1L;
        String trimmed = header.trim();
        if (trimmed.isEmpty()) return -1L;
        String[] formats = {
                "EEE, dd MMM yyyy HH:mm:ss zzz",
                "EEE, dd MMM yyyy HH:mm:ss Z",
                "EEE, d MMM yyyy HH:mm:ss zzz",
        };
        for (String pattern : formats) {
            SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
            format.setTimeZone(TimeZone.getTimeZone("GMT"));
            format.setLenient(false);
            ParsePosition position = new ParsePosition(0);
            Date parsed = format.parse(trimmed, position);
            if (parsed != null && position.getIndex() == trimmed.length()) {
                return parsed.getTime();
            }
        }
        return -1L;
    }
}
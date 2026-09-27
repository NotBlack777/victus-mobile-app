package com.victuscloud.ecosystem;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;

/**
 * Tiny, dependency-free theme store backed by a single {@link SharedPreferences}
 * file. Reading/writing a handful of ints is effectively free — there is no
 * database, no background work, no polling — so switching themes never costs
 * battery, memory or frame time.
 *
 * <p>Three presets are supported:</p>
 * <ul>
 *   <li>{@link #PRESET_PURPLE_BLACK} — the new default identity (purple → violet → black).</li>
 *   <li>{@link #PRESET_BLUE_TEAL} — the original brand gradient, kept as a selectable option.</li>
 *   <li>{@link #PRESET_CUSTOM} — any two user-picked colors, either as a gradient or,
 *       when {@link #isCustomSolid}, a single flat color.</li>
 * </ul>
 */
final class ThemeManager {

    static final String PRESET_PURPLE_BLACK = "purple_black";
    static final String PRESET_BLUE_TEAL = "blue_teal";
    static final String PRESET_CUSTOM = "custom";

    // Default brand identity: bright orchid purple -> deep violet -> near-black.
    static final int DEFAULT_A = 0xFFC084FC;
    static final int DEFAULT_B = 0xFF7C3AED;
    static final int DEFAULT_C = 0xFF0B0014;

    private static final int[] PURPLE_BLACK_GRADIENT = {DEFAULT_A, DEFAULT_B, DEFAULT_C};
    private static final int[] BLUE_TEAL_GRADIENT = {0xFF0284C7, 0xFF06B6D4, 0xFF14B8A6};

    private static final String PREFS = "victus_theme_prefs";
    private static final String KEY_PRESET = "preset";
    private static final String KEY_CUSTOM_A = "custom_a";
    private static final String KEY_CUSTOM_B = "custom_b";
    private static final String KEY_CUSTOM_SOLID = "custom_solid";
    private static final String KEY_REDUCE_MOTION = "reduce_motion";
    private static final String KEY_TRUST_VICTUS_SSL = "trust_victus_ssl";

    private ThemeManager() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String getPreset(Context c) {
        return prefs(c).getString(KEY_PRESET, PRESET_PURPLE_BLACK);
    }

    static void setPreset(Context c, String preset) {
        prefs(c).edit().putString(KEY_PRESET, preset).apply();
    }

    static int getCustomA(Context c) {
        return prefs(c).getInt(KEY_CUSTOM_A, DEFAULT_A);
    }

    static int getCustomB(Context c) {
        return prefs(c).getInt(KEY_CUSTOM_B, DEFAULT_C);
    }

    static boolean isCustomSolid(Context c) {
        return prefs(c).getBoolean(KEY_CUSTOM_SOLID, false);
    }

    static void setCustomColors(Context c, int colorA, int colorB, boolean solid) {
        prefs(c).edit()
                .putInt(KEY_CUSTOM_A, colorA | 0xFF000000)
                .putInt(KEY_CUSTOM_B, colorB | 0xFF000000)
                .putBoolean(KEY_CUSTOM_SOLID, solid)
                .putString(KEY_PRESET, PRESET_CUSTOM)
                .apply();
    }

    static boolean isReduceMotion(Context c) {
        return prefs(c).getBoolean(KEY_REDUCE_MOTION, false);
    }

    static void setReduceMotion(Context c, boolean reduce) {
        prefs(c).edit().putBoolean(KEY_REDUCE_MOTION, reduce).apply();
    }

    /**
     * Whether to trust SSL certificates for legitimate Victus Cloud domains (*.victuscloud.com).
     * Defaults to true so users on devices with outdated root certificate stores (Let's Encrypt
     * root/intermediate updates) are not blocked by SslError.SSL_UNTRUSTED (error 3).
     */
    static boolean isTrustVictusSsl(Context c) {
        return prefs(c).getBoolean(KEY_TRUST_VICTUS_SSL, true);
    }

    static void setTrustVictusSsl(Context c, boolean trust) {
        prefs(c).edit().putBoolean(KEY_TRUST_VICTUS_SSL, trust).apply();
    }

    static void resetToDefault(Context c) {
        prefs(c).edit().clear().apply();
    }

    /**
     * 2- or 3-stop opaque ARGB gradient for the active theme. Used for every
     * accent surface: the selected dock chip, primary buttons, the progress
     * bar and the error glyph.
     */
    static int[] gradient(Context c) {
        switch (getPreset(c)) {
            case PRESET_BLUE_TEAL:
                return BLUE_TEAL_GRADIENT.clone();
            case PRESET_CUSTOM: {
                int a = getCustomA(c);
                int b = getCustomB(c);
                return isCustomSolid(c) ? new int[]{a, a} : new int[]{a, b};
            }
            default:
                return PURPLE_BLACK_GRADIENT.clone();
        }
    }

    /** Single representative accent color: progress tint, focus rings, etc. */
    static int solid(Context c) {
        return gradient(c)[0];
    }

    static String hex(int color) {
        return String.format("#%06X", 0xFFFFFF & color);
    }

    static String rgb(int color) {
        return Color.red(color) + "," + Color.green(color) + "," + Color.blue(color);
    }
}

package com.victuscloud.ecosystem;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.provider.Settings;

/**
 * Tiny, dependency-free theme store backed by a single {@link SharedPreferences}
 * file. Reading/writing a handful of ints is effectively free — there is no
 * database, no background work, no polling — so switching themes never costs
 * battery, memory or frame time.
 *
 * <p>This is the native mirror of the reference web app's {@code ThemeConfig}
 * (src/context/ThemeContext.tsx + src/theme/palettes.ts). The preset ids are the
 * same strings the web app uses, so the active configuration can be forwarded
 * verbatim into the bundled React app from
 * {@link MainActivity#injectThemeIntoWebView()}:</p>
 *
 * <ul>
 *   <li>{@link #PRESET_PURPLE_BLACK} — brand default (purple → violet → black).</li>
 *   <li>{@link #PRESET_BLUE_TEAL} — the original blue/teal identity.</li>
 *   <li>{@link #PRESET_NODE_EMERALD}, {@link #PRESET_VICTUS_EMBER},
 *       {@link #PRESET_MONO_SLATE} — added in the web app's v2.2.0 theme pass.</li>
 *   <li>{@link #PRESET_CUSTOM} — any two user-picked colors, as a gradient or a
 *       single flat color ({@link #isCustomSolid}).</li>
 * </ul>
 *
 * <p>Everything applies instantly through {@code MainActivity.applyDynamicAccent()}
 * — no restart, no Activity recreation (display mode is the one exception: the
 * native chrome's values/values-night resources need one seamless recreate with
 * WebView state restored).</p>
 */
final class ThemeManager {

    // Preset ids intentionally match the web app's ThemePreset union.
    static final String PRESET_PURPLE_BLACK = "purple_black";
    static final String PRESET_BLUE_TEAL = "blue_teal";
    static final String PRESET_NODE_EMERALD = "node_emerald";
    static final String PRESET_VICTUS_EMBER = "victus_ember";
    static final String PRESET_MONO_SLATE = "mono_slate";
    static final String PRESET_CUSTOM = "custom";

    /** Accent triples {start, end, deep-anchor} — mirrors src/theme/palettes.ts. */
    private static final int[][] PRESET_ACCENTS = {
            {0xFFC084FC, 0xFF7C3AED, 0xFF0B0014},   // purple_black (brand)
            {0xFF0284C7, 0xFF06B6D4, 0xFF14B8A6},   // blue_teal
            {0xFF34D399, 0xFF10B981, 0xFF04120D},   // node_emerald
            {0xFFFB923C, 0xFFF97316, 0xFF170A03},   // victus_ember
            {0xFF94A3B8, 0xFF475569, 0xFF0B0E13},   // mono_slate
    };

    static final String COLOR_DARK = "dark";
    static final String COLOR_LIGHT = "light";
    static final String COLOR_SYSTEM = "system";

    static final String BG_AURORA = "aurora";
    static final String BG_MESH = "mesh";
    static final String BG_STARFIELD = "starfield";
    static final String BG_NONE = "none";

    // Default brand identity: bright orchid purple -> deep violet -> near-black.
    static final int DEFAULT_A = 0xFFC084FC;
    static final int DEFAULT_B = 0xFF7C3AED;
    static final int DEFAULT_C = 0xFF0B0014;

    private static final String PREFS = "victus_theme_prefs";
    private static final String KEY_PRESET = "preset";
    private static final String KEY_CUSTOM_A = "custom_a";
    private static final String KEY_CUSTOM_B = "custom_b";
    private static final String KEY_CUSTOM_SOLID = "custom_solid";
    private static final String KEY_REDUCE_MOTION = "reduce_motion";
    private static final String KEY_COLOR_MODE = "color_mode";
    private static final String KEY_BACKGROUND = "background";
    private static final String KEY_OPEN_LINKS_EXTERNALLY = "open_links_externally";
    private static final String KEY_TRUST_VICTUS_SSL = "trust_victus_ssl";

    private ThemeManager() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ------------------------------------------------------------- presets

    /** All selectable preset ids in display order (custom last). */
    static String[] presetIds() {
        return new String[]{
                PRESET_PURPLE_BLACK, PRESET_BLUE_TEAL, PRESET_NODE_EMERALD,
                PRESET_VICTUS_EMBER, PRESET_MONO_SLATE, PRESET_CUSTOM,
        };
    }

    static String getPreset(Context c) {
        String preset = prefs(c).getString(KEY_PRESET, PRESET_PURPLE_BLACK);
        // Defensive: a preset id that no longer exists falls back to the brand.
        for (String known : presetIds()) {
            if (known.equals(preset)) return preset;
        }
        return PRESET_PURPLE_BLACK;
    }

    static void setPreset(Context c, String preset) {
        prefs(c).edit().putString(KEY_PRESET, preset).apply();
    }

    /**
     * Accent triple for a specific preset id (not the stored one) — used by the
     * settings sheet to paint each preset's swatch without mutating state.
     * The Custom entry renders from the saved custom colors.
     */
    static int[] gradientForPreset(Context c, String preset) {
        if (PRESET_CUSTOM.equals(preset)) {
            int a = getCustomA(c);
            int b = getCustomB(c);
            return isCustomSolid(c) ? new int[]{a, a, a} : new int[]{a, b, b};
        }
        String[] ids = presetIds();
        for (int i = 0; i < ids.length; i++) {
            if (ids[i].equals(preset)) {
                int[] accents = PRESET_ACCENTS[i];
                return new int[]{accents[0], accents[1], accents[2]};
            }
        }
        return new int[]{DEFAULT_A, DEFAULT_B, DEFAULT_C};
    }

    // -------------------------------------------------------------- custom

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

    // --------------------------------------------------------------- motion

    /**
     * The in-app "Reduce animations" switch — the raw stored value. UI shows
     * this so a system-level animation kill never makes the switch lie.
     */
    static boolean isReduceMotionRaw(Context c) {
        return prefs(c).getBoolean(KEY_REDUCE_MOTION, false);
    }

    /**
     * Effective reduce-motion: the in-app switch OR the system-level
     * "remove animations" accessibility setting (animator duration scale 0),
     * mirroring how the web app also honors prefers-reduced-motion.
     */
    static boolean isReduceMotion(Context c) {
        if (prefs(c).getBoolean(KEY_REDUCE_MOTION, false)) return true;
        try {
            return Settings.Global.getFloat(
                    c.getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f;
        } catch (Exception e) {
            return false; // never let a settings read break rendering
        }
    }

    static void setReduceMotion(Context c, boolean reduce) {
        prefs(c).edit().putBoolean(KEY_REDUCE_MOTION, reduce).apply();
    }

    // ---------------------------------------------------------- display mode

    static String getColorMode(Context c) {
        String mode = prefs(c).getString(KEY_COLOR_MODE, COLOR_DARK);
        if (COLOR_DARK.equals(mode) || COLOR_LIGHT.equals(mode) || COLOR_SYSTEM.equals(mode)) {
            return mode;
        }
        return COLOR_DARK;
    }

    static void setColorMode(Context c, String mode) {
        prefs(c).edit().putString(KEY_COLOR_MODE, mode).apply();
    }

    /**
     * Saves the new mode and reports whether the dark/light resolution actually
     * changed — only then does the caller need to recreate the activity, so
     * tapping "System" twice (or Light while already light) costs nothing.
     */
    static boolean setColorModeAndCompare(Context c, String mode) {
        boolean wasDark = isDark(c);
        setColorMode(c, mode);
        return wasDark != isDark(c);
    }

    /**
     * Whether the UI (native chrome values-night resources + the bridged web
     * app) should currently paint dark. "System" resolves from the real
     * configuration; forced dark/light ignore it.
     */
    static boolean isDark(Context c) {
        String mode = getColorMode(c);
        if (COLOR_LIGHT.equals(mode)) return false;
        if (COLOR_DARK.equals(mode)) return true;
        int mask = c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mask != Configuration.UI_MODE_NIGHT_NO; // default dark when undefined
    }

    // ------------------------------------------------------------- background

    static String getBackground(Context c) {
        String bg = prefs(c).getString(KEY_BACKGROUND, BG_AURORA);
        if (BG_AURORA.equals(bg) || BG_MESH.equals(bg)
                || BG_STARFIELD.equals(bg) || BG_NONE.equals(bg)) {
            return bg;
        }
        return BG_AURORA;
    }

    static void setBackground(Context c, String background) {
        prefs(c).edit().putString(KEY_BACKGROUND, background).apply();
    }

    // ------------------------------------------------------- external links

    /**
     * "Open links externally" — when on, taps on Victus Cloud pages from inside
     * a loaded site are handed to the device browser instead of navigating the
     * in-app WebView (mirrors the reference app's toggle). The dock and the
     * bundled home screen always stay in-app.
     */
    static boolean isOpenLinksExternally(Context c) {
        return prefs(c).getBoolean(KEY_OPEN_LINKS_EXTERNALLY, false);
    }

    static void setOpenLinksExternally(Context c, boolean openExternal) {
        prefs(c).edit().putBoolean(KEY_OPEN_LINKS_EXTERNALLY, openExternal).apply();
    }

    // -------------------------------------------------------------- security

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

    // ----------------------------------------------------------------- reset

    /** Restores every appearance default (the brand look). Nothing network-related. */
    static void resetToDefault(Context c) {
        prefs(c).edit().clear().apply();
    }

    // --------------------------------------------------------------- accents

    /**
     * 3-stop opaque ARGB accent gradient for the active theme. Used for every
     * accent surface: the selected dock chip, primary buttons, the progress
     * bar and the error glyph. Custom solid colors repeat the start stop.
     */
    static int[] gradient(Context c) {
        String preset = getPreset(c);
        if (PRESET_CUSTOM.equals(preset)) {
            int a = getCustomA(c);
            int b = getCustomB(c);
            return isCustomSolid(c) ? new int[]{a, a, a} : new int[]{a, b, b};
        }
        String[] ids = presetIds();
        for (int i = 0; i < ids.length; i++) {
            if (ids[i].equals(preset)) {
                int[] accents = PRESET_ACCENTS[i];
                return new int[]{accents[0], accents[1], accents[2]};
            }
        }
        return new int[]{DEFAULT_A, DEFAULT_B, DEFAULT_C};
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

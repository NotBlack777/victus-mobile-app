package com.victuscloud.ecosystem;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.OvershootInterpolator;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupWindow;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.core.content.ContextCompat;

/**
 * The reference app's Tools overflow menu, rebuilt natively: a dark glass
 * card anchored under the triple-dot button with per-item icons, ripple
 * feedback and a quick scale/fade entrance. Plain views only — no extra
 * dependency, no androidx popup shim.
 *
 * <p>Glass look comes from {@code R.color.menu_bg}: the same translucent
 * surface the reference drawer uses, layered over the dimmed app behind the
 * popup. Items mirror the reference menu's ordering exactly (Settings,
 * Open in browser, Copy link, Share link, test panel, Support, System status,
 * Marketplace, Check for updates, Clear app session).</p>
 */
final class ToolsMenu {

    /** Stable ids handed back to {@link MainActivity#onToolSelected(int)}. */
    static final int TOOL_SETTINGS = 0;
    static final int TOOL_OPEN_BROWSER = 1;
    static final int TOOL_COPY_LINK = 2;
    static final int TOOL_SHARE_LINK = 3;
    static final int TOOL_TEST_PANEL = 4;
    static final int TOOL_SUPPORT = 5;
    static final int TOOL_STATUS = 6;
    static final int TOOL_MARKETPLACE = 7;
    static final int TOOL_UPDATES = 8;
    static final int TOOL_CLEAR_SESSION = 9;
    /** Device & compatibility: ROM, WebView provider, Keystore and panel checks. */
    static final int TOOL_DEVICE_COMPAT = 10;

    private static final class Item {
        final int id;
        final int labelRes;
        final int iconRes;
        final boolean danger;

        Item(int id, int labelRes, int iconRes, boolean danger) {
            this.id = id;
            this.labelRes = labelRes;
            this.iconRes = iconRes;
            this.danger = danger;
        }
    }

    private static final Item[] ITEMS = {
            new Item(TOOL_SETTINGS, R.string.tools_settings, R.drawable.ic_settings_24, false),
            new Item(TOOL_OPEN_BROWSER, R.string.tools_open_browser, R.drawable.ic_external_24, false),
            new Item(TOOL_COPY_LINK, R.string.tools_copy_link, R.drawable.ic_copy_24, false),
            new Item(TOOL_SHARE_LINK, R.string.tools_share_link, R.drawable.ic_share_24, false),
            new Item(TOOL_TEST_PANEL, R.string.tools_test_panel, R.drawable.ic_flask_24, false),
            new Item(TOOL_SUPPORT, R.string.tools_support, R.drawable.ic_support_24, false),
            new Item(TOOL_STATUS, R.string.tools_status, R.drawable.ic_status_24, false),
            new Item(TOOL_MARKETPLACE, R.string.tools_marketplace, R.drawable.ic_marketplace_24, false),
            new Item(TOOL_UPDATES, R.string.tools_check_updates, R.drawable.ic_update_24, false),
            new Item(TOOL_DEVICE_COMPAT, R.string.tools_device_compat, R.drawable.ic_device_24, false),
            new Item(TOOL_CLEAR_SESSION, R.string.tools_clear_session, R.drawable.ic_clear_session_24, true),
    };

    private ToolsMenu() {
    }

    static void show(MainActivity activity, View anchor) {
        boolean reduceMotion = ThemeManager.isReduceMotion(activity);
        Context ctx = activity;

        // ---------------------------------------------------------- card
        LinearLayout card = new LinearLayout(ctx);
        card.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(ContextCompat.getColor(ctx, R.color.menu_bg));
        bg.setCornerRadius(dp(ctx, 22));
        bg.setStroke(dp(ctx, 1), ContextCompat.getColor(ctx, R.color.menu_stroke));
        card.setBackground(bg);
        card.setElevation(dp(ctx, 18));
        card.setPadding(dp(ctx, 10), dp(ctx, 10), dp(ctx, 10), dp(ctx, 10));

        // Brand header — echoes the reference drawer's "Victus" wordmark.
        LinearLayout header = new LinearLayout(ctx);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(dp(ctx, 12), dp(ctx, 8), dp(ctx, 12), dp(ctx, 12));

        TextView brand = new TextView(ctx);
        brand.setText(R.string.app_name);
        brand.setTextSize(15);
        brand.setTypeface(brand.getTypeface(), Typeface.BOLD);
        brand.setTextColor(ContextCompat.getColor(ctx, R.color.title_text));
        header.addView(brand);

        TextView version = new TextView(ctx);
        version.setText(ctx.getString(R.string.tools_menu_version, versionName(ctx)));
        version.setTextSize(11);
        version.setTextColor(ContextCompat.getColor(ctx, R.color.error_text));
        LinearLayout.LayoutParams versionParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        versionParams.topMargin = dp(ctx, 1);
        header.addView(version, versionParams);
        card.addView(header);

        View headerDivider = new View(ctx);
        headerDivider.setBackgroundColor(ContextCompat.getColor(ctx, R.color.divider));
        card.addView(headerDivider, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(ctx, 1)));

        // --------------------------------------------------------- items
        String available = UpdateChecker.availableVersionName(activity);
        LinearLayout rows = new LinearLayout(ctx);
        rows.setOrientation(LinearLayout.VERTICAL);
        // The rows close the popup before dispatching; the popup object is
        // created just below, so it is passed through this holder.
        final PopupWindow[] popupHolder = new PopupWindow[1];
        for (int i = 0; i < ITEMS.length; i++) {
            final Item item = ITEMS[i];
            String label = ctx.getString(item.labelRes);
            if (item.id == TOOL_UPDATES && available != null) {
                label = ctx.getString(R.string.tools_check_updates_available, available);
            }
            // Tapping a row closes the menu first, then dispatches the action —
            // exactly how the reference drawer behaves.
            rows.addView(menuRow(ctx, item, label, () -> {
                if (popupHolder[0] != null) popupHolder[0].dismiss();
                activity.onToolSelected(item.id);
            }));
        }

        ScrollView scroll = new ScrollView(ctx);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.addView(rows, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // Cap the card so all ten rows still scroll on the smallest screens
        // instead of poking off-display.
        int maxCardHeight = Math.round(
                ctx.getResources().getDisplayMetrics().heightPixels * 0.72f);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                Math.min(maxCardHeight, ViewGroup.LayoutParams.WRAP_CONTENT));
        card.addView(scroll, scrollParams);

        // -------------------------------------------------------- popup
        final PopupWindow popup = new PopupWindow(card,
                dp(ctx, 272), ViewGroup.LayoutParams.WRAP_CONTENT, true);
        popupHolder[0] = popup;
        // Transparent backing + outside-touchable lets taps on the dimmed app
        // dismiss the menu; focusable keeps BACK bound to closing it first.
        popup.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        popup.setOutsideTouchable(true);
        popup.setElevation(dp(ctx, 18));
        popup.setAnimationStyle(0); // entrance is driven by the view animator below
        if (!reduceMotion) {
            popup.setExitTransition(makeExitFade(ctx)); // fade-out on row tap / outside tap
        }
        popup.setOnDismissListener(() -> {
            if (reduceMotion) return;
            card.animate().cancel(); // stop a mid-flight entrance before the view dies
        });

        // Enter animation: scale up from the button's corner + fade, quick and
        // springy — or instant when animations are reduced.
        card.setPivotX(cardWidth(ctx) - dp(ctx, 40)); // near the top-right corner
        card.setPivotY(dp(ctx, 12));
        if (!reduceMotion) {
            card.setScaleX(0.82f);
            card.setScaleY(0.82f);
            card.setAlpha(0f);
        }
        popup.showAsDropDown(anchor, dp(ctx, -6), dp(ctx, 2), Gravity.END);
        if (!reduceMotion) {
            card.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(190)
                    .setInterpolator(new OvershootInterpolator(0.9f))
                    .setStartDelay(0)
                    .start();
        }
        gentleHaptic(card);
    }

    /** Convenience for MainActivity's anchored popup. */
    private static int cardWidth(Context ctx) {
        return dp(ctx, 272);
    }

    private static LinearLayout menuRow(Context ctx, Item item, String label,
                                        Runnable action) {
        LinearLayout row = new LinearLayout(ctx);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(dp(ctx, 48)); // ≥48dp touch target
        row.setClickable(true);
        row.setFocusable(true);
        row.setForeground(ripple(ctx));
        row.setPadding(dp(ctx, 12), 0, dp(ctx, 12), 0);

        int iconTint = item.danger
                ? ContextCompat.getColor(ctx, R.color.danger)
                : ContextCompat.getColor(ctx, R.color.menu_icon);
        ImageView icon = new ImageView(ctx);
        icon.setImageResource(item.iconRes);
        icon.setColorFilter(iconTint);
        icon.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(ctx, 21), dp(ctx, 21));
        row.addView(icon, iconParams);

        TextView text = new TextView(ctx);
        text.setText(label);
        text.setTextSize(14.5f);
        text.setTypeface(text.getTypeface(), item.danger ? Typeface.BOLD : Typeface.NORMAL);
        text.setTextColor(item.danger
                ? ContextCompat.getColor(ctx, R.color.danger)
                : ContextCompat.getColor(ctx, R.color.chip_text));
        text.setSingleLine(true);
        LinearLayout.LayoutParams textParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        textParams.leftMargin = dp(ctx, 14);
        row.addView(text, textParams);

        // Update-available dot on the "Check for updates" row, mirroring the
        // badge on the tools button itself.
        if (item.id == TOOL_UPDATES && UpdateChecker.availableVersionName(ctx) != null) {
            View dot = new View(ctx);
            GradientDrawable dotBg = new GradientDrawable();
            dotBg.setShape(GradientDrawable.OVAL);
            dotBg.setColor(ContextCompat.getColor(ctx, R.color.brand_a));
            dot.setBackground(dotBg);
            LinearLayout.LayoutParams dotParams =
                    new LinearLayout.LayoutParams(dp(ctx, 8), dp(ctx, 8));
            dotParams.leftMargin = dp(ctx, 8);
            row.addView(dot, dotParams);
        }

        row.setOnClickListener(v -> {
            gentleHaptic(row);
            action.run();
        });
        return row;
    }

    // ------------------------------------------------------------- utils

    /** Short fade used when the popup closes (API 23+ window transitions). */
    private static android.transition.Fade makeExitFade(Context ctx) {
        android.transition.Fade fade = new android.transition.Fade();
        fade.setDuration(reduceMotion(ctx) ? 0 : 130);
        return fade;
    }

    private static boolean reduceMotion(Context ctx) {
        return ThemeManager.isReduceMotion(ctx);
    }

    private static android.graphics.drawable.Drawable ripple(Context ctx) {
        TypedValue value = new TypedValue();
        ctx.getTheme().resolveAttribute(android.R.attr.selectableItemBackground, value, true);
        return ContextCompat.getDrawable(ctx, value.resourceId);
    }

    private static String versionName(Context ctx) {
        try {
            PackageInfo info = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            return info.versionName == null ? "" : info.versionName;
        } catch (Exception e) {
            return "";
        }
    }

    /** Light, short tick — mirrors the reference app's tap feedback. */
    private static void gentleHaptic(View view) {
        try {
            if (Build.VERSION.SDK_INT >= 27) {
                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP,
                        HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING);
            } else {
                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            }
        } catch (Exception ignored) {
            // Haptics are a nicety — never a crash.
        }
    }

    private static int dp(Context ctx, float value) {
        return Math.round(value * ctx.getResources().getDisplayMetrics().density);
    }
}

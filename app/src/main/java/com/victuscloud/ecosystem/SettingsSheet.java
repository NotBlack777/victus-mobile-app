package com.victuscloud.ecosystem;

import android.app.Dialog;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.text.Editable;
import android.text.InputFilter;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.ContextCompat;

/**
 * Hand-rolled Settings / Appearance bottom sheet — plain Android views only,
 * no extra UI library. It is built when the user taps Tools → Settings and
 * discarded when it closes, so it costs nothing while the app is otherwise in
 * use (no background listeners, no persistent view tree).
 *
 * <p>Every change is written straight to {@link ThemeManager} and applied live
 * (native chrome + the currently loaded WebView page, if it's the bundled home
 * screen) via {@link MainActivity#applyDynamicAccent()} — there is no separate
 * "Save" step and nothing ever needs to reload or recreate the Activity.</p>
 */
final class SettingsSheet {

    interface ColorPicked {
        void onPicked(int color);
    }

    /** Curated palette shown in the color picker, in addition to free hex entry. */
    private static final int[] PALETTE = {
            0xFFC084FC, 0xFF7C3AED, 0xFF4F46E5, 0xFF2F81FF, 0xFF22D3EE, 0xFF13C8A6,
            0xFF22C55E, 0xFFA3E635, 0xFFFACC15, 0xFFFB923C, 0xFFEF4444, 0xFFEC4899,
            0xFFD946EF, 0xFF64748B, 0xFFFFFFFF, 0xFF0B0014,
    };

    private final MainActivity activity;
    private Dialog dialog;

    private View previewBar;
    private TextView previewSubtitle;
    private final View[] presetRings = new View[3];
    private final View[] presetSwatches = new View[3];
    private LinearLayout customBlock;
    private View startSwatch;
    private View endSwatch;
    private LinearLayout endRow;
    private Switch solidSwitch;
    private Switch motionSwitch;
    /** Guards against the solid-switch listener re-firing during programmatic
     *  refreshes (e.g. tapping a different preset), which would otherwise
     *  silently force the preset back to Custom. */
    private boolean suppressSolidListener;

    private SettingsSheet(MainActivity activity) {
        this.activity = activity;
    }

    static void show(MainActivity activity) {
        new SettingsSheet(activity).build();
    }

    // ---------------------------------------------------------------- utils

    private int dp(float v) {
        return Math.round(v * activity.getResources().getDisplayMetrics().density);
    }

    private int color(int resId) {
        return ContextCompat.getColor(activity, resId);
    }

    private String str(int resId) {
        return activity.getString(resId);
    }

    private Drawable ripple() {
        TypedValue value = new TypedValue();
        activity.getTheme().resolveAttribute(android.R.attr.selectableItemBackground, value, true);
        return ContextCompat.getDrawable(activity, value.resourceId);
    }

    private TextView text(String value, float sp, boolean bold, int textColor) {
        TextView tv = new TextView(activity);
        tv.setText(value);
        tv.setTextSize(sp);
        tv.setTextColor(textColor);
        if (bold) tv.setTypeface(tv.getTypeface(), Typeface.BOLD);
        return tv;
    }

    // --------------------------------------------------------------- build

    private void build() {
        dialog = new Dialog(activity, R.style.Theme_Victus_Dialog);
        dialog.setContentView(buildRoot());
        Window w = dialog.getWindow();
        if (w != null) {
            w.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            w.setGravity(Gravity.BOTTOM);
            w.setWindowAnimations(R.style.SettingsSheetAnimation);
            w.setDimAmount(0.5f);
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.width = WindowManager.LayoutParams.MATCH_PARENT;
            lp.height = WindowManager.LayoutParams.WRAP_CONTENT;
            w.setAttributes(lp);
        }
        dialog.show();
    }

    private View buildRoot() {
        ScrollView scroll = new ScrollView(activity);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        scroll.setClipToOutline(false);

        LinearLayout sheet = new LinearLayout(activity);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setPadding(dp(22), dp(12), dp(22), dp(26));

        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color(R.color.sheet_bg));
        bg.setCornerRadii(new float[]{dp(26), dp(26), dp(26), dp(26), 0, 0, 0, 0});
        bg.setStroke(dp(1), color(R.color.sheet_stroke));
        sheet.setBackground(bg);
        sheet.setElevation(dp(16));

        // Grab handle.
        View handle = new View(activity);
        GradientDrawable handleBg = new GradientDrawable();
        handleBg.setColor(color(R.color.sheet_handle));
        handleBg.setCornerRadius(dp(3));
        handle.setBackground(handleBg);
        LinearLayout.LayoutParams handleParams = new LinearLayout.LayoutParams(dp(40), dp(4));
        handleParams.gravity = Gravity.CENTER_HORIZONTAL;
        handleParams.bottomMargin = dp(18);
        sheet.addView(handle, handleParams);

        sheet.addView(text(str(R.string.settings_title), 20, true, color(R.color.title_text)));

        TextView subtitle = text(str(R.string.settings_subtitle), 13, false, color(R.color.error_text));
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        subtitleParams.topMargin = dp(4);
        subtitleParams.bottomMargin = dp(20);
        sheet.addView(subtitle, subtitleParams);

        sheet.addView(buildPreview(), matchTop(0));

        sheet.addView(sectionLabel(str(R.string.settings_theme)), wrapTop(dp(24)));
        sheet.addView(buildPresetRow(), matchTop(dp(10)));

        customBlock = buildCustomBlock();
        customBlock.setVisibility(isCustom() ? View.VISIBLE : View.GONE);
        sheet.addView(customBlock, matchTop(dp(16)));

        sheet.addView(divider(), matchTop(dp(22), dp(1)));
        sheet.addView(buildMotionRow(), matchTop(dp(18)));
        sheet.addView(buildButtonsRow(), matchTop(dp(22)));

        refreshPresetSelection();
        refreshCustomSwatches();
        refreshPreview();

        scroll.addView(sheet, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return scroll;
    }

    private LinearLayout.LayoutParams matchTop(int topMargin) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = topMargin;
        return lp;
    }

    private LinearLayout.LayoutParams matchTop(int topMargin, int heightPx) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, heightPx);
        lp.topMargin = topMargin;
        return lp;
    }

    private LinearLayout.LayoutParams wrapTop(int topMargin) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = topMargin;
        return lp;
    }

    private TextView sectionLabel(String label) {
        TextView tv = text(label.toUpperCase(java.util.Locale.getDefault()), 12, true, color(R.color.error_text));
        tv.setLetterSpacing(0.08f);
        return tv;
    }

    private View divider() {
        View v = new View(activity);
        v.setBackgroundColor(color(R.color.divider));
        return v;
    }

    private boolean isCustom() {
        return ThemeManager.PRESET_CUSTOM.equals(ThemeManager.getPreset(activity));
    }

    // ------------------------------------------------------------- preview

    private View buildPreview() {
        FrameLayout frame = new FrameLayout(activity);
        previewBar = new View(activity);
        GradientDrawable pd = new GradientDrawable();
        pd.setCornerRadius(dp(20));
        previewBar.setBackground(pd);
        frame.addView(previewBar, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(72)));

        LinearLayout labels = new LinearLayout(activity);
        labels.setOrientation(LinearLayout.VERTICAL);
        labels.setPadding(dp(18), 0, dp(18), 0);
        labels.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text(str(R.string.settings_preview_title), 16, true, Color.WHITE);
        previewSubtitle = text(str(R.string.settings_preview_subtitle), 11, false, 0xE6FFFFFF);
        labels.addView(title);
        labels.addView(previewSubtitle);
        frame.addView(labels, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return frame;
    }

    private void refreshPreview() {
        int[] g = ThemeManager.gradient(activity);
        GradientDrawable pd = (GradientDrawable) previewBar.getBackground();
        pd.setOrientation(GradientDrawable.Orientation.TL_BR);
        pd.setColors(g);
        previewBar.invalidate();
    }

    // --------------------------------------------------------------- preset

    private LinearLayout buildPresetRow() {
        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setWeightSum(3f);

        String[] ids = {ThemeManager.PRESET_PURPLE_BLACK, ThemeManager.PRESET_BLUE_TEAL, ThemeManager.PRESET_CUSTOM};
        int[] labels = {R.string.settings_preset_purple_black, R.string.settings_preset_blue_teal, R.string.settings_preset_custom};
        int[][] previewColors = {
                {ThemeManager.DEFAULT_A, ThemeManager.DEFAULT_B, ThemeManager.DEFAULT_C},
                {0xFF2F81FF, 0xFF6D5DFC, 0xFF13C8A6},
                null, // custom: filled from live custom colors
        };

        for (int i = 0; i < ids.length; i++) {
            final String presetId = ids[i];
            final int index = i;

            LinearLayout cell = new LinearLayout(activity);
            cell.setOrientation(LinearLayout.VERTICAL);
            cell.setGravity(Gravity.CENTER);
            cell.setClickable(true);
            cell.setFocusable(true);
            cell.setForeground(ripple());
            cell.setPadding(dp(4), dp(8), dp(4), dp(8));

            FrameLayout ringFrame = new FrameLayout(activity);
            View ring = new View(activity);
            GradientDrawable ringBg = new GradientDrawable();
            ringBg.setShape(GradientDrawable.OVAL);
            ringBg.setStroke(dp(2), color(R.color.brand_a));
            ring.setBackground(ringBg);
            ring.setVisibility(View.INVISIBLE);
            ringFrame.addView(ring, new FrameLayout.LayoutParams(dp(60), dp(60), Gravity.CENTER));
            presetRings[index] = ring;

            View swatch = new View(activity);
            GradientDrawable swatchBg = new GradientDrawable();
            swatchBg.setShape(GradientDrawable.OVAL);
            swatchBg.setOrientation(GradientDrawable.Orientation.TL_BR);
            if (previewColors[i] != null) {
                swatchBg.setColors(previewColors[i]);
            }
            swatchBg.setStroke(dp(1), color(R.color.swatch_stroke));
            swatch.setBackground(swatchBg);
            ringFrame.addView(swatch, new FrameLayout.LayoutParams(dp(50), dp(50), Gravity.CENTER));
            presetSwatches[index] = swatch;

            cell.addView(ringFrame, new LinearLayout.LayoutParams(dp(60), dp(60)));

            TextView label = text(str(labels[i]), 12, true, color(R.color.chip_text));
            LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            labelParams.topMargin = dp(6);
            label.setGravity(Gravity.CENTER);
            cell.addView(label, labelParams);

            cell.setOnClickListener(v -> {
                ThemeManager.setPreset(activity, presetId);
                customBlock.setVisibility(ThemeManager.PRESET_CUSTOM.equals(presetId) ? View.VISIBLE : View.GONE);
                refreshPresetSelection();
                refreshCustomSwatches();
                refreshPreview();
                activity.applyDynamicAccent();
            });

            LinearLayout.LayoutParams cellParams = new LinearLayout.LayoutParams(
                    0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            row.addView(cell, cellParams);
        }
        return row;
    }

    private void refreshPresetSelection() {
        String active = ThemeManager.getPreset(activity);
        String[] ids = {ThemeManager.PRESET_PURPLE_BLACK, ThemeManager.PRESET_BLUE_TEAL, ThemeManager.PRESET_CUSTOM};
        for (int i = 0; i < ids.length; i++) {
            presetRings[i].setVisibility(ids[i].equals(active) ? View.VISIBLE : View.INVISIBLE);
        }
    }

    // --------------------------------------------------------------- custom

    private LinearLayout buildCustomBlock() {
        LinearLayout block = new LinearLayout(activity);
        block.setOrientation(LinearLayout.VERTICAL);

        LinearLayout startRow = colorRow(str(R.string.settings_start_color), true);
        block.addView(startRow, matchTop(0));

        LinearLayout solidRow = new LinearLayout(activity);
        solidRow.setOrientation(LinearLayout.HORIZONTAL);
        solidRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView solidLabel = text(str(R.string.settings_solid_color), 14, false, color(R.color.chip_text));
        LinearLayout.LayoutParams solidLabelParams = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        solidRow.addView(solidLabel, solidLabelParams);
        solidSwitch = new Switch(activity);
        solidSwitch.setChecked(ThemeManager.isCustomSolid(activity));
        solidSwitch.setThumbTintList(ColorStateList.valueOf(color(R.color.brand_a)));
        solidSwitch.setOnCheckedChangeListener((btn, checked) -> {
            if (suppressSolidListener) return;
            ThemeManager.setCustomColors(activity, ThemeManager.getCustomA(activity),
                    ThemeManager.getCustomB(activity), checked);
            refreshPresetSelection();
            endRow.setVisibility(checked ? View.GONE : View.VISIBLE);
            refreshPreview();
            activity.applyDynamicAccent();
        });
        solidRow.addView(solidSwitch);
        block.addView(solidRow, matchTop(dp(12)));

        endRow = colorRow(str(R.string.settings_end_color), false);
        endRow.setVisibility(ThemeManager.isCustomSolid(activity) ? View.GONE : View.VISIBLE);
        block.addView(endRow, matchTop(dp(4)));

        return block;
    }

    private LinearLayout colorRow(String label, boolean isStart) {
        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(8), 0, dp(8));

        TextView tv = text(label, 14, false, color(R.color.chip_text));
        LinearLayout.LayoutParams tvParams = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        row.addView(tv, tvParams);

        View swatch = new View(activity);
        GradientDrawable swatchBg = new GradientDrawable();
        swatchBg.setShape(GradientDrawable.OVAL);
        swatchBg.setStroke(dp(1), color(R.color.swatch_stroke));
        swatch.setBackground(swatchBg);
        swatch.setClickable(true);
        swatch.setForeground(ripple());
        if (isStart) startSwatch = swatch; else endSwatch = swatch;

        swatch.setOnClickListener(v -> {
            int current = isStart ? ThemeManager.getCustomA(activity) : ThemeManager.getCustomB(activity);
            pickColor(current, picked -> {
                int a = isStart ? picked : ThemeManager.getCustomA(activity);
                int b = isStart ? ThemeManager.getCustomB(activity) : picked;
                ThemeManager.setCustomColors(activity, a, b, ThemeManager.isCustomSolid(activity));
                refreshCustomSwatches();
                refreshPreview();
                activity.applyDynamicAccent();
            });
        });
        row.addView(swatch, new LinearLayout.LayoutParams(dp(36), dp(36)));
        return row;
    }

    private void refreshCustomSwatches() {
        ((GradientDrawable) startSwatch.getBackground()).setColor(ThemeManager.getCustomA(activity));
        ((GradientDrawable) endSwatch.getBackground()).setColor(ThemeManager.getCustomB(activity));
        ((GradientDrawable) presetSwatches[2].getBackground())
                .setColors(new int[]{ThemeManager.getCustomA(activity), ThemeManager.getCustomB(activity)});
        suppressSolidListener = true;
        solidSwitch.setChecked(ThemeManager.isCustomSolid(activity));
        suppressSolidListener = false;
        endRow.setVisibility(ThemeManager.isCustomSolid(activity) ? View.GONE : View.VISIBLE);
    }

    // --------------------------------------------------------------- motion

    private LinearLayout buildMotionRow() {
        LinearLayout wrap = new LinearLayout(activity);
        wrap.setOrientation(LinearLayout.VERTICAL);
        wrap.addView(sectionLabel(str(R.string.settings_motion_title)), wrapTop(0));

        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        LinearLayout textCol = new LinearLayout(activity);
        textCol.setOrientation(LinearLayout.VERTICAL);
        textCol.addView(text(str(R.string.settings_reduce_motion), 14, true, color(R.color.chip_text)));
        TextView desc = text(str(R.string.settings_reduce_motion_desc), 12, false, color(R.color.error_text));
        LinearLayout.LayoutParams descParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        descParams.topMargin = dp(2);
        textCol.addView(desc, descParams);
        LinearLayout.LayoutParams textColParams = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        textColParams.rightMargin = dp(12);
        row.addView(textCol, textColParams);

        motionSwitch = new Switch(activity);
        motionSwitch.setChecked(ThemeManager.isReduceMotion(activity));
        motionSwitch.setThumbTintList(ColorStateList.valueOf(color(R.color.brand_a)));
        motionSwitch.setOnCheckedChangeListener((btn, checked) -> {
            ThemeManager.setReduceMotion(activity, checked);
            activity.applyDynamicAccent();
        });
        row.addView(motionSwitch);

        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        rowParams.topMargin = dp(12);
        wrap.addView(row, rowParams);
        return wrap;
    }

    // -------------------------------------------------------------- footer

    private LinearLayout buildButtonsRow() {
        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        TextView reset = text(str(R.string.settings_reset), 14, true, color(R.color.error_text));
        reset.setGravity(Gravity.CENTER);
        reset.setMinHeight(dp(48));
        reset.setClickable(true);
        reset.setForeground(ripple());
        reset.setPadding(dp(12), 0, dp(12), 0);
        reset.setOnClickListener(v -> {
            ThemeManager.resetToDefault(activity);
            refreshPresetSelection();
            refreshCustomSwatches();
            customBlock.setVisibility(View.GONE);
            motionSwitch.setChecked(false);
            refreshPreview();
            activity.applyDynamicAccent();
            Toast.makeText(activity, R.string.settings_reset_done, Toast.LENGTH_SHORT).show();
        });
        LinearLayout.LayoutParams resetParams = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        row.addView(reset, resetParams);

        TextView done = text(str(R.string.settings_done), 15, true, Color.WHITE);
        done.setGravity(Gravity.CENTER);
        done.setMinHeight(dp(48));
        GradientDrawable doneBg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{color(R.color.brand_a), color(R.color.brand_b)});
        doneBg.setCornerRadius(dp(16));
        done.setBackground(doneBg);
        done.setPadding(dp(28), 0, dp(28), 0);
        done.setOnClickListener(v -> dialog.dismiss());
        LinearLayout.LayoutParams doneParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        doneParams.leftMargin = dp(12);
        row.addView(done, doneParams);
        return row;
    }

    // --------------------------------------------------------- color picker

    private void pickColor(int initialColor, ColorPicked callback) {
        Dialog picker = new Dialog(activity, R.style.Theme_Victus_Dialog);
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(22), dp(22), dp(22), dp(20));
        GradientDrawable rootBg = new GradientDrawable();
        rootBg.setColor(color(R.color.sheet_bg));
        rootBg.setCornerRadius(dp(24));
        root.setBackground(rootBg);

        root.addView(text(str(R.string.color_picker_title), 17, true, color(R.color.title_text)));

        // Plain wrapped rows (6 swatches each) — no GridLayout needed, keeps the
        // whole picker built from the same basic widgets as everywhere else.
        final int columns = 6;
        LinearLayout grid = new LinearLayout(activity);
        grid.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams gridParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        gridParams.topMargin = dp(16);
        final View[] previewHolder = new View[1];
        final EditText[] hexHolder = new EditText[1];

        LinearLayout currentRow = null;
        for (int i = 0; i < PALETTE.length; i++) {
            final int paletteColor = PALETTE[i];
            if (i % columns == 0) {
                currentRow = new LinearLayout(activity);
                currentRow.setOrientation(LinearLayout.HORIZONTAL);
                LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                if (i > 0) rowParams.topMargin = dp(8);
                grid.addView(currentRow, rowParams);
            }
            View swatch = new View(activity);
            GradientDrawable swatchBg = new GradientDrawable();
            swatchBg.setShape(GradientDrawable.OVAL);
            swatchBg.setColor(paletteColor);
            swatchBg.setStroke(dp(1), color(R.color.swatch_stroke));
            swatch.setBackground(swatchBg);
            swatch.setClickable(true);
            swatch.setForeground(ripple());
            swatch.setOnClickListener(v -> {
                callback.onPicked(paletteColor | 0xFF000000);
                picker.dismiss();
            });
            LinearLayout.LayoutParams cellParams = new LinearLayout.LayoutParams(dp(40), dp(40));
            cellParams.setMargins(i % columns == 0 ? 0 : dp(8), 0, 0, 0);
            currentRow.addView(swatch, cellParams);
        }
        root.addView(grid, gridParams);

        LinearLayout hexRow = new LinearLayout(activity);
        hexRow.setOrientation(LinearLayout.HORIZONTAL);
        hexRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams hexRowParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        hexRowParams.topMargin = dp(18);

        View swatchPreview = new View(activity);
        GradientDrawable previewBg = new GradientDrawable();
        previewBg.setShape(GradientDrawable.OVAL);
        previewBg.setColor(initialColor);
        previewBg.setStroke(dp(1), color(R.color.swatch_stroke));
        swatchPreview.setBackground(previewBg);
        previewHolder[0] = swatchPreview;
        hexRow.addView(swatchPreview, new LinearLayout.LayoutParams(dp(36), dp(36)));

        EditText hexInput = new EditText(activity);
        hexInput.setInputType(InputType.TYPE_CLASS_TEXT);
        hexInput.setFilters(new InputFilter[]{new InputFilter.LengthFilter(7)});
        hexInput.setText(ThemeManager.hex(initialColor));
        hexInput.setTextColor(color(R.color.title_text));
        hexInput.setHintTextColor(color(R.color.error_text));
        hexInput.setHint(str(R.string.color_picker_hex_hint));
        hexInput.setSingleLine(true);
        hexHolder[0] = hexInput;
        LinearLayout.LayoutParams hexInputParams = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        hexInputParams.leftMargin = dp(12);
        hexInput.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { }
            @Override public void afterTextChanged(Editable s) {
                Integer parsed = parseHex(s.toString());
                if (parsed != null) {
                    ((GradientDrawable) previewHolder[0].getBackground()).setColor(parsed);
                }
            }
        });
        hexRow.addView(hexInput, hexInputParams);
        root.addView(hexRow, hexRowParams);

        LinearLayout buttonRow = new LinearLayout(activity);
        buttonRow.setOrientation(LinearLayout.HORIZONTAL);
        buttonRow.setGravity(Gravity.END);
        LinearLayout.LayoutParams buttonRowParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        buttonRowParams.topMargin = dp(18);

        TextView cancel = text(str(R.string.color_picker_cancel), 14, true, color(R.color.error_text));
        cancel.setPadding(dp(14), dp(12), dp(14), dp(12));
        cancel.setClickable(true);
        cancel.setForeground(ripple());
        cancel.setOnClickListener(v -> picker.dismiss());
        buttonRow.addView(cancel);

        TextView apply = text(str(R.string.color_picker_apply), 14, true, Color.WHITE);
        GradientDrawable applyBg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{color(R.color.brand_a), color(R.color.brand_b)});
        applyBg.setCornerRadius(dp(14));
        apply.setBackground(applyBg);
        apply.setPadding(dp(20), dp(12), dp(20), dp(12));
        LinearLayout.LayoutParams applyParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        applyParams.leftMargin = dp(10);
        apply.setOnClickListener(v -> {
            Integer parsed = parseHex(hexHolder[0].getText().toString());
            if (parsed == null) {
                Toast.makeText(activity, R.string.color_picker_invalid_hex, Toast.LENGTH_SHORT).show();
                return;
            }
            callback.onPicked(parsed);
            picker.dismiss();
        });
        buttonRow.addView(apply, applyParams);
        root.addView(buttonRow, buttonRowParams);

        picker.setContentView(root);
        Window w = picker.getWindow();
        if (w != null) {
            w.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.width = Math.round(activity.getResources().getDisplayMetrics().widthPixels * 0.88f);
            w.setAttributes(lp);
        }
        picker.show();
    }

    private static Integer parseHex(String raw) {
        if (raw == null) return null;
        String s = raw.trim();
        if (s.startsWith("#")) s = s.substring(1);
        if (!s.matches("[0-9A-Fa-f]{6}")) return null;
        try {
            return (int) (0xFF000000 | Long.parseLong(s, 16));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}

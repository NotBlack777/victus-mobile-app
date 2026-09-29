package com.victuscloud.ecosystem;

import android.app.Dialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.ContextCompat;

import org.json.JSONObject;

/**
 * Tools → Device &amp; compatibility: what this app needs from the device, checked
 * at runtime on the device it is actually running on.
 *
 * <p>Written for the AOSP family — GrapheneOS, CalyxOS, LineageOS, /e/OS and the
 * rest — where "it works on my Pixel" is not a guarantee. Each row is a fact read
 * from the platform ({@link DeviceCompat}) rather than a claim, and the two rows
 * that can genuinely fail (encrypted storage and reaching the panel) can be tested
 * on the spot instead of being asserted.</p>
 *
 * <p>Nothing here gates the app: every row can read "Limited" and the app still
 * runs. The point is that the user knows what they have and what to do about it,
 * rather than seeing a blank screen or a failed sign-in with no explanation.</p>
 */
final class CompatSheet {

    private Dialog dialog;
    private LinearLayout rows;
    private TextView connectionResult;
    private TextView testButton;

    private CompatSheet() {
    }

    static void show(MainActivity activity) {
        new CompatSheet().open(activity);
    }

    private void open(MainActivity activity) {
        dialog = new Dialog(activity, R.style.Theme_Victus_Dialog);
        dialog.setContentView(buildRoot(activity));
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(0));
            window.setWindowAnimations(R.style.SettingsSheetAnimation);
            WindowManager.LayoutParams params = window.getAttributes();
            params.width = WindowManager.LayoutParams.MATCH_PARENT;
            params.height = WindowManager.LayoutParams.WRAP_CONTENT;
            params.gravity = Gravity.BOTTOM;
            window.setAttributes(params);
        }
        dialog.setOnDismissListener(ignored -> dialog = null);
        dialog.show();
    }

    private View buildRoot(MainActivity activity) {
        ScrollView scroll = new ScrollView(activity);
        scroll.setFillViewport(true);

        LinearLayout sheet = new LinearLayout(activity);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setBackground(rounded(color(activity, R.color.sheet_bg), dp(activity, 26),
                color(activity, R.color.sheet_stroke)));
        int pad = dp(activity, 20);
        sheet.setPadding(pad, dp(activity, 10), pad, dp(activity, 18));

        View handle = new View(activity);
        LinearLayout.LayoutParams handleParams =
                new LinearLayout.LayoutParams(dp(activity, 42), dp(activity, 4));
        handleParams.gravity = Gravity.CENTER_HORIZONTAL;
        handleParams.bottomMargin = dp(activity, 14);
        handle.setLayoutParams(handleParams);
        handle.setBackground(rounded(color(activity, R.color.sheet_handle), dp(activity, 2), 0));
        sheet.addView(handle);

        sheet.addView(text(activity, str(activity, R.string.compat_title), 20, true,
                color(activity, R.color.title_text)));
        TextView subtitle = text(activity, str(activity, R.string.compat_subtitle), 12, false,
                color(activity, R.color.chip_text));
        LinearLayout.LayoutParams subtitleParams = wrapTop(activity, dp(activity, 4));
        subtitleParams.bottomMargin = dp(activity, 16);
        subtitle.setLayoutParams(subtitleParams);
        sheet.addView(subtitle);

        rows = new LinearLayout(activity);
        rows.setOrientation(LinearLayout.VERTICAL);
        sheet.addView(rows);

        // A community AOSP build is not a problem — say so instead of leaving the
        // user wondering whether their ROM is the reason something looks odd.
        if (DeviceCompat.rom().custom) {
            TextView note = text(activity,
                    str(activity, R.string.compat_custom_rom_note), 11, false,
                    color(activity, R.color.chip_text));
            note.setBackground(rounded(0x1422C55E, dp(activity, 12), 0x3322C55E));
            note.setPadding(dp(activity, 12), dp(activity, 10), dp(activity, 12), dp(activity, 10));
            LinearLayout.LayoutParams noteParams = matchTop(activity, dp(activity, 14));
            note.setLayoutParams(noteParams);
            sheet.addView(note);
        }

        sheet.addView(sectionLabel(activity, R.string.compat_section_panel, dp(activity, 18)));
        sheet.addView(buildConnectionBlock(activity));
        sheet.addView(buttons(activity));
        populate(activity);

        scroll.addView(sheet, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        return scroll;
    }

    /** Reads the platform and fills the rows; called once when the sheet opens. */
    private void populate(MainActivity activity) {
        if (rows == null) return;
        rows.removeAllViews();

        String signedInKind = activity.signedInKind();
        JSONObject report;
        try {
            report = new JSONObject(DeviceCompat.report(activity, signedInKind));
        } catch (Exception malformed) {
            report = new JSONObject();
        }

        rows.addView(sectionLabel(activity, R.string.compat_section_os, 0));
        rows.addView(row(activity, str(activity, R.string.compat_row_build),
                report.optString("romLine"), report.optBoolean("romCustom", false) ? null : "ok"));
        rows.addView(row(activity, str(activity, R.string.compat_row_device),
                report.optString("manufacturer") + " " + report.optString("model"), null));

        rows.addView(sectionLabel(activity, R.string.compat_section_engine, dp(activity, 16)));
        boolean webViewAvailable = report.optBoolean("webViewAvailable", true);
        String provider = report.optString("webViewPackage");
        String providerVersion = report.optString("webViewVersion");
        rows.addView(row(activity, str(activity, R.string.compat_row_webview),
                webViewAvailable
                        ? provider + (providerVersion.isEmpty() ? "" : " · " + providerVersion)
                        : str(activity, R.string.webview_missing_title),
                webViewAvailable ? "ok" : "warn"));
        boolean gms = report.optBoolean("playServices", false);
        rows.addView(row(activity, str(activity, R.string.compat_row_google),
                str(activity, gms ? R.string.compat_gms_present : R.string.compat_gms_absent),
                gms ? "ok" : null));

        rows.addView(sectionLabel(activity, R.string.compat_section_security, dp(activity, 16)));
        boolean keystore = report.optBoolean("keystoreOk", false);
        rows.addView(row(activity, str(activity, R.string.compat_row_keystore),
                str(activity, keystore
                        ? R.string.compat_keystore_ok : R.string.compat_keystore_limited),
                keystore ? "ok" : "warn"));
        rows.addView(row(activity, str(activity, R.string.compat_row_session),
                sessionLabel(activity, signedInKind), null));
    }

    private String sessionLabel(MainActivity activity, String kind) {
        if (kind == null) return str(activity, R.string.compat_session_none);
        if ("api_key".equals(kind)) return str(activity, R.string.compat_session_key);
        return str(activity, R.string.compat_session_cookie);
    }

    // ------------------------------------------------------- connection test

    private View buildConnectionBlock(MainActivity activity) {
        LinearLayout block = new LinearLayout(activity);
        block.setOrientation(LinearLayout.VERTICAL);

        testButton = text(activity, str(activity, R.string.compat_test_connection), 13, true,
                color(activity, R.color.brand_a));
        testButton.setGravity(Gravity.CENTER);
        testButton.setPadding(0, dp(activity, 12), 0, dp(activity, 12));
        testButton.setBackground(rounded(color(activity, R.color.menu_bg), dp(activity, 14),
                color(activity, R.color.menu_stroke)));
        testButton.setClickable(true);
        testButton.setOnClickListener(v -> runConnectionTest(activity));
        block.addView(testButton);

        connectionResult = text(activity, "", 11, false, color(activity, R.color.chip_text));
        LinearLayout.LayoutParams resultParams = wrapTop(activity, dp(activity, 8));
        connectionResult.setLayoutParams(resultParams);
        connectionResult.setVisibility(View.GONE);
        block.addView(connectionResult);
        return block;
    }

    private void runConnectionTest(MainActivity activity) {
        if (testButton == null) return;
        testButton.setText(R.string.compat_test_running);
        testButton.setEnabled(false);

        // Reuses the updater's IO thread rather than spawning one per tap.
        UpdateChecker.IO.execute(() -> {
            String raw = DeviceCompat.testPanelConnection();
            activity.runOnUiThread(() -> {
                if (dialog == null || !dialog.isShowing()) return;
                testButton.setText(R.string.compat_test_connection);
                testButton.setEnabled(true);
                if (connectionResult == null) return;

                try {
                    JSONObject json = new JSONObject(raw);
                    boolean ok = json.optBoolean("ok", false);
                    connectionResult.setText(json.optString("detail")
                            + (ok ? " · " + json.optLong("ms") + " ms" : ""));
                    connectionResult.setTextColor(ok ? 0xFF34D399 : 0xFFF87171);
                    connectionResult.setVisibility(View.VISIBLE);
                } catch (Exception malformed) {
                    connectionResult.setVisibility(View.GONE);
                }
            });
        });
    }

    // ------------------------------------------------------------- buttons

    private View buttons(MainActivity activity) {
        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams rowParams = matchTop(activity, dp(activity, 20));
        row.setLayoutParams(rowParams);

        TextView copy = text(activity, str(activity, R.string.compat_copy_report), 13, false,
                color(activity, R.color.chip_text));
        copy.setGravity(Gravity.CENTER);
        copy.setPadding(0, dp(activity, 12), 0, dp(activity, 12));
        copy.setBackground(rounded(color(activity, R.color.menu_bg), dp(activity, 14),
                color(activity, R.color.menu_stroke)));
        copy.setClickable(true);
        copy.setOnClickListener(v -> copyReport(activity));
        LinearLayout.LayoutParams copyParams =
                new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        copy.setLayoutParams(copyParams);
        row.addView(copy);

        TextView done = text(activity, str(activity, R.string.compat_done), 13, true,
                color(activity, R.color.brand_a));
        done.setGravity(Gravity.CENTER);
        done.setPadding(0, dp(activity, 12), 0, dp(activity, 12));
        done.setBackground(rounded(color(activity, R.color.chip_bg), dp(activity, 14), 0));
        done.setClickable(true);
        done.setOnClickListener(v -> dismiss());
        LinearLayout.LayoutParams doneParams =
                new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        doneParams.leftMargin = dp(activity, 10);
        done.setLayoutParams(doneParams);
        row.addView(done);
        return row;
    }

    /** Copies the report so it can be pasted into a support ticket as-is. */
    private void copyReport(MainActivity activity) {
        StringBuilder text = new StringBuilder("Victus Cloud — device & compatibility\n");
        try {
            JSONObject report = new JSONObject(DeviceCompat.report(activity, activity.signedInKind()));
            for (java.util.Iterator<String> keys = report.keys(); keys.hasNext(); ) {
                String key = keys.next();
                text.append(key).append(": ").append(report.opt(key)).append('\n');
            }
        } catch (Exception malformed) {
            text.append("(report unavailable)\n");
        }
        if (connectionResult != null && connectionResult.getVisibility() == View.VISIBLE) {
            text.append("panelTest: ").append(connectionResult.getText()).append('\n');
        }

        try {
            ClipboardManager clipboard =
                    (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
            if (clipboard != null) {
                clipboard.setPrimaryClip(ClipData.newPlainText("Victus compatibility", text.toString()));
                Toast.makeText(activity, R.string.compat_report_copied, Toast.LENGTH_SHORT).show();
            }
        } catch (Exception ignored) {
            // A clipboard the ROM refuses to serve is not worth a crash.
        }
    }

    private void dismiss() {
        if (dialog != null) dialog.dismiss();
    }

    // -------------------------------------------------------------- helpers

    private TextView sectionLabel(MainActivity activity, int stringRes, int topMargin) {
        TextView label = text(activity, str(activity, stringRes), 11, true,
                color(activity, R.color.chip_text));
        label.setLetterSpacing(0.08f);
        LinearLayout.LayoutParams params = wrapTop(activity, topMargin);
        params.bottomMargin = dp(activity, 8);
        label.setLayoutParams(params);
        return label;
    }

    /**
     * One label/value row.
     *
     * @param state {@code "ok"}, {@code "warn"} or null for no pill
     */
    private View row(MainActivity activity, String label, String value, String state) {
        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(activity, 12), dp(activity, 10), dp(activity, 12), dp(activity, 10));
        row.setBackground(rounded(color(activity, R.color.menu_bg), dp(activity, 14),
                color(activity, R.color.menu_stroke)));
        LinearLayout.LayoutParams rowParams = matchTop(activity, dp(activity, 8));
        row.setLayoutParams(rowParams);

        LinearLayout labels = new LinearLayout(activity);
        labels.setOrientation(LinearLayout.VERTICAL);
        labels.addView(text(activity, label, 10, true, color(activity, R.color.chip_text)));
        TextView valueView = text(activity, value, 12, false, color(activity, R.color.title_text));
        labels.addView(valueView);
        LinearLayout.LayoutParams labelsParams =
                new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        labels.setLayoutParams(labelsParams);
        row.addView(labels);

        if (state != null) {
            boolean ok = "ok".equals(state);
            TextView pill = text(activity,
                    str(activity, ok ? R.string.compat_ok : R.string.compat_warn), 10, true,
                    ok ? 0xFF34D399 : 0xFFFBBF24);
            pill.setPadding(dp(activity, 8), dp(activity, 4), dp(activity, 8), dp(activity, 4));
            pill.setBackground(rounded(ok ? 0x1A34D399 : 0x1AFBBF24, dp(activity, 8), 0));
            row.addView(pill);
        }
        return row;
    }

    private TextView text(MainActivity activity, String value, int sizeSp, boolean bold, int textColor) {
        TextView view = new TextView(activity);
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp);
        view.setTextColor(textColor);
        if (bold) view.setTypeface(Typeface.DEFAULT_BOLD);
        return view;
    }

    private static GradientDrawable rounded(int fill, int radius, int stroke) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(fill);
        shape.setCornerRadius(radius);
        if (stroke != 0) shape.setStroke(1, stroke);
        return shape;
    }

    private static int color(MainActivity activity, int resId) {
        return ContextCompat.getColor(activity, resId);
    }

    private static String str(MainActivity activity, int resId) {
        return activity.getString(resId);
    }

    private static int dp(MainActivity activity, float value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }

    private LinearLayout.LayoutParams matchTop(MainActivity activity, int topMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = topMargin;
        return params;
    }

    private LinearLayout.LayoutParams wrapTop(MainActivity activity, int topMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = topMargin;
        return params;
    }
}

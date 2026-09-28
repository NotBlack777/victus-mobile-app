package com.victuscloud.ecosystem;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.ContextCompat;

import java.io.File;

import rikka.shizuku.Shizuku;

/**
 * In-app updater UI.
 *
 * <p>Checks the configured update source, shows what is available, and installs
 * through whichever privileged route the device actually has — Shizuku, root, or
 * the stock package installer. Built from plain widgets like
 * {@link SettingsSheet}, so it follows the active theme without any extra
 * dependency.</p>
 */
final class UpdateSheet {

    private static final int SHIZUKU_PERMISSION_CODE = 4001;

    private enum State {
        CHECKING, UP_TO_DATE, AVAILABLE, DOWNLOADING, READY, INSTALLING, DONE, ERROR
    }

    // ------------------------------------------------------------------ state

    private final Activity activity;
    private Dialog dialog;

    private State state = State.CHECKING;
    private String statusDetail = "";
    private UpdateManifest manifest;
    private File apk;
    private boolean handedToPackageInstaller;

    private UpdateInstaller.Backend backend = UpdateInstaller.Backend.PACKAGE_INSTALLER;
    private boolean shizukuAvailable;
    private boolean shizukuGranted;
    private boolean rootAvailable;
    private boolean packageInstallerAllowed;

    private TextView statusTitle;
    private TextView statusDetailView;
    private TextView installedValue;
    private TextView availableValue;
    private TextView changelogTitle;
    private TextView changelogView;
    private TextView progressView;
    private TextView sourceView;
    private final TextView[] backendChips = new TextView[3];
    private TextView primaryButton;

    private final Shizuku.OnRequestPermissionResultListener permissionListener =
            (requestCode, grantResult) -> {
                if (requestCode != SHIZUKU_PERMISSION_CODE) return;
                shizukuGranted = grantResult == android.content.pm.PackageManager.PERMISSION_GRANTED;
                if (shizukuGranted) selectBackend(UpdateInstaller.Backend.SHIZUKU);
                else statusDetail = "Shizuku permission denied — pick another install method.";
                render();
            };

    private UpdateSheet(Activity activity) {
        this.activity = activity;
    }

    static void show(Activity activity) {
        new UpdateSheet(activity).open();
    }

    // ------------------------------------------------------------------- build

    private void open() {
        dialog = new Dialog(activity, R.style.Theme_Victus_Dialog);
        dialog.setContentView(buildRoot());
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(Color.TRANSPARENT));
            window.setGravity(Gravity.BOTTOM);
            window.setWindowAnimations(R.style.SettingsSheetAnimation);
            window.setDimAmount(0.5f);
            WindowManager.LayoutParams params = window.getAttributes();
            params.width = WindowManager.LayoutParams.MATCH_PARENT;
            params.height = WindowManager.LayoutParams.WRAP_CONTENT;
            window.setAttributes(params);
        }
        dialog.setOnDismissListener(d -> {
            try {
                Shizuku.removeRequestPermissionResultListener(permissionListener);
            } catch (Throwable ignored) {
                // Shizuku may be gone; nothing to unregister then.
            }
        });
        dialog.show();

        try {
            Shizuku.addRequestPermissionResultListener(permissionListener);
        } catch (Throwable ignored) {
            // Shizuku not running: the Shizuku install method is simply unavailable.
        }

        refreshAvailability();
        checkForUpdate();
    }

    private View buildRoot() {
        ScrollView scroll = new ScrollView(activity);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);

        LinearLayout sheet = new LinearLayout(activity);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setPadding(dp(22), dp(12), dp(22), dp(24));

        GradientDrawable background = new GradientDrawable();
        background.setColor(color(R.color.sheet_bg));
        background.setCornerRadii(new float[]{dp(26), dp(26), dp(26), dp(26), 0, 0, 0, 0});
        background.setStroke(dp(1), color(R.color.sheet_stroke));
        sheet.setBackground(background);
        sheet.setElevation(dp(16));

        LinearLayout handle = new LinearLayout(activity);
        handle.setBackground(rounded(color(R.color.sheet_handle), dp(2)));
        LinearLayout.LayoutParams handleParams = new LinearLayout.LayoutParams(dp(44), dp(4));
        handleParams.gravity = Gravity.CENTER_HORIZONTAL;
        handleParams.bottomMargin = dp(18);
        sheet.addView(handle, handleParams);

        sheet.addView(text(activity.getString(R.string.update_title), 22, true, color(R.color.title_text)));
        sheet.addView(spaced(text(activity.getString(R.string.update_subtitle), 12, false,
                color(R.color.error_text)), 0, 16, 0, 0));

        // Status card ---------------------------------------------------------
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(14), dp(16), dp(14));
        card.setBackground(rounded(color(R.color.chip_bg), dp(16)));
        statusTitle = text("", 15, true, color(R.color.title_text));
        statusDetailView = text("", 12, false, color(R.color.error_text));
        card.addView(statusTitle);
        card.addView(spaced(statusDetailView, 0, 6, 0, 0));
        sheet.addView(card);

        // Versions row --------------------------------------------------------
        LinearLayout versions = new LinearLayout(activity);
        versions.setOrientation(LinearLayout.HORIZONTAL);
        versions.setPadding(0, dp(16), 0, 0);
        installedValue = text("—", 14, true, color(R.color.title_text));
        availableValue = text("—", 14, true, color(R.color.title_text));
        versions.addView(versionColumn(activity.getString(R.string.update_installed), installedValue), weight());
        versions.addView(versionColumn(activity.getString(R.string.update_available), availableValue), weight());
        sheet.addView(versions);

        // Changelog -----------------------------------------------------------
        changelogTitle = spaced(sectionLabel(activity.getString(R.string.update_changelog)), 0, 22, 0, 8);
        sheet.addView(changelogTitle);
        changelogView = text("", 12, false, color(R.color.error_text));
        ScrollView changelogScroll = new ScrollView(activity);
        changelogScroll.setVerticalScrollBarEnabled(false);
        LinearLayout.LayoutParams changelogParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        changelogParams.bottomMargin = dp(6);
        changelogScroll.setLayoutParams(changelogParams);
        changelogScroll.addView(changelogView);
        sheet.addView(changelogScroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(140)));

        // Install method ------------------------------------------------------
        sheet.addView(spaced(sectionLabel(activity.getString(R.string.update_method)), 0, 20, 0, 8));
        LinearLayout methods = new LinearLayout(activity);
        methods.setOrientation(LinearLayout.HORIZONTAL);
        String[] labels = activity.getResources().getStringArray(R.array.update_methods);
        for (int i = 0; i < labels.length; i++) {
            final int index = i;
            TextView chip = text(labels[i], 11, true, color(R.color.chip_text));
            chip.setGravity(Gravity.CENTER);
            chip.setPadding(dp(8), dp(12), dp(8), dp(12));
            chip.setOnClickListener(v -> selectBackend(UpdateInstaller.Backend.values()[index]));
            backendChips[i] = chip;
            methods.addView(chip, weightWithEndMargin(i < labels.length - 1 ? dp(8) : 0));
        }
        sheet.addView(methods);

        // Source --------------------------------------------------------------
        sourceView = spaced(text("", 10, false, color(R.color.error_text)), 0, 14, 0, 0);
        sourceView.setOnClickListener(v -> editSource());
        sheet.addView(sourceView);

        // Progress + actions ---------------------------------------------------
        progressView = spaced(text("", 12, true, color(R.color.brand_a)), 0, 14, 0, 0);
        sheet.addView(progressView);

        LinearLayout actions = new LinearLayout(activity);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setPadding(0, dp(14), 0, 0);

        TextView close = text(activity.getString(R.string.update_close), 13, true, color(R.color.error_text));
        close.setGravity(Gravity.CENTER);
        close.setPadding(dp(18), dp(12), dp(18), dp(12));
        close.setOnClickListener(v -> dismiss());
        actions.addView(close);

        primaryButton = text("", 14, true, Color.WHITE);
        primaryButton.setGravity(Gravity.CENTER);
        primaryButton.setPadding(dp(20), dp(14), dp(20), dp(14));
        primaryButton.setOnClickListener(v -> onPrimaryAction());
        LinearLayout.LayoutParams primaryParams = new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        primaryParams.leftMargin = dp(10);
        actions.addView(primaryButton, primaryParams);
        sheet.addView(actions);

        scroll.addView(sheet);
        return scroll;
    }

    private View versionColumn(String label, TextView value) {
        LinearLayout column = new LinearLayout(activity);
        column.setOrientation(LinearLayout.VERTICAL);
        column.addView(text(label.toUpperCase(java.util.Locale.getDefault()), 10, true, color(R.color.error_text)));
        column.addView(spaced(value, 0, 3, 0, 0));
        return column;
    }

    // ------------------------------------------------------------------ actions

    private void checkForUpdate() {
        final String source = UpdateChecker.sourceUrl(activity);
        state = State.CHECKING;
        statusDetail = activity.getString(R.string.update_checking);
        render();

        UpdateChecker.IO.execute(() -> {
            try {
                UpdateManifest fetched = UpdateChecker.fetch(source);
                boolean newer = fetched.isNewerThan(versionCode(activity), ownVersionName());
                // Feed the tools-menu badge, so a manual check and the silent
                // launch check never disagree with each other.
                UpdateChecker.rememberAvailable(
                        activity.getApplicationContext(), newer ? fetched : null);
                UpdateChecker.MAIN.post(() -> {
                    manifest = fetched;
                    apk = null;
                    handedToPackageInstaller = false;
                    state = newer ? State.AVAILABLE : State.UP_TO_DATE;
                    statusDetail = newer
                            ? activity.getString(R.string.update_found)
                            : activity.getString(R.string.update_none);
                    render();
                });
            } catch (Exception e) {
                fail(describe(e));
            }
        });
    }

    private void downloadUpdate() {
        if (manifest == null) return;
        state = State.DOWNLOADING;
        statusDetail = activity.getString(R.string.update_downloading);
        render();

        UpdateChecker.IO.execute(() -> {
            try {
                File downloaded = UpdateChecker.download(activity, manifest, (read, total) -> {
                    String text = total > 0
                            ? UpdateCommands.humanSize(read) + " / " + UpdateCommands.humanSize(total)
                            : UpdateCommands.humanSize(read);
                    UpdateChecker.MAIN.post(() -> progressView.setText(text));
                });
                // Refuse anything not signed by the key that signed the installed app.
                UpdateChecker.requireSameSigner(activity, downloaded);
                UpdateChecker.MAIN.post(() -> {
                    apk = downloaded;
                    state = State.READY;
                    statusDetail = appIsInsecureBuild()
                            ? activity.getString(R.string.update_verified_debug)
                            : activity.getString(R.string.update_verified);
                    progressView.setText("");
                    render();
                });
            } catch (Exception e) {
                fail(describe(e));
            }
        });
    }

    private void installUpdate() {
        if (apk == null) return;
        switch (backend) {
            case SHIZUKU:
                if (!shizukuGranted) {
                    requestShizukuPermission();
                    return;
                }
                state = State.INSTALLING;
                statusDetail = activity.getString(R.string.update_installing) + " (Shizuku · "
                        + UpdateInstaller.shizukuIdentity() + ")";
                render();
                try {
                    // Binds on the main thread; the install itself runs on a worker.
                    UpdateInstaller.installViaShizuku(activity, apk, installCallback);
                } catch (Throwable t) {
                    installCallback.onResult(false,
                            "Shizuku install unavailable on this device: " + t.getClass().getSimpleName());
                }
                break;

            case ROOT:
                state = State.INSTALLING;
                statusDetail = activity.getString(R.string.update_installing) + " (root)";
                render();
                UpdateChecker.IO.execute(() ->
                        UpdateInstaller.installAsRoot(apk, installCallback));
                break;

            case PACKAGE_INSTALLER:
            default:
                state = State.INSTALLING;
                statusDetail = activity.getString(R.string.update_installing);
                render();
                UpdateInstaller.installWithPackageInstaller(activity, apk, installCallback);
                break;
        }
    }

    private final UpdateInstaller.Callback installCallback = new UpdateInstaller.Callback() {
        @Override
        public void onStage(String stage) {
            UpdateChecker.MAIN.post(() -> {
                statusDetail = stage;
                render();
            });
        }

        @Override
        public void onResult(boolean success, String message) {
            UpdateChecker.MAIN.post(() -> {
                if (success) {
                    state = State.DONE;
                    handedToPackageInstaller = backend == UpdateInstaller.Backend.PACKAGE_INSTALLER;
                    if (!handedToPackageInstaller) UpdateChecker.clearDownloads(activity);
                    // Whatever was pending has now been installed.
                    UpdateChecker.forgetAvailability(activity);
                    statusDetail = message;
                } else if ("needs-unknown-sources".equals(message)) {
                    state = State.ERROR;
                    statusDetail = activity.getString(R.string.update_needs_unknown_sources);
                    try {
                        activity.startActivity(UpdateInstaller.unknownSourcesSettingsIntent(activity));
                    } catch (Exception ignored) {
                        // Some devices have no such settings screen; the message still explains it.
                    }
                } else {
                    state = State.ERROR;
                    statusDetail = message;
                }
                render();
            });
        }
    };

    private void onPrimaryAction() {
        switch (state) {
            case AVAILABLE:
                downloadUpdate();
                break;
            case READY:
                installUpdate();
                break;
            case DONE:
                activity.finish();
                break;
            case ERROR:
            case UP_TO_DATE:
            default:
                checkForUpdate();
                break;
        }
    }

    private void selectBackend(UpdateInstaller.Backend wanted) {
        if (!isBackendUsable(wanted)) {
            statusDetail = reasonUnusable(wanted);
            render();
            return;
        }
        backend = wanted;
        statusDetail = "";
        render();
    }

    private void requestShizukuPermission() {
        try {
            if (Shizuku.isPreV11()) {
                statusDetail = activity.getString(R.string.update_shizuku_old);
                render();
                return;
            }
            if (Shizuku.shouldShowRequestPermissionRationale()) {
                statusDetail = activity.getString(R.string.update_shizuku_denied);
                render();
                return;
            }
            statusDetail = activity.getString(R.string.update_shizuku_asking);
            render();
            UpdateInstaller.requestShizukuPermission(SHIZUKU_PERMISSION_CODE);
        } catch (Throwable e) {
            statusDetail = activity.getString(R.string.update_shizuku_missing);
            render();
        }
    }

    private void editSource() {
        final EditText input = new EditText(activity);
        input.setText(UpdateChecker.sourceUrl(activity));
        input.setSingleLine(true);
        input.setTextSize(12);
        new AlertDialog.Builder(activity)
                .setTitle(R.string.update_source_title)
                .setMessage(R.string.update_source_message)
                .setView(input)
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.update_source_save, (d, which) -> {
                    String url = input.getText().toString().trim();
                    if (!UpdateCommands.isAcceptableUrl(url)) {
                        toast(activity.getString(R.string.update_source_invalid));
                        return;
                    }
                    UpdateChecker.setSourceUrl(activity, url);
                    apk = null;
                    manifest = null;
                    checkForUpdate();
                })
                .show();
    }

    // ------------------------------------------------------------------ presence

    private void refreshAvailability() {
        shizukuAvailable = UpdateInstaller.isShizukuAvailable();
        shizukuGranted = shizukuAvailable && UpdateInstaller.hasShizukuPermission();
        packageInstallerAllowed = UpdateInstaller.canUsePackageInstaller(activity);
        render();

        UpdateChecker.IO.execute(() -> {
            boolean root = UpdateInstaller.isRootAvailable();
            UpdateChecker.MAIN.post(() -> {
                rootAvailable = root;
                if (backend == UpdateInstaller.Backend.PACKAGE_INSTALLER) {
                    if (shizukuGranted) backend = UpdateInstaller.Backend.SHIZUKU;
                    else if (root) backend = UpdateInstaller.Backend.ROOT;
                }
                render();
            });
        });
    }

    private boolean isBackendUsable(UpdateInstaller.Backend candidate) {
        switch (candidate) {
            case SHIZUKU:
                return shizukuAvailable;
            case ROOT:
                return rootAvailable;
            case PACKAGE_INSTALLER:
            default:
                return true;
        }
    }

    private String reasonUnusable(UpdateInstaller.Backend wanted) {
        switch (wanted) {
            case SHIZUKU:
                return activity.getString(R.string.update_shizuku_missing);
            case ROOT:
                return activity.getString(R.string.update_root_missing);
            default:
                return "";
        }
    }

    // ------------------------------------------------------------------- render

    private void render() {
        if (dialog == null || !dialog.isShowing()) return;

        installedValue.setText(ownVersionName() + " (" + versionCode(activity) + ")");
        availableValue.setText(manifest == null
                ? "—"
                : (manifest.versionName == null ? "?" : manifest.versionName)
                + (manifest.versionCode > 0 ? " (" + manifest.versionCode + ")" : "")
                + (manifest.sizeBytes > 0 ? " · " + UpdateCommands.humanSize(manifest.sizeBytes) : ""));

        statusTitle.setText(titleForState());
        statusDetailView.setText(statusDetail);

        boolean hasChangelog = manifest != null && manifest.changelog != null;
        changelogTitle.setVisibility(hasChangelog ? View.VISIBLE : View.GONE);
        changelogView.setText(hasChangelog ? manifest.changelog : "");

        renderBackendChips();

        sourceView.setText(activity.getString(R.string.update_source_label, shorten(UpdateChecker.sourceUrl(activity))));

        primaryButton.setText(primaryLabel());
        primaryButton.setEnabled(state != State.CHECKING && state != State.DOWNLOADING
                && state != State.INSTALLING);
        primaryButton.setBackground(rounded(color(R.color.brand_a), dp(14)));
        primaryButton.setAlpha(primaryButton.isEnabled() ? 1f : 0.6f);
    }

    private void renderBackendChips() {
        UpdateInstaller.Backend[] values = UpdateInstaller.Backend.values();
        for (int i = 0; i < backendChips.length; i++) {
            TextView chip = backendChips[i];
            if (chip == null) continue;
            UpdateInstaller.Backend candidate = values[i];
            boolean usable = isBackendUsable(candidate);
            boolean selected = backend == candidate;

            boolean granted = candidate != UpdateInstaller.Backend.SHIZUKU || shizukuGranted;
            int background = !usable || !granted
                    ? color(R.color.chip_bg)
                    : (selected ? color(R.color.brand_a) : color(R.color.chip_bg));
            chip.setBackground(rounded(background, dp(14)));
            chip.setTextColor(!usable || !granted
                    ? color(R.color.error_text)
                    : (selected ? Color.WHITE : color(R.color.chip_text)));

            String label = activity.getResources().getStringArray(R.array.update_methods)[i];
            String note;
            if (!usable) note = reasonUnusableShort(candidate);
            else if (!granted) note = activity.getString(R.string.update_method_grant);
            else if (candidate == UpdateInstaller.Backend.SHIZUKU) note = UpdateInstaller.shizukuIdentity();
            else if (candidate == UpdateInstaller.Backend.ROOT) note = activity.getString(R.string.update_method_root);
            else note = packageInstallerAllowed
                    ? activity.getString(R.string.update_method_installer)
                    : activity.getString(R.string.update_method_installer_locked);
            chip.setText(label + "\n" + note);
        }
    }

    private String reasonUnusableShort(UpdateInstaller.Backend wanted) {
        switch (wanted) {
            case SHIZUKU:
                return activity.getString(R.string.update_method_none);
            case ROOT:
                return activity.getString(R.string.update_method_none);
            default:
                return "";
        }
    }

    private String titleForState() {
        switch (state) {
            case CHECKING:
                return activity.getString(R.string.update_state_checking);
            case UP_TO_DATE:
                return activity.getString(R.string.update_state_current);
            case AVAILABLE:
                return activity.getString(R.string.update_state_available);
            case DOWNLOADING:
                return activity.getString(R.string.update_state_downloading);
            case READY:
                return activity.getString(R.string.update_state_ready);
            case INSTALLING:
                return activity.getString(R.string.update_state_installing);
            case DONE:
                return activity.getString(R.string.update_state_done);
            case ERROR:
            default:
                return activity.getString(R.string.update_state_error);
        }
    }

    private String primaryLabel() {
        switch (state) {
            case AVAILABLE:
                return activity.getString(R.string.update_action_download,
                        manifest != null && manifest.sizeBytes > 0
                                ? UpdateCommands.humanSize(manifest.sizeBytes) : "");
            case READY:
                if (backend == UpdateInstaller.Backend.SHIZUKU && !shizukuGranted) {
                    return activity.getString(R.string.update_action_grant);
                }
                return activity.getString(R.string.update_action_install);
            case DONE:
                return activity.getString(R.string.update_action_close);
            case CHECKING:
            case DOWNLOADING:
            case INSTALLING:
                return activity.getString(R.string.update_action_working);
            case ERROR:
                return activity.getString(R.string.retry);
            case UP_TO_DATE:
            default:
                return activity.getString(R.string.update_action_check);
        }
    }

    private void fail(String message) {
        UpdateChecker.MAIN.post(() -> {
            state = State.ERROR;
            statusDetail = message;
            progressView.setText("");
            render();
        });
    }

    private void dismiss() {
        if (dialog != null && dialog.isShowing()) dialog.dismiss();
    }

    // -------------------------------------------------------------------- misc

    private int versionCode(Context context) {
        try {
            return context.getPackageManager()
                    .getPackageInfo(context.getPackageName(), 0).versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    private String ownVersionName() {
        try {
            return activity.getPackageManager()
                    .getPackageInfo(activity.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    private boolean appIsInsecureBuild() {
        return (activity.getApplicationInfo().flags
                & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private void toast(String message) {
        Toast.makeText(activity, message, Toast.LENGTH_SHORT).show();
    }

    private static String describe(Exception e) {
        String message = e.getMessage();
        return message == null || message.isEmpty() ? e.getClass().getSimpleName() : message;
    }

    private static String shorten(String url) {
        if (url == null) return "";
        String trimmed = url.replace("https://", "").replace("http://", "");
        return trimmed.length() > 46 ? trimmed.substring(0, 43) + "…" : trimmed;
    }

    private int color(int resId) {
        return ContextCompat.getColor(activity, resId);
    }

    private int dp(float value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }

    private GradientDrawable rounded(int fill, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(radius);
        return drawable;
    }

    private TextView text(String value, float sp, boolean bold, int textColor) {
        TextView view = new TextView(activity);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(textColor);
        if (bold) view.setTypeface(view.getTypeface(), Typeface.BOLD);
        return view;
    }

    private TextView sectionLabel(String label) {
        return text(label.toUpperCase(java.util.Locale.getDefault()), 11, true, color(R.color.error_text));
    }

    private TextView spaced(TextView view, int left, int top, int right, int bottom) {
        view.setPadding(dp(left), dp(top), dp(right), dp(bottom));
        return view;
    }

    private LinearLayout.LayoutParams weight() {
        return new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
    }

    private LinearLayout.LayoutParams weightWithEndMargin(int margin) {
        LinearLayout.LayoutParams params = weight();
        params.rightMargin = margin;
        return params;
    }
}

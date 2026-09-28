package com.victuscloud.ecosystem;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.ParcelFileDescriptor;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

import rikka.shizuku.Shizuku;

/**
 * The three ways an update can be installed, in order of how little the user has
 * to do:
 *
 * <ol>
 *   <li>{@link Backend#SHIZUKU} — a {@link UpdatePrivilegedService} user service
 *       runs {@code pm install} as the shell (ADB) identity via Shizuku, so the
 *       install needs no root and no "install unknown apps" prompt.</li>
 *   <li>{@link Backend#ROOT} — the same install script through {@code su}.</li>
 *   <li>{@link Backend#PACKAGE_INSTALLER} — the stock Android package installer,
 *       handed a content:// URI and confirmed by the user. Always available, and
 *       the fallback when neither privilege source is present.</li>
 * </ol>
 *
 * <p>Shizuku and root both stream the APK over stdin into
 * {@code /data/local/tmp} before installing, because a shell identity cannot read
 * the app's private cache directory.</p>
 */
final class UpdateInstaller {

    enum Backend {
        SHIZUKU, ROOT, PACKAGE_INSTALLER
    }

    interface Callback {
        /** Reports a stage for the UI. Called on the caller's chosen thread. */
        void onStage(String stage);

        void onResult(boolean success, String message);
    }

    /** Bump when UpdatePrivilegedService changes, so Shizuku restarts it. */
    private static final int SERVICE_VERSION = 1;

    private UpdateInstaller() {
    }

    // -------------------------------------------------------------- detection

    /** Shizuku installed *and* its binder alive. */
    static boolean isShizukuAvailable() {
        try {
            return Shizuku.pingBinder() && !Shizuku.isPreV11();
        } catch (Throwable e) {
            return false;
        }
    }

    static boolean hasShizukuPermission() {
        try {
            return Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED;
        } catch (Throwable e) {
            return false;
        }
    }

    static void requestShizukuPermission(int requestCode) {
        Shizuku.requestPermission(requestCode);
    }

    /**
     * Shizuku can be started as ADB (uid 2000) or root (uid 0). Reported in the
     * UI so the user knows which privilege an install will actually use.
     */
    static String shizukuIdentity() {
        try {
            int uid = Shizuku.getUid();
            if (uid == 0) return "root";
            if (uid == 2000) return "adb shell";
            return "uid " + uid;
        } catch (Throwable e) {
            return "unavailable";
        }
    }

    /** Blocking; call off the main thread. */
    static boolean isRootAvailable() {
        try {
            Process process = new ProcessBuilder("su", "-c", "id")
                    .redirectErrorStream(true)
                    .start();
            String output = drainOutput(process);
            process.waitFor();
            return output.contains("uid=0");
        } catch (Throwable e) {
            return false;
        }
    }

    /**
     * True when Android will let us hand an APK to the package installer:
     * the REQUEST_INSTALL_PACKAGES permission must be declared, and on Android 8+
     * the user must have enabled "install unknown apps" for this app.
     */
    static boolean canUsePackageInstaller(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return context.getPackageManager().canRequestPackageInstalls();
    }

    static Intent unknownSourcesSettingsIntent(Context context) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
        intent.setData(Uri.parse("package:" + context.getPackageName()));
        return intent;
    }

    // ------------------------------------------------------------------- root

    /** Blocking; call off the main thread. */
    static boolean installAsRoot(File apk, Callback callback) {
        try {
            return runInstallScript(
                    new ProcessBuilder("su", "-c", UpdateCommands.shellScript()).redirectErrorStream(true),
                    apk, callback);
        } catch (Exception e) {
            callback.onResult(false, "Root install failed: " + describe(e));
            return false;
        }
    }

    // ---------------------------------------------------------------- shizuku

    /**
     * Binds a user service that Shizuku runs as shell/root, streams the APK to it
     * over a pipe, and reports the {@code pm install} result.
     *
     * <p>Call from the main thread: {@link Shizuku#bindUserService} is delivered
     * through the main looper. The binder call itself — which blocks until
     * {@code pm install} finishes — is dispatched to a worker thread so the UI
     * never freezes, and results are posted back to the main thread.</p>
     */
    static void installViaShizuku(Context context, File apk, Callback callback) {
        final Shizuku.UserServiceArgs args = new Shizuku.UserServiceArgs(
                new ComponentName(context.getApplicationContext(), UpdatePrivilegedService.class))
                .daemon(false)
                .processNameSuffix("update")
                .debuggable(isDebuggable(context))
                .version(SERVICE_VERSION);

        final boolean[] finished = {false};
        // The connection has to unbind itself once the install finishes, so it
        // reaches itself through a holder instead of the not-yet-assigned local.
        final ServiceConnection[] connectionHolder = new ServiceConnection[1];

        ServiceConnection connection = new ServiceConnection() {
            @Override
            public void onServiceConnected(ComponentName name, IBinder binder) {
                // Blocking binder call: never on the main thread.
                UpdateChecker.IO.execute(() -> {
                    String result;
                    try {
                        IUpdateService service = IUpdateService.Stub.asInterface(binder);
                        try (ParcelFileDescriptor fd = ParcelFileDescriptor.open(
                                apk, ParcelFileDescriptor.MODE_READ_ONLY)) {
                            result = service.install(fd, apk.getName());
                        }
                    } catch (Throwable e) {
                        result = "Shizuku install failed: " + describe(e);
                    }

                    final String message = result == null
                            ? "No result from the install service" : result;
                    final boolean success = message.startsWith("OK");

                    UpdateChecker.MAIN.post(() -> {
                        finished[0] = true;
                        unbindUserService(args, connectionHolder[0]);
                        callback.onResult(success, message);
                    });
                });
            }

            @Override
            public void onServiceDisconnected(ComponentName name) {
                UpdateChecker.MAIN.post(() -> {
                    if (finished[0]) return; // already reported the install result
                    finished[0] = true;
                    callback.onResult(false, "The privileged install service disconnected");
                });
            }
        };

        connectionHolder[0] = connection;

        callback.onStage("Connecting to Shizuku…");
        try {
            Shizuku.bindUserService(args, connection);
        } catch (Throwable e) {
            callback.onResult(false, "Could not reach Shizuku: " + describe(e));
        }
    }

    private static void unbindUserService(Shizuku.UserServiceArgs args, ServiceConnection connection) {
        if (connection == null) return;
        try {
            Shizuku.unbindUserService(args, connection, true);
        } catch (Throwable ignored) {
            // The service may already be gone; nothing to clean up in that case.
        }
    }

    // --------------------------------------------------------- package installer

    /**
     * Hands the APK to the stock installer. The user confirms on a system screen,
     * so there is no reliable result callback — success here means "handed over".
     */
    static void installWithPackageInstaller(Activity activity, File apk, Callback callback) {
        if (!canUsePackageInstaller(activity)) {
            callback.onResult(false, "needs-unknown-sources");
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(
                    activity, activity.getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                            | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
            callback.onResult(true, "Confirm the install in the package installer, then reopen the app.");
        } catch (Exception e) {
            callback.onResult(false, "Could not open the package installer: " + describe(e));
        }
    }

    // ------------------------------------------------------------------ shared

    /** Runs a privileged {@code sh} that reads the APK from stdin. */
    private static boolean runInstallScript(ProcessBuilder builder, File apk, Callback callback) {
        Process process = null;
        try {
            callback.onStage("Staging APK…");
            process = builder.start();

            try (InputStream in = new FileInputStream(apk);
                 OutputStream out = process.getOutputStream()) {
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = in.read(buffer)) != -1) {
                    out.write(buffer, 0, count);
                }
                out.flush();
            } // closing the stream signals EOF to `cat`

            callback.onStage("Installing…");
            String output = drainOutput(process);
            process.waitFor();

            if (UpdateCommands.isSuccessOutput(output)) {
                callback.onResult(true, "Update installed. The app will close so the new version can start.");
                return true;
            }
            String detail = UpdateCommands.summarize(output);
            callback.onResult(false, detail.isEmpty() ? "The package manager rejected the update" : detail);
            return false;
        } catch (Exception e) {
            callback.onResult(false, "Install failed: " + describe(e));
            return false;
        } finally {
            if (process != null) process.destroy();
        }
    }

    private static String drainOutput(Process process) {
        StringBuilder sb = new StringBuilder();
        try (InputStream in = process.getInputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = in.read(buffer)) != -1) {
                sb.append(new String(buffer, 0, count));
            }
        } catch (Exception ignored) {
            // Output is only used for the message shown in the UI.
        }
        return sb.toString();
    }

    private static boolean isDebuggable(Context context) {
        return (context.getApplicationInfo().flags
                & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private static String describe(Throwable e) {
        String message = e.getMessage();
        return message == null || message.isEmpty() ? e.getClass().getSimpleName() : message;
    }
}

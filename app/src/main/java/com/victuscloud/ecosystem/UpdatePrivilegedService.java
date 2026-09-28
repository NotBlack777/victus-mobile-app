package com.victuscloud.ecosystem;

import android.os.ParcelFileDescriptor;

import java.io.InputStream;
import java.io.OutputStream;

/**
 * The privileged half of the Shizuku install path.
 *
 * <p>Shizuku instantiates this class in its own process, running as the shell
 * (ADB) or root identity — so {@code pm install} here is equivalent to
 * {@code adb shell pm install}. The APK arrives as a {@link ParcelFileDescriptor}
 * and is piped into the staging file over stdin, because the shell identity cannot
 * read this app's private cache directory.</p>
 *
 * <p>It must stay free of Android UI/resource dependencies: a user service process
 * has no usable {@code Context} and none of this module's resources.</p>
 */
public class UpdatePrivilegedService extends IUpdateService.Stub {

    @Override
    public String install(ParcelFileDescriptor apk, String fileName) {
        if (apk == null) return "No APK stream was provided";

        Process process = null;
        try {
            process = new ProcessBuilder(UpdateCommands.SH, "-c", UpdateCommands.shellScript())
                    .redirectErrorStream(true)
                    .start();

            try (InputStream in = new ParcelFileDescriptor.AutoCloseInputStream(apk);
                 OutputStream out = process.getOutputStream()) {
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = in.read(buffer)) != -1) {
                    out.write(buffer, 0, count);
                }
                out.flush();
            } // closing stdout is what lets `cat` finish, which is what starts the install

            String output = drain(process);
            process.waitFor();

            if (UpdateCommands.isSuccessOutput(output)) return "OK";
            String detail = UpdateCommands.summarize(output);
            return detail.isEmpty() ? "The package manager rejected the update" : detail;
        } catch (Throwable t) {
            String message = t.getMessage();
            return "Install failed: " + (message == null || message.isEmpty()
                    ? t.getClass().getSimpleName() : message);
        } finally {
            if (process != null) process.destroy();
        }
    }

    @Override
    public String identify() {
        int uid = android.os.Process.myUid();
        if (uid == 0) return "root";
        if (uid == 2000) return "adb shell";
        return "uid " + uid;
    }

    private static String drain(Process process) {
        StringBuilder sb = new StringBuilder();
        try (InputStream in = process.getInputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = in.read(buffer)) != -1) {
                sb.append(new String(buffer, 0, count));
            }
        } catch (Throwable ignored) {
            // The output is only used for the message shown in the UI.
        }
        return sb.toString();
    }
}

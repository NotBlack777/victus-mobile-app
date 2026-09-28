package com.victuscloud.ecosystem;

import java.net.URI;
import java.util.Locale;

/**
 * Pure helpers shared by every install backend: URL validation, the shell script
 * that stages + installs an APK from a privileged identity, and small formatting
 * utilities. No Android imports, so this is covered by JVM unit tests.
 *
 * <p>Shell paths are absolute ({@code /system/bin/sh}, {@code /system/bin/pm})
 * because a Shizuku user-service process does not inherit the shell's
 * {@code PATH}.</p>
 */
final class UpdateCommands {

    /** Only ever staged into a fixed path so no untrusted string reaches the shell. */
    static final String TMP_APK = "/data/local/tmp/victus-update.apk";

    static final String SH = "/system/bin/sh";
    static final String PM = "/system/bin/pm";
    static final String CMD = "/system/bin/cmd";

    private UpdateCommands() {
    }

    /**
     * Updater sources must be https (no cleartext, matching the app's network
     * security config), must carry a host, and must not embed credentials.
     */
    static boolean isAcceptableUrl(String url) {
        if (url == null) return false;
        String trimmed = url.trim();
        if (!trimmed.toLowerCase(Locale.US).startsWith("https://")) return false;
        try {
            URI uri = new URI(trimmed);
            String host = uri.getHost();
            return host != null && !host.isEmpty() && uri.getUserInfo() == null;
        } catch (Exception e) {
            return false;
        }
    }

    /** Reads the APK from stdin into the shared staging path. */
    static String stageScript() {
        return "cat > " + TMP_APK;
    }

    /**
     * Installs the staged APK with the platform package manager, then removes it.
     *
     * <p>{@code pm} is the legacy entry point, {@code cmd package} the modern one;
     * whichever the device has is used. The cleanup runs regardless of the install
     * result, so a failed attempt never leaves a stale APK behind.</p>
     */
    static String installAndCleanupScript() {
        return "{ " + PM + " install -r " + TMP_APK
                + " || " + CMD + " package install -r " + TMP_APK + "; }"
                + "; rm -f " + TMP_APK;
    }

    /**
     * The whole privileged operation in one shell invocation, so the APK only ever
     * has to be streamed once: stage from stdin (and only then install), install,
     * clean up.
     */
    static String shellScript() {
        return stageScript() + " && " + installAndCleanupScript();
    }

    /** {@code pm}/{@code cmd} print "Success" on success and "Failure [ … ]" otherwise. */
    static boolean isSuccessOutput(String output) {
        return output != null && output.contains("Success");
    }

    /** First meaningful line of a command's output, for display in the UI. */
    static String summarize(String output) {
        if (output == null) return "";
        for (String rawLine : output.split("\\r?\\n")) {
            String line = rawLine.trim();
            if (!line.isEmpty()) return line;
        }
        return "";
    }

    /** Keeps generated file names free of separators and shell metacharacters. */
    static String sanitizeFileName(String name) {
        if (name == null) return "victus-update.apk";
        String cleaned = name.trim().replaceAll("[^A-Za-z0-9._-]", "-");
        while (cleaned.startsWith("-") || cleaned.startsWith(".")) {
            cleaned = cleaned.substring(1);
        }
        if (cleaned.isEmpty()) return "victus-update.apk";
        return cleaned.length() > 64 ? cleaned.substring(0, 64) : cleaned;
    }

    static String humanSize(long bytes) {
        if (bytes <= 0) return "unknown size";
        if (bytes < 1024) return bytes + " B";
        double kb = bytes / 1024d;
        if (kb < 1024) return String.format(Locale.US, "%.0f KB", kb);
        return String.format(Locale.US, "%.1f MB", kb / 1024d);
    }
}

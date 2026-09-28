package com.victuscloud.ecosystem;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Network side of the in-app updater: fetch the update manifest, download the
 * APK, and refuse anything that isn't provably ours.
 *
 * <p>Three gates protect the install:</p>
 * <ol>
 *   <li>the source URL must be https (see {@link UpdateCommands#isAcceptableUrl}),</li>
 *   <li>when the manifest publishes a {@code sha256}, the download must match it,</li>
 *   <li>the downloaded APK must be signed with the <em>same certificate as the
 *       running app</em> — this is the check that actually matters, and it holds
 *       even for sources that publish no hash at all.</li>
 * </ol>
 */
final class UpdateChecker {

    interface Progress {
        void onProgress(long bytesRead, long totalBytes);
    }

    /** Populated once by Gradle from the project's git remote. */
    private static final String DEFAULT_SOURCE_FALLBACK =
            "https://api.github.com/repos/NotBlack777/victus-mobile-app/releases/latest";

    private static final String PREFS = "victus_updater";
    private static final String KEY_SOURCE_URL = "source_url";

    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final int MAX_MANIFEST_BYTES = 512 * 1024;

    static final ExecutorService IO = Executors.newSingleThreadExecutor();
    static final Handler MAIN = new Handler(Looper.getMainLooper());

    private UpdateChecker() {
    }

    // ------------------------------------------------------------------ source

    static String sourceUrl(Context context) {
        SharedPreferences prefs = prefs(context);
        String configured = prefs.getString(KEY_SOURCE_URL, null);
        if (configured != null && !configured.trim().isEmpty()) return configured.trim();
        String fromResources = context.getString(R.string.update_manifest_url).trim();
        return fromResources.isEmpty() ? DEFAULT_SOURCE_FALLBACK : fromResources;
    }

    static void setSourceUrl(Context context, String url) {
        prefs(context).edit().putString(KEY_SOURCE_URL, url == null ? "" : url.trim()).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ------------------------------------------------------------------ fetch

    /** Blocking — call from {@link #IO}. */
    static UpdateManifest fetch(String sourceUrl) throws Exception {
        if (!UpdateCommands.isAcceptableUrl(sourceUrl)) {
            throw new Exception("Update source must be a plain https URL");
        }
        HttpURLConnection conn = open(sourceUrl);
        try {
            int status = conn.getResponseCode();
            if (status >= 400) throw new Exception("Update source returned HTTP " + status);
            byte[] body = readAll(conn.getInputStream(), MAX_MANIFEST_BYTES);
            return UpdateManifest.parse(new String(body, StandardCharsets.UTF_8));
        } finally {
            conn.disconnect();
        }
    }

    // --------------------------------------------------------------- download

    /**
     * Downloads the APK into the app cache, verifying the published sha256 on the
     * fly. Blocking — call from {@link #IO}.
     */
    static File download(Context context, UpdateManifest manifest, Progress progress) throws Exception {
        if (!UpdateCommands.isAcceptableUrl(manifest.apkUrl)) {
            throw new Exception("Update URL must be a plain https URL");
        }

        File dir = updatesDir(context);
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        String fileName = UpdateCommands.sanitizeFileName(
                "victus-" + (manifest.versionName == null ? "update" : manifest.versionName) + ".apk");
        File target = new File(dir, fileName);
        File partial = new File(dir, fileName + ".part");

        HttpURLConnection conn = open(manifest.apkUrl);
        try {
            int status = conn.getResponseCode();
            if (status >= 400) throw new Exception("Download failed with HTTP " + status);

            long expectedTotal = manifest.sizeBytes > 0 ? manifest.sizeBytes : conn.getContentLength();
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long read = 0;

            try (InputStream in = new BufferedInputStream(conn.getInputStream());
                 FileOutputStream out = new FileOutputStream(partial)) {
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = in.read(buffer)) != -1) {
                    out.write(buffer, 0, count);
                    digest.update(buffer, 0, count);
                    read += count;
                    if (progress != null) progress.onProgress(read, expectedTotal);
                }
            }

            if (manifest.sizeBytes > 0 && partial.length() != manifest.sizeBytes) {
                throw new Exception("Download incomplete (" + partial.length() + " of " + manifest.sizeBytes + " bytes)");
            }

            if (manifest.sha256 != null) {
                String actual = toHex(digest.digest());
                if (!actual.equalsIgnoreCase(manifest.sha256)) {
                    throw new Exception("Checksum mismatch — download discarded");
                }
            }

            //noinspection ResultOfMethodCallIgnored
            partial.renameTo(target);
            return target;
        } catch (Exception e) {
            //noinspection ResultOfMethodCallIgnored
            partial.delete();
            throw e;
        } finally {
            conn.disconnect();
        }
    }

    /**
     * The decisive trust check: the candidate APK must carry the same signing
     * certificate as the installed app. A package with a different signer can
     * never be installed over us anyway, and this stops us from even asking.
     */
    static void requireSameSigner(Context context, File apk) throws Exception {
        PackageManager pm = context.getPackageManager();
        PackageInfo candidate = pm.getPackageArchiveInfo(
                apk.getAbsolutePath(),
                Build.VERSION.SDK_INT >= 28
                        ? PackageManager.GET_SIGNING_CERTIFICATES
                        : PackageManager.GET_SIGNATURES);
        if (candidate == null) {
            throw new Exception("The downloaded file is not a valid APK");
        }

        PackageInfo installed = pm.getPackageInfo(
                context.getPackageName(),
                Build.VERSION.SDK_INT >= 28
                        ? PackageManager.GET_SIGNING_CERTIFICATES
                        : PackageManager.GET_SIGNATURES);

        String[] candidateSigners = signers(candidate);
        String[] installedSigners = signers(installed);
        if (candidateSigners.length == 0 || installedSigners.length == 0) {
            throw new Exception("Could not read the APK signature");
        }
        for (String signer : candidateSigners) {
            if (contains(installedSigners, signer)) return;
        }
        throw new Exception("Signature mismatch — this update was not signed by the installed app's key");
    }

    @SuppressWarnings("deprecation")
    private static String[] signers(PackageInfo info) throws Exception {
        MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
        Signature[] signatures;
        if (Build.VERSION.SDK_INT >= 28) {
            SigningInfo signing = info.signingInfo;
            if (signing == null) return new String[0];
            signatures = signing.hasMultipleSigners()
                    ? signing.getApkContentsSigners()
                    : signing.getSigningCertificateHistory();
        } else {
            signatures = info.signatures;
        }
        if (signatures == null) return new String[0];

        String[] result = new String[signatures.length];
        for (int i = 0; i < signatures.length; i++) {
            result[i] = toHex(sha256.digest(signatures[i].toByteArray()));
        }
        Arrays.sort(result);
        return result;
    }

    private static boolean contains(String[] values, String wanted) {
        for (String value : values) {
            if (value.equals(wanted)) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ files

    static File updatesDir(Context context) {
        return new File(context.getCacheDir(), "updates");
    }

    /** Drops previously downloaded APKs (called after a successful install). */
    static void clearDownloads(Context context) {
        File[] files = updatesDir(context).listFiles();
        if (files == null) return;
        for (File file : files) {
            //noinspection ResultOfMethodCallIgnored
            file.delete();
        }
    }

    // ------------------------------------------------------------------ utils

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setInstanceFollowRedirects(true); // GitHub release URLs redirect to the asset CDN
        conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
        conn.setReadTimeout(READ_TIMEOUT_MS);
        conn.setRequestProperty("Accept", "application/vnd.github+json, application/json");
        // api.github.com rejects requests without a User-Agent.
        conn.setRequestProperty("User-Agent", "VictusCloud-Updater");
        return conn;
    }

    private static byte[] readAll(InputStream in, int limit) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (InputStream stream = in) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = stream.read(buffer)) != -1) {
                out.write(buffer, 0, count);
                if (out.size() > limit) throw new IOException("Update manifest is too large");
            }
        }
        return out.toByteArray();
    }

    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format(Locale.US, "%02x", b));
        }
        return sb.toString();
    }
}

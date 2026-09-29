package com.victuscloud.ecosystem;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.webkit.CookieManager;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Background file downloader used by {@code MainActivity.createDownloadListener()}.
 *
 * <ul>
 *   <li>All I/O runs off the main thread — taps never stall.</li>
 *   <li>API 29+: writes through {@link MediaStore.Downloads} (scoped storage, no
 *       permission required) into {@code Downloads/VictusCloud}, using
 *       {@code IS_PENDING} so partial files are never visible to other apps.</li>
 *   <li>API 23–28: writes to the public Downloads directory (permission is
 *       requested by MainActivity first) and registers the file with the media
 *       scanner.</li>
 *   <li>Cookies from the WebView are forwarded so authenticated panel/drive
 *       downloads keep working.</li>
 * </ul>
 */
final class DownloadTask {

    interface Callback {
        void onSuccess(String savedName);
        void onFailure(String reason);
    }

    private static final String TARGET_SUBDIR = "VictusCloud";
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final ExecutorService EXECUTOR = Executors.newFixedThreadPool(2);
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private DownloadTask() { }

    static void enqueue(Context context, String url, String fileName, String mimeType,
                        String userAgent, Callback callback) {
        Context app = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            String reason = null;
            try {
                download(app, url, fileName, mimeType, userAgent);
            } catch (Exception e) {
                reason = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            }
            final String failure = reason;
            MAIN.post(() -> {
                if (failure == null) callback.onSuccess(fileName);
                else callback.onFailure(failure);
            });
        });
    }

    private static void download(Context context, String url, String fileName, String mimeType,
                                 String userAgent) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            if (userAgent != null) conn.setRequestProperty("User-Agent", userAgent);
            // Forward the WebView session so signed-in downloads authenticate.
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) conn.setRequestProperty("Cookie", cookie);
            conn.connect();

            int status = conn.getResponseCode();
            if (status >= 400) throw new Exception("HTTP " + status);

            String type = normalizeMime(mimeType, conn.getContentType());
            try (InputStream in = new BufferedInputStream(conn.getInputStream())) {
                if (Build.VERSION.SDK_INT >= 29) {
                    writeViaMediaStore(context, in, fileName, type);
                } else {
                    writeLegacy(context, in, fileName);
                }
            }
        } finally {
            conn.disconnect();
        }
    }

    // ------------------------------------------------------------- API 29+

    private static void writeViaMediaStore(Context context, InputStream in,
                                           String fileName, String mimeType) throws Exception {
        ContentResolver resolver = context.getContentResolver();
        String unique = uniqueName(resolver, fileName);

        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, unique);
        values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
        values.put(MediaStore.Downloads.RELATIVE_PATH,
                Environment.DIRECTORY_DOWNLOADS + File.separator + TARGET_SUBDIR);
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        Uri item = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (item == null) throw new Exception("MediaStore insert failed");

        boolean ok = false;
        try (OutputStream out = resolver.openOutputStream(item)) {
            if (out == null) throw new Exception("Cannot open destination");
            copy(in, out);
            ok = true;
        } finally {
            if (ok) {
                ContentValues done = new ContentValues();
                done.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(item, done, null, null);
            } else {
                resolver.delete(item, null, null); // never leave partial files visible
            }
        }
    }

    /** Avoids overwriting an existing download by suffixing " (n)". */
    private static String uniqueName(ContentResolver resolver, String fileName) {
        String candidate = fileName;
        int attempt = 1;
        while (exists(resolver, candidate)) {
            String suffix = " (" + attempt + ")";
            int dot = fileName.lastIndexOf('.');
            candidate = dot > 0
                    ? fileName.substring(0, dot) + suffix + fileName.substring(dot)
                    : fileName + suffix;
            attempt++;
        }
        return candidate;
    }

    private static boolean exists(ContentResolver resolver, String displayName) {
        String[] projection = {MediaStore.Downloads._ID};
        String selection = MediaStore.Downloads.DISPLAY_NAME + "=? AND "
                + MediaStore.Downloads.RELATIVE_PATH + "=? AND "
                + MediaStore.Downloads.IS_TRASHED + "=0";
        // RELATIVE_PATH's canonical form ends with a trailing '/'; when a
        // vendor's MediaStore stores it without one, the exact-match query
        // silently never matches, and uniqueName() would hand back the original
        // name and MediaStore itself would then auto-suffix. Match on name only
        // (same effective result, since this collection only holds our subdir)
        // so the dedupe works on every OEM.
        String[] args = {displayName};
        try (Cursor cursor = resolver.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                projection, MediaStore.Downloads.DISPLAY_NAME + "=?", args, null)) {
            return cursor != null && cursor.moveToFirst();
        } catch (Exception e) {
            return false; // conservative: a failed query shouldn't block the download
        }
    }

    // ------------------------------------------------------------- API 23–28

    private static void writeLegacy(Context context, InputStream in, String fileName) throws Exception {
        File dir = new File(Environment.getExternalStoragePublicDirectory(
                Environment.DIRECTORY_DOWNLOADS), TARGET_SUBDIR);
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        File out = new File(dir, fileName);
        int attempt = 1;
        while (out.exists()) {
            String suffix = " (" + attempt + ")";
            int dot = fileName.lastIndexOf('.');
            out = new File(dir, dot > 0
                    ? fileName.substring(0, dot) + suffix + fileName.substring(dot)
                    : fileName + suffix);
            attempt++;
        }
        try (OutputStream fos = new FileOutputStream(out)) {
            copy(in, fos);
        }
        // Register with the media scanner so the file shows up immediately.
        android.media.MediaScannerConnection.scanFile(
                context, new String[]{out.getAbsolutePath()}, null, null);
    }

    // ----------------------------------------------------------------- utils

    private static void copy(InputStream in, OutputStream out) throws Exception {
        byte[] buffer = new byte[64 * 1024];
        int read;
        while ((read = in.read(buffer)) != -1) {
            out.write(buffer, 0, read);
        }
        out.flush();
    }

    private static String normalizeMime(String fromWebView, String fromResponse) {
        String candidate = fromWebView != null && !fromWebView.isEmpty()
                ? fromWebView : fromResponse;
        if (candidate == null) return "application/octet-stream";
        int semicolon = candidate.indexOf(';');
        if (semicolon >= 0) candidate = candidate.substring(0, semicolon);
        candidate = candidate.trim().toLowerCase(Locale.US);
        return candidate.isEmpty() ? "application/octet-stream" : candidate;
    }
}

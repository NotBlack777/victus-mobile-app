package com.victuscloud.ecosystem;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/**
 * Parsed update metadata, plus the pure decision logic behind the in-app updater.
 *
 * <p>Deliberately free of Android imports so the parsing and version comparison
 * can be covered by plain JVM unit tests ({@code app/src/test}).</p>
 *
 * <p>Two payload shapes are understood:</p>
 * <ol>
 *   <li>A plain Victus update manifest:
 *       <pre>{
 *   "versionCode": 23,
 *   "versionName": "2.1.2",
 *   "apkUrl": "https://example.com/victus-2.1.2.apk",
 *   "sha256": "…",
 *   "sizeBytes": 3155187,
 *   "changelog": "What changed…"
 * }</pre></li>
 *   <li>The GitHub releases API ({@code /repos/{owner}/{repo}/releases/latest}):
 *       the APK comes from {@code assets[]} (plus its {@code digest} when GitHub
 *       reports one) and the version from {@code tag_name}.</li>
 * </ol>
 */
final class UpdateManifest {

    final int versionCode;
    final String versionName;
    final String apkUrl;
    final String sha256;
    final long sizeBytes;
    final String changelog;

    private UpdateManifest(int versionCode, String versionName, String apkUrl,
                           String sha256, long sizeBytes, String changelog) {
        this.versionCode = versionCode;
        this.versionName = versionName;
        this.apkUrl = apkUrl;
        this.sha256 = sha256;
        this.sizeBytes = sizeBytes;
        this.changelog = changelog;
    }

    /** @throws Exception when the payload has no usable APK URL. */
    static UpdateManifest parse(String body) throws Exception {
        JSONObject root = new JSONObject(body);
        return root.has("assets") || root.has("tag_name") ? fromGitHubRelease(root) : fromManifest(root);
    }

    private static UpdateManifest fromManifest(JSONObject root) throws Exception {
        String apkUrl = root.optString("apkUrl", "").trim();
        if (apkUrl.isEmpty()) {
            throw new Exception("Update manifest has no apkUrl");
        }
        return new UpdateManifest(
                root.optInt("versionCode", 0),
                emptyToNull(root.optString("versionName", null)),
                apkUrl,
                normalizeDigest(emptyToNull(root.optString("sha256", null))),
                root.optLong("sizeBytes", 0L),
                emptyToNull(root.optString("changelog", null)));
    }

    private static UpdateManifest fromGitHubRelease(JSONObject release) throws Exception {
        JSONArray assets = release.optJSONArray("assets");
        String apkUrl = null;
        String digest = null;
        long size = 0L;

        if (assets != null) {
            for (int i = 0; i < assets.length(); i++) {
                JSONObject asset = assets.optJSONObject(i);
                if (asset == null) continue;
                String name = asset.optString("name", "");
                if (!name.toLowerCase(Locale.US).endsWith(".apk")) continue;
                apkUrl = emptyToNull(asset.optString("browser_download_url", null));
                digest = normalizeDigest(emptyToNull(asset.optString("digest", null)));
                size = asset.optLong("size", 0L);
                break;
            }
        }

        if (apkUrl == null) {
            throw new Exception("Latest release has no .apk asset");
        }

        String tag = emptyToNull(release.optString("tag_name", null));
        if (tag == null) tag = emptyToNull(release.optString("name", null));

        return new UpdateManifest(
                0,                                   // GitHub doesn't publish a versionCode…
                stripVersionPrefix(tag),             // …so compare version names instead
                apkUrl,
                digest,
                size,
                emptyToNull(release.optString("body", null)));
    }

    /**
     * True when this release should replace the installed build. Uses
     * {@code versionCode} when the source provides one, otherwise a semantic
     * comparison of the version names.
     */
    boolean isNewerThan(int currentVersionCode, String currentVersionName) {
        if (versionCode > 0) {
            return versionCode > currentVersionCode;
        }
        if (versionName != null && currentVersionName != null) {
            return compareVersions(versionName, currentVersionName) > 0;
        }
        return false;
    }

    /** "2.1.2" &gt; "2.1.1" &gt; "2.0" — numeric segments, ignoring "-beta" style suffixes. */
    static int compareVersions(String left, String right) {
        if (left == null || right == null) return 0;
        String[] a = left.trim().split("\\.");
        String[] b = right.trim().split("\\.");
        int segments = Math.max(a.length, b.length);
        for (int i = 0; i < segments; i++) {
            int diff = segment(a, i) - segment(b, i);
            if (diff != 0) return diff > 0 ? 1 : -1;
        }
        return 0;
    }

    private static int segment(String[] parts, int index) {
        if (index >= parts.length) return 0;
        StringBuilder digits = new StringBuilder();
        for (int i = 0; i < parts[index].length(); i++) {
            char c = parts[index].charAt(i);
            if (c < '0' || c > '9') break;
            digits.append(c);
        }
        if (digits.length() == 0) return 0;
        try {
            return Integer.parseInt(digits.toString());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String stripVersionPrefix(String value) {
        if (value == null) return null;
        String v = value.trim();
        while (v.startsWith("v") || v.startsWith("V")) {
            v = v.substring(1);
        }
        return v.isEmpty() ? null : v;
    }

    /** GitHub reports digests as {@code "sha256:abc…"}. */
    private static String normalizeDigest(String digest) {
        if (digest == null) return null;
        String d = digest.trim().toLowerCase(Locale.US);
        if (d.startsWith("sha256:")) d = d.substring("sha256:".length());
        return d.matches("[0-9a-f]{64}") ? d : null;
    }

    private static String emptyToNull(String value) {
        if (value == null) return null;
        String v = value.trim();
        return v.isEmpty() || "null".equals(v) ? null : v;
    }
}

package com.victuscloud.ecosystem;

import android.Manifest;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import androidx.core.content.ContextCompat;

import java.util.ArrayList;
import java.util.List;

/**
 * Chrome client: page progress, file uploads and runtime permission plumbing.
 *
 * <p>Uploads use {@link #onShowFileChooser} — the current API that replaced the
 * deprecated {@code openFileChooser} overloads from early WebView versions.</p>
 */
final class VictusChromeClient extends WebChromeClient {

    private final MainActivity activity;

    VictusChromeClient(MainActivity activity) {
        this.activity = activity;
    }

    @Override
    public void onProgressChanged(WebView view, int newProgress) {
        activity.onPageProgress(newProgress);
    }

    /** Drive/panel upload buttons route through the system document picker. */
    @Override
    public boolean onShowFileChooser(WebView webView,
                                     ValueCallback<Uri[]> filePathCallback,
                                     FileChooserParams fileChooserParams) {
        return activity.openFilePicker(filePathCallback, fileChooserParams);
    }

    /**
     * WebRTC-style permission requests: only mic/camera are ever granted, and
     * only when the app already holds the matching runtime permission.
     *
     * <p>The requesting origin is checked too. {@code PermissionRequest} is
     * delivered to whichever page asked, and this shell loads third-party
     * content (CDN assets, embedded media) as well as Victus pages — so without
     * the origin check a compromised or malicious sub-resource on an otherwise
     * trusted page could put a live camera or microphone stream on screen. Only
     * the bundled app and Victus Cloud's own hosts may ask.</p>
     */
    @Override
    public void onPermissionRequest(PermissionRequest request) {
        // A null origin means the request cannot be attributed to anyone.
        String origin = originHost(request.getOrigin());
        if (!InAppLinks.isVictusHost(origin) && !WebViewSetup.ASSETS_HOST.equals(origin)) {
            request.deny();
            return;
        }
        List<String> allowed = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                    && holds(Manifest.permission.RECORD_AUDIO)) {
                allowed.add(resource);
            } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                    && holds(Manifest.permission.CAMERA)) {
                allowed.add(resource);
            }
        }
        if (allowed.isEmpty()) {
            request.deny();
        } else {
            request.grant(allowed.toArray(new String[0]));
        }
    }

    /**
     * The host of a permission origin, lowercased; null when the origin is not an
     * https URL with a host.
     *
     * <p>Parsed with {@link java.net.URI} rather than {@code android.net.Uri} so
     * the rule is ordinary Java and can be unit-tested on the JVM like every
     * other security-relevant check in this package (see
     * {@code WebRtcOriginPolicyTest}). The scheme is required to be https, not
     * just the host to match: a {@code file://victuscloud.com}-shaped origin
     * carries our hostname but is not a web origin at all, and matching on the
     * host alone would wave it through. Anything that does not parse, or parses
     * to no host, yields null and is denied — this branch fails closed.</p>
     */
    private static String originHost(android.net.Uri origin) {
        if (origin == null) return null;
        try {
            java.net.URI parsed = new java.net.URI(origin.toString());
            String scheme = parsed.getScheme();
            if (scheme == null || !"https".equalsIgnoreCase(scheme)) return null;
            String host = parsed.getHost();
            return host == null ? null : host.toLowerCase(java.util.Locale.US);
        } catch (Exception malformed) {
            return null;
        }
    }

    /** Location is not part of the app's feature set — decline politely. */
    @Override
    public void onGeolocationPermissionsShowPrompt(String origin,
                                                   GeolocationPermissions.Callback callback) {
        callback.invoke(origin, false, false);
    }

    private boolean holds(String permission) {
        return ContextCompat.checkSelfPermission(activity, permission)
                == PackageManager.PERMISSION_GRANTED;
    }
}

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
     */
    @Override
    public void onPermissionRequest(PermissionRequest request) {
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

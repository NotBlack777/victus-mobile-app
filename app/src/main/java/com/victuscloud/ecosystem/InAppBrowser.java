package com.victuscloud.ecosystem;

import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebChromeClient.FileChooserParams;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;

/**
 * The in-app browser surface behind the bundled app's "Web View" action.
 *
 * <p><b>Why this exists.</b> The live Victus Cloud portals cannot be framed.
 * {@code control.victuscloud.com} answers {@code x-frame-options: DENY}, and
 * {@code billing.victuscloud.com}, {@code drive.victuscloud.com} and
 * {@code victuscloud.com} answer {@code SAMEORIGIN} plus {@code frame-ancestors
 * 'self'}, so no origin other than the sites themselves may put them in an
 * iframe. That makes the previous design — an iframe pointed at the dev server's
 * {@code /api/proxy} preview middleware — impossible to keep working on a device:
 * there is no dev server in an APK, and even a perfect native proxy would still
 * be refused by the frame, while a proxy could not carry the POST logins and
 * session cookies these login-gated panels need.</p>
 *
 * <p>A real WebView can do what a frame cannot, so "Web View" now opens one: a
 * second Victus WebView surface layered over the bundle, sharing the shell's
 * WebSettings ({@link WebViewSetup}), routing/TLS policy
 * ({@link VictusWebViewClient} through {@link VictusPageHost}) and download
 * listener, with its own header, progress bar and error panel. It uses the same
 * cookie jar as the shell, so a sign-in here is a sign-in there. Closing it
 * restores the bundle with all of its React state intact — nothing reloads.</p>
 */
final class InAppBrowser implements VictusPageHost {

    private final MainActivity activity;
    private final FrameLayout root;
    private final WebViewAssetLoader assetLoader;
    private final String startUrl;
    private final String startTitle;
    private final Runnable onClosed;

    private FrameLayout overlay;
    private LinearLayout errorPanel;
    private TextView titleView;
    private TextView urlView;
    private TextView errorMessage;
    private ProgressBar progress;
    private WebView webView;
    private OnBackPressedCallback backCallback;
    private SslErrorHandler pendingSslHandler;
    private String lastUrl;
    private boolean closed;

    InAppBrowser(MainActivity activity, FrameLayout root, WebViewAssetLoader assetLoader,
                 String url, String title, Runnable onClosed) {
        this.activity = activity;
        this.root = root;
        this.assetLoader = assetLoader;
        this.startUrl = url;
        this.startTitle = title;
        this.onClosed = onClosed;
        this.lastUrl = url;
    }

    // ------------------------------------------------------------------- open

    void open() {
        overlay = new FrameLayout(activity);
        overlay.setBackgroundColor(color(R.color.window_bg));
        overlay.setClickable(true);

        LinearLayout column = new LinearLayout(activity);
        column.setOrientation(LinearLayout.VERTICAL);
        overlay.addView(column, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        column.addView(buildHeader());

        progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgressTintList(ColorStateList.valueOf(ThemeManager.solid(activity)));
        progress.setVisibility(View.GONE);
        column.addView(progress, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(3)));

        // The page and its error state share one slot so the error covers the
        // failed page instead of pushing the header around.
        FrameLayout content = new FrameLayout(activity);
        content.addView(buildWebView(), new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        errorPanel = buildErrorPanel();
        errorPanel.setVisibility(View.GONE);
        content.addView(errorPanel, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        column.addView(content, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        // System back walks this surface's own history first (as a browser
        // should) and only then closes it. Registered after MainActivity's
        // callback, so it wins while it is enabled.
        backCallback = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) webView.goBack();
                else close();
            }
        };
        activity.getOnBackPressedDispatcher().addCallback(activity, backCallback);

        root.addView(overlay, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        overlay.setElevation(dp(8));

        if (ThemeManager.isReduceMotion(activity)) {
            overlay.setAlpha(1f);
        } else {
            overlay.setAlpha(0f);
            overlay.setTranslationY(dp(20));
            overlay.animate().alpha(1f).translationY(0f).setDuration(220).start();
        }

        webView.loadUrl(startUrl);
    }

    private WebView buildWebView() {
        webView = new WebView(activity);
        WebViewSetup.apply(webView);
        webView.setBackgroundColor(color(R.color.window_bg));
        if (Build.VERSION.SDK_INT >= 26) {
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        }
        webView.setWebViewClient(new VictusWebViewClient(this, assetLoader));
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (progress != null) progress.setProgress(newProgress);
            }

            @Override
            public void onReceivedTitle(WebView view, String title) {
                if (titleView != null && title != null && !title.trim().isEmpty()) {
                    titleView.setText(InAppLinks.sanitizeTitle(title, startTitle));
                }
            }

            /** Drive/panel uploads use the same document picker as the shell. */
            @Override
            public boolean onShowFileChooser(WebView view,
                                             android.webkit.ValueCallback<android.net.Uri[]> callback,
                                             FileChooserParams params) {
                return activity.openFilePicker(callback, params);
            }
        });
        // Downloads inside the portal reuse the shell's downloader (MediaStore on
        // API 29+, the permission-checked legacy path below that).
        webView.setDownloadListener(activity.createDownloadListener());
        return webView;
    }

    private View buildHeader() {
        LinearLayout bar = new LinearLayout(activity);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(color(R.color.surface_topbar));
        bar.setPadding(dp(8), dp(6), dp(8), dp(6));
        bar.setElevation(dp(3));

        bar.addView(iconButton(R.drawable.ic_close_24, R.string.browser_close, this::close),
                new LinearLayout.LayoutParams(dp(48), dp(48)));

        LinearLayout titles = new LinearLayout(activity);
        titles.setOrientation(LinearLayout.VERTICAL);

        titleView = new TextView(activity);
        titleView.setText(startTitle);
        titleView.setTextSize(15);
        titleView.setTypeface(titleView.getTypeface(), Typeface.BOLD);
        titleView.setTextColor(color(R.color.title_text));
        titleView.setSingleLine(true);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        titles.addView(titleView);

        urlView = new TextView(activity);
        urlView.setTextSize(11);
        urlView.setTextColor(color(R.color.error_text));
        urlView.setSingleLine(true);
        urlView.setEllipsize(TextUtils.TruncateAt.END);
        urlView.setText(displayUrl(startUrl));
        titles.addView(urlView);

        LinearLayout.LayoutParams titlesParams = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        titlesParams.setMarginStart(dp(4));
        titlesParams.setMarginEnd(dp(4));
        bar.addView(titles, titlesParams);

        bar.addView(iconButton(R.drawable.ic_refresh_24, R.string.browser_reload, this::reload),
                new LinearLayout.LayoutParams(dp(48), dp(48)));
        bar.addView(iconButton(R.drawable.ic_external_24, R.string.browser_open_external,
                        this::openInSystemBrowser),
                new LinearLayout.LayoutParams(dp(48), dp(48)));
        return bar;
    }

    private LinearLayout buildErrorPanel() {
        LinearLayout box = new LinearLayout(activity);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(28), dp(28), dp(28), dp(28));
        // Opaque so the half-loaded page behind it never bleeds through.
        box.setBackgroundColor(color(R.color.overlay_bg));

        TextView title = new TextView(activity);
        title.setText(R.string.error_title);
        title.setTextSize(19);
        title.setTypeface(title.getTypeface(), Typeface.BOLD);
        title.setTextColor(color(R.color.error_title));
        title.setGravity(Gravity.CENTER);
        box.addView(title);

        errorMessage = new TextView(activity);
        errorMessage.setTextSize(13);
        errorMessage.setTextColor(color(R.color.error_text));
        errorMessage.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        messageParams.topMargin = dp(10);
        box.addView(errorMessage, messageParams);

        TextView retry = errorButton(getString(R.string.retry), true);
        retry.setOnClickListener(v -> reload());
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        retryParams.topMargin = dp(22);
        box.addView(retry, retryParams);

        TextView browser = errorButton(getString(R.string.browser_open_external), false);
        browser.setOnClickListener(v -> openInSystemBrowser());
        LinearLayout.LayoutParams browserParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        browserParams.topMargin = dp(10);
        box.addView(browser, browserParams);

        TextView closeButton = errorButton(getString(R.string.browser_close), false);
        closeButton.setOnClickListener(v -> close());
        LinearLayout.LayoutParams closeParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        closeParams.topMargin = dp(10);
        box.addView(closeButton, closeParams);

        return box;
    }

    // -------------------------------------------------------------- actions

    private void reload() {
        cancelPendingSslHandler();
        hideError();
        if (webView != null) webView.loadUrl(lastUrl == null ? startUrl : lastUrl);
    }

    /** Hands the current page to the device browser, then gets out of the way. */
    private void openInSystemBrowser() {
        String target = webView != null && webView.getUrl() != null ? webView.getUrl() : lastUrl;
        if (target == null) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(target));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            activity.startActivity(intent);
            close();
        } catch (Exception e) {
            Toast.makeText(activity, R.string.no_app_to_handle, Toast.LENGTH_SHORT).show();
        }
    }

    /** Tears the surface down and hands the screen back to the bundle. */
    void close() {
        if (closed) return;
        closed = true;

        cancelPendingSslHandler();
        if (backCallback != null) {
            backCallback.setEnabled(false);
            backCallback.remove();
            backCallback = null;
        }
        if (overlay != null) {
            overlay.animate().cancel();
            ViewGroup parent = overlay.getParent() instanceof ViewGroup
                    ? (ViewGroup) overlay.getParent() : null;
            if (parent != null) parent.removeView(overlay);
            overlay = null;
        }
        if (webView != null) {
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.setWebChromeClient(null);
            webView.removeAllViews();
            webView.destroy();
            webView = null;
        }
        errorPanel = null;
        if (onClosed != null) onClosed.run();
    }

    /** Tracked so a WebView is never left running while the app is backgrounded. */
    void onHostPause() {
        if (webView != null) webView.onPause();
    }

    void onHostResume() {
        if (webView != null) webView.onResume();
    }

    // -------------------------------------------------------- VictusPageHost

    @Override
    public Context context() {
        return activity;
    }

    @Override
    public void onPageLoadStarted(String url) {
        if (url != null) lastUrl = url;
        if (urlView != null) urlView.setText(displayUrl(url));
        hideError();
        if (progress == null) return;
        progress.animate().cancel();
        progress.setAlpha(1f);
        progress.setVisibility(View.VISIBLE);
        progress.setProgress(0);
    }

    @Override
    public void onPageLoadFinished(String url) {
        if (url != null) lastUrl = url;
        if (urlView != null) urlView.setText(displayUrl(url));
        if (progress == null) return;
        progress.animate().alpha(0f).setDuration(200)
                .withEndAction(() -> progress.setVisibility(View.GONE)).start();
    }

    @Override
    public void showError(String message, String failingUrl) {
        if (failingUrl != null) lastUrl = failingUrl;
        cancelPendingSslHandler();
        displayError(message + "\n" + getString(R.string.error_offline_hint));
    }

    /**
     * Certificate failures land here only when the shared policy refused to
     * auto-accept them (expired, hostname mismatch, or an unknown issuer with the
     * "Trust Victus Cloud certificates" setting off). This surface deliberately
     * offers no "proceed anyway": inside a browsing session the honest escape
     * hatch is the device browser, which shows its own certificate warning and
     * lets the user decide with full information.
     */
    @Override
    public void showSslError(SslErrorHandler handler, String message, String failingUrl,
                             boolean offerWebViewUpdate, boolean isInternalHost) {
        if (pendingSslHandler != null && pendingSslHandler != handler) {
            pendingSslHandler.cancel();
        }
        pendingSslHandler = handler;
        if (failingUrl != null) lastUrl = failingUrl;
        displayError(message);
    }

    @Override
    public boolean shouldOpenInternalExternally() {
        return false;
    }

    // --------------------------------------------------------------- plumbing

    private void displayError(String message) {
        if (errorPanel == null) return;
        errorMessage.setText(message);
        errorPanel.setVisibility(View.VISIBLE);
        errorPanel.bringToFront();
    }

    private void hideError() {
        if (errorPanel != null) errorPanel.setVisibility(View.GONE);
    }

    private void cancelPendingSslHandler() {
        if (pendingSslHandler != null) {
            pendingSslHandler.cancel();
            pendingSslHandler = null;
        }
    }

    private ImageButton iconButton(int iconRes, int contentDescriptionRes, Runnable action) {
        ImageButton button = new ImageButton(activity);
        button.setImageResource(iconRes);
        button.setColorFilter(color(R.color.icon_tint));
        button.setBackgroundResource(resolveAttr(android.R.attr.selectableItemBackgroundBorderless));
        button.setContentDescription(getString(contentDescriptionRes));
        button.setOnClickListener(v -> action.run());
        return button;
    }

    private TextView errorButton(String label, boolean primary) {
        TextView button = new TextView(activity);
        button.setText(label);
        button.setTextSize(14);
        button.setTypeface(button.getTypeface(), Typeface.BOLD);
        button.setGravity(Gravity.CENTER);
        button.setMinHeight(dp(48));
        button.setForeground(ContextCompat.getDrawable(activity,
                resolveAttr(android.R.attr.selectableItemBackground)));
        if (primary) {
            GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                    ThemeManager.gradient(activity));
            bg.setCornerRadius(dp(16));
            button.setBackground(bg);
            button.setTextColor(color(R.color.chip_text_selected));
        } else {
            GradientDrawable bg = new GradientDrawable();
            bg.setCornerRadius(dp(16));
            bg.setColor(color(R.color.chip_bg));
            bg.setStroke(dp(1), color(R.color.chip_stroke));
            button.setBackground(bg);
            button.setTextColor(color(R.color.chip_text));
        }
        return button;
    }

    /** Shown in the header under the title: host + path, without the scheme. */
    private static String displayUrl(String url) {
        if (url == null) return "";
        return url.replaceFirst("^https?://", "");
    }

    private String getString(int resId) {
        return activity.getString(resId);
    }

    private int color(int resId) {
        return ContextCompat.getColor(activity, resId);
    }

    private int resolveAttr(int attr) {
        android.util.TypedValue value = new android.util.TypedValue();
        activity.getTheme().resolveAttribute(attr, value, true);
        return value.resourceId;
    }

    private int dp(float value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }
}

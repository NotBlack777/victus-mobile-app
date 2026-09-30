package com.victuscloud.ecosystem;

import android.Manifest;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Display;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.content.Context;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Single-activity WebView shell for the Victus Cloud ecosystem.
 *
 * <p>Responsibilities (method names mirror the original APK so the codebase stays
 * familiar to anyone who worked from the decompiled notes):</p>
 * <ul>
 *   <li>{@link #createLayout()} — the chromeless page host (the app draws its own
 *       single header and channel bar; the shell only owns the WebView)</li>
 *   <li>{@link #configureWebView()} — WebView settings, no deprecated APIs</li>
 *   <li>{@link #createErrorOverlay()} — native error screen, animator-driven fades</li>
 *   <li>{@link #createDownloadListener()} — scoped-storage-safe downloads</li>
 *   <li>{@link #confirmClearSession()} — cookie/storage/cache wipe with confirmation</li>
 * </ul>
 *
 * <p>All sizing goes through {@link #dp(float)} (density-independent pixels) and all
 * text uses SP, so the layout scales correctly from mdpi to xxxhdpi and across
 * phones, tablets and foldables. No raw pixel values are used anywhere.</p>
 */
public class MainActivity extends ComponentActivity implements VictusPageHost {

    // ------------------------------------------------------------------ routes

    /** Origin that serves the bundled assets over https (no file:// needed). */
    private static final String ASSETS_ORIGIN = "https://appassets.androidplatform.net";
    private static final String ASSETS_HOST = "appassets.androidplatform.net";
    /** Entry point of the bundled React app (staged into the APK assets at build
     *  time by the `bundleReactApp` Gradle task). */
    private static final String HOME_URL = ASSETS_ORIGIN + "/index.html";

    private static final int TAB_HOME = 0;
    /**
     * Tab targets mirror {@code DOCK_TABS} in the web app (the single menu).
     * The shell keeps only the shared navigable URLs; chips themselves are
     * rendered by the web app.
     */
    static final String[] DOCK_URLS = {
            HOME_URL,                                  // Home
            "https://victuscloud.com",                 // Website
            "https://billing.victuscloud.com",         // Billing
            "https://control.victuscloud.com",         // Control
            "https://drive.victuscloud.com",           // Drive
            "https://victuscloud.com/support",         // Support
            "https://victuscloud.com/status",          // Status
    };
    static final int TAB_WEBSITE = 1;
    static final int TAB_BILLING = 2;
    static final int TAB_CONTROL = 3;
    static final int TAB_DRIVE = 4;
    static final int TAB_SUPPORT = 5;
    static final int TAB_STATUS = 6;

    private static final String KEY_SELECTED_TAB = "selected_tab";
    /** URI scheme used by the launcher shortcuts (res/xml/shortcuts.xml). */
    private static final String SHORTCUT_SCHEME = "victus";

    // ------------------------------------------------------------------- views

    private FrameLayout rootView;
    /**
     * The single menu is the bundled React app's own header + channel chips
     * (TopBar.tsx / DockBar.tsx). The shell draws no chrome of its own — the old
     * native top bar and purple pill dock were removed so there is exactly one
     * menu. Native Tools/Appearance screens are reachable through the web menu
     * via the {@code shell*} bridge methods.
     */
    private View updateBadge; // kept: the web menu reads its state through the bridge
    /** Set when a launcher shortcut asked for the updater directly. */
    private boolean pendingUpdateSheet;
    private ProgressBar pageProgress;
    private SwipeRefreshLayout pullRefresh;
    private WebView webView;
    private FrameLayout errorOverlay;
    private TextView errorMessage;
    private TextView errorGlyph;
    private TextView errorRetryButton;
    private TextView errorWebViewUpdateLink;
    private TextView errorDateTimeLink;
    private android.webkit.SslErrorHandler pendingSslHandler;

    private WebViewAssetLoader assetLoader;
    /** The in-app browser surface opened by the bundled app's "Web View" action. */
    private InAppBrowser inAppBrowser;
    /** Name the bundled React app uses for the native bridge: window.VictusNative. */
    static final String BRIDGE_NAME = "VictusNative";

    /** Real Victus Cloud authentication; owns the session and the encrypted store. */
    private VictusAuth victusAuth;
    /**
     * Serialises auth work off the UI thread. One thread by design: sign-in,
     * two-factor and restore must not interleave on the shared cookie jar.
     */
    private final ExecutorService authIo = Executors.newSingleThreadExecutor();
    /**
     * True while the bundled React app (the only page allowed to use the auth
     * half of the bridge) is the page in the shell. Updated from the page
     * callbacks, which run on the UI thread, so the bridge can read it safely
     * from the WebView's JS thread.
     */
    private volatile boolean bundledAppForeground = true;
    /**
     * False on a device with no usable WebView, where the shell is never built and a
     * native "install a web engine" screen is shown instead (see
     * {@link #showMissingWebViewScreen()}).
     */
    private boolean webViewAvailable = true;
    /**
     * Last tab the shell itself navigated to (launcher shortcut, shell restore).
     * Purely bookkeeping for {@link #handleWebBackNavigation} and saved state —
     * the visible chip selection lives in the web app.
     */
    private int selectedDock = TAB_HOME;
    private String lastErrorUrl;

    // ------------------------------------------------------ activity results

    /** Pending file-picker callback (Drive / panel uploads). */
    private ValueCallback<Uri[]> filePathCallback;
    private final ActivityResultLauncher<Intent> filePickerLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(), this::onFilePicked);

    /** Pending download while we wait for the legacy storage permission (API 23–28). */
    private PendingDownload pendingDownload;
    private final ActivityResultLauncher<String> storagePermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(), this::onStoragePermissionResult);

    // ============================================================== lifecycle

    /**
     * Display-mode forcing without AppCompat: the saved colorMode (Dark / Light
     * / System from the Appearance sheet) is folded into the activity's base
     * configuration, so the values-night resource overrides — and EdgeToEdge's
     * system-bar icon contrast — re-resolve to match what the user picked,
     * even when it differs from the OS setting. "System" leaves the context
     * untouched. {@link #recreateForColorMode()} re-runs this after a change,
     * with WebView state restored across it by the framework.
     */
    @Override
    protected void attachBaseContext(android.content.Context base) {
        String mode = ThemeManager.getColorMode(base);
        if (!ThemeManager.COLOR_SYSTEM.equals(mode)) {
            android.content.res.Configuration config =
                    new android.content.res.Configuration(base.getResources().getConfiguration());
            int night = ThemeManager.COLOR_DARK.equals(mode)
                    ? android.content.res.Configuration.UI_MODE_NIGHT_YES
                    : android.content.res.Configuration.UI_MODE_NIGHT_NO;
            config.uiMode = (config.uiMode & ~android.content.res.Configuration.UI_MODE_NIGHT_MASK) | night;
            base = base.createConfigurationContext(config);
        }
        super.attachBaseContext(base);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Android 12+ splash screen (backported by androidx.core:core-splashscreen).
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        // Edge-to-edge: transparent system bars with automatic icon contrast.
        EdgeToEdge.enable(this);

        // Request the panel's highest refresh rate (90/120/144 Hz capable hardware).
        applyPeakRefreshRate();

        // Some minimal AOSP builds ship no WebView at all, and users disable it. In
        // that state `new WebView(this)` throws and takes the whole process down, so
        // the engine is checked before any of the shell is built. The app then
        // explains what to install instead of dying on launch.
        webViewAvailable = DeviceCompat.isWebViewAvailable(this);
        if (!webViewAvailable) {
            showMissingWebViewScreen();
            return;
        }

        createLayout();
        configureWebView();

        if (Build.VERSION.SDK_INT >= 26) {
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
        }
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        // Predictive-back-compatible dispatcher: WebView history first,
        // then the Home tab, then let the system finish the activity.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (!handleWebBackNavigation()) {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            }
        });

        if (savedInstanceState != null) {
            int restoredTab = savedInstanceState.getInt(KEY_SELECTED_TAB, TAB_HOME);
            webView.restoreState(savedInstanceState);
        } else {
            String startUrl = resolveStartUrl(getIntent());
            if (startUrl == null) startUrl = HOME_URL;
            loadUrlInternal(startUrl);
        }

        // "Check for updates" launcher shortcut: open the sheet once the first
        // frame is drawn, so the dialog isn't attached to an unpainted window.
        if (pendingUpdateSheet) {
            pendingUpdateSheet = false;
            webView.postDelayed(() -> {
                if (!isFinishing() && !isDestroyed()) UpdateSheet.show(this);
            }, 400);
        }

        // Quietly ask the release feed whether a newer build exists, so the
        // tools menu can badge itself. Never blocks the UI and never prompts.
        startBackgroundUpdateCheck();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (webView == null) return; // no web engine: nothing to navigate
        String url = resolveStartUrl(intent);
        if (url != null) {
            loadUrlInternal(url);
        }
        if (pendingUpdateSheet) {
            pendingUpdateSheet = false;
            UpdateSheet.show(this);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putInt(KEY_SELECTED_TAB, selectedDock);
        // Null when the device has no web engine and the fallback screen is showing.
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Stops JS timers/animations/video in the WebView while backgrounded —
        // without this the page keeps ticking (and draining battery/CPU) the
        // whole time the app isn't even visible.
        if (webView != null) webView.onPause();
        if (inAppBrowser != null) inAppBrowser.onHostPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        if (inAppBrowser != null) inAppBrowser.onHostResume();
        // An update may have been installed (or found) while we were away.
        refreshUpdateUi();
        // Silent admin-area re-check: a role revoked while we were backgrounded
        // must lose the view-toggle on this very resume. No spinner, no message,
        // nothing logged — the panel enforces every admin request regardless.
        startAdminAreaCheck();
    }

    @Override
    protected void onDestroy() {
        authIo.shutdownNow();
        if (inAppBrowser != null) {
            inAppBrowser.close();
            inAppBrowser = null;
        }
        if (webView != null) {
            // Detach before destroy so the WebView never outlives its context.
            android.view.ViewGroup parent = (android.view.ViewGroup) webView.getParent();
            if (parent != null) parent.removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /**
     * Deep links (https://*.victuscloud.com) open directly inside the shell, and
     * the launcher shortcuts use a {@code victus://} URI to ask for a specific
     * destination without needing a separate activity.
     */
    private String resolveStartUrl(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null) {
            return null;
        }

        Uri data = intent.getData();
        if (SHORTCUT_SCHEME.equals(data.getScheme())) {
            String destination = data.getHost() == null ? "" : data.getHost();
            switch (destination) {
                case "updates":
                    pendingUpdateSheet = true;
                    return null; // stay on Home, then open the sheet
                case "servers":
                    return "https://control.victuscloud.com";
                case "billing":
                    return "https://billing.victuscloud.com";
                case "support":
                    return "https://victuscloud.com/support";
                default:
                    return null;
            }
        }

        return data.toString();
    }

    // ========================================================= refresh rate

    /**
     * Universal refresh-rate support: ask the window manager for the fastest
     * {@link Display.Mode} that matches the current resolution, so the app renders
     * at 90/120/144 Hz on capable hardware instead of being capped at 60 Hz.
     * {@code Window.setPreferredDisplayModeId} is the API 23+ mechanism; the window
     * (and therefore the WebView surface) inherits the chosen mode.
     */
    private void applyPeakRefreshRate() {
        try {
            Window window = getWindow();
            Display display = Build.VERSION.SDK_INT >= 30
                    ? getDisplay()
                    : window.getWindowManager().getDefaultDisplay();
            if (display == null) return;

            Display.Mode current = display.getMode();
            Display.Mode best = current;
            for (Display.Mode mode : display.getSupportedModes()) {
                boolean sameResolution = mode.getPhysicalWidth() == current.getPhysicalWidth()
                        && mode.getPhysicalHeight() == current.getPhysicalHeight();
                if (sameResolution && mode.getRefreshRate() > best.getRefreshRate()) {
                    best = mode;
                }
            }
            if (best.getModeId() != current.getModeId()) {
                WindowManager.LayoutParams lp = window.getAttributes();
                lp.preferredDisplayModeId = best.getModeId();
                window.setAttributes(lp);
            }
        } catch (Exception ignored) {
            // Some OEM panels misreport their modes — never crash over a nicety.
        }
    }

    // ========================================================== native chrome

    /**
     * Builds the chromeless host: the full-screen WebView is the whole app — the
     * single menu (header + channel chips) is the bundled React app's own.
     * Behind it sits a thin progress bar (now anchored to the top edge, since no
     * native bar exists) and the error overlay. Everything is measured in dp.
     */
    private void createLayout() {
        rootView = new FrameLayout(this);

        webView = new WebView(this);
        webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        rootView.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        // Thin progress bar pinned to the top edge, over the web header.
        pageProgress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        pageProgress.setMax(100);
        pageProgress.setProgressTintList(ColorStateList.valueOf(ThemeManager.solid(this)));
        pageProgress.setVisibility(View.GONE);
        rootView.addView(pageProgress, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, dp(3), Gravity.TOP));

        // Pull-to-refresh on the whole surface; disabled while the page loads so
        // a refresh can't stack on itself. Only our bundled home screen and
        // Victus Cloud pages are refreshable (external sites keep their own
        // gesture space and never silently re-POST anything).
        pullRefresh = new SwipeRefreshLayout(this);
        pullRefresh.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        pullRefresh.setColorSchemeColors(ThemeManager.solid(this));
        pullRefresh.setProgressBackgroundColorSchemeColor(colorOf(R.color.chip_bg));
        pullRefresh.setOnRefreshListener(() -> {
            hideErrorOverlay();
            webView.reload();
        });
        pullRefresh.setEnabled(false);
        // Re-parent so the pull wrapper (not the bare WebView) sits in the root;
        // the gesture must own the full screen for the pull to start anywhere.
        rootView.addView(pullRefresh, 0, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        createErrorOverlay();

        setContentView(rootView);
        applyWindowInsets();
    }

    /**
     * Edge-to-edge without a native bar: the app draws behind both system bars
     * and the web menu (which pads itself with {@code pb-safe} and its own safe
     * areas) owns the insets. The shell only keeps the status-bar icons on the
     * themed contrast — EdgeToEdge already handles that via the night-mode
     * configuration folded in by {@link #attachBaseContext}.
     */
    private void applyWindowInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(rootView, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout());
            // Progress bar sits below the status bar/cutout so it never hides
            // behind a notch on devices that extend the display into the cutout.
            FrameLayout.LayoutParams progressParams =
                    (FrameLayout.LayoutParams) pageProgress.getLayoutParams();
            progressParams.topMargin = bars.top;
            pageProgress.setLayoutParams(progressParams);
            return insets;
        });
    }

    // ============================================================== webview

    /**
     * Modern WebView setup. Everything deprecated in the original client is gone:
     * no {@code setAppCacheEnabled} (removed), no {@code setPluginState} (removed),
     * no {@code setAllowUniversalAccessFromFileURLs}/{@code setAllowFileAccessFromFileURLs}
     * (replaced by serving assets over https via {@link WebViewAssetLoader}), no
     * {@code setSavePassword}. Mixed content is refused outright.
     */
    private void configureWebView() {
        // Shared with the in-app browser surface so both WebViews behave alike.
        WebViewSetup.apply(webView);

        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                // The React build is staged at the assets root, so serve the whole
                // tree from the domain root. That keeps Vite's absolute URLs
                // (/index.html, /assets/index-*.js, /icons/*, /manifest.webmanifest)
                // resolving to the matching APK asset with no rewrite step.
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new VictusWebViewClient(this, assetLoader));
        webView.setWebChromeClient(new VictusChromeClient(this));
        webView.setDownloadListener(createDownloadListener());

        // The session lives here, not in the WebView: the API key is attached to
        // panel requests natively and is never handed to JavaScript.
        victusAuth = new VictusAuth(this);

        // The bundled app's native capabilities: "open this Victus Cloud page in
        // the in-app browser" plus real Victus Cloud sign-in (see WebAppBridge).
        webView.addJavascriptInterface(new WebAppBridge(this), BRIDGE_NAME);
    }

    // ------------------------------------------------------- client callbacks

    @Override
    public void onPageLoadStarted(String url) {
        // Only the bundled page may use the auth half of the bridge; the menu can
        // navigate this same WebView to victuscloud.com, and those pages must not
        // inherit the app's panel session.
        bundledAppForeground = url != null && url.startsWith(ASSETS_ORIGIN);
        hideErrorOverlay();
        pageProgress.animate().cancel();
        pageProgress.setAlpha(1f);
        pageProgress.setVisibility(View.VISIBLE);
        pageProgress.setProgress(0);
        pullRefresh.setRefreshing(false); // a finished load also ends any refresh gesture
        pullRefresh.setEnabled(isRefreshableUrl(url));
    }

    @Override
    public void onPageLoadFinished(String url) {
        pageProgress.animate().alpha(0f).setDuration(220)
                .withEndAction(() -> pageProgress.setVisibility(View.GONE)).start();
        pullRefresh.setRefreshing(false); // both load-finished and refresh-finished
        injectThemeIntoWebView(); // seed the saved accent theme before the page reads it
    }

    void onPageProgress(int newProgress) {
        pageProgress.setProgress(newProgress);
    }

    // --------------------------------------------------------- VictusPageHost

    /** The shell is its own page host; {@link InAppBrowser} is the other one. */
    @Override
    public Context context() {
        return this;
    }

    @Override
    public boolean shouldOpenInternalExternally() {
        return ThemeManager.isOpenLinksExternally(this);
    }

    /**
     * Opens a live Victus Cloud portal in the in-app browser surface. Reached
     * only from {@link WebAppBridge} (an allowlisted https Victus URL) or from
     * code that already validated its target.
     */
    void showInAppBrowser(String url, String title) {
        if (inAppBrowser != null || rootView == null) return; // one surface at a time
        inAppBrowser = new InAppBrowser(this, rootView, assetLoader, url, title,
                () -> inAppBrowser = null);
        inAppBrowser.open();
    }

    // ========================================================= tools & session

    /**
     * Silent availability check: reads the release feed off the main thread and
     * updates the tools-menu badge. Failures are ignored on purpose — being
     * offline is normal, and a stale "no update" answer is better than an error.
     */
    void startBackgroundUpdateCheck() {
        if (UpdateChecker.checkedRecently(this)) {
            refreshUpdateUi();
            return;
        }

        final android.content.Context appContext = getApplicationContext();
        UpdateChecker.IO.execute(() -> {
            try {
                UpdateChecker.rememberAvailable(appContext, UpdateChecker.checkForUpdate(appContext));
            } catch (Exception unreachable) {
                // Offline / rate-limited: keep whatever the last check knew.
                return;
            }
            UpdateChecker.MAIN.post(this::refreshUpdateUi);
        });
    }

    /**
     * Re-reads whatever the last background update check found.
     *
     * <p>There is no native badge any more — the single web menu shows the update
     * marker itself, reading the same answer through {@code shellUiState()}. This
     * now only refreshes the native update sheets, which is what still exists
     * natively.</p>
     */
    void refreshUpdateUi() {
        String available = UpdateChecker.availableVersionName(this);
        if (updateBadge != null) {
            updateBadge.setVisibility(available == null ? View.GONE : View.VISIBLE);
        }
    }

    /**
     * Clears WebView cookies, storage, cache and panel sessions, after a
     * confirmation. The work itself is small/fast; nothing touches the network
     * and nothing ever reaches a server — this is purely client-side state.
     */
    void confirmClearSession() {
        new AlertDialog.Builder(this)
                .setTitle(R.string.clear_session_title)
                .setMessage(R.string.clear_session_message)
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.clear_session_confirm, (dialog, which) -> {
                    // Wipe every piece of local browser state we can reach.
                    CookieManager cookies = CookieManager.getInstance();
                    cookies.removeAllCookies(null);
                    cookies.removeSessionCookies(null);
                    cookies.flush();
                    WebStorage.getInstance().deleteAllData();
                    webView.clearCache(true);
                    webView.clearFormData();
                    webView.clearSslPreferences();
                    webView.clearHistory();
                    webView.clearMatches();
                    // Drop the back/forward list too: clearing the session means
                    // "fresh start", not "reload the old page from memory".
                    webView.loadUrl(HOME_URL);
                    toast(getString(R.string.clear_session_done));
                })
                .show();
    }

    // =========================================================== error overlay

    /**
     * Native error screen layered above the WebView. Fades are driven by
     * {@link View#animate()} (the animator framework), so they stay smooth at any
     * refresh rate — no sleeps, no fixed-frame loops.
     */
    private void createErrorOverlay() {
        errorOverlay = new FrameLayout(this);
        errorOverlay.setBackgroundColor(colorOf(R.color.overlay_bg));
        errorOverlay.setVisibility(View.GONE);
        errorOverlay.setClickable(true);

        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(28), dp(32), dp(28), dp(32));
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(colorOf(R.color.sheet_bg));
        cardBg.setCornerRadius(dp(28));
        cardBg.setStroke(dp(1), colorOf(R.color.sheet_stroke));
        box.setBackground(cardBg);
        box.setElevation(dp(10));
        FrameLayout.LayoutParams boxParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER);
        boxParams.leftMargin = dp(28);
        boxParams.rightMargin = dp(28);
        errorOverlay.addView(box, boxParams);

        errorGlyph = new TextView(this);
        errorGlyph.setText("!");
        errorGlyph.setTextSize(30); // SP
        errorGlyph.setTextColor(colorOf(R.color.chip_text_selected));
        errorGlyph.setTypeface(errorGlyph.getTypeface(), android.graphics.Typeface.BOLD);
        errorGlyph.setGravity(Gravity.CENTER);
        errorGlyph.setBackground(buildAccentDrawable(dp(32)));
        LinearLayout.LayoutParams glyphParams = new LinearLayout.LayoutParams(dp(64), dp(64));
        glyphParams.bottomMargin = dp(20);
        glyphParams.gravity = Gravity.CENTER_HORIZONTAL;
        box.addView(errorGlyph, glyphParams);

        TextView titleView = new TextView(this);
        titleView.setText(R.string.error_title);
        titleView.setTextSize(20); // SP
        titleView.setTextColor(colorOf(R.color.error_title));
        titleView.setTypeface(titleView.getTypeface(), android.graphics.Typeface.BOLD);
        titleView.setGravity(Gravity.CENTER);
        box.addView(titleView);

        errorMessage = new TextView(this);
        errorMessage.setTextSize(14); // SP
        errorMessage.setTextColor(colorOf(R.color.error_text));
        errorMessage.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams msgParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        msgParams.topMargin = dp(8);
        box.addView(errorMessage, msgParams);

        errorRetryButton = buildOverlayButton(getString(R.string.retry), true);
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        retryParams.topMargin = dp(24);
        errorRetryButton.setOnClickListener(v -> {
            if (pendingSslHandler != null) {
                pendingSslHandler.cancel();
                pendingSslHandler = null;
            }
            hideErrorOverlay();
            if (lastErrorUrl != null) loadUrlInternal(lastErrorUrl);
            else webView.reload();
        });
        box.addView(errorRetryButton, retryParams);

        TextView home = buildOverlayButton(getString(R.string.go_home), false);
        LinearLayout.LayoutParams homeParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        homeParams.topMargin = dp(10);
        home.setOnClickListener(v -> {
            if (pendingSslHandler != null) {
                pendingSslHandler.cancel();
                pendingSslHandler = null;
            }
            hideErrorOverlay();
            loadTab(TAB_HOME);
        });
        box.addView(home, homeParams);

        errorWebViewUpdateLink = new TextView(this);
        errorWebViewUpdateLink.setText(R.string.action_update_webview);
        errorWebViewUpdateLink.setTextSize(13); // SP
        errorWebViewUpdateLink.setTypeface(errorWebViewUpdateLink.getTypeface(), android.graphics.Typeface.BOLD);
        errorWebViewUpdateLink.setTextColor(ThemeManager.solid(this));
        errorWebViewUpdateLink.setGravity(Gravity.CENTER);
        errorWebViewUpdateLink.setMinHeight(dp(40));
        errorWebViewUpdateLink.setPaintFlags(errorWebViewUpdateLink.getPaintFlags() | android.graphics.Paint.UNDERLINE_TEXT_FLAG);
        errorWebViewUpdateLink.setForeground(ContextCompat.getDrawable(this, resolveAttr(android.R.attr.selectableItemBackground)));
        errorWebViewUpdateLink.setVisibility(View.GONE);
        errorWebViewUpdateLink.setOnClickListener(v -> openWebViewUpdatePage());
        LinearLayout.LayoutParams updateLinkParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        updateLinkParams.topMargin = dp(8);
        box.addView(errorWebViewUpdateLink, updateLinkParams);

        // The second real cause of a certificate error the device cannot verify is
        // its own clock. A wrong date makes a perfectly good certificate look
        // not-yet-valid or expired, so this link opens the settings screen that
        // fixes it rather than offering a way past the check.
        errorDateTimeLink = new TextView(this);
        errorDateTimeLink.setText(R.string.action_fix_date_time);
        errorDateTimeLink.setTextSize(13); // SP
        errorDateTimeLink.setTypeface(errorDateTimeLink.getTypeface(), android.graphics.Typeface.BOLD);
        errorDateTimeLink.setTextColor(ThemeManager.solid(this));
        errorDateTimeLink.setGravity(Gravity.CENTER);
        errorDateTimeLink.setMinHeight(dp(40));
        errorDateTimeLink.setPaintFlags(errorDateTimeLink.getPaintFlags() | android.graphics.Paint.UNDERLINE_TEXT_FLAG);
        errorDateTimeLink.setForeground(ContextCompat.getDrawable(this, resolveAttr(android.R.attr.selectableItemBackground)));
        errorDateTimeLink.setVisibility(View.GONE);
        errorDateTimeLink.setOnClickListener(v -> openDateTimeSettings());
        LinearLayout.LayoutParams dateTimeLinkParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        dateTimeLinkParams.topMargin = dp(2);
        box.addView(errorDateTimeLink, dateTimeLinkParams);

        rootView.addView(errorOverlay, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        errorOverlay.setElevation(dp(6));
    }

    private TextView buildOverlayButton(String label, boolean primary) {
        TextView button = new TextView(this);
        button.setText(label);
        button.setTextSize(15); // SP
        button.setTypeface(button.getTypeface(), android.graphics.Typeface.BOLD);
        button.setGravity(Gravity.CENTER);
        button.setMinHeight(dp(48)); // ≥48dp touch target
        button.setForeground(ContextCompat.getDrawable(this, resolveAttr(android.R.attr.selectableItemBackground)));
        if (primary) {
            button.setBackground(buildAccentDrawable(dp(16)));
            button.setTextColor(colorOf(R.color.chip_text_selected));
        } else {
            GradientDrawable bg = new GradientDrawable();
            bg.setCornerRadius(dp(16));
            bg.setColor(colorOf(R.color.chip_bg));
            bg.setStroke(dp(1), colorOf(R.color.chip_stroke));
            button.setBackground(bg);
            button.setTextColor(colorOf(R.color.chip_text));
        }
        return button;
    }

    /** Rounded-rect drawable painted with the live theme gradient (2 or 3 stops). */
    private GradientDrawable buildAccentDrawable(int radiusPx) {
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, ThemeManager.gradient(this));
        bg.setCornerRadius(radiusPx);
        return bg;
    }

    /**
     * Applies the currently selected theme (preset or custom) to every native
     * accent surface — progress bar tint, error glyph/retry button — and, if the
     * bundled home screen is currently loaded, live-updates its CSS variables
     * via a tiny injected script (the web menu re-themes itself through the
     * {@code victus:theme} event). Nothing here recreates the Activity or
     * reloads the WebView, so switching themes is effectively free.
     */
    void applyDynamicAccent() {
        if (pageProgress != null) {
            pageProgress.setProgressTintList(ColorStateList.valueOf(ThemeManager.solid(this)));
        }
        if (pullRefresh != null) {
            pullRefresh.setColorSchemeColors(ThemeManager.solid(this));
        }
        if (errorGlyph != null) {
            errorGlyph.setBackground(buildAccentDrawable(dp(32)));
        }
        if (errorRetryButton != null) {
            errorRetryButton.setBackground(buildAccentDrawable(dp(16)));
        }
        if (errorWebViewUpdateLink != null) {
            errorWebViewUpdateLink.setTextColor(ThemeManager.solid(this));
        }
        if (errorDateTimeLink != null) {
            errorDateTimeLink.setTextColor(ThemeManager.solid(this));
        }
        injectThemeIntoWebView();
    }

    /**
     * Display mode changed and the native chrome's dark/light resource sets
     * need re-resolution. The framework runs {@link #onSaveInstanceState()}
     * (WebView history + selected dock) across {@link Activity#recreate()}, so
     * this reads as an instant theme flip rather than a restart.
     */
    void recreateForColorMode() {
        recreate();
    }

    /** Whether a pull-to-refresh makes sense for what's currently loaded. */
    private boolean isRefreshableUrl(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(java.util.Locale.US);
        return ASSETS_HOST.equals(host)
                || "victuscloud.com".equals(host)
                || host.endsWith(".victuscloud.com");
    }    /**
     * Pushes the native appearance config into the bundled React app: the live
     * accent gradient + reduce-motion flag as CSS custom properties, plus the
     * full native config object the web ThemeContext now listens for
     * (window.dispatchEvent(new CustomEvent('victus:theme', {detail}))). Only
     * runs against our own bundled asset origin — a no-op on every other site
     * in the WebView. The app still re-applies its own saved theme on mount;
     * this event mirrors native changes live, so the native sheet is the
     * single source of truth while the shell is running.
     */
    private void injectThemeIntoWebView() {
        if (webView == null) return; // no web engine on this device

        String url = webView.getUrl();
        if (url == null || !url.startsWith(ASSETS_ORIGIN)) return;

        int[] g = ThemeManager.gradient(this);
        int a = g[0];
        int c = g[g.length - 1];
        int b = g.length > 2 ? g[1] : midColor(a, c);
        boolean reduceMotion = ThemeManager.isReduceMotion(this);

        String script = "(function(){"
                + "var s=document.documentElement.style;"
                + "s.setProperty('--accent-1','" + ThemeManager.hex(a) + "');"
                + "s.setProperty('--accent-2','" + ThemeManager.hex(b) + "');"
                + "s.setProperty('--accent-3','" + ThemeManager.hex(c) + "');"
                + "s.setProperty('--accent-1-rgb','" + ThemeManager.rgb(a) + "');"
                + "s.setProperty('--accent-2-rgb','" + ThemeManager.rgb(b) + "');"
                + "s.setProperty('--accent-3-rgb','" + ThemeManager.rgb(c) + "');"
                + "document.documentElement.classList.toggle('reduce-motion'," + reduceMotion + ");"
                + "window.dispatchEvent(new CustomEvent('victus:theme',{detail:{"
                + "preset:'" + ThemeManager.getPreset(this) + "',"
                + "customA:'" + ThemeManager.hex(ThemeManager.getCustomA(this)) + "',"
                + "customB:'" + ThemeManager.hex(ThemeManager.getCustomB(this)) + "',"
                + "isCustomSolid:" + ThemeManager.isCustomSolid(this) + ","
                + "reduceMotion:" + reduceMotion + ","
                + "colorMode:'" + ThemeManager.getColorMode(this) + "',"
                + "background:'" + ThemeManager.getBackground(this) + "',"
                + "panel:'" + ThemeManager.getDisplayPanel(this) + "',"
                + "isDark:" + ThemeManager.isDark(this)
                + "}}));"
                + "})();";
        webView.evaluateJavascript(script, null);
    }

    private static int midColor(int c1, int c2) {
        int r = (android.graphics.Color.red(c1) + android.graphics.Color.red(c2)) / 2;
        int g = (android.graphics.Color.green(c1) + android.graphics.Color.green(c2)) / 2;
        int b = (android.graphics.Color.blue(c1) + android.graphics.Color.blue(c2)) / 2;
        return android.graphics.Color.rgb(r, g, b);
    }

    @Override
    public void showError(String message, String failingUrl) {
        if (pendingSslHandler != null) {
            pendingSslHandler.cancel();
            pendingSslHandler = null;
        }
        errorWebViewUpdateLink.setVisibility(View.GONE);
        errorDateTimeLink.setVisibility(View.GONE);
        displayErrorOverlay(message + "\n" + getString(R.string.error_offline_hint), failingUrl);
    }

    /**
     * TLS-specific error screen. Unlike {@link #showError}, the message is
     * already a complete, specific explanation (built per {@link android.net.http.SslError}
     * code in {@link VictusWebViewClient}), so the generic "check your
     * connection" hint is skipped. When {@code offerWebViewUpdate} is true —
     * currently for SSL_UNTRUSTED/SSL_NOTYETVALID, the two codes most often
     * caused by a stale Android System WebView or a wrong device clock rather
     * than a real attack — an "Update WebView" shortcut to the Play Store and a
     * "Fix date &amp; time" shortcut to the system settings are shown underneath
     * the buttons.
     *
     * <p>There is no "proceed anyway": the connection is always cancelled and the
     * user is shown how to fix the device instead.</p>
     */
    @Override
    public void showSslError(android.webkit.SslErrorHandler handler, String message, String failingUrl,
                             boolean offerWebViewUpdate, boolean isInternalHost) {
        if (pendingSslHandler != null && pendingSslHandler != handler) {
            pendingSslHandler.cancel();
        }
        pendingSslHandler = handler;
        errorWebViewUpdateLink.setVisibility(offerWebViewUpdate ? View.VISIBLE : View.GONE);
        // A clock the device cannot trust is a plausible cause of every
        // certificate code, so this fix is always one tap away.
        errorDateTimeLink.setVisibility(View.VISIBLE);
        displayErrorOverlay(message, failingUrl);
    }

    /**
     * The kind of stored session, or null when signed out. Used by the
     * compatibility screen, which reports it without ever touching the secret.
     */
    String signedInKind() {
        if (victusAuth == null) return null;
        VictusAuth.Session session = victusAuth.currentSession();
        if (session == null) return null;
        return session.isApiKey() ? "api_key" : "session";
    }

    private void displayErrorOverlay(String fullMessage, String failingUrl) {
        lastErrorUrl = failingUrl;
        errorMessage.setText(fullMessage);
        pageProgress.setVisibility(View.GONE);
        if (errorOverlay.getVisibility() != View.VISIBLE) {
            boolean reduceMotion = ThemeManager.isReduceMotion(this);
            errorOverlay.setAlpha(0f);
            errorOverlay.setVisibility(View.VISIBLE);
            errorOverlay.animate().alpha(1f).setDuration(reduceMotion ? 0 : 240).start();
        }
    }

    /**
     * Offers an update for <em>this device's</em> web engine.
     *
     * <p>The provider is asked for rather than assumed: GrapheneOS ships Vanadium,
     * LineageOS and /e/OS ship their own WebView, CalyxOS ships Chromium, and plenty
     * of people run Mulch or Bromite from F-Droid. Sending any of them to
     * {@code com.google.android.webview} — which is what this used to do — leads to a
     * listing they cannot install from.</p>
     *
     * <p>The install route follows what is actually installed, not the ROM: a Play
     * Store client means a Play listing works even on GrapheneOS, and no Play Store
     * means F-Droid (where Mulch lives) or the provider's own page.</p>
     */
    /**
     * The screen a device with no usable web engine gets instead of a crash.
     *
     * <p>Built from plain views, since the whole point is that WebView rendering is
     * unavailable. The install route follows what is actually on the device: the Play
     * Store when there is one, F-Droid (which ships Mulch WebView) otherwise.</p>
     */
    private void showMissingWebViewScreen() {
        android.widget.ScrollView scroll = new android.widget.ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(colorOf(R.color.window_bg));

        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER);
        int pad = dp(28);
        column.setPadding(pad, pad, pad, pad);

        android.widget.ImageView icon = new android.widget.ImageView(this);
        icon.setImageResource(R.drawable.ic_device_24);
        icon.setImageTintList(ColorStateList.valueOf(colorOf(R.color.brand_a)));
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(dp(48), dp(48));
        iconParams.gravity = Gravity.CENTER_HORIZONTAL;
        iconParams.bottomMargin = dp(16);
        icon.setLayoutParams(iconParams);
        column.addView(icon);

        TextView title = new TextView(this);
        title.setText(R.string.webview_missing_title);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setTextColor(colorOf(R.color.title_text));
        title.setGravity(Gravity.CENTER);
        column.addView(title);

        TextView message = new TextView(this);
        message.setText(R.string.webview_missing_message);
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        message.setTextColor(colorOf(R.color.chip_text));
        message.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        messageParams.topMargin = dp(10);
        messageParams.bottomMargin = dp(22);
        message.setLayoutParams(messageParams);
        column.addView(message);

        boolean playStore = DeviceCompat.hasPlayStore(this);
        boolean fDroid = DeviceCompat.hasFDroid(this);
        if (playStore) {
            column.addView(missingWebViewButton(R.string.webview_missing_install_play,
                    () -> openPlayListing("com.google.android.webview")));
        }
        if (fDroid || !playStore) {
            column.addView(missingWebViewButton(
                    fDroid ? R.string.webview_missing_install_fdroid
                            : R.string.webview_missing_install_web,
                    () -> openExternalUrl(RomSupport.fDroidWebViewUrl())));
        }
        column.addView(missingWebViewButton(R.string.webview_missing_retry, this::recreate));

        scroll.addView(column, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(scroll);
    }

    private TextView missingWebViewButton(int labelRes, Runnable action) {
        TextView button = new TextView(this);
        button.setText(labelRes);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        button.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        button.setTextColor(colorOf(R.color.title_text));
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(18), dp(14), dp(18), dp(14));
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(colorOf(R.color.chip_bg));
        shape.setCornerRadius(dp(14));
        shape.setStroke(1, colorOf(R.color.chip_stroke));
        button.setBackground(shape);
        button.setClickable(true);
        button.setOnClickListener(v -> action.run());
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = dp(10);
        button.setLayoutParams(params);
        return button;
    }

    /**
     * Opens the system's date &amp; time settings.
     *
     * <p>A phone whose clock has drifted reports a perfectly valid certificate as
     * expired or not-yet-valid, which is exactly the "error 3 / error 0" report
     * this screen exists for. Nothing here weakens the certificate check — it
     * fixes the one device setting that makes the check fail.</p>
     */
    private void openDateTimeSettings() {
        try {
            Intent intent = new Intent(android.provider.Settings.ACTION_DATE_SETTINGS);
            intent.addCategory(Intent.CATEGORY_DEFAULT);
            startActivity(intent);
        } catch (Exception no_settings) {
            toast(getString(R.string.no_app_to_handle));
        }
    }

    private void openWebViewUpdatePage() {
        String provider = DeviceCompat.webViewProvider(this)[0];

        // 1. A store listing that can actually be acted on. Google's WebView and
        //    Chrome come from the Play Store; Mulch and Bromite come from F-Droid.
        if (provider != null && isPlayStoreWebView(provider)
                && DeviceCompat.hasPlayStore(this) && openPlayListing(provider)) {
            return;
        }
        if (provider != null && isFDroidWebView(provider) && DeviceCompat.hasFDroid(this)) {
            openExternalUrl(RomSupport.fDroidWebViewUrl());
            return;
        }

        // 2. Vanadium, LineageOS WebView, CalyxOS Chromium and friends are *parts of
        //    the ROM*: no store ships them, and updating the system is what updates
        //    them. Saying so is right; sending the user to a listing they cannot
        //    install from is not.
        if (provider != null && isRomBundledWebView(provider)) {
            toast(getString(R.string.webview_updated_by_rom, provider));
            return;
        }

        // 3. No usable provider at all: point at somewhere a WebView really exists.
        if (openPlayListing("com.google.android.webview")) return;
        openExternalUrl(RomSupport.fDroidWebViewUrl());
    }

    private static boolean isPlayStoreWebView(String pkg) {
        return pkg.equals("com.google.android.webview")
                || pkg.equals("com.android.webview")
                || pkg.equals("com.android.chrome");
    }

    private static boolean isFDroidWebView(String pkg) {
        return pkg.equals("us.spotco.mulch_wv") || pkg.equals("com.bromite.webview")
                || pkg.equals("org.bromite.webview");
    }

    private static boolean isRomBundledWebView(String pkg) {
        return pkg.equals("app.vanadium.webview") || pkg.equals("org.lineageos.webview")
                || pkg.equals("org.chromium.chrome") || pkg.equals("com.system.webview");
    }

    /** Opens a Play Store listing. @return true when a store handled the intent */
    private boolean openPlayListing(String pkg) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("market://details?id=" + pkg));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            // resolveActivity needs <queries> on Android 11+; no match means no Play
            // Store client, which is the normal state of a GMS-free ROM.
            if (intent.resolveActivity(getPackageManager()) == null) return false;
            startActivity(intent);
            return true;
        } catch (Exception noStore) {
            return false;
        }
    }

    /** Opens any https URL in whatever app can take it. */
    private void openExternalUrl(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
        } catch (Exception noHandler) {
            toast(getString(R.string.no_app_to_handle));
        }
    }

    private void hideErrorOverlay() {
        if (errorOverlay == null || errorOverlay.getVisibility() != View.VISIBLE) return;
        errorOverlay.animate().cancel();
        errorOverlay.animate().alpha(0f).setDuration(160)
                .withEndAction(() -> errorOverlay.setVisibility(View.GONE)).start();
    }

    // ============================================================== downloads

    /**
     * Scoped-storage-safe download listener. Downloads run on a background
     * thread (never the UI thread) and land in {@code Downloads/VictusCloud} via
     * MediaStore on API 29+ — no storage permission needed on modern Android.
     * Only API 23–28 still request WRITE_EXTERNAL_STORAGE, and only right when a
     * download starts.
     */
    android.webkit.DownloadListener createDownloadListener() {
        return (url, userAgent, contentDisposition, mimeType, contentLength) -> {
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            if (Build.VERSION.SDK_INT <= 28
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                            != PackageManager.PERMISSION_GRANTED) {
                pendingDownload = new PendingDownload(url, fileName, mimeType, userAgent);
                storagePermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE);
                return;
            }
            startDownload(url, fileName, mimeType, userAgent);
        };
    }

    private void onStoragePermissionResult(boolean granted) {
        if (granted && pendingDownload != null) {
            startDownload(pendingDownload.url, pendingDownload.fileName,
                    pendingDownload.mimeType, pendingDownload.userAgent);
        } else {
            toast(getString(R.string.download_permission_denied));
        }
        pendingDownload = null;
    }

    private void startDownload(String url, String fileName, String mimeType, String userAgent) {
        toast(getString(R.string.downloading, fileName));
        DownloadTask.enqueue(this, url, fileName, mimeType, userAgent, new DownloadTask.Callback() {
            @Override public void onSuccess(String savedName) {
                toast(getString(R.string.download_done, savedName));
            }

            @Override public void onFailure(String reason) {
                toast(getString(R.string.download_failed, reason));
            }
        });
    }

    private static final class PendingDownload {
        final String url; final String fileName; final String mimeType; final String userAgent;
        PendingDownload(String url, String fileName, String mimeType, String userAgent) {
            this.url = url; this.fileName = fileName;
            this.mimeType = mimeType; this.userAgent = userAgent;
        }
    }

    // ============================================================ file picker

    /** Called by {@link VictusChromeClient#onShowFileChooser}. Runs the system
     *  document picker — URI grants, so no storage permission is required. */
    boolean openFilePicker(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (filePathCallback != null) filePathCallback.onReceiveValue(null);
        filePathCallback = callback;
        try {
            Intent intent = params.createIntent(); // honors accept types + multi-select
            filePickerLauncher.launch(intent);
            return true;
        } catch (Exception e) {
            filePathCallback = null;
            return false;
        }
    }

    private void onFilePicked(ActivityResult result) {
        if (filePathCallback == null) return;
        Uri[] uris = null;
        Intent data = result.getData();
        if (result.getResultCode() == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                ClipData clip = data.getClipData();
                uris = new Uri[clip.getItemCount()];
                for (int i = 0; i < clip.getItemCount(); i++) uris[i] = clip.getItemAt(i).getUri();
            } else if (data.getData() != null) {
                uris = new Uri[]{data.getData()};
            }
        }
        filePathCallback.onReceiveValue(uris);
        filePathCallback = null;
    }

    // ================================================================== admin areas

    /** Immutable snapshot of which admin areas the account may use. */
    private static final class AdminAreaState {
        final String[] areas;

        AdminAreaState(String[] areas) {
            this.areas = areas == null ? new String[0] : areas;
        }
    }

    /**
     * The admin areas this release knows about. Each entry is a base URL the
     * account must be allowed to use; the panel enforces the actual permission
     * on every request — a client-side "yes" here only decides whether the app
     * shows the view-toggle, it never grants anything.
     *
     * <p>If Victus adds more admin surfaces, add their base URLs here and to the
     * web menu's mapping — nothing else needs to change.</p>
     */
    private static final String[] KNOWN_ADMIN_AREAS = {
            "https://control.victuscloud.com/admin",
    };

    /** Latest admin-area snapshot; null until the first silent check completes. */
    private final java.util.concurrent.atomic.AtomicReference<AdminAreaState> adminAreas =
            new java.util.concurrent.atomic.AtomicReference<>(null);

    /**
     * Never run two admin-area probes closer together than this.
     *
     * <p>{@link #onResume()} fires every time the user comes back to the app —
     * unlocking the phone, returning from another app, rotating — and each call
     * would otherwise be a network round trip. A role cannot realistically change
     * faster than this, so a short floor keeps resume free while still reacting
     * well within a session. A sign-in always bypasses the floor, because that is
     * the one moment the answer genuinely must be fresh.</p>
     */
    private static final long ADMIN_AREA_CHECK_MIN_INTERVAL_MS = 30_000L;

    /** When the last probe was queued, for the interval floor above. */
    private final java.util.concurrent.atomic.AtomicLong lastAdminAreaCheck =
            new java.util.concurrent.atomic.AtomicLong(0L);

    /**
     * Silently re-checks which admin areas the signed-in account may use. Runs
     * on the serial auth thread, touches no UI, shows no spinner, logs nothing.
     * A failure (offline, panel busy) simply leaves the previous snapshot in
     * place — the panel re-validates every admin request anyway, so a stale
     * toggle can at worst show a button whose page then says "no permission".
     */
    /**
     * Reads the freshly probed account and keeps only the areas the panel
     * actually flagged this account for. Run on the auth thread after the
     * account fetch; never touches the UI thread.
     */
    void startAdminAreaCheck() {
        startAdminAreaCheck(false);
    }

    /**
     * @param force skip the interval floor — used right after a sign-in, where the
     *              account (and therefore the role) has just changed.
     */
    void startAdminAreaCheck(boolean force) {
        final VictusAuth auth = victusAuth;
        if (auth == null || !auth.isSignedIn()) {
            adminAreas.set(new AdminAreaState(new String[0]));
            return;
        }

        long now = System.currentTimeMillis();
        long previous = lastAdminAreaCheck.get();
        if (!force && previous > 0L && now - previous < ADMIN_AREA_CHECK_MIN_INTERVAL_MS) {
            return;
        }
        // Claim the slot before the thread starts, so a burst of resumes can only
        // ever queue one probe rather than one per resume.
        if (!lastAdminAreaCheck.compareAndSet(previous, now)) return;

        authIo.execute(() -> {
            VictusHttp.Response account = auth.apiGet(VictusApi.PATH_ACCOUNT);
            VictusApi.Account parsed = VictusApi.parseAccount(account.body);
            if (parsed == null || !parsed.rootAdmin) {
                // Not an admin (or the check failed): an empty list means the
                // web menu renders nothing admin-related at all.
                adminAreas.set(new AdminAreaState(new String[0]));
                return;
            }
            adminAreas.set(new AdminAreaState(KNOWN_ADMIN_AREAS));
        });
    }

    // ================================================================== misc

    /** Records which tab the shell itself navigated to (see {@link #selectedDock}). */
    void markDockSelection(String url) {
        if (url == null) return;
        String host = Uri.parse(url).getHost() == null ? ""
                : Uri.parse(url).getHost().toLowerCase(java.util.Locale.US);
        String path = Uri.parse(url).getPath() == null ? "" : Uri.parse(url).getPath();
        if (ASSETS_HOST.equals(host)) selectedDock = TAB_HOME;
        else if (host.equals("billing.victuscloud.com")) selectedDock = TAB_BILLING;
        else if (host.equals("control.victuscloud.com")) selectedDock = TAB_CONTROL;
        else if (host.equals("drive.victuscloud.com")) selectedDock = TAB_DRIVE;
        // TAB_DRIVE is declared next to its siblings above.
        else if (host.equals("victuscloud.com") || host.equals("www.victuscloud.com")) {
            if (path.startsWith("/support")) selectedDock = TAB_SUPPORT;
            else if (path.startsWith("/status")) selectedDock = TAB_STATUS;
            else selectedDock = TAB_WEBSITE;
        }
    }

    /** The URL currently loaded in the shell's WebView (never null). */
    String currentPageUrl() {
        return webView != null && webView.getUrl() != null ? webView.getUrl() : HOME_URL;
    }

    /**
     * Snapshot for the web menu: update availability + the admin view-toggle
     * state for the page currently loaded. Pure reads, no I/O — safe to call
     * from JavaScript at any time.
     */
    String shellUiStateJson() {
        org.json.JSONObject json = new org.json.JSONObject();
        try {
            json.put("updateAvailable", UpdateChecker.availableVersionName(this) != null);
            String available = UpdateChecker.availableVersionName(this);
            json.put("updateVersion", available == null ? "" : available);
            json.put("currentUrl", currentPageUrl());
            json.put("canGoBack", webView != null && webView.canGoBack());
            json.put("reduceMotion", ThemeManager.isReduceMotion(this));
            org.json.JSONArray areas = new org.json.JSONArray();
            AdminAreaState snapshot = adminAreas.get();
            if (snapshot != null && adminAreaAppliesToCurrentPage(snapshot)) {
                for (String area : snapshot.areas) {
                    areas.put(area);
                }
            }
            json.put("adminAreas", areas);
        } catch (Exception never) {
            // JSON with fixed keys cannot throw here.
        }
        return json.toString();
    }

    /**
     * The admin areas this signed-in account may use, as JSON for the bridge.
     * Empty array for non-admins — the web menu renders nothing at all for them.
     */
    String adminAreasJson() {
        org.json.JSONArray areas = new org.json.JSONArray();
        AdminAreaState snapshot = adminAreas.get();
        if (snapshot != null) {
            for (String area : snapshot.areas) {
                areas.put(area);
            }
        }
        return areas.toString();
    }

    /**
     * Whether any of the account's admin areas matches the page on screen right
     * now — the toggle is per-area and only appears on that area's own pages.
     */
    private boolean adminAreaAppliesToCurrentPage(AdminAreaState snapshot) {
        if (snapshot.areas.length == 0) return false;
        Uri uri = Uri.parse(currentPageUrl());
        String host = uri.getHost() == null ? ""
                : uri.getHost().toLowerCase(java.util.Locale.US);
        String path = uri.getPath() == null ? "" : uri.getPath().toLowerCase(java.util.Locale.US);
        for (String area : snapshot.areas) {
            Uri areaUri = Uri.parse(area);
            String areaHost = areaUri.getHost() == null ? ""
                    : areaUri.getHost().toLowerCase(java.util.Locale.US);
            String areaPath = areaUri.getPath() == null ? ""
                    : areaUri.getPath().toLowerCase(java.util.Locale.US);
            if (host.equals(areaHost) && (areaPath.isEmpty() || path.startsWith(areaPath))) {
                return true;
            }
        }
        return false;
    }

    private void loadUrlInternal(String url) {
        hideErrorOverlay();
        webView.loadUrl(url);
    }

    private void loadTab(int index) {
        String target = DOCK_URLS[index];
        // Avoid a full WebView reload when the page is already there.
        if (target.equals(webView.getUrl())) return;
        selectedDock = index;
        loadUrlInternal(target);
    }

    /** WebView history → (error overlay → Home) → Home tab → exit. Predictive-back safe. */
    private boolean handleWebBackNavigation() {
        if (errorOverlay != null && errorOverlay.getVisibility() == View.VISIBLE) {
            hideErrorOverlay();
            // Don't stare at a blank failed page — retreat to Home instead.
            loadUrlInternal(HOME_URL);
            selectedDock = TAB_HOME;
            return true;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        if (selectedDock != TAB_HOME) {
            loadTab(TAB_HOME);
            return true;
        }
        return false;
    }

    /**
     * Native bridge for the bundled React app ({@code window.VictusNative}).
     *
     * <p>Two capabilities, both filtered. {@code addJavascriptInterface} is
     * per-WebView rather than per-origin, so any page this shell loads can reach
     * the bridge, which is why nothing here trusts its caller:</p>
     *
     * <ul>
     *   <li><b>Navigation</b> — {@link #openWebView} / {@link #openBrowser} accept
     *       only what {@link InAppLinks} allows (https, Victus hosts, no embedded
     *       credentials), and they return no data.</li>
     *   <li><b>Authentication</b> — the {@code auth*} methods are refused unless the
     *       bundled app is the page in the shell
     *       ({@link MainActivity#bundledAppForeground}), because the dock can point
     *       this same WebView at {@code victuscloud.com} and a page on that origin
     *       must not inherit the user's panel session.</li>
     * </ul>
     *
     * <p>The session's secret never crosses the bridge: an API key is attached to
     * panel requests natively by {@link VictusAuth}, and the replies JavaScript
     * sees carry the account (name, email, admin flag), not the credential.</p>
     */
    private static final class WebAppBridge {
        private final MainActivity activity;

        WebAppBridge(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public void openWebView(String url, String title) {
            final String target = InAppLinks.toInAppHttpsUrl(url);
            if (target == null) return; // foreign or unsafe URL: ignore it
            final String label = InAppLinks.sanitizeTitle(title,
                    activity.getString(R.string.browser_title));
            // Bridge calls arrive on a WebView thread, never the UI thread.
            activity.runOnUiThread(() -> {
                if (activity.isFinishing() || activity.isDestroyed()) return;
                activity.showInAppBrowser(target, label);
            });
        }

        /**
         * Shell state the single (web) menu wants to show: whether an app update
         * is available and whether the admin view-toggle applies to the page
         * currently loaded. Synchronous — a pure snapshot, no I/O, so it is safe
         * to call from JS at any moment.
         */
        @JavascriptInterface
        public String shellUiState() {
            return activity.shellUiStateJson();
        }

        /** System back: walks WebView history like the gesture does. */
        @JavascriptInterface
        public void shellBack() {
            activity.runOnUiThread(() -> {
                if (activity.isFinishing() || activity.isDestroyed()) return;
                activity.handleWebBackNavigation();
            });
        }

        /** Reload the current page — the web header's refresh button. */
        @JavascriptInterface
        public void shellRefresh() {
            activity.runOnUiThread(() -> {
                if (activity.isFinishing() || activity.isDestroyed()) return;
                activity.hideErrorOverlay();
                if (activity.webView != null) activity.webView.reload();
            });
        }

        /**
         * Navigate the shell's WebView to an allowlisted Victus URL — how the
         * single web menu's channel chips drive the shell.
         */
        @JavascriptInterface
        public void shellNavigate(String url) {
            final String target = InAppLinks.toInAppHttpsUrl(url);
            if (target == null) return;
            activity.runOnUiThread(() -> {
                if (activity.isFinishing() || activity.isDestroyed()) return;
                activity.markDockSelection(target);
                activity.loadUrlInternal(target);
            });
        }

        /**
         * Opens the native Appearance sheet (the glass one) on top of the web
         * menu — the ported Tools → Settings entry.
         */
        @JavascriptInterface
        public void shellOpenNativeMenu(String which) {
            activity.runOnUiThread(() -> {
                if (activity.isFinishing() || activity.isDestroyed()) return;
                if ("updates".equals(which)) {
                    UpdateSheet.show(activity);
                } else if ("device".equals(which)) {
                    CompatSheet.show(activity);
                } else {
                    SettingsSheet.show(activity);
                }
            });
        }

        /**
         * Wipes WebView cookies/storage/cache after the web menu's own
         * confirmation modal — the ported Tools → Clear app session.
         */
        @JavascriptInterface
        public void shellClearSession() {
            activity.runOnUiThread(() -> {
                if (activity.isFinishing() || activity.isDestroyed()) return;
                activity.confirmClearSession();
            });
        }

        /**
         * "Open in browser" for the CURRENT shell page (the ported Tools entry).
         * Hands the page's own URL to the device browser; no data crosses here.
         */
        @JavascriptInterface
        public void shellOpenExternal() {
            final String current = activity.currentPageUrl();
            final String target = InAppLinks.toExternalHttpsUrl(current);
            if (target == null) return;
            activity.runOnUiThread(() -> {
                if (activity.isFinishing() || activity.isDestroyed()) return;
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(target));
                    intent.addCategory(Intent.CATEGORY_BROWSABLE);
                    activity.startActivity(intent);
                } catch (Exception e) {
                    Toast.makeText(activity, R.string.no_app_to_handle, Toast.LENGTH_SHORT).show();
                }
            });
        }

        /**
         * Which admin areas (if any) the signed-in account may use. The web menu
         * shows the admin view-toggle only for areas listed here; a normal user
         * gets an empty list and never sees anything admin-related.
         */
        @JavascriptInterface
        public String shellAdminAreas() {
            return activity.adminAreasJson();
        }

        /**
         * The authenticator's 30-second window, on the panel's clock.
         *
         * <p>Synchronous and side-effect free: it only reports seconds remaining,
         * whether a real server sample has been taken, and by how much the device
         * clock differs from the panel's. No code, no secret and no account data
         * crosses here — the sign-in screen uses it to show exactly when the next
         * code begins, so a wrong phone clock cannot cause a rejection.</p>
         */
        @JavascriptInterface
        public String authTotpState() {
            VictusAuth auth = activity.victusAuth;
            if (auth == null) {
                return "{\"secondsRemaining\":30,\"millisUntilNext\":30000,"
                        + "\"periodSeconds\":30,\"synced\":false,\"offsetMillis\":0}";
            }
            return auth.totpStateJson();
        }

        /** "Open in browser": hands an https page to the device browser. */
        @JavascriptInterface
        public void openBrowser(String url) {
            final String target = InAppLinks.toExternalHttpsUrl(url);
            if (target == null) return;
            activity.runOnUiThread(() -> {
                if (activity.isFinishing() || activity.isDestroyed()) return;
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(target));
                    intent.addCategory(Intent.CATEGORY_BROWSABLE);
                    activity.startActivity(intent);
                } catch (Exception e) {
                    Toast.makeText(activity, R.string.no_app_to_handle, Toast.LENGTH_SHORT).show();
                }
            });
        }

        // ---------------------------------------------------------- sign-in

        /**
         * Email (or username) plus password against
         * {@code control.victuscloud.com}. Resolves with
         * {@code state:"signed_in"}, {@code state:"two_factor_required"} (then call
         * {@link #authSubmitTwoFactor}) or {@code state:"error"} carrying the
         * panel's own message.
         */
        @JavascriptInterface
        public void authSignIn(String user, String password, String callbackId) {
            final long id = parseCallbackId(callbackId);
            if (id < 0) return;
            if (!activity.allowAuthCall(id)) return;
            activity.runAuthTask(id, () -> activity.victusAuth.signIn(user, password).toJson());
        }

        /** The second factor: a 6-digit authenticator code, or a recovery code. */
        @JavascriptInterface
        public void authSubmitTwoFactor(String confirmationToken, String code, String callbackId) {
            final long id = parseCallbackId(callbackId);
            if (id < 0) return;
            if (!activity.allowAuthCall(id)) return;
            activity.runAuthTask(id, () ->
                    activity.victusAuth.submitTwoFactor(confirmationToken, code).toJson());
        }

        /** Sign in with a key from the panel's Account → API Credentials screen. */
        @JavascriptInterface
        public void authSignInWithApiKey(String apiKey, String callbackId) {
            final long id = parseCallbackId(callbackId);
            if (id < 0) return;
            if (!activity.allowAuthCall(id)) return;
            activity.runAuthTask(id, () -> activity.victusAuth.signInWithApiKey(apiKey).toJson());
        }

        /** Restores and re-validates the stored session (called once on app start). */
        @JavascriptInterface
        public void authRestore(String callbackId) {
            final long id = parseCallbackId(callbackId);
            if (id < 0) return;
            if (!activity.allowAuthCall(id)) return;
            activity.runAuthTask(id, () -> activity.victusAuth.restore().toJson());
        }

        /**
         * Asks the panel to email a password-reset link. Resolves with the panel's
         * own confirmation text ({@code state:"info"}) or its error message.
         */
        @JavascriptInterface
        public void authPasswordReset(String email, String callbackId) {
            final long id = parseCallbackId(callbackId);
            if (id < 0) return;
            if (!activity.allowAuthCall(id)) return;
            activity.runAuthTask(id, () -> activity.victusAuth.requestPasswordReset(email).toJson());
        }

        /**
         * An authenticated {@code GET /api/client…} through the stored session.
         * The page never sees the credential; it only sees the panel's response,
         * and only for a path inside the client API.
         */
        @JavascriptInterface
        public void apiGet(String path, String callbackId) {
            final long id = parseCallbackId(callbackId);
            if (id < 0) return;
            if (!activity.allowAuthCall(id)) return;
            activity.runAuthTask(id, () -> {
                if (!VictusApi.isAcceptableApiPath(path)) {
                    return bridgeError("The app only reads " + VictusApi.API_PATH_PREFIX + "…");
                }
                return apiPayload(activity.victusAuth.apiGet(path));
            });
        }

        /**
         * An authenticated {@code POST /api/client…}: power actions and console
         * commands. Same allowlist as {@link #apiGet}, and the credential is still
         * attached natively.
         */
        @JavascriptInterface
        public void apiPost(String path, String body, String callbackId) {
            final long id = parseCallbackId(callbackId);
            if (id < 0) return;
            if (!activity.allowAuthCall(id)) return;
            activity.runAuthTask(id, () -> {
                if (!VictusApi.isAcceptableApiPath(path)) {
                    return bridgeError("The app only calls " + VictusApi.API_PATH_PREFIX + "…");
                }
                return apiPayload(activity.victusAuth.apiPost(path, body));
            });
        }

        /** The shared shape every panel response is handed to the page in. */
        private static String apiPayload(VictusHttp.Response response) {
            JSONObject json = new JSONObject();
            try {
                json.put("ok", response.isSuccess());
                json.put("state", response.isSuccess() ? "ok" : "error");
                json.put("status", response.status);
                json.put("body", response.body);
                if (response.failure != null) json.put("message", response.failure);
            } catch (Exception impossible) {
                // JSONObject.put only rejects null keys.
            }
            return json.toString();
        }

        /**
         * Signs out. {@code revokeKey} also deletes the API key this app created,
         * so pressing "Sign out" does not leave a live credential on the panel.
         */
        @JavascriptInterface
        public void authSignOut(boolean revokeKey, String callbackId) {
            final long id = parseCallbackId(callbackId);
            if (id < 0) return;
            if (!activity.allowAuthCall(id)) return;
            activity.runAuthTask(id, () -> activity.victusAuth.signOut(revokeKey).toJson());
        }

        private static long parseCallbackId(String raw) {
            if (raw == null) return -1;
            try {
                long id = Long.parseLong(raw.trim());
                return id >= 0 ? id : -1;
            } catch (NumberFormatException notANumber) {
                return -1;
            }
        }
    }

    /**
     * Gate for the auth half of the bridge. Answers the caller either way, so a
     * refusal surfaces as an error in the UI instead of a promise that never
     * settles.
     */
    private boolean allowAuthCall(long callbackId) {
        if (victusAuth == null) {
            deliverAuthResult(callbackId, bridgeError("The app is still starting up. Try again."));
            return false;
        }
        if (!bundledAppForeground) {
            deliverAuthResult(callbackId, bridgeError(
                    "Sign-in is only available in the Victus Cloud app."));
            return false;
        }
        return true;
    }

    /** Runs an auth call on the serial auth thread and resolves the JS callback. */
    private void runAuthTask(long callbackId, AuthTask task) {
        authIo.execute(() -> {
            String payload;
            try {
                payload = task.run();
            } catch (Exception failure) {
                payload = bridgeError("Couldn't complete that: " + failure.getClass().getSimpleName());
            }
            // A fresh session may carry a different role: probe the admin areas
            // once, in the background, before handing the reply to the page.
            if (payload.contains("\"state\":\"signed_in\"")) {
                startAdminAreaCheck(true);
            }
            deliverAuthResult(callbackId, payload);
        });
    }

    /** A blocking auth call returning the JSON payload for the page. */
    private interface AuthTask {
        String run();
    }

    /** Resolves the page's pending promise: {@code __victusBridge.resolve(id, json)}. */
    private void deliverAuthResult(long callbackId, String payload) {
        runOnUiThread(() -> {
            if (webView == null || isFinishing() || isDestroyed()) return;
            String script = "(window.__victusBridge && window.__victusBridge.resolve("
                    + callbackId + "," + JSONObject.quote(payload) + "))";
            try {
                webView.evaluateJavascript(script, null);
            } catch (Exception torn_down) {
                // Nothing to deliver to any more; not worth crashing over.
            }
        });
    }

    /** The bridge's error payload shape, shared by every refusal path. */
    static String bridgeError(String message) {
        JSONObject json = new JSONObject();
        try {
            json.put("ok", false);
            json.put("state", "error");
            json.put("message", message);
        } catch (Exception impossible) {
            // JSONObject.put only rejects null keys, which cannot happen here.
        }
        return json.toString();
    }

    private int colorOf(int resId) {
        return ContextCompat.getColor(this, resId);
    }

    private int resolveAttr(int attr) {
        TypedValue value = new TypedValue();
        getTheme().resolveAttribute(attr, value, true);
        return value.resourceId;
    }

    /** Density-independent pixels — the ONLY way sizes are computed here. */
    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void toast(CharSequence message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }
}

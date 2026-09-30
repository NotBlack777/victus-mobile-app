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
 *   <li>{@link #createLayout()} — native chrome: top bar + horizontally scrolling dock</li>
 *   <li>{@link #configureWebView()} — WebView settings, no deprecated APIs</li>
 *   <li>{@link #createErrorOverlay()} — native error screen, animator-driven fades</li>
 *   <li>{@link #createDownloadListener()} — scoped-storage-safe downloads</li>
 *   <li>{@link #confirmClearSession()} — cookie/storage/cache wipe with confirmation</li>
 *   <li>{@link #showToolsMenu()} — share/copy/open-in-browser/tools sheet</li>
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
    private static final String[] DOCK_URLS = {
            HOME_URL,                                  // Home
            "https://victuscloud.com",                 // Website
            "https://billing.victuscloud.com",         // Billing
            "https://control.victuscloud.com",         // Control
            "https://drive.victuscloud.com",           // Drive
            "https://victuscloud.com/support",         // Support
            "https://victuscloud.com/status",          // Status
    };
    private static final int[] DOCK_LABELS = {
            R.string.tab_home, R.string.tab_website, R.string.tab_billing,
            R.string.tab_control, R.string.tab_drive, R.string.tab_support, R.string.tab_status,
    };

    private static final String KEY_SELECTED_TAB = "selected_tab";
    /** URI scheme used by the launcher shortcuts (res/xml/shortcuts.xml). */
    private static final String SHORTCUT_SCHEME = "victus";

    // ------------------------------------------------------------------- views

    private FrameLayout rootView;
    private LinearLayout topBar;
    private ImageButton backButton;
    private ImageButton toolsButton;
    /** Dot shown on the tools button when a newer build is known to exist. */
    private View updateBadge;
    /** Set when a launcher shortcut asked for the updater directly. */
    private boolean pendingUpdateSheet;
    private ProgressBar pageProgress;
    private SwipeRefreshLayout pullRefresh;
    private WebView webView;
    private HorizontalScrollView dockScroller;
    private LinearLayout dockRow;
    private final TextView[] dockChips = new TextView[DOCK_URLS.length];
    private FrameLayout errorOverlay;
    private TextView errorMessage;
    private TextView errorGlyph;
    private TextView errorRetryButton;
    private TextView errorProceedButton;
    private TextView errorWebViewUpdateLink;
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
    /** -1 = no tab styled yet. Forces the very first {@link #selectDock} call
     *  to actually apply the "selected" style instead of being skipped by the
     *  no-op fast path (which compares against the previous selection). */
    private int selectedDock = -1;
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
            selectDock(restoredTab, false);
        } else {
            String startUrl = resolveStartUrl(getIntent());
            if (startUrl == null) startUrl = HOME_URL;
            loadUrlInternal(startUrl);
            selectDock(indexForUrl(startUrl), false);
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
            selectDock(indexForUrl(url), false);
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
     * Builds the native chrome around the WebView: a compact top bar
     * (Back / title / Refresh / Tools), a thin page-progress bar, the WebView
     * itself, and the dock row. Everything is measured in dp — nothing is a raw
     * pixel value, so every density bucket renders identically in physical size.
     */
    private void createLayout() {
        rootView = new FrameLayout(this);

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);

        buildTopBar(content);

        // Thin progress bar directly under the top bar.
        pageProgress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        pageProgress.setMax(100);
        pageProgress.setProgressTintList(ColorStateList.valueOf(ThemeManager.solid(this)));
        pageProgress.setVisibility(View.GONE);
        content.addView(pageProgress,
                new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(3)));

        webView = new WebView(this);
        webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
        LinearLayout.LayoutParams webParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);

        // Pull-to-refresh on the whole content column; disabled while the page
        // loads so a refresh can't stack on itself. Only our bundled home screen
        // and Victus Cloud pages are refreshable (external sites keep their own
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
        content.addView(pullRefresh, webParams);

        buildDock(content);

        rootView.addView(content, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        createErrorOverlay();

        setContentView(rootView);
        applyWindowInsets();
    }

    /** Back / title / Refresh / Tools, 48dp touch targets throughout. */
    private void buildTopBar(LinearLayout content) {
        topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setBackgroundColor(colorOf(R.color.surface_topbar));
        topBar.setPadding(dp(8), dp(6), dp(8), dp(6));
        topBar.setElevation(dp(3));
        content.addView(topBar, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        int ripple = resolveAttr(android.R.attr.selectableItemBackgroundBorderless);

        backButton = new ImageButton(this);
        backButton.setImageResource(R.drawable.ic_arrow_back_24);
        backButton.setColorFilter(colorOf(R.color.icon_tint));
        backButton.setBackgroundResource(ripple);
        backButton.setContentDescription(getString(R.string.action_back));
        backButton.setOnClickListener(v -> handleWebBackNavigation());
        topBar.addView(backButton, new LinearLayout.LayoutParams(dp(48), dp(48)));

        TextView title = new TextView(this);
        title.setText(R.string.app_name);
        title.setTextSize(18); // SP — scales with the user's font preference
        title.setTextColor(colorOf(R.color.title_text));
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        title.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        titleParams.setMarginStart(dp(12));
        topBar.addView(title, titleParams);

        ImageButton refresh = new ImageButton(this);
        refresh.setImageResource(R.drawable.ic_refresh_24);
        refresh.setColorFilter(colorOf(R.color.icon_tint));
        refresh.setBackgroundResource(ripple);
        refresh.setContentDescription(getString(R.string.action_refresh));
        refresh.setOnClickListener(v -> {
            hideErrorOverlay();
            webView.reload();
        });
        topBar.addView(refresh, new LinearLayout.LayoutParams(dp(48), dp(48)));

        ImageButton tools = new ImageButton(this);
        tools.setImageResource(R.drawable.ic_more_vert_24);
        tools.setColorFilter(colorOf(R.color.icon_tint));
        tools.setBackgroundResource(ripple);
        tools.setContentDescription(getString(R.string.action_tools));
        tools.setOnClickListener(v -> showToolsMenu());
        toolsButton = tools;

        // The badge is a sibling of the button inside a wrapper, so it sits in
        // the corner without touching the button's own 48dp touch target.
        FrameLayout toolsWrap = new FrameLayout(this);
        toolsWrap.addView(tools, new FrameLayout.LayoutParams(dp(48), dp(48)));

        GradientDrawable dot = new GradientDrawable();
        dot.setShape(GradientDrawable.OVAL);
        dot.setColor(colorOf(R.color.brand_a));

        updateBadge = new View(this);
        updateBadge.setBackground(dot);
        updateBadge.setVisibility(View.GONE);

        FrameLayout.LayoutParams badgeParams = new FrameLayout.LayoutParams(dp(9), dp(9));
        badgeParams.gravity = Gravity.TOP | Gravity.END;
        badgeParams.topMargin = dp(10);
        badgeParams.rightMargin = dp(10);
        toolsWrap.addView(updateBadge, badgeParams);

        topBar.addView(toolsWrap, new LinearLayout.LayoutParams(dp(48), dp(48)));

        // Hairline divider under the top bar.
        View divider = new View(this);
        divider.setBackgroundColor(colorOf(R.color.divider));
        content.addView(divider, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(1)));
    }

    /**
     * THE FIX for the tab-bar bug in the original APK: the dock is a proper
     * {@link HorizontalScrollView} whose chips are wrap-content with generous
     * horizontal padding. Labels are single-line but never ellipsized and never
     * fixed-width, so "Control" (or any future label) can never be clipped at any
     * screen width or density — the row simply scrolls. chipToVisible() keeps the
     * active tab on screen, including on very small phones.
     */
    private void buildDock(LinearLayout content) {
        View divider = new View(this);
        divider.setBackgroundColor(colorOf(R.color.divider));
        content.addView(divider, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(1)));

        dockScroller = new HorizontalScrollView(this);
        dockScroller.setHorizontalScrollBarEnabled(false);
        dockScroller.setOverScrollMode(View.OVER_SCROLL_NEVER);
        dockScroller.setClipToPadding(false); // let chips scroll into the gesture-nav inset
        dockScroller.setBackgroundColor(colorOf(R.color.surface_topbar));

        dockRow = new LinearLayout(this);
        dockRow.setOrientation(LinearLayout.HORIZONTAL);
        dockRow.setGravity(Gravity.CENTER_VERTICAL);
        dockScroller.addView(dockRow);

        for (int i = 0; i < DOCK_URLS.length; i++) {
            dockChips[i] = buildDockChip(i);
            dockRow.addView(dockChips[i]);
        }

        content.addView(dockScroller, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
    }

    private TextView buildDockChip(final int index) {
        TextView chip = new TextView(this);
        chip.setText(DOCK_LABELS[index]);
        chip.setTextSize(14); // SP
        chip.setTypeface(chip.getTypeface(), android.graphics.Typeface.BOLD);
        chip.setSingleLine(true);
        chip.setGravity(Gravity.CENTER);
        chip.setMinHeight(dp(48));               // ≥48dp touch target at every density
        chip.setPadding(dp(18), 0, dp(18), 0);
        chip.setForeground(ContextCompat.getDrawable(this, resolveAttr(android.R.attr.selectableItemBackground)));
        chip.setOnClickListener(v -> {
            // Light tick on tab switches — same feedback family as the menu.
            try {
                if (Build.VERSION.SDK_INT >= 27) {
                    chip.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP,
                            HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING);
                } else {
                    chip.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                }
            } catch (Exception ignored) {
                // Haptics are a nicety — never a crash.
            }
            loadTab(index);
        });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        if (index < DOCK_URLS.length - 1) params.setMarginEnd(dp(8));
        chip.setLayoutParams(params);
        styleChip(chip, false);
        return chip;
    }

    /** Selected = live theme gradient; unselected = glassy chip with a soft stroke. */
    private void styleChip(TextView chip, boolean selected) {
        GradientDrawable bg;
        if (selected) {
            bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, ThemeManager.gradient(this));
            chip.setTextColor(colorOf(R.color.chip_text_selected));
        } else {
            bg = new GradientDrawable();
            bg.setColor(colorOf(R.color.chip_bg));
            bg.setStroke(dp(1), colorOf(R.color.chip_stroke));
            chip.setTextColor(colorOf(R.color.chip_text));
        }
        bg.setCornerRadius(dp(24));
        chip.setBackground(bg);
    }

    /**
     * Only restyles the chip(s) whose selected state actually changes.
     * {@code onPageLoadStarted}/{@code onPageLoadFinished} call this on every
     * navigation event (redirects, in-page link taps, etc.), so re-allocating
     * a {@link GradientDrawable} and re-invalidating all 7 chips every single
     * time — even when the active tab hasn't changed — was pure wasted work.
     */
    private void selectDock(int index, boolean animate) {
        if (index < 0 || index >= DOCK_URLS.length) index = TAB_HOME;
        int previous = selectedDock;
        selectedDock = index;
        if (previous != index && previous >= 0 && previous < dockChips.length) {
            TextView old = dockChips[previous];
            old.animate().cancel();
            old.setScaleX(1f);
            old.setScaleY(1f);
            styleChip(old, false);
        }
        if (previous != index) {
            final TextView chip = dockChips[index];
            chip.animate().cancel();
            chip.setScaleX(1f);
            chip.setScaleY(1f);
            styleChip(chip, true);
            if (animate && !ThemeManager.isReduceMotion(this)) {
                // Animator-driven pulse — choreographed, not a fixed-frame hack.
                chip.animate().scaleX(1.07f).scaleY(1.07f).setDuration(110)
                        .withEndAction(() -> chip.animate()
                                .scaleX(1f).scaleY(1f).setDuration(130).start())
                        .start();
            }
        }
        chipToVisible(index);
    }

    private void chipToVisible(int index) {
        dockScroller.post(() -> {
            View chip = dockChips[index];
            int target = chip.getLeft() - dp(24);
            dockScroller.smoothScrollTo(Math.max(target, 0), 0);
        });
    }

    private void loadTab(int index) {
        String target = DOCK_URLS[index];
        // Avoid a full WebView reload when the user taps the tab they're already on.
        if (index == selectedDock && target.equals(webView.getUrl())) return;
        selectDock(index, true);
        loadUrlInternal(target);
    }

    private void loadUrlInternal(String url) {
        hideErrorOverlay();
        webView.loadUrl(url);
    }

    /** Highlights the chip matching the loaded host (kept in sync on navigation). */
    private int indexForUrl(String url) {
        if (url == null) return selectedDock;
        Uri uri = Uri.parse(url);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(java.util.Locale.US);
        // Exact match only — a substring/contains() check here would be
        // vacuously true for an empty host and could false-match any real
        // domain that happens to be a substring of ASSETS_ORIGIN.
        if (ASSETS_HOST.equals(host)) return TAB_HOME;
        String path = uri.getPath() == null ? "" : uri.getPath();
        switch (host) {
            case "billing.victuscloud.com": return 2;
            case "control.victuscloud.com": return 3;
            case "drive.victuscloud.com":   return 4;
            case "victuscloud.com":
            case "www.victuscloud.com":
                if (path.startsWith("/support")) return 5;
                if (path.startsWith("/status"))  return 6;
                return 1;
            default:
                return selectedDock; // external page — leave selection untouched
        }
    }

    /**
     * Edge-to-edge done right: the status-bar inset goes to the top bar and the
     * gesture-nav/IME inset goes to the dock, measured from WindowInsets instead
     * of hardcoded padding.
     */
    private void applyWindowInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(rootView, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());

            topBar.setPadding(dp(8), dp(6) + bars.top, dp(8), dp(6));
            dockScroller.setPadding(dp(10), dp(8), dp(10),
                    dp(10) + Math.max(bars.bottom, ime.bottom));
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
        // Only the bundled page may use the auth half of the bridge; the dock can
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
        selectDock(indexForUrl(url), false);
    }

    @Override
    public void onPageLoadFinished(String url) {
        pageProgress.animate().alpha(0f).setDuration(220)
                .withEndAction(() -> pageProgress.setVisibility(View.GONE)).start();
        pullRefresh.setRefreshing(false); // both load-finished and refresh-finished
        backButton.setEnabled(webView != null && webView.canGoBack());
        backButton.setAlpha(backButton.isEnabled() ? 1f : 0.38f);
        selectDock(indexForUrl(url), false);
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

    /** Points the tools button at the version a background check found. */
    void refreshUpdateUi() {
        String available = UpdateChecker.availableVersionName(this);

        if (updateBadge != null) {
            updateBadge.setVisibility(available == null ? View.GONE : View.VISIBLE);
        }
        if (toolsButton != null) {
            toolsButton.setContentDescription(available == null
                    ? getString(R.string.action_tools)
                    : getString(R.string.tools_update_available, available));
        }
    }

    /** The "Tools" overflow menu — dark glass card anchored to the ⋮ button. */
    void showToolsMenu() {
        if (toolsButton == null) return;
        ToolsMenu.show(this, toolsButton);
    }

    void onToolSelected(int which) {
        String current = webView.getUrl() == null ? HOME_URL : webView.getUrl();
        switch (which) {
            case ToolsMenu.TOOL_SETTINGS: // settings / appearance
                SettingsSheet.show(this);
                break;
            case ToolsMenu.TOOL_OPEN_BROWSER: { // open in browser
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(current));
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                try {
                    startActivity(intent);
                } catch (Exception e) {
                    toast(getString(R.string.no_app_to_handle));
                }
                break;
            }
            case ToolsMenu.TOOL_COPY_LINK: { // copy link
                ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (cm != null) {
                    cm.setPrimaryClip(ClipData.newPlainText("Victus Cloud", current));
                    toast(getString(R.string.link_copied));
                }
                break;
            }
            case ToolsMenu.TOOL_SHARE_LINK: { // share link
                try {
                    Intent send = new Intent(Intent.ACTION_SEND)
                            .setType("text/plain")
                            .putExtra(Intent.EXTRA_TEXT, current);
                    startActivity(Intent.createChooser(send, null));
                } catch (Exception e) {
                    toast(getString(R.string.no_app_to_handle));
                }
                break;
            }
            case ToolsMenu.TOOL_TEST_PANEL:
                // testpanel.victuscloud.com no longer resolves (NXDOMAIN since the
                // .xyz → .com migration); send people to the knowledgebase instead.
                loadUrlInternal("https://victuscloud.com/knowledgebase");
                break;
            case ToolsMenu.TOOL_SUPPORT:
                loadTab(5); // Support
                break;
            case ToolsMenu.TOOL_STATUS:
                loadTab(6); // Status
                break;
            case ToolsMenu.TOOL_MARKETPLACE:
                loadUrlInternal("https://victuscloud.com/marketplace");
                break;
            case ToolsMenu.TOOL_DEVICE_COMPAT: // ROM / WebView / keystore diagnostics
                CompatSheet.show(this);
                break;
            case ToolsMenu.TOOL_UPDATES:
                UpdateSheet.show(this);
                break;
            case ToolsMenu.TOOL_CLEAR_SESSION:
                confirmClearSession();
                break;
            default:
                break;
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
                    selectDock(TAB_HOME, false);
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

        errorProceedButton = buildOverlayButton(getString(R.string.action_proceed_anyway), false);
        LinearLayout.LayoutParams proceedParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        proceedParams.topMargin = dp(10);
        errorProceedButton.setOnClickListener(v -> {
            ThemeManager.setTrustVictusSsl(this, true);
            if (pendingSslHandler != null) {
                pendingSslHandler.proceed();
                pendingSslHandler = null;
            }
            hideErrorOverlay();
            toast(getString(R.string.ssl_proceed_accepted));
        });
        errorProceedButton.setVisibility(View.GONE);
        box.addView(errorProceedButton, proceedParams);

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
     * accent surface — dock chips, progress bar tint, error glyph/retry button
     * — and, if the bundled home screen is currently loaded, live-updates its
     * CSS variables via a tiny injected script. Nothing here recreates the
     * Activity or reloads the WebView, so switching themes is effectively free.
     */
    void applyDynamicAccent() {
        if (dockChips[0] != null) {
            for (int i = 0; i < dockChips.length; i++) {
                styleChip(dockChips[i], i == selectedDock);
            }
        }
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
        if (errorProceedButton != null) errorProceedButton.setVisibility(View.GONE);
        errorWebViewUpdateLink.setVisibility(View.GONE);
        displayErrorOverlay(message + "\n" + getString(R.string.error_offline_hint), failingUrl);
    }

    /**
     * TLS-specific error screen. Unlike {@link #showError}, the message is
     * already a complete, specific explanation (built per {@link android.net.http.SslError}
     * code in {@link VictusWebViewClient}), so the generic "check your
     * connection" hint is skipped. When {@code offerWebViewUpdate} is true —
     * currently for SSL_UNTRUSTED/SSL_NOTYETVALID, the two codes most often
     * caused by a stale Android System WebView or a wrong device clock rather
     * than a real attack — an "Update WebView" shortcut to the Play Store is
     * shown underneath the buttons.
     */
    @Override
    public void showSslError(android.webkit.SslErrorHandler handler, String message, String failingUrl,
                             boolean offerWebViewUpdate, boolean isInternalHost) {
        if (pendingSslHandler != null && pendingSslHandler != handler) {
            pendingSslHandler.cancel();
        }
        pendingSslHandler = handler;
        if (errorProceedButton != null) {
            errorProceedButton.setVisibility(isInternalHost ? View.VISIBLE : View.GONE);
        }
        errorWebViewUpdateLink.setVisibility(offerWebViewUpdate ? View.VISIBLE : View.GONE);
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

    // ================================================================== misc

    /** WebView history → (error overlay → Home) → Home tab → exit. Predictive-back safe. */
    private boolean handleWebBackNavigation() {
        if (errorOverlay != null && errorOverlay.getVisibility() == View.VISIBLE) {
            hideErrorOverlay();
            // Don't stare at a blank failed page — retreat to Home instead.
            if (selectedDock == TAB_HOME) loadUrlInternal(HOME_URL);
            else loadTab(TAB_HOME);
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

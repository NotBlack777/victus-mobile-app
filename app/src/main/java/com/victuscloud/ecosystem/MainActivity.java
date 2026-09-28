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
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
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
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewFeature;

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
public class MainActivity extends ComponentActivity {

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

    // ------------------------------------------------------------------- views

    private FrameLayout rootView;
    private LinearLayout topBar;
    private ImageButton backButton;
    private ProgressBar pageProgress;
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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Android 12+ splash screen (backported by androidx.core:core-splashscreen).
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        // Edge-to-edge: transparent system bars with automatic icon contrast.
        EdgeToEdge.enable(this);

        // Request the panel's highest refresh rate (90/120/144 Hz capable hardware).
        applyPeakRefreshRate();

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
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String url = resolveStartUrl(intent);
        if (url != null) {
            loadUrlInternal(url);
            selectDock(indexForUrl(url), false);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        outState.putInt(KEY_SELECTED_TAB, selectedDock);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Stops JS timers/animations/video in the WebView while backgrounded —
        // without this the page keeps ticking (and draining battery/CPU) the
        // whole time the app isn't even visible.
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            // Detach before destroy so the WebView never outlives its context.
            android.view.ViewGroup parent = (android.view.ViewGroup) webView.getParent();
            if (parent != null) parent.removeView(webView);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /** Deep links (https://*.victuscloud.com) open directly inside the shell. */
    private String resolveStartUrl(Intent intent) {
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            return intent.getData().toString();
        }
        return null;
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
        content.addView(webView, webParams);

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
        topBar.addView(tools, new LinearLayout.LayoutParams(dp(48), dp(48)));

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
        chip.setOnClickListener(v -> loadTab(index));
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
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(false);     // asset loader serves local content instead
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT); // bundled React entry point stays cached → instant revisit

        // Ensure modern browser user-agent: remove the "; wv" token so Cloudflare and
        // modern web applications treat the embedded WebView as a standard Chrome mobile browser.
        String defaultUa = s.getUserAgentString();
        if (defaultUa != null && defaultUa.contains("; wv")) {
            s.setUserAgentString(defaultUa.replace("; wv", ""));
        }

        // Follow the system dark/light theme instead of forcing one. CSS
        // prefers-color-scheme handles our own pages; algorithmic darkening
        // covers third-party pages on WebView versions that support it.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(s, true);
        } else if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
            WebSettingsCompat.setForceDark(s, WebSettingsCompat.FORCE_DARK_AUTO);
        }

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
    }

    // ------------------------------------------------------- client callbacks

    void onPageLoadStarted(String url) {
        hideErrorOverlay();
        pageProgress.animate().cancel();
        pageProgress.setAlpha(1f);
        pageProgress.setVisibility(View.VISIBLE);
        pageProgress.setProgress(0);
        selectDock(indexForUrl(url), false);
    }

    void onPageLoadFinished(String url) {
        pageProgress.animate().alpha(0f).setDuration(220)
                .withEndAction(() -> pageProgress.setVisibility(View.GONE)).start();
        backButton.setEnabled(webView != null && webView.canGoBack());
        backButton.setAlpha(backButton.isEnabled() ? 1f : 0.38f);
        selectDock(indexForUrl(url), false);
        injectThemeIntoWebView(); // seed the saved accent theme before the page reads it
    }

    void onPageProgress(int newProgress) {
        pageProgress.setProgress(newProgress);
    }

    // ========================================================= tools & session

    /** The "Tools" overflow menu — theme-aware dialog, no custom pixel math. */
    void showToolsMenu() {
        final String[] items = {
                getString(R.string.tools_settings),
                getString(R.string.tools_open_browser),
                getString(R.string.tools_copy_link),
                getString(R.string.tools_share_link),
                getString(R.string.tools_test_panel),
                getString(R.string.tools_support),
                getString(R.string.tools_status),
                getString(R.string.tools_marketplace),
                getString(R.string.tools_check_updates),
                getString(R.string.tools_clear_session),
        };
        new AlertDialog.Builder(this)
                .setTitle(R.string.action_tools)
                .setItems(items, (dialog, which) -> onToolSelected(which))
                .show();
    }

    private void onToolSelected(int which) {
        String current = webView.getUrl() == null ? HOME_URL : webView.getUrl();
        switch (which) {
            case 0: // settings / appearance
                SettingsSheet.show(this);
                break;
            case 1: { // open in browser
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(current));
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                try {
                    startActivity(intent);
                } catch (Exception e) {
                    toast(getString(R.string.no_app_to_handle));
                }
                break;
            }
            case 2: { // copy link
                ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                cm.setPrimaryClip(ClipData.newPlainText("Victus Cloud", current));
                toast(getString(R.string.link_copied));
                break;
            }
            case 3: { // share link
                Intent send = new Intent(Intent.ACTION_SEND)
                        .setType("text/plain")
                        .putExtra(Intent.EXTRA_TEXT, current);
                startActivity(Intent.createChooser(send, null));
                break;
            }
            case 4: // test (beta) panel
                loadUrlInternal("https://testpanel.victuscloud.com");
                break;
            case 5:
                loadTab(5); // Support
                break;
            case 6:
                loadTab(6); // Status
                break;
            case 7:
                loadUrlInternal("https://victuscloud.com/marketplace");
                break;
            case 8:
                UpdateSheet.show(this);
                break;
            case 9:
                confirmClearSession();
                break;
        }
    }

    /**
     * Clears WebView cookies, storage, cache and panel sessions, after a
     * confirmation. The work itself is small/fast; nothing touches the network.
     */
    void confirmClearSession() {
        new AlertDialog.Builder(this)
                .setTitle(R.string.clear_session_title)
                .setMessage(R.string.clear_session_message)
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.clear_session_confirm, (dialog, which) -> {
                    CookieManager cookies = CookieManager.getInstance();
                    cookies.removeAllCookies(null);
                    cookies.flush();
                    WebStorage.getInstance().deleteAllData();
                    webView.clearCache(true);
                    webView.clearFormData();
                    toast(getString(R.string.clear_session_done));
                    webView.reload();
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

    /** Pushes the live accent gradient + reduce-motion flag into the bundled React
     *  app as CSS custom properties. Only runs against our own bundled asset origin —
     *  a no-op (and harmless either way) on every other site in the WebView. The app
     *  re-applies its own saved theme on mount, so this only sets the initial value. */
    private void injectThemeIntoWebView() {
        if (webView == null) return;
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
                + "})();";
        webView.evaluateJavascript(script, null);
    }

    private static int midColor(int c1, int c2) {
        int r = (android.graphics.Color.red(c1) + android.graphics.Color.red(c2)) / 2;
        int g = (android.graphics.Color.green(c1) + android.graphics.Color.green(c2)) / 2;
        int b = (android.graphics.Color.blue(c1) + android.graphics.Color.blue(c2)) / 2;
        return android.graphics.Color.rgb(r, g, b);
    }

    void showError(String message, String failingUrl) {
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
    void showSslError(android.webkit.SslErrorHandler handler, String message, String failingUrl,
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

    /** Opens the Play Store listing for Android System WebView, falling back to
     *  the web listing if the Play Store app itself isn't installed. */
    private void openWebViewUpdatePage() {
        String pkg = "com.google.android.webview";
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)));
        } catch (Exception e) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW,
                        Uri.parse("https://play.google.com/store/apps/details?id=" + pkg)));
            } catch (Exception ignored) {
                toast(getString(R.string.no_app_to_handle));
            }
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

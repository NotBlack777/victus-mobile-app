# Master Prompt: Victus Cloud App Overhaul

## Context (from decompiling the existing APK — attach it + the 2 screenshots)
- Package: `com.victuscloud.ecosystem`, single Activity: `MainActivity.java`
- Architecture: native Android shell wrapping a WebView. Key classes/methods found:
  `VictusWebViewClient`, `VictusChromeClient`, `configureWebView`, `createLayout`,
  `createErrorOverlay`, `createDownloadListener`, `confirmClearSession`, `showToolsMenu`
- Home screen is a local asset: `assets/home.html` — dark glassmorphism theme, CSS custom
  properties for colors, hero card, horizontal dock/tab bar (Home / Website / Billing /
  Control / Drive / Support / Status)
- **Known bug visible in the screenshots**: the dock tab bar overflows on screen and
  clips/scrolls the "Control" tab (renders as "ontro" mid-word) — a real layout/DPI bug,
  not just a visual nitpick

## Task
Rebuild/refactor this Android app (keep it a WebView-shell architecture unless you have a
strong reason to change it) with the following goals. Work directly against the attached
APK and screenshots as ground truth for current behavior before changing anything.

### 1. UI/visual pass
- Keep the existing dark glass aesthetic (blue/violet/teal gradients) as the base identity,
  but modernize it: consistent spacing scale, consistent corner radii, remove any
  now-dated flat/skeuomorphic elements left over from earlier iterations
- Fix the dock/tab bar: it must never clip or truncate a label at any screen width. Either
  make it a properly measured horizontally-scrollable row with full-width chips, or switch
  to a bottom nav / overflow "More" pattern once tabs exceed what fits
- Support both dark and light system themes (currently hardcoded `color-scheme: dark`) —
  read the system theme and adapt, don't force one
- Adopt edge-to-edge display properly: respect `WindowInsets`/safe-area for status bar and
  gesture nav bar rather than fixed padding, on both the native chrome and the WebView content
- Add Android 12+ splash screen API instead of any custom/legacy splash handling, and
  support the predictive back gesture

### 2. Universal DPI support
- Audit every native layout (`createLayout`, error overlay, tools menu) for hardcoded pixel
  values — convert to `dp`/`sp` throughout, no raw `px`
- Test/scale correctly across density buckets (mdpi through xxxhdpi) and across form
  factors: small phones, large phones, and tablets/foldables (don't assume one fixed width)
- In `home.html`/CSS: audit fixed px values in the design and convert layout-critical ones
  to relative units (`rem`, `%`, `clamp()`, `min()/max()`) so text and controls scale instead
  of overflowing or clipping — this directly fixes the dock bar bug above
- Verify tap targets stay ≥48dp at every density

### 3. Universal refresh rate support (zero lag/delay)
- Request the display's highest available refresh rate: use
  `Window.setPreferredDisplayModeId`/`preferredRefreshRate` (API 23+) or
  `Surface.setFrameRate` (API 30+) so the app runs at 90Hz/120Hz/144Hz on capable
  hardware instead of being capped at 60Hz
- Ensure all native transitions/animations (dock switching, tools menu, error overlay
  fade-in) are driven by the choreographer/animator framework, not manual sleeps or
  fixed-duration hacks that assume 60Hz
- Turn on hardware acceleration for the WebView and the Activity; confirm no unnecessary
  overdraw (check with GPU overdraw debug tooling)
- Avoid any main-thread blocking calls around WebView init, session clearing, or the
  download listener — move I/O off the UI thread so taps never stall
- Preload/cache `home.html` and its assets so navigating back to Home is instant, and
  avoid full WebView reloads where a JS-side state update would do

### 4. Modernize / update stale parts
- Bump `compileSdkVersion`/`targetSdkVersion` to the current stable Android API level and
  fix any deprecation warnings that come from it (deprecated WebSettings flags, permission
  APIs, etc.)
- Replace any deprecated WebView APIs in `VictusWebViewClient`/`VictusChromeClient` with
  current equivalents
- Re-check `confirmClearSession` and the download listener against current Android
  scoped-storage/permission requirements
- General code cleanup: remove dead code paths, consolidate the `ExternalSyntheticLambda*`
  clutter if it's from an old build, add comments so the app is maintainable going forward

## Build/delivery constraint
I'm phone-only (no PC/Android Studio access). Use GitHub's native infrastructure to produce
the APK — set up (or use the existing) GitHub Actions workflow to build a debug APK on
push/workflow_dispatch and attach it as a build artifact/release, rather than assuming a
local Gradle build I can run myself. Give me the exact repo path and steps to trigger the
workflow and download the resulting debug APK from my phone (Actions tab → artifact, or a
release asset).

## Deliverable
Ship the updated APK (via the GitHub Actions build above) plus a short changelog of what
changed in each of the 4 areas above. Don't change the app's core purpose (Discord/cloud-
hosting control panel shell) — this is a polish/performance/compatibility pass, not a
rewrite of functionality.

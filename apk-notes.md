# Victus Cloud — current app notes (pulled from the old APK)

Don't try to decompile `VictusCloud__2_.apk` directly — treat these notes + `home.html`
as the source of truth for what currently exists.

- Package: `com.victuscloud.ecosystem`
- Single Activity: `MainActivity.java`
- Key classes/methods in the native shell:
  - `VictusWebViewClient`, `VictusChromeClient` — custom WebView clients
  - `configureWebView` — WebView setup
  - `createLayout` — builds the native chrome (top bar with Back/Refresh/Tools,
    the dock/tab row)
  - `createErrorOverlay` — native error screen shown on load failure
  - `createDownloadListener` — handles file downloads from the WebView
  - `confirmClearSession` — clears WebView cookies/storage/cache/panel sessions
    ("This clears WebView cookies, storage, cache, and panel sessions in the app.")
  - `showToolsMenu` — the "Tools" button menu
- Home screen content is a **local asset**, `assets/home.html` (included alongside this
  file, plain HTML/CSS/JS) — this is the actual current UI source, not a screenshot
  approximation
- Dock/tab row in the native chrome currently reads: Home, Website, Billing, Control,
  Drive, Support, Status — confirmed from the app screenshots to overflow/clip on screen
  (the "Control" tab renders cut off)
- No local Gradle project was recovered — the agent will need to reconstruct a buildable
  Android project (MainActivity.java + layout + this home.html asset) rather than editing
  an existing source tree, since only the compiled APK was available

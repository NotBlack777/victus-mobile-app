# Victus Cloud — Android App (rebuilt)

`com.victuscloud.ecosystem` — single-Activity WebView shell wrapping the Victus Cloud
ecosystem (website, billing, control panel, test panel, drive, support, status).
Reconstructed from the legacy APK + notes in [`/Legacy`](Legacy/) (the old
`VictusCloud (2).apk`, `home.html`, and notes are kept there untouched — they are
**not** used by the build; everything the app needs now lives right here).

See [`CHANGELOG.md`](CHANGELOG.md) for the full list of what changed vs. the old APK.

---

## 📲 Get the APK on your phone (no PC needed)

A **debug APK is built automatically by GitHub Actions** on every push — no local
Android Studio/Gradle required.

### Option A — from the Actions tab (works on mobile browsers)

1. Open this repo on GitHub in your phone browser and sign in.
2. Tap the **Actions** tab → select **Build Debug APK** in the left list.
3. Open the newest ✅ successful run (top of the list).
4. Scroll down to **Artifacts** → tap **`VictusCloud-debug-apk`** to download a zip.
5. Unzip it (Files app) → tap **`VictusCloud-debug.apk`** → **Install**
   (allow "install unknown apps" for your browser/Files app if prompted).

> To trigger a fresh build manually: **Actions → Build Debug APK → Run workflow**
> (button on the right) → pick the branch → **Run workflow**. The APK artifact
> appears ~3–5 minutes later in the finished run.

### Option B — release asset (even easier, best for final distribution)

Push a tag and the same workflow attaches the APK to a GitHub Release:

```
git tag v2.0.0 && git push origin v2.0.0
```

Then on your phone: **repo → Releases → Assets → `VictusCloud-debug.apk`** — a
direct download, no sign-in needed if the repo is public.

### ⚠️ Signature note

The GitHub build is **debug-signed**, so its certificate differs from the old APK.
If install says *"App not installed"* / *"conflicts with an existing package"*,
**uninstall the old Victus Cloud first**, then install the new build.

---

## 🗂 Project layout

```
app/
├── build.gradle                        # compileSdk/targetSdk 35, minSdk 23
└── src/main/
    ├── AndroidManifest.xml             # permissions, deep links, HW accel, predictive back
    ├── java/com/victuscloud/ecosystem/
    │   ├── MainActivity.java           # layout/core logic: createLayout, configureWebView,
    │   │                               #   createErrorOverlay, createDownloadListener,
    │   │                               #   confirmClearSession, showToolsMenu, applyDynamicAccent
    │   ├── VictusWebViewClient.java    # routing, error/SSL handling (modern callbacks only)
    │   ├── VictusChromeClient.java     # progress, uploads, runtime permissions
    │   ├── DownloadTask.java           # background downloads via MediaStore (scoped storage)
    │   ├── ThemeManager.java           # SharedPreferences-backed theme store (presets + custom)
    │   └── SettingsSheet.java          # Tools ⋮ → Settings: theme presets, custom color/gradient
    │                                   #   picker, reduce-motion toggle — plain views, no extra libs
    ├── assets/
    │   ├── home.html                   # home screen (relative units, dark+light themes)
    │   └── victus-logo.png             # original logo recovered from the legacy APK
    └── res/                            # themes (light/dark), icons at every density
.github/workflows/build-debug-apk.yml   # the phone-friendly APK pipeline
tools/generate_icons.py                 # regenerates all launcher/splash icons
Legacy/                                 # untouched archive of the old APK + notes
```

## 🔨 Build locally (optional, if you ever get a PC)

```
./gradlew :app:assembleDebug     # → app/build/outputs/apk/debug/app-debug.apk
```

Requires JDK 17. Android SDK is auto-provisioned by Gradle on Gradle 8.x runners;
locally you need the Android SDK (`platforms;android-35`, `build-tools;35.0.0`).

## Rebuilding the icons

`python3 tools/generate_icons.py` (pure Python, no dependencies) re-renders all
launcher, round, adaptive, monochrome and splash icons at mdpi → xxxhdpi.

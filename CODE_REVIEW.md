# Code review — Victus Cloud 2.2.1 (H1 and H3 since resolved in 2.3.0)

Full-codebase review of the Android WebView shell (`app/src/main/java/com/victuscloud/ecosystem/`,
15 files / ~5,400 lines) and the bundled React app (`src/`, 34 files / ~6,900 lines), looking
for bugs, duplicated logic, resource leaks, UI/threading problems and needless work — with the
mobile-specific pitfalls (WebView lifetime, main-thread I/O, storage, TLS, batteries) as the
lens, plus an explicit pass over the Supabase seam as requested.

**Nothing in this review has been changed.** Every finding is a proposal; it can be applied
independently, and none of it requires a schema change.

## Baseline — what was actually run

| Check | Result |
| --- | --- |
| `bun tsc -b --noEmit` | clean |
| `bun test` | 40 pass / 0 fail, 525 assertions (3 files) |
| `./gradlew :app:testDebugUnitTest` | BUILD SUCCESSFUL (2 test classes) |
| `./gradlew assembleDebug assembleRelease` | BUILD SUCCESSFUL (verified earlier this session) |
| `node scripts/verify-webview.mjs app/build/generated/reactAssets` | 17/17 checks pass |

Test coverage is concentrated where it is easiest to write, not where the risk is:

* Web: `tests/palettes.test.ts` (theme tokens), `tests/services.test.ts` (auth, notifications,
  `openVictusLink`, fleet stats, node aggregation), `tests/apk-bundle.test.ts` (the APK really
  contains the built bundle, and `MainActivity` loads it).
* Native: `UpdateCommandsTest`, `UpdateManifestTest` — both pure-JVM updater helpers.
* **Untested:** `MainActivity` (1,329 lines), `SettingsSheet` (950), `UpdateSheet` (713),
  `ThemeManager`, `DownloadTask`, `VictusWebViewClient` — including the security-critical SSL
  decision matrix and the download naming/dedupe logic. See T1–T3 below.

Severity bands used: **High** = user-visible breakage, or a security/privacy hole with a
realistic path to harm. **Medium** = wrong or misleading behaviour, leaks, or a
regression waiting for a trigger. **Low** = polish, dead code, micro-optimisations.

---

## High

### H1 — The only gate in front of the whole app is a client-side mock — **RESOLVED in 2.3.0**

**Original finding.** `App.tsx` renders `LoginScreen` whenever `session` is null, and `session`
came from `authService`, which "authenticated" by checking that the email matched a regex and the
password was ≥ 6 characters, then fabricated a session: no server call (a 600 ms `setTimeout`),
an `access_token` built from `Math.random()`, persisted in `localStorage`, and a `role` derived
from `cleanEmail.includes('admin')`. Anyone who tapped through the form reached the dashboard.

**What was done.** Sign-in is now real (see the 2.3.0 section of `CHANGELOG.md`):

* `authService.signIn` calls `POST /auth/login` on `control.victuscloud.com` and cannot produce a
  session without the panel accepting the password. There is no fallback that fabricates one, and
  a malformed or missing native reply is an error, never a session.
* Two-factor is handled (`POST /auth/login/checkpoint`), as is sign-in with a panel API key.
* The credential is an API key the app mints for itself and revokes on sign-out. It is held by the
  native layer (`VictusAuth.java`) — `Session.access_token` is now always `''`, and the key never
  enters the WebView, so there is nothing in `localStorage` for a same-origin script to steal
  (which also retires the M5 concern for this path).
* `role` comes from the panel's `root_admin` attribute, not from a substring of the address.
* The fabricated session still exists, but only behind an explicit `signInDemo()` that sets
  `provider: 'demo'`, and the UI labels it (a "Demo" chip in the top bar, and a login button that
  says "not your account").
* `app/src/main/java/.../SecureStore.java` seals the session with AES-256-GCM under an Android
  Keystore key, so a backed-up copy is useless on another device.

**Still worth doing** (follow-ups, not regressions): the panel has no self-service registration
(`POST /auth/register` → 405), so "Create an account" now opens the billing portal rather than
pretending to sign anyone up; and password reset is wired to `POST /auth/password`, which is
enabled. The verify-webview regression covers the rejected-password, two-factor and
credential-never-in-the-WebView paths (checks 9a–9d).

### H2 — Internal links are `http://` in an app that refuses cleartext

`src/components/ToolsMenu.tsx:120,136,169,181,225`, `ControlDashboard.tsx:573`,
`ServiceControlScreen.tsx:138`, `EcosystemFrame.tsx:266`, `AccountProfileModal.tsx:245,257`

Ten Victus URLs are hard-coded as `http://control.victuscloud.com/…` /
`http://billing.victuscloud.com`, while the platform is configured to refuse cleartext:

* `AndroidManifest.xml`: `android:usesCleartextTraffic="false"`
* `res/xml/network_security_config.xml`: `<base-config cleartextTrafficPermitted="false">`,
  with no `victuscloud.com` override
* `VictusWebViewClient.isInternalHost()` (`:73-86`) treats **both** http and https as internal,
  and `shouldOverrideUrlLoading()` (`:57-71`) keeps internal links in the WebView whenever the
  current page is the bundled home — so an `http://` Victus link is *loaded in-app* rather than
  handed off, and the WebView then refuses it (`ERR_CLEARTEXT_NOT_PERMITTED`), which lands the
  user on the native error overlay. That is the reported "Can't reach Victus Cloud" class of
  symptom, with a cause in our own bundle rather than in TLS or DNS.

Today the paths that would actually load these URLs are partly masked because
`EcosystemFrame` matches on the host substring and renders a native panel instead
(`isControl`/`isBilling`, `:44-59`). The reachable cases are real, though: with
**Tools → Settings → Open links externally** on, `openVictusLink` calls
`window.open('http://billing.victuscloud.com')`, which — with the default
`setSupportMultipleWindows(false)` — navigates the *same* WebView, hits the internal-host
branch, and fails as above instead of opening a browser.

Fix (low risk): make every one of those ten URLs `https://`, and normalise in the client so
legacy links upgrade rather than fail — e.g. in `shouldOverrideUrlLoading`, rewrite an internal
`http` URI to `https` before returning `false`.

### H3 — The web app's "Web View" path cannot work in the APK (proxy is dev-only)

> **Resolved** — "Web View" now opens the live portal in a native in-app browser
> surface (`InAppBrowser` + the `window.VictusNative` bridge); the `/api/proxy`
> iframe is gone from the bundle. Kept here for the reasoning, including why a
> native proxy was *not* the answer: `control.victuscloud.com` sends
> `x-frame-options: DENY` and the other portals send `SAMEORIGIN` /
> `frame-ancestors 'self'`, so no proxy could make a frame render, and a proxy
> could not carry the POST logins and session cookies these panels need.

`src/components/EcosystemFrame.tsx:119`, `vite.config.ts:84-141`

Every non-Control dock tab renders an iframe pointing at a proxy endpoint that only exists as a
Vite **dev-server** middleware:

```ts
const iframeSrc = `/api/proxy?url=${encodeURIComponent(url)}`;   // EcosystemFrame.tsx:119
```

`vite.config.ts` registers `/api/website-preview` and `/api/proxy` under `configureServer` —
i.e. `bun run dev` only. There is no `api/` directory, no serverless function, and the Android
build serves the bundle from `appassets.androidplatform.net` via `WebViewAssetLoader`, which
answers only for files that exist inside the APK. So in the shipped app `/api/proxy?...` is a
404 (or a failed request for a synthetic host), and the whole "Web View ⇄ Switch to App View"
mechanism is dead weight that can only ever show the "Browser Security Protected" panel.

Two consequences worth acting on: (a) the web-view toggle should be hidden or replaced with a
native "open in browser" action in the Android build, and (b) if that proxy is ever deployed,
the sanitising/sandboxing around it becomes security-critical — see M5.

### H4 — Real infrastructure details are hard-coded and shipped

`src/services/controlData.ts:26` (`REAL_VICTUS_SERVICES`)

Eleven services with real public IPs (`104.234.180.12:8080`, `194.163.140.85:22`), SFTP
endpoints and usernames (`sg1.victuscloud.com:2022`, `icy.9a4b12c1`), node names and UUIDs are
compiled into the web bundle and therefore into both APKs, and they sit in a public repository.
This is an infrastructure-disclosure and fingerprinting problem (host/port inventory, SSH
exposure, naming conventions) with no upside for the user. It is also stale by definition — the
panel and the app will disagree the moment anything changes.

Recommended: keep the *shape* (`VictusService`, `getNodeSummaries`, `getFleetStats`) and move
the values behind the panel's API/embed, or ship anonymised demo fixtures for the offline case.

---

## Medium

### M1 — The dashboard contradicts its own node list

`src/services/controlData.ts:304-310`, rendered at `src/components/ControlDashboard.tsx:201,208,370`

`getFleetStats()` mixes derived counts with hard-coded numbers:

```ts
addonsCount: 463,
databasesAndBackupsCount: 463,
memoryUsage: '28,456 MiB',
diskUsage: '308,418 MiB',
databasesCount: 226,
backupsCount: 237,
```

The derived values are correct (`runningCount`/`stoppedCount`/`suspendedCount` filter `services`),
but `memoryUsage`/`diskUsage` ignore their input even though `getNodeSummaries()` — called two
lines later in the same component (`ControlDashboard.tsx:47`) — already sums exactly that data.
Summing `REAL_VICTUS_SERVICES` memory gives **45,056 MiB**, while the stat card claims
**28,456 MiB**; disk is 312,000 MiB versus a claimed 308,418 MiB. The user sees one view telling
them two different totals. `databasesCount + backupsCount === databasesAndBackupsCount` (226+237),
so those three are at least internally consistent — but they are unrelated to the fleet data and
read as real.

Fix: derive `memoryUsage`/`diskUsage` from `getNodeSummaries(services)`, and either wire the
addon/database/backup counts to real data or label them as demo values.

### M2 — Fabricated operational data presented as live

`src/services/notificationService.ts:21`, `src/components/EcosystemFrame.tsx:79-95`,
`src/components/ControlDashboard.tsx`

Shipped fixtures describe user-specific events as though they had happened: "Server Node Online",
"Support Ticket Reply … ticket #VT-9804", and **"Invoice Paid: #INV-2026-442 … Automatic renewal
… was processed successfully"** — on first launch, persisted to `localStorage` and shown with an
unread badge. The Drive tab lists backups that do not exist (`victus-backup-survival-2026.tar.gz`,
"4.8 GB", "2 hours ago") and the Support tab lists tickets that do not exist.

For a cloud panel, a fake "invoice paid" or a fake backup listing is worse than an empty state:
users make decisions on it. Recommend seeding an explicit empty/demo state (and a
visible "demo data" marker) unless real endpoints back these views. Timestamps are also static
strings (`'5m ago'`, `'Yesterday'`) that never age.

### M3 — TLS policy is deliberately weak in three compounding places

`res/xml/network_security_config.xml`, `AndroidManifest.xml:20`,
`app/src/main/java/com/victuscloud/ecosystem/VictusWebViewClient.java:194-243`

1. `<certificates src="user" />` in the **base-config** means every user-installed CA (corporate
   MDM, or anything a user was talked into installing) is trusted for **all** domains, so a
   transparent proxy can intercept the panel's traffic. The usual hardening is to keep
   `src="user"` only inside a `<debug-overrides>` block (or a domain-config scoped to internal
   hosts you actually control).
2. `android:allowBackup="true"` with no `fullBackupContent`/`dataExtractionRules`: WebView
   cookies, `SharedPreferences` (theme prefs, update source URL, the cached "update available"
   state) and the cached downloaded APK in `cacheDir` are eligible for cloud/adb backup
   extraction. Either set `allowBackup="false"` or exclude the WebView and cache data.
3. "Trust Victus Cloud certificates" defaults **on** (`ThemeManager.isTrustVictusSsl`, `:258`)
   and auto-proceeds on `SSL_UNTRUSTED`/`SSL_NOTYETVALID` for `*.victuscloud.com`. The scoping
   work in this release is good (expired/mismatched are still blocked, foreign hosts refused
   silently, no blind `proceed()`), so this is the residual risk rather than a new hole — but
   combined with (1) it means the default posture accepts an untrusted chain without asking.

Also: `ACCESS_NETWORK_STATE` is declared and never used (no `ConnectivityManager` reference
anywhere) — drop it, or use it to gate the launch update check on connectivity.

### M4 — Leaks around the popup and sheets

`app/src/main/java/com/victuscloud/ecosystem/MainActivity.java:269-280`,
`ToolsMenu.java:80`, `UpdateSheet.java:104-110`, `SettingsSheet.java:99-148`

* `onDestroy()` detaches and destroys the WebView (good) but never dismisses the Tools
  `PopupWindow` or the Settings/Update `Dialog`s. Each of those holds a **strong reference to the
  Activity** (`ctx = activity` in `ToolsMenu.show`, `this.activity` in both sheets), and a
  `PopupWindow`/`Dialog` whose window outlives its Activity keeps that Activity alive — the
  framework logs it as a leaked window. `MainActivity` keeps no handle to them, so it cannot
  dismiss them either.
* `UpdateSheet` registers `Shizuku.OnRequestPermissionResultListener` (`:114`) and only removes it
  in `setOnDismissListener` (`:104-110`). If the Activity is destroyed rather than dismissed, the
  listener — and through it the Activity — stays registered in Shizuku's static registry.
* `startBackgroundUpdateCheck()` (`MainActivity.java:752-769`) hands a `this::refreshUpdateUi`
  method reference to a static executor plus `UpdateChecker.MAIN`, so the Activity is pinned for
  the duration of the network call. Bounded by the 15 s connect / 30 s read timeouts, and only
  touches two views, so it is minor — but `finish`/`isDestroyed` guards (or a `WeakReference`)
  would make it airtight.
* `DownloadTask.enqueue` (`:56-70`) posts the result callback with the Activity captured; a
  download outliving the Activity keeps it alive until the transfer or its timeout finishes.

Fix: hold the popup/dialogs in `MainActivity` fields, dismiss them in `onDestroy()` (and
unregister the Shizuku listener from the sheet's own teardown), and null the WebView reference in
`onPause`-adjacent teardown.

### M5 — The iframe is sandboxed with `allow-scripts allow-same-origin`

`src/components/EcosystemFrame.tsx:210-217`

```html
<iframe src="/api/proxy?url=…" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
```

Combining `allow-scripts` with `allow-same-origin` on a frame served from the app's **own**
origin defeats the sandbox: the framed document can reach its own `localStorage`, i.e.
`victus_auth_session`, and the theme/session state. This is only latent while the proxy is
dev-only (H3), but the moment H3 is "fixed" by deploying a proxy on the same origin, third-party
page content gains access to the app's session storage. If the proxy is deployed, drop
`allow-same-origin` (and/or serve the proxy from a separate origin) before enabling it.

### M6 — The saved-file name can be wrong, and downloads are never length-checked

`app/src/main/java/com/victuscloud/ecosystem/DownloadTask.java:56-70`, `:74-103`, `:105-135`

* `download()`/`writeViaMediaStore()` compute a de-duplicated name (`report (1).pdf`) but return
  `void`, so `enqueue` reports the **original** name:
  `if (failure == null) callback.onSuccess(fileName);` (`:68`) — the UI then says
  "Download complete: report.pdf" for a file that was saved as `report (1).pdf`. The dedupe fix
  in this release is therefore only half-wired.
* Nothing compares the bytes written against `Content-Length`/`conn.getContentLength()`. A
  truncated transfer (connection dropped, server misbehaving) is reported as a **successful**
  download, and on the legacy (API 23–28) path the partial file is left in public Downloads.
  `UpdateChecker.download()` does this correctly (`manifest.sizeBytes` + sha256) — the general
  downloader should copy that idea.
* Dead code left behind by the dedupe fix: `exists()` (`:151-168`) still builds a `selection`
  string using `RELATIVE_PATH` and `IS_TRASHED` and then never uses it (only `DISPLAY_NAME=?` is
  passed). Worse, that dead string is a latent crash: `MediaStore.Downloads.IS_TRASHED` is an
  API 30 column, and the app supports API 29+ on that path. Delete it. The accompanying comment
  ("this collection only holds our subdir") is also inaccurate — the query is against the whole
  Downloads collection, so a name that exists anywhere in Downloads triggers the " (n)" suffix.
* `CookieManager.getInstance().getCookie(url)` is called from a pool thread (`:83`). WebView
  classes are documented as single-threaded/UI-affine; `getCookie` from a background thread works
  in practice on current WebView builds but is not guaranteed. Worth a device check, or read the
  cookie on the main thread before dispatching.

### M7 — Soft error handling over-reacts to normal conditions

`app/src/main/java/com/victuscloud/ecosystem/VictusWebViewClient.java:147-170`,
`MainActivity.java:1133`

* `onReceivedHttpError()` blanks the main frame for **any** status ≥ 400, hiding the body the
  server actually returned. A panel that legitimately answers 401 (login wall), 403 or a styled
  500 loses its own error page under the native overlay.
* `onReceivedError()` shows the overlay for any main-frame failure, with no filter for
  `ERROR_UNKNOWN`/`net::ERR_ABORTED`. A load cancelled by the user (tapping a dock chip mid-load,
  or a redirect race) can therefore paint "can't reach" over a page that is about to render fine.
  Comparing the failing URL with `webView.getUrl()` (or ignoring `ERROR_UNKNOWN`) removes the
  false positive.
* `showError()` guards `errorProceedButton` for null but not `errorWebViewUpdateLink` (`:1135`);
  safe today only because `createLayout()` runs before any client callback — worth making
  consistent.

### M8 — The web shell leaks its own progress timers, and reports fake progress

`src/App.tsx:54-70,74-102`

`triggerLoading()` schedules three `setTimeout`s and *returns a cleanup function* which the
single caller discards:

```ts
const triggerLoading = useCallback(() => { … return () => { clearTimeout(t1); … }; }, []);
// navigateTo: triggerLoading();     <- return value thrown away (App.tsx:77, :126)
```

So rapid navigation lets the previous chain keep writing: the bar can jump 100 → 55 backwards
and the "finished" callback fires for a load that was already superseded. Nothing is cleared on
unmount either. The progress values themselves (15/55/90/100 at 100/220/380 ms) are pure
simulation and have no relationship to `EcosystemFrame`'s real load state — contrast with the
native shell, whose progress comes from `VictusChromeClient.onProgressChanged`. Either wire the
web bar to a real signal or delete it in favour of the native one.

### M9 — Update check logic duplicated, and indexing tied to resource order

`app/src/main/java/com/victuscloud/ecosystem/UpdateSheet.java:244-276` vs
`UpdateChecker.java:256-262`; `UpdateSheet.java:189-197`, `:547`

`UpdateSheet.checkForUpdate()` re-implements `UpdateChecker.checkForUpdate()` (fetch → compare →
`rememberAvailable`), including its own `versionCode`/`ownVersionName` helpers (`:633-646`) that
duplicate `UpdateChecker.installedVersionCode/Name`. One implementation should win; the sheet
should call `UpdateChecker.checkForUpdate(context)` and only own the UI state.

Separately, `UpdateSheet` walks the UI by **ordinal**: `UpdateInstaller.Backend.values()[index]`
(`:195`) and `getStringArray(R.array.update_methods)[i]` (`:547`) must stay aligned with
`backendChips[3]` (`:68`). They currently match (3 and 3), but adding a fourth method to the
string array without adding an enum constant (or vice versa) is an
`ArrayIndexOutOfBoundsException` in `buildRoot()`. A `Map<Backend, Integer>` (or a length assert)
removes the trap.

### M10 — `isReduceMotion()` performs a Settings provider read on hot paths

`app/src/main/java/com/victuscloud/ecosystem/ThemeManager.java:159-175`

```java
return Settings.Global.getFloat(c.getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f;
```

That is a ContentProvider query (binder round-trip) and it is called from
`selectDock()` → `onPageLoadStarted/Finished` on **every navigation**, from `ToolsMenu.show()`,
from the dock chip pulse, and from the JS bridge. Honouring the system animator scale is the
right behaviour — but the value should be read once per resume (or cached with a short TTL)
instead of per navigation.

---

## Low

| # | Finding | Where |
| --- | --- | --- |
| L1 | `intent://` links with a package always go to the Play Store, even when the target app is installed. Should try `getLaunchIntentForPackage` first, then Play Store. Also worth hardening `Intent.parseUri` results (`setComponent(null)`, reject non-http(s) `browser_fallback_url`) to avoid intent-redirection from page content. | `VictusWebViewClient.java:104-135` |
| L2 | `presetIds()` allocates a new `String[]` on every `gradient()` call — and `gradient()` is called per chip, per accent refresh and per JS bridge push. Make it a `static final` table. | `ThemeManager.java:89,114,280` |
| L3 | `ToolsMenu.versionName()` hits `PackageManager` on the main thread each time the menu opens; `UpdateSheet.render()` does up to three `getPackageInfo` calls per render. Cache the installed version once. | `ToolsMenu.java:274-282`, `UpdateSheet.java:633-646` |
| L4 | Starfield draws up to 72 individual `arc()` calls per frame with a `globalAlpha` change per star (`state` change per particle), at up to 120 Hz. Pre-render one star sprite, bucket the alphas, and pause the loop via `IntersectionObserver` when the canvas is offscreen (visibility pausing is already handled). | `BackgroundFX.tsx:90-135` |
| L5 | Update checks send no `If-None-Match`/`If-Modified-Since`; a 304 path would cut payload and GitHub API usage. (The 6-hour throttle in `UpdateChecker.CHECK_THROTTLE_MS` is a good call — no excess polling anywhere in the app.) | `UpdateChecker.java:62`, `:319` |
| L6 | `ACCESS_NETWORK_STATE` declared, never used. | `AndroidManifest.xml:5` |
| L7 | Artificial 600 ms / 600 ms / 250 ms delays in `signIn`/`signUp`/`signOut` — harmless as latency simulation, but they are user-visible once real auth lands. | `authService.ts:139,174,204` |
| L8 | `getStoredNotifications()` re-parses the whole JSON array on every mutation and returns the module-level `INITIAL_NOTIFICATIONS` array **by reference** when storage is empty; entries are cast without validation, so one malformed record can break the panel. | `notificationService.ts:62-77` |
| L9 | Context values in `AuthContext`/`NotificationContext` are rebuilt on every render (no `useMemo`), so every consumer re-renders on any provider render. | `AuthContext.tsx:57-70`, `NotificationContext.tsx:38-50` |
| L10 | Index-based React keys in three list renders — reorder/delete will reuse the wrong DOM nodes. | `ServiceControlScreen.tsx:417`, `EcosystemFrame.tsx:346,461` |
| L11 | `package.json` still declares `"version": "2.1.1"`; unused by the bundle (no version string is embedded in the web output), but it contradicts `versionCode 24 / 2.2.1`. | `package.json:4` |
| L12 | `UpdatePrivilegedService.drain()` and `UpdateInstaller.drainOutput()` decode with the platform default charset; use `StandardCharsets.UTF_8` for determinism. `process.destroy()` without `destroyForcibly()`/timeout means a wedged `su`/`pm` blocks the worker thread indefinitely. | `UpdatePrivilegedService.java:66-79`, `UpdateInstaller.java:287-300` |
| L13 | No timeout on the Shizuku path: if `bindUserService` neither connects nor disconnects, the sheet shows "Connecting to Shizuku…" forever. A ~10 s watchdog with a retry/abort message would close it. | `UpdateInstaller.java:154-230` |
| L14 | Two dock implementations exist (native `MainActivity.buildDock` and web `DockBar`/`EcosystemFrame`) with slightly different destinations for the same tabs; only the native one can actually load the external sites today (see H3). Worth deciding which is authoritative in the shell. | `MainActivity.java:492-560`, `src/components/DockBar.tsx` |
| L15 | `WebView` is never given a `WebViewClient.onRenderProcessGone` handler; a tab crash kills the WebView permanently with no recovery path. Common for long-lived WebView shells. | `VictusWebViewClient.java` |

---

## Duplication

Cross-cutting duplication in the native UI layer — same helpers re-implemented per file:

| Helper | Copies |
| --- | --- |
| `dp(float)` | 4 (`MainActivity:1322`, `SettingsSheet:103`, `UpdateSheet:675`, `ToolsMenu:297`) |
| `text(...)` builder | 2 (`SettingsSheet:119`, `UpdateSheet:686`) |
| `color(int)` / `colorOf(int)` | 3 (`MainActivity:1311`, `SettingsSheet:107`, `UpdateSheet:671`) |
| `resolveAttr` + `new TypedValue()` ripple lookup | 3 (`MainActivity:1315`, `SettingsSheet:114`, `ToolsMenu:268`) |
| `describe(Throwable)` | 2 (`UpdateSheet` `describe(Exception)`, `UpdateInstaller:306`) |
| installed `versionName`/`versionCode` readers | 3 (`UpdateChecker:232-250`, `UpdateSheet:633-646`, `ToolsMenu:274`) |
| `sectionLabel(...)` call sites | 10 across `SettingsSheet` + `UpdateSheet` |
| `toast(...)` | 3 |

A single package-private `Ui`/`SheetLayout` helper (dp, colour, ripple, text, section label,
rounded drawable, weight params) plus one `InstalledApp` version reader would remove roughly
150–200 lines with no behaviour change. `UpdateSheet` and `SettingsSheet` are otherwise near
clones of each other's sheet chrome (transparent bottom dialog, handle, 26dp top radii, dim 0.5,
`SettingsSheetAnimation`) — the shared shell is worth extracting alongside it.

Other duplication:

* `ThemeManager.gradient(c)` (`:280-296`) duplicates `gradientForPreset(c, preset)` (`:114-133`);
  `gradient()` is exactly `gradientForPreset(c, getPreset(c))`.
* `UpdateSheet.checkForUpdate()` vs `UpdateChecker.checkForUpdate()` (M9).
* `MainActivity.indexForUrl()`, `isRefreshableUrl()` and `VictusWebViewClient.isInternalHost()`
  each re-derive host classification from the same rules; one `VictusHosts` helper would keep the
  dock, refresh policy, client routing and SSL scoping from drifting apart.
* The preset/colour tables exist in both `ThemeManager.java` and `src/theme/palettes.ts`. This is
  an intentional cross-language mirror (native chrome ↔ web), so keep it — but it is worth a
  parity test (assert the native accent triples equal the TS ones) since `tests/palettes.test.ts`
  only covers the TS side.
* `IMPORTANT` for reviewers: the two files named `SettingsSheet` (Java and TSX) and the two
  `ToolsMenu` files are **not** dead duplicates — the native versions are the Android chrome, the
  TSX ones run inside the WebView.

---

## Optimisation opportunities, ranked by payoff

1. **Stop shipping the invented panel data** (H4/M1/M2): one refactor, removes the largest
   correctness/credibility problem and shrinks the bundle.
2. **Cache what is static per process** (M10, L2, L3): system animator scale, the preset table and
   the installed version — removes binder/PM calls from navigation and sheet-open paths.
3. **Make the download path honest** (M6): propagate the de-duplicated name and verify
   `Content-Length`; that turns two silent-wrong behaviours into correct ones.
4. **Decide the Web-View story** (H3/L14): deleting the dev-only iframe path removes a whole
   toggle, its loading overlay, its error panel and its proxy plumbing — and the related M5 risk.
5. **Consolidate the native UI helpers** (duplication table): ~150–200 lines of deletion.
6. **Tighten the starfield** (L4): pre-rendered sprite + alpha bucketing, or 30 fps cap under
   `prefers-reduced-motion`/low-power; it is the only continuously animating surface.
7. **Conditional update requests** (L5): `If-None-Match` plus the existing 6-hour throttle keeps
   the GitHub quota comfortable even with many installs behind one NAT.
8. **Real download progress** (`DownloadTask`): `enqueue` has no progress hook although the
   WebView listener gets `contentLength`; a progress/notification path would make long downloads
   feel alive without any new dependency.

---

## Supabase considerations (explicit, as requested)

**There is no Supabase code, configuration, dependency or schema anywhere in this repository.**

* `package.json` dependencies are exactly `lucide-react`, `react`, `react-dom` (plus Vite/Tailwind
  dev tooling); there is no `@supabase/supabase-js` and no Supabase entry in `bun.lock`.
* A case-insensitive repository-wide search matches **three files only**, and every hit is
  prose: the header comment of `src/services/authService.ts` ("Supabase-style authentication
  service wrapper … swapping in live Supabase only requires replacing the internals"), the header
  comment of `src/services/notificationService.ts` ("a real backend/WebSocket/Supabase real-time
  channel can be hooked in"), and a line in `CHANGELOG.md` recording that the dependency was
  removed in `3e5ea3e refactor: remove Supabase dependency and reset password feature`.
* There are no tables, no RLS policies, no migrations, no `supabase/` directory, and no Supabase
  keys to rotate — so there is **nothing to change in the schema**, and nothing in this review
  proposes touching one.

What remains is the *seam* the removed client used to occupy, and that is where the
non-schema issues live — all client-side, all fixable without a migration:

1. ~~`authService` is the drop-in point, and its internals are a mock (H1).~~ **Done in 2.3.0**,
   and done without Supabase: `authService` now authenticates against the Victus panel. The three
   internals the review listed as "must not survive" did not: `role` comes from `root_admin`, the
   `Math.random()` token is gone (there is no token in the web app at all), and the fabricated
   7-day `expires_at` is replaced by the panel's own expiry (0 = the API key does not expire).
   The public API surface (`signIn`/`signOut`/`getSession`/`getUser`/`onAuthStateChange`) is
   unchanged; `signUp` was removed rather than kept as a stub, because the panel has no
   registration route (405) and accounts are created at the billing portal.
2. Session storage still uses `localStorage` under `victus_auth_session`, but what is stored is now
   credential-free (the key lives in the native layer), so a same-origin script cannot lift a
   usable token from it. M5 (iframe `allow-same-origin`) and M3 (user-CA trust, backups) remain
   worth fixing on their own merits — with real credentials now in play, backup extraction in
   particular is worth revisiting, though the Keystore-sealed session is useless off-device.
3. `notificationService` is the intended realtime hook; its service boundary is fine, but L8
   (re-parse per mutation, fixture array returned by reference, unvalidated cast) should be fixed
   first so a live channel is not built on shaky local state.
4. `tests/services.test.ts` already covers the auth contract (validation, persistence, expiry,
   corrupt-session rejection, cross-tab sign-out), so a future swap to a real client can be
   validated against the same tests — that is the safest way to satisfy "don't mess with
   Supabase" while still improving correctness.

---

## Testing recommendations (highest value first)

* **T1 — Extract and unit-test the SSL decision.** `onReceivedSslError`'s logic
  (same-host check → internal-host check → trust setting → error-code allowlist) is the most
  security-sensitive branch in the app and is untested. A pure
  `SslPolicy.decide(code, isInternalHost, isSameHost, trustEnabled)` in the style of
  `UpdateCommands` would be JVM-testable — and would let the "never proceed on expired/mismatch"
  guarantee be asserted rather than commented.
* **T2 — Test the download naming/dedupe.** `uniqueName`/`exists` behaviour (and the name reported
  to the user, M6) is testable against a fake `ContentResolver`/cursor.
* **T3 — Test `ThemeManager` and the URL→tab mapping** (`indexForUrl`, `isRefreshableUrl`), plus a
  native↔web palette parity test (duplication section).
* **T4 — Add a WebView-level regression for the routing/TLS paths** using the existing Playwright
  harness in `scripts/verify-webview.mjs` (it already drives the bundled assets headlessly) — the
  `http://` internal-link case in H2 is straightforward to assert there.
* **T5 — done for the panel contract, not for TLS.** `VictusApiTest` (29 JVM tests) pins the
  request bodies and every response shape the sign-in flow branches on, using payloads captured
  from the live panel, and `tests/auth.test.ts` (23 tests) drives the service through a stubbed
  bridge, including the two-factor and rejected-credential paths. `SslPolicy.decide` from T1 and
  the download naming from T2 are still uncovered.

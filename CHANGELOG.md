# Changelog

## Victus Cloud 4.6.6 (a way back into the admin area)

`versionCode 54` / `versionName 4.6.6`. **Install this over 4.6.5.**

### Added

**"Check admin access again".** The Admin Area entry
(`https://control.victuscloud.com/admin`) only appears once the shell has asked
the panel what the signed-in account may use. That check is silent and
rate-limited — correct for a background poll, wrong for the one thing a user is
actually waiting on. A probe that failed once, because the phone was offline at
launch or the panel was busy, left a genuine administrator with no Admin Area
entry and nothing on screen to say why. It looked exactly like the app deciding
they were not an admin.

A signed-in account with no admin area now has a way to ask again; the panel is
re-queried immediately and the Admin Area entry appears on its own a moment
later if access is granted. The entry names no URL and no privilege — it asks a
question rather than granting anything — and it is shown only to a signed-in
account, so non-admins still see nothing admin-related. Three new tests.

## Victus Cloud 4.6.5 (new releases now offer themselves)

`versionCode 53` / `versionName 4.6.5`. **Install this over 4.6.4.**

### Added

**Automatic update prompt.** The app already polled the GitHub release feed on
launch, deliberately "quietly ... and never prompts": the only signal a phone
got was a badge buried in the tools menu. A user who never opened that menu
stayed on an old build indefinitely, which defeats the point of publishing a
release at all. When the background check finds a genuinely newer build, the
update sheet now offers itself once, a moment after launch.

It is offered **once per build**, never twice, and never on top of a sheet the
user already opened. A newer release is a new decision and is offered again;
reinstalling the same build can offer it again. Covered by seven new tests
(`UpdatePromptTest`).

Tagging a release already publishes the signed APK to the GitHub Release, which
is what the updater reads — no workflow change was needed.

### Not in this release

Empty server console and details, a sidebar that does not update, Victus Drive
not listing real uploads, billing not listing real invoices, notifications not
listing real ones, and the missing profile / account-settings / reseller-API
pages. Every one of those reads the signed-in account from the control panel, so
all of them stand or fall together with sign-in. They are being worked as one
problem rather than patched one symptom at a time.

## Victus Cloud 4.6.4 (the real cause of "nothing scrolls")

`versionCode 52` / `versionName 4.6.4`. **Install this over 4.6.3.**

4.6.3 fixed pull-to-refresh but not the reason nothing scrolled, because the
reason was not in the native layer at all.

### Fixed

**Scrolling — the actual cause.** `.app-shell` was a fixed-height
(`100dvh`), `overflow: hidden` box and `.app-content` clipped too, so the
document was never taller than the viewport. The WebView was therefore *correct*
to report "cannot scroll up" on every gesture, and the native layer faithfully
turned each of them into a pull-to-refresh. The document is now what scrolls:
the shell grows with its content and the header and channel bar are `sticky`
rather than fixed. Covered by four new tests that read the stylesheet, because
this bug lived in the stylesheet.

**The chat bubble could still be dragged off the screen.** It was
`position: absolute` inside the shell — a box that is now as tall as the whole
document — so it was measured and placed against something far larger than the
viewport. It is now `position: fixed` and clamped to the viewport.

**Create Account** now opens `https://victuscloud.com/signup`, the site's real
sign-up form (verified 200), rather than a billing page.

**A build stamp in the account sheet.** "The fix doesn't work" and "the old APK
is still installed" look identical from the outside. The account sheet now shows
the installed binary's own `versionName`, read from `BuildConfig`, so the running
build is never a guess again.

### Investigated, and why the fix was not obvious

`control.victuscloud.com` is a **Laravel** panel. Its login POST requires a
`GET /sanctum/csrf-cookie` first and the resulting `XSRF-TOKEN` cookie echoed as
a header; without it the POST does not reach the login handler at all and comes
back as the site's HTML. The app already performs exactly that handshake, and
sends the field name the panel's own JavaScript sends (`user`), so the request
the app makes matches the one the site makes. The panel's login form also carries
a reCAPTCHA token.

Admin pages never appearing is a consequence of this, not a separate bug: the
admin view-toggle only appears once a sign-in has succeeded and the panel has
confirmed the role.

Custom recovery email, Google sign-in and passkeys remain as recorded in 4.6.3.

## Victus Cloud 4.6.3 (scrolling, the chat bubble, the theme toggle, and the demo account gone)

`versionCode 51` / `versionName 4.6.3`. **Install this over 4.6.2.**

Six of the reported problems turned out to be native-shell bugs rather than web
bugs, and each one is fixed at the layer that actually caused it. Every fix is
covered by a new regression test.

### Fixed

**Scrolling was dead on every page.** The pull-to-refresh layout (`SwipeRefreshLayout`)
asked its child `canScrollVertically(-1)` before deciding whether to claim a
vertical drag — and on a `WebView` that answer is a scrolling-compositor flag that
does not update until *after* the touch has been consumed, so it claimed
essentially every drag. Now the layout asks `MainActivity.webViewCanScrollUp()`
on each gesture, so pull-to-refresh only arms at the very top of the page and
never fights a scroll or a drag. New `PullToRefreshScrollTest` covers it.

**The chat bubble could not be moved up, and tapping it did nothing.** Three
separate bugs: the drag threshold was 5px so ordinary taps were swallowed as
drags; the top clamp was the top-bar height instead of the safe-area margin, so
the bubble was pinned and looked immovable; and `pointercancel` only cleared a
flag, so an interrupted gesture could strand the bubble mid-drag. The bubble now
uses a 10px threshold with an explicit click handler, can be dragged anywhere
inside the safe area (never under the bottom channel chips), remembers its
position, and tells the native shell to hold off pull-to-refresh for the duration
of the drag.

**The light/dark button did nothing.** The web app flipped its theme, but the
native Appearance sheet owns the persisted value and re-asserted it on the next
theme injection — so the change was reverted a moment later. The toggle now
pushes the choice to the shell (`shellSetColorMode`), which applies the
WebView's colour scheme and recreates the native chrome only when the mode
really changes. Light and dark agree, the choice is restored on launch, and it
cannot fight the Appearance setting.

**"Create Account" opened the Control area.** The sign-up constant pointed at
`https://billing.victuscloud.com`, whose own Register button lives at
`.../register`. Corrected.

**Admin rights were not recognised.** The admin probe only ran on resume or after
sign-in, so a normal cold launch never asked; and the role check read only
`root_admin`, so a full administrator who is not the owner was treated as a normal
user. The probe now runs once at the end of `onCreate` and `parseAccount`
accepts `root_admin || admin`. Authorisation is still enforced by the server —
this only fixes what the app asks for.

**Login identifier handling.** Emails are trimmed, stripped of whitespace and
lowercased before they are sent; usernames keep their case, because the panel
treats them as case-sensitive. Network failures already reported a distinct
message, so a connection problem can never surface as "no account".

### Removed

**The demo account and every trace of it** — the demo sign-in, the sample fleet
data, the "Demo" badge, the demo admin preview and the fake-service fallback. With
nobody signed in the app shows the login screen, and a real user can never see
fabricated data. `scripts/verify-webview.mjs` was rewritten to sign in through
the app's own form against a stubbed panel fleet (53/53 checks) so nothing here
still depends on demo data.

### Tests added

`LoginIdentityTest` (13), `PullToRefreshScrollTest` (6), `tests/shell4.test.ts`
(13), plus rewritten demo assertions in `tests/auth.test.ts`. Totals: 154 JVM
tests, 143 web tests, 53 WebView checks — all green, and nothing is minified,
shrunk or obfuscated (`checkNoShrinking` still passes).

### Not in this release

Custom recovery email, Google sign-in and passkeys all need work on
`control.victuscloud.com` (or a Google OAuth client and a Digital Asset Links
file on `victuscloud.com`) before the app can be honest about them. They are not
faked; see the release notes.

## Victus Cloud 4.6.2 (a sweep for the bugs the crash-fix release was hiding)

`versionCode 50` / `versionName 4.6.2`. **Install this over 4.6.1.**

4.6.1 fixed the instant crash, which meant the app ran for the first time in
four releases — and running it exposed a set of defects that had been sitting
behind that crash, unreachable and therefore never seen. This release is the
result of a systematic pass over every path the crash had been hiding, with each
fix backed by a regression test that was verified to **fail against the old
code** before being kept.

### Fixed

**"Clear app session" did nothing at all** (the worst of these). The dialog
wiped WebView cookies, storage, cache and history — but the panel session does
not live there. The API key is sealed in the Android Keystore by `SecureStore`
and the cookie jar lives in `VictusHttp`, and neither was touched. So the reload
that followed called `authRestore()`, which re-validated the still-valid key and
signed the user straight back in. The user was told their session was cleared
and was not. The native clear now also signs out of the panel *locally* (without
revoking the key, which is what the dialog's own wording promises) and tells the
page, which resets its history, cached session and server data.

**A blank screen with no way out of it.** The error overlay fades out over
160ms, and its fade-out sets the overlay `GONE` when it ends. `showError()`
only re-showed the overlay when it was not already `VISIBLE` — which it *was*,
for the whole 160ms. So a page that failed again inside that window had its new
message written and then hidden by the in-flight fade-out: no message, no Retry,
no Go Home, just the system back gesture. The fade is now cancelled before the
new one starts, so the newest error always wins.

**Back closed the app instead of going Home after a rotation.** `onSaveInstanceState`
saved the selected tab, and `onCreate` parsed it into a local variable that was
then never used — `selectedDock` stayed at `TAB_HOME`. Back navigation consults
that value to choose between "go Home" and "leave the app", so from any tab,
after any rotation or low-memory restore, back killed the app. The value is now
restored, and an out-of-range saved tab falls back to Home instead of indexing
off the end of the dock.

**Launcher shortcuts were forgotten.** `onNewIntent` acted on a `victus://`
shortcut but never called `setIntent()`, so the framework kept re-delivering the
intent the task was *launched* with. Any shortcut that arrived while the app was
already running was lost the moment the process was recreated.

**The file picker could be wedged forever.** A document picker left open across
a destroy left the page's `<input type="file">` blocked: its `ValueCallback` was
never answered, so the WebView considered the request still in flight and ignored
every later tap on that input. It is now answered on destroy.

**Any origin could ask for the camera and microphone.** The WebRTC permission
handler restricted *which resources* could be granted, but never checked *who*
was asking. This shell loads third-party content alongside its own pages, so a
malicious sub-resource on an otherwise trusted page could open a live capture
stream. The origin is now checked as well, and the check requires an `https`
scheme — a `file://victuscloud.com`-shaped origin carries our hostname but is not
a web origin. This also found a second gap while the test was being written: the
first version of the fix matched on host alone.

**Two navigations in one React batch could drop you back to Home.** `App.tsx`
updated the history array and its index as two separate state updates, both
reading the same captured `currentIndex`. A double-tapped chip, or a navigation
from a promise callback, truncated history twice to the same length while the
index advanced twice — leaving `currentIndex` past the end of the array, so
`currentEntry` was `undefined` and the app silently fell back to Home. The index
is now derived from the history update, so the two cannot disagree.

**Leaked timers firing into unmounted components.** The toast provider scheduled
an untracked `setTimeout` per toast, and the chat bubble overwrote its pending
reply timer instead of clearing it, orphaning it so it fired after unmount and
could never be cancelled. Both are tracked and cleared.

### Also hardened

- `loadTab()` bounds-checks its index and now records the tab selection even when
  the target page is already loaded — a no-op "go Home" previously left the
  bookkeeping stale, so back kept trying to go Home instead of letting the app
  close.
- `onNewIntent` guards the update sheet against a finishing/destroyed activity
  and re-marks the current dock selection, so a shortcut no longer leaves the
  menu showing the wrong chip.
- `WebViewSetup.ASSETS_HOST` is now one shared constant instead of a private copy
  on `MainActivity` and a literal in the chrome client, so the security-relevant
  "is this the bundled app?" checks cannot drift apart.

### Tests

Ten new tests, all verified to fail against the code they replace:

- `MainActivityStateTest` (9) — Robolectric, drives a real `MainActivity`: the
  error-overlay fade race, tab survival across a restore, corrupt saved state,
  shortcut/deep-link intent retention, the file-picker teardown, and WebView
  detachment. Reverting the fixes makes four of them fail.
- `WebRtcOriginPolicyTest` (10) — pins the camera/microphone origin allowlist,
  including the suffix-confusion hosts (`notvictuscloud.com`,
  `victuscloud.com.evil.example`) and the fail-closed cases.
- `regressions.test.ts` (6) — the web half: the clear-session event handshake
  and its cleanup, toast timer cancellability, and navigation-history
  consistency.

Full suite at this commit: **129 web tests**, **135 JVM tests**, 0 failures;
`tsc` clean; both APKs assemble unshrunk (`checkNoShrinking: OK`); 52/52 WebView
checks; backdrop and panel contract checks pass.

### Still outstanding (not fixable from the app)

- `www.victuscloud.com` serves an **expired certificate** (expired 2026-09-02).
  This needs renewal at the server; the app folds `www.` onto the apex host
  (`InAppLinks.canonicalizeAuthority`) so it never navigates there itself, but the
  hostname is still broken for anything else.
- On-device launch verification is still impossible in this environment (no
  KVM, one core, 1.98 GB RAM — the emulator cannot start). Everything above is
  verified by the JVM/Robolectric suite and by reversion, not by a real device.

## Victus Cloud 4.6.1 (the real instant-launch crash, found and fixed)

`versionCode 49` / `versionName 4.6.1`. **Install this over 4.6.0.**

### The actual cause of the instant crash

4.5.2 was wrong. Turning shrinking off was necessary — the shrinker really had
removed all 30 `androidx.core.splashscreen` classes and the
`installSplashScreen` call on the first line of launch — but it was **not** what
was crashing the app, which is why 4.5.2, 4.6.0 and every release before them
all still died on launch.

The real cause is in `MainActivity.createLayout()`:

```java
rootView.addView(webView, ...);        // webView's parent is now rootView
...
pullRefresh.addView(webView, ...);     // IllegalStateException
```

`ViewGroup.addView` throws the moment a child already has a *different* parent:

> `java.lang.IllegalStateException: The specified child already has a parent.
> You must call removeView() on the child's parent first.`

This is unconditional — no device, no build type, no configuration avoids it.
It runs inside `createLayout()`, which `onCreate()` calls before anything is
configured, so the process died **before the first frame was drawn**. It has been
present since the pull-to-refresh port in `10871c9` ("port reference Tools menu
and Appearance settings, release 2.2.1") and has killed the app ever since.

The fix is to add the WebView to the pull wrapper first and never to the root, so
it is never re-parented.

### Why nobody caught it

Every test in this project targets a pure helper class. Nothing ever executed
`MainActivity.onCreate()`, so the launch path was entirely unverified — which is
also why the earlier "the shrinker removed the splash classes" diagnosis was so
confident and so wrong. The class-diff evidence was real; the causal leap from
"these classes are missing" to "this is why it crashes" was not.

`MainActivityLaunchTest` now boots the Activity under Robolectric and runs the
real `onCreate()` — splash handoff, `createLayout()`, `configureWebView()`, the
WebView load. Verified by reverting the fix and watching it fail with the exact
exception above.

Robolectric ships no WebView provider, so the test drives a small subclass that
overrides one new `protected isWebViewUsable()` seam. Without it the test would
stop at the app's "no WebView" screen and never reach the code that crashes.

### A second crash, on real devices

The new test immediately surfaced another one on the launch path:
`WebSettingsCompat.setAlgorithmicDarkeningAllowed()` raises
`UnsupportedOperationException` when the WebView provider advertises
`ALGORITHMIC_DARKENING` but cannot service the call — real on some custom-ROM
WebViews and during provider updates. That is a cosmetic colour preference, and
it is now guarded so it can never take the app down on the first frame.

### About the APK size

The release APK is ~2.65 MB and the debug APK ~4.19 MB. **Nothing is missing.**
Measured on the shipped artifacts:

- All **161** app classes are present in the release dex; the only differences
  from debug are lambda-desugaring artifacts (`$$ExternalSyntheticLambda0`).
- Resource entry counts are identical: **78 vs 78**.
- The gap is dex layout, not content: `classes4.dex` (835 KB) disappears and
  `classes.dex` shrinks by 544 KB because release-mode D8 keeps only the
  reachable parts of the `j$/…` core-library desugaring support, which debug
  carries in full.

Release also stores the same payload more efficiently (7.0 MB uncompressed vs
9.9 MB). Smaller release than debug is normal and expected, and is not evidence
of a broken build.

## Victus Cloud 4.6.0 (the background actually animates, plus an OLED mode)

`versionCode 48` / `versionName 4.6.0`. **Install this over 4.5.2.**

### The background animation was running the whole time — and invisible

This is the honest diagnosis, because it is not what it looked like. Every
keyframe was live and playing from the first release. Nothing was broken,
disabled, or frozen. The animation was simply **too faint to see**, so from the
outside it was indistinguishable from a dead one.

Measuring it instead of guessing: the build was screenshotted twice, 2.5 s
apart, and the decoded pixels were compared.

| | before | after |
| --- | --- | --- |
| aurora mean pixel change | **0.85** / 255 | **4.5** / 255 |
| aurora peak | 35 | 77 |
| share of screen in motion | 9.4% | 23.5% |

A mean shift of 0.85/255 is roughly one-fifth of a single brightness step. No
amount of waiting makes that read as motion.

Why it was so faint:

- The colour fields were 78% of the screen and parked at `-20% / -24%` offsets,
  so the **bright core of every field sat off-screen** and only the faded tail
  was ever on display.
- Peak opacity was `0.32` over a near-black canvas, and the fields were painted
  *over* that canvas rather than added to it.
- Travel was 40% over 30 s, so the movement that did exist was imperceptibly slow.
- The mesh grid was masked by an ellipse that peaked at 38% height and was fully
  gone by 78% — the **bottom two-fifths of a tall phone had no grid at all**.
- The starfield drew 26–72 sub-pixel dots drifting at under 0.1 px/frame.

What changed:

- Fields are now 150% of the viewport with their cores inside the visible area,
  blended with `screen` so they read as emitted light rather than a translucent
  film, with a multi-stop falloff that needs no `filter: blur()`.
- Faster, further travel on a four-point path, so the loop never dwells in one
  place.
- The mesh gained an 11px minor lattice, a travelling highlight sweep, and a mask
  that covers a tall phone.
- The starfield is denser, twinkles, and has a few bright anchor stars with halos
  for depth.

Also fixed here: **reduced motion was strobing, not freezing.** It set
`animation-duration: 0.01s` but left the iteration count infinite, so looping
animations re-ran ~100x a second and flickered instead of holding still.

### OLED mode and standard mode

A new **Display panel** setting, in both the web Appearance sheet and the native
one:

- **OLED** — the canvas drops to `#000000` so the pixels switch off entirely, the
  always-on grid overlay is switched off (it would light the whole panel back up),
  surfaces become translucent, and separation between layers comes from borders
  and text contrast rather than from lifting grey. It is applied as a transform
  on top of whichever theme is active, so all five presets plus custom palettes
  get an OLED variant for free.
- **Standard** — the existing lifted near-blacks, which scroll more smoothly on
  LCD panels and do not smear.

The choice is stored natively, mirrored to the web app over the existing
`victus:theme` bridge, and applied live without an activity restart.

OLED is deliberately **inert in light mode**. Applying true black under light
text would be unreadable, so the stored preference is simply left in place and
takes effect the moment you switch back to Dark. That rule is pinned by tests on
both sides, because getting it wrong is silent and severe.

### UI

- Home cards are now translucent, derived from whatever the active theme painted
  into `--panel`. They were fully opaque, which hid the animated backdrop behind
  them almost everywhere — a large part of why the background looked dead.
- Stronger borders in OLED mode so layered surfaces stay readable on true black.

### Proving it

Two new checks, both wired to fail loudly in CI:

- `node scripts/verify-backdrop.mjs` — screenshots the built app and grades real
  pixel movement per style, with per-style budgets. The starfield is graded on
  peak and coverage rather than mean, because a starfield is *supposed* to be
  mostly black and a mean-delta budget would push it toward fog.
- `tests/backdrop.test.ts` — pins the values behind those numbers so they cannot
  quietly drift back to invisible.

The OLED/light-mode bug above was found by that runtime check, not by reading
the code — the token layer was already correct and the CSS class was not.

Playwright moved from an ad-hoc symlink to a real dev dependency so the check can
run on a clean runner. The web unit tests are now part of CI as well.

### Verified

tsc clean · 123 web tests · 108 JVM tests · gradle `BUILD SUCCESSFUL` with
`checkNoShrinking: OK` · 52/52 headless WebView checks · panel contract check
PASS · backdrop check PASS (all three styles) · OLED true-black in dark and inert
in light. Shrinking remains off for both build types, permanently.

## Victus Cloud 4.5.2 (fix the instant-launch crash — shrinking is now off, permanently)

`versionCode 47` / `versionName 4.5.2`. **Install this over 4.5.1.**

### The crash, and what actually caused it

The 4.5.0/4.5.1 release APK (816 KB) crashed instantly on launch. The size drop
was the clue, and the cause was found by **diffing the two APKs** rather than by
guessing — comparing the shrunk release against the unshrunk debug build of the
very same commit:

| | debug (unshrunk) | release (shrunk) |
| --- | --- | --- |
| `androidx.core.splashscreen` classes | **30** | **0** |
| `installSplashScreen` in the dex | present | **gone** |
| Resources | 400 | 370 |

`MainActivity.onCreate()` calls `SplashScreen.installSplashScreen(this)` as the
**first statement of the launch path**. R8 removed the entire
`androidx.core.splashscreen` backport underneath it, and
`shrinkResources` removed the splash-screen layout, drawable and dimens it needs
on pre-Android-12 devices. A class on the very first line of `onCreate`
disappearing under minification is exactly the "starts and dies immediately, and
only in the small build" failure.

The proguard rules that were meant to prevent this (`-keep` on
`@JavascriptInterface` members and on `androidx.webkit.**`) never mentioned the
splash screen, which is only reachable through a library whose sole reference is
the launch path — precisely the case shrinking turns into an undiagnosable crash.

### The fix

- `minifyEnabled false` and `shrinkResources false` for **both** build types, no
  `proguardFiles`, no R8, no ProGuard, no obfuscation, no asset or resource
  removal. **Size is not a goal; being able to start is.**
- `proguard-rules.pro` is no longer applied. It is kept in the repo as a record of
  what those rules used to do and why shrinking is not to be revisited without a
  device to launch the result on.
- `checkNoShrinking`, a Gradle verification task wired into `preDebugBuild` and
  `preReleaseBuild`, **fails the build** if anyone sets `minifyEnabled true`,
  `shrinkResources true`, or re-adds `proguardFiles`. It inspects non-comment
  lines only, so documenting the old values in a comment cannot trip it.
- `tests/no-shrinking.test.ts` pins the same rule in the test suite, including
  that the splash screen is still installed on the first line of `onCreate`.

**Verified after the fix**, same commit, no other change involved:

- `androidx.core.splashscreen`: **29/29** real classes back in the release dex,
  `installSplashScreen` present.
- Classes present in debug but absent from release: **0 non-synthetic ones**. (The
  368 that differ are all `$$ExternalSynthetic*` and `j$/…r8/Desugar*` classes the
  compiler and desugarer generate differently for the two variants — not
  removed code.)
- Resources: **400 in debug, 400 in release, 0 missing.**
- Assets: byte-identical apart from the standard `baseline.prof` the release
  variant carries.
- Release APK **816 KB → 2.65 MB**. It is smaller than the 4.19 MB *debug* APK
  only because the debuggable variant carries extra debugger symbols; nothing is
  stripped from the release build.

### Everything else from 4.5.0/4.5.1 is unchanged and still green

`tsc -b --noEmit` clean · 104 web tests · 104 JVM tests · `assembleDebug
assembleRelease testDebugUnitTest` BUILD SUCCESSFUL · 52/52 headless WebView
checks · panel contract check PASS · both APKs signed `CN=Victus Cloud`.

## Victus Cloud 4.5.1 (restore tap feedback, honest error messages)

`versionCode 46` / `versionName 4.5.1`. Same work as 4.5.0 plus three fixes
found while closing it out.

- **Tap feedback was lost with the native chrome.** The shell fired
  `HapticFeedbackConstants.KEYBOARD_TAP` from the dock chips and the Tools menu
  rows, so removing that UI took the feedback with it. Restored on the single
  web menu: `navigator.vibrate` through a new `src/utils/haptics.ts`, wired into
  the channel chips, every drawer row (one capture-phase listener, not a dozen
  hand-edited handlers), back, refresh, and the admin view-toggle. `VIBRATE` is
  declared in the manifest — a normal permission, nothing is prompted for — and
  every path is guarded, so a device with no vibrator or a browser without the
  API ends in silence rather than an error.
- **A failed page load said nothing useful.** `onReceivedError` showed the raw
  platform code and `net::ERR_…` string. `NetworkErrors` (new, pure Java, unit
  tested) classifies each code into offline / DNS / timeout / refused / TLS /
  scheme / rate-limited, and the screen now says the plain thing — "No internet
  connection", "The site took too long to answer" — which is something a person
  can act on. Codes the app does not recognise fall through to a generic
  sentence rather than being guessed at.
- **Every resume fired a network round trip.** The silent admin-area probe now
  runs on a 30-second floor, claimed atomically so a burst of resumes can only
  ever queue one probe; a sign-in always bypasses the floor, because that is the
  one moment the answer must be fresh.

## Victus Cloud 4.5.0 (one menu, role-aware admin areas, a working authenticator)

`versionCode 45` / `versionName 4.5.0`.

### One menu only

**Why there were two.** The native shell drew its own top bar
(`buildTopBar`/`buildDock` in `MainActivity`) and the bundled React app draws its
own header and channel chips (`src/components/TopBar.tsx`,
`src/components/DockBar.tsx`). The native pair was written for a bare WebView
that had no UI of its own; the web pair came from the reference app the shell
embeds. When the React app grew a header, the shell never lost its — so both
rendered, stacked.

The demo account's menu wins, per the brief, so the native pair is **gone**:

- Deleted `buildTopBar`, `buildDock`, `buildDockChip`, `styleChip`, `selectDock`,
  `chipToVisible` and the native insets handler from `MainActivity`. The layout is
  now a chromeless page host: a full-screen WebView inside `SwipeRefreshLayout`
  (pull-to-refresh kept) with a 3dp progress bar and the error overlay. The
  bundled app's own `pt-safe` / `pb-safe` padding owns the safe areas, and the
  progress bar alone is offset below the status bar/cutout.
- The web header drives back, refresh, the update marker and the hamburger;
  `App.tsx` routes back through in-app history first and then hands over to the
  shell (`shellBack`) so WebView history still works, and refresh goes to the
  shell (`shellRefresh`) whenever a live portal is on screen.
- **No feature was lost.** Every old triple-dot Tools entry now lives in the one
  hamburger menu, in the same glass style: Settings/Appearance, Open in browser,
  Open site in app browser, Copy link, Share link, Support, System status,
  Marketplace, Knowledgebase, Check for updates, Device compatibility, Clear app
  session (with confirmation) and Log out. The Appearance sheet keeps presets,
  custom gradient, palette, hex input, reduce animations and display mode.
- The unreachable native `ToolsMenu` popup class, its ten vector drawables, the
  `onToolSelected` dispatcher and 24 now-dead strings/3 dead colours were removed.

### Admin areas are role-aware and invisible to everyone else

- `MainActivity.startAdminAreaCheck()` re-reads `GET /api/client/account` on a
  background thread after every sign-in and on **every `onResume`**. Nothing is
  logged, no spinner or message is shown, and a failure simply leaves the last
  answer in place.
- Only accounts the panel reports as `root_admin` get any admin surface. The
  areas list reaches the web app through `shellAdminAreas()`, already filtered to
  the page on screen; a demo account, an offline failure and a normal account all
  get `[]`.
- On an admin area a small **Switch to web view / Switch to app view** toggle
  appears with a liquid settle (`liquid-settle`, opacity + scale only, so it stays
  composited). With Reduce animations on it is a plain fade (`liquid-fade`). The
  chosen view is remembered per area in `localStorage`.
- The answer is kept live (`useShellAdminAreas`): re-read on a slow tick and on
  `visibilitychange`, so a granted role makes the toggle appear in real time even
  on a page already open, and a revoked role removes it immediately.
- The old always-visible **"Web View"** button is gone, as are the **Admin Area**
  menu entry and any hint, for non-admins. The live site stays one tap away for
  everyone through "Open site in app browser" in the same menu.
- Hiding the control is presentation only. The panel still authorises every admin
  request, nothing trusts a client-side flag, no role data is stored or logged,
  and the credential never crosses the bridge.

### The authenticator accepts valid codes

Root causes found in the app's own two-factor path:

1. **Recovery codes were sent in the wrong field.** The panel validates
   `authentication_code` (TOTP) and `recovery_token` (recovery) separately, and
   the app put every string in `authentication_code`. A perfectly valid recovery
   code could therefore only ever come back as "invalid code". Codes are now
   classified by shape and routed to the right field. The TOTP path is unchanged.
2. **Pasted codes were not normalised.** "123 456" — what most authenticator apps
   display and what Android's OTP autofill inserts — was sent with the space
   inside. Spacing is stripped; letter case is deliberately preserved, because the
   panel compares recovery codes case-sensitively.
3. **The CSRF token could be stale at the checkpoint.** Laravel regenerates it
   when the session is regenerated by the password POST. The jar's `XSRF-TOKEN`
   cookie is now preferred over the login page's meta tag, and a 419 re-seeds
   from `/sanctum/csrf-cookie` — the panel's own SPA's sequence — before retrying
   once.
4. **No idea when the code had rotated.** `TotpWindow` (new, pure Java) tracks
   the panel's 30-second window from the `Date` header of every response, so a
   phone whose clock is wrong is still aligned. The 2FA screen shows a silent
   ring counting down the panel's real remaining seconds and re-reads at each
   boundary; a rejection within 4 seconds of the boundary now says the code just
   rolled over instead of repeating "invalid code".

Nothing weakens security: the ±1-step verification stays on the panel, no code is
ever widened, computed or logged, and the offset is a clock alignment only.

### SSL / domains

**Root cause of the "Can't reach Victus Cloud (error 3)" report:** the app could
follow a link to `www.victuscloud.com`, and that host has been left behind with a
certificate that **expired on 2 September 2026** (verified: `notAfter
Sep 2 01:33:40 2026 GMT`; the apex `victuscloud.com` certificate covers
`DNS:victuscloud.com` only). Every URL that reaches the shell is now folded onto
the apex host before it is opened, so the app can never walk into a host the site
no longer serves. `victuscloud.com`, `control`, `billing`, `drive` and `community`
all present complete, currently-valid chains.

**And the bypass is gone.** `ThemeManager.isTrustVictusSsl()` defaulted to
**true**, so `onReceivedSslError` called `handler.proceed()` for every certificate
the device could not verify on a Victus host — a blanket TLS bypass, and a Play
Store policy violation. The preference, the "Trust Victus Cloud certificates"
switch and the error screen's "Proceed to Victus Cloud" button are deleted; the
connection is always refused. In their place the error screen offers the two
things that actually fix it: **Update WebView** and **Check date & time** (the
system date settings). No `.xyz` Victus domain exists anywhere in the repository.

### Bugs, performance and cleanup

- **Admin toggle could not appear on a page that was already open** — the role
  snapshot was read once per URL, so a check that finished later was never seen.
  Now kept live (see above).
- **"Open site in app browser" did nothing in a browser build** — no
  `window.open` fallback; added.
- **`.env` was untracked but not ignored**, i.e. one `git add .` away from
  committing a panel key. Now ignored, with `.env.example` explicitly kept.
- **A duplicated `refreshUpdateUi` block** on a field nothing ever assigned
  (always `null`, so both blocks were no-ops) removed.
- An orphaned Javadoc block in `MainActivity`, a duplicate Knowledgebase row in the
  hamburger menu, and 24 strings / 3 colours left dead by the native chrome's
  removal were deleted. The `Do not delete/` directory was **not** touched.
- Release build runs `minifyEnabled` + `shrinkResources`: **813 KB** (the debug
  variant stays unshrunk at 4.2 MB for fast sideloading).

### CI

One workflow builds both APKs on every run and verifies both signatures: the
debug build as a downloadable artifact on every push, and the minified, signed
release APK attached to the GitHub Release on a `v*` tag. Exactly one `.apk` is
attached to a release, because the in-app updater picks an `.apk` from the
release assets.

### Supabase

Still nothing: there is **no Supabase code, URL, key, client, table, policy or
edge function anywhere in this repository**, so nothing was changed and nothing
was exposed.

### Verification

`tsc -b --noEmit` clean · 93 web tests · 99 JVM unit tests · `./gradlew
assembleDebug assembleRelease testDebugUnitTest` BUILD SUCCESSFUL · 52/52 headless
WebView checks (`scripts/verify-webview.mjs`, now covering admin gating, the
toggle, its per-area memory and real-time revocation) · panel contract check PASS
against the local fixture over real TLS.

## Victus Cloud 2.5.0 (codebase audit: crash-adjacent and data-loss fixes)

- **Dark/light start-up flicker** — the bundled page always rendered dark on
  first paint even for light-mode users (the `.dark` class was applied only in
  React effects). A tiny pre-render script in `index.html` now applies the
  saved color mode to `<html>` before the first paint.
- **Truncated downloads reported as success** — when the connection dropped
  mid-body, `DownloadTask` copied whatever it had and called it done: the
  truncated file stayed visible in `Downloads/VictusCloud` and the toast said
  "Download complete". `copy()` now counts bytes, each writer verifies the
  count against `Content-Length` when the server sends one, and a short body
  fails the download and deletes the partial file. `onSuccess` also reports the
  final (de-duplicated) filename instead of the pre-dedupe name.
- **Native Settings sheet leaked its window across a theme change** — picking
  Dark/Light/System (or tapping Reset) called `recreate()` while the sheet's
  `Dialog` was showing: Android logged "Activity has leaked window" and the
  sheet briefly outlived its (destroyed) context. The sheet now dismisses
  itself before the activity recreates.
- **Dead "Open test panel" Tools entry** — `testpanel.victuscloud.com` has
  returned NXDOMAIN since the `.xyz` → `.com` migration (verified by DNS), so
  the menu item loaded a native error screen. The entry now opens the
  knowledgebase; relabelled to match.
- **Stray navigation/progress timers in the web app** — overlapping
  navigations in `App.tsx` left timers from the previous run alive (bar could
  re-appear after settling), timers survived unmount, and the simulated chat
  reply in `FloatingChatBubble` could fire after unmount. Both now cancel their
  timers.

## Unreleased — verified against the live panel

**Proven live on `control.victuscloud.com`** (a 10-server real fleet, account
`icy`): `GET /api/client/account` → 200, `GET /api/client` → 200 (10 servers),
`POST …/power {"signal":"restart"|"stop"|"start"}` → 204,
`POST …/command` → 204, `GET …/resources` → 200 — driven by the app's own
network classes through `tools/panel-check` (`--mock` runs the same chain
against a local contract fixture in CI).

**Fixed: key-authenticated writes were rejected with 419 on the live panel.**
The panel applies its CSRF check to client-API POSTs even when they carry a
bearer key, so power actions and console commands from an API-key session failed
with "CSRF token mismatch." `VictusHttp.bearerWrite` now seeds its throwaway
cookie jar from `/sanctum/csrf-cookie` (the login page as fallback) and echoes
the `XSRF-TOKEN` cookie back as the header, exactly like the panel's own SPA;
`VictusAuth.apiPost` uses it. `GET` calls are unchanged.

**Panel quirks learned from the live run** (worth handling in the UI):
`GET …/resources` returns a lagging, sometimes contradictory snapshot (state
stuck on `stopping` while network counters advance; uptime keeps rising through
a restart instead of resetting), the fleet listing reports `limits` of `0` and
an empty `status` for some entries, and `connect_hostname` can be null — the
allocation `ip:port` (here `0.0.0.0` + port) is the reliable connect info.
Power actions are accepted (204) immediately regardless.

# Victus Cloud 2.4.0 (runs on any Android: custom ROMs, real servers)

This release makes the app work the same whether it is installed on a Pixel, a
GrapheneOS phone, a CalyxOS phone, a LineageOS device without Google services, or
an /e/OS or DivestOS build — and it makes the control section real.

## Custom-ROM / "universal" support

Nothing in the app needs Google Play Services, and this release makes that a
checked property rather than an accident:

- **No WebView is no longer a crash.** Some minimal AOSP builds ship none, and
  users disable it. `new WebView()` throws in that state and kills the process, so
  the engine is now checked before any of the shell is built and the app shows a
  native "install a web engine" screen with the right route for the device
  (Play Store if there is one, F-Droid otherwise — which is where Mulch WebView
  lives).
- **"Update WebView" now means *this device's* WebView.** It used to hardcode
  `com.google.android.webview`, which sent Vanadium (GrapheneOS), LineageOS
  WebView, CalyxOS Chromium and Mulch users to a listing they cannot install from.
  The provider is now queried, and when it ships *with the ROM* the app says so
  ("Vanadium is part of your ROM — update your system to update it") instead of
  pretending a store can help.
- **New: Tools → Device & compatibility.** A diagnostics screen that reports the
  actual build (ROM, Android version, device), the WebView provider and version,
  whether Google services are present (they are not needed either way), whether
  Keystore-backed encryption really works on this device (it runs a real
  seal/open self-test), the current session kind, and a one-tap connection test to
  `control.victuscloud.com` with the result and latency. The whole report copies to
the clipboard for a support ticket.
- **Package visibility declared** (`<queries>`): those lookups return nothing on
  Android 11+ without it, which would have silently produced "not installed" for
  every provider on a custom ROM.
- `RomSupport` classifies the build (GrapheneOS, CalyxOS, LineageOS, /e/OS,
  DivestOS, crDroid, PixelExperience, ArrowOS, iodéOS, AOSP, stock) and is unit
tested against the real fingerprint shapes those ROMs stamp.

## Real servers, real power actions

- **The control section now reads the account's own servers** from
  `GET /api/client` when signed in, mapped into the shape every existing screen
  already renders. A banner says which fleet is on screen — "Live from
  control.victuscloud.com" or "Sample fleet — sign in to see your own servers" — so
  sample data can never be mistaken for a real account.
- **Power actions are real**: start / stop / restart / kill go to
  `POST /api/client/servers/{uuid}/power`, and the screen reports what the panel
  answered. A refused action says why ("Server is suspended.") instead of printing
  a reassuring fake console line, which is what the old build did.
- **Live usage**: CPU, memory, disk and uptime come from
  `GET /api/client/servers/{uuid}/resources`, polled every 5 seconds while the
  server screen is open.
- **The console sends real commands** (`POST …/command`) and reports the panel's
  answer; demo mode no longer pretends a command ran.
- The native bridge gained `apiPost` for this, with the same client-API allowlist
  as `apiGet` plus a body size limit, so a page cannot turn it into a general
  proxy.

## Version

`versionCode 26` / `versionName 2.4.0`.

---

# Changelog — Victus Cloud 2.3.0 (real Victus Cloud authentication)

Sign-in is no longer simulated. The app authenticates against the real panel at
`control.victuscloud.com`, using the endpoints its own frontend uses, and keeps a
revocable API key instead of the user's password.

## The contract (verified against the live panel, not assumed)

Everything below was confirmed by probing the running panel and by reading its
client bundle, so the client is built on observed behaviour:

| Route | Behaviour |
| --- | --- |
| `GET /auth/login` | SPA shell carrying `<meta name="csrf-token">`; sets `XSRF-TOKEN` + `pterodactyl_session` (12h) |
| `POST /auth/login` | JSON `{user, password}` → `{data:{complete:true}}`, or `{data:{complete:false,confirmation_token}}` when 2FA is on |
| `POST /auth/login/checkpoint` | JSON `{confirmation_token, authentication_code}` finishes 2FA |
| `POST /auth/password` | Sends a reset link (validation errors come back in the usual envelope) |
| `POST /auth/register` | **405 — registration is disabled on this panel** |
| `GET /api/client` | 401 `AuthenticationException` without a bearer token (route exists) |
| `POST /api/client/account/api-keys` | Mints a key; the secret appears **once** as `meta.secret_token` |
| `Authorization` | `Bearer <identifier><secret>` — the identifier is prefixed to the secret |

Failures use one envelope, `{"errors":[{"code":…,"detail":…}]}`, and the app
shows the panel's own `detail` rather than inventing a message.

## What changed

- **Real authentication** (`VictusAuth.java`, `VictusHttp.java`, `VictusApi.java`,
  `SecureStore.java`): password sign-in with two-factor, sign-in with a panel API
  key, password reset, restore-on-launch and sign-out that revokes what app
  created. The password is used for exactly one request and never stored.
- **The credential never enters the WebView.** An authenticated `GET /api/client…`
  goes through the native bridge, which attaches the key itself; JavaScript only
  ever sees the account. The bridge's auth half is additionally refused unless the
  bundled app (not a dock page) is the page in the shell.
- **Encrypted at rest** (`SecureStore.java`): the session is sealed with AES-256-GCM
  under an Android Keystore key, so it is unreadable on any other device and a
  tampered payload fails to open rather than being parsed. No new dependency.
- **No fabricated sessions left.** `authService` no longer accepts any email with a
  six-character password, no longer derives the role from the email string, and no
  longer invents an access token. Demo data moved to an explicit, labelled
  `signInDemo()` path marked `provider: 'demo'` and shown as a "Demo" chip.
- **Login screen rebuilt** for the real flows: email/username + password, a
  two-factor step, an API-key alternative, "Forgot password?" that actually sends
  the reset, and account creation pointed at the billing portal (the panel has no
  sign-up). It states where the credential lives instead of implying a JWT.
- **First real panel data**: a signed-in session shows the account's server count
  from `GET /api/client`.
- **CSRF handled correctly**: the token comes from the `XSRF-TOKEN` cookie (what
  the panel's own axios client sends) because Laravel regenerates it on a
  successful login — the meta token read before signing in is already stale for
  the next request. Stale-token 419s are retried once, automatically.

## Version

`versionCode 25` / `versionName 2.3.0`.

---

# Changelog — Victus Cloud 2.2.1 (reference UX port + full audit + polish)

The reference web app's **Tools menu** and **Appearance (Settings)** experience,
ported 1:1 to native Android with zero new heavy dependencies, plus a full
bug/perf/polish sweep. Nothing removed; everything still compiles to the same
`com.victuscloud.ecosystem` package with the purple/black glass brand.

## Ported from the reference app (Task 1)

- **Glass Tools overflow menu** (new `ToolsMenu.java`): the flat grey
  `AlertDialog` is gone. The ⋮ button now opens a dark glass card (translucent
  `menu_bg` surface, hairline stroke, 22dp corners, 18dp elevation) anchored
  below the button, with a springy scale/fade entrance from the button's corner,
  ripple on every row, per-row vector icons, a light haptic on tap and a short
  fade-out on selection. All ten entries match the reference ordering —
  Settings, Open in browser, Copy link, Share link, Open test panel (Beta),
  Support, System status, Marketplace, Check for updates (dynamic
  "Update available · vX" label + accent dot when a newer build exists), and
  Clear app session in the danger color. A small brand header ("Victus Cloud ·
  vX · victuscloud.com") echoes the reference drawer's wordmark. BACK closes
  the menu first; taps outside dismiss; the card scrolls (capped at 72% of
  screen height) so all ten rows stay reachable on small phones.
- **Appearance settings rebuilt** (`SettingsSheet.java`):
  - **Live preview banner** that repaints on every change, as before.
  - **Five presets + Custom** — Purple → Black (brand default), Blue → Teal,
    and the reference app's v2.2.0 additions: Emerald → Night, Ember → Night,
    Slate → Night (swatches painted from the same accent triples as
    `src/theme/palettes.ts`). The user's brief listed only two presets; the
    reference repo wins per its own rule, so all five ship.
  - **Custom gradient builder** — start color, end color, solid toggle
    (hides the end row), 16-color palette identical to the reference sheet and
    `#RRGGBB` entry with real-time validation and live swatch preview.
  - **Background** — Aurora / Mesh / Starfield / Off, the reference app's
    backdrop options, bridged live into the bundled web app (see below).
  - **Motion & Performance** — Reduce animations switch, which now also honors
    the system "remove animations" accessibility setting.
  - **Ecosystem — Open links externally** — the reference app's toggle:
    when on, Victus Cloud links tapped inside a loaded page open in the device
    browser; the bundled home screen and the dock always stay in-app.
  - **Display mode** — Dark / Light / Follow System selector.
  - **Security** — the Android-specific "Trust Victus Cloud certificates"
    switch is kept (it has no web equivalent and fixes real device-root issues).
  - Reset / Done footer as in the reference sheet.
- **Persistence & instant application**: everything is stored in
  SharedPreferences (`victus_theme_prefs`) via the extended `ThemeManager`
  and applied with no restart — presets, custom colors, solid toggle,
  background and reduce-motion repaint the native chrome and the loaded web app
  immediately. Only **display mode** needs one seamless Activity recreate
  (the native light/dark resource sets resolve at attach time); WebView history
  and the current page are restored across it by the framework.
- **Native → web theme bridge**: `injectThemeIntoWebView()` now dispatches the
  full native config (`preset`, `customA/B`, `isCustomSolid`, `reduceMotion`,
  `colorMode`, `background`) as a `victus:theme` DOM event; the web
  `ThemeContext` listens for it, so the native Appearance sheet is the single
  source of truth while the shell is running.

## Bugs fixed (Task 2)

- **SSL error handling tightened** (`VictusWebViewClient.onReceivedSslError`):
  - Embedded **third-party resources** (CDNs, fonts, analytics) whose host has a
    bad certificate are now refused silently — previously any SSL failure on any
    host, including an embedded resource, escalated to the full-screen
    "Can't reach Victus Cloud" error screen and blocked the whole page.
  - The **"Trust Victus Cloud certificates" setting is scoped to the two
    device-side error codes** (`SSL_UNTRUSTED` error 3, `SSL_NOTYETVALID`) on
    real *.victuscloud.com hosts. It previously auto-proceeded for *every*
    SSL error code on trusted domains — including expired and
    hostname-mismatched certificates, which are never safe to accept. Those are
    now always blocked, trust setting or not.
  - No blind `handler.proceed()` remains; the accurate error-3 message
    (check date & time / update Android System WebView) and the "Update
    WebView" shortcut are unchanged.
- **Forced display mode now actually themes the native chrome.** Previously the
  sheet had no display-mode control at all; the new implementation folds the
  saved color mode into the activity's base configuration in
  `attachBaseContext()`, so `values-night` resources and EdgeToEdge system-bar
  icon contrast follow the user's Dark/Light choice even when it disagrees with
  the OS. No flicker: the decision is made before any view inflates.
- **Clear app session is now a complete wipe.** Added
  `removeSessionCookies()`, `clearSslPreferences()`, `clearMatches()` and
  `clearHistory()`, and the page reloads to a fresh bundled Home instead of
  re-showing the pre-wipe page. Confirmation copy now states explicitly that
  only local device data is cleared — **nothing server-side is touched**.
- **MediaStore duplicate-name detection** (`DownloadTask`): the dedupe query
  compared `RELATIVE_PATH` including its canonical trailing `/`, which some
  OEM MediaStore implementations store without it — the query silently never
  matched and duplicate suffixing was left to the platform. It now matches on
  display name (same collection only holds our subdirectory), so
  "file (1).ext" dedupe works on every OEM.
- **Share-link crash guard**: `ACTION_SEND` chooser launches are now wrapped,
  so a device with no share target shows a toast instead of an
  `ActivityNotFoundException`. Copy-link guards against a null clipboard
  service. Open-in-browser already had a guard and is unchanged.
- **Pull-to-refresh cannot double-fire**: the gesture is disabled while a page
  loads and re-enabled only for Victus Cloud / bundled pages
  (`isRefreshableUrl`), so external sites keep their own gesture space and
  nothing re-POSTs a form behind the user's back.
- **Updater stays graceful**: background checks already swallow offline/rate-
  limit errors and keep the last known state; the manual check surfaces errors
  in the sheet. Verified unchanged and still passing all 16 unit tests.

## Fixed — "Web View" opens the live portals again

Every "Web View" tab was dead in a shipped APK. `EcosystemFrame` framed
`/api/proxy?url=…`, which only ever existed as a Vite **dev-server** middleware
(`vite.config.ts` → `configureServer`), so inside the APK the frame resolved to
an asset that does not exist; and the portals could never have been framed
anyway — `control.victuscloud.com` answers `x-frame-options: DENY`, while
`billing` / `drive` / `victuscloud.com` answer `SAMEORIGIN` plus
`frame-ancestors 'self'`.

- **`InAppBrowser.java` (new)** — a real in-app browser surface: a second Victus
  WebView layered over the bundle with its own header (close, title, URL, reload,
  open-in-browser), brand-tinted progress bar, and an inline error panel that
  covers the failed page rather than pushing the header around. It shares the
  shell's cookie jar, so signing in there signs in everywhere, and it reuses the
  shell's download listener. Closing it restores the bundle with all React state
  intact — nothing reloads. System back walks the surface's own history first,
  then closes it.
- **`window.VictusNative` bridge (new)** — `openWebView(url, title)` and
  `openBrowser(url)`, the bundled app's only native capability.
  `addJavascriptInterface` is per-WebView rather than per-origin, so the target is
  filtered by `InAppLinks`: https only, `*.victuscloud.com` only for the in-app
  surface, no embedded credentials, non-http schemes refused, and `http://`
  upgraded to https instead of failing. Calls are dispatched to the UI thread and
  dropped while the activity is finishing.
- **`VictusPageHost` (new interface)** — `VictusWebViewClient` now talks to a page
  host instead of to `MainActivity`, so the browser surface and the shell share
  exactly one routing/TLS policy and the SSL decision matrix is not duplicated.
  Inside the browser, internal Victus links stay in the surface; everything else
  still goes to the system browser.
- **`WebViewSetup.java` (new)** — one place for the WebSettings both surfaces use
  (scripts + DOM storage, no file or content access, mixed content refused, the
  `"; wv"` UA token dropped, algorithmic darkening).
- **Deliberately narrower, on purpose** — the browser panel offers no "proceed
  anyway" on a certificate failure; the honest escape hatch is the device browser,
  which shows its own certificate warning.
- **Legacy `http://` portal links fixed** — ten hard-coded `http://…victuscloud.com`
  URLs (Tools menu, Control dashboard, service screen, profile modal,
  `EcosystemFrame`) became `https://`. This is also what makes the new path work:
  the app refuses cleartext, so those URLs could only ever have failed.
- **Verified without a device** — 41 web tests (including a new APK regression
  asserting the shipped bundle contains no `/api/proxy` and that the DEX really
  carries the bridge and `InAppBrowser`), 26 JVM tests (10 new for the URL policy),
  and 20/20 headless WebView checks that drive the "Web View" button through a
  stubbed bridge. Each live target was then loaded in a mobile-UA Chromium:
  control, billing, drive (`/login`), website, `/support` and `/status` all answer
  200 with real rendered content.

## Optimized / polish (Task 3)

- **Pull-to-refresh** on the WebView column (new one-class dependency,
  `androidx.swiperefreshlayout:1.1.0`, ~30KB) tinted with the live theme.
- **Haptics** on dock-chip switches and menu rows (`HapticFeedbackConstants`,
  guarded by API level and try/catch — feedback can never crash).
- **Reduce-motion is now respected everywhere**: the in-app switch ORs with the
  system `ANIMATOR_DURATION_SCALE=0` accessibility setting (mirroring the web
  app's `prefers-reduced-motion` support), and the menu entrance, dock pulse,
  error-overlay fades and sheet animations all collapse to zero-duration when
  it is on.
- **48dp touch targets** verified for every control, including the new display
  mode selector (previously 44dp).
- **Startup path untouched and lean**: the WebView is created and configured on
  the main thread as before (that work is unavoidable there), the update check
  still runs on a background executor after first frame, and no new work was
  added to `onCreate` beyond one SharedPreferences read.
- **Dead code / strings**: removed unused string resources added during
  development; kept the resource set minimal (the release build already runs
  `minifyEnabled` + `shrinkResources`).

## Supabase-related, not touched

There is **no Supabase code, configuration, URL, key or client left anywhere in
this repository** (the web app's auth is a localStorage mock in
`src/services/authService.ts`). Nothing Supabase-related existed to change, and
nothing was changed: no URLs, keys, tables, schemas, RLS policies, auth flow,
edge functions, storage buckets, realtime or API calls. "Clear app session"
clears only the Android WebView's local cookies/storage/cache on the device.

## Decisions made without asking (noted per instructions)

- Ported all **five** presets and the **background options** from the current
  reference repo, not just the two named in the brief ("repo wins").
- The glass menu is built with `PopupWindow` + plain views (no blur API) —
  true blur is a heavyweight per-frame effect on mobile GPUs; the translucent
  surface over the dimmed window reads identically at a fraction of the cost.
- Background animation itself (canvas aurora/starfield) lives in the bundled
  web app as before; the native sheet's Background section drives it through
  the bridge. Native chrome has no canvas backdrop, so the option only affects
  the bundled UI — same as the reference app, where the backdrop is also a web
  layer.
- "Open links externally" applies to Victus Cloud pages loaded from a previous
  in-app navigation, matching the reference app's semantics; the bundled home
  screen and the top-bar dock always stay in-app so the shell can never
  strand the user outside it.

---

# Changelog — Victus Cloud 2.1.1 (bug sweep + performance pass)

A follow-up audit of the whole app: one real navigation-state bug, a
device-clock/stale-WebView-friendly certificate error screen, one battery/CPU
fix, and one scroll-performance fix. No new dependencies, no size increase.

## Fixes

- **WebView now actually pauses in the background.** `MainActivity` never
  called `WebView#onPause()`/`#onResume()`, so JavaScript timers, animations
  and any playing media in the loaded page kept running — and draining
  battery/CPU — the whole time the app was backgrounded, until Android's own
  (slower, less thorough) app-standby throttling eventually kicked in. Now
  wired into `onPause()`/`onResume()`.
- **Dock-chip restyle on every navigation, even when nothing changed.**
  `onPageLoadStarted`/`onPageLoadFinished` fire on every redirect and in-page
  navigation, and previously each one re-allocated a `GradientDrawable` and
  re-invalidated the view for **all 7** dock chips — even when the active tab
  hadn't changed at all. It now only touches the (at most two) chips whose
  selected state actually flips, eliminating that work entirely for the very
  common "still on the same tab" case.
- **`home.html` scroll jank from stacked `backdrop-filter`.** The hero panel
  and all 6 core-panel cards each ran their own live `backdrop-filter: blur()`
  — one of the most GPU-expensive CSS effects, and each one has to be
  recomputed as the page scrolls under the fixed background grid. Removed it
  from the 6 repeated cards (kept only on the single hero panel); the glass
  look is unchanged since the panel's translucent gradient already carries it.
- **Fixed a real substring bug in tab detection.** `indexForUrl()` matched the
  bundled-assets origin with `ASSETS_ORIGIN.contains(host)` instead of an
  exact host comparison — vacuously true whenever `host` was empty, and in
  principle a false match for any real domain that happens to be a substring
  of the assets origin string. Now compares the host exactly.
- **Certificate-error screen** (`SslError.SSL_UNTRUSTED`, the "certificate
  error 3" report): the connection is still always cancelled — proceeding
  anyway would be a real security hole and a Play Store policy violation —
  but the message is now specific per SSL error code, with an in-app "Update
  WebView" shortcut to the Play Store for the two codes (`UNTRUSTED` /
  `NOT_YET_VALID`) usually caused by a stale WebView component or a wrong
  device clock rather than an actual attack.
- Removed dead code found during the audit: an unused `Theme.Victus.Dialog.Sheet`
  style, an unused `switch_track_off` color, and the now-superseded generic
  `error_ssl` string.

---

# Changelog — Victus Cloud 2.1.0 (theming + settings pass)

Native chrome + `home.html` both restyled around a new **Purple → Black** brand
identity, plus a real **Settings** screen (Tools menu → **Settings**) for
personalizing it — no extra libraries, no measurable resource cost.

## Appearance & Settings

- **New default look: Purple → Black.** Every accent surface — the selected
  dock chip, primary buttons, the progress bar, the error screen's glyph and
  retry button, the launcher icon and splash screen — now uses a purple → deep
  violet → near-black gradient instead of the old blue/teal brand.
- **Settings sheet** — tap the ⋮ menu → **Settings** for a slide-up sheet with:
  - **Theme presets**: *Purple → Black* (new default), *Blue → Teal* (the
    original brand, kept as an option), and *Custom*.
  - **Custom theme**: pick any two colors (a start/end gradient) or flip
    "Solid color" for a single flat accent, from a curated swatch palette or a
    free `#RRGGBB` hex field with a live preview.
  - **Reduce animations** switch — turns off the dock-chip pulse and other
    incidental motion for a lighter feel on any device.
  - A live gradient preview and one-tap **Reset to default**.
- Every change is written straight to a tiny `SharedPreferences`-backed
  `ThemeManager` and applied immediately — native views restyle in place and
  `home.html`'s CSS variables are updated via a one-line injected script — so
  switching themes never recreates the Activity or reloads the WebView.
- `ThemeManager` + the settings sheet (`SettingsSheet`) are built entirely from
  plain Android views (no Material Components / Jetpack Compose dependency
  added), keeping the APK size and runtime footprint essentially unchanged.

## Visual polish

- Dock chips, the Tools list buttons, and settings-sheet controls all gained
  proper ripple feedback; the top bar now casts a subtle elevation shadow.
- The error screen is now a centered, rounded, bordered card instead of
  full-bleed text.
- `home.html` gained subtle glassmorphism (`backdrop-filter: blur(...)`) on
  the hero panel and cards, deeper shadows, and a `prefers-reduced-motion`-style
  `reduce-motion` class driven by the new Settings toggle.
- Launcher icon, adaptive icon, monochrome icon and splash screen regenerated
  (`tools/generate_icons.py`) with the new Purple → Black gradient.

---

# Changelog — Victus Cloud 2.0.0 (rebuild)

Rebuilt from the legacy `VictusCloud (2).apk` + notes (see `/Legacy`). Core purpose
is unchanged — same package (`com.victuscloud.ecosystem`), same single-Activity
WebView shell, same seven dock routes (Home, Website, Billing, Control, Drive,
Support, Status), same Tools menu and session-clear behavior. This release is a
polish / performance / compatibility pass.

## 1. UI / visual pass

- **Dock/tab bar bug fixed** — the row that clipped "Control" into "ontro" is now a
  properly measured `HorizontalScrollView` of wrap-content chips. Labels can never
  truncate at any width or density, and the active chip auto-scrolls into view.
- **Dark + light system themes** — the app no longer forces dark. Native chrome
  (top bar, dock, dialogs, error screen) follows the OS theme via
  `values`/`values-night` resources, and `home.html` declares
  `color-scheme: light dark` with a full light palette next to the original dark one.
- **Modernized visual system** — consistent spacing scale (`--space-1…10`) and
  corner-radius scale (`--r-sm…xl`) in CSS; native side uses matching dp steps.
- **Edge-to-edge done properly** — transparent status/navigation bars,
  `WindowInsets`-driven padding for the top bar and dock (incl. display cutout and
  IME), so nothing collides with the gesture bar on any device. Required for
  Android 15's enforced edge-to-edge.
- **Android 12+ splash screen API** — `Theme.SplashScreen` with a branded animated
  icon and theme-aware background (backported to minSdk via core-splashscreen).
- **Predictive back gesture** — `OnBackPressedDispatcher` +
  `enableOnBackInvokedCallback`; back still walks WebView history, then returns to
  the Home tab, then exits.
- New launcher icon set: adaptive icon (v26+) with adaptive bg + brand gradient
  foreground, proper monochrome layer for themed icons, round variants, and a
  splash logo — all density buckets, generated by `tools/generate_icons.py`.

## 2. Universal DPI support

- **Zero raw pixels** — every native size goes through a `dp()` helper; every font
  size uses SP (`TextView#setTextSize` defaults). Top bar/dock/overlay/buttons are
  all dp/sp.
- **All touch targets ≥ 48dp** at every density (dock chips, top-bar buttons 48dp,
  overlay buttons, `home.html` links/cards use a `--tap: 3rem` token).
- **home.html converted to relative units** — layout-critical px values became
  `rem` / `%` / `clamp()` / `min()`; cards use
  `minmax(min(15rem,100%),1fr)` so they reflow instead of overflowing.
- **Form factors** — `configChanges` handles rotation/fold without reloading the
  WebView; small phones get a compact layout via a `30rem` media query; tablets get
  a max-width, multi-column grid. `home.html` respects `env(safe-area-inset-*)`.
- Icons and splash rendered at mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi.

## 3. Universal refresh-rate support

- **Highest available refresh rate requested** — at startup the activity picks the
  fastest `Display.Mode` matching the current resolution and sets
  `WindowManager.LayoutParams.preferredDisplayModeId` (API 23+), unlocking
  90/120/144 Hz panels instead of the 60 Hz cap.
- **Animator-driven transitions only** — dock selection pulse, progress bar and
  error-overlay fades use `ViewPropertyAnimator`/the choreographer; no sleeps, no
  fixed-duration frame hacks that assume 60 Hz.
- **Hardware acceleration** on for the app and explicitly prioritized WebView
  renderer (`setRendererPriorityPolicy` on API 26+).
- **No main-thread I/O** — downloads run on a background executor; session
  clearing is in-memory only; WebView init does no network work.
- **Instant Home** — `home.html` is served from bundled assets via
  `WebViewAssetLoader` (https origin, no file://) with default caching, and tapping
  the already-active tab no longer triggers a reload.

## 4. Modernization

- **compileSdk/targetSdk 35** (Android 15), **minSdk 23**, AGP 8.7.3 / Gradle 8.11,
  Java 17. `versionCode 20`, `versionName 2.0.0`.
- **Deprecated WebView APIs removed** — no `setAppCacheEnabled`, `setPluginState`,
  `setSavePassword`, `setAllowFileAccessFromFileURLs`,
  `setAllowUniversalAccessFromFileURLs`, no old `shouldOverrideUrlLoading`/
  `onReceivedError` overloads; replaced by `WebViewAssetLoader`,
  `WebSettingsCompat` (algorithmic darkening / force-dark auto) and the modern
  callback signatures. Mixed content is blocked (`MIXED_CONTENT_NEVER_ALLOW`).
- **Scoped-storage downloads** — API 29+ writes via `MediaStore.Downloads` into
  `Downloads/VictusCloud` with `IS_PENDING` (no storage permission, no partial
  files visible); API 23–28 keeps the legacy path with a just-in-time
  WRITE_EXTERNAL_STORAGE request. Old `setDestinationInExternalPublicDir`
  deprecation is gone.
- **Uploads via `onShowFileChooser`** with the Activity Result API document
  picker — URI grants, zero permissions.
- **Security hardening** — cleartext traffic disabled; SSL errors are always
  cancelled (never "proceed anyway"); external/intent:// links are resolved
  defensively with Play-Store and browser fallbacks; WebRTC mic/camera only when
  runtime permissions are already granted; geolocation declined.
- **Code health** — the original single-file tangled shell is split into
  `MainActivity` / `VictusWebViewClient` / `VictusChromeClient` / `DownloadTask`
  with sectioned Javadoc; no synthetic-lambda clutter; manifest declares deep
  links for `*.victuscloud.com`.
- **Build pipeline** — deterministic GitHub Actions workflow
  (`.github/workflows/build-debug-apk.yml`) producing `VictusCloud-debug.apk` as
  an artifact on every push + `workflow_dispatch`, and as a release asset on tags.
  Because no local Gradle project survived, the whole project (wrapper included)
  was reconstructed from scratch.

## Kept intentionally

- Legacy `Legacy/` folder (old APK + notes) — archived reference, not part of the build.
- Original content/routes/copy of `home.html` and the Tools-menu feature set.

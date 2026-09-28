# Victus Cloud — Web App (React)

Unified web application and mobile ecosystem shell for **Victus Cloud** (`com.victuscloud.ecosystem`), rewritten in React + TypeScript with Tailwind CSS from the original Android WebView shell.

## 🚀 Features

- **Ecosystem Shell & Navigation**:
  - Horizontal scrollable dock bar that never clips or truncates labels at any resolution (`Home`, `Website`, `Billing`, `Control`, `Drive`, `Support`, `Status`).
  - Native Top Bar with Back navigation (history tracking), title, active route, instant Dark/Light mode toggle, Refresh button, Tools menu, and animated progress bar.
- **Home Dashboard**:
  - Faithfully recreates the original Victus Cloud home screen with dark glassmorphism aesthetic, brand logo, hero panel, status strip, Core panels grid, and Quick actions.
- **Interactive Ecosystem Services**:
  - **Control Panel**: Live server metrics (CPU, RAM, Disk), status indicator, power actions (Start, Restart, Stop), and interactive server terminal console.
  - **Billing Panel**: Paymenter integration overview, account credits balance, and active cloud subscriptions.
  - **Victus Drive**: Cloud storage explorer with file upload (browser document picker) and file download simulation (to `Downloads/VictusCloud`).
  - **Support Hub**: Active support tickets and Discord community links.
  - **System Status**: Global cluster status, ping times, and node health.
  - **Live Web / Iframe Mode**: Toggle between native interactive panel view and live iframe embed with fallback error handling.
- **Appearance & Theme Customization (Settings)**:
  - Live preview banner that reflects changes instantly.
  - Preset options: **Purple → Black** (brand identity) and **Blue → Teal** (classic legacy gradient).
  - Custom gradient builder: start color, end color, and solid color toggle.
  - 16-color curated palette plus hex color input (`#RRGGBB`) with real-time validation.
  - **Motion & Performance**: Reduce animations switch for smooth rendering on any device.
  - **Display Modes**: Dark, Light, or Follow System.
- **Tools Overflow Menu**:
  - Settings (Appearance)
  - Open in external browser
  - Copy link (with toast feedback)
  - Share link (Web Share API)
  - Open test panel (Beta)
  - Support & System Status
  - Marketplace
  - Check for updates (in-app updater)
  - Clear app session (with confirmation modal)
- **Native Error Overlay**:
  - "Can't reach Victus Cloud" overlay with retry, return home, and error diagnostics.

## 🛠️ Development & Build

```bash
# Start development server
bun run dev

# Build production bundle
bun run build

# Build the debug APK (bundles the React build into the APK assets)
./gradlew assembleDebug

# Updater logic tests + web tests
./gradlew :app:testDebugUnitTest
bun test
```

## 🔑 Release signing

Every APK must carry the **same** signature, or Android refuses to install it
over the installed copy (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) and the in-app
updater's same-signer check rejects it.

`app/build.gradle` reads signing credentials from the environment (CI) or from
`keystore.properties` (local). When neither is present the build still succeeds
on the standard debug key, so forks and pull requests keep working.

Generate the keystore once, then keep both the keystore and its password safe —
**losing them means no future build can update an installed app**:

```bash
keytool -genkeypair -v -keystore release.keystore -alias victus-release \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass '<password>' -keypass '<password>' \
  -dname "CN=Victus Cloud, O=Victus Cloud, C=SG"
```

Local builds pick it up from the git-ignored `keystore.properties`:

```properties
storeFile=release.keystore
storePassword=…
keyAlias=victus-release
keyPassword=…
```

For CI, add these repository secrets so every tagged build is signed with that
same key (and therefore installs over the previous release):

| Secret | Value |
| --- | --- |
| `VICTUS_KEYSTORE_BASE64` | `base64 -w0 release.keystore` |
| `VICTUS_STORE_PASSWORD` | keystore password |
| `VICTUS_KEY_ALIAS` | `victus-release` |
| `VICTUS_KEY_PASSWORD` | key password |

Until those secrets exist, the workflow builds and tests but deliberately does
**not** publish a release, because a runner-debug-signed APK cannot upgrade an
existing install.

Verify any build's signer with:

```bash
apksigner verify --print-certs app/build/outputs/apk/debug/app-debug.apk
```

## ⬆️ In-app updates (Android)

**Tools → Check for updates** checks an update source, downloads the new APK,
verifies it, and installs it through whichever privileged route the device has:

| Method | Requirement | What the user sees |
| --- | --- | --- |
| **Shizuku** | Shizuku running (ADB or root) + access granted | Nothing — `pm install` runs as the shell identity |
| **Root** | `su` grants root | Nothing — `pm install` runs as root |
| **Installer** | “Install unknown apps” allowed for the app | The stock Android package installer screen |

Before installing, the downloaded APK must (a) come from an `https` URL,
(b) match the manifest’s `sha256` when one is published, and (c) be signed with
the **same certificate as the installed app** — a build signed with a different
key is refused.

### Update source

The default source is the repository’s latest GitHub release
(`…/releases/latest`), and it can be changed per device from the update sheet.
Two payload shapes are understood:

```json
{
  "versionCode": 23,
  "versionName": "2.1.2",
  "apkUrl": "https://example.com/victus-2.1.2.apk",
  "sha256": "…64 hex chars…",
  "sizeBytes": 4058507,
  "changelog": "What changed…"
}
```

…or the GitHub releases API response, which the workflow below produces. Publish
a release with a version tag and the APK is attached automatically (once the
signing secrets above are configured):

```bash
# Bumps the version in app/build.gradle first, then:
git tag v2.1.2 && git push origin v2.1.2   # → GitHub Release + APK asset
```

The updater compares `versionCode` when the source provides one, and otherwise
falls back to comparing version names (`v2.1.2` → `2.1.2`).

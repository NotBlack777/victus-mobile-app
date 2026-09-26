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
  - Clear app session (with confirmation modal)
- **Native Error Overlay**:
  - "Can't reach Victus Cloud" overlay with retry, return home, and error diagnostics.

## 🛠️ Development & Build

```bash
# Start development server
npm run dev

# Build production bundle
npm run build
```

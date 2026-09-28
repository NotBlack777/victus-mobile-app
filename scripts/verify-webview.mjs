/**
 * verify-webview.mjs
 *
 * Headless-Chromium regression check for the WebView shell. It reproduces what
 * MainActivity does at runtime — WebViewAssetLoader's AssetsPathHandler mapping
 * "https://appassets.androidplatform.net/<path>" verbatim into the APK assets —
 * then drives the bundled React app the way a finger would: cold launch,
 * service-worker guard, demo sign-in, control dashboard, per-server power
 * action, theme presets, background modes, and reset.
 *
 * Usage (needs playwright + chromium available to Node):
 *
 *   node scripts/verify-webview.mjs app/build/generated/reactAssets
 *
 * The Android build stages the exact APK assets into
 * app/build/generated/reactAssets, so checking that directory is equivalent to
 * checking the APK without needing a device.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ASSETS_ROOT = process.argv[2];
if (!ASSETS_ROOT || !fs.existsSync(ASSETS_ROOT)) {
  console.error('Usage: node scripts/verify-webview.mjs <staged-assets-dir>');
  console.error('       (build first: ./gradlew assembleDebug)');
  process.exit(2);
}

const ORIGIN = 'https://appassets.androidplatform.net';
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.6,
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'allow',
});
const page = await context.newPage();

const consoleErrors = [];
const failedRequests = [];
const responses = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => responses.push({ url: r.url(), status: r.status() }));

// Mirror WebViewAssetLoader's AssetsPathHandler registered at "/": the URL path
// is looked up verbatim under the staged assets root.
await page.route(`${ORIGIN}/**`, async (route) => {
  const url = new URL(route.request().url());
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (rel === '') rel = 'index.html';
  const file = path.join(ASSETS_ROOT, rel);
  if (!file.startsWith(ASSETS_ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return route.fulfill({ status: 404, contentType: 'text/plain', body: `Not found: ${rel}` });
  }
  await route.fulfill({ path: file, contentType: MIME[path.extname(file)] ?? 'application/octet-stream' });
});

// 1. Cold launch, exactly like MainActivity.loadUrlInternal(HOME_URL).
await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'load' });
await page.waitForSelector('text=Sign in to Victus Cloud', { timeout: 20000 });
check('loads /index.html from the APK assets and boots the React app', true);

const js = responses.find((r) => r.url.endsWith('.js') && r.url.includes('/assets/'));
const css = responses.find((r) => r.url.endsWith('.css') && r.url.includes('/assets/'));
check('hashed JS + CSS bundles served 200 through the asset mapping',
  js?.status === 200 && css?.status === 200,
  `${js?.url.split('/').pop()} ${js?.status}, ${css?.url.split('/').pop()} ${css?.status}`);

// 2. Background layer is present on the login screen in its default mode.
const backdrop = await page.evaluate(() => ({
  layer: !!document.querySelector('.bgfx'),
  blobs: document.querySelectorAll('.bgfx-blob').length,
  static: document.querySelector('.bgfx')?.classList.contains('bgfx-static') ?? null,
}));
check('aurora backdrop active by default with three drifting fields',
  backdrop.layer && backdrop.blobs === 3 && backdrop.static === false,
  `blobs=${backdrop.blobs}`);

// 3. Authenticate with the bundled demo account -> the real app shell must mount.
await page.getByRole('button', { name: /Continue with Demo Account/ }).click();
await page.waitForSelector('.app-shell', { timeout: 20000 });
await page.waitForSelector('text=Victus Cloud Ecosystem', { timeout: 20000 });
check('authenticated shell mounts after demo sign-in', true);

// 4. Node Infrastructure panel on the control dashboard.
await page.getByRole('button', { name: 'Control Panel', exact: true }).click();
await page.waitForSelector('text=FLEET OVERVIEW', { timeout: 20000 });
await page.getByRole('heading', { name: 'Node Infrastructure' }).waitFor({ timeout: 10000 });
const nodes = await page.evaluate(() => {
  const section = [...document.querySelectorAll('section')].find((s) =>
    s.textContent.includes('Node Infrastructure'));
  const rows = section ? [...section.querySelectorAll('h3')].map((h) => h.textContent.trim()) : [];
  return { rows, footer: section?.textContent.includes('Aggregated live from your') ?? false };
});
check('node infrastructure lists the real nodes from the fleet',
  nodes.rows.length >= 4 && nodes.rows.includes('SG-1') && nodes.rows.includes('Frankfurt-KVM'),
  `nodes=[${nodes.rows.join(',')}]`);
check('node panel states its data source honestly', nodes.footer);

// 5. Theme presets via the Appearance sheet.
await page.evaluate(() => {
  document.querySelector('[aria-label="Open navigation drawer"]')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.getByRole('button', { name: 'Theme & Appearance' }).click();
await page.waitForSelector('text=Live preview', { timeout: 10000 });

const setPreset = async (label, cssVar, expected) => {
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.waitForFunction(
    ([v, want]) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() === want,
    [cssVar, expected],
    { timeout: 8000 }
  );
  check(`${label} applies its palette`, true, `${cssVar}=${expected}`);
};

await setPreset('Emerald → Night', '--bg', '#04120d');
await setPreset('Ember → Night', '--bg', '#170a03');
await setPreset('Slate → Night', '--bg', '#0b0e13');
await setPreset('Purple → Black', '--bg', '#0a0a0f');

// 6. Background switcher: each mode paints its layer, Off removes it.
// (The buttons carry a hint line, so match on the leading label.)
await page.getByRole('button', { name: /^Mesh/ }).click();
await page.waitForSelector('.bgfx-mesh', { timeout: 8000 });
check('Mesh backdrop mounts its grid + glow layers', true);

await page.getByRole('button', { name: /^Starfield/ }).click();
await page.waitForSelector('.bgfx-canvas', { timeout: 8000 });
const starfield = await page.evaluate(() => {
  const canvas = document.querySelector('.bgfx-canvas');
  return { mounted: !!canvas, w: canvas?.width > 0, h: canvas?.height > 0 };
});
check('Starfield canvas mounts with a raster backing store', starfield.mounted && starfield.w && starfield.h);

await page.getByRole('button', { name: /^Off/ }).click();
await page.waitForFunction(() => !document.querySelector('.bgfx'), { timeout: 8000 });
check('Off removes the backdrop from the DOM entirely', true);

// 7. Per-server control screen still works end to end.
await page.getByRole('button', { name: 'Done', exact: true }).click();
await page.getByRole('button', { name: 'Home', exact: true }).click();
await page.getByRole('button', { name: 'Control Panel', exact: true }).click();
await page.getByText('VictusMc Survival', { exact: true }).click();
await page.waitForSelector('text=Back to Fleet Overview', { timeout: 20000 });
await page.getByRole('button', { name: /Restart/i }).click();
await page.waitForSelector('text=Container victus-srv-9a4b12c1 rebooted cleanly.', { timeout: 20000 });
check('per-server control screen + power action work', true);

// 8. Leave the session in the stock look.
await page.evaluate(() => {
  document.querySelector('[aria-label="Open navigation drawer"]')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.getByRole('button', { name: 'Theme & Appearance' }).click();
await page.getByRole('button', { name: /^Aurora/ }).click();
await page.waitForSelector('.bgfx-blob', { timeout: 8000 });
await page.getByRole('button', { name: 'Reset to default' }).click();
const reset = await page.evaluate(() => ({
  bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
  blobs: document.querySelectorAll('.bgfx-blob').length,
}));
check('reset restores the Purple → Black + aurora defaults', reset.bg === '#0a0a0f' && reset.blobs === 3);

check('no uncaught page errors across the whole flow', consoleErrors.length === 0,
  consoleErrors.slice(0, 2).join(' | '));
check('no failed asset requests', failedRequests.length === 0,
  failedRequests.slice(0, 2).join(' | '));

await page.screenshot({ path: 'app/build/verify-webview.png' });
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
process.exit(failed.length === 0 ? 0 : 1);

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

// Stand in for the Android shell's bridge (MainActivity.WebAppBridge exposes
// window.VictusNative) so the bundled app's "Web View" action can be driven and
// observed here. window.open is stubbed too, to check the no-bridge fallback.
await page.addInitScript(() => {
  window.__victusBridgeCalls = [];
  window.__victusOpenCalls = [];
  window.__victusShellCalls = [];
  window.VictusNative = {
    openWebView: (url, title) => {
      window.__victusBridgeCalls.push({ url, title });
    },
    openBrowser: (url) => {
      window.__victusOpenCalls.push(String(url));
    },
    // The shell half of the bridge (4.5.0+). The admin list is empty by default,
    // which is exactly what a demo / non-admin account must be answered with.
    shellUiState: () => JSON.stringify({
      updateAvailable: false,
      updateVersion: '',
      currentUrl: 'https://control.victuscloud.com',
      canGoBack: true,
      reduceMotion: false,
      adminAreas: window.__victusAdminAreas || [],
    }),
    shellAdminAreas: () => JSON.stringify(window.__victusAdminAreas || []),
    shellBack: () => { window.__victusShellCalls.push('back'); },
    shellRefresh: () => { window.__victusShellCalls.push('refresh'); },
    shellNavigate: (url) => { window.__victusShellCalls.push(`navigate:${url}`); },
    shellOpenNativeMenu: (which) => { window.__victusShellCalls.push(`menu:${which}`); },
    shellClearSession: () => { window.__victusShellCalls.push('clear'); },
    shellOpenExternal: () => { window.__victusShellCalls.push('external'); },
    authTotpState: () => JSON.stringify({
      secondsRemaining: 21, millisUntilNext: 21456, periodSeconds: 30,
      synced: true, offsetMillis: 0,
    }),
    // The auth half. Without these the app correctly concludes there is no
    // panel session and stays on the login screen, which is the production
    // behaviour — so they are stubbed here to reach the signed-in shell.
    // Sign-in is driven through the app's own form, not by writing localStorage,
    // so the panel round-trip is exercised too.
    authSignIn: (user, _pass, cb) => {
      window.__victusSignedIn = user;
      window.__victusBridgeResolve(cb, {
        ok: true, state: 'signed_in',
        session: {
          kind: 'api_key', userId: 'verify', username: user, email: user,
          name: 'Verify', rootAdmin: false, twoFactorEnabled: false,
          createdAt: 0, expiresAt: 0, keyMasked: '…aaaa',
        },
      });
    },
    authRestore: (cb) => {
      if (!window.__victusSignedIn) {
        window.__victusBridgeResolve(cb, { ok: false, state: 'error', message: 'signed out' });
        return;
      }
      window.__victusBridgeResolve(cb, {
        ok: true, state: 'signed_in',
        session: {
          kind: 'api_key', userId: 'verify', username: window.__victusSignedIn,
          email: window.__victusSignedIn, name: 'Verify', rootAdmin: false,
          twoFactorEnabled: false, createdAt: 0, expiresAt: 0, keyMasked: '…aaaa',
        },
      });
    },
    authSignOut: (_revoke, cb) => {
      window.__victusSignedIn = null;
      window.__victusBridgeResolve(cb, { ok: true, state: 'signed_out' });
    },
    // A real panel fleet. The sample fleet was removed in 4.6.3, so every check
    // that used to read fabricated servers now reads the account's own.
    apiGet: (path, cb) => {
      if (path === '/api/client') {
        window.__victusBridgeResolve(cb, {
          ok: true, state: 'ok', status: 200,
          body: JSON.stringify({ data: __victusFleet() }),
        });
        return;
      }
      window.__victusBridgeResolve(cb, {
        ok: true, state: 'ok', status: 200,
        body: JSON.stringify({ attributes: {
          current_state: 'running',
          resources: { cpu_absolute: 12.5, memory_bytes: 2147483648,
                       disk_bytes: 10737418240, uptime: 11520000 },
        } }),
      });
    },
    apiPost: (_path, _body, cb) => window.__victusBridgeResolve(cb, {
      ok: true, state: 'ok', status: 204, body: '',
    }),
  };
  window.__victusFleet = () => ([
    { object: 'server', attributes: {
        identifier: '9a4b12c1', uuid: '9a4b12c1-3a1b-4cd3-84f9-71b8cd961001',
        name: 'Survival SMP', node: 'SG-1', status: 'running',
        is_suspended: false, is_installing: false,
        limits: { memory: 8192, disk: 50000, cpu: 400 },
        relationships: { allocations: { data: [
          { attributes: { ip: '203.0.113.10', port: 25565, is_default: true } } ] } },
      } },
    { object: 'server', attributes: {
        identifier: '7be2d410', uuid: '7be2d410-1111-4a2b-8c3d-222233334444',
        name: 'Frankfurt KVM', node: 'Frankfurt-KVM', status: 'offline',
        is_suspended: false, is_installing: false,
        limits: { memory: 2048, disk: 20000, cpu: 200 },
        relationships: { allocations: { data: [
          { attributes: { ip: '198.51.100.5', port: 25566, is_default: true } } ] } },
      } },
    { object: 'server', attributes: {
        identifier: 'c0ffee01', uuid: 'c0ffee01-5555-4c6d-9e8f-333344445555',
        name: 'Discord Bot', node: 'SG-1', status: 'running',
        is_suspended: false, is_installing: false,
        limits: { memory: 1024, disk: 10000, cpu: 100 },
        relationships: { allocations: { data: [
          { attributes: { ip: '203.0.113.11', port: 25567, is_default: true } } ] } },
      } },
    { object: 'server', attributes: {
        identifier: 'deadbeef', uuid: 'deadbeef-7777-4d8e-8f9a-444455556666',
        name: 'Archive Node', node: 'Amsterdam-1', status: 'running',
        is_suspended: false, is_installing: false,
        limits: { memory: 512, disk: 5000, cpu: 50 },
        relationships: { allocations: { data: [
          { attributes: { ip: '198.51.100.9', port: 25570, is_default: true } } ] } },
      } },
  ]);
  window.__victusBridgeResolve = (cb, payload) => {
    const id = Number(cb);
    setTimeout(() => {
      window.__victusBridge && window.__victusBridge.resolve(id, JSON.stringify(payload));
    }, 0);
  };
  window.open = (url) => {
    window.__victusOpenCalls.push(String(url));
    return null;
  };
});

// Mirror WebViewAssetLoader's AssetsPathHandler registered at "/": the URL path
// is looked up verbatim under the staged assets root.
async function serveAssets(target) {
  await target.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (rel === '') rel = 'index.html';
    const file = path.join(ASSETS_ROOT, rel);
    if (!file.startsWith(ASSETS_ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return route.fulfill({ status: 404, contentType: 'text/plain', body: `Not found: ${rel}` });
    }
    await route.fulfill({ path: file, contentType: MIME[path.extname(file)] ?? 'application/octet-stream' });
  });
}

await serveAssets(page);

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

// 2b. The sign-in screen asks the panel for real credentials, offers the API-key
// path, and states plainly that the demo path is not the account.
const loginScreen = await page.evaluate(() => {
  const text = document.body.textContent || '';
  return {
    asksForIdentifier: text.includes('Email or Username'),
    asksForPassword: text.includes('Password'),
    offersApiKey: text.includes('Use an API key instead'),
    offersReset: text.includes('Forgot password?'),
    offersSignup: text.includes('Create one'),
    // Demo mode was removed in 4.6.3. The check is now the inverse: the
    // sign-in screen must NOT offer fabricated data to a real user.
    offersDemo: /Explore with demo data|demo data/i.test(text),
    explainsNoBridge: text.includes('Real sign-in needs the Victus Cloud Android app'),
    claimsEncryptedKey: text.includes('revocable API key'),
  };
});
check('sign-in screen asks the real panel for credentials',
  loginScreen.asksForIdentifier && loginScreen.asksForPassword,
  JSON.stringify(loginScreen));
check('sign-in screen offers the API key, reset and sign-up paths',
  loginScreen.offersApiKey && loginScreen.offersReset && loginScreen.offersSignup);
check('sign-in screen offers no demo/sample data at all', !loginScreen.offersDemo);
// The "real sign-in needs the app" notice is only correct when there is no auth
// bridge at all. This page HAS one (stubbed above), so its absence is the pass
// condition; the genuine no-bridge case is covered on its own page further down.
check('a bridged build does not claim sign-in is unavailable',
  !loginScreen.explainsNoBridge, JSON.stringify({ explainsNoBridge: loginScreen.explainsNoBridge }));
check('sign-in screen states where the credential lives', loginScreen.claimsEncryptedKey);

// 2c. "Create one" leaves for the billing portal rather than faking a sign-up form.
await page.getByRole('button', { name: 'Create one' }).click();
const signupTargets = await page.evaluate(() => window.__victusOpenCalls);
check('account creation is handed to the billing portal',
  signupTargets.length === 1 && signupTargets[0].includes('billing.victuscloud.com'),
  signupTargets.join(','));
// Reset the log so the later "no bridge → browser tab" check still counts exactly
// the one call that click makes.
await page.evaluate(() => { window.__victusOpenCalls = []; });

// 3. Sign in through the app's own form, against the stubbed panel. Demo
// sign-in was removed in 4.6.3, so this exercises the only path that remains and
// proves the real sign-in flow still reaches the signed-in shell.
await page.locator('#victus-signin-identifier').fill('verify@victuscloud.com');
await page.locator('#victus-signin-password').fill('a-real-password');
await page.getByRole('button', { name: /^Sign in$/i }).click();
await page.waitForSelector('.app-shell', { timeout: 20000 });
await page.waitForSelector('text=Victus Cloud Ecosystem', { timeout: 20000 });
check('signing in against the panel mounts the app shell', true);

// 3b. No demo badge and no fabricated session may survive anywhere in the app.
const noDemoAnywhere = await page.evaluate(() => {
  const text = document.body.textContent || '';
  const stored = JSON.parse(localStorage.getItem('victus_auth_session') || '{}');
  return {
    badge: [...document.querySelectorAll('span')].some((s) => s.textContent.trim() === 'Demo'),
    mentionsDemo: /\bdemo\b|sample fleet/i.test(text),
    storedProvider: stored.provider,
  };
});
check('no demo badge and no sample data inside the signed-in app',
  !noDemoAnywhere.badge && !noDemoAnywhere.mentionsDemo,
  JSON.stringify(noDemoAnywhere));
check('a real panel session is what is stored',
  noDemoAnywhere.storedProvider === 'victus', JSON.stringify(noDemoAnywhere));

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
check('node infrastructure lists the nodes of the account\'s own servers',
  nodes.rows.includes('SG-1') && nodes.rows.includes('Frankfurt-KVM')
    && nodes.rows.includes('Amsterdam-1') && !nodes.rows.some((r) => r === 'Unknown'),
  `nodes=[${nodes.rows.join(',')}]`);
check('node panel states its data source honestly', nodes.footer);

// 4c. The per-server control screen, driven by the account's OWN servers (the
// sample fleet was removed in 4.6.3, so this now exercises the real path only).
const noSample = await page.evaluate(() =>
  !(document.body.textContent || '').includes('VictusMc Survival'));
check('the sample fleet is nowhere in the signed-in app', noSample);

await page.getByText('Survival SMP', { exact: true }).click();
await page.waitForSelector('text=Back to Fleet Overview', { timeout: 20000 });
// A power action goes to the panel, and the console reports what the panel
// actually answered — the screen must never claim a restart that was refused.
await page.getByRole('button', { name: /Restart/i }).click();
await page.getByText('RESTART accepted (HTTP 204)').waitFor({ timeout: 20000 });
check('per-server control screen sends a real power action to the panel', true);
await page.getByRole('button', { name: 'Back to Fleet Overview', exact: true }).click();
await page.waitForSelector('text=FLEET OVERVIEW', { timeout: 20000 });

// 4a. There is no sample fleet to label any more (4.6.3). The control dashboard
// must never show fabricated servers; with no panel reachable it says so instead.
const sampleFleet = await page.evaluate(() => {
  const text = document.body.textContent || '';
  return {
    sampleBanner: text.includes('Sample fleet'),
    liveBanner: text.includes('Live from control.victuscloud.com'),
  };
});
check('the app never falls back to a fabricated sample fleet',
  !sampleFleet.sampleBanner, JSON.stringify(sampleFleet));

// 4b. A NON-ADMIN must see nothing admin-related at all: no view-toggle, no
// "Web View" button, no hint. The shell answers with an empty admin list for the
// demo / normal account, and that has to be enough to hide everything.
const nonAdminChrome = await page.evaluate(() => {
  const text = document.body.textContent || '';
  return {
    toggle: !!document.querySelector('[aria-label="Admin view"]'),
    webViewButton: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Web View'),
    mentionsSwitch: /Switch to (web|app) view/i.test(text),
  };
});
check('a non-admin sees no admin toggle and no Web View button',
  !nonAdminChrome.toggle && !nonAdminChrome.webViewButton && !nonAdminChrome.mentionsSwitch,
  JSON.stringify(nonAdminChrome));

// 4c. The admin Area entry in the one menu is hidden for the same reason.
await page.evaluate(() => {
  document.querySelector('[aria-label="Open navigation drawer"]')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForSelector('text=MAIN', { timeout: 10000 });
const menuForNonAdmin = await page.evaluate(() => document.body.textContent || '');
check('the single menu hides the Admin Area entry from a non-admin',
  !menuForNonAdmin.includes('Admin Area'), '');
await page.keyboard.press('Escape');
await page.evaluate(() => {
  document.querySelector('[aria-body]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});

// 4d. …and an ADMIN in that area does get the toggle, whose "web" choice hands
// the live portal to the app's own browser surface (the portals cannot be
// framed, so this is the only way they can render).
await page.evaluate(() => {
  window.__victusAdminAreas = ['https://control.victuscloud.com'];
});
// The shell reports the areas for the page on screen, so open that area first.
await page.evaluate(() => {
  [...document.querySelectorAll('nav button')]
    .find((b) => b.textContent.trim() === 'Control')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
// The toggle is allowed to appear a moment later: the role check finishes in the
// background, and it must show up in real time even on a page already open.
const adminToggleVisible = await page
  .waitForSelector('[aria-label="Admin view"]', { timeout: 8000 })
  .then(() => true, () => false);
await page.evaluate(() => { document.querySelector('[aria-label="Close drawer"]')?.dispatchEvent(new MouseEvent('click',{bubbles:true})); });
await page.waitForTimeout(300);
check('a real admin sees the web/app view toggle', adminToggleVisible);

if (adminToggleVisible) {
  await page.getByRole('button', { name: 'Switch to web view' }).click();
  const bridgeCalls = await page.evaluate(() => window.__victusBridgeCalls);
  check('the admin toggle opens the live admin site in the native in-app browser',
    bridgeCalls.length === 1
      && bridgeCalls[0].url.startsWith('https://control.victuscloud.com')
      && typeof bridgeCalls[0].title === 'string'
      && bridgeCalls[0].title.length > 0,
    JSON.stringify(bridgeCalls[0] ?? null));
  const remembered = await page.evaluate(() =>
    localStorage.getItem('victus.adminView.https://control.victuscloud.com'));
  check('the chosen view is remembered per admin area', remembered === 'web', String(remembered));
  await page.evaluate(() => { window.__victusBridgeCalls = []; });

  // A role revoked while the app sits in the background must take the toggle away
  // again without the user navigating anywhere.
  await page.evaluate(() => { window.__victusAdminAreas = []; });
  const revokedGone = await page
    .waitForSelector('[aria-label="Admin view"]', { state: 'detached', timeout: 8000 })
    .then(() => true, () => false);
  check('a revoked admin role removes the toggle in real time', revokedGone);
}

check('no admin path ever falls back to the dev-server proxy',
  ![...responses, ...failedRequests].some((r) => String(r.url ?? r).includes('/api/proxy')),
  responses.filter((r) => r.url.includes('/api/')).map((r) => r.url).slice(0, 2).join(' | '));

// …and the app's own single menu still offers the live site to everyone, through
// the in-app browser in the APK and a browser tab in a plain build.
await page.evaluate(() => {
  document.querySelector('[aria-label="Open navigation drawer"]')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.getByRole('button', { name: 'Open site in app browser' }).click();
const menuBridgeCalls = await page.evaluate(() => window.__victusBridgeCalls);
check('the single menu opens the live site through the native in-app browser',
  menuBridgeCalls.length === 1 && menuBridgeCalls[0].url.startsWith('https://'),
  JSON.stringify(menuBridgeCalls));

// …and in a plain browser build (no bridge) the same action opens a tab instead.
await page.evaluate(() => {
  window.__victusOpenCalls = [];
  delete window.VictusNative;
});
await page.evaluate(() => {
  document.querySelector('[aria-label="Open navigation drawer"]')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.getByRole('button', { name: 'Open site in app browser' }).click();
const openCalls = await page.evaluate(() => window.__victusOpenCalls);
check('without the native bridge the same action opens a browser tab',
  openCalls.length === 1 && openCalls[0].startsWith('https://'),
  JSON.stringify(openCalls));

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

// The Appearance sheet is still open over the app; its backdrop swallows every
// pointer event, so the next real interaction has to close it first. The wait is
// for the element to actually leave the DOM, not merely to stop being visible.
await page.getByRole('button', { name: 'Done', exact: true }).click();
await page.getByText('BACKGROUND', { exact: true }).waitFor({ state: 'detached', timeout: 8000 });

// 7. (The per-server screen is exercised in step 4c, while the fleet that was
// just read from the panel is still on screen.)

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

// ---------------------------------------------------------------------------
// 9. Real panel sign-in through an auth-capable bridge — the path that replaced
// the fabricated local session. Driven in a second page so the no-bridge flow
// above stays exactly as a browser preview sees it.
// ---------------------------------------------------------------------------
const authPage = await context.newPage();
await serveAssets(authPage);
const authPageErrors = [];
authPage.on('console', (m) => { if (m.type() === 'error') authPageErrors.push(m.text()); });
authPage.on('pageerror', (e) => authPageErrors.push('pageerror: ' + e.message));

await authPage.addInitScript(() => {
  window.__victusAuthCalls = [];
  window.__victusAuthMode = 'rejected';
  const answer = (id, value) =>
    window.__victusBridge.resolve(Number(id), JSON.stringify(value));
  const session = {
    kind: 'api_key',
    userId: '1',
    username: 'ada',
    email: 'ada@victuscloud.com',
    name: 'Ada Lovelace',
    rootAdmin: true,
    twoFactorEnabled: true,
    createdAt: 1767225600000,
    expiresAt: 0,
    keyMasked: '…alue',
  };

  window.VictusNative = {
    openBrowser: (url) => {
      window.__victusOpenCalls = [...(window.__victusOpenCalls || []), url];
    },
    authSignIn: (user, password, id) => {
      window.__victusAuthCalls.push({ method: 'authSignIn', user, password });
      if (window.__victusAuthMode === 'twofactor') {
        answer(id, { ok: false, state: 'two_factor_required', confirmationToken: 'c1' });
        return;
      }
      answer(id, {
        ok: false,
        state: 'error',
        status: 400,
        message: 'No account matching those credentials could be found.',
      });
    },
    authSubmitTwoFactor: (confirmationToken, code, id) => {
      window.__victusAuthCalls.push({ method: 'authSubmitTwoFactor', confirmationToken, code });
      answer(id, { ok: true, state: 'signed_in', session });
    },
    apiGet: (path, id) => {
      window.__victusAuthCalls.push({ method: 'apiGet', path });
      if (path.indexOf('/resources') !== -1) {
        answer(id, {
          ok: true,
          state: 'ok',
          status: 200,
          body: JSON.stringify({
            object: 'stats',
            attributes: {
              current_state: 'running',
              resources: {
                cpu_absolute: 12.4,
                memory_bytes: 1500000000,
                disk_bytes: 5400000000,
                uptime: 11520000,
              },
            },
          }),
        });
        return;
      }
      // The account's real fleet, in the panel's own list shape.
      answer(id, {
        ok: true,
        state: 'ok',
        status: 200,
        body: JSON.stringify({
          object: 'list',
          data: [
            {
              object: 'server',
              attributes: {
                identifier: '9a4b12c1',
                uuid: '9a4b12c1-3a1b-4cd3-84f9-71b8cd961001',
                name: 'Survival SMP',
                node: 'SG-1',
                status: 'running',
                is_suspended: false,
                is_installing: false,
                limits: { memory: 8192, disk: 50000, cpu: 400 },
                relationships: {
                  allocations: {
                    data: [{ attributes: { ip: '203.0.113.10', port: 25565, is_default: true } }],
                  },
                },
              },
            },
            {
              object: 'server',
              attributes: {
                identifier: '3f8e77a2',
                uuid: '3f8e77a2-5b2c-4ef1-90a1-71b8cd961002',
                name: 'Creative Hub',
                node: 'SG-2',
                status: null,
                is_suspended: false,
                is_installing: false,
                limits: { memory: 4096, disk: 25000, cpu: 200 },
              },
            },
          ],
        }),
      });
    },
    apiPost: (path, body, id) => {
      window.__victusAuthCalls.push({ method: 'apiPost', path, body });
      answer(id, { ok: true, state: 'ok', status: 204, body: '' });
    },
  };
});

await authPage.goto(`${ORIGIN}/index.html`, { waitUntil: 'load' });
await authPage.waitForSelector('text=Sign in to Victus Cloud', { timeout: 20000 });

// 9a. A rejected password renders the panel's own sentence, not an invented one.
await authPage.getByPlaceholder('you@victuscloud.com').fill('Ada@VictusCloud.com');
await authPage.getByPlaceholder('••••••••••••').fill('wrong-password');
await authPage.getByRole('button', { name: 'Sign in', exact: true }).click();
await authPage.waitForSelector(
  'text=No account matching those credentials could be found.', { timeout: 15000 });
const rejectedCalls = await authPage.evaluate(() => window.__victusAuthCalls);
check('a rejected password shows the panel\'s own message',
  rejectedCalls.some((c) => c.method === 'authSignIn' && c.user === 'ada@victuscloud.com'),
  JSON.stringify(rejectedCalls[0] ?? {}));
check('no session is cached after a rejected password',
  (await authPage.evaluate(() => localStorage.getItem('victus_auth_session'))) === null);

// 9b. Two-factor: the panel asks for a code, the code completes the session.
await authPage.evaluate(() => { window.__victusAuthMode = 'twofactor'; });
await authPage.getByRole('button', { name: 'Sign in', exact: true }).click();
await authPage.waitForSelector('text=Two-factor verification', { timeout: 15000 });
await authPage.getByPlaceholder('123456').fill('123456');
await authPage.getByRole('button', { name: 'Verify and sign in' }).click();
await authPage.waitForSelector('.app-shell', { timeout: 20000 });
const authCalls = await authPage.evaluate(() => window.__victusAuthCalls);
check('two-factor step appears and completes the sign-in',
  authCalls.some((c) => c.method === 'authSubmitTwoFactor'
    && c.confirmationToken === 'c1' && c.code === '123456'));
check('the signed-in session reads live data from /api/client',
  authCalls.some((c) => c.method === 'apiGet' && c.path === '/api/client'));

// 9c. The account shown is the panel's, and no credential reached the web app.
const realSession = await authPage.evaluate(() => {
  const raw = localStorage.getItem('victus_auth_session') || '';
  const stored = JSON.parse(raw || '{}');
  return {
    provider: stored.provider,
    email: stored.user?.email,
    role: stored.user?.user_metadata?.role,
    serverCount: stored.serverCount,
    accessToken: stored.access_token,
    raw,
  };
});
check('a real sign-in caches a panel session with the panel account',
  realSession.provider === 'victus' && realSession.email === 'ada@victuscloud.com'
    && realSession.role === 'Administrator' && realSession.serverCount === 2,
  JSON.stringify(realSession));
check('the panel credential never reaches the web app',
  !realSession.raw.includes('ptlc_') && realSession.accessToken === '');
const realBadge = await authPage.evaluate(() =>
  [...document.querySelectorAll('span')].some((s) => s.textContent.trim() === 'Demo'));
check('a real session is not labelled as demo data', !realBadge);

// 9d. The profile identifies the panel credential without exposing it.
await authPage.getByRole('button', { name: 'Account profile' }).click();
const profile = await authPage.evaluate(() => document.body.textContent || '');
check('profile names the panel account and masks its key',
  profile.includes('Ada Lovelace') && profile.includes('API key …alue')
    && profile.includes('Servers on this account'),
  profile.includes('API key …alue') ? '' : 'key row missing');
check('no uncaught page errors during real sign-in', authPageErrors.length === 0,
  authPageErrors.slice(0, 2).join(' | '));
await authPage.getByRole('button', { name: 'Close profile modal' }).click();

// 9e. The control section reads the account's own servers, not the sample fleet.
await authPage.getByRole('button', { name: 'Control Panel', exact: true }).click();
await authPage.waitForSelector('text=FLEET OVERVIEW', { timeout: 20000 });
const liveFleet = await authPage.evaluate(() => {
  const text = document.body.textContent || '';
  return {
    liveBanner: text.includes('Live from control.victuscloud.com'),
    sampleBanner: text.includes('Sample fleet'),
    hasLiveServer: text.includes('Survival SMP'),
    hasSampleServer: text.includes('VictusMc Survival'),
    listRequests: window.__victusAuthCalls
      .filter((c) => c.method === 'apiGet' && c.path === '/api/client').length,
  };
});
check('the dashboard shows the account\'s own servers',
  liveFleet.hasLiveServer && !liveFleet.hasSampleServer,
  JSON.stringify(liveFleet));
check('the dashboard says the fleet is live, not sample data',
  liveFleet.liveBanner && !liveFleet.sampleBanner);
check('the fleet really came from GET /api/client', liveFleet.listRequests >= 1);

// 9f. A power action is a real panel call, and the screen reports its answer.
await authPage.getByText('Survival SMP', { exact: true }).click();
await authPage.waitForSelector('text=Back to Fleet Overview', { timeout: 20000 });
const liveChip = await authPage.evaluate(() =>
  (document.body.textContent || '').includes('Live panel'));
check('the server screen marks itself as reading the live panel', liveChip);

await authPage.getByRole('button', { name: /Restart/i }).click();
await authPage.waitForSelector('text=[Panel] RESTART accepted', { timeout: 20000 });
const powerCall = await authPage.evaluate(() =>
  window.__victusAuthCalls.find((c) => c.method === 'apiPost'));
check('restart is sent to the panel\'s power endpoint',
  powerCall?.path === '/api/client/servers/9a4b12c1-3a1b-4cd3-84f9-71b8cd961001/power'
    && JSON.parse(powerCall.body).signal === 'restart',
  JSON.stringify(powerCall ?? {}));

// 9g. A console command is sent for real, and usage figures come from the panel.
await authPage.getByPlaceholder('Send command to server daemon...').fill('say hello');
await authPage.keyboard.press('Enter');
await authPage.waitForSelector('text=Command accepted', { timeout: 20000 });
const commandCall = await authPage.evaluate(() =>
  window.__victusAuthCalls.filter((c) => c.method === 'apiPost')
    .find((c) => c.path.indexOf('/command') !== -1));
check('console commands go to the panel',
  commandCall?.path === '/api/client/servers/9a4b12c1-3a1b-4cd3-84f9-71b8cd961001/command'
    && JSON.parse(commandCall.body).command === 'say hello',
  JSON.stringify(commandCall ?? {}));
const liveUsage = await authPage.evaluate(() => {
  const text = document.body.textContent || '';
  return {
    cpu: text.includes('12.4%'),
    memory: text.includes('1.4 GB'),
    uptime: text.includes('up 3h 12m'),
  };
});
check('usage figures come from the panel, not from the sample data',
  liveUsage.cpu && liveUsage.memory && liveUsage.uptime, JSON.stringify(liveUsage));
check('no uncaught page errors while driving the live fleet', authPageErrors.length === 0,
  authPageErrors.slice(0, 2).join(' | '));
await authPage.close();

check('no uncaught page errors across the whole flow', consoleErrors.length === 0,
  consoleErrors.slice(0, 2).join(' | '));
check('no failed asset requests', failedRequests.length === 0,
  failedRequests.slice(0, 2).join(' | '));

await page.screenshot({ path: 'app/build/verify-webview.png' });
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
process.exit(failed.length === 0 ? 0 : 1);

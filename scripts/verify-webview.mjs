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
  window.VictusNative = {
    openWebView: (url, title) => {
      window.__victusBridgeCalls.push({ url, title });
    },
    openBrowser: (url) => {
      window.__victusOpenCalls.push(String(url));
    },
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
    labelsDemo: text.includes('Explore with demo data (not your account)'),
    explainsNoBridge: text.includes('Real sign-in needs the Victus Cloud Android app'),
    claimsEncryptedKey: text.includes('revocable API key'),
  };
});
check('sign-in screen asks the real panel for credentials',
  loginScreen.asksForIdentifier && loginScreen.asksForPassword,
  JSON.stringify(loginScreen));
check('sign-in screen offers the API key, reset and sign-up paths',
  loginScreen.offersApiKey && loginScreen.offersReset && loginScreen.offersSignup);
check('demo data is offered but labelled as not the account', loginScreen.labelsDemo);
check('a browser build says real sign-in needs the app', loginScreen.explainsNoBridge);
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

// 3. Authenticate with the bundled demo account -> the real app shell must mount.
await page.getByRole('button', { name: /Explore with demo data/ }).click();
await page.waitForSelector('.app-shell', { timeout: 20000 });
await page.waitForSelector('text=Victus Cloud Ecosystem', { timeout: 20000 });
check('authenticated shell mounts after demo sign-in', true);

// 3b. Demo data is labelled once inside the app, so it cannot pass for a real session.
const demoBadge = await page.evaluate(() =>
  [...document.querySelectorAll('span')].some((s) => s.textContent.trim() === 'Demo'));
const demoCredential = await page.evaluate(() => {
  const stored = JSON.parse(localStorage.getItem('victus_auth_session') || '{}');
  return { provider: stored.provider, accessToken: stored.access_token };
});
check('demo session is marked as demo in the UI and in storage', demoBadge);
check('demo session stores no token of any kind',
  demoCredential.provider === 'demo' && demoCredential.accessToken === '',
  JSON.stringify(demoCredential));

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

// 4a. Demo mode must label the fleet as sample data rather than imply ownership.
const sampleFleet = await page.evaluate(() => {
  const text = document.body.textContent || '';
  return {
    sampleBanner: text.includes('Sample fleet'),
    liveBanner: text.includes('Live from control.victuscloud.com'),
  };
});
check('demo mode labels the fleet as sample data',
  sampleFleet.sampleBanner && !sampleFleet.liveBanner, JSON.stringify(sampleFleet));

// 4b. "Web View" must hand the live portal to the app's own browser surface
// (the portals cannot be framed, so this is the only way it can render).
await page.getByRole('button', { name: 'Web View', exact: true }).click();
const bridgeCalls = await page.evaluate(() => window.__victusBridgeCalls);
check('Web View opens the live portal through the native in-app browser',
  bridgeCalls.length === 1
    && bridgeCalls[0].url.startsWith('https://control.victuscloud.com')
    && typeof bridgeCalls[0].title === 'string'
    && bridgeCalls[0].title.length > 0,
  JSON.stringify(bridgeCalls[0] ?? null));
check('Web View never falls back to the dev-server proxy',
  ![...responses, ...failedRequests].some((r) => String(r.url ?? r).includes('/api/proxy')),
  responses.filter((r) => r.url.includes('/api/')).map((r) => r.url).slice(0, 2).join(' | '));

// …and in a plain browser build (no bridge) the same button opens a tab instead.
await page.evaluate(() => {
  delete window.VictusNative;
});
await page.getByRole('button', { name: 'Web View', exact: true }).click();
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

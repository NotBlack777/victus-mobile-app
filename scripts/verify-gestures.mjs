/**
 * verify-gestures.mjs
 *
 * Drives the three gestures that were reported broken, with real input events
 * rather than assertions about the source: the chat bubble must actually move
 * when dragged and must open on a tap that does not move, and the page must
 * actually scroll.
 *
 * The previous verification suite checked that the code existed and that pages
 * loaded. It never performed a drag, so "the bubble can't be moved" and "the
 * page can't be scrolled" both survived a green run.
 *
 * Usage:
 *   node scripts/verify-gestures.mjs app/build/generated/reactAssets
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ASSETS_ROOT = process.argv[2];
if (!ASSETS_ROOT || !fs.existsSync(ASSETS_ROOT)) {
  console.error('Usage: node scripts/verify-gestures.mjs <staged-assets-dir>');
  process.exit(2);
}

const ORIGIN = 'https://appassets.androidplatform.net';
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json',
  '.json': 'application/json', '.ico': 'image/x-icon',
};

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

const browser = await chromium.launch();
// A small, tall-but-scrollable phone: a viewport short enough that the app
// content genuinely overflows, which is the condition the scroll bug hid behind.
const context = await browser.newContext({
  viewport: { width: 412, height: 640 },
  deviceScaleFactor: 2.6,
  isMobile: true,
  hasTouch: true,
  serviceWorkers: 'block',
});
const page = await context.newPage();

await page.addInitScript(() => {
  window.__victusOpenCalls = [];
  window.__victusBridgeResolve = (cb, payload) => {
    // The real bridge is callback-id based, not function callbacks: the page
    // hands over a numeric id and the native side resolves it by id.
    const id = Number(cb);
    setTimeout(() => {
      window.__victusBridge && window.__victusBridge.resolve(id, JSON.stringify(payload));
    }, 0);
  };
  const session = (user) => ({
    ok: true, state: 'signed_in',
    session: {
      kind: 'api_key', userId: 'verify', username: user, email: user,
      name: 'Verify', rootAdmin: false, twoFactorEnabled: false,
      createdAt: 0, expiresAt: 0, keyMasked: '…aaaa',
    },
  });
  // A small real fleet, so the control dashboard is genuinely taller than the
  // screen and scrolling it can actually be proven.
  window.__victusFleet = () => Array.from({ length: 4 }, (_, i) => ({
    object: 'server',
    attributes: {
      identifier: `srv-${i}`, uuid: `11111111-2222-3333-4444-55555555555${i}`,
      name: `Game node ${i + 1}`, description: 'A real server on the account',
      status: i === 0 ? 'ACTIVE' : 'OFF',
      current_state: i === 0 ? 'running' : 'offline',
      created_at: '2026-01-01T00:00:00.000000Z',
    },
  }));

  window.VictusNative = {
    authRestore: (cb) => window.__victusBridgeResolve(cb, { ok: false, state: 'error', message: 'signed out' }),
    authSignIn: (user, _pass, cb) => window.__victusBridgeResolve(cb, session(user)),
    authSignOut: (_revoke, cb) => window.__victusBridgeResolve(cb, { ok: true, state: 'signed_out' }),
    apiGet: (path, cb) => window.__victusBridgeResolve(cb, {
      ok: true, state: 'ok', status: 200,
      body: path === '/api/client' ? JSON.stringify({ data: window.__victusFleet() }) : '{"data":[]}',
    }),
    apiPost: (_path, _body, cb) => window.__victusBridgeResolve(cb, {
      ok: true, state: 'ok', status: 204, body: '',
    }),
    openBrowser: (url) => window.__victusOpenCalls.push(String(url)),
    shellUiState: () => JSON.stringify({ adminAreas: [], updateAvailable: false, canGoBack: false, isLoading: false }),
    appVersion: () => '9.9.9',
    shellSetDragging: () => {},
    shellSetColorMode: () => {},
    shellRefreshAdminAccess: () => {},
    totpWindowState: () => JSON.stringify({ secondsRemaining: 30, millisUntilNext: 1000, periodSeconds: 30, synced: true, offsetMillis: 0 }),
  };
});

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

await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'load' });
// Sign in through the app's own form rather than writing localStorage, so the
// shell under test is the one a real sign-in produces.
await page.waitForSelector('#victus-signin-identifier', { timeout: 20000 });
await page.locator('#victus-signin-identifier').fill('verify@victuscloud.com');
await page.locator('#victus-signin-password').fill('a-real-password');
await page.getByRole('button', { name: /^Sign in$/i }).click();
await page.waitForSelector('[aria-label="Open support chat"]', { timeout: 20000 });

// --------------------------------------------------------------------- scroll
// The shell is deliberately one screen tall with exactly one inner scroller
// (`.app-content`), so scrolling is not a document scroll — a test that asserts
// on window.scrollY would report a failure for a page that scrolls perfectly.
const metrics = await page.evaluate(() => {
  const content = document.querySelector('.app-content');
  return {
    overflowY: getComputedStyle(content).overflowY,
    scrollHeight: content.scrollHeight,
    clientHeight: content.clientHeight,
  };
});
check('the content box is a real scroller',
  metrics.overflowY === 'auto' || metrics.overflowY === 'scroll',
  `overflow-y=${metrics.overflowY}`);

// A short page has nothing to scroll, which is correct behaviour and a useless
// test. The control dashboard with a real fleet is tall enough to prove the
// gesture actually moves it.
await page.evaluate(() => {
  const link = [...document.querySelectorAll('a,button')].find((el) =>
    /control|servers/i.test(el.textContent || ''));
  if (link) link.click();
});
await page.waitForTimeout(800);

// A real wheel gesture over the content area, the way a scroll arrives.
const overflow = await page.evaluate(() => {
  const c = document.querySelector('.app-content');
  return { scrollHeight: c.scrollHeight, clientHeight: c.clientHeight };
});
const contentBox = await page.locator('.app-content').boundingBox();
await page.mouse.move(contentBox.x + contentBox.width / 2, contentBox.y + 40);
await page.mouse.wheel(0, 600);
await page.waitForTimeout(400);
const scrolledY = await page.evaluate(() => document.querySelector('.app-content').scrollTop);
check('a wheel gesture scrolls a page that has more to show',
  overflow.scrollHeight > overflow.clientHeight ? scrolledY > 0 : true,
  `scrollTop=${scrolledY} overflow=${overflow.scrollHeight - overflow.clientHeight}px`);

// ---------------------------------------------------------------------- drag
const bubble = page.locator('[aria-label="Open support chat"]');
const boxBefore = await bubble.boundingBox();
const start = {
  x: boxBefore.x + boxBefore.width / 2,
  y: boxBefore.y + boxBefore.height / 2,
};
const transformBefore = await bubble.evaluate((el) => getComputedStyle(el).transform);

// Drag up and to the left by an unambiguous distance, in small steps the way a
// finger moves, so a real drag is a drag and not a flick.
await page.mouse.move(start.x, start.y);
await page.mouse.down();
for (let i = 1; i <= 8; i += 1) {
  await page.mouse.move(start.x - i * 12, start.y - i * 18);
  await page.waitForTimeout(16);
}
await page.mouse.up();
await page.waitForTimeout(300);

const boxAfter = await bubble.boundingBox();
const transformAfter = await bubble.evaluate((el) => getComputedStyle(el).transform);
const movedUp = boxBefore.y - boxAfter.y;
const movedLeft = boxBefore.x - boxAfter.x;

check('dragging the bubble moves it',
  movedUp > 30 && movedLeft > 30,
  `up=${movedUp.toFixed(0)}px left=${movedLeft.toFixed(0)}px`);
check('the bubble really changed position, not just its hit box',
  transformBefore !== transformAfter,
  `${transformBefore} -> ${transformAfter}`);

// A drag must not be mistaken for a tap: the chat should still be closed.
const chatOpenAfterDrag = await page.locator('text=Victus Live Support').count();
check('a drag does not open the chat', chatOpenAfterDrag === 0, `matches=${chatOpenAfterDrag}`);

// ----------------------------------------------------------------------- tap
const boxTap = await bubble.boundingBox();
await page.mouse.click(boxTap.x + boxTap.width / 2, boxTap.y + boxTap.height / 2);
await page.waitForTimeout(500);
const chatOpened = await page.locator('text=Victus Live Support').count();
check('a plain tap opens the chat', chatOpened > 0, `matches=${chatOpened}`);

await browser.close();
console.log(`\n${failures === 0 ? 'all gesture checks passed' : `${failures} gesture check(s) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
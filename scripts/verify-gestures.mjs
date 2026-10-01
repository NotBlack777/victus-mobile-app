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

  window.__dragRegions = [];
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
    // Records what the shell was told, so the gesture contract can be checked
    // rather than assumed. The native side needs the bubble's bounds *before* a
    // drag starts; see the drag-region checks below.
    shellSetDragRegion: (encoded) => { window.__dragRegions.push(String(encoded)); },
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
// The shell is rendered before its stylesheet has necessarily been applied, so
// the computed value is polled rather than read once: `visible` here means "the
// CSS has not landed yet", not "the app is broken". Without this the check
// fails intermittently on a slow runner for no reason at all.
await page.waitForFunction(() => {
  const content = document.querySelector('.app-content');
  if (!content) return false;
  const overflow = getComputedStyle(content).overflowY;
  return overflow === 'auto' || overflow === 'scroll';
}, undefined, { timeout: 20000 }).catch(() => {});

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

// ------------------------------------------------- the native drag contract
// Everything above drives the page with a *mouse*. A phone sends touch events
// through a SwipeRefreshLayout that no browser test has, and that is precisely
// where the bubble used to die: the shell learned "a drag started" only from
// the page's pointerdown handler, which runs after ACTION_DOWN and whose answer
// then queues behind the ACTION_MOVEs, so the refresh layout intercepted the
// drag and cancelled it. These checks pin the contract that closes that race:
// the bubble must publish where it is, in device pixels, before any drag.

// The chat sheet is a full-shell backdrop that covers the bubble, so it must be
// closed first or every gesture below lands on the backdrop instead.
if (await page.locator('text=Victus Live Support').count()) {
  await page.locator('button:has(svg.lucide-x)').last().click();
  await page.waitForTimeout(400);
  await page.waitForFunction(() => document.querySelector('text=Victus Live Support') === null
    || !document.body.innerText.includes('Victus Live Support'), undefined, { timeout: 5000 })
    .catch(() => {});
}

const regionState = await page.evaluate(() => {
  const regions = (window.__dragRegions || []).filter((r) => r !== 'none');
  const bubble = document.querySelector('[aria-label="Open support chat"]');
  const rect = bubble.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const last = regions[regions.length - 1];
  let parsed = null;
  if (last) {
    const parts = last.split(',').map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) parsed = parts;
  }
  return {
    published: regions.length,
    parsed,
    expected: [rect.left * dpr, rect.top * dpr, rect.right * dpr, rect.bottom * dpr],
    dpr,
  };
});
check('the bubble publishes its bounds to the shell, in device pixels',
  regionState.published > 0 && regionState.parsed !== null,
  `reports=${regionState.published} dpr=${regionState.dpr}`);
check('the published bounds match where the bubble actually is',
  regionState.parsed !== null &&
    ['0', '1', '2', '3'].every((i) =>
      Math.abs(regionState.parsed[Number(i)] - regionState.expected[Number(i)]) <= 2),
  `got=${regionState.parsed ? regionState.parsed.map((n) => n.toFixed(0)).join(',') : 'none'} want=${regionState.expected.map((n) => n.toFixed(0)).join(',')}`);

// The bounds must be re-published as the bubble moves, or the shell is
// protecting a stale region and the next drag is stolen again. The earlier drag
// parked the bubble at the left edge, so this one aims well clear of the frame
// it would otherwise be clamped against and silently not move at all.
const beforeDragCount = regionState.published;
const republishFrom = await bubble.boundingBox();
await page.mouse.move(republishFrom.x + republishFrom.width / 2, republishFrom.y + republishFrom.height / 2);
await page.mouse.down();
await page.mouse.move(republishFrom.x + republishFrom.width / 2 + 70, republishFrom.y + republishFrom.height / 2 + 50);
await page.mouse.up();
await page.waitForTimeout(400);
const afterDragCount = await page.evaluate(
  () => (window.__dragRegions || []).filter((r) => r !== 'none').length);
check('moving the bubble republishes its bounds',
  afterDragCount > beforeDragCount,
  `${beforeDragCount} -> ${afterDragCount}`);

// ------------------------------------------------------- touch, not a mouse
// A mouse proves the page's own handlers work. Only a real touch sequence also
// exercises the pointer-event path a finger takes through the WebView.
const cdp = await context.newCDPSession(page);
const touchDrag = async (from, to) => {
  const point = (x, y) => [{ x, y, radiusX: 12, radiusY: 12, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) });
  for (let i = 1; i <= 6; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6),
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const touchBoxBefore = await bubble.boundingBox();
await touchDrag(
  { x: touchBoxBefore.x + touchBoxBefore.width / 2, y: touchBoxBefore.y + touchBoxBefore.height / 2 },
  { x: touchBoxBefore.x + touchBoxBefore.width / 2 - 60, y: touchBoxBefore.y + touchBoxBefore.height / 2 - 90 });
await page.waitForTimeout(300);
const touchBoxAfter = await bubble.boundingBox();
check('a finger drag moves the bubble, not just a mouse',
  (touchBoxBefore.y - touchBoxAfter.y) > 30 || (touchBoxBefore.x - touchBoxAfter.x) > 30,
  `up=${(touchBoxBefore.y - touchBoxAfter.y).toFixed(0)}px left=${(touchBoxBefore.x - touchBoxAfter.x).toFixed(0)}px`);

await browser.close();
console.log(`\n${failures === 0 ? 'all gesture checks passed' : `${failures} gesture check(s) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
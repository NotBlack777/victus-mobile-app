/**
 * Scroll diagnostics for the mobile shell.
 *
 * The user reports that no page in the app scrolls. This script reproduces the
 * real layout in a phone-sized viewport and reports, for each scrollable
 * candidate, whether it can actually move: the measured scrollHeight vs
 * clientHeight, and whether a programmatic scrollTop write sticks.
 *
 * A candidate that reports scrollHeight > clientHeight but refuses to move is
 * the classic "overflow looks right, but an ancestor is eating the gesture"
 * failure, which is what SwipeRefreshLayout does when it intercepts the drag.
 *
 *   node scripts/diagnose-scroll.mjs
 */
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../dist/', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]));
  const file = path === '/' ? 'index.html' : path.replace(/^\//, '');
  try {
    const body = await readFile(join(ROOT, file));
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
const base = `http://127.0.0.1:${port}/`;

const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices['Pixel 7'],
  // The app reads a cached session from localStorage; seed a minimal one so the
  // real (non-login) shell renders, which is what the user is scrolling.
});
await context.addInitScript(() => {
  const user = {
    id: 'diagnostic',
    email: 'diagnostic@victuscloud.com',
    user_metadata: { name: 'Diagnostic', role: 'Cloud Member' },
    created_at: new Date(0).toISOString(),
  };
  // provider 'demo' on purpose: a 'victus' session is re-validated against the
  // panel by AuthContext's restore() effect on mount, which signs it straight
  // out again in a browser with no native bridge, and the harness would then be
  // measuring the login screen instead of the app shell.
  localStorage.setItem(
    'victus_auth_session',
    JSON.stringify({
      access_token: '', token_type: 'demo', expires_in: 0, expires_at: 0,
      user, provider: 'demo',
    })
  );
});

const page = await context.newPage();
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

const report = await page.evaluate(() => {
  const describe = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      selector:
        el.tagName.toLowerCase() +
        (el.id ? `#${el.id}` : '') +
        (el.className && typeof el.className === 'string'
          ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
          : ''),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowY: cs.overflowY,
      touchAction: cs.touchAction,
      canScrollInTheory: el.scrollHeight > el.clientHeight + 1,
    };
  };

  const chain = [];
  let node = document.querySelector('.app-content');
  if (!node) return { missingAppShell: true, bodyHtml: document.body.innerHTML.slice(0, 400) };
  while (node) {
    chain.push(describe(node));
    node = node.parentElement;
  }

  // The element that is supposed to scroll on the home screen.
  const homeScroller = document.querySelector('.app-content > div');

  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    bodyScrollHeight: document.body.scrollHeight,
    bodyClientHeight: document.body.clientHeight,
    documentScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
    ancestorChain: chain,
    homeScroller: describe(homeScroller),
    homeScrollerChildren: homeScroller ? homeScroller.children.length : 0,
  };
});

console.log(JSON.stringify(report, null, 2));

// What is actually under the drag point? An overlay that is not
// pointer-events:none will swallow every touch, which is the classic
// "content is scrollable but the page does not move" cause.
const hitTest = await page.evaluate(() => {
  const scroller = document.querySelector('.app-content > div');
  const r = scroller.getBoundingClientRect();
  const x = Math.round(r.x + r.width / 2);
  const y = Math.round(r.y + 40);
  const stack = document.elementsFromPoint(x, y).slice(0, 6).map((el) => {
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      cls: typeof el.className === 'string' ? el.className.slice(0, 70) : '',
      pointerEvents: cs.pointerEvents,
      position: cs.position,
      zIndex: cs.zIndex,
      isScroller: el === scroller,
    };
  });
  return { x, y, stack };
});
console.log('\nelementsFromPoint at the drag point:');
console.log(JSON.stringify(hitTest, null, 2));

// Decisive test 1: can the container be scrolled at all programmatically?
const scroller = page.locator('.app-content > div').first();
const programmatic = await scroller.evaluate((el) => {
  el.scrollTop = 400;
  const moved = el.scrollTop;
  el.scrollTop = 0;
  return moved;
});
console.log(`\nprogrammatic scrollTop=400 -> ${programmatic}  ${programmatic > 0 ? 'container IS scrollable' : '*** CONTAINER REFUSES ***'}`);

// Decisive test 2: a real touch drag. Mouse drags are ignored under touch
// emulation, so this must use the touchscreen API or the result is a harness
// artifact rather than an app bug.
const box = await scroller.boundingBox();
if (box) {
  const cx = box.x + box.width / 2;
  const cy = box.y + 40;
  const before = await scroller.evaluate((el) => el.scrollTop);
  await page.touchscreen.tap(cx, cy);
  const cdp = await context.newCDPSession(page);
  const touch = (type, y) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: cx, y }],
    });
  await touch('touchStart', cy);
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', cy + i * 30);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', 0);
  await page.waitForTimeout(400);
  const after = await scroller.evaluate((el) => el.scrollTop);
  console.log(`touch drag scrollTop: ${before} -> ${after}  ${after > before ? 'SCROLLS' : '*** STUCK ***'}`);

  // CONTROL: a plain scrollable div injected into the same page, scrolled by
  // the same code path. If this also fails to move, the fault is in this
  // harness (touch emulation under CDP), not in the app.
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'control-scroller';
    d.style.cssText = 'position:fixed;left:0;top:100px;width:80px;height:200px;overflow-y:auto;z-index:9999;background:#333';
    d.innerHTML = '<div style="height:2000px;background:linear-gradient(#0f0,#00f)"></div>';
    document.body.appendChild(d);
  });
  const control = page.locator('#control-scroller');
  const cBox = await control.boundingBox();
  const ccdp = await context.newCDPSession(page);
  const ctouch = (type, y) =>
    ccdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: cBox.x + 40, y }],
    });
  await ctouch('touchStart', cBox.y + 20);
  for (let i = 1; i <= 10; i++) {
    await ctouch('touchMove', cBox.y + 20 + i * 30);
    await page.waitForTimeout(16);
  }
  await ctouch('touchEnd', 0);
  await page.waitForTimeout(400);
  const controlAfter = await control.evaluate((el) => el.scrollTop);
  console.log(`CONTROL plain div  : 0 -> ${controlAfter}  ${controlAfter > 0 ? 'harness OK' : '*** HARNESS BROKEN ***'}`);
}

await browser.close();
server.close();

// Measures how much the animated backdrop actually changes on screen.
//
// The original bug was not a missing animation — the keyframes ran the whole
// time — but an animation whose output was too faint to see. Comparing two
// screenshots of the same region and diffing the decoded pixels is the only
// honest way to tell "it is animating" from "it looks like it is animating".
//
//   bun run build && bun run verify:backdrop
//
// Exits non-zero if any style fails to clear its visibility budget. Runs in CI
// after `bunx playwright install --with-deps chromium`; locally the browser is
// usually already in the Playwright cache.
//
// The numbers it grades are also pinned by tests/backdrop.test.ts, which is the
// cheap half of the guard: that one fails if the source values drift, this one
// fails if the result stops being visible for any other reason.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../dist/', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

/**
 * Per-style visibility budgets.
 *
 * One mean-delta number cannot grade all three styles honestly. Aurora and mesh
 * wash colour across the whole panel, so their mean genuinely has to move. A
 * starfield is *supposed* to be mostly black — grading it on the mean would push
 * us to fill the screen with fog just to pass a check. It is graded on peak
 * brightness and on how much of the panel is in motion instead.
 *
 * These numbers came from measuring the broken build: aurora used to score
 * 0.85 mean / 35 peak, which is why it looked frozen while its keyframes ran
 * perfectly. The budgets sit well clear of that.
 */
const BUDGETS = {
  // Broad colour wash: graded on how much the average pixel moves.
  aurora: { minMean: 3, minPeak: 40 },
  mesh: { minMean: 1.5, minPeak: 30 },
  // A starfield is *supposed* to be mostly empty black, so coverage is the wrong
  // measure — a field dense enough to move 1.5% of the screen would look like
  // fog. What matters is that the bright points themselves are clearly in
  // motion, so this is graded on peak change and on a small coverage floor.
  starfield: { minMean: 0, minPeak: 120, minMovedPct: 0.5 },
};
const SAMPLE_MS = 2600;

function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let path = normalize(url.pathname);
      if (path === '/' || path.endsWith('/')) path += 'index.html';
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, {
        'content-type': TYPES[extname(path)] || 'application/octet-stream',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  const { chromium } = await import('playwright');
  const { server, port } = await serve();
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  // A blank page used purely to decode and diff the PNGs we capture. The diff
  // runs in here rather than shipping ~1.3M pixel values per screenshot across
  // the CDP connection, which dominated the runtime of an earlier version.
  const decoder = await browser.newPage();
  await decoder.goto('about:blank');
  const diff = (a, b) =>
    decoder.evaluate(async ([first, second]) => {
      const read = async (data) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const [a, b] = await Promise.all([read(first), read(second)]);
      let sum = 0;
      let max = 0;
      let moved = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.max(
          Math.abs(a[i] - b[i]),
          Math.abs(a[i + 1] - b[i + 1]),
          Math.abs(a[i + 2] - b[i + 2])
        );
        sum += d;
        if (d > max) max = d;
        if (d > 0) moved += 1;
      }
      const pixels = a.length / 4;
      return { sum, max, moved, pixels };
    }, [a, b]);

  const results = [];
  let failed = false;

  for (const style of ['aurora', 'mesh', 'starfield']) {
    const budget = BUDGETS[style];
    const page = await browser.newPage({ viewport: { width: 400, height: 820 } });
    await page.addInitScript(
      ([bg, motion]) => {
        localStorage.setItem(
          'victus_theme_prefs_web',
          JSON.stringify({
            preset: 'purple_black',
            customA: '#c084fc',
            customB: '#7c3aed',
            isCustomSolid: false,
            reduceMotion: motion,
            colorMode: 'dark',
            background: bg,
          })
        );
      },
      [style, false]
    );
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await page.waitForTimeout(900);

    // The whole panel, not a strip: the backdrop is a full-screen layer, so a
    // crop would grade a fraction of what the user actually sees.
    const first = (await page.screenshot()).toString('base64');
    await page.waitForTimeout(SAMPLE_MS);
    const second = (await page.screenshot()).toString('base64');

    const { sum, max, moved, pixels } = await diff(first, second);
    const meanDelta = sum / pixels;
    const movedPct = (100 * moved) / pixels;
    const ok =
      meanDelta >= budget.minMean &&
      max >= budget.minPeak &&
      movedPct >= (budget.minMovedPct ?? 0);
    if (!ok) failed = true;
    results.push({ style, ok, meanDelta, maxDelta: max, movedPct });
    await page.close();
  }

  // "Off" must render no layer at all, and reduced motion must hold still.
  const still = await browser.newPage({ viewport: { width: 400, height: 820 } });
  await still.addInitScript(() => {
    localStorage.setItem(
      'victus_theme_prefs_web',
      JSON.stringify({
        preset: 'purple_black',
        customA: '#c084fc',
        customB: '#7c3aed',
        isCustomSolid: false,
        reduceMotion: true,
        colorMode: 'dark',
        background: 'aurora',
      })
    );
  });
  await still.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await still.waitForTimeout(700);
  const stillRunning = await still.evaluate(() =>
    document.getAnimations().filter((a) => a.playState === 'running').length
  );
  results.push({ style: 'reduce-motion', ok: stillRunning === 0, runningAnimations: stillRunning });
  if (stillRunning !== 0) failed = true;
  await still.close();

  const off = await browser.newPage({ viewport: { width: 400, height: 820 } });
  await off.addInitScript(() => {
    localStorage.setItem(
      'victus_theme_prefs_web',
      JSON.stringify({
        preset: 'purple_black',
        customA: '#c084fc',
        customB: '#7c3aed',
        isCustomSolid: false,
        reduceMotion: false,
        colorMode: 'dark',
        background: 'none',
      })
    );
  });
  await off.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await off.waitForTimeout(700);
  const offHasLayer = await off.evaluate(() => !!document.querySelector('.bgfx'));
  results.push({ style: 'off', ok: offHasLayer === false, layerRendered: offHasLayer });
  if (offHasLayer) failed = true;
  await off.close();

  // OLED is a dark-panel setting. It must reach true black in dark mode and
  // must stay completely inert in light mode — an earlier version left the
  // class on regardless, which painted a black canvas under light text.
  for (const [mode, expectBlack] of [
    ['dark', true],
    ['light', false],
  ]) {
    const page = await browser.newPage({ viewport: { width: 400, height: 820 } });
    await page.addInitScript(
      ([m]) => {
        localStorage.setItem(
          'victus_theme_prefs_web',
          JSON.stringify({
            preset: 'purple_black',
            customA: '#c084fc',
            customB: '#7c3aed',
            isCustomSolid: false,
            reduceMotion: true,
            colorMode: m,
            background: 'none',
            panel: 'oled',
          })
        );
      },
      [mode]
    );
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await page.waitForTimeout(600);

    const probe = await page.evaluate(() => {
      const root = document.documentElement;
      const body = getComputedStyle(document.body);
      return {
        oledClass: root.classList.contains('oled'),
        bodyBg: body.backgroundColor,
        darkText: getComputedStyle(root).getPropertyValue('--text').trim(),
      };
    });

    const isBlack = probe.bodyBg === 'rgb(0, 0, 0)';
    const ok = probe.oledClass === expectBlack && isBlack === expectBlack;
    if (!ok) failed = true;
    results.push({
      style: `oled/${mode}`,
      ok,
      detail: `oled class ${probe.oledClass}, body ${probe.bodyBg}, text ${probe.darkText}`,
    });
    await page.close();
  }

  await browser.close();
  server.close();

  for (const r of results) {
    const mark = r.ok ? 'ok  ' : 'FAIL';
    const detail =
      r.detail !== undefined
        ? r.detail
        : r.meanDelta !== undefined
          ? `mean delta ${r.meanDelta.toFixed(2)}/255, peak ${r.maxDelta}, ${r.movedPct.toFixed(1)}% of pixels moved`
          : r.runningAnimations !== undefined
            ? `running animations ${r.runningAnimations}`
            : `layer rendered ${r.layerRendered}`;
    console.log(`${mark}  ${String(r.style).padEnd(13)} ${detail}`);
  }

  if (failed) {
    console.error('\nbackdrop check: FAIL — the background is not visibly animating');
    process.exit(1);
  }
  console.log('\nbackdrop check: PASS (every style clears its visibility budget)');
}

await main();

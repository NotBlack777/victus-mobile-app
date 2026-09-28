/**
 * Regression checks for the Android debug APK that bundles the React app.
 *
 * These assert the wiring between the Vite build output (dist/) and the APK
 * assets, and that MainActivity points at the bundled index.html rather than the
 * legacy home.html. Everything is skipped automatically when the APK has not
 * been built or `unzip` is unavailable, so `bun test` stays green in a web-only
 * checkout.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = dirname(import.meta.dir);
const APK = join(ROOT, 'app/build/outputs/apk/debug/app-debug.apk');
const DIST = join(ROOT, 'dist');
const WEBVIEW_ASSET_HOST = 'appassets.androidplatform.net';

const unzipAvailable = (() => {
  try {
    return Bun.spawnSync({ cmd: ['unzip', '-v'], stdout: 'ignore', stderr: 'ignore' }).exitCode === 0;
  } catch {
    return false;
  }
})();

const skip = !unzipAvailable || !existsSync(APK) || !existsSync(join(DIST, 'index.html'));

function run(args: string[]): Buffer {
  const proc = Bun.spawnSync({ cmd: args, stdout: 'pipe', stderr: 'pipe' });
  if (proc.exitCode !== 0) {
    throw new Error(`\`${args.join(' ')}\` failed: ${proc.stderr.toString()}`);
  }
  return Buffer.from(proc.stdout);
}

let cachedEntries: string[] | null = null;
function apkEntries(): string[] {
  if (!cachedEntries) {
    cachedEntries = run(['unzip', '-Z1', APK]).toString().split('\n').filter(Boolean);
  }
  return cachedEntries;
}

function apkEntry(name: string): Buffer {
  return run(['unzip', '-p', APK, name]);
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

describe.skipIf(skip)('Android debug APK bundle', () => {
  test('ships the built React app at the WebView asset root', () => {
    const entries = apkEntries();

    expect(entries).toContain('assets/index.html');
    expect(entries).toContain('assets/manifest.webmanifest');
    expect(entries).toContain('assets/icons/icon-192.png');
    expect(entries.some((e) => /^assets\/assets\/index-.*\.js$/.test(e))).toBe(true);
    expect(entries.some((e) => /^assets\/assets\/index-.*\.css$/.test(e))).toBe(true);

    // The legacy page it replaces must no longer be packaged.
    expect(entries.some((e) => e.endsWith('home.html'))).toBe(false);
  });

  test('packages the exact Vite build output, byte for byte', () => {
    expect(sha256(apkEntry('assets/index.html'))).toBe(
      sha256(readFileSync(join(DIST, 'index.html')))
    );

    const html = apkEntry('assets/index.html').toString('utf8');
    const bundles = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
    expect(bundles.length).toBeGreaterThanOrEqual(2);

    for (const bundle of bundles) {
      const inApk = `assets${bundle}`;
      expect(sha256(apkEntry(inApk))).toBe(sha256(readFileSync(join(DIST, bundle))));
    }
  });

  test('every local URL in index.html maps to a staged APK asset', () => {
    const html = apkEntry('assets/index.html').toString('utf8');
    const localRefs = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)]
      .map((m) => m[1])
      .filter((path) => path !== '/');

    expect(localRefs.length).toBeGreaterThan(0);

    const entries = apkEntries();
    for (const ref of localRefs) {
      // WebViewAssetLoader serves the asset root at the domain root, so
      // "/assets/index-x.js" must exist as the APK asset "assets/assets/index-x.js".
      expect(entries).toContain(`assets${ref}`);
    }
  });

  test('MainActivity loads the bundled index.html and never the legacy page', () => {
    const dexEntries = apkEntries().filter((e) => /^classes\d*\.dex$/.test(e));
    expect(dexEntries.length).toBeGreaterThan(0);

    const dex = dexEntries.map((name) => apkEntry(name).toString('latin1')).join('');

    expect(dex).toContain(`${WEBVIEW_ASSET_HOST}/index.html`);
    expect(dex).not.toContain('/assets/home.html');
  });
});

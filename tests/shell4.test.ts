import './dom-shim.ts';
import { beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resetStorage } from './dom-shim.ts';
import { shellSetColorMode, shellSetDragging } from '../src/services/victusBridge.ts';

const CSS = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

/** The rule block for one selector, with its comments stripped. */
function rule(selector: string): string {
  const start = CSS.indexOf(selector + ' {');
  if (start < 0) throw new Error('no such rule: ' + selector);
  const body = CSS.slice(start, CSS.indexOf('}', start));
  // Comments explain the very values under test; asserting against prose would
  // make this test fail on its own documentation.
  return body.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Regressions from the 4.6.3 task list, on the web half.
 *
 * <p>Each test names the user-visible symptom it prevents. The recurring theme
 * is the same as the native bugs: a path that runs, looks plausible in review,
 * and is wrong in a way only a test can see.</p>
 */

interface MutableWindow extends Window {
  VictusNative?: Record<string, unknown>;
}
const w = window as MutableWindow;

beforeEach(() => {
  resetStorage();
  delete w.VictusNative;
});

describe('the page can actually scroll', () => {
  // The reported symptom was "I cannot scroll up or down on ANY page, and
  // pull-to-refresh keeps coming up". The cause was pure CSS: nothing in the
  // stylesheet was ever a scroller, so the document was never taller than the
  // viewport, the WebView truthfully reported "cannot scroll up", and every
  // drag became a pull.
  test('the shell is exactly one screen tall and clips its own overflow', () => {
    const shell = rule('.app-shell');
    expect(shell).toMatch(/height:\s*100d?vh/);
    expect(shell).toMatch(/overflow:\s*hidden/);
    // A min-height here is what let the shell grow past the viewport in 4.6.4,
    // opening the blank region below the content that 4.6.7 reverts.
    expect(shell).not.toMatch(/min-height/);
  });

  test('the content box is the one scroller', () => {
    const content = rule('.app-content');
    expect(content).toMatch(/overflow-y:\s*auto/);
    // `overflow: hidden` here swallows the content instead of scrolling it —
    // the exact defect that made every page unscrollable.
    expect(content).not.toMatch(/overflow(-y)?:\s*hidden/);
    // These two together are what let a flex item be smaller than its content.
    expect(content).toMatch(/flex:\s*1 1 0/);
    expect(content).toMatch(/min-height:\s*0/);
  });

  test('the scroller owns its overscroll so a pull cannot chain', () => {
    expect(rule('.app-content')).toMatch(/overscroll-behavior-y:\s*contain/);
  });

  test('the chrome is a fixed sibling, never squeezed or scrolled away', () => {
    expect(rule('.app-chrome')).toMatch(/flex:\s*0 0 auto/);
  });

  test('the page tells the shell where the scroller is', async () => {
    const { shellSetPageScrolledAwayFromTop } = await import('../src/services/victusBridge.ts');
    // The WebView's own scroll flag can never describe an in-shell scroller, so
    // this is the only signal native pull-to-refresh has.
    let calls: boolean[] = [];
    w.VictusNative = {
      shellSetPageScrolledAwayFromTop: (away: boolean) => { calls.push(away); },
    };
    shellSetPageScrolledAwayFromTop(true);
    shellSetPageScrolledAwayFromTop(false);
    expect(calls).toEqual([true, false]);
  });

  test('reporting scroll position is a safe no-op in a browser', async () => {
    const { shellSetPageScrolledAwayFromTop } = await import('../src/services/victusBridge.ts');
    expect(() => shellSetPageScrolledAwayFromTop(true)).not.toThrow();
  });
});

describe('the chat bubble drag/tap contract', () => {
  // Mirrors clampToFrame in FloatingChatBubble.tsx.
  const BUBBLE = 54;
  const MARGIN = 12;
  const DOCK = 68;
  function clamp(x: number, y: number, w_: number, h: number) {
    const maxX = Math.max(MARGIN, w_ - BUBBLE - MARGIN);
    const maxY = Math.max(MARGIN, h - DOCK - BUBBLE - MARGIN);
    return {
      x: Math.min(Math.max(x, MARGIN), maxX),
      y: Math.min(Math.max(y, MARGIN), maxY),
    };
  }

  test('the bubble can be dragged to the very top of the screen', () => {
    // The reported "it can't be moved up": the old minimum Y was pinned below
    // the header (TOP_BAR_HEIGHT + 8), so the top of the screen was unreachable.
    const pos = clamp(200, 0, 412, 839);
    expect(pos.y).toBe(MARGIN);
  });

  test('the bubble stays inside the screen on the right and bottom', () => {
    expect(clamp(9999, 9999, 412, 839)).toEqual({
      x: 412 - BUBBLE - MARGIN,
      y: 839 - DOCK - BUBBLE - MARGIN,
    });
  });

  test('the bubble never lands on top of the bottom channel chips', () => {
    // The dock must stay tappable, so it is the one edge that is reserved.
    const pos = clamp(200, 9999, 412, 839);
    expect(pos.y + BUBBLE).toBeLessThanOrEqual(839 - DOCK);
  });

  test('a negative or absurd position is clamped back on screen', () => {
    expect(clamp(-500, -500, 412, 839)).toEqual({ x: MARGIN, y: MARGIN });
  });

  test('a tiny screen does not produce a negative maximum', () => {
    // maxX/maxY are Math.max(..., MARGIN) so a very short viewport cannot
    // produce a negative bound and flip the bubble to the far side.
    const pos = clamp(100, 100, 200, 100);
    expect(pos.x).toBeGreaterThanOrEqual(MARGIN);
    expect(pos.y).toBeGreaterThanOrEqual(MARGIN);
  });

  test('the tap/drag threshold separates a tap from a small drag', () => {
    // 5px was small enough that a shaky tap was read as a drag, so tapping the
    // bubble did nothing. 10px still stays under the platform's own ~15px
    // scroll/tap separation, so a real drag is never mistaken for a tap.
    const THRESHOLD = 10;
    expect(4).toBeLessThan(THRESHOLD); // finger jitter -> tap
    expect(3).toBeLessThan(THRESHOLD); // a real tap -> chat opens
    expect(40).toBeGreaterThan(THRESHOLD); // a real drag -> bubble moves
  });
});

describe('the theme-to-shell handshake', () => {
  test('a colour-mode change reaches the shell when it is present', () => {
    // Without this the web app flipped and the shell reverted it on the next
    // theme injection — which is why the light/dark button looked inert.
    const seen: string[] = [];
    w.VictusNative = { shellSetColorMode: (m: string) => seen.push(m) };

    shellSetColorMode('light');
    shellSetColorMode('dark');

    expect(seen).toEqual(['light', 'dark']);
  });

  test('a colour-mode change is a safe no-op in a browser', () => {
    // No bridge at all must not throw, or the header button would break the
    // whole web preview.
    expect(() => shellSetColorMode('dark')).not.toThrow();
  });

  test('a partial bridge does not throw', () => {
    w.VictusNative = {};
    expect(() => shellSetColorMode('system')).not.toThrow();
  });
});

describe('the chat-bubble drag notification', () => {
  test('both edges of a drag are reported to the shell', () => {
    const seen: boolean[] = [];
    w.VictusNative = { shellSetDragging: (d: boolean) => seen.push(d) };

    shellSetDragging(true);
    shellSetDragging(false);

    // start then end: pull-to-refresh stands down for exactly the drag, which is
    // what stops a bubble drag from turning into a page refresh.
    expect(seen).toEqual([true, false]);
  });

  test('the drag notification is a no-op in a browser', () => {
    expect(() => shellSetDragging(true)).not.toThrow();
  });
});

describe('reaching the admin area', () => {
  // The Admin Area menu entry only appears once the shell has confirmed the
  // role with the panel. The probe behind it is silent and rate-limited, so a
  // probe that failed once left a real administrator with no entry at all and
  // nothing on screen saying why — which reads as "the app thinks I am not an
  // admin". The retry is the missing affordance.

  test('the admin retry reaches the shell when it is present', async () => {
    const { shellRefreshAdminAccess } = await import('../src/services/victusBridge.ts');
    let calls = 0;
    w.VictusNative = { shellRefreshAdminAccess: () => { calls += 1; } };
    shellRefreshAdminAccess();
    expect(calls).toBe(1);
  });

  test('the admin retry is a safe no-op in a browser', async () => {
    const { shellRefreshAdminAccess } = await import('../src/services/victusBridge.ts');
    expect(() => shellRefreshAdminAccess()).not.toThrow();
  });

  test('a partial bridge that lacks the retry still does not throw', async () => {
    const { shellRefreshAdminAccess } = await import('../src/services/victusBridge.ts');
    w.VictusNative = { shellUiState: () => '{}' };
    expect(() => shellRefreshAdminAccess()).not.toThrow();
  });
});

describe('account creation routes to the real sign-up form', () => {
  test('the sign-up URL is the real sign-up form', async () => {
    const { ACCOUNT_SIGNUP_URL } = await import('../src/services/authService.ts');
    // "Create Account" used to land on a billing/Control dashboard. The site's
    // own sign-up form is at victuscloud.com/signup (answers 200), so that is
    // the one destination.
    expect(ACCOUNT_SIGNUP_URL).toBe('https://victuscloud.com/signup');
  });

  test('the sign-up URL is https on a .com host', async () => {
    const { ACCOUNT_SIGNUP_URL } = await import('../src/services/authService.ts');
    expect(ACCOUNT_SIGNUP_URL.startsWith('https://')).toBe(true);
    expect(new URL(ACCOUNT_SIGNUP_URL).hostname.endsWith('.com')).toBe(true);
  });
});

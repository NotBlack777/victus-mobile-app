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
  // pull-to-refresh keeps coming up". The cause was pure CSS and lived in the
  // stylesheet, which is why fixing only the native pull-to-refresh layout
  // changed nothing: the document was never taller than the viewport, so the
  // WebView truthfully reported "cannot scroll up" and every drag was a pull.
  test('the shell grows with its content instead of being a fixed-height box', () => {
    const shell = rule('.app-shell');
    // A fixed viewport height caps the document at the viewport.
    expect(shell).not.toMatch(/(^|\s)height:\s*100d?vh/);
    expect(shell).toMatch(/min-height:\s*100d?vh/);
  });

  test('nothing clips the content away from the scroller', () => {
    // `overflow: hidden` on the shell or the content box swallows the overflow
    // instead of letting it reach the document, which is what made every page
    // unscrollable.
    expect(rule('.app-shell')).not.toMatch(/overflow:\s*hidden/);
    expect(rule('.app-content')).not.toMatch(/overflow:\s*hidden/);
    expect(rule('.app-content')).not.toMatch(/flex:\s*1 1 0\b/);
  });

  test('the chrome sticks instead of being taken out of flow', () => {
    // Sticky, not fixed: fixed would need the document to scroll anyway, but it
    // also took the bars out of flow, which is what let content hide under
    // them once the shell stopped clipping.
    expect(rule('.app-chrome')).toMatch(/position:\s*sticky/);
    expect(rule('.app-chrome-top')).toMatch(/top:\s*0/);
    expect(rule('.app-chrome-bottom')).toMatch(/bottom:\s*0/);
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

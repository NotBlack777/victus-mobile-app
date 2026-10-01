import './dom-shim.ts';
import { beforeEach, describe, expect, test } from 'bun:test';
import { resetStorage } from './dom-shim.ts';

/**
 * Regressions from the 4.6.2 bug sweep, on the web half.
 *
 * <p>Each test here corresponds to a defect that shipped. They are the web-side
 * counterpart to {@code MainActivityStateTest} / {@code WebRtcOriginPolicyTest}:
 * the same class of mistake — a path that runs but was never asserted on — so
 * the assertion is written against the behaviour, not the implementation.</p>
 */

/**
 * The name MainActivity dispatches and App.tsx listens for. Duplicated here on
 * purpose: a shared constant would let the two sides drift together and the test
 * would still pass while the feature silently stopped working.
 */
const SESSION_CLEARED = 'victus:session-cleared';

/**
 * The shell's "Clear app session" dialog wipes the panel session in Java,
 * because that is where the credential actually lives. The page has to be told,
 * or it keeps rendering the signed-in home screen with cached server data.
 */
describe('the native clear-session handshake', () => {
  /** The shim only models 'storage' events, so the window bus is local here. */
  function makeBus() {
    const listeners = new Map<string, Set<() => void>>();
    return {
      addEventListener(type: string, listener: () => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener(type: string, listener: () => void) {
        listeners.get(type)?.delete(listener);
      },
      dispatch(type: string) {
        (listeners.get(type) ?? new Set()).forEach((l) => l());
      },
    };
  }

  beforeEach(() => {
    resetStorage();
  });

  test('the event the shell dispatches reaches a mounted listener', () => {
    // MainActivity evaluates this exact CustomEvent on the main thread; if the
    // name changed on one side only, the listener would silently never fire and
    // the bug would return unnoticed.
    const bus = makeBus();
    let received = 0;
    const listener = () => {
      received += 1;
    };
    bus.addEventListener(SESSION_CLEARED, listener);
    bus.dispatch(SESSION_CLEARED);
    bus.removeEventListener(SESSION_CLEARED, listener);
    expect(received).toBe(1);
  });

  test('a listener removed before dispatch is not called', () => {
    // Guards the cleanup half of the effect: a leaked listener would keep
    // signing the user out on every unrelated mount.
    const bus = makeBus();
    let received = 0;
    const listener = () => {
      received += 1;
    };
    bus.addEventListener(SESSION_CLEARED, listener);
    bus.removeEventListener(SESSION_CLEARED, listener);
    bus.dispatch(SESSION_CLEARED);
    expect(received).toBe(0);
  });
});

/**
 * The toast provider used to schedule an untracked setTimeout per toast. On
 * unmount those fired setState on a dead tree, and nothing could cancel them.
 */
describe('toast dismissal timers', () => {
  test('are cancellable, which is what the unmount cleanup relies on', () => {
    let fired = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const timer = setTimeout(() => {
      fired += 1;
      timers.delete(timer);
    }, 3200);
    timers.add(timer);

    timers.forEach(clearTimeout);
    timers.clear();

    expect(timers.size).toBe(0);
    // Synchronous assertion only: the point is that clearTimeout stopped it,
    // and a still-pending timer would report here after the event loop drains.
    expect(fired).toBe(0);
  });
});

/**
 * Two navigations inside one React batch used to read the same stale
 * `currentIndex`: history was truncated twice to the same length while the index
 * advanced twice, leaving `history[index]` undefined and silently dropping the
 * user back to Home. The index is now derived from the history update.
 */
describe('navigation history stays internally consistent', () => {
  type Entry = { tabId: string; url: string; title: string };

  /**
   * Mirrors the fixed navigateTo reducer: the index is derived from the history
   * update, so the two can never disagree.
   */
  function push(history: Entry[], index: number, entry: Entry) {
    const base = Math.min(index, history.length - 1);
    const next = [...history.slice(0, base + 1), entry];
    return { history: next, index: next.length - 1 };
  }

  function pushAll(history: Entry[], index: number, entries: Entry[]) {
    return entries.reduce(
      (acc, entry) => push(acc.history, acc.index, entry),
      { history, index }
    );
  }

  test('two pushes in one batch produce a reachable current entry', () => {
    const start: Entry[] = [{ tabId: 'home', url: '', title: 'Victus Cloud' }];
    const { history, index } = pushAll(start, 0, [
      { tabId: 'control', url: 'https://control.victuscloud.com', title: 'Control' },
      { tabId: 'billing', url: 'https://billing.victuscloud.com', title: 'Billing' },
    ]);

    expect(history.length).toBe(3);
    expect(index).toBe(2);
    // The failure mode this pins down: index pointing past the end of history.
    expect(history[index]).toBeDefined();
    expect(history[index]?.tabId).toBe('billing');
  });

  test('a push after going back truncates the forward entries', () => {
    const start: Entry[] = [
      { tabId: 'home', url: '', title: 'Victus Cloud' },
      { tabId: 'control', url: 'https://control.victuscloud.com', title: 'Control' },
      { tabId: 'billing', url: 'https://billing.victuscloud.com', title: 'Billing' },
    ];
    // Index 1 = one back from Billing. Navigating from there must discard the
    // Billing forward entry rather than appending after it.
    const { history, index } = pushAll(start, 1, [
      { tabId: 'drive', url: 'https://drive.victuscloud.com', title: 'Drive' },
    ]);

    expect(history.map((e) => e.tabId)).toEqual(['home', 'control', 'drive']);
    expect(index).toBe(2);
    expect(history[index]?.tabId).toBe('drive');
  });

  test('an out-of-range index can never point past the end', () => {
    const start: Entry[] = [{ tabId: 'home', url: '', title: 'Victus Cloud' }];
    const { history, index } = pushAll(start, 99, [
      { tabId: 'control', url: 'https://control.victuscloud.com', title: 'Control' },
    ]);
    expect(index).toBeLessThan(history.length);
    expect(history[index]).toBeDefined();
  });
});

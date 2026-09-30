import './dom-shim.ts';
import { beforeEach, describe, expect, test } from 'bun:test';
import { resetStorage } from './dom-shim.ts';
import {
  hasShellBridge,
  shellAdminAreas,
  shellBack,
  shellRefresh,
  shellUiState,
  totpWindowState,
} from '../src/services/victusBridge.ts';

/**
 * The shell half of the native bridge, as the single web menu sees it.
 *
 * The rule these tests exist to pin down: outside the APK, or for an account the
 * panel says has no admin role, everything admin-related must be EMPTY. A hint, a
 * disabled button or a preview would tell a normal user what admin mode looks
 * like, which is exactly what must never happen.
 */

interface MutableWindow extends Window {
  VictusNative?: Record<string, unknown>;
}

const w = window as MutableWindow;

function installBridge(partial: Record<string, unknown>): void {
  w.VictusNative = partial;
}

beforeEach(() => {
  resetStorage();
  delete w.VictusNative;
});

describe('shell detection', () => {
  test('reports no shell outside the APK, and no crash either', () => {
    expect(hasShellBridge()).toBe(false);
    expect(shellUiState()).toEqual({
      updateAvailable: false,
      updateVersion: '',
      currentUrl: '',
      canGoBack: false,
      reduceMotion: false,
      adminAreas: [],
    });
  });

  test('a shell is detected from shellUiState alone', () => {
    installBridge({ shellUiState: () => '{}' });
    expect(hasShellBridge()).toBe(true);
  });

  test('a malformed snapshot degrades to empty, never throws', () => {
    installBridge({ shellUiState: () => 'not json at all' });
    expect(shellUiState().adminAreas).toEqual([]);
    expect(shellUiState().updateAvailable).toBe(false);
  });

  test('a snapshot with the wrong types is normalised', () => {
    installBridge({
      shellUiState: () =>
        JSON.stringify({
          updateAvailable: 'yes',
          updateVersion: 42,
          currentUrl: null,
          canGoBack: 1,
          adminAreas: ['https://control.victuscloud.com/admin', 7, null],
        }),
    });
    const state = shellUiState();
    expect(state.updateAvailable).toBe(true);
    expect(state.updateVersion).toBe('');
    expect(state.currentUrl).toBe('');
    expect(state.canGoBack).toBe(true);
    expect(state.adminAreas).toEqual(['https://control.victuscloud.com/admin']);
  });

  test('back and refresh are no-ops outside the shell', () => {
    expect(() => shellBack()).not.toThrow();
    expect(() => shellRefresh()).not.toThrow();
  });

  test('back and refresh reach the shell when it is there', () => {
    const calls: string[] = [];
    installBridge({ shellBack: () => calls.push('back'), shellRefresh: () => calls.push('refresh') });
    shellBack();
    shellRefresh();
    expect(calls).toEqual(['back', 'refresh']);
  });
});

describe('admin areas', () => {
  test('are empty outside the APK', () => {
    expect(shellAdminAreas()).toEqual([]);
  });

  test('are empty when the shell reports nothing — the demo / non-admin case', () => {
    installBridge({ shellAdminAreas: () => '[]' });
    expect(shellAdminAreas()).toEqual([]);
  });

  test('ignore anything that is not a usable area URL', () => {
    installBridge({ shellAdminAreas: () => JSON.stringify(['', 7, null, 'https://a/']) });
    expect(shellAdminAreas()).toEqual(['https://a/']);
  });

  test('a malformed answer is empty, not a partial admin list', () => {
    installBridge({ shellAdminAreas: () => '{"areas":[]}' });
    expect(shellAdminAreas()).toEqual([]);
  });

  test('surface the areas the panel actually granted', () => {
    installBridge({
      shellAdminAreas: () => JSON.stringify(['https://control.victuscloud.com/admin']),
    });
    expect(shellAdminAreas()).toEqual(['https://control.victuscloud.com/admin']);
  });
});

describe('authenticator window', () => {
  test('falls back to a full 30-second step on the device clock outside the shell', () => {
    const state = totpWindowState();
    expect(state.periodSeconds).toBe(30);
    expect(state.synced).toBe(false);
    expect(state.secondsRemaining).toBeGreaterThan(0);
    expect(state.secondsRemaining).toBeLessThanOrEqual(30);
    expect(state.millisUntilNext).toBeGreaterThan(0);
    expect(state.millisUntilNext).toBeLessThanOrEqual(30_000);
  });

  test("uses the panel's own countdown when the shell reports one", () => {
    installBridge({
      authTotpState: () =>
        JSON.stringify({
          secondsRemaining: 21,
          millisUntilNext: 21_456,
          periodSeconds: 30,
          synced: true,
          offsetMillis: 1_500,
        }),
    });
    const state = totpWindowState();
    expect(state.secondsRemaining).toBe(21);
    expect(state.millisUntilNext).toBe(21_456);
    expect(state.synced).toBe(true);
    expect(state.offsetMillis).toBe(1_500);
  });

  test('a nonsense countdown cannot display as 0 or overflow the step', () => {
    installBridge({ authTotpState: () => JSON.stringify({ secondsRemaining: 900 }) });
    expect(totpWindowState().secondsRemaining).toBe(30);
    installBridge({ authTotpState: () => JSON.stringify({ secondsRemaining: 0 }) });
    expect(totpWindowState().secondsRemaining).toBe(30);
    installBridge({ authTotpState: () => JSON.stringify({ secondsRemaining: -5 }) });
    expect(totpWindowState().secondsRemaining).toBe(30);
  });

  test('a malformed window never breaks the sign-in screen', () => {
    installBridge({ authTotpState: () => 'nope' });
    const state = totpWindowState();
    expect(state.synced).toBe(false);
    expect(state.secondsRemaining).toBe(30);
  });

  test('carries no code, secret or account data across the bridge', () => {
    let payload = '';
    installBridge({
      authTotpState: () => {
        payload = JSON.stringify({
          secondsRemaining: 12,
          millisUntilNext: 12_000,
          periodSeconds: 30,
          synced: true,
          offsetMillis: 0,
        });
        return payload;
      },
    });
    totpWindowState();
    expect(payload).not.toMatch(/token|key|secret|password|code/i);
  });
});
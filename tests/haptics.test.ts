import './dom-shim.ts';
import { afterEach, describe, expect, test } from 'bun:test';
import { haptic } from '../src/utils/haptics.ts';

/**
 * Tap feedback.
 *
 * The native shell used to fire KEYBOARD_TAP from the dock chips and the Tools
 * menu rows. Those views went away with the native chrome, so the feedback comes
 * from the WebView's own `navigator.vibrate` now — and the contract that matters
 * is the one about failure: haptics are a nicety, so every device that cannot do
 * it must end in silence rather than in an error or a stall.
 */

interface MutableNavigator extends Navigator {
  vibrate?: (pattern: number | number[]) => boolean;
}

const nav = navigator as MutableNavigator;
const originalVibrate = nav.vibrate;

afterEach(() => {
  if (originalVibrate) nav.vibrate = originalVibrate;
  else delete nav.vibrate;
});

describe('haptic', () => {
  test('asks for a short tick on a device that supports it', () => {
    const calls: number[] = [];
    nav.vibrate = (pattern) => {
      calls.push(pattern as number);
      return true;
    };
    haptic();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeGreaterThan(0);
    expect(calls[0]).toBeLessThanOrEqual(30);
  });

  test('a navigation-level tap is distinct from a row tap, but still tiny', () => {
    const calls: number[] = [];
    nav.vibrate = (pattern) => {
      calls.push(pattern as number);
      return true;
    };
    haptic('tap');
    haptic('commit');
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBeGreaterThan(calls[0]);
    expect(calls[1]).toBeLessThanOrEqual(30);
  });

  test('is silent on a browser with no vibration API', () => {
    delete nav.vibrate;
    expect(() => haptic()).not.toThrow();
  });

  test('is silent when the platform refuses', () => {
    nav.vibrate = () => {
      throw new Error('no vibrator');
    };
    expect(() => haptic()).not.toThrow();
  });

  test('is silent when the platform reports failure rather than throwing', () => {
    nav.vibrate = () => false;
    expect(() => haptic('commit')).not.toThrow();
  });
});
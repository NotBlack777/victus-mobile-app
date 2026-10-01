/**
 * haptics.ts — a short tap on the actions that deserve one.
 *
 * The native shell used to fire `HapticFeedbackConstants.KEYBOARD_TAP` from the
 * dock chips and the Tools menu rows. Those views are gone now that the single web
 * menu owns both, so the feedback has to come from here instead — otherwise
 * removing the native chrome would quietly have taken a feature with it.
 *
 * `navigator.vibrate()` is the WebView's route to the same vibrator, and needs
 * `android.permission.VIBRATE` (declared in the manifest; a normal permission, so
 * nothing is ever prompted for).
 *
 * Everything here is defensive and silent. Haptics are a nicety: a device with no
 * vibrator, a browser that does not implement the API, a user who turned the
 * system's touch feedback off, or a thrown call must all end in "no buzz", never
 * in an error. Nothing blocks or waits on it.
 */

/** A light tick, matching the KEYBOARD_TAP feel the native menu used. */
const TAP_MS = 8;

/** A slightly firmer tick for a navigation that changes the whole screen. */
const COMMIT_MS = 14;

export type HapticStyle = 'tap' | 'commit';

function buzz(ms: number): void {
  if (typeof navigator === 'undefined') return;
  // Respect the system's own touch-feedback setting rather than overriding it.
  if (
    typeof navigator.vibrate !== 'function' ||
    // The WebView exposes this only on Android; elsewhere it is simply absent.
    !('vibrate' in navigator)
  ) {
    return;
  }
  try {
    navigator.vibrate(ms);
  } catch {
    // A device with no vibrator, or a browser that refuses. Never a problem.
  }
}

/** Fire-and-forget tap feedback. Safe to call from any event handler. */
export function haptic(style: HapticStyle = 'tap'): void {
  buzz(style === 'commit' ? COMMIT_MS : TAP_MS);
}
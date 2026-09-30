/**
 * backdrop.ts
 *
 * The animated backdrop's layer definitions, kept free of React so the numbers
 * that decide whether the background is *visible* can be unit-tested directly.
 *
 * These values were rewritten after the backdrop shipped in a state where every
 * keyframe was running perfectly and nobody could see it: the colour fields were
 * small, mostly parked off-screen, and translucent enough to move the average
 * pixel by 0.85/255. An animation nobody can see is the same as no animation,
 * so the opacity and size here are treated as behaviour, not as taste.
 */

import { BackgroundStyle } from '../types.ts';

export const KNOWN_STYLES_FIELD: BackgroundStyle[] = ['aurora', 'mesh', 'starfield', 'none'];

/** One absolutely-positioned layer of the backdrop. */
export interface BackdropLayer {
  className: string;
  background: string;
  backgroundSize?: string;
}

/**
 * A soft light field. The multi-stop falloff gives a round, bloomy core that
 * fades out well before the element edge, so no hard circular border is ever
 * visible and no `filter: blur()` is needed — blurring large areas is
 * disproportionately expensive on mobile GPUs.
 */
export const field = (rgb: string, strength: number): string =>
  `radial-gradient(circle at 50% 50%, rgba(${rgb}, ${strength}) 0%, ` +
  `rgba(${rgb}, ${(strength * 0.62).toFixed(3)}) 26%, ` +
  `rgba(${rgb}, ${(strength * 0.26).toFixed(3)}) 48%, ` +
  `rgba(${rgb}, ${(strength * 0.08).toFixed(3)}) 66%, transparent 78%)`;

/**
 * The DOM layers for a style, given the two accent colours as "r, g, b".
 *
 * Starfield returns nothing on purpose: it is painted onto a canvas by an
 * effect rather than by markup. "Off" returns nothing because it renders no
 * backdrop at all.
 */
export function resolveBackdropLayer(
  style: BackgroundStyle,
  rgbA: string,
  rgbB: string
): BackdropLayer[] {
  if (style === 'aurora') {
    return [
      { className: 'bgfx-blob bgfx-blob-1', background: field(rgbA, 0.62) },
      { className: 'bgfx-blob bgfx-blob-2', background: field(rgbB, 0.5) },
      { className: 'bgfx-blob bgfx-blob-3', background: field(rgbA, 0.34) },
    ];
  }

  if (style === 'mesh') {
    return [
      {
        // A 44px major grid over an 11px minor one: the fine lattice gives the
        // grid body, the coarse one gives it structure as it scrolls.
        className: 'bgfx-mesh',
        background:
          `linear-gradient(rgba(${rgbA}, 0.42) 1px, transparent 1px), ` +
          `linear-gradient(90deg, rgba(${rgbA}, 0.42) 1px, transparent 1px), ` +
          `linear-gradient(rgba(${rgbB}, 0.16) 1px, transparent 1px), ` +
          `linear-gradient(90deg, rgba(${rgbB}, 0.16) 1px, transparent 1px)`,
        backgroundSize: '44px 44px, 44px 44px, 11px 11px, 11px 11px',
      },
      {
        // A highlight travelling down the lattice, so the mesh reads as
        // "scanning" rather than as a texture that merely scrolls.
        className: 'bgfx-mesh-sweep',
        background:
          `linear-gradient(180deg, transparent, rgba(${rgbA}, 0.3) 42%, rgba(${rgbB}, 0.45) 52%, transparent)`,
      },
      {
        className: 'bgfx-mesh-glow',
        background:
          `linear-gradient(180deg, rgba(${rgbB}, 0.34), transparent 58%), ` +
          `linear-gradient(0deg, rgba(${rgbA}, 0.18), transparent 48%)`,
      },
    ];
  }

  return [];
}

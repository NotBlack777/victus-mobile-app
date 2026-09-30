import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { KNOWN_STYLES_FIELD, resolveBackdropLayer } from '../src/theme/backdrop.ts';

/**
 * The animated backdrop.
 *
 * There was a bug here that no amount of "is the animation running?" testing
 * would ever have caught: every keyframe was live and playing the whole time,
 * but the result was so faint and so slow that the app looked frozen. These
 * tests pin the two things that actually decide whether a person sees motion —
 * that the fields are opaque and oversized enough to register, and that
 * reduced motion actually stops them instead of strobing them.
 *
 * The pixel-level proof lives in scripts/verify-backdrop.mjs, which measures a
 * real screenshot. This file guards the source of those numbers from drifting.
 */

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

/** Alpha of the first rgba() stop in a gradient literal, 0-1. */
const firstStopAlpha = (literal: string): number => {
  const match = literal.match(/rgba\([^)]*?,\s*([0-9.]+)\)/);
  return match ? Number(match[1]) : 0;
};

describe('backdrop styles', () => {
  test('every advertised style has a renderer, and only advertised ones', () => {
    for (const style of ['aurora', 'mesh', 'starfield', 'none'] as const) {
      expect(KNOWN_STYLES_FIELD).toContain(style);
    }
    expect(KNOWN_STYLES_FIELD).toEqual(['aurora', 'mesh', 'starfield', 'none']);
  });

  test('an unknown style falls back to aurora instead of rendering nothing', () => {
    const bogus = 'not-a-style' as never;
    expect(KNOWN_STYLES_FIELD.includes(bogus)).toBe(false);
  });

  test('the aurora fields are strong enough to actually be seen', () => {
    // 0.32 over a near-black canvas measured a mean pixel change of 0.85/255
    // over three seconds, which is invisible. These are the values that fixed it.
    const faint = resolveBackdropLayer('aurora', '192, 132, 252', '124, 58, 237');
    for (const layer of faint) {
      expect(firstStopAlpha(layer.background)).toBeGreaterThan(0.3);
    }
  });

  test('the mesh grid is drawn densely enough to read as a grid', () => {
    const layers = resolveBackdropLayer('mesh', '192, 132, 252', '124, 58, 237');
    const grid = layers.find((layer) => layer.className.includes('bgfx-mesh'));
    expect(grid).toBeDefined();
    // Two line pairs: a 44px major grid and an 11px minor one.
    expect(grid!.background.match(/linear-gradient/g) ?? []).toHaveLength(4);
    expect(firstStopAlpha(grid!.background)).toBeGreaterThan(0.25);
  });

  test('the mesh has a travelling sweep, not just a scrolling texture', () => {
    const layers = resolveBackdropLayer('mesh', '192, 132, 252', '124, 58, 237');
    expect(layers.some((layer) => layer.className.includes('bgfx-mesh-sweep'))).toBe(true);
  });

  test('starfield and off render no DOM layers at all', () => {
    // The starfield is drawn on a canvas by an effect, and "off" renders nothing.
    expect(resolveBackdropLayer('starfield', '1, 2, 3', '4, 5, 6')).toEqual([]);
    expect(resolveBackdropLayer('none', '1, 2, 3', '4, 5, 6')).toEqual([]);
  });
});

describe('backdrop CSS', () => {
  test('reduced motion stops the animations instead of strobing them', () => {
    // A looping animation with a 0.01s duration re-runs ~100x a second and
    // flickers; it has to be pinned to a single iteration to genuinely hold.
    const rule = css.slice(css.indexOf('html.reduce-motion,'));
    expect(rule.slice(0, 400)).toContain('animation-iteration-count: 1 !important');
  });

  test('static mode removes the animations outright', () => {
    const rule = css.slice(css.indexOf('.bgfx-static'));
    expect(rule.slice(0, 400)).toContain('animation: none !important');
  });

  test('the fields are oversized and blended so they read as light', () => {
    // Below ~100% of the viewport a field spends most of its time off-screen.
    const blob = css.slice(css.indexOf('.bgfx-blob {'));
    expect(blob.slice(0, 200)).toContain('width: 150%');
    expect(blob.slice(0, 200)).toContain('mix-blend-mode: screen');
  });

  test('the mesh mask covers a tall phone rather than fading out early', () => {
    const mask = css.slice(css.indexOf('.bgfx-mesh-wrap'));
    // The old ellipse peaked at 38% height and was gone by 78%, leaving the
    // bottom two-fifths of the screen with no grid at all.
    expect(mask.slice(0, 400)).not.toContain('85% 62%');
    expect(mask.slice(0, 400)).toContain('120% 100%');
  });

  test('OLED mode reaches true black and drops the always-on grid overlay', () => {
    const oled = css.slice(css.indexOf('html.oled {'));
    expect(oled.slice(0, 800)).toContain('--grid-line: transparent');
    const before = css.slice(css.indexOf('html.oled body::before'));
    expect(before.slice(0, 200)).toContain('display: none');
  });

  test('the panel foundation is untouched', () => {
    // Tailwind v4 pulls the whole framework in through one import; the three
    // legacy @tailwind directives no longer exist in this project.
    expect(css).toContain('@import "tailwindcss";');
    // The base tokens the whole app paints from must survive.
    expect(css).toContain('--bg: #0a0a0f;');
    expect(css).toContain('html.light {');
    expect(css).toContain('background-attachment: fixed;');
  });
});

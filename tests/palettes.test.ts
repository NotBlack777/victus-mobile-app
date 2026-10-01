import { describe, expect, test } from 'bun:test';
import {
  BACKGROUND_OPTIONS,
  BASE_DARK,
  BASE_LIGHT,
  CSS_VAR_NAMES,
  PANEL_OPTIONS,
  PRESETS,
  THEME_PRESET_OPTIONS,
  TOKEN_KEYS,
  hexToRgb,
  resolveAccents,
  resolveTokens,
  type Tokens,
} from '../src/theme/palettes.ts';

/**
 * These are the literal values the pre-refactor ThemeContext wrote to the DOM
 * for each preset. They are pinned here so the move to a shared token table
 * cannot silently change how the existing themes look.
 */
const EXPECTED_DARK: Record<'purple_black' | 'blue_teal', Omit<Tokens, 'bgImage'>> = {
  purple_black: {
    bg: '#0a0a0f',
    surfaceTopbar: 'rgba(12, 12, 18, 0.95)',
    sheetBg: '#111117',
    sheetStroke: 'rgba(255, 255, 255, 0.08)',
    divider: 'rgba(255, 255, 255, 0.08)',
    chipBg: 'rgba(255, 255, 255, 0.04)',
    chipStroke: 'rgba(255, 255, 255, 0.08)',
    chipText: '#cbd5e1',
    panel: '#14141c',
    panelStrong: '#171722',
    line: 'rgba(255, 255, 255, 0.08)',
    lineSoft: 'rgba(255, 255, 255, 0.06)',
    text: '#ffffff',
    titleText: '#ffffff',
    muted: '#94a3b8',
    faint: '#64748b',
    eyebrow: '#a78bfa',
    arrowText: '#a78bfa',
    arrowBg: 'rgba(139, 92, 246, 0.15)',
  },
  blue_teal: {
    bg: '#040914',
    surfaceTopbar: 'rgba(7, 18, 38, 0.95)',
    sheetBg: '#09172e',
    sheetStroke: 'rgba(14, 165, 233, 0.22)',
    divider: 'rgba(14, 165, 233, 0.18)',
    chipBg: 'rgba(255, 255, 255, 0.06)',
    chipStroke: 'rgba(56, 189, 248, 0.24)',
    chipText: '#e0f2fe',
    panel: '#091830',
    panelStrong: '#0d2242',
    line: 'rgba(14, 165, 233, 0.22)',
    lineSoft: 'rgba(255, 255, 255, 0.08)',
    text: '#ffffff',
    titleText: '#ffffff',
    muted: '#94a3b8',
    faint: '#64748b',
    eyebrow: '#38bdf8',
    arrowText: '#7dd3fc',
    arrowBg: 'rgba(14, 165, 233, 0.18)',
  },
};

const EXPECTED_LIGHT: Record<'purple_black' | 'blue_teal', Omit<Tokens, 'bgImage'>> = {
  purple_black: {
    bg: '#f8fafc',
    surfaceTopbar: 'rgba(255, 255, 255, 0.95)',
    sheetBg: '#ffffff',
    sheetStroke: 'rgba(124, 58, 237, 0.15)',
    divider: 'rgba(15, 23, 42, 0.08)',
    chipBg: 'rgba(15, 23, 42, 0.05)',
    chipStroke: 'rgba(15, 23, 42, 0.1)',
    chipText: '#1e293b',
    panel: '#ffffff',
    panelStrong: '#f8fafc',
    line: 'rgba(15, 23, 42, 0.08)',
    lineSoft: 'rgba(15, 23, 42, 0.05)',
    text: '#0f172a',
    titleText: '#0f172a',
    muted: '#475569',
    faint: '#94a3b8',
    eyebrow: '#7c3aed',
    arrowText: '#7c3aed',
    arrowBg: 'rgba(124, 58, 237, 0.12)',
  },
  blue_teal: {
    bg: '#f0f7ff',
    surfaceTopbar: 'rgba(255, 255, 255, 0.95)',
    sheetBg: '#ffffff',
    sheetStroke: 'rgba(14, 165, 233, 0.15)',
    divider: 'rgba(14, 165, 233, 0.12)',
    chipBg: 'rgba(2, 132, 199, 0.08)',
    chipStroke: 'rgba(2, 132, 199, 0.18)',
    chipText: '#032c57',
    panel: '#ffffff',
    panelStrong: '#f1f8fe',
    line: 'rgba(2, 132, 199, 0.15)',
    lineSoft: 'rgba(3, 44, 87, 0.08)',
    text: '#032c57',
    titleText: '#032c57',
    muted: '#475569',
    faint: '#94a3b8',
    eyebrow: '#0284c7',
    arrowText: '#0284c7',
    arrowBg: 'rgba(14, 165, 233, 0.12)',
  },
};

const stripBgImage = (tokens: Tokens): Omit<Tokens, 'bgImage'> => {
  const { bgImage: _bgImage, ...rest } = tokens;
  return rest;
};

/** Alpha channel of an `rgba(...)` token, or -1 when it is a solid colour. */
const parseAlpha = (value: string): number => {
  const match = value.match(/rgba\([^)]*?,\s*([0-9.]+)\s*\)$/);
  return match ? Number(match[1]) : -1;
};

describe('theme palettes', () => {
  test('Purple → Black resolves to its original dark values', () => {
    const tokens = resolveTokens('purple_black', true, ['#c084fc', '#7c3aed', '#0a0a0f']);
    expect(stripBgImage(tokens)).toEqual(EXPECTED_DARK.purple_black);
    expect(tokens.bgImage).toContain('radial-gradient(circle at 10% 5%');
  });

  test('Purple → Black resolves to its original light values', () => {
    const tokens = resolveTokens('purple_black', false, ['#c084fc', '#7c3aed', '#0a0a0f']);
    expect(stripBgImage(tokens)).toEqual(EXPECTED_LIGHT.purple_black);
  });

  test('Blue → Teal resolves to its original dark values', () => {
    const tokens = resolveTokens('blue_teal', true, ['#0284c7', '#06b6d4', '#14b8a6']);
    expect(stripBgImage(tokens)).toEqual(EXPECTED_DARK.blue_teal);
    expect(tokens.bgImage).toContain('linear-gradient(180deg, #040914');
  });

  test('Blue → Teal resolves to its original light values', () => {
    const tokens = resolveTokens('blue_teal', false, ['#0284c7', '#06b6d4', '#14b8a6']);
    expect(stripBgImage(tokens)).toEqual(EXPECTED_LIGHT.blue_teal);
  });

  test('custom presets derive their accents and keep their original surfaces', () => {
    const dark = resolveTokens('custom', true, ['#2f81ff', '#13c8a6', '#13c8a6']);
    const rgb = hexToRgb('#2f81ff');
    expect(dark.bg).toBe('#07090e');
    expect(dark.sheetStroke).toBe(`rgba(${rgb}, 0.25)`);
    expect(dark.line).toBe(`rgba(${rgb}, 0.22)`);
    expect(dark.eyebrow).toBe('#2f81ff');
    expect(dark.bgImage).toContain(`rgba(${rgb}, 0.2)`);

    const light = resolveTokens('custom', false, ['#2f81ff', '#13c8a6', '#13c8a6']);
    // A one-colour "solid" custom theme is expressed as a three-stop triple.
    expect(light.sheetStroke).toBe('rgba(15, 23, 42, 0.1)');
    expect(light.lineSoft).toBe('rgba(15, 23, 42, 0.06)');
    expect(light.arrowBg).toBe(`rgba(${rgb}, 0.12)`);
  });

  test('every preset fills in all tokens for both colour modes', () => {
    expect(TOKEN_KEYS.length).toBe(20);
    expect(TOKEN_KEYS.length).toBe(Object.keys(CSS_VAR_NAMES).length);

    for (const preset of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
      for (const isDark of [true, false]) {
        const tokens = resolveTokens(preset, isDark, PRESETS[preset].accents);
        for (const key of TOKEN_KEYS) {
          expect(typeof tokens[key]).toBe('string');
          expect(tokens[key].length).toBeGreaterThan(0);
        }
      }
    }
  });

  test('every preset declares a distinct accent triple and a picker entry', () => {
    const pickerIds = THEME_PRESET_OPTIONS.map((option) => option.id);
    for (const preset of Object.keys(PRESETS)) {
      expect(pickerIds).toContain(preset);
      const definition = PRESETS[preset as keyof typeof PRESETS];
      expect(new Set(definition.accents).size).toBeGreaterThan(1);
    }
    // Custom is not a fixed preset but is still offered in the picker.
    expect(new Set(pickerIds).size).toBe(pickerIds.length);
  });

  test('Purple → Black is exactly the shared base with no overrides', () => {
    // The base tables *are* this preset, which is what lets every other theme
    // declare only its differences.
    expect(resolveTokens('purple_black', true, PRESETS.purple_black.accents)).toEqual(BASE_DARK);
    expect(resolveTokens('purple_black', false, PRESETS.purple_black.accents)).toEqual(BASE_LIGHT);
    expect(PRESETS.purple_black.dark).toEqual({});
    expect(PRESETS.purple_black.light).toEqual({});
  });

  test('solid custom palettes collapse to a single accent', () => {
    expect(resolveAccents('custom', '#ff0000', '#00ff00', true)).toEqual(['#ff0000', '#ff0000', '#ff0000']);
    expect(resolveAccents('custom', '#ff0000', '#00ff00', false)).toEqual(['#ff0000', '#00ff00', '#00ff00']);
    expect(resolveAccents('node_emerald', '#ff0000', '#00ff00', false)).toEqual(
      PRESETS.node_emerald.accents
    );
  });

  test('hexToRgb normalises short and malformed input', () => {
    expect(hexToRgb('#7c3aed')).toBe('124, 58, 237');
    expect(hexToRgb('#fff')).toBe('255, 255, 255');
    expect(hexToRgb('not-a-colour')).toBe('139, 92, 246');
  });

  test('background options are exactly the supported styles', () => {
    expect(BACKGROUND_OPTIONS.map((option) => option.id)).toEqual([
      'aurora',
      'mesh',
      'starfield',
      'none',
    ]);
  });
});

describe('OLED display panel', () => {
  test('the standard panel is the default and leaves every token untouched', () => {
    // resolveTokens must stay backward compatible: three arguments means the
    // standard (LCD) panel, and the pinned theme values must not move.
    expect(resolveTokens('purple_black', true, PRESETS.purple_black.accents)).toEqual(BASE_DARK);
    expect(resolveTokens('purple_black', true, PRESETS.purple_black.accents, 'lcd')).toEqual(
      BASE_DARK
    );
  });

  test('OLED drives the canvas to true black', () => {
    const tokens = resolveTokens('purple_black', true, PRESETS.purple_black.accents, 'oled');
    expect(tokens.bg).toBe('#000000');
    expect(tokens.bgImage).not.toContain('linear-gradient(180deg');
  });

  test('OLED keeps every layer readable without a grey wash', () => {
    const oled = resolveTokens('blue_teal', true, PRESETS.blue_teal.accents, 'oled');
    // Surfaces stay translucent so the animated backdrop still shows through.
    expect(oled.panel).toContain('rgba(');
    expect(oled.panelStrong).toContain('rgba(');
    // Separation comes from borders and text contrast, not from lifting grey.
    expect(oled.text).toBe('#ffffff');
    expect(oled.titleText).toBe('#ffffff');
    expect(parseAlpha(oled.divider)).toBeGreaterThan(parseAlpha(BASE_DARK.divider));
    expect(parseAlpha(oled.lineSoft)).toBeGreaterThan(parseAlpha(BASE_DARK.lineSoft));
  });

  test('OLED accents come from the active theme, so every preset gets one', () => {
    for (const preset of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
      const accents = PRESETS[preset].accents;
      const oled = resolveTokens(preset, true, accents, 'oled');
      expect(oled.line).toContain(hexToRgb(accents[0]));
      expect(oled.arrowText).toBe(accents[0]);
    }
  });

  test('OLED covers custom palettes too', () => {
    const oled = resolveTokens('custom', true, ['#2f81ff', '#13c8a6', '#13c8a6'], 'oled');
    expect(oled.bg).toBe('#000000');
    expect(oled.line).toBe(`rgba(${hexToRgb('#2f81ff')}, 0.34)`);
  });

  test('OLED is inert in light mode, where true black would be wrong', () => {
    const light = resolveTokens('purple_black', false, PRESETS.purple_black.accents, 'oled');
    expect(light).toEqual(BASE_LIGHT);
  });

  test('the picker offers both panels and nothing else', () => {
    expect(PANEL_OPTIONS.map((option) => option.id)).toEqual(['oled', 'lcd']);
    for (const option of PANEL_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.hint.length).toBeGreaterThan(0);
    }
  });
});

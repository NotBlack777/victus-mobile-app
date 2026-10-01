/**
 * palettes.ts
 *
 * Theme token definitions, kept free of React so the colour maths and the
 * preset table can be unit-tested directly.
 *
 * Every preset paints the same set of CSS custom properties. Rather than a
 * chain of near-identical branches, each preset declares only the values that
 * differ from the shared dark/light base, which keeps a new theme a handful of
 * lines instead of a copy-pasted block.
 */

import { ThemePreset, BackgroundStyle, DisplayPanel } from '../types.ts';

export type Tokens = {
  bg: string;
  surfaceTopbar: string;
  sheetBg: string;
  sheetStroke: string;
  divider: string;
  chipBg: string;
  chipStroke: string;
  chipText: string;
  panel: string;
  panelStrong: string;
  line: string;
  lineSoft: string;
  text: string;
  titleText: string;
  muted: string;
  faint: string;
  eyebrow: string;
  arrowText: string;
  arrowBg: string;
  bgImage: string;
};

/** CSS custom property each token is written to. */
export const CSS_VAR_NAMES: Record<keyof Tokens, string> = {
  bg: '--bg',
  surfaceTopbar: '--surface-topbar',
  sheetBg: '--sheet-bg',
  sheetStroke: '--sheet-stroke',
  divider: '--divider',
  chipBg: '--chip-bg',
  chipStroke: '--chip-stroke',
  chipText: '--chip-text',
  panel: '--panel',
  panelStrong: '--panel-strong',
  line: '--line',
  lineSoft: '--line-soft',
  text: '--text',
  titleText: '--title-text',
  muted: '--muted',
  faint: '--faint',
  eyebrow: '--eyebrow',
  arrowText: '--arrow-text',
  arrowBg: '--arrow-bg',
  bgImage: '--bg-image',
};

export const TOKEN_KEYS = Object.keys(CSS_VAR_NAMES) as (keyof Tokens)[];

// Default Purple -> Black preset (aligned with control.victuscloud.com)
export const DEFAULT_A = '#c084fc';
export const DEFAULT_B = '#7c3aed';
export const DEFAULT_C = '#0a0a0f';

// Pure Blue -> Teal preset
export const BLUE_TEAL_A = '#0284c7';
export const BLUE_TEAL_B = '#06b6d4';
export const BLUE_TEAL_C = '#14b8a6';

export function hexToRgb(hex: string): string {
  let c = hex.replace('#', '').trim();
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('');
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) return '139, 92, 246';
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `${r}, ${g}, ${b}`;
}

/** Values shared by every dark preset (the Purple → Black palette). */
export const BASE_DARK: Tokens = {
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
  bgImage:
    'radial-gradient(circle at 10% 5%, rgba(139, 92, 246, 0.15), transparent 25rem), radial-gradient(circle at 95% 15%, rgba(124, 58, 237, 0.12), transparent 22rem), linear-gradient(180deg, #0a0a0f, #0d0d14 48%, #08080c)',
};

/** Values shared by every light preset (the Purple → Black palette). */
export const BASE_LIGHT: Tokens = {
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
  bgImage:
    'radial-gradient(circle at 8% 2%, rgba(139, 92, 246, 0.08), transparent 23rem), radial-gradient(circle at 100% 18%, rgba(124, 58, 237, 0.06), transparent 22rem), linear-gradient(180deg, #f8fafc, #f1f5f9 48%, #e2e8f0)',
};

export interface PresetDefinition {
  /** Accent triple: gradient start, gradient end, deep background anchor. */
  accents: [string, string, string];
  dark: Partial<Tokens>;
  light: Partial<Tokens>;
}

export const PRESETS: Record<Exclude<ThemePreset, 'custom'>, PresetDefinition> = {
  // Purple → Black — mirrors the production control panel at
  // control.victuscloud.com. It is the shared base, so it declares no overrides.
  purple_black: {
    accents: [DEFAULT_A, DEFAULT_B, DEFAULT_C],
    dark: {},
    light: {},
  },

  // Blue → Teal
  blue_teal: {
    accents: [BLUE_TEAL_A, BLUE_TEAL_B, BLUE_TEAL_C],
    dark: {
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
      eyebrow: '#38bdf8',
      arrowText: '#7dd3fc',
      arrowBg: 'rgba(14, 165, 233, 0.18)',
      bgImage:
        'radial-gradient(circle at 8% 2%, rgba(2, 132, 199, 0.24), transparent 23rem), radial-gradient(circle at 100% 18%, rgba(20, 184, 166, 0.18), transparent 22rem), linear-gradient(180deg, #040914, #071529 48%, #020817)',
    },
    light: {
      bg: '#f0f7ff',
      sheetStroke: 'rgba(14, 165, 233, 0.15)',
      divider: 'rgba(14, 165, 233, 0.12)',
      chipBg: 'rgba(2, 132, 199, 0.08)',
      chipStroke: 'rgba(2, 132, 199, 0.18)',
      chipText: '#032c57',
      panelStrong: '#f1f8fe',
      line: 'rgba(2, 132, 199, 0.15)',
      lineSoft: 'rgba(3, 44, 87, 0.08)',
      text: '#032c57',
      titleText: '#032c57',
      eyebrow: '#0284c7',
      arrowText: '#0284c7',
      arrowBg: 'rgba(14, 165, 233, 0.12)',
      bgImage:
        'radial-gradient(circle at 8% 2%, rgba(2, 132, 199, 0.1), transparent 23rem), radial-gradient(circle at 100% 18%, rgba(20, 184, 166, 0.08), transparent 22rem), linear-gradient(180deg, #f8fbff, #e9f3ff 48%, #f0f7ff)',
    },
  },

  // Emerald → Night — the colour the fleet already uses for ACTIVE instances,
  // so an all-green console reads as "everything is up".
  node_emerald: {
    accents: ['#34d399', '#10b981', '#04120d'],
    dark: {
      bg: '#04120d',
      surfaceTopbar: 'rgba(6, 24, 18, 0.95)',
      sheetBg: '#08180f',
      sheetStroke: 'rgba(16, 185, 129, 0.22)',
      divider: 'rgba(16, 185, 129, 0.16)',
      chipBg: 'rgba(255, 255, 255, 0.05)',
      chipStroke: 'rgba(52, 211, 153, 0.24)',
      chipText: '#d1fae5',
      panel: '#0a1a12',
      panelStrong: '#0d2218',
      line: 'rgba(16, 185, 129, 0.2)',
      lineSoft: 'rgba(255, 255, 255, 0.07)',
      eyebrow: '#34d399',
      arrowText: '#6ee7b7',
      arrowBg: 'rgba(16, 185, 129, 0.18)',
      bgImage:
        'radial-gradient(circle at 8% 2%, rgba(16, 185, 129, 0.2), transparent 23rem), radial-gradient(circle at 100% 18%, rgba(52, 211, 153, 0.14), transparent 22rem), linear-gradient(180deg, #04120d, #061c13 48%, #020c08)',
    },
    light: {
      bg: '#f2fdf8',
      sheetStroke: 'rgba(16, 185, 129, 0.16)',
      divider: 'rgba(6, 78, 59, 0.1)',
      chipBg: 'rgba(16, 185, 129, 0.08)',
      chipStroke: 'rgba(5, 150, 105, 0.2)',
      chipText: '#064e3b',
      panelStrong: '#f0fdf4',
      line: 'rgba(5, 150, 105, 0.16)',
      lineSoft: 'rgba(6, 78, 59, 0.07)',
      text: '#064e3b',
      titleText: '#064e3b',
      eyebrow: '#059669',
      arrowText: '#059669',
      arrowBg: 'rgba(16, 185, 129, 0.14)',
      bgImage:
        'radial-gradient(circle at 8% 2%, rgba(16, 185, 129, 0.12), transparent 23rem), radial-gradient(circle at 100% 18%, rgba(20, 184, 166, 0.08), transparent 22rem), linear-gradient(180deg, #f7fffb, #e9fdf3 48%, #f2fdf8)',
    },
  },

  // Ember → Night — warm counterpart for late-night consoles.
  victus_ember: {
    accents: ['#fb923c', '#f97316', '#170a03'],
    dark: {
      bg: '#170a03',
      surfaceTopbar: 'rgba(28, 13, 6, 0.95)',
      sheetBg: '#1e0f06',
      sheetStroke: 'rgba(249, 115, 22, 0.22)',
      divider: 'rgba(249, 115, 22, 0.16)',
      chipBg: 'rgba(255, 255, 255, 0.05)',
      chipStroke: 'rgba(251, 146, 60, 0.24)',
      chipText: '#ffedd5',
      panel: '#201106',
      panelStrong: '#2a1709',
      line: 'rgba(249, 115, 22, 0.2)',
      lineSoft: 'rgba(255, 255, 255, 0.07)',
      eyebrow: '#fb923c',
      arrowText: '#fdba74',
      arrowBg: 'rgba(249, 115, 22, 0.18)',
      bgImage:
        'radial-gradient(circle at 8% 2%, rgba(249, 115, 22, 0.22), transparent 23rem), radial-gradient(circle at 100% 18%, rgba(236, 72, 153, 0.12), transparent 22rem), linear-gradient(180deg, #170a03, #200e05 48%, #0d0502)',
    },
    light: {
      bg: '#fff8f1',
      sheetStroke: 'rgba(249, 115, 22, 0.16)',
      divider: 'rgba(124, 45, 18, 0.1)',
      chipBg: 'rgba(249, 115, 22, 0.08)',
      chipStroke: 'rgba(234, 88, 12, 0.2)',
      chipText: '#7c2d12',
      panelStrong: '#fff7ed',
      line: 'rgba(234, 88, 12, 0.16)',
      lineSoft: 'rgba(124, 45, 18, 0.07)',
      text: '#7c2d12',
      titleText: '#7c2d12',
      muted: '#57534e',
      faint: '#a8a29e',
      eyebrow: '#ea580c',
      arrowText: '#ea580c',
      arrowBg: 'rgba(249, 115, 22, 0.14)',
      bgImage:
        'radial-gradient(circle at 8% 2%, rgba(251, 146, 60, 0.14), transparent 23rem), radial-gradient(circle at 100% 18%, rgba(236, 72, 153, 0.08), transparent 22rem), linear-gradient(180deg, #fffbf6, #fff1e6 48%, #fff8f1)',
    },
  },

  // Slate → Night — deliberately colourless for glare-free monitoring.
  mono_slate: {
    accents: ['#94a3b8', '#475569', '#0b0e13'],
    dark: {
      bg: '#0b0e13',
      surfaceTopbar: 'rgba(15, 19, 26, 0.95)',
      sheetBg: '#12161d',
      sheetStroke: 'rgba(148, 163, 184, 0.18)',
      divider: 'rgba(148, 163, 184, 0.14)',
      chipBg: 'rgba(255, 255, 255, 0.05)',
      chipStroke: 'rgba(148, 163, 184, 0.22)',
      chipText: '#e2e8f0',
      panel: '#141922',
      panelStrong: '#1a202b',
      line: 'rgba(148, 163, 184, 0.18)',
      lineSoft: 'rgba(255, 255, 255, 0.06)',
      eyebrow: '#cbd5e1',
      arrowText: '#cbd5e1',
      arrowBg: 'rgba(148, 163, 184, 0.16)',
      bgImage:
        'radial-gradient(circle at 12% 4%, rgba(148, 163, 184, 0.12), transparent 24rem), radial-gradient(circle at 92% 12%, rgba(100, 116, 139, 0.1), transparent 22rem), linear-gradient(180deg, #0b0e13, #101520 48%, #080a0e)',
    },
    light: {
      bg: '#f6f7f9',
      sheetStroke: 'rgba(100, 116, 139, 0.18)',
      divider: 'rgba(15, 23, 42, 0.1)',
      chipBg: 'rgba(15, 23, 42, 0.05)',
      chipStroke: 'rgba(100, 116, 139, 0.2)',
      chipText: '#1e293b',
      panelStrong: '#f1f5f9',
      line: 'rgba(100, 116, 139, 0.18)',
      lineSoft: 'rgba(15, 23, 42, 0.06)',
      eyebrow: '#475569',
      arrowText: '#475569',
      arrowBg: 'rgba(100, 116, 139, 0.14)',
      bgImage:
        'radial-gradient(circle at 10% 4%, rgba(148, 163, 184, 0.16), transparent 24rem), radial-gradient(circle at 90% 14%, rgba(100, 116, 139, 0.1), transparent 22rem), linear-gradient(180deg, #f8fafc, #eef2f7 48%, #f6f7f9)',
    },
  },
};

/** Custom palettes derive their borders and glows from the chosen colours. */
export function customTokens(isDark: boolean, accents: [string, string, string]): Tokens {
  const [c1, c2] = accents;
  const rgb1 = hexToRgb(c1);
  const rgb2 = hexToRgb(c2);

  if (isDark) {
    return {
      ...BASE_DARK,
      bg: '#07090e',
      surfaceTopbar: 'rgba(14, 17, 24, 0.95)',
      sheetBg: '#10131d',
      sheetStroke: `rgba(${rgb1}, 0.25)`,
      chipBg: 'rgba(255, 255, 255, 0.05)',
      chipStroke: `rgba(${rgb1}, 0.25)`,
      chipText: '#f1f5f9',
      panel: '#12141f',
      panelStrong: '#161928',
      line: `rgba(${rgb1}, 0.22)`,
      eyebrow: c1,
      arrowText: c1,
      arrowBg: `rgba(${rgb1}, 0.18)`,
      bgImage: `radial-gradient(circle at 8% 2%, rgba(${rgb1}, 0.2), transparent 23rem), radial-gradient(circle at 100% 18%, rgba(${rgb2}, 0.15), transparent 22rem), linear-gradient(180deg, #07090e, #0e121c 48%, #05060a)`,
    };
  }

  return {
    ...BASE_LIGHT,
    sheetStroke: 'rgba(15, 23, 42, 0.1)',
    line: 'rgba(15, 23, 42, 0.1)',
    lineSoft: 'rgba(15, 23, 42, 0.06)',
    chipText: '#0f172a',
    eyebrow: c1,
    arrowText: c1,
    arrowBg: `rgba(${rgb1}, 0.12)`,
    bgImage: `radial-gradient(circle at 8% 2%, rgba(${rgb1}, 0.1), transparent 23rem), radial-gradient(circle at 100% 18%, rgba(${rgb2}, 0.08), transparent 22rem), linear-gradient(180deg, #f8fafc, #f1f5f9 48%, #e2e8f0)`,
  };
}

/** Accent triple for a preset, honouring the "solid colour" custom option. */
export function resolveAccents(
  preset: ThemePreset,
  customA: string,
  customB: string,
  isCustomSolid: boolean
): [string, string, string] {
  if (preset === 'custom') {
    return isCustomSolid ? [customA, customA, customA] : [customA, customB, customB];
  }
  return PRESETS[preset].accents;
}

/** Full token set for the active preset and colour mode. */
export function resolveTokens(
  preset: ThemePreset,
  isDark: boolean,
  accents: [string, string, string],
  panel: DisplayPanel = 'lcd'
): Tokens {
  const base =
    preset === 'custom'
      ? customTokens(isDark, accents)
      : (() => {
          const definition = PRESETS[preset];
          return {
            ...(isDark ? BASE_DARK : BASE_LIGHT),
            ...(isDark ? definition.dark : definition.light),
          };
        })();

  // True black is a dark-panel concern; in light mode it would just be a
  // different off-white, so the standard tokens are kept.
  return isDark && panel === 'oled' ? oledTokens(base, accents) : base;
}

/**
 * True-black transform for OLED screens.
 *
 * Applied on top of whatever the preset already resolved, so every theme gets
 * an OLED variant for free instead of needing a second table. On an OLED panel a
 * lit near-black pixel still burns power, so the canvas drops to #000 and the
 * surfaces are lifted only as far as they must be to stay readable — the
 * separation between layers comes from borders and text contrast rather than
 * from a grey wash, which is what keeps the panel looking deep instead of flat.
 */
export function oledTokens(tokens: Tokens, accents: [string, string, string]): Tokens {
  const rgb1 = hexToRgb(accents[0]);
  const rgb2 = hexToRgb(accents[1]);
  return {
    ...tokens,
    bg: '#000000',
    surfaceTopbar: 'rgba(6, 6, 10, 0.94)',
    sheetBg: '#050507',
    divider: 'rgba(255, 255, 255, 0.14)',
    panel: 'rgba(255, 255, 255, 0.045)',
    panelStrong: 'rgba(255, 255, 255, 0.075)',
    line: `rgba(${rgb1}, 0.34)`,
    lineSoft: 'rgba(255, 255, 255, 0.12)',
    chipBg: 'rgba(255, 255, 255, 0.06)',
    chipStroke: `rgba(${rgb1}, 0.32)`,
    chipText: '#e6e6f0',
    text: '#ffffff',
    titleText: '#ffffff',
    muted: '#a8a8bd',
    faint: '#7a7a90',
    arrowText: accents[0],
    arrowBg: `rgba(${rgb1}, 0.2)`,
    bgImage: `radial-gradient(circle at 12% 4%, rgba(${rgb1}, 0.26), transparent 26rem), radial-gradient(circle at 92% 16%, rgba(${rgb2}, 0.2), transparent 24rem), radial-gradient(circle at 50% 108%, rgba(${rgb2}, 0.16), transparent 30rem)`,
  };
}

/** Picker metadata for the display-panel section, in display order. */
export interface PanelOption {
  id: DisplayPanel;
  label: string;
  hint: string;
}

export const PANEL_OPTIONS: PanelOption[] = [
  { id: 'oled', label: 'OLED', hint: 'True black, pixels switch off' },
  { id: 'lcd', label: 'Standard', hint: 'Soft dark greys, no smearing' },
];

/** Picker metadata for the Appearance sheet, in display order. */
export interface ThemePresetOption {
  id: ThemePreset;
  label: string;
  swatch: string;
  activeClass: string;
}

export const THEME_PRESET_OPTIONS: ThemePresetOption[] = [
  {
    id: 'purple_black',
    label: 'Purple → Black',
    swatch: `linear-gradient(135deg, ${DEFAULT_A}, ${DEFAULT_B}, ${DEFAULT_C})`,
    activeClass:
      'ring-2 ring-violet-500 ring-offset-4 ring-offset-[#0f0a1c] shadow-[0_0_15px_rgba(139,92,246,0.4)]',
  },
  {
    id: 'blue_teal',
    label: 'Blue → Teal',
    swatch: `linear-gradient(135deg, ${BLUE_TEAL_A}, ${BLUE_TEAL_B}, ${BLUE_TEAL_C})`,
    activeClass:
      'ring-2 ring-sky-400 ring-offset-4 ring-offset-[#0f0a1c] shadow-[0_0_15px_rgba(56,189,248,0.4)]',
  },
  {
    id: 'node_emerald',
    label: 'Emerald → Night',
    swatch: 'linear-gradient(135deg, #34d399, #10b981, #04120d)',
    activeClass:
      'ring-2 ring-emerald-400 ring-offset-4 ring-offset-[#0f0a1c] shadow-[0_0_15px_rgba(16,185,129,0.4)]',
  },
  {
    id: 'victus_ember',
    label: 'Ember → Night',
    swatch: 'linear-gradient(135deg, #fb923c, #f97316, #170a03)',
    activeClass:
      'ring-2 ring-orange-400 ring-offset-4 ring-offset-[#0f0a1c] shadow-[0_0_15px_rgba(249,115,22,0.4)]',
  },
  {
    id: 'mono_slate',
    label: 'Slate → Night',
    swatch: 'linear-gradient(135deg, #94a3b8, #475569, #0b0e13)',
    activeClass:
      'ring-2 ring-slate-400 ring-offset-4 ring-offset-[#0f0a1c] shadow-[0_0_15px_rgba(148,163,184,0.4)]',
  },
];

export interface BackgroundOption {
  id: BackgroundStyle;
  label: string;
  hint: string;
}

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: 'aurora', label: 'Aurora', hint: 'Drifting light fields' },
  { id: 'mesh', label: 'Mesh', hint: 'Scanned node grid' },
  { id: 'starfield', label: 'Starfield', hint: 'Particle drift' },
  { id: 'none', label: 'Off', hint: 'Flat background' },
];

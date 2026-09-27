import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeConfig, ThemePreset, ColorMode } from '../types.ts';

interface ThemeContextType {
  config: ThemeConfig;
  gradientColors: [string, string, string];
  solidColor: string;
  isDark: boolean;
  setPreset: (preset: ThemePreset) => void;
  setCustomColors: (a: string, b: string, solid: boolean) => void;
  setReduceMotion: (reduce: boolean) => void;
  setOpenLinksExternally: (openExternal: boolean) => void;
  setColorMode: (mode: ColorMode) => void;
  toggleColorMode: () => void;
  resetToDefault: () => void;
}

const STORAGE_KEY = 'victus_theme_prefs_web';

// Default Purple -> Black preset
export const DEFAULT_A = '#c084fc';
export const DEFAULT_B = '#7c3aed';
export const DEFAULT_C = '#0a0a0f';

// Pure Blue -> Teal preset
export const BLUE_TEAL_A = '#0284c7';
export const BLUE_TEAL_B = '#06b6d4';
export const BLUE_TEAL_C = '#14b8a6';

const initialConfig: ThemeConfig = {
  preset: 'purple_black',
  customA: DEFAULT_A,
  customB: DEFAULT_C,
  isCustomSolid: false,
  reduceMotion: false,
  colorMode: 'dark',
  openLinksExternally: false,
};

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

const ThemeContext = createContext<ThemeContextType | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<ThemeConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...initialConfig, ...JSON.parse(saved) };
      }
    } catch {
      // Fallback
    }
    return initialConfig;
  });

  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  // Track system dark mode changes dynamically
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const isDark = config.colorMode === 'system' ? systemIsDark : config.colorMode === 'dark';

  const getGradientColors = (): [string, string, string] => {
    if (config.preset === 'blue_teal') {
      return [BLUE_TEAL_A, BLUE_TEAL_B, BLUE_TEAL_C];
    }
    if (config.preset === 'custom') {
      if (config.isCustomSolid) {
        return [config.customA, config.customA, config.customA];
      }
      return [config.customA, config.customB, config.customB];
    }
    return [DEFAULT_A, DEFAULT_B, DEFAULT_C];
  };

  const gradientColors = getGradientColors();
  const solidColor = gradientColors[0];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Ignore
    }

    const root = document.documentElement;
    const [c1, c2, c3] = gradientColors;
    const rgb1 = hexToRgb(c1);
    const rgb2 = hexToRgb(c2);
    const rgb3 = hexToRgb(c3);

    root.style.setProperty('--accent-1', c1);
    root.style.setProperty('--accent-2', c2);
    root.style.setProperty('--accent-3', c3);
    root.style.setProperty('--accent-1-rgb', rgb1);
    root.style.setProperty('--accent-2-rgb', rgb2);
    root.style.setProperty('--accent-3-rgb', rgb3);

    // Apply dark or light mode classes to root
    if (isDark) {
      root.classList.remove('light');
      root.classList.add('dark');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }

    if (config.reduceMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }

    // Apply color-scheme specific surfaces so toggling mode immediately re-styles the entire UI
    if (config.preset === 'blue_teal') {
      root.style.setProperty('--bg', isDark ? '#040914' : '#f0f7ff');
      root.style.setProperty('--surface-topbar', isDark ? 'rgba(7, 18, 38, 0.95)' : 'rgba(255, 255, 255, 0.95)');
      root.style.setProperty('--sheet-bg', isDark ? '#09172e' : '#ffffff');
      root.style.setProperty('--sheet-stroke', isDark ? 'rgba(14, 165, 233, 0.22)' : 'rgba(14, 165, 233, 0.15)');
      root.style.setProperty('--divider', isDark ? 'rgba(14, 165, 233, 0.18)' : 'rgba(14, 165, 233, 0.12)');
      root.style.setProperty('--chip-bg', isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(2, 132, 199, 0.08)');
      root.style.setProperty('--chip-stroke', isDark ? 'rgba(56, 189, 248, 0.24)' : 'rgba(2, 132, 199, 0.18)');
      root.style.setProperty('--chip-text', isDark ? '#e0f2fe' : '#032c57');
      root.style.setProperty('--panel', isDark ? '#091830' : '#ffffff');
      root.style.setProperty('--panel-strong', isDark ? '#0d2242' : '#f1f8fe');
      root.style.setProperty('--line', isDark ? 'rgba(14, 165, 233, 0.22)' : 'rgba(2, 132, 199, 0.15)');
      root.style.setProperty('--line-soft', isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(3, 44, 87, 0.08)');
      root.style.setProperty('--text', isDark ? '#ffffff' : '#032c57');
      root.style.setProperty('--title-text', isDark ? '#ffffff' : '#032c57');
      root.style.setProperty('--muted', isDark ? '#94a3b8' : '#475569');
      root.style.setProperty('--faint', isDark ? '#64748b' : '#94a3b8');
      root.style.setProperty('--eyebrow', isDark ? '#38bdf8' : '#0284c7');
      root.style.setProperty('--arrow-text', isDark ? '#7dd3fc' : '#0284c7');
      root.style.setProperty('--arrow-bg', isDark ? 'rgba(14, 165, 233, 0.18)' : 'rgba(14, 165, 233, 0.12)');
      root.style.setProperty(
        '--bg-image',
        isDark
          ? 'radial-gradient(circle at 8% 2%, rgba(2, 132, 199, 0.24), transparent 23rem), radial-gradient(circle at 100% 18%, rgba(20, 184, 166, 0.18), transparent 22rem), linear-gradient(180deg, #040914, #071529 48%, #020817)'
          : 'radial-gradient(circle at 8% 2%, rgba(2, 132, 199, 0.1), transparent 23rem), radial-gradient(circle at 100% 18%, rgba(20, 184, 166, 0.08), transparent 22rem), linear-gradient(180deg, #f8fbff, #e9f3ff 48%, #f0f7ff)'
      );
    } else if (config.preset === 'custom') {
      root.style.setProperty('--bg', isDark ? '#07090e' : '#f8fafc');
      root.style.setProperty('--surface-topbar', isDark ? 'rgba(14, 17, 24, 0.95)' : 'rgba(255, 255, 255, 0.95)');
      root.style.setProperty('--sheet-bg', isDark ? '#10131d' : '#ffffff');
      root.style.setProperty('--sheet-stroke', isDark ? `rgba(${rgb1}, 0.25)` : 'rgba(15, 23, 42, 0.1)');
      root.style.setProperty('--divider', isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)');
      root.style.setProperty('--chip-bg', isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.05)');
      root.style.setProperty('--chip-stroke', isDark ? `rgba(${rgb1}, 0.25)` : 'rgba(15, 23, 42, 0.1)');
      root.style.setProperty('--chip-text', isDark ? '#f1f5f9' : '#0f172a');
      root.style.setProperty('--panel', isDark ? '#12141f' : '#ffffff');
      root.style.setProperty('--panel-strong', isDark ? '#161928' : '#f8fafc');
      root.style.setProperty('--line', isDark ? `rgba(${rgb1}, 0.22)` : 'rgba(15, 23, 42, 0.1)');
      root.style.setProperty('--line-soft', isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)');
      root.style.setProperty('--text', isDark ? '#ffffff' : '#0f172a');
      root.style.setProperty('--title-text', isDark ? '#ffffff' : '#0f172a');
      root.style.setProperty('--muted', isDark ? '#94a3b8' : '#475569');
      root.style.setProperty('--faint', isDark ? '#64748b' : '#94a3b8');
      root.style.setProperty('--eyebrow', isDark ? c1 : c1);
      root.style.setProperty('--arrow-text', isDark ? c1 : c1);
      root.style.setProperty('--arrow-bg', isDark ? `rgba(${rgb1}, 0.18)` : `rgba(${rgb1}, 0.12)`);
      root.style.setProperty(
        '--bg-image',
        isDark
          ? `radial-gradient(circle at 8% 2%, rgba(${rgb1}, 0.2), transparent 23rem), radial-gradient(circle at 100% 18%, rgba(${rgb2}, 0.15), transparent 22rem), linear-gradient(180deg, #07090e, #0e121c 48%, #05060a)`
          : `radial-gradient(circle at 8% 2%, rgba(${rgb1}, 0.1), transparent 23rem), radial-gradient(circle at 100% 18%, rgba(${rgb2}, 0.08), transparent 22rem), linear-gradient(180deg, #f8fafc, #f1f5f9 48%, #e2e8f0)`
      );
    } else {
      // Purple -> Black preset (aligned with control.victuscloud.com admin panel)
      root.style.setProperty('--bg', isDark ? '#0a0a0f' : '#f8fafc');
      root.style.setProperty('--surface-topbar', isDark ? 'rgba(12, 12, 18, 0.95)' : 'rgba(255, 255, 255, 0.95)');
      root.style.setProperty('--sheet-bg', isDark ? '#111117' : '#ffffff');
      root.style.setProperty('--sheet-stroke', isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(124, 58, 237, 0.15)');
      root.style.setProperty('--divider', isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)');
      root.style.setProperty('--chip-bg', isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.05)');
      root.style.setProperty('--chip-stroke', isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.1)');
      root.style.setProperty('--chip-text', isDark ? '#cbd5e1' : '#1e293b');
      root.style.setProperty('--panel', isDark ? '#14141c' : '#ffffff');
      root.style.setProperty('--panel-strong', isDark ? '#171722' : '#f8fafc');
      root.style.setProperty('--line', isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)');
      root.style.setProperty('--line-soft', isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.05)');
      root.style.setProperty('--text', isDark ? '#ffffff' : '#0f172a');
      root.style.setProperty('--title-text', isDark ? '#ffffff' : '#0f172a');
      root.style.setProperty('--muted', isDark ? '#94a3b8' : '#475569');
      root.style.setProperty('--faint', isDark ? '#64748b' : '#94a3b8');
      root.style.setProperty('--eyebrow', isDark ? '#a78bfa' : '#7c3aed');
      root.style.setProperty('--arrow-text', isDark ? '#a78bfa' : '#7c3aed');
      root.style.setProperty('--arrow-bg', isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(124, 58, 237, 0.12)');
      root.style.setProperty(
        '--bg-image',
        isDark
          ? 'radial-gradient(circle at 10% 5%, rgba(139, 92, 246, 0.15), transparent 25rem), radial-gradient(circle at 95% 15%, rgba(124, 58, 237, 0.12), transparent 22rem), linear-gradient(180deg, #0a0a0f, #0d0d14 48%, #08080c)'
          : 'radial-gradient(circle at 8% 2%, rgba(139, 92, 246, 0.08), transparent 23rem), radial-gradient(circle at 100% 18%, rgba(124, 58, 237, 0.06), transparent 22rem), linear-gradient(180deg, #f8fafc, #f1f5f9 48%, #e2e8f0)'
      );
    }
  }, [config, gradientColors, isDark]);

  const setPreset = (preset: ThemePreset) => {
    setConfig((prev) => ({ ...prev, preset }));
  };

  const setCustomColors = (a: string, b: string, solid: boolean) => {
    setConfig((prev) => ({
      ...prev,
      preset: 'custom',
      customA: a,
      customB: b,
      isCustomSolid: solid,
    }));
  };

  const setReduceMotion = (reduce: boolean) => {
    setConfig((prev) => ({ ...prev, reduceMotion: reduce }));
  };

  const setOpenLinksExternally = (openExternal: boolean) => {
    setConfig((prev) => ({ ...prev, openLinksExternally: openExternal }));
  };

  const setColorMode = (mode: ColorMode) => {
    setConfig((prev) => ({ ...prev, colorMode: mode }));
  };

  const toggleColorMode = () => {
    setConfig((prev) => {
      const nextIsDark = prev.colorMode === 'system' ? !systemIsDark : prev.colorMode === 'dark' ? false : true;
      return {
        ...prev,
        colorMode: nextIsDark ? 'dark' : 'light',
      };
    });
  };

  const resetToDefault = () => {
    setConfig(initialConfig);
  };

  return (
    <ThemeContext.Provider
      value={{
        config,
        gradientColors,
        solidColor,
        isDark,
        setPreset,
        setCustomColors,
        setReduceMotion,
        setOpenLinksExternally,
        setColorMode,
        toggleColorMode,
        resetToDefault,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

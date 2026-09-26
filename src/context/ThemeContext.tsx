import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeConfig, ThemePreset, ColorMode } from '../types.ts';

interface ThemeContextType {
  config: ThemeConfig;
  gradientColors: [string, string, string];
  solidColor: string;
  setPreset: (preset: ThemePreset) => void;
  setCustomColors: (a: string, b: string, solid: boolean) => void;
  setReduceMotion: (reduce: boolean) => void;
  setColorMode: (mode: ColorMode) => void;
  toggleColorMode: () => void;
  resetToDefault: () => void;
}

const STORAGE_KEY = 'victus_theme_prefs_web';

export const DEFAULT_A = '#c084fc';
export const DEFAULT_B = '#7c3aed';
export const DEFAULT_C = '#0b0014';

export const BLUE_TEAL_A = '#2f81ff';
export const BLUE_TEAL_B = '#6d5dfc';
export const BLUE_TEAL_C = '#13c8a6';

const initialConfig: ThemeConfig = {
  preset: 'purple_black',
  customA: DEFAULT_A,
  customB: DEFAULT_C,
  isCustomSolid: false,
  reduceMotion: false,
  colorMode: 'dark',
};

function hexToRgb(hex: string): string {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('');
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) return '192, 132, 252';
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

    root.style.setProperty('--accent-1', c1);
    root.style.setProperty('--accent-2', c2);
    root.style.setProperty('--accent-3', c3);
    root.style.setProperty('--accent-1-rgb', hexToRgb(c1));
    root.style.setProperty('--accent-2-rgb', hexToRgb(c2));
    root.style.setProperty('--accent-3-rgb', hexToRgb(c3));

    if (config.reduceMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }

    const isDark =
      config.colorMode === 'dark' ||
      (config.colorMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      root.classList.remove('light');
    } else {
      root.classList.add('light');
    }
  }, [config, gradientColors]);

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

  const setColorMode = (mode: ColorMode) => {
    setConfig((prev) => ({ ...prev, colorMode: mode }));
  };

  const toggleColorMode = () => {
    setConfig((prev) => ({
      ...prev,
      colorMode: prev.colorMode === 'dark' ? 'light' : 'dark',
    }));
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
        setPreset,
        setCustomColors,
        setReduceMotion,
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

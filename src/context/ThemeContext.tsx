import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { ThemeConfig, ThemePreset, ColorMode, BackgroundStyle } from '../types.ts';
import { CSS_VAR_NAMES, TOKEN_KEYS, hexToRgb, resolveAccents, resolveTokens } from '../theme/palettes.ts';

export {
  DEFAULT_A,
  DEFAULT_B,
  DEFAULT_C,
  BLUE_TEAL_A,
  BLUE_TEAL_B,
  BLUE_TEAL_C,
  hexToRgb,
} from '../theme/palettes.ts';

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
  setBackground: (style: BackgroundStyle) => void;
  toggleColorMode: () => void;
  resetToDefault: () => void;
}

const STORAGE_KEY = 'victus_theme_prefs_web';

const initialConfig: ThemeConfig = {
  preset: 'purple_black',
  customA: '#c084fc',
  customB: '#0a0a0f',
  isCustomSolid: false,
  reduceMotion: false,
  colorMode: 'dark',
  openLinksExternally: false,
  background: 'aurora',
};

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

  const gradientColors = useMemo<[string, string, string]>(
    () => resolveAccents(config.preset, config.customA, config.customB, config.isCustomSolid),
    [config.preset, config.customA, config.customB, config.isCustomSolid]
  );

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

    // Paint the palette for the active preset + colour mode.
    const tokens = resolveTokens(config.preset, isDark, gradientColors);
    TOKEN_KEYS.forEach((key) => {
      root.style.setProperty(CSS_VAR_NAMES[key], tokens[key]);
    });
  }, [config, gradientColors, isDark]);

  const setPreset = useCallback((preset: ThemePreset) => {
    setConfig((prev) => ({ ...prev, preset }));
  }, []);

  const setCustomColors = useCallback((a: string, b: string, solid: boolean) => {
    setConfig((prev) => ({
      ...prev,
      preset: 'custom',
      customA: a,
      customB: b,
      isCustomSolid: solid,
    }));
  }, []);

  const setReduceMotion = useCallback((reduce: boolean) => {
    setConfig((prev) => ({ ...prev, reduceMotion: reduce }));
  }, []);

  const setOpenLinksExternally = useCallback((openExternal: boolean) => {
    setConfig((prev) => ({ ...prev, openLinksExternally: openExternal }));
  }, []);

  const setColorMode = useCallback((mode: ColorMode) => {
    setConfig((prev) => ({ ...prev, colorMode: mode }));
  }, []);

  const setBackground = useCallback((style: BackgroundStyle) => {
    setConfig((prev) => ({ ...prev, background: style }));
  }, []);

  const toggleColorMode = useCallback(() => {
    setConfig((prev) => {
      const nextIsDark =
        prev.colorMode === 'system' ? !systemIsDark : prev.colorMode === 'dark' ? false : true;
      return { ...prev, colorMode: nextIsDark ? 'dark' : 'light' };
    });
  }, [systemIsDark]);

  const resetToDefault = useCallback(() => {
    setConfig(initialConfig);
  }, []);

  const value = useMemo(
    () => ({
      config,
      gradientColors,
      solidColor,
      isDark,
      setPreset,
      setCustomColors,
      setReduceMotion,
      setOpenLinksExternally,
      setColorMode,
      setBackground,
      toggleColorMode,
      resetToDefault,
    }),
    [
      config,
      gradientColors,
      solidColor,
      isDark,
      setPreset,
      setCustomColors,
      setReduceMotion,
      setOpenLinksExternally,
      setColorMode,
      setBackground,
      toggleColorMode,
      resetToDefault,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

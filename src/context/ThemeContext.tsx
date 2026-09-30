import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { ThemeConfig, ThemePreset, ColorMode, BackgroundStyle, DisplayPanel } from '../types.ts';
import { CSS_VAR_NAMES, TOKEN_KEYS, hexToRgb, resolveAccents, resolveTokens } from '../theme/palettes.ts';
import { shellSetColorMode } from '../services/victusBridge.ts';

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
  setPanel: (panel: DisplayPanel) => void;
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
  panel: 'lcd',
};

const ThemeContext = createContext<ThemeContextType | null>(null);

/**
 * Live bridge from the Android shell: MainActivity evaluates the same config
 * object whenever the native Appearance sheet changes something, so both
 * surfaces stay in lockstep while the app runs. Keys mirror ThemeConfig.
 */
interface NativeThemeEvent extends CustomEvent {
  detail: {
    preset?: ThemePreset;
    customA?: string;
    customB?: string;
    isCustomSolid?: boolean;
    reduceMotion?: boolean;
    colorMode?: ColorMode;
    background?: BackgroundStyle;
    panel?: DisplayPanel;
    isDark?: boolean;
  };
}

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

    // OLED panels get a true-black canvas. This is a class rather than a token
    // because it also has to switch off the always-on grid overlay, which would
    // otherwise light the whole panel up again.
    //
    // Only while dark: true black is a dark-panel setting, and leaving the
    // class on in light mode would paint a black canvas under light text. The
    // stored preference is untouched, so switching back to Dark restores it.
    if (config.panel === 'oled' && isDark) {
      root.classList.add('oled');
    } else {
      root.classList.remove('oled');
    }

    // Paint the palette for the active preset + colour mode.
    const tokens = resolveTokens(config.preset, isDark, gradientColors, config.panel);
    TOKEN_KEYS.forEach((key) => {
      root.style.setProperty(CSS_VAR_NAMES[key], tokens[key]);
    });
  }, [config, gradientColors, isDark]);

  // Native-shell bridge: mirror config changes coming from the Android
  // Appearance sheet (Tools → Settings) into web state. Skipped when the
  // message didn't originate from the shell.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event) => {
      const detail = (event as NativeThemeEvent).detail || {};
      setConfig((prev) => {
        let next = prev;
        if (detail.preset && detail.preset !== prev.preset) next = { ...next, preset: detail.preset };
        if (detail.customA) next = { ...next, customA: detail.customA };
        if (detail.customB) next = { ...next, customB: detail.customB };
        if (typeof detail.isCustomSolid === 'boolean') next = { ...next, isCustomSolid: detail.isCustomSolid };
        if (typeof detail.reduceMotion === 'boolean') next = { ...next, reduceMotion: detail.reduceMotion };
        if (detail.colorMode) next = { ...next, colorMode: detail.colorMode };
        if (detail.background) next = { ...next, background: detail.background };
        if (detail.panel) next = { ...next, panel: detail.panel };
        return next;
      });
    };
    window.addEventListener('victus:theme', handler);
    return () => window.removeEventListener('victus:theme', handler);
  }, []);

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
    // Hand the choice to the shell as well. In the APK the native layer owns
    // the persisted value and re-asserts it on every theme injection, so a
    // web-only change is reverted on the next one — which is exactly why the
    // header's light/dark button appeared to do nothing. No-op in a browser.
    shellSetColorMode(mode);
  }, []);

  const setBackground = useCallback((style: BackgroundStyle) => {
    setConfig((prev) => ({ ...prev, background: style }));
  }, []);

  const setPanel = useCallback((panel: DisplayPanel) => {
    setConfig((prev) => ({ ...prev, panel }));
  }, []);

  const toggleColorMode = useCallback(() => {
    setConfig((prev) => {
      const nextIsDark =
        prev.colorMode === 'system' ? !systemIsDark : prev.colorMode === 'dark' ? false : true;
      const next: ColorMode = nextIsDark ? 'dark' : 'light';
      // Same reason as setColorMode: the shell has to hear about it, or it will
      // revert on the next theme injection. Toggling always lands on an
      // explicit Dark or Light, never back to System, so the button and the
      // Appearance → Display mode row can never disagree about what is active.
      shellSetColorMode(next);
      return { ...prev, colorMode: next };
    });
  }, [systemIsDark]);

  const resetToDefault = useCallback(() => {
    setConfig(initialConfig);
    // Reset also has to reach the shell, or the native bars stay whatever the
    // user had before the reset while the web app went back to the default.
    shellSetColorMode(initialConfig.colorMode);
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
      setPanel,
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
      setPanel,
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

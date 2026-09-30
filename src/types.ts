export type ThemePreset =
  | 'purple_black'
  | 'blue_teal'
  | 'node_emerald'
  | 'victus_ember'
  | 'mono_slate'
  | 'custom';

export type ColorMode = 'dark' | 'light' | 'system';

/**
 * Physical panel type. OLED drives the canvas to true black so the pixels
 * switch off; the standard mode keeps the lifted near-blacks that stay legible
 * on LCD and avoid the smearing a pure-black scroll can produce.
 */
export type DisplayPanel = 'oled' | 'lcd';

/** Animated backdrop drawn behind the app shell. */
export type BackgroundStyle = 'aurora' | 'mesh' | 'starfield' | 'none';

export interface ThemeConfig {
  preset: ThemePreset;
  customA: string;
  customB: string;
  isCustomSolid: boolean;
  reduceMotion: boolean;
  colorMode: ColorMode;
  openLinksExternally: boolean;
  background: BackgroundStyle;
  panel: DisplayPanel;
}

export interface DockTab {
  id: string;
  label: string;
  url: string;
  tag?: string;
  iconName?: string;
}

export interface DownloadItem {
  id: string;
  fileName: string;
  url: string;
  size?: string;
  timestamp: number;
  status: 'downloading' | 'completed' | 'failed';
}

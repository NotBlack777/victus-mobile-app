export type ThemePreset =
  | 'purple_black'
  | 'blue_teal'
  | 'node_emerald'
  | 'victus_ember'
  | 'mono_slate'
  | 'custom';

export type ColorMode = 'dark' | 'light' | 'system';

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

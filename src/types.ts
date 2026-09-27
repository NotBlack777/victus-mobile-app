export type ThemePreset = 'purple_black' | 'blue_teal' | 'custom';

export type ColorMode = 'dark' | 'light' | 'system';

export interface ThemeConfig {
  preset: ThemePreset;
  customA: string;
  customB: string;
  isCustomSolid: boolean;
  reduceMotion: boolean;
  colorMode: ColorMode;
  openLinksExternally: boolean;
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

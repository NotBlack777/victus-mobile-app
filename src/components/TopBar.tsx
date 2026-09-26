import React from 'react';
import { ArrowLeft, RotateCw, MoreVertical, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.tsx';

interface TopBarProps {
  canGoBack: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onOpenTools: () => void;
  isLoading: boolean;
  progress: number;
  currentTitle?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  canGoBack,
  onBack,
  onRefresh,
  onOpenTools,
  isLoading,
  progress,
  currentTitle = 'Victus Cloud',
}) => {
  const { config, toggleColorMode } = useTheme();

  return (
    <header className="sticky top-0 z-40 w-full select-none">
      {/* Top bar surface */}
      <div
        className="w-full flex items-center justify-between px-2 sm:px-4 py-2 border-b backdrop-blur-md transition-colors"
        style={{
          backgroundColor: 'var(--surface-topbar)',
          borderColor: 'var(--divider)',
        }}
      >
        <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0">
          <button
            onClick={onBack}
            disabled={!canGoBack}
            aria-label="Back"
            className={`w-12 h-12 flex items-center justify-center rounded-full transition-all focus:outline-none ${
              canGoBack
                ? 'opacity-100 hover:bg-white/10 active:scale-95 cursor-pointer'
                : 'opacity-35 cursor-not-allowed'
            }`}
            style={{ color: 'var(--text)' }}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex flex-col min-w-0 pr-2">
            <h1
              className="text-base sm:text-lg font-bold truncate leading-tight tracking-tight"
              style={{ color: 'var(--title-text)' }}
            >
              Victus Cloud
            </h1>
            {currentTitle !== 'Victus Cloud' && (
              <span className="text-[11px] font-medium truncate opacity-60">
                {currentTitle}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          <button
            onClick={toggleColorMode}
            aria-label="Toggle theme mode"
            title={config.colorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
            style={{ color: 'var(--text)' }}
          >
            {config.colorMode === 'dark' ? (
              <Sun className="w-5 h-5 opacity-80 hover:opacity-100" />
            ) : (
              <Moon className="w-5 h-5 opacity-80 hover:opacity-100" />
            )}
          </button>

          <button
            onClick={onRefresh}
            aria-label="Refresh"
            title="Refresh"
            className={`w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 active:scale-95 transition-all cursor-pointer ${
              isLoading ? 'animate-spin' : ''
            }`}
            style={{ color: 'var(--text)' }}
          >
            <RotateCw className="w-5 h-5 opacity-80 hover:opacity-100" />
          </button>

          <button
            onClick={onOpenTools}
            aria-label="Tools menu"
            title="Tools & Settings"
            className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
            style={{ color: 'var(--text)' }}
          >
            <MoreVertical className="w-5 h-5 opacity-80 hover:opacity-100" />
          </button>
        </div>
      </div>

      {/* Progress bar directly beneath top bar */}
      <div
        className="w-full h-[3px] overflow-hidden transition-opacity duration-300"
        style={{
          backgroundColor: 'transparent',
          opacity: isLoading ? 1 : 0,
        }}
      >
        <div
          className="h-full transition-all duration-200"
          style={{
            width: `${Math.max(isLoading ? progress : 0, 5)}%`,
            background: 'linear-gradient(90deg, var(--accent-1), var(--accent-2))',
          }}
        />
      </div>
    </header>
  );
};

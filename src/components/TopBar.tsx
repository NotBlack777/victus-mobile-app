import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  RotateCw,
  Sun,
  Moon,
  Menu,
  Bell,
  LogOut,
  Download,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useNotifications } from '../context/NotificationContext.tsx';
import { hasShellBridge, shellOpenNativeMenu, shellUiState } from '../services/victusBridge.ts';

interface TopBarProps {
  canGoBack: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onOpenTools: () => void;
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
  isLoading: boolean;
  progress: number;
  currentTitle?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  canGoBack,
  onBack,
  onRefresh,
  onOpenTools,
  onOpenNotifications,
  onOpenProfile,
  isLoading,
  progress,
  currentTitle = 'Victus Cloud',
}) => {
  const { isDark, toggleColorMode } = useTheme();
  const { user, signOut, isDemo } = useAuth();
  const { unreadCount } = useNotifications();

  // A native-only affordance: in a browser there is no update service, so the
  // button never appears and nothing polls.
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState('');

  useEffect(() => {
    if (!hasShellBridge()) return;
    const read = () => {
      const state = shellUiState();
      setUpdateAvailable(state.updateAvailable);
      setUpdateVersion(state.updateVersion);
    };
    read();
    // The shell's own background check posts back when it finds one; polling
    // here would be a second, redundant request. Two slow ticks are enough to
    // catch a check that lands just after this screen mounts.
    const timer = window.setInterval(read, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Single Source of Truth Auth Check: Open account profile if authenticated
  const handleAvatarTap = () => {
    if (user) {
      onOpenProfile();
    }
  };

  return (
    <header className="app-chrome pt-safe w-full select-none">
      {/* Top bar surface matching control.victuscloud.com header */}
      <div
        className="w-full flex items-center justify-between px-2.5 sm:px-4 py-2 border-b backdrop-blur-md transition-colors duration-200"
        style={{
          backgroundColor: 'var(--surface-topbar)',
          borderColor: 'var(--divider)',
          color: 'var(--text)',
        }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Left button: Back arrow when subpage, or brand logo mark on root (NO duplicate hamburger button) */}
          {canGoBack ? (
            <button
              onClick={onBack}
              aria-label="Back"
              className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all cursor-pointer flex-shrink-0"
              style={{
                borderColor: 'var(--line)',
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                color: 'var(--text)',
              }}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <div
              className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl bg-violet-600/15 border border-violet-500/30 text-violet-400 flex-shrink-0"
              title="Victus Cloud"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M12 2L1 21h22L12 2zm0 4.5l7 12H5l7-12z" />
              </svg>
            </div>
          )}

          {/* Center Breadcrumb/Title Chip matching reference screenshot */}
          <div
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl border max-w-[200px] sm:max-w-md flex-1 min-w-0 transition-colors"
            style={{
              backgroundColor: 'var(--panel)',
              borderColor: 'var(--line)',
            }}
          >
            <span
              className="text-[11px] font-semibold hidden xs:inline"
              style={{ color: 'var(--muted)' }}
            >
              Victus
            </span>
            <span
              className="text-[10px] font-mono hidden xs:inline"
              style={{ color: 'var(--faint)' }}
            >
              &gt;
            </span>
            <span className="text-xs font-bold text-violet-400 truncate">
              {currentTitle}
            </span>
          </div>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0 ml-1.5 sm:ml-2">
          {/* Update available — the badge the old native Tools menu carried, now
              in the one remaining menu. Reads the shell's own background check,
              so nothing is polled from the page. */}
          {updateAvailable && (
            <button
              onClick={() => shellOpenNativeMenu('updates')}
              aria-label={`Update available: version ${updateVersion}`}
              title={`Update available · ${updateVersion}`}
              className="relative w-8.5 h-8.5 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl border active:scale-95 transition-all cursor-pointer"
              style={{
                borderColor: 'var(--line)',
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                color: 'var(--text)',
              }}
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 shadow-xs"
                style={{ borderColor: 'var(--surface-topbar)' }}
              />
            </button>
          )}

          {/* Notification Bell */}
          <button
            onClick={onOpenNotifications}
            aria-label="Notifications"
            title="Notifications"
            className="relative w-8.5 h-8.5 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl border active:scale-95 transition-all cursor-pointer"
            style={{
              borderColor: 'var(--line)',
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
              color: 'var(--text)',
            }}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-600 text-white text-[9px] font-bold flex items-center justify-center shadow-xs">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Dynamic Auth State: Authenticated Avatar with Online Presence */}
          {/* Demo data is labelled wherever the account is shown, so sample data is
              never mistaken for a real panel session. */}
          {user && isDemo && (
            <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide bg-amber-500/15 border border-amber-500/30 text-amber-300">
              Demo
            </span>
          )}

          {user ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleAvatarTap}
                aria-label="Account profile"
                title="Account profile"
                className="relative w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-xl border border-violet-500/40 bg-violet-600/20 hover:border-violet-400 active:scale-95 transition-all cursor-pointer flex items-center justify-center p-0.5 shadow-xs"
              >
                <div className="w-full h-full rounded-[10px] overflow-hidden flex items-center justify-center bg-gradient-to-tr from-violet-700/60 to-indigo-600/60">
                  {user.user_metadata?.avatar_url ? (
                    <img
                      src={user.user_metadata.avatar_url}
                      alt={user.email}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-bold text-white tracking-wide">
                      {user.email.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Online / Authenticated Presence Dot */}
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 shadow-xs"
                  style={{ borderColor: 'var(--surface-topbar)' }}
                  title="Authenticated / Session Active"
                />
              </button>
              <button
                onClick={() => signOut()}
                title="Sign out"
                aria-label="Sign out"
                className="w-7 h-7 hidden sm:flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : null}

          {/* Light/Dark Toggle */}
          <button
            onClick={toggleColorMode}
            aria-label="Toggle theme mode"
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-8.5 h-8.5 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl border active:scale-95 transition-all cursor-pointer"
            style={{
              borderColor: 'var(--line)',
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
              color: 'var(--text)',
            }}
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400/90" />
            ) : (
              <Moon className="w-4 h-4 text-violet-600" />
            )}
          </button>

          {/* Refresh Page */}
          <button
            onClick={onRefresh}
            aria-label="Refresh"
            title="Refresh"
            className={`w-8.5 h-8.5 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl border active:scale-95 transition-all cursor-pointer ${
              isLoading ? 'animate-spin text-violet-400' : ''
            }`}
            style={{
              borderColor: 'var(--line)',
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
              color: 'var(--text)',
            }}
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Hamburger Drawer Menu Button (Single launcher on right) */}
          <button
            onClick={onOpenTools}
            aria-label="Open navigation drawer"
            title="Navigation Drawer"
            className="w-8.5 h-8.5 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-violet-600/15 border border-violet-500/30 text-violet-400 hover:bg-violet-600/25 active:scale-95 transition-all cursor-pointer"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sleek violet progress bar with glow */}
      {isLoading && (
        <div className="h-0.5 w-full bg-black/40 overflow-hidden">
          <div
            className="h-full bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.8)] transition-all duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </header>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import { Globe, Smartphone } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.tsx';
import { shellUiState } from '../services/victusBridge.ts';

/**
 * AdminViewToggle — "Switch to web view" / "Switch to app view".
 *
 * This is the ONLY admin surface in the app, and it renders nothing at all
 * unless the native shell says this account may use the admin area the page
 * currently on screen belongs to. That answer comes from the panel's own
 * account payload (`root_admin`) and is re-read on every app resume, so a
 * revoked role loses the toggle immediately. A demo account, an offline
 * failure or a non-admin simply never gets a non-empty area list, and this
 * component returns `null`.
 *
 * The toggle is a convenience, never a permission: the panel re-authorises
 * every admin request regardless of which view is showing.
 *
 * The chosen view is remembered per area so reopening the area lands where the
 * user left off.
 */

export type AdminViewMode = 'web' | 'app';

/**
 * The admin areas that apply to the page on screen right now, kept live.
 *
 * <p>The shell re-checks roles in the background and on every app resume, so the
 * answer can change while the user is already looking at the page: a role granted
 * a moment ago must make the toggle appear immediately, and a role revoked while
 * the app was backgrounded must make it vanish immediately. Reading the snapshot
 * once per page therefore is not enough — this re-reads on a slow tick (the
 * snapshot is a pure in-memory read, not a request) and immediately when the app
 * comes back to the foreground.</p>
 *
 * <p>Returns an empty array outside the APK, for a demo account and for any
 * account without an admin role, which is what makes every admin affordance in
 * the app invisible to them.</p>
 */
export function useShellAdminAreas(): string[] {
  const [areas, setAreas] = useState<string[]>(() => shellUiState().adminAreas);

  useEffect(() => {
    const read = () => {
      const next = shellUiState().adminAreas;
      setAreas((prev) => (sameAreas(prev, next) ? prev : next));
    };
    read();

    const timer = window.setInterval(read, 2_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') read();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return areas;
}

function sameAreas(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

const storageKey = (area: string) => `victus.adminView.${area}`;

/** Reads the remembered choice for an area; anything unreadable means "app". */
export function readAdminViewMode(area: string): AdminViewMode {
  try {
    return window.localStorage.getItem(storageKey(area)) === 'web' ? 'web' : 'app';
  } catch {
    // Private mode / disabled storage: fall back to the default view.
    return 'app';
  }
}

function writeAdminViewMode(area: string, mode: AdminViewMode): void {
  try {
    window.localStorage.setItem(storageKey(area), mode);
  } catch {
    // A failed write only costs the memory, never the functionality.
  }
}

interface AdminViewToggleProps {
  /** The admin area's base URL, or null when this page is not an admin area. */
  area: string | null;
  /** Opens the area's normal website (the "web view"). */
  onSwitchToWeb: () => void;
  /** Opens the app's own admin UI (the "app view"). */
  onSwitchToApp: () => void;
}

export const AdminViewToggle: React.FC<AdminViewToggleProps> = ({
  area,
  onSwitchToWeb,
  onSwitchToApp,
}) => {
  const { config } = useTheme();
  const [mode, setMode] = useState<AdminViewMode>(() => (area ? readAdminViewMode(area) : 'app'));

  // A different area was opened: re-read that area's remembered choice.
  useEffect(() => {
    setMode(area ? readAdminViewMode(area) : 'app');
  }, [area]);

  const choose = useCallback(
    (next: AdminViewMode) => {
      if (!area) return;
      writeAdminViewMode(area, next);
      setMode(next);
      if (next === 'web') onSwitchToWeb();
      else onSwitchToApp();
    },
    [area, onSwitchToWeb, onSwitchToApp]
  );

  if (!area) return null;

  // "Reduce animations" replaces the liquid bounce with a plain fade.
  const enterClass = config.reduceMotion ? 'liquid-enter-fade' : 'liquid-enter';

  return (
    <div
      className={`flex items-center gap-0.5 p-0.5 rounded-lg border border-violet-500/30 bg-violet-600/10 ${enterClass}`}
      role="group"
      aria-label="Admin view"
    >
      <button
        type="button"
        onClick={() => choose('web')}
        aria-pressed={mode === 'web'}
        aria-label="Switch to web view"
        title="Open the normal admin website"
        className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
          mode === 'web'
            ? 'bg-violet-500 text-white'
            : 'text-violet-300/80 hover:text-white hover:bg-white/10'
        }`}
      >
        <Globe className="w-3 h-3" />
        <span className="hidden xs:inline">Web</span>
      </button>
      <button
        type="button"
        onClick={() => choose('app')}
        aria-pressed={mode === 'app'}
        aria-label="Switch to app view"
        title="Use the app's own admin view"
        className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
          mode === 'app'
            ? 'bg-violet-500 text-white'
            : 'text-violet-300/80 hover:text-white hover:bg-white/10'
        }`}
      >
        <Smartphone className="w-3 h-3" />
        <span className="hidden xs:inline">App</span>
      </button>
    </div>
  );
};
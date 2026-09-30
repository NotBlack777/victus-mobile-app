import React, { useRef, useEffect } from 'react';
import { DockTab } from '../types.ts';
import { useTheme } from '../context/ThemeContext.tsx';
import { haptic } from '../utils/haptics.ts';

export const DOCK_TABS: DockTab[] = [
  { id: 'home', label: 'Home', url: '' },
  { id: 'website', label: 'Website', url: 'https://victuscloud.com' },
  { id: 'billing', label: 'Billing', url: 'https://billing.victuscloud.com' },
  { id: 'control', label: 'Control', url: 'https://control.victuscloud.com' },
  { id: 'drive', label: 'Drive', url: 'https://drive.victuscloud.com' },
  { id: 'support', label: 'Support', url: 'https://victuscloud.com/support' },
  { id: 'status', label: 'Status', url: 'https://victuscloud.com/status' },
];

interface DockBarProps {
  activeTabId: string;
  onSelectTab: (tab: DockTab) => void;
}

export const DockBar: React.FC<DockBarProps> = ({ activeTabId, onSelectTab }) => {
  const { config, isDark } = useTheme();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const activeChip = chipsRef.current[activeTabId];
    if (activeChip && scrollerRef.current) {
      const scroller = scrollerRef.current;
      const left = activeChip.offsetLeft - 24;
      scroller.scrollTo({
        left: Math.max(left, 0),
        behavior: config.reduceMotion ? 'auto' : 'smooth',
      });
    }
  }, [activeTabId, config.reduceMotion]);

  return (
    <nav
      className="app-chrome pb-safe w-full border-t backdrop-blur-md select-none transition-colors duration-200"
      style={{
        backgroundColor: 'var(--surface-topbar)',
        borderColor: 'var(--divider)',
      }}
      aria-label="Ecosystem navigation dock"
    >
      <div
        ref={scrollerRef}
        className="w-full flex items-center overflow-x-auto no-scrollbar py-2 px-3 sm:px-4 gap-2 scroll-smooth"
      >
        {DOCK_TABS.map((tab) => {
          const isSelected = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                chipsRef.current[tab.id] = el;
              }}
              onClick={() => {
                haptic('commit');
                onSelectTab(tab);
              }}
              className={`min-h-[38px] px-3.5 sm:px-4 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer flex items-center justify-center transition-all flex-shrink-0 active:scale-95 ${
                isSelected
                  ? 'bg-violet-600/20 text-violet-400 border border-violet-500/40 shadow-[0_0_12px_rgba(139,92,246,0.25)]'
                  : 'hover:text-violet-400'
              }`}
              style={{
                backgroundColor: isSelected
                  ? undefined
                  : isDark
                  ? 'rgba(255, 255, 255, 0.04)'
                  : 'rgba(0, 0, 0, 0.04)',
                borderColor: isSelected ? undefined : 'var(--line)',
                color: isSelected ? undefined : 'var(--muted)',
                borderWidth: '1px',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

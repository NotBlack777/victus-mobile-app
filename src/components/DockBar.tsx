import React, { useRef, useEffect } from 'react';
import { DockTab } from '../types.ts';
import { useTheme } from '../context/ThemeContext.tsx';

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
  const { gradientColors, config } = useTheme();
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

  const [c1, c2, c3] = gradientColors;
  const activeGradient = `linear-gradient(135deg, ${c1}, ${c2}, ${c3})`;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 w-full border-t backdrop-blur-md select-none transition-colors"
      style={{
        backgroundColor: 'var(--surface-topbar)',
        borderColor: 'var(--divider)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      aria-label="Ecosystem navigation dock"
    >
      <div
        ref={scrollerRef}
        className="w-full flex items-center overflow-x-auto no-scrollbar py-2.5 px-3 sm:px-4 gap-2 scroll-smooth"
      >
        {DOCK_TABS.map((tab) => {
          const isSelected = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              ref={(el) => { chipsRef.current[tab.id] = el; }}
              onClick={() => onSelectTab(tab)}
              className={`min-h-[48px] px-5 rounded-full text-sm font-bold whitespace-nowrap cursor-pointer flex items-center justify-center transition-all flex-shrink-0 ${
                isSelected
                  ? 'text-white shadow-lg active:scale-95'
                  : 'hover:brightness-105 active:scale-95'
              }`}
              style={{
                background: isSelected ? activeGradient : 'var(--chip-bg)',
                border: isSelected ? 'none' : '1px solid var(--chip-stroke)',
                color: isSelected ? '#ffffff' : 'var(--chip-text)',
                boxShadow: isSelected ? 'var(--shadow-primary)' : 'none',
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

import React, { useState, useCallback, useEffect } from 'react';
import { TopBar } from './components/TopBar.tsx';
import { DockBar, DOCK_TABS } from './components/DockBar.tsx';
import { HomeView } from './components/HomeView.tsx';
import { EcosystemFrame } from './components/EcosystemFrame.tsx';
import { SettingsSheet } from './components/SettingsSheet.tsx';
import { ToolsMenu } from './components/ToolsMenu.tsx';
import { ClearSessionModal } from './components/ClearSessionModal.tsx';
import { ErrorOverlay } from './components/ErrorOverlay.tsx';
import { DockTab } from './types.ts';

interface HistoryEntry {
  tabId: string;
  url: string;
  title: string;
}

export const App: React.FC = () => {
  const [history, setHistory] = useState<HistoryEntry[]>([
    { tabId: 'home', url: '', title: 'Victus Cloud' },
  ]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isClearSessionOpen, setIsClearSessionOpen] = useState(false);

  const [errorState, setErrorState] = useState<{
    isOpen: boolean;
    message: string;
    failingUrl?: string;
  }>({
    isOpen: false,
    message: '',
  });

  const currentEntry = history[currentIndex] || history[0];
  const canGoBack = currentIndex > 0 || currentEntry.tabId !== 'home';

  // Simulate progress bar animation on navigation
  const triggerLoading = useCallback(() => {
    setIsLoading(true);
    setProgress(15);
    const t1 = setTimeout(() => setProgress(55), 100);
    const t2 = setTimeout(() => setProgress(90), 220);
    const t3 = setTimeout(() => {
      setProgress(100);
      setTimeout(() => {
        setIsLoading(false);
        setProgress(0);
      }, 150);
    }, 380);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const navigateTo = useCallback(
    (url: string, title?: string, tabId?: string) => {
      setErrorState((prev) => ({ ...prev, isOpen: false }));
      triggerLoading();

      // Find matching tabId if url matches a known dock tab
      let resolvedTabId = tabId;
      if (!resolvedTabId) {
        if (!url) resolvedTabId = 'home';
        else {
          const matched = DOCK_TABS.find((t) => t.url && url.startsWith(t.url));
          resolvedTabId = matched ? matched.id : 'website';
        }
      }

      const resolvedTitle = title || (resolvedTabId === 'home' ? 'Victus Cloud' : resolvedTabId.toUpperCase());
      const newEntry: HistoryEntry = {
        tabId: resolvedTabId,
        url,
        title: resolvedTitle,
      };

      setHistory((prev) => {
        const next = prev.slice(0, currentIndex + 1);
        return [...next, newEntry];
      });
      setCurrentIndex((prev) => prev + 1);
    },
    [currentIndex, triggerLoading]
  );

  const handleSelectDockTab = useCallback(
    (tab: DockTab) => {
      if (tab.id === currentEntry.tabId && tab.url === currentEntry.url) {
        return; // Avoid unnecessary re-navigation
      }
      navigateTo(tab.url, tab.label, tab.id);
    },
    [currentEntry, navigateTo]
  );

  const handleBack = useCallback(() => {
    if (errorState.isOpen) {
      setErrorState((prev) => ({ ...prev, isOpen: false }));
      if (currentEntry.tabId !== 'home') {
        navigateTo('', 'Victus Cloud', 'home');
      }
      return;
    }

    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      triggerLoading();
    } else if (currentEntry.tabId !== 'home') {
      navigateTo('', 'Victus Cloud', 'home');
    }
  }, [errorState.isOpen, currentIndex, currentEntry, navigateTo, triggerLoading]);

  // Handle browser back button (predictive back / history API)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      handleBack();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [handleBack]);

  const handleRefresh = useCallback(() => {
    setErrorState((prev) => ({ ...prev, isOpen: false }));
    triggerLoading();
  }, [triggerLoading]);

  const handleClearSession = useCallback(() => {
    setHistory([{ tabId: 'home', url: '', title: 'Victus Cloud' }]);
    setCurrentIndex(0);
    setErrorState({ isOpen: false, message: '' });
    triggerLoading();
  }, [triggerLoading]);

  return (
    <div className="min-h-screen flex flex-col relative text-[var(--text)]">
      {/* Top native chrome */}
      <TopBar
        canGoBack={canGoBack}
        onBack={handleBack}
        onRefresh={handleRefresh}
        onOpenTools={() => setIsToolsOpen(true)}
        isLoading={isLoading}
        progress={progress}
        currentTitle={currentEntry.title}
      />

      {/* Main content body */}
      <main className="flex-1 w-full relative z-10">
        {currentEntry.tabId === 'home' || !currentEntry.url ? (
          <HomeView onNavigate={(url, title, tabId) => navigateTo(url, title, tabId)} />
        ) : (
          <EcosystemFrame
            url={currentEntry.url}
            title={currentEntry.title}
            onNavigateHome={() => navigateTo('', 'Victus Cloud', 'home')}
            onTriggerError={(msg, failing) =>
              setErrorState({ isOpen: true, message: msg, failingUrl: failing })
            }
          />
        )}
      </main>

      {/* Bottom Dock Navigation */}
      <DockBar
        activeTabId={currentEntry.tabId}
        onSelectTab={handleSelectDockTab}
      />

      {/* Overflow Tools Menu */}
      <ToolsMenu
        isOpen={isToolsOpen}
        onClose={() => setIsToolsOpen(false)}
        currentUrl={currentEntry.url}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onNavigate={(url, title, tabId) => navigateTo(url, title, tabId)}
        onOpenClearSession={() => setIsClearSessionOpen(true)}
      />

      {/* Settings / Appearance Sheet */}
      <SettingsSheet
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Clear Session Modal */}
      <ClearSessionModal
        isOpen={isClearSessionOpen}
        onClose={() => setIsClearSessionOpen(false)}
        onConfirmClear={handleClearSession}
      />

      {/* Error Overlay */}
      <ErrorOverlay
        isOpen={errorState.isOpen}
        message={errorState.message}
        failingUrl={errorState.failingUrl}
        onRetry={handleRefresh}
        onGoHome={() => {
          setErrorState({ isOpen: false, message: '' });
          navigateTo('', 'Victus Cloud', 'home');
        }}
      />
    </div>
  );
};

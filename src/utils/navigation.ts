/**
 * navigation.ts
 *
 * Centralized link handler respecting ThemeConfig.openLinksExternally.
 * If openLinksExternally is false: keeps user in-app (navigates via onNavigateInApp or native view).
 * If openLinksExternally is true: opens externally via window.open().
 */

export interface OpenLinkOptions {
  openLinksExternally?: boolean;
  onNavigateInApp?: (url: string, title?: string, tabId?: string) => void;
  showToast?: (message: string) => void;
  title?: string;
  tabId?: string;
}

export function openVictusLink(url: string, options?: OpenLinkOptions): void {
  const shouldOpenExternally = Boolean(options?.openLinksExternally);

  if (shouldOpenExternally) {
    window.open(url, '_blank', 'noopener,noreferrer');
    if (options?.showToast) {
      options.showToast('Opened in external browser');
    }
    return;
  }

  // If in-app navigation callback is provided, route in-app
  if (options?.onNavigateInApp) {
    let resolvedTabId = options.tabId;
    if (!resolvedTabId) {
      if (url.includes('control.victuscloud.com')) resolvedTabId = 'control';
      else if (url.includes('billing.victuscloud.com')) resolvedTabId = 'billing';
      else if (url.includes('drive.victuscloud.com')) resolvedTabId = 'drive';
      else if (url.includes('/support')) resolvedTabId = 'support';
      else if (url.includes('/status')) resolvedTabId = 'status';
      else resolvedTabId = 'website';
    }

    const resolvedTitle =
      options.title ||
      (resolvedTabId === 'control'
        ? 'Control Panel'
        : resolvedTabId === 'billing'
        ? 'Billing'
        : resolvedTabId === 'drive'
        ? 'Drive'
        : resolvedTabId === 'support'
        ? 'Support Hub'
        : resolvedTabId === 'status'
        ? 'System Status'
        : 'Victus Cloud');

    options.onNavigateInApp(url, resolvedTitle, resolvedTabId);
    if (options?.showToast) {
      options.showToast(`Navigating to ${resolvedTitle}`);
    }
    return;
  }

  // If already at destination or no router available, check if external link or prompt user
  if (url.includes('discord.gg')) {
    // Discord invite link always requires browser/discord app
    window.open(url, '_blank', 'noopener,noreferrer');
    if (options?.showToast) {
      options.showToast('Opening Discord invite');
    }
    return;
  }

  // Fallback
  window.open(url, '_blank', 'noopener,noreferrer');
}

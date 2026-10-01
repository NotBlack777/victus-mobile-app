import './dom-shim.ts';
import { beforeEach, describe, expect, test } from 'bun:test';
import { openCalls, resetStorage, seedItem, storage } from './dom-shim.ts';
import { notificationService } from '../src/services/notificationService.ts';
import { openVictusLink } from '../src/utils/navigation.ts';
import {
  REAL_VICTUS_SERVICES,
  getFleetStats,
  getNodeSummaries,
  parseMiB,
  formatMiB,
} from '../src/services/controlData.ts';

// Auth coverage lives in tests/auth.test.ts, which drives the native bridge.
const NOTIFICATION_KEY = 'victus_notifications_v1';

beforeEach(() => {
  resetStorage();
});

describe('notificationService', () => {
  test('seeds the default notifications when storage is empty', () => {
    const list = notificationService.getNotifications();
    expect(list).toHaveLength(4);
    expect(list.filter((n) => !n.read)).toHaveLength(2);
  });

  test('resets to defaults when the stored payload is not an array', () => {
    seedItem(NOTIFICATION_KEY, JSON.stringify({ unexpected: true }));
    const list = notificationService.getNotifications();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(4);
    expect(storage.getItem(NOTIFICATION_KEY)).toBeNull();
  });

  test('markAsRead flips only the targeted notification and persists the change', () => {
    notificationService.markAsRead('notif_1');

    const list = notificationService.getNotifications();
    expect(list.find((n) => n.id === 'notif_1')?.read).toBe(true);
    expect(list.find((n) => n.id === 'notif_2')?.read).toBe(false);

    const persisted = JSON.parse(storage.getItem(NOTIFICATION_KEY) as string);
    expect(Array.isArray(persisted)).toBe(true);
    expect(persisted.find((n: { id: string }) => n.id === 'notif_1').read).toBe(true);
  });

  test('deleteNotification removes the item and notifies subscribers', () => {
    const lengths: number[] = [];
    const unsubscribe = notificationService.subscribe((list) => lengths.push(list.length));

    expect(lengths).toEqual([4]);
    notificationService.deleteNotification('notif_1');
    expect(lengths[lengths.length - 1]).toBe(3);

    unsubscribe();
  });

  test('unsubscribe stops notification callbacks', () => {
    let calls = 0;
    const unsubscribe = notificationService.subscribe(() => {
      calls += 1;
    });
    expect(calls).toBe(1);

    unsubscribe();
    notificationService.markAllAsRead();
    expect(calls).toBe(1);
  });
});

describe('openVictusLink', () => {
  test('routes known Victus URLs to the matching in-app tab', () => {
    const calls: Array<{ url: string; title?: string; tabId?: string }> = [];
    const onNavigateInApp = (url: string, title?: string, tabId?: string) =>
      calls.push({ url, title, tabId });

    openVictusLink('https://control.victuscloud.com/', { onNavigateInApp });
    openVictusLink('https://victuscloud.com/support', { onNavigateInApp });
    openVictusLink('https://billing.victuscloud.com', { onNavigateInApp });
    openVictusLink('https://victuscloud.com/anything-else', { onNavigateInApp });

    expect(calls.map((c) => c.tabId)).toEqual(['control', 'support', 'billing', 'website']);
    expect(calls[0].title).toBe('Control Panel');
    expect(openCalls).toHaveLength(0);
  });

  test('opens in the device browser and skips in-app routing when enabled', () => {
    let navigated = false;
    openVictusLink('https://billing.victuscloud.com', {
      openLinksExternally: true,
      onNavigateInApp: () => {
        navigated = true;
      },
    });

    expect(navigated).toBe(false);
    expect(openCalls).toEqual(['https://billing.victuscloud.com']);
  });

  test('opens Discord invites in the browser even with no router', () => {
    openVictusLink('https://discord.gg/victuscloud');
    expect(openCalls).toEqual(['https://discord.gg/victuscloud']);
  });
});

describe('getFleetStats', () => {
  test('counts every service exactly once across statuses and types', () => {
    const stats = getFleetStats(REAL_VICTUS_SERVICES);
    const totals = REAL_VICTUS_SERVICES.length;

    expect(stats.availableServicesCount).toBe(totals);
    expect(stats.runningCount + stats.stoppedCount + stats.suspendedCount).toBe(totals);
    expect(stats.gameServersCount + stats.vpsCount).toBe(totals);
    expect(stats.runningCount).toBe(
      REAL_VICTUS_SERVICES.filter((s) => s.status === 'ACTIVE').length
    );
  });

  test('reflects updated statuses passed in from live state', () => {
    const updated = REAL_VICTUS_SERVICES.map((service) =>
      service.id === 'victus-srv-03' ? { ...service, status: 'ACTIVE' as const } : service
    );
    const before = getFleetStats(REAL_VICTUS_SERVICES).runningCount;
    const after = getFleetStats(updated).runningCount;

    expect(after).toBe(before + 1);
  });
});

describe('node infrastructure', () => {
  test('parses allocated memory out of the plan labels', () => {
    expect(parseMiB('8,192 MiB')).toBe(8192);
    expect(parseMiB('80,000 MiB')).toBe(80000);
    expect(parseMiB('unknown')).toBe(0);
    expect(formatMiB(80000)).toBe('80,000 MiB');
  });

  test('every service belongs to exactly one node, so nothing is double counted', () => {
    const summaries = getNodeSummaries(REAL_VICTUS_SERVICES);

    expect(summaries.reduce((sum, node) => sum + node.total, 0)).toBe(
      REAL_VICTUS_SERVICES.length
    );
    expect(summaries.reduce((sum, node) => sum + node.active, 0)).toBe(
      REAL_VICTUS_SERVICES.filter((s) => s.status === 'ACTIVE').length
    );
  });

  test('memory per node is the sum of that node\'s services', () => {
    const summaries = getNodeSummaries(REAL_VICTUS_SERVICES);
    const sg1 = summaries.find((node) => node.node === 'SG-1');
    const expected = REAL_VICTUS_SERVICES.filter((s) => s.node === 'SG-1').reduce(
      (sum, s) => sum + parseMiB(s.memory),
      0
    );

    expect(sg1).toBeDefined();
    expect(sg1?.memoryMiB).toBe(expected);
  });

  test('reports a datacentre for every node in the fleet', () => {
    for (const node of getNodeSummaries(REAL_VICTUS_SERVICES)) {
      expect(node.region.length).toBeGreaterThan(0);
      expect(node.region).not.toBe('Victus Cloud');
    }
  });

  test('an empty fleet produces no nodes instead of a phantom entry', () => {
    expect(getNodeSummaries([])).toEqual([]);
  });
});

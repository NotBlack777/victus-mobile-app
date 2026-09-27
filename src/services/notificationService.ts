/**
 * notificationService.ts
 *
 * In-app notification service with local storage persistence and mock data.
 * Structured so that a real backend/WebSocket/Supabase real-time channel
 * can be hooked in without modifying any UI components.
 */

export interface InAppNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'server' | 'billing' | 'ticket' | 'system';
  read: boolean;
  actionUrl?: string;
}

const STORAGE_KEY = 'victus_notifications_v1';

const INITIAL_NOTIFICATIONS: InAppNotification[] = [
  {
    id: 'notif_1',
    title: 'Server Node Online',
    message: 'SG-1 cluster maintenance finished. "Icys minecraft server" is healthy.',
    timestamp: '5m ago',
    type: 'server',
    read: false,
    actionUrl: 'https://control.victuscloud.com',
  },
  {
    id: 'notif_2',
    title: 'Support Ticket Reply',
    message: 'Billing department responded to ticket #VT-9804 regarding invoice verification.',
    timestamp: '42m ago',
    type: 'ticket',
    read: false,
    actionUrl: 'https://victuscloud.com/support',
  },
  {
    id: 'notif_3',
    title: 'Cosmic Guard Mitigation',
    message: 'Cosmic Guard blocked a 420 Gbps SYN flood targeting port 25588 with 0 packet loss.',
    timestamp: '3h ago',
    type: 'system',
    read: true,
  },
  {
    id: 'notif_4',
    title: 'Invoice Paid: #INV-2026-442',
    message: 'Automatic renewal for Ryzen 9 7950X - 16GB RAM node was processed successfully.',
    timestamp: 'Yesterday',
    type: 'billing',
    read: true,
    actionUrl: 'https://billing.victuscloud.com',
  },
];

type NotificationListener = (notifications: InAppNotification[]) => void;
const listeners: Set<NotificationListener> = new Set();

function getStoredNotifications(): InAppNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_NOTIFICATIONS;
    return JSON.parse(raw);
  } catch {
    return INITIAL_NOTIFICATIONS;
  }
}

function persistNotifications(notifications: InAppNotification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  } catch {
    // ignore
  }
  listeners.forEach((listener) => {
    try {
      listener(notifications);
    } catch (err) {
      console.error('Error in notification listener:', err);
    }
  });
}

export const notificationService = {
  getNotifications(): InAppNotification[] {
    return getStoredNotifications();
  },

  markAsRead(id: string): InAppNotification[] {
    const current = getStoredNotifications();
    const updated = current.map((n) => (n.id === id ? { ...n, read: true } : n));
    persistNotifications(updated);
    return updated;
  },

  markAllAsRead(): InAppNotification[] {
    const current = getStoredNotifications();
    const updated = current.map((n) => ({ ...n, read: true }));
    persistNotifications(updated);
    return updated;
  },

  deleteNotification(id: string): InAppNotification[] {
    const current = getStoredNotifications();
    const updated = current.filter((n) => n.id !== id);
    persistNotifications(updated);
    return updated;
  },

  subscribe(callback: NotificationListener): () => void {
    listeners.add(callback);
    callback(getStoredNotifications());
    return () => listeners.delete(callback);
  },
};

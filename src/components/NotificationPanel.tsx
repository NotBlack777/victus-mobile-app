import React from 'react';
import {
  Bell,
  CheckCheck,
  Server,
  LifeBuoy,
  CreditCard,
  ShieldAlert,
  X,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { useNotifications } from '../context/NotificationContext.tsx';
import { InAppNotification } from '../services/notificationService.ts';

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (url: string, title?: string, tabId?: string) => void;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } =
    useNotifications();

  if (!isOpen) return null;

  const getIcon = (type: InAppNotification['type']) => {
    switch (type) {
      case 'server':
        return <Server className="w-4 h-4 text-emerald-400" />;
      case 'ticket':
        return <LifeBuoy className="w-4 h-4 text-sky-400" />;
      case 'billing':
        return <CreditCard className="w-4 h-4 text-violet-400" />;
      case 'system':
      default:
        return <ShieldAlert className="w-4 h-4 text-amber-400" />;
    }
  };

  const handleItemClick = (notif: InAppNotification) => {
    markAsRead(notif.id);
    if (notif.actionUrl && onNavigate) {
      onClose();
      onNavigate(notif.actionUrl, notif.title);
    }
  };

  return (
    <div
      className="absolute inset-0 z-modal flex items-start justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-[#111117] text-white shadow-2xl overflow-hidden flex flex-col max-h-[80%] mt-14 mr-2 animate-in slide-in-from-top-2 duration-150 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-white/[0.08] flex items-center justify-between bg-[#14141c]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-violet-600 text-white">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-400">Updates &amp; system alerts</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                title="Mark all as read"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] text-xs flex items-center gap-1 transition-colors cursor-pointer"
              >
                <CheckCheck className="w-4 h-4 text-violet-400" />
                <span className="text-[11px] font-medium hidden sm:inline">Read all</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              aria-label="Close notifications"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="divide-y divide-white/[0.06] overflow-y-auto flex-1 max-h-[60vh]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="w-8 h-8 mx-auto text-slate-600 mb-2 opacity-50" />
              <p className="text-xs font-semibold text-slate-300">All caught up</p>
              <p className="text-[11px] text-slate-500 mt-0.5">No notifications at the moment.</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleItemClick(notif)}
                className={`group p-3.5 sm:p-4 flex items-start gap-3 transition-colors cursor-pointer hover:bg-white/[0.03] ${
                  notif.read ? 'opacity-70 bg-transparent' : 'bg-violet-950/20'
                }`}
              >
                {/* Status Dot / Icon */}
                <div className="relative flex-shrink-0 mt-0.5">
                  <div className="w-8 h-8 rounded-lg bg-black/40 border border-white/[0.08] flex items-center justify-center">
                    {getIcon(notif.type)}
                  </div>
                  {!notif.read && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-violet-500 border-2 border-[#111117]" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <h4 className="text-xs font-bold text-white truncate">{notif.title}</h4>
                    <span className="text-[10px] text-slate-500 whitespace-nowrap">
                      {notif.timestamp}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-2">
                    {notif.message}
                  </p>
                  {notif.actionUrl && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-400 hover:text-violet-300 mt-1.5">
                      Open <ExternalLink className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>

                {/* Delete button: visible on touch devices, revealed on hover on desktop */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNotification(notif.id);
                  }}
                  title="Dismiss notification"
                  aria-label={`Dismiss ${notif.title}`}
                  className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors sm:opacity-0 sm:focus:opacity-100 sm:group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Trash2 } from 'lucide-react';
import { useToast } from './Toast.tsx';

interface ClearSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmClear: () => void;
}

export const ClearSessionModal: React.FC<ClearSessionModalProps> = ({
  isOpen,
  onClose,
  onConfirmClear,
}) => {
  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleConfirm = () => {
    // Clear every Victus cache the app actually persists (theme, notifications,
    // chat-bubble position and the auth session itself) + any stray sessionStorage.
    try {
      sessionStorage.clear();
      const victusKeys = ['victus_theme_prefs_web', 'victus_notifications_v1', 'victus_chat_bubble_pos_v2', 'victus_auth_session'];
      victusKeys.forEach((key) => localStorage.removeItem(key));
    } catch {
      // Ignored
    }
    showToast('Session cleared');
    onConfirmClear();
    onClose();
  };

  return (
    <div
      className="absolute inset-0 z-modal flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl p-5 border border-white/[0.08] bg-[#14141c] text-white shadow-2xl text-center select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 rounded-xl mx-auto mb-3 bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
          <Trash2 className="w-5 h-5" />
        </div>

        <h3 className="text-base font-bold mb-1.5 text-white">Clear app session?</h3>
        <p className="text-xs text-slate-400 leading-relaxed mb-5">
          This signs you out and resets saved theme, notifications, and app-shell caches on this device. Your cloud account is unaffected.
        </p>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 min-h-[40px] px-4 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-xs font-semibold text-slate-300 transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 min-h-[40px] px-4 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold active:scale-95 transition-all cursor-pointer shadow-sm"
          >
            Clear Session
          </button>
        </div>
      </div>
    </div>
  );
};

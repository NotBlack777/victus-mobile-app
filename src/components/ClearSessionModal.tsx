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
    // Clear storage sessions
    try {
      sessionStorage.clear();
      // preserve user theme preference in localStorage if desired or clear cache
    } catch {
      // Ignored
    }
    showToast('Session cleared');
    onConfirmClear();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[28px] p-6 border shadow-2xl text-center select-none"
        style={{
          backgroundColor: 'var(--sheet-bg)',
          borderColor: 'var(--sheet-stroke)',
          color: 'var(--text)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-14 h-14 rounded-2xl mx-auto mb-4 bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
          <Trash2 className="w-7 h-7" />
        </div>

        <h3 className="text-lg font-bold mb-2">Clear app session?</h3>
        <p className="text-xs opacity-70 leading-relaxed mb-6">
          This clears cookies, storage, cache, and panel sessions in the app.
        </p>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 min-h-[48px] px-4 rounded-xl border text-xs font-bold hover:bg-white/5 active:scale-98 transition-all cursor-pointer"
            style={{ borderColor: 'var(--line-soft)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 min-h-[48px] px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold active:scale-98 transition-all cursor-pointer shadow-md"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
};

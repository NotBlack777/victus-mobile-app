import React from 'react';
import {
  Sliders,
  ExternalLink,
  Copy,
  Share2,
  FlaskConical,
  LifeBuoy,
  Activity,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import { useToast } from './Toast.tsx';

interface ToolsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentUrl: string;
  onOpenSettings: () => void;
  onNavigate: (url: string, title?: string, tabId?: string) => void;
  onOpenClearSession: () => void;
}

export const ToolsMenu: React.FC<ToolsMenuProps> = ({
  isOpen,
  onClose,
  currentUrl,
  onOpenSettings,
  onNavigate,
  onOpenClearSession,
}) => {
  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentUrl || window.location.href);
    showToast('Link copied');
    onClose();
  };

  const handleShareLink = async () => {
    const targetUrl = currentUrl || window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Victus Cloud',
          text: 'Victus Cloud Mobile Ecosystem',
          url: targetUrl,
        });
      } catch {
        // Ignored if user dismissed
      }
    } else {
      navigator.clipboard.writeText(targetUrl);
      showToast('Link copied for sharing');
    }
    onClose();
  };

  const handleOpenBrowser = () => {
    window.open(currentUrl || 'https://victuscloud.com', '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-5 border shadow-2xl animate-in zoom-in-95 duration-150 select-none"
        style={{
          backgroundColor: 'var(--sheet-bg)',
          borderColor: 'var(--sheet-stroke)',
          color: 'var(--text)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/10">
          <h3 className="font-bold text-base">Tools</h3>
          <button
            onClick={onClose}
            aria-label="Close tools menu"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4 opacity-70" />
          </button>
        </div>

        <div className="space-y-1 text-sm font-medium">
          {/* Settings */}
          <button
            onClick={() => {
              onClose();
              onOpenSettings();
            }}
            className="w-full min-h-[48px] px-3.5 rounded-xl flex items-center gap-3 hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer text-left"
          >
            <Sliders className="w-4 h-4 text-purple-400" />
            <span>Settings</span>
          </button>

          {/* Open in browser */}
          <button
            onClick={handleOpenBrowser}
            className="w-full min-h-[48px] px-3.5 rounded-xl flex items-center gap-3 hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer text-left"
          >
            <ExternalLink className="w-4 h-4 opacity-75" />
            <span>Open in browser</span>
          </button>

          {/* Copy link */}
          <button
            onClick={handleCopyLink}
            className="w-full min-h-[48px] px-3.5 rounded-xl flex items-center gap-3 hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer text-left"
          >
            <Copy className="w-4 h-4 opacity-75" />
            <span>Copy link</span>
          </button>

          {/* Share link */}
          <button
            onClick={handleShareLink}
            className="w-full min-h-[48px] px-3.5 rounded-xl flex items-center gap-3 hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer text-left"
          >
            <Share2 className="w-4 h-4 opacity-75" />
            <span>Share link</span>
          </button>

          {/* Open test panel */}
          <button
            onClick={() => {
              onNavigate('https://testpanel.victuscloud.com', 'Victus Panel', 'testpanel');
              onClose();
            }}
            className="w-full min-h-[48px] px-3.5 rounded-xl flex items-center gap-3 hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer text-left"
          >
            <FlaskConical className="w-4 h-4 text-blue-400" />
            <span>Open test panel</span>
          </button>

          {/* Support */}
          <button
            onClick={() => {
              onNavigate('https://victuscloud.com/support', 'Support', 'support');
              onClose();
            }}
            className="w-full min-h-[48px] px-3.5 rounded-xl flex items-center gap-3 hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer text-left"
          >
            <LifeBuoy className="w-4 h-4 text-emerald-400" />
            <span>Support</span>
          </button>

          {/* System status */}
          <button
            onClick={() => {
              onNavigate('https://victuscloud.com/status', 'System Status', 'status');
              onClose();
            }}
            className="w-full min-h-[48px] px-3.5 rounded-xl flex items-center gap-3 hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer text-left"
          >
            <Activity className="w-4 h-4 text-amber-400" />
            <span>System status</span>
          </button>

          {/* Marketplace */}
          <button
            onClick={() => {
              onNavigate('https://victuscloud.com/marketplace', 'Marketplace', 'marketplace');
              onClose();
            }}
            className="w-full min-h-[48px] px-3.5 rounded-xl flex items-center gap-3 hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer text-left"
          >
            <ShoppingBag className="w-4 h-4 text-rose-400" />
            <span>Marketplace</span>
          </button>

          {/* Clear app session */}
          <button
            onClick={() => {
              onClose();
              onOpenClearSession();
            }}
            className="w-full min-h-[48px] px-3.5 rounded-xl flex items-center gap-3 text-red-400 hover:bg-red-500/10 active:bg-red-500/15 transition-colors cursor-pointer text-left pt-2 border-t border-white/10"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
            <span>Clear app session</span>
          </button>
        </div>
      </div>
    </div>
  );
};

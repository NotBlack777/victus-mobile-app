import React from 'react';
import { useTheme } from '../context/ThemeContext.tsx';
import { openVictusLink } from '../utils/navigation.ts';

interface ErrorOverlayProps {
  isOpen: boolean;
  message: string;
  failingUrl?: string;
  onRetry: () => void;
  onGoHome: () => void;
}

export const ErrorOverlay: React.FC<ErrorOverlayProps> = ({
  isOpen,
  message,
  failingUrl,
  onRetry,
  onGoHome,
}) => {
  const { config } = useTheme();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-sm rounded-xl p-5 border border-white/[0.08] bg-[#14141c] text-white text-center shadow-2xl relative">
        {/* "!" accent circle glyph */}
        <div className="w-12 h-12 rounded-xl mx-auto mb-3.5 bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-xl font-black">
          !
        </div>

        <h3 className="text-base font-bold text-white mb-1.5">Can't reach Victus Cloud</h3>

        <p className="text-xs text-slate-400 leading-relaxed mb-1 whitespace-pre-line">
          {message || 'Failed to establish connection to cloud node.'}
        </p>

        <p className="text-[11px] text-slate-500 mb-4">
          Check your network connection, then try again.
        </p>

        {failingUrl && (
          <p className="text-[10px] font-mono text-slate-500 truncate mb-4 px-2">
            Target: {failingUrl}
          </p>
        )}

        <div className="space-y-2">
          <button
            onClick={onRetry}
            className="w-full min-h-[40px] px-4 rounded-lg font-bold text-xs text-white bg-violet-600 hover:bg-violet-500 shadow-sm transition-all cursor-pointer active:scale-95"
          >
            Retry Connection
          </button>

          <button
            onClick={onGoHome}
            className="w-full min-h-[40px] px-4 rounded-lg font-semibold text-xs border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 transition-all cursor-pointer"
          >
            Go to Home Dashboard
          </button>

          <button
            onClick={() => {
              if (failingUrl) {
                openVictusLink(failingUrl, {
                  openLinksExternally: config.openLinksExternally,
                  title: 'Victus Cloud',
                });
              }
              onGoHome();
            }}
            className="w-full min-h-[38px] px-4 rounded-lg text-xs font-medium border border-white/[0.06] text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Open in External Browser
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { useTheme } from '../context/ThemeContext.tsx';

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
  const { gradientColors } = useTheme();

  if (!isOpen) return null;

  const [c1, c2, c3] = gradientColors;
  const accentGradient = `linear-gradient(135deg, ${c1}, ${c2}, ${c3})`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 backdrop-blur-md animate-in fade-in duration-200 select-none"
      style={{ backgroundColor: 'rgba(7, 3, 13, 0.88)' }}
    >
      <div
        className="w-full max-w-sm rounded-[28px] p-7 border text-center shadow-2xl relative"
        style={{
          backgroundColor: 'var(--sheet-bg)',
          borderColor: 'var(--sheet-stroke)',
          color: 'var(--text)',
        }}
      >
        {/* "!" accent circle glyph */}
        <div
          className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center text-white text-2xl font-black shadow-lg"
          style={{ background: accentGradient }}
        >
          !
        </div>

        <h3 className="text-xl font-bold mb-2">Can't reach Victus Cloud</h3>

        <p className="text-xs opacity-75 leading-relaxed mb-1 whitespace-pre-line">
          {message || 'Failed to establish connection to cloud node.'}
        </p>

        <p className="text-xs opacity-50 mb-6">
          Check your connection, then try again.
        </p>

        {failingUrl && (
          <p className="text-[10px] font-mono opacity-40 truncate mb-5 px-2">
            Target: {failingUrl}
          </p>
        )}

        <div className="space-y-2.5">
          <button
            onClick={onRetry}
            className="w-full min-h-[48px] px-5 rounded-2xl font-bold text-sm text-white shadow-md transition-all cursor-pointer hover:brightness-105 active:scale-98"
            style={{ background: accentGradient }}
          >
            Retry
          </button>

          <button
            onClick={onGoHome}
            className="w-full min-h-[48px] px-5 rounded-2xl font-bold text-sm border transition-all cursor-pointer hover:bg-white/5 active:scale-98"
            style={{
              borderColor: 'var(--line-soft)',
              backgroundColor: 'var(--panel)',
            }}
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
};

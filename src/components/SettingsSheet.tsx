import React, { useState } from 'react';
import { Check, RotateCcw, LogOut, ExternalLink } from 'lucide-react';
import {
  useTheme,
  DEFAULT_A,
  DEFAULT_B,
  DEFAULT_C,
  BLUE_TEAL_A,
  BLUE_TEAL_B,
  BLUE_TEAL_C,
} from '../context/ThemeContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from './Toast.tsx';

const PALETTE = [
  '#C084FC', '#7C3AED', '#4F46E5', '#2F81FF', '#22D3EE', '#13C8A6',
  '#22C55E', '#A3E635', '#FACC15', '#FB923C', '#EF4444', '#EC4899',
  '#D946EF', '#64748B', '#FFFFFF', '#0B0014',
];

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsSheet: React.FC<SettingsSheetProps> = ({ isOpen, onClose }) => {
  const {
    config,
    gradientColors,
    setPreset,
    setCustomColors,
    setReduceMotion,
    setOpenLinksExternally,
    setColorMode,
    resetToDefault,
  } = useTheme();

  const { user, signOut } = useAuth();

  const { showToast } = useToast();

  const [activePickerTarget, setActivePickerTarget] = useState<'start' | 'end' | null>(null);
  const [pickerHex, setPickerHex] = useState('');

  if (!isOpen) return null;

  const [c1, c2] = gradientColors;
  const previewGradient =
    config.preset === 'custom' && config.isCustomSolid
      ? config.customA
      : `linear-gradient(135deg, ${c1}, ${c2})`;

  const openPicker = (target: 'start' | 'end') => {
    setActivePickerTarget(target);
    setPickerHex(target === 'start' ? config.customA : config.customB);
  };

  const handleApplyColor = (color: string) => {
    if (!color.match(/^#([0-9A-Fa-f]{6})$/)) {
      showToast('Enter a valid hex color, e.g. #7C3AED');
      return;
    }
    if (activePickerTarget === 'start') {
      setCustomColors(color, config.customB, config.isCustomSolid);
    } else if (activePickerTarget === 'end') {
      setCustomColors(config.customA, color, config.isCustomSolid);
    }
    setActivePickerTarget(null);
  };

  const handleReset = () => {
    resetToDefault();
    showToast('Reset to Purple → Black');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Bottom Sheet Modal matching Screenshot_20260927-174956.png */}
      <div
        className="w-full max-w-lg rounded-t-3xl p-6 sm:p-7 border-t border-x border-white/[0.08] text-white overflow-y-auto max-h-[92vh] shadow-2xl select-none animate-in slide-in-from-bottom duration-200"
        style={{
          backgroundColor: 'var(--sheet-bg)',
          borderColor: 'var(--sheet-stroke)',
          color: 'var(--text)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Grab Handle */}
        <div className="w-12 h-1 rounded-full mx-auto mb-5 bg-white/30" />

        {/* Header Title & Subtitle */}
        <h2 className="text-2xl font-bold tracking-tight text-white">Appearance</h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1 mb-5">
          Personalize colors, gradients, and motion
        </p>

        {/* Live Preview Banner */}
        <div
          className="w-full h-20 rounded-2xl p-4 flex flex-col justify-center text-white mb-6 shadow-md transition-all relative overflow-hidden"
          style={{ background: previewGradient }}
        >
          <strong className="text-lg font-bold drop-shadow-sm">Victus Cloud</strong>
          <span className="text-xs text-white/80 drop-shadow-sm mt-0.5">
            Live preview — updates instantly
          </span>
        </div>

        {/* THEME Section */}
        <div className="mb-6">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-4">
            THEME
          </span>

          <div className="grid grid-cols-3 gap-4">
            {/* Swatch 1: Purple -> Black */}
            <button
              onClick={() => setPreset('purple_black')}
              className="flex flex-col items-center group cursor-pointer focus:outline-none"
            >
              <div
                className={`w-14 h-14 rounded-full transition-all duration-200 ${
                  config.preset === 'purple_black'
                    ? 'ring-2 ring-violet-500 ring-offset-4 ring-offset-[#0f0a1c] shadow-[0_0_15px_rgba(139,92,246,0.4)]'
                    : 'opacity-85 hover:opacity-100 hover:scale-105'
                }`}
                style={{
                  background: `linear-gradient(135deg, ${DEFAULT_A}, ${DEFAULT_B}, ${DEFAULT_C})`,
                }}
              />
              <span className="text-xs font-bold text-white mt-3 text-center">
                Purple → Black
              </span>
            </button>

            {/* Swatch 2: Blue -> Teal */}
            <button
              onClick={() => setPreset('blue_teal')}
              className="flex flex-col items-center group cursor-pointer focus:outline-none"
            >
              <div
                className={`w-14 h-14 rounded-full transition-all duration-200 ${
                  config.preset === 'blue_teal'
                    ? 'ring-2 ring-sky-400 ring-offset-4 ring-offset-[#0f0a1c] shadow-[0_0_15px_rgba(56,189,248,0.4)]'
                    : 'opacity-85 hover:opacity-100 hover:scale-105'
                }`}
                style={{
                  background: `linear-gradient(135deg, ${BLUE_TEAL_A}, ${BLUE_TEAL_B}, ${BLUE_TEAL_C})`,
                }}
              />
              <span className="text-xs font-bold text-white mt-3 text-center">
                Blue → Teal
              </span>
            </button>

            {/* Swatch 3: Custom */}
            <button
              onClick={() => setPreset('custom')}
              className="flex flex-col items-center group cursor-pointer focus:outline-none"
            >
              <div
                className={`w-14 h-14 rounded-full transition-all duration-200 ${
                  config.preset === 'custom'
                    ? 'ring-2 ring-violet-500 ring-offset-4 ring-offset-[#0f0a1c] shadow-[0_0_15px_rgba(139,92,246,0.4)]'
                    : 'opacity-85 hover:opacity-100 hover:scale-105'
                }`}
                style={{
                  background: config.isCustomSolid
                    ? config.customA
                    : `linear-gradient(135deg, ${config.customA}, ${config.customB})`,
                }}
              />
              <span className="text-xs font-bold text-white mt-3 text-center">
                Custom
              </span>
            </button>
          </div>

          {/* Custom color picker options when Custom is active */}
          {config.preset === 'custom' && (
            <div className="mt-5 p-3.5 rounded-xl bg-black/40 border border-white/[0.08] space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">Start color</span>
                <button
                  onClick={() => openPicker('start')}
                  className="w-8 h-8 rounded-lg border border-white/30 cursor-pointer shadow-sm hover:scale-105 transition-transform"
                  style={{ backgroundColor: config.customA }}
                  title="Pick start color"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <label htmlFor="solid-toggle" className="text-xs font-medium text-slate-300 cursor-pointer">
                  Solid color (no gradient)
                </label>
                <input
                  id="solid-toggle"
                  type="checkbox"
                  checked={config.isCustomSolid}
                  onChange={(e) =>
                    setCustomColors(config.customA, config.customB, e.target.checked)
                  }
                  className="w-4 h-4 cursor-pointer accent-violet-500"
                />
              </div>

              {!config.isCustomSolid && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-medium text-slate-300">End color</span>
                  <button
                    onClick={() => openPicker('end')}
                    className="w-8 h-8 rounded-lg border border-white/30 cursor-pointer shadow-sm hover:scale-105 transition-transform"
                    style={{ backgroundColor: config.customB }}
                    title="Pick end color"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Divider matching reference screenshot */}
        <div className="border-t border-white/10 my-6" />

        {/* MOTION & PERFORMANCE Section */}
        <div className="mb-6 space-y-4">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
            MOTION &amp; PERFORMANCE
          </span>

          {/* Reduce animations toggle */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <strong className="block text-base font-bold text-white">
                Reduce animations
              </strong>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed max-w-xs sm:max-w-sm">
                Turns off extra motion for a smoother, lighter feel on any device.
              </p>
            </div>

            {/* Pill Toggle Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={config.reduceMotion}
              onClick={() => setReduceMotion(!config.reduceMotion)}
              className={`w-12 h-6.5 rounded-full transition-colors relative cursor-pointer flex-shrink-0 p-0.5 ${
                config.reduceMotion ? 'bg-violet-500' : 'bg-white/20'
              }`}
            >
              <div
                className={`w-5.5 h-5.5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                  config.reduceMotion ? 'translate-x-5.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Open links externally toggle */}
          <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/[0.06]">
            <div>
              <strong className="block text-base font-bold text-white flex items-center gap-1.5">
                <span>Open links externally</span>
                <ExternalLink className="w-3.5 h-3.5 text-violet-400" />
              </strong>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed max-w-xs sm:max-w-sm">
                Opens external URLs in your device browser instead of the in-app ecosystem shell.
              </p>
            </div>

            {/* Pill Toggle Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={config.openLinksExternally}
              onClick={() => {
                const nextVal = !config.openLinksExternally;
                setOpenLinksExternally(nextVal);
                showToast(
                  nextVal
                    ? 'External links will open in device browser'
                    : 'External links will open in-app'
                );
              }}
              className={`w-12 h-6.5 rounded-full transition-colors relative cursor-pointer flex-shrink-0 p-0.5 ${
                config.openLinksExternally ? 'bg-violet-500' : 'bg-white/20'
              }`}
            >
              <div
                className={`w-5.5 h-5.5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                  config.openLinksExternally ? 'translate-x-5.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* DISPLAY MODE Section (Dark / Light / Follow System) */}
        <div className="mb-6 pt-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-3">
            DISPLAY MODE
          </span>
          <div className="grid grid-cols-3 gap-2">
            {(['dark', 'light', 'system'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setColorMode(mode)}
                className={`py-2 px-3 rounded-xl border text-xs font-bold capitalize transition-all cursor-pointer ${
                  config.colorMode === mode
                    ? 'border-violet-500 bg-violet-600/25 text-white shadow-[0_0_10px_rgba(139,92,246,0.25)]'
                    : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {mode === 'system' ? 'System' : mode}
              </button>
            ))}
          </div>
        </div>

        {/* ACCOUNT & SESSION Section */}
        {user && (
          <div className="mb-6 p-4 rounded-xl bg-black/30 border border-white/[0.08] flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Active Account
              </span>
              <strong className="block text-xs font-bold text-white truncate mt-0.5">
                {user.email}
              </strong>
            </div>

            <button
              onClick={async () => {
                await signOut();
                onClose();
                showToast('Signed out of Victus Cloud');
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-colors flex items-center gap-1.5 cursor-pointer flex-shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out</span>
            </button>
          </div>
        )}

        {/* Bottom Actions Row matching Screenshot */}
        <div className="flex items-center justify-between gap-4 pt-4 mt-2">
          <button
            onClick={handleReset}
            className="text-sm font-bold text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to default</span>
          </button>

          <button
            onClick={onClose}
            className="px-8 py-3 rounded-2xl text-sm font-bold text-white cursor-pointer transition-all hover:brightness-105 active:scale-95 shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
            }}
          >
            Done
          </button>
        </div>
      </div>

      {/* Color picker popup modal */}
      {activePickerTarget && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in zoom-in-95 duration-150"
          onClick={() => setActivePickerTarget(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl p-5 border border-white/[0.08] bg-[#14141c] text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-white mb-3">Choose color</h3>

            <div className="grid grid-cols-6 gap-2 mb-3">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => handleApplyColor(c)}
                  className="w-8 h-8 rounded-full border border-white/20 transition-transform hover:scale-110 cursor-pointer flex items-center justify-center"
                  style={{ backgroundColor: c }}
                >
                  {pickerHex.toUpperCase() === c && <Check className="w-4 h-4 text-white drop-shadow-md" />}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-7 h-7 rounded-lg border border-white/20 flex-shrink-0"
                style={{
                  backgroundColor: pickerHex.match(/^#([0-9A-Fa-f]{6})$/) ? pickerHex : '#7C3AED',
                }}
              />
              <input
                type="text"
                value={pickerHex}
                maxLength={7}
                placeholder="#RRGGBB"
                onChange={(e) => setPickerHex(e.target.value.toUpperCase())}
                className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg bg-black/40 border border-white/[0.08] text-white focus:outline-none focus:border-violet-500"
              />
            </div>

            <div className="flex justify-end gap-2 text-xs font-semibold">
              <button
                onClick={() => setActivePickerTarget(null)}
                className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleApplyColor(pickerHex)}
                className="px-4 py-1.5 rounded-lg text-white bg-violet-600 hover:bg-violet-500 cursor-pointer shadow-sm"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

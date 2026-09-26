import React, { useState } from 'react';
import { X, Check, RotateCcw } from 'lucide-react';
import { useTheme, DEFAULT_A, DEFAULT_B, DEFAULT_C, BLUE_TEAL_A, BLUE_TEAL_B, BLUE_TEAL_C } from '../context/ThemeContext.tsx';
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
    setColorMode,
    resetToDefault,
  } = useTheme();

  const { showToast } = useToast();

  const [activePickerTarget, setActivePickerTarget] = useState<'start' | 'end' | null>(null);
  const [pickerHex, setPickerHex] = useState('');

  if (!isOpen) return null;

  const [c1, c2] = gradientColors;
  const previewGradient = config.preset === 'custom' && config.isCustomSolid
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-t-[26px] p-5 sm:p-6 border-t border-x overflow-y-auto max-h-[90vh] shadow-2xl transition-all"
        style={{
          backgroundColor: 'var(--sheet-bg)',
          borderColor: 'var(--sheet-stroke)',
          color: 'var(--text)',
        }}
      >
        {/* Grab handle */}
        <div className="w-10 h-1 rounded-full mx-auto mb-4 bg-white/20" />

        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold tracking-tight">Appearance</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4 opacity-70" />
          </button>
        </div>

        <p className="text-xs opacity-60 mb-5">
          Personalize colors, gradients, and motion
        </p>

        {/* Live preview banner */}
        <div
          className="w-full h-18 rounded-[20px] p-4 flex flex-col justify-center text-white mb-6 shadow-md transition-all"
          style={{ background: previewGradient }}
        >
          <strong className="text-base font-bold drop-shadow-sm">Victus Cloud</strong>
          <span className="text-[11px] opacity-90 drop-shadow-sm">
            Live preview — updates instantly
          </span>
        </div>

        {/* Preset selection section */}
        <div className="mb-6">
          <span className="text-[11px] font-extrabold uppercase tracking-wider opacity-60 block mb-3">
            Theme Presets
          </span>

          <div className="grid grid-cols-3 gap-3">
            {/* Purple -> Black */}
            <button
              onClick={() => setPreset('purple_black')}
              className={`p-3 rounded-2xl flex flex-col items-center border transition-all cursor-pointer ${
                config.preset === 'purple_black'
                  ? 'border-purple-400 bg-purple-500/10'
                  : 'border-white/10 hover:bg-white/5'
              }`}
            >
              <div
                className="w-11 h-11 rounded-full border border-white/20 mb-2 shadow-inner"
                style={{
                  background: `linear-gradient(135deg, ${DEFAULT_A}, ${DEFAULT_B}, ${DEFAULT_C})`,
                }}
              />
              <span className="text-xs font-bold text-center">Purple → Black</span>
            </button>

            {/* Blue -> Teal */}
            <button
              onClick={() => setPreset('blue_teal')}
              className={`p-3 rounded-2xl flex flex-col items-center border transition-all cursor-pointer ${
                config.preset === 'blue_teal'
                  ? 'border-purple-400 bg-purple-500/10'
                  : 'border-white/10 hover:bg-white/5'
              }`}
            >
              <div
                className="w-11 h-11 rounded-full border border-white/20 mb-2 shadow-inner"
                style={{
                  background: `linear-gradient(135deg, ${BLUE_TEAL_A}, ${BLUE_TEAL_B}, ${BLUE_TEAL_C})`,
                }}
              />
              <span className="text-xs font-bold text-center">Blue → Teal</span>
            </button>

            {/* Custom */}
            <button
              onClick={() => setPreset('custom')}
              className={`p-3 rounded-2xl flex flex-col items-center border transition-all cursor-pointer ${
                config.preset === 'custom'
                  ? 'border-purple-400 bg-purple-500/10'
                  : 'border-white/10 hover:bg-white/5'
              }`}
            >
              <div
                className="w-11 h-11 rounded-full border border-white/20 mb-2 shadow-inner"
                style={{
                  background: config.isCustomSolid
                    ? config.customA
                    : `linear-gradient(135deg, ${config.customA}, ${config.customB})`,
                }}
              />
              <span className="text-xs font-bold text-center">Custom</span>
            </button>
          </div>
        </div>

        {/* Custom colors block */}
        {config.preset === 'custom' && (
          <div className="mb-6 p-4 rounded-2xl bg-black/20 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Start color</span>
              <button
                onClick={() => openPicker('start')}
                className="w-9 h-9 rounded-full border border-white/30 cursor-pointer shadow-sm hover:scale-105 transition-transform"
                style={{ backgroundColor: config.customA }}
                title="Pick start color"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <label htmlFor="solid-toggle" className="text-xs font-medium cursor-pointer">
                Solid color (no gradient)
              </label>
              <input
                id="solid-toggle"
                type="checkbox"
                checked={config.isCustomSolid}
                onChange={(e) =>
                  setCustomColors(config.customA, config.customB, e.target.checked)
                }
                className="w-4 h-4 accent-purple-500 cursor-pointer"
              />
            </div>

            {!config.isCustomSolid && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-medium">End color</span>
                <button
                  onClick={() => openPicker('end')}
                  className="w-9 h-9 rounded-full border border-white/30 cursor-pointer shadow-sm hover:scale-105 transition-transform"
                  style={{ backgroundColor: config.customB }}
                  title="Pick end color"
                />
              </div>
            )}
          </div>
        )}

        {/* Motion & Performance */}
        <div className="mb-6 pt-2 border-t border-white/10">
          <span className="text-[11px] font-extrabold uppercase tracking-wider opacity-60 block mb-3">
            Motion &amp; Performance
          </span>

          <div className="flex items-center justify-between gap-3">
            <div>
              <strong className="block text-xs sm:text-sm font-bold">Reduce animations</strong>
              <span className="block text-[11px] opacity-60">
                Turns off extra motion for a smoother, lighter feel on any device.
              </span>
            </div>
            <input
              type="checkbox"
              checked={config.reduceMotion}
              onChange={(e) => setReduceMotion(e.target.checked)}
              className="w-5 h-5 accent-purple-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Color Theme Mode */}
        <div className="mb-6 pt-2 border-t border-white/10">
          <span className="text-[11px] font-extrabold uppercase tracking-wider opacity-60 block mb-3">
            Display Mode
          </span>
          <div className="grid grid-cols-3 gap-2 text-xs font-bold">
            {(['dark', 'light', 'system'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setColorMode(mode)}
                className={`py-2 rounded-xl border capitalize transition-all cursor-pointer ${
                  config.colorMode === mode
                    ? 'border-purple-400 bg-purple-500/20 text-white'
                    : 'border-white/10 hover:bg-white/5 opacity-70'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/10">
          <button
            onClick={handleReset}
            className="min-h-[48px] px-4 rounded-xl text-xs font-bold text-red-400 hover:bg-white/5 flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to default
          </button>

          <button
            onClick={onClose}
            className="min-h-[48px] px-7 rounded-2xl text-sm font-bold text-white shadow-md cursor-pointer hover:brightness-105 active:scale-98"
            style={{
              background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))',
            }}
          >
            Done
          </button>
        </div>
      </div>

      {/* Color picker popup modal */}
      {activePickerTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in zoom-in-95 duration-150">
          <div
            className="w-full max-w-xs rounded-2xl p-5 border shadow-2xl"
            style={{ backgroundColor: 'var(--sheet-bg)', borderColor: 'var(--sheet-stroke)' }}
          >
            <h3 className="text-base font-bold mb-3">Choose a color</h3>

            {/* Curated 16 palette */}
            <div className="grid grid-cols-6 gap-2 mb-4">
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

            {/* Hex input */}
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-8 h-8 rounded-full border border-white/20 flex-shrink-0"
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
                className="flex-1 px-3 py-1.5 text-xs font-mono rounded-xl bg-white/10 border border-white/10 focus:outline-none focus:border-purple-400"
              />
            </div>

            <div className="flex justify-end gap-2 text-xs font-bold">
              <button
                onClick={() => setActivePickerTarget(null)}
                className="px-3 py-2 rounded-xl opacity-70 hover:opacity-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleApplyColor(pickerHex)}
                className="px-4 py-2 rounded-xl text-white cursor-pointer"
                style={{ background: 'linear-gradient(135deg, var(--accent-1), var(--accent-2))' }}
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

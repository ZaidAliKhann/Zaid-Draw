import React from 'react';
import {
  Camera,
  Eraser,
  Eye,
  EyeOff,
  FlipHorizontal2,
  Hand,
  PenTool,
  Pointer,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  NEON_PALETTE,
  type CameraStatus,
  type GestureMode,
  type ToolMode,
} from '../types/airWriter';

interface StudioSidebarProps {
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  gestureMode: GestureMode;
  onGestureModeChange: (mode: GestureMode) => void;
  activeColor: string;
  onColorChange: (hex: string) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  glowIntensity: number;
  onGlowIntensityChange: (glow: number) => void;
  backdropDim: number;
  onBackdropDimChange: (dim: number) => void;
  showSkeleton: boolean;
  onToggleSkeleton: () => void;
  mirrored: boolean;
  onToggleMirror: () => void;
  canUndo: boolean;
  hasStrokes: boolean;
  onUndo: () => void;
  onClear: () => void;
  cameraStatus: CameraStatus;
  onOpenCamera: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const BACKDROP_OPTIONS = [
  { label: 'Live', value: 0 },
  { label: 'Soft', value: 0.35 },
  { label: 'Dark', value: 0.68 },
  { label: 'Black', value: 0.96 },
];

export const StudioSidebar: React.FC<StudioSidebarProps> = ({
  toolMode,
  onToolModeChange,
  gestureMode,
  onGestureModeChange,
  activeColor,
  onColorChange,
  brushSize,
  onBrushSizeChange,
  glowIntensity,
  onGlowIntensityChange,
  backdropDim,
  onBackdropDimChange,
  showSkeleton,
  onToggleSkeleton,
  mirrored,
  onToggleMirror,
  canUndo,
  hasStrokes,
  onUndo,
  onClear,
  cameraStatus,
  onOpenCamera,
  mobileOpen,
  onCloseMobile,
}) => {
  const isManualMode = cameraStatus === 'manual-canvas';
  const isCameraReady = cameraStatus === 'ready';

  return (
    <>
      {/* Backdrop on smaller screens when drawer is open */}
      {mobileOpen && (
        <div
          aria-hidden="true"
          onClick={onCloseMobile}
          className="fixed inset-0 z-30 bg-black/75 lg:hidden"
        />
      )}

      <aside
        aria-label="Drawing controls"
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-[#0B0C0E] border-r border-[#22252D] flex flex-col justify-between overflow-y-auto transition-transform duration-200 ease-out lg:static lg:translate-x-0 lg:shrink-0 rounded-none ${
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div className="p-4 sm:p-5 space-y-5">
          {/* Mobile Drawer Header */}
          <div className="flex items-center justify-between lg:hidden pb-3 border-b border-[#22252D]">
            <span className="text-sm font-semibold text-zinc-100 font-display">
              Brush &amp; Camera Settings
            </span>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close settings"
              className="p-1.5 rounded-none border border-[#22252D] text-zinc-400 hover:text-zinc-100 hover:bg-[#16181D]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Open Camera Button inside sidebar if camera isn't active */}
          {!isCameraReady && (
            <button
              type="button"
              onClick={() => {
                onOpenCamera();
                onCloseMobile();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-none bg-zinc-100 text-zinc-950 text-xs font-semibold hover:bg-white transition-colors"
            >
              <Camera className="w-4 h-4" aria-hidden="true" />
              <span>Open Webcam</span>
            </button>
          )}

          {/* Tool Mode */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                Active Tool
              </h2>
              <span className="text-xs text-zinc-500 font-mono">
                {toolMode === 'draw' ? 'Light Ink' : 'Eraser'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 bg-[#050506] rounded-none border border-[#22252D]">
              <button
                type="button"
                onClick={() => onToolModeChange('draw')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-none text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  toolMode === 'draw'
                    ? 'bg-[#16181D] text-zinc-100 border border-[#2C303A]'
                    : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Air Pen</span>
              </button>
              <button
                type="button"
                onClick={() => onToolModeChange('eraser')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-none text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  toolMode === 'eraser'
                    ? 'bg-[#16181D] text-rose-300 border border-[#2C303A]'
                    : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Eraser</span>
              </button>
            </div>
          </section>

          {/* Color Palette */}
          <section className="space-y-3 pt-4 border-t border-[#22252D]">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                Neon Ink Palette
              </h2>
              <span className="text-xs font-mono text-zinc-400 tabular-nums uppercase">
                {activeColor}
              </span>
            </div>

            <div className="grid grid-cols-7 gap-2 items-center">
              {NEON_PALETTE.map((swatch) => {
                const isSelected =
                  toolMode === 'draw' &&
                  activeColor.toLowerCase() === swatch.hex.toLowerCase();
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    title={swatch.name}
                    aria-label={`Select ${swatch.name}`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      onColorChange(swatch.hex);
                      onToolModeChange('draw');
                    }}
                    className={`w-8 h-8 rounded-none transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 ${
                      isSelected
                        ? 'scale-105 ring-2 ring-white ring-offset-2 ring-offset-[#0B0C0E]'
                        : 'hover:scale-105 opacity-90 hover:opacity-100 border border-black/40'
                    }`}
                    style={{
                      backgroundColor: swatch.hex,
                      boxShadow: isSelected
                        ? `0 0 14px ${swatch.hex}99`
                        : `0 0 6px ${swatch.hex}40`,
                    }}
                  />
                );
              })}

              {/* Custom Color Picker */}
              <label
                title="Custom color"
                aria-label="Choose custom ink color"
                className="w-8 h-8 rounded-none border border-[#2C303A] bg-[#050506] flex items-center justify-center cursor-pointer hover:border-zinc-400 transition-colors overflow-hidden relative"
              >
                <span
                  className="w-4 h-4 rounded-none"
                  style={{
                    background:
                      'conic-gradient(#00E5FF, #FF2A85, #FFE600, #84FF00, #00E5FF)',
                  }}
                />
                <input
                  type="color"
                  value={activeColor}
                  onChange={(e) => {
                    onColorChange(e.target.value);
                    onToolModeChange('draw');
                  }}
                  className="sr-only"
                />
              </label>
            </div>
          </section>

          {/* Brush Controls */}
          <section className="space-y-4 pt-4 border-t border-[#22252D]">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="brush-size" className="font-medium text-zinc-400">
                  Brush Thickness
                </label>
                <span className="font-mono text-zinc-200 tabular-nums">
                  {brushSize} px
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  id="brush-size"
                  type="range"
                  min={4}
                  max={40}
                  step={1}
                  value={brushSize}
                  onChange={(e) => onBrushSizeChange(Number(e.target.value))}
                  className="studio-slider flex-1"
                />
                <div
                  aria-hidden="true"
                  className="w-9 h-9 rounded-none bg-[#050506] border border-[#22252D] flex items-center justify-center shrink-0"
                >
                  <span
                    className="rounded-none transition-all duration-150"
                    style={{
                      width: Math.max(4, Math.min(24, brushSize * 0.62)),
                      height: Math.max(4, Math.min(24, brushSize * 0.62)),
                      backgroundColor:
                        toolMode === 'eraser' ? '#F43F5E' : activeColor,
                      boxShadow:
                        toolMode === 'eraser'
                          ? 'none'
                          : `0 0 ${Math.round(glowIntensity * 10)}px ${activeColor}`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="glow-level" className="font-medium text-zinc-400">
                  Neon Glow
                </label>
                <span className="font-mono text-zinc-200 tabular-nums">
                  {Math.round(glowIntensity * 100)}%
                </span>
              </div>
              <input
                id="glow-level"
                type="range"
                min={0}
                max={1.4}
                step={0.1}
                value={glowIntensity}
                onChange={(e) => onGlowIntensityChange(Number(e.target.value))}
                className="studio-slider w-full"
              />
            </div>
          </section>

          {/* Hand Gesture Trigger */}
          {!isManualMode && (
            <section className="space-y-2.5 pt-4 border-t border-[#22252D]">
              <h2 className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                Drawing Gesture
              </h2>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#050506] rounded-none border border-[#22252D]">
                <button
                  type="button"
                  onClick={() => onGestureModeChange('tap-fist')}
                  className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-none text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                    gestureMode === 'tap-fist'
                      ? 'bg-[#16181D] text-zinc-100 border border-[#2C303A]'
                      : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  <Pointer className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>Tap &amp; Fist</span>
                </button>
                <button
                  type="button"
                  onClick={() => onGestureModeChange('point')}
                  className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-none text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                    gestureMode === 'point'
                      ? 'bg-[#16181D] text-zinc-100 border border-[#2C303A]'
                      : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  <Pointer className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>Index</span>
                </button>
                <button
                  type="button"
                  onClick={() => onGestureModeChange('pinch')}
                  className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-none text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                    gestureMode === 'pinch'
                      ? 'bg-[#16181D] text-zinc-100 border border-[#2C303A]'
                      : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  <Hand className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>Pinch</span>
                </button>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {gestureMode === 'tap-fist'
                  ? 'Tap your index finger toward the screen to turn Pen ON. Close all fingers into a fist to turn Pen OFF. Open your full palm to wipe & erase.'
                  : gestureMode === 'point'
                    ? 'Raise only your index finger to draw. Raise index + middle fingers to lift the pen.'
                    : 'Pinch thumb and index finger together to draw. Open fingers to move without drawing.'}
              </p>
            </section>
          )}

          {/* Camera & Backdrop Controls */}
          <section className="space-y-3 pt-4 border-t border-[#22252D]">
            <h2 className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              Camera &amp; Backdrop
            </h2>

            {!isManualMode && (
              <>
                <div className="space-y-1.5">
                  <span className="text-xs text-zinc-400 block">
                    Video Dimmer
                  </span>
                  <div className="grid grid-cols-4 gap-1 p-1 bg-[#050506] rounded-none border border-[#22252D]">
                    {BACKDROP_OPTIONS.map((opt) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => onBackdropDimChange(opt.value)}
                        className={`py-1.5 px-2 rounded-none text-xs font-medium transition-colors whitespace-nowrap ${
                          Math.abs(backdropDim - opt.value) < 0.05
                            ? 'bg-[#16181D] text-zinc-100 border border-[#2C303A]'
                            : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onToggleMirror}
                    aria-pressed={mirrored}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-none border text-xs font-medium transition-colors whitespace-nowrap ${
                      mirrored
                        ? 'bg-[#16181D] border-cyan-400/50 text-cyan-300'
                        : 'bg-[#050506] border-[#22252D] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <FlipHorizontal2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{mirrored ? 'Mirrored' : 'Normal'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onToggleSkeleton}
                    aria-pressed={showSkeleton}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-none border text-xs font-medium transition-colors whitespace-nowrap ${
                      showSkeleton
                        ? 'bg-[#16181D] border-cyan-400/50 text-cyan-300'
                        : 'bg-[#050506] border-[#22252D] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {showSkeleton ? (
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>Skeleton</span>
                  </button>
                </div>
              </>
            )}

            {/* Quick Canvas Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-none border border-[#22252D] bg-[#050506] text-xs font-medium text-zinc-200 hover:bg-[#16181D] disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Undo</span>
              </button>
              <button
                type="button"
                onClick={onClear}
                disabled={!hasStrokes}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-none border border-[#22252D] bg-[#050506] text-xs font-medium text-rose-300 hover:bg-rose-500/10 hover:border-rose-500/40 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Clear</span>
              </button>
            </div>
          </section>
        </div>

        {/* Shortcuts Footer */}
        <div className="p-4 border-t border-[#22252D] text-xs text-zinc-500 flex items-center justify-between">
          <span>Shortcuts</span>
          <span className="font-mono text-zinc-400">Ctrl+Z · E · M · C</span>
        </div>
      </aside>
    </>
  );
};

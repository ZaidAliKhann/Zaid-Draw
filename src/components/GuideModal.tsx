import React from 'react';
import { Camera, Eraser, Hand, Pointer, X } from 'lucide-react';
import type { GestureMode } from '../types/airWriter';

interface GuideModalProps {
  open: boolean;
  gestureMode: GestureMode;
  onClose: () => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({
  open,
  gestureMode,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#0B0C0E] border border-[#22252D] rounded-none p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2
              id="guide-modal-title"
              className="text-lg font-semibold text-zinc-100 font-display"
            >
              How to Write in the Air
            </h2>
            <p className="text-sm text-zinc-400">
              Position your hand about 40–70 cm from the webcam in steady lighting.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close guide"
            className="p-2 rounded-none border border-[#22252D] text-zinc-400 hover:text-zinc-100 hover:bg-[#16181D] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3.5 p-3.5 rounded-none bg-[#050506] border border-[#22252D]">
            <div className="p-2 rounded-none bg-[#16181D] border border-[#2C303A] text-cyan-300 shrink-0">
              <Pointer className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-medium text-zinc-100">
                {gestureMode === 'tap-fist'
                  ? '1. Tap Index Finger to Turn Pen ON'
                  : gestureMode === 'point'
                    ? '1. Raise Your Index Finger to Draw'
                    : '1. Pinch Thumb & Index Finger to Draw'}
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {gestureMode === 'tap-fist'
                  ? 'Point your index finger toward the screen and make a quick tap motion in the air. A glow ripple confirms the pen is ON—move your finger smoothly to write.'
                  : gestureMode === 'point'
                    ? 'Extend only your index finger with middle and ring fingers curled down. Move your fingertip smoothly to paint glowing strokes.'
                    : 'Touch your thumb tip and index fingertip together to start drawing. Release the pinch to stop the stroke.'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3.5 rounded-none bg-[#050506] border border-[#22252D]">
            <div className="p-2 rounded-none bg-[#16181D] border border-[#2C303A] text-zinc-200 shrink-0">
              <Hand className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-medium text-zinc-100">
                {gestureMode === 'tap-fist'
                  ? '2. Close Your Fist to Turn Pen OFF'
                  : gestureMode === 'point'
                    ? '2. Raise Two Fingers to Lift the Pen'
                    : '2. Open Your Hand to Lift the Pen'}
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {gestureMode === 'tap-fist'
                  ? 'Curl all your fingers into a closed fist to switch the pen OFF immediately and end your current stroke.'
                  : gestureMode === 'point'
                    ? 'Extend both your index and middle fingers together to reposition your cursor across the screen without drawing a line.'
                    : 'Separate your thumb and index finger to move the glowing reticle freely without leaving ink.'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3.5 rounded-none bg-[#050506] border border-[#22252D]">
            <div className="p-2 rounded-none bg-[#16181D] border border-[#2C303A] text-rose-300 shrink-0">
              <Eraser className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-medium text-zinc-100">
                {gestureMode === 'tap-fist'
                  ? '3. Open Full Palm to Wipe & Erase'
                  : '3. Switch Colors, Dim Video, or Save'}
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {gestureMode === 'tap-fist'
                  ? 'Spread all 5 fingers wide open to activate the large Palm Eraser. Sweep your open palm across the screen to wipe away any drawing in one pass.'
                  : 'Pick neon inks from the sidebar, dim the webcam backdrop for high-contrast light painting, or click Save Snapshot to export a PNG.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[#22252D]">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Camera className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Runs 100% locally in your browser</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-none bg-zinc-100 text-zinc-950 text-xs font-semibold hover:bg-white transition-colors"
          >
            Start Drawing
          </button>
        </div>
      </div>
    </div>
  );
};

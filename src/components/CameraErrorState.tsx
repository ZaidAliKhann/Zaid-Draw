import React from 'react';
import { Camera, CameraOff, PenLine, RefreshCw, ShieldAlert } from 'lucide-react';
import type { CameraStatus } from '../types/airWriter';

interface CameraErrorStateProps {
  status: Exclude<CameraStatus, 'ready' | 'initializing' | 'manual-canvas'>;
  errorDetail: string | null;
  onRetry: () => void;
  onUseManualCanvas: () => void;
}

export const CameraErrorState: React.FC<CameraErrorStateProps> = ({
  status,
  errorDetail,
  onRetry,
  onUseManualCanvas,
}) => {
  const copyMap: Record<
    Exclude<CameraStatus, 'ready' | 'initializing' | 'manual-canvas'>,
    {
      title: string;
      body: string;
      hint: string;
      Icon: React.ComponentType<{ className?: string }>;
    }
  > = {
    'permission-denied': {
      title: 'Camera Permission Needed',
      body: 'Browser blocked webcam access. Click the camera or lock icon in your browser address bar, allow Camera access, then click Open Camera.',
      hint: 'Tip: If previewed inside a frame, make sure browser camera access is enabled for this site.',
      Icon: ShieldAlert,
    },
    'no-camera': {
      title: 'No Webcam Detected',
      body: 'No active camera was found on this device. Connect a webcam and click Open Camera, or draw using Mouse & Touch Canvas.',
      hint: 'You can switch back to camera tracking anytime from the top bar.',
      Icon: CameraOff,
    },
    'camera-in-use': {
      title: 'Camera In Use by Another App',
      body: 'Another tab or app is currently using your webcam. Close that camera session and click Open Camera.',
      hint: 'Check Zoom, Meet, or another browser tab using the camera.',
      Icon: CameraOff,
    },
    error: {
      title: 'Could Not Start Camera',
      body:
        errorDetail ||
        'Webcam or hand-tracking failed to start. Click Open Camera to try again or use Mouse & Touch Canvas.',
      hint: 'Runs locally in your browser once webcam permission is granted.',
      Icon: Camera,
    },
  };

  const { title, body, hint, Icon } = copyMap[status];

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-[#050506]/95">
      <div className="w-full max-w-md rounded-none bg-[#0B0C0E] border border-[#22252D] p-5 sm:p-6 space-y-4 text-center">
        <div className="mx-auto w-11 h-11 rounded-none bg-[#16181D] border border-[#2C303A] flex items-center justify-center text-cyan-300">
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-base sm:text-lg font-semibold text-zinc-100 font-display">
            {title}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
            {body}
          </p>
          <p className="text-xs text-zinc-500">{hint}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={onRetry}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-none bg-zinc-100 text-zinc-950 text-xs font-semibold hover:bg-white transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Open Camera</span>
          </button>
          <button
            type="button"
            onClick={onUseManualCanvas}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-none border border-[#22252D] bg-[#050506] text-zinc-200 text-xs font-medium hover:bg-[#16181D] transition-colors whitespace-nowrap"
          >
            <PenLine className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Mouse / Touch Canvas</span>
          </button>
        </div>
      </div>
    </div>
  );
};

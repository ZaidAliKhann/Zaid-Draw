import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { HandTrackingState, Point, Stroke } from '../types/airWriter';
import { HAND_CONNECTIONS } from './handGeometry';

/**
 * Draws a single stroke with smooth quadratic Bézier interpolation and glowing neon passes.
 */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  width: number,
  height: number
): void {
  const { points, color, size, glow, isEraser, isPalmEraser } = stroke;
  if (points.length === 0) return;

  // Scale stroke thickness relative to a 1280px reference width so strokes look consistent on resize/export
  const scaleFactor = width / 1280;
  const scaledSize = Math.max(2, size * scaleFactor);

  const tracePath = () => {
    ctx.beginPath();
    const first = points[0];
    ctx.moveTo(first.x * width, first.y * height);

    if (points.length === 1) {
      ctx.lineTo(first.x * width + 0.01, first.y * height + 0.01);
      return;
    }

    if (points.length === 2) {
      ctx.lineTo(points[1].x * width, points[1].y * height);
      return;
    }

    for (let i = 1; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const midX = ((p1.x + p2.x) / 2) * width;
      const midY = ((p1.y + p2.y) / 2) * height;
      ctx.quadraticCurveTo(p1.x * width, p1.y * height, midX, midY);
    }

    const last = points[points.length - 1];
    ctx.lineTo(last.x * width, last.y * height);
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (isEraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = isPalmEraser ? scaledSize : scaledSize * 1.9;
    tracePath();
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.globalCompositeOperation = 'source-over';

  // Pass 1: Soft outer neon bloom
  if (glow > 0.05) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.45, 0.25 * glow);
    ctx.shadowColor = color;
    ctx.shadowBlur = scaledSize * 2.2 * glow;
    ctx.strokeStyle = color;
    ctx.lineWidth = scaledSize * 1.55;
    tracePath();
    ctx.stroke();
    ctx.restore();
  }

  // Pass 2: Main vibrant pigment stroke
  ctx.save();
  ctx.globalAlpha = 0.96;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow > 0.05 ? scaledSize * 1.2 * glow : 0;
  ctx.strokeStyle = color;
  ctx.lineWidth = scaledSize;
  tracePath();
  ctx.stroke();
  ctx.restore();

  // Pass 3: Bright light-painting filament core
  if (glow > 0.2 && scaledSize >= 4) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.8, 0.55 * glow);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(1.5, scaledSize * 0.34);
    tracePath();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Redraws the entire stroke stack onto a target canvas.
 */
export function renderAllStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number
): void {
  ctx.clearRect(0, 0, width, height);
  for (const stroke of strokes) {
    renderStroke(ctx, stroke, width, height);
  }
}

export interface TapRipple {
  x: number;
  y: number;
  startedAt: number;
  color: string;
}

export interface OverlayOptions {
  landmarks: NormalizedLandmark[] | null;
  cursorPoint: Point | null;
  palmPoint: Point | null;
  palmDiameterPx: number;
  trackingState: HandTrackingState;
  mirrored: boolean;
  showSkeleton: boolean;
  activeColor: string;
  brushSize: number;
  isEraser: boolean;
  tapRipple: TapRipple | null;
  now: number;
}

/**
 * Draws the live hand skeleton, glowing fingertip cursor, palm eraser disc, and tap ripple.
 */
export function renderOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: OverlayOptions
): void {
  ctx.clearRect(0, 0, width, height);

  const {
    landmarks,
    cursorPoint,
    palmPoint,
    palmDiameterPx,
    trackingState,
    mirrored,
    showSkeleton,
    activeColor,
    brushSize,
    isEraser,
    tapRipple,
    now,
  } = options;

  const mapX = (nx: number) => (mirrored ? (1 - nx) * width : nx * width);
  const mapY = (ny: number) => ny * height;

  // 1. Optional Hand Skeleton Overlay
  if (showSkeleton && landmarks && landmarks.length >= 21) {
    ctx.save();
    ctx.strokeStyle =
      trackingState === 'erasing-palm'
        ? 'rgba(251, 113, 133, 0.55)'
        : 'rgba(226, 232, 240, 0.35)';
    ctx.lineWidth = 1.5;

    for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
      const a = landmarks[startIdx];
      const b = landmarks[endIdx];
      ctx.beginPath();
      ctx.moveTo(mapX(a.x), mapY(a.y));
      ctx.lineTo(mapX(b.x), mapY(b.y));
      ctx.stroke();
    }

    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const isIndexTip = i === 8;
      ctx.beginPath();
      ctx.arc(mapX(lm.x), mapY(lm.y), isIndexTip ? 4.5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = isIndexTip
        ? isEraser || trackingState === 'erasing-palm'
          ? '#F43F5E'
          : activeColor
        : 'rgba(248, 250, 252, 0.65)';
      ctx.fill();
    }
    ctx.restore();
  }

  // 2. Tap Confirmation Ripple Animation
  if (tapRipple) {
    const age = now - tapRipple.startedAt;
    if (age >= 0 && age < 480) {
      const progress = age / 480;
      const rx = tapRipple.x * width;
      const ry = tapRipple.y * height;
      const maxR = 44 * (width / 1280);
      const r = 10 + maxR * progress;

      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.strokeStyle = tapRipple.color;
      ctx.shadowColor = tapRipple.color;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3 * (1 - progress * 0.6);
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 3. Palm Eraser Disc when full open palm is shown
  if (trackingState === 'erasing-palm' && palmPoint) {
    const px = palmPoint.x * width;
    const py = palmPoint.y * height;
    const radius = Math.max(28, (palmDiameterPx * (width / 1280)) / 2);

    ctx.save();
    ctx.fillStyle = 'rgba(244, 63, 94, 0.14)';
    ctx.strokeStyle = 'rgba(251, 113, 133, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(px, py, radius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  // 4. Live Pen / Eraser Reticle at Index Tip
  if (cursorPoint && trackingState !== 'no-hand') {
    const cx = cursorPoint.x * width;
    const cy = cursorPoint.y * height;
    const scaleFactor = width / 1280;
    const radius = Math.max(5, (brushSize * scaleFactor) / 2);

    ctx.save();
    if (trackingState === 'drawing') {
      if (isEraser) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.9, 0, Math.PI * 2);
        ctx.strokeStyle = '#F8FAFC';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#F43F5E';
        ctx.fill();
      } else {
        ctx.shadowColor = activeColor;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(2.5, radius * 0.45), 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
      }
    } else {
      // Hovering / Aiming (Pen OFF) or Paused reticle
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(9, radius + 5), 0, Math.PI * 2);
      ctx.strokeStyle =
        trackingState === 'hovering'
          ? 'rgba(248, 250, 252, 0.85)'
          : 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle =
        trackingState === 'hovering' ? activeColor : 'rgba(148, 163, 184, 0.7)';
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * Composites the live video frame (if active), backdrop dim, and all glowing strokes
 * into a crisp PNG data URL for downloading.
 */
export function exportSnapshotDataUrl(params: {
  video: HTMLVideoElement | null;
  strokes: Stroke[];
  mirrored: boolean;
  backdropDim: number;
  width: number;
  height: number;
}): string {
  const { video, strokes, mirrored, backdropDim, width, height } = params;
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = width;
  exportCanvas.height = height;
  const ctx = exportCanvas.getContext('2d');
  if (!ctx) return '';

  // Base dark background
  ctx.fillStyle = '#0B0D12';
  ctx.fillRect(0, 0, width, height);

  // Draw webcam video frame if available
  if (video && video.readyState >= 2 && video.videoWidth > 0) {
    ctx.save();
    if (mirrored) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();

    if (backdropDim > 0) {
      ctx.fillStyle = `rgba(11, 13, 18, ${backdropDim})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  // Composite strokes onto an offscreen transparent layer first so eraser strokes
  // only erase drawn ink and never punch holes through the video backdrop!
  const inkCanvas = document.createElement('canvas');
  inkCanvas.width = width;
  inkCanvas.height = height;
  const inkCtx = inkCanvas.getContext('2d');
  if (inkCtx) {
    renderAllStrokes(inkCtx, strokes, width, height);
    ctx.drawImage(inkCanvas, 0, 0);
  }

  return exportCanvas.toDataURL('image/png');
}

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { GestureMode, HandTrackingState, Point } from '../types/airWriter';

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [0, 13], [13, 14], [14, 15], [15, 16],// Ring
  [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
  [5, 9], [9, 13], [13, 17],            // Palm arch
];

function dist2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export interface FingerStatus {
  thumbExtended: boolean;
  indexExtended: boolean;
  middleExtended: boolean;
  ringExtended: boolean;
  pinkyExtended: boolean;
  isPinching: boolean;
  isClosedFist: boolean;
  isOpenPalm: boolean;
  /** Normalized pinch closeness (smaller = tighter pinch) */
  pinchRatio: number;
  /** Index tip-to-wrist / pip-to-wrist ratio */
  indexRatio: number;
  /** Palm size reference (wrist to middle MCP) */
  palmScale: number;
}

/**
 * Evaluates which fingers are extended using wrist-relative joint distances.
 * Recognizes closed fist (pen off) and full open palm (palm eraser).
 */
export function analyzeHandGesture(landmarks: NormalizedLandmark[]): FingerStatus {
  const wrist = landmarks[0];
  const palmScale = Math.max(dist2D(wrist, landmarks[9]), 0.03);

  const indexRatio =
    dist2D(wrist, landmarks[8]) / Math.max(dist2D(wrist, landmarks[6]), 0.01);
  const middleRatio =
    dist2D(wrist, landmarks[12]) / Math.max(dist2D(wrist, landmarks[10]), 0.01);
  const ringRatio =
    dist2D(wrist, landmarks[16]) / Math.max(dist2D(wrist, landmarks[14]), 0.01);
  const pinkyRatio =
    dist2D(wrist, landmarks[20]) / Math.max(dist2D(wrist, landmarks[18]), 0.01);

  const indexExtended = indexRatio > 1.12;
  const middleExtended = middleRatio > 1.12;
  const ringExtended = ringRatio > 1.12;
  const pinkyExtended = pinkyRatio > 1.12;

  // Thumb is extended when tip is significantly farther from pinky MCP than thumb IP
  const thumbExtended =
    dist2D(landmarks[4], landmarks[17]) >
    dist2D(landmarks[3], landmarks[17]) * 1.12;

  const pinchDistance = dist2D(landmarks[4], landmarks[8]);
  const pinchRatio = pinchDistance / palmScale;
  const isPinching = pinchRatio < 0.36;

  // Closed fist: all 4 main fingers curled in toward palm/wrist
  const isClosedFist =
    !indexExtended &&
    !middleExtended &&
    !ringExtended &&
    !pinkyExtended &&
    indexRatio < 1.05 &&
    middleRatio < 1.05;

  // Full open palm: all 5 fingers clearly extended
  const isOpenPalm =
    indexExtended &&
    middleExtended &&
    ringExtended &&
    pinkyExtended &&
    thumbExtended;

  return {
    thumbExtended,
    indexExtended,
    middleExtended,
    ringExtended,
    pinkyExtended,
    isPinching,
    isClosedFist,
    isOpenPalm,
    pinchRatio,
    indexRatio,
    palmScale,
  };
}

/**
 * Returns the center of the palm in normalized canvas coordinates [0, 1].
 */
export function getPalmCenter(
  landmarks: NormalizedLandmark[],
  mirrored: boolean
): Point {
  const wrist = landmarks[0];
  const indexMcp = landmarks[5];
  const middleMcp = landmarks[9];
  const pinkyMcp = landmarks[17];

  const rawX = (wrist.x + indexMcp.x + middleMcp.x + pinkyMcp.x) / 4;
  const rawY = (wrist.y + indexMcp.y + middleMcp.y + pinkyMcp.y) / 4;

  return {
    x: Math.min(1, Math.max(0, mirrored ? 1 - rawX : rawX)),
    y: Math.min(1, Math.max(0, rawY)),
  };
}

/**
 * Maps analyzed finger status + user's chosen gesture mode to an air-writing state.
 * Note: For 'tap-fist' mode, the caller passes the latched `penEngaged` flag.
 */
export function resolveTrackingState(
  status: FingerStatus,
  gestureMode: GestureMode,
  penEngaged = false
): HandTrackingState {
  if (gestureMode === 'tap-fist') {
    if (status.isOpenPalm) {
      return 'erasing-palm';
    }
    if (status.isClosedFist) {
      return 'paused';
    }
    if (status.indexExtended && !status.middleExtended && !status.ringExtended) {
      return penEngaged ? 'drawing' : 'hovering';
    }
    return penEngaged ? 'hovering' : 'paused';
  }

  if (gestureMode === 'pinch') {
    if (status.isPinching) {
      return 'drawing';
    }
    return status.indexExtended ? 'hovering' : 'paused';
  }

  // 'point' mode
  if (status.indexExtended && !status.middleExtended && !status.ringExtended) {
    return 'drawing';
  }
  if (status.indexExtended && status.middleExtended) {
    return 'hovering';
  }
  return 'paused';
}

interface TapSample {
  t: number;
  x: number;
  y: number;
  z: number;
  indexRatio: number;
}

/**
 * Detects an intentional air-tap motion with the index finger toward the screen.
 * Combines 3 natural air-tap motions so it works reliably from any webcam angle:
 *  1) Forward Z-poke toward the camera (depth pulse)
 *  2) Vertical tap dip-and-rebound (like tapping a touchscreen in mid-air)
 *  3) Quick finger-bend tap (curling tip slightly and snapping back straight)
 */
export class AirTapDetector {
  private samples: TapSample[] = [];
  private lastTapAt = 0;

  public reset(): void {
    this.samples = [];
  }

  public update(
    landmarks: NormalizedLandmark[],
    status: FingerStatus,
    now: number
  ): boolean {
    // Only listen for a tap while index finger is extended and others are folded
    const isPointingPose =
      status.indexExtended && !status.middleExtended && !status.ringExtended;

    if (!isPointingPose) {
      // Keep a tiny tail in case the tap itself briefly flexed the index finger
      if (this.samples.length > 0 && now - this.samples[this.samples.length - 1].t > 350) {
        this.samples = [];
      }
      return false;
    }

    const tip = landmarks[8];
    const mcp = landmarks[5];
    // Relative z of fingertip vs index knuckle (more negative = poked toward camera)
    const relZ = (tip.z - mcp.z) / status.palmScale;

    this.samples.push({
      t: now,
      x: tip.x,
      y: tip.y,
      z: relZ,
      indexRatio: status.indexRatio,
    });

    // Retain a 450ms sliding window
    const cutoff = now - 450;
    while (this.samples.length > 0 && this.samples[0].t < cutoff) {
      this.samples.shift();
    }

    if (now - this.lastTapAt < 650 || this.samples.length < 4) {
      return false;
    }

    // Check 1: Forward poke toward screen (relZ drops sharply then rebounds or holds)
    let maxZ = -Infinity;
    let minZ = Infinity;
    let minZIdx = 0;

    // Check 2: Quick vertical tap dip (+y down, then back up -y)
    let minY = Infinity;
    let maxY = -Infinity;
    let maxYIdx = 0;

    // Check 3: Quick index flex dip (indexRatio dips then snaps back)
    let minRatio = Infinity;
    let minRatioIdx = 0;

    for (let i = 0; i < this.samples.length; i++) {
      const s = this.samples[i];
      if (s.z > maxZ) maxZ = s.z;
      if (s.z < minZ) {
        minZ = s.z;
        minZIdx = i;
      }
      if (s.y < minY) minY = s.y;
      if (s.y > maxY) {
        maxY = s.y;
        maxYIdx = i;
      }
      if (s.indexRatio < minRatio) {
        minRatio = s.indexRatio;
        minRatioIdx = i;
      }
    }

    const latest = this.samples[this.samples.length - 1];
    const first = this.samples[0];

    // Lateral drift check: a tap happens roughly in one spot, not during a wide sweep
    const lateralDrift = Math.hypot(latest.x - first.x, latest.y - first.y);
    if (lateralDrift > status.palmScale * 1.4) {
      return false;
    }

    // 1. Z-poke tap: pushed forward by >= 0.28 * palmScale and started rebounding
    const zPokeAmplitude = maxZ - minZ;
    const zRebound = latest.z - minZ;
    const zTap =
      zPokeAmplitude > 0.28 &&
      minZIdx > 0 &&
      minZIdx < this.samples.length - 1 &&
      zRebound > 0.08;

    // 2. Vertical screen-tap motion: dipped down >= 0.14 * palmScale and lifted back up
    const yDip = maxY - minY;
    const yRebound = maxY - latest.y;
    const yTap =
      yDip > status.palmScale * 0.14 &&
      maxYIdx > 0 &&
      maxYIdx < this.samples.length - 1 &&
      yRebound > status.palmScale * 0.07;

    // 3. Quick index-nod tap: tip flexed inward and snapped straight again
    const ratioDrop = Math.max(first.indexRatio, latest.indexRatio) - minRatio;
    const ratioTap =
      ratioDrop > 0.14 &&
      minRatioIdx > 0 &&
      minRatioIdx < this.samples.length - 1 &&
      latest.indexRatio - minRatio > 0.08;

    if (zTap || yTap || ratioTap) {
      this.lastTapAt = now;
      this.samples = [];
      return true;
    }

    return false;
  }
}

/**
 * Velocity-adaptive exponential smoother (inspired by 1-Euro filtering).
 * Smooths slow handwriting jitter while keeping fast sweeps responsive.
 */
export class PointSmoother {
  private prev: Point | null = null;

  public reset(): void {
    this.prev = null;
  }

  public smooth(raw: Point): Point {
    if (!this.prev) {
      this.prev = { ...raw };
      return { ...raw };
    }

    const dx = raw.x - this.prev.x;
    const dy = raw.y - this.prev.y;
    const velocity = Math.hypot(dx, dy);

    // Deadzone tiny micro-jitter (< 0.001 of screen width)
    if (velocity < 0.001) {
      return { ...this.prev };
    }

    // Adaptive alpha: slow movement -> 0.28 (smooth), fast movement -> 0.72 (low lag)
    const minAlpha = 0.28;
    const maxAlpha = 0.72;
    const speedNorm = Math.min(velocity / 0.035, 1);
    const alpha = minAlpha + (maxAlpha - minAlpha) * speedNorm;

    const next: Point = {
      x: this.prev.x + alpha * dx,
      y: this.prev.y + alpha * dy,
    };

    this.prev = next;
    return next;
  }
}

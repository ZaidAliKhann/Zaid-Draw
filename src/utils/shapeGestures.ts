import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Point } from '../types/airWriter';
import type { HandShapeDetection, ShapeDimensions } from '../types/shapeStudio';
import { analyzeHandGesture, type FingerStatus } from './handGeometry';

function dist2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

interface HandPoseSummary {
  landmarks: NormalizedLandmark[];
  status: FingerStatus;
  centerX: number;
  centerY: number;
  centerZ: number;
  /** Number of main fingers (index, middle, ring, pinky) extended */
  extendedCount: number;
  /** Strictly 1 pointed index finger (middle, ring, pinky folded) */
  isSinglePointing: boolean;
  /** Framing pose: index extended + thumb or middle extended (used for Rectangle / Cube) */
  isFrameOrPoint: boolean;
  /** Rounded / cupped hand (semi-curled fingers forming a circle/bowl base) */
  isRoundedCup: boolean;
  /** Flat open palm */
  isFlatOpen: boolean;
}

function summarizeHand(
  landmarks: NormalizedLandmark[],
  mirrored: boolean
): HandPoseSummary {
  const status = analyzeHandGesture(landmarks);
  const wrist = landmarks[0];
  const midMcp = landmarks[9];
  const rawX = (wrist.x + midMcp.x) / 2;
  const centerX = mirrored ? 1 - rawX : rawX;
  const centerY = (wrist.y + midMcp.y) / 2;
  const centerZ = (wrist.z + midMcp.z) / 2;

  const extendedCount =
    (status.indexExtended ? 1 : 0) +
    (status.middleExtended ? 1 : 0) +
    (status.ringExtended ? 1 : 0) +
    (status.pinkyExtended ? 1 : 0);

  // Single pointed finger: ONLY index is extended (middle/ring/pinky folded)
  const isSinglePointing =
    status.indexExtended &&
    !status.middleExtended &&
    !status.ringExtended &&
    !status.pinkyExtended;

  // Frame pose: index is extended (often paired with thumb L-frame or middle finger)
  const isFrameOrPoint =
    status.indexExtended && !status.pinkyExtended;

  // Rounded / cupped hand (not a single pointed index, not a closed fist)
  const indexTipToWrist = dist2D(wrist, landmarks[8]);
  const indexPipToWrist = dist2D(wrist, landmarks[6]);
  const indexRatio = indexTipToWrist / Math.max(indexPipToWrist, 0.01);
  const thumbToIndex = dist2D(landmarks[4], landmarks[8]) / status.palmScale;

  const isRoundedCup =
    !status.isClosedFist &&
    !isSinglePointing &&
    ((indexRatio >= 0.88 && indexRatio <= 1.32) ||
      (thumbToIndex >= 0.32 && thumbToIndex <= 1.25));

  const isFlatOpen = status.isOpenPalm;

  return {
    landmarks,
    status,
    centerX,
    centerY,
    centerZ,
    extendedCount,
    isSinglePointing,
    isFrameOrPoint,
    isRoundedCup,
    isFlatOpen,
  };
}

function clampDim(val: number, min = 0.65, max = 3.2): number {
  return Math.max(min, Math.min(max, val));
}

export interface ShapeGestureResult extends HandShapeDetection {
  /** Normalized screen center [0, 1] where the shape should follow the user's hand(s) */
  handCenter: Point | null;
}

/**
 * Analyzes 1 or 2 hands from MediaPipe to recognize hollow 3D shape sculpting gestures
 * and returns the live hand center so the 3D shape follows the user's hands.
 */
export function detectHand3DShape(
  allLandmarks: NormalizedLandmark[][],
  mirrored: boolean
): ShapeGestureResult {
  const defaultDims: ShapeDimensions = { width: 1.5, height: 1.5, depth: 1.5 };

  if (!allLandmarks || allLandmarks.length === 0) {
    return {
      kind: null,
      dimensions: defaultDims,
      gestureLabel: 'Show one or two hands to move & sculpt a shape',
      handsCount: 0,
      diagonalFactor: 0,
      handCenter: null,
    };
  }

  const summaries = allLandmarks
    .filter((lm) => lm.length >= 21)
    .map((lm) => summarizeHand(lm, mirrored));

  if (summaries.length === 0) {
    return {
      kind: null,
      dimensions: defaultDims,
      gestureLabel: 'Show hands clearly to camera',
      handsCount: 0,
      diagonalFactor: 0,
      handCenter: null,
    };
  }

  // 1-HAND MODE: Shape follows the single hand smoothly across the screen
  if (summaries.length === 1) {
    const h = summaries[0];
    const center: Point = { x: h.centerX, y: h.centerY };

    if (h.isSinglePointing) {
      return {
        kind: 'cone',
        dimensions: { width: 1.4, height: 1.75, depth: 1.4 },
        gestureLabel: '1 Hand Pointing · Cone (add rounded hand below or 2nd hand)',
        handsCount: 1,
        diagonalFactor: 0,
        handCenter: center,
      };
    }

    if (h.extendedCount === 2 && h.status.indexExtended) {
      return {
        kind: 'rectangle',
        dimensions: { width: 1.9, height: 1.2, depth: 0.2 },
        gestureLabel: '1 Hand 2-Finger Frame · Rectangle (show 2nd hand to extrude Cube)',
        handsCount: 1,
        diagonalFactor: 0,
        handCenter: center,
      };
    }

    if (h.isFlatOpen) {
      return {
        kind: 'cube',
        dimensions: { width: 1.5, height: 1.5, depth: 1.5 },
        gestureLabel: '1 Hand Open · Cube (moving with hand)',
        handsCount: 1,
        diagonalFactor: 0.5,
        handCenter: center,
      };
    }

    if (h.isRoundedCup) {
      return {
        kind: 'sphere',
        dimensions: { width: 1.5, height: 1.5, depth: 1.5 },
        gestureLabel: '1 Hand Rounded · Sphere',
        handsCount: 1,
        diagonalFactor: 0,
        handCenter: center,
      };
    }

    return {
      kind: null,
      dimensions: defaultDims,
      gestureLabel: 'Move hand to position shape · Show 2 hands for Rectangle / Cube / Cone',
      handsCount: 1,
      diagonalFactor: 0,
      handCenter: center,
    };
  }

  // 2-HAND MODE: Center is midpoint between both hands
  const [hA, hB] = summaries;
  const handCenter: Point = {
    x: (hA.centerX + hB.centerX) / 2,
    y: (hA.centerY + hB.centerY) / 2,
  };

  const topHand = hA.centerY <= hB.centerY ? hA : hB;
  const bottomHand = hA.centerY <= hB.centerY ? hB : hA;

  const leftHand = hA.centerX <= hB.centerX ? hA : hB;
  const rightHand = hA.centerX <= hB.centerX ? hB : hA;

  const dx = Math.abs(rightHand.centerX - leftHand.centerX);
  const dy = Math.abs(bottomHand.centerY - topHand.centerY);
  const dz = Math.abs(hA.centerZ - hB.centerZ);

  // Measure vertical span from highest index tip to lowest finger/thumb
  const topY = Math.min(hA.landmarks[8].y, hB.landmarks[8].y, hA.centerY, hB.centerY);
  const botY = Math.max(
    hA.landmarks[4].y,
    hB.landmarks[4].y,
    hA.landmarks[0].y,
    hB.landmarks[0].y
  );
  const verticalSpan = Math.max(0.14, botY - topY);

  // 1. CONE: Strictly 1 pointed index finger on top + rounded/cupped (non-pointing) hand below
  const verticalSep = bottomHand.centerY - topHand.centerY;
  if (
    topHand.isSinglePointing &&
    !topHand.status.thumbExtended &&
    !bottomHand.isSinglePointing &&
    verticalSep > 0.08
  ) {
    const baseRadiusScale = clampDim(bottomHand.status.palmScale * 8.2, 1.0, 2.5);
    const coneHeight = clampDim(verticalSep * 4.4, 1.35, 3.0);
    return {
      kind: 'cone',
      dimensions: {
        width: baseRadiusScale,
        height: coneHeight,
        depth: baseRadiusScale,
      },
      gestureLabel: 'Pointed Finger Top + Rounded Hand Below → Cone',
      handsCount: 2,
      diagonalFactor: 0,
      handCenter,
    };
  }

  // 2. RECTANGLE vs DIAGONAL CUBE:
  // Both hands have framing/index fingers open (e.g. 2 index fingers + 2 thumbs/fingers below)
  if (
    (hA.isFrameOrPoint || hA.status.indexExtended) &&
    (hB.isFrameOrPoint || hB.status.indexExtended) &&
    !(hA.isFlatOpen && hB.isFlatOpen)
  ) {
    const diagRatio = dx > 0.06 ? dy / dx : 0;
    const isDiagonalCube =
      (dy > 0.11 && dx > 0.11 && diagRatio > 0.34) || dz > 0.055;

    const width = clampDim(dx * 3.4, 1.0, 3.0);
    const height = clampDim(verticalSpan * 3.1, 0.85, 2.6);

    if (isDiagonalCube) {
      const edge = clampDim((width + height) / 2, 1.1, 2.4);
      return {
        kind: 'cube',
        dimensions: { width: edge, height: edge, depth: edge },
        gestureLabel: 'Diagonal 2-Hand Frame → 3D Wireframe Cube',
        handsCount: 2,
        diagonalFactor: Math.min(1, Math.max(0.35, diagRatio)),
        handCenter,
      };
    }

    return {
      kind: 'rectangle',
      dimensions: { width, height, depth: 0.25 },
      gestureLabel: 'Level 2-Hand Frame → Dotted Rectangle',
      handsCount: 2,
      diagonalFactor: 0,
      handCenter,
    };
  }

  // 3. CYLINDER: Both hands flat open palms
  if (hA.isFlatOpen && hB.isFlatOpen) {
    const cylW = clampDim(dx * 2.9, 1.0, 2.4);
    const cylH = clampDim(verticalSpan * 3.4, 1.3, 2.8);
    return {
      kind: 'cylinder',
      dimensions: { width: cylW, height: cylH, depth: cylW },
      gestureLabel: 'Two Open Palms → Dotted Cylinder',
      handsCount: 2,
      diagonalFactor: 0,
      handCenter,
    };
  }

  // 4. SPHERE: Two rounded/cupped hands
  if (hA.isRoundedCup && hB.isRoundedCup) {
    const radius = clampDim(Math.max(dx * 3.2, 1.15), 1.0, 2.5);
    return {
      kind: 'sphere',
      dimensions: { width: radius, height: radius, depth: radius },
      gestureLabel: 'Two Rounded Hands → Dotted Sphere',
      handsCount: 2,
      diagonalFactor: 0,
      handCenter,
    };
  }

  return {
    kind: null,
    dimensions: defaultDims,
    gestureLabel: 'Frame with 2 index fingers (Rectangle/Cube) or Point + Cup (Cone)',
    handsCount: 2,
    diagonalFactor: 0,
    handCenter,
  };
}

export interface Point {
  /** Normalized X coordinate in [0, 1] relative to displayed canvas width */
  x: number;
  /** Normalized Y coordinate in [0, 1] relative to displayed canvas height */
  y: number;
}

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  /** Brush diameter in reference 1280px-width canvas pixels */
  size: number;
  /** Glow intensity multiplier in [0, 1.5] */
  glow: number;
  isEraser: boolean;
  /** When true, size represents exact diameter of palm eraser without extra multiplier */
  isPalmEraser?: boolean;
}

export type ToolMode = 'draw' | 'eraser';

export type GestureMode = 'tap-fist' | 'point' | 'pinch';

export type HandTrackingState =
  | 'no-hand'
  | 'drawing'
  | 'hovering'
  | 'erasing-palm'
  | 'paused';

export type CameraStatus =
  | 'initializing'
  | 'ready'
  | 'permission-denied'
  | 'no-camera'
  | 'camera-in-use'
  | 'error'
  | 'manual-canvas';

export interface ColorSwatch {
  id: string;
  name: string;
  hex: string;
}

export const NEON_PALETTE: ColorSwatch[] = [
  { id: 'neon-blue', name: 'Neon Blue', hex: '#00E5FF' },
  { id: 'electric-pink', name: 'Electric Pink', hex: '#FF2A85' },
  { id: 'lime-green', name: 'Lime Green', hex: '#84FF00' },
  { id: 'bright-yellow', name: 'Bright Yellow', hex: '#FFE600' },
  { id: 'violet-pulse', name: 'Violet Pulse', hex: '#B537F2' },
  { id: 'pure-white', name: 'Pure White', hex: '#FFFFFF' },
];

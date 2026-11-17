export type Shape3DKind =
  | 'rectangle'
  | 'cube'
  | 'cone'
  | 'sphere'
  | 'cylinder'
  | 'pyramid';

export type MaterialFinish = 'anodized' | 'ceramic' | 'neon-glass';

export interface ShapeDimensions {
  width: number;
  height: number;
  depth: number;
}

export interface PlacedShape {
  id: string;
  kind: Shape3DKind;
  color: string;
  finish: MaterialFinish;
  dimensions: ShapeDimensions;
  position: [number, number, number];
  rotationY: number;
}

export interface HandShapeDetection {
  kind: Shape3DKind | null;
  dimensions: ShapeDimensions;
  gestureLabel: string;
  handsCount: number;
  /** Normalized diagonal factor [0, 1] used to morph rectangle -> cube */
  diagonalFactor: number;
}

export const SHAPE_COLOR_OPTIONS = [
  { id: 'cyan', name: 'Electric Cyan', hex: '#00E5FF' },
  { id: 'amber', name: 'Solar Amber', hex: '#F59E0B' },
  { id: 'pink', name: 'Magenta Pulse', hex: '#FF2A85' },
  { id: 'lime', name: 'Lime Neon', hex: '#84FF00' },
  { id: 'violet', name: 'Violet Prism', hex: '#A855F7' },
  { id: 'silver', name: 'Titanium White', hex: '#E2E8F0' },
];

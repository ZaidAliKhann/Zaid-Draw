import * as THREE from 'three';
import type {
  MaterialFinish,
  Shape3DKind,
  ShapeDimensions,
} from '../types/shapeStudio';

/**
 * Probes WebGL2 renderer string for software rasterization (SwiftShader, llvmpipe, etc.).
 */
export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

/**
 * Minimal ambient + directional lighting for glowing corner nodes (no base, no grid, no floor).
 */
export function setupHollowStageLighting(scene: THREE.Scene): {
  dispose: () => void;
} {
  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  const key = new THREE.DirectionalLight(0xe0f2fe, 1.1);
  key.position.set(3, 5, 6);
  scene.add(ambient, key);

  return {
    dispose: () => {
      scene.remove(ambient, key);
    },
  };
}

function addDashedSegments(
  group: THREE.Group,
  positions: number[],
  lineMat: THREE.LineDashedMaterial,
  glowMat: THREE.LineBasicMaterial
) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  // Primary crisp dotted/dashed edge lines
  const dashedLines = new THREE.LineSegments(geo, lineMat);
  dashedLines.computeLineDistances();
  group.add(dashedLines);

  // Subtle faint connecting line underneath so dashed gaps remain legible over webcam
  const subtleGeo = geo.clone();
  const subtleLines = new THREE.LineSegments(subtleGeo, glowMat);
  group.add(subtleLines);
}

function addCornerNodes(
  group: THREE.Group,
  corners: Array<[number, number, number]>,
  colorHex: string,
  nodeRadius = 0.065
) {
  if (corners.length === 0) return;

  const outerGeo = new THREE.SphereGeometry(nodeRadius, 16, 16);
  const outerMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorHex),
  });

  const coreGeo = new THREE.SphereGeometry(nodeRadius * 0.48, 12, 12);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
  });

  const haloGeo = new THREE.SphereGeometry(nodeRadius * 1.8, 14, 14);
  const haloMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorHex),
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });

  for (const [x, y, z] of corners) {
    const outer = new THREE.Mesh(outerGeo, outerMat);
    outer.position.set(x, y, z);
    group.add(outer);

    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(x, y, z);
    group.add(core);

    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(x, y, z);
    group.add(halo);
  }
}

/**
 * Builds a pure HOLLOW 3D shape composed of bright glowing corner dots (vertices)
 * connected by dotted/dashed lines — zero solid base, zero floor, zero grid.
 */
export function buildHollowDottedShapeGroup(params: {
  kind: Shape3DKind;
  color: string;
  finish: MaterialFinish;
  dimensions: ShapeDimensions;
}): THREE.Group {
  const { kind, color, finish, dimensions } = params;
  const group = new THREE.Group();

  const w = Math.max(0.5, dimensions.width);
  const h = Math.max(0.5, dimensions.height);
  const d = Math.max(0.2, dimensions.depth);

  const primaryColor = new THREE.Color(color);
  const lineMat = new THREE.LineDashedMaterial({
    color: primaryColor,
    dashSize: finish === 'ceramic' ? 0.06 : 0.11,
    gapSize: finish === 'ceramic' ? 0.05 : 0.07,
    transparent: true,
    opacity: 0.96,
  });

  const glowMat = new THREE.LineBasicMaterial({
    color: primaryColor,
    transparent: true,
    opacity: finish === 'neon-glass' ? 0.38 : 0.22,
  });

  const corners: Array<[number, number, number]> = [];
  const edgePositions: number[] = [];

  const pushEdge = (
    a: [number, number, number],
    b: [number, number, number]
  ) => {
    edgePositions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  };

  if (kind === 'rectangle') {
    // Pure hollow rectangle centered at (0,0,0) with 4 glowing corner dots
    const hw = w / 2;
    const hh = h / 2;
    const p0: [number, number, number] = [-hw, hh, 0];
    const p1: [number, number, number] = [hw, hh, 0];
    const p2: [number, number, number] = [hw, -hh, 0];
    const p3: [number, number, number] = [-hw, -hh, 0];

    corners.push(p0, p1, p2, p3);
    pushEdge(p0, p1);
    pushEdge(p1, p2);
    pushEdge(p2, p3);
    pushEdge(p3, p0);
  } else if (kind === 'cube') {
    // Full 3D hollow cube centered at (0,0,0) with 8 corner dots & 12 dotted edges
    const hw = w / 2;
    const hh = h / 2;
    const hd = d / 2;
    const v: Array<[number, number, number]> = [
      [-hw, -hh, -hd], // 0
      [hw, -hh, -hd],  // 1
      [hw, hh, -hd],   // 2
      [-hw, hh, -hd],  // 3
      [-hw, -hh, hd],  // 4
      [hw, -hh, hd],   // 5
      [hw, hh, hd],    // 6
      [-hw, hh, hd],   // 7
    ];
    corners.push(...v);

    // Back face
    pushEdge(v[0], v[1]);
    pushEdge(v[1], v[2]);
    pushEdge(v[2], v[3]);
    pushEdge(v[3], v[0]);
    // Front face
    pushEdge(v[4], v[5]);
    pushEdge(v[5], v[6]);
    pushEdge(v[6], v[7]);
    pushEdge(v[7], v[4]);
    // Depth struts
    pushEdge(v[0], v[4]);
    pushEdge(v[1], v[5]);
    pushEdge(v[2], v[6]);
    pushEdge(v[3], v[7]);
  } else if (kind === 'cone') {
    // Pointed apex dot on top + circular base ring dots connected by dotted lines
    const radius = w * 0.52;
    const apex: [number, number, number] = [0, h / 2, 0];
    const baseY = -h / 2;
    const segments = 12;

    corners.push(apex);
    const ringPts: Array<[number, number, number]> = [];
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const pt: [number, number, number] = [
        Math.cos(angle) * radius,
        baseY,
        Math.sin(angle) * radius,
      ];
      ringPts.push(pt);
      corners.push(pt);
    }

    for (let i = 0; i < segments; i++) {
      const curr = ringPts[i];
      const next = ringPts[(i + 1) % segments];
      // Base circle dotted perimeter
      pushEdge(curr, next);
      // Slant dotted ribs up to apex (every 2nd point for clean uncluttered cone lines)
      if (i % 2 === 0) {
        pushEdge(curr, apex);
      }
    }
  } else if (kind === 'pyramid') {
    const hw = w * 0.5;
    const apex: [number, number, number] = [0, h / 2, 0];
    const baseY = -h / 2;
    const b0: [number, number, number] = [-hw, baseY, -hw];
    const b1: [number, number, number] = [hw, baseY, -hw];
    const b2: [number, number, number] = [hw, baseY, hw];
    const b3: [number, number, number] = [-hw, baseY, hw];

    corners.push(apex, b0, b1, b2, b3);
    pushEdge(b0, b1);
    pushEdge(b1, b2);
    pushEdge(b2, b3);
    pushEdge(b3, b0);
    pushEdge(b0, apex);
    pushEdge(b1, apex);
    pushEdge(b2, apex);
    pushEdge(b3, apex);
  } else if (kind === 'cylinder') {
    const radius = w * 0.46;
    const topY = h / 2;
    const botY = -h / 2;
    const segments = 10;

    const topPts: Array<[number, number, number]> = [];
    const botPts: Array<[number, number, number]> = [];

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const tp: [number, number, number] = [x, topY, z];
      const bp: [number, number, number] = [x, botY, z];
      topPts.push(tp);
      botPts.push(bp);
      corners.push(tp, bp);
    }

    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      pushEdge(topPts[i], topPts[next]);
      pushEdge(botPts[i], botPts[next]);
      if (i % 2 === 0) {
        pushEdge(topPts[i], botPts[i]);
      }
    }
  } else {
    // Hollow Wireframe Sphere (meridian + equatorial rings with glowing intersection dots)
    const r = w * 0.52;
    const rings = 3;
    const segs = 12;

    const north: [number, number, number] = [0, r, 0];
    const south: [number, number, number] = [0, -r, 0];
    corners.push(north, south);

    // Horizontal latitude rings
    for (let lat = 1; lat <= rings; lat++) {
      const phi = (lat / (rings + 1)) * Math.PI;
      const y = Math.cos(phi) * r;
      const ringR = Math.sin(phi) * r;
      const pts: Array<[number, number, number]> = [];
      for (let i = 0; i < segs; i++) {
        const theta = (i / segs) * Math.PI * 2;
        const pt: [number, number, number] = [
          Math.cos(theta) * ringR,
          y,
          Math.sin(theta) * ringR,
        ];
        pts.push(pt);
        if (i % 2 === 0) corners.push(pt);
      }
      for (let i = 0; i < segs; i++) {
        pushEdge(pts[i], pts[(i + 1) % segs]);
      }
    }

    // Vertical longitude arcs (4 meridians)
    for (let m = 0; m < 4; m++) {
      const theta = (m / 4) * Math.PI;
      const arcPts: Array<[number, number, number]> = [];
      for (let i = 0; i <= segs; i++) {
        const phi = (i / segs) * Math.PI;
        arcPts.push([
          Math.sin(phi) * Math.cos(theta) * r,
          Math.cos(phi) * r,
          Math.sin(phi) * Math.sin(theta) * r,
        ]);
      }
      for (let i = 0; i < segs; i++) {
        pushEdge(arcPts[i], arcPts[i + 1]);
      }
    }
  }

  addDashedSegments(group, edgePositions, lineMat, glowMat);
  addCornerNodes(group, corners, color, kind === 'rectangle' ? 0.072 : 0.062);

  return group;
}

/**
 * Safely disposes all geometries and materials inside a Three.js Group.
 */
export function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });
}

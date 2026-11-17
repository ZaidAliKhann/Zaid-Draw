import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import {
  Box,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Cylinder,
  Download,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  Plus,
  RectangleHorizontal,
  RotateCcw,
  Trash2,
  Triangle,
} from 'lucide-react';
import { CameraErrorState } from './CameraErrorState';
import type { CameraStatus } from '../types/airWriter';
import {
  SHAPE_COLOR_OPTIONS,
  type MaterialFinish,
  type PlacedShape,
  type Shape3DKind,
  type ShapeDimensions,
} from '../types/shapeStudio';
import { HAND_CONNECTIONS, PointSmoother } from '../utils/handGeometry';
import { detectHand3DShape } from '../utils/shapeGestures';
import {
  buildHollowDottedShapeGroup,
  detectSoftwareWebGL,
  disposeGroup,
  setupHollowStageLighting,
} from '../utils/threeSceneBuilder';

interface ShapeStudioPageProps {
  mirrored: boolean;
  onToggleMirror: () => void;
}

const SHAPE_OPTIONS: Array<{
  kind: Shape3DKind;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { kind: 'rectangle', label: 'Rectangle', Icon: RectangleHorizontal },
  { kind: 'cube', label: 'Cube', Icon: Box },
  { kind: 'cone', label: 'Cone', Icon: Triangle },
  { kind: 'sphere', label: 'Sphere', Icon: Circle },
  { kind: 'cylinder', label: 'Cylinder', Icon: Cylinder },
  { kind: 'pyramid', label: 'Pyramid', Icon: Triangle },
];

const FINISH_OPTIONS: Array<{ id: MaterialFinish; label: string }> = [
  { id: 'anodized', label: 'Dashed' },
  { id: 'ceramic', label: 'Dotted' },
  { id: 'neon-glass', label: 'Glow Wire' },
];

const ENGLISH_GESTURE_GUIDE = [
  {
    title: 'Rectangle (2-Hand Frame)',
    steps:
      'Open both index fingers on top and extend your thumbs or middle fingers below to form a level rectangular frame. Move your hands anywhere to move the shape.',
    cue: 'Level 2-hand frame',
  },
  {
    title: 'Cube (Diagonal Move)',
    steps:
      'Start from the rectangle pose and move your hands diagonally apart (one higher-left, one lower-right) to extrude it into a hollow 3D Cube.',
    cue: 'Diagonal separation',
  },
  {
    title: 'Cone (Point + Rounded Hand)',
    steps:
      'Keep one pointed index finger on top for the tip and place your other rounded/cupped hand directly below for the circular base.',
    cue: 'Pointed top + rounded base',
  },
  {
    title: 'Sphere (Cupped Hands)',
    steps:
      'Curve both hands into rounded C-shapes facing each other. Move hands wider or closer to scale the wireframe sphere.',
    cue: 'Two rounded hands',
  },
  {
    title: 'Cylinder (Open Palms)',
    steps:
      'Hold both flat open palms facing each other. Adjust spacing to change diameter and height.',
    cue: 'Two flat open palms',
  },
  {
    title: 'Move & Place Anywhere',
    steps:
      'Wherever you move your hand on screen, the hollow dotted-corner shape follows you in real time. Click Place Shape to pin it and create another.',
    cue: 'Follows hand position',
  },
];

/**
 * Maps normalized video [0,1] coordinates to CSS object-cover canvas [0,1] coordinates.
 */
function mapCoverCoords(
  nx: number,
  ny: number,
  videoW: number,
  videoH: number,
  canvasW: number,
  canvasH: number
): { x: number; y: number } {
  if (videoW <= 0 || videoH <= 0 || canvasW <= 0 || canvasH <= 0) {
    return { x: nx, y: ny };
  }
  const videoAspect = videoW / videoH;
  const canvasAspect = canvasW / canvasH;

  if (canvasAspect > videoAspect) {
    const scaleY = canvasAspect / videoAspect;
    return {
      x: nx,
      y: (ny - 0.5) * scaleY + 0.5,
    };
  }
  const scaleX = videoAspect / canvasAspect;
  return {
    x: (nx - 0.5) * scaleX + 0.5,
    y: ny,
  };
}

export const ShapeStudioPage: React.FC<ShapeStudioPageProps> = ({
  mirrored,
}) => {
  // Active 3D sculpt state
  const [activeKind, setActiveKind] = useState<Shape3DKind>('cube');
  const [activeColor, setActiveColor] = useState<string>(SHAPE_COLOR_OPTIONS[0].hex);
  const [finish, setFinish] = useState<MaterialFinish>('anodized');
  const [autoGesture, setAutoGesture] = useState<boolean>(true);
  const [arBackdrop, setArBackdrop] = useState<boolean>(true);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(true);
  const [placedShapes, setPlacedShapes] = useState<PlacedShape[]>([]);
  const [guideExpanded, setGuideExpanded] = useState<boolean>(true);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);

  // Camera & MediaPipe telemetry
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('initializing');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [gestureLabel, setGestureLabel] = useState<string>(
    'Show one or two hands to move & sculpt a shape'
  );
  const [handsCount, setHandsCount] = useState<number>(0);
  const [retryCounter, setRetryCounter] = useState<number>(0);
  const [snapshotToast, setSnapshotToast] = useState<string | null>(null);

  // DOM & Three.js refs
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const skeletonCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const activeGroupRef = useRef<THREE.Group | null>(null);
  const placedGroupRef = useRef<THREE.Group | null>(null);
  const isSoftwareGlRef = useRef<boolean>(false);

  const handPosSmootherRef = useRef<PointSmoother>(new PointSmoother());
  const targetPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const targetScaleRef = useRef<{ x: number; y: number; z: number }>({
    x: 1,
    y: 1,
    z: 1,
  });
  const baseDimsRef = useRef<ShapeDimensions>({
    width: 1.5,
    height: 1.5,
    depth: 1.5,
  });

  const settingsRef = useRef({
    mirrored,
    autoGesture,
    showSkeleton,
    activeKind,
    activeColor,
    finish,
  });

  useEffect(() => {
    settingsRef.current = {
      mirrored,
      autoGesture,
      showSkeleton,
      activeKind,
      activeColor,
      finish,
    };
  }, [mirrored, autoGesture, showSkeleton, activeKind, activeColor, finish]);

  // 1. Initialize clean Three.js WebGL Scene (no base, no grid, no floor)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    isSoftwareGlRef.current = isSoftwareGl;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const width = Math.max(300, container.clientWidth);
    const height = Math.max(240, container.clientHeight);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0, 7.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    const domEl = renderer.domElement;
    domEl.style.width = '100%';
    domEl.style.height = '100%';
    domEl.style.display = 'block';
    container.appendChild(domEl);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
    };
    domEl.addEventListener('webglcontextlost', handleContextLost);

    const lighting = setupHollowStageLighting(scene);

    const placedGroup = new THREE.Group();
    placedGroup.name = 'placed-shapes';
    scene.add(placedGroup);
    placedGroupRef.current = placedGroup;

    const controls = new OrbitControls(camera, domEl);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 3.2;
    controls.maxDistance = 12;
    controls.target.set(0, 0, 0);
    controls.update();
    controlsRef.current = controls;

    const initialGroup = buildHollowDottedShapeGroup({
      kind: settingsRef.current.activeKind,
      color: settingsRef.current.activeColor,
      finish: settingsRef.current.finish,
      dimensions: baseDimsRef.current,
    });
    scene.add(initialGroup);
    activeGroupRef.current = initialGroup;

    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = Math.max(280, container.clientWidth);
      const h = Math.max(220, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const delta = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const active = activeGroupRef.current;
      if (active) {
        // Smoothly follow hand position across screen
        const posTarget = targetPosRef.current;
        active.position.x = THREE.MathUtils.damp(
          active.position.x,
          posTarget.x,
          12,
          delta
        );
        active.position.y = THREE.MathUtils.damp(
          active.position.y,
          posTarget.y,
          12,
          delta
        );

        // Smoothly resize shape
        const tgt = targetScaleRef.current;
        active.scale.x = THREE.MathUtils.damp(active.scale.x, tgt.x, 10, delta);
        active.scale.y = THREE.MathUtils.damp(active.scale.y, tgt.y, 10, delta);
        active.scale.z = THREE.MathUtils.damp(active.scale.z, tgt.z, 10, delta);

        // Keep Rectangle upright & face-on; gently spin 3D shapes so depth & corners read clearly
        if (settingsRef.current.activeKind === 'rectangle') {
          active.rotation.x = THREE.MathUtils.damp(active.rotation.x, 0, 8, delta);
          active.rotation.y = THREE.MathUtils.damp(active.rotation.y, 0, 8, delta);
        } else {
          active.rotation.x = THREE.MathUtils.damp(
            active.rotation.x,
            0.22,
            6,
            delta
          );
          active.rotation.y += delta * 0.55;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (isSoftwareGl) {
      frameId = window.setTimeout(tick, 16);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      domEl.removeEventListener('webglcontextlost', handleContextLost);
      controls.dispose();
      if (activeGroupRef.current) {
        scene.remove(activeGroupRef.current);
        disposeGroup(activeGroupRef.current);
      }
      if (placedGroupRef.current) {
        disposeGroup(placedGroupRef.current);
        scene.remove(placedGroupRef.current);
      }
      lighting.dispose();
      renderer.dispose();
      if (domEl.parentElement === container) {
        container.removeChild(domEl);
      }
    };
  }, []);

  // 2. Rebuild hollow dotted 3D shape when kind, color, or finish changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const prevPos = activeGroupRef.current
      ? activeGroupRef.current.position.clone()
      : new THREE.Vector3(0, 0, 0);
    const prevRot = activeGroupRef.current
      ? activeGroupRef.current.rotation.clone()
      : new THREE.Euler(0, 0, 0);
    const prevScale = activeGroupRef.current
      ? activeGroupRef.current.scale.clone()
      : new THREE.Vector3(0.9, 0.9, 0.9);

    if (activeGroupRef.current) {
      scene.remove(activeGroupRef.current);
      disposeGroup(activeGroupRef.current);
    }

    const baseDims: ShapeDimensions =
      activeKind === 'rectangle'
        ? { width: 1.9, height: 1.25, depth: 0.25 }
        : activeKind === 'cone' || activeKind === 'pyramid'
          ? { width: 1.45, height: 1.85, depth: 1.45 }
          : { width: 1.45, height: 1.45, depth: 1.45 };

    baseDimsRef.current = baseDims;

    const nextGroup = buildHollowDottedShapeGroup({
      kind: activeKind,
      color: activeColor,
      finish,
      dimensions: baseDims,
    });
    nextGroup.position.copy(prevPos);
    nextGroup.rotation.copy(prevRot);
    nextGroup.scale.copy(prevScale);
    scene.add(nextGroup);
    activeGroupRef.current = nextGroup;
  }, [activeKind, activeColor, finish]);

  // 3. Sync placed shapes in the scene
  useEffect(() => {
    const placedGroup = placedGroupRef.current;
    if (!placedGroup) return;

    while (placedGroup.children.length > 0) {
      const child = placedGroup.children[0];
      placedGroup.remove(child);
      if (child instanceof THREE.Group) {
        disposeGroup(child);
      }
    }

    for (const item of placedShapes) {
      const meshGroup = buildHollowDottedShapeGroup({
        kind: item.kind,
        color: item.color,
        finish: item.finish,
        dimensions: item.dimensions,
      });
      meshGroup.position.set(...item.position);
      meshGroup.rotation.y = item.rotationY;
      placedGroup.add(meshGroup);
    }
  }, [placedShapes]);

  // 4. Initialize Webcam + 2-Hand MediaPipe HandLandmarker
  useEffect(() => {
    if (cameraStatus === 'manual-canvas') return;

    let cancelled = false;
    let rafId = 0;
    let lastVideoTime = -1;
    let candidateKind: Shape3DKind | null = null;
    let candidateFrames = 0;

    const stopMedia = () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };

    const startTracking = async () => {
      setCameraStatus('initializing');
      setErrorDetail(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('error');
        setErrorDetail(
          'Webcam capture is not supported in this browser. Switch to Manual 3D Mode to sculpt shapes with controls.'
        );
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (err: unknown) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setCameraStatus('permission-denied');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setCameraStatus('no-camera');
        } else if (name === 'NotReadableError' || name === 'TrackStartError') {
          setCameraStatus('camera-in-use');
        } else {
          setCameraStatus('error');
          setErrorDetail(
            err instanceof Error ? err.message : 'Unable to start webcam.'
          );
        }
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      const videoEl = videoRef.current;
      if (videoEl) {
        videoEl.srcObject = stream;
        await new Promise<void>((resolve) => {
          const onReady = () => {
            videoEl.removeEventListener('loadedmetadata', onReady);
            resolve();
          };
          if (videoEl.readyState >= 1) resolve();
          else videoEl.addEventListener('loadedmetadata', onReady);
        });
        await videoEl.play().catch(() => undefined);
      }

      if (!landmarkerRef.current) {
        try {
          const vision = await FilesetResolver.forVisionTasks('/wasm');
          let landmarker: HandLandmarker;
          try {
            landmarker = await HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: '/models/hand_landmarker.task',
                delegate: 'GPU',
              },
              runningMode: 'VIDEO',
              numHands: 2,
              minHandDetectionConfidence: 0.55,
              minHandPresenceConfidence: 0.55,
              minTrackingConfidence: 0.55,
            });
          } catch {
            landmarker = await HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: '/models/hand_landmarker.task',
                delegate: 'CPU',
              },
              runningMode: 'VIDEO',
              numHands: 2,
              minHandDetectionConfidence: 0.55,
              minHandPresenceConfidence: 0.55,
              minTrackingConfidence: 0.55,
            });
          }
          if (cancelled) {
            landmarker.close();
            return;
          }
          landmarkerRef.current = landmarker;
        } catch (err: unknown) {
          if (cancelled) return;
          stopMedia();
          setCameraStatus('error');
          setErrorDetail(
            err instanceof Error ? err.message : 'Hand-tracking model failed to load.'
          );
          return;
        }
      }

      if (cancelled) return;
      setCameraStatus('ready');

      const tick = (now: number) => {
        if (cancelled) return;
        const video = videoRef.current;
        const skelCanvas = skeletonCanvasRef.current;
        const landmarker = landmarkerRef.current;
        const threeCam = cameraRef.current;

        if (video && skelCanvas && landmarker && video.readyState >= 2) {
          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;

            const rect = skelCanvas.getBoundingClientRect();
            const cw = Math.max(1, Math.round(rect.width));
            const ch = Math.max(1, Math.round(rect.height));
            if (skelCanvas.width !== cw || skelCanvas.height !== ch) {
              skelCanvas.width = cw;
              skelCanvas.height = ch;
            }

            const result = landmarker.detectForVideo(video, now);
            const allLandmarks: NormalizedLandmark[][] = result.landmarks || [];

            const {
              mirrored: currMirrored,
              autoGesture: currAuto,
              showSkeleton: currSkeleton,
              activeColor: currColor,
            } = settingsRef.current;

            const detection = detectHand3DShape(allLandmarks, currMirrored);
            setHandsCount(detection.handsCount);
            setGestureLabel(detection.gestureLabel);

            // Follow user's hand position in 3D space (using exact object-cover alignment)
            if (detection.handCenter && threeCam) {
              const covered = mapCoverCoords(
                detection.handCenter.x,
                detection.handCenter.y,
                video.videoWidth,
                video.videoHeight,
                cw,
                ch
              );
              const smoothed = handPosSmootherRef.current.smooth({
                x: Math.min(0.92, Math.max(0.08, covered.x)),
                y: Math.min(0.88, Math.max(0.12, covered.y)),
              });

              const vFovRad = THREE.MathUtils.degToRad(threeCam.fov);
              const camDist = threeCam.position.length();
              const visH = 2 * Math.tan(vFovRad / 2) * camDist;
              const visW = visH * threeCam.aspect;

              targetPosRef.current = {
                x: (smoothed.x - 0.5) * visW,
                y: (0.5 - smoothed.y) * visH,
              };
            } else if (detection.handsCount === 0) {
              handPosSmootherRef.current.reset();
            }

            if (currAuto && detection.kind) {
              if (detection.kind === candidateKind) {
                candidateFrames += 1;
              } else {
                candidateKind = detection.kind;
                candidateFrames = 1;
              }

              // 3-frame stability before switching shape type
              if (
                candidateFrames >= 3 &&
                candidateKind !== settingsRef.current.activeKind
              ) {
                setActiveKind(candidateKind);
              }

              const base = baseDimsRef.current;
              targetScaleRef.current = {
                x: Math.max(0.55, Math.min(2.0, detection.dimensions.width / base.width)),
                y: Math.max(0.55, Math.min(2.0, detection.dimensions.height / base.height)),
                z: Math.max(0.55, Math.min(2.0, detection.dimensions.depth / base.depth)),
              };
            }

            // Draw subtle hand skeleton dots aligned with object-cover video
            const ctx = skelCanvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, cw, ch);
              if (currSkeleton && allLandmarks.length > 0) {
                const mapPt = (lm: NormalizedLandmark) => {
                  const nx = currMirrored ? 1 - lm.x : lm.x;
                  const covered = mapCoverCoords(
                    nx,
                    lm.y,
                    video.videoWidth,
                    video.videoHeight,
                    cw,
                    ch
                  );
                  return { x: covered.x * cw, y: covered.y * ch };
                };

                for (const hand of allLandmarks) {
                  ctx.save();
                  ctx.strokeStyle = 'rgba(148, 163, 184, 0.38)';
                  ctx.lineWidth = 1.5;
                  for (const [aIdx, bIdx] of HAND_CONNECTIONS) {
                    const a = mapPt(hand[aIdx]);
                    const b = mapPt(hand[bIdx]);
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                  }
                  for (let i = 0; i < hand.length; i++) {
                    const pt = mapPt(hand[i]);
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, i === 8 ? 4.5 : 2.5, 0, Math.PI * 2);
                    ctx.fillStyle = i === 8 ? currColor : 'rgba(248, 250, 252, 0.75)';
                    ctx.fill();
                  }
                  ctx.restore();
                }
              }
            }
          }
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
    };

    startTracking();

    return () => {
      cancelled = true;
      stopMedia();
    };
  }, [cameraStatus === 'manual-canvas' ? 'manual' : retryCounter]);

  const handlePlaceShape = useCallback(() => {
    const active = activeGroupRef.current;
    const base = baseDimsRef.current;
    const scale = active
      ? { x: active.scale.x, y: active.scale.y, z: active.scale.z }
      : { x: 1, y: 1, z: 1 };
    const pos: [number, number, number] = active
      ? [active.position.x, active.position.y, active.position.z]
      : [0, 0, 0];

    const newItem: PlacedShape = {
      id: `${Date.now()}-${placedShapes.length}`,
      kind: activeKind,
      color: activeColor,
      finish,
      dimensions: {
        width: base.width * scale.x,
        height: base.height * scale.y,
        depth: base.depth * scale.z,
      },
      position: pos,
      rotationY: active?.rotation.y ?? 0,
    };
    setPlacedShapes((prev) => [...prev, newItem]);
  }, [activeColor, activeKind, finish, placedShapes.length]);

  const handleResetView = useCallback(() => {
    targetPosRef.current = { x: 0, y: 0 };
    if (controlsRef.current && cameraRef.current) {
      cameraRef.current.position.set(0, 0, 7.2);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, []);

  const handleSnapshot = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    renderer.render(scene, camera);
    const glCanvas = renderer.domElement;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = glCanvas.width;
    exportCanvas.height = glCanvas.height;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#050506';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    const video = videoRef.current;
    if (
      arBackdrop &&
      cameraStatus === 'ready' &&
      video &&
      video.readyState >= 2
    ) {
      ctx.save();
      if (mirrored) {
        ctx.translate(exportCanvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, exportCanvas.width, exportCanvas.height);
      ctx.restore();
      ctx.fillStyle = 'rgba(5, 5, 6, 0.45)';
      ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    }

    ctx.drawImage(glCanvas, 0, 0);
    const dataUrl = exportCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `zaid-draws-3d-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    setSnapshotToast(dataUrl);
  }, [arBackdrop, cameraStatus, mirrored]);

  useEffect(() => {
    if (!snapshotToast) return;
    const t = window.setTimeout(() => setSnapshotToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [snapshotToast]);

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#050506] overflow-y-auto">
      {/* Top Studio Bar */}
      <header className="h-14 shrink-0 px-4 sm:px-6 bg-[#0B0C0E] border-b border-[#22252D] flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-100 font-display whitespace-nowrap">
            Zaid Draws
          </h1>
          <span className="hidden sm:inline text-xs text-zinc-500 whitespace-nowrap">
            / 3D Shape Studio
          </span>
          <span className="hidden lg:inline text-zinc-600" aria-hidden="true">
            ·
          </span>
          <span className="hidden lg:inline text-xs text-zinc-400 truncate">
            {gestureLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {cameraStatus !== 'ready' && cameraStatus !== 'initializing' && (
            <button
              type="button"
              onClick={() => {
                setCameraStatus('initializing');
                setRetryCounter((c) => c + 1);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-zinc-100 text-zinc-950 text-xs font-semibold hover:bg-white transition-colors whitespace-nowrap"
            >
              <Camera className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Open Camera</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setArBackdrop((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none border border-[#22252D] bg-[#050506] text-xs font-medium text-zinc-200 hover:bg-[#16181D] transition-colors whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">
              {arBackdrop ? 'AR Camera' : 'Dark Canvas'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleResetView}
            title="Center shape & reset camera"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-none border border-[#22252D] bg-[#050506] text-xs font-medium text-zinc-200 hover:bg-[#16181D] transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Center</span>
          </button>

          <button
            type="button"
            onClick={handleSnapshot}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-zinc-100 text-zinc-950 text-xs font-semibold hover:bg-white transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Snapshot</span>
          </button>
        </div>
      </header>

      {/* Clean Floating 3D Viewport (No floor grid, no base plinth) */}
      <section className="relative flex-1 min-h-[360px] bg-[#020203] overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-200 ${
            mirrored ? '-scale-x-100' : ''
          } ${
            arBackdrop && cameraStatus === 'ready' ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {arBackdrop && cameraStatus === 'ready' && (
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none bg-[#050506]/48"
          />
        )}

        <canvas
          ref={skeletonCanvasRef}
          className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity ${
            arBackdrop && cameraStatus === 'ready' ? 'opacity-100' : 'opacity-35'
          }`}
        />

        <div
          ref={mountRef}
          aria-label="Interactive hollow 3D shape viewport"
          className="absolute inset-0 w-full h-full"
        />

        <div className="absolute top-3 left-3 z-10 px-3 py-1.5 rounded-none bg-[#0B0C0E]/95 border border-[#22252D] text-xs flex items-center gap-2.5">
          <span className="font-semibold text-zinc-100 capitalize font-display">
            {activeKind}
          </span>
          <span className="text-zinc-600" aria-hidden="true">
            ·
          </span>
          <span className="font-mono text-zinc-300 tabular-nums">
            {handsCount} {handsCount === 1 ? 'hand' : 'hands'}
          </span>
          <span className="text-zinc-600" aria-hidden="true">
            ·
          </span>
          <span className="font-mono text-zinc-400 tabular-nums">
            {placedShapes.length} placed
          </span>
        </div>

        {cameraStatus === 'initializing' && (
          <div className="absolute top-3 right-3 z-10 px-3 py-1.5 rounded-none bg-[#0B0C0E]/95 border border-[#22252D] text-xs flex items-center gap-2 text-zinc-200">
            <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" aria-hidden="true" />
            <span>Starting 2-hand camera tracking…</span>
          </div>
        )}

        {(cameraStatus === 'permission-denied' ||
          cameraStatus === 'no-camera' ||
          cameraStatus === 'camera-in-use' ||
          cameraStatus === 'error') && (
          <CameraErrorState
            status={cameraStatus}
            errorDetail={errorDetail}
            onRetry={() => setRetryCounter((c) => c + 1)}
            onUseManualCanvas={() => {
              setCameraStatus('manual-canvas');
              setAutoGesture(false);
            }}
          />
        )}

        {/* Unified Collapsible Bottom Control Dock */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 w-[min(940px,96%)] flex flex-col items-center">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="mb-1 px-3 py-1 rounded-none bg-[#0B0C0E] border border-[#22252D] text-xs font-medium text-zinc-300 hover:text-zinc-100 flex items-center gap-1.5"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Show 3D Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Hide Controls</span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="w-full rounded-none bg-[#0B0C0E] border border-[#22252D] p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xl">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setAutoGesture((v) => !v)}
                  className={`px-2.5 py-1.5 rounded-none text-xs font-semibold transition-colors whitespace-nowrap border ${
                    autoGesture
                      ? 'bg-zinc-100 text-zinc-950 border-zinc-100'
                      : 'bg-[#050506] text-zinc-300 border-[#22252D]'
                  }`}
                >
                  {autoGesture ? 'Hand Sculpt: ON' : 'Manual Pick'}
                </button>

                <div className="flex items-center gap-1 bg-[#050506] p-1 rounded-none border border-[#22252D]">
                  {SHAPE_OPTIONS.map(({ kind, label, Icon }) => {
                    const isSelected = activeKind === kind;
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => {
                          setAutoGesture(false);
                          setActiveKind(kind);
                        }}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-none text-xs font-medium transition-colors whitespace-nowrap ${
                          isSelected
                            ? 'bg-[#16181D] text-zinc-100 border border-[#2C303A]'
                            : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center flex-wrap gap-2.5">
                <div className="flex items-center gap-1.5">
                  {SHAPE_COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-label={`Select ${c.name}`}
                      onClick={() => setActiveColor(c.hex)}
                      className={`w-6 h-6 rounded-none transition-transform ${
                        activeColor === c.hex
                          ? 'ring-2 ring-white scale-105'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#050506] rounded-none border border-[#22252D]">
                  {FINISH_OPTIONS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFinish(f.id)}
                      className={`px-2 py-1 rounded-none text-xs font-medium transition-colors whitespace-nowrap ${
                        finish === f.id
                          ? 'bg-[#16181D] text-zinc-100 border border-[#2C303A]'
                          : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowSkeleton((s) => !s)}
                    title="Toggle hand skeleton"
                    className="p-2 rounded-none border border-[#22252D] bg-[#050506] text-zinc-300 hover:text-zinc-100"
                  >
                    {showSkeleton ? (
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handlePlaceShape}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-none bg-emerald-400 text-zinc-950 text-xs font-semibold hover:bg-emerald-300 transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Place Shape</span>
                  </button>

                  {placedShapes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPlacedShapes([])}
                      title="Clear placed shapes"
                      className="p-2 rounded-none border border-[#22252D] bg-[#050506] text-rose-300 hover:bg-rose-500/15"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {snapshotToast && (
          <div
            role="status"
            aria-live="polite"
            className="absolute top-4 right-4 z-30 flex items-center gap-3 p-2.5 pr-4 rounded-none bg-[#0B0C0E] border border-[#2C303A] shadow-2xl"
          >
            <img
              src={snapshotToast}
              alt="Saved 3D shape snapshot"
              className="w-12 h-9 object-cover rounded-none border border-[#22252D]"
            />
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-zinc-100 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                <span>3D Snapshot saved</span>
              </p>
              <p className="text-xs text-zinc-400">PNG downloaded</p>
            </div>
          </div>
        )}
      </section>

      {/* English Hand-Gesture Guide Section Below the Viewport */}
      <section
        aria-labelledby="shape-guide-heading"
        className="shrink-0 bg-[#0B0C0E] border-t border-[#22252D] px-4 sm:px-6 py-4"
      >
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2
                id="shape-guide-heading"
                className="text-sm font-semibold text-zinc-100 font-display"
              >
                How to Sculpt 3D Shapes with Your Hands
              </h2>
              <span className="hidden sm:inline text-xs text-zinc-400">
                Each hollow shape uses glowing corner dots connected by dotted lines and follows your hands
              </span>
            </div>
            <button
              type="button"
              onClick={() => setGuideExpanded((v) => !v)}
              className="text-xs font-medium text-zinc-200 hover:text-white flex items-center gap-1 whitespace-nowrap"
            >
              <span>{guideExpanded ? 'Collapse Guide' : 'Expand Guide'}</span>
              {guideExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </div>

          {guideExpanded && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ENGLISH_GESTURE_GUIDE.map((item, idx) => (
                <div
                  key={item.title}
                  className="p-3.5 rounded-none bg-[#050506] border border-[#22252D] space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-zinc-100">
                      0{idx + 1}. {item.title}
                    </h3>
                    <span className="text-[11px] font-mono text-cyan-300 shrink-0">
                      {item.cue}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {item.steps}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

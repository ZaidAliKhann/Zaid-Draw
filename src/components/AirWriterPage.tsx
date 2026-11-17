import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import {
  Camera,
  Check,
  Download,
  Eraser,
  FlipHorizontal2,
  Hand,
  HelpCircle,
  Loader2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { CameraErrorState } from './CameraErrorState';
import { GuideModal } from './GuideModal';
import { StudioSidebar } from './StudioSidebar';
import {
  NEON_PALETTE,
  type CameraStatus,
  type GestureMode,
  type HandTrackingState,
  type Point,
  type Stroke,
  type ToolMode,
} from '../types/airWriter';
import {
  exportSnapshotDataUrl,
  renderAllStrokes,
  renderOverlay,
  renderStroke,
  type TapRipple,
} from '../utils/canvasRenderer';
import {
  AirTapDetector,
  analyzeHandGesture,
  getPalmCenter,
  PointSmoother,
  resolveTrackingState,
} from '../utils/handGeometry';

interface AirWriterPageProps {
  mirrored: boolean;
  onToggleMirror: () => void;
}

export const AirWriterPage: React.FC<AirWriterPageProps> = ({
  mirrored,
  onToggleMirror,
}) => {
  // Studio configuration state
  const [toolMode, setToolMode] = useState<ToolMode>('draw');
  const [gestureMode, setGestureMode] = useState<GestureMode>('tap-fist');
  const [activeColor, setActiveColor] = useState<string>(NEON_PALETTE[0].hex);
  const [brushSize, setBrushSize] = useState<number>(12);
  const [glowIntensity, setGlowIntensity] = useState<number>(0.9);
  const [backdropDim, setBackdropDim] = useState<number>(0.35);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(true);

  // Runtime tracking & UI state
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('initializing');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>('Starting webcam & hand model…');
  const [trackingState, setTrackingState] = useState<HandTrackingState>('no-hand');
  const [penEngaged, setPenEngaged] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(0);
  const [strokeCount, setStrokeCount] = useState<number>(0);
  const [guideOpen, setGuideOpen] = useState<boolean>(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState<boolean>(false);
  const [showHintBanner, setShowHintBanner] = useState<boolean>(true);
  const [snapshotToast, setSnapshotToast] = useState<string | null>(null);
  const [retryCounter, setRetryCounter] = useState<number>(0);

  const handleOpenCamera = useCallback(() => {
    setCameraStatus('initializing');
    setRetryCounter((c) => c + 1);
  }, []);

  // Stage sizing (keeps video + canvases in exact 1:1 coordinate lock)
  const [videoAspect, setVideoAspect] = useState<number>(16 / 9);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 960,
    height: 540,
  });

  // Refs for DOM & mutable high-frequency state
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const isPointerDownRef = useRef<boolean>(false);
  const smootherRef = useRef<PointSmoother>(new PointSmoother());
  const palmSmootherRef = useRef<PointSmoother>(new PointSmoother());
  const tapDetectorRef = useRef<AirTapDetector>(new AirTapDetector());
  const penEngagedRef = useRef<boolean>(false);
  const tapRippleRef = useRef<TapRipple | null>(null);

  // Mirror latest settings into refs for the 60fps animation loop
  const settingsRef = useRef({
    toolMode,
    gestureMode,
    activeColor,
    brushSize,
    glowIntensity,
    mirrored,
    showSkeleton,
  });

  useEffect(() => {
    settingsRef.current = {
      toolMode,
      gestureMode,
      activeColor,
      brushSize,
      glowIntensity,
      mirrored,
      showSkeleton,
    };
  }, [
    toolMode,
    gestureMode,
    activeColor,
    brushSize,
    glowIntensity,
    mirrored,
    showSkeleton,
  ]);

  useEffect(() => {
    penEngagedRef.current = false;
    setPenEngaged(false);
    tapDetectorRef.current.reset();
  }, [gestureMode]);

  // Redraw persistent canvas whenever strokes change or stage resizes
  const redrawPersistentCanvas = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderAllStrokes(ctx, strokesRef.current, canvas.width, canvas.height);
  }, []);

  // Sync canvas dimensions cleanly inside the available viewport preserving video aspect ratio
  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const pad = 24;
      const availW = Math.max(280, rect.width - pad);
      const availH = Math.max(220, rect.height - pad);

      let width = availW;
      let height = width / videoAspect;

      if (height > availH) {
        height = availH;
        width = height * videoAspect;
      }

      setStageSize({
        width: Math.floor(width),
        height: Math.floor(height),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [videoAspect]);

  // Apply crisp HiDPI pixel backing to both canvases when stageSize updates
  useEffect(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(stageSize.width * dpr));
    const h = Math.max(1, Math.round(stageSize.height * dpr));

    if (drawCanvasRef.current) {
      drawCanvasRef.current.width = w;
      drawCanvasRef.current.height = h;
    }
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = w;
      overlayCanvasRef.current.height = h;
    }

    redrawPersistentCanvas();
  }, [stageSize, redrawPersistentCanvas]);

  // Commit active in-progress stroke into persistent strokes array & drawCanvas
  const commitActiveStroke = useCallback(() => {
    const active = activeStrokeRef.current;
    if (!active) return;

    if (active.points.length > 0) {
      strokesRef.current = [...strokesRef.current, active];
      setStrokeCount(strokesRef.current.length);
      redrawPersistentCanvas();
    }
    activeStrokeRef.current = null;
  }, [redrawPersistentCanvas]);

  // Actions: Clear, Undo, Snapshot
  const handleClearCanvas = useCallback(() => {
    activeStrokeRef.current = null;
    strokesRef.current = [];
    setStrokeCount(0);
    redrawPersistentCanvas();
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }
  }, [redrawPersistentCanvas]);

  const handleUndo = useCallback(() => {
    if (activeStrokeRef.current) {
      activeStrokeRef.current = null;
    }
    if (strokesRef.current.length === 0) return;
    strokesRef.current = strokesRef.current.slice(0, -1);
    setStrokeCount(strokesRef.current.length);
    redrawPersistentCanvas();
  }, [redrawPersistentCanvas]);

  const handleSaveSnapshot = useCallback(() => {
    commitActiveStroke();
    const video = videoRef.current;
    const exportWidth =
      video && video.videoWidth > 0 ? video.videoWidth : 1280;
    const exportHeight =
      video && video.videoHeight > 0 ? video.videoHeight : 720;

    const dataUrl = exportSnapshotDataUrl({
      video: cameraStatus === 'ready' ? video : null,
      strokes: strokesRef.current,
      mirrored,
      backdropDim,
      width: exportWidth,
      height: exportHeight,
    });

    if (!dataUrl) return;

    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `air-writer-${stamp}.png`;
    link.href = dataUrl;
    link.click();

    setSnapshotToast(dataUrl);
  }, [backdropDim, cameraStatus, commitActiveStroke, mirrored]);

  useEffect(() => {
    if (!snapshotToast) return;
    const timer = window.setTimeout(() => setSnapshotToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [snapshotToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
        handleClearCanvas();
      } else if (e.key.toLowerCase() === 'e') {
        setToolMode((prev) => (prev === 'draw' ? 'eraser' : 'draw'));
      } else if (e.key.toLowerCase() === 'm') {
        onToggleMirror();
      } else if (e.key === 'Escape') {
        setGuideOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClearCanvas, handleUndo, onToggleMirror]);

  // Initialize Webcam + MediaPipe HandLandmarker + Real-time Tracking Loop
  useEffect(() => {
    if (cameraStatus === 'manual-canvas') return;

    let cancelled = false;
    let rafId = 0;
    let lastVideoTime = -1;
    let nonDrawFrames = 0;
    let noHandFrames = 0;

    let frameCounter = 0;
    let fpsWindowStart = performance.now();

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

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('error');
        setErrorDetail(
          'Your browser does not support webcam capture (MediaDevices API). You can still draw using Mouse & Touch Canvas mode.'
        );
        return;
      }

      setLoadingStep('Requesting webcam access…');
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
            err instanceof Error ? err.message : 'Unable to open webcam stream.'
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

        if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
          setVideoAspect(videoEl.videoWidth / videoEl.videoHeight);
        }
      }

      if (!handLandmarkerRef.current) {
        setLoadingStep('Loading hand-tracking vision model…');
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
              numHands: 1,
              minHandDetectionConfidence: 0.6,
              minHandPresenceConfidence: 0.6,
              minTrackingConfidence: 0.6,
            });
          } catch {
            landmarker = await HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: '/models/hand_landmarker.task',
                delegate: 'CPU',
              },
              runningMode: 'VIDEO',
              numHands: 1,
              minHandDetectionConfidence: 0.6,
              minHandPresenceConfidence: 0.6,
              minTrackingConfidence: 0.6,
            });
          }
          if (cancelled) {
            landmarker.close();
            return;
          }
          handLandmarkerRef.current = landmarker;
        } catch (err: unknown) {
          if (cancelled) return;
          stopMedia();
          setCameraStatus('error');
          setErrorDetail(
            err instanceof Error
              ? `Hand-tracking model failed to load: ${err.message}`
              : 'Hand-tracking model failed to initialize.'
          );
          return;
        }
      }

      if (cancelled) return;
      setCameraStatus('ready');

      let fistFrames = 0;
      let palmFrames = 0;

      const tick = (now: number) => {
        if (cancelled) return;

        const video = videoRef.current;
        const overlayCanvas = overlayCanvasRef.current;
        const drawCanvas = drawCanvasRef.current;
        const landmarker = handLandmarkerRef.current;

        if (
          video &&
          overlayCanvas &&
          drawCanvas &&
          landmarker &&
          video.readyState >= 2
        ) {
          if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;

            frameCounter += 1;
            const elapsed = now - fpsWindowStart;
            if (elapsed >= 500) {
              setFps(Math.round((frameCounter * 1000) / elapsed));
              frameCounter = 0;
              fpsWindowStart = now;
            }

            const result = landmarker.detectForVideo(video, now);
            const landmarks: NormalizedLandmark[] | null =
              result.landmarks && result.landmarks.length > 0
                ? result.landmarks[0]
                : null;

            const {
              toolMode: currTool,
              gestureMode: currGesture,
              activeColor: currColor,
              brushSize: currSize,
              glowIntensity: currGlow,
              mirrored: currMirrored,
              showSkeleton: currSkeleton,
            } = settingsRef.current;

            let nextState: HandTrackingState = 'no-hand';
            let cursorPoint: Point | null = null;
            let palmPoint: Point | null = null;
            let palmDiameterPx = 140;

            if (landmarks && landmarks.length >= 21) {
              noHandFrames = 0;
              const indexTip = landmarks[8];
              const rawPoint: Point = {
                x: Math.min(1, Math.max(0, currMirrored ? 1 - indexTip.x : indexTip.x)),
                y: Math.min(1, Math.max(0, indexTip.y)),
              };

              cursorPoint = smootherRef.current.smooth(rawPoint);
              const fingerStatus = analyzeHandGesture(landmarks);
              palmDiameterPx = Math.max(
                90,
                Math.min(260, Math.round(fingerStatus.palmScale * 1280 * 1.45))
              );

              if (currGesture === 'tap-fist') {
                if (fingerStatus.isOpenPalm) {
                  palmFrames += 1;
                  fistFrames = 0;
                } else if (fingerStatus.isClosedFist) {
                  fistFrames += 1;
                  palmFrames = 0;
                } else {
                  palmFrames = 0;
                  fistFrames = 0;
                }

                if (fistFrames >= 2) {
                  if (penEngagedRef.current) {
                    penEngagedRef.current = false;
                    setPenEngaged(false);
                  }
                  tapDetectorRef.current.reset();
                }

                if (palmFrames >= 3) {
                  if (penEngagedRef.current) {
                    penEngagedRef.current = false;
                    setPenEngaged(false);
                  }
                  tapDetectorRef.current.reset();
                  palmPoint = palmSmootherRef.current.smooth(
                    getPalmCenter(landmarks, currMirrored)
                  );
                  nextState = 'erasing-palm';
                } else {
                  palmSmootherRef.current.reset();
                  if (!penEngagedRef.current) {
                    const tapped = tapDetectorRef.current.update(
                      landmarks,
                      fingerStatus,
                      now
                    );
                    if (tapped) {
                      penEngagedRef.current = true;
                      setPenEngaged(true);
                      tapRippleRef.current = {
                        x: cursorPoint.x,
                        y: cursorPoint.y,
                        startedAt: now,
                        color: currColor,
                      };
                    }
                  }
                  nextState = resolveTrackingState(
                    fingerStatus,
                    currGesture,
                    penEngagedRef.current
                  );
                }
              } else {
                nextState = resolveTrackingState(fingerStatus, currGesture);
              }

              if (nextState === 'erasing-palm' && palmPoint && !isPointerDownRef.current) {
                nonDrawFrames = 0;
                if (activeStrokeRef.current && !activeStrokeRef.current.isPalmEraser) {
                  commitActiveStroke();
                }
                if (!activeStrokeRef.current) {
                  activeStrokeRef.current = {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    points: [palmPoint],
                    color: '#000000',
                    size: palmDiameterPx,
                    glow: 0,
                    isEraser: true,
                    isPalmEraser: true,
                  };
                } else {
                  const pts = activeStrokeRef.current.points;
                  const lastPt = pts[pts.length - 1];
                  if (
                    !lastPt ||
                    Math.hypot(palmPoint.x - lastPt.x, palmPoint.y - lastPt.y) >= 0.002
                  ) {
                    pts.push(palmPoint);
                  }
                  activeStrokeRef.current.size = palmDiameterPx;
                }

                const dCtx = drawCanvas.getContext('2d');
                if (dCtx) {
                  renderAllStrokes(
                    dCtx,
                    [...strokesRef.current, activeStrokeRef.current],
                    drawCanvas.width,
                    drawCanvas.height
                  );
                }
              } else if (nextState === 'drawing' && !isPointerDownRef.current) {
                nonDrawFrames = 0;
                if (activeStrokeRef.current && activeStrokeRef.current.isPalmEraser) {
                  commitActiveStroke();
                }
                if (!activeStrokeRef.current) {
                  activeStrokeRef.current = {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    points: [cursorPoint],
                    color: currColor,
                    size: currSize,
                    glow: currGlow,
                    isEraser: currTool === 'eraser',
                  };
                } else {
                  const pts = activeStrokeRef.current.points;
                  const lastPt = pts[pts.length - 1];
                  if (
                    !lastPt ||
                    Math.hypot(cursorPoint.x - lastPt.x, cursorPoint.y - lastPt.y) >=
                      0.002
                  ) {
                    pts.push(cursorPoint);
                  }
                }

                if (activeStrokeRef.current.isEraser) {
                  const dCtx = drawCanvas.getContext('2d');
                  if (dCtx) {
                    renderAllStrokes(
                      dCtx,
                      [...strokesRef.current, activeStrokeRef.current],
                      drawCanvas.width,
                      drawCanvas.height
                    );
                  }
                }
              } else if (!isPointerDownRef.current) {
                nonDrawFrames += 1;
                if (nonDrawFrames >= 2 && activeStrokeRef.current) {
                  commitActiveStroke();
                }
              }
            } else {
              noHandFrames += 1;
              fistFrames = 0;
              palmFrames = 0;
              if (noHandFrames >= 3) {
                smootherRef.current.reset();
                palmSmootherRef.current.reset();
                tapDetectorRef.current.reset();
                if (!isPointerDownRef.current && activeStrokeRef.current) {
                  commitActiveStroke();
                }
              }
            }

            setTrackingState((prev) => (prev === nextState ? prev : nextState));

            if (tapRippleRef.current && now - tapRippleRef.current.startedAt > 500) {
              tapRippleRef.current = null;
            }

            const oCtx = overlayCanvas.getContext('2d');
            if (oCtx) {
              renderOverlay(oCtx, overlayCanvas.width, overlayCanvas.height, {
                landmarks,
                cursorPoint,
                palmPoint,
                palmDiameterPx,
                trackingState: nextState,
                mirrored: currMirrored,
                showSkeleton: currSkeleton,
                activeColor: currColor,
                brushSize: currSize,
                isEraser: currTool === 'eraser',
                tapRipple: tapRippleRef.current,
                now,
              });

              if (
                activeStrokeRef.current &&
                !activeStrokeRef.current.isEraser
              ) {
                renderStroke(
                  oCtx,
                  activeStrokeRef.current,
                  overlayCanvas.width,
                  overlayCanvas.height
                );
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
  }, [cameraStatus === 'manual-canvas' ? 'manual' : retryCounter, commitActiveStroke]);

  // Pointer / Mouse / Touch direct drawing fallback & companion support
  const getNormalizedPointer = (
    e: React.PointerEvent<HTMLCanvasElement>
  ): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isPointerDownRef.current = true;
    const pt = getNormalizedPointer(e);

    activeStrokeRef.current = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      points: [pt],
      color: activeColor,
      size: brushSize,
      glow: glowIntensity,
      isEraser: toolMode === 'eraser',
    };

    if (cameraStatus === 'manual-canvas') {
      const oCtx = overlayCanvasRef.current?.getContext('2d');
      if (oCtx && overlayCanvasRef.current && !activeStrokeRef.current.isEraser) {
        oCtx.clearRect(
          0,
          0,
          overlayCanvasRef.current.width,
          overlayCanvasRef.current.height
        );
        renderStroke(
          oCtx,
          activeStrokeRef.current,
          overlayCanvasRef.current.width,
          overlayCanvasRef.current.height
        );
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isPointerDownRef.current || !activeStrokeRef.current) return;
    const pt = getNormalizedPointer(e);
    const pts = activeStrokeRef.current.points;
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(pt.x - last.x, pt.y - last.y) >= 0.002) {
      pts.push(pt);
    }

    if (activeStrokeRef.current.isEraser && drawCanvasRef.current) {
      const dCtx = drawCanvasRef.current.getContext('2d');
      if (dCtx) {
        renderAllStrokes(
          dCtx,
          [...strokesRef.current, activeStrokeRef.current],
          drawCanvasRef.current.width,
          drawCanvasRef.current.height
        );
      }
    } else if (overlayCanvasRef.current) {
      const oCtx = overlayCanvasRef.current.getContext('2d');
      if (oCtx) {
        if (cameraStatus === 'manual-canvas') {
          oCtx.clearRect(
            0,
            0,
            overlayCanvasRef.current.width,
            overlayCanvasRef.current.height
          );
        }
        renderStroke(
          oCtx,
          activeStrokeRef.current,
          overlayCanvasRef.current.width,
          overlayCanvasRef.current.height
        );
      }
    }
  };

  const handlePointerUp = () => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;
    commitActiveStroke();
    if (cameraStatus === 'manual-canvas' && overlayCanvasRef.current) {
      const oCtx = overlayCanvasRef.current.getContext('2d');
      oCtx?.clearRect(
        0,
        0,
        overlayCanvasRef.current.width,
        overlayCanvasRef.current.height
      );
    }
  };

  const getStatusDisplay = () => {
    if (cameraStatus === 'manual-canvas') {
      return {
        label: 'Mouse & Touch Canvas',
        tone: 'text-cyan-300',
        dotColor: 'bg-cyan-400',
      };
    }
    if (cameraStatus === 'initializing') {
      return {
        label: 'Initializing Camera',
        tone: 'text-slate-300',
        dotColor: 'bg-amber-400',
      };
    }
    if (cameraStatus !== 'ready') {
      return {
        label: 'Camera Offline',
        tone: 'text-rose-300',
        dotColor: 'bg-rose-400',
      };
    }
    if (trackingState === 'erasing-palm') {
      return {
        label: 'Open Palm · Wiping Canvas',
        tone: 'text-rose-300',
        dotColor: 'bg-rose-400',
      };
    }
    if (trackingState === 'drawing') {
      return {
        label:
          toolMode === 'eraser'
            ? 'Pen ON · Erasing'
            : gestureMode === 'tap-fist'
              ? 'Pen ON · Close fist to stop'
              : 'Hand Detected · Drawing',
        tone: 'text-emerald-300',
        dotColor: 'bg-emerald-400',
      };
    }
    if (trackingState === 'hovering') {
      return {
        label:
          gestureMode === 'tap-fist' && !penEngaged
            ? 'Pen OFF · Tap index finger'
            : 'Hand Detected · Pen Lifted',
        tone: 'text-cyan-300',
        dotColor: 'bg-cyan-400',
      };
    }
    if (trackingState === 'paused') {
      return {
        label:
          gestureMode === 'tap-fist'
            ? 'Pen OFF · Fist closed'
            : 'Hand Detected · Paused',
        tone: 'text-slate-300',
        dotColor: 'bg-amber-400',
      };
    }
    return {
      label: 'Show your hand to camera',
      tone: 'text-slate-400',
      dotColor: 'bg-slate-500',
    };
  };

  const statusDisplay = getStatusDisplay();
  const isManualMode = cameraStatus === 'manual-canvas';

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#050506]">
      {/* Top Bar */}
      <header className="h-14 shrink-0 px-4 sm:px-6 bg-[#0B0C0E] border-b border-[#22252D] flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2.5 shrink-0">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-100 font-display whitespace-nowrap">
            Zaid Draws
          </h1>
          <span className="hidden sm:inline text-xs font-sans text-zinc-500 whitespace-nowrap">
            / Air Writer
          </span>
        </div>

        <div className="hidden md:flex items-center gap-3 text-xs whitespace-nowrap">
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`w-2 h-2 rounded-none ${statusDisplay.dotColor}`}
            />
            <span className={`font-medium ${statusDisplay.tone}`}>
              {statusDisplay.label}
            </span>
          </span>

          {cameraStatus === 'ready' && (
            <>
              <span aria-hidden="true" className="text-zinc-600">
                ·
              </span>
              <span className="font-mono text-zinc-400 tabular-nums">
                {fps} FPS
              </span>
            </>
          )}

          <span aria-hidden="true" className="text-zinc-600">
            ·
          </span>
          <span className="font-mono text-zinc-400 tabular-nums">
            {strokeCount} {strokeCount === 1 ? 'stroke' : 'strokes'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMobileSettingsOpen((v) => !v)}
            className="lg:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-none border border-[#22252D] bg-[#050506] text-xs font-medium text-zinc-200 hover:bg-[#16181D] transition-colors whitespace-nowrap"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Settings</span>
          </button>

          {cameraStatus !== 'ready' && cameraStatus !== 'initializing' ? (
            <button
              type="button"
              onClick={handleOpenCamera}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none bg-zinc-100 text-zinc-950 text-xs font-semibold hover:bg-white transition-colors whitespace-nowrap"
            >
              <Camera className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Open Camera</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggleMirror}
              title="Toggle camera mirror (M)"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-none border border-[#22252D] bg-[#050506] text-xs font-medium text-zinc-200 hover:bg-[#16181D] transition-colors whitespace-nowrap"
            >
              <FlipHorizontal2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{mirrored ? 'Mirrored' : 'Unmirrored'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-none border border-[#22252D] bg-[#050506] text-xs font-medium text-zinc-200 hover:bg-[#16181D] transition-colors whitespace-nowrap"
          >
            <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Guide</span>
          </button>

          <button
            type="button"
            onClick={handleClearCanvas}
            disabled={strokeCount === 0}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-none border border-[#22252D] bg-[#050506] text-xs font-medium text-zinc-200 hover:text-rose-300 hover:border-rose-500/40 disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Clear Canvas</span>
          </button>

          <button
            type="button"
            onClick={handleSaveSnapshot}
            className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-none bg-zinc-100 text-zinc-950 text-xs font-semibold hover:bg-white transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Save Snapshot</span>
          </button>
        </div>
      </header>

      {/* Main Studio Body */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <StudioSidebar
          toolMode={toolMode}
          onToolModeChange={setToolMode}
          gestureMode={gestureMode}
          onGestureModeChange={setGestureMode}
          activeColor={activeColor}
          onColorChange={setActiveColor}
          brushSize={brushSize}
          onBrushSizeChange={setBrushSize}
          glowIntensity={glowIntensity}
          onGlowIntensityChange={setGlowIntensity}
          backdropDim={backdropDim}
          onBackdropDimChange={setBackdropDim}
          showSkeleton={showSkeleton}
          onToggleSkeleton={() => setShowSkeleton((s) => !s)}
          mirrored={mirrored}
          onToggleMirror={onToggleMirror}
          canUndo={strokeCount > 0}
          hasStrokes={strokeCount > 0}
          onUndo={handleUndo}
          onClear={handleClearCanvas}
          cameraStatus={cameraStatus}
          onOpenCamera={handleOpenCamera}
          mobileOpen={mobileSettingsOpen}
          onCloseMobile={() => setMobileSettingsOpen(false)}
        />

        <main
          ref={viewportRef}
          className="flex-1 min-w-0 min-h-0 relative flex items-center justify-center p-2 sm:p-4 bg-[#050506]"
        >
          <div className="md:hidden absolute top-3 left-3 z-20 px-2.5 py-1 rounded-none bg-[#0B0C0E]/95 border border-[#22252D] text-xs flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`w-2 h-2 rounded-none ${statusDisplay.dotColor}`}
            />
            <span className={`font-medium ${statusDisplay.tone}`}>
              {statusDisplay.label}
            </span>
          </div>

          <div
            className="relative rounded-none overflow-hidden border border-[#22252D] bg-[#020203] shadow-2xl"
            style={{
              width: stageSize.width,
              height: stageSize.height,
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-fill pointer-events-none transition-transform duration-150 ${
                mirrored ? '-scale-x-100' : ''
              } ${cameraStatus === 'ready' ? 'opacity-100' : 'opacity-0'}`}
            />

            {cameraStatus === 'ready' && backdropDim > 0 && (
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none transition-opacity duration-200"
                style={{ backgroundColor: `rgba(5, 5, 6, ${backdropDim})` }}
              />
            )}

            {isManualMode && (
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                  backgroundImage:
                    'radial-gradient(circle, rgba(161,161,170,0.4) 1px, transparent 1px)',
                  backgroundSize: '28px 28px',
                }}
              />
            )}

            <canvas
              ref={drawCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            <canvas
              ref={overlayCanvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
            />

            {cameraStatus === 'initializing' && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#050506]/95 p-6 text-center">
                <Loader2
                  className="w-7 h-7 text-cyan-400 animate-spin"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-100">
                    {loadingStep}
                  </p>
                  <p className="text-xs text-zinc-400">
                    Please allow webcam access if prompted by your browser.
                  </p>
                </div>
              </div>
            )}

            {(cameraStatus === 'permission-denied' ||
              cameraStatus === 'no-camera' ||
              cameraStatus === 'camera-in-use' ||
              cameraStatus === 'error') && (
              <CameraErrorState
                status={cameraStatus}
                errorDetail={errorDetail}
                onRetry={handleOpenCamera}
                onUseManualCanvas={() => setCameraStatus('manual-canvas')}
              />
            )}

            {showHintBanner &&
              (cameraStatus === 'ready' || cameraStatus === 'manual-canvas') && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 max-w-[94%] px-3.5 py-2 rounded-none bg-[#0B0C0E]/95 border border-[#22252D] flex items-center gap-3 text-xs text-zinc-200 shadow-lg">
                  <Hand
                    className="w-3.5 h-3.5 text-cyan-400 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="truncate">
                    {isManualMode
                      ? 'Drag with mouse or finger to paint glowing strokes.'
                      : gestureMode === 'tap-fist'
                        ? penEngaged
                          ? 'Pen ON: Move index finger to write · Close fist to turn Pen OFF · Open palm to wipe'
                          : 'Tap index finger toward screen to start writing · Open full palm to erase'
                        : gestureMode === 'point'
                          ? 'Use your index finger to write in the air · Raise 2 fingers to lift the pen'
                          : 'Pinch thumb and index finger to draw · Open hand to lift the pen'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowHintBanner(false)}
                    className="text-zinc-400 hover:text-zinc-100 shrink-0 font-medium"
                  >
                    Hide
                  </button>
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
                alt="Saved air drawing snapshot"
                className="w-12 h-9 object-cover rounded-none border border-[#22252D]"
              />
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-zinc-100 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Snapshot saved</span>
                </p>
                <p className="text-xs text-zinc-400">PNG downloaded</p>
              </div>
            </div>
          )}
        </main>

        {/* Compact Quick-Action Bar on <lg viewports */}
        <div className="lg:hidden h-12 shrink-0 px-3 bg-[#0B0C0E] border-t border-[#22252D] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            {NEON_PALETTE.map((swatch) => {
              const active =
                toolMode === 'draw' &&
                activeColor.toLowerCase() === swatch.hex.toLowerCase();
              return (
                <button
                  key={swatch.id}
                  type="button"
                  aria-label={`Select ${swatch.name}`}
                  onClick={() => {
                    setActiveColor(swatch.hex);
                    setToolMode('draw');
                  }}
                  className={`w-6 h-6 rounded-none shrink-0 transition-transform ${
                    active ? 'ring-2 ring-white scale-110' : 'opacity-85'
                  }`}
                  style={{ backgroundColor: swatch.hex }}
                />
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                setToolMode((m) => (m === 'draw' ? 'eraser' : 'draw'))
              }
              aria-pressed={toolMode === 'eraser'}
              className={`px-2.5 py-1.5 rounded-none text-xs font-medium flex items-center gap-1 ${
                toolMode === 'eraser'
                  ? 'bg-rose-500/20 text-rose-200 border border-rose-500/40'
                  : 'bg-[#050506] text-zinc-300 border border-[#22252D]'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Eraser</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileSettingsOpen(true)}
              className="px-2.5 py-1.5 rounded-none text-xs font-medium bg-[#050506] text-zinc-200 border border-[#22252D] flex items-center gap-1"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
              <span>More</span>
            </button>
          </div>
        </div>
      </div>

      <GuideModal
        open={guideOpen}
        gestureMode={gestureMode}
        onClose={() => setGuideOpen(false)}
      />
    </div>
  );
};

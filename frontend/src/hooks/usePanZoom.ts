import { useState, useCallback, useRef, useEffect, useLayoutEffect, type PointerEvent, type WheelEvent } from "react";
import {
  clampPanZoomScale,
  clientPointToLogicalViewportPoint,
  computeBoundedMapFrame,
  computeFittedCameraFlyInStart,
  computeInsetViewportFocus,
  computeMapFitScale,
  currentDevicePixelRatio,
  distanceBetweenPoints,
  exceedsMapTapMovement,
  mapPointFromViewportPoint,
  midpointBetweenPoints,
  PAN_ZOOM_MAX_RELATIVE_SCALE,
  PAN_ZOOM_MIN_RELATIVE_SCALE,
  snapTransformToDevicePixels,
  transformForViewportResize,
  transformForMapPointAtViewportPoint,
  type MapViewportOrientation,
  type MapContentBounds,
  type PanZoomPoint,
  type PanZoomTransform,
  type ViewportInsets,
} from "./panZoomMath";
import { useMapRecenterFade } from "./useMapRecenterFade";

type UsePanZoomOptions = {
  reducedMotion?: boolean;
  viewportOrientation?: MapViewportOrientation;
  disableProgrammaticMotion?: boolean;
  defaultFrame?: {
    bounds: MapContentBounds;
    topInset: number;
    horizontalInsetRatio?: number;
  };
  animateInitialEntrance?: boolean;
};

type ZoomToPointOptions = {
  viewportFocusRatio?: PanZoomPoint;
  viewportInsets?: ViewportInsets;
};

type ZoomToBoundsOptions = ZoomToPointOptions;

const DEFAULT_CAMERA_MOTION_DURATION_MS = 800;
const DEFAULT_CAMERA_MOTION_EASING = "cubic-bezier(0.25, 1, 0.5, 1)";
const RECENTER_FADE_ANIMATION_ID = "linewatch-ttc-map-recenter-fade";

export function usePanZoom({
  reducedMotion = false,
  viewportOrientation = "standard",
  disableProgrammaticMotion = false,
  defaultFrame,
  animateInitialEntrance = true,
}: UsePanZoomOptions = {}) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [fitScale, setFitScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const animTimeoutRef = useRef<number | null>(null);
  const initialEntranceTimeoutRef = useRef<number | null>(null);
  const programmaticAnimationFrameRef = useRef<number | null>(null);
  const wheelCommitTimeoutRef = useRef<number | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const recenterVeilRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRafRef = useRef<number | null>(null);
  const lastMoveEvent = useRef<{ clientX: number, clientY: number } | null>(null);
  const isGestureActiveRef = useRef(false);
  const activePointersRef = useRef(new Map<number, PanZoomPoint>());
  const pointerStartPointsRef = useRef(new Map<number, PanZoomPoint>());
  const pinchGestureRef = useRef<{
    startDistance: number;
    startScale: number;
    mapPointAtMidpoint: PanZoomPoint;
  } | null>(null);
  const fitScaleRef = useRef(1);
  const activeDragPointerIdRef = useRef<number | null>(null);
  const gestureMovedRef = useRef(false);
  const suppressMapClickRef = useRef(false);
  const dragPointerTypeRef = useRef<string | null>(null);
  const cameraInitializedRef = useRef(false);
  const cameraAdjustedByUserRef = useRef(false);

  const shouldAnimateProgrammaticTransform = !reducedMotion && !disableProgrammaticMotion;
  const { clearRecenterFade, playRecenterFade } = useMapRecenterFade({
    animationId: RECENTER_FADE_ANIMATION_ID,
    reducedMotion,
    direction: "out",
  });

  useEffect(() => {
    fitScaleRef.current = fitScale;
  }, [fitScale]);

  const snapTransform = useCallback((next: PanZoomTransform) => {
    return snapTransformToDevicePixels(next, currentDevicePixelRatio());
  }, []);

  const defaultTransformForViewport = useCallback((width: number, height: number) => {
    if (defaultFrame) {
      const horizontalInset = defaultFrame.horizontalInsetRatio
        ? Math.min(64, Math.max(32, width * defaultFrame.horizontalInsetRatio))
        : 0;
      return computeBoundedMapFrame(
        width,
        height,
        defaultFrame.bounds,
        {
          left: horizontalInset,
          right: horizontalInset,
          top: defaultFrame.topInset,
        },
      );
    }

    const mapWidth = 4500;
    const mapHeight = 2181.82;
    const scale = computeMapFitScale(width, height, mapWidth, mapHeight);
    return {
      x: width / 2 - (mapWidth / 2) * scale,
      y: height / 2 - (mapHeight * 0.435) * scale,
      scale,
    };
  }, [defaultFrame]);

  const writeMapTransform = useCallback((next: PanZoomTransform) => {
    if (mapRef.current) {
      mapRef.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    }
  }, []);

  const setMapTransition = useCallback((transition: string) => {
    if (mapRef.current) {
      mapRef.current.style.transition = transition;
    }
  }, []);

  const setProgrammaticCameraMotion = useCallback((active: boolean) => {
    if (containerRef.current) {
      containerRef.current.dataset.mapCameraMoving = active ? "true" : "false";
    }
  }, []);

  const setUserZoomMotion = useCallback((active: boolean) => {
    if (containerRef.current) {
      containerRef.current.dataset.mapZoomActive = active ? "true" : "false";
    }
  }, []);

  const setUserGestureMotion = useCallback((active: boolean) => {
    isGestureActiveRef.current = active;
    if (containerRef.current) {
      containerRef.current.dataset.mapGestureActive = active ? "true" : "false";
    }
  }, []);

  const isGestureActive = useCallback(() => isGestureActiveRef.current, []);

  const restoreIdleMapTransition = useCallback(() => {
    setMapTransition(shouldAnimateProgrammaticTransform ? "transform 0.1s ease-out" : "none");
  }, [setMapTransition, shouldAnimateProgrammaticTransform]);

  const commitTransform = useCallback((next: PanZoomTransform) => {
    const snapped = snapTransform(next);
    transformRef.current = snapped;
    setTransform(snapped);
  }, [snapTransform]);

  const commitTransformRef = useCallback((next: PanZoomTransform) => {
    const snapped = snapTransform(next);
    transformRef.current = snapped;
    writeMapTransform(snapped);
    return snapped;
  }, [snapTransform, writeMapTransform]);

  const currentRenderedTransform = useCallback((): PanZoomTransform | null => {
    if (!mapRef.current) return null;

    const computedTransform = window.getComputedStyle(mapRef.current).transform;
    if (!computedTransform || computedTransform === "none") {
      return null;
    }

    const matrix = new DOMMatrixReadOnly(computedTransform);
    return snapTransform({
      x: matrix.m41,
      y: matrix.m42,
      scale: matrix.a,
    });
  }, [snapTransform]);

  const clearProgrammaticAnimation = useCallback(() => {
    clearRecenterFade();
    if (initialEntranceTimeoutRef.current !== null) {
      window.clearTimeout(initialEntranceTimeoutRef.current);
      initialEntranceTimeoutRef.current = null;
    }
    if (programmaticAnimationFrameRef.current !== null) {
      cancelAnimationFrame(programmaticAnimationFrameRef.current);
      programmaticAnimationFrameRef.current = null;
    }
    if (animTimeoutRef.current) {
      window.clearTimeout(animTimeoutRef.current);
      animTimeoutRef.current = null;
    }
    if (wheelCommitTimeoutRef.current !== null) {
      window.clearTimeout(wheelCommitTimeoutRef.current);
      wheelCommitTimeoutRef.current = null;
    }
  }, [clearRecenterFade]);

  const cancelAnimation = useCallback(() => {
    const renderedTransform = currentRenderedTransform();
    clearProgrammaticAnimation();
    restoreIdleMapTransition();
    setProgrammaticCameraMotion(false);
    setUserZoomMotion(false);

    if (renderedTransform) {
      transformRef.current = renderedTransform;
      writeMapTransform(renderedTransform);
    }
  }, [clearProgrammaticAnimation, currentRenderedTransform, restoreIdleMapTransition, setProgrammaticCameraMotion, setUserZoomMotion, writeMapTransform]);

  const animateTransformTo = useCallback((
    next: PanZoomTransform,
    nextFitScale?: number,
    animate = true,
  ) => {
    if (isGestureActiveRef.current) {
      return;
    }

    const snapped = snapTransform(next);
    transformRef.current = snapped;

    clearProgrammaticAnimation();
    setUserZoomMotion(false);

    if (nextFitScale !== undefined) {
      fitScaleRef.current = nextFitScale;
    }

    if (!mapRef.current || !shouldAnimateProgrammaticTransform || !animate) {
      setMapTransition("none");
      writeMapTransform(snapped);
      setProgrammaticCameraMotion(false);
      if (nextFitScale !== undefined) {
        setFitScale(nextFitScale);
      }
      commitTransform(snapped);
      return;
    }

    const durationMs = DEFAULT_CAMERA_MOTION_DURATION_MS;
    const easing = DEFAULT_CAMERA_MOTION_EASING;
    setProgrammaticCameraMotion(true);
    setMapTransition(`transform ${durationMs}ms ${easing}`);
    // This path only runs after the map has an established transform, so the
    // browser can transition directly from that committed value. Deferring the
    // write to another animation frame adds a perceptible dead frame after an
    // overlay press without improving transition setup.
    writeMapTransform(snapped);

    animTimeoutRef.current = window.setTimeout(() => {
      animTimeoutRef.current = null;
      restoreIdleMapTransition();
      if (nextFitScale !== undefined) {
        setFitScale(nextFitScale);
      }
      setTransform({ ...transformRef.current });
      setProgrammaticCameraMotion(false);
    }, durationMs + 50);
  }, [
    clearProgrammaticAnimation,
    commitTransform,
    shouldAnimateProgrammaticTransform,
    restoreIdleMapTransition,
    setMapTransition,
    setProgrammaticCameraMotion,
    setUserZoomMotion,
    snapTransform,
    writeMapTransform,
  ]);

  const snapTransformWithFade = useCallback((
    next: PanZoomTransform,
    nextFitScale?: number,
  ) => {
    if (isGestureActiveRef.current) return;

    const snapped = snapTransform(next);
    clearProgrammaticAnimation();
    setUserZoomMotion(false);
    setMapTransition("none");
    transformRef.current = snapped;
    writeMapTransform(snapped);
    setProgrammaticCameraMotion(false);

    if (nextFitScale !== undefined) {
      fitScaleRef.current = nextFitScale;
      setFitScale(nextFitScale);
    }
    commitTransform(snapped);
    playRecenterFade(recenterVeilRef.current);
  }, [
    clearProgrammaticAnimation,
    commitTransform,
    playRecenterFade,
    setMapTransition,
    setProgrammaticCameraMotion,
    setUserZoomMotion,
    snapTransform,
    writeMapTransform,
  ]);

  // State drives controls and button updates, while the DOM owns wheel gestures
  // and in-flight camera animation. Writing only when the state itself changes
  // prevents unrelated React renders from resetting a CSS interpolation to a
  // stale transform partway through a station or impact focus.
  useLayoutEffect(() => {
    if (!isGestureActiveRef.current) {
      transformRef.current = transform;
      writeMapTransform(transform);
    }
  }, [transform, writeMapTransform]);

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
      }
      if (animTimeoutRef.current) {
        window.clearTimeout(animTimeoutRef.current);
      }
      if (programmaticAnimationFrameRef.current !== null) {
        cancelAnimationFrame(programmaticAnimationFrameRef.current);
      }
      if (wheelCommitTimeoutRef.current !== null) {
        window.clearTimeout(wheelCommitTimeoutRef.current);
      }
      setProgrammaticCameraMotion(false);
      setUserZoomMotion(false);
      setUserGestureMotion(false);
    };
  }, [setProgrammaticCameraMotion, setUserGestureMotion, setUserZoomMotion]);

  const lastDimensions = useRef({ width: 0, height: 0 });

  // Track real viewport changes without accepting background-tab layout
  // measurements. Chromium may briefly report a collapsed content rect while
  // restoring a throttled tab; committing it used to shrink the camera toward
  // the top-left origin.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const reconcileViewport = (width: number, height: number) => {
      if (document.visibilityState === "hidden" || width <= 0 || height <= 0) return;

      const previousViewport = lastDimensions.current;
      const diffW = Math.abs(previousViewport.width - width);
      const diffH = Math.abs(previousViewport.height - height);

      // Ignore subpixel variations to prevent layout feedback loops from layer promotion.
      if (diffW < 1 && diffH < 1) return;

      const defaultTransform = defaultTransformForViewport(width, height);
      const newFit = defaultTransform.scale;
      const current = transformRef.current;
      const previousFit = fitScaleRef.current;
      const next = previousViewport.width <= 0
        || previousViewport.height <= 0
        || (current.scale === 1 && previousFit === 1)
        ? defaultTransform
        : transformForViewportResize(
            current,
            previousViewport,
            { width, height },
            previousFit,
            newFit,
          );
      const snapped = snapTransformToDevicePixels(next, currentDevicePixelRatio());

      lastDimensions.current = { width, height };
      fitScaleRef.current = newFit;
      transformRef.current = snapped;
      setFitScale(newFit);
      setTransform(snapped);
    };

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        reconcileViewport(entry.contentRect.width, entry.contentRect.height);
      }
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      window.requestAnimationFrame(() => {
        if (!containerRef.current) return;
        reconcileViewport(containerRef.current.clientWidth, containerRef.current.clientHeight);
      });
    };

    observer.observe(el);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [defaultTransformForViewport]);

  const logicalViewportSize = useCallback(() => {
    const element = containerRef.current;
    if (!element) return { width: 0, height: 0 };
    return {
      width: element.clientWidth,
      height: element.clientHeight,
    };
  }, []);

  const pointFromClientPoint = useCallback((clientX: number, clientY: number): PanZoomPoint => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: clientX, y: clientY };
    }

    return clientPointToLogicalViewportPoint(
      { x: clientX, y: clientY },
      rect,
      viewportOrientation,
    );
  }, [viewportOrientation]);

  const pointerPointFromEvent = useCallback((event: PointerEvent<HTMLDivElement>): PanZoomPoint => {
    return pointFromClientPoint(event.clientX, event.clientY);
  }, [pointFromClientPoint]);

  const pointersArray = useCallback(() => {
    return Array.from(activePointersRef.current.values());
  }, []);

  const beginPinchGesture = useCallback(() => {
    const pointers = pointersArray();
    if (pointers.length < 2) return;

    const [first, second] = pointers;
    const midpoint = midpointBetweenPoints(first, second);
    const distance = distanceBetweenPoints(first, second);
    if (distance <= 0) return;

    pinchGestureRef.current = {
      startDistance: distance,
      startScale: transformRef.current.scale,
      mapPointAtMidpoint: mapPointFromViewportPoint(transformRef.current, midpoint),
    };
  }, [pointersArray]);

  const applyPinchGesture = useCallback(() => {
    const gesture = pinchGestureRef.current;
    const pointers = pointersArray();
    if (!gesture || pointers.length < 2) return;

    const [first, second] = pointers;
    const midpoint = midpointBetweenPoints(first, second);
    const distance = distanceBetweenPoints(first, second);
    if (distance <= 0) return;

    const nextScale = clampPanZoomScale(
      gesture.startScale * (distance / gesture.startDistance),
      fitScaleRef.current,
    );
    const next = snapTransform(
      transformForMapPointAtViewportPoint(gesture.mapPointAtMidpoint, midpoint, nextScale),
    );

    transformRef.current = next;
    if (mapRef.current) {
      writeMapTransform(next);
    }
  }, [pointersArray, snapTransform, writeMapTransform]);

  const startGestureInteraction = useCallback((pointerType: string) => {
    setUserGestureMotion(true);
    setMapTransition("none");
    dragPointerTypeRef.current = pointerType;
  }, [setMapTransition, setUserGestureMotion]);

  const captureActivePointers = useCallback((element: HTMLDivElement) => {
    for (const pointerId of activePointersRef.current.keys()) {
      try {
        if (!element.hasPointerCapture(pointerId)) {
          element.setPointerCapture(pointerId);
        }
      } catch {
        // A pointer may have ended between bookkeeping and capture.
      }
    }
  }, []);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    if (activePointersRef.current.size === 0) {
      gestureMovedRef.current = false;
      suppressMapClickRef.current = false;
    }

    cancelAnimation();
    startGestureInteraction(e.pointerType);
    const point = pointerPointFromEvent(e);
    activePointersRef.current.set(e.pointerId, point);
    pointerStartPointsRef.current.set(e.pointerId, point);

    if (activePointersRef.current.size >= 2) {
      cameraAdjustedByUserRef.current = true;
      gestureMovedRef.current = true;
      suppressMapClickRef.current = true;
      captureActivePointers(e.currentTarget);
      activeDragPointerIdRef.current = null;
      lastMoveEvent.current = null;
      beginPinchGesture();
      return;
    }

    activeDragPointerIdRef.current = e.pointerId;
    pinchGestureRef.current = null;
    startPos.current = {
      x: point.x - transformRef.current.x,
      y: point.y - transformRef.current.y,
    };
  }, [beginPinchGesture, cancelAnimation, captureActivePointers, pointerPointFromEvent, startGestureInteraction]);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isGestureActiveRef.current) return;
    if (!activePointersRef.current.has(e.pointerId)) return;

    const point = pointerPointFromEvent(e);
    activePointersRef.current.set(e.pointerId, point);

    if (activePointersRef.current.size >= 2) {
      if (dragRafRef.current === null) {
        dragRafRef.current = requestAnimationFrame(() => {
          applyPinchGesture();
          dragRafRef.current = null;
        });
      }
      return;
    }

    if (activeDragPointerIdRef.current !== e.pointerId) return;

    const startPoint = pointerStartPointsRef.current.get(e.pointerId) ?? point;
    if (!gestureMovedRef.current) {
      if (!exceedsMapTapMovement(startPoint, point)) return;

      gestureMovedRef.current = true;
      cameraAdjustedByUserRef.current = true;
      suppressMapClickRef.current = true;
      captureActivePointers(e.currentTarget);
      if (dragPointerTypeRef.current === "mouse") {
        setIsDragging(true);
      }
    }

    lastMoveEvent.current = { clientX: point.x, clientY: point.y };

    if (dragRafRef.current === null) {
      dragRafRef.current = requestAnimationFrame(() => {
        if (!isGestureActiveRef.current || !lastMoveEvent.current) {
          dragRafRef.current = null;
          return;
        }

        const { clientX, clientY } = lastMoveEvent.current;
        const newX = clientX - startPos.current.x;
        const newY = clientY - startPos.current.y;

        transformRef.current.x = newX;
        transformRef.current.y = newY;

        writeMapTransform(transformRef.current);

        dragRafRef.current = null;
      });
    }
  }, [applyPinchGesture, captureActivePointers, pointerPointFromEvent, writeMapTransform]);

  const finishPointerInteraction = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }

    const wasGestureActive = isGestureActiveRef.current;
    activePointersRef.current.delete(e.pointerId);
    pointerStartPointsRef.current.delete(e.pointerId);

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Browser may release capture during touch cancellation.
    }

    if (pinchGestureRef.current) {
      commitTransformRef(transformRef.current);
      pinchGestureRef.current = null;
    } else if (wasGestureActive && lastMoveEvent.current) {
      const { clientX, clientY } = lastMoveEvent.current;
      const newX = clientX - startPos.current.x;
      const newY = clientY - startPos.current.y;
      commitTransformRef({ ...transformRef.current, x: newX, y: newY });
      lastMoveEvent.current = null;
    }

    const remainingPointers = Array.from(activePointersRef.current.entries());
    if (remainingPointers.length === 1) {
      const [pointerId, point] = remainingPointers[0];
      activeDragPointerIdRef.current = pointerId;
      pointerStartPointsRef.current.set(pointerId, point);
      startPos.current = {
        x: point.x - transformRef.current.x,
        y: point.y - transformRef.current.y,
      };
      isGestureActiveRef.current = true;
      return;
    }

    setUserGestureMotion(false);
    activeDragPointerIdRef.current = null;
    activePointersRef.current.clear();
    pointerStartPointsRef.current.clear();
    dragPointerTypeRef.current = null;
    setIsDragging(false);
    restoreIdleMapTransition();
    setTransform({ ...transformRef.current });
  }, [commitTransformRef, restoreIdleMapTransition, setUserGestureMotion]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    finishPointerInteraction(e);
  }, [finishPointerInteraction]);

  const handlePointerLeave = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    finishPointerInteraction(e);
  }, [finishPointerInteraction]);

  const handlePointerCancel = useCallback((e: PointerEvent<HTMLDivElement>) => {
    suppressMapClickRef.current = true;
    finishPointerInteraction(e);
  }, [finishPointerInteraction]);

  const shouldSuppressMapClick = useCallback(() => suppressMapClickRef.current, []);

  const handleWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    e.preventDefault();
    cameraAdjustedByUserRef.current = true;

    // Interrupt a camera flight once at the start of a wheel gesture. Reading
    // the computed transform on every wheel tick forces synchronous style work
    // on every tick makes zooming visibly lag behind the wheel. Keep the short
    // transform easing, though, so coarse mouse-wheel notches interpolate rather
    // than appearing as ratcheting jumps.
    if (wheelCommitTimeoutRef.current === null) {
      cancelAnimation();
      setMapTransition(shouldAnimateProgrammaticTransform ? "transform 0.1s ease-out" : "none");
      setUserZoomMotion(true);
    }
    
    const { x: mouseX, y: mouseY } = pointFromClientPoint(e.clientX, e.clientY);

    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    const current = transformRef.current;
    const newScale = clampPanZoomScale(current.scale * (1 + delta), fitScale);
    const scaleRatio = newScale / current.scale;
    const newX = mouseX - (mouseX - current.x) * scaleRatio;
    const newY = mouseY - (mouseY - current.y) * scaleRatio;

    commitTransformRef({ x: newX, y: newY, scale: newScale });

    if (wheelCommitTimeoutRef.current !== null) {
      window.clearTimeout(wheelCommitTimeoutRef.current);
    }
    wheelCommitTimeoutRef.current = window.setTimeout(() => {
      wheelCommitTimeoutRef.current = null;
      setTransform({ ...transformRef.current });
      restoreIdleMapTransition();
      setUserZoomMotion(false);
    }, 100);
  }, [
    cancelAnimation,
    commitTransformRef,
    fitScale,
    pointFromClientPoint,
    restoreIdleMapTransition,
    setMapTransition,
    setUserZoomMotion,
    shouldAnimateProgrammaticTransform,
  ]);

  const moveToDefaultCamera = useCallback((
    animate: boolean,
    playEntrance: boolean,
    entranceDelayMs = 0,
  ) => {
    if (!containerRef.current) return;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const next = defaultTransformForViewport(width, height);
    const { scale } = next;
    const isInitialCamera = !cameraInitializedRef.current;
    cameraInitializedRef.current = true;

    if (isInitialCamera && shouldAnimateProgrammaticTransform && playEntrance) {
      const entryTransform = snapTransform(
        computeFittedCameraFlyInStart(next, width, height),
      );

      transformRef.current = entryTransform;
      setMapTransition("none");
      writeMapTransform(entryTransform);
      setTransform(entryTransform);

      if (entranceDelayMs > 0) {
        initialEntranceTimeoutRef.current = window.setTimeout(() => {
          initialEntranceTimeoutRef.current = null;
          animateTransformTo(next, scale, true);
        }, entranceDelayMs);
      } else {
        programmaticAnimationFrameRef.current = window.requestAnimationFrame(() => {
          programmaticAnimationFrameRef.current = null;
          animateTransformTo(next, scale, true);
        });
      }
      return;
    }

    if (!animate) {
      animateTransformTo(next, scale, false);
      return;
    }

    animateTransformTo(next, scale, true);
  }, [
    animateTransformTo,
    defaultTransformForViewport,
    logicalViewportSize,
    shouldAnimateProgrammaticTransform,
    snapTransform,
    setMapTransition,
    writeMapTransform,
  ]);

  const initializeCamera = useCallback(() => {
    moveToDefaultCamera(animateInitialEntrance, animateInitialEntrance);
  }, [animateInitialEntrance, moveToDefaultCamera]);

  const stageInitialEntrance = useCallback(() => {
    if (!containerRef.current) return;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const fittedTransform = defaultTransformForViewport(width, height);
    const entryTransform = snapTransform(
      computeFittedCameraFlyInStart(fittedTransform, width, height),
    );

    cameraInitializedRef.current = true;
    transformRef.current = entryTransform;
    setMapTransition("none");
    writeMapTransform(entryTransform);
    setTransform(entryTransform);
  }, [defaultTransformForViewport, logicalViewportSize, setMapTransition, snapTransform, writeMapTransform]);

  const completeStagedEntrance = useCallback(() => {
    moveToDefaultCamera(true, false);
  }, [moveToDefaultCamera]);

  const recenter = useCallback(() => {
    cameraAdjustedByUserRef.current = false;
    if (!containerRef.current) return;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const next = defaultTransformForViewport(width, height);
    cameraInitializedRef.current = true;
    snapTransformWithFade(next, next.scale);
  }, [defaultTransformForViewport, logicalViewportSize, snapTransformWithFade]);

  const refitIfCameraUntouched = useCallback(() => {
    if (!cameraInitializedRef.current || cameraAdjustedByUserRef.current) return;
    moveToDefaultCamera(false, false);
  }, [moveToDefaultCamera]);

  const replayEntrance = useCallback(() => {
    cameraInitializedRef.current = false;
    moveToDefaultCamera(true, false);
  }, [moveToDefaultCamera]);

  const scheduleUserZoomMotionEnd = useCallback(() => {
    if (wheelCommitTimeoutRef.current !== null) {
      window.clearTimeout(wheelCommitTimeoutRef.current);
    }
    setUserZoomMotion(true);
    wheelCommitTimeoutRef.current = window.setTimeout(() => {
      wheelCommitTimeoutRef.current = null;
      setUserZoomMotion(false);
    }, 140);
  }, [setUserZoomMotion]);

  const zoomIn = useCallback(() => {
    if (!containerRef.current) return;
    cancelAnimation();
    cameraAdjustedByUserRef.current = true;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const centerX = width / 2;
    const centerY = height / 2;

    const current = transformRef.current;
    const newScale = Math.min(current.scale * 1.25, PAN_ZOOM_MAX_RELATIVE_SCALE * fitScale);
    const scaleRatio = newScale / current.scale;
    const newX = centerX - (centerX - current.x) * scaleRatio;
    const newY = centerY - (centerY - current.y) * scaleRatio;
    scheduleUserZoomMotionEnd();
    commitTransform({ x: newX, y: newY, scale: newScale });
  }, [cancelAnimation, commitTransform, fitScale, logicalViewportSize, scheduleUserZoomMotionEnd]);

  const zoomOut = useCallback(() => {
    if (!containerRef.current) return;
    cancelAnimation();
    cameraAdjustedByUserRef.current = true;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const centerX = width / 2;
    const centerY = height / 2;

    const current = transformRef.current;
    const newScale = Math.max(current.scale / 1.25, PAN_ZOOM_MIN_RELATIVE_SCALE * fitScale);
    const scaleRatio = newScale / current.scale;
    const newX = centerX - (centerX - current.x) * scaleRatio;
    const newY = centerY - (centerY - current.y) * scaleRatio;
    scheduleUserZoomMotionEnd();
    commitTransform({ x: newX, y: newY, scale: newScale });
  }, [cancelAnimation, commitTransform, fitScale, logicalViewportSize, scheduleUserZoomMotionEnd]);

  const zoomToScale = useCallback((relativeScale: number) => {
    if (!containerRef.current) return;
    cancelAnimation();
    cameraAdjustedByUserRef.current = true;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const centerX = width / 2;
    const centerY = height / 2;
    const targetAbsoluteScale = relativeScale * fitScale;

    const current = transformRef.current;
    const clampedScale = clampPanZoomScale(targetAbsoluteScale, fitScale);
    const scaleRatio = clampedScale / current.scale;
    const newX = centerX - (centerX - current.x) * scaleRatio;
    const newY = centerY - (centerY - current.y) * scaleRatio;
    scheduleUserZoomMotionEnd();
    commitTransform({ x: newX, y: newY, scale: clampedScale });
  }, [cancelAnimation, commitTransform, fitScale, logicalViewportSize, scheduleUserZoomMotionEnd]);

  const zoomToPoint = useCallback((
    mapX: number,
    mapY: number,
    targetRelativeScale = 1.5,
    options?: ZoomToPointOptions,
  ) => {
    if (!containerRef.current) return;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const insetViewport = computeInsetViewportFocus(width, height, options?.viewportInsets);
    const focusX = options?.viewportFocusRatio
      ? width * options.viewportFocusRatio.x
      : insetViewport.focusX;
    const focusY = options?.viewportFocusRatio
      ? height * options.viewportFocusRatio.y
      : insetViewport.focusY;

    // Selection deep links can focus before ResizeObserver's fitScale state has
    // committed. Measure the live viewport so a fast PWA launch cannot treat the
    // initial fitScale value of 1 as the fitted map scale.
    const currentFitScale = defaultTransformForViewport(width, height).scale;
    const targetAbsoluteScale = targetRelativeScale * currentFitScale;

    const newX = focusX - mapX * targetAbsoluteScale;
    const newY = focusY - mapY * targetAbsoluteScale;

    animateTransformTo({ x: newX, y: newY, scale: targetAbsoluteScale });
  }, [animateTransformTo, defaultTransformForViewport, logicalViewportSize]);

  const zoomToBounds = useCallback((
    bounds: MapContentBounds,
    preferredRelativeScale = 1.5,
    options?: ZoomToBoundsOptions,
  ) => {
    if (!containerRef.current || bounds.width <= 0 || bounds.height <= 0) return;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;

    const insets = options?.viewportInsets;
    const insetFocus = computeInsetViewportFocus(width, height, insets);
    const focusX = options?.viewportFocusRatio
      ? width * options.viewportFocusRatio.x
      : insetFocus.focusX;
    const focusY = options?.viewportFocusRatio
      ? height * options.viewportFocusRatio.y
      : insetFocus.focusY;
    const left = Math.min(Math.max(insets?.left ?? 0, 0), width);
    const right = Math.min(Math.max(insets?.right ?? 0, 0), Math.max(width - left, 0));
    const top = Math.min(Math.max(insets?.top ?? 0, 0), height);
    const bottom = Math.min(Math.max(insets?.bottom ?? 0, 0), Math.max(height - top, 0));
    const halfBoundsWidth = Math.max(bounds.width / 2, 0.5);
    const halfBoundsHeight = Math.max(bounds.height / 2, 0.5);
    const fittingScale = Math.max(0, Math.min(
      (focusX - left) / halfBoundsWidth,
      (width - right - focusX) / halfBoundsWidth,
      (focusY - top) / halfBoundsHeight,
      (height - bottom - focusY) / halfBoundsHeight,
    ));

    // Match zoomToPoint's live fit-scale measurement so a first selection can
    // frame correctly before ResizeObserver commits the fitted scale.
    const currentFitScale = defaultTransformForViewport(width, height).scale;
    const preferredAbsoluteScale = preferredRelativeScale * currentFitScale;
    const targetAbsoluteScale = Math.min(
      clampPanZoomScale(preferredAbsoluteScale, currentFitScale),
      fittingScale,
    );
    const mapCenterX = bounds.x + bounds.width / 2;
    const mapCenterY = bounds.y + bounds.height / 2;

    animateTransformTo({
      x: focusX - mapCenterX * targetAbsoluteScale,
      y: focusY - mapCenterY * targetAbsoluteScale,
      scale: targetAbsoluteScale,
    });
  }, [animateTransformTo, defaultTransformForViewport, logicalViewportSize]);

  // Compute the current user-facing relative zoom level (e.g. 1.0 = 100%)
  const relativeScale = transform.scale / (fitScale || 1);

  return {
    transform,
    relativeScale,
    isDragging,
    isGestureActive,
    containerRef,
    mapRef,
    recenterVeilRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    handlePointerCancel,
    handleWheel,
    recenter,
    initializeCamera,
    stageInitialEntrance,
    completeStagedEntrance,
    replayEntrance,
    refitIfCameraUntouched,
    zoomIn,
    zoomOut,
    zoomToScale,
    zoomToPoint,
    zoomToBounds,
    cancelAnimation,
    shouldSuppressMapClick,
  };
}

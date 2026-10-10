import { useMapViewportPersistence } from "./useMapViewportPersistence";
import { useMapGestureInterruption } from "./useMapGestureInterruption";
import { readMapStationCenterX, readMobileMapFrameInsets } from "./mobileMapFrame";
import { clearMapViewport } from "../app/map-viewport-preference";
import { useState, useCallback, useRef, useEffect, useLayoutEffect, type PointerEvent, type WheelEvent } from "react";
import {
  clampPanZoomScale,
  cameraFromOrientedTransformMatrix,
  clientPointToLogicalViewportPoint,
  computeBoundedMapFrame,
  computeDesktopMapFrame,
  computeFittedCameraFlyInStart,
  computeInsetViewportFocus,
  computeMapFitScale,
  currentDevicePixelRatio,
  distanceBetweenPoints,
  exceedsMapTapMovement,
  mapPointFromViewportPoint,
  midpointBetweenPoints,
  logicalViewportSizeForOrientation,
  orientedMapCameraTransform,
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
import { isMapWheelScrollRegionTarget } from "../components/map-wheel-events";

type UsePanZoomOptions = {
  persistenceKey?: string;
  persistenceBlocked?: boolean;
  reducedMotion?: boolean;
  viewportOrientation?: MapViewportOrientation;
  disableProgrammaticMotion?: boolean;
  defaultFrame?: {
    bounds: MapContentBounds;
    topInset: number;
    bottomInset?: number;
    horizontalInsetRatio?: number;
    minHorizontalInset?: number;
    mobileZoom?: number;
    mobileCenterStationId?: string;
  };
  animateInitialEntrance?: boolean;
  isMapActive?: boolean;
};

type ZoomToPointOptions = {
  viewportFocusRatio?: PanZoomPoint;
  viewportInsets?: ViewportInsets;
};

type ZoomToBoundsOptions = ZoomToPointOptions;

const DEFAULT_CAMERA_MOTION_DURATION_MS = 800;
const DEFAULT_CAMERA_MOTION_EASING = "cubic-bezier(0.25, 1, 0.5, 1)";

export function usePanZoom({
  persistenceKey,
  persistenceBlocked = false,
  reducedMotion = false,
  viewportOrientation = "standard",
  disableProgrammaticMotion = false,
  defaultFrame,
  animateInitialEntrance = true,
  isMapActive = true,
}: UsePanZoomOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isMapActiveRef = useRef(isMapActive);
  useEffect(() => {
    isMapActiveRef.current = isMapActive;
  }, [isMapActive]);

  const isMapCurrentlyActive = useCallback(() => {
    if (!isMapActiveRef.current) return false;
    const shell = containerRef.current?.closest(".linewatch-shell");
    if (!shell) return true;
    if (shell.getAttribute("data-active-view") !== "map") return false;
    if (shell.querySelector(".mobile-app-topbar[data-searching='true']")) return false;
    return true;
  }, []);

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [fitScale, setFitScale] = useState(1);
  const [recenterFeedbackKey, setRecenterFeedbackKey] = useState(0);
  const animTimeoutRef = useRef<number | null>(null);
  const initialEntranceTimeoutRef = useRef<number | null>(null);
  const programmaticAnimationFrameRef = useRef<number | null>(null);
  const wheelCommitTimeoutRef = useRef<number | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const mapRef = useRef<HTMLDivElement>(null);
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
  const activeContainerRectRef = useRef<DOMRect | null>(null);

  const shouldAnimateProgrammaticTransform = !reducedMotion && !disableProgrammaticMotion;
  useEffect(() => {
    fitScaleRef.current = fitScale;
  }, [fitScale]);

  const snapTransform = useCallback((next: PanZoomTransform) => {
    return snapTransformToDevicePixels(next, currentDevicePixelRatio());
  }, []);

  const defaultTransformForViewport = useCallback((width: number, height: number) => {
    if (defaultFrame) {
      const mobileInsets = viewportOrientation === "standard"
        ? readMobileMapFrameInsets(containerRef.current) : null;
      if (mobileInsets) {
        const minHorizontalInset = defaultFrame.minHorizontalInset ?? (width < 768 ? 12 : 32);
        const horizontalInset = defaultFrame.horizontalInsetRatio
          ? Math.min(64, Math.max(minHorizontalInset, width * defaultFrame.horizontalInsetRatio))
          : 12;
        const frame = computeBoundedMapFrame(
          width,
          height,
          defaultFrame.bounds,
          {
            left: horizontalInset,
            right: horizontalInset,
            top: mobileInsets.top,
            bottom: mobileInsets.bottom,
          },
        );
        if (!defaultFrame.mobileZoom) return frame;
        const availableHeight = Math.max(1, height - mobileInsets.top - mobileInsets.bottom);
        // Keep the north/south extent inside the opening on short phones.
        const zoom = Math.max(1, Math.min(defaultFrame.mobileZoom,
          availableHeight * 0.9 / (defaultFrame.bounds.height * frame.scale)));
        const focus = computeInsetViewportFocus(width, height, mobileInsets);
        const stationX = defaultFrame.mobileCenterStationId
          ? readMapStationCenterX(containerRef.current, defaultFrame.mobileCenterStationId) : null;
        return {
          x: stationX !== null ? focus.focusX - stationX * frame.scale * zoom
            : focus.focusX - (focus.focusX - frame.x) * zoom,
          y: focus.focusY - (focus.focusY - frame.y) * zoom,
          scale: frame.scale * zoom,
        };
      }

      return computeDesktopMapFrame({
        viewportWidth: width,
        viewportHeight: height,
        bounds: defaultFrame.bounds,
        horizontalInsetRatio: defaultFrame.horizontalInsetRatio ?? 0.025,
        minHorizontalInset: defaultFrame.minHorizontalInset ?? 32,
      });
    }

    const mapWidth = 4500;
    const mapHeight = 2181.82;
    const scale = computeMapFitScale(width, height, mapWidth, mapHeight);
    const artworkCenterX = (65 + 7925) * (4500 / 8250) / 2;
    return {
      x: width / 2 - artworkCenterX * scale,
      y: height / 2 - (mapHeight * 0.435) * scale,
      scale,
    };
  }, [defaultFrame, viewportOrientation]);

  const writeMapTransform = useCallback((next: PanZoomTransform) => {
    if (mapRef.current) {
      mapRef.current.style.transform = orientedMapCameraTransform(
        next,
        viewportOrientation,
        containerRef.current?.clientWidth ?? 0,
      );
      mapRef.current.style.visibility = "visible";
    }
  }, [viewportOrientation]);

  const setMapTransition = useCallback((transition: string) => {
    if (mapRef.current) {
      mapRef.current.style.transition = transition;
    }
  }, []);

  const isProgrammaticCameraMotionRef = useRef(false);
  const setProgrammaticCameraMotion = useCallback((active: boolean) => {
    isProgrammaticCameraMotionRef.current = active;
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

  const setPointerDragging = useCallback((active: boolean) => {
    if (containerRef.current) {
      containerRef.current.dataset.mapPointerDragging = active ? "true" : "false";
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
    return snapTransform(cameraFromOrientedTransformMatrix(
      { a: matrix.a, b: matrix.b, e: matrix.e, f: matrix.f },
      viewportOrientation,
      containerRef.current?.clientWidth ?? 0,
    ));
  }, [snapTransform, viewportOrientation]);

  const clearProgrammaticAnimation = useCallback(() => {
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
  }, []);

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
    if (
      Math.abs(transformRef.current.x - snapped.x) < 0.5 &&
      Math.abs(transformRef.current.y - snapped.y) < 0.5 &&
      Math.abs(transformRef.current.scale - snapped.scale) < 0.0001
    ) {
      if (!mapRef.current?.style.transform) {
        setMapTransition("none");
        writeMapTransform(snapped);
      }
      if (nextFitScale !== undefined && nextFitScale !== fitScaleRef.current) {
        fitScaleRef.current = nextFitScale;
        setFitScale(nextFitScale);
      }
      return;
    }
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

  const snapTransformToDefault = useCallback((
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
  }, [
    clearProgrammaticAnimation,
    commitTransform,
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
    if (!isGestureActiveRef.current && !isProgrammaticCameraMotionRef.current) {
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

    const reconcileViewport = (physicalWidth: number, physicalHeight: number) => {
      if (document.visibilityState === "hidden" || physicalWidth <= 0 || physicalHeight <= 0) return;
      if (!isMapCurrentlyActive()) return;
      const { width, height } = logicalViewportSizeForOrientation(
        physicalWidth,
        physicalHeight,
        viewportOrientation,
      );

      const previousViewport = lastDimensions.current;
      const diffW = Math.abs(previousViewport.width - width);
      const diffH = Math.abs(previousViewport.height - height);

      // Ignore subpixel variations to prevent layout feedback loops from layer promotion.
      if (diffW < 1 && diffH < 1) return;

      const defaultTransform = defaultTransformForViewport(width, height);
      const newFit = defaultTransform.scale;
      const current = transformRef.current;
      const previousFit = fitScaleRef.current;
      const hasCustomCamera = isProgrammaticCameraMotionRef.current
        || current.scale !== 1
        || current.x !== 0
        || current.y !== 0;

      const isUntouched = !cameraAdjustedByUserRef.current && !hasCustomCamera;

      const next = previousViewport.width <= 0 || previousViewport.height <= 0
        ? (hasCustomCamera ? current : defaultTransform)
        : isUntouched
          ? defaultTransform
          : transformForViewportResize(
              current,
              previousViewport,
              { width, height },
              previousFit,
              newFit,
              0,
              0,
              window.innerWidth >= 768,
            );
      const snapped = snapTransformToDevicePixels(next, currentDevicePixelRatio());

      lastDimensions.current = { width, height };
      fitScaleRef.current = newFit;
      transformRef.current = snapped;
      setFitScale(newFit);
      setTransform(snapped);
    };

    const observer = new ResizeObserver(() => {
      const target = containerRef.current;
      if (!target) return;
      reconcileViewport(target.clientWidth, target.clientHeight);
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
  }, [defaultTransformForViewport, isMapCurrentlyActive, viewportOrientation]);

  useEffect(() => {
    if (!isMapActive || document.visibilityState === "hidden") return;
    const el = containerRef.current;
    if (!el) return;
    const physicalWidth = el.clientWidth;
    const physicalHeight = el.clientHeight;
    if (physicalWidth <= 0 || physicalHeight <= 0) return;
    const { width, height } = logicalViewportSizeForOrientation(
      physicalWidth,
      physicalHeight,
      viewportOrientation,
    );
    const diffW = Math.abs(lastDimensions.current.width - width);
    const diffH = Math.abs(lastDimensions.current.height - height);
    if (diffW >= 1 || diffH >= 1) {
      const previousViewport = lastDimensions.current;
      const defaultTransform = defaultTransformForViewport(width, height);
      const newFit = defaultTransform.scale;
      const current = transformRef.current;
      const previousFit = fitScaleRef.current;
      const hasCustomCamera = isProgrammaticCameraMotionRef.current
        || current.scale !== 1
        || current.x !== 0
        || current.y !== 0;

      const isUntouched = !cameraAdjustedByUserRef.current && !hasCustomCamera;

      const next = previousViewport.width <= 0 || previousViewport.height <= 0
        ? (hasCustomCamera ? current : defaultTransform)
        : isUntouched
          ? defaultTransform
          : transformForViewportResize(
              current,
              previousViewport,
              { width, height },
              previousFit,
              newFit,
              0,
              0,
              window.innerWidth >= 768,
            );
      const snapped = snapTransformToDevicePixels(next, currentDevicePixelRatio());
      lastDimensions.current = { width, height };
      fitScaleRef.current = newFit;
      transformRef.current = snapped;
      setFitScale(newFit);
      setTransform(snapped);
    }
  }, [defaultTransformForViewport, isMapActive, viewportOrientation]);

  const logicalViewportSize = useCallback(() => {
    const element = containerRef.current;
    if (!element) return { width: 0, height: 0 };
    return logicalViewportSizeForOrientation(
      element.clientWidth,
      element.clientHeight,
      viewportOrientation,
    );
  }, [viewportOrientation]);

  const pointFromClientPoint = useCallback((clientX: number, clientY: number): PanZoomPoint => {
    const rect = activeContainerRectRef.current ?? containerRef.current?.getBoundingClientRect();
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
    // Preserve the idle desktop ease during a drag, matching the regional map.
    // Reduced-motion and mobile modes already set the idle transition to none.
    dragPointerTypeRef.current = pointerType;
  }, [setUserGestureMotion]);

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

  const interruptPointerInteraction = useCallback(() => {
    if (!isGestureActiveRef.current) return;
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    const pointerIds = [...activePointersRef.current.keys()];
    activePointersRef.current.clear();
    pointerStartPointsRef.current.clear();
    pinchGestureRef.current = null;
    activeDragPointerIdRef.current = null;
    activeContainerRectRef.current = null;
    lastMoveEvent.current = null;
    dragPointerTypeRef.current = null;
    suppressMapClickRef.current = true;
    setUserGestureMotion(false);
    setPointerDragging(false);
    restoreIdleMapTransition();
    // Commit the last painted camera, discarding any queued pointer movement.
    setTransform({ ...transformRef.current });
    for (const pointerId of pointerIds) {
      try {
        if (containerRef.current?.hasPointerCapture(pointerId)) {
          containerRef.current.releasePointerCapture(pointerId);
        }
      } catch {
        // The browser may already have released capture while suspending.
      }
    }
  }, [restoreIdleMapTransition, setPointerDragging, setUserGestureMotion]);

  useMapGestureInterruption(interruptPointerInteraction);

  const handleLostPointerCapture = useCallback((e: PointerEvent<HTMLDivElement>) => {
    // Touch capture can transfer from a child to the viewport when panning starts.
    if (activePointersRef.current.has(e.pointerId) && !e.currentTarget.hasPointerCapture(e.pointerId)) {
      interruptPointerInteraction();
    }
  }, [interruptPointerInteraction]);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    if (activePointersRef.current.size === 0) {
      gestureMovedRef.current = false;
      suppressMapClickRef.current = false;
      activeContainerRectRef.current = containerRef.current?.getBoundingClientRect() ?? null;
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
    if (e.pointerType === "mouse" && (e.buttons & 1) === 0) {
      interruptPointerInteraction();
      return;
    }

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
        setPointerDragging(true);
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
  }, [applyPinchGesture, captureActivePointers, interruptPointerInteraction, pointerPointFromEvent, setPointerDragging, writeMapTransform]);

  const finishPointerInteraction = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
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

    activeContainerRectRef.current = null;
    setUserGestureMotion(false);
    setPointerDragging(false);
    activeDragPointerIdRef.current = null;
    activePointersRef.current.clear();
    pointerStartPointsRef.current.clear();
    dragPointerTypeRef.current = null;
    restoreIdleMapTransition();
    setTransform({ ...transformRef.current });
  }, [commitTransformRef, restoreIdleMapTransition, setPointerDragging, setUserGestureMotion]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    finishPointerInteraction(e);
  }, [finishPointerInteraction]);

  const handlePointerLeave = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    finishPointerInteraction(e);
  }, [finishPointerInteraction]);

  const handlePointerCancel = useCallback((e: PointerEvent<HTMLDivElement>) => {
    suppressMapClickRef.current = true;
    activeContainerRectRef.current = null;
    finishPointerInteraction(e);
  }, [finishPointerInteraction]);

  const shouldSuppressMapClick = useCallback(() => suppressMapClickRef.current, []);

  const handleWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    if (isMapWheelScrollRegionTarget(e.target)) return;
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

  const restoreViewport = useMapViewportPersistence(persistenceKey, transform, fitScale, logicalViewportSize,
    () => cameraInitializedRef.current && cameraAdjustedByUserRef.current && !persistenceBlocked && viewportOrientation === "standard");
  const restoreSavedCamera = useCallback(() => {
    if (persistenceBlocked || viewportOrientation !== "standard") return false;
    const { width, height } = logicalViewportSize();
    const fit = defaultTransformForViewport(width, height).scale;
    const saved = restoreViewport(fit);
    if (!saved) return false;
    cameraInitializedRef.current = true;
    cameraAdjustedByUserRef.current = true;
    animateTransformTo(saved, fit, false);
    return true;
  }, [animateTransformTo, defaultTransformForViewport, logicalViewportSize, persistenceBlocked, restoreViewport, viewportOrientation]);

  const initializeCamera = useCallback(() => {
    if (!restoreSavedCamera()) moveToDefaultCamera(animateInitialEntrance, animateInitialEntrance);
  }, [animateInitialEntrance, moveToDefaultCamera, restoreSavedCamera]);

  const stageInitialEntrance = useCallback(() => {
    if (restoreSavedCamera()) return;
    if (!containerRef.current) return;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const fittedTransform = defaultTransformForViewport(width, height);
    const entryTransform = animateInitialEntrance
      ? snapTransform(computeFittedCameraFlyInStart(fittedTransform, width, height))
      : snapTransform(fittedTransform);

    cameraInitializedRef.current = true;
    transformRef.current = entryTransform;
    setMapTransition("none");
    writeMapTransform(entryTransform);
    setTransform(entryTransform);
  }, [animateInitialEntrance, defaultTransformForViewport, logicalViewportSize, setMapTransition, snapTransform, writeMapTransform, restoreSavedCamera]);

  const completeStagedEntrance = useCallback(() => {
    if (!restoreSavedCamera()) moveToDefaultCamera(animateInitialEntrance, false);
  }, [animateInitialEntrance, moveToDefaultCamera, restoreSavedCamera]);

  const recenter = useCallback(() => {
    cameraAdjustedByUserRef.current = false;
    if (!containerRef.current) return false;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return false;
    const next = defaultTransformForViewport(width, height);
    cameraInitializedRef.current = true;
    snapTransformToDefault(next, next.scale);
    return true;
  }, [defaultTransformForViewport, logicalViewportSize, snapTransformToDefault]);

  const recenterWithFeedback = useCallback(() => {
    if (persistenceKey) clearMapViewport(persistenceKey);
    if (recenter() && !reducedMotion) {
      setRecenterFeedbackKey((current) => current + 1);
    }
  }, [recenter, reducedMotion, persistenceKey]);

  const refitIfCameraUntouched = useCallback(() => {
    // Background layout measurements must never replace the rider's camera.
    if (document.visibilityState === "hidden" || !isMapCurrentlyActive()) return;
    if (!cameraInitializedRef.current || cameraAdjustedByUserRef.current) return;
    moveToDefaultCamera(false, false);
  }, [isMapCurrentlyActive, moveToDefaultCamera]);

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
      restoreIdleMapTransition();
      setUserZoomMotion(false);
    }, 140);
  }, [restoreIdleMapTransition, setUserZoomMotion]);

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
    const scaleRatio = current.scale > 0 ? newScale / current.scale : 1;
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
    const scaleRatio = current.scale > 0 ? newScale / current.scale : 1;
    const newX = centerX - (centerX - current.x) * scaleRatio;
    const newY = centerY - (centerY - current.y) * scaleRatio;
    scheduleUserZoomMotionEnd();
    commitTransform({ x: newX, y: newY, scale: newScale });
  }, [cancelAnimation, commitTransform, fitScale, logicalViewportSize, scheduleUserZoomMotionEnd]);

  const zoomToScale = useCallback((relativeScale: number) => {
    if (!containerRef.current) return;
    clearProgrammaticAnimation();
    cameraAdjustedByUserRef.current = true;
    setMapTransition("none");
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const centerX = width / 2;
    const centerY = height / 2;
    const targetAbsoluteScale = relativeScale * fitScale;

    const current = transformRef.current;
    const clampedScale = clampPanZoomScale(targetAbsoluteScale, fitScale);
    const scaleRatio = current.scale > 0 ? clampedScale / current.scale : 1;
    const newX = centerX - (centerX - current.x) * scaleRatio;
    const newY = centerY - (centerY - current.y) * scaleRatio;
    scheduleUserZoomMotionEnd();
    const next = commitTransformRef({ x: newX, y: newY, scale: clampedScale });
    setTransform(next);
  }, [
    clearProgrammaticAnimation,
    commitTransformRef,
    fitScale,
    logicalViewportSize,
    scheduleUserZoomMotionEnd,
    setMapTransition,
  ]);

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

    animateTransformTo({ x: newX, y: newY, scale: targetAbsoluteScale }, currentFitScale);
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
    }, currentFitScale);
  }, [animateTransformTo, defaultTransformForViewport, logicalViewportSize]);

  // Compute the current user-facing relative zoom level (e.g. 1.0 = 100%)
  const relativeScale = transform.scale / (fitScale || 1);

  return {
    transform,
    relativeScale,
    isGestureActive,
    recenterFeedbackKey,
    containerRef,
    mapRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    handlePointerCancel,
    handleLostPointerCapture,
    handleWheel,
    recenter,
    recenterWithFeedback,
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
    logicalViewportSize,
    defaultTransformForViewport,
    moveToDefaultCamera,
    animateTransformTo,
    currentRenderedTransform,
    fitScale,
    cancelAnimation,
    shouldSuppressMapClick,
  };
}

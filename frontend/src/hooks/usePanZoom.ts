import { useMapViewportPersistence } from "./useMapViewportPersistence";
import { useMapGestureInterruption } from "./useMapGestureInterruption";
import { readMapStationCenterX, readMobileMapFrameInsets } from "./mobileMapFrame";
import { clearMapViewport } from "../app/map-viewport-preference";
import { useState, useCallback, useRef, useEffect, useLayoutEffect, type PointerEvent, type RefObject, type WheelEvent } from "react";
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
import { WHEEL_EASE_CURVE, type MapCameraMotionHost } from "../components/map-camera/camera-motion";
import { useMapCameraMotion } from "../components/map-camera/useMapCameraMotion";
import { createMapCameraStore } from "../components/map-camera/camera-store";
import { MOBILE_VIEWPORT_QUERY } from "./useMobilePerformanceMode";

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
    /** Scales the fitted desktop frame. */
    desktopScaleMultiplier?: number;
  };
  animateInitialEntrance?: boolean;
  isMapActive?: boolean;
  /** Mirrors every stage transform and transition, e.g. to keep an open chooser on its badge. */
  cameraFollower?: MapCameraFollower;
  /** The map's viewport (pointer and size source) and its camera stage. */
  containerRef: RefObject<HTMLDivElement | null>;
  mapRef: RefObject<HTMLDivElement | null>;
  /** Where the gesture, zoom and camera-moving flags are written; the viewport by default. */
  flagRootRef?: RefObject<HTMLElement | null>;
  /** A selection or preview owns the camera: resizes keep it instead of refitting. */
  automaticRefitBlocked?: boolean;
  /** Each transform write also makes the stage visible; false when the map gates visibility itself. */
  revealStageOnWrite?: boolean;
};

export type MapCameraFollower = {
  writeCamera: (camera: PanZoomTransform) => void;
  setCameraTransition: (transition: string) => void;
};

type ZoomToPointOptions = {
  viewportFocusRatio?: PanZoomPoint;
  viewportInsets?: ViewportInsets;
};

type ZoomToBoundsOptions = ZoomToPointOptions;

/** Camera-state flags on the map root, read by the shared map CSS. */
function writeMapFlag(
  element: HTMLElement | null,
  flag: "mapCameraMoving" | "mapZoomActive" | "mapGestureActive" | "mapPointerDragging",
  active: boolean,
) {
  if (element) element.dataset[flag] = active ? "true" : "false";
}

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
  cameraFollower,
  containerRef,
  mapRef,
  flagRootRef,
  automaticRefitBlocked = false,
  revealStageOnWrite = true,
}: UsePanZoomOptions) {
  const automaticRefitBlockedRef = useRef(automaticRefitBlocked);
  useLayoutEffect(() => {
    automaticRefitBlockedRef.current = automaticRefitBlocked;
  }, [automaticRefitBlocked]);
  const isMapActiveRef = useRef(isMapActive);
  useEffect(() => {
    isMapActiveRef.current = isMapActive;
  }, [isMapActive]);

  const isMapCurrentlyActive = useCallback(() => {
    if (!isMapActiveRef.current) return false;
    const shell = containerRef.current?.closest(".linewatch-shell");
    if (!shell) return true;
    // Desktop keeps the map visible beside every sidebar view (activeView is
    // "status" there), so only the mobile layout hides it behind other views.
    if (!window.matchMedia(MOBILE_VIEWPORT_QUERY).matches) return true;
    if (shell.getAttribute("data-active-view") !== "map") return false;
    if (shell.querySelector(".mobile-app-topbar[data-searching='true']")) return false;
    return true;
  }, [containerRef, ]);

  // The committed camera lives in a store, not React state, so a commit
  // re-renders only its readers (map-camera/camera-store.ts).
  const [cameraStore] = useState(() => createMapCameraStore({ x: 0, y: 0, scale: 1 }));
  const [fitScale, setFitScale] = useState(1);
  const [recenterFeedbackKey, setRecenterFeedbackKey] = useState(0);
  const animTimeoutRef = useRef<number | null>(null);
  const initialEntranceTimeoutRef = useRef<number | null>(null);
  const programmaticAnimationFrameRef = useRef<number | null>(null);
  const buttonZoomEndTimeoutRef = useRef<number | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
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
  // Wheel zoom and drag momentum (components/map-camera), shared with GO/UP.
  const cameraMotionHostRef = useRef<MapCameraMotionHost | null>(null);
  const cameraMotion = useMapCameraMotion(cameraMotionHostRef);

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
        scaleMultiplier: defaultFrame.desktopScaleMultiplier ?? 1,
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
  }, [containerRef, defaultFrame, viewportOrientation]);

  const writeMapTransform = useCallback((next: PanZoomTransform) => {
    if (mapRef.current) {
      mapRef.current.style.transform = orientedMapCameraTransform(
        next,
        viewportOrientation,
        containerRef.current?.clientWidth ?? 0,
      );
      if (revealStageOnWrite) mapRef.current.style.visibility = "visible";
    }
    cameraFollower?.writeCamera(next);
  }, [containerRef, mapRef, cameraFollower, revealStageOnWrite, viewportOrientation]);

  const setMapTransition = useCallback((transition: string) => {
    if (mapRef.current) {
      mapRef.current.style.transition = transition;
    }
    cameraFollower?.setCameraTransition(transition);
  }, [mapRef, cameraFollower]);

  const isProgrammaticCameraMotionRef = useRef(false);
  const setProgrammaticCameraMotion = useCallback((active: boolean) => {
    isProgrammaticCameraMotionRef.current = active;
    writeMapFlag(flagRootRef?.current ?? containerRef.current, "mapCameraMoving", active);
  }, [containerRef, flagRootRef, ]);

  const setUserZoomMotion = useCallback((active: boolean) => {
    writeMapFlag(flagRootRef?.current ?? containerRef.current, "mapZoomActive", active);
  }, [containerRef, flagRootRef, ]);

  const setUserGestureMotion = useCallback((active: boolean) => {
    isGestureActiveRef.current = active;
    writeMapFlag(flagRootRef?.current ?? containerRef.current, "mapGestureActive", active);
  }, [containerRef, flagRootRef, ]);

  const setPointerDragging = useCallback((active: boolean) => {
    writeMapFlag(flagRootRef?.current ?? containerRef.current, "mapPointerDragging", active);
  }, [containerRef, flagRootRef, ]);

  const isGestureActive = useCallback(() => isGestureActiveRef.current, []);
  // A drag, pinch, or camera flight is under way. Each ends by committing the
  // camera to state, so work deferred while this is true reruns then.
  const isCameraInteracting = useCallback(
    () => isGestureActiveRef.current || isProgrammaticCameraMotionRef.current,
    [],
  );

  const restoreIdleMapTransition = useCallback(() => {
    setMapTransition(shouldAnimateProgrammaticTransform ? "transform 0.1s ease-out" : "none");
  }, [setMapTransition, shouldAnimateProgrammaticTransform]);

  // Publishes the committed camera. At rest it is also written to the stage;
  // during a gesture or flight the DOM already owns the in-between camera.
  const commitCamera = useCallback((next: PanZoomTransform) => {
    cameraStore.set(next);
    if (!isGestureActiveRef.current && !isProgrammaticCameraMotionRef.current) {
      transformRef.current = next;
      writeMapTransform(next);
    }
  }, [cameraStore, writeMapTransform]);

  const commitTransform = useCallback((next: PanZoomTransform) => {
    const snapped = snapTransform(next);
    transformRef.current = snapped;
    commitCamera(snapped);
  }, [commitCamera, snapTransform]);

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
  }, [containerRef, mapRef, snapTransform, viewportOrientation]);

  const clearProgrammaticAnimation = useCallback(() => {
    // Any camera command ends a wheel zoom or glide where it is drawn.
    cameraMotion.stop();
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
    if (buttonZoomEndTimeoutRef.current !== null) {
      window.clearTimeout(buttonZoomEndTimeoutRef.current);
      buttonZoomEndTimeoutRef.current = null;
    }
  }, [cameraMotion]);

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
    durationMs = DEFAULT_CAMERA_MOTION_DURATION_MS,
  ) => {
    // A glide holds the gesture flag; a camera command ends it.
    cameraMotion.stopGlide();
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
      commitCamera({ ...transformRef.current });
      setProgrammaticCameraMotion(false);
    }, durationMs + 50);
  }, [commitCamera, mapRef, 
    cameraMotion,
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
    cameraMotion.stopGlide();
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
    cameraMotion,
    clearProgrammaticAnimation,
    commitTransform,
    setMapTransition,
    setProgrammaticCameraMotion,
    setUserZoomMotion,
    snapTransform,
    writeMapTransform,
  ]);

  // Commits write the stage themselves (commitCamera). Rewrite it only when the
  // writer changes (mount, orientation); unrelated renders never reset a CSS
  // interpolation partway through a station or impact focus.
  useLayoutEffect(() => {
    if (!isGestureActiveRef.current && !isProgrammaticCameraMotionRef.current) {
      writeMapTransform(transformRef.current);
    }
  }, [writeMapTransform]);

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
      if (buttonZoomEndTimeoutRef.current !== null) {
        window.clearTimeout(buttonZoomEndTimeoutRef.current);
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
      // A resize reframes from the camera as drawn; a running zoom or glide
      // would otherwise overwrite it.
      cameraMotion.stop();

      const defaultTransform = defaultTransformForViewport(width, height);
      const newFit = defaultTransform.scale;
      const current = transformRef.current;
      const previousFit = fitScaleRef.current;
      const hasCustomCamera = isProgrammaticCameraMotionRef.current
        || current.scale !== 1
        || current.x !== 0
        || current.y !== 0;

      // An untouched camera refits; a camera the rider moved, or one a
      // selection owns, keeps its zoom and centre.
      const isUntouched = !cameraAdjustedByUserRef.current
        && !automaticRefitBlockedRef.current
        && !isProgrammaticCameraMotionRef.current;

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
      commitCamera(snapped);
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
  }, [commitCamera, containerRef, cameraMotion, defaultTransformForViewport, isMapCurrentlyActive, viewportOrientation]);

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
      cameraMotion.stop();
      const previousViewport = lastDimensions.current;
      const defaultTransform = defaultTransformForViewport(width, height);
      const newFit = defaultTransform.scale;
      const current = transformRef.current;
      const previousFit = fitScaleRef.current;
      const hasCustomCamera = isProgrammaticCameraMotionRef.current
        || current.scale !== 1
        || current.x !== 0
        || current.y !== 0;

      // An untouched camera refits; a camera the rider moved, or one a
      // selection owns, keeps its zoom and centre.
      const isUntouched = !cameraAdjustedByUserRef.current
        && !automaticRefitBlockedRef.current
        && !isProgrammaticCameraMotionRef.current;

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
      commitCamera(snapped);
    }
  }, [commitCamera, containerRef, cameraMotion, defaultTransformForViewport, isMapActive, viewportOrientation]);

  const logicalViewportSize = useCallback(() => {
    const element = containerRef.current;
    if (!element) return { width: 0, height: 0 };
    return logicalViewportSizeForOrientation(
      element.clientWidth,
      element.clientHeight,
      viewportOrientation,
    );
  }, [containerRef, viewportOrientation]);

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
  }, [containerRef, viewportOrientation]);

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
  }, [mapRef, pointersArray, snapTransform, writeMapTransform]);

  const startGestureInteraction = useCallback((pointerType: string) => {
    setUserGestureMotion(true);
    // A direct drag follows the pointer with no transform easing, matching the
    // regional map. Easing every move keeps the stage in a transform
    // transition, and Chrome's redraw when it settles after release tore
    // GO/UP's heavier stage. The idle ease returns when the gesture ends.
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

  const interruptPointerInteraction = useCallback(() => {
    if (!isGestureActiveRef.current) return;
    if (cameraMotion.stopGlide()) return;
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
    commitCamera({ ...transformRef.current });
    for (const pointerId of pointerIds) {
      try {
        if (containerRef.current?.hasPointerCapture(pointerId)) {
          containerRef.current.releasePointerCapture(pointerId);
        }
      } catch {
        // The browser may already have released capture while suspending.
      }
    }
  }, [commitCamera, containerRef, cameraMotion, restoreIdleMapTransition, setPointerDragging, setUserGestureMotion]);

  useMapGestureInterruption(interruptPointerInteraction);

  const handleLostPointerCapture = useCallback((e: PointerEvent<HTMLDivElement>) => {
    // Touch capture can transfer from a child to the viewport when panning starts.
    if (activePointersRef.current.has(e.pointerId) && !e.currentTarget.hasPointerCapture(e.pointerId)) {
      interruptPointerInteraction();
    }
  }, [interruptPointerInteraction]);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const stoppedGlide = cameraMotion.isGliding();

    if (activePointersRef.current.size === 0) {
      gestureMovedRef.current = false;
      suppressMapClickRef.current = false;
      activeContainerRectRef.current = containerRef.current?.getBoundingClientRect() ?? null;
    }

    cancelAnimation();
    // A press that stops a glide only stops it; it selects nothing.
    if (stoppedGlide) suppressMapClickRef.current = true;
    cameraMotion.resetPointerTrack();
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
  }, [containerRef, beginPinchGesture, cameraMotion, cancelAnimation, captureActivePointers, pointerPointFromEvent, startGestureInteraction]);

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
    cameraMotion.trackPointer(point, e.timeStamp);

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
  }, [applyPinchGesture, cameraMotion, captureActivePointers, interruptPointerInteraction, pointerPointFromEvent, setPointerDragging, writeMapTransform]);

  const finishPointerInteraction = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }

    const wasGestureActive = isGestureActiveRef.current;
    const wasPinch = pinchGestureRef.current !== null;
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
      cameraMotion.resetPointerTrack();
      return;
    }

    activeContainerRectRef.current = null;
    setPointerDragging(false);
    activeDragPointerIdRef.current = null;
    activePointersRef.current.clear();
    pointerStartPointsRef.current.clear();
    dragPointerTypeRef.current = null;
    // A drag released while moving glides on, still a gesture, and commits
    // when the glide ends (onGlideEnd).
    if (
      e.type === "pointerup"
      && wasGestureActive
      && !wasPinch
      && gestureMovedRef.current
      && cameraMotion.release(e.timeStamp)
    ) {
      return;
    }
    cameraMotion.resetPointerTrack();
    setUserGestureMotion(false);
    restoreIdleMapTransition();
    commitCamera({ ...transformRef.current });
  }, [commitCamera, cameraMotion, commitTransformRef, restoreIdleMapTransition, setPointerDragging, setUserGestureMotion]);

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
    // The map's native listener (usePreventMapWheelDefault) cancels the
    // browser's own wheel action; React's onWheel is passive and cannot.
    if (isMapWheelScrollRegionTarget(e.target)) return;
    cameraAdjustedByUserRef.current = true;
    cameraMotion.wheel(e, pointFromClientPoint(e.clientX, e.clientY), e.timeStamp);
  }, [containerRef, cameraMotion, pointFromClientPoint]);

  useLayoutEffect(() => {
    cameraMotionHostRef.current = {
      readCamera: () => transformRef.current,
      writeCamera: (next) => { commitTransformRef(next); },
      setCameraEase: (ms) => setMapTransition(ms > 0 ? `transform ${ms}ms ${WHEEL_EASE_CURVE}` : "none"),
      clampScale: (scale) => clampPanZoomScale(scale, fitScaleRef.current),
      easeWheelZoom: () => shouldAnimateProgrammaticTransform,
      momentum: () => !reducedMotion,
      onZoomStart: () => {
        // Continue from the rendered point of an interrupted camera flight.
        cancelAnimation();
        setMapTransition("none");
        setUserZoomMotion(true);
      },
      onZoomEnd: () => {
        commitCamera({ ...transformRef.current });
        restoreIdleMapTransition();
        setUserZoomMotion(false);
      },
      onGlideEnd: () => {
        setUserGestureMotion(false);
        restoreIdleMapTransition();
        commitCamera({ ...transformRef.current });
      },
    };
  });

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
    // This fit already targets the current viewport; record it so the resize
    // observer does not re-center the fitted camera from the stale size.
    lastDimensions.current = { width, height };
    const isInitialCamera = !cameraInitializedRef.current;
    cameraInitializedRef.current = true;

    if (isInitialCamera && shouldAnimateProgrammaticTransform && playEntrance) {
      const entryTransform = snapTransform(
        computeFittedCameraFlyInStart(next, width, height),
      );

      transformRef.current = entryTransform;
      setMapTransition("none");
      writeMapTransform(entryTransform);
      commitCamera(entryTransform);

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
  }, [commitCamera, containerRef, 
    animateTransformTo,
    defaultTransformForViewport,
    logicalViewportSize,
    shouldAnimateProgrammaticTransform,
    snapTransform,
    setMapTransition,
    writeMapTransform,
  ]);

  const restoreViewport = useMapViewportPersistence(persistenceKey, cameraStore, fitScale, logicalViewportSize,
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
    commitCamera(entryTransform);
  }, [commitCamera, containerRef, animateInitialEntrance, defaultTransformForViewport, logicalViewportSize, setMapTransition, snapTransform, writeMapTransform, restoreSavedCamera]);

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
  }, [containerRef, defaultTransformForViewport, logicalViewportSize, snapTransformToDefault]);

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
    if (buttonZoomEndTimeoutRef.current !== null) {
      window.clearTimeout(buttonZoomEndTimeoutRef.current);
    }
    setUserZoomMotion(true);
    buttonZoomEndTimeoutRef.current = window.setTimeout(() => {
      buttonZoomEndTimeoutRef.current = null;
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
  }, [containerRef, cancelAnimation, commitTransform, fitScale, logicalViewportSize, scheduleUserZoomMotionEnd]);

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
  }, [containerRef, cancelAnimation, commitTransform, fitScale, logicalViewportSize, scheduleUserZoomMotionEnd]);

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
    commitCamera(next);
  }, [commitCamera, containerRef, 
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
  }, [containerRef, animateTransformTo, defaultTransformForViewport, logicalViewportSize]);

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
  }, [containerRef, animateTransformTo, defaultTransformForViewport, logicalViewportSize]);

  /** The camera as last written to the stage (a flight's target while it eases). */
  const readCamera = useCallback(() => transformRef.current, []);
  const isCameraInitialized = useCallback(() => cameraInitializedRef.current, []);
  /** Pointers currently pressed on the map. */
  const activePointerCount = useCallback(() => activePointersRef.current.size, []);
  /** Treats the camera as untouched again, so it refits with the map's layout. */
  const clearCameraAdjustment = useCallback(() => {
    cameraAdjustedByUserRef.current = false;
  }, []);

  return {
    cameraStore,
    readCamera,
    isCameraInitialized,
    activePointerCount,
    clearCameraAdjustment,
    isGestureActive,
    isCameraInteracting,
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

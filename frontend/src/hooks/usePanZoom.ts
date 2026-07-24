import { useState, useCallback, useRef, useEffect, type PointerEvent, type WheelEvent } from "react";
import {
  clampPanZoomScale,
  clientPointToLogicalViewportPoint,
  computeBoundedMapFrame,
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
  transformForMapPointAtViewportPoint,
  type MapViewportOrientation,
  type MapContentBounds,
  type PanZoomPoint,
  type PanZoomTransform,
  type ViewportInsets,
} from "./panZoomMath";

type UsePanZoomOptions = {
  reducedMotion?: boolean;
  viewportOrientation?: MapViewportOrientation;
  disableProgrammaticMotion?: boolean;
  defaultFrame?: {
    bounds: MapContentBounds;
    topInset: number;
    horizontalInsetRatio?: number;
  };
};

type ZoomToPointOptions = {
  viewportFocusRatio?: PanZoomPoint;
  viewportInsets?: ViewportInsets;
};

export function usePanZoom({
  reducedMotion = false,
  viewportOrientation = "standard",
  disableProgrammaticMotion = false,
  defaultFrame,
}: UsePanZoomOptions = {}) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [fitScale, setFitScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isGestureActive, setIsGestureActive] = useState(false);
  const animTimeoutRef = useRef<number | null>(null);
  const programmaticAnimationFrameRef = useRef<number | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
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

  const shouldAnimateProgrammaticTransform = !reducedMotion && !disableProgrammaticMotion;

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

  const snappedTransformFrom = useCallback((next: PanZoomTransform) => {
    const snapped = snapTransform(next);
    transformRef.current = snapped;
    return snapped;
  }, [snapTransform]);

  const clearProgrammaticAnimation = useCallback(() => {
    if (programmaticAnimationFrameRef.current !== null) {
      cancelAnimationFrame(programmaticAnimationFrameRef.current);
      programmaticAnimationFrameRef.current = null;
    }
    if (animTimeoutRef.current) {
      window.clearTimeout(animTimeoutRef.current);
      animTimeoutRef.current = null;
    }
  }, []);

  const cancelAnimation = useCallback(() => {
    const renderedTransform = currentRenderedTransform();
    clearProgrammaticAnimation();
    restoreIdleMapTransition();

    if (renderedTransform) {
      transformRef.current = renderedTransform;
      writeMapTransform(renderedTransform);
    }
  }, [clearProgrammaticAnimation, currentRenderedTransform, restoreIdleMapTransition, writeMapTransform]);

  const animateTransformTo = useCallback((next: PanZoomTransform, nextFitScale?: number) => {
    if (isGestureActiveRef.current) {
      return;
    }

    const snapped = snapTransform(next);
    transformRef.current = snapped;

    clearProgrammaticAnimation();

    if (nextFitScale !== undefined) {
      fitScaleRef.current = nextFitScale;
    }

    if (!mapRef.current || !shouldAnimateProgrammaticTransform) {
      setMapTransition("none");
      writeMapTransform(snapped);
      if (nextFitScale !== undefined) {
        setFitScale(nextFitScale);
      }
      commitTransform(snapped);
      return;
    }

    setMapTransition("transform 1s cubic-bezier(0.25, 1, 0.5, 1)");
    programmaticAnimationFrameRef.current = requestAnimationFrame(() => {
      programmaticAnimationFrameRef.current = null;
      writeMapTransform(snapped);
    });

    animTimeoutRef.current = window.setTimeout(() => {
      animTimeoutRef.current = null;
      restoreIdleMapTransition();
      if (nextFitScale !== undefined) {
        setFitScale(nextFitScale);
      }
      setTransform({ ...transformRef.current });
    }, 1050);
  }, [
    clearProgrammaticAnimation,
    commitTransform,
    shouldAnimateProgrammaticTransform,
    restoreIdleMapTransition,
    setMapTransition,
    snapTransform,
    writeMapTransform,
  ]);

  // Keep transformRef in sync with React-owned transform state outside active gestures.
  useEffect(() => {
    if (!isGestureActiveRef.current) {
      transformRef.current = transform;
    }
  }, [transform]);

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
      isGestureActiveRef.current = false;
    };
  }, []);

  const lastDimensions = useRef({ width: 0, height: 0 });

  // ResizeObserver to track container size changes, update fitScale, and scale map proportionally
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const diffW = Math.abs(lastDimensions.current.width - width);
          const diffH = Math.abs(lastDimensions.current.height - height);
          
          // Ignore subpixel variations to prevent layout feedback loops from layer promotion
          if (diffW < 1 && diffH < 1) {
            continue;
          }
          
          lastDimensions.current = { width, height };
          
          const defaultTransform = defaultTransformForViewport(width, height);
          const newFit = defaultTransform.scale;
          
          setFitScale((prevFit) => {
            if (prevFit !== newFit) {
              setTransform((prevTransform) => {
                const currentRelative = prevTransform.scale / (prevFit || 1);
                const targetAbsolute = currentRelative * newFit;
                
                // If it was default scale (1.0) and uninitialized fit (1.0), center it cleanly
                if (prevTransform.scale === 1 && prevFit === 1) {
                  const next = snapTransformToDevicePixels(defaultTransform, currentDevicePixelRatio());
                  transformRef.current = next;
                  return next;
                }

                const ratio = targetAbsolute / prevTransform.scale;
                const next = snapTransformToDevicePixels({
                  x: prevTransform.x * ratio,
                  y: prevTransform.y * ratio,
                  scale: targetAbsolute
                }, currentDevicePixelRatio());
                transformRef.current = next;
                return next;
              });
            }
            return newFit;
          });
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
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
    isGestureActiveRef.current = true;
    setIsGestureActive(true);
    setMapTransition("none");
    dragPointerTypeRef.current = pointerType;
  }, [setMapTransition]);

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

    setIsGestureActive(false);
    isGestureActiveRef.current = false;
    activeDragPointerIdRef.current = null;
    activePointersRef.current.clear();
    pointerStartPointsRef.current.clear();
    dragPointerTypeRef.current = null;
    setIsDragging(false);
    restoreIdleMapTransition();
    setTransform({ ...transformRef.current });
  }, [commitTransformRef, restoreIdleMapTransition]);

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
    
    const { x: mouseX, y: mouseY } = pointFromClientPoint(e.clientX, e.clientY);

    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    
    setTransform(prev => {
      let newScale = prev.scale * (1 + delta);
      newScale = clampPanZoomScale(newScale, fitScale);

      const scaleRatio = newScale / prev.scale;
      const newX = mouseX - (mouseX - prev.x) * scaleRatio;
      const newY = mouseY - (mouseY - prev.y) * scaleRatio;

      return snappedTransformFrom({ x: newX, y: newY, scale: newScale });
    });
  }, [fitScale, pointFromClientPoint, snappedTransformFrom]);

  const recenter = useCallback(() => {
    if (!containerRef.current) return;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const next = defaultTransformForViewport(width, height);
    const { x, y, scale } = next;

    if (!cameraInitializedRef.current && shouldAnimateProgrammaticTransform) {
      cameraInitializedRef.current = true;
      const entryScale = scale * 0.5;
      const scaleRatio = entryScale / scale;
      const entryX = width / 2 - (width / 2 - x) * scaleRatio;
      const entryY = height / 2 - (height / 2 - y) * scaleRatio;
      const entryTransform = snapTransform({ x: entryX, y: entryY, scale: entryScale });

      transformRef.current = entryTransform;
      setMapTransition("none");
      writeMapTransform(entryTransform);
      setTransform(entryTransform);

      programmaticAnimationFrameRef.current = requestAnimationFrame(() => {
        programmaticAnimationFrameRef.current = null;
        animateTransformTo(next, scale);
      });
      return;
    }
    cameraInitializedRef.current = true;

    animateTransformTo(next, scale);
  }, [
    animateTransformTo,
    defaultTransformForViewport,
    logicalViewportSize,
    shouldAnimateProgrammaticTransform,
    snapTransform,
    setMapTransition,
    writeMapTransform,
  ]);

  const replayEntrance = useCallback(() => {
    cameraInitializedRef.current = false;
    recenter();
  }, [recenter]);

  const zoomIn = useCallback(() => {
    if (!containerRef.current) return;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const centerX = width / 2;
    const centerY = height / 2;

    setTransform(prev => {
      let newScale = prev.scale * 1.25;
      newScale = Math.min(newScale, PAN_ZOOM_MAX_RELATIVE_SCALE * fitScale);
      const scaleRatio = newScale / prev.scale;
      const newX = centerX - (centerX - prev.x) * scaleRatio;
      const newY = centerY - (centerY - prev.y) * scaleRatio;
      return snappedTransformFrom({ x: newX, y: newY, scale: newScale });
    });
  }, [fitScale, logicalViewportSize, snappedTransformFrom]);

  const zoomOut = useCallback(() => {
    if (!containerRef.current) return;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const centerX = width / 2;
    const centerY = height / 2;

    setTransform(prev => {
      let newScale = prev.scale / 1.25;
      newScale = Math.max(newScale, PAN_ZOOM_MIN_RELATIVE_SCALE * fitScale);
      const scaleRatio = newScale / prev.scale;
      const newX = centerX - (centerX - prev.x) * scaleRatio;
      const newY = centerY - (centerY - prev.y) * scaleRatio;
      return snappedTransformFrom({ x: newX, y: newY, scale: newScale });
    });
  }, [fitScale, logicalViewportSize, snappedTransformFrom]);

  const zoomToScale = useCallback((relativeScale: number) => {
    if (!containerRef.current) return;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const centerX = width / 2;
    const centerY = height / 2;
    const targetAbsoluteScale = relativeScale * fitScale;

    setTransform(prev => {
      const clampedScale = clampPanZoomScale(targetAbsoluteScale, fitScale);
      const scaleRatio = clampedScale / prev.scale;
      const newX = centerX - (centerX - prev.x) * scaleRatio;
      const newY = centerY - (centerY - prev.y) * scaleRatio;
      return snappedTransformFrom({ x: newX, y: newY, scale: clampedScale });
    });
  }, [fitScale, logicalViewportSize, snappedTransformFrom]);

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

  // Compute the current user-facing relative zoom level (e.g. 1.0 = 100%)
  const relativeScale = transform.scale / (fitScale || 1);

  return {
    transform,
    relativeScale,
    isDragging,
    isGestureActive,
    containerRef,
    mapRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    handlePointerCancel,
    handleWheel,
    recenter,
    replayEntrance,
    zoomIn,
    zoomOut,
    zoomToScale,
    zoomToPoint,
    cancelAnimation,
    shouldSuppressMapClick,
  };
}

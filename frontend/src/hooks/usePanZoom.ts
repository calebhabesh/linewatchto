import { useState, useCallback, useRef, useEffect, type PointerEvent, type WheelEvent } from "react";
import {
  clampPanZoomScale,
  currentDevicePixelRatio,
  distanceBetweenPoints,
  mapPointFromViewportPoint,
  midpointBetweenPoints,
  snapTransformToDevicePixels,
  transformForMapPointAtViewportPoint,
  type PanZoomPoint,
  type PanZoomTransform,
} from "./panZoomMath";

export function usePanZoom() {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [fitScale, setFitScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const animTimeoutRef = useRef<number | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const dragRafRef = useRef<number | null>(null);
  const lastMoveEvent = useRef<{ clientX: number, clientY: number } | null>(null);
  const activePointersRef = useRef(new Map<number, PanZoomPoint>());
  const pinchGestureRef = useRef<{
    startDistance: number;
    startScale: number;
    mapPointAtMidpoint: PanZoomPoint;
  } | null>(null);
  const fitScaleRef = useRef(1);
  const activeDragPointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    fitScaleRef.current = fitScale;
  }, [fitScale]);

  const snapTransform = useCallback((next: PanZoomTransform) => {
    return snapTransformToDevicePixels(next, currentDevicePixelRatio());
  }, []);

  const commitTransform = useCallback((next: PanZoomTransform) => {
    const snapped = snapTransform(next);
    transformRef.current = snapped;
    setTransform(snapped);
  }, [snapTransform]);

  const commitTransformRef = useCallback((next: PanZoomTransform) => {
    const snapped = snapTransform(next);
    transformRef.current = snapped;
    if (mapRef.current) {
      mapRef.current.style.transform = `translate(${snapped.x}px, ${snapped.y}px) scale(${snapped.scale})`;
    }
    return snapped;
  }, [snapTransform]);

  const snappedTransformFrom = useCallback((next: PanZoomTransform) => {
    const snapped = snapTransform(next);
    transformRef.current = snapped;
    return snapped;
  }, [snapTransform]);

  const cancelAnimation = useCallback(() => {
    if (animTimeoutRef.current) {
      window.clearTimeout(animTimeoutRef.current);
      animTimeoutRef.current = null;
    }
    setIsAnimating(false);
  }, []);

  const startAnimation = useCallback(() => {
    setIsAnimating(true);
    if (animTimeoutRef.current) window.clearTimeout(animTimeoutRef.current);
    animTimeoutRef.current = window.setTimeout(() => {
      animTimeoutRef.current = null;
      setIsAnimating(false);
    }, 850);
  }, []);

  // Keep transformRef in sync with transform state when not dragging
  useEffect(() => {
    if (!isDragging) {
      transformRef.current = transform;
    }
  }, [transform, isDragging]);

  // Clean up animation frame on unmount
  useEffect(() => {
    return () => {
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
      }
      if (animTimeoutRef.current) {
        window.clearTimeout(animTimeoutRef.current);
      }
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
          
          const mapWidth = 4500;
          const mapHeight = 2181.82;
          const newFit = Math.min(width / mapWidth, height / mapHeight);
          
          setFitScale((prevFit) => {
            if (prevFit !== newFit) {
              setTransform((prevTransform) => {
                const currentRelative = prevTransform.scale / (prevFit || 1);
                const targetAbsolute = currentRelative * newFit;
                
                // If it was default scale (1.0) and uninitialized fit (1.0), center it cleanly
                if (prevTransform.scale === 1 && prevFit === 1) {
                  const next = snapTransformToDevicePixels({
                    x: width / 2 - (mapWidth / 2) * targetAbsolute,
                    y: height / 2 - (mapHeight * 0.435) * targetAbsolute,
                    scale: targetAbsolute
                  }, currentDevicePixelRatio());
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
  }, []);

  const pointerPointFromEvent = useCallback((event: PointerEvent<HTMLDivElement>): PanZoomPoint => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: event.clientX, y: event.clientY };
    }
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, []);

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
      mapRef.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    }
  }, [pointersArray, snapTransform]);

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    cancelAnimation();
    const point = pointerPointFromEvent(e);
    activePointersRef.current.set(e.pointerId, point);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (activePointersRef.current.size >= 2) {
      activeDragPointerIdRef.current = null;
      lastMoveEvent.current = null;
      beginPinchGesture();
      setIsDragging(true);
      return;
    }

    activeDragPointerIdRef.current = e.pointerId;
    pinchGestureRef.current = null;
    setIsDragging(true);
    startPos.current = {
      x: point.x - transformRef.current.x,
      y: point.y - transformRef.current.y,
    };
  }, [beginPinchGesture, cancelAnimation, pointerPointFromEvent]);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
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

    lastMoveEvent.current = { clientX: point.x, clientY: point.y };

    if (dragRafRef.current === null) {
      dragRafRef.current = requestAnimationFrame(() => {
        if (!isDragging || !lastMoveEvent.current) {
          dragRafRef.current = null;
          return;
        }

        const { clientX, clientY } = lastMoveEvent.current;
        const newX = clientX - startPos.current.x;
        const newY = clientY - startPos.current.y;

        transformRef.current.x = newX;
        transformRef.current.y = newY;

        if (mapRef.current) {
          mapRef.current.style.transform = `translate(${newX}px, ${newY}px) scale(${transformRef.current.scale})`;
        }

        dragRafRef.current = null;
      });
    }
  }, [applyPinchGesture, isDragging, pointerPointFromEvent]);

  const finishPointerInteraction = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }

    activePointersRef.current.delete(e.pointerId);

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
    } else if (isDragging && lastMoveEvent.current) {
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
      startPos.current = {
        x: point.x - transformRef.current.x,
        y: point.y - transformRef.current.y,
      };
      setTransform({ ...transformRef.current });
      setIsDragging(true);
      return;
    }

    activeDragPointerIdRef.current = null;
    activePointersRef.current.clear();
    setIsDragging(false);
    setTransform({ ...transformRef.current });
  }, [commitTransformRef, isDragging]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    finishPointerInteraction(e);
  }, [finishPointerInteraction]);

  const handlePointerCancel = useCallback((e: PointerEvent<HTMLDivElement>) => {
    finishPointerInteraction(e);
  }, [finishPointerInteraction]);

  const handleWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

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
  }, [fitScale, snappedTransformFrom]);

  const recenter = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mapWidth = 4500;
    const mapHeight = 2181.82; // Aspect ratio height for 4500px width with 82.5:40 viewBox
    
    // Scale to fit exactly within the viewport
    const scale = Math.min(rect.width / mapWidth, rect.height / mapHeight);
    
    // Center offsets based on visual content midpoint (x = 50%, y = 43.5% of map height)
    const x = rect.width / 2 - (mapWidth / 2) * scale;
    const y = rect.height / 2 - (mapHeight * 0.435) * scale;
    
    commitTransform({ x, y, scale });
    setFitScale(scale);
    startAnimation();
  }, [startAnimation, commitTransform]);

  const zoomIn = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    setTransform(prev => {
      let newScale = prev.scale * 1.25;
      newScale = Math.min(newScale, 5 * fitScale); // Limit zoom to 5x of fit scale
      const scaleRatio = newScale / prev.scale;
      const newX = centerX - (centerX - prev.x) * scaleRatio;
      const newY = centerY - (centerY - prev.y) * scaleRatio;
      return snappedTransformFrom({ x: newX, y: newY, scale: newScale });
    });
  }, [fitScale, snappedTransformFrom]);

  const zoomOut = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    setTransform(prev => {
      let newScale = prev.scale / 1.25;
      newScale = Math.max(newScale, 0.2 * fitScale); // Limit zoom to 0.2x of fit scale
      const scaleRatio = newScale / prev.scale;
      const newX = centerX - (centerX - prev.x) * scaleRatio;
      const newY = centerY - (centerY - prev.y) * scaleRatio;
      return snappedTransformFrom({ x: newX, y: newY, scale: newScale });
    });
  }, [fitScale, snappedTransformFrom]);

  const zoomToScale = useCallback((relativeScale: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const targetAbsoluteScale = relativeScale * fitScale;

    setTransform(prev => {
      const clampedScale = Math.min(Math.max(targetAbsoluteScale, 0.2 * fitScale), 5 * fitScale);
      const scaleRatio = clampedScale / prev.scale;
      const newX = centerX - (centerX - prev.x) * scaleRatio;
      const newY = centerY - (centerY - prev.y) * scaleRatio;
      return snappedTransformFrom({ x: newX, y: newY, scale: clampedScale });
    });
  }, [fitScale, snappedTransformFrom]);

  const zoomToPoint = useCallback((mapX: number, mapY: number, targetRelativeScale = 1.5) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const targetAbsoluteScale = targetRelativeScale * fitScale;

    const newX = centerX - mapX * targetAbsoluteScale;
    const newY = centerY - mapY * targetAbsoluteScale;

    commitTransform({ x: newX, y: newY, scale: targetAbsoluteScale });
    startAnimation();
  }, [fitScale, startAnimation, commitTransform]);

  // Compute the current user-facing relative zoom level (e.g. 1.0 = 100%)
  const relativeScale = transform.scale / (fitScale || 1);

  return {
    transform,
    relativeScale,
    isDragging,
    isAnimating,
    containerRef,
    mapRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleWheel,
    recenter,
    zoomIn,
    zoomOut,
    zoomToScale,
    zoomToPoint,
    cancelAnimation,
  };
}

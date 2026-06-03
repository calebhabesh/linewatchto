import { useState, useCallback, useRef, useEffect, type PointerEvent, type WheelEvent } from "react";

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

  const startAnimation = useCallback(() => {
    setIsAnimating(true);
    if (animTimeoutRef.current) window.clearTimeout(animTimeoutRef.current);
    animTimeoutRef.current = window.setTimeout(() => setIsAnimating(false), 400);
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
                  return {
                    x: width / 2 - (mapWidth / 2) * targetAbsolute,
                    y: height / 2 - (mapHeight * 0.435) * targetAbsolute,
                    scale: targetAbsolute
                  };
                }

                const ratio = targetAbsolute / prevTransform.scale;
                return {
                  x: prevTransform.x * ratio,
                  y: prevTransform.y * ratio,
                  scale: targetAbsolute
                };
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

  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    // Only allow left click panning
    if (e.button !== 0) return;
    setIsDragging(true);
    startPos.current = { x: e.clientX - transformRef.current.x, y: e.clientY - transformRef.current.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    lastMoveEvent.current = { clientX: e.clientX, clientY: e.clientY };

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
  }, [isDragging]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    if (isDragging) {
      if (lastMoveEvent.current) {
        const { clientX, clientY } = lastMoveEvent.current;
        const newX = clientX - startPos.current.x;
        const newY = clientY - startPos.current.y;
        transformRef.current.x = newX;
        transformRef.current.y = newY;
        if (mapRef.current) {
          mapRef.current.style.transform = `translate(${newX}px, ${newY}px) scale(${transformRef.current.scale})`;
        }
        lastMoveEvent.current = null;
      }
      setIsDragging(false);
      setTransform({ ...transformRef.current });
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, [isDragging]);

  const handleWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    
    setTransform(prev => {
      let newScale = prev.scale * (1 + delta);
      // Limit zoom between 0.2x and 5x of the fit scale
      const minScale = 0.2 * fitScale;
      const maxScale = 5 * fitScale;
      newScale = Math.min(Math.max(minScale, newScale), maxScale);

      const scaleRatio = newScale / prev.scale;
      const newX = mouseX - (mouseX - prev.x) * scaleRatio;
      const newY = mouseY - (mouseY - prev.y) * scaleRatio;

      return { x: newX, y: newY, scale: newScale };
    });
  }, [fitScale]);

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
    
    setTransform({ x, y, scale });
    setFitScale(scale);
    startAnimation();
  }, [startAnimation]);

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
      return { x: newX, y: newY, scale: newScale };
    });
  }, [fitScale]);

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
      return { x: newX, y: newY, scale: newScale };
    });
  }, [fitScale]);

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
      return { x: newX, y: newY, scale: clampedScale };
    });
  }, [fitScale]);

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
    handleWheel,
    recenter,
    zoomIn,
    zoomOut,
    zoomToScale,
  };
}

import { useState, useCallback, useRef, useEffect, type PointerEvent, type WheelEvent } from "react";

export function usePanZoom() {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [fitScale, setFitScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const animTimeoutRef = useRef<number | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const startAnimation = useCallback(() => {
    setIsAnimating(true);
    if (animTimeoutRef.current) window.clearTimeout(animTimeoutRef.current);
    animTimeoutRef.current = window.setTimeout(() => setIsAnimating(false), 400);
  }, []);

  // ResizeObserver to track container size changes, update fitScale, and scale map proportionally
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
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
    startPos.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [transform.x, transform.y]);

  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setTransform(prev => ({
      ...prev,
      x: e.clientX - startPos.current.x,
      y: e.clientY - startPos.current.y
    }));
  }, [isDragging]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

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

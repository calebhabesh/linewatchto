import { useState, useCallback, useRef, type PointerEvent, type WheelEvent } from "react";

export function usePanZoom() {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

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
    // Prevent default scroll in the container via an effect or passive=false event listener, 
    // but React's onWheel is passive. We will add a manual ref event listener in the component.
    
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomSensitivity = 0.001;
    const delta = -e.deltaY * zoomSensitivity;
    
    setTransform(prev => {
      let newScale = prev.scale * (1 + delta);
      newScale = Math.min(Math.max(0.2, newScale), 5); // Limit zoom between 0.2x and 5x

      const scaleRatio = newScale / prev.scale;

      const newX = mouseX - (mouseX - prev.x) * scaleRatio;
      const newY = mouseY - (mouseY - prev.y) * scaleRatio;

      return { x: newX, y: newY, scale: newScale };
    });
  }, []);

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
  }, []);

  const zoomIn = useCallback(() => {
    setTransform(prev => {
      const newScale = Math.min(prev.scale * 1.2, 5);
      return { ...prev, scale: newScale };
    });
  }, []);

  const zoomOut = useCallback(() => {
    setTransform(prev => {
      const newScale = Math.max(prev.scale / 1.2, 0.2);
      return { ...prev, scale: newScale };
    });
  }, []);

  return {
    transform,
    isDragging,
    containerRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    recenter,
    zoomIn,
    zoomOut
  };
}

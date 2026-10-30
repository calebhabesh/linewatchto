import { useEffect, type RefObject } from "react";

const MAP_WHEEL_SCROLL_REGION_ATTRIBUTE = "data-map-wheel-scroll-region";

export function isMapWheelScrollRegionTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && Boolean(target.closest(`[${MAP_WHEEL_SCROLL_REGION_ATTRIBUTE}]`));
}

/**
 * Keeps the browser's own wheel action (page scroll, and page zoom on a
 * trackpad pinch, which arrives as ctrl+wheel) off the map, which zooms
 * itself. React's onWheel is passive and cannot prevent it, so both maps
 * register this native listener.
 */
export function usePreventMapWheelDefault(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const preventDefault = (event: WheelEvent) => {
      if (isMapWheelScrollRegionTarget(event.target)) return;
      event.preventDefault();
    };
    element.addEventListener("wheel", preventDefault, { passive: false });
    return () => element.removeEventListener("wheel", preventDefault);
  }, [ref]);
}

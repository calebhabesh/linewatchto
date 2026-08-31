export const MAP_WHEEL_SCROLL_REGION_ATTRIBUTE = "data-map-wheel-scroll-region";

export function isMapWheelScrollRegionTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && Boolean(target.closest(`[${MAP_WHEEL_SCROLL_REGION_ATTRIBUTE}]`));
}

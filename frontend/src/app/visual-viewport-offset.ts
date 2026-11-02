/**
 * The visual viewport's top offset the shell may apply to its fixed chrome.
 *
 * It exists for the software keyboard (iOS scrolls the visual viewport to keep
 * a focused input visible) and for browser page zoom. At any other time a
 * non-zero offset is iOS rubber-banding the page under a drag; applying it
 * made the top bar, network switch and legend follow the rider's finger.
 */
export function shellViewportOffsetTop(offsetTop: number, keyboardOpen: boolean, pageZoomed: boolean): number {
  if (!keyboardOpen && !pageZoomed) return 0;
  return Number.isFinite(offsetTop) ? Math.max(0, offsetTop) : 0;
}

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

/**
 * How far an installed iOS app's layout viewport stops short of the screen.
 *
 * With a black-translucent status bar the page is drawn to the bottom of the
 * screen, but iOS can size the layout viewport one status bar shorter, so
 * `bottom: 0` chrome floats above a strip of page background (iPhone SE: 20px).
 * Measured, not assumed: portrait only (iOS screen size does not rotate), only
 * with a top safe-area inset (default-style installs start below the status bar
 * and are correctly shorter), and capped at that inset.
 */
export function iosStandaloneBottomGap(input: {
  iosStandalone: boolean;
  screenHeight: number;
  innerHeight: number;
  innerWidth: number;
  safeAreaTop: number;
}): number {
  const { iosStandalone, screenHeight, innerHeight, innerWidth, safeAreaTop } = input;
  if (!iosStandalone || !(safeAreaTop > 0) || innerWidth >= innerHeight) return 0;
  const gap = Math.round(screenHeight - innerHeight);
  return Number.isFinite(gap) && gap > 0 ? Math.min(gap, Math.round(safeAreaTop)) : 0;
}

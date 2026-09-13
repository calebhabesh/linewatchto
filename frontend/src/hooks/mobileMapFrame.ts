/** Measure the default mobile opening, independently of the sheet's drag position. */
export function observeMobileMapFrame(viewport: HTMLElement | null, onResize: () => void) {
  const shell = viewport?.closest(".linewatch-shell");
  const observer = new ResizeObserver(onResize);
  for (const element of shell?.querySelectorAll(".mobile-app-chip-scroll, .mobile-service-sheet-minimum") ?? []) {
    observer.observe(element);
  }
  return () => observer.disconnect();
}

export function readMobileMapFrameInsets(viewport: HTMLElement | null) {
  if (!viewport || typeof window === "undefined" || window.innerWidth >= 768) return null;
  const shell = viewport.closest(".linewatch-shell");
  const chips = shell?.querySelector<HTMLElement>(".mobile-app-chip-scroll");
  const sheet = shell?.querySelector<HTMLElement>(".mobile-service-sheet");
  const minimum = sheet?.querySelector<HTMLElement>(".mobile-service-sheet-minimum");
  if (!chips || !sheet || !minimum) return null;
  const rect = viewport.getBoundingClientRect();
  const sheetStyle = window.getComputedStyle(sheet);
  // CSS bottom is unaffected by the translated sheet or the user's chosen snap.
  const sheetBottom = Number.parseFloat(sheetStyle.bottom) || 0;
  const overviewTop = window.innerHeight - sheetBottom - minimum.getBoundingClientRect().height;
  return {
    top: Math.max(0, chips.getBoundingClientRect().bottom - rect.top),
    bottom: Math.max(0, rect.bottom - overviewTop),
  };
}
/** Station center in the rendered SVG viewport, before the map camera transform. */
export function readMapStationCenterX(viewport: HTMLElement | null, stationId: string) {
  const station = viewport?.querySelector<SVGGraphicsElement>(`svg #station-${stationId}`);
  const matrix = station?.getCTM();
  if (!station || !matrix) return null;
  const bounds = station.getBBox();
  return new DOMPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    .matrixTransform(matrix).x;
}

/**
 * Where a rider was in a station's details when they opened one of its
 * impacts (View Details), so Back returns them to the same place: the
 * panel's scroll offset and which collapsible sections were open. The panel
 * remounts on return, so the sections would otherwise fall back to their
 * defaults and the offset would land somewhere else.
 */
export type StationPanelPosition = {
  stationId: string;
  scrollTop: number;
  /** Open state of each `data-station-section` <details>, by section id. */
  sections: Record<string, boolean>;
};

/** The scrolling body of both station panels (TTC and GO/UP). */
export const STATION_PANEL_SCROLL_SELECTOR = ".station-detail-scroll";

export function captureStationPanelPosition(stationId: string, scroller: HTMLElement | null): StationPanelPosition | null {
  if (!scroller) return null;
  const sections: Record<string, boolean> = {};
  for (const details of scroller.querySelectorAll<HTMLDetailsElement>("details[data-station-section]")) {
    const id = details.dataset.stationSection;
    if (id) sections[id] = details.open;
  }
  return { stationId, scrollTop: scroller.scrollTop, sections };
}

/** Reopens (or closes) the recorded sections, then scrolls to the offset. */
export function applyStationPanelPosition(position: StationPanelPosition, scroller: HTMLElement) {
  for (const details of scroller.querySelectorAll<HTMLDetailsElement>("details[data-station-section]")) {
    const open = details.dataset.stationSection ? position.sections[details.dataset.stationSection] : undefined;
    if (open !== undefined && details.open !== open) details.open = open;
  }
  scroller.scrollTop = position.scrollTop;
}

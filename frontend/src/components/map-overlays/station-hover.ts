/*
 * The station hover ring, on both maps: each station's
 * `.station-hover-indicator` elements (one per dot) carry its id, and hover is
 * written to them directly so it shows before the next paint, as alert hover
 * does (map-hover-controller.ts). A selected station shows no hover ring.
 */

/** Ends every station hover ring on the map. */
export function clearMapStationHover(root: ParentNode | null) {
  root?.querySelectorAll<SVGElement>(".station-hover-indicator.active")
    .forEach((indicator) => indicator.classList.remove("active"));
}

/** Shows or ends one station's hover ring. */
export function setMapStationHovered(root: ParentNode | null, stationId: string, hovered: boolean) {
  if (!root) return;
  root.querySelectorAll<SVGElement>(
    `.station-hover-indicator[data-station-hover-id="${CSS.escape(stationId)}"]`,
  ).forEach((indicator) => {
    const stationSelected = indicator.dataset.stationHoverSelected === "true";
    indicator.classList.toggle("active", hovered && !stationSelected);
  });
}

/** The station whose target or name `target` is in, from `data-station-id` or `data-station-label-id`. */
export function mapStationIdAt(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest<SVGElement>("[data-station-id], [data-station-label-id]");
  return element?.dataset.stationId ?? element?.dataset.stationLabelId ?? null;
}

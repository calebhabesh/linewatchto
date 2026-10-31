import type { MapImpactKind } from "../../app/linewatch-data";

/** The alert a hover belongs to, and which pointer or row owns that hover. */
export type MapImpactHoverIdentity = {
  kind: MapImpactKind;
  id: string;
  /** Who raised the hover (a map target, a chooser row); defaults to the alert. */
  activationKey?: string;
};

const HOVER_TARGETS = "[data-map-hover-impact-kind][data-map-hover-impact-id]";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** A hover copy draws its alert through a `<use>` that exists only while hovered. */
function setHoverCopy(element: SVGElement, hovered: boolean) {
  const href = element.dataset.mapHoverCopyHref;
  if (!href) return;
  const existing = element.querySelector(":scope > use");
  if (hovered && !existing) {
    const use = element.ownerDocument.createElementNS(SVG_NAMESPACE, "use");
    use.setAttribute("href", href);
    element.append(use);
  } else if (!hovered) {
    existing?.remove();
  }
}
const STATION_RING_HOVER_TARGETS = `.station-impact-hover-priority${HOVER_TARGETS}`;

/**
 * Shows or hides an alert's hover copies and outlines (or, with
 * "station-rings", only its station ring highlights). Written straight to the
 * DOM so a hover shows before the next paint without rendering the map.
 */
export function setMapImpactHovered(
  root: ParentNode,
  identity: MapImpactHoverIdentity,
  hovered: boolean,
  scope: "all" | "station-rings" = "all",
) {
  root.querySelectorAll<SVGElement>(scope === "station-rings" ? STATION_RING_HOVER_TARGETS : HOVER_TARGETS)
    .forEach((element) => {
      if (element.dataset.mapHoverImpactKind !== identity.kind || element.dataset.mapHoverImpactId !== identity.id) return;
      if (hovered) {
        element.dataset.mapImpactHovered = "true";
        element.dataset.mapHoverOwner = identity.activationKey ?? `${identity.kind}:${identity.id}`;
      } else {
        element.removeAttribute("data-map-impact-hovered");
        element.removeAttribute("data-map-hover-owner");
      }
      setHoverCopy(element, hovered);
    });
}

/** Ends every alert hover under `root`. */
export function clearMapImpactHover(root: ParentNode) {
  root.querySelectorAll<SVGElement>("[data-map-impact-hovered]").forEach((element) => {
    element.removeAttribute("data-map-impact-hovered");
    element.removeAttribute("data-map-hover-owner");
    setHoverCopy(element, false);
  });
}

/** The alert identity a map element belongs to, from its `data-map-impact-*`. */
export function mapImpactIdentityOf(target: EventTarget | null): { kind: MapImpactKind; id: string } | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest<SVGElement | HTMLElement>("[data-map-impact-kind][data-map-impact-id]");
  const kind = element?.dataset.mapImpactKind as MapImpactKind | undefined;
  const id = element?.dataset.mapImpactId;
  return kind && id ? { kind, id } : null;
}

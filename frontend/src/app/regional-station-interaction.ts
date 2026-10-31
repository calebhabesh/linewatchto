/*
 * GO/UP station names: their pointer boxes, the hover label's cutout and the
 * label hover. Station targets, hover rings and selection are shared by every
 * map (map-station-artwork.ts, components/MapStationLayers.tsx).
 */
import type { MapPoint } from "./map-geometry.ts";
import type { PreparedMapGeometry } from "./map-geometry-data.ts";
import { removeDescendantIds } from "./regional-map-asset.ts";
import { regionalStationLabelPolygon } from "./regional-map-geometry.ts";

/** A station name's pointer box, in the root SVG's coordinates. */
export type RegionalStationLabelTarget = {
  stationId: string;
  name: string;
  points: MapPoint[];
};

/** Each station name's box (the label's bounding box, as `pointer-events: bounding-box` would hit it). */
export function regionalStationLabelTargets(geometry: PreparedMapGeometry): RegionalStationLabelTarget[] {
  return geometry.labels.flatMap((label) => {
    const points = regionalStationLabelPolygon(geometry, label.stationId);
    return points
      ? [{
          stationId: label.stationId,
          name: label.name,
          points: points.map((point) => ({ x: Number(point.x.toFixed(2)), y: Number(point.y.toFixed(2)) })),
        }]
      : [];
  });
}

/**
 * The hovered name's glyphs, for the hover label's cutout: a copy of the
 * cutout source prepareRegionalMapMarkup adds to the authored SVG.
 */
export function regionalStationLabelCutoutMarkup(root: ParentNode, stationId: string): string | null {
  const source = root.querySelector<SVGGElement>(`#regional-station-label-cutout-source-${CSS.escape(stationId)}`);
  if (!source) return null;
  const copy = source.cloneNode(true) as SVGGElement;
  removeDescendantIds(copy);
  return copy.outerHTML;
}

/**
 * Reports the station whose dot or name the mouse is over, or that has
 * keyboard focus on fine-pointer devices, for its hover label. Returns a
 * cleanup.
 */
export function installRegionalStationLabelHover(
  viewport: HTMLElement,
  {
    onHoverStationId,
    isPointerGestureActive,
  }: {
    onHoverStationId: (stationId: string | null) => void;
    isPointerGestureActive: () => boolean;
  },
): () => void {
  const stationIdOf = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return null;
    const element = target.closest<SVGElement>("[data-station-id], [data-station-label-id]");
    return element?.dataset.stationId ?? element?.dataset.stationLabelId ?? null;
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (isPointerGestureActive() || event.pointerType !== "mouse") return;
    const target = event.target instanceof Element ? event.target : null;
    const onMap = target && viewport.contains(target) && !target.closest(".overlap-indicator");
    onHoverStationId(onMap ? stationIdOf(target) : null);
  };
  const handleFocusIn = (event: FocusEvent) => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const stationId = stationIdOf(event.target);
    if (stationId) onHoverStationId(stationId);
  };
  const handleFocusOut = (event: FocusEvent) => {
    const next = stationIdOf(event.relatedTarget);
    if (stationIdOf(event.target) !== next) onHoverStationId(next);
  };
  const documentNode = viewport.ownerDocument;
  documentNode.addEventListener("pointermove", handlePointerMove);
  documentNode.addEventListener("focusin", handleFocusIn);
  documentNode.addEventListener("focusout", handleFocusOut);
  return () => {
    documentNode.removeEventListener("pointermove", handlePointerMove);
    documentNode.removeEventListener("focusin", handleFocusIn);
    documentNode.removeEventListener("focusout", handleFocusOut);
  };
}

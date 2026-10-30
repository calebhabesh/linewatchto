/*
 * GO/UP station targets, hover and selection markers. Their shapes come from
 * the prepared station artwork (map-geometry-data.ts); the map draws them as
 * React elements in its own planes, as TTC does, never inside the authored SVG.
 */
import type { MapPoint } from "./map-geometry.ts";
import type { PreparedMapGeometry, PreparedStationShape } from "./map-geometry-data.ts";
import { REGIONAL_LARGE_TERMINAL_IDS, removeDescendantIds } from "./regional-map-asset.ts";
import { matrixTransform, regionalStationLabelPolygon } from "./regional-map-geometry.ts";

export type RegionalStationShape = PreparedStationShape;

/** One station's artwork: shapes in its own coordinates, placed by `transform`. */
export type RegionalStationArtwork = {
  id: string;
  large: boolean;
  /** Station coordinates to root coordinates. */
  transform: string;
  shapes: RegionalStationShape[];
};

/** A station name's pointer box, in the root SVG's coordinates. */
export type RegionalStationLabelTarget = {
  stationId: string;
  name: string;
  points: MapPoint[];
};

/** Every station's artwork. */
export function regionalStationArtwork(geometry: PreparedMapGeometry): RegionalStationArtwork[] {
  return geometry.stations.map((station) => {
    const id = station.id.replace(/^station-/, "");
    return {
      id,
      large: REGIONAL_LARGE_TERMINAL_IDS.has(id),
      transform: matrixTransform(station.transform),
      shapes: station.shapes,
    };
  });
}

/** The station's hover ring: its dots grown, without junction bars. */
export function regionalStationHoverShapes(station: RegionalStationArtwork): RegionalStationShape[] {
  const factor = station.large ? 1.35 : 1.45;
  return station.shapes.flatMap((shape): RegionalStationShape[] => {
    if (shape.tag === "circle") return [{ ...shape, r: shape.r * factor }];
    if (shape.tag === "ellipse") return [{ ...shape, rx: shape.rx * factor, ry: shape.ry * factor }];
    if (shape.join) return [];
    const padding = station.id === "union" ? 75 : (shape.width * (factor - 1)) / 2;
    return [{
      ...shape,
      x: shape.x - padding,
      y: shape.y - padding,
      width: shape.width + padding * 2,
      height: shape.height + padding * 2,
      rx: shape.rx ? shape.rx + padding : 0,
      ry: shape.ry ? shape.ry + padding : 0,
    }];
  });
}

/** The selected station's marker: its dots, a little larger, without junction bars. */
export function regionalStationSelectionShapes(station: RegionalStationArtwork): RegionalStationShape[] {
  const factor = station.large ? 1 : 1.2;
  return station.shapes.flatMap((shape): RegionalStationShape[] => {
    if (shape.tag === "circle") return [{ ...shape, r: shape.r * factor }];
    if (shape.tag === "ellipse") return [{ ...shape, rx: shape.rx * factor, ry: shape.ry * factor }];
    if (shape.join) return [];
    const paddingX = (shape.width * (factor - 1)) / 2;
    const paddingY = (shape.height * (factor - 1)) / 2;
    return [{
      ...shape,
      x: shape.x - paddingX,
      y: shape.y - paddingY,
      width: shape.width + paddingX * 2,
      height: shape.height + paddingY * 2,
    }];
  });
}

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
  const stationIdOf = (target: EventTarget | null) => (
    target instanceof Element
      ? target.closest<SVGElement>("[data-regional-station-id]")?.dataset.regionalStationId ?? null
      : null
  );
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

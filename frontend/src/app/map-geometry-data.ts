/*
 * Prepared System Map geometry: what each authored SVG contributes to overlay
 * placement, read from the SVG at build time (scripts/prepare-map-geometry.mjs)
 * so the maps never measure the live DOM. Every value is in the root SVG's
 * coordinates; polylines are flat [x0, y0, x1, y1, …] lists.
 */
import {
  invertMatrix,
  multiplyMatrix,
  transformPoint,
  type MapBounds,
  type MapMatrix,
  type MapPoint,
} from "./map-geometry.ts";
import { MAP_MANIFESTS, type MapId } from "./map-manifests.ts";

/** Bumped when the file layout changes, so stale files fail the check. */
export const MAP_GEOMETRY_FORMAT = 1;

/** Each map's authored SVG and its prepared geometry, relative to `frontend/`, from its manifest. */
export const MAP_GEOMETRY_SOURCES = Object.fromEntries(
  Object.values(MAP_MANIFESTS).map(({ id, svg, geometry }) => [id, { svg, geometry }]),
) as Record<MapId, { svg: string; geometry: string }>;

export type PreparedStationShape =
  | { tag: "circle"; id: string; cx: number; cy: number; r: number; transform?: string }
  | { tag: "ellipse"; id: string; cx: number; cy: number; rx: number; ry: number; transform?: string }
  | {
      tag: "rect";
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
      rx: number;
      ry: number;
      transform?: string;
      /** The authored outline, for shapes drawn over the station (Union's pill). */
      stroke: string;
      strokeWidth: number;
      /** A junction's connector bar, not part of its dots. */
      join?: true;
    };

/** One dot's centre and authored radius. */
export type PreparedStationAnchor = MapPoint & { id: string; radius: number };

export type PreparedStation = {
  /** The authored element id (`station-…`). */
  id: string;
  /** Station coordinates to root coordinates, as [a, b, c, d, e, f]. */
  transform: number[];
  /** The station's shapes in its own coordinates. */
  shapes: PreparedStationShape[];
  /** Each dot (not junction bars), in root coordinates. */
  anchors: PreparedStationAnchor[];
};

export type PreparedStationLabel = {
  stationId: string;
  name: string;
  /** The label's box in its own coordinates. */
  box: MapBounds;
  /** Label coordinates to root coordinates, as [a, b, c, d, e, f]. */
  matrix: number[];
};

export type PreparedMapGeometry = {
  format: number;
  map: MapId;
  source: { svg: string; sha256: string };
  viewBox: MapBounds;
  stations: PreparedStation[];
  /** Every station element's centre, by element id: segment endpoints. */
  anchors: Record<string, MapPoint>;
  labels: PreparedStationLabel[];
  /** Each authored line or route path, by id (GO/UP) or line label (TTC). */
  lines: { id: string; points: number[] }[];
  /** TTC's non-linear segment guides, by label. */
  guides?: Record<string, number[]>;
  /** Map artwork badges keep clear of. */
  artwork: {
    /** Text, as rotated boxes (four corners). */
    labels: number[][];
    boxes: (MapBounds & { kind: "artwork" | "connection-label" | "line-badge" })[];
    /** Stroke-only paths, as corridors. */
    strokes: { points: number[]; halfWidth: number }[];
  };
};

/** A flat [x0, y0, x1, y1, …] list as points. */
export function preparedPoints(flat: readonly number[]): MapPoint[] {
  const points: MapPoint[] = [];
  for (let index = 0; index + 1 < flat.length; index += 2) points.push({ x: flat[index], y: flat[index + 1] });
  return points;
}

function preparedMatrix([a, b, c, d, e, f]: readonly number[]): MapMatrix {
  return { a, b, c, d, e, f };
}

/** A box's corners in root coordinates, through a prepared matrix. */
function boxCorners(box: MapBounds, matrix: MapMatrix): MapPoint[] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ].map((point) => transformPoint(point, matrix));
}

/** Room around a station name's box, in the label's own units. */
export type StationLabelPadding = { leading: number; trailing: number; y: number };

/**
 * A station name's hover and target box, in root coordinates: the label's box
 * padded, with trailing room only up to the next name along its line (read
 * in the label's own frame, so rotated names compare correctly).
 */
export function stationLabelPolygon(
  labels: readonly PreparedStationLabel[],
  stationId: string,
  padding: StationLabelPadding,
): MapPoint[] | null {
  const label = labels.find((candidate) => candidate.stationId === stationId);
  if (!label) return null;
  const matrix = preparedMatrix(label.matrix);
  const toLabel = invertMatrix(matrix);
  if (!toLabel) return null;
  const box = label.box;
  let trailing = padding.trailing;
  for (const other of labels) {
    if (other === label) continue;
    const toLabelMatrix = multiplyMatrix(toLabel, preparedMatrix(other.matrix));
    if (!toLabelMatrix) continue;
    const corners = boxCorners(other.box, toLabelMatrix);
    const minX = Math.min(...corners.map((point) => point.x));
    const minY = Math.min(...corners.map((point) => point.y));
    const maxY = Math.max(...corners.map((point) => point.y));
    const deltaX = minX - (box.x + box.width);
    const verticalOverlap = Math.max(0, Math.min(box.y + box.height, maxY) - Math.max(box.y, minY));
    const verticalDistance = Math.abs((box.y + box.height / 2) - (minY + maxY) / 2);
    if (deltaX >= -5 && deltaX < padding.trailing + 30 && (verticalOverlap > 0 || verticalDistance < 40)) {
      trailing = Math.min(trailing, Math.max(0, deltaX - 2));
    }
  }
  return boxCorners({
    x: box.x - padding.leading,
    y: box.y - padding.y,
    width: box.width + padding.leading + trailing,
    height: box.height + padding.y * 2,
  }, matrix);
}

/** A station name's centre, in root coordinates. */
export function stationLabelCenter(labels: readonly PreparedStationLabel[], stationId: string): MapPoint | null {
  const label = labels.find((candidate) => candidate.stationId === stationId);
  if (!label) return null;
  const { x, y, width, height } = label.box;
  return transformPoint({ x: x + width / 2, y: y + height / 2 }, preparedMatrix(label.matrix));
}

/**
 * Map View station names sit beside their station on the side its lines
 * leave clearest, so a name never lies across a line and its alert overlays.
 * Computed once per catalog from the drawn line shapes: for every line passing
 * the station, the directions it leaves in; the name takes the placement with
 * the most room from all of them.
 */
import type { GeographicCatalog } from "./geographic-catalog.ts";
import { partitionCatalogFeatures } from "./geographic-overlays.ts";

export type StationLabelAnchor =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type StationLabelPlacement = {
  /** MapLibre `text-anchor`: the side of the name that touches the station. */
  anchor: StationLabelAnchor;
  /** MapLibre `text-offset`, in ems. */
  offset: [number, number];
};

/** The previous placement (name centred below the station), used when nothing blocks it. */
export const DEFAULT_STATION_LABEL_PLACEMENT: StationLabelPlacement = { anchor: "top", offset: [0, 1.2] };

type Candidate = StationLabelPlacement & {
  /** Where the name lies from the station, in screen axes (y down). */
  direction: [number, number];
  /** Half the angle the name's box covers seen from the station: wide names below or above cover more. */
  halfSpanDeg: number;
  /** Small preference so ties keep a consistent look: below, then right. */
  preference: number;
};

const DIAGONAL = Math.SQRT1_2;
const CANDIDATES: Candidate[] = [
  { anchor: "top", offset: [0, 1.2], direction: [0, 1], halfSpanDeg: 62, preference: 6 },
  { anchor: "left", offset: [0.8, 0], direction: [1, 0], halfSpanDeg: 22, preference: 5 },
  { anchor: "right", offset: [-0.8, 0], direction: [-1, 0], halfSpanDeg: 22, preference: 4 },
  { anchor: "bottom", offset: [0, -1.2], direction: [0, -1], halfSpanDeg: 62, preference: 3 },
  { anchor: "top-left", offset: [0.55, 0.55], direction: [DIAGONAL, DIAGONAL], halfSpanDeg: 34, preference: 2 },
  { anchor: "top-right", offset: [-0.55, 0.55], direction: [-DIAGONAL, DIAGONAL], halfSpanDeg: 34, preference: 2 },
  { anchor: "bottom-left", offset: [0.55, -0.55], direction: [DIAGONAL, -DIAGONAL], halfSpanDeg: 34, preference: 1 },
  { anchor: "bottom-right", offset: [-0.55, -0.55], direction: [-DIAGONAL, -DIAGONAL], halfSpanDeg: 34, preference: 1 },
];

/** A line counts as passing the station within this distance (metres). */
const PASSING_DISTANCE_M = 150;
/** Distances along each line from the station at which its direction is sampled (metres). */
const SAMPLE_DISTANCES_M = [250, 700];

type Point = [number, number];

function project([lng, lat]: Point, cosLat: number): Point {
  return [lng * cosLat * 111_320, -lat * 110_540];
}

function closestOnPolyline(points: Point[], target: Point): { index: number; t: number; distance: number } {
  let best = { index: 0, t: 0, distance: Number.POSITIVE_INFINITY };
  for (let index = 0; index < points.length - 1; index++) {
    const [ax, ay] = points[index];
    const [bx, by] = points[index + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((target[0] - ax) * dx + (target[1] - ay) * dy) / lengthSq));
    const distance = Math.hypot(ax + dx * t - target[0], ay + dy * t - target[1]);
    if (distance < best.distance) best = { index, t, distance };
  }
  return best;
}

/** The point `distance` metres along the polyline from a start point, walking forward or back. */
function walk(points: Point[], index: number, t: number, distance: number, forward: boolean): Point | null {
  const [ax, ay] = points[index];
  const [bx, by] = points[index + 1];
  let current: Point = [ax + (bx - ax) * t, ay + (by - ay) * t];
  let remaining = distance;
  let next = forward ? index + 1 : index;
  while (next >= 0 && next < points.length) {
    const target = points[next];
    const step = Math.hypot(target[0] - current[0], target[1] - current[1]);
    if (step >= remaining) {
      const ratio = step === 0 ? 0 : remaining / step;
      return [current[0] + (target[0] - current[0]) * ratio, current[1] + (target[1] - current[1]) * ratio];
    }
    remaining -= step;
    current = target;
    next += forward ? 1 : -1;
  }
  // The line ends first (a terminal): its end still blocks if it is clear of the station.
  return distance - remaining > 60 ? current : null;
}

function angleBetween(a: Point, b: Point): number {
  const dot = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b));
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

/** Most placements a name may try, best first, when a badge or another name takes a spot. */
const MAX_STATION_LABEL_PLACEMENTS = 4;

/**
 * A name's placements, best first, given the directions lines leave its
 * station in: the best one, then the others that keep clear of every line.
 */
export function chooseStationLabelPlacements(blockedDirections: Point[]): StationLabelPlacement[] {
  if (blockedDirections.length === 0) {
    return [DEFAULT_STATION_LABEL_PLACEMENT, { anchor: "top", offset: [0, 1.2 * FAR_PLACEMENT_SCALE] }];
  }
  const ranked = CANDIDATES
    .map((candidate) => {
      const clearance = Math.min(...blockedDirections.map((direction) => angleBetween(candidate.direction, direction)))
        - candidate.halfSpanDeg;
      return { candidate, clearance, score: clearance + candidate.preference };
    })
    .sort((a, b) => b.score - a.score);
  const near = ranked
    .filter(({ clearance }, index) => index === 0 || clearance >= 0)
    .slice(0, MAX_STATION_LABEL_PLACEMENTS)
    .map(({ candidate }) => ({ anchor: candidate.anchor, offset: candidate.offset }));
  // Last resorts: the two best sides again, far enough out to clear an alert
  // badge drawn on the station itself.
  const far = near.slice(0, 2).map(({ anchor, offset }) => ({
    anchor,
    offset: offset.map((value) => Number((value * FAR_PLACEMENT_SCALE).toFixed(2))) as [number, number],
  }));
  return [...near, ...far];
}

/** Far placements sit this many times further out than near ones (0.8 em becomes 1.5). */
const FAR_PLACEMENT_SCALE = 1.9;

/** MapLibre `text-variable-anchor-offset` for a name's placements. */
export function variableAnchorOffset(placements: StationLabelPlacement[]): Array<StationLabelAnchor | [number, number]> {
  return placements.flatMap(({ anchor, offset }) => [anchor, offset]);
}

const placementsByCatalog = new WeakMap<GeographicCatalog, Map<string, StationLabelPlacement[]>>();

/** Each station's name placements, best first, by station id. */
export function stationLabelPlacements(catalog: GeographicCatalog): Map<string, StationLabelPlacement[]> {
  const cached = placementsByCatalog.get(catalog);
  if (cached) return cached;
  const { links, stations } = partitionCatalogFeatures(catalog);
  const placements = new Map<string, StationLabelPlacement[]>();
  if (stations.features.length === 0) {
    placementsByCatalog.set(catalog, placements);
    return placements;
  }
  const meanLat = stations.features.reduce((sum, station) => sum + station.geometry.coordinates[1], 0)
    / stations.features.length;
  const cosLat = Math.cos((meanLat * Math.PI) / 180);
  const shapes = links.features
    .map((link) => link.geometry.coordinates.map((coordinate) => project(coordinate as Point, cosLat)))
    .filter((points) => points.length >= 2);

  for (const station of stations.features) {
    const origin = project(station.geometry.coordinates as Point, cosLat);
    const blocked: Point[] = [];
    for (const points of shapes) {
      const closest = closestOnPolyline(points, origin);
      if (closest.distance > PASSING_DISTANCE_M) continue;
      for (const forward of [true, false]) {
        for (const distance of SAMPLE_DISTANCES_M) {
          const point = walk(points, closest.index, closest.t, distance, forward);
          if (point) blocked.push([point[0] - origin[0], point[1] - origin[1]]);
        }
      }
    }
    placements.set(station.properties.stationId, chooseStationLabelPlacements(blocked));
  }
  placementsByCatalog.set(catalog, placements);
  return placements;
}

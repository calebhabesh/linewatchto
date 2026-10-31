import {
  pathPolylinePoints,
  resolveNetworkSegmentPath,
  type MapBounds,
  type MapPoint,
} from "../app/map-geometry.ts";
import { preparedPoints, type PreparedMapGeometry } from "../app/map-geometry-data.ts";
import type { NetworkSegment, Station } from "../app/linewatch-data";
import {
  BADGE_FEATURE_GAPS,
  badgeObstacleReach,
  type PlacementObstacle,
} from "./overlap-badge-placement.ts";
import { expandBox } from "./map-chooser-placement.ts";

// Map-artwork obstacles for TTC overlap-badge placement.

type SvgBounds = MapBounds;

export const MAP_VIEWBOX_BOUNDS: SvgBounds = { x: 0, y: 0, width: 8250, height: 4000 };
// Authored TTC route strokes are 80 units wide.
export const TRANSIT_LINE_HALF_WIDTH = 40;
const BASE_ROUTE_COLLISION_RADIUS = badgeObstacleReach(TRANSIT_LINE_HALF_WIDTH, BADGE_FEATURE_GAPS.transitLine);
const OVERLAP_BADGE_MAP_COMPONENT_PADDING = badgeObstacleReach(0, BADGE_FEATURE_GAPS.artwork);
const OVERLAP_BADGE_TEXT_PADDING = badgeObstacleReach(0, BADGE_FEATURE_GAPS.label);
// Overlap markers are a primary alert-discovery control. Keep their collision
// footprint in step with the rendered SVG scale so the larger desktop and
// mobile targets still clear nearby map content.
const STANDARD_MAP_COMPONENT_MAX_BOUNDS = 1200;
const LARGE_MAP_COMPONENT_MAX_THICKNESS = 220;
const LARGE_MAP_COMPONENT_TILE_LENGTH = 760;

/**
 * Authored map artwork as placement obstacles, from the prepared map. Labels
 * keep their rotation and stroked lines become corridors, so badges can use
 * the open space beside slanted labels and diagonal lines rather than
 * avoiding whole bounding boxes.
 */
export function ttcArtworkObstacles(geometry: PreparedMapGeometry): PlacementObstacle[] {
  return [
    ...geometry.artwork.labels.map((corners) => ({
      polygon: preparedPoints(corners),
      padding: OVERLAP_BADGE_TEXT_PADDING,
    })),
    ...geometry.artwork.strokes.map(({ points, halfWidth }) => ({
      polyline: preparedPoints(points),
      radius: halfWidth + OVERLAP_BADGE_MAP_COMPONENT_PADDING,
    })),
    ...geometry.artwork.boxes.flatMap((box) => mapCollisionBoxesForElementBounds(box)),
  ];
}

export function collectBaseRouteObstacles(
  segments: NetworkSegment[],
  stations: Station[],
  anchorPoints: Map<string, MapPoint>,
  guidePaths: Map<string, string>,
): PlacementObstacle[] {
  const seenPaths = new Set<string>();
  return segments.flatMap((segment) => {
    const pathD = resolveNetworkSegmentPath(segment, stations, anchorPoints, guidePaths);
    if (!pathD) return [];

    const key = `${segment.id}:${pathD}`;
    if (seenPaths.has(key)) return [];
    seenPaths.add(key);

    const polyline = pathPolylinePoints(pathD);
    return polyline.length > 0 ? [{ polyline, radius: BASE_ROUTE_COLLISION_RADIUS }] : [];
  });
}

function mapCollisionBoxesForElementBounds(
  box: SvgBounds,
  padding: number = OVERLAP_BADGE_MAP_COMPONENT_PADDING,
): SvgBounds[] {
  if (box.width <= 0 || box.height <= 0) return [];
  if (box.width <= STANDARD_MAP_COMPONENT_MAX_BOUNDS && box.height <= STANDARD_MAP_COMPONENT_MAX_BOUNDS) {
    return [expandBox(box, padding)];
  }
  if (!isLargeMapComponentBounds(box)) return [];

  return splitLargeMapComponentBounds(box).map((tile) => expandBox(tile, padding));
}

function isLargeMapComponentBounds(box: SvgBounds): boolean {
  return Math.min(box.width, box.height) <= LARGE_MAP_COMPONENT_MAX_THICKNESS;
}

function splitLargeMapComponentBounds(box: SvgBounds): SvgBounds[] {
  const splitHorizontally = box.width >= box.height;
  const length = splitHorizontally ? box.width : box.height;
  const tileCount = Math.max(1, Math.ceil(length / LARGE_MAP_COMPONENT_TILE_LENGTH));
  const tileLength = length / tileCount;

  return Array.from({ length: tileCount }, (_, index) => {
    if (splitHorizontally) {
      return {
        x: box.x + tileLength * index,
        y: box.y,
        width: tileLength,
        height: box.height,
      };
    }

    return {
      x: box.x,
      y: box.y + tileLength * index,
      width: box.width,
      height: tileLength,
    };
  });
}

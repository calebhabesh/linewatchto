import {
  pathCorridorCollisionBoxes,
  pathPolylinePoints,
  resolveNetworkSegmentPath,
  svgElementMatrixToRootCoordinates,
  transformBoundsToRootCoordinates,
  transformBoundsToRootPolygon,
  transformPoint,
  type MapBounds,
  type MapMatrix,
  type MapPoint,
} from "../app/map-geometry";
import type { MapImpactKind, NetworkSegment, Station } from "../app/linewatch-data";
import {
  BADGE_FEATURE_GAPS,
  badgeObstacleReach,
  type PlacementObstacle,
} from "./overlap-badge-placement";
import { expandBox } from "./ttc-chooser-placement";

// Collision footprints and map-artwork obstacles for TTC overlap-badge placement.

type SvgBounds = MapBounds;

export const MAP_VIEWBOX_BOUNDS: SvgBounds = { x: 0, y: 0, width: 8250, height: 4000 };
export const OVERLAY_CORRIDOR_COLLISION_RADIUS = 54;
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

export function impactCollisionKey(kind: MapImpactKind, cardId: string): string {
  return `${kind}:${cardId}`;
}

const OVERLAP_BADGE_TARGET_SPACING = 16;

export function overlapBadgeTargetsForPath(pathD: string): MapPoint[] {
  return pathCorridorCollisionBoxes(pathD, OVERLAP_BADGE_TARGET_SPACING).map(boxCenter);
}

export function boxCenter(box: SvgBounds): MapPoint {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function stationOverlapProtectedBox(point: MapPoint): SvgBounds {
  return expandBox(
    { x: point.x, y: point.y, width: 0, height: 0 },
    OVERLAY_CORRIDOR_COLLISION_RADIUS,
  );
}

const MAP_COLLISION_SELECTORS = [
  "text",
  "tspan",
  "path",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "image",
  "use",
];

const INJECTED_MAP_OVERLAY_SELECTOR = [
  '[aria-label="Disruption overlays"]',
  '[aria-label="Overlapping alert badges"]',
  '[aria-label="Cardinal North Compass"]',
  "#non-linear-guides-layer",
  "defs",
].join(", ");

function isInjectedMapOverlayElement(element: Element): boolean {
  return Boolean(element.closest(INJECTED_MAP_OVERLAY_SELECTOR));
}

/**
 * Authored map artwork as placement obstacles. Labels keep their rotation and
 * stroked lines become corridors, so badges can use the open space beside
 * slanted labels and diagonal lines rather than avoiding whole bounding boxes.
 */
export function collectMapPlacementObstacles(svg: SVGSVGElement): PlacementObstacle[] {
  const selectors = MAP_COLLISION_SELECTORS.join(", ");
  return Array.from(svg.querySelectorAll(selectors))
    .flatMap((element) => {
      if (!(element instanceof SVGGraphicsElement)) return [];
      if (isInjectedMapOverlayElement(element)) return [];
      const style = window.getComputedStyle(element);
      const authoredGeometrySource = Boolean(element.closest(".ttc-authored-svg-source"));
      if (
        style.display === "none"
        || (!authoredGeometrySource && (style.visibility === "hidden" || style.opacity === "0"))
      ) {
        return [];
      }
      try {
        return mapPlacementObstaclesForElement(element, style);
      } catch {
        return [];
      }
    });
}

function mapPlacementObstaclesForElement(
  element: SVGGraphicsElement,
  style: CSSStyleDeclaration,
): PlacementObstacle[] {
  const matrix = element.ownerSVGElement
    ? svgElementMatrixToRootCoordinates(element, element.ownerSVGElement)
    : null;
  if (element.matches("text, tspan")) {
    const box = element.getBBox();
    if (box.width <= 0 || box.height <= 0) return [];
    const polygon = transformBoundsToRootPolygon(
      { x: box.x, y: box.y, width: box.width, height: box.height },
      matrix,
    );
    return polygon ? [{ polygon, padding: OVERLAP_BADGE_TEXT_PADDING }] : [];
  }
  if ((element instanceof SVGPathElement || element instanceof SVGPolylineElement) && isStrokeOnly(style)) {
    const polyline = sampledGeometryPoints(element, matrix);
    const strokeWidth = (Number.parseFloat(style.strokeWidth) || 0) * matrixScale(matrix);
    return polyline.length > 0
      ? [{ polyline, radius: strokeWidth / 2 + OVERLAP_BADGE_MAP_COMPONENT_PADDING }]
      : [];
  }
  const box = transformedSvgBounds(element);
  return box ? mapCollisionBoxesForElementBounds(box, OVERLAP_BADGE_MAP_COMPONENT_PADDING) : [];
}

function isTransparentPaint(paint: string): boolean {
  return paint === "none" || paint === "transparent" || /rgba\([^)]*,\s*0\)$/.test(paint);
}

function isStrokeOnly(style: CSSStyleDeclaration): boolean {
  return isTransparentPaint(style.fill) && !isTransparentPaint(style.stroke);
}

function matrixScale(matrix: MapMatrix | null): number {
  return matrix ? Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c)) : 1;
}

const STROKE_SAMPLE_SPACING = 24;

function sampledGeometryPoints(element: SVGGeometryElement, matrix: MapMatrix | null): MapPoint[] {
  const length = element.getTotalLength();
  if (!(length > 0)) return [];
  const count = Math.max(1, Math.ceil(length / STROKE_SAMPLE_SPACING));
  return Array.from({ length: count + 1 }, (_unused, index) => {
    const point = element.getPointAtLength((length * index) / count);
    return matrix ? transformPoint({ x: point.x, y: point.y }, matrix) : { x: point.x, y: point.y };
  });
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

function transformedSvgBounds(element: SVGGraphicsElement): SvgBounds | null {
  const box = element.getBBox();
  if (box.width <= 0 || box.height <= 0) return null;

  return transformBoundsToRootCoordinates(
    { x: box.x, y: box.y, width: box.width, height: box.height },
    element.ownerSVGElement
      ? svgElementMatrixToRootCoordinates(element, element.ownerSVGElement)
      : null,
  );
}

/*
 * What every System Map's overlap badges keep clear of, from its prepared
 * geometry alone: the artwork (`geometry.artwork`: text as rotated boxes,
 * element boxes, stroke-only paths) and the base routes (`geometry.lines`).
 * Built once per map, so the placement engine can reuse its rasterization.
 * Spacing is the shared `BADGE_FEATURE_GAPS` at the map's badge scale, and
 * sizes are in the map's overlay units.
 */
import type { MapBounds, MapPoint } from "./map-geometry.ts";
import { preparedPoints, type PreparedMapGeometry } from "./map-geometry-data.ts";
import {
  BADGE_FEATURE_GAPS,
  badgeObstacleReach,
  type PlacementObstacle,
} from "../components/overlap-badge-placement.ts";
import type { MapBadgeArtwork } from "../components/map-overlays/overlap-badge-layout.ts";
import { expandBox } from "../components/map-chooser-placement.ts";

export type MapBadgeArtworkScale = {
  /** The map's overlay unit (manifest `overlayUnit`). */
  unit: number;
  /** How much larger than TTC's the map draws its badges. */
  badgeScale: number;
  /** Half the width of the map's authored line stroke. */
  lineHalfWidth: number;
};

/*
 * Element boxes up to this size (TTC units) are obstacles whole; a larger
 * one is an obstacle only if it is thin (a bar or strip), in tiles, so
 * badges may sit in the open space a large frame encloses.
 */
const STANDARD_COMPONENT_MAX_BOUNDS = 1200;
const LARGE_COMPONENT_MAX_THICKNESS = 220;
const LARGE_COMPONENT_TILE_LENGTH = 760;

const cache = new WeakMap<PreparedMapGeometry, Map<string, MapBadgeArtwork>>();

/**
 * A map's artwork as badge obstacles. Text keeps its rotation, stroked paths
 * and base routes are corridors (kept clear at the wide transit-line gap
 * only where no alert covers them), and connectors never pass through text,
 * connection labels or line badges.
 */
export function mapBadgeArtwork(geometry: PreparedMapGeometry, scale: MapBadgeArtworkScale): MapBadgeArtwork {
  const key = `${scale.unit}:${scale.badgeScale}:${scale.lineHalfWidth}`;
  const byScale = cache.get(geometry) ?? new Map<string, MapBadgeArtwork>();
  cache.set(geometry, byScale);
  const cached = byScale.get(key);
  if (cached) return cached;

  const labelPadding = badgeObstacleReach(0, BADGE_FEATURE_GAPS.label, scale.badgeScale);
  const artworkPadding = badgeObstacleReach(0, BADGE_FEATURE_GAPS.artwork, scale.badgeScale);
  const labels = geometry.artwork.labels.map((corners) => ({ polygon: preparedPoints(corners), padding: labelPadding }));
  const connectionLabels: MapBounds[] = [];
  const lineBadges: MapBounds[] = [];
  const boxes: MapBounds[] = [];
  for (const { kind, ...box } of geometry.artwork.boxes) {
    if (kind === "connection-label") {
      connectionLabels.push(expandBox(box, labelPadding));
      continue;
    }
    const expanded = componentTiles(box, scale.unit).map((tile) => expandBox(tile, artworkPadding));
    boxes.push(...expanded);
    if (kind === "line-badge") lineBadges.push(...expanded);
  }
  const strokes: PlacementObstacle[] = geometry.artwork.strokes.map(({ points, halfWidth }) => ({
    polyline: preparedPoints(points),
    radius: halfWidth + artworkPadding,
  }));
  const routeRadius = badgeObstacleReach(scale.lineHalfWidth, BADGE_FEATURE_GAPS.transitLine, scale.badgeScale);
  const routes = geometry.lines.map((line) => ({ polyline: preparedPoints(line.points), radius: routeRadius }));
  const transitLines = [...strokes, ...routes] as (PlacementObstacle & { polyline: MapPoint[]; radius: number })[];

  const artwork: MapBadgeArtwork = {
    obstacles: [...labels, ...connectionLabels, ...boxes],
    transitLines,
    transitLineHalfWidth: scale.lineHalfWidth,
    // Station dots stay out: station-alert connectors have to land beside them.
    connectorKeepOut: [...labels, ...connectionLabels, ...lineBadges],
    connectorCrossings: transitLines,
  };
  byScale.set(key, artwork);
  return artwork;
}

function componentTiles(box: MapBounds, unit: number): MapBounds[] {
  if (box.width <= 0 || box.height <= 0) return [];
  const maxBounds = STANDARD_COMPONENT_MAX_BOUNDS * unit;
  if (box.width <= maxBounds && box.height <= maxBounds) return [box];
  if (Math.min(box.width, box.height) > LARGE_COMPONENT_MAX_THICKNESS * unit) return [];
  const horizontal = box.width >= box.height;
  const length = horizontal ? box.width : box.height;
  const count = Math.max(1, Math.ceil(length / (LARGE_COMPONENT_TILE_LENGTH * unit)));
  const tile = length / count;
  return Array.from({ length: count }, (_, index) => (horizontal
    ? { x: box.x + tile * index, y: box.y, width: tile, height: box.height }
    : { x: box.x, y: box.y + tile * index, width: box.width, height: tile }));
}

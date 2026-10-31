import type { GeographicCatalog, GeographicCoordinate } from "./geographic-catalog";

export const GEOGRAPHIC_LINE_BADGE_FULL_ZOOM = 10;
export const GEOGRAPHIC_LINE_BADGE_HALF_ZOOM = 12;
export const GEOGRAPHIC_LINE_BADGE_HIDDEN_ZOOM = 14;

type GeographicLineBadgeAnchor = {
  id: string;
  lineId: string;
  lineNumber: string;
  stationId: string;
  offset: [number, number];
};

// These anchors deliberately follow route topology instead of geographic
// centroids. Line 1 includes termini and intermediate anchors on both arms.
export const TTC_GEOGRAPHIC_LINE_BADGE_ANCHORS: readonly GeographicLineBadgeAnchor[] = [
  { id: "line-1-vmc", lineId: "line-1", lineNumber: "1", stationId: "vaughan-metropolitan-centre", offset: [-20, -18] },
  { id: "line-1-st-george", lineId: "line-1", lineNumber: "1", stationId: "st-george", offset: [-22, -20] },
  { id: "line-1-union", lineId: "line-1", lineNumber: "1", stationId: "union", offset: [0, 23] },
  { id: "line-1-bloor-yonge", lineId: "line-1", lineNumber: "1", stationId: "bloor-yonge", offset: [22, -20] },
  { id: "line-1-finch", lineId: "line-1", lineNumber: "1", stationId: "finch", offset: [18, -18] },
  { id: "line-2-kipling", lineId: "line-2", lineNumber: "2", stationId: "kipling", offset: [-20, 10] },
  { id: "line-2-ossington", lineId: "line-2", lineNumber: "2", stationId: "ossington", offset: [0, -22] },
  { id: "line-2-pape", lineId: "line-2", lineNumber: "2", stationId: "pape", offset: [0, -22] },
  { id: "line-2-kennedy", lineId: "line-2", lineNumber: "2", stationId: "kennedy", offset: [22, 8] },
  { id: "line-4-sheppard-yonge", lineId: "line-4", lineNumber: "4", stationId: "sheppard-yonge", offset: [-22, 0] },
  { id: "line-4-don-mills", lineId: "line-4", lineNumber: "4", stationId: "don-mills", offset: [22, 0] },
  { id: "line-5-mount-dennis", lineId: "line-5", lineNumber: "5", stationId: "mount-dennis", offset: [-20, -12] },
  { id: "line-5-eglinton", lineId: "line-5", lineNumber: "5", stationId: "eglinton", offset: [0, -22] },
  { id: "line-5-aga-khan", lineId: "line-5", lineNumber: "5", stationId: "aga-khan-park-and-museum", offset: [0, -22] },
  { id: "line-5-kennedy", lineId: "line-5", lineNumber: "5", stationId: "kennedy", offset: [22, -14] },
  { id: "line-6-humber-college", lineId: "line-6", lineNumber: "6", stationId: "humber-college", offset: [-20, -14] },
  { id: "line-6-finch-west", lineId: "line-6", lineNumber: "6", stationId: "finch-west", offset: [20, -14] },
] as const;

// Regional badges sit at outer termini and selected interior anchors so every
// corridor remains identifiable when map chrome obscures an edge of the full
// network overview. Avoid stacking eight labels around Union.
export const REGIONAL_GEOGRAPHIC_LINE_BADGE_ANCHORS: readonly GeographicLineBadgeAnchor[] = [
  { id: "regional-br-allandale", lineId: "regional-br", lineNumber: "BR", stationId: "allandale-waterfront", offset: [0, 20] },
  { id: "regional-br-aurora", lineId: "regional-br", lineNumber: "BR", stationId: "aurora", offset: [-20, 0] },
  { id: "regional-ki-stratford", lineId: "regional-ki", lineNumber: "KI", stationId: "stratford", offset: [20, 0] },
  { id: "regional-ki-georgetown", lineId: "regional-ki", lineNumber: "KI", stationId: "georgetown", offset: [0, -20] },
  { id: "regional-le-oshawa", lineId: "regional-le", lineNumber: "LE", stationId: "durham-college-oshawa", offset: [-20, 0] },
  { id: "regional-lw-hamilton", lineId: "regional-lw", lineNumber: "LW", stationId: "hamilton", offset: [-18, 18] },
  { id: "regional-lw-burlington", lineId: "regional-lw", lineNumber: "LW", stationId: "burlington", offset: [-18, -12] },
  { id: "regional-lw-niagara", lineId: "regional-lw", lineNumber: "LW", stationId: "niagara-falls", offset: [0, -20] },
  { id: "regional-mi-milton", lineId: "regional-mi", lineNumber: "MI", stationId: "milton", offset: [18, -12] },
  { id: "regional-rh-bloomington", lineId: "regional-rh", lineNumber: "RH", stationId: "bloomington", offset: [-20, 8] },
  { id: "regional-st-old-elm", lineId: "regional-st", lineNumber: "ST", stationId: "old-elm", offset: [-18, 12] },
  { id: "regional-up-pearson", lineId: "regional-up", lineNumber: "UP", stationId: "pearson-airport", offset: [20, -10] },
] as const;

type GeographicLineBadgeFeature = GeoJSON.Feature<GeoJSON.Point, {
  anchorId: string;
  lineId: string;
  lineNumber: string;
  spriteId: string;
  offset: [number, number];
}>;

export function projectGeographicLineBadges(
  catalog: GeographicCatalog,
): GeoJSON.FeatureCollection<GeoJSON.Point, GeographicLineBadgeFeature["properties"]> {
  const anchors = catalog.network === "regional"
    ? REGIONAL_GEOGRAPHIC_LINE_BADGE_ANCHORS
    : TTC_GEOGRAPHIC_LINE_BADGE_ANCHORS;

  const stationCoordinates = new Map<string, GeographicCoordinate>();
  for (const feature of catalog.features) {
    if (feature.properties.featureType === "station" && feature.geometry.type === "Point") {
      stationCoordinates.set(feature.properties.stationId, feature.geometry.coordinates);
    }
  }

  return {
    type: "FeatureCollection",
    features: anchors.flatMap((anchor) => {
      const coordinates = stationCoordinates.get(anchor.stationId);
      if (!coordinates) return [];
      return [{
        type: "Feature" as const,
        id: `line-badge-${anchor.id}`,
        geometry: { type: "Point" as const, coordinates },
        properties: {
          anchorId: anchor.id,
          lineId: anchor.lineId,
          lineNumber: anchor.lineNumber,
          spriteId: `line-badge-${anchor.lineNumber}`,
          offset: anchor.offset,
        },
      }];
    }),
  };
}

/**
 * GO/UP draws UP and KI either side of their shared track: each link is
 * shifted this many screen pixels to the right of its own direction (left
 * for a negative side), growing with zoom. The routes' `line-offset` and the
 * breadcrumbs both read it, so a badge sits on the line it names.
 */
export const GEOGRAPHIC_ROUTE_OFFSET_SIDES: Readonly<Record<string, number>> = { "regional-up": 1, "regional-ki": -1 };
export const GEOGRAPHIC_ROUTE_OFFSET_STOPS: ReadonlyArray<readonly [zoom: number, pixels: number]> = [[10, 0], [13, 3], [16, 5]];

/** A link's sideways shift in screen pixels at this zoom (`GEOGRAPHIC_ROUTE_OFFSET_STOPS`, linear). */
export function geographicRouteOffsetPixels(lineId: string, zoom: number): number {
  const side = GEOGRAPHIC_ROUTE_OFFSET_SIDES[lineId] ?? 0;
  if (!side) return 0;
  const stops = GEOGRAPHIC_ROUTE_OFFSET_STOPS;
  if (zoom <= stops[0][0]) return side * stops[0][1];
  for (let index = 1; index < stops.length; index += 1) {
    const [zoomB, pixelsB] = stops[index];
    if (zoom <= zoomB) {
      const [zoomA, pixelsA] = stops[index - 1];
      return side * (pixelsA + (pixelsB - pixelsA) * (zoom - zoomA) / (zoomB - zoomA));
    }
  }
  return side * stops[stops.length - 1][1];
}

type GeographicLinePath = {
  lineId: string;
  coordinates: GeographicCoordinate[];
  /** Per segment: whether it runs the way its link was drawn (line offsets follow the link). */
  forward: boolean[];
};

/** Each line's links joined end to end; a branch starts a new path. */
function joinGeographicLinePaths(catalog: GeographicCatalog): GeographicLinePath[] {
  const key = ([lng, lat]: GeographicCoordinate) => `${lng.toFixed(6)},${lat.toFixed(6)}`;
  const linksByLine = new Map<string, GeographicCoordinate[][]>();
  for (const feature of catalog.features) {
    if (feature.properties.featureType === "station" || feature.geometry.type !== "LineString") continue;
    const { lineId } = feature.properties as { lineId?: string };
    if (!lineId || feature.geometry.coordinates.length < 2) continue;
    linksByLine.set(lineId, [...(linksByLine.get(lineId) ?? []), feature.geometry.coordinates as GeographicCoordinate[]]);
  }

  const paths: GeographicLinePath[] = [];
  for (const [lineId, links] of linksByLine) {
    // Links by each end, so a path grows from either end in one lookup.
    const byEnd = new Map<string, number[]>();
    links.forEach((link, index) => {
      for (const end of [link[0], link.at(-1)!]) byEnd.set(key(end), [...(byEnd.get(key(end)) ?? []), index]);
    });
    const used = new Set<number>();
    const next = (end: GeographicCoordinate) => (byEnd.get(key(end)) ?? []).find((index) => !used.has(index));
    const segments = (count: number, forward: boolean) => Array.from({ length: count }, () => forward);
    links.forEach((link, start) => {
      if (used.has(start)) return;
      used.add(start);
      let coordinates = [...link];
      let forward = segments(link.length - 1, true);
      for (let index = next(coordinates.at(-1)!); index !== undefined; index = next(coordinates.at(-1)!)) {
        used.add(index);
        const other = links[index];
        const along = key(other[0]) === key(coordinates.at(-1)!);
        coordinates = coordinates.concat((along ? other : [...other].reverse()).slice(1));
        forward = forward.concat(segments(other.length - 1, along));
      }
      for (let index = next(coordinates[0]); index !== undefined; index = next(coordinates[0])) {
        used.add(index);
        const other = links[index];
        const along = key(other.at(-1)!) === key(coordinates[0]);
        coordinates = (along ? other : [...other].reverse()).slice(0, -1).concat(coordinates);
        forward = segments(other.length - 1, along).concat(forward);
      }
      paths.push({ lineId, coordinates, forward });
    });
  }
  return paths;
}

/**
 * Each line's route as continuous paths, its station-to-station links joined
 * end to end (a branch starts a new path).
 */
export function projectGeographicLinePaths(
  catalog: GeographicCatalog,
): GeoJSON.FeatureCollection<GeoJSON.LineString, { lineId: string }> {
  return {
    type: "FeatureCollection",
    features: joinGeographicLinePaths(catalog).map(({ lineId, coordinates }, index) => ({
      type: "Feature" as const,
      id: `line-path-${lineId}-${index}`,
      geometry: { type: "LineString" as const, coordinates },
      properties: { lineId },
    })),
  };
}

/** Zoom at which breadcrumb level 0 shows, `GEOGRAPHIC_LINE_BREADCRUMB_SPACING_PX` apart. */
export const GEOGRAPHIC_LINE_BREADCRUMB_BASE_ZOOM = 9;
/** The last level; it shows from base zoom + this, at every closer zoom. */
export const GEOGRAPHIC_LINE_BREADCRUMB_LEVELS = 8;
/** Breadcrumb spacing on screen at the start of each level; it doubles through the level. */
const GEOGRAPHIC_LINE_BREADCRUMB_SPACING_PX = 240;
/**
 * Where within the spacing a line's breadcrumbs fall. UP shares KI's track
 * from Union to Weston, so at every zoom its badges sit halfway between KI's
 * and the two alternate evenly.
 */
const GEOGRAPHIC_LINE_BREADCRUMB_PHASE: Readonly<Record<string, number>> = { "regional-up": 0.5 };

type GeographicLineBreadcrumbFeature = GeoJSON.Feature<GeoJSON.Point, { lineId: string; level: number }>;

const EARTH_RADIUS_METRES = 6371008.8;

/** Web Mercator ground metres per screen pixel at this latitude and zoom (512 px tiles). */
function metresPerPixel(latitude: number, zoom: number): number {
  return (2 * Math.PI * EARTH_RADIUS_METRES * Math.cos(latitude * Math.PI / 180)) / (512 * 2 ** zoom);
}

/** East and north metres from A to B (small distances). */
function metresBetween([lngA, latA]: GeographicCoordinate, [lngB, latB]: GeographicCoordinate) {
  const radians = Math.PI / 180;
  return {
    east: (lngB - lngA) * radians * Math.cos(((latA + latB) / 2) * radians) * EARTH_RADIUS_METRES,
    north: (latB - latA) * radians * EARTH_RADIUS_METRES,
  };
}

/** Points every `spacing` metres along a path, the first at `start`, each `shift(…)` metres to the right of its link's direction. */
function pointsAlong(
  path: GeographicLinePath,
  start: number,
  spacing: number,
  shiftMetres: number,
): GeographicCoordinate[] {
  const { coordinates, forward } = path;
  const points: GeographicCoordinate[] = [];
  let target = start;
  let travelled = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const from = coordinates[index - 1];
    const to = coordinates[index];
    const { east, north } = metresBetween(from, to);
    const length = Math.hypot(east, north);
    for (; length > 0 && target <= travelled + length; target += spacing) {
      const t = (target - travelled) / length;
      // Right of the link's own direction: (north, -east) along this segment, flipped if the path runs against it.
      const side = (forward[index - 1] ? 1 : -1) * shiftMetres / length;
      const shiftEast = north * side;
      const shiftNorth = -east * side;
      const latitude = from[1] + (to[1] - from[1]) * t;
      points.push([
        from[0] + (to[0] - from[0]) * t + (shiftEast / (EARTH_RADIUS_METRES * Math.cos(latitude * Math.PI / 180))) * 180 / Math.PI,
        latitude + (shiftNorth / EARTH_RADIUS_METRES) * 180 / Math.PI,
      ]);
    }
    travelled += length;
  }
  return points;
}

/**
 * Each line's badge at even distances along its joined paths, for Map View
 * breadcrumbs, as one set per zoom level: level L shows from base zoom + L
 * until the next level, its points half as far apart as level L - 1's, so on
 * screen they stay one to two spacings apart at every zoom. Lines that share
 * track take their own phase so their badges alternate, and each point is
 * shifted as its line is drawn (`geographicRouteOffsetPixels`, at the
 * level's middle zoom) so the badge sits on its own line.
 */
export function projectGeographicLineBreadcrumbs(
  catalog: GeographicCatalog,
): GeoJSON.FeatureCollection<GeoJSON.Point, { lineId: string; level: number }> {
  const features: GeographicLineBreadcrumbFeature[] = [];
  for (const path of joinGeographicLinePaths(catalog)) {
    const { lineId, coordinates } = path;
    const latitude = coordinates.reduce((sum, [, lat]) => sum + lat, 0) / coordinates.length;
    const base = GEOGRAPHIC_LINE_BREADCRUMB_SPACING_PX * metresPerPixel(latitude, GEOGRAPHIC_LINE_BREADCRUMB_BASE_ZOOM);
    const phase = GEOGRAPHIC_LINE_BREADCRUMB_PHASE[lineId] ?? 0;
    for (let level = 0; level <= GEOGRAPHIC_LINE_BREADCRUMB_LEVELS; level += 1) {
      const spacing = base / 2 ** level;
      const zoom = GEOGRAPHIC_LINE_BREADCRUMB_BASE_ZOOM + level + 0.5;
      const shift = geographicRouteOffsetPixels(lineId, zoom) * metresPerPixel(latitude, zoom);
      for (const point of pointsAlong(path, (0.5 + phase) * spacing, spacing, shift)) {
        features.push({
          type: "Feature",
          id: `line-breadcrumb-${lineId}-${features.length}`,
          geometry: { type: "Point", coordinates: point },
          properties: { lineId, level },
        });
      }
    }
  }
  return { type: "FeatureCollection", features };
}

/**
 * GO bus catalog for the GO/UP Map View (plan 13, S6): corridors, one per
 * road, each with the GO bus routes on it, and in a second file the GO bus
 * stops those routes serve. Generated from GO Transit static GTFS (Metrolinx
 * Open Data) by `scripts/generate-go-bus-catalog.mjs`.
 *
 * A wayfinding layer behind a toggle (off by default, remembered per device,
 * GO/UP Map View only). It carries no service status, never affects GO/UP
 * rail status, and a drawn route never means normal service. Geometry comes
 * from one full week of weekday trips; a variant with fewer than one trip a
 * day on a stretch (and under a quarter of its route's busiest stretch) is
 * not drawn.
 */

import type { GeographicCoordinate } from "./geographic-catalog.ts";
import { cachedLoader } from "./geographic-bus-catalog.ts";
import { readLayerPreference, writeLayerPreference } from "./map-view-layers.ts";

export const GO_BUS_CATALOG_URL = "/assets/linewatch/geographic/go-surface-bus.json";
export const GO_BUS_STOPS_URL = "/assets/linewatch/geographic/go-surface-bus-stops.json";

/** Remembers the GO/UP Map View's GO bus toggle on this device. */
export const GO_BUS_LAYER_STORAGE_KEY = "linewatch-map-view-go-buses-v1";

/**
 * GO bus lines draw at every zoom once on, as TTC buses do. GO bus stops are
 * sparse (about 800 across the region), so badges and stops come in at
 * town zoom rather than street zoom.
 */
export const GO_BUS_BADGE_MIN_ZOOM = 11;
export const GO_BUS_STOP_MIN_ZOOM = 12.5;
/** Badges drawn along a line before the rest fold into "+N". */
export const GO_BUS_BADGE_MAX_ROUTES = 5;

/** GO's own bus green (also the Kitchener line's colour, which is solid; buses are dashed). */
export const GO_BUS_LINE_COLOR = "#00853E";
/** The same green lifted for the dark map, where #00853E at a pixel wide disappears. */
export const GO_BUS_LINE_DARK_COLOR = "#3CC47A";

export type GoBusCorridorFeature = {
  type: "Feature";
  id: string;
  geometry: { type: "LineString"; coordinates: GeographicCoordinate[] };
  properties: {
    featureType: "go-bus-corridor";
    /** GO route numbers on this road, numeric order ("40", "41"). */
    routes: string[];
  };
};

export type GoBusStopFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: GeographicCoordinate };
  properties: {
    featureType: "go-bus-stop";
    /** GO's stop number (GTFS stop_id, as gotransit.com and Next Service use it). */
    stopCode: string;
    name: string;
    routes: string[];
  };
};

export type GoBusRouteSummary = {
  route: string;
  name: string;
  color: string;
  textColor: string;
  /** False when no weekday trip could be drawn (UP Express replacement buses run weekends only). */
  drawn: boolean;
  variants: string[];
  /** Average trips per weekday over the sample week. */
  weekdayTrips: number;
};

type GoBusSource = {
  sourceName: string;
  publisher: string;
  license: string;
  feedVersion: string;
  feedStartDate: string;
  feedEndDate: string;
  archiveSha256: string;
  servicePattern: "weekday";
  sampleWeek: [string, string];
};

export type GoBusCatalog = {
  type: "FeatureCollection";
  schemaVersion: "1.0.0";
  network: "regional";
  layer: "go-bus";
  source: GoBusSource;
  routes: GoBusRouteSummary[];
  features: GoBusCorridorFeature[];
};

export type GoBusStopCatalog = {
  type: "FeatureCollection";
  schemaVersion: "1.0.0";
  network: "regional";
  layer: "go-bus-stops";
  source: GoBusSource;
  features: GoBusStopFeature[];
};

/** The stored toggle; anything but "on" (missing, cleared, unreadable) is off. */
export function readGoBusLayerPreference(storage: Pick<Storage, "getItem"> | null | undefined): boolean {
  return readLayerPreference(storage, GO_BUS_LAYER_STORAGE_KEY, false);
}

export function writeGoBusLayerPreference(storage: Pick<Storage, "setItem"> | null | undefined, enabled: boolean): void {
  writeLayerPreference(storage, GO_BUS_LAYER_STORAGE_KEY, enabled);
}

const goBusCatalogLoader = cachedLoader<GoBusCatalog>(
  GO_BUS_CATALOG_URL,
  (value): value is GoBusCatalog => {
    const catalog = value as Partial<GoBusCatalog> | null;
    return Boolean(catalog && catalog.layer === "go-bus" && catalog.network === "regional"
      && Array.isArray(catalog.features) && Array.isArray(catalog.routes));
  },
  "GO bus routes",
);

const goBusStopsLoader = cachedLoader<GoBusStopCatalog>(
  GO_BUS_STOPS_URL,
  (value): value is GoBusStopCatalog => {
    const catalog = value as Partial<GoBusStopCatalog> | null;
    return Boolean(catalog && catalog.layer === "go-bus-stops" && catalog.network === "regional" && Array.isArray(catalog.features));
  },
  "GO bus stops",
);

export const cachedGoBusCatalog = goBusCatalogLoader.cached;
/** Fetches the GO bus corridors once; asked for only while the toggle is on, on the GO/UP Map View. */
export const loadGoBusCatalog = goBusCatalogLoader.load;
export const cachedGoBusStops = goBusStopsLoader.cached;
/** Fetches the GO bus stops once (18 KB gzipped), with the corridors. */
export const loadGoBusStops = goBusStopsLoader.load;

export function goBusStopByCode(stops: GoBusStopCatalog, stopCode: string): GoBusStopFeature | null {
  return stops.features.find((feature) => feature.properties.stopCode === stopCode) ?? null;
}

/**
 * The GO bus stop nearest a press on a GO bus line that serves one of its
 * routes, within `maxMeters` (GO stops are kilometres apart on highways, so
 * the reach is wider than the TTC card's 300 m).
 */
export function nearestGoBusStop(
  stops: GoBusStopCatalog,
  coordinate: GeographicCoordinate,
  routes: readonly string[],
  maxMeters = 1500,
): { stop: GoBusStopFeature; meters: number } | null {
  const wanted = new Set(routes);
  const [lng, lat] = coordinate;
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  let best: { stop: GoBusStopFeature; meters: number } | null = null;
  for (const feature of stops.features) {
    if (!feature.properties.routes.some((route) => wanted.has(route))) continue;
    const [stopLng, stopLat] = feature.geometry.coordinates;
    const meters = Math.hypot((stopLng - lng) * metersPerDegreeLng, (stopLat - lat) * metersPerDegreeLat);
    if (meters <= maxMeters && (!best || meters < best.meters)) best = { stop: feature, meters };
  }
  return best;
}

/** The map image naming a GO corridor's route badges, one per set of routes. */
export function goBusBadgeImageId(routes: readonly string[]): string {
  return `go-bus-badges:${routes.join(",")}`;
}

export function goBusBadgeRoutes(imageId: string): string[] | null {
  if (!imageId.startsWith("go-bus-badges:")) return null;
  const routes = imageId.slice("go-bus-badges:".length).split(",").filter(Boolean);
  return routes.length > 0 ? routes : null;
}

export type GoBusCardRow = {
  route: string;
  name: string;
  color: string;
  textColor: string;
  replacementBuses: false;
};

/** A corridor's routes as the card lists them, in route order, with GO's route colours. */
export function goBusCardRows(catalog: GoBusCatalog, routes: readonly string[]): GoBusCardRow[] {
  const summaries = new Map(catalog.routes.map((route) => [route.route, route]));
  return routes.flatMap((route) => {
    const summary = summaries.get(route);
    if (!summary) return [];
    return [{ route, name: summary.name, color: summary.color, textColor: summary.textColor, replacementBuses: false as const }];
  });
}

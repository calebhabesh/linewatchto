/**
 * TTC bus catalog for the Map View (plan 13, S5): corridors, one per street,
 * each with the daytime bus routes on it, and in a second file the stops
 * those routes serve. Generated from TTC static GTFS by
 * `scripts/generate-surface-catalog.mjs --mode bus`.
 *
 * A wayfinding layer behind a toggle (off by default, remembered per device,
 * TTC Map View only). It carries no service status, and a drawn route never
 * means normal service. Geometry comes from weekday trips of one schedule
 * period; night routes and short turns are not drawn.
 */

import type { GeographicCoordinate } from "./geographic-catalog.ts";
import { readLayerPreference, writeLayerPreference } from "./map-view-layers.ts";
import { fetchScheduleAsset } from "./schedule-assets.ts";

export const BUS_CATALOG_URL = "/assets/linewatch/geographic/ttc-surface-bus.json";
export const BUS_STOPS_URL = "/assets/linewatch/geographic/ttc-surface-bus-stops.json";

/** Remembers the Map View's bus toggle on this device. */
export const BUS_LAYER_STORAGE_KEY = "linewatch-map-view-buses-v1";

/**
 * Bus lines draw at every zoom once a rider turns them on (owner,
 * 2026-11-03): they are off by default, so the default view stays clear.
 */
/** Route badges along bus lines, a zoom after the streetcar badges (13). */
export const BUS_BADGE_MIN_ZOOM = 14;
/** Bus stop dots, at the streetcar stop zoom. */
export const BUS_STOP_MIN_ZOOM = 15;
/** Stop numbers wait until here: their dots are enough while the street still reads as a whole. */
export const BUS_STOP_LABEL_MIN_ZOOM = 16.5;
/** The stop file loads a zoom before stops draw, so they are ready on arrival. */
export const BUS_STOPS_LOAD_ZOOM = BUS_STOP_MIN_ZOOM - 1;

export type BusCorridorFeature = {
  type: "Feature";
  id: string;
  geometry: { type: "LineString"; coordinates: GeographicCoordinate[] };
  properties: {
    featureType: "bus-corridor";
    /** Route numbers on this street, numeric order ("29", "929"). */
    routes: string[];
  };
};

export type BusStopFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: GeographicCoordinate };
  properties: {
    featureType: "bus-stop";
    /** The number on the stop pole. */
    stopCode: string;
    name: string;
    routes: string[];
  };
};

export type BusRouteSummary = {
  route: string;
  name: string;
  color: string;
  textColor: string;
  /** False when no weekday trip could be drawn. */
  drawn: boolean;
  weekdayTrips: { bus: number; shortTurn: number };
};

type BusSource = {
  sourceName: string;
  publisher: string;
  license: string;
  attribution: string;
  feedVersion: string;
  feedStartDate: string;
  feedEndDate: string;
  archiveSha256: string;
  servicePattern: "weekday";
};

export type BusCatalog = {
  type: "FeatureCollection";
  schemaVersion: "1.0.0";
  network: "ttc";
  layer: "bus";
  source: BusSource;
  routes: BusRouteSummary[];
  features: BusCorridorFeature[];
};

export type BusStopCatalog = {
  type: "FeatureCollection";
  schemaVersion: "1.0.0";
  network: "ttc";
  layer: "bus-stops";
  source: BusSource;
  features: BusStopFeature[];
};

/** The stored toggle; anything but "on" (missing, cleared, unreadable) is off. */
export function readBusLayerPreference(storage: Pick<Storage, "getItem"> | null | undefined): boolean {
  return readLayerPreference(storage, BUS_LAYER_STORAGE_KEY, false);
}

export function writeBusLayerPreference(storage: Pick<Storage, "setItem"> | null | undefined, enabled: boolean): void {
  writeLayerPreference(storage, BUS_LAYER_STORAGE_KEY, enabled);
}

/**
 * A JSON asset fetched once, validated, then kept for the visit. Schedule-derived files come
 * through the schedule manifest (plan 16); the rest from the release.
 */
export function cachedLoader<T>(url: string, validate: (value: unknown) => value is T, label: string) {
  let cached: T | null = null;
  let pending: Promise<T> | null = null;
  return {
    cached: () => cached,
    load(): Promise<T> {
      if (cached) return Promise.resolve(cached);
      if (pending) return pending;
      pending = fetchScheduleAsset(url).then(async (response) => {
        if (!response.ok) throw new Error(`Unable to load ${label} (${response.status}).`);
        const value: unknown = await response.json();
        if (!validate(value)) throw new Error(`Invalid ${label}.`);
        cached = value;
        return value;
      }).finally(() => {
        pending = null;
      });
      return pending;
    },
  };
}

const busCatalogLoader = cachedLoader<BusCatalog>(
  BUS_CATALOG_URL,
  (value): value is BusCatalog => {
    const catalog = value as Partial<BusCatalog> | null;
    return Boolean(catalog && catalog.layer === "bus" && catalog.network === "ttc"
      && Array.isArray(catalog.features) && Array.isArray(catalog.routes));
  },
  "bus routes",
);

const busStopsLoader = cachedLoader<BusStopCatalog>(
  BUS_STOPS_URL,
  (value): value is BusStopCatalog => {
    const catalog = value as Partial<BusStopCatalog> | null;
    return Boolean(catalog && catalog.layer === "bus-stops" && catalog.network === "ttc" && Array.isArray(catalog.features));
  },
  "bus stops",
);

export const cachedBusCatalog = busCatalogLoader.cached;
/** Fetches the bus corridors once; asked for only while the toggle is on, on the TTC Map View. */
export const loadBusCatalog = busCatalogLoader.load;
export const cachedBusStops = busStopsLoader.cached;
/** Fetches the bus stops once; asked for only near stop zoom, or when a stop is opened, with buses on. */
export const loadBusStops = busStopsLoader.load;

/** The bus stop with this pole number, if the stop file has it. */
export function busStopByCode(stops: BusStopCatalog, stopCode: string): BusStopFeature | null {
  return stops.features.find((feature) => feature.properties.stopCode === stopCode) ?? null;
}

/**
 * The stop nearest a press on a bus line that serves one of its routes,
 * within `maxMeters`; the bus card offers it as a way into departures.
 */
export function nearestBusStop(
  stops: BusStopCatalog,
  coordinate: GeographicCoordinate,
  routes: readonly string[],
  maxMeters = 300,
): { stop: BusStopFeature; meters: number } | null {
  const wanted = new Set(routes);
  const [lng, lat] = coordinate;
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  let best: { stop: BusStopFeature; meters: number } | null = null;
  for (const feature of stops.features) {
    if (!feature.properties.routes.some((route) => wanted.has(route))) continue;
    const [stopLng, stopLat] = feature.geometry.coordinates;
    const meters = Math.hypot((stopLng - lng) * metersPerDegreeLng, (stopLat - lat) * metersPerDegreeLat);
    if (meters <= maxMeters && (!best || meters < best.meters)) best = { stop: feature, meters };
  }
  return best;
}

/** Badges drawn along a line before the rest fold into "+N". */
export const BUS_BADGE_MAX_ROUTES = 5;

/** The map image naming a corridor's route badges, one per set of routes. */
export function busBadgeImageId(routes: readonly string[]): string {
  return `bus-badges:${routes.join(",")}`;
}

/** The routes a badge image id names (images are drawn when the map first asks for them). */
export function busBadgeRoutes(imageId: string): string[] | null {
  if (!imageId.startsWith("bus-badges:")) return null;
  const routes = imageId.slice("bus-badges:".length).split(",").filter(Boolean);
  return routes.length > 0 ? routes : null;
}

export type BusCardRow = {
  route: string;
  name: string;
  color: string;
  textColor: string;
  replacementBuses: false;
};

/** A corridor's routes as the card lists them, in route order. */
export function busCardRows(catalog: BusCatalog, routes: readonly string[]): BusCardRow[] {
  const summaries = new Map(catalog.routes.map((route) => [route.route, route]));
  return routes.flatMap((route) => {
    const summary = summaries.get(route);
    if (!summary) return [];
    return [{ route, name: summary.name, color: summary.color, textColor: summary.textColor, replacementBuses: false as const }];
  });
}

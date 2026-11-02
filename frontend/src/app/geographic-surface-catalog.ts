/**
 * TTC streetcar catalog for the Map View (plan 13): corridors, one per street,
 * each with the daytime routes on it, and the stops those routes serve.
 * Generated from TTC static GTFS by scripts/generate-surface-catalog.mjs into
 * /assets/linewatch/geographic/ttc-surface-streetcar.json.
 *
 * A wayfinding layer: it carries no service status, and a drawn route never
 * means normal service. Geometry comes from weekday streetcar trips of one
 * schedule period, so diversions in that period are drawn as scheduled.
 */

import type { GeographicCoordinate } from "./geographic-catalog.ts";

export const STREETCAR_CATALOG_URL = "/assets/linewatch/geographic/ttc-surface-streetcar.json";

export type StreetcarCorridorFeature = {
  type: "Feature";
  id: string;
  geometry: { type: "LineString"; coordinates: GeographicCoordinate[] };
  properties: {
    featureType: "streetcar-corridor";
    /** Route numbers on this street, numeric order ("501", "504"). */
    routes: string[];
  };
};

export type StreetcarStopFeature = {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: GeographicCoordinate };
  properties: {
    featureType: "streetcar-stop";
    stopId: string;
    /** The number on the stop pole, when the TTC publishes one. */
    stopCode?: string;
    name: string;
    routes: string[];
    /** GTFS parent station, for platforms inside a subway station. */
    parentStation?: string;
  };
};

export type StreetcarRouteSummary = {
  route: string;
  name: string;
  color: string;
  textColor: string;
  /** False when no weekday streetcar trip runs, e.g. the whole route is a replacement bus. */
  drawn: boolean;
  weekdayTrips: { streetcar: number; shortTurn: number; replacementBus: number };
};

export type StreetcarCatalog = {
  type: "FeatureCollection";
  schemaVersion: "1.0.0";
  network: "ttc";
  layer: "streetcar";
  source: {
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
  routes: StreetcarRouteSummary[];
  features: (StreetcarCorridorFeature | StreetcarStopFeature)[];
};

export function isStreetcarCorridorFeature(
  feature: StreetcarCorridorFeature | StreetcarStopFeature,
): feature is StreetcarCorridorFeature {
  return feature.properties.featureType === "streetcar-corridor" && feature.geometry.type === "LineString";
}

export function isStreetcarStopFeature(
  feature: StreetcarCorridorFeature | StreetcarStopFeature,
): feature is StreetcarStopFeature {
  return feature.properties.featureType === "streetcar-stop" && feature.geometry.type === "Point";
}

/**
 * Streetcar lines show at every zoom, as the subway lines do (thinner, so the
 * subway stays the main read). Route badges along them start at
 * `STREETCAR_BADGE_MIN_ZOOM`, where the lines are far enough apart to name.
 */
export const STREETCAR_BADGE_MIN_ZOOM = 13;

let cachedCatalog: StreetcarCatalog | null = null;
let pendingCatalog: Promise<StreetcarCatalog> | null = null;

export function cachedStreetcarCatalog(): StreetcarCatalog | null {
  return cachedCatalog;
}

/** Fetches the streetcar asset once; the Map View asks for it only on the TTC network. */
export function loadStreetcarCatalog(): Promise<StreetcarCatalog> {
  if (cachedCatalog) return Promise.resolve(cachedCatalog);
  if (pendingCatalog) return pendingCatalog;
  pendingCatalog = fetch(STREETCAR_CATALOG_URL).then(async (response) => {
    if (!response.ok) throw new Error(`Unable to load streetcar routes (${response.status}).`);
    const catalog = (await response.json()) as StreetcarCatalog;
    if (catalog.layer !== "streetcar" || catalog.network !== "ttc" || !Array.isArray(catalog.features)) {
      throw new Error("Invalid streetcar routes.");
    }
    cachedCatalog = catalog;
    return catalog;
  }).finally(() => {
    pendingCatalog = null;
  });
  return pendingCatalog;
}

/** The map image naming a corridor's route badges, one per set of routes. */
export function streetcarBadgeImageId(routes: readonly string[]): string {
  return `streetcar-badges:${routes.join(",")}`;
}

/** Every set of routes the catalog draws, for registering badge images. */
export function streetcarRouteSets(catalog: StreetcarCatalog): string[][] {
  const sets = new Map<string, string[]>();
  for (const feature of catalog.features) {
    if (isStreetcarCorridorFeature(feature)) sets.set(feature.properties.routes.join(","), feature.properties.routes);
  }
  return [...sets.values()];
}

export type StreetcarCardRow = {
  route: string;
  name: string;
  color: string;
  textColor: string;
  /** Part of the route's weekday service runs as replacement buses this period. */
  replacementBuses: boolean;
};

/** A corridor's routes as the card lists them, in route order. */
export function streetcarCardRows(catalog: StreetcarCatalog, routes: readonly string[]): StreetcarCardRow[] {
  const summaries = new Map(catalog.routes.map((route) => [route.route, route]));
  return routes.flatMap((route) => {
    const summary = summaries.get(route);
    if (!summary) return [];
    return [{
      route,
      name: summary.name,
      color: summary.color,
      textColor: summary.textColor,
      replacementBuses: summary.weekdayTrips.replacementBus > 0,
    }];
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 1 – Dec 19" (or "Dec 28, 2026 – Jan 3, 2027" across years), from the feed's calendar dates. */
export function streetcarSchedulePeriodLabel(source: Pick<StreetcarCatalog["source"], "feedStartDate" | "feedEndDate">): string {
  const parse = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return { year, label: `${MONTHS[month - 1]} ${day}` };
  };
  const start = parse(source.feedStartDate);
  const end = parse(source.feedEndDate);
  return start.year === end.year
    ? `${start.label} – ${end.label}`
    : `${start.label}, ${start.year} – ${end.label}, ${end.year}`;
}

/**
 * The TTC night network on the Map View (plan 13, S10): the 300-series night
 * routes, streetcar and bus, drawn from the published schedule's weekday night
 * trips (`ttc-surface-night.json`, `generate-surface-catalog.mjs --mode
 * night`). Shown with Bus Routes on (owner, 2026-11-03), labelled as the night
 * network: a drawn night line never implies service now. Night routes stop at
 * daytime poles, so there is no night stop file.
 */

import type { GeographicCoordinate } from "./geographic-catalog.ts";
import { cachedLoader } from "./geographic-bus-catalog.ts";

export const NIGHT_CATALOG_URL = "/assets/linewatch/geographic/ttc-surface-night.json";
/** Night route badges along the lines; a daytime streetcar's badges also start at 13. */
export const NIGHT_BADGE_MIN_ZOOM = 13;
export const NIGHT_BADGE_MAX_ROUTES = 5;

export type NightRouteKind = "streetcar" | "bus";

export type NightCorridorFeature = {
  type: "Feature";
  id: string;
  geometry: { type: "LineString"; coordinates: GeographicCoordinate[] };
  properties: {
    featureType: "night-corridor";
    kind: NightRouteKind;
    routes: string[];
  };
};

export type NightRouteSummary = {
  route: string;
  name: string;
  color: string;
  textColor: string;
  kind: NightRouteKind;
  drawn: boolean;
  weekdayTrips: { night: number; shortTurn: number; replacementBus: number };
};

export type NightCatalog = {
  type: "FeatureCollection";
  schemaVersion: "1.0.0";
  network: "ttc";
  layer: "night";
  source: {
    sourceName: string;
    publisher: string;
    license: string;
    attribution: string;
    feedVersion: string;
    feedStartDate: string;
    feedEndDate: string;
    archiveSha256: string;
    servicePattern: "weekday-night";
  };
  routes: NightRouteSummary[];
  features: NightCorridorFeature[];
};

const nightCatalogLoader = cachedLoader<NightCatalog>(
  NIGHT_CATALOG_URL,
  (value): value is NightCatalog => {
    const catalog = value as Partial<NightCatalog> | null;
    return Boolean(catalog && catalog.layer === "night" && catalog.network === "ttc"
      && Array.isArray(catalog.features) && Array.isArray(catalog.routes));
  },
  "night routes",
);

export const cachedNightCatalog = nightCatalogLoader.cached;
export const loadNightCatalog = nightCatalogLoader.load;

/** The corridors of one kind, for the layer drawing that kind. */
export function nightCorridors(catalog: NightCatalog, kind: NightRouteKind): { features: NightCorridorFeature[] } {
  return { features: catalog.features.filter((feature) => feature.properties.kind === kind) };
}

/** Badge images are per kind, so a streetcar line's badge row never names a bus route. */
export function nightBadgeImageId(kind: NightRouteKind, routes: readonly string[]): string {
  return `night-${kind}-badges:${routes.join(",")}`;
}

export function nightBadgeRoutes(kind: NightRouteKind, imageId: string): string[] | null {
  const prefix = `night-${kind}-badges:`;
  if (!imageId.startsWith(prefix)) return null;
  const routes = imageId.slice(prefix.length).split(",").filter(Boolean);
  return routes.length > 0 ? routes : null;
}

export type NightCardRow = {
  route: string;
  name: string;
  color: string;
  textColor: string;
  replacementBuses: boolean;
};

/** A night corridor's routes as the card lists them; a streetcar route with replacement-bus trips says so. */
export function nightCardRows(catalog: NightCatalog, routes: readonly string[]): NightCardRow[] {
  const summaries = new Map(catalog.routes.map((route) => [route.route, route]));
  return routes.flatMap((route) => {
    const summary = summaries.get(route);
    if (!summary) return [];
    return [{
      route,
      name: summary.name,
      color: summary.color,
      textColor: summary.textColor,
      replacementBuses: summary.kind === "streetcar" && summary.weekdayTrips.replacementBus > 0,
    }];
  });
}

/**
 * TTC station floor plans for the Map View (plan 13, S7): each station's
 * footprint on every level, its entrances and its elevators, from the TTC's
 * public `StationFootprints_View` service, generated once by
 * `scripts/generate-station-plans.mjs` (nothing is read from the TTC at
 * runtime). Credited to the TTC in Privacy & Acknowledgements and on the map.
 *
 * Wayfinding only: never coloured by service data, and an elevator or
 * entrance drawn here never means it is working (accessibility outages stay
 * their own source). TTC Map View only, no switch: plans appear when zoomed in.
 */

import type { GeographicCoordinate } from "./geographic-catalog.ts";

export const STATION_PLANS_URL = "/assets/linewatch/geographic/ttc-station-plans.json";

/**
 * Footprints fade in over this zoom range (as the overview line badges fade
 * by zoom), so a plan eases in rather than appearing at one zoom.
 */
export const STATION_PLAN_FADE_ZOOMS = [15.25, 16] as const;
/** Entrance arrows, elevators and bus bays fade in here. */
export const STATION_PLAN_ICON_FADE_ZOOMS = [16.25, 16.75] as const;
/** Stairs and escalators, smaller and more numerous, a zoom later. */
export const STATION_PLAN_MINOR_ICON_FADE_ZOOMS = [17, 17.5] as const;
/** Entrance names beside their arrows. */
export const STATION_PLAN_LABEL_FADE_ZOOMS = [17.25, 17.75] as const;
/**
 * The map is given the file's URL from here, before the fade starts, so plans
 * are ready on arrival. MapLibre's worker fetches and parses it; the page's
 * main thread never does (measured: parsing it there cost a 64–81 ms task on
 * a throttled phone).
 */
export const STATION_PLANS_LOAD_ZOOM = 15;

export type StationAreaFeature = {
  type: "Feature";
  geometry:
    | { type: "Polygon"; coordinates: GeographicCoordinate[][] }
    | { type: "MultiPolygon"; coordinates: GeographicCoordinate[][][] };
  properties: {
    featureType: "station-area";
    stationId: string;
    /** 0 is street level; platforms are below it (to -5), bridges above. */
    floor: number;
  };
};

export type StationEntranceFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: GeographicCoordinate };
  properties: {
    featureType: "station-entrance";
    stationId: string;
    /** Compass bearing of the arrow, out of the station. */
    bearing: number;
    name: string;
    /** The exit letter signed in the station (King, Dufferin), when there is one. */
    letter?: string;
  };
};

export type StationElevatorFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: GeographicCoordinate };
  properties: { featureType: "station-elevator"; stationId: string };
};

/** "up" or "down" from this point's level, as the source gives it; plain stairs have none. */
export type StationPlanDirection = "up" | "down";

export type StationStairsFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: GeographicCoordinate };
  properties: { featureType: "station-stairs"; stationId: string; direction?: StationPlanDirection };
};

export type StationEscalatorFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: GeographicCoordinate };
  properties: { featureType: "station-escalator"; stationId: string; direction: StationPlanDirection };
};

/** A station bus bay from TTC GTFS ("Jane Station at Bus Bay 2"); its stop number opens departures. */
export type StationBayFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: GeographicCoordinate };
  properties: { featureType: "station-bay"; stationId: string; stopCode: string; bay: string };
};

export type StationPlanFeature =
  | StationAreaFeature
  | StationEntranceFeature
  | StationElevatorFeature
  | StationStairsFeature
  | StationEscalatorFeature
  | StationBayFeature;

export type StationPlans = {
  type: "FeatureCollection";
  schemaVersion: "1.0.0";
  network: "ttc";
  layer: "station-plans";
  source: {
    sourceName: string;
    publisher: string;
    serviceUrl: string;
    itemId: string;
    license: null;
    attribution: string;
    basis: string;
    serviceModified: string | null;
  };
  /** Bus bays come from TTC GTFS, not the plan service. */
  baySource?: { sourceName: string; license: string; feedVersion: string | null; feedStartDate: string | null; feedEndDate: string | null };
  features: StationPlanFeature[];
};

/** The text beside an entrance arrow: its signed letter, then its name. */
export function stationEntranceLabel(properties: StationEntranceFeature["properties"]): string {
  return properties.letter ? `${properties.letter} · ${properties.name}` : properties.name;
}

/** The same label as a MapLibre expression, so the worker-loaded features need no main-thread pass. */
export const STATION_ENTRANCE_LABEL_EXPRESSION = [
  "case",
  ["has", "letter"],
  ["concat", ["get", "letter"], " · ", ["get", "name"]],
  ["get", "name"],
] as const;

export const STATION_BAY_IMAGE_PREFIX = "station-plan-bay-";

/** The image id for a bay badge ("station-plan-bay-2"). */
export function stationBayImageId(bay: string): string {
  return `${STATION_BAY_IMAGE_PREFIX}${bay}`;
}

/** The bay number in a bay badge's image id, or null for any other image. */
export function stationBayFromImageId(id: string): string | null {
  return id.startsWith(STATION_BAY_IMAGE_PREFIX) ? id.slice(STATION_BAY_IMAGE_PREFIX.length) || null : null;
}

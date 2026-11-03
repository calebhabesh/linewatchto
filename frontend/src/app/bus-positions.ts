/**
 * Live TTC bus positions on the Map View (plan 13, S8).
 * GET /api/surface/buses/positions?bbox=west,south,east,north.
 *
 * The same GPS feed, freshness and stale rules as live streetcars (S4,
 * `streetcar-positions.ts`, whose age and state helpers apply unchanged).
 * There are about ten times as many buses, so the Map View draws them from
 * `BUS_VEHICLE_MIN_ZOOM` and asks only for the area around its view.
 */

import { apiUrl } from "./api-client.ts";
import type { GeographicCoordinate } from "./geographic-catalog.ts";
import type { BusCatalog } from "./geographic-bus-catalog.ts";
import {
  streetcarVehicleKey,
  streetcarVehicleState,
  type StreetcarPositions,
  type StreetcarVehicle,
} from "./streetcar-positions.ts";
import { ttcRouteFamily, type TtcRouteFamily } from "./ttc-route-badge.ts";

export const BUS_POSITIONS_PATH = "/api/surface/buses/positions";
/** Buses draw (and are read) from this zoom: a neighbourhood, not the whole city. */
export const BUS_VEHICLE_MIN_ZOOM = 13;
export const BUS_VEHICLE_LABEL_MIN_ZOOM = 15;
/** A bus this far from every drawn line of its route is flagged as off its mapped route. */
export const BUS_OFF_ROUTE_METERS = 100;
/** The area read around the view: this much of the view's size again on each side. */
export const BUS_POSITIONS_AREA_MARGIN = 0.5;

export type BusVehicle = StreetcarVehicle & {
  /** A bus running a streetcar route's replacement-bus trip (e.g. 503). */
  replacement: boolean;
};

export type BusPositions = Omit<StreetcarPositions, "vehicles"> & { vehicles: BusVehicle[] };

/** West, south, east, north. */
export type BusPositionsArea = readonly [number, number, number, number];

export type BusPositionsRead = { data: BusPositions; receivedAt: number; area: BusPositionsArea | null };

export type BusPositionsResult =
  | { kind: "ok"; read: BusPositionsRead }
  | { kind: "error" };

/** The area to read for a view: the view grown by the margin, rounded outward to 0.01°. */
export function busPositionsArea(view: BusPositionsArea, margin = BUS_POSITIONS_AREA_MARGIN): BusPositionsArea {
  const [west, south, east, north] = view;
  const dx = (east - west) * margin;
  const dy = (north - south) * margin;
  const down = (value: number) => Math.floor(value * 100) / 100;
  const up = (value: number) => Math.ceil(value * 100) / 100;
  return [down(west - dx), down(south - dy), up(east + dx), up(north + dy)];
}

/** Whether a read area still covers the view (a pan inside it needs no new read). */
export function busPositionsAreaCovers(area: BusPositionsArea | null, view: BusPositionsArea): boolean {
  if (!area) return false;
  return view[0] >= area[0] && view[1] >= area[1] && view[2] <= area[2] && view[3] <= area[3];
}

export async function getBusPositions(
  options: {
    area: BusPositionsArea | null;
    fetcher?: typeof fetch;
    apiBaseUrl?: string;
    signal?: AbortSignal;
    now?: () => number;
  },
): Promise<BusPositionsResult> {
  const fetcher = options.fetcher ?? fetch;
  const path = options.area
    ? `${BUS_POSITIONS_PATH}?bbox=${options.area.map((value) => value.toFixed(2)).join(",")}`
    : BUS_POSITIONS_PATH;
  try {
    const response = await fetcher(apiUrl(path, options.apiBaseUrl), { cache: "no-store", signal: options.signal });
    if (!response.ok) return { kind: "error" };
    const data = await response.json() as BusPositions;
    if (!data || typeof data.state !== "string" || !Array.isArray(data.vehicles)) return { kind: "error" };
    return { kind: "ok", read: { data, receivedAt: (options.now ?? Date.now)(), area: options.area } };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { kind: "error" };
  }
}

/** The marker colour family: a replacement bus takes its streetcar route's (regular red). */
export type BusVehicleFamily = Exclude<TtcRouteFamily, "line-5" | "line-6">;

export function busVehicleFamily(route: string): BusVehicleFamily {
  const family = ttcRouteFamily(route);
  return family === "line-5" || family === "line-6" ? "regular" : family;
}

export type BusVehicleFeatureProperties = {
  key: string;
  route: string;
  state: "live" | "stale";
  /** Clockwise from north; -1 without a heading (drawn without its arrow). */
  bearing: number;
  family: BusVehicleFamily;
  selected: boolean;
};

/** Map features for the buses still worth drawing; expired reports are left out. */
export function busVehicleFeatures(
  read: BusPositionsRead | null,
  now: number,
  selectedKey: string | null = null,
): GeoJSON.FeatureCollection<GeoJSON.Point, BusVehicleFeatureProperties> {
  const features: GeoJSON.Feature<GeoJSON.Point, BusVehicleFeatureProperties>[] = [];
  if (read && (read.data.state === "live" || read.data.state === "stale")) {
    for (const vehicle of read.data.vehicles) {
      const state = streetcarVehicleState(vehicle, read, now);
      if (state === "expired") continue;
      const key = streetcarVehicleKey(vehicle);
      features.push({
        type: "Feature",
        id: key,
        geometry: { type: "Point", coordinates: [vehicle.longitude, vehicle.latitude] },
        properties: {
          key,
          route: vehicle.route,
          state,
          bearing: typeof vehicle.bearing === "number" && Number.isFinite(vehicle.bearing) ? vehicle.bearing : -1,
          family: busVehicleFamily(vehicle.route),
          selected: key === selectedKey,
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/**
 * What the map draws of a feature set: each bus's key, state and selection.
 * Ages grow every few seconds but only a state change redraws, so a tick
 * that changes no state skips the map update.
 */
export function busVehicleFeaturesSignature(
  data: GeoJSON.FeatureCollection<GeoJSON.Point, BusVehicleFeatureProperties>,
): string {
  return data.features
    .map((feature) => `${feature.properties.key}:${feature.properties.state[0]}${feature.properties.selected ? "*" : ""}`)
    .join("|");
}

export function findBusVehicle(read: BusPositionsRead | null, key: string): BusVehicle | null {
  return read?.data.vehicles.find((vehicle) => streetcarVehicleKey(vehicle) === key) ?? null;
}

/** Corridor lines per route, projected to local metres once per catalog. */
type RouteLines = Map<string, Array<Array<[number, number]>>>;
const routeLinesCache = new WeakMap<BusCatalog, RouteLines>();
const METERS_PER_DEGREE_LAT = 110_540;
const METERS_PER_DEGREE_LNG = 111_320 * Math.cos((43.7 * Math.PI) / 180);

function project([lng, lat]: GeographicCoordinate): [number, number] {
  return [lng * METERS_PER_DEGREE_LNG, lat * METERS_PER_DEGREE_LAT];
}

function routeLines(catalog: BusCatalog): RouteLines {
  const cached = routeLinesCache.get(catalog);
  if (cached) return cached;
  const lines: RouteLines = new Map();
  for (const feature of catalog.features) {
    if (feature.properties.featureType !== "bus-corridor") continue;
    const projected = feature.geometry.coordinates.map(project);
    for (const route of feature.properties.routes) {
      const list = lines.get(route) ?? [];
      list.push(projected);
      lines.set(route, list);
    }
  }
  routeLinesCache.set(catalog, lines);
  return lines;
}

function segmentDistance([px, py]: [number, number], [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/**
 * Metres from a point to the nearest drawn bus line carrying `route`; null when
 * the route has no drawn bus line (night routes, replacement buses), so nothing
 * can be said about it being off route.
 */
export function distanceToBusRoute(catalog: BusCatalog, route: string, coordinate: GeographicCoordinate): number | null {
  const lines = routeLines(catalog).get(route);
  if (!lines) return null;
  const point = project(coordinate);
  let best = Infinity;
  for (const line of lines) {
    for (let index = 1; index < line.length; index += 1) {
      best = Math.min(best, segmentDistance(point, line[index - 1], line[index]));
    }
  }
  return best;
}

export function isBusOffRoute(catalog: BusCatalog | null, vehicle: Pick<BusVehicle, "route" | "longitude" | "latitude">): boolean {
  if (!catalog) return false;
  const meters = distanceToBusRoute(catalog, vehicle.route, [vehicle.longitude, vehicle.latitude]);
  return meters !== null && meters > BUS_OFF_ROUTE_METERS;
}

/**
 * Live TTC streetcar positions on the Map View (plan 13, S4).
 * GET /api/surface/streetcars/positions.
 *
 * Real GPS reports, not schematic placements. Each car carries its age on the
 * server clock; the age keeps growing here between reads, so a failed read or
 * an offline phone turns cars stale and then removes them. Old positions never
 * read as current.
 */

import { apiUrl } from "./api-client.ts";
import type { GeographicCoordinate } from "./geographic-catalog.ts";
import { isStreetcarCorridorFeature, type StreetcarCatalog } from "./geographic-surface-catalog.ts";
import { isTtcNightRoute } from "./ttc-route-badge.ts";

export const STREETCAR_POSITIONS_PATH = "/api/surface/streetcars/positions";
/** A car this far from every drawn line of its route is flagged as off its mapped route. */
export const STREETCAR_OFF_ROUTE_METERS = 100;
/** How often the Map View asks while open and visible, unless the server says otherwise. */
export const STREETCAR_POSITIONS_REFRESH_MS = 15_000;

export type StreetcarPositionsState = "live" | "stale" | "unavailable" | "disabled";

export type StreetcarVehicle = {
  vehicleId: string | null;
  route: string;
  routeName: string;
  /** Raw GTFS headsign ("East - 504 King towards Broadview Station"). */
  destination: string;
  latitude: number;
  longitude: number;
  bearing: number | null;
  reportedAt: string;
  /** Age of the report on the server clock at `generatedAt`. */
  ageSeconds: number;
  stale: boolean;
};

export type StreetcarPositions = {
  networkId: "ttc";
  state: StreetcarPositionsState;
  source: string;
  generatedAt: string;
  sourceUpdatedAt: string | null;
  maxSourceAgeSeconds: number;
  vehicleStaleAfterSeconds: number;
  vehicleMaxAgeSeconds: number;
  refreshSeconds: number;
  vehicles: StreetcarVehicle[];
};

/** A response and when it arrived (client ms), so ages can grow between reads. */
export type StreetcarPositionsRead = { data: StreetcarPositions; receivedAt: number };

export type StreetcarPositionsResult =
  | { kind: "ok"; read: StreetcarPositionsRead }
  | { kind: "error" };

export async function getStreetcarPositions(
  options: { fetcher?: typeof fetch; apiBaseUrl?: string; signal?: AbortSignal; now?: () => number } = {},
): Promise<StreetcarPositionsResult> {
  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(apiUrl(STREETCAR_POSITIONS_PATH, options.apiBaseUrl), {
      cache: "no-store",
      signal: options.signal,
    });
    if (!response.ok) return { kind: "error" };
    const data = await response.json() as StreetcarPositions;
    if (!data || typeof data.state !== "string" || !Array.isArray(data.vehicles)) return { kind: "error" };
    return { kind: "ok", read: { data, receivedAt: (options.now ?? Date.now)() } };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { kind: "error" };
  }
}

/** The car's report age now: its age when served plus the time since the read arrived. */
export function streetcarVehicleAgeSeconds(
  vehicle: Pick<StreetcarVehicle, "ageSeconds">,
  read: Pick<StreetcarPositionsRead, "receivedAt">,
  now: number,
): number {
  return Math.max(0, vehicle.ageSeconds) + Math.max(0, (now - read.receivedAt) / 1000);
}

export type StreetcarVehicleState = "live" | "stale" | "expired";

export function streetcarVehicleState(
  vehicle: Pick<StreetcarVehicle, "ageSeconds" | "stale">,
  read: StreetcarPositionsRead,
  now: number,
): StreetcarVehicleState {
  const age = streetcarVehicleAgeSeconds(vehicle, read, now);
  if (age > read.data.vehicleMaxAgeSeconds) return "expired";
  if (vehicle.stale || read.data.state !== "live" || age > read.data.vehicleStaleAfterSeconds) return "stale";
  return "live";
}

/** "8 s ago", "1 min ago", "12 min ago". */
export function streetcarAgeLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  if (whole < 60) return `${whole} s ago`;
  return `${Math.floor(whole / 60)} min ago`;
}

/** The card's status line: "Live GPS · 40 s ago" or "Stale · Last Report 3 min ago". */
export function streetcarVehicleStatusLabel(state: StreetcarVehicleState, ageSeconds: number): string {
  return state === "live"
    ? `Live GPS · ${streetcarAgeLabel(ageSeconds)}`
    : `Stale · Last Report ${streetcarAgeLabel(ageSeconds)}`;
}

/** Corridor lines per route, projected to local metres once per catalog. */
type RouteLines = Map<string, Array<Array<[number, number]>>>;
const routeLinesCache = new WeakMap<StreetcarCatalog, RouteLines>();
const METERS_PER_DEGREE_LAT = 110_540;
const REFERENCE_LAT = 43.7;
const METERS_PER_DEGREE_LNG = 111_320 * Math.cos((REFERENCE_LAT * Math.PI) / 180);

function project([lng, lat]: GeographicCoordinate): [number, number] {
  return [lng * METERS_PER_DEGREE_LNG, lat * METERS_PER_DEGREE_LAT];
}

function routeLines(catalog: StreetcarCatalog): RouteLines {
  const cached = routeLinesCache.get(catalog);
  if (cached) return cached;
  const lines: RouteLines = new Map();
  for (const feature of catalog.features) {
    if (!isStreetcarCorridorFeature(feature)) continue;
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
 * Metres from a point to the nearest drawn line carrying `route`; Infinity
 * when the route has no drawn line (e.g. a route run only by buses this period).
 */
export function distanceToStreetcarRoute(
  catalog: StreetcarCatalog,
  route: string,
  coordinate: GeographicCoordinate,
): number {
  const lines = routeLines(catalog).get(route);
  if (!lines) return Infinity;
  const point = project(coordinate);
  let best = Infinity;
  for (const line of lines) {
    for (let index = 1; index < line.length; index += 1) {
      best = Math.min(best, segmentDistance(point, line[index - 1], line[index]));
    }
  }
  return best;
}

export function streetcarVehicleKey(vehicle: Pick<StreetcarVehicle, "vehicleId" | "route" | "latitude" | "longitude">): string {
  return vehicle.vehicleId ?? `${vehicle.route}@${vehicle.latitude.toFixed(5)},${vehicle.longitude.toFixed(5)}`;
}

export type StreetcarVehicleFeatureProperties = {
  key: string;
  route: string;
  state: "live" | "stale";
  /** Clockwise from north; -1 without a heading (drawn without its notch). */
  bearing: number;
  offRoute: boolean;
  /** A 300-series night route, drawn in TTC night blue. */
  night: boolean;
  selected: boolean;
};

/** Map features for the cars still worth drawing; expired reports are left out. */
export function streetcarVehicleFeatures(
  read: StreetcarPositionsRead | null,
  catalog: StreetcarCatalog | null,
  now: number,
  selectedKey: string | null = null,
): GeoJSON.FeatureCollection<GeoJSON.Point, StreetcarVehicleFeatureProperties> {
  const features: GeoJSON.Feature<GeoJSON.Point, StreetcarVehicleFeatureProperties>[] = [];
  if (read && (read.data.state === "live" || read.data.state === "stale")) {
    for (const vehicle of read.data.vehicles) {
      const state = streetcarVehicleState(vehicle, read, now);
      if (state === "expired") continue;
      const coordinate: GeographicCoordinate = [vehicle.longitude, vehicle.latitude];
      const key = streetcarVehicleKey(vehicle);
      features.push({
        type: "Feature",
        id: key,
        geometry: { type: "Point", coordinates: coordinate },
        properties: {
          key,
          route: vehicle.route,
          state,
          bearing: typeof vehicle.bearing === "number" && Number.isFinite(vehicle.bearing) ? vehicle.bearing : -1,
          offRoute: catalog ? distanceToStreetcarRoute(catalog, vehicle.route, coordinate) > STREETCAR_OFF_ROUTE_METERS : false,
          night: isTtcNightRoute(vehicle.route),
          selected: key === selectedKey,
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

export function findStreetcarVehicle(read: StreetcarPositionsRead | null, key: string): StreetcarVehicle | null {
  return read?.data.vehicles.find((vehicle) => streetcarVehicleKey(vehicle) === key) ?? null;
}

/** How long to wait before the next read: the server's cadence, slower when the source is off. */
export function streetcarPositionsDelayMs(result: StreetcarPositionsResult | null): number | null {
  if (!result || result.kind === "error") return STREETCAR_POSITIONS_REFRESH_MS * 2;
  if (result.read.data.state === "disabled") return null;
  if (result.read.data.state === "unavailable") return 60_000;
  const seconds = result.read.data.refreshSeconds;
  return Number.isFinite(seconds) && seconds >= 5 ? seconds * 1000 : STREETCAR_POSITIONS_REFRESH_MS;
}

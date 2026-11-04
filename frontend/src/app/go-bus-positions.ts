/**
 * Live GO bus positions on the GO/UP Map View (plan 13, S9).
 * GET /api/regional/buses/positions?bbox=west,south,east,north.
 *
 * Real GPS reports from the Metrolinx GO VehiclePosition feed, the read the GO
 * train markers make; its own flag, freshness and switch. GO buses report less
 * often than TTC vehicles, so the server's limits are wider (stale after 5 min,
 * gone after 15), and buses not yet on their trip are not served. GO publishes
 * no heading for buses, so the glyph has no arrow. GO buses say nothing about
 * GO/UP rail service and never colour by service data.
 *
 * The age and state rules are the streetcar ones (`streetcar-positions.ts`), and
 * reads cover the view grown by half its size, as for TTC buses (`bus-positions.ts`).
 */

import { apiUrl } from "./api-client.ts";
import { busPositionsArea, type BusPositionsArea } from "./bus-positions.ts";
import { goBusStopByCode, nearestGoBusStop, type GoBusStopCatalog, type GoBusStopFeature } from "./go-bus-catalog.ts";
import { readLayerPreference, writeLayerPreference } from "./map-view-layers.ts";
import {
  streetcarVehicleState,
  type StreetcarPositionsRead,
  type StreetcarPositionsState,
} from "./streetcar-positions.ts";

export const GO_BUS_POSITIONS_PATH = "/api/regional/buses/positions";
/** GO buses draw (and are read) from this zoom; GO route badges start at 11. */
export const GO_BUS_VEHICLE_MIN_ZOOM = 10;
export const GO_BUS_VEHICLE_LABEL_MIN_ZOOM = 13;
/** The GO/UP deck's Live GPS switch; on until a rider turns it off. */
export const GO_BUS_POSITIONS_STORAGE_KEY = "linewatch-map-view-go-bus-positions-v1";
/** A card's stop: the bus's next stop when it is on the route, else the nearest on the route within this. */
export const GO_BUS_VEHICLE_STOP_METERS = 1000;

export type GoBusVehicle = {
  vehicleId: string | null;
  tripId: string;
  /** GO route number ("41"). */
  route: string;
  /** From the vehicle label ("Hamilton GO"); null when GO sent none. */
  destination: string | null;
  latitude: number;
  longitude: number;
  reportedAt: string;
  ageSeconds: number;
  stale: boolean;
  /** The GO stop number the bus is heading to or at. */
  nextStopCode: string | null;
};

export type GoBusPositions = {
  networkId: "regional";
  state: StreetcarPositionsState;
  source: string;
  generatedAt: string;
  sourceUpdatedAt: string | null;
  maxSourceAgeSeconds: number;
  vehicleStaleAfterSeconds: number;
  vehicleMaxAgeSeconds: number;
  refreshSeconds: number;
  vehicles: GoBusVehicle[];
};

export type GoBusPositionsRead = { data: GoBusPositions; receivedAt: number; area: BusPositionsArea | null };

export type GoBusPositionsResult =
  | { kind: "ok"; read: GoBusPositionsRead }
  | { kind: "error" };

export function readGoBusPositionsPreference(storage: Pick<Storage, "getItem"> | null | undefined): boolean {
  return readLayerPreference(storage, GO_BUS_POSITIONS_STORAGE_KEY, true);
}

export function writeGoBusPositionsPreference(storage: Pick<Storage, "setItem"> | null | undefined, enabled: boolean): void {
  writeLayerPreference(storage, GO_BUS_POSITIONS_STORAGE_KEY, enabled);
}

export { busPositionsArea as goBusPositionsArea };

export async function getGoBusPositions(
  options: {
    area: BusPositionsArea | null;
    fetcher?: typeof fetch;
    apiBaseUrl?: string;
    signal?: AbortSignal;
    now?: () => number;
  },
): Promise<GoBusPositionsResult> {
  const fetcher = options.fetcher ?? fetch;
  const path = options.area
    ? `${GO_BUS_POSITIONS_PATH}?bbox=${options.area.map((value) => value.toFixed(2)).join(",")}`
    : GO_BUS_POSITIONS_PATH;
  try {
    const response = await fetcher(apiUrl(path, options.apiBaseUrl), { cache: "no-store", signal: options.signal });
    if (!response.ok) return { kind: "error" };
    const data = await response.json() as GoBusPositions;
    if (!data || typeof data.state !== "string" || !Array.isArray(data.vehicles)) return { kind: "error" };
    return { kind: "ok", read: { data, receivedAt: (options.now ?? Date.now)(), area: options.area } };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { kind: "error" };
  }
}

/** The age and stale rules are the streetcar ones; they only read the limits and state. */
function asStreetcarRead(read: GoBusPositionsRead): StreetcarPositionsRead {
  return read as unknown as StreetcarPositionsRead;
}

export function goBusVehicleState(vehicle: GoBusVehicle, read: GoBusPositionsRead, now: number) {
  return streetcarVehicleState(vehicle, asStreetcarRead(read), now);
}

export function goBusVehicleKey(vehicle: Pick<GoBusVehicle, "vehicleId" | "tripId">): string {
  return vehicle.vehicleId ? `vehicle:${vehicle.vehicleId}` : `trip:${vehicle.tripId}`;
}

export function findGoBusVehicle(read: GoBusPositionsRead | null, key: string): GoBusVehicle | null {
  return read?.data.vehicles.find((vehicle) => goBusVehicleKey(vehicle) === key) ?? null;
}

export type GoBusVehicleFeatureProperties = {
  key: string;
  route: string;
  state: "live" | "stale";
  selected: boolean;
};

/** Map features for the GO buses still worth drawing; expired reports are left out. */
export function goBusVehicleFeatures(
  read: GoBusPositionsRead | null,
  now: number,
  selectedKey: string | null = null,
): GeoJSON.FeatureCollection<GeoJSON.Point, GoBusVehicleFeatureProperties> {
  const features: GeoJSON.Feature<GeoJSON.Point, GoBusVehicleFeatureProperties>[] = [];
  if (read && (read.data.state === "live" || read.data.state === "stale")) {
    for (const vehicle of read.data.vehicles) {
      const state = goBusVehicleState(vehicle, read, now);
      if (state === "expired") continue;
      const key = goBusVehicleKey(vehicle);
      features.push({
        type: "Feature",
        id: key,
        geometry: { type: "Point", coordinates: [vehicle.longitude, vehicle.latitude] },
        properties: { key, route: vehicle.route, state, selected: key === selectedKey },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

/** Each bus's key, state and selection: an age tick that changes none of them skips the map update. */
export function goBusVehicleFeaturesSignature(
  data: GeoJSON.FeatureCollection<GeoJSON.Point, GoBusVehicleFeatureProperties>,
): string {
  return data.features
    .map((feature) => `${feature.properties.key}:${feature.properties.state[0]}${feature.properties.selected ? "*" : ""}`)
    .join("|");
}

/**
 * The stop a GO bus card offers: its next stop when that stop is in the GO bus
 * stop file and on its route, else the nearest stop on its route within
 * `GO_BUS_VEHICLE_STOP_METERS`.
 */
export function goBusVehicleStop(
  stops: GoBusStopCatalog,
  vehicle: GoBusVehicle,
): { stop: GoBusStopFeature; next: boolean } | null {
  if (vehicle.nextStopCode) {
    const next = goBusStopByCode(stops, vehicle.nextStopCode);
    if (next && next.properties.routes.includes(vehicle.route)) return { stop: next, next: true };
  }
  const nearest = nearestGoBusStop(stops, [vehicle.longitude, vehicle.latitude], [vehicle.route], GO_BUS_VEHICLE_STOP_METERS);
  return nearest ? { stop: nearest.stop, next: false } : null;
}

/**
 * The Live GPS switch's caption on GO/UP: "GO Buses"; "With GO Buses" while
 * GO bus routes are off (nothing is drawn until they are on); or the source's
 * state when it cannot show them.
 */
export function goBusPositionsDetail(
  routesOn: boolean,
  shown: boolean,
  state: StreetcarPositionsState | null,
): string {
  if (!routesOn) return "With GO Buses";
  if (!shown || state === null) return "GO Buses";
  if (state === "disabled") return "Source Off";
  if (state === "stale") return "Stale";
  if (state === "unavailable") return "Unavailable";
  return "GO Buses";
}

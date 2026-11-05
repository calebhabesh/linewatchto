/**
 * Neutral selection of surface stops and routes on the Map View (plan 14,
 * U4). A route panel's View on Map (U5) and a surface notice's View (plan 15)
 * mark stops or a route in the stop panel's selected style, only while that
 * panel is open. The open stop is the one-stop case of the same selection.
 * Selection never carries service status: no service colour, badge or detour.
 *
 * Pure inputs for the map layers: which layer draws each selected stop, the
 * MapLibre filters, and the area the camera frames.
 */

import type { SurfaceRouteKind } from "./surface-search.ts";

/** The Map View layers that can draw a selection. */
export type SurfaceSelectionLayer = "streetcar" | "bus" | "night" | "go-bus";

export type SurfaceSelectionRoute = { layer: SurfaceSelectionLayer; route: string };

export type SurfaceMapSelection = {
  /** Stop numbers marked in the selected style. */
  stopCodes: readonly string[];
  /** Routes drawn with the selected outline: a route panel's one, or all a notice names. */
  routes: readonly SurfaceSelectionRoute[];
};

type Coordinate = [number, number];

/** The Map View layer a route kind belongs to (express and community buses are buses). */
export function surfaceRouteLayer(kind: SurfaceRouteKind): SurfaceSelectionLayer {
  return kind === "streetcar" ? "streetcar"
    : kind === "go-bus" ? "go-bus"
    : kind === "night-streetcar" || kind === "night-bus" ? "night"
    : "bus";
}

/** The layer that draws a search route, or null when no trip of it is drawn this period. */
export function surfaceRouteSelection(route: { kind: SurfaceRouteKind; route: string; drawn: boolean }): SurfaceSelectionRoute | null {
  if (!route.drawn) return null;
  return { layer: surfaceRouteLayer(route.kind), route: route.route };
}

/**
 * The selection the map draws: the open stop (if any) with what a panel
 * shows on the map. Null when there is nothing to draw.
 */
export function mergeSurfaceSelection(
  openStopCode: string | null | undefined,
  shown: SurfaceMapSelection | null | undefined,
): SurfaceMapSelection | null {
  const stopCodes = [...new Set([...(openStopCode ? [openStopCode] : []), ...(shown?.stopCodes ?? [])])];
  const routes = shown?.routes ?? [];
  if (stopCodes.length === 0 && routes.length === 0) return null;
  return { stopCodes, routes };
}

/** Same key, same selection: the camera frames a selection once. "" for none. */
export function surfaceSelectionKey(selection: SurfaceMapSelection | null | undefined): string {
  if (!selection) return "";
  const stops = [...selection.stopCodes].sort().join(",");
  const routes = selection.routes.map(({ layer, route }) => `${layer}:${route}`).sort().join(",");
  return stops || routes ? `${routes}|${stops}` : "";
}

/** A corridor's routes as one string, so a filter can find a route with `in`. */
export function surfaceRouteKey(routes: readonly string[]): string {
  return `|${routes.join("|")}|`;
}

/** The selection's routes that one layer draws. */
export function selectedRoutesInLayer(selection: SurfaceMapSelection | null | undefined, layer: SurfaceSelectionLayer): string[] {
  return (selection?.routes ?? []).filter((route) => route.layer === layer).map((route) => route.route);
}

/** Corridors carrying any of the routes; matches nothing without one. */
export function selectedRouteFilter(routes: readonly string[]): unknown[] {
  if (routes.length === 0) return ["==", ["get", "routeKey"], "\u0000"];
  return ["any", ...routes.map((route) => ["in", `|${route}|`, ["get", "routeKey"]])];
}

/** The selected stops. */
export function selectedStopFilter(stopCodes: readonly string[]): unknown[] {
  return ["in", ["get", "stopCode"], ["literal", [...stopCodes]]];
}

/** A layer's ordinary stops leave the selected ones to the selection layer; null is no filter. */
export function unselectedStopFilter(stopCodes: readonly string[]): unknown[] | null {
  return stopCodes.length > 0 ? ["!", selectedStopFilter(stopCodes)] : null;
}

/**
 * A zoom-interpolated line width, wider by `add` px at every stop, for the
 * outline drawn under a selected route.
 */
export function widenLineWidth(width: readonly unknown[], add: number): unknown[] {
  if (width[0] !== "interpolate") return width.slice();
  return width.map((value, index) => (index >= 3 && index % 2 === 0 && typeof value === "number" ? value + add : value));
}

export type TtcStopCodeSets = {
  streetcar: ReadonlySet<string> | null;
  bus: ReadonlySet<string> | null;
  night: ReadonlySet<string> | null;
};

export type TtcStopAssignment = {
  streetcar: string[];
  bus: string[];
  night: string[];
  /** The next stop file a selected stop needs before it can be placed, if any. */
  needs: "streetcar" | "bus" | "night" | null;
};

/**
 * The layer that draws each selected TTC stop: a pole the streetcar layer
 * has stays with it (shared poles show one label), then the daytime bus stops,
 * then the night-only poles. A file still loading (null) holds its stops back
 * and is named in `needs`; a number in no file is left out.
 */
export function assignSelectedTtcStops(stopCodes: readonly string[], sets: TtcStopCodeSets): TtcStopAssignment {
  const result: TtcStopAssignment = { streetcar: [], bus: [], night: [], needs: null };
  const need = (file: "streetcar" | "bus" | "night") => {
    const order = ["streetcar", "bus", "night"];
    if (!result.needs || order.indexOf(file) < order.indexOf(result.needs)) result.needs = file;
  };
  for (const code of stopCodes) {
    if (!sets.streetcar) { need("streetcar"); continue; }
    if (sets.streetcar.has(code)) { result.streetcar.push(code); continue; }
    if (!sets.bus) { need("bus"); continue; }
    if (sets.bus.has(code)) { result.bus.push(code); continue; }
    if (!sets.night) { need("night"); continue; }
    if (sets.night.has(code)) result.night.push(code);
  }
  return result;
}

type LineFeature = { geometry: { coordinates: Coordinate[] }; properties: { routes: readonly string[] } };

/** The corridors carrying any of the routes. */
export function routeCorridors<T extends LineFeature>(features: readonly T[], routes: readonly string[]): T[] {
  return features.filter((feature) => feature.properties.routes.some((route) => routes.includes(route)));
}

/** South-west and north-east corners around the points, or null without any. */
export function surfaceSelectionBounds(points: readonly Coordinate[]): [Coordinate, Coordinate] | null {
  if (points.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lon, lat] of points) {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return [[west, south], [east, north]];
}

/** Every vertex of the routes' corridors, for the camera. */
export function routeCoordinates(features: readonly LineFeature[], routes: readonly string[]): Coordinate[] {
  return routeCorridors(features, routes).flatMap((feature) => feature.geometry.coordinates);
}

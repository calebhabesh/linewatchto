/**
 * The GO bus layer on the GO/UP Map View (plan 13, S6), from the shared bus
 * kit: GO green dashed lines (owner, 2026-11-03) under the GO/UP rail lines,
 * badges in each route's GO colour, and GO stop numbers. Never coloured by
 * service data, and never part of GO/UP rail status.
 */

import type { Map as MapLibreMap } from "maplibre-gl";
import {
  GO_BUS_BADGE_MAX_ROUTES,
  GO_BUS_BADGE_MIN_ZOOM,
  GO_BUS_LINE_COLOR,
  GO_BUS_LINE_DARK_COLOR,
  GO_BUS_STOP_MIN_ZOOM,
  goBusBadgeImageId,
  goBusBadgeRoutes,
  type GoBusCatalog,
  type GoBusStopCatalog,
} from "../app/go-bus-catalog.ts";
import { createBusLayerKit } from "./geographic-bus-layers.ts";

const RAIL_LINE_BEFORE = "transit-routes-casing";
const STATION_BEFORE = "transit-stations-outer";

/**
 * GO green, dashed, thinner than the GO/UP rail lines: the TTC bus rule
 * (agency colour, dashed) on GO. The dash keeps it apart from the solid
 * Kitchener line, which shares the green. On the dark map GO green at a
 * pixel wide sinks into the basemap, so the dark theme lifts it to a lighter
 * green of the same hue. Constant: never data-driven.
 */
export const GO_BUS_LINE_STYLE = {
  color: GO_BUS_LINE_COLOR,
  dash: [2.2, 1.4],
  light: { casing: "#ffffff" },
  dark: { casing: "#000000", color: GO_BUS_LINE_DARK_COLOR },
  width: ["interpolate", ["linear"], ["zoom"], 7, 0.6, 10, 1, 13, 1.8, 17, 3.2] as unknown[],
  casingWidth: ["interpolate", ["linear"], ["zoom"], 7, 1.4, 10, 2, 13, 3, 17, 5] as unknown[],
};

/** Route colours from the catalog (GO's GTFS route_color), set as it installs. */
const routeColors = new Map<string, { fill: string; text: string }>();

const kit = createBusLayerKit({
  idPrefix: "transit-go-bus",
  style: GO_BUS_LINE_STYLE,
  badgeMinZoom: GO_BUS_BADGE_MIN_ZOOM,
  stopMinZoom: GO_BUS_STOP_MIN_ZOOM,
  badgeMaxRoutes: GO_BUS_BADGE_MAX_ROUTES,
  badgeImageId: goBusBadgeImageId,
  badgeRoutes: goBusBadgeRoutes,
  badgeColors: (route) => {
    const colors = routeColors.get(route);
    return { fill: colors?.fill ?? GO_BUS_LINE_COLOR, text: colors?.text ?? "#ffffff", edge: null };
  },
  lineBefore: (map) => (map.getLayer(RAIL_LINE_BEFORE) ? RAIL_LINE_BEFORE : undefined),
  badgeBefore: (map) => (map.getLayer(STATION_BEFORE) ? STATION_BEFORE : undefined),
  stopBefore: (map) => (map.getLayer(STATION_BEFORE) ? STATION_BEFORE : undefined),
});

export const GO_BUS_CASING_LAYER = kit.layers.casing;
export const GO_BUS_LINE_LAYER = kit.layers.line;
export const GO_BUS_HIT_LAYER = kit.layers.hit;
export const GO_BUS_BADGE_LAYER = kit.layers.badges;
export const GO_BUS_STOP_DOT_LAYER = kit.layers.stopDots;
export const GO_BUS_STOP_LAYER = kit.layers.stops;

export const addMissingGoBusBadgeImage = kit.addMissingBadgeImage;

export function installGoBusLayers(
  map: MapLibreMap,
  catalog: GoBusCatalog,
  options: { dark: boolean; activeFilteredLine: string | null },
): void {
  for (const route of catalog.routes) routeColors.set(route.route, { fill: route.color, text: route.textColor });
  kit.installLayers(map, catalog, options);
}

export function installGoBusStopLayers(
  map: MapLibreMap,
  stops: GoBusStopCatalog,
  options: { activeFilteredLine: string | null; selectedStopCode: string | null },
): void {
  kit.installStopLayers(map, stops, options);
}

export const removeGoBusLayers = kit.removeLayers;
export const hasGoBusLayers = kit.hasLayers;
export const hasGoBusStopLayers = kit.hasStopLayers;
export const updateGoBusStopSelection = kit.updateStopSelection;
export const goBusStopCodeAtPoint = kit.stopCodeAtPoint;
export const updateGoBusFilter = kit.updateFilter;

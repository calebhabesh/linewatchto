/**
 * The TTC night network on the Map View (plan 13, S10), from the shared bus
 * kit: night blue (the night badge family's `#0054A6`), streetcar routes solid
 * and bus routes dashed (owner, 2026-11-03), each thinner than its daytime
 * line and drawn under the daytime bus and streetcar lines, so a daytime route
 * on the same street is never hidden. Badges in the night family (blue on
 * white, blue edge) from zoom 13. No stop layer: most night stops are
 * daytime poles, and the night-only poles draw only when selected (plan 14,
 * U4). Shown with Bus Routes on; never coloured by service data, and a drawn
 * night line never implies service now.
 */

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import {
  NIGHT_BADGE_MAX_ROUTES,
  NIGHT_BADGE_MIN_ZOOM,
  nightBadgeImageId,
  nightBadgeRoutes,
  nightCorridors,
  type NightCatalog,
  type NightRouteKind,
  type NightStopFeature,
} from "../app/night-route-catalog.ts";
import { TTC_NIGHT_ROUTE_BLUE, ttcRouteBadgeColors } from "../app/ttc-route-badge.ts";
import {
  BUS_BADGE_LAYER,
  BUS_CASING_LAYER,
  createBusLayerKit,
  ttcSelectedStopBefore,
  type BusLineStyle,
} from "./geographic-bus-layers.ts";
import { removeSurfaceSelectionLayers, type SurfaceSelectionTarget } from "./geographic-surface-selection-layers.ts";
import { STREETCAR_BADGE_LAYER, STREETCAR_CASING_LAYER } from "./geographic-streetcar-layers.ts";

const RAIL_LINE_BEFORE = "transit-routes-casing";
const STATION_BEFORE = "transit-stations-outer";
/** On the dark map the night blue sinks into the basemap; a lighter blue of the same hue. */
export const NIGHT_LINE_DARK_COLOR = "#5B9BE0";

/** Night bus routes: dashed as daytime buses, a little thinner. Constant: never data-driven. */
export const NIGHT_BUS_LINE_STYLE: BusLineStyle = {
  color: TTC_NIGHT_ROUTE_BLUE,
  dash: [2.2, 1.4],
  light: { casing: "#ffffff" },
  dark: { casing: "#000000", color: NIGHT_LINE_DARK_COLOR },
  width: ["interpolate", ["linear"], ["zoom"], 9, 0.5, 12, 0.8, 14, 1.3, 17, 2.6],
  casingWidth: ["interpolate", ["linear"], ["zoom"], 9, 1.2, 12, 1.7, 14, 2.4, 17, 4.2],
};

/** Night streetcar routes: solid as daytime streetcars, thinner than them. */
export const NIGHT_STREETCAR_LINE_STYLE: BusLineStyle = {
  color: TTC_NIGHT_ROUTE_BLUE,
  dash: null,
  light: { casing: "#ffffff" },
  dark: { casing: "#000000", color: NIGHT_LINE_DARK_COLOR },
  width: ["interpolate", ["linear"], ["zoom"], 9, 0.7, 12, 1.1, 14, 1.7, 17, 3],
  casingWidth: ["interpolate", ["linear"], ["zoom"], 9, 1.5, 12, 2.1, 14, 2.9, 17, 4.8],
};

/** Under the daytime bus lines, else the streetcar lines, else the subway. */
function underDaytimeLines(map: MapLibreMap): string | undefined {
  for (const layer of [BUS_CASING_LAYER, STREETCAR_CASING_LAYER, RAIL_LINE_BEFORE]) {
    if (map.getLayer(layer)) return layer;
  }
  return undefined;
}

/** Under the daytime badges, so a daytime route's badge wins a crowded street. */
function underDaytimeBadges(map: MapLibreMap): string | undefined {
  for (const layer of [BUS_BADGE_LAYER, STREETCAR_BADGE_LAYER, STATION_BEFORE]) {
    if (map.getLayer(layer)) return layer;
  }
  return undefined;
}

function kitFor(kind: NightRouteKind) {
  return createBusLayerKit({
    idPrefix: `transit-night-${kind}`,
    style: kind === "streetcar" ? NIGHT_STREETCAR_LINE_STYLE : NIGHT_BUS_LINE_STYLE,
    badgeMinZoom: NIGHT_BADGE_MIN_ZOOM,
    stopMinZoom: Infinity,
    badgeMaxRoutes: NIGHT_BADGE_MAX_ROUTES,
    badgeImageId: (routes) => nightBadgeImageId(kind, routes),
    badgeRoutes: (imageId) => nightBadgeRoutes(kind, imageId),
    badgeColors: ttcRouteBadgeColors,
    lineBefore: underDaytimeLines,
    badgeBefore: underDaytimeBadges,
    stopBefore: () => undefined,
  });
}

const kits = { streetcar: kitFor("streetcar"), bus: kitFor("bus") } as const;
const KINDS: NightRouteKind[] = ["streetcar", "bus"];

export const NIGHT_STREETCAR_LINE_LAYER = kits.streetcar.layers.line;
export const NIGHT_BUS_LINE_LAYER = kits.bus.layers.line;
/** Wide, invisible copies of the lines and the badges: what a press finds. */
export const NIGHT_PRESS_LAYERS = [
  kits.streetcar.layers.hit, kits.streetcar.layers.badges, kits.bus.layers.hit, kits.bus.layers.badges,
];

/** Draws a night badge row the map asked for. Returns whether the id was a night badge. */
export function addMissingNightBadgeImage(map: MapLibreMap, imageId: string): boolean {
  return KINDS.some((kind) => kits[kind].addMissingBadgeImage(map, imageId));
}

/** Adds both kinds' lines and badges (again after a style change). Idempotent. */
export function installNightLayers(
  map: MapLibreMap,
  catalog: NightCatalog,
  options: { dark: boolean; activeFilteredLine: string | null },
): void {
  for (const kind of KINDS) kits[kind].installLayers(map, nightCorridors(catalog, kind), options);
}

export function hasNightLayers(map: MapLibreMap): boolean {
  return KINDS.every((kind) => kits[kind].hasLayers(map));
}

export function removeNightLayers(map: MapLibreMap): void {
  for (const kind of KINDS) kits[kind].removeLayers(map);
}

export function updateNightFilter(map: MapLibreMap, activeFilteredLine: string | null): void {
  for (const kind of KINDS) kits[kind].updateFilter(map, activeFilteredLine);
}

/** Where a selected night route draws (plan 14, U4): each kind's own outline. */
export const NIGHT_SELECTION_TARGETS: SurfaceSelectionTarget[] = KINDS.map((kind) => kits[kind].selectionTarget);

/**
 * With Bus Routes off, a selected night route still draws: each kind's
 * source holds only that route's corridors (none for the other kind).
 */
export function installNightSelectionSources(map: MapLibreMap, catalog: NightCatalog, route: string | null): void {
  for (const kind of KINDS) {
    const corridors = route
      ? nightCorridors(catalog, kind).features.filter((feature) => feature.properties.routes.includes(route))
      : [];
    kits[kind].installSelectionSources(map, { corridors, stops: [] });
  }
}

/**
 * Night-only poles (plan 14, U1: 245 poles only night routes serve) are
 * never drawn as a layer; a selected one draws from this source, which holds
 * only the selected poles.
 */
const NIGHT_STOP_SOURCE_ID = "transit-night-stops";
export const NIGHT_STOP_SELECTION_TARGET: SurfaceSelectionTarget = {
  prefix: "transit-night",
  corridorSource: null,
  stopSource: NIGHT_STOP_SOURCE_ID,
  style: null,
  lineBefore: () => undefined,
  stopBefore: ttcSelectedStopBefore,
};

export function installNightStopSelectionSource(map: MapLibreMap, stops: readonly NightStopFeature[]): void {
  const data: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: stops.map((feature) => ({
      type: "Feature",
      geometry: feature.geometry,
      properties: { stopCode: feature.properties.stopCode },
    })),
  };
  const source = map.getSource(NIGHT_STOP_SOURCE_ID) as GeoJSONSource | undefined;
  if (source) source.setData(data);
  else map.addSource(NIGHT_STOP_SOURCE_ID, { type: "geojson", data });
}

export function removeNightStopSelection(map: MapLibreMap): void {
  removeSurfaceSelectionLayers(map, NIGHT_STOP_SELECTION_TARGET.prefix);
  if (map.getSource(NIGHT_STOP_SOURCE_ID)) map.removeSource(NIGHT_STOP_SOURCE_ID);
}

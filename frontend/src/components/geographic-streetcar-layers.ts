/**
 * The TTC streetcar layer on the Map View (plan 13, S2): one line per street
 * from the streetcar catalog, with route badges along it. A wayfinding layer,
 * drawn under the subway and never coloured by service data.
 *
 * Layer ids start with `transit-`, so a network switch removes them with the
 * other transit layers and the network fade covers them.
 */

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import {
  STREETCAR_BADGE_MIN_ZOOM,
  STREETCAR_STOP_LABEL_MIN_ZOOM,
  STREETCAR_STOP_MIN_ZOOM,
  isStreetcarCorridorFeature,
  isStreetcarStopFeature,
  streetcarBadgeImageId,
  streetcarRouteSets,
  type StreetcarCatalog,
  type StreetcarCorridorFeature,
  type StreetcarStopFeature,
} from "../app/geographic-surface-catalog.ts";
import { routeCorridors, surfaceRouteKey, unselectedStopFilter } from "../app/surface-map-selection.ts";
import { setTransitPaintProperty } from "./geographic-network-transition.ts";
import {
  removeSurfaceSelectionLayers,
  surfaceSelectionStopLayers,
  type SurfaceSelectionTarget,
} from "./geographic-surface-selection-layers.ts";
import { MAP_LABEL_FONT_BOLD } from "../app/geographic-config.ts";

const SOURCE_ID = "transit-streetcar-corridors";
const STOP_SOURCE_ID = "transit-streetcar-stops";
export const STREETCAR_CASING_LAYER = "transit-streetcar-casing";
export const STREETCAR_LINE_LAYER = "transit-streetcar-line";
/** Wider, invisible copy of the line that takes presses. */
export const STREETCAR_HIT_LAYER = "transit-streetcar-hit";
export const STREETCAR_BADGE_LAYER = "transit-streetcar-badges";
/**
 * Stop-number labels (S3); a press opens that stop's departures. Black on white
 * like the TTC's own stop labels, so they never read as red route badges, and
 * lifted above a dot on the stop's published position (the pole, usually on
 * the sidewalk), so the label does not sit on the street or the line.
 */
export const STREETCAR_STOP_LAYER = "transit-streetcar-stops";
/** The stop's exact published position. */
export const STREETCAR_STOP_DOT_LAYER = "transit-streetcar-stop-dots";
const STREETCAR_LAYERS = [
  STREETCAR_CASING_LAYER, STREETCAR_LINE_LAYER, STREETCAR_HIT_LAYER, STREETCAR_BADGE_LAYER,
  STREETCAR_STOP_DOT_LAYER, STREETCAR_STOP_LAYER,
];

const STOP_PILL_IMAGE = "streetcar-stop-pill";
const SELECTION_PREFIX = "transit-streetcar";
/** Thinner than the subway at every zoom (2.2 px at 9, 5 px at 14), so the subway stays the main read. */
const LINE_WIDTH = ["interpolate", ["linear"], ["zoom"], 9, 1.1, 12, 1.8, 14, 2.6, 17, 4.6];
const CASING_WIDTH = ["interpolate", ["linear"], ["zoom"], 9, 2.1, 12, 3, 14, 4.4, 17, 7];
const STREETCAR_RED = "#ED1C24";

/** Under the subway lines; badges sit over them but under station markers and names. */
const LINE_BEFORE = "transit-routes-casing";
const BADGE_BEFORE = "transit-stations-outer";
/** The live cars' lowest layer (geographic-streetcar-vehicles.ts). */
const VEHICLE_HALO_LAYER = "transit-streetcar-vehicles-halo";
/** Live buses (S8) sit under live streetcars; badges and stops go under both. */
const BUS_VEHICLE_HALO_LAYER = "transit-bus-vehicles-halo";
const SOURCES = ["transit-streetcar-corridors", "transit-streetcar-stops"];

const BADGE_PIXEL_RATIO = 2;
/** Badge height in CSS pixels; widths follow the route number. */
const BADGE_HEIGHT = 20;
const BADGE_GAP = 2;
/**
 * The map's badge sizes, largest first: a route number (13.5), a selected stop
 * (11), then every other stop, which grows a little toward street level.
 */
export const STOP_NUMBER_SIZE = ["interpolate", ["linear"], ["zoom"], 16.5, 9.5, 18, 10.5];

function lineOpacity(activeFilteredLine: string | null): number {
  return activeFilteredLine ? 0.25 : 1;
}

function badgeOpacity(activeFilteredLine: string | null): number {
  return activeFilteredLine ? 0.25 : 1;
}

/**
 * Draws a corridor's route badges side by side: the TTC streetcar badge, a
 * red box with a white edge and number. Skipped without a DOM (unit tests).
 */
function drawBadgeRow(routes: readonly string[], color: string, textColor: string): ImageData | null {
  if (typeof document === "undefined") return null;
  const scale = BADGE_PIXEL_RATIO;
  const height = BADGE_HEIGHT * scale;
  const font = `800 ${13.5 * scale}px Arial, Helvetica, sans-serif`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = font;
  const widths = routes.map((route) => Math.ceil(ctx.measureText(route).width) + 10 * scale);
  canvas.width = widths.reduce((sum, width) => sum + width, 0) + BADGE_GAP * scale * (routes.length - 1);
  canvas.height = height;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let x = 0;
  routes.forEach((route, index) => {
    const width = widths[index];
    const inset = scale; // half the edge, so it stays inside the image
    ctx.beginPath();
    ctx.roundRect(x + inset, inset, width - 2 * inset, height - 2 * inset, 4 * scale);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5 * scale;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.fillStyle = textColor;
    ctx.fillText(route, x + width / 2, height / 2 + scale * 0.5);
    x += width + BADGE_GAP * scale;
  });
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * A stretchable label behind a stop number: white with a dark edge (a
 * selected stop's is the shared selected pill). Nine-slice, so one image
 * fits every number.
 */
function drawStopPill(fill: string, edge: string): ImageData | null {
  if (typeof document === "undefined") return null;
  const scale = BADGE_PIXEL_RATIO;
  const size = 20 * scale;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const inset = scale;
  ctx.beginPath();
  ctx.roundRect(inset, inset, size - 2 * inset, size - 2 * inset, 5 * scale);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5 * scale;
  ctx.strokeStyle = edge;
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

function registerStopPillImages(map: MapLibreMap) {
  const scale = BADGE_PIXEL_RATIO;
  const options = {
    pixelRatio: scale,
    stretchX: [[7 * scale, 13 * scale]] as [number, number][],
    stretchY: [[7 * scale, 13 * scale]] as [number, number][],
    content: [5 * scale, 4 * scale, 15 * scale, 16 * scale] as [number, number, number, number],
  };
  // The same in both themes: white labels stand out on the dark map, and the
  // dark edge keeps them apart from the light map.
  const images: Array<[string, string, string]> = [
    [STOP_PILL_IMAGE, "#ffffff", "#1f2937"],
  ];
  for (const [id, fill, edge] of images) {
    try {
      // The pill follows the theme, so a style change redraws it.
      if (map.hasImage(id)) map.removeImage(id);
      const image = drawStopPill(fill, edge);
      if (image) map.addImage(id, image, options);
    } catch {
      // Without the pill the number still shows over its halo.
    }
  }
}

function corridorCollection(features: readonly StreetcarCorridorFeature[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        badgeImage: streetcarBadgeImageId(feature.properties.routes),
        routeKey: surfaceRouteKey(feature.properties.routes),
      },
    })),
  };
}

function stopCollection(features: readonly StreetcarStopFeature[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: features.filter((feature) => Boolean(feature.properties.stopCode)).map((feature) => ({
      type: "Feature",
      id: feature.id,
      geometry: feature.geometry,
      properties: { stopCode: feature.properties.stopCode, name: feature.properties.name },
    })),
  };
}

function setSourceData(map: MapLibreMap, id: string, data: GeoJSON.FeatureCollection) {
  const source = map.getSource(id) as GeoJSONSource | undefined;
  if (source) source.setData(data);
  else map.addSource(id, { type: "geojson", data });
}

function registerBadgeImages(map: MapLibreMap, catalog: StreetcarCatalog) {
  const color = catalog.routes.find((route) => route.drawn)?.color ?? "#ED1C24";
  const textColor = catalog.routes.find((route) => route.drawn)?.textColor ?? "#FFFFFF";
  for (const routes of streetcarRouteSets(catalog)) {
    const id = streetcarBadgeImageId(routes);
    if (map.hasImage(id)) continue;
    try {
      const image = drawBadgeRow(routes, color, textColor);
      if (image) map.addImage(id, image, { pixelRatio: BADGE_PIXEL_RATIO });
    } catch {
      // A missing badge leaves the line itself readable.
    }
  }
}

/** Adds the streetcar source, images and layers (again after a style change). Idempotent. */
export function installStreetcarLayers(
  map: MapLibreMap,
  catalog: StreetcarCatalog,
  options: { dark: boolean; activeFilteredLine: string | null; selectedStopCodes?: readonly string[] },
): void {
  setSourceData(map, SOURCE_ID, corridorCollection(catalog.features.filter(isStreetcarCorridorFeature)));
  registerBadgeImages(map, catalog);
  const color = catalog.routes.find((route) => route.drawn)?.color ?? STREETCAR_RED;
  setSourceData(map, STOP_SOURCE_ID, stopCollection(catalog.features.filter(isStreetcarStopFeature)));
  registerStopPillImages(map);
  const unselected = unselectedStopFilter(options.selectedStopCodes ?? []);
  const lineBefore = map.getLayer(LINE_BEFORE) ? LINE_BEFORE : undefined;
  // Live cars (S4) and buses (S8) stay above badges and stop labels when the
  // routes are turned back on after the vehicles were drawn.
  const badgeBefore = map.getLayer(BUS_VEHICLE_HALO_LAYER) ? BUS_VEHICLE_HALO_LAYER
    : map.getLayer(VEHICLE_HALO_LAYER) ? VEHICLE_HALO_LAYER
    : map.getLayer(BADGE_BEFORE) ? BADGE_BEFORE : undefined;

  if (!map.getLayer(STREETCAR_CASING_LAYER)) {
    map.addLayer({
      id: STREETCAR_CASING_LAYER,
      type: "line",
      source: SOURCE_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": options.dark ? "#000000" : "#ffffff",
        "line-width": CASING_WIDTH as never,
        "line-opacity": lineOpacity(options.activeFilteredLine),
      },
    }, lineBefore);
  }
  if (!map.getLayer(STREETCAR_LINE_LAYER)) {
    map.addLayer({
      id: STREETCAR_LINE_LAYER,
      type: "line",
      source: SOURCE_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": color,
        "line-width": LINE_WIDTH as never,
        "line-opacity": lineOpacity(options.activeFilteredLine),
      },
    }, lineBefore);
  }
  if (!map.getLayer(STREETCAR_HIT_LAYER)) {
    map.addLayer({
      id: STREETCAR_HIT_LAYER,
      type: "line",
      source: SOURCE_ID,
      paint: {
        "line-color": "#000000",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 8, 13, 16],
        "line-opacity": 0,
      },
    }, lineBefore);
  }
  if (!map.getLayer(STREETCAR_BADGE_LAYER)) {
    map.addLayer({
      id: STREETCAR_BADGE_LAYER,
      type: "symbol",
      source: SOURCE_ID,
      minzoom: STREETCAR_BADGE_MIN_ZOOM,
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 320,
        "icon-image": ["get", "badgeImage"],
        "icon-rotation-alignment": "viewport",
        "icon-allow-overlap": false,
        "icon-padding": 4,
      },
      paint: {
        "icon-opacity": badgeOpacity(options.activeFilteredLine),
      },
    }, badgeBefore);
  }
  if (!map.getLayer(STREETCAR_STOP_DOT_LAYER)) {
    map.addLayer({
      id: STREETCAR_STOP_DOT_LAYER,
      type: "circle",
      source: STOP_SOURCE_ID,
      minzoom: STREETCAR_STOP_MIN_ZOOM,
      ...(unselected ? { filter: unselected as never } : {}),
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 2.5, 19, 4],
        "circle-color": "#0f172a",
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
        "circle-opacity": badgeOpacity(options.activeFilteredLine),
        "circle-stroke-opacity": badgeOpacity(options.activeFilteredLine),
      },
    }, badgeBefore);
  }
  if (!map.getLayer(STREETCAR_STOP_LAYER)) {
    map.addLayer({
      id: STREETCAR_STOP_LAYER,
      type: "symbol",
      source: STOP_SOURCE_ID,
      minzoom: STREETCAR_STOP_LABEL_MIN_ZOOM,
      ...(unselected ? { filter: unselected as never } : {}),
      layout: {
        "text-field": ["get", "stopCode"],
        "text-font": [MAP_LABEL_FONT_BOLD],
        "text-size": STOP_NUMBER_SIZE as never,
        // Above the dot, clear of the street.
        "text-anchor": "bottom",
        "text-offset": [0, -0.75],
        "icon-anchor": "bottom",
        "icon-image": STOP_PILL_IMAGE,
        "icon-text-fit": "both",
        "icon-text-fit-padding": [0.5, 2.5, 0.5, 2.5],
        // Collide and hide: a pill that would overlap another, a station name
        // or a route badge is left out until the map zooms in further.
        "icon-allow-overlap": false,
        "text-allow-overlap": false,
        "icon-padding": 2,
      },
      paint: {
        "text-color": "#0f172a",
        "text-opacity": badgeOpacity(options.activeFilteredLine),
        "icon-opacity": badgeOpacity(options.activeFilteredLine),
      },
    }, badgeBefore);
  }
}

/**
 * Leaves the selected stops (every layer's, so a shared pole never shows
 * twice) to the selection layer, which draws them in the selected style.
 */
export function updateStreetcarStopSelection(
  map: MapLibreMap,
  selectedStopCodes: readonly string[],
): void {
  const filter = unselectedStopFilter(selectedStopCodes);
  for (const layer of [STREETCAR_STOP_DOT_LAYER, STREETCAR_STOP_LAYER]) {
    if (map.getLayer(layer)) map.setFilter(layer, filter as never);
  }
}

/** Where a selected streetcar route or stop draws (plan 14, U4). */
export const STREETCAR_SELECTION_TARGET: SurfaceSelectionTarget = {
  prefix: SELECTION_PREFIX,
  corridorSource: SOURCE_ID,
  stopSource: STOP_SOURCE_ID,
  style: { color: STREETCAR_RED, dash: null, width: LINE_WIDTH, casingWidth: CASING_WIDTH },
  lineBefore: (map) => {
    for (const layer of [STREETCAR_CASING_LAYER, LINE_BEFORE]) if (map.getLayer(layer)) return layer;
    return undefined;
  },
  stopBefore: (map) => {
    for (const layer of [BUS_VEHICLE_HALO_LAYER, VEHICLE_HALO_LAYER, BADGE_BEFORE]) if (map.getLayer(layer)) return layer;
    return undefined;
  },
};

/**
 * With Streetcar Routes off, a selection still draws: the sources hold only
 * the selected route's corridors and the selected stops.
 */
export function installStreetcarSelectionSources(
  map: MapLibreMap,
  catalog: StreetcarCatalog,
  selection: { routes: readonly string[]; stopCodes: readonly string[] },
): void {
  const codes = new Set(selection.stopCodes);
  setSourceData(map, SOURCE_ID, corridorCollection(
    routeCorridors(catalog.features.filter(isStreetcarCorridorFeature), selection.routes),
  ));
  setSourceData(map, STOP_SOURCE_ID, stopCollection(
    catalog.features.filter(isStreetcarStopFeature).filter((feature) => codes.has(feature.properties.stopCode ?? "")),
  ));
}

/** The stop number under a press on a pill (a selected one first), if any. */
export function streetcarStopCodeAtPoint(map: MapLibreMap, point: { x: number; y: number }): string | null {
  const layers = [...surfaceSelectionStopLayers(SELECTION_PREFIX), STREETCAR_STOP_LAYER, STREETCAR_STOP_DOT_LAYER]
    .filter((layer) => map.getLayer(layer));
  if (layers.length === 0) return null;
  const features = map.queryRenderedFeatures(
    [[point.x - 4, point.y - 4], [point.x + 4, point.y + 4]],
    { layers },
  );
  const code = features[0]?.properties?.stopCode;
  return typeof code === "string" && code ? code : null;
}

/** Streetcars dim with the other lines while a subway line is filtered. */
export function updateStreetcarFilter(map: MapLibreMap, activeFilteredLine: string | null): void {
  for (const layer of [STREETCAR_CASING_LAYER, STREETCAR_LINE_LAYER]) {
    if (map.getLayer(layer)) setTransitPaintProperty(map, layer, "line-opacity", lineOpacity(activeFilteredLine));
  }
  if (map.getLayer(STREETCAR_BADGE_LAYER)) {
    setTransitPaintProperty(map, STREETCAR_BADGE_LAYER, "icon-opacity", badgeOpacity(activeFilteredLine));
  }
  if (map.getLayer(STREETCAR_STOP_DOT_LAYER)) {
    setTransitPaintProperty(map, STREETCAR_STOP_DOT_LAYER, "circle-opacity", badgeOpacity(activeFilteredLine));
    setTransitPaintProperty(map, STREETCAR_STOP_DOT_LAYER, "circle-stroke-opacity", badgeOpacity(activeFilteredLine));
  }
  if (map.getLayer(STREETCAR_STOP_LAYER)) {
    setTransitPaintProperty(map, STREETCAR_STOP_LAYER, "icon-opacity", badgeOpacity(activeFilteredLine));
    setTransitPaintProperty(map, STREETCAR_STOP_LAYER, "text-opacity", badgeOpacity(activeFilteredLine));
  }
}

export function hasStreetcarLayers(map: MapLibreMap): boolean {
  return STREETCAR_LAYERS.every((layer) => Boolean(map.getLayer(layer)));
}

/** Removes the streetcar routes and stops (the Streetcar Routes switch turned off), a selection's too. */
export function removeStreetcarLayers(map: MapLibreMap): void {
  removeSurfaceSelectionLayers(map, SELECTION_PREFIX);
  for (const layer of [...STREETCAR_LAYERS].reverse()) {
    if (map.getLayer(layer)) map.removeLayer(layer);
  }
  for (const source of SOURCES) {
    if (map.getSource(source)) map.removeSource(source);
  }
}

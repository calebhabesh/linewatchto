/**
 * Bus layers on the Map View: one line per street (or road) from a bus
 * catalog, route badges along it, and stop dots and numbers from the stop
 * file. TTC buses (plan 13, S5: red dashed, under the streetcars and subway)
 * and GO buses (S6: GO green dashed, under the GO/UP rail lines) share this
 * kit with their own ids, style and badge colours, as do the TTC night
 * routes (S10, `geographic-night-layers.ts`). Wayfinding layers behind
 * a toggle, never coloured by service data.
 *
 * Layer ids start with `transit-`, so a network switch removes them with the
 * other transit layers and the network fade covers them.
 */

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import {
  BUS_BADGE_MAX_ROUTES,
  BUS_BADGE_MIN_ZOOM,
  BUS_STOP_LABEL_MIN_ZOOM,
  BUS_STOP_MIN_ZOOM,
  busBadgeImageId,
  busBadgeRoutes,
  type BusCatalog,
  type BusStopCatalog,
} from "../app/geographic-bus-catalog.ts";
import { surfaceRouteKey, unselectedStopFilter } from "../app/surface-map-selection.ts";
import { ttcRouteBadgeColors } from "../app/ttc-route-badge.ts";
import { setTransitPaintProperty } from "./geographic-network-transition.ts";
import {
  removeSurfaceSelectionLayers,
  surfaceSelectionStopLayers,
  type SurfaceSelectionTarget,
} from "./geographic-surface-selection-layers.ts";
import {
  STREETCAR_BADGE_LAYER,
  STREETCAR_CASING_LAYER,
  STREETCAR_STOP_DOT_LAYER,
  STOP_NUMBER_SIZE,
} from "./geographic-streetcar-layers.ts";
import { STREETCAR_VEHICLE_HALO_LAYER } from "./geographic-streetcar-vehicles.ts";
import { MAP_LABEL_FONT_BOLD } from "../app/geographic-config.ts";

/** Under the subway (or GO/UP rail) lines. */
const RAIL_LINE_BEFORE = "transit-routes-casing";
/** Under station markers and names. */
const STATION_BEFORE = "transit-stations-outer";

const BADGE_PIXEL_RATIO = 2;
const BADGE_HEIGHT = 20;
const BADGE_GAP = 2;

export type BusLineStyle = {
  color: string;
  /** Null draws a solid line (night streetcar routes, S10). */
  dash: number[] | null;
  light: { casing: string; color?: string };
  /** A dark-theme line colour, where the base colour would sink into a dark basemap. */
  dark: { casing: string; color?: string };
  width: unknown[];
  casingWidth: unknown[];
};

type BadgeColors = { fill: string; text: string; edge: string | null };

type BusCorridorLike = {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: { routes: string[] };
};
type BusStopLike = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { stopCode: string };
};

export type BusLayerConfig = {
  /** Source and layer id stem: `transit-bus`, `transit-go-bus`. */
  idPrefix: string;
  style: BusLineStyle;
  badgeMinZoom: number;
  stopMinZoom: number;
  /** Where stop numbers start, when later than the dots. */
  stopLabelMinZoom?: number;
  badgeMaxRoutes: number;
  badgeImageId: (routes: readonly string[]) => string;
  badgeRoutes: (imageId: string) => string[] | null;
  badgeColors: (route: string) => BadgeColors;
  /** The layer the lines go under, if present. */
  lineBefore: (map: MapLibreMap) => string | undefined;
  /** The layer the badges go under. */
  badgeBefore: (map: MapLibreMap) => string | undefined;
  /** The layer the stops go under. */
  stopBefore: (map: MapLibreMap) => string | undefined;
  /** The layer selected stops (plan 14, U4) go under: over every stop label. */
  selectedStopBefore?: (map: MapLibreMap) => string | undefined;
};

function dimmed(activeFilteredLine: string | null): number {
  return activeFilteredLine ? 0.25 : 1;
}

/**
 * A corridor's route badges side by side, the first few and then "+N".
 * Skipped without a DOM (unit tests).
 */
function drawBadgeRow(routes: readonly string[], maxRoutes: number, colorsFor: (route: string) => BadgeColors): ImageData | null {
  if (typeof document === "undefined") return null;
  const scale = BADGE_PIXEL_RATIO;
  const height = BADGE_HEIGHT * scale;
  const font = `800 ${13.5 * scale}px Arial, Helvetica, sans-serif`;
  const shown = routes.length > maxRoutes ? routes.slice(0, maxRoutes - 1) : routes.slice();
  const more = routes.length - shown.length;
  const labels = more > 0 ? [...shown, `+${more}`] : shown;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = font;
  const widths = labels.map((label) => Math.ceil(ctx.measureText(label).width) + 10 * scale);
  canvas.width = widths.reduce((sum, width) => sum + width, 0) + BADGE_GAP * scale * (labels.length - 1);
  canvas.height = height;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let x = 0;
  labels.forEach((label, index) => {
    const width = widths[index];
    const isMore = more > 0 && index === labels.length - 1;
    const colors = isMore ? { fill: "#1f2937", text: "#ffffff", edge: null } : colorsFor(label);
    const inset = scale;
    ctx.beginPath();
    ctx.roundRect(x + inset, inset, width - 2 * inset, height - 2 * inset, 4 * scale);
    ctx.fillStyle = colors.fill;
    ctx.fill();
    ctx.lineWidth = 1.5 * scale;
    ctx.strokeStyle = colors.edge ?? "#ffffff";
    ctx.stroke();
    ctx.fillStyle = colors.text;
    ctx.fillText(label, x + width / 2, height / 2 + scale * 0.5);
    x += width + BADGE_GAP * scale;
  });
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** The stretchable label behind a stop number, as the streetcar stop's. */
function drawStopPill(fill: string, edge: string): ImageData | null {
  if (typeof document === "undefined") return null;
  const scale = BADGE_PIXEL_RATIO;
  const size = 20 * scale;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.beginPath();
  ctx.roundRect(scale, scale, size - 2 * scale, size - 2 * scale, 5 * scale);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1.5 * scale;
  ctx.strokeStyle = edge;
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

/** One bus layer's functions, bound to its ids, style and badge colours. */
export function createBusLayerKit(config: BusLayerConfig) {
  const SOURCE_ID = `${config.idPrefix}-corridors`;
  const STOP_SOURCE_ID = `${config.idPrefix}-stops`;
  const CASING_LAYER = `${config.idPrefix}-casing`;
  const LINE_LAYER = `${config.idPrefix}-line`;
  const HIT_LAYER = `${config.idPrefix}-hit`;
  const BADGE_LAYER = `${config.idPrefix}-badges`;
  const STOP_DOT_LAYER = `${config.idPrefix}-stop-dots`;
  const STOP_LAYER = `${config.idPrefix}-stops`;
  const LINE_LAYERS = [CASING_LAYER, LINE_LAYER, HIT_LAYER, BADGE_LAYER];
  const STOP_LAYERS = [STOP_DOT_LAYER, STOP_LAYER];
  const STOP_PILL_IMAGE = `${config.idPrefix}-stop-pill`;

  function registerStopPillImages(map: MapLibreMap) {
    const scale = BADGE_PIXEL_RATIO;
    const options = {
      pixelRatio: scale,
      stretchX: [[7 * scale, 13 * scale]] as [number, number][],
      stretchY: [[7 * scale, 13 * scale]] as [number, number][],
      content: [5 * scale, 4 * scale, 15 * scale, 16 * scale] as [number, number, number, number],
    };
    const images: Array<[string, string, string]> = [
      [STOP_PILL_IMAGE, "#ffffff", "#6b7280"],
    ];
    for (const [id, fill, edge] of images) {
      if (map.hasImage(id)) continue;
      try {
        const image = drawStopPill(fill, edge);
        if (image) map.addImage(id, image, options);
      } catch {
        // Without the pill the number still shows.
      }
    }
  }

  const corridorCollection = (features: readonly BusCorridorLike[]): GeoJSON.FeatureCollection => ({
    type: "FeatureCollection",
    features: features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        badgeImage: config.badgeImageId(feature.properties.routes),
        routeKey: surfaceRouteKey(feature.properties.routes),
      },
    })),
  });
  const stopCollection = (features: readonly BusStopLike[]): GeoJSON.FeatureCollection => ({
    type: "FeatureCollection",
    features: features.map((feature) => ({
      type: "Feature",
      geometry: feature.geometry,
      properties: { stopCode: feature.properties.stopCode },
    })),
  });
  const setSourceData = (map: MapLibreMap, id: string, data: GeoJSON.FeatureCollection) => {
    const source = map.getSource(id) as GeoJSONSource | undefined;
    if (source) source.setData(data);
    else map.addSource(id, { type: "geojson", data });
  };

  /**
   * Draws a badge row the map asked for (`styleimagemissing`), so only the
   * route sets in view are drawn. Returns whether it handled the id.
   */
  function addMissingBadgeImage(map: MapLibreMap, imageId: string): boolean {
    const routes = config.badgeRoutes(imageId);
    if (!routes) return false;
    if (map.hasImage(imageId)) return true;
    try {
      const image = drawBadgeRow(routes, config.badgeMaxRoutes, config.badgeColors);
      if (image) map.addImage(imageId, image, { pixelRatio: BADGE_PIXEL_RATIO });
    } catch {
      // A missing badge leaves the line itself readable.
    }
    return true;
  }

  /** Adds the corridors and their layers (again after a style change). Idempotent. */
  function installLayers(
    map: MapLibreMap,
    catalog: { features: BusCorridorLike[] },
    options: { dark: boolean; activeFilteredLine: string | null },
  ): void {
    setSourceData(map, SOURCE_ID, corridorCollection(catalog.features));

    const theme = options.dark ? config.style.dark : config.style.light;
    const opacity = dimmed(options.activeFilteredLine);
    const before = config.lineBefore(map);
    if (!map.getLayer(CASING_LAYER)) {
      map.addLayer({
        id: CASING_LAYER,
        type: "line",
        source: SOURCE_ID,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": theme.casing,
          "line-width": config.style.casingWidth as never,
          "line-opacity": opacity,
        },
      }, before);
    }
    if (!map.getLayer(LINE_LAYER)) {
      map.addLayer({
        id: LINE_LAYER,
        type: "line",
        source: SOURCE_ID,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": theme.color ?? config.style.color,
          ...(config.style.dash ? { "line-dasharray": config.style.dash } : {}),
          "line-width": config.style.width as never,
          "line-opacity": opacity,
        },
      }, before);
    }
    if (!map.getLayer(HIT_LAYER)) {
      map.addLayer({
        id: HIT_LAYER,
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": "#000000",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 12, 8, 14, 14],
          "line-opacity": 0,
        },
      }, before);
    }
    if (!map.getLayer(BADGE_LAYER)) {
      map.addLayer({
        id: BADGE_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        minzoom: config.badgeMinZoom,
        layout: {
          "symbol-placement": "line",
          "symbol-spacing": 360,
          "icon-image": ["get", "badgeImage"],
          "icon-rotation-alignment": "viewport",
          "icon-allow-overlap": false,
          "icon-padding": 4,
        },
        paint: { "icon-opacity": opacity },
      }, config.badgeBefore(map));
    }
  }

  /**
   * Adds the stops once their file has loaded. Stops another layer already
   * labels (`skipStopCodes`, shared poles) are left to it.
   */
  function installStopLayers(
    map: MapLibreMap,
    stops: { features: BusStopLike[] },
    options: { activeFilteredLine: string | null; selectedStopCodes?: readonly string[]; skipStopCodes?: ReadonlySet<string> },
  ): void {
    if (!map.getLayer(LINE_LAYER)) return;
    const skip = options.skipStopCodes;
    setSourceData(map, STOP_SOURCE_ID, stopCollection(
      skip ? stops.features.filter((feature) => !skip.has(feature.properties.stopCode)) : stops.features,
    ));
    registerStopPillImages(map);
    const unselected = unselectedStopFilter(options.selectedStopCodes ?? []);
    const opacity = dimmed(options.activeFilteredLine);
    const before = config.stopBefore(map);
    if (!map.getLayer(STOP_DOT_LAYER)) {
      map.addLayer({
        id: STOP_DOT_LAYER,
        type: "circle",
        source: STOP_SOURCE_ID,
        minzoom: config.stopMinZoom,
        ...(unselected ? { filter: unselected as never } : {}),
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 2.2, 19, 3.6],
          "circle-color": "#374151",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.25,
          "circle-opacity": opacity,
          "circle-stroke-opacity": opacity,
        },
      }, before);
    }
    if (!map.getLayer(STOP_LAYER)) {
      map.addLayer({
        id: STOP_LAYER,
        type: "symbol",
        source: STOP_SOURCE_ID,
        minzoom: config.stopLabelMinZoom ?? config.stopMinZoom,
        ...(unselected ? { filter: unselected as never } : {}),
        layout: {
          "text-field": ["get", "stopCode"],
          "text-font": [MAP_LABEL_FONT_BOLD],
          "text-size": STOP_NUMBER_SIZE as never,
          "text-anchor": "bottom",
          "text-offset": [0, -0.75],
          "icon-anchor": "bottom",
          "icon-image": STOP_PILL_IMAGE,
          "icon-text-fit": "both",
          "icon-text-fit-padding": [0.5, 2.5, 0.5, 2.5],
          // Under other stops and station names: a label that would overlap
          // one of them waits for a deeper zoom.
          "icon-allow-overlap": false,
          "text-allow-overlap": false,
          "icon-padding": 2,
        },
        paint: {
          "text-color": "#0f172a",
          "text-opacity": opacity,
          "icon-opacity": opacity,
        },
      }, before);
    }
  }

  /** Removes every layer and source (the toggle turned off), a selection's too. */
  function removeLayers(map: MapLibreMap): void {
    removeSurfaceSelectionLayers(map, config.idPrefix);
    for (const layer of [...STOP_LAYERS, ...LINE_LAYERS]) {
      if (map.getLayer(layer)) map.removeLayer(layer);
    }
    for (const source of [STOP_SOURCE_ID, SOURCE_ID]) {
      if (map.getSource(source)) map.removeSource(source);
    }
  }

  /** Removes the stops only, so they can be redrawn (shared poles change hands). */
  function removeStopLayers(map: MapLibreMap): void {
    for (const layer of [...surfaceSelectionStopLayers(config.idPrefix), ...STOP_LAYERS]) {
      if (map.getLayer(layer)) map.removeLayer(layer);
    }
    if (map.getSource(STOP_SOURCE_ID)) map.removeSource(STOP_SOURCE_ID);
  }

  /**
   * With the switch off, a selection (plan 14, U4) still draws: the sources
   * hold only the selected route's corridors and the selected stops.
   */
  function installSelectionSources(
    map: MapLibreMap,
    data: { corridors: readonly BusCorridorLike[]; stops: readonly BusStopLike[] },
  ): void {
    setSourceData(map, SOURCE_ID, corridorCollection(data.corridors));
    setSourceData(map, STOP_SOURCE_ID, stopCollection(data.stops));
  }

  /** Where the selection draws: its outline under this layer's casing, its stops over every label. */
  const selectionTarget: SurfaceSelectionTarget = {
    prefix: config.idPrefix,
    corridorSource: SOURCE_ID,
    stopSource: STOP_SOURCE_ID,
    style: config.style,
    badge: { imageId: config.badgeImageId, spacing: 360 },
    lineBefore: (map) => (map.getLayer(CASING_LAYER) ? CASING_LAYER : config.lineBefore(map)),
    stopBefore: (map) => (config.selectedStopBefore ?? config.stopBefore)(map),
  };

  const hasLayers = (map: MapLibreMap) => LINE_LAYERS.every((layer) => Boolean(map.getLayer(layer)));
  const hasStopLayers = (map: MapLibreMap) => STOP_LAYERS.every((layer) => Boolean(map.getLayer(layer)));

  /**
   * Leaves the selected stops (every layer's, so a shared pole never shows
   * twice) to the selection layer, which draws them in the selected style.
   */
  function updateStopSelection(map: MapLibreMap, selectedStopCodes: readonly string[]): void {
    const filter = unselectedStopFilter(selectedStopCodes);
    for (const layer of STOP_LAYERS) {
      if (map.getLayer(layer)) map.setFilter(layer, filter as never);
    }
  }

  /** The stop number under a press on a label or dot (a selected one first), if any. */
  function stopCodeAtPoint(map: MapLibreMap, point: { x: number; y: number }): string | null {
    const layers = [...surfaceSelectionStopLayers(config.idPrefix), ...STOP_LAYERS].filter((layer) => map.getLayer(layer));
    if (layers.length === 0) return null;
    const features = map.queryRenderedFeatures(
      [[point.x - 4, point.y - 4], [point.x + 4, point.y + 4]],
      { layers },
    );
    const code = features[0]?.properties?.stopCode;
    return typeof code === "string" && code ? code : null;
  }

  /** Buses dim with the other lines while a rail line is filtered. */
  function updateFilter(map: MapLibreMap, activeFilteredLine: string | null): void {
    const opacity = dimmed(activeFilteredLine);
    for (const layer of [CASING_LAYER, LINE_LAYER]) {
      if (map.getLayer(layer)) setTransitPaintProperty(map, layer, "line-opacity", opacity);
    }
    if (map.getLayer(BADGE_LAYER)) setTransitPaintProperty(map, BADGE_LAYER, "icon-opacity", opacity);
    if (map.getLayer(STOP_DOT_LAYER)) {
      setTransitPaintProperty(map, STOP_DOT_LAYER, "circle-opacity", opacity);
      setTransitPaintProperty(map, STOP_DOT_LAYER, "circle-stroke-opacity", opacity);
    }
    if (map.getLayer(STOP_LAYER)) {
      setTransitPaintProperty(map, STOP_LAYER, "icon-opacity", opacity);
      setTransitPaintProperty(map, STOP_LAYER, "text-opacity", opacity);
    }
  }

  return {
    layers: {
      casing: CASING_LAYER,
      line: LINE_LAYER,
      hit: HIT_LAYER,
      badges: BADGE_LAYER,
      stopDots: STOP_DOT_LAYER,
      stops: STOP_LAYER,
    },
    addMissingBadgeImage,
    installLayers,
    installSelectionSources,
    selectionTarget,
    installStopLayers,
    removeLayers,
    removeStopLayers,
    hasLayers,
    hasStopLayers,
    updateStopSelection,
    stopCodeAtPoint,
    updateFilter,
  };
}

/** Live buses (S8); named here to keep this module free of the vehicle layer's imports. */
const BUS_VEHICLE_HALO_LAYER = "transit-bus-vehicles-halo";

/**
 * Selected TTC stops (plan 14, U4): over every stop label and badge, under
 * live vehicles and station markers.
 */
export function ttcSelectedStopBefore(map: MapLibreMap): string | undefined {
  for (const layer of [BUS_VEHICLE_HALO_LAYER, STREETCAR_VEHICLE_HALO_LAYER, STATION_BEFORE]) {
    if (map.getLayer(layer)) return layer;
  }
  return undefined;
}

/** Under the streetcar layer's symbols, else under live buses or cars, else under stations. */
function underStreetcarSymbol(map: MapLibreMap, streetcarLayer: string): string | undefined {
  if (map.getLayer(streetcarLayer)) return streetcarLayer;
  if (map.getLayer(BUS_VEHICLE_HALO_LAYER)) return BUS_VEHICLE_HALO_LAYER;
  if (map.getLayer(STREETCAR_VEHICLE_HALO_LAYER)) return STREETCAR_VEHICLE_HALO_LAYER;
  return map.getLayer(STATION_BEFORE) ? STATION_BEFORE : undefined;
}

/**
 * The TTC bus line's paint (owner, 2026-11-03): TTC red, dashed, and thinner
 * than the streetcars (2.6 px at zoom 14) and the subway (5 px), so a bus
 * street keeps the TTC's route colour but never reads as a streetcar line.
 * Constant: never data-driven.
 */
export const BUS_LINE_STYLE = {
  color: "#ED1C24",
  dash: [2.2, 1.4],
  light: { casing: "#ffffff" },
  dark: { casing: "#000000" },
  width: ["interpolate", ["linear"], ["zoom"], 9, 0.6, 12, 0.9, 14, 1.6, 17, 3.2] as unknown[],
  casingWidth: ["interpolate", ["linear"], ["zoom"], 9, 1.4, 12, 1.9, 14, 2.8, 17, 5] as unknown[],
};

const ttcBusKit = createBusLayerKit({
  idPrefix: "transit-bus",
  style: BUS_LINE_STYLE,
  badgeMinZoom: BUS_BADGE_MIN_ZOOM,
  stopMinZoom: BUS_STOP_MIN_ZOOM,
  stopLabelMinZoom: BUS_STOP_LABEL_MIN_ZOOM,
  badgeMaxRoutes: BUS_BADGE_MAX_ROUTES,
  badgeImageId: busBadgeImageId,
  badgeRoutes: busBadgeRoutes,
  // Route family colours (red, Express green, Community grey).
  badgeColors: ttcRouteBadgeColors,
  lineBefore: (map) => {
    if (map.getLayer(STREETCAR_CASING_LAYER)) return STREETCAR_CASING_LAYER;
    return map.getLayer(RAIL_LINE_BEFORE) ? RAIL_LINE_BEFORE : undefined;
  },
  badgeBefore: (map) => underStreetcarSymbol(map, STREETCAR_BADGE_LAYER),
  stopBefore: (map) => underStreetcarSymbol(map, STREETCAR_STOP_DOT_LAYER),
  selectedStopBefore: ttcSelectedStopBefore,
});

export const BUS_CASING_LAYER = ttcBusKit.layers.casing;
export const BUS_LINE_LAYER = ttcBusKit.layers.line;
/** Wider, invisible copy of the line that takes presses. */
export const BUS_HIT_LAYER = ttcBusKit.layers.hit;
export const BUS_BADGE_LAYER = ttcBusKit.layers.badges;
/** The stop's published position. */
export const BUS_STOP_DOT_LAYER = ttcBusKit.layers.stopDots;
/** Stop numbers above the dot, as streetcar stops; a press opens departures. */
export const BUS_STOP_LAYER = ttcBusKit.layers.stops;

/** Draws a TTC bus badge row on `styleimagemissing` (about 700 route sets). */
export const addMissingBusBadgeImage = ttcBusKit.addMissingBadgeImage;
export function installBusLayers(
  map: MapLibreMap,
  catalog: BusCatalog,
  options: { dark: boolean; activeFilteredLine: string | null },
): void {
  ttcBusKit.installLayers(map, catalog, options);
}
/** Stops the streetcar layer already draws (shared poles) are left to it, so one pole shows one label. */
export function installBusStopLayers(
  map: MapLibreMap,
  stops: BusStopCatalog,
  options: { activeFilteredLine: string | null; selectedStopCodes?: readonly string[]; streetcarStopCodes: ReadonlySet<string> },
): void {
  ttcBusKit.installStopLayers(map, stops, { ...options, skipStopCodes: options.streetcarStopCodes });
}
export const removeBusLayers = ttcBusKit.removeLayers;
export const removeBusStopLayers = ttcBusKit.removeStopLayers;
export const hasBusLayers = ttcBusKit.hasLayers;
export const hasBusStopLayers = ttcBusKit.hasStopLayers;
export const updateBusStopSelection = ttcBusKit.updateStopSelection;
/** Where a selected bus route or stop draws (plan 14, U4). */
export const BUS_SELECTION_TARGET = ttcBusKit.selectionTarget;
export const installBusSelectionSources = ttcBusKit.installSelectionSources;
export const busStopCodeAtPoint = ttcBusKit.stopCodeAtPoint;
export const updateBusFilter = ttcBusKit.updateFilter;

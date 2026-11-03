/**
 * Live bus markers on the TTC Map View (plan 13, S8): real GPS reports in the
 * live streetcar glyph's paint (outline, core stroke, dark window, heading
 * arrow), as a short one-section bus body about two thirds of a streetcar's
 * length, in the route family's colour (regular red, night blue, community
 * grey, express green). Stale buses are pale and faded. Drawn from
 * `BUS_VEHICLE_MIN_ZOOM`, under live streetcars and station markers.
 *
 * Layer ids start with `transit-`, so a network switch removes them with the
 * other transit layers and the network fade covers them.
 */

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import {
  BUS_VEHICLE_LABEL_MIN_ZOOM,
  BUS_VEHICLE_MIN_ZOOM,
  type BusVehicleFamily,
  type BusVehicleFeatureProperties,
} from "../app/bus-positions.ts";
import { setTransitPaintProperty } from "./geographic-network-transition.ts";
import { glyphPaint, STREETCAR_VEHICLE_HALO_LAYER, type GlyphPaint } from "./geographic-streetcar-vehicles.ts";
import {
  TTC_COMMUNITY_ROUTE_GREY,
  TTC_DAY_ROUTE_RED,
  TTC_EXPRESS_ROUTE_GREEN,
  TTC_NIGHT_ROUTE_BLUE,
} from "../app/ttc-route-badge.ts";

export const BUS_VEHICLE_SOURCE = "transit-bus-vehicles";
export const BUS_VEHICLE_HALO_LAYER = "transit-bus-vehicles-halo";
export const BUS_VEHICLE_LAYER = "transit-bus-vehicles";
export const BUS_VEHICLE_LABEL_LAYER = "transit-bus-vehicles-label";
const VEHICLE_LAYERS = [BUS_VEHICLE_HALO_LAYER, BUS_VEHICLE_LAYER, BUS_VEHICLE_LABEL_LAYER];
const STATIONS_LAYER = "transit-stations-outer";

const PIXEL_RATIO = 2;
const IMAGE_PREFIX = "bus-vehicle:";
/** CSS px per glyph unit at icon-size 1: the streetcar glyph's scale (62 units = 40 px). */
const UNITS_TO_PX = 40 / 62;

const FAMILY_COLORS: Record<BusVehicleFamily, string> = {
  regular: TTC_DAY_ROUTE_RED,
  night: TTC_NIGHT_ROUTE_BLUE,
  community: TTC_COMMUNITY_ROUTE_GREY,
  express: TTC_EXPRESS_ROUTE_GREEN,
};
const FAMILIES = Object.keys(FAMILY_COLORS) as BusVehicleFamily[];

export function busVehicleImageId(state: "live" | "stale", heading: boolean, family: BusVehicleFamily): string {
  return `${IMAGE_PREFIX}${state}${heading ? "" : "-plain"}-${family}`;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Glyph geometry, pointing east, in streetcar glyph units: a body 42 long
 * (x -20..22) and 22 wide with a rounded nose, one window at the rear, and the
 * heading arrow at the front.
 */
export const BUS_GLYPH_BODY_PATH =
  "M -16 -11 H 14 Q 22 -11 22 -3 V 3 Q 22 11 14 11 H -16 Q -20 11 -20 7 V -7 Q -20 -11 -16 -11 Z";
export const BUS_GLYPH_WINDOW = { x: -15, y: -5, width: 10, height: 10 } as const;
export const BUS_GLYPH_ARROW_PATH = "M 4 -7 L 17 0 L 4 7 Z";
const GLYPH_HALF_WIDTH = 28;
const GLYPH_HALF_HEIGHT = 18;

function drawBus(state: "live" | "stale", heading: boolean, color: string, paint: GlyphPaint): ImageData | null {
  if (typeof document === "undefined" || typeof Path2D === "undefined") return null;
  const unitsToDevice = UNITS_TO_PX * PIXEL_RATIO;
  const width = Math.ceil(2 * GLYPH_HALF_WIDTH * unitsToDevice);
  const height = Math.ceil(2 * GLYPH_HALF_HEIGHT * unitsToDevice);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.translate(width / 2, height / 2);
  ctx.scale(unitsToDevice, unitsToDevice);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const body = new Path2D(BUS_GLYPH_BODY_PATH);
  // A stale bus keeps its shape but loses its route colour.
  const fill = state === "live" ? color : "#cbd5e1";
  if (paint.shadow) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowOffsetY = 2 * unitsToDevice;
    ctx.shadowBlur = 4 * unitsToDevice;
    ctx.fillStyle = paint.outlineStroke;
    ctx.fill(body);
    ctx.restore();
  }
  ctx.strokeStyle = paint.outlineStroke;
  ctx.lineWidth = paint.outlineWidth;
  ctx.stroke(body);
  ctx.fillStyle = fill;
  ctx.fill(body);
  ctx.strokeStyle = paint.coreStroke;
  ctx.lineWidth = paint.coreWidth;
  ctx.stroke(body);
  ctx.fillStyle = paint.windowFill;
  ctx.beginPath();
  ctx.roundRect(BUS_GLYPH_WINDOW.x, BUS_GLYPH_WINDOW.y, BUS_GLYPH_WINDOW.width, BUS_GLYPH_WINDOW.height, 1.5);
  ctx.fill();
  if (heading) {
    ctx.fillStyle = paint.arrowFill;
    ctx.fill(new Path2D(BUS_GLYPH_ARROW_PATH));
  }
  return ctx.getImageData(0, 0, width, height);
}

function registerBusImages(map: MapLibreMap, dark: boolean) {
  const paint = glyphPaint(map, dark);
  for (const state of ["live", "stale"] as const) {
    for (const heading of [true, false]) {
      for (const family of FAMILIES) {
        const id = busVehicleImageId(state, heading, family);
        try {
          // Paint follows the theme, so a style change redraws it.
          if (map.hasImage(id)) map.removeImage(id);
          const image = drawBus(state, heading, FAMILY_COLORS[family], paint);
          if (image) map.addImage(id, image, { pixelRatio: PIXEL_RATIO });
        } catch {
          // Without the image the bus is not drawn; the rest of the map is unaffected.
        }
      }
    }
  }
}

function vehicleOpacity(activeFilteredLine: string | null): unknown {
  const base = ["case", ["==", ["get", "state"], "stale"], 0.6, 1];
  return activeFilteredLine ? ["*", 0.25, base] : base;
}

function labelOpacity(activeFilteredLine: string | null): number {
  return activeFilteredLine ? 0.25 : 1;
}

/** Under live streetcars when they are installed, else under the station markers. */
function beforeLayer(map: MapLibreMap): string | undefined {
  if (map.getLayer(STREETCAR_VEHICLE_HALO_LAYER)) return STREETCAR_VEHICLE_HALO_LAYER;
  return map.getLayer(STATIONS_LAYER) ? STATIONS_LAYER : undefined;
}

/** Adds the bus source, images and layers (again after a style change). Idempotent. */
export function installBusVehicleLayers(
  map: MapLibreMap,
  options: { dark: boolean; activeFilteredLine: string | null; data?: GeoJSON.FeatureCollection },
): void {
  const source = map.getSource(BUS_VEHICLE_SOURCE) as GeoJSONSource | undefined;
  if (source) {
    if (options.data) source.setData(options.data);
  } else {
    map.addSource(BUS_VEHICLE_SOURCE, { type: "geojson", data: options.data ?? EMPTY });
  }
  registerBusImages(map, options.dark);
  const before = beforeLayer(map);

  if (!map.getLayer(BUS_VEHICLE_HALO_LAYER)) {
    map.addLayer({
      id: BUS_VEHICLE_HALO_LAYER,
      type: "circle",
      source: BUS_VEHICLE_SOURCE,
      minzoom: BUS_VEHICLE_MIN_ZOOM,
      filter: ["==", ["get", "selected"], true],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 11, 16, 17],
        "circle-color": "rgba(0, 0, 0, 0)",
        "circle-stroke-width": 3,
        "circle-stroke-color": "#38bdf8",
      },
    }, before);
  }
  if (!map.getLayer(BUS_VEHICLE_LAYER)) {
    map.addLayer({
      id: BUS_VEHICLE_LAYER,
      type: "symbol",
      source: BUS_VEHICLE_SOURCE,
      minzoom: BUS_VEHICLE_MIN_ZOOM,
      layout: {
        "icon-image": [
          "concat", IMAGE_PREFIX, ["get", "state"], ["case", [">=", ["get", "bearing"], 0], "", "-plain"],
          "-", ["get", "family"],
        ],
        // Body 17 px at zoom 13 (a streetcar is 26 there), 27 from 16.
        "icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.65, 16, 1],
        // The glyph points east; bearing is clockwise from north.
        "icon-rotate": ["case", [">=", ["get", "bearing"], 0], ["-", ["get", "bearing"], 90], 0],
        "icon-rotation-alignment": "map",
        "icon-pitch-alignment": "map",
        "icon-allow-overlap": true,
        // Buses never push stop labels, badges or names out of placement.
        "icon-ignore-placement": true,
        "symbol-sort-key": ["case", ["get", "selected"], 2, ["==", ["get", "state"], "live"], 1, 0],
      },
      paint: {
        "icon-opacity": vehicleOpacity(options.activeFilteredLine) as never,
      },
    }, before);
  }
  if (!map.getLayer(BUS_VEHICLE_LABEL_LAYER)) {
    map.addLayer({
      id: BUS_VEHICLE_LABEL_LAYER,
      type: "symbol",
      source: BUS_VEHICLE_SOURCE,
      minzoom: BUS_VEHICLE_LABEL_MIN_ZOOM,
      layout: {
        "text-field": ["get", "route"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 10,
        "text-variable-anchor": ["left", "right"],
        "text-radial-offset": 1.4,
        "text-optional": true,
      },
      paint: {
        "text-color": options.dark ? "#f8fafc" : "#0f172a",
        "text-halo-color": options.dark ? "rgba(15, 23, 42, 0.9)" : "rgba(255, 255, 255, 0.9)",
        "text-halo-width": 1.5,
        "text-opacity": labelOpacity(options.activeFilteredLine),
      },
    }, before);
  }
}

export function setBusVehicleData(map: MapLibreMap, data: GeoJSON.FeatureCollection): void {
  const source = map.getSource(BUS_VEHICLE_SOURCE) as GeoJSONSource | undefined;
  source?.setData(data);
}

/** Buses dim with the other surface layers while a subway line is filtered. */
export function updateBusVehicleFilter(map: MapLibreMap, activeFilteredLine: string | null): void {
  if (map.getLayer(BUS_VEHICLE_LAYER)) {
    setTransitPaintProperty(map, BUS_VEHICLE_LAYER, "icon-opacity", vehicleOpacity(activeFilteredLine) as never);
  }
  if (map.getLayer(BUS_VEHICLE_LABEL_LAYER)) {
    setTransitPaintProperty(map, BUS_VEHICLE_LABEL_LAYER, "text-opacity", labelOpacity(activeFilteredLine));
  }
}

/** The bus under a press, if any (a little forgiving: buses are small and move). */
export function busVehicleKeyAtPoint(map: MapLibreMap, point: { x: number; y: number }): string | null {
  if (!map.getLayer(BUS_VEHICLE_LAYER)) return null;
  const features = map.queryRenderedFeatures(
    [[point.x - 8, point.y - 8], [point.x + 8, point.y + 8]],
    { layers: [BUS_VEHICLE_LAYER] },
  );
  let best: { key: string; distance: number } | null = null;
  for (const feature of features) {
    const key = (feature.properties as Partial<BusVehicleFeatureProperties> | null)?.key;
    if (typeof key !== "string" || feature.geometry.type !== "Point") continue;
    const projected = map.project(feature.geometry.coordinates as [number, number]);
    const distance = Math.hypot(projected.x - point.x, projected.y - point.y);
    if (!best || distance < best.distance) best = { key, distance };
  }
  return best?.key ?? null;
}

export function hasBusVehicleLayers(map: MapLibreMap): boolean {
  return VEHICLE_LAYERS.every((layer) => Boolean(map.getLayer(layer)));
}

/** Buses or live vehicles off: the layers and source go, so nothing is drawn or kept. */
export function removeBusVehicleLayers(map: MapLibreMap): void {
  for (const layer of [...VEHICLE_LAYERS].reverse()) {
    if (map.getLayer(layer)) map.removeLayer(layer);
  }
  if (map.getSource(BUS_VEHICLE_SOURCE)) map.removeSource(BUS_VEHICLE_SOURCE);
}

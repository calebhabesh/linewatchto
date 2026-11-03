/**
 * Live streetcar markers on the TTC Map View (plan 13, S4): real GPS reports,
 * drawn in the estimated train glyph's style (its outline, core stroke, dark
 * windows and nose arrow, read from train-markers.css) as a shorter, blunt,
 * three-section streetcar body pointing along the reported heading. Stale cars
 * are pale and faded. Above the streetcar lines and stop labels, under station
 * markers and names.
 *
 * Layer ids start with `transit-`, so a network switch removes them with the
 * other transit layers and the network fade covers them.
 */

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { StreetcarVehicleFeatureProperties } from "../app/streetcar-positions.ts";
import { setTransitPaintProperty } from "./geographic-network-transition.ts";
import { readTrainMarkerPaint } from "./train-marker-art.ts";
import { TTC_NIGHT_ROUTE_BLUE } from "../app/ttc-route-badge.ts";

export const STREETCAR_VEHICLE_SOURCE = "transit-streetcar-vehicles";
export const STREETCAR_VEHICLE_HALO_LAYER = "transit-streetcar-vehicles-halo";
export const STREETCAR_VEHICLE_LAYER = "transit-streetcar-vehicles";
export const STREETCAR_VEHICLE_LABEL_LAYER = "transit-streetcar-vehicles-label";
const VEHICLE_LAYERS = [STREETCAR_VEHICLE_HALO_LAYER, STREETCAR_VEHICLE_LAYER, STREETCAR_VEHICLE_LABEL_LAYER];

/** The TTC default view is 11.2, so cars show from the first city view. */
export const STREETCAR_VEHICLE_MIN_ZOOM = 11;
export const STREETCAR_VEHICLE_LABEL_MIN_ZOOM = 14;
const BEFORE = "transit-stations-outer";

const PIXEL_RATIO = 2;
const IMAGE_PREFIX = "streetcar-vehicle:";
/** Body length (CSS px) the glyph is drawn at; icon-size scales it by zoom. */
const GLYPH_BODY_PX = 40;

export function streetcarVehicleImageId(state: "live" | "stale", heading: boolean, night = false): string {
  return `${IMAGE_PREFIX}${state}${heading ? "" : "-plain"}${night ? "-night" : ""}`;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Glyph geometry, pointing east, in units where the body is 62 long (x -30..32)
 * and 22 wide: a blunt nose, two articulation seams, a window per section,
 * and the train glyph's nose arrow.
 */
export const STREETCAR_GLYPH_BODY_PATH =
  "M -26 -11 H 20 Q 31 -11 32 0 Q 31 11 20 11 H -26 Q -30 11 -30 7 V -7 Q -30 -11 -26 -11 Z";
export const STREETCAR_GLYPH_SEAMS = [-11, 6] as const;
export const STREETCAR_GLYPH_WINDOWS = [
  { x: -25, y: -5, width: 9, height: 10 },
  { x: -7, y: -5, width: 9, height: 10 },
] as const;
export const STREETCAR_GLYPH_ARROW_PATH = "M 13 -7 L 26 0 L 13 7 Z";
const GLYPH_LENGTH_UNITS = 62;
const GLYPH_HALF_WIDTH = 38;
const GLYPH_HALF_HEIGHT = 18;

export type GlyphPaint = {
  outlineStroke: string;
  outlineWidth: number;
  coreStroke: string;
  coreWidth: number;
  windowFill: string;
  arrowFill: string;
  shadow: boolean;
};

/** The estimated train glyph's paint, read from train-markers.css (shared with live buses, S8). */
export function glyphPaint(map: MapLibreMap, dark: boolean): GlyphPaint {
  const host = typeof map.getContainer === "function" ? map.getContainer() : null;
  const art = host ? readTrainMarkerPaint(host, []) : null;
  if (art) {
    return {
      outlineStroke: art.paint.outlineStroke,
      outlineWidth: art.paint.outlineWidth,
      coreStroke: art.paint.coreStroke,
      coreWidth: art.paint.coreWidth,
      windowFill: art.paint.windowFill,
      arrowFill: art.paint.arrowFill,
      shadow: art.paint.shadow,
    };
  }
  return {
    outlineStroke: dark ? "#090d16" : "#ffffff",
    outlineWidth: 5.5,
    coreStroke: dark ? "#ffffff" : "#090d16",
    coreWidth: 2.2,
    windowFill: "#090d16",
    arrowFill: "#090d16",
    shadow: true,
  };
}

function drawVehicle(
  state: "live" | "stale",
  heading: boolean,
  color: string,
  paint: GlyphPaint,
): ImageData | null {
  if (typeof document === "undefined" || typeof Path2D === "undefined") return null;
  const unitsToDevice = (GLYPH_BODY_PX / GLYPH_LENGTH_UNITS) * PIXEL_RATIO;
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
  const body = new Path2D(STREETCAR_GLYPH_BODY_PATH);
  // A stale car keeps its shape but loses its route colour.
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
  ctx.save();
  ctx.clip(body);
  ctx.strokeStyle = paint.windowFill;
  ctx.lineWidth = 1.6;
  for (const x of STREETCAR_GLYPH_SEAMS) {
    ctx.beginPath();
    ctx.moveTo(x, -11);
    ctx.lineTo(x, 11);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = paint.coreStroke;
  ctx.lineWidth = paint.coreWidth;
  ctx.stroke(body);
  ctx.fillStyle = paint.windowFill;
  for (const pane of STREETCAR_GLYPH_WINDOWS) {
    ctx.beginPath();
    ctx.roundRect(pane.x, pane.y, pane.width, pane.height, 1.5);
    ctx.fill();
  }
  if (heading) {
    ctx.fillStyle = paint.arrowFill;
    ctx.fill(new Path2D(STREETCAR_GLYPH_ARROW_PATH));
  }
  return ctx.getImageData(0, 0, width, height);
}

function registerVehicleImages(map: MapLibreMap, color: string, dark: boolean) {
  const paint = glyphPaint(map, dark);
  for (const state of ["live", "stale"] as const) {
    for (const heading of [true, false]) {
      for (const night of [false, true]) {
        const id = streetcarVehicleImageId(state, heading, night);
        try {
          // Paint follows the theme, so a style change redraws it.
          if (map.hasImage(id)) map.removeImage(id);
          const image = drawVehicle(state, heading, night ? TTC_NIGHT_ROUTE_BLUE : color, paint);
          if (image) map.addImage(id, image, { pixelRatio: PIXEL_RATIO });
        } catch {
          // Without the image the car is not drawn; the rest of the map is unaffected.
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

/** Adds the car source, images and layers (again after a style change). Idempotent. */
export function installStreetcarVehicleLayers(
  map: MapLibreMap,
  options: {
    dark: boolean;
    activeFilteredLine: string | null;
    color?: string;
    data?: GeoJSON.FeatureCollection;
  },
): void {
  const source = map.getSource(STREETCAR_VEHICLE_SOURCE) as GeoJSONSource | undefined;
  if (source) {
    if (options.data) source.setData(options.data);
  } else {
    map.addSource(STREETCAR_VEHICLE_SOURCE, { type: "geojson", data: options.data ?? EMPTY });
  }
  registerVehicleImages(map, options.color ?? "#ED1C24", options.dark);
  const before = map.getLayer(BEFORE) ? BEFORE : undefined;

  if (!map.getLayer(STREETCAR_VEHICLE_HALO_LAYER)) {
    map.addLayer({
      id: STREETCAR_VEHICLE_HALO_LAYER,
      type: "circle",
      source: STREETCAR_VEHICLE_SOURCE,
      minzoom: STREETCAR_VEHICLE_MIN_ZOOM,
      filter: ["==", ["get", "selected"], true],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 9, 13, 14, 16, 22],
        "circle-color": "rgba(0, 0, 0, 0)",
        "circle-stroke-width": 3,
        "circle-stroke-color": "#38bdf8",
      },
    }, before);
  }
  if (!map.getLayer(STREETCAR_VEHICLE_LAYER)) {
    map.addLayer({
      id: STREETCAR_VEHICLE_LAYER,
      type: "symbol",
      source: STREETCAR_VEHICLE_SOURCE,
      minzoom: STREETCAR_VEHICLE_MIN_ZOOM,
      layout: {
        "icon-image": [
          "concat", IMAGE_PREFIX, ["get", "state"], ["case", [">=", ["get", "bearing"], 0], "", "-plain"],
          ["case", ["==", ["get", "night"], true], "-night", ""],
        ],
        // Body 18 px at zoom 11, 26 at 13 (the subway glyph is 26 there), 40 from 16.
        "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.45, 13, 0.65, 16, 1],
        // The glyph points east; bearing is clockwise from north.
        "icon-rotate": ["case", [">=", ["get", "bearing"], 0], ["-", ["get", "bearing"], 90], 0],
        "icon-rotation-alignment": "map",
        "icon-pitch-alignment": "map",
        "icon-allow-overlap": true,
        // Cars never push stop pills, badges or names out of placement.
        "icon-ignore-placement": true,
        // Live cars over stale ones; the selected car on top.
        "symbol-sort-key": ["case", ["get", "selected"], 2, ["==", ["get", "state"], "live"], 1, 0],
      },
      paint: {
        "icon-opacity": vehicleOpacity(options.activeFilteredLine) as never,
      },
    }, before);
  }
  if (!map.getLayer(STREETCAR_VEHICLE_LABEL_LAYER)) {
    map.addLayer({
      id: STREETCAR_VEHICLE_LABEL_LAYER,
      type: "symbol",
      source: STREETCAR_VEHICLE_SOURCE,
      minzoom: STREETCAR_VEHICLE_LABEL_MIN_ZOOM,
      layout: {
        "text-field": ["get", "route"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 10,
        "text-variable-anchor": ["left", "right"],
        "text-radial-offset": 1.8,
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

export function setStreetcarVehicleData(map: MapLibreMap, data: GeoJSON.FeatureCollection): void {
  const source = map.getSource(STREETCAR_VEHICLE_SOURCE) as GeoJSONSource | undefined;
  source?.setData(data);
}

/** Cars dim with the streetcar lines while a subway line is filtered. */
export function updateStreetcarVehicleFilter(map: MapLibreMap, activeFilteredLine: string | null): void {
  if (map.getLayer(STREETCAR_VEHICLE_LAYER)) {
    setTransitPaintProperty(map, STREETCAR_VEHICLE_LAYER, "icon-opacity", vehicleOpacity(activeFilteredLine) as never);
  }
  if (map.getLayer(STREETCAR_VEHICLE_LABEL_LAYER)) {
    setTransitPaintProperty(map, STREETCAR_VEHICLE_LABEL_LAYER, "text-opacity", labelOpacity(activeFilteredLine));
  }
}

/** The car under a press, if any (a little forgiving: cars are small and move). */
export function streetcarVehicleKeyAtPoint(map: MapLibreMap, point: { x: number; y: number }): string | null {
  if (!map.getLayer(STREETCAR_VEHICLE_LAYER)) return null;
  const features = map.queryRenderedFeatures(
    [[point.x - 8, point.y - 8], [point.x + 8, point.y + 8]],
    { layers: [STREETCAR_VEHICLE_LAYER] },
  );
  if (features.length === 0) return null;
  // The car nearest the press.
  let best: { key: string; distance: number } | null = null;
  for (const feature of features) {
    const key = (feature.properties as Partial<StreetcarVehicleFeatureProperties> | null)?.key;
    if (typeof key !== "string" || feature.geometry.type !== "Point") continue;
    const projected = map.project(feature.geometry.coordinates as [number, number]);
    const distance = Math.hypot(projected.x - point.x, projected.y - point.y);
    if (!best || distance < best.distance) best = { key, distance };
  }
  return best?.key ?? null;
}

export function hasStreetcarVehicleLayers(map: MapLibreMap): boolean {
  return VEHICLE_LAYERS.every((layer) => Boolean(map.getLayer(layer)));
}

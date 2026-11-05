/**
 * Live GO bus markers on the GO/UP Map View (plan 13, S9): the S8 bus glyph
 * in GO green (the GO bus line colour; the lighter green on the dark map),
 * without a heading arrow (GO publishes none for buses). Stale buses are pale
 * and faded. Drawn from `GO_BUS_VEHICLE_MIN_ZOOM`, under the GO train markers
 * and station markers. Never coloured by service data.
 *
 * Layer ids start with `transit-`, so a network switch removes them with the
 * other transit layers and the network fade covers them.
 */

import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { GO_BUS_LINE_COLOR, GO_BUS_LINE_DARK_COLOR } from "../app/go-bus-catalog.ts";
import {
  GO_BUS_VEHICLE_LABEL_MIN_ZOOM,
  GO_BUS_VEHICLE_MIN_ZOOM,
  type GoBusVehicleFeatureProperties,
} from "../app/go-bus-positions.ts";
import { drawBusGlyph } from "./geographic-bus-vehicles.ts";
import { setTransitPaintProperty } from "./geographic-network-transition.ts";
import { glyphPaint } from "./geographic-streetcar-vehicles.ts";
import { MAP_LABEL_FONT_BOLD } from "../app/geographic-config.ts";

export const GO_BUS_VEHICLE_SOURCE = "transit-go-bus-vehicles";
export const GO_BUS_VEHICLE_HALO_LAYER = "transit-go-bus-vehicles-halo";
export const GO_BUS_VEHICLE_LAYER = "transit-go-bus-vehicles";
export const GO_BUS_VEHICLE_LABEL_LAYER = "transit-go-bus-vehicles-label";
const VEHICLE_LAYERS = [GO_BUS_VEHICLE_HALO_LAYER, GO_BUS_VEHICLE_LAYER, GO_BUS_VEHICLE_LABEL_LAYER];
const TRAIN_MARKERS_LAYER = "transit-train-markers-halo";
const STATIONS_LAYER = "transit-stations-outer";
const PIXEL_RATIO = 2;
const IMAGE_PREFIX = "go-bus-vehicle:";

export function goBusVehicleImageId(state: "live" | "stale"): string {
  return `${IMAGE_PREFIX}${state}`;
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function registerImages(map: MapLibreMap, dark: boolean) {
  const paint = glyphPaint(map, dark);
  const color = dark ? GO_BUS_LINE_DARK_COLOR : GO_BUS_LINE_COLOR;
  for (const state of ["live", "stale"] as const) {
    const id = goBusVehicleImageId(state);
    try {
      // Paint follows the theme, so a style change redraws it.
      if (map.hasImage(id)) map.removeImage(id);
      const image = drawBusGlyph(state, false, color, paint);
      if (image) map.addImage(id, image, { pixelRatio: PIXEL_RATIO });
    } catch {
      // Without the image the bus is not drawn; the rest of the map is unaffected.
    }
  }
}

function vehicleOpacity(activeFilteredLine: string | null): unknown {
  const base = ["case", ["==", ["get", "state"], "stale"], 0.6, 1];
  return activeFilteredLine ? ["*", 0.25, base] : base;
}

/** Under the train markers when they are installed, else under the station markers. */
function beforeLayer(map: MapLibreMap): string | undefined {
  if (map.getLayer(TRAIN_MARKERS_LAYER)) return TRAIN_MARKERS_LAYER;
  return map.getLayer(STATIONS_LAYER) ? STATIONS_LAYER : undefined;
}

/** Adds the GO bus source, images and layers (again after a style change). Idempotent. */
export function installGoBusVehicleLayers(
  map: MapLibreMap,
  options: { dark: boolean; activeFilteredLine: string | null; data?: GeoJSON.FeatureCollection },
): void {
  const source = map.getSource(GO_BUS_VEHICLE_SOURCE) as GeoJSONSource | undefined;
  if (source) {
    if (options.data) source.setData(options.data);
  } else {
    map.addSource(GO_BUS_VEHICLE_SOURCE, { type: "geojson", data: options.data ?? EMPTY });
  }
  registerImages(map, options.dark);
  const before = beforeLayer(map);

  if (!map.getLayer(GO_BUS_VEHICLE_HALO_LAYER)) {
    map.addLayer({
      id: GO_BUS_VEHICLE_HALO_LAYER,
      type: "circle",
      source: GO_BUS_VEHICLE_SOURCE,
      minzoom: GO_BUS_VEHICLE_MIN_ZOOM,
      filter: ["==", ["get", "selected"], true],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 9, 13, 11, 16, 17],
        "circle-color": "rgba(0, 0, 0, 0)",
        "circle-stroke-width": 3,
        "circle-stroke-color": "#38bdf8",
      },
    }, before);
  }
  if (!map.getLayer(GO_BUS_VEHICLE_LAYER)) {
    map.addLayer({
      id: GO_BUS_VEHICLE_LAYER,
      type: "symbol",
      source: GO_BUS_VEHICLE_SOURCE,
      minzoom: GO_BUS_VEHICLE_MIN_ZOOM,
      layout: {
        "icon-image": ["concat", IMAGE_PREFIX, ["get", "state"]],
        // No heading: drawn level, not turned with the map.
        "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 13, 0.65, 16, 1],
        "icon-rotation-alignment": "viewport",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "symbol-sort-key": ["case", ["get", "selected"], 2, ["==", ["get", "state"], "live"], 1, 0],
      },
      paint: {
        "icon-opacity": vehicleOpacity(options.activeFilteredLine) as never,
      },
    }, before);
  }
  if (!map.getLayer(GO_BUS_VEHICLE_LABEL_LAYER)) {
    map.addLayer({
      id: GO_BUS_VEHICLE_LABEL_LAYER,
      type: "symbol",
      source: GO_BUS_VEHICLE_SOURCE,
      minzoom: GO_BUS_VEHICLE_LABEL_MIN_ZOOM,
      layout: {
        "text-field": ["get", "route"],
        "text-font": [MAP_LABEL_FONT_BOLD],
        "text-size": 10,
        "text-variable-anchor": ["left", "right"],
        "text-radial-offset": 1.4,
        "text-optional": true,
      },
      paint: {
        "text-color": options.dark ? "#f8fafc" : "#0f172a",
        "text-halo-color": options.dark ? "rgba(15, 23, 42, 0.9)" : "rgba(255, 255, 255, 0.9)",
        "text-halo-width": 1.5,
        "text-opacity": options.activeFilteredLine ? 0.25 : 1,
      },
    }, before);
  }
}

export function setGoBusVehicleData(map: MapLibreMap, data: GeoJSON.FeatureCollection): void {
  (map.getSource(GO_BUS_VEHICLE_SOURCE) as GeoJSONSource | undefined)?.setData(data);
}

/** GO buses dim with the other layers while a line is filtered. */
export function updateGoBusVehicleFilter(map: MapLibreMap, activeFilteredLine: string | null): void {
  if (map.getLayer(GO_BUS_VEHICLE_LAYER)) {
    setTransitPaintProperty(map, GO_BUS_VEHICLE_LAYER, "icon-opacity", vehicleOpacity(activeFilteredLine) as never);
  }
  if (map.getLayer(GO_BUS_VEHICLE_LABEL_LAYER)) {
    setTransitPaintProperty(map, GO_BUS_VEHICLE_LABEL_LAYER, "text-opacity", activeFilteredLine ? 0.25 : 1);
  }
}

/** The GO bus under a press, if any (a little forgiving: buses are small and move). */
export function goBusVehicleKeyAtPoint(map: MapLibreMap, point: { x: number; y: number }): string | null {
  if (!map.getLayer(GO_BUS_VEHICLE_LAYER)) return null;
  const features = map.queryRenderedFeatures(
    [[point.x - 8, point.y - 8], [point.x + 8, point.y + 8]],
    { layers: [GO_BUS_VEHICLE_LAYER] },
  );
  let best: { key: string; distance: number } | null = null;
  for (const feature of features) {
    const key = (feature.properties as Partial<GoBusVehicleFeatureProperties> | null)?.key;
    if (typeof key !== "string" || feature.geometry.type !== "Point") continue;
    const projected = map.project(feature.geometry.coordinates as [number, number]);
    const distance = Math.hypot(projected.x - point.x, projected.y - point.y);
    if (!best || distance < best.distance) best = { key, distance };
  }
  return best?.key ?? null;
}

export function hasGoBusVehicleLayers(map: MapLibreMap): boolean {
  return VEHICLE_LAYERS.every((layer) => Boolean(map.getLayer(layer)));
}

/** GO buses or Live GPS off: the layers and source go, so nothing is drawn or kept. */
export function removeGoBusVehicleLayers(map: MapLibreMap): void {
  for (const layer of [...VEHICLE_LAYERS].reverse()) {
    if (map.getLayer(layer)) map.removeLayer(layer);
  }
  if (map.getSource(GO_BUS_VEHICLE_SOURCE)) map.removeSource(GO_BUS_VEHICLE_SOURCE);
}

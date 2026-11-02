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
  isStreetcarCorridorFeature,
  streetcarBadgeImageId,
  streetcarRouteSets,
  type StreetcarCatalog,
} from "../app/geographic-surface-catalog.ts";
import { setTransitPaintProperty } from "./geographic-network-transition.ts";

const SOURCE_ID = "transit-streetcar-corridors";
export const STREETCAR_CASING_LAYER = "transit-streetcar-casing";
export const STREETCAR_LINE_LAYER = "transit-streetcar-line";
/** Wider, invisible copy of the line that takes presses. */
export const STREETCAR_HIT_LAYER = "transit-streetcar-hit";
export const STREETCAR_BADGE_LAYER = "transit-streetcar-badges";
const STREETCAR_LAYERS = [STREETCAR_CASING_LAYER, STREETCAR_LINE_LAYER, STREETCAR_HIT_LAYER, STREETCAR_BADGE_LAYER];

/** Under the subway lines; badges sit over them but under station markers and names. */
const LINE_BEFORE = "transit-routes-casing";
const BADGE_BEFORE = "transit-stations-outer";

const BADGE_PIXEL_RATIO = 2;
/** Badge height in CSS pixels; widths follow the route number. */
const BADGE_HEIGHT = 16;
const BADGE_GAP = 2;

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
  const font = `800 ${11 * scale}px Arial, Helvetica, sans-serif`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = font;
  const widths = routes.map((route) => Math.ceil(ctx.measureText(route).width) + 8 * scale);
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
    ctx.roundRect(x + inset, inset, width - 2 * inset, height - 2 * inset, 3 * scale);
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
  options: { dark: boolean; activeFilteredLine: string | null },
): void {
  const corridors: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: catalog.features.filter(isStreetcarCorridorFeature).map((feature) => ({
      ...feature,
      properties: { ...feature.properties, badgeImage: streetcarBadgeImageId(feature.properties.routes) },
    })),
  };
  const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (source) source.setData(corridors);
  else map.addSource(SOURCE_ID, { type: "geojson", data: corridors });

  registerBadgeImages(map, catalog);
  const color = catalog.routes.find((route) => route.drawn)?.color ?? "#ED1C24";
  const lineBefore = map.getLayer(LINE_BEFORE) ? LINE_BEFORE : undefined;
  const badgeBefore = map.getLayer(BADGE_BEFORE) ? BADGE_BEFORE : undefined;

  if (!map.getLayer(STREETCAR_CASING_LAYER)) {
    map.addLayer({
      id: STREETCAR_CASING_LAYER,
      type: "line",
      source: SOURCE_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": options.dark ? "#000000" : "#ffffff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.1, 12, 3, 14, 4.4, 17, 7],
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
        // Thinner than the subway at every zoom (2.2 px at 9, 5 px at 14), so
        // the subway stays the main read.
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.1, 12, 1.8, 14, 2.6, 17, 4.6],
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
}

/** Streetcars dim with the other lines while a subway line is filtered. */
export function updateStreetcarFilter(map: MapLibreMap, activeFilteredLine: string | null): void {
  for (const layer of [STREETCAR_CASING_LAYER, STREETCAR_LINE_LAYER]) {
    if (map.getLayer(layer)) setTransitPaintProperty(map, layer, "line-opacity", lineOpacity(activeFilteredLine));
  }
  if (map.getLayer(STREETCAR_BADGE_LAYER)) {
    setTransitPaintProperty(map, STREETCAR_BADGE_LAYER, "icon-opacity", badgeOpacity(activeFilteredLine));
  }
}

export function hasStreetcarLayers(map: MapLibreMap): boolean {
  return STREETCAR_LAYERS.every((layer) => Boolean(map.getLayer(layer)));
}

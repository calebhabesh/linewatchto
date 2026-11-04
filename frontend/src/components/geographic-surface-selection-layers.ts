/**
 * The neutral selected style for surface routes and stops on the Map View
 * (plan 14, U4), shared by the streetcar, bus, night and GO bus layers. It
 * reads each layer's own sources; it adds no geometry.
 *
 * - A selected route gets the stop panel's selected look as an outline under
 *   its line: a dark band with a white edge, in both themes. With the route's
 *   layer off, its line is drawn here too (only that route).
 * - Selected stops get the selected pill (dark, white edge, white number) and
 *   dot at every zoom, over other stop labels.
 *
 * Constant paint: selection never uses a service colour or badge.
 */

import type { FilterSpecification, Map as MapLibreMap } from "maplibre-gl";
import { selectedRouteFilter, selectedStopFilter, widenLineWidth } from "../app/surface-map-selection.ts";

export const SELECTED_STOP_PILL_IMAGE = "surface-stop-pill-selected";
/** The stop panel's selected pill: the same in both themes. */
const SELECTED_FILL = "#0f172a";
const SELECTED_EDGE = "#ffffff";
const PIXEL_RATIO = 2;

export type SurfaceSelectionLineStyle = {
  color: string;
  dash: number[] | null;
  width: unknown[];
  casingWidth: unknown[];
  /** A lighter line on the dark map, where the layer has one. */
  dark?: { color?: string };
};

export type SurfaceSelectionTarget = {
  /** Layer id stem, as the layer's own: `transit-bus`. */
  prefix: string;
  corridorSource: string | null;
  stopSource: string | null;
  style: SurfaceSelectionLineStyle | null;
  /** Where the outline and line go: under the layer's casing when it is drawn. */
  lineBefore: (map: MapLibreMap) => string | undefined;
  stopBefore: (map: MapLibreMap) => string | undefined;
};

export function surfaceSelectionLayerIds(prefix: string) {
  return {
    halo: `${prefix}-selected-halo`,
    outline: `${prefix}-selected-outline`,
    line: `${prefix}-selected-line`,
    stopDots: `${prefix}-selected-stop-dots`,
    stops: `${prefix}-selected-stops`,
  };
}

/** The selected stop layers, for presses. */
export function surfaceSelectionStopLayers(prefix: string): string[] {
  const ids = surfaceSelectionLayerIds(prefix);
  return [ids.stops, ids.stopDots];
}

function drawSelectedPill(): ImageData | null {
  if (typeof document === "undefined") return null;
  const scale = PIXEL_RATIO;
  const size = 20 * scale;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.beginPath();
  ctx.roundRect(scale, scale, size - 2 * scale, size - 2 * scale, 5 * scale);
  ctx.fillStyle = SELECTED_FILL;
  ctx.fill();
  ctx.lineWidth = 1.5 * scale;
  ctx.strokeStyle = SELECTED_EDGE;
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

function registerSelectedPill(map: MapLibreMap) {
  if (map.hasImage(SELECTED_STOP_PILL_IMAGE)) return;
  const scale = PIXEL_RATIO;
  try {
    const image = drawSelectedPill();
    if (image) {
      map.addImage(SELECTED_STOP_PILL_IMAGE, image, {
        pixelRatio: scale,
        stretchX: [[7 * scale, 13 * scale]],
        stretchY: [[7 * scale, 13 * scale]],
        content: [5 * scale, 4 * scale, 15 * scale, 16 * scale],
      });
    }
  } catch {
    // Without the pill the number still shows over its dot.
  }
}

function removeLayers(map: MapLibreMap, ids: string[]) {
  for (const id of ids) if (map.getLayer(id)) map.removeLayer(id);
}

/**
 * Draws (or updates, or clears) one layer's selection. `routeLine` draws the
 * route itself as well, for a layer whose switch is off. Idempotent.
 */
export function applySurfaceSelectionLayers(
  map: MapLibreMap,
  target: SurfaceSelectionTarget,
  selection: { route: string | null; stopCodes: readonly string[]; routeLine: boolean; dark: boolean },
): void {
  const ids = surfaceSelectionLayerIds(target.prefix);
  const routeShown = Boolean(selection.route && target.corridorSource && target.style && map.getSource(target.corridorSource));
  if (!routeShown) {
    removeLayers(map, [ids.line, ids.outline, ids.halo]);
  } else {
    const style = target.style!;
    const filter = selectedRouteFilter(selection.route) as FilterSpecification;
    const before = target.lineBefore(map);
    const lines: Array<{ id: string; color: string; width: unknown[]; dash?: number[] | null }> = [
      { id: ids.halo, color: SELECTED_EDGE, width: widenLineWidth(style.casingWidth, 4.5) },
      { id: ids.outline, color: SELECTED_FILL, width: widenLineWidth(style.casingWidth, 2) },
      ...(selection.routeLine ? [{ id: ids.line, color: (selection.dark ? style.dark?.color : undefined) ?? style.color, width: style.width, dash: style.dash }] : []),
    ];
    if (!selection.routeLine) removeLayers(map, [ids.line]);
    for (const line of lines) {
      if (map.getLayer(line.id)) {
        map.setFilter(line.id, filter);
        continue;
      }
      map.addLayer({
        id: line.id,
        type: "line",
        source: target.corridorSource!,
        filter,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": line.color,
          "line-width": line.width as never,
          ...(line.dash ? { "line-dasharray": line.dash } : {}),
        },
      }, before);
    }
  }

  const stopsShown = selection.stopCodes.length > 0 && Boolean(target.stopSource && map.getSource(target.stopSource));
  if (!stopsShown) {
    removeLayers(map, [ids.stops, ids.stopDots]);
    return;
  }
  registerSelectedPill(map);
  const filter = selectedStopFilter(selection.stopCodes) as FilterSpecification;
  const before = target.stopBefore(map);
  if (map.getLayer(ids.stopDots)) map.setFilter(ids.stopDots, filter);
  else {
    map.addLayer({
      id: ids.stopDots,
      type: "circle",
      source: target.stopSource!,
      filter,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 3.5, 19, 4.5],
        "circle-color": SELECTED_FILL,
        "circle-stroke-color": SELECTED_EDGE,
        "circle-stroke-width": 1.5,
      },
    }, before);
  }
  if (map.getLayer(ids.stops)) map.setFilter(ids.stops, filter);
  else {
    map.addLayer({
      id: ids.stops,
      type: "symbol",
      source: target.stopSource!,
      filter,
      layout: {
        "text-field": ["get", "stopCode"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 11,
        "text-anchor": "bottom",
        "text-offset": [0, -0.75],
        "icon-anchor": "bottom",
        "icon-image": SELECTED_STOP_PILL_IMAGE,
        "icon-text-fit": "both",
        "icon-text-fit-padding": [1, 3, 1, 3],
        // A selected stop always shows, at every zoom, over other labels.
        "icon-allow-overlap": true,
        "text-allow-overlap": true,
      },
      paint: { "text-color": SELECTED_EDGE },
    }, before);
  }
}

/** Removes one layer's selection (before its sources go). */
export function removeSurfaceSelectionLayers(map: MapLibreMap, prefix: string): void {
  const ids = surfaceSelectionLayerIds(prefix);
  removeLayers(map, [ids.stops, ids.stopDots, ids.line, ids.outline, ids.halo]);
}

/** The selected stop number under a press, for a layer with no stop layer of its own (night-only poles). */
export function surfaceSelectionStopCodeAtPoint(map: MapLibreMap, point: { x: number; y: number }, prefix: string): string | null {
  const layers = surfaceSelectionStopLayers(prefix).filter((layer) => map.getLayer(layer));
  if (layers.length === 0) return null;
  const features = map.queryRenderedFeatures([[point.x - 4, point.y - 4], [point.x + 4, point.y + 4]], { layers });
  const code = features[0]?.properties?.stopCode;
  return typeof code === "string" && code ? code : null;
}

/** The selection layers drawn now, among these layers' (for the map's data attribute and tests). */
export function drawnSurfaceSelectionLayers(map: MapLibreMap, prefixes: readonly string[]): string[] {
  return prefixes.flatMap((prefix) => Object.values(surfaceSelectionLayerIds(prefix)))
    .filter((id) => Boolean(map.getLayer(id)));
}

/**
 * The selected style for surface routes and stops on the Map View (plan 14, U4),
 * shared by the streetcar, bus, night and GO bus layers. It reads each layer's
 * own sources; it adds no geometry.
 *
 * Selection looks the way it does for a train or LRT alert: a thick blue band
 * with a glow, flashing fast and then breathing on the same clock
 * (GeographicSelectionAttention).
 *
 * - A selected route gets the band under its line. With the route's layer off,
 *   its line is drawn here too (only that route), with its route badges, so the
 *   route stays labelled as it is with the layer on.
 * - Selected stops get the selected pill (dark, white edge, white number) and
 *   dot at every zoom, over other stop labels, each inside a thick blue outline.
 *
 * Selection never uses a service colour or badge.
 */

import type { FilterSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { SelectionAttentionFrame } from "../app/geographic-selection-attention.ts";
import { selectedRouteFilter, selectedStopFilter, surfaceRouteKey } from "../app/surface-map-selection.ts";
import { setTransitPaintProperty } from "./geographic-network-transition.ts";
import { MAP_LABEL_FONT_BOLD } from "../app/geographic-config.ts";

export const SELECTED_STOP_PILL_IMAGE = "surface-stop-pill-selected";
export const SELECTED_STOP_OUTLINE_IMAGE = "surface-stop-pill-selected-outline";
/** The stop panel's selected pill: the same in both themes. */
const SELECTED_FILL = "#0f172a";
const SELECTED_EDGE = "#ffffff";
/** The Map View's train and LRT selection colours (transit-impacts-selection and its glow). */
const SELECTION_BAND = "#38bdf8";
const SELECTION_GLOW = "#0ea5e9";
const PIXEL_RATIO = 2;

/** Thinner than a rail selection's, for lines a third as wide; as [zoom, width]. The flash scales them. */
const ROUTE_BAND_WIDTHS = [[9, 6], [14, 11], [17, 18]] as const;
const ROUTE_GLOW_WIDTHS = [[9, 13], [14, 24], [17, 36]] as const;
const ROUTE_GLOW_OPACITY = 0.55;
const STOP_RING_RADII = [[10, 7], [15, 9], [19, 11]] as const;
const STOP_RING_WIDTH = 4;

function widthsAtZoom(stops: ReadonlyArray<readonly [number, number]>, multiplier = 1) {
  return ["interpolate", ["linear"], ["zoom"], ...stops.flatMap(([zoom, width]) => [zoom, width * multiplier])];
}

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
  /** The layer's route badges: an image id for a set of routes, and their spacing along the line. */
  badge?: {
    imageId: (routes: readonly string[]) => string;
    spacing: number;
    /** Draws one route's badge now, for a layer whose images are not drawn on demand. */
    ensureImage?: (map: MapLibreMap, route: string) => void;
  };
  /** Where the outline and line go: under the layer's casing when it is drawn. */
  lineBefore: (map: MapLibreMap) => string | undefined;
  stopBefore: (map: MapLibreMap) => string | undefined;
};

export function surfaceSelectionLayerIds(prefix: string) {
  return {
    halo: `${prefix}-selected-halo`,
    outline: `${prefix}-selected-outline`,
    line: `${prefix}-selected-line`,
    badges: `${prefix}-selected-badges`,
    stopRing: `${prefix}-selected-stop-ring`,
    stopDots: `${prefix}-selected-stop-dots`,
    stopOutline: `${prefix}-selected-stop-outline`,
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

/** How far the blue outline image reaches past the pill it surrounds, in map pixels. */
const OUTLINE_REACH = 8;

/** The pill's shape as a thick blue outline with a soft glow; the same stretch and fit as the pill. */
function drawSelectedPillOutline(): ImageData | null {
  if (typeof document === "undefined") return null;
  const scale = PIXEL_RATIO;
  const size = (20 + 2 * OUTLINE_REACH) * scale;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const inset = (OUTLINE_REACH - 2) * scale;
  ctx.beginPath();
  ctx.roundRect(inset, inset, size - 2 * inset, size - 2 * inset, 7 * scale);
  ctx.shadowColor = SELECTION_GLOW;
  ctx.shadowBlur = 4 * scale;
  ctx.lineWidth = 4.5 * scale;
  ctx.strokeStyle = SELECTION_BAND;
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

function registerSelectedPill(map: MapLibreMap) {
  const scale = PIXEL_RATIO;
  try {
    if (!map.hasImage(SELECTED_STOP_PILL_IMAGE)) {
      const image = drawSelectedPill();
      if (image) {
        map.addImage(SELECTED_STOP_PILL_IMAGE, image, {
          pixelRatio: scale,
          stretchX: [[7 * scale, 13 * scale]],
          stretchY: [[7 * scale, 13 * scale]],
          content: [5 * scale, 4 * scale, 15 * scale, 16 * scale],
        });
      }
    }
    if (!map.hasImage(SELECTED_STOP_OUTLINE_IMAGE)) {
      const outline = drawSelectedPillOutline();
      if (outline) {
        const reach = OUTLINE_REACH * scale;
        map.addImage(SELECTED_STOP_OUTLINE_IMAGE, outline, {
          pixelRatio: scale,
          stretchX: [[reach + 7 * scale, reach + 13 * scale]],
          stretchY: [[reach + 7 * scale, reach + 13 * scale]],
          content: [reach + 5 * scale, reach + 4 * scale, reach + 15 * scale, reach + 16 * scale],
        });
      }
    }
  } catch {
    // Without the pill the number still shows over its dot.
  }
}

/** The corridors of one selected branch, whichever layer's route it belongs to. */
export const BRANCH_SELECTION_SOURCE = "transit-selected-branch";

/** Holds a selected branch's corridors, or goes with none (after its layers have). */
export function setBranchSelectionSource(map: MapLibreMap, corridors: ReadonlyArray<{ geometry: unknown; properties: { routes: readonly string[] } }> | null): void {
  const source = map.getSource(BRANCH_SELECTION_SOURCE) as { setData?: (data: unknown) => void } | undefined;
  if (!corridors) {
    if (source) map.removeSource(BRANCH_SELECTION_SOURCE);
    return;
  }
  const data = {
    type: "FeatureCollection",
    features: corridors.map((feature) => ({
      type: "Feature",
      geometry: feature.geometry,
      properties: { routeKey: surfaceRouteKey(feature.properties.routes) },
    })),
  };
  if (source?.setData) source.setData(data);
  else map.addSource(BRANCH_SELECTION_SOURCE, { type: "geojson", data: data as never });
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
  selection: { routes: readonly string[]; stopCodes: readonly string[]; routeLine: boolean; dark: boolean },
): void {
  const ids = surfaceSelectionLayerIds(target.prefix);
  const routeShown = Boolean(selection.routes.length > 0 && target.corridorSource && target.style && map.getSource(target.corridorSource));
  if (!routeShown) {
    removeLayers(map, [ids.badges, ids.line, ids.outline, ids.halo]);
  } else {
    const style = target.style!;
    const filter = selectedRouteFilter(selection.routes) as FilterSpecification;
    const before = target.lineBefore(map);
    const lines: Array<{ id: string; color: string; width: unknown[]; opacity?: number; blur?: unknown[]; dash?: number[] | null }> = [
      { id: ids.halo, color: SELECTION_GLOW, width: widthsAtZoom(ROUTE_GLOW_WIDTHS), opacity: ROUTE_GLOW_OPACITY, blur: widthsAtZoom(ROUTE_GLOW_WIDTHS, 0.45) },
      { id: ids.outline, color: SELECTION_BAND, width: widthsAtZoom(ROUTE_BAND_WIDTHS) },
      ...(selection.routeLine ? [{ id: ids.line, color: (selection.dark ? style.dark?.color : undefined) ?? style.color, width: style.width, dash: style.dash }] : []),
    ];
    if (!selection.routeLine) removeLayers(map, [ids.line, ids.badges]);
    for (const line of lines) {
      const existing = map.getLayer(line.id) as { source?: string } | undefined;
      if (existing && existing.source === target.corridorSource) {
        map.setFilter(line.id, filter);
        continue;
      }
      // Moved between a layer's own corridors and a branch's.
      if (existing) map.removeLayer(line.id);
      map.addLayer({
        id: line.id,
        type: "line",
        source: target.corridorSource!,
        filter,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": line.color,
          "line-width": line.width as never,
          ...(line.opacity !== undefined ? { "line-opacity": line.opacity } : {}),
          ...(line.blur ? { "line-blur": line.blur as never } : {}),
          ...(line.dash ? { "line-dasharray": line.dash } : {}),
        },
      }, before);
    }
    if (selection.routeLine && target.badge) applySelectedBadges(map, target, ids, selection.routes, filter);
  }

  const stopsShown = selection.stopCodes.length > 0 && Boolean(target.stopSource && map.getSource(target.stopSource));
  if (!stopsShown) {
    removeLayers(map, [ids.stops, ids.stopOutline, ids.stopDots, ids.stopRing]);
    return;
  }
  registerSelectedPill(map);
  const filter = selectedStopFilter(selection.stopCodes) as FilterSpecification;
  const before = target.stopBefore(map);
  if (map.getLayer(ids.stopRing)) map.setFilter(ids.stopRing, filter);
  else {
    map.addLayer({
      id: ids.stopRing,
      type: "circle",
      source: target.stopSource!,
      filter,
      paint: {
        "circle-radius": widthsAtZoom(STOP_RING_RADII) as never,
        "circle-opacity": 0,
        "circle-stroke-color": SELECTION_BAND,
        "circle-stroke-width": STOP_RING_WIDTH,
      },
    }, before);
  }
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
  // The pill and its outline share a layout, so the same number sizes both to one box.
  const pillLayout = (image: string) => ({
    "text-field": ["get", "stopCode"],
    "text-font": [MAP_LABEL_FONT_BOLD],
    "text-size": 11,
    "text-anchor": "bottom",
    "text-offset": [0, -0.75],
    "icon-anchor": "bottom",
    "icon-image": image,
    "icon-text-fit": "both",
    "icon-text-fit-padding": [1, 3, 1, 3],
    // A selected stop always shows, at every zoom, over other labels.
    "icon-allow-overlap": true,
    "text-allow-overlap": true,
  }) as never;
  if (map.getLayer(ids.stopOutline)) map.setFilter(ids.stopOutline, filter);
  else {
    map.addLayer({
      id: ids.stopOutline,
      type: "symbol",
      source: target.stopSource!,
      filter,
      layout: pillLayout(SELECTED_STOP_OUTLINE_IMAGE),
      paint: { "text-opacity": 0 },
    }, before);
  }
  if (map.getLayer(ids.stops)) map.setFilter(ids.stops, filter);
  else {
    map.addLayer({
      id: ids.stops,
      type: "symbol",
      source: target.stopSource!,
      filter,
      layout: pillLayout(SELECTED_STOP_PILL_IMAGE),
      paint: { "text-color": SELECTED_EDGE },
    }, before);
  }
}

/**
 * The selected routes' badges along their line, for a layer whose switch is
 * off. Each corridor shows the badge of a selected route it carries, never
 * another route's sharing the street. At every zoom, under the selected stops.
 */
function applySelectedBadges(
  map: MapLibreMap,
  target: SurfaceSelectionTarget,
  ids: ReturnType<typeof surfaceSelectionLayerIds>,
  routes: readonly string[],
  filter: FilterSpecification,
) {
  const badge = target.badge!;
  if (badge.ensureImage) for (const route of routes) badge.ensureImage(map, route);
  const image = routes.length === 1
    ? badge.imageId(routes)
    : ["case", ...routes.flatMap((route) => [["in", `|${route}|`, ["get", "routeKey"]], badge.imageId([route])]), badge.imageId([routes[0]])];
  const existing = map.getLayer(ids.badges) as { source?: string } | undefined;
  if (existing && existing.source === target.corridorSource) {
    map.setFilter(ids.badges, filter);
    map.setLayoutProperty(ids.badges, "icon-image", image as never);
    return;
  }
  if (existing) map.removeLayer(ids.badges);
  const before = map.getLayer(ids.stopRing) ? ids.stopRing : target.stopBefore(map);
  map.addLayer({
    id: ids.badges,
    type: "symbol",
    source: target.corridorSource!,
    filter,
    // At every zoom, as the selected stops: the route is framed well below the layer's own badge zoom.
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": badge.spacing,
      "icon-image": image as never,
      "icon-rotation-alignment": "viewport",
      "icon-allow-overlap": false,
      "icon-padding": 4,
    },
  }, before);
}

/** Removes one layer's selection (before its sources go). */
export function removeSurfaceSelectionLayers(map: MapLibreMap, prefix: string): void {
  const ids = surfaceSelectionLayerIds(prefix);
  removeLayers(map, [ids.stops, ids.stopOutline, ids.stopDots, ids.stopRing, ids.badges, ids.line, ids.outline, ids.halo]);
}

/**
 * One step of the selection flash, on whichever of these layers' selections are
 * drawn. Only paint changes; the pill and its number stay solid so the number
 * can always be read.
 */
export function applySurfaceSelectionAttentionFrame(
  map: MapLibreMap,
  prefixes: readonly string[],
  frame: SelectionAttentionFrame,
): void {
  for (const prefix of prefixes) {
    const ids = surfaceSelectionLayerIds(prefix);
    if (map.getLayer(ids.outline)) {
      setTransitPaintProperty(map, ids.outline, "line-opacity", frame.opacity);
      setTransitPaintProperty(map, ids.outline, "line-width", widthsAtZoom(ROUTE_BAND_WIDTHS, frame.widthMultiplier) as never);
    }
    if (map.getLayer(ids.halo)) {
      setTransitPaintProperty(map, ids.halo, "line-opacity", ROUTE_GLOW_OPACITY * frame.opacity);
      setTransitPaintProperty(map, ids.halo, "line-width", widthsAtZoom(ROUTE_GLOW_WIDTHS, frame.widthMultiplier) as never);
    }
    if (map.getLayer(ids.stopRing)) {
      setTransitPaintProperty(map, ids.stopRing, "circle-stroke-opacity", frame.opacity);
      setTransitPaintProperty(map, ids.stopRing, "circle-stroke-width", STOP_RING_WIDTH * frame.widthMultiplier);
    }
    if (map.getLayer(ids.stopOutline)) {
      setTransitPaintProperty(map, ids.stopOutline, "icon-opacity", frame.opacity);
    }
  }
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

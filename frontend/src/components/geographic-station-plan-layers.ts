/**
 * Station floor plans on the TTC Map View (plan 13, S7): every level of each
 * station's footprint, shaded by depth (street level lightest, platforms
 * darkest; lower levels under upper ones), then, as the map zooms in,
 * entrance arrows, elevators (the site's blue elevator icon) and bus bays,
 * stairs and escalators (with the source's up/down arrow, as livemap.ttc.ca),
 * and entrance names. Each fades in over a zoom range, as the line badges do.
 *
 * Wayfinding only: constant paint, never coloured by service data, and an
 * elevator, escalator or entrance icon never says whether it is working.
 * Bus bays (from TTC GTFS) open that bay's stop departures when pressed;
 * nothing else on a plan takes a press.
 *
 * Footprints sit under every transit line (bus, streetcar, subway); icons sit
 * just above the subway lines, under alerts, stations, stops and vehicles;
 * bay badges sit over stop labels (a bay's own stop label gives way to it)
 * and under train markers and station names. Layer ids start with
 * `transit-`, so a network switch removes them with the other transit layers
 * and the network fade covers them.
 */

import type { Map as MapLibreMap } from "maplibre-gl";
import {
  STATION_BAY_IMAGE_PREFIX,
  STATION_ENTRANCE_LABEL_EXPRESSION,
  STATION_PLANS_URL,
  STATION_PLAN_FADE_ZOOMS,
  STATION_PLAN_ICON_FADE_ZOOMS,
  STATION_PLAN_LABEL_FADE_ZOOMS,
  STATION_PLAN_MINOR_ICON_FADE_ZOOMS,
  stationBayFromImageId,
} from "../app/geographic-station-plans.ts";
import { MAP_LABEL_FONT_REGULAR } from "../app/geographic-config.ts";

/**
 * One source for every plan feature, given as a URL: MapLibre's worker
 * fetches and parses the file, so the page's main thread never does.
 */
const SOURCE = "transit-station-plans";
export const STATION_PLAN_FILL_LAYER = "transit-station-plan-fill";
export const STATION_PLAN_OUTLINE_LAYER = "transit-station-plan-outline";
export const STATION_PLAN_MINOR_ICON_LAYER = "transit-station-plan-minor-icons";
export const STATION_PLAN_ICON_LAYER = "transit-station-plan-icons";
export const STATION_PLAN_LABEL_LAYER = "transit-station-plan-labels";
/** Bay badges; a press opens the bay's stop departures. */
export const STATION_PLAN_BAY_LAYER = "transit-station-plan-bays";
const LAYERS = [
  STATION_PLAN_BAY_LAYER, STATION_PLAN_LABEL_LAYER, STATION_PLAN_ICON_LAYER, STATION_PLAN_MINOR_ICON_LAYER,
  STATION_PLAN_OUTLINE_LAYER, STATION_PLAN_FILL_LAYER,
];

export const STATION_ENTRANCE_IMAGE = "station-plan-entrance";
export const STATION_ELEVATOR_IMAGE = "station-plan-elevator";
export const STATION_STAIRS_IMAGE = "station-plan-stairs";
export const STATION_STAIRS_UP_IMAGE = "station-plan-stairs-up";
export const STATION_STAIRS_DOWN_IMAGE = "station-plan-stairs-down";
export const STATION_ESCALATOR_UP_IMAGE = "station-plan-escalator-up";
export const STATION_ESCALATOR_DOWN_IMAGE = "station-plan-escalator-down";
/** The site's own elevator icon (station panels, Accessibility Outages). */
const ELEVATOR_ICON_URL = "/assets/linewatch/outages/elevator.svg";

/** Icon sizes in CSS pixels at zoom 18 (owner, 2026-11-03: larger than the first tuning). */
const ENTRANCE_SIZE = 22;
const ELEVATOR_SIZE = 22;
const MINOR_SIZE = 22;

/** The lowest transit line present: footprints go under it. */
const LINE_LAYERS_BOTTOM_UP = ["transit-bus-casing", "transit-streetcar-casing", "transit-routes-casing"];
/** The first layer above the subway lines: icons go under it. */
const ICON_BEFORE = "transit-commute-line";
/** Bays go over stops and station markers, under train markers and station names. */
const BAY_BEFORE = "transit-train-markers-halo";

const PIXEL_RATIO = 2;

/**
 * Fill per floor, deepest darkest (owner, 2026-11-03). Light: greys on the
 * light basemap. Dark: translucent light greys over the dark basemap, as
 * livemap.ttc.ca draws them, still darker the deeper the level.
 */
export const STATION_PLAN_STYLE = {
  light: {
    floors: { below3: "#a9afb8", minus2: "#c1c6cd", minus1: "#d8dbe0", street: "#eff0f2", above: "#ffffff" },
    fillOpacity: 0.78,
    outline: "#5b626d",
    outlineOpacity: 0.55,
    labelText: "#1f2937",
    labelHalo: "#ffffff",
  },
  dark: {
    floors: { below3: "#5f6368", minus2: "#7a7e84", minus1: "#989ca1", street: "#b9bcc0", above: "#d4d6d9" },
    fillOpacity: 0.42,
    outline: "#0b0d10",
    outlineOpacity: 0.6,
    labelText: "#e5e7eb",
    labelHalo: "#0b0d10",
  },
} as const;

export function stationPlanFillColor(dark: boolean): unknown[] {
  const { floors } = dark ? STATION_PLAN_STYLE.dark : STATION_PLAN_STYLE.light;
  return ["step", ["get", "floor"], floors.below3, -2, floors.minus2, -1, floors.minus1, 0, floors.street, 1, floors.above];
}

/** Opacity easing from 0 to `full` across a zoom range, as the line badges fade. */
export function stationPlanFade(zooms: readonly [number, number], full = 1): unknown[] {
  return ["interpolate", ["linear"], ["zoom"], zooms[0], 0, zooms[1], full];
}

function lowestLineLayer(map: MapLibreMap): string | undefined {
  return LINE_LAYERS_BOTTOM_UP.find((id) => map.getLayer(id));
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  if (typeof document === "undefined") return null;
  const element = document.createElement("canvas");
  element.width = size;
  element.height = size;
  const ctx = element.getContext("2d");
  return ctx ? [element, ctx] : null;
}

/** A dark disc with a white edge and an arrow pointing up (rotated by the entrance's bearing). */
function drawEntrance(sizeCss: number): ImageData | null {
  const s = PIXEL_RATIO;
  const size = sizeCss * s;
  const made = canvas(size);
  if (!made) return null;
  const [, ctx] = made;
  const c = size / 2;
  ctx.beginPath();
  ctx.arc(c, c, c - 1.25 * s, 0, Math.PI * 2);
  ctx.fillStyle = "#111827";
  ctx.fill();
  ctx.lineWidth = 1.5 * s;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.lineWidth = 2 * s;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const k = sizeCss / 20;
  ctx.moveTo(c, c + 5 * k * s);
  ctx.lineTo(c, c - 5 * k * s);
  ctx.moveTo(c - 4 * k * s, c - 1 * k * s);
  ctx.lineTo(c, c - 5 * k * s);
  ctx.lineTo(c + 4 * k * s, c - 1 * k * s);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

/** A white tile with a dark edge, and a glyph drawn by `glyph` in the dark ink. */
function drawTile(sizeCss: number, glyph: (ctx: CanvasRenderingContext2D, c: number, s: number) => void): ImageData | null {
  const s = PIXEL_RATIO;
  const size = sizeCss * s;
  const made = canvas(size);
  if (!made) return null;
  const [, ctx] = made;
  ctx.beginPath();
  ctx.roundRect(s, s, size - 2 * s, size - 2 * s, 3 * s);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 1.25 * s;
  ctx.strokeStyle = "#1f2937";
  ctx.stroke();
  ctx.fillStyle = "#1f2937";
  ctx.strokeStyle = "#1f2937";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  glyph(ctx, size / 2, s);
  return ctx.getImageData(0, 0, size, size);
}

/**
 * The site's blue elevator icon, drawn once to a bitmap and kept for the
 * visit. Until it has loaded the map uses a white tile of the same size,
 * swapped in place when it arrives.
 */
let elevatorBitmap: ImageData | null = null;
let elevatorBitmapPending: Promise<ImageData | null> | null = null;

export function prepareStationPlanImages(): Promise<ImageData | null> {
  if (elevatorBitmap) return Promise.resolve(elevatorBitmap);
  if (elevatorBitmapPending) return elevatorBitmapPending;
  if (typeof Image === "undefined" || typeof document === "undefined") return Promise.resolve(null);
  elevatorBitmapPending = new Promise<ImageData | null>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const made = canvas(ELEVATOR_SIZE * PIXEL_RATIO);
      if (!made) return resolve(null);
      const [, ctx] = made;
      ctx.drawImage(image, 0, 0, ELEVATOR_SIZE * PIXEL_RATIO, ELEVATOR_SIZE * PIXEL_RATIO);
      elevatorBitmap = ctx.getImageData(0, 0, ELEVATOR_SIZE * PIXEL_RATIO, ELEVATOR_SIZE * PIXEL_RATIO);
      resolve(elevatorBitmap);
    };
    image.onerror = () => {
      elevatorBitmapPending = null;
      resolve(null);
    };
    image.src = ELEVATOR_ICON_URL;
  });
  return elevatorBitmapPending;
}

/**
 * Stair and escalator pictograms in the TTC station sign style (as
 * livemap.ttc.ca shows them, drawn here, not copied): a white tile with a
 * bold black edge, a bold staircase (or an escalator band with a rider), and
 * a separate arrow below it for the direction. Drawn on a 24-unit grid.
 */
function drawPictogram(draw: (ctx: CanvasRenderingContext2D) => void): ImageData | null {
  const s = PIXEL_RATIO;
  const size = MINOR_SIZE * s;
  const made = canvas(size);
  if (!made) return null;
  const [, ctx] = made;
  const u = size / 24;
  ctx.save();
  ctx.scale(u, u);
  ctx.beginPath();
  ctx.roundRect(1.2, 1.2, 21.6, 21.6, 4.2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 1.9;
  ctx.strokeStyle = "#000000";
  ctx.stroke();
  ctx.fillStyle = "#000000";
  ctx.strokeStyle = "#000000";
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";
  draw(ctx);
  ctx.restore();
  return ctx.getImageData(0, 0, size, size);
}

/** Mirrors what `draw` paints left to right inside the 24-unit tile. */
function mirrored(ctx: CanvasRenderingContext2D, draw: () => void) {
  ctx.save();
  ctx.translate(24, 0);
  ctx.scale(-1, 1);
  draw();
  ctx.restore();
}

/** A bold arrow from one point to another, its head at the far end. */
function pictogramArrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const head = 3.6;
  ctx.lineWidth = 1.9;
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.moveTo(x1 - Math.sign(x1 - x0) * head, y1);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x1, y1 - Math.sign(y1 - y0) * head);
  ctx.stroke();
  ctx.lineCap = "butt";
}

/** Four bold steps rising to the right, from the lower left. */
function staircase(ctx: CanvasRenderingContext2D) {
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.moveTo(4, 17);
  ctx.lineTo(7.5, 17);
  ctx.lineTo(7.5, 13.75);
  ctx.lineTo(10.75, 13.75);
  ctx.lineTo(10.75, 10.5);
  ctx.lineTo(14, 10.5);
  ctx.lineTo(14, 7.25);
  ctx.lineTo(17.25, 7.25);
  ctx.lineTo(17.25, 4.5);
  ctx.lineTo(20, 4.5);
  ctx.stroke();
}

/** Stairs: up rises to the right with ↗ below right; down falls to the right with ↘ below left; plain has no arrow. */
function drawStairs(direction: "up" | "down" | null): ImageData | null {
  return drawPictogram((ctx) => {
    if (direction === "down") {
      mirrored(ctx, () => staircase(ctx));
      pictogramArrow(ctx, 4.5, 14.5, 9.5, 19.5);
    } else {
      staircase(ctx);
      if (direction === "up") pictogramArrow(ctx, 14.5, 19.5, 19.5, 14.5);
    }
  });
}

/** An escalator band rising to the right with a rider standing on it. */
function escalatorRising(ctx: CanvasRenderingContext2D) {
  // The band: a bold outline, hollow inside.
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(4.5, 16);
  ctx.lineTo(8, 16);
  ctx.lineTo(14.5, 9.5);
  ctx.lineTo(18.5, 9.5);
  ctx.lineWidth = 5.2;
  ctx.strokeStyle = "#000000";
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.strokeStyle = "#000000";
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";
  // The rider: head and body above the band's lower bend.
  ctx.beginPath();
  ctx.arc(9.4, 4.9, 1.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(8, 7, 2.8, 5.6, 0.9);
  ctx.fill();
}

/** Escalators: up rises to the right with ↗ below right; down falls to the right with ↘ below left. */
function drawEscalator(direction: "up" | "down"): ImageData | null {
  return drawPictogram((ctx) => {
    if (direction === "down") {
      mirrored(ctx, () => escalatorRising(ctx));
      pictogramArrow(ctx, 4.5, 15, 9.5, 20);
    } else {
      escalatorRising(ctx);
      pictogramArrow(ctx, 14.5, 20, 19.5, 15);
    }
  });
}

/** A bay sign: a black tile with a white edge, "BAY" small over the number. */
function drawBay(bay: string): ImageData | null {
  if (typeof document === "undefined") return null;
  const s = PIXEL_RATIO;
  const element = document.createElement("canvas");
  const ctx = element.getContext("2d");
  if (!ctx) return null;
  const numberFont = `800 ${13 * s}px Arial, Helvetica, sans-serif`;
  ctx.font = numberFont;
  const width = Math.max(22 * s, Math.ceil(ctx.measureText(bay).width) + 9 * s);
  const height = 26 * s;
  element.width = width;
  element.height = height;
  ctx.beginPath();
  ctx.roundRect(s, s, width - 2 * s, height - 2 * s, 3 * s);
  ctx.fillStyle = "#111111";
  ctx.fill();
  ctx.lineWidth = 1.5 * s;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${6 * s}px Arial, Helvetica, sans-serif`;
  ctx.fillText("BAY", width / 2, 7.5 * s);
  ctx.font = numberFont;
  ctx.fillText(bay, width / 2, 17 * s);
  return ctx.getImageData(0, 0, width, height);
}

function addImage(map: MapLibreMap, id: string, draw: () => ImageData | null) {
  if (map.hasImage(id)) return;
  try {
    const image = draw();
    if (image) map.addImage(id, image, { pixelRatio: PIXEL_RATIO });
  } catch {
    // Without the icon the footprint still draws.
  }
}

function registerImages(map: MapLibreMap) {
  addImage(map, STATION_ENTRANCE_IMAGE, () => drawEntrance(ENTRANCE_SIZE));
  addImage(map, STATION_STAIRS_IMAGE, () => drawStairs(null));
  addImage(map, STATION_STAIRS_UP_IMAGE, () => drawStairs("up"));
  addImage(map, STATION_STAIRS_DOWN_IMAGE, () => drawStairs("down"));
  addImage(map, STATION_ESCALATOR_UP_IMAGE, () => drawEscalator("up"));
  addImage(map, STATION_ESCALATOR_DOWN_IMAGE, () => drawEscalator("down"));
  addImage(map, STATION_ELEVATOR_IMAGE, () => elevatorBitmap ?? drawTile(ELEVATOR_SIZE, () => {}));
  if (!elevatorBitmap) {
    void prepareStationPlanImages().then((bitmap) => {
      if (!bitmap) return;
      try {
        if (map.hasImage(STATION_ELEVATOR_IMAGE)) map.updateImage(STATION_ELEVATOR_IMAGE, bitmap);
      } catch {
        // The map may have been removed meanwhile.
      }
    });
  }
}

/**
 * Draws a bay badge MapLibre asks for (`styleimagemissing`), so only bays in
 * view are drawn. Returns false for any other image.
 */
export function addMissingStationBayImage(map: MapLibreMap, id: string): boolean {
  const bay = stationBayFromImageId(id);
  if (!bay) return false;
  addImage(map, id, () => drawBay(bay));
  return true;
}

/**
 * Plans are given to the map only once the TTC Map View first nears plan
 * zoom, so the file is never fetched at the default view. Kept for the visit,
 * so style changes and network switches reinstall them.
 */
let stationPlansRequested = false;
export function requestStationPlans(): void {
  stationPlansRequested = true;
}
export function areStationPlansRequested(): boolean {
  return stationPlansRequested;
}

export function hasStationPlanLayers(map: MapLibreMap): boolean {
  return Boolean(map.getLayer(STATION_PLAN_FILL_LAYER));
}

function featureType(type: string) {
  return ["==", ["get", "featureType"], type];
}

/** Each point's icon, from its kind and (stairs, escalators) direction. */
const MINOR_ICON_EXPRESSION = [
  "case",
  ["==", ["get", "featureType"], "station-escalator"],
  ["match", ["get", "direction"], "down", STATION_ESCALATOR_DOWN_IMAGE, STATION_ESCALATOR_UP_IMAGE],
  ["match", ["get", "direction"], "up", STATION_STAIRS_UP_IMAGE, "down", STATION_STAIRS_DOWN_IMAGE, STATION_STAIRS_IMAGE],
];
const MAIN_ICON_EXPRESSION = [
  "match", ["get", "featureType"], "station-entrance", STATION_ENTRANCE_IMAGE, STATION_ELEVATOR_IMAGE,
];

/** The asset as an absolute URL: the worker resolves relative URLs against its own script. */
function stationPlansUrl(): string {
  return typeof window === "undefined" ? STATION_PLANS_URL : new URL(STATION_PLANS_URL, window.location.origin).href;
}

/**
 * Adds the plan source, icons and layers (again after a style change).
 * Needs the subway layers in place; returns false (and adds nothing) without them.
 */
export function installStationPlanLayers(map: MapLibreMap, options: { dark: boolean }): boolean {
  const areaBefore = lowestLineLayer(map);
  if (!areaBefore || !map.getLayer(ICON_BEFORE)) return false;
  const style = options.dark ? STATION_PLAN_STYLE.dark : STATION_PLAN_STYLE.light;
  if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: "geojson", data: stationPlansUrl(), maxzoom: 20 });
  registerImages(map);

  const iconSize = ["interpolate", ["linear"], ["zoom"], STATION_PLAN_ICON_FADE_ZOOMS[0], 0.8, 18, 1, 20, 1.25];
  const isArea = featureType("station-area");
  if (!map.getLayer(STATION_PLAN_FILL_LAYER)) {
    map.addLayer({
      id: STATION_PLAN_FILL_LAYER,
      type: "fill",
      source: SOURCE,
      minzoom: STATION_PLAN_FADE_ZOOMS[0],
      filter: isArea as never,
      paint: {
        "fill-color": stationPlanFillColor(options.dark) as never,
        "fill-opacity": stationPlanFade(STATION_PLAN_FADE_ZOOMS, style.fillOpacity) as never,
        "fill-antialias": true,
      },
    }, areaBefore);
  }
  if (!map.getLayer(STATION_PLAN_OUTLINE_LAYER)) {
    map.addLayer({
      id: STATION_PLAN_OUTLINE_LAYER,
      type: "line",
      source: SOURCE,
      minzoom: STATION_PLAN_FADE_ZOOMS[0],
      filter: isArea as never,
      layout: { "line-join": "round" },
      paint: {
        "line-color": style.outline,
        "line-opacity": stationPlanFade(STATION_PLAN_FADE_ZOOMS, style.outlineOpacity) as never,
        "line-width": ["interpolate", ["linear"], ["zoom"], STATION_PLAN_FADE_ZOOMS[0], 0.5, 18, 1.2, 20, 1.6] as never,
      },
    }, areaBefore);
  }
  if (!map.getLayer(STATION_PLAN_MINOR_ICON_LAYER)) {
    map.addLayer({
      id: STATION_PLAN_MINOR_ICON_LAYER,
      type: "symbol",
      source: SOURCE,
      minzoom: STATION_PLAN_MINOR_ICON_FADE_ZOOMS[0],
      filter: ["in", ["get", "featureType"], ["literal", ["station-stairs", "station-escalator"]]] as never,
      layout: {
        "icon-image": MINOR_ICON_EXPRESSION as never,
        "icon-size": iconSize as never,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: { "icon-opacity": stationPlanFade(STATION_PLAN_MINOR_ICON_FADE_ZOOMS) as never },
    }, ICON_BEFORE);
  }
  if (!map.getLayer(STATION_PLAN_ICON_LAYER)) {
    map.addLayer({
      id: STATION_PLAN_ICON_LAYER,
      type: "symbol",
      source: SOURCE,
      minzoom: STATION_PLAN_ICON_FADE_ZOOMS[0],
      filter: ["in", ["get", "featureType"], ["literal", ["station-elevator", "station-entrance"]]] as never,
      layout: {
        "icon-image": MAIN_ICON_EXPRESSION as never,
        "icon-rotate": ["coalesce", ["get", "bearing"], 0] as never,
        "icon-rotation-alignment": "map",
        "icon-size": iconSize as never,
        // Entrances over elevators beside them.
        "symbol-sort-key": ["match", ["get", "featureType"], "station-entrance", 1, 0] as never,
        // Always drawn, and never pushing station names or stop numbers aside.
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: { "icon-opacity": stationPlanFade(STATION_PLAN_ICON_FADE_ZOOMS) as never },
    }, ICON_BEFORE);
  }
  if (!map.getLayer(STATION_PLAN_LABEL_LAYER)) {
    map.addLayer({
      id: STATION_PLAN_LABEL_LAYER,
      type: "symbol",
      source: SOURCE,
      minzoom: STATION_PLAN_LABEL_FADE_ZOOMS[0],
      filter: featureType("station-entrance") as never,
      layout: {
        "text-field": STATION_ENTRANCE_LABEL_EXPRESSION as never,
        "text-font": [MAP_LABEL_FONT_REGULAR],
        "text-size": 11,
        "text-max-width": 9,
        "text-variable-anchor": ["left", "right", "top", "bottom"],
        "text-radial-offset": 1.2,
        // Names give way to station names and stop numbers.
        "text-optional": true,
      },
      paint: {
        "text-color": style.labelText,
        "text-halo-color": style.labelHalo,
        "text-halo-width": 1.4,
        "text-opacity": stationPlanFade(STATION_PLAN_LABEL_FADE_ZOOMS) as never,
      },
    }, ICON_BEFORE);
  }
  if (!map.getLayer(STATION_PLAN_BAY_LAYER)) {
    map.addLayer({
      id: STATION_PLAN_BAY_LAYER,
      type: "symbol",
      source: SOURCE,
      minzoom: STATION_PLAN_ICON_FADE_ZOOMS[0],
      filter: featureType("station-bay") as never,
      layout: {
        "icon-image": ["concat", STATION_BAY_IMAGE_PREFIX, ["get", "bay"]] as never,
        "icon-size": iconSize as never,
        // Always drawn; a stop label colliding with its bay gives way.
        "icon-allow-overlap": true,
        "icon-ignore-placement": false,
      },
      paint: { "icon-opacity": stationPlanFade(STATION_PLAN_ICON_FADE_ZOOMS) as never },
    }, map.getLayer(BAY_BEFORE) ? BAY_BEFORE : undefined);
  }
  return true;
}

/** The stop number of a bay badge under a press, or null. */
export function stationBayStopCodeAtPoint(map: MapLibreMap, point: { x: number; y: number }): string | null {
  if (!map.getLayer(STATION_PLAN_BAY_LAYER) || map.getZoom() < STATION_PLAN_ICON_FADE_ZOOMS[0]) return null;
  const features = map.queryRenderedFeatures(
    [[point.x - 3, point.y - 3], [point.x + 3, point.y + 3]],
    { layers: [STATION_PLAN_BAY_LAYER] },
  );
  const code = features[0]?.properties?.stopCode;
  return typeof code === "string" && code ? code : null;
}

export function removeStationPlanLayers(map: MapLibreMap): void {
  for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(SOURCE)) map.removeSource(SOURCE);
}

import type { Map as MapLibreMap, GeoJSONSource, ExpressionSpecification } from "maplibre-gl";
import { createSdfImageData } from "./map-sprite-sdf.ts";
import { drawTrainMarkerImage, readTrainMarkerPaint } from "./train-marker-art.ts";
import {
  createSvgImage,
  generateOverlapBadgeSvg,
  parseOverlapBadgeKey,
  MAP_BADGE_PIXEL_RATIO,
} from "./map-overlap-svg.ts";
import type { GeographicCatalog } from "../app/geographic-catalog.ts";
import { partitionCatalogFeatures } from "../app/geographic-overlays.ts";
import {
  GEOGRAPHIC_LINE_BADGE_FULL_ZOOM,
  GEOGRAPHIC_LINE_BADGE_HALF_ZOOM,
  GEOGRAPHIC_LINE_BADGE_HIDDEN_ZOOM,
  projectGeographicLineBadges,
  GEOGRAPHIC_LINE_BREADCRUMB_BASE_ZOOM,
  GEOGRAPHIC_LINE_BREADCRUMB_LEVELS,
  GEOGRAPHIC_ROUTE_OFFSET_SIDES,
  GEOGRAPHIC_ROUTE_OFFSET_STOPS,
  projectGeographicLineBreadcrumbs,
} from "../app/map-line-badges.ts";
import { ALL_LINE_COLORS } from "../app/geographic-config.ts";
import { REGIONAL_ROUTE_DEFINITIONS } from "../app/regional-data.ts";
import type { PlannedClosure } from "../app/linewatch-data.ts";
import { recordGeographicMapLifecycle } from "../app/geographic-lifecycle.ts";
import { cachedStreetcarCatalog } from "../app/geographic-surface-catalog.ts";
import { installStreetcarLayers, updateStreetcarFilter } from "./geographic-streetcar-layers.ts";
import {
  DEFAULT_STATION_LABEL_PLACEMENT,
  stationLabelPlacements,
  variableAnchorOffset,
} from "../app/geographic-station-label-placement.ts";
import { installTransitOpacity, setTransitPaintProperty } from "./geographic-network-transition.ts";

export const EMPTY_GEOJSON_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

interface GeographicDynamicSourcesData {
  impactedLinks: GeoJSON.FeatureCollection;
  impactedStations: GeoJSON.FeatureCollection;
  impactBadges: GeoJSON.FeatureCollection;
  impactArrows: GeoJSON.FeatureCollection;
  trainMarkers: GeoJSON.FeatureCollection;
  commuteLinks: GeoJSON.FeatureCollection;
  commuteStations: GeoJSON.FeatureCollection;
}

interface GeographicSelectionStylingState {
  selectedStationId?: string | null;
  selection?: { kind: string; id: string } | null;
  plannedClosures?: PlannedClosure[];
}

interface GeographicMapDynamicState {
  overlayData: GeographicDynamicSourcesData;
  activeFilteredLine?: string | null;
  selectedStationId?: string | null;
  selection?: { kind: string; id: string } | null;
  plannedClosures?: PlannedClosure[];
}

interface InstallTransitLayersInitialData {
  overlayData?: GeographicDynamicSourcesData;
  activeFilteredLine?: string | null;
  selectedStationId?: string | null;
  selectionId?: string | null;
  selection?: { kind: string; id: string } | null;
  plannedClosures?: PlannedClosure[];
}

export function ensureBadgeImages(
  map: MapLibreMap | null,
  features: GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>[],
): void {
  if (!map || !map.hasImage) return;
  for (const feature of features) {
    const key = feature.properties?.badgeImageKey as string | undefined;
    if (!key || map.hasImage(key)) continue;
    const badgeInfo = parseOverlapBadgeKey(key);
    if (!badgeInfo) continue;
    const svg = generateOverlapBadgeSvg(badgeInfo);
    createSvgImage(svg)
      .then((img) => {
        if (map && map.hasImage && !map.hasImage(key)) {
          map.addImage(key, img, { pixelRatio: MAP_BADGE_PIXEL_RATIO });
        }
      })
      .catch(() => {});
  }
}

function registerMapImages(map: MapLibreMap): void {
  if (typeof document === "undefined") return;

  if (map.hasImage && !map.hasImage("direction-arrow")) {
    try {
      const size = 64;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#ffffff";
        ctx.scale(2, 2);
        ctx.lineWidth = 4.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(8, 21);
        ctx.lineTo(16, 9);
        ctx.lineTo(24, 21);
        ctx.stroke();
        const imgData = ctx.getImageData(0, 0, size, size);
        map.addImage("direction-arrow", createSdfImageData(imgData), { sdf: true, pixelRatio: 2 });
      }
    } catch {
      // Ignored if canvas or WebGL image creation is unsupported
    }
  }

  // Register joined opposing-chevron glyph for explicit bidirectionality (side-by-side)
  if (map.hasImage && !map.hasImage("direction-arrow-bidirectional")) {
    try {
      const size = 64;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "#ffffff";
        ctx.scale(2, 2);
        ctx.lineWidth = 3.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        // Forward chevron on left (pointing up along link tangent)
        ctx.moveTo(3, 21);
        ctx.lineTo(9, 9);
        ctx.lineTo(15, 21);
        // Reverse chevron on right (pointing down along link tangent)
        ctx.moveTo(17, 11);
        ctx.lineTo(23, 23);
        ctx.lineTo(29, 11);
        ctx.stroke();
        const imgData = ctx.getImageData(0, 0, size, size);
        map.addImage("direction-arrow-bidirectional", createSdfImageData(imgData), { sdf: true, pixelRatio: 2 });
      }
    } catch {
      // Ignored if unsupported
    }
  }


  const lineBadgeSprites = [
    { number: "1", background: "#F8C300", foreground: "#000000" },
    { number: "2", background: "#00923F", foreground: "#ffffff" },
    { number: "4", background: "#A21A68", foreground: "#ffffff" },
    { number: "5", background: "#EB8738", foreground: "#ffffff" },
    { number: "6", background: "#969594", foreground: "#ffffff" },
    ...REGIONAL_ROUTE_DEFINITIONS.map((route) => ({
      number: route.number,
      background: route.color,
      foreground: "#ffffff",
    })),
  ] as const;
  for (const sprite of lineBadgeSprites) {
    const imageId = `line-badge-${sprite.number}`;
    if (!map.hasImage || map.hasImage(imageId)) continue;
    try {
      const size = 64;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.beginPath();
      if (sprite.number.length === 1) {
        ctx.arc(size / 2, size / 2, 27, 0, Math.PI * 2);
      } else {
        ctx.roundRect(5, 5, 54, 54, 7);
      }
      ctx.fillStyle = sprite.background;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.stroke();
      ctx.fillStyle = sprite.foreground;
      ctx.font = `700 ${sprite.number.length === 1 ? 36 : 25}px Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(sprite.number, size / 2, size / 2 + 1);
      map.addImage(imageId, ctx.getImageData(0, 0, size, size), { pixelRatio: 2 });
    } catch {
      // Ignored if canvas or WebGL image creation is unsupported
    }
  }
}

/** Station names show from these zooms in Map View (TTC's stations sit closer together). */
export const GEOGRAPHIC_STATION_LABEL_MIN_ZOOM = { ttc: 10.5, regional: 9 } as const;

/** Line breadcrumbs fade in from here, as the overview line badges fade out. */
/**
 * The selected alert's band and glow, as [zoom, width] stops. Like the System
 * Map's selection flash (about 1.5× its alert tube, with a blue glow), the
 * band is wider than the alert's glyphs so it shows on both sides of them.
 * The attention flash scales these widths.
 */
export const GEOGRAPHIC_SELECTION_BAND_WIDTHS = [[9, 12], [14, 24], [17, 32]] as const;
export const GEOGRAPHIC_SELECTION_GLOW_WIDTHS = [[9, 22], [14, 40], [17, 52]] as const;
export const GEOGRAPHIC_SELECTION_GLOW_OPACITY = 0.55;

export function geographicSelectionWidthExpression(
  stops: ReadonlyArray<readonly [number, number]>,
  multiplier = 1,
): ExpressionSpecification {
  return ["interpolate", ["linear"], ["zoom"], ...stops.flatMap(([zoom, width]) => [zoom, width * multiplier])] as ExpressionSpecification;
}

/** Station names grow with zoom; the hovered copy uses the same sizes. */
const GEOGRAPHIC_STATION_LABEL_SIZE: ExpressionSpecification = [
  "interpolate", ["linear"], ["zoom"], 9, 14, 12, 16, 14, 18, 16, 21,
];
/** Each name's placement beside its station (geographic-station-label-placement.ts). */
const GEOGRAPHIC_STATION_LABEL_ANCHOR: ExpressionSpecification = ["coalesce", ["get", "labelAnchor"], "top"];
const GEOGRAPHIC_STATION_LABEL_OFFSET: ExpressionSpecification = ["coalesce", ["get", "labelOffset"], ["literal", [0, 1.2]]];
/** The System Map's station hover accent (`--station-selection-accent`) and its 30% fill. */
const GEOGRAPHIC_STATION_HOVER_ACCENT = "#38bdf8";
const GEOGRAPHIC_STATION_HOVER_FILL = "rgba(56, 189, 248, 0.3)";
/** A station's eased hover, 0 to 1 (`createGeographicStationHoverAnimator`). */
const STATION_HOVER_AMOUNT: ExpressionSpecification = ["coalesce", ["feature-state", "hover"], 0];
const GEOGRAPHIC_STATION_LABEL_HOVER_HALO = { dark: "rgba(56, 189, 248, 0.6)", light: "rgba(56, 189, 248, 0.45)" } as const;
export const GEOGRAPHIC_LINE_BREADCRUMB_MIN_ZOOM = 9;
const GEOGRAPHIC_LINE_BREADCRUMB_FULL_ZOOM = 10;

/** Only the breadcrumb set for the current zoom level (map-line-badges.ts). */
export function lineBreadcrumbLevelFilter(): ExpressionSpecification {
  return [
    "==",
    ["get", "level"],
    ["min", GEOGRAPHIC_LINE_BREADCRUMB_LEVELS, ["max", 0, ["floor", ["-", ["zoom"], GEOGRAPHIC_LINE_BREADCRUMB_BASE_ZOOM]]]],
  ] as unknown as ExpressionSpecification;
}

/** A route feature's authored line badge sprite (`line-badge-1`, `line-badge-KI`). */
export function lineBreadcrumbSpriteExpression(network: "ttc" | "regional"): ExpressionSpecification {
  const code = network === "regional"
    ? ["upcase", ["slice", ["get", "lineId"], "regional-".length]]
    : ["slice", ["get", "lineId"], "line-".length];
  return ["concat", "line-badge-", code] as unknown as ExpressionSpecification;
}

/** Breadcrumbs fade in with zoom and dim with the other lines under a line filter. */
export function lineBreadcrumbOpacityExpression(activeLine: string | null): ExpressionSpecification {
  const zoomFade = [
    "interpolate",
    ["linear"],
    ["zoom"],
    GEOGRAPHIC_LINE_BREADCRUMB_MIN_ZOOM,
    0,
    GEOGRAPHIC_LINE_BREADCRUMB_FULL_ZOOM,
    1,
  ];
  return (activeLine
    ? ["*", zoomFade, ["case", ["==", ["get", "lineId"], activeLine], 1, 0.2]]
    : zoomFade) as unknown as ExpressionSpecification;
}

export function lineBadgeOpacityExpression(activeLine: string | null): ExpressionSpecification {
  const zoomFade = [
    "interpolate",
    ["linear"],
    ["zoom"],
    GEOGRAPHIC_LINE_BADGE_FULL_ZOOM,
    1,
    GEOGRAPHIC_LINE_BADGE_HALF_ZOOM,
    0.5,
    GEOGRAPHIC_LINE_BADGE_HIDDEN_ZOOM,
    0,
  ];
  return (activeLine
    ? ["*", zoomFade, ["case", ["==", ["get", "lineId"], activeLine], 1, 0.2]]
    : zoomFade) as unknown as ExpressionSpecification;
}

export function updateGeographicDynamicSources(
  map: MapLibreMap,
  overlayData: GeographicDynamicSourcesData,
): void {
  const impactsSource = map.getSource("transit-impacts") as GeoJSONSource | undefined;
  if (impactsSource) impactsSource.setData(overlayData.impactedLinks);

  const impactStationsSource = map.getSource("transit-impact-stations") as GeoJSONSource | undefined;
  if (impactStationsSource) impactStationsSource.setData(overlayData.impactedStations);

  const badgesSource = map.getSource("transit-impact-badges") as GeoJSONSource | undefined;
  if (badgesSource) {
    ensureBadgeImages(
      map,
      overlayData.impactBadges.features as GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>[],
    );
    badgesSource.setData(overlayData.impactBadges);
  }

  const arrowsSource = map.getSource("transit-impact-arrows") as GeoJSONSource | undefined;
  if (arrowsSource) arrowsSource.setData(overlayData.impactArrows);

  const trainsSource = map.getSource("transit-train-markers") as GeoJSONSource | undefined;
  if (trainsSource) trainsSource.setData(overlayData.trainMarkers);

  const commuteLinksSource = map.getSource("transit-commute-links") as GeoJSONSource | undefined;
  if (commuteLinksSource) commuteLinksSource.setData(overlayData.commuteLinks);

  const commuteStationsSource = map.getSource("transit-commute-stations") as GeoJSONSource | undefined;
  if (commuteStationsSource) commuteStationsSource.setData(overlayData.commuteStations);

  recordGeographicMapLifecycle("sourceUpdate");
}

export function updateGeographicLineFilter(
  map: MapLibreMap,
  activeFilteredLine: string | null,
): void {
  updateStreetcarFilter(map, activeFilteredLine);
  if (map.getLayer("transit-routes")) {
    setTransitPaintProperty(map,
      "transit-routes",
      "line-opacity",
      activeFilteredLine
        ? ["case", ["==", ["get", "lineId"], activeFilteredLine], 1.0, 0.2]
        : 1.0,
    );
  }

  if (map.getLayer("transit-line-badges")) {
    setTransitPaintProperty(map,
      "transit-line-badges",
      "icon-opacity",
      lineBadgeOpacityExpression(activeFilteredLine),
    );
  }

  if (map.getLayer("transit-line-breadcrumbs")) {
    setTransitPaintProperty(map,
      "transit-line-breadcrumbs",
      "icon-opacity",
      lineBreadcrumbOpacityExpression(activeFilteredLine),
    );
  }

  if (map.getLayer("transit-stations-outer")) {
    setTransitPaintProperty(map,
      "transit-stations-outer",
      "circle-opacity",
      activeFilteredLine
        ? ["case", ["in", activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
        : 1.0,
    );
    setTransitPaintProperty(map,
      "transit-stations-outer",
      "circle-stroke-opacity",
      activeFilteredLine
        ? ["case", ["in", activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
        : 1.0,
    );
  }

  if (map.getLayer("transit-stations-inner")) {
    setTransitPaintProperty(map,
      "transit-stations-inner",
      "circle-opacity",
      activeFilteredLine
        ? ["case", ["in", activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
        : 1.0,
    );
  }

  if (map.getLayer("transit-impact-arrows")) {
    setTransitPaintProperty(map,
      "transit-impact-arrows",
      "icon-opacity",
      activeFilteredLine
        ? [
            "case",
            ["==", ["get", "lineId"], activeFilteredLine],
            ["case", ["get", "isSelected"], 1.0, 0.85],
            0.2,
          ]
        : ["case", ["get", "isSelected"], 1.0, 0.85],
    );
  }

  if (map.getLayer("transit-impact-arrows-casing")) {
    setTransitPaintProperty(map,
      "transit-impact-arrows-casing",
      "icon-opacity",
      activeFilteredLine
        ? ["case", ["==", ["get", "lineId"], activeFilteredLine], 0.98, 0.2]
        : 0.98,
    );
  }

  if (map.getLayer("transit-train-markers-halo")) {
    setTransitPaintProperty(map,
      "transit-train-markers-halo",
      "circle-opacity",
      activeFilteredLine ? ["case", ["==", ["get", "lineId"], activeFilteredLine], 1.0, 0.2] : 1.0,
    );
    setTransitPaintProperty(map,
      "transit-train-markers-halo",
      "circle-stroke-opacity",
      activeFilteredLine ? ["case", ["==", ["get", "lineId"], activeFilteredLine], 1.0, 0.2] : 1.0,
    );
  }

  if (map.getLayer("transit-train-markers-symbol")) {
    setTransitPaintProperty(map,
      "transit-train-markers-symbol",
      "icon-opacity",
      activeFilteredLine ? ["case", ["==", ["get", "lineId"], activeFilteredLine], 1.0, 0.2] : 1.0,
    );
  }

  if (map.getLayer("transit-train-markers-label")) {
    setTransitPaintProperty(map,
      "transit-train-markers-label",
      "text-opacity",
      activeFilteredLine ? ["case", ["==", ["get", "lineId"], activeFilteredLine], 1.0, 0.2] : 1.0,
    );
  }
}

export function updateGeographicStationSelection(
  map: MapLibreMap,
  selectedStationId: string | null,
): void {
  if (map.getLayer("transit-station-selection")) {
    map.setFilter("transit-station-selection", [
      "==",
      ["get", "stationId"],
      selectedStationId ?? "",
    ]);
  }
}

/**
 * Which stations the hover layers may draw. A selected station keeps its
 * selection ring instead of a hover ring, as on the System Map. The hovered
 * name's copy draws only when the station's own name lost a collision; it
 * stays on the last such station so it can fade out. How strongly each draws
 * is the eased `hover` feature state (`createGeographicStationHoverAnimator`).
 */
export function updateGeographicStationHover(
  map: MapLibreMap,
  hoveredStationId: string | null,
  selectedStationId: string | null,
  options: { nameDrawn?: boolean } = {},
): void {
  if (map.getLayer("transit-station-hover")) {
    map.setFilter("transit-station-hover", ["!=", ["get", "stationId"], selectedStationId ?? ""]);
  }
  if (hoveredStationId && map.getLayer("transit-station-labels-hover")) {
    map.setFilter("transit-station-labels-hover", [
      "==",
      ["get", "stationId"],
      options.nameDrawn === false ? hoveredStationId : "",
    ]);
  }
}

/** Station hover eases in and out over this long, like the System Map's (station-markers.css). */
export const GEOGRAPHIC_STATION_HOVER_EASE_MS = 120;

type StationHoverTween = { from: number; to: number; start: number };

/**
 * Eases each station's `hover` feature state (0 to 1) toward its target, so
 * the ring and the name's glow fade in and out. MapLibre applies feature
 * state at once, without paint transitions, so the steps are driven here.
 */
export function createGeographicStationHoverAnimator(
  map: Pick<MapLibreMap, "setFeatureState" | "getSource">,
  options: {
    reducedMotion: () => boolean;
    now?: () => number;
    requestFrame?: (callback: (time: number) => void) => number;
    cancelFrame?: (handle: number) => void;
  },
) {
  const now = options.now ?? (() => performance.now());
  const requestFrame = options.requestFrame ?? ((callback) => window.requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? ((handle) => window.cancelAnimationFrame(handle));
  const values = new Map<string, number>();
  const tweens = new Map<string, StationHoverTween>();
  let frame: number | null = null;
  let hovered: string | null = null;

  const write = (stationId: string, value: number) => {
    values.set(stationId, value);
    if (map.getSource("transit-stations")) {
      map.setFeatureState({ source: "transit-stations", id: stationId }, { hover: value });
    }
  };
  const step = () => {
    frame = null;
    const time = now();
    for (const [stationId, tween] of tweens) {
      const progress = Math.min(1, (time - tween.start) / GEOGRAPHIC_STATION_HOVER_EASE_MS);
      const eased = progress * progress * (3 - 2 * progress);
      write(stationId, tween.from + (tween.to - tween.from) * eased);
      if (progress >= 1) tweens.delete(stationId);
    }
    if (tweens.size > 0) frame = requestFrame(step);
  };
  const target = (stationId: string, to: number) => {
    const from = values.get(stationId) ?? 0;
    if (options.reducedMotion()) {
      tweens.delete(stationId);
      write(stationId, to);
      return;
    }
    if (from === to && !tweens.has(stationId)) return;
    tweens.set(stationId, { from, to, start: now() });
    if (frame === null) frame = requestFrame(step);
  };

  return {
    setHovered(stationId: string | null) {
      if (stationId === hovered) return;
      if (hovered) target(hovered, 0);
      hovered = stationId;
      if (stationId) target(stationId, 1);
    },
    /** After a style reload, which drops feature state. */
    reset() {
      if (frame !== null) cancelFrame(frame);
      frame = null;
      tweens.clear();
      values.clear();
      hovered = null;
    },
    dispose() {
      if (frame !== null) cancelFrame(frame);
      frame = null;
      tweens.clear();
    },
  };
}

export function updateGeographicImpactSelection(
  map: MapLibreMap,
  selection: { kind: string; id: string } | null,
  plannedClosures?: PlannedClosure[],
): void {
  const selectedPlannedClosure = selection?.kind === "planned-closure"
    ? plannedClosures?.find((closure) => closure.id === selection.id)
    : undefined;
  const plannedStationIds = selectedPlannedClosure?.previewStationIds ?? [];

  if (map.getLayer("transit-planned-station-selection")) {
    map.setFilter(
      "transit-planned-station-selection",
      plannedStationIds.length > 0
        ? ["in", ["get", "stationId"], ["literal", plannedStationIds]]
        : ["==", ["get", "stationId"], ""],
    );
    setTransitPaintProperty(map,
      "transit-planned-station-selection",
      "circle-stroke-color",
      selectedPlannedClosure?.activeNow ? "#ef4444" : "#3b82f6",
    );
  }

  const selectionId = selection?.id ?? null;
  for (const layerId of ["transit-impacts-selection-glow", "transit-impacts-selection"]) {
    if (!map.getLayer(layerId)) continue;
    map.setFilter(
      layerId,
      selectionId
        ? ["in", selectionId, ["get", "allCardIds"]]
        : ["==", ["get", "impactCardId"], ""],
    );
  }

  if (map.getLayer("transit-station-impacts-selection")) {
    map.setFilter(
      "transit-station-impacts-selection",
      selectionId
        ? ["in", selectionId, ["get", "allCardIds"]]
        : ["==", ["get", "cardId"], ""],
    );
  }
}

export function updateGeographicSelectionStyling(
  map: MapLibreMap,
  state: GeographicSelectionStylingState,
): void {
  updateGeographicStationSelection(map, state.selectedStationId ?? null);
  updateGeographicImpactSelection(map, state.selection ?? null, state.plannedClosures);
}

export function applyGeographicDynamicState(
  map: MapLibreMap,
  state: GeographicMapDynamicState,
): void {
  updateGeographicDynamicSources(map, state.overlayData);
  updateGeographicLineFilter(map, state.activeFilteredLine ?? null);
  updateGeographicSelectionStyling(map, {
    selectedStationId: state.selectedStationId,
    selection: state.selection,
    plannedClosures: state.plannedClosures,
  });
}

export function applyDynamicDataAndFilters(
  map: MapLibreMap,
  overlay: GeographicDynamicSourcesData,
  activeLine: string | null = null,
  stationId: string | null = null,
  selectionId: string | null = null,
  plannedClosures?: PlannedClosure[],
): void {
  applyGeographicDynamicState(map, {
    overlayData: overlay,
    activeFilteredLine: activeLine,
    selectedStationId: stationId,
    selection: selectionId ? { kind: "selection", id: selectionId } : null,
    plannedClosures,
  });
}

/**
 * Where Map View shows estimated train markers, and the glyph's body length
 * (CSS px) by zoom.
 */
export function estimatedTrainMarkerZoomRange(network: "ttc" | "regional"): {
  minZoom: number;
  lengths: Array<[number, number]>;
} {
  return network === "regional"
    ? { minZoom: 8, lengths: [[8, 22], [10.5, 26], [13, 34], [16, 42]] }
    : { minZoom: 10.5, lengths: [[10.5, 22], [12, 26], [14, 34], [17, 42]] };
}

/**
 * Body lengths (CSS px) the glyph is drawn at. Each is used from the zoom
 * where the marker reaches it, so an image is never shrunk below ~75% of its
 * drawn size (MapLibre does not mipmap icons; shrinking much more looks grainy).
 */
export const TRAIN_MARKER_IMAGE_LENGTHS = [26, 34, 42] as const;
const trainImagePrefix = "train-marker:";

/** The zoom where the marker's body reaches `length` px. */
function zoomForTrainLength(lengths: Array<[number, number]>, length: number): number {
  for (let index = 1; index < lengths.length; index += 1) {
    const [z0, l0] = lengths[index - 1];
    const [z1, l1] = lengths[index];
    if (length <= l1) return z0 + ((length - l0) / (l1 - l0)) * (z1 - z0);
  }
  return lengths[lengths.length - 1][0];
}

export function trainMarkerImageExpression(lengths: Array<[number, number]>): ExpressionSpecification {
  const image = (length: number) => ["concat", trainImagePrefix, ["get", "lineId"], `@${length}`];
  const [first, ...rest] = TRAIN_MARKER_IMAGE_LENGTHS;
  const stops = rest.flatMap((length, index) => [
    zoomForTrainLength(lengths, TRAIN_MARKER_IMAGE_LENGTHS[index]), image(length),
  ]);
  return ["step", ["zoom"], image(first), ...stops] as ExpressionSpecification;
}

/** Scales each image from the marker's length at that zoom (1 at its own length). */
export function trainMarkerIconSizeExpression(lengths: Array<[number, number]>): ExpressionSpecification {
  const length = (zoom: number) => {
    if (zoom <= lengths[0][0]) return lengths[0][1];
    for (let index = 1; index < lengths.length; index += 1) {
      const [z0, l0] = lengths[index - 1];
      const [z1, l1] = lengths[index];
      if (zoom <= z1) return l0 + ((zoom - z0) / (z1 - z0)) * (l1 - l0);
    }
    return lengths[lengths.length - 1][1];
  };
  const imageAt = (zoom: number) => TRAIN_MARKER_IMAGE_LENGTHS.find((size, index) => (
    index === TRAIN_MARKER_IMAGE_LENGTHS.length - 1
    || zoom < zoomForTrainLength(lengths, size)
  ))!;
  const switches = TRAIN_MARKER_IMAGE_LENGTHS.slice(0, -1).map((size) => zoomForTrainLength(lengths, size));
  const zooms = [...new Set([...lengths.map(([zoom]) => zoom), ...switches])].sort((a, b) => a - b);
  const stops: number[] = [];
  for (const zoom of zooms) {
    // Just before an image switch, the smaller image is at full size.
    if (switches.includes(zoom)) stops.push(zoom - 0.001, length(zoom) / imageAt(zoom - 0.001));
    stops.push(zoom, length(zoom) / imageAt(zoom));
  }
  return ["interpolate", ["linear"], ["zoom"], ...stops] as ExpressionSpecification;
}

/**
 * Adds (or redraws, after a theme change) the train glyph for each line, in
 * the train-markers.css paint. Skipped without a DOM (unit tests).
 */
export function registerTrainMarkerImages(map: MapLibreMap, lineIds: string[]) {
  const host = typeof map.getContainer === "function" ? map.getContainer() : null;
  if (!host || typeof window === "undefined") return;
  const art = readTrainMarkerPaint(host, lineIds, ALL_LINE_COLORS);
  if (!art) return;
  const pixelRatio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  for (const [lineId, color] of art.colors) {
    for (const length of TRAIN_MARKER_IMAGE_LENGTHS) {
      const data = drawTrainMarkerImage(color, art.paint, length, pixelRatio);
      if (!data) return;
      const id = `${trainImagePrefix}${lineId}@${length}`;
      if (map.hasImage(id)) map.updateImage(id, data);
      else map.addImage(id, data, { pixelRatio });
    }
  }
}

export function installTransitLayers(
  map: MapLibreMap,
  activeCatalog: GeographicCatalog,
  network: "ttc" | "regional",
  dark: boolean,
  highContrast: boolean,
  initialData?: InstallTransitLayersInitialData,
): void {
  const { links, stations: catalogStations } = partitionCatalogFeatures(activeCatalog);
  // Each name's side of its station, clear of the lines leaving it.
  const labelPlacements = stationLabelPlacements(activeCatalog);
  const stations = {
    ...catalogStations,
    features: catalogStations.features.map((station) => {
      const placements = labelPlacements.get(station.properties.stationId) ?? [DEFAULT_STATION_LABEL_PLACEMENT];
      return {
        ...station,
        properties: {
          ...station.properties,
          labelAnchor: placements[0].anchor,
          labelOffset: placements[0].offset,
          labelPlacements: variableAnchorOffset(placements),
        },
      };
    }),
  };

  // 1. Static Links Source
  if (map.getSource("transit-links")) {
    (map.getSource("transit-links") as GeoJSONSource).setData(links);
  } else {
    map.addSource("transit-links", { type: "geojson", data: links });
  }

  // 2. Static Stations Source
  if (map.getSource("transit-stations")) {
    (map.getSource("transit-stations") as GeoJSONSource).setData(stations);
  } else {
    // Hover is feature state on the placed name (promoteId names each station).
    map.addSource("transit-stations", { type: "geojson", data: stations, promoteId: "stationId" });
  }

  const lineBreadcrumbs = projectGeographicLineBreadcrumbs(activeCatalog);
  if (map.getSource("transit-line-breadcrumbs")) {
    (map.getSource("transit-line-breadcrumbs") as GeoJSONSource).setData(lineBreadcrumbs);
  } else {
    map.addSource("transit-line-breadcrumbs", { type: "geojson", data: lineBreadcrumbs });
  }

  const lineBadges = projectGeographicLineBadges(activeCatalog);
  if (map.getSource("transit-line-badges")) {
    (map.getSource("transit-line-badges") as GeoJSONSource).setData(lineBadges);
  } else {
    map.addSource("transit-line-badges", { type: "geojson", data: lineBadges });
  }

  // 3. Dynamic Sources - install with empty or initial data
  const initialOverlay = initialData?.overlayData;

  const dynamicSources: Array<{
    id: string;
    data: GeoJSON.FeatureCollection;
  }> = [
    { id: "transit-impacts", data: initialOverlay?.impactedLinks ?? EMPTY_GEOJSON_FEATURE_COLLECTION },
    { id: "transit-impact-stations", data: initialOverlay?.impactedStations ?? EMPTY_GEOJSON_FEATURE_COLLECTION },
    { id: "transit-impact-badges", data: initialOverlay?.impactBadges ?? EMPTY_GEOJSON_FEATURE_COLLECTION },
    { id: "transit-commute-links", data: initialOverlay?.commuteLinks ?? EMPTY_GEOJSON_FEATURE_COLLECTION },
    { id: "transit-commute-stations", data: initialOverlay?.commuteStations ?? EMPTY_GEOJSON_FEATURE_COLLECTION },
    { id: "transit-impact-arrows", data: initialOverlay?.impactArrows ?? EMPTY_GEOJSON_FEATURE_COLLECTION },
    { id: "transit-train-markers", data: initialOverlay?.trainMarkers ?? EMPTY_GEOJSON_FEATURE_COLLECTION },
  ];

  for (const source of dynamicSources) {
    if (map.getSource(source.id)) {
      if (initialOverlay) {
        (map.getSource(source.id) as GeoJSONSource).setData(source.data);
      }
    } else {
      map.addSource(source.id, { type: "geojson", data: source.data });
    }
  }

  if (initialOverlay?.impactBadges) {
    ensureBadgeImages(
      map,
      initialOverlay.impactBadges.features as GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>[],
    );
  }

  // Register image sprites (chevrons, arrows, and line badges)
  registerMapImages(map);

  // Match expression for route line colors across both networks
  const routeColorExpr = [
    "match",
    ["get", "lineId"],
    ...Object.entries(ALL_LINE_COLORS).flat(),
    "#888888",
  ] as unknown as ExpressionSpecification;

  // Match expression for station stroke colors
  const stationStrokeColorExpr = [
    "match",
    ["at", 0, ["get", "lineIds"]],
    ...Object.entries(ALL_LINE_COLORS).flat(),
    "#475569",
  ] as unknown as ExpressionSpecification;

  // UP and KI drawn either side of their shared track (map-line-badges.ts),
  // which their breadcrumbs follow.
  const routeOffsetExpr = (
    network === "regional"
      ? [
          "interpolate",
          ["linear"],
          ["zoom"],
          ...GEOGRAPHIC_ROUTE_OFFSET_STOPS.flatMap(([zoom, pixels]) => [
            zoom,
            pixels === 0
              ? 0
              : ["match", ["get", "lineId"], ...Object.entries(GEOGRAPHIC_ROUTE_OFFSET_SIDES).flatMap(([lineId, side]) => [lineId, side * pixels]), 0],
          ]),
        ]
      : 0
  ) as unknown as ExpressionSpecification;

  // --- LAYER 1: Base route casing line layer ---
  if (!map.getLayer("transit-routes-casing")) {
    map.addLayer({
      id: "transit-routes-casing",
      type: "line",
      source: "transit-links",
      paint: {
        "line-color": dark ? "#000000" : "#ffffff",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          3.5,
          14,
          7.5,
          17,
          11.5,
        ],
        "line-opacity": highContrast ? 1.0 : 0.85,
        "line-offset": routeOffsetExpr,
      },
    });
  }

  // --- LAYER 2: Color-coded transit routes ---
  if (!map.getLayer("transit-routes")) {
    map.addLayer({
      id: "transit-routes",
      type: "line",
      source: "transit-links",
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": routeColorExpr,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          2.2,
          14,
          5.0,
          17,
          8.0,
        ],
        "line-offset": routeOffsetExpr,
        "line-opacity": initialData?.activeFilteredLine
          ? ["case", ["==", ["get", "lineId"], initialData.activeFilteredLine], 1.0, 0.2]
          : 1.0,
      },
    });
  }

  // --- LAYER 3: Commute path highlight stroke ---
  if (!map.getLayer("transit-commute-line")) {
    map.addLayer({
      id: "transit-commute-line",
      type: "line",
      source: "transit-commute-links",
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#38bdf8",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          5.5,
          14,
          9.0,
          17,
          14.0,
        ],
        "line-opacity": 0.85,
      },
    });
  }

  // --- LAYER 4: Impacted segments wide glow casing ---
  if (!map.getLayer("transit-impacts-casing")) {
    map.addLayer({
      id: "transit-impacts-casing",
      type: "line",
      source: "transit-impacts",
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": ["get", "impactColor"],
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          6.0,
          14,
          11.0,
          17,
          16.0,
        ],
        "line-opacity": 0.35,
        "line-offset": routeOffsetExpr,
      },
    });
  }

  // --- LAYER 5: Selection glow and band for the selected impact ---
  const selectedImpactId = initialData?.selection?.id ?? initialData?.selectionId;
  if (!map.getLayer("transit-impacts-selection-glow")) {
    map.addLayer({
      id: "transit-impacts-selection-glow",
      type: "line",
      source: "transit-impacts",
      filter: selectedImpactId
        ? ["in", selectedImpactId, ["get", "allCardIds"]]
        : ["==", ["get", "impactCardId"], ""],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#0ea5e9",
        "line-width": geographicSelectionWidthExpression(GEOGRAPHIC_SELECTION_GLOW_WIDTHS),
        "line-blur": geographicSelectionWidthExpression(GEOGRAPHIC_SELECTION_GLOW_WIDTHS, 0.45),
        "line-opacity": GEOGRAPHIC_SELECTION_GLOW_OPACITY,
        "line-offset": routeOffsetExpr,
      },
    });
  }
  if (!map.getLayer("transit-impacts-selection")) {
    const selId = selectedImpactId;
    map.addLayer({
      id: "transit-impacts-selection",
      type: "line",
      source: "transit-impacts",
      filter: selId
        ? ["in", selId, ["get", "allCardIds"]]
        : ["==", ["get", "impactCardId"], ""],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#38bdf8",
        "line-width": geographicSelectionWidthExpression(GEOGRAPHIC_SELECTION_BAND_WIDTHS),
        "line-opacity": 0.9,
        "line-offset": routeOffsetExpr,
      },
    });
  }

  // Hover keylines sit below severity rail
  for (const [id, color, widths] of [
    ["transit-impacts-hover-edge", "#f8fafc", [9.2, 12.5, 15.5]],
    ["transit-impacts-hover-core", "#0f172a", [8.0, 11.0, 14.0]],
  ] as const) {
    if (map.getLayer(id)) continue;
    map.addLayer({
      id,
      type: "line",
      source: "transit-impacts",
      filter: ["==", ["get", "segmentId"], ""],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": color,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, widths[0], 14, widths[1], 17, widths[2]],
        "line-offset": routeOffsetExpr,
      },
    });
  }

  // --- LAYER 6: Impacted segments main overlay line ---
  if (!map.getLayer("transit-impacts-line")) {
    map.addLayer({
      id: "transit-impacts-line",
      type: "line",
      source: "transit-impacts",
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": ["get", "impactColor"],
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          3.2,
          14,
          6.5,
          17,
          9.5,
        ],
        "line-dasharray": [
          "case",
          ["get", "isDashed"],
          ["literal", [2.5, 1.8]],
          ["literal", [1, 0]],
        ],
        "line-offset": routeOffsetExpr,
      },
    });
  }

  // --- LAYER 6b: Impact Direction Arrow Contrast Casing ---
  if (!map.getLayer("transit-impact-arrows-casing")) {
    map.addLayer({
      id: "transit-impact-arrows-casing",
      type: "symbol",
      source: "transit-impact-arrows",
      minzoom: 10.5,
      layout: {
        "icon-image": ["coalesce", ["get", "iconImage"], "direction-arrow"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 10.5, 0.82, 14, 1.08, 17, 1.32],
        "icon-rotate": ["get", "bearing"],
        "icon-rotation-alignment": "map",
        "icon-pitch-alignment": "map",
        "icon-keep-upright": false,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-color": highContrast ? "#0f172a" : ["coalesce", ["get", "casingColor"], "#0f172a"],
        "icon-opacity": initialData?.activeFilteredLine
          ? ["case", ["==", ["get", "lineId"], initialData.activeFilteredLine], 0.98, 0.2]
          : 0.98,
      },
    });
  }

  // --- LAYER 6c: Impact Direction Arrows ---
  if (!map.getLayer("transit-impact-arrows")) {
    map.addLayer({
      id: "transit-impact-arrows",
      type: "symbol",
      source: "transit-impact-arrows",
      minzoom: 10.5,
      layout: {
        "icon-image": ["coalesce", ["get", "iconImage"], "direction-arrow"],
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10.5,
          0.7,
          14,
          0.8,
          17,
          1.05,
        ],
        "icon-rotate": ["get", "bearing"],
        "icon-rotation-alignment": "map",
        "icon-pitch-alignment": "map",
        "icon-keep-upright": false,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-color": highContrast ? "#ffffff" : ["coalesce", ["get", "coreColor"], "#ffffff"],
        "icon-opacity": initialData?.activeFilteredLine
          ? [
              "case",
              ["==", ["get", "lineId"], initialData.activeFilteredLine],
              ["case", ["get", "isSelected"], 1.0, 0.85],
              0.2,
            ]
          : ["case", ["get", "isSelected"], 1.0, 0.85],
      },
    });
  }

  // --- LAYER 7: Station outer circle ring ---
  if (!map.getLayer("transit-stations-outer")) {
    map.addLayer({
      id: "transit-stations-outer",
      type: "circle",
      source: "transit-stations",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          network === "regional" ? 3.0 : 2.5,
          12,
          network === "regional" ? 4.5 : 4.0,
          15,
          network === "regional" ? 7.5 : 6.5,
        ],
        "circle-color": dark ? "#0f172a" : "#ffffff",
        "circle-stroke-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          1.2,
          14,
          2.5,
          17,
          3.5,
        ],
        "circle-stroke-color": stationStrokeColorExpr,
        "circle-opacity": initialData?.activeFilteredLine
          ? ["case", ["in", initialData.activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
          : 1.0,
        "circle-stroke-opacity": initialData?.activeFilteredLine
          ? ["case", ["in", initialData.activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
          : 1.0,
      },
    });
  }

  // --- LAYER 8: Station inner dot ---
  if (!map.getLayer("transit-stations-inner")) {
    map.addLayer({
      id: "transit-stations-inner",
      type: "circle",
      source: "transit-stations",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          1.2,
          14,
          2.8,
          17,
          4.2,
        ],
        "circle-color": dark ? "#ffffff" : "#0f172a",
        "circle-opacity": initialData?.activeFilteredLine
          ? ["case", ["in", initialData.activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
          : 1.0,
      },
    });
  }

  // --- LAYER 8b: Station hover ring (under the station marker, as on the System Map) ---
  if (!map.getLayer("transit-station-hover")) {
    map.addLayer({
      id: "transit-station-hover",
      type: "circle",
      source: "transit-stations",
      // Drawn for every station but the selected one; the eased hover state
      // fades the ring in and grows its stroke, as on the System Map.
      filter: ["!=", ["get", "stationId"], initialData?.selectedStationId ?? ""],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 6.5, 12, 8.5, 15, 12.5, 17, 15],
        "circle-color": GEOGRAPHIC_STATION_HOVER_FILL,
        "circle-opacity": STATION_HOVER_AMOUNT,
        "circle-stroke-width": ["*", 2.5, STATION_HOVER_AMOUNT],
        "circle-stroke-color": GEOGRAPHIC_STATION_HOVER_ACCENT,
        "circle-stroke-opacity": ["*", 0.95, STATION_HOVER_AMOUNT],
      },
    }, "transit-stations-outer");
  }

  // --- LAYER 8c: Station pointer target, a little larger than the marker ---
  if (!map.getLayer("transit-stations-hit")) {
    map.addLayer({
      id: "transit-stations-hit",
      type: "circle",
      source: "transit-stations",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 7, 12, 9, 15, 12, 17, 14],
        "circle-color": "#000000",
        "circle-opacity": 0,
        "circle-stroke-width": 0,
      },
    });
  }

  // --- LAYER 9: Station node impact selection halo ---
  if (!map.getLayer("transit-station-impacts-selection")) {
    const selId = initialData?.selection?.id ?? initialData?.selectionId;
    map.addLayer({
      id: "transit-station-impacts-selection",
      type: "circle",
      source: "transit-impact-stations",
      filter: selId
        ? ["in", selId, ["get", "allCardIds"]]
        : ["==", ["get", "cardId"], ""],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          9.0,
          14,
          15.0,
          17,
          22.0,
        ],
        "circle-color": "transparent",
        "circle-stroke-width": 4,
        "circle-stroke-color": "#38bdf8",
        "circle-stroke-opacity": 0.95,
      },
    });
  }

  // --- LAYER 10: Station node impact indicator rings ---
  if (!map.getLayer("transit-station-impacts")) {
    map.addLayer({
      id: "transit-station-impacts",
      type: "circle",
      source: "transit-impact-stations",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          7.0,
          14,
          12.0,
          17,
          18.0,
        ],
        "circle-color": "transparent",
        "circle-stroke-width": 3,
        "circle-stroke-color": ["get", "impactColor"],
        "circle-stroke-opacity": 0.95,
      },
    });
  }

  if (!map.getLayer("transit-station-impacts-hover")) {
    map.addLayer({
      id: "transit-station-impacts-hover",
      type: "circle",
      source: "transit-impact-stations",
      filter: ["==", ["get", "stationId"], ""],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 9, 14, 16, 17, 23],
        "circle-color": "transparent",
        "circle-stroke-width": 2.5,
        "circle-stroke-color": "#f8fafc",
        "circle-stroke-opacity": 0.95,
      },
    });
  }

  // --- LAYER 10b: Commute origin and destination station rings ---
  if (!map.getLayer("transit-commute-stations")) {
    map.addLayer({
      id: "transit-commute-stations",
      type: "circle",
      source: "transit-commute-stations",
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          8.0,
          14,
          14.0,
          17,
          20.0,
        ],
        "circle-color": "transparent",
        "circle-stroke-width": 3.5,
        "circle-stroke-color": "#38bdf8",
        "circle-stroke-opacity": 0.95,
      },
    });
  }

  // --- LAYER 11: Selected station indicator ring ---
  if (!map.getLayer("transit-station-selection")) {
    map.addLayer({
      id: "transit-station-selection",
      type: "circle",
      source: "transit-stations",
      filter: ["==", ["get", "stationId"], initialData?.selectedStationId ?? ""],
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          7.0,
          14,
          14.0,
          17,
          20.0,
        ],
        "circle-color": "transparent",
        "circle-stroke-width": 3.5,
        "circle-stroke-color": "#38bdf8",
        "circle-stroke-opacity": 0.95,
      },
    });
  }

  if (!map.getLayer("transit-planned-station-selection")) {
    const plannedStationIds = initialData?.plannedClosures && (initialData.selection?.kind === "planned-closure" || initialData.selectionId)
      ? (initialData.plannedClosures.find((c) => c.id === (initialData.selection?.id ?? initialData.selectionId))?.previewStationIds ?? [])
      : [];
    map.addLayer({
      id: "transit-planned-station-selection",
      type: "circle",
      source: "transit-stations",
      filter: plannedStationIds.length > 0
        ? ["in", ["get", "stationId"], ["literal", plannedStationIds]]
        : ["==", ["get", "stationId"], ""],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 10, 14, 17, 17, 24],
        "circle-color": "transparent",
        "circle-stroke-width": 4,
        "circle-stroke-color": "#3b82f6",
        "circle-stroke-opacity": 0.95,
      },
    });
  }

  // The System Map's train glyph, drawn at a few sizes and turned to the
  // heading. GO/UP opens near zoom 9 (the whole region), so its trains show
  // from there; TTC's appear once the city is zoomed in.
  const trainZoom = estimatedTrainMarkerZoomRange(network);
  registerTrainMarkerImages(map, [...new Set(links.features.map((link) => link.properties.lineId))]);

  // --- LAYER 11b: Selected train ring ---
  if (!map.getLayer("transit-train-markers-halo")) {
    map.addLayer({
      id: "transit-train-markers-halo",
      type: "circle",
      source: "transit-train-markers",
      minzoom: trainZoom.minZoom,
      filter: ["==", ["get", "isSelected"], true],
      paint: {
        "circle-radius": [
          "interpolate", ["linear"], ["zoom"],
          ...trainZoom.lengths.flatMap(([zoom, length]) => [zoom, length * 0.62]),
        ],
        "circle-color": "rgba(0, 0, 0, 0)",
        "circle-stroke-width": 3,
        "circle-stroke-color": "#38bdf8",
        "circle-opacity": 1.0,
        "circle-stroke-opacity": initialData?.activeFilteredLine
          ? ["case", ["==", ["get", "lineId"], initialData.activeFilteredLine], 1.0, 0.2]
          : 1.0,
      },
    });
  }

  // --- LAYER 11d: Estimated Train Markers ---
  if (!map.getLayer("transit-train-markers-symbol")) {
    map.addLayer({
      id: "transit-train-markers-symbol",
      type: "symbol",
      source: "transit-train-markers",
      minzoom: trainZoom.minZoom,
      layout: {
        "icon-image": trainMarkerImageExpression(trainZoom.lengths),
        "icon-size": trainMarkerIconSizeExpression(trainZoom.lengths),
        // The glyph points east; bearing is clockwise from north.
        "icon-rotate": ["-", ["get", "bearing"], 90],
        "icon-rotation-alignment": "map",
        "icon-pitch-alignment": "map",
        "icon-keep-upright": false,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-opacity": initialData?.activeFilteredLine
          ? ["case", ["==", ["get", "lineId"], initialData.activeFilteredLine], 1.0, 0.2]
          : 1.0,
      },
    });
  }

  // --- LAYER 11e: Estimated Train Markers Text Label ---
  if (!map.getLayer("transit-train-markers-label")) {
    map.addLayer({
      id: "transit-train-markers-label",
      type: "symbol",
      source: "transit-train-markers",
      minzoom: 13.0,
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          13,
          9.0,
          16,
          11.5,
        ],
        "text-offset": [0, 1.2],
        "text-anchor": "top",
        "text-optional": true,
      },
      paint: {
        "text-color": dark ? "#f8fafc" : "#0f172a",
        "text-halo-color": dark ? "rgba(15, 23, 42, 0.9)" : "rgba(255, 255, 255, 0.9)",
        "text-halo-width": 2,
        "text-opacity": initialData?.activeFilteredLine
          ? ["case", ["==", ["get", "lineId"], initialData.activeFilteredLine], 1.0, 0.2]
          : 1.0,
      },
    });
  }

  // --- LAYER 14: Station Names (progressive zoom reveal) ---
  if (!map.getLayer("transit-station-labels")) {
    map.addLayer({
      id: "transit-station-labels",
      type: "symbol",
      source: "transit-stations",
      minzoom: GEOGRAPHIC_STATION_LABEL_MIN_ZOOM[network],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-size": GEOGRAPHIC_STATION_LABEL_SIZE,
        // Beside the station, clear of its lines; the next placement when an
        // alert badge or another name takes the best one.
        "text-variable-anchor-offset": ["coalesce", ["get", "labelPlacements"], ["literal", ["top", [0, 1.2]]]],
        "text-justify": "auto",
        "text-optional": true,
      },
      paint: {
        "text-color": dark ? "#f8fafc" : "#0f172a",
        // A hovered name glows where it is placed (feature state, set by
        // updateGeographicStationHover).
        "text-halo-color": [
          "interpolate",
          ["linear"],
          STATION_HOVER_AMOUNT,
          0,
          dark ? ["rgba", 15, 23, 42, 0.9] : ["rgba", 255, 255, 255, 0.9],
          1,
          dark ? ["rgba", 56, 189, 248, 0.6] : ["rgba", 56, 189, 248, 0.45],
        ],
        "text-halo-width": ["interpolate", ["linear"], STATION_HOVER_AMOUNT, 0, 2, 1, 3],
        "text-halo-blur": ["interpolate", ["linear"], STATION_HOVER_AMOUNT, 0, 0, 1, 2],
      },
    // Under the train markers (as on the System Map), so a train at a
    // station is never hidden behind its name.
    }, map.getLayer("transit-train-markers-halo") ? "transit-train-markers-halo" : undefined);
  }

  // A hovered station's name when its own name is not drawn (it lost a
  // collision): always drawn, at its best placement, so hovering the dot
  // still says which station a press selects.
  if (!map.getLayer("transit-station-labels-hover")) {
    map.addLayer({
      id: "transit-station-labels-hover",
      type: "symbol",
      source: "transit-stations",
      filter: ["==", ["get", "stationId"], ""],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-size": GEOGRAPHIC_STATION_LABEL_SIZE,
        "text-offset": GEOGRAPHIC_STATION_LABEL_OFFSET,
        "text-anchor": GEOGRAPHIC_STATION_LABEL_ANCHOR,
        "text-justify": "auto",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": dark ? "#f8fafc" : "#0f172a",
        "text-halo-color": GEOGRAPHIC_STATION_LABEL_HOVER_HALO[dark ? "dark" : "light"],
        "text-opacity": STATION_HOVER_AMOUNT,
        "text-halo-width": 3,
        "text-halo-blur": 2,
      },
    }, map.getLayer("transit-train-markers-halo") ? "transit-train-markers-halo" : undefined);
  }

  // Line breadcrumbs: each line's badge at even distances along it, so a long
  // line (or two side by side, as KI and UP) can be followed. The points are
  // placed ahead of time, one set per zoom level (map-line-badges.ts), and
  // always drawn, so collisions never thin them unevenly; they sit under the
  // station markers and names.
  if (!map.getLayer("transit-line-breadcrumbs")) {
    map.addLayer({
      id: "transit-line-breadcrumbs",
      type: "symbol",
      source: "transit-line-breadcrumbs",
      minzoom: GEOGRAPHIC_LINE_BREADCRUMB_MIN_ZOOM,
      filter: lineBreadcrumbLevelFilter(),
      layout: {
        "icon-image": lineBreadcrumbSpriteExpression(network),
        "icon-size": 0.72,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-opacity": lineBreadcrumbOpacityExpression(initialData?.activeFilteredLine ?? null),
      },
    }, map.getLayer("transit-stations-outer") ? "transit-stations-outer" : undefined);
  }

  // Decorative route identifiers
  if (!map.getLayer("transit-line-badges")) {
    map.addLayer({
      id: "transit-line-badges",
      type: "symbol",
      source: "transit-line-badges",
      maxzoom: GEOGRAPHIC_LINE_BADGE_HIDDEN_ZOOM,
      layout: {
        "icon-image": ["get", "spriteId"],
        "icon-size": 1,
        "icon-offset": ["get", "offset"],
        "icon-allow-overlap": false,
        "icon-ignore-placement": false,
        "icon-padding": 3,
      },
      paint: {
        "icon-opacity": lineBadgeOpacityExpression(initialData?.activeFilteredLine ?? null),
      },
    });
  }

  // --- LAYER 15: Disruption Overlap Badges ---
  if (!map.getLayer("transit-impact-badges")) {
    map.addLayer({
      id: "transit-impact-badges",
      type: "symbol",
      source: "transit-impact-badges",
      layout: {
        "icon-image": ["get", "badgeImageKey"],
        "icon-size": 1,
        "icon-allow-overlap": true,
        // Badges always draw, and station names keep clear of them.
        "icon-ignore-placement": false,
      },
    });
  }
  if (map.getLayer("transit-impact-badges")) map.moveLayer("transit-impact-badges");

  if (initialData?.overlayData) {
    applyGeographicDynamicState(map, {
      overlayData: initialData.overlayData,
      activeFilteredLine: initialData.activeFilteredLine,
      selectedStationId: initialData.selectedStationId,
      selection: initialData.selection ?? (initialData.selectionId ? { kind: "selection", id: initialData.selectionId } : null),
      plannedClosures: initialData.plannedClosures,
    });
  }
  // Streetcars, once their catalog has loaded (the map loads it on the TTC network).
  const streetcars = network === "ttc" ? cachedStreetcarCatalog() : null;
  if (streetcars) {
    installStreetcarLayers(map, streetcars, { dark, activeFilteredLine: initialData?.activeFilteredLine ?? null });
  }
  installTransitOpacity(map);
}

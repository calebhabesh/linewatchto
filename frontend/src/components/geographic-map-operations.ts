import type { Map as MapLibreMap, GeoJSONSource, ExpressionSpecification } from "maplibre-gl";
import { createSdfImageData } from "./map-sprite-sdf.ts";
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
} from "../app/map-line-badges.ts";
import { ALL_LINE_COLORS } from "../app/geographic-config.ts";
import { REGIONAL_ROUTE_DEFINITIONS } from "../app/regional-data.ts";
import type { PlannedClosure } from "../app/linewatch-data.ts";
import { recordGeographicMapLifecycle } from "../app/geographic-lifecycle.ts";
import { installTransitOpacity, setTransitPaintProperty } from "./geographic-network-transition.ts";

export const EMPTY_GEOJSON_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

export interface GeographicDynamicSourcesData {
  impactedLinks: GeoJSON.FeatureCollection;
  impactedStations: GeoJSON.FeatureCollection;
  impactBadges: GeoJSON.FeatureCollection;
  impactArrows: GeoJSON.FeatureCollection;
  trainMarkers: GeoJSON.FeatureCollection;
  commuteLinks: GeoJSON.FeatureCollection;
  commuteStations: GeoJSON.FeatureCollection;
}

export interface GeographicSelectionStylingState {
  selectedStationId?: string | null;
  selection?: { kind: string; id: string } | null;
  plannedClosures?: PlannedClosure[];
}

export interface GeographicMapDynamicState {
  overlayData: GeographicDynamicSourcesData;
  activeFilteredLine?: string | null;
  selectedStationId?: string | null;
  selection?: { kind: string; id: string } | null;
  plannedClosures?: PlannedClosure[];
}

export interface InstallTransitLayersInitialData {
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

export function registerMapImages(map: MapLibreMap): void {
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

  if (map.hasImage && !map.hasImage("train-arrow")) {
    try {
      const size = 72;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(3, 3);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(12, 4);
        ctx.lineTo(19, 18);
        ctx.lineTo(12, 14);
        ctx.lineTo(5, 18);
        ctx.closePath();
        ctx.fill();
        const imgData = ctx.getImageData(0, 0, size, size);
        map.addImage("train-arrow", createSdfImageData(imgData), { sdf: true, pixelRatio: 3 });
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

  if (map.getLayer("transit-train-markers-body")) {
    setTransitPaintProperty(map,
      "transit-train-markers-body",
      "circle-opacity",
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
  if (map.getLayer("transit-impacts-selection")) {
    map.setFilter(
      "transit-impacts-selection",
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

export function installTransitLayers(
  map: MapLibreMap,
  activeCatalog: GeographicCatalog,
  network: "ttc" | "regional",
  dark: boolean,
  highContrast: boolean,
  initialData?: InstallTransitLayersInitialData,
): void {
  const { links, stations } = partitionCatalogFeatures(activeCatalog);

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
    map.addSource("transit-stations", { type: "geojson", data: stations });
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

  // Parallel offset expression to visually separate UP Express and Kitchener Line along shared tracks
  const routeOffsetExpr = (
    network === "regional"
      ? [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          0,
          13,
          ["match", ["get", "lineId"], "regional-up", 3, "regional-ki", -3, 0],
          16,
          ["match", ["get", "lineId"], "regional-up", 5, "regional-ki", -5, 0],
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

  // --- LAYER 5: Selection halo for selected impact ---
  if (!map.getLayer("transit-impacts-selection")) {
    const selId = initialData?.selection?.id ?? initialData?.selectionId;
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
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          7.5,
          14,
          13.0,
          17,
          18.0,
        ],
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

  // --- LAYER 11b: Estimated Train Markers Halo ---
  if (!map.getLayer("transit-train-markers-halo")) {
    map.addLayer({
      id: "transit-train-markers-halo",
      type: "circle",
      source: "transit-train-markers",
      minzoom: 10.5,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10.5,
          4.8,
          14,
          8.8,
          17,
          12.8,
        ],
        "circle-color": dark ? "#0f172a" : "#ffffff",
        "circle-stroke-width": ["case", ["get", "isSelected"], 3, 1.5],
        "circle-stroke-color": ["case", ["get", "isSelected"], "#38bdf8", dark ? "#334155" : "#94a3b8"],
        "circle-opacity": initialData?.activeFilteredLine
          ? ["case", ["==", ["get", "lineId"], initialData.activeFilteredLine], 1.0, 0.2]
          : 1.0,
        "circle-stroke-opacity": initialData?.activeFilteredLine
          ? ["case", ["==", ["get", "lineId"], initialData.activeFilteredLine], 1.0, 0.2]
          : 1.0,
      },
    });
  }

  // --- LAYER 11c: Estimated Train Markers Body ---
  if (!map.getLayer("transit-train-markers-body")) {
    map.addLayer({
      id: "transit-train-markers-body",
      type: "circle",
      source: "transit-train-markers",
      minzoom: 10.5,
      paint: {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10.5,
          3.6,
          14,
          7.1,
          17,
          10.6,
        ],
        "circle-color": ["get", "lineColor"],
        "circle-opacity": initialData?.activeFilteredLine
          ? ["case", ["==", ["get", "lineId"], initialData.activeFilteredLine], 1.0, 0.2]
          : 1.0,
      },
    });
  }

  // --- LAYER 11d: Estimated Train Markers Heading Arrow ---
  if (!map.getLayer("transit-train-markers-symbol")) {
    map.addLayer({
      id: "transit-train-markers-symbol",
      type: "symbol",
      source: "transit-train-markers",
      minzoom: 11.0,
      layout: {
        "icon-image": "train-arrow",
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          11,
          0.53,
          14,
          0.82,
          17,
          1.1,
        ],
        "icon-rotate": ["get", "bearing"],
        "icon-rotation-alignment": "map",
        "icon-pitch-alignment": "map",
        "icon-keep-upright": false,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-color": "#ffffff",
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
      minzoom: network === "regional" ? 10.5 : 12.0,
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10.5,
          9.5,
          13,
          11.5,
          16,
          13.5,
        ],
        "text-offset": [0, 1.2],
        "text-anchor": "top",
        "text-optional": true,
      },
      paint: {
        "text-color": dark ? "#f8fafc" : "#0f172a",
        "text-halo-color": dark ? "rgba(15, 23, 42, 0.9)" : "rgba(255, 255, 255, 0.9)",
        "text-halo-width": 2,
      },
    });
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
        "icon-ignore-placement": true,
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
  installTransitOpacity(map);
}

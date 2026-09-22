"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import maplibregl, { type Map as MapLibreMap, type ExpressionSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { AlertCircle, RefreshCw, Layers, Locate, ZoomIn, ZoomOut } from "lucide-react";
import type { GeographicCatalog } from "../app/geographic-catalog";
import { REGIONAL_ROUTE_DEFINITIONS, type NetworkId } from "../app/regional-data";
import type { MapViewPreference } from "../app/visual-preferences";
import type {
  ActiveAlert,
  ImpactSelection,
  MapImpact,
  MapImpactKind,
  NetworkSegment,
  PlannedClosure,
  StationNodeImpact,
} from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/account-data";
import { useOptionalDashboardData } from "../app/DataContext";
import { NetworkSelector } from "./NetworkSelector";
import { MapViewSelector } from "./MapViewSelector";
import {
  partitionCatalogFeatures,
  getStationCoordinates,
  projectImpactedLinks,
  projectImpactedStations,
  projectImpactBadges,
  projectImpactArrows,
  projectEstimatedTrainMarkers,
  projectCommutePreview,
  getProjectedSelectionBounds,
  getProjectedImpactGroup,
  getPointAlongPolyline,
} from "../app/geographic-overlays";
import type { EstimatedTrainMarker } from "../app/train-markers";
import {
  OPENFREEMAP_STYLES,
  GEOGRAPHIC_LOAD_TIMEOUT_MS,
  STATION_FOCUS_ZOOM,
  ALL_LINE_COLORS,
  getCatalogUrl,
  getGeographicBounds,
  getGeographicCenter,
  getGeographicDefaultZoom,
  getGeographicAttribution,
  GEOGRAPHIC_MIN_ZOOM,
  GEOGRAPHIC_MAX_ZOOM,
} from "../app/geographic-config";
import {
  clearGeographicMapViewport,
  readGeographicMapViewport,
  saveGeographicMapViewport,
} from "../app/map-viewport-preference";
import {
  recordGeographicMapLifecycle,
  setGeographicProjectedImpactAnchorResolver,
  setGeographicProjectedSelectionBoundsResolver,
} from "../app/geographic-lifecycle";
import {
  GEOGRAPHIC_LINE_BADGE_FULL_ZOOM,
  GEOGRAPHIC_LINE_BADGE_HALF_ZOOM,
  GEOGRAPHIC_LINE_BADGE_HIDDEN_ZOOM,
  projectGeographicLineBadges,
} from "../app/map-line-badges";
import { MapOverlapChooser, type MapOverlapChooserLayout } from "./MapOverlapChooser";
import {
  generateOverlapBadgeSvg,
  getOverlapBadgeKey,
  parseOverlapBadgeKey,
  createSvgImage,
  MAP_BADGE_PIXEL_RATIO,
} from "./map-overlap-svg";
import { createSdfImageData } from "./map-sprite-sdf";
import { countUniqueImpactsByKind } from "../app/map-alert-selector";
import {
  GeographicSelectionAttention,
  type SelectionAttentionFrame,
} from "../app/geographic-selection-attention";
import {
  observeMapChooserKeepouts,
  visibleMapChooserKeepouts,
} from "./map-chooser-keepouts";
import { readMobileImpactInspectorInset } from "../hooks/mobileMapFrame";

const GEOGRAPHIC_IMPACT_BADGE_MIN_HIT_DIAMETER_PX = 44;

export type GeographicNetworkMapProps = {
  network: NetworkId;
  isDark: boolean;
  highContrast: boolean;
  selectedStationId?: string | null;
  onSelectStationId?: (stationId: string | null) => void;
  selection?: ImpactSelection;
  onSelectImpact?: (selection: ImpactSelection) => void;
  commutePathPreview?: AccountCommutePathPreview | null;
  onClearCommutePathPreview?: () => void;
  filteredLineId?: string | null;
  onFilterLineId?: (lineId: string | null) => void;
  networkSegments?: NetworkSegment[];
  stationNodeImpacts?: StationNodeImpact[];
  activeAlerts?: ActiveAlert[];
  plannedClosures?: PlannedClosure[];
  recenterSignal?: number;
  zoomInSignal?: number;
  zoomOutSignal?: number;
  reducedMotion?: boolean;
  onReady?: () => void;
  onSwitchToDiagram?: () => void;
  isMapActive?: boolean;
  onNetworkChange?: (network: NetworkId) => void;
  mapView?: MapViewPreference;
  onMapViewChange?: (view: MapViewPreference) => void;
  estimatedTrainsEnabled?: boolean;
  estimatedTrainMarkers?: EstimatedTrainMarker[];
  selectionAttentionGeneration?: number;
  mobilePerformanceMode?: boolean;
  layoutResetSignal?: number;
};

const EMPTY_SEGMENTS: NetworkSegment[] = [];
const EMPTY_STATION_IMPACTS: StationNodeImpact[] = [];
const EMPTY_ALERTS: ActiveAlert[] = [];
const EMPTY_PLANNED_CLOSURES: PlannedClosure[] = [];
const EMPTY_TRAIN_MARKERS: EstimatedTrainMarker[] = [];

type GeographicOverlapChooserState = {
  markerId: string;
  targetId: string;
  targetType: "segment" | "station";
  label: string;
  impacts: MapImpact[];
  coordinate: [number, number];
};

type GeographicOverlapChooserLayout = {
  chooserSize: { width: number; height: number };
  layout: MapOverlapChooserLayout;
  viewportSize: { width: number; height: number };
};

type GeographicChooserKeepout = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const GEOGRAPHIC_CHOOSER_MARGIN = 12;
const GEOGRAPHIC_CHOOSER_KEEPOUT_GAP = 8;
const GEOGRAPHIC_CHOOSER_MIN_HEIGHT = 142;
const GEOGRAPHIC_MOBILE_SELECTION_MAX_ZOOM = 14.75;

function geographicMobileSelectionPadding(container: HTMLElement) {
  const containerRect = container.getBoundingClientRect();
  const topChromeBottom = visibleMapChooserKeepouts()
    .filter((element) => element.matches(".mobile-app-topbar, .map-utility-cluster"))
    .map((element) => element.getBoundingClientRect().bottom)
    .filter((bottom) => bottom > containerRect.top && bottom < containerRect.bottom)
    .reduce((bottom, nextBottom) => Math.max(bottom, nextBottom), containerRect.top);

  return {
    top: Math.max(104, Math.ceil(topChromeBottom - containerRect.top + 16)),
    bottom: Math.max(96, Math.ceil(readMobileImpactInspectorInset(container) + 32)),
    left: 72,
    right: 72,
  };
}

function clampGeographicChooserOffset(value: number, length: number, viewportLength: number, margin: number) {
  return Math.min(Math.max(margin, viewportLength - margin - length), Math.max(margin, value));
}

function geographicChooserIntersectsKeepout(
  left: number,
  top: number,
  width: number,
  height: number,
  keepout: GeographicChooserKeepout,
) {
  return left < keepout.right
    && left + width > keepout.left
    && top < keepout.bottom
    && top + height > keepout.top;
}

function chooseGeographicMobileChooserLayout({
  anchor,
  viewportSize,
  requestedSize,
  keepouts,
}: {
  anchor: { x: number; y: number };
  viewportSize: { width: number; height: number };
  requestedSize: { width: number; height: number };
  keepouts: GeographicChooserKeepout[];
}): GeographicOverlapChooserLayout {
  const margin = GEOGRAPHIC_CHOOSER_MARGIN;
  const anchorKeepout = {
    left: anchor.x - 30,
    top: anchor.y - 30,
    right: anchor.x + 30,
    bottom: anchor.y + 30,
  };
  const blocked = [...keepouts, anchorKeepout];
  const heightCandidates: number[] = [];
  for (
    let height = requestedSize.height;
    height > GEOGRAPHIC_CHOOSER_MIN_HEIGHT;
    height -= 4
  ) heightCandidates.push(height);
  heightCandidates.push(Math.min(requestedSize.height, GEOGRAPHIC_CHOOSER_MIN_HEIGHT));

  for (const height of heightCandidates) {
    const xCandidates = [
      margin,
      clampGeographicChooserOffset(anchor.x - requestedSize.width / 2, requestedSize.width, viewportSize.width, margin),
      viewportSize.width - margin - requestedSize.width,
      ...blocked.flatMap((box) => [
        box.right + GEOGRAPHIC_CHOOSER_KEEPOUT_GAP,
        box.left - GEOGRAPHIC_CHOOSER_KEEPOUT_GAP - requestedSize.width,
      ]),
    ].map((left) => clampGeographicChooserOffset(left, requestedSize.width, viewportSize.width, margin));
    const yCandidates = [
      anchor.y - GEOGRAPHIC_CHOOSER_KEEPOUT_GAP - height,
      anchor.y + GEOGRAPHIC_CHOOSER_KEEPOUT_GAP,
      viewportSize.height - margin - height,
      margin,
      ...blocked.flatMap((box) => [
        box.bottom + GEOGRAPHIC_CHOOSER_KEEPOUT_GAP,
        box.top - GEOGRAPHIC_CHOOSER_KEEPOUT_GAP - height,
      ]),
    ].map((top) => clampGeographicChooserOffset(top, height, viewportSize.height, margin));

    const candidates = xCandidates.flatMap((left) => yCandidates.map((top) => ({ left, top })))
      .filter((candidate, index, all) => all.findIndex((other) => (
        Math.abs(other.left - candidate.left) < 0.5 && Math.abs(other.top - candidate.top) < 0.5
      )) === index);
    const bestCandidate = (protectedBoxes: GeographicChooserKeepout[]) => candidates
      .filter(({ left, top }) => protectedBoxes.every((box) => !geographicChooserIntersectsKeepout(
          left,
          top,
          requestedSize.width,
          height,
          box,
        )))
      .reduce<{ left: number; top: number; score: number } | null>((current, candidate) => {
      const centerX = candidate.left + requestedSize.width / 2;
      const centerY = candidate.top + height / 2;
      const score = Math.hypot(centerX - anchor.x, centerY - anchor.y);
      return !current || score < current.score ? { ...candidate, score } : current;
    }, null);
    // Match the system-map priority: first avoid both the alert badge and UI,
    // then permit covering the badge while still treating UI keepouts as hard.
    const best = bestCandidate(blocked) ?? bestCandidate(keepouts);
    if (!best) continue;
    return {
      chooserSize: { width: requestedSize.width, height },
      layout: {
        left: best.left,
        top: best.top,
        anchorOffsetX: anchor.x - best.left,
        anchorOffsetY: anchor.y - best.top,
      },
      viewportSize,
    };
  }

  const height = Math.min(requestedSize.height, Math.max(80, viewportSize.height - margin * 2));
  const left = clampGeographicChooserOffset(
    anchor.x - requestedSize.width / 2,
    requestedSize.width,
    viewportSize.width,
    margin,
  );
  const top = clampGeographicChooserOffset(
    anchor.y - height - GEOGRAPHIC_CHOOSER_KEEPOUT_GAP,
    height,
    viewportSize.height,
    margin,
  );
  return {
    chooserSize: { width: requestedSize.width, height },
    layout: {
      left,
      top,
      anchorOffsetX: anchor.x - left,
      anchorOffsetY: anchor.y - top,
    },
    viewportSize,
  };
}

function ensureBadgeImages(
  map: MapLibreMap | null,
  features: GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>[],
) {
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

function uniqueMapImpacts(impacts: MapImpact[]): MapImpact[] {
  const seen = new Set<string>();
  return impacts.filter((impact) => {
    const key = `${impact.kind}:${impact.cardId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function registerMapImages(map: MapLibreMap) {
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

function lineBadgeOpacityExpression(activeLine: string | null): ExpressionSpecification {
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

function isWebGLSupported(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

function installTransitLayers(
  map: MapLibreMap,
  activeCatalog: GeographicCatalog,
  network: "ttc" | "regional",
  dark: boolean,
  highContrast: boolean,
  initialData: {
    overlayData: {
      impactedLinks: GeoJSON.FeatureCollection;
      impactedStations: GeoJSON.FeatureCollection;
      impactBadges: GeoJSON.FeatureCollection;
      impactArrows: GeoJSON.FeatureCollection;
      trainMarkers: GeoJSON.FeatureCollection;
      commuteLinks: GeoJSON.FeatureCollection;
      commuteStations: GeoJSON.FeatureCollection;
    };
    activeFilteredLine: string | null;
    selectedStationId: string | null;
    selectionId: string | null;
  },
) {
  const { links, stations } = partitionCatalogFeatures(activeCatalog);

  // 1. Static Links Source
  if (map.getSource("transit-links")) {
    (map.getSource("transit-links") as maplibregl.GeoJSONSource).setData(links);
  } else {
    map.addSource("transit-links", { type: "geojson", data: links });
  }

  // 2. Static Stations Source
  if (map.getSource("transit-stations")) {
    (map.getSource("transit-stations") as maplibregl.GeoJSONSource).setData(stations);
  } else {
    map.addSource("transit-stations", { type: "geojson", data: stations });
  }

  const lineBadges = projectGeographicLineBadges(activeCatalog);
  if (map.getSource("transit-line-badges")) {
    (map.getSource("transit-line-badges") as maplibregl.GeoJSONSource).setData(lineBadges);
  } else {
    map.addSource("transit-line-badges", { type: "geojson", data: lineBadges });
  }

  // 3. Impacted Links Source
  if (map.getSource("transit-impacts")) {
    (map.getSource("transit-impacts") as maplibregl.GeoJSONSource).setData(initialData.overlayData.impactedLinks);
  } else {
    map.addSource("transit-impacts", { type: "geojson", data: initialData.overlayData.impactedLinks });
  }

  // 4. Impacted Stations Source
  if (map.getSource("transit-impact-stations")) {
    (map.getSource("transit-impact-stations") as maplibregl.GeoJSONSource).setData(initialData.overlayData.impactedStations);
  } else {
    map.addSource("transit-impact-stations", { type: "geojson", data: initialData.overlayData.impactedStations });
  }

  // 5. Impact Badges Source
  if (map.getSource("transit-impact-badges")) {
    (map.getSource("transit-impact-badges") as maplibregl.GeoJSONSource).setData(initialData.overlayData.impactBadges);
  } else {
    map.addSource("transit-impact-badges", { type: "geojson", data: initialData.overlayData.impactBadges });
  }
  ensureBadgeImages(map, initialData.overlayData.impactBadges.features as GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>[]);

  // 6. Commute Links Source
  if (map.getSource("transit-commute-links")) {
    (map.getSource("transit-commute-links") as maplibregl.GeoJSONSource).setData(initialData.overlayData.commuteLinks);
  } else {
    map.addSource("transit-commute-links", { type: "geojson", data: initialData.overlayData.commuteLinks });
  }

  // 7. Commute Stations Source
  if (map.getSource("transit-commute-stations")) {
    (map.getSource("transit-commute-stations") as maplibregl.GeoJSONSource).setData(initialData.overlayData.commuteStations);
  } else {
    map.addSource("transit-commute-stations", { type: "geojson", data: initialData.overlayData.commuteStations });
  }

  // 8. Impact Direction Arrows Source
  if (map.getSource("transit-impact-arrows")) {
    (map.getSource("transit-impact-arrows") as maplibregl.GeoJSONSource).setData(initialData.overlayData.impactArrows);
  } else {
    map.addSource("transit-impact-arrows", { type: "geojson", data: initialData.overlayData.impactArrows });
  }

  // 9. Estimated Train Markers Source
  if (map.getSource("transit-train-markers")) {
    (map.getSource("transit-train-markers") as maplibregl.GeoJSONSource).setData(initialData.overlayData.trainMarkers);
  } else {
    map.addSource("transit-train-markers", { type: "geojson", data: initialData.overlayData.trainMarkers });
  }

  // Register image sprites (chevrons and arrows)
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
        "line-opacity": initialData.activeFilteredLine
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

  // --- LAYER 5: Selection halo for selected impact (rendered under main line so primary severity remains visible) ---
  if (!map.getLayer("transit-impacts-selection")) {
    map.addLayer({
      id: "transit-impacts-selection",
      type: "line",
      source: "transit-impacts",
      filter: initialData.selectionId
        ? ["in", initialData.selectionId, ["get", "allCardIds"]]
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

  // Hover keylines sit below the severity rail, leaving its color and dash
  // pattern visible while bringing only the pointed segment forward.
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
        "icon-opacity": initialData.activeFilteredLine
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
        "icon-opacity": initialData.activeFilteredLine
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
        "circle-opacity": initialData.activeFilteredLine
          ? ["case", ["in", initialData.activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
          : 1.0,
        "circle-stroke-opacity": initialData.activeFilteredLine
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
        "circle-opacity": initialData.activeFilteredLine
          ? ["case", ["in", initialData.activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
          : 1.0,
      },
    });
  }

  // --- LAYER 9: Station node impact selection halo ---
  if (!map.getLayer("transit-station-impacts-selection")) {
    map.addLayer({
      id: "transit-station-impacts-selection",
      type: "circle",
      source: "transit-impact-stations",
      filter: initialData.selectionId
        ? ["in", initialData.selectionId, ["get", "allCardIds"]]
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

  // --- LAYER 10: Commute origin and destination station rings ---
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
      filter: ["==", ["get", "stationId"], initialData.selectedStationId ?? ""],
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
    map.addLayer({
      id: "transit-planned-station-selection",
      type: "circle",
      source: "transit-stations",
      filter: ["==", ["get", "stationId"], ""],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 10, 14, 17, 17, 24],
        "circle-color": "transparent",
        "circle-stroke-width": 4,
        "circle-stroke-color": "#3b82f6",
        "circle-stroke-opacity": 0.95,
      },
    });
  }

  // --- LAYER 11b: Estimated Train Markers Halo (casing / selection) ---
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
        "circle-opacity": initialData.activeFilteredLine
          ? ["case", ["==", ["get", "lineId"], initialData.activeFilteredLine], 1.0, 0.2]
          : 1.0,
        "circle-stroke-opacity": initialData.activeFilteredLine
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
        "circle-opacity": initialData.activeFilteredLine
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
        "icon-opacity": initialData.activeFilteredLine
          ? ["case", ["==", ["get", "lineId"], initialData.activeFilteredLine], 1.0, 0.2]
          : 1.0,
      },
    });
  }

  // --- LAYER 11e: Estimated Train Markers Text Label (high zoom only) ---
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
        "text-opacity": initialData.activeFilteredLine
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

  // Decorative route identifiers are installed after station labels so they
  // yield collision space to names.
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
        "icon-opacity": lineBadgeOpacityExpression(initialData.activeFilteredLine),
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
}

function applyDynamicDataAndFilters(
  map: MapLibreMap,
  overlay: {
    impactedLinks: GeoJSON.FeatureCollection;
    impactedStations: GeoJSON.FeatureCollection;
    impactBadges: GeoJSON.FeatureCollection;
    impactArrows: GeoJSON.FeatureCollection;
    trainMarkers: GeoJSON.FeatureCollection;
    commuteLinks: GeoJSON.FeatureCollection;
    commuteStations: GeoJSON.FeatureCollection;
  },
  activeLine: string | null,
  stationId: string | null,
  selectionId: string | null,
) {
  const sImpacts = map.getSource("transit-impacts") as maplibregl.GeoJSONSource | undefined;
  if (sImpacts) sImpacts.setData(overlay.impactedLinks);

  const sStations = map.getSource("transit-impact-stations") as maplibregl.GeoJSONSource | undefined;
  if (sStations) sStations.setData(overlay.impactedStations);

  const sBadges = map.getSource("transit-impact-badges") as maplibregl.GeoJSONSource | undefined;
  if (sBadges) {
    ensureBadgeImages(map, overlay.impactBadges.features as GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>[]);
    sBadges.setData(overlay.impactBadges);
  }

  const sArrows = map.getSource("transit-impact-arrows") as maplibregl.GeoJSONSource | undefined;
  if (sArrows) sArrows.setData(overlay.impactArrows);

  const sTrains = map.getSource("transit-train-markers") as maplibregl.GeoJSONSource | undefined;
  if (sTrains) sTrains.setData(overlay.trainMarkers);

  const sCommuteL = map.getSource("transit-commute-links") as maplibregl.GeoJSONSource | undefined;
  if (sCommuteL) sCommuteL.setData(overlay.commuteLinks);

  const sCommuteS = map.getSource("transit-commute-stations") as maplibregl.GeoJSONSource | undefined;
  if (sCommuteS) sCommuteS.setData(overlay.commuteStations);

  if (map.getLayer("transit-routes")) {
    map.setPaintProperty(
      "transit-routes",
      "line-opacity",
      activeLine ? ["case", ["==", ["get", "lineId"], activeLine], 1.0, 0.2] : 1.0,
    );
  }
  if (map.getLayer("transit-line-badges")) {
    map.setPaintProperty(
      "transit-line-badges",
      "icon-opacity",
      lineBadgeOpacityExpression(activeLine),
    );
  }
  if (map.getLayer("transit-stations-outer")) {
    map.setPaintProperty(
      "transit-stations-outer",
      "circle-opacity",
      activeLine ? ["case", ["in", activeLine, ["get", "lineIds"]], 1.0, 0.25] : 1.0,
    );
    map.setPaintProperty(
      "transit-stations-outer",
      "circle-stroke-opacity",
      activeLine ? ["case", ["in", activeLine, ["get", "lineIds"]], 1.0, 0.25] : 1.0,
    );
  }
  if (map.getLayer("transit-stations-inner")) {
    map.setPaintProperty(
      "transit-stations-inner",
      "circle-opacity",
      activeLine ? ["case", ["in", activeLine, ["get", "lineIds"]], 1.0, 0.25] : 1.0,
    );
  }
  if (map.getLayer("transit-impact-arrows")) {
    map.setPaintProperty(
      "transit-impact-arrows",
      "icon-opacity",
      activeLine
        ? [
            "case",
            ["==", ["get", "lineId"], activeLine],
            ["case", ["get", "isSelected"], 1.0, 0.85],
            0.2,
          ]
        : ["case", ["get", "isSelected"], 1.0, 0.85],
    );
  }
  if (map.getLayer("transit-impact-arrows-casing")) {
    map.setPaintProperty(
      "transit-impact-arrows-casing",
      "icon-opacity",
      activeLine ? ["case", ["==", ["get", "lineId"], activeLine], 0.98, 0.2] : 0.98,
    );
  }
  if (map.getLayer("transit-train-markers-halo")) {
    map.setPaintProperty(
      "transit-train-markers-halo",
      "circle-opacity",
      activeLine ? ["case", ["==", ["get", "lineId"], activeLine], 1.0, 0.2] : 1.0,
    );
    map.setPaintProperty(
      "transit-train-markers-halo",
      "circle-stroke-opacity",
      activeLine ? ["case", ["==", ["get", "lineId"], activeLine], 1.0, 0.2] : 1.0,
    );
  }
  if (map.getLayer("transit-train-markers-body")) {
    map.setPaintProperty(
      "transit-train-markers-body",
      "circle-opacity",
      activeLine ? ["case", ["==", ["get", "lineId"], activeLine], 1.0, 0.2] : 1.0,
    );
  }
  if (map.getLayer("transit-train-markers-symbol")) {
    map.setPaintProperty(
      "transit-train-markers-symbol",
      "icon-opacity",
      activeLine ? ["case", ["==", ["get", "lineId"], activeLine], 1.0, 0.2] : 1.0,
    );
  }
  if (map.getLayer("transit-train-markers-label")) {
    map.setPaintProperty(
      "transit-train-markers-label",
      "text-opacity",
      activeLine ? ["case", ["==", ["get", "lineId"], activeLine], 1.0, 0.2] : 1.0,
    );
  }
  if (map.getLayer("transit-station-selection")) {
    map.setFilter("transit-station-selection", [
      "==",
      ["get", "stationId"],
      stationId ?? "",
    ]);
  }
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

export function GeographicNetworkMap({
  network,
  isDark,
  highContrast,
  selectedStationId,
  onSelectStationId,
  selection,
  onSelectImpact,
  commutePathPreview,
  onClearCommutePathPreview,
  filteredLineId,
  onFilterLineId,
  networkSegments: propNetworkSegments,
  stationNodeImpacts: propStationNodeImpacts,
  activeAlerts: propActiveAlerts,
  plannedClosures: propPlannedClosures,
  recenterSignal,
  zoomInSignal,
  zoomOutSignal,
  reducedMotion = false,
  onReady,
  onSwitchToDiagram,
  isMapActive = true,
  onNetworkChange,
  mapView,
  onMapViewChange,
  estimatedTrainsEnabled = false,
  estimatedTrainMarkers = EMPTY_TRAIN_MARKERS,
  selectionAttentionGeneration = 0,
  mobilePerformanceMode = false,
  layoutResetSignal = 0,
}: GeographicNetworkMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sliderRef = useRef<HTMLInputElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [catalog, setCatalog] = useState<GeographicCatalog | null>(null);
  const catalogRef = useRef<GeographicCatalog | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const loadStatusRef = useRef(loadStatus);

  // Selection attention animation state & refs
  const selectionAttentionRef = useRef<GeographicSelectionAttention>(new GeographicSelectionAttention());
  const rafIdRef = useRef<number | null>(null);
  const pendingCameraFlightGenRef = useRef<number | null>(null);

  const stopAttentionLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const applyAttentionFrame = useCallback((frame: SelectionAttentionFrame) => {
    const map = mapRef.current;
    if (!map || loadStatusRef.current !== "ready") return;

    if (map.getLayer("transit-impacts-selection")) {
      map.setPaintProperty("transit-impacts-selection", "line-opacity", frame.opacity);
      map.setPaintProperty("transit-impacts-selection", "line-width", [
        "interpolate",
        ["linear"],
        ["zoom"],
        9,
        7.5 * frame.widthMultiplier,
        14,
        13.0 * frame.widthMultiplier,
        17,
        18.0 * frame.widthMultiplier,
      ]);
    }

    if (map.getLayer("transit-station-impacts-selection")) {
      map.setPaintProperty("transit-station-impacts-selection", "circle-stroke-opacity", frame.opacity);
      map.setPaintProperty("transit-station-impacts-selection", "circle-stroke-width", 4 * frame.widthMultiplier);
      map.setPaintProperty("transit-station-impacts-selection", "circle-radius", [
        "interpolate",
        ["linear"],
        ["zoom"],
        9,
        9.0 * frame.widthMultiplier,
        14,
        15.0 * frame.widthMultiplier,
        17,
        22.0 * frame.widthMultiplier,
      ]);
    }
  }, []);

  const startAttentionLoop = useCallback(() => {
    stopAttentionLoop();
    const step = (now: number) => {
      const frame = selectionAttentionRef.current.computeFrame(now);
      applyAttentionFrame(frame);
      if (frame.active) {
        rafIdRef.current = requestAnimationFrame(step);
      } else {
        rafIdRef.current = null;
      }
    };
    rafIdRef.current = requestAnimationFrame(step);
  }, [applyAttentionFrame, stopAttentionLoop]);

  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      return navigator.onLine;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [currentZoom, setCurrentZoom] = useState<number>(() => getGeographicDefaultZoom(network));
  const [overlapChooser, setOverlapChooser] = useState<GeographicOverlapChooserState | null>(null);
  const [overlapChooserLayout, setOverlapChooserLayout] = useState<GeographicOverlapChooserLayout | null>(null);
  const [hoveredOverlapImpact, setHoveredOverlapImpact] = useState<MapImpact | null>(null);
  const [hoveredMapTarget, setHoveredMapTarget] = useState<{
    type: "segment" | "station";
    id: string;
  } | null>(null);
  const [styleRevision, setStyleRevision] = useState(0);

  // Style and generation lifecycle guards
  const appliedStyleUrlRef = useRef<string | null>(null);
  const isStyleLoadingRef = useRef<boolean>(false);
  const initGenerationRef = useRef<number>(0);

  const activeFilteredLine = filteredLineId ?? null;
  const isDraggingRef = useRef(false);

  // Resolve real-time dashboard data with stable references
  const dashboardData = useOptionalDashboardData();
  const resolvedNetworkSegments = useMemo(
    () => propNetworkSegments ?? (dashboardData?.networkSegments ?? EMPTY_SEGMENTS),
    [propNetworkSegments, dashboardData?.networkSegments],
  );
  const resolvedStationNodeImpacts = useMemo(
    () => propStationNodeImpacts ?? (dashboardData?.stationNodeImpacts ?? EMPTY_STATION_IMPACTS),
    [propStationNodeImpacts, dashboardData?.stationNodeImpacts],
  );
  const resolvedActiveAlerts = useMemo(
    () => propActiveAlerts ?? (dashboardData?.activeAlerts ?? EMPTY_ALERTS),
    [propActiveAlerts, dashboardData?.activeAlerts],
  );
  const resolvedPlannedClosures = useMemo(
    () => propPlannedClosures ?? (dashboardData?.plannedClosures ?? EMPTY_PLANNED_CLOSURES),
    [propPlannedClosures, dashboardData?.plannedClosures],
  );

  const lastRecenterSignalRef = useRef(recenterSignal ?? 0);
  const lastZoomInSignalRef = useRef(zoomInSignal ?? 0);
  const lastZoomOutSignalRef = useRef(zoomOutSignal ?? 0);
  const lastSelectedStationIdRef = useRef<string | null>(selectedStationId ?? null);
  const lastSelectionRef = useRef<string | null>(null);
  const lastCommutePreviewIdRef = useRef<string | null>(commutePathPreview?.id ?? null);
  const cameraAdjustedByUserRef = useRef(false);

  // A map camera is transient working context. Persist only settled mobile
  // cameras that the rider deliberately moved; selection flights, resizes,
  // refreshes, and desktop sessions must not redefine the next map view.
  const persistCamera = useCallback(() => {
    const map = mapRef.current;
    if (!map || !cameraAdjustedByUserRef.current) return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    const center = map.getCenter();
    const zoom = map.getZoom();
    saveGeographicMapViewport(window.localStorage, network, {
      lng: center.lng,
      lat: center.lat,
      zoom,
    });
  }, [network]);

  // Compute active overlay GeoJSON projections
  const overlayData = useMemo(() => {
    if (!catalog) {
      return {
        impactedLinks: { type: "FeatureCollection" as const, features: [] },
        impactedStations: { type: "FeatureCollection" as const, features: [] },
        impactBadges: { type: "FeatureCollection" as const, features: [] },
        impactArrows: { type: "FeatureCollection" as const, features: [] },
        trainMarkers: { type: "FeatureCollection" as const, features: [] },
        commuteLinks: { type: "FeatureCollection" as const, features: [] },
        commuteStations: { type: "FeatureCollection" as const, features: [] },
      };
    }

    const impactedLinks = projectImpactedLinks(
      catalog,
      resolvedNetworkSegments,
      network,
      {
        plannedClosures: resolvedPlannedClosures,
        activeAlerts: resolvedActiveAlerts,
        selection,
      },
    );
    const impactedStations = projectImpactedStations(catalog, resolvedStationNodeImpacts, network);
    const rawBadges = projectImpactBadges(catalog, impactedLinks.features, impactedStations.features, network, selection);
    const impactBadges = {
      ...rawBadges,
      features: rawBadges.features.map((feature) => {
        const rawImpacts = feature.properties.rawImpacts ?? [{
          kind: feature.properties.impactKind,
          cardId: feature.properties.cardId ?? feature.properties.targetId,
          travelDirection: "bidirectional" as const,
          sourceAlertIds: feature.properties.allCardIds ?? [feature.properties.cardId ?? feature.properties.targetId],
        }];
        const kindCounts = (feature.properties.kindCounts ?? countUniqueImpactsByKind(rawImpacts)) as { kind: MapImpactKind; count: number }[];
        const isSelected = Boolean(
          selection?.id && (feature.properties.allCardIds?.includes(selection.id) || feature.properties.cardId === selection.id)
        );
        const badgeImageKey = getOverlapBadgeKey({
          kindCounts,
          isDark,
          highContrast,
          isSelected,
        });
        return {
          ...feature,
          properties: {
            ...feature.properties,
            badgeImageKey,
            isSelected,
          },
        };
      }),
    };
    const directionalSelection = hoveredOverlapImpact
      ? { kind: hoveredOverlapImpact.kind, id: hoveredOverlapImpact.cardId }
      : selection;
    const impactArrows = projectImpactArrows(catalog, impactedLinks.features, directionalSelection);
    const trainMarkers = projectEstimatedTrainMarkers(
      catalog,
      estimatedTrainMarkers,
      {
        enabled: Boolean(estimatedTrainsEnabled && isOnline),
        isOnline,
        selectedTrainId: selection?.id,
      },
    );
    const commute = projectCommutePreview(catalog, commutePathPreview);

    return {
      impactedLinks,
      impactedStations,
      impactBadges,
      impactArrows,
      trainMarkers,
      commuteLinks: commute.links,
      commuteStations: commute.stations,
    };
  }, [
    catalog,
    resolvedNetworkSegments,
    resolvedStationNodeImpacts,
    resolvedPlannedClosures,
    resolvedActiveAlerts,
    selection,
    hoveredOverlapImpact,
    commutePathPreview,
    network,
    estimatedTrainsEnabled,
    estimatedTrainMarkers,
    isOnline,
    isDark,
    highContrast,
  ]);

  // Stable references to dynamic data & props for map listeners & style reload
  const overlayDataRef = useRef(overlayData);
  const selectedStationIdRef = useRef(selectedStationId);
  const selectionRef = useRef(selection);
  const activeFilteredLineRef = useRef(activeFilteredLine);
  const highContrastRef = useRef(highContrast);
  const isDarkRef = useRef(isDark);
  const callbacksRef = useRef({
    onReady,
    onSelectStationId,
    onSelectImpact,
    onFilterLineId,
    persistCamera,
  });
  const attentionHandlersRef = useRef({
    applyAttentionFrame,
    startAttentionLoop,
    stopAttentionLoop,
  });

  useEffect(() => {
    loadStatusRef.current = loadStatus;
    overlayDataRef.current = overlayData;
    selectedStationIdRef.current = selectedStationId;
    selectionRef.current = selection;
    activeFilteredLineRef.current = activeFilteredLine;
    highContrastRef.current = highContrast;
    isDarkRef.current = isDark;
    callbacksRef.current = {
      onReady,
      onSelectStationId,
      onSelectImpact,
      onFilterLineId,
      persistCamera,
    };
    attentionHandlersRef.current = {
      applyAttentionFrame,
      startAttentionLoop,
      stopAttentionLoop,
    };
  }, [loadStatus, overlayData, selectedStationId, selection, activeFilteredLine, highContrast, isDark, onReady, onSelectStationId, onSelectImpact, onFilterLineId, persistCamera, applyAttentionFrame, startAttentionLoop, stopAttentionLoop]);

  const activateImpactTarget = useCallback(
    (
      targetType: "segment" | "station",
      targetId: string,
      coordinate: [number, number],
    ) => {
      const data = overlayDataRef.current;
      const group = getProjectedImpactGroup(
        targetType,
        targetId,
        data.impactedLinks.features,
        data.impactedStations.features,
      );
      if (!group) {
        const badge = data.impactBadges.features.find(
          (f) => f.properties.targetType === targetType && f.properties.targetId === targetId,
        );
        if (badge) {
          const raw = badge.properties.rawImpacts ?? [];
          if (raw.length <= 1 && raw[0]) {
            callbacksRef.current.onSelectImpact?.({ kind: raw[0].kind, id: raw[0].cardId });
          } else if (raw.length > 1) {
            setHoveredOverlapImpact(null);
            setOverlapChooser({
              markerId: `geographic-${targetType}-${targetId}`,
              targetId,
              targetType,
              label: badge.properties.label ?? "Alerts",
              impacts: raw.map((r) => ({
                kind: r.kind,
                cardId: r.cardId,
                travelDirection: r.travelDirection ?? "bidirectional",
                sourceAlertIds: r.sourceAlertIds ?? [r.cardId],
              })),
              coordinate,
            });
          }
        }
        return;
      }
      const impacts = uniqueMapImpacts(group.impacts);
      if (impacts.length <= 1) {
        const impact = impacts[0];
        if (impact) {
          callbacksRef.current.onSelectImpact?.({ kind: impact.kind, id: impact.cardId });
        }
        return;
      }
      setHoveredOverlapImpact(null);
      setOverlapChooser({
        markerId: `geographic-${targetType}-${targetId}`,
        targetId,
        targetType,
        label: group.label,
        impacts,
        coordinate,
      });
    },
    [],
  );

  const attachMapListeners = useCallback((map: MapLibreMap) => {
    // Hover on Disruption Badges
    map.on("mousemove", "transit-impact-badges", (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      if ((props?.targetType === "segment" || props?.targetType === "station") && props.targetId) {
        setHoveredMapTarget((current) => current?.type === props.targetType && current?.id === props.targetId
          ? current
          : { type: props.targetType, id: props.targetId });
      }
      if (props?.rawImpacts) {
        try {
          const raw = typeof props.rawImpacts === "string" ? JSON.parse(props.rawImpacts) : props.rawImpacts;
          if (Array.isArray(raw) && raw.length > 0) {
            setHoveredOverlapImpact({
              kind: raw[0].kind,
              cardId: raw[0].cardId,
              travelDirection: raw[0].travelDirection ?? "bidirectional",
              sourceAlertIds: raw[0].sourceAlertIds ?? [raw[0].cardId],
            });
            return;
          }
        } catch {}
      }
      if (props?.impactKind && props?.cardId) {
        setHoveredOverlapImpact({
          kind: props.impactKind,
          cardId: props.cardId,
          travelDirection: props.travelDirection ?? "bidirectional",
          sourceAlertIds: props.allCardIds ?? [props.cardId],
        });
      }
    });
    map.on("mouseleave", "transit-impact-badges", () => {
      setHoveredOverlapImpact(null);
      setHoveredMapTarget(null);
    });

    for (const [layerId, type, property] of [
      ["transit-impacts-line", "segment", "segmentId"],
      ["transit-station-impacts", "station", "stationId"],
    ] as const) {
      map.on("mousemove", layerId, (event) => {
        const id = event.features?.[0]?.properties?.[property];
        if (!id) return;
        setHoveredMapTarget((current) => current?.type === type && current.id === id
          ? current
          : { type, id });
      });
      map.on("mouseleave", layerId, () => setHoveredMapTarget(null));
    }

    // Dynamic style image fallback for overlap badges
    map.on("styleimagemissing", (e) => {
      const id = e.id;
      if (!id || !id.startsWith("overlap-badge:")) return;
      const badgeInfo = parseOverlapBadgeKey(id);
      if (!badgeInfo) return;
      const svg = generateOverlapBadgeSvg(badgeInfo);
      createSvgImage(svg)
        .then((img) => {
          if (map && map.hasImage && !map.hasImage(id)) {
            map.addImage(id, img, { pixelRatio: MAP_BADGE_PIXEL_RATIO });
          }
        })
        .catch(() => {});
    });

    // Click on Station Impacts
    map.on("click", "transit-station-impacts", (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      if (props?.stationId) {
        activateImpactTarget("station", props.stationId, e.lngLat.toArray());
      }
    });

    // Click on Impacted Segments
    map.on("click", "transit-impacts-line", (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      if (props?.segmentId) {
        activateImpactTarget("segment", props.segmentId, e.lngLat.toArray());
      }
    });

    // Click on Impact Direction Arrows
    map.on("click", "transit-impact-arrows", (e) => {
      if (!e.features || e.features.length === 0) return;
      const props = e.features[0].properties;
      if (props && callbacksRef.current.onSelectImpact) {
        callbacksRef.current.onSelectImpact({
          kind: props.impactKind,
          id: props.impactCardId,
        });
      }
    });

    // Station click handler
    map.on("click", "transit-stations-outer", (e) => {
      if (!e.features || e.features.length === 0) return;
      if (map.getLayer("transit-planned-station-selection")
        && map.queryRenderedFeatures(e.point, { layers: ["transit-planned-station-selection"] }).length > 0) return;
      const stationId = e.features[0].properties?.stationId;
      if (stationId && callbacksRef.current.onSelectStationId) {
        callbacksRef.current.onSelectStationId(stationId);
      }
    });

    map.on("click", "transit-planned-station-selection", () => {
      if (selectionRef.current?.kind === "planned-closure") {
        callbacksRef.current.onSelectImpact?.(selectionRef.current);
      }
    });

    // Badge clicks use exact rendered-symbol hits first. Single-circle badges
    // also receive a 44px minimum target so their interaction area does not
    // shrink below the visible marker at low zoom or high pixel density.
    map.on("click", (e) => {
      const exactBadge = map.getLayer("transit-impact-badges")
        ? map.queryRenderedFeatures(e.point, { layers: ["transit-impact-badges"] })[0]
        : undefined;
      if (exactBadge?.properties?.targetType && exactBadge.properties.targetId) {
        activateImpactTarget(
          exactBadge.properties.targetType,
          exactBadge.properties.targetId,
          (exactBadge.geometry as GeoJSON.Point).coordinates as [number, number],
        );
        return;
      }

      const hitRadius = GEOGRAPHIC_IMPACT_BADGE_MIN_HIT_DIAMETER_PX / 2;
      const nearbySingleBadge = overlayDataRef.current.impactBadges.features
        .filter((feature) => (feature.properties.kindCounts?.length ?? 0) === 1)
        .map((feature) => {
          const point = map.project(feature.geometry.coordinates);
          return {
            feature,
            distance: Math.hypot(point.x - e.point.x, point.y - e.point.y),
          };
        })
        .filter(({ distance }) => distance <= hitRadius)
        .sort((a, b) => a.distance - b.distance)[0]?.feature;
      if (nearbySingleBadge) {
        activateImpactTarget(
          nearbySingleBadge.properties.targetType,
          nearbySingleBadge.properties.targetId,
          nearbySingleBadge.geometry.coordinates,
        );
        return;
      }

      // Empty map background clicks clear selection and filters.
      const interactiveLayers = [
        "transit-station-impacts",
        "transit-impacts-line",
        "transit-impact-arrows",
        "transit-stations-outer",
        "transit-planned-station-selection",
      ].filter((l) => map.getLayer(l));

      const features = map.queryRenderedFeatures(e.point, { layers: interactiveLayers });
      if (features.length === 0) {
        setOverlapChooser(null);
        setHoveredOverlapImpact(null);
        callbacksRef.current.onSelectStationId?.(null);
        callbacksRef.current.onSelectImpact?.(null as unknown as ImpactSelection);
      }
    });

    // Pointer cursor on interactive features
    const pointerLayers = [
      "transit-stations-outer",
      "transit-planned-station-selection",
      "transit-impact-badges",
      "transit-station-impacts",
      "transit-impacts-line",
      "transit-impact-arrows",
    ];
    for (const layerId of pointerLayers) {
      map.on("mouseenter", layerId, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    map.on("dragstart", () => {
      cameraAdjustedByUserRef.current = true;
      isDraggingRef.current = true;
      setHoveredMapTarget(null);
      const frame = selectionAttentionRef.current.onUserGestureStart();
      attentionHandlersRef.current.applyAttentionFrame(frame);
      attentionHandlersRef.current.stopAttentionLoop();
    });

    map.on("dragend", () => {
      window.setTimeout(() => {
        isDraggingRef.current = false;
      }, 80);
    });

    map.on("zoomstart", (e) => {
      if (e.originalEvent) {
        cameraAdjustedByUserRef.current = true;
        const frame = selectionAttentionRef.current.onUserGestureStart();
        attentionHandlersRef.current.applyAttentionFrame(frame);
        attentionHandlersRef.current.stopAttentionLoop();
      }
    });

    map.on("zoom", () => {
      if (sliderRef.current) {
        sliderRef.current.value = String(map.getZoom());
      }
    });

    map.on("moveend", () => {
      recordGeographicMapLifecycle("moveend");
      if (sliderRef.current) {
        sliderRef.current.value = String(map.getZoom());
      }
      setCurrentZoom(map.getZoom());
      callbacksRef.current.persistCamera();

      if (pendingCameraFlightGenRef.current !== null) {
        const flightGen = pendingCameraFlightGenRef.current;
        pendingCameraFlightGenRef.current = null;
        const frame = selectionAttentionRef.current.onCameraFlightEnd(flightGen);
        attentionHandlersRef.current.applyAttentionFrame(frame);
        if (frame.active) {
          attentionHandlersRef.current.startAttentionLoop();
        }
      } else if (selectionAttentionRef.current.getState() === "gesture-pause") {
        const frame = selectionAttentionRef.current.onUserGestureEnd();
        attentionHandlersRef.current.applyAttentionFrame(frame);
        if (frame.active) {
          attentionHandlersRef.current.startAttentionLoop();
        }
      }
    });
  }, [activateImpactTarget]);

  // Main Map lifecycle: owns creation, catalog acquisition, listeners, and cleanup.
  // Must NOT depend on theme, selections, data, or filters.
  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;
    const currentGeneration = ++initGenerationRef.current;

    // Bounded loading timeout (12s engineering default)
    timeoutId = window.setTimeout(() => {
      if (!cancelled && currentGeneration === initGenerationRef.current) {
        setLoadStatus("error");
        recordGeographicMapLifecycle("error", "timeout");
        setErrorMessage("Map loading timed out (12 seconds). Check your internet connection.");
      }
    }, GEOGRAPHIC_LOAD_TIMEOUT_MS);

    async function init() {
      try {
        if (!containerRef.current) return;
        setLoadStatus("loading");
        recordGeographicMapLifecycle("loading", "init");

        // WebGL capability check
        if (!isWebGLSupported()) {
          if (!cancelled && currentGeneration === initGenerationRef.current) {
            setLoadStatus("error");
            recordGeographicMapLifecycle("error", "webgl-unsupported");
            setErrorMessage("WebGL is not supported on this device or browser.");
          }
          return;
        }

        // Fetch geographic catalog for current network if needed
        let loadedCatalog = catalogRef.current;
        if (!loadedCatalog || loadedCatalog.network !== network) {
          const catalogUrl = getCatalogUrl(network);
          const res = await fetch(catalogUrl);
          if (!res.ok) {
            throw new Error(`Failed to load geographic catalog: HTTP ${res.status}`);
          }
          loadedCatalog = await res.json();
          if (cancelled || currentGeneration !== initGenerationRef.current) return;
          catalogRef.current = loadedCatalog;
          setCatalog(loadedCatalog);
        }

        // Restore saved camera or fallback to network bounds
        const mobile = window.matchMedia("(max-width: 767px)").matches;
        const savedCamera = mobile
          ? readGeographicMapViewport(window.localStorage, network)
          : null;

        const initialCenter = savedCamera
          ? ([savedCamera.lng, savedCamera.lat] as [number, number])
          : getGeographicCenter(network);
        const initialZoom = savedCamera ? savedCamera.zoom : getGeographicDefaultZoom(network);
        setCurrentZoom(initialZoom);

        const initialStyleUrl = isDarkRef.current ? OPENFREEMAP_STYLES.dark : OPENFREEMAP_STYLES.light;
        appliedStyleUrlRef.current = initialStyleUrl;

        recordGeographicMapLifecycle("constructor", `network:${network}`);
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: initialStyleUrl,
          center: initialCenter,
          zoom: initialZoom,
          minZoom: GEOGRAPHIC_MIN_ZOOM,
          maxZoom: GEOGRAPHIC_MAX_ZOOM,
          pitch: 0,
          maxPitch: 0,
          dragRotate: false,
          touchPitch: false,
          attributionControl: {
            compact: false,
            customAttribution: getGeographicAttribution(network),
          },
        });

        // Disable pitch and rotation interactions
        map.touchZoomRotate.disableRotation();
        mapRef.current = map;

        map.on("load", () => {
          if (cancelled || currentGeneration !== initGenerationRef.current) return;
          if (timeoutId !== null) window.clearTimeout(timeoutId);

          installTransitLayers(
            map,
            loadedCatalog!,
            network,
            isDarkRef.current,
            highContrastRef.current,
            {
              overlayData: overlayDataRef.current,
              activeFilteredLine: activeFilteredLineRef.current,
              selectedStationId: selectedStationIdRef.current ?? null,
              selectionId: selectionRef.current?.id ?? null,
            },
          );

          attachMapListeners(map);

          setLoadStatus("ready");
          recordGeographicMapLifecycle("ready", "map loaded");
          callbacksRef.current.onReady?.();
        });

        map.on("error", (e) => {
          // Normal tile errors during usable state must not trigger a full error overlay or return to loading
          if (loadStatusRef.current !== "ready") {
            if (e.error?.message?.includes("style") || e.error?.message?.includes("Failed to fetch")) {
              if (!cancelled && currentGeneration === initGenerationRef.current) {
                setLoadStatus("error");
                recordGeographicMapLifecycle("error", "style error");
                setErrorMessage("Failed to load map style from OpenFreeMap.");
              }
            }
          }
        });

        const canvas = map.getCanvas();
        canvas.addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          if (!cancelled && currentGeneration === initGenerationRef.current) {
            setLoadStatus("error");
            recordGeographicMapLifecycle("error", "webglcontextlost");
            setErrorMessage("WebGL graphics context was lost. Please retry or use Diagram.");
          }
        });
      } catch (err: unknown) {
        if (!cancelled && currentGeneration === initGenerationRef.current) {
          setLoadStatus("error");
          recordGeographicMapLifecycle("error", err instanceof Error ? err.message : "init error");
          setErrorMessage(err instanceof Error ? err.message : "Failed to load map.");
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (mapRef.current) {
        recordGeographicMapLifecycle("removal", "cleanup");
        mapRef.current.remove();
        mapRef.current = null;
        appliedStyleUrlRef.current = null;
      }
    };
  }, [network, retryCount, attachMapListeners]);

  // Update dynamic overlay sources in-place whenever live data or commute changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready" || isStyleLoadingRef.current) return;

    const impactsSource = map.getSource("transit-impacts") as maplibregl.GeoJSONSource | undefined;
    if (impactsSource) impactsSource.setData(overlayData.impactedLinks);

    const impactStationsSource = map.getSource("transit-impact-stations") as maplibregl.GeoJSONSource | undefined;
    if (impactStationsSource) impactStationsSource.setData(overlayData.impactedStations);

    const badgesSource = map.getSource("transit-impact-badges") as maplibregl.GeoJSONSource | undefined;
    if (badgesSource) {
      ensureBadgeImages(map, overlayData.impactBadges.features as GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>[]);
      badgesSource.setData(overlayData.impactBadges);
    }

    const arrowsSource = map.getSource("transit-impact-arrows") as maplibregl.GeoJSONSource | undefined;
    if (arrowsSource) arrowsSource.setData(overlayData.impactArrows);

    const trainsSource = map.getSource("transit-train-markers") as maplibregl.GeoJSONSource | undefined;
    if (trainsSource) trainsSource.setData(overlayData.trainMarkers);

    const commuteLinksSource = map.getSource("transit-commute-links") as maplibregl.GeoJSONSource | undefined;
    if (commuteLinksSource) commuteLinksSource.setData(overlayData.commuteLinks);

    const commuteStationsSource = map.getSource("transit-commute-stations") as maplibregl.GeoJSONSource | undefined;
    if (commuteStationsSource) commuteStationsSource.setData(overlayData.commuteStations);
  }, [overlayData, loadStatus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready" || isStyleLoadingRef.current) return;

    let segmentIds: string[] = [];
    let stationIds: string[] = [];
    if (overlapChooser) {
      const impactId = hoveredOverlapImpact?.cardId;
      if (impactId) {
        segmentIds = overlayData.impactedLinks.features
          .filter((feature) => feature.properties.allCardIds.includes(impactId))
          .map((feature) => feature.properties.segmentId);
        stationIds = overlayData.impactedStations.features
          .filter((feature) => feature.properties.allCardIds?.includes(impactId))
          .map((feature) => feature.properties.stationId);
      }
    } else if (hoveredMapTarget?.type === "segment") {
      segmentIds = [hoveredMapTarget.id];
    } else if (hoveredMapTarget?.type === "station") {
      stationIds = [hoveredMapTarget.id];
    }

    const filterFor = (property: "segmentId" | "stationId", ids: string[]): Parameters<MapLibreMap["setFilter"]>[1] => (
      ids.length > 0
        ? ["in", ["get", property], ["literal", [...new Set(ids)]]]
        : ["==", ["get", property], ""]
    );
    for (const layerId of ["transit-impacts-hover-edge", "transit-impacts-hover-core"]) {
      if (map.getLayer(layerId)) map.setFilter(layerId, filterFor("segmentId", segmentIds));
    }
    if (map.getLayer("transit-station-impacts-hover")) {
      map.setFilter("transit-station-impacts-hover", filterFor("stationId", stationIds));
    }

    const container = containerRef.current;
    if (container) {
      if (segmentIds.length === 1) container.dataset.hoveredImpactSegment = segmentIds[0];
      else delete container.dataset.hoveredImpactSegment;
      if (stationIds.length === 1) container.dataset.hoveredImpactStation = stationIds[0];
      else delete container.dataset.hoveredImpactStation;
    }
  }, [hoveredMapTarget, hoveredOverlapImpact, loadStatus, overlapChooser, overlayData, styleRevision]);

  // React to line/corridor filtering changes via paint properties
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    if (map.getLayer("transit-routes")) {
      map.setPaintProperty(
        "transit-routes",
        "line-opacity",
        activeFilteredLine
          ? ["case", ["==", ["get", "lineId"], activeFilteredLine], 1.0, 0.2]
          : 1.0,
      );
    }

    if (map.getLayer("transit-stations-outer")) {
      map.setPaintProperty(
        "transit-stations-outer",
        "circle-opacity",
        activeFilteredLine
          ? ["case", ["in", activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
          : 1.0,
      );
      map.setPaintProperty(
        "transit-stations-outer",
        "circle-stroke-opacity",
        activeFilteredLine
          ? ["case", ["in", activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
          : 1.0,
      );
    }

    if (map.getLayer("transit-stations-inner")) {
      map.setPaintProperty(
        "transit-stations-inner",
        "circle-opacity",
        activeFilteredLine
          ? ["case", ["in", activeFilteredLine, ["get", "lineIds"]], 1.0, 0.25]
          : 1.0,
      );
    }

    if (map.getLayer("transit-impact-arrows")) {
      map.setPaintProperty(
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
      map.setPaintProperty(
        "transit-impact-arrows-casing",
        "icon-opacity",
        activeFilteredLine
          ? ["case", ["==", ["get", "lineId"], activeFilteredLine], 0.98, 0.2]
          : 0.98,
      );
    }

    if (map.getLayer("transit-train-markers-halo")) {
      map.setPaintProperty(
        "transit-train-markers-halo",
        "circle-opacity",
        activeFilteredLine ? ["case", ["==", ["get", "lineId"], activeFilteredLine], 1.0, 0.2] : 1.0,
      );
      map.setPaintProperty(
        "transit-train-markers-halo",
        "circle-stroke-opacity",
        activeFilteredLine ? ["case", ["==", ["get", "lineId"], activeFilteredLine], 1.0, 0.2] : 1.0,
      );
    }

    if (map.getLayer("transit-train-markers-body")) {
      map.setPaintProperty(
        "transit-train-markers-body",
        "circle-opacity",
        activeFilteredLine ? ["case", ["==", ["get", "lineId"], activeFilteredLine], 1.0, 0.2] : 1.0,
      );
    }

    if (map.getLayer("transit-train-markers-symbol")) {
      map.setPaintProperty(
        "transit-train-markers-symbol",
        "icon-opacity",
        activeFilteredLine ? ["case", ["==", ["get", "lineId"], activeFilteredLine], 1.0, 0.2] : 1.0,
      );
    }

    if (map.getLayer("transit-train-markers-label")) {
      map.setPaintProperty(
        "transit-train-markers-label",
        "text-opacity",
        activeFilteredLine ? ["case", ["==", ["get", "lineId"], activeFilteredLine], 1.0, 0.2] : 1.0,
      );
    }
  }, [activeFilteredLine, loadStatus]);

  // React to theme changes: compare applied style and only replace when genuinely changed
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    const targetStyle = isDark ? OPENFREEMAP_STYLES.dark : OPENFREEMAP_STYLES.light;
    if (appliedStyleUrlRef.current === targetStyle) {
      return;
    }

    isStyleLoadingRef.current = true;
    appliedStyleUrlRef.current = targetStyle;

    // Register rehydration before replacement
    map.once("style.load", () => {
      isStyleLoadingRef.current = false;
      if (catalogRef.current && mapRef.current === map) {
        installTransitLayers(
          map,
          catalogRef.current,
          network,
          isDark,
          highContrastRef.current,
          {
            overlayData: overlayDataRef.current,
            activeFilteredLine: activeFilteredLineRef.current,
            selectedStationId: selectedStationIdRef.current ?? null,
            selectionId: selectionRef.current?.id ?? null,
          },
        );
        applyDynamicDataAndFilters(
          map,
          overlayDataRef.current,
          activeFilteredLineRef.current,
          selectedStationIdRef.current ?? null,
          selectionRef.current?.id ?? null,
        );
        setStyleRevision((current) => current + 1);
      }
    });

    recordGeographicMapLifecycle("setStyle", isDark ? "dark" : "light");
    map.setStyle(targetStyle);
  }, [isDark, loadStatus, network]);

  // React to high contrast changes without style reload
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    if (map.getLayer("transit-routes-casing")) {
      map.setPaintProperty("transit-routes-casing", "line-opacity", highContrast ? 1.0 : 0.85);
    }
    if (map.getLayer("transit-impact-arrows-casing")) {
      map.setPaintProperty(
        "transit-impact-arrows-casing",
        "icon-color",
        highContrast ? "#0f172a" : ["coalesce", ["get", "casingColor"], "#0f172a"],
      );
    }
    if (map.getLayer("transit-impact-arrows")) {
      map.setPaintProperty(
        "transit-impact-arrows",
        "icon-color",
        highContrast ? "#ffffff" : ["coalesce", ["get", "coreColor"], "#ffffff"],
      );
    }
  }, [highContrast, loadStatus]);

  // React to station selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    if (map.getLayer("transit-station-selection")) {
      map.setFilter("transit-station-selection", [
        "==",
        ["get", "stationId"],
        selectedStationId ?? "",
      ]);
    }

    // If selection changed to a new station, focus camera
    if (selectedStationId && selectedStationId !== lastSelectedStationIdRef.current) {
      if (catalogRef.current) {
        const coords = getStationCoordinates(catalogRef.current, selectedStationId);
        if (coords) {
          const targetZoom = Math.max(map.getZoom(), STATION_FOCUS_ZOOM);
          if (reducedMotion) {
            map.jumpTo({ center: coords, zoom: targetZoom });
          } else {
            map.flyTo({ center: coords, zoom: targetZoom, essential: true });
          }
        }
      }
    }
    lastSelectedStationIdRef.current = selectedStationId ?? null;
  }, [selectedStationId, loadStatus, reducedMotion]);

  // React to impact selection changes (focus camera on affected corridor/station and drive attention controller)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    const selectedPlannedClosure = selection?.kind === "planned-closure"
      ? resolvedPlannedClosures.find((closure) => closure.id === selection.id)
      : undefined;
    const plannedStationIds = selectedPlannedClosure?.previewStationIds ?? [];
    if (map.getLayer("transit-planned-station-selection")) {
      map.setFilter("transit-planned-station-selection", plannedStationIds.length > 0
        ? ["in", ["get", "stationId"], ["literal", plannedStationIds]]
        : ["==", ["get", "stationId"], ""]);
      map.setPaintProperty(
        "transit-planned-station-selection",
        "circle-stroke-color",
        selectedPlannedClosure?.activeNow ? "#ef4444" : "#3b82f6",
      );
    }

    if (map.getLayer("transit-impacts-selection")) {
      map.setFilter(
        "transit-impacts-selection",
        selection?.id
          ? ["in", selection.id, ["get", "allCardIds"]]
          : ["==", ["get", "impactCardId"], ""],
      );
    }
    if (map.getLayer("transit-station-impacts-selection")) {
      map.setFilter(
        "transit-station-impacts-selection",
        selection?.id
          ? ["in", selection.id, ["get", "allCardIds"]]
          : ["==", ["get", "cardId"], ""],
      );
    }

    if (!selection) {
      lastSelectionRef.current = null;
      pendingCameraFlightGenRef.current = null;
      stopAttentionLoop();
      selectionAttentionRef.current.reset();
      const idleFrame = selectionAttentionRef.current.computeFrame();
      applyAttentionFrame(idleFrame);
      return;
    }

    const currentSelectionKey = `${selection.kind}:${selection.id}:${selectionAttentionGeneration}`;
    let hasCameraFlight = false;

    if (currentSelectionKey !== lastSelectionRef.current) {
      const impactBounds = getProjectedSelectionBounds(
        selection,
        overlayData.impactedLinks.features,
        overlayData.impactedStations.features,
      );
      const stationCoordinates = plannedStationIds.flatMap((stationId) => {
        const coordinate = catalogRef.current && getStationCoordinates(catalogRef.current, stationId);
        return coordinate ? [coordinate] : [];
      });
      const coordinates = [...stationCoordinates, ...(impactBounds ? [impactBounds[0], impactBounds[1]] : [])];
      const bounds: [[number, number], [number, number]] | null = coordinates.length > 0
        ? [
            [Math.min(...coordinates.map((coordinate) => coordinate[0])), Math.min(...coordinates.map((coordinate) => coordinate[1]))],
            [Math.max(...coordinates.map((coordinate) => coordinate[0])), Math.max(...coordinates.map((coordinate) => coordinate[1]))],
          ]
        : null;
      if (bounds) {
        recordGeographicMapLifecycle("focus", currentSelectionKey);
        map.fitBounds(bounds, {
          padding: { top: 90, bottom: 90, left: 60, right: 60 },
          maxZoom: 15.0,
          animate: !reducedMotion,
        });
        lastSelectionRef.current = currentSelectionKey;

        if (!reducedMotion && map.isMoving()) {
          hasCameraFlight = true;
          pendingCameraFlightGenRef.current = selectionAttentionGeneration;
        }
      }
    }

    const isDocHidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    const staticFallback = Boolean(reducedMotion || mobilePerformanceMode || isDocHidden);

    const frame = selectionAttentionRef.current.requestAttention(
      {
        id: selection.id,
        kind: selection.kind,
        generation: selectionAttentionGeneration,
        hasCameraFlight,
      },
      staticFallback,
    );
    applyAttentionFrame(frame);
    if (frame.active) {
      startAttentionLoop();
    } else {
      stopAttentionLoop();
    }
  }, [
    selection,
    selectionAttentionGeneration,
    loadStatus,
    overlayData.impactedLinks,
    overlayData.impactedStations,
    resolvedPlannedClosures,
    reducedMotion,
    mobilePerformanceMode,
    applyAttentionFrame,
    startAttentionLoop,
    stopAttentionLoop,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth >= 768 || !selection) return;
    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    const frameId = window.requestAnimationFrame(() => {
      map.resize();
      const container = containerRef.current;
      if (!container) return;
      const bounds = getProjectedSelectionBounds(
        selection,
        overlayDataRef.current.impactedLinks.features,
        overlayDataRef.current.impactedStations.features,
      );
      if (!bounds) return;
      map.fitBounds(bounds, {
        padding: geographicMobileSelectionPadding(container),
        maxZoom: GEOGRAPHIC_MOBILE_SELECTION_MAX_ZOOM,
        animate: !reducedMotion,
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [layoutResetSignal, loadStatus, reducedMotion, selection]);

  // Invisibility fallback handler
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibilityChange = () => {
      if (!selectionRef.current) return;
      const isDocHidden = document.visibilityState === "hidden";
      const staticFallback = Boolean(reducedMotion || mobilePerformanceMode || isDocHidden);
      const frame = selectionAttentionRef.current.requestAttention(
        {
          id: selectionRef.current.id,
          kind: selectionRef.current.kind,
          generation: selectionAttentionGeneration,
          hasCameraFlight: false,
        },
        staticFallback,
      );
      applyAttentionFrame(frame);
      if (frame.active) {
        startAttentionLoop();
      } else {
        stopAttentionLoop();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [reducedMotion, mobilePerformanceMode, selectionAttentionGeneration, applyAttentionFrame, startAttentionLoop, stopAttentionLoop]);

  useEffect(() => {
    setGeographicProjectedImpactAnchorResolver((key) => {
      const map = mapRef.current;
      if (!map || loadStatusRef.current !== "ready") return null;
      const separator = key.indexOf(":");
      if (separator < 0) return null;
      const targetType = key.slice(0, separator);
      const targetId = key.slice(separator + 1);
      const data = overlayDataRef.current;
      const badge = data.impactBadges.features.find(
        (feature) => feature.properties.targetType === targetType && feature.properties.targetId === targetId,
      );
      if (badge) {
        const point = map.project(badge.geometry.coordinates);
        const container = map.getContainer();
        const inViewport =
          point.x >= 0 && point.x <= container.clientWidth && point.y >= 0 && point.y <= container.clientHeight;
        const hasLayer = Boolean(map.getLayer("transit-impact-badges"));
        const isRendered = hasLayer && (
          map.queryRenderedFeatures(point, { layers: ["transit-impact-badges"] })
            .some((f) => f.properties?.targetType === targetType && f.properties?.targetId === targetId) ||
          map.queryRenderedFeatures([[point.x - 16, point.y - 16], [point.x + 16, point.y + 16]], { layers: ["transit-impact-badges"] })
            .some((f) => f.properties?.targetType === targetType && f.properties?.targetId === targetId)
        );
        return inViewport && (isRendered || hasLayer) ? { x: point.x, y: point.y } : null;
      }
      if (targetType === "segment") {
        const link = data.impactedLinks.features.find((feature) => feature.properties.segmentId === targetId);
        if (link) {
          const point = map.project(getPointAlongPolyline(link.geometry.coordinates, 0.5));
          const isRendered = Boolean(map.getLayer("transit-impacts-line")) && map
            .queryRenderedFeatures(point, { layers: ["transit-impacts-line"] })
            .some((feature) => feature.properties?.segmentId === targetId);
          return isRendered ? { x: point.x, y: point.y } : null;
        }
      }
      if (targetType === "station") {
        const station = data.impactedStations.features.find((feature) => feature.properties.stationId === targetId);
        if (station) {
          const point = map.project(station.geometry.coordinates);
          const isRendered = Boolean(map.getLayer("transit-station-impacts")) && map
            .queryRenderedFeatures(point, { layers: ["transit-station-impacts"] })
            .some((feature) => feature.properties?.stationId === targetId);
          return isRendered ? { x: point.x, y: point.y } : null;
        }
      }
      return null;
    });
    return () => setGeographicProjectedImpactAnchorResolver(null);
  }, []);

  useEffect(() => {
    setGeographicProjectedSelectionBoundsResolver((key) => {
      const map = mapRef.current;
      if (!map || loadStatusRef.current !== "ready") return null;
      const separator = key.indexOf(":");
      if (separator < 0) return null;
      const id = key.slice(separator + 1);
      const data = overlayDataRef.current;
      const coordinates = [
        ...data.impactedLinks.features
          .filter((feature) => feature.properties.allCardIds.includes(id))
          .flatMap((feature) => feature.geometry.coordinates),
        ...data.impactedStations.features
          .filter((feature) => (feature.properties.allCardIds ?? [feature.properties.cardId]).includes(id))
          .map((feature) => feature.geometry.coordinates),
      ];
      if (coordinates.length === 0) return null;
      const points = coordinates.map((coordinate) => map.project(coordinate));
      return {
        left: Math.min(...points.map((point) => point.x)),
        top: Math.min(...points.map((point) => point.y)),
        right: Math.max(...points.map((point) => point.x)),
        bottom: Math.max(...points.map((point) => point.y)),
      };
    });
    return () => setGeographicProjectedSelectionBoundsResolver(null);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || !overlapChooser || loadStatus !== "ready") {
      setOverlapChooserLayout(null);
      return;
    }

    let frameId: number | null = null;
    const updateLayout = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        const width = container.clientWidth;
        const height = container.clientHeight;
        const point = map.project(overlapChooser.coordinate);
        if (point.x < 0 || point.y < 0 || point.x > width || point.y > height) {
          setOverlapChooser(null);
          setHoveredOverlapImpact(null);
          return;
        }
        const compact = width <= 640;
        const requestedChooserSize = {
          width: compact ? Math.max(240, Math.min(280, width - 48)) : Math.min(360, width - 32),
          height: compact
            ? Math.min(380, 56 + overlapChooser.impacts.length * 64)
            : Math.min(440, 68 + overlapChooser.impacts.length * 88),
        };
        const margin = compact ? 12 : 16;
        if (compact) {
          const containerRect = container.getBoundingClientRect();
          const visibleKeepoutElements = visibleMapChooserKeepouts()
            .filter((element) => !element.contains(container));
          const topChromeBottom = visibleKeepoutElements
            .filter((element) => element.matches(".mobile-app-topbar, .map-utility-cluster"))
            .map((element) => element.getBoundingClientRect().bottom)
            .filter((bottom) => bottom > containerRect.top && bottom < containerRect.bottom)
            .reduce((bottom, nextBottom) => Math.max(bottom, nextBottom), containerRect.top);
          const keepouts = visibleKeepoutElements
            .map((element) => element.getBoundingClientRect())
            .filter((rect) => (
              rect.right > containerRect.left
              && rect.left < containerRect.right
              && rect.bottom > containerRect.top
              && rect.top < containerRect.bottom
            ))
            .map((rect) => ({
              left: Math.max(0, rect.left - containerRect.left - GEOGRAPHIC_CHOOSER_KEEPOUT_GAP),
              top: Math.max(0, rect.top - containerRect.top - GEOGRAPHIC_CHOOSER_KEEPOUT_GAP),
              right: Math.min(width, rect.right - containerRect.left + GEOGRAPHIC_CHOOSER_KEEPOUT_GAP),
              bottom: Math.min(height, rect.bottom - containerRect.top + GEOGRAPHIC_CHOOSER_KEEPOUT_GAP),
            }));
          if (topChromeBottom > containerRect.top) {
            keepouts.push({
              left: 0,
              top: 0,
              right: width,
              bottom: Math.min(
                height,
                topChromeBottom - containerRect.top + GEOGRAPHIC_CHOOSER_KEEPOUT_GAP,
              ),
            });
          }
          setOverlapChooserLayout(chooseGeographicMobileChooserLayout({
            anchor: point,
            viewportSize: { width, height },
            requestedSize: requestedChooserSize,
            keepouts,
          }));
          return;
        }
        const left = compact
          ? margin
          : Math.min(
              width - requestedChooserSize.width - margin,
              Math.max(margin, point.x + 24 <= width - requestedChooserSize.width ? point.x + 24 : point.x - requestedChooserSize.width - 24),
            );
        const top = compact
          ? Math.max(margin, height - requestedChooserSize.height - margin)
          : Math.min(height - requestedChooserSize.height - margin, Math.max(margin, point.y - requestedChooserSize.height / 2));
        setOverlapChooserLayout({
          chooserSize: requestedChooserSize,
          layout: {
            left,
            top,
            anchorOffsetX: point.x - left,
            anchorOffsetY: point.y - top,
          },
          viewportSize: { width, height },
        });
      });
    };

    updateLayout();
    map.on("move", updateLayout);
    map.on("resize", updateLayout);
    const resizeObserver = new ResizeObserver(updateLayout);
    resizeObserver.observe(container);
    const stopObservingKeepouts = observeMapChooserKeepouts(updateLayout);
    return () => {
      map.off("move", updateLayout);
      map.off("resize", updateLayout);
      stopObservingKeepouts();
      resizeObserver.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [loadStatus, overlapChooser]);

  // React to commute preview changes (focus camera on commute route)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadStatus !== "ready" || !commutePathPreview) return;

    if (commutePathPreview.id !== lastCommutePreviewIdRef.current && catalogRef.current) {
      const coords: [number, number][] = [];
      for (const stId of commutePathPreview.stationIds) {
        const c = getStationCoordinates(catalogRef.current, stId);
        if (c) coords.push(c);
      }
      if (coords.length > 0) {
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
        for (const [lng, lat] of coords) {
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
        map.fitBounds(
          [[minLng, minLat], [maxLng, maxLat]],
          { padding: { top: 90, bottom: 90, left: 60, right: 60 }, animate: !reducedMotion },
        );
      }
    }
    lastCommutePreviewIdRef.current = commutePathPreview.id;
  }, [commutePathPreview, loadStatus, reducedMotion]);

  // Recenter signal reaction (fits current network bounds)
  useEffect(() => {
    if (recenterSignal === undefined || recenterSignal === lastRecenterSignalRef.current) return;
    lastRecenterSignalRef.current = recenterSignal;

    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;

    cameraAdjustedByUserRef.current = false;
    clearGeographicMapViewport(window.localStorage, network);
    map.fitBounds(getGeographicBounds(network), {
      padding: { top: 70, bottom: 90, left: 40, right: 40 },
      animate: !reducedMotion,
    });
  }, [recenterSignal, loadStatus, network, reducedMotion]);

  // Zoom In signal reaction
  useEffect(() => {
    if (zoomInSignal === undefined || zoomInSignal === lastZoomInSignalRef.current) return;
    lastZoomInSignalRef.current = zoomInSignal;

    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;
    cameraAdjustedByUserRef.current = true;
    map.zoomIn({ animate: !reducedMotion });
  }, [zoomInSignal, loadStatus, reducedMotion]);

  // Zoom Out signal reaction
  useEffect(() => {
    if (zoomOutSignal === undefined || zoomOutSignal === lastZoomOutSignalRef.current) return;
    lastZoomOutSignalRef.current = zoomOutSignal;

    const map = mapRef.current;
    if (!map || loadStatus !== "ready") return;
    cameraAdjustedByUserRef.current = true;
    map.zoomOut({ animate: !reducedMotion });
  }, [zoomOutSignal, loadStatus, reducedMotion]);

  // Container ResizeObserver: coalesced to at most one animation frame
  // Calls map.resize only when container dimensions actually change
  useEffect(() => {
    const container = containerRef.current;
    if (!container || loadStatus !== "ready") return;

    let lastWidth = container.clientWidth;
    let lastHeight = container.clientHeight;
    let resizeRafId: number | null = null;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width === 0 && height === 0) continue;
        if (Math.abs(width - lastWidth) > 0.5 || Math.abs(height - lastHeight) > 0.5) {
          lastWidth = width;
          lastHeight = height;
          if (resizeRafId !== null) {
            cancelAnimationFrame(resizeRafId);
          }
          resizeRafId = requestAnimationFrame(() => {
            resizeRafId = null;
            const map = mapRef.current;
            if (map) {
              recordGeographicMapLifecycle("resize", `${Math.round(width)}x${Math.round(height)}`);
              map.resize();
            }
          });
        }
      }
    });

    observer.observe(container);

    return () => {
      if (resizeRafId !== null) {
        cancelAnimationFrame(resizeRafId);
      }
      observer.disconnect();
    };
  }, [loadStatus]);

  // Resize when map becomes active
  useEffect(() => {
    if (isMapActive && mapRef.current && loadStatus === "ready") {
      mapRef.current.resize();
    }
  }, [isMapActive, loadStatus]);

  const networkBounds = getGeographicBounds(network);

  return (
    <div
      className="geographic-network-map w-full h-full relative overflow-hidden"
      data-status={loadStatus}
      data-network={network}
      data-high-contrast={highContrast ? "true" : undefined}
    >
      <div
        ref={containerRef}
        className={`w-full h-full ${loadStatus === "ready" ? "visible" : "invisible"}`}
        tabIndex={0}
        role="region"
        aria-label={network === "regional" ? "Regional Rail Geographic Map" : "TTC Geographic Map"}
      />

      {overlapChooser && overlapChooserLayout ? (
        <MapOverlapChooser
          markerId={overlapChooser.markerId}
          label={overlapChooser.label}
          impacts={overlapChooser.impacts}
          chooserSize={overlapChooserLayout.chooserSize}
          collisionAvoided
          layout={overlapChooserLayout.layout}
          onSelectImpact={(nextSelection) => onSelectImpact?.(nextSelection)}
          onHoverImpact={setHoveredOverlapImpact}
          onClose={(restoreFocus) => {
            setOverlapChooser(null);
            setHoveredOverlapImpact(null);
            if (restoreFocus) containerRef.current?.focus({ preventScroll: true });
          }}
          reducedMotion={reducedMotion}
          compactMotion={overlapChooserLayout.viewportSize.width <= 640}
          viewportSize={overlapChooserLayout.viewportSize}
        />
      ) : null}

      {/* Desktop Top center map controls */}
      <div
        className="map-control-rail desktop-map-control-rail absolute top-14 sm:top-5 left-1/2 -translate-x-1/2 z-30 flex flex-row items-center justify-center gap-1 sm:gap-2 pointer-events-auto"
        data-map-chooser-keepout
      >
        <div className="map-control-recenter-container">
          <button
            type="button"
            onClick={() => {
              const map = mapRef.current;
              if (map) {
                cameraAdjustedByUserRef.current = false;
                clearGeographicMapViewport(window.localStorage, network);
                map.fitBounds(networkBounds, {
                  padding: { top: 70, bottom: 90, left: 40, right: 40 },
                  animate: !reducedMotion,
                });
              }
            }}
            className="map-control-button group"
            title="Center view"
            aria-label="Center map view"
          >
            <Locate size={22} className="map-control-recenter-icon" />
            <span className="map-control-recenter-desktop-label text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              Center
            </span>
          </button>
          <span className="map-control-recenter-mobile-label">Center</span>
        </div>

        <div className="map-control-zoom-group">
          <div className="map-control-divider" aria-hidden="true" />
          <button
            type="button"
            onClick={() => {
              cameraAdjustedByUserRef.current = true;
              mapRef.current?.zoomOut({ animate: !reducedMotion });
            }}
            className="map-control-button group"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut size={20} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Out</span>
          </button>

          <div className="map-control-slider flex items-center justify-center mx-0.5 sm:mx-1">
            <input
              ref={sliderRef}
              type="range"
              min={GEOGRAPHIC_MIN_ZOOM}
              max={GEOGRAPHIC_MAX_ZOOM}
              step="0.1"
              value={currentZoom}
              onChange={(e) => {
                const targetZoom = parseFloat(e.target.value);
                cameraAdjustedByUserRef.current = true;
                setCurrentZoom(targetZoom);
                mapRef.current?.setZoom(targetZoom);
              }}
              className="w-16 md:w-20 accent-slate-900 dark:accent-white hover:accent-blue-600 dark:hover:accent-blue-400 cursor-pointer h-1.5 rounded-lg appearance-none bg-slate-900/20 dark:bg-white/30 transition-all outline-none"
              title="Zoom level"
              aria-label="Zoom level slider"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              cameraAdjustedByUserRef.current = true;
              mapRef.current?.zoomIn({ animate: !reducedMotion });
            }}
            className="map-control-button group"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn size={20} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">In</span>
          </button>
        </div>

        {onNetworkChange && (
          <div className="desktop-map-control-network-group hidden md:flex items-center">
            <div className="map-control-divider" aria-hidden="true" />
            <NetworkSelector network={network} onChange={onNetworkChange} ariaLabel="Map network switcher" />
          </div>
        )}

        {onMapViewChange && (
          <div className="desktop-map-control-view-group hidden md:flex items-center">
            <div className="map-control-divider" aria-hidden="true" />
            <MapViewSelector view={mapView ?? "geographic"} onChange={onMapViewChange} />
          </div>
        )}
      </div>


      {/* Floating Commute Path Preview Banner */}
      {commutePathPreview && !selection && (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-16 sm:bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-900/90 dark:bg-slate-800/90 text-white text-xs font-semibold shadow-xl backdrop-blur-xs border border-cyan-500/30"
        >
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>Viewing <strong>{commutePathPreview.routeLabel}</strong></span>
          </span>
          {onClearCommutePathPreview && (
            <button
              type="button"
              onClick={onClearCommutePathPreview}
              className="px-2 py-1 rounded-md text-[11px] font-bold bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Error Recovery Overlay */}
      {loadStatus === "error" && (
        <div className="geographic-map-error-overlay absolute inset-0 z-30 flex flex-col items-center justify-center p-4 bg-white/90 dark:bg-slate-950/90 backdrop-blur-xs">
          <div className="geographic-map-error-card max-w-md w-full p-6 rounded-2xl shadow-xl border border-red-500/20 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mb-3">
              <AlertCircle size={28} />
            </div>
            <h3 className="text-lg font-bold mb-1">Unable to Load Map</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
              {errorMessage || "The geographic basemap service could not be loaded. You can retry or switch back to Diagram view."}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 w-full">
              <button
                type="button"
                onClick={() => {
                  setLoadStatus("loading");
                  setRetryCount((c) => c + 1);
                }}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <RefreshCw size={16} />
                <span>Retry</span>
              </button>
              {onSwitchToDiagram && (
                <button
                  type="button"
                  onClick={onSwitchToDiagram}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-sm border border-slate-300 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <Layers size={16} />
                  <span>Use Diagram</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

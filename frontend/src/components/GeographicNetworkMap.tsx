"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { AlertCircle, RefreshCw, Layers, Locate, ZoomIn, ZoomOut } from "lucide-react";
import type { GeographicCatalog } from "../app/geographic-catalog";
import type { NetworkId } from "../app/regional-data";
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
import type { AccountCommutePathPreview } from "../app/commute-data";
import { useOptionalDashboardData } from "../app/DataContext";
import { NetworkSelector } from "./NetworkSelector";
import { MapViewSelector } from "./MapViewSelector";
import {
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
  getGeographicMapLifecycle,
  recordGeographicMapLifecycle,
  setGeographicProjectedImpactAnchorResolver,
  setGeographicProjectedSelectionBoundsResolver,
} from "../app/geographic-lifecycle";
import { MapOverlapChooser, type MapOverlapChooserLayout } from "./MapOverlapChooser";
import {
  generateOverlapBadgeSvg,
  getOverlapBadgeKey,
  parseOverlapBadgeKey,
  createSvgImage,
  MAP_BADGE_PIXEL_RATIO,
} from "./map-overlap-svg";
import { countUniqueImpactsByKind } from "../app/map-alert-selector";
import {
  GeographicSelectionAttention,
  type SelectionAttentionFrame,
} from "../app/geographic-selection-attention";
import {
  observeMapChooserKeepouts,
  visibleMapChooserKeepouts,
} from "./map-chooser-keepouts";
import {
  readMobileImpactInspectorTop,
  readMobilePillBottom,
  readMobileStationSubmenuTop,
} from "../hooks/mobileMapFrame";
import {
  installTransitLayers,
  applyGeographicDynamicState,
  updateGeographicDynamicSources,
  updateGeographicLineFilter,
  updateGeographicStationSelection,
  updateGeographicImpactSelection,
} from "./geographic-map-operations.ts";

export {
  installTransitLayers,
  applyDynamicDataAndFilters,
  applyGeographicDynamicState,
  updateGeographicDynamicSources,
  updateGeographicLineFilter,
  updateGeographicStationSelection,
  updateGeographicImpactSelection,
} from "./geographic-map-operations.ts";

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
  const topPillBottom = readMobilePillBottom(container);
  const inspectorTop = readMobileImpactInspectorTop(container, container.clientHeight);

  return {
    top: Math.max(104, Math.ceil(topPillBottom + 16)),
    bottom: Math.max(96, Math.ceil(container.clientHeight - inspectorTop + 16)),
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

function uniqueMapImpacts(impacts: MapImpact[]): MapImpact[] {
  const seen = new Set<string>();
  return impacts.filter((impact) => {
    const key = `${impact.kind}:${impact.cardId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  const resolvedPlannedClosuresRef = useRef(resolvedPlannedClosures);
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
    resolvedPlannedClosuresRef.current = resolvedPlannedClosures;
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
  }, [loadStatus, overlayData, selectedStationId, selection, resolvedPlannedClosures, activeFilteredLine, highContrast, isDark, onReady, onSelectStationId, onSelectImpact, onFilterLineId, persistCamera, applyAttentionFrame, startAttentionLoop, stopAttentionLoop]);

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
          );
          applyGeographicDynamicState(map, {
            overlayData: overlayDataRef.current,
            activeFilteredLine: activeFilteredLineRef.current,
            selectedStationId: selectedStationIdRef.current ?? null,
            selection: selectionRef.current ?? null,
            plannedClosures: resolvedPlannedClosuresRef.current,
          });

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
    updateGeographicDynamicSources(map, overlayData);
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
    updateGeographicLineFilter(map, activeFilteredLine);
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
        );
        applyGeographicDynamicState(map, {
          overlayData: overlayDataRef.current,
          activeFilteredLine: activeFilteredLineRef.current,
          selectedStationId: selectedStationIdRef.current ?? null,
          selection: selectionRef.current ?? null,
          plannedClosures: resolvedPlannedClosuresRef.current,
        });
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

    updateGeographicStationSelection(map, selectedStationId ?? null);

    // If selection changed to a new station, focus camera
    if (selectedStationId && selectedStationId !== lastSelectedStationIdRef.current) {
      if (catalogRef.current) {
        const coords = getStationCoordinates(catalogRef.current, selectedStationId);
        if (coords) {
          const targetZoom = Math.max(map.getZoom(), STATION_FOCUS_ZOOM);
          const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
          const container = containerRef.current;
          const padding = isMobile && container ? {
            top: readMobilePillBottom(container),
            bottom: Math.max(0, container.clientHeight - readMobileStationSubmenuTop(container, container.clientHeight)),
            left: 0,
            right: 0,
          } : undefined;
          if (reducedMotion) {
            map.jumpTo({ center: coords, zoom: targetZoom, padding });
          } else {
            map.flyTo({ center: coords, zoom: targetZoom, padding, essential: true });
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

    updateGeographicImpactSelection(map, selection ?? null, resolvedPlannedClosures);

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
      const selectedPlannedClosure = selection.kind === "planned-closure"
        ? resolvedPlannedClosures.find((closure) => closure.id === selection.id)
        : undefined;
      const plannedStationIds = selectedPlannedClosure?.previewStationIds ?? [];
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
    const stats = getGeographicMapLifecycle();
    stats.isMoving = () => mapRef.current?.isMoving() ?? false;
    stats.getCamera = () => {
      const map = mapRef.current;
      if (!map) return null;
      const center = map.getCenter();
      return { lng: center.lng, lat: center.lat, zoom: map.getZoom() };
    };
    return () => {
      stats.isMoving = () => false;
      stats.getCamera = () => null;
    };
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

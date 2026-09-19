"use client";

import { useRetainedHover } from "../hooks/useRetainedHover";
import { memo, useEffect, useState, useMemo, useLayoutEffect, useRef, useCallback } from "react";
import {
  composeNetworkSegmentPath,
  extrapolatedPathFrame,
  pathCorridorCollisionBoxes,
  pathMidpointFrame,
  readSvgGeometry,
  readSvgStationLabelPolygons,
  readSvgStationCenters,
  resolveNetworkSegmentPath,
  svgElementMatrixToRootCoordinates,
  transformBoundsToRootCoordinates,
  visualTravelDirection,
  samplePath,
  type MapBounds,
  type MapPoint,
  type MapPolygon,
  type PathFrame,
} from "../app/map-geometry";
import { usePanZoom } from "../hooks/usePanZoom";
import { MOBILE_VIEWPORT_QUERY } from "../hooks/useMobilePerformanceMode";
import { readDesktopOverlayInsets } from "../app/desktop-sidebar-state";
import {
  clampPanZoomScale,
  clientRectToLogicalViewportBounds,
  computeBoundedMapFrame,
  computeInsetViewportFocus,
  logicalViewportSizeForOrientation,
  PAN_ZOOM_MAX_RELATIVE_SCALE,
  type MapContentBounds,
  type MapViewportOrientation,
} from "../hooks/panZoomMath";
import { readStoredSheetHeightRatio } from "../hooks/useMobileDraggableSheet";
import { ZoomIn, ZoomOut, Locate, Sun, Moon, X } from "lucide-react";
import { useDashboardData } from "../app/DataContext";
import { NetworkSelector } from "./NetworkSelector";
import { MapViewSelector } from "./MapViewSelector";
import type { NetworkId } from "../app/regional-data";
import type { MapViewPreference } from "../app/visual-preferences";
import type {
  ActiveAlert,
  DelayAlert,
  ImpactSelection,
  MapImpact,
  MapImpactKind,
  NetworkSegment,
  PlannedClosure,
  ReducedSpeedZone,
  Station,
  TravelDirection,
} from "../app/linewatch-data";
import type { StationSummary } from "../app/station-data";
import type { AccountCommutePathPreview } from "../app/account-data";
import {
  estimatedTrainMarkerLanePoint,
  createEstimatedTrainMarkerTransition,
  estimatedTrainMarkerMotionWaypoints,
  estimatedTrainMarkerObservationKey,
  estimatedTrainMarkerRenderKey,
  sampleEstimatedTrainMarkerMotion,
  scheduleEstimatedTrainMarkerAnimation,
  TRAIN_MARKER_ARROW_PATH,
  TRAIN_MARKER_BODY_PATH,
  TRAIN_MARKER_WINDOWS,
  type EstimatedTrainMarker,
} from "../app/train-markers";
import { LogsDropdown } from "./LogsDropdown";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import {
  MapOverlapIndicator,
  mapOverlapIndicatorSizeForKindCount,
  type MapOverlapIndicatorSize,
} from "./MapOverlapIndicator";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { RasterMapPlane, rasterMapSource, type RasterMapTheme } from "./RasterMapPlane";
import { SiteGuideDropdown } from "./SiteGuideDropdown";
import { mobilePerformanceModeMatches } from "../hooks/useMobilePerformanceMode";
import { observeMobileMapFrame, readMobileImpactInspectorInset } from "../hooks/mobileMapFrame";
import { useMapLabelFontReady } from "../hooks/useMapLabelFontReady";
import { usePageVisibility } from "../hooks/usePageVisibility";
import { useRotatedListDragScroll } from "../hooks/useRotatedListDragScroll";
import {
  alignedOverlapBadgePositionCandidates,
  buildStationOverlapBadgeGroups,
  chooseOverlapChooserPosition,
  coveredSegmentOverlapBadgeSignatures,
  hasOverlappingImpacts,
  overlapBadgeKindCounts,
  overlapBadgeVisualItemCount,
  organizeOverlapBadgeClusters,
  type LockedOverlapBadgeLayouts,
  type PlacedOverlapBadge,
} from "./map-overlap-badges";
import { getSelectedImpactDetails } from "./MobileImpactInspector";
import {
  stationImpactDirectionForImpact,
  stationImpactDirectionForStationImpacts,
  stationImpactDirectionPath,
  type StationImpactArrowDirection,
} from "./station-impact-direction";
import {
  stationImpactVisualAnchors,
  stationVisualAnchorIds,
  stationVisualAnchorsFor,
  stationVisualCenterIds,
} from "./station-map-visuals";
import {
  buildActiveClosureImpactCardIds,
  normalizeActiveClosureMapImpact,
} from "./map-impact-normalization";
import {
  observeMapChooserKeepouts,
  visibleMapChooserKeepouts,
} from "./map-chooser-keepouts";
import { isMapWheelScrollRegionTarget } from "./map-wheel-events";
import { systemLineBadgeOpacity } from "../app/map-line-badges";

const SVG_TO_RENDERED_MAP_SCALE = 4500 / 8250;
const DESKTOP_MAP_HORIZONTAL_INSET_RATIO = 0.025;
const MOBILE_MAP_HORIZONTAL_INSET_RATIO = 0.025;
// Custom-map visible-art bounds, spanning from the Humber College Line 6 badge (x=65)
// through x=7925 to include the Kennedy label and Cardinal North compass.
const TTC_MAP_CONTENT_BOUNDS: MapContentBounds = {
  x: 65 * SVG_TO_RENDERED_MAP_SCALE,
  y: 120 * SVG_TO_RENDERED_MAP_SCALE,
  width: (7925 - 65) * SVG_TO_RENDERED_MAP_SCALE,
  height: (3840 - 120) * SVG_TO_RENDERED_MAP_SCALE,
};

const RSZ_IMPACT_COLOR = "#F59E0B";

type RetainedLayer<T> = {
  key: string;
  item: T;
  exiting: boolean;
};

type TtcImpactHoverIdentity = {
  kind: MapImpactKind;
  id: string;
  segmentId?: string;
  activationKey?: string;
};

function setTtcImpactHovered(
  root: HTMLElement,
  identity: TtcImpactHoverIdentity,
  hovered: boolean,
) {
  root.querySelectorAll<SVGElement>(
    "[data-ttc-hover-impact-kind][data-ttc-hover-impact-id]",
  ).forEach((foreground) => {
    if (
      foreground.dataset.ttcHoverImpactKind !== identity.kind
      || foreground.dataset.ttcHoverImpactId !== identity.id
    ) return;

    const foregroundSegmentId = foreground.dataset.ttcHoverSegmentId;
    if (
      identity.segmentId
      && foregroundSegmentId
      && foregroundSegmentId !== identity.segmentId
    ) return;

    if (hovered) {
      const activationKey = identity.activationKey
        ?? `${identity.kind}:${identity.id}:${identity.segmentId ?? "all"}`;
      foreground.dataset.ttcImpactHovered = "true";
      foreground.dataset.hoverPriorityImpact = activationKey;
      if (foreground.classList.contains("ttc-impact-hover-foreground")) {
        foreground.dataset.hoverForegroundImpact = activationKey;
      }
      if (foreground.classList.contains("station-impact-hover-priority")) {
        foreground.dataset.stationImpactHoverId = identity.id;
      }
      return;
    }

    foreground.removeAttribute("data-ttc-impact-hovered");
    foreground.removeAttribute("data-hover-priority-impact");
    foreground.removeAttribute("data-hover-foreground-impact");
    foreground.removeAttribute("data-station-impact-hover-id");
  });
}

function clearTtcTransientHover(root: HTMLElement | null) {
  if (!root) return;
  root.querySelectorAll<SVGElement>("[data-ttc-impact-hovered='true']")
    .forEach((foreground) => {
      foreground.removeAttribute("data-ttc-impact-hovered");
      foreground.removeAttribute("data-hover-priority-impact");
      foreground.removeAttribute("data-hover-foreground-impact");
      foreground.removeAttribute("data-station-impact-hover-id");
    });
  root.querySelectorAll<SVGElement>(".station-hover-indicator.active")
    .forEach((indicator) => indicator.classList.remove("active"));
}

function setTtcStationHovered(root: HTMLElement | null, stationId: string, hovered: boolean) {
  if (!root) return;
  root.querySelectorAll<SVGElement>(
    `.station-hover-indicator[data-station-hover-id="${CSS.escape(stationId)}"]`,
  ).forEach((indicator) => {
    const stationSelected = indicator.dataset.stationHoverSelected === "true";
    indicator.classList.toggle("active", hovered && !stationSelected);
  });
}

// Pulse keyframes alternate over 1.2 seconds, so their complete visual cycle
// is 2.4 seconds. Use the full cycle when phase-locking layers mounted by
// separate dashboard snapshots.
const MAP_PULSE_CYCLE_MS = 2400;
// Synchronized blur and pulse effects scale with every additional disruption.
// Dense snapshots keep their directional glyph motion but drop those ambient
// effects so alerts remain readable and map interaction stays responsive.
const MAX_CONTINUOUSLY_ANIMATED_OVERLAY_LAYERS = 8;
const SYNCHRONIZED_OVERLAY_PULSE_NAMES = new Set([
  "aura-pulse",
  "map-overlay-rail-pulse",
  "gold-ring-pulse",
  "station-radar-core",
  "station-radar-ping",
  "station-selected-pulse",
]);
import {
  preloadTtcMapMarkup,
  ttcMapMarkupCache,
  type TtcMapMarkupParts,
} from "../app/map-preload";
export { preloadTtcMapMarkup };

function useRetainedMapLayers<T>(
  items: T[],
  keyForItem: (item: T) => string,
  exitMs = 240,
  emptyHoldMs = 90,
) {
  const [retained, setRetained] = useState<RetainedLayer<T>[]>(() =>
    items.map((item) => ({ key: keyForItem(item), item, exiting: false })),
  );
  const retainedRef = useRef(retained);

  useEffect(() => {
    retainedRef.current = retained;
  }, [retained]);

  useEffect(() => {
    const nextByKey = new Map(items.map((item) => [keyForItem(item), item]));
    const shouldHoldTransientEmptyFrame =
      items.length === 0 && retainedRef.current.some((layer) => !layer.exiting);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRetained((previous) => {
      if (items.length === 0 && previous.some((layer) => !layer.exiting)) {
        return previous;
      }

      const previousByKey = new Map(previous.map((layer) => [layer.key, layer]));
      const nextLayers: RetainedLayer<T>[] = [];

      for (const item of items) {
        const key = keyForItem(item);
        nextLayers.push({ key, item, exiting: false });
        previousByKey.delete(key);
      }

      for (const oldLayer of previousByKey.values()) {
        nextLayers.push({ ...oldLayer, exiting: true });
      }

      return nextLayers;
    });

    const emptyHoldTimer = shouldHoldTransientEmptyFrame
      ? window.setTimeout(() => {
          setRetained((current) => current.map((layer) => ({ ...layer, exiting: true })));
        }, emptyHoldMs)
      : null;

    const timer = window.setTimeout(() => {
      setRetained((current) => current.filter((layer) => !layer.exiting || nextByKey.has(layer.key)));
    }, exitMs + (shouldHoldTransientEmptyFrame ? emptyHoldMs : 0));

    return () => {
      if (emptyHoldTimer !== null) {
        window.clearTimeout(emptyHoldTimer);
      }
      window.clearTimeout(timer);
    };
  }, [items, keyForItem, exitMs, emptyHoldMs]);

  return retained;
}

function isStationVisuallyLarge(station: { id: string; interchange: boolean }): boolean {
  if (stationVisualAnchorIds(station.id).length > 1) {
    return false;
  }
  const largeTerminals = [
    "kipling",
    "finch",
    "vaughan-metropolitan-centre",
    "don-mills",
    "humber-college",
    "mount-dennis",
  ];
  if (largeTerminals.includes(station.id)) {
    return true;
  }
  if (station.id === "union") {
    return true;
  }
  return station.interchange;
}

function stationImpactEffectRadius(isLargeStation: boolean): number {
  return isLargeStation ? 48 : 26;
}

function stationImpactDirectionBadgeRadius(isLargeStation: boolean): number {
  return isLargeStation ? 40 : 24;
}

function stationImpactRingRadius(isLargeStation: boolean): number {
  return isLargeStation ? 56 : 38;
}

function InteractiveTtcMapComponent({
  selection,
  onSelectImpact,
  stations,
  selectedStationId,
  onSelectStationId,
  isDark,
  highContrast = false,
  onToggleTheme,
  layoutResetSignal,
  entranceSignal,
  recenterSignal,
  zoomInSignal,
  zoomOutSignal,
  reducedMotion,
  mobilePerformanceMode = false,
  desktopMenuPinned = false,
  mapChromeVisible = false,
  preserveCameraOnSelectionClear = false,
  commutePathPreview,
  onClearCommutePathPreview,
  viewportOrientation = "standard",
  estimatedTrainsEnabled = false,
  estimatedTrainMarkers = [],
  animateInitialEntrance = true,
  deferInitialEntrance = false,
  isMapActive = true,
  onReady,
  onNetworkChange,
  mapView,
  onMapViewChange,
  selectionAttentionGeneration = 0,
}: {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  stations: StationSummary[];
  selectedStationId: string | null;
  onSelectStationId: (id: string | null) => void;
  isDark: boolean;
  highContrast?: boolean;
  onToggleTheme: () => void;
  layoutResetSignal?: number;
  entranceSignal?: number;
  recenterSignal?: number;
  zoomInSignal?: number;
  zoomOutSignal?: number;
  reducedMotion: boolean;
  mobilePerformanceMode?: boolean;
  desktopMenuPinned?: boolean;
  mapChromeVisible?: boolean;
  preserveCameraOnSelectionClear?: boolean;
  commutePathPreview?: AccountCommutePathPreview | null;
  onClearCommutePathPreview?: () => void;
  viewportOrientation?: MapViewportOrientation;
  estimatedTrainsEnabled?: boolean;
  estimatedTrainMarkers?: EstimatedTrainMarker[];
  animateInitialEntrance?: boolean;
  deferInitialEntrance?: boolean;
  isMapActive?: boolean;
  onReady?: () => void;
  onNetworkChange?: (network: NetworkId) => void;
  mapView?: MapViewPreference;
  onMapViewChange?: (view: MapViewPreference) => void;
  selectionAttentionGeneration?: number;
}) {
  const { networkSegments, activeAlerts, delays, reducedSpeedZones, plannedClosures, stationNodeImpacts, stations: mapStations, mapAsset } = useDashboardData();
  const [svgParts, setSvgParts] = useState<TtcMapMarkupParts | null>(() => (
    ttcMapMarkupCache.get(mapAsset.src) ?? null
  ));
  const [readyRasterPlanes, setReadyRasterPlanes] = useState(() => new Set<string>());
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(() => (
    ttcMapMarkupCache.has(mapAsset.src) ? "ready" : "loading"
  ));
  const [geometryReady, setGeometryReady] = useState(false);
  const [activeHoveredStationLabelId, setHoveredStationLabelId] = useState<string | null>(null);
  const hoveredStationLabelId = useRetainedHover(activeHoveredStationLabelId);
  const [expandedOverlapBadgeId, setExpandedOverlapBadgeId] = useState<string | null>(null);
  const mapLabelFontReady = useMapLabelFontReady();
  const pageVisible = usePageVisibility();
  const useMobileRendering = mobilePerformanceMode || mobilePerformanceModeMatches();
  const mapEffectMotionPaused = reducedMotion || !pageVisible;
  const selectionIntroKey = selection
    ? `${selection.kind}:${selection.id}:${selectionAttentionGeneration}`
    : selectedStationId
      ? `station:${selectedStationId}:${selectionAttentionGeneration}`
      : null;
  const [completedSelectionIntroKey, setCompletedSelectionIntroKey] = useState<string | null>(null);
  useEffect(() => {
    if (!selectionIntroKey) return;
    const timer = window.setTimeout(() => {
      setCompletedSelectionIntroKey(selectionIntroKey);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [selectionIntroKey]);
  const selectionIntroComplete = Boolean(selectionIntroKey && completedSelectionIntroKey === selectionIntroKey);
  const lockedOverlapBadgeLayoutsRef = useRef<LockedOverlapBadgeLayouts>(new Map());
  const rasterTheme: RasterMapTheme = highContrast ? "high-contrast" : isDark ? "dark" : "light";
  // The shell's media-query hook resolves after hydration. Read the same query
  // synchronously for texture selection so a phone never starts decoding the
  // much larger desktop planes during that first client render.
  const rasterDensity = useMobileRendering
    ? "mobile"
    : "balanced";
  const rasterVariantKey = `${rasterTheme}:${rasterDensity}`;
  const markRasterPlaneReady = useCallback((plane: string) => {
    setReadyRasterPlanes((current) => {
      const planeKey = `${rasterVariantKey}:${plane}`;
      if (current.has(planeKey)) return current;
      const next = new Set(current);
      next.add(planeKey);
      return next;
    });
  }, [rasterVariantKey]);
  const rasterMapReady = readyRasterPlanes.has(`${rasterVariantKey}:background`)
    && readyRasterPlanes.has(`${rasterVariantKey}:foreground`)
    && readyRasterPlanes.has(`${rasterVariantKey}:labels`)
    && readyRasterPlanes.has(`${rasterVariantKey}:badges`);
  const readyNotifiedRef = useRef(false);
  const entranceWasDeferredRef = useRef(false);
  const initialCameraPositionedRef = useRef(false);

  const mapSvgRef = useRef<SVGSVGElement>(null);
  const mapRootRef = useRef<HTMLDivElement>(null);
  const hoveredMapImpactRef = useRef<TtcImpactHoverIdentity | null>(null);
  const externallyHoveredImpactKeysRef = useRef(new Set<string>());
  const chooserHoveredImpactRef = useRef<MapImpact | null>(null);
  const mapControlRailRef = useRef<HTMLDivElement>(null);
  const [desktopMapTopInset, setDesktopMapTopInset] = useState(() => {
    if (typeof window === "undefined" || window.innerWidth < 768) return 0;
    const rail = document.querySelector<HTMLElement>(".desktop-map-control-rail");
    const root = document.querySelector<HTMLElement>(".ttc-map-root");
    if (rail && root && window.getComputedStyle(rail).display !== "none") {
      const railRect = rail.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      return Math.max(0, Math.round(railRect.bottom - rootRect.top));
    }
    return 76;
  });
  const [desktopMapBottomInset, setDesktopMapBottomInset] = useState(0);
  const desktopMapInsetsRef = useRef({ top: desktopMapTopInset, bottom: desktopMapBottomInset });
  const lastFittedInsetsRef = useRef<{ top: number; bottom: number } | null>(null);
  const [anchorPoints, setAnchorPoints] = useState(new Map<string, MapPoint>());
  const [guidePaths, setGuidePaths] = useState(new Map<string, string>());
  const [stationCenterPoints, setStationCenterPoints] = useState(new Map<string, MapPoint>());
  const [stationLabelPolygons, setStationLabelPolygons] = useState(new Map<string, MapPolygon>());
  const [mapCollisionBoxes, setMapCollisionBoxes] = useState<SvgBounds[]>([]);
  const hoveredLabelPolygon = hoveredStationLabelId
    ? stationLabelPolygons.get(hoveredStationLabelId) ?? null
    : null;
  const hoveredLabelPolygonPoints = hoveredLabelPolygon
    ?.map((point) => `${point.x},${point.y}`)
    .join(" ") ?? null;
  const hoveredLabelCenter = hoveredLabelPolygon ? {
    x: hoveredLabelPolygon.reduce((sum, point) => sum + point.x, 0) / hoveredLabelPolygon.length,
    y: hoveredLabelPolygon.reduce((sum, point) => sum + point.y, 0) / hoveredLabelPolygon.length,
  } : null;
  const hoveredLabelBounds = hoveredLabelPolygon ? {
    x: Math.min(...hoveredLabelPolygon.map((point) => point.x)) - 16,
    y: Math.min(...hoveredLabelPolygon.map((point) => point.y)) - 16,
    width: Math.max(...hoveredLabelPolygon.map((point) => point.x))
      - Math.min(...hoveredLabelPolygon.map((point) => point.x)) + 32,
    height: Math.max(...hoveredLabelPolygon.map((point) => point.y))
      - Math.min(...hoveredLabelPolygon.map((point) => point.y)) + 32,
  } : null;
  const measuredGeometrySignatureRef = useRef<string | null>(null);
  const measuredLabelGeometrySignatureRef = useRef<string | null>(null);
  const geometryMeasurementSignature = [
    mapAsset.src,
    stations.map((station) => `${station.id}:${station.mapX}:${station.mapY}`).join("|"),
    mapStations.map((station) => `${station.id}:${station.x}:${station.y}`).join("|"),
    networkSegments.map((segment) => [
      segment.id,
      segment.stationAId,
      segment.stationBId,
      segment.stationAAnchorId,
      segment.stationBAnchorId,
      segment.guidePathId,
      segment.guidePathReversed,
      segment.pathD,
    ].join(":"))
      .join("|"),
  ].join("::");

  useLayoutEffect(() => {
    if (loadState !== "ready" || !mapSvgRef.current) return;
    const measurementSignature = `${geometryMeasurementSignature}::font-ready:${mapLabelFontReady}`;
    if (measuredGeometrySignatureRef.current === measurementSignature) return;
    const geometry = readSvgGeometry(mapSvgRef.current, networkSegments);
    setAnchorPoints(geometry.anchorPoints);
    setGuidePaths(geometry.guidePaths);
    setStationCenterPoints(
      readSvgStationCenters(mapSvgRef.current, stationVisualCenterIds(stations)),
    );
    const baseRouteCollisionBoxes = collectBaseRouteCollisionBoxes(
      networkSegments,
      mapStations,
      geometry.anchorPoints,
      geometry.guidePaths,
    );
    setMapCollisionBoxes([
      ...collectMapCollisionBoxes(mapSvgRef.current),
      ...baseRouteCollisionBoxes,
    ]);
    // Font-display: swap can change label bounds after the first usable map
    // frame. Allow the font-ready pass to reorganize badges against the final
    // authored metrics rather than preserving positions from the fallback.
    if (mapLabelFontReady) lockedOverlapBadgeLayoutsRef.current = new Map();
    measuredGeometrySignatureRef.current = measurementSignature;
    setGeometryReady(true);
  }, [geometryMeasurementSignature, loadState, mapLabelFontReady, mapStations, networkSegments, stations]);

  useLayoutEffect(() => {
    if (!mapLabelFontReady || loadState !== "ready" || !mapSvgRef.current) return;
    if (measuredLabelGeometrySignatureRef.current === geometryMeasurementSignature) return;

    setStationLabelPolygons(
      readSvgStationLabelPolygons(mapSvgRef.current, stations.map((station) => station.id), {
        leading: 0,
        trailing: 68,
        y: 8,
      }),
    );
    measuredLabelGeometrySignatureRef.current = geometryMeasurementSignature;
  }, [geometryMeasurementSignature, loadState, mapLabelFontReady, stations]);

  // The authored labels live inside dangerouslySetInnerHTML while estimated
  // markers are ordinary React children of the same SVG. Marker polling can
  // commit that sibling tree without changing the logical hover id, so always
  // reconcile the imperative SVG classes after a render. This keeps a pointer
  // held over a station name highlighted through marker refreshes.
  useLayoutEffect(() => {
    const root = mapSvgRef.current;
    if (!root) return;

    for (const label of root.querySelectorAll<SVGGraphicsElement>(
      "#ttc-station-labels-layer [data-station-label-for]",
    )) {
      const active = label.dataset.stationLabelFor === activeHoveredStationLabelId;
      label.classList.toggle(
        "station-label-hovered",
        active,
      );
      label.closest(".station-label-hover-effect")
        ?.classList.toggle("station-label-hover-effect-active", active);
    }
  });

  const stationPointFor = useCallback((station: { id: string; mapX: number; mapY: number }): MapPoint => {
    return stationCenterPoints.get(station.id) ?? { x: station.mapX, y: station.mapY };
  }, [stationCenterPoints]);

  const visualAnchorsForStation = useCallback(
    (station: Pick<StationSummary, "id" | "mapX" | "mapY">) =>
      stationVisualAnchorsFor(station, stationCenterPoints),
    [stationCenterPoints],
  );

  const defaultMapFrame = useMemo(() => ({
    bounds: TTC_MAP_CONTENT_BOUNDS,
    mobileZoom: 1.65,
    mobileCenterStationId: "union",
    topInset: desktopMapTopInset,
    bottomInset: desktopMapBottomInset,
    horizontalInsetRatio: desktopMapTopInset > 0
      ? DESKTOP_MAP_HORIZONTAL_INSET_RATIO
      : MOBILE_MAP_HORIZONTAL_INSET_RATIO,
    minHorizontalInset: desktopMapTopInset > 0 ? 32 : 12,
  }), [desktopMapBottomInset, desktopMapTopInset]);

  const {
    transform,
    relativeScale,
    isGestureActive,
    recenterFeedbackKey,
    containerRef,
    mapRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    handlePointerCancel,
    handleWheel,
    initializeCamera,
    stageInitialEntrance,
    completeStagedEntrance,
    recenter,
    recenterWithFeedback,
    zoomIn,
    zoomOut,
    zoomToScale,
    zoomToBounds,
    logicalViewportSize,
    defaultTransformForViewport,
    moveToDefaultCamera,
    animateTransformTo,
    currentRenderedTransform,
    fitScale,
    shouldSuppressMapClick,
    replayEntrance,
    refitIfCameraUntouched,
  } = usePanZoom({
    persistenceKey: "ttc",
    persistenceBlocked: Boolean(selection || selectedStationId || commutePathPreview),
    reducedMotion,
    viewportOrientation,
    disableProgrammaticMotion: mobilePerformanceMode,
    defaultFrame: defaultMapFrame,
    animateInitialEntrance,
  });
  const lineBadgeOpacity = systemLineBadgeOpacity(relativeScale);
  const [mapViewportSize, setMapViewportSize] = useState({ width: 392, height: 720 });
  const [chooserKeepoutBoxes, setChooserKeepoutBoxes] = useState<SvgBounds[]>([]);
  const automaticResizeRefitBlockedRef = useRef(false);

  useLayoutEffect(() => observeMobileMapFrame(containerRef.current, () => {
    if (!isMapActive) return;
    if (window.innerWidth < 768 && !automaticResizeRefitBlockedRef.current) refitIfCameraUntouched();
  }), [containerRef, isMapActive, refitIfCameraUntouched, mapChromeVisible]);

  useEffect(() => {
    automaticResizeRefitBlockedRef.current = Boolean(selection || selectedStationId || commutePathPreview);
  }, [commutePathPreview, selectedStationId, selection]);

  useLayoutEffect(() => {
    const root = mapRootRef.current;
    const rail = mapControlRailRef.current;
    if (!root || !rail) return;

    const measureDesktopInsets = () => {
      const railStyle = window.getComputedStyle(rail);
      if (railStyle.display === "none" || window.innerWidth < 768) {
        setDesktopMapTopInset(0);
        setDesktopMapBottomInset(0);
        return;
      }

      const rootRect = root.getBoundingClientRect();
      const railRect = rail.getBoundingClientRect();
      const nextTopInset = Math.max(0, Math.round(railRect.bottom - rootRect.top));

      const impactBadges = document.querySelector<HTMLElement>(".desktop-status-chip-row-container");
      const legend = document.querySelector<HTMLElement>(".desktop-map-legend");
      let nextBottomInset = 0;
      if (impactBadges && window.getComputedStyle(impactBadges).display !== "none") {
        const badgesRect = impactBadges.getBoundingClientRect();
        if (badgesRect.width > 0 && badgesRect.height > 0) {
          nextBottomInset = Math.max(0, Math.round(rootRect.bottom - badgesRect.top));
        }
      }
      if (legend && window.getComputedStyle(legend).display !== "none") {
        const legendRect = legend.getBoundingClientRect();
        if (legendRect.width > 0 && legendRect.height > 0) {
          nextBottomInset = Math.max(nextBottomInset, Math.round(rootRect.bottom - legendRect.top));
        }
      }

      const insetsChanged = desktopMapInsetsRef.current.top !== nextTopInset
        || desktopMapInsetsRef.current.bottom !== nextBottomInset;
      if (insetsChanged) {
        desktopMapInsetsRef.current = { top: nextTopInset, bottom: nextBottomInset };
        setDesktopMapTopInset(nextTopInset);
        setDesktopMapBottomInset(nextBottomInset);
        refitIfCameraUntouched();
      }
    };

    measureDesktopInsets();
    const observer = new ResizeObserver(measureDesktopInsets);
    observer.observe(root);
    observer.observe(rail);
    const impactBadges = document.querySelector<HTMLElement>(".desktop-status-chip-row-container");
    if (impactBadges) observer.observe(impactBadges);
    const legend = document.querySelector<HTMLElement>(".desktop-map-legend");
    if (legend) observer.observe(legend);
    window.addEventListener("resize", measureDesktopInsets);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureDesktopInsets);
    };
  }, [refitIfCameraUntouched, mapChromeVisible]);

  useEffect(() => {
    const viewport = containerRef.current;
    if (!viewport) return;
    const updateSize = () => {
      setMapViewportSize(logicalViewportSizeForOrientation(
        viewport.clientWidth,
        viewport.clientHeight,
        viewportOrientation,
      ));
    };
    const handleWindowResize = () => {
      updateSize();
      if (!automaticResizeRefitBlockedRef.current) {
        refitIfCameraUntouched();
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    window.addEventListener("resize", handleWindowResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [containerRef, refitIfCameraUntouched, viewportOrientation]);

  useLayoutEffect(() => {
    const viewport = containerRef.current;
    if (!viewport) return;

    const updateKeepoutBoxes = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const keepouts = visibleMapChooserKeepouts();
      const boxes = keepouts
        .map((element) => clientRectToLogicalViewportBounds(
          element.getBoundingClientRect(),
          viewportRect,
          viewportOrientation,
        ))
        .filter((box): box is SvgBounds => Boolean(box));
      setChooserKeepoutBoxes((current) => boundsListsMatch(current, boxes) ? current : boxes);
    };

    const resizeObserver = new ResizeObserver(updateKeepoutBoxes);
    resizeObserver.observe(viewport);
    const stopObservingKeepouts = observeMapChooserKeepouts(updateKeepoutBoxes);
    updateKeepoutBoxes();
    return () => {
      stopObservingKeepouts();
      resizeObserver.disconnect();
    };
  }, [containerRef, expandedOverlapBadgeId, mapViewportSize.width, viewportOrientation]);

  // Load SVG
  useEffect(() => {
    let cancelled = false;
    async function loadMap() {
      try {
        const cached = ttcMapMarkupCache.get(mapAsset.src);
        if (!cached) setLoadState("loading");
        const parts = cached ?? await preloadTtcMapMarkup(mapAsset.src);

        if (!cancelled) {
          setSvgParts(parts);
          setLoadState("ready");
        }
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }
    loadMap();
    return () => {
      cancelled = true;
    };
  }, [mapAsset.src]);

  // Prevent default wheel scrolling on the container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventScroll = (e: WheelEvent) => {
      if (isMapWheelScrollRegionTarget(e.target)) return;
      e.preventDefault();
    };
    el.addEventListener("wheel", preventScroll, { passive: false });
    return () => el.removeEventListener("wheel", preventScroll);
  }, [containerRef]);

  const focusTargetKey = useMemo(() => {
    if (selection) return `${selection.kind}:${selection.id}`;
    if (selectedStationId) return `station:${selectedStationId}`;
    if (commutePathPreview) return `commute:${commutePathPreview.id}:${commutePathPreview.legId}`;
    return null;
  }, [commutePathPreview, selection, selectedStationId]);

  // Center map automatically when SVG loads and container dimensions are resolved
  useLayoutEffect(() => {
    if (loadState !== "ready") return;
    if (readyNotifiedRef.current) return;

    let attempts = 0;
    let retryTimer: number | null = null;
    const checkAndCenter = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const entranceStillCovered = deferInitialEntrance
          || (focusTargetKey === null
            && animateInitialEntrance
            && (!geometryReady || !rasterMapReady));
        if (entranceStillCovered) {
          entranceWasDeferredRef.current = true;
          stageInitialEntrance();
          return;
        }
        if (entranceWasDeferredRef.current) {
          entranceWasDeferredRef.current = false;
          initialCameraPositionedRef.current = true;
          completeStagedEntrance();
        } else if (initialCameraPositionedRef.current) {
          return;
        } else if (focusTargetKey === null) {
          initialCameraPositionedRef.current = true;
          lastFittedInsetsRef.current = { top: desktopMapTopInset, bottom: desktopMapBottomInset };
          initializeCamera();
        } else {
          initialCameraPositionedRef.current = true;
          lastFittedInsetsRef.current = { top: desktopMapTopInset, bottom: desktopMapBottomInset };
          moveToDefaultCamera(false, false);
        }
      } else if (attempts < 10) {
        attempts++;
        retryTimer = window.setTimeout(checkAndCenter, 100);
      }
    };

    checkAndCenter();
    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [animateInitialEntrance, completeStagedEntrance, containerRef, deferInitialEntrance, desktopMapBottomInset, desktopMapTopInset, focusTargetKey, geometryReady, initializeCamera, loadState, moveToDefaultCamera, rasterMapReady, stageInitialEntrance]);

  useEffect(() => {
    if (!initialCameraPositionedRef.current) return;
    const last = lastFittedInsetsRef.current;
    if (!last || last.top !== desktopMapTopInset || last.bottom !== desktopMapBottomInset) {
      lastFittedInsetsRef.current = { top: desktopMapTopInset, bottom: desktopMapBottomInset };
      refitIfCameraUntouched();
    }
  }, [desktopMapBottomInset, desktopMapTopInset, refitIfCameraUntouched]);

  useEffect(() => {
    if (
      deferInitialEntrance
      || loadState !== "ready"
      || !geometryReady
      || !rasterMapReady
      || readyNotifiedRef.current
    ) return;

    let secondPaintFrame: number | null = null;
    const firstPaintFrame = window.requestAnimationFrame(() => {
      secondPaintFrame = window.requestAnimationFrame(() => {
        if (readyNotifiedRef.current) return;
        readyNotifiedRef.current = true;
        onReady?.();
      });
    });

    return () => {
      window.cancelAnimationFrame(firstPaintFrame);
      if (secondPaintFrame !== null) window.cancelAnimationFrame(secondPaintFrame);
    };
  }, [deferInitialEntrance, geometryReady, loadState, onReady, rasterMapReady]);



  const lastRecenterSignalRef = useRef(recenterSignal ?? 0);

  useEffect(() => {
    // Recenter is an edge-triggered command. Remounting after a network change
    // must not replay the last Center click and fade the incoming TTC map.
    if (
      recenterSignal === undefined
      || recenterSignal === lastRecenterSignalRef.current
      || loadState !== "ready"
    ) return;
    lastRecenterSignalRef.current = recenterSignal;
    recenterWithFeedback();
  }, [recenterSignal, loadState, recenterWithFeedback]);

  const lastZoomInSignalRef = useRef(zoomInSignal ?? 0);
  useEffect(() => {
    if (
      zoomInSignal === undefined
      || zoomInSignal === lastZoomInSignalRef.current
      || loadState !== "ready"
    ) return;
    lastZoomInSignalRef.current = zoomInSignal;
    zoomIn();
  }, [zoomInSignal, loadState, zoomIn]);

  const lastZoomOutSignalRef = useRef(zoomOutSignal ?? 0);
  useEffect(() => {
    if (
      zoomOutSignal === undefined
      || zoomOutSignal === lastZoomOutSignalRef.current
      || loadState !== "ready"
    ) return;
    lastZoomOutSignalRef.current = zoomOutSignal;
    zoomOut();
  }, [zoomOutSignal, loadState, zoomOut]);

  const lastEntranceSignalRef = useRef(entranceSignal ?? 0);

  useEffect(() => {
    if (entranceSignal === undefined || entranceSignal === lastEntranceSignalRef.current || loadState !== "ready") return;

    lastEntranceSignalRef.current = entranceSignal;
    replayEntrance();
  }, [entranceSignal, loadState, replayEntrance]);

  const selectedSegmentIds = useMemo(() => {
    if (!selection) return [];
    if (selection.kind === "planned-closure") {
      return activeAlerts.find((alert) => alert.id === selection.id)?.affectedSegmentIds
        ?? plannedClosures.find((closure) => closure.id === selection.id)?.previewSegmentIds
        ?? [];
    }
    if (selection.kind === "suspension") {
      return activeAlerts.find((alert) => alert.id === selection.id)?.affectedSegmentIds ?? [];
    }
    if (selection.kind === "delay") {
      return delays.find((delay) => delay.id === selection.id)?.affectedSegmentIds ?? [];
    }
    return reducedSpeedZones.find((zone) => zone.id === selection.id)?.affectedSegmentIds ?? [];
  }, [activeAlerts, delays, plannedClosures, reducedSpeedZones, selection]);

  // Resolve and sample focus geometry when the SVG topology changes, not on
  // the overlay-press render. The selected impact can then frame itself with
  // inexpensive map lookups in the pre-paint layout effect below.
  const focusBoxesBySegmentId = useMemo(() => {
    return new Map(networkSegments.flatMap((segment) => {
      const pathD = resolveNetworkSegmentPath(segment, mapStations, anchorPoints, guidePaths);
      return pathD
        ? [[segment.id, pathCorridorCollisionBoxes(pathD, 80)] as const]
        : [];
    }));
  }, [anchorPoints, guidePaths, mapStations, networkSegments]);

  const commuteFlashStationIds = useMemo(() => {
    if (!commutePathPreview || commutePathPreview.stationIds.length === 0) {
      return [];
    }
    const origin = commutePathPreview.stationIds[0];
    const destination = commutePathPreview.stationIds.at(-1);
    return origin && destination ? [origin, destination] : [];
  }, [commutePathPreview]);

  const lastFocusedTargetKeyRef = useRef<string | null>(null);
  const lastFocusLayoutKeyRef = useRef("");
  const lastHandledLayoutResetSignalRef = useRef(0);

  useEffect(() => {
    if (!layoutResetSignal || loadState !== "ready") return;
    if (lastHandledLayoutResetSignalRef.current === layoutResetSignal) return;

    lastHandledLayoutResetSignalRef.current = layoutResetSignal;
    if (focusTargetKey) return;

    const resetTimer = window.setTimeout(() => recenter(), 320);
    return () => window.clearTimeout(resetTimer);
  }, [layoutResetSignal, loadState, recenter, focusTargetKey]);

  const selectedMapElements = useCallback(() => {
    const root = containerRef.current;
    if (!root) return [];
    if (selection) {
      return [
        ...root.querySelectorAll<SVGGraphicsElement>(
          `[data-selected-commute-impact-overlay="${CSS.escape(selection.id)}"], [data-selected-impact-emphasis="${CSS.escape(selection.id)}"], [data-map-impact-id="${CSS.escape(selection.id)}"], [data-station-impact-selection-id="${CSS.escape(selection.id)}"]`,
        ),
      ];
    }
    if (selectedStationId) {
      const station = root.querySelector<SVGGraphicsElement>(
        `[data-station-selected-id="${CSS.escape(selectedStationId)}"], [data-station-id="${CSS.escape(selectedStationId)}"]`,
      );
      return station ? [station] : [];
    }
    if (commutePathPreview) {
      const preview = root.querySelector<SVGGraphicsElement>(
        `[data-commute-path-preview="${CSS.escape(commutePathPreview.id)}"]`,
      );
      return preview ? [preview] : [];
    }
    return [];
  }, [commutePathPreview, containerRef, selectedStationId, selection]);

  const focusSelectedMapElements = useCallback(() => {
    if (loadState !== "ready") return false;
    const viewport = containerRef.current;
    if (!viewport) return false;

    const viewportRect = viewport.getBoundingClientRect();
    if (viewportRect.width <= 0 || viewportRect.height <= 0) return false;

    const elements = selectedMapElements();
    let visibleBounds: { x: number; y: number; width: number; height: number }[] = [];

    if (elements.length > 0) {
      visibleBounds = elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 && rect.height <= 0) return null;
          if (viewportOrientation === "rotated-landscape") {
            return {
              x: rect.top - viewportRect.top,
              y: viewportRect.width - (rect.right - viewportRect.left),
              width: rect.height,
              height: rect.width,
            };
          }
          return {
            x: rect.left - viewportRect.left,
            y: rect.top - viewportRect.top,
            width: rect.width,
            height: rect.height,
          };
        })
        .filter((bounds): bounds is NonNullable<typeof bounds> => bounds !== null);
    }

    const { width: logicalWidth, height: logicalHeight } = logicalViewportSize();
    if (logicalWidth <= 0 || logicalHeight <= 0) return false;

    const liveFittedTransform = defaultTransformForViewport(logicalWidth, logicalHeight);
    const effectiveFitScale = liveFittedTransform.scale || fitScale || 1;

    const current = currentRenderedTransform() ?? { x: 0, y: 0, scale: effectiveFitScale };
    const isMobile = typeof window !== "undefined" && window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
    const preferredTargetScale = clampPanZoomScale(effectiveFitScale * (isMobile ? 3.8 : 1.8), effectiveFitScale);
    const focusPadding = isMobile ? 24 : 40;
    const selectionFocusInsets = {
      left: focusPadding,
      right: focusPadding,
      top: isMobile ? focusPadding : Math.max(desktopMapTopInset + 16, focusPadding),
      bottom: Math.max(focusPadding, readMobileImpactInspectorInset(viewport) + focusPadding),
    };

    if (!isMobile && typeof window !== "undefined") {
      const desktopOverlay = readDesktopOverlayInsets(viewport);
      const shell = viewport.closest<HTMLElement>(".linewatch-shell");
      const overlayRightEdges = [
        desktopOverlay.left > 0 ? viewportRect.left + desktopOverlay.left : null,
        desktopMenuPinned ? shell?.querySelector<HTMLElement>("#linewatch-main-menu") : null,
        shell?.querySelector<HTMLElement>(".floating-panel-shell"),
      ].flatMap((element) => {
        if (typeof element === "number") return [element];
        if (!element || element.getAttribute("aria-hidden") === "true") return [];
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 ? [rect.right] : [];
      });

      if (overlayRightEdges.length > 0) {
        const overlayRight = Math.max(...overlayRightEdges);
        const minimumVisibleWidth = Math.min(320, viewportRect.width * 0.4);
        selectionFocusInsets.left = Math.max(selectionFocusInsets.left, Math.min(
          Math.max(overlayRight - viewportRect.left + 24, 0),
          Math.max(viewportRect.width - minimumVisibleWidth, 0),
        ));
      }
    }

    if (selectedStationId) {
      const station = stations.find((s) => s.id === selectedStationId);
      if (station) {
        const scaleFactor = 4500 / 8250;
        const pt = stationPointFor(station);
        const mapX = pt.x * scaleFactor;
        const mapY = pt.y * scaleFactor;
        const targetScale = preferredTargetScale;
        const storedRatio = readStoredSheetHeightRatio(typeof window !== "undefined" ? window.localStorage : null);
        const focusX = isMobile
          ? logicalWidth / 2
          : (logicalWidth + selectionFocusInsets.left - selectionFocusInsets.right) / 2;
        const focusY =
          isMobile && viewportOrientation !== "rotated-landscape"
            ? (logicalHeight * (1 - storedRatio)) / 2
            : (viewportOrientation === "rotated-landscape" ? logicalHeight * 0.34 : logicalHeight / 2);

        animateTransformTo({
          x: focusX - mapX * targetScale,
          y: focusY - mapY * targetScale,
          scale: targetScale,
        }, effectiveFitScale);
        return true;
      }
    }

    if (visibleBounds.length > 0) {
      const left = Math.min(...visibleBounds.map((bounds) => bounds.x));
      const right = Math.max(...visibleBounds.map((bounds) => bounds.x + bounds.width));
      const top = Math.min(...visibleBounds.map((bounds) => bounds.y));
      const bottom = Math.max(...visibleBounds.map((bounds) => bounds.y + bounds.height));
      const renderedCenterX = (left + right) / 2;
      const renderedCenterY = (top + bottom) / 2;
      const mapX = (renderedCenterX - current.x) / current.scale;
      const mapY = (renderedCenterY - current.y) / current.scale;

      const mapBounds = {
        x: (left - current.x) / current.scale,
        y: (top - current.y) / current.scale,
        width: Math.max((right - left) / current.scale, 1),
        height: Math.max((bottom - top) / current.scale, 1),
      };
      const selectionFit = computeBoundedMapFrame(
        logicalWidth,
        logicalHeight,
        mapBounds,
        selectionFocusInsets,
      );
      const targetScale = Math.min(
        clampPanZoomScale(preferredTargetScale, effectiveFitScale),
        selectionFit.scale * 0.92,
      );
      const { focusX: baseFocusX, focusY: baseFocusY } = computeInsetViewportFocus(
        logicalWidth,
        logicalHeight,
        selectionFocusInsets,
      );
      const focusX = baseFocusX;
      const focusY =
        viewportOrientation === "rotated-landscape"
          ? logicalHeight * 0.34
          : baseFocusY;

      animateTransformTo({
        x: focusX - mapX * targetScale,
        y: focusY - mapY * targetScale,
        scale: targetScale,
      }, effectiveFitScale);
      return true;
    }

    // Fallback if DOM elements aren't measured yet: try topology / boxes
    const rotatedPreviewFocusRatio =
      viewportOrientation === "rotated-landscape" ? { x: 0.5, y: 0.34 } : undefined;
    const focusViewportOptions = {
      viewportFocusRatio: rotatedPreviewFocusRatio,
      viewportInsets: selectionFocusInsets,
    };

    if (selection) {
      if (selectedSegmentIds.length === 0) {
        const matchingImpacts = stationNodeImpacts.filter(
          (impact) => impact.cardId === selection.id && impact.kind === selection.kind
        );
        if (matchingImpacts.length > 0) {
          const scaleFactor = 4500 / 8250;
          const impactPoints = matchingImpacts.flatMap((impact) => {
            const station = stations.find((s) => s.id === impact.stationId);
            if (!station) return [];
            const point = stationPointFor(station);
            return [{ x: point.x * scaleFactor, y: point.y * scaleFactor }];
          });
          if (impactPoints.length > 0) {
            const targetScale = isMobile ? 3.8 : 1.8;
            const left = Math.min(...impactPoints.map((point) => point.x));
            const right = Math.max(...impactPoints.map((point) => point.x));
            const top = Math.min(...impactPoints.map((point) => point.y));
            const bottom = Math.max(...impactPoints.map((point) => point.y));
            zoomToBounds({
              x: left - 32,
              y: top - 32,
              width: right - left + 64,
              height: bottom - top + 64,
            }, targetScale, focusViewportOptions);
            return true;
          }
        }
      } else {
        const svgBounds = boundsContainingBoxes(
          selectedSegmentIds.flatMap((segmentId) => focusBoxesBySegmentId.get(segmentId) ?? []),
        );
        if (svgBounds) {
          const targetScale = isMobile ? 3.8 : 1.8;
          zoomToBounds({
            x: svgBounds.x * SVG_TO_RENDERED_MAP_SCALE,
            y: svgBounds.y * SVG_TO_RENDERED_MAP_SCALE,
            width: svgBounds.width * SVG_TO_RENDERED_MAP_SCALE,
            height: svgBounds.height * SVG_TO_RENDERED_MAP_SCALE,
          }, targetScale, focusViewportOptions);
          return true;
        }
      }
    } else if (selectedStationId) {
      const station = stations.find((s) => s.id === selectedStationId);
      if (station) {
        const scaleFactor = 4500 / 8250;
        const pt = stationPointFor(station);
        const targetScale = isMobile ? 3.8 : 1.8;
        const centerX = pt.x * scaleFactor;
        const centerY = pt.y * scaleFactor;
        zoomToBounds({
          x: centerX - 32,
          y: centerY - 32,
          width: 64,
          height: 64,
        }, targetScale, focusViewportOptions);
        return true;
      }
    } else if (commutePathPreview && commutePathPreview.segmentIds.length > 0) {
      const svgBounds = boundsContainingBoxes(
        commutePathPreview.segmentIds.flatMap((segmentId) => focusBoxesBySegmentId.get(segmentId) ?? []),
      );
      if (svgBounds) {
        const targetScale = isMobile ? 3.8 : 1.8;
        zoomToBounds({
          x: svgBounds.x * SVG_TO_RENDERED_MAP_SCALE,
          y: svgBounds.y * SVG_TO_RENDERED_MAP_SCALE,
          width: svgBounds.width * SVG_TO_RENDERED_MAP_SCALE,
          height: svgBounds.height * SVG_TO_RENDERED_MAP_SCALE,
        }, targetScale, focusViewportOptions);
        return true;
      }
    }
    return false;
  }, [
    animateTransformTo,
    commutePathPreview,
    containerRef,
    currentRenderedTransform,
    defaultTransformForViewport,
    desktopMapTopInset,
    desktopMenuPinned,
    fitScale,
    focusBoxesBySegmentId,
    loadState,
    logicalViewportSize,
    selectedMapElements,
    selectedSegmentIds,
    selectedStationId,
    selection,
    stationNodeImpacts,
    stationPointFor,
    stations,
    viewportOrientation,
    zoomToBounds,
  ]);

  useEffect(() => {
    if (loadState !== "ready") return;

    const currentLayoutKey = `${layoutResetSignal ?? 0}:${desktopMenuPinned ? "pinned" : "free"}:${viewportOrientation}:${geometryReady}:${rasterMapReady}`;

    if (isGestureActive()) return;

    if (!focusTargetKey) {
      if (lastFocusedTargetKeyRef.current !== null) {
        lastFocusedTargetKeyRef.current = null;
        lastFocusLayoutKeyRef.current = currentLayoutKey;
        if (!preserveCameraOnSelectionClear) {
          recenter();
        }
      }
      return;
    }

    if (
      lastFocusedTargetKeyRef.current === focusTargetKey &&
      lastFocusLayoutKeyRef.current === currentLayoutKey
    ) {
      return;
    }

    let retryTimer: number | null = null;
    let attempts = 0;
    const tryFocus = () => {
      if (focusSelectedMapElements()) {
        lastFocusedTargetKeyRef.current = focusTargetKey;
        lastFocusLayoutKeyRef.current = currentLayoutKey;
      } else if (attempts < 12) {
        attempts++;
        retryTimer = window.setTimeout(tryFocus, 50);
      }
    };

    // The selected overlay is already committed when this effect runs. Arm
    // the desktop camera immediately so an entrance animation cannot advance
    // another frame between activation and focus. Mobile retains its settled
    // next-frame measurement because its inspector changes the usable viewport.
    const frame = mobilePerformanceMode
      ? window.requestAnimationFrame(tryFocus)
      : null;
    if (frame === null) tryFocus();
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [
    desktopMenuPinned,
    focusSelectedMapElements,
    focusTargetKey,
    geometryReady,
    isGestureActive,
    layoutResetSignal,
    loadState,
    mobilePerformanceMode,
    preserveCameraOnSelectionClear,
    rasterMapReady,
    recenter,
    viewportOrientation,
  ]);

  const stationBySummaryId = useMemo(() => {
    return new Map(stations.map((station) => [station.id, station]));
  }, [stations]);

  const linkedPlannedClosureIds = useMemo(() => new Set(
    activeAlerts
      .map((alert) => alert.relatedPlannedClosureId)
      .filter((id): id is string => Boolean(id)),
  ), [activeAlerts]);
  const currentPlannedClosureIds = useMemo(() => new Set([
    ...linkedPlannedClosureIds,
    ...plannedClosures
      .filter((closure) => closure.activeNow || closure.timingStatus === "active-now")
      .map((closure) => closure.id),
  ]), [linkedPlannedClosureIds, plannedClosures]);
  const overlapPlannedClosures = useMemo(
    () => plannedClosures.filter((closure) => !currentPlannedClosureIds.has(closure.id)),
    [currentPlannedClosureIds, plannedClosures],
  );
  const plannedPreviewClosures = useMemo(
    () => plannedClosures.filter((closure) =>
      !currentPlannedClosureIds.has(closure.id)
        || (selection?.kind === "planned-closure" && selection.id === closure.id),
    ),
    [currentPlannedClosureIds, plannedClosures, selection],
  );
  const activeClosureImpactCardIds = useMemo(
    () => buildActiveClosureImpactCardIds(activeAlerts, plannedClosures),
    [activeAlerts, plannedClosures],
  );

  const plannedPreviewSegmentIds = useMemo(() => {
    return new Set(plannedClosures.map((closure) => closure.previewSegmentIds).flat());
  }, [plannedClosures]);

  const renderedNetworkSegments = useMemo(() => {
    const stationById = new Map(mapStations.map((station) => [station.id, station]));

    return networkSegments
      .map((segment) => {
        const stationA = segment.stationAId ? stationById.get(segment.stationAId) : undefined;
        const stationB = segment.stationBId ? stationById.get(segment.stationBId) : undefined;
        const pointA = (segment.stationAAnchorId && anchorPoints.get(segment.stationAAnchorId)) ?? (stationA ? { x: stationA.x, y: stationA.y } : undefined);
        const pointB = (segment.stationBAnchorId && anchorPoints.get(segment.stationBAnchorId)) ?? (stationB ? { x: stationB.x, y: stationB.y } : undefined);

        let angle = 0;
        let originX = 0;
        let originY = 0;
        if (pointA && pointB) {
          angle = Math.atan2(pointB.y - pointA.y, pointB.x - pointA.x) * (180 / Math.PI);
          originX = pointA.x;
          originY = pointA.y;
        } else {
          const nums = segment.pathD.match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
          originX = nums[0] || 0;
          originY = nums[1] || 0;
        }

        return {
          ...segment,
          impacts: segment.impacts?.map((impact) =>
            normalizeActiveClosureMapImpact(impact, activeClosureImpactCardIds)
          ),
          pathD: resolveNetworkSegmentPath(segment, mapStations, anchorPoints, guidePaths),
          patternOriginX: originX,
          patternOriginY: originY,
          patternAngle: angle,
        } as RenderedNetworkSegment;
      })
      .filter((segment): segment is RenderedNetworkSegment => Boolean(segment.pathD));
  }, [networkSegments, mapStations, anchorPoints, guidePaths, activeClosureImpactCardIds]);

  const renderedOverlaySegments = useMemo(() => {
    return renderedNetworkSegments.filter((segment) => {
      const isClosurePreview = plannedPreviewSegmentIds.has(segment.id);
      return Boolean(segment.impacts?.length) || segment.overlay !== "clear" || isClosurePreview;
    });
  }, [renderedNetworkSegments, plannedPreviewSegmentIds]);

  const renderedImpactLayers = useMemo<RenderedImpactLayer[]>(() => {
    const groups = new Map<string, { impact: MapImpact; segments: RenderedNetworkSegment[] }>();

    for (const segment of renderedOverlaySegments) {
      const impacts = segment.impacts?.length ? segment.impacts : legacyImpactsForSegment(segment);
      for (const impact of impacts) {
        const key = impactLayerKey(impact);
        const group = groups.get(key);
        if (group) {
          group.segments.push(segment);
        } else {
          groups.set(key, { impact, segments: [segment] });
        }
      }
    }

    return Array.from(groups.values())
      .map(({ impact, segments }) => {
        const orderedSegments = orderSegmentsByIds(
          segments,
          segmentIdsForImpact(impact, activeAlerts, delays, reducedSpeedZones, plannedClosures),
        );
        const corridor = composeNetworkSegmentPath(orderedSegments, impact.travelDirection);
        if (!corridor.pathD) return null;
        return {
          impact,
          segment: compositeSegment(
            `${impact.kind}-${impact.cardId}-${impact.travelDirection}`,
            orderedSegments,
            corridor.pathD,
            corridor.travelDirection,
            corridor.segmentIds,
            labelForSegments(orderedSegments),
          ),
        };
      })
      .filter((layer): layer is RenderedImpactLayer => Boolean(layer))
      .sort((a, b) => getImpactPriority(a.impact.kind) - getImpactPriority(b.impact.kind));
  }, [activeAlerts, delays, plannedClosures, reducedSpeedZones, renderedOverlaySegments]);

  const plannedPreviewLayers = useMemo<RenderedPlannedPreviewLayer[]>(() => {
    return plannedPreviewClosures
      .map((closure) => {
        const orderedSegments = orderSegmentsByIds(
          renderedOverlaySegments.filter((segment) => shouldRenderPlannedPreviewLayer(segment, closure)),
          closure.previewSegmentIds,
        );
        const corridor = composeNetworkSegmentPath(
          orderedSegments,
          closure.travelDirection ?? "bidirectional",
        );
        if (!corridor.pathD) return null;
        return {
          segment: compositeSegment(
            `planned-preview-${closure.id}`,
            orderedSegments,
            corridor.pathD,
            corridor.travelDirection,
            corridor.segmentIds,
            closure.location || closure.title,
          ),
          closure,
        };
      })
      .filter((layer): layer is RenderedPlannedPreviewLayer => Boolean(layer));
  }, [plannedPreviewClosures, renderedOverlaySegments]);

  const retainedPlannedPreviewLayers = useRetainedMapLayers(
    plannedPreviewLayers,
    useCallback(({ segment, closure }) => `${segment.id}:${closure.id}`, []),
  );

  const retainedImpactLayers = useRetainedMapLayers(
    renderedImpactLayers,
    useCallback(({ segment, impact }) => `${segment.id}:${impact.kind}:${impact.cardId}:${impact.travelDirection}`, []),
  );

  const overlayPulseMotionPaused = mapEffectMotionPaused
    || renderedImpactLayers.length + plannedPreviewLayers.length
      > MAX_CONTINUOUSLY_ANIMATED_OVERLAY_LAYERS;

  const selectedImpactEmphasis = useMemo<SelectedImpactEmphasisLayer | null>(() => {
    if (!selection) return null;

    const activeLayer = renderedImpactLayers.find(
      ({ impact }) => impact.kind === selection.kind && impact.cardId === selection.id,
    );
    if (activeLayer) {
      return {
        id: selection.id,
        segment: activeLayer.segment,
        impact: activeLayer.impact,
        plannedClosure: null,
      };
    }

    if (selection.kind !== "planned-closure") return null;
    const previewLayer = plannedPreviewLayers.find(({ closure }) => closure.id === selection.id);
    return previewLayer ? {
      id: selection.id,
      segment: previewLayer.segment,
      impact: null,
      plannedClosure: previewLayer.closure,
    } : null;
  }, [selection, plannedPreviewLayers, renderedImpactLayers]);

  const retainedStationNodeImpacts = useRetainedMapLayers(
    stationNodeImpacts,
    useCallback((impact) => `${impact.kind}:${impact.cardId}:${impact.stationId}`, []),
  );

  const directionData = useMemo(
    () => ({
      activeAlerts,
      delays,
      reducedSpeedZones,
      plannedClosures,
    }),
    [activeAlerts, delays, plannedClosures, reducedSpeedZones],
  );

  const stationImpactDirectionLayers = useMemo<StationImpactDirectionLayer[]>(() => {
    const impactsByAnchor = new Map<
      string,
      { stationId: string; anchorId: string; impacts: typeof stationNodeImpacts }
    >();

    for (const impact of stationNodeImpacts) {
      const station = stationBySummaryId.get(impact.stationId);
      if (!station) continue;

      const anchors = stationImpactVisualAnchors(
        station,
        impact,
        directionData,
        stationCenterPoints,
      );

      for (const anchor of anchors) {
        const key = `${station.id}:${anchor.id}`;
        const existing = impactsByAnchor.get(key);
        if (existing) {
          existing.impacts.push(impact);
        } else {
          impactsByAnchor.set(key, {
            stationId: station.id,
            anchorId: anchor.id,
            impacts: [impact],
          });
        }
      }
    }

    return Array.from(impactsByAnchor.values())
      .map(({ stationId, anchorId, impacts }) => {
        const direction = stationImpactDirectionForStationImpacts(impacts, directionData);
        if (!direction) return null;

        return {
          key: `${stationId}:${anchorId}`,
          stationId,
          anchorId,
          arrow: direction.arrow.direction,
        };
      })
      .filter((layer): layer is StationImpactDirectionLayer => Boolean(layer));
  }, [directionData, stationBySummaryId, stationCenterPoints, stationNodeImpacts]);

  const retainedStationImpactDirectionLayers = useRetainedMapLayers(
    stationImpactDirectionLayers,
    useCallback((layer) => layer.key, []),
  );

  const commutePreviewLayer = useMemo(() => {
    if (!commutePathPreview || commutePathPreview.segmentIds.length === 0) {
      return null;
    }

    const previewSegmentIds = new Set(commutePathPreview.segmentIds);
    const orderedSegments = orderSegmentsByIds(
      renderedNetworkSegments.filter((segment) => previewSegmentIds.has(segment.id)),
      commutePathPreview.segmentIds,
    );
    const corridor = composeNetworkSegmentPath(orderedSegments, "bidirectional");
    if (!corridor.pathD) {
      return null;
    }

    return {
      preview: commutePathPreview,
      segment: compositeSegment(
        `commute-preview-${commutePathPreview.id}`,
        orderedSegments,
        corridor.pathD,
        corridor.travelDirection,
        corridor.segmentIds,
        commutePathPreview.routeLabel,
      ),
    };
  }, [commutePathPreview, renderedNetworkSegments]);

  const commutePreviewEndpointPoints = useMemo(() => {
    if (!commutePathPreview || commutePathPreview.stationIds.length === 0) {
      return [];
    }

    const stationById = new Map(stations.map((station) => [station.id, station]));
    const endpointIds = [
      commutePathPreview.stationIds[0],
      commutePathPreview.stationIds.at(-1),
    ].filter((stationId): stationId is string => Boolean(stationId));

    return endpointIds.flatMap((stationId) => {
      const station = stationById.get(stationId);
      return station
        ? visualAnchorsForStation(station).map((anchor) => anchor.point)
        : [];
    });
  }, [commutePathPreview, stations, visualAnchorsForStation]);

  const pulseSyncSignature = useMemo(() => {
    const plannedKeys = retainedPlannedPreviewLayers
      .map(({ item: { closure, segment }, exiting }) => `${segment.id}:${closure.id}:${exiting}`)
      .join("|");
    const impactKeys = retainedImpactLayers
      .map(({ item: { segment, impact }, exiting }) => `${segment.id}:${impact.kind}:${impact.cardId}:${impact.travelDirection}:${exiting}`)
      .join("|");
    const stationKeys = retainedStationNodeImpacts
      .map(({ item: impact, exiting }) => `${impact.kind}:${impact.cardId}:${impact.stationId}:${exiting}`)
      .join("|");
    return `${plannedKeys}::${impactKeys}::${stationKeys}`;
  }, [retainedImpactLayers, retainedPlannedPreviewLayers, retainedStationNodeImpacts]);

  useLayoutEffect(() => {
    const mapRoot = mapRootRef.current;
    if (!mapRoot) return;
    if (overlayPulseMotionPaused) {
      mapRoot.style.setProperty("--map-pulse-offset", "0ms");
      return;
    }
    const synchronizePulseAnimations = () => {
      const pulseClockMs = Number(document.timeline.currentTime ?? performance.now());
      const pulsePhaseMs = pulseClockMs % MAP_PULSE_CYCLE_MS;
      const pulseCycleStartMs = pulseClockMs - pulsePhaseMs;
      // All alert pulses use one document-timeline origin. This is stronger
      // than assigning the same currentTime sequentially because animations
      // can be instantiated on different rendering frames.
      mapRoot.style.setProperty("--map-pulse-offset", "0ms");
      for (const animation of mapRoot.getAnimations({ subtree: true })) {
        const animationName = "animationName" in animation
          ? String(animation.animationName)
          : "";
        if (SYNCHRONIZED_OVERLAY_PULSE_NAMES.has(animationName)) {
          animation.currentTime = pulsePhaseMs;
          animation.startTime = pulseCycleStartMs;
        }
      }
    };
    synchronizePulseAnimations();
    let settledPulseFrame: number | null = null;
    const pulseFrame = window.requestAnimationFrame(() => {
      synchronizePulseAnimations();
      settledPulseFrame = window.requestAnimationFrame(synchronizePulseAnimations);
    });
    return () => {
      window.cancelAnimationFrame(pulseFrame);
      if (settledPulseFrame !== null) window.cancelAnimationFrame(settledPulseFrame);
    };
  }, [loadState, overlayPulseMotionPaused, pulseSyncSignature]);

  const collisionBoxesByImpact = useMemo(() => {
    const boxesByImpact = new Map<string, SvgBounds[]>();
    const addBoxes = (kind: MapImpactKind, cardId: string, boxes: SvgBounds[]) => {
      const key = impactCollisionKey(kind, cardId);
      boxesByImpact.set(key, [...(boxesByImpact.get(key) ?? []), ...boxes]);
    };
    for (const { impact, segment } of renderedImpactLayers) {
      addBoxes(
        impact.kind,
        impact.cardId,
        pathCorridorCollisionBoxes(segment.pathD, OVERLAY_CORRIDOR_COLLISION_RADIUS),
      );
    }
    for (const { closure, segment } of plannedPreviewLayers) {
      addBoxes(
        "planned-closure",
        closure.id,
        pathCorridorCollisionBoxes(segment.pathD, OVERLAY_CORRIDOR_COLLISION_RADIUS),
      );
    }
    for (const impact of stationNodeImpacts) {
      const station = stationBySummaryId.get(impact.stationId);
      if (!station) continue;
      addBoxes(
        impact.kind,
        impact.cardId,
        stationImpactVisualAnchors(
          station,
          impact,
          directionData,
          stationCenterPoints,
        ).map((anchor) => stationOverlapProtectedBox(anchor.point)),
      );
    }
    return boxesByImpact;
  }, [directionData, plannedPreviewLayers, renderedImpactLayers, stationBySummaryId, stationCenterPoints, stationNodeImpacts]);

  const overlayCollisionBoxes = useMemo<SvgBounds[]>(() => {
    return Array.from(collisionBoxesByImpact.values()).flat();
  }, [collisionBoxesByImpact]);

  const rawSegmentOverlapBadgeGroups = useMemo(() => {
    return groupOverlapBadgeSegments(renderedOverlaySegments, overlapPlannedClosures);
  }, [overlapPlannedClosures, renderedOverlaySegments]);

  const stationOverlapBadgeGroups = useMemo(() => {
    return buildStationOverlapBadgeGroups({
      segments: renderedOverlaySegments,
      plannedClosures: overlapPlannedClosures,
      stationNodeImpacts,
      suppressedSignatures: new Set(rawSegmentOverlapBadgeGroups.map((group) => group.signature)),
    });
  }, [overlapPlannedClosures, renderedOverlaySegments, rawSegmentOverlapBadgeGroups, stationNodeImpacts]);

  const coveredSegmentOverlapSignatures = useMemo(() => {
    return coveredSegmentOverlapBadgeSignatures(rawSegmentOverlapBadgeGroups, stationOverlapBadgeGroups);
  }, [rawSegmentOverlapBadgeGroups, stationOverlapBadgeGroups]);

  const segmentOverlapBadgeGroups = useMemo(() => {
    return rawSegmentOverlapBadgeGroups.filter((group) => !coveredSegmentOverlapSignatures.has(group.signature));
  }, [coveredSegmentOverlapSignatures, rawSegmentOverlapBadgeGroups]);

  const overlapBadgeSegments = useMemo<OverlapBadgeSegment[]>(() => {
    const occupiedBoxes = [...mapCollisionBoxes, ...overlayCollisionBoxes];
    const placedBadges: PlacedOverlapBadge[] = [];
    return segmentOverlapBadgeGroups
      .map((group) => {
        const corridor = composeNetworkSegmentPath(group.segments, "bidirectional");
        if (!corridor.pathD) return null;

        const segment = compositeSegment(
          `overlap-${group.signature}`,
          group.segments,
          corridor.pathD,
          corridor.travelDirection,
          corridor.segmentIds,
          labelForSegments(group.segments),
        );
        const frame = pathMidpointFrame(segment.pathD);
        if (!frame) return null;

        const size = overlapBadgeSize(overlapBadgeVisualItemCount(overlapBadgeKindCounts(group.impacts)));
        const placementAnchors = overlapBadgePlacementAnchors(segment.pathD);
        const position = chooseNonIntersectingBadgePosition(frame.point, size, occupiedBoxes, frame, placedBadges);
        occupiedBoxes.push(expandBox(boundsForBadgePosition(position, size), 12));
        placedBadges.push({ anchor: frame.point, position, size });

        return {
          segmentId: group.segments[0]?.id ?? segment.id,
          layoutId: `segment:${group.segments.map((source) => source.id).sort().join("|")}`,
          label: segment.label,
          impactKinds: group.impactKinds,
          impacts: group.impacts,
          anchor: frame.point,
          placementAnchors,
          position,
          size,
          protectedBoxes: protectedBoxesForImpacts(
            group.impacts,
            collisionBoxesByImpact,
            pathCorridorCollisionBoxes(segment.pathD, OVERLAY_CORRIDOR_COLLISION_RADIUS),
          ),
        };
      })
      .filter((badge): badge is OverlapBadgeSegment => Boolean(badge));
  }, [collisionBoxesByImpact, mapCollisionBoxes, overlayCollisionBoxes, segmentOverlapBadgeGroups]);

  const stationOverlapBadges = useMemo<OverlapBadgeSegment[]>(() => {
    const occupiedBoxes = [
      ...mapCollisionBoxes,
      ...overlayCollisionBoxes,
      ...overlapBadgeSegments.map((badge) => expandBox(boundsForBadgePosition(badge.position, badge.size), 12)),
    ];
    const placedBadges: PlacedOverlapBadge[] = overlapBadgeSegments.map((badge) => ({
      anchor: badge.anchor,
      placementAnchors: badge.placementAnchors,
      position: badge.position,
      size: badge.size,
    }));

    return stationOverlapBadgeGroups
      .map((group) => {
        const station = stationBySummaryId.get(group.stationId);
        if (!station) return null;

        const point = stationPointFor(station);
        const size = overlapBadgeSize(overlapBadgeVisualItemCount(overlapBadgeKindCounts(group.impacts)));
        const position = chooseNonIntersectingBadgePosition(
          point,
          size,
          occupiedBoxes,
          null,
          placedBadges,
        );
        occupiedBoxes.push(expandBox(boundsForBadgePosition(position, size), 12));
        placedBadges.push({ anchor: point, position, size });

        return {
          segmentId: `station-${group.stationId}-${group.signature}`,
          layoutId: `station:${group.stationId}`,
          label: station.name,
          impactKinds: group.impactKinds,
          impacts: group.impacts,
          anchor: point,
          placementAnchors: [point],
          position,
          size,
          protectedBoxes: protectedBoxesForImpacts(
            group.impacts,
            collisionBoxesByImpact,
            [stationOverlapProtectedBox(point)],
          ),
        };
      })
      .filter((badge): badge is OverlapBadgeSegment => Boolean(badge));
  }, [
    collisionBoxesByImpact,
    mapCollisionBoxes,
    overlayCollisionBoxes,
    overlapBadgeSegments,
    stationBySummaryId,
    stationOverlapBadgeGroups,
    stationPointFor,
  ]);

  const organizedOverlapBadgeLayouts = useMemo(() => {
    const badges = [...overlapBadgeSegments, ...stationOverlapBadges];
    // This ref is an inert geometry cache: reading it does not drive rendering,
    // and the current badge inputs still own every recomputation boundary.
    // eslint-disable-next-line react-hooks/refs
    const lockedLayouts = lockedOverlapBadgeLayoutsRef.current;
    return organizeOverlapBadgeClusters({
      badges: badges.map((badge) => ({
        id: badge.layoutId,
        anchor: badge.anchor,
        placementAnchors: badge.placementAnchors,
        position: badge.position,
        size: badge.size,
      })),
      blockedBoxes: [...mapCollisionBoxes, ...overlayCollisionBoxes],
      mapBounds: MAP_VIEWBOX_BOUNDS,
      gap: OVERLAP_BADGE_SIBLING_CLEARANCE,
      maxAnchorDistance: OVERLAP_BADGE_ALIGNMENT_MAX_ANCHOR_DISTANCE,
      lockedLayouts,
    });
  }, [
    mapCollisionBoxes,
    overlayCollisionBoxes,
    overlapBadgeSegments,
    stationOverlapBadges,
  ]);

  useLayoutEffect(() => {
    if (!geometryReady) return;
    const nextLayouts = new Map<string, Map<string, MapPoint>>();
    for (const badge of organizedOverlapBadgeLayouts) {
      const positions = nextLayouts.get(badge.layoutKey) ?? new Map<string, MapPoint>();
      positions.set(badge.id, { ...badge.position });
      nextLayouts.set(badge.layoutKey, positions);
    }
    lockedOverlapBadgeLayoutsRef.current = nextLayouts;
  }, [geometryReady, organizedOverlapBadgeLayouts]);

  const overlapBadges = useMemo<OverlapBadgeWithChooser[]>(() => {
    const badges = [...overlapBadgeSegments, ...stationOverlapBadges];
    const clusteredPositions = new Map(organizedOverlapBadgeLayouts.map((badge) => [badge.id, badge.position]));
    const arrangedBadges = badges.map((badge) => {
      const clusteredPosition = clusteredPositions.get(badge.layoutId);
      if (!clusteredPosition || (
        clusteredPosition.x === badge.position.x
        && clusteredPosition.y === badge.position.y
      )) {
        return badge;
      }
      return {
        ...badge,
        position: { ...clusteredPosition, collisionAvoided: true },
      };
    });
    const badgeBoxes = arrangedBadges.map((badge) => (
      expandBox(boundsForBadgePosition(badge.position, badge.size), 12)
    ));

    return arrangedBadges.map((badge) => {
      const chooserSize = overlapChooserSize(badge.impacts.length, mapViewportSize.width);
      const chooserPosition = chooseOverlapChooserPosition({
        anchor: badge.position,
        badgeSize: badge.size,
        chooserSize,
        blockedBoxes: [...badge.protectedBoxes, ...badgeBoxes],
        mapBounds: MAP_VIEWBOX_BOUNDS,
      });
      return { ...badge, chooserPosition, chooserSize };
    });
  }, [
    mapViewportSize.width,
    organizedOverlapBadgeLayouts,
    overlapBadgeSegments,
    stationOverlapBadges,
  ]);
  const expandedOverlapBadge = overlapBadges.find((badge) => badge.segmentId === expandedOverlapBadgeId) ?? null;
  const expandedOverlapChooserLayout = expandedOverlapBadge
    ? overlapChooserScreenLayout(
      expandedOverlapBadge,
      transform,
      mapViewportSize,
      chooserKeepoutBoxes,
      overlayCollisionBoxes,
    )
    : null;

  const setLinkedImpactHover = useCallback((
    identity: TtcImpactHoverIdentity,
    hovered: boolean,
  ) => {
    if (!mapRootRef.current) return;
    setTtcImpactHovered(mapRootRef.current, identity, hovered);
  }, []);

  const setMapImpactHover = useCallback((nextImpact: TtcImpactHoverIdentity | null) => {
    const previousImpact = hoveredMapImpactRef.current;
    if (
      previousImpact?.kind === nextImpact?.kind
      && previousImpact?.id === nextImpact?.id
      && previousImpact?.segmentId === nextImpact?.segmentId
    ) return;

    if (
      previousImpact
      && !externallyHoveredImpactKeysRef.current.has(`${previousImpact.kind}:${previousImpact.id}`)
    ) {
      setLinkedImpactHover(previousImpact, false);
    }
    hoveredMapImpactRef.current = nextImpact;
    if (nextImpact) setLinkedImpactHover(nextImpact, true);
  }, [setLinkedImpactHover]);

  const setExternalImpactsHovered = useCallback((
    impacts: MapImpact[],
    hovered: boolean,
    activationPrefix: "badge" | "chooser",
    badgeId?: string,
  ) => {
    for (const impact of impacts) {
      const impactKey = `${impact.kind}:${impact.cardId}`;
      if (hovered) {
        externallyHoveredImpactKeysRef.current.add(impactKey);
        setLinkedImpactHover({
          kind: impact.kind,
          id: impact.cardId,
          activationKey: `${activationPrefix}:${badgeId ? `${badgeId}:` : ""}${impactKey}`,
        }, true);
        continue;
      }

      externallyHoveredImpactKeysRef.current.delete(impactKey);
      setLinkedImpactHover({ kind: impact.kind, id: impact.cardId }, false);
      const mapImpact = hoveredMapImpactRef.current;
      if (mapImpact?.kind === impact.kind && mapImpact.id === impact.cardId) {
        setLinkedImpactHover(mapImpact, true);
      }
    }
  }, [setLinkedImpactHover]);

  const clearMapHover = useCallback((preserveStationLabel = false) => {
    clearTtcTransientHover(mapRootRef.current);
    hoveredMapImpactRef.current = null;
    externallyHoveredImpactKeysRef.current.clear();
    chooserHoveredImpactRef.current = null;
    if (!preserveStationLabel) setHoveredStationLabelId(null);
  }, []);

  const highlightOverlapChooserImpact = useCallback((impact: MapImpact | null) => {
    const previousImpact = chooserHoveredImpactRef.current;
    if (previousImpact) {
      setExternalImpactsHovered([previousImpact], false, "chooser");
    }
    chooserHoveredImpactRef.current = impact;
    if (impact) {
      setExternalImpactsHovered([impact], true, "chooser");
    }
  }, [setExternalImpactsHovered]);


  return (
    <div
      ref={mapRootRef}
      className="relative w-full h-full flex flex-col overflow-hidden bg-transparent"
      data-map-viewport-orientation={viewportOrientation}
    >
      {/* Top right Theme toggle (styled like hamburger) and poll chip */}
      <div className="map-utility-cluster absolute top-4 sm:top-6 right-4 sm:right-6 z-20 flex items-center gap-2 pointer-events-auto hidden">
        <LogsDropdown />
        <button
          onClick={onToggleTheme}
          className="theme-toggle-btn panel flex items-center justify-center w-10 sm:w-14 h-10 sm:h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-200 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10]"
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun size={24} className="text-yellow-500 fill-yellow-500" />
          ) : (
            <Moon size={24} className="text-purple-500 fill-purple-500" />
          )}
        </button>
        <SiteGuideDropdown />
      </div>

      {/* Top center map controls */}
      {/* Note: ml-2 sm:ml-3 is added to visually center the mass of the controls, since the left side has 2 buttons and is visually heavier than the right side */}
      <div ref={mapControlRailRef} className="map-control-rail desktop-map-control-rail absolute top-14 sm:top-5 left-1/2 -translate-x-1/2 z-30 flex flex-row items-center justify-center gap-1 sm:gap-2 pointer-events-auto" data-map-chooser-keepout>
        <div className="map-control-recenter-container">
          <button
            onClick={recenterWithFeedback}
            className="map-control-button group"
            title="Center view"
            aria-label="Center map view"
          >
            <Locate size={22} className="map-control-recenter-icon" />
            <span className="map-control-recenter-desktop-label text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Center</span>
          </button>
          <span className="map-control-recenter-mobile-label">Center</span>
        </div>

        <div className="map-control-zoom-group">
          <div className="map-control-divider" aria-hidden="true" />

          <button
            onClick={zoomOut}
            className="map-control-button group"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut size={20} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Out</span>
          </button>

          <div className="map-control-slider flex items-center justify-center mx-0.5 sm:mx-1">
            <input
              type="range"
              min="0.2"
              max={PAN_ZOOM_MAX_RELATIVE_SCALE}
              step="0.05"
              value={relativeScale}
              onChange={(e) => zoomToScale(parseFloat(e.target.value))}
              className="w-16 md:w-20 accent-slate-900 dark:accent-white hover:accent-blue-600 dark:hover:accent-blue-400 cursor-pointer h-1.5 rounded-lg appearance-none bg-slate-900/20 dark:bg-white/30 transition-all outline-none"
              title="Zoom level"
              aria-label="Zoom level slider"
            />
          </div>

          <button
            onClick={zoomIn}
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
            <NetworkSelector network="ttc" onChange={onNetworkChange} ariaLabel="Map network switcher" />
          </div>
        )}

        {onMapViewChange && (
          <div className="desktop-map-control-view-group hidden md:flex items-center">
            <div className="map-control-divider" aria-hidden="true" />
            <MapViewSelector view={mapView ?? "diagram"} onChange={onMapViewChange} />
          </div>
        )}
      </div>

      {/* Map Viewport */}
      <div
        ref={containerRef}
        data-map-pan-zoom-viewport
        data-map-camera-moving="false"
        data-map-gesture-active="false"
        data-map-pointer-dragging="false"
        data-map-overlay-motion-paused={overlayPulseMotionPaused ? "true" : "false"}
        data-map-zoom-active="false"
        className="relative w-full h-full overflow-hidden select-none touch-none cursor-grab"
        onPointerDown={(event) => {
          clearMapHover(event.target instanceof Element && Boolean(event.target.closest(".station-label-hit-target")));
          handlePointerDown(event);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerCancel}
        onWheel={(event) => {
          if (!isMapWheelScrollRegionTarget(event.target)) clearMapHover();
          handleWheel(event);
        }}
        onClick={() => {
          if (shouldSuppressMapClick()) return;
          setExpandedOverlapBadgeId(null);
        }}
      >
        {loadState === "error" && (
          <div className="absolute inset-0 flex items-center justify-center text-red-500 dark:text-red-400 font-medium">
            Failed to load map asset.
          </div>
        )}
        <div className="map-attribution-notice" aria-label="TTC derivative map attribution">
          Inkscape re-creation based on TTC map · Not to scale
        </div>

        {loadState === "ready" && (
          <div
            ref={mapRef}
            data-map-label-font-ready={mapLabelFontReady ? "true" : "false"}
            data-raster-map-ready={rasterMapReady ? "true" : "false"}
            className="ttc-map-stage absolute top-0 left-0 origin-top-left"
            style={{
              // Match the transformed layer box to the authored map canvas.
              // A viewport-sized parent with this artwork overflowing it makes
              // Chromium repeatedly invalidate SVG and text tiles while zooming.
              // The regional map avoids that churn by transforming a stage with
              // the full intrinsic map dimensions.
              width: "4500px",
              height: "2181.8px",
              transformOrigin: "0 0",
            }}
          >
            <style>
              {`
                /* Keep geometry-only guides in the SVG layout tree so every
                   engine can resolve getScreenCTM(). Inkscape authors this
                   group as display:none, which WebKit may treat as having no
                   usable screen transform. Visibility suppresses painting
                   without removing the guide geometry from layout. */
                #non-linear-guides-layer {
                  display: inline !important;
                  visibility: hidden;
                  pointer-events: none;
                }

                /* Dark theme overrides for black elements in the SVG */
                .dark .ttc-svg-container svg .fil6,
                .dark .ttc-svg-container svg .fil1,
                .dark .ttc-svg-container svg [fill="black"],
                .dark .ttc-svg-container svg [fill="#000000"],
                .dark .ttc-svg-container svg [style*="fill:#000000"],
                .dark .ttc-svg-container svg [style*="fill:black"] {
                  fill: #f1f5f9 !important;
                }

                /* Keep authored station interiors and Spadina's connector black. */
                .dark .ttc-svg-container svg #ttc-stations-layer [inkscape\\:label="inner-pill"],
                .dark .ttc-svg-container svg #ttc-stations-layer [fill="#000000"],
                .dark .ttc-svg-container svg #ttc-stations-layer [style*="fill:#000000"],
                .dark .ttc-svg-container svg #ttc-stations-layer [style*="fill:black"] {
                  fill: #000000 !important;
                }

                /* Hide the white outline behind line numbers, but leave station dots alone */
                .ttc-svg-container svg .fil3:has(+ .fil0),
                .ttc-svg-container svg .fil3:has(+ .fil2),
                .ttc-svg-container svg .fil3:has(+ .fil4),
                .ttc-svg-container svg .fil3:has(+ .fil5),
                .ttc-svg-container svg .fil3:has(+ .fil8) {
                  display: none !important;
                }
              `}
            </style>

            <RasterMapPlane
              network="ttc"
              plane="background"
              theme={rasterTheme}
              density={rasterDensity}
              onReady={() => markRasterPlaneReady("background")}
            />

            <RasterMapPlane
              network="ttc"
              plane="badges"
              theme={rasterTheme}
              density={rasterDensity}
              style={{ opacity: lineBadgeOpacity }}
              onReady={() => markRasterPlaneReady("badges")}
            />

            {/* The live SVG now owns only dynamic visuals. Authored artwork is
                retained invisibly as the geometry source used by overlays. */}
            <div className="w-[4500px] h-[2181.8px] max-w-none ttc-svg-container pointer-events-none absolute top-0 left-0">
              <svg
                ref={mapSvgRef}
                className="raster-map-dynamic-plane absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 8250 4000"
                preserveAspectRatio="xMidYMid meet"
              >
                {/* Bottom Layer: Base tracks */}
                <g className="ttc-authored-svg-source" dangerouslySetInnerHTML={{ __html: svgParts?.part1 ?? "" }} />

                <g
                  aria-hidden="true"
                  className="ttc-authored-svg-source ttc-authored-line-badges"
                  pointerEvents="none"
                  style={{ opacity: lineBadgeOpacity }}
                  dangerouslySetInnerHTML={{ __html: svgParts?.badges ?? "" }}
                />

                {/* Middle Layer: Highlighted overlays injected underneath stations */}
                <defs>
                  <pattern id="badge-suspension-hash" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="12" height="12" fill="#ef4444" />
                    <line x1="0" y1="0" x2="0" y2="12" stroke="#ffffff" strokeWidth="5" />
                  </pattern>
                  <filter id="delay-static-filter" x="-20%" y="-20%" width="140%" height="140%">
                    <feTurbulence
                      type="fractalNoise"
                      baseFrequency="0.85"
                      numOctaves="2"
                      seed="7"
                      result="noise"
                    >
                      {reducedMotion ? null : (
                        <animate
                          attributeName="seed"
                          values="7;19;3;31;11;7"
                          dur="700ms"
                          repeatCount="indefinite"
                        />
                      )}
                    </feTurbulence>
                    <feColorMatrix in="noise" type="saturate" values="0" result="monoNoise" />
                    <feComposite in="monoNoise" in2="SourceGraphic" operator="in" />
                  </filter>
                </defs>
                <g aria-label="Disruption overlays">
                  {[
                    ...retainedPlannedPreviewLayers.map(({ key, item: { segment, closure }, exiting }) => ({
                      key, segment, impact: null, closure, exiting,
                    })),
                    ...retainedImpactLayers.map(({ key, item: { segment, impact }, exiting }) => ({
                      key, segment, impact, closure: undefined, exiting,
                    })),
                  ].sort((a, b) =>
                    getImpactPriority(a.impact?.kind ?? "planned-closure")
                    - getImpactPriority(b.impact?.kind ?? "planned-closure")
                  ).map(({ key, segment, impact, closure, exiting }) => {
                    if (
                      commutePreviewLayer && (
                        (closure && selectedImpactEmphasis?.plannedClosure?.id === closure.id)
                        || (impact && selectedImpactEmphasis?.impact?.kind === impact.kind &&
                          selectedImpactEmphasis.impact.cardId === impact.cardId)
                      )
                    ) return null;
                    return (
                      <OverlaySegment
                        key={key}
                        segment={segment}
                        impact={impact}
                        plannedClosure={closure}
                        selection={selection}
                        selectedSegmentIds={selectedSegmentIds}
                        onSelectImpact={onSelectImpact}
                        shouldSuppressMapClick={shouldSuppressMapClick}
                        reducedMotion={mapEffectMotionPaused}
                        exiting={exiting}
                        renderInteractionTarget={false}
                      />
                    );
                  })}
                </g>

                <g aria-label="Commute route preview">
                  {commutePreviewLayer ? (
                    <CommutePathOverlay
                      segment={commutePreviewLayer.segment}
                      endpointPoints={commutePreviewEndpointPoints}
                      preview={commutePreviewLayer.preview}
                    />
                  ) : null}
                </g>

                <g aria-label="Selected disruption emphasis">
                  {selectedImpactEmphasis ? (
                    commutePreviewLayer ? (
                      <g data-selected-commute-impact-overlay={selectedImpactEmphasis.id}>
                        <OverlaySegment
                          segment={selectedImpactEmphasis.segment}
                          impact={selectedImpactEmphasis.impact}
                          plannedClosure={selectedImpactEmphasis.plannedClosure ?? undefined}
                          selection={selection}
                          selectedSegmentIds={selectedSegmentIds}
                          onSelectImpact={onSelectImpact}
                          shouldSuppressMapClick={shouldSuppressMapClick}
                          reducedMotion={mapEffectMotionPaused}
                          idSuffix="-commute-focus"
                          renderInteractionTarget={false}
                        />
                      </g>
                    ) : (
                      <SelectedImpactEmphasis
                        key={`${selection?.kind}:${selectedImpactEmphasis.id}`}
                        emphasis={selectedImpactEmphasis}
                        introComplete={selectionIntroComplete}
                      />
                    )
                  ) : null}
                </g>

                {/* Repaint hovered visuals above impacts but below station artwork.
                    Reuse the original SVG so patterns and directional glyphs stay identical. */}
                <g aria-hidden="true" pointerEvents="none">
                  {[
                    ...retainedPlannedPreviewLayers.map(({ item: { segment, closure }, exiting }) => ({
                      segment, kind: "planned-closure" as const, id: closure.id, exiting,
                    })),
                    ...retainedImpactLayers.map(({ item: { segment, impact }, exiting }) => ({
                      segment, kind: impact.kind, id: impact.cardId, exiting,
                    })),
                  ].map(({ segment, kind, id, exiting }) => exiting ? null : (
                    <g
                      key={`hover-visual:${kind}:${id}:${segment.id}`}
                      className="ttc-impact-hover-foreground"
                      data-ttc-hover-impact-kind={kind}
                      data-ttc-hover-impact-id={id}
                      data-ttc-hover-segment-id={segment.id}
                    >
                      <use href={`#${ttcOverlayVisualId(kind, id, segment.id)}`} />
                    </g>
                  ))}
                </g>

                {/* Top Layer: custom-map station labels, dots, and connections */}
                <g className="ttc-authored-svg-source" dangerouslySetInnerHTML={{ __html: svgParts?.part2 ?? "" }} />
              </svg>
            </div>

            <RasterMapPlane
              network="ttc"
              plane="foreground"
              theme={rasterTheme}
              density={rasterDensity}
              onReady={() => markRasterPlaneReady("foreground")}
            />

            {/* Station names use their own static texture so the hover cutout
                cannot cloak tracks, station dots, or connection art
                that happens to sit inside the label's padded bounds. */}
            <RasterMapPlane
              network="ttc"
              plane="labels"
              theme={rasterTheme}
              density={rasterDensity}
              svgViewBox="0 0 8250 4000"
              cutoutElementHref={hoveredStationLabelId
                ? `#station-label-${hoveredStationLabelId}`
                : null}
              onReady={() => markRasterPlaneReady("labels")}
            />

            <svg
              className="raster-map-top-plane absolute top-0 left-0 w-[4500px] h-[2181.8px] pointer-events-none"
              viewBox="0 0 8250 4000"
              preserveAspectRatio="xMidYMid meet"
            >
              {hoveredStationLabelId && hoveredLabelPolygonPoints && hoveredLabelCenter && hoveredLabelBounds ? (
                <g
                  aria-hidden="true"
                  className="raster-station-label-text-hover"
                  key={hoveredStationLabelId}
                  data-hover-active={activeHoveredStationLabelId !== null}
                  style={{ transformOrigin: `${hoveredLabelCenter.x}px ${hoveredLabelCenter.y}px` }}
                >
                  <defs>
                    <clipPath id="ttc-hovered-station-label-clip" clipPathUnits="userSpaceOnUse">
                      <polygon points={hoveredLabelPolygonPoints} />
                    </clipPath>
                    <filter id="ttc-hovered-label-white-alpha" colorInterpolationFilters="sRGB">
                      <feColorMatrix
                        type="matrix"
                        values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"
                      />
                    </filter>
                    {/* Intersect the padded texture crop with the loaded-font
                        glyph alpha so neighboring station text cannot enter the
                        enlarged hover copy. */}
                    <filter id="ttc-hovered-label-target-alpha" colorInterpolationFilters="sRGB">
                      <feMorphology in="SourceAlpha" operator="dilate" radius="4" result="expandedTargetAlpha" />
                      <feColorMatrix
                        in="expandedTargetAlpha"
                        type="matrix"
                        values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"
                      />
                    </filter>
                    <mask
                      id="ttc-hovered-station-target-mask"
                      maskUnits="userSpaceOnUse"
                      x={hoveredLabelBounds.x}
                      y={hoveredLabelBounds.y}
                      width={hoveredLabelBounds.width}
                      height={hoveredLabelBounds.height}
                    >
                      <use
                        href={`#station-label-${hoveredStationLabelId}`}
                        filter="url(#ttc-hovered-label-target-alpha)"
                        visibility="visible"
                      />
                    </mask>
                    <mask
                      id="ttc-hovered-station-label-mask"
                      maskUnits="userSpaceOnUse"
                      x={hoveredLabelBounds.x}
                      y={hoveredLabelBounds.y}
                      width={hoveredLabelBounds.width}
                      height={hoveredLabelBounds.height}
                    >
                      <g mask="url(#ttc-hovered-station-target-mask)">
                        <image
                          href={rasterMapSource("ttc", "labels", rasterTheme, rasterDensity)}
                          width="8250"
                          height="4000"
                          preserveAspectRatio="xMidYMid meet"
                          clipPath="url(#ttc-hovered-station-label-clip)"
                          filter="url(#ttc-hovered-label-white-alpha)"
                        />
                      </g>
                    </mask>
                  </defs>
                  <image
                    href={rasterMapSource("ttc", "labels", rasterTheme, rasterDensity)}
                    width="8250"
                    height="4000"
                    preserveAspectRatio="xMidYMid meet"
                    mask="url(#ttc-hovered-station-label-mask)"
                  />
                </g>
              ) : null}
              <g aria-label="Estimated train markers">
                <EstimatedTrainMarkerLayer
                  enabled={estimatedTrainsEnabled}
                  markers={estimatedTrainMarkers}
                  segments={renderedNetworkSegments}
                  muted={Boolean(selection || selectedStationId || commutePathPreview)}
                  animate={!mapEffectMotionPaused}
                />
              </g>
              <g aria-label="Cardinal North Compass" transform="translate(7600, 2300) scale(4)">
                <image href="/assets/linewatch/cardinal-north.svg" width="75" height="100" className="opacity-90" style={{ filter: isDark ? "invert(1)" : "none" }} />
              </g>
            </svg>

            {/* Interactive Layer: Hit targets on the very top so they hover ABOVE stations */}
            <svg
              className="raster-map-interaction-plane absolute top-0 left-0 w-[4500px] h-[2181.8px] pointer-events-none"
              viewBox="0 0 8250 4000"
              preserveAspectRatio="xMidYMid meet"
            >
              <g
                aria-hidden="true"
                className="ttc-impact-hover-foreground-layer"
                pointerEvents="none"
              >
                {retainedPlannedPreviewLayers.map(({ key, item: { segment, closure }, exiting }) => (
                  exiting ? null : (
                    <TtcImpactHoverForeground
                      key={`hover:${key}`}
                      segment={segment}
                      kind="planned-closure"
                      impactId={closure.id}
                      visualState="planned-preview"
                    />
                  )
                ))}
                {retainedImpactLayers.map(({ key, item: { segment, impact }, exiting }) => (
                  exiting ? null : (
                    <TtcImpactHoverForeground
                      key={`hover:${key}`}
                      segment={segment}
                      kind={impact.kind}
                      impactId={impact.cardId}
                      visualState={visualStateForImpactKind(impact.kind)}
                    />
                  )
                ))}
              </g>
              <g aria-label="Disruption overlay interaction targets">
                {[
                  ...retainedPlannedPreviewLayers.map(({ key, item: { segment, closure }, exiting }) => ({
                    key, segment, impact: null, closure, exiting,
                  })),
                  ...retainedImpactLayers.map(({ key, item: { segment, impact }, exiting }) => ({
                    key, segment, impact, closure: undefined, exiting,
                  })),
                ].sort((a, b) =>
                  getImpactPriority(a.impact?.kind ?? "planned-closure")
                  - getImpactPriority(b.impact?.kind ?? "planned-closure")
                ).map(({ key, segment, impact, closure, exiting }) => (
                  <OverlayInteractionTarget
                    key={`interaction:${key}`}
                    segment={segment}
                    impact={impact}
                    plannedClosure={closure}
                    selectionActive={Boolean(selection)}
                    exiting={exiting}
                    onSelectImpact={onSelectImpact}
                    shouldSuppressMapClick={shouldSuppressMapClick}
                    onHoverChange={setMapImpactHover}
                  />
                ))}
              </g>
              <g aria-label="Station hit targets">
                {stations.map((station) => {
                  const selected = selectedStationId === station.id;
                  const isLarge = isStationVisuallyLarge(station);
                  const visualAnchors = visualAnchorsForStation(station);
                  const hasMultipleVisualAnchors = visualAnchors.length > 1;
                  // Match the authored dot outlines. Alert paths retain their own
                  // screen-space interaction corridors below these exact targets.
                  const hitRadius = hasMultipleVisualAnchors ? 34 : isLarge ? 67 : 37;
                  // Let the hover wash fully surround the authored marker instead
                  // of tracing its edge. Keep multi-anchor stations tighter so the
                  // two Spadina highlights remain visually distinct.
                  const hoverRadius = hasMultipleVisualAnchors ? 42 : isLarge ? 78 : 46;
                  const highlightRadius = hasMultipleVisualAnchors ? 33 : isLarge ? 48 : 38;
                  return (
                    <g
                      key={station.id}
                      onPointerEnter={(event) => {
                        if (event.pointerType !== "mouse") return;
                        setTtcStationHovered(mapRootRef.current, station.id, true);
                      }}
                      onPointerLeave={(event) => {
                        if (event.pointerType !== "mouse") return;
                        setTtcStationHovered(mapRootRef.current, station.id, false);
                      }}
                      onFocus={() => {
                        setTtcStationHovered(mapRootRef.current, station.id, true);
                      }}
                      onBlur={() => {
                        setTtcStationHovered(mapRootRef.current, station.id, false);
                        setHoveredStationLabelId((current) => current === station.id ? null : current);
                      }}
                    >
                      {visualAnchors.map(({ id: anchorId, point }, anchorIndex) => (
                        <g key={`${station.id}:${anchorId}`}>
                          <circle
                            data-station-hover-id={station.id}
                            data-station-anchor-id={anchorId}
                            data-station-hover-selected={selected ? "true" : "false"}
                            className="station-hover-indicator"
                            cx={point.x}
                            cy={point.y}
                            r={hoverRadius}
                            pointerEvents="none"
                          />
                          {commuteFlashStationIds.includes(station.id) && (
                            <circle
                              data-map-highlight-id={station.id}
                              data-station-anchor-id={anchorId}
                              className="station-commute-green-flash"
                              cx={point.x}
                              cy={point.y}
                              r={highlightRadius}
                              pointerEvents="none"
                            />
                          )}
                          {(selected || hasMultipleVisualAnchors) && (
                            <circle
                              data-station-selected-id={station.id}
                              data-station-anchor-id={anchorId}
                              className={`station-selected-indicator ${
                                hasMultipleVisualAnchors ? "multi-anchor" : ""
                              } ${selected ? "active" : ""} ${
                                selected ? "foreground-flash-active" : ""
                              }`}
                              cx={point.x}
                              cy={point.y}
                              r={highlightRadius}
                              pointerEvents="none"
                            />
                          )}
                          <circle
                            aria-hidden={anchorIndex === 0 ? undefined : true}
                            aria-label={anchorIndex === 0 ? `${station.name} station details` : undefined}
                            data-station-id={station.id}
                            data-station-anchor-id={anchorId}
                            data-station-primary-target={anchorIndex === 0 ? "true" : "false"}
                            className={`station-hit-target ${
                              hasMultipleVisualAnchors ? "multi-anchor" : ""
                            } ${selected ? "selected" : ""} ${
                              station.hasActiveImpact ? "has-impact" : ""
                            } access-${station.accessStatus}`}
                            cx={point.x}
                            cy={point.y}
                            r={hitRadius}
                            onPointerDown={(event) => {
                              if (event.pointerType === "mouse" && event.button !== 0) return;
                              try {
                                event.currentTarget.setPointerCapture(event.pointerId);
                              } catch {
                                // Pointer capture can fail if the browser ended the pointer first.
                              }
                            }}
                            onPointerUp={(event) => {
                              if (event.pointerType === "mouse" && event.button !== 0) return;
                              if (shouldSuppressMapClick()) return;
                              if (hasMultipleVisualAnchors) {
                                setTtcStationHovered(mapRootRef.current, station.id, false);
                              }
                              onSelectStationId(station.id);
                            }}
                            onClick={(event) => {
                              // Primary mouse/touch activation is handled on pointerup because
                              // browsers can drop the later synthesized click when the map camera
                              // transform is committed between pointerdown and click.
                              if (event.detail !== 0 || shouldSuppressMapClick()) return;
                              event.stopPropagation();
                              if (hasMultipleVisualAnchors) {
                                setTtcStationHovered(mapRootRef.current, station.id, false);
                              }
                              onSelectStationId(station.id);
                            }}
                            onKeyDown={(event) => {
                              if (anchorIndex !== 0) return;
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                if (hasMultipleVisualAnchors) {
                                  setTtcStationHovered(mapRootRef.current, station.id, false);
                                }
                                onSelectStationId(station.id);
                              }
                            }}
                            pointerEvents="all"
                            role="button"
                            tabIndex={anchorIndex === 0 ? 0 : -1}
                            vectorEffect="non-scaling-stroke"
                          />
                        </g>
                      ))}
                    </g>
                  );
                })}
              </g>
              <g aria-label="Station impact rings">
                {retainedStationNodeImpacts.map(({ key, item: impact, exiting }) => {
                  const station = stationBySummaryId.get(impact.stationId);
                  if (!station) return null;
                  const selected = selection?.kind === impact.kind && selection.id === impact.cardId;
                  const visualAnchors = stationImpactVisualAnchors(
                    station,
                    impact,
                    directionData,
                    stationCenterPoints,
                  );
                  const isLarge = isStationVisuallyLarge(station);
                  const effectRadius = stationImpactEffectRadius(isLarge);
                  const impactRingRadius = stationImpactRingRadius(isLarge);
                  const impactDirection = stationImpactDirectionForImpact(impact, directionData);
                  const directionLabel = impactDirection?.displayDirection
                    ? ` (${impactDirection.displayDirection})`
                    : "";

                  return (
                    <g
                      key={key}
                      className={exiting ? "map-layer-exiting" : "map-layer-current"}
                      style={exiting ? { pointerEvents: "none" } : undefined}
                    >
                      {visualAnchors.map(({ id: anchorId, point }) => (
                        <g key={`${key}:${anchorId}`}>
                          <circle
                            aria-label={`${impact.title}: ${station.name}${directionLabel}`}
                            className={`station-impact-ring ${impact.kind} ${selected ? "selected" : ""}`}
                            cx={point.x}
                            cy={point.y}
                            r={impactRingRadius}
                            fill="none"
                            onPointerDown={(event) => {
                              if (exiting || (event.pointerType === "mouse" && event.button !== 0)) return;
                              event.stopPropagation();
                              try {
                                event.currentTarget.setPointerCapture(event.pointerId);
                              } catch {
                                // Pointer capture can fail if the browser ended the pointer first.
                              }
                            }}
                            onPointerUp={(event) => {
                              if (exiting || (event.pointerType === "mouse" && event.button !== 0)) return;
                              event.stopPropagation();
                              if (shouldSuppressMapClick()) return;
                              onSelectImpact({ kind: impact.kind, id: impact.cardId });
                            }}
                            onClick={(event) => {
                              if (exiting) return;
                              // Pointer activation is handled on pointerup so a map-camera
                              // update cannot retarget the synthesized click to the station.
                              if (event.detail !== 0 || shouldSuppressMapClick()) return;
                              event.stopPropagation();
                              onSelectImpact({ kind: impact.kind, id: impact.cardId });
                            }}
                            onKeyDown={(event) => {
                              if (exiting) return;
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onSelectImpact({ kind: impact.kind, id: impact.cardId });
                              }
                            }}
                            onPointerEnter={(event) => {
                              if (event.pointerType !== "mouse" || exiting) return;
                              setMapImpactHover({
                                kind: impact.kind,
                                id: impact.cardId,
                                activationKey: `station:${impact.kind}:${impact.cardId}`,
                              });
                            }}
                            onPointerLeave={(event) => {
                              if (event.pointerType !== "mouse") return;
                              setMapImpactHover(null);
                            }}
                            onFocus={() => setMapImpactHover({
                              kind: impact.kind,
                              id: impact.cardId,
                              activationKey: `station:${impact.kind}:${impact.cardId}`,
                            })}
                            onBlur={() => setMapImpactHover(null)}
                            pointerEvents={exiting ? "none" : "stroke"}
                            role="button"
                            tabIndex={exiting ? -1 : 0}
                          />
                          <circle
                            className="station-impact-dot-red-glow"
                            cx={point.x}
                            cy={point.y}
                            r={effectRadius}
                            pointerEvents="none"
                          />
                          <circle
                            className="station-impact-dot-red-ping"
                            cx={point.x}
                            cy={point.y}
                            r={effectRadius}
                            pointerEvents="none"
                          />
                          <circle
                            className="station-impact-dot-red-beacon"
                            cx={point.x}
                            cy={point.y}
                            r={effectRadius}
                            pointerEvents="none"
                          />
                        </g>
                      ))}
                    </g>
                  );
                })}
              </g>
              {/* Keep names in one foreground interaction plane. When label targets
                  are interleaved with station dots, a later invisible dot or impact
                  corridor can steal hover from part of the rendered text. */}
              <g aria-label="Station label hit targets">
                {stations.map((station) => {
                  const labelPolygon = stationLabelPolygons.get(station.id);
                  if (!labelPolygon) return null;

                  return (
                    <polygon
                      key={`station-label-target:${station.id}`}
                      aria-hidden="true"
                      data-station-label-id={station.id}
                      className="station-label-hit-target"
                      points={labelPolygon.map((point) => `${point.x},${point.y}`).join(" ")}
                      focusable="false"
                      onPointerEnter={(event) => {
                        if (event.pointerType !== "mouse") return;
                        setTtcStationHovered(mapRootRef.current, station.id, false);
                        setHoveredStationLabelId(station.id);
                      }}
                      onPointerOver={(event) => {
                        if (event.pointerType !== "mouse") return;
                        setHoveredStationLabelId((current) => current === station.id ? current : station.id);
                      }}
                      onPointerLeave={(event) => {
                        if (event.pointerType !== "mouse") return;
                        setHoveredStationLabelId((current) => current === station.id ? null : current);
                      }}
                      onPointerDown={(event) => {
                        if (event.pointerType === "mouse" && event.button !== 0) return;
                        try {
                          event.currentTarget.setPointerCapture(event.pointerId);
                        } catch {
                          // Pointer capture can fail if the browser ended the pointer first.
                        }
                      }}
                      onPointerUp={(event) => {
                        if (event.pointerType === "mouse" && event.button !== 0) return;
                        if (shouldSuppressMapClick()) return;
                        onSelectStationId(station.id);
                      }}
                      onClick={(event) => {
                        if (event.detail !== 0 || shouldSuppressMapClick()) return;
                        event.stopPropagation();
                        onSelectStationId(station.id);
                      }}
                      pointerEvents="all"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </g>
              <g aria-label="Station impact direction glyphs">
                {retainedStationImpactDirectionLayers.map(({ key, item: impactDirection, exiting }) => {
                  const station = stationBySummaryId.get(impactDirection.stationId);
                  if (!station) return null;
                  const point = stationCenterPoints.get(impactDirection.anchorId) ?? stationPointFor(station);
                  const isLarge = isStationVisuallyLarge(station);
                  const badgeRadius = stationImpactDirectionBadgeRadius(isLarge);

                  return (
                    <g
                      key={key}
                      className={exiting ? "map-layer-exiting" : "map-layer-current"}
                      style={exiting ? { pointerEvents: "none" } : undefined}
                    >
                      <StationImpactDirectionGlyph
                        x={point.x}
                        y={point.y}
                        direction={impactDirection.arrow}
                        radius={badgeRadius}
                      />
                    </g>
                  );
                })}
              </g>
              <g aria-label="Station impact foreground highlights" pointerEvents="none">
                {stations.map((station) => {
                  if (selectedStationId !== station.id) return null;
                  const visualAnchors = visualAnchorsForStation(station);
                  const isLarge = isStationVisuallyLarge(station);
                  const highlightRadius = stationImpactRingRadius(isLarge);

                  return (
                    <g key={`station-selection-foreground:${station.id}`}>
                      {visualAnchors.map(({ id: anchorId, point }) => (
                        <circle
                          key={`${station.id}:${anchorId}`}
                          data-map-highlight-id={station.id}
                          data-station-selection-foreground={station.id}
                          data-station-anchor-id={anchorId}
                          className={`station-selection-flash map-selection-attention${selectionIntroComplete ? " selection-intro-complete" : ""}`}
                          cx={point.x}
                          cy={point.y}
                          r={highlightRadius}
                        />
                      ))}
                    </g>
                  );
                })}
                {retainedStationNodeImpacts.map(({ key, item: impact, exiting }) => {
                  if (exiting) return null;
                  const station = stationBySummaryId.get(impact.stationId);
                  if (!station) return null;
                  const visualAnchors = stationImpactVisualAnchors(
                    station,
                    impact,
                    directionData,
                    stationCenterPoints,
                  );
                  const isLarge = isStationVisuallyLarge(station);
                  const impactRingRadius = stationImpactRingRadius(isLarge);

                  return (
                    <g key={`foreground:${key}`}>
                      {visualAnchors.map(({ id: anchorId, point }) => (
                        <g key={`foreground-anchor:${key}:${anchorId}`}>
                          {selection && !commutePreviewLayer && selection.kind === impact.kind && selection.id === impact.cardId ? (
                            <circle
                              data-map-highlight-id={selection.id}
                              data-station-impact-selection-id={impact.cardId}
                              className={`station-selection-flash map-selection-attention${selectionIntroComplete ? " selection-intro-complete" : ""}`}
                              cx={point.x}
                              cy={point.y}
                              r={impactRingRadius}
                            />
                          ) : null}
                          <circle
                            data-ttc-hover-impact-kind={impact.kind}
                            data-ttc-hover-impact-id={impact.cardId}
                            className="station-impact-hover-priority"
                            cx={point.x}
                            cy={point.y}
                            r={impactRingRadius + 5}
                          />
                        </g>
                      ))}
                    </g>
                  );
                })}
              </g>
              <g aria-label="Overlapping alert badges">
                {overlapBadges
                  .filter((badge) => badge.segmentId !== expandedOverlapBadgeId)
                  .map((badge) => (
                    <OverlapIndicatorMarker
                      key={badge.segmentId}
                      badge={badge}
                      selection={selection}
                      isOpen={false}
                      onToggle={() => {
                        clearMapHover();
                        setExpandedOverlapBadgeId(badge.segmentId);
                      }}
                      onHoverChange={(hovered) => setExternalImpactsHovered(
                        badge.impacts,
                        hovered,
                        "badge",
                        badge.segmentId,
                      )}
                      shouldSuppressMapClick={shouldSuppressMapClick}
                    />
                  ))}
                {overlapBadges
                  .filter((badge) => badge.segmentId === expandedOverlapBadgeId)
                  .map((badge) => (
                    <OverlapIndicatorMarker
                      key={badge.segmentId}
                      badge={badge}
                      selection={selection}
                      isOpen
                      onToggle={() => {
                        clearMapHover();
                        setExpandedOverlapBadgeId(null);
                      }}
                      onHoverChange={(hovered) => setExternalImpactsHovered(
                        badge.impacts,
                        hovered,
                        "badge",
                        badge.segmentId,
                      )}
                      shouldSuppressMapClick={shouldSuppressMapClick}
                    />
                  ))}
              </g>
            </svg>
          </div>
        )}
        {recenterFeedbackKey > 0 ? (
          <div
            key={recenterFeedbackKey}
            aria-hidden="true"
            className="map-center-feedback"
            data-map-center-feedback="ttc"
          />
        ) : null}
        {expandedOverlapBadge && expandedOverlapChooserLayout ? (
          <OverlapChooser
            key={expandedOverlapBadge.segmentId}
            badge={expandedOverlapBadge}
            layout={expandedOverlapChooserLayout}
            onSelectImpact={onSelectImpact}
            onHoverImpact={highlightOverlapChooserImpact}
            onClose={(restoreFocus) => {
              clearMapHover();
              setExpandedOverlapBadgeId(null);
              if (!restoreFocus) return;
              window.requestAnimationFrame(() => {
                const escapedId = CSS.escape(expandedOverlapBadge.segmentId);
                mapRootRef.current
                  ?.querySelector<SVGGElement>(`[data-overlap-segment-id="${escapedId}"] .overlap-indicator`)
                  ?.focus();
              });
            }}
            reducedMotion={reducedMotion}
            compactMotion={mapViewportSize.width <= OVERLAP_CHOOSER_MOBILE_BREAKPOINT}
            viewportOrientation={viewportOrientation}
            viewportSize={mapViewportSize}
          />
        ) : null}
      </div>
      {commutePathPreview && !selection ? (
        <div className="commute-path-preview-chip" role="status" aria-live="polite" data-map-chooser-keepout>
          <span>
            Viewing <strong>{commutePathPreview.routeLabel}</strong>
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClearCommutePathPreview?.();
            }}
            aria-label="Back to My Commutes"
          >
            Back
          </button>
        </div>
      ) : null}
    </div>
  );
}

type RenderedNetworkSegment = NetworkSegment & {
  patternOriginX?: number;
  patternOriginY?: number;
  patternAngle?: number;
  sourceSegmentIds?: string[];
};

type RenderedImpactLayer = {
  segment: RenderedNetworkSegment;
  impact: MapImpact;
};

type RenderedPlannedPreviewLayer = {
  segment: RenderedNetworkSegment;
  closure: PlannedClosure;
};

type SelectedImpactEmphasisLayer = {
  id: string;
  segment: RenderedNetworkSegment;
  impact: MapImpact | null;
  plannedClosure: PlannedClosure | null;
};

type StationImpactDirectionLayer = {
  key: string;
  stationId: string;
  anchorId: string;
  arrow: StationImpactArrowDirection;
};

type SvgBounds = MapBounds;

type OverlapBadgeSize = MapOverlapIndicatorSize;

type OverlapBadgePosition = MapPoint & {
  collisionAvoided: boolean;
};

type OverlapBadgeSegment = {
  segmentId: string;
  layoutId: string;
  label: string;
  impactKinds: MapImpactKind[];
  impacts: MapImpact[];
  anchor: MapPoint;
  placementAnchors: MapPoint[];
  position: OverlapBadgePosition;
  size: OverlapBadgeSize;
  protectedBoxes: SvgBounds[];
};

type OverlapBadgeWithChooser = OverlapBadgeSegment & {
  chooserPosition: OverlapBadgePosition;
  chooserSize: OverlapBadgeSize;
};

type OverlapBadgeGroup = {
  signature: string;
  segments: RenderedNetworkSegment[];
  impacts: MapImpact[];
  impactKinds: MapImpactKind[];
};

type OverlayVisualState =
  | "suspension"
  | "delay-static"
  | "reduced-speed-zone"
  | "planned-preview";

const MAP_VIEWBOX_BOUNDS: SvgBounds = { x: 0, y: 0, width: 8250, height: 4000 };
const OVERLAY_CORRIDOR_COLLISION_RADIUS = 54;
const BASE_ROUTE_COLLISION_RADIUS = 78;
const OVERLAP_BADGE_EDGE_GAP = 8;
// Matches the 10-unit candidate and 12-unit occupied-box padding below, so an
// aligned pair can touch those collision envelopes without visually drifting.
// We add an extra 14 units because 22 was too close visually.
const OVERLAP_BADGE_SIBLING_CLEARANCE = 36;
const OVERLAP_BADGE_ALIGNMENT_MAX_ANCHOR_DISTANCE = 260;
const OVERLAP_BADGE_MAP_COMPONENT_PADDING = 18;
const OVERLAP_BADGE_TEXT_PADDING = 18;
// Overlap markers are a primary alert-discovery control. Keep their collision
// footprint in step with the rendered SVG scale so the larger desktop and
// mobile targets still clear nearby map content.
const STANDARD_MAP_COMPONENT_MAX_BOUNDS = 1200;
const LARGE_MAP_COMPONENT_MAX_THICKNESS = 220;
const LARGE_MAP_COMPONENT_TILE_LENGTH = 760;
const MAP_SVG_TO_CSS_SCALE = 4500 / MAP_VIEWBOX_BOUNDS.width;
const OVERLAP_CHOOSER_WIDTH = 360;
const OVERLAP_CHOOSER_MOBILE_BREAKPOINT = 640;
const OVERLAP_CHOOSER_MOBILE_WIDTH = 280;
const OVERLAP_CHOOSER_TARGET_GAP = 16;
const OVERLAP_CHOOSER_GAP_DEVIATION_WEIGHT = 4;
const OVERLAP_CHOOSER_UI_GAP = 8;
const MAX_SOFT_OVERLAY_DISTANCE_PENALTY = 48;

function impactCollisionKey(kind: MapImpactKind, cardId: string): string {
  return `${kind}:${cardId}`;
}

function protectedBoxesForImpacts(
  impacts: MapImpact[],
  boxesByImpact: Map<string, SvgBounds[]>,
  fallback: SvgBounds[],
): SvgBounds[] {
  const boxes = impacts.flatMap((impact) => boxesByImpact.get(impactCollisionKey(impact.kind, impact.cardId)) ?? []);
  return boxes.length > 0 ? boxes : fallback;
}

function overlapBadgePlacementAnchors(pathD: string, maximumCount = 7): MapPoint[] {
  const points = pathCorridorCollisionBoxes(pathD, OVERLAY_CORRIDOR_COLLISION_RADIUS).map((box) => ({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  }));
  if (points.length <= maximumCount) return points;

  return Array.from({ length: maximumCount }, (_unused, index) => (
    points[Math.round(index * (points.length - 1) / (maximumCount - 1))]
  ));
}

function stationOverlapProtectedBox(point: MapPoint): SvgBounds {
  return expandBox(
    { x: point.x, y: point.y, width: 0, height: 0 },
    OVERLAY_CORRIDOR_COLLISION_RADIUS,
  );
}

function overlapChooserSize(impactCount: number, viewportWidth = OVERLAP_CHOOSER_WIDTH + 32): OverlapBadgeSize {
  const isMobile = viewportWidth <= OVERLAP_CHOOSER_MOBILE_BREAKPOINT;
  const maximumWidth = isMobile ? OVERLAP_CHOOSER_MOBILE_WIDTH : OVERLAP_CHOOSER_WIDTH;
  const horizontalMargin = isMobile ? 48 : 32;
  return {
    width: Math.max(240, Math.min(maximumWidth, viewportWidth - horizontalMargin)),
    height: isMobile
      ? Math.min(380, 56 + impactCount * 64)
      : Math.min(440, 68 + impactCount * 88),
  };
}

function clampChooserScreenCoordinate(
  coordinate: number,
  chooserLength: number,
  viewportLength: number,
  margin: number,
): number {
  const minimum = margin + chooserLength / 2;
  const maximum = Math.max(minimum, viewportLength - margin - chooserLength / 2);
  return Math.min(maximum, Math.max(minimum, coordinate));
}

type OverlapChooserScreenLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  anchorOffsetX: number;
  anchorOffsetY: number;
};

const OVERLAP_CHOOSER_MIN_COMPACT_HEIGHT = 142;
const OVERLAP_CHOOSER_HEIGHT_STEP = 4;

function overlapChooserScreenLayout(
  badge: OverlapBadgeWithChooser,
  mapTransform: { x: number; y: number; scale: number },
  viewportSize: { width: number; height: number },
  screenKeepoutBoxes: SvgBounds[] = [],
  mapAlertOverlayBoxes: SvgBounds[] = [],
): OverlapChooserScreenLayout {
  const mapContentScale = mapTransform.scale * MAP_SVG_TO_CSS_SCALE;
  const anchor = {
    x: mapTransform.x + badge.position.x * mapContentScale,
    y: mapTransform.y + badge.position.y * mapContentScale,
  };
  const proposed = {
    x: mapTransform.x + badge.chooserPosition.x * mapContentScale,
    y: mapTransform.y + badge.chooserPosition.y * mapContentScale,
  };
  const toScreenBox = (box: SvgBounds): SvgBounds => ({
    x: mapTransform.x + box.x * mapContentScale,
    y: mapTransform.y + box.y * mapContentScale,
    width: box.width * mapContentScale,
    height: box.height * mapContentScale,
  });
  const representedProtectedBoxes = badge.protectedBoxes.map(toScreenBox);
  const alertOverlayProtectedBoxes = mapAlertOverlayBoxes.map(toScreenBox);
  const badgeScreenBox = expandBox({
    x: anchor.x - badge.size.width * mapContentScale / 2,
    y: anchor.y - badge.size.height * mapContentScale / 2,
    width: badge.size.width * mapContentScale,
    height: badge.size.height * mapContentScale,
  }, OVERLAP_CHOOSER_UI_GAP);
  const protectedArea = boundsContainingBoxes(representedProtectedBoxes) ?? {
    x: anchor.x,
    y: anchor.y,
    width: 0,
    height: 0,
  };
  const margin = 16;
  const direction = {
    x: proposed.x - anchor.x,
    y: proposed.y - anchor.y,
  };
  const preferredAxis = Math.abs(direction.x) > Math.abs(direction.y) ? "horizontal" : "vertical";
  const preferredHorizontalSign = direction.x < 0 ? -1 : 1;
  const preferredVerticalSign = direction.y < 0 ? -1 : 1;
  const paddedScreenKeepoutBoxes = screenKeepoutBoxes.map((box) => expandBox(box, OVERLAP_CHOOSER_UI_GAP));
  const requestedSize = badge.chooserSize;
  const minimumHeight = Math.min(
    requestedSize.height,
    Math.max(80, Math.min(OVERLAP_CHOOSER_MIN_COMPACT_HEIGHT, viewportSize.height - margin * 2)),
  );
  const heightCandidates: number[] = [];
  for (let height = requestedSize.height; height > minimumHeight; height -= OVERLAP_CHOOSER_HEIGHT_STEP) {
    heightCandidates.push(height);
  }
  heightCandidates.push(minimumHeight);

  const attemptLayout = (chooserSize: OverlapBadgeSize) => {
  const horizontalCenter = (sign: number, gap: number) => ({
    x: sign < 0
      ? protectedArea.x - chooserSize.width / 2 - gap
      : protectedArea.x + protectedArea.width + chooserSize.width / 2 + gap,
    y: clampChooserScreenCoordinate(proposed.y, chooserSize.height, viewportSize.height, margin),
  });
  const verticalCenter = (sign: number, gap: number) => ({
    x: clampChooserScreenCoordinate(proposed.x, chooserSize.width, viewportSize.width, margin),
    y: sign < 0
      ? protectedArea.y - chooserSize.height / 2 - gap
      : protectedArea.y + protectedArea.height + chooserSize.height / 2 + gap,
  });
  const candidatesForGap = (gap: number) => preferredAxis === "horizontal"
    ? [
        horizontalCenter(preferredHorizontalSign, gap),
        horizontalCenter(-preferredHorizontalSign, gap),
        verticalCenter(preferredVerticalSign, gap),
        verticalCenter(-preferredVerticalSign, gap),
      ]
    : [
        verticalCenter(preferredVerticalSign, gap),
        verticalCenter(-preferredVerticalSign, gap),
        horizontalCenter(preferredHorizontalSign, gap),
        horizontalCenter(-preferredHorizontalSign, gap),
      ];
  const preferredCandidates = candidatesForGap(OVERLAP_CHOOSER_TARGET_GAP);
  const edgeCandidates = candidatesForGap(0);
  const hardKeepoutBoxes = [badgeScreenBox, ...paddedScreenKeepoutBoxes];
  const uiKeepoutBoxes = paddedScreenKeepoutBoxes;
  const localProtectedBoxes = nearestProtectedBoxesToPoint(representedProtectedBoxes, anchor, 6);
  const alertEdgeCandidates = chooserKeepoutEdgeCandidates(
    proposed,
    chooserSize,
    viewportSize,
    [protectedArea, ...localProtectedBoxes],
    margin,
    OVERLAP_CHOOSER_TARGET_GAP,
  );
  const uiEdgeCandidates = chooserKeepoutEdgeCandidates(
    proposed,
    chooserSize,
    viewportSize,
    hardKeepoutBoxes,
    margin,
  );
  const hardBlockedBoxes = [...representedProtectedBoxes, ...hardKeepoutBoxes];
  const viewportCandidates = boundedChooserViewportCandidates(
    anchor,
    chooserSize,
    viewportSize,
    margin,
  );
  const exhaustiveUiCandidates = chooserKeepoutGridCandidates(
    proposed,
    chooserSize,
    viewportSize,
    hardKeepoutBoxes,
    margin,
  );
  const allCandidates = [
    ...preferredCandidates,
    ...edgeCandidates,
    ...alertEdgeCandidates,
    ...uiEdgeCandidates,
    ...viewportCandidates,
    ...exhaustiveUiCandidates,
  ];
  const validCandidates = allCandidates
    .filter((candidate) =>
      chooserCenterFitsViewport(candidate, chooserSize, viewportSize, 0)
        && chooserCenterAvoidsProtectedBoxes(candidate, chooserSize, hardBlockedBoxes),
    );
  const uiSafeCandidates = validCandidates.length > 0 ? [] : [
    ...allCandidates,
  ].filter((candidate) =>
    chooserCenterFitsViewport(candidate, chooserSize, viewportSize, 0)
      && chooserCenterAvoidsProtectedBoxes(candidate, chooserSize, uiKeepoutBoxes),
  );
  const badgeOnlyCandidates = validCandidates.length > 0 || uiSafeCandidates.length > 0
    ? []
    : [
        ...preferredCandidates,
        ...edgeCandidates,
        ...viewportCandidates,
        ...exhaustiveUiCandidates,
      ].filter((candidate) =>
        chooserCenterFitsViewport(candidate, chooserSize, viewportSize, 0)
          && chooserCenterAvoidsProtectedBoxes(candidate, chooserSize, [badgeScreenBox]),
      );
  const centerCandidates = validCandidates.length > 0
    ? validCandidates
    : uiSafeCandidates.length > 0
      ? uiSafeCandidates
      : badgeOnlyCandidates;
  const center = centerCandidates.reduce<{ position: MapPoint; score: number } | null>((best, position) => {
    const score = scoreChooserScreenCandidate(
      position,
      anchor,
      chooserSize,
      representedProtectedBoxes,
      alertOverlayProtectedBoxes,
    );
    return !best || score < best.score ? { position, score } : best;
  }, null)?.position ?? {
    x: clampChooserScreenCoordinate(proposed.x, chooserSize.width, viewportSize.width, margin),
    y: clampChooserScreenCoordinate(proposed.y, chooserSize.height, viewportSize.height, margin),
  };

  return {
    center,
    clearsUiKeepouts: validCandidates.length > 0 || uiSafeCandidates.length > 0,
  };
  };

  let chosenSize = requestedSize;
  let chosenAttempt = attemptLayout(requestedSize);
  for (const height of heightCandidates) {
    const size = { width: requestedSize.width, height };
    const attempt = attemptLayout(size);
    chosenSize = size;
    chosenAttempt = attempt;
    if (attempt.clearsUiKeepouts) break;
  }
  const center = chosenAttempt.center;

  return {
    left: center.x - chosenSize.width / 2,
    top: center.y - chosenSize.height / 2,
    width: chosenSize.width,
    height: chosenSize.height,
    anchorOffsetX: anchor.x - center.x,
    anchorOffsetY: anchor.y - center.y,
  };
}

function boundedChooserViewportCandidates(
  anchor: MapPoint,
  chooserSize: OverlapBadgeSize,
  viewportSize: { width: number; height: number },
  margin: number,
): MapPoint[] {
  const minimumX = margin + chooserSize.width / 2;
  const maximumX = viewportSize.width - margin - chooserSize.width / 2;
  const minimumY = margin + chooserSize.height / 2;
  const maximumY = viewportSize.height - margin - chooserSize.height / 2;
  if (maximumX < minimumX || maximumY < minimumY) return [];

  const nearHorizontalOffset = chooserSize.width / 2 + OVERLAP_CHOOSER_UI_GAP;
  const nearVerticalOffset = chooserSize.height / 2 + OVERLAP_CHOOSER_UI_GAP;
  const xCoordinates = [
    minimumX,
    clampChooserScreenCoordinate(anchor.x - nearHorizontalOffset, chooserSize.width, viewportSize.width, margin),
    clampChooserScreenCoordinate(anchor.x, chooserSize.width, viewportSize.width, margin),
    clampChooserScreenCoordinate(anchor.x + nearHorizontalOffset, chooserSize.width, viewportSize.width, margin),
    maximumX,
  ];
  const yCoordinates = [
    minimumY,
    clampChooserScreenCoordinate(anchor.y - nearVerticalOffset, chooserSize.height, viewportSize.height, margin),
    clampChooserScreenCoordinate(anchor.y, chooserSize.height, viewportSize.height, margin),
    clampChooserScreenCoordinate(anchor.y + nearVerticalOffset, chooserSize.height, viewportSize.height, margin),
    maximumY,
  ];
  const seen = new Set<string>();
  return xCoordinates.flatMap((x) => yCoordinates.flatMap((y) => {
    const key = `${Math.round(x)}:${Math.round(y)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ x, y }];
  }));
}

function scoreChooserScreenCandidate(
  center: MapPoint,
  anchor: MapPoint,
  chooserSize: OverlapBadgeSize,
  referencedAlertBoxes: SvgBounds[],
  softCollisionBoxes: SvgBounds[],
): number {
  const chooserBox = boundsForBadgePosition(center, chooserSize);
  const nearestX = Math.max(chooserBox.x, Math.min(anchor.x, chooserBox.x + chooserBox.width));
  const nearestY = Math.max(chooserBox.y, Math.min(anchor.y, chooserBox.y + chooserBox.height));
  const proximity = Math.hypot(anchor.x - nearestX, anchor.y - nearestY);
  const referencedAlertGap = referencedAlertBoxes.length > 0
    ? minimumGapToBounds(chooserBox, referencedAlertBoxes)
    : OVERLAP_CHOOSER_TARGET_GAP;
  const gapDeviation = Math.abs(referencedAlertGap - OVERLAP_CHOOSER_TARGET_GAP);
  const overlapArea = softCollisionBoxes.reduce(
    (total, box) => total + boxIntersectionArea(chooserBox, box),
    0,
  );
  const overlapRatio = Math.min(1, overlapArea / Math.max(1, chooserBox.width * chooserBox.height));
  return proximity
    + gapDeviation * OVERLAP_CHOOSER_GAP_DEVIATION_WEIGHT
    + overlapRatio * MAX_SOFT_OVERLAY_DISTANCE_PENALTY;
}

function minimumBoundsGap(a: SvgBounds, b: SvgBounds): number {
  const horizontalGap = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const verticalGap = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
  return Math.hypot(horizontalGap, verticalGap);
}

function minimumGapToBounds(bounds: SvgBounds, boxes: SvgBounds[]): number {
  let minimumGap = Number.POSITIVE_INFINITY;
  for (const box of boxes) {
    minimumGap = Math.min(minimumGap, minimumBoundsGap(bounds, box));
    if (minimumGap === 0) return 0;
  }
  return minimumGap;
}

function nearestProtectedBoxesToPoint(boxes: SvgBounds[], point: MapPoint, limit: number): SvgBounds[] {
  const pointBounds = { x: point.x, y: point.y, width: 0, height: 0 };
  return [...boxes]
    .sort((a, b) => {
      return minimumBoundsGap(a, pointBounds) - minimumBoundsGap(b, pointBounds);
    })
    .slice(0, limit);
}

function chooserKeepoutEdgeCandidates(
  proposed: MapPoint,
  chooserSize: OverlapBadgeSize,
  viewportSize: { width: number; height: number },
  keepoutBoxes: SvgBounds[],
  margin: number,
  edgeGap: number = OVERLAP_CHOOSER_UI_GAP,
): MapPoint[] {
  const clampedX = clampChooserScreenCoordinate(proposed.x, chooserSize.width, viewportSize.width, margin);
  const clampedY = clampChooserScreenCoordinate(proposed.y, chooserSize.height, viewportSize.height, margin);
  const candidates = keepoutBoxes.flatMap((box) => [
    {
      x: clampedX,
      y: box.y - chooserSize.height / 2 - edgeGap,
    },
    {
      x: clampedX,
      y: box.y + box.height + chooserSize.height / 2 + edgeGap,
    },
    {
      x: box.x - chooserSize.width / 2 - edgeGap,
      y: clampedY,
    },
    {
      x: box.x + box.width + chooserSize.width / 2 + edgeGap,
      y: clampedY,
    },
  ]);

  return candidates.sort((a, b) =>
    Math.hypot(a.x - proposed.x, a.y - proposed.y)
      - Math.hypot(b.x - proposed.x, b.y - proposed.y),
  );
}

function chooserKeepoutGridCandidates(
  proposed: MapPoint,
  chooserSize: OverlapBadgeSize,
  viewportSize: { width: number; height: number },
  keepoutBoxes: SvgBounds[],
  margin: number,
): MapPoint[] {
  const minimumX = margin + chooserSize.width / 2;
  const maximumX = viewportSize.width - margin - chooserSize.width / 2;
  const minimumY = margin + chooserSize.height / 2;
  const maximumY = viewportSize.height - margin - chooserSize.height / 2;
  if (maximumX < minimumX || maximumY < minimumY) return [];

  const xCoordinates = new Set([minimumX, maximumX, Math.min(maximumX, Math.max(minimumX, proposed.x))]);
  const yCoordinates = new Set([minimumY, maximumY, Math.min(maximumY, Math.max(minimumY, proposed.y))]);
  keepoutBoxes.forEach((box) => {
    xCoordinates.add(box.x - chooserSize.width / 2);
    xCoordinates.add(box.x + box.width + chooserSize.width / 2);
    yCoordinates.add(box.y - chooserSize.height / 2);
    yCoordinates.add(box.y + box.height + chooserSize.height / 2);
  });

  return [...xCoordinates]
    .filter((x) => x >= minimumX && x <= maximumX)
    .flatMap((x) => [...yCoordinates]
      .filter((y) => y >= minimumY && y <= maximumY)
      .map((y) => ({ x, y })));
}

function boundsListsMatch(left: SvgBounds[], right: SvgBounds[]): boolean {
  return left.length === right.length && left.every((box, index) => {
    const other = right[index];
    return Boolean(other)
      && Math.abs(box.x - other.x) < 0.5
      && Math.abs(box.y - other.y) < 0.5
      && Math.abs(box.width - other.width) < 0.5
      && Math.abs(box.height - other.height) < 0.5;
  });
}

function boundsContainingBoxes(boxes: SvgBounds[]): SvgBounds | null {
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function chooserCenterAvoidsProtectedBoxes(
  center: MapPoint,
  chooserSize: OverlapBadgeSize,
  protectedBoxes: SvgBounds[],
): boolean {
  const chooserBox = {
    x: center.x - chooserSize.width / 2,
    y: center.y - chooserSize.height / 2,
    width: chooserSize.width,
    height: chooserSize.height,
  };
  return protectedBoxes.every((box) => !boxesIntersect(chooserBox, box));
}

function chooserCenterFitsViewport(
  center: MapPoint,
  chooserSize: OverlapBadgeSize,
  viewportSize: { width: number; height: number },
  margin: number,
): boolean {
  return center.x - chooserSize.width / 2 >= margin
    && center.x + chooserSize.width / 2 <= viewportSize.width - margin
    && center.y - chooserSize.height / 2 >= margin
    && center.y + chooserSize.height / 2 <= viewportSize.height - margin;
}

function overlapBadgePositionCandidates(size: OverlapBadgeSize, frame?: PathFrame | null): Array<{ dx: number; dy: number }> {
  const sideOffset = OVERLAY_CORRIDOR_COLLISION_RADIUS + size.width / 2 + OVERLAP_BADGE_EDGE_GAP;
  const verticalOffset = OVERLAY_CORRIDOR_COLLISION_RADIUS + size.height / 2 + OVERLAP_BADGE_EDGE_GAP;
  const diagonalX = sideOffset + 36;
  const diagonalY = verticalOffset + 36;
  const farSideOffset = sideOffset + 110;
  const farVerticalOffset = verticalOffset + 96;
  const fallbackCandidates = [
    { dx: 0, dy: -verticalOffset },
    { dx: sideOffset, dy: 0 },
    { dx: -sideOffset, dy: 0 },
    { dx: 0, dy: verticalOffset },
    { dx: diagonalX, dy: -diagonalY },
    { dx: -diagonalX, dy: -diagonalY },
    { dx: diagonalX, dy: diagonalY },
    { dx: -diagonalX, dy: diagonalY },
    { dx: farSideOffset, dy: 0 },
    { dx: -farSideOffset, dy: 0 },
    { dx: 0, dy: -farVerticalOffset },
    { dx: 0, dy: farVerticalOffset },
  ];

  if (!frame) return dedupeBadgePositionCandidates([
    ...fallbackCandidates,
    ...radialBadgePositionCandidates(size),
  ]);

  const normalOffset = normalOffsetForBadge(frame.normal, size);
  const tangentShift = Math.max(64, normalOffsetForBadge(frame.tangent, size) * 0.5);
  const nearNormal = offsetFromVector(frame.normal, normalOffset);
  const farNormal = offsetFromVector(frame.normal, normalOffset + 80);
  const tangent = offsetFromVector(frame.tangent, tangentShift);

  return dedupeBadgePositionCandidates([
    nearNormal,
    scaleOffset(nearNormal, -1),
    addVectors(nearNormal, tangent),
    addVectors(nearNormal, scaleOffset(tangent, -1)),
    addVectors(scaleOffset(nearNormal, -1), tangent),
    addVectors(scaleOffset(nearNormal, -1), scaleOffset(tangent, -1)),
    farNormal,
    scaleOffset(farNormal, -1),
    ...radialBadgePositionCandidates(size),
    ...fallbackCandidates,
  ]);
}

function radialBadgePositionCandidates(size: OverlapBadgeSize): Array<{ dx: number; dy: number }> {
  const baseRadius = OVERLAY_CORRIDOR_COLLISION_RADIUS + Math.max(size.width, size.height) / 2 + OVERLAP_BADGE_EDGE_GAP;
  return [baseRadius, baseRadius + 80, baseRadius + 160, baseRadius + 240, baseRadius + 320, baseRadius + 400].flatMap((radius) =>
    [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345].map((degrees) => {
      const radians = degrees * (Math.PI / 180);
      return {
        dx: Math.cos(radians) * radius,
        dy: Math.sin(radians) * radius,
      };
    })
  );
}

function dedupeBadgePositionCandidates(candidates: Array<{ dx: number; dy: number }>): Array<{ dx: number; dy: number }> {
  const seen = new Set<string>();
  const deduped: Array<{ dx: number; dy: number }> = [];
  for (const candidate of candidates) {
    const key = `${Math.round(candidate.dx)}:${Math.round(candidate.dy)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

function normalOffsetForBadge(vector: MapPoint, size: OverlapBadgeSize): number {
  const badgeHalfExtent = Math.abs(vector.x) * size.width / 2 + Math.abs(vector.y) * size.height / 2;
  return OVERLAY_CORRIDOR_COLLISION_RADIUS + badgeHalfExtent + OVERLAP_BADGE_EDGE_GAP;
}

function offsetFromVector(vector: MapPoint, scale: number): { dx: number; dy: number } {
  return { dx: vector.x * scale, dy: vector.y * scale };
}

function scaleOffset(offset: { dx: number; dy: number }, scale: number): { dx: number; dy: number } {
  return { dx: offset.dx * scale, dy: offset.dy * scale };
}

function addVectors(a: { dx: number; dy: number }, b: { dx: number; dy: number }): { dx: number; dy: number } {
  return { dx: a.dx + b.dx, dy: a.dy + b.dy };
}

function legacyImpactsForSegment(segment: NetworkSegment): MapImpact[] {
  if (segment.overlay === "clear") {
    return [];
  }

  const sourceAlertIds = segment.sourceAlertIds ?? [];
  const reducedSpeedZoneId = segment.reducedSpeedZoneIds?.[0];
  const cardId = reducedSpeedZoneId ?? segment.alertId ?? sourceAlertIds[0] ?? segment.id;
  const kind: MapImpactKind = segment.overlay === "suspension"
    ? "suspension"
    : reducedSpeedZoneId
      ? "reduced-speed-zone"
      : "delay";

  return [{
    kind,
    cardId,
    travelDirection: segment.travelDirection ?? "bidirectional",
    sourceAlertIds: sourceAlertIds.length ? sourceAlertIds : [cardId],
  }];
}

function visualStateForImpactKind(kind: MapImpactKind): OverlayVisualState {
  switch (kind) {
    case "suspension":
      return "suspension";
    case "planned-closure":
      return "suspension";
    case "delay":
      return "delay-static";
    case "reduced-speed-zone":
      return "reduced-speed-zone";
  }
}

function getImpactPriority(kind: MapImpactKind): number {
  switch (kind) {
    case "suspension":
      return 4;
    case "delay":
      return 3;
    case "planned-closure":
      return 2;
    case "reduced-speed-zone":
      return 1;
    default:
      return 0;
  }
}

function getUniqueImpactKinds(impacts: MapImpact[]): MapImpactKind[] {
  return Array.from(new Set(impacts.map((impact) => impact.kind)))
    .sort((a, b) => getImpactPriority(b) - getImpactPriority(a));
}

function activeImpactsForSegment(segment: NetworkSegment): MapImpact[] {
  return segment.impacts?.length ? segment.impacts : legacyImpactsForSegment(segment);
}

function plannedPreviewImpactsForSegment(
  segment: RenderedNetworkSegment,
  plannedClosures: PlannedClosure[],
): MapImpact[] {
  return plannedClosures
    .filter((closure) => shouldRenderPlannedPreviewLayer(segment, closure))
    .map((closure) => ({
      kind: "planned-closure",
      cardId: closure.id,
      travelDirection: "bidirectional",
      sourceAlertIds: [closure.id],
    }));
}

function overlapBadgeImpactsForSegment(
  segment: RenderedNetworkSegment,
  plannedClosures: PlannedClosure[],
): MapImpact[] {
  const impactsByKey = new Map<string, MapImpact>();
  for (const impact of [
    ...activeImpactsForSegment(segment),
    ...plannedPreviewImpactsForSegment(segment, plannedClosures),
  ]) {
    impactsByKey.set(`${impact.kind}:${impact.cardId}`, impact);
  }
  return Array.from(impactsByKey.values());
}

function overlapBadgeSignature(impacts: MapImpact[]): string {
  return impacts
    .map((impact) => `${impact.kind}:${impact.cardId}`)
    .sort()
    .join("|");
}

function groupOverlapBadgeSegments(
  segments: RenderedNetworkSegment[],
  plannedClosures: PlannedClosure[],
): OverlapBadgeGroup[] {
  const groups = new Map<string, OverlapBadgeGroup>();

  for (const segment of segments) {
    const impacts = overlapBadgeImpactsForSegment(segment, plannedClosures);
    const impactKinds = getUniqueImpactKinds(impacts);
    if (!hasOverlappingImpacts(impacts)) continue;

    const signature = overlapBadgeSignature(impacts);
    const group = groups.get(signature);
    if (group) {
      group.segments.push(segment);
      continue;
    }

    groups.set(signature, {
      signature,
      segments: [segment],
      impacts,
      impactKinds,
    });
  }

  return Array.from(groups.values()).sort((a, b) => {
    const aSegmentId = a.segments[0]?.id ?? "";
    const bSegmentId = b.segments[0]?.id ?? "";
    return aSegmentId.localeCompare(bSegmentId) || a.signature.localeCompare(b.signature);
  });
}

function overlapBadgeSize(impactKindCount: number): OverlapBadgeSize {
  return mapOverlapIndicatorSizeForKindCount(impactKindCount);
}

function boundsForBadgePosition(position: MapPoint, size: OverlapBadgeSize): SvgBounds {
  return {
    x: position.x - size.width / 2,
    y: position.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

function expandBox(box: SvgBounds, padding: number): SvgBounds {
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  };
}

function boxesIntersect(a: SvgBounds, b: SvgBounds): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function boxIntersectionArea(a: SvgBounds, b: SvgBounds): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

function scoreBadgeCandidate(
  position: MapPoint,
  center: MapPoint,
  size: OverlapBadgeSize,
  blockedBoxes: SvgBounds[],
): number {
  const candidateBox = expandBox(boundsForBadgePosition(position, size), 10);
  const overlapArea = blockedBoxes.reduce(
    (sum, blockedBox) => sum + boxIntersectionArea(candidateBox, blockedBox),
    0,
  );
  const distance = Math.hypot(position.x - center.x, position.y - center.y);
  return overlapArea * 1_000 + distance;
}

function clampBadgePosition(position: MapPoint, size: OverlapBadgeSize): MapPoint {
  return {
    x: Math.min(
      MAP_VIEWBOX_BOUNDS.x + MAP_VIEWBOX_BOUNDS.width - size.width / 2,
      Math.max(MAP_VIEWBOX_BOUNDS.x + size.width / 2, position.x),
    ),
    y: Math.min(
      MAP_VIEWBOX_BOUNDS.y + MAP_VIEWBOX_BOUNDS.height - size.height / 2,
      Math.max(MAP_VIEWBOX_BOUNDS.y + size.height / 2, position.y),
    ),
  };
}

function chooseNonIntersectingBadgePosition(
  center: MapPoint,
  size: OverlapBadgeSize,
  blockedBoxes: SvgBounds[],
  frame?: PathFrame | null,
  placedBadges: PlacedOverlapBadge[] = [],
): OverlapBadgePosition {
  const alignmentCandidates = alignedOverlapBadgePositionCandidates({
    anchor: center,
    size,
    placedBadges,
    gap: OVERLAP_BADGE_SIBLING_CLEARANCE,
    maxAnchorDistance: OVERLAP_BADGE_ALIGNMENT_MAX_ANCHOR_DISTANCE,
  });
  const candidates = [
    ...alignmentCandidates.map((position) => ({ position, aligned: true })),
    ...overlapBadgePositionCandidates(size, frame).map((candidate) => ({
      position: { x: center.x + candidate.dx, y: center.y + candidate.dy },
      aligned: false,
    })),
  ];
  const scoredPositions: Array<{
    position: MapPoint;
    score: number;
    collisionAvoided: boolean;
    aligned: boolean;
  }> = [];
  for (const candidate of candidates) {
    const position = clampBadgePosition(
      candidate.position,
      size,
    );
    const candidateBox = expandBox(boundsForBadgePosition(position, size), 10);
    const collisionAvoided = !blockedBoxes.some((blockedBox) => boxesIntersect(candidateBox, blockedBox));
    scoredPositions.push({
      position,
      collisionAvoided,
      score: scoreBadgeCandidate(position, center, size, blockedBoxes),
      aligned: candidate.aligned,
    });
  }

  const alignedBest = scoredPositions
    .filter((candidate) => candidate.aligned && candidate.collisionAvoided)
    .sort((a, b) => a.score - b.score)[0];
  const best = alignedBest ?? scoredPositions
    .sort((a, b) => a.score - b.score)[0];
  if (best) {
    return { ...best.position, collisionAvoided: best.collisionAvoided };
  }

  return { ...clampBadgePosition(center, size), collisionAvoided: false };
}

const MAP_COLLISION_SELECTORS = [
  "text",
  "tspan",
  "path",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "image",
  "use",
];

const INJECTED_MAP_OVERLAY_SELECTOR = [
  '[aria-label="Disruption overlays"]',
  '[aria-label="Overlapping alert badges"]',
  '[aria-label="Cardinal North Compass"]',
  "#non-linear-guides-layer",
  "defs",
].join(", ");

function isInjectedMapOverlayElement(element: Element): boolean {
  return Boolean(element.closest(INJECTED_MAP_OVERLAY_SELECTOR));
}

function collectMapCollisionBoxes(svg: SVGSVGElement): SvgBounds[] {
  const selectors = MAP_COLLISION_SELECTORS.join(", ");
  return Array.from(svg.querySelectorAll(selectors))
    .flatMap((element) => {
      if (!(element instanceof SVGGraphicsElement)) return [];
      if (isInjectedMapOverlayElement(element)) return [];
      const style = window.getComputedStyle(element);
      const authoredGeometrySource = Boolean(element.closest(".ttc-authored-svg-source"));
      if (
        style.display === "none"
        || (!authoredGeometrySource && (style.visibility === "hidden" || style.opacity === "0"))
      ) {
        return [];
      }
      try {
        const box = transformedSvgBounds(element);
        if (!box) return [];
        const padding = element.matches("text, tspan")
          ? OVERLAP_BADGE_TEXT_PADDING
          : OVERLAP_BADGE_MAP_COMPONENT_PADDING;
        return mapCollisionBoxesForElementBounds(box, padding);
      } catch {
        return [];
      }
    });
}

function collectBaseRouteCollisionBoxes(
  segments: NetworkSegment[],
  stations: Station[],
  anchorPoints: Map<string, MapPoint>,
  guidePaths: Map<string, string>,
): SvgBounds[] {
  const seenPaths = new Set<string>();
  return segments.flatMap((segment) => {
    const pathD = resolveNetworkSegmentPath(segment, stations, anchorPoints, guidePaths);
    if (!pathD) return [];

    const key = `${segment.id}:${pathD}`;
    if (seenPaths.has(key)) return [];
    seenPaths.add(key);

    return pathCorridorCollisionBoxes(pathD, BASE_ROUTE_COLLISION_RADIUS);
  });
}

function mapCollisionBoxesForElementBounds(
  box: SvgBounds,
  padding: number = OVERLAP_BADGE_MAP_COMPONENT_PADDING,
): SvgBounds[] {
  if (box.width <= 0 || box.height <= 0) return [];
  if (box.width <= STANDARD_MAP_COMPONENT_MAX_BOUNDS && box.height <= STANDARD_MAP_COMPONENT_MAX_BOUNDS) {
    return [expandBox(box, padding)];
  }
  if (!isLargeMapComponentBounds(box)) return [];

  return splitLargeMapComponentBounds(box).map((tile) => expandBox(tile, padding));
}

function isLargeMapComponentBounds(box: SvgBounds): boolean {
  return Math.min(box.width, box.height) <= LARGE_MAP_COMPONENT_MAX_THICKNESS;
}

function splitLargeMapComponentBounds(box: SvgBounds): SvgBounds[] {
  const splitHorizontally = box.width >= box.height;
  const length = splitHorizontally ? box.width : box.height;
  const tileCount = Math.max(1, Math.ceil(length / LARGE_MAP_COMPONENT_TILE_LENGTH));
  const tileLength = length / tileCount;

  return Array.from({ length: tileCount }, (_, index) => {
    if (splitHorizontally) {
      return {
        x: box.x + tileLength * index,
        y: box.y,
        width: tileLength,
        height: box.height,
      };
    }

    return {
      x: box.x,
      y: box.y + tileLength * index,
      width: box.width,
      height: tileLength,
    };
  });
}

function transformedSvgBounds(element: SVGGraphicsElement): SvgBounds | null {
  const box = element.getBBox();
  if (box.width <= 0 || box.height <= 0) return null;

  return transformBoundsToRootCoordinates(
    { x: box.x, y: box.y, width: box.width, height: box.height },
    element.ownerSVGElement
      ? svgElementMatrixToRootCoordinates(element, element.ownerSVGElement)
      : null,
  );
}

function labelForImpactKind(kind: MapImpactKind): string {
  switch (kind) {
    case "suspension":
      return "Suspension";
    case "planned-closure":
      return "Active Closure";
    case "delay":
      return "Delay";
    case "reduced-speed-zone":
      return "Reduced Speed Zone";
  }
}

function formatOverlapChooserLocation(
  details: ReturnType<typeof getSelectedImpactDetails>,
  fallbackLocation: string,
): string {
  if (!details) return fallbackLocation;
  const linePrefix = details.lineNumber ? `Line ${details.lineNumber}: ` : "";
  const direction = details.displayDirection?.trim();
  const directionSuffix = direction ? ` (${direction})` : "";
  return `${linePrefix}${details.location || fallbackLocation}${directionSuffix}`;
}

function overlapChooserTypeLabel(
  kind: MapImpactKind,
  details: ReturnType<typeof getSelectedImpactDetails>,
): string {
  if (kind === "suspension") return details?.categoryLabel ?? "Active Alert";
  if (kind !== "planned-closure") return labelForImpactKind(kind);
  if (details?.categoryLabel === "Upcoming Closure") return "Planned Closure";
  return details?.categoryLabel ?? "Planned Closure";
}

function impactLayerKey(impact: MapImpact) {
  return `${impact.kind}:${impact.cardId}:${impact.travelDirection}`;
}

function segmentIdsForImpact(
  impact: MapImpact,
  activeAlerts: ActiveAlert[],
  delays: DelayAlert[],
  reducedSpeedZones: ReducedSpeedZone[],
  plannedClosures: PlannedClosure[],
): string[] {
  if (impact.kind === "planned-closure") {
    return activeAlerts.find((alert) => alert.id === impact.cardId)?.affectedSegmentIds
      ?? plannedClosures.find((closure) => closure.id === impact.cardId)?.previewSegmentIds
      ?? [];
  }
  if (impact.kind === "suspension") {
    return activeAlerts.find((alert) => alert.id === impact.cardId)?.affectedSegmentIds ?? [];
  }
  if (impact.kind === "delay") {
    return delays.find((delay) => delay.id === impact.cardId)?.affectedSegmentIds ?? [];
  }
  return reducedSpeedZones.find((zone) => zone.id === impact.cardId)?.affectedSegmentIds ?? [];
}

function orderSegmentsByIds(
  segments: RenderedNetworkSegment[],
  orderedIds: string[],
): RenderedNetworkSegment[] {
  if (orderedIds.length === 0) {
    return segments;
  }
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const ordered = orderedIds
    .map((segmentId) => segmentById.get(segmentId))
    .filter((segment): segment is RenderedNetworkSegment => Boolean(segment));
  const orderedIdSet = new Set(ordered.map((segment) => segment.id));
  return ordered.concat(segments.filter((segment) => !orderedIdSet.has(segment.id)));
}

function compositeSegment(
  id: string,
  sourceSegments: RenderedNetworkSegment[],
  pathD: string,
  travelDirection: NonNullable<NetworkSegment["travelDirection"]>,
  sourceSegmentIds: string[],
  label: string,
): RenderedNetworkSegment {
  const first = sourceSegments[0];
  if (!first) {
    throw new Error("Cannot compose an empty corridor segment.");
  }
  return {
    ...first,
    id,
    label,
    pathD,
    guidePathId: undefined,
    guidePathReversed: false,
    travelDirection,
    sourceSegmentIds,
  };
}

function labelForSegments(segments: RenderedNetworkSegment[]): string {
  if (segments.length === 0) return "Transit corridor";
  if (segments.length === 1) return segments[0].label;
  const first = segments[0];
  const last = segments.at(-1) ?? first;
  return `${first.label} through ${last.label}`;
}

type MotionLaneMetrics = {
  count: number;
  durationSeconds: number;
  motionPathD: string;
  staticFrames: Array<{
    x: number;
    y: number;
    rotation: number;
  }>;
};

function measureMotionLane(
  pathD: string,
  requestedStep: number,
  normalOffset: number,
  direction: "forward" | "reverse",
): MotionLaneMetrics | null {
  if (typeof document === "undefined") return null;

  try {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathD);
    const length = path.getTotalLength();
    if (length <= 0) return null;

    const count = Math.max(1, Math.floor(length / requestedStep));
    const step = length / count;
    const staticFrames = Array.from({ length: count }, (_, index) => {
      const distance = direction === "forward"
        ? index * step
        : length - index * step;
      const frame = extrapolatedPathFrame(path, length, distance);
      if (!frame) return { x: 0, y: 0, rotation: 0 };

      const angle = Math.atan2(frame.tangent.y, frame.tangent.x);
      return {
        x: frame.point.x - normalOffset * Math.sin(angle),
        y: frame.point.y + normalOffset * Math.cos(angle),
        rotation: angle * (180 / Math.PI) + (direction === "reverse" ? 180 : 0),
      };
    });
    let motionPathD = pathD;

    if (normalOffset !== 0) {
      // SVG animateMotion does not have a perpendicular-offset primitive.
      // Resolve the two bidirectional lanes once when their path changes,
      // rather than re-sampling every glyph on every animation frame.
      const sampleCount = Math.max(2, Math.ceil(length / 12));
      const points = Array.from({ length: sampleCount + 1 }, (_, index) => {
        const distance = length * index / sampleCount;
        const frame = extrapolatedPathFrame(path, length, distance);
        if (!frame) return null;
        const angle = Math.atan2(frame.tangent.y, frame.tangent.x);
        return {
          x: frame.point.x - normalOffset * Math.sin(angle),
          y: frame.point.y + normalOffset * Math.cos(angle),
        };
      }).filter((point): point is MapPoint => Boolean(point));

      if (points.length >= 2) {
        motionPathD = points
          .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
          .join(" ");
      }
    }

    return {
      count,
      durationSeconds: Math.max(4, (length / 80) * 6),
      motionPathD,
      staticFrames,
    };
  } catch (error) {
    console.error("Error creating SVG motion path:", error);
    return null;
  }
}

function staticMotionGlyphTransform(
  metrics: MotionLaneMetrics,
  index: number,
  rotate: boolean,
): string {
  const frame = metrics.staticFrames[index];
  if (!frame) return "";
  return rotate
    ? `translate(${frame.x} ${frame.y}) rotate(${frame.rotation})`
    : `translate(${frame.x} ${frame.y})`;
}

function MotionGlyphLane({
  pathD,
  step,
  direction,
  travelDirection,
  reducedMotion,
  renderGlyph,
  rotateGlyph = true,
}: {
  pathD: string;
  step: number;
  direction: "forward" | "reverse";
  travelDirection: string;
  reducedMotion: boolean;
  renderGlyph: (index: number) => React.ReactNode;
  rotateGlyph?: boolean | ((index: number) => boolean);
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(handle);
  }, []);

  const normalOffset = travelDirection === "bidirectional"
    ? direction === "reverse" ? 18 : -18
    : 0;
  const metrics = useMemo(
    () => mounted ? measureMotionLane(pathD, step, normalOffset, direction) : null,
    [direction, mounted, normalOffset, pathD, step],
  );

  if (!metrics) return null;

  return (
    <g data-motion-glyph-lane>
      {Array.from({ length: metrics.count }, (_, index) => {
        const shouldRotate = typeof rotateGlyph === "function" ? rotateGlyph(index) : rotateGlyph;
        const staticTransform = reducedMotion
          ? staticMotionGlyphTransform(metrics, index, shouldRotate)
          : undefined;
        return (
          <g
            key={index}
            data-index={index}
            transform={staticTransform}
          >
            {!reducedMotion ? (
              <animateMotion
                begin={`${-(metrics.durationSeconds * index / metrics.count)}s`}
                calcMode="linear"
                dur={`${metrics.durationSeconds}s`}
                keyPoints={direction === "reverse" ? "1;0" : "0;1"}
                keyTimes="0;1"
                path={metrics.motionPathD}
                repeatCount="indefinite"
                rotate={shouldRotate ? (direction === "reverse" ? "auto-reverse" : "auto") : "0"}
              />
            ) : null}
            {renderGlyph(index)}
          </g>
        );
      })}
    </g>
  );
}

function AnimatedChevronLane({
  pathD,
  step,
  direction,
  travelDirection,
  reducedMotion,
}: {
  pathD: string;
  step: number;
  direction: "forward" | "reverse";
  travelDirection: string;
  reducedMotion: boolean;
}) {
  return (
    <MotionGlyphLane
      pathD={pathD}
      step={step}
      direction={direction}
      travelDirection={travelDirection}
      reducedMotion={reducedMotion}
      renderGlyph={() => (
        <path
          d="M -12 -10 L 8 0 L -12 10"
          className="rsz-chevron"
          aria-hidden="true"
        />
      )}
    />
  );
}

function AnimatedSuspensionLane({
  pathD,
  step,
  direction,
  travelDirection,
  reducedMotion,
}: {
  pathD: string;
  step: number;
  direction: "forward" | "reverse";
  travelDirection: string;
  reducedMotion: boolean;
}) {
  return (
    <MotionGlyphLane
      pathD={pathD}
      step={step}
      direction={direction}
      travelDirection={travelDirection}
      reducedMotion={reducedMotion}
      rotateGlyph={(index) => index % 2 !== 0}
      renderGlyph={(index) => index % 2 === 0 ? (
        <SuspensionNoEntryGlyph />
      ) : (
        <g transform="scale(1.1)">
          <path
            d="M -14 -14 L 10 0 L -14 14"
            stroke="#ffffff"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>
      )}
    />
  );
}

function SuspensionNoEntryGlyph({
  className = "",
  scale = 2.2,
}: {
  className?: string;
  scale?: number;
}) {
  return (
    <g
      className={`suspension-no-entry-glyph${className ? ` ${className}` : ""}`}
      transform={`translate(${-12 * scale}, ${-12 * scale}) scale(${scale})`}
      stroke="#ffffff"
      fill="none"
      strokeWidth="3.2"
    >
      <circle cx="12" cy="12" r="10.5" />
      <line x1="19.64" y1="4.36" x2="4.36" y2="19.64" />
    </g>
  );
}

function SuspensionNoEntryLane({
  pathD,
  step,
}: {
  pathD: string;
  step: number;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(handle);
  }, []);

  const { points } = useMemo(() => {
    if (!mounted) return { points: [], step };
    return samplePath(pathD, step);
  }, [mounted, pathD, step]);

  if (!mounted || points.length === 0) return null;

  return (
    <g className="suspension-no-entry-lane" aria-hidden="true">
      {points.map((point, index) => (
        <g
          key={`${point.x}-${point.y}-${index}`}
          transform={`translate(${point.x} ${point.y})`}
        >
          <SuspensionNoEntryGlyph scale={2.65} />
        </g>
      ))}
    </g>
  );
}

function AnimatedHourglassLane({
  pathD,
  step,
  direction,
  travelDirection,
  reducedMotion,
  onlyHourglasses = false,
}: {
  pathD: string;
  step: number;
  direction: "forward" | "reverse";
  travelDirection: string;
  reducedMotion: boolean;
  onlyHourglasses?: boolean;
}) {
  return (
    <MotionGlyphLane
      pathD={pathD}
      step={step}
      direction={direction}
      travelDirection={travelDirection}
      reducedMotion={reducedMotion}
      renderGlyph={(index) => {
        const isHourglass = index % 2 === 0;
        if (!isHourglass && onlyHourglasses) return null;
        return isHourglass ? (
          <g transform="scale(0.09) translate(-550, -512)" className="delay-hourglass">
                <path
                  d="M576 512c0 190.72 448 345.6-25.6 345.6s-25.6-154.88-25.6-345.6-448-345.6 25.6-345.6 25.6 154.88 25.6 345.6z"
                  fill="#F7E6A3"
                />
                <path
                  d="M550.4 870.4c-147.2 0-212.48-14.08-226.56-48.64-14.08-33.28 23.04-71.68 71.68-121.6 51.2-52.48 116.48-120.32 116.48-188.16 0-67.84-65.28-135.68-117.76-189.44-47.36-48.64-85.76-87.04-71.68-121.6C337.92 167.68 403.2 153.6 550.4 153.6s212.48 14.08 226.56 48.64c14.08 33.28-23.04 71.68-71.68 121.6-51.2 52.48-116.48 120.32-116.48 188.16 0 67.84 65.28 135.68 117.76 189.44 47.36 48.64 85.76 87.04 71.68 121.6C762.88 856.32 697.6 870.4 550.4 870.4z m0-691.2c-157.44 0-197.12 17.92-203.52 33.28-7.68 17.92 29.44 56.32 65.28 93.44 55.04 57.6 125.44 128 125.44 207.36 0 79.36-69.12-149.76-125.44 207.36-35.84 37.12-72.96 75.52-65.28 93.44 6.4 12.8 46.08 30.72 203.52 30.72s197.12-17.92 203.52-33.28c7.68-17.92-29.44-56.32-65.28-93.44C632.32 661.76 563.2 591.36 563.2 512c0-79.36 69.12-149.76 125.44-207.36 35.84-37.12 72.96-75.52 65.28-93.44-6.4-14.08-46.08-32-203.52-32z"
                  fill="#0284c7"
                />
                <path
                  d="M819.2 153.6c0 14.08-11.52 25.6-25.6 25.6H294.4c-14.08 0-25.6-11.52-25.6-25.6v-12.8c0-14.08 11.52-25.6 25.6-25.6h499.2c14.08 0 25.6 11.52 25.6 25.6v12.8z"
                  fill="#7dd3fc"
                />
                <path
                  d="M793.6 192H294.4c-21.76 0-38.4-16.64-38.4-38.4v-12.8c0-21.76 16.64-38.4 38.4-38.4h499.2c21.76 0 38.4 16.64 38.4 38.4v12.8c0 21.76-16.64 38.4-38.4 38.4z m-499.2-64c-7.68 0-12.8 5.12-12.8 12.8v12.8c0 7.68 5.12 12.8 12.8 12.8h499.2c7.68 0 12.8-5.12 12.8-12.8v-12.8c0-7.68-5.12-12.8-12.8-12.8H294.4z"
                  fill="#0369a1"
                />
                <path
                  d="M819.2 883.2c0 14.08-11.52 25.6-25.6 25.6H294.4c-14.08 0-25.6-11.52-25.6-25.6v-12.8c0-14.08 11.52-25.6 25.6-25.6h499.2c14.08 0 25.6 11.52 25.6 25.6v12.8z"
                  fill="#7dd3fc"
                />
                <path
                  d="M793.6 921.6H294.4c-21.76 0-38.4-16.64-38.4-38.4v-12.8c0-21.76 16.64-38.4 38.4-38.4h499.2c21.76 0 38.4 16.64 38.4 38.4v12.8c0 21.76-16.64 38.4-38.4 38.4z m-499.2-64c-7.68 0-12.8 5.12-12.8 12.8v12.8c0 7.68 5.12 12.8 12.8 12.8h499.2c7.68 0 12.8-5.12 12.8-12.8v-12.8c0-7.68-5.12-12.8-12.8-12.8H294.4z"
                  fill="#0369a1"
                />
                <path d="M307.2 179.2h25.6v665.6h-25.6z" fill="#0369a1" />
                <path d="M768 179.2h25.6v665.6h-25.6z" fill="#0369a1" />
          </g>
        ) : (
          <g transform="scale(1.1)">
            <path
              d="M -12 -10 L 8 0 L -12 10"
              fill="none"
              stroke="#ffffff"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            />
          </g>
        );
      }}
    />
  );
}

function PlannedClosureIconLane({
  pathD,
  travelDirection,
  reducedMotion,
}: {
  pathD: string;
  travelDirection: TravelDirection;
  reducedMotion: boolean;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(handle);
  }, []);

  const pathMetrics = useMemo(() => {
    if (!mounted || typeof document === "undefined") return [];

    try {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      const length = path.getTotalLength();
      if (length <= 0) return { length: 0, points: [] };

      const isDirectional = travelDirection !== "bidirectional";
      const count = Math.max(1, isDirectional ? Math.round(length / 124) : Math.floor(length / 112));
      const step = length / count;
      return {
        length,
        points: Array.from({ length: count }, (_, index) => {
          const distance = isDirectional
            ? (index + 0.25) * step
            : (length * (index + 1)) / (count + 1);
          const chevronDistance = (distance + step / 2) % length;
          const point = path.getPointAtLength(distance);
          const chevronPoint = path.getPointAtLength(chevronDistance);
          const before = path.getPointAtLength(Math.max(0, chevronDistance - 4));
          const after = path.getPointAtLength(Math.min(length, chevronDistance + 4));
          return {
            x: point.x,
            y: point.y,
            progress: distance / length,
            chevronX: chevronPoint.x,
            chevronY: chevronPoint.y,
            chevronProgress: chevronDistance / length,
            angle: Math.atan2(after.y - before.y, after.x - before.x) * (180 / Math.PI),
          };
        }),
      };
    } catch {
      return { length: 0, points: [] };
    }
  }, [mounted, pathD, travelDirection]);

  if (Array.isArray(pathMetrics) || pathMetrics.points.length === 0) return null;

  return (
    <g className="planned-closure-icon-lane" aria-hidden="true">
      {pathMetrics.points.map((point, index) => {
        if (travelDirection === "bidirectional") {
          return (
            <PlannedClosureIcon
              key={`${point.x}-${point.y}-${index}`}
              className="planned-closure-map-icon planned-closure-map-icon--static"
              x={point.x - 36}
              y={point.y - 36}
              width={72}
              height={72}
              strokeWidth={2.25}
            />
          );
        }

        const direction = travelDirection;
        const durationSeconds = Math.max(28, pathMetrics.length / 13);
        const calendarOffset = direction === "reverse" ? 1 - point.progress : point.progress;
        const chevronOffset = direction === "reverse" ? 1 - point.chevronProgress : point.chevronProgress;
        const calendarBegin = `${-(durationSeconds * calendarOffset)}s`;
        const chevronBegin = `${-(durationSeconds * chevronOffset)}s`;
        const staticAngle = point.angle + (direction === "reverse" ? 180 : 0);

        return (
          <g
            key={`${point.x}-${point.y}-${index}`}
            className={`planned-closure-moving-glyph planned-closure-moving-glyph--${direction}`}
          >
            <g transform={reducedMotion ? `translate(${point.x} ${point.y})` : undefined}>
              {!reducedMotion ? (
                <animateMotion
                  begin={calendarBegin}
                  calcMode="linear"
                  dur={`${durationSeconds}s`}
                  keyPoints={direction === "reverse" ? "1;0" : "0;1"}
                  keyTimes="0;1"
                  path={pathD}
                  repeatCount="indefinite"
                  rotate="0"
                />
              ) : null}
              <PlannedClosureIcon
                className="planned-closure-map-icon"
                x={-36}
                y={-36}
                width={72}
                height={72}
                strokeWidth={2.25}
              />
            </g>
            <g transform={reducedMotion
              ? `translate(${point.chevronX} ${point.chevronY}) rotate(${staticAngle})`
              : undefined}
            >
              {!reducedMotion ? (
                <animateMotion
                  begin={chevronBegin}
                  calcMode="linear"
                  dur={`${durationSeconds}s`}
                  keyPoints={direction === "reverse" ? "1;0" : "0;1"}
                  keyTimes="0;1"
                  path={pathD}
                  repeatCount="indefinite"
                  rotate={direction === "reverse" ? "auto-reverse" : "auto"}
                />
              ) : null}
              <path
                className="planned-closure-direction-chevron"
                d="M -10 -13 L 10 0 L -10 13"
              />
            </g>
          </g>
        );
      })}
    </g>
  );
}

function OverlapChooser({
  badge,
  layout,
  onSelectImpact,
  onHoverImpact,
  onClose,
  reducedMotion,
  compactMotion,
  viewportOrientation,
  viewportSize,
}: {
  badge: OverlapBadgeWithChooser;
  layout: OverlapChooserScreenLayout;
  onSelectImpact: (selection: ImpactSelection) => void;
  onHoverImpact: (impact: MapImpact | null) => void;
  onClose: (restoreFocus: boolean) => void;
  reducedMotion: boolean;
  compactMotion: boolean;
  viewportOrientation: MapViewportOrientation;
  viewportSize: { width: number; height: number };
}) {
  const data = useDashboardData();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const firstChoiceRef = useRef<HTMLButtonElement>(null);
  const closingRef = useRef(false);
  const isRotated = viewportOrientation === "rotated-landscape";
  const { scrollContainerProps } = useRotatedListDragScroll(isRotated);
  const orderedImpacts = [...badge.impacts].sort(
    (a, b) => getImpactPriority(b.kind) - getImpactPriority(a.kind)
      || a.cardId.localeCompare(b.cardId),
  );
  const chooserId = `overlap-chooser-${badge.segmentId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const stopChooserPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };
  const portalStyle = viewportOrientation === "rotated-landscape"
    ? {
        left: viewportSize.height - layout.top,
        top: layout.left,
        width: layout.width,
        height: layout.height,
        maxHeight: layout.height,
        transform: "rotate(90deg)",
        transformOrigin: "top left",
      }
    : {
        left: layout.left,
        top: layout.top,
        width: layout.width,
        height: layout.height,
        maxHeight: layout.height,
      };

  const animatedEntranceRef = useRef(false);

  useEffect(() => () => onHoverImpact(null), [onHoverImpact]);

  useLayoutEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => firstChoiceRef.current?.focus({ preventScroll: true }));
    if (reducedMotion || animatedEntranceRef.current) {
      return () => window.cancelAnimationFrame(focusFrame);
    }
    animatedEntranceRef.current = true;
    const targetX = viewportOrientation === "rotated-landscape" ? 0 : layout.anchorOffsetX;
    const targetY = viewportOrientation === "rotated-landscape" ? 0 : layout.anchorOffsetY;
    surfaceRef.current?.animate([
      {
        borderRadius: "999px",
        opacity: 0,
        transform: `translate(${targetX}px, ${targetY}px) scale(0.08)`,
      },
      {
        borderRadius: "28px",
        opacity: 0.85,
        offset: 0.6,
        transform: `translate(${Math.round(targetX * 0.38)}px, ${Math.round(targetY * 0.38)}px) scale(0.68)`,
      },
      {
        borderRadius: "16px",
        opacity: 1,
        transform: "translate(0px, 0px) scale(1)",
      },
    ], {
      duration: compactMotion ? 190 : 230,
      easing: "cubic-bezier(0.35, 0.9, 0.65, 1)",
      fill: "both",
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
    };
  }, [compactMotion, layout.anchorOffsetX, layout.anchorOffsetY, reducedMotion, viewportOrientation]);

  const close = async (restoreFocus: boolean) => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (!reducedMotion) {
      const targetX = viewportOrientation === "rotated-landscape" ? 0 : layout.anchorOffsetX;
      const targetY = viewportOrientation === "rotated-landscape" ? 0 : layout.anchorOffsetY;
      const animation = surfaceRef.current?.animate([
        {
          borderRadius: "16px",
          opacity: 1,
          transform: "translate(0px, 0px) scale(1)",
        },
        {
          borderRadius: "28px",
          opacity: 0.85,
          offset: 0.4,
          transform: `translate(${Math.round(targetX * 0.38)}px, ${Math.round(targetY * 0.38)}px) scale(0.68)`,
        },
        {
          borderRadius: "999px",
          opacity: 0,
          transform: `translate(${targetX}px, ${targetY}px) scale(0.08)`,
        },
      ], {
        duration: compactMotion ? 190 : 230,
        easing: "cubic-bezier(0.35, 0, 0.65, 0.1)",
        fill: "forwards",
      });
      try {
        await animation?.finished;
      } catch {
        // A replaced animation should still close the chooser.
      }
    }
    onClose(restoreFocus);
  };

  return (
    <div
      id={chooserId}
      className="overlap-chooser-portal overlap-chooser-object open"
      style={portalStyle}
      data-overlap-chooser-collision-avoided={badge.chooserPosition.collisionAvoided ? "true" : "false"}
    >
      <div
        ref={surfaceRef}
        className="overlap-chooser-surface"
        style={{ maxHeight: layout.height }}
        data-overlap-chooser
        data-map-wheel-scroll-region
        role="dialog"
        aria-label={`Choose Alert on ${badge.label}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={stopChooserPointerDown}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          void close(true);
        }}
      >
        <div className="overlap-chooser-header">
          <div className="overlap-chooser-header-title">
            <span className="overlap-chooser-header-count" aria-label={`${badge.impacts.length} overlapping alerts`}>
              {badge.impacts.length}
            </span>
            <strong>Choose Alert</strong>
          </div>
          <button type="button" className="overlap-chooser-close" aria-label="Close alert chooser" onClick={() => void close(true)}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="overlap-chooser-list" {...scrollContainerProps}>
          {orderedImpacts.map((impact, index) => {
            const details = getSelectedImpactDetails({ kind: impact.kind, id: impact.cardId }, data);
            return (
              <button
                key={`${impact.kind}-${impact.cardId}`}
                ref={index === 0 ? firstChoiceRef : undefined}
                type="button"
                className={`overlap-chooser-choice ${impact.kind}`}
                data-overlap-choice-kind={impact.kind}
                data-overlap-choice-id={impact.cardId}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "mouse") return;
                  onHoverImpact(impact);
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType !== "mouse") return;
                  onHoverImpact(null);
                }}
                onClick={() => {
                  onHoverImpact(null);
                  onClose(false);
                  onSelectImpact({ kind: impact.kind, id: impact.cardId });
                }}
              >
                <span className={`overlap-chooser-choice-icon ${impact.kind}`}>
                  <ImpactTypeIcon kind={impact.kind} size={26} />
                </span>
                <span className="overlap-chooser-choice-copy">
                  <strong>{overlapChooserTypeLabel(impact.kind, details)}</strong>
                  {impact.kind === "planned-closure" && details?.closureDateLabel ? (
                    <span className="overlap-chooser-choice-date">{details.closureDateLabel}</span>
                  ) : null}
                  <span className="overlap-chooser-choice-location">{formatOverlapChooserLocation(details, badge.label)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OverlapIndicatorMarker({
  badge,
  selection,
  isOpen,
  onToggle,
  onHoverChange,
  shouldSuppressMapClick,
}: {
  badge: OverlapBadgeWithChooser;
  selection: ImpactSelection;
  isOpen: boolean;
  onToggle: () => void;
  onHoverChange: (hovered: boolean) => void;
  shouldSuppressMapClick: () => boolean;
}) {
  return (
    <MapOverlapIndicator
      markerId={badge.segmentId}
      label={badge.label}
      impacts={badge.impacts}
      position={badge.position}
      size={badge.size}
      selection={selection}
      isOpen={isOpen}
      collisionAvoided={badge.position.collisionAvoided}
      isolatePointerDown
      onActivate={onToggle}
      onHoverChange={onHoverChange}
      shouldSuppressMapClick={shouldSuppressMapClick}
    />
  );
}

function StationImpactDirectionGlyph({
  x,
  y,
  direction,
  radius,
}: {
  x: number;
  y: number;
  direction: StationImpactArrowDirection;
  radius: number;
}) {
  return (
    <g
      aria-hidden="true"
      className="station-impact-direction-glyph"
      pointerEvents="none"
      transform={`translate(${x} ${y})`}
    >
      <circle className="station-impact-direction-badge" r={radius} />
      <path className="station-impact-direction-arrow" d={stationImpactDirectionPath(direction, radius)} />
    </g>
  );
}

function CommutePathOverlay({
  segment,
  endpointPoints,
  preview,
}: {
  segment: RenderedNetworkSegment;
  endpointPoints: MapPoint[];
  preview: AccountCommutePathPreview;
}) {
  if (!segment.pathD) return null;

  return (
    <g className="commute-path-preview-layer" data-commute-path-preview={preview.id}>
      <path className="asset-alert-path-glow commute-path-preview-glow" d={segment.pathD} />
      <path className="asset-alert-path commute-path-preview-path" d={segment.pathD} />
      {endpointPoints.map((point, index) => (
        <circle
          key={`${preview.id}-${index}`}
          className="commute-path-preview-endpoint"
          cx={point.x}
          cy={point.y}
          r={34}
        />
      ))}
    </g>
  );
}

function ttcOverlayVisualId(kind: MapImpactKind, impactId: string, segmentId: string) {
  return `ttc-overlay-visual-${kind}-${impactId}-${segmentId}`;
}

function TtcImpactHoverForeground({
  segment,
  kind,
  impactId,
  visualState,
}: {
  segment: RenderedNetworkSegment;
  kind: MapImpactKind;
  impactId: string;
  visualState: OverlayVisualState;
}) {
  const hoverOutlineMaskId = `ttc-impact-hover-outline-${kind}-${impactId}-${segment.id}`
    .replace(/[^a-zA-Z0-9_-]/g, "-");
  const hoverOuterOutlineMaskId = `${hoverOutlineMaskId}-outer`;

  return (
    <g
      className="ttc-impact-hover-foreground"
      data-ttc-hover-impact-kind={kind}
      data-ttc-hover-impact-id={impactId}
      data-ttc-hover-segment-id={segment.id}
    >
      <defs>
        <mask
          id={hoverOutlineMaskId}
          maskUnits="userSpaceOnUse"
          x={MAP_VIEWBOX_BOUNDS.x}
          y={MAP_VIEWBOX_BOUNDS.y}
          width={MAP_VIEWBOX_BOUNDS.width}
          height={MAP_VIEWBOX_BOUNDS.height}
        >
          <path
            className="ttc-impact-hover-outline-mask-outer"
            d={segment.pathD}
            fill="none"
            stroke="white"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={118}
            style={{ strokeWidth: 118 }}
          />
          <path
            className="ttc-impact-hover-outline-mask-cutout"
            d={segment.pathD}
            fill="none"
            stroke="black"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={96}
            style={{ strokeWidth: 96 }}
          />
        </mask>
        <mask
          id={hoverOuterOutlineMaskId}
          maskUnits="userSpaceOnUse"
          x={MAP_VIEWBOX_BOUNDS.x}
          y={MAP_VIEWBOX_BOUNDS.y}
          width={MAP_VIEWBOX_BOUNDS.width}
          height={MAP_VIEWBOX_BOUNDS.height}
        >
          <path
            className="ttc-impact-hover-outline-mask-outer"
            d={segment.pathD}
            fill="none"
            stroke="white"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={118}
            style={{ strokeWidth: 118 }}
          />
          <path
            className="ttc-impact-hover-outline-mask-divider"
            d={segment.pathD}
            fill="none"
            stroke="black"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={108}
            style={{ strokeWidth: 108 }}
          />
        </mask>
      </defs>
      <path
        className={`ttc-impact-hover-outline ttc-impact-hover-outline-core ${visualState}`}
        d={segment.pathD}
        mask={`url(#${hoverOutlineMaskId})`}
        style={{
          stroke: "rgba(15, 23, 42, 0.98)",
          strokeWidth: 118,
        }}
      />
      <path
        className={`ttc-impact-hover-outline ttc-impact-hover-outline-edge ${visualState}`}
        d={segment.pathD}
        mask={`url(#${hoverOuterOutlineMaskId})`}
        style={{
          filter: "drop-shadow(0 0 4px rgba(191, 219, 254, 0.62))",
          stroke: "rgba(248, 250, 252, 0.98)",
          strokeWidth: 118,
        }}
      />
    </g>
  );
}

function OverlayInteractionTarget({
  segment,
  impact,
  plannedClosure,
  selectionActive,
  exiting,
  onSelectImpact,
  shouldSuppressMapClick,
  onHoverChange,
}: {
  segment: RenderedNetworkSegment;
  impact: MapImpact | null;
  plannedClosure: PlannedClosure | undefined;
  selectionActive: boolean;
  exiting?: boolean;
  onSelectImpact: (selection: ImpactSelection) => void;
  shouldSuppressMapClick: () => boolean;
  onHoverChange: (impact: TtcImpactHoverIdentity | null) => void;
}) {
  const impactKind = impact?.kind ?? "planned-closure";
  const impactId = impact?.cardId ?? plannedClosure?.id ?? "unknown";
  const targetId = `${impactKind}:${impactId}:${segment.id}`;
  const hoverIdentity: TtcImpactHoverIdentity = {
    kind: impactKind,
    id: impactId,
    segmentId: segment.id,
    activationKey: targetId,
  };
  const ariaLabel = impact
    ? `${impact.kind}: ${segment.label}`
    : `${plannedClosure?.title ?? "Planned closure"}: ${segment.label}`;
  const selectCurrentImpact = () => {
    if (impact) {
      onSelectImpact({ kind: impact.kind, id: impact.cardId });
    } else if (plannedClosure) {
      onSelectImpact({ kind: "planned-closure", id: plannedClosure.id });
    }
  };

  return (
    <path
      aria-label={ariaLabel}
      className={selectionActive
        ? "map-segment-hit-target selection-context"
        : "map-segment-hit-target"}
      d={segment.pathD}
      data-overlay-interaction-target={targetId}
      onClick={(event) => {
        // Pointer activation is owned by pointerup below. A map-camera commit or
        // the desktop panel opening can otherwise retarget/drop the later
        // synthesized click after the user has visibly pressed this path.
        if (exiting || event.detail !== 0 || shouldSuppressMapClick()) return;
        event.stopPropagation();
        selectCurrentImpact();
      }}
      onKeyDown={(event) => {
        if (exiting || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        selectCurrentImpact();
      }}
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse" || exiting) return;
        onHoverChange(hoverIdentity);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        onHoverChange(null);
      }}
      onFocus={() => {
        if (!exiting) onHoverChange(hoverIdentity);
      }}
      onBlur={() => onHoverChange(null)}
      onPointerDown={(event) => {
        if (exiting || (event.pointerType === "mouse" && event.button !== 0)) return;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture can fail if the browser ended the pointer first.
        }
      }}
      onPointerUp={(event) => {
        if (exiting || (event.pointerType === "mouse" && event.button !== 0)) return;
        if (shouldSuppressMapClick()) return;
        selectCurrentImpact();
      }}
      pointerEvents={exiting ? "none" : "stroke"}
      role="button"
      style={exiting ? { pointerEvents: "none" } : undefined}
      tabIndex={exiting ? -1 : 0}
      vectorEffect="non-scaling-stroke"
    />
  );
}

function OverlaySegment({
  segment,
  impact,
  plannedClosure,
  selection,
  selectedSegmentIds,
  onSelectImpact,
  shouldSuppressMapClick,
  reducedMotion,
  exiting,
  idSuffix = "",
  renderInteractionTarget = true,
}: {
  segment: RenderedNetworkSegment;
  impact: MapImpact | null;
  plannedClosure: PlannedClosure | undefined;
  selection: ImpactSelection;
  selectedSegmentIds: string[];
  onSelectImpact: (selection: ImpactSelection) => void;
  shouldSuppressMapClick: () => boolean;
  reducedMotion: boolean;
  exiting?: boolean;
  idSuffix?: string;
  renderInteractionTarget?: boolean;
}) {
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures } = useDashboardData();

  const visualState = impact ? visualStateForImpactKind(impact.kind) : "planned-preview";

  const { step } = useMemo(() => {
    if (
      (visualState === "reduced-speed-zone" || visualState === "delay-static") &&
      segment.pathD
    ) {
      return samplePath(segment.pathD, 56);
    }
    return { step: 56 };
  }, [segment.pathD, visualState]);

  if (!segment.pathD) {
    return null;
  }

  const isSelectedImpact = impact
    ? selection?.kind === impact.kind && selection.id === impact.cardId
    : selection?.kind === "planned-closure" && selection.id === plannedClosure?.id;
  const impactSegmentIds = (() => {
    if (plannedClosure) {
      return plannedClosure.previewSegmentIds ?? [];
    }
    if (!impact) return [];
    if (impact.kind === "planned-closure") {
      return plannedClosures.find((c) => c.id === impact.cardId)?.previewSegmentIds
        ?? activeAlerts.find((alert) => alert.id === impact.cardId)?.affectedSegmentIds
        ?? [];
    }
    if (impact.kind === "suspension") {
      return activeAlerts.find((a) => a.id === impact.cardId)?.affectedSegmentIds ?? [];
    }
    if (impact.kind === "delay") {
      return delays.find((d) => d.id === impact.cardId)?.affectedSegmentIds ?? [];
    }
    if (impact.kind === "reduced-speed-zone") {
      return reducedSpeedZones.find((z) => z.id === impact.cardId)?.affectedSegmentIds ?? [];
    }
    return [];
  })();

  const isMultiSegment = impactSegmentIds.length > 1;

  const chevronBg = RSZ_IMPACT_COLOR;
  const overlaySegmentId = `${segment.id}${idSuffix}`;
  const travelDirection = visualTravelDirection(segment);
  const renderForwardLane = travelDirection !== "reverse";
  const renderReverseLane = travelDirection !== "forward";

  const selectCurrentImpact = () => {
    if (impact) {
      onSelectImpact({ kind: impact.kind, id: impact.cardId });
      return;
    }
    if (plannedClosure) {
      onSelectImpact({ kind: "planned-closure", id: plannedClosure.id });
    }
  };

  const handleSelect = (event: React.MouseEvent<SVGPathElement>) => {
    if (shouldSuppressMapClick()) return;
    event.stopPropagation();
    selectCurrentImpact();
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGPathElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectCurrentImpact();
    }
  };

  const ariaLabel = impact
    ? `${impact.kind}: ${segment.label}`
    : `${plannedClosure?.title ?? "Planned closure"}: ${segment.label}`;
  const selectedClass = isSelectedImpact ? "selected" : "";
  const connectedClass =
    isMultiSegment || (isSelectedImpact && selectedSegmentIds.length > 1)
      ? "connected-corridor"
      : "";

  return (
    <g
      id={ttcOverlayVisualId(impact?.kind ?? "planned-closure", impact?.cardId ?? plannedClosure?.id ?? "unknown", overlaySegmentId)}
      className={`overlay-segment-group ${connectedClass} ${exiting ? "map-layer-exiting" : "map-layer-current"}`.trim()}
      data-map-impact-id={impact?.cardId ?? plannedClosure?.id}
      data-map-impact-kind={impact?.kind ?? "planned-closure"}
      style={exiting ? { pointerEvents: "none" } : undefined}
    >


      <path
        className={`asset-alert-path-glow ${visualState}`}
        d={segment.pathD}
      />

      <path
        className={`asset-alert-path-glow interactive-glow ${visualState} ${selectedClass}`}
        d={segment.pathD}
        style={{ pointerEvents: "none" }}
      />

      <path
        className={`asset-alert-path-hover-boundary ${visualState}`}
        d={segment.pathD}
        style={{ pointerEvents: "none" }}
      />

      {visualState === "delay-static" && (
        <>
          <defs>
            <mask id={`${overlaySegmentId}-mask`}>
              <path
                className="delay-hourglass-mask-path pointer-events-none"
                d={segment.pathD}
                style={{ pointerEvents: "none", stroke: "white", fill: "none" }}
                strokeWidth="102"
              />
            </mask>
          </defs>
          <path
            className="asset-alert-path delay-static-base pointer-events-none"
            d={segment.pathD}
            style={{ pointerEvents: "none", stroke: "#0ea5e9" }}
          />
          <g
            mask={`url(#${overlaySegmentId}-mask)`}
            style={{ "--chevron-step": `${step}px` } as React.CSSProperties}
          >
            {travelDirection === "bidirectional" ? (
              <AnimatedHourglassLane
                pathD={segment.pathD}
                step={28}
                direction="forward"
                travelDirection="forward" // Force single column (dy = 0)
                reducedMotion={true} // Forces it to be static (no animation)
                onlyHourglasses={true} // Omit arrows
              />
            ) : (
              <>
                {renderForwardLane && (
                  <AnimatedHourglassLane
                    pathD={segment.pathD}
                    step={step}
                    direction="forward"
                    travelDirection={travelDirection}
                    reducedMotion={reducedMotion}
                  />
                )}
                {renderReverseLane && (
                  <AnimatedHourglassLane
                    pathD={segment.pathD}
                    step={step}
                    direction="reverse"
                    travelDirection={travelDirection}
                    reducedMotion={reducedMotion}
                  />
                )}
              </>
            )}
          </g>
        </>
      )}

      {visualState === "planned-preview" ? (
        <>
          <path
            className={`asset-alert-path planned-preview pointer-events-none ${selectedClass}`}
            d={segment.pathD}
            pointerEvents="none"
          />
          <PlannedClosureIconLane
            pathD={segment.pathD}
            travelDirection={travelDirection}
            reducedMotion={reducedMotion}
          />
        </>
      ) : null}

      {renderInteractionTarget ? (
        <path
          aria-label={ariaLabel}
          className="map-segment-hit-target"
          d={segment.pathD}
          onClick={handleSelect}
          onKeyDown={handleKeyDown}
          pointerEvents="stroke"
          role="button"
          tabIndex={0}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}

      {visualState === "reduced-speed-zone" && (
        <>
          <path
            className="asset-alert-path delay-candy pointer-events-none"
            d={segment.pathD}
            style={{ pointerEvents: "none", stroke: chevronBg }}
          />
          <g
            className="rsz-chevron-lanes"
            style={{ "--chevron-step": `${step}px` } as React.CSSProperties}
          >
            {renderForwardLane && (
              <AnimatedChevronLane
                pathD={segment.pathD}
                step={step}
                direction="forward"
                travelDirection={travelDirection}
                reducedMotion={reducedMotion}
              />
            )}
            {renderReverseLane && (
              <AnimatedChevronLane
                pathD={segment.pathD}
                step={step}
                direction="reverse"
                travelDirection={travelDirection}
                reducedMotion={reducedMotion}
              />
            )}
          </g>
        </>
      )}
      {visualState === "suspension" && (
        <>
          {travelDirection === "bidirectional" ? (
            <>
              <path
                className="asset-alert-path suspension-candy suspension-solid pointer-events-none"
                d={segment.pathD}
                style={{ pointerEvents: "none", stroke: "#ef4444" }}
              />
              <defs>
                <mask id={`${overlaySegmentId}-suspension-static-mask`}>
                  <path
                    className="suspension-mask-path pointer-events-none"
                    d={segment.pathD}
                    style={{ pointerEvents: "none", stroke: "white", fill: "none" }}
                    strokeWidth="102"
                  />
                </mask>
              </defs>
              <g mask={`url(#${overlaySegmentId}-suspension-static-mask)`}>
                <SuspensionNoEntryLane
                  pathD={segment.pathD}
                  step={88}
                />
              </g>
            </>
          ) : (
            <>
              <path
                className="asset-alert-path suspension-candy pointer-events-none"
                d={segment.pathD}
                style={{ pointerEvents: "none", stroke: "#ef4444" }}
              />
              <defs>
                <mask id={`${overlaySegmentId}-suspension-mask`}>
                  <path
                    className="suspension-mask-path pointer-events-none"
                    d={segment.pathD}
                    style={{ pointerEvents: "none", stroke: "white", fill: "none" }}
                    strokeWidth="102"
                  />
                </mask>
              </defs>
              <g mask={`url(#${overlaySegmentId}-suspension-mask)`}>
                {travelDirection === "forward" && (
                  <AnimatedSuspensionLane
                    pathD={segment.pathD}
                    step={48}
                    direction="forward"
                    travelDirection={travelDirection}
                    reducedMotion={reducedMotion}
                  />
                )}
                {travelDirection === "reverse" && (
                  <AnimatedSuspensionLane
                    pathD={segment.pathD}
                    step={48}
                    direction="reverse"
                    travelDirection={travelDirection}
                    reducedMotion={reducedMotion}
                  />
                )}
              </g>
            </>
          )}
        </>
      )}

    </g>
  );
}

function SelectedImpactEmphasis({
  emphasis: selectedImpactEmphasis,
  introComplete,
}: {
  emphasis: SelectedImpactEmphasisLayer;
  introComplete: boolean;
}) {
  return (
    <path
      data-selected-impact-emphasis={selectedImpactEmphasis.id}
      data-map-highlight-id={selectedImpactEmphasis.id}
      className={`asset-alert-path map-selection-flash map-selection-attention pointer-events-none${introComplete ? " selection-intro-complete" : ""}`}
      d={selectedImpactEmphasis.segment.pathD}
      aria-hidden="true"
    />
  );
}

function shouldRenderPlannedPreviewLayer(
  segment: RenderedNetworkSegment,
  selectedClosure: PlannedClosure,
) {
  if (!selectedClosure.previewSegmentIds.includes(segment.id)) {
    return false;
  }
  return !(segment.impacts ?? []).some(
    (impact) => impact.kind === "planned-closure" && impact.cardId === selectedClosure.id,
  );
}

function EstimatedTrainMarkerLayer({
  enabled,
  markers,
  segments,
  muted,
  animate,
}: {
  enabled: boolean;
  markers: EstimatedTrainMarker[];
  segments: RenderedNetworkSegment[];
  muted: boolean;
  animate: boolean;
}) {
  const segmentById = useMemo(() => new Map(segments.map((segment) => [segment.id, segment])), [segments]);
  const markerNodes = enabled ? markers
    .filter((marker) => segmentById.get(marker.segmentId)?.pathD)
    .map((marker) => (
      <AnimatedTtcTrainMarker
        key={estimatedTrainMarkerRenderKey(marker)}
        marker={marker}
        segments={segments}
        segmentById={segmentById}
        animate={animate}
      />
    )) : [];

  if (markerNodes.length === 0) return null;

  return (
    <g className="estimated-train-marker-layer" data-muted={muted ? "true" : "false"} pointerEvents="none">
      {markerNodes}
    </g>
  );
}

function AnimatedTtcTrainMarker({
  marker,
  segments,
  segmentById,
  animate,
}: {
  marker: EstimatedTrainMarker;
  segments: RenderedNetworkSegment[];
  segmentById: Map<string, RenderedNetworkSegment>;
  animate: boolean;
}) {
  const groupRef = useRef<SVGGElement>(null);
  const pathMetricCacheRef = useRef(new Map<string, TrainMarkerPathMetrics>());
  const motionRef = useRef<TrainMarkerMotionRuntime | null>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    const targetFrame = ttcTrainMarkerFrame(marker, segmentById, pathMetricCacheRef.current);
    if (!group || !targetFrame) return;
    const current = motionRef.current;
    const targetObservationKey = estimatedTrainMarkerObservationKey(marker);
    if (current?.targetObservationKey === targetObservationKey && animate) return;
    current?.cancelAnimation?.();
    if (!current || !animate) {
      group.style.opacity = "1";
      setTrainMarkerTransform(group, targetFrame);
      motionRef.current = { marker, frame: targetFrame, targetObservationKey, cancelAnimation: null };
      return;
    }

    const waypoints = estimatedTrainMarkerMotionWaypoints(current.marker, marker, segments);
    const settledMarker = waypoints.at(-1) ?? current.marker;
    const settledFrame = ttcTrainMarkerFrame(settledMarker, segmentById, pathMetricCacheRef.current)
      ?? current.frame;
    const transition = createEstimatedTrainMarkerTransition(waypoints);
    const runtime: TrainMarkerMotionRuntime = {
      ...current,
      targetObservationKey,
      cancelAnimation: null,
    };
    motionRef.current = runtime;

    let previousSample: ReturnType<typeof sampleEstimatedTrainMarkerMotion> | null = null;
    let previousMotion: ReturnType<typeof ttcTrainMarkerMotionFrame> = null;

    const update = (now: number) => {
      const { sample, opacity, done } = transition(now);
      group.style.opacity = String(opacity);
      const motion = sample === previousSample ? previousMotion : ttcTrainMarkerMotionFrame(sample, segmentById, pathMetricCacheRef.current);
      previousSample = sample;
      previousMotion = motion;
      if (!motion) {
        group.style.opacity = "1";
        setTrainMarkerTransform(group, settledFrame);
        setTtcTrainMarkerMetadata(group, settledMarker, segmentById);
        runtime.marker = settledMarker;
        runtime.frame = settledFrame;
        runtime.cancelAnimation = null;
        return false;
      }
      setTrainMarkerTransform(group, motion.frame);
      setTtcTrainMarkerMetadata(group, motion.marker, segmentById);
      runtime.marker = motion.marker;
      runtime.frame = motion.frame;
      if (done) {
        runtime.marker = settledMarker;
        runtime.frame = settledFrame;
        runtime.cancelAnimation = null;
        setTrainMarkerTransform(group, settledFrame);
        setTtcTrainMarkerMetadata(group, settledMarker, segmentById);
        return false;
      }
      return true;
    };
    if (update(performance.now())) {
      runtime.cancelAnimation = scheduleEstimatedTrainMarkerAnimation(update);
    }
    return () => {
      runtime.cancelAnimation?.();
      runtime.cancelAnimation = null;
    };
  }, [animate, marker, segmentById, segments]);

  const visualDirection = ttcMarkerVisualDirection(marker, segmentById);
  return (
    <g
      ref={groupRef}
      className={`estimated-train-marker estimated-train-marker-${marker.lineId}`}
      data-train-marker-id={marker.id}
      data-train-marker-line-id={marker.lineId}
      data-train-marker-direction={marker.direction}
      data-train-marker-segment-id={marker.segmentId}
      data-train-marker-travel-direction={visualDirection}
      pointerEvents="none"
    >
      <title>{`${lineLabelForTrainMarker(marker.lineId)} ${marker.direction} estimated train near ${marker.nextStationId}`}</title>
      <TrainMarkerGlyph />
    </g>
  );
}

function TrainMarkerGlyph() {
  return (
    <>
      <path
        className="estimated-train-marker-outline"
        d={TRAIN_MARKER_BODY_PATH}
      />
      <path
        className="estimated-train-marker-core"
        d={TRAIN_MARKER_BODY_PATH}
      />
      {TRAIN_MARKER_WINDOWS.map((window) => (
        <rect key={window.x} className="estimated-train-marker-window" {...window} />
      ))}
      <path className="estimated-train-marker-arrow" d={TRAIN_MARKER_ARROW_PATH} />
    </>
  );
}

type TrainMarkerPathFrame = {
  point: MapPoint;
  angle: number;
};

type TrainMarkerMotionRuntime = {
  marker: EstimatedTrainMarker;
  frame: TrainMarkerPathFrame;
  targetObservationKey: string;
  cancelAnimation: (() => void) | null;
};

type TrainMarkerPathMetrics = {
  path: SVGPathElement;
  length: number;
};

const TTC_TRAIN_MARKER_LANE_OFFSET = 20;

function ttcMarkerVisualDirection(
  marker: EstimatedTrainMarker,
  segmentById: Map<string, RenderedNetworkSegment>,
) {
  const segment = segmentById.get(marker.segmentId);
  return segment
    ? visualTravelDirection({ ...segment, travelDirection: marker.travelDirection })
    : marker.travelDirection;
}

function ttcTrainMarkerFrame(
  marker: EstimatedTrainMarker,
  segmentById: Map<string, RenderedNetworkSegment>,
  pathMetricCache: Map<string, TrainMarkerPathMetrics>,
) {
  const segment = segmentById.get(marker.segmentId);
  if (!segment?.pathD) return null;
  const visualDirection = ttcMarkerVisualDirection(marker, segmentById);
  const pathProgress = visualDirection === "reverse" ? 1 - marker.progress : marker.progress;
  return pathFrameAtProgress(segment.pathD, pathProgress, visualDirection, pathMetricCache);
}

function ttcTrainMarkerMotionFrame(
  sample: ReturnType<typeof sampleEstimatedTrainMarkerMotion>,
  segmentById: Map<string, RenderedNetworkSegment>,
  pathMetricCache: Map<string, TrainMarkerPathMetrics>,
): { marker: EstimatedTrainMarker; frame: TrainMarkerPathFrame } | null {
  if (sample.from.segmentId === sample.to.segmentId
    && sample.from.fromStationId === sample.to.fromStationId
    && sample.from.toStationId === sample.to.toStationId) {
    const marker = {
      ...sample.to,
      progress: sample.from.progress + (sample.to.progress - sample.from.progress) * sample.progress,
    };
    const frame = ttcTrainMarkerFrame(marker, segmentById, pathMetricCache);
    return frame ? { marker, frame } : null;
  }
  // Motion plans deliberately contain only same-path legs. If an invalid
  // cross-path sample reaches this guard, hold the last on-track endpoint.
  const marker = sample.progress < 1 ? sample.from : sample.to;
  const frame = ttcTrainMarkerFrame(marker, segmentById, pathMetricCache);
  return frame ? { marker, frame } : null;
}

function setTrainMarkerTransform(group: SVGGElement, frame: TrainMarkerPathFrame) {
  group.setAttribute(
    "transform",
    `translate(${frame.point.x} ${frame.point.y}) rotate(${frame.angle})`,
  );
}

function setTtcTrainMarkerMetadata(
  group: SVGGElement,
  marker: EstimatedTrainMarker,
  segmentById: Map<string, RenderedNetworkSegment>,
) {
  group.dataset.trainMarkerId = marker.id;
  group.dataset.trainMarkerDirection = marker.direction;
  group.dataset.trainMarkerSegmentId = marker.segmentId;
  group.dataset.trainMarkerTravelDirection = ttcMarkerVisualDirection(marker, segmentById);
}

function pathFrameAtProgress(
  pathD: string,
  progress: number,
  visualDirection: "forward" | "reverse" | "bidirectional",
  pathMetricCache?: Map<string, TrainMarkerPathMetrics>,
): TrainMarkerPathFrame | null {
  if (typeof document === "undefined") return null;
  try {
    const metrics = trainMarkerPathMetrics(pathD, pathMetricCache);
    if (!metrics) return null;
    const { path, length } = metrics;
    if (!Number.isFinite(length) || length <= 0) return null;
    const distance = Math.max(0, Math.min(1, progress)) * length;
    const point = path.getPointAtLength(distance);
    const delta = Math.min(12, Math.max(1, length * 0.015));
    const pointAhead = path.getPointAtLength(Math.min(length, distance + delta));
    const pointBehind = path.getPointAtLength(Math.max(0, distance - delta));
    const dx = pointAhead.x - pointBehind.x;
    const dy = pointAhead.y - pointBehind.y;
    const pathAngleRad = Math.atan2(dy, dx);
    const angle = pathAngleRad * (180 / Math.PI);

    return {
      point: estimatedTrainMarkerLanePoint(
        point,
        { x: dx, y: dy },
        visualDirection,
        TTC_TRAIN_MARKER_LANE_OFFSET,
      ),
      angle: visualDirection === "reverse" ? angle + 180 : angle,
    };
  } catch {
    return null;
  }
}

function trainMarkerPathMetrics(
  pathD: string,
  pathMetricCache?: Map<string, TrainMarkerPathMetrics>,
): TrainMarkerPathMetrics | null {
  const cached = pathMetricCache?.get(pathD);
  if (cached) return cached;

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  const length = path.getTotalLength();
  const metrics = { path, length };
  pathMetricCache?.set(pathD, metrics);
  return metrics;
}

function lineLabelForTrainMarker(lineId: string) {
  switch (lineId) {
    case "line-1":
      return "Line 1";
    case "line-2":
      return "Line 2";
    case "line-4":
      return "Line 4";
    case "line-5":
      return "Line 5";
    case "line-6":
      return "Line 6";
    default:
      return "Train";
  }
}

export const InteractiveTtcMap = memo(InteractiveTtcMapComponent);
InteractiveTtcMap.displayName = "InteractiveTtcMap";

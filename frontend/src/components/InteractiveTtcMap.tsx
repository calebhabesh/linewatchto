"use client";
import { CommuteRouteLabel } from "./CommuteRouteLabel";
import { useAlertChooserDismissal } from "../hooks/useAlertChooserDismissal";
import { IncidentStationSpan } from "./IncidentStationSpan";
import { CardinalNorthIcon } from "./CardinalNorthIcon";

import { useRetainedHover } from "../hooks/useRetainedHover";
import { memo, useEffect, useState, useMemo, useLayoutEffect, useRef, useCallback } from "react";
import {
  composeNetworkSegmentPath,
  pathCorridorCollisionBoxes,
  pathMidpointFrame,
  resolveNetworkSegmentPath,
  visualTravelDirection,
  type MapBounds,
  type MapPoint,
} from "../app/map-geometry";
import { usePanZoom } from "../hooks/usePanZoom";
import { useCommittedCamera } from "./map-camera/camera-store";
import { MapZoomSlider } from "./map-camera/MapZoomSlider";
import { useFollowedChooserPortal } from "./MapOverlapChooser";
import {
  MapChooserFollower,
  chooserBadgeInView,
  type ChooserFollowAnchor,
} from "./map-chooser-follow";
import { MOBILE_VIEWPORT_QUERY } from "../hooks/useMobilePerformanceMode";
import { readDesktopLeftOcclusion, measureDesktopMapInsets } from "../app/desktop-sidebar-state";
import {
  FOCUS_REVEAL_DURATION_MS,
  focusRevealSafeArea,
  focusRevealTranslation,
  logicalBoxFromClientRect,
  shouldRevealFocusedMapTarget,
  type MapEdgeInsets,
} from "../app/map-focus-reveal";
import {
  clampPanZoomScale,
  clientRectToLogicalViewportBounds,
  computeBoundedMapFrame,
  computeInsetViewportFocus,
  logicalViewportSizeForOrientation,
  type MapContentBounds,
  type MapViewportOrientation,
} from "../hooks/panZoomMath";
import { ZoomIn, ZoomOut, Locate, X } from "lucide-react";
import { useDashboardData } from "../app/DataContext";
import { NetworkSelector } from "./NetworkSelector";
import { SharedMapControlRail } from "./SharedMapControlRail";
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
} from "../app/linewatch-data";
import type { StationSummary } from "../app/station-data";
import type { AccountCommutePathPreview } from "../app/commute-data";
import type { EstimatedTrainMarker } from "../app/train-markers";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import {
  MapLineAlertHoverCopies,
  MapLineAlertHoverOutlines,
  MapLineAlertLayer,
  MapLineAlertSelection,
  MapLineAlertTargets,
  type MapLineAlert,
  type MapOverlayVisualState,
} from "./map-overlays/LineAlertOverlays";
import { installMapHoverController, type MapHoverController } from "./map-overlays/map-hover-controller";
import type { MapOverlayPlane } from "./map-overlays/overlay-plane";
import { mapSelectionIntroKey, useMapSelectionIntro } from "./map-overlays/selection-intro";
import { clearMapStationHover, setMapStationHovered } from "./map-overlays/station-hover";
import { useMapPulseSync } from "./map-overlays/pulse-sync";
import { MapCommuteEndpointFlashes, MapCommutePreviewRoute } from "./map-overlays/CommutePreviewOverlays";
import type { MapCommutePreview } from "./map-overlays/commute-preview-model";
import { EstimatedTrainMarkerLayer } from "./TtcTrainMarkerLayer";
import {
  layoutMapOverlapBadges,
  mapBadgeAlertCorridors,
  overlapBadgeTargetsAlong,
  type MapBadgeArtwork,
} from "./map-overlays/overlap-badge-layout";
import type { PreparedMapGeometry } from "../app/map-geometry-data";
import preparedTtcGeometry from "../app/map-geometry/ttc.json";
import {
  ttcAnchorPoints,
  ttcGuidePaths,
  ttcStationCenters,
  ttcStationLabelPolygons,
} from "../app/ttc-map-geometry";
import {
  CONNECTOR_STATION_CLEARANCE,
  stationAlertPlacementAnchors,
} from "./map-overlays/overlay-obstacles";
import {
  MAP_VIEWBOX_BOUNDS,
  TRANSIT_LINE_HALF_WIDTH,
  collectBaseRouteObstacles,
  ttcArtworkObstacles,
} from "./ttc-map-obstacles";
import {
  MapOverlapIndicator,
  restoreMapOverlapIndicatorFocus,
} from "./MapOverlapIndicator";
import { RasterMapPlane, rasterMapSource, type RasterMapTheme } from "./RasterMapPlane";
import { mobilePerformanceModeMatches } from "../hooks/useMobilePerformanceMode";
import {
  observeMobileMapFrame,
  readCommutePreviewInset,
  readMobileImpactInspectorInset,
  readMobileImpactInspectorTop,
  readMobilePillBottom,
  readMobileStationSubmenuTop,
} from "../hooks/mobileMapFrame";
import { useMapLabelFontReady } from "../hooks/useMapLabelFontReady";
import { usePageVisibility } from "../hooks/usePageVisibility";
import { useRotatedListDragScroll } from "../hooks/useRotatedListDragScroll";
import {
  activeImpactsForSegment,
  buildStationOverlapBadgeGroups,
  coveredSegmentOverlapBadgeSignatures,
  getUniqueImpactKinds,
  hasOverlappingImpacts,
  mapOverlapIndicatorSizeForKindCount,
  overlapBadgeKindCounts,
  overlapBadgeSignature,
  overlapBadgeVisualItemCount,
  type MapOverlapIndicatorSize,
} from "./map-overlap-badges";
import type { PlacementObstacle } from "./overlap-badge-placement";
import type {
  ConnectorCrossing,
  ConnectorKeepOut,
  ConnectorOutline,
  OverlapBadgeConnector,
} from "./overlap-badge-connector";
import { getSelectedImpactDetails } from "./MobileImpactInspector";
import { stationImpactDirectionForImpact } from "./station-impact-direction";
import {
  MapStationAlertForeground,
  MapStationAlertRings,
  MapStationDirectionGlyphs,
} from "./map-overlays/StationAlertOverlays";
import {
  stationDirectionGlyphs,
  type MapStationAlert,
  type MapStationDirectionGlyph,
} from "./map-overlays/station-alert-model";
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
import { isMapWheelScrollRegionTarget, usePreventMapWheelDefault } from "./map-wheel-events";
import {
  stationImpactBeaconSize,
  type StationBeaconNeighbour,
} from "./station-impact-beacon";
import { getImpactPriority, plannedAdvisoryStationImpacts } from "../app/map-alert-selector";
import { linkedCurrentImpactIds } from "../app/selection-attention-key";
import {
  OVERLAP_CHOOSER_MOBILE_BREAKPOINT,
  boundsListsMatch,
  boundsContainingBoxes,
  overlapChooserSize,
  overlapChooserPreferredBox,
  overlapChooserScreenLayout,
  overlapChooserScreenLayoutsMatch,
  type OverlapChooserScreenLayout,
} from "./ttc-chooser-placement";

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

const TTC_OVERLAY_PLANE: MapOverlayPlane = {
  idPrefix: "ttc",
  unit: 1,
  maskBounds: MAP_VIEWBOX_BOUNDS,
  outlineCutouts: [],
};

/** TTC's prepared geometry (scripts/prepare-map-geometry.mjs). */
const TTC_GEOMETRY = preparedTtcGeometry as unknown as PreparedMapGeometry;
const TTC_ANCHOR_POINTS = ttcAnchorPoints(TTC_GEOMETRY);
const TTC_GUIDE_PATHS = ttcGuidePaths(TTC_GEOMETRY);
const TTC_ARTWORK_OBSTACLES = ttcArtworkObstacles(TTC_GEOMETRY);

type RetainedLayer<T> = {
  key: string;
  item: T;
  exiting: boolean;
};

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
  // Union is an interchange drawn with a regular-size dot.
  if (station.id === "union") {
    return false;
  }
  return station.interchange;
}

function stationImpactEffectRadius(isLargeStation: boolean): number {
  return isLargeStation ? 48 : 26;
}

function stationImpactDirectionBadgeRadius(isLargeStation: boolean): number {
  return isLargeStation ? 40 : 24;
}

/** A station dot's visible radius with its outline (authored r 32 or 59, stroke 8 or 15). */
function stationDotOuterRadius(isLargeStation: boolean): number {
  return isLargeStation ? 66 : 36;
}

/** Clear space a station beacon keeps from a neighbouring dot or beacon. */
const STATION_BEACON_GAP = 4;

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
  layoutResetSignal,
  entranceSignal,
  recenterSignal,
  zoomInSignal,
  zoomOutSignal,
  reducedMotion,
  mobilePerformanceMode = false,
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
  cameraCommandsEnabled = true,
  onReady,
  onNetworkChange,
  mapView,
  onMapViewChange,
  selectionAttentionGeneration = 0,
  selectionIntroKey: linkedSelectionIntroKey = null,
}: {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  stations: StationSummary[];
  selectedStationId: string | null;
  onSelectStationId: (id: string | null) => void;
  isDark: boolean;
  highContrast?: boolean;
  layoutResetSignal?: number;
  entranceSignal?: number;
  recenterSignal?: number;
  zoomInSignal?: number;
  zoomOutSignal?: number;
  reducedMotion: boolean;
  mobilePerformanceMode?: boolean;
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
  /** False while this map waits hidden behind the other network: shared zoom
   *  and Center commands are consumed without moving its camera. */
  cameraCommandsEnabled?: boolean;
  onReady?: () => void;
  onNetworkChange?: (network: NetworkId) => void;
  mapView?: MapViewPreference;
  onMapViewChange?: (view: MapViewPreference) => void;
  selectionAttentionGeneration?: number;
  /** Shared intro key; linked planned/current hops keep it so the map keeps breathing. */
  selectionIntroKey?: string | null;
}) {
  const { networkSegments, activeAlerts, delays, reducedSpeedZones, plannedClosures, stationNodeImpacts: activeStationNodeImpacts, stations: mapStations, mapAsset } = useDashboardData();
  const stationNodeImpacts = useMemo(() => [
    ...activeStationNodeImpacts,
    ...plannedAdvisoryStationImpacts(plannedClosures, activeAlerts, delays, selection),
  ], [activeStationNodeImpacts, plannedClosures, activeAlerts, delays, selection]);
  const [svgParts, setSvgParts] = useState<TtcMapMarkupParts | null>(() => (
    ttcMapMarkupCache.get(mapAsset.src) ?? null
  ));
  const [readyRasterPlanes, setReadyRasterPlanes] = useState(() => new Set<string>());
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(() => (
    ttcMapMarkupCache.has(mapAsset.src) ? "ready" : "loading"
  ));
  // Geometry is prepared data (TTC_GEOMETRY); the map is ready once its SVG is.
  const geometryReady = loadState === "ready";
  const [activeHoveredStationLabelId, setHoveredStationLabelId] = useState<string | null>(null);
  const hoveredStationLabelId = useRetainedHover(activeHoveredStationLabelId);
  const [expandedOverlapBadgeId, setExpandedOverlapBadgeId] = useState<string | null>(null);
  const overlapBadgeFocusToRestoreRef = useRef<string | null>(null);
  const mapLabelFontReady = useMapLabelFontReady();
  const pageVisible = usePageVisibility();
  const useMobileRendering = mobilePerformanceMode || mobilePerformanceModeMatches();
  const mapEffectMotionPaused = reducedMotion || !pageVisible;
  const selectionIntroComplete = useMapSelectionIntro(mapSelectionIntroKey({
    selection,
    linkedSelectionIntroKey,
    selectedStationId,
    commutePreviewKey: commutePathPreview ? `${commutePathPreview.id}:${commutePathPreview.legId}` : null,
    generation: selectionAttentionGeneration,
  }));
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
  useLayoutEffect(() => {
    const segmentId = overlapBadgeFocusToRestoreRef.current;
    if (expandedOverlapBadgeId !== null || segmentId === null) return;
    overlapBadgeFocusToRestoreRef.current = null;
    restoreMapOverlapIndicatorFocus(mapRootRef.current
      ?.querySelector<SVGGElement>(`[data-overlap-segment-id="${CSS.escape(segmentId)}"] .overlap-indicator`));
  }, [expandedOverlapBadgeId]);
  const previewOutlineLayerRef = useRef<SVGGElement>(null);
  const hoverControllerRef = useRef<MapHoverController | null>(null);
  const mapControlRailRef = useRef<HTMLDivElement>(null);
  const [desktopMapTopInset, setDesktopMapTopInset] = useState(() => {
    if (typeof window === "undefined" || window.innerWidth < 768) return 0;
    const rail = document.querySelector<HTMLElement>(".desktop-map-control-rail");
    const root = document.querySelector<HTMLElement>(".ttc-map-root");
    return measureDesktopMapInsets(root, rail).top || 76;
  });
  const [desktopMapBottomInset, setDesktopMapBottomInset] = useState(0);
  const desktopMapInsetsRef = useRef({ top: desktopMapTopInset, bottom: desktopMapBottomInset });
  const lastFittedInsetsRef = useRef<{ top: number; bottom: number } | null>(null);
  const anchorPoints = TTC_ANCHOR_POINTS;
  const guidePaths = TTC_GUIDE_PATHS;
  const stationCenterPoints = useMemo(
    () => ttcStationCenters(TTC_GEOMETRY, stationVisualCenterIds(stations)),
    [stations],
  );
  const stationLabelPolygons = useMemo(
    () => ttcStationLabelPolygons(TTC_GEOMETRY, stations.map((station) => station.id)),
    [stations],
  );
  const mapPlacementObstacles = useMemo<PlacementObstacle[]>(() => [
    ...TTC_ARTWORK_OBSTACLES,
    ...collectBaseRouteObstacles(networkSegments, mapStations, anchorPoints, guidePaths),
  ], [anchorPoints, guidePaths, mapStations, networkSegments]);
  // The lifted label is cut out of the live text, so it waits for the label
  // font (as on GO/UP).
  const hoveredLabelPolygon = hoveredStationLabelId && mapLabelFontReady
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

  const [overlapChooserFollower] = useState(() => new MapChooserFollower());
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const {
    cameraStore,
    readCamera,
    isGestureActive,
    isCameraInteracting,
    recenterFeedbackKey,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    handlePointerCancel,
    handleLostPointerCapture,
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
    cameraFollower: overlapChooserFollower,
    containerRef,
    mapRef,
    automaticRefitBlocked: Boolean(selection || selectedStationId || commutePathPreview),
  });
  const [mapViewportSize, setMapViewportSize] = useState({ width: 392, height: 720 });
  const [chooserKeepoutBoxes, setChooserKeepoutBoxes] = useState<SvgBounds[]>([]);
  const automaticResizeRefitBlockedRef = useRef(false);
  const suppressNextMapClickRef = useRef(false);
  const suppressNextMapClickTimerRef = useRef<number | null>(null);
  const suppressNextMapClick = useCallback(() => {
    suppressNextMapClickRef.current = true;
    if (suppressNextMapClickTimerRef.current !== null) {
      window.clearTimeout(suppressNextMapClickTimerRef.current);
    }
    suppressNextMapClickTimerRef.current = window.setTimeout(() => {
      suppressNextMapClickRef.current = false;
      suppressNextMapClickTimerRef.current = null;
    }, 450);
  }, []);

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
      const insets = measureDesktopMapInsets(root, rail);
      const insetsChanged = desktopMapInsetsRef.current.top !== insets.top
        || desktopMapInsetsRef.current.bottom !== insets.bottom;
      if (insetsChanged) {
        desktopMapInsetsRef.current = insets;
        setDesktopMapTopInset(insets.top);
        setDesktopMapBottomInset(insets.bottom);
        refitIfCameraUntouched();
      }
    };

    measureDesktopInsets();
    const observer = new ResizeObserver(measureDesktopInsets);
    observer.observe(root);
    observer.observe(rail);
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

  usePreventMapWheelDefault(containerRef);

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
    const fallbackTimer = window.setTimeout(() => {
      if (readyNotifiedRef.current) return;
      readyNotifiedRef.current = true;
      onReady?.();
    }, 250);
    const firstPaintFrame = window.requestAnimationFrame(() => {
      secondPaintFrame = window.requestAnimationFrame(() => {
        window.clearTimeout(fallbackTimer);
        if (readyNotifiedRef.current) return;
        readyNotifiedRef.current = true;
        onReady?.();
      });
    });

    return () => {
      window.clearTimeout(fallbackTimer);
      window.cancelAnimationFrame(firstPaintFrame);
      if (secondPaintFrame !== null) window.cancelAnimationFrame(secondPaintFrame);
    };
  }, [deferInitialEntrance, geometryReady, loadState, onReady, rasterMapReady]);



  const cameraCommandsEnabledRef = useRef(cameraCommandsEnabled);
  useEffect(() => {
    cameraCommandsEnabledRef.current = cameraCommandsEnabled;
  }, [cameraCommandsEnabled]);
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
    if (!cameraCommandsEnabledRef.current) return;
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
    if (!cameraCommandsEnabledRef.current) return;
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
    if (!cameraCommandsEnabledRef.current) return;
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

  const lastFocusedTargetKeyRef = useRef<string | null>(null);
  const lastFocusLayoutKeyRef = useRef("");
  const lastHandledLayoutResetSignalRef = useRef(0);

  useEffect(() => {
    if (!layoutResetSignal || loadState !== "ready") return;
    if (lastHandledLayoutResetSignalRef.current === layoutResetSignal) return;

    lastHandledLayoutResetSignalRef.current = layoutResetSignal;
    if (focusTargetKey) return;

    const resetTimer = window.setTimeout(() => {
      if (!isGestureActive()) recenter();
    }, 320);
    return () => window.clearTimeout(resetTimer);
  }, [layoutResetSignal, loadState, recenter, focusTargetKey, isGestureActive]);

  const selectedMapElements = useCallback(() => {
    const root = containerRef.current;
    if (!root) return [];
    if (selection) {
      // Measure corridor paths rather than their visual groups: newly enabled
      // animateMotion glyphs can still be at the SVG origin in this commit.
      // Including them would frame the space between the origin and corridor.
      return [
        ...root.querySelectorAll<SVGGraphicsElement>(
          `[data-selected-impact-emphasis="${CSS.escape(selection.id)}"], [data-map-impact-id="${CSS.escape(selection.id)}"] > .asset-alert-path, [data-station-impact-selection-id="${CSS.escape(selection.id)}"]`,
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

  /**
   * Logical-viewport edges covered by the pill, sheets, rail, sidebar, or a
   * commute preview. Selection framing and keyboard focus keep clear of them.
   */
  const readOccludedInsets = useCallback((viewport: HTMLElement, logicalHeight: number, isMobile: boolean) => {
    const focusPadding = isMobile ? 24 : 40;
    const topPillBottom = isMobile ? readMobilePillBottom(viewport) : 0;
    const mobileStationTop = isMobile && selectedStationId
      ? readMobileStationSubmenuTop(viewport, logicalHeight)
      : logicalHeight;
    const mobileImpactTop = isMobile && selection
      ? readMobileImpactInspectorTop(viewport, logicalHeight)
      : logicalHeight;

    const insets: MapEdgeInsets = {
      left: focusPadding,
      right: focusPadding,
      top: isMobile
        ? Math.max(focusPadding, topPillBottom)
        : Math.max(desktopMapTopInset + 16, focusPadding),
      bottom: isMobile
        ? (selectedStationId
            ? Math.max(focusPadding, logicalHeight - mobileStationTop)
            : Math.max(focusPadding, logicalHeight - mobileImpactTop))
        : Math.max(focusPadding, readMobileImpactInspectorInset(viewport) + focusPadding),
    };

    if (commutePathPreview && !selection && !selectedStationId) {
      insets.bottom = Math.max(insets.bottom, readCommutePreviewInset(viewport));
    }

    if (!isMobile && typeof window !== "undefined") {
      const leftOcclusion = readDesktopLeftOcclusion(viewport, 24);
      if (leftOcclusion > 0) {
        insets.left = Math.max(insets.left, leftOcclusion);
      }
    }

    return { insets, topPillBottom, mobileStationTop };
  }, [commutePathPreview, desktopMapTopInset, selectedStationId, selection]);

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
    const commutePreviewComfort = commutePathPreview && !selection && !selectedStationId ? 0.82 : 1;
    const preferredTargetScale = clampPanZoomScale(effectiveFitScale * (isMobile ? 3.8 : 1.8), effectiveFitScale);
    const {
      insets: selectionFocusInsets,
      topPillBottom,
      mobileStationTop,
    } = readOccludedInsets(viewport, logicalHeight, isMobile);

    if (selectedStationId) {
      const station = stations.find((s) => s.id === selectedStationId);
      if (station) {
        const scaleFactor = 4500 / 8250;
        const pt = stationPointFor(station);
        const mapX = pt.x * scaleFactor;
        const mapY = pt.y * scaleFactor;
        const targetScale = preferredTargetScale;
        const focusX = isMobile
          ? logicalWidth / 2
          : (logicalWidth + selectionFocusInsets.left - selectionFocusInsets.right) / 2;
        const focusY =
          isMobile && viewportOrientation !== "rotated-landscape"
            ? (topPillBottom + mobileStationTop) / 2
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
      ) * commutePreviewComfort;
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
        const targetScale = (isMobile ? 3.8 : 1.8) * commutePreviewComfort;
        zoomToBounds({
          x: (svgBounds.x - svgBounds.width * (1 / commutePreviewComfort - 1) / 2) * SVG_TO_RENDERED_MAP_SCALE,
          y: (svgBounds.y - svgBounds.height * (1 / commutePreviewComfort - 1) / 2) * SVG_TO_RENDERED_MAP_SCALE,
          width: svgBounds.width * SVG_TO_RENDERED_MAP_SCALE / commutePreviewComfort,
          height: svgBounds.height * SVG_TO_RENDERED_MAP_SCALE / commutePreviewComfort,
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
    fitScale,
    focusBoxesBySegmentId,
    loadState,
    logicalViewportSize,
    readOccludedInsets,
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

  /** Pans a keyboard-focused target out from under the panels and controls. */
  const revealFocusedMapTarget = useCallback((target: EventTarget | null) => {
    const viewport = containerRef.current;
    if (loadState !== "ready" || !viewport || !shouldRevealFocusedMapTarget(target, mapRef.current)) return;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return;
    const isMobile = window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
    const box = logicalBoxFromClientRect(rect, viewport.getBoundingClientRect(), viewportOrientation);
    const { insets } = readOccludedInsets(viewport, height, isMobile);
    const offset = focusRevealTranslation(box, focusRevealSafeArea(width, height, insets));
    if (!offset) return;
    const current = currentRenderedTransform() ?? readCamera();
    animateTransformTo(
      { x: current.x + offset.dx, y: current.y + offset.dy, scale: current.scale },
      undefined,
      true,
      FOCUS_REVEAL_DURATION_MS,
    );
  }, [animateTransformTo, containerRef, currentRenderedTransform, loadState, logicalViewportSize, mapRef, readCamera, readOccludedInsets, viewportOrientation]);

  useEffect(() => {
    if (loadState !== "ready") return;

    const currentLayoutKey = `${layoutResetSignal ?? 0}:${viewportOrientation}:${geometryReady}:${rasterMapReady}`;

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
    [...activeAlerts, ...delays]
      .map((alert) => alert.relatedPlannedClosureId)
      .filter((id): id is string => Boolean(id)),
  ), [activeAlerts, delays]);
  const linkedSelectionIds = useMemo(
    () => linkedCurrentImpactIds(selection, { activeAlerts, delays, plannedClosures }),
    [activeAlerts, delays, plannedClosures, selection],
  );
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
    () => buildActiveClosureImpactCardIds(activeAlerts, plannedClosures, delays),
    [activeAlerts, plannedClosures, delays],
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
            normalizeActiveClosureMapImpact(impact, activeClosureImpactCardIds, plannedClosures)
          ),
          pathD: resolveNetworkSegmentPath(segment, mapStations, anchorPoints, guidePaths),
          patternOriginX: originX,
          patternOriginY: originY,
          patternAngle: angle,
        } as RenderedNetworkSegment;
      })
      .filter((segment): segment is RenderedNetworkSegment => Boolean(segment.pathD));
  }, [networkSegments, mapStations, anchorPoints, guidePaths, activeClosureImpactCardIds, plannedClosures]);

  const renderedOverlaySegments = useMemo(() => {
    return renderedNetworkSegments.filter((segment) => {
      const isClosurePreview = plannedPreviewSegmentIds.has(segment.id);
      return Boolean(segment.impacts?.length) || segment.overlay !== "clear" || isClosurePreview;
    });
  }, [renderedNetworkSegments, plannedPreviewSegmentIds]);

  const renderedImpactLayers = useMemo<RenderedImpactLayer[]>(() => {
    const groups = new Map<string, { impact: MapImpact; segments: RenderedNetworkSegment[] }>();

    for (const segment of renderedOverlaySegments) {
      const impacts = activeImpactsForSegment(segment);
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

  // Segment paths per alert, for the chooser and badge preview outline.
  const previewOutlinePathsByImpact = useMemo(() => {
    const paths = new Map<string, string[]>();
    const add = (key: string, pathD: string) => {
      const list = paths.get(key);
      if (!list) paths.set(key, [pathD]);
      else if (!list.includes(pathD)) list.push(pathD);
    };
    for (const { segment, closure } of plannedPreviewLayers) add(`planned-closure:${closure.id}`, segment.pathD);
    for (const { segment, impact } of renderedImpactLayers) add(`${impact.kind}:${impact.cardId}`, segment.pathD);
    return paths;
  }, [plannedPreviewLayers, renderedImpactLayers]);

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

  // Every line alert as the shared overlay layer draws it (map-overlays/).
  const lineAlerts = useMemo<MapLineAlert[]>(() => [
    ...retainedPlannedPreviewLayers.map(({ key, item: { segment, closure }, exiting }) => (
      ttcLineAlert(key, segment, null, closure, exiting)
    )),
    ...retainedImpactLayers.map(({ key, item: { segment, impact }, exiting }) => (
      ttcLineAlert(key, segment, impact, undefined, exiting)
    )),
  ], [retainedImpactLayers, retainedPlannedPreviewLayers]);

  const selectedLineAlert = useMemo<MapLineAlert | null>(() => (
    selectedImpactEmphasis
      ? ttcLineAlert(
          `selected:${selectedImpactEmphasis.id}`,
          selectedImpactEmphasis.segment,
          selectedImpactEmphasis.impact,
          selectedImpactEmphasis.plannedClosure ?? undefined,
        )
      : null
  ), [selectedImpactEmphasis]);

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

  // Every station dot, and the ones with an alert beacon, so each beacon
  // stops short of its neighbours (station-impact-beacon.ts; GO/UP matches).
  const stationBeaconNeighbours = useMemo<StationBeaconNeighbour[]>(() => stations.flatMap((station) => (
    visualAnchorsForStation(station).map((anchor) => ({
      id: anchor.id,
      center: anchor.point,
      radius: stationDotOuterRadius(isStationVisuallyLarge(station)),
    }))
  )), [stations, visualAnchorsForStation]);
  const stationBeaconAnchorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const impact of stationNodeImpacts) {
      const station = stationBySummaryId.get(impact.stationId);
      if (!station) continue;
      for (const anchor of stationImpactVisualAnchors(station, impact, directionData, stationCenterPoints)) {
        ids.add(anchor.id);
      }
    }
    return ids;
  }, [directionData, stationBySummaryId, stationCenterPoints, stationNodeImpacts]);

  // Station alerts in the shared overlay model (components/map-overlays),
  // which GO/UP draws too.
  const stationAlerts = useMemo<MapStationAlert[]>(() => retainedStationNodeImpacts.flatMap(({ key, item: impact, exiting }) => {
    const station = stationBySummaryId.get(impact.stationId);
    if (!station) return [];
    const isLarge = isStationVisuallyLarge(station);
    const coreRadius = stationImpactEffectRadius(isLarge);
    const impactDirection = stationImpactDirectionForImpact(impact, directionData);
    const directionLabel = impactDirection?.displayDirection ? ` (${impactDirection.displayDirection})` : "";
    return [{
      key,
      kind: impact.kind,
      impactId: impact.cardId,
      stationId: station.id,
      label: `${impact.title}: ${station.name}${directionLabel}`,
      exiting,
      anchors: stationImpactVisualAnchors(station, impact, directionData, stationCenterPoints).map(({ id, point }) => ({
        id,
        center: point,
        coreRadius,
        ringRadius: stationImpactRingRadius(isLarge),
        beaconRadius: stationImpactBeaconSize(
          point,
          coreRadius,
          stationBeaconNeighbours,
          stationBeaconAnchorIds,
          STATION_BEACON_GAP,
        ).radius,
      })),
    }];
  }), [
    directionData,
    retainedStationNodeImpacts,
    stationBeaconAnchorIds,
    stationBeaconNeighbours,
    stationBySummaryId,
    stationCenterPoints,
  ]);

  const stationDirectionGlyphLayers = useMemo<MapStationDirectionGlyph[]>(() => stationDirectionGlyphs(
    stationNodeImpacts.flatMap((impact) => {
      const station = stationBySummaryId.get(impact.stationId);
      if (!station) return [];
      const badgeRadius = stationImpactDirectionBadgeRadius(isStationVisuallyLarge(station));
      return stationImpactVisualAnchors(station, impact, directionData, stationCenterPoints).map(({ id, point }) => ({
        impact,
        anchor: { id, center: point, badgeRadius },
      }));
    }),
    directionData,
  ), [directionData, stationBySummaryId, stationCenterPoints, stationNodeImpacts]);

  const retainedStationDirectionGlyphs = useRetainedMapLayers(
    stationDirectionGlyphLayers,
    useCallback((glyph) => glyph.key, []),
  );
  const stationDirectionGlyphItems = useMemo<MapStationDirectionGlyph[]>(
    () => retainedStationDirectionGlyphs.map(({ item, exiting }) => ({ ...item, exiting })),
    [retainedStationDirectionGlyphs],
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

  // The commute preview in the shared overlay model (GO/UP draws it too):
  // the composed route, and each end's station dots.
  const commutePreview = useMemo<MapCommutePreview | null>(() => {
    // Endpoints flash even when the route has no drawable path.
    const preview = commutePathPreview;
    if (!preview || preview.stationIds.length === 0) return null;
    const stationById = new Map(stations.map((station) => [station.id, station]));
    const ends = [
      { stationId: preview.stationIds[0], role: "origin" as const },
      { stationId: preview.stationIds.at(-1), role: "destination" as const },
    ];
    return {
      id: preview.id,
      label: preview.routeLabel,
      pathD: commutePreviewLayer?.segment.pathD ?? "",
      endpoints: ends.flatMap(({ stationId, role }) => {
        const station = stationId ? stationById.get(stationId) : undefined;
        if (!station) return [];
        const anchors = visualAnchorsForStation(station);
        const flashRadius = anchors.length > 1 ? 33 : isStationVisuallyLarge(station) ? 48 : 38;
        return anchors.map((anchor) => ({
          key: `${role}:${station.id}:${anchor.id}`,
          stationId: station.id,
          role,
          center: anchor.point,
          dotRadius: 34,
          flashRadius,
        }));
      }),
    };
  }, [commutePathPreview, commutePreviewLayer, stations, visualAnchorsForStation]);

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

  useMapPulseSync(mapRootRef, { paused: mapEffectMotionPaused, signature: `${loadState}::${pulseSyncSignature}` });

  // Station alerts as drawn, sized for badges and connectors by the shared
  // overlay metrics (map-overlays/overlay-obstacles.ts), as on GO/UP.
  const stationAlertPlacement = useMemo(() => (
    stationAlertPlacementAnchors(stationAlerts, TTC_OVERLAY_PLANE.unit, 1)
  ), [stationAlerts]);

  // Each line alert's corridor, for badge placement.
  const badgeCorridors = useMemo(
    () => mapBadgeAlertCorridors(lineAlerts, TTC_OVERLAY_PLANE.unit),
    [lineAlerts],
  );

  // The artwork badges keep clear of: track strokes and base routes as
  // corridors (kept clear at the wide transit-line gap only where no alert
  // covers them), everything else as one stable layer whose rasterization is
  // reused; station names connectors never pass through.
  const badgeArtwork = useMemo<MapBadgeArtwork>(() => {
    const lines = mapPlacementObstacles.filter((obstacle) => "polyline" in obstacle);
    return {
      obstacles: mapPlacementObstacles.filter((obstacle) => !("polyline" in obstacle)),
      transitLines: lines,
      transitLineHalfWidth: TRANSIT_LINE_HALF_WIDTH,
      connectorKeepOut: mapPlacementObstacles.filter((obstacle): obstacle is ConnectorKeepOut & { polygon: MapPoint[] } => "polygon" in obstacle),
      connectorCrossings: lines as ConnectorCrossing[],
    };
  }, [mapPlacementObstacles]);

  // Station dots a connector should not end on, with room for their rings.
  const stationDotKeepouts = useMemo(() => stations.flatMap((station) => (
    visualAnchorsForStation(station).map((anchor) => ({
      center: anchor.point,
      radius: stationImpactRingRadius(isStationVisuallyLarge(station)) + CONNECTOR_STATION_CLEARANCE,
    }))
  )), [stations, visualAnchorsForStation]);

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
    return segmentOverlapBadgeGroups
      .map((group): OverlapBadgeSegment | null => {
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

        // Sample each segment on its own: a composed path of disjoint segments
        // would otherwise add fake targets across the gaps between them.
        const placementTargets = group.segments.flatMap((source) => (
          source.pathD ? overlapBadgeTargetsAlong(source.pathD, 1) : []
        ));

        return {
          segmentId: group.segments[0]?.id ?? segment.id,
          layoutId: `segment:${group.segments.map((source) => source.id).sort().join("|")}`,
          label: segment.label,
          impactKinds: group.impactKinds,
          impacts: group.impacts,
          anchor: frame.point,
          placementTargets: placementTargets.length > 0 ? placementTargets : [frame.point],
          position: { ...frame.point, collisionAvoided: false },
          size: overlapBadgeSize(overlapBadgeVisualItemCount(overlapBadgeKindCounts(group.impacts))),
        };
      })
      .filter((badge): badge is OverlapBadgeSegment => Boolean(badge));
  }, [segmentOverlapBadgeGroups]);

  const stationOverlapBadges = useMemo<OverlapBadgeSegment[]>(() => {
    return stationOverlapBadgeGroups
      .map((group): OverlapBadgeSegment | null => {
        const station = stationBySummaryId.get(group.stationId);
        if (!station) return null;

        // The badge explains where these alerts meet, so it aims for the
        // station (and its own overlays beside it: the shared layout).
        const point = stationPointFor(station);
        return {
          segmentId: `station-${group.stationId}-${group.signature}`,
          layoutId: `station:${group.stationId}`,
          label: station.name,
          impactKinds: group.impactKinds,
          impacts: group.impacts,
          anchor: point,
          placementTargets: [point],
          placementAnchor: point,
          position: { ...point, collisionAvoided: false },
          size: overlapBadgeSize(overlapBadgeVisualItemCount(overlapBadgeKindCounts(group.impacts))),
        };
      })
      .filter((badge): badge is OverlapBadgeSegment => Boolean(badge));
  }, [stationBySummaryId, stationOverlapBadgeGroups, stationPointFor]);

  // Placed by the shared layout (map-overlays/overlap-badge-layout.ts), as on GO/UP.
  const overlapBadgeLayouts = useMemo(() => layoutMapOverlapBadges({
    badges: [...overlapBadgeSegments, ...stationOverlapBadges].map((badge) => ({
      id: badge.layoutId,
      impacts: badge.impacts,
      size: badge.size,
      targets: badge.placementTargets,
      stationPoint: badge.placementAnchor,
    })),
    artwork: badgeArtwork,
    corridors: badgeCorridors,
    stationAlerts: stationAlertPlacement,
    stationDots: stationDotKeepouts,
    mapBounds: MAP_VIEWBOX_BOUNDS,
    unit: TTC_OVERLAY_PLANE.unit,
    badgeScale: 1,
  }), [badgeArtwork, badgeCorridors, overlapBadgeSegments, stationAlertPlacement, stationDotKeepouts, stationOverlapBadges]);

  const overlapBadges = useMemo<OverlapBadgeWithChooser[]>(() => (
    [...overlapBadgeSegments, ...stationOverlapBadges].map((badge) => {
      const layout = overlapBadgeLayouts.get(badge.layoutId);
      return {
        ...badge,
        position: layout
          ? { ...layout.position, collisionAvoided: layout.collisionAvoided }
          : badge.position,
        affectedOutlines: layout?.affectedOutlines ?? [],
        chooserSize: overlapChooserSize(badge.impacts.length, mapViewportSize.width),
        connector: layout?.connector ?? null,
      };
    })
  ), [mapViewportSize.width, overlapBadgeLayouts, overlapBadgeSegments, stationOverlapBadges]);
  const expandedOverlapBadge = overlapBadges.find((badge) => badge.segmentId === expandedOverlapBadgeId) ?? null;
  // Camera commits re-render this map only while a chooser is open.
  const chooserCamera = useCommittedCamera(cameraStore, expandedOverlapBadge !== null);
  // Solve the chooser only at a committed camera. During a drag or a camera
  // flight the follower keeps the shown card on its badge. When the camera
  // settles, the card keeps its spot beside the badge while that spot is still
  // valid, and otherwise glides to a fresh one. A badge panned off screen
  // keeps its card attached rather than pinning it to an edge.
  const [shownOverlapChooser, setShownOverlapChooser] = useState<{
    badgeId: string;
    layout: OverlapChooserScreenLayout;
    followAnchor: ChooserFollowAnchor;
    badgeInView: boolean;
  } | null>(null);
  const shownOverlapChooserBadgeId = shownOverlapChooser?.badgeId;
  const preferredOverlapChooserBox = useMemo(
    () => shownOverlapChooser ? overlapChooserPreferredBox(shownOverlapChooser.layout) : null,
    [shownOverlapChooser],
  );
  const solvedOverlapChooser = useMemo(() => {
    if (!expandedOverlapBadge) return null;
    const camera = chooserCamera ?? readCamera();
    const layout = overlapChooserScreenLayout(
      expandedOverlapBadge,
      camera,
      mapViewportSize,
      chooserKeepoutBoxes,
      shownOverlapChooserBadgeId === expandedOverlapBadge.segmentId ? preferredOverlapChooserBox : null,
    );
    return {
      badgeId: expandedOverlapBadge.segmentId,
      layout,
      followAnchor: { badge: layout.badgeCenter, camera },
      badgeInView: chooserBadgeInView(layout.badgeCenter, mapViewportSize),
    };
  }, [
    chooserKeepoutBoxes,
    expandedOverlapBadge,
    mapViewportSize,
    preferredOverlapChooserBox,
    readCamera,
    shownOverlapChooserBadgeId,
    chooserCamera,
  ]);
  let expandedOverlapChooser = shownOverlapChooser;
  const overlapChooserChanged = solvedOverlapChooser?.badgeId !== shownOverlapChooser?.badgeId
    || (
      solvedOverlapChooser !== null
      && shownOverlapChooser !== null
      && !overlapChooserScreenLayoutsMatch(solvedOverlapChooser.layout, shownOverlapChooser.layout)
      && !isCameraInteracting()
      && solvedOverlapChooser.badgeInView
    );
  if (overlapChooserChanged) {
    expandedOverlapChooser = solvedOverlapChooser;
    setShownOverlapChooser(solvedOverlapChooser);
  }

  // Alert hover, chooser rows and group previews: the shared controller
  // (map-overlays/map-hover-controller.ts), as on GO/UP.
  useLayoutEffect(() => {
    const root = mapRootRef.current;
    if (!root) return;
    const controller = installMapHoverController(root, {
      previewOutlineLayer: () => previewOutlineLayerRef.current,
      isPointerGestureActive: isGestureActive,
    });
    hoverControllerRef.current = controller;
    return () => {
      controller.dispose();
      hoverControllerRef.current = null;
    };
  }, [isGestureActive]);

  useLayoutEffect(() => {
    hoverControllerRef.current?.setOutlineSource(TTC_OVERLAY_PLANE, previewOutlinePathsByImpact);
  }, [previewOutlinePathsByImpact]);

  // Overlay nodes of changed alerts mount idle; reapply the current hover.
  useLayoutEffect(() => {
    hoverControllerRef.current?.restore();
  }, [lineAlerts, stationAlerts]);

  const setExternalImpactsHovered = useCallback((impacts: MapImpact[], hovered: boolean) => {
    hoverControllerRef.current?.setGroupPreview(
      impacts.map((impact) => ({ kind: impact.kind, id: impact.cardId })),
      hovered,
    );
  }, []);

  // A press or wheel ends the pointer hover: the hover controller ends alert
  // hover, this the station hover and label (keeping a label that is itself
  // pressed). Chooser and badge previews stay with their owners, as on GO/UP.
  const endMapPointerHover = useCallback((preserveStationLabel = false) => {
    clearMapStationHover(mapRootRef.current);
    if (!preserveStationLabel) setHoveredStationLabelId(null);
  }, []);

  const clearMapHover = useCallback(() => {
    hoverControllerRef.current?.clear();
    endMapPointerHover();
  }, [endMapPointerHover]);

  // A hovered chooser row behaves like hovering that alert on the map; with no
  // row hovered, the chooser previews its whole group as one outline.
  const highlightOverlapChooserImpact = useCallback((impact: MapImpact | null) => {
    if (!expandedOverlapBadge) return;
    setExternalImpactsHovered(expandedOverlapBadge.impacts, !impact);
    hoverControllerRef.current?.setChooserHover(impact ? { kind: impact.kind, id: impact.cardId } : null);
  }, [expandedOverlapBadge, setExternalImpactsHovered]);

  useLayoutEffect(() => {
    if (!expandedOverlapBadge) return;
    highlightOverlapChooserImpact(null);
    return () => {
      hoverControllerRef.current?.setChooserHover(null);
      setExternalImpactsHovered(expandedOverlapBadge.impacts, false);
    };
  }, [expandedOverlapBadge, highlightOverlapChooserImpact, setExternalImpactsHovered]);

  return (
    <div
      ref={mapRootRef}
      className="relative w-full h-full flex flex-col overflow-hidden bg-transparent"
      data-map-viewport-orientation={viewportOrientation}
    >
      {/* Top center map controls */}
      {/* Note: ml-2 sm:ml-3 is added to visually center the mass of the controls, since the left side has 2 buttons and is visually heavier than the right side */}
      <SharedMapControlRail network="ttc" ref={mapControlRailRef} className="map-control-rail desktop-map-control-rail absolute top-14 sm:top-5 left-1/2 -translate-x-1/2 z-30 flex flex-row items-center justify-center gap-1 sm:gap-2 pointer-events-auto" data-map-chooser-keepout>
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

          <MapZoomSlider cameraStore={cameraStore} fitScale={fitScale} onZoomToScale={zoomToScale} />

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
      </SharedMapControlRail>

      {/* Map Viewport */}
      <div
        ref={containerRef}
        data-map-pan-zoom-viewport
        data-map-camera-moving="false"
        data-map-gesture-active="false"
        data-map-pointer-dragging="false"
        data-map-zoom-active="false"
        className="relative w-full h-full overflow-hidden select-none touch-none cursor-grab"
        onPointerDown={(event) => {
          suppressNextMapClickRef.current = false;
          if (suppressNextMapClickTimerRef.current !== null) {
            window.clearTimeout(suppressNextMapClickTimerRef.current);
            suppressNextMapClickTimerRef.current = null;
          }
          endMapPointerHover(event.target instanceof Element && Boolean(event.target.closest(".station-label-hit-target")));
          handlePointerDown(event);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handleLostPointerCapture}
        onFocus={(event) => revealFocusedMapTarget(event.target)}
        onWheel={(event) => {
          if (!isMapWheelScrollRegionTarget(event.target)) endMapPointerHover();
          handleWheel(event);
        }}
        onClickCapture={(event) => {
          // Chooser controls and overlap badges stop mouse pointerdown from
          // starting a map gesture, so that pointerdown never clears the
          // trailing-click guard left by an earlier drag. They must bypass it,
          // or every badge stays inert until the bare map is pressed. Badges
          // apply their own drag guard to touch and pen clicks.
          if (event.target instanceof Element
            && event.target.closest("[data-overlap-chooser], .overlap-indicator-group")) return;
          // Android may retarget the synthesized click to a different label
          // after pointerup activates a dot/overlay and focuses the camera.
          // Consume it before any child can replace that completed selection.
          if (event.detail === 0 || (!suppressNextMapClickRef.current && !shouldSuppressMapClick())) return;
          suppressNextMapClickRef.current = false;
          event.stopPropagation();
        }}
        onClick={(event) => {
          if (shouldSuppressMapClick()) return;
          if (suppressNextMapClickRef.current) {
            suppressNextMapClickRef.current = false;
            return;
          }
          const target = event.target instanceof Element ? event.target : null;
          const elementAtPoint = typeof document !== "undefined" && event.clientX && event.clientY
            ? document.elementFromPoint(event.clientX, event.clientY)
            : null;
          const hitElement = target?.closest(".station-hit-target, .station-label-hit-target, [data-overlay-interaction-target], [data-map-highlight-id], .overlap-indicator, button, [role='button'], [data-map-chooser-keepout]")
            ?? elementAtPoint?.closest(".station-hit-target, .station-label-hit-target, [data-overlay-interaction-target], [data-map-highlight-id], .overlap-indicator, button, [role='button'], [data-map-chooser-keepout]");
          if (hitElement) {
            const stationLabel = hitElement.closest<SVGElement>(".station-label-hit-target");
            if (stationLabel?.dataset.stationLabelId) {
              onSelectStationId(stationLabel.dataset.stationLabelId);
            }
            return;
          }
          onSelectImpact(null);
          onSelectStationId(null);
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
              visibility: "hidden",
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
                    />
                    <feColorMatrix in="noise" type="saturate" values="0" result="monoNoise" />
                    <feComposite in="monoNoise" in2="SourceGraphic" operator="in" />
                  </filter>
                </defs>
                <g aria-label="Disruption overlays">
                  <MapLineAlertLayer
                    alerts={commutePreviewLayer && selectedLineAlert
                      // The commute focus copy below repaints the selected alert.
                      ? lineAlerts.filter((alert) => !(
                        alert.kind === selectedLineAlert.kind && alert.impactId === selectedLineAlert.impactId
                      ))
                      : lineAlerts}
                    plane={TTC_OVERLAY_PLANE}
                    selection={selection}
                  />
                </g>

                <g aria-label="Commute route preview">
                  <MapCommutePreviewRoute preview={commutePreview} />
                </g>

                <g aria-label="Selected disruption emphasis">
                  <MapLineAlertSelection
                    alerts={selectedLineAlert ? [selectedLineAlert] : []}
                    plane={TTC_OVERLAY_PLANE}
                    commutePreviewActive={Boolean(commutePreviewLayer)}
                    introComplete={selectionIntroComplete}
                  />
                </g>

                {/* Repaint hovered visuals above impacts but below station artwork. */}
                <MapLineAlertHoverCopies alerts={lineAlerts} plane={TTC_OVERLAY_PLANE} />

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
                  animate={!mapEffectMotionPaused}
                />
              </g>
              <g aria-label="Cardinal North Compass" transform="translate(7600, 2300) scale(4)">
                <CardinalNorthIcon width={75} height={100} dark={isDark} />
              </g>
            </svg>

            {/* Interactive Layer: Hit targets on the very top so they hover ABOVE stations */}
            <svg
              className="raster-map-interaction-plane absolute top-0 left-0 w-[4500px] h-[2181.8px] pointer-events-none"
              viewBox="0 0 8250 4000"
              preserveAspectRatio="xMidYMid meet"
            >
              <MapLineAlertHoverOutlines alerts={lineAlerts} plane={TTC_OVERLAY_PLANE} />
              <g aria-hidden="true" pointerEvents="none">
                <g ref={previewOutlineLayerRef} className="map-impact-preview-outline-layer" />
              </g>
              <g aria-label="Disruption overlay interaction targets">
                <MapLineAlertTargets
                  alerts={lineAlerts}
                  onSelect={onSelectImpact}
                  shouldSuppressMapClick={shouldSuppressMapClick}
                  suppressNextMapClick={suppressNextMapClick}
                />
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
                        setMapStationHovered(mapRootRef.current, station.id, true);
                      }}
                      onPointerLeave={(event) => {
                        if (event.pointerType !== "mouse") return;
                        setMapStationHovered(mapRootRef.current, station.id, false);
                      }}
                      onFocus={() => {
                        setMapStationHovered(mapRootRef.current, station.id, true);
                      }}
                      onBlur={() => {
                        setMapStationHovered(mapRootRef.current, station.id, false);
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
                              suppressNextMapClick();
                              if (hasMultipleVisualAnchors) {
                                setMapStationHovered(mapRootRef.current, station.id, false);
                              }
                              onSelectStationId(station.id);
                            }}
                            onClick={(event) => {
                              // Primary mouse/touch activation is handled on pointerup because
                              // browsers can drop the later synthesized click when the map camera
                              // transform is committed between pointerdown and click.
                              event.stopPropagation();
                              if (event.detail !== 0 || shouldSuppressMapClick()) return;
                              if (hasMultipleVisualAnchors) {
                                setMapStationHovered(mapRootRef.current, station.id, false);
                              }
                              onSelectStationId(station.id);
                            }}
                            onKeyDown={(event) => {
                              if (anchorIndex !== 0) return;
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                if (hasMultipleVisualAnchors) {
                                  setMapStationHovered(mapRootRef.current, station.id, false);
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
              <g aria-label="Commute endpoint highlights">
                <MapCommuteEndpointFlashes preview={commutePreview} plane={TTC_OVERLAY_PLANE} />
              </g>
              <g aria-label="Station impact rings">
                <MapStationAlertRings
                  alerts={stationAlerts}
                  plane={TTC_OVERLAY_PLANE}
                  selection={selection}
                  onSelect={onSelectImpact}
                  shouldSuppressMapClick={shouldSuppressMapClick}
                  suppressNextMapClick={suppressNextMapClick}
                />
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
                        setMapStationHovered(mapRootRef.current, station.id, false);
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
                        try {
                          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                            event.currentTarget.releasePointerCapture(event.pointerId);
                          }
                        } catch {
                          // Pointer capture may already be released by the browser during cancellation.
                        }
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (shouldSuppressMapClick()) return;
                        suppressNextMapClick();
                        onSelectStationId(station.id);
                      }}
                      pointerEvents="all"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </g>
              <g aria-label="Station impact direction glyphs">
                <MapStationDirectionGlyphs glyphs={stationDirectionGlyphItems} />
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
                <MapStationAlertForeground
                  alerts={stationAlerts}
                  plane={TTC_OVERLAY_PLANE}
                  selection={selection}
                  commutePreviewActive={Boolean(commutePreviewLayer)}
                  introComplete={selectionIntroComplete}
                />
              </g>
              <g aria-label="Overlapping alert badges">
                {overlapBadges
                  .filter((badge) => badge.segmentId !== expandedOverlapBadgeId)
                  .map((badge) => (
                    <OverlapIndicatorMarker
                      key={badge.segmentId}
                      badge={badge}
                      selection={selection}
                      linkedSelectionIds={linkedSelectionIds}
                      isOpen={false}
                      onToggle={() => {
                        clearMapHover();
                        setExpandedOverlapBadgeId(badge.segmentId);
                      }}
                      onHoverChange={(hovered) => setExternalImpactsHovered(badge.impacts, hovered)}
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
                      linkedSelectionIds={linkedSelectionIds}
                      isOpen
                      onToggle={() => {
                        clearMapHover();
                        setExpandedOverlapBadgeId(null);
                      }}
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
        {expandedOverlapBadge && expandedOverlapChooser ? (
          <OverlapChooser
            key={expandedOverlapBadge.segmentId}
            badge={expandedOverlapBadge}
            selectionKey={focusTargetKey ? `${focusTargetKey}:${selectionAttentionGeneration}` : null}
            layout={expandedOverlapChooser.layout}
            follower={overlapChooserFollower}
            followAnchor={expandedOverlapChooser.followAnchor}
            onSelectImpact={onSelectImpact}
            onHoverImpact={highlightOverlapChooserImpact}
            onClose={(restoreFocus) => {
              clearMapHover();
              overlapBadgeFocusToRestoreRef.current = restoreFocus ? expandedOverlapBadge.segmentId : null;
              setExpandedOverlapBadgeId(null);
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
            Viewing <strong><CommuteRouteLabel label={commutePathPreview.routeLabel} /></strong>
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
  /** Points along the overlay this badge explains; placement stays close to them. */
  placementTargets: MapPoint[];
  /** Preferred spot among equally close ones; defaults to the middle of the targets. */
  placementAnchor?: MapPoint;
  position: OverlapBadgePosition;
  size: OverlapBadgeSize;
};

type OverlapBadgeWithChooser = OverlapBadgeSegment & {
  connector: OverlapBadgeConnector | null;
  /** Visible overlays of this badge's alerts; the chooser keeps them uncovered. */
  affectedOutlines: ConnectorOutline[];
  chooserSize: OverlapBadgeSize;
};

type OverlapBadgeGroup = {
  signature: string;
  segments: RenderedNetworkSegment[];
  impacts: MapImpact[];
  impactKinds: MapImpactKind[];
};

function visualStateForImpactKind(kind: MapImpactKind): MapOverlayVisualState {
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

/** A TTC impact or planned-closure preview as the shared overlay layer draws it. */
function ttcLineAlert(
  key: string,
  segment: RenderedNetworkSegment,
  impact: MapImpact | null,
  closure: PlannedClosure | undefined,
  exiting = false,
): MapLineAlert {
  return {
    key,
    kind: impact?.kind ?? "planned-closure",
    impactId: impact?.cardId ?? closure?.id ?? "unknown",
    lineId: segment.lineId,
    pathD: segment.pathD,
    travelDirection: visualTravelDirection(segment),
    visualState: impact ? visualStateForImpactKind(impact.kind) : "planned-preview",
    label: impact
      ? `${impact.kind}: ${segment.label}`
      : `${closure?.title ?? "Planned advisory"}: ${segment.label}`,
    segmentIds: segment.sourceSegmentIds ?? [segment.id],
    exiting,
  };
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
  return `${linePrefix}${details.location || fallbackLocation}`;
}

function overlapChooserTypeLabel(
  kind: MapImpactKind,
  details: ReturnType<typeof getSelectedImpactDetails>,
): string {
  if (kind === "suspension") return details?.categoryLabel ?? "Suspension";
  if (kind !== "planned-closure") return labelForImpactKind(kind);
  if (details?.categoryLabel === "Upcoming Closure") return "Planned Advisory";
  return details?.categoryLabel ?? "Planned Advisory";
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

function OverlapChooser({
  badge,
  selectionKey,
  layout,
  onSelectImpact,
  onHoverImpact,
  onClose,
  reducedMotion,
  compactMotion,
  viewportOrientation,
  viewportSize,
  follower,
  followAnchor,
}: {
  badge: OverlapBadgeWithChooser;
  selectionKey: string | null;
  layout: OverlapChooserScreenLayout;
  onSelectImpact: (selection: ImpactSelection) => void;
  onHoverImpact: (impact: MapImpact | null) => void;
  onClose: (restoreFocus: boolean) => void;
  reducedMotion: boolean;
  compactMotion: boolean;
  viewportOrientation: MapViewportOrientation;
  viewportSize: { width: number; height: number };
  follower: MapChooserFollower;
  followAnchor: ChooserFollowAnchor;
}) {
  const data = useDashboardData();
  const surfaceRef = useRef<HTMLDivElement>(null);
  useAlertChooserDismissal(selectionKey, onClose);
  const firstChoiceRef = useRef<HTMLButtonElement>(null);
  const initialFocusPendingRef = useRef(true);
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
  const { attachPortal, portalStyle } = useFollowedChooserPortal({
    follower,
    followAnchor,
    layout,
    size: layout,
    viewportOrientation,
    viewportSize,
    reducedMotion,
  });

  useLayoutEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      firstChoiceRef.current?.focus({ preventScroll: true });
      initialFocusPendingRef.current = false;
    });
    const animation = reducedMotion ? undefined : surfaceRef.current?.animate([
      { opacity: 0, transform: "scale(0.98)" },
      { opacity: 1, transform: "scale(1)" },
    ], {
      duration: compactMotion ? 100 : 140,
      easing: "ease-out",
    });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      animation?.cancel();
    };
  }, [compactMotion, reducedMotion]);

  const close = async (restoreFocus: boolean) => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (!reducedMotion) {
      const animation = surfaceRef.current?.animate([
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(0.98)" },
      ], {
        duration: compactMotion ? 70 : 100,
        easing: "ease-in",
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
      ref={attachPortal}
      className="overlap-chooser-portal overlap-chooser-object open"
      style={portalStyle}
      data-overlap-chooser-covers-affected-area={layout.coversAffectedArea ? "true" : "false"}
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
                onFocus={(event) => {
                  if (!initialFocusPendingRef.current && event.currentTarget.matches(":focus-visible")) {
                    onHoverImpact(impact);
                  }
                }}
                onBlur={() => onHoverImpact(null)}
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
                  <strong>{overlapChooserTypeLabel(impact.kind, details)}{impact.kind === "planned-closure" && details?.serviceEffect ? (
                    <span className="overlap-chooser-choice-effect"><span aria-hidden="true">{" ·\u00a0"}</span>{details.serviceEffect === "limited-service" ? "Limited Service" : details.serviceEffect === "suspension" ? "Closure" : "Delay"}</span>
                  ) : null}</strong>
                  {impact.kind === "planned-closure" && details?.closureDateLabel ? (
                    <span className="overlap-chooser-choice-date">{details.closureDateLabel}{details?.closureTimeLabel ? <><span className="sr-only">, </span><span className="overlap-chooser-choice-time">{details.closureTimeLabel}</span></> : null}</span>
                  ) : null}
                  <span className="overlap-chooser-choice-location"><IncidentStationSpan location={formatOverlapChooserLocation(details, badge.label)} direction={details?.displayDirection} />{details?.displayDirection?.trim() ? <span className="overlap-chooser-choice-direction"> {details.displayDirection.trim()}</span> : null}</span>
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
  linkedSelectionIds,
  isOpen,
  onToggle,
  onHoverChange,
  shouldSuppressMapClick,
}: {
  badge: OverlapBadgeWithChooser;
  selection: ImpactSelection;
  linkedSelectionIds: readonly string[];
  isOpen: boolean;
  onToggle: () => void;
  onHoverChange?: (hovered: boolean) => void;
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
      linkedSelectionIds={linkedSelectionIds}
      isOpen={isOpen}
      collisionAvoided={badge.position.collisionAvoided}
      isolatePointerDown
      connector={badge.connector}
      onActivate={onToggle}
      onHoverChange={onHoverChange}
      shouldSuppressMapClick={shouldSuppressMapClick}
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

export const InteractiveTtcMap = memo(InteractiveTtcMapComponent);
InteractiveTtcMap.displayName = "InteractiveTtcMap";

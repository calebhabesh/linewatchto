"use client";
import { CommuteRouteLabel } from "./CommuteRouteLabel";
import { CardinalNorthIcon } from "./CardinalNorthIcon";

import { useRetainedHover } from "../hooks/useRetainedHover";
import { memo, useEffect, useState, useMemo, useLayoutEffect, useRef, useCallback, type PointerEvent } from "react";
import { usePanZoom } from "../hooks/usePanZoom";
import { MapZoomSlider } from "./map-camera/MapZoomSlider";
import { MapOverlapChooser } from "./MapOverlapChooser";
import {
  MapStationHoverIndicators,
  MapStationLabelTargets,
  MapStationSelection,
  MapStationTargets,
  type MapStationHoverChange,
  type MapStationLabelHoverChange,
} from "./MapStationLayers";
import { mapStationArtwork, placeMapStations } from "../app/map-station-artwork";
import { useMapOverlapChooser, useMapViewportSize } from "./map-overlays/useMapOverlapChooser";
import {
  MapChooserFollower,
} from "./map-chooser-follow";
import { mapFocusTargetKey, useDesktopMapInsets, useMapFraming } from "./map-camera/useMapFraming";
import {
  type MapContentBounds,
  type MapViewportOrientation,
} from "../hooks/panZoomMath";
import { ZoomIn, ZoomOut, Locate } from "lucide-react";
import { useDashboardData } from "../app/DataContext";
import { NetworkSelector } from "./NetworkSelector";
import { SharedMapControlRail } from "./SharedMapControlRail";
import { MapViewSelector } from "./MapViewSelector";
import type { NetworkId } from "../app/regional-data";
import type { MapViewPreference } from "../app/visual-preferences";
import type {
  ImpactSelection,
  MapImpact,
} from "../app/linewatch-data";
import type { StationSummary } from "../app/station-data";
import type { AccountCommutePathPreview } from "../app/commute-data";
import type { EstimatedTrainMarker } from "../app/train-markers";
import {
  MapLineAlertHoverCopies,
  MapLineAlertHoverOutlines,
  MapLineAlertLayer,
  MapLineAlertSelection,
  MapLineAlertTargets,
} from "./map-overlays/LineAlertOverlays";
import { installMapHoverController, type MapHoverController } from "./map-overlays/map-hover-controller";
import type { MapOverlayPlane } from "./map-overlays/overlay-plane";
import { mapSelectionIntroKey, useMapSelectionIntro } from "./map-overlays/selection-intro";
import { clearMapStationHover, setMapStationHovered } from "./map-overlays/station-hover";
import { useMapTaps } from "./map-overlays/useMapTaps";
import { useMapPulseSync } from "./map-overlays/pulse-sync";
import { MapCommuteEndpointFlashes, MapCommutePreviewRoute } from "./map-overlays/CommutePreviewOverlays";
import { MapTrainMarkerLayer } from "./map-overlays/TrainMarkerLayer";
import { useRetainedMapItems } from "./map-overlays/useRetainedMapItems";
import { mapContentReuser, placeMapOverlapBadges, type MapPlacedOverlapBadge } from "../app/map-content";
import { TTC_TRAIN_MARKER_PLACEMENT, ttcMapContent, ttcRenderedNetworkSegments } from "../app/ttc-map-content";
import type { PreparedMapGeometry } from "../app/map-geometry-data";
import preparedTtcGeometry from "../app/map-geometry/ttc.json";
import {
  ttcStationLabelPolygons,
} from "../app/ttc-map-geometry";
import {
  MAP_VIEWBOX_BOUNDS,
} from "./ttc-map-obstacles";
import {
  MapOverlapIndicator,
  restoreMapOverlapIndicatorFocus,
} from "./MapOverlapIndicator";
import { RasterMapPlane, rasterMapSource, type RasterMapTheme } from "./RasterMapPlane";
import { mobilePerformanceModeMatches } from "../hooks/useMobilePerformanceMode";
import { observeMobileMapFrame } from "../hooks/mobileMapFrame";
import { useMapLabelFontReady } from "../hooks/useMapLabelFontReady";
import { usePageVisibility } from "../hooks/usePageVisibility";
import {
  type MapOverlapIndicatorSize,
} from "./map-overlap-badges";
import {
  MapStationAlertForeground,
  MapStationAlertRings,
  MapStationDirectionGlyphs,
} from "./map-overlays/StationAlertOverlays";
import {
} from "./map-chooser-keepouts";
import { isMapWheelScrollRegionTarget, usePreventMapWheelDefault } from "./map-wheel-events";
import { linkedCurrentImpactIds } from "../app/selection-attention-key";
import {
  meetStageTransform,
  overlapChooserSize,
  type MapStageTransform,
} from "./map-chooser-placement";
import { MAP_MANIFESTS } from "../app/map-manifests";

const DESKTOP_MAP_HORIZONTAL_INSET_RATIO = 0.025;
const MOBILE_MAP_HORIZONTAL_INSET_RATIO = 0.025;
const TTC_MANIFEST = MAP_MANIFESTS.ttc;
const TTC_MAP_CONTENT_BOUNDS: MapContentBounds = TTC_MANIFEST.contentBounds;
/** TTC's view box fills its 4500 px stage at the origin. */
const TTC_STAGE: MapStageTransform = meetStageTransform(
  TTC_MANIFEST.viewBox,
  TTC_MANIFEST.stage.width,
  TTC_MANIFEST.stage.height,
);
const TTC_OVERLAY_PLANE: MapOverlayPlane = {
  idPrefix: "ttc",
  unit: 1,
  maskBounds: MAP_VIEWBOX_BOUNDS,
  outlineCutouts: [],
};

/** TTC's prepared geometry (scripts/prepare-map-geometry.mjs). */
const TTC_GEOMETRY = preparedTtcGeometry as unknown as PreparedMapGeometry;
const TTC_STATION_ARTWORK = mapStationArtwork(TTC_GEOMETRY, TTC_MANIFEST.stationPartSuffixes);

import {
  preloadTtcMapMarkup,
  ttcMapMarkupCache,
  type TtcMapMarkupParts,
} from "../app/map-preload";
export { preloadTtcMapMarkup };

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
  const mapRootRef = useRef<HTMLDivElement>(null);
  const selectionIntroComplete = useMapSelectionIntro(mapSelectionIntroKey({
    selection,
    linkedSelectionIntroKey,
    selectedStationId,
    commutePreviewKey: commutePathPreview ? `${commutePathPreview.id}:${commutePathPreview.legId}` : null,
    generation: selectionAttentionGeneration,
  }), mapRootRef);
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
  const stationLabelPolygons = useMemo(
    () => ttcStationLabelPolygons(TTC_GEOMETRY, stations.map((station) => station.id)),
    [stations],
  );
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

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const desktopInsets = useDesktopMapInsets(containerRef, mapControlRailRef, mapChromeVisible);
  const desktopMapTopInset = desktopInsets.top;
  const desktopMapBottomInset = desktopInsets.bottom;
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
  const {
    cameraStore,
    readCamera,
    isGestureActive,
    isCameraInteracting,
    recenterFeedbackKey,
    activePointerCount,
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
    logicalViewportSize,
    defaultTransformForViewport,
    moveToDefaultCamera,
    animateTransformTo,
    currentRenderedTransform,
    fitScale,
    shouldSuppressMapClick,
    replayEntrance,
    refitIfCameraUntouched,
    clearCameraAdjustment,
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
  const mapViewportSize = useMapViewportSize(containerRef, viewportOrientation);
  const automaticResizeRefitBlockedRef = useRef(false);

  useLayoutEffect(() => observeMobileMapFrame(containerRef.current, () => {
    if (!isMapActive) return;
    if (window.innerWidth < 768 && !automaticResizeRefitBlockedRef.current) refitIfCameraUntouched();
  }), [containerRef, isMapActive, refitIfCameraUntouched, mapChromeVisible]);

  useEffect(() => {
    automaticResizeRefitBlockedRef.current = Boolean(selection || selectedStationId || commutePathPreview);
  }, [commutePathPreview, selectedStationId, selection]);

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

  const focusTargetKey = useMemo(
    () => mapFocusTargetKey({ selection, selectedStationId, commutePathPreview }, selectionAttentionGeneration),
    [commutePathPreview, selection, selectedStationId, selectionAttentionGeneration],
  );

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
          initializeCamera();
        } else {
          initialCameraPositionedRef.current = true;
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
  }, [animateInitialEntrance, completeStagedEntrance, containerRef, deferInitialEntrance, focusTargetKey, geometryReady, initializeCamera, loadState, moveToDefaultCamera, rasterMapReady, stageInitialEntrance]);

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




  const lastEntranceSignalRef = useRef(entranceSignal ?? 0);

  useEffect(() => {
    if (entranceSignal === undefined || entranceSignal === lastEntranceSignalRef.current || loadState !== "ready") return;

    lastEntranceSignalRef.current = entranceSignal;
    replayEntrance();
  }, [entranceSignal, loadState, replayEntrance]);

  const { revealFocusedMapTarget } = useMapFraming({
    camera: {
      containerRef,
      mapRef,
      readCamera,
      currentRenderedTransform,
      logicalViewportSize,
      defaultTransformForViewport,
      animateTransformTo,
      moveToDefaultCamera,
      clearCameraAdjustment,
      isGestureActive,
      recenter,
      recenterWithFeedback,
      refitIfCameraUntouched,
      zoomIn,
      zoomOut,
    },
    ready: loadState === "ready",
    contentKey: `${geometryReady}:${rasterMapReady}`,
    focusTargetKey,
    desktopInsets,
    viewportOrientation,
    mobilePerformanceMode,
    selection,
    selectedStationId,
    commutePathPreview,
    preserveCameraOnSelectionClear,
    cameraCommandsEnabled,
    layoutResetSignal,
    recenterSignal,
    zoomInSignal,
    zoomOutSignal,
  });

  // Station targets take their dots' shapes from the artwork; a station the
  // artwork lacks is placed at its data position.
  const stationPlacements = useMemo(() => placeMapStations(TTC_STATION_ARTWORK, stations.map((station) => ({
    id: station.id,
    name: station.name,
    fallbackPoint: { x: station.mapX, y: station.mapY },
  }))), [stations]);
  const selectedStationArtwork = useMemo(
    () => stationPlacements.find(({ artwork }) => artwork.id === selectedStationId)?.artwork ?? null,
    [selectedStationId, stationPlacements],
  );
  const stationLabelTargets = useMemo(
    () => [...stationLabelPolygons].map(([stationId, points]) => ({ stationId, points })),
    [stationLabelPolygons],
  );
  // Hovering or focusing a station also lifts its name, as on GO/UP.
  const onStationHoverChange = useCallback<MapStationHoverChange>((stationId, hovered, via) => {
    setMapStationHovered(mapRootRef.current, stationId, hovered);
    if (!hovered) {
      setHoveredStationLabelId((current) => current === stationId ? null : current);
    } else if (via === "pointer" || window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      setHoveredStationLabelId(stationId);
    }
  }, []);
  // Hovering a name lifts it without ringing the dot.
  const onStationLabelHoverChange = useCallback<MapStationLabelHoverChange>((stationId, hovered) => {
    if (hovered) {
      setMapStationHovered(mapRootRef.current, stationId, false);
      setHoveredStationLabelId(stationId);
    } else {
      setHoveredStationLabelId((current) => current === stationId ? null : current);
    }
  }, []);

  const linkedSelectionIds = useMemo(
    () => linkedCurrentImpactIds(selection, { activeAlerts, delays, plannedClosures }),
    [activeAlerts, delays, plannedClosures, selection],
  );

  // What the map draws, from TTC's content adapter (app/ttc-map-content.ts).
  // Unchanged alerts keep their objects, so their memoized drawings stay.
  const [reuseContent] = useState(mapContentReuser);
  const content = useMemo(() => reuseContent(ttcMapContent(TTC_GEOMETRY, {
      networkSegments,
      activeAlerts,
      delays,
      reducedSpeedZones,
      plannedClosures,
      stationNodeImpacts: activeStationNodeImpacts,
      mapStations,
      stations,
      selection,
      commutePathPreview,
    })), [activeAlerts, activeStationNodeImpacts, commutePathPreview, delays, mapStations, networkSegments, plannedClosures, reducedSpeedZones, reuseContent, selection, stations]);
  const renderedNetworkSegments = useMemo(() => ttcRenderedNetworkSegments(TTC_GEOMETRY, {
    networkSegments, mapStations, activeAlerts, delays, reducedSpeedZones, plannedClosures,
  }), [activeAlerts, delays, mapStations, networkSegments, plannedClosures, reducedSpeedZones]);
  // Alerts that leave the data fade out.
  const lineAlerts = useRetainedMapItems(content.lineAlerts);
  const stationAlerts = useRetainedMapItems(content.stationAlerts);
  const stationDirectionGlyphItems = useRetainedMapItems(content.stationDirectionGlyphs);
  const selectedLineAlert = content.selectedLineAlerts[0] ?? null;
  const { commutePreview, outlinePathsByImpact: previewOutlinePathsByImpact } = content;
  const commutePreviewActive = Boolean(commutePreview?.pathD);

  const pulseSyncSignature = useMemo(() => [
    ...lineAlerts.map((alert) => `${alert.key}:${Boolean(alert.exiting)}`),
    "",
    ...stationAlerts.map((alert) => `${alert.key}:${Boolean(alert.exiting)}`),
  ].join("|"), [lineAlerts, stationAlerts]);

  useMapPulseSync(mapRootRef, { paused: mapEffectMotionPaused, signature: `${loadState}::${pulseSyncSignature}` });

  // Placed by the shared layout (map-overlays/overlap-badge-layout.ts), as on GO/UP.
  const placedOverlapBadges = useMemo(
    () => placeMapOverlapBadges(content, { unit: TTC_OVERLAY_PLANE.unit, mapBounds: MAP_VIEWBOX_BOUNDS }),
    [content],
  );
  const overlapBadges = useMemo<OverlapBadgeWithChooser[]>(() => placedOverlapBadges.map((badge) => ({
    ...badge,
    chooserSize: overlapChooserSize(badge.impacts.length, mapViewportSize.width),
  })), [mapViewportSize.width, placedOverlapBadges]);
  const expandedOverlapBadge = overlapBadges.find((badge) => badge.markerId === expandedOverlapBadgeId) ?? null;
  const expandedOverlapChooser = useMapOverlapChooser({
    badge: expandedOverlapBadge && {
      id: expandedOverlapBadge.markerId,
      position: expandedOverlapBadge.position,
      size: expandedOverlapBadge.size,
      impactCount: expandedOverlapBadge.impacts.length,
      affectedOutlines: expandedOverlapBadge.affectedOutlines,
    },
    stage: TTC_STAGE,
    cameraStore,
    readCamera,
    isCameraInteracting,
    viewportRef: containerRef,
    viewportSize: mapViewportSize,
    viewportOrientation,
  });

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
  const endPressedMapHover = useCallback((event: PointerEvent<HTMLDivElement>) => {
    endMapPointerHover(event.target instanceof Element && Boolean(event.target.closest(".station-label-hit-target")));
  }, [endMapPointerHover]);
  // Taps take the shared path (map-overlays/useMapTaps.ts), as on GO/UP.
  const tapHandlers = useMapTaps({
    camera: {
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      handlePointerCancel,
      activePointerCount,
      shouldSuppressMapClick,
    },
    onSelectStationId,
    onSelectImpact,
    onPress: endPressedMapHover,
  });

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
        {...tapHandlers}
        onPointerLeave={handlePointerLeave}
        onLostPointerCapture={handleLostPointerCapture}
        onFocus={(event) => revealFocusedMapTarget(event.target)}
        onWheel={(event) => {
          if (!isMapWheelScrollRegionTarget(event.target)) endMapPointerHover();
          handleWheel(event);
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
                    alerts={commutePreviewActive && selectedLineAlert
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

                {/* Repaint hovered visuals above impacts but below station artwork. */}
                <MapLineAlertHoverCopies alerts={lineAlerts} plane={TTC_OVERLAY_PLANE} />

                {/* The selected alert's flash stays above hover copies, so hovering never hides it. */}
                <g aria-label="Selected disruption emphasis">
                  <MapLineAlertSelection
                    alerts={selectedLineAlert ? [selectedLineAlert] : []}
                    plane={TTC_OVERLAY_PLANE}
                    commutePreviewActive={commutePreviewActive}
                    introComplete={selectionIntroComplete}
                  />
                </g>

                <MapStationHoverIndicators
                  stations={stationPlacements}
                  selectedStationId={selectedStationId}
                  overlayUnit={TTC_OVERLAY_PLANE.unit}
                />

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
              <g aria-label="Estimated train markers" className="estimated-train-marker-layer" pointerEvents="none">
                <MapTrainMarkerLayer
                  enabled={estimatedTrainsEnabled}
                  markers={estimatedTrainMarkers}
                  segments={renderedNetworkSegments}
                  placement={TTC_TRAIN_MARKER_PLACEMENT}
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
                <MapLineAlertTargets alerts={lineAlerts} />
              </g>
              <MapStationTargets
                stations={stationPlacements}
                selectedStationId={selectedStationId}
                hitPadding={TTC_MANIFEST.stationHitPadding}
                onHoverChange={onStationHoverChange}
              />
              <g aria-label="Commute endpoint highlights">
                <MapCommuteEndpointFlashes preview={commutePreview} plane={TTC_OVERLAY_PLANE} />
              </g>
              <g aria-label="Station impact rings">
                <MapStationAlertRings
                  alerts={stationAlerts}
                  plane={TTC_OVERLAY_PLANE}
                  selection={selection}
                />
              </g>
              {/* Keep names in one foreground interaction plane. When label targets
                  are interleaved with station dots, a later invisible dot or impact
                  corridor can steal hover from part of the rendered text. */}
              <MapStationLabelTargets labels={stationLabelTargets} onHoverChange={onStationLabelHoverChange} />
              <g aria-label="Station impact direction glyphs">
                <MapStationDirectionGlyphs glyphs={stationDirectionGlyphItems} />
              </g>
              <g aria-label="Station impact foreground highlights" pointerEvents="none">
                <MapStationSelection
                  key={selectedStationId ?? "none"}
                  station={selectedStationArtwork}
                  introComplete={selectionIntroComplete}
                />
                <MapStationAlertForeground
                  alerts={stationAlerts}
                  plane={TTC_OVERLAY_PLANE}
                  selection={selection}
                  commutePreviewActive={commutePreviewActive}
                  introComplete={selectionIntroComplete}
                />
              </g>
              <g aria-label="Overlapping alert badges">
                {overlapBadges
                  .filter((badge) => badge.markerId !== expandedOverlapBadgeId)
                  .map((badge) => (
                    <OverlapIndicatorMarker
                      key={badge.markerId}
                      badge={badge}
                      selection={selection}
                      linkedSelectionIds={linkedSelectionIds}
                      isOpen={false}
                      onToggle={() => {
                        clearMapHover();
                        setExpandedOverlapBadgeId(badge.markerId);
                      }}
                      onHoverChange={(hovered) => setExternalImpactsHovered(badge.impacts, hovered)}
                      shouldSuppressMapClick={shouldSuppressMapClick}
                    />
                  ))}
                {overlapBadges
                  .filter((badge) => badge.markerId === expandedOverlapBadgeId)
                  .map((badge) => (
                    <OverlapIndicatorMarker
                      key={badge.markerId}
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
          <MapOverlapChooser
            key={expandedOverlapBadge.markerId}
            markerId={expandedOverlapBadge.markerId}
            label={expandedOverlapBadge.label}
            impacts={expandedOverlapBadge.impacts}
            selectionKey={focusTargetKey}
            layout={expandedOverlapChooser.layout}
            follower={overlapChooserFollower}
            followAnchor={expandedOverlapChooser.followAnchor}
            onSelectImpact={onSelectImpact}
            onHoverImpact={highlightOverlapChooserImpact}
            onClose={(restoreFocus) => {
              clearMapHover();
              overlapBadgeFocusToRestoreRef.current = restoreFocus ? expandedOverlapBadge.markerId : null;
              setExpandedOverlapBadgeId(null);
            }}
            reducedMotion={reducedMotion}
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

type OverlapBadgeWithChooser = MapPlacedOverlapBadge & {
  chooserSize: MapOverlapIndicatorSize;
};

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
      markerId={badge.markerId}
      label={badge.label}
      impacts={badge.impacts}
      position={badge.position}
      size={badge.size}
      selection={selection}
      linkedSelectionIds={linkedSelectionIds}
      isOpen={isOpen}
      collisionAvoided={badge.collisionAvoided}
      isolatePointerDown
      connector={badge.connector}
      onActivate={onToggle}
      onHoverChange={onHoverChange}
      shouldSuppressMapClick={shouldSuppressMapClick}
    />
  );
}

export const InteractiveTtcMap = memo(InteractiveTtcMapComponent);
InteractiveTtcMap.displayName = "InteractiveTtcMap";

"use client";
import { CommuteRouteLabel } from "./CommuteRouteLabel";
import { CardinalNorthIcon } from "./CardinalNorthIcon";

import { usePanZoom } from "../hooks/usePanZoom";
import { observeMobileMapFrame } from "../hooks/mobileMapFrame";
import { useRetainedHover } from "../hooks/useRetainedHover";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import {
  MapLineAlertHoverCopies,
  MapLineAlertHoverOutlines,
  MapLineAlertLayer,
  MapLineAlertSelection,
  MapLineAlertTargets,
} from "./map-overlays/LineAlertOverlays";
import { isSelectedLineAlert, lineAlertPathsByImpact, type MapLineAlert } from "./map-overlays/line-alert-model";
import { mapImpactIdentityOf } from "./map-overlays/overlay-hover";
import { installMapHoverController, type MapHoverController } from "./map-overlays/map-hover-controller";
import { useMapPulseSync } from "./map-overlays/pulse-sync";
import { mapSelectionIntroKey, useMapSelectionIntro } from "./map-overlays/selection-intro";
import { mapOverlayUnitStyle, type MapOverlayPlane } from "./map-overlays/overlay-plane";
import {
  MapStationAlertForeground,
  MapStationAlertRings,
  MapStationDirectionGlyphs,
} from "./map-overlays/StationAlertOverlays";
import type { MapStationAlert, MapStationDirectionGlyph } from "./map-overlays/station-alert-model";
import { regionalLineAlerts, regionalOverlayPlane } from "../app/regional-line-alerts";
import { regionalStationAlerts } from "../app/regional-station-alerts";
import { plannedAdvisoryStationImpacts } from "../app/map-alert-selector";
import { regionalCommutePreview } from "../app/regional-commute-preview";
import { MapCommuteEndpointFlashes, MapCommutePreviewRoute } from "./map-overlays/CommutePreviewOverlays";
import type { MapCommutePreview } from "./map-overlays/commute-preview-model";
import { Locate, ZoomIn, ZoomOut } from "lucide-react";
import { NetworkSelector } from "./NetworkSelector";
import { SharedMapControlRail } from "./SharedMapControlRail";
import { MapViewSelector } from "./MapViewSelector";
import type { NetworkId } from "../app/regional-data";
import type { MapViewPreference } from "../app/visual-preferences";
import type { ImpactSelection, MapImpact, StationNodeImpact } from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/commute-data";
import {
  estimatedTrainMarkerRenderKey,
  TRAIN_MARKER_ARROW_PATH,
  TRAIN_MARKER_BODY_PATH,
  TRAIN_MARKER_WINDOWS,
  type EstimatedTrainMarker,
} from "../app/train-markers";
import { useDashboardData } from "../app/DataContext";
import {
  animateRegionalTrainMarker,
  cancelRegionalTrainMarkerMotion,
  type RegionalTrainMarkerMotionRuntime,
} from "../app/regional-train-marker-motion";
import {
  getRegionalMapMarkup,
  preloadRegionalMapMarkup,
} from "../app/regional-map-asset";

export { preloadRegionalMapMarkup } from "../app/regional-map-asset";

/** GO/UP's prepared geometry (scripts/prepare-map-geometry.mjs). */
const REGIONAL_GEOMETRY = preparedRegionalGeometry as unknown as PreparedMapGeometry;
const REGIONAL_OVERLAY_PLANE = regionalOverlayPlane(REGIONAL_GEOMETRY);
const REGIONAL_STATION_ARTWORK = mapStationArtwork(REGIONAL_GEOMETRY, MAP_MANIFESTS.regional.stationPartSuffixes);
const REGIONAL_STATION_LABEL_TARGETS = regionalStationLabelTargets(REGIONAL_GEOMETRY);
const NO_STATION_PLACEMENTS: MapStationPlacement[] = [];
const NO_STATION_LABEL_TARGETS: MapStationLabelTarget[] = [];

import {
  regionalTrainMarkerFrame,
  regionalStationLabelHover,
  REGIONAL_OVERLAP_INDICATOR_SCALE,
  REGIONAL_OVERLAY_UNIT,
  type RegionalTrainMarkerFrame,
} from "../app/regional-map-geometry";
import type { PreparedMapGeometry } from "../app/map-geometry-data";
import preparedRegionalGeometry from "../app/map-geometry/regional.json";
import {
  regionalOverlapBadgeLayout,
  regionalOverlayContentSignature,
  regionalPointerImpactSelection,
  regionalOverlapMarker,
  REGIONAL_DYNAMIC_COMMUTE_LAYER_ID,
  REGIONAL_DYNAMIC_HOVER_LAYER_ID,
  REGIONAL_DYNAMIC_SEGMENT_LAYER_ID,
  REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID,
  REGIONAL_DYNAMIC_TARGET_LAYER_ID,
  REGIONAL_TOP_HOVER_LAYER_ID,
  REGIONAL_TOP_STATION_IMPACT_LAYER_ID,
  REGIONAL_TRAIN_MARKER_LAYER_ID,
  type RegionalOverlapBadge,
} from "../app/regional-map-overlays";
import {
  installRegionalStationLabelHover,
  regionalStationLabelCutoutMarkup,
  regionalStationLabelTargets,
} from "../app/regional-station-interaction";
import {
  mapStationArtwork,
  placeMapStations,
  type MapStationLabelTarget,
  type MapStationPlacement,
} from "../app/map-station-artwork";
import {
  MapStationHoverIndicators,
  MapStationLabelTargets,
  MapStationSelection,
  MapStationTargets,
} from "./MapStationLayers";
import { clearMapStationHover, mapStationIdAt, setMapStationHovered } from "./map-overlays/station-hover";
import type { MapBounds, MapPoint } from "../app/map-geometry";

type SvgPoint = MapPoint;
type SvgBounds = MapBounds;

import { MapOverlapIndicator, restoreMapOverlapIndicatorFocus } from "./MapOverlapIndicator";
import { MapOverlapChooser } from "./MapOverlapChooser";
import { isMapWheelScrollRegionTarget, usePreventMapWheelDefault } from "./map-wheel-events";
import { MapZoomSlider } from "./map-camera/MapZoomSlider";
import {
  type MapContentBounds,
  type MapViewportOrientation,
} from "../hooks/panZoomMath";
import { mapFocusTargetKey, useDesktopMapInsets, useMapFraming } from "./map-camera/useMapFraming";
import { useMapOverlapChooser, useMapViewportSize } from "./map-overlays/useMapOverlapChooser";
import { meetStageTransform } from "./map-chooser-placement";
import { MAP_MANIFESTS } from "../app/map-manifests";
import { RasterMapPlane, rasterMapSource, type RasterMapTheme } from "./RasterMapPlane";
import { mobilePerformanceModeMatches } from "../hooks/useMobilePerformanceMode";
import { useMapLabelFontReady } from "../hooks/useMapLabelFontReady";
import { usePageVisibility } from "../hooks/usePageVisibility";
import { linkedCurrentImpactIds } from "../app/selection-attention-key";
import {
  MapChooserFollower,
} from "./map-chooser-follow";

const REGIONAL_MANIFEST = MAP_MANIFESTS.regional;
const MAP_WIDTH = REGIONAL_MANIFEST.stage.width;
const MAP_HEIGHT = REGIONAL_MANIFEST.stage.height;
const REGIONAL_MAP_HORIZONTAL_INSET_RATIO = 0.025;
const REGIONAL_MAP_CONTENT_BOUNDS: MapContentBounds = REGIONAL_MANIFEST.contentBounds;

// Default desktop regional frame zoomed out a smidgen to provide comfortable
// breathing room around Allandale Waterfront text below the top console and
// Hamilton station above the bottom alert badges.
const REGIONAL_MAP_DEFAULT_FRAME_SCALE = 0.95;
const REGIONAL_MAP_DESKTOP_FRAME_SCALE = 1;
// Route-wide selections need breathing room beyond a technically exact fit so
// station labels and the authored corridor shape do not crowd the visible map
// space beside an open desktop panel. Short selections still use the preferred
// close zoom because their fitted scale remains above that cap.
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
// Frames to wait for a stage ease to land before solving the chooser anyway.

function setRegionalTrainMarkerTransform(group: SVGGElement, frame: RegionalTrainMarkerFrame) {
  group.setAttribute(
    "transform",
    `translate(${frame.point.x} ${frame.point.y}) rotate(${frame.angle}) scale(1.8)`,
  );
}

function setRegionalTrainMarkerMetadata(group: SVGGElement, marker: EstimatedTrainMarker) {
  group.dataset.trainMarkerId = marker.id;
  group.dataset.trainMarkerDirection = marker.direction;
  group.dataset.trainMarkerSegmentId = marker.segmentId;
  group.dataset.trainMarkerTravelDirection = marker.travelDirection;
}

function appendRegionalTrainMarkerGlyph(documentNode: Document, group: SVGGElement) {
  for (const classNames of [
    ["estimated-train-marker-shadow"],
    ["estimated-train-marker-shadow", "estimated-train-marker-shadow-mid"],
    ["estimated-train-marker-shadow", "estimated-train-marker-shadow-near"],
    ["estimated-train-marker-outline"],
    ["estimated-train-marker-core"],
  ]) {
    const body = documentNode.createElementNS(SVG_NAMESPACE, "path");
    body.setAttribute("d", TRAIN_MARKER_BODY_PATH);
    body.classList.add(...classNames);
    group.append(body);
  }
  for (const window of TRAIN_MARKER_WINDOWS) {
    const pane = documentNode.createElementNS(SVG_NAMESPACE, "rect");
    pane.setAttribute("x", String(window.x));
    pane.setAttribute("y", String(window.y));
    pane.setAttribute("width", String(window.width));
    pane.setAttribute("height", String(window.height));
    pane.setAttribute("rx", String(window.rx));
    pane.classList.add("estimated-train-marker-window");
    group.append(pane);
  }
  const arrow = documentNode.createElementNS(SVG_NAMESPACE, "path");
  arrow.setAttribute("d", TRAIN_MARKER_ARROW_PATH);
  arrow.classList.add("estimated-train-marker-arrow");
  group.append(arrow);
}






/** The authored SVG: artwork until the raster planes are ready, and a geometry source. */
const RegionalSvgMarkup = memo(function RegionalSvgMarkup({ markup }: { markup: string }) {
  return <div dangerouslySetInnerHTML={{ __html: markup }} className="regional-live-svg raster-map-dynamic-plane absolute inset-0 w-full h-full" />;
});

/** The map's SVG planes share the authored SVG's view box. */
const REGIONAL_PLANE_VIEWBOX = [
  REGIONAL_MANIFEST.viewBox.x,
  REGIONAL_MANIFEST.viewBox.y,
  REGIONAL_MANIFEST.viewBox.width,
  REGIONAL_MANIFEST.viewBox.height,
].join(" ");
/** Each plane fills the stage with xMidYMid meet. */
const REGIONAL_STAGE = meetStageTransform(REGIONAL_MANIFEST.viewBox, MAP_WIDTH, MAP_HEIGHT);


function InteractiveRegionalMapComponent({
  selection,
  onSelectImpact,
  selectedStationId,
  onSelectStationId,
  reducedMotion,
  mobilePerformanceMode = false,
  layoutResetSignal,
  recenterSignal,
  zoomInSignal,
  zoomOutSignal,
  isDark = true,
  highContrast = false,
  animateInitialEntrance = true,
  deferInitialEntrance = false,
  mapChromeVisible = false,
  preserveCameraOnSelectionClear = false,
  viewportOrientation = "standard",
  onReady,
  estimatedTrainsEnabled = false,
  estimatedTrainMarkers = [],
  commutePathPreview = null,
  onClearCommutePathPreview,
  isMapActive = true,
  cameraCommandsEnabled = true,
  onNetworkChange,
  mapView,
  onMapViewChange,
  selectionAttentionGeneration = 0,
  selectionIntroKey: linkedSelectionIntroKey = null,
}: {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  selectedStationId: string | null;
  onSelectStationId: (id: string | null) => void;
  reducedMotion: boolean;
  mobilePerformanceMode?: boolean;
  layoutResetSignal?: number;
  recenterSignal?: number;
  zoomInSignal?: number;
  zoomOutSignal?: number;
  isDark?: boolean;
  highContrast?: boolean;
  animateInitialEntrance?: boolean;
  deferInitialEntrance?: boolean;
  mapChromeVisible?: boolean;
  preserveCameraOnSelectionClear?: boolean;
  viewportOrientation?: MapViewportOrientation;
  onReady?: () => void;
  estimatedTrainsEnabled?: boolean;
  estimatedTrainMarkers?: EstimatedTrainMarker[];
  commutePathPreview?: AccountCommutePathPreview | null;
  onClearCommutePathPreview?: () => void;
  isMapActive?: boolean;
  /** False while this map waits hidden behind the other network: shared zoom
   *  and Center commands are consumed without moving its camera. */
  cameraCommandsEnabled?: boolean;
  onNetworkChange?: (network: NetworkId) => void;
  mapView?: MapViewPreference;
  onMapViewChange?: (view: MapViewPreference) => void;
  selectionAttentionGeneration?: number;
  /** Shared intro key; linked planned/current hops keep it so the map keeps breathing. */
  selectionIntroKey?: string | null;
}) {
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures, networkSegments, stationNodeImpacts, stations } = useDashboardData();
  const regionalMapRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const mapStageRef = useRef<HTMLDivElement>(null);
  const mapControlRailRef = useRef<HTMLDivElement>(null);
  const mapViewportSize = useMapViewportSize(viewportRef, viewportOrientation);
  const desktopInsets = useDesktopMapInsets(viewportRef, mapControlRailRef, mapChromeVisible);
  const desktopMapTopInset = desktopInsets.top;
  const desktopMapBottomInset = desktopInsets.bottom;
  const isMapActiveRef = useRef(isMapActive);
  useEffect(() => {
    isMapActiveRef.current = isMapActive;
  }, [isMapActive]);
  const lastViewportOrientationRef = useRef(viewportOrientation);
  const automaticResizeRefitBlockedRef = useRef(false);
  const [svgMarkup, setSvgMarkup] = useState(() => getRegionalMapMarkup());
  const [readyRasterPlanes, setReadyRasterPlanes] = useState(() => new Set<string>());
  const [overlapBadges, setOverlapBadges] = useState<RegionalOverlapBadge[]>([]);
  // Line alerts, drawn with the shared overlay layer (components/map-overlays)
  // in the map's overlay and interaction planes, as on TTC.
  const [lineAlerts, setLineAlerts] = useState<MapLineAlert[]>([]);
  const [overlayPlane, setOverlayPlane] = useState<MapOverlayPlane | null>(null);
  // Station targets, hover rings and selection, from the authored artwork.
  // Station targets and rings appear with the overlays.
  // Only stations with data get targets.
  const stationPlacements = useMemo(() => (overlayPlane
    ? placeMapStations(REGIONAL_STATION_ARTWORK, stations.map(({ id, name }) => ({ id, name })))
    : NO_STATION_PLACEMENTS), [overlayPlane, stations]);
  const stationLabelTargets = overlayPlane ? REGIONAL_STATION_LABEL_TARGETS : NO_STATION_LABEL_TARGETS;
  // Station alerts, drawn with the same shared layer in the interaction plane.
  const [stationAlerts, setStationAlerts] = useState<MapStationAlert[]>([]);
  const [stationDirectionGlyphs, setStationDirectionGlyphs] = useState<MapStationDirectionGlyph[]>([]);
  const [commutePreview, setCommutePreview] = useState<MapCommutePreview | null>(null);
  // Station-only planned advisories are drawn as station alerts, by TTC's
  // rule: upcoming ones always, a current one only while selected.
  const plannedStationImpacts = plannedAdvisoryStationImpacts(plannedClosures, activeAlerts, delays, selection);
  const plannedStationImpactsKey = JSON.stringify(plannedStationImpacts);
  const stationAlertImpacts = useMemo(() => {
    const seen = new Set<string>();
    const planned = JSON.parse(plannedStationImpactsKey) as StationNodeImpact[];
    return [...stationNodeImpacts, ...planned].filter((impact) => {
      const key = `${impact.kind}:${impact.cardId}:${impact.stationId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [plannedStationImpactsKey, stationNodeImpacts]);
  const linkedSelectionIds = useMemo(
    () => linkedCurrentImpactIds(selection, { activeAlerts, delays, plannedClosures }),
    [activeAlerts, delays, plannedClosures, selection],
  );
  const [expandedOverlapBadgeId, setExpandedOverlapBadgeId] = useState<string | null>(null);
  const [overlapChooserFollower] = useState(() => new MapChooserFollower());
  const [cameraReady, setCameraReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [activeHoveredStationLabel, setHoveredStationLabel] = useState<{
    stationId: string;
    polygonPoints: string;
    center: SvgPoint;
    bounds: SvgBounds;
    cutoutMarkup: string;
  } | null>(null);
  const hoveredStationLabel = useRetainedHover(activeHoveredStationLabel);
  const mapLabelFontReady = useMapLabelFontReady();
  const pageVisible = usePageVisibility();
  const useMobileRendering = mobilePerformanceMode || mobilePerformanceModeMatches();
  const mapEffectMotionPaused = reducedMotion || !pageVisible;

  const rasterTheme: RasterMapTheme = highContrast ? "high-contrast" : isDark ? "dark" : "light";
  // Select the mobile textures on the first client render. Waiting for the
  // shell effect would start decoding all three desktop planes on phones.
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
    && readyRasterPlanes.has(`${rasterVariantKey}:labels`);

  useLayoutEffect(() => {
    automaticResizeRefitBlockedRef.current = Boolean(selection || selectedStationId || commutePathPreview);
  }, [commutePathPreview, selection, selectedStationId]);
  const trainMarkerMotionRef = useRef(new Map<string, RegionalTrainMarkerMotionRuntime>());
  const pointerActivationRef = useRef<
    { type: "station"; id: string }
    | { type: "impact"; selection: NonNullable<ImpactSelection> }
    | null
  >(null);
  const suppressNextClickRef = useRef(false);
  const selectionRef = useRef(selection);
  const selectedStationIdRef = useRef(selectedStationId);
  const hoverControllerRef = useRef<MapHoverController | null>(null);
  const previewOutlineLayerRef = useRef<SVGGElement>(null);
  const readyNotifiedRef = useRef(false);
  const lastOverlayInputsRef = useRef<unknown[] | null>(null);
  const entranceWasDeferredRef = useRef(false);

  // The shared System Map camera (hooks/usePanZoom.ts), as on TTC. GO/UP
  // supplies its framing as data and keeps its tap-to-select resolution.
  const regionalDefaultFrame = useMemo(() => ({
    bounds: REGIONAL_MAP_CONTENT_BOUNDS,
    topInset: desktopMapTopInset,
    bottomInset: desktopMapBottomInset,
    horizontalInsetRatio: REGIONAL_MAP_HORIZONTAL_INSET_RATIO,
    mobileZoom: REGIONAL_MAP_DEFAULT_FRAME_SCALE * 1.15,
    mobileCenterStationId: "union",
    desktopScaleMultiplier: REGIONAL_MAP_DESKTOP_FRAME_SCALE,
  }), [desktopMapBottomInset, desktopMapTopInset]);
  const cameraOwnedBySelection = Boolean(selection || selectedStationId || commutePathPreview);
  const {
    cameraStore,
    fitScale,
    readCamera,
    isCameraInitialized,
    activePointerCount,
    clearCameraAdjustment,
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
    logicalViewportSize,
    defaultTransformForViewport,
    moveToDefaultCamera,
    animateTransformTo,
    currentRenderedTransform,
    shouldSuppressMapClick,
    refitIfCameraUntouched,
    isGestureActive,
  } = usePanZoom({
    persistenceKey: "regional",
    persistenceBlocked: cameraOwnedBySelection,
    automaticRefitBlocked: cameraOwnedBySelection,
    reducedMotion,
    viewportOrientation,
    disableProgrammaticMotion: mobilePerformanceMode || !pageVisible,
    defaultFrame: regionalDefaultFrame,
    animateInitialEntrance,
    isMapActive,
    cameraFollower: overlapChooserFollower,
    containerRef: viewportRef,
    mapRef: mapStageRef,
    flagRootRef: regionalMapRef,
    revealStageOnWrite: false,
  });
  useLayoutEffect(() => {
    selectionRef.current = selection;
    selectedStationIdRef.current = selectedStationId;
  }, [selectedStationId, selection]);

  useLayoutEffect(() => observeMobileMapFrame(viewportRef.current, () => {
    if (!isMapActive) return;
    if (window.innerWidth < 768 && !automaticResizeRefitBlockedRef.current) refitIfCameraUntouched();
  }), [isMapActive, refitIfCameraUntouched, mapChromeVisible]);

  const fitNetwork = useCallback(() => moveToDefaultCamera(true, false), [moveToDefaultCamera]);
  // Center: clears the saved viewport and snaps to the fitted camera; the
  // viewport wash gives the feedback (no fade layers over the stage).
  const handleFitNetwork = recenterWithFeedback;

  const stageRegionalEntrance = useCallback(() => {
    if (!svgMarkup) return;
    setCameraReady(true);
    stageInitialEntrance();
  }, [stageInitialEntrance, svgMarkup]);

  const completeRegionalEntrance = useCallback(() => {
    setCameraReady(true);
    completeStagedEntrance();
  }, [completeStagedEntrance]);

  const focusTargetKey = useMemo(
    () => mapFocusTargetKey({ selection, selectedStationId, commutePathPreview }, selectionAttentionGeneration),
    [commutePathPreview, selection, selectedStationId, selectionAttentionGeneration],
  );
  const selectionIntroKey = mapSelectionIntroKey({
    selection,
    linkedSelectionIntroKey,
    selectedStationId,
    commutePreviewKey: commutePathPreview ? `${commutePathPreview.id}:${commutePathPreview.legId}` : null,
    generation: selectionAttentionGeneration,
  });
  const selectionIntroComplete = useMapSelectionIntro(selectionIntroKey, regionalMapRef);

  const initializeMapCamera = useCallback(() => {
    if (isCameraInitialized() || !svgMarkup) return;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    setCameraReady(true);
    // A selection about to be framed starts from the fitted camera, without
    // the entrance flight.
    if (focusTargetKey) moveToDefaultCamera(false, false);
    else initializeCamera();
  }, [focusTargetKey, initializeCamera, isCameraInitialized, logicalViewportSize, moveToDefaultCamera, svgMarkup]);

  useEffect(() => {
    let cancelled = false;
    const load = preloadRegionalMapMarkup();
    void load.then((markup) => {
      if (!cancelled) setSvgMarkup(markup);
    }).catch(() => {
      if (!cancelled) setLoadError(true);
    });
    return () => { cancelled = true; };
  }, []);

  const overlayMotionPaused = mapEffectMotionPaused || useMobileRendering;
  // Each poll parses fresh arrays even when nothing changed; compare what the
  // overlays draw (map-renderer-parity.md, rule 1).
  const overlayContentSignature = useMemo(() => regionalOverlayContentSignature({
    activeAlerts, delays, reducedSpeedZones, plannedClosures,
    networkSegments, stationNodeImpacts, stations, commutePathPreview,
  }), [activeAlerts, commutePathPreview, delays, networkSegments, plannedClosures, reducedSpeedZones, stationNodeImpacts, stations]);
  useLayoutEffect(() => {
    // Build live overlays once when this diagram becomes active. Preparing an
    // inactive diagram otherwise builds them again during the network swap.
    if (!svgMarkup || !isMapActive) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    // Motion, selection and hover are applied in place by their own effects,
    // so a reduced-motion toggle or a brief page-visibility flip never
    // rebuilds the overlays (TTC parity).
    const inputs = [overlayContentSignature, svgMarkup];
    if (lastOverlayInputsRef.current?.every((value, index) => value === inputs[index])) return;

    // Geometry is prepared data (REGIONAL_GEOMETRY); nothing here reads the SVG.
    const plane = REGIONAL_OVERLAY_PLANE;
    const nextLineAlerts = regionalLineAlerts(REGIONAL_GEOMETRY, { activeAlerts, networkSegments, stationNodeImpacts });
    const nextStationOverlays = regionalStationAlerts(REGIONAL_GEOMETRY, {
      activeAlerts, delays, reducedSpeedZones, plannedClosures, stationNodeImpacts: stationAlertImpacts, stations, networkSegments,
    }, plane.unit);
    const nextCommutePreview = regionalCommutePreview(REGIONAL_GEOMETRY, commutePathPreview, networkSegments);
    setLineAlerts((current) => (
      JSON.stringify(current) === JSON.stringify(nextLineAlerts) ? current : nextLineAlerts
    ));
    setStationAlerts((current) => (
      JSON.stringify(current) === JSON.stringify(nextStationOverlays.alerts) ? current : nextStationOverlays.alerts
    ));
    setStationDirectionGlyphs((current) => (
      JSON.stringify(current) === JSON.stringify(nextStationOverlays.glyphs) ? current : nextStationOverlays.glyphs
    ));
    setCommutePreview((current) => (
      JSON.stringify(current) === JSON.stringify(nextCommutePreview) ? current : nextCommutePreview
    ));
    setOverlayPlane(plane);
    // Badges are placed from the overlay model, before React draws it.
    setOverlapBadges(regionalOverlapBadgeLayout(REGIONAL_GEOMETRY, {
      networkSegments,
      stationNodeImpacts: stationAlertImpacts,
      stations,
      lineAlerts: nextLineAlerts,
      stationAlerts: nextStationOverlays.alerts,
    }));
    lastOverlayInputsRef.current = inputs;
  }, [
    activeAlerts,
    commutePathPreview,
    delays,
    isMapActive,
    networkSegments,
    overlayContentSignature,
    plannedClosures,
    reducedSpeedZones,
    stationAlertImpacts,
    stationNodeImpacts,
    stations,
    svgMarkup,
  ]);

  // Station-label hover follows the mouse and keyboard focus.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !svgMarkup) return;
    return installRegionalStationLabelHover(viewport, {
      isPointerGestureActive: () => activePointerCount() > 0,
      onHoverStationId: (stationId) => {
        setHoveredStationLabel((current) => {
          if (!mapLabelFontReady) return null;
          if (current?.stationId === stationId) return current;
          const hover = regionalStationLabelHover(REGIONAL_GEOMETRY, stationId);
          const cutoutMarkup = stationId && viewportRef.current
            ? regionalStationLabelCutoutMarkup(viewportRef.current, stationId)
            : null;
          return hover && cutoutMarkup ? { ...hover, cutoutMarkup } : null;
        });
      },
    });
  }, [activePointerCount, mapLabelFontReady, svgMarkup]);

  const setStationHovered = useCallback((stationId: string, hovered: boolean) => {
    setMapStationHovered(viewportRef.current, stationId, hovered);
  }, []);
  const selectedStationArtwork = useMemo(
    () => stationPlacements.find(({ artwork }) => artwork.id === selectedStationId)?.artwork ?? null,
    [selectedStationId, stationPlacements],
  );

  // A commute preview and a selected station pulse on one clock, as on TTC.
  useMapPulseSync(viewportRef, {
    paused: overlayMotionPaused,
    signature: `${isMapActive}:${svgMarkup ? "ready" : ""}::${overlayContentSignature}`,
  });

  // Alert hover, chooser rows and group previews: the shared controller
  // (map-overlays/map-hover-controller.ts), as on TTC.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const controller = installMapHoverController(viewport, {
      previewOutlineLayer: () => previewOutlineLayerRef.current,
      isPointerGestureActive: () => activePointerCount() > 0,
    });
    hoverControllerRef.current = controller;
    return () => {
      controller.dispose();
      hoverControllerRef.current = null;
    };
  }, [activePointerCount]);

  useLayoutEffect(() => {
    hoverControllerRef.current?.setOutlineSource(overlayPlane, lineAlertPathsByImpact(lineAlerts));
  }, [lineAlerts, overlayPlane]);

  // Overlay nodes of changed alerts mount idle; reapply the current hover.
  useLayoutEffect(() => {
    hoverControllerRef.current?.restore();
  }, [lineAlerts, stationAlerts]);

  useLayoutEffect(() => {
    const markerLayer = viewportRef.current?.querySelector<SVGGElement>(
      ".regional-estimated-train-marker-layer",
    );
    if (!markerLayer) return;
    const existingMarkersByKey = new Map(
      [...markerLayer.querySelectorAll<SVGGElement>(":scope > .estimated-train-marker")]
        .map((group) => [group.dataset.markerKey ?? "", group]),
    );
    if (!estimatedTrainsEnabled) {
      existingMarkersByKey.forEach((group, markerKey) => {
        cancelRegionalTrainMarkerMotion(trainMarkerMotionRef.current.get(markerKey));
        trainMarkerMotionRef.current.delete(markerKey);
        group.remove();
      });
      return;
    }

    // Markers follow the prepared corridors, in the top plane's (root) coordinates.
    if (!svgMarkup) return;
    const documentNode = markerLayer.ownerDocument;
    for (const marker of estimatedTrainMarkers) {
      const segment = networkSegments.find((item) => item.id === marker.segmentId);
      if (!segment) continue;
      const frame = regionalTrainMarkerFrame(REGIONAL_GEOMETRY, segment, marker);
      if (!frame) continue;
      const markerKey = estimatedTrainMarkerRenderKey(marker);
      const existingGroup = existingMarkersByKey.get(markerKey);
      const group = existingGroup ?? documentNode.createElementNS(SVG_NAMESPACE, "g");
      group.setAttribute("class", `estimated-train-marker estimated-train-marker-${marker.lineId}`);
      group.setAttribute("data-marker-key", markerKey);
      group.setAttribute("data-train-marker-id", marker.id);
      group.setAttribute("data-train-marker-line-id", marker.lineId);
      group.setAttribute("data-train-marker-direction", marker.direction);
      group.setAttribute("data-train-marker-segment-id", marker.segmentId);
      group.setAttribute("data-train-marker-travel-direction", marker.travelDirection);
      const title = group.querySelector("title")
        ?? documentNode.createElementNS(SVG_NAMESPACE, "title");
      title.textContent = `${marker.lineId.replace("regional-", "").toUpperCase()} toward ${marker.direction}; schematic estimated position`;
      if (!existingGroup) {
        group.append(title);
        appendRegionalTrainMarkerGlyph(documentNode, group);
      }
      markerLayer.append(group);
      animateRegionalTrainMarker(
        (frame, opacity, shown) => {
          group.style.opacity = String(opacity);
          setRegionalTrainMarkerTransform(group, frame);
          setRegionalTrainMarkerMetadata(group, shown);
        },
        marker,
        networkSegments,
        REGIONAL_GEOMETRY,
        trainMarkerMotionRef.current,
        !mapEffectMotionPaused,
      );
      existingMarkersByKey.delete(markerKey);
    }
    existingMarkersByKey.forEach((group, markerKey) => {
      cancelRegionalTrainMarkerMotion(trainMarkerMotionRef.current.get(markerKey));
      trainMarkerMotionRef.current.delete(markerKey);
      group.remove();
    });
  }, [estimatedTrainMarkers, estimatedTrainsEnabled, mapEffectMotionPaused, networkSegments, svgMarkup]);

  useEffect(() => () => {
    trainMarkerMotionRef.current.forEach(cancelRegionalTrainMarkerMotion);
    trainMarkerMotionRef.current.clear();
  }, []);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (deferInitialEntrance) {
        entranceWasDeferredRef.current = true;
        stageRegionalEntrance();
      } else if (entranceWasDeferredRef.current) {
        entranceWasDeferredRef.current = false;
        completeRegionalEntrance();
      } else {
        initializeMapCamera();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [completeRegionalEntrance, deferInitialEntrance, initializeMapCamera, stageRegionalEntrance]);

  useEffect(() => {
    if (
      deferInitialEntrance
      || !svgMarkup
      || !cameraReady
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
  }, [cameraReady, deferInitialEntrance, onReady, rasterMapReady, svgMarkup]);

  useEffect(() => {
    if (lastViewportOrientationRef.current === viewportOrientation) return;
    lastViewportOrientationRef.current = viewportOrientation;
    if (!isCameraInitialized()) return;
    clearCameraAdjustment();
    const frame = window.requestAnimationFrame(fitNetwork);
    return () => window.cancelAnimationFrame(frame);
  }, [clearCameraAdjustment, fitNetwork, isCameraInitialized, viewportOrientation]);

  // The camera starts once the viewport has a size; usePanZoom reconciles
  // later resizes.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (document.visibilityState === "hidden" || !isMapActiveRef.current) return;
      if (!isCameraInitialized()) initializeMapCamera();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [initializeMapCamera, isCameraInitialized]);

  const { revealFocusedMapTarget } = useMapFraming({
    camera: {
      containerRef: viewportRef,
      mapRef: mapStageRef,
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
    ready: cameraReady && Boolean(svgMarkup),
    contentKey: String(rasterMapReady),
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

  // The browser's wheel action (page zoom on a trackpad pinch) stays off the map, as on TTC.
  usePreventMapWheelDefault(viewportRef);
  const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (isMapWheelScrollRegionTarget(event.target)) return;
    // A wheel ends the pointer hover (the hover controller ends alert hover).
    setHoveredStationLabel(null);
    clearMapStationHover(viewportRef.current);
    handleWheel(event);
  }, [handleWheel]);

  // Gestures are the shared camera's. GO/UP resolves a tap on its injected
  // targets at release, from what was under the press.
  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    // A press ends the pointer hover, keeping a label that is itself pressed.
    if (!(event.target instanceof Element && event.target.closest(".station-label-hit-target"))) {
      setHoveredStationLabel(null);
    }
    clearMapStationHover(viewportRef.current);
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const firstPointer = activePointerCount() === 0;
    handlePointerDown(event);
    pointerActivationRef.current = null;
    // A press that stops a glide only stops it (the camera suppresses its click).
    if (!firstPointer || shouldSuppressMapClick()) return;
    const target = event.target instanceof Element ? event.target : null;
    const impact = target?.closest<SVGElement>("[data-map-impact-kind]");
    const stationId = mapStationIdAt(target);
    const impactSelection = impact
      ? regionalPointerImpactSelection(event.currentTarget, impact, event.clientX, event.clientY)
      : null;
    pointerActivationRef.current = impactSelection
      ? { type: "impact", selection: impactSelection }
      : stationId
        ? { type: "station", id: stationId }
        : null;
  }, [activePointerCount, handlePointerDown, shouldSuppressMapClick]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    handlePointerMove(event);
    if (shouldSuppressMapClick()) pointerActivationRef.current = null;
  }, [handlePointerMove, shouldSuppressMapClick]);

  const finishPointer = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (activePointerCount() === 0) return;
    if (event.type === "pointercancel") handlePointerCancel(event);
    else handlePointerUp(event);
    if (activePointerCount() > 0) return;
    const activation = pointerActivationRef.current;
    pointerActivationRef.current = null;
    if (event.type !== "pointerup" || shouldSuppressMapClick()) return;
    if (activation) {
      suppressNextClickRef.current = true;
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 450);
      if (activation.type === "station") {
        onSelectStationId(activation.id);
      } else {
        onSelectImpact(activation.selection);
      }
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest(".overlap-indicator, [data-map-impact-kind], [data-station-id], [data-station-label-id], button, [role='button'], [data-map-chooser-keepout]")) {
      onSelectImpact(null);
      onSelectStationId(null);
    }
  }, [activePointerCount, handlePointerCancel, handlePointerUp, onSelectImpact, onSelectStationId, shouldSuppressMapClick]);

  const activateTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return;
    const impact = mapImpactIdentityOf(target);
    if (impact) {
      onSelectImpact(impact);
      return;
    }
    const id = mapStationIdAt(target);
    if (id) {
      onSelectStationId(id);
    }
  }, [onSelectImpact, onSelectStationId]);

  const setRegionalOverlapImpactsHovered = useCallback((
    impacts: MapImpact[],
    hovered: boolean,
  ) => {
    hoverControllerRef.current?.setGroupPreview(
      impacts.map((impact) => ({ kind: impact.kind, id: impact.cardId })),
      hovered,
    );
  }, []);

  const closeRegionalOverlapChooser = useCallback(() => {
    const badge = overlapBadges.find((candidate) => candidate.markerId === expandedOverlapBadgeId);
    if (badge) setRegionalOverlapImpactsHovered(badge.impacts, false);
    setExpandedOverlapBadgeId(null);
  }, [expandedOverlapBadgeId, overlapBadges, setRegionalOverlapImpactsHovered]);

  const openRegionalOverlapChooser = useCallback((badge: RegionalOverlapBadge) => {
    setExpandedOverlapBadgeId(badge.markerId);
    setRegionalOverlapImpactsHovered(badge.impacts, true);
  }, [setRegionalOverlapImpactsHovered]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateTarget(event.target);
  }, [activateTarget]);

  const expandedOverlapBadge = overlapBadges.find(
    (candidate) => candidate.markerId === expandedOverlapBadgeId,
  ) ?? null;
  const expandedOverlapChooser = useMapOverlapChooser({
    badge: expandedOverlapBadge && {
      id: expandedOverlapBadge.markerId,
      position: expandedOverlapBadge.position,
      // Badges draw at twice their layout size (MapOverlapIndicator's visualScale).
      size: {
        width: expandedOverlapBadge.size.width * REGIONAL_OVERLAP_INDICATOR_SCALE,
        height: expandedOverlapBadge.size.height * REGIONAL_OVERLAP_INDICATOR_SCALE,
      },
      impactCount: expandedOverlapBadge.impacts.length,
      affectedOutlines: expandedOverlapBadge.affectedOutlines ?? [],
    },
    stage: REGIONAL_STAGE,
    cameraStore,
    readCamera,
    isCameraInteracting,
    viewportRef,
    viewportSize: mapViewportSize,
    viewportOrientation,
  });
  // A hovered chooser row behaves like hovering that alert on the map; with no
  // row hovered, the chooser previews its whole group as one outline.
  const hoverRegionalChooserImpact = useCallback((impact: MapImpact | null) => {
    if (!expandedOverlapBadge) return;
    setRegionalOverlapImpactsHovered(expandedOverlapBadge.impacts, !impact);
    hoverControllerRef.current?.setChooserHover(impact ? { kind: impact.kind, id: impact.cardId } : null);
  }, [expandedOverlapBadge, setRegionalOverlapImpactsHovered]);
  useLayoutEffect(() => {
    if (!expandedOverlapBadge) return;
    hoverRegionalChooserImpact(null);
    return () => {
      hoverControllerRef.current?.setChooserHover(null);
      setRegionalOverlapImpactsHovered(expandedOverlapBadge.impacts, false);
    };
  }, [expandedOverlapBadge, hoverRegionalChooserImpact, setRegionalOverlapImpactsHovered]);
  const closeRegionalChooserWithFocus = useCallback((restoreFocus: boolean) => {
    const markerId = expandedOverlapBadge?.markerId;
    closeRegionalOverlapChooser();
    if (!restoreFocus || !markerId) return;
    window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (viewport) restoreMapOverlapIndicatorFocus(regionalOverlapMarker(viewport, markerId));
    });
  }, [closeRegionalOverlapChooser, expandedOverlapBadge]);

  return (
    <section
      ref={regionalMapRef}
      className="regional-map"
      style={mapOverlayUnitStyle({ unit: REGIONAL_OVERLAY_UNIT })}
      data-map-gesture-active="false"
      data-map-camera-moving="false"
      aria-label="Interactive GO and UP map"
    >
      <div
        ref={viewportRef}
        className="regional-map-viewport"
        data-map-viewport-orientation={viewportOrientation}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onPointerLeave={handlePointerLeave}
        onLostPointerCapture={handleLostPointerCapture}
        onFocus={(event) => revealFocusedMapTarget(event.target)}
        onClick={(event) => {
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          if (shouldSuppressMapClick()) return;
          activateTarget(event.target);
        }}
        onKeyDown={onKeyDown}
      >
        {loadError ? <p role="alert" className="regional-map-error">Regional map could not be loaded.</p> : null}
        <div className="map-attribution-notice" aria-label="Metrolinx derivative map attribution">
          Inkscape re-creation based on Metrolinx map · Not to scale
        </div>
        <div
          ref={mapStageRef}
          data-map-label-font-ready={mapLabelFontReady ? "true" : "false"}
          data-raster-map-ready={rasterMapReady ? "true" : "false"}
          className="regional-map-stage relative"
          style={{
            width: `${MAP_WIDTH}px`,
            height: `${MAP_HEIGHT}px`,
            right: "auto",
            bottom: "auto",
            // Hidden until the camera is placed (the camera leaves visibility to this map).
            visibility: svgMarkup && cameraReady ? "visible" : "hidden",
            transformOrigin: "0 0",
          }}
        >
          <RasterMapPlane
            network="regional"
            plane="background"
            theme={rasterTheme}
            density={rasterDensity}
            onReady={() => markRasterPlaneReady("background")}
          />
          <RegionalSvgMarkup markup={svgMarkup} />
          {/* Overlay plane: alert tubes, the commute route, selection
              emphasis, hover copies and station hover rings, under the
              station artwork (TTC's dynamic plane). React-owned; never
              takes the pointer. */}
          <svg
            className="raster-map-dynamic-plane regional-overlay-plane absolute top-0 left-0 w-full h-full pointer-events-none"
            viewBox={REGIONAL_PLANE_VIEWBOX}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            {overlayPlane ? (
              <g>
                <g id={REGIONAL_DYNAMIC_SEGMENT_LAYER_ID}>
                  <MapLineAlertLayer
                    alerts={commutePathPreview && selection
                      // The commute focus copy repaints the selected alert.
                      ? lineAlerts.filter((alert) => !isSelectedLineAlert(alert, selection))
                      : lineAlerts}
                    plane={overlayPlane}
                    selection={selection}
                  />
                </g>
                <g id={REGIONAL_DYNAMIC_COMMUTE_LAYER_ID}>
                  <MapCommutePreviewRoute preview={commutePreview} />
                </g>
                <g id={REGIONAL_DYNAMIC_HOVER_LAYER_ID} className="regional-impact-hover-foreground-layer">
                  <MapLineAlertHoverCopies alerts={lineAlerts} plane={overlayPlane} />
                </g>
                {/* The selected alert's flash stays above hover copies, so hovering never hides it. */}
                <g id={REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID} className="regional-selected-segment-layer">
                  <MapLineAlertSelection
                    alerts={lineAlerts.filter((alert) => isSelectedLineAlert(alert, selection))}
                    plane={overlayPlane}
                    commutePreviewActive={Boolean(commutePathPreview)}
                    introComplete={selectionIntroComplete}
                  />
                </g>
                <MapStationHoverIndicators
                  stations={stationPlacements}
                  selectedStationId={selectedStationId}
                  overlayUnit={overlayPlane.unit}
                />
              </g>
            ) : null}
          </svg>
          <RasterMapPlane
            network="regional"
            plane="foreground"
            theme={rasterTheme}
            density={rasterDensity}
            onReady={() => markRasterPlaneReady("foreground")}
          />
          <RasterMapPlane
            network="regional"
            plane="labels"
            theme={rasterTheme}
            density={rasterDensity}
            svgViewBox="-200 -200 17036.959 9031.6719"
            cutoutMarkup={hoveredStationLabel?.cutoutMarkup ?? null}
            onReady={() => markRasterPlaneReady("labels")}
          />
          {/* Top plane: the hovered station name, train markers and the compass. */}
          <svg
            className="raster-map-top-plane absolute top-0 left-0 w-full h-full pointer-events-none"
            viewBox={REGIONAL_PLANE_VIEWBOX}
            preserveAspectRatio="xMidYMid meet"
          >
            {hoveredStationLabel ? (
              <g
                aria-hidden="true"
                className="raster-station-label-text-hover"
                key={`station-label-hover:${hoveredStationLabel.stationId}`}
                data-hover-active={activeHoveredStationLabel !== null}
                style={{ transformOrigin: `${hoveredStationLabel.center.x + 200}px ${hoveredStationLabel.center.y + 200}px` }}
              >
                <defs>
                  <clipPath id="regional-hovered-station-label-clip" clipPathUnits="userSpaceOnUse">
                    <polygon points={hoveredStationLabel.polygonPoints} />
                  </clipPath>
                  <filter id="regional-hovered-label-white-alpha" colorInterpolationFilters="sRGB">
                    <feColorMatrix
                      type="matrix"
                      values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"
                    />
                  </filter>
                  <filter id="regional-hovered-label-target-alpha" colorInterpolationFilters="sRGB">
                    <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="expandedTargetAlpha" />
                    <feColorMatrix
                      in="expandedTargetAlpha"
                      type="matrix"
                      values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"
                    />
                  </filter>
                  <mask
                    id="regional-hovered-station-target-mask"
                    maskUnits="userSpaceOnUse"
                    x={hoveredStationLabel.bounds.x}
                    y={hoveredStationLabel.bounds.y}
                    width={hoveredStationLabel.bounds.width}
                    height={hoveredStationLabel.bounds.height}
                  >
                    <g
                      filter="url(#regional-hovered-label-target-alpha)"
                      dangerouslySetInnerHTML={{ __html: hoveredStationLabel.cutoutMarkup }}
                    />
                  </mask>
                  <mask
                    id="regional-hovered-station-label-mask"
                    maskUnits="userSpaceOnUse"
                    x={hoveredStationLabel.bounds.x}
                    y={hoveredStationLabel.bounds.y}
                    width={hoveredStationLabel.bounds.width}
                    height={hoveredStationLabel.bounds.height}
                  >
                    <g mask="url(#regional-hovered-station-target-mask)">
                      <image
                        href={rasterMapSource("regional", "labels", rasterTheme, rasterDensity)}
                        x="-200"
                        y="-200"
                        width="17036.959"
                        height="9031.6719"
                        preserveAspectRatio="xMidYMid meet"
                        clipPath="url(#regional-hovered-station-label-clip)"
                        filter="url(#regional-hovered-label-white-alpha)"
                      />
                    </g>
                  </mask>
                </defs>
                <image
                  href={rasterMapSource("regional", "labels", rasterTheme, rasterDensity)}
                  x="-200"
                  y="-200"
                  width="17036.959"
                  height="9031.6719"
                  preserveAspectRatio="xMidYMid meet"
                  mask="url(#regional-hovered-station-label-mask)"
                />
              </g>
            ) : null}
            <g
              id={REGIONAL_TRAIN_MARKER_LAYER_ID}
              className="estimated-train-marker-layer regional-estimated-train-marker-layer"
              aria-label="Estimated regional train markers"
              pointerEvents="none"
            />
            <g aria-label="Cardinal North Compass" transform="translate(14800, 5100)">
              <CardinalNorthIcon width={1000} height={1000} dark={isDark} />
            </g>
          </svg>
          {/* Interaction plane: hover outlines, targets (line alerts, then
              stations), station alerts, station names, selection and badges,
              in TTC's order. Only targets take the pointer; the viewport's
              pointer handlers select from their identity. */}
          <svg
            className="raster-map-interaction-plane absolute top-0 left-0 w-full h-full pointer-events-none"
            viewBox={REGIONAL_PLANE_VIEWBOX}
            preserveAspectRatio="xMidYMid meet"
          >
            {overlayPlane ? <MapLineAlertHoverOutlines alerts={lineAlerts} plane={overlayPlane} /> : null}
            <g
              ref={previewOutlineLayerRef}
              id={REGIONAL_TOP_HOVER_LAYER_ID}
              className="regional-impact-top-hover-layer"
              aria-hidden="true"
              pointerEvents="none"
            />
            {overlayPlane ? (
              <g>
                <g id={REGIONAL_DYNAMIC_TARGET_LAYER_ID} aria-label="Disruption overlay interaction targets">
                  <MapLineAlertTargets alerts={lineAlerts} />
                </g>
                <MapStationTargets
                  stations={stationPlacements}
                  selectedStationId={selectedStationId}
                  hitPadding={REGIONAL_MANIFEST.stationHitPadding}
                  onHoverChange={setStationHovered}
                />
              </g>
            ) : null}
            {overlayPlane ? <MapCommuteEndpointFlashes preview={commutePreview} plane={overlayPlane} /> : null}
            <g id={REGIONAL_TOP_STATION_IMPACT_LAYER_ID} aria-label="Station alerts">
              {overlayPlane ? (
                <MapStationAlertRings alerts={stationAlerts} plane={overlayPlane} selection={selection} />
              ) : null}
            </g>
            <MapStationLabelTargets labels={stationLabelTargets} />
            <MapStationDirectionGlyphs glyphs={stationDirectionGlyphs} />
            <g aria-hidden="true" pointerEvents="none">
              {overlayPlane ? (
                <g>
                  <MapStationSelection
                    key={selectedStationId ?? "none"}
                    station={selectedStationArtwork}
                    introComplete={selectionIntroComplete}
                  />
                </g>
              ) : null}
              {overlayPlane ? (
                <MapStationAlertForeground
                  alerts={stationAlerts}
                  plane={overlayPlane}
                  selection={selection}
                  commutePreviewActive={Boolean(commutePathPreview)}
                  introComplete={selectionIntroComplete}
                />
              ) : null}
            </g>
            <g aria-label="Overlapping alert badges">
              {overlapBadges.map((badge) => (
                <MapOverlapIndicator
                  key={badge.markerId}
                  markerId={badge.markerId}
                  label={badge.label}
                  impacts={badge.impacts}
                  position={badge.position}
                  size={badge.size}
                  selection={selection}
                  linkedSelectionIds={linkedSelectionIds}
                  isOpen={expandedOverlapBadgeId === badge.markerId}
                  connector={badge.connector}
                  visualScale={REGIONAL_OVERLAP_INDICATOR_SCALE}
                  isolatePointerDown
                  shouldSuppressMapClick={shouldSuppressMapClick}
                  onActivate={() => {
                    if (expandedOverlapBadgeId === badge.markerId) {
                      closeRegionalOverlapChooser();
                    } else {
                      openRegionalOverlapChooser(badge);
                    }
                  }}
                  onHoverChange={(hovered) => {
                    if (expandedOverlapBadgeId !== badge.markerId) {
                      setRegionalOverlapImpactsHovered(badge.impacts, hovered);
                    }
                  }}
                />
              ))}
            </g>
          </svg>
        </div>
        {recenterFeedbackKey > 0 ? (
          <div
            key={recenterFeedbackKey}
            aria-hidden="true"
            className="map-center-feedback"
            data-map-center-feedback="regional"
          />
        ) : null}
      </div>
      {expandedOverlapBadge && expandedOverlapChooser ? (
        <MapOverlapChooser
          key={expandedOverlapBadge.markerId}
          selectionKey={focusTargetKey}
          markerId={expandedOverlapBadge.markerId}
          label={expandedOverlapBadge.label}
          impacts={expandedOverlapBadge.impacts}
          layout={expandedOverlapChooser.layout}
          follower={overlapChooserFollower}
          followAnchor={expandedOverlapChooser.followAnchor}
          onSelectImpact={onSelectImpact}
          onHoverImpact={hoverRegionalChooserImpact}
          onClose={closeRegionalChooserWithFocus}
          reducedMotion={reducedMotion}
          viewportOrientation={viewportOrientation}
          viewportSize={mapViewportSize}
        />
      ) : null}
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
      {/* Top center regional map controls matching TTC */}
      <SharedMapControlRail network="regional" ref={mapControlRailRef} className="map-control-rail desktop-map-control-rail regional-map-control-rail absolute top-14 sm:top-5 left-1/2 -translate-x-1/2 z-30 flex flex-row items-center justify-center gap-1 sm:gap-2 pointer-events-auto" data-map-chooser-keepout>
        <div className="map-control-recenter-container">
          <button
            type="button"
            onClick={handleFitNetwork}
            className="map-control-button group"
            title="Center map view"
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
            type="button"
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
            type="button"
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
            <NetworkSelector network="regional" onChange={onNetworkChange} ariaLabel="Map network switcher" />
          </div>
        )}

        {onMapViewChange && (
          <div className="desktop-map-control-view-group hidden md:flex items-center">
            <div className="map-control-divider" aria-hidden="true" />
            <MapViewSelector view={mapView ?? "diagram"} onChange={onMapViewChange} />
          </div>
        )}
      </SharedMapControlRail>
    </section>
  );
}

export const InteractiveRegionalMap = memo(InteractiveRegionalMapComponent);
InteractiveRegionalMap.displayName = "InteractiveRegionalMap";

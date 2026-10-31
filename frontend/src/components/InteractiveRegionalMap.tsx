"use client";
import { CommuteRouteLabel } from "./CommuteRouteLabel";
import { CardinalNorthIcon } from "./CardinalNorthIcon";

import { usePanZoom } from "../hooks/usePanZoom";
import {
  observeMobileMapFrame,
  readCommutePreviewInset,
  readMobileImpactInspectorInset,
  readMobileImpactInspectorTop,
  readMobilePillBottom,
  readMobileStationSubmenuTop,
} from "../hooks/mobileMapFrame";
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
import { MOBILE_VIEWPORT_QUERY } from "../hooks/useMobilePerformanceMode";
import {
  getRegionalMapMarkup,
  preloadRegionalMapMarkup,
} from "../app/regional-map-asset";

export { preloadRegionalMapMarkup } from "../app/regional-map-asset";

/** GO/UP's prepared geometry (scripts/prepare-map-geometry.mjs). */
const REGIONAL_GEOMETRY = preparedRegionalGeometry as unknown as PreparedMapGeometry;
const REGIONAL_OVERLAY_PLANE = regionalOverlayPlane(REGIONAL_GEOMETRY);
const REGIONAL_STATION_ARTWORK = regionalStationArtwork(REGIONAL_GEOMETRY);
const REGIONAL_STATION_LABEL_TARGETS = regionalStationLabelTargets(REGIONAL_GEOMETRY);
const NO_STATION_ARTWORK: RegionalStationArtwork[] = [];
const NO_STATION_LABEL_TARGETS: RegionalStationLabelTarget[] = [];

import {
  regionalTrainMarkerFrame,
  regionalStationLabelHover,
  REGIONAL_OVERLAP_INDICATOR_SCALE,
  REGIONAL_OVERLAY_UNIT,
  type RegionalCollisionBox,
  type RegionalTrainMarkerFrame,
} from "../app/regional-map-geometry";
import type { PreparedMapGeometry } from "../app/map-geometry-data";
import preparedRegionalGeometry from "../app/map-geometry/regional.json";
import {
  regionalOverlapBadgeLayout,
  regionalOverlayContentSignature,
  regionalPointerImpactSelection,
  regionalOverlapMarker,
  regionalOverlapMarkerRestingRect,
  regionalOverlapChooserLayout,
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
  regionalStationArtwork,
  regionalStationLabelCutoutMarkup,
  regionalStationLabelTargets,
  type RegionalStationArtwork,
  type RegionalStationLabelTarget,
} from "../app/regional-station-interaction";
import {
  RegionalStationHoverIndicators,
  RegionalStationLabelTargets,
  RegionalStationSelection,
  RegionalStationTargets,
} from "./RegionalStationLayers";
import { clearMapStationHover, setMapStationHovered } from "./map-overlays/station-hover";
import { affectedOutlinesOnScreen } from "./map-overlays/overlap-badge-layout";
import type { MapBounds, MapPoint } from "../app/map-geometry";

type SvgPoint = MapPoint;
type SvgBounds = MapBounds;

import { MapOverlapIndicator, restoreMapOverlapIndicatorFocus } from "./MapOverlapIndicator";
import {
  MapOverlapChooser,
  type MapOverlapChooserLayout,
} from "./MapOverlapChooser";
import { isMapWheelScrollRegionTarget, usePreventMapWheelDefault } from "./map-wheel-events";
import { useCommittedCamera } from "./map-camera/camera-store";
import { MapZoomSlider } from "./map-camera/MapZoomSlider";
import {
  clampPanZoomScale,
  clientPointToLogicalViewportPoint,
  clientRectToLogicalViewportBounds,
  computeBoundedMapFrame,
  computeInsetViewportFocus,
  logicalViewportSizeForOrientation,
  type MapContentBounds,
  type MapViewportOrientation,
} from "../hooks/panZoomMath";
import { readDesktopLeftOcclusion, measureDesktopMapInsets } from "../app/desktop-sidebar-state";
import {
  FOCUS_REVEAL_DURATION_MS,
  focusRevealSafeArea,
  focusRevealTranslation,
  logicalBoxFromClientRect,
  shouldRevealFocusedMapTarget,
  type MapEdgeInsets,
} from "../app/map-focus-reveal";
import { RasterMapPlane, rasterMapSource, type RasterMapTheme } from "./RasterMapPlane";
import { mobilePerformanceModeMatches } from "../hooks/useMobilePerformanceMode";
import { useMapLabelFontReady } from "../hooks/useMapLabelFontReady";
import { usePageVisibility } from "../hooks/usePageVisibility";
import { linkedCurrentImpactIds } from "../app/selection-attention-key";
import { overlapChooserSize as mapOverlapChooserSize } from "./map-chooser-layout";
import {
  MapChooserFollower,
  chooserBadgeInView,
  projectPointToCamera,
  type ChooserFollowAnchor,
} from "./map-chooser-follow";
import { observeMapChooserKeepouts, visibleMapChooserKeepouts } from "./map-chooser-keepouts";

const MAP_WIDTH = 4739.2821;
const MAP_HEIGHT = 2616.8174;
const REGIONAL_MAP_HORIZONTAL_INSET_RATIO = 0.025;
// Custom regional map visible-art bounds, spanning from Kitchener/Stratford (x≈53.1px)
// through x≈4673.5px to include Durham College Oshawa, VIA Rail badges, and the Cardinal North compass.
const REGIONAL_MAP_CONTENT_BOUNDS: MapContentBounds = {
  x: 53.08,
  y: 110.78,
  width: 4620.46,
  height: 2395.26,
};

// Default desktop regional frame zoomed out a smidgen to provide comfortable
// breathing room around Allandale Waterfront text below the top console and
// Hamilton station above the bottom alert badges.
const REGIONAL_MAP_DEFAULT_FRAME_SCALE = 0.95;
const REGIONAL_MAP_DESKTOP_FRAME_SCALE = 1;
// Route-wide selections need breathing room beyond a technically exact fit so
// station labels and the authored corridor shape do not crowd the visible map
// space beside an open desktop panel. Short selections still use the preferred
// close zoom because their fitted scale remains above that cap.
const REGIONAL_SELECTION_FIT_COMFORT_RATIO = 0.82;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
// Frames to wait for a stage ease to land before solving the chooser anyway.
const REGIONAL_CHOOSER_SETTLE_FRAME_LIMIT = 30;

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






type RegionalOverlapChooserPlacement = {
  markerId: string;
  layout: MapOverlapChooserLayout;
  size: { width: number; height: number };
  viewportSize: { width: number; height: number };
  followAnchor: ChooserFollowAnchor;
  coversAffectedArea: boolean;
};

function regionalChooserPlacementsMatch(
  current: RegionalOverlapChooserPlacement,
  next: RegionalOverlapChooserPlacement,
): boolean {
  const near = (first: number, second: number) => Math.abs(first - second) < 0.5;
  const currentCamera = current.followAnchor.camera;
  const nextCamera = next.followAnchor.camera;
  return near(current.layout.left, next.layout.left)
    && near(current.layout.top, next.layout.top)
    && near(current.layout.anchorOffsetX, next.layout.anchorOffsetX)
    && near(current.layout.anchorOffsetY, next.layout.anchorOffsetY)
    && current.size.width === next.size.width
    && current.size.height === next.size.height
    && current.viewportSize.width === next.viewportSize.width
    && current.viewportSize.height === next.viewportSize.height
    && current.coversAffectedArea === next.coversAffectedArea
    && near(current.followAnchor.badge.x, next.followAnchor.badge.x)
    && near(current.followAnchor.badge.y, next.followAnchor.badge.y)
    && near(currentCamera?.x ?? 0, nextCamera?.x ?? 0)
    && near(currentCamera?.y ?? 0, nextCamera?.y ?? 0)
    && Math.abs((currentCamera?.scale ?? 0) - (nextCamera?.scale ?? 0)) < 0.0001;
}
/** The authored SVG: artwork until the raster planes are ready, and a geometry source. */
const RegionalSvgMarkup = memo(function RegionalSvgMarkup({ markup }: { markup: string }) {
  return <div dangerouslySetInnerHTML={{ __html: markup }} className="regional-live-svg raster-map-dynamic-plane absolute inset-0 w-full h-full" />;
});

/** The map's SVG planes share the authored SVG's view box. */
const REGIONAL_PLANE_VIEWBOX = "-200 -200 17036.959 9031.6719";


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
  const cameraCommandsEnabledRef = useRef(cameraCommandsEnabled);
  useEffect(() => {
    cameraCommandsEnabledRef.current = cameraCommandsEnabled;
  }, [cameraCommandsEnabled]);
  const isMapActiveRef = useRef(isMapActive);
  useEffect(() => {
    isMapActiveRef.current = isMapActive;
  }, [isMapActive]);
  const lastRecenterSignalRef = useRef(recenterSignal);
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
  const stationArtwork = overlayPlane ? REGIONAL_STATION_ARTWORK : NO_STATION_ARTWORK;
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
  const [overlapChooserPlacement, setOverlapChooserPlacement] = useState<RegionalOverlapChooserPlacement | null>(null);
  const [overlapChooserFollower] = useState(() => new MapChooserFollower());
  const overlapChooserPlacementRef = useRef<RegionalOverlapChooserPlacement | null>(null);
  useLayoutEffect(() => {
    overlapChooserPlacementRef.current = overlapChooserPlacement;
  }, [overlapChooserPlacement]);
  const [chooserKeepoutRevision, setChooserKeepoutRevision] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [desktopMapTopInset, setDesktopMapTopInset] = useState(() => {
    if (typeof window === "undefined" || window.innerWidth < 768) return 0;
    const rail = document.querySelector<HTMLElement>(".desktop-map-control-rail");
    const root = document.querySelector<HTMLElement>(".regional-map-container")
      ?? document.querySelector<HTMLElement>(".network-map-transition-surface");
    return measureDesktopMapInsets(root, rail).top;
  });
  const [desktopMapBottomInset, setDesktopMapBottomInset] = useState(() => {
    if (typeof window === "undefined" || window.innerWidth < 768) return 0;
    const rail = document.querySelector<HTMLElement>(".desktop-map-control-rail");
    const root = document.querySelector<HTMLElement>(".regional-map-container")
      ?? document.querySelector<HTMLElement>(".network-map-transition-surface");
    return measureDesktopMapInsets(root, rail).bottom;
  });
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

  useLayoutEffect(() => observeMapChooserKeepouts(() => {
    setChooserKeepoutRevision((revision) => revision + 1);
  }), []);
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
  const lastFocusedTargetKeyRef = useRef<string | null>(null);
  const lastFocusLayoutKeyRef = useRef("");

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

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const mapSurface = viewport?.closest<HTMLElement>(".network-map-transition-surface");
    const shell = viewport?.closest<HTMLElement>(".linewatch-shell");
    const rail = mapControlRailRef.current ?? shell?.querySelector<HTMLElement>(".desktop-map-control-rail");
    if (!viewport || !mapSurface) return;

    const measureDesktopInsets = () => {
      const insets = measureDesktopMapInsets(viewport, rail);
      setDesktopMapTopInset((current) => current === insets.top ? current : insets.top);
      setDesktopMapBottomInset((current) => current === insets.bottom ? current : insets.bottom);
    };

    measureDesktopInsets();
    const observer = new ResizeObserver(measureDesktopInsets);
    observer.observe(viewport);
    observer.observe(mapSurface);
    if (rail) observer.observe(rail);
    const legend = document.querySelector<HTMLElement>(".desktop-map-legend");
    if (legend) observer.observe(legend);
    window.addEventListener("resize", measureDesktopInsets);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureDesktopInsets);
    };
  }, [mapChromeVisible]);

  // Desktop insets and the phone's open sheet reframe an untouched camera.
  useEffect(() => {
    refitIfCameraUntouched();
  }, [refitIfCameraUntouched]);

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

  const focusTargetKey = useMemo(() => {
    if (selection) return `${selection.kind}:${selection.id}:${selectionAttentionGeneration}`;
    if (selectedStationId) return `station:${selectedStationId}`;
    if (commutePathPreview) return `commute:${commutePathPreview.id}:${commutePathPreview.legId}`;
    return null;
  }, [commutePathPreview, selection, selectedStationId, selectionAttentionGeneration]);
  const selectionIntroKey = mapSelectionIntroKey({
    selection,
    linkedSelectionIntroKey,
    selectedStationId,
    commutePreviewKey: commutePathPreview ? `${commutePathPreview.id}:${commutePathPreview.legId}` : null,
    generation: selectionAttentionGeneration,
  });
  const selectionIntroComplete = useMapSelectionIntro(selectionIntroKey);

  // The mounted map already fits its current layout. Only new commands
  // should reset it; replaying a stored command interrupts network entry.
  const lastHandledLayoutResetSignalRef = useRef(layoutResetSignal ?? 0);

  useEffect(() => {
    if (!layoutResetSignal || !svgMarkup) return;
    if (lastHandledLayoutResetSignalRef.current === layoutResetSignal) return;
    lastHandledLayoutResetSignalRef.current = layoutResetSignal;
    if (focusTargetKey) return;
    const resetTimer = window.setTimeout(() => recenter(), 320);
    return () => window.clearTimeout(resetTimer);
  }, [focusTargetKey, recenter, layoutResetSignal, svgMarkup]);

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
      activeAlerts, delays, reducedSpeedZones, plannedClosures, stationNodeImpacts: stationAlertImpacts, stations,
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
    () => stationArtwork.find((station) => station.id === selectedStationId) ?? null,
    [selectedStationId, stationArtwork],
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
    // Treat this as an edge-triggered command. A remount or data refresh must
    // never replay an old Center request that is still stored by the shell.
    if (recenterSignal === undefined || recenterSignal === lastRecenterSignalRef.current) return;
    lastRecenterSignalRef.current = recenterSignal;
    if (!cameraCommandsEnabledRef.current) return;
    handleFitNetwork();
  }, [handleFitNetwork, recenterSignal]);

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

  const selectedMapElements = useCallback(() => {
    const root = viewportRef.current;
    if (!root) return [];
    if (commutePathPreview && selection) {
      return [
        ...root.querySelectorAll<SVGGraphicsElement>(
          `[data-selected-commute-impact-overlay="${CSS.escape(selection.id)}"], [data-selected-impact-emphasis="${CSS.escape(selection.id)}"], [data-map-impact-id="${CSS.escape(selection.id)}"], [data-regional-station-selection-id="${CSS.escape(selection.id)}"]`,
        ),
      ];
    }
    if (commutePathPreview) {
      const preview = root.querySelector<SVGGraphicsElement>(
        `[data-commute-path-preview="${CSS.escape(commutePathPreview.id)}"]`,
      );
      return preview ? [preview] : [];
    }
    if (selection) {
      return [...root.querySelectorAll<SVGGraphicsElement>(
        `[data-map-impact-kind="${selection.kind}"][data-map-impact-id="${CSS.escape(selection.id)}"]`,
      )];
    }
    if (selectedStationId) {
      const station = root.querySelector<SVGGraphicsElement>(
        `[data-regional-station-selection-id="${CSS.escape(selectedStationId)}"]`,
      );
      return station ? [station] : [];
    }
    return [];
  }, [commutePathPreview, selectedStationId, selection]);

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
        : Math.max(desktopMapTopInset, focusPadding),
      bottom: isMobile
        ? (selectedStationId
            ? Math.max(focusPadding, logicalHeight - mobileStationTop)
            : Math.max(focusPadding, logicalHeight - mobileImpactTop))
        : Math.max(desktopMapBottomInset, focusPadding, readMobileImpactInspectorInset(viewport) + focusPadding),
    };

    if (commutePathPreview && !selection && !selectedStationId) {
      insets.bottom = Math.max(insets.bottom, readCommutePreviewInset(viewport));
    }

    if (!isMobile) {
      const leftOcclusion = readDesktopLeftOcclusion(viewport, 16);
      if (leftOcclusion > 0) {
        insets.left = Math.max(insets.left, leftOcclusion);
      }
    }

    return { insets, topPillBottom, mobileStationTop };
  }, [commutePathPreview, desktopMapBottomInset, desktopMapTopInset, selectedStationId, selection]);

  const focusSelectedMapElements = useCallback(() => {
    const viewport = viewportRef.current;
    const elements = selectedMapElements();
    if (!viewport || elements.length === 0) return false;

    const viewportRect = viewport.getBoundingClientRect();
    if (viewportRect.width <= 0 || viewportRect.height <= 0) return false;

    const visibleBounds = elements
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
    if (visibleBounds.length === 0) return false;

    const current = readCamera();
    const left = Math.min(...visibleBounds.map((bounds) => bounds.x));
    const right = Math.max(...visibleBounds.map((bounds) => bounds.x + bounds.width));
    const top = Math.min(...visibleBounds.map((bounds) => bounds.y));
    const bottom = Math.max(...visibleBounds.map((bounds) => bounds.y + bounds.height));
    const renderedCenterX = (left + right) / 2;
    const renderedCenterY = (top + bottom) / 2;
    const mapX = (renderedCenterX - current.x) / current.scale;
    const mapY = (renderedCenterY - current.y) / current.scale;
    const { width: logicalWidth, height: logicalHeight } = logicalViewportSize();
    if (logicalWidth <= 0 || logicalHeight <= 0) return false;

    const isMobile = typeof window !== "undefined" && window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
    const effectiveFitScale = defaultTransformForViewport(logicalWidth, logicalHeight).scale;
    const commutePreviewComfort = commutePathPreview && !selection && !selectedStationId ? 0.82 : 1;
    const preferredTargetScale = clampPanZoomScale(effectiveFitScale * (isMobile ? 3.8 : 1.8), effectiveFitScale);
    const { insets: focusInsets, topPillBottom, mobileStationTop } = readOccludedInsets(viewport, logicalHeight, isMobile);

    if (selectedStationId) {
      const targetScale = preferredTargetScale;
      const focusX = isMobile
        ? logicalWidth / 2
        : (logicalWidth + focusInsets.left - focusInsets.right) / 2;
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
      focusInsets,
    );
    const targetScale = Math.min(
      clampPanZoomScale(preferredTargetScale, effectiveFitScale),
      selectionFit.scale * REGIONAL_SELECTION_FIT_COMFORT_RATIO,
    ) * commutePreviewComfort;
    const { focusX: baseFocusX, focusY: baseFocusY } = computeInsetViewportFocus(
      logicalWidth,
      logicalHeight,
      focusInsets,
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
  }, [readCamera, 
    animateTransformTo,
    commutePathPreview,
    defaultTransformForViewport,
    logicalViewportSize,
    readOccludedInsets,
    selectedMapElements,
    selectedStationId,
    selection,
    viewportOrientation,
  ]);

  /** Pans a keyboard-focused target out from under the panels and controls. */
  const revealFocusedMapTarget = useCallback((target: EventTarget | null) => {
    const viewport = viewportRef.current;
    if (!viewport || !cameraReady || !shouldRevealFocusedMapTarget(target, mapStageRef.current)) return;
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
    animateTransformTo({
      x: current.x + offset.dx,
      y: current.y + offset.dy,
      scale: current.scale,
    }, undefined, true, FOCUS_REVEAL_DURATION_MS);
  }, [animateTransformTo, cameraReady, currentRenderedTransform, logicalViewportSize, readCamera, readOccludedInsets, viewportOrientation]);

  useEffect(() => {
    if (!isCameraInitialized() || !svgMarkup) return;
    const layoutKey = `${layoutResetSignal ?? 0}:${desktopMapTopInset}:${desktopMapBottomInset}:${viewportOrientation}`;

    if (!focusTargetKey) {
      if (lastFocusedTargetKeyRef.current !== null) {
        lastFocusedTargetKeyRef.current = null;
        lastFocusLayoutKeyRef.current = layoutKey;
        if (!preserveCameraOnSelectionClear) {
          const recenterFrame = window.requestAnimationFrame(fitNetwork);
          return () => window.cancelAnimationFrame(recenterFrame);
        }
      }
      return;
    }
    if (
      lastFocusedTargetKeyRef.current === focusTargetKey
      && lastFocusLayoutKeyRef.current === layoutKey
    ) {
      return;
    }

    let retryTimer: number | null = null;
    let attempts = 0;
    const tryFocus = () => {
      if (focusSelectedMapElements()) {
        lastFocusedTargetKeyRef.current = focusTargetKey;
        lastFocusLayoutKeyRef.current = layoutKey;
      } else if (attempts < 12) {
        attempts++;
        retryTimer = window.setTimeout(tryFocus, 50);
      }
    };

    const frame = window.requestAnimationFrame(tryFocus);
    return () => {
      window.cancelAnimationFrame(frame);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [isCameraInitialized, 
    desktopMapBottomInset,
    desktopMapTopInset,
    fitNetwork,
    focusSelectedMapElements,
    focusTargetKey,
    layoutResetSignal,
    preserveCameraOnSelectionClear,
    selectedStationId,
    svgMarkup,
    viewportOrientation,
  ]);

  const lastZoomInSignalRef = useRef(zoomInSignal);
  useEffect(() => {
    if (zoomInSignal === undefined || zoomInSignal === lastZoomInSignalRef.current) return;
    lastZoomInSignalRef.current = zoomInSignal;
    if (!cameraCommandsEnabledRef.current) return;
    zoomIn();
  }, [zoomIn, zoomInSignal]);

  const lastZoomOutSignalRef = useRef(zoomOutSignal);
  useEffect(() => {
    if (zoomOutSignal === undefined || zoomOutSignal === lastZoomOutSignalRef.current) return;
    lastZoomOutSignalRef.current = zoomOutSignal;
    if (!cameraCommandsEnabledRef.current) return;
    zoomOut();
  }, [zoomOut, zoomOutSignal]);

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
    if (!(event.target instanceof Element && event.target.closest(".regional-station-label-hit-target"))) {
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
    const station = target?.closest<SVGElement>("[data-regional-station-id]");
    const impactSelection = impact
      ? regionalPointerImpactSelection(event.currentTarget, impact, event.clientX, event.clientY)
      : null;
    pointerActivationRef.current = impactSelection
      ? { type: "impact", selection: impactSelection }
      : station?.dataset.regionalStationId
        ? { type: "station", id: station.dataset.regionalStationId }
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
    if (!target?.closest(".overlap-indicator, [data-map-impact-kind], [data-regional-station-id], button, [role='button'], [data-map-chooser-keepout]")) {
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
    const station = target.closest("[data-regional-station-id]") as SVGElement | null;
    if (station?.dataset.regionalStationId) {
      const id = station.dataset.regionalStationId;
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
    setOverlapChooserPlacement(null);
  }, [expandedOverlapBadgeId, overlapBadges, setRegionalOverlapImpactsHovered]);

  // Solve the chooser only while the camera is at rest. During a drag or a
  // camera flight the follower keeps the card on its badge; the solve that
  // runs when the camera commits glides it to its new spot.
  const positionRegionalOverlapChooser = useCallback((
    badge: RegionalOverlapBadge,
    opening = false,
  ) => {
    if (!opening && isCameraInteracting()) return false;
    const viewport = viewportRef.current;
    const marker = viewport ? regionalOverlapMarker(viewport, badge.markerId) : null;
    if (!viewport || !marker) return false;
    // DOM boxes are measured at the camera the stage is showing, which may
    // still be easing; project them to the camera it is easing to.
    const targetCamera = readCamera();
    const renderedCamera = currentRenderedTransform() ?? targetCamera;
    const toTargetCamera = (box: RegionalCollisionBox): RegionalCollisionBox => {
      const corner = projectPointToCamera(box, renderedCamera, targetCamera);
      const ratio = renderedCamera.scale > 0 ? targetCamera.scale / renderedCamera.scale : 1;
      return { x: corner.x, y: corner.y, width: box.width * ratio, height: box.height * ratio };
    };
    const viewportRect = viewport.getBoundingClientRect();
    const markerRect = regionalOverlapMarkerRestingRect(marker);
    const logicalViewportSize = logicalViewportSizeForOrientation(
      viewportRect.width,
      viewportRect.height,
      viewportOrientation,
    );
    const measuredMarkerRect = clientRectToLogicalViewportBounds(
      markerRect,
      viewportRect,
      viewportOrientation,
    );
    if (!measuredMarkerRect) return false;
    const logicalMarkerRect = toTargetCamera(measuredMarkerRect);
    const { width, height } = mapOverlapChooserSize(badge.impacts.length, logicalViewportSize.width);
    const markerCenter = {
      x: logicalMarkerRect.x + logicalMarkerRect.width / 2,
      y: logicalMarkerRect.y + logicalMarkerRect.height / 2,
    };
    const badgeInView = chooserBadgeInView(markerCenter, logicalViewportSize);
    const uiKeepoutBoxes = visibleMapChooserKeepouts()
      .map((element) => clientRectToLogicalViewportBounds(
        element.getBoundingClientRect(),
        viewportRect,
        viewportOrientation,
      ))
      .filter((box): box is RegionalCollisionBox => Boolean(box));
    // The badge's alerts as drawn (their hover outlines), on screen at the
    // camera the stage is easing to.
    const planeMatrix = viewport.querySelector<SVGSVGElement>(".regional-overlay-plane")?.getScreenCTM();
    if (!planeMatrix) return false;
    const cameraRatio = renderedCamera.scale > 0 ? targetCamera.scale / renderedCamera.scale : 1;
    const affectedArea = affectedOutlinesOnScreen(
      badge.affectedOutlines ?? [],
      ({ x, y }) => projectPointToCamera(clientPointToLogicalViewportPoint({
        x: planeMatrix.a * x + planeMatrix.c * y + planeMatrix.e,
        y: planeMatrix.b * x + planeMatrix.d * y + planeMatrix.f,
      }, viewportRect, viewportOrientation), renderedCamera, targetCamera),
      Math.hypot(planeMatrix.a, planeMatrix.b) * cameraRatio,
    );
    const current = overlapChooserPlacementRef.current;
    const placement = regionalOverlapChooserLayout({
      markerCenter,
      markerSize: logicalMarkerRect,
      chooserSize: { width, height },
      viewportSize: logicalViewportSize,
      affectedArea,
      uiKeepoutBoxes,
      // Keep the open card's spot beside its badge while that spot is valid.
      preferred: !opening && current?.markerId === badge.markerId
        ? {
            offsetX: current.layout.left - current.followAnchor.badge.x,
            offsetY: current.layout.top - current.followAnchor.badge.y,
            width: current.size.width,
            height: current.size.height,
            coversAffectedArea: current.coversAffectedArea,
          }
        : null,
    });
    const next: RegionalOverlapChooserPlacement = {
      markerId: badge.markerId,
      layout: placement.layout,
      size: placement.size,
      viewportSize: logicalViewportSize,
      followAnchor: { badge: markerCenter, camera: { ...targetCamera } },
      coversAffectedArea: placement.coversAffectedArea,
    };
    setOverlapChooserPlacement((current) => {
      if (!current || current.markerId !== next.markerId) return next;
      // A badge panned off screen keeps its card attached to it.
      if (!badgeInView) return current;
      return regionalChooserPlacementsMatch(current, next) ? current : next;
    });
    return true;
  }, [currentRenderedTransform, isCameraInteracting, readCamera, viewportOrientation]);

  const openRegionalOverlapChooser = useCallback((badge: RegionalOverlapBadge) => {
    if (!positionRegionalOverlapChooser(badge, true)) return;
    setExpandedOverlapBadgeId(badge.markerId);
    setRegionalOverlapImpactsHovered(badge.impacts, true);
  }, [positionRegionalOverlapChooser, setRegionalOverlapImpactsHovered]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateTarget(event.target);
  }, [activateTarget]);

  const expandedOverlapBadge = overlapBadges.find(
    (candidate) => candidate.markerId === expandedOverlapBadgeId,
  ) ?? null;
  // Camera commits re-render this map only while a chooser is open.
  const chooserCamera = useCommittedCamera(cameraStore, expandedOverlapBadge !== null);
  useLayoutEffect(() => {
    if (!expandedOverlapBadge) return;
    // Solve once the stage has finished easing to the committed camera. On a
    // busy main thread the short zoom ease can still be running here, and a
    // card placed early would jump ahead of its badge.
    let animationFrame = 0;
    let framesWaited = 0;
    const solveWhenStill = () => {
      const target = readCamera();
      const rendered = currentRenderedTransform() ?? target;
      const easing = Math.abs(rendered.x - target.x) > 0.5
        || Math.abs(rendered.y - target.y) > 0.5
        || Math.abs(rendered.scale - target.scale) > 0.0001;
      if (easing && framesWaited < REGIONAL_CHOOSER_SETTLE_FRAME_LIMIT) {
        framesWaited += 1;
        animationFrame = window.requestAnimationFrame(solveWhenStill);
        return;
      }
      positionRegionalOverlapChooser(expandedOverlapBadge);
    };
    animationFrame = window.requestAnimationFrame(solveWhenStill);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [
    chooserCamera,
    chooserKeepoutRevision,
    currentRenderedTransform,
    expandedOverlapBadge,
    positionRegionalOverlapChooser,
    readCamera,
    viewportOrientation,
  ]);
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
                <g id={REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID} className="regional-selected-segment-layer">
                  <MapLineAlertSelection
                    alerts={lineAlerts.filter((alert) => isSelectedLineAlert(alert, selection))}
                    plane={overlayPlane}
                    commutePreviewActive={Boolean(commutePathPreview)}
                    introComplete={selectionIntroComplete}
                  />
                </g>
                <g id={REGIONAL_DYNAMIC_HOVER_LAYER_ID} className="regional-impact-hover-foreground-layer">
                  <MapLineAlertHoverCopies alerts={lineAlerts} plane={overlayPlane} />
                </g>
                <RegionalStationHoverIndicators stations={stationArtwork} selectedStationId={selectedStationId} />
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
                <g aria-label="Station hit targets">
                  <RegionalStationTargets
                    stations={stationArtwork}
                    selectedStationId={selectedStationId}
                    onHoverChange={setStationHovered}
                  />
                </g>
              </g>
            ) : null}
            {overlayPlane ? <MapCommuteEndpointFlashes preview={commutePreview} plane={overlayPlane} /> : null}
            <g id={REGIONAL_TOP_STATION_IMPACT_LAYER_ID} aria-label="Station alerts">
              {overlayPlane ? (
                <MapStationAlertRings alerts={stationAlerts} plane={overlayPlane} selection={selection} />
              ) : null}
            </g>
            <g aria-label="Station label hit targets">
              <RegionalStationLabelTargets labels={stationLabelTargets} />
            </g>
            <MapStationDirectionGlyphs glyphs={stationDirectionGlyphs} />
            <g aria-hidden="true" pointerEvents="none">
              {overlayPlane ? (
                <g>
                  <RegionalStationSelection
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
      {expandedOverlapBadge && overlapChooserPlacement?.markerId === expandedOverlapBadge.markerId ? (
        <MapOverlapChooser
          key={expandedOverlapBadge.markerId}
          selectionKey={focusTargetKey}
          markerId={expandedOverlapBadge.markerId}
          label={expandedOverlapBadge.label}
          impacts={expandedOverlapBadge.impacts}
          chooserSize={overlapChooserPlacement.size}
          collisionAvoided
          layout={overlapChooserPlacement.layout}
          follower={overlapChooserFollower}
          followAnchor={overlapChooserPlacement.followAnchor}
          onSelectImpact={onSelectImpact}
          onHoverImpact={hoverRegionalChooserImpact}
          onClose={closeRegionalChooserWithFocus}
          reducedMotion={reducedMotion}
          compactMotion={overlapChooserPlacement.size.width <= 280}
          viewportOrientation={viewportOrientation}
          viewportSize={overlapChooserPlacement.viewportSize}
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

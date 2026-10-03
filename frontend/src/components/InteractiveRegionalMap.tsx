"use client";
import { CardinalNorthIcon } from "./CardinalNorthIcon";

import { useMapViewportPersistence } from "../hooks/useMapViewportPersistence";
import {
  observeMobileMapFrame,
  readMapStationCenterX,
  readMobileMapFrameInsets,
  readMobileImpactInspectorInset,
  readMobileImpactInspectorTop,
  readMobilePillBottom,
  readMobileStationSubmenuTop,
} from "../hooks/mobileMapFrame";
import { clearMapViewport } from "../app/map-viewport-preference";
import { useRetainedHover } from "../hooks/useRetainedHover";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { Locate, ZoomIn, ZoomOut } from "lucide-react";
import { NetworkSelector } from "./NetworkSelector";
import { SharedMapControlRail } from "./SharedMapControlRail";
import { MapViewSelector } from "./MapViewSelector";
import type { NetworkId } from "../app/regional-data";
import type { MapViewPreference } from "../app/visual-preferences";
import type { ImpactSelection, MapImpact, NetworkSegment } from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/commute-data";
import {
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
import { useDashboardData } from "../app/DataContext";
import { MOBILE_VIEWPORT_QUERY } from "../hooks/useMobilePerformanceMode";
import {
  getRegionalMapMarkup,
  preloadRegionalMapMarkup,
} from "../app/regional-map-asset";

export { preloadRegionalMapMarkup } from "../app/regional-map-asset";

import {
  primeRegionalRouteSamples,
  regionalTrainMarkerFrame,
  regionalStationLabelHover,
  REGIONAL_OVERLAP_INDICATOR_SCALE,
  type RegionalCollisionBox,
  type RegionalTrainMarkerFrame,
} from "../app/regional-map-geometry";
import {
  installRegionalOverlaySession,
  nextRegionalPointerImpactSelection,
  regionalOverlapMarker,
  regionalReferencedAlertCollisionBoxes,
  regionalOverlapChooserLayout,
  REGIONAL_TOP_HOVER_LAYER_ID,
  REGIONAL_TRAIN_MARKER_LAYER_ID,
  SELECTION_INTRO_DURATION_MS,
  type RegionalOverlapBadge,
  type RegionalOverlaySession,
} from "../app/regional-map-overlays";
import type { MapBounds, MapPoint } from "../app/map-geometry";

type SvgPoint = MapPoint;
type SvgBounds = MapBounds;

import { MapOverlapIndicator, restoreMapOverlapIndicatorFocus } from "./MapOverlapIndicator";
import {
  MapOverlapChooser,
  type MapOverlapChooserLayout,
} from "./MapOverlapChooser";
import { isMapWheelScrollRegionTarget } from "./map-wheel-events";
import {
  cameraFromOrientedTransformMatrix,
  clampPanZoomScale,
  clientPointToLogicalViewportPoint,
  clientRectToLogicalViewportBounds,
  computeBoundedMapFrame,
  computeDesktopMapFrame,
  computeFittedCameraFlyInStart,
  computeInsetViewportFocus,
  currentDevicePixelRatio,
  distanceBetweenPoints,
  exceedsMapTapMovement,
  mapPointFromViewportPoint,
  midpointBetweenPoints,
  logicalViewportSizeForOrientation,
  orientedMapCameraTransform,
  PAN_ZOOM_MAX_RELATIVE_SCALE,
  PAN_ZOOM_MIN_RELATIVE_SCALE,
  snapTransformToDevicePixels,
  transformForMapPointAtViewportPoint,
  type MapContentBounds,
  type MapViewportOrientation,
} from "../hooks/panZoomMath";
import { readDesktopLeftOcclusion, measureDesktopMapInsets } from "../app/desktop-sidebar-state";
import { RasterMapPlane, rasterMapSource, type RasterMapTheme } from "./RasterMapPlane";
import { mobilePerformanceModeMatches } from "../hooks/useMobilePerformanceMode";
import { useMapLabelFontReady } from "../hooks/useMapLabelFontReady";
import { usePageVisibility } from "../hooks/usePageVisibility";
import { observeMapChooserKeepouts, visibleMapChooserKeepouts } from "./map-chooser-keepouts";

const MAP_WIDTH = 4739.2821;
const MAP_HEIGHT = 2616.8174;
const REGIONAL_MAP_HORIZONTAL_INSET_RATIO = 0.025;
const REGIONAL_MAP_MOBILE_INSET_RATIO = 0.025;
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
const DEFAULT_CAMERA_MOTION_DURATION_MS = 800;
const DEFAULT_CAMERA_MOTION_EASING = "cubic-bezier(0.25, 1, 0.5, 1)";

type RegionalTrainMarkerMotionRuntime = {
  marker: EstimatedTrainMarker;
  frame: RegionalTrainMarkerFrame;
  targetObservationKey: string;
  cancelAnimation: (() => void) | null;
};


function animateRegionalTrainMarker(
  group: SVGGElement,
  marker: EstimatedTrainMarker,
  segments: NetworkSegment[],
  documentNode: Document,
  runtimes: Map<string, RegionalTrainMarkerMotionRuntime>,
  animate: boolean,
) {
  const markerKey = estimatedTrainMarkerRenderKey(marker);
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const targetSegment = segmentById.get(marker.segmentId);
  const targetFrame = targetSegment
    ? regionalTrainMarkerFrame(documentNode, targetSegment, marker)
    : null;
  if (!targetFrame) return;

  const current = runtimes.get(markerKey);
  const targetObservationKey = estimatedTrainMarkerObservationKey(marker);
  if (current?.targetObservationKey === targetObservationKey && animate) return;
  cancelRegionalTrainMarkerMotion(current);
  if (!current || !animate) {
    group.style.opacity = "1";
    setRegionalTrainMarkerTransform(group, targetFrame);
    runtimes.set(markerKey, {
      marker,
      frame: targetFrame,
      targetObservationKey,
      cancelAnimation: null,
    });
    return;
  }

  const waypoints = estimatedTrainMarkerMotionWaypoints(current.marker, marker, segments);
  const settledMarker = waypoints.at(-1) ?? current.marker;
  const settledSegment = segmentById.get(settledMarker.segmentId);
  const settledFrame = settledSegment
    ? regionalTrainMarkerFrame(documentNode, settledSegment, settledMarker) ?? current.frame
    : current.frame;
  const transition = createEstimatedTrainMarkerTransition(waypoints);
  const runtime: RegionalTrainMarkerMotionRuntime = {
    ...current,
    targetObservationKey,
    cancelAnimation: null,
  };
  runtimes.set(markerKey, runtime);

  let previousSample: ReturnType<typeof sampleEstimatedTrainMarkerMotion> | null = null;
  let previousMotion: ReturnType<typeof regionalTrainMarkerMotionFrame> = null;

  const update = (now: number) => {
    const { sample, opacity, done } = transition(now);
    group.style.opacity = String(opacity);
    const motion = sample === previousSample ? previousMotion : regionalTrainMarkerMotionFrame(sample, segmentById, documentNode);
    previousSample = sample;
    previousMotion = motion;
    if (!motion) {
      group.style.opacity = "1";
      setRegionalTrainMarkerTransform(group, settledFrame);
      setRegionalTrainMarkerMetadata(group, settledMarker);
      runtime.marker = settledMarker;
      runtime.frame = settledFrame;
      runtime.cancelAnimation = null;
      return false;
    }
    setRegionalTrainMarkerTransform(group, motion.frame);
    setRegionalTrainMarkerMetadata(group, motion.marker);
    runtime.marker = motion.marker;
    runtime.frame = motion.frame;
    if (done) {
      runtime.marker = settledMarker;
      runtime.frame = settledFrame;
      runtime.cancelAnimation = null;
      setRegionalTrainMarkerTransform(group, settledFrame);
      setRegionalTrainMarkerMetadata(group, settledMarker);
      return false;
    }
    return true;
  };
  if (update(performance.now())) {
    runtime.cancelAnimation = scheduleEstimatedTrainMarkerAnimation(update);
  }
}

function regionalTrainMarkerMotionFrame(
  sample: ReturnType<typeof sampleEstimatedTrainMarkerMotion>,
  segmentById: Map<string, NetworkSegment>,
  documentNode: Document,
): { marker: EstimatedTrainMarker; frame: RegionalTrainMarkerFrame } | null {
  if (sample.from.segmentId === sample.to.segmentId
    && sample.from.fromStationId === sample.to.fromStationId
    && sample.from.toStationId === sample.to.toStationId) {
    const marker = {
      ...sample.to,
      progress: sample.from.progress + (sample.to.progress - sample.from.progress) * sample.progress,
    };
    const segment = segmentById.get(marker.segmentId);
    const frame = segment ? regionalTrainMarkerFrame(documentNode, segment, marker) : null;
    return frame ? { marker, frame } : null;
  }
  // Never interpolate coordinates between paths: that draws a chord through
  // empty map space. Invalid samples hold an authored-path endpoint instead.
  const marker = sample.progress < 1 ? sample.from : sample.to;
  const segment = segmentById.get(marker.segmentId);
  const frame = segment ? regionalTrainMarkerFrame(documentNode, segment, marker) : null;
  return frame ? { marker, frame } : null;
}

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

function cancelRegionalTrainMarkerMotion(runtime: RegionalTrainMarkerMotionRuntime | undefined) {
  runtime?.cancelAnimation?.();
  if (runtime) runtime.cancelAnimation = null;
}

function appendRegionalTrainMarkerGlyph(documentNode: Document, group: SVGGElement) {
  for (const className of ["estimated-train-marker-outline", "estimated-train-marker-core"]) {
    const body = documentNode.createElementNS(SVG_NAMESPACE, "path");
    body.setAttribute("d", TRAIN_MARKER_BODY_PATH);
    body.classList.add(className);
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






type Camera = { x: number; y: number; scale: number };
type CameraMotionOptions = {
  durationMs?: number;
  easing?: string;
};

const RegionalSvgMarkup = memo(function RegionalSvgMarkup({ markup }: { markup: string }) {
  return <div dangerouslySetInnerHTML={{ __html: markup }} className="regional-live-svg raster-map-dynamic-plane absolute inset-0 w-full h-full" />;
});



function snapCameraToDevicePixels(camera: Camera): Camera {
  return snapTransformToDevicePixels(camera, currentDevicePixelRatio());
}

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
  desktopMenuPinned = false,
  mapChromeVisible = false,
  preserveCameraOnSelectionClear = false,
  viewportOrientation = "standard",
  onReady,
  estimatedTrainsEnabled = false,
  estimatedTrainMarkers = [],
  commutePathPreview = null,
  onClearCommutePathPreview,
  isMapActive = true,
  onNetworkChange,
  mapView,
  onMapViewChange,
  selectionAttentionGeneration = 0,
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
  desktopMenuPinned?: boolean;
  mapChromeVisible?: boolean;
  preserveCameraOnSelectionClear?: boolean;
  viewportOrientation?: MapViewportOrientation;
  onReady?: () => void;
  estimatedTrainsEnabled?: boolean;
  estimatedTrainMarkers?: EstimatedTrainMarker[];
  commutePathPreview?: AccountCommutePathPreview | null;
  onClearCommutePathPreview?: () => void;
  isMapActive?: boolean;
  onNetworkChange?: (network: NetworkId) => void;
  mapView?: MapViewPreference;
  onMapViewChange?: (view: MapViewPreference) => void;
  selectionAttentionGeneration?: number;
}) {
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures, networkSegments, stationNodeImpacts, stations } = useDashboardData();
  const regionalMapRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const mapStageRef = useRef<HTMLDivElement>(null);
  const mapControlRailRef = useRef<HTMLDivElement>(null);
  const cameraInitializedRef = useRef(false);
  const cameraAdjustedByUserRef = useRef(false);
  const isMapActiveRef = useRef(isMapActive);
  useEffect(() => {
    isMapActiveRef.current = isMapActive;
  }, [isMapActive]);
  const lastRecenterSignalRef = useRef(recenterSignal);
  const lastViewportOrientationRef = useRef(viewportOrientation);
  const automaticResizeRefitBlockedRef = useRef(false);
  const isGestureActiveRef = useRef(false);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; camera: Camera } | null>(null);
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchGestureRef = useRef<{
    startDistance: number;
    startScale: number;
    mapPointAtMidpoint: { x: number; y: number };
  } | null>(null);
  const [svgMarkup, setSvgMarkup] = useState(() => getRegionalMapMarkup());
  const [readyRasterPlanes, setReadyRasterPlanes] = useState(() => new Set<string>());
  const [overlapBadges, setOverlapBadges] = useState<RegionalOverlapBadge[]>([]);
  const [expandedOverlapBadgeId, setExpandedOverlapBadgeId] = useState<string | null>(null);
  const [overlapChooserLayout, setOverlapChooserLayout] = useState<MapOverlapChooserLayout | null>(null);
  const [overlapChooserSize, setOverlapChooserSize] = useState<{ width: number; height: number } | null>(null);
  const [overlapChooserViewportSize, setOverlapChooserViewportSize] = useState<{ width: number; height: number } | null>(null);
  const [chooserKeepoutRevision, setChooserKeepoutRevision] = useState(0);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [recenterFeedbackKey, setRecenterFeedbackKey] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [fitScale, setFitScale] = useState(0.35);
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

  useEffect(() => {
    automaticResizeRefitBlockedRef.current = Boolean(selection || selectedStationId || commutePathPreview);
  }, [commutePathPreview, selection, selectedStationId]);
  const animTimeoutRef = useRef<number | null>(null);
  const programmaticAnimationFrameRef = useRef<number | null>(null);
  const dragAnimationFrameRef = useRef<number | null>(null);
  const pendingDragPointRef = useRef<{ x: number; y: number } | null>(null);
  const trainMarkerMotionRef = useRef(new Map<string, RegionalTrainMarkerMotionRuntime>());
  const dragMovedRef = useRef(false);
  const pointerActivationRef = useRef<
    { type: "station"; id: string }
    | { type: "impact"; selection: NonNullable<ImpactSelection> }
    | null
  >(null);
  const suppressNextClickRef = useRef(false);
  const wheelCommitTimeoutRef = useRef<number | null>(null);
  const cameraRef = useRef(camera);
  const selectionRef = useRef(selection);
  const selectedStationIdRef = useRef(selectedStationId);
  const selectionAttentionKeyRef = useRef<string | null>(null);
  const selectionIntroCompletedRef = useRef(false);
  const selectionIntroTimerRef = useRef<number | null>(null);
  const readyNotifiedRef = useRef(false);
  const sessionRef = useRef<RegionalOverlaySession | null>(null);
  const lastOverlayInputsRef = useRef<unknown[] | null>(null);
  // Dispose the previous SVG session before layout effects install its replacement.
  // Passive cleanup runs too late and can dispose the newly installed session.
  useLayoutEffect(() => {
    return () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
  }, [svgMarkup]);
  const entranceWasDeferredRef = useRef(false);
  const activeContainerRectRef = useRef<DOMRect | null>(null);
  const lastFocusedTargetKeyRef = useRef<string | null>(null);
  const lastFocusLayoutKeyRef = useRef("");
  const shouldAnimateProgrammaticTransform = !reducedMotion && !mobilePerformanceMode && pageVisible;
  useLayoutEffect(() => {
    selectionRef.current = selection;
    selectedStationIdRef.current = selectedStationId;
  }, [selectedStationId, selection]);

  const logicalViewportSize = useCallback(() => {
    const viewport = viewportRef.current;
    const mapSurface = viewport?.closest<HTMLElement>(".network-map-transition-surface");
    const physicalWidth = viewport?.clientWidth || mapSurface?.clientWidth || 0;
    const physicalHeight = viewport?.clientHeight || mapSurface?.clientHeight || 0;
    return logicalViewportSizeForOrientation(
      physicalWidth,
      physicalHeight,
      viewportOrientation,
    );
  }, [viewportOrientation]);

  const writeMapTransform = useCallback((nextCamera: Camera) => {
    if (mapStageRef.current) {
      mapStageRef.current.style.transform = orientedMapCameraTransform(
        nextCamera,
        viewportOrientation,
        viewportRef.current?.clientWidth ?? 0,
      );
    }
  }, [viewportOrientation]);

  const setMapTransition = useCallback((transition: string) => {
    if (mapStageRef.current) {
      mapStageRef.current.style.transition = transition;
    }
  }, []);

  const setCameraMotionActive = useCallback((active: boolean) => {
    const root = regionalMapRef.current;
    if (!root) return;
    root.dataset.regionalMapCameraMoving = active ? "true" : "false";
  }, []);

  const beginCameraMotion = useCallback(() => {
    setCameraMotionActive(true);
  }, [setCameraMotionActive]);

  const endCameraMotion = useCallback(() => {
    setCameraMotionActive(false);
  }, [setCameraMotionActive]);

  const setUserZoomMotion = useCallback((active: boolean) => {
    const root = regionalMapRef.current;
    if (!root) return;
    root.dataset.mapZoomActive = active ? "true" : "false";
  }, []);

  const setUserGestureMotion = useCallback((active: boolean) => {
    isGestureActiveRef.current = active;
    const root = regionalMapRef.current;
    if (!root) return;
    root.dataset.mapGestureActive = active ? "true" : "false";
  }, []);

  const clearProgrammaticAnimation = useCallback(() => {
    if (programmaticAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(programmaticAnimationFrameRef.current);
      programmaticAnimationFrameRef.current = null;
    }
    if (animTimeoutRef.current !== null) {
      window.clearTimeout(animTimeoutRef.current);
      animTimeoutRef.current = null;
    }
    if (wheelCommitTimeoutRef.current !== null) {
      window.clearTimeout(wheelCommitTimeoutRef.current);
      wheelCommitTimeoutRef.current = null;
    }
  }, []);

  const currentRenderedCamera = useCallback((): Camera | null => {
    if (!mapStageRef.current) return null;
    const computedTransform = window.getComputedStyle(mapStageRef.current).transform;
    if (!computedTransform || computedTransform === "none") return null;
    const matrix = new DOMMatrixReadOnly(computedTransform);
    return snapCameraToDevicePixels(cameraFromOrientedTransformMatrix(
      { a: matrix.a, b: matrix.b, e: matrix.e, f: matrix.f },
      viewportOrientation,
      viewportRef.current?.clientWidth ?? 0,
    ));
  }, [viewportOrientation]);

  const cancelCameraAnimation = useCallback(() => {
    const renderedCamera = currentRenderedCamera();
    clearProgrammaticAnimation();
    setUserZoomMotion(false);
    setMapTransition(shouldAnimateProgrammaticTransform ? "transform 0.1s ease-out" : "none");
    if (!renderedCamera) return;
    cameraRef.current = renderedCamera;
    writeMapTransform(renderedCamera);
    setCamera(renderedCamera);
  }, [clearProgrammaticAnimation, currentRenderedCamera, setMapTransition, setUserZoomMotion, shouldAnimateProgrammaticTransform, writeMapTransform]);

  const animateCameraTo = useCallback((
    targetCamera: Camera,
    nextFitScale?: number,
    motion: CameraMotionOptions = {},
  ) => {
    cameraRef.current = targetCamera;
    clearProgrammaticAnimation();
    setUserZoomMotion(false);

    if (!mapStageRef.current || !shouldAnimateProgrammaticTransform) {
      setMapTransition("none");
      writeMapTransform(targetCamera);
      if (nextFitScale !== undefined) setFitScale(nextFitScale);
      setCamera(targetCamera);
      endCameraMotion();
      return;
    }

    const durationMs = motion.durationMs ?? DEFAULT_CAMERA_MOTION_DURATION_MS;
    const easing = motion.easing ?? DEFAULT_CAMERA_MOTION_EASING;
    beginCameraMotion();
    setMapTransition(`transform ${durationMs}ms ${easing}`);
    programmaticAnimationFrameRef.current = window.requestAnimationFrame(() => {
      programmaticAnimationFrameRef.current = null;
      writeMapTransform(targetCamera);
      animTimeoutRef.current = window.setTimeout(() => {
        animTimeoutRef.current = null;
        setMapTransition("none");
        if (nextFitScale !== undefined) setFitScale(nextFitScale);
        setCamera({ ...cameraRef.current });
        endCameraMotion();
      }, durationMs + 50);
    });
  }, [beginCameraMotion, clearProgrammaticAnimation, endCameraMotion, setMapTransition, setUserZoomMotion, shouldAnimateProgrammaticTransform, writeMapTransform]);

  const snapCameraToNetwork = useCallback((targetCamera: Camera, nextFitScale: number) => {
    clearProgrammaticAnimation();
    setUserZoomMotion(false);
    setMapTransition("none");
    cameraRef.current = targetCamera;
    writeMapTransform(targetCamera);
    setFitScale((current) => current === nextFitScale ? current : nextFitScale);
    setCamera((current) => (
      current.x === targetCamera.x
      && current.y === targetCamera.y
      && current.scale === targetCamera.scale
        ? current
        : targetCamera
    ));
    endCameraMotion();
  }, [clearProgrammaticAnimation, endCameraMotion, setMapTransition, setUserZoomMotion, writeMapTransform]);

  useEffect(() => {
    return () => {
      clearProgrammaticAnimation();
      if (dragAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(dragAnimationFrameRef.current);
      }
      if (wheelCommitTimeoutRef.current !== null) {
        window.clearTimeout(wheelCommitTimeoutRef.current);
      }
      endCameraMotion();
      setUserZoomMotion(false);
      setUserGestureMotion(false);
    };
  }, [clearProgrammaticAnimation, endCameraMotion, setUserGestureMotion, setUserZoomMotion]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const mapSurface = viewport?.closest<HTMLElement>(".network-map-transition-surface");
    const shell = viewport?.closest<HTMLElement>(".linewatch-shell");
    const rail = mapControlRailRef.current ?? shell?.querySelector<HTMLElement>(".desktop-map-control-rail");
    const impactBadges = shell?.querySelector<HTMLElement>(".desktop-status-chip-row-container");
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
    if (impactBadges) observer.observe(impactBadges);
    const legend = document.querySelector<HTMLElement>(".desktop-map-legend");
    if (legend) observer.observe(legend);
    window.addEventListener("resize", measureDesktopInsets);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureDesktopInsets);
    };
  }, [mapChromeVisible]);

  const fittedCamera = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return null;
    const mobileInsets = viewportOrientation === "standard"
      ? readMobileMapFrameInsets(viewport) : null;
    if (mobileInsets) {
      const horizontalInset = Math.min(32, Math.max(12, width * REGIONAL_MAP_MOBILE_INSET_RATIO));
      const insets = { left: horizontalInset, right: horizontalInset, ...mobileInsets };
      const frame = computeBoundedMapFrame(
        width,
        height,
        REGIONAL_MAP_CONTENT_BOUNDS,
        insets,
      );
      const focus = computeInsetViewportFocus(width, height, insets);
      const frameScale = REGIONAL_MAP_DEFAULT_FRAME_SCALE * 1.15;
      const unionX = readMapStationCenterX(viewport, "union");
      const defaultFrame = {
        x: unionX !== null ? focus.focusX - unionX * frame.scale * frameScale
          : focus.focusX - (focus.focusX - frame.x) * frameScale,
        y: focus.focusY - (focus.focusY - frame.y) * frameScale,
        scale: frame.scale * frameScale,
      };
      return {
        camera: snapCameraToDevicePixels(defaultFrame),
        scale: defaultFrame.scale,
        focus: { x: focus.focusX, y: focus.focusY },
      };
    }

    const desktopFrame = computeDesktopMapFrame({
      viewportWidth: width,
      viewportHeight: height,
      bounds: REGIONAL_MAP_CONTENT_BOUNDS,
      horizontalInsetRatio: REGIONAL_MAP_HORIZONTAL_INSET_RATIO,
      minHorizontalInset: 32,
      scaleMultiplier: REGIONAL_MAP_DESKTOP_FRAME_SCALE,
    });
    return {
      camera: snapCameraToDevicePixels(desktopFrame),
      scale: desktopFrame.scale,
      focus: {
        x: width / 2,
        y: height / 2,
      },
    };
  }, [logicalViewportSize, viewportOrientation]);

  const fitNetwork = useCallback(() => {
    const fitted = fittedCamera();
    if (!fitted) return;
    cameraInitializedRef.current = true;
    animateCameraTo(fitted.camera, fitted.scale);
  }, [animateCameraTo, fittedCamera]);

  const refitUntouchedNetwork = useCallback(() => {
    if (document.visibilityState === "hidden" || !isMapActiveRef.current) return;
    if (!cameraInitializedRef.current || cameraAdjustedByUserRef.current) return;
    const fitted = fittedCamera();
    if (!fitted) return;
    if (
      Math.abs(cameraRef.current.x - fitted.camera.x) < 0.5 &&
      Math.abs(cameraRef.current.y - fitted.camera.y) < 0.5 &&
      Math.abs(cameraRef.current.scale - fitted.camera.scale) < 0.0001
    ) {
      setFitScale((current) => fitted.scale !== current ? fitted.scale : current);
      return;
    }
    clearProgrammaticAnimation();
    setMapTransition("none");
    cameraRef.current = fitted.camera;
    writeMapTransform(fitted.camera);
    setFitScale(fitted.scale);
    setCamera(fitted.camera);
  }, [clearProgrammaticAnimation, fittedCamera, setMapTransition, writeMapTransform]);

  useEffect(() => {
    if (!cameraInitializedRef.current || cameraAdjustedByUserRef.current) return;
    refitUntouchedNetwork();
  }, [refitUntouchedNetwork]);

  useLayoutEffect(() => observeMobileMapFrame(viewportRef.current, () => {
    if (!isMapActive) return;
    if (window.innerWidth < 768 && !automaticResizeRefitBlockedRef.current) refitUntouchedNetwork();
  }), [isMapActive, refitUntouchedNetwork, mapChromeVisible]);

  const resetNetworkCamera = useCallback(() => {
    cameraAdjustedByUserRef.current = false;
    const fitted = fittedCamera();
    if (!fitted) return false;
    cameraInitializedRef.current = true;
    // Commit Center directly. Opacity-based fade layers can force Android
    // Chromium to promote and retile the already transformed map at its fitted
    // scale, so visual feedback is painted separately by the viewport wash.
    snapCameraToNetwork(fitted.camera, fitted.scale);
    return true;
  }, [fittedCamera, snapCameraToNetwork]);

  const handleFitNetwork = useCallback(() => {
    clearMapViewport("regional");
    if (resetNetworkCamera() && !reducedMotion) {
      setRecenterFeedbackKey((current) => current + 1);
    }
  }, [reducedMotion, resetNetworkCamera]);

  const restoreViewport = useMapViewportPersistence("regional", camera, fitScale, logicalViewportSize,
    () => cameraInitializedRef.current && cameraAdjustedByUserRef.current && !selection && !selectedStationId && !commutePathPreview && viewportOrientation === "standard");
  const restoreSavedCamera = useCallback(() => {
    if (selection || selectedStationId || commutePathPreview || viewportOrientation !== "standard") return false;
    const fitted = fittedCamera();
    if (!fitted) return false;
    const saved = restoreViewport(fitted.scale);
    if (!saved) return false;
    cameraInitializedRef.current = true;
    cameraAdjustedByUserRef.current = true;
    setCameraReady(true);
    snapCameraToNetwork(saved, fitted.scale);
    return true;
  }, [commutePathPreview, fittedCamera, restoreViewport, selectedStationId, selection, snapCameraToNetwork, viewportOrientation]);

  const stageInitialEntrance = useCallback(() => {
    if (!svgMarkup) return;
    if (restoreSavedCamera()) return;
    const fitted = fittedCamera();
    if (!fitted) return;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const entryCamera = animateInitialEntrance
      ? snapCameraToDevicePixels(
          computeFittedCameraFlyInStart(fitted.camera, width, height, fitted.focus),
        )
      : fitted.camera;

    cameraInitializedRef.current = true;
    setCameraReady(true);
    cameraRef.current = entryCamera;
    setMapTransition("none");
    writeMapTransform(entryCamera);
    setFitScale(fitted.scale);
    setCamera(entryCamera);
  }, [animateInitialEntrance, fittedCamera, logicalViewportSize, setMapTransition, svgMarkup, writeMapTransform, restoreSavedCamera]);

  const completeStagedEntrance = useCallback(() => {
    if (restoreSavedCamera()) return;
    const fitted = fittedCamera();
    if (!fitted) return;
    if (animateInitialEntrance && shouldAnimateProgrammaticTransform) {
      animateCameraTo(fitted.camera, fitted.scale);
      return;
    }
    snapCameraToNetwork(fitted.camera, fitted.scale);
  }, [animateCameraTo, animateInitialEntrance, fittedCamera, shouldAnimateProgrammaticTransform, snapCameraToNetwork, restoreSavedCamera]);

  const focusTargetKey = useMemo(() => {
    if (selection) return `${selection.kind}:${selection.id}:${selectionAttentionGeneration}`;
    if (selectedStationId) return `station:${selectedStationId}`;
    if (commutePathPreview) return `commute:${commutePathPreview.id}:${commutePathPreview.legId}`;
    return null;
  }, [commutePathPreview, selection, selectedStationId, selectionAttentionGeneration]);

  // The mounted map already fits its current layout. Only new commands
  // should reset it; replaying a stored command interrupts network entry.
  const lastHandledLayoutResetSignalRef = useRef(layoutResetSignal ?? 0);

  useEffect(() => {
    if (!layoutResetSignal || !svgMarkup) return;
    if (lastHandledLayoutResetSignalRef.current === layoutResetSignal) return;
    lastHandledLayoutResetSignalRef.current = layoutResetSignal;
    if (focusTargetKey) return;
    const resetTimer = window.setTimeout(() => resetNetworkCamera(), 320);
    return () => window.clearTimeout(resetTimer);
  }, [focusTargetKey, resetNetworkCamera, layoutResetSignal, svgMarkup]);

  const initializeMapCamera = useCallback(() => {
    if (cameraInitializedRef.current || !svgMarkup) return;
    if (restoreSavedCamera()) return;
    const fitted = fittedCamera();
    if (!fitted) return;
    cameraInitializedRef.current = true;
    setCameraReady(true);
    if (focusTargetKey) {
      cameraRef.current = fitted.camera;
      setMapTransition("none");
      writeMapTransform(fitted.camera);
      setFitScale(fitted.scale);
      setCamera(fitted.camera);
      return;
    }
    if (animateInitialEntrance && shouldAnimateProgrammaticTransform) {
      const { width, height } = logicalViewportSize();
      const entryCamera = snapCameraToDevicePixels(
        computeFittedCameraFlyInStart(fitted.camera, width, height, fitted.focus),
      );
      cameraRef.current = entryCamera;
      setMapTransition("none");
      writeMapTransform(entryCamera);
      setCamera(entryCamera);
      programmaticAnimationFrameRef.current = window.requestAnimationFrame(() => {
        programmaticAnimationFrameRef.current = null;
        animateCameraTo(fitted.camera, fitted.scale);
      });
      return;
    }
    setMapTransition("none");
    cameraRef.current = fitted.camera;
    writeMapTransform(fitted.camera);
    setFitScale(fitted.scale);
    setCamera(fitted.camera);
  }, [animateCameraTo, animateInitialEntrance, fittedCamera, focusTargetKey, logicalViewportSize, setMapTransition, shouldAnimateProgrammaticTransform, svgMarkup, writeMapTransform, restoreSavedCamera]);

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

  useEffect(() => {
    if (!svgMarkup || isMapActive || !useMobileRendering
      || typeof window.requestIdleCallback !== "function") return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const samples = primeRegionalRouteSamples(viewport);
    let idleCallback: number | null = null;
    let completed = false;
    const run = (deadline: IdleDeadline) => {
      idleCallback = null;
      if (document.querySelector('[data-map-gesture-active="true"]')) return;
      // Keep each batch short enough for new native touch input to interrupt.
      const started = performance.now();
      while (deadline.timeRemaining() > 4 && performance.now() - started < 4) {
        if (samples.next().done) { completed = true; return; }
      }
      schedule();
    };
    const schedule = () => {
      if (completed || idleCallback !== null
        || document.querySelector('[data-map-gesture-active="true"]')) return;
      idleCallback = window.requestIdleCallback(run);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-map-gesture-active"] });
    schedule();
    return () => {
      completed = true;
      observer.disconnect();
      if (idleCallback !== null) window.cancelIdleCallback(idleCallback);
      samples.return(undefined);
    };
  }, [isMapActive, svgMarkup, useMobileRendering]);

  useLayoutEffect(() => {
    // Build live overlays once when this diagram becomes active. Preparing an
    // inactive diagram otherwise builds them again during the network swap.
    if (!svgMarkup || !isMapActive) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const inputs = [activeAlerts, delays, reducedSpeedZones, plannedClosures,
      networkSegments, stationNodeImpacts, stations, commutePathPreview,
      mapEffectMotionPaused, useMobileRendering, mapLabelFontReady, svgMarkup];
    if (sessionRef.current && lastOverlayInputsRef.current?.every((value, index) => value === inputs[index])) return;

    if (!sessionRef.current) {
      sessionRef.current = installRegionalOverlaySession(viewport, {
        isPointerGestureActive: () => activePointersRef.current.size > 0,
        onHoverStationId: (stationId) => {
          setHoveredStationLabel((current) => {
            if (!mapLabelFontReady) return null;
            if (current?.stationId === stationId) return current;
            const root = viewportRef.current;
            return root ? regionalStationLabelHover(root, stationId) : null;
          });
        },
      });
    }

    const result = sessionRef.current?.update({
      activeAlerts,
      delays,
      reducedSpeedZones,
      plannedClosures,
      networkSegments,
      stationNodeImpacts,
      stations,
      commutePathPreview,
      reducedMotion: mapEffectMotionPaused || useMobileRendering,
      selectedStationId: selectedStationIdRef.current,
      selection: selectionRef.current,
      selectionIntroCompleted: selectionIntroCompletedRef.current,
    });

    if (result) {
      lastOverlayInputsRef.current = inputs;
      setOverlapBadges(result.overlapBadges);
    }
  }, [
    activeAlerts,
    commutePathPreview,
    delays,
    isMapActive,
    mapLabelFontReady,
    networkSegments,
    plannedClosures,
    mapEffectMotionPaused,
    reducedSpeedZones,
    stationNodeImpacts,
    stations,
    svgMarkup,
    useMobileRendering,
  ]);

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

    const documentNode = markerLayer.ownerDocument;
    for (const marker of estimatedTrainMarkers) {
      const segment = networkSegments.find((item) => item.id === marker.segmentId);
      if (!segment) continue;
      const frame = regionalTrainMarkerFrame(documentNode, segment, marker);
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
        group,
        marker,
        networkSegments,
        documentNode,
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
        stageInitialEntrance();
      } else if (entranceWasDeferredRef.current) {
        entranceWasDeferredRef.current = false;
        completeStagedEntrance();
      } else {
        initializeMapCamera();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [completeStagedEntrance, deferInitialEntrance, initializeMapCamera, stageInitialEntrance]);

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
    handleFitNetwork();
  }, [handleFitNetwork, recenterSignal]);

  useEffect(() => {
    if (lastViewportOrientationRef.current === viewportOrientation) return;
    lastViewportOrientationRef.current = viewportOrientation;
    if (!cameraInitializedRef.current) return;
    cameraAdjustedByUserRef.current = false;
    const frame = window.requestAnimationFrame(fitNetwork);
    return () => window.cancelAnimationFrame(frame);
  }, [fitNetwork, viewportOrientation]);

  const lastRegionalDimensionsRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const reconcileRegionalViewport = useCallback(() => {
    if (document.visibilityState === "hidden") return;
    const viewport = viewportRef.current;
    if (!viewport || !isMapActiveRef.current || !cameraInitializedRef.current) return;
    const physicalWidth = viewport.clientWidth;
    const physicalHeight = viewport.clientHeight;
    if (physicalWidth <= 0 || physicalHeight <= 0) return;

    const { width, height } = logicalViewportSizeForOrientation(
      physicalWidth,
      physicalHeight,
      viewportOrientation,
    );

    const prev = lastRegionalDimensionsRef.current;
    const diffW = Math.abs(prev.width - width);
    const diffH = Math.abs(prev.height - height);

    if (diffW < 1 && diffH < 1) return;

    const isUntouched = !cameraAdjustedByUserRef.current;

    if (prev.width <= 0 || prev.height <= 0) {
      lastRegionalDimensionsRef.current = { width, height };
      if (isUntouched) {
        refitUntouchedNetwork();
      }
      return;
    }

    if (isUntouched) {
      lastRegionalDimensionsRef.current = { width, height };
      refitUntouchedNetwork();
      return;
    }

    // Explored camera: preserve zoom and center current geographic focus in new usable rectangle
    const prevCenterX = prev.width / 2;
    const prevCenterY = prev.height / 2;
    const mapPoint = mapPointFromViewportPoint(cameraRef.current, { x: prevCenterX, y: prevCenterY });
    const nextCenterX = width / 2;
    const nextCenterY = height / 2;
    const nextCamera = transformForMapPointAtViewportPoint(
      mapPoint,
      { x: nextCenterX, y: nextCenterY },
      cameraRef.current.scale,
    );
    const snapped = snapTransformToDevicePixels(nextCamera, currentDevicePixelRatio());
    cameraRef.current = snapped;
    writeMapTransform(snapped);
    setCamera({ ...snapped });
    lastRegionalDimensionsRef.current = { width, height };
  }, [cameraInitializedRef, cameraAdjustedByUserRef, refitUntouchedNetwork, viewportOrientation, writeMapTransform]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (document.visibilityState === "hidden" || !isMapActiveRef.current) return;
      if (!cameraInitializedRef.current) {
        initializeMapCamera();
        return;
      }
      reconcileRegionalViewport();
    });
    observer.observe(viewport);
    const mapSurface = viewport.closest<HTMLElement>(".network-map-transition-surface");
    if (mapSurface) observer.observe(mapSurface);
    return () => observer.disconnect();
  }, [initializeMapCamera, reconcileRegionalViewport]);

  useEffect(() => {
    const handleWindowResize = () => {
      if (automaticResizeRefitBlockedRef.current) return;
      refitUntouchedNetwork();
      reconcileRegionalViewport();
    };
    let resumeFrame: number | null = null;
    const handleVisibilityChange = () => {
      if (resumeFrame !== null) window.cancelAnimationFrame(resumeFrame);
      resumeFrame = null;
      if (document.visibilityState !== "visible") return;
      // Reconcile a real window resize that happened while hidden. Unchanged
      // dimensions leave the camera alone rather than fitting it again.
      resumeFrame = window.requestAnimationFrame(() => {
        resumeFrame = null;
        reconcileRegionalViewport();
      });
    };
    window.addEventListener("resize", handleWindowResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (resumeFrame !== null) window.cancelAnimationFrame(resumeFrame);
    };
  }, [reconcileRegionalViewport, refitUntouchedNetwork]);

  useEffect(() => {
    sessionRef.current?.updateStationSelection(selectedStationId, selectionIntroCompletedRef.current);
  }, [selectedStationId, svgMarkup]);

  useLayoutEffect(() => {
    sessionRef.current?.updateSelection({
      selection,
      commutePathPreview,
      selectionIntroCompleted: selectionIntroCompletedRef.current,
    });
  }, [commutePathPreview, selection, svgMarkup]);

  useLayoutEffect(() => {
    const nextKey = focusTargetKey
      ? `${focusTargetKey}:${selectionAttentionGeneration}`
      : null;
    if (selectionAttentionKeyRef.current === nextKey) return;

    selectionAttentionKeyRef.current = nextKey;
    selectionIntroCompletedRef.current = false;
    if (selectionIntroTimerRef.current !== null) {
      window.clearTimeout(selectionIntroTimerRef.current);
      selectionIntroTimerRef.current = null;
    }

    const root = viewportRef.current;
    root?.querySelectorAll(".selection-intro-complete")
      .forEach((element) => element.classList.remove("selection-intro-complete"));
    if (!nextKey) return;

    selectionIntroTimerRef.current = window.setTimeout(() => {
      selectionIntroTimerRef.current = null;
      if (selectionAttentionKeyRef.current !== nextKey) return;
      selectionIntroCompletedRef.current = true;
      sessionRef.current?.markSelectionIntroComplete();
    }, SELECTION_INTRO_DURATION_MS);
  }, [focusTargetKey, selectionAttentionGeneration]);

  useEffect(() => () => {
    if (selectionIntroTimerRef.current !== null) {
      window.clearTimeout(selectionIntroTimerRef.current);
    }
  }, []);

  const selectedMapElements = useCallback(() => {
    const root = viewportRef.current;
    if (!root) return [];
    if (commutePathPreview && selection) {
      return [
        ...root.querySelectorAll<SVGGraphicsElement>(
          `[data-selected-commute-impact-overlay="${CSS.escape(selection.id)}"], [data-selected-impact-emphasis="${CSS.escape(selection.id)}"], [data-regional-impact-id="${CSS.escape(selection.id)}"], [data-regional-station-selection-id="${CSS.escape(selection.id)}"]`,
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
        `[data-regional-impact-kind="${selection.kind}"][data-regional-impact-id="${CSS.escape(selection.id)}"]`,
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

    const current = cameraRef.current;
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
    const currentFitted = fittedCamera();
    const effectiveFitScale = currentFitted?.scale ?? fitScale ?? 0.35;
    const preferredTargetScale = clampPanZoomScale(effectiveFitScale * (isMobile ? 3.8 : 1.8), effectiveFitScale);
    const focusPadding = isMobile ? 24 : 40;
    const topPillBottom = isMobile ? readMobilePillBottom(viewport) : 0;
    const mobileStationTop = isMobile && selectedStationId
      ? readMobileStationSubmenuTop(viewport, logicalHeight)
      : logicalHeight;
    const mobileImpactTop = isMobile && selection
      ? readMobileImpactInspectorTop(viewport, logicalHeight)
      : logicalHeight;

    const focusInsets = {
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

    if (!isMobile) {
      const leftOcclusion = readDesktopLeftOcclusion(viewport, desktopMenuPinned, 16);
      if (leftOcclusion > 0) {
        focusInsets.left = Math.max(focusInsets.left, leftOcclusion);
      }
    }

    if (selectedStationId) {
      const targetScale = preferredTargetScale;
      const focusX = isMobile
        ? logicalWidth / 2
        : (logicalWidth + focusInsets.left - focusInsets.right) / 2;
      const focusY =
        isMobile && viewportOrientation !== "rotated-landscape"
          ? (topPillBottom + mobileStationTop) / 2
          : (viewportOrientation === "rotated-landscape" ? logicalHeight * 0.34 : logicalHeight / 2);

      animateCameraTo(snapCameraToDevicePixels({
        x: focusX - mapX * targetScale,
        y: focusY - mapY * targetScale,
        scale: targetScale,
      }), effectiveFitScale);
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
    );
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

    animateCameraTo(snapCameraToDevicePixels({
      x: focusX - mapX * targetScale,
      y: focusY - mapY * targetScale,
      scale: targetScale,
    }), effectiveFitScale);
    return true;
  }, [
    animateCameraTo,
    desktopMapBottomInset,
    desktopMapTopInset,
    desktopMenuPinned,
    fitScale,
    fittedCamera,
    logicalViewportSize,
    selectedMapElements,
    selectedStationId,
    selection,
    viewportOrientation,
  ]);

  useEffect(() => {
    if (!cameraInitializedRef.current || !svgMarkup) return;
    const layoutKey = `${layoutResetSignal ?? 0}:${desktopMenuPinned ? "pinned" : "free"}:${desktopMapTopInset}:${desktopMapBottomInset}:${viewportOrientation}`;

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
  }, [
    desktopMapBottomInset,
    desktopMapTopInset,
    desktopMenuPinned,
    fitNetwork,
    focusSelectedMapElements,
    focusTargetKey,
    layoutResetSignal,
    preserveCameraOnSelectionClear,
    selectedStationId,
    svgMarkup,
    viewportOrientation,
  ]);

  const scheduleCameraCommit = useCallback(() => {
    if (wheelCommitTimeoutRef.current !== null) {
      window.clearTimeout(wheelCommitTimeoutRef.current);
    }
    wheelCommitTimeoutRef.current = window.setTimeout(() => {
      wheelCommitTimeoutRef.current = null;
      setCamera({ ...cameraRef.current });
      setMapTransition(shouldAnimateProgrammaticTransform ? "transform 0.1s ease-out" : "none");
      setUserZoomMotion(false);
    }, 140);
  }, [setMapTransition, setUserZoomMotion, shouldAnimateProgrammaticTransform]);

  const zoomAtCenter = useCallback((factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    cameraAdjustedByUserRef.current = true;
    clearProgrammaticAnimation();
    endCameraMotion();
    setUserZoomMotion(true);
    setMapTransition(shouldAnimateProgrammaticTransform ? "transform 0.1s ease-out" : "none");
    const { width, height } = logicalViewportSize();
    const centerX = width / 2;
    const centerY = height / 2;
    const current = cameraRef.current;
    const nextScale = clampPanZoomScale(current.scale * factor, fitScale);
    const ratio = current.scale > 0 ? nextScale / current.scale : 1;
    const nextCamera = snapCameraToDevicePixels({
      x: centerX - (centerX - current.x) * ratio,
      y: centerY - (centerY - current.y) * ratio,
      scale: nextScale,
    });
    cameraRef.current = nextCamera;
    writeMapTransform(nextCamera);
    setCamera(nextCamera);
    scheduleCameraCommit();
  }, [clearProgrammaticAnimation, endCameraMotion, fitScale, logicalViewportSize, scheduleCameraCommit, setCamera, setMapTransition, setUserZoomMotion, shouldAnimateProgrammaticTransform, writeMapTransform]);

  const lastZoomInSignalRef = useRef(zoomInSignal);
  useEffect(() => {
    if (zoomInSignal === undefined || zoomInSignal === lastZoomInSignalRef.current) return;
    lastZoomInSignalRef.current = zoomInSignal;
    zoomAtCenter(1.25);
  }, [zoomAtCenter, zoomInSignal]);

  const lastZoomOutSignalRef = useRef(zoomOutSignal);
  useEffect(() => {
    if (zoomOutSignal === undefined || zoomOutSignal === lastZoomOutSignalRef.current) return;
    lastZoomOutSignalRef.current = zoomOutSignal;
    zoomAtCenter(1 / 1.25);
  }, [zoomAtCenter, zoomOutSignal]);

  const zoomToScale = useCallback((targetRelativeScale: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    cameraAdjustedByUserRef.current = true;
    clearProgrammaticAnimation();
    endCameraMotion();
    setUserZoomMotion(true);
    setMapTransition("none");
    const { width, height } = logicalViewportSize();
    const centerX = width / 2;
    const centerY = height / 2;
    const current = cameraRef.current;
    const nextScale = clampPanZoomScale(targetRelativeScale * fitScale, fitScale);
    const ratio = current.scale > 0 ? nextScale / current.scale : 1;
    const nextCamera = snapCameraToDevicePixels({
      x: centerX - (centerX - current.x) * ratio,
      y: centerY - (centerY - current.y) * ratio,
      scale: nextScale,
    });
    cameraRef.current = nextCamera;
    writeMapTransform(nextCamera);
    setCamera(nextCamera);
    scheduleCameraCommit();
  }, [clearProgrammaticAnimation, endCameraMotion, fitScale, logicalViewportSize, scheduleCameraCommit, setCamera, setMapTransition, setUserZoomMotion, writeMapTransform]);

  const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (isMapWheelScrollRegionTarget(event.target)) return;
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;
    cameraAdjustedByUserRef.current = true;

    clearProgrammaticAnimation();
    endCameraMotion();
    setUserZoomMotion(true);
    // Interpolate coarse mouse-wheel notches while keeping the direct DOM write
    // path used by high-frequency wheels and trackpads.
    setMapTransition(shouldAnimateProgrammaticTransform ? "transform 0.1s ease-out" : "none");

    const pointer = clientPointToLogicalViewportPoint(
      { x: event.clientX, y: event.clientY },
      viewport.getBoundingClientRect(),
      viewportOrientation,
    );
    const pointerX = pointer.x;
    const pointerY = pointer.y;
    const current = cameraRef.current;
    const delta = -event.deltaY * 0.001;
    const nextScale = clampPanZoomScale(current.scale * (1 + delta), fitScale);
    const scaleRatio = nextScale / current.scale;
    const nextCamera = snapCameraToDevicePixels({
      x: pointerX - (pointerX - current.x) * scaleRatio,
      y: pointerY - (pointerY - current.y) * scaleRatio,
      scale: nextScale,
    });

    cameraRef.current = nextCamera;
    writeMapTransform(nextCamera);

    if (wheelCommitTimeoutRef.current !== null) {
      window.clearTimeout(wheelCommitTimeoutRef.current);
    }
    wheelCommitTimeoutRef.current = window.setTimeout(() => {
      wheelCommitTimeoutRef.current = null;
      setCamera({ ...cameraRef.current });
      setUserZoomMotion(false);
    }, 80);
  }, [clearProgrammaticAnimation, endCameraMotion, fitScale, setMapTransition, setUserZoomMotion, shouldAnimateProgrammaticTransform, viewportOrientation, writeMapTransform]);

  const applyActiveGesture = useCallback(() => {
    const pointers = [...activePointersRef.current.values()];
    const pinch = pinchGestureRef.current;
    let nextCamera: Camera | null = null;

    if (pinch && pointers.length >= 2) {
      const [first, second] = pointers;
      const distance = distanceBetweenPoints(first, second);
      if (pinch.startDistance > 0) {
        const midpoint = midpointBetweenPoints(first, second);
        const nextScale = clampPanZoomScale(
          pinch.startScale * (distance / pinch.startDistance),
          fitScale,
        );
        nextCamera = snapCameraToDevicePixels(
          transformForMapPointAtViewportPoint(pinch.mapPointAtMidpoint, midpoint, nextScale),
        );
      }
    } else {
      const drag = dragRef.current;
      const point = pendingDragPointRef.current;
      if (drag && point) {
        nextCamera = snapCameraToDevicePixels({
          ...drag.camera,
          x: drag.camera.x + point.x - drag.x,
          y: drag.camera.y + point.y - drag.y,
        });
      }
    }

    if (!nextCamera) return;
    cameraRef.current = nextCamera;
    writeMapTransform(nextCamera);
  }, [fitScale, writeMapTransform]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    cancelCameraAnimation();
    // Direct manipulation uses the shared gesture-active paint contract. Do
    // not apply the stronger programmatic-flight simplification, which removes
    // alert glows while a rider is simply dragging the map.
    endCameraMotion();
    const rect = event.currentTarget.getBoundingClientRect();
    activeContainerRectRef.current = rect;
    const point = clientPointToLogicalViewportPoint(
      { x: event.clientX, y: event.clientY },
      rect,
      viewportOrientation,
    );

    if (activePointersRef.current.size === 0) {
      const target = event.target instanceof Element ? event.target : null;
      const impact = target?.closest<SVGElement>("[data-regional-impact-kind]");
      const station = target?.closest<SVGElement>("[data-regional-station-id]");
      pointerActivationRef.current = impact?.dataset.regionalImpactKind && impact.dataset.regionalImpactId
        ? {
            type: "impact",
            selection: nextRegionalPointerImpactSelection(
              event.currentTarget,
              impact,
              selection,
            ),
          }
        : station?.dataset.regionalStationId
          ? { type: "station", id: station.dataset.regionalStationId }
          : null;
      dragMovedRef.current = false;
      dragRef.current = { pointerId: event.pointerId, x: point.x, y: point.y, camera: cameraRef.current };
    }

    activePointersRef.current.set(event.pointerId, point);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture can fail when the pointer has already been released. The
      // map gesture state still needs to pause overlay motion.
    }
    pendingDragPointRef.current = point;

    if (activePointersRef.current.size >= 2) {
      cameraAdjustedByUserRef.current = true;
      const [first, second] = [...activePointersRef.current.values()];
      const midpoint = midpointBetweenPoints(first, second);
      pinchGestureRef.current = {
        startDistance: distanceBetweenPoints(first, second),
        startScale: cameraRef.current.scale,
        mapPointAtMidpoint: mapPointFromViewportPoint(cameraRef.current, midpoint),
      };
      dragRef.current = null;
      pointerActivationRef.current = null;
      dragMovedRef.current = true;
    }
    setUserGestureMotion(true);
  }, [cancelCameraAnimation, endCameraMotion, selection, setUserGestureMotion, viewportOrientation]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(event.pointerId)) return;
    const rect = activeContainerRectRef.current ?? event.currentTarget.getBoundingClientRect();
    const point = clientPointToLogicalViewportPoint(
      { x: event.clientX, y: event.clientY },
      rect,
      viewportOrientation,
    );
    activePointersRef.current.set(event.pointerId, point);
    pendingDragPointRef.current = point;

    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId && exceedsMapTapMovement(drag, point, 8)) {
      cameraAdjustedByUserRef.current = true;
      dragMovedRef.current = true;
      pointerActivationRef.current = null;
    }
    if (dragAnimationFrameRef.current !== null) return;
    dragAnimationFrameRef.current = window.requestAnimationFrame(() => {
      dragAnimationFrameRef.current = null;
      applyActiveGesture();
    });
  }, [applyActiveGesture, viewportOrientation]);

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(event.pointerId)) return;
    if (dragAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(dragAnimationFrameRef.current);
      dragAnimationFrameRef.current = null;
    }
    applyActiveGesture();
    activePointersRef.current.delete(event.pointerId);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Pointer capture may already be released by the browser during cancellation.
    }

    const remainingPointers = [...activePointersRef.current.entries()];
    if (remainingPointers.length === 1) {
      const [pointerId, point] = remainingPointers[0];
      pinchGestureRef.current = null;
      pendingDragPointRef.current = point;
      dragRef.current = { pointerId, x: point.x, y: point.y, camera: cameraRef.current };
      return;
    }
    if (remainingPointers.length > 1) {
      const [, first] = remainingPointers[0];
      const [, second] = remainingPointers[1];
      const midpoint = midpointBetweenPoints(first, second);
      pinchGestureRef.current = {
        startDistance: distanceBetweenPoints(first, second),
        startScale: cameraRef.current.scale,
        mapPointAtMidpoint: mapPointFromViewportPoint(cameraRef.current, midpoint),
      };
      return;
    }

    pinchGestureRef.current = null;
    pendingDragPointRef.current = null;
    dragRef.current = null;
    activeContainerRectRef.current = null;
    const activation = pointerActivationRef.current;
    pointerActivationRef.current = null;
    if (event.type === "pointerup" && !dragMovedRef.current && activation) {
      suppressNextClickRef.current = true;
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 450);
      if (activation.type === "station") {
        onSelectStationId(activation.id);
      } else {
        onSelectImpact(activation.selection);
      }
    } else if (event.type === "pointerup" && !dragMovedRef.current && !activation) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest(".overlap-indicator, [data-regional-impact-kind], [data-regional-station-id], button, [role='button'], [data-map-chooser-keepout]")) {
        onSelectImpact(null);
        onSelectStationId(null);
      }
    }
    setCamera({ ...cameraRef.current });
    setUserGestureMotion(false);
    endCameraMotion();
  }, [applyActiveGesture, endCameraMotion, onSelectImpact, onSelectStationId, setUserGestureMotion]);

  const activateTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return;
    const impact = target.closest<SVGElement>("[data-regional-impact-kind]");
    if (impact?.dataset.regionalImpactKind && impact.dataset.regionalImpactId) {
      onSelectImpact({ kind: impact.dataset.regionalImpactKind as NonNullable<ImpactSelection>["kind"], id: impact.dataset.regionalImpactId });
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
    sessionRef.current?.setExternalImpactsHover(impacts, hovered);
  }, []);

  const closeRegionalOverlapChooser = useCallback(() => {
    const badge = overlapBadges.find((candidate) => candidate.markerId === expandedOverlapBadgeId);
    if (badge) setRegionalOverlapImpactsHovered(badge.impacts, false);
    setExpandedOverlapBadgeId(null);
    setOverlapChooserLayout(null);
    setOverlapChooserSize(null);
    setOverlapChooserViewportSize(null);
  }, [expandedOverlapBadgeId, overlapBadges, setRegionalOverlapImpactsHovered]);

  const positionRegionalOverlapChooser = useCallback((badge: RegionalOverlapBadge) => {
    const viewport = viewportRef.current;
    const marker = viewport ? regionalOverlapMarker(viewport, badge.markerId) : null;
    if (!viewport || !marker) return false;
    const viewportRect = viewport.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const logicalViewportSize = logicalViewportSizeForOrientation(
      viewportRect.width,
      viewportRect.height,
      viewportOrientation,
    );
    const logicalMarkerRect = clientRectToLogicalViewportBounds(
      markerRect,
      viewportRect,
      viewportOrientation,
    );
    if (!logicalMarkerRect) return false;
    const compact = logicalViewportSize.width <= 640;
    const width = Math.max(
      240,
      Math.min(compact ? 376 : 420, logicalViewportSize.width - (compact ? 24 : 32)),
    );
    const height = compact
      ? Math.min(380, 56 + badge.impacts.length * 64)
      : Math.min(440, 68 + badge.impacts.length * 88);
    const markerCenter = {
      x: logicalMarkerRect.x + logicalMarkerRect.width / 2,
      y: logicalMarkerRect.y + logicalMarkerRect.height / 2,
    };
    const svg = marker.ownerSVGElement;
    const screenMatrix = svg?.getScreenCTM();
    const anchorPoint = svg?.createSVGPoint();
    if (anchorPoint) {
      anchorPoint.x = badge.anchor.x;
      anchorPoint.y = badge.anchor.y;
    }
    const screenAnchor = anchorPoint && screenMatrix
      ? anchorPoint.matrixTransform(screenMatrix)
      : null;
    const uiKeepoutBoxes = visibleMapChooserKeepouts()
      .map((element) => clientRectToLogicalViewportBounds(
        element.getBoundingClientRect(),
        viewportRect,
        viewportOrientation,
      ))
      .filter((box): box is RegionalCollisionBox => Boolean(box));
    const alertCollisionBoxes = regionalReferencedAlertCollisionBoxes(
      viewport,
      badge,
      viewportRect,
    ).map((box) => clientRectToLogicalViewportBounds({
      left: viewportRect.left + box.x,
      top: viewportRect.top + box.y,
      right: viewportRect.left + box.x + box.width,
      bottom: viewportRect.top + box.y + box.height,
      width: box.width,
      height: box.height,
    }, viewportRect, viewportOrientation)).filter(
      (box): box is RegionalCollisionBox => Boolean(box),
    );
    const placement = regionalOverlapChooserLayout({
      markerCenter,
      markerSize: logicalMarkerRect,
      alertAnchor: screenAnchor
        ? clientPointToLogicalViewportPoint(screenAnchor, viewportRect, viewportOrientation)
        : markerCenter,
      chooserSize: { width, height },
      viewportSize: logicalViewportSize,
      alertCollisionBoxes,
      uiKeepoutBoxes,
    });
    setOverlapChooserLayout((current) =>
      current
      && current.left === placement.layout.left
      && current.top === placement.layout.top
      && current.anchorOffsetX === placement.layout.anchorOffsetX
      && current.anchorOffsetY === placement.layout.anchorOffsetY
        ? current
        : placement.layout
    );
    setOverlapChooserSize((current) =>
      current
      && current.width === placement.size.width
      && current.height === placement.size.height
        ? current
        : placement.size
    );
    setOverlapChooserViewportSize((current) =>
      current
      && current.width === logicalViewportSize.width
      && current.height === logicalViewportSize.height
        ? current
        : logicalViewportSize
    );
    return true;
  }, [viewportOrientation]);

  const openRegionalOverlapChooser = useCallback((badge: RegionalOverlapBadge) => {
    if (!positionRegionalOverlapChooser(badge)) return;
    setExpandedOverlapBadgeId(badge.markerId);
    setRegionalOverlapImpactsHovered(badge.impacts, true);
  }, [positionRegionalOverlapChooser, setRegionalOverlapImpactsHovered]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateTarget(event.target);
  }, [activateTarget]);

  const relativeScale = camera.scale / (fitScale || 1);
  const expandedOverlapBadge = overlapBadges.find(
    (candidate) => candidate.markerId === expandedOverlapBadgeId,
  ) ?? null;
  useLayoutEffect(() => {
    if (!expandedOverlapBadge) return;
    const animationFrame = window.requestAnimationFrame(() => {
      positionRegionalOverlapChooser(expandedOverlapBadge);
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [
    camera,
    chooserKeepoutRevision,
    expandedOverlapBadge,
    positionRegionalOverlapChooser,
    viewportOrientation,
  ]);
  const hoverRegionalChooserImpact = useCallback((impact: MapImpact | null) => {
    if (!expandedOverlapBadge) return;
    setRegionalOverlapImpactsHovered(expandedOverlapBadge.impacts, false);
    setRegionalOverlapImpactsHovered(impact ? [impact] : expandedOverlapBadge.impacts, true);
  }, [expandedOverlapBadge, setRegionalOverlapImpactsHovered]);
  useLayoutEffect(() => {
    if (!expandedOverlapBadge) return;
    hoverRegionalChooserImpact(null);
    return () => setRegionalOverlapImpactsHovered(expandedOverlapBadge.impacts, false);
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
      data-map-gesture-active="false"
      data-regional-map-camera-moving="false"
      aria-label="Interactive GO and UP map"
    >
      <div
        ref={viewportRef}
        className="regional-map-viewport"
        data-map-viewport-orientation={viewportOrientation}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(event) => {
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          if (dragMovedRef.current) return;
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
          {/* Static North Compass fixed to regional map canvas */}
          <svg
            className="raster-map-top-plane absolute top-0 left-0 w-full h-full pointer-events-none"
            viewBox="-200 -200 17036.959 9031.6719"
            preserveAspectRatio="xMidYMid meet"
          >
            <g
              id={REGIONAL_TOP_HOVER_LAYER_ID}
              className="regional-impact-top-hover-layer"
              aria-hidden="true"
              pointerEvents="none"
            />
            {selectedStationId ? (
              <use
                key={`station-selection:${selectedStationId}`}
                aria-hidden="true"
                className="regional-station-top-selection map-selection-attention"
                data-regional-station-top-selected="true"
                href={`#regional-station-selection-source-${selectedStationId}`}
              />
            ) : null}
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
              data-muted={Boolean(selection || selectedStationId || commutePathPreview) ? "true" : "false"}
            />
            <g aria-label="Cardinal North Compass" transform="translate(14800, 5100)">
              <CardinalNorthIcon width={1000} height={1000} dark={isDark} />
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
                  isOpen={expandedOverlapBadgeId === badge.markerId}
                  visualScale={REGIONAL_OVERLAP_INDICATOR_SCALE}
                  isolatePointerDown
                  shouldSuppressMapClick={() => dragMovedRef.current}
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
      {expandedOverlapBadge && overlapChooserLayout && overlapChooserSize && overlapChooserViewportSize ? (
        <MapOverlapChooser
          key={expandedOverlapBadge.markerId}
          selectionKey={focusTargetKey}
          markerId={expandedOverlapBadge.markerId}
          label={expandedOverlapBadge.label}
          impacts={expandedOverlapBadge.impacts}
          chooserSize={overlapChooserSize}
          collisionAvoided
          layout={overlapChooserLayout}
          onSelectImpact={onSelectImpact}
          onHoverImpact={hoverRegionalChooserImpact}
          onClose={closeRegionalChooserWithFocus}
          reducedMotion={reducedMotion}
          compactMotion={overlapChooserSize.width <= 280}
          viewportOrientation={viewportOrientation}
          viewportSize={overlapChooserViewportSize}
        />
      ) : null}
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
            onClick={() => zoomAtCenter(1 / 1.25)}
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
              min={PAN_ZOOM_MIN_RELATIVE_SCALE}
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
            type="button"
            onClick={() => zoomAtCenter(1.25)}
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

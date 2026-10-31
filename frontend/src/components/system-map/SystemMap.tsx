"use client";
/*
 * The System Map engine: one component for every authored SVG map. A map is
 * data (its SystemMapDefinition: manifest, prepared geometry, artwork and the
 * network's content adapter); this component owns everything else: loading
 * the artwork and raster planes, the entrance and camera, the plane stack,
 * station targets and names, the one tap path, hover, train markers, overlap
 * badges and their chooser. It reads no network-specific module.
 *
 * Every map has the same elements: the root (`.system-map`, named by
 * `data-system-map`, where the camera writes its motion flags), the viewport
 * (`.system-map-viewport`) and the camera stage (`.map-stage`).
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type RefObject, type WheelEvent } from "react";
import { Locate, ZoomIn, ZoomOut } from "lucide-react";
import { CommuteRouteLabel } from "../CommuteRouteLabel";
import { CardinalNorthIcon } from "../CardinalNorthIcon";
import { NetworkSelector } from "../NetworkSelector";
import { SharedMapControlRail } from "../SharedMapControlRail";
import { MapViewSelector } from "../MapViewSelector";
import { MapOverlapChooser } from "../MapOverlapChooser";
import { MapOverlapIndicator, restoreMapOverlapIndicatorFocus } from "../MapOverlapIndicator";
import { RasterMapPlane, rasterMapSource, type RasterMapTheme } from "../RasterMapPlane";
import {
  MapStationHoverIndicators,
  MapStationLabelHoverCopy,
  MapStationLabelTargets,
  MapStationSelection,
  MapStationTargets,
  type MapStationHoverChange,
  type MapStationLabelCutout,
  type MapStationLabelHoverChange,
} from "../MapStationLayers";
import { MapZoomSlider } from "../map-camera/MapZoomSlider";
import { mapFocusTargetKey, useDesktopMapInsets, useMapFraming } from "../map-camera/useMapFraming";
import { MapChooserFollower } from "../map-chooser-follow";
import { meetStageTransform } from "../map-chooser-placement";
import { isMapWheelScrollRegionTarget, usePreventMapWheelDefault } from "../map-wheel-events";
import {
  MapLineAlertHoverCopies,
  MapLineAlertHoverOutlines,
  MapLineAlertLayer,
  MapLineAlertSelection,
  MapLineAlertTargets,
} from "../map-overlays/LineAlertOverlays";
import { isSelectedLineAlert } from "../map-overlays/line-alert-model";
import {
  MapStationAlertForeground,
  MapStationAlertRings,
  MapStationDirectionGlyphs,
} from "../map-overlays/StationAlertOverlays";
import { MapCommuteEndpointFlashes, MapCommutePreviewRoute } from "../map-overlays/CommutePreviewOverlays";
import { MapTrainMarkerLayer } from "../map-overlays/TrainMarkerLayer";
import { installMapHoverController, type MapHoverController } from "../map-overlays/map-hover-controller";
import { mapOverlayUnitStyle } from "../map-overlays/overlay-plane";
import { useMapPulseSync } from "../map-overlays/pulse-sync";
import { mapSelectionIntroKey, useMapSelectionIntro } from "../map-overlays/selection-intro";
import { clearMapStationHover, setMapStationHovered } from "../map-overlays/station-hover";
import { useMapOverlapChooser, useMapViewportSize } from "../map-overlays/useMapOverlapChooser";
import { useMapTaps } from "../map-overlays/useMapTaps";
import { useRetainedMapItems } from "../map-overlays/useRetainedMapItems";
import { usePanZoom } from "../../hooks/usePanZoom";
import type { MapViewportOrientation } from "../../hooks/panZoomMath";
import { observeMobileMapFrame } from "../../hooks/mobileMapFrame";
import { useRetainedHover } from "../../hooks/useRetainedHover";
import { mobilePerformanceModeMatches } from "../../hooks/useMobilePerformanceMode";
import { useMapLabelFontReady } from "../../hooks/useMapLabelFontReady";
import { usePageVisibility } from "../../hooks/usePageVisibility";
import { useDashboardData } from "../../app/DataContext";
import { cachedMapArtwork, preloadMapArtwork, splitMapArtwork } from "../../app/map-artwork";
import { mapContentReuser, placeMapOverlapBadges, type MapPlacedOverlapBadge } from "../../app/map-content";
import { mapStationLabelHover, mapStationLabelTargets, placeMapStations } from "../../app/map-station-artwork";
import type { MapManifest } from "../../app/map-manifests";
import type { RasterMapId, RasterMapPlane as RasterMapPlaneName } from "../../app/map-raster-manifest";
import { removeDescendantIds } from "../../app/regional-map-asset";
import { linkedCurrentImpactIds } from "../../app/selection-attention-key";
import type { ImpactSelection, MapImpact } from "../../app/linewatch-data";
import type { AccountCommutePathPreview } from "../../app/commute-data";
import type { EstimatedTrainMarker } from "../../app/train-markers";
import type { StationSummary } from "../../app/station-data";
import type { NetworkId } from "../../app/regional-data";
import type { MapViewPreference } from "../../app/visual-preferences";
import type { MapCameraStore } from "../map-camera/camera-store";
import type { SystemMapDefinition } from "./system-map-definition";

export type SystemMapProps = {
  map: SystemMapDefinition;
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  /**
   * The shell's station list for this map's network, read only by a map
   * that `usesStationList`: a listed station its artwork does not draw is
   * placed at its listed position. Other maps show their data's stations.
   */
  stations?: StationSummary[];
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
};

const NO_TRAIN_MARKERS: EstimatedTrainMarker[] = [];

/**
 * Raster planes under the artwork and overlays, in paint order; the rest of a
 * manifest's planes paint over them. A map may list none: its authored SVG
 * then paints, and the hovered name lifts its authored glyphs.
 */
const UNDER_PLANES: readonly RasterMapPlaneName[] = ["background", "badges"];

/**
 * The authored SVG, mounted whole as artwork: it paints until the raster
 * planes are ready. A map with no raster planes mounts it in two parts
 * (`splitMapArtwork`), its stations and names over the overlays.
 */
const AuthoredArtwork = memo(function AuthoredArtwork({ markup }: { markup: string }) {
  return (
    <div
      className="map-authored-svg raster-map-dynamic-plane absolute inset-0 w-full h-full"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
});

/** The hovered name's glyph source in the mounted artwork (manifest `stationLabels.cutout`). */
function stationLabelCutout(
  root: ParentNode | null,
  { kind, idPrefix }: MapManifest["stationLabels"]["cutout"],
  stationId: string,
): MapStationLabelCutout | null {
  const id = `${idPrefix}${stationId}`;
  if (kind === "use") return { href: `#${id}` };
  const source = root?.querySelector<SVGGElement>(`#${CSS.escape(id)}`);
  if (!source) return null;
  const copy = source.cloneNode(true) as SVGGElement;
  removeDescendantIds(copy);
  return { markup: copy.outerHTML };
}

type HoveredStationLabel = { stationId: string; cutout: MapStationLabelCutout };

function SystemMapComponent({
  map,
  selection,
  onSelectImpact,
  stations: shellStationList,
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
  commutePathPreview = null,
  onClearCommutePathPreview,
  viewportOrientation = "standard",
  estimatedTrainsEnabled = false,
  estimatedTrainMarkers = NO_TRAIN_MARKERS,
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
}: SystemMapProps) {
  const { manifest, geometry, overlayPlane } = map;
  const stationList = map.usesStationList ? shellStationList : undefined;
  const {
    networkSegments,
    activeAlerts,
    delays,
    reducedSpeedZones,
    plannedClosures,
    stationNodeImpacts,
    stations: dataStations,
  } = useDashboardData();

  const rootRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const previewOutlineLayerRef = useRef<SVGGElement>(null);
  const hoverControllerRef = useRef<MapHoverController | null>(null);

  // The authored SVG, prepared as artwork (app/map-artwork.ts).
  const [artwork, setArtwork] = useState(() => cachedMapArtwork(map.artwork.url));
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    if (artwork) return;
    let cancelled = false;
    preloadMapArtwork(map.artwork).then((markup) => {
      if (!cancelled && markup) setArtwork(markup);
    }, () => {
      if (!cancelled) setLoadError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [artwork, map.artwork]);

  // A map without raster planes paints its authored stations and names over
  // the overlays, as the foreground and labels planes do.
  const { stations: stationsLayer, stationLabels: stationLabelsLayer } = manifest.layers;
  const rasterless = manifest.rasterPlanes.length === 0;
  const artworkParts = useMemo(() => {
    if (!artwork) return null;
    return rasterless ? splitMapArtwork(artwork, [stationsLayer, stationLabelsLayer]) : { under: artwork, over: null };
  }, [artwork, rasterless, stationLabelsLayer, stationsLayer]);

  // Raster planes. A phone picks its textures on the first client render, so
  // it never starts decoding the much larger desktop planes.
  const pageVisible = usePageVisibility();
  const useMobileRendering = mobilePerformanceMode || mobilePerformanceModeMatches();
  const mapEffectMotionPaused = reducedMotion || !pageVisible;
  const rasterTheme: RasterMapTheme = highContrast ? "high-contrast" : isDark ? "dark" : "light";
  const rasterDensity = useMobileRendering ? "mobile" : "balanced";
  const rasterVariantKey = `${rasterTheme}:${rasterDensity}`;
  const [readyRasterPlanes, setReadyRasterPlanes] = useState(() => new Set<string>());
  const markRasterPlaneReady = useCallback((plane: string) => {
    setReadyRasterPlanes((current) => {
      const planeKey = `${rasterVariantKey}:${plane}`;
      if (current.has(planeKey)) return current;
      const next = new Set(current);
      next.add(planeKey);
      return next;
    });
  }, [rasterVariantKey]);
  const rasterMapReady = manifest.rasterPlanes.every((plane) => readyRasterPlanes.has(`${rasterVariantKey}:${plane}`));
  const mapLabelFontReady = useMapLabelFontReady();

  // What the map draws, from the network's content adapter. Unchanged items
  // keep their objects, so their memoized drawings stay; items that leave the
  // data fade out.
  const [reuseContent] = useState(mapContentReuser);
  const content = useMemo(() => reuseContent(map.content({
    networkSegments,
    activeAlerts,
    delays,
    reducedSpeedZones,
    plannedClosures,
    stationNodeImpacts,
    stations: dataStations,
    stationList,
    selection,
    commutePathPreview,
  })), [activeAlerts, commutePathPreview, dataStations, delays, map, networkSegments, plannedClosures, reducedSpeedZones, reuseContent, selection, stationList, stationNodeImpacts]);
  const trainMarkerSegments = useMemo(() => map.trainMarkers.segments({
    networkSegments, activeAlerts, delays, reducedSpeedZones, plannedClosures, stationNodeImpacts, stations: dataStations,
  }), [activeAlerts, dataStations, delays, map, networkSegments, plannedClosures, reducedSpeedZones, stationNodeImpacts]);
  const lineAlerts = useRetainedMapItems(content.lineAlerts);
  const stationAlerts = useRetainedMapItems(content.stationAlerts);
  const stationDirectionGlyphs = useRetainedMapItems(content.stationDirectionGlyphs);
  const { commutePreview, selectedLineAlerts, outlinePathsByImpact } = content;
  const commutePreviewActive = Boolean(commutePreview?.pathD);
  const linkedSelectionIds = useMemo(
    () => linkedCurrentImpactIds(selection, { activeAlerts, delays, plannedClosures }),
    [activeAlerts, delays, plannedClosures, selection],
  );

  // Stations: targets shaped like their dots, and their names.
  const stationPlacements = useMemo(() => placeMapStations(map.stationArtwork, stationList
    ? stationList.map(({ id, name, mapX, mapY }) => ({ id, name, fallbackPoint: { x: mapX, y: mapY } }))
    : dataStations.map(({ id, name }) => ({ id, name }))), [dataStations, map.stationArtwork, stationList]);
  const selectedStationArtwork = useMemo(
    () => stationPlacements.find(({ artwork: station }) => station.id === selectedStationId)?.artwork ?? null,
    [selectedStationId, stationPlacements],
  );
  const stationLabelTargets = useMemo(() => mapStationLabelTargets(
    geometry,
    stationPlacements.map(({ artwork: station }) => station.id),
    manifest.stationLabels.targetPadding,
  ), [geometry, manifest.stationLabels.targetPadding, stationPlacements]);

  // The hovered station name lifts above the map, once the label font is ready.
  const [activeHoveredLabel, setHoveredLabel] = useState<HoveredStationLabel | null>(null);
  const hoveredLabelRef = useRef<HoveredStationLabel | null>(null);
  const hoveredLabel = useRetainedHover(activeHoveredLabel);
  const hoverStationLabel = useCallback((stationId: string | null) => {
    if (hoveredLabelRef.current?.stationId === stationId) return;
    const cutout = stationId ? stationLabelCutout(rootRef.current, manifest.stationLabels.cutout, stationId) : null;
    const next = stationId && cutout ? { stationId, cutout } : null;
    hoveredLabelRef.current = next;
    setHoveredLabel(next);
  }, [manifest.stationLabels.cutout]);
  const unhoverStationLabel = useCallback((stationId: string) => {
    if (hoveredLabelRef.current?.stationId === stationId) hoverStationLabel(null);
  }, [hoverStationLabel]);
  const labelHover = useMemo(() => (hoveredLabel && mapLabelFontReady
    ? mapStationLabelHover(geometry, hoveredLabel.stationId, manifest.stationLabels.hoverPadding)
    : null), [geometry, hoveredLabel, manifest.stationLabels.hoverPadding, mapLabelFontReady]);
  const labelCutout = labelHover ? hoveredLabel?.cutout ?? null : null;

  // Hovering or focusing a station rings its dot and lifts its name.
  const onStationHoverChange = useCallback<MapStationHoverChange>((stationId, hovered, via) => {
    setMapStationHovered(rootRef.current, stationId, hovered);
    if (!hovered) {
      unhoverStationLabel(stationId);
    } else if (via === "pointer" || window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      hoverStationLabel(stationId);
    }
  }, [hoverStationLabel, unhoverStationLabel]);
  // Hovering a name lifts it without ringing the dot.
  const onStationLabelHoverChange = useCallback<MapStationLabelHoverChange>((stationId, hovered) => {
    if (hovered) {
      setMapStationHovered(rootRef.current, stationId, false);
      hoverStationLabel(stationId);
    } else {
      unhoverStationLabel(stationId);
    }
  }, [hoverStationLabel, unhoverStationLabel]);

  // The camera (hooks/usePanZoom.ts), with this map's framing as data.
  const desktopInsets = useDesktopMapInsets(viewportRef, railRef, mapChromeVisible);
  const { framing } = manifest;
  const defaultFrame = useMemo(() => ({
    bounds: manifest.contentBounds,
    mobileZoom: framing.mobileZoom,
    mobileCenterStationId: framing.mobileCenterStationId,
    topInset: desktopInsets.top,
    bottomInset: desktopInsets.bottom,
    horizontalInsetRatio: framing.horizontalInsetRatio,
  }), [desktopInsets.bottom, desktopInsets.top, framing, manifest.contentBounds]);
  const cameraOwnedBySelection = Boolean(selection || selectedStationId || commutePathPreview);
  const [chooserFollower] = useState(() => new MapChooserFollower());
  const {
    cameraStore,
    fitScale,
    readCamera,
    isCameraInitialized,
    activePointerCount,
    clearCameraAdjustment,
    isCameraInteracting,
    isGestureActive,
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
    replayEntrance,
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
    persistenceKey: manifest.id,
    persistenceBlocked: cameraOwnedBySelection,
    automaticRefitBlocked: cameraOwnedBySelection,
    reducedMotion,
    viewportOrientation,
    disableProgrammaticMotion: mobilePerformanceMode || !pageVisible,
    defaultFrame,
    animateInitialEntrance,
    isMapActive,
    cameraFollower: chooserFollower,
    containerRef: viewportRef,
    mapRef: stageRef,
    flagRootRef: rootRef,
    // The stage shows once the camera is placed (`cameraPlaced`).
    revealStageOnWrite: false,
  });
  const mapViewportSize = useMapViewportSize(viewportRef, viewportOrientation);
  usePreventMapWheelDefault(viewportRef);

  // A phone's map frame can change size (browser chrome, sheets); an untouched
  // camera refits, unless a selection owns it.
  const automaticResizeRefitBlockedRef = useRef(false);
  useLayoutEffect(() => {
    automaticResizeRefitBlockedRef.current = cameraOwnedBySelection;
  }, [cameraOwnedBySelection]);
  useLayoutEffect(() => observeMobileMapFrame(viewportRef.current, () => {
    if (!isMapActive) return;
    if (window.innerWidth < 768 && !automaticResizeRefitBlockedRef.current) refitIfCameraUntouched();
  }), [isMapActive, refitIfCameraUntouched, mapChromeVisible]);

  // Turning the phone refits the network.
  const lastViewportOrientationRef = useRef(viewportOrientation);
  useEffect(() => {
    if (lastViewportOrientationRef.current === viewportOrientation) return;
    lastViewportOrientationRef.current = viewportOrientation;
    if (!isCameraInitialized()) return;
    clearCameraAdjustment();
    const frame = window.requestAnimationFrame(() => moveToDefaultCamera(true, false));
    return () => window.cancelAnimationFrame(frame);
  }, [clearCameraAdjustment, isCameraInitialized, moveToDefaultCamera, viewportOrientation]);

  const focusTargetKey = useMemo(
    () => mapFocusTargetKey({ selection, selectedStationId, commutePathPreview }, selectionAttentionGeneration),
    [commutePathPreview, selection, selectedStationId, selectionAttentionGeneration],
  );
  const selectionIntroComplete = useMapSelectionIntro(mapSelectionIntroKey({
    selection,
    linkedSelectionIntroKey,
    selectedStationId,
    commutePreviewKey: commutePathPreview ? `${commutePathPreview.id}:${commutePathPreview.legId}` : null,
    generation: selectionAttentionGeneration,
  }), rootRef);

  // The entrance: the camera is placed once the artwork has loaded and the
  // viewport has a size. While the shell defers the entrance, or the raster
  // planes are still decoding, it waits at the fly-in start; a selection to
  // frame starts from the fitted camera instead.
  const [cameraPlaced, setCameraPlaced] = useState(false);
  const entranceStagedRef = useRef(false);
  const readyNotifiedRef = useRef(false);
  const placeCamera = useCallback(() => {
    if (!artwork || readyNotifiedRef.current) return;
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const entranceCovered = deferInitialEntrance
      || (focusTargetKey === null && animateInitialEntrance && !rasterMapReady);
    if (entranceCovered) {
      if (!entranceStagedRef.current && !isCameraInitialized()) {
        entranceStagedRef.current = true;
        stageInitialEntrance();
      }
    } else if (entranceStagedRef.current) {
      entranceStagedRef.current = false;
      completeStagedEntrance();
    } else if (!isCameraInitialized()) {
      if (focusTargetKey) moveToDefaultCamera(false, false);
      else initializeCamera();
    }
    if (isCameraInitialized()) setCameraPlaced(true);
  }, [animateInitialEntrance, artwork, completeStagedEntrance, deferInitialEntrance, focusTargetKey, initializeCamera, isCameraInitialized, logicalViewportSize, moveToDefaultCamera, rasterMapReady, stageInitialEntrance]);
  useLayoutEffect(() => {
    // Placing the camera writes the stage; `cameraPlaced` then reveals it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    placeCamera();
  }, [placeCamera]);
  // A viewport laid out after the artwork loaded places the camera when it gets its size.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (document.visibilityState !== "hidden") placeCamera();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [placeCamera]);

  // The shell reveals the map two frames after it is ready to paint.
  useEffect(() => {
    if (deferInitialEntrance || !artwork || !cameraPlaced || !rasterMapReady || readyNotifiedRef.current) return;
    let secondPaintFrame: number | null = null;
    const notify = () => {
      if (readyNotifiedRef.current) return;
      readyNotifiedRef.current = true;
      onReady?.();
    };
    const fallbackTimer = window.setTimeout(notify, 250);
    const firstPaintFrame = window.requestAnimationFrame(() => {
      secondPaintFrame = window.requestAnimationFrame(() => {
        window.clearTimeout(fallbackTimer);
        notify();
      });
    });
    return () => {
      window.clearTimeout(fallbackTimer);
      window.cancelAnimationFrame(firstPaintFrame);
      if (secondPaintFrame !== null) window.cancelAnimationFrame(secondPaintFrame);
    };
  }, [artwork, cameraPlaced, deferInitialEntrance, onReady, rasterMapReady]);

  const lastEntranceSignalRef = useRef(entranceSignal ?? 0);
  useEffect(() => {
    if (entranceSignal === undefined || entranceSignal === lastEntranceSignalRef.current || !cameraPlaced) return;
    lastEntranceSignalRef.current = entranceSignal;
    replayEntrance();
  }, [cameraPlaced, entranceSignal, replayEntrance]);

  const { revealFocusedMapTarget } = useMapFraming({
    camera: {
      containerRef: viewportRef,
      mapRef: stageRef,
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
    ready: Boolean(artwork) && cameraPlaced,
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

  // A commute preview and a selected station pulse on one clock.
  const pulseSignature = useMemo(() => [
    ...lineAlerts.map((alert) => `${alert.key}:${Boolean(alert.exiting)}`),
    "",
    ...stationAlerts.map((alert) => `${alert.key}:${Boolean(alert.exiting)}`),
  ].join("|"), [lineAlerts, stationAlerts]);
  useMapPulseSync(rootRef, {
    paused: mapEffectMotionPaused,
    signature: `${isMapActive}:${artwork ? "ready" : ""}:${commutePreview?.pathD ? "commute" : ""}::${pulseSignature}`,
  });

  // Alert hover, chooser rows and group previews: the shared controller.
  useLayoutEffect(() => {
    const root = rootRef.current;
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
    hoverControllerRef.current?.setOutlineSource(overlayPlane, outlinePathsByImpact);
  }, [outlinePathsByImpact, overlayPlane]);
  // Overlay nodes of changed alerts mount idle; reapply the current hover.
  useLayoutEffect(() => {
    hoverControllerRef.current?.restore();
  }, [lineAlerts, stationAlerts]);
  const setGroupHovered = useCallback((impacts: MapImpact[], hovered: boolean) => {
    hoverControllerRef.current?.setGroupPreview(
      impacts.map((impact) => ({ kind: impact.kind, id: impact.cardId })),
      hovered,
    );
  }, []);

  // A press or wheel ends the pointer hover: the hover controller ends alert
  // hover, this the station ring and name (keeping a name that is itself
  // pressed). Chooser and badge previews stay with their owners.
  const endMapPointerHover = useCallback((preserveStationLabel = false) => {
    clearMapStationHover(rootRef.current);
    if (!preserveStationLabel) hoverStationLabel(null);
  }, [hoverStationLabel]);
  const endPressedMapHover = useCallback((event: PointerEvent<HTMLDivElement>) => {
    endMapPointerHover(event.target instanceof Element && Boolean(event.target.closest(".station-label-hit-target")));
  }, [endMapPointerHover]);
  const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (isMapWheelScrollRegionTarget(event.target)) return;
    endMapPointerHover();
    handleWheel(event);
  }, [endMapPointerHover, handleWheel]);
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

  // Overlap badges, placed by the shared layout, and the open badge's chooser.
  const { badgeScale } = content.badgePlacement;
  const overlapBadges = useMemo(
    () => placeMapOverlapBadges(content, { unit: overlayPlane.unit, mapBounds: manifest.viewBox }),
    [content, manifest.viewBox, overlayPlane.unit],
  );
  const [expandedOverlapBadgeId, setExpandedOverlapBadgeId] = useState<string | null>(null);
  const expandedOverlapBadge = overlapBadges.find((badge) => badge.markerId === expandedOverlapBadgeId) ?? null;
  const stage = useMemo(
    () => meetStageTransform(manifest.viewBox, manifest.stage.width, manifest.stage.height),
    [manifest.stage.height, manifest.stage.width, manifest.viewBox],
  );
  const expandedOverlapChooser = useMapOverlapChooser({
    badge: expandedOverlapBadge && {
      id: expandedOverlapBadge.markerId,
      position: expandedOverlapBadge.position,
      // Badges draw at the map's badge scale (MapOverlapIndicator's visualScale).
      size: {
        width: expandedOverlapBadge.size.width * badgeScale,
        height: expandedOverlapBadge.size.height * badgeScale,
      },
      impactCount: expandedOverlapBadge.impacts.length,
      affectedOutlines: expandedOverlapBadge.affectedOutlines,
    },
    stage,
    cameraStore,
    readCamera,
    isCameraInteracting,
    viewportRef,
    viewportSize: mapViewportSize,
    viewportOrientation,
  });
  // A hovered chooser row behaves like hovering that alert on the map; with no
  // row hovered, the chooser previews its whole group as one outline.
  const hoverChooserImpact = useCallback((impact: MapImpact | null) => {
    if (!expandedOverlapBadge) return;
    setGroupHovered(expandedOverlapBadge.impacts, !impact);
    hoverControllerRef.current?.setChooserHover(impact ? { kind: impact.kind, id: impact.cardId } : null);
  }, [expandedOverlapBadge, setGroupHovered]);
  useLayoutEffect(() => {
    if (!expandedOverlapBadge) return;
    hoverChooserImpact(null);
    return () => {
      hoverControllerRef.current?.setChooserHover(null);
      setGroupHovered(expandedOverlapBadge.impacts, false);
    };
  }, [expandedOverlapBadge, hoverChooserImpact, setGroupHovered]);
  // Closing the chooser with the keyboard returns focus to its badge.
  const badgeFocusToRestoreRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const markerId = badgeFocusToRestoreRef.current;
    if (expandedOverlapBadgeId !== null || markerId === null) return;
    badgeFocusToRestoreRef.current = null;
    restoreMapOverlapIndicatorFocus(rootRef.current
      ?.querySelector<SVGGElement>(`[data-overlap-segment-id="${CSS.escape(markerId)}"] .overlap-indicator`));
  }, [expandedOverlapBadgeId]);

  const viewBox = manifest.viewBox;
  // Layer ids, unique per map: both maps stay mounted.
  const layerId = (name: string) => `${manifest.id}-${name}-layer`;
  const planeViewBox = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;
  const renderRasterPlane = (plane: RasterMapPlaneName) => (
    <RasterMapPlane
      key={plane}
      {...({ map: manifest.id, plane } as { map: "ttc"; plane: RasterMapPlaneName })}
      theme={rasterTheme}
      density={rasterDensity}
      onReady={() => markRasterPlaneReady(plane)}
      {...(plane === "labels" ? {
        // Station names have their own texture, so the hover cutout cannot
        // cloak tracks or dots inside the name's padded box.
        svgViewBox: planeViewBox,
        cutoutElementHref: labelCutout && "href" in labelCutout ? labelCutout.href : null,
        cutoutMarkup: labelCutout && "markup" in labelCutout ? labelCutout.markup : null,
      } : {})}
    />
  );
  const underPlanes = UNDER_PLANES.filter((plane) => manifest.rasterPlanes.includes(plane));
  const overPlanes = manifest.rasterPlanes.filter((plane) => !UNDER_PLANES.includes(plane));
  const labelsSource = manifest.rasterPlanes.includes("labels")
    ? rasterMapSource(manifest.id as RasterMapId, "labels", rasterTheme, rasterDensity)
    : null;

  return (
    <section
      ref={rootRef}
      className="system-map"
      data-system-map={manifest.id}
      style={mapOverlayUnitStyle({ unit: overlayPlane.unit })}
      aria-label={manifest.label}
      data-map-camera-moving="false"
      data-map-gesture-active="false"
      data-map-pointer-dragging="false"
      data-map-zoom-active="false"
    >
      <SystemMapControls
        network={manifest.network}
        railRef={railRef}
        cameraStore={cameraStore}
        fitScale={fitScale}
        onZoomToScale={zoomToScale}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onRecenter={recenterWithFeedback}
        onNetworkChange={onNetworkChange}
        mapView={mapView}
        onMapViewChange={onMapViewChange}
      />

      <div
        ref={viewportRef}
        className="system-map-viewport"
        data-map-viewport-orientation={viewportOrientation}
        {...tapHandlers}
        onPointerLeave={handlePointerLeave}
        onLostPointerCapture={handleLostPointerCapture}
        onFocus={(event) => revealFocusedMapTarget(event.target)}
        onWheel={onWheel}
      >
        {loadError ? <p role="alert" className="map-load-error">Map could not be loaded.</p> : null}
        <div className="map-attribution-notice" aria-label={`${manifest.attributionSource} derivative map attribution`}>
          Inkscape re-creation based on {manifest.attributionSource} map · Not to scale
        </div>

        <div
          ref={stageRef}
          data-map-label-font-ready={mapLabelFontReady ? "true" : "false"}
          data-raster-map-ready={rasterMapReady ? "true" : "false"}
          // Without raster planes the authored SVG paints (base-map.css).
          data-raster-planes={rasterless ? "none" : undefined}
          className="map-stage"
          style={{
            // The stage has the drawing's full size: a viewport-sized parent
            // with the artwork overflowing it makes Chromium invalidate tiles
            // while zooming.
            width: `${manifest.stage.width}px`,
            height: `${manifest.stage.height}px`,
            transformOrigin: "0 0",
            visibility: artwork && cameraPlaced ? "visible" : "hidden",
          }}
        >
          {underPlanes.map(renderRasterPlane)}
          {artworkParts ? <AuthoredArtwork markup={artworkParts.under} /> : null}

          {/* Overlay plane: alert tubes, the commute route, selection emphasis,
              hover copies and station hover rings, under the station artwork.
              React-owned; never takes the pointer. */}
          <svg
            className={`raster-map-dynamic-plane map-overlay-plane ${manifest.id}-overlay-plane absolute top-0 left-0 w-full h-full pointer-events-none`}
            viewBox={planeViewBox}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <g id={layerId("dynamic-segment")} aria-label="Disruption overlays">
              <MapLineAlertLayer
                alerts={commutePreviewActive && selection
                  // The commute focus copy repaints the selected alert.
                  ? lineAlerts.filter((alert) => !isSelectedLineAlert(alert, selection))
                  : lineAlerts}
                plane={overlayPlane}
                selection={selection}
              />
            </g>
            <g id={layerId("dynamic-commute")} aria-label="Commute route preview">
              <MapCommutePreviewRoute preview={commutePreview} />
            </g>
            {/* Hovered alerts repaint above the others, below the station artwork. */}
            <g id={layerId("dynamic-hover")}>
              <MapLineAlertHoverCopies alerts={lineAlerts} plane={overlayPlane} />
            </g>
            {/* The selected alert's flash stays above hover copies, so hovering never hides it. */}
            <g id={layerId("dynamic-selected-segment")} aria-label="Selected disruption emphasis">
              <MapLineAlertSelection
                alerts={selectedLineAlerts}
                plane={overlayPlane}
                commutePreviewActive={commutePreviewActive}
                introComplete={selectionIntroComplete}
              />
            </g>
            <MapStationHoverIndicators
              stations={stationPlacements}
              selectedStationId={selectedStationId}
              overlayUnit={overlayPlane.unit}
            />
          </svg>

          {overPlanes.map(renderRasterPlane)}
          {artworkParts?.over ? <AuthoredArtwork markup={artworkParts.over} /> : null}

          {/* Top plane: the hovered station name, train markers and the compass. */}
          <svg
            className="raster-map-top-plane absolute top-0 left-0 w-full h-full pointer-events-none"
            viewBox={planeViewBox}
            preserveAspectRatio="xMidYMid meet"
          >
            {labelHover && labelCutout ? (
              <MapStationLabelHoverCopy
                key={labelHover.stationId}
                idPrefix={manifest.id}
                hover={labelHover}
                cutout={labelCutout}
                dilate={manifest.stationLabels.cutout.dilate}
                active={activeHoveredLabel !== null}
                labelsSource={labelsSource}
                viewBox={viewBox}
              />
            ) : null}
            <g id={layerId("train-marker")} aria-label="Estimated train markers" className="estimated-train-marker-layer" pointerEvents="none">
              {/* Schematic positions along each segment's prepared path. */}
              <MapTrainMarkerLayer
                enabled={estimatedTrainsEnabled && Boolean(artwork)}
                markers={estimatedTrainMarkers}
                segments={trainMarkerSegments}
                placement={map.trainMarkers.placement}
                animate={!mapEffectMotionPaused}
              />
            </g>
            <g aria-label="Cardinal North Compass" transform={`translate(${manifest.compass.x}, ${manifest.compass.y})`}>
              <CardinalNorthIcon width={manifest.compass.width} height={manifest.compass.height} dark={isDark} />
            </g>
          </svg>

          {/* Interaction plane: hover outlines, targets (line alerts, then
              stations), station alerts, station names, selection and badges.
              Only targets take the pointer; the viewport selects from their
              identity (map-overlays/useMapTaps.ts). */}
          <svg
            className="raster-map-interaction-plane absolute top-0 left-0 w-full h-full pointer-events-none"
            viewBox={planeViewBox}
            preserveAspectRatio="xMidYMid meet"
          >
            <MapLineAlertHoverOutlines alerts={lineAlerts} plane={overlayPlane} />
            <g aria-hidden="true" pointerEvents="none">
              <g ref={previewOutlineLayerRef} id={layerId("top-hover")} className="map-impact-preview-outline-layer" />
            </g>
            <g id={layerId("dynamic-target")} aria-label="Disruption overlay interaction targets">
              <MapLineAlertTargets alerts={lineAlerts} />
            </g>
            <MapStationTargets
              stations={stationPlacements}
              selectedStationId={selectedStationId}
              hitPadding={manifest.stationHitPadding}
              onHoverChange={onStationHoverChange}
            />
            <g aria-label="Commute endpoint highlights">
              <MapCommuteEndpointFlashes preview={commutePreview} plane={overlayPlane} />
            </g>
            <g id={layerId("top-station-impact")} aria-label="Station impact rings">
              <MapStationAlertRings alerts={stationAlerts} plane={overlayPlane} selection={selection} />
            </g>
            {/* Names share one foreground plane: a later invisible dot or alert
                target interleaved with them would steal hover from the text. */}
            <MapStationLabelTargets labels={stationLabelTargets} onHoverChange={onStationLabelHoverChange} />
            <g aria-label="Station impact direction glyphs">
              <MapStationDirectionGlyphs glyphs={stationDirectionGlyphs} />
            </g>
            <g aria-label="Station impact foreground highlights" pointerEvents="none">
              <MapStationSelection
                key={selectedStationId ?? "none"}
                station={selectedStationArtwork}
                introComplete={selectionIntroComplete}
              />
              <MapStationAlertForeground
                alerts={stationAlerts}
                plane={overlayPlane}
                selection={selection}
                commutePreviewActive={commutePreviewActive}
                introComplete={selectionIntroComplete}
              />
            </g>
            <g aria-label="Overlapping alert badges">
              {/* The open badge draws last, above the others. */}
              {[
                ...overlapBadges.filter((badge) => badge.markerId !== expandedOverlapBadgeId),
                ...(expandedOverlapBadge ? [expandedOverlapBadge] : []),
              ].map((badge) => (
                <OverlapBadge
                  key={badge.markerId}
                  badge={badge}
                  badgeScale={badgeScale}
                  selection={selection}
                  linkedSelectionIds={linkedSelectionIds}
                  isOpen={badge.markerId === expandedOverlapBadgeId}
                  onToggle={() => {
                    clearMapHover();
                    setExpandedOverlapBadgeId(badge.markerId === expandedOverlapBadgeId ? null : badge.markerId);
                  }}
                  onHoverChange={badge.markerId === expandedOverlapBadgeId
                    ? undefined
                    : (hovered) => setGroupHovered(badge.impacts, hovered)}
                  shouldSuppressMapClick={shouldSuppressMapClick}
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
            data-map-center-feedback={manifest.id}
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
            follower={chooserFollower}
            followAnchor={expandedOverlapChooser.followAnchor}
            onSelectImpact={onSelectImpact}
            onHoverImpact={hoverChooserImpact}
            onClose={(restoreFocus) => {
              clearMapHover();
              badgeFocusToRestoreRef.current = restoreFocus ? expandedOverlapBadge.markerId : null;
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
    </section>
  );
}

function OverlapBadge({
  badge,
  badgeScale,
  selection,
  linkedSelectionIds,
  isOpen,
  onToggle,
  onHoverChange,
  shouldSuppressMapClick,
}: {
  badge: MapPlacedOverlapBadge;
  badgeScale: number;
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
      connector={badge.connector}
      visualScale={badgeScale}
      isolatePointerDown
      onActivate={onToggle}
      onHoverChange={onHoverChange}
      shouldSuppressMapClick={shouldSuppressMapClick}
    />
  );
}

/** Center, zoom, and on desktop the network and view switchers. */
function SystemMapControls({
  network,
  railRef,
  cameraStore,
  fitScale,
  onZoomToScale,
  onZoomIn,
  onZoomOut,
  onRecenter,
  onNetworkChange,
  mapView,
  onMapViewChange,
}: {
  network: NetworkId;
  railRef: RefObject<HTMLDivElement | null>;
  cameraStore: MapCameraStore;
  fitScale: number;
  onZoomToScale: (scale: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
  onNetworkChange?: (network: NetworkId) => void;
  mapView?: MapViewPreference;
  onMapViewChange?: (view: MapViewPreference) => void;
}) {
  const labelClassName = "text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors";
  return (
    <SharedMapControlRail
      network={network}
      ref={railRef}
      className={`map-control-rail desktop-map-control-rail absolute top-14 sm:top-5 left-1/2 -translate-x-1/2 z-30 flex flex-row items-center justify-center gap-1 sm:gap-2 pointer-events-auto`}
      data-map-chooser-keepout
    >
      <div className="map-control-recenter-container">
        <button type="button" onClick={onRecenter} className="map-control-button group" title="Center map view" aria-label="Center map view">
          <Locate size={22} className="map-control-recenter-icon" />
          <span className={`map-control-recenter-desktop-label ${labelClassName}`}>Center</span>
        </button>
        <span className="map-control-recenter-mobile-label">Center</span>
      </div>

      <div className="map-control-zoom-group">
        <div className="map-control-divider" aria-hidden="true" />
        <button type="button" onClick={onZoomOut} className="map-control-button group" title="Zoom out" aria-label="Zoom out">
          <ZoomOut size={20} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
          <span className={labelClassName}>Out</span>
        </button>
        <MapZoomSlider cameraStore={cameraStore} fitScale={fitScale} onZoomToScale={onZoomToScale} />
        <button type="button" onClick={onZoomIn} className="map-control-button group" title="Zoom in" aria-label="Zoom in">
          <ZoomIn size={20} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
          <span className={labelClassName}>In</span>
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
          <MapViewSelector view={mapView ?? "diagram"} onChange={onMapViewChange} />
        </div>
      )}
    </SharedMapControlRail>
  );
}

export const SystemMap = memo(SystemMapComponent);
SystemMap.displayName = "SystemMap";

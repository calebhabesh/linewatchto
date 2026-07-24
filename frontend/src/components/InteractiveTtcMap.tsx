"use client";

import { memo, useEffect, useState, useMemo, useLayoutEffect, useRef, useCallback } from "react";
import {
  composeNetworkSegmentPath,
  pathCenter,
  pathCorridorCollisionBoxes,
  pathMidpointFrame,
  readSvgGeometry,
  readSvgStationCenters,
  resolveNetworkSegmentPath,
  transformBoundsToRootCoordinates,
  visualTravelDirection,
  samplePath,
  type MapBounds,
  type MapPoint,
  type PathFrame,
} from "../app/map-geometry";
import { usePanZoom } from "../hooks/usePanZoom";
import {
  clientRectToLogicalViewportBounds,
  PAN_ZOOM_MAX_RELATIVE_SCALE,
  type MapContentBounds,
  type MapViewportOrientation,
} from "../hooks/panZoomMath";
import { ZoomIn, ZoomOut, Locate, Sun, Moon, X } from "lucide-react";
import { useDashboardData } from "../app/DataContext";
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
} from "../app/linewatch-data";
import type { StationSummary } from "../app/station-data";
import type { AccountCommutePathPreview } from "../app/account-data";
import { estimatedTrainMarkerRenderKey, type EstimatedTrainMarker } from "../app/train-markers";
import { LogsDropdown } from "./LogsDropdown";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { SiteGuideDropdown } from "./SiteGuideDropdown";
import {
  alignedOverlapBadgePositionCandidates,
  buildStationOverlapBadgeGroups,
  chooseOverlapChooserPosition,
  coveredSegmentOverlapBadgeSignatures,
  hasOverlappingImpacts,
  overlapBadgeKindCounts,
  overlapBadgeVisualItemCount,
  type PlacedOverlapBadge,
} from "./map-overlap-badges";
import { getSelectedImpactDetails } from "./MobileImpactInspector";
import {
  stationImpactDirectionForImpact,
  stationImpactDirectionForStationImpacts,
  type StationImpactArrowDirection,
} from "./station-impact-direction";
import {
  stationImpactVisualAnchors,
  stationVisualAnchorIds,
  stationVisualAnchorsFor,
  stationVisualCenterIds,
} from "./station-map-visuals";

const SVG_TO_RENDERED_MAP_SCALE = 4500 / 8250;
const DESKTOP_MAP_HORIZONTAL_INSET_RATIO = 0.025;
// Authored visible-art bounds, extended through x=7900 to include the compass.
const DESKTOP_MAP_CONTENT_BOUNDS: MapContentBounds = {
  x: 190 * SVG_TO_RENDERED_MAP_SCALE,
  y: 184.343 * SVG_TO_RENDERED_MAP_SCALE,
  width: (7900 - 190) * SVG_TO_RENDERED_MAP_SCALE,
  height: (3743.003 - 184.343) * SVG_TO_RENDERED_MAP_SCALE,
};

const RSZ_IMPACT_COLOR = "#F59E0B";

function getSegmentsCenter(
  segmentIds: string[],
  segmentsList: NetworkSegment[],
  stations: Station[],
  anchorPoints: Map<string, MapPoint>,
  guidePaths: Map<string, string>
): MapPoint | null {
  if (segmentIds.length === 0) return null;

  let totalSumX = 0;
  let totalSumY = 0;
  let totalPointsCount = 0;

  segmentIds.forEach((id) => {
    const segment = segmentsList.find((s) => s.id === id);
    if (!segment) return;

    const pathD = resolveNetworkSegmentPath(segment, stations, anchorPoints, guidePaths);
    if (!pathD) return;

    const center = pathCenter(pathD);
    if (!center) return;

    totalSumX += center.x;
    totalSumY += center.y;
    totalPointsCount++;
  });

  if (totalPointsCount === 0) return null;

  const scaleFactor = 4500 / 8250;
  return {
    x: (totalSumX / totalPointsCount) * scaleFactor,
    y: (totalSumY / totalPointsCount) * scaleFactor,
  };
}

type RetainedLayer<T> = {
  key: string;
  item: T;
  exiting: boolean;
};

const MAP_PULSE_CYCLE_MS = 1200;

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
  onToggleTheme,
  layoutResetSignal,
  entranceSignal,
  recenterSignal,
  reducedMotion,
  mobilePerformanceMode = false,
  desktopMenuPinned = false,
  preserveCameraOnSelectionClear = false,
  commutePathPreview,
  onClearCommutePathPreview,
  viewportOrientation = "standard",
  estimatedTrainsEnabled = false,
  estimatedTrainMarkers = [],
  animateInitialEntrance = true,
  onReady,
}: {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  stations: StationSummary[];
  selectedStationId: string | null;
  onSelectStationId: (id: string | null) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  layoutResetSignal?: number;
  entranceSignal?: number;
  recenterSignal?: number;
  reducedMotion: boolean;
  mobilePerformanceMode?: boolean;
  desktopMenuPinned?: boolean;
  preserveCameraOnSelectionClear?: boolean;
  commutePathPreview?: AccountCommutePathPreview | null;
  onClearCommutePathPreview?: () => void;
  viewportOrientation?: MapViewportOrientation;
  estimatedTrainsEnabled?: boolean;
  estimatedTrainMarkers?: EstimatedTrainMarker[];
  animateInitialEntrance?: boolean;
  onReady?: () => void;
}) {
  const { networkSegments, activeAlerts, delays, reducedSpeedZones, plannedClosures, stationNodeImpacts, stations: mapStations } = useDashboardData();
  const [svgParts, setSvgParts] = useState<{ part1: string; part2: string } | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [hoveredStationId, setHoveredStationId] = useState<string | null>(null);
  const [hoveredOverlayHighlight, setHoveredOverlayHighlight] = useState<HoveredOverlayHighlight | null>(null);
  const [hoveredOverlayForeground, setHoveredOverlayForeground] = useState<HoveredOverlayForeground | null>(null);
  const [hoveredStationImpact, setHoveredStationImpact] = useState<ImpactSelection>(null);
  const [expandedOverlapBadgeId, setExpandedOverlapBadgeId] = useState<string | null>(null);
  const readyNotifiedRef = useRef(false);

  const mapSvgRef = useRef<SVGSVGElement>(null);
  const mapRootRef = useRef<HTMLDivElement>(null);
  const mapControlRailRef = useRef<HTMLDivElement>(null);
  const [desktopMapTopInset, setDesktopMapTopInset] = useState(0);
  const [anchorPoints, setAnchorPoints] = useState(new Map<string, MapPoint>());
  const [guidePaths, setGuidePaths] = useState(new Map<string, string>());
  const [stationCenterPoints, setStationCenterPoints] = useState(new Map<string, MapPoint>());
  const [mapCollisionBoxes, setMapCollisionBoxes] = useState<SvgBounds[]>([]);

  useLayoutEffect(() => {
    if (loadState !== "ready" || !mapSvgRef.current) return;
    const geometry = readSvgGeometry(mapSvgRef.current, networkSegments);
    setAnchorPoints(geometry.anchorPoints);
    setGuidePaths(geometry.guidePaths);
    setStationCenterPoints(
      readSvgStationCenters(mapSvgRef.current, stationVisualCenterIds(stations)),
    );
    setMapCollisionBoxes([
      ...collectMapCollisionBoxes(mapSvgRef.current),
      ...collectBaseRouteCollisionBoxes(networkSegments, mapStations, geometry.anchorPoints, geometry.guidePaths),
    ]);
  }, [loadState, mapStations, networkSegments, stations]);

  const stationPointFor = useCallback((station: { id: string; mapX: number; mapY: number }): MapPoint => {
    return stationCenterPoints.get(station.id) ?? { x: station.mapX, y: station.mapY };
  }, [stationCenterPoints]);

  const visualAnchorsForStation = useCallback(
    (station: Pick<StationSummary, "id" | "mapX" | "mapY">) =>
      stationVisualAnchorsFor(station, stationCenterPoints),
    [stationCenterPoints],
  );

  const defaultMapFrame = useMemo(() => desktopMapTopInset > 0 ? {
    bounds: DESKTOP_MAP_CONTENT_BOUNDS,
    topInset: desktopMapTopInset,
    horizontalInsetRatio: DESKTOP_MAP_HORIZONTAL_INSET_RATIO,
  } : undefined, [desktopMapTopInset]);

  const {
    transform,
    relativeScale,
    isDragging,
    isGestureActive,
    containerRef,
    mapRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    handlePointerCancel,
    handleWheel,
    initializeCamera,
    recenter,
    zoomIn,
    zoomOut,
    zoomToScale,
    zoomToPoint,
    shouldSuppressMapClick,
    replayEntrance,
  } = usePanZoom({
    reducedMotion,
    viewportOrientation,
    disableProgrammaticMotion: mobilePerformanceMode,
    defaultFrame: defaultMapFrame,
    animateInitialEntrance,
  });
  const [mapViewportSize, setMapViewportSize] = useState({ width: 392, height: 720 });
  const [chooserKeepoutBoxes, setChooserKeepoutBoxes] = useState<SvgBounds[]>([]);

  useLayoutEffect(() => {
    const root = mapRootRef.current;
    const rail = mapControlRailRef.current;
    if (!root || !rail) return;

    const measureTopInset = () => {
      const railStyle = window.getComputedStyle(rail);
      if (railStyle.display === "none") {
        setDesktopMapTopInset(0);
        return;
      }

      const rootRect = root.getBoundingClientRect();
      const railRect = rail.getBoundingClientRect();
      setDesktopMapTopInset(Math.max(0, Math.round(railRect.bottom - rootRect.top)));
    };

    measureTopInset();
    const observer = new ResizeObserver(measureTopInset);
    observer.observe(root);
    observer.observe(rail);
    window.addEventListener("resize", measureTopInset);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureTopInset);
    };
  }, []);

  useEffect(() => {
    const viewport = containerRef.current;
    if (!viewport) return;
    const updateSize = () => {
      setMapViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [containerRef]);

  useLayoutEffect(() => {
    const viewport = containerRef.current;
    if (!viewport || !expandedOverlapBadgeId) {
      setChooserKeepoutBoxes([]);
      return;
    }

    const updateKeepoutBoxes = () => {
      const viewportRect = viewport.getBoundingClientRect();
      const boxes = Array.from(document.querySelectorAll<HTMLElement>(CHOOSER_KEEPOUT_SELECTOR))
        .filter(isVisibleChooserKeepout)
        .map((element) => clientRectToLogicalViewportBounds(
          element.getBoundingClientRect(),
          viewportRect,
          viewportOrientation,
        ))
        .filter((box): box is SvgBounds => Boolean(box));
      setChooserKeepoutBoxes(boxes);
    };

    updateKeepoutBoxes();
    const observer = new ResizeObserver(updateKeepoutBoxes);
    observer.observe(viewport);
    document.querySelectorAll<HTMLElement>(CHOOSER_KEEPOUT_SELECTOR).forEach((element) => observer.observe(element));
    window.addEventListener("resize", updateKeepoutBoxes);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateKeepoutBoxes);
    };
  }, [containerRef, expandedOverlapBadgeId, mapViewportSize.width, viewportOrientation]);

  // Load SVG
  useEffect(() => {
    let cancelled = false;
    async function loadMap() {
      try {
        const response = await fetch("/assets/linewatch/ttc-subway-map-edited.svg");
        if (!response.ok) throw new Error("Map load failed");
        const text = await response.text();

        if (!cancelled) {
          const innerMatch = text.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
          if (innerMatch) {
            const splitMatch = innerMatch[1].match(/([\s\S]*?)(<g\s+id="layer6"[\s\S]*)/);
            if (splitMatch) {
              setSvgParts({ part1: splitMatch[1], part2: splitMatch[2] });
              setLoadState("ready");
            } else throw new Error("Missing layer6");
          } else throw new Error("Missing svg");
        }
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }
    loadMap();
    return () => {
      cancelled = true;
    };
  }, []);

  // Prevent default wheel scrolling on the container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventScroll = (e: WheelEvent) => {
      e.preventDefault();
    };
    el.addEventListener("wheel", preventScroll, { passive: false });
    return () => el.removeEventListener("wheel", preventScroll);
  }, [containerRef]);

  // Center map automatically when SVG loads and container dimensions are resolved
  useEffect(() => {
    if (loadState !== "ready") return;

    let attempts = 0;
    let retryTimer: number | null = null;
    let readyTimer: number | null = null;
    let firstPaintFrame: number | null = null;
    let secondPaintFrame: number | null = null;
    const notifyReadyAfterPaint = () => {
      firstPaintFrame = window.requestAnimationFrame(() => {
        secondPaintFrame = window.requestAnimationFrame(() => {
          if (readyNotifiedRef.current) return;
          readyNotifiedRef.current = true;
          onReady?.();
        });
      });
    };
    const checkAndCenter = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        initializeCamera();
        if (animateInitialEntrance && !reducedMotion && !mobilePerformanceMode) {
          readyTimer = window.setTimeout(notifyReadyAfterPaint, 850);
        } else {
          notifyReadyAfterPaint();
        }
      } else if (attempts < 10) {
        attempts++;
        retryTimer = window.setTimeout(checkAndCenter, 100);
      }
    };

    checkAndCenter();
    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (readyTimer !== null) window.clearTimeout(readyTimer);
      if (firstPaintFrame !== null) window.cancelAnimationFrame(firstPaintFrame);
      if (secondPaintFrame !== null) window.cancelAnimationFrame(secondPaintFrame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateInitialEntrance, initializeCamera, loadState, mobilePerformanceMode, onReady, reducedMotion]);



  useEffect(() => {
    if (!recenterSignal || loadState !== "ready") return;
    recenter();
  }, [recenterSignal, loadState, recenter]);

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

  const [flashSelection, setFlashSelection] = useState<ImpactSelection>(null);
  const [flashStationId, setFlashStationId] = useState<string | null>(null);
  const [isSelectionFastFlashing, setIsSelectionFastFlashing] = useState(false);
  const [isStationFastFlashing, setIsStationFastFlashing] = useState(false);

  const commuteFlashStationIds = useMemo(() => {
    if (!commutePathPreview || commutePathPreview.stationIds.length === 0) {
      return [];
    }
    const origin = commutePathPreview.stationIds[0];
    const destination = commutePathPreview.stationIds.at(-1);
    return origin && destination ? [origin, destination] : [];
  }, [commutePathPreview]);

  useEffect(() => {
    if (!selection) {
      const fallbackTimer = window.setTimeout(() => {
        setFlashSelection(null);
        setIsSelectionFastFlashing(false);
      }, 0);
      return () => window.clearTimeout(fallbackTimer);
    }
    
    const timer0 = window.setTimeout(() => {
      setFlashSelection(selection);
      setIsSelectionFastFlashing(true);
    }, 0);
    
    let timer: number | undefined;
    const isDesktop = !window.matchMedia("(max-width: 767px)").matches;
    if (isDesktop) {
      // Transition from fast flash to latent pulse after 2.4 seconds
      timer = window.setTimeout(() => {
        setIsSelectionFastFlashing(false);
      }, 2400);
    }

    return () => {
      window.clearTimeout(timer0);
      if (timer) window.clearTimeout(timer);
    };
  }, [selection]);

  useEffect(() => {
    if (!selectedStationId) {
      const fallbackTimer = window.setTimeout(() => {
        setFlashStationId(null);
        setIsStationFastFlashing(false);
      }, 0);
      return () => window.clearTimeout(fallbackTimer);
    }
    
    const timer0 = window.setTimeout(() => {
      setFlashStationId(selectedStationId);
      setIsStationFastFlashing(true);
    }, 0);
    
    let timer: number | undefined;
    const isDesktop = !window.matchMedia("(max-width: 767px)").matches;
    if (isDesktop) {
      // Transition from fast flash to latent pulse after 2.4 seconds on desktop
      timer = window.setTimeout(() => {
        setIsStationFastFlashing(false);
      }, 2400);
    } else {
      // On mobile, clear flashStationId after 2.5 seconds
      timer = window.setTimeout(() => {
        setFlashStationId(null);
        setIsStationFastFlashing(false);
      }, 2500);
    }
    
    return () => {
      window.clearTimeout(timer0);
      if (timer) window.clearTimeout(timer);
    };
  }, [selectedStationId]);

  const focusTargetKey = useMemo(() => {
    if (selection) return `${selection.kind}:${selection.id}`;
    if (selectedStationId) return `station:${selectedStationId}`;
    return null;
  }, [selection, selectedStationId]);

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

  useEffect(() => {
    if (loadState !== "ready") return;

    const currentLayoutKey = `${layoutResetSignal ?? 0}:${desktopMenuPinned ? "pinned" : "free"}:${viewportOrientation}`;

    if (isGestureActive) return;

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

    const rotatedPreviewFocusRatio =
      viewportOrientation === "rotated-landscape" ? { x: 0.5, y: 0.34 } : undefined;
    const pinnedDesktopFocusInsets = (() => {
      if (!desktopMenuPinned || typeof window === "undefined" || window.matchMedia("(max-width: 767px)").matches) {
        return undefined;
      }

      const viewport = containerRef.current;
      const shell = viewport?.closest<HTMLElement>(".linewatch-shell");
      if (!viewport || !shell) return undefined;

      const viewportRect = viewport.getBoundingClientRect();
      const overlayRightEdges = [
        shell.querySelector<HTMLElement>("#linewatch-main-menu"),
        shell.querySelector<HTMLElement>(".floating-panel-shell"),
      ].flatMap((element) => {
        if (!element || element.getAttribute("aria-hidden") === "true") return [];
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 ? [rect.right] : [];
      });

      if (overlayRightEdges.length === 0) return undefined;
      const overlayRight = Math.max(...overlayRightEdges);
      const minimumVisibleWidth = Math.min(320, viewportRect.width * 0.4);
      const left = Math.min(
        Math.max(overlayRight - viewportRect.left + 16, 0),
        Math.max(viewportRect.width - minimumVisibleWidth, 0),
      );
      return left > 0 ? { left } : undefined;
    })();
    const focusViewportOptions = {
      viewportFocusRatio: rotatedPreviewFocusRatio,
      viewportInsets: pinnedDesktopFocusInsets,
    };

    if (selection) {
      if (selectedSegmentIds.length === 0) {
        // Fallback: zoom/pan to the station if this is a station-specific impact
        const matchingImpacts = stationNodeImpacts.filter(
          (impact) => impact.cardId === selection.id && impact.kind === selection.kind
        );
        if (matchingImpacts.length > 0) {
          let sumX = 0;
          let sumY = 0;
          let count = 0;
          matchingImpacts.forEach((impact) => {
            const station = stations.find((s) => s.id === impact.stationId);
            if (station) {
              const pt = stationPointFor(station);
              sumX += pt.x;
              sumY += pt.y;
              count++;
            }
          });
          if (count > 0) {
            const scaleFactor = 4500 / 8250;
            const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
            const targetScale = isMobile ? 3.8 : 1.8;
            zoomToPoint((sumX / count) * scaleFactor, (sumY / count) * scaleFactor, targetScale, {
              ...focusViewportOptions,
            });
            lastFocusedTargetKeyRef.current = focusTargetKey;
            lastFocusLayoutKeyRef.current = currentLayoutKey;
          }
        }
      } else {
        const center = getSegmentsCenter(selectedSegmentIds, networkSegments, mapStations, anchorPoints, guidePaths);
        if (center) {
          const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
          const targetScale = isMobile ? 3.8 : 1.8;
          zoomToPoint(center.x, center.y, targetScale, {
            ...focusViewportOptions,
          });
          lastFocusedTargetKeyRef.current = focusTargetKey;
          lastFocusLayoutKeyRef.current = currentLayoutKey;
        }
      }
    } else if (selectedStationId) {
      // Zoom/pan to the selected station with the same animation
      const station = stations.find((s) => s.id === selectedStationId);
      if (station) {
        const scaleFactor = 4500 / 8250;
        const pt = stationPointFor(station);
        const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
        const targetScale = isMobile ? 3.8 : 1.8;
        zoomToPoint(pt.x * scaleFactor, pt.y * scaleFactor, targetScale, {
          ...focusViewportOptions,
        });
        lastFocusedTargetKeyRef.current = focusTargetKey;
        lastFocusLayoutKeyRef.current = currentLayoutKey;
      }
    }
  }, [
    focusTargetKey,
    isGestureActive,
    selection,
    selectedStationId,
    selectedSegmentIds,
    networkSegments,
    mapStations,
    anchorPoints,
    guidePaths,
    zoomToPoint,
    loadState,
    preserveCameraOnSelectionClear,
    recenter,
    stationNodeImpacts,
    stations,
    stationPointFor,
    layoutResetSignal,
    viewportOrientation,
    desktopMenuPinned,
    containerRef,
  ]);

  const stationBySummaryId = useMemo(() => {
    return new Map(stations.map((station) => [station.id, station]));
  }, [stations]);

  const linkedPlannedClosureIds = useMemo(() => new Set(
    activeAlerts
      .map((alert) => alert.relatedPlannedClosureId)
      .filter((id): id is string => Boolean(id)),
  ), [activeAlerts]);
  const overlapPlannedClosures = useMemo(
    () => plannedClosures.filter((closure) => !linkedPlannedClosureIds.has(closure.id)),
    [linkedPlannedClosureIds, plannedClosures],
  );
  const plannedPreviewClosures = useMemo(
    () => plannedClosures.filter((closure) =>
      !linkedPlannedClosureIds.has(closure.id)
        || (selection?.kind === "planned-closure" && selection.id === closure.id),
    ),
    [linkedPlannedClosureIds, plannedClosures, selection],
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
          pathD: resolveNetworkSegmentPath(segment, mapStations, anchorPoints, guidePaths),
          patternOriginX: originX,
          patternOriginY: originY,
          patternAngle: angle,
        } as RenderedNetworkSegment;
      })
      .filter((segment): segment is RenderedNetworkSegment => Boolean(segment.pathD));
  }, [networkSegments, mapStations, anchorPoints, guidePaths]);

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
        const corridor = composeNetworkSegmentPath(orderedSegments, "bidirectional");
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

  const selectedImpactEmphasis = useMemo<SelectedImpactEmphasisLayer | null>(() => {
    if (!flashSelection) return null;

    const activeLayer = renderedImpactLayers.find(
      ({ impact }) => impact.kind === flashSelection.kind && impact.cardId === flashSelection.id,
    );
    if (activeLayer) {
      return {
        id: flashSelection.id,
        segment: activeLayer.segment,
        impact: activeLayer.impact,
        plannedClosure: null,
      };
    }

    if (flashSelection.kind !== "planned-closure") return null;
    const previewLayer = plannedPreviewLayers.find(({ closure }) => closure.id === flashSelection.id);
    return previewLayer ? {
      id: flashSelection.id,
      segment: previewLayer.segment,
      impact: null,
      plannedClosure: previewLayer.closure,
    } : null;
  }, [flashSelection, plannedPreviewLayers, renderedImpactLayers]);

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
    const plannedKeys = plannedPreviewLayers
      .map(({ closure, segment }) => `${segment.id}:${closure.id}`)
      .join("|");
    const impactKeys = renderedImpactLayers
      .map(({ segment, impact }) => `${segment.id}:${impact.kind}:${impact.cardId}:${impact.travelDirection}`)
      .join("|");
    const stationKeys = stationNodeImpacts
      .map((impact) => `${impact.kind}:${impact.cardId}:${impact.stationId}`)
      .join("|");
    return `${plannedKeys}::${impactKeys}::${stationKeys}`;
  }, [plannedPreviewLayers, renderedImpactLayers, stationNodeImpacts]);

  useEffect(() => {
    mapRootRef.current?.style.setProperty(
      "--map-pulse-offset",
      `-${Math.round(performance.now() % MAP_PULSE_CYCLE_MS)}ms`,
    );
  }, [pulseSyncSignature]);

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
        const position = chooseNonIntersectingBadgePosition(frame.point, size, occupiedBoxes, frame, placedBadges);
        occupiedBoxes.push(expandBox(boundsForBadgePosition(position, size), 12));
        placedBadges.push({ anchor: frame.point, position, size });

        return {
          segmentId: group.segments[0]?.id ?? segment.id,
          label: segment.label,
          impactKinds: group.impactKinds,
          impacts: group.impacts,
          anchor: frame.point,
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
      position: badge.position,
      size: badge.size,
    }));

    return stationOverlapBadgeGroups
      .map((group) => {
        const station = stationBySummaryId.get(group.stationId);
        if (!station) return null;

        const point = stationPointFor(station);
        const size = overlapBadgeSize(overlapBadgeVisualItemCount(overlapBadgeKindCounts(group.impacts)));
        const position = chooseNonIntersectingBadgePosition(point, size, occupiedBoxes, null, placedBadges);
        occupiedBoxes.push(expandBox(boundsForBadgePosition(position, size), 12));
        placedBadges.push({ anchor: point, position, size });

        return {
          segmentId: `station-${group.stationId}-${group.signature}`,
          label: station.name,
          impactKinds: group.impactKinds,
          impacts: group.impacts,
          anchor: point,
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

  const overlapBadges = useMemo<OverlapBadgeWithChooser[]>(() => {
    const badges = [...overlapBadgeSegments, ...stationOverlapBadges];
    const badgeBoxes = badges.map((badge) => expandBox(boundsForBadgePosition(badge.position, badge.size), 12));

    return badges.map((badge) => {
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
  }, [mapViewportSize.width, overlapBadgeSegments, stationOverlapBadges]);
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
  const highlightOverlapChooserImpact = useCallback((impact: MapImpact | null) => {
    if (!impact) {
      setHoveredOverlayHighlight(null);
      setHoveredOverlayForeground(null);
      setHoveredStationImpact(null);
      return;
    }

    const stationImpact = stationNodeImpacts.find((candidate) =>
      candidate.kind === impact.kind && candidate.cardId === impact.cardId,
    );
    setHoveredStationImpact(stationImpact ? { kind: impact.kind, id: impact.cardId } : null);
    const renderedImpact = renderedImpactLayers.find(({ impact: rendered }) =>
      rendered.kind === impact.kind && rendered.cardId === impact.cardId,
    );
    if (renderedImpact) {
      setHoveredOverlayForeground({
        key: `chooser:${impact.kind}:${impact.cardId}`,
        segment: renderedImpact.segment,
        impact: renderedImpact.impact,
        plannedClosure: null,
      });
      setHoveredOverlayHighlight({
        key: `chooser:${impact.kind}:${impact.cardId}`,
        pathD: renderedImpact.segment.pathD,
        visualState: visualStateForImpactKind(impact.kind),
      });
      return;
    }

    const plannedPreview = impact.kind === "planned-closure"
      ? plannedPreviewLayers.find(({ closure }) => closure.id === impact.cardId)
      : null;
    setHoveredOverlayForeground(plannedPreview ? {
      key: `chooser:${impact.kind}:${impact.cardId}`,
      segment: plannedPreview.segment,
      impact: null,
      plannedClosure: plannedPreview.closure,
    } : null);
    setHoveredOverlayHighlight(plannedPreview ? {
      key: `chooser:${impact.kind}:${impact.cardId}`,
      pathD: plannedPreview.segment.pathD,
      visualState: "planned-preview",
    } : null);
  }, [plannedPreviewLayers, renderedImpactLayers, stationNodeImpacts]);


  return (
    <div
      ref={mapRootRef}
      className={`relative w-full h-full flex flex-col overflow-hidden bg-transparent ${isGestureActive ? "map-gesture-active" : ""}`}
      data-map-viewport-orientation={viewportOrientation}
      data-map-gesture-active={isGestureActive ? "true" : "false"}
    >
      {/* Top right Theme toggle (styled like hamburger) and poll chip */}
      <div className="map-utility-cluster absolute top-4 sm:top-6 right-4 sm:right-6 z-20 flex items-center gap-2 pointer-events-auto hidden">
        <LogsDropdown />
        <button
          onClick={onToggleTheme}
          className="theme-toggle-btn panel flex items-center justify-center w-10 sm:w-14 h-10 sm:h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-100 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10]"
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
      <div ref={mapControlRailRef} className="map-control-rail desktop-map-control-rail absolute top-14 sm:top-[92px] left-1/2 -translate-x-1/2 z-30 flex flex-row items-center justify-center gap-1 sm:gap-2 pointer-events-auto">
        <div className="map-control-recenter-container">
          <button
            onClick={recenter}
            className="map-control-button group"
            title="Center view"
            aria-label="Center map view"
          >
            <Locate size={20} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            <span className="map-control-recenter-desktop-label text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Center</span>
          </button>
          <span className="map-control-recenter-mobile-label">Center Map</span>
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

          <div className="map-control-slider flex flex-col items-center justify-center gap-1.5 mx-0.5 sm:mx-1">
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
            <span className="text-[10px] font-mono font-black select-none tracking-wider">
              {Math.round(relativeScale * 100)}%
            </span>
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
      </div>

      {/* Map Viewport */}
      <div
        ref={containerRef}
        data-map-pan-zoom-viewport
        className={`relative w-full h-full overflow-hidden select-none touch-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
        onClick={() => {
          if (shouldSuppressMapClick()) return;
          setExpandedOverlapBadgeId(null);
        }}
      >
        {loadState === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-600 dark:text-white/60 font-medium">
            Loading TTC Map...
          </div>
        )}
        {loadState === "error" && (
          <div className="absolute inset-0 flex items-center justify-center text-red-500 dark:text-red-400 font-medium">
            Failed to load map asset.
          </div>
        )}
        <div className="map-attribution-notice" aria-label="TTC map copyright notice">
          © 2026 Toronto Transit Commission 02/26 - Map Not to Scale
        </div>

        {loadState === "ready" && (
          <div
            ref={mapRef}
            className="absolute top-0 left-0 w-full h-full origin-top-left"
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: "0 0",
              transition: reducedMotion || mobilePerformanceMode
                ? "none"
                : isDragging
                  ? "none"
                  : "transform 0.1s ease-out",
            }}
          >
            <style>
              {`
                #non-linear-guides-layer { display: none; }

                /* Dark theme overrides for black elements in the SVG */
                .dark .ttc-svg-container svg .fil6,
                .dark .ttc-svg-container svg .fil1,
                .dark .ttc-svg-container svg [fill="black"],
                .dark .ttc-svg-container svg [fill="#000000"],
                .dark .ttc-svg-container svg [style*="fill:#000000"],
                .dark .ttc-svg-container svg [style*="fill:black"] {
                  fill: #f1f5f9 !important;
                }

                /* Keep all standard station dot outer borders black (targets all dots inside stations-layer) */
                .dark .ttc-svg-container svg #layer6 .fil6,
                .dark .ttc-svg-container svg #layer6 [fill="#000000"],
                .dark .ttc-svg-container svg #layer6 [style*="fill:#000000"],
                .dark .ttc-svg-container svg #layer6 [style*="fill:black"] {
                  fill: #000000 !important;
                }

                /* Keep Spadina transfer capsule connector inner black */
                .dark .ttc-svg-container svg #path770 {
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

            {/* The single synchronized SVG viewport with perfect z-indexing */}
            <div className="w-[4500px] h-[2181.8px] max-w-none ttc-svg-container pointer-events-none absolute top-0 left-0">
              <svg
                ref={mapSvgRef}
                className="w-full h-full pointer-events-none"
                viewBox="0 0 8250 4000"
                preserveAspectRatio="xMidYMid meet"
              >
                {/* Bottom Layer: Base tracks */}
                <g dangerouslySetInnerHTML={{ __html: svgParts?.part1 ?? "" }} />

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
                  {retainedPlannedPreviewLayers.map(({ key, item: { segment, closure }, exiting }) => {
                    if (
                      commutePreviewLayer &&
                      selectedImpactEmphasis?.plannedClosure?.id === closure.id
                    ) {
                      return null;
                    }
                    return (
                      <OverlaySegment
                        key={key}
                        segment={segment}
                        impact={null}
                        plannedClosure={closure}
                        selection={selection}
                        selectedSegmentIds={selectedSegmentIds}
                        onSelectImpact={onSelectImpact}
                        shouldSuppressMapClick={shouldSuppressMapClick}
                        reducedMotion={reducedMotion}
                        exiting={exiting}
                        onHoverHighlightChange={setHoveredOverlayHighlight}
                        renderInteractionTarget={false}
                      />
                    );
                  })}
                  {retainedImpactLayers.map(({ key, item: { segment, impact }, exiting }) => {
                    if (
                      commutePreviewLayer &&
                      selectedImpactEmphasis?.impact?.kind === impact.kind &&
                      selectedImpactEmphasis.impact.cardId === impact.cardId
                    ) {
                      return null;
                    }
                    return (
                      <OverlaySegment
                        key={key}
                        segment={segment}
                        impact={impact}
                        plannedClosure={undefined}
                        selection={selection}
                        selectedSegmentIds={selectedSegmentIds}
                        onSelectImpact={onSelectImpact}
                        shouldSuppressMapClick={shouldSuppressMapClick}
                        reducedMotion={reducedMotion}
                        exiting={exiting}
                        onHoverHighlightChange={setHoveredOverlayHighlight}
                        renderInteractionTarget={false}
                      />
                    );
                  })}
                </g>

                <g aria-label="Saved commute route preview">
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
                          reducedMotion={reducedMotion}
                          idSuffix="-commute-focus"
                          onHoverHighlightChange={setHoveredOverlayHighlight}
                          renderInteractionTarget={false}
                        />
                      </g>
                    ) : (
                      <SelectedImpactEmphasis
                        emphasis={selectedImpactEmphasis}
                        fast={isSelectionFastFlashing}
                      />
                    )
                  ) : null}
                </g>

                <g aria-hidden="true" className="hover-priority-overlay">
                  {hoveredOverlayForeground ? (
                    <g
                      key={`${hoveredOverlayForeground.key}:foreground`}
                      data-hover-foreground-impact={hoveredOverlayForeground.key}
                    >
                      <OverlaySegment
                        segment={hoveredOverlayForeground.segment}
                        impact={hoveredOverlayForeground.impact}
                        plannedClosure={hoveredOverlayForeground.plannedClosure ?? undefined}
                        selection={selection}
                        selectedSegmentIds={selectedSegmentIds}
                        onSelectImpact={onSelectImpact}
                        shouldSuppressMapClick={shouldSuppressMapClick}
                        reducedMotion={reducedMotion}
                        idSuffix="-chooser-foreground"
                        renderInteractionTarget={false}
                      />
                    </g>
                  ) : null}
                  {hoveredOverlayHighlight ? (
                    <g
                      key={hoveredOverlayHighlight.key}
                      data-hover-priority-impact={hoveredOverlayHighlight.key}
                    >
                      <defs>
                        <mask
                          id="hover-priority-boundary-ring-mask"
                          maskUnits="userSpaceOnUse"
                          x="0"
                          y="0"
                          width="8250"
                          height="4000"
                        >
                          <rect width="8250" height="4000" fill="black" />
                          <path
                            d={hoveredOverlayHighlight.pathD}
                            fill="none"
                            stroke="white"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="120"
                          />
                          <path
                            d={hoveredOverlayHighlight.pathD}
                            fill="none"
                            stroke="black"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="102"
                          />
                        </mask>
                      </defs>
                      <path
                        className={`asset-alert-path-glow hover-priority-glow ${hoveredOverlayHighlight.visualState}`}
                        d={hoveredOverlayHighlight.pathD}
                      />
                      <path
                        className={`asset-alert-path-hover-boundary hover-priority-boundary ${hoveredOverlayHighlight.visualState}`}
                        d={hoveredOverlayHighlight.pathD}
                        mask="url(#hover-priority-boundary-ring-mask)"
                      />
                    </g>
                  ) : null}
                </g>

                {/* Top Layer: Stations (layer6) and text */}
                <g dangerouslySetInnerHTML={{ __html: svgParts?.part2 ?? "" }} />

                <g aria-label="Estimated train markers">
                  <EstimatedTrainMarkerLayer
                    enabled={estimatedTrainsEnabled}
                    markers={estimatedTrainMarkers}
                    segments={renderedNetworkSegments}
                    muted={Boolean(selection || selectedStationId || commutePathPreview)}
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
                        isOpen={false}
                        onToggle={() => setExpandedOverlapBadgeId(badge.segmentId)}
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
                        onToggle={() => setExpandedOverlapBadgeId(null)}
                        shouldSuppressMapClick={shouldSuppressMapClick}
                      />
                    ))}
                </g>

                {/* Cardinal North Compass fixed to map */}
                <g aria-label="Cardinal North Compass" transform="translate(7600, 2300) scale(4)">
                  <image href="/assets/linewatch/cardinal-north.svg" width="75" height="100" className="opacity-90" style={{ filter: isDark ? "invert(1)" : "none" }} />
                </g>
              </svg>
            </div>

            {/* Interactive Layer: Hit targets on the very top so they hover ABOVE stations */}
            <svg
              className="absolute top-0 left-0 w-[4500px] h-[2181.8px] pointer-events-none"
              viewBox="0 0 8250 4000"
              preserveAspectRatio="xMidYMid meet"
            >
              <g aria-label="Disruption overlay interaction targets">
                {retainedPlannedPreviewLayers.map(({ key, item: { segment, closure }, exiting }) => (
                  <OverlayInteractionTarget
                    key={`interaction:${key}`}
                    segment={segment}
                    impact={null}
                    plannedClosure={closure}
                    selectionActive={Boolean(selection)}
                    exiting={exiting}
                    onSelectImpact={onSelectImpact}
                    shouldSuppressMapClick={shouldSuppressMapClick}
                    onHoverHighlightChange={setHoveredOverlayHighlight}
                  />
                ))}
                {retainedImpactLayers.map(({ key, item: { segment, impact }, exiting }) => (
                  <OverlayInteractionTarget
                    key={`interaction:${key}`}
                    segment={segment}
                    impact={impact}
                    plannedClosure={undefined}
                    selectionActive={Boolean(selection)}
                    exiting={exiting}
                    onSelectImpact={onSelectImpact}
                    shouldSuppressMapClick={shouldSuppressMapClick}
                    onHoverHighlightChange={setHoveredOverlayHighlight}
                  />
                ))}
              </g>
              <g aria-label="Station hit targets">
                {stations.map((station) => {
                  const selected = selectedStationId === station.id;
                  const isLarge = isStationVisuallyLarge(station);
                  const visualAnchors = visualAnchorsForStation(station);
                  const hasMultipleVisualAnchors = visualAnchors.length > 1;
                  const hitRadius = selection
                    ? hasMultipleVisualAnchors ? 34 : isLarge ? 46 : 32
                    : hasMultipleVisualAnchors ? 45 : isLarge ? 66 : 41;
                  const usesIndependentSpadinaHover = station.id === "spadina" && visualAnchors.length === 2;
                  const hoverRadius = usesIndependentSpadinaHover ? 34 : isLarge ? 72 : 48;
                  const highlightRadius = hasMultipleVisualAnchors ? 33 : isLarge ? 48 : 38;
                  const showStationHover =
                    hoveredStationId === station.id &&
                    !selected;

                  return (
                    <g
                      key={station.id}
                      onPointerEnter={(event) => {
                        if (event.pointerType !== "mouse") return;
                        setHoveredStationId(station.id);
                      }}
                      onPointerLeave={(event) => {
                        if (event.pointerType !== "mouse") return;
                        setHoveredStationId((current) => current === station.id ? null : current);
                      }}
                      onFocus={() => {
                        setHoveredStationId(station.id);
                      }}
                      onBlur={() => {
                        setHoveredStationId((current) => current === station.id ? null : current);
                      }}
                    >
                      {visualAnchors.map(({ id: anchorId, point }, anchorIndex) => (
                        <g key={`${station.id}:${anchorId}`}>
                          <circle
                            data-station-hover-id={station.id}
                            data-station-anchor-id={anchorId}
                            className={`station-hover-indicator ${showStationHover ? "active" : ""}`}
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
                                selected && flashStationId === station.id ? "foreground-flash-active" : ""
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
                            onClick={(event) => {
                              if (shouldSuppressMapClick()) return;
                              event.stopPropagation();
                              if (hasMultipleVisualAnchors) setHoveredStationId(null);
                              onSelectStationId(selected ? null : station.id);
                            }}
                            onKeyDown={(event) => {
                              if (anchorIndex !== 0) return;
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                if (hasMultipleVisualAnchors) setHoveredStationId(null);
                                onSelectStationId(selected ? null : station.id);
                              }
                            }}
                            role="button"
                            tabIndex={anchorIndex === 0 ? 0 : -1}
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
                            onClick={(event) => {
                              if (exiting) return;
                              if (shouldSuppressMapClick()) return;
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
                              setHoveredStationImpact({ kind: impact.kind, id: impact.cardId });
                            }}
                            onPointerLeave={(event) => {
                              if (event.pointerType !== "mouse") return;
                              setHoveredStationImpact((current) =>
                                current?.kind === impact.kind && current.id === impact.cardId ? null : current,
                              );
                            }}
                            onFocus={() => setHoveredStationImpact({ kind: impact.kind, id: impact.cardId })}
                            onBlur={() => setHoveredStationImpact((current) =>
                              current?.kind === impact.kind && current.id === impact.cardId ? null : current,
                            )}
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
                  if (flashStationId !== station.id) return null;
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
                          className={`station-selection-flash ${isStationFastFlashing ? "fast" : "latent"}`}
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
                  const hoverHighlighted = hoveredStationImpact?.kind === impact.kind
                    && hoveredStationImpact.id === impact.cardId;

                  return (
                    <g key={`foreground:${key}`}>
                      {visualAnchors.map(({ id: anchorId, point }) => (
                        <g key={`foreground-anchor:${key}:${anchorId}`}>
                          {flashSelection && flashSelection.kind === impact.kind && flashSelection.id === impact.cardId ? (
                            <circle
                              data-map-highlight-id={flashSelection.id}
                              data-station-impact-selection-id={impact.cardId}
                              className={`station-selection-flash ${isSelectionFastFlashing ? "fast" : "latent"}`}
                              cx={point.x}
                              cy={point.y}
                              r={impactRingRadius}
                            />
                          ) : null}
                          {hoverHighlighted ? (
                            <circle
                              data-station-impact-hover-id={impact.cardId}
                              className="station-impact-hover-priority"
                              cx={point.x}
                              cy={point.y}
                              r={impactRingRadius + 5}
                            />
                          ) : null}
                        </g>
                      ))}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        )}
        {expandedOverlapBadge && expandedOverlapChooserLayout ? (
          <OverlapChooser
            key={expandedOverlapBadge.segmentId}
            badge={expandedOverlapBadge}
            layout={expandedOverlapChooserLayout}
            onSelectImpact={onSelectImpact}
            onHoverImpact={highlightOverlapChooserImpact}
            onClose={(restoreFocus) => {
              setHoveredOverlayHighlight(null);
              setHoveredOverlayForeground(null);
              setHoveredStationImpact(null);
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
          />
        ) : null}
      </div>
      {commutePathPreview ? (
        <div className="commute-path-preview-chip" role="status" aria-live="polite">
          <span>
            Viewing <strong>{commutePathPreview.routeLabel}</strong>
          </span>
          <button type="button" onClick={onClearCommutePathPreview} aria-label="Back to saved commutes">
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

type OverlapBadgeSize = {
  width: number;
  height: number;
};

type OverlapBadgePosition = MapPoint & {
  collisionAvoided: boolean;
};

type OverlapBadgeSegment = {
  segmentId: string;
  label: string;
  impactKinds: MapImpactKind[];
  impacts: MapImpact[];
  anchor: MapPoint;
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

type HoveredOverlayHighlight = {
  key: string;
  pathD: string;
  visualState: OverlayVisualState;
};

type HoveredOverlayForeground = {
  key: string;
  segment: RenderedNetworkSegment;
  impact: MapImpact | null;
  plannedClosure: PlannedClosure | null;
};

const MAP_VIEWBOX_BOUNDS: SvgBounds = { x: 0, y: 0, width: 8250, height: 4000 };
const OVERLAY_CORRIDOR_COLLISION_RADIUS = 54;
const BASE_ROUTE_COLLISION_RADIUS = 78;
const OVERLAP_BADGE_EDGE_GAP = 8;
// Matches the 10-unit candidate and 12-unit occupied-box padding below, so an
// aligned pair can touch those collision envelopes without visually drifting.
// We add an extra 14 units because 22 was too close visually.
const OVERLAP_BADGE_SIBLING_CLEARANCE = 36;
const OVERLAP_BADGE_ALIGNMENT_MAX_ANCHOR_DISTANCE = 260;
// Overlap markers are a primary alert-discovery control. Keep their collision
// footprint in step with the rendered SVG scale so the larger desktop and
// mobile targets still clear nearby map content.
const OVERLAP_INDICATOR_SCALE = 1.5;
const OVERLAP_BADGE_CIRCLE_RADIUS = 35;
const OVERLAP_BADGE_ITEM_GAP = 10;
const OVERLAP_BADGE_ITEM_SPACING = OVERLAP_BADGE_CIRCLE_RADIUS * 2 + OVERLAP_BADGE_ITEM_GAP;
const OVERLAP_BADGE_PILL_THICKNESS = OVERLAP_BADGE_CIRCLE_RADIUS * 2 + OVERLAP_BADGE_ITEM_GAP * 2;
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

function stationOverlapProtectedBox(point: MapPoint): SvgBounds {
  return expandBox(
    { x: point.x, y: point.y, width: 0, height: 0 },
    OVERLAY_CORRIDOR_COLLISION_RADIUS,
  );
}

const CHOOSER_KEEPOUT_SELECTOR = [
  ".desktop-status-capsule-anchor",
  ".desktop-map-control-rail",
  ".desktop-map-legend",
  ".desktop-status-chip-row-container",
  ".mobile-bottom-nav",
  ".mobile-status-peek",
  ".mobile-legend-pill",
  ".mobile-train-toggle",
  ".map-utility-cluster",
  ".map-control-rail",
  ".mobile-map-controls",
  ".rotated-map-hud",
  ".rotated-map-selection-hud",
  ".subway-closing-soon-chip",
  ".subway-closed-peek-chip",
  "header button",
  "header a",
].join(",");

function isVisibleChooserKeepout(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none"
    && style.visibility !== "hidden"
    && Number(style.opacity) > 0
    && rect.width > 0
    && rect.height > 0;
}

function overlapChooserSize(impactCount: number, viewportWidth = OVERLAP_CHOOSER_WIDTH + 32): OverlapBadgeSize {
  const isMobile = viewportWidth <= OVERLAP_CHOOSER_MOBILE_BREAKPOINT;
  const maximumWidth = isMobile ? OVERLAP_CHOOSER_MOBILE_WIDTH : OVERLAP_CHOOSER_WIDTH;
  const horizontalMargin = isMobile ? 48 : 32;
  return {
    width: Math.max(240, Math.min(maximumWidth, viewportWidth - horizontalMargin)),
    height: isMobile
      ? Math.min(380, 56 + impactCount * 64)
      : Math.min(440, 68 + impactCount * 76),
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
  anchorOffsetX: number;
  anchorOffsetY: number;
};

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
  const horizontalCenter = (sign: number, gap: number) => ({
    x: sign < 0
      ? protectedArea.x - badge.chooserSize.width / 2 - gap
      : protectedArea.x + protectedArea.width + badge.chooserSize.width / 2 + gap,
    y: clampChooserScreenCoordinate(proposed.y, badge.chooserSize.height, viewportSize.height, margin),
  });
  const verticalCenter = (sign: number, gap: number) => ({
    x: clampChooserScreenCoordinate(proposed.x, badge.chooserSize.width, viewportSize.width, margin),
    y: sign < 0
      ? protectedArea.y - badge.chooserSize.height / 2 - gap
      : protectedArea.y + protectedArea.height + badge.chooserSize.height / 2 + gap,
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
  const hardKeepoutBoxes = [badgeScreenBox, ...screenKeepoutBoxes];
  const localProtectedBoxes = nearestProtectedBoxesToPoint(representedProtectedBoxes, anchor, 6);
  const alertEdgeCandidates = chooserKeepoutEdgeCandidates(
    proposed,
    badge.chooserSize,
    viewportSize,
    [protectedArea, ...localProtectedBoxes],
    margin,
    OVERLAP_CHOOSER_TARGET_GAP,
  );
  const uiEdgeCandidates = chooserKeepoutEdgeCandidates(
    proposed,
    badge.chooserSize,
    viewportSize,
    hardKeepoutBoxes,
    margin,
  );
  const hardBlockedBoxes = [...representedProtectedBoxes, ...hardKeepoutBoxes];
  const viewportCandidates = boundedChooserViewportCandidates(
    anchor,
    badge.chooserSize,
    viewportSize,
    margin,
  );
  const validCandidates = [
    ...preferredCandidates,
    ...edgeCandidates,
    ...alertEdgeCandidates,
    ...uiEdgeCandidates,
    ...viewportCandidates,
  ]
    .filter((candidate) =>
      chooserCenterFitsViewport(candidate, badge.chooserSize, viewportSize, 0)
        && chooserCenterAvoidsProtectedBoxes(candidate, badge.chooserSize, hardBlockedBoxes),
    );
  const hardKeepoutCandidates = validCandidates.length > 0 ? [] : [
    ...preferredCandidates,
    ...edgeCandidates,
    ...alertEdgeCandidates,
    ...uiEdgeCandidates,
    ...viewportCandidates,
  ].filter((candidate) =>
    chooserCenterFitsViewport(candidate, badge.chooserSize, viewportSize, 0)
      && chooserCenterAvoidsProtectedBoxes(candidate, badge.chooserSize, hardKeepoutBoxes),
  );
  const centerCandidates = validCandidates.length > 0 ? validCandidates : hardKeepoutCandidates;
  const center = centerCandidates.reduce<{ position: MapPoint; score: number } | null>((best, position) => {
    const score = scoreChooserScreenCandidate(
      position,
      anchor,
      badge.chooserSize,
      representedProtectedBoxes,
      alertOverlayProtectedBoxes,
    );
    return !best || score < best.score ? { position, score } : best;
  }, null)?.position ?? {
    x: clampChooserScreenCoordinate(proposed.x, badge.chooserSize.width, viewportSize.width, margin),
    y: clampChooserScreenCoordinate(proposed.y, badge.chooserSize.height, viewportSize.height, margin),
  };

  return {
    left: center.x - badge.chooserSize.width / 2,
    top: center.y - badge.chooserSize.height / 2,
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
    case "planned-closure":
      return 3;
    case "delay":
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

  return Array.from(groups.values());
}

function overlapBadgeSize(impactKindCount: number): OverlapBadgeSize {
  if (impactKindCount === 1) {
    return {
      width: OVERLAP_BADGE_PILL_THICKNESS * OVERLAP_INDICATOR_SCALE,
      height: OVERLAP_BADGE_PILL_THICKNESS * OVERLAP_INDICATOR_SCALE,
    };
  }

  const visibleCount = Math.min(3, impactKindCount);
  const hasMore = impactKindCount > visibleCount;
  const totalItems = visibleCount + (hasMore ? 1 : 0);
  return {
    width: Math.max(
      OVERLAP_BADGE_PILL_THICKNESS,
      (totalItems - 1) * OVERLAP_BADGE_ITEM_SPACING + OVERLAP_BADGE_PILL_THICKNESS,
    ) * OVERLAP_INDICATOR_SCALE,
    height: OVERLAP_BADGE_PILL_THICKNESS * OVERLAP_INDICATOR_SCALE,
  };
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
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return [];
      }
      try {
        const box = transformedSvgBounds(element);
        if (!box) return [];
        return mapCollisionBoxesForElementBounds(box);
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

function mapCollisionBoxesForElementBounds(box: SvgBounds): SvgBounds[] {
  if (box.width <= 0 || box.height <= 0) return [];
  if (box.width <= STANDARD_MAP_COMPONENT_MAX_BOUNDS && box.height <= STANDARD_MAP_COMPONENT_MAX_BOUNDS) {
    return [expandBox(box, 18)];
  }
  if (!isLargeMapComponentBounds(box)) return [];

  return splitLargeMapComponentBounds(box).map((tile) => expandBox(tile, 18));
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
    element.getCTM(),
    element.ownerSVGElement?.getCTM(),
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
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<SVGGElement>(null);
  const pathRef = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(handle);
  }, []);

  const { length, count, stepVal } = useMemo(() => {
    if (typeof document === "undefined") return { length: 0, count: 0, stepVal: step };
    try {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      const len = path.getTotalLength();
      if (len <= 0) return { length: 0, count: 0, stepVal: step };
      const cnt = Math.max(1, Math.floor(len / step));
      const s = len / cnt;
      return { length: len, count: cnt, stepVal: s };
    } catch (e) {
      console.error("Error creating SVG path for measurement:", e);
      return { length: 0, count: 0, stepVal: step };
    }
  }, [pathD, step]);

  useEffect(() => {
    if (!mounted || typeof document === "undefined") return;
    try {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      pathRef.current = path;
    } catch (e) {
      console.error("Error setting path reference:", e);
    }
  }, [pathD, mounted]);

  const indices = useMemo(() => {
    const arr: number[] = [];
    if (count <= 0) return arr;
    for (let i = -1; i <= count + 1; i++) {
      arr.push(i);
    }
    return arr;
  }, [count]);

  useEffect(() => {
    const container = containerRef.current;
    const path = pathRef.current;
    if (!mounted || !container || !path || length <= 0 || indices.length === 0) return;

    const childGroups = Array.from(container.children) as SVGGElement[];
    if (childGroups.length === 0) return;

    let animationFrameId: number;
    const duration = (stepVal / 80) * 6000; // restore travel speed base to 6000ms

    const applyPhase = (phase: number) => {
      const dy = travelDirection === "bidirectional" ? (direction === "reverse" ? 18 : -18) : 0;

      childGroups.forEach((group) => {
        const idxAttr = group.getAttribute("data-index");
        if (!idxAttr) return;
        const i = parseInt(idxAttr, 10);

        let dist = 0;
        if (direction === "forward") {
          dist = i * stepVal + phase;
        } else {
          dist = (count - i) * stepVal - phase;
        }

        // Hide if outside range with a buffer
        if (dist < -10 || dist > length + 10) {
          group.setAttribute("display", "none");
          return;
        } else {
          group.removeAttribute("display");
        }

        try {
          const p = path.getPointAtLength(Math.max(0, Math.min(length, dist)));
          const delta = 1;
          const pAhead = path.getPointAtLength(Math.min(length, dist + delta));
          const pBehind = path.getPointAtLength(Math.max(0, dist - delta));
          const dx = pAhead.x - pBehind.x;
          const dyTangent = pAhead.y - pBehind.y;
          let angle = Math.atan2(dyTangent, dx) * (180 / Math.PI);

          if (direction === "reverse") {
            angle += 180;
          }

          const angleForward = direction === "reverse" ? angle - 180 : angle;
          const angleForwardRad = (angleForward * Math.PI) / 180;
          const offsetX = -dy * Math.sin(angleForwardRad);
          const offsetY = dy * Math.cos(angleForwardRad);

          group.setAttribute(
            "transform",
            `translate(${p.x + offsetX} ${p.y + offsetY}) rotate(${angle})`
          );
        } catch {
          // Safe fallback
        }
      });
    };

    const update = () => {
      if (reducedMotion) {
        applyPhase(0);
        return;
      }

      const elapsed = performance.now();
      const phase = ((elapsed / duration) % 1) * stepVal;
      applyPhase(phase);

      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [mounted, length, count, stepVal, direction, travelDirection, reducedMotion, indices]);

  if (!mounted || count <= 0) return null;

  return (
    <g ref={containerRef}>
      {indices.map((i) => (
        <g key={i} data-index={i}>
          <path
            d="M -12 -10 L 8 0 L -12 10"
            className="rsz-chevron"
            aria-hidden="true"
          />
        </g>
      ))}
    </g>
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
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<SVGGElement>(null);
  const pathRef = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(handle);
  }, []);

  const { length, count, stepVal } = useMemo(() => {
    if (typeof document === "undefined") return { length: 0, count: 0, stepVal: step };
    try {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      const len = path.getTotalLength();
      if (len <= 0) return { length: 0, count: 0, stepVal: step };
      const cnt = Math.max(1, Math.floor(len / step));
      const s = len / cnt;
      return { length: len, count: cnt, stepVal: s };
    } catch (e) {
      console.error("Error creating SVG path for measurement:", e);
      return { length: 0, count: 0, stepVal: step };
    }
  }, [pathD, step]);

  useEffect(() => {
    if (!mounted || typeof document === "undefined") return;
    try {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      pathRef.current = path;
    } catch (e) {
      console.error("Error setting path reference:", e);
    }
  }, [pathD, mounted]);

  const indices = useMemo(() => {
    const arr: number[] = [];
    if (count <= 0) return arr;
    for (let i = -2; i <= count + 2; i++) {
      arr.push(i);
    }
    return arr;
  }, [count]);

  useEffect(() => {
    const container = containerRef.current;
    const path = pathRef.current;
    if (!mounted || !container || !path || length <= 0 || indices.length === 0) return;

    const childGroups = Array.from(container.children) as SVGGElement[];
    if (childGroups.length === 0) return;

    let animationFrameId: number;
    const duration = (stepVal / 80) * 12000;
    const startTime = performance.now();

    const applyPhase = (phase: number) => {
      const dy = travelDirection === "bidirectional" ? (direction === "reverse" ? 18 : -18) : 0;

      childGroups.forEach((group) => {
        const idxAttr = group.getAttribute("data-index");
        if (!idxAttr) return;
        const i = parseInt(idxAttr, 10);

        let dist = 0;
        if (direction === "forward") {
          dist = i * stepVal + phase;
        } else {
          dist = (count - i) * stepVal - phase;
        }

        if (dist < -70 || dist > length + 70) {
          group.setAttribute("display", "none");
          return;
        } else {
          group.removeAttribute("display");
        }

        try {
          const pDist = Math.max(0, Math.min(length, dist));
          const p = path.getPointAtLength(pDist);
          const delta = 1;
          const pAheadDist = Math.min(length, pDist + delta);
          const pBehindDist = Math.max(0, pDist - delta);
          const pAhead = path.getPointAtLength(pAheadDist);
          const pBehind = path.getPointAtLength(pBehindDist);
          const dx = pAhead.x - pBehind.x;
          const dyTangent = pAhead.y - pBehind.y;
          const angle = Math.atan2(dyTangent, dx) * (180 / Math.PI);

          const angleForward = direction === "reverse" ? angle - 180 : angle;
          const angleForwardRad = (angleForward * Math.PI) / 180;
          const offsetX = -dy * Math.sin(angleForwardRad);
          const offsetY = dy * Math.cos(angleForwardRad);

          let resolvedAngle = angle;
          if (direction === "reverse") {
            resolvedAngle += 180;
          }

          const shouldRotate = group.dataset.suspensionSymbol !== "no-entry";
          group.setAttribute(
            "transform",
            shouldRotate
              ? `translate(${p.x + offsetX} ${p.y + offsetY}) rotate(${resolvedAngle})`
              : `translate(${p.x + offsetX} ${p.y + offsetY})`
          );

          let opacity = 1.0;
          const fadeZone = 50;
          if (dist < 0) {
            opacity = 0;
          } else if (dist < fadeZone) {
            opacity = dist / fadeZone;
          } else if (dist > length) {
            opacity = 0;
          } else if (dist > length - fadeZone) {
            opacity = (length - dist) / fadeZone;
          }
          group.style.opacity = opacity.toString();
        } catch {
          // Safe fallback
        }
      });
    };

    const update = () => {
      if (reducedMotion) {
        applyPhase(0);
        return;
      }

      const elapsed = performance.now() - startTime;
      const phase = ((elapsed / duration) % 1) * (2 * stepVal);
      applyPhase(phase);

      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [mounted, length, count, stepVal, direction, travelDirection, reducedMotion, indices]);

  if (!mounted || count <= 0) return null;

  return (
    <g ref={containerRef}>
      {indices.map((i) => {
        const isNoEntry = Math.abs(i) % 2 === 0;
        return (
          <g key={i} data-index={i} data-suspension-symbol={isNoEntry ? "no-entry" : "direction-arrow"}>
            {isNoEntry ? (
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
          </g>
        );
      })}
    </g>
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
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<SVGGElement>(null);
  const pathRef = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(handle);
  }, []);

  const { length, count, stepVal } = useMemo(() => {
    if (typeof document === "undefined") return { length: 0, count: 0, stepVal: step };
    try {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      const len = path.getTotalLength();
      if (len <= 0) return { length: 0, count: 0, stepVal: step };
      const cnt = Math.max(1, Math.floor(len / step));
      const s = len / cnt;
      return { length: len, count: cnt, stepVal: s };
    } catch (e) {
      console.error("Error creating SVG path for measurement:", e);
      return { length: 0, count: 0, stepVal: step };
    }
  }, [pathD, step]);

  useEffect(() => {
    if (!mounted || typeof document === "undefined") return;
    try {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", pathD);
      pathRef.current = path;
    } catch (e) {
      console.error("Error setting path reference:", e);
    }
  }, [pathD, mounted]);

  const indices = useMemo(() => {
    const arr: number[] = [];
    if (count <= 0) return arr;
    for (let i = -2; i <= count + 2; i++) {
      arr.push(i);
    }
    return arr;
  }, [count]);

  useEffect(() => {
    const container = containerRef.current;
    const path = pathRef.current;
    if (!mounted || !container || !path || length <= 0 || indices.length === 0) return;

    const childGroups = Array.from(container.children) as SVGGElement[];
    if (childGroups.length === 0) return;

    let animationFrameId: number;
    const duration = (stepVal / 80) * 12000; // Double duration since the repeating unit (hourglass + arrow) spans 2 steps

    const applyPhase = (phase: number) => {
      const dy = travelDirection === "bidirectional" ? (direction === "reverse" ? 18 : -18) : 0;

      childGroups.forEach((group) => {
        const idxAttr = group.getAttribute("data-index");
        if (!idxAttr) return;
        const i = parseInt(idxAttr, 10);

        let dist = 0;
        if (direction === "forward") {
          dist = i * stepVal + phase;
        } else {
          dist = (count - i) * stepVal - phase;
        }

        if (dist < -10 || dist > length + 10) {
          group.setAttribute("display", "none");
          return;
        } else {
          group.removeAttribute("display");
        }

        try {
          const p = path.getPointAtLength(Math.max(0, Math.min(length, dist)));
          const delta = 1;
          const pAhead = path.getPointAtLength(Math.min(length, dist + delta));
          const pBehind = path.getPointAtLength(Math.max(0, dist - delta));
          const dx = pAhead.x - pBehind.x;
          const dyTangent = pAhead.y - pBehind.y;
          let angle = Math.atan2(dyTangent, dx) * (180 / Math.PI);

          if (direction === "reverse") {
            angle += 180;
          }

          const angleForward = direction === "reverse" ? angle - 180 : angle;
          const angleForwardRad = (angleForward * Math.PI) / 180;
          const offsetX = -dy * Math.sin(angleForwardRad);
          const offsetY = dy * Math.cos(angleForwardRad);

          group.setAttribute(
            "transform",
            `translate(${p.x + offsetX} ${p.y + offsetY}) rotate(${angle})`
          );
        } catch {
          // Safe fallback
        }
      });
    };

    const update = () => {
      if (reducedMotion) {
        applyPhase(0);
        return;
      }

      const elapsed = performance.now();
      const phase = ((elapsed / duration) % 1) * (2 * stepVal);
      applyPhase(phase);

      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [mounted, length, count, stepVal, direction, travelDirection, reducedMotion, indices]);

  if (!mounted || count <= 0) return null;

  return (
    <g ref={containerRef}>
      {indices.map((i) => {
        const isHourglass = Math.abs(i) % 2 === 0;
        if (!isHourglass && onlyHourglasses) return null;

        return (
          <g key={i} data-index={i}>
            {isHourglass ? (
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
            )}
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
}: {
  badge: OverlapBadgeWithChooser;
  layout: OverlapChooserScreenLayout;
  onSelectImpact: (selection: ImpactSelection) => void;
  onHoverImpact: (impact: MapImpact | null) => void;
  onClose: (restoreFocus: boolean) => void;
  reducedMotion: boolean;
  compactMotion: boolean;
}) {
  const data = useDashboardData();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const firstChoiceRef = useRef<HTMLButtonElement>(null);
  const closingRef = useRef(false);
  const initialAnchorOffsetRef = useRef({
    x: layout.anchorOffsetX,
    y: layout.anchorOffsetY,
  });
  const orderedImpacts = [...badge.impacts].sort(
    (a, b) => getImpactPriority(b.kind) - getImpactPriority(a.kind),
  );
  const chooserId = `overlap-chooser-${badge.segmentId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const stopChooserPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  useEffect(() => () => onHoverImpact(null), [onHoverImpact]);

  useEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => firstChoiceRef.current?.focus({ preventScroll: true }));
    if (reducedMotion) return;
    const initialAnchorOffset = initialAnchorOffsetRef.current;
    const animation = compactMotion
      ? surfaceRef.current?.animate([
          {
            borderRadius: "999px",
            opacity: 0.35,
            transform: `translate(${initialAnchorOffset.x}px, ${initialAnchorOffset.y}px) scale(0.12, 0.06)`,
          },
          { borderRadius: "20px", opacity: 1, offset: 0.62, transform: "scale(1.025, 0.98)" },
          { borderRadius: "14px", offset: 0.82, transform: "scale(0.99, 1.01)" },
          { borderRadius: "14px", opacity: 1, transform: "scale(1, 1)" },
        ], { duration: 380, easing: "cubic-bezier(0.16, 1, 0.3, 1)" })
      : surfaceRef.current?.animate([
          {
            borderRadius: "999px",
            filter: "blur(8px)",
            opacity: 0.28,
            transform: `translate(${initialAnchorOffset.x}px, ${initialAnchorOffset.y}px) scale(0.08, 0.04)`,
          },
          { borderRadius: "28px", filter: "blur(1px)", opacity: 1, offset: 0.56, transform: "scale(1.04, 0.96)" },
          { borderRadius: "14px", offset: 0.78, transform: "scale(0.975, 1.025)" },
          { borderRadius: "16px", filter: "blur(0)", opacity: 1, transform: "scale(1, 1)" },
        ], { duration: 650, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    return () => {
      window.cancelAnimationFrame(focusFrame);
      animation?.cancel();
    };
  }, [compactMotion, reducedMotion]);

  const close = async (restoreFocus: boolean) => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (!reducedMotion) {
      const animation = compactMotion
        ? surfaceRef.current?.animate([
            { borderRadius: "14px", opacity: 1, transform: "scale(1, 1)" },
            { borderRadius: "20px", offset: 0.34, transform: "scale(1.015, 0.97)" },
            {
              borderRadius: "999px",
              opacity: 0,
              transform: `translate(${layout.anchorOffsetX}px, ${layout.anchorOffsetY}px) scale(0.12, 0.06)`,
            },
          ], { duration: 200, easing: "cubic-bezier(0.7, 0, 0.84, 0)", fill: "forwards" })
        : surfaceRef.current?.animate([
            { borderRadius: "16px", filter: "blur(0)", opacity: 1, transform: "scale(1, 1)" },
            { borderRadius: "22px", offset: 0.32, transform: "scale(1.025, 0.96)" },
            {
              borderRadius: "999px",
              filter: "blur(8px)",
              opacity: 0,
              transform: `translate(${layout.anchorOffsetX}px, ${layout.anchorOffsetY}px) scale(0.08, 0.04)`,
            },
          ], { duration: 220, easing: "cubic-bezier(0.7, 0, 0.84, 0)", fill: "forwards" });
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
      style={{ left: layout.left, top: layout.top, width: badge.chooserSize.width, height: badge.chooserSize.height }}
      data-overlap-chooser-collision-avoided={badge.chooserPosition.collisionAvoided ? "true" : "false"}
    >
      <div
        ref={surfaceRef}
        className="overlap-chooser-surface"
        data-overlap-chooser
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
        <div className="overlap-chooser-list">
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
                onFocus={() => onHoverImpact(impact)}
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
                  <strong>{overlapChooserTypeLabel(impact.kind, details)}</strong>
                  <span>{formatOverlapChooserLocation(details, badge.label)}</span>
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
  shouldSuppressMapClick,
}: {
  badge: OverlapBadgeWithChooser;
  selection: ImpactSelection;
  isOpen: boolean;
  onToggle: () => void;
  shouldSuppressMapClick: () => boolean;
}) {
  const kindCounts = overlapBadgeKindCounts(badge.impacts);
  const visibleKindCounts = kindCounts.slice(0, 3);
  const hiddenKindCount = Math.max(0, kindCounts.length - visibleKindCounts.length);
  const totalItems = visibleKindCounts.length + (hiddenKindCount > 0 ? 1 : 0);
  const spacing = OVERLAP_BADGE_ITEM_SPACING;
  const isSingleVisualItem = totalItems === 1;
  const isSingleKindOverlap = kindCounts.length === 1 && (kindCounts[0]?.count ?? 0) > 1;
  const badgeRadius = OVERLAP_BADGE_CIRCLE_RADIUS;
  const iconSize = 44;
  const isSelected = selection
    ? badge.impacts.some((impact) => impact.kind === selection.kind && impact.cardId === selection.id)
    : false;
  const label = `Overlapping alerts: ${kindCounts
    .map(({ kind, count }) => `${labelForImpactKind(kind)}${count > 1 ? ` x${count}` : ""}`)
    .join(" + ")} on ${badge.label}`;
  const chooserId = `overlap-chooser-${badge.segmentId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  const handleKeyDown = (event: React.KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  };


  return (
    <g
      className={`overlap-indicator-group ${isOpen ? "open" : ""}`}
      data-overlap-segment-id={badge.segmentId}
      data-overlap-collision-avoided={badge.position.collisionAvoided ? "true" : "false"}
      onClick={(event) => {
        if (shouldSuppressMapClick()) return;
        event.stopPropagation();
        onToggle();
      }}
      transform={`translate(${badge.position.x} ${badge.position.y})`}
    >
      <g
        aria-controls={chooserId}
        aria-expanded={isOpen}
        aria-label={isOpen ? `Close alert chooser for ${badge.label}` : label}
        className={`overlap-indicator ${isSelected ? "selected" : ""} ${isOpen ? "open" : ""}`}
        onKeyDown={handleKeyDown}
        pointerEvents="auto"
        role="button"
        tabIndex={0}
      >
        <title>{label}</title>
        {isSingleVisualItem ? (
          <circle
            className="overlap-indicator-pill"
            r={badge.size.height / 2}
          />
        ) : (
          <rect
            className="overlap-indicator-pill"
            x={-badge.size.width / 2}
            y={-badge.size.height / 2}
            width={badge.size.width}
            height={badge.size.height}
            rx={badge.size.height / 2}
          />
        )}
        <g transform={`scale(${OVERLAP_INDICATOR_SCALE})`}>
          {visibleKindCounts.map(({ kind, count }, index) => {
            const x = (index - (totalItems - 1) / 2) * spacing;
            return (
              <g
                key={kind}
                data-overlap-kind={kind}
                data-overlap-kind-count={count}
                transform={`translate(${x} 0)`}
              >
                <circle className={`overlap-indicator-badge ${kind}`} r={badgeRadius} />
                <OverlapKindIcon kind={kind} size={iconSize} />
              </g>
            );
          })}
          {hiddenKindCount > 0 && (
            <g transform={`translate(${(visibleKindCounts.length - (totalItems - 1) / 2) * spacing} 0)`}>
              <circle className="overlap-indicator-badge more" r={27} />
              <text className="overlap-indicator-more" textAnchor="middle" dominantBaseline="central">
                +{hiddenKindCount}
              </text>
            </g>
          )}
          {visibleKindCounts.map(({ kind, count }, index) => {
            if (count <= 1) return null;
            const x = (index - (totalItems - 1) / 2) * spacing;
            return (
              <g key={`${kind}-count`} transform={`translate(${x} 0)`}>
                <OverlapKindCountBadge count={count} large={isSingleKindOverlap} />
              </g>
            );
          })}
        </g>
      </g>
    </g>
  );
}

function OverlapKindCountBadge({ count, large = false }: { count: number; large?: boolean }) {
  const offset = large ? 35 : 28;
  const radius = large ? 26 : 18;
  return (
    <g transform={`translate(${offset} -${offset})`}>
      <circle className="overlap-indicator-count-badge" r={radius} />
      <text
        className={`overlap-indicator-count-text ${large ? "large" : "mixed"}`}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {count}
      </text>
    </g>
  );
}

function OverlapKindIcon({ kind, size }: { kind: MapImpactKind; size: number }) {
  const offset = -size / 2;
  return (
    <g transform={`translate(${offset} ${offset})`}>
      <ImpactTypeIcon kind={kind} size={size} className={`overlap-indicator-type-icon ${kind}`} />
    </g>
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

const FOUR_WAY_STATION_IMPACT_ARROW_SCALE = 0.94;

function stationImpactDirectionPath(direction: StationImpactArrowDirection, radius: number): string {
  const parts = stationImpactDirectionParts(direction);
  const pathMetricsRadius =
    direction === "four-way" ? radius * FOUR_WAY_STATION_IMPACT_ARROW_SCALE : radius;
  const metrics = stationImpactDirectionMetrics(pathMetricsRadius);

  if (parts.length === 1) {
    return stationImpactDirectionCenteredPartPath(parts[0], metrics);
  }

  if (
    direction === "up-right" ||
    direction === "up-left" ||
    direction === "down-right" ||
    direction === "down-left"
  ) {
    const cx = Math.round(pathMetricsRadius * 0.52);
    const cy = Math.round(pathMetricsRadius * 0.52);
    const offX = Math.round(metrics.headHalf * 0.38);
    const offY = Math.round(metrics.headHalf * 0.38);

    const isUp = direction === "up-right" || direction === "up-left";
    const isRight = direction === "up-right" || direction === "down-right";

    const cornerX = (isRight ? -cx : cx) + (isRight ? offX : -offX);
    const cornerY = (isUp ? cy : -cy) + (isUp ? -offY : offY);

    const verticalTipY = (isUp ? -cy : cy) + (isUp ? -offY : offY);
    const horizontalTipX = (isRight ? cx : -cx) + (isRight ? offX : -offX);

    const headInset = metrics.headInset;
    const headHalf = metrics.headHalf;

    const upDownHeadDir = isUp ? -1 : 1;
    const rightLeftHeadDir = isRight ? 1 : -1;

    return [
      `M ${cornerX} ${cornerY} V ${verticalTipY}`,
      `M ${cornerX - headHalf} ${verticalTipY - upDownHeadDir * headInset} L ${cornerX} ${verticalTipY} L ${cornerX + headHalf} ${verticalTipY - upDownHeadDir * headInset}`,
      `M ${cornerX} ${cornerY} H ${horizontalTipX}`,
      `M ${horizontalTipX - rightLeftHeadDir * headInset} ${cornerY - headHalf} L ${horizontalTipX} ${cornerY} L ${horizontalTipX - rightLeftHeadDir * headInset} ${cornerY + headHalf}`,
    ].join(" ");
  }

  if (direction === "horizontal-bidirectional") {
    return [
      `M -${metrics.extent} 0 H ${metrics.extent}`,
      `M -${metrics.extent - metrics.headInset} -${metrics.headHalf} L -${metrics.extent} 0 L -${metrics.extent - metrics.headInset} ${metrics.headHalf}`,
      `M ${metrics.extent - metrics.headInset} -${metrics.headHalf} L ${metrics.extent} 0 L ${metrics.extent - metrics.headInset} ${metrics.headHalf}`,
    ].join(" ");
  }

  if (direction === "vertical-bidirectional") {
    return [
      `M 0 -${metrics.extent} V ${metrics.extent}`,
      `M -${metrics.headHalf} -${metrics.extent - metrics.headInset} L 0 -${metrics.extent} L ${metrics.headHalf} -${metrics.extent - metrics.headInset}`,
      `M -${metrics.headHalf} ${metrics.extent - metrics.headInset} L 0 ${metrics.extent} L ${metrics.headHalf} ${metrics.extent - metrics.headInset}`,
    ].join(" ");
  }

  if (direction === "four-way") {
    return [
      `M -${metrics.extent} 0 H ${metrics.extent}`,
      `M 0 -${metrics.extent} V ${metrics.extent}`,
      `M -${metrics.extent - metrics.headInset} -${metrics.headHalf} L -${metrics.extent} 0 L -${metrics.extent - metrics.headInset} ${metrics.headHalf}`,
      `M ${metrics.extent - metrics.headInset} -${metrics.headHalf} L ${metrics.extent} 0 L ${metrics.extent - metrics.headInset} ${metrics.headHalf}`,
      `M -${metrics.headHalf} -${metrics.extent - metrics.headInset} L 0 -${metrics.extent} L ${metrics.headHalf} -${metrics.extent - metrics.headInset}`,
      `M -${metrics.headHalf} ${metrics.extent - metrics.headInset} L 0 ${metrics.extent} L ${metrics.headHalf} ${metrics.extent - metrics.headInset}`,
    ].join(" ");
  }

  return parts
    .map((part) => stationImpactDirectionSpokePartPath(part, metrics))
    .join(" ");
}

function stationImpactDirectionParts(direction: StationImpactArrowDirection): Array<"left" | "right" | "up" | "down"> {
  switch (direction) {
    case "left":
      return ["left"];
    case "right":
      return ["right"];
    case "up":
      return ["up"];
    case "down":
      return ["down"];
    case "up-left":
      return ["left", "up"];
    case "up-right":
      return ["right", "up"];
    case "down-left":
      return ["left", "down"];
    case "down-right":
      return ["right", "down"];
    case "horizontal-bidirectional":
      return ["left", "right"];
    case "vertical-bidirectional":
      return ["up", "down"];
    case "three-way-no-left":
      return ["right", "up", "down"];
    case "three-way-no-right":
      return ["left", "up", "down"];
    case "three-way-no-up":
      return ["left", "right", "down"];
    case "three-way-no-down":
      return ["left", "right", "up"];
    case "four-way":
      return ["left", "right", "up", "down"];
  }
}

function stationImpactDirectionMetrics(radius: number): {
  extent: number;
  gap: number;
  headInset: number;
  headHalf: number;
} {
  const extent = Math.round(radius * 0.75);
  return {
    extent,
    gap: Math.max(4, Math.round(radius * 0.17)),
    headInset: Math.max(8, Math.round(extent * 0.42)),
    headHalf: Math.max(8, Math.round(radius * 0.25)),
  };
}

function stationImpactDirectionCenteredPartPath(
  direction: "left" | "right" | "up" | "down",
  metrics: ReturnType<typeof stationImpactDirectionMetrics>,
): string {
  switch (direction) {
    case "left":
      return `M ${metrics.extent} 0 H -${metrics.extent} M -${metrics.extent - metrics.headInset} -${metrics.headHalf} L -${metrics.extent} 0 L -${metrics.extent - metrics.headInset} ${metrics.headHalf}`;
    case "right":
      return `M -${metrics.extent} 0 H ${metrics.extent} M ${metrics.extent - metrics.headInset} -${metrics.headHalf} L ${metrics.extent} 0 L ${metrics.extent - metrics.headInset} ${metrics.headHalf}`;
    case "up":
      return `M 0 ${metrics.extent} V -${metrics.extent} M -${metrics.headHalf} -${metrics.extent - metrics.headInset} L 0 -${metrics.extent} L ${metrics.headHalf} -${metrics.extent - metrics.headInset}`;
    case "down":
      return `M 0 -${metrics.extent} V ${metrics.extent} M -${metrics.headHalf} ${metrics.extent - metrics.headInset} L 0 ${metrics.extent} L ${metrics.headHalf} ${metrics.extent - metrics.headInset}`;
  }
}

function stationImpactDirectionSpokePartPath(
  direction: "left" | "right" | "up" | "down",
  metrics: ReturnType<typeof stationImpactDirectionMetrics>,
): string {
  switch (direction) {
    case "left":
      return `M 0 0 H -${metrics.extent} M -${metrics.extent - metrics.headInset} -${metrics.headHalf} L -${metrics.extent} 0 L -${metrics.extent - metrics.headInset} ${metrics.headHalf}`;
    case "right":
      return `M 0 0 H ${metrics.extent} M ${metrics.extent - metrics.headInset} -${metrics.headHalf} L ${metrics.extent} 0 L ${metrics.extent - metrics.headInset} ${metrics.headHalf}`;
    case "up":
      return `M 0 0 V -${metrics.extent} M -${metrics.headHalf} -${metrics.extent - metrics.headInset} L 0 -${metrics.extent} L ${metrics.headHalf} -${metrics.extent - metrics.headInset}`;
    case "down":
      return `M 0 0 V ${metrics.extent} M -${metrics.headHalf} ${metrics.extent - metrics.headInset} L 0 ${metrics.extent} L ${metrics.headHalf} ${metrics.extent - metrics.headInset}`;
  }
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

function OverlayInteractionTarget({
  segment,
  impact,
  plannedClosure,
  selectionActive,
  exiting,
  onSelectImpact,
  shouldSuppressMapClick,
  onHoverHighlightChange,
}: {
  segment: RenderedNetworkSegment;
  impact: MapImpact | null;
  plannedClosure: PlannedClosure | undefined;
  selectionActive: boolean;
  exiting?: boolean;
  onSelectImpact: (selection: ImpactSelection) => void;
  shouldSuppressMapClick: () => boolean;
  onHoverHighlightChange: (highlight: HoveredOverlayHighlight | null) => void;
}) {
  const visualState = impact ? visualStateForImpactKind(impact.kind) : "planned-preview";
  const targetId = `${impact?.kind ?? "planned-closure"}:${impact?.cardId ?? plannedClosure?.id ?? "unknown"}:${segment.id}`;
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
        if (exiting || shouldSuppressMapClick()) return;
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
        onHoverHighlightChange({ key: targetId, pathD: segment.pathD, visualState });
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        onHoverHighlightChange(null);
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
  onHoverHighlightChange,
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
  onHoverHighlightChange?: (highlight: HoveredOverlayHighlight | null) => void;
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
  const hoverHighlightKey = `${impact?.kind ?? "planned-closure"}:${impact?.cardId ?? plannedClosure?.id ?? "unknown"}:${overlaySegmentId}`;

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
      className={`overlay-segment-group ${connectedClass} ${exiting ? "map-layer-exiting" : "map-layer-current"}`.trim()}
      onPointerEnter={renderInteractionTarget ? (event) => {
        if (event.pointerType !== "mouse" || exiting) return;
        onHoverHighlightChange?.({
          key: hoverHighlightKey,
          pathD: segment.pathD,
          visualState,
        });
      } : undefined}
      onPointerLeave={renderInteractionTarget ? (event) => {
        if (event.pointerType !== "mouse") return;
        onHoverHighlightChange?.(null);
      } : undefined}
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
        <path
          className={`asset-alert-path planned-preview pointer-events-none ${selectedClass}`}
          d={segment.pathD}
          pointerEvents="none"
        />
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
  fast,
}: {
  emphasis: SelectedImpactEmphasisLayer;
  fast: boolean;
}) {
  return (
    <path
      data-selected-impact-emphasis={selectedImpactEmphasis.id}
      data-map-highlight-id={selectedImpactEmphasis.id}
      className={`asset-alert-path map-selection-flash pointer-events-none ${
        fast ? "fast" : "latent"
      }`}
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
}: {
  enabled: boolean;
  markers: EstimatedTrainMarker[];
  segments: RenderedNetworkSegment[];
  muted: boolean;
}) {
  const segmentById = useMemo(() => new Map(segments.map((segment) => [segment.id, segment])), [segments]);
  const markerNodes = useMemo(() => {
    if (!enabled || markers.length === 0) return [];

    const pathMetricCache = new Map<string, TrainMarkerPathMetrics>();

    return markers.flatMap((marker) => {
      const segment = segmentById.get(marker.segmentId);
      if (!segment?.pathD) return [];

      const visualDirection = visualTravelDirection({ ...segment, travelDirection: marker.travelDirection });
      const pathProgress = visualDirection === "reverse" ? 1 - marker.progress : marker.progress;
      const frame = pathFrameAtProgress(segment.pathD, pathProgress, visualDirection, pathMetricCache);
      if (!frame) return [];

      return [
        <g
          key={estimatedTrainMarkerRenderKey(marker)}
          className={`estimated-train-marker estimated-train-marker-${marker.lineId}`}
          data-train-marker-id={marker.id}
          data-train-marker-line-id={marker.lineId}
          data-train-marker-direction={marker.direction}
          data-train-marker-segment-id={marker.segmentId}
          data-train-marker-travel-direction={visualDirection}
          transform={`translate(${frame.point.x} ${frame.point.y}) rotate(${frame.angle})`}
        >
          <title>{`${lineLabelForTrainMarker(marker.lineId)} ${marker.direction} estimated train near ${marker.nextStationId}`}</title>
          <TrainMarkerGlyph />
        </g>,
      ];
    });
  }, [enabled, markers, segmentById]);

  if (markerNodes.length === 0) return null;

  return (
    <g className="estimated-train-marker-layer" data-muted={muted ? "true" : "false"} pointerEvents="none">
      {markerNodes}
    </g>
  );
}

function TrainMarkerGlyph() {
  return (
    <>
      <path
        className="estimated-train-marker-outline"
        d="M -21 -15 H 14 L 36 0 L 14 15 H -21 A 15 15 0 0 1 -36 0 A 15 15 0 0 1 -21 -15 Z"
      />
      <path
        className="estimated-train-marker-core"
        d="M -21 -15 H 14 L 36 0 L 14 15 H -21 A 15 15 0 0 1 -36 0 A 15 15 0 0 1 -21 -15 Z"
      />
      <rect className="estimated-train-marker-window" x="-27" y="-6" width="8" height="12" rx="1.5" />
      <rect className="estimated-train-marker-window" x="-15" y="-6" width="8" height="12" rx="1.5" />
      <rect className="estimated-train-marker-window" x="-3" y="-6" width="8" height="12" rx="1.5" />
      <path className="estimated-train-marker-arrow" d="M 13 -8 L 27 0 L 13 8 Z" />
    </>
  );
}

type TrainMarkerPathFrame = {
  point: MapPoint;
  angle: number;
};

type TrainMarkerPathMetrics = {
  path: SVGPathElement;
  length: number;
};

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

    let offsetX = 0;
    let offsetY = 0;
    if (visualDirection !== "bidirectional") {
      const offsetAmt = 20; // 20 units offset to fit within bounds with a reduced center gap
      const travelAngleRad = visualDirection === "reverse" ? pathAngleRad + Math.PI : pathAngleRad;
      const offsetAngleRad = travelAngleRad + Math.PI / 2; // Perpendicular to the right
      offsetX = Math.cos(offsetAngleRad) * offsetAmt;
      offsetY = Math.sin(offsetAngleRad) * offsetAmt;
    }

    return {
      point: { x: point.x + offsetX, y: point.y + offsetY },
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

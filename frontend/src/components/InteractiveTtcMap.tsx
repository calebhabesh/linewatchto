"use client";

import { useEffect, useState, useMemo, useLayoutEffect, useRef, useCallback } from "react";
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
import { ZoomIn, ZoomOut, Locate, Sun, Moon } from "lucide-react";
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
import { LogsDropdown } from "./LogsDropdown";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { SiteGuideDropdown } from "./SiteGuideDropdown";

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

export function InteractiveTtcMap({
  selection,
  onSelectImpact,
  stations,
  selectedStationId,
  onSelectStationId,
  isDark,
  onToggleTheme,
  layoutResetSignal,
  reducedMotion,
  commutePathPreview,
  onClearCommutePathPreview,
}: {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  stations: StationSummary[];
  selectedStationId: string | null;
  onSelectStationId: (id: string | null) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  layoutResetSignal?: number;
  reducedMotion: boolean;
  commutePathPreview?: AccountCommutePathPreview | null;
  onClearCommutePathPreview?: () => void;
}) {
  const { networkSegments, activeAlerts, delays, reducedSpeedZones, plannedClosures, stationNodeImpacts, stations: mapStations } = useDashboardData();
  const [svgParts, setSvgParts] = useState<{ part1: string; part2: string } | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  const mapSvgRef = useRef<SVGSVGElement>(null);
  const mapRootRef = useRef<HTMLDivElement>(null);
  const [anchorPoints, setAnchorPoints] = useState(new Map<string, MapPoint>());
  const [guidePaths, setGuidePaths] = useState(new Map<string, string>());
  const [stationCenterPoints, setStationCenterPoints] = useState(new Map<string, MapPoint>());
  const [mapCollisionBoxes, setMapCollisionBoxes] = useState<SvgBounds[]>([]);

  useLayoutEffect(() => {
    if (loadState !== "ready" || !mapSvgRef.current) return;
    const geometry = readSvgGeometry(mapSvgRef.current, networkSegments);
    setAnchorPoints(geometry.anchorPoints);
    setGuidePaths(geometry.guidePaths);
    setStationCenterPoints(readSvgStationCenters(mapSvgRef.current, stations.map((s) => s.id)));
    setMapCollisionBoxes([
      ...collectMapCollisionBoxes(mapSvgRef.current),
      ...collectBaseRouteCollisionBoxes(networkSegments, mapStations, geometry.anchorPoints, geometry.guidePaths),
    ]);
  }, [loadState, mapStations, networkSegments, stations]);

  const stationPointFor = useCallback((station: { id: string; mapX: number; mapY: number }): MapPoint => {
    return stationCenterPoints.get(station.id) ?? { x: station.mapX, y: station.mapY };
  }, [stationCenterPoints]);

  const {
    transform,
    relativeScale,
    isDragging,
    isAnimating,
    containerRef,
    mapRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    recenter,
    zoomIn,
    zoomOut,
    zoomToScale,
    zoomToPoint,
  } = usePanZoom();

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
    const checkAndCenter = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        recenter();
      } else if (attempts < 10) {
        attempts++;
        setTimeout(checkAndCenter, 100);
      }
    };

    checkAndCenter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState, recenter]);

  useEffect(() => {
    if (!layoutResetSignal || loadState !== "ready") return;

    const resetTimer = window.setTimeout(() => recenter(), 320);
    return () => window.clearTimeout(resetTimer);
  }, [layoutResetSignal, loadState, recenter]);

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
      const fallbackTimer = window.setTimeout(() => setFlashSelection(null), 0);
      return () => window.clearTimeout(fallbackTimer);
    }
    const timer0 = window.setTimeout(() => setFlashSelection(selection), 0);
    const timer = window.setTimeout(() => setFlashSelection(null), 2500);
    return () => { window.clearTimeout(timer0); window.clearTimeout(timer); };
  }, [selection]);

  useEffect(() => {
    if (!selectedStationId) {
      const fallbackTimer = window.setTimeout(() => setFlashStationId(null), 0);
      return () => window.clearTimeout(fallbackTimer);
    }
    const timer0 = window.setTimeout(() => setFlashStationId(selectedStationId), 0);
    const timer = window.setTimeout(() => setFlashStationId(null), 2500);
    return () => { window.clearTimeout(timer0); window.clearTimeout(timer); };
  }, [selectedStationId]);

  const focusTargetKey = useMemo(() => {
    if (selection) return `${selection.kind}:${selection.id}`;
    if (selectedStationId) return `station:${selectedStationId}`;
    return null;
  }, [selection, selectedStationId]);

  const lastFocusedTargetKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (loadState !== "ready") return;

    if (!focusTargetKey) {
      if (lastFocusedTargetKeyRef.current !== null) {
        lastFocusedTargetKeyRef.current = null;
        recenter();
      }
      return;
    }

    if (lastFocusedTargetKeyRef.current === focusTargetKey) {
      return;
    }

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
            zoomToPoint((sumX / count) * scaleFactor, (sumY / count) * scaleFactor, 1.2);
            lastFocusedTargetKeyRef.current = focusTargetKey;
          }
        }
      } else {
        const center = getSegmentsCenter(selectedSegmentIds, networkSegments, mapStations, anchorPoints, guidePaths);
        if (center) {
          zoomToPoint(center.x, center.y, 1.2);
          lastFocusedTargetKeyRef.current = focusTargetKey;
        }
      }
    } else if (selectedStationId) {
      // Zoom/pan to the selected station with the same animation
      const station = stations.find((s) => s.id === selectedStationId);
      if (station) {
        const scaleFactor = 4500 / 8250;
        const pt = stationPointFor(station);
        zoomToPoint(pt.x * scaleFactor, pt.y * scaleFactor, 1.2);
        lastFocusedTargetKeyRef.current = focusTargetKey;
      }
    }
  }, [
    focusTargetKey,
    selection,
    selectedStationId,
    selectedSegmentIds,
    networkSegments,
    mapStations,
    anchorPoints,
    guidePaths,
    zoomToPoint,
    loadState,
    recenter,
    stationNodeImpacts,
    stations,
    stationPointFor,
  ]);

  const stationBySummaryId = useMemo(() => {
    return new Map(stations.map((station) => [station.id, station]));
  }, [stations]);

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
    return plannedClosures
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
  }, [plannedClosures, renderedOverlaySegments]);

  const retainedPlannedPreviewLayers = useRetainedMapLayers(
    plannedPreviewLayers,
    useCallback(({ segment, closure }) => `${segment.id}:${closure.id}`, []),
  );

  const retainedImpactLayers = useRetainedMapLayers(
    renderedImpactLayers,
    useCallback(({ segment, impact }) => `${segment.id}:${impact.kind}:${impact.cardId}:${impact.travelDirection}`, []),
  );

  const retainedStationNodeImpacts = useRetainedMapLayers(
    stationNodeImpacts,
    useCallback((impact) => `${impact.kind}:${impact.cardId}:${impact.stationId}`, []),
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

    return endpointIds
      .map((stationId) => {
        const station = stationById.get(stationId);
        return station ? stationPointFor(station) : null;
      })
      .filter((point): point is MapPoint => Boolean(point));
  }, [commutePathPreview, stations, stationPointFor]);

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

  const overlayCollisionBoxes = useMemo<SvgBounds[]>(() => {
    return [
      ...plannedPreviewLayers.map(({ segment }) => segment.pathD),
      ...renderedImpactLayers.map(({ segment }) => segment.pathD),
    ].flatMap((pathD) => pathCorridorCollisionBoxes(pathD, OVERLAY_CORRIDOR_COLLISION_RADIUS));
  }, [plannedPreviewLayers, renderedImpactLayers]);

  const overlapBadgeSegments = useMemo<OverlapBadgeSegment[]>(() => {
    const occupiedBoxes = [...mapCollisionBoxes, ...overlayCollisionBoxes];
    return groupOverlapBadgeSegments(renderedOverlaySegments, plannedClosures)
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

        const size = overlapBadgeSize(group.impactKinds.length);
        const position = chooseNonIntersectingBadgePosition(frame.point, size, occupiedBoxes, frame);
        occupiedBoxes.push(expandBox(boundsForBadgePosition(position, size), 12));

        return {
          segmentId: group.segments[0]?.id ?? segment.id,
          label: segment.label,
          impactKinds: group.impactKinds,
          impacts: group.impacts,
          primaryImpact: group.primaryImpact,
          position,
          size,
        };
      })
      .filter((badge): badge is OverlapBadgeSegment => Boolean(badge));
  }, [mapCollisionBoxes, overlayCollisionBoxes, plannedClosures, renderedOverlaySegments]);


  return (
    <div ref={mapRootRef} className="relative w-full h-full flex flex-col overflow-hidden bg-transparent">
      {/* Top right Theme toggle (styled like hamburger) and poll chip */}
      <div className="absolute top-4 sm:top-6 right-4 sm:right-6 z-20 flex items-center gap-2 pointer-events-auto">
        <LogsDropdown />
        <button
          onClick={onToggleTheme}
          className="panel flex items-center justify-center w-10 sm:w-14 h-10 sm:h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-100 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10]"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun size={24} className="text-slate-800 dark:text-white" /> : <Moon size={24} className="text-slate-800 dark:text-white" />}
        </button>
        <SiteGuideDropdown />
      </div>

      {/* Top center map controls */}
      {/* Note: ml-2 sm:ml-3 is added to visually center the mass of the controls, since the left side has 2 buttons and is visually heavier than the right side */}
      <div className="map-control-rail absolute top-14 sm:top-[92px] left-1/2 -translate-x-1/2 z-30 flex flex-row items-center justify-center gap-1 sm:gap-2 pointer-events-auto">
        <button
          onClick={recenter}
          className="map-control-button group"
          title="Center view"
          aria-label="Center map view"
        >
          <Locate size={20} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
          <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Center</span>
        </button>

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
            max="5"
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

      {/* Map Viewport */}
      <div
        ref={containerRef}
        className={`w-full h-full overflow-hidden select-none touch-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
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

        {loadState === "ready" && (
          <div
            ref={mapRef}
            className="absolute top-0 left-0 w-full h-full origin-top-left"
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: "0 0",
              transition: reducedMotion
                ? "none"
                : isDragging
                  ? "none"
                  : isAnimating
                    ? "transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)"
                    : "transform 0.1s ease-out",
              willChange: isDragging || isAnimating ? "transform" : "auto",
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
                  <pattern id="suspension-hash" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="60" height="60" fill="#ef4444" />
                    <line x1="0" y1="0" x2="0" y2="60" stroke="#ffffff" strokeWidth="25" />
                  </pattern>
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
                  <g aria-label="Saved commute route preview">
                    {commutePreviewLayer ? (
                      <CommutePathOverlay
                        segment={commutePreviewLayer.segment}
                        endpointPoints={commutePreviewEndpointPoints}
                        preview={commutePreviewLayer.preview}
                      />
                    ) : null}
                  </g>
                  {retainedPlannedPreviewLayers.map(({ key, item: { segment, closure }, exiting }) => (
                    <OverlaySegment
                      key={key}
                      segment={segment}
                      impact={null}
                      plannedClosure={closure}
                      selection={selection}
                      selectedSegmentIds={selectedSegmentIds}
                      onSelectImpact={onSelectImpact}
                      reducedMotion={reducedMotion}
                      flashSelection={flashSelection}
                      exiting={exiting}
                    />
                  ))}
                  {retainedImpactLayers.map(({ key, item: { segment, impact }, exiting }) => (
                    <OverlaySegment
                      key={key}
                      segment={segment}
                      impact={impact}
                      plannedClosure={undefined}
                      selection={selection}
                      selectedSegmentIds={selectedSegmentIds}
                      onSelectImpact={onSelectImpact}
                      reducedMotion={reducedMotion}
                      flashSelection={flashSelection}
                      exiting={exiting}
                    />
                  ))}
                </g>

                {/* Top Layer: Stations (layer6) and text */}
                <g dangerouslySetInnerHTML={{ __html: svgParts?.part2 ?? "" }} />

                <g aria-label="Overlapping alert badges">
                  {overlapBadgeSegments.map((badge) => (
                    <OverlapIndicatorMarker
                      key={badge.segmentId}
                      badge={badge}
                      selection={selection}
                      onSelectImpact={onSelectImpact}
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
              <g aria-label="Station hit targets">
                {stations.map((station) => {
                  const selected = selectedStationId === station.id;
                  const radius = station.interchange ? 96 : 76;
                  const point = stationPointFor(station);

                  return (
                    <g key={station.id}>
                      {flashStationId === station.id && (
                        <circle
                          data-map-highlight-id={station.id}
                          className="station-selection-flash"
                          cx={point.x}
                          cy={point.y}
                          r={station.interchange ? 48 : 38}
                          pointerEvents="none"
                        />
                      )}
                      {commuteFlashStationIds.includes(station.id) && (
                        <circle
                          data-map-highlight-id={station.id}
                          className="station-commute-green-flash"
                          cx={point.x}
                          cy={point.y}
                          r={station.interchange ? 48 : 38}
                          pointerEvents="none"
                        />
                      )}
                      {selected && (
                        <circle
                          className="station-selected-indicator"
                          cx={point.x}
                          cy={point.y}
                          r={station.interchange ? 48 : 38}
                          pointerEvents="none"
                        />
                      )}
                      <circle
                        aria-label={`${station.name} station details`}
                        className={`station-hit-target ${selected ? "selected" : ""} ${
                          station.hasActiveImpact ? "has-impact" : ""
                        } access-${station.accessStatus}`}
                        cx={point.x}
                        cy={point.y}
                        r={radius}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectStationId(selected ? null : station.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSelectStationId(selected ? null : station.id);
                          }
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        role="button"
                        tabIndex={0}
                      />
                    </g>
                  );
                })}
              </g>
              <g aria-label="Station impact rings">
                {retainedStationNodeImpacts.map(({ key, item: impact, exiting }) => {
                  const station = stationBySummaryId.get(impact.stationId);
                  if (!station) return null;
                  const selected = selection?.kind === impact.kind && selection.id === impact.cardId;
                  const point = stationPointFor(station);

                  return (
                    <g
                      key={key}
                      className={exiting ? "map-layer-exiting" : "map-layer-current"}
                      style={exiting ? { pointerEvents: "none" } : undefined}
                    >
                      {flashSelection && flashSelection.kind === impact.kind && flashSelection.id === impact.cardId && (
                        <circle
                          data-map-highlight-id={flashSelection.id}
                          className="station-selection-flash"
                          cx={point.x}
                          cy={point.y}
                          r={station.interchange ? 48 : 38}
                          pointerEvents="none"
                        />
                      )}
                      <circle
                        aria-label={`${impact.title}: ${station.name}`}
                        className={`station-impact-ring ${impact.kind} ${selected ? "selected" : ""}`}
                        cx={point.x}
                        cy={point.y}
                        r={station.interchange ? 48 : 38}
                        fill="none"
                        onClick={(event) => {
                          if (exiting) return;
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
                        onPointerDown={(event) => event.stopPropagation()}
                        pointerEvents={exiting ? "none" : "stroke"}
                        role="button"
                        tabIndex={exiting ? -1 : 0}
                      />
                      <circle
                        className="station-impact-dot-red-glow"
                        cx={point.x}
                        cy={point.y}
                        r={station.interchange ? 34 : 26}
                        pointerEvents="none"
                      />
                      <circle
                        className="station-impact-dot-red-ping"
                        cx={point.x}
                        cy={point.y}
                        r={station.interchange ? 34 : 26}
                        pointerEvents="none"
                      />
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        )}
      </div>
      {commutePathPreview ? (
        <div className="commute-path-preview-chip" role="status" aria-live="polite">
          <span>
            Viewing <strong>{commutePathPreview.routeLabel}</strong>
          </span>
          <button type="button" onClick={onClearCommutePathPreview}>
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
  primaryImpact: MapImpact;
  position: OverlapBadgePosition;
  size: OverlapBadgeSize;
};

type OverlapBadgeGroup = {
  signature: string;
  segments: RenderedNetworkSegment[];
  impacts: MapImpact[];
  impactKinds: MapImpactKind[];
  primaryImpact: MapImpact;
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
const STANDARD_MAP_COMPONENT_MAX_BOUNDS = 1200;
const LARGE_MAP_COMPONENT_MAX_THICKNESS = 220;
const LARGE_MAP_COMPONENT_TILE_LENGTH = 760;

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

function primaryImpactForOverlap(impacts: MapImpact[]): MapImpact | undefined {
  return [...impacts].sort((a, b) => getImpactPriority(b.kind) - getImpactPriority(a.kind))[0];
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
    if (impactKinds.length <= 1) continue;

    const primaryImpact = primaryImpactForOverlap(impacts);
    if (!primaryImpact) continue;

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
      primaryImpact,
    });
  }

  return Array.from(groups.values());
}

function overlapBadgeSize(impactKindCount: number): OverlapBadgeSize {
  const visibleCount = Math.min(3, impactKindCount);
  const hasMore = impactKindCount > visibleCount;
  const totalItems = visibleCount + (hasMore ? 1 : 0);
  return {
    width: Math.max(88, totalItems * 58 + 22),
    height: 76,
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
): OverlapBadgePosition {
  const candidates = overlapBadgePositionCandidates(size, frame);
  const scoredPositions: Array<{ position: MapPoint; score: number; collisionAvoided: boolean }> = [];
  for (const candidate of candidates) {
    const position = clampBadgePosition(
      { x: center.x + candidate.dx, y: center.y + candidate.dy },
      size,
    );
    const candidateBox = expandBox(boundsForBadgePosition(position, size), 10);
    const collisionAvoided = !blockedBoxes.some((blockedBox) => boxesIntersect(candidateBox, blockedBox));
    scoredPositions.push({
      position,
      collisionAvoided,
      score: scoreBadgeCandidate(position, center, size, blockedBoxes),
    });
  }

  const best = scoredPositions
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

          group.setAttribute(
            "transform",
            `translate(${p.x + offsetX} ${p.y + offsetY}) rotate(${resolvedAngle})`
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
          <g key={i} data-index={i}>
            {isNoEntry ? (
              <g transform="translate(-26.4, -26.4) scale(2.2)" stroke="#ffffff" fill="none" strokeWidth="3.2">
                <circle cx="12" cy="12" r="10.5" />
                <line x1="19.64" y1="4.36" x2="4.36" y2="19.64" />
              </g>
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

          const rotateStr = Math.abs(i) % 2 === 0 ? "" : ` rotate(${angle})`;
          group.setAttribute(
            "transform",
            `translate(${p.x + offsetX} ${p.y + offsetY})${rotateStr}`
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

function OverlapIndicatorMarker({
  badge,
  selection,
  onSelectImpact,
}: {
  badge: OverlapBadgeSegment;
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
}) {
  const visibleKinds = badge.impactKinds.slice(0, 3);
  const hiddenKindCount = Math.max(0, badge.impactKinds.length - visibleKinds.length);
  const totalItems = visibleKinds.length + (hiddenKindCount > 0 ? 1 : 0);
  const spacing = 58;
  const isSelected = selection
    ? badge.impacts.some((impact) => impact.kind === selection.kind && impact.cardId === selection.id)
    : false;
  const label = `Overlapping alerts: ${badge.impactKinds.map(labelForImpactKind).join(" + ")} on ${badge.label}`;

  const selectPrimaryImpact = () => {
    onSelectImpact({ kind: badge.primaryImpact.kind, id: badge.primaryImpact.cardId });
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectPrimaryImpact();
    }
  };

  return (
    <g
      aria-label={label}
      className={`overlap-indicator ${isSelected ? "selected" : ""}`}
      data-overlap-segment-id={badge.segmentId}
      data-overlap-collision-avoided={badge.position.collisionAvoided ? "true" : "false"}
      onClick={(event) => {
        event.stopPropagation();
        selectPrimaryImpact();
      }}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => event.stopPropagation()}
      pointerEvents="auto"
      role="button"
      tabIndex={0}
      transform={`translate(${badge.position.x} ${badge.position.y})`}
    >
      <title>{label}</title>
      <rect
        className="overlap-indicator-pill"
        x={-badge.size.width / 2}
        y={-badge.size.height / 2}
        width={badge.size.width}
        height={badge.size.height}
        rx={badge.size.height / 2}
      />
      {visibleKinds.map((kind, index) => {
        const x = (index - (totalItems - 1) / 2) * spacing;
        return (
          <g key={kind} data-overlap-kind={kind} transform={`translate(${x} 0)`}>
            <circle className={`overlap-indicator-badge ${kind}`} r={27} />
            <OverlapKindIcon kind={kind} />
          </g>
        );
      })}
      {hiddenKindCount > 0 && (
        <g transform={`translate(${(visibleKinds.length - (totalItems - 1) / 2) * spacing} 0)`}>
          <circle className="overlap-indicator-badge more" r={27} />
          <text className="overlap-indicator-more" textAnchor="middle" dominantBaseline="central">
            +{hiddenKindCount}
          </text>
        </g>
      )}
    </g>
  );
}

function OverlapKindIcon({ kind }: { kind: MapImpactKind }) {
  return (
    <g transform="translate(-17 -17)">
      <ImpactTypeIcon kind={kind} size={34} className={`overlap-indicator-type-icon ${kind}`} />
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
      <path className="commute-path-preview-glow" d={segment.pathD} />
      <path className="commute-path-preview-path" d={segment.pathD} />
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

function OverlaySegment({
  segment,
  impact,
  plannedClosure,
  selection,
  selectedSegmentIds,
  onSelectImpact,
  reducedMotion,
  flashSelection,
  exiting,
}: {
  segment: RenderedNetworkSegment;
  impact: MapImpact | null;
  plannedClosure: PlannedClosure | undefined;
  selection: ImpactSelection;
  selectedSegmentIds: string[];
  onSelectImpact: (selection: ImpactSelection) => void;
  reducedMotion: boolean;
  flashSelection: ImpactSelection;
  exiting?: boolean;
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
  const isMapFlash = impact
    ? flashSelection?.kind === impact.kind && flashSelection.id === impact.cardId
    : flashSelection?.kind === "planned-closure" && flashSelection.id === plannedClosure?.id;

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

      {visualState === "delay-static" && (
        <>
          <defs>
            <mask id={`${segment.id}-mask`}>
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
            mask={`url(#${segment.id}-mask)`}
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

      <path
        aria-label={ariaLabel}
        className={`asset-alert-path cursor-pointer pointer-events-auto ${visualState} ${selectedClass}`}
        d={segment.pathD}
        onClick={handleSelect}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
        pointerEvents="stroke"
        role="button"
        tabIndex={0}
      />

      {visualState === "reduced-speed-zone" && (
        <>
          <defs>
            <mask id={`${segment.id}-mask`}>
              <path
                className="rsz-chevron-mask-path pointer-events-none"
                d={segment.pathD}
                style={{ pointerEvents: "none", stroke: "white", fill: "none" }}
              />
            </mask>
          </defs>
          <path
            className="asset-alert-path delay-candy pointer-events-none"
            d={segment.pathD}
            style={{ pointerEvents: "none", stroke: chevronBg }}
          />
          <g
            mask={`url(#${segment.id}-mask)`}
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
            <path
              className="asset-alert-path suspension-candy pointer-events-none"
              d={segment.pathD}
              style={{ pointerEvents: "none", stroke: "url(#suspension-hash)" }}
            />
          ) : (
            <>
              <path
                className="asset-alert-path suspension-candy pointer-events-none"
                d={segment.pathD}
                style={{ pointerEvents: "none", stroke: "#ef4444" }}
              />
              <defs>
                <mask id={`${segment.id}-suspension-mask`}>
                  <path
                    className="suspension-mask-path pointer-events-none"
                    d={segment.pathD}
                    style={{ pointerEvents: "none", stroke: "white", fill: "none" }}
                    strokeWidth="102"
                  />
                </mask>
              </defs>
              <g mask={`url(#${segment.id}-suspension-mask)`}>
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

      {isMapFlash && flashSelection && (
        <path
          data-map-highlight-id={flashSelection.id}
          className="asset-alert-path map-selection-flash pointer-events-none"
          d={segment.pathD}
        />
      )}
    </g>
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

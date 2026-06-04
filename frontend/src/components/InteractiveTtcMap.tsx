"use client";

import { useEffect, useState, useMemo, useLayoutEffect, useRef } from "react";
import {
  composeNetworkSegmentPath,
  pathCenter,
  pathCorridorCollisionBoxes,
  pathMidpointFrame,
  readSvgGeometry,
  resolveNetworkSegmentPath,
  visualTravelDirection,
  samplePath,
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
import { LogsDropdown } from "./LogsDropdown";

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
}) {
  const { networkSegments, activeAlerts, delays, reducedSpeedZones, plannedClosures, stationNodeImpacts, stations: mapStations } = useDashboardData();
  const [svgParts, setSvgParts] = useState<{ part1: string; part2: string } | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  const mapSvgRef = useRef<SVGSVGElement>(null);
  const [anchorPoints, setAnchorPoints] = useState(new Map<string, MapPoint>());
  const [guidePaths, setGuidePaths] = useState(new Map<string, string>());
  const [mapCollisionBoxes, setMapCollisionBoxes] = useState<SvgBounds[]>([]);

  useLayoutEffect(() => {
    if (loadState !== "ready" || !mapSvgRef.current) return;
    const geometry = readSvgGeometry(mapSvgRef.current, networkSegments);
    setAnchorPoints(geometry.anchorPoints);
    setGuidePaths(geometry.guidePaths);
    setMapCollisionBoxes(collectMapCollisionBoxes(mapSvgRef.current));
  }, [loadState, networkSegments]);

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

  const selectedClosure = useMemo(() => {
    if (selection?.kind !== "planned-closure") return undefined;
    return plannedClosures.find((c) => c.id === selection.id);
  }, [plannedClosures, selection]);

  const selectedSegmentIds = useMemo(() => {
    if (!selection) return [];
    if (selection.kind === "planned-closure") {
      return plannedClosures.find((closure) => closure.id === selection.id)?.previewSegmentIds
        ?? activeAlerts.find((alert) => alert.id === selection.id)?.affectedSegmentIds
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

  useEffect(() => {
    if (!selection) {
      const fallbackTimer = window.setTimeout(() => setFlashSelection(null), 0);
      return () => window.clearTimeout(fallbackTimer);
    }
    const timer0 = window.setTimeout(() => setFlashSelection(selection), 0);
    const timer = window.setTimeout(() => setFlashSelection(null), 2500);
    return () => { window.clearTimeout(timer0); window.clearTimeout(timer); };
  }, [selection]);

  const prevSelectionRef = useRef<ImpactSelection>(null);

  useEffect(() => {
    const prevSelection = prevSelectionRef.current;
    prevSelectionRef.current = selection;

    if (!selection) {
      if (prevSelection && loadState === "ready") {
        recenter();
      }
      return;
    }
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
            sumX += station.mapX;
            sumY += station.mapY;
            count++;
          }
        });
        if (count > 0) {
          const scaleFactor = 4500 / 8250;
          zoomToPoint((sumX / count) * scaleFactor, (sumY / count) * scaleFactor, 1.5);
        }
      }
      return;
    }
    const center = getSegmentsCenter(selectedSegmentIds, networkSegments, mapStations, anchorPoints, guidePaths);
    if (center) {
      zoomToPoint(center.x, center.y, 1.5);
    }
  }, [selection, selectedSegmentIds, networkSegments, mapStations, anchorPoints, guidePaths, zoomToPoint, loadState, recenter, stationNodeImpacts, stations]);

  const stationBySummaryId = useMemo(() => {
    return new Map(stations.map((station) => [station.id, station]));
  }, [stations]);

  // Determine what overlays to render based on selection and hover
  const overlaySegments = useMemo(() => {
    return networkSegments.filter((segment) => {
      const isClosurePreview = selectedClosure?.previewSegmentIds.includes(segment.id) ?? false;
      return Boolean(segment.impacts?.length) || segment.overlay !== "clear" || isClosurePreview;
    });
  }, [networkSegments, selectedClosure]);

  const renderedOverlaySegments = useMemo(() => {
    const stationById = new Map(mapStations.map((station) => [station.id, station]));

    return overlaySegments
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
          // Fallback parsing if no points available
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
        };
      })
      .filter((segment) => segment.pathD);
  }, [overlaySegments, mapStations, anchorPoints, guidePaths]);

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
    if (!selectedClosure) return [];
    const orderedSegments = orderSegmentsByIds(
      renderedOverlaySegments.filter((segment) => shouldRenderPlannedPreviewLayer(segment, selectedClosure)),
      selectedClosure.previewSegmentIds,
    );
    const corridor = composeNetworkSegmentPath(orderedSegments, "bidirectional");
    if (!corridor.pathD) return [];
    return [{
      segment: compositeSegment(
        `planned-preview-${selectedClosure.id}`,
        orderedSegments,
        corridor.pathD,
        corridor.travelDirection,
        corridor.segmentIds,
        selectedClosure.location || selectedClosure.title,
      ),
      closure: selectedClosure,
    }];
  }, [renderedOverlaySegments, selectedClosure]);

  const overlayCollisionBoxes = useMemo<SvgBounds[]>(() => {
    return [
      ...plannedPreviewLayers.map(({ segment }) => segment.pathD),
      ...renderedImpactLayers.map(({ segment }) => segment.pathD),
    ].flatMap((pathD) => pathCorridorCollisionBoxes(pathD, OVERLAY_CORRIDOR_COLLISION_RADIUS));
  }, [plannedPreviewLayers, renderedImpactLayers]);

  const overlapBadgeSegments = useMemo<OverlapBadgeSegment[]>(() => {
    const occupiedBoxes = [...mapCollisionBoxes, ...overlayCollisionBoxes];
    return renderedOverlaySegments
      .map((segment) => {
        const impacts = segment.impacts?.length ? segment.impacts : legacyImpactsForSegment(segment);
        const impactKinds = getUniqueImpactKinds(impacts);
        if (impactKinds.length <= 1) return null;

        const frame = pathMidpointFrame(segment.pathD);
        const primaryImpact = primaryImpactForOverlap(impacts);
        if (!frame || !primaryImpact) return null;

        const size = overlapBadgeSize(impactKinds.length);
        const position = chooseNonIntersectingBadgePosition(frame.point, size, occupiedBoxes, frame);
        occupiedBoxes.push(expandBox(boundsForBadgePosition(position, size), 12));

        return {
          segmentId: segment.id,
          label: segment.label,
          impactKinds,
          impacts,
          primaryImpact,
          position,
          size,
        };
      })
      .filter((badge): badge is OverlapBadgeSegment => Boolean(badge));
  }, [mapCollisionBoxes, overlayCollisionBoxes, renderedOverlaySegments]);


  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-transparent">
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
      </div>

      {/* Top center map controls */}
      {/* Note: ml-2 sm:ml-3 is added to visually center the mass of the controls, since the left side has 2 buttons and is visually heavier than the right side */}
      <div className="absolute top-14 sm:top-[92px] left-1/2 -translate-x-1/2 ml-2 sm:ml-0.75 z-20 flex flex-row items-center justify-center gap-1 sm:gap-2 pointer-events-auto">
        <button
          onClick={recenter}
          className="group w-16 sm:w-[68px] h-[60px] flex flex-col items-center justify-center gap-1.5 text-slate-900 dark:text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)] dark:drop-shadow-[0_0_12px_rgba(0,0,0,0.9)] hover:bg-black/10 dark:hover:bg-white/10 focus-visible:bg-black/10 dark:focus-visible:bg-white/10 rounded-2xl active:scale-95 outline-none transition-all cursor-pointer"
          title="Center view"
          aria-label="Center map view"
        >
          <Locate size={24} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
          <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Center</span>
        </button>

        <button
          onClick={zoomOut}
          className="group w-16 sm:w-[68px] h-[60px] flex flex-col items-center justify-center gap-1.5 text-slate-900 dark:text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)] dark:drop-shadow-[0_0_12px_rgba(0,0,0,0.9)] hover:bg-black/10 dark:hover:bg-white/10 focus-visible:bg-black/10 dark:focus-visible:bg-white/10 rounded-2xl active:scale-95 outline-none transition-all cursor-pointer"
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut size={24} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
          <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Out</span>
        </button>

        <div className="flex flex-col items-center justify-center gap-1.5 mx-0.5 sm:mx-1 drop-shadow-[0_0_8px_rgba(255,255,255,0.9)] dark:drop-shadow-[0_0_12px_rgba(0,0,0,0.9)]">
          <input
            type="range"
            min="0.2"
            max="5"
            step="0.05"
            value={relativeScale}
            onChange={(e) => zoomToScale(parseFloat(e.target.value))}
            className="w-16 md:w-24 accent-slate-900 dark:accent-white hover:accent-blue-600 dark:hover:accent-blue-400 cursor-pointer h-1.5 rounded-lg appearance-none bg-slate-900/20 dark:bg-white/30 transition-all outline-none"
            title="Zoom level"
            aria-label="Zoom level slider"
          />
          <span className="text-[10px] font-mono font-black text-slate-900 dark:text-white select-none tracking-wider">
            {Math.round(relativeScale * 100)}%
          </span>
        </div>

        <button
          onClick={zoomIn}
          className="group w-16 sm:w-[68px] h-[60px] flex flex-col items-center justify-center gap-1.5 text-slate-900 dark:text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.9)] dark:drop-shadow-[0_0_12px_rgba(0,0,0,0.9)] hover:bg-black/10 dark:hover:bg-white/10 focus-visible:bg-black/10 dark:focus-visible:bg-white/10 rounded-2xl active:scale-95 outline-none transition-all cursor-pointer"
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn size={24} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
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
              transition: isAnimating ? "transform 1.8s cubic-bezier(0.25, 1, 0.5, 1)" : isDragging ? "none" : "transform 0.1s ease-out",
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
                .ttc-svg-container svg .fil3:has(+ .fil8),
                .ttc-svg-container svg .fil3:has(+ .fil9) {
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
                  {plannedPreviewLayers.map(({ segment, closure }) => (
                    <OverlaySegment
                      key={`${segment.id}-planned-preview-${closure.id}`}
                      segment={segment}
                      impact={null}
                      plannedClosure={closure}
                      selection={selection}
                      selectedSegmentIds={selectedSegmentIds}
                      onSelectImpact={onSelectImpact}
                      reducedMotion={reducedMotion}
                      flashSelection={flashSelection}
                    />
                  ))}
                  {renderedImpactLayers.map(({ segment, impact }, index) => (
                    <OverlaySegment
                      key={`${segment.id}-${impact.kind}-${impact.cardId}-${index}`}
                      segment={segment}
                      impact={impact}
                      plannedClosure={undefined}
                      selection={selection}
                      selectedSegmentIds={selectedSegmentIds}
                      onSelectImpact={onSelectImpact}
                      reducedMotion={reducedMotion}
                      flashSelection={flashSelection}
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

                  return (
                    <circle
                      key={station.id}
                      aria-label={`${station.name} station details`}
                      className={`station-hit-target ${selected ? "selected" : ""} ${
                        station.hasActiveImpact ? "has-impact" : ""
                      } access-${station.accessStatus}`}
                      cx={station.mapX}
                      cy={station.mapY}
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
                  );
                })}
              </g>
              <g aria-label="Station impact rings">
                {stationNodeImpacts.map((impact) => {
                  const station = stationBySummaryId.get(impact.stationId);
                  if (!station) return null;
                  const selected = selection?.kind === impact.kind && selection.id === impact.cardId;

                  return (
                    <g key={`${impact.kind}-${impact.cardId}-${impact.stationId}`}>
                      {flashSelection && flashSelection.kind === impact.kind && flashSelection.id === impact.cardId && (
                        <circle
                          data-map-highlight-id={flashSelection.id}
                          className="station-selection-flash"
                          cx={station.mapX}
                          cy={station.mapY}
                          r={station.interchange ? 60 : 48}
                          pointerEvents="none"
                        />
                      )}
                      <circle
                        aria-label={`${impact.title}: ${station.name}`}
                        className={`station-impact-ring ${impact.kind} ${selected ? "selected" : ""}`}
                        cx={station.mapX}
                        cy={station.mapY}
                        r={station.interchange ? 48 : 38}
                        fill="none"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectImpact({ kind: impact.kind, id: impact.cardId });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSelectImpact({ kind: impact.kind, id: impact.cardId });
                          }
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        pointerEvents="stroke"
                        role="button"
                        tabIndex={0}
                      />
                      <circle
                        className="station-impact-dot-red-glow"
                        cx={station.mapX}
                        cy={station.mapY}
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

type SvgBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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

type OverlayVisualState =
  | "suspension"
  | "delay-static"
  | "reduced-speed-zone"
  | "planned-preview";

const MAP_VIEWBOX_BOUNDS: SvgBounds = { x: 0, y: 0, width: 8250, height: 4000 };
const OVERLAY_CORRIDOR_COLLISION_RADIUS = 54;
const OVERLAP_BADGE_EDGE_GAP = 8;

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

  if (!frame) return fallbackCandidates;

  const normalOffset = normalOffsetForBadge(frame.normal, size);
  const tangentShift = Math.max(64, normalOffsetForBadge(frame.tangent, size) * 0.5);
  const nearNormal = offsetFromVector(frame.normal, normalOffset);
  const farNormal = offsetFromVector(frame.normal, normalOffset + 80);
  const tangent = offsetFromVector(frame.tangent, tangentShift);

  return [
    nearNormal,
    scaleOffset(nearNormal, -1),
    addVectors(nearNormal, tangent),
    addVectors(nearNormal, scaleOffset(tangent, -1)),
    addVectors(scaleOffset(nearNormal, -1), tangent),
    addVectors(scaleOffset(nearNormal, -1), scaleOffset(tangent, -1)),
    farNormal,
    scaleOffset(farNormal, -1),
    ...fallbackCandidates,
  ];
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
  for (const candidate of candidates) {
    const position = clampBadgePosition(
      { x: center.x + candidate.dx, y: center.y + candidate.dy },
      size,
    );
    const candidateBox = expandBox(boundsForBadgePosition(position, size), 10);
    if (!blockedBoxes.some((blockedBox) => boxesIntersect(candidateBox, blockedBox))) {
      return { ...position, collisionAvoided: true };
    }
  }

  const fallbackCandidate = candidates[0] ?? { dx: 0, dy: 0 };
  const fallback = clampBadgePosition(
    {
      x: center.x + fallbackCandidate.dx,
      y: center.y + fallbackCandidate.dy,
    },
    size,
  );
  return { ...fallback, collisionAvoided: false };
}

function collectMapCollisionBoxes(svg: SVGSVGElement): SvgBounds[] {
  const selectors = [
    "#layer6 text",
    "#layer6 path",
    "#layer6 circle",
    "#layer6 ellipse",
    "#layer6 rect",
    "#layer6 polygon",
    "#layer6 polyline",
    "#layer6 image",
  ].join(", ");
  return Array.from(svg.querySelectorAll(selectors))
    .map((element) => {
      if (!(element instanceof SVGGraphicsElement)) return null;
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return null;
      }
      try {
        const box = element.getBBox();
        if (box.width <= 0 || box.height <= 0) return null;
        if (box.width > 1200 || box.height > 1200) return null;
        return expandBox({ x: box.x, y: box.y, width: box.width, height: box.height }, 18);
      } catch {
        return null;
      }
    })
    .filter((box): box is SvgBounds => Boolean(box));
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
    return plannedClosures.find((closure) => closure.id === impact.cardId)?.previewSegmentIds
      ?? activeAlerts.find((alert) => alert.id === impact.cardId)?.affectedSegmentIds
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
              <g transform="translate(-24, -24) scale(2.0)" stroke="#ffffff" fill="none" strokeWidth="3.2">
                <circle cx="12" cy="12" r="10.5" />
                <line x1="19.64" y1="4.36" x2="4.36" y2="19.64" />
              </g>
            ) : (
              <path
                d="M -14 -14 L 10 0 L -14 14"
                stroke="#ffffff"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
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
              <g transform="scale(0.08) translate(-512, -512)" className="delay-hourglass">
                <path
                  d="M576 512c0 190.72 448 345.6-25.6 345.6s-25.6-154.88-25.6-345.6-448-345.6 25.6-345.6 25.6 154.88 25.6 345.6z"
                  fill="#F7E6A3"
                />
                <path
                  d="M550.4 870.4c-147.2 0-212.48-14.08-226.56-48.64-14.08-33.28 23.04-71.68 71.68-121.6 51.2-52.48 116.48-120.32 116.48-188.16 0-67.84-65.28-135.68-117.76-189.44-47.36-48.64-85.76-87.04-71.68-121.6C337.92 167.68 403.2 153.6 550.4 153.6s212.48 14.08 226.56 48.64c14.08 33.28-23.04 71.68-71.68 121.6-51.2 52.48-116.48 120.32-116.48 188.16 0 67.84 65.28 135.68 117.76 189.44 47.36 48.64 85.76 87.04 71.68 121.6C762.88 856.32 697.6 870.4 550.4 870.4z m0-691.2c-157.44 0-197.12 17.92-203.52 33.28-7.68 17.92 29.44 56.32 65.28 93.44 55.04 57.6 125.44 128 125.44 207.36 0 79.36-69.12 149.76-125.44 207.36-35.84 37.12-72.96 75.52-65.28 93.44 6.4 12.8 46.08 30.72 203.52 30.72s197.12-17.92 203.52-33.28c7.68-17.92-29.44-56.32-65.28-93.44C632.32 661.76 563.2 591.36 563.2 512c0-79.36 69.12-149.76 125.44-207.36 35.84-37.12 72.96-75.52 65.28-93.44-6.4-14.08-46.08-32-203.52-32z"
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
              <path
                d="M -12 -10 L 8 0 L -12 10"
                fill="none"
                stroke="#ffffff"
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              />
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
            <OverlapKindGlyph kind={kind} />
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

function OverlapKindGlyph({ kind }: { kind: MapImpactKind }) {
  switch (kind) {
    case "suspension":
      return (
        <path
          className="overlap-indicator-glyph suspension"
          d="M 0 -13 L 13 10 H -13 Z"
          fill="none"
        />
      );
    case "planned-closure":
      return (
        <path
          className="overlap-indicator-glyph planned-closure"
          d="M -13 -7 H 13 M -13 7 H 13 M -8 -7 L -2 7 M 4 -7 L 10 7"
          fill="none"
        />
      );
    case "delay":
      return (
        <path
          className="overlap-indicator-glyph delay"
          d="M -10 -12 H 10 M -10 12 H 10 M -6 -9 C -6 -2 6 -2 6 9 M 6 -9 C 6 -2 -6 -2 -6 9"
          fill="none"
        />
      );
    case "reduced-speed-zone":
      return (
        <path
          className="overlap-indicator-glyph reduced-speed-zone"
          d="M -9 -13 L 12 0 L -9 13"
          fill="none"
        />
      );
  }
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
}: {
  segment: RenderedNetworkSegment;
  impact: MapImpact | null;
  plannedClosure: PlannedClosure | undefined;
  selection: ImpactSelection;
  selectedSegmentIds: string[];
  onSelectImpact: (selection: ImpactSelection) => void;
  reducedMotion: boolean;
  flashSelection: ImpactSelection;
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
  const isSelectedSegment =
    selectedSegmentIds.includes(segment.id) ||
    (segment.sourceSegmentIds?.some((segmentId) => selectedSegmentIds.includes(segmentId)) ?? false);
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

  const chevronBg = "#f59e0b";

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
  const selectedClass = isSelectedImpact || isSelectedSegment ? "selected" : "";
  const connectedClass =
    isMultiSegment || (isSelectedSegment && selectedSegmentIds.length > 1)
      ? "connected-corridor"
      : "";

  return (
    <g className={`overlay-segment-group ${connectedClass}`.trim()}>


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

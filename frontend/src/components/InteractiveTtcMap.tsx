"use client";

import { useEffect, useState, useMemo } from "react";
import { usePanZoom } from "../hooks/usePanZoom";
import { ZoomIn, ZoomOut, Locate, Sun, Moon } from "lucide-react";
import {
  networkSegments,
  activeAlerts,
  plannedClosures,
  findAlertBySegmentId,
  type NetworkSegment,
  type ActiveAlert,
  type PlannedClosure,
} from "../app/linewatch-data";

export function InteractiveTtcMap({
  selectedAlertId,
  selectedClosureId,
  onSelectAlertId,
  onSelectClosureId,
  isDark,
  onToggleTheme,
  layoutResetSignal,
}: {
  selectedAlertId: string | null;
  selectedClosureId: string | null;
  onSelectAlertId: (id: string | null) => void;
  onSelectClosureId: (id: string | null) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  layoutResetSignal?: number;
}) {
  const [svgMarkup, setSvgMarkup] = useState<string>("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  const {
    transform,
    relativeScale,
    isDragging,
    isAnimating,
    containerRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    recenter,
    zoomIn,
    zoomOut,
    zoomToScale,
  } = usePanZoom();

  // Load SVG
  useEffect(() => {
    let cancelled = false;
    async function loadMap() {
      try {
        const response = await fetch("/assets/linewatch/ttc-subway-map-edited.svg");
        if (!response.ok) throw new Error("Map load failed");
        const markup = await response.text();

        if (!cancelled) {
          setSvgMarkup(markup);
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

  const selectedAlert = useMemo(() => {
    return activeAlerts.find((a) => a.id === selectedAlertId);
  }, [selectedAlertId]);

  const selectedClosure = useMemo(() => {
    return plannedClosures.find((c) => c.id === selectedClosureId);
  }, [selectedClosureId]);

  const overlaySegments = useMemo(() => {
    return networkSegments.filter((segment) => {
      const isClosurePreview = selectedClosure?.previewSegmentIds.includes(segment.id) ?? false;
      return segment.overlay !== "clear" || isClosurePreview;
    });
  }, [selectedClosure]);

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-transparent">
      {/* Top right Theme toggle (styled like hamburger) */}
      <button
        onClick={onToggleTheme}
        className="absolute top-4 sm:top-6 right-4 sm:right-6 z-20 panel flex items-center justify-center w-14 h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-100 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer pointer-events-auto"
        aria-label="Toggle theme"
      >
        {isDark ? <Sun size={26} className="text-slate-800 dark:text-white" /> : <Moon size={26} className="text-slate-800 dark:text-white" />}
      </button>

      {/* Top center map controls */}
      {/* Note: ml-2 sm:ml-3 is added to visually center the mass of the controls, since the left side has 2 buttons and is visually heavier than the right side */}
      <div className="absolute top-6 sm:top-[72px] left-1/2 -translate-x-1/2 ml-2 sm:ml-0.75 z-20 flex flex-row items-center justify-center gap-1 sm:gap-2 pointer-events-auto">
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
            className={`absolute top-0 left-0 w-full h-full origin-top-left ${isDragging || isAnimating ? 'will-change-transform' : ''}`}
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              transformOrigin: "0 0",
              transition: isAnimating ? "transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)" : isDragging ? "none" : "transform 0.1s ease-out",
            }}
          >
            <style>
              {`
                #segment-guides-layer { display: none; }
                
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

            {/* Bottom Layer: Base Subway tracks and base graphics */}
            <div
              className="w-[4500px] h-[2181.8px] max-w-none ttc-svg-container pointer-events-none absolute top-0 left-0 [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />

            {/* Middle Layer: Highlighted overlays for active delays/closures */}
            <svg
              className="absolute top-0 left-0 w-[4500px] h-[2181.8px] pointer-events-none"
              viewBox="0 0 8250 4000"
              preserveAspectRatio="xMidYMid meet"
            >
              <g aria-label="Disruption overlays">
                {overlaySegments.map((segment) => (
                  <OverlaySegment
                    key={segment.id}
                    segment={segment}
                    selectedAlert={selectedAlert}
                    selectedClosure={selectedClosure}
                    onSelectAlert={onSelectAlertId}
                    onSelectClosure={onSelectClosureId}
                  />
                ))}
              </g>
            </svg>

            {/* Top Layer: Stations and labels (Sandwiched on top so overlays don't cover text) */}
            <div
              className="w-[4500px] h-[2181.8px] max-w-none ttc-svg-container pointer-events-none absolute top-0 left-0 [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function OverlaySegment({
  segment,
  selectedAlert,
  selectedClosure,
  onSelectAlert,
  onSelectClosure,
}: {
  segment: NetworkSegment;
  selectedAlert?: ActiveAlert;
  selectedClosure?: PlannedClosure;
  onSelectAlert: (alertId: string | null) => void;
  onSelectClosure: (closureId: string | null) => void;
}) {
  const alert = segment.alertId ? findAlertBySegmentId(segment.id) : undefined;
  const isClosurePreview = selectedClosure?.previewSegmentIds.includes(segment.id) ?? false;
  const isSelectedAlert = Boolean(selectedAlert?.affectedSegmentIds.includes(segment.id));
  const visualState = segment.overlay !== "clear" ? segment.overlay : isClosurePreview ? "planned-preview" : "clear";

  if (visualState === "clear") {
    return null;
  }

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (alert) {
      onSelectAlert(alert.id === selectedAlert?.id ? null : alert.id);
      onSelectClosure(null);
      return;
    }

    if (selectedClosure) {
      onSelectClosure(selectedClosure.id === selectedClosure?.id ? null : selectedClosure.id);
      onSelectAlert(null);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGPathElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (alert) {
        onSelectAlert(alert.id === selectedAlert?.id ? null : alert.id);
        onSelectClosure(null);
      } else if (selectedClosure) {
        onSelectClosure(selectedClosure.id === selectedClosure?.id ? null : selectedClosure.id);
        onSelectAlert(null);
      }
    }
  };

  return (
    <path
      aria-label={alert ? `${alert.title}: ${segment.label}` : `${selectedClosure?.title}: ${segment.label}`}
      className={`asset-alert-path cursor-pointer pointer-events-auto ${visualState} ${
        isSelectedAlert ? "selected" : ""
      }`}
      d={segment.pathD}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      onPointerDown={(e) => e.stopPropagation()} // Prevent initiating map drag when clicking paths
      role="button"
      tabIndex={0}
    />
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { Locate, ZoomIn, ZoomOut } from "lucide-react";
import type { ImpactSelection } from "../app/linewatch-data";
import { REGIONAL_ROUTE_DEFINITIONS } from "../app/regional-data";
import { useDashboardData } from "../app/DataContext";
import { currentDevicePixelRatio, snapTransformToDevicePixels } from "../hooks/panZoomMath";

const MAP_WIDTH = 4739.2821;
const MAP_HEIGHT = 2616.8174;
const MIN_SCALE = 0.1;
const MAX_SCALE = 1.6;

type Camera = { x: number; y: number; scale: number };

function snapCameraToDevicePixels(camera: Camera): Camera {
  return snapTransformToDevicePixels(camera, currentDevicePixelRatio());
}

export function InteractiveRegionalMap({
  selection,
  onSelectImpact,
  selectedStationId,
  onSelectStationId,
  reducedMotion,
  recenterSignal,
}: {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  selectedStationId: string | null;
  onSelectStationId: (id: string | null) => void;
  reducedMotion: boolean;
  recenterSignal?: number;
}) {
  const { activeAlerts, networkSegments, stationNodeImpacts } = useDashboardData();
  const viewportRef = useRef<HTMLDivElement>(null);
  const cameraInitializedRef = useRef(false);
  const lastRecenterSignalRef = useRef(recenterSignal);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; camera: Camera } | null>(null);
  const [svgMarkup, setSvgMarkup] = useState("");
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 0.7 });
  const [loadError, setLoadError] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fitScale, setFitScale] = useState(0.35);
  const [mapTransition, setMapTransition] = useState<string>("none");
  const animTimeoutRef = useRef<number | null>(null);

  const animateCameraTo = useCallback((targetCamera: Camera, nextFitScale?: number) => {
    if (nextFitScale !== undefined) {
      setFitScale(nextFitScale);
    }
    if (reducedMotion) {
      setCamera(targetCamera);
      return;
    }
    if (animTimeoutRef.current !== null) {
      window.clearTimeout(animTimeoutRef.current);
    }
    setMapTransition("transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)");
    setCamera(targetCamera);
    animTimeoutRef.current = window.setTimeout(() => {
      animTimeoutRef.current = null;
      setMapTransition("none");
    }, 850);
  }, [reducedMotion]);

  useEffect(() => {
    return () => {
      if (animTimeoutRef.current !== null) {
        window.clearTimeout(animTimeoutRef.current);
      }
    };
  }, []);

  const fitNetwork = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    const scale = Math.max(MIN_SCALE, Math.min(1.6, Math.min(width / MAP_WIDTH, height / MAP_HEIGHT) * 0.90));
    cameraInitializedRef.current = true;
    animateCameraTo(snapCameraToDevicePixels({
      x: (width - MAP_WIDTH * scale) / 2,
      y: (height - MAP_HEIGHT * scale) / 2,
      scale,
    }), scale);
  }, [animateCameraTo]);

  useEffect(() => {
    let cancelled = false;
    fetch("/assets/linewatch/regional-rail-map.svg")
      .then((response) => {
        if (!response.ok) throw new Error("Regional map unavailable");
        return response.text();
      })
      .then((source) => {
        if (cancelled) return;
        const documentNode = new DOMParser().parseFromString(source, "image/svg+xml");
        for (const element of documentNode.querySelectorAll<SVGElement>("[id^='station-']")) {
          if (element.id.endsWith("-ki") || element.id.endsWith("-up")) continue;
          const stationId = element.id.replace(/^station-/, "");
          const hitTarget = element.cloneNode(true) as SVGElement;
          hitTarget.removeAttribute("id");
          hitTarget.querySelectorAll("[id]").forEach((child) => child.removeAttribute("id"));
          hitTarget.dataset.regionalStationId = stationId;
          hitTarget.setAttribute("role", "button");
          hitTarget.setAttribute("tabindex", "0");
          hitTarget.setAttribute("aria-label", `${stationId.replaceAll("-", " ")} station details`);
          hitTarget.classList.add("regional-station-hit-target");
          const hitShapes = hitTarget.matches("circle, rect") ? [hitTarget] : [...hitTarget.querySelectorAll<SVGElement>("circle, rect")];
          for (const shape of hitShapes) {
            shape.setAttribute("style", "fill:transparent;stroke:transparent;stroke-width:120;pointer-events:all");
          }
          element.before(hitTarget);
          element.classList.add("regional-station-visual");
        }
        for (const alert of activeAlerts.filter((item) => item.affectedSegmentIds.length === 0)) {
          const routeCode = alert.lineId.replace("regional-", "");
          const pathIds = routeCode === "lw"
            ? ["regional-route-lw-main-path", "regional-route-lw-branch-path"]
            : [`regional-route-${routeCode}-path`];
          for (const pathId of pathIds) {
            const routePath = documentNode.getElementById(pathId) as SVGPathElement | null;
            if (!routePath) continue;
            const overlay = routePath.cloneNode(false) as SVGPathElement;
            overlay.removeAttribute("id");
            overlay.dataset.regionalImpactKind = alert.severity;
            overlay.dataset.regionalImpactId = alert.id;
            overlay.setAttribute("role", "button");
            overlay.setAttribute("tabindex", "0");
            overlay.setAttribute("aria-label", `${alert.lineNumber} ${alert.title}`);
            overlay.setAttribute("style", `fill:none;stroke:${alert.severity === "suspension" ? "#ef4444" : "#f59e0b"};stroke-width:105;stroke-linecap:round;stroke-linejoin:round;pointer-events:stroke`);
            routePath.after(overlay);
          }
        }
        const stationsLayer = documentNode.getElementById("regional-stations-layer");
        for (const segment of networkSegments.filter((item) => item.overlay !== "clear" && item.guidePathId)) {
          const guide = documentNode.getElementById(segment.guidePathId ?? "") as SVGPathElement | null;
          const impact = segment.impacts?.[0];
          if (!guide || !impact || !stationsLayer) continue;
          const overlay = guide.cloneNode(false) as SVGPathElement;
          overlay.removeAttribute("id");
          overlay.dataset.regionalImpactKind = impact.kind;
          overlay.dataset.regionalImpactId = impact.cardId;
          overlay.setAttribute("role", "button");
          overlay.setAttribute("tabindex", "0");
          overlay.setAttribute("aria-label", `${segment.label} ${impact.kind} demo`);
          overlay.setAttribute("style", `display:inline;fill:none;stroke:${segment.overlay === "suspension" ? "#ef4444" : "#f59e0b"};stroke-width:95;stroke-linecap:round;pointer-events:stroke`);
          stationsLayer.append(overlay);
        }
        for (const impact of stationNodeImpacts) {
          const stationVisual = documentNode.getElementById(`station-${impact.stationId}`) as SVGElement | null;
          if (!stationVisual) continue;
          const ring = stationVisual.cloneNode(true) as SVGElement;
          ring.removeAttribute("id");
          ring.querySelectorAll("[id]").forEach((child) => child.removeAttribute("id"));
          ring.dataset.regionalImpactKind = impact.kind;
          ring.dataset.regionalImpactId = impact.cardId;
          ring.setAttribute("role", "button");
          ring.setAttribute("tabindex", "0");
          ring.setAttribute("aria-label", impact.title);
          const shapes = ring.matches("circle, rect") ? [ring] : [...ring.querySelectorAll<SVGElement>("circle, rect")];
          for (const shape of shapes) shape.setAttribute("style", "fill:transparent;stroke:#3b82f6;stroke-width:65;pointer-events:stroke");
          stationVisual.before(ring);
        }
        const root = documentNode.documentElement;
        root.removeAttribute("width");
        root.removeAttribute("height");
        root.setAttribute("preserveAspectRatio", "xMidYMid meet");
        root.setAttribute("aria-label", "GO and UP regional rail schematic");
        root.setAttribute("role", "img");
        setSvgMarkup(new XMLSerializer().serializeToString(root));
        if (!cameraInitializedRef.current) {
          window.requestAnimationFrame(() => {
            if (!cameraInitializedRef.current) fitNetwork();
          });
        }
      })
      .catch(() => setLoadError(true));
    return () => { cancelled = true; };
  }, [activeAlerts, fitNetwork, networkSegments, stationNodeImpacts]);

  useEffect(() => {
    // Treat this as an edge-triggered command. A remount or data refresh must
    // never replay an old Center request that is still stored by the shell.
    if (recenterSignal === undefined || recenterSignal === lastRecenterSignalRef.current) return;
    lastRecenterSignalRef.current = recenterSignal;
    fitNetwork();
  }, [fitNetwork, recenterSignal]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (cameraInitializedRef.current) return;
      if (viewport.clientWidth <= 0 || viewport.clientHeight <= 0) return;
      fitNetwork();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitNetwork]);

  useEffect(() => {
    const root = viewportRef.current;
    root?.querySelectorAll("[data-regional-station-selected]").forEach((element) => element.removeAttribute("data-regional-station-selected"));
    if (selectedStationId) {
      root?.querySelector(`#station-${CSS.escape(selectedStationId)}`)?.setAttribute("data-regional-station-selected", "true");
    }
  }, [selectedStationId, svgMarkup]);

  useEffect(() => {
    const root = viewportRef.current;
    root?.querySelectorAll("[data-regional-impact-selected]").forEach((element) => element.removeAttribute("data-regional-impact-selected"));
    if (selection) {
      root?.querySelector(`[data-regional-impact-kind="${selection.kind}"][data-regional-impact-id="${CSS.escape(selection.id)}"]`)
        ?.setAttribute("data-regional-impact-selected", "true");
    }
  }, [selection, svgMarkup]);

  const zoomAtCenter = useCallback((factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const centerX = viewport.clientWidth / 2;
    const centerY = viewport.clientHeight / 2;
    setCamera((current) => {
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, current.scale * factor));
      const ratio = nextScale / current.scale;
      return snapCameraToDevicePixels({
        x: centerX - (centerX - current.x) * ratio,
        y: centerY - (centerY - current.y) * ratio,
        scale: nextScale,
      });
    });
  }, []);

  const zoomToScale = useCallback((targetScale: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const centerX = viewport.clientWidth / 2;
    const centerY = viewport.clientHeight / 2;
    setCamera((current) => {
      const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale));
      const ratio = nextScale / current.scale;
      return snapCameraToDevicePixels({
        x: centerX - (centerX - current.x) * ratio,
        y: centerY - (centerY - current.y) * ratio,
        scale: nextScale,
      });
    });
  }, []);

  const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoomAtCenter(event.deltaY < 0 ? 1.12 : 0.89);
  }, [zoomAtCenter]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, camera };
    setDragging(true);
  }, [camera]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setCamera(snapCameraToDevicePixels({
      ...drag.camera,
      x: drag.camera.x + event.clientX - drag.x,
      y: drag.camera.y + event.clientY - drag.y,
    }));
  }, []);

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
  }, []);

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
      onSelectStationId(selectedStationId === id ? null : id);
    }
  }, [onSelectImpact, onSelectStationId, selectedStationId]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateTarget(event.target);
  }, [activateTarget]);

  const legend = useMemo(() => REGIONAL_ROUTE_DEFINITIONS.map((route) => (
    <li key={route.number}><span style={{ backgroundColor: route.color }} />{route.number} {route.name}</li>
  )), []);

  return (
    <section className="regional-map" aria-label="Interactive GO and UP map">
      <div
        ref={viewportRef}
        className="regional-map-viewport"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(event) => activateTarget(event.target)}
        onKeyDown={onKeyDown}
      >
        {loadError ? <p role="alert" className="regional-map-error">Regional map could not be loaded.</p> : null}
        <div
          className="regional-map-stage"
          style={{
            width: `${MAP_WIDTH}px`,
            height: `${MAP_HEIGHT}px`,
            right: "auto",
            bottom: "auto",
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
            transformOrigin: "0 0",
            transition: reducedMotion || dragging ? "none" : mapTransition !== "none" ? mapTransition : "transform 0.1s ease-out",
          }}
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      </div>
      {/* Regional map controls positioned vertically on right side centered below top-right info button */}
      <div className="map-control-rail regional-map-control-rail absolute top-20 sm:top-[96px] right-4 sm:right-6 z-30 w-10 sm:w-14 flex flex-col items-center justify-center gap-1.5 py-2 px-1 rounded-xl pointer-events-auto">
        <div className="map-control-recenter-container flex flex-col items-center w-full">
          <button
            type="button"
            onClick={fitNetwork}
            className="map-control-button group w-full flex flex-col items-center justify-center py-1 rounded-lg hover:bg-slate-900/10 dark:hover:bg-white/10 transition-colors"
            title="Fit regional network"
            aria-label="Fit regional network"
          >
            <Locate size={18} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            <span className="map-control-recenter-desktop-label text-[9px] font-black uppercase tracking-wider group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mt-0.5 leading-none">Center</span>
          </button>
          <span className="map-control-recenter-mobile-label">Center Map</span>
        </div>

        <div className="w-8 h-[1px] bg-slate-900/15 dark:bg-white/20 my-0.5" aria-hidden="true" />

        <div className="map-control-zoom-group flex flex-col items-center w-full gap-1.5">
          <button
            type="button"
            onClick={() => zoomAtCenter(1.18)}
            className="map-control-button group w-full flex flex-col items-center justify-center py-1 rounded-lg hover:bg-slate-900/10 dark:hover:bg-white/10 transition-colors"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn size={18} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            <span className="text-[9px] font-black uppercase tracking-wider group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mt-0.5 leading-none">In</span>
          </button>

          <div className="map-control-slider flex flex-col items-center justify-center gap-1 my-0.5 w-full">
            <input
              type="range"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step="0.05"
              value={camera.scale}
              onChange={(e) => zoomToScale(parseFloat(e.target.value))}
              className="h-16 w-1.5 accent-slate-900 dark:accent-white hover:accent-blue-600 dark:hover:accent-blue-400 cursor-pointer rounded-lg appearance-none bg-slate-900/20 dark:bg-white/30 transition-all outline-none [writing-mode:vertical-lr] [direction:rtl]"
              title="Zoom level"
              aria-label="Zoom level slider"
            />
            <span className="text-[9px] font-mono font-black select-none tracking-tight leading-none">
              {Math.round((camera.scale / (fitScale || 0.35)) * 100)}%
            </span>
          </div>

          <button
            type="button"
            onClick={() => zoomAtCenter(0.85)}
            className="map-control-button group w-full flex flex-col items-center justify-center py-1 rounded-lg hover:bg-slate-900/10 dark:hover:bg-white/10 transition-colors"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut size={18} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            <span className="text-[9px] font-black uppercase tracking-wider group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mt-0.5 leading-none">Out</span>
          </button>
        </div>
      </div>
      <aside className="regional-map-legend panel" aria-label="Regional rail legend">
        <strong>GO &amp; UP corridors</strong>
        <ul>{legend}</ul>
        <p><span className="limited-service-swatch" aria-hidden="true" /> Limited service <small>Scheduled service pattern, not a disruption.</small></p>
        <em>Demo fixture — not live service information</em>
      </aside>
    </section>
  );
}

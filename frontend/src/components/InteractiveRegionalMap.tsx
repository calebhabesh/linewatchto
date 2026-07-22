"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { Locate, Minus, Plus } from "lucide-react";
import type { ImpactSelection } from "../app/linewatch-data";
import { REGIONAL_ROUTE_DEFINITIONS } from "../app/regional-data";
import { useDashboardData } from "../app/DataContext";

const MAP_WIDTH = 1487.1575;
const MAP_HEIGHT = 1003.27812;
const MIN_SCALE = 0.42;
const MAX_SCALE = 3.2;

type Camera = { x: number; y: number; scale: number };

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
  const dragRef = useRef<{ pointerId: number; x: number; y: number; camera: Camera } | null>(null);
  const [svgMarkup, setSvgMarkup] = useState("");
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 0.7 });
  const [loadError, setLoadError] = useState(false);
  const [dragging, setDragging] = useState(false);

  const fitNetwork = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const scale = Math.max(MIN_SCALE, Math.min(1, Math.min(viewport.clientWidth / MAP_WIDTH, viewport.clientHeight / MAP_HEIGHT) * 0.92));
    setCamera({
      x: (viewport.clientWidth - MAP_WIDTH * scale) / 2,
      y: (viewport.clientHeight - MAP_HEIGHT * scale) / 2,
      scale,
    });
  }, []);

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
        root.setAttribute("aria-label", "GO and UP regional rail schematic");
        root.setAttribute("role", "img");
        setSvgMarkup(new XMLSerializer().serializeToString(root));
        window.requestAnimationFrame(fitNetwork);
      })
      .catch(() => setLoadError(true));
    return () => { cancelled = true; };
  }, [activeAlerts, fitNetwork, networkSegments, stationNodeImpacts]);

  useEffect(() => {
    if (recenterSignal === undefined) return;
    fitNetwork();
  }, [fitNetwork, recenterSignal]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(fitNetwork);
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
      return { x: centerX - (centerX - current.x) * ratio, y: centerY - (centerY - current.y) * ratio, scale: nextScale };
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
    setCamera({ ...drag.camera, x: drag.camera.x + event.clientX - drag.x, y: drag.camera.y + event.clientY - drag.y });
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
          style={{ transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`, transition: reducedMotion || dragging ? "none" : "transform 160ms ease-out" }}
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      </div>
      <div className="regional-map-controls" aria-label="Regional map controls">
        <button type="button" onClick={() => zoomAtCenter(1.2)} aria-label="Zoom in"><Plus /></button>
        <button type="button" onClick={() => zoomAtCenter(0.8)} aria-label="Zoom out"><Minus /></button>
        <button type="button" onClick={fitNetwork} aria-label="Fit regional network"><Locate /></button>
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

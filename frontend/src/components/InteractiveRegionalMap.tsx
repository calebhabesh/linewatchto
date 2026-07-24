"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { Locate, ZoomIn, ZoomOut } from "lucide-react";
import type { ImpactSelection } from "../app/linewatch-data";
import { useDashboardData } from "../app/DataContext";
import {
  clampPanZoomScale,
  computeBoundedMapFrame,
  computeInsetViewportFocus,
  currentDevicePixelRatio,
  PAN_ZOOM_MAX_RELATIVE_SCALE,
  PAN_ZOOM_MIN_RELATIVE_SCALE,
  snapTransformToDevicePixels,
} from "../hooks/panZoomMath";

const MAP_WIDTH = 4739.2821;
const MAP_HEIGHT = 2616.8174;
const REGIONAL_MAP_HORIZONTAL_INSET_RATIO = 0.025;
const REGIONAL_MAP_MOBILE_INSET_RATIO = 0.05;
// The authored SVG is slightly wider than the camera canvas, leaving just over
// 4% of vertical letterbox room in the fitted frame. Stay below that limit so
// the tighter default never crosses the console or impact-badge bounds.
const REGIONAL_MAP_DEFAULT_FRAME_SCALE = 1.04;

type Camera = { x: number; y: number; scale: number };

function snapCameraToDevicePixels(camera: Camera): Camera {
  return snapTransformToDevicePixels(camera, currentDevicePixelRatio());
}

function InteractiveRegionalMapComponent({
  selection,
  onSelectImpact,
  selectedStationId,
  onSelectStationId,
  reducedMotion,
  recenterSignal,
  isDark = true,
}: {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  selectedStationId: string | null;
  onSelectStationId: (id: string | null) => void;
  reducedMotion: boolean;
  recenterSignal?: number;
  isDark?: boolean;
}) {
  const { activeAlerts, networkSegments, stationNodeImpacts } = useDashboardData();
  const viewportRef = useRef<HTMLDivElement>(null);
  const mapStageRef = useRef<HTMLDivElement>(null);
  const cameraInitializedRef = useRef(false);
  const lastRecenterSignalRef = useRef(recenterSignal);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; camera: Camera } | null>(null);
  const [svgMarkup, setSvgMarkup] = useState("");
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [loadError, setLoadError] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fitScale, setFitScale] = useState(0.35);
  const [desktopMapTopInset, setDesktopMapTopInset] = useState(0);
  const [desktopMapBottomInset, setDesktopMapBottomInset] = useState(0);
  const animTimeoutRef = useRef<number | null>(null);
  const programmaticAnimationFrameRef = useRef<number | null>(null);
  const dragAnimationFrameRef = useRef<number | null>(null);
  const pendingDragPointRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);
  const wheelCommitTimeoutRef = useRef<number | null>(null);
  const cameraRef = useRef(camera);

  const writeMapTransform = useCallback((nextCamera: Camera) => {
    if (mapStageRef.current) {
      mapStageRef.current.style.transform = `translate(${nextCamera.x}px, ${nextCamera.y}px) scale(${nextCamera.scale})`;
    }
  }, []);

  const setMapTransition = useCallback((transition: string) => {
    if (mapStageRef.current) {
      mapStageRef.current.style.transition = transition;
    }
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
  }, []);

  const currentRenderedCamera = useCallback((): Camera | null => {
    if (!mapStageRef.current) return null;
    const computedTransform = window.getComputedStyle(mapStageRef.current).transform;
    if (!computedTransform || computedTransform === "none") return null;
    const matrix = new DOMMatrixReadOnly(computedTransform);
    return snapCameraToDevicePixels({ x: matrix.m41, y: matrix.m42, scale: matrix.a });
  }, []);

  const cancelCameraAnimation = useCallback(() => {
    const renderedCamera = currentRenderedCamera();
    clearProgrammaticAnimation();
    setMapTransition(reducedMotion ? "none" : "transform 0.1s ease-out");
    if (!renderedCamera) return;
    cameraRef.current = renderedCamera;
    writeMapTransform(renderedCamera);
    setCamera(renderedCamera);
  }, [clearProgrammaticAnimation, currentRenderedCamera, reducedMotion, setMapTransition, writeMapTransform]);

  const animateCameraTo = useCallback((targetCamera: Camera, nextFitScale?: number) => {
    cameraRef.current = targetCamera;
    clearProgrammaticAnimation();

    if (!mapStageRef.current || reducedMotion) {
      setMapTransition("none");
      writeMapTransform(targetCamera);
      if (nextFitScale !== undefined) setFitScale(nextFitScale);
      setCamera(targetCamera);
      return;
    }

    setMapTransition("transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)");
    programmaticAnimationFrameRef.current = window.requestAnimationFrame(() => {
      programmaticAnimationFrameRef.current = null;
      writeMapTransform(targetCamera);
    });

    animTimeoutRef.current = window.setTimeout(() => {
      animTimeoutRef.current = null;
      setMapTransition("none");
      if (nextFitScale !== undefined) setFitScale(nextFitScale);
      setCamera({ ...cameraRef.current });
    }, 850);
  }, [clearProgrammaticAnimation, reducedMotion, setMapTransition, writeMapTransform]);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    return () => {
      clearProgrammaticAnimation();
      if (dragAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(dragAnimationFrameRef.current);
      }
      if (wheelCommitTimeoutRef.current !== null) {
        window.clearTimeout(wheelCommitTimeoutRef.current);
      }
    };
  }, [clearProgrammaticAnimation]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const mapSurface = viewport?.closest<HTMLElement>(".network-map-transition-surface");
    const shell = viewport?.closest<HTMLElement>(".linewatch-shell");
    const consoleCapsule = shell?.querySelector<HTMLElement>(".desktop-status-capsule");
    const impactBadges = shell?.querySelector<HTMLElement>(".desktop-status-chip-row-container");
    if (!viewport || !mapSurface || !consoleCapsule || !impactBadges) return;

    const measureDesktopInsets = () => {
      const viewportRect = viewport.getClientRects().length > 0
        ? viewport.getBoundingClientRect()
        : mapSurface.getBoundingClientRect();
      const consoleRect = consoleCapsule.getBoundingClientRect();
      const badgesRect = impactBadges.getBoundingClientRect();
      const nextTopInset = consoleRect.width > 0 && consoleRect.height > 0
        ? Math.min(viewportRect.height, Math.max(0, Math.round(consoleRect.bottom - viewportRect.top)))
        : 0;
      const nextBottomInset = badgesRect.width > 0 && badgesRect.height > 0
        ? Math.min(viewportRect.height - nextTopInset, Math.max(0, Math.round(viewportRect.bottom - badgesRect.top)))
        : 0;
      setDesktopMapTopInset((current) => current === nextTopInset ? current : nextTopInset);
      setDesktopMapBottomInset((current) => current === nextBottomInset ? current : nextBottomInset);
    };

    measureDesktopInsets();
    const observer = new ResizeObserver(measureDesktopInsets);
    observer.observe(viewport);
    observer.observe(mapSurface);
    observer.observe(consoleCapsule);
    observer.observe(impactBadges);
    window.addEventListener("resize", measureDesktopInsets);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureDesktopInsets);
    };
  }, []);

  const fittedCamera = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const mapSurface = viewport.closest<HTMLElement>(".network-map-transition-surface");
    const width = viewport.clientWidth || mapSurface?.clientWidth || 0;
    const height = viewport.clientHeight || mapSurface?.clientHeight || 0;
    if (width <= 0 || height <= 0) return null;
    const horizontalInset = desktopMapTopInset > 0
      ? Math.min(64, Math.max(32, width * REGIONAL_MAP_HORIZONTAL_INSET_RATIO))
      : width * REGIONAL_MAP_MOBILE_INSET_RATIO;
    const insets = desktopMapTopInset > 0
      ? {
          left: horizontalInset,
          right: horizontalInset,
          top: desktopMapTopInset,
          bottom: desktopMapBottomInset,
        }
      : {
          left: horizontalInset,
          right: horizontalInset,
          top: height * REGIONAL_MAP_MOBILE_INSET_RATIO,
          bottom: height * REGIONAL_MAP_MOBILE_INSET_RATIO,
        };
    const frame = computeBoundedMapFrame(
      width,
      height,
      { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT },
      insets,
    );
    const focus = computeInsetViewportFocus(width, height, insets);
    // Use more of the available horizontal canvas while keeping the enlarged
    // default frame centered in the space between the top console and alerts.
    const defaultFrame = {
      x: focus.focusX - (focus.focusX - frame.x) * REGIONAL_MAP_DEFAULT_FRAME_SCALE,
      y: focus.focusY - (focus.focusY - frame.y) * REGIONAL_MAP_DEFAULT_FRAME_SCALE,
      scale: frame.scale * REGIONAL_MAP_DEFAULT_FRAME_SCALE,
    };
    return {
      camera: snapCameraToDevicePixels(defaultFrame),
      scale: defaultFrame.scale,
    };
  }, [desktopMapBottomInset, desktopMapTopInset]);

  const fitNetwork = useCallback(() => {
    const fitted = fittedCamera();
    if (!fitted) return;
    cameraInitializedRef.current = true;
    animateCameraTo(fitted.camera, fitted.scale);
  }, [animateCameraTo, fittedCamera]);

  const initializeMapCamera = useCallback(() => {
    if (cameraInitializedRef.current || !svgMarkup) return;
    const fitted = fittedCamera();
    if (!fitted) return;
    cameraInitializedRef.current = true;
    setMapTransition("none");
    cameraRef.current = fitted.camera;
    writeMapTransform(fitted.camera);
    setFitScale(fitted.scale);
    setCamera(fitted.camera);
  }, [fittedCamera, setMapTransition, svgMarkup, writeMapTransform]);

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
      })
      .catch(() => setLoadError(true));
    return () => { cancelled = true; };
  }, [activeAlerts, networkSegments, stationNodeImpacts]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(initializeMapCamera);
    return () => window.cancelAnimationFrame(frameId);
  }, [initializeMapCamera]);

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
      initializeMapCamera();
    });
    observer.observe(viewport);
    const mapSurface = viewport.closest<HTMLElement>(".network-map-transition-surface");
    if (mapSurface) observer.observe(mapSurface);
    return () => observer.disconnect();
  }, [initializeMapCamera]);

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
      const nextScale = clampPanZoomScale(current.scale * factor, fitScale);
      const ratio = nextScale / current.scale;
      return snapCameraToDevicePixels({
        x: centerX - (centerX - current.x) * ratio,
        y: centerY - (centerY - current.y) * ratio,
        scale: nextScale,
      });
    });
  }, [fitScale]);

  const zoomToScale = useCallback((targetRelativeScale: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const centerX = viewport.clientWidth / 2;
    const centerY = viewport.clientHeight / 2;
    setCamera((current) => {
      const nextScale = clampPanZoomScale(targetRelativeScale * fitScale, fitScale);
      const ratio = nextScale / current.scale;
      return snapCameraToDevicePixels({
        x: centerX - (centerX - current.x) * ratio,
        y: centerY - (centerY - current.y) * ratio,
        scale: nextScale,
      });
    });
  }, [fitScale]);

  const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;

    clearProgrammaticAnimation();
    setMapTransition("none");

    const rect = viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
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
    }, 80);
  }, [clearProgrammaticAnimation, fitScale, setMapTransition, writeMapTransform]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    cancelCameraAnimation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, camera: cameraRef.current };
    pendingDragPointRef.current = null;
    dragMovedRef.current = false;
    setDragging(true);
  }, [cancelCameraAnimation]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    pendingDragPointRef.current = { x: event.clientX, y: event.clientY };
    if (Math.abs(event.clientX - drag.x) > 3 || Math.abs(event.clientY - drag.y) > 3) {
      dragMovedRef.current = true;
    }
    if (dragAnimationFrameRef.current !== null) return;

    dragAnimationFrameRef.current = window.requestAnimationFrame(() => {
      dragAnimationFrameRef.current = null;
      const activeDrag = dragRef.current;
      const point = pendingDragPointRef.current;
      if (!activeDrag || !point) return;
      const nextCamera = snapCameraToDevicePixels({
        ...activeDrag.camera,
        x: activeDrag.camera.x + point.x - activeDrag.x,
        y: activeDrag.camera.y + point.y - activeDrag.y,
      });
      cameraRef.current = nextCamera;
      writeMapTransform(nextCamera);
    });
  }, [writeMapTransform]);

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (dragAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(dragAnimationFrameRef.current);
      dragAnimationFrameRef.current = null;
    }
    const point = pendingDragPointRef.current;
    if (point) {
      const nextCamera = snapCameraToDevicePixels({
        ...drag.camera,
        x: drag.camera.x + point.x - drag.x,
        y: drag.camera.y + point.y - drag.y,
      });
      cameraRef.current = nextCamera;
      writeMapTransform(nextCamera);
    }
    pendingDragPointRef.current = null;
    dragRef.current = null;
    setCamera({ ...cameraRef.current });
    setDragging(false);
  }, [writeMapTransform]);

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

  const relativeScale = camera.scale / (fitScale || 1);

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
        onClick={(event) => {
          if (dragMovedRef.current) return;
          activateTarget(event.target);
        }}
        onKeyDown={onKeyDown}
      >
        {loadError ? <p role="alert" className="regional-map-error">Regional map could not be loaded.</p> : null}
        <div
          ref={mapStageRef}
          className="regional-map-stage relative"
          style={{
            width: `${MAP_WIDTH}px`,
            height: `${MAP_HEIGHT}px`,
            right: "auto",
            bottom: "auto",
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
            transformOrigin: "0 0",
            transition: reducedMotion || dragging ? "none" : "transform 0.1s ease-out",
          }}
        >
          <div dangerouslySetInnerHTML={{ __html: svgMarkup }} className="w-full h-full" />
          {/* Static North Compass fixed to regional map canvas */}
          <svg
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
            viewBox="-200 -200 17036.959 9031.6719"
            preserveAspectRatio="xMidYMid meet"
          >
            <g aria-label="Cardinal North Compass" transform="translate(14800, 5100)">
              <image
                href="/assets/linewatch/cardinal-north.svg"
                width="1000"
                height="1000"
                className="opacity-90"
                style={{ filter: isDark ? "invert(1)" : "none" }}
              />
            </g>
          </svg>
        </div>
      </div>
      {/* Regional map controls positioned vertically on right side centered below top-right info button */}
      <div className="map-control-rail regional-map-control-rail absolute top-40 sm:top-[176px] right-4 sm:right-6 z-30 flex flex-col items-center justify-center gap-1 sm:gap-2 pointer-events-auto">
        <div className="map-control-recenter-container">
          <button
            type="button"
            onClick={fitNetwork}
            className="map-control-button group"
            title="Fit regional network"
            aria-label="Fit regional network"
          >
            <Locate size={20} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            <span className="map-control-recenter-desktop-label text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Center</span>
          </button>
          <span className="map-control-recenter-mobile-label">Center Map</span>
        </div>

        <div className="map-control-zoom-group flex flex-col items-center gap-1 sm:gap-2">
          <div className="map-control-divider-v" aria-hidden="true" />

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

          <div className="map-control-slider flex flex-col items-center justify-center gap-1.5 my-0.5 sm:my-1">
            <input
              type="range"
              min={PAN_ZOOM_MIN_RELATIVE_SCALE}
              max={PAN_ZOOM_MAX_RELATIVE_SCALE}
              step="0.05"
              value={relativeScale}
              onChange={(e) => zoomToScale(parseFloat(e.target.value))}
              className="h-16 md:h-20 w-1.5 accent-slate-900 dark:accent-white hover:accent-blue-600 dark:hover:accent-blue-400 cursor-pointer rounded-lg appearance-none bg-slate-900/20 dark:bg-white/30 transition-all outline-none [writing-mode:vertical-lr] [direction:rtl]"
              title="Zoom level"
              aria-label="Zoom level slider"
            />
            <span className="text-[10px] font-mono font-black select-none tracking-wider">
              {Math.round(relativeScale * 100)}%
            </span>
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
      </div>
    </section>
  );
}

export const InteractiveRegionalMap = memo(InteractiveRegionalMapComponent);
InteractiveRegionalMap.displayName = "InteractiveRegionalMap";

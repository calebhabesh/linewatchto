"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { Locate, ZoomIn, ZoomOut } from "lucide-react";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import { useDashboardData } from "../app/DataContext";
import {
  clampPanZoomScale,
  computeBoundedMapFrame,
  computeFittedCameraFlyInStart,
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

const REGIONAL_LARGE_TERMINAL_IDS = new Set([
  "union",
  "allandale-waterfront",
  "niagara-falls",
  "durham-college-oshawa",
  "stratford",
  "kitchener",
  "milton",
  "bloomington",
  "old-elm",
  "pearson-airport",
  "hamilton",
  "west-harbour",
  "exhibition",
  "kipling",
  "kennedy",
  "bloor",
  "weston",
  "mount-dennis",
]);
// The authored SVG is slightly wider than the camera canvas, leaving just over
// 4% of vertical letterbox room in the fitted frame. Stay below that limit so
// the tighter default never crosses the console or impact-badge bounds.
const REGIONAL_MAP_DEFAULT_FRAME_SCALE = 1.04;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function regionalImpactColor(kind: ImpactKind) {
  switch (kind) {
    case "suspension":
      return "#ef4444";
    case "planned-closure":
      return "#3b82f6";
    case "reduced-speed-zone":
      return "#d97706";
    case "delay":
    default:
      return "#f59e0b";
  }
}

function regionalImpactDashArray(kind: ImpactKind) {
  if (kind === "planned-closure") return "120 70";
  if (kind === "reduced-speed-zone") return "35 45";
  return "none";
}

function removeDescendantIds(element: SVGElement) {
  element.removeAttribute("id");
  element.querySelectorAll("[id]").forEach((child) => child.removeAttribute("id"));
}

function regionalImpactGroup(
  documentNode: Document,
  sourcePath: SVGPathElement,
  {
    impactId,
    kind,
    label,
    layerIndex = 0,
  }: {
    impactId: string;
    kind: ImpactKind;
    label: string;
    layerIndex?: number;
  },
) {
  const group = documentNode.createElementNS(SVG_NAMESPACE, "g");
  group.classList.add("overlay-segment-group", "regional-overlay-segment-group");
  group.dataset.regionalImpactKind = kind;
  group.dataset.regionalImpactId = impactId;
  group.style.setProperty("--regional-impact-color", regionalImpactColor(kind));
  group.style.setProperty("--regional-impact-width", `${Math.max(48, 104 - layerIndex * 20)}px`);
  group.style.setProperty("--regional-impact-dasharray", regionalImpactDashArray(kind));

  const aura = sourcePath.cloneNode(false) as SVGPathElement;
  removeDescendantIds(aura);
  aura.classList.add("asset-alert-path-glow", "regional-impact-glow", "regional-impact-aura");

  const interactiveGlow = sourcePath.cloneNode(false) as SVGPathElement;
  removeDescendantIds(interactiveGlow);
  interactiveGlow.classList.add("asset-alert-path-glow", "interactive-glow", "regional-impact-glow", "regional-impact-interactive-glow");

  const boundary = sourcePath.cloneNode(false) as SVGPathElement;
  removeDescendantIds(boundary);
  boundary.classList.add("asset-alert-path-hover-boundary", "regional-impact-hover-boundary");

  const visiblePath = sourcePath.cloneNode(false) as SVGPathElement;
  removeDescendantIds(visiblePath);
  visiblePath.classList.add("asset-alert-path", "regional-impact-path", `regional-impact-path--${kind}`);
  if (kind === "planned-closure") visiblePath.classList.add("planned-preview");

  const hitTarget = sourcePath.cloneNode(false) as SVGPathElement;
  removeDescendantIds(hitTarget);
  hitTarget.classList.add("map-segment-hit-target", "regional-impact-hit-target");
  hitTarget.setAttribute("role", "button");
  hitTarget.setAttribute("tabindex", "0");
  hitTarget.setAttribute("aria-label", label);
  const title = documentNode.createElementNS(SVG_NAMESPACE, "title");
  title.textContent = label;
  hitTarget.prepend(title);

  group.append(aura, interactiveGlow, boundary, visiblePath, hitTarget);
  return group;
}

function svgAnchorPoint(documentNode: Document, anchorId: string | undefined) {
  if (!anchorId) return null;
  const anchor = documentNode.getElementById(anchorId);
  if (!anchor) return null;
  if (anchor.tagName.toLowerCase() === "circle") {
    return {
      x: Number(anchor.getAttribute("cx") ?? 0),
      y: Number(anchor.getAttribute("cy") ?? 0),
    };
  }
  if (anchor.tagName.toLowerCase() === "rect") {
    const x = Number(anchor.getAttribute("x") ?? 0);
    const y = Number(anchor.getAttribute("y") ?? 0);
    return {
      x: x + Number(anchor.getAttribute("width") ?? 0) / 2,
      y: y + Number(anchor.getAttribute("height") ?? 0) / 2,
    };
  }
  return null;
}

function fallbackSegmentPath(
  documentNode: Document,
  stationAAnchorId: string | undefined,
  stationBAnchorId: string | undefined,
) {
  const start = svgAnchorPoint(documentNode, stationAAnchorId);
  const end = svgAnchorPoint(documentNode, stationBAnchorId);
  return start && end ? `M ${start.x},${start.y} L ${end.x},${end.y}` : null;
}

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
  animateInitialEntrance = true,
  desktopMenuPinned = false,
  preserveCameraOnSelectionClear = false,
  onReady,
}: {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  selectedStationId: string | null;
  onSelectStationId: (id: string | null) => void;
  reducedMotion: boolean;
  recenterSignal?: number;
  isDark?: boolean;
  animateInitialEntrance?: boolean;
  desktopMenuPinned?: boolean;
  preserveCameraOnSelectionClear?: boolean;
  onReady?: () => void;
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
  const [selectionPulsePhase, setSelectionPulsePhase] = useState<"fast" | "latent">("fast");
  const [desktopMapTopInset, setDesktopMapTopInset] = useState(0);
  const [desktopMapBottomInset, setDesktopMapBottomInset] = useState(0);
  const animTimeoutRef = useRef<number | null>(null);
  const programmaticAnimationFrameRef = useRef<number | null>(null);
  const dragAnimationFrameRef = useRef<number | null>(null);
  const pendingDragPointRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);
  const pointerActivationRef = useRef<
    { type: "station"; id: string }
    | { type: "impact"; selection: NonNullable<ImpactSelection> }
    | null
  >(null);
  const suppressNextClickRef = useRef(false);
  const wheelCommitTimeoutRef = useRef<number | null>(null);
  const cameraRef = useRef(camera);
  const readyNotifiedRef = useRef(false);
  const lastFocusedTargetKeyRef = useRef<string | null>(null);
  const lastFocusLayoutKeyRef = useRef("");

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
    if (animateInitialEntrance && !reducedMotion) {
      const viewport = viewportRef.current;
      const mapSurface = viewport?.closest<HTMLElement>(".network-map-transition-surface");
      const width = viewport?.clientWidth || mapSurface?.clientWidth || 0;
      const height = viewport?.clientHeight || mapSurface?.clientHeight || 0;
      const entryCamera = snapCameraToDevicePixels(
        computeFittedCameraFlyInStart(fitted.camera, width, height),
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
  }, [animateCameraTo, animateInitialEntrance, fittedCamera, reducedMotion, setMapTransition, svgMarkup, writeMapTransform]);

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
          removeDescendantIds(hitTarget);
          hitTarget.dataset.regionalStationId = stationId;
          hitTarget.setAttribute("role", "button");
          hitTarget.setAttribute("tabindex", "0");
          hitTarget.setAttribute("aria-label", `${stationId.replaceAll("-", " ")} station details`);
          hitTarget.classList.add("regional-station-hit-target");
          const title = documentNode.createElementNS(SVG_NAMESPACE, "title");
          title.textContent = `${stationId.replaceAll("-", " ")} station`;
          hitTarget.prepend(title);
          const hitShapes = hitTarget.matches("circle, rect, ellipse") ? [hitTarget] : [...hitTarget.querySelectorAll<SVGElement>("circle, rect, ellipse")];
          for (const shape of hitShapes) {
            shape.setAttribute("style", "fill:transparent;stroke:transparent;stroke-width:120;pointer-events:all");
          }

          const isLarge = REGIONAL_LARGE_TERMINAL_IDS.has(stationId);
          const scaleFactor = isLarge ? 1.35 : 1.45;

          const hoverIndicator = element.cloneNode(true) as SVGElement;
          removeDescendantIds(hoverIndicator);
          hoverIndicator.classList.add("station-hover-indicator", "regional-station-hover-indicator");
          if (isLarge) hoverIndicator.classList.add("large-terminal");
          hoverIndicator.setAttribute("aria-hidden", "true");
          const hoverShapes = hoverIndicator.matches("circle, rect, ellipse") ? [hoverIndicator] : [...hoverIndicator.querySelectorAll<SVGElement>("circle, rect, ellipse")];
          for (const shape of hoverShapes) {
            if (shape.getAttribute("inkscape:label") === "join-rectangle") {
              shape.remove();
              continue;
            }
            const tagName = shape.tagName.toLowerCase();
            if (tagName === "circle") {
              const r = Number(shape.getAttribute("r") ?? 0);
              shape.setAttribute("r", String(r * scaleFactor));
            } else if (tagName === "ellipse") {
              const rx = Number(shape.getAttribute("rx") ?? 0);
              const ry = Number(shape.getAttribute("ry") ?? 0);
              shape.setAttribute("rx", String(rx * scaleFactor));
              shape.setAttribute("ry", String(ry * scaleFactor));
            } else if (tagName === "rect") {
              const w = Number(shape.getAttribute("width") ?? 0);
              const h = Number(shape.getAttribute("height") ?? 0);
              const x = Number(shape.getAttribute("x") ?? 0);
              const y = Number(shape.getAttribute("y") ?? 0);
              const rx = Number(shape.getAttribute("rx") ?? 0);
              const ry = Number(shape.getAttribute("ry") ?? 0);
              const padding = stationId === "union" ? 75 : (w * (scaleFactor - 1)) / 2;
              shape.setAttribute("width", String(w + padding * 2));
              shape.setAttribute("height", String(h + padding * 2));
              shape.setAttribute("x", String(x - padding));
              shape.setAttribute("y", String(y - padding));
              if (rx) shape.setAttribute("rx", String(rx + padding));
              if (ry) shape.setAttribute("ry", String(ry + padding));
            }
          }

          const selectedIndicator = element.cloneNode(true) as SVGElement;
          removeDescendantIds(selectedIndicator);
          selectedIndicator.dataset.regionalStationSelectionId = stationId;
          selectedIndicator.classList.add("station-selected-indicator", "regional-station-selected-indicator");
          selectedIndicator.setAttribute("aria-hidden", "true");
          const selectedShapes = selectedIndicator.matches("circle, rect, ellipse") ? [selectedIndicator] : [...selectedIndicator.querySelectorAll<SVGElement>("circle, rect, ellipse")];
          for (const shape of selectedShapes) {
            if (shape.getAttribute("inkscape:label") === "join-rectangle") {
              shape.remove();
              continue;
            }
            const tagName = shape.tagName.toLowerCase();
            const selectedScaleFactor = isLarge ? 1 : 1.2;
            if (tagName === "circle") {
              const radius = Number(shape.getAttribute("r") ?? 0);
              shape.setAttribute("r", String(radius * selectedScaleFactor));
            } else if (tagName === "ellipse") {
              const radiusX = Number(shape.getAttribute("rx") ?? 0);
              const radiusY = Number(shape.getAttribute("ry") ?? 0);
              shape.setAttribute("rx", String(radiusX * selectedScaleFactor));
              shape.setAttribute("ry", String(radiusY * selectedScaleFactor));
            } else if (tagName === "rect") {
              const width = Number(shape.getAttribute("width") ?? 0);
              const height = Number(shape.getAttribute("height") ?? 0);
              const x = Number(shape.getAttribute("x") ?? 0);
              const y = Number(shape.getAttribute("y") ?? 0);
              const paddingX = (width * (selectedScaleFactor - 1)) / 2;
              const paddingY = (height * (selectedScaleFactor - 1)) / 2;
              shape.setAttribute("width", String(width + paddingX * 2));
              shape.setAttribute("height", String(height + paddingY * 2));
              shape.setAttribute("x", String(x - paddingX));
              shape.setAttribute("y", String(y - paddingY));
            }
          }

          element.before(hitTarget, hoverIndicator);
          element.after(selectedIndicator);
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
            const kind = alert.severity === "planned" ? "planned-closure" : alert.severity;
            routePath.after(regionalImpactGroup(documentNode, routePath, {
              impactId: alert.id,
              kind,
              label: `${alert.lineNumber} ${alert.title}`,
            }));
          }
        }
        const stationsLayer = documentNode.getElementById("regional-stations-layer");
        for (const segment of networkSegments.filter((item) => (item.impacts?.length ?? 0) > 0)) {
          const guide = documentNode.getElementById(segment.guidePathId ?? "") as SVGPathElement | null;
          const fallbackPathD = fallbackSegmentPath(
            documentNode,
            segment.stationAAnchorId,
            segment.stationBAnchorId,
          );
          if ((!guide && !fallbackPathD) || !stationsLayer) continue;
          for (const [impactIndex, impact] of (segment.impacts ?? []).entries()) {
            const overlaySource = guide
              ? guide.cloneNode(false) as SVGPathElement
              : documentNode.createElementNS(SVG_NAMESPACE, "path");
            removeDescendantIds(overlaySource);
            overlaySource.setAttribute("style", "display:inline");
            if (!guide && fallbackPathD) overlaySource.setAttribute("d", fallbackPathD);
            const overlay = regionalImpactGroup(documentNode, overlaySource, {
              impactId: impact.cardId,
              kind: impact.kind,
              label: `${segment.label} ${impact.kind} synthetic scenario`,
              layerIndex: impactIndex,
            });
            const firstStationTarget = stationsLayer.querySelector(".regional-station-hit-target");
            stationsLayer.insertBefore(overlay, firstStationTarget);
          }
        }
        for (const [impactIndex, impact] of stationNodeImpacts.entries()) {
          const stationVisual = documentNode.getElementById(`station-${impact.stationId}`) as SVGElement | null;
          if (!stationVisual) continue;
          const ring = stationVisual.cloneNode(true) as SVGElement;
          removeDescendantIds(ring);
          ring.dataset.regionalImpactKind = impact.kind;
          ring.dataset.regionalImpactId = impact.cardId;
          ring.classList.add("station-impact-ring", "regional-station-impact-ring", `regional-station-impact-ring--${impact.kind}`);
          ring.style.setProperty("--regional-impact-color", regionalImpactColor(impact.kind));
          ring.style.setProperty("--regional-station-impact-width", `${65 + impactIndex * 20}px`);
          ring.setAttribute("role", "button");
          ring.setAttribute("tabindex", "0");
          ring.setAttribute("aria-label", impact.title);
          const shapes = ring.matches("circle, rect, ellipse") ? [ring] : [...ring.querySelectorAll<SVGElement>("circle, rect, ellipse")];
          for (const shape of shapes) {
            if (shape.getAttribute("inkscape:label") === "join-rectangle") {
              shape.remove();
              continue;
            }
            shape.setAttribute(
              "style",
              "fill:transparent;pointer-events:stroke",
            );
          }
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
    if (!svgMarkup || !cameraInitializedRef.current || readyNotifiedRef.current) return;

    let secondPaintFrame: number | null = null;
    const firstPaintFrame = window.requestAnimationFrame(() => {
      secondPaintFrame = window.requestAnimationFrame(() => {
        if (readyNotifiedRef.current) return;
        readyNotifiedRef.current = true;
        onReady?.();
      });
    });

    return () => {
      window.cancelAnimationFrame(firstPaintFrame);
      if (secondPaintFrame !== null) window.cancelAnimationFrame(secondPaintFrame);
    };
  }, [camera, onReady, svgMarkup]);

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
      const indicator = root?.querySelector(
        `[data-regional-station-selection-id="${CSS.escape(selectedStationId)}"]`,
      );
      indicator?.setAttribute("data-regional-station-selected", "true");
      indicator?.setAttribute("data-regional-selection-phase", selectionPulsePhase);
    }
  }, [selectedStationId, selectionPulsePhase, svgMarkup]);

  useEffect(() => {
    const root = viewportRef.current;
    root?.querySelectorAll("[data-regional-impact-selected]").forEach((element) => element.removeAttribute("data-regional-impact-selected"));
    if (selection) {
      root?.querySelectorAll(`[data-regional-impact-kind="${selection.kind}"][data-regional-impact-id="${CSS.escape(selection.id)}"]`)
        .forEach((element) => {
          element.setAttribute("data-regional-impact-selected", "true");
          element.setAttribute("data-regional-selection-phase", selectionPulsePhase);
        });
    }
  }, [selection, selectionPulsePhase, svgMarkup]);

  useEffect(() => {
    if (!selection && !selectedStationId) return;
    let fastPhaseFrame: number | null = null;
    let latentPhaseTimer: number | null = null;
    const fastPhaseTimer = window.setTimeout(() => {
      setSelectionPulsePhase("fast");
      fastPhaseFrame = window.requestAnimationFrame(() => {
        latentPhaseTimer = window.setTimeout(() => setSelectionPulsePhase("latent"), 2400);
      });
    }, 0);
    return () => {
      window.clearTimeout(fastPhaseTimer);
      if (fastPhaseFrame !== null) window.cancelAnimationFrame(fastPhaseFrame);
      if (latentPhaseTimer !== null) window.clearTimeout(latentPhaseTimer);
    };
  }, [selectedStationId, selection]);

  const selectedMapElements = useCallback(() => {
    const root = viewportRef.current;
    if (!root) return [];
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
  }, [selectedStationId, selection]);

  const focusSelectedMapElements = useCallback(() => {
    const viewport = viewportRef.current;
    const elements = selectedMapElements();
    if (!viewport || elements.length === 0) return false;

    const visibleRects = elements
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 || rect.height > 0);
    if (visibleRects.length === 0) return false;

    const viewportRect = viewport.getBoundingClientRect();
    const current = cameraRef.current;
    const left = Math.min(...visibleRects.map((rect) => rect.left));
    const right = Math.max(...visibleRects.map((rect) => rect.right));
    const top = Math.min(...visibleRects.map((rect) => rect.top));
    const bottom = Math.max(...visibleRects.map((rect) => rect.bottom));
    const renderedCenterX = (left + right) / 2 - viewportRect.left;
    const renderedCenterY = (top + bottom) / 2 - viewportRect.top;
    const mapX = (renderedCenterX - current.x) / current.scale;
    const mapY = (renderedCenterY - current.y) / current.scale;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const targetScale = clampPanZoomScale(fitScale * (isMobile ? 3.8 : 1.8), fitScale);

    let focusX = viewport.clientWidth / 2;
    const focusY = viewport.clientHeight / 2;
    if (!isMobile && desktopMenuPinned) {
      const shell = viewport.closest<HTMLElement>(".linewatch-shell");
      const overlayRightEdges = [
        shell?.querySelector<HTMLElement>("#linewatch-main-menu"),
        shell?.querySelector<HTMLElement>(".floating-panel-shell"),
      ].flatMap((element) => {
        if (!element || element.getAttribute("aria-hidden") === "true") return [];
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 ? [rect.right] : [];
      });
      if (overlayRightEdges.length > 0) {
        const minimumVisibleWidth = Math.min(320, viewportRect.width * 0.4);
        const insetLeft = Math.min(
          Math.max(Math.max(...overlayRightEdges) - viewportRect.left + 16, 0),
          Math.max(viewportRect.width - minimumVisibleWidth, 0),
        );
        focusX = insetLeft + (viewport.clientWidth - insetLeft) / 2;
      }
    }

    animateCameraTo(snapCameraToDevicePixels({
      x: focusX - mapX * targetScale,
      y: focusY - mapY * targetScale,
      scale: targetScale,
    }));
    return true;
  }, [animateCameraTo, desktopMenuPinned, fitScale, selectedMapElements]);

  const focusTargetKey = selection
    ? `${selection.kind}:${selection.id}`
    : selectedStationId
      ? `station:${selectedStationId}`
      : null;

  useEffect(() => {
    if (!cameraInitializedRef.current || !svgMarkup) return;
    const layoutKey = `${desktopMenuPinned ? "pinned" : "free"}:${desktopMapTopInset}:${desktopMapBottomInset}`;

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

    const frame = window.requestAnimationFrame(() => {
      if (!focusSelectedMapElements()) return;
      lastFocusedTargetKeyRef.current = focusTargetKey;
      lastFocusLayoutKeyRef.current = layoutKey;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    desktopMapBottomInset,
    desktopMapTopInset,
    desktopMenuPinned,
    fitNetwork,
    focusSelectedMapElements,
    focusTargetKey,
    preserveCameraOnSelectionClear,
    svgMarkup,
  ]);

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
    const target = event.target instanceof Element ? event.target : null;
    const impact = target?.closest<SVGElement>("[data-regional-impact-kind]");
    const station = target?.closest<SVGElement>("[data-regional-station-id]");
    pointerActivationRef.current = impact?.dataset.regionalImpactKind && impact.dataset.regionalImpactId
      ? {
          type: "impact",
          selection: {
            kind: impact.dataset.regionalImpactKind as NonNullable<ImpactSelection>["kind"],
            id: impact.dataset.regionalImpactId,
          },
        }
      : station?.dataset.regionalStationId
        ? { type: "station", id: station.dataset.regionalStationId }
        : null;
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
    const activation = pointerActivationRef.current;
    pointerActivationRef.current = null;
    if (event.type === "pointerup" && !dragMovedRef.current && activation) {
      suppressNextClickRef.current = true;
      if (activation.type === "station") {
        onSelectStationId(selectedStationId === activation.id ? null : activation.id);
      } else {
        onSelectImpact(activation.selection);
      }
    }
    setCamera({ ...cameraRef.current });
    setDragging(false);
  }, [onSelectImpact, onSelectStationId, selectedStationId, writeMapTransform]);

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

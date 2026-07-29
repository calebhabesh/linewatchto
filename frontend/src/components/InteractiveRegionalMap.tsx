"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { Locate, X, ZoomIn, ZoomOut } from "lucide-react";
import type { ImpactKind, ImpactSelection, MapImpact, NetworkSegment, TravelDirection } from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/account-data";
import { estimatedTrainMarkerRenderKey, type EstimatedTrainMarker } from "../app/train-markers";
import { useDashboardData } from "../app/DataContext";
import {
  clampPanZoomScale,
  clientPointToLogicalViewportPoint,
  clientRectToLogicalViewportBounds,
  computeBoundedMapFrame,
  computeFittedCameraFlyInStart,
  computeInsetViewportFocus,
  currentDevicePixelRatio,
  distanceBetweenPoints,
  mapPointFromViewportPoint,
  midpointBetweenPoints,
  PAN_ZOOM_MAX_RELATIVE_SCALE,
  PAN_ZOOM_MIN_RELATIVE_SCALE,
  snapTransformToDevicePixels,
  transformForMapPointAtViewportPoint,
  type MapViewportOrientation,
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
const REGIONAL_IMPACT_OVERLAY_WIDTH = 196;
const REGIONAL_DELAY_GLYPH_SPACING = 96;
// TTC's lane advances 160 SVG units over 12 seconds. Regional authored map
// units are about 175 / 102 larger for the equivalent corridor stroke.
const REGIONAL_DELAY_TRAVEL_UNITS_PER_SECOND = (160 / 12) * (175 / 102);

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
      return "#0ea5e9";
  }
}

function regionalImpactDashArray(kind: ImpactKind) {
  if (kind === "planned-closure") return "120 70";
  if (kind === "reduced-speed-zone") return "35 45";
  return "none";
}

function regionalImpactVisualState(kind: ImpactKind) {
  switch (kind) {
    case "suspension":
      return "suspension";
    case "planned-closure":
      return "planned-preview";
    case "reduced-speed-zone":
      return "reduced-speed-zone";
    case "delay":
    default:
      return "delay-static";
  }
}

function removeDescendantIds(element: SVGElement) {
  element.removeAttribute("id");
  element.querySelectorAll("[id]").forEach((child) => child.removeAttribute("id"));
}

function appendRegionalDelayGlyph(
  documentNode: Document,
  parent: SVGGElement,
  kind: "hourglass" | "arrow",
) {
  const glyph = documentNode.createElementNS(SVG_NAMESPACE, "g");
  glyph.classList.add("regional-delay-glyph", `regional-delay-glyph--${kind}`);

  if (kind === "hourglass") {
    // Deliberately replicate the mature TTC delay glyph so both map modes use
    // the same visual vocabulary even though the regional SVG is injected as
    // serialized markup instead of rendered as React-owned paths.
    const artwork = documentNode.createElementNS(SVG_NAMESPACE, "g");
    artwork.setAttribute("transform", "scale(0.16) translate(-550 -512)");
    artwork.classList.add("delay-hourglass");
    const paths = [
      ["M576 512c0 190.72 448 345.6-25.6 345.6s-25.6-154.88-25.6-345.6-448-345.6 25.6-345.6 25.6 154.88 25.6 345.6z", "#F7E6A3"],
      ["M550.4 870.4c-147.2 0-212.48-14.08-226.56-48.64-14.08-33.28 23.04-71.68 71.68-121.6 51.2-52.48 116.48-120.32 116.48-188.16 0-67.84-65.28-135.68-117.76-189.44-47.36-48.64-85.76-87.04-71.68-121.6C337.92 167.68 403.2 153.6 550.4 153.6s212.48 14.08 226.56 48.64c14.08 33.28-23.04 71.68-71.68 121.6-51.2 52.48-116.48 120.32-116.48 188.16 0 67.84 65.28 135.68 117.76 189.44 47.36 48.64 85.76 87.04 71.68 121.6C762.88 856.32 697.6 870.4 550.4 870.4z m0-691.2c-157.44 0-197.12 17.92-203.52 33.28-7.68 17.92 29.44 56.32 65.28 93.44 55.04 57.6 125.44 128 125.44 207.36 0 79.36-69.12 149.76-125.44 207.36-35.84 37.12-72.96 75.52-65.28 93.44 6.4 12.8 46.08 30.72 203.52 30.72s197.12-17.92 203.52-33.28c7.68-17.92-29.44-56.32-65.28-93.44C632.32 661.76 563.2 591.36 563.2 512c0-79.36 69.12-149.76 125.44-207.36 35.84-37.12 72.96-75.52 65.28-93.44-6.4-14.08-46.08-32-203.52-32z", "#0284c7"],
      ["M819.2 153.6c0 14.08-11.52 25.6-25.6 25.6H294.4c-14.08 0-25.6-11.52-25.6-25.6v-12.8c0-14.08 11.52-25.6 25.6-25.6h499.2c14.08 0 25.6 11.52 25.6 25.6v12.8z", "#7dd3fc"],
      ["M793.6 192H294.4c-21.76 0-38.4-16.64-38.4-38.4v-12.8c0-21.76 16.64-38.4 38.4-38.4h499.2c21.76 0 38.4 16.64 38.4 38.4v12.8c0 21.76-16.64 38.4-38.4 38.4z m-499.2-64c-7.68 0-12.8 5.12-12.8 12.8v12.8c0 7.68 5.12 12.8 12.8 12.8h499.2c7.68 0 12.8-5.12 12.8-12.8v-12.8c0-7.68-5.12-12.8-12.8-12.8H294.4z", "#0369a1"],
      ["M819.2 883.2c0 14.08-11.52 25.6-25.6 25.6H294.4c-14.08 0-25.6-11.52-25.6-25.6v-12.8c0-14.08 11.52-25.6 25.6-25.6h499.2c14.08 0 25.6 11.52 25.6 25.6v12.8z", "#7dd3fc"],
      ["M793.6 921.6H294.4c-21.76 0-38.4-16.64-38.4-38.4v-12.8c0-21.76 16.64-38.4 38.4-38.4h499.2c21.76 0 38.4 16.64 38.4 38.4v12.8c0 21.76-16.64 38.4-38.4 38.4z m-499.2-64c-7.68 0-12.8 5.12-12.8 12.8v12.8c0 7.68 5.12 12.8 12.8 12.8h499.2c7.68 0 12.8-5.12 12.8-12.8v-12.8c0-7.68-5.12-12.8-12.8-12.8H294.4z", "#0369a1"],
      ["M307.2 179.2h25.6v665.6h-25.6z", "#0369a1"],
      ["M768 179.2h25.6v665.6h-25.6z", "#0369a1"],
    ] as const;
    for (const [pathD, fill] of paths) {
      const path = documentNode.createElementNS(SVG_NAMESPACE, "path");
      path.setAttribute("d", pathD);
      path.setAttribute("fill", fill);
      artwork.append(path);
    }
    glyph.append(artwork);
  } else {
    const arrow = documentNode.createElementNS(SVG_NAMESPACE, "path");
    arrow.setAttribute("d", "M -12 -10 L 8 0 L -12 10");
    arrow.setAttribute("transform", "scale(1.8)");
    arrow.classList.add("regional-delay-direction-arrow");
    glyph.append(arrow);
  }

  parent.append(glyph);
  return glyph;
}

function regionalDelayGlyphLane(
  documentNode: Document,
  sourcePath: SVGPathElement,
  travelDirection: TravelDirection,
  reducedMotion: boolean,
) {
  const lane = documentNode.createElementNS(SVG_NAMESPACE, "g");
  lane.classList.add("regional-delay-glyph-lane");
  lane.dataset.regionalDelayDirection = travelDirection;
  lane.setAttribute("aria-hidden", "true");

  let length = 0;
  try {
    length = sourcePath.getTotalLength();
  } catch {
    return lane;
  }
  if (length <= 0) return lane;

  // Directional TTC lanes alternate hourglasses and arrows. A directionless
  // lane has no arrow glyphs, so use a middle interval that preserves the TTC
  // visual density without making adjacent hourglasses touch.
  const glyphSpacing = travelDirection === "bidirectional"
    ? REGIONAL_DELAY_GLYPH_SPACING * 1.3
    : REGIONAL_DELAY_GLYPH_SPACING;
  const count = Math.max(1, Math.floor(length / glyphSpacing));
  const durationSeconds = Math.max(10, length / REGIONAL_DELAY_TRAVEL_UNITS_PER_SECOND);
  const pathD = sourcePath.getAttribute("d") ?? "";

  for (let index = 0; index < count; index += 1) {
    const glyphKind = travelDirection === "bidirectional" || index % 2 === 0
      ? "hourglass"
      : "arrow";
    const glyph = appendRegionalDelayGlyph(documentNode, lane, glyphKind);
    const progress = (index + 0.5) / count;

    // TTC displays a directionless/bidirectional delay as a static hourglass
    // lane. Only a trustworthy one-way direction produces moving arrows.
    if (reducedMotion || travelDirection === "bidirectional" || !pathD) {
      const distance = travelDirection === "reverse"
        ? length * (1 - progress)
        : length * progress;
      const point = sourcePath.getPointAtLength(distance);
      const before = sourcePath.getPointAtLength(Math.max(0, distance - 2));
      const after = sourcePath.getPointAtLength(Math.min(length, distance + 2));
      const angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI
        + (travelDirection === "reverse" ? 180 : 0);
      glyph.setAttribute("transform", `translate(${point.x} ${point.y}) rotate(${angle})`);
      continue;
    }

    const motion = documentNode.createElementNS(SVG_NAMESPACE, "animateMotion");
    motion.setAttribute("path", pathD);
    motion.setAttribute("dur", `${durationSeconds}s`);
    motion.setAttribute("begin", `${-(durationSeconds * progress)}s`);
    motion.setAttribute("repeatCount", "indefinite");
    motion.setAttribute("calcMode", "linear");
    motion.setAttribute("keyTimes", "0;1");
    motion.setAttribute("keyPoints", travelDirection === "reverse" ? "1;0" : "0;1");
    motion.setAttribute("rotate", travelDirection === "reverse" ? "auto-reverse" : "auto");
    glyph.append(motion);
  }

  return lane;
}

function regionalImpactGroup(
  documentNode: Document,
  sourcePath: SVGPathElement,
  {
    impactId,
    kind,
    label,
    layerIndex = 0,
    segmentCount = 1,
    travelDirection = "bidirectional",
    reducedMotion = false,
  }: {
    impactId: string;
    kind: ImpactKind;
    label: string;
    layerIndex?: number;
    segmentCount?: number;
    travelDirection?: TravelDirection;
    reducedMotion?: boolean;
  },
) {
  const visualState = regionalImpactVisualState(kind);
  const group = documentNode.createElementNS(SVG_NAMESPACE, "g");
  group.classList.add("overlay-segment-group", "regional-overlay-segment-group");
  if (segmentCount > 1) group.classList.add("connected-corridor");
  group.dataset.regionalImpactKind = kind;
  group.dataset.regionalImpactId = impactId;
  group.dataset.regionalImpactSegmentCount = String(segmentCount);
  group.style.setProperty("--regional-impact-color", regionalImpactColor(kind));
  group.style.setProperty(
    "--regional-impact-width",
    `${Math.max(88, REGIONAL_IMPACT_OVERLAY_WIDTH - layerIndex * 28)}px`,
  );
  group.style.setProperty("--regional-impact-dasharray", regionalImpactDashArray(kind));

  const aura = sourcePath.cloneNode(false) as SVGPathElement;
  removeDescendantIds(aura);
  aura.classList.add("asset-alert-path-glow", visualState, "regional-impact-glow", "regional-impact-aura");

  const interactiveGlow = sourcePath.cloneNode(false) as SVGPathElement;
  removeDescendantIds(interactiveGlow);
  interactiveGlow.classList.add("asset-alert-path-glow", visualState, "regional-impact-glow", "regional-impact-interactive-glow", "map-selection-attention");

  const boundary = sourcePath.cloneNode(false) as SVGPathElement;
  removeDescendantIds(boundary);
  boundary.classList.add("asset-alert-path-hover-boundary", visualState, "regional-impact-hover-boundary");

  const visiblePath = sourcePath.cloneNode(false) as SVGPathElement;
  removeDescendantIds(visiblePath);
  visiblePath.classList.add("asset-alert-path", "regional-impact-path", `regional-impact-path--${kind}`);
  if (kind === "planned-closure") visiblePath.classList.add("planned-preview");
  if (kind === "delay") visiblePath.classList.add("delay-static-base");

  const hitTarget = sourcePath.cloneNode(false) as SVGPathElement;
  removeDescendantIds(hitTarget);
  hitTarget.classList.add("map-segment-hit-target", "regional-impact-hit-target");
  hitTarget.setAttribute("role", "button");
  hitTarget.setAttribute("tabindex", "0");
  hitTarget.setAttribute("aria-label", label);
  const title = documentNode.createElementNS(SVG_NAMESPACE, "title");
  title.textContent = label;
  hitTarget.prepend(title);

  group.append(aura, interactiveGlow, boundary, visiblePath);
  if (kind === "delay") {
    group.append(regionalDelayGlyphLane(documentNode, sourcePath, travelDirection, reducedMotion));
  }
  group.append(hitTarget);
  return group;
}

type SvgPoint = { x: number; y: number };

function applySvgTransform(point: SvgPoint, transform: string | null): SvgPoint {
  if (!transform) return point;
  let next = point;
  for (const match of transform.matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)) {
    const operation = match[1];
    const values = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (operation === "translate") {
      next = { x: next.x + (values[0] ?? 0), y: next.y + (values[1] ?? 0) };
    } else if (operation === "scale") {
      next = { x: next.x * (values[0] ?? 1), y: next.y * (values[1] ?? values[0] ?? 1) };
    } else if (operation === "rotate") {
      const radians = ((values[0] ?? 0) * Math.PI) / 180;
      const centerX = values[1] ?? 0;
      const centerY = values[2] ?? 0;
      const offsetX = next.x - centerX;
      const offsetY = next.y - centerY;
      next = {
        x: centerX + Math.cos(radians) * offsetX - Math.sin(radians) * offsetY,
        y: centerY + Math.sin(radians) * offsetX + Math.cos(radians) * offsetY,
      };
    } else if (operation === "matrix" && values.length >= 6) {
      const [a, b, c, d, e, f] = values;
      next = { x: a * next.x + c * next.y + e, y: b * next.x + d * next.y + f };
    }
  }
  return next;
}

function pointInRegionalStationsLayer(element: SVGElement, point: SvgPoint): SvgPoint {
  let next = point;
  let current: SVGElement | null = element;
  while (current && current.id !== "regional-stations-layer") {
    next = applySvgTransform(next, current.getAttribute("transform"));
    current = current.parentElement as SVGElement | null;
  }
  return next;
}

function svgAnchorPoint(documentNode: Document, anchorId: string | undefined) {
  if (!anchorId) return null;
  const anchor = documentNode.getElementById(anchorId) as SVGElement | null;
  if (!anchor) return null;
  if (anchor.matches("circle, ellipse")) {
    return pointInRegionalStationsLayer(anchor, {
      x: Number(anchor.getAttribute("cx") ?? 0),
      y: Number(anchor.getAttribute("cy") ?? 0),
    });
  }
  if (anchor.tagName.toLowerCase() === "rect") {
    const x = Number(anchor.getAttribute("x") ?? 0);
    const y = Number(anchor.getAttribute("y") ?? 0);
    return pointInRegionalStationsLayer(anchor, {
      x: x + Number(anchor.getAttribute("width") ?? 0) / 2,
      y: y + Number(anchor.getAttribute("height") ?? 0) / 2,
    });
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

type RegionalRouteMetric = {
  path: SVGPathElement;
  length: number;
  pointAt: (distance: number) => SvgPoint;
};

function regionalRoutePathIds(lineId: string) {
  const routeCode = lineId.replace("regional-", "");
  return routeCode === "lw"
    ? ["regional-route-lw-main-path", "regional-route-lw-branch-path"]
    : [`regional-route-${routeCode}-path`];
}

function pointInSvgRootCoordinates(element: SVGElement, point: SvgPoint) {
  let next = point;
  let current: SVGElement | null = element;
  while (current && current.tagName.toLowerCase() !== "svg") {
    next = applySvgTransform(next, current.getAttribute("transform"));
    current = current.parentElement as SVGElement | null;
  }
  return next;
}

function pointFromSvgRootCoordinates(element: SVGElement, point: SvgPoint): SvgPoint | null {
  const origin = pointInSvgRootCoordinates(element, { x: 0, y: 0 });
  const xBasis = pointInSvgRootCoordinates(element, { x: 1, y: 0 });
  const yBasis = pointInSvgRootCoordinates(element, { x: 0, y: 1 });
  const a = xBasis.x - origin.x;
  const b = xBasis.y - origin.y;
  const c = yBasis.x - origin.x;
  const d = yBasis.y - origin.y;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-9) return null;
  const offsetX = point.x - origin.x;
  const offsetY = point.y - origin.y;
  return {
    x: (d * offsetX - c * offsetY) / determinant,
    y: (-b * offsetX + a * offsetY) / determinant,
  };
}

function pointInRegionalStationsCoordinates(
  point: SvgPoint,
  source: SVGElement,
  stationsLayer: SVGElement,
): SvgPoint | null {
  return pointFromSvgRootCoordinates(
    stationsLayer,
    pointInSvgRootCoordinates(source, point),
  );
}

function regionalRouteMetric(
  path: SVGPathElement,
  stationsLayer: SVGGraphicsElement,
): RegionalRouteMetric | null {
  try {
    const length = path.getTotalLength();
    if (length <= 0) return null;
    return {
      path,
      length,
      pointAt: (distance) => {
        const localPoint = path.getPointAtLength(Math.max(0, Math.min(length, distance)));
        return pointInRegionalStationsCoordinates(
          { x: localPoint.x, y: localPoint.y },
          path,
          stationsLayer,
        )
          ?? { x: localPoint.x, y: localPoint.y };
      },
    };
  } catch {
    return null;
  }
}

function squaredPointDistance(a: SvgPoint, b: SvgPoint) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function closestRouteDistance(metric: RegionalRouteMetric, target: SvgPoint) {
  const sampleCount = Math.max(2, Math.ceil(metric.length / 24));
  let closestDistance = 0;
  let closestDistanceSquared = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= sampleCount; index += 1) {
    const distance = metric.length * index / sampleCount;
    const distanceSquared = squaredPointDistance(metric.pointAt(distance), target);
    if (distanceSquared < closestDistanceSquared) {
      closestDistance = distance;
      closestDistanceSquared = distanceSquared;
    }
  }

  let step = metric.length / sampleCount;
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const before = Math.max(0, closestDistance - step);
    const after = Math.min(metric.length, closestDistance + step);
    for (const candidate of [before, after]) {
      const distanceSquared = squaredPointDistance(metric.pointAt(candidate), target);
      if (distanceSquared < closestDistanceSquared) {
        closestDistance = candidate;
        closestDistanceSquared = distanceSquared;
      }
    }
    step /= 2;
  }
  return { distance: closestDistance, distanceSquared: closestDistanceSquared };
}

function routePointsBetween(metric: RegionalRouteMetric, start: number, end: number) {
  const sampleCount = Math.max(1, Math.ceil(Math.abs(end - start) / 24));
  return Array.from({ length: sampleCount + 1 }, (_unused, index) =>
    metric.pointAt(start + (end - start) * index / sampleCount));
}

function pathDataForPoints(points: SvgPoint[]) {
  return points.length >= 2
    ? points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x},${point.y}`).join(" ")
    : null;
}

function corridorSegmentPath(
  documentNode: Document,
  segment: NetworkSegment,
) {
  const stationsLayer = documentNode.getElementById("regional-stations-layer") as SVGGraphicsElement | null;
  const start = svgAnchorPoint(documentNode, segment.stationAAnchorId);
  const end = svgAnchorPoint(documentNode, segment.stationBAnchorId);
  if (!stationsLayer || !start || !end) return null;

  const metrics = regionalRoutePathIds(segment.lineId)
    .map((pathId) => documentNode.getElementById(pathId) as SVGPathElement | null)
    .filter((path): path is SVGPathElement => Boolean(path))
    .map((path) => regionalRouteMetric(path, stationsLayer))
    .filter((metric): metric is RegionalRouteMetric => Boolean(metric));
  if (metrics.length === 0) return null;

  const startProjections = metrics.map((metric) => closestRouteDistance(metric, start));
  const endProjections = metrics.map((metric) => closestRouteDistance(metric, end));
  const startMetricIndex = startProjections.reduce(
    (best, projection, index) =>
      projection.distanceSquared < startProjections[best].distanceSquared ? index : best,
    0,
  );
  const endMetricIndex = endProjections.reduce(
    (best, projection, index) =>
      projection.distanceSquared < endProjections[best].distanceSquared ? index : best,
    0,
  );

  if (startMetricIndex === endMetricIndex) {
    return pathDataForPoints(routePointsBetween(
      metrics[startMetricIndex],
      startProjections[startMetricIndex].distance,
      endProjections[endMetricIndex].distance,
    ));
  }

  // Split corridor artwork (currently Lakeshore West) is treated as one route
  // graph. Join paths only at the authored LW branch junction so all three
  // pairwise-adjacent Aldershot/West Harbour/Hamilton links follow the shared
  // T-shaped rail geometry instead of drawing station-centre chords.
  const startMetric = metrics[startMetricIndex];
  const endMetric = metrics[endMetricIndex];
  const connections = [0, endMetric.length].map((endPathDistance) => {
    const endPathPoint = endMetric.pointAt(endPathDistance);
    const startPathProjection = closestRouteDistance(startMetric, endPathPoint);
    return {
      startPathDistance: startPathProjection.distance,
      endPathDistance,
      gapSquared: squaredPointDistance(
        startMetric.pointAt(startPathProjection.distance),
        endPathPoint,
      ),
    };
  });
  const connection = connections.reduce((best, candidate) =>
    candidate.gapSquared < best.gapSquared ? candidate : best);
  if (connection.gapSquared > 4) return null;

  const firstPoints = routePointsBetween(
    startMetric,
    startProjections[startMetricIndex].distance,
    connection.startPathDistance,
  );
  const secondPoints = routePointsBetween(
    endMetric,
    connection.endPathDistance,
    endProjections[endMetricIndex].distance,
  );
  return pathDataForPoints([...firstPoints, ...secondPoints.slice(1)]);
}

function authoredRegionalCorridorPathData(documentNode: Document, lineId: string) {
  const stationsLayer = documentNode.getElementById("regional-stations-layer") as SVGGraphicsElement | null;
  if (!stationsLayer) return null;
  const pathData = regionalRoutePathIds(lineId)
    .map((pathId) => documentNode.getElementById(pathId) as SVGPathElement | null)
    .filter((path): path is SVGPathElement => Boolean(path))
    .map((path) => regionalRouteMetric(path, stationsLayer))
    .filter((metric): metric is RegionalRouteMetric => Boolean(metric))
    .map((metric) => pathDataForPoints(routePointsBetween(metric, 0, metric.length)))
    .filter((pathD): pathD is string => Boolean(pathD));
  return pathData.length > 0 ? pathData.join(" ") : null;
}

function resolvedRegionalSegmentPath(documentNode: Document, segment: NetworkSegment) {
  const guide = documentNode.getElementById(segment.guidePathId ?? "") as SVGPathElement | null;
  return guide?.getAttribute("d")
    ?? corridorSegmentPath(documentNode, segment)
    ?? fallbackSegmentPath(documentNode, segment.stationAAnchorId, segment.stationBAnchorId);
}

type RegionalOverlayPiece = {
  segment: NetworkSegment;
  impact: MapImpact;
  impactIndex: number;
  pathD: string;
};

type RegionalOverlayRun = {
  impact: MapImpact;
  impactIndex: number;
  lineId: string;
  segments: NetworkSegment[];
  pathD: string;
};

function regionalSegmentsAreAdjacent(a: NetworkSegment, b: NetworkSegment) {
  return a.stationAId === b.stationAId
    || a.stationAId === b.stationBId
    || a.stationBId === b.stationAId
    || a.stationBId === b.stationBId;
}

function regionalOverlayRuns(pieces: RegionalOverlayPiece[]): RegionalOverlayRun[] {
  const grouped = new Map<string, RegionalOverlayPiece[]>();
  for (const piece of pieces) {
    const key = [
      piece.segment.lineId,
      piece.impact.kind,
      piece.impact.cardId,
      piece.impact.travelDirection,
    ].join(":");
    grouped.set(key, [...(grouped.get(key) ?? []), piece]);
  }

  const runs: RegionalOverlayRun[] = [];
  for (const groupPieces of grouped.values()) {
    const remaining = new Set(groupPieces);
    while (remaining.size > 0) {
      const firstPiece = remaining.values().next().value as RegionalOverlayPiece;
      const componentPieces: RegionalOverlayPiece[] = [];
      const pending = [firstPiece];
      remaining.delete(firstPiece);
      while (pending.length > 0) {
        const current = pending.shift()!;
        componentPieces.push(current);
        for (const candidate of remaining) {
          if (!regionalSegmentsAreAdjacent(current.segment, candidate.segment)) continue;
          remaining.delete(candidate);
          pending.push(candidate);
        }
      }
      runs.push({
        impact: firstPiece.impact,
        impactIndex: Math.min(...componentPieces.map((piece) => piece.impactIndex)),
        lineId: firstPiece.segment.lineId,
        segments: componentPieces.map((piece) => piece.segment),
        // Keep one subpath per graph edge. This preserves a single interactive
        // overlay group even when the connected component branches or cycles.
        pathD: componentPieces.map((piece) => piece.pathD.trim()).join(" "),
      });
    }
  }
  return runs;
}

type Camera = { x: number; y: number; scale: number };

const RegionalSvgMarkup = memo(function RegionalSvgMarkup({ markup }: { markup: string }) {
  return <div dangerouslySetInnerHTML={{ __html: markup }} className="w-full h-full" />;
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
  recenterSignal,
  isDark = true,
  animateInitialEntrance = true,
  deferInitialEntrance = false,
  desktopMenuPinned = false,
  preserveCameraOnSelectionClear = false,
  viewportOrientation = "standard",
  onReady,
  estimatedTrainsEnabled = false,
  estimatedTrainMarkers = [],
  commutePathPreview = null,
  onClearCommutePathPreview,
}: {
  selection: ImpactSelection;
  onSelectImpact: (selection: ImpactSelection) => void;
  selectedStationId: string | null;
  onSelectStationId: (id: string | null) => void;
  reducedMotion: boolean;
  mobilePerformanceMode?: boolean;
  recenterSignal?: number;
  isDark?: boolean;
  animateInitialEntrance?: boolean;
  deferInitialEntrance?: boolean;
  desktopMenuPinned?: boolean;
  preserveCameraOnSelectionClear?: boolean;
  viewportOrientation?: MapViewportOrientation;
  onReady?: () => void;
  estimatedTrainsEnabled?: boolean;
  estimatedTrainMarkers?: EstimatedTrainMarker[];
  commutePathPreview?: AccountCommutePathPreview | null;
  onClearCommutePathPreview?: () => void;
}) {
  const { activeAlerts, networkSegments, stationNodeImpacts } = useDashboardData();
  const viewportRef = useRef<HTMLDivElement>(null);
  const mapStageRef = useRef<HTMLDivElement>(null);
  const cameraInitializedRef = useRef(false);
  const lastRecenterSignalRef = useRef(recenterSignal);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; camera: Camera } | null>(null);
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchGestureRef = useRef<{
    startDistance: number;
    startScale: number;
    mapPointAtMidpoint: { x: number; y: number };
  } | null>(null);
  const [svgMarkup, setSvgMarkup] = useState("");
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [cameraReady, setCameraReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isGestureActive, setIsGestureActive] = useState(false);
  const [fitScale, setFitScale] = useState(0.35);
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
  const entranceWasDeferredRef = useRef(false);
  const lastFocusedTargetKeyRef = useRef<string | null>(null);
  const lastFocusLayoutKeyRef = useRef("");
  const shouldAnimateProgrammaticTransform = !reducedMotion && !mobilePerformanceMode;

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
    setMapTransition(shouldAnimateProgrammaticTransform ? "transform 0.1s ease-out" : "none");
    if (!renderedCamera) return;
    cameraRef.current = renderedCamera;
    writeMapTransform(renderedCamera);
    setCamera(renderedCamera);
  }, [clearProgrammaticAnimation, currentRenderedCamera, setMapTransition, shouldAnimateProgrammaticTransform, writeMapTransform]);

  const animateCameraTo = useCallback((targetCamera: Camera, nextFitScale?: number) => {
    cameraRef.current = targetCamera;
    clearProgrammaticAnimation();

    if (!mapStageRef.current || !shouldAnimateProgrammaticTransform) {
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
  }, [clearProgrammaticAnimation, setMapTransition, shouldAnimateProgrammaticTransform, writeMapTransform]);

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
      focus: { x: focus.focusX, y: focus.focusY },
    };
  }, [desktopMapBottomInset, desktopMapTopInset]);

  const fitNetwork = useCallback(() => {
    const fitted = fittedCamera();
    if (!fitted) return;
    cameraInitializedRef.current = true;
    animateCameraTo(fitted.camera, fitted.scale);
  }, [animateCameraTo, fittedCamera]);

  const stageInitialEntrance = useCallback(() => {
    if (!svgMarkup) return;
    const fitted = fittedCamera();
    if (!fitted) return;
    const viewport = viewportRef.current;
    const mapSurface = viewport?.closest<HTMLElement>(".network-map-transition-surface");
    const width = viewport?.clientWidth || mapSurface?.clientWidth || 0;
    const height = viewport?.clientHeight || mapSurface?.clientHeight || 0;
    if (width <= 0 || height <= 0) return;
    const entryCamera = snapCameraToDevicePixels(
      computeFittedCameraFlyInStart(fitted.camera, width, height, fitted.focus),
    );

    cameraInitializedRef.current = true;
    setCameraReady(true);
    cameraRef.current = entryCamera;
    setMapTransition("none");
    writeMapTransform(entryCamera);
    setFitScale(fitted.scale);
    setCamera(entryCamera);
  }, [fittedCamera, setMapTransition, svgMarkup, writeMapTransform]);

  const completeStagedEntrance = useCallback(() => {
    const fitted = fittedCamera();
    if (!fitted) return;
    animateCameraTo(fitted.camera, fitted.scale);
  }, [animateCameraTo, fittedCamera]);

  const initializeMapCamera = useCallback(() => {
    if (cameraInitializedRef.current || !svgMarkup) return;
    const fitted = fittedCamera();
    if (!fitted) return;
    cameraInitializedRef.current = true;
    setCameraReady(true);
    if (animateInitialEntrance && shouldAnimateProgrammaticTransform) {
      const viewport = viewportRef.current;
      const mapSurface = viewport?.closest<HTMLElement>(".network-map-transition-surface");
      const width = viewport?.clientWidth || mapSurface?.clientWidth || 0;
      const height = viewport?.clientHeight || mapSurface?.clientHeight || 0;
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
  }, [animateCameraTo, animateInitialEntrance, fittedCamera, setMapTransition, shouldAnimateProgrammaticTransform, svgMarkup, writeMapTransform]);

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
          selectedIndicator.classList.add("map-selection-attention", "station-selected-indicator", "regional-station-selected-indicator");
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
        const stationsLayer = documentNode.getElementById("regional-stations-layer");
        for (const alert of activeAlerts.filter((item) => item.affectedSegmentIds.length === 0)) {
          const pathD = authoredRegionalCorridorPathData(documentNode, alert.lineId);
          if (!stationsLayer || !pathD) continue;
          const overlaySource = documentNode.createElementNS(SVG_NAMESPACE, "path");
          overlaySource.setAttribute("style", "display:inline");
          overlaySource.setAttribute("d", pathD);
          const kind = alert.severity === "planned" ? "planned-closure" : alert.severity;
          const overlay = regionalImpactGroup(documentNode, overlaySource, {
            impactId: alert.id,
            kind,
            label: `${alert.lineNumber} ${alert.title}`,
            reducedMotion,
          });
          const firstStationTarget = stationsLayer.querySelector(".regional-station-hit-target");
          stationsLayer.insertBefore(overlay, firstStationTarget);
        }
        const overlayPieces: RegionalOverlayPiece[] = [];
        for (const segment of networkSegments.filter((item) => (item.impacts?.length ?? 0) > 0)) {
          const resolvedPathD = resolvedRegionalSegmentPath(documentNode, segment);
          if (!resolvedPathD || !stationsLayer) continue;
          for (const [impactIndex, impact] of (segment.impacts ?? []).entries()) {
            overlayPieces.push({ segment, impact, impactIndex, pathD: resolvedPathD });
          }
        }
        for (const run of regionalOverlayRuns(overlayPieces)) {
          if (!stationsLayer) break;
          const overlaySource = documentNode.createElementNS(SVG_NAMESPACE, "path");
          overlaySource.setAttribute("style", "display:inline");
          const allLineSegmentIds = networkSegments
            .filter((segment) => segment.lineId === run.lineId)
            .map((segment) => segment.id);
          const runSegmentIds = new Set(run.segments.map((segment) => segment.id));
          const coversFullCorridor = allLineSegmentIds.length === run.segments.length
            && allLineSegmentIds.every((segmentId) => runSegmentIds.has(segmentId));
          overlaySource.setAttribute(
            "d",
            coversFullCorridor
              ? authoredRegionalCorridorPathData(documentNode, run.lineId) ?? run.pathD
              : run.pathD,
          );
          const firstSegment = run.segments[0];
          const lastSegment = run.segments.at(-1) ?? firstSegment;
          const startLabel = firstSegment.label.split(" to ")[0];
          const endLabel = lastSegment.label.split(" to ").at(-1) ?? lastSegment.label;
          const overlay = regionalImpactGroup(documentNode, overlaySource, {
            impactId: run.impact.cardId,
            kind: run.impact.kind,
            label: `${startLabel} to ${endLabel} ${run.impact.kind} impact`,
            layerIndex: run.impactIndex,
            segmentCount: run.segments.length,
            travelDirection: run.impact.travelDirection,
            reducedMotion,
          });
          const firstStationTarget = stationsLayer.querySelector(".regional-station-hit-target");
          stationsLayer.insertBefore(overlay, firstStationTarget);
        }
        for (const [impactIndex, impact] of stationNodeImpacts.entries()) {
          const stationVisual = documentNode.getElementById(`station-${impact.stationId}`) as SVGElement | null;
          if (!stationVisual) continue;
          const ring = stationVisual.cloneNode(true) as SVGElement;
          removeDescendantIds(ring);
          ring.dataset.regionalImpactKind = impact.kind;
          ring.dataset.regionalImpactId = impact.cardId;
          ring.classList.add("station-impact-ring", "regional-station-impact-ring", "map-selection-attention", `regional-station-impact-ring--${impact.kind}`);
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
        if (commutePathPreview && stationsLayer) {
          const previewLayer = documentNode.createElementNS(SVG_NAMESPACE, "g");
          previewLayer.classList.add("commute-path-preview-layer", "regional-commute-path-preview-layer");
          previewLayer.dataset.commutePathPreview = commutePathPreview.id;
          previewLayer.setAttribute("aria-label", commutePathPreview.routeLabel);
          for (const segmentId of commutePathPreview.segmentIds) {
            const segment = networkSegments.find((item) => item.id === segmentId);
            if (!segment) continue;
            const pathD = resolvedRegionalSegmentPath(documentNode, segment);
            if (!pathD) continue;
            const glow = documentNode.createElementNS(SVG_NAMESPACE, "path");
            glow.setAttribute("d", pathD);
            glow.classList.add("asset-alert-path-glow", "commute-path-preview-glow");
            const path = documentNode.createElementNS(SVG_NAMESPACE, "path");
            path.setAttribute("d", pathD);
            path.classList.add("asset-alert-path", "commute-path-preview-path");
            previewLayer.append(glow, path);
          }
          const firstStationTarget = stationsLayer.querySelector(".regional-station-hit-target");
          stationsLayer.insertBefore(previewLayer, firstStationTarget);
        }
        if (estimatedTrainsEnabled) {
          const markerLayer = documentNode.createElementNS(SVG_NAMESPACE, "g");
          markerLayer.classList.add("estimated-train-marker-layer", "regional-estimated-train-marker-layer");
          markerLayer.setAttribute("aria-label", "Estimated regional train markers");
          for (const marker of estimatedTrainMarkers) {
            const segment = networkSegments.find((item) => item.id === marker.segmentId);
            const start = svgAnchorPoint(documentNode, segment?.stationAAnchorId);
            const end = svgAnchorPoint(documentNode, segment?.stationBAnchorId);
            if (!start || !end) continue;
            const fromIsA = marker.fromStationId === segment?.stationAId;
            const from = fromIsA ? start : end;
            const to = fromIsA ? end : start;
            const progress = Math.max(0.05, Math.min(0.95, marker.progress));
            const x = from.x + (to.x - from.x) * progress;
            const y = from.y + (to.y - from.y) * progress;
            const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
            const group = documentNode.createElementNS(SVG_NAMESPACE, "g");
            group.classList.add("estimated-train-marker", `estimated-train-marker-${marker.lineId}`);
            group.setAttribute("data-marker-key", estimatedTrainMarkerRenderKey(marker));
            group.setAttribute("transform", `translate(${x} ${y}) rotate(${angle}) scale(1.8)`);
            const title = documentNode.createElementNS(SVG_NAMESPACE, "title");
            title.textContent = `${marker.lineId.replace("regional-", "").toUpperCase()} toward ${marker.direction}; schematic estimated position`;
            const halo = documentNode.createElementNS(SVG_NAMESPACE, "circle");
            halo.setAttribute("r", "38");
            halo.classList.add("estimated-train-marker-halo");
            const body = documentNode.createElementNS(SVG_NAMESPACE, "rect");
            body.setAttribute("x", "-30"); body.setAttribute("y", "-13");
            body.setAttribute("width", "48"); body.setAttribute("height", "26"); body.setAttribute("rx", "7");
            body.classList.add("estimated-train-marker-core");
            const arrow = documentNode.createElementNS(SVG_NAMESPACE, "path");
            arrow.setAttribute("d", "M 13 -9 L 30 0 L 13 9 Z");
            arrow.classList.add("estimated-train-marker-arrow");
            group.append(title, halo, body, arrow);
            markerLayer.append(group);
          }
          documentNode.documentElement.append(markerLayer);
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
  }, [activeAlerts, commutePathPreview, estimatedTrainMarkers, estimatedTrainsEnabled, networkSegments, reducedMotion, stationNodeImpacts]);

  useLayoutEffect(() => {
    if (deferInitialEntrance) {
      entranceWasDeferredRef.current = true;
      stageInitialEntrance();
    } else if (entranceWasDeferredRef.current) {
      entranceWasDeferredRef.current = false;
      completeStagedEntrance();
    } else {
      initializeMapCamera();
    }
  }, [completeStagedEntrance, deferInitialEntrance, initializeMapCamera, stageInitialEntrance]);

  useEffect(() => {
    if (deferInitialEntrance || !svgMarkup || !cameraInitializedRef.current || readyNotifiedRef.current) return;

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
  }, [camera, deferInitialEntrance, onReady, svgMarkup]);

  useEffect(() => {
    // Treat this as an edge-triggered command. A remount or data refresh must
    // never replay an old Center request that is still stored by the shell.
    if (recenterSignal === undefined || recenterSignal === lastRecenterSignalRef.current) return;
    lastRecenterSignalRef.current = recenterSignal;
    fitNetwork();
  }, [fitNetwork, recenterSignal]);

  useEffect(() => {
    if (!cameraInitializedRef.current) return;
    const frame = window.requestAnimationFrame(fitNetwork);
    return () => window.cancelAnimationFrame(frame);
  }, [fitNetwork, viewportOrientation]);

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
    }
  }, [selectedStationId, svgMarkup]);

  useEffect(() => {
    const root = viewportRef.current;
    root?.querySelectorAll("[data-regional-impact-selected]").forEach((element) => element.removeAttribute("data-regional-impact-selected"));
    if (selection) {
      root?.querySelectorAll(`[data-regional-impact-kind="${selection.kind}"][data-regional-impact-id="${CSS.escape(selection.id)}"]`)
        .forEach((element) => {
          element.setAttribute("data-regional-impact-selected", "true");
        });
    }
  }, [selection, svgMarkup]);

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

    const viewportRect = viewport.getBoundingClientRect();
    const visibleBounds = elements
      .map((element) => clientRectToLogicalViewportBounds(
        element.getBoundingClientRect(),
        viewportRect,
        viewportOrientation,
      ))
      .filter((bounds) => bounds !== null);
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
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const preferredTargetScale = clampPanZoomScale(fitScale * (isMobile ? 3.8 : 1.8), fitScale);
    const focusPadding = isMobile ? 24 : 40;
    const focusInsets = {
      left: focusPadding,
      right: focusPadding,
      top: Math.max(desktopMapTopInset, focusPadding),
      bottom: Math.max(desktopMapBottomInset, focusPadding),
    };

    if (!isMobile) {
      const shell = viewport.closest<HTMLElement>(".linewatch-shell");
      const overlayRightEdges = [
        desktopMenuPinned
          ? shell?.querySelector<HTMLElement>("#linewatch-main-menu")
          : null,
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
        focusInsets.left = Math.max(focusInsets.left, insetLeft);
      }
    }

    const mapBounds = {
      x: (left - current.x) / current.scale,
      y: (top - current.y) / current.scale,
      width: Math.max((right - left) / current.scale, 1),
      height: Math.max((bottom - top) / current.scale, 1),
    };
    const selectionFit = computeBoundedMapFrame(
      viewport.clientWidth,
      viewport.clientHeight,
      mapBounds,
      focusInsets,
    );
    const targetScale = clampPanZoomScale(
      Math.min(preferredTargetScale, selectionFit.scale),
      fitScale,
    );
    const { focusX, focusY } = computeInsetViewportFocus(
      viewport.clientWidth,
      viewport.clientHeight,
      focusInsets,
    );

    animateCameraTo(snapCameraToDevicePixels({
      x: focusX - mapX * targetScale,
      y: focusY - mapY * targetScale,
      scale: targetScale,
    }));
    return true;
  }, [
    animateCameraTo,
    desktopMapBottomInset,
    desktopMapTopInset,
    desktopMenuPinned,
    fitScale,
    selectedMapElements,
    viewportOrientation,
  ]);

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
    setMapTransition(shouldAnimateProgrammaticTransform ? "transform 0.1s ease-out" : "none");
    const centerX = viewport.clientWidth / 2;
    const centerY = viewport.clientHeight / 2;
    setCamera((current) => {
      const nextScale = clampPanZoomScale(current.scale * factor, fitScale);
      const ratio = nextScale / current.scale;
      const nextCamera = snapCameraToDevicePixels({
        x: centerX - (centerX - current.x) * ratio,
        y: centerY - (centerY - current.y) * ratio,
        scale: nextScale,
      });
      cameraRef.current = nextCamera;
      return nextCamera;
    });
  }, [fitScale, setMapTransition, shouldAnimateProgrammaticTransform]);

  const zoomToScale = useCallback((targetRelativeScale: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setMapTransition(shouldAnimateProgrammaticTransform ? "transform 0.1s ease-out" : "none");
    const centerX = viewport.clientWidth / 2;
    const centerY = viewport.clientHeight / 2;
    setCamera((current) => {
      const nextScale = clampPanZoomScale(targetRelativeScale * fitScale, fitScale);
      const ratio = nextScale / current.scale;
      const nextCamera = snapCameraToDevicePixels({
        x: centerX - (centerX - current.x) * ratio,
        y: centerY - (centerY - current.y) * ratio,
        scale: nextScale,
      });
      cameraRef.current = nextCamera;
      return nextCamera;
    });
  }, [fitScale, setMapTransition, shouldAnimateProgrammaticTransform]);

  const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;

    clearProgrammaticAnimation();
    setMapTransition("none");

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
    }, 80);
  }, [clearProgrammaticAnimation, fitScale, setMapTransition, viewportOrientation, writeMapTransform]);

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
    const point = clientPointToLogicalViewportPoint(
      { x: event.clientX, y: event.clientY },
      event.currentTarget.getBoundingClientRect(),
      viewportOrientation,
    );

    if (activePointersRef.current.size === 0) {
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
      dragMovedRef.current = false;
      dragRef.current = { pointerId: event.pointerId, x: point.x, y: point.y, camera: cameraRef.current };
    }

    activePointersRef.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);
    pendingDragPointRef.current = point;

    if (activePointersRef.current.size >= 2) {
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
    setIsGestureActive(true);
  }, [cancelCameraAnimation, viewportOrientation]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(event.pointerId)) return;
    const point = clientPointToLogicalViewportPoint(
      { x: event.clientX, y: event.clientY },
      event.currentTarget.getBoundingClientRect(),
      viewportOrientation,
    );
    activePointersRef.current.set(event.pointerId, point);
    pendingDragPointRef.current = point;

    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId && (Math.abs(point.x - drag.x) > 3 || Math.abs(point.y - drag.y) > 3)) {
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
    const activation = pointerActivationRef.current;
    pointerActivationRef.current = null;
    if (event.type === "pointerup" && !dragMovedRef.current && activation) {
      suppressNextClickRef.current = true;
      if (activation.type === "station") {
        onSelectStationId(activation.id);
      } else {
        onSelectImpact(activation.selection);
      }
    }
    setCamera({ ...cameraRef.current });
    setIsGestureActive(false);
  }, [applyActiveGesture, onSelectImpact, onSelectStationId]);

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

  const setLinkedImpactHover = useCallback((target: EventTarget | null, hovered: boolean) => {
    if (!(target instanceof Element)) return;
    const impact = target.closest<SVGElement>("[data-regional-impact-kind][data-regional-impact-id]");
    const kind = impact?.dataset.regionalImpactKind;
    const id = impact?.dataset.regionalImpactId;
    const root = viewportRef.current;
    if (!root || !kind || !id) return;
    root.querySelectorAll(
      `[data-regional-impact-kind="${kind}"][data-regional-impact-id="${CSS.escape(id)}"]`,
    ).forEach((element) => {
      if (hovered) {
        element.setAttribute("data-regional-impact-hovered", "true");
      } else {
        element.removeAttribute("data-regional-impact-hovered");
      }
    });
  }, []);

  const onLinkedImpactPointerOver = useCallback((event: PointerEvent<HTMLDivElement>) => {
    setLinkedImpactHover(event.target, true);
  }, [setLinkedImpactHover]);

  const onLinkedImpactPointerOut = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const currentImpact = event.target instanceof Element
      ? event.target.closest<SVGElement>("[data-regional-impact-kind][data-regional-impact-id]")
      : null;
    const nextImpact = event.relatedTarget instanceof Element
      ? event.relatedTarget.closest<SVGElement>("[data-regional-impact-kind][data-regional-impact-id]")
      : null;
    if (
      currentImpact?.dataset.regionalImpactKind === nextImpact?.dataset.regionalImpactKind
      && currentImpact?.dataset.regionalImpactId === nextImpact?.dataset.regionalImpactId
    ) return;
    setLinkedImpactHover(event.target, false);
  }, [setLinkedImpactHover]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateTarget(event.target);
  }, [activateTarget]);

  const relativeScale = camera.scale / (fitScale || 1);

  return (
    <section
      className={`regional-map ${isGestureActive ? "map-gesture-active" : ""}`}
      data-map-gesture-active={isGestureActive ? "true" : "false"}
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
        onPointerOver={onLinkedImpactPointerOver}
        onPointerOut={onLinkedImpactPointerOut}
        onFocus={(event) => setLinkedImpactHover(event.target, true)}
        onBlur={(event) => setLinkedImpactHover(event.target, false)}
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
            visibility: svgMarkup && cameraReady ? "visible" : "hidden",
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
            transformOrigin: "0 0",
            transition: "none",
          }}
        >
          <RegionalSvgMarkup markup={svgMarkup} />
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
      {commutePathPreview ? (
        <div className="commute-path-preview-chip" role="status" aria-live="polite">
          <span>Viewing <strong>{commutePathPreview.routeLabel}</strong></span>
          <button type="button" onClick={onClearCommutePathPreview} aria-label="Back to My Commutes">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ) : null}
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

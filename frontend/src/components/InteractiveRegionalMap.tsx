"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import { Locate, ZoomIn, ZoomOut } from "lucide-react";
import type { ImpactKind, ImpactSelection, MapImpact, NetworkSegment, TravelDirection } from "../app/linewatch-data";
import type { AccountCommutePathPreview } from "../app/account-data";
import {
  estimatedTrainMarkerRenderKey,
  orientedEstimatedTrainMarkerAngle,
  resolveEstimatedTrainMarkerSegmentDirection,
  TRAIN_MARKER_ARROW_PATH,
  TRAIN_MARKER_BODY_PATH,
  TRAIN_MARKER_WINDOWS,
  type EstimatedTrainMarker,
} from "../app/train-markers";
import { useDashboardData } from "../app/DataContext";
import { lineWatchBuildLabel } from "../app/app-build";
import {
  MapOverlapIndicator,
  mapOverlapIndicatorSize,
  type MapOverlapIndicatorSize,
} from "./MapOverlapIndicator";
import {
  stationImpactDirectionForImpact,
  stationImpactDirectionPath,
} from "./station-impact-direction";
import {
  MapOverlapChooser,
  type MapOverlapChooserLayout,
} from "./MapOverlapChooser";
import {
  hasOverlappingImpacts,
  overlapBadgeSignature,
} from "./map-overlap-badges";
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
// Route-wide selections need breathing room beyond a technically exact fit so
// station labels and the authored corridor shape do not crowd the visible map
// space beside an open desktop panel. Short selections still use the preferred
// close zoom because their fitted scale remains above that cap.
const REGIONAL_SELECTION_FIT_COMFORT_RATIO = 0.82;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const REGIONAL_IMPACT_OVERLAY_WIDTH = 196;
// Keep the interactive stroke as wide as the fully expanded hover aura. A
// narrower target lets the visible highlight grow into an inert strip and
// then disappear while the pointer is still visibly over the overlay.
const REGIONAL_IMPACT_HIT_TARGET_WIDTH = REGIONAL_IMPACT_OVERLAY_WIDTH + 169;
const REGIONAL_HIGHLIGHT_OUTLINE_WIDTH = REGIONAL_IMPACT_OVERLAY_WIDTH + 38;
const REGIONAL_HIGHLIGHT_INNER_WIDTH = REGIONAL_IMPACT_OVERLAY_WIDTH;
const REGIONAL_DELAY_GLYPH_SPACING = 96;
// TTC's lane advances 160 SVG units over 12 seconds. Regional authored map
// units are about 175 / 102 larger for the equivalent corridor stroke.
const REGIONAL_DELAY_TRAVEL_UNITS_PER_SECOND = (160 / 12) * (175 / 102);
const REGIONAL_OVERLAP_INDICATOR_SCALE = 2.5;
const REGIONAL_OVERLAP_INDICATOR_EDGE_GAP = 88;
const REGIONAL_OVERLAP_CHOOSER_GAP = 24;
const REGIONAL_STATION_IMPACT_EFFECT_RADIUS_RATIO = 0.9;
const REGIONAL_STATION_IMPACT_BADGE_RADIUS_RATIO = 0.72;
const REGIONAL_MAP_VIEWBOX = {
  x: -200,
  y: -200,
  width: 17036.959,
  height: 9031.6719,
};
const REGIONAL_DYNAMIC_SEGMENT_LAYER_ID = "regional-dynamic-segment-layer";
const REGIONAL_DYNAMIC_STATION_RING_LAYER_ID = "regional-dynamic-station-ring-layer";
const REGIONAL_DYNAMIC_COMMUTE_LAYER_ID = "regional-dynamic-commute-layer";
const REGIONAL_DYNAMIC_HOVER_LAYER_ID = "regional-dynamic-hover-layer";
const REGIONAL_DYNAMIC_EFFECTS_LAYER_ID = "regional-dynamic-effects-layer";
const REGIONAL_TRAIN_MARKER_LAYER_ID = "regional-train-marker-layer";
const SELECTION_INTRO_DURATION_MS = 2400;

function markCompletedSelectionIntro(root: ParentNode) {
  root.querySelectorAll<SVGElement>(
    '[data-regional-station-selected="true"], '
      + '[data-regional-impact-selected="true"] .regional-impact-interactive-glow, '
      + '.regional-station-impact-ring[data-regional-impact-selected="true"]',
  ).forEach((element) => element.classList.add("selection-intro-complete"));
}

type RegionalOverlapBadge = {
  markerId: string;
  label: string;
  impacts: MapImpact[];
  anchor: SvgPoint;
  position: SvgPoint;
  preferredVector: SvgPoint;
  size: MapOverlapIndicatorSize;
};

type RegionalCollisionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type RegionalOverlapBadgePlacement = {
  anchor: SvgPoint;
  position: SvgPoint;
};

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

function regionalImpactPriority(kind: ImpactKind) {
  switch (kind) {
    case "delay":
      return 0;
    case "reduced-speed-zone":
      return 1;
    case "planned-closure":
      return 2;
    case "suspension":
      return 3;
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

function appendRegionalSuspensionGlyph(
  documentNode: Document,
  parent: SVGGElement,
  kind: "no-entry" | "bar",
) {
  const glyph = documentNode.createElementNS(SVG_NAMESPACE, "g");
  glyph.classList.add("regional-suspension-glyph", `regional-suspension-glyph--${kind}`);

  if (kind === "no-entry") {
    // Replicate TTC's exact SuspensionNoEntryGlyph (white circle with diagonal prohibitory slash)
    // scaled for regional map units (196px stroke width).
    const scale = 4.2;
    const artwork = documentNode.createElementNS(SVG_NAMESPACE, "g");
    artwork.setAttribute("transform", `translate(${-12 * scale} ${-12 * scale}) scale(${scale})`);
    artwork.setAttribute("stroke", "#ffffff");
    artwork.setAttribute("fill", "none");
    artwork.setAttribute("stroke-width", "3.2");

    const circle = documentNode.createElementNS(SVG_NAMESPACE, "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "10.5");

    const slash = documentNode.createElementNS(SVG_NAMESPACE, "line");
    slash.setAttribute("x1", "19.64");
    slash.setAttribute("y1", "4.36");
    slash.setAttribute("x2", "4.36");
    slash.setAttribute("y2", "19.64");

    artwork.append(circle, slash);
    glyph.append(artwork);
  } else {
    const arrow = documentNode.createElementNS(SVG_NAMESPACE, "path");
    arrow.setAttribute("d", "M -14 -12 L 10 0 L -14 12");
    arrow.setAttribute("fill", "none");
    arrow.setAttribute("stroke", "#ffffff");
    arrow.setAttribute("stroke-width", "4.5");
    arrow.setAttribute("stroke-linecap", "round");
    arrow.setAttribute("stroke-linejoin", "round");
    glyph.append(arrow);
  }

  parent.append(glyph);
  return glyph;
}

function regionalSuspensionGlyphLane(
  documentNode: Document,
  sourcePath: SVGPathElement,
  travelDirection: TravelDirection,
  reducedMotion: boolean,
) {
  const lane = documentNode.createElementNS(SVG_NAMESPACE, "g");
  lane.classList.add("regional-suspension-glyph-lane");
  lane.setAttribute("aria-hidden", "true");

  let length = 0;
  try {
    length = sourcePath.getTotalLength();
  } catch {
    return lane;
  }
  if (length <= 0) return lane;

  // Leave nearly the same visual breathing room as the planned-closure lane,
  // while keeping active-alert glyphs slightly denser for urgency.
  const glyphSpacing = travelDirection === "bidirectional" ? 165 : 145;
  const count = Math.max(1, Math.floor(length / glyphSpacing));
  const durationSeconds = Math.max(10, length / REGIONAL_DELAY_TRAVEL_UNITS_PER_SECOND);
  const pathD = sourcePath.getAttribute("d") ?? "";

  for (let index = 0; index < count; index += 1) {
    const glyphKind = travelDirection === "bidirectional" || index % 2 === 0
      ? "no-entry"
      : "bar";
    const glyph = appendRegionalSuspensionGlyph(documentNode, lane, glyphKind);
    const progress = (index + 0.5) / count;

    if (reducedMotion || travelDirection === "bidirectional" || !pathD) {
      const distance = travelDirection === "reverse"
        ? length * (1 - progress)
        : length * progress;
      const point = sourcePath.getPointAtLength(distance);
      const before = sourcePath.getPointAtLength(Math.max(0, distance - 2));
      const after = sourcePath.getPointAtLength(Math.min(length, distance + 2));
      const angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI
        + (travelDirection === "reverse" ? 180 : 0);
      const transform = glyphKind === "no-entry"
        ? `translate(${point.x} ${point.y})`
        : `translate(${point.x} ${point.y}) rotate(${angle})`;
      glyph.setAttribute("transform", transform);
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
    motion.setAttribute("rotate", glyphKind === "no-entry" ? "0" : (travelDirection === "reverse" ? "auto-reverse" : "auto"));
    glyph.append(motion);
  }

  return lane;
}

function appendRegionalChevronGlyph(documentNode: Document, parent: SVGGElement) {
  const glyph = documentNode.createElementNS(SVG_NAMESPACE, "g");
  glyph.classList.add("regional-chevron-glyph");

  const arrow = documentNode.createElementNS(SVG_NAMESPACE, "path");
  arrow.setAttribute("d", "M -16 -14 L 10 0 L -16 14");
  arrow.setAttribute("fill", "none");
  arrow.setAttribute("stroke", "#f8fafc");
  arrow.setAttribute("stroke-width", "5");
  arrow.setAttribute("stroke-linecap", "round");
  arrow.setAttribute("stroke-linejoin", "round");
  glyph.append(arrow);

  parent.append(glyph);
  return glyph;
}

function regionalChevronGlyphLane(
  documentNode: Document,
  sourcePath: SVGPathElement,
  travelDirection: TravelDirection,
  reducedMotion: boolean,
) {
  const lane = documentNode.createElementNS(SVG_NAMESPACE, "g");
  lane.classList.add("regional-chevron-glyph-lane");
  lane.setAttribute("aria-hidden", "true");

  let length = 0;
  try {
    length = sourcePath.getTotalLength();
  } catch {
    return lane;
  }
  if (length <= 0) return lane;

  const glyphSpacing = 100;
  const count = Math.max(1, Math.floor(length / glyphSpacing));
  const durationSeconds = Math.max(8, length / (REGIONAL_DELAY_TRAVEL_UNITS_PER_SECOND * 1.2));
  const pathD = sourcePath.getAttribute("d") ?? "";

  for (let index = 0; index < count; index += 1) {
    const glyph = appendRegionalChevronGlyph(documentNode, lane);
    const progress = (index + 0.5) / count;

    if (reducedMotion || !pathD) {
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

function appendRegionalPlannedClosureGlyph(
  documentNode: Document,
  parent: SVGGElement,
  kind: "icon" | "chevron",
) {
  const glyph = documentNode.createElementNS(SVG_NAMESPACE, "g");
  glyph.classList.add("regional-planned-closure-glyph", `regional-planned-closure-glyph--${kind}`);

  if (kind === "icon") {
    // Replicate TTC map mode's PlannedClosureIcon (blue outline calendar icon on white rail)
    // scaled for regional map units (196px stroke width).
    const scale = 4.9;
    const artwork = documentNode.createElementNS(SVG_NAMESPACE, "g");
    artwork.setAttribute("transform", `translate(${-12 * scale} ${-12 * scale}) scale(${scale})`);
    artwork.setAttribute("stroke", "var(--planned-preview-ink, #087fff)");
    artwork.setAttribute("fill", "none");
    artwork.setAttribute("stroke-width", "2.5");

    const card = documentNode.createElementNS(SVG_NAMESPACE, "rect");
    card.setAttribute("x", "3");
    card.setAttribute("y", "5");
    card.setAttribute("width", "18");
    card.setAttribute("height", "16");
    card.setAttribute("rx", "3");

    const inner = documentNode.createElementNS(SVG_NAMESPACE, "path");
    inner.setAttribute("d", "M3 9H21M12 12V15M12 18H12.01M7 3V5M17 3V5");
    inner.setAttribute("stroke-linecap", "round");
    inner.setAttribute("stroke-linejoin", "round");

    artwork.append(card, inner);
    glyph.append(artwork);
  } else {
    const arrow = documentNode.createElementNS(SVG_NAMESPACE, "path");
    arrow.setAttribute("d", "M -20 -18 L 14 0 L -20 18");
    arrow.setAttribute("fill", "none");
    arrow.setAttribute("stroke", "var(--planned-preview-ink, #087fff)");
    arrow.setAttribute("stroke-width", "6.5");
    arrow.setAttribute("stroke-linecap", "round");
    arrow.setAttribute("stroke-linejoin", "round");
    glyph.append(arrow);
  }

  parent.append(glyph);
  return glyph;
}

function regionalPlannedClosureIconLane(
  documentNode: Document,
  sourcePath: SVGPathElement,
  travelDirection: TravelDirection,
  reducedMotion: boolean,
) {
  const lane = documentNode.createElementNS(SVG_NAMESPACE, "g");
  lane.classList.add("regional-planned-closure-glyph-lane");
  lane.setAttribute("aria-hidden", "true");

  let length = 0;
  try {
    length = sourcePath.getTotalLength();
  } catch {
    return lane;
  }
  if (length <= 0) return lane;

  const glyphSpacing = travelDirection === "bidirectional" ? 176 : 148;
  const count = Math.max(1, Math.floor(length / glyphSpacing));
  const durationSeconds = Math.max(12, length / REGIONAL_DELAY_TRAVEL_UNITS_PER_SECOND);
  const pathD = sourcePath.getAttribute("d") ?? "";

  for (let index = 0; index < count; index += 1) {
    const glyphKind = travelDirection === "bidirectional" || index % 2 === 0
      ? "icon"
      : "chevron";
    const glyph = appendRegionalPlannedClosureGlyph(documentNode, lane, glyphKind);
    const progress = (index + 0.5) / count;

    if (reducedMotion || travelDirection === "bidirectional" || !pathD) {
      const distance = travelDirection === "reverse"
        ? length * (1 - progress)
        : length * progress;
      const point = sourcePath.getPointAtLength(distance);
      const before = sourcePath.getPointAtLength(Math.max(0, distance - 2));
      const after = sourcePath.getPointAtLength(Math.min(length, distance + 2));
      const angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI
        + (travelDirection === "reverse" ? 180 : 0);
      const transform = glyphKind === "icon"
        ? `translate(${point.x} ${point.y})`
        : `translate(${point.x} ${point.y}) rotate(${angle})`;
      glyph.setAttribute("transform", transform);
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
    motion.setAttribute("rotate", glyphKind === "icon" ? "0" : (travelDirection === "reverse" ? "auto-reverse" : "auto"));
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
    segmentCount = 1,
    segmentIds = [],
    travelDirection = "bidirectional",
    reducedMotion = false,
  }: {
    impactId: string;
    kind: ImpactKind;
    label: string;
    segmentCount?: number;
    segmentIds?: string[];
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
  group.dataset.regionalImpactSegmentIds = segmentIds.join(",");
  group.style.setProperty("--regional-impact-color", regionalImpactColor(kind));
  group.style.setProperty(
    "--regional-impact-width",
    `${REGIONAL_IMPACT_OVERLAY_WIDTH}px`,
  );
  group.style.setProperty(
    "--regional-impact-hit-target-width",
    `${REGIONAL_IMPACT_HIT_TARGET_WIDTH}px`,
  );
  group.style.setProperty("--regional-impact-dasharray", regionalImpactDashArray(kind));
  group.style.setProperty("--regional-map-pulse-offset", "0s");
  group.style.setProperty("--map-pulse-offset", "0s");

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

  group.append(aura, boundary, visiblePath);
  if (kind === "delay") {
    group.append(regionalDelayGlyphLane(documentNode, sourcePath, travelDirection, reducedMotion));
  } else if (kind === "suspension") {
    group.append(regionalSuspensionGlyphLane(documentNode, sourcePath, travelDirection, reducedMotion));
  } else if (kind === "reduced-speed-zone") {
    group.append(regionalChevronGlyphLane(documentNode, sourcePath, travelDirection, reducedMotion));
  } else if (kind === "planned-closure") {
    group.append(regionalPlannedClosureIconLane(documentNode, sourcePath, travelDirection, reducedMotion));
  }
  // Match TTC selection layering: the attention stroke belongs above the
  // authored alert treatment and its moving glyphs, while the transparent hit
  // target remains the top interactive element.
  group.append(interactiveGlow, hitTarget);
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

type RegionalStationVisualAnchor = {
  id: string;
  point: SvgPoint;
  radius: number;
};

function regionalStationVisualAnchors(stationVisual: SVGElement): RegionalStationVisualAnchor[] {
  const shapes = stationVisual.matches("circle, ellipse, rect")
    ? [stationVisual]
    : [...stationVisual.querySelectorAll<SVGElement>("circle, ellipse, rect")]
        .filter((shape) => shape.getAttribute("inkscape:label") !== "join-rectangle");
  return shapes.flatMap((shape) => {
    if (shape.matches("circle, ellipse")) {
      const center = {
        x: Number(shape.getAttribute("cx") ?? 0),
        y: Number(shape.getAttribute("cy") ?? 0),
      };
      const radiusX = Number(shape.getAttribute("r") ?? shape.getAttribute("rx") ?? 0);
      const radiusY = Number(shape.getAttribute("r") ?? shape.getAttribute("ry") ?? 0);
      const point = pointInRegionalStationsLayer(shape, center);
      const xEdge = pointInRegionalStationsLayer(shape, { x: center.x + radiusX, y: center.y });
      const yEdge = pointInRegionalStationsLayer(shape, { x: center.x, y: center.y + radiusY });
      return [{
        id: shape.id || stationVisual.id,
        point,
        radius: Math.min(
          Math.hypot(xEdge.x - point.x, xEdge.y - point.y),
          Math.hypot(yEdge.x - point.x, yEdge.y - point.y),
        ),
      }];
    }
    if (shape.matches("rect")) {
      const x = Number(shape.getAttribute("x") ?? 0);
      const y = Number(shape.getAttribute("y") ?? 0);
      return [{
        id: shape.id || stationVisual.id,
        point: pointInRegionalStationsLayer(shape, {
          x: x + Number(shape.getAttribute("width") ?? 0) / 2,
          y: y + Number(shape.getAttribute("height") ?? 0) / 2,
        }),
        radius: Math.min(
          Number(shape.getAttribute("width") ?? 0),
          Number(shape.getAttribute("height") ?? 0),
        ) / 2,
      }];
    }
    return [];
  });
}

function regionalStationImpactAnchors(
  stationVisual: SVGElement,
  lineId: string | null | undefined,
) {
  const anchors = regionalStationVisualAnchors(stationVisual);
  const routeCode = lineId?.startsWith("regional-")
    ? lineId.slice("regional-".length)
    : null;
  if (!routeCode) return anchors;
  const matching = anchors.filter((anchor) => anchor.id.endsWith(`-${routeCode}`));
  return matching.length > 0 ? matching : anchors;
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

function regionalTrainMarkerFrame(
  documentNode: Document,
  segment: NetworkSegment,
  marker: EstimatedTrainMarker,
) {
  const pathD = resolvedRegionalSegmentPath(documentNode, segment);
  const direction = resolveEstimatedTrainMarkerSegmentDirection(marker, segment);
  if (!direction) return null;
  const from = svgAnchorPoint(documentNode, direction.fromAnchorId);
  if (!pathD || !from) return null;

  const markerPath = documentNode.createElementNS(SVG_NAMESPACE, "path");
  markerPath.setAttribute("d", pathD);
  try {
    const length = markerPath.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) return null;
    const pathStart = markerPath.getPointAtLength(0);
    const pathEnd = markerPath.getPointAtLength(length);
    const pathStartsAtFrom = squaredPointDistance(pathStart, from)
      <= squaredPointDistance(pathEnd, from);
    const progress = Math.max(0.05, Math.min(0.95, marker.progress));
    const pathProgress = pathStartsAtFrom ? progress : 1 - progress;
    const distance = length * pathProgress;
    const point = markerPath.getPointAtLength(distance);
    const delta = Math.min(24, Math.max(2, length * 0.015));
    const before = markerPath.getPointAtLength(Math.max(0, distance - delta));
    const after = markerPath.getPointAtLength(Math.min(length, distance + delta));
    const pathAngle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
    return {
      point,
      angle: orientedEstimatedTrainMarkerAngle(pathAngle, pathStartsAtFrom),
    };
  } catch {
    return null;
  }
}

function appendRegionalTrainMarkerGlyph(documentNode: Document, group: SVGGElement) {
  for (const className of ["estimated-train-marker-outline", "estimated-train-marker-core"]) {
    const body = documentNode.createElementNS(SVG_NAMESPACE, "path");
    body.setAttribute("d", TRAIN_MARKER_BODY_PATH);
    body.classList.add(className);
    group.append(body);
  }
  for (const window of TRAIN_MARKER_WINDOWS) {
    const pane = documentNode.createElementNS(SVG_NAMESPACE, "rect");
    pane.setAttribute("x", String(window.x));
    pane.setAttribute("y", String(window.y));
    pane.setAttribute("width", String(window.width));
    pane.setAttribute("height", String(window.height));
    pane.setAttribute("rx", String(window.rx));
    pane.classList.add("estimated-train-marker-window");
    group.append(pane);
  }
  const arrow = documentNode.createElementNS(SVG_NAMESPACE, "path");
  arrow.setAttribute("d", TRAIN_MARKER_ARROW_PATH);
  arrow.classList.add("estimated-train-marker-arrow");
  group.append(arrow);
}

function regionalOverlapBadgeGroups(segments: NetworkSegment[]) {
  const groups = new Map<string, { segments: NetworkSegment[]; impacts: MapImpact[] }>();
  for (const segment of segments) {
    const impacts = [...new Map(
      (segment.impacts ?? []).map((impact) => [`${impact.kind}:${impact.cardId}`, impact]),
    ).values()];
    if (!hasOverlappingImpacts(impacts)) continue;
    const signature = overlapBadgeSignature(impacts);
    const group = groups.get(signature);
    if (group) {
      group.segments.push(segment);
    } else {
      groups.set(signature, { segments: [segment], impacts });
    }
  }
  return [...groups.entries()].map(([signature, group]) => ({ signature, ...group }));
}

function regionalOverlapBadgeAnchor(
  documentNode: Document,
  segment: NetworkSegment,
  size: MapOverlapIndicatorSize,
): RegionalOverlapBadgePlacement | null {
  const stationsLayer = documentNode.getElementById("regional-stations-layer") as SVGElement | null;
  const mapCenter = {
    x: REGIONAL_MAP_VIEWBOX.x + REGIONAL_MAP_VIEWBOX.width / 2,
    y: REGIONAL_MAP_VIEWBOX.y + REGIONAL_MAP_VIEWBOX.height / 2,
  };
  const pathD = resolvedRegionalSegmentPath(documentNode, segment);
  if (pathD && stationsLayer) {
    const path = documentNode.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", pathD);
    try {
      const length = path.getTotalLength();
      const midpoint = path.getPointAtLength(length / 2);
      const before = path.getPointAtLength(Math.max(0, length / 2 - 5));
      const after = path.getPointAtLength(Math.min(length, length / 2 + 5));
      const tangentLength = Math.hypot(after.x - before.x, after.y - before.y) || 1;
      const normal = {
        x: -(after.y - before.y) / tangentLength,
        y: (after.x - before.x) / tangentLength,
      };
      const renderedBadgeHalfExtent = (
        Math.abs(normal.x) * size.width / 2
        + Math.abs(normal.y) * size.height / 2
      ) * REGIONAL_OVERLAP_INDICATOR_SCALE;
      const offset = REGIONAL_IMPACT_OVERLAY_WIDTH / 2
        + renderedBadgeHalfExtent
        + REGIONAL_OVERLAP_INDICATOR_EDGE_GAP;
      const candidates = [1, -1].map((direction) => ({
        x: midpoint.x + normal.x * offset * direction,
        y: midpoint.y + normal.y * offset * direction,
      }));
      const position = candidates.sort((left, right) => {
        const leftRoot = pointInSvgRootCoordinates(stationsLayer, left);
        const rightRoot = pointInSvgRootCoordinates(stationsLayer, right);
        return squaredPointDistance(leftRoot, mapCenter) - squaredPointDistance(rightRoot, mapCenter);
      })[0];
      return { anchor: midpoint, position };
    } catch {
      // Fall through to the authored station anchors.
    }
  }

  const start = svgAnchorPoint(documentNode, segment.stationAAnchorId);
  const end = svgAnchorPoint(documentNode, segment.stationBAnchorId);
  if (!start || !end) return null;
  const midpoint = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  };
  if (!stationsLayer) return { anchor: midpoint, position: midpoint };
  const rootMidpoint = pointInSvgRootCoordinates(stationsLayer, midpoint);
  const distanceToCenter = Math.hypot(
    mapCenter.x - rootMidpoint.x,
    mapCenter.y - rootMidpoint.y,
  ) || 1;
  const position = pointFromSvgRootCoordinates(stationsLayer, {
    x: rootMidpoint.x
      + (mapCenter.x - rootMidpoint.x) / distanceToCenter * (
        REGIONAL_IMPACT_OVERLAY_WIDTH / 2
        + Math.max(size.width, size.height) * REGIONAL_OVERLAP_INDICATOR_SCALE / 2
        + REGIONAL_OVERLAP_INDICATOR_EDGE_GAP
      ),
    y: rootMidpoint.y
      + (mapCenter.y - rootMidpoint.y) / distanceToCenter * (
        REGIONAL_IMPACT_OVERLAY_WIDTH / 2
        + Math.max(size.width, size.height) * REGIONAL_OVERLAP_INDICATOR_SCALE / 2
        + REGIONAL_OVERLAP_INDICATOR_EDGE_GAP
      ),
  });
  return position ? { anchor: midpoint, position } : null;
}

function regionalOverlapBadges(
  documentNode: Document,
  segments: NetworkSegment[],
): RegionalOverlapBadge[] {
  const stationsLayer = documentNode.getElementById("regional-stations-layer") as SVGElement | null;
  return regionalOverlapBadgeGroups(segments).flatMap((group) => {
    const size = mapOverlapIndicatorSize(group.impacts);
    const anchorSegment = group.segments[Math.floor(group.segments.length / 2)];
    const placement = anchorSegment
      ? regionalOverlapBadgeAnchor(documentNode, anchorSegment, size)
      : null;
    if (!placement || !stationsLayer) return [];
    const rootAnchor = pointInSvgRootCoordinates(stationsLayer, placement.anchor);
    const rootPosition = pointInSvgRootCoordinates(stationsLayer, placement.position);
    const firstSegment = group.segments[0];
    const lastSegment = group.segments.at(-1) ?? firstSegment;
    const startLabel = firstSegment.label.split(" to ")[0];
    const endLabel = lastSegment.label.split(" to ").at(-1) ?? lastSegment.label;
    return [{
      markerId: `regional-overlap-${group.signature}`,
      label: `${startLabel} to ${endLabel}`,
      impacts: group.impacts,
      anchor: rootAnchor,
      position: rootPosition,
      preferredVector: {
        x: rootPosition.x - rootAnchor.x,
        y: rootPosition.y - rootAnchor.y,
      },
      size,
    }];
  });
}

function regionalCollisionBoxForElement(
  svg: SVGSVGElement,
  element: SVGGraphicsElement,
): RegionalCollisionBox | null {
  const elementScreenMatrix = element.getScreenCTM();
  const rootScreenMatrix = svg.getScreenCTM();
  if (!elementScreenMatrix || !rootScreenMatrix) return null;
  const rootInverseMatrix = rootScreenMatrix.inverse();
  const bounds = element.getBBox();
  const corners = [
    new DOMPoint(bounds.x, bounds.y),
    new DOMPoint(bounds.x + bounds.width, bounds.y),
    new DOMPoint(bounds.x, bounds.y + bounds.height),
    new DOMPoint(bounds.x + bounds.width, bounds.y + bounds.height),
  ].map((point) => point
    .matrixTransform(elementScreenMatrix)
    .matrixTransform(rootInverseMatrix));
  const xValues = corners.map((point) => point.x);
  const yValues = corners.map((point) => point.y);
  const x = Math.min(...xValues);
  const y = Math.min(...yValues);
  return {
    x,
    y,
    width: Math.max(...xValues) - x,
    height: Math.max(...yValues) - y,
  };
}

function regionalPointInSvgRoot(
  svg: SVGSVGElement,
  element: SVGGraphicsElement,
  point: SvgPoint,
): SvgPoint | null {
  const elementScreenMatrix = element.getScreenCTM();
  const rootScreenMatrix = svg.getScreenCTM();
  if (!elementScreenMatrix || !rootScreenMatrix) return null;
  const transformed = new DOMPoint(point.x, point.y)
    .matrixTransform(elementScreenMatrix)
    .matrixTransform(rootScreenMatrix.inverse());
  return { x: transformed.x, y: transformed.y };
}

function regionalPathCorridorCollisionBoxes(
  svg: SVGSVGElement,
  path: SVGPathElement,
  radius: number,
): RegionalCollisionBox[] {
  try {
    const length = path.getTotalLength();
    if (length <= 0) return [];
    const sampleCount = Math.max(2, Math.ceil(length / Math.max(32, radius * 0.65)));
    return Array.from({ length: sampleCount + 1 }, (_unused, index) => {
      const localPoint = path.getPointAtLength(length * index / sampleCount);
      const point = regionalPointInSvgRoot(svg, path, localPoint);
      if (!point) return null;
      return {
        x: point.x - radius,
        y: point.y - radius,
        width: radius * 2,
        height: radius * 2,
      };
    }).filter((box): box is RegionalCollisionBox => Boolean(box));
  } catch {
    return [];
  }
}

function expandedRegionalCollisionBox(
  box: RegionalCollisionBox,
  padding: number,
): RegionalCollisionBox {
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  };
}

function regionalBadgeCollisionBox(
  position: SvgPoint,
  size: MapOverlapIndicatorSize,
): RegionalCollisionBox {
  const width = size.width * REGIONAL_OVERLAP_INDICATOR_SCALE;
  const height = size.height * REGIONAL_OVERLAP_INDICATOR_SCALE;
  return {
    x: position.x - width / 2,
    y: position.y - height / 2,
    width,
    height,
  };
}

function regionalCollisionIntersectionArea(
  left: RegionalCollisionBox,
  right: RegionalCollisionBox,
) {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );
  return width * height;
}

function clampRegionalOverlapBadgePosition(
  position: SvgPoint,
  size: MapOverlapIndicatorSize,
): SvgPoint {
  const halfWidth = size.width * REGIONAL_OVERLAP_INDICATOR_SCALE / 2;
  const halfHeight = size.height * REGIONAL_OVERLAP_INDICATOR_SCALE / 2;
  return {
    x: Math.min(
      REGIONAL_MAP_VIEWBOX.x + REGIONAL_MAP_VIEWBOX.width - halfWidth,
      Math.max(REGIONAL_MAP_VIEWBOX.x + halfWidth, position.x),
    ),
    y: Math.min(
      REGIONAL_MAP_VIEWBOX.y + REGIONAL_MAP_VIEWBOX.height - halfHeight,
      Math.max(REGIONAL_MAP_VIEWBOX.y + halfHeight, position.y),
    ),
  };
}

function regionalOverlapBadgePositionCandidates(badge: RegionalOverlapBadge): SvgPoint[] {
  const preferredDistance = Math.hypot(badge.preferredVector.x, badge.preferredVector.y) || 1;
  const preferredAngle = Math.atan2(badge.preferredVector.y, badge.preferredVector.x);
  const angleOffsets = Array.from({ length: 24 }, (_unused, index) => {
    const step = Math.ceil(index / 2) * Math.PI / 12;
    return index === 0 ? 0 : index % 2 === 1 ? step : -step;
  });
  const distanceScales = [1, 1.2, 1.45, 1.75, 2.1, 2.5];
  return distanceScales.flatMap((distanceScale) => angleOffsets.map((angleOffset) => ({
    x: badge.anchor.x + Math.cos(preferredAngle + angleOffset) * preferredDistance * distanceScale,
    y: badge.anchor.y + Math.sin(preferredAngle + angleOffset) * preferredDistance * distanceScale,
  })));
}

function regionalCollisionAdjustedOverlapBadges(
  svg: SVGSVGElement,
  badges: RegionalOverlapBadge[],
): RegionalOverlapBadge[] {
  const labelElements = [
    ...svg.querySelectorAll<SVGGraphicsElement>("text"),
    ...svg.querySelectorAll<SVGGraphicsElement>(".map-connection-label"),
  ];
  const labelBoxes = labelElements.flatMap((element) => {
    try {
      const box = regionalCollisionBoxForElement(svg, element);
      return box ? [expandedRegionalCollisionBox(box, 24)] : [];
    } catch {
      return [];
    }
  });
  const alertOverlayBoxes = Array.from(
    svg.querySelectorAll<SVGPathElement>(
      ".regional-overlay-segment-group .regional-impact-path",
    ),
  ).flatMap((path) => regionalPathCorridorCollisionBoxes(
    svg,
    path,
    REGIONAL_IMPACT_OVERLAY_WIDTH / 2 + 28,
  ));
  const stationAlertBoxes = Array.from(
    svg.querySelectorAll<SVGGraphicsElement>(
      ".regional-station-impact-beacon-group, .regional-station-impact-direction-glyph",
    ),
  ).flatMap((element) => {
    try {
      const box = regionalCollisionBoxForElement(svg, element);
      return box ? [expandedRegionalCollisionBox(box, 24)] : [];
    } catch {
      return [];
    }
  });
  const transitLineBoxes = Array.from(
    svg.querySelectorAll<SVGPathElement>(
      '#regional-lines-layer path[id^="regional-route-"]',
    ),
  ).flatMap((path) => regionalPathCorridorCollisionBoxes(svg, path, 112));
  const occupiedBoxes = [...labelBoxes];

  return badges.map((badge) => {
    const preferredPosition = {
      x: badge.anchor.x + badge.preferredVector.x,
      y: badge.anchor.y + badge.preferredVector.y,
    };
    const position = regionalOverlapBadgePositionCandidates(badge)
      .map((candidate) => clampRegionalOverlapBadgePosition(candidate, badge.size))
      .map((candidate) => {
        const box = expandedRegionalCollisionBox(
          regionalBadgeCollisionBox(candidate, badge.size),
          18,
        );
        const hardCollisionBoxes = [
          ...occupiedBoxes,
          ...alertOverlayBoxes,
          ...stationAlertBoxes,
        ];
        const hardOverlapArea = hardCollisionBoxes.reduce(
          (total, occupied) => total + regionalCollisionIntersectionArea(box, occupied),
          0,
        );
        const transitLineOverlapArea = transitLineBoxes.reduce(
          (total, transitLine) => total + regionalCollisionIntersectionArea(box, transitLine),
          0,
        );
        const preferredDeviation = Math.hypot(
          candidate.x - preferredPosition.x,
          candidate.y - preferredPosition.y,
        );
        const anchorDistance = Math.hypot(
          candidate.x - badge.anchor.x,
          candidate.y - badge.anchor.y,
        );
        return {
          candidate,
          box,
          score: hardOverlapArea * 1_000_000
            + transitLineOverlapArea * 10_000
            + anchorDistance
            + preferredDeviation * 0.05,
        };
      })
      .sort((left, right) => left.score - right.score)[0];
    if (!position) return badge;
    occupiedBoxes.push(position.box);
    return { ...badge, position: position.candidate };
  });
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

function continuousRegionalOverlayRunPath(
  documentNode: Document,
  run: RegionalOverlayRun,
) {
  if (run.segments.length === 1) return run.pathD;

  const stationDegree = new Map<string, number>();
  for (const segment of run.segments) {
    if (!segment.stationAId || !segment.stationBId) return null;
    stationDegree.set(segment.stationAId, (stationDegree.get(segment.stationAId) ?? 0) + 1);
    stationDegree.set(segment.stationBId, (stationDegree.get(segment.stationBId) ?? 0) + 1);
  }
  // A linear run has exactly two endpoints. Branches and cycles retain their
  // reviewed edge subpaths because no single SVG path can represent them
  // without retracing or inventing geometry.
  const endpointIds = [...stationDegree.entries()]
    .filter(([, degree]) => degree === 1)
    .map(([stationId]) => stationId);
  if (endpointIds.length !== 2 || [...stationDegree.values()].some((degree) => degree > 2)) {
    return null;
  }

  const endpointAnchor = (stationId: string) => {
    const segment = run.segments.find((candidate) => (
      candidate.stationAId === stationId || candidate.stationBId === stationId
    ));
    if (!segment) return null;
    return segment.stationAId === stationId
      ? segment.stationAAnchorId ?? null
      : segment.stationBAnchorId ?? null;
  };
  const stationAAnchorId = endpointAnchor(endpointIds[0]);
  const stationBAnchorId = endpointAnchor(endpointIds[1]);
  if (!stationAAnchorId || !stationBAnchorId) return null;

  return corridorSegmentPath(documentNode, {
    ...run.segments[0],
    stationAId: endpointIds[0],
    stationBId: endpointIds[1],
    stationAAnchorId,
    stationBAnchorId,
    guidePathId: undefined,
  });
}

function bringRegionalImpactToFront(
  root: HTMLElement,
  kind: ImpactKind,
  id: string,
) {
  root.querySelectorAll<SVGElement>(
    `.regional-overlay-segment-group[data-regional-impact-kind="${kind}"][data-regional-impact-id="${CSS.escape(id)}"]`,
  ).forEach((element) => {
    element.parentElement?.append(element);
  });
}

function bringRegionalStationImpactToFront(
  root: HTMLElement,
  kind: ImpactKind,
  id: string,
) {
  root.querySelectorAll<SVGElement>(
    `.regional-station-impact-ring[data-regional-impact-kind="${kind}"][data-regional-impact-id="${CSS.escape(id)}"]`,
  ).forEach((element) => {
    element.parentElement?.append(element);
  });
}

function regionalImpactIdentity(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const impact = target.closest<HTMLElement | SVGElement>(
    "[data-regional-impact-kind][data-regional-impact-id], [data-impact-kind][data-impact-id]",
  );
  const kind = (impact?.dataset.regionalImpactKind ?? impact?.dataset.impactKind) as ImpactKind | undefined;
  const id = impact?.dataset.regionalImpactId ?? impact?.dataset.impactId;
  return kind && id ? { kind, id } : null;
}

function regionalSegmentImpactAtClientPoint(
  root: HTMLElement,
  clientX: number,
  clientY: number,
) {
  const hitTargets = [...root.querySelectorAll<SVGGeometryElement>(
    ".regional-overlay-segment-group .regional-impact-hit-target",
  )];
  // Match SVG paint order: the last matching target is the visible/top lane.
  for (const hitTarget of hitTargets.reverse()) {
    const screenMatrix = hitTarget.getScreenCTM();
    const svg = hitTarget.ownerSVGElement;
    if (!screenMatrix || !svg || typeof hitTarget.isPointInStroke !== "function") continue;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    if (!hitTarget.isPointInStroke(point.matrixTransform(screenMatrix.inverse()))) continue;
    return regionalImpactIdentity(hitTarget);
  }
  return null;
}

function regionalStationImpactAtClientPoint(
  root: HTMLElement,
  clientX: number,
  clientY: number,
) {
  const hitShapes = [...root.querySelectorAll<SVGGeometryElement>(
    ".regional-station-impact-ring :is(circle, rect, ellipse), .regional-station-impact-ring:is(circle, rect, ellipse)",
  )];
  for (const hitShape of hitShapes.reverse()) {
    const screenMatrix = hitShape.getScreenCTM();
    const svg = hitShape.ownerSVGElement;
    if (!screenMatrix || !svg || typeof hitShape.isPointInStroke !== "function") continue;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    if (!hitShape.isPointInStroke(point.matrixTransform(screenMatrix.inverse()))) continue;
    return regionalImpactIdentity(hitShape);
  }
  return null;
}

function setRegionalImpactHoverForeground(
  root: HTMLElement,
  kind: ImpactKind,
  id: string,
  hovered: boolean,
) {
  root.querySelectorAll<SVGElement>("[data-regional-hover-impact-kind][data-regional-hover-impact-id]")
    .forEach((foreground) => {
      if (
        foreground.dataset.regionalHoverImpactKind !== kind
        || foreground.dataset.regionalHoverImpactId !== id
      ) return;
      if (hovered) {
        foreground.dataset.regionalImpactHovered = "true";
      } else {
        foreground.removeAttribute("data-regional-impact-hovered");
      }
  });
}

function setRegionalStationImpactHover(
  root: HTMLElement,
  kind: ImpactKind,
  id: string,
  hovered: boolean,
) {
  root.querySelectorAll<SVGElement>(
    `.regional-station-impact-ring[data-regional-impact-kind="${kind}"][data-regional-impact-id="${CSS.escape(id)}"]`,
  ).forEach((ring) => {
    const stationId = ring.dataset.regionalStationImpactStationId;
    if (!stationId) return;
    root.querySelectorAll<SVGElement>(
      `.regional-station-hover-indicator[data-regional-station-hover-id="${CSS.escape(stationId)}"]`,
    ).forEach((indicator) => {
      if (hovered) {
        indicator.dataset.regionalStationImpactHovered = "true";
      } else {
        indicator.removeAttribute("data-regional-station-impact-hovered");
      }
    });
  });
}

function regionalHoverMaskBounds(source: SVGElement) {
  // Hover foregrounds live inside the translated stations layer. Mask bounds
  // are therefore expressed in that layer's local coordinates, not in the
  // root SVG viewBox coordinates. Using the root values directly clipped the
  // west side of Lakeshore West's T-shaped corridor near West Harbour.
  const rootCorners = [
    { x: REGIONAL_MAP_VIEWBOX.x, y: REGIONAL_MAP_VIEWBOX.y },
    { x: REGIONAL_MAP_VIEWBOX.x + REGIONAL_MAP_VIEWBOX.width, y: REGIONAL_MAP_VIEWBOX.y },
    { x: REGIONAL_MAP_VIEWBOX.x, y: REGIONAL_MAP_VIEWBOX.y + REGIONAL_MAP_VIEWBOX.height },
    {
      x: REGIONAL_MAP_VIEWBOX.x + REGIONAL_MAP_VIEWBOX.width,
      y: REGIONAL_MAP_VIEWBOX.y + REGIONAL_MAP_VIEWBOX.height,
    },
  ];
  const localCorners = rootCorners
    .map((point) => pointFromSvgRootCoordinates(source, point))
    .filter((point): point is SvgPoint => Boolean(point));
  if (localCorners.length !== rootCorners.length) {
    return {
      x: REGIONAL_MAP_VIEWBOX.x - REGIONAL_MAP_VIEWBOX.width,
      y: REGIONAL_MAP_VIEWBOX.y - REGIONAL_MAP_VIEWBOX.height,
      width: REGIONAL_MAP_VIEWBOX.width * 3,
      height: REGIONAL_MAP_VIEWBOX.height * 3,
    };
  }
  const xValues = localCorners.map((point) => point.x);
  const yValues = localCorners.map((point) => point.y);
  const x = Math.min(...xValues);
  const y = Math.min(...yValues);
  return {
    x,
    y,
    width: Math.max(...xValues) - x,
    height: Math.max(...yValues) - y,
  };
}

function regionalSegmentHoverForeground(source: SVGElement, maskIndex: number) {
  const foreground = source.cloneNode(true) as SVGElement;
  removeDescendantIds(foreground);
  foreground.dataset.regionalHoverImpactKind = source.dataset.regionalImpactKind ?? "";
  foreground.dataset.regionalHoverImpactId = source.dataset.regionalImpactId ?? "";
  foreground.removeAttribute("data-regional-impact-id");
  foreground.removeAttribute("data-regional-impact-selected");
  foreground.classList.add("regional-impact-hover-foreground");
  // The foreground is one stable hollow outline, not a second animated copy
  // of the alert. Keeping its center transparent preserves the source colour,
  // glyphs, and icons just like TTC map hover emphasis.
  [...foreground.children].forEach((element) => {
    if (!element.classList.contains("regional-impact-hover-boundary")) element.remove();
  });
  foreground.querySelectorAll("title").forEach((element) => element.remove());
  const boundary = foreground.querySelector<SVGPathElement>(".regional-impact-hover-boundary");
  if (boundary) {
    const sourceBoundary = source.querySelector<SVGPathElement>(".regional-impact-hover-boundary");
    const maskBounds = regionalHoverMaskBounds(sourceBoundary ?? source);
    const maskId = `regional-hover-boundary-mask-${maskIndex}`;
    const mask = boundary.ownerDocument.createElementNS(SVG_NAMESPACE, "mask");
    mask.id = maskId;
    mask.setAttribute("maskUnits", "userSpaceOnUse");
    mask.setAttribute("x", String(maskBounds.x));
    mask.setAttribute("y", String(maskBounds.y));
    mask.setAttribute("width", String(maskBounds.width));
    mask.setAttribute("height", String(maskBounds.height));

    const background = boundary.ownerDocument.createElementNS(SVG_NAMESPACE, "rect");
    background.setAttribute("x", String(maskBounds.x));
    background.setAttribute("y", String(maskBounds.y));
    background.setAttribute("width", String(maskBounds.width));
    background.setAttribute("height", String(maskBounds.height));
    background.setAttribute("fill", "black");

    const maskStroke = (color: "white" | "black", width: number) => {
      const path = boundary.cloneNode(false) as SVGPathElement;
      path.removeAttribute("class");
      path.removeAttribute("style");
      path.removeAttribute("mask");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", String(width));
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      return path;
    };
    mask.append(
      background,
      maskStroke("white", REGIONAL_HIGHLIGHT_OUTLINE_WIDTH),
      maskStroke("black", REGIONAL_HIGHLIGHT_INNER_WIDTH),
    );
    const definitions = boundary.ownerDocument.createElementNS(SVG_NAMESPACE, "defs");
    definitions.append(mask);
    foreground.prepend(definitions);
    boundary.setAttribute("mask", `url(#${maskId})`);
  }
  foreground.setAttribute("aria-hidden", "true");
  foreground.setAttribute("pointer-events", "none");
  return foreground;
}

function nextRegionalPointerImpactSelection(
  root: ParentNode,
  impact: SVGElement,
  currentSelection: ImpactSelection,
): NonNullable<ImpactSelection> {
  const clicked = {
    kind: impact.dataset.regionalImpactKind as ImpactKind,
    id: impact.dataset.regionalImpactId!,
  };
  const stationId = impact.dataset.regionalStationImpactStationId;
  const segmentIds = new Set(
    (impact.dataset.regionalImpactSegmentIds ?? "").split(",").filter(Boolean),
  );
  const candidates = stationId
    ? [...root.querySelectorAll<SVGElement>(
        `.regional-station-impact-ring[data-regional-station-impact-station-id="${CSS.escape(stationId)}"]`,
      )]
    : segmentIds.size > 0
      ? [...root.querySelectorAll<SVGElement>(".regional-overlay-segment-group")]
          .filter((candidate) =>
            (candidate.dataset.regionalImpactSegmentIds ?? "")
              .split(",")
              .some((segmentId) => segmentIds.has(segmentId))
          )
      : [impact];
  const selections = [...new Map(candidates.flatMap((candidate) => {
    const kind = candidate.dataset.regionalImpactKind as ImpactKind | undefined;
    const id = candidate.dataset.regionalImpactId;
    return kind && id ? [[`${kind}:${id}`, { kind, id } as NonNullable<ImpactSelection>]] : [];
  })).values()].sort((left, right) =>
    regionalImpactPriority(left.kind) - regionalImpactPriority(right.kind)
      || left.id.localeCompare(right.id)
  );
  if (selections.length < 2) return clicked;
  const currentIndex = currentSelection
    ? selections.findIndex(
        (candidate) => candidate.kind === currentSelection.kind && candidate.id === currentSelection.id,
      )
    : -1;
  return selections[(currentIndex + 1) % selections.length] ?? clicked;
}

type Camera = { x: number; y: number; scale: number };

const RegionalSvgMarkup = memo(function RegionalSvgMarkup({ markup }: { markup: string }) {
  return <div dangerouslySetInnerHTML={{ __html: markup }} className="w-full h-full" />;
});

function regionalOverlapMarker(
  root: ParentNode,
  markerId: string,
): SVGGElement | null {
  const markerGroup = Array.from(
    root.querySelectorAll<SVGGElement>("[data-overlap-segment-id]"),
  ).find((candidate) => candidate.dataset.overlapSegmentId === markerId);
  return markerGroup?.querySelector<SVGGElement>(".overlap-indicator") ?? null;
}

function regionalReferencedAlertCollisionBoxes(
  root: ParentNode,
  badge: RegionalOverlapBadge,
  viewportRect: DOMRect,
): RegionalCollisionBox[] {
  const identityKeys = new Set(
    badge.impacts.map((impact) => `${impact.kind}:${impact.cardId}`),
  );
  return [...root.querySelectorAll<SVGPathElement>(
    ".regional-overlay-segment-group .regional-impact-path",
  )].flatMap((path) => {
    const group = path.closest<SVGElement>(".regional-overlay-segment-group");
    const kind = group?.dataset.regionalImpactKind;
    const id = group?.dataset.regionalImpactId;
    if (!kind || !id || !identityKeys.has(`${kind}:${id}`)) return [];
    const screenMatrix = path.getScreenCTM();
    if (!screenMatrix) return [];
    try {
      const length = path.getTotalLength();
      if (length <= 0) return [];
      const localRadius = REGIONAL_IMPACT_OVERLAY_WIDTH / 2 + 28;
      const screenScale = Math.max(
        Math.hypot(screenMatrix.a, screenMatrix.b),
        Math.hypot(screenMatrix.c, screenMatrix.d),
      );
      const radius = localRadius * screenScale;
      const sampleCount = Math.max(2, Math.ceil(length / (localRadius * 0.65)));
      return Array.from({ length: sampleCount + 1 }, (_unused, index) => {
        const point = path.getPointAtLength(length * index / sampleCount)
          .matrixTransform(screenMatrix);
        return {
          x: point.x - viewportRect.left - radius,
          y: point.y - viewportRect.top - radius,
          width: radius * 2,
          height: radius * 2,
        };
      });
    } catch {
      return [];
    }
  });
}

function regionalOverlapChooserLayout({
  markerCenter,
  markerSize,
  alertAnchor,
  chooserSize,
  viewportSize,
  alertCollisionBoxes,
}: {
  markerCenter: SvgPoint;
  markerSize: { width: number; height: number };
  alertAnchor: SvgPoint;
  chooserSize: { width: number; height: number };
  viewportSize: { width: number; height: number };
  alertCollisionBoxes: RegionalCollisionBox[];
}): MapOverlapChooserLayout {
  const margin = 16;
  const outwardLength = Math.hypot(
    markerCenter.x - alertAnchor.x,
    markerCenter.y - alertAnchor.y,
  ) || 1;
  const outward = {
    x: (markerCenter.x - alertAnchor.x) / outwardLength,
    y: (markerCenter.y - alertAnchor.y) / outwardLength,
  };
  const centerForDirection = (direction: SvgPoint) => {
    const markerExtent = Math.abs(direction.x) * markerSize.width / 2
      + Math.abs(direction.y) * markerSize.height / 2;
    const chooserExtent = Math.abs(direction.x) * chooserSize.width / 2
      + Math.abs(direction.y) * chooserSize.height / 2;
    const distance = markerExtent + REGIONAL_OVERLAP_CHOOSER_GAP + chooserExtent;
    return {
      x: markerCenter.x + direction.x * distance,
      y: markerCenter.y + direction.y * distance,
    };
  };
  const clampCenter = (center: SvgPoint) => ({
    x: Math.min(
      viewportSize.width - margin - chooserSize.width / 2,
      Math.max(margin + chooserSize.width / 2, center.x),
    ),
    y: Math.min(
      viewportSize.height - margin - chooserSize.height / 2,
      Math.max(margin + chooserSize.height / 2, center.y),
    ),
  });
  const outwardAngle = Math.atan2(outward.y, outward.x);
  const angleOffsets = Array.from({ length: 24 }, (_unused, index) => {
    const step = Math.ceil(index / 2) * Math.PI / 12;
    return index === 0 ? 0 : index % 2 === 1 ? step : -step;
  });
  const distanceScales = [1, 1.25, 1.55, 1.9, 2.3];
  const preferredCenter = centerForDirection(outward);
  const markerBox: RegionalCollisionBox = {
    x: markerCenter.x - markerSize.width / 2,
    y: markerCenter.y - markerSize.height / 2,
    width: markerSize.width,
    height: markerSize.height,
  };
  const center = distanceScales.flatMap((distanceScale) => angleOffsets.map((angleOffset) => {
    const direction = {
      x: Math.cos(outwardAngle + angleOffset),
      y: Math.sin(outwardAngle + angleOffset),
    };
    const baseCenter = centerForDirection(direction);
    return clampCenter({
      x: markerCenter.x + (baseCenter.x - markerCenter.x) * distanceScale,
      y: markerCenter.y + (baseCenter.y - markerCenter.y) * distanceScale,
    });
  })).map((candidate) => {
    const box = expandedRegionalCollisionBox({
      x: candidate.x - chooserSize.width / 2,
      y: candidate.y - chooserSize.height / 2,
      width: chooserSize.width,
      height: chooserSize.height,
    }, 8);
    const alertOverlapArea = alertCollisionBoxes.reduce(
      (total, alertBox) => total + regionalCollisionIntersectionArea(box, alertBox),
      0,
    );
    const markerOverlapArea = regionalCollisionIntersectionArea(box, markerBox);
    const preferredDeviation = Math.hypot(
      candidate.x - preferredCenter.x,
      candidate.y - preferredCenter.y,
    );
    return {
      candidate,
      score: alertOverlapArea * 1_000_000
        + markerOverlapArea * 1_000_000
        + preferredDeviation,
    };
  }).sort((left, right) => left.score - right.score)[0]?.candidate ?? clampCenter(preferredCenter);
  const left = center.x - chooserSize.width / 2;
  const top = center.y - chooserSize.height / 2;
  return {
    left,
    top,
    anchorOffsetX: markerCenter.x - left,
    anchorOffsetY: markerCenter.y - top,
  };
}

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
  layoutResetSignal,
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
  layoutResetSignal?: number;
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
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures, networkSegments, stationNodeImpacts } = useDashboardData();
  const regionalMapRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const mapStageRef = useRef<HTMLDivElement>(null);
  const cameraInitializedRef = useRef(false);
  const cameraAdjustedByUserRef = useRef(false);
  const lastRecenterSignalRef = useRef(recenterSignal);
  const lastViewportOrientationRef = useRef(viewportOrientation);
  const automaticResizeRefitBlockedRef = useRef(false);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; camera: Camera } | null>(null);
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchGestureRef = useRef<{
    startDistance: number;
    startScale: number;
    mapPointAtMidpoint: { x: number; y: number };
  } | null>(null);
  const [svgMarkup, setSvgMarkup] = useState("");
  const [overlapBadges, setOverlapBadges] = useState<RegionalOverlapBadge[]>([]);
  const overlapBadgePositionsRef = useRef(new Map<string, SvgPoint>());
  const [expandedOverlapBadgeId, setExpandedOverlapBadgeId] = useState<string | null>(null);
  const [overlapChooserLayout, setOverlapChooserLayout] = useState<MapOverlapChooserLayout | null>(null);
  const [overlapChooserSize, setOverlapChooserSize] = useState<{ width: number; height: number } | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const [cameraReady, setCameraReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isGestureActive, setIsGestureActive] = useState(false);
  const [fitScale, setFitScale] = useState(0.35);
  const [desktopMapTopInset, setDesktopMapTopInset] = useState(0);
  const [desktopMapBottomInset, setDesktopMapBottomInset] = useState(0);

  useEffect(() => {
    automaticResizeRefitBlockedRef.current = Boolean(selection || selectedStationId || commutePathPreview);
  }, [commutePathPreview, selectedStationId, selection]);
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
  const selectionRef = useRef(selection);
  const selectedStationIdRef = useRef(selectedStationId);
  const selectionAttentionKeyRef = useRef<string | null>(null);
  const selectionIntroCompletedRef = useRef(false);
  const selectionIntroTimerRef = useRef<number | null>(null);
  const hoveredMapImpactRef = useRef<ReturnType<typeof regionalImpactIdentity>>(null);
  const externallyHoveredImpactKeysRef = useRef(new Set<string>());
  const readyNotifiedRef = useRef(false);
  const entranceWasDeferredRef = useRef(false);
  const lastFocusedTargetKeyRef = useRef<string | null>(null);
  const lastFocusLayoutKeyRef = useRef("");
  const shouldAnimateProgrammaticTransform = !reducedMotion && !mobilePerformanceMode;

  useLayoutEffect(() => {
    selectionRef.current = selection;
    selectedStationIdRef.current = selectedStationId;
  }, [selectedStationId, selection]);

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

  const setCameraMotionActive = useCallback((active: boolean) => {
    const root = regionalMapRef.current;
    if (!root) return;
    root.classList.toggle("regional-map-camera-moving", active);
    root.dataset.regionalMapCameraMoving = active ? "true" : "false";
  }, []);

  const beginCameraMotion = useCallback(() => {
    setCameraMotionActive(true);
  }, [setCameraMotionActive]);

  const endCameraMotion = useCallback(() => {
    setCameraMotionActive(false);
  }, [setCameraMotionActive]);

  const clearProgrammaticAnimation = useCallback(() => {
    if (programmaticAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(programmaticAnimationFrameRef.current);
      programmaticAnimationFrameRef.current = null;
    }
    if (animTimeoutRef.current !== null) {
      window.clearTimeout(animTimeoutRef.current);
      animTimeoutRef.current = null;
    }
    if (wheelCommitTimeoutRef.current !== null) {
      window.clearTimeout(wheelCommitTimeoutRef.current);
      wheelCommitTimeoutRef.current = null;
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
      endCameraMotion();
      return;
    }

    beginCameraMotion();
    setMapTransition("transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)");
    programmaticAnimationFrameRef.current = window.requestAnimationFrame(() => {
      programmaticAnimationFrameRef.current = null;
      writeMapTransform(targetCamera);
      animTimeoutRef.current = window.setTimeout(() => {
        animTimeoutRef.current = null;
        setMapTransition("none");
        if (nextFitScale !== undefined) setFitScale(nextFitScale);
        setCamera({ ...cameraRef.current });
        endCameraMotion();
      }, 850);
    });
  }, [beginCameraMotion, clearProgrammaticAnimation, endCameraMotion, setMapTransition, shouldAnimateProgrammaticTransform, writeMapTransform]);

  useEffect(() => {
    return () => {
      clearProgrammaticAnimation();
      if (dragAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(dragAnimationFrameRef.current);
      }
      if (wheelCommitTimeoutRef.current !== null) {
        window.clearTimeout(wheelCommitTimeoutRef.current);
      }
      endCameraMotion();
    };
  }, [clearProgrammaticAnimation, endCameraMotion]);

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

  const refitUntouchedNetwork = useCallback(() => {
    if (!cameraInitializedRef.current || cameraAdjustedByUserRef.current) return;
    const fitted = fittedCamera();
    if (!fitted) return;
    clearProgrammaticAnimation();
    setMapTransition("none");
    cameraRef.current = fitted.camera;
    writeMapTransform(fitted.camera);
    setFitScale(fitted.scale);
    setCamera(fitted.camera);
  }, [clearProgrammaticAnimation, fittedCamera, setMapTransition, writeMapTransform]);

  const handleFitNetwork = useCallback(() => {
    cameraAdjustedByUserRef.current = false;
    fitNetwork();
  }, [fitNetwork]);

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
    fetch(`/assets/linewatch/regional-rail-map.svg?v=${lineWatchBuildLabel}`)
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
          hoverIndicator.dataset.regionalStationHoverId = stationId;
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

          // Junction groups can carry authored transforms (Bloor is rotated,
          // Mount Dennis is translated). Keep that authored transform on an
          // inert outer wrapper so the animated inner artwork retains the exact
          // local geometry and intro motion used by the original station marker.
          const selectedIndicatorContainer = element.matches("g")
            ? documentNode.createElementNS(SVG_NAMESPACE, "g")
            : null;
          const selectedIndicator = element.cloneNode(true) as SVGElement;
          if (element.matches("g")) {
            const authoredTransform = selectedIndicator.getAttribute("transform");
            selectedIndicator.removeAttribute("transform");
            if (authoredTransform) selectedIndicatorContainer?.setAttribute("transform", authoredTransform);
            selectedIndicatorContainer?.append(selectedIndicator);
          }
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
          element.after(selectedIndicatorContainer ?? selectedIndicator);
          element.classList.add("regional-station-visual");
        }
        // The authored map and station interaction geometry are immutable after
        // this preparation pass. Dashboard refreshes update only the purpose-built
        // dynamic layers below, so Chromium never has to discard and reraster the
        // complete regional SVG just because an alert snapshot changed.
        for (const element of documentNode.querySelectorAll<SVGElement>("[style]")) {
          element.style.removeProperty("shape-rendering");
          element.style.removeProperty("text-rendering");
          element.style.removeProperty("image-rendering");
        }
        for (const element of documentNode.querySelectorAll<SVGElement>("g")) {
          const authoredLabel = element.getAttributeNS(
            "http://www.inkscape.org/namespaces/inkscape",
            "label",
          ) ?? element.getAttribute("inkscape:label") ?? "";
          if (authoredLabel.startsWith("via-rail-") || authoredLabel.endsWith("airport-icon")) {
            element.classList.add("map-connection-label");
          }
          if (authoredLabel.endsWith("airport-icon")) {
            element.classList.add("map-connection-airport");
          }
        }
        const stationsLayer = documentNode.getElementById("regional-stations-layer");
        if (!stationsLayer) throw new Error("Regional station layer unavailable");
        const createLayer = (id: string, className?: string) => {
          const layer = documentNode.createElementNS(SVG_NAMESPACE, "g");
          layer.id = id;
          if (className) layer.classList.add(className);
          return layer;
        };
        const firstStationTarget = stationsLayer.querySelector(".regional-station-hit-target");
        const segmentLayer = createLayer(REGIONAL_DYNAMIC_SEGMENT_LAYER_ID);
        const stationRingLayer = createLayer(REGIONAL_DYNAMIC_STATION_RING_LAYER_ID);
        const commuteLayer = createLayer(REGIONAL_DYNAMIC_COMMUTE_LAYER_ID);
        const hoverLayer = createLayer(REGIONAL_DYNAMIC_HOVER_LAYER_ID, "regional-impact-hover-foreground-layer");
        hoverLayer.setAttribute("aria-hidden", "true");
        hoverLayer.setAttribute("pointer-events", "none");
        stationsLayer.insertBefore(segmentLayer, firstStationTarget);
        stationsLayer.insertBefore(stationRingLayer, firstStationTarget);
        stationsLayer.insertBefore(commuteLayer, firstStationTarget);
        stationsLayer.insertBefore(hoverLayer, firstStationTarget);

        const markerLayer = createLayer(REGIONAL_TRAIN_MARKER_LAYER_ID, "estimated-train-marker-layer");
        markerLayer.classList.add("regional-estimated-train-marker-layer");
        markerLayer.setAttribute("aria-label", "Estimated regional train markers");
        markerLayer.setAttribute("pointer-events", "none");
        stationsLayer.append(markerLayer);

        const effectsLayer = createLayer(REGIONAL_DYNAMIC_EFFECTS_LAYER_ID, "regional-station-impact-effects-layer");
        effectsLayer.setAttribute("aria-label", "Station alert beacons and directions");
        effectsLayer.setAttribute("pointer-events", "none");
        effectsLayer.style.setProperty("--map-pulse-offset", "0s");
        stationsLayer.append(effectsLayer);
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
  }, []);

  useLayoutEffect(() => {
    if (!svgMarkup) return;
    const svg = viewportRef.current?.querySelector<SVGSVGElement>(
      'svg[aria-label="GO and UP regional rail schematic"]',
    );
    if (!svg) return;

    const documentNode = svg.ownerDocument;
    const segmentLayer = svg.querySelector<SVGGElement>(`#${REGIONAL_DYNAMIC_SEGMENT_LAYER_ID}`);
    const stationRingLayer = svg.querySelector<SVGGElement>(`#${REGIONAL_DYNAMIC_STATION_RING_LAYER_ID}`);
    const commuteLayer = svg.querySelector<SVGGElement>(`#${REGIONAL_DYNAMIC_COMMUTE_LAYER_ID}`);
    const hoverLayer = svg.querySelector<SVGGElement>(`#${REGIONAL_DYNAMIC_HOVER_LAYER_ID}`);
    const effectsLayer = svg.querySelector<SVGGElement>(`#${REGIONAL_DYNAMIC_EFFECTS_LAYER_ID}`);
    if (!segmentLayer || !stationRingLayer || !commuteLayer || !hoverLayer || !effectsLayer) return;

    segmentLayer.replaceChildren();
    stationRingLayer.replaceChildren();
    commuteLayer.replaceChildren();
    hoverLayer.replaceChildren();
    effectsLayer.replaceChildren();

    const stationImpactBeaconLayer = documentNode.createElementNS(SVG_NAMESPACE, "g");
    stationImpactBeaconLayer.classList.add("regional-station-impact-beacon-layer");
    const stationImpactDirectionLayer = documentNode.createElementNS(SVG_NAMESPACE, "g");
    stationImpactDirectionLayer.classList.add("regional-station-impact-direction-layer");

    const stationOnlyImpactIds = new Set(stationNodeImpacts.map((impact) => impact.cardId));
    for (const alert of activeAlerts.filter(
      (item) => item.affectedSegmentIds.length === 0 && !stationOnlyImpactIds.has(item.id)
    )) {
      const pathD = authoredRegionalCorridorPathData(documentNode, alert.lineId);
      if (!pathD) continue;
      const overlaySource = documentNode.createElementNS(SVG_NAMESPACE, "path");
      overlaySource.setAttribute("style", "display:inline");
      overlaySource.setAttribute("d", pathD);
      const kind = alert.severity === "planned" ? "planned-closure" : alert.severity;
      segmentLayer.append(regionalImpactGroup(documentNode, overlaySource, {
        impactId: alert.id,
        kind,
        label: `${alert.lineNumber} ${alert.title}`,
        reducedMotion,
      }));
    }

    const overlayPieces: RegionalOverlayPiece[] = [];
    for (const segment of networkSegments.filter((item) => (item.impacts?.length ?? 0) > 0)) {
      const resolvedPathD = resolvedRegionalSegmentPath(documentNode, segment);
      if (!resolvedPathD) continue;
      for (const [impactIndex, impact] of (segment.impacts ?? []).entries()) {
        overlayPieces.push({ segment, impact, impactIndex, pathD: resolvedPathD });
      }
    }
    const orderedOverlayRuns = regionalOverlayRuns(overlayPieces).sort((left, right) => (
      regionalImpactPriority(left.impact.kind) - regionalImpactPriority(right.impact.kind)
      || left.impact.cardId.localeCompare(right.impact.cardId)
    ));
    for (const run of orderedOverlayRuns) {
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
          : continuousRegionalOverlayRunPath(documentNode, run) ?? run.pathD,
      );
      const firstSegment = run.segments[0];
      const lastSegment = run.segments.at(-1) ?? firstSegment;
      const startLabel = firstSegment.label.split(" to ")[0];
      const endLabel = lastSegment.label.split(" to ").at(-1) ?? lastSegment.label;
      segmentLayer.append(regionalImpactGroup(documentNode, overlaySource, {
        impactId: run.impact.cardId,
        kind: run.impact.kind,
        label: `${startLabel} to ${endLabel} ${run.impact.kind} impact`,
        segmentCount: run.segments.length,
        segmentIds: run.segments.map((segment) => segment.id),
        travelDirection: run.impact.travelDirection,
        reducedMotion,
      }));
    }

    const directionData = { activeAlerts, delays, reducedSpeedZones, plannedClosures };
    for (const [impactIndex, impact] of stationNodeImpacts.entries()) {
      const stationVisual = svg.querySelector<SVGElement>(`#station-${CSS.escape(impact.stationId)}`);
      if (!stationVisual) continue;
      const impactDirection = stationImpactDirectionForImpact(impact, directionData);
      const impactAnchors = regionalStationImpactAnchors(stationVisual, impactDirection?.lineId);
      const routeCode = impactDirection?.lineId.startsWith("regional-")
        ? impactDirection.lineId.slice("regional-".length)
        : null;

      const ring = stationVisual.cloneNode(true) as SVGElement;
      ring.dataset.regionalImpactKind = impact.kind;
      ring.dataset.regionalImpactId = impact.cardId;
      ring.dataset.regionalStationImpactStationId = impact.stationId;
      ring.classList.add("station-impact-ring", "regional-station-impact-ring", "map-selection-attention", `regional-station-impact-ring--${impact.kind}`);
      ring.style.setProperty("--regional-impact-color", regionalImpactColor(impact.kind));
      ring.style.setProperty("--regional-station-impact-width", `${65 + impactIndex * 20}px`);
      ring.style.setProperty("--map-pulse-offset", "0s");
      ring.setAttribute("role", "button");
      ring.setAttribute("tabindex", "0");
      ring.setAttribute("aria-label", impact.title);
      const shapes = ring.matches("circle, rect, ellipse")
        ? [ring]
        : [...ring.querySelectorAll<SVGElement>("circle, rect, ellipse")];
      for (const shape of shapes) {
        if (shape.getAttribute("inkscape:label") === "join-rectangle") {
          shape.remove();
          continue;
        }
        if (
          routeCode
          && shape.id.startsWith("station-")
          && shape.id !== stationVisual.id
          && !shape.id.endsWith(`-${routeCode}`)
        ) {
          shape.remove();
          continue;
        }
        shape.setAttribute("style", "fill:transparent;pointer-events:stroke");
      }
      removeDescendantIds(ring);
      stationRingLayer.append(ring);

      for (const { id: anchorId, point: anchorPoint, radius: stationDotRadius } of impactAnchors) {
        const effectRadius = stationDotRadius * REGIONAL_STATION_IMPACT_EFFECT_RADIUS_RATIO;
        const badgeRadius = stationDotRadius * REGIONAL_STATION_IMPACT_BADGE_RADIUS_RATIO;
        const beaconGroup = documentNode.createElementNS(SVG_NAMESPACE, "g");
        beaconGroup.classList.add("regional-station-impact-beacon-group");
        beaconGroup.dataset.regionalStationImpactKind = impact.kind;
        beaconGroup.dataset.regionalStationImpactId = impact.cardId;
        beaconGroup.dataset.regionalStationImpactAnchorId = anchorId;
        beaconGroup.setAttribute("pointer-events", "none");

        const glowCircle = documentNode.createElementNS(SVG_NAMESPACE, "circle");
        glowCircle.classList.add("station-impact-dot-red-glow", "regional-station-impact-beacon-glow");
        glowCircle.setAttribute("cx", String(anchorPoint.x));
        glowCircle.setAttribute("cy", String(anchorPoint.y));
        glowCircle.setAttribute("r", String(effectRadius));
        const pingCircle = documentNode.createElementNS(SVG_NAMESPACE, "circle");
        pingCircle.classList.add("station-impact-dot-red-ping", "regional-station-impact-beacon-ping");
        pingCircle.setAttribute("cx", String(anchorPoint.x));
        pingCircle.setAttribute("cy", String(anchorPoint.y));
        pingCircle.setAttribute("r", String(effectRadius));
        const beaconCircle = documentNode.createElementNS(SVG_NAMESPACE, "circle");
        beaconCircle.classList.add("station-impact-dot-red-beacon", "regional-station-impact-beacon-core");
        beaconCircle.setAttribute("cx", String(anchorPoint.x));
        beaconCircle.setAttribute("cy", String(anchorPoint.y));
        beaconCircle.setAttribute("r", String(effectRadius));
        beaconGroup.append(glowCircle, pingCircle, beaconCircle);
        stationImpactBeaconLayer.append(beaconGroup);

        if (impactDirection?.arrow) {
          const glyphGroup = documentNode.createElementNS(SVG_NAMESPACE, "g");
          glyphGroup.classList.add("station-impact-direction-glyph", "regional-station-impact-direction-glyph");
          glyphGroup.dataset.regionalStationImpactKind = impact.kind;
          glyphGroup.dataset.regionalStationImpactId = impact.cardId;
          glyphGroup.dataset.regionalStationImpactAnchorId = anchorId;
          glyphGroup.setAttribute("pointer-events", "none");
          glyphGroup.setAttribute("transform", `translate(${anchorPoint.x} ${anchorPoint.y})`);
          const badgeCircle = documentNode.createElementNS(SVG_NAMESPACE, "circle");
          badgeCircle.classList.add("station-impact-direction-badge");
          badgeCircle.setAttribute("r", String(badgeRadius));
          const arrowPath = documentNode.createElementNS(SVG_NAMESPACE, "path");
          arrowPath.classList.add("station-impact-direction-arrow");
          arrowPath.setAttribute("d", stationImpactDirectionPath(impactDirection.arrow.direction, badgeRadius));
          glyphGroup.append(badgeCircle, arrowPath);
          stationImpactDirectionLayer.append(glyphGroup);
        }
      }
    }
    effectsLayer.append(stationImpactBeaconLayer, stationImpactDirectionLayer);

    if (commutePathPreview) {
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
      const endpointStationIds = [
        commutePathPreview.stationIds[0],
        commutePathPreview.stationIds.at(-1),
      ].filter((stationId): stationId is string => Boolean(stationId));
      for (const [index, stationId] of endpointStationIds.entries()) {
        const endpointSegment = commutePathPreview.segmentIds
          .map((segmentId) => networkSegments.find((item) => item.id === segmentId))
          .find((segment) => segment?.stationAId === stationId || segment?.stationBId === stationId);
        const anchorId = endpointSegment?.stationAId === stationId
          ? endpointSegment.stationAAnchorId
          : endpointSegment?.stationBAnchorId;
        const anchorElement = anchorId
          ? documentNode.getElementById(anchorId) as SVGElement | null
          : null;
        const anchor = anchorElement
          ? regionalStationVisualAnchors(anchorElement)[0]
          : null;
        const point = anchor?.point ?? svgAnchorPoint(documentNode, anchorId);
        if (!point) continue;
        const endpoint = documentNode.createElementNS(SVG_NAMESPACE, "circle");
        endpoint.classList.add(
          "station-commute-green-flash",
          "regional-commute-path-preview-endpoint",
        );
        endpoint.dataset.commutePathEndpoint = index === 0 ? "origin" : "destination";
        endpoint.setAttribute("cx", String(point.x));
        endpoint.setAttribute("cy", String(point.y));
        endpoint.setAttribute("r", String(Math.max(72, Math.min(110, (anchor?.radius ?? 52) * 1.15))));
        previewLayer.append(endpoint);
      }
      commuteLayer.append(previewLayer);
    }

    segmentLayer.querySelectorAll<SVGElement>(".regional-overlay-segment-group")
      .forEach((source, index) => hoverLayer.append(regionalSegmentHoverForeground(source, index)));

    const currentSelectedStationId = selectedStationIdRef.current;
    const currentSelection = selectionRef.current;
    if (currentSelectedStationId) {
      svg.querySelector(`[data-regional-station-selection-id="${CSS.escape(currentSelectedStationId)}"]`)
        ?.setAttribute("data-regional-station-selected", "true");
    }
    if (currentSelection) {
      svg.querySelectorAll(
        `[data-regional-impact-kind="${currentSelection.kind}"][data-regional-impact-id="${CSS.escape(currentSelection.id)}"]`,
      ).forEach((element) => element.setAttribute("data-regional-impact-selected", "true"));
      const viewport = viewportRef.current;
      if (viewport) {
        bringRegionalImpactToFront(viewport, currentSelection.kind, currentSelection.id);
        bringRegionalStationImpactToFront(viewport, currentSelection.kind, currentSelection.id);
      }
    }
    if (selectionIntroCompletedRef.current) {
      markCompletedSelectionIntro(svg);
    }

    const badges = regionalOverlapBadges(documentNode, networkSegments).map((badge) => ({
      ...badge,
      position: overlapBadgePositionsRef.current.get(badge.markerId) ?? badge.position,
    }));
    const adjusted = regionalCollisionAdjustedOverlapBadges(svg, badges);
    overlapBadgePositionsRef.current = new Map(
      adjusted.map((badge) => [badge.markerId, badge.position]),
    );
    setOverlapBadges(adjusted);
  }, [
    activeAlerts,
    commutePathPreview,
    delays,
    networkSegments,
    plannedClosures,
    reducedMotion,
    reducedSpeedZones,
    stationNodeImpacts,
    svgMarkup,
  ]);

  useLayoutEffect(() => {
    const markerLayer = viewportRef.current?.querySelector<SVGGElement>(
      ".regional-estimated-train-marker-layer",
    );
    if (!markerLayer) return;
    const existingMarkersByKey = new Map(
      [...markerLayer.querySelectorAll<SVGGElement>(":scope > .estimated-train-marker")]
        .map((group) => [group.dataset.markerKey ?? "", group]),
    );
    if (!estimatedTrainsEnabled) {
      existingMarkersByKey.forEach((group) => group.remove());
      return;
    }

    const documentNode = markerLayer.ownerDocument;
    for (const marker of estimatedTrainMarkers) {
      const segment = networkSegments.find((item) => item.id === marker.segmentId);
      if (!segment) continue;
      const frame = regionalTrainMarkerFrame(documentNode, segment, marker);
      if (!frame) continue;
      const markerKey = estimatedTrainMarkerRenderKey(marker);
      const existingGroup = existingMarkersByKey.get(markerKey);
      const group = existingGroup ?? documentNode.createElementNS(SVG_NAMESPACE, "g");
      group.setAttribute("class", `estimated-train-marker estimated-train-marker-${marker.lineId}`);
      group.setAttribute("data-marker-key", markerKey);
      group.setAttribute("data-train-marker-id", marker.id);
      group.setAttribute("data-train-marker-line-id", marker.lineId);
      group.setAttribute("data-train-marker-direction", marker.direction);
      group.setAttribute("data-train-marker-segment-id", marker.segmentId);
      group.setAttribute("data-train-marker-travel-direction", marker.travelDirection);
      group.setAttribute(
        "transform",
        `translate(${frame.point.x} ${frame.point.y}) rotate(${frame.angle}) scale(1.8)`,
      );
      const title = group.querySelector("title")
        ?? documentNode.createElementNS(SVG_NAMESPACE, "title");
      title.textContent = `${marker.lineId.replace("regional-", "").toUpperCase()} toward ${marker.direction}; schematic estimated position`;
      if (!existingGroup) {
        group.append(title);
        appendRegionalTrainMarkerGlyph(documentNode, group);
      }
      markerLayer.append(group);
      existingMarkersByKey.delete(markerKey);
    }
    existingMarkersByKey.forEach((group) => group.remove());
  }, [estimatedTrainMarkers, estimatedTrainsEnabled, networkSegments, svgMarkup]);

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
    handleFitNetwork();
  }, [handleFitNetwork, recenterSignal]);

  useEffect(() => {
    if (lastViewportOrientationRef.current === viewportOrientation) return;
    lastViewportOrientationRef.current = viewportOrientation;
    if (!cameraInitializedRef.current) return;
    cameraAdjustedByUserRef.current = false;
    const frame = window.requestAnimationFrame(handleFitNetwork);
    return () => window.cancelAnimationFrame(frame);
  }, [handleFitNetwork, viewportOrientation]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (!cameraInitializedRef.current) {
        initializeMapCamera();
        return;
      }
    });
    observer.observe(viewport);
    const mapSurface = viewport.closest<HTMLElement>(".network-map-transition-surface");
    if (mapSurface) observer.observe(mapSurface);
    return () => observer.disconnect();
  }, [initializeMapCamera]);

  useEffect(() => {
    const handleWindowResize = () => {
      if (automaticResizeRefitBlockedRef.current) return;
      refitUntouchedNetwork();
    };
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [refitUntouchedNetwork]);

  useEffect(() => {
    const root = viewportRef.current;
    root?.querySelectorAll("[data-regional-station-selected]").forEach((element) => element.removeAttribute("data-regional-station-selected"));
    if (selectedStationId) {
      const indicator = root?.querySelector(
        `[data-regional-station-selection-id="${CSS.escape(selectedStationId)}"]`,
      );
      indicator?.setAttribute("data-regional-station-selected", "true");
    }
    if (root && selectionIntroCompletedRef.current) {
      markCompletedSelectionIntro(root);
    }
  }, [selectedStationId, svgMarkup]);

  useLayoutEffect(() => {
    const root = viewportRef.current;
    root?.querySelectorAll("[data-regional-impact-selected]").forEach((element) => element.removeAttribute("data-regional-impact-selected"));
    if (selection) {
      root?.querySelectorAll(`[data-regional-impact-kind="${selection.kind}"][data-regional-impact-id="${CSS.escape(selection.id)}"]`)
        .forEach((element) => {
          element.setAttribute("data-regional-impact-selected", "true");
        });
      if (root) {
        bringRegionalImpactToFront(root, selection.kind, selection.id);
        bringRegionalStationImpactToFront(root, selection.kind, selection.id);
        if (selectionIntroCompletedRef.current) {
          markCompletedSelectionIntro(root);
        }
      }
    }
  }, [selection, svgMarkup]);

  useLayoutEffect(() => {
    const nextKey = selection
      ? `${selection.kind}:${selection.id}`
      : selectedStationId
        ? `station:${selectedStationId}`
        : null;
    if (selectionAttentionKeyRef.current === nextKey) return;

    selectionAttentionKeyRef.current = nextKey;
    selectionIntroCompletedRef.current = false;
    if (selectionIntroTimerRef.current !== null) {
      window.clearTimeout(selectionIntroTimerRef.current);
      selectionIntroTimerRef.current = null;
    }

    const root = viewportRef.current;
    root?.querySelectorAll(".selection-intro-complete")
      .forEach((element) => element.classList.remove("selection-intro-complete"));
    if (!nextKey) return;

    selectionIntroTimerRef.current = window.setTimeout(() => {
      selectionIntroTimerRef.current = null;
      if (selectionAttentionKeyRef.current !== nextKey) return;
      selectionIntroCompletedRef.current = true;
      const currentRoot = viewportRef.current;
      if (currentRoot) markCompletedSelectionIntro(currentRoot);
    }, SELECTION_INTRO_DURATION_MS);
  }, [selectedStationId, selection]);

  useEffect(() => () => {
    if (selectionIntroTimerRef.current !== null) {
      window.clearTimeout(selectionIntroTimerRef.current);
    }
  }, []);

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
    const targetScale = Math.min(
      clampPanZoomScale(preferredTargetScale, fitScale),
      selectionFit.scale * REGIONAL_SELECTION_FIT_COMFORT_RATIO,
    );
    const { focusX: baseFocusX, focusY: baseFocusY } = computeInsetViewportFocus(
      viewport.clientWidth,
      viewport.clientHeight,
      focusInsets,
    );
    const focusX = baseFocusX;
    const focusY =
      viewportOrientation === "rotated-landscape"
        ? viewport.clientHeight * 0.34
        : baseFocusY;

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
    const layoutKey = `${layoutResetSignal ?? 0}:${desktopMenuPinned ? "pinned" : "free"}:${desktopMapTopInset}:${desktopMapBottomInset}:${viewportOrientation}`;

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
    layoutResetSignal,
    preserveCameraOnSelectionClear,
    svgMarkup,
    viewportOrientation,
  ]);

  const scheduleCameraCommit = useCallback(() => {
    if (wheelCommitTimeoutRef.current !== null) {
      window.clearTimeout(wheelCommitTimeoutRef.current);
    }
    wheelCommitTimeoutRef.current = window.setTimeout(() => {
      wheelCommitTimeoutRef.current = null;
      setCamera({ ...cameraRef.current });
      endCameraMotion();
    }, 140);
  }, [endCameraMotion]);

  const zoomAtCenter = useCallback((factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    cameraAdjustedByUserRef.current = true;
    clearProgrammaticAnimation();
    beginCameraMotion();
    setMapTransition(shouldAnimateProgrammaticTransform ? "transform 0.1s ease-out" : "none");
    const centerX = viewport.clientWidth / 2;
    const centerY = viewport.clientHeight / 2;
    const current = cameraRef.current;
    const nextScale = clampPanZoomScale(current.scale * factor, fitScale);
    const ratio = nextScale / current.scale;
    const nextCamera = snapCameraToDevicePixels({
      x: centerX - (centerX - current.x) * ratio,
      y: centerY - (centerY - current.y) * ratio,
      scale: nextScale,
    });
    cameraRef.current = nextCamera;
    writeMapTransform(nextCamera);
    scheduleCameraCommit();
  }, [beginCameraMotion, clearProgrammaticAnimation, fitScale, scheduleCameraCommit, setMapTransition, shouldAnimateProgrammaticTransform, writeMapTransform]);

  const zoomToScale = useCallback((targetRelativeScale: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    cameraAdjustedByUserRef.current = true;
    clearProgrammaticAnimation();
    beginCameraMotion();
    setMapTransition(shouldAnimateProgrammaticTransform ? "transform 0.1s ease-out" : "none");
    const centerX = viewport.clientWidth / 2;
    const centerY = viewport.clientHeight / 2;
    const current = cameraRef.current;
    const nextScale = clampPanZoomScale(targetRelativeScale * fitScale, fitScale);
    const ratio = nextScale / current.scale;
    const nextCamera = snapCameraToDevicePixels({
      x: centerX - (centerX - current.x) * ratio,
      y: centerY - (centerY - current.y) * ratio,
      scale: nextScale,
    });
    cameraRef.current = nextCamera;
    writeMapTransform(nextCamera);
    scheduleCameraCommit();
  }, [beginCameraMotion, clearProgrammaticAnimation, fitScale, scheduleCameraCommit, setMapTransition, shouldAnimateProgrammaticTransform, writeMapTransform]);

  const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;
    cameraAdjustedByUserRef.current = true;

    clearProgrammaticAnimation();
    beginCameraMotion();
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
      endCameraMotion();
    }, 80);
  }, [beginCameraMotion, clearProgrammaticAnimation, endCameraMotion, fitScale, setMapTransition, viewportOrientation, writeMapTransform]);

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
    beginCameraMotion();
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
            selection: nextRegionalPointerImpactSelection(
              event.currentTarget,
              impact,
              selection,
            ),
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
      cameraAdjustedByUserRef.current = true;
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
  }, [beginCameraMotion, cancelCameraAnimation, selection, viewportOrientation]);

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
      cameraAdjustedByUserRef.current = true;
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
    endCameraMotion();
  }, [applyActiveGesture, endCameraMotion, onSelectImpact, onSelectStationId]);

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
    const impact = regionalImpactIdentity(target);
    const root = viewportRef.current;
    if (!root || !impact) return;
    const { kind, id } = impact;
    setRegionalImpactHoverForeground(root, kind, id, hovered);
    setRegionalStationImpactHover(root, kind, id, hovered);
  }, []);

  const setRegionalOverlapImpactsHovered = useCallback((
    impacts: MapImpact[],
    hovered: boolean,
  ) => {
    const root = viewportRef.current;
    if (!root) return;
    for (const impact of impacts) {
      const key = `${impact.kind}:${impact.cardId}`;
      if (hovered) {
        externallyHoveredImpactKeysRef.current.add(key);
      } else {
        externallyHoveredImpactKeysRef.current.delete(key);
      }
      const mapImpact = hoveredMapImpactRef.current;
      const shouldRemainHovered = hovered || (
        mapImpact?.kind === impact.kind && mapImpact.id === impact.cardId
      );
      setRegionalImpactHoverForeground(root, impact.kind, impact.cardId, shouldRemainHovered);
      setRegionalStationImpactHover(root, impact.kind, impact.cardId, shouldRemainHovered);
    }
  }, []);

  useEffect(() => {
    const externalHoverKeys = externallyHoveredImpactKeysRef.current;
    const setHoveredMapImpact = (nextImpact: ReturnType<typeof regionalImpactIdentity>) => {
      const hoveredMapImpact = hoveredMapImpactRef.current;
      if (
        hoveredMapImpact?.kind === nextImpact?.kind
        && hoveredMapImpact?.id === nextImpact?.id
      ) return;
      if (
        hoveredMapImpact
        && !externalHoverKeys.has(`${hoveredMapImpact.kind}:${hoveredMapImpact.id}`)
      ) setLinkedImpactHover(
        viewportRef.current?.querySelector(
          `[data-regional-impact-kind="${hoveredMapImpact.kind}"][data-regional-impact-id="${CSS.escape(hoveredMapImpact.id)}"]`,
        ) ?? null,
        false,
      );
      hoveredMapImpactRef.current = nextImpact;
      if (nextImpact) setLinkedImpactHover(
        viewportRef.current?.querySelector(
          `[data-regional-impact-kind="${nextImpact.kind}"][data-regional-impact-id="${CSS.escape(nextImpact.id)}"]`,
        ) ?? null,
        true,
      );
    };
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (activePointersRef.current.size > 0) return;
      if (event.pointerType !== "mouse") return;
      const root = viewportRef.current;
      const target = event.target instanceof Element ? event.target : null;
      if (!root || !target || !root.contains(target) || target.closest(".overlap-indicator")) {
        setHoveredMapImpact(null);
        return;
      }
      setHoveredMapImpact(
        regionalStationImpactAtClientPoint(root, event.clientX, event.clientY)
          ?? regionalSegmentImpactAtClientPoint(root, event.clientX, event.clientY),
      );
    };
    const handleFocusIn = (event: FocusEvent) => {
      setLinkedImpactHover(event.target, true);
    };
    const handleFocusOut = (event: FocusEvent) => {
      const currentImpact = regionalImpactIdentity(event.target);
      const nextImpact = regionalImpactIdentity(event.relatedTarget);
      if (
        currentImpact?.kind === nextImpact?.kind
        && currentImpact?.id === nextImpact?.id
      ) return;
      setLinkedImpactHover(event.target, false);
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    return () => {
      hoveredMapImpactRef.current = null;
      externalHoverKeys.clear();
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, [setLinkedImpactHover, svgMarkup]);

  const closeRegionalOverlapChooser = useCallback(() => {
    const badge = overlapBadges.find((candidate) => candidate.markerId === expandedOverlapBadgeId);
    if (badge) setRegionalOverlapImpactsHovered(badge.impacts, false);
    setExpandedOverlapBadgeId(null);
    setOverlapChooserLayout(null);
    setOverlapChooserSize(null);
  }, [expandedOverlapBadgeId, overlapBadges, setRegionalOverlapImpactsHovered]);

  const openRegionalOverlapChooser = useCallback((badge: RegionalOverlapBadge) => {
    const viewport = viewportRef.current;
    const marker = viewport ? regionalOverlapMarker(viewport, badge.markerId) : null;
    if (!viewport || !marker) return;
    const viewportRect = viewport.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const compact = viewportRect.width <= 640;
    const width = Math.max(
      240,
      Math.min(compact ? 280 : 360, viewportRect.width - 32),
    );
    const height = compact
      ? Math.min(380, 56 + badge.impacts.length * 64)
      : Math.min(440, 68 + badge.impacts.length * 76);
    const markerCenter = {
      x: markerRect.left - viewportRect.left + markerRect.width / 2,
      y: markerRect.top - viewportRect.top + markerRect.height / 2,
    };
    const svg = marker.ownerSVGElement;
    const screenMatrix = svg?.getScreenCTM();
    const anchorPoint = svg?.createSVGPoint();
    if (anchorPoint) {
      anchorPoint.x = badge.anchor.x;
      anchorPoint.y = badge.anchor.y;
    }
    const screenAnchor = anchorPoint && screenMatrix
      ? anchorPoint.matrixTransform(screenMatrix)
      : null;
    setOverlapChooserLayout(regionalOverlapChooserLayout({
      markerCenter,
      markerSize: markerRect,
      alertAnchor: screenAnchor
        ? {
            x: screenAnchor.x - viewportRect.left,
            y: screenAnchor.y - viewportRect.top,
          }
        : markerCenter,
      chooserSize: { width, height },
      viewportSize: {
        width: viewportRect.width,
        height: viewportRect.height,
      },
      alertCollisionBoxes: regionalReferencedAlertCollisionBoxes(
        viewport,
        badge,
        viewportRect,
      ),
    }));
    setOverlapChooserSize({ width, height });
    setExpandedOverlapBadgeId(badge.markerId);
    setRegionalOverlapImpactsHovered(badge.impacts, false);
  }, [setRegionalOverlapImpactsHovered]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateTarget(event.target);
  }, [activateTarget]);

  const relativeScale = camera.scale / (fitScale || 1);
  const expandedOverlapBadge = overlapBadges.find(
    (candidate) => candidate.markerId === expandedOverlapBadgeId,
  ) ?? null;
  const hoverRegionalChooserImpact = useCallback((impact: MapImpact | null) => {
    if (!expandedOverlapBadge) return;
    setRegionalOverlapImpactsHovered(expandedOverlapBadge.impacts, false);
    if (impact) setRegionalOverlapImpactsHovered([impact], true);
  }, [expandedOverlapBadge, setRegionalOverlapImpactsHovered]);
  const closeRegionalChooserWithFocus = useCallback((restoreFocus: boolean) => {
    const markerId = expandedOverlapBadge?.markerId;
    closeRegionalOverlapChooser();
    if (!restoreFocus || !markerId) return;
    window.requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      if (viewport) regionalOverlapMarker(viewport, markerId)?.focus();
    });
  }, [closeRegionalOverlapChooser, expandedOverlapBadge]);

  return (
    <section
      ref={regionalMapRef}
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
        onClick={(event) => {
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          if (dragMovedRef.current) return;
          if (expandedOverlapBadgeId) closeRegionalOverlapChooser();
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
            transformOrigin: "0 0",
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
            <g aria-label="Overlapping alert badges">
              {overlapBadges.map((badge) => (
                <MapOverlapIndicator
                  key={badge.markerId}
                  markerId={badge.markerId}
                  label={badge.label}
                  impacts={badge.impacts}
                  position={badge.position}
                  size={badge.size}
                  selection={selection}
                  isOpen={expandedOverlapBadgeId === badge.markerId}
                  visualScale={REGIONAL_OVERLAP_INDICATOR_SCALE}
                  isolatePointerDown
                  onActivate={() => {
                    if (expandedOverlapBadgeId === badge.markerId) {
                      closeRegionalOverlapChooser();
                    } else {
                      openRegionalOverlapChooser(badge);
                    }
                  }}
                  onHoverChange={(hovered) =>
                    setRegionalOverlapImpactsHovered(badge.impacts, hovered)}
                />
              ))}
            </g>
          </svg>
        </div>
      </div>
      {expandedOverlapBadge && overlapChooserLayout && overlapChooserSize ? (
        <MapOverlapChooser
          key={expandedOverlapBadge.markerId}
          markerId={expandedOverlapBadge.markerId}
          label={expandedOverlapBadge.label}
          impacts={expandedOverlapBadge.impacts}
          chooserSize={overlapChooserSize}
          collisionAvoided
          layout={overlapChooserLayout}
          onSelectImpact={onSelectImpact}
          onHoverImpact={hoverRegionalChooserImpact}
          onClose={closeRegionalChooserWithFocus}
          reducedMotion={reducedMotion}
          compactMotion={overlapChooserSize.width <= 280}
        />
      ) : null}
      {commutePathPreview ? (
        <div className="commute-path-preview-chip" role="status" aria-live="polite">
          <span>
            Viewing <strong>{commutePathPreview.routeLabel}</strong>
          </span>
          <button type="button" onClick={onClearCommutePathPreview} aria-label="Back to My Commutes">
            Back
          </button>
        </div>
      ) : null}
      {/* Regional map controls positioned vertically on right side centered below top-right info button */}
      <div className="map-control-rail regional-map-control-rail absolute top-40 sm:top-[176px] right-4 sm:right-6 z-30 flex flex-col items-center justify-center gap-1 sm:gap-2 pointer-events-auto">
        <div className="map-control-recenter-container">
          <button
            type="button"
            onClick={handleFitNetwork}
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

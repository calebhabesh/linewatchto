import type {
  ActiveAlert,
  DelayAlert,
  ImpactKind,
  ImpactSelection,
  MapImpact,
  NetworkSegment,
  PlannedClosure,
  ReducedSpeedZone,
  Station,
  StationNodeImpact,
  TravelDirection,
} from "./linewatch-data.ts";
import type { AccountCommutePathPreview } from "./commute-data.ts";
import type { MapPoint } from "./map-geometry.ts";
import { removeDescendantIds } from "./regional-map-asset.ts";
import {
  REGIONAL_IMPACT_OVERLAY_WIDTH,
  REGIONAL_OVERLAP_INDICATOR_SCALE,
  REGIONAL_STATION_IMPACT_EFFECT_RADIUS_RATIO,
  REGIONAL_STATION_IMPACT_BADGE_RADIUS_RATIO,
  pointInSvgRootCoordinates,
  svgAnchorPoint,
  regionalStationVisualAnchors,
  regionalStationImpactAnchors,
  authoredRegionalCorridorPathData,
  resolvedRegionalSegmentPath,
  continuousRegionalOverlayRunPath,
  regionalHoverMaskBounds,
  regionalOverlapBadgeAnchor,
  regionalCollisionBoxForElement,
  regionalPathCorridorCollisionBoxes,
  expandedRegionalCollisionBox,
  regionalBadgeCollisionBox,
  regionalCollisionIntersectionArea,
  clampRegionalOverlapBadgePosition,
  regionalOverlapBadgePositionCandidates,
  type RegionalCollisionBox,
} from "./regional-map-geometry.ts";
import {
  stationImpactDirectionForImpact,
  stationImpactDirectionPath,
} from "../components/station-impact-direction.ts";
import {
  alignedOverlapBadgePositionCandidates,
  hasOverlappingImpacts,
  mapOverlapIndicatorSize,
  overlapBadgeSignature,
  type MapOverlapChooserLayout,
  type MapOverlapIndicatorSize,
  type PlacedOverlapBadge,
} from "../components/map-overlap-badges.ts";

export const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
export const MAP_OVERLAY_PULSE_SCALE = 114 / 102;
// Keep the interactive stroke as wide as the fully expanded hover aura. A
// narrower target lets the visible highlight grow into an inert strip and
// then disappear while the pointer is still visibly over the overlay.
export const REGIONAL_IMPACT_HIT_TARGET_WIDTH = REGIONAL_IMPACT_OVERLAY_WIDTH + 169;
// Match the TTC hover keyline's rendered weight. The regional schematic is
// displayed at a smaller SVG-to-screen scale, so proportional widths made its
// inner black and outer white bands read much thinner in screen pixels.
export const REGIONAL_HIGHLIGHT_OUTLINE_WIDTH = REGIONAL_IMPACT_OVERLAY_WIDTH + 52;
export const REGIONAL_HIGHLIGHT_DIVIDER_WIDTH = REGIONAL_IMPACT_OVERLAY_WIDTH + 30;
export const REGIONAL_HIGHLIGHT_INNER_WIDTH = REGIONAL_IMPACT_OVERLAY_WIDTH - 12;
// Union is an intentionally oversized interchange hub rather than a round
// terminus dot. Let the hub remain visually continuous when a corridor ends
// there; ordinary terminus dots still receive the TTC-style top keyline.
export const REGIONAL_UNION_TOP_HOVER_CUTOUT_STROKE_WIDTH = 96;
export const REGIONAL_DELAY_GLYPH_SPACING = 96;
// TTC's lane advances 160 SVG units over 12 seconds. Regional authored map
// units are about 175 / 102 larger for the equivalent corridor stroke.
export const REGIONAL_DELAY_TRAVEL_UNITS_PER_SECOND = (160 / 12) * (175 / 102);
export const REGIONAL_OVERLAP_CHOOSER_GAP = 24;

export const REGIONAL_DYNAMIC_SEGMENT_LAYER_ID = "regional-dynamic-segment-layer";
export const REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID = "regional-dynamic-selected-segment-layer";
export const REGIONAL_DYNAMIC_STATION_RING_LAYER_ID = "regional-dynamic-station-ring-layer";
export const REGIONAL_DYNAMIC_PLANNED_STATION_LAYER_ID = "regional-dynamic-planned-station-layer";
export const REGIONAL_DYNAMIC_COMMUTE_LAYER_ID = "regional-dynamic-commute-layer";
export const REGIONAL_DYNAMIC_HOVER_LAYER_ID = "regional-dynamic-hover-layer";
export const REGIONAL_DYNAMIC_EFFECTS_LAYER_ID = "regional-dynamic-effects-layer";
export const REGIONAL_TOP_HOVER_LAYER_ID = "regional-top-hover-layer";
export const REGIONAL_TRAIN_MARKER_LAYER_ID = "regional-train-marker-layer";

export const SELECTION_INTRO_DURATION_MS = 2400;
export const REGIONAL_MAP_PULSE_CYCLE_MS = 2400;
export const REGIONAL_SYNCHRONIZED_OVERLAY_PULSE_NAMES = new Set([
  "aura-pulse",
  "map-overlay-rail-pulse",
  "gold-ring-pulse",
  "station-radar-core",
  "station-radar-ping",
  "station-selected-pulse",
]);

export type RegionalOverlapBadge = {
  markerId: string;
  label: string;
  impacts: MapImpact[];
  anchor: MapPoint;
  position: MapPoint;
  preferredVector: MapPoint;
  size: MapOverlapIndicatorSize;
  hasStablePosition?: boolean;
};

export type RegionalOverlayPiece = {
  segment: NetworkSegment;
  impact: MapImpact;
  impactIndex: number;
  pathD: string;
};

export type RegionalOverlayRun = {
  impact: MapImpact;
  impactIndex: number;
  lineId: string;
  segments: NetworkSegment[];
  pathD: string;
};

export type RegionalImpactIdentity = {
  kind: ImpactKind;
  id: string;
  segmentId?: string;
};

export type RegionalHoverSegment = { id: string; label: string; pathD: string };

export function synchronizeRegionalOverlayPulses(root: SVGSVGElement) {
  const pulseClockMs = Number(document.timeline?.currentTime ?? performance.now());
  const pulsePhaseMs = pulseClockMs % REGIONAL_MAP_PULSE_CYCLE_MS;
  const pulseCycleStartMs = pulseClockMs - pulsePhaseMs;
  root.style.setProperty("--map-pulse-offset", "0ms");
  root.style.setProperty("--regional-map-pulse-offset", "0ms");
  for (const animation of root.getAnimations({ subtree: true })) {
    const animationName = "animationName" in animation
      ? String(animation.animationName)
      : "";
    if (REGIONAL_SYNCHRONIZED_OVERLAY_PULSE_NAMES.has(animationName)) {
      animation.currentTime = pulsePhaseMs;
      animation.startTime = pulseCycleStartMs;
    }
  }
}

export function markCompletedSelectionIntro(root: ParentNode) {
  root.querySelectorAll<SVGElement>(
    '[data-regional-station-selected="true"], '
      + '[data-regional-station-top-selected="true"], '
      + '[data-regional-impact-selected="true"] .regional-impact-interactive-glow, '
      + '.regional-station-impact-ring[data-regional-impact-selected="true"]',
  ).forEach((element) => element.classList.add("selection-intro-complete"));
}

export function regionalImpactColor(kind: ImpactKind) {
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

export function regionalImpactDashArray(kind: ImpactKind) {
  if (kind === "planned-closure") return "120 70";
  return "none";
}

export function regionalImpactVisualState(kind: ImpactKind) {
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

export function regionalImpactPriority(kind: ImpactKind) {
  switch (kind) {
    case "reduced-speed-zone":
      return 0;
    case "planned-closure":
      return 1;
    case "delay":
      return 2;
    case "suspension":
      return 3;
    default:
      return -1;
  }
}

export function appendRegionalDelayGlyph(
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

export function regionalDelayGlyphLane(
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

export function appendRegionalSuspensionGlyph(
  documentNode: Document,
  parent: SVGGElement,
  kind: "no-entry" | "bar",
) {
  const glyph = documentNode.createElementNS(SVG_NAMESPACE, "g");
  glyph.classList.add("regional-suspension-glyph", `regional-suspension-glyph--${kind}`);

  if (kind === "no-entry") {
    // Replicate TTC's exact SuspensionNoEntryGlyph (white circle with diagonal prohibitory slash)
    // scaled for regional map units (196px stroke width).
    const scale = 5;
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

export function regionalSuspensionGlyphLane(
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

export function appendRegionalChevronGlyph(documentNode: Document, parent: SVGGElement) {
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

export function regionalChevronGlyphLane(
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

export function appendRegionalPlannedClosureGlyph(
  documentNode: Document,
  parent: SVGGElement,
  kind: "icon" | "chevron",
) {
  const glyph = documentNode.createElementNS(SVG_NAMESPACE, "g");
  glyph.classList.add("regional-planned-closure-glyph", `regional-planned-closure-glyph--${kind}`);

  if (kind === "icon") {
    // Replicate TTC map mode's PlannedClosureIcon (blue outline calendar icon on white rail)
    // scaled for regional map units (196px stroke width).
    const scale = 6.2;
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

export function regionalPlannedClosureIconLane(
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

export function regionalImpactGroup(
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
  group.style.setProperty("--map-overlay-rail-width", `${REGIONAL_IMPACT_OVERLAY_WIDTH}px`);
  group.style.setProperty(
    "--map-overlay-rail-pulse-width",
    `${REGIONAL_IMPACT_OVERLAY_WIDTH * MAP_OVERLAY_PULSE_SCALE}px`,
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

export function regionalSegmentsAreAdjacent(a: NetworkSegment, b: NetworkSegment) {
  return a.stationAId === b.stationAId
    || a.stationAId === b.stationBId
    || a.stationBId === b.stationAId
    || a.stationBId === b.stationBId;
}

export function regionalOverlayRuns(pieces: RegionalOverlayPiece[]): RegionalOverlayRun[] {
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

export function restoreRegionalOverlayOrder(segmentLayer: SVGGElement) {
  const overlays = [...segmentLayer.children] as SVGElement[];
  overlays.sort((left, right) =>
    regionalImpactPriority(left.dataset.regionalImpactKind as ImpactKind)
    - regionalImpactPriority(right.dataset.regionalImpactKind as ImpactKind)
    || (left.dataset.regionalImpactId ?? "").localeCompare(right.dataset.regionalImpactId ?? "")
  );
  segmentLayer.append(...overlays);
}

export function bringRegionalImpactToFront(
  root: HTMLElement,
  kind: ImpactKind,
  id: string,
  isCommutePreview = false,
) {
  const selectedLayer = root.querySelector<SVGGElement>(`#${REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID}`);
  const segmentLayer = root.querySelector<SVGGElement>(`#${REGIONAL_DYNAMIC_SEGMENT_LAYER_ID}`);
  if (selectedLayer && segmentLayer) {
    while (selectedLayer.firstChild) {
      const child = selectedLayer.firstChild as SVGElement;
      child.removeAttribute?.("data-selected-commute-impact-overlay");
      segmentLayer.append(child);
    }
    restoreRegionalOverlayOrder(segmentLayer);
  }
  root.querySelectorAll<SVGElement>(
    `.regional-overlay-segment-group[data-regional-impact-kind="${kind}"][data-regional-impact-id="${CSS.escape(id)}"]`,
  ).forEach((element) => {
    if (isCommutePreview) {
      element.setAttribute("data-selected-commute-impact-overlay", id);
    } else {
      element.removeAttribute("data-selected-commute-impact-overlay");
    }
    if (selectedLayer) {
      selectedLayer.append(element);
    } else {
      element.parentElement?.append(element);
    }
  });
}

export function bringRegionalStationImpactToFront(
  root: HTMLElement,
  kind: ImpactKind,
  id: string,
  isCommutePreview = false,
) {
  root.querySelectorAll<SVGElement>(
    `.regional-station-impact-ring[data-regional-impact-kind="${kind}"][data-regional-impact-id="${CSS.escape(id)}"]`,
  ).forEach((element) => {
    if (isCommutePreview) {
      element.setAttribute("data-selected-commute-impact-overlay", id);
    } else {
      element.removeAttribute("data-selected-commute-impact-overlay");
    }
    element.parentElement?.append(element);
  });
}

export function setRegionalImpactHoverForeground(
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
        // Hover identifies the impact represented by this entire overlay.
        foreground.removeAttribute("mask");
        foreground.dataset.regionalImpactHovered = "true";
      } else {
        foreground.removeAttribute("mask");
        foreground.removeAttribute("data-regional-impact-hovered");
      }
    });
}

export function setRegionalStationImpactHover(
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

export function regionalSegmentHoverForeground(
  source: SVGElement,
  maskIndex: number,
) {
  const foreground = source.cloneNode(true) as SVGGElement;
  removeDescendantIds(foreground);
  foreground.dataset.regionalHoverImpactKind = source.dataset.regionalImpactKind ?? "";
  foreground.dataset.regionalHoverImpactId = source.dataset.regionalImpactId ?? "";
  foreground.removeAttribute("data-regional-impact-id");
  foreground.removeAttribute("data-regional-impact-selected");
  foreground.classList.add("regional-impact-hover-foreground");
  // Keep the source rail and directional artwork above competing impacts.
  // The copy is visual only: original hit targets retain pointer and focus ownership.
  foreground.querySelectorAll(".regional-impact-interactive-glow, .regional-impact-hit-target")
    .forEach((element) => element.remove());
  foreground.querySelectorAll("title").forEach((element) => element.remove());
  const boundary = foreground.querySelector<SVGPathElement>(".regional-impact-hover-boundary");
  if (boundary) {
    const sourceBoundary = source.querySelector<SVGPathElement>(".regional-impact-hover-boundary");
    const maskBounds = regionalHoverMaskBounds(sourceBoundary ?? source);
    const coreMaskId = `regional-hover-boundary-mask-${maskIndex}`;
    const edgeMaskId = `${coreMaskId}-outer`;

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
    const hoverMask = (id: string, cutoutWidth: number) => {
      const mask = boundary.ownerDocument.createElementNS(SVG_NAMESPACE, "mask");
      mask.id = id;
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
      mask.append(
        background,
        maskStroke("white", REGIONAL_HIGHLIGHT_OUTLINE_WIDTH),
        maskStroke("black", cutoutWidth),
      );
      return mask;
    };

    const definitions = boundary.ownerDocument.createElementNS(SVG_NAMESPACE, "defs");
    definitions.append(
      hoverMask(coreMaskId, REGIONAL_HIGHLIGHT_INNER_WIDTH),
      hoverMask(edgeMaskId, REGIONAL_HIGHLIGHT_DIVIDER_WIDTH),
    );
    foreground.prepend(definitions);

    boundary.classList.add("regional-impact-hover-boundary-core");
    boundary.setAttribute("mask", `url(#${coreMaskId})`);
    boundary.style.setProperty("stroke", "rgba(15, 23, 42, 0.98)");
    boundary.style.setProperty("stroke-width", String(REGIONAL_HIGHLIGHT_OUTLINE_WIDTH));

    const edgeBoundary = boundary.cloneNode(false) as SVGPathElement;
    removeDescendantIds(edgeBoundary);
    edgeBoundary.classList.remove("regional-impact-hover-boundary-core");
    edgeBoundary.classList.add("regional-impact-hover-boundary-edge");
    edgeBoundary.setAttribute("mask", `url(#${edgeMaskId})`);
    edgeBoundary.style.setProperty("stroke", "rgba(248, 250, 252, 0.98)");
    edgeBoundary.style.setProperty("stroke-width", String(REGIONAL_HIGHLIGHT_OUTLINE_WIDTH));
    edgeBoundary.style.setProperty("filter", "drop-shadow(0 0 7px rgba(191, 219, 254, 0.62))");
    // Keep both keylines in the same nested SVG group. Appending the edge to
    // the foreground root drops ancestor transforms used by authored regional
    // routes, which leaves only the black inner keyline aligned with the rail.
    boundary.after(edgeBoundary);
  }
  foreground.setAttribute("aria-hidden", "true");
  foreground.setAttribute("pointer-events", "none");
  return foreground;
}

export function regionalTopHoverForeground(
  source: SVGPathElement,
  cloneIndex: number,
) {
  const documentNode = source.ownerDocument;
  const impact = source.closest<SVGGElement>(".regional-overlay-segment-group");
  const topForeground = documentNode.createElementNS(SVG_NAMESPACE, "g");
  topForeground.classList.add("regional-impact-top-hover-foreground");
  topForeground.dataset.regionalHoverImpactKind = impact?.dataset.regionalImpactKind ?? "";
  topForeground.dataset.regionalHoverImpactId = impact?.dataset.regionalImpactId ?? "";
  topForeground.setAttribute("aria-hidden", "true");
  topForeground.setAttribute("pointer-events", "none");

  // This outline is painted in a sibling SVG above the raster station plane.
  // Rebuild TTC's outline-only foreground from the authored path instead of
  // copying a live getCTM() and mask tree across SVG roots. The latter can
  // retain a viewport-relative matrix and paint a detached route fragment.
  const origin = pointInSvgRootCoordinates(source, { x: 0, y: 0 });
  const xBasis = pointInSvgRootCoordinates(source, { x: 1, y: 0 });
  const yBasis = pointInSvgRootCoordinates(source, { x: 0, y: 1 });
  topForeground.setAttribute("transform", `matrix(${[
    xBasis.x - origin.x,
    xBasis.y - origin.y,
    yBasis.x - origin.x,
    yBasis.y - origin.y,
    origin.x,
    origin.y,
  ].join(" ")})`);

  const maskBounds = regionalHoverMaskBounds(source);
  const coreMaskId = `regional-top-hover-boundary-mask-${cloneIndex}`;
  const edgeMaskId = `${coreMaskId}-outer`;
  const pathClone = () => {
    const path = source.cloneNode(false) as SVGPathElement;
    path.removeAttribute("id");
    path.removeAttribute("class");
    path.removeAttribute("style");
    path.removeAttribute("transform");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    return path;
  };
  const unionCutout = () => {
    // Both the dynamic corridor and station-union live in the authored
    // stations-layer coordinate system. A local cutout therefore follows the
    // top foreground's copied transform without depending on screen CTMs.
    const union = documentNode.getElementById("station-union") as SVGRectElement | null;
    if (!union || union.tagName.toLowerCase() !== "rect") return null;
    const cutout = union.cloneNode(false) as SVGRectElement;
    cutout.removeAttribute("id");
    cutout.removeAttribute("class");
    cutout.removeAttribute("style");
    cutout.removeAttribute("transform");
    cutout.dataset.regionalTopHoverUnionCutout = "true";
    cutout.setAttribute("fill", "black");
    cutout.setAttribute("stroke", "black");
    // Cover the authored hub border too, so the highlight disappears behind
    // Union instead of appearing to slice through its rounded end cap.
    cutout.setAttribute("stroke-width", String(REGIONAL_UNION_TOP_HOVER_CUTOUT_STROKE_WIDTH));
    return cutout;
  };
  const maskStroke = (color: "white" | "black", width: number) => {
    const path = pathClone();
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", String(width));
    return path;
  };
  const hoverMask = (id: string, cutoutWidth: number) => {
    const mask = documentNode.createElementNS(SVG_NAMESPACE, "mask");
    mask.id = id;
    mask.setAttribute("maskUnits", "userSpaceOnUse");
    mask.setAttribute("x", String(maskBounds.x));
    mask.setAttribute("y", String(maskBounds.y));
    mask.setAttribute("width", String(maskBounds.width));
    mask.setAttribute("height", String(maskBounds.height));
    const background = documentNode.createElementNS(SVG_NAMESPACE, "rect");
    background.setAttribute("x", String(maskBounds.x));
    background.setAttribute("y", String(maskBounds.y));
    background.setAttribute("width", String(maskBounds.width));
    background.setAttribute("height", String(maskBounds.height));
    background.setAttribute("fill", "black");
    mask.append(
      background,
      maskStroke("white", REGIONAL_HIGHLIGHT_OUTLINE_WIDTH),
      maskStroke("black", cutoutWidth),
    );
    const hubCutout = unionCutout();
    if (hubCutout) mask.append(hubCutout);
    return mask;
  };
  const definitions = documentNode.createElementNS(SVG_NAMESPACE, "defs");
  definitions.append(
    hoverMask(coreMaskId, REGIONAL_HIGHLIGHT_INNER_WIDTH),
    hoverMask(edgeMaskId, REGIONAL_HIGHLIGHT_DIVIDER_WIDTH),
  );

  const core = pathClone();
  core.classList.add("regional-impact-hover-boundary", "regional-impact-hover-boundary-core");
  core.setAttribute("mask", `url(#${coreMaskId})`);
  core.style.setProperty("stroke", "rgba(15, 23, 42, 0.98)");
  core.style.setProperty("stroke-width", String(REGIONAL_HIGHLIGHT_OUTLINE_WIDTH));
  const edge = pathClone();
  edge.classList.add("regional-impact-hover-boundary", "regional-impact-hover-boundary-edge");
  edge.setAttribute("mask", `url(#${edgeMaskId})`);
  edge.style.setProperty("stroke", "rgba(248, 250, 252, 0.98)");
  edge.style.setProperty("stroke-width", String(REGIONAL_HIGHLIGHT_OUTLINE_WIDTH));
  edge.style.setProperty("filter", "drop-shadow(0 0 7px rgba(191, 219, 254, 0.62))");
  topForeground.append(definitions, core, edge);
  return topForeground;
}

export function addRegionalSegmentFocusTargets(group: SVGGElement, segments: RegionalHoverSegment[]) {
  const hitTarget = group.querySelector<SVGPathElement>(".regional-impact-hit-target");
  if (!hitTarget || segments.length === 0) return;
  if (segments.length === 1) {
    hitTarget.dataset.regionalHoverSegmentId = segments[0].id;
    return;
  }

  hitTarget.setAttribute("tabindex", "-1");
  hitTarget.setAttribute("aria-hidden", "true");
  for (const segment of segments) {
    const focusTarget = group.ownerDocument.createElementNS(SVG_NAMESPACE, "path");
    focusTarget.classList.add("regional-impact-segment-focus-target");
    focusTarget.dataset.regionalHoverSegmentId = segment.id;
    focusTarget.setAttribute("d", segment.pathD);
    focusTarget.setAttribute("fill", "none");
    focusTarget.setAttribute("stroke", "transparent");
    focusTarget.setAttribute("stroke-width", String(REGIONAL_IMPACT_HIT_TARGET_WIDTH));
    focusTarget.setAttribute("pointer-events", "none");
    focusTarget.setAttribute("role", "button");
    focusTarget.setAttribute("tabindex", "0");
    focusTarget.setAttribute("aria-label", `${segment.label} impact details`);
    group.append(focusTarget);
  }
}

export function regionalImpactIdentity(target: EventTarget | null): RegionalImpactIdentity | null {
  if (!(target instanceof Element)) return null;
  const impact = target.closest<HTMLElement | SVGElement>(
    "[data-regional-impact-kind][data-regional-impact-id], [data-impact-kind][data-impact-id]",
  );
  const kind = (impact?.dataset.regionalImpactKind ?? impact?.dataset.impactKind) as ImpactKind | undefined;
  const id = impact?.dataset.regionalImpactId ?? impact?.dataset.impactId;
  const segmentId = target.closest<SVGElement>("[data-regional-hover-segment-id]")
    ?.dataset.regionalHoverSegmentId;
  return kind && id ? { kind, id, segmentId } : null;
}

export function regionalSegmentImpactAtClientPoint(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): RegionalImpactIdentity | null {
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
    const identity = regionalImpactIdentity(hitTarget);
    const group = hitTarget.closest<SVGGElement>(".regional-overlay-segment-group");
    if (!identity || !group) return identity;
    const segmentTargets = [...group.querySelectorAll<SVGPathElement>(".regional-impact-segment-focus-target")];
    const segment = segmentTargets.reverse().find((target) => {
      const matrix = target.getScreenCTM();
      if (!matrix) return false;
      return target.isPointInStroke(point.matrixTransform(matrix.inverse()));
    });
    return { ...identity, segmentId: segment?.dataset.regionalHoverSegmentId ?? identity.segmentId };
  }
  return null;
}

export function regionalStationImpactAtClientPoint(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): RegionalImpactIdentity | null {
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

export function nextRegionalPointerImpactSelection(
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

export function regionalOverlapBadgeGroups(segments: NetworkSegment[]) {
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
  return [...groups.entries()]
    .map(([signature, group]) => ({ signature, ...group }))
    .sort((a, b) => {
      const aSegmentId = a.segments[0]?.id ?? "";
      const bSegmentId = b.segments[0]?.id ?? "";
      return aSegmentId.localeCompare(bSegmentId) || a.signature.localeCompare(b.signature);
    });
}

export function regionalOverlapBadges(
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

export function regionalCollisionAdjustedOverlapBadges(
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
      return box ? [expandedRegionalCollisionBox(box, 36)] : [];
    } catch {
      return [];
    }
  });
  const alertOverlayBoxes = Array.from(
    svg.querySelectorAll<SVGPathElement>(
      ".regional-overlay-segment-group[data-regional-impact-id] .regional-impact-path",
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
  const placedBadges: PlacedOverlapBadge[] = [];

  return badges.map((badge) => {
    const preferredPosition = {
      x: badge.anchor.x + badge.preferredVector.x,
      y: badge.anchor.y + badge.preferredVector.y,
    };
    const renderedSize = {
      width: badge.size.width * REGIONAL_OVERLAP_INDICATOR_SCALE,
      height: badge.size.height * REGIONAL_OVERLAP_INDICATOR_SCALE,
    };
    const alignedCandidates = alignedOverlapBadgePositionCandidates({
      anchor: badge.anchor,
      size: renderedSize,
      placedBadges,
      gap: 32,
      maxAnchorDistance: 900,
      centerSpacing: 290 * REGIONAL_OVERLAP_INDICATOR_SCALE,
    });
    const candidateKeys = new Set<string>();
    const candidates = [
      ...(badge.hasStablePosition ? [{ candidate: badge.position, stable: true, aligned: false }] : []),
      ...alignedCandidates.map((candidate) => ({ candidate, stable: false, aligned: true })),
      ...regionalOverlapBadgePositionCandidates(badge)
        .map((candidate) => ({ candidate, stable: false, aligned: false })),
    ].filter(({ candidate }) => {
      const key = `${Math.round(candidate.x)}:${Math.round(candidate.y)}`;
      if (candidateKeys.has(key)) return false;
      candidateKeys.add(key);
      return true;
    });
    const scoredPositions = candidates
      .map(({ candidate, stable, aligned }) => ({
        candidate: clampRegionalOverlapBadgePosition(candidate, badge.size),
        stable,
        aligned,
      }))
      .map(({ candidate, stable, aligned }) => {
        const box = expandedRegionalCollisionBox(
          regionalBadgeCollisionBox(candidate, badge.size),
          18,
        );
        const hardCollisionBoxes = [
          ...occupiedBoxes,
          ...alertOverlayBoxes,
          ...stationAlertBoxes,
          // Reused and aligned positions must also clear unalerted routes.
          ...transitLineBoxes,
        ];
        const hardOverlapArea = hardCollisionBoxes.reduce(
          (total, occupied) => total + regionalCollisionIntersectionArea(box, occupied),
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
          hardOverlapArea,
          stable,
          aligned,
          score: hardOverlapArea * 1_000_000
            + anchorDistance
            + preferredDeviation * 0.05,
        };
      });
    const position = scoredPositions.find((candidate) => (
      candidate.stable && candidate.hardOverlapArea === 0
    )) ?? scoredPositions.find((candidate) => (
      candidate.aligned && candidate.hardOverlapArea === 0
    ))
      ?? scoredPositions.sort((left, right) => left.score - right.score)[0];
    if (!position) return badge;
    occupiedBoxes.push(position.box);
    placedBadges.push({
      anchor: badge.anchor,
      position: position.candidate,
      size: renderedSize,
    });
    return { ...badge, position: position.candidate };
  });
}

export function regionalOverlapMarker(
  root: ParentNode,
  markerId: string,
): SVGGElement | null {
  const markerGroup = Array.from(
    root.querySelectorAll<SVGGElement>("[data-overlap-segment-id]"),
  ).find((candidate) => candidate.dataset.overlapSegmentId === markerId);
  return markerGroup?.querySelector<SVGGElement>(".overlap-indicator") ?? null;
}

export function regionalReferencedAlertCollisionBoxes(
  root: ParentNode,
  badge: RegionalOverlapBadge,
  viewportRect: DOMRect,
): RegionalCollisionBox[] {
  const identityKeys = new Set(
    badge.impacts.map((impact) => `${impact.kind}:${impact.cardId}`),
  );
  return [...root.querySelectorAll<SVGPathElement>(
    ".regional-overlay-segment-group[data-regional-impact-id] .regional-impact-path",
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

export function regionalOverlapChooserLayout({
  markerCenter,
  markerSize,
  alertAnchor,
  chooserSize,
  viewportSize,
  alertCollisionBoxes,
  uiKeepoutBoxes,
}: {
  markerCenter: { x: number; y: number };
  markerSize: { width: number; height: number };
  alertAnchor: { x: number; y: number };
  chooserSize: { width: number; height: number };
  viewportSize: { width: number; height: number };
  alertCollisionBoxes: RegionalCollisionBox[];
  uiKeepoutBoxes: RegionalCollisionBox[];
}): { layout: MapOverlapChooserLayout; size: { width: number; height: number } } {
  const padding = 16;
  const markerCollisionBox: RegionalCollisionBox = {
    x: markerCenter.x - markerSize.width / 2,
    y: markerCenter.y - markerSize.height / 2,
    width: markerSize.width,
    height: markerSize.height,
  };
  const outwardVector = {
    x: markerCenter.x - alertAnchor.x,
    y: markerCenter.y - alertAnchor.y,
  };
  const outwardDistance = Math.hypot(outwardVector.x, outwardVector.y);
  const normalizedOutward = outwardDistance > 0.001
    ? { x: outwardVector.x / outwardDistance, y: outwardVector.y / outwardDistance }
    : { x: 0, y: -1 };

  const heightCandidates = Array.from(new Set([
    chooserSize.height,
    Math.min(chooserSize.height, Math.max(160, viewportSize.height - padding * 2)),
    Math.min(chooserSize.height, Math.max(160, Math.floor(viewportSize.height * 0.72))),
    Math.min(chooserSize.height, Math.max(160, Math.floor(viewportSize.height * 0.56))),
  ])).sort((left, right) => right - left);

  const clampCenter = (center: { x: number; y: number }, size: { width: number; height: number }) => ({
    x: Math.min(
      Math.max(padding + size.width / 2, center.x),
      viewportSize.width - padding - size.width / 2,
    ),
    y: Math.min(
      Math.max(padding + size.height / 2, center.y),
      viewportSize.height - padding - size.height / 2,
    ),
  });

  const centerForDirection = (
    direction: { x: number; y: number },
    size: { width: number; height: number },
    distanceScale = 1,
  ) => {
    const clearance = {
      x: markerSize.width / 2 + size.width / 2 + REGIONAL_OVERLAP_CHOOSER_GAP * distanceScale,
      y: markerSize.height / 2 + size.height / 2 + REGIONAL_OVERLAP_CHOOSER_GAP * distanceScale,
    };
    return clampCenter({
      x: markerCenter.x + direction.x * clearance.x,
      y: markerCenter.y + direction.y * clearance.y,
    }, size);
  };

  const scoreSize = (size: { width: number; height: number }) => {
    const preferredCenter = centerForDirection(normalizedOutward, size);
    const angleOffsets = Array.from({ length: 24 }, (_unused, index) => {
      const step = Math.floor((index + 1) / 2);
      const sign = index % 2 === 0 ? 1 : -1;
      return (step * 15 * Math.PI / 180) * sign;
    });
    const distanceScales = [1, 1.25, 1.55, 1.9, 2.3];
    const candidateDirections = [
      normalizedOutward,
      ...angleOffsets.map((offset) => {
        const baseAngle = Math.atan2(normalizedOutward.y, normalizedOutward.x);
        const angle = baseAngle + offset;
        return { x: Math.cos(angle), y: Math.sin(angle) };
      }),
    ];
    const candidateKeys = new Set<string>();
    const candidates = candidateDirections.flatMap((direction) =>
      distanceScales.map((distanceScale) => centerForDirection(direction, size, distanceScale)),
    ).filter((candidate) => {
      const key = `${Math.round(candidate.x)}:${Math.round(candidate.y)}`;
      if (candidateKeys.has(key)) return false;
      candidateKeys.add(key);
      return true;
    });
    const scoredCandidates = candidates.map((candidate) => {
      const chooserBox: RegionalCollisionBox = {
        x: candidate.x - size.width / 2,
        y: candidate.y - size.height / 2,
        width: size.width,
        height: size.height,
      };
      const alertOverlapArea = alertCollisionBoxes.reduce(
        (total, box) => total + regionalCollisionIntersectionArea(chooserBox, box),
        0,
      );
      const markerOverlapArea = regionalCollisionIntersectionArea(chooserBox, markerCollisionBox);
      const uiOverlapArea = uiKeepoutBoxes.reduce(
        (total, box) => total + regionalCollisionIntersectionArea(chooserBox, box),
        0,
      );
      const preferredDeviation = Math.hypot(
        candidate.x - preferredCenter.x,
        candidate.y - preferredCenter.y,
      );
      return {
        candidate,
        score: alertOverlapArea * 1_000_000
          + markerOverlapArea * 1_000_000
          + uiOverlapArea * 1_000_000_000
          + preferredDeviation,
        uiOverlapArea,
        markerOverlapArea,
      };
    });
    const clearCandidates = scoredCandidates.filter((entry) =>
      entry.uiOverlapArea === 0 && entry.markerOverlapArea === 0
    ).sort((left, right) => left.score - right.score);
    const uiSafeCandidates = scoredCandidates.filter((entry) =>
      entry.uiOverlapArea === 0
    ).sort((left, right) => left.score - right.score);
    const center = (clearCandidates[0]
      ?? uiSafeCandidates[0]
      ?? scoredCandidates.sort((left, right) => left.score - right.score)[0]
    )?.candidate ?? clampCenter(preferredCenter, size);
    return { center, clearsUiKeepouts: uiSafeCandidates.length > 0 };
  };

  let chosenSize = chooserSize;
  let chosenAttempt = scoreSize(chooserSize);
  for (const height of heightCandidates) {
    const size = { width: chooserSize.width, height };
    const attempt = scoreSize(size);
    chosenSize = size;
    chosenAttempt = attempt;
    if (attempt.clearsUiKeepouts) break;
  }
  const center = chosenAttempt.center;
  const left = center.x - chosenSize.width / 2;
  const top = center.y - chosenSize.height / 2;
  return {
    layout: {
      left,
      top,
      anchorOffsetX: markerCenter.x - center.x,
      anchorOffsetY: markerCenter.y - center.y,
    },
    size: chosenSize,
  };
}

export type RegionalOverlayData = {
  activeAlerts: ActiveAlert[];
  delays: DelayAlert[];
  reducedSpeedZones: ReducedSpeedZone[];
  plannedClosures: PlannedClosure[];
  networkSegments: NetworkSegment[];
  stationNodeImpacts: StationNodeImpact[];
  stations: Station[];
  commutePathPreview?: AccountCommutePathPreview | null;
  reducedMotion?: boolean;
  selection?: ImpactSelection;
  selectedStationId?: string | null;
  selectionIntroCompleted?: boolean;
};

export type RegionalOverlaySelection = {
  selection?: ImpactSelection;
  selectedStationId?: string | null;
  commutePathPreview?: AccountCommutePathPreview | null;
  selectionIntroCompleted?: boolean;
};

export type RegionalOverlaySessionOptions = {
  onHoverImpact?: (impact: RegionalImpactIdentity | null) => void;
  onHoverStationId?: (stationId: string | null) => void;
  isPointerGestureActive?: () => boolean;
};

export interface RegionalOverlaySession {
  update(data: RegionalOverlayData): { overlapBadges: RegionalOverlapBadge[] };
  updateSelection(selection: RegionalOverlaySelection): void;
  updateStationSelection(selectedStationId: string | null, selectionIntroCompleted?: boolean): void;
  setImpactHover(impact: RegionalImpactIdentity | null, hovered: boolean): void;
  setExternalImpactsHover(impacts: MapImpact[], hovered: boolean): void;
  markSelectionIntroComplete(): void;
  dispose(): void;
}

export function installRegionalOverlaySession(
  viewport: HTMLElement,
  options?: RegionalOverlaySessionOptions,
): RegionalOverlaySession | null {
  const svg = viewport.querySelector<SVGSVGElement>(
    'svg[aria-label="GO and UP regional rail schematic"]',
  );
  if (!svg) return null;

  const segmentLayer = svg.querySelector<SVGGElement>(`#${REGIONAL_DYNAMIC_SEGMENT_LAYER_ID}`);
  const selectedSegmentLayer = svg.querySelector<SVGGElement>(`#${REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID}`);
  const stationRingLayer = svg.querySelector<SVGGElement>(`#${REGIONAL_DYNAMIC_STATION_RING_LAYER_ID}`);
  const plannedStationLayer = svg.querySelector<SVGGElement>(`#${REGIONAL_DYNAMIC_PLANNED_STATION_LAYER_ID}`);
  const commuteLayer = svg.querySelector<SVGGElement>(`#${REGIONAL_DYNAMIC_COMMUTE_LAYER_ID}`);
  const hoverLayer = svg.querySelector<SVGGElement>(`#${REGIONAL_DYNAMIC_HOVER_LAYER_ID}`);
  const effectsLayer = svg.querySelector<SVGGElement>(`#${REGIONAL_DYNAMIC_EFFECTS_LAYER_ID}`);
  const topHoverLayer = viewport.querySelector<SVGGElement>(`#${REGIONAL_TOP_HOVER_LAYER_ID}`);

  if (
    !segmentLayer
    || !stationRingLayer
    || !plannedStationLayer
    || !commuteLayer
    || !hoverLayer
    || !effectsLayer
    || !topHoverLayer
  ) {
    return null;
  }

  let overlapBadgePositions = new Map<string, MapPoint>();
  const externallyHoveredImpactKeys = new Set<string>();
  let hoveredMapImpact: RegionalImpactIdentity | null = null;
  let pulseFrame: number | null = null;
  let settledPulseFrame: number | null = null;

  const setLinkedImpactHover = (impact: RegionalImpactIdentity | null, hovered: boolean) => {
    if (!impact) return;
    setRegionalImpactHoverForeground(viewport, impact.kind, impact.id, hovered);
    setRegionalStationImpactHover(viewport, impact.kind, impact.id, hovered);
  };

  const handlePointerMove = (event: globalThis.PointerEvent) => {
    if (options?.isPointerGestureActive?.()) return;
    if (event.pointerType !== "mouse") return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target || !viewport.contains(target) || target.closest(".overlap-indicator")) {
      if (hoveredMapImpact) {
        if (!externallyHoveredImpactKeys.has(`${hoveredMapImpact.kind}:${hoveredMapImpact.id}`)) {
          setLinkedImpactHover(hoveredMapImpact, false);
        }
        hoveredMapImpact = null;
        options?.onHoverImpact?.(null);
      }
      options?.onHoverStationId?.(null);
      return;
    }
    const station = target.closest<SVGElement>("[data-regional-station-id]");
    const nextStationId = station?.dataset.regionalStationId ?? null;
    options?.onHoverStationId?.(nextStationId);

    const nextImpact = regionalStationImpactAtClientPoint(viewport, event.clientX, event.clientY)
      ?? regionalSegmentImpactAtClientPoint(viewport, event.clientX, event.clientY);

    if (
      hoveredMapImpact?.kind !== nextImpact?.kind
      || hoveredMapImpact?.id !== nextImpact?.id
      || hoveredMapImpact?.segmentId !== nextImpact?.segmentId
    ) {
      if (
        hoveredMapImpact
        && !externallyHoveredImpactKeys.has(`${hoveredMapImpact.kind}:${hoveredMapImpact.id}`)
      ) {
        setLinkedImpactHover(hoveredMapImpact, false);
      }
      hoveredMapImpact = nextImpact;
      if (nextImpact && !externallyHoveredImpactKeys.has(`${nextImpact.kind}:${nextImpact.id}`)) {
        setLinkedImpactHover(nextImpact, true);
      }
      options?.onHoverImpact?.(nextImpact);
    }
  };

  const handleFocusIn = (event: FocusEvent) => {
    if (typeof window !== "undefined" && !window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      return;
    }
    const impact = regionalImpactIdentity(event.target);
    setLinkedImpactHover(impact, true);
    if (impact) options?.onHoverImpact?.(impact);
    const station = event.target instanceof Element
      ? event.target.closest<SVGElement>("[data-regional-station-id]")
      : null;
    if (station?.dataset.regionalStationId) {
      options?.onHoverStationId?.(station.dataset.regionalStationId);
    }
  };

  const handleFocusOut = (event: FocusEvent) => {
    const currentStation = event.target instanceof Element
      ? event.target.closest<SVGElement>("[data-regional-station-id]")
      : null;
    const nextStation = event.relatedTarget instanceof Element
      ? event.relatedTarget.closest<SVGElement>("[data-regional-station-id]")
      : null;
    if (currentStation?.dataset.regionalStationId !== nextStation?.dataset.regionalStationId) {
      options?.onHoverStationId?.(nextStation?.dataset.regionalStationId ?? null);
    }
    const currentImpact = regionalImpactIdentity(event.target);
    const nextImpact = regionalImpactIdentity(event.relatedTarget);
    if (
      currentImpact?.kind === nextImpact?.kind
      && currentImpact?.id === nextImpact?.id
      && currentImpact?.segmentId === nextImpact?.segmentId
    ) return;
    if (currentImpact && !externallyHoveredImpactKeys.has(`${currentImpact.kind}:${currentImpact.id}`)) {
      setLinkedImpactHover(currentImpact, false);
    }
    if (nextImpact) {
      options?.onHoverImpact?.(nextImpact);
    }
  };

  document.addEventListener("pointermove", handlePointerMove);
  document.addEventListener("focusin", handleFocusIn);
  document.addEventListener("focusout", handleFocusOut);

  const applyImpactSelection = (
    selection: ImpactSelection,
    commutePathPreview: AccountCommutePathPreview | null = null,
    selectionIntroCompleted = false,
  ) => {
    viewport.querySelectorAll("[data-regional-impact-selected]").forEach((element) => element.removeAttribute("data-regional-impact-selected"));
    viewport.querySelectorAll("[data-selected-commute-impact-overlay]").forEach((element) => element.removeAttribute("data-selected-commute-impact-overlay"));
    if (selectedSegmentLayer && segmentLayer) {
      while (selectedSegmentLayer.firstChild) {
        const child = selectedSegmentLayer.firstChild as SVGElement;
        child.removeAttribute?.("data-selected-commute-impact-overlay");
        segmentLayer.append(child);
      }
      restoreRegionalOverlayOrder(segmentLayer);
    }
    if (selection) {
      viewport.querySelectorAll(`[data-regional-impact-kind="${selection.kind}"][data-regional-impact-id="${CSS.escape(selection.id)}"]`)
        .forEach((element) => {
          element.setAttribute("data-regional-impact-selected", "true");
        });
      bringRegionalImpactToFront(viewport, selection.kind, selection.id, Boolean(commutePathPreview));
      bringRegionalStationImpactToFront(viewport, selection.kind, selection.id, Boolean(commutePathPreview));
      if (selectionIntroCompleted) {
        markCompletedSelectionIntro(viewport);
      }
    }
  };

  const applyStationSelection = (selectedStationId: string | null, selectionIntroCompleted = false) => {
    viewport.querySelectorAll("[data-regional-station-selected]").forEach((element) => element.removeAttribute("data-regional-station-selected"));
    if (selectedStationId) {
      viewport.querySelector(
        `[data-regional-station-id="${CSS.escape(selectedStationId)}"]`,
      )?.setAttribute("data-regional-station-selected", "true");
      const indicator = viewport.querySelector(
        `[data-regional-station-selection-id="${CSS.escape(selectedStationId)}"]`,
      );
      indicator?.setAttribute("data-regional-station-selected", "true");
    }
    if (selectionIntroCompleted) {
      markCompletedSelectionIntro(viewport);
    }
  };

  const update = (data: RegionalOverlayData): { overlapBadges: RegionalOverlapBadge[] } => {
    const documentNode = svg.ownerDocument;
    segmentLayer.replaceChildren();
    if (selectedSegmentLayer) selectedSegmentLayer.replaceChildren();
    stationRingLayer.replaceChildren();
    plannedStationLayer.replaceChildren();
    commuteLayer.replaceChildren();
    hoverLayer.replaceChildren();
    topHoverLayer.replaceChildren();
    effectsLayer.replaceChildren();

    const stationImpactBeaconLayer = documentNode.createElementNS(SVG_NAMESPACE, "g");
    stationImpactBeaconLayer.classList.add("regional-station-impact-beacon-layer");
    const stationImpactDirectionLayer = documentNode.createElementNS(SVG_NAMESPACE, "g");
    stationImpactDirectionLayer.classList.add("regional-station-impact-direction-layer");

    const stationOnlyImpactIds = new Set(data.stationNodeImpacts.map((impact) => impact.cardId));
    const corridorWideAlerts = data.activeAlerts
      .filter((item) => item.affectedSegmentIds.length === 0 && !stationOnlyImpactIds.has(item.id))
      .sort((left, right) => {
        const leftKind = left.severity === "planned" ? "planned-closure" : left.severity;
        const rightKind = right.severity === "planned" ? "planned-closure" : right.severity;
        return regionalImpactPriority(leftKind) - regionalImpactPriority(rightKind)
          || left.id.localeCompare(right.id);
      });
    for (const alert of corridorWideAlerts) {
      const pathD = authoredRegionalCorridorPathData(documentNode, alert.lineId);
      if (!pathD) continue;
      const overlaySource = documentNode.createElementNS(SVG_NAMESPACE, "path");
      overlaySource.setAttribute("style", "display:inline");
      overlaySource.setAttribute("d", pathD);
      const kind = alert.severity === "planned" ? "planned-closure" : alert.severity;
      const segments = data.networkSegments
        .filter((segment) => segment.lineId === alert.lineId)
        .flatMap((segment) => {
          const segmentPathD = resolvedRegionalSegmentPath(documentNode, segment);
          return segmentPathD ? [{ id: segment.id, label: segment.label, pathD: segmentPathD }] : [];
        });
      const group = regionalImpactGroup(documentNode, overlaySource, {
        impactId: alert.id,
        kind,
        label: `${alert.lineNumber} ${alert.title}`,
        segmentCount: segments.length,
        segmentIds: segments.map((segment) => segment.id),
        reducedMotion: Boolean(data.reducedMotion),
      });
      addRegionalSegmentFocusTargets(group, segments);
      segmentLayer.append(group);
    }

    const overlayPieces: RegionalOverlayPiece[] = [];
    for (const segment of data.networkSegments.filter((item) => (item.impacts?.length ?? 0) > 0)) {
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
      const allLineSegmentIds = data.networkSegments
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
      const segments = run.segments.flatMap((segment) => {
        const segmentPathD = resolvedRegionalSegmentPath(documentNode, segment);
        return segmentPathD ? [{ id: segment.id, label: segment.label, pathD: segmentPathD }] : [];
      });
      const group = regionalImpactGroup(documentNode, overlaySource, {
        impactId: run.impact.cardId,
        kind: run.impact.kind,
        label: `${startLabel} to ${endLabel} ${run.impact.kind} impact`,
        segmentCount: run.segments.length,
        segmentIds: run.segments.map((segment) => segment.id),
        travelDirection: run.impact.travelDirection,
        reducedMotion: Boolean(data.reducedMotion),
      });
      addRegionalSegmentFocusTargets(group, segments);
      segmentLayer.append(group);
    }

    const directionData = {
      activeAlerts: data.activeAlerts,
      delays: data.delays,
      reducedSpeedZones: data.reducedSpeedZones,
      plannedClosures: data.plannedClosures,
    };
    for (const [impactIndex, impact] of data.stationNodeImpacts.entries()) {
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

    for (const closure of data.plannedClosures) {
      // A corridor preview uses its rail without drawing rings at each station.
      if (closure.previewSegmentIds.length > 0) continue;
      for (const stationId of closure.previewStationIds ?? []) {
        const stationVisual = svg.querySelector<SVGElement>(`#station-${CSS.escape(stationId)}`);
        if (!stationVisual) continue;
        const anchor = regionalStationImpactAnchors(stationVisual, closure.lineId)[0];
        if (!anchor) continue;
        const stationName = data.stations.find((station) => station.id === stationId)?.name
          ?? stationId.replaceAll("-", " ");
        const marker = documentNode.createElementNS(SVG_NAMESPACE, "circle");
        marker.classList.add("regional-planned-station-marker");
        marker.dataset.regionalImpactKind = "planned-closure";
        marker.dataset.regionalImpactId = closure.id;
        marker.dataset.regionalPlannedStationId = stationId;
        marker.dataset.activeNow = closure.activeNow ? "true" : "false";
        marker.setAttribute("cx", String(anchor.point.x));
        marker.setAttribute("cy", String(anchor.point.y));
        marker.setAttribute("r", String(Math.max(58, anchor.radius * 1.45)));
        marker.setAttribute("role", "button");
        marker.setAttribute("tabindex", "0");
        marker.setAttribute("aria-label", `${closure.title} at ${stationName}, ${closure.activeNow ? "active planned advisory" : "upcoming planned advisory"} details`);
        plannedStationLayer.append(marker);
      }
    }
    effectsLayer.append(stationImpactBeaconLayer, stationImpactDirectionLayer);

    if (data.commutePathPreview) {
      const previewLayer = documentNode.createElementNS(SVG_NAMESPACE, "g");
      previewLayer.classList.add("commute-path-preview-layer", "regional-commute-path-preview-layer");
      previewLayer.dataset.commutePathPreview = data.commutePathPreview.id;
      previewLayer.setAttribute("aria-label", data.commutePathPreview.routeLabel);
      for (const segmentId of data.commutePathPreview.segmentIds) {
        const segment = data.networkSegments.find((item) => item.id === segmentId);
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
        data.commutePathPreview.stationIds[0],
        data.commutePathPreview.stationIds.at(-1),
      ].filter((stationId): stationId is string => Boolean(stationId));
      for (const [index, stationId] of endpointStationIds.entries()) {
        const endpointSegment = data.commutePathPreview.segmentIds
          .map((segmentId) => data.networkSegments.find((item) => item.id === segmentId))
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

    // Corridor-wide and segment-specific alerts share one paint order.
    restoreRegionalOverlayOrder(segmentLayer);
    const orderedSegmentOverlays = segmentLayer.querySelectorAll<SVGElement>(".regional-overlay-segment-group");
    orderedSegmentOverlays.forEach((source, index) => {
      const foreground = regionalSegmentHoverForeground(source, index);
      hoverLayer.append(foreground);
      const sourceBoundary = source.querySelector<SVGPathElement>(".regional-impact-hover-boundary");
      if (sourceBoundary) {
        topHoverLayer.append(regionalTopHoverForeground(sourceBoundary, index));
      }
    });

    if (data.selectedStationId) {
      applyStationSelection(data.selectedStationId, data.selectionIntroCompleted);
    }
    if (data.selection) {
      applyImpactSelection(data.selection, data.commutePathPreview, data.selectionIntroCompleted);
    }
    if (data.selectionIntroCompleted) {
      markCompletedSelectionIntro(svg);
    }

    synchronizeRegionalOverlayPulses(svg);
    if (pulseFrame !== null) window.cancelAnimationFrame(pulseFrame);
    if (settledPulseFrame !== null) window.cancelAnimationFrame(settledPulseFrame);
    pulseFrame = window.requestAnimationFrame(() => {
      synchronizeRegionalOverlayPulses(svg);
      settledPulseFrame = window.requestAnimationFrame(() => synchronizeRegionalOverlayPulses(svg));
    });

    const badges = regionalOverlapBadges(documentNode, data.networkSegments).map((badge) => {
      const stablePosition = overlapBadgePositions.get(badge.markerId);
      return {
        ...badge,
        position: stablePosition ?? badge.position,
        hasStablePosition: Boolean(stablePosition),
      };
    });
    const adjusted = regionalCollisionAdjustedOverlapBadges(svg, badges);
    overlapBadgePositions = new Map(
      adjusted.map((badge) => [badge.markerId, badge.position]),
    );

    return { overlapBadges: adjusted };
  };

  const updateSelection = (selectionOptions: RegionalOverlaySelection) => {
    applyImpactSelection(
      selectionOptions.selection ?? null,
      selectionOptions.commutePathPreview ?? null,
      selectionOptions.selectionIntroCompleted ?? false,
    );
    if (selectionOptions.selectedStationId !== undefined) {
      applyStationSelection(
        selectionOptions.selectedStationId,
        selectionOptions.selectionIntroCompleted ?? false,
      );
    }
  };

  const updateStationSelection = (selectedStationId: string | null, selectionIntroCompleted = false) => {
    applyStationSelection(selectedStationId, selectionIntroCompleted);
  };

  const setImpactHover = (impact: RegionalImpactIdentity | null, hovered: boolean) => {
    setLinkedImpactHover(impact, hovered);
  };

  const setExternalImpactsHover = (impacts: MapImpact[], hovered: boolean) => {
    for (const impact of impacts) {
      const key = `${impact.kind}:${impact.cardId}`;
      if (hovered) {
        externallyHoveredImpactKeys.add(key);
      } else {
        externallyHoveredImpactKeys.delete(key);
      }
      setRegionalImpactHoverForeground(viewport, impact.kind, impact.cardId, false);
      if (hovered) {
        setRegionalImpactHoverForeground(viewport, impact.kind, impact.cardId, true);
      } else if (hoveredMapImpact?.kind === impact.kind && hoveredMapImpact.id === impact.cardId) {
        setRegionalImpactHoverForeground(viewport, impact.kind, impact.cardId, true);
      }
      setRegionalStationImpactHover(viewport, impact.kind, impact.cardId, hovered || (
        hoveredMapImpact?.kind === impact.kind && hoveredMapImpact.id === impact.cardId
      ));
    }
  };

  const markSelectionIntroComplete = () => {
    markCompletedSelectionIntro(viewport);
  };

  const dispose = () => {
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("focusin", handleFocusIn);
    document.removeEventListener("focusout", handleFocusOut);
    if (pulseFrame !== null) {
      window.cancelAnimationFrame(pulseFrame);
      pulseFrame = null;
    }
    if (settledPulseFrame !== null) {
      window.cancelAnimationFrame(settledPulseFrame);
      settledPulseFrame = null;
    }
    hoveredMapImpact = null;
    externallyHoveredImpactKeys.clear();
    overlapBadgePositions.clear();
  };

  return {
    update,
    updateSelection,
    updateStationSelection,
    setImpactHover,
    setExternalImpactsHover,
    markSelectionIntroComplete,
    dispose,
  };
}

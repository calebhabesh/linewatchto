"use client";

import type { KeyboardEvent } from "react";
import type {
  ImpactSelection,
  MapImpact,
  MapImpactKind,
} from "../app/linewatch-data";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import {
  overlapBadgeKindCounts,
  overlapBadgeVisualItemCount,
} from "./map-overlap-badges";

export type MapOverlapIndicatorSize = {
  width: number;
  height: number;
};

const OVERLAP_INDICATOR_SCALE = 1.5;
const OVERLAP_BADGE_CIRCLE_RADIUS = 35;
const OVERLAP_BADGE_ITEM_GAP = 10;
const OVERLAP_BADGE_ITEM_SPACING =
  OVERLAP_BADGE_CIRCLE_RADIUS * 2 + OVERLAP_BADGE_ITEM_GAP;
const OVERLAP_BADGE_PILL_THICKNESS =
  OVERLAP_BADGE_CIRCLE_RADIUS * 2 + OVERLAP_BADGE_ITEM_GAP * 2;
const MAP_BADGE_GLYPH_TOP = 124;
const MAP_BADGE_GLYPH_BOTTOM = 1662;
const MAP_BADGE_GLYPH_GAP = 28;

type MapBadgeGlyph = "+" | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

// Fixed Inter Black outlines keep the map counters typographically consistent
// without reintroducing browser-rendered SVG text that mobile Chromium can inflate.
const MAP_BADGE_GLYPH_OUTLINES: Record<MapBadgeGlyph, { width: number; path: string }> = {
  "0": {
    width: 1446,
    path: "M728 1658q-207 0-354-91t-225.5-261.5t-78.5-411.5t78.5-412.5t225.5-262.5t354-91t354.5 91.5t225.5 262.5t78 412t-78 411.5t-225 261.5t-355 91zm0-328q116 0 177-112t61-324q0-213-61-326.5t-177-113.5q-115 0-176.5 114t-61.5 326t61 324t177 112z",
  },
  "1": {
    width: 916,
    path: "M830 148v1490H426V496h-10L90 716V372l334-224h406z",
  },
  "2": {
    width: 1314,
    path: "M98 1638v-290l556-460q83-68 130.5-127.5t47.5-138.5q0-85-53.5-133.5T642 440q-85 0-136.5 50T454 634H70q0-157 70.5-270T340 189.5T642 128q179 0 310 57t202.5 160.5T1226 588q0 86-35.5 170.5T1063 946t-263 244l-140 116v10h582v322H98z",
  },
  "3": {
    width: 1360,
    path: "M680 1658q-176 0-312.5-60.5t-214-167.5T76 1184h406q0 65 57 106.5t145 41.5q84 0 136-43.5t52-112.5q0-68-61-111t-159-43H500V742h152q90 0 147-43.5t57-110.5q0-65-48-106.5T684 440q-84 0-138 43t-54 111H104q0-137 74.5-242T384 187.5T684 128q165 0 292 56t198.5 154T1246 562q0 124-86.5 204.5T940 862v10q180 20 270 110.5t90 227.5q0 131-79 232.5T1002.5 1601T680 1658z",
  },
  "4": {
    width: 1428,
    path: "M84 1406v-314l600-944h512v944h172v314h-172v232H808v-232H84zm734-314V568h-12l-324 512v12h336z",
  },
  "5": {
    width: 1314,
    path: "M656 1658q-172 0-305-60.5t-209-167.5t-78-246h394q0 77 58.5 122.5T656 1352q92 0 150-58.5t58-155.5q0-98-58-157t-150-59q-65 0-118.5 31T458 1038l-356-70 58-820h1002v324H492l-28 328h8q35-68 121-112t199-44q133 0 237 61.5t164.5 170T1254 1126q0 156-74 276t-208.5 188T656 1658z",
  },
  "6": {
    width: 1372,
    path: "M716 1658q-130 0-247-41t-206.5-130T122 1255.5T70 910q0-241 80.5-416.5T377 223t341-95q165 0 290 63.5t199.5 169T1294 594H896q-13-64-63.5-93T718 472q-127 0-186.5 110T472 872h8q43-102 148-160t232-58q136 0 237.5 61t158 167.5t56.5 243.5q0 160-76 280t-210 186t-310 66zm-4-306q91 0 149.5-60t58.5-152t-58.5-152T712 928q-88 0-147 60t-59 152t59 152t147 60z",
  },
  "7": {
    width: 1208,
    path: "M158 1638 742 480v-8H56V148h1106v324L574 1638H158z",
  },
  "8": {
    width: 1380,
    path: "M694 1658q-180 0-321-56t-222-152t-81-216q0-92 46-168.5T240.5 938T416 872v-10q-127-23-209.5-114.5T124 532q0-117 74-208t203-143.5T694 128q165 0 294.5 52.5t203.5 144t74 207.5q0 125-83.5 216T974 862v10q96 15 174.5 66t125 127.5T1320 1234q0 120-81 216t-222.5 152T694 1658zm0-278q86 0 142-51.5t56-130.5q0-77-56-126.5T694 1022q-85 0-140.5 49.5T498 1198q0 78 55.5 130t140.5 52zm0-638q77 0 126.5-46t49.5-116t-49.5-115T694 420q-75 0-124.5 44.5T520 580q0 69 49.5 115.5T694 742z",
  },
  "9": {
    width: 1372,
    path: "M664 1662q-164 0-289.5-64.5T176 1426.5T88 1192h398q14 64 64 95t114 31q128 0 187-112t59-292h-8q-43 102-148 160t-232 58q-135 0-237-61T126.5 903T70 660q0-161 76-281.5T356.5 191T666 124q131 0 247.5 41.5t206 131t141 233t51.5 346.5q0 241-80.5 417.5T1005 1566t-341 96zm6-804q89 0 147.5-60.5T876 646q0-92-58.5-152T670 434t-148.5 60T462 646t59 152t149 60z",
  },
  "+": {
    width: 1410,
    path: "M547 1572v-384H172V878h375V494h326v384h375v310H873v384H547z",
  },
};

export function mapOverlapIndicatorSize(
  impacts: Pick<MapImpact, "kind">[],
): MapOverlapIndicatorSize {
  const impactKindCount = overlapBadgeVisualItemCount(overlapBadgeKindCounts(impacts));
  return mapOverlapIndicatorSizeForKindCount(impactKindCount);
}

export function mapOverlapIndicatorSizeForKindCount(
  impactKindCount: number,
): MapOverlapIndicatorSize {
  if (impactKindCount === 1) {
    return {
      width: OVERLAP_BADGE_PILL_THICKNESS * OVERLAP_INDICATOR_SCALE,
      height: OVERLAP_BADGE_PILL_THICKNESS * OVERLAP_INDICATOR_SCALE,
    };
  }

  const visibleCount = Math.min(3, impactKindCount);
  const hasMore = impactKindCount > visibleCount;
  const totalItems = visibleCount + (hasMore ? 1 : 0);
  return {
    width: Math.max(
      OVERLAP_BADGE_PILL_THICKNESS,
      (totalItems - 1) * OVERLAP_BADGE_ITEM_SPACING + OVERLAP_BADGE_PILL_THICKNESS,
    ) * OVERLAP_INDICATOR_SCALE,
    height: OVERLAP_BADGE_PILL_THICKNESS * OVERLAP_INDICATOR_SCALE,
  };
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

function MapBadgeVectorLabel({
  label,
  targetHeight,
  maxWidth,
}: {
  label: string;
  targetHeight: number;
  maxWidth: number;
}) {
  const glyphs = [...label].filter((glyph): glyph is MapBadgeGlyph => glyph === "+" || /\d/.test(glyph));
  const contentWidth = glyphs.reduce(
    (width, glyph) => width + MAP_BADGE_GLYPH_OUTLINES[glyph].width,
    Math.max(0, glyphs.length - 1) * MAP_BADGE_GLYPH_GAP,
  );
  const glyphHeight = MAP_BADGE_GLYPH_BOTTOM - MAP_BADGE_GLYPH_TOP;
  const scale = Math.min(targetHeight / glyphHeight, maxWidth / contentWidth);
  let cursorX = 0;

  return (
    <g
      aria-hidden="true"
      className="overlap-indicator-vector-label"
      transform={`translate(${-contentWidth * scale / 2} ${-(MAP_BADGE_GLYPH_TOP + glyphHeight / 2) * scale}) scale(${scale})`}
    >
      {glyphs.map((glyph, index) => {
        const outline = MAP_BADGE_GLYPH_OUTLINES[glyph];
        const x = cursorX;
        cursorX += outline.width + MAP_BADGE_GLYPH_GAP;
        return <path key={`${glyph}-${index}`} d={outline.path} transform={`translate(${x} 0)`} />;
      })}
    </g>
  );
}

function OverlapKindCountBadge({ count, large = false }: { count: number; large?: boolean }) {
  const offset = large ? 35 : 28;
  const radius = large ? 26 : 18;
  return (
    <g transform={`translate(${offset} -${offset})`}>
      <circle className="overlap-indicator-count-badge" r={radius} />
      <MapBadgeVectorLabel
        label={String(count)}
        targetHeight={large ? 32 : 22}
        maxWidth={radius * 2 - 8}
      />
    </g>
  );
}

function OverlapKindIcon({ kind, size }: { kind: MapImpactKind; size: number }) {
  const offset = -size / 2;
  return (
    <g transform={`translate(${offset} ${offset})`}>
      <ImpactTypeIcon
        kind={kind}
        size={size}
        className={`overlap-indicator-type-icon ${kind}`}
      />
    </g>
  );
}

export function MapOverlapIndicator({
  markerId,
  label,
  impacts,
  position,
  size,
  selection,
  isOpen,
  visualScale = 1,
  collisionAvoided = true,
  isolatePointerDown = false,
  onActivate,
  onHoverChange,
  shouldSuppressMapClick = () => false,
}: {
  markerId: string;
  label: string;
  impacts: MapImpact[];
  position: { x: number; y: number };
  size: MapOverlapIndicatorSize;
  selection: ImpactSelection;
  isOpen?: boolean;
  visualScale?: number;
  collisionAvoided?: boolean;
  isolatePointerDown?: boolean;
  onActivate: () => void;
  onHoverChange?: (hovered: boolean) => void;
  shouldSuppressMapClick?: () => boolean;
}) {
  const open = Boolean(isOpen);
  const kindCounts = overlapBadgeKindCounts(impacts);
  const visibleKindCounts = kindCounts.slice(0, 3);
  const hiddenKindCount = Math.max(0, kindCounts.length - visibleKindCounts.length);
  const totalItems = visibleKindCounts.length + (hiddenKindCount > 0 ? 1 : 0);
  const isSingleVisualItem = totalItems === 1;
  const isSingleKindOverlap = kindCounts.length === 1 && (kindCounts[0]?.count ?? 0) > 1;
  const isSelected = selection
    ? impacts.some((impact) => impact.kind === selection.kind && impact.cardId === selection.id)
    : false;
  const accessibleLabel = `Overlapping alerts: ${kindCounts
    .map(({ kind, count }) => `${labelForImpactKind(kind)}${count > 1 ? ` x${count}` : ""}`)
    .join(" + ")} on ${label}`;

  const activate = () => {
    onHoverChange?.(false);
    onActivate();
  };
  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activate();
  };

  return (
    <g
      className={`overlap-indicator-group ${isOpen ? "open" : ""}`}
      data-overlap-segment-id={markerId}
      data-overlap-collision-avoided={collisionAvoided ? "true" : "false"}
      onPointerDown={isolatePointerDown ? (event) => event.stopPropagation() : undefined}
      onClick={(event) => {
        if (shouldSuppressMapClick()) return;
        event.stopPropagation();
        activate();
      }}
      transform={`translate(${position.x} ${position.y}) scale(${visualScale})`}
    >
      <g
        aria-expanded={isOpen}
        aria-label={open ? `Close alert chooser for ${label}` : accessibleLabel}
        className={`overlap-indicator ${isSelected ? "selected" : ""} ${open ? "open" : ""}`}
        onKeyDown={handleKeyDown}
        onPointerEnter={(event) => {
          if (!open && event.pointerType === "mouse") onHoverChange?.(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") onHoverChange?.(false);
        }}
        onFocus={() => {
          if (!open && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
            onHoverChange?.(true);
          }
        }}
        onBlur={() => onHoverChange?.(false)}
        pointerEvents="auto"
        role="button"
        tabIndex={0}
      >
        <title>{accessibleLabel}</title>
        {isSingleVisualItem ? (
          <circle className="overlap-indicator-pill" r={size.height / 2} />
        ) : (
          <rect
            className="overlap-indicator-pill"
            x={-size.width / 2}
            y={-size.height / 2}
            width={size.width}
            height={size.height}
            rx={size.height / 2}
          />
        )}
        <g transform={`scale(${OVERLAP_INDICATOR_SCALE})`}>
          {visibleKindCounts.map(({ kind, count }, index) => {
            const x = (index - (totalItems - 1) / 2) * OVERLAP_BADGE_ITEM_SPACING;
            return (
              <g
                key={kind}
                data-overlap-kind={kind}
                data-overlap-kind-count={count}
                transform={`translate(${x} 0)`}
              >
                <circle className={`overlap-indicator-badge ${kind}`} r={OVERLAP_BADGE_CIRCLE_RADIUS} />
                <OverlapKindIcon kind={kind} size={44} />
              </g>
            );
          })}
          {hiddenKindCount > 0 ? (
            <g transform={`translate(${(visibleKindCounts.length - (totalItems - 1) / 2) * OVERLAP_BADGE_ITEM_SPACING} 0)`}>
              <circle className="overlap-indicator-badge more" r={27} />
              <MapBadgeVectorLabel label={`+${hiddenKindCount}`} targetHeight={22} maxWidth={44} />
            </g>
          ) : null}
          {visibleKindCounts.map(({ kind, count }, index) => {
            if (count <= 1) return null;
            const x = (index - (totalItems - 1) / 2) * OVERLAP_BADGE_ITEM_SPACING;
            return (
              <g key={`${kind}-count`} transform={`translate(${x} 0)`}>
                <OverlapKindCountBadge count={count} large={isSingleKindOverlap} />
              </g>
            );
          })}
        </g>
      </g>
    </g>
  );
}

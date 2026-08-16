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
const MAP_BADGE_GLYPH_WIDTH = 12;
const MAP_BADGE_GLYPH_HEIGHT = 16;
const MAP_BADGE_GLYPH_GAP = 3;

type MapBadgeGlyph = "+" | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

const MAP_BADGE_DIGIT_SEGMENTS: Record<Exclude<MapBadgeGlyph, "+">, string> = {
  "0": "abcedf",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgecd",
  "7": "abc",
  "8": "abcdefg",
  "9": "abfgcd",
};

const MAP_BADGE_SEGMENT_RECTS: Record<string, { x: number; y: number; width: number; height: number }> = {
  a: { x: 2, y: 0, width: 8, height: 2 },
  b: { x: 10, y: 2, width: 2, height: 5 },
  c: { x: 10, y: 9, width: 2, height: 5 },
  d: { x: 2, y: 14, width: 8, height: 2 },
  e: { x: 0, y: 9, width: 2, height: 5 },
  f: { x: 0, y: 2, width: 2, height: 5 },
  g: { x: 2, y: 7, width: 8, height: 2 },
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
  const contentWidth = glyphs.length * MAP_BADGE_GLYPH_WIDTH
    + Math.max(0, glyphs.length - 1) * MAP_BADGE_GLYPH_GAP;
  const scale = Math.min(targetHeight / MAP_BADGE_GLYPH_HEIGHT, maxWidth / contentWidth);

  return (
    <g
      aria-hidden="true"
      className="overlap-indicator-vector-label"
      transform={`translate(${-contentWidth * scale / 2} ${-MAP_BADGE_GLYPH_HEIGHT * scale / 2}) scale(${scale})`}
    >
      {glyphs.map((glyph, index) => {
        const x = index * (MAP_BADGE_GLYPH_WIDTH + MAP_BADGE_GLYPH_GAP);
        if (glyph === "+") {
          return (
            <g key={`${glyph}-${index}`} transform={`translate(${x} 0)`}>
              <rect x="1" y="7" width="10" height="2" rx="1" />
              <rect x="5" y="3" width="2" height="10" rx="1" />
            </g>
          );
        }

        return (
          <g key={`${glyph}-${index}`} transform={`translate(${x} 0)`}>
            {[...MAP_BADGE_DIGIT_SEGMENTS[glyph]].map((segment) => {
              const rect = MAP_BADGE_SEGMENT_RECTS[segment];
              return <rect key={segment} {...rect} rx="1" />;
            })}
          </g>
        );
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

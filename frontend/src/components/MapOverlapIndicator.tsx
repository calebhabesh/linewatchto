"use client";

import { OVERLAP_BADGE_CONNECTOR_DOT_RADIUS, type OverlapBadgeConnector } from "./overlap-badge-connector";
import { useRef, type KeyboardEvent } from "react";
import type {
  ImpactSelection,
  MapImpact,
  MapImpactKind,
} from "../app/linewatch-data";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import {
  overlapBadgeKindCounts,
  type MapOverlapIndicatorSize,
} from "./map-overlap-badges";
import {
  MAP_BADGE_GLYPH_BOTTOM,
  MAP_BADGE_GLYPH_GAP,
  MAP_BADGE_GLYPH_OUTLINES,
  MAP_BADGE_GLYPH_TOP,
  OVERLAP_BADGE_CIRCLE_RADIUS,
  OVERLAP_BADGE_ITEM_SPACING,
  OVERLAP_INDICATOR_SCALE,
  type MapBadgeGlyph,
} from "./map-overlap-svg";

const restoringIndicatorFocus = new WeakSet<SVGGElement>();

/** Return keyboard focus after dismissal without starting a new map preview. */
export function restoreMapOverlapIndicatorFocus(indicator: SVGGElement | null | undefined) {
  if (!indicator) return;
  restoringIndicatorFocus.add(indicator);
  try {
    indicator.focus({ preventScroll: true });
  } finally {
    restoringIndicatorFocus.delete(indicator);
  }
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

export function MapBadgeVectorLabel({
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

function OverlapKindCountBadge({ count }: { count: number }) {
  const offset = 28;
  const radius = 18;
  return (
    <g transform={`translate(${offset} -${offset})`}>
      <circle className="overlap-indicator-count-badge" r={radius} />
      <MapBadgeVectorLabel
        label={String(count)}
        targetHeight={22}
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
  linkedSelectionIds,
  isOpen,
  visualScale = 1,
  collisionAvoided = true,
  isolatePointerDown = false,
  connector = null,
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
  /** Current impacts the selected planned advisory spawned; a badge showing one counts as selected. */
  linkedSelectionIds?: readonly string[];
  isOpen?: boolean;
  visualScale?: number;
  collisionAvoided?: boolean;
  isolatePointerDown?: boolean;
  /** Line to the overlay this badge explains, shown on hover, focus, or while open. */
  connector?: OverlapBadgeConnector | null;
  onActivate: () => void;
  onHoverChange?: (hovered: boolean) => void;
  shouldSuppressMapClick?: () => boolean;
}) {
  const pointerStartedMapGesture = useRef(!isolatePointerDown);
  const open = Boolean(isOpen);
  const kindCounts = overlapBadgeKindCounts(impacts);
  const visibleKindCounts = kindCounts.slice(0, 3);
  const hiddenKindCount = Math.max(0, kindCounts.length - visibleKindCounts.length);
  const totalItems = visibleKindCounts.length + (hiddenKindCount > 0 ? 1 : 0);
  const isSingleVisualItem = totalItems === 1;
  const isSelected = selection
    ? impacts.some((impact) => (impact.kind === selection.kind && impact.cardId === selection.id)
      || (impact.kind !== "planned-closure" && linkedSelectionIds?.includes(impact.cardId)))
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
      onPointerDown={(event) => {
        const isolated = isolatePointerDown && event.pointerType === "mouse";
        pointerStartedMapGesture.current = !isolated;
        if (isolated) event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        // Touch and pen can pan through the badge. Mouse activation remains
        // isolated, so an earlier map drag cannot suppress a fresh click.
        if (event.detail !== 0 && pointerStartedMapGesture.current && shouldSuppressMapClick()) return;
        activate();
      }}
      transform={`translate(${position.x} ${position.y}) scale(${visualScale})`}
    >
      {connector ? (
        <OverlapBadgeConnectorLine connector={connector} position={position} visualScale={visualScale} />
      ) : null}
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
        onFocus={(event) => {
          if (!open && !restoringIndicatorFocus.has(event.currentTarget)
            && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
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
                <OverlapKindCountBadge count={count} />
              </g>
            );
          })}
        </g>
      </g>
    </g>
  );
}

/** Drawn in the badge's own coordinates so it inherits the badge's hover state. */
function OverlapBadgeConnectorLine({
  connector,
  position,
  visualScale,
}: {
  connector: OverlapBadgeConnector;
  position: { x: number; y: number };
  visualScale: number;
}) {
  const local = (point: { x: number; y: number }) => ({
    x: (point.x - position.x) / visualScale,
    y: (point.y - position.y) / visualScale,
  });
  const from = local(connector.from);
  const to = local(connector.to);
  return (
    <g className="overlap-badge-connector" aria-hidden="true" pointerEvents="none">
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
      <circle cx={to.x} cy={to.y} r={OVERLAP_BADGE_CONNECTOR_DOT_RADIUS} />
    </g>
  );
}

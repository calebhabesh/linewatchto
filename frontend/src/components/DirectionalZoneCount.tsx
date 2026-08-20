"use client";

import { ArrowDown, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReducedSpeedZone } from "../app/linewatch-data";
import {
  countReducedSpeedZonesByDirection,
  type ReducedSpeedZoneDirection,
} from "../app/reduced-speed-zone-count";

const DIRECTION_LABELS: Record<ReducedSpeedZoneDirection, string> = {
  northbound: "Northbound",
  southbound: "Southbound",
  eastbound: "Eastbound",
  westbound: "Westbound",
  bidirectional: "Both directions",
  unknown: "Direction not specified",
};

const LINE_DIRECTION_COLORS: Record<string, string> = {
  "line-1": "#F8C300",
  "line-2": "#00923F",
  "line-4": "#A21A68",
  "line-5": "#EB8738",
  "line-6": "#969594",
};

function DirectionCountArrow({
  direction,
  verticalLine,
}: {
  direction: ReducedSpeedZoneDirection;
  verticalLine: boolean;
}) {
  const props = { size: 14, strokeWidth: 3, "aria-hidden": true } as const;
  if (direction === "northbound") return <ArrowUp {...props} />;
  if (direction === "southbound") return <ArrowDown {...props} />;
  if (direction === "eastbound") return <ArrowRight {...props} />;
  if (direction === "westbound") return <ArrowLeft {...props} />;
  if (direction === "bidirectional") {
    return verticalLine ? <ArrowUpDown {...props} /> : <ArrowLeftRight {...props} />;
  }
  return <span aria-hidden="true">?</span>;
}

export function ReducedSpeedZoneDirectionArrow({
  direction,
  lineId,
}: {
  direction: ReducedSpeedZoneDirection;
  lineId: string;
}) {
  return (
    <span
      className="rsz-direction-arrow"
      style={{
        color: LINE_DIRECTION_COLORS[lineId] ?? "#F59E0B",
        display: "inline-flex",
        alignItems: "center",
      }}
      aria-hidden="true"
    >
      <DirectionCountArrow direction={direction} verticalLine={lineId === "line-1"} />
    </span>
  );
}

export function ReducedSpeedZoneDirectionTextArrow({
  direction,
  lineId,
}: {
  direction: ReducedSpeedZoneDirection;
  lineId: string;
}) {
  const verticalLine = lineId === "line-1";
  const glyph = direction === "northbound" ? "↑"
    : direction === "southbound" ? "↓"
      : direction === "eastbound" ? "→"
        : direction === "westbound" ? "←"
          : direction === "bidirectional" ? (verticalLine ? "↕" : "↔")
            : "?";

  return (
    <span
      style={{ color: LINE_DIRECTION_COLORS[lineId] ?? "#F59E0B", fontWeight: 900 }}
      aria-hidden="true"
    >
      {glyph}
    </span>
  );
}

export function DirectionalZoneCount({ zone }: { zone: ReducedSpeedZone }) {
  const directionCounts = countReducedSpeedZonesByDirection(zone);
  const verticalLine = zone.lineId === "line-1";
  const directionOrder: ReducedSpeedZoneDirection[] = verticalLine
    ? ["northbound", "southbound", "bidirectional", "unknown", "eastbound", "westbound"]
    : ["eastbound", "westbound", "bidirectional", "unknown", "northbound", "southbound"];
  const sortedCounts = [...directionCounts].sort(
    (left, right) => directionOrder.indexOf(left.direction) - directionOrder.indexOf(right.direction),
  );

  return (
    <span
      className="rsz-zone-direction-breakdown"
      style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}
    >
      {sortedCounts.map(({ direction, count, destination }) => {
        const label = DIRECTION_LABELS[direction];
        const destinationLabel = destination ? ` to ${destination}` : "";
        return (
          <span
            key={direction}
            className="rsz-zone-direction-row"
            role="img"
            aria-label={`${label}: ${count} ${count === 1 ? "zone" : "zones"}${destinationLabel}`}
            title={`${label}: ${count} ${count === 1 ? "zone" : "zones"}${destinationLabel}`}
            style={{ display: "inline-flex", flexDirection: "row", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}
          >
            <ReducedSpeedZoneDirectionArrow direction={direction} lineId={zone.lineId} />
            <strong aria-hidden="true">{count}</strong>
            <span
              className="rsz-zone-direction-label"
              style={{ color: "var(--quiet)", fontWeight: 400, opacity: 0.78, marginInlineStart: 3 }}
              aria-hidden="true"
            >
              {label}
            </span>
          </span>
        );
      })}
    </span>
  );
}

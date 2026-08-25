import type { ReducedSpeedZone } from "./linewatch-data.ts";
import {
  normalizeReducedSpeedZoneDirection,
  type ReducedSpeedZoneDirection,
} from "./reduced-speed-zone-count.ts";

export type ReducedSpeedZoneTimingField = "startedAt" | "updatedAt";

export type ReducedSpeedZoneTimingEntry = {
  timestamp: string;
  direction: ReducedSpeedZoneDirection;
  count: number;
};

function timestampKey(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? timestamp.trim() : String(parsed);
}

function compareTimestamps(left: string, right: string): number {
  const leftParsed = Date.parse(left);
  const rightParsed = Date.parse(right);
  if (!Number.isNaN(leftParsed) && !Number.isNaN(rightParsed)) {
    return leftParsed - rightParsed;
  }
  return left.localeCompare(right);
}

function directionRank(lineId: string, direction: ReducedSpeedZoneDirection): number {
  const order: ReducedSpeedZoneDirection[] = lineId === "line-1"
    ? ["northbound", "southbound", "bidirectional", "unknown", "eastbound", "westbound"]
    : ["eastbound", "westbound", "bidirectional", "unknown", "northbound", "southbound"];
  return order.indexOf(direction);
}

/**
 * Returns at most one aggregate timing per direction when source zones disagree.
 * A direction starts with its earliest zone and is updated with its latest zone.
 */
export function reducedSpeedZoneTimingEntries(
  zone: ReducedSpeedZone,
  field: ReducedSpeedZoneTimingField,
): ReducedSpeedZoneTimingEntry[] {
  const details = (zone.directionalDetails ?? []).filter((detail) => detail[field]?.trim());
  const distinctTimestamps = new Set(details.map((detail) => timestampKey(detail[field]!)));
  if (details.length < 2 || distinctTimestamps.size < 2) return [];

  const groups = new Map<ReducedSpeedZoneDirection, ReducedSpeedZoneTimingEntry>();
  for (const detail of details) {
    const timestamp = detail[field]!.trim();
    const direction = normalizeReducedSpeedZoneDirection(detail.displayDirection ?? "");
    const existing = groups.get(direction);
    const useIncomingTimestamp = !existing
      || (field === "startedAt"
        ? compareTimestamps(timestamp, existing.timestamp) < 0
        : compareTimestamps(timestamp, existing.timestamp) > 0);
    groups.set(direction, {
      timestamp: useIncomingTimestamp ? timestamp : existing.timestamp,
      direction,
      count: (existing?.count ?? 0) + 1,
    });
  }

  return [...groups.values()].sort((left, right) =>
    directionRank(zone.lineId, left.direction) - directionRank(zone.lineId, right.direction),
  );
}

import type { ReducedSpeedZone } from "./linewatch-data";

export type ReducedSpeedZoneResolutionEntry = {
  resolution: string;
  count: number;
  direction: string;
};

const directionRank = (lineId: string, direction: string): number => {
  const normalized = direction.trim().toLowerCase();
  const order = lineId === "line-1"
    ? ["northbound", "southbound", "eastbound", "westbound"]
    : ["eastbound", "westbound", "northbound", "southbound"];
  const rank = order.findIndex((candidate) => normalized.includes(candidate));
  return rank === -1 ? order.length : rank;
};

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function resolutionRank(value: string): number {
  const normalized = value.toLowerCase();
  const month = MONTHS.findIndex((candidate) => normalized.includes(candidate));
  return month === -1 ? Number.MAX_SAFE_INTEGER : month;
}

export function reducedSpeedZoneResolutionEntries(
  zone: ReducedSpeedZone,
): ReducedSpeedZoneResolutionEntry[] {
  const directions = new Map<string, {
    direction: string;
    resolutions: Map<string, { resolution: string; count: number }>;
    count: number;
  }>();
  const hasDetailedResolution = (zone.directionalDetails ?? []).some((detail) => detail.resolution?.trim());
  if (!hasDetailedResolution) return [];

  for (const detail of zone.directionalDetails ?? []) {
    const resolution = detail.resolution?.trim() || "TBD";
    const direction = detail.displayDirection?.trim() || "Unknown";
    const directionKey = direction.toLowerCase();
    const aggregate = directions.get(directionKey) ?? {
      direction,
      resolutions: new Map<string, { resolution: string; count: number }>(),
      count: 0,
    };
    const resolutionKey = resolution.toLowerCase();
    const existingResolution = aggregate.resolutions.get(resolutionKey);
    aggregate.resolutions.set(resolutionKey, {
      resolution,
      count: (existingResolution?.count ?? 0) + 1,
    });
    aggregate.count += 1;
    directions.set(directionKey, aggregate);
  }

  return [...directions.values()].map(({ direction, resolutions, count }) => {
    const preferredResolution = [...resolutions.values()].sort((left, right) =>
      right.count - left.count
        || resolutionRank(left.resolution) - resolutionRank(right.resolution)
        || left.resolution.localeCompare(right.resolution),
    )[0] ?? { resolution: "TBD", count: 0 };
    return {
      resolution: preferredResolution.resolution,
      direction,
      count,
    };
  }).sort((left, right) =>
    directionRank(zone.lineId, left.direction) - directionRank(zone.lineId, right.direction),
  );
}

export function reducedSpeedZoneResolutionText(zone: ReducedSpeedZone): string {
  const entries = reducedSpeedZoneResolutionEntries(zone);
  if (entries.length === 0) return zone.resolution || zone.targetRemoval || "TBD";
  if (entries.length === 1 && entries[0].count === 1) return entries[0].resolution;
  return entries.map(({ resolution, count }) => `${resolution} (${count})`).join(", ");
}

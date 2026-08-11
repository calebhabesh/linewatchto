import type { ReducedSpeedZone } from "./linewatch-data";

export type ReducedSpeedZoneDirection =
  | "northbound"
  | "southbound"
  | "eastbound"
  | "westbound"
  | "bidirectional"
  | "unknown";

export type ReducedSpeedZoneDirectionCount = {
  direction: ReducedSpeedZoneDirection;
  count: number;
  destination: string | null;
};

/**
 * TTC counts every published slow order, including multiple slow orders on the
 * same track segment. LineWatch groups overlapping records into one map card,
 * so the number of cards is not the public TTC zone count.
 */
export function countReducedSpeedZones(zones: ReducedSpeedZone[]): number {
  const sourceAlertIds = new Set<string>();
  let groupsWithoutSourceIds = 0;

  for (const zone of zones) {
    const groupSourceIds = new Set(
      (zone.sourceAlertIds ?? [])
        .map((sourceAlertId) => sourceAlertId.trim())
        .filter(Boolean),
    );

    if (groupSourceIds.size === 0) {
      groupsWithoutSourceIds += 1;
      continue;
    }

    groupSourceIds.forEach((sourceAlertId) => sourceAlertIds.add(sourceAlertId));
  }

  return sourceAlertIds.size + groupsWithoutSourceIds;
}

function normalizedDirection(value: string): ReducedSpeedZoneDirection {
  const direction = value.trim().toLowerCase();
  const hasNorthbound = direction.includes("northbound");
  const hasSouthbound = direction.includes("southbound");
  const hasEastbound = direction.includes("eastbound");
  const hasWestbound = direction.includes("westbound");

  if ((hasNorthbound && hasSouthbound) || (hasEastbound && hasWestbound)) return "bidirectional";
  if (hasNorthbound) return "northbound";
  if (hasSouthbound) return "southbound";
  if (hasEastbound) return "eastbound";
  if (hasWestbound) return "westbound";
  if (/both directions|both ways|bidirectional/.test(direction)) return "bidirectional";
  return "unknown";
}

export function countReducedSpeedZonesByDirection(
  zone: ReducedSpeedZone,
): ReducedSpeedZoneDirectionCount[] {
  const sourceDirections = new Map<string, {
    direction: ReducedSpeedZoneDirection;
    destination: string | null;
  }>();

  for (const detail of zone.directionalDetails ?? []) {
    const sourceAlertId = detail.sourceAlertId.trim();
    if (!sourceAlertId) continue;
    const direction = normalizedDirection(detail.displayDirection);
    const existing = sourceDirections.get(sourceAlertId);
    const destination = detail.location.split(/\s+to\s+/i, 2)[1]?.trim() || null;
    sourceDirections.set(
      sourceAlertId,
      existing && existing.direction !== direction
        ? { direction: "unknown", destination: null }
        : { direction, destination: existing?.destination ?? destination },
    );
  }

  for (const sourceAlertId of zone.sourceAlertIds ?? []) {
    const normalizedSourceAlertId = sourceAlertId.trim();
    if (normalizedSourceAlertId && !sourceDirections.has(normalizedSourceAlertId)) {
      sourceDirections.set(normalizedSourceAlertId, { direction: "unknown", destination: null });
    }
  }

  if (sourceDirections.size === 0) {
    return [{ direction: normalizedDirection(zone.displayDirection), count: 1, destination: null }];
  }

  const counts = new Map<ReducedSpeedZoneDirection, { count: number; destinations: Set<string> }>();
  sourceDirections.forEach(({ direction, destination }) => {
    const aggregate = counts.get(direction) ?? { count: 0, destinations: new Set<string>() };
    aggregate.count += 1;
    if (destination) aggregate.destinations.add(destination);
    counts.set(direction, aggregate);
  });

  return [...counts].map(([direction, aggregate]) => ({
    direction,
    count: aggregate.count,
    destination: aggregate.destinations.size === 1 ? [...aggregate.destinations][0] : null,
  }));
}

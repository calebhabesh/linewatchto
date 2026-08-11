import type { ReducedSpeedZone } from "./linewatch-data";

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

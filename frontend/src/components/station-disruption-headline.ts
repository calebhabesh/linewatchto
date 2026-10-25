export type StationDisruptionTone = "active" | "delay" | "planned" | "reduced-speed-zone";

const TONE_PRIORITY: Record<StationDisruptionTone, number> = {
  active: 0,
  delay: 1,
  "reduced-speed-zone": 2,
  planned: 3,
};

export type StationDisruptionGroup<T> = {
  key: string;
  /** Distinct classifications in the group, e.g. "Active Closure, Suspension". */
  label: string;
  tone: StationDisruptionTone;
  items: T[];
};

/**
 * Groups station impacts that share a badge icon for the disruption summary,
 * ordering active service changes before delays, slow zones, and planned work.
 */
export function groupStationDisruptions<T>(
  impacts: readonly T[],
  describe: (impact: T) => { key: string; label: string; tone: StationDisruptionTone },
): StationDisruptionGroup<T>[] {
  const groups = new Map<string, StationDisruptionGroup<T>>();
  for (const impact of impacts) {
    const { key, label, tone } = describe(impact);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { key, label, tone, items: [impact] });
      continue;
    }
    group.items.push(impact);
    if (!group.label.split(", ").includes(label)) group.label = `${group.label}, ${label}`;
  }
  return [...groups.values()].sort((a, b) => TONE_PRIORITY[a.tone] - TONE_PRIORITY[b.tone]);
}

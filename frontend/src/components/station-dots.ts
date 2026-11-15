import type { NetworkSegment } from "../app/linewatch-data.ts";

/**
 * Which drawn dot of a station an alert meets. Most stations are one dot for
 * every line (Union's pill, Bloor-Yonge), but a few draw a dot per line joined
 * by a connector (GO/UP's Weston, Mount Dennis and Bloor; TTC's Spadina).
 * Alerts on different dots of those stations are separate marks on separate
 * lines, so they do not overlap there.
 *
 * Dots come from the segments themselves: a segment names the dot it ends on
 * (`stationAAnchorId` / `stationBAnchorId`). `dotId: null` means the alert
 * covers the whole station (no named dot, or a station alert whose line is
 * unknown), so it meets every dot there.
 */
export type StationTouch = {
  stationId: string;
  dotId: string | null;
};

export type StationDotSegment = Pick<NetworkSegment, "stationAId" | "stationBId"> &
  Partial<Pick<NetworkSegment, "lineId" | "stationAAnchorId" | "stationBAnchorId">>;

/** Both ends of a segment, each on the dot the segment names there. */
export function segmentStationTouches(segment: StationDotSegment): StationTouch[] {
  const touches: StationTouch[] = [];
  if (segment.stationAId) touches.push({ stationId: segment.stationAId, dotId: segment.stationAAnchorId || null });
  if (segment.stationBId) touches.push({ stationId: segment.stationBId, dotId: segment.stationBAnchorId || null });
  return touches;
}

/**
 * Looks up the dot a line uses at a station from the segments that end there,
 * for station alerts, which name a station but not a dot.
 */
export function stationLineDotLookup(
  segments: readonly StationDotSegment[],
): (stationId: string, lineId: string | null | undefined) => string | null {
  const dots = new Map<string, string>();
  for (const segment of segments) {
    if (!segment.lineId) continue;
    for (const touch of segmentStationTouches(segment)) {
      const key = `${touch.stationId}|${segment.lineId}`;
      if (touch.dotId && !dots.has(key)) dots.set(key, touch.dotId);
    }
  }
  return (stationId, lineId) => (lineId ? dots.get(`${stationId}|${lineId}`) ?? null : null);
}

/** Two alerts meet at a station when they share it and a dot there (a whole-station touch meets every dot). */
export function stationTouchesMeet(a: StationTouch, b: StationTouch): boolean {
  return a.stationId === b.stationId && (a.dotId === null || b.dotId === null || a.dotId === b.dotId);
}

export function anyStationTouchesMeet(a: readonly StationTouch[], b: readonly StationTouch[]): boolean {
  return a.some((touch) => b.some((other) => stationTouchesMeet(touch, other)));
}

/**
 * Splits what meets at one station into the clusters that share a dot. Items
 * on the same dot cluster together; an item on several dots joins them; an
 * item covering the whole station joins everything there.
 */
export function clusterByStationDot<T>(
  entries: readonly { item: T; key: string; dotId: string | null }[],
): { items: T[]; dotIds: string[] }[] {
  // A whole-station item meets every dot, so everything there is one cluster
  // and it sits by the whole station (no dot ids).
  if (entries.some((entry) => entry.dotId === null)) {
    return [{ items: uniqueItems(entries), dotIds: [] }];
  }

  // Union-find over dots, joined by items that land on more than one.
  const parent = new Map<string, string>();
  const find = (dot: string): string => {
    const next = parent.get(dot) ?? dot;
    if (next === dot) return dot;
    const root = find(next);
    parent.set(dot, root);
    return root;
  };
  const firstDotByKey = new Map<string, string>();
  for (const { key, dotId } of entries) {
    const dot = dotId as string;
    if (!parent.has(dot)) parent.set(dot, dot);
    const first = firstDotByKey.get(key);
    if (first === undefined) firstDotByKey.set(key, dot);
    else parent.set(find(dot), find(first));
  }

  const clusters = new Map<string, { entries: typeof entries[number][]; dotIds: Set<string> }>();
  for (const entry of entries) {
    const root = find(entry.dotId as string);
    const cluster = clusters.get(root) ?? { entries: [], dotIds: new Set<string>() };
    cluster.entries.push(entry);
    cluster.dotIds.add(entry.dotId as string);
    clusters.set(root, cluster);
  }
  return Array.from(clusters.values(), (cluster) => ({
    items: uniqueItems(cluster.entries),
    dotIds: Array.from(cluster.dotIds).sort(),
  }));
}

function uniqueItems<T>(entries: readonly { item: T; key: string }[]): T[] {
  const byKey = new Map<string, T>();
  for (const { item, key } of entries) if (!byKey.has(key)) byKey.set(key, item);
  return Array.from(byKey.values());
}

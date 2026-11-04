/**
 * Recent Stops (plan 14, U6): the last few surface stops opened on this
 * device, shown in the empty search box. Only stop numbers and networks are
 * kept, never a position. Browser storage can be blocked, full or cleared:
 * the list then lasts until the page closes, and search works without it.
 */

import type { NetworkId } from "./dashboard-contract.ts";

export const RECENT_STOPS_STORAGE_KEY = "linewatch-recent-stops-v1";
export const RECENT_STOPS_LIMIT = 5;

export type RecentStop = { network: NetworkId; code: string };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function isRecentStop(value: unknown): value is RecentStop {
  const entry = value as Partial<RecentStop> | null;
  return Boolean(entry
    && (entry.network === "ttc" || entry.network === "regional")
    && typeof entry.code === "string" && /^\d{1,7}$/.test(entry.code));
}

/** The stored list, or empty when storage is missing, blocked or holds something else. */
export function readRecentStops(storage: StorageLike | null): RecentStop[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(RECENT_STOPS_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentStop)
      .map(({ network, code }) => ({ network, code }))
      .slice(0, RECENT_STOPS_LIMIT);
  } catch {
    return [];
  }
}

/** `stop` first, without its earlier entry, at most five. */
export function withRecentStop(list: readonly RecentStop[], stop: RecentStop): RecentStop[] {
  return [stop, ...list.filter((entry) => entry.network !== stop.network || entry.code !== stop.code)]
    .slice(0, RECENT_STOPS_LIMIT);
}

/** Saves the list; false when storage refused it. */
export function writeRecentStops(storage: StorageLike | null, list: readonly RecentStop[]): boolean {
  if (!storage) return false;
  try {
    storage.setItem(RECENT_STOPS_STORAGE_KEY, JSON.stringify(list.map(({ network, code }) => ({ network, code }))));
    return true;
  } catch {
    return false;
  }
}

/**
 * The list in memory, read from storage once and written back on each
 * change. A failed write keeps the list for this page.
 */
export function createRecentStopsStore(storage: () => StorageLike | null) {
  let list: RecentStop[] | null = null;
  const listeners = new Set<() => void>();
  const current = () => (list ??= readRecentStops(storage()));
  return {
    getSnapshot: current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    record(stop: RecentStop) {
      const before = current();
      if (before[0]?.network === stop.network && before[0].code === stop.code) return;
      list = withRecentStop(before, stop);
      writeRecentStops(storage(), list);
      for (const listener of listeners) listener();
    },
  };
}

export type RecentStopsStore = ReturnType<typeof createRecentStopsStore>;

import {
  getStationDetail,
  preserveStationDetailOnRefresh,
  type StationDataResult,
  type StationDetail,
  type StationFetchOptions,
} from "./station-data.ts";
import {
  getRegionalStationArrivals,
  preserveRegionalArrivalsOnRefresh,
  type RegionalArrivalDataResult,
  type RegionalArrivalFetchOptions,
} from "./regional-arrivals.ts";
import {
  getSurfaceArrivals,
  type SurfaceArrivalSnapshot,
} from "./surface-arrivals.ts";
import type { NetworkId } from "./regional-data.ts";
import {
  getAccessibilityOutages,
  type AccessibilityOutageFetchOptions,
  type AccessibilityOutageResponse,
} from "./accessibility-outage-data.ts";

/**
 * Manages monotonic request generations, abort signals, and in-flight tracking
 * for station requests to guarantee that older/stale responses can never
 * overwrite newer responses.
 */
export type StationRequestSession = {
  start: () => { requestId: number; signal: AbortSignal };
  finish: (requestId: number) => void;
  isCurrent: (requestId: number) => boolean;
  abort: () => void;
  isInFlight: () => boolean;
  getActiveRequestId: () => number;
};

export function createStationRequestSession(): StationRequestSession {
  let requestId = 0;
  let controller: AbortController | null = null;
  let inFlight = false;

  return {
    start() {
      controller?.abort();
      controller = new AbortController();
      inFlight = true;
      return {
        requestId: ++requestId,
        signal: controller.signal,
      };
    },
    finish(id: number) {
      if (id === requestId) {
        inFlight = false;
      }
    },
    isCurrent(id: number) {
      return id === requestId;
    },
    abort() {
      controller?.abort();
      controller = null;
      inFlight = false;
    },
    isInFlight() {
      return inFlight;
    },
    getActiveRequestId() {
      return requestId;
    },
  };
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError")
    || (typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError")
  );
}

/**
 * Batched fetch of saved TTC station details.
 * Ignores aborted requests cleanly without throwing or substituting fixture data.
 */
export async function fetchSavedTtcStationDetails(
  stationIds: string[],
  options: StationFetchOptions = {},
): Promise<Array<readonly [string, StationDataResult<StationDetail | null>]>> {
  const results = await Promise.all(
    stationIds.map(async (stationId) => {
      try {
        const detail = await getStationDetail(stationId, options);
        return [`ttc:${stationId}`, detail] as readonly [string, StationDataResult<StationDetail | null>];
      } catch (error) {
        if (isAbortError(error)) {
          return null;
        }
        throw error;
      }
    }),
  );
  return results.filter((entry): entry is readonly [string, StationDataResult<StationDetail | null>] => entry !== null);
}

/**
 * Applies fetched TTC station detail updates to the current dictionary,
 * respecting the HTTP failure grace window via preserveStationDetailOnRefresh.
 */
export function applySavedStationDetailUpdates(
  current: Record<string, StationDataResult<StationDetail | null>>,
  updates: ReadonlyArray<readonly [string, StationDataResult<StationDetail | null>]>,
  now = Date.now(),
): Record<string, StationDataResult<StationDetail | null>> {
  const next = { ...current };
  for (const [key, result] of updates) {
    next[key] = preserveStationDetailOnRefresh(current[key], result, now);
  }
  return next;
}

/**
 * Batched fetch of saved Regional station arrivals and accessibility outages.
 * Ignores aborted requests cleanly.
 */
export async function fetchSavedRegionalStationDetails(
  stationIds: string[],
  options: RegionalArrivalFetchOptions & AccessibilityOutageFetchOptions = {},
): Promise<{
  arrivals: Array<readonly [string, RegionalArrivalDataResult]>;
  accessibility: AccessibilityOutageResponse | null;
}> {
  const [arrivalResults, accessibilityResult] = await Promise.all([
    Promise.all(
      stationIds.map(async (stationId) => {
        try {
          const result = await getRegionalStationArrivals(stationId, options);
          return [stationId, result] as const;
        } catch (error) {
          if (isAbortError(error)) {
            return null;
          }
          throw error;
        }
      }),
    ),
    (async () => {
      try {
        const res = await getAccessibilityOutages(undefined, { networkId: "regional", ...options });
        return res.data;
      } catch (error) {
        if (isAbortError(error)) {
          return null;
        }
        return null;
      }
    })(),
  ]);

  return {
    arrivals: arrivalResults.filter((entry): entry is readonly [string, RegionalArrivalDataResult] => entry !== null),
    accessibility: accessibilityResult,
  };
}

/**
 * Applies fetched Regional arrival updates to the current dictionary,
 * respecting the HTTP failure grace window via preserveRegionalArrivalsOnRefresh.
 */
export function applySavedRegionalArrivalUpdates(
  current: Record<string, RegionalArrivalDataResult>,
  updates: ReadonlyArray<readonly [string, RegionalArrivalDataResult]>,
  now = Date.now(),
): Record<string, RegionalArrivalDataResult> {
  const next = { ...current };
  for (const [stationId, result] of updates) {
    next[stationId] = preserveRegionalArrivalsOnRefresh(current[stationId], result, now);
  }
  return next;
}

/** How long a saved-station result stays reusable as the first paint when a view remounts. */
export const RECENT_RESULT_REUSE_MS = 60_000;

export type RecentResultCache<T> = {
  remember: (key: string, value: T, receivedAt?: number) => void;
  get: (key: string, now?: number) => T | undefined;
  entries: (now?: number) => Record<string, T>;
};

/**
 * Keeps the last result per key across component mounts so reopening a view can
 * paint last-known data immediately while its normal refresh runs. Entries older
 * than maxAgeMs are never served; callers still refresh on mount, so freshness
 * and source labels come from the reused payload exactly as first rendered.
 */
export function createRecentResultCache<T>(maxAgeMs = RECENT_RESULT_REUSE_MS): RecentResultCache<T> {
  const store = new Map<string, { value: T; receivedAt: number }>();
  const isRecent = (receivedAt: number, now: number) => now - receivedAt <= maxAgeMs;

  return {
    remember(key, value, receivedAt = Date.now()) {
      store.set(key, { value, receivedAt });
    },
    get(key, now = Date.now()) {
      const entry = store.get(key);
      return entry && isRecent(entry.receivedAt, now) ? entry.value : undefined;
    },
    entries(now = Date.now()) {
      const recent: Record<string, T> = {};
      for (const [key, entry] of store) {
        if (isRecent(entry.receivedAt, now)) recent[key] = entry.value;
      }
      return recent;
    },
  };
}

// Shared across My Stations and station detail views so whichever opens second
// paints immediately from the other's (or the background warm-up's) recent result.
export const recentTtcStationDetails = createRecentResultCache<StationDataResult<StationDetail | null>>();
export const recentRegionalArrivals = createRecentResultCache<RegionalArrivalDataResult>();
export const recentRegionalAccessibility = createRecentResultCache<AccessibilityOutageResponse>();
export const recentSurfaceSnapshots = createRecentResultCache<SurfaceArrivalSnapshot>();

export const ttcStationDetailKey = (stationId: string) => `ttc:${stationId}`;
export const surfaceSnapshotKey = (networkId: NetworkId, stationId: string) => `${networkId}:${stationId}`;

/** Caches a TTC detail result, keeping a recent backend result over a fallback within the refresh grace window. */
export function rememberTtcStationDetail(key: string, result: StationDataResult<StationDetail | null>, now = Date.now()) {
  const kept = preserveStationDetailOnRefresh(recentTtcStationDetails.get(key, now), result, now);
  recentTtcStationDetails.remember(key, kept, kept.receivedAt);
}

/** Caches a regional arrival result, keeping a recent backend result over a fallback within the refresh grace window. */
export function rememberRegionalArrivals(stationId: string, result: RegionalArrivalDataResult, now = Date.now()) {
  const kept = preserveRegionalArrivalsOnRefresh(recentRegionalArrivals.get(stationId, now), result, now);
  recentRegionalArrivals.remember(stationId, kept, kept.receivedAt);
}

/** Caches a surface snapshot only when it came from the backend, never the local unavailable placeholder. */
export function rememberSurfaceSnapshot(networkId: NetworkId, stationId: string, snapshot: SurfaceArrivalSnapshot) {
  if (snapshot.generatedAt !== null) recentSurfaceSnapshots.remember(surfaceSnapshotKey(networkId, stationId), snapshot);
}

/**
 * Fetches everything a saved station card shows into the shared recent-result
 * caches, so opening My Stations (or a saved station) paints without waiting.
 */
export async function warmSavedStationCaches(
  stations: ReadonlyArray<{ networkId: NetworkId; stationId: string }>,
  options: { signal?: AbortSignal; fetcher?: typeof fetch } = {},
) {
  const ttcIds = stations.filter((saved) => saved.networkId === "ttc").map((saved) => saved.stationId);
  const regionalIds = stations.filter((saved) => saved.networkId === "regional").map((saved) => saved.stationId);
  const ignoreAbort = (error: unknown) => {
    if (!isAbortError(error)) throw error;
  };

  await Promise.all([
    ...ttcIds.map(async (stationId) => {
      for (const [key, result] of await fetchSavedTtcStationDetails([stationId], options)) {
        rememberTtcStationDetail(key, result);
      }
    }),
    regionalIds.length > 0
      ? fetchSavedRegionalStationDetails(regionalIds, options).then(({ arrivals, accessibility }) => {
          for (const [stationId, result] of arrivals) rememberRegionalArrivals(stationId, result);
          if (accessibility) recentRegionalAccessibility.remember("regional", accessibility);
        })
      : null,
    ...stations.map(({ networkId, stationId }) => getSurfaceArrivals(networkId, stationId, options)
      .then((snapshot) => rememberSurfaceSnapshot(networkId, stationId, snapshot))
      .catch(ignoreAbort)),
  ]);
}

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

"use client";

import { useSyncExternalStore } from "react";
import type { NetworkId } from "../app/dashboard-contract";
import { getGoBusStopDepartures } from "../app/go-bus-stop-departures";
import { createRecentStopsStore, type RecentStop } from "../app/recent-stops";
import { createNearMeStore, goStopPreview, ttcStopPreview, type NearMeSnapshot } from "../app/stops-near-me";
import { getSurfaceStopArrivals } from "../app/surface-stop-arrivals";
import { loadSurfaceSearchIndex } from "../app/surface-search-index";
import type { PreparedSurfaceIndex } from "../app/surface-search";

const NETWORKS: NetworkId[] = ["ttc", "regional"];

/** Shared by both search panels (phone and desktop) and the route panel. */
export const nearMeStore = createNearMeStore({
  geolocation: () => (typeof navigator !== "undefined" && "geolocation" in navigator ? navigator.geolocation : null),
  loadIndexes: () => Promise.allSettled(NETWORKS.map(loadSurfaceSearchIndex)).then((results) => results
    .filter((result): result is PromiseFulfilledResult<PreparedSurfaceIndex> => result.status === "fulfilled")
    .map((result) => result.value)),
  fetchPreview: (network, code) => (network === "regional"
    ? getGoBusStopDepartures(code).then(goStopPreview)
    : getSurfaceStopArrivals(code).then(ttcStopPreview)),
});

export const recentStopsStore = createRecentStopsStore(() => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
});

const SERVER_NEAR_ME: NearMeSnapshot = { state: { status: "idle" }, previews: new Map() };
const SERVER_RECENT: RecentStop[] = [];

export function useStopsNearMe(): NearMeSnapshot {
  return useSyncExternalStore(nearMeStore.subscribe, nearMeStore.getSnapshot, () => SERVER_NEAR_ME);
}

export function useRecentStops(): RecentStop[] {
  return useSyncExternalStore(recentStopsStore.subscribe, recentStopsStore.getSnapshot, () => SERVER_RECENT);
}

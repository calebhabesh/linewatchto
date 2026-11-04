/**
 * Stops Near Me (plan 14, U6).
 *
 * Location is asked for only when the rider taps Stops Near Me. The position
 * is used once, here on the device, to pick the nearest stops from the search
 * index already downloaded; it is never sent, stored or logged, and is not
 * kept after the stops are picked. Only the nearest stops' departures are
 * requested, by stop number, and a cap stops a rider who taps again while
 * walking from repeating those requests.
 */

import type { NetworkId } from "./dashboard-contract.ts";
import { formatSurfaceArrivalClockTime } from "./surface-arrivals.ts";
import type { GoBusStopResult } from "./go-bus-stop-departures.ts";
import type { SurfaceStopResult } from "./surface-stop-arrivals.ts";
import { distanceMeters, type PreparedSurfaceIndex, type SurfaceSearchStop } from "./surface-search.ts";

export const NEAR_ME_RADIUS_METERS = 500;
/** With nothing within 500 m, the search widens once to this. */
export const NEAR_ME_WIDE_RADIUS_METERS = 1_000;
export const NEAR_ME_STOP_LIMIT = 8;
/** The nearest few request departures as soon as they are listed; the rest when opened. */
export const NEAR_ME_PREFETCH_COUNT = 3;
/** An accuracy radius wider than this is said out loud. */
export const NEAR_ME_LOW_ACCURACY_METERS = 150;
/** One position request, as the plan sets it. */
export const NEAR_ME_POSITION_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 };
/** A list found this long ago no longer says where the rider is: back to the Stops Near Me row. */
export const NEAR_ME_RESULT_TTL_MS = 5 * 60_000;
/** A stop's departures requested this recently are shown again, not requested again. */
export const NEAR_ME_DEPARTURE_REUSE_MS = 60_000;
/** At most this many departure requests per window, however often Near Me is tapped. */
export const NEAR_ME_DEPARTURE_BUDGET = { requests: 6, windowMs: 2 * 60_000 };

export type NearStop = { stop: SurfaceSearchStop; distanceMeters: number };

export type NearStopsResult = {
  stops: NearStop[];
  radiusMeters: number;
  /** True when nothing was within 500 m and the search widened to 1 km. */
  widened: boolean;
};

const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Every loaded network's stops within `radiusMeters` of the position, nearest
 * first, at most `limit`. A bounding box skips most of the 9,800 stops before
 * any distance is computed.
 */
export function nearestStops(
  indexes: readonly PreparedSurfaceIndex[],
  position: { lat: number; lon: number },
  { radiusMeters = NEAR_ME_RADIUS_METERS, limit = NEAR_ME_STOP_LIMIT }: { radiusMeters?: number; limit?: number } = {},
): NearStop[] {
  const latSpan = radiusMeters / METERS_PER_DEGREE_LAT;
  const lonSpan = latSpan / Math.max(0.01, Math.cos((position.lat * Math.PI) / 180));
  const found: NearStop[] = [];
  for (const index of indexes) {
    for (const stop of index.stops) {
      if (Math.abs(stop.lat - position.lat) > latSpan || Math.abs(stop.lon - position.lon) > lonSpan) continue;
      const distance = distanceMeters(position, stop);
      if (distance <= radiusMeters) found.push({ stop, distanceMeters: distance });
    }
  }
  // Equal distances (one pole in both lists, or two codes on one pole) keep a stable order.
  found.sort((a, b) => a.distanceMeters - b.distanceMeters
    || a.stop.network.localeCompare(b.stop.network)
    || a.stop.code.localeCompare(b.stop.code, "en", { numeric: true }));
  return found.slice(0, limit);
}

/** Stops within 500 m; with none, once more within 1 km. */
export function findStopsNearMe(
  indexes: readonly PreparedSurfaceIndex[],
  position: { lat: number; lon: number },
): NearStopsResult {
  const near = nearestStops(indexes, position, { radiusMeters: NEAR_ME_RADIUS_METERS });
  if (near.length > 0) return { stops: near, radiusMeters: NEAR_ME_RADIUS_METERS, widened: false };
  return {
    stops: nearestStops(indexes, position, { radiusMeters: NEAR_ME_WIDE_RADIUS_METERS }),
    radiusMeters: NEAR_ME_WIDE_RADIUS_METERS,
    widened: true,
  };
}

/** "80 m", "450 m", "1.2 km". */
export function formatStopDistance(meters: number): string {
  if (meters < 995) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export type DepartureRequestDecision = "request" | "reuse" | "capped";

/**
 * Decides whether a stop's departures may be requested now: a stop asked for
 * within `reuseMs` shows what it already has, and no more than `requests`
 * go out in any `windowMs`. A rider who taps Stops Near Me again every few
 * steps sends a handful of requests, not one per tap per stop.
 */
export function createDepartureRequestCap({
  reuseMs = NEAR_ME_DEPARTURE_REUSE_MS,
  requests = NEAR_ME_DEPARTURE_BUDGET.requests,
  windowMs = NEAR_ME_DEPARTURE_BUDGET.windowMs,
}: { reuseMs?: number; requests?: number; windowMs?: number } = {}) {
  const lastRequested = new Map<string, number>();
  let sent: number[] = [];
  return {
    decide(key: string, now: number): DepartureRequestDecision {
      const last = lastRequested.get(key);
      if (last !== undefined && now - last < reuseMs) return "reuse";
      sent = sent.filter((at) => now - at < windowMs);
      if (sent.length >= requests) return "capped";
      sent.push(now);
      lastRequested.set(key, now);
      return "request";
    },
  };
}

export type DepartureRequestCap = ReturnType<typeof createDepartureRequestCap>;

/** One upcoming time on a Near Me row, labelled as the stop panel labels it. */
export type PreviewDeparture = { route: string; at: string; status: "live" | "scheduled" };

export type StopDeparturePreview =
  | { status: "loading" }
  | { status: "ready"; departures: PreviewDeparture[] }
  /** The source is off, failed or does not know the stop: the row says nothing and still opens. */
  | { status: "unavailable" };

export type NearMeState =
  | { status: "idle" }
  | { status: "asking" }
  | { status: "unsupported" }
  | { status: "denied" }
  | { status: "no-fix" }
  | { status: "index-unavailable" }
  | {
    status: "ready";
    result: NearStopsResult;
    /** Accuracy radius of the fix, rounded; the position itself is not kept. */
    accuracyMeters: number;
    lowAccuracy: boolean;
    foundAt: number;
  };

export type NearMeSnapshot = {
  state: NearMeState;
  previews: ReadonlyMap<string, StopDeparturePreview>;
};

export const nearStopKey = (stop: Pick<SurfaceSearchStop, "network" | "code">) => `${stop.network}:${stop.code}`;

type GeolocationLike = Pick<Geolocation, "getCurrentPosition">;

export type NearMeDependencies = {
  geolocation: () => GeolocationLike | null;
  loadIndexes: () => Promise<PreparedSurfaceIndex[]>;
  fetchPreview: (network: NetworkId, code: string) => Promise<StopDeparturePreview>;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  cap?: DepartureRequestCap;
};

/**
 * The Near Me state shared by every search panel and the route panel's
 * "Nearest" mark. It holds the stops picked and their departures, never the
 * position.
 */
export function createNearMeStore({
  geolocation,
  loadIndexes,
  fetchPreview,
  now = Date.now,
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  cap = createDepartureRequestCap(),
}: NearMeDependencies) {
  let snapshot: NearMeSnapshot = { state: { status: "idle" }, previews: new Map() };
  const listeners = new Set<() => void>();
  let generation = 0;
  let expiry: unknown = null;

  const emit = (next: Partial<NearMeSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };
  const setPreview = (key: string, preview: StopDeparturePreview) => {
    const previews = new Map(snapshot.previews);
    previews.set(key, preview);
    emit({ previews });
  };

  const requestPreview = (stop: SurfaceSearchStop) => {
    const key = nearStopKey(stop);
    const decision = cap.decide(key, now());
    if (decision !== "request") return;
    setPreview(key, { status: "loading" });
    fetchPreview(stop.network, stop.code).then(
      (preview) => setPreview(key, preview),
      () => setPreview(key, { status: "unavailable" }),
    );
  };

  const showStops = (position: GeolocationPosition, indexes: PreparedSurfaceIndex[], run: number) => {
    if (run !== generation) return;
    if (indexes.length === 0) {
      emit({ state: { status: "index-unavailable" } });
      return;
    }
    const result = findStopsNearMe(indexes, { lat: position.coords.latitude, lon: position.coords.longitude });
    const accuracy = Math.round(position.coords.accuracy);
    emit({
      state: {
        status: "ready",
        result,
        accuracyMeters: accuracy,
        lowAccuracy: !(accuracy <= NEAR_ME_LOW_ACCURACY_METERS),
        foundAt: now(),
      },
    });
    for (const { stop } of result.stops.slice(0, NEAR_ME_PREFETCH_COUNT)) requestPreview(stop);
    expiry = setTimer(() => {
      if (run === generation && snapshot.state.status === "ready") emit({ state: { status: "idle" } });
    }, NEAR_ME_RESULT_TTL_MS);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    /** Asks for one position and lists the stops near it. Only ever called from a tap. */
    locate() {
      const run = ++generation;
      if (expiry !== null) clearTimer(expiry);
      expiry = null;
      const source = geolocation();
      if (!source) {
        emit({ state: { status: "unsupported" } });
        return;
      }
      emit({ state: { status: "asking" } });
      // Usually loaded already: the index loads when search opens.
      const indexes = loadIndexes();
      source.getCurrentPosition(
        (position) => {
          if (run !== generation) return;
          indexes.then((loaded) => showStops(position, loaded, run), () => showStops(position, [], run));
        },
        (error) => {
          if (run !== generation) return;
          emit({ state: { status: error.code === 1 ? "denied" : "no-fix" } });
        },
        NEAR_ME_POSITION_OPTIONS,
      );
    },
    reset() {
      generation++;
      if (expiry !== null) clearTimer(expiry);
      expiry = null;
      emit({ state: { status: "idle" } });
    },
  };
}

export type NearMeStore = ReturnType<typeof createNearMeStore>;

/** Stops listed by Near Me on one network, nearest first; empty unless a list is showing. */
export function nearbyStopCodes(state: NearMeState, network: NetworkId): string[] {
  if (state.status !== "ready") return [];
  return state.result.stops.filter(({ stop }) => stop.network === network).map(({ stop }) => stop.code);
}

/** The next two times at a stop, soonest first; past times dropped. */
export function previewDepartures(departures: readonly PreviewDeparture[], nowMs: number, limit = 2): PreviewDeparture[] {
  return departures
    .filter((departure) => Date.parse(departure.at) >= nowMs - 30_000)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(0, limit);
}

/** A TTC stop read as a Near Me preview: every time keeps its live or scheduled status. */
export function ttcStopPreview(result: SurfaceStopResult): StopDeparturePreview {
  if (result.kind !== "ok") return { status: "unavailable" };
  const { data } = result;
  if (data.availability !== "available" && data.availability !== "no-departures") return { status: "unavailable" };
  return {
    status: "ready",
    departures: data.routes.flatMap((route) => route.departures.map((departure) => ({
      route: route.route,
      at: departure.at,
      status: departure.status,
    }))),
  };
}

/** A GO bus stop read as a Near Me preview. */
export function goStopPreview(result: GoBusStopResult): StopDeparturePreview {
  if (result.kind !== "ok") return { status: "unavailable" };
  const { data } = result;
  if (data.availability !== "available" && data.availability !== "no-departures") return { status: "unavailable" };
  return {
    status: "ready",
    departures: data.departures.map((departure) => ({ route: departure.route, at: departure.at, status: departure.status })),
  };
}

/** "Due", "4 min", or past an hour the clock time ("7:52 PM"), as the stop panel words them. */
export function previewTimeLabel(at: string, nowMs: number): string {
  const minutes = Math.max(0, Math.round((Date.parse(at) - nowMs) / 60_000));
  if (minutes === 0) return "Due";
  if (minutes < 60) return `${minutes} min`;
  return formatSurfaceArrivalClockTime(at) ?? `${minutes} min`;
}

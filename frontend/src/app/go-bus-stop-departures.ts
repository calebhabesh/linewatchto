/**
 * Departures at one GO bus stop on the GO/UP Map View (plan 13, S6), by GO
 * stop number. GET /api/regional/bus-stops/{stopCode}/departures, served from
 * Metrolinx GO Next Service under the same enablement as GO Bus departures at
 * GO/UP stations.
 *
 * Every time is labelled: live only when Metrolinx computed a time that
 * differs from the schedule, otherwise scheduled. A stale, failed or switched
 * off source is reported as such and shows no times.
 */

import { apiUrl } from "./api-client.ts";
import type { SurfaceArrivalGroup } from "./surface-arrivals.ts";

export type GoBusStopAvailability = "available" | "no-departures" | "disabled" | "unavailable";

export type GoBusStopDeparture = {
  route: string;
  routeName: string;
  destination: string;
  minutes: number;
  at: string;
  predictedAt: string | null;
  scheduledAt: string | null;
  bayPlatform: string;
  tripId: string;
  status: "live" | "scheduled";
};

export type GoBusStopDepartures = {
  networkId: "regional";
  stopCode: string;
  stopName: string;
  routes: string[];
  availability: GoBusStopAvailability;
  message: string | null;
  generatedAt: string;
  sourceUpdatedAt: string | null;
  source: string;
  horizonMinutes: number;
  departures: GoBusStopDeparture[];
};

export type GoBusStopResult =
  | { kind: "ok"; data: GoBusStopDepartures }
  | { kind: "not-found"; stopCode: string }
  | { kind: "error"; stopCode: string };

export async function getGoBusStopDepartures(
  stopCode: string,
  options: { fetcher?: typeof fetch; apiBaseUrl?: string; signal?: AbortSignal } = {},
): Promise<GoBusStopResult> {
  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(
      apiUrl(`/api/regional/bus-stops/${encodeURIComponent(stopCode)}/departures`, options.apiBaseUrl),
      { cache: "no-store", signal: options.signal },
    );
    if (response.status === 404) return { kind: "not-found", stopCode };
    if (!response.ok) return { kind: "error", stopCode };
    const data = await response.json() as GoBusStopDepartures;
    if (!data || data.networkId !== "regional" || typeof data.availability !== "string" || !Array.isArray(data.departures)) {
      return { kind: "error", stopCode };
    }
    return { kind: "ok", data };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { kind: "error", stopCode };
  }
}

/** The grey line under the Departures heading: where the times come from. */
export function goBusStopSourceLine(data: Pick<GoBusStopDepartures, "availability" | "departures">): string {
  if (data.availability === "disabled") return "GO bus stop departures turned off";
  if (data.availability === "unavailable") return "GO bus departures unavailable";
  const hasLive = data.departures.some((departure) => departure.status === "live");
  const hasScheduled = data.departures.some((departure) => departure.status === "scheduled");
  if (hasLive && hasScheduled) return "Metrolinx live estimates + GO schedule";
  if (hasLive) return "Metrolinx live estimates";
  return "GO schedule · no live estimates here now";
}

/** The amber note under the times. */
export function goBusStopDisclaimer(horizonMinutes: number): string {
  const horizon = horizonMinutes % 60 === 0
    ? `${horizonMinutes / 60} ${horizonMinutes === 60 ? "hour" : "hours"}`
    : `${horizonMinutes} minutes`;
  return `From Metrolinx GO Next Service for the next ${horizon}. A time is live only when Metrolinx has moved it from the GO schedule; otherwise it is the scheduled time. GO buses do not affect GO/UP train status.`;
}

/** The stop's departures as route groups for the shared arrival-tile card. */
export function goBusStopGroups(data: Pick<GoBusStopDepartures, "departures" | "stopName" | "source">): SurfaceArrivalGroup[] {
  const groups = new Map<string, SurfaceArrivalGroup>();
  for (const departure of data.departures) {
    const key = `${departure.route}:${departure.destination}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        mode: "bus",
        route: departure.route,
        routeName: departure.routeName,
        destination: departure.destination,
        bayPlatform: departure.bayPlatform,
        stopName: data.stopName,
        arrivals: [],
      };
      groups.set(key, group);
    }
    group.arrivals.push({
      agency: "GO Transit",
      mode: "bus",
      route: departure.route,
      routeName: departure.routeName,
      destination: departure.destination,
      minutes: departure.minutes,
      predictedAt: departure.status === "live" ? departure.predictedAt ?? departure.at : null,
      scheduledAt: departure.scheduledAt ?? departure.at,
      bayPlatform: departure.bayPlatform,
      stopName: data.stopName,
      tripId: departure.tripId || `${departure.route}:${departure.at}`,
      source: departure.status === "live" ? data.source : "GO published schedule",
      status: departure.status,
    });
  }
  return [...groups.values()];
}

/**
 * Departures at one TTC surface stop, by the number on the stop pole (plan 13, S3).
 * GET /api/surface/stops/{stopCode}/arrivals.
 *
 * Every time is labelled live or scheduled. Live predictions come only from a
 * fresh source; a stale, unavailable or disabled source is reported as such and
 * its old predictions are never shown.
 */

import { apiUrl } from "./api-client.ts";
import { formatSurfaceArrivalClockTime, type SurfaceArrivalGroup } from "./surface-arrivals.ts";
import type { SurfaceNoticeDetail } from "./surface-notice-data.ts";
import { noticeRouteBase } from "./surface-route-stops.ts";

export type SurfaceStopAvailability = "available" | "no-departures" | "disabled" | "not-in-schedule" | "unavailable";
export type SurfaceStopLiveState = "live" | "stale" | "unavailable" | "disabled";

export type SurfaceStopDeparture = {
  status: "live" | "scheduled";
  at: string;
  predictedAt: string | null;
  scheduledAt: string | null;
  minutes: number;
};

export type SurfaceStopRoute = {
  route: string;
  routeName: string;
  mode: "bus" | "streetcar";
  destination: string;
  departures: SurfaceStopDeparture[];
};

export type SurfaceStopArrivals = {
  networkId: "ttc";
  stopCode: string;
  stopId: string | null;
  stopName: string | null;
  stationId: string | null;
  latitude: number | null;
  longitude: number | null;
  availability: SurfaceStopAvailability;
  message: string | null;
  generatedAt: string;
  horizonMinutes: number;
  live: { state: SurfaceStopLiveState; sourceUpdatedAt: string | null; maxAgeSeconds: number; source: string };
  schedule: { state: "available" | "unavailable"; serviceStart: string | null; serviceEnd: string | null; source: string };
  routes: SurfaceStopRoute[];
};

export type SurfaceStopResult =
  | { kind: "ok"; data: SurfaceStopArrivals }
  | { kind: "not-found"; stopCode: string }
  | { kind: "error"; stopCode: string };

/** Stop numbers are short digit strings ("9037"); anything else is not a stop search. */
export function surfaceStopCodeFromQuery(query: string): string | null {
  const trimmed = query.trim().replace(/^(?:stop|#)\s*/i, "");
  return /^\d{1,6}$/.test(trimmed) ? trimmed : null;
}

export async function getSurfaceStopArrivals(
  stopCode: string,
  options: { fetcher?: typeof fetch; apiBaseUrl?: string; signal?: AbortSignal } = {},
): Promise<SurfaceStopResult> {
  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(
      apiUrl(`/api/surface/stops/${encodeURIComponent(stopCode)}/arrivals`, options.apiBaseUrl),
      { cache: "no-store", signal: options.signal },
    );
    if (response.status === 404) return { kind: "not-found", stopCode };
    if (!response.ok) return { kind: "error", stopCode };
    const data = await response.json() as SurfaceStopArrivals;
    if (!data || typeof data.availability !== "string" || !Array.isArray(data.routes) || !data.live) {
      return { kind: "error", stopCode };
    }
    return { kind: "ok", data };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { kind: "error", stopCode };
  }
}

/**
 * The grey line under the Departures heading, as under Train Arrivals: where the
 * times come from, and a stale, missing or switched-off live source by name.
 */
export function surfaceStopSourceLine(data: Pick<SurfaceStopArrivals, "live" | "routes">): string {
  const departures = data.routes.flatMap((route) => route.departures);
  const hasLive = departures.some((departure) => departure.status === "live");
  const hasScheduled = departures.some((departure) => departure.status === "scheduled");
  switch (data.live.state) {
    case "live":
      if (hasLive && hasScheduled) return "TTC live estimates + published schedule";
      if (hasLive) return "TTC GTFS-RT live surface trip updates";
      return hasScheduled ? "Published schedule · no live estimates here now" : "TTC GTFS-RT live surface trip updates";
    case "stale": {
      const updated = formatSurfaceArrivalClockTime(data.live.sourceUpdatedAt);
      return updated ? `Live times stale since ${updated} · schedule shown` : "Live times stale · schedule shown";
    }
    case "disabled":
      return "TTC stop departures turned off";
    default:
      return "Live times unavailable · schedule shown";
  }
}

/** The amber note under the times, as under Train Arrivals. */
export function surfaceStopDisclaimer(data: Pick<SurfaceStopArrivals, "schedule" | "horizonMinutes">): string {
  const period = surfaceStopSchedulePeriod(data.schedule);
  const horizon = data.horizonMinutes % 60 === 0
    ? `${data.horizonMinutes / 60} hours`
    : `${data.horizonMinutes} minutes`;
  return `Live estimates come from TTC trip updates and appear only while fresh; other times are the published TTC schedule${period ? ` (${period})` : ""}. A route with nothing in the next ${horizon} shows its next scheduled departures.`;
}

/** The stop's departures as route groups for the shared arrival-tile card. */
export function surfaceStopGroups(data: Pick<SurfaceStopArrivals, "routes" | "stopName" | "live">): SurfaceArrivalGroup[] {
  return data.routes.filter((route) => route.departures.length > 0).map((route) => ({
    key: `${route.route}:${route.destination}`,
    mode: route.mode,
    route: route.route,
    routeName: route.routeName,
    destination: route.destination,
    bayPlatform: "",
    stopName: data.stopName ?? "",
    arrivals: route.departures.map((departure) => ({
      agency: "TTC",
      mode: route.mode,
      route: route.route,
      routeName: route.routeName,
      destination: route.destination,
      minutes: departure.minutes,
      predictedAt: departure.status === "live" ? departure.predictedAt ?? departure.at : null,
      scheduledAt: departure.status === "live" ? departure.scheduledAt : departure.scheduledAt ?? departure.at,
      bayPlatform: "",
      stopName: data.stopName ?? "",
      tripId: `${route.route}:${departure.at}`,
      source: departure.status === "live" ? data.live.source : "TTC published GTFS schedule",
      status: departure.status,
    })),
  }));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 1 – Dec 21" from the schedule's ISO service dates; null without both. */
export function surfaceStopSchedulePeriod(schedule: SurfaceStopArrivals["schedule"]): string | null {
  if (!schedule.serviceStart || !schedule.serviceEnd) return null;
  const label = (iso: string) => {
    const [, month, day] = iso.split("-").map(Number);
    return `${MONTHS[month - 1]} ${day}`;
  };
  return `${label(schedule.serviceStart)} – ${label(schedule.serviceEnd)}`;
}

/** Whether any of these notices names the stop, rather than only one of its routes. */
export function surfaceNoticesNameStop(notices: readonly SurfaceNoticeDetail[], stopId: string | null): boolean {
  return stopId !== null && notices.some((notice) => notice.stopIds.includes(stopId));
}

/** Active notices naming one of the stop's routes or the stop itself, newest first. Display only. */
export function surfaceNoticesForStop(
  notices: readonly SurfaceNoticeDetail[],
  stop: { stopId: string | null; routes: readonly string[] },
  now: number | Date = Date.now(),
): SurfaceNoticeDetail[] {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const routes = new Set(stop.routes.map((route) => route.trim().toUpperCase()));
  const active = (notice: SurfaceNoticeDetail) => {
    const start = notice.startAt ? Date.parse(notice.startAt) : Number.NaN;
    const end = notice.endAt ? Date.parse(notice.endAt) : Number.NaN;
    return !notice.scheduleAnnouncement
      && (Number.isNaN(start) || start <= nowMs)
      && (Number.isNaN(end) || end > nowMs);
  };
  return notices
    .filter(active)
    // By route number, as a route panel does: the 29C's notice is the 29's, never the 329's.
    .filter((notice) => notice.routeIds.some((route) => routes.has(noticeRouteBase(route)) || routes.has(route.trim().toUpperCase()))
      || (stop.stopId !== null && notice.stopIds.includes(stop.stopId)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

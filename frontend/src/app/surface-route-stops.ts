/**
 * The route panel's data (plan 14, U5): a route's stops by direction, from
 * the route-stop file of the route's Map View layer, and the route's active
 * notices. Stop sequences come from the published weekday (or weekday night)
 * timetable; they describe where the route goes, never whether it is running.
 */

import { cachedLoader } from "./geographic-bus-catalog.ts";
import type { SurfaceSelectionLayer } from "./surface-map-selection.ts";
import type { SurfaceNoticeDetail } from "./surface-notice-data.ts";

export type RouteStopPattern = {
  /** GTFS direction_id. */
  direction: number;
  /** The pattern's most common headsign, as the feed writes it. */
  headsign: string;
  /** Weekday trips that follow this pattern (short turns folded in). */
  trips: number;
  /** Rider stop numbers in visit order. */
  stops: string[];
};

export type RouteStopsFile = {
  schemaVersion: string;
  network: "ttc" | "regional";
  layer: string;
  routes: Record<string, RouteStopPattern[]>;
};

/** One way along the route: its branches, busiest first. */
export type RouteDirection = {
  direction: number;
  /** Tab label: "Southbound", or "To Union Station" when the feed gives no compass direction. */
  label: string;
  branches: RouteBranch[];
};

export type RouteBranch = {
  /** Unique within its direction: "11A towards Steeles via Sunnybrook Hospital". */
  label: string;
  trips: number;
  stops: string[];
};

const ROUTE_STOPS_FILES: Record<SurfaceSelectionLayer, { url: string; layer: string; network: "ttc" | "regional"; label: string }> = {
  streetcar: { url: "/assets/linewatch/geographic/ttc-surface-streetcar-route-stops.json", layer: "streetcar-route-stops", network: "ttc", label: "streetcar route stops" },
  bus: { url: "/assets/linewatch/geographic/ttc-surface-bus-route-stops.json", layer: "bus-route-stops", network: "ttc", label: "bus route stops" },
  night: { url: "/assets/linewatch/geographic/ttc-surface-night-route-stops.json", layer: "night-route-stops", network: "ttc", label: "night route stops" },
  "go-bus": { url: "/assets/linewatch/geographic/go-surface-bus-route-stops.json", layer: "go-bus-route-stops", network: "regional", label: "GO bus route stops" },
};

export const ROUTE_STOPS_URLS: Record<SurfaceSelectionLayer, string> = Object.fromEntries(
  Object.entries(ROUTE_STOPS_FILES).map(([layer, file]) => [layer, file.url]),
) as Record<SurfaceSelectionLayer, string>;

export function isRouteStopsFile(value: unknown, layer: SurfaceSelectionLayer): value is RouteStopsFile {
  const file = value as Partial<RouteStopsFile> | null;
  const expected = ROUTE_STOPS_FILES[layer];
  return Boolean(file
    && typeof file.schemaVersion === "string" && file.schemaVersion.startsWith("1.")
    && file.network === expected.network && file.layer === expected.layer
    && file.routes && typeof file.routes === "object");
}

const loaders = Object.fromEntries(
  (Object.keys(ROUTE_STOPS_FILES) as SurfaceSelectionLayer[]).map((layer) => [
    layer,
    cachedLoader(ROUTE_STOPS_FILES[layer].url, (value): value is RouteStopsFile => isRouteStopsFile(value, layer), ROUTE_STOPS_FILES[layer].label),
  ]),
) as Record<SurfaceSelectionLayer, ReturnType<typeof cachedLoader<RouteStopsFile>>>;

export function cachedRouteStops(layer: SurfaceSelectionLayer): RouteStopsFile | null {
  return loaders[layer].cached();
}

/** Fetches one layer's route-stop file once, when a route panel of that layer first opens. */
export function loadRouteStops(layer: SurfaceSelectionLayer): Promise<RouteStopsFile> {
  return loaders[layer].load();
}

const COMPASS = /^(north|south|east|west)\s+-\s+/i;

function splitHeadsign(headsign: string): { compass: string | null; rest: string } {
  const clean = headsign.replace(/\s+/g, " ").trim();
  const match = clean.match(COMPASS);
  if (!match) return { compass: null, rest: clean };
  const word = match[1].toLowerCase();
  return { compass: word[0].toUpperCase() + word.slice(1), rest: clean.slice(match[0].length) };
}

/**
 * A branch without the route name the header already shows:
 * "29A Dufferin towards Exhibition" → "29A towards Exhibition",
 * "11 - Aldershot GO" → "11 to Aldershot GO".
 */
function branchText(rest: string): string {
  const towards = rest.match(/^(\S+) .*?\b(towards .+)$/i);
  if (towards) return `${towards[1]} ${towards[2]}`;
  return rest.replace(/^(\S+) - /, "$1 to ");
}

/** Where a headsign goes: "Bathurst Station", "Union Station". */
function destination(rest: string): string {
  const towards = rest.match(/\btowards (.+?)(?: via .+)?$/i);
  if (towards) return towards[1];
  const dash = rest.match(/^\S+ - (.+)$/);
  return dash ? dash[1] : rest;
}

/**
 * A route's directions in the file's order (direction 0 first), each with its
 * branches busiest first. A direction with one branch is one stop list; with
 * several, the rider picks one (the busiest is the default). Branch labels
 * that repeat (the feed reuses a headsign for different stop runs) gain
 * where the branch starts, then a stop only it visits, then its stop count,
 * until they differ.
 */
export function routeDirections(
  patterns: readonly RouteStopPattern[] | null | undefined,
  stopName: (code: string) => string | null = () => null,
): RouteDirection[] {
  if (!patterns || patterns.length === 0) return [];
  const byDirection = new Map<number, RouteStopPattern[]>();
  for (const pattern of patterns) {
    if (pattern.stops.length === 0) continue;
    const list = byDirection.get(pattern.direction) ?? [];
    list.push(pattern);
    byDirection.set(pattern.direction, list);
  }
  return [...byDirection.entries()]
    .sort(([a], [b]) => a - b)
    .map(([direction, list]) => {
      const sorted = [...list].sort((a, b) => b.trips - a.trips || b.stops.length - a.stops.length);
      const busiest = splitHeadsign(sorted[0].headsign);
      const label = busiest.compass ? `${busiest.compass}bound` : `To ${destination(busiest.rest)}`;
      const texts = sorted.map((pattern) => branchText(splitHeadsign(pattern.headsign).rest));
      const repeats = (values: string[], index: number) => values.some((other, at) => at !== index && other === values[index]);
      const named = (code: string) => stopName(code) ?? `stop ${code}`;
      // The first stop this branch visits that its namesakes do not.
      const own = (values: string[], index: number) => {
        const others = new Set(sorted.filter((_, at) => at !== index && values[at] === values[index]).flatMap((pattern) => pattern.stops));
        const code = sorted[index].stops.find((stop) => !others.has(stop));
        return code ? `${values[index]}, via ${named(code)}` : values[index];
      };
      const steps: ((values: string[], index: number) => string)[] = [
        // Only when the namesakes start in different places.
        (values, index) => sorted.every((pattern, at) => values[at] !== values[index] || pattern.stops[0] === sorted[index].stops[0])
          ? values[index]
          : `${values[index]}, from ${named(sorted[index].stops[0])}`,
        own,
        (values, index) => `${values[index]} (${sorted[index].stops.length} stops)`,
        (values, index) => `${values[index]} (${index + 1})`,
      ];
      let labels = texts;
      for (const step of steps) {
        const current = labels;
        labels = current.map((text, index) => repeats(current, index) ? step(current, index) : text);
      }
      return {
        direction,
        label,
        branches: sorted.map((pattern, index) => ({ label: labels[index], trips: pattern.trips, stops: pattern.stops })),
      };
    });
}

/** The route number a notice's route id names: "29C" → "29", "52F" → "52". */
export function noticeRouteBase(id: string): string {
  return id.trim().toUpperCase().replace(/^(\d+)[A-Z]$/, "$1");
}

/**
 * Notices for a route that apply now: route ids match by route number, so a
 * notice for the 29C is the 29's and never the 129's or 329's. GO notices
 * count only for GO buses (train line codes are not bus routes). Timetable
 * announcements and notices outside their start and end are left out, as
 * the stop panel does. The caller passes only a fresh notice list.
 */
export function surfaceNoticesForRoute(
  notices: readonly SurfaceNoticeDetail[],
  route: { network: "ttc" | "regional"; route: string },
  now: number | Date = Date.now(),
): SurfaceNoticeDetail[] {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const target = route.route.trim().toUpperCase();
  return notices
    .filter((notice) => {
      if (notice.scheduleAnnouncement) return false;
      if (route.network === "regional" && notice.routeType !== "GO Bus") return false;
      if (route.network === "ttc" && (notice.routeType === "GO Bus" || notice.routeType === "GO / UP")) return false;
      const start = notice.startAt ? Date.parse(notice.startAt) : Number.NaN;
      const end = notice.endAt ? Date.parse(notice.endAt) : Number.NaN;
      if (!Number.isNaN(start) && start > nowMs) return false;
      if (!Number.isNaN(end) && end <= nowMs) return false;
      return notice.routeIds.some((id) => noticeRouteBase(id) === target || id.trim().toUpperCase() === target);
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

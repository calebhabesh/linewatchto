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

/**
 * One way of running a route, shown to riders as a branch: at most one stop
 * list per direction, under the code on its signs ("52F", or the plain "52").
 */
export type RouteVariant = {
  /** Unique within the route: the code, plus a number when the code has several. */
  id: string;
  code: string;
  /** Where it goes: "Sunnybrook Hospital via Lawrence Station ↔ Royal York". */
  name: string;
  /** Each with one stop list, under the whole route's labels. */
  directions: RouteDirection[];
};

/** The code a headsign starts with, when it is this route's; else the route itself. */
function variantCodeOf(headsign: string, route: string): string {
  const token = splitHeadsign(headsign).rest.match(/^\S+/)?.[0].toUpperCase() ?? route;
  return token.startsWith(route) && /^[A-Z]*$/.test(token.slice(route.length)) ? token : route;
}

/** The lettered branches on a route's signs, in order: "52A", "52B". Empty for a route with none. */
export function routeBranchCodes(patterns: readonly RouteStopPattern[] | null | undefined, route: string): string[] {
  const codes = (patterns ?? []).map((pattern) => variantCodeOf(pattern.headsign, route)).filter((code) => code !== route);
  return [...new Set(codes)].sort((a, b) => a.length - b.length || a.localeCompare(b));
}

/** Where a headsign goes, with its "via" when it has one. */
function destinationWithVia(rest: string): string {
  return rest.match(/\btowards (.+)$/i)?.[1] ?? destination(rest);
}

type StopPoint = { lat: number; lon: number };

function metersBetween(a: StopPoint, b: StopPoint): number {
  const x = (b.lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const y = (b.lat - a.lat) * 110_540;
  return Math.hypot(x, y);
}

/** Stops this close are the same place on opposite sides of a street, or staggered along it. */
const SAME_STREET_METERS = 300;
/** A terminal's arrivals and departures can be a loop apart. */
const SAME_TERMINAL_METERS = 1000;
/** Signed alike, opposite lists may differ more: one-way streets, loops. */
const MIN_SHARE_SIGNED_ALIKE = 0.6;
const MIN_SHARE_PLAIN = 0.7;

/**
 * How alike two opposite stop lists are: the share of stops the other passes,
 * if one starts about where the other ends. A short turn may end far from the
 * other's start, so one end is enough. Null when they are not a pair.
 */
function returnTripShare(a: readonly StopPoint[], b: readonly StopPoint[], minimum: number): number | null {
  if (a.length === 0 || b.length === 0) return null;
  if (metersBetween(a[0], b[b.length - 1]) > SAME_TERMINAL_METERS
    && metersBetween(a[a.length - 1], b[0]) > SAME_TERMINAL_METERS) return null;
  const passed = (from: readonly StopPoint[], by: readonly StopPoint[]) =>
    from.filter((stop) => by.some((other) => metersBetween(stop, other) <= SAME_STREET_METERS)).length / from.length;
  const share = Math.min(passed(a, b), passed(b, a));
  return share >= minimum ? share : null;
}

/**
 * A route's branches, the plain route first and then by letter. The feed signs
 * branches per trip and often one way only: every eastbound 52 reads "52", its
 * westbound ones 52A, 52B and 52G. So opposite stop lists pair up: first those
 * signed alike, then a plain one with the lettered branch whose stops it runs
 * back along. This is an inference from the stops, for finding a stop list; the
 * list's own label still gives the sign as published. What finds no pair is a
 * branch running one way.
 */
export function routeVariants(
  patterns: readonly RouteStopPattern[] | null | undefined,
  route: string,
  stopName: (code: string) => string | null = () => null,
  stopPoint: (code: string) => StopPoint | null = () => null,
): RouteVariant[] {
  const usable = (patterns ?? []).filter((pattern) => pattern.stops.length > 0);
  const whole = routeDirections(usable, stopName);
  const items = usable.map((pattern) => ({
    pattern,
    code: variantCodeOf(pattern.headsign, route),
    points: pattern.stops.flatMap((code) => stopPoint(code) ?? []),
  }));
  const directionIds = [...new Set(usable.map((pattern) => pattern.direction))].sort((a, b) => a - b);
  const paired = new Map<(typeof items)[number], (typeof items)[number]>();
  if (directionIds.length === 2) {
    const [ones, others] = directionIds.map((id) => items.filter((item) => item.pattern.direction === id));
    const candidates: { one: (typeof items)[number]; other: (typeof items)[number]; share: number; alike: boolean }[] = [];
    for (const one of ones) {
      for (const other of others) {
        const alike = one.code === other.code;
        if (!alike && one.code !== route && other.code !== route) continue;
        const onlyPair = alike && ones.filter((item) => item.code === one.code).length === 1
          && others.filter((item) => item.code === one.code).length === 1;
        const share = returnTripShare(one.points, other.points, alike ? MIN_SHARE_SIGNED_ALIKE : MIN_SHARE_PLAIN);
        if (onlyPair) candidates.push({ one, other, share: 2, alike });
        else if (share !== null) candidates.push({ one, other, share, alike });
      }
    }
    candidates.sort((a, b) => Number(b.alike) - Number(a.alike) || b.share - a.share);
    for (const { one, other } of candidates) {
      if (paired.has(one) || paired.has(other)) continue;
      paired.set(one, other);
      paired.set(other, one);
    }
  }

  const groups: (typeof items)[] = [];
  for (const item of items) {
    const partner = paired.get(item);
    if (!partner) groups.push([item]);
    else if (item.pattern.direction === directionIds[0]) groups.push([item, partner]);
  }
  const wholeBranch = (pattern: RouteStopPattern) => whole
    .find((direction) => direction.direction === pattern.direction)?.branches
    .find((branch) => branch.stops === pattern.stops);
  const rows = groups.map((group) => {
    const code = group.find((item) => item.code !== route)?.code ?? route;
    const name = [...new Set(group.map((item) => destinationWithVia(splitHeadsign(item.pattern.headsign).rest)))].join(" ↔ ");
    const directions = group.map(({ pattern }) => {
      const direction = whole.find((candidate) => candidate.direction === pattern.direction)!;
      const branch = wholeBranch(pattern)!;
      return { direction: direction.direction, label: direction.label, branches: [branch] };
    });
    return { code, name, directions };
  });
  rows.sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
  const repeats = (row: (typeof rows)[number]) => rows.filter((other) => other.code === row.code && other.name === row.name).length > 1;
  return rows.map((row, at) => {
    const sameCode = rows.filter((other) => other.code === row.code);
    return {
      ...row,
      // Signed alike and going to the same place: where each starts tells them apart.
      name: repeats(row)
        ? `${row.name}, from ${stopName(row.directions[0].branches[0].stops[0]) ?? `stop ${row.directions[0].branches[0].stops[0]}`}`
        : row.name,
      id: sameCode.length > 1 ? `${row.code}/${sameCode.indexOf(rows[at]) + 1}` : row.code,
    };
  });
}

/** The busiest variant running this direction: what a direction opens by itself. */
export function busiestVariantFor(variants: readonly RouteVariant[], direction: number): RouteVariant | null {
  let best: RouteVariant | null = null;
  let bestTrips = 0;
  for (const variant of variants) {
    const trips = variant.directions
      .filter((candidate) => candidate.direction === direction)
      .flatMap((candidate) => candidate.branches)
      .reduce((sum, branch) => sum + branch.trips, 0);
    if (trips > bestTrips) {
      best = variant;
      bestTrips = trips;
    }
  }
  return best;
}

/**
 * A route's express or regular counterpart. TTC express routes number 900 above
 * their regular route (989 Weston Express, 89 Weston), but not all do: 927
 * Highway 27 Express has nothing to do with 27 Jane South, so the names must
 * agree too ("Finch Express" and "Finch East" do).
 */
export function expressCounterpart<T extends { route: string; name: string; network: string }>(
  route: T,
  routes: readonly T[],
): { route: T; isExpress: boolean } | null {
  if (route.network !== "ttc" || !/^\d+$/.test(route.route)) return null;
  const number = Number(route.route);
  const named = (express: T, regular: T) => regular.name.toLowerCase().startsWith(express.name.replace(/\s+Express$/i, "").toLowerCase());
  if (number > 900 && /\bExpress$/i.test(route.name)) {
    const regular = routes.find((candidate) => candidate.route === String(number - 900));
    return regular && named(route, regular) ? { route: regular, isExpress: false } : null;
  }
  const express = routes.find((candidate) => candidate.route === String(number + 900) && /\bExpress$/i.test(candidate.name));
  return express && named(express, route) ? { route: express, isExpress: true } : null;
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

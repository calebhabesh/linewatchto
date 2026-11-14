/**
 * The stretch of a route a TTC notice names (plan 15, L4 follow-up): the
 * timetable route between the first and last stops the source lists, traced
 * along that route's own drawn streets. The Map View hatches it while the
 * notice's View is open.
 *
 * What it claims, and no more:
 * - Only a notice whose source lists a run of stops. The backend sends the
 *   first and last and writes the location as "First to Last" only then (three
 *   or more stops, or a no-service notice). Two stops it writes "A, B": on a
 *   detour those are where it leaves and rejoins the route (owner, 2026-11-14),
 *   and on any other notice they may be two separate poles, so they get none.
 * - The regular route between those stops, from the published timetable,
 *   never the detour: TTC gives the detour only as text.
 * - Nothing when any part cannot be traced on the route's streets: a missing
 *   stretch is honest, a guessed one is not.
 */

import type { NetworkId } from "./regional-data.ts";
import type { SurfaceNoticeDetail } from "./surface-notice-data.ts";
import type { RouteStopPattern } from "./surface-route-stops.ts";

export type Coordinate = [number, number];

/** Where the source's run of stops starts and ends, as the notice names them. */
export type NoticeStopRange = {
  from: { stopId: string; stopName: string };
  to: { stopId: string; stopName: string };
};

function shownStopName(stop: { stopId: string; stopName: string }): string {
  const name = stop.stopName.trim();
  if (name) return name;
  return /^\d+$/.test(stop.stopId.trim()) ? `Stop ${stop.stopId.trim()}` : stop.stopId.trim();
}

/**
 * The run of stops a TTC notice names, or null. Read from the backend's
 * endpoint form ("First to Last"), or a detour's two stops ("A, B").
 */
export function noticeStopRange(notice: SurfaceNoticeDetail, network: NetworkId): NoticeStopRange | null {
  if (network !== "ttc" || notice.routeType === "GO Bus" || notice.routeType === "GO / UP") return null;
  const stops = notice.stops && notice.stops.length > 0
    ? notice.stops
    : notice.stopIds.map((stopId) => ({ stopId, stopName: "" }));
  if (stops.length !== 2) return null;
  const [from, to] = stops;
  const fromName = shownStopName(from);
  const toName = shownStopName(to);
  if (!fromName || !toName || fromName === toName) return null;
  const location = notice.location?.trim();
  if (location === `${fromName} to ${toName}`) return { from, to };
  return notice.category === "detour" && location === `${fromName}, ${toName}` ? { from, to } : null;
}

const EARTH_X = 111_320;
const EARTH_Y = 110_540;

function meters(a: Coordinate, b: Coordinate): number {
  const scale = EARTH_X * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * scale, (a[1] - b[1]) * EARTH_Y);
}

/** A pole across the street from a named one still marks the same end of the run. */
const SAME_PLACE_METERS = 120;

/**
 * The stops from one end to the other on the busiest timetable pattern that
 * passes both, in travel order. Each end is the named pole, or the pattern's
 * nearest pole to it (the other side of the street when the source names the
 * opposite direction's pole). Null when no pattern passes both ends.
 */
export function stretchStopCodes(
  patterns: readonly RouteStopPattern[] | null | undefined,
  ends: { from: readonly string[]; to: readonly string[] },
  positionOf: (code: string) => Coordinate | null,
): string[] | null {
  const endPoints = (codes: readonly string[]) => codes.map(positionOf).filter((point): point is Coordinate => point !== null);
  const fromPoints = endPoints(ends.from);
  const toPoints = endPoints(ends.to);
  const nearest = (stops: readonly string[], codes: readonly string[], points: readonly Coordinate[]) => {
    let best = { at: -1, distance: Infinity };
    stops.forEach((code, at) => {
      const position = codes.includes(code) ? null : positionOf(code);
      const distance = codes.includes(code) ? 0
        : position ? Math.min(...points.map((point) => meters(point, position))) : Infinity;
      if (distance < best.distance) best = { at, distance };
    });
    return best.distance <= SAME_PLACE_METERS ? best : null;
  };
  let best: { codes: string[]; score: number } | null = null;
  for (const pattern of patterns ?? []) {
    const start = nearest(pattern.stops, ends.from, fromPoints);
    const end = nearest(pattern.stops, ends.to, toPoints);
    if (!start || !end || start.at === end.at) continue;
    const ordered = start.at < end.at;
    const codes = ordered ? pattern.stops.slice(start.at, end.at + 1) : pattern.stops.slice(end.at, start.at + 1).reverse();
    // Source order first, then the closest ends, then the busiest pattern.
    const score = (ordered ? 0 : 1_000_000) + (start.distance + end.distance) * 100 - pattern.trips;
    if (!best || score < best.score) best = { codes, score };
  }
  return best?.codes ?? null;
}

type LineFeature = { geometry: { coordinates: readonly Coordinate[] }; properties: { routes: readonly string[] } };

/** A drawn street end within this of another street of the route joins it. */
const JOIN_METERS = 45;
/** A pole stands at the curb, off the drawn centre line. */
const ATTACH_METERS = 80;
/** A hop along the streets may wind, but not this much more than the straight line. */
const DETOUR_FACTOR = 2.5;
const DETOUR_SLACK_METERS = 300;
/** A leg this short that turns back on itself is a knot in the drawn streets, not a street. */
const SPUR_METERS = 40;
/** Shorter still, any backward turn is drawing noise at a corner. */
const KNOT_METERS = 15;

type Graph = {
  points: Coordinate[];
  edges: Map<number, Array<{ to: number; length: number }>>;
  segments: Array<[number, number]>;
  /** Points spliced onto each segment, so two on one segment join directly. */
  spliced: Map<string, number[]>;
};

function addEdge(graph: Graph, a: number, b: number) {
  if (a === b) return;
  const length = meters(graph.points[a], graph.points[b]);
  for (const [from, to] of [[a, b], [b, a]]) {
    const list = graph.edges.get(from) ?? [];
    list.push({ to, length });
    graph.edges.set(from, list);
  }
}

/** The closest point on the graph's segments to a point, with the segment's ends. */
function project(graph: Graph, point: Coordinate, skip?: (segment: [number, number]) => boolean) {
  let best: { point: Coordinate; distance: number; segment: [number, number] } | null = null;
  const scale = EARTH_X * Math.cos((point[1] * Math.PI) / 180);
  for (const segment of graph.segments) {
    if (skip?.(segment)) continue;
    const [a, b] = segment.map((index) => graph.points[index]);
    const ax = (a[0] - point[0]) * scale;
    const ay = (a[1] - point[1]) * EARTH_Y;
    const dx = (b[0] - a[0]) * scale;
    const dy = (b[1] - a[1]) * EARTH_Y;
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
    const distance = Math.hypot(ax + t * dx, ay + t * dy);
    if (!best || distance < best.distance) {
      best = { point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], distance, segment };
    }
  }
  return best;
}

/** A new point on a segment, joined to both its ends and to points already on it. */
function splice(graph: Graph, point: Coordinate, segment: [number, number]): number {
  const index = graph.points.push(point) - 1;
  const key = `${segment[0]}:${segment[1]}`;
  const onSegment = graph.spliced.get(key) ?? [];
  for (const other of [segment[0], segment[1], ...onSegment]) addEdge(graph, index, other);
  onSegment.push(index);
  graph.spliced.set(key, onSegment);
  return index;
}

function routeGraph(lines: ReadonlyArray<readonly Coordinate[]>): Graph {
  const graph: Graph = { points: [], edges: new Map(), segments: [], spliced: new Map() };
  const ends: Array<{ index: number; line: number }> = [];
  const lineOfSegment: number[] = [];
  lines.forEach((line, lineIndex) => {
    const first = graph.points.length;
    for (const point of line) graph.points.push([point[0], point[1]]);
    for (let at = first; at < graph.points.length - 1; at++) {
      addEdge(graph, at, at + 1);
      graph.segments.push([at, at + 1]);
      lineOfSegment.push(lineIndex);
    }
    if (line.length > 0) ends.push({ index: first, line: lineIndex }, { index: graph.points.length - 1, line: lineIndex });
  });
  // Streets meet end to middle or end to end, rarely at a shared point.
  const segmentLine = new Map(graph.segments.map((segment, at) => [`${segment[0]}:${segment[1]}`, lineOfSegment[at]]));
  for (const end of ends) {
    const hit = project(graph, graph.points[end.index], (segment) => segmentLine.get(`${segment[0]}:${segment[1]}`) === end.line);
    if (!hit || hit.distance > JOIN_METERS) continue;
    addEdge(graph, end.index, splice(graph, hit.point, hit.segment));
  }
  return graph;
}

function shortestPath(graph: Graph, from: number, to: number): { path: number[]; length: number } | null {
  const distance = new Map<number, number>([[from, 0]]);
  const previous = new Map<number, number>();
  const done = new Set<number>();
  while (true) {
    let current = -1;
    let currentDistance = Infinity;
    for (const [node, value] of distance) {
      if (!done.has(node) && value < currentDistance) {
        current = node;
        currentDistance = value;
      }
    }
    if (current === -1) return null;
    if (current === to) break;
    done.add(current);
    for (const { to: next, length } of graph.edges.get(current) ?? []) {
      const candidate = currentDistance + length;
      if (candidate < (distance.get(next) ?? Infinity)) {
        distance.set(next, candidate);
        previous.set(next, current);
      }
    }
  }
  const path = [to];
  while (path[0] !== from) path.unshift(previous.get(path[0])!);
  return { path, length: distance.get(to)! };
}

/**
 * The route's own streets from stop to stop, as one line; null when any hop
 * between consecutive stops cannot be traced on them, or would wander far
 * from the straight line between those stops.
 */
export function stretchPath(features: readonly LineFeature[], route: string, stops: readonly Coordinate[]): Coordinate[] | null {
  if (stops.length < 2) return null;
  const lines = features.filter((feature) => feature.properties.routes.includes(route)).map((feature) => feature.geometry.coordinates);
  if (lines.length === 0) return null;
  const graph = routeGraph(lines);
  const nodes: number[] = [];
  for (const stop of stops) {
    const hit = project(graph, stop);
    if (!hit || hit.distance > ATTACH_METERS) return null;
    nodes.push(splice(graph, hit.point, hit.segment));
  }
  const line: Coordinate[] = [];
  for (let at = 0; at < nodes.length - 1; at++) {
    const hop = shortestPath(graph, nodes[at], nodes[at + 1]);
    if (!hop) return null;
    const straight = meters(graph.points[nodes[at]], graph.points[nodes[at + 1]]);
    if (hop.length > straight * DETOUR_FACTOR + DETOUR_SLACK_METERS) return null;
    for (const node of hop.path) {
      const point = graph.points[node];
      const last = line[line.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) line.push(point);
    }
  }
  const clean = withoutSpikes(line);
  if (clean.length < 2) return null;
  // The route is drawn down the middle of the street and a pole stands at the curb:
  // the ends step out to the end poles, so the band starts and stops on them.
  const [first, last] = [stops[0], stops[stops.length - 1]];
  const same = (a: Coordinate, b: Coordinate) => a[0] === b[0] && a[1] === b[1];
  return [
    ...(same(clean[0], first) ? [] : [[first[0], first[1]] as Coordinate]),
    ...clean,
    ...(same(clean[clean.length - 1], last) ? [] : [[last[0], last[1]] as Coordinate]),
  ];
}

/** Drops out-and-back spurs (a stop beside a corner can sit on the cross street's stub). */
function withoutSpikes(line: Coordinate[]): Coordinate[] {
  const result = [...line];
  let changed = true;
  while (changed) {
    changed = false;
    for (let at = 1; at < result.length - 1; at++) {
      const [a, b, c] = [result[at - 1], result[at], result[at + 1]];
      const scale = EARTH_X * Math.cos((b[1] * Math.PI) / 180);
      const [ux, uy] = [(b[0] - a[0]) * scale, (b[1] - a[1]) * EARTH_Y];
      const [vx, vy] = [(c[0] - b[0]) * scale, (c[1] - b[1]) * EARTH_Y];
      const [u, v] = [Math.hypot(ux, uy), Math.hypot(vx, vy)];
      if (u === 0 || v === 0) continue;
      const cos = (ux * vx + uy * vy) / (u * v);
      // A full reversal, or a sharp turn on a leg too short to be a street (a corner's knot).
      if (cos < -0.98 || (cos < -0.5 && Math.min(u, v) < SPUR_METERS) || (cos < 0 && Math.min(u, v) < KNOT_METERS)) {
        result.splice(at, 1);
        changed = true;
        break;
      }
    }
  }
  return result;
}

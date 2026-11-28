/*
 * Where an alert's glyphs rest along its path, on both maps. Glyphs are laid
 * out between stops: the ends of each subpath, every station dot the path
 * passes through, and every pill station (GO/UP's Union) it runs into. The clear stretch between two stops (from one dot's edge to
 * the next's) gets as many glyphs as fit at about the lane's step, spread
 * evenly and centred, so no glyph sits under a station dot and every gap
 * reads the same however its stations are spaced. Two alerts over the same
 * stations place the same glyphs at the same points.
 * Pure geometry over the path's polylines; nothing here reads the DOM.
 */
import {
  pathPolylinePoints,
  pointAlongPolyline,
  polylineLength,
  projectOntoPolyline,
  type MapPoint,
} from "../../app/map-geometry.ts";
import type { MapOverlayCutout, MapOverlayDot } from "./overlay-plane.ts";

/** One glyph's resting place: its centre and the lane's heading there, in degrees. */
export type LaneGlyph = { x: number; y: number; rotation: number };

/** A station dot on a path: its centre's distance along the path and its radius. */
export type GlyphStop = { along: number; radius: number };

/**
 * Distances along a stretch of `length` at which its glyphs rest, in order.
 * `stops` are the station dots on it; its ends are stops too. Each clear
 * stretch between stops is cut into equal slots about `step` long, and each
 * slot holds a glyph at each of `pattern`'s fractions of it (one centred
 * glyph by default; an icon and its arrow for paired lanes). A clear stretch
 * shorter than half a step (between a station's two dots, or a dot and a
 * corner) has no room for a glyph and gets none.
 */
export function glyphDistances(
  length: number,
  stops: readonly GlyphStop[],
  step: number,
  pattern: readonly number[] = [0.5],
): number[] {
  if (!(length > 0) || !(step > 0)) return [];
  const marks = [
    { along: 0, radius: 0 },
    ...stops.filter(({ along }) => along >= 0 && along <= length),
    { along: length, radius: 0 },
  ].sort((a, b) => a.along - b.along);
  const slots: { from: number; span: number }[] = [];
  for (let index = 1; index < marks.length; index++) {
    // A stop's dot reaches back over the stops before it, too.
    const from = Math.max(...marks.slice(0, index).map(({ along, radius }) => along + radius));
    const to = Math.min(...marks.slice(index).map(({ along, radius }) => along - radius));
    const clear = to - from;
    if (clear < step / 2) continue;
    const count = Math.max(1, Math.round(clear / step));
    for (let slot = 0; slot < count; slot++) slots.push({ from: from + slot * clear / count, span: clear / count });
  }
  // An alert too short to clear its stations still shows a glyph.
  if (slots.length === 0) slots.push({ from: 0, span: length });
  const fractions = [...pattern].sort((a, b) => a - b);
  return slots.flatMap(({ from, span }) => fractions.map((fraction) => from + fraction * span));
}

/**
 * The dots a polyline passes through (centre within the dot's radius of it),
 * as stops along it. A dot past an end (a terminal whose track stops short of
 * its centre: Finch, Vaughan) reaches into the path only as far as its edge.
 */
export function dotStopsAlong(points: MapPoint[], dots: readonly MapOverlayDot[]): GlyphStop[] {
  if (points.length < 2 || dots.length === 0) return [];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const bounds = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  const length = polylineLength(points);
  const alongEnd = (from: MapPoint, to: MapPoint, dot: MapPoint) => {
    const run = Math.hypot(to.x - from.x, to.y - from.y);
    return run === 0 ? 0 : ((dot.x - to.x) * (to.x - from.x) + (dot.y - to.y) * (to.y - from.y)) / run;
  };
  return dots.flatMap((dot) => {
    if (
      dot.x < bounds.left - dot.radius || dot.x > bounds.right + dot.radius
      || dot.y < bounds.top - dot.radius || dot.y > bounds.bottom + dot.radius
    ) return [];
    const projected = projectOntoPolyline(points, dot);
    if (projected.gap > dot.radius) return [];
    // Where the dot's centre lies along the path, extended past either end.
    let along = projected.along;
    if (along <= 0) along = -alongEnd(points[1], points[0], dot);
    else if (along >= length) along = length + alongEnd(points[points.length - 2], points[points.length - 1], dot);
    const from = Math.max(0, along - dot.radius);
    const to = Math.min(length, along + dot.radius);
    return to > from ? [{ along: (from + to) / 2, radius: (to - from) / 2 }] : [];
  });
}

/**
 * The stretches of a polyline inside pill stations (with their border), each
 * as one stop reaching from where the path enters the pill to where it leaves.
 */
export function cutoutStopsAlong(points: MapPoint[], cutouts: readonly MapOverlayCutout[]): GlyphStop[] {
  return cutouts.flatMap((cutout) => {
    const margin = cutout.strokeWidth / 2;
    const box = { left: cutout.x - margin, right: cutout.x + cutout.width + margin, top: cutout.y - margin, bottom: cutout.y + cutout.height + margin };
    const inside: [number, number][] = [];
    let travelled = 0;
    for (let index = 1; index < points.length; index++) {
      const from = points[index - 1];
      const to = points[index];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const range = clipToBox(from, to, box);
      if (range) inside.push([travelled + range[0] * length, travelled + range[1] * length]);
      travelled += length;
    }
    if (inside.length === 0) return [];
    const enter = Math.min(...inside.map(([start]) => start));
    const leave = Math.max(...inside.map(([, end]) => end));
    return [{ along: (enter + leave) / 2, radius: (leave - enter) / 2 }];
  });
}

/** The fractions of edge `from`–`to` inside a box (Liang–Barsky). */
function clipToBox(
  from: MapPoint,
  to: MapPoint,
  box: { left: number; right: number; top: number; bottom: number },
): [number, number] | null {
  let low = 0;
  let high = 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  for (const [p, q] of [
    [-dx, from.x - box.left],
    [dx, box.right - from.x],
    [-dy, from.y - box.top],
    [dy, box.bottom - from.y],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) low = Math.max(low, t);
    else high = Math.min(high, t);
    if (low > high) return null;
  }
  return [low, high];
}

/** Each subpath of an alert's path as a polyline without repeated points. */
export function pathSubpathPolylines(pathD: string): MapPoint[][] {
  return pathD
    .split(/(?=M)/)
    .map((subpath) => pathPolylinePoints(subpath.trim()).filter((point, index, points) => (
      index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 0.001
    )))
    .filter((points) => points.length > 1);
}

/**
 * An alert lane's glyphs, in travel order: forward from each subpath's start,
 * reverse from its end (heading turned around). `pattern` is each slot's
 * glyphs as fractions of it in travel order (`glyphDistances`). `offset`
 * moves the lane to one side of the path (a two-way lane's rows), along each
 * glyph's normal.
 */
export function laneGlyphs(pathD: string, {
  step,
  dots = [],
  cutouts = [],
  offset = 0,
  direction = "forward",
  pattern = [0.5],
}: {
  step: number;
  dots?: readonly MapOverlayDot[];
  cutouts?: readonly MapOverlayCutout[];
  offset?: number;
  direction?: "forward" | "reverse";
  pattern?: readonly number[];
}): LaneGlyph[] {
  // Laid out along the path, then read the travel way.
  const pathPattern = direction === "reverse" ? pattern.map((fraction) => 1 - fraction) : pattern;
  const polylines = pathSubpathPolylines(pathD);
  const forks = forkStops(polylines, step / 4);
  const subpaths = polylines.map((points, index) => {
    const length = polylineLength(points);
    const stops = [
      ...dotStopsAlong(points, dots),
      ...cutoutStopsAlong(points, cutouts),
      ...forks[index],
      ...cornerStops(points, step / 4),
    ];
    return glyphDistances(length, stops, step, pathPattern).map((distance) => {
      const before = pointAlongPolyline(points, Math.max(0, distance - 1));
      const after = pointAlongPolyline(points, Math.min(length, distance + 1));
      const point = pointAlongPolyline(points, distance);
      const angle = Math.atan2(after.y - before.y, after.x - before.x);
      return {
        x: point.x - offset * Math.sin(angle),
        y: point.y + offset * Math.cos(angle),
        rotation: angle * (180 / Math.PI) + (direction === "reverse" ? 180 : 0),
      };
    });
  });
  return direction === "reverse" ? subpaths.reverse().flatMap((glyphs) => glyphs.reverse()) : subpaths.flat();
}

/**
 * Where a subpath starts or ends on another away from a station (a branch
 * leaving its trunk at a corner, map-corridors.ts), a stop on both with
 * `clearance` around it, so the trunk's and the branch's nearest glyphs both
 * stand off the fork instead of overlapping there.
 */
function forkStops(polylines: MapPoint[][], clearance: number): GlyphStop[][] {
  const forks = polylines.map((): GlyphStop[] => []);
  polylines.forEach((points, index) => {
    const ends = [{ point: points[0], along: 0 }, { point: points[points.length - 1], along: polylineLength(points) }];
    for (const end of ends) {
      polylines.forEach((other, otherIndex) => {
        if (otherIndex === index) return;
        const { along, gap } = projectOntoPolyline(other, end.point);
        if (gap > FORK_TOLERANCE) return;
        forks[otherIndex].push({ along, radius: clearance });
        forks[index].push({ along: end.along, radius: clearance });
      });
    }
  });
  return forks;
}

/** Closer than this to another subpath, a subpath's end meets it (map units). */
const FORK_TOLERANCE = 2;

/** A turn sharper than this (GO/UP's right-angled corners) is a corner, not a curve. */
const CORNER_COSINE = Math.cos(Math.PI / 4);

/**
 * A polyline's sharp corners as stops with `clearance` around them. Glyphs
 * are spaced along the path, so two either side of a right angle sat closer
 * than a step and overlapped; standing them off the corner keeps them apart.
 */
function cornerStops(points: MapPoint[], clearance: number): GlyphStop[] {
  const stops: GlyphStop[] = [];
  let along = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const [before, at, after] = [points[index - 1], points[index], points[index + 1]];
    const inLength = Math.hypot(at.x - before.x, at.y - before.y);
    const outLength = Math.hypot(after.x - at.x, after.y - at.y);
    along += inLength;
    const cosine = ((at.x - before.x) * (after.x - at.x) + (at.y - before.y) * (after.y - at.y)) / (inLength * outLength);
    if (cosine < CORNER_COSINE) stops.push({ along, radius: clearance });
  }
  return stops;
}

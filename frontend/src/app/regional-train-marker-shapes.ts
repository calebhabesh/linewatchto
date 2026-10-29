/**
 * The estimated train marker glyph (TRAIN_MARKER_BODY_PATH, windows, arrow)
 * as polygons in diagram units, placed and rotated like the SVG renderer's
 * `translate(point) rotate(angle) scale(1.8)`. The MapLibre System Map draws
 * these as vector fills so the marker stays smooth at every zoom.
 */
import type { MapPoint } from "./map-geometry.ts";
import { TRAIN_MARKER_WINDOWS } from "./train-markers.ts";

/** The SVG renderer draws the glyph at scale(1.8) in diagram units. */
export const TRAIN_MARKER_SCALE = 1.8;

function arcPoints(center: MapPoint, radius: number, from: number, to: number, steps: number): MapPoint[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = from + ((to - from) * index) / steps;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

/** Flat front with a nose, round back (radius 15 about -21, 0), in glyph units. */
const BODY_RING: MapPoint[] = [
  { x: -21, y: -15 }, { x: 14, y: -15 }, { x: 36, y: 0 }, { x: 14, y: 15 }, { x: -21, y: 15 },
  ...arcPoints({ x: -21, y: 0 }, 15, Math.PI / 2, (3 * Math.PI) / 2, 24).slice(1, -1),
  { x: -21, y: -15 },
];
const ARROW_RING: MapPoint[] = [{ x: 13, y: -8 }, { x: 27, y: 0 }, { x: 13, y: 8 }, { x: 13, y: -8 }];

function roundedRectRing({ x, y, width, height, rx }: { x: number; y: number; width: number; height: number; rx: number }): MapPoint[] {
  const r = Math.min(rx, width / 2, height / 2);
  const corner = (cx: number, cy: number, start: number) => arcPoints({ x: cx, y: cy }, r, start, start + Math.PI / 2, 4);
  const ring = [
    ...corner(x + width - r, y + r, -Math.PI / 2),
    ...corner(x + width - r, y + height - r, 0),
    ...corner(x + r, y + height - r, Math.PI / 2),
    ...corner(x + r, y + r, Math.PI),
  ];
  return [...ring, ring[0]];
}
const WINDOW_RINGS = TRAIN_MARKER_WINDOWS.map(roundedRectRing);

type RegionalTrainMarkerRings = {
  body: MapPoint[];
  windows: MapPoint[][];
  arrow: MapPoint[];
};

/** The glyph's closed rings at `point`, rotated `angle` degrees clockwise (SVG rotate). */
export function regionalTrainMarkerRings(point: MapPoint, angle: number, offset: MapPoint = { x: 0, y: 0 }): RegionalTrainMarkerRings {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians) * TRAIN_MARKER_SCALE;
  const sin = Math.sin(radians) * TRAIN_MARKER_SCALE;
  const place = (ring: MapPoint[]) => ring.map(({ x, y }) => ({
    x: point.x + x * cos - y * sin + offset.x,
    y: point.y + x * sin + y * cos + offset.y,
  }));
  return { body: place(BODY_RING), windows: WINDOW_RINGS.map(place), arrow: place(ARROW_RING) };
}

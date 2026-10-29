/**
 * The estimated train marker glyph for the MapLibre maps (the GO/UP System
 * Map prototype and Map View). Its paint and line colours come from
 * train-markers.css, the same rules the SVG System Map uses, read from a
 * scratch marker so theme, high contrast, and mobile performance mode match.
 */
import {
  TRAIN_MARKER_ARROW_PATH,
  TRAIN_MARKER_BODY_PATH,
  TRAIN_MARKER_WINDOWS,
} from "../app/train-markers.ts";

type TrainMarkerPaint = {
  outlineStroke: string;
  outlineWidth: number;
  coreStroke: string;
  coreWidth: number;
  windowFill: string;
  arrowFill: string;
  arrowStroke: string;
  arrowWidth: number;
  /** The marker's drop shadow, off in mobile performance mode. */
  shadow: boolean;
};

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Reads the marker paint and each line's colour under `host` (an element in
 * the app shell, so its theme classes apply). `fallbackColors` covers lines
 * without a train-markers.css colour. Null without a DOM.
 */
export function readTrainMarkerPaint(
  host: Element,
  lineIds: readonly string[],
  fallbackColors: Readonly<Record<string, string>> = {},
): { colors: Map<string, string>; paint: TrainMarkerPaint } | null {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return null;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.style.visibility = "hidden";
  // A line without its own colour rule inherits the fallback set here.
  const fallback = document.createElementNS(SVG_NS, "g");
  const group = document.createElementNS(SVG_NS, "g");
  const part = (tag: string, className: string) => {
    const element = document.createElementNS(SVG_NS, tag);
    element.setAttribute("class", className);
    group.append(element);
    return element;
  };
  const outline = part("path", "estimated-train-marker-outline");
  const core = part("path", "estimated-train-marker-core");
  const pane = part("rect", "estimated-train-marker-window");
  const arrow = part("path", "estimated-train-marker-arrow");
  fallback.append(group);
  svg.append(fallback);
  host.append(svg);
  try {
    const colors = new Map<string, string>();
    for (const lineId of lineIds) {
      fallback.style.color = fallbackColors[lineId] ?? "#64748b";
      group.setAttribute("class", `estimated-train-marker estimated-train-marker-${lineId}`);
      colors.set(lineId, getComputedStyle(group).color);
    }
    const style = (element: Element) => getComputedStyle(element);
    const width = (value: string) => Number.parseFloat(value) || 0;
    const paint: TrainMarkerPaint = {
      outlineStroke: style(outline).stroke,
      outlineWidth: width(style(outline).strokeWidth),
      coreStroke: style(core).stroke,
      coreWidth: width(style(core).strokeWidth),
      windowFill: style(pane).fill,
      arrowFill: style(arrow).fill,
      arrowStroke: style(arrow).stroke,
      arrowWidth: width(style(arrow).strokeWidth),
      shadow: style(group).filter !== "none",
    };
    return { colors, paint };
  } finally {
    svg.remove();
  }
}

/** Glyph-space half extent drawn: the body (36 x 15) plus outline and shadow room. */
const TRAIN_GLYPH_HALF_WIDTH = 44;
const TRAIN_GLYPH_HALF_HEIGHT = 24;
/** The body's length in glyph units (nose to back). */
const TRAIN_GLYPH_BODY_LENGTH = 72;

/**
 * Draws the glyph pointing east, its body `bodyLengthPx` CSS px long, at
 * `pixelRatio` device pixels per CSS px. Synchronous (Path2D), so a style
 * reload can re-add it before its layer draws. Null without a canvas.
 */
export function drawTrainMarkerImage(
  color: string,
  paint: TrainMarkerPaint,
  bodyLengthPx: number,
  pixelRatio: number,
): ImageData | null {
  if (typeof document === "undefined" || typeof Path2D === "undefined") return null;
  const unitsToDevice = (bodyLengthPx / TRAIN_GLYPH_BODY_LENGTH) * pixelRatio;
  const width = Math.ceil(2 * TRAIN_GLYPH_HALF_WIDTH * unitsToDevice);
  const height = Math.ceil(2 * TRAIN_GLYPH_HALF_HEIGHT * unitsToDevice);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.translate(width / 2, height / 2);
  context.scale(unitsToDevice, unitsToDevice);
  context.lineJoin = "round";
  context.lineCap = "round";
  const body = new Path2D(TRAIN_MARKER_BODY_PATH);
  if (paint.shadow) {
    // drop-shadow(0 2px 4px rgb(0 0 0 / 45%)), in glyph units.
    context.save();
    context.shadowColor = "rgba(0, 0, 0, 0.45)";
    context.shadowOffsetY = 2 * unitsToDevice;
    context.shadowBlur = 4 * unitsToDevice;
    context.fillStyle = paint.outlineStroke;
    context.fill(body);
    context.restore();
  }
  context.strokeStyle = paint.outlineStroke;
  context.lineWidth = paint.outlineWidth;
  context.stroke(body);
  context.fillStyle = color;
  context.fill(body);
  context.strokeStyle = paint.coreStroke;
  context.lineWidth = paint.coreWidth;
  context.stroke(body);
  context.fillStyle = paint.windowFill;
  for (const pane of TRAIN_MARKER_WINDOWS) {
    context.beginPath();
    context.roundRect(pane.x, pane.y, pane.width, pane.height, pane.rx);
    context.fill();
  }
  const arrow = new Path2D(TRAIN_MARKER_ARROW_PATH);
  context.fillStyle = paint.arrowFill;
  context.fill(arrow);
  if (paint.arrowWidth > 0) {
    context.strokeStyle = paint.arrowStroke;
    context.lineWidth = paint.arrowWidth;
    context.stroke(arrow);
  }
  return context.getImageData(0, 0, width, height);
}

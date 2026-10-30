#!/usr/bin/env node
/*
 * Extracts each System Map's geometry from its authored SVG into data, so the
 * maps place overlays, targets and badges without measuring the live DOM.
 * Everything is in the root SVG's coordinates. Label boxes depend on the
 * label font, so the SVG is laid out in Chromium with the app's font.
 *
 *   node scripts/prepare-map-geometry.mjs [--check] [--out <dir>]
 *
 * --check exits non-zero when a geometry file is stale.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

import { MAP_GEOMETRY_FORMAT, MAP_GEOMETRY_SOURCES } from "../src/app/map-geometry-data.ts";

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDirectory = join(frontendDirectory, "public");
const argumentsList = process.argv.slice(2);
const checkOnly = argumentsList.includes("--check");
const outIndex = argumentsList.indexOf("--out");
const outputDirectory = outIndex >= 0 ? resolve(argumentsList[outIndex + 1]) : null;

const FONT_CSS = ["regular", "bold"].map((weight) => `
  @font-face {
    font-family: "TeX Gyre Heros";
    src: url("/assets/fonts/texgyreheros-${weight}.woff2") format("woff2");
    font-weight: ${weight === "bold" ? 700 : 400};
  }`).join("\n");

/** Runs in the page: reads one map's geometry from its laid-out SVG. */
function extractGeometry(config) {
  const round = (value) => Math.round(value * 100) / 100 || 0;
  const svg = document.querySelector("svg");
  const rootInverse = svg.getScreenCTM().inverse();
  const toRoot = (element) => rootInverse.multiply(element.getScreenCTM());
  const matrixOf = (matrix) => [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].map((value) => Math.round(value * 1e6) / 1e6 || 0);
  const apply = (matrix, x, y) => ({ x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f });
  const flat = (points) => points.flatMap((point) => [round(point.x), round(point.y)]);
  const number = (element, name) => Number.parseFloat(element.getAttribute(name) ?? "") || 0;
  const labelOf = (element) => element.getAttribute("inkscape:label") ?? "";
  const boxOf = (element) => {
    const box = element.getBBox();
    if (!(box.width > 0 && box.height > 0)) return null;
    const matrix = toRoot(element);
    const corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]
      .map(([x, y]) => apply(matrix, x, y));
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x: round(x), y: round(y), width: round(Math.max(...xs) - x), height: round(Math.max(...ys) - y) };
  };
  const polygonOf = (element) => {
    const box = element.getBBox();
    if (!(box.width > 0 && box.height > 0)) return null;
    const matrix = toRoot(element);
    return flat([[box.x, box.y], [box.x + box.width, box.y], [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]]
      .map(([x, y]) => apply(matrix, x, y)));
  };
  // A straight-edged path's vertices (M, L, H, V and Z only), or null.
  const linearVertices = (pathD) => {
    if (/[aAcCqQsStT]/.test(pathD)) return null;
    const tokens = pathD.match(/[MmLlHhVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) ?? [];
    const points = [];
    let index = 0;
    let command = "";
    let current = { x: 0, y: 0 };
    let start = current;
    const isCommand = (token) => /^[A-Za-z]$/.test(token);
    while (index < tokens.length) {
      if (isCommand(tokens[index])) command = tokens[index++];
      const relative = command === command.toLowerCase();
      const read = () => Number(tokens[index++]);
      switch (command.toLowerCase()) {
        case "m":
        case "l": {
          const x = read();
          const y = read();
          current = relative ? { x: current.x + x, y: current.y + y } : { x, y };
          if (command.toLowerCase() === "m") {
            start = current;
            // Coordinates after a moveto are linetos.
            command = relative ? "l" : "L";
          }
          break;
        }
        case "h": {
          const x = read();
          current = { x: relative ? current.x + x : x, y: current.y };
          break;
        }
        case "v": {
          const y = read();
          current = { x: current.x, y: relative ? current.y + y : y };
          break;
        }
        case "z":
          current = start;
          break;
        default:
          return null;
      }
      points.push(current);
      while (index < tokens.length && command.toLowerCase() === "z" && !isCommand(tokens[index])) index++;
    }
    return points;
  };
  // Straight-edged paths keep their exact corners; curves are sampled.
  const polylineOf = (path, spacing) => {
    const length = path.getTotalLength();
    if (!(length > 0)) return [];
    const matrix = toRoot(path);
    const vertices = linearVertices(path.getAttribute("d") ?? "");
    const count = Math.max(1, Math.ceil(length / spacing));
    const points = vertices
      ? vertices.map((point) => apply(matrix, point.x, point.y))
      : Array.from({ length: count + 1 }, (_unused, index) => {
          const point = path.getPointAtLength((length * index) / count);
          return apply(matrix, point.x, point.y);
        });
    // Drop points on the straight line through their neighbours.
    const kept = [points[0]];
    for (let index = 1; index < points.length - 1; index++) {
      const previous = kept[kept.length - 1];
      const next = points[index + 1];
      const point = points[index];
      const chord = Math.hypot(next.x - previous.x, next.y - previous.y);
      const offset = chord === 0 ? Math.hypot(point.x - previous.x, point.y - previous.y)
        : Math.abs((next.x - previous.x) * (previous.y - point.y) - (previous.x - point.x) * (next.y - previous.y)) / chord;
      if (offset > 0.05) kept.push(point);
    }
    kept.push(points[points.length - 1]);
    return flat(kept);
  };

  const shapeOf = (element) => {
    const tag = element.tagName.toLowerCase();
    const shape = { tag, id: element.id || undefined };
    const transform = element.getAttribute("transform");
    if (transform) shape.transform = transform;
    if (tag === "circle") Object.assign(shape, { cx: number(element, "cx"), cy: number(element, "cy"), r: number(element, "r") });
    else if (tag === "ellipse") Object.assign(shape, { cx: number(element, "cx"), cy: number(element, "cy"), rx: number(element, "rx"), ry: number(element, "ry") });
    else if (tag === "rect") {
      const style = getComputedStyle(element);
      const rx = element.hasAttribute("rx") ? number(element, "rx") : number(element, "ry");
      Object.assign(shape, {
        x: number(element, "x"),
        y: number(element, "y"),
        width: number(element, "width"),
        height: number(element, "height"),
        rx,
        ry: element.hasAttribute("ry") ? number(element, "ry") : rx,
        stroke: style.stroke,
        strokeWidth: Number.parseFloat(style.strokeWidth) || 0,
      });
      if (labelOf(element) === "join-rectangle") shape.join = true;
    } else return null;
    return shape;
  };
  // A dot's centre and radius in root coordinates.
  const anchorOf = (shape, element) => {
    const matrix = toRoot(element);
    if (shape.tag === "rect") {
      const center = apply(matrix, shape.x + shape.width / 2, shape.y + shape.height / 2);
      return { id: shape.id, x: round(center.x), y: round(center.y), radius: round(Math.min(shape.width, shape.height) / 2) };
    }
    const radiusX = shape.r ?? shape.rx;
    const radiusY = shape.r ?? shape.ry;
    const center = apply(matrix, shape.cx, shape.cy);
    const xEdge = apply(matrix, shape.cx + radiusX, shape.cy);
    const yEdge = apply(matrix, shape.cx, shape.cy + radiusY);
    return {
      id: shape.id,
      x: round(center.x),
      y: round(center.y),
      radius: round(Math.min(Math.hypot(xEdge.x - center.x, xEdge.y - center.y), Math.hypot(yEdge.x - center.x, yEdge.y - center.y))),
    };
  };

  const stationsLayer = svg.querySelector(config.stationsLayer);
  // A station is a `station-*` element without a `station-*` ancestor: a dot,
  // or a group of dots (GO/UP junctions such as Bloor).
  const stations = [...stationsLayer.querySelectorAll("[id^='station-']")]
    .filter((element) => !element.parentElement.closest("[id^='station-']"))
    .flatMap((element) => {
      const isGroup = element.tagName.toLowerCase() === "g";
      const sources = isGroup ? [...element.querySelectorAll("circle, ellipse, rect")] : [element];
      const shapes = sources.map((source) => {
        const shape = shapeOf(source);
        if (!shape) return null;
        // A lone shape's own transform moves to the station.
        if (!isGroup) delete shape.transform;
        if (!shape.id) shape.id = element.id;
        return shape;
      }).filter(Boolean);
      if (shapes.length === 0) return [];
      return [{
        id: element.id,
        transform: matrixOf(toRoot(element)),
        shapes,
        anchors: sources
          .map((source, index) => [source, shapes[index]])
          .filter(([, shape]) => shape && !shape.join)
          .map(([source, shape]) => anchorOf(shape, source)),
      }];
    });

  // Segment endpoints: the centre of every station element (TTC's anchor rule).
  const anchors = {};
  for (const element of stationsLayer.querySelectorAll("[id^='station-']")) {
    const box = element.getBBox();
    const center = apply(toRoot(element), box.x + box.width / 2, box.y + box.height / 2);
    anchors[element.id] = { x: round(center.x), y: round(center.y) };
  }

  const labels = [...svg.querySelectorAll(config.labels)].flatMap((label) => {
    const stationId = label.dataset.stationLabelFor ?? label.dataset.regionalStationLabelFor;
    const box = label.getBBox();
    if (!stationId || !(box.width > 0 && box.height > 0)) return [];
    return [{
      stationId,
      name: (label.textContent ?? "").replace(/\s+/g, " ").trim(),
      box: { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) },
      matrix: matrixOf(toRoot(label)),
    }];
  });

  const lines = [...svg.querySelectorAll(config.lines)].map((path) => ({
    id: config.lineIdAttribute === "label" ? labelOf(path) : path.id,
    points: polylineOf(path, config.lineSampleSpacing),
  })).filter((line) => line.id && line.points.length > 2);

  const guides = {};
  for (const path of config.guides ? svg.querySelectorAll(config.guides) : []) {
    const label = labelOf(path);
    if (label) guides[label] = polylineOf(path, 24);
  }

  // Badge placement obstacles: names, artwork boxes and stroked lines.
  const ignored = config.obstacleIgnore ? (element) => Boolean(element.closest(config.obstacleIgnore)) : () => false;
  const artwork = { labels: [], boxes: [], strokes: [] };
  for (const element of svg.querySelectorAll(config.obstacleLabels)) {
    if (ignored(element)) continue;
    const polygon = polygonOf(element);
    if (polygon) artwork.labels.push(polygon);
  }
  for (const [kind, selector] of Object.entries(config.obstacleBoxes)) {
    for (const element of svg.querySelectorAll(selector)) {
      if (ignored(element)) continue;
      const style = getComputedStyle(element);
      if (style.display === "none") continue;
      if (config.obstacleStrokes && (element instanceof SVGPathElement || element instanceof SVGPolylineElement)) {
        const transparent = (paint) => paint === "none" || paint === "transparent" || /rgba\([^)]*,\s*0\)$/.test(paint);
        if (transparent(style.fill) && !transparent(style.stroke)) {
          const matrix = toRoot(element);
          const scale = Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c));
          const points = polylineOf(element, 24);
          if (points.length > 0) artwork.strokes.push({ points, halfWidth: round((Number.parseFloat(style.strokeWidth) || 0) * scale / 2) });
          continue;
        }
      }
      const box = boxOf(element);
      if (box) artwork.boxes.push({ kind, ...box });
    }
  }

  // The authored numbers, not the float32 SVGRect.
  const [viewX, viewY, viewWidth, viewHeight] = svg.getAttribute("viewBox").trim().split(/[\s,]+/).map(Number);
  return {
    viewBox: { x: viewX, y: viewY, width: viewWidth, height: viewHeight },
    stations,
    anchors,
    labels,
    lines,
    ...(config.guides ? { guides } : {}),
    artwork,
  };
}

/** Runs in the page: tags GO/UP station names with their station, as prepareRegionalMapMarkup does. */
function tagRegionalLabels() {
  const normalized = (value) => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const stationIds = new Map();
  for (const element of document.querySelectorAll("[id^='station-']")) {
    if (element.id.endsWith("-ki") || element.id.endsWith("-up")) continue;
    const stationId = element.id.replace(/^station-/, "");
    stationIds.set(normalized(stationId), stationId);
  }
  for (const label of document.querySelectorAll("#regional-station-labels-layer > text")) {
    const stationId = stationIds.get(normalized(label.textContent ?? ""));
    if (stationId) label.dataset.regionalStationLabelFor = stationId;
  }
  for (const element of document.querySelectorAll("g")) {
    const label = element.getAttribute("inkscape:label") ?? "";
    if (label.startsWith("via-rail-") || label.endsWith("airport-icon")) element.classList.add("map-connection-label");
  }
}

const EXTRACTION = {
  ttc: {
    stationsLayer: "#ttc-stations-layer",
    labels: "#ttc-station-labels-layer [data-station-label-for]",
    lines: "[inkscape\\:label='tracks'] path, #ttc-tracks-layer path",
    lineIdAttribute: "label",
    lineSampleSpacing: 8,
    guides: "#non-linear-guides-layer path",
    obstacleIgnore: "#non-linear-guides-layer, defs",
    obstacleLabels: "text, tspan",
    // Every other drawn element; stroke-only paths become corridors.
    obstacleBoxes: { artwork: "path, rect, circle, ellipse, polygon, polyline, image, use" },
    obstacleStrokes: true,
  },
  regional: {
    stationsLayer: "#regional-stations-layer",
    labels: "#regional-station-labels-layer [data-regional-station-label-for]",
    lines: "#regional-lines-layer path[id^='regional-route-']",
    lineIdAttribute: "id",
    lineSampleSpacing: 8,
    obstacleIgnore: "defs",
    obstacleLabels: "text",
    obstacleBoxes: {
      "connection-label": ".map-connection-label",
      artwork: "#regional-stations-layer :is(rect, circle, ellipse)",
      "line-badge": "#regional-route-labels-layer :is(rect, path, image, use)",
    },
    obstacleStrokes: false,
  },
};

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function main() {
  const browser = await chromium.launch();
  let stale = false;
  try {
    const page = await browser.newPage();
    await page.route("http://map.local/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/") await route.fulfill({ contentType: "text/html", body: "<!doctype html>" });
      else await route.fulfill({ body: await readFile(join(publicDirectory, path)) });
    });
    for (const [map, source] of Object.entries(MAP_GEOMETRY_SOURCES)) {
      const svgPath = join(frontendDirectory, source.svg);
      const geometryPath = outputDirectory
        ? join(outputDirectory, source.geometry.split("/").at(-1))
        : join(frontendDirectory, source.geometry);
      const hash = await sha256(svgPath);
      const markup = await readFile(svgPath, "utf8");
      await page.goto("http://map.local/");
      await page.setContent(`<!doctype html><html><head><style>
        ${FONT_CSS}
        html, body { margin: 0; }
        svg { display: block; width: 4000px; height: auto; shape-rendering: geometricPrecision; text-rendering: geometricPrecision; }
        text, tspan { font-family: "TeX Gyre Heros", Arial, Helvetica, sans-serif !important; }
      </style></head><body>${markup.replace(/^<\?xml[^>]*>/, "")}</body></html>`);
      await page.evaluate(async () => {
        await Promise.all(['400 80px "TeX Gyre Heros"', '700 100px "TeX Gyre Heros"'].map((spec) => document.fonts.load(spec)));
        await document.fonts.ready;
      });
      if (map === "regional") await page.evaluate(tagRegionalLabels);
      const geometry = await page.evaluate(extractGeometry, EXTRACTION[map]);
      const output = `${JSON.stringify({ format: MAP_GEOMETRY_FORMAT, map, source: { svg: source.svg, sha256: hash }, ...geometry })}\n`;
      if (checkOnly) {
        const current = await readFile(geometryPath, "utf8").catch(() => "");
        if (current !== output) {
          stale = true;
          console.error(`${source.geometry} is stale; run npm --prefix frontend run prepare:map-geometry`);
        }
        continue;
      }
      await writeFile(geometryPath, output);
      console.log(`wrote ${geometryPath} (${Math.round(output.length / 1024)} KB)`);
    }
  } finally {
    await browser.close();
  }
  if (stale) process.exit(1);
}

await main();

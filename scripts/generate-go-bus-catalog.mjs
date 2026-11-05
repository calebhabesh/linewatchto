#!/usr/bin/env node

/**
 * GO bus corridors and stops for the GO/UP Map View (plan 13, S6).
 *
 * Reads the GO Transit static GTFS archive (Metrolinx Open Data) and writes
 * frontend/public/assets/linewatch/geographic/go-surface-bus.json (one line
 * per road with the GO bus routes on it, and each route's weekday trip
 * counts) and go-surface-bus-stops.json (the bus stops those lines serve).
 *
 * The GO feed differs from the TTC feed the S1/S5 generator reads:
 * - Service is dated (calendar_dates.txt only, one service per day). The
 *   weekday is the first full Monday-to-Friday week in the feed; trip counts
 *   are that week's, and `weekdayTrips` is the average per weekday.
 * - Neither shapes.txt nor stop_times.txt has shape_dist_traveled. Distances
 *   are measured along the shape, and each stop is placed where the shape
 *   passes closest to it, in stop order.
 * - Stops have no pole number in `stop_code`; the GO stop number is
 *   `stop_id` (the code gotransit.com and Next Service use).
 * - Branches are `route_variant` (21A, 27F); badges are per route (21).
 *
 * Rail stations (letter stop IDs) cut lines but are not bus stops: the rail
 * catalog already draws them.
 *
 * Usage:
 *   node scripts/generate-go-bus-catalog.mjs [--go-gtfs <zip>] [--output <json>] [--backend-stops <csv>]
 *
 * Also writes backend/src/main/resources/regional/go-bus-stops.csv: the stop
 * numbers the backend accepts for GO bus stop departures, with name and routes,
 * and go-surface-bus-route-stops.json (each route's stops in order by
 * direction, for the route panel, plan 14), then rebuilds the GO search index.
 *
 * Default archive: /tmp/linewatch-gtfs/GO-GTFS.zip (the current file from
 * Metrolinx Open Data). Output is deterministic for a given archive.
 */

import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { gzipSync } from "node:zlib";
import { buildSurfaceCorridors, placeStopsAlongShape } from "./lib/surface-corridors.mjs";
import { buildRouteStopSequences } from "./lib/route-stop-sequences.mjs";
import { validateCoordinate } from "./lib/geographic-geometry.mjs";

const args = process.argv.slice(2);
const arg = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
};
const zipPath = resolve(arg("--go-gtfs", "/tmp/linewatch-gtfs/GO-GTFS.zip"));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const outputPath = resolve(arg("--output", resolve(repoRoot, "frontend/public/assets/linewatch/geographic/go-surface-bus.json")));
const stopsOutputPath = outputPath.replace(/\.json$/, "-stops.json");
// The backend serves departures only for stops in this list (plan 13, S6).
const backendStopsPath = resolve(arg("--backend-stops", resolve(repoRoot, "backend/src/main/resources/regional/go-bus-stops.csv")));

/** One CSV record; GTFS fields may be quoted and contain commas. */
function parseCsvLine(line) {
  const out = [];
  let field = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(field); field = ""; }
    else field += ch;
  }
  out.push(field);
  return out;
}

function readTable(name) {
  const text = execFileSync("unzip", ["-p", zipPath, name], { maxBuffer: 200 * 1024 * 1024, encoding: "utf8" });
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0].replace(/^﻿/, "")).map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, (cols[i] ?? "").trim()]));
  });
}

/** Streams a large table, calling `onRow` with the named columns only. */
async function streamTable(name, wanted, onRow) {
  const child = spawn("unzip", ["-p", zipPath, name]);
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let indices = null;
  for await (const rawLine of lines) {
    if (!rawLine) continue;
    if (!indices) {
      const headers = parseCsvLine(rawLine.replace(/^﻿/, "")).map(h => h.trim());
      indices = wanted.map(column => {
        const index = headers.indexOf(column);
        if (index < 0) throw new Error(`${name} has no ${column} column`);
        return index;
      });
      continue;
    }
    const cols = rawLine.includes('"') ? parseCsvLine(rawLine) : rawLine.split(",");
    onRow(indices.map(index => (cols[index] ?? "").trim()));
  }
  const code = await new Promise(done => child.on("close", done));
  if (code !== 0) throw new Error(`unzip ${name} exited with ${code}`);
}

const archiveSha256 = createHash("sha256").update(readFileSync(zipPath)).digest("hex");
const [feedInfo] = readTable("feed_info.txt");
const isoDate = value => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
const compactDate = date => date.toISOString().slice(0, 10).replaceAll("-", "");

// Dated service: the first full Monday-to-Friday week in which every day runs.
const servicesByDate = new Map();
for (const row of readTable("calendar_dates.txt")) {
  if (row.exception_type !== "1") continue;
  if (!servicesByDate.has(row.date)) servicesByDate.set(row.date, new Set());
  servicesByDate.get(row.date).add(row.service_id);
}
const WEEKDAY_COUNT = 5;
let weekDates = null;
for (let day = new Date(`${isoDate(feedInfo.feed_start_date)}T12:00:00Z`); compactDate(day) <= feedInfo.feed_end_date; day.setUTCDate(day.getUTCDate() + 1)) {
  if (day.getUTCDay() !== 1) continue;
  const dates = Array.from({ length: WEEKDAY_COUNT }, (_, offset) => {
    const d = new Date(day);
    d.setUTCDate(d.getUTCDate() + offset);
    return compactDate(d);
  });
  if (dates.every(date => servicesByDate.has(date))) {
    weekDates = dates;
    break;
  }
}
if (!weekDates) throw new Error("No full Monday-to-Friday week of service in calendar_dates.txt");
const weekServices = new Set(weekDates.flatMap(date => [...servicesByDate.get(date)]));

const routes = new Map(
  readTable("routes.txt").filter(route => route.route_type === "3").map(route => [route.route_id, route]),
);
if (routes.size === 0) throw new Error("No bus routes (route_type 3) in routes.txt");
const routeKey = route => route.route_short_name;

const routeTrips = new Map([...routes.values()].map(route => [routeKey(route), 0]));
const routeVariants = new Map([...routes.values()].map(route => [routeKey(route), new Set()]));
/** trip_id -> { route short name, shape id } for the week's bus trips */
const busTrips = new Map();
let tripsWithoutShape = 0;
for (const trip of readTable("trips.txt")) {
  const route = routes.get(trip.route_id);
  if (!route || !weekServices.has(trip.service_id)) continue;
  routeTrips.set(routeKey(route), routeTrips.get(routeKey(route)) + 1);
  if (trip.route_variant) routeVariants.get(routeKey(route)).add(trip.route_variant);
  if (!trip.shape_id) {
    tripsWithoutShape++;
    continue;
  }
  busTrips.set(trip.trip_id, {
    routeShortName: routeKey(route),
    shapeId: trip.shape_id,
    direction: Number(trip.direction_id || 0),
    headsign: trip.trip_headsign,
  });
}

/** trip_id -> [stop_sequence, stop_id][] */
const tripStops = new Map();
await streamTable("stop_times.txt", ["trip_id", "stop_id", "stop_sequence"], ([tripId, stopId, sequence]) => {
  if (!busTrips.has(tripId)) return;
  if (!tripStops.has(tripId)) tripStops.set(tripId, []);
  tripStops.get(tripId).push([Number(sequence), stopId]);
});

const stopsById = new Map(readTable("stops.txt").map(stop => [stop.stop_id, stop]));
const stopPoint = stopId => {
  const stop = stopsById.get(stopId);
  if (!stop) throw new Error(`Stop ${stopId} is in stop_times.txt but not stops.txt`);
  return [Number(stop.stop_lon), Number(stop.stop_lat)];
};

const isRailStation = stopId => /^[A-Z]+$/.test(stopId);

// Trips with the same route, shape and stops are one pattern. A trip with
// fewer than two bus stops runs between rail stations (a rail replacement,
// such as 35B for UP Express): counted, not drawn, as TTC replacement buses.
const patternsByKey = new Map();
let railReplacementTrips = 0;
for (const [tripId, trip] of busTrips) {
  const stops = (tripStops.get(tripId) ?? []).sort((a, b) => a[0] - b[0]).map(([, stopId]) => stopId);
  if (stops.length < 2) continue;
  if (stops.filter(stopId => !isRailStation(stopId)).length < 2) {
    railReplacementTrips++;
    continue;
  }
  const key = `${trip.routeShortName}|${trip.shapeId}|${stops.join(" ")}`;
  let pattern = patternsByKey.get(key);
  if (!pattern) {
    pattern = { routeShortName: trip.routeShortName, shapeId: trip.shapeId, trips: 0, stopIds: stops, stops: null, shape: null };
    patternsByKey.set(key, pattern);
  }
  pattern.trips++;
}
let patterns = [...patternsByKey.values()];

const neededShapes = new Set(patterns.map(p => p.shapeId));
const shapePoints = new Map();
await streamTable("shapes.txt", ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"], ([id, lat, lon, seq]) => {
  if (!neededShapes.has(id)) return;
  if (!shapePoints.has(id)) shapePoints.set(id, []);
  shapePoints.get(id).push({ seq: Number(seq), lat: Number(lat), lon: Number(lon) });
});

// A stop the shape never comes near (the feed's shape misses a stop) drops
// that pattern rather than drawing a line through somewhere it does not go.
const MAX_STOP_OFFSET_METERS = 150;
const misplaced = [];
patterns = patterns.filter(pattern => {
  const points = shapePoints.get(pattern.shapeId);
  if (!points) throw new Error(`Shape ${pattern.shapeId} not found in shapes.txt`);
  const placed = placeStopsAlongShape(points.slice().sort((a, b) => a.seq - b.seq), pattern.stopIds.map(stopPoint));
  const worst = Math.max(...placed.offsets);
  if (worst > MAX_STOP_OFFSET_METERS) {
    misplaced.push({ route: pattern.routeShortName, shapeId: pattern.shapeId, trips: pattern.trips, worst: Math.round(worst) });
    return false;
  }
  pattern.shape = placed.shape;
  pattern.stops = pattern.stopIds.map((stopId, i) => ({ stopId, dist: placed.distances[i] }));
  return true;
});

// Five weekdays of trips: a gap needs one trip a day, or a quarter of its
// route's busiest gap, so a route's rare one-trip variant stays out.
const { corridors, stopRoutes } = buildSurfaceCorridors(patterns, {
  minPairTrips: WEEKDAY_COUNT,
  minRouteShare: 0.25,
  // Opposite carriageways of a highway sit farther apart than a street's.
  mergeToleranceMeters: Number(arg("--merge-meters", "60")),
  simplifyMeters: Number(arg("--simplify-meters", "5")),
  minRunMeters: 80,
});

const routeOrder = (a, b) => a.localeCompare(b, "en", { numeric: true });
const corridorFeatures = [];
const perRouteSet = new Map();
for (const corridor of corridors) {
  const setKey = corridor.routes.join("-");
  const n = (perRouteSet.get(setKey) ?? 0) + 1;
  perRouteSet.set(setKey, n);
  corridorFeatures.push({
    type: "Feature",
    id: `go-bus-corridor-${setKey}-${n}`,
    geometry: { type: "LineString", coordinates: corridor.coordinates },
    properties: { featureType: "go-bus-corridor", routes: corridor.routes },
  });
}

const stopFeatures = [...stopRoutes.entries()]
  .filter(([stopId]) => !isRailStation(stopId))
  .map(([stopId, served]) => {
    const stop = stopsById.get(stopId);
    // 5 decimals is about a metre: the pole, not the street.
    const coordinates = [Number(Number(stop.stop_lon).toFixed(5)), Number(Number(stop.stop_lat).toFixed(5))];
    validateCoordinate(coordinates);
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates },
      properties: { featureType: "go-bus-stop", stopCode: stopId, name: stop.stop_name, routes: served },
    };
  })
  .sort((a, b) => a.properties.stopCode.localeCompare(b.properties.stopCode, "en", { numeric: true }));

// Route stop sequences (plan 14, U1): the stops of each drawn pattern's trips
// in order, by direction, for the route panel. Rail stations and stops the
// map does not draw are left out; trip counts are per weekday.
const mapStopCodes = new Set(stopFeatures.map(feature => feature.properties.stopCode));
const drawnPatterns = new Set(patterns.map(p => `${p.routeShortName}|${p.shapeId}|${p.stopIds.join(" ")}`));
const sequencePatterns = new Map();
for (const [tripId, trip] of busTrips) {
  const stopIds = (tripStops.get(tripId) ?? []).map(([, stopId]) => stopId);
  if (!drawnPatterns.has(`${trip.routeShortName}|${trip.shapeId}|${stopIds.join(" ")}`)) continue;
  const stops = stopIds.filter(stopId => mapStopCodes.has(stopId));
  const key = `${trip.routeShortName}|${trip.direction}|${trip.headsign}|${stops.join(" ")}`;
  const entry = sequencePatterns.get(key);
  if (entry) entry.trips++;
  else sequencePatterns.set(key, { route: trip.routeShortName, direction: trip.direction, headsign: trip.headsign, trips: 1, stops });
}
const routeStopSequences = buildRouteStopSequences([...sequencePatterns.values()]);
for (const sequences of Object.values(routeStopSequences)) {
  for (const sequence of sequences) sequence.trips = Math.max(1, Math.round(sequence.trips / WEEKDAY_COUNT));
}

const drawnRoutes = new Set(corridors.flatMap(c => c.routes));
const routeSummaries = [...routes.values()]
  .sort((a, b) => routeOrder(routeKey(a), routeKey(b)))
  .map(route => ({
    route: routeKey(route),
    name: route.route_long_name,
    color: `#${route.route_color || "00853E"}`,
    textColor: `#${route.route_text_color || "FFFFFF"}`,
    drawn: drawnRoutes.has(routeKey(route)),
    variants: [...routeVariants.get(routeKey(route))].sort(routeOrder),
    weekdayTrips: Math.round(routeTrips.get(routeKey(route)) / WEEKDAY_COUNT),
  }));

const source = {
  sourceName: "GO Transit GTFS",
  publisher: "Metrolinx",
  license: "Metrolinx Open Data",
  feedVersion: feedInfo.feed_version,
  feedStartDate: isoDate(feedInfo.feed_start_date),
  feedEndDate: isoDate(feedInfo.feed_end_date),
  archiveSha256,
  servicePattern: "weekday",
  sampleWeek: [isoDate(weekDates[0]), isoDate(weekDates[WEEKDAY_COUNT - 1])],
};

const catalog = {
  type: "FeatureCollection",
  schemaVersion: "1.0.0",
  network: "regional",
  layer: "go-bus",
  source,
  routes: routeSummaries,
  features: corridorFeatures,
};
const stopsCatalog = {
  type: "FeatureCollection",
  schemaVersion: "1.0.0",
  network: "regional",
  layer: "go-bus-stops",
  source,
  features: stopFeatures,
};

const json = JSON.stringify(catalog) + "\n";
const stopsJson = JSON.stringify(stopsCatalog) + "\n";
writeFileSync(outputPath, json, "utf8");
writeFileSync(stopsOutputPath, stopsJson, "utf8");
// Loaded only when a route panel first opens (plan 14, U5).
const sequencesOutputPath = outputPath.replace(/\.json$/, "-route-stops.json");
const sequencesJson = JSON.stringify({
  schemaVersion: "1.0.0",
  network: "regional",
  layer: "go-bus-route-stops",
  source,
  routes: routeStopSequences,
}) + "\n";
writeFileSync(sequencesOutputPath, sequencesJson, "utf8");
const csvField = value => (/[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
const backendCsv = ["stop_code,name,routes", ...stopFeatures.map(({ properties: p }) =>
  [p.stopCode, p.name, p.routes.join(" ")].map(csvField).join(","))].join("\n") + "\n";
mkdirSync(dirname(backendStopsPath), { recursive: true });
writeFileSync(backendStopsPath, backendCsv, "utf8");

const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`;
const km = corridors.reduce((sum, c) => {
  let total = 0;
  for (let i = 1; i < c.coordinates.length; i++) {
    const [a, b] = [c.coordinates[i - 1], c.coordinates[i]];
    const kx = 111.32 * Math.cos((a[1] * Math.PI) / 180);
    total += Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * 110.54);
  }
  return sum + total;
}, 0);
console.log(`[GO bus catalog] feed ${feedInfo.feed_version} (${source.feedStartDate} to ${source.feedEndDate}), week ${source.sampleWeek.join(" to ")}`);
console.log(`  Patterns: ${patterns.length} from ${busTrips.size} trips (${tripsWithoutShape} without a shape; ${misplaced.length} patterns dropped, a stop over ${MAX_STOP_OFFSET_METERS} m from the shape; ${railReplacementTrips} rail replacement trips counted, not drawn)`);
for (const m of misplaced) console.log(`    dropped ${m.route} shape ${m.shapeId}: ${m.trips} trips, a stop ${m.worst} m off`);
console.log(`  Corridors: ${corridorFeatures.length}, ${Math.round(km)} km; bus stops: ${stopFeatures.length}; most routes on one corridor: ${Math.max(...corridors.map(c => c.routes.length))}`);
for (const route of routeSummaries) {
  console.log(`  ${route.route.padEnd(4)} ${route.drawn ? "drawn" : "NOT DRAWN"}  ${route.weekdayTrips} trips a weekday, ${route.variants.length} variants  ${route.name}`);
}
console.log(`  Corridors raw: ${kb(Buffer.byteLength(json))} | Gzipped: ${kb(gzipSync(Buffer.from(json)).length)}`);
console.log(`  Stops raw: ${kb(Buffer.byteLength(stopsJson))} | Gzipped: ${kb(gzipSync(Buffer.from(stopsJson)).length)}`);
console.log(`  Route stop sequences: ${Object.values(routeStopSequences).flat().length} patterns, raw ${kb(Buffer.byteLength(sequencesJson))} | Gzipped: ${kb(gzipSync(Buffer.from(sequencesJson)).length)}`);
console.log(`  Written to: ${outputPath}, ${stopsOutputPath}, ${sequencesOutputPath} and ${backendStopsPath}`);

// The search index reads the catalogs just written (plan 14, U1), so a new
// schedule period rebuilds it.
execFileSync(process.execPath, [
  fileURLToPath(new URL("./generate-search-index.mjs", import.meta.url)),
  "--network", "go", "--dir", dirname(outputPath),
], { stdio: "inherit" });

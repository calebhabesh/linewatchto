#!/usr/bin/env node

/**
 * TTC surface corridors and stops for the Map View (plan 13: streetcars in
 * S1, buses in S5).
 *
 * Reads the TTC static GTFS archive and writes, per mode,
 * frontend/public/assets/linewatch/geographic/ttc-surface-<mode>.json:
 * one line per street with the daytime routes on it, the stops those routes
 * serve, and each route's weekday trip counts. Streetcar geometry comes from
 * weekday streetcar trips only; bus-replacement and short-turn trips are
 * counted, not drawn. Bus geometry comes from weekday trips of daytime bus
 * routes (night routes are left out, as for streetcars); short turns are
 * counted, not drawn. Night mode (S10) draws the 300-series night routes,
 * streetcar and bus, from their Monday-to-Friday trips, each corridor marked
 * with its mode; replacement-bus and short-turn trips are counted, not drawn,
 * and no stops are written (night routes stop at daytime poles).
 *
 * Usage:
 *   node scripts/generate-surface-catalog.mjs [--mode streetcar|bus|night] [--ttc-gtfs <zip>] [--output <json>]
 *
 * Defaults: /tmp/linewatch-gtfs/completegtfs.zip (download it from the TTC
 * Open Data page; scripts/download-geographic-gtfs.mjs pins an older audited
 * archive) and the public asset path above. Output is deterministic for a
 * given archive.
 */

import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { gzipSync } from "node:zlib";
import {
  buildNightCorridors,
  buildSurfaceCorridors,
  isDaytimeBusRoute,
  isDaytimeStreetcarRoute,
  isNightRoute,
  tripKind,
} from "./lib/surface-corridors.mjs";
import { validateCoordinate } from "./lib/geographic-geometry.mjs";

const args = process.argv.slice(2);
const arg = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
};
const zipPath = resolve(arg("--ttc-gtfs", "/tmp/linewatch-gtfs/completegtfs.zip"));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const mode = arg("--mode", "streetcar");
if (mode !== "streetcar" && mode !== "bus" && mode !== "night") {
  throw new Error(`--mode must be streetcar, bus or night, not ${mode}`);
}
const bus = mode === "bus";
// Night (plan 13, S10): the 300-series routes, streetcar and bus, from the
// Monday-to-Friday service, drawn as their own lines (each corridor marked
// streetcar or bus). No stop file: night routes stop at daytime poles.
const night = mode === "night";
const outputPath = resolve(arg("--output", resolve(repoRoot, `frontend/public/assets/linewatch/geographic/ttc-surface-${mode}.json`)));

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

// Weekday service: every service that runs Monday to Friday. Buses also take
// services on some weekdays only: Community routes run Mon/Wed/Thu or Tue/Fri.
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const weekdayServices = new Set(
  readTable("calendar.txt")
    .filter(row => (bus ? WEEKDAYS.some(day => row[day] === "1") : WEEKDAYS.every(day => row[day] === "1")))
    .map(row => row.service_id),
);
if (weekdayServices.size === 0) throw new Error("calendar.txt has no Monday-to-Friday service");

const routes = new Map(
  readTable("routes.txt")
    .filter(night ? isNightRoute : bus ? isDaytimeBusRoute : isDaytimeStreetcarRoute)
    .map(route => [route.route_id, route]),
);
if (routes.size === 0) throw new Error(`No daytime ${mode} routes in routes.txt`);

const routeCounts = new Map([...routes.values()].map(route => [route.route_short_name, {
  streetcar: 0, "replacement-bus": 0, "short-turn": 0,
}]));
/** trip_id -> { route short name, shape id } for the weekday trips drawn */
const streetcarTrips = new Map();
for (const trip of readTable("trips.txt")) {
  const route = routes.get(trip.route_id);
  if (!route || !weekdayServices.has(trip.service_id)) continue;
  // tripKind's "streetcar" is a regular trip of the route: on a bus route, a bus trip.
  const kind = tripKind(trip.trip_headsign);
  routeCounts.get(route.route_short_name)[kind]++;
  if (kind === "streetcar" && trip.shape_id) {
    streetcarTrips.set(trip.trip_id, { routeShortName: route.route_short_name, shapeId: trip.shape_id });
  }
}

/** trip_id -> [stop_sequence, stop_id, shape_dist_traveled][] */
const tripStops = new Map();
await streamTable("stop_times.txt", ["trip_id", "stop_id", "stop_sequence", "shape_dist_traveled"], ([tripId, stopId, sequence, dist]) => {
  if (!streetcarTrips.has(tripId)) return;
  if (!tripStops.has(tripId)) tripStops.set(tripId, []);
  tripStops.get(tripId).push([Number(sequence), stopId, dist === "" ? NaN : Number(dist)]);
});

// Trips with the same route, shape and stops are one pattern.
const patternsByKey = new Map();
let skippedTrips = 0;
for (const [tripId, trip] of streetcarTrips) {
  const stops = (tripStops.get(tripId) ?? []).sort((a, b) => a[0] - b[0]);
  // Some trips (Community buses) leave the first stop's distance blank: it is 0.
  if (stops.length > 0 && Number.isNaN(stops[0][2])) stops[0][2] = 0;
  if (stops.length < 2 || stops.some(([, , dist]) => !Number.isFinite(dist))) {
    skippedTrips++;
    continue;
  }
  const key = `${trip.routeShortName}|${trip.shapeId}|${stops.map(s => s[1]).join(" ")}`;
  let pattern = patternsByKey.get(key);
  if (!pattern) {
    pattern = {
      routeShortName: trip.routeShortName,
      shapeId: trip.shapeId,
      trips: 0,
      stops: stops.map(([, stopId, dist]) => ({ stopId, dist })),
      shape: null,
    };
    patternsByKey.set(key, pattern);
  }
  pattern.trips++;
}
const patterns = [...patternsByKey.values()];

const neededShapes = new Set(patterns.map(p => p.shapeId));
const shapePoints = new Map();
await streamTable("shapes.txt", ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence", "shape_dist_traveled"], ([id, lat, lon, seq, dist]) => {
  if (!neededShapes.has(id)) return;
  if (!shapePoints.has(id)) shapePoints.set(id, []);
  shapePoints.get(id).push({ seq: Number(seq), lat: Number(lat), lon: Number(lon), dist: Number(dist) });
});
for (const pattern of patterns) {
  const points = shapePoints.get(pattern.shapeId);
  if (!points) throw new Error(`Shape ${pattern.shapeId} not found in shapes.txt`);
  pattern.shape = points.slice().sort((a, b) => a.seq - b.seq);
}

// A bus route's own quiet branches still draw (a quarter of its busiest gap),
// so a Community route with 12 trips a day is not lost to the 6-trip floor.
const nightKind = routeShortName => ([...routes.values()]
  .find(route => route.route_short_name === routeShortName)?.route_type === "0" ? "streetcar" : "bus");
const daytime = night ? null : buildSurfaceCorridors(patterns, bus ? { minRouteShare: 0.25 } : {});
const corridors = night ? buildNightCorridors(patterns, nightKind) : daytime.corridors;
const stopRoutes = night ? new Map() : daytime.stopRoutes;

const stopsById = new Map(readTable("stops.txt").map(stop => [stop.stop_id, stop]));
const routeOrder = (a, b) => a.localeCompare(b, "en", { numeric: true });

const corridorFeatures = [];
const perRouteSet = new Map();
for (const corridor of corridors) {
  const setKey = corridor.routes.join("-");
  const n = (perRouteSet.get(setKey) ?? 0) + 1;
  perRouteSet.set(setKey, n);
  corridorFeatures.push(night
    ? {
      type: "Feature",
      id: `night-${corridor.kind}-corridor-${setKey}-${n}`,
      geometry: { type: "LineString", coordinates: corridor.coordinates },
      properties: { featureType: "night-corridor", kind: corridor.kind, routes: corridor.routes },
    }
    : {
      type: "Feature",
      id: `${mode}-corridor-${setKey}-${n}`,
      geometry: { type: "LineString", coordinates: corridor.coordinates },
      properties: { featureType: `${mode}-corridor`, routes: corridor.routes },
    });
}

const stopFeatures = [...stopRoutes.entries()]
  .map(([stopId, served]) => {
    const stop = stopsById.get(stopId);
    if (!stop) throw new Error(`Stop ${stopId} is in stop_times.txt but not stops.txt`);
    const coordinates = [Number(Number(stop.stop_lon).toFixed(6)), Number(Number(stop.stop_lat).toFixed(6))];
    validateCoordinate(coordinates);
    return {
      type: "Feature",
      id: `${mode}-stop-${stopId}`,
      geometry: { type: "Point", coordinates },
      properties: {
        featureType: `${mode}-stop`,
        stopId,
        ...(stop.stop_code ? { stopCode: stop.stop_code } : {}),
        name: stop.stop_name,
        routes: served,
        ...(stop.parent_station ? { parentStation: stop.parent_station } : {}),
      },
    };
  })
  .sort((a, b) => a.properties.stopId.localeCompare(b.properties.stopId, "en", { numeric: true }));

const drawnRoutes = new Set(corridors.flatMap(c => c.routes));
const routeSummaries = [...routes.values()]
  .sort((a, b) => routeOrder(a.route_short_name, b.route_short_name))
  .map(route => {
    const counts = routeCounts.get(route.route_short_name);
    return {
      route: route.route_short_name,
      name: route.route_long_name,
      color: `#${route.route_color || "ED1C24"}`,
      textColor: `#${route.route_text_color || "FFFFFF"}`,
      drawn: drawnRoutes.has(route.route_short_name),
      ...(night ? { kind: route.route_type === "0" ? "streetcar" : "bus" } : {}),
      weekdayTrips: night
        ? { night: counts.streetcar, shortTurn: counts["short-turn"], replacementBus: counts["replacement-bus"] }
        : bus
        ? { bus: counts.streetcar + counts["replacement-bus"], shortTurn: counts["short-turn"] }
        : {
          streetcar: counts.streetcar,
          shortTurn: counts["short-turn"],
          replacementBus: counts["replacement-bus"],
        },
    };
  });

// Buses: the stops go in their own file, loaded only when the map nears stop
// zoom (8,000+ stops are two thirds of the bytes). Each keeps what the map
// draws and the bus card looks up: pole number, name, routes.
const busStopFeatures = bus
  ? stopFeatures.filter(feature => feature.properties.stopCode).map(feature => ({
    type: "Feature",
    // 5 decimals is about a metre: the pole, not the street.
    geometry: { type: "Point", coordinates: feature.geometry.coordinates.map(value => Number(value.toFixed(5))) },
    properties: {
      featureType: "bus-stop",
      stopCode: feature.properties.stopCode,
      name: feature.properties.name,
      routes: feature.properties.routes,
    },
  }))
  : [];

const catalog = {
  type: "FeatureCollection",
  schemaVersion: "1.0.0",
  network: "ttc",
  layer: mode,
  source: {
    sourceName: "Merged GTFS - TTC Routes and Schedules",
    publisher: "Toronto Transit Commission (TTC)",
    license: "Open Government Licence – Toronto",
    attribution: "Contains information licensed under the Open Government Licence – Toronto.",
    feedVersion: feedInfo.feed_version,
    feedStartDate: isoDate(feedInfo.feed_start_date),
    feedEndDate: isoDate(feedInfo.feed_end_date),
    archiveSha256,
    servicePattern: night ? "weekday-night" : "weekday",
  },
  routes: routeSummaries,
  features: bus || night ? corridorFeatures : [...corridorFeatures, ...stopFeatures],
};

const json = JSON.stringify(catalog) + "\n";
writeFileSync(outputPath, json, "utf8");
const stopsOutputPath = outputPath.replace(/\.json$/, "-stops.json");
let stopsJson = "";
if (bus) {
  stopsJson = JSON.stringify({
    type: "FeatureCollection",
    schemaVersion: "1.0.0",
    network: "ttc",
    layer: "bus-stops",
    source: catalog.source,
    features: busStopFeatures,
  }) + "\n";
  writeFileSync(stopsOutputPath, stopsJson, "utf8");
}

const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`;
console.log(`[${night ? "Night" : bus ? "Bus" : "Streetcar"} catalog] feed ${feedInfo.feed_version} (${catalog.source.feedStartDate} to ${catalog.source.feedEndDate})`);
console.log(`  Patterns: ${patterns.length} from ${streetcarTrips.size - skippedTrips} weekday ${mode} trips (${skippedTrips} skipped without stop distances)`);
console.log(`  Corridors: ${corridorFeatures.length}, stops: ${stopFeatures.length}`);
for (const route of routeSummaries) {
  const t = route.weekdayTrips;
  console.log(night
    ? `  ${route.route.padEnd(4)} ${route.kind.padEnd(9)} ${route.drawn ? "drawn" : "NOT DRAWN"}  night ${t.night}, short turn ${t.shortTurn}, replacement bus ${t.replacementBus}`
    : bus
    ? `  ${route.route.padEnd(4)} ${route.drawn ? "drawn" : "NOT DRAWN"}  bus ${t.bus}, short turn ${t.shortTurn}`
    : `  ${route.route.padEnd(4)} ${route.drawn ? "drawn" : "NOT DRAWN"}  streetcar ${t.streetcar}, short turn ${t.shortTurn}, replacement bus ${t.replacementBus}`);
}
console.log(`  Raw: ${kb(Buffer.byteLength(json))} | Gzipped: ${kb(gzipSync(Buffer.from(json)).length)}`);
console.log(`  Written to: ${outputPath}`);
if (bus) {
  console.log(`  Stops with pole numbers: ${busStopFeatures.length} of ${stopFeatures.length}`);
  console.log(`  Stops raw: ${kb(Buffer.byteLength(stopsJson))} | Gzipped: ${kb(gzipSync(Buffer.from(stopsJson)).length)}`);
  console.log(`  Stops written to: ${stopsOutputPath}`);
}

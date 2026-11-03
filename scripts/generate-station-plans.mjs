#!/usr/bin/env node

/**
 * TTC station floor plans for the Map View (plan 13, S7).
 *
 * Queries the TTC's public ArcGIS Online feature service
 * `StationFootprints_View` once (layer 1 StationPaths: footprint polygons per
 * level; layer 3 StationExits: entrances, elevators and other features) and
 * writes frontend/public/assets/linewatch/geographic/ttc-station-plans.json:
 * station areas (every level, with its floor number), entrances (bearing,
 * name, letter), elevators, stairs and escalators (one icon per shaft or
 * flight), and bus bays from TTC static GTFS station child stops ("Jane
 * Station at Bus Bay 2"; the plan service has none). Also writes
 * ttc-station-bays.json beside it: each station's bays and their stop
 * numbers, for the station panel's bay signs. Nothing is fetched from
 * the service at runtime.
 *
 * Source basis: owner decision 2026-11-03, recorded in
 * docs/source-licensing-launch-gates.md ("TTC station plans"). The service
 * publishes no licence; the TTC is credited. Raw service responses are not
 * kept in the repository.
 *
 * Usage:
 *   node scripts/generate-station-plans.mjs [--ttc-gtfs <zip>] [--from <dir>] [--output <json>]
 *
 * --ttc-gtfs defaults to /tmp/linewatch-gtfs/completegtfs.zip, as for
 * scripts/generate-surface-catalog.mjs; use the archive the surface assets
 * were generated from.
 *
 * --from reads layer1.geojson, layer3.geojson and item.json saved from an
 * earlier query (WGS84 GeoJSON) instead of querying the service. Output is
 * deterministic for a given service state.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { buildStationPlanFeatures } from "./lib/station-plans.mjs";

export const SERVICE_URL = "https://services2.arcgis.com/4bxnkNIQISOHuO8V/arcgis/rest/services/StationFootprints_View/FeatureServer";
export const ITEM_ID = "f2a1b2d052784774baa1aa77ab8d3974";
const ITEM_URL = `https://www.arcgis.com/sharing/rest/content/items/${ITEM_ID}?f=json`;
const AREA_LAYER = 1;
const POINT_LAYER = 3;
const PAGE = 1000;

const args = process.argv.slice(2);
const arg = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
};
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const fromDir = arg("--from", null);
const gtfsZip = resolve(arg("--ttc-gtfs", "/tmp/linewatch-gtfs/completegtfs.zip"));
const outputPath = resolve(arg("--output", resolve(repoRoot, "frontend/public/assets/linewatch/geographic/ttc-station-plans.json")));
const catalogPath = resolve(repoRoot, "frontend/public/assets/linewatch/geographic/ttc-catalog.json");

async function getJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "LineWatchTO station-plan generator" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`${url}: ${JSON.stringify(body.error)}`);
  return body;
}

/** Every feature of one layer as WGS84 GeoJSON, a page at a time, in object-id order. */
async function queryLayer(layer) {
  const meta = await getJson(`${SERVICE_URL}/${layer}?f=json`);
  const idField = meta.objectIdField ?? meta.fields.find((field) => field.type === "esriFieldTypeOID")?.name;
  const { count } = await getJson(`${SERVICE_URL}/${layer}/query?where=1%3D1&returnCountOnly=true&f=json`);
  const features = [];
  for (let offset = 0; offset < count; offset += PAGE) {
    const params = new URLSearchParams({
      where: "1=1", outFields: "*", outSR: "4326", f: "geojson",
      orderByFields: idField, resultOffset: String(offset), resultRecordCount: String(PAGE),
    });
    const page = await getJson(`${SERVICE_URL}/${layer}/query?${params}`);
    features.push(...page.features);
  }
  if (features.length !== count) throw new Error(`Layer ${layer}: read ${features.length} of ${count} features`);
  return { name: meta.name, geometryType: meta.geometryType, count, features };
}

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

function readGtfsTable(name) {
  const text = execFileSync("unzip", ["-p", gtfsZip, name], { maxBuffer: 64 * 1024 * 1024, encoding: "utf8" });
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0].replace(/^\uFEFF/, "")).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, (cols[i] ?? "").trim()]));
  });
}

/** Station child stops with their parent station's stop code (the plan service's key). */
function readGtfsStationStops() {
  const stops = readGtfsTable("stops.txt");
  const parents = new Map(stops.filter((s) => s.location_type === "1").map((s) => [s.stop_id, s.stop_code]));
  return stops
    .filter((s) => (s.location_type === "" || s.location_type === "0") && parents.has(s.parent_station))
    .map((s) => ({ stopCode: s.stop_code, name: s.stop_name, lat: Number(s.stop_lat), lon: Number(s.stop_lon), parentStopCode: parents.get(s.parent_station) }));
}

let areaLayer, pointLayer, item;
if (fromDir) {
  const read = (name) => JSON.parse(readFileSync(resolve(fromDir, name), "utf8"));
  areaLayer = { features: read("layer1.geojson").features };
  pointLayer = { features: read("layer3.geojson").features };
  item = read("item.json");
} else {
  [areaLayer, pointLayer, item] = await Promise.all([queryLayer(AREA_LAYER), queryLayer(POINT_LAYER), getJson(ITEM_URL)]);
}

const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const stations = catalog.features
  .filter((feature) => feature.properties.featureType === "station")
  .map((feature) => ({ name: feature.properties.name, stationId: feature.properties.stationId }));

const gtfsStops = readGtfsStationStops();
const feedInfo = readGtfsTable("feed_info.txt")[0] ?? {};
const isoDate = (value) => (/^\d{8}$/.test(value ?? "") ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}` : null);

const { features, stats } = buildStationPlanFeatures({ areas: areaLayer.features, points: pointLayer.features, stations, gtfsStops });

const asset = {
  type: "FeatureCollection",
  schemaVersion: "1.0.0",
  network: "ttc",
  layer: "station-plans",
  source: {
    sourceName: "StationFootprints_View",
    publisher: "Toronto Transit Commission (TTC)",
    serviceUrl: SERVICE_URL,
    itemId: ITEM_ID,
    license: null,
    attribution: "Station plans: Toronto Transit Commission (TTC).",
    basis: "No licence published by the source; used on the project owner's decision (2026-11-03) with TTC attribution.",
    serviceModified: item.modified ? new Date(item.modified).toISOString().slice(0, 10) : null,
  },
  baySource: {
    sourceName: "Merged GTFS - TTC Routes and Schedules",
    publisher: "Toronto Transit Commission (TTC)",
    license: "Open Government Licence – Toronto",
    attribution: "Contains information licensed under the Open Government Licence – Toronto.",
    feedVersion: feedInfo.feed_version ?? null,
    feedStartDate: isoDate(feedInfo.feed_start_date),
    feedEndDate: isoDate(feedInfo.feed_end_date),
  },
  features,
};

const json = JSON.stringify(asset) + "\n";
writeFileSync(outputPath, json, "utf8");

// A small index of each station's bays, for the station panel's Surface
// Connections bay signs (it never needs the whole plan file).
const baysByStation = {};
for (const feature of features) {
  if (feature.properties.featureType !== "station-bay") continue;
  const { stationId, bay, stopCode } = feature.properties;
  (baysByStation[stationId] ??= []).push({ bay, stopCode });
}
const bayIndex = {
  schemaVersion: "1.0.0",
  network: "ttc",
  layer: "station-bays",
  source: asset.baySource,
  stations: Object.fromEntries(Object.keys(baysByStation).sort().map((id) => [id, baysByStation[id]])),
};
const bayIndexPath = outputPath.replace(/ttc-station-plans\.json$/, "ttc-station-bays.json");
const bayIndexJson = JSON.stringify(bayIndex) + "\n";
if (bayIndexPath !== outputPath) writeFileSync(bayIndexPath, bayIndexJson, "utf8");
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log(`[Station plans] ${SERVICE_URL} (modified ${asset.source.serviceModified})`);
console.log(`  Read: ${areaLayer.features.length} areas, ${pointLayer.features.length} points`);
console.log(`  Stations: ${stats.stations} | areas: ${stats.areas} (dropped ${stats.droppedAreas}) | floors ${stats.floors.join(", ")}`);
console.log(`  Entrances: ${stats.entrances} | elevators: ${stats.elevators} (from ${stats.elevatorPoints} points)`);
console.log(`  Stairs: ${stats.stairs} (from ${stats.stairPoints}) | escalators: ${stats.escalators} (from ${stats.escalatorPoints})`);
console.log(`  Bus bays: ${stats.bays} from GTFS ${feedInfo.feed_version} (${gtfsStops.length} station child stops)`);
console.log(`  Raw: ${kb(Buffer.byteLength(json))} | Gzipped: ${kb(gzipSync(Buffer.from(json)).length)}`);
console.log(`  Written to: ${outputPath}`);
console.log(`  Bay index: ${Object.keys(baysByStation).length} stations, ${kb(Buffer.byteLength(bayIndexJson))} raw, ${kb(gzipSync(Buffer.from(bayIndexJson)).length)} gzipped -> ${bayIndexPath}`);

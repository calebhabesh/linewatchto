#!/usr/bin/env node

/**
 * Offline Geographic Catalog Generator (Phase B)
 *
 * Slices authoritative GTFS shapes into adjacent rapid-transit and regional rail links,
 * simplifies geometry with Douglas-Peucker to meet weight targets (<500 KB), validates
 * topological consistency and coordinates, and writes deterministic GeoJSON assets.
 *
 * Usage:
 *   node scripts/generate-geographic-catalog.mjs [options]
 *
 * Options:
 *   --ttc-gtfs <path>       Path to TTC GTFS zip (default: /tmp/linewatch-gtfs/completegtfs.zip)
 *   --go-gtfs <path>        Path to GO GTFS zip (default: /tmp/linewatch-gtfs/GO-GTFS.zip)
 *   --up-gtfs <path>        Path to UP GTFS zip (default: /tmp/linewatch-gtfs/UP-GTFS.zip)
 *   --output-dir <path>     Directory for generated public assets (default: frontend/public/assets/linewatch/geographic)
 *   --manifest-base <path>  Baseline audited manifest (default: docs/geographic-map-coverage-manifest.json)
 *   --download              Download authoritative feeds if missing
 *   --timestamp <iso-date>  Deterministic generation timestamp (default: SOURCE_DATE_EPOCH or manifest audit date)
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import {
  sliceShapeBetweenStations,
  validateCoordinate,
  GGH_BOUNDS,
} from "./lib/geographic-geometry.mjs";

const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const index = args.indexOf(flag);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : defaultValue;
}
const shouldDownload = args.includes("--download");

const defaultGtfsDir = "/tmp/linewatch-gtfs";
const ttcZipPath = resolve(getArg("--ttc-gtfs", `${defaultGtfsDir}/completegtfs.zip`));
const goZipPath = resolve(getArg("--go-gtfs", `${defaultGtfsDir}/GO-GTFS.zip`));
const upZipPath = resolve(getArg("--up-gtfs", `${defaultGtfsDir}/UP-GTFS.zip`));
const outputDir = resolve(getArg("--output-dir", "frontend/public/assets/linewatch/geographic"));
const manifestBasePath = resolve(getArg("--manifest-base", "docs/geographic-map-coverage-manifest.json"));

if (shouldDownload || !existsSync(ttcZipPath) || !existsSync(goZipPath) || !existsSync(upZipPath)) {
  console.log("Downloading authoritative GTFS archives...");
  execFileSync("node", ["scripts/download-geographic-gtfs.mjs", defaultGtfsDir], {
    stdio: "inherit",
  });
}

if (!existsSync(manifestBasePath)) {
  throw new Error(`Baseline manifest not found at ${manifestBasePath}`);
}

const baselineManifest = JSON.parse(readFileSync(manifestBasePath, "utf8"));
const timestamp =
  getArg("--timestamp", process.env.SOURCE_DATE_EPOCH) ??
  baselineManifest.auditDate ??
  new Date().toISOString();

/**
 * Extracts shape points for a set of shape IDs from a GTFS archive.
 * @param {string} zipPath
 * @param {Set<string>} targetShapeIds
 * @returns {Record<string, [number, number][]>} shapeId -> sorted array of [lon, lat]
 */
function extractShapesFromZip(zipPath, targetShapeIds) {
  const rawCsv = execFileSync("unzip", ["-p", zipPath, "shapes.txt"], {
    maxBuffer: 100 * 1024 * 1024,
    encoding: "utf8",
  });

  const lines = rawCsv.split(/\r?\n/);
  if (lines.length === 0) {
    throw new Error(`Empty shapes.txt in ${zipPath}`);
  }

  const headerLine = lines[0].replace(/^\ufeff/, "");
  const headers = headerLine.split(",").map((h) => h.trim());
  const shapeIdIdx = headers.indexOf("shape_id");
  const latIdx = headers.indexOf("shape_pt_lat");
  const lonIdx = headers.indexOf("shape_pt_lon");
  const seqIdx = headers.indexOf("shape_pt_sequence");

  if (shapeIdIdx < 0 || latIdx < 0 || lonIdx < 0 || seqIdx < 0) {
    throw new Error(`Missing required shapes.txt headers in ${zipPath}: found ${headerLine}`);
  }

  const rawBuckets = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(",");
    const shapeId = cols[shapeIdIdx]?.trim();
    if (!targetShapeIds.has(shapeId)) continue;

    const lat = parseFloat(cols[latIdx]);
    const lon = parseFloat(cols[lonIdx]);
    const seq = parseInt(cols[seqIdx], 10);

    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(seq)) continue;

    let bucket = rawBuckets.get(shapeId);
    if (!bucket) {
      bucket = [];
      rawBuckets.set(shapeId, bucket);
    }
    bucket.push({ seq, lon, lat });
  }

  const result = {};
  for (const [shapeId, points] of rawBuckets.entries()) {
    points.sort((a, b) => a.seq - b.seq);
    result[shapeId] = points.map((p) => [p.lon, p.lat]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// 1. TTC Subway and LRT Line Definitions & Shape Extraction
// ---------------------------------------------------------------------------
console.log("Processing TTC rapid transit network...");

const TTC_TARGET_SHAPE_IDS = new Set([
  "1125043", // Line 1: Vaughan Metropolitan Centre <-> Finch
  "1125472", // Line 2: Kipling <-> Kennedy
  "1125745", // Line 4: Sheppard-Yonge <-> Don Mills
  "1125772", // Line 5: Mount Dennis <-> Kennedy
  "1125794", // Line 6: Humber College <-> Finch West
]);

const ttcShapes = extractShapesFromZip(ttcZipPath, TTC_TARGET_SHAPE_IDS);

const ttcStationsMeta = baselineManifest.networks.ttc.stations;
const ttcStationsMap = new Map(ttcStationsMeta.map((s) => [s.stationId, s]));

const TTC_ROUTE_CONFIGS = [
  {
    lineId: "line-1",
    shapeId: "1125043",
    stationIds: [
      "vaughan-metropolitan-centre", "highway-407", "pioneer-village",
      "york-university", "finch-west", "downsview-park", "sheppard-west",
      "wilson", "yorkdale", "lawrence-west", "glencairn", "cedarvale",
      "st-clair-west", "dupont", "spadina", "st-george", "museum",
      "queens-park", "st-patrick", "osgoode", "st-andrew", "union", "king",
      "queen", "tmu", "college", "wellesley", "bloor-yonge", "rosedale",
      "summerhill", "st-clair", "davisville", "eglinton", "lawrence",
      "york-mills", "sheppard-yonge", "north-york-centre", "finch",
    ],
  },
  {
    lineId: "line-2",
    shapeId: "1125472",
    stationIds: [
      "kipling", "islington", "royal-york", "old-mill", "jane", "runnymede",
      "high-park", "keele", "dundas-west", "lansdowne", "dufferin",
      "ossington", "christie", "bathurst", "spadina", "st-george", "bay",
      "bloor-yonge", "sherbourne", "castle-frank", "broadview", "chester",
      "pape", "donlands", "greenwoood", "coxwell", "woodbine", "main-street",
      "victoria-park", "warden", "kennedy",
    ],
  },
  {
    lineId: "line-4",
    shapeId: "1125745",
    stationIds: ["sheppard-yonge", "bayview", "bessarion", "leslie", "don-mills"],
  },
  {
    lineId: "line-5",
    shapeId: "1125772",
    stationIds: [
      "mount-dennis", "keelesdale", "caledonia", "fairbank", "oakwood",
      "cedarvale", "forest-hill", "chaplin", "avenue", "eglinton",
      "mount-pleasant", "leaside", "laird", "sunnybrook-park", "don-valley",
      "aga-khan-park-and-museum", "wynford", "sloane", "o_connor", "pharmacy",
      "hakimi-lebovic", "golden-mile", "birchmount", "ionview", "kennedy",
    ],
  },
  {
    lineId: "line-6",
    shapeId: "1125794",
    stationIds: [
      "humber-college", "westmore", "martin-grove", "albion", "stevenson",
      "mount-olive", "rowntree-mills", "pearldale", "duncanwoods",
      "milvan-rumike", "emery", "signet-arrow", "norfinch-oakdale",
      "jane-and-finch", "driftwood", "tobermory", "sentinel", "finch-west",
    ],
  },
];

const ttcFeatures = [];

// 1.1 TTC Station Features
for (const st of ttcStationsMeta) {
  validateCoordinate(st.coordinates);
  ttcFeatures.push({
    type: "Feature",
    id: st.id,
    geometry: {
      type: "Point",
      coordinates: [
        Number(st.coordinates[0].toFixed(6)),
        Number(st.coordinates[1].toFixed(6)),
      ],
    },
    properties: {
      featureType: "station",
      stationId: st.stationId,
      name: st.name,
      network: "ttc",
      lineIds: st.lineIds.slice().sort(),
      gtfsStopId: st.gtfsStopId,
    },
  });
}

// 1.2 TTC Link Features
let ttcLinkCount = 0;
for (const route of TTC_ROUTE_CONFIGS) {
  const shape = ttcShapes[route.shapeId];
  if (!shape) {
    throw new Error(`TTC shape ${route.shapeId} not found in feed`);
  }

  const stations = route.stationIds.map((id) => {
    const station = ttcStationsMap.get(id);
    if (!station) {
      throw new Error(`TTC station ${id} in route ${route.lineId} not found in manifest`);
    }
    return { id, coordinates: station.coordinates };
  });

  const slicedLinks = sliceShapeBetweenStations(shape, stations, {
    epsilonMeters: 2.0,
    maxHopMeters: 25000,
  });

  for (const link of slicedLinks) {
    const linkId = `link-${route.lineId}-${link.stationAId}-${link.stationBId}`;
    const segmentId = `${route.lineId}-${link.stationAId}-${link.stationBId}`;
    ttcFeatures.push({
      type: "Feature",
      id: linkId,
      geometry: {
        type: "LineString",
        coordinates: link.coordinates,
      },
      properties: {
        featureType: "link",
        segmentId,
        lineId: route.lineId,
        network: "ttc",
        stationAId: link.stationAId,
        stationBId: link.stationBId,
        direction: "forward",
        gtfsShapeId: route.shapeId,
      },
    });
    ttcLinkCount++;
  }
}

ttcFeatures.sort((a, b) => a.id.localeCompare(b.id));

const ttcCatalog = {
  type: "FeatureCollection",
  network: "ttc",
  features: ttcFeatures,
  coverage: {
    status: "complete",
    stationCount: ttcStationsMeta.length,
    linkCount: ttcLinkCount,
    missingStations: [],
    missingLinks: [],
  },
};

// ---------------------------------------------------------------------------
// 2. Regional Rail (GO Transit + UP Express) Definitions & Shape Extraction
// ---------------------------------------------------------------------------
console.log("Processing Regional rail network (GO + UP)...");

const GO_TARGET_SHAPE_IDS = new Set([
  "UNAD", // Barrie: Union <-> Allandale Waterfront
  "UNSF", // Kitchener: Union <-> Stratford
  "UNOS", // Lakeshore East: Union <-> Oshawa
  "UNAL", // Lakeshore West: Union <-> Aldershot
  "UNHA", // Lakeshore West: Aldershot <-> Hamilton
  "UNNI", // Lakeshore West: Aldershot <-> Niagara Falls
  "UNML", // Milton: Union <-> Milton
  "UNBM", // Richmond Hill: Union <-> Bloomington
  "UNLI", // Stouffville: Union <-> Old Elm (Lincolnville)
]);

const UP_TARGET_SHAPE_IDS = new Set([
  "UNPA", // UP Express: Union <-> Pearson Airport
]);

const goShapes = extractShapesFromZip(goZipPath, GO_TARGET_SHAPE_IDS);
const upShapes = extractShapesFromZip(upZipPath, UP_TARGET_SHAPE_IDS);

const regStationsMeta = baselineManifest.networks.regional.stations;
const regStationsMap = new Map(regStationsMeta.map((s) => [s.stationId, s]));

const REGIONAL_ROUTE_CONFIGS = [
  {
    lineId: "regional-br",
    routeCode: "BR",
    shapeId: "UNAD",
    source: "go",
    stationIds: [
      "union", "downsview-park", "rutherford", "maple", "king-city", "aurora",
      "newmarket", "east-gwillimbury", "bradford", "barrie-south", "allandale-waterfront",
    ],
  },
  {
    lineId: "regional-ki",
    routeCode: "KI",
    shapeId: "UNSF",
    source: "go",
    stationIds: [
      "union", "bloor", "mount-dennis", "weston", "etobicoke-north", "malton",
      "bramalea", "brampton-innovation-district", "mount-pleasant", "georgetown",
      "acton", "guelph-central", "kitchener", "stratford",
    ],
  },
  {
    lineId: "regional-le",
    routeCode: "LE",
    shapeId: "UNOS",
    source: "go",
    stationIds: [
      "union", "danforth", "scarborough", "eglinton", "guildwood", "rouge-hill",
      "pickering", "ajax", "whitby", "durham-college-oshawa",
    ],
  },
  {
    lineId: "regional-lw",
    routeCode: "LW",
    shapeId: "UNAL",
    source: "go",
    stationIds: [
      "union", "exhibition", "mimico", "long-branch", "port-credit", "clarkson",
      "oakville", "bronte", "appleby", "burlington", "aldershot",
    ],
  },
  {
    lineId: "regional-lw",
    routeCode: "LW",
    shapeId: "UNHA",
    source: "go",
    stationIds: ["aldershot", "hamilton"],
  },
  {
    lineId: "regional-lw",
    routeCode: "LW",
    shapeId: "UNNI",
    source: "go",
    stationIds: ["aldershot", "west-harbour", "confederation", "st-catharines", "niagara-falls"],
  },
  {
    lineId: "regional-mi",
    routeCode: "MI",
    shapeId: "UNML",
    source: "go",
    stationIds: [
      "union", "kipling", "dixie", "cooksville", "erindale", "streetsville",
      "meadowvale", "lisgar", "milton",
    ],
  },
  {
    lineId: "regional-rh",
    routeCode: "RH",
    shapeId: "UNBM",
    source: "go",
    stationIds: ["union", "oriole", "old-cummer", "langstaff", "richmond-hill", "gormley", "bloomington"],
  },
  {
    lineId: "regional-st",
    routeCode: "ST",
    shapeId: "UNLI",
    source: "go",
    stationIds: [
      "union", "kennedy", "agincourt", "milliken", "unionville", "centennial",
      "markham", "mount-joy", "stouffville", "old-elm",
    ],
  },
  {
    lineId: "regional-up",
    routeCode: "UP",
    shapeId: "UNPA",
    source: "up",
    stationIds: ["union", "bloor", "mount-dennis", "weston", "pearson-airport"],
  },
];

const regionalFeatures = [];

// 2.1 Regional Station Features
for (const st of regStationsMeta) {
  validateCoordinate(st.coordinates);
  regionalFeatures.push({
    type: "Feature",
    id: st.id,
    geometry: {
      type: "Point",
      coordinates: [
        Number(st.coordinates[0].toFixed(6)),
        Number(st.coordinates[1].toFixed(6)),
      ],
    },
    properties: {
      featureType: "station",
      stationId: st.stationId,
      name: st.name,
      network: "regional",
      lineIds: st.lineIds.slice().sort(),
      gtfsStopId: st.gtfsStopId,
    },
  });
}

// 2.2 Regional Link Features
let regionalLinkCount = 0;
for (const route of REGIONAL_ROUTE_CONFIGS) {
  const shape =
    route.source === "up" ? upShapes[route.shapeId] : goShapes[route.shapeId];
  if (!shape) {
    throw new Error(`Regional shape ${route.shapeId} (${route.source}) not found in feed`);
  }

  const stations = route.stationIds.map((id) => {
    const station = regStationsMap.get(id);
    if (!station) {
      throw new Error(`Regional station ${id} in corridor ${route.routeCode} not found in manifest`);
    }
    return { id, coordinates: station.coordinates };
  });

  const slicedLinks = sliceShapeBetweenStations(shape, stations, {
    epsilonMeters: 2.0,
    maxHopMeters: 30000,
  });

  for (const link of slicedLinks) {
    const linkId = `link-segment-${route.routeCode.toLowerCase()}-${link.stationAId}-${link.stationBId}`;
    const segmentId = `segment-${route.routeCode.toLowerCase()}-${link.stationAId}-${link.stationBId}`;
    regionalFeatures.push({
      type: "Feature",
      id: linkId,
      geometry: {
        type: "LineString",
        coordinates: link.coordinates,
      },
      properties: {
        featureType: "link",
        segmentId,
        lineId: route.lineId,
        routeCode: route.routeCode,
        network: "regional",
        stationAId: link.stationAId,
        stationBId: link.stationBId,
        direction: "forward",
        gtfsShapeId: route.shapeId,
      },
    });
    regionalLinkCount++;
  }
}

regionalFeatures.sort((a, b) => a.id.localeCompare(b.id));

const regionalCatalog = {
  type: "FeatureCollection",
  network: "regional",
  features: regionalFeatures,
  coverage: {
    status: "complete",
    stationCount: regStationsMeta.length,
    linkCount: regionalLinkCount,
    missingStations: [],
    missingLinks: [],
  },
};

// ---------------------------------------------------------------------------
// 3. Serialization, Checksums, and Weight Validation
// ---------------------------------------------------------------------------
await mkdir(outputDir, { recursive: true });

const ttcJson = JSON.stringify(ttcCatalog, null, 2) + "\n";
const regionalJson = JSON.stringify(regionalCatalog, null, 2) + "\n";

const ttcSha256 = createHash("sha256").update(ttcJson).digest("hex");
const regionalSha256 = createHash("sha256").update(regionalJson).digest("hex");

const ttcPath = resolve(outputDir, "ttc-catalog.json");
const regionalPath = resolve(outputDir, "regional-catalog.json");

writeFileSync(ttcPath, ttcJson, "utf8");
writeFileSync(regionalPath, regionalJson, "utf8");

const ttcRawBytes = Buffer.byteLength(ttcJson);
const ttcGzBytes = gzipSync(Buffer.from(ttcJson)).length;

const regRawBytes = Buffer.byteLength(regionalJson);
const regGzBytes = gzipSync(Buffer.from(regionalJson)).length;

console.log(`[TTC Catalog] Stations: ${ttcStationsMeta.length}, Links: ${ttcLinkCount}`);
console.log(`  Raw: ${(ttcRawBytes / 1024).toFixed(1)} KB | Gzipped: ${(ttcGzBytes / 1024).toFixed(1)} KB | SHA-256: ${ttcSha256}`);

console.log(`[Regional Catalog] Stations: ${regStationsMeta.length}, Links: ${regionalLinkCount}`);
console.log(`  Raw: ${(regRawBytes / 1024).toFixed(1)} KB | Gzipped: ${(regGzBytes / 1024).toFixed(1)} KB | SHA-256: ${regionalSha256}`);

if (ttcGzBytes > 500 * 1024 || regGzBytes > 500 * 1024) {
  throw new Error("Geometry weight exceeds 500 KB compressed budget!");
}

// ---------------------------------------------------------------------------
// 4. Public Manifest Generation
// ---------------------------------------------------------------------------
const combinedHash = createHash("sha256")
  .update(ttcSha256)
  .update(regionalSha256)
  .digest("hex");

const manifest = {
  schemaVersion: "1.0.0",
  contentVersion: combinedHash,
  generatedAt: timestamp,
  networks: {
    ttc: {
      assetUrl: "/assets/linewatch/geographic/ttc-catalog.json",
      contentHash: ttcSha256,
      feedVersion: baselineManifest.sources.ttc.feed_version,
      feedStartDate: baselineManifest.sources.ttc.feed_start_date,
      feedEndDate: baselineManifest.sources.ttc.feed_end_date,
      sourceName: baselineManifest.sources.ttc.name,
      publisher: baselineManifest.sources.ttc.publisher,
      license: baselineManifest.sources.ttc.license_name,
      attribution: baselineManifest.sources.ttc.required_attribution,
      stationCount: ttcStationsMeta.length,
      linkCount: ttcLinkCount,
      coverageStatus: "complete",
    },
    regional: {
      assetUrl: "/assets/linewatch/geographic/regional-catalog.json",
      contentHash: regionalSha256,
      sources: {
        go: {
          feedVersion: baselineManifest.sources.go.feed_version,
          feedStartDate: baselineManifest.sources.go.feed_start_date,
          feedEndDate: baselineManifest.sources.go.feed_end_date,
          sourceName: baselineManifest.sources.go.name,
          publisher: baselineManifest.sources.go.publisher,
          license: baselineManifest.sources.go.license_name,
          attribution: baselineManifest.sources.go.required_attribution,
        },
        up: {
          feedVersion: baselineManifest.sources.up.feed_version,
          feedStartDate: baselineManifest.sources.up.feed_start_date,
          feedEndDate: baselineManifest.sources.up.feed_end_date,
          sourceName: baselineManifest.sources.up.name,
          publisher: baselineManifest.sources.up.publisher,
          license: baselineManifest.sources.up.license_name,
          attribution: baselineManifest.sources.up.required_attribution,
        },
      },
      stationCount: regStationsMeta.length,
      linkCount: regionalLinkCount,
      coverageStatus: "complete",
    },
  },
};

const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
const manifestPath = resolve(outputDir, "manifest.json");
writeFileSync(manifestPath, manifestJson, "utf8");

console.log(`[Manifest] Schema: ${manifest.schemaVersion} | Content Version: ${manifest.contentVersion}`);
console.log(`  Written to: ${manifestPath}`);
console.log("Geographic catalog generation completed successfully.");

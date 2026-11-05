/**
 * Checks a generated set of schedule-derived Map View and search files
 * (plan 16) before it is published: the runtime schedule-assets service runs
 * it on every regeneration and keeps the last good set when it fails, and the
 * frontend tests run it over the committed bootstrap copies.
 *
 * A set is one network's files, by logical name:
 *   TTC: ttc-surface-{streetcar,bus,night}.json, ttc-surface-bus-stops.json,
 *        ttc-surface-night-stops.json, ttc-surface-{streetcar,bus,night}-route-stops.json,
 *        search-index-ttc.json
 *   GO:  go-surface-bus.json, go-surface-bus-stops.json, go-surface-bus-route-stops.json,
 *        search-index-go.json, and the backend's go-bus-stops.csv (text)
 *
 * Every check returns problems as strings; an empty list means publishable.
 */

import { decodeSearchIndexStops } from "./search-index.mjs";

export const SCHEDULE_ASSET_NETWORKS = {
  ttc: {
    catalogs: {
      "ttc-surface-streetcar.json": "streetcar",
      "ttc-surface-bus.json": "bus",
      "ttc-surface-night.json": "night",
    },
    stopFiles: {
      "ttc-surface-bus-stops.json": "bus-stops",
      "ttc-surface-night-stops.json": "night-stops",
    },
    routeStops: {
      "ttc-surface-streetcar-route-stops.json": ["ttc-surface-streetcar.json", "streetcar-route-stops"],
      "ttc-surface-bus-route-stops.json": ["ttc-surface-bus.json", "bus-route-stops"],
      "ttc-surface-night-route-stops.json": ["ttc-surface-night.json", "night-route-stops"],
    },
    searchIndex: "search-index-ttc.json",
    network: "ttc",
    indexNetwork: "ttc",
  },
  go: {
    catalogs: { "go-surface-bus.json": "go-bus" },
    stopFiles: { "go-surface-bus-stops.json": "go-bus-stops" },
    routeStops: { "go-surface-bus-route-stops.json": ["go-surface-bus.json", "go-bus-route-stops"] },
    searchIndex: "search-index-go.json",
    backendStops: "go-bus-stops.csv",
    network: "regional",
    indexNetwork: "regional",
  },
};

/** Every logical file name a network's set must contain. */
export function scheduleAssetNames(network) {
  const spec = SCHEDULE_ASSET_NETWORKS[network];
  if (!spec) throw new Error(`Unknown schedule asset network: ${network}`);
  return [
    ...Object.keys(spec.catalogs),
    ...Object.keys(spec.stopFiles),
    ...Object.keys(spec.routeStops),
    spec.searchIndex,
    ...(spec.backendStops ? [spec.backendStops] : []),
  ];
}

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isFiniteCoordinate = c => Array.isArray(c) && c.length === 2 && c.every(Number.isFinite)
  && c[0] > -81 && c[0] < -77 && c[1] > 42.5 && c[1] < 45.5;

/** The client's isSurfaceSearchIndexFile, plus column lengths. */
export function searchIndexShapeProblems(file, network) {
  const problems = [];
  if (!isObject(file)) return ["search index is not an object"];
  if (file.network !== network) problems.push(`search index network is ${file.network}, not ${network}`);
  if (typeof file.schemaVersion !== "string" || !file.schemaVersion.startsWith("1.")) problems.push("search index schemaVersion is not 1.x");
  if (!Array.isArray(file.sources) || file.sources.length === 0) problems.push("search index has no sources");
  if (!Array.isArray(file.colors)) problems.push("search index has no colors");
  if (!isObject(file.routes) || !Array.isArray(file.routes.route)) problems.push("search index has no routes");
  const stops = file.stops;
  if (!isObject(stops) || !Array.isArray(stops.name) || !Array.isArray(stops.lonDeltaE5)
    || !(Array.isArray(stops.code) || Array.isArray(stops.codeDelta))) {
    problems.push("search index has no stop columns");
    return problems;
  }
  const count = stops.name.length;
  for (const key of ["lonDeltaE5", "latDeltaE5", "routes", stops.code ? "code" : "codeDelta"]) {
    if (!Array.isArray(stops[key]) || stops[key].length !== count) problems.push(`search index stops.${key} has the wrong length`);
  }
  return problems;
}

function catalogProblems(name, catalog, network, layer) {
  const problems = [];
  if (!isObject(catalog)) return [`${name} is not an object`];
  if (catalog.type !== "FeatureCollection") problems.push(`${name} is not a FeatureCollection`);
  if (catalog.network !== network) problems.push(`${name} network is ${catalog.network}`);
  if (catalog.layer !== layer) problems.push(`${name} layer is ${catalog.layer}, not ${layer}`);
  if (typeof catalog.schemaVersion !== "string" || !catalog.schemaVersion.startsWith("1.")) problems.push(`${name} schemaVersion is not 1.x`);
  if (!isObject(catalog.source) || !catalog.source.feedVersion || !catalog.source.feedStartDate || !catalog.source.feedEndDate) {
    problems.push(`${name} has no feed version and period`);
  }
  if (!Array.isArray(catalog.features)) problems.push(`${name} has no features`);
  return problems;
}

/**
 * Problems with one network's set. `files` maps logical names to parsed JSON
 * (and, for GO, go-bus-stops.csv to its text).
 */
export function validateScheduleAssetSet(network, files) {
  const spec = SCHEDULE_ASSET_NETWORKS[network];
  if (!spec) return [`unknown network ${network}`];
  const missing = scheduleAssetNames(network).filter(name => files[name] === undefined);
  if (missing.length > 0) return missing.map(name => `${name} is missing`);
  const problems = [];

  const feeds = new Set();
  for (const [name, layer] of Object.entries(spec.catalogs)) {
    const catalog = files[name];
    problems.push(...catalogProblems(name, catalog, spec.network, layer));
    if (!Array.isArray(catalog?.features) || !Array.isArray(catalog?.routes)) {
      problems.push(`${name} has no routes`);
      continue;
    }
    feeds.add(catalog.source?.feedVersion);
    if (!catalog.routes.some(route => route.drawn)) problems.push(`${name} draws no route`);
    // Drawn flags match the drawn lines (the go-bus and surface tests).
    const drawn = new Set(catalog.features
      .filter(feature => feature.geometry?.type === "LineString")
      .flatMap(feature => feature.properties?.routes ?? []));
    for (const feature of catalog.features) {
      if (feature.geometry?.type === "LineString") {
        if (!(feature.properties?.routes?.length > 0)) problems.push(`${name} has a line with no routes`);
        if (!(feature.geometry.coordinates?.length >= 2) || !feature.geometry.coordinates.every(isFiniteCoordinate)) {
          problems.push(`${name} line ${feature.id} has bad coordinates`);
        }
      }
    }
    for (const route of catalog.routes) {
      if (route.drawn !== drawn.has(route.route)) problems.push(`${name} route ${route.route} drawn flag does not match its lines`);
    }
  }
  for (const [name, layer] of Object.entries(spec.stopFiles)) {
    const file = files[name];
    problems.push(...catalogProblems(name, file, spec.network, layer));
    feeds.add(file?.source?.feedVersion);
    for (const feature of file?.features ?? []) {
      if (!isFiniteCoordinate(feature.geometry?.coordinates)) problems.push(`${name} stop ${feature.properties?.stopCode} has a bad position`);
      if (!feature.properties?.stopCode || !feature.properties?.name) problems.push(`${name} has a stop without a number or name`);
    }
  }
  if (network === "go") {
    const stops = files["go-surface-bus-stops.json"]?.features ?? [];
    if (stops.length === 0) problems.push("go-surface-bus-stops.json has no stops");
    if (!stops.every(feature => /^\d{5}$/.test(feature.properties?.stopCode ?? ""))) {
      problems.push("go-surface-bus-stops.json has a stop number that is not five digits (rail station codes are not bus stops)");
    }
  }

  // Every drawn route has a stop list (the route panel, plan 14 U5).
  for (const [name, [catalogName, layer]] of Object.entries(spec.routeStops)) {
    const file = files[name];
    if (!isObject(file) || file.layer !== layer || file.network !== spec.network || !isObject(file.routes)) {
      problems.push(`${name} is not a ${layer} file`);
      continue;
    }
    feeds.add(file.source?.feedVersion);
    for (const route of files[catalogName]?.routes ?? []) {
      if (!route.drawn) continue;
      const sequences = file.routes[route.route];
      if (!Array.isArray(sequences) || !sequences.some(sequence => sequence.stops?.length > 0)) {
        problems.push(`${name}: drawn route ${route.route} has no stop list`);
      }
    }
  }

  // The search index has every route and stop the map draws (plan 14, U1).
  const index = files[spec.searchIndex];
  const shape = searchIndexShapeProblems(index, spec.indexNetwork);
  problems.push(...shape.map(problem => `${spec.searchIndex}: ${problem}`));
  if (shape.length === 0) {
    const indexed = new Map(decodeSearchIndexStops(index).map(stop => [stop.code, stop]));
    const indexedRoutes = new Set(index.routes.route);
    for (const name of Object.keys(spec.catalogs)) {
      const catalog = files[name];
      if (!index.sources.some(source => source.feedVersion === catalog.source?.feedVersion)) {
        problems.push(`${spec.searchIndex} was not built from ${name}'s feed`);
      }
      for (const route of catalog.routes ?? []) {
        if (!indexedRoutes.has(route.route)) problems.push(`${spec.searchIndex} lacks ${name} route ${route.route}`);
      }
    }
    const stopFeatures = [
      ...Object.keys(spec.stopFiles).flatMap(name => files[name].features ?? []),
      ...Object.keys(spec.catalogs).flatMap(name => (files[name].features ?? [])
        .filter(feature => feature.geometry?.type === "Point" && feature.properties?.stopCode)),
    ];
    let stopProblems = 0;
    for (const feature of stopFeatures) {
      const { stopCode, name, routes = [] } = feature.properties;
      const entry = indexed.get(stopCode);
      const [lon, lat] = feature.geometry.coordinates;
      const problem = !entry ? `lacks stop ${stopCode}`
        : entry.name !== name ? `names stop ${stopCode} differently`
        : !routes.every(route => entry.routes.includes(route)) ? `lacks a route at stop ${stopCode}`
        : Math.abs(entry.lon - lon) >= 1e-5 || Math.abs(entry.lat - lat) >= 1e-5 ? `places stop ${stopCode} elsewhere`
        : null;
      if (problem && stopProblems++ < 20) problems.push(`${spec.searchIndex} ${problem}`);
    }
    for (const name of Object.keys(spec.routeStops)) {
      for (const [route, sequences] of Object.entries(files[name].routes ?? {})) {
        if (!indexedRoutes.has(route)) problems.push(`${spec.searchIndex} lacks ${name} route ${route}`);
        for (const sequence of sequences) {
          for (const code of sequence.stops ?? []) {
            if (!indexed.has(code) && stopProblems++ < 20) problems.push(`${spec.searchIndex} lacks ${name} ${route} stop ${code}`);
          }
        }
      }
    }
    if (stopProblems > 20) problems.push(`${spec.searchIndex}: ${stopProblems - 20} more stop problems`);
  }

  if (feeds.size !== 1) problems.push(`the set mixes feeds: ${[...feeds].join(", ")}`);

  if (spec.backendStops) {
    const csv = files[spec.backendStops];
    const rows = typeof csv === "string" ? csv.split("\n").filter(Boolean) : [];
    if (rows[0] !== "stop_code,name,routes") problems.push(`${spec.backendStops} has the wrong header`);
    const codes = new Set(rows.slice(1).map(row => row.split(",")[0]));
    const mapped = (files["go-surface-bus-stops.json"]?.features ?? []).map(feature => feature.properties.stopCode);
    if (codes.size !== mapped.length || !mapped.every(code => codes.has(code))) {
      problems.push(`${spec.backendStops} does not list exactly the mapped GO stops`);
    }
  }
  return problems;
}

/** Counts the shrink guard compares between generations. */
export function scheduleAssetCounts(network, files) {
  const spec = SCHEDULE_ASSET_NETWORKS[network];
  const index = files[spec.searchIndex];
  return {
    routes: Object.keys(spec.catalogs).reduce((sum, name) => sum + (files[name]?.routes?.filter(route => route.drawn).length ?? 0), 0),
    lines: Object.keys(spec.catalogs).reduce((sum, name) => sum + (files[name]?.features?.filter(f => f.geometry?.type === "LineString").length ?? 0), 0),
    stops: index?.stops?.name?.length ?? 0,
  };
}

/**
 * A new generation may not lose more than half of the previous one's drawn
 * routes, lines or searchable stops: a feed that broke upstream should not
 * empty the map. Returns problems, empty when `previous` is missing.
 */
export function shrinkProblems(previous, next, minimumShare = 0.5) {
  if (!previous) return [];
  return Object.entries(previous)
    .filter(([key, count]) => count > 0 && (next[key] ?? 0) < count * minimumShare)
    .map(([key, count]) => `${key} fell from ${count} to ${next[key] ?? 0}`);
}

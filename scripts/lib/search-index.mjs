/**
 * Search index for surface routes and stops (plan 14, U1).
 *
 * Built only from the generated Map View catalogs, never from GTFS again, so
 * search can never disagree with the map. Columns, not objects, keep the file
 * small; the client builds its tokens once, when the file loads.
 *
 * Index shape (both networks):
 *   sources: [{ layer, feedVersion, feedStartDate, feedEndDate, servicePattern }]
 *   colors: palette of route colours, referenced by index
 *   routes: { route, name, kind, color, textColor, drawn (0/1), source } columns
 *   stops:  columns in stop-number order (numeric):
 *     code | codeDelta   stop numbers as strings, or, when every number is a
 *                        plain integer (TTC), as differences from the
 *                        previous stop's number (the first is the number)
 *     name               provider stop name, unchanged
 *     lonDeltaE5, latDeltaE5  position in 1e-5 degrees (about 1 m), each
 *                        the difference from the previous stop (first absolute)
 *     routes             route numbers, space-separated
 *   stations (TTC only): { stop number: LineWatch station id } for stops
 *     inside a subway station
 * Route kinds: streetcar, bus, express, night-streetcar, night-bus, go-bus.
 * A stop's kind follows from its routes. The deltas keep the TTC index near
 * 100 KB gzipped (stop numbers alone shrink from 21 KB to 2 KB).
 */

export const SEARCH_INDEX_SCHEMA_VERSION = "1.0.0";

const routeOrder = (a, b) => a.localeCompare(b, "en", { numeric: true });
const round5 = value => Number(value.toFixed(5));

function sourceOf(layer, catalog) {
  const { feedVersion, feedStartDate, feedEndDate, servicePattern } = catalog.source;
  return { layer, feedVersion, feedStartDate, feedEndDate, servicePattern };
}

function palette() {
  const colors = [];
  const at = new Map();
  return {
    colors,
    ref(color) {
      const key = color.toUpperCase();
      if (!at.has(key)) {
        at.set(key, colors.length);
        colors.push(key);
      }
      return at.get(key);
    },
  };
}

/** TTC express buses are the 900 series. */
export function ttcBusKind(route) {
  return /^9\d\d$/.test(route) ? "express" : "bus";
}

class IndexBuilder {
  constructor(network) {
    this.network = network;
    this.sources = [];
    this.palette = palette();
    this.routes = [];
    this.routeKeys = new Set();
    /** code -> { code, name, lon, lat, routes: Set, station } */
    this.stops = new Map();
  }

  addSource(layer, catalog) {
    this.sources.push(sourceOf(layer, catalog));
    return this.sources.length - 1;
  }

  addRoute(summary, kind, source) {
    // A route number names one route per network kind: 301 the night car, 501 the day car.
    const key = `${kind}|${summary.route}`;
    if (this.routeKeys.has(key)) throw new Error(`Route ${summary.route} (${kind}) is in two catalogs`);
    this.routeKeys.add(key);
    this.routes.push({
      route: summary.route,
      name: summary.name,
      kind,
      color: this.palette.ref(summary.color),
      textColor: this.palette.ref(summary.textColor),
      drawn: summary.drawn ? 1 : 0,
      source,
    });
  }

  addStop(feature, station = "") {
    const { stopCode, name, routes } = feature.properties;
    if (!stopCode) return;
    const [lon, lat] = feature.geometry.coordinates;
    const existing = this.stops.get(stopCode);
    if (existing) {
      // A stop on streetcar and bus routes is in both catalogs: one pole.
      for (const route of routes) existing.routes.add(route);
      existing.station ||= station;
      return;
    }
    this.stops.set(stopCode, { code: stopCode, name, lon: round5(lon), lat: round5(lat), routes: new Set(routes), station });
  }

  addStopRoute(code, route) {
    this.stops.get(code)?.routes.add(route);
  }

  build({ withStations }) {
    const routes = this.routes.slice().sort((a, b) => routeOrder(a.route, b.route) || a.kind.localeCompare(b.kind));
    const stops = [...this.stops.values()].sort((a, b) => routeOrder(a.code, b.code));
    const column = (rows, key) => rows.map(row => row[key]);
    const deltas = values => values.map((value, i) => (i === 0 ? value : value - values[i - 1]));
    const codes = column(stops, "code");
    const integerCodes = codes.every(code => /^(0|[1-9]\d*)$/.test(code));
    return {
      schemaVersion: SEARCH_INDEX_SCHEMA_VERSION,
      network: this.network,
      sources: this.sources,
      colors: this.palette.colors,
      routes: Object.fromEntries(["route", "name", "kind", "color", "textColor", "drawn", "source"].map(key => [key, column(routes, key)])),
      stops: {
        ...(integerCodes ? { codeDelta: deltas(codes.map(Number)) } : { code: codes }),
        name: column(stops, "name"),
        lonDeltaE5: deltas(stops.map(stop => Math.round(stop.lon * 1e5))),
        latDeltaE5: deltas(stops.map(stop => Math.round(stop.lat * 1e5))),
        routes: stops.map(stop => [...stop.routes].sort(routeOrder).join(" ")),
      },
      ...(withStations
        ? { stations: Object.fromEntries(stops.filter(stop => stop.station).map(stop => [stop.code, stop.station])) }
        : {}),
    };
  }
}

/**
 * The LineWatch station a stop is inside: its bus bay in the station plans,
 * else a stop name that starts with a station's name ("Union Station
 * Streetcar Platform", "Spadina Station Streetcar Platform").
 */
/** Rows back from the columns: the reader the client mirrors (and tests use). */
export function decodeSearchIndexStops(index) {
  const { stops } = index;
  const count = stops.name.length;
  const out = [];
  let code = 0, lon = 0, lat = 0;
  for (let i = 0; i < count; i++) {
    if (stops.codeDelta) code += stops.codeDelta[i];
    lon += stops.lonDeltaE5[i];
    lat += stops.latDeltaE5[i];
    const stopCode = stops.codeDelta ? String(code) : stops.code[i];
    out.push({
      code: stopCode,
      name: stops.name[i],
      lon: lon / 1e5,
      lat: lat / 1e5,
      routes: stops.routes[i] ? stops.routes[i].split(" ") : [],
      station: index.stations?.[stopCode] ?? "",
    });
  }
  return out;
}

export function stationResolver(stationBays, stationCatalog) {
  const byBay = new Map();
  for (const [stationId, bays] of Object.entries(stationBays?.stations ?? {})) {
    for (const bay of bays) byBay.set(bay.stopCode, stationId);
  }
  const byName = new Map();
  for (const feature of stationCatalog?.features ?? []) {
    if (feature.properties?.featureType !== "station") continue;
    byName.set(feature.properties.name.toLowerCase(), feature.properties.stationId);
  }
  return (stopCode, name) => {
    if (byBay.has(stopCode)) return byBay.get(stopCode);
    const match = /^(.+?) Station\b/i.exec(name);
    return (match && byName.get(match[1].toLowerCase())) || "";
  };
}

/**
 * @param {object} catalogs streetcar, bus, busStops, night, nightStops
 *   (night-only poles), nightRouteStops, stationBays, stationCatalog: the
 *   parsed TTC Map View assets.
 */
export function buildTtcSearchIndex({ streetcar, bus, busStops, night, nightStops, nightRouteStops, stationBays, stationCatalog }) {
  const index = new IndexBuilder("ttc");
  const stationOf = stationResolver(stationBays, stationCatalog);

  const streetcarSource = index.addSource("streetcar", streetcar);
  for (const route of streetcar.routes) index.addRoute(route, "streetcar", streetcarSource);
  const busSource = index.addSource("bus", bus);
  for (const route of bus.routes) index.addRoute(route, ttcBusKind(route.route), busSource);
  const nightSource = index.addSource("night", night);
  for (const route of night.routes) index.addRoute(route, `night-${route.kind}`, nightSource);

  const stopFeatures = [
    ...streetcar.features.filter(feature => feature.properties.featureType === "streetcar-stop"),
    ...busStops.features,
    // Poles only night routes use (the 300 on Bloor).
    ...nightStops.features,
  ];
  for (const feature of stopFeatures) {
    index.addStop(feature, stationOf(feature.properties.stopCode, feature.properties.name));
  }
  // Night routes at daytime poles: from their stop sequences.
  for (const [route, sequences] of Object.entries(nightRouteStops.routes)) {
    for (const sequence of sequences) for (const code of sequence.stops) index.addStopRoute(code, route);
  }
  return index.build({ withStations: true });
}

/** @param {object} catalogs goBus, goBusStops: the parsed GO/UP Map View assets. */
export function buildGoSearchIndex({ goBus, goBusStops }) {
  const index = new IndexBuilder("regional");
  const source = index.addSource("go-bus", goBus);
  for (const route of goBus.routes) index.addRoute(route, "go-bus", source);
  for (const feature of goBusStops.features) index.addStop(feature);
  return index.build({ withStations: false });
}

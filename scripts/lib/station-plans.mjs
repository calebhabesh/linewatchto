/**
 * Station floor plans for the Map View (plan 13, S7), built from the TTC's
 * public ArcGIS Online feature service `StationFootprints_View` (layers 1
 * StationPaths and 3 StationExits; the data behind livemap.ttc.ca).
 *
 * Pure functions, so the generator and its tests share them. Wayfinding only:
 * nothing here says whether an elevator or entrance is working.
 */

/** Service station names that differ from the catalog's. */
export const STATION_NAME_ALIASES = new Map([["Jane & Finch", "Jane And Finch"]]);

/** Elevator points closer than this inside one station draw as one icon (one shaft, several floors). */
export const ELEVATOR_MERGE_METRES = 4;

/**
 * Service icons drawn as one merged point per shaft or flight end: kind and,
 * for stairs and escalators, the direction the service gives from that
 * point's level (as livemap.ttc.ca shows it).
 */
const MERGED_POINT_KINDS = {
  elevator: ["elevator", null],
  stairs: ["stairs", null],
  stairs_up: ["stairs", "up"],
  stairs_down: ["stairs", "down"],
  escalator_up: ["escalator", "up"],
  escalator_down: ["escalator", "down"],
};

/**
 * A bus bay number from a TTC GTFS stop name ("Jane Station at Bus Bay 2",
 * "Pape Station at Temporary Bus Bay 3", "… Lower Bus Bay 6"), or null
 * ("Bay Station - Eastbound Platform" is not a bay).
 */
export function busBayNumber(name) {
  const match = /\bBay (\d+[A-Z]?)\b/.exec(name ?? "");
  return match ? match[1] : null;
}

/** Six decimals is about 0.1 m: platforms and walls stay where they are. */
const round = (value) => Math.round(value * 1e6) / 1e6;

/** Rounds a ring, drops repeated vertices, keeps it closed; null when fewer than 4 points remain. */
export function cleanRing(ring) {
  const out = [];
  for (const [x, y] of ring) {
    const point = [round(x), round(y)];
    const last = out[out.length - 1];
    if (last && last[0] === point[0] && last[1] === point[1]) continue;
    out.push(point);
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push([...out[0]]);
  return out.length >= 4 ? out : null;
}

function cleanPolygon(rings) {
  const cleaned = [];
  for (const [index, ring] of rings.entries()) {
    const clean = cleanRing(ring);
    if (!clean) {
      if (index === 0) return null; // no outer ring, no polygon
      continue;
    }
    cleaned.push(clean);
  }
  return cleaned;
}

/** A Polygon or MultiPolygon with rounded, de-duplicated rings, or null. */
export function cleanAreaGeometry(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Polygon") {
    const rings = cleanPolygon(geometry.coordinates);
    return rings ? { type: "Polygon", coordinates: rings } : null;
  }
  if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates.map(cleanPolygon).filter(Boolean);
    if (!polygons.length) return null;
    return polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };
  }
  return null;
}

const SCREEN_BEARINGS = {
  up: 0, upright: 45, right: 90, downright: 135, down: 180, downleft: 225, left: 270, upleft: 315,
};

/**
 * An entrance's arrow: `exit` points carry a compass bearing (clockwise from
 * north, pointing out of the station); lettered exits (`exit_left_A2`) carry
 * a placeholder bearing and name their direction instead, on a north-up map.
 * Returns null for anything that is not an entrance.
 */
export function entranceArrow(iconName, exitDirection) {
  if (iconName === "exit") {
    if (!Number.isFinite(exitDirection)) return null;
    return { bearing: ((Math.round(exitDirection) % 360) + 360) % 360, letter: null };
  }
  const match = /^exit_([a-z]+)_([A-Z][0-9]?)$/.exec(iconName ?? "");
  if (!match || !(match[1] in SCREEN_BEARINGS)) return null;
  return { bearing: SCREEN_BEARINGS[match[1]], letter: match[2] };
}

function metresBetween([ax, ay], [bx, by]) {
  const latitude = ((ay + by) / 2) * (Math.PI / 180);
  const dx = (bx - ax) * 111_320 * Math.cos(latitude);
  const dy = (by - ay) * 110_540;
  return Math.hypot(dx, dy);
}

/** Groups points within `metres` of a group's first point; each group becomes its mean position. */
export function mergeNearbyPoints(points, metres = ELEVATOR_MERGE_METRES) {
  const groups = [];
  for (const point of points) {
    const group = groups.find((candidate) => metresBetween(candidate[0], point) < metres);
    if (group) group.push(point);
    else groups.push([point]);
  }
  return groups.map((group) => [
    round(group.reduce((sum, [x]) => sum + x, 0) / group.length),
    round(group.reduce((sum, [, y]) => sum + y, 0) / group.length),
  ]);
}

/**
 * Builds the asset's features from the service's raw GeoJSON features, the
 * Map View station catalog ({ name, stationId } pairs) and TTC GTFS station
 * child stops ({ stopCode, name, lat, lon, parentStopCode }) for bus bays.
 *
 * The service keys everything by the parent station's GTFS stop_code; its
 * station-name points (`icon_name` "none") name each code, which is joined to
 * the catalog by name (the catalog's own GTFS ids are from an older feed).
 * Throws when a service station has no catalog match, so a new station is
 * never silently dropped.
 */
export function buildStationPlanFeatures({ areas, points, stations, gtfsStops = [] }) {
  const stationIdByName = new Map(stations.map(({ name, stationId }) => [name, stationId]));
  const stationIdByCode = new Map();
  const unmatched = [];
  for (const feature of points) {
    const p = feature.properties ?? {};
    if (p.icon_name !== "none" || !p.stop_name || p.stop_code == null) continue;
    const name = STATION_NAME_ALIASES.get(p.stop_name) ?? p.stop_name;
    const stationId = stationIdByName.get(name);
    if (stationId) stationIdByCode.set(String(p.stop_code), stationId);
    else unmatched.push(p.stop_name);
  }
  if (unmatched.length) throw new Error(`Service stations missing from the catalog: ${unmatched.join(", ")}`);
  const stationFor = (code) => {
    const stationId = stationIdByCode.get(String(code));
    if (!stationId) throw new Error(`No station name point for service stop_code ${code}`);
    return stationId;
  };

  const areaFeatures = [];
  let droppedAreas = 0;
  for (const feature of areas) {
    const p = feature.properties ?? {};
    const geometry = cleanAreaGeometry(feature.geometry);
    if (!geometry || !Number.isInteger(p.floor)) { droppedAreas += 1; continue; }
    areaFeatures.push({
      type: "Feature",
      geometry,
      properties: { featureType: "station-area", stationId: stationFor(p.stop_code), floor: p.floor, sortName: p.building_name ?? "" },
    });
  }
  // Deepest first, so upper levels draw over lower ones in source order.
  areaFeatures.sort((a, b) => a.properties.floor - b.properties.floor
    || a.properties.stationId.localeCompare(b.properties.stationId)
    || a.properties.sortName.localeCompare(b.properties.sortName));
  for (const feature of areaFeatures) delete feature.properties.sortName;

  const entranceFeatures = [];
  const mergedByKey = new Map();
  for (const feature of points) {
    const p = feature.properties ?? {};
    if (feature.geometry?.type !== "Point") continue;
    const coordinates = [round(feature.geometry.coordinates[0]), round(feature.geometry.coordinates[1])];
    const merged = MERGED_POINT_KINDS[p.icon_name];
    if (merged) {
      const key = `${merged[0]}\u0000${merged[1] ?? ""}\u0000${stationFor(p.stop_code)}`;
      if (!mergedByKey.has(key)) mergedByKey.set(key, []);
      mergedByKey.get(key).push(coordinates);
      continue;
    }
    const arrow = entranceArrow(p.icon_name, p.exit_direction);
    if (!arrow) continue;
    entranceFeatures.push({
      type: "Feature",
      geometry: { type: "Point", coordinates },
      properties: {
        featureType: "station-entrance",
        stationId: stationFor(p.stop_code),
        bearing: arrow.bearing,
        name: (p.description ?? "").trim(),
        ...(arrow.letter ? { letter: arrow.letter } : {}),
      },
    });
  }
  entranceFeatures.sort((a, b) => a.properties.stationId.localeCompare(b.properties.stationId)
    || a.properties.name.localeCompare(b.properties.name)
    || a.geometry.coordinates[0] - b.geometry.coordinates[0]);

  // Elevators, stairs and escalators: one icon per shaft or flight end (the
  // service has a point per floor; one direction's points within 4 m merge).
  const counts = { elevator: [0, 0], stairs: [0, 0], escalator: [0, 0] };
  const pointFeatures = [];
  for (const key of [...mergedByKey.keys()].sort()) {
    const [kind, direction, stationId] = key.split("\u0000");
    const raw = mergedByKey.get(key);
    raw.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = mergeNearbyPoints(raw);
    counts[kind][0] += raw.length;
    counts[kind][1] += merged.length;
    for (const coordinates of merged) {
      pointFeatures.push({ type: "Feature", geometry: { type: "Point", coordinates }, properties: { featureType: `station-${kind}`, stationId, ...(direction ? { direction } : {}) } });
    }
  }

  // Bus bays from TTC GTFS (the plan service has none): a station's child
  // stop named "… Bus Bay 2" is that bay, and its stop number opens departures.
  const bayFeatures = [];
  for (const stop of gtfsStops) {
    const stationId = stationIdByCode.get(stop.parentStopCode);
    const bay = busBayNumber(stop.name);
    if (!stationId || !bay || !stop.stopCode) continue;
    bayFeatures.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [round(stop.lon), round(stop.lat)] },
      properties: { featureType: "station-bay", stationId, stopCode: stop.stopCode, bay },
    });
  }
  bayFeatures.sort((a, b) => a.properties.stationId.localeCompare(b.properties.stationId)
    || a.properties.bay.localeCompare(b.properties.bay, "en", { numeric: true })
    || a.properties.stopCode.localeCompare(b.properties.stopCode));

  return {
    features: [...areaFeatures, ...entranceFeatures, ...pointFeatures, ...bayFeatures],
    stats: {
      stations: new Set(areaFeatures.map((f) => f.properties.stationId)).size,
      areas: areaFeatures.length,
      droppedAreas,
      floors: [...new Set(areaFeatures.map((f) => f.properties.floor))].sort((a, b) => a - b),
      entrances: entranceFeatures.length,
      elevatorPoints: counts.elevator[0],
      elevators: counts.elevator[1],
      stairPoints: counts.stairs[0],
      stairs: counts.stairs[1],
      escalatorPoints: counts.escalator[0],
      escalators: counts.escalator[1],
      bays: bayFeatures.length,
    },
  };
}

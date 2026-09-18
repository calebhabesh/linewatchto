/**
 * Geometric algorithms for geographic transit map preparation and validation.
 * Pure calculations with zero external dependencies.
 */

const EARTH_RADIUS_METERS = 6371000;

/**
 * Great-circle distance between two [longitude, latitude] coordinates in meters.
 * @param {[number, number]} p1
 * @param {[number, number]} p2
 * @returns {number} Distance in meters
 */
export function haversine(p1, p2) {
  const [lon1, lat1] = p1;
  const [lon2, lat2] = p2;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlam = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Approximate perpendicular distance in meters from a point to a line segment.
 * Uses local planar projection based on the midpoint latitude.
 * @param {[number, number]} pt
 * @param {[number, number]} lineStart
 * @param {[number, number]} lineEnd
 * @returns {number} Distance in meters
 */
export function perpendicularDistance(pt, lineStart, lineEnd) {
  const midLat = ((lineStart[1] + lineEnd[1]) / 2) * (Math.PI / 180);
  const kx = 111320 * Math.cos(midLat);
  const ky = 110540;

  const x0 = pt[0] * kx;
  const y0 = pt[1] * ky;
  const x1 = lineStart[0] * kx;
  const y1 = lineStart[1] * ky;
  const x2 = lineEnd[0] * kx;
  const y2 = lineEnd[1] * ky;

  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return Math.hypot(x0 - x1, y0 - y1);
  }

  return Math.abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / Math.hypot(dx, dy);
}

/**
 * Douglas-Peucker polyline simplification algorithm.
 * @param {[number, number][]} points Array of [longitude, latitude] coordinates
 * @param {number} epsilonMeters Distance tolerance in meters
 * @returns {[number, number][]} Simplified points array
 */
export function douglasPeucker(points, epsilonMeters) {
  if (points.length <= 2) {
    return points.slice();
  }

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilonMeters) {
    const rec1 = douglasPeucker(points.slice(0, index + 1), epsilonMeters);
    const rec2 = douglasPeucker(points.slice(index), epsilonMeters);
    return rec1.slice(0, -1).concat(rec2);
  }

  return [points[0], points[end]];
}

/**
 * Standard Greater Golden Horseshoe bounding box [minLon, minLat, maxLon, maxLat].
 */
export const GGH_BOUNDS = [-81.5, 42.5, -78.0, 45.0];

/**
 * Validates coordinate order, finiteness, and geographic bounds.
 * @param {[number, number]} coord [longitude, latitude]
 * @param {[number, number, number, number]} [bounds] Optional bounding box
 */
export function validateCoordinate(coord, bounds = GGH_BOUNDS) {
  if (!Array.isArray(coord) || coord.length !== 2) {
    throw new Error(`Invalid coordinate format: expected [lon, lat], got ${JSON.stringify(coord)}`);
  }
  const [lon, lat] = coord;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error(`Non-finite coordinate value: [${lon}, ${lat}]`);
  }
  const [minLon, minLat, maxLon, maxLat] = bounds;
  if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) {
    throw new Error(`Coordinate [${lon}, ${lat}] is out of bounds [${minLon}, ${minLat}, ${maxLon}, ${maxLat}]`);
  }
}

/**
 * Slices a continuous route shape polyline into links between sequential stations.
 * Snaps endpoints to station coordinates and simplifies intermediate curvature.
 *
 * @param {[number, number][]} rawShapeCoords Continuous GTFS shape points
 * @param {{ id: string, coordinates: [number, number] }[]} orderedStations Ordered stations along the route
 * @param {object} [options]
 * @param {number} [options.epsilonMeters=2.0] Simplification threshold in meters
 * @param {number} [options.maxHopMeters=30000] Maximum allowed distance between consecutive points
 * @returns {{ stationAId: string, stationBId: string, coordinates: [number, number][] }[]}
 */
export function sliceShapeBetweenStations(rawShapeCoords, orderedStations, options = {}) {
  const epsilonMeters = options.epsilonMeters ?? 2.0;
  const maxHopMeters = options.maxHopMeters ?? 30000;

  if (orderedStations.length < 2) {
    throw new Error("Route must have at least 2 stations to slice links.");
  }
  if (rawShapeCoords.length < 2) {
    throw new Error("Raw shape must contain at least 2 points.");
  }

  // Determine shape orientation relative to first and last station
  let shape = rawShapeCoords.slice();
  const firstStationCoord = orderedStations[0].coordinates;
  const lastStationCoord = orderedStations[orderedStations.length - 1].coordinates;

  const distStartToFirst = haversine(firstStationCoord, shape[0]);
  const distStartToLast = haversine(lastStationCoord, shape[0]);

  if (distStartToLast < distStartToFirst) {
    shape.reverse();
  }

  // Find nearest shape index for each station
  const stationIndices = [];
  let lastIndex = -1;

  for (let s = 0; s < orderedStations.length; s++) {
    const st = orderedStations[s];
    let bestIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < shape.length; i++) {
      const d = haversine(st.coordinates, shape[i]);
      if (d < minDistance) {
        minDistance = d;
        bestIdx = i;
      }
    }

    if (bestIdx < lastIndex) {
      throw new Error(
        `Station ordering inversion at station ${st.id}: projected index ${bestIdx} < previous ${lastIndex}`
      );
    }

    stationIndices.push(bestIdx);
    lastIndex = bestIdx;
  }

  // Slice adjacent links
  const links = [];
  for (let i = 0; i < orderedStations.length - 1; i++) {
    const stA = orderedStations[i];
    const stB = orderedStations[i + 1];
    const idxA = stationIndices[i];
    const idxB = stationIndices[i + 1];

    const segmentPoints = [
      stA.coordinates,
      ...shape.slice(idxA + 1, idxB),
      stB.coordinates,
    ];

    const simplified = douglasPeucker(segmentPoints, epsilonMeters);

    // Enforce exact endpoint snapping and 6-decimal rounding
    simplified[0] = [
      Number(stA.coordinates[0].toFixed(6)),
      Number(stA.coordinates[1].toFixed(6)),
    ];
    simplified[simplified.length - 1] = [
      Number(stB.coordinates[0].toFixed(6)),
      Number(stB.coordinates[1].toFixed(6)),
    ];

    const roundedCoordinates = simplified.map(([lon, lat]) => [
      Number(lon.toFixed(6)),
      Number(lat.toFixed(6)),
    ]);

    // Validation checks
    if (roundedCoordinates.length < 2) {
      throw new Error(`Link ${stA.id} -> ${stB.id} produced less than 2 coordinates.`);
    }

    for (let j = 0; j < roundedCoordinates.length; j++) {
      validateCoordinate(roundedCoordinates[j]);
      if (j > 0) {
        const hop = haversine(roundedCoordinates[j - 1], roundedCoordinates[j]);
        if (hop > maxHopMeters) {
          throw new Error(
            `Unexpected jump of ${Math.round(hop)}m between vertices ${j - 1} and ${j} in link ${stA.id} -> ${stB.id}`
          );
        }
      }
    }

    links.push({
      stationAId: stA.id,
      stationBId: stB.id,
      coordinates: roundedCoordinates,
    });
  }

  return links;
}

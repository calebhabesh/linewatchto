import type { MapPoint } from "../app/map-geometry";

/**
 * The shaded beacon both maps draw around a station alert's core: a circle of
 * `STATION_IMPACT_BEACON_SCALE` core radii, shrunk when a neighbouring station
 * dot is closer. Two dots close together (Spadina's platforms, GO/UP's paired
 * stops) each keep a smaller full circle: an alerted neighbour's beacon gets
 * half the space between them, and an unalerted neighbour's dot stays
 * uncovered. Like every alert overlay it never animates.
 */
export const STATION_IMPACT_BEACON_SCALE = 2.2;
/** Beacon outline width, in core radii, so both maps draw the same weight. */
export const STATION_IMPACT_BEACON_STROKE_RATIO = 0.06;
/** The idle ring sits this many core radii out on a regular station (TTC: 38 / 26). */
export const STATION_IMPACT_RING_SCALE = 38 / 26;
/** Smallest beacon, in core radii, so a crowded one still shows a band. */
const MIN_BEACON_SCALE = 1.2;

export type StationBeaconNeighbour = {
  id: string;
  center: MapPoint;
  /** The dot's visible radius, including its outline. */
  radius: number;
};

type StationBeaconSize = {
  /** Radius of the shaded beacon circle. */
  radius: number;
};

/**
 * `neighbours` are every station dot on the map. `alerted` names the dots
 * that draw their own beacon. `gap` is the clear space kept from a neighbour.
 */
export function stationImpactBeaconSize(
  center: MapPoint,
  coreRadius: number,
  neighbours: readonly StationBeaconNeighbour[],
  alerted: ReadonlySet<string>,
  gap: number,
): StationBeaconSize {
  let room = coreRadius * STATION_IMPACT_BEACON_SCALE;
  for (const neighbour of neighbours) {
    const between = Math.hypot(neighbour.center.x - center.x, neighbour.center.y - center.y);
    // The same dot, or another alert on it.
    if (between < 1e-6) continue;
    room = Math.min(room, alerted.has(neighbour.id)
      ? between / 2 - gap / 2
      : between - neighbour.radius - gap);
  }
  const radius = Math.max(coreRadius * MIN_BEACON_SCALE, room);
  return { radius };
}

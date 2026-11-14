import type { MapImpactKind } from "../app/linewatch-data";
import type { MapPoint } from "../app/map-geometry";

/**
 * The shaded beacon both maps draw around a station alert's core: a circle of
 * `STATION_IMPACT_BEACON_SCALE` core radii, shrunk when a neighbouring station
 * dot is closer. Two dots close together (Spadina's platforms, GO/UP's paired
 * stops) each keep a smaller full circle: an alerted neighbour's beacon gets
 * half the space between them, and an unalerted neighbour's dot stays
 * uncovered. The beacon itself is still; a current suspension or delay adds a
 * ping ring (`stationAlertPings`) that fades out just past it.
 */
export const STATION_IMPACT_BEACON_SCALE = 2.2;
/** Beacon outline width, in core radii, so both maps draw the same weight. */
export const STATION_IMPACT_BEACON_STROKE_RATIO = 0.06;
/** The idle ring sits this many core radii out on a regular station (TTC: 38 / 26). */
export const STATION_IMPACT_RING_SCALE = 38 / 26;
/** Ping ring width, in core radii, at the beacon's edge (it scales with the ring). */
export const STATION_ALERT_PING_STROKE_RATIO = 0.16;
/**
 * The ping fades out this many core radii past the beacon: 13 TTC units on a
 * regular dot, inside the 28-unit gap badges keep from the alert.
 */
export const STATION_ALERT_PING_OVERSHOOT = 0.5;
/** A pill hub has no beacon; its ping grows from its outline by this factor. */
export const STATION_ALERT_PING_PILL_SCALE = 1.18;

/**
 * Station alerts that ping: current suspensions, delays and speed zones.
 * A planned closure is scheduled work, not a live disruption, and stays still.
 */
export function stationAlertPings(kind: MapImpactKind): boolean {
  return kind !== "planned-closure";
}

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

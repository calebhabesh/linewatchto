import type { MapPoint } from "../../app/map-geometry.ts";
import type { MapStationPill } from "./station-alert-model.ts";

/** One end of a previewed commute, at one of its station's dots. */
export type MapCommuteEndpoint = {
  key: string;
  stationId: string;
  role: "origin" | "destination";
  center: MapPoint;
  /** The white endpoint dot drawn on the route. */
  dotRadius: number;
  /** The green flash drawn above the station. */
  flashRadius: number;
  /** A pill-shaped station (GO/UP's Union): both take its shape. */
  pill?: MapStationPill;
};

/** A commute route previewed on the map, as both maps draw it. */
export type MapCommutePreview = {
  /** The preview's id; the route keys on it. */
  id: string;
  /** Accessible name of the route. */
  label: string;
  /** The route's centre line, in overlay coordinates. */
  pathD: string;
  endpoints: MapCommuteEndpoint[];
};

/** TTC's endpoint dot (34) and green flash (38) around its 32-unit station dot. */
export const COMMUTE_ENDPOINT_DOT_RATIO = 34 / 32;
export const COMMUTE_ENDPOINT_FLASH_RATIO = 38 / 32;

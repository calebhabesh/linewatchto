/**
 * Station bus bays (plan 13, S7 review): each TTC station's bays and the stop
 * number for each, from TTC static GTFS station child stops ("Jane Station at
 * Bus Bay 2" is stop 14700). Written by `scripts/generate-station-plans.mjs`
 * beside the station plans; 1.7 KB gzipped. The station panel's Surface
 * Connections shows a bay sign per bay group and links it to that bay's stop
 * departures (S3).
 */

import { cachedLoader } from "./geographic-bus-catalog.ts";

export const STATION_BAYS_URL = "/assets/linewatch/geographic/ttc-station-bays.json";

export type StationBay = { bay: string; stopCode: string };

export type StationBayIndex = {
  schemaVersion: "1.0.0";
  network: "ttc";
  layer: "station-bays";
  stations: Record<string, StationBay[]>;
};

export function isStationBayIndex(value: unknown): value is StationBayIndex {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StationBayIndex>;
  return candidate.layer === "station-bays" && candidate.network === "ttc"
    && Boolean(candidate.stations) && typeof candidate.stations === "object";
}

const stationBaysLoader = cachedLoader<StationBayIndex>(STATION_BAYS_URL, isStationBayIndex, "station bays");
export const cachedStationBays = stationBaysLoader.cached;
export const loadStationBays = stationBaysLoader.load;

/**
 * The bay number in a surface arrival's bay/platform value ("Bay 2", "2",
 * "Bay 6A"), or null for anything else ("Streetcar Platform", "Platform 1",
 * "Bay 2, Platform 1", blank): only a plain bay gets a bay sign.
 */
export function bayNumberFromPlatform(bayPlatform: string | null | undefined): string | null {
  const value = (bayPlatform ?? "").trim();
  const match = /^(?:Bay\s+)?(\d+[A-Za-z]?)$/i.exec(value);
  return match ? match[1].toUpperCase() : null;
}

/**
 * The stop number of a station's bay, or null when the index does not list it
 * or lists more than one stop with that number (a "Lower" and an upper bay 6):
 * a bay link must never guess.
 */
export function stationBayStopCode(index: StationBayIndex | null, stationId: string, bay: string): string | null {
  const matches = index?.stations[stationId]?.filter((entry) => entry.bay.toUpperCase() === bay.toUpperCase()) ?? [];
  return matches.length === 1 ? matches[0].stopCode : null;
}

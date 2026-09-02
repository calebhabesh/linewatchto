import type { NetworkId } from "@/api/dashboard-schema";
import {
  getRegionalLinesForStation,
  REGIONAL_ROUTE_STATIONS,
  type RegionalRouteDefinition,
} from "./regional-station-catalog";

export type StationLineSummary = {
  id: string;
  number: string;
  name: string;
  color: string;
};

export const TTC_LINE_DEFINITIONS: Record<string, StationLineSummary> = {
  "line-1": { id: "line-1", number: "1", name: "Yonge-University", color: "#F8C300" },
  "line-2": { id: "line-2", number: "2", name: "Bloor-Danforth", color: "#00923F" },
  "line-4": { id: "line-4", number: "4", name: "Sheppard", color: "#A21A68" },
  "line-5": { id: "line-5", number: "5", name: "Eglinton Crosstown", color: "#EB8738" },
  "line-6": { id: "line-6", number: "6", name: "Finch West", color: "#969594" },
};

export const TTC_LINE_STATION_IDS: Record<string, string[]> = {
  "line-1": [
    "vaughan-metropolitan-centre",
    "highway-407",
    "pioneer-village",
    "york-university",
    "finch-west",
    "downsview-park",
    "sheppard-west",
    "wilson",
    "yorkdale",
    "lawrence-west",
    "glencairn",
    "cedarvale",
    "st-clair-west",
    "dupont",
    "spadina",
    "st-george",
    "museum",
    "queens-park",
    "st-patrick",
    "osgoode",
    "st-andrew",
    "union",
    "king",
    "queen",
    "tmu",
    "college",
    "wellesley",
    "bloor-yonge",
    "rosedale",
    "summerhill",
    "st-clair",
    "davisville",
    "eglinton",
    "lawrence",
    "york-mills",
    "sheppard-yonge",
    "north-york-centre",
    "finch",
  ],
  "line-2": [
    "kipling",
    "islington",
    "royal-york",
    "old-mill",
    "jane",
    "runnymede",
    "high-park",
    "keele",
    "dundas-west",
    "lansdowne",
    "dufferin",
    "ossington",
    "christie",
    "bathurst",
    "spadina",
    "st-george",
    "bay",
    "bloor-yonge",
    "sherbourne",
    "castle-frank",
    "broadview",
    "chester",
    "pape",
    "donlands",
    "greenwood",
    "coxwell",
    "woodbine",
    "main-street",
    "victoria-park",
    "warden",
    "kennedy",
  ],
  "line-4": ["sheppard-yonge", "bayview", "bessarion", "leslie", "don-mills"],
  "line-5": [
    "mount-dennis",
    "keelesdale",
    "caledonia",
    "fairbank",
    "oakwood",
    "cedarvale",
    "forest-hill",
    "chaplin",
    "avenue",
    "eglinton",
    "mount-pleasant",
    "leaside",
    "laird",
    "sunnybrook-park",
    "don-valley",
    "aga-khan-park-and-museum",
    "wynford",
    "sloane",
    "o_connor",
    "pharmacy",
    "hakimi-lebovic",
    "golden-mile",
    "birchmount",
    "ionview",
    "kennedy",
  ],
  "line-6": [
    "humber-college",
    "westmore",
    "martin-grove",
    "albion",
    "stevenson",
    "mount-olive",
    "rowntree-mills",
    "pearldale",
    "duncanwoods",
    "milvan-rumike",
    "emery",
    "signet-arrow",
    "norfinch-oakdale",
    "jane-and-finch",
    "driftwood",
    "tobermory",
    "sentinel",
    "finch-west",
  ],
};

export type LineFilterOption = {
  id: string;
  label: string;
  lineNumber?: string;
  lineId?: string;
};

export const TTC_LINE_FILTERS: LineFilterOption[] = [
  { id: "all", label: "All Lines" },
  { id: "line-1", label: "Line 1", lineNumber: "1", lineId: "line-1" },
  { id: "line-2", label: "Line 2", lineNumber: "2", lineId: "line-2" },
  { id: "line-4", label: "Line 4", lineNumber: "4", lineId: "line-4" },
  { id: "line-5", label: "Line 5", lineNumber: "5", lineId: "line-5" },
  { id: "line-6", label: "Line 6", lineNumber: "6", lineId: "line-6" },
];

export const REGIONAL_LINE_FILTERS: LineFilterOption[] = [
  { id: "all", label: "All Corridors" },
  { id: "BR", label: "BR", lineNumber: "BR", lineId: "regional-br" },
  { id: "KI", label: "KI", lineNumber: "KI", lineId: "regional-ki" },
  { id: "LE", label: "LE", lineNumber: "LE", lineId: "regional-le" },
  { id: "LW", label: "LW", lineNumber: "LW", lineId: "regional-lw" },
  { id: "MI", label: "MI", lineNumber: "MI", lineId: "regional-mi" },
  { id: "RH", label: "RH", lineNumber: "RH", lineId: "regional-rh" },
  { id: "ST", label: "ST", lineNumber: "ST", lineId: "regional-st" },
  { id: "UP", label: "UP", lineNumber: "UP", lineId: "regional-up" },
];

export function getTtcLinesForStation(stationId: string): StationLineSummary[] {
  const result: StationLineSummary[] = [];
  for (const [lineKey, stationIds] of Object.entries(TTC_LINE_STATION_IDS)) {
    if (stationIds.includes(stationId)) {
      const def = TTC_LINE_DEFINITIONS[lineKey];
      if (def) result.push(def);
    }
  }
  return result;
}

export function getLinesForStation(
  network: NetworkId,
  stationId: string,
): (StationLineSummary | RegionalRouteDefinition)[] {
  if (network === "regional") {
    return getRegionalLinesForStation(stationId);
  }
  return getTtcLinesForStation(stationId);
}

export function stationMatchesLineFilter(
  network: NetworkId,
  stationId: string,
  filterId: string,
): boolean {
  if (filterId === "all") return true;

  if (network === "regional") {
    const regionalStations = REGIONAL_ROUTE_STATIONS[filterId];
    return regionalStations ? regionalStations.includes(stationId) : false;
  }

  const ttcStations = TTC_LINE_STATION_IDS[filterId];
  return ttcStations ? ttcStations.includes(stationId) : false;
}

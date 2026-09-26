import type { StationLine } from "./station-data.ts";
import {
  isRegionalStationWheelchairAccessible,
  isRegionalStationParkingAvailable,
  isRegionalStationWashroomAvailable,
  isRegionalStationElevatorAccessible,
  isRegionalStationBicycleLockupAvailable,
  isRegionalStationPpudoAvailable,
} from "./regional-data.ts";

export const STATION_LINE_DEFINITIONS: Record<string, Omit<StationLine, "wheelchairAccessible" | "hasElevator">> = {
  "line-1": {
    id: "line-1",
    number: "1",
    name: "Yonge-University",
    color: "#F8C300",
    platformLabel: "Northbound / Southbound",
  },
  "line-2": {
    id: "line-2",
    number: "2",
    name: "Bloor-Danforth",
    color: "#00923F",
    platformLabel: "Eastbound / Westbound",
  },
  "line-4": {
    id: "line-4",
    number: "4",
    name: "Sheppard",
    color: "#A21A68",
    platformLabel: "Eastbound / Westbound",
  },
  "line-5": {
    id: "line-5",
    number: "5",
    name: "Eglinton Crosstown",
    color: "#EB8738",
    platformLabel: "Eastbound / Westbound",
  },
  "line-6": {
    id: "line-6",
    number: "6",
    name: "Finch West",
    color: "#969594",
    platformLabel: "Eastbound / Westbound",
  },
};

export const STATION_LINE_STATION_IDS: Record<string, string[]> = {
  "line-1": [
    "vaughan-metropolitan-centre", "highway-407", "pioneer-village",
    "york-university", "finch-west", "downsview-park", "sheppard-west",
    "wilson", "yorkdale", "lawrence-west", "glencairn", "cedarvale",
    "st-clair-west", "dupont", "spadina", "st-george", "museum",
    "queens-park", "st-patrick", "osgoode", "st-andrew", "union", "king",
    "queen", "tmu", "college", "wellesley", "bloor-yonge", "rosedale",
    "summerhill", "st-clair", "davisville", "eglinton", "lawrence",
    "york-mills", "sheppard-yonge", "north-york-centre", "finch",
  ],
  "line-2": [
    "kipling", "islington", "royal-york", "old-mill", "jane", "runnymede",
    "high-park", "keele", "dundas-west", "lansdowne", "dufferin",
    "ossington", "christie", "bathurst", "spadina", "st-george", "bay",
    "bloor-yonge", "sherbourne", "castle-frank", "broadview", "chester",
    "pape", "donlands", "greenwoood", "coxwell", "woodbine", "main-street",
    "victoria-park", "warden", "kennedy",
  ],
  "line-4": ["sheppard-yonge", "bayview", "bessarion", "leslie", "don-mills"],
  "line-5": [
    "mount-dennis", "keelesdale", "caledonia", "fairbank", "oakwood",
    "cedarvale", "forest-hill", "chaplin", "avenue", "eglinton",
    "mount-pleasant", "leaside", "laird", "sunnybrook-park", "don-valley",
    "aga-khan-park-and-museum", "wynford", "sloane", "o_connor", "pharmacy",
    "hakimi-lebovic", "golden-mile", "birchmount", "ionview", "kennedy",
  ],
  "line-6": [
    "humber-college", "westmore", "martin-grove", "albion", "stevenson",
    "mount-olive", "rowntree-mills", "pearldale", "duncanwoods",
    "milvan-rumike", "emery", "signet-arrow", "norfinch-oakdale",
    "jane-and-finch", "driftwood", "tobermory", "sentinel", "finch-west",
  ],
};

export const FALLBACK_NOT_WHEELCHAIR_ACCESSIBLE = new Set([
  "spadina:line-1",
  "museum:line-1",
  "college:line-1",
  "king:line-1",
  "islington:line-2",
  "old-mill:line-2",
]);

export const FALLBACK_WITHOUT_ELEVATOR = new Set([
  ...FALLBACK_NOT_WHEELCHAIR_ACCESSIBLE,
  "sunnybrook-park:line-5",
  "aga-khan-park-and-museum:line-5",
  "wynford:line-5",
  "sloane:line-5",
  "o_connor:line-5",
  "pharmacy:line-5",
  "hakimi-lebovic:line-5",
  "golden-mile:line-5",
  "birchmount:line-5",
  "ionview:line-5",
  "westmore:line-6",
  "martin-grove:line-6",
  "albion:line-6",
  "stevenson:line-6",
  "mount-olive:line-6",
  "rowntree-mills:line-6",
  "pearldale:line-6",
  "duncanwoods:line-6",
  "milvan-rumike:line-6",
  "emery:line-6",
  "signet-arrow:line-6",
  "norfinch-oakdale:line-6",
  "jane-and-finch:line-6",
  "driftwood:line-6",
  "tobermory:line-6",
  "sentinel:line-6",
]);

export const FALLBACK_WITH_WASHROOMS = new Set<string>([
  // Line 1
  "bloor-yonge",
  "eglinton",
  "finch",
  "finch-west",
  "highway-407",
  "sheppard-west",
  "sheppard-yonge",
  "vaughan-metropolitan-centre",
  "wilson",

  // Line 2
  "kennedy",
  "kipling",

  // Line 4
  "don-mills",

  // Line 5
  "cedarvale",
  "don-valley",
  "mount-dennis",

  // Line 6
  "humber-college",
]);

export const FALLBACK_WITH_PARKING = new Set<string>([
  // Line 1
  "finch",
  "finch-west",
  "highway-407",
  "pioneer-village",
  "sheppard-west",
  "wilson",
  "yorkdale",

  // Line 2
  "islington",
  "keele",
  "kipling",
  "warden",

  // Line 4
  "don-mills",
  "leslie",

  // Line 5
  "cedarvale",
  "mount-dennis",
]);

export const FALLBACK_WITH_BICYCLE_LOCKUP = new Set<string>([
  "avenue",
  "bathurst",
  "bayview",
  "bessarion",
  "broadview",
  "caledonia",
  "chaplin",
  "chester",
  "christie",
  "coxwell",
  "davisville",
  "don-mills",
  "don-valley",
  "donlands",
  "downsview-park",
  "dufferin",
  "dundas-west",
  "dupont",
  "fairbank",
  "finch",
  "finch-west",
  "forest-hill",
  "glencairn",
  "greenwoood",
  "high-park",
  "highway-407",
  "islington",
  "jane",
  "keele",
  "keelesdale",
  "kennedy",
  "king",
  "kipling",
  "laird",
  "lansdowne",
  "lawrence",
  "lawrence-west",
  "leaside",
  "leslie",
  "main-street",
  "mount-dennis",
  "mount-pleasant",
  "north-york-centre",
  "oakwood",
  "old-mill",
  "ossington",
  "pape",
  "pioneer-village",
  "queens-park",
  "rosedale",
  "royal-york",
  "runnymede",
  "sheppard-west",
  "sheppard-yonge",
  "sherbourne",
  "spadina",
  "st-andrew",
  "st-clair",
  "st-clair-west",
  "st-george",
  "summerhill",
  "union",
  "vaughan-metropolitan-centre",
  "victoria-park",
  "warden",
  "wellesley",
  "wilson",
  "woodbine",
  "york-mills",
  "york-university",
  "yorkdale",
]);

export const FALLBACK_WITH_BICYCLE_REPAIR = new Set<string>([
  "bathurst",
  "bayview",
  "bessarion",
  "broadview",
  "chester",
  "coxwell",
  "davisville",
  "don-mills",
  "downsview-park",
  "dufferin",
  "dundas-west",
  "dupont",
  "finch",
  "finch-west",
  "glencairn",
  "high-park",
  "highway-407",
  "islington",
  "jane",
  "keele",
  "kennedy",
  "kipling",
  "lawrence",
  "lawrence-west",
  "leslie",
  "main-street",
  "old-mill",
  "ossington",
  "pape",
  "pioneer-village",
  "queens-park",
  "rosedale",
  "royal-york",
  "runnymede",
  "sheppard-west",
  "sheppard-yonge",
  "sherbourne",
  "spadina",
  "st-clair",
  "st-clair-west",
  "st-george",
  "union",
  "vaughan-metropolitan-centre",
  "victoria-park",
  "wellesley",
  "wilson",
  "woodbine",
  "york-university",
]);

export const FALLBACK_WITH_BIKE_SHARE = new Set<string>([
  "bathurst",
  "bay",
  "bloor-yonge",
  "broadview",
  "castle-frank",
  "cedarvale",
  "chester",
  "christie",
  "college",
  "coxwell",
  "davisville",
  "donlands",
  "downsview-park",
  "dufferin",
  "dundas-west",
  "dupont",
  "finch",
  "finch-west",
  "glencairn",
  "greenwoood",
  "high-park",
  "islington",
  "jane",
  "keele",
  "king",
  "lansdowne",
  "lawrence",
  "main-street",
  "museum",
  "north-york-centre",
  "old-mill",
  "osgoode",
  "ossington",
  "pape",
  "pioneer-village",
  "queen",
  "queens-park",
  "rosedale",
  "royal-york",
  "runnymede",
  "sheppard-yonge",
  "sherbourne",
  "spadina",
  "st-andrew",
  "st-clair",
  "st-clair-west",
  "st-george",
  "st-patrick",
  "summerhill",
  "tmu",
  "union",
  "victoria-park",
  "warden",
  "wellesley",
  "woodbine",
  "york-university",
]);

export const FALLBACK_WITH_PPUDO = new Set<string>([
  "don-mills",
  "finch",
  "finch-west",
  "highway-407",
  "islington",
  "kennedy",
  "kipling",
  "leslie",
  "mount-dennis",
  "pioneer-village",
  "royal-york",
  "sheppard-west",
  "vaughan-metropolitan-centre",
  "victoria-park",
  "wilson",
  "york-mills",
]);

export function isStationWheelchairAccessible(stationId: string, lineIds: string[], networkId?: string): boolean {
  if (networkId === "regional" || lineIds.some((id) => id.startsWith("regional-"))) {
    return isRegionalStationWheelchairAccessible(stationId);
  }
  return lineIds.some((lineId) => !FALLBACK_NOT_WHEELCHAIR_ACCESSIBLE.has(`${stationId}:${lineId}`));
}

export function isStationElevatorAccessible(stationId: string, lineIds: string[], networkId?: string): boolean {
  if (networkId === "regional" || lineIds.some((id) => id.startsWith("regional-"))) {
    return isRegionalStationElevatorAccessible(stationId);
  }
  return lineIds.some((lineId) => !FALLBACK_WITHOUT_ELEVATOR.has(`${stationId}:${lineId}`));
}

export function isStationWashroomAvailable(stationId: string, networkId?: string): boolean {
  if (networkId === "regional") {
    return isRegionalStationWashroomAvailable(stationId);
  }
  return FALLBACK_WITH_WASHROOMS.has(stationId);
}

export function isStationParkingAvailable(stationId: string, networkId?: string): boolean {
  if (networkId === "regional") {
    return isRegionalStationParkingAvailable(stationId);
  }
  return FALLBACK_WITH_PARKING.has(stationId);
}

export function isStationBicycleLockupAvailable(stationId: string, networkId?: string): boolean {
  if (networkId === "regional") {
    return isRegionalStationBicycleLockupAvailable(stationId);
  }
  return FALLBACK_WITH_BICYCLE_LOCKUP.has(stationId);
}

export function isStationBicycleRepairAvailable(stationId: string, networkId?: string): boolean {
  if (networkId === "regional") {
    return false;
  }
  return FALLBACK_WITH_BICYCLE_REPAIR.has(stationId);
}

export function isStationBikeShareAvailable(stationId: string, networkId?: string): boolean {
  if (networkId === "regional") {
    return false;
  }
  return FALLBACK_WITH_BIKE_SHARE.has(stationId);
}

export function isStationPpudoAvailable(stationId: string, networkId?: string): boolean {
  if (networkId === "regional") {
    return isRegionalStationPpudoAvailable(stationId);
  }
  return FALLBACK_WITH_PPUDO.has(stationId);
}

export function isSubwayLine(line: { id: string; number?: string } | string): boolean {
  const id = typeof line === "string" ? line : line.id;
  const num = typeof line === "string" ? line : line.number;
  return (
    id === "line-1" ||
    id === "line-2" ||
    id === "line-4" ||
    num === "1" ||
    num === "2" ||
    num === "4"
  );
}

export function isLrtOnlyLine(line: { id: string; number?: string } | string): boolean {
  const id = typeof line === "string" ? line : line.id;
  const num = typeof line === "string" ? line : line.number;
  return id === "line-5" || id === "line-6" || num === "5" || num === "6";
}

export function isLrtOnlyStation(lines: readonly (StationLine | { id: string; number?: string } | string)[]): boolean {
  if (!lines || lines.length === 0) return false;
  return lines.every(isLrtOnlyLine);
}

export function isSubwayAndLrtStation(lines: readonly (StationLine | { id: string; number?: string } | string)[]): boolean {
  if (!lines || lines.length === 0) return false;
  return lines.some(isSubwayLine) && lines.some(isLrtOnlyLine);
}

export function isLrtOnlyStationId(stationId: string): boolean {
  const isSubway = Boolean(
    STATION_LINE_STATION_IDS["line-1"]?.includes(stationId) ||
    STATION_LINE_STATION_IDS["line-2"]?.includes(stationId) ||
    STATION_LINE_STATION_IDS["line-4"]?.includes(stationId)
  );
  if (isSubway) return false;
  return Boolean(
    STATION_LINE_STATION_IDS["line-5"]?.includes(stationId) ||
    STATION_LINE_STATION_IDS["line-6"]?.includes(stationId)
  );
}

export function isSubwayAndLrtStationId(stationId: string): boolean {
  const hasSubway = Boolean(
    STATION_LINE_STATION_IDS["line-1"]?.includes(stationId) ||
    STATION_LINE_STATION_IDS["line-2"]?.includes(stationId) ||
    STATION_LINE_STATION_IDS["line-4"]?.includes(stationId)
  );
  const hasLrt = Boolean(
    STATION_LINE_STATION_IDS["line-5"]?.includes(stationId) ||
    STATION_LINE_STATION_IDS["line-6"]?.includes(stationId)
  );
  return hasSubway && hasLrt;
}

/**
 * Configuration seam for Geographic Map (OpenFreeMap + LineWatchTO).
 *
 * Keeps provider endpoints, fallback styles, catalog paths, and bounds in
 * one place so hosting can change without touching transit rendering logic.
 */

export const OPENFREEMAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

export const GEOGRAPHIC_LOAD_TIMEOUT_MS = 12000;

export const TTC_CATALOG_URL = "/assets/linewatch/geographic/ttc-catalog.json";
export const REGIONAL_CATALOG_URL = "/assets/linewatch/geographic/regional-catalog.json";

// Bounding box for TTC subway/LRT network [[west, south], [east, north]]
export const TTC_GEOGRAPHIC_BOUNDS: [[number, number], [number, number]] = [
  [-79.63, 43.58],
  [-79.18, 43.83],
];

export const TTC_GEOGRAPHIC_CENTER: [number, number] = [-79.3832, 43.68];
export const TTC_GEOGRAPHIC_DEFAULT_ZOOM = 11.2;
export const GEOGRAPHIC_MIN_ZOOM = 7.0;
export const GEOGRAPHIC_MAX_ZOOM = 17.0;
export const STATION_FOCUS_ZOOM = 14.2;

export const TTC_LINE_COLORS: Record<string, string> = {
  "line-1": "#F8C300",
  "line-2": "#00923F",
  "line-4": "#A21A68",
  "line-5": "#EB8738",
  "line-6": "#969594",
};

// Regional rail (GO Transit 7 corridors + UP Express)
export const REGIONAL_GEOGRAPHIC_BOUNDS: [[number, number], [number, number]] = [
  [-81.05, 43.05],
  [-78.80, 44.45],
];

export const REGIONAL_GEOGRAPHIC_CENTER: [number, number] = [-79.60, 43.68];
export const REGIONAL_GEOGRAPHIC_DEFAULT_ZOOM = 9.0;

export const REGIONAL_LINE_COLORS: Record<string, string> = {
  "regional-br": "#155ba0",
  "regional-ki": "#138336",
  "regional-le": "#ee2722",
  "regional-lw": "#8b0a31",
  "regional-mi": "#f47216",
  "regional-rh": "#27adea",
  "regional-st": "#774111",
  "regional-up": "#4084cd",
};

export const ALL_LINE_COLORS: Record<string, string> = {
  ...TTC_LINE_COLORS,
  ...REGIONAL_LINE_COLORS,
};

export const IMPACT_COLORS = {
  suspension: "#ef4444",
  delayTtc: "#f59e0b",
  delayRegional: "#0ea5e9",
  reducedSpeedZone: "#d97706",
  plannedClosure: "#3b82f6",
} as const;

export const REGIONAL_MAJOR_STATIONS = new Set([
  "union",
  "allandale-waterfront",
  "niagara-falls",
  "durham-college-oshawa",
  "kitchener",
  "milton",
  "bloomington",
  "old-elm",
  "pearson-airport",
  "hamilton",
  "west-harbour",
  "kipling",
  "kennedy",
  "bloor",
  "weston",
  "mount-dennis",
  "stratford",
]);

export const GEOGRAPHIC_ATTRIBUTION =
  'TTC shapes <a href="https://open.toronto.ca/" target="_blank" rel="noopener noreferrer">© City of Toronto</a>';

export const REGIONAL_GEOGRAPHIC_ATTRIBUTION =
  'Regional shapes <a href="https://www.gotransit.com/" target="_blank" rel="noopener noreferrer">© Metrolinx</a>';

export function getCatalogUrl(network: "ttc" | "regional"): string {
  return network === "regional" ? REGIONAL_CATALOG_URL : TTC_CATALOG_URL;
}

export function getGeographicBounds(network: "ttc" | "regional"): [[number, number], [number, number]] {
  return network === "regional" ? REGIONAL_GEOGRAPHIC_BOUNDS : TTC_GEOGRAPHIC_BOUNDS;
}

export function getGeographicCenter(network: "ttc" | "regional"): [number, number] {
  return network === "regional" ? REGIONAL_GEOGRAPHIC_CENTER : TTC_GEOGRAPHIC_CENTER;
}

export function getGeographicDefaultZoom(network: "ttc" | "regional"): number {
  return network === "regional" ? REGIONAL_GEOGRAPHIC_DEFAULT_ZOOM : TTC_GEOGRAPHIC_DEFAULT_ZOOM;
}

export function getGeographicAttribution(network: "ttc" | "regional"): string {
  return network === "regional" ? REGIONAL_GEOGRAPHIC_ATTRIBUTION : GEOGRAPHIC_ATTRIBUTION;
}

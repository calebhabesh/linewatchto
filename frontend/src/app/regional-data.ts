import type { DashboardData } from "./DataContext";
import type { LineStatus, NetworkSegment, Station } from "./linewatch-data";
import type { StationListResponse } from "./station-data";

export type NetworkId = "ttc" | "regional";

export const DEFAULT_NETWORK_ID: NetworkId = "ttc";

export const REGIONAL_ROUTE_DEFINITIONS = [
  { id: "regional-br", number: "BR", name: "Barrie", color: "#155ba0" },
  { id: "regional-ki", number: "KI", name: "Kitchener", color: "#138336" },
  { id: "regional-le", number: "LE", name: "Lakeshore East", color: "#ee2722" },
  { id: "regional-lw", number: "LW", name: "Lakeshore West", color: "#8b0a31" },
  { id: "regional-mi", number: "MI", name: "Milton", color: "#f47216" },
  { id: "regional-rh", number: "RH", name: "Richmond Hill", color: "#27adea" },
  { id: "regional-st", number: "ST", name: "Stouffville", color: "#774111" },
  { id: "regional-up", number: "UP", name: "Union Pearson Express", color: "#4084cd" },
] as const;

type RegionalRouteCode = typeof REGIONAL_ROUTE_DEFINITIONS[number]["number"];

export const REGIONAL_ROUTE_STATIONS: Record<RegionalRouteCode, readonly string[]> = {
  BR: ["union", "downsview-park", "rutherford", "maple", "king-city", "aurora", "newmarket", "east-gwillimbury", "bradford", "barrie-south", "allandale-waterfront"],
  KI: ["union", "bloor", "weston", "mount-dennis", "etobicoke-north", "malton", "bramalea", "brampton-innovation-district", "mount-pleasant", "georgetown", "acton", "guelph-central", "kitchener", "stratford"],
  LE: ["union", "danforth", "scarborough", "eglinton", "guildwood", "rouge-hill", "pickering", "ajax", "whitby", "durham-college-oshawa"],
  LW: ["union", "exhibition", "mimico", "long-branch", "port-credit", "clarkson", "oakville", "bronte", "appleby", "burlington", "aldershot", "west-harbour", "hamilton", "confederation", "st-catharines", "niagara-falls"],
  MI: ["union", "kipling", "dixie", "cooksville", "erindale", "streetsville", "meadowvale", "lisgar", "milton"],
  RH: ["union", "oriole", "old-cummer", "langstaff", "richmond-hill", "gormley", "bloomington"],
  ST: ["union", "kennedy", "agincourt", "milliken", "unionville", "centennial", "markham", "mount-joy", "stouffville", "old-elm"],
  UP: ["union", "bloor", "weston", "mount-dennis", "pearson-airport"],
};

// Keep logical station selection separate from the route-specific SVG dots used
// for overlay attachment at the shared Kitchener/UP approach.
export const REGIONAL_JUNCTION_ANCHORS: Record<string, { KI: string; UP: string }> = {
  weston: { KI: "station-weston-ki", UP: "station-weston-up" },
  "mount-dennis": { KI: "station-mount-dennis-ki", UP: "station-mount-dennis-up" },
  bloor: { KI: "station-bloor-ki", UP: "station-bloor-up" },
};

const STATION_NAME_OVERRIDES: Record<string, string> = {
  "allandale-waterfront": "Allandale Waterfront",
  "brampton-innovation-district": "Brampton Innovation District",
  "durham-college-oshawa": "Durham College Oshawa",
  "east-gwillimbury": "East Gwillimbury",
  "guelph-central": "Guelph Central",
  "mount-dennis": "Mount Dennis",
  "mount-joy": "Mount Joy",
  "mount-pleasant": "Mount Pleasant",
  "niagara-falls": "Niagara Falls",
  "old-cummer": "Old Cummer",
  "old-elm": "Old Elm",
  "pearson-airport": "Pearson Airport",
  "port-credit": "Port Credit",
  "rouge-hill": "Rouge Hill",
  "st-catharines": "St. Catharines",
  "west-harbour": "West Harbour",
};

function stationName(id: string) {
  return STATION_NAME_OVERRIDES[id] ?? id.split("-").map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join(" ");
}

const routeIdsByStation = Object.entries(REGIONAL_ROUTE_STATIONS)
  .reduce<Record<string, string[]>>((result, [routeCode, stationIds]) => {
    for (const stationId of stationIds) {
      result[stationId] = [...(result[stationId] ?? []), `regional-${routeCode.toLowerCase()}`];
    }
    return result;
  }, {});

const allRegionalStationIds = [...new Set(Object.values(REGIONAL_ROUTE_STATIONS).flat())];

export const regionalStations: Station[] = allRegionalStationIds.map((id) => ({
  id,
  name: stationName(id),
  x: 0,
  y: 0,
  interchange: (routeIdsByStation[id]?.length ?? 0) > 1,
}));

export const regionalStationSummaries: StationListResponse = {
  generatedAt: "fixture",
  stations: regionalStations.map((station) => ({
    id: station.id,
    name: station.name,
    mapX: 0,
    mapY: 0,
    interchange: station.interchange ?? false,
    lineIds: routeIdsByStation[station.id] ?? [],
    hasActiveImpact: false,
    accessStatus: "normal",
    accessOutageCounts: { elevator: 0, escalator: 0 },
  })),
};

const regionalLineStatuses: LineStatus[] = REGIONAL_ROUTE_DEFINITIONS.map((route) => ({
  id: route.id,
  number: route.number,
  name: route.name,
  route: `${route.name} corridor`,
  color: route.color,
  status: "normal",
  statusLabel: "No current regional fixture impacts",
  summary: "Fixture-backed regional status for interface development.",
  updatedAgo: "Demo fixture",
}));

const regionalSegments: NetworkSegment[] = [
  {
    id: "segment-ki-weston-mount-dennis",
    lineId: "regional-ki",
    label: "Weston to Mount Dennis",
    stationAId: "weston",
    stationBId: "mount-dennis",
    stationAAnchorId: REGIONAL_JUNCTION_ANCHORS.weston.KI,
    stationBAnchorId: REGIONAL_JUNCTION_ANCHORS["mount-dennis"].KI,
    guidePathId: "segment-guide-ki-weston-mount-dennis",
    pathD: "",
    overlay: "clear",
  },
  {
    id: "segment-up-weston-pearson-airport",
    lineId: "regional-up",
    label: "Weston to Pearson Airport",
    stationAId: "weston",
    stationBId: "pearson-airport",
    stationAAnchorId: REGIONAL_JUNCTION_ANCHORS.weston.UP,
    stationBAnchorId: "station-pearson-airport",
    guidePathId: "segment-guide-up-weston-pearson-airport",
    pathD: "",
    overlay: "clear",
  },
  {
    id: "segment-le-pickering-ajax",
    lineId: "regional-le",
    label: "Pickering to Ajax",
    stationAId: "pickering",
    stationBId: "ajax",
    stationAAnchorId: "station-pickering",
    stationBAnchorId: "station-ajax",
    guidePathId: "segment-guide-le-pickering-ajax",
    pathD: "",
    overlay: "clear",
  },
];

export const regionalDashboardData: DashboardData = {
  networkId: "regional",
  dataSource: "fallback",
  networkSegments: regionalSegments,
  stations: regionalStations,
  lineStatuses: regionalLineStatuses,
  generatedAt: { time: "Fixture mode", date: "Local regional demo", live: false, lastPoll: "regional fixture mode" },
  activeAlerts: [],
  delays: [],
  reducedSpeedZones: [],
  plannedClosures: [],
  stationNodeImpacts: [],
  commuteImpacts: [],
  reliabilitySummaries: [],
  ttcPerformance: {
    status: "disabled",
    source: "Unavailable in regional fixture mode",
    sourceUrl: "",
    title: "Regional performance unavailable",
    updatedLabel: "Not available",
    stale: false,
    message: "Regional reliability aggregation is not implemented.",
    metrics: [],
  },
  ingestionHealth: [{ label: "Regional source", value: "Demo fixture — not live", state: "ok" }],
  mapAsset: {
    src: "/assets/linewatch/regional-rail-map.svg",
    viewBox: [-200, -200, 14871.575, 10032.7812],
    legendIcons: {},
  },
};

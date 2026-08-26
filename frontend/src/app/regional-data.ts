import type { DashboardData } from "./DataContext";
import type {
  ActiveAlert,
  DelayAlert,
  LineStatus,
  NetworkSegment,
  PlannedClosure,
  Station,
  StationNodeImpact,
} from "./linewatch-data";
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
  { id: "regional-up", number: "UP", name: "UP Express", color: "#4084cd" },
] as const;

export type RegionalRouteCode = typeof REGIONAL_ROUTE_DEFINITIONS[number]["number"];

export const REGIONAL_ROUTE_CARDINAL_DIRECTIONS: Record<RegionalRouteCode, string> = {
  BR: "Northbound / Southbound",
  KI: "Eastbound / Westbound",
  LE: "Eastbound / Westbound",
  LW: "Eastbound / Westbound",
  MI: "Eastbound / Westbound",
  RH: "Northbound / Southbound",
  ST: "Northbound / Southbound",
  UP: "Eastbound / Westbound",
};

export const REGIONAL_ROUTE_STATIONS: Record<RegionalRouteCode, readonly string[]> = {
  BR: ["union", "downsview-park", "rutherford", "maple", "king-city", "aurora", "newmarket", "east-gwillimbury", "bradford", "barrie-south", "allandale-waterfront"],
  KI: ["union", "bloor", "mount-dennis", "weston", "etobicoke-north", "malton", "bramalea", "brampton-innovation-district", "mount-pleasant", "georgetown", "acton", "guelph-central", "kitchener", "stratford"],
  LE: ["union", "danforth", "scarborough", "eglinton", "guildwood", "rouge-hill", "pickering", "ajax", "whitby", "durham-college-oshawa"],
  LW: ["union", "exhibition", "mimico", "long-branch", "port-credit", "clarkson", "oakville", "bronte", "appleby", "burlington", "aldershot", "west-harbour", "hamilton", "confederation", "st-catharines", "niagara-falls"],
  MI: ["union", "kipling", "dixie", "cooksville", "erindale", "streetsville", "meadowvale", "lisgar", "milton"],
  RH: ["union", "oriole", "old-cummer", "langstaff", "richmond-hill", "gormley", "bloomington"],
  ST: ["union", "kennedy", "agincourt", "milliken", "unionville", "centennial", "markham", "mount-joy", "stouffville", "old-elm"],
  UP: ["union", "bloor", "mount-dennis", "weston", "pearson-airport"],
};

function adjacentRegionalLinks(stationIds: readonly string[]) {
  return stationIds.slice(0, -1).map(
    (stationAId, index) => [stationAId, stationIds[index + 1]] as const,
  );
}

// Lakeshore West branches after Aldershot: Hamilton is one terminal branch,
// while West Harbour continues toward Confederation and Niagara Falls.
export const REGIONAL_ROUTE_LINKS: Record<RegionalRouteCode, readonly (readonly [string, string])[]> = {
  BR: adjacentRegionalLinks(REGIONAL_ROUTE_STATIONS.BR),
  KI: adjacentRegionalLinks(REGIONAL_ROUTE_STATIONS.KI),
  LE: adjacentRegionalLinks(REGIONAL_ROUTE_STATIONS.LE),
  LW: [
    ...adjacentRegionalLinks(REGIONAL_ROUTE_STATIONS.LW.slice(0, 11)),
    ["aldershot", "west-harbour"],
    ["aldershot", "hamilton"],
    ["west-harbour", "confederation"],
    ["confederation", "st-catharines"],
    ["st-catharines", "niagara-falls"],
  ],
  MI: adjacentRegionalLinks(REGIONAL_ROUTE_STATIONS.MI),
  RH: adjacentRegionalLinks(REGIONAL_ROUTE_STATIONS.RH),
  ST: adjacentRegionalLinks(REGIONAL_ROUTE_STATIONS.ST),
  UP: adjacentRegionalLinks(REGIONAL_ROUTE_STATIONS.UP),
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

export function stationName(id: string) {
  return STATION_NAME_OVERRIDES[id] ?? id.split("-").map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join(" ");
}

export const regionalRouteIdsByStation = Object.entries(REGIONAL_ROUTE_STATIONS)
  .reduce<Record<string, string[]>>((result, [routeCode, stationIds]) => {
    for (const stationId of stationIds) {
      result[stationId] = [...(result[stationId] ?? []), `regional-${routeCode.toLowerCase()}`];
    }
    return result;
  }, {});

const allRegionalStationIds = [...new Set(Object.values(REGIONAL_ROUTE_STATIONS).flat())];

export const REGIONAL_NOT_WHEELCHAIR_ACCESSIBLE = new Set([
  "long-branch",
  "mimico",
  "oriole",
]);

export const REGIONAL_WITH_ELEVATOR = new Set([
  "ajax",
  "aldershot",
  "appleby",
  "bloomington",
  "bloor",
  "bramalea",
  "brampton-innovation-district",
  "bronte",
  "burlington",
  "clarkson",
  "confederation",
  "cooksville",
  "danforth",
  "downsview-park",
  "durham-college-oshawa",
  "eglinton",
  "erindale",
  "exhibition",
  "guildwood",
  "hamilton",
  "kennedy",
  "kipling",
  "malton",
  "meadowvale",
  "mount-dennis",
  "mount-pleasant",
  "oakville",
  "pearson-airport",
  "pickering",
  "port-credit",
  "rouge-hill",
  "scarborough",
  "streetsville",
  "union",
  "west-harbour",
  "weston",
  "whitby",
]);

export const REGIONAL_WITH_WASHROOMS = new Set([
  "agincourt",
  "ajax",
  "aldershot",
  "appleby",
  "aurora",
  "barrie-south",
  "bloomington",
  "bloor",
  "bramalea",
  "brampton-innovation-district",
  "bronte",
  "burlington",
  "clarkson",
  "cooksville",
  "danforth",
  "dixie",
  "durham-college-oshawa",
  "east-gwillimbury",
  "eglinton",
  "erindale",
  "etobicoke-north",
  "georgetown",
  "guildwood",
  "hamilton",
  "kennedy",
  "king-city",
  "kipling",
  "kitchener",
  "langstaff",
  "lisgar",
  "long-branch",
  "malton",
  "maple",
  "markham",
  "meadowvale",
  "milliken",
  "milton",
  "mimico",
  "mount-dennis",
  "mount-joy",
  "mount-pleasant",
  "niagara-falls",
  "oakville",
  "old-cummer",
  "pearson-airport",
  "pickering",
  "port-credit",
  "richmond-hill",
  "rouge-hill",
  "rutherford",
  "scarborough",
  "streetsville",
  "union",
  "unionville",
  "west-harbour",
  "weston",
  "whitby",
]);

export const REGIONAL_WITH_PARKING = new Set([
  "acton",
  "agincourt",
  "ajax",
  "aldershot",
  "allandale-waterfront",
  "appleby",
  "aurora",
  "barrie-south",
  "bloomington",
  "bradford",
  "bramalea",
  "brampton-innovation-district",
  "bronte",
  "burlington",
  "centennial",
  "clarkson",
  "confederation",
  "cooksville",
  "dixie",
  "durham-college-oshawa",
  "east-gwillimbury",
  "eglinton",
  "erindale",
  "etobicoke-north",
  "georgetown",
  "gormley",
  "guelph-central",
  "guildwood",
  "king-city",
  "langstaff",
  "lisgar",
  "long-branch",
  "malton",
  "maple",
  "markham",
  "meadowvale",
  "milliken",
  "milton",
  "mimico",
  "mount-joy",
  "mount-pleasant",
  "newmarket",
  "oakville",
  "old-cummer",
  "old-elm",
  "pearson-airport",
  "pickering",
  "port-credit",
  "richmond-hill",
  "rouge-hill",
  "rutherford",
  "scarborough",
  "stouffville",
  "streetsville",
  "unionville",
  "west-harbour",
  "weston",
  "whitby",
]);

export const REGIONAL_WITH_BICYCLE_LOCKUP = new Set([
  "acton",
  "agincourt",
  "ajax",
  "aldershot",
  "allandale-waterfront",
  "appleby",
  "aurora",
  "barrie-south",
  "bloomington",
  "bloor",
  "bradford",
  "bramalea",
  "brampton-innovation-district",
  "bronte",
  "burlington",
  "centennial",
  "clarkson",
  "confederation",
  "cooksville",
  "danforth",
  "dixie",
  "downsview-park",
  "durham-college-oshawa",
  "east-gwillimbury",
  "eglinton",
  "erindale",
  "etobicoke-north",
  "exhibition",
  "georgetown",
  "gormley",
  "guelph-central",
  "guildwood",
  "hamilton",
  "kennedy",
  "king-city",
  "kitchener",
  "langstaff",
  "lisgar",
  "long-branch",
  "malton",
  "maple",
  "markham",
  "meadowvale",
  "milliken",
  "milton",
  "mimico",
  "mount-dennis",
  "mount-joy",
  "mount-pleasant",
  "newmarket",
  "niagara-falls",
  "oakville",
  "old-cummer",
  "old-elm",
  "oriole",
  "pickering",
  "port-credit",
  "richmond-hill",
  "rouge-hill",
  "rutherford",
  "scarborough",
  "st-catharines",
  "stouffville",
  "streetsville",
  "union",
  "unionville",
  "west-harbour",
  "weston",
  "whitby",
]);

export const REGIONAL_WITH_PPUDO = new Set([
  "ajax",
  "aldershot",
  "allandale-waterfront",
  "appleby",
  "aurora",
  "barrie-south",
  "bloomington",
  "bloor",
  "bradford",
  "bramalea",
  "brampton-innovation-district",
  "bronte",
  "burlington",
  "centennial",
  "clarkson",
  "confederation",
  "cooksville",
  "dixie",
  "downsview-park",
  "durham-college-oshawa",
  "east-gwillimbury",
  "eglinton",
  "erindale",
  "etobicoke-north",
  "georgetown",
  "gormley",
  "guelph-central",
  "guildwood",
  "king-city",
  "langstaff",
  "lisgar",
  "long-branch",
  "malton",
  "maple",
  "markham",
  "meadowvale",
  "milliken",
  "milton",
  "mimico",
  "mount-dennis",
  "mount-joy",
  "mount-pleasant",
  "niagara-falls",
  "oakville",
  "old-cummer",
  "old-elm",
  "pearson-airport",
  "pickering",
  "port-credit",
  "richmond-hill",
  "rouge-hill",
  "rutherford",
  "scarborough",
  "stouffville",
  "streetsville",
  "union",
  "unionville",
  "west-harbour",
  "weston",
  "whitby",
]);

export const REGIONAL_WITH_WIFI = new Set([
  "acton",
  "agincourt",
  "ajax",
  "aldershot",
  "allandale-waterfront",
  "appleby",
  "aurora",
  "barrie-south",
  "bloor",
  "bradford",
  "bramalea",
  "brampton-innovation-district",
  "bronte",
  "clarkson",
  "cooksville",
  "danforth",
  "dixie",
  "downsview-park",
  "east-gwillimbury",
  "eglinton",
  "erindale",
  "etobicoke-north",
  "exhibition",
  "georgetown",
  "gormley",
  "guelph-central",
  "guildwood",
  "hamilton",
  "kennedy",
  "king-city",
  "kipling",
  "langstaff",
  "lisgar",
  "long-branch",
  "malton",
  "maple",
  "meadowvale",
  "milliken",
  "milton",
  "mimico",
  "mount-dennis",
  "mount-joy",
  "mount-pleasant",
  "newmarket",
  "oakville",
  "old-cummer",
  "pearson-airport",
  "pickering",
  "port-credit",
  "richmond-hill",
  "rouge-hill",
  "rutherford",
  "scarborough",
  "streetsville",
  "union",
  "unionville",
  "west-harbour",
  "weston",
  "whitby",
]);

export function isRegionalStationWheelchairAccessible(stationId: string): boolean {
  return !REGIONAL_NOT_WHEELCHAIR_ACCESSIBLE.has(stationId);
}

export function isRegionalStationElevatorAccessible(stationId: string): boolean {
  return REGIONAL_WITH_ELEVATOR.has(stationId);
}

export function isRegionalStationParkingAvailable(stationId: string): boolean {
  return REGIONAL_WITH_PARKING.has(stationId);
}

export function isRegionalStationWashroomAvailable(stationId: string): boolean {
  return REGIONAL_WITH_WASHROOMS.has(stationId);
}

export function isRegionalStationBicycleLockupAvailable(stationId: string): boolean {
  return REGIONAL_WITH_BICYCLE_LOCKUP.has(stationId);
}

export function isRegionalStationPpudoAvailable(stationId: string): boolean {
  return REGIONAL_WITH_PPUDO.has(stationId);
}

export function isRegionalStationWifiAvailable(stationId: string): boolean {
  return REGIONAL_WITH_WIFI.has(stationId);
}

export const regionalStations: Station[] = allRegionalStationIds.map((id) => ({
  id,
  name: stationName(id),
  x: 0,
  y: 0,
  interchange: (regionalRouteIdsByStation[id]?.length ?? 0) > 1,
}));

export const regionalStationSummaries: StationListResponse = {
  generatedAt: "fixture",
  stations: regionalStations.map((station) => {
    const lineIds = regionalRouteIdsByStation[station.id] ?? [];
    const wheelchairAccessible = isRegionalStationWheelchairAccessible(station.id);
    return {
      id: station.id,
      name: station.name,
      mapX: 0,
      mapY: 0,
      interchange: station.interchange ?? false,
      lineIds,
      hasActiveImpact: false,
      accessStatus: "normal",
      accessOutageCounts: { elevator: 0, escalator: 0 },
      wheelchairAccessible,
      hasElevator: isRegionalStationElevatorAccessible(station.id),
      hasWashroom: isRegionalStationWashroomAvailable(station.id),
      hasParking: isRegionalStationParkingAvailable(station.id),
      hasBicycleLockup: isRegionalStationBicycleLockupAvailable(station.id),
      hasBicycleRepair: false,
      hasBikeShare: false,
      hasPpudo: isRegionalStationPpudoAvailable(station.id),
    };
  }),
};

const regionalLineStatuses: LineStatus[] = REGIONAL_ROUTE_DEFINITIONS.map((route) => ({
  id: route.id,
  number: route.number,
  name: route.name,
  route: `${route.name} corridor`,
  color: route.color,
  status: "ready",
  statusLabel: "Demo data",
  summary: "Realtime regional status is unavailable until Metrolinx ingestion is configured.",
  updatedAgo: "Demo fixture",
}));

function regionalStationAnchorId(stationId: string, routeCode: RegionalRouteCode) {
  const junction = REGIONAL_JUNCTION_ANCHORS[stationId];
  return junction?.[routeCode as "KI" | "UP"] ?? `station-${stationId}`;
}

function regionalSegmentId(routeCode: RegionalRouteCode, stationAId: string, stationBId: string) {
  return `segment-${routeCode.toLowerCase()}-${stationAId}-${stationBId}`;
}

export const regionalSegments: NetworkSegment[] = Object.entries(REGIONAL_ROUTE_STATIONS)
  .flatMap(([rawRouteCode]) => {
    const routeCode = rawRouteCode as RegionalRouteCode;
    return REGIONAL_ROUTE_LINKS[routeCode].map(([stationAId, stationBId]) => {
      const id = regionalSegmentId(routeCode, stationAId, stationBId);
      return {
        id,
        lineId: `regional-${routeCode.toLowerCase()}`,
        label: `${stationName(stationAId)} to ${stationName(stationBId)}`,
        stationAId,
        stationBId,
        stationAAnchorId: regionalStationAnchorId(stationAId, routeCode),
        stationBAnchorId: regionalStationAnchorId(stationBId, routeCode),
        guidePathId: `segment-guide-${routeCode.toLowerCase()}-${stationAId}-${stationBId}`,
        pathD: "",
        impacts: [],
        overlay: "clear" as const,
      };
    });
  });

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
  reliability: {
    networkId: "regional",
    period: "30d",
    since: "",
    until: "",
    source: "Metrolinx Alert History",
    observedDays: 0,
    observationMinutes: 0,
    coveragePercentage: 0,
    confidence: "low",
    coverageLabel: "No verified polling coverage",
    serviceWindowBasis: "published GO/UP schedule unavailable",
    scheduleBacked: false,
    scheduleCoveragePercentage: 0,
    message: "Regional reliability requires retained alert lifecycles, successful polling coverage, and published GO/UP train schedules.",
    metrics: [],
    trainCancellations: {
      cancellations: 0,
      scheduleMatchedCancellations: 0,
      sourceLabeledCancellations: 0,
      observationMinutes: 0,
      coveragePercentage: 0,
      confidence: "low",
      message: "Train cancellation history will appear after regional trip-change observations are recorded.",
      corridors: [],
    },
  },
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

export type RegionalDashboardApiResponse = {
  networkId?: NetworkId;
  availability?: "available" | "unavailable";
  sourceSystems?: string[];
  message?: string;
  map: {
    stations: DashboardData["stations"];
    segments: DashboardData["networkSegments"];
    stationNodeImpacts: DashboardData["stationNodeImpacts"];
  };
  status: {
    generatedAt: DashboardData["generatedAt"];
    lines: DashboardData["lineStatuses"];
  };
  activeAlerts: DashboardData["activeAlerts"];
  delays: DashboardData["delays"];
  reducedSpeedZones: DashboardData["reducedSpeedZones"];
  plannedClosures: DashboardData["plannedClosures"];
  performance: DashboardData["ttcPerformance"];
};

export function regionalDashboardDataFromApi(
  payload: RegionalDashboardApiResponse,
  reliability: DashboardData["reliability"] = regionalDashboardData.reliability,
): DashboardData {
  const fresh = payload.networkId === "regional"
    && payload.availability === "available"
    && payload.status?.generatedAt?.live === true
    && Array.isArray(payload.map?.segments)
    && payload.map.segments.length === regionalSegments.length;

  if (!fresh) {
    const fallback = structuredClone(regionalDashboardData);
    const message = payload.message?.trim() || "Regional realtime data is unavailable.";
    fallback.generatedAt = {
      time: "Unavailable",
      date: "Regional source unavailable",
      live: false,
      lastPoll: payload.status?.generatedAt?.lastPoll || "not configured or stale",
    };
    fallback.ingestionHealth = [{
      label: "Metrolinx source",
      value: message,
      state: "error",
    }];
    return fallback;
  }

  return {
    ...regionalDashboardData,
    networkId: "regional",
    dataSource: "backend",
    networkSegments: payload.map.segments,
    stations: payload.map.stations,
    lineStatuses: payload.status.lines,
    generatedAt: payload.status.generatedAt,
    activeAlerts: payload.activeAlerts,
    delays: payload.delays,
    reducedSpeedZones: payload.reducedSpeedZones,
    plannedClosures: payload.plannedClosures,
    stationNodeImpacts: payload.map.stationNodeImpacts,
    reliability,
    ttcPerformance: payload.performance,
    ingestionHealth: [{
      label: "Metrolinx source",
      value: payload.message?.trim() || "Fresh regional data loaded.",
      state: "ok",
    }],
  };
}

export type RegionalScenarioId =
  | "none"
  | "all-impact-types"
  | "shared-station"
  | "stale-source";

function scenarioActiveAlert(
  overrides: Partial<ActiveAlert> & Pick<ActiveAlert, "id" | "lineId" | "lineNumber" | "title" | "severity">,
): ActiveAlert {
  return {
    location: "Regional fixture scenario",
    description: "Synthetic regional scenario data for interface verification.",
    affectedSegmentIds: [],
    shuttle: false,
    source: "Synthetic regional fixture",
    ...overrides,
  };
}

export function regionalDashboardDataForScenario(
  scenario: RegionalScenarioId,
): DashboardData {
  if (scenario === "none") return regionalDashboardData;

  const data = structuredClone(regionalDashboardData);
  if (scenario === "stale-source") {
    data.generatedAt = {
      time: "Unavailable",
      date: "Regional source has not been configured",
      live: false,
      lastPoll: "not configured",
    };
    data.ingestionHealth = [{
      label: "Regional source",
      value: "Unavailable — no Metrolinx API connection",
      state: "error",
    }];
    return data;
  }

  const delaySegmentIds = [
    regionalSegmentId("LE", "pickering", "ajax"),
    regionalSegmentId("LE", "ajax", "whitby"),
  ];
  const lwCorridorSegmentIds = REGIONAL_ROUTE_LINKS.LW.map(
    ([stationAId, stationBId]) => regionalSegmentId("LW", stationAId, stationBId),
  );
  const suspensionSegmentId = regionalSegmentId("KI", "mount-dennis", "weston");
  const delay: DelayAlert = {
    id: "regional-demo-delay",
    lineId: "regional-le",
    lineNumber: "LE",
    title: "Synthetic delay between Pickering and Whitby",
    location: "Pickering to Whitby",
    description: "Synthetic regional scenario data for interface verification.",
    affectedSegmentIds: delaySegmentIds,
    displayDirection: "Both directions",
    source: "Synthetic regional fixture",
  };
  const lwCorridorDelay: DelayAlert = {
    id: "regional-demo-lw-corridor-delay",
    lineId: "regional-lw",
    lineNumber: "LW",
    title: "Synthetic delay across Lakeshore West",
    location: "Entire Lakeshore West corridor",
    description: "Synthetic regional scenario data for full branched-corridor overlay verification.",
    affectedSegmentIds: lwCorridorSegmentIds,
    source: "Synthetic regional fixture",
  };
  const lwOverlappingDelay: DelayAlert = {
    id: "regional-demo-lw-overlapping-delay",
    lineId: "regional-lw",
    lineNumber: "LW",
    title: "Synthetic overlapping delay across Lakeshore West",
    location: "Entire Lakeshore West corridor",
    description: "Synthetic regional scenario data for same-type overlap badge verification.",
    affectedSegmentIds: lwCorridorSegmentIds,
    source: "Synthetic regional fixture",
  };
  const suspension = scenarioActiveAlert({
    id: "regional-demo-suspension",
    lineId: "regional-ki",
    lineNumber: "KI",
    title: "Synthetic service suspension",
    severity: "suspension",
    location: "Weston to Mount Dennis",
    affectedSegmentIds: [suspensionSegmentId],
  });
  const plannedClosure: PlannedClosure = {
    id: "regional-demo-planned",
    lineId: "regional-le",
    lineNumber: "LE",
    title: "Synthetic planned service change",
    window: "Fixture scenario",
    location: "Pickering to Ajax",
    description: "Synthetic regional scenario data for overlapping impact verification.",
    previewSegmentIds: [regionalSegmentId("LE", "pickering", "ajax")],
    shuttle: false,
    source: "Synthetic regional fixture",
  };
  const stationDelay: DelayAlert = {
    id: "regional-demo-bloor-station-delay",
    lineId: "regional-up",
    lineNumber: "UP",
    title: "Synthetic station-specific delay at Bloor",
    location: "Bloor GO/UP",
    description: "Synthetic regional scenario data for grouped station-impact verification.",
    affectedSegmentIds: [],
    displayDirection: "Both directions",
    source: "Synthetic regional fixture",
  };
  const stationImpact: StationNodeImpact = {
    stationId: "bloor",
    kind: "delay",
    cardId: stationDelay.id,
    title: "Synthetic station impact",
  };

  data.activeAlerts = [
    suspension,
    scenarioActiveAlert({
      id: delay.id,
      lineId: delay.lineId,
      lineNumber: delay.lineNumber,
      title: delay.title,
      severity: "delay",
      location: delay.location,
      affectedSegmentIds: delay.affectedSegmentIds,
    }),
    scenarioActiveAlert({
      id: lwCorridorDelay.id,
      lineId: lwCorridorDelay.lineId,
      lineNumber: lwCorridorDelay.lineNumber,
      title: lwCorridorDelay.title,
      severity: "delay",
      location: lwCorridorDelay.location,
      affectedSegmentIds: lwCorridorDelay.affectedSegmentIds,
    }),
    scenarioActiveAlert({
      id: lwOverlappingDelay.id,
      lineId: lwOverlappingDelay.lineId,
      lineNumber: lwOverlappingDelay.lineNumber,
      title: lwOverlappingDelay.title,
      severity: "delay",
      location: lwOverlappingDelay.location,
      affectedSegmentIds: lwOverlappingDelay.affectedSegmentIds,
    }),
    scenarioActiveAlert({
      id: stationDelay.id,
      lineId: stationDelay.lineId,
      lineNumber: stationDelay.lineNumber,
      title: stationDelay.title,
      severity: "delay",
      location: stationDelay.location,
      affectedSegmentIds: [],
      displayDirection: stationDelay.displayDirection,
    }),
  ];
  data.delays = [delay, lwCorridorDelay, lwOverlappingDelay, stationDelay];
  data.plannedClosures = [plannedClosure];
  data.stationNodeImpacts = [stationImpact];
  data.networkSegments = data.networkSegments.map((segment) => {
    const impacts = [];
    if (delaySegmentIds.includes(segment.id)) {
      impacts.push({
        kind: "delay" as const,
        cardId: delay.id,
        travelDirection: "forward" as const,
        sourceAlertIds: [delay.id],
      });
    }
    if (lwCorridorSegmentIds.includes(segment.id)) {
      impacts.push({
        kind: "delay" as const,
        cardId: lwCorridorDelay.id,
        travelDirection: "bidirectional" as const,
        sourceAlertIds: [lwCorridorDelay.id],
      });
      impacts.push({
        kind: "delay" as const,
        cardId: lwOverlappingDelay.id,
        travelDirection: "bidirectional" as const,
        sourceAlertIds: [lwOverlappingDelay.id],
      });
    }
    if (segment.id === suspensionSegmentId) {
      impacts.push({
        kind: "suspension" as const,
        cardId: suspension.id,
        travelDirection: "bidirectional" as const,
        sourceAlertIds: [suspension.id],
      });
    }
    if (plannedClosure.previewSegmentIds.includes(segment.id)) {
      impacts.push({
        kind: "planned-closure" as const,
        cardId: plannedClosure.id,
        travelDirection: "bidirectional" as const,
        sourceAlertIds: [plannedClosure.id],
      });
    }
    return {
      ...segment,
      impacts,
      overlay: impacts.some((impact) => impact.kind === "suspension")
        ? "suspension"
        : impacts.length > 0
          ? "delay"
          : "clear",
    };
  });
  return data;
}

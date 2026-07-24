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
  { id: "regional-up", number: "UP", name: "Union Pearson Express", color: "#4084cd" },
] as const;

export type RegionalRouteCode = typeof REGIONAL_ROUTE_DEFINITIONS[number]["number"];

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

export const regionalRouteIdsByStation = Object.entries(REGIONAL_ROUTE_STATIONS)
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
  interchange: (regionalRouteIdsByStation[id]?.length ?? 0) > 1,
}));

export const regionalStationSummaries: StationListResponse = {
  generatedAt: "fixture",
  stations: regionalStations.map((station) => ({
    id: station.id,
    name: station.name,
    mapX: 0,
    mapY: 0,
    interchange: station.interchange ?? false,
    lineIds: regionalRouteIdsByStation[station.id] ?? [],
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
  .flatMap(([rawRouteCode, stationIds]) => {
    const routeCode = rawRouteCode as RegionalRouteCode;
    return stationIds.slice(0, -1).map((stationAId, index) => {
      const stationBId = stationIds[index + 1];
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

  const delaySegmentId = regionalSegmentId("LE", "pickering", "ajax");
  const suspensionSegmentId = regionalSegmentId("KI", "weston", "mount-dennis");
  const delay: DelayAlert = {
    id: "regional-demo-delay",
    lineId: "regional-le",
    lineNumber: "LE",
    title: "Synthetic delay between Pickering and Ajax",
    location: "Pickering to Ajax",
    description: "Synthetic regional scenario data for interface verification.",
    affectedSegmentIds: [delaySegmentId],
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
    lineId: "regional-br",
    lineNumber: "BR",
    title: "Synthetic planned service change",
    window: "Fixture scenario",
    location: "Rutherford to Maple",
    description: "Synthetic regional scenario data for interface verification.",
    previewSegmentIds: [regionalSegmentId("BR", "rutherford", "maple")],
    shuttle: false,
    source: "Synthetic regional fixture",
  };
  const stationImpact: StationNodeImpact = {
    stationId: scenario === "shared-station" ? "bloor" : "union",
    kind: "delay",
    cardId: delay.id,
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
  ];
  data.delays = [delay];
  data.plannedClosures = [plannedClosure];
  data.stationNodeImpacts = [stationImpact];
  data.networkSegments = data.networkSegments.map((segment) => {
    const impacts = [];
    if (segment.id === delaySegmentId) {
      impacts.push({
        kind: "delay" as const,
        cardId: delay.id,
        travelDirection: "bidirectional" as const,
        sourceAlertIds: [delay.id],
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

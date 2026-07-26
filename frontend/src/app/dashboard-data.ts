import {
  networkSegments as fallbackSegments,
  stations as fallbackStations,
  lineStatuses as fallbackStatuses,
  activeAlerts as fallbackAlerts,
  delays as fallbackDelays,
  reducedSpeedZones as fallbackReducedSpeedZones,
  plannedClosures as fallbackClosures,
  stationNodeImpacts as fallbackStationNodeImpacts,
  generatedAt as fallbackGeneratedAt,
  ingestionHealth,
  commuteImpacts,
  reliabilitySummaries,
  mapAsset,
  ttcPerformanceSnapshot as fallbackPerformance,
  type TtcPerformanceSnapshot,
  type ReducedSpeedZone,
  type ActiveAlert,
  type DelayAlert,
  type LineStatus,
  type NetworkSegment,
  type PlannedClosure,
  type Station,
  type StationNodeImpact
} from "./linewatch-data";
import type { DashboardData } from "./DataContext";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

type MapApiResponse = {
  stations: Station[];
  segments: NetworkSegment[];
  stationNodeImpacts: StationNodeImpact[];
};

type StatusApiResponse = {
  generatedAt: typeof fallbackGeneratedAt;
  lines: LineStatus[];
};

type DashboardApiResponse = {
  networkId?: "ttc" | "regional";
  availability?: "available" | "unavailable";
  sourceSystems?: string[];
  message?: string;
  map: MapApiResponse;
  status: StatusApiResponse;
  activeAlerts: ActiveAlert[];
  delays: DelayAlert[];
  reducedSpeedZones: ReducedSpeedZone[];
  plannedClosures: PlannedClosure[];
  performance: TtcPerformanceSnapshot;
};

async function fetchSafe<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

function fromBackendPayload(payload: DashboardApiResponse): DashboardData {
  return {
    networkId: "ttc",
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
    commuteImpacts,
    reliabilitySummaries,
    ttcPerformance: payload.performance ?? fallbackPerformance,
    ingestionHealth,
    mapAsset
  };
}

function fallbackDashboardData(): DashboardData {
  return {
    networkId: "ttc",
    dataSource: "fallback",
    networkSegments: fallbackSegments,
    stations: fallbackStations,
    lineStatuses: fallbackStatuses,
    generatedAt: {
      ...fallbackGeneratedAt,
      lastPoll: "fixture mode",
      live: false,
    },
    activeAlerts: fallbackAlerts,
    delays: fallbackDelays,
    reducedSpeedZones: fallbackReducedSpeedZones,
    plannedClosures: fallbackClosures,
    stationNodeImpacts: fallbackStationNodeImpacts,
    commuteImpacts,
    reliabilitySummaries,
    ttcPerformance: fallbackPerformance,
    ingestionHealth,
    mapAsset
  };
}

async function loadDashboardFromAggregate(): Promise<DashboardData | null> {
  const payload = await fetchSafe<DashboardApiResponse>("/api/dashboard?network=ttc");
  if (!payload?.map || !payload.status || !payload.activeAlerts || !payload.delays || !payload.reducedSpeedZones || !payload.plannedClosures) {
    return null;
  }
  return fromBackendPayload(payload);
}

async function loadDashboardFromLegacyEndpoints(): Promise<DashboardData | null> {
  const [mapData, statusData, activeAlerts, delays, reducedSpeedZones, plannedClosures, performanceData] = await Promise.all([
    fetchSafe<MapApiResponse>("/api/map"),
    fetchSafe<StatusApiResponse>("/api/status"),
    fetchSafe<ActiveAlert[]>("/api/alerts"),
    fetchSafe<DelayAlert[]>("/api/alerts?type=delay"),
    fetchSafe<ReducedSpeedZone[]>("/api/alerts?type=slowdown"),
    fetchSafe<PlannedClosure[]>("/api/alerts?type=planned"),
    fetchSafe<TtcPerformanceSnapshot>("/api/performance")
  ]);

  const useFallback = !mapData || !statusData || !activeAlerts || !delays || !reducedSpeedZones || !plannedClosures;
  if (useFallback) {
    return null;
  }

  return fromBackendPayload({
    map: mapData,
    status: statusData,
    activeAlerts,
    delays,
    reducedSpeedZones,
    plannedClosures,
    performance: performanceData ?? fallbackPerformance,
  });
}

export async function loadDashboardInitialData(): Promise<DashboardData> {
  return await loadDashboardFromAggregate()
    ?? await loadDashboardFromLegacyEndpoints()
    ?? fallbackDashboardData();
}

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
  reliabilitySnapshot as fallbackReliability,
  mapAsset,
  ttcPerformanceSnapshot as fallbackPerformance,
  type ReliabilitySnapshot
} from "./linewatch-data";
import {
  isDashboardApiResponse,
  type DashboardApiResponse,
  type DashboardData,
} from "./dashboard-contract";
import { dashboardDataFromApi } from "./dashboard-adapter";

export { isDashboardApiResponse, type DashboardApiResponse } from "./dashboard-contract";
export { dashboardDataFromApi } from "./dashboard-adapter";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

async function fetchSafe<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

export function fallbackDashboardData(): DashboardData {
  return {
    networkId: "ttc",
    dataSource: "fallback",
    availability: "fixture",
    message: "Backend unavailable. LineWatchTO is using its local fixture view.",
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
    reliability: fallbackReliability,
    ttcPerformance: fallbackPerformance,
    ingestionHealth,
    mapAsset
  };
}

async function loadDashboardFromAggregate(): Promise<DashboardData | null> {
  const [payload, reliability] = await Promise.all([
    fetchSafe<DashboardApiResponse>("/api/dashboard?network=ttc"),
    fetchSafe<ReliabilitySnapshot>("/api/reliability/lines?network=ttc"),
  ]);
  if (!isDashboardApiResponse(payload)) {
    return null;
  }
  return dashboardDataFromApi(payload, reliability ?? fallbackReliability);
}

export async function loadDashboardInitialData(): Promise<DashboardData> {
  return await loadDashboardFromAggregate() ?? fallbackDashboardData();
}

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

async function fetchSafe<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

export async function loadDashboardInitialData(): Promise<DashboardData> {
  const [mapData, statusData, activeAlerts, delays, reducedSpeedZones, plannedClosures] = await Promise.all([
    fetchSafe<MapApiResponse>("/api/map"),
    fetchSafe<StatusApiResponse>("/api/status"),
    fetchSafe<ActiveAlert[]>("/api/alerts"),
    fetchSafe<DelayAlert[]>("/api/alerts?type=delay"),
    fetchSafe<ReducedSpeedZone[]>("/api/alerts?type=slowdown"),
    fetchSafe<PlannedClosure[]>("/api/alerts?type=planned")
  ]);

  const useFallback = !mapData || !statusData || !activeAlerts || !delays || !reducedSpeedZones || !plannedClosures;

  const initialData: DashboardData = {
    dataSource: useFallback ? "fallback" : "backend",
    networkSegments: useFallback ? fallbackSegments : mapData.segments,
    stations: useFallback ? fallbackStations : mapData.stations,
    lineStatuses: useFallback ? fallbackStatuses : statusData.lines,
    generatedAt: useFallback ? fallbackGeneratedAt : statusData.generatedAt,
    activeAlerts: useFallback ? fallbackAlerts : activeAlerts,
    delays: useFallback ? fallbackDelays : delays,
    reducedSpeedZones: useFallback ? fallbackReducedSpeedZones : reducedSpeedZones,
    plannedClosures: useFallback ? fallbackClosures : plannedClosures,
    stationNodeImpacts: useFallback ? fallbackStationNodeImpacts : mapData.stationNodeImpacts,
    commuteImpacts,
    reliabilitySummaries,
    ingestionHealth,
    mapAsset
  };

  if (useFallback) {
    initialData.generatedAt = {
      ...fallbackGeneratedAt,
      lastPoll: "fixture mode",
      live: false,
    };
  }

  return initialData;
}

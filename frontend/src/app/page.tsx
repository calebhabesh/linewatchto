import { LineWatchShell } from "../components/LineWatchShell";
import {
  networkSegments as fallbackSegments,
  stations as fallbackStations,
  lineStatuses as fallbackStatuses,
  activeAlerts as fallbackAlerts,
  reducedSpeedZones as fallbackReducedSpeedZones,
  plannedClosures as fallbackClosures,
  generatedAt as fallbackGeneratedAt,
  ingestionHealth,
  commuteImpacts,
  reliabilitySummaries,
  mapAsset,
  type ReducedSpeedZone,
  type ActiveAlert,
  type LineStatus,
  type NetworkSegment,
  type PlannedClosure,
  type Station
} from "./linewatch-data";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

type MapApiResponse = {
  stations: Station[];
  segments: NetworkSegment[];
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

export default async function Home() {
  const [mapData, statusData, activeAlerts, reducedSpeedZones, plannedClosures] = await Promise.all([
    fetchSafe<MapApiResponse>("/api/map"),
    fetchSafe<StatusApiResponse>("/api/status"),
    fetchSafe<ActiveAlert[]>("/api/alerts"),
    fetchSafe<ReducedSpeedZone[]>("/api/alerts?type=slowdown"),
    fetchSafe<PlannedClosure[]>("/api/alerts?type=planned")
  ]);

  const useFallback = !mapData || !statusData || !activeAlerts || !reducedSpeedZones || !plannedClosures;

  const initialData = {
    networkSegments: useFallback ? fallbackSegments : mapData.segments,
    stations: useFallback ? fallbackStations : mapData.stations,
    lineStatuses: useFallback ? fallbackStatuses : statusData.lines,
    generatedAt: useFallback ? fallbackGeneratedAt : statusData.generatedAt,
    activeAlerts: useFallback ? fallbackAlerts : activeAlerts,
    reducedSpeedZones: useFallback ? fallbackReducedSpeedZones : reducedSpeedZones,
    plannedClosures: useFallback ? fallbackClosures : plannedClosures,
    commuteImpacts,
    reliabilitySummaries,
    ingestionHealth,
    mapAsset
  };

  // Add a visible note if we fell back to fixtures
  if (useFallback) {
    initialData.generatedAt = {
      ...fallbackGeneratedAt,
      lastPoll: "Backend offline (Fixture mode)",
      live: false,
    };
  }

  return <LineWatchShell initialData={initialData} />;
}

import { LineWatchShell } from "../components/LineWatchShell";
import {
  networkSegments as fallbackSegments,
  stations as fallbackStations,
  lineStatuses as fallbackStatuses,
  activeAlerts as fallbackAlerts,
  plannedClosures as fallbackClosures,
  generatedAt as fallbackGeneratedAt,
  ingestionHealth,
  commuteImpacts,
  reliabilitySummaries,
  mapAsset
} from "./linewatch-data";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8080";

async function fetchSafe(path: string) {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function Home() {
  const [mapData, statusData, activeAlerts, plannedClosures] = await Promise.all([
    fetchSafe("/api/map"),
    fetchSafe("/api/status"),
    fetchSafe("/api/alerts"),
    fetchSafe("/api/alerts?type=planned")
  ]);

  const useFallback = !mapData || !statusData || !activeAlerts || !plannedClosures;

  const initialData = {
    networkSegments: useFallback ? fallbackSegments : mapData.segments,
    stations: useFallback ? fallbackStations : mapData.stations,
    lineStatuses: useFallback ? fallbackStatuses : statusData.lines,
    generatedAt: useFallback ? fallbackGeneratedAt : statusData.generatedAt,
    activeAlerts: useFallback ? fallbackAlerts : activeAlerts,
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

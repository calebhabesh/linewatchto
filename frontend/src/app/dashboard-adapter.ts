import type { DashboardData } from "./DataContext.tsx";
import {
  commuteImpacts,
  ingestionHealth,
  mapAsset,
  reliabilitySnapshot as fallbackReliability,
  reliabilitySummaries,
  ttcPerformanceSnapshot as fallbackPerformance,
} from "./linewatch-data.ts";
import type { ReliabilitySnapshot } from "./linewatch-data.ts";
import type { DashboardApiResponse } from "./dashboard-contract.ts";

export function dashboardDataFromApi(
  payload: DashboardApiResponse,
  reliability: ReliabilitySnapshot = fallbackReliability,
): DashboardData {
  const availability = payload.status.generatedAt.live
    ? payload.availability === "degraded" ? "degraded" : "available"
    : "unavailable";
  return {
    networkId: "ttc",
    dataSource: availability === "unavailable" ? "fallback" : "backend",
    availability,
    message: payload.message?.trim() || (availability === "unavailable"
      ? "TTC service-alert data is currently unavailable."
      : "Fresh TTC dashboard data loaded."),
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
    reliability,
    ttcPerformance: payload.performance ?? fallbackPerformance,
    ingestionHealth,
    mapAsset,
  };
}

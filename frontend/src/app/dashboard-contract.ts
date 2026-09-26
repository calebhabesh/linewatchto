import type {
  ActiveAlert,
  CommuteSummary,
  DelayAlert,
  IngestionHealthItem,
  LineStatus,
  NetworkSegment,
  PlannedClosure,
  ReducedSpeedZone,
  ReliabilitySnapshot,
  ReliabilitySummary,
  Station,
  StationNodeImpact,
  TtcPerformanceSnapshot,
} from "./linewatch-data.ts";

export type NetworkId = "ttc" | "regional";

export type DashboardApiResponse = {
  networkId?: NetworkId;
  availability?: "available" | "degraded" | "unavailable";
  sourceSystems?: string[];
  message?: string;
  map: {
    stations: Station[];
    segments: NetworkSegment[];
    stationNodeImpacts: StationNodeImpact[];
  };
  status: {
    generatedAt: { time: string; date: string; live: boolean; lastPoll: string };
    lines: LineStatus[];
  };
  activeAlerts: ActiveAlert[];
  delays: DelayAlert[];
  reducedSpeedZones: ReducedSpeedZone[];
  plannedClosures: PlannedClosure[];
  performance: TtcPerformanceSnapshot;
};

export function isDashboardApiResponse(value: unknown): value is DashboardApiResponse {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<DashboardApiResponse>;
  return Boolean(
    payload.map
    && Array.isArray(payload.map.stations)
    && Array.isArray(payload.map.segments)
    && Array.isArray(payload.map.stationNodeImpacts)
    && payload.status?.generatedAt
    && typeof payload.status.generatedAt.live === "boolean"
    && typeof payload.status.generatedAt.lastPoll === "string"
    && Array.isArray(payload.status.lines)
    && Array.isArray(payload.activeAlerts)
    && Array.isArray(payload.delays)
    && Array.isArray(payload.reducedSpeedZones)
    && Array.isArray(payload.plannedClosures),
  );
}

export interface DashboardData {
  snapshot?: { savedAt: number | null; reason: "offline" | "reconnecting" | "stale" | "refreshing" };
  networkId: NetworkId;
  dataSource: "backend" | "fallback";
  availability: "available" | "degraded" | "unavailable" | "fixture";
  message: string;
  networkSegments: NetworkSegment[];
  stations: Station[];
  lineStatuses: LineStatus[];
  generatedAt: { time: string; date: string; live: boolean; lastPoll: string };
  activeAlerts: ActiveAlert[];
  delays: DelayAlert[];
  reducedSpeedZones: ReducedSpeedZone[];
  plannedClosures: PlannedClosure[];
  stationNodeImpacts: StationNodeImpact[];
  commuteImpacts: CommuteSummary[];
  reliabilitySummaries: ReliabilitySummary[];
  reliability: ReliabilitySnapshot;
  ttcPerformance: TtcPerformanceSnapshot;
  ingestionHealth: IngestionHealthItem[];
  mapAsset: { src: string; viewBox: readonly [number, number, number, number]; legendIcons: Record<string, string> };
}

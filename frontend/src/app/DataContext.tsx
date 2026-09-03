"use client";

import { createContext, useContext, ReactNode } from "react";
import {
  NetworkSegment,
  Station,
  LineStatus,
  ActiveAlert,
  PlannedClosure,
  CommuteSummary,
  ReliabilitySummary,
  IngestionHealthItem,
  ReducedSpeedZone,
  DelayAlert,
  StationNodeImpact,
  TtcPerformanceSnapshot,
  ReliabilitySnapshot
} from "./linewatch-data";
import type { NetworkId } from "./regional-data";

export interface DashboardData {
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

const DataContext = createContext<DashboardData | null>(null);

export function DataProvider({ data, children }: { data: DashboardData; children: ReactNode }) {
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}

export function useDashboardData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useDashboardData must be used within a DataProvider");
  return ctx;
}

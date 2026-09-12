import type { DashboardData } from "./DataContext.tsx";
import type { NetworkId } from "./regional-data.ts";

export const SNAPSHOT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const DASHBOARD_VERIFICATION_MS = 2 * 60 * 1000;
export const snapshotKey = (network: NetworkId) => `linewatch-dashboard-snapshot-v1:${network}`;
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type DashboardSnapshot = { version: 1; savedAt: number; data: DashboardData };

export function canSaveDashboard(data: DashboardData): boolean {
  return data.dataSource === "backend" && data.generatedAt.live
    && (data.availability === "available" || data.availability === "degraded") && !data.snapshot;
}

// Explicit public fields only. Account state and arrival/vehicle estimates never enter this store.
export function saveDashboardSnapshot(storage: StorageLike, data: DashboardData, now = Date.now()): DashboardSnapshot | null {
  if (!canSaveDashboard(data)) return null;
  const { networkId, dataSource, availability, message, networkSegments, stations, lineStatuses,
    generatedAt, activeAlerts, delays, reducedSpeedZones, plannedClosures, stationNodeImpacts,
    reliability, ttcPerformance, mapAsset } = data;
  const snapshot: DashboardSnapshot = { version: 1, savedAt: now, data: {
    networkId, dataSource, availability, message, networkSegments, stations, lineStatuses,
    generatedAt, activeAlerts, delays, reducedSpeedZones, plannedClosures, stationNodeImpacts,
    reliability, ttcPerformance, mapAsset, commuteImpacts: [], reliabilitySummaries: [], ingestionHealth: [],
  } };
  try { storage.setItem(snapshotKey(networkId), JSON.stringify(snapshot)); } catch { /* Private mode/quota: keep the in-memory view. */ }
  return snapshot;
}

export function readDashboardSnapshot(storage: StorageLike, network: NetworkId, now = Date.now()): DashboardSnapshot | null {
  try {
    const raw = storage.getItem(snapshotKey(network));
    if (!raw) return null;
    if (raw.length > 5_000_000) throw new Error("Snapshot too large");
    const snapshot = JSON.parse(raw) as DashboardSnapshot;
    const d = snapshot.data;
    if (snapshot.version !== 1 || !Number.isFinite(snapshot.savedAt) || snapshot.savedAt > now
      || now - snapshot.savedAt > SNAPSHOT_RETENTION_MS || !d || d.networkId !== network
      || !canSaveDashboard(d) || !d.mapAsset || typeof d.mapAsset.src !== "string"
      || !Array.isArray(d.mapAsset.viewBox) || !d.mapAsset.legendIcons
      || typeof d.generatedAt.lastPoll !== "string" || typeof d.generatedAt.date !== "string"
      || typeof d.generatedAt.time !== "string" || !d.reliability || !d.ttcPerformance
      || ![d.networkSegments, d.stations, d.lineStatuses, d.activeAlerts, d.delays,
        d.reducedSpeedZones, d.plannedClosures].every(
        (rows) => Array.isArray(rows) && rows.every((row) => row && typeof row.id === "string"))
      || !Array.isArray(d.stationNodeImpacts) || !d.stationNodeImpacts.every((row) => row && typeof row.stationId === "string" && typeof row.cardId === "string")) {
      throw new Error("Invalid dashboard snapshot");
    }
    return snapshot;
  } catch {
    try { storage.removeItem(snapshotKey(network)); } catch { /* Storage can be unavailable. */ }
    return null;
  }
}

export function snapshotDashboard(data: DashboardData, savedAt: number | null,
  reason: NonNullable<DashboardData["snapshot"]>["reason"]): DashboardData {
  const hasSnapshot = savedAt !== null;
  return {
    ...data,
    snapshot: { savedAt, reason },
    generatedAt: { ...data.generatedAt, live: false },
    lineStatuses: data.lineStatuses.map((line) => ({ ...line, status: "ready",
      statusLabel: "Current status unknown",
      summary: hasSnapshot ? `Last reported: ${line.statusLabel}. Service may have changed.` : "Connect to check service status.",
    })),
    // Demo incidents must never masquerade as an offline observation.
    activeAlerts: hasSnapshot ? data.activeAlerts : [],
    delays: hasSnapshot ? data.delays : [],
    reducedSpeedZones: hasSnapshot ? data.reducedSpeedZones : [],
    plannedClosures: hasSnapshot ? data.plannedClosures : [],
    stationNodeImpacts: hasSnapshot ? data.stationNodeImpacts : [],
    networkSegments: hasSnapshot ? data.networkSegments : data.networkSegments.map((segment) => ({
      ...segment, overlay: "clear", impacts: [], sourceAlertIds: [], reducedSpeedZoneIds: [], alertId: undefined,
    })),
    commuteImpacts: [],
    ingestionHealth: [{ label: "Connection", value: "Current service cannot be verified", state: "error" }],
  };
}

export function snapshotNotice(snapshot: NonNullable<DashboardData["snapshot"]>, now: number): string {
  const prefix = snapshot.reason === "offline" ? "Offline" : snapshot.reason === "stale" ? "Updates unavailable" : "Reconnecting";
  if (snapshot.savedAt === null) return `${prefix} — No saved dashboard for this network. Current status unknown.`;
  const age = Math.max(0, Math.floor((now - snapshot.savedAt) / 60_000));
  const downloaded = new Date(snapshot.savedAt).toLocaleString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${prefix} — Saved ${age < 1 ? "less than a minute" : `${age} min`} ago (${downloaded}, Toronto). Service may have changed.`;
}

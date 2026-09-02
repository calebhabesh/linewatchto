import type {
  ActiveAlert,
  Dashboard,
  DelayAlert,
  PlannedClosure,
  ReducedSpeedZone,
} from "@/api/dashboard-schema";

export type ImpactKind = "suspension" | "delay" | "reduced-speed-zone" | "planned-closure";

export type ImpactTone = "suspension" | "delay" | "planned";

export type ImpactItem =
  | { kind: "suspension"; data: ActiveAlert; tone: "suspension" }
  | { kind: "delay"; data: DelayAlert; tone: "delay" }
  | { kind: "reduced-speed-zone"; data: ReducedSpeedZone; tone: "delay" }
  | { kind: "planned-closure"; data: PlannedClosure; tone: "planned" };

export type AlertFilter = "all" | "suspension" | "delay" | "reduced-speed-zone" | "planned-closure";

export interface FilterOption {
  key: AlertFilter;
  label: string;
  count: number;
}

export function getAvailableFilters(dashboard?: Dashboard | null, network: "ttc" | "regional" = "ttc"): FilterOption[] {
  const suspensionsCount = dashboard?.activeAlerts.length ?? 0;
  const delaysCount = dashboard?.delays.length ?? 0;
  const rszCount = network === "ttc" ? (dashboard?.reducedSpeedZones.length ?? 0) : 0;
  const plannedCount = dashboard?.plannedClosures.length ?? 0;
  const allCount = suspensionsCount + delaysCount + rszCount + plannedCount;

  const filters: FilterOption[] = [
    { key: "all", label: "All", count: allCount },
    { key: "suspension", label: "Suspensions", count: suspensionsCount },
    { key: "delay", label: "Delays", count: delaysCount },
  ];

  if (network === "ttc") {
    filters.push({ key: "reduced-speed-zone", label: "Reduced Speed Zones", count: rszCount });
  }

  filters.push({ key: "planned-closure", label: "Planned Closures", count: plannedCount });

  return filters;
}

export function filterImpacts(dashboard?: Dashboard | null, filter: AlertFilter = "all", network: "ttc" | "regional" = "ttc"): ImpactItem[] {
  if (!dashboard) return [];

  const items: ImpactItem[] = [];

  if (filter === "all" || filter === "suspension") {
    for (const alert of dashboard.activeAlerts) {
      items.push({ kind: "suspension", data: alert, tone: "suspension" });
    }
  }

  if (filter === "all" || filter === "delay") {
    for (const alert of dashboard.delays) {
      items.push({ kind: "delay", data: alert, tone: "delay" });
    }
  }

  if (network === "ttc" && (filter === "all" || filter === "reduced-speed-zone")) {
    for (const alert of dashboard.reducedSpeedZones) {
      items.push({ kind: "reduced-speed-zone", data: alert, tone: "delay" });
    }
  }

  if (filter === "all" || filter === "planned-closure") {
    for (const alert of dashboard.plannedClosures) {
      items.push({ kind: "planned-closure", data: alert, tone: "planned" });
    }
  }

  return items;
}

export function findImpactInDashboard(
  dashboard: Dashboard | null | undefined,
  kind: string,
  id: string,
): ImpactItem | null {
  if (!dashboard) return null;

  if (kind === "suspension") {
    const alert = dashboard.activeAlerts.find((a) => a.id === id);
    if (alert) return { kind: "suspension", data: alert, tone: "suspension" };
  } else if (kind === "delay") {
    const delay = dashboard.delays.find((d) => d.id === id);
    if (delay) return { kind: "delay", data: delay, tone: "delay" };
    const active = dashboard.activeAlerts.find((a) => a.id === id);
    if (active) return { kind: "suspension", data: active, tone: "suspension" };
  } else if (kind === "reduced-speed-zone") {
    const rsz = dashboard.reducedSpeedZones.find((r) => r.id === id);
    if (rsz) return { kind: "reduced-speed-zone", data: rsz, tone: "delay" };
  } else if (kind === "planned-closure") {
    const closure = dashboard.plannedClosures.find((c) => c.id === id);
    if (closure) return { kind: "planned-closure", data: closure, tone: "planned" };
  }

  // Fallback search across collections by ID
  const anyActive = dashboard.activeAlerts.find((a) => a.id === id);
  if (anyActive) return { kind: "suspension", data: anyActive, tone: "suspension" };
  const anyDelay = dashboard.delays.find((d) => d.id === id);
  if (anyDelay) return { kind: "delay", data: anyDelay, tone: "delay" };
  const anyRsz = dashboard.reducedSpeedZones.find((r) => r.id === id);
  if (anyRsz) return { kind: "reduced-speed-zone", data: anyRsz, tone: "delay" };
  const anyClosure = dashboard.plannedClosures.find((c) => c.id === id);
  if (anyClosure) return { kind: "planned-closure", data: anyClosure, tone: "planned" };

  return null;
}

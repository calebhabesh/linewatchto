import type { ActiveAlert, DelayAlert, ImpactKind, LineStatus, PlannedClosure, ReducedSpeedZone } from "./linewatch-data.ts";
import { countReducedSpeedZones } from "./reduced-speed-zone-count.ts";
import { compareSurfaceNotices } from "./surface-notice-groups.ts";

export type CurrentServiceData = {
  snapshot?: { savedAt: number | null };
  activeAlerts: ActiveAlert[];
  delays: DelayAlert[];
  reducedSpeedZones: ReducedSpeedZone[];
  plannedClosures: PlannedClosure[];
  lineStatuses: LineStatus[];
  generatedAt: { live: boolean };
  availability: "available" | "degraded" | "unavailable" | "fixture";
};
export type CurrentServiceRow = {
  id: string;
  kind: ImpactKind;
  iconKind?: ImpactKind;
  lineId: string;
  lineNumber: string;
  condition: string;
  location: string;
  timing?: string;
  direction?: string | null;
  shuttle: boolean;
  priority: number;
};

export function windowTime(value: string | null | undefined, now: number, ending = false) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return undefined;
  const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });
  const day = now > 0 && dateFormat.format(time) === dateFormat.format(now)
    ? "today"
    : new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "short" }).format(time);
  const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", hour12: true }).format(time);
  const label = `${day} at ${clock}`;
  const minutes = Math.max(1, Math.ceil((time - now) / 60_000));
  const remaining = minutes < 60 ? `${minutes}min` : `${Math.round(minutes / 60)}hr`;
  return `${ending ? "Ends " : ""}${label}${now > 0 && time > now ? ` (${remaining})` : ""}`;
}

export function getPlannedClosureCountBadgeLabel(count: number): string {
  if (count <= 1) {
    return "1 Planned Closure";
  }
  return `${count} Planned Closures`;
}

/** Presentation of the dashboard's already time-gated impacts, never a second feed. */
export function currentServiceSummary(data: CurrentServiceData, now = 0) {
  const fresh = data.generatedAt.live && data.availability !== "unavailable" && data.availability !== "fixture";
  if (data.snapshot?.savedAt != null) now = data.snapshot.savedAt;
  if (!fresh && data.snapshot?.savedAt == null) return { fresh: false, rows: [] as CurrentServiceRow[], unaffected: [] as LineStatus[], upcoming: [] as PlannedClosure[] };
  const rows: CurrentServiceRow[] = data.activeAlerts.map((alert) => {
    const closure = data.plannedClosures.find(item => item.id === (alert.relatedPlannedClosureId || alert.id));
    const planned = alert.severity === "planned" || !!closure || !!alert.relatedPlannedClosureId;
    return ({
    id: alert.id,
    kind: alert.severity === "planned" ? "planned-closure" : alert.severity === "delay" ? "delay" : "suspension",
    lineId: alert.lineId, lineNumber: alert.lineNumber,
    condition: planned ? "Planned Closure in Effect" : /\bbypass(?:ing|ed)?\b/i.test(alert.title) ? "Bypassing station" : alert.severity === "delay" ? "Delays" : alert.severity === "planned" ? "Closure in effect" : "No Service",
    iconKind: planned ? "suspension" : undefined,
    timing: planned ? windowTime(closure?.activeWindowEnd, now, true) : undefined,
    location: alert.location || alert.title,
    direction: alert.displayDirection, shuttle: alert.shuttle,
    priority: alert.severity === "delay" ? 1 : 0,
  });
  });
  for (const delay of data.delays) {
    if (rows.some((row) => row.id === delay.id && row.lineId === delay.lineId)) continue;
    rows.push({ id: delay.id, kind: "delay", lineId: delay.lineId, lineNumber: delay.lineNumber, condition: "Delays", location: delay.location || delay.title, direction: delay.displayDirection, shuttle: false, priority: 1 });
  }
  // Published windows starting within 24 hours (or active now) qualify as current service entries.
  const qualifyingClosures = data.plannedClosures.filter((closure) => {
    const start = Date.parse(closure.nextWindowStart || "");
    const end = Date.parse(closure.nextWindowEnd || "");
    return now > 0 && !closure.activeNow && Number.isFinite(start) && Number.isFinite(end)
      && end > start && end > now && start <= now + 24 * 60 * 60 * 1000
      && !data.activeAlerts.some((alert) => alert.id === closure.id || alert.relatedPlannedClosureId === closure.id);
  }).sort((a, b) => Date.parse(a.nextWindowStart!) - Date.parse(b.nextWindowStart!) || a.id.localeCompare(b.id));

  for (const closure of qualifyingClosures) {
    const start = Date.parse(closure.nextWindowStart!);
    const active = start <= now;
    rows.push({
      id: closure.id,
      kind: "planned-closure",
      lineId: closure.lineId,
      lineNumber: closure.lineNumber,
      condition: active ? "Planned Closure in Effect" : "Upcoming Closure",
      iconKind: active ? "suspension" : undefined,
      timing: windowTime(active ? closure.nextWindowEnd : closure.nextWindowStart, now, active),
      location: closure.location || closure.title,
      direction: closure.displayDirection,
      shuttle: closure.shuttle,
      priority: active ? 0 : 2,
    });
  }

  // Planned closures with published windows that are > 24hrs out qualify for subtle line badges.
  const upcoming = data.plannedClosures.filter((closure) => {
    const start = Date.parse(closure.nextWindowStart || "");
    const end = Date.parse(closure.nextWindowEnd || "");
    return now > 0 && !closure.activeNow && Number.isFinite(start) && Number.isFinite(end)
      && end > start && end > now && start > now + 24 * 60 * 60 * 1000
      && !data.activeAlerts.some((alert) => alert.id === closure.id || alert.relatedPlannedClosureId === closure.id);
  }).sort((a, b) => Date.parse(a.nextWindowStart || "") - Date.parse(b.nextWindowStart || "") || a.id.localeCompare(b.id));

  // Stable within severity and line: source timestamp changes must not move a row.
  const lineOrder = new Map(data.lineStatuses.map((line, index) => [line.id, index]));
  rows.sort((a, b) => a.priority - b.priority || (lineOrder.get(a.lineId) ?? 99) - (lineOrder.get(b.lineId) ?? 99) || a.id.localeCompare(b.id));
  const affected = new Set([...rows.map((row) => row.lineId), ...(data.reducedSpeedZones ?? []).map((rsz) => rsz.lineId)]);
  return { fresh, rows: data.snapshot ? rows.map((row) => ({ ...row, condition: `Last reported: ${row.condition}`, timing: undefined })) : rows, unaffected: fresh ? data.lineStatuses.filter((line) => !affected.has(line.id)) : [], upcoming };
}

export function currentSurfaceNotices(
  notices: import("./surface-notice-data.ts").SurfaceNoticeDetail[],
  now: number,
  preferTtcServiceAlerts = false,
) {
  return notices.filter((notice) => {
    const start = notice.startAt ? Date.parse(notice.startAt) : null;
    const end = notice.endAt ? Date.parse(notice.endAt) : null;
    return (start === null || Number.isFinite(start) && start <= now)
      && (end === null || Number.isFinite(end) && end > now);
  }).sort((a, b) => preferTtcServiceAlerts
    ? compareSurfaceNotices(a, b, "importance", undefined, true)
    : (a.routeIds[0] || "").localeCompare(b.routeIds[0] || "", undefined, { numeric: true }) || a.id.localeCompare(b.id));
}

export function getCanonicalAlertTitle(row: CurrentServiceRow): string {
  const isSnapshot = row.condition.startsWith("Last reported: ");
  const rawCondition = isSnapshot ? row.condition.replace(/^Last reported:\s*/, "") : row.condition;

  let title = "Active Alert";
  if (
    rawCondition === "Planned Closure in Effect" ||
    rawCondition === "Closure in effect" ||
    (row.kind === "planned-closure" && row.iconKind === "suspension")
  ) {
    title = "Planned Closure in Effect";
  } else if (
    rawCondition === "Upcoming Closure" ||
    rawCondition === "Planned Closure" ||
    row.kind === "planned-closure"
  ) {
    title = "Planned Closure";
  } else if (
    row.kind === "delay" ||
    rawCondition === "Delays" ||
    rawCondition === "Delay"
  ) {
    title = "Delay";
  } else if (/bypass/i.test(rawCondition)) {
    title = "Bypassing Station";
  } else if (
    row.kind === "suspension" ||
    rawCondition === "No Service" ||
    rawCondition === "Active Alert"
  ) {
    title = "Active Alert";
  } else {
    title = rawCondition;
  }

  return isSnapshot ? `Last reported: ${title}` : title;
}

export type LineStatusPresentationState =
  | "normal"
  | "reduced-speed-zones"
  | "closed"
  | "ready"
  | "delay"
  | "suspension"
  | "unavailable"
  | "snapshot";

export type LineStatusPresentation = {
  state: LineStatusPresentationState;
  label: string;
  isNormal: boolean;
  hasRsz: boolean;
  rszCount?: number;
};

export function getLineStatusPresentation(
  line: LineStatus,
  data: CurrentServiceData,
  summary: { fresh: boolean; rows: CurrentServiceRow[] },
): LineStatusPresentation {
  if (data.snapshot) {
    return {
      state: "snapshot",
      label: data.snapshot.savedAt != null ? (line.statusLabel || "Saved status") : "Current status unknown",
      isNormal: false,
      hasRsz: false,
    };
  }

  if (data.availability === "fixture") {
    return {
      state: "snapshot",
      label: line.statusLabel || "Demo status",
      isNormal: false,
      hasRsz: false,
    };
  }

  if (!summary.fresh || data.availability === "unavailable" || !data.generatedAt?.live) {
    return {
      state: "unavailable",
      label: "Current status unavailable",
      isNormal: false,
      hasRsz: false,
    };
  }

  const rawStatus = (line.status || "").toLowerCase();
  const rawStatusLabel = (line.statusLabel || "").toLowerCase();

  if (rawStatus === "closed" || rawStatusLabel === "closed") {
    return {
      state: "closed",
      label: line.statusLabel || "Closed",
      isNormal: false,
      hasRsz: false,
    };
  }

  if (rawStatus === "ready" || rawStatusLabel.includes("not running") || rawStatusLabel.includes("ready")) {
    return {
      state: "ready",
      label: line.statusLabel || "Not Running",
      isNormal: false,
      hasRsz: false,
    };
  }

  if (rawStatus === "delay" || rawStatusLabel.includes("delay")) {
    return {
      state: "delay",
      label: line.statusLabel || "Delays",
      isNormal: false,
      hasRsz: false,
    };
  }

  if (rawStatus === "suspension" || rawStatusLabel.includes("no service")) {
    return {
      state: "suspension",
      label: line.statusLabel || "No Service",
      isNormal: false,
      hasRsz: false,
    };
  }

  const rszList = (data.reducedSpeedZones ?? []).filter((rsz) => rsz.lineId === line.id);
  if (rszList.length > 0) {
    return {
      state: "reduced-speed-zones",
      label: "Normal Service",
      isNormal: true,
      hasRsz: true,
      rszCount: countReducedSpeedZones(rszList),
    };
  }

  return {
    state: "normal",
    label: "Normal Service",
    isNormal: true,
    hasRsz: false,
  };
}

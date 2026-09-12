import type { ActiveAlert, DelayAlert, ImpactKind, LineStatus, PlannedClosure, ReducedSpeedZone } from "./linewatch-data.ts";

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

function windowTime(value: string | null | undefined, now: number, ending = false) {
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
  // Only explicit published windows qualify; publication dates are not service windows.
  const upcoming = data.plannedClosures.filter((closure) => {
    const start = Date.parse(closure.nextWindowStart || "");
    const end = Date.parse(closure.nextWindowEnd || "");
    return now > 0 && !closure.activeNow && Number.isFinite(start) && Number.isFinite(end)
      && end > start && end > now && start <= now + 24 * 60 * 60 * 1000
      && !data.activeAlerts.some((alert) => alert.id === closure.id || alert.relatedPlannedClosureId === closure.id);
  }).sort((a, b) => Date.parse(a.nextWindowStart!) - Date.parse(b.nextWindowStart!) || a.id.localeCompare(b.id));
  for (const closure of upcoming) {
    const start = Date.parse(closure.nextWindowStart!);
    const active = start <= now;

    rows.push({ id: closure.id, kind: "planned-closure", lineId: closure.lineId, lineNumber: closure.lineNumber,
      condition: active ? "Planned Closure in Effect" : "Upcoming Closure",
      iconKind: active ? "suspension" : undefined,
      timing: windowTime(active ? closure.nextWindowEnd : closure.nextWindowStart, now, active),
      location: closure.location || closure.title, direction: closure.displayDirection, shuttle: closure.shuttle, priority: active ? 0 : 2 });
  }
  // Stable within severity and line: source timestamp changes must not move a row.
  const lineOrder = new Map(data.lineStatuses.map((line, index) => [line.id, index]));
  rows.sort((a, b) => a.priority - b.priority || (lineOrder.get(a.lineId) ?? 99) - (lineOrder.get(b.lineId) ?? 99) || a.id.localeCompare(b.id));
  const affected = new Set([...rows.map((row) => row.lineId), ...(data.reducedSpeedZones ?? []).map((rsz) => rsz.lineId)]);
  return { fresh, rows: data.snapshot ? rows.map((row) => ({ ...row, condition: `Last reported: ${row.condition}`, timing: undefined })) : rows, unaffected: fresh ? data.lineStatuses.filter((line) => !affected.has(line.id)) : [], upcoming };
}

export function currentSurfaceNotices(notices: import("./surface-notice-data.ts").SurfaceNoticeDetail[], now: number) {
  return notices.filter((notice) => {
    const start = notice.startAt ? Date.parse(notice.startAt) : null;
    const end = notice.endAt ? Date.parse(notice.endAt) : null;
    return (start === null || Number.isFinite(start) && start <= now)
      && (end === null || Number.isFinite(end) && end > now);
  }).sort((a, b) => (a.routeIds[0] || "").localeCompare(b.routeIds[0] || "", undefined, { numeric: true }) || a.id.localeCompare(b.id));
}

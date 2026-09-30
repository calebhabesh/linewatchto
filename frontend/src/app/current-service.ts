import { serviceEffectLabel } from "./alert-categories.ts";
import type { ActiveAlert, DelayAlert, IncidentRiderDetails, ImpactKind, LineStatus, PlannedClosure, ReducedSpeedZone } from "./linewatch-data.ts";
import { countReducedSpeedZones } from "./reduced-speed-zone-count.ts";
import { compareSurfaceNotices } from "./surface-notice-groups.ts";

export type CurrentServiceData = {
  networkId?: "ttc" | "regional";
  snapshot?: { savedAt: number | null };
  activeAlerts: ActiveAlert[];
  delays: DelayAlert[];
  reducedSpeedZones: ReducedSpeedZone[];
  plannedClosures: PlannedClosure[];
  lineStatuses: LineStatus[];
  generatedAt: { live: boolean };
  availability: "available" | "degraded" | "unavailable" | "fixture";
};
export type CurrentServiceRow = IncidentRiderDetails & {
  id: string;
  kind: ImpactKind;
  iconKind?: ImpactKind;
  lineId: string;
  lineNumber: string;
  condition: string;
  location: string;
  timing?: string;
  timingTarget?: string | null;
  cause?: string | null;
  updatedAt?: string | null;
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
  const remaining = remainingWindowTime(time, now);
  return `${ending ? "Ends " : ""}${label}${remaining ? ` (${remaining})` : ""}`;
}

function remainingWindowTime(time: number, now: number): string | undefined {
  if (!Number.isFinite(now) || now <= 0 || time <= now) return undefined;
  const minutes = Math.floor((time - now) / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) {
    const remainder = minutes % 60;
    return `${Math.floor(minutes / 60)}h${remainder ? ` ${remainder}m` : ""}`;
  }
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  return `${Math.floor(minutes / (24 * 60))}d${hours ? ` ${hours}h` : ""}`;
}

export function windowCountdownStage(value: string | null | undefined, now: number) {
  const remaining = Date.parse(value || "") - now;
  if (!Number.isFinite(remaining) || now <= 0 || remaining <= 0) return undefined;
  return remaining <= 15 * 60_000 ? "imminent" : remaining <= 60 * 60_000 ? "soon" : "distant";
}

export function getPlannedClosureCountBadgeLabel(count: number): string {
  if (count <= 1) {
    return "1 Planned Advisory";
  }
  return `${count} Planned Advisories`;
}

function incidentRiderDetails(incident: IncidentRiderDetails & { cause?: string | null; updatedAt?: string | null }) {
  return {
    cause: incident.cause,
    updatedAt: incident.updatedAt,
    publishedAt: incident.publishedAt,
    replacementService: incident.replacementService,
    maximumDelayMinutes: incident.maximumDelayMinutes,
    serviceEffect: incident.serviceEffect,
  };
}

/** Optional, source-reported facts only; generic classifier fallbacks add no rider information. */
export function regionalIncidentFacts(row: CurrentServiceRow) {
  const cause = row.cause?.trim();
  const delay = row.maximumDelayMinutes;
  return {
    cause: cause && !/^(unknown|other(?: cause)?|metrolinx service update|modified trip|no service|delay(?:s)?)$/i.test(cause) ? cause : undefined,
    service: [
      Number.isInteger(delay) && delay! > 0 ? `Reported Delay: ${delay} min` : undefined,
      row.replacementService === "go-bus" ? "GO Buses Replace Trains"
        : row.replacementService === "bus" ? "Buses Replace Trains" : undefined,
    ].filter(Boolean).join(" · "),
    publishedAt: row.publishedAt && Number.isFinite(Date.parse(row.publishedAt)) ? row.publishedAt : undefined,
  };
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
    kind: alert.severity === "delay" ? "delay" : "suspension",
    lineId: alert.lineId, lineNumber: alert.lineNumber,
    condition: planned ? "Planned Closure in Effect" : /\bbypass(?:ing|ed)?\b/i.test(alert.title) ? "Bypassing station" : alert.severity === "delay" ? "Delays" : alert.severity === "planned" ? "Closure in effect" : "No Service",
    iconKind: planned ? "suspension" : undefined,
    timing: planned ? windowTime(closure?.activeWindowEnd, now, true) : undefined,
    timingTarget: planned ? closure?.activeWindowEnd : undefined,
    location: alert.location || alert.title,
    direction: alert.displayDirection, shuttle: alert.shuttle,
    ...incidentRiderDetails(alert),
    priority: alert.severity === "delay" ? 1 : 0,
  });
  });
  for (const delay of data.delays) {
    if (rows.some((row) => row.id === delay.id && row.lineId === delay.lineId)) continue;
    const closure = data.plannedClosures.find(item => item.id === delay.relatedPlannedClosureId);
    rows.push({ id: delay.id, kind: "delay", lineId: delay.lineId, lineNumber: delay.lineNumber,
      condition: delay.serviceEffect === "limited-service" ? "Limited service" : "Delays",
      timing: windowTime(delay.activeWindowEnd ?? closure?.activeWindowEnd, now, true),
      timingTarget: delay.activeWindowEnd ?? closure?.activeWindowEnd,
      location: delay.location || delay.title, direction: delay.displayDirection, shuttle: !!delay.shuttle,
      priority: 1, ...incidentRiderDetails(delay) });
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
      condition: closure.serviceEffect === "limited-service"
        ? active ? "Limited service" : "Planned limited service"
        : active ? "Planned Closure in Effect" : "Upcoming Closure",
      iconKind: active ? closure.serviceEffect === "limited-service" ? "delay" : "suspension" : undefined,
      timing: windowTime(active ? closure.nextWindowEnd : closure.nextWindowStart, now, active),
      timingTarget: active ? closure.nextWindowEnd : closure.nextWindowStart,
      location: closure.location || closure.title,
      direction: closure.displayDirection,
      ...incidentRiderDetails(closure),
      shuttle: closure.shuttle,
      priority: active ? 0 : 2,
    });
  }

  // Planned notices can lack structured service windows. Keep them discoverable
  // as badges without treating their publication/validity dates as a schedule.
  const upcoming = data.plannedClosures.filter((closure) => {
    if (closure.activeNow || data.activeAlerts.some((alert) => alert.id === closure.id || alert.relatedPlannedClosureId === closure.id)) return false;
    const start = Date.parse(closure.nextWindowStart || "");
    const end = Date.parse(closure.nextWindowEnd || "");
    if (!closure.nextWindowStart && !closure.nextWindowEnd) return true;
    return now > 0 && Number.isFinite(start) && Number.isFinite(end)
      && end > start && end > now && start > now + 24 * 60 * 60 * 1000;
  }).sort((a, b) => Date.parse(a.nextWindowStart || "") - Date.parse(b.nextWindowStart || "") || a.id.localeCompare(b.id));

  // Stable within severity and line: source timestamp changes must not move a row.
  const lineOrder = new Map(data.lineStatuses.map((line, index) => [line.id, index]));
  rows.sort((a, b) => a.priority - b.priority || (lineOrder.get(a.lineId) ?? 99) - (lineOrder.get(b.lineId) ?? 99) || a.id.localeCompare(b.id));
  const affected = new Set([...rows.map((row) => row.lineId), ...(data.reducedSpeedZones ?? []).map((rsz) => rsz.lineId)]);
  return { fresh, rows: data.snapshot ? rows.map((row) => ({ ...row, condition: `Last reported: ${row.condition}`, timing: undefined, timingTarget: undefined })) : rows, unaffected: fresh ? data.lineStatuses.filter((line) => !affected.has(line.id)) : [], upcoming };
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

  let title = "Suspension";
  if (row.serviceEffect === "limited-service") {
    title = serviceEffectLabel(row, row.priority === 2);
  } else if (
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
    title = "Suspension";
  } else {
    title = rawCondition;
  }

  return isSnapshot ? `Last reported: ${title}` : title;
}

/** Compact incident copy shared by desktop and mobile status views. */
export function currentServiceIncidentPresentation(row: CurrentServiceRow) {
  const title = getCanonicalAlertTitle(row)
    .replace(/\blimited service\b/i, "Limited Service")
    .replace("Planned Closure in Effect", "Planned Closure · In Effect")
    .replace(/Planned Closure$/, "Planned Closure · Upcoming")
    .replace("Suspension", row.condition.endsWith("No Service") ? "No Service" : "Suspension")
    .replace("Last reported:", "Last Reported:");
  const timing = row.timing;
  return {
    title,
    timing: timing && row.priority === 2 && !/^(Starts|Ends) /.test(timing)
      ? `Starts ${timing}`
      : timing,
  };
}

export type LineStatusPresentationState =
  | "normal"
  | "reduced-speed-zones"
  | "running"
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
  advisoryCount?: number;
  qualifiers?: { kind: "reduced-speed-zones" | "planned-closure"; label: string }[];
};

export function lineStatusDescription(presentation: LineStatusPresentation): string {
  return [
    presentation.label,
    ...(presentation.qualifiers ?? []).map(({ label }) => label),
    ...(presentation.advisoryCount ? [`+ ${lineAdvisoryCountLabel(presentation.advisoryCount)}`] : []),
  ].join(", ");
}

export function lineAdvisoryCountLabel(count: number): string {
  return `${count} ${count === 1 ? "advisory" : "advisories"}`;
}

export function getLineStatusPresentation(
  line: LineStatus,
  data: CurrentServiceData,
  summary: { fresh: boolean; rows: CurrentServiceRow[]; upcoming?: PlannedClosure[] },
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
  const closureCount = (summary.upcoming ?? []).filter((closure) => closure.lineId === line.id).length;
  if (rszList.length > 0 || closureCount > 0) {
    const rszCount = countReducedSpeedZones(rszList);
    const qualifiers: NonNullable<LineStatusPresentation["qualifiers"]> = [];
    if (rszList.length > 0) qualifiers.push({ kind: "reduced-speed-zones", label: "Speed zones" });
    if (closureCount > 0) qualifiers.push({ kind: "planned-closure", label: "Advisory planned" });
    return {
      state: rszList.length > 0 ? "reduced-speed-zones" : "running",
      label: "Normal Service",
      isNormal: false,
      hasRsz: rszList.length > 0,
      rszCount: rszList.length > 0 ? rszCount : undefined,
      advisoryCount: rszCount + closureCount,
      qualifiers,
    };
  }

  return {
    state: "normal",
    label: "Normal Service",
    isNormal: true,
    hasRsz: false,
  };
}

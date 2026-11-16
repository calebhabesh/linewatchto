import { alertCauseReason } from "./alert-cause.ts";
import type { AccountMatchedImpact } from "./commute-data.ts";
import type { DashboardData } from "./dashboard-contract.ts";
import type { PlannedClosure } from "./linewatch-data.ts";
import { formatScheduleMoment, plannedAdvisorySchedule } from "./planned-advisory-schedule.ts";

/**
 * The key facts an Active Disruptions row shows under its stretch (My Commutes
 * and My Stations), so the list answers "when, why, and how do I get around"
 * without opening View Alert.
 */
export type DisruptionRowFacts = {
  /** "Nights Mon, Nov 16 – Wed, Nov 18 · 11:00 PM – 3:30 AM", "Until …", "Starts …", "Started …". */
  when: string | null;
  /** The source's cause, category prefix removed ("Track Work"); callers title-case it. */
  cause: string | null;
  shuttle: boolean;
  /** A slow zone's reduced speed, with its unit: "25 km/h". */
  reducedSpeed: string | null;
};

type ClosureTiming = Pick<
  PlannedClosure,
  | "serviceEffect" | "activeNow" | "nightly" | "activeWindowStart" | "activeWindowEnd" | "nextWindowStart"
  | "nextWindowEnd" | "windowDates" | "windowHours" | "windowCount" | "lastWindowEnd" | "window"
>;

/** A planned advisory's "when", in one line: the series, or the one window's start or end. */
export function plannedClosureWhen(closure: ClosureTiming): string | null {
  const schedule = plannedAdvisorySchedule(closure);
  if (schedule) {
    const dates = schedule.rows.find((row) => row.label === "Nights" || row.label === "Dates");
    if (dates) {
      const hours = closure.windowHours?.trim();
      return `${dates.label} ${dates.value}${hours ? ` · ${hours}` : ""}`;
    }
    const resumes = schedule.rows.find((row) => row.label === "Regular Service Resumes" || row.label === "Ends");
    if (closure.activeNow && resumes) return `${resumes.label === "Ends" ? "Ends" : "Until"} ${resumes.value}`;
    const starts = schedule.rows.find((row) => row.label === "Starts" || row.label === "Started");
    if (starts) return `${starts.label} ${starts.value}`;
  }
  return closure.window?.trim() || null;
}

/** The feed publishes bare numbers ("25"); the cards add the unit, and so does the row. */
export function withSpeedUnit(value: string | null | undefined): string | null {
  const speed = value?.trim();
  if (!speed) return null;
  return /km\/h/i.test(speed) ? speed : `${speed} km/h`;
}

function startedWhen(startedAt: string | null | undefined): string | null {
  const moment = formatScheduleMoment(startedAt);
  return moment ? `Started ${moment}` : null;
}

function hasFacts(facts: DisruptionRowFacts): boolean {
  return Boolean(facts.when || facts.cause || facts.shuttle || facts.reducedSpeed);
}

/**
 * Facts from the full dashboard record behind a row (`id` is a matched impact,
 * alert, delay, slow zone or planned advisory id). An alert or delay standing
 * for a planned advisory in effect takes the advisory's schedule.
 */
export function dashboardDisruptionFacts(
  id: string,
  dashboard: Pick<DashboardData, "activeAlerts" | "delays" | "reducedSpeedZones" | "plannedClosures">,
): DisruptionRowFacts | null {
  const incident = dashboard.activeAlerts.find((alert) => alert.id === id || alert.relatedPlannedClosureId === id)
    ?? dashboard.delays.find((delay) => delay.id === id || delay.relatedPlannedClosureId === id);
  const closure = dashboard.plannedClosures.find((item) => item.id === id)
    ?? (incident?.relatedPlannedClosureId
      ? dashboard.plannedClosures.find((item) => item.id === incident.relatedPlannedClosureId)
      : undefined);
  const zone = !incident && !closure
    ? dashboard.reducedSpeedZones.find((item) => item.id === id || item.sourceAlertIds.includes(id))
    : undefined;

  const facts: DisruptionRowFacts = zone
    ? {
      when: startedWhen(zone.startedAt),
      cause: alertCauseReason(zone.cause ?? zone.reason),
      shuttle: false,
      reducedSpeed: withSpeedUnit(zone.reducedSpeed),
    }
    : {
      when: closure ? plannedClosureWhen(closure) : startedWhen(incident?.startedAt),
      cause: alertCauseReason(incident?.cause ?? closure?.cause ?? null),
      shuttle: Boolean(incident?.shuttle || closure?.shuttle),
      reducedSpeed: null,
    };
  return hasFacts(facts) ? facts : null;
}

/**
 * Facts from a commute's matched impact alone, when the dashboard on screen is
 * another network's: a planned advisory's published dates and hours, otherwise
 * when it started. The commute API keeps cause and shuttle server-side.
 */
export function matchedImpactFacts(impact: AccountMatchedImpact): DisruptionRowFacts | null {
  let when: string | null;
  if (impact.kind === "planned-closure") {
    const dates = impact.closureDates?.trim();
    const hours = impact.closureHours?.trim();
    when = dates
      ? `${dates}${hours ? ` · ${hours}` : ""}`
      : impact.window?.trim() || (impact.status === "planned" && formatScheduleMoment(impact.eventStartAt)
        ? `Starts ${formatScheduleMoment(impact.eventStartAt)}`
        : startedWhen(impact.startedAt));
  } else {
    when = startedWhen(impact.startedAt);
  }
  const facts: DisruptionRowFacts = { when, cause: null, shuttle: false, reducedSpeed: null };
  return hasFacts(facts) ? facts : null;
}

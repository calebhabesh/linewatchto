import type { PlannedClosure } from "./linewatch-data";

const torontoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });
const torontoDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric" });
const torontoHour = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" });
const EVENING_START_HOUR = 17;

export function plannedAdvisoryStatus(closure: Pick<PlannedClosure, "nextWindowStart" | "nightly" | "timingStatus">, now: number | null): string {
  if (!closure.nextWindowStart) return closure.timingStatus === "unknown" ? "Schedule Incomplete" : "Upcoming";
  const next = Date.parse(closure.nextWindowStart);
  if (!Number.isFinite(next)) return "Schedule Incomplete";
  if (now !== null && next > now && torontoDay.format(next) === torontoDay.format(now)) {
    // One-off evening closures are "tonight" too, not only nightly series.
    return closure.nightly || Number(torontoHour.format(next)) >= EVENING_START_HOUR ? "Next Tonight" : "Later Today";
  }
  return `Next: ${torontoDate.format(next)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function torontoDayNumber(time: number) {
  const [year, month, day] = torontoDay.format(time).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/**
 * How soon a planned advisory starts, for the Upcoming cards' pill and the
 * title of one that becomes a Current Service card within 24 hours ("Planned
 * Closure · Tonight"). Calendar days in Toronto, so a Saturday start reads
 * "In 6 Days" all Sunday. A start from 5 PM is "Tonight" or "Tomorrow Night",
 * as plannedAdvisoryStatus says "Next Tonight": a Monday 11:59 PM closure,
 * still over 24 hours away on Sunday morning and so not yet a Current Service
 * card, reads as a night.
 */
export function upcomingCountdown(start: number, now: number): string | undefined {
  if (!Number.isFinite(start) || !Number.isFinite(now) || now <= 0 || start <= now) return undefined;
  const days = torontoDayNumber(start) - torontoDayNumber(now);
  const evening = Number(torontoHour.format(start)) >= EVENING_START_HOUR;
  if (days <= 0) return evening ? "Tonight" : "Today";
  if (days === 1) return evening ? "Tomorrow Night" : "Tomorrow";
  if (days < 14) return `In ${days} Days`;
  return `In ${Math.floor(days / 7)} Weeks`;
}

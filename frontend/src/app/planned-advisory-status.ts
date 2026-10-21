import type { PlannedClosure } from "./linewatch-data";

const torontoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });
const torontoDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric" });
const torontoHour = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" });
const EVENING_START_HOUR = 17;

export function plannedAdvisoryStatus(closure: Pick<PlannedClosure, "nextWindowStart" | "nightly" | "timingStatus">, now: number | null): string {
  if (!closure.nextWindowStart) return closure.timingStatus === "unknown" ? "Schedule incomplete" : "Upcoming";
  const next = Date.parse(closure.nextWindowStart);
  if (!Number.isFinite(next)) return "Schedule incomplete";
  if (now !== null && next > now && torontoDay.format(next) === torontoDay.format(now)) {
    // One-off evening closures are "tonight" too, not only nightly series.
    return closure.nightly || Number(torontoHour.format(next)) >= EVENING_START_HOUR ? "Next Tonight" : "Later Today";
  }
  return `Next: ${torontoDate.format(next)}`;
}

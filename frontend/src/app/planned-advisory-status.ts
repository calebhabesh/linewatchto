import type { PlannedClosure } from "./linewatch-data";

const torontoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" });
const torontoDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric" });

export function plannedAdvisoryStatus(closure: Pick<PlannedClosure, "nextWindowStart" | "nightly" | "timingStatus">, now: number | null): string {
  if (!closure.nextWindowStart) return closure.timingStatus === "unknown" ? "Schedule incomplete" : "Upcoming";
  const next = Date.parse(closure.nextWindowStart);
  if (!Number.isFinite(next)) return "Schedule incomplete";
  if (now !== null && next > now && closure.nightly && torontoDay.format(next) === torontoDay.format(now)) return "Next Tonight";
  return `Next: ${torontoDate.format(next)}`;
}

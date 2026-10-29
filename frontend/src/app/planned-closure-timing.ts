import type { PlannedClosure } from "./linewatch-data";

// Placeholder windows that carry no dates or times of their own.
const GENERIC_WINDOWS = new Set(["Nightly closure windows", "Closure timing unavailable", "Timing TBD"]);

type PlannedClosureTiming = { dates: string | null; time: string | null };

/** Splits a planned closure's schedule into a date part and an explicit time part for compact lists. */
export function plannedClosureTiming(
  closure: Pick<PlannedClosure, "windowDates" | "windowHours" | "window" | "nightly">,
): PlannedClosureTiming {
  const dates = closure.windowDates?.trim() || null;
  const hours = closure.windowHours?.trim() || null;
  const window = closure.window?.trim() || null;
  const concreteWindow = window && !GENERIC_WINDOWS.has(window) ? window : null;

  if (dates && hours) {
    if (/^varies/i.test(hours)) return { dates, time: "Times Vary by Date" };
    if (/^all day/i.test(hours)) return { dates, time: hours };
    return { dates, time: closure.nightly ? `Nightly ${hours}` : hours };
  }
  // Multi-day windows have no daily hours; their full window already names the start and end.
  if (concreteWindow) return { dates: concreteWindow, time: null };
  return { dates, time: null };
}

/**
 * Shared wording for arrival tiles on every network (TTC subway, TTC/GO
 * surface, GO/UP rail), so the same moment reads the same everywhere.
 */

/** Inside this window the nearest live arrival shows a minute range instead of one number. */
export const NEAR_ARRIVAL_RANGE_SECONDS = 120;

/**
 * Whether a prediction is close enough for the range. Timetable-only rows
 * never qualify: a range implies a live estimate we do not have.
 */
export function isNearLiveArrival(status: string | null | undefined, secondsUntilArrival: number): boolean {
  return status === "live" && secondsUntilArrival > 0 && secondsUntilArrival < NEAR_ARRIVAL_RANGE_SECONDS;
}

/**
 * Whole-minute range for a train that is almost here. Predictions this close
 * are only good to about a minute, so seconds would claim false precision.
 */
export function formatNearArrivalRange(secondsUntilArrival: number): string {
  return secondsUntilArrival < 60 ? "<1 min" : "1–2 min";
}

/** "Due", "4 min", "1 hr", "1 hr 5 min". */
export function formatArrivalMinutes(minutes: number): string {
  if (minutes <= 0) return "Due";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours} hr` : `${hours} hr ${remainingMinutes} min`;
}

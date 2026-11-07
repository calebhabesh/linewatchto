import { plannedAdvisoryEffect } from "./alert-categories.ts";
import type { PlannedClosure } from "./linewatch-data.ts";

/** `moment` values are already laid out (each date and time kept on one line); text values are source labels. */
export type PlannedScheduleRow = { label: string; value: string; moment?: boolean };

/**
 * The "when" of a planned advisory, worded so nobody mistakes one window for the
 * whole advisory.
 *
 * - One window: "Next Closure" with Starts / Regular Service Resumes, led by the
 *   days it covers when it runs across more than one ("Closed: All day, Sat,
 *   Nov 14 – Sun, Nov 15").
 * - A series: the whole series first (Nights, Each Night), then the next or
 *   current window as one self-contained row, then when regular service returns
 *   after the last window.
 *
 * Null when the source gives no exact window, so callers keep the published
 * date/hour labels instead.
 */
export type PlannedScheduleView = {
  heading: string;
  /** Names the current or next window ("Next Closure"), for compact list facts. */
  windowLabel: string;
  rows: PlannedScheduleRow[];
};

type ScheduleInput = Pick<
  PlannedClosure,
  | "serviceEffect"
  | "activeNow"
  | "nightly"
  | "activeWindowStart"
  | "activeWindowEnd"
  | "nextWindowStart"
  | "nextWindowEnd"
  | "windowDates"
  | "windowHours"
  | "windowCount"
  | "lastWindowEnd"
>;

const TORONTO_TIME_ZONE = "America/Toronto";
const dateFormat = new Intl.DateTimeFormat("en-US", { timeZone: TORONTO_TIME_ZONE, weekday: "short", month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: TORONTO_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true });
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TORONTO_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const NBSP = " ";

function parseTimestamp(timestamp: string | null | undefined): Date | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Mon, Nov 9 · 11:59 PM" in Toronto time, kept on one line. */
export function formatScheduleMoment(timestamp: string | null | undefined): string | null {
  const date = parseTimestamp(timestamp);
  if (!date) return null;
  const day = dateFormat.format(date).replace(/\s+/g, NBSP);
  const time = timeFormat.format(date).replace(/[\s ]+/g, NBSP);
  return `${day}${NBSP}·${NBSP}${time}`;
}

function effectNoun(input: ScheduleInput): string {
  const effect = plannedAdvisoryEffect(input);
  if (effect === "closure") return "Closure";
  if (effect === "limited-service") return "Limited Service";
  return "Window";
}

function isSeries(input: ScheduleInput): boolean {
  // Without a window count (older payloads, GO/UP notices) a nightly flag is the only evidence of a series.
  return typeof input.windowCount === "number" ? input.windowCount > 1 : Boolean(input.nightly);
}

/** "11:59 PM – 3:30 AM the next morning" when the window crosses midnight. */
function hoursValue(hours: string, start: Date | null, end: Date | null): string {
  const crossesMidnight = start && end && dayKeyFormat.format(start) !== dayKeyFormat.format(end);
  if (!crossesMidnight || /^all day/i.test(hours) || !/\s[–—-]\s/.test(hours)) return hours;
  return `${hours} the next morning`;
}

const DATE_RANGE = /^([^;]+?)\s[–—-]\s([^;]+)$/;

/**
 * The service days one continuous window covers, when it covers more than one:
 * "All day, Sat, Nov 14 – Sun, Nov 15".
 */
function spanValue(dates: string | undefined, hours: string | undefined): string | null {
  if (!dates) return null;
  const match = dates.match(DATE_RANGE);
  if (!match || match[1].trim() === match[2].trim()) return null;
  return hours && /^all day/i.test(hours) ? `All day, ${dates}` : `Continuously, ${dates}`;
}

function spanLabel(input: ScheduleInput): string {
  const effect = plannedAdvisoryEffect(input);
  if (effect === "closure") return "Closed";
  if (effect === "limited-service") return "Limited Service";
  return "Dates";
}

export function plannedAdvisorySchedule(input: ScheduleInput): PlannedScheduleView | null {
  const current = Boolean(input.activeNow);
  const startDate = parseTimestamp(current ? input.activeWindowStart : input.nextWindowStart);
  const endDate = parseTimestamp(current ? input.activeWindowEnd : input.nextWindowEnd);
  const start = formatScheduleMoment(current ? input.activeWindowStart : input.nextWindowStart);
  if (!start) return null;
  const end = formatScheduleMoment(current ? input.activeWindowEnd : input.nextWindowEnd);
  const noun = effectNoun(input);
  const windowLabel = `${current ? "Current" : "Next"} ${noun}`;
  // Only an established closure or limited service may promise regular service afterwards.
  const knownEffect = Boolean(plannedAdvisoryEffect(input));
  const returnLabel = knownEffect ? "Regular Service Resumes" : "Ends";
  const dates = input.windowDates?.trim();

  if (!isSeries(input) || !dates) {
    const span = spanValue(dates, input.windowHours?.trim());
    return {
      heading: windowLabel,
      windowLabel,
      rows: [
        ...(span ? [{ label: spanLabel(input), value: span }] : []),
        { label: current ? "Started" : "Starts", value: start, moment: true },
        ...(end ? [{ label: returnLabel, value: end, moment: true }] : []),
      ],
    };
  }

  const nightly = Boolean(input.nightly);
  const hours = input.windowHours?.trim();
  const finalReturn = formatScheduleMoment(input.lastWindowEnd);
  return {
    heading: knownEffect ? `${noun} Schedule` : "Advisory Schedule",
    windowLabel,
    rows: [
      { label: nightly ? "Nights" : "Dates", value: dates },
      ...(hours ? [{ label: nightly ? "Each Night" : "Each Day", value: hoursValue(hours, startDate, endDate) }] : []),
      { label: windowLabel, value: end ? `${start} – ${end}` : `From ${start}`, moment: true },
      ...(finalReturn ? [{ label: knownEffect ? "Regular Service Resumes" : "Last Window Ends", value: finalReturn, moment: true }] : []),
    ],
  };
}

import { plannedAdvisoryHeader, replacementServiceLabel, shuttleServiceLabel } from "./current-service.ts";
import { alertCauseReason } from "./alert-cause.ts";
import { upcomingCountdown } from "./planned-advisory-status.ts";
import type { PlannedClosure } from "./linewatch-data.ts";
import { commutesByTripTimes, type ImpactCommute } from "./commute-data.ts";

/**
 * Compact sidebar preview of a planned advisory that starts more than 24 hours
 * out (sooner ones are full Current Service cards): what, where, which way and
 * why (one line), one line for when, how soon, and what replaces trains. Times come from the published
 * window only; undated notices keep the source's labels or say none are listed.
 */
export type UpcomingAdvisoryPreview = {
  id: string;
  lineId: string;
  title: string;
  /** "Tomorrow", "Tomorrow Night", "In 6 Days", "In 2 Weeks"; absent without a dated window. */
  countdown?: string;
  location: string;
  /** "Eastbound & Westbound", "Northbound", "Entire Line", in the incident cards' amber. */
  direction?: string;
  /** The source's reason without TTC's "Closure -" prefix ("Tunnel Improvements"); absent when none is supplied. */
  cause?: string;
  /** "Thu, Nov 19 at 11:00 PM – Fri, Nov 20 at 3:30 AM", "Sat, Nov 21 – Sun, Nov 22 at 8:00 AM", "Sat, Nov 28 – Sun, Nov 29". */
  when: string;
  /** Future tense: "Shuttle Buses Will Run", "GO Buses Will Replace Trains"; absent when the source names none. */
  replacement?: string;
  /** soon: starts within 7 days; later: further out; undated: no exact window. */
  horizon: "soon" | "later" | "undated";
};

type PreviewInput = Pick<
  PlannedClosure,
  | "id"
  | "lineId"
  | "title"
  | "location"
  | "displayDirection"
  | "cause"
  | "reason"
  | "serviceEffect"
  | "shuttle"
  | "nightly"
  | "nextWindowStart"
  | "nextWindowEnd"
  | "windowDates"
  | "windowHours"
  | "windowCount"
  | "replacementService"
>;

const TORONTO = "America/Toronto";
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TORONTO, year: "numeric", month: "2-digit", day: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("en-US", { timeZone: TORONTO, weekday: "short", month: "short", day: "numeric" });
const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: TORONTO, hour: "numeric", minute: "2-digit", hour12: true });
const DAY_MS = 24 * 60 * 60 * 1000;
const SOON_MS = 7 * DAY_MS;
const hourFormat = new Intl.DateTimeFormat("en-US", { timeZone: TORONTO, hour: "numeric", minute: "numeric", hourCycle: "h23" });

function torontoDayNumber(time: number) {
  const [year, month, day] = dayKeyFormat.format(time).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/**
 * "3:30 AM" on the start day, else the end's date too, overnight windows
 * included: "Sat, Nov 21 at 3:30 AM". A time joins its date with "at"; a dot
 * separates only dates from a series' hours.
 */
function endMoment(start: number, end: number) {
  const time = timeFormat.format(end);
  if (torontoDayNumber(end) === torontoDayNumber(start)) return time;
  return `${dateFormat.format(end)} at ${time}`;
}

function isTorontoMidnight(time: number) {
  return hourFormat.format(time) === "00:00";
}

/** "Wed, Nov 25 – Fri, Nov 27" → "Nov 25 – Nov 27", so a series' line stays short. */
function withoutWeekdays(dates: string) {
  return dates.replace(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*/g, "");
}

/** One line for when it happens; the countdown says how soon. */
function previewWhen(input: PreviewInput, start: number): string {
  const dates = input.windowDates?.trim();
  const hours = input.windowHours?.trim();
  const count = typeof input.windowCount === "number" ? input.windowCount : null;
  const series = count !== null ? count > 1 : Boolean(input.nightly);

  // Undated: the source's own labels, or a plain statement that none are listed.
  if (!Number.isFinite(start)) {
    const listed = [dates || "Dates Not Listed", hours].filter(Boolean).join(" · ");
    return input.nightly ? `Nightly · ${listed}` : listed;
  }

  if (series) {
    const range = withoutWeekdays(dates || dateFormat.format(start));
    const every = hours ? `${input.nightly ? "Nightly" : "Daily"} ${hours}` : input.nightly ? "Nightly" : "";
    return [range, every].filter(Boolean).join(" · ");
  }

  const end = Date.parse(input.nextWindowEnd || "");
  if (!Number.isFinite(end) || end <= start) return `${dateFormat.format(start)} from ${timeFormat.format(start)}`;
  // A window from midnight to midnight gives days, not times ("this weekend" notices).
  if (isTorontoMidnight(start) && isTorontoMidnight(end)) {
    const lastDay = end - DAY_MS / 2;
    return torontoDayNumber(lastDay) === torontoDayNumber(start)
      ? dateFormat.format(start)
      : `${dateFormat.format(start)} – ${dateFormat.format(lastDay)}`;
  }
  // "All Day" closures are stored from midnight, but trains still run the night before
  // until close, so the line starts at the day, not 12:00 AM.
  if (/^all day\b/i.test(hours ?? "")) return `${dateFormat.format(start)} – ${endMoment(start, end)}`;
  return `${dateFormat.format(start)} at ${timeFormat.format(start)} – ${endMoment(start, end)}`;
}


/** The advisory has not started, so replacement service is stated in the future tense. */
function upcomingReplacement(input: PreviewInput) {
  return replacementServiceLabel(input.replacementService, true) ?? (input.shuttle ? shuttleServiceLabel(true) : undefined);
}

export function upcomingAdvisoryPreview(input: PreviewInput, now: number): UpcomingAdvisoryPreview {
  const start = Date.parse(input.nextWindowStart || "");
  const dated = Number.isFinite(start);
  return {
    id: input.id,
    lineId: input.lineId,
    title: plannedAdvisoryHeader(input),
    countdown: dated ? upcomingCountdown(start, now) : undefined,
    location: input.location || input.title,
    direction: input.displayDirection?.trim() || undefined,
    cause: alertCauseReason(input.cause ?? input.reason) ?? undefined,
    when: previewWhen(input, start),
    replacement: upcomingReplacement(input),
    horizon: !dated ? "undated" : start - now <= SOON_MS ? "soon" : "later",
  };
}

/** A saved commute named as one: "Work Commute"; a name already ending in "commute" stays ("Morning commute"). */
export function commuteDisplayName(label: string) {
  const name = label.trim();
  return /commute$/i.test(name) ? name : `${name} Commute`;
}

function commuteNames(commutes: ImpactCommute[]) {
  return commutes.length === 1 ? commuteDisplayName(commutes[0].label) : `${commutes.length} of My Commutes`;
}

/**
 * "Affects Work Commute", or "Affects 2 of My Commutes" when several saved
 * commutes cross it. Upcoming work that meets them only outside their trip
 * times reads "On Work Commute, Outside Trip Times".
 */
export function commuteTagLabel(commutes: ImpactCommute[]) {
  const { during, outside } = commutesByTripTimes(commutes);
  return during.length > 0 ? `Affects ${commuteNames(during)}` : `On ${commuteNames(outside)}, Outside Trip Times`;
}

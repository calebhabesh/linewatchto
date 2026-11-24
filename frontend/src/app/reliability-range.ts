/**
 * Range and URL state for the analytics pages. Dates are Toronto service dates as
 * `YYYY-MM-DD`; arithmetic is on calendar dates in UTC, so the 23- and 25-hour
 * daylight-saving days never shift a range. "Today" always comes from the server.
 */

export const ANALYTICS_PRESETS = ["30d", "90d", "6m", "ytd", "12m", "all", "custom"] as const;
export type AnalyticsPreset = (typeof ANALYTICS_PRESETS)[number];
export const DEFAULT_ANALYTICS_PRESET: AnalyticsPreset = "30d";

export type AnalyticsQuery = {
  preset: AnalyticsPreset;
  /** Set only for `custom`. */
  from: string | null;
  to: string | null;
  line: string | null;
  /** Set only with `line`. */
  station: string | null;
  compare: boolean;
};

export const defaultAnalyticsQuery: AnalyticsQuery = {
  preset: DEFAULT_ANALYTICS_PRESET,
  from: null,
  to: null,
  line: null,
  station: null,
  compare: false,
};

/** Lines the network has, each with its stations: what `line` and `station` may name. */
export type AnalyticsLineOption = {
  id: string;
  number: string;
  name: string;
  stations: { id: string; name: string }[];
};

export type AnalyticsRangeBounds = { today: string; firstAnalyzableDate: string | null };

export type ResolvedAnalyticsRange = {
  /** The dates asked for, up to today. */
  requestedFrom: string;
  requestedTo: string;
  /** The dates to read, or null when the whole range is before history. */
  from: string | null;
  to: string | null;
  clipped: boolean;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function utc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A real calendar date written `YYYY-MM-DD` (Feb 30 is refused). */
export function isServiceDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE.test(value) || value < "1900-01-01") return false;
  const parsed = utc(value);
  return !Number.isNaN(parsed.getTime()) && iso(parsed) === value;
}

export function addServiceDays(date: string, days: number): string {
  const value = utc(date);
  value.setUTCDate(value.getUTCDate() + days);
  return iso(value);
}

/** The same day of an earlier or later month, or that month's last day when it is shorter. */
export function addServiceMonths(date: string, months: number): string {
  const value = utc(date);
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(day, lastDay));
  return iso(value);
}

/** Dates from `from` to `to`, both counted. */
export function serviceDayCount(from: string, to: string): number {
  return Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000) + 1;
}

export function parseAnalyticsQuery(search: string, lines?: readonly AnalyticsLineOption[]): AnalyticsQuery {
  const params = new URLSearchParams(search);
  const rangeParam = params.get("range");
  let preset = ANALYTICS_PRESETS.find((value) => value === rangeParam) ?? DEFAULT_ANALYTICS_PRESET;
  let from: string | null = null;
  let to: string | null = null;
  if (preset === "custom") {
    const fromParam = params.get("from");
    const toParam = params.get("to");
    if (isServiceDate(fromParam) && isServiceDate(toParam)) {
      [from, to] = fromParam <= toParam ? [fromParam, toParam] : [toParam, fromParam];
    } else {
      preset = DEFAULT_ANALYTICS_PRESET;
    }
  }
  const lineParam = params.get("line") || null;
  const stationParam = params.get("station") || null;
  const option = lines?.find((line) => line.id === lineParam);
  const line = lines ? option?.id ?? null : lineParam;
  const station = !line || !stationParam
    ? null
    : !option || option.stations.some((candidate) => candidate.id === stationParam) ? stationParam : null;
  return { preset, from, to, line, station, compare: params.get("compare") === "1" };
}

/** The query string (with "?"), or "" when everything is the default. */
export function serializeAnalyticsQuery(query: AnalyticsQuery): string {
  const params = new URLSearchParams();
  if (query.preset === "custom" && query.from && query.to) {
    params.set("range", "custom");
    params.set("from", query.from);
    params.set("to", query.to);
  } else if (query.preset !== DEFAULT_ANALYTICS_PRESET && query.preset !== "custom") {
    params.set("range", query.preset);
  }
  if (query.line) {
    params.set("line", query.line);
    if (query.station) params.set("station", query.station);
  }
  if (query.compare) params.set("compare", "1");
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** Switching network keeps the range and comparison; its lines and stations do not carry over. */
export function analyticsQueryForOtherNetwork(query: AnalyticsQuery): AnalyticsQuery {
  return { ...query, line: null, station: null };
}

function requestedRange(query: AnalyticsQuery, bounds: AnalyticsRangeBounds): [string, string] {
  const { today, firstAnalyzableDate } = bounds;
  switch (query.preset) {
    case "90d":
      return [addServiceDays(today, -89), today];
    case "6m":
      return [addServiceDays(addServiceMonths(today, -6), 1), today];
    case "ytd":
      return [`${today.slice(0, 4)}-01-01`, today];
    case "12m":
      return [addServiceDays(addServiceMonths(today, -12), 1), today];
    case "all":
      return [firstAnalyzableDate && firstAnalyzableDate <= today ? firstAnalyzableDate : today, today];
    case "custom":
      if (query.from && query.to) {
        const to = query.to > today ? today : query.to;
        return [query.from > to ? to : query.from, to];
      }
      break;
    default:
      break;
  }
  return [addServiceDays(today, -29), today];
}

/** The preset's service dates, clipped to the network's first analyzable date. */
export function resolveAnalyticsRange(query: AnalyticsQuery, bounds: AnalyticsRangeBounds): ResolvedAnalyticsRange {
  const [requestedFrom, requestedTo] = requestedRange(query, bounds);
  const first = bounds.firstAnalyzableDate;
  if (!first || requestedTo < first) {
    return { requestedFrom, requestedTo, from: null, to: null, clipped: true };
  }
  const clipped = requestedFrom < first;
  return { requestedFrom, requestedTo, from: clipped ? first : requestedFrom, to: requestedTo, clipped };
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const DAY_YEAR_FORMAT = new Intl.DateTimeFormat("en-CA", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
});

function plainMonth(value: string): string {
  return value.replace(/\./g, "");
}

export function formatServiceDate(date: string, withYear = true): string {
  return plainMonth((withYear ? DAY_YEAR_FORMAT : DAY_FORMAT).format(utc(date)));
}

/** "Nov 1–24, 2026", "Oct 26–Nov 24, 2026" or "Dec 2, 2025–Jan 4, 2026". */
export function formatServiceDateRange(from: string, to: string, withYear = true): string {
  if (from === to) return formatServiceDate(from, withYear);
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${formatServiceDate(from)}–${formatServiceDate(to)}`;
  const year = withYear ? `, ${to.slice(0, 4)}` : "";
  const end = from.slice(0, 7) === to.slice(0, 7) ? String(Number(to.slice(8))) : formatServiceDate(to, false);
  return `${formatServiceDate(from, false)}–${end}${year}`;
}

/** Server messages carry ISO dates; riders read "Nov 1, 2026". */
export function formatDatesInMessage(message: string): string {
  return message.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (date) => isServiceDate(date) ? formatServiceDate(date) : date);
}

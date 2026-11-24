/**
 * Range and URL state for the analytics pages. Dates are Toronto service dates as
 * `YYYY-MM-DD`; arithmetic is on calendar dates in UTC, so the 23- and 25-hour
 * daylight-saving days never shift a range. "Today" always comes from the server.
 */

export const ANALYTICS_PRESETS = ["30d", "90d", "6m", "ytd", "12m", "all", "custom"] as const;
export type AnalyticsPreset = (typeof ANALYTICS_PRESETS)[number];
export const DEFAULT_ANALYTICS_PRESET: AnalyticsPreset = "30d";

export type AnalyticsDrilldownClass = "service-stopped" | "delay" | "slow-zone";
export type AnalyticsEpisodeSort = "recent" | "longest";

/** Episode-list drill-down filters driven by chart marks and kept in the URL. */
export type AnalyticsDrilldown = {
  from: string | null;
  to: string | null;
  line: string | null;
  station: string | null;
  disruptionClass: AnalyticsDrilldownClass | null;
  kind: string | null;
  cause: string | null;
  planned: boolean | null;
  completed: boolean | null;
  minMinutes: number | null;
  maxMinutes: number | null;
  dayOfWeek: number | null;
  hour: number | null;
  sort: AnalyticsEpisodeSort;
};

export const emptyAnalyticsDrilldown: AnalyticsDrilldown = {
  from: null,
  to: null,
  line: null,
  station: null,
  disruptionClass: null,
  kind: null,
  cause: null,
  planned: null,
  completed: null,
  minMinutes: null,
  maxMinutes: null,
  dayOfWeek: null,
  hour: null,
  sort: "recent",
};

export type AnalyticsQuery = {
  preset: AnalyticsPreset;
  /** Set only for `custom`. */
  from: string | null;
  to: string | null;
  line: string | null;
  /** Set only with `line`. */
  station: string | null;
  compare: boolean;
  /** Optional episode drill-down filters (omitted from URL when empty). */
  drilldown?: AnalyticsDrilldown;
};

export const defaultAnalyticsQuery: AnalyticsQuery = {
  preset: DEFAULT_ANALYTICS_PRESET,
  from: null,
  to: null,
  line: null,
  station: null,
  compare: false,
};

export function activeDrilldown(query: AnalyticsQuery): AnalyticsDrilldown {
  return query.drilldown ?? emptyAnalyticsDrilldown;
}

export function hasAnalyticsDrilldown(drilldown: AnalyticsDrilldown | undefined | null): boolean {
  if (!drilldown) return false;
  return Boolean(
    drilldown.from || drilldown.to || drilldown.line || drilldown.station
    || drilldown.disruptionClass || drilldown.kind || drilldown.cause
    || drilldown.planned !== null || drilldown.completed !== null
    || drilldown.minMinutes !== null || drilldown.maxMinutes !== null
    || drilldown.dayOfWeek !== null || drilldown.hour !== null
    || drilldown.sort !== "recent",
  );
}

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

const VALID_CLASSES = new Set<AnalyticsDrilldownClass>(["service-stopped", "delay", "slow-zone"]);
const VALID_KINDS = new Set(["suspension", "closure", "planned-closure", "delay", "limited-service", "reduced-speed-zone"]);
const VALID_CAUSE = /^[A-Z0-9_]{1,60}$/;

function parseBoundedInt(raw: string | null, min: number, max: number): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return parsed >= min && parsed <= max ? parsed : null;
}

function parseBoolParam(raw: string | null): boolean | null {
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return null;
}

function parseDrilldown(params: URLSearchParams, lines?: readonly AnalyticsLineOption[]): AnalyticsDrilldown {
  const rawFrom = params.get("epFrom");
  const rawTo = params.get("epTo");
  let from: string | null = null;
  let to: string | null = null;
  if (isServiceDate(rawFrom) && isServiceDate(rawTo)) {
    [from, to] = rawFrom <= rawTo ? [rawFrom, rawTo] : [rawTo, rawFrom];
  } else if (isServiceDate(rawFrom)) {
    from = rawFrom;
    to = rawFrom;
  }

  const rawLine = params.get("epLine") || null;
  const rawStation = params.get("epStation") || null;
  const lineOpt = lines?.find((candidate) => candidate.id === rawLine);
  const line = lines ? lineOpt?.id ?? null : rawLine;
  const station = !rawStation
    ? null
    : line
      ? !lineOpt || lineOpt.stations.some((candidate) => candidate.id === rawStation) ? rawStation : null
      : !lines || lines.some((opt) => opt.stations.some((candidate) => candidate.id === rawStation)) ? rawStation : null;

  const rawClass = params.get("epClass");
  const disruptionClass = rawClass && VALID_CLASSES.has(rawClass as AnalyticsDrilldownClass)
    ? rawClass as AnalyticsDrilldownClass
    : null;
  const rawKind = params.get("epKind")?.toLowerCase() ?? null;
  const kind = rawKind && VALID_KINDS.has(rawKind) ? rawKind : null;
  const rawCause = params.get("epCause")?.toUpperCase() ?? null;
  const cause = rawCause && VALID_CAUSE.test(rawCause) ? rawCause : null;
  const planned = parseBoolParam(params.get("epPlanned"));
  const completed = parseBoolParam(params.get("epCompleted"));
  const parsedMin = parseBoundedInt(params.get("epMin"), 1, 1_000_000);
  const parsedMax = parseBoundedInt(params.get("epMax"), 1, 1_000_000);
  const badBounds = parsedMin !== null && parsedMax !== null && parsedMax < parsedMin;
  const minMinutes = badBounds ? null : parsedMin;
  const maxMinutes = badBounds ? null : parsedMax;
  const dayOfWeek = parseBoundedInt(params.get("epDow"), 1, 7);
  const hour = parseBoundedInt(params.get("epHour"), 0, 23);
  const sort: AnalyticsEpisodeSort = params.get("epSort") === "longest" ? "longest" : "recent";

  return {
    from, to, line, station, disruptionClass, kind, cause, planned, completed,
    minMinutes, maxMinutes, dayOfWeek, hour, sort,
  };
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
  const drilldown = parseDrilldown(params, lines);
  const base: AnalyticsQuery = { preset, from, to, line, station, compare: params.get("compare") === "1" };
  return hasAnalyticsDrilldown(drilldown) ? { ...base, drilldown } : base;
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
  const d = query.drilldown;
  if (d && hasAnalyticsDrilldown(d)) {
    if (d.from) params.set("epFrom", d.from);
    if (d.to && d.to !== d.from) params.set("epTo", d.to);
    if (d.line) params.set("epLine", d.line);
    if (d.station) params.set("epStation", d.station);
    if (d.disruptionClass) params.set("epClass", d.disruptionClass);
    if (d.kind) params.set("epKind", d.kind);
    if (d.cause) params.set("epCause", d.cause);
    if (d.planned !== null) params.set("epPlanned", d.planned ? "1" : "0");
    if (d.completed !== null) params.set("epCompleted", d.completed ? "1" : "0");
    if (d.minMinutes !== null) params.set("epMin", String(d.minMinutes));
    if (d.maxMinutes !== null) params.set("epMax", String(d.maxMinutes));
    if (d.dayOfWeek !== null) params.set("epDow", String(d.dayOfWeek));
    if (d.hour !== null) params.set("epHour", String(d.hour));
    if (d.sort !== "recent") params.set("epSort", d.sort);
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** Switching network keeps the range and comparison; lines, stations and drill-down do not carry over. */
export function analyticsQueryForOtherNetwork(query: AnalyticsQuery): AnalyticsQuery {
  return { preset: query.preset, from: query.from, to: query.to, line: null, station: null, compare: query.compare };
}

/** Returns a query with updated drill-down filters (omitting the field when empty). */
export function withAnalyticsDrilldown(query: AnalyticsQuery, next: AnalyticsDrilldown): AnalyticsQuery {
  if (!hasAnalyticsDrilldown(next)) {
    const rest = { ...query };
    delete rest.drilldown;
    return rest;
  }
  return { ...query, drilldown: next };
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

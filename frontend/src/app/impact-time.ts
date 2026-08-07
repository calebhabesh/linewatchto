const DEFAULT_TIME_ZONE = "America/Toronto";
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

type ImpactTimestampOptions = {
  now?: Date;
  timeZone?: string;
};

function parseImpactDate(timestamp: string): Date | null {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeIntlSpacing(value: string): string {
  return value.replace(/\u202f/g, " ").replace(/\s+/g, " ").trim();
}

function zonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const partValue = (type: string) => Number(parts.find((part) => part.type === type)?.value);

  return {
    day: partValue("day"),
    month: partValue("month"),
    year: partValue("year"),
  };
}

function isSameZonedDay(a: Date, b: Date, timeZone: string): boolean {
  const first = zonedDateParts(a, timeZone);
  const second = zonedDateParts(b, timeZone);
  return first.year === second.year && first.month === second.month && first.day === second.day;
}

function isSameZonedYear(a: Date, b: Date, timeZone: string): boolean {
  return zonedDateParts(a, timeZone).year === zonedDateParts(b, timeZone).year;
}

function formatClockTime(date: Date, timeZone: string): string {
  return normalizeIntlSpacing(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: true,
      minute: "2-digit",
      timeZone,
    }).format(date),
  );
}

function formatDateAnchor(date: Date, now: Date, timeZone: string): string {
  const options: Intl.DateTimeFormatOptions = isSameZonedYear(date, now, timeZone)
    ? { day: "numeric", month: "short", timeZone }
    : { day: "numeric", month: "short", timeZone, year: "numeric" };

  return normalizeIntlSpacing(new Intl.DateTimeFormat("en-US", options).format(date));
}

function formatCompactAge(timestamp: Date, now: Date): string {
  const diffMs = timestamp.getTime() - now.getTime();
  const elapsedMs = Math.abs(diffMs);
  const isFuture = diffMs > 0;
  const wrap = (value: number, unit: string) => (
    isFuture ? `in ${value}${unit}` : `${value}${unit} ago`
  );

  if (elapsedMs < MINUTE_MS) {
    return isFuture ? "now" : "Just Now";
  }

  if (elapsedMs < HOUR_MS) {
    return wrap(Math.max(1, Math.floor(elapsedMs / MINUTE_MS)), "m");
  }

  if (elapsedMs < DAY_MS) {
    return wrap(Math.max(1, Math.floor(elapsedMs / HOUR_MS)), "h");
  }

  if (elapsedMs < WEEK_MS) {
    return wrap(Math.max(1, Math.floor(elapsedMs / DAY_MS)), "d");
  }

  if (elapsedMs < MONTH_MS) {
    return wrap(Math.max(1, Math.floor(elapsedMs / WEEK_MS)), "w");
  }

  if (elapsedMs < YEAR_MS) {
    return wrap(Math.max(1, Math.floor(elapsedMs / MONTH_MS)), "mo");
  }

  return wrap(Math.max(1, Math.floor(elapsedMs / YEAR_MS)), "y");
}

export function formatImpactTimestamp(
  timestamp: string,
  nowOrOptions: Date | ImpactTimestampOptions = new Date(),
): string {
  const date = parseImpactDate(timestamp);
  if (!date) return timestamp;

  const options = nowOrOptions instanceof Date ? { now: nowOrOptions } : nowOrOptions;
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const anchor = isSameZonedDay(date, now, timeZone)
    ? formatClockTime(date, timeZone)
    : `${formatDateAnchor(date, now, timeZone)}, ${formatClockTime(date, timeZone)}`;

  return `${anchor} (${formatCompactAge(date, now)})`;
}

export function formatOperationalDateTime(
  timestamp: string,
  options: ImpactTimestampOptions = {},
): string {
  const date = parseImpactDate(timestamp);
  if (!date) return timestamp;

  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const dateAnchor = formatDateAnchor(date, now, timeZone);
  return `${dateAnchor}, ${formatClockTime(date, timeZone)}`;
}

export function formatFullImpactTimestamp(
  timestamp: string,
  options: ImpactTimestampOptions = {},
): string {
  const date = parseImpactDate(timestamp);
  if (!date) return timestamp;

  return normalizeIntlSpacing(
    new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      hour: "numeric",
      hour12: true,
      minute: "2-digit",
      month: "short",
      timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
      timeZoneName: "short",
      year: "numeric",
    }).format(date),
  );
}

export function formatRelativeImpactTime(
  timestamp: string,
  now = new Date(),
): string {
  const date = parseImpactDate(timestamp);
  if (!date) return timestamp;

  const elapsedMs = Math.max(0, now.getTime() - date.getTime());
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) return "Just Now";
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min${elapsedMinutes === 1 ? "" : "s"} ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    const remainingMinutes = elapsedMinutes % 60;
    const minuteSuffix = remainingMinutes === 1 ? "" : "s";
    const minutePart = remainingMinutes > 0
      ? ` ${remainingMinutes} min${minuteSuffix}`
      : "";
    return `${elapsedHours} hr${elapsedHours === 1 ? "" : "s"}${minutePart} ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) {
    const remainingHours = elapsedHours % 24;
    const hourSuffix = remainingHours === 1 ? "" : "s";
    const hourPart = remainingHours > 0
      ? ` ${remainingHours} hr${hourSuffix}`
      : "";
    return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"}${hourPart} ago`;
  }

  const elapsedMonths = Math.floor(elapsedDays / 30);
  if (elapsedMonths < 1) {
    const elapsedWeeks = Math.floor(elapsedDays / 7);
    return `${elapsedWeeks} week${elapsedWeeks === 1 ? "" : "s"} ago`;
  }

  return `${elapsedMonths} month${elapsedMonths === 1 ? "" : "s"} ago`;
}

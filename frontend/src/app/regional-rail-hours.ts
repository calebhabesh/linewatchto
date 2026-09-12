export type RegionalRailOperatingStatus = "open" | "closed" | "unknown";

export type RegionalRailOperatingState = {
  status: RegionalRailOperatingStatus;
  title: string;
  summary: string;
  nowLabel: string;
  nextResumeLabel: string | null;
  nextResumeTime: string | null;
  minutesUntilResume: number | null;
  nextCloseLabel: string | null;
  nextCloseTime: string | null;
  minutesUntilClose: number | null;
  closingSoon: boolean;
  isWeekendSchedule: boolean;
  operatingHours: {
    upExpress: string;
    coreRail: string;
    peakRail: string;
    caveat: string;
    overnight: string;
  };
};

const TORONTO_TIME_ZONE = "America/Toronto";
const BROAD_NETWORK_CLOSE_MINUTES = 2 * 60 + 30;
const CLOSING_SOON_WINDOW_MINUTES = 90;
const WEEKDAY_RESUME_MINUTES = 4 * 60 + 55;
const WEEKEND_RESUME_MINUTES = 6 * 60;

const WEEKDAY_INDEX_BY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const TORONTO_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  hourCycle: "h23",
  minute: "2-digit",
  timeZone: TORONTO_TIME_ZONE,
  weekday: "short",
});

export function getRegionalRailOperatingState(now = new Date()): RegionalRailOperatingState {
  const { weekdayIndex, minutesAfterMidnight } = getTorontoLocalTimeParts(now);
  const isWeekendSchedule = weekdayIndex === 0 || weekdayIndex === 6;
  const resumeMinutes = isWeekendSchedule ? WEEKEND_RESUME_MINUTES : WEEKDAY_RESUME_MINUTES;
  const closed = minutesAfterMidnight >= BROAD_NETWORK_CLOSE_MINUTES
    && minutesAfterMidnight < resumeMinutes;
  const nextResumeTime = closed ? formatRegionalRailClock(resumeMinutes) : null;
  const minutesUntilResume = closed ? resumeMinutes - minutesAfterMidnight : null;
  const nextCloseTime = closed ? null : formatRegionalRailClock(BROAD_NETWORK_CLOSE_MINUTES);
  const minutesUntilClose = closed ? null : calculateMinutesUntilClose(minutesAfterMidnight);
  const closingSoon = minutesUntilClose !== null
    && minutesUntilClose <= CLOSING_SOON_WINDOW_MINUTES;

  return {
    status: closed ? "closed" : "open",
    title: closed ? "Regional rail closed overnight" : "Regional rail operating window",
    summary: closed
      ? "Regular GO and UP passenger rail service is outside the broad overnight operating window."
      : "At least part of the GO and UP rail network may be inside its scheduled operating window.",
    nowLabel: formatRegionalRailClock(minutesAfterMidnight),
    nextResumeLabel: nextResumeTime ? `Today at ${nextResumeTime}` : null,
    nextResumeTime,
    minutesUntilResume,
    nextCloseLabel: nextCloseTime ? `Today at ${nextCloseTime}` : null,
    nextCloseTime,
    minutesUntilClose,
    closingSoon,
    isWeekendSchedule,
    operatingHours: {
      upExpress: "UP Express from Union: 4:55 A.M. weekdays; 6:00 A.M. weekends – 1:00 A.M.",
      coreRail: "GO all-day rail: first and last trains vary by corridor, direction, and day.",
      peakRail: "Milton and Richmond Hill: weekday peak-direction train service.",
      caveat: "Exact first and last train times vary by corridor, station, direction, holidays, and service changes.",
      overnight: "Some GO bus and local transit options may operate while trains are not running. Check the official trip planner.",
    },
  };
}

export function isRegionalRailClosed(now = new Date()) {
  return getRegionalRailOperatingState(now).status === "closed";
}

export function getLocalRegionalRailPreviewDate(urlValue: string) {
  let url: URL;

  try {
    url = new URL(urlValue);
  } catch {
    return null;
  }

  if (!isLocalPreviewHost(url.hostname)) {
    return null;
  }

  const previewTime = url.searchParams.get("previewTime");
  if (!previewTime) {
    return null;
  }

  const previewDate = new Date(previewTime);
  return Number.isNaN(previewDate.getTime()) ? null : previewDate;
}

function formatRegionalRailClock(minutesAfterMidnight: number) {
  const hour24 = Math.floor(minutesAfterMidnight / 60) % 24;
  const minute = minutesAfterMidnight % 60;
  const hour12 = hour24 % 12 || 12;
  const period = hour24 < 12 ? "AM" : "PM";

  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

function getTorontoLocalTimeParts(date: Date) {
  const parts = TORONTO_PARTS_FORMATTER.formatToParts(date);
  const getPart = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = getPart("weekday");
  const hour = Number(getPart("hour"));
  const minute = Number(getPart("minute"));

  return {
    weekdayIndex: WEEKDAY_INDEX_BY_SHORT[weekday] ?? 0,
    minutesAfterMidnight: hour * 60 + minute,
  };
}

function calculateMinutesUntilClose(minutesAfterMidnight: number) {
  if (minutesAfterMidnight < BROAD_NETWORK_CLOSE_MINUTES) {
    return BROAD_NETWORK_CLOSE_MINUTES - minutesAfterMidnight;
  }

  return 24 * 60 - minutesAfterMidnight + BROAD_NETWORK_CLOSE_MINUTES;
}

function isLocalPreviewHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

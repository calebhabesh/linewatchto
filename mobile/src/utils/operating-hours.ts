export type SubwayOperatingStatus = "open" | "closed";

export type SubwayOperatingState = {
  status: SubwayOperatingStatus;
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
  isSundaySchedule: boolean;
};

export type RegionalRailOperatingStatus = "open" | "closed";

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
};

const TORONTO_TIME_ZONE = "America/Toronto";

// Subway constants
const SUBWAY_CLOSE_MINUTES = 2 * 60; // 2:00 AM
const CLOSING_SOON_WINDOW_MINUTES = 90;
const WEEKDAY_SATURDAY_OPEN_MINUTES = 6 * 60; // 6:00 AM
const SUNDAY_OPEN_MINUTES = 8 * 60; // 8:00 AM

// Regional rail constants
const REGIONAL_CLOSE_MINUTES = 2 * 60 + 30; // 2:30 AM
const REGIONAL_WEEKDAY_RESUME_MINUTES = 4 * 60 + 55; // 4:55 AM
const REGIONAL_WEEKEND_RESUME_MINUTES = 6 * 60; // 6:00 AM

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

export function formatSubwayClock(minutesAfterMidnight: number) {
  const hour24 = Math.floor(minutesAfterMidnight / 60) % 24;
  const minute = minutesAfterMidnight % 60;
  const hour12 = hour24 % 12 || 12;
  const period = hour24 < 12 ? "AM" : "PM";

  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function getSubwayOperatingState(now = new Date()): SubwayOperatingState {
  const { weekdayIndex, minutesAfterMidnight } = getTorontoLocalTimeParts(now);
  const openingMinutes = weekdayIndex === 0 ? SUNDAY_OPEN_MINUTES : WEEKDAY_SATURDAY_OPEN_MINUTES;
  const closed = minutesAfterMidnight >= SUBWAY_CLOSE_MINUTES && minutesAfterMidnight < openingMinutes;
  const nextResumeTime = closed ? formatSubwayClock(openingMinutes) : null;
  const minutesUntilResume = closed ? openingMinutes - minutesAfterMidnight : null;
  const nextCloseTime = closed ? null : formatSubwayClock(SUBWAY_CLOSE_MINUTES);
  const minutesUntilClose = closed ? null : (
    minutesAfterMidnight < SUBWAY_CLOSE_MINUTES
      ? SUBWAY_CLOSE_MINUTES - minutesAfterMidnight
      : 24 * 60 - minutesAfterMidnight + SUBWAY_CLOSE_MINUTES
  );
  const closingSoon = minutesUntilClose !== null && minutesUntilClose <= CLOSING_SOON_WINDOW_MINUTES;

  return {
    status: closed ? "closed" : "open",
    title: closed ? "Subway closed overnight" : "Subway operating",
    summary: closed
      ? "Regular subway service is outside operating hours. The live feed is hidden until service resumes."
      : "Regular subway service is inside the general operating window.",
    nowLabel: formatSubwayClock(minutesAfterMidnight),
    nextResumeLabel: nextResumeTime ? `Today at ${nextResumeTime}` : null,
    nextResumeTime,
    minutesUntilResume,
    nextCloseLabel: nextCloseTime ? `Today at ${nextCloseTime}` : null,
    nextCloseTime,
    minutesUntilClose,
    closingSoon,
    isSundaySchedule: weekdayIndex === 0,
  };
}

export function isSubwayClosed(now = new Date()) {
  return getSubwayOperatingState(now).status === "closed";
}

export function getRegionalRailOperatingState(now = new Date()): RegionalRailOperatingState {
  const { weekdayIndex, minutesAfterMidnight } = getTorontoLocalTimeParts(now);
  const isWeekendSchedule = weekdayIndex === 0 || weekdayIndex === 6;
  const resumeMinutes = isWeekendSchedule ? REGIONAL_WEEKEND_RESUME_MINUTES : REGIONAL_WEEKDAY_RESUME_MINUTES;
  const closed = minutesAfterMidnight >= REGIONAL_CLOSE_MINUTES && minutesAfterMidnight < resumeMinutes;
  const nextResumeTime = closed ? formatSubwayClock(resumeMinutes) : null;
  const minutesUntilResume = closed ? resumeMinutes - minutesAfterMidnight : null;
  const nextCloseTime = closed ? null : formatSubwayClock(REGIONAL_CLOSE_MINUTES);
  const minutesUntilClose = closed ? null : (
    minutesAfterMidnight < REGIONAL_CLOSE_MINUTES
      ? REGIONAL_CLOSE_MINUTES - minutesAfterMidnight
      : 24 * 60 - minutesAfterMidnight + REGIONAL_CLOSE_MINUTES
  );
  const closingSoon = minutesUntilClose !== null && minutesUntilClose <= CLOSING_SOON_WINDOW_MINUTES;

  return {
    status: closed ? "closed" : "open",
    title: closed ? "Regional rail closed overnight" : "Regional rail operating window",
    summary: closed
      ? "Regular GO and UP passenger rail service is outside the broad overnight operating window."
      : "At least part of the GO and UP rail network may be inside its scheduled operating window.",
    nowLabel: formatSubwayClock(minutesAfterMidnight),
    nextResumeLabel: nextResumeTime ? `Today at ${nextResumeTime}` : null,
    nextResumeTime,
    minutesUntilResume,
    nextCloseLabel: nextCloseTime ? `Today at ${nextCloseTime}` : null,
    nextCloseTime,
    minutesUntilClose,
    closingSoon,
    isWeekendSchedule,
  };
}

export function isRegionalRailClosed(now = new Date()) {
  return getRegionalRailOperatingState(now).status === "closed";
}

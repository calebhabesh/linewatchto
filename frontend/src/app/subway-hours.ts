export type SubwayOperatingStatus = "open" | "closed";

export type SubwayOperatingState = {
  status: SubwayOperatingStatus;
  title: string;
  summary: string;
  nowLabel: string;
  nextResumeLabel: string | null;
  nextResumeTime: string | null;
  minutesUntilResume: number | null;
  isSundaySchedule: boolean;
  operatingHours: {
    weekdaySaturday: string;
    sunday: string;
    caveat: string;
    overnight: string;
  };
};

const TORONTO_TIME_ZONE = "America/Toronto";
const CLOSE_MINUTES = 2 * 60;
const WEEKDAY_SATURDAY_OPEN_MINUTES = 6 * 60;
const SUNDAY_OPEN_MINUTES = 8 * 60;

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

export function formatSubwayClock(minutesAfterMidnight: number) {
  const hour24 = Math.floor(minutesAfterMidnight / 60) % 24;
  const minute = minutesAfterMidnight % 60;
  const hour12 = hour24 % 12 || 12;
  const period = hour24 < 12 ? "AM" : "PM";

  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function formatResumeDuration(minutes: number) {
  if (minutes <= 0) {
    return "now";
  }

  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainderMinutes} min`;
  }

  if (remainderMinutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainderMinutes} min`;
}

export function getSubwayOperatingState(now = new Date()): SubwayOperatingState {
  const { weekdayIndex, minutesAfterMidnight } = getTorontoLocalTimeParts(now);
  const openingMinutes = openingMinutesForDay(weekdayIndex);
  const closed = minutesAfterMidnight >= CLOSE_MINUTES && minutesAfterMidnight < openingMinutes;
  const nextResumeTime = closed ? formatSubwayClock(openingMinutes) : null;
  const minutesUntilResume = closed ? openingMinutes - minutesAfterMidnight : null;

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
    isSundaySchedule: weekdayIndex === 0,
    operatingHours: {
      weekdaySaturday: "Mon-Sat: about 6:00 a.m. to 2:00 a.m.",
      sunday: "Sun: about 8:00 a.m. to 2:00 a.m.",
      caveat: "Exact first and last train times vary by station. Check the TTC Station Page for a specific stop.",
      overnight: "The Blue Night Network covers many major routes overnight until regular subway service begins.",
    },
  };
}

export function isSubwayClosed(now = new Date()) {
  return getSubwayOperatingState(now).status === "closed";
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

function openingMinutesForDay(weekdayIndex: number) {
  return weekdayIndex === 0 ? SUNDAY_OPEN_MINUTES : WEEKDAY_SATURDAY_OPEN_MINUTES;
}

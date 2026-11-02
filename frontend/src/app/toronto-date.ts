const TORONTO_DATE_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function torontoEpochDay(value: Date | number): number {
  const parts = Object.fromEntries(
    TORONTO_DATE_PARTS.formatToParts(value).map((part) => [part.type, part.value]),
  );
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000;
}

/**
 * Calendar days from `now` to `value` on Toronto dates: 0 today, 1 tomorrow.
 * Compares dates rather than adding 24 hours, which picks the wrong day around
 * the 23- and 25-hour daylight-saving change days.
 */
export function torontoCalendarDayOffset(value: Date | number, now: Date | number): number {
  return torontoEpochDay(value) - torontoEpochDay(now);
}

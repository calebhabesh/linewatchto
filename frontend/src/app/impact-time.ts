export function formatRelativeImpactTime(
  timestamp: string,
  now = new Date(),
): string {
  const elapsedMs = Math.max(0, now.getTime() - new Date(timestamp).getTime());
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) return "just now";
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

  const elapsedWeeks = Math.floor(elapsedDays / 7);
  if (elapsedWeeks < 4) {
    return `${elapsedWeeks} week${elapsedWeeks === 1 ? "" : "s"} ago`;
  }
  
  const elapsedMonths = Math.floor(elapsedDays / 30);
  return `${elapsedMonths} month${elapsedMonths === 1 ? "" : "s"} ago`;
}

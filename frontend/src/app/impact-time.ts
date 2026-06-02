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
  const remainingMinutes = elapsedMinutes % 60;
  const minuteSuffix = remainingMinutes === 1 ? "" : "s";
  const minutePart = remainingMinutes > 0
    ? ` ${remainingMinutes} min${minuteSuffix}`
    : "";

  return `${elapsedHours} hr${elapsedHours === 1 ? "" : "s"}${minutePart} ago`;
}

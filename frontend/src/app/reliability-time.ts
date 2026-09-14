export function formatDisruptionDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return "0 min";
  const roundedMinutes = Math.round(minutes);
  if (roundedMinutes < 60) return `${roundedMinutes} min`;
  const hours = Math.floor(roundedMinutes / 60);
  const remainingMinutes = roundedMinutes % 60;
  const precise = `${hours.toLocaleString()} ${hours === 1 ? "hr" : "hrs"}${remainingMinutes ? ` ${remainingMinutes} min` : ""}`;
  if (hours < 24) return precise;
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const remainingDays = days % 7;
  const tangible = weeks
    ? `${weeks} wk${remainingDays ? ` ${remainingDays} d` : ""}`
    : `${days} d`;
  return `${precise} (${tangible})`;
}

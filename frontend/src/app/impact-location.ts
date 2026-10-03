import { regionalLineLabel } from "./regional-data.ts";

/** Normalize general regional labels, including retained older dashboard snapshots. */
export function formatImpactLocation(location: string): string {
  const generalLabel = location.match(/^(Entire |Full )?(.+?) (?:corridor|line)$/i);
  if (generalLabel) {
    const label = regionalLineLabel(generalLabel[2]);
    if (label !== generalLabel[2] || label === "UP Express") return `${generalLabel[1] ?? ""}${label}`;
  }
  return location.replace(/\bcorridor\b/gi, "Corridor");
}

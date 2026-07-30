import type { AccountSavedStation } from "./saved-station-data.ts";

export type SavedStationSort = "attention" | "name" | "recent" | "oldest" | "line";

const LINE_ORDER = [
  "line-1", "line-2", "line-4", "line-5", "line-6",
  "regional-br", "regional-ki", "regional-le", "regional-lw",
  "regional-mi", "regional-rh", "regional-st", "regional-up",
];

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("en-CA");
}

function attentionRank(saved: AccountSavedStation) {
  if (saved.station.hasActiveImpact) return 0;
  const counts = saved.station.accessOutageCounts;
  if (saved.station.accessStatus === "outage" || (counts && counts.elevator + counts.escalator > 0)) return 1;
  return 2;
}

function lineRank(saved: AccountSavedStation) {
  const ranks = saved.station.lineIds.map((lineId) => LINE_ORDER.indexOf(lineId)).filter((rank) => rank >= 0);
  return ranks.length > 0 ? Math.min(...ranks) : Number.MAX_SAFE_INTEGER;
}

export function filterAndSortSavedStations(
  stations: AccountSavedStation[],
  query: string,
  lineId: string,
  sort: SavedStationSort,
) {
  const needle = normalized(query);
  return stations
    .filter((saved) => !needle || normalized(saved.station.name).includes(needle))
    .filter((saved) => lineId === "all" || saved.station.lineIds.includes(lineId))
    .slice()
    .sort((left, right) => {
      const name = left.station.name.localeCompare(right.station.name, "en-CA");
      if (sort === "name") return name;
      if (sort === "recent") return right.savedAt.localeCompare(left.savedAt) || name;
      if (sort === "oldest") return left.savedAt.localeCompare(right.savedAt) || name;
      if (sort === "line") return lineRank(left) - lineRank(right) || name;
      return attentionRank(left) - attentionRank(right) || name;
    });
}

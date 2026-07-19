import type {
  ActiveAlert,
  DelayAlert,
  ImpactKind,
  ImpactSelection,
  NetworkSegment,
  PlannedClosure,
  ReducedSpeedZone,
  StationNodeImpact,
} from "./linewatch-data.ts";
import type { StationSummary } from "./station-data.ts";
import { normalizeStationQuery, STATION_SEARCH_LINES } from "./station-search.ts";

export type ImpactSearchCategory = {
  kind: ImpactKind;
  label: string;
  singularLabel: string;
  aliases: string[];
};

export type SearchableImpact = ActiveAlert | DelayAlert | ReducedSpeedZone | PlannedClosure;

export type ImpactSearchResult = {
  selection: NonNullable<ImpactSelection>;
  categoryKind: ImpactKind;
  categoryLabel: string;
  lineId: string;
  lineNumber: string;
  title: string;
  location: string;
  description: string;
  displayDirection?: string | null;
  updatedAt?: string | null;
  activeNow?: boolean;
  shuttle?: boolean;
  nightly?: boolean;
  score: number;
};

export type ImpactSearchGroup = {
  kind: ImpactKind;
  label: string;
  results: ImpactSearchResult[];
};

export type ImpactSearchData = {
  activeAlerts: ActiveAlert[];
  delays: DelayAlert[];
  reducedSpeedZones: ReducedSpeedZone[];
  plannedClosures: PlannedClosure[];
  networkSegments: NetworkSegment[];
  stationNodeImpacts: StationNodeImpact[];
};

export const IMPACT_SEARCH_CATEGORIES: ImpactSearchCategory[] = [
  {
    kind: "suspension",
    label: "Active Alerts",
    singularLabel: "Active Alert",
    aliases: ["active alert", "alert", "suspension", "suspended", "no service", "shutdown"],
  },
  {
    kind: "delay",
    label: "Delays",
    singularLabel: "Delay",
    aliases: ["delay", "delayed", "degraded", "longer travel", "travel time"],
  },
  {
    kind: "reduced-speed-zone",
    label: "Reduced Speed Zones",
    singularLabel: "Reduced Speed Zone",
    aliases: ["reduced speed zone", "reduced speed", "slow zone", "slowdown", "rsz"],
  },
  {
    kind: "planned-closure",
    label: "Planned Closures",
    singularLabel: "Planned Closure",
    aliases: ["planned closure", "closure", "closed", "weekend closure", "nightly closure", "shutdown"],
  },
];

function categoryFor(kind: ImpactKind) {
  return IMPACT_SEARCH_CATEGORIES.find((category) => category.kind === kind)!;
}

function normalizedAliases(category: ImpactSearchCategory) {
  return category.aliases.map(normalizeStationQuery);
}

export function matchImpactCategories(query: string) {
  const normalizedQuery = normalizeStationQuery(query);
  if (!normalizedQuery) return [];

  return IMPACT_SEARCH_CATEGORIES.filter((category) =>
    normalizedAliases(category).some((alias) =>
      alias === normalizedQuery ||
      alias.startsWith(normalizedQuery) ||
      normalizedQuery.startsWith(alias),
    ),
  );
}

function selectionForActiveAlert(alert: ActiveAlert): NonNullable<ImpactSelection> {
  if (alert.severity === "planned") return { kind: "planned-closure", id: alert.id };
  if (alert.severity === "delay") return { kind: "delay", id: alert.id };
  return { kind: "suspension", id: alert.id };
}

function timestampValue(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function scoreDocument(document: string, query: string, aliases: string[]) {
  if (document === query) return 1000;
  if (document.startsWith(query)) return 850;

  const tokens = query.split(" ").filter(Boolean);
  if (!tokens.every((token) => document.includes(token))) return null;

  const categoryMatch = aliases.some((alias) =>
    alias === query || alias.startsWith(query) || query.startsWith(alias),
  );
  const phraseIndex = document.indexOf(query);
  if (phraseIndex >= 0) return (categoryMatch ? 700 : 600) - Math.min(phraseIndex, 100);
  return categoryMatch ? 520 : 400;
}

function stationNamesForSegments(
  segmentIds: string[],
  segmentsById: Map<string, NetworkSegment>,
  stationNamesById: Map<string, string>,
) {
  const names = new Set<string>();
  for (const segmentId of segmentIds) {
    const segment = segmentsById.get(segmentId);
    if (!segment) continue;
    if (segment.stationAId && stationNamesById.has(segment.stationAId)) names.add(stationNamesById.get(segment.stationAId)!);
    if (segment.stationBId && stationNamesById.has(segment.stationBId)) names.add(stationNamesById.get(segment.stationBId)!);
  }
  return [...names];
}

export function searchDashboardImpacts(
  data: ImpactSearchData,
  stations: StationSummary[],
  query: string,
  limitPerGroup = 5,
): ImpactSearchGroup[] {
  const normalizedQuery = normalizeStationQuery(query);
  if (!normalizedQuery) return [];

  const segmentsById = new Map(data.networkSegments.map((segment) => [segment.id, segment]));
  const stationNamesById = new Map(stations.map((station) => [station.id, station.name]));
  const lineNamesById = new Map(STATION_SEARCH_LINES.map((line) => [line.id, line.name]));
  const nodeStationIdsByCard = new Map<string, Set<string>>();
  for (const impact of data.stationNodeImpacts) {
    const stationIds = nodeStationIdsByCard.get(impact.cardId) ?? new Set<string>();
    stationIds.add(impact.stationId);
    nodeStationIdsByCard.set(impact.cardId, stationIds);
  }

  const buildResult = (
    impact: SearchableImpact,
    categoryKind: ImpactKind,
    selection: NonNullable<ImpactSelection>,
    segmentIds: string[],
  ): ImpactSearchResult | null => {
    const category = categoryFor(categoryKind);
    const relatedStationNames = stationNamesForSegments(segmentIds, segmentsById, stationNamesById);
    for (const stationId of nodeStationIdsByCard.get(impact.id) ?? []) {
      const stationName = stationNamesById.get(stationId);
      if (stationName) relatedStationNames.push(stationName);
    }

    const searchableFields = [
      category.label,
      category.singularLabel,
      ...category.aliases,
      `line ${impact.lineNumber}`,
      impact.lineId,
      lineNamesById.get(impact.lineId),
      impact.title,
      impact.location,
      impact.description,
      impact.displayDirection,
      impact.cause,
      "reason" in impact ? impact.reason : null,
      "window" in impact ? impact.window : null,
      ...relatedStationNames,
      "shuttle" in impact && impact.shuttle ? "shuttle bus shuttle buses" : null,
      "nightly" in impact && impact.nightly ? "nightly overnight" : null,
      "activeNow" in impact && impact.activeNow ? "active now current" : null,
    ].filter((value): value is string => Boolean(value));
    const document = normalizeStationQuery(searchableFields.join(" "));
    const score = scoreDocument(document, normalizedQuery, normalizedAliases(category));
    if (score === null) return null;

    return {
      selection,
      categoryKind,
      categoryLabel: category.singularLabel,
      lineId: impact.lineId,
      lineNumber: impact.lineNumber,
      title: impact.title,
      location: impact.location,
      description: impact.description,
      displayDirection: impact.displayDirection,
      updatedAt: impact.updatedAt,
      activeNow: "activeNow" in impact ? impact.activeNow : undefined,
      shuttle: "shuttle" in impact ? impact.shuttle : undefined,
      nightly: "nightly" in impact ? impact.nightly : undefined,
      score,
    };
  };

  const groupedResults = new Map<ImpactKind, ImpactSearchResult[]>();
  const add = (kind: ImpactKind, result: ImpactSearchResult | null) => {
    if (!result) return;
    const results = groupedResults.get(kind) ?? [];
    results.push(result);
    groupedResults.set(kind, results);
  };

  for (const alert of data.activeAlerts) {
    add("suspension", buildResult(alert, "suspension", selectionForActiveAlert(alert), alert.affectedSegmentIds ?? []));
  }
  for (const delay of data.delays) {
    add("delay", buildResult(delay, "delay", { kind: "delay", id: delay.id }, delay.affectedSegmentIds ?? []));
  }
  for (const zone of data.reducedSpeedZones) {
    add("reduced-speed-zone", buildResult(zone, "reduced-speed-zone", { kind: "reduced-speed-zone", id: zone.id }, zone.affectedSegmentIds ?? []));
  }
  for (const closure of data.plannedClosures) {
    add("planned-closure", buildResult(closure, "planned-closure", { kind: "planned-closure", id: closure.id }, closure.previewSegmentIds ?? []));
  }

  return IMPACT_SEARCH_CATEGORIES.flatMap((category) => {
    const results = groupedResults.get(category.kind);
    if (!results?.length) return [];
    results.sort((a, b) => b.score - a.score || timestampValue(b.updatedAt) - timestampValue(a.updatedAt) || a.title.localeCompare(b.title));
    return [{ kind: category.kind, label: category.label, results: results.slice(0, limitPerGroup) }];
  });
}

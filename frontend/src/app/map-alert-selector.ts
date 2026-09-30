import { currentAdvisoryBucket } from "./alert-categories.ts";
/**
 * Map Alert Selector
 *
 * Pure semantic selector for alert eligibility, planned-closure previews,
 * parent/child active-closure deduplication, priority hierarchy, and
 * logical impact grouping shared by both schematic and geographic map renderers.
 * No DOM, SVG, or MapLibre dependencies.
 */

import type {
  ActiveAlert,
  DelayAlert,
  ImpactKind,
  ImpactSelection,
  MapImpact,
  MapImpactKind,
  NetworkSegment,
  PlannedClosure,
  ReducedSpeedZone,
  StationNodeImpact,
  TravelDirection,
} from "./linewatch-data.ts";
import type { NetworkId } from "./regional-data.ts";
import { STATION_LINE_STATION_IDS } from "./station-data.ts";

export type LogicalMapImpact = {
  id: string;
  cardId: string;
  allCardIds: string[];
  lineId?: string;
  affectedSegmentIds: string[];
  affectedStationIds: string[];
  kind: MapImpactKind;
  travelDirection: TravelDirection;
  directionCertainty: "explicit" | "unspecified";
  timingStatus: "active" | "preview";
  priority: number;
  label?: string;
  isStationOnly: boolean;
};

export type OverlapKindCount = {
  kind: MapImpactKind;
  count: number;
};

/**
 * Priority rank for impacts: suspension > delay > reduced-speed-zone > planned-closure.
 */
export function getImpactPriority(kind: MapImpactKind | ImpactKind): number {
  switch (kind) {
    case "suspension":
      return 4;
    case "delay":
      return 3;
    case "planned-closure":
      return 1;
    case "reduced-speed-zone":
      return 2;
    default:
      return 0;
  }
}

/**
 * Builds a mapping of planned closure IDs to active alert card IDs when an active alert
 * covers or is related to a planned closure.
 */
export function buildActiveClosureImpactCardIds(
  activeAlerts: ActiveAlert[] = [],
  plannedClosures: PlannedClosure[] = [],
  delays: DelayAlert[] = [],
): Map<string, string> {
  const cardIds = new Map<string, string>();

  for (const closure of plannedClosures) {
    if (!closure.activeNow && closure.timingStatus !== "active-now") continue;
    const activeAlert = [...activeAlerts, ...delays].find(
      (alert) => alert.id === closure.id || alert.relatedPlannedClosureId === closure.id,
    );
    cardIds.set(closure.id, activeAlert?.id ?? closure.id);
  }

  for (const alert of activeAlerts) {
    if (alert.severity !== "planned") continue;
    cardIds.set(alert.id, alert.id);
    if (alert.relatedPlannedClosureId) {
      cardIds.set(alert.relatedPlannedClosureId, alert.id);
    }
  }

  return cardIds;
}

/**
 * Resolves an active planned advisory to its current effect and current card ID.
 */
export function normalizeActiveClosureMapImpact(
  impact: MapImpact,
  activeClosureImpactCardIds: Map<string, string>,
  plannedAdvisories: PlannedClosure[] = [],
): MapImpact {
  if (impact.kind !== "planned-closure") return impact;
  const activeCardId = activeClosureImpactCardIds.get(impact.cardId);
  if (!activeCardId) return impact;

  return {
    ...impact,
    kind: currentAdvisoryBucket(plannedAdvisories.find(advisory => advisory.id === impact.cardId) ?? {}),
    cardId: activeCardId,
    sourceAlertIds: [activeCardId],
  };
}

/**
 * Resolves eligible planned closures for map presentation.
 * Excludes advisories that are currently active (already represented as current impacts),
 * unless explicitly selected by the user.
 */
export function getEligiblePlannedClosures(
  plannedClosures: PlannedClosure[] = [],
  activeAlerts: ActiveAlert[] = [],
  selection?: ImpactSelection,
  delays: DelayAlert[] = [],
): {
  linkedPlannedClosureIds: Set<string>;
  currentPlannedClosureIds: Set<string>;
  overlapPlannedClosures: PlannedClosure[];
  eligiblePlannedClosures: PlannedClosure[];
  activeClosureImpactCardIds: Map<string, string>;
} {
  const linkedPlannedClosureIds = new Set(
    [...activeAlerts, ...delays]
      .map((alert) => alert.relatedPlannedClosureId)
      .filter((id): id is string => Boolean(id)),
  );

  const currentPlannedClosureIds = new Set([
    ...linkedPlannedClosureIds,
    ...plannedClosures
      .filter((closure) => closure.activeNow || closure.timingStatus === "active-now")
      .map((closure) => closure.id),
  ]);

  const overlapPlannedClosures = plannedClosures.filter(
    (closure) => !currentPlannedClosureIds.has(closure.id),
  );

  const eligiblePlannedClosures = plannedClosures.filter(
    (closure) =>
      !currentPlannedClosureIds.has(closure.id) ||
      (selection?.kind === "planned-closure" && selection.id === closure.id),
  );

  const activeClosureImpactCardIds = buildActiveClosureImpactCardIds(activeAlerts, plannedClosures, delays);

  return {
    linkedPlannedClosureIds,
    currentPlannedClosureIds,
    overlapPlannedClosures,
    eligiblePlannedClosures,
    activeClosureImpactCardIds,
  };
}

/** Local planned previews share eligibility with rail previews. */
export function plannedAdvisoryStationImpacts(
  plannedClosures: PlannedClosure[] = [],
  activeAlerts: ActiveAlert[] = [],
  delays: DelayAlert[] = [],
  selection?: ImpactSelection,
): StationNodeImpact[] {
  return getEligiblePlannedClosures(plannedClosures, activeAlerts, selection, delays).eligiblePlannedClosures
    .filter(advisory => !advisory.previewSegmentIds.length)
    .flatMap(advisory => (advisory.previewStationIds ?? []).map(stationId => ({
      stationId, kind: "planned-closure" as const, cardId: advisory.id, title: advisory.title,
    })));
}

/**
 * Deduplicates impacts and counts unique logical impacts per kind.
 */
export function countUniqueImpactsByKind(
  impacts: Pick<MapImpact, "kind" | "cardId">[],
): OverlapKindCount[] {
  const seen = new Set<string>();
  const counts = new Map<MapImpactKind, number>();

  for (const impact of impacts) {
    const key = `${impact.kind}:${impact.cardId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts.set(impact.kind, (counts.get(impact.kind) ?? 0) + 1);
  }

  return Array.from(counts, ([kind, count]) => ({ kind, count })).sort(
    (a, b) => getImpactPriority(b.kind) - getImpactPriority(a.kind),
  );
}

/**
 * Determines whether a planned preview should be rendered on a segment.
 */
export function shouldRenderPlannedPreviewOnSegment(
  segmentId: string,
  existingImpacts: MapImpact[] | undefined,
  closure: PlannedClosure,
): boolean {
  if (!closure.previewSegmentIds?.includes(segmentId)) {
    return false;
  }
  return !(existingImpacts ?? []).some(
    (impact) => impact.kind === "planned-closure" && impact.cardId === closure.id,
  );
}

/**
 * Resolves a human-readable display direction into normalized TravelDirection
 * and certainty flag ("explicit" | "unspecified").
 */
export function resolveTravelDirectionFromDisplay(
  displayDirection?: string | null,
  lineId?: string,
  stationAId?: string,
  stationBId?: string,
  network: NetworkId = "ttc",
): { travelDirection: TravelDirection; directionCertainty: "explicit" | "unspecified" } {
  if (!displayDirection) {
    return { travelDirection: "bidirectional", directionCertainty: "unspecified" };
  }

  const normalized = displayDirection.trim().toLowerCase();
  if (
    normalized === "direction not specified" ||
    normalized === "not specified" ||
    normalized === "unknown" ||
    normalized === ""
  ) {
    return { travelDirection: "bidirectional", directionCertainty: "unspecified" };
  }

  if (
    normalized === "both directions" ||
    normalized === "both ways" ||
    normalized === "bidirectional" ||
    normalized === "both" ||
    (normalized.includes("eastbound") && normalized.includes("westbound")) ||
    (normalized.includes("northbound") && normalized.includes("southbound"))
  ) {
    return { travelDirection: "bidirectional", directionCertainty: "explicit" };
  }

  if (normalized === "forward") {
    return { travelDirection: "forward", directionCertainty: "explicit" };
  }

  if (normalized === "reverse") {
    return { travelDirection: "reverse", directionCertainty: "explicit" };
  }

  const hasEastbound = /\beastbound\b/.test(normalized);
  const hasWestbound = /\bwestbound\b/.test(normalized);
  const hasNorthbound = /\bnorthbound\b/.test(normalized);
  const hasSouthbound = /\bsouthbound\b/.test(normalized);

  // Horizontal lines (Line 2, Line 4, Line 5, Line 6)
  if (lineId === "line-2" || lineId === "line-4" || lineId === "line-5" || lineId === "line-6") {
    if (hasEastbound) return { travelDirection: "forward", directionCertainty: "explicit" };
    if (hasWestbound) return { travelDirection: "reverse", directionCertainty: "explicit" };
  }

  // Line 1: U-shaped line
  if (lineId === "line-1") {
    const stationSequence = STATION_LINE_STATION_IDS["line-1"] ?? [];
    const unionIdx = stationSequence.indexOf("union");
    const cleanA = stationAId ? stationAId.replace(/^station-/, "") : undefined;
    const cleanB = stationBId ? stationBId.replace(/^station-/, "") : undefined;
    const idxA = cleanA ? stationSequence.indexOf(cleanA) : -1;
    const idxB = cleanB ? stationSequence.indexOf(cleanB) : -1;
    const avgIdx = idxA !== -1 && idxB !== -1 ? (idxA + idxB) / 2 : idxA !== -1 ? idxA : idxB;

    if (avgIdx !== -1 && unionIdx !== -1) {
      if (avgIdx >= unionIdx) {
        // Yonge arm (Union to Finch): North is forward (increasing index), South is reverse
        if (hasNorthbound) return { travelDirection: "forward", directionCertainty: "explicit" };
        if (hasSouthbound) return { travelDirection: "reverse", directionCertainty: "explicit" };
      } else {
        // University arm (Vaughan to Union): South is forward (increasing index), North is reverse
        if (hasSouthbound) return { travelDirection: "forward", directionCertainty: "explicit" };
        if (hasNorthbound) return { travelDirection: "reverse", directionCertainty: "explicit" };
      }
    } else {
      if (hasNorthbound) return { travelDirection: "forward", directionCertainty: "explicit" };
      if (hasSouthbound) return { travelDirection: "reverse", directionCertainty: "explicit" };
    }
  }

  // Regional corridors
  if (network === "regional" || lineId?.startsWith("regional-")) {
    if (hasNorthbound || hasEastbound) return { travelDirection: "forward", directionCertainty: "explicit" };
    if (hasSouthbound || hasWestbound) return { travelDirection: "reverse", directionCertainty: "explicit" };
  }

  return { travelDirection: "bidirectional", directionCertainty: "explicit" };
}

/**
 * Extracts unified logical impacts across all sources for both map renderers.
 */
export function selectUnifiedLogicalImpacts({
  networkSegments = [],
  stationNodeImpacts = [],
  plannedClosures = [],
  activeAlerts = [],
  delays = [],
  reducedSpeedZones = [],
  selection,
  network = "ttc",
}: {
  networkSegments?: NetworkSegment[];
  stationNodeImpacts?: StationNodeImpact[];
  plannedClosures?: PlannedClosure[];
  activeAlerts?: ActiveAlert[];
  delays?: DelayAlert[];
  reducedSpeedZones?: ReducedSpeedZone[];
  selection?: ImpactSelection;
  network?: NetworkId;
}): {
  logicalImpacts: LogicalMapImpact[];
  activeClosureImpactCardIds: Map<string, string>;
  eligiblePlannedClosures: PlannedClosure[];
  overlapPlannedClosures: PlannedClosure[];
} {
  const {
    eligiblePlannedClosures,
    overlapPlannedClosures,
    activeClosureImpactCardIds,
  } = getEligiblePlannedClosures(plannedClosures, activeAlerts, selection, delays);

  const impactsList: LogicalMapImpact[] = [];
  const processedImpactCardIds = new Set<string>();

  // 1. Active alert suspensions
  for (const alert of activeAlerts) {
    if (alert.severity === "suspension" || alert.severity === "planned") {
      const allCardIds = [alert.id];
      if (alert.relatedPlannedClosureId) {
        allCardIds.push(alert.relatedPlannedClosureId);
      }

      // Find affected segments
      const affectedSegmentIds = networkSegments
        .filter((seg) =>
          seg.impacts?.some((imp) => imp.cardId === alert.id || allCardIds.includes(imp.cardId)) ||
          seg.alertId === alert.id ||
          seg.sourceAlertIds?.includes(alert.id),
        )
        .map((seg) => seg.id);

      const affectedStationIds = networkSegments
        .filter((seg) => affectedSegmentIds.includes(seg.id))
        .flatMap((seg) => [seg.stationAId, seg.stationBId].filter((s): s is string => Boolean(s)));

      const resolvedDirection = resolveTravelDirectionFromDisplay(
        alert.displayDirection,
        alert.lineId,
        affectedStationIds[0],
        affectedStationIds[1],
        network,
      );

      impactsList.push({
        id: alert.id,
        cardId: alert.id,
        allCardIds,
        lineId: alert.lineId,
        affectedSegmentIds,
        affectedStationIds: [...new Set(affectedStationIds)],
        kind: "suspension",
        travelDirection: resolvedDirection.travelDirection,
        directionCertainty: resolvedDirection.directionCertainty,
        timingStatus: "active",
        priority: getImpactPriority("suspension"),
        label: alert.title,
        isStationOnly: false,
      });
      processedImpactCardIds.add(alert.id);
    }
  }

  // 2. Active RSZs
  for (const rsz of reducedSpeedZones) {
    const affectedSegmentIds = networkSegments
      .filter((seg) =>
        seg.reducedSpeedZoneIds?.includes(rsz.id) ||
        seg.impacts?.some((imp) => imp.cardId === rsz.id) ||
        seg.alertId === rsz.id,
      )
      .map((seg) => seg.id);

    const affectedStationIds = networkSegments
      .filter((seg) => affectedSegmentIds.includes(seg.id))
      .flatMap((seg) => [seg.stationAId, seg.stationBId].filter((s): s is string => Boolean(s)));

    const resolvedDirection = resolveTravelDirectionFromDisplay(
      rsz.displayDirection,
      rsz.lineId,
      affectedStationIds[0],
      affectedStationIds[1],
      network,
    );

    impactsList.push({
      id: rsz.id,
      cardId: rsz.id,
      allCardIds: [rsz.id],
      lineId: rsz.lineId,
      affectedSegmentIds,
      affectedStationIds: [...new Set(affectedStationIds)],
      kind: "reduced-speed-zone",
      travelDirection: resolvedDirection.travelDirection,
      directionCertainty: resolvedDirection.directionCertainty,
      timingStatus: "active",
      priority: getImpactPriority("reduced-speed-zone"),
      label: rsz.title,
      isStationOnly: false,
    });
    processedImpactCardIds.add(rsz.id);
  }

  // 3. Planned preview closures
  for (const closure of eligiblePlannedClosures) {
    const allCardIds = [closure.id];
    const mappedActiveId = activeClosureImpactCardIds.get(closure.id);
    if (mappedActiveId) {
      allCardIds.push(mappedActiveId);
    }

    const affectedSegmentIds = closure.previewSegmentIds ?? [];
    const affectedStationIds = networkSegments
      .filter((seg) => affectedSegmentIds.includes(seg.id))
      .flatMap((seg) => [seg.stationAId, seg.stationBId].filter((s): s is string => Boolean(s)));

    const resolvedDirection = closure.travelDirection
      ? { travelDirection: closure.travelDirection, directionCertainty: "explicit" as const }
      : resolveTravelDirectionFromDisplay(
          closure.displayDirection,
          closure.lineId,
          affectedStationIds[0],
          affectedStationIds[1],
          network,
        );

    impactsList.push({
      id: closure.id,
      cardId: closure.id,
      allCardIds,
      lineId: closure.lineId,
      affectedSegmentIds,
      affectedStationIds: [...new Set([...affectedStationIds, ...(closure.previewStationIds ?? [])])],
      kind: "planned-closure",
      travelDirection: resolvedDirection.travelDirection,
      directionCertainty: resolvedDirection.directionCertainty,
      timingStatus: "preview",
      priority: getImpactPriority("planned-closure"),
      label: closure.title,
      isStationOnly: affectedSegmentIds.length === 0,
    });
    processedImpactCardIds.add(closure.id);
  }

  // 4. Station node impacts (station-only service impacts)
  for (const stationImpact of stationNodeImpacts) {
    impactsList.push({
      id: stationImpact.cardId,
      cardId: stationImpact.cardId,
      allCardIds: [stationImpact.cardId],
      affectedSegmentIds: [],
      affectedStationIds: [stationImpact.stationId],
      kind: stationImpact.kind,
      travelDirection: "bidirectional",
      directionCertainty: "unspecified",
      timingStatus: "active",
      priority: getImpactPriority(stationImpact.kind),
      label: stationImpact.title,
      isStationOnly: true,
    });
    processedImpactCardIds.add(stationImpact.cardId);
  }

  // 5. Any remaining segment impacts (delays or unmapped impacts)
  for (const seg of networkSegments) {
    const impacts = seg.impacts?.length
      ? seg.impacts
      : seg.overlay && seg.overlay !== "clear"
      ? [
          {
            kind: seg.overlay as MapImpactKind,
            cardId: seg.alertId || seg.id,
            travelDirection: seg.travelDirection || "bidirectional",
            sourceAlertIds: seg.sourceAlertIds || [],
          },
        ]
      : [];

    for (const rawImp of impacts) {
      const imp = normalizeActiveClosureMapImpact(rawImp, activeClosureImpactCardIds, plannedClosures);
      if (processedImpactCardIds.has(imp.cardId)) continue;
      processedImpactCardIds.add(imp.cardId);

      const affectedSegmentIds = networkSegments
        .filter((s) => s.impacts?.some((i) => i.cardId === imp.cardId) || s.alertId === imp.cardId)
        .map((s) => s.id);

      const affectedStationIds = networkSegments
        .filter((s) => affectedSegmentIds.includes(s.id))
        .flatMap((s) => [s.stationAId, s.stationBId].filter((st): st is string => Boolean(st)));

      impactsList.push({
        id: imp.cardId,
        cardId: imp.cardId,
        allCardIds: [imp.cardId, ...(imp.sourceAlertIds ?? [])],
        lineId: seg.lineId,
        affectedSegmentIds,
        affectedStationIds: [...new Set(affectedStationIds)],
        kind: imp.kind,
        travelDirection: imp.travelDirection || "bidirectional",
        directionCertainty: imp.travelDirection ? "explicit" : "unspecified",
        timingStatus: imp.kind === "planned-closure" ? "preview" : "active",
        priority: getImpactPriority(imp.kind),
        label: seg.label || seg.id,
        isStationOnly: false,
      });
    }
  }

  return {
    logicalImpacts: impactsList,
    activeClosureImpactCardIds,
    eligiblePlannedClosures,
    overlapPlannedClosures,
  };
}

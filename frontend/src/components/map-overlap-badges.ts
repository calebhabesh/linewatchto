import type {
  ImpactSelection,
  MapImpact,
  MapImpactKind,
  NetworkSegment,
  PlannedClosure,
  StationNodeImpact,
} from "../app/linewatch-data";

export type MapOverlapSelection = {
  label: string;
  impacts: {
    selection: NonNullable<ImpactSelection>;
  }[];
};

export type OverlapBadgeSourceSegment = Pick<
  NetworkSegment,
  | "id"
  | "label"
  | "stationAId"
  | "stationBId"
  | "impacts"
  | "overlay"
  | "sourceAlertIds"
  | "reducedSpeedZoneIds"
  | "alertId"
  | "travelDirection"
>;

export type StationOverlapBadgeGroup = {
  signature: string;
  stationId: string;
  impacts: MapImpact[];
  impactKinds: MapImpactKind[];
  primaryImpact: MapImpact;
};

export type OverlapBadgeKindCount = {
  kind: MapImpactKind;
  count: number;
};

export type SegmentOverlapBadgeCoverageGroup = {
  signature: string;
  impacts: Pick<MapImpact, "kind" | "cardId">[];
  segments: Pick<OverlapBadgeSourceSegment, "stationAId" | "stationBId">[];
};

type PlannedClosureSegmentSource = Pick<PlannedClosure, "id" | "previewSegmentIds">;

function getImpactPriority(kind: MapImpactKind): number {
  switch (kind) {
    case "suspension":
      return 4;
    case "planned-closure":
      return 3;
    case "delay":
      return 2;
    case "reduced-speed-zone":
      return 1;
    default:
      return 0;
  }
}

export function getUniqueImpactKinds(impacts: MapImpact[]): MapImpactKind[] {
  return Array.from(new Set(impacts.map((impact) => impact.kind))).sort(
    (a, b) => getImpactPriority(b) - getImpactPriority(a),
  );
}

export function overlapBadgeKindCounts(impacts: Pick<MapImpact, "kind">[]): OverlapBadgeKindCount[] {
  const counts = new Map<MapImpactKind, number>();
  for (const impact of impacts) {
    counts.set(impact.kind, (counts.get(impact.kind) ?? 0) + 1);
  }

  return Array.from(counts, ([kind, count]) => ({ kind, count })).sort(
    (a, b) => getImpactPriority(b.kind) - getImpactPriority(a.kind),
  );
}

export function overlapBadgeVisualItemCount(kindCounts: OverlapBadgeKindCount[]): number {
  return kindCounts.length;
}

export function primaryImpactForOverlap(impacts: MapImpact[]): MapImpact | undefined {
  return [...impacts].sort((a, b) => getImpactPriority(b.kind) - getImpactPriority(a.kind))[0];
}

function legacyImpactsForSegment(segment: OverlapBadgeSourceSegment): MapImpact[] {
  if (segment.overlay === "clear" || !segment.overlay) {
    return [];
  }

  const sourceAlertIds = segment.sourceAlertIds ?? [];
  const reducedSpeedZoneId = segment.reducedSpeedZoneIds?.[0];
  const cardId = reducedSpeedZoneId ?? segment.alertId ?? sourceAlertIds[0] ?? segment.id;
  const kind: MapImpactKind =
    segment.overlay === "suspension" ? "suspension" : reducedSpeedZoneId ? "reduced-speed-zone" : "delay";

  return [
    {
      kind,
      cardId,
      travelDirection: segment.travelDirection ?? "bidirectional",
      sourceAlertIds: sourceAlertIds.length ? sourceAlertIds : [cardId],
    },
  ];
}

function activeImpactsForSegment(segment: OverlapBadgeSourceSegment): MapImpact[] {
  return segment.impacts?.length ? segment.impacts : legacyImpactsForSegment(segment);
}

function stationIdsForSegment(segment: OverlapBadgeSourceSegment): string[] {
  return [segment.stationAId, segment.stationBId].filter((stationId): stationId is string => Boolean(stationId));
}

function impactKey(impact: Pick<MapImpact, "kind" | "cardId">): string {
  return `${impact.kind}:${impact.cardId}`;
}

export function overlapBadgeSignature(impacts: Pick<MapImpact, "kind" | "cardId">[]): string {
  return impacts
    .map(impactKey)
    .sort()
    .join("|");
}

function impactKeySet(impacts: Pick<MapImpact, "kind" | "cardId">[]): Set<string> {
  return new Set(impacts.map(impactKey));
}

export function hasOverlappingImpacts(impacts: Pick<MapImpact, "kind" | "cardId">[]): boolean {
  return impactKeySet(impacts).size > 1;
}

function isStrictImpactSuperset(
  possibleSuperset: Pick<MapImpact, "kind" | "cardId">[],
  possibleSubset: Pick<MapImpact, "kind" | "cardId">[],
): boolean {
  const superset = impactKeySet(possibleSuperset);
  const subset = impactKeySet(possibleSubset);
  if (superset.size <= subset.size) return false;
  return Array.from(subset).every((key) => superset.has(key));
}

function segmentGroupTouchesStation(group: SegmentOverlapBadgeCoverageGroup, stationId: string): boolean {
  return group.segments.length > 0 && group.segments.every(
    (segment) => segment.stationAId === stationId || segment.stationBId === stationId,
  );
}

export function coveredSegmentOverlapBadgeSignatures(
  segmentGroups: SegmentOverlapBadgeCoverageGroup[],
  stationGroups: Pick<StationOverlapBadgeGroup, "stationId" | "impacts">[],
): Set<string> {
  const coveredSignatures = new Set<string>();

  for (const segmentGroup of segmentGroups) {
    const coveredByStationGroup = stationGroups.some((stationGroup) => (
      segmentGroupTouchesStation(segmentGroup, stationGroup.stationId) &&
      isStrictImpactSuperset(stationGroup.impacts, segmentGroup.impacts)
    ));

    if (coveredByStationGroup) {
      coveredSignatures.add(segmentGroup.signature);
    }
  }

  return coveredSignatures;
}

function addStationImpact(
  impactsByStation: Map<string, Map<string, MapImpact>>,
  stationId: string,
  impact: MapImpact,
) {
  const impacts = impactsByStation.get(stationId) ?? new Map<string, MapImpact>();
  impacts.set(impactKey(impact), impact);
  impactsByStation.set(stationId, impacts);
}

export function buildStationOverlapBadgeGroups({
  segments,
  plannedClosures,
  stationNodeImpacts,
  suppressedSignatures = new Set<string>(),
}: {
  segments: OverlapBadgeSourceSegment[];
  plannedClosures: PlannedClosureSegmentSource[];
  stationNodeImpacts: StationNodeImpact[];
  suppressedSignatures?: Set<string>;
}): StationOverlapBadgeGroup[] {
  const impactsByStation = new Map<string, Map<string, MapImpact>>();
  const plannedClosuresBySegmentId = new Map<string, PlannedClosureSegmentSource[]>();

  for (const closure of plannedClosures) {
    for (const segmentId of closure.previewSegmentIds ?? []) {
      const closures = plannedClosuresBySegmentId.get(segmentId) ?? [];
      closures.push(closure);
      plannedClosuresBySegmentId.set(segmentId, closures);
    }
  }

  for (const segment of segments) {
    const stationIds = stationIdsForSegment(segment);
    if (stationIds.length === 0) continue;

    const impacts = [
      ...activeImpactsForSegment(segment),
      ...(plannedClosuresBySegmentId.get(segment.id) ?? []).map((closure) => ({
        kind: "planned-closure" as const,
        cardId: closure.id,
        travelDirection: "bidirectional" as const,
        sourceAlertIds: [closure.id],
      })),
    ];

    for (const stationId of stationIds) {
      for (const impact of impacts) {
        addStationImpact(impactsByStation, stationId, impact);
      }
    }
  }

  for (const impact of stationNodeImpacts) {
    addStationImpact(impactsByStation, impact.stationId, {
      kind: impact.kind,
      cardId: impact.cardId,
      travelDirection: "bidirectional",
      sourceAlertIds: [impact.cardId],
    });
  }

  return Array.from(impactsByStation.entries())
    .map(([stationId, impactsByKey]) => {
      const impacts = Array.from(impactsByKey.values());
      const impactKinds = getUniqueImpactKinds(impacts);
      if (!hasOverlappingImpacts(impacts)) return null;

      const signature = overlapBadgeSignature(impacts);
      if (suppressedSignatures.has(signature)) return null;

      const primaryImpact = primaryImpactForOverlap(impacts);
      if (!primaryImpact) return null;

      return {
        signature,
        stationId,
        impacts,
        impactKinds,
        primaryImpact,
      };
    })
    .filter((group): group is StationOverlapBadgeGroup => Boolean(group));
}

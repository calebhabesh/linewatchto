import type {
  MapImpact,
  MapImpactKind,
  NetworkSegment,
  PlannedClosure,
  StationNodeImpact,
} from "../app/linewatch-data.ts";
import { getImpactPriority } from "../app/map-alert-selector.ts";
import {
  OVERLAP_BADGE_ITEM_SPACING,
  OVERLAP_BADGE_PILL_THICKNESS,
  OVERLAP_INDICATOR_SCALE,
} from "./map-overlap-svg.ts";
import { clusterByStationDot, segmentStationTouches, stationLineDotLookup } from "./station-dots.ts";

export type MapOverlapChooserLayout = {
  left: number;
  top: number;
  anchorOffsetX: number;
  anchorOffsetY: number;
};

export type MapOverlapIndicatorSize = {
  width: number;
  height: number;
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
> & Partial<Pick<NetworkSegment, "lineId" | "stationAAnchorId" | "stationBAnchorId">>;

export type StationOverlapBadgeGroup = {
  signature: string;
  stationId: string;
  /**
   * The dots the badge belongs to at a station drawn with a dot per line
   * (GO/UP's Bloor KI dot); empty where the station is one mark or the
   * alerts cover all of it.
   */
  dotIds: string[];
  impacts: MapImpact[];
  impactKinds: MapImpactKind[];
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

export function mapOverlapIndicatorSize(
  impacts: Pick<MapImpact, "kind">[],
): MapOverlapIndicatorSize {
  const impactKindCount = overlapBadgeVisualItemCount(overlapBadgeKindCounts(impacts));
  return mapOverlapIndicatorSizeForKindCount(impactKindCount);
}

export function mapOverlapIndicatorSizeForKindCount(
  impactKindCount: number,
): MapOverlapIndicatorSize {
  if (impactKindCount === 1) {
    return {
      width: OVERLAP_BADGE_PILL_THICKNESS * OVERLAP_INDICATOR_SCALE,
      height: OVERLAP_BADGE_PILL_THICKNESS * OVERLAP_INDICATOR_SCALE,
    };
  }

  const visibleCount = Math.min(3, impactKindCount);
  const hasMore = impactKindCount > visibleCount;
  const totalItems = visibleCount + (hasMore ? 1 : 0);
  return {
    width: Math.max(
      OVERLAP_BADGE_PILL_THICKNESS,
      (totalItems - 1) * OVERLAP_BADGE_ITEM_SPACING + OVERLAP_BADGE_PILL_THICKNESS,
    ) * OVERLAP_INDICATOR_SCALE,
    height: OVERLAP_BADGE_PILL_THICKNESS * OVERLAP_INDICATOR_SCALE,
  };
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

export function activeImpactsForSegment(segment: OverlapBadgeSourceSegment): MapImpact[] {
  return segment.impacts?.length ? segment.impacts : legacyImpactsForSegment(segment);
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

type StationImpactEntry = { item: MapImpact; key: string; dotId: string | null };

function addStationImpact(
  impactsByStation: Map<string, StationImpactEntry[]>,
  stationId: string,
  dotId: string | null,
  impact: MapImpact,
) {
  const entries = impactsByStation.get(stationId) ?? [];
  entries.push({ item: impact, key: impactKey(impact), dotId });
  impactsByStation.set(stationId, entries);
}

/**
 * Alerts that meet at a station without sharing a stretch of line, one group
 * per drawn mark they share. Alerts on different dots of a station drawn with
 * a dot per line (GO/UP's Weston, Mount Dennis and Bloor; TTC's Spadina) are
 * separate marks on separate lines and get no badge together; a station alert
 * whose line is unknown covers every dot.
 */
export function buildStationOverlapBadgeGroups({
  segments,
  plannedClosures,
  stationNodeImpacts,
  suppressedSignatures = new Set<string>(),
  stationImpactLineId,
}: {
  segments: OverlapBadgeSourceSegment[];
  plannedClosures: PlannedClosureSegmentSource[];
  stationNodeImpacts: StationNodeImpact[];
  suppressedSignatures?: Set<string>;
  /** The line a station alert belongs to, which picks its dot; unknown covers the station. */
  stationImpactLineId?: (impact: StationNodeImpact) => string | null | undefined;
}): StationOverlapBadgeGroup[] {
  const impactsByStation = new Map<string, StationImpactEntry[]>();
  const plannedClosuresBySegmentId = new Map<string, PlannedClosureSegmentSource[]>();
  const dotsByStation = new Map<string, Set<string>>();
  const lineDot = stationLineDotLookup(segments);

  for (const closure of plannedClosures) {
    for (const segmentId of closure.previewSegmentIds ?? []) {
      const closures = plannedClosuresBySegmentId.get(segmentId) ?? [];
      closures.push(closure);
      plannedClosuresBySegmentId.set(segmentId, closures);
    }
  }

  for (const segment of segments) {
    const touches = segmentStationTouches(segment);
    for (const touch of touches) {
      if (!touch.dotId) continue;
      const dots = dotsByStation.get(touch.stationId) ?? new Set<string>();
      dots.add(touch.dotId);
      dotsByStation.set(touch.stationId, dots);
    }
    if (touches.length === 0) continue;

    const impacts = [
      ...activeImpactsForSegment(segment),
      ...(plannedClosuresBySegmentId.get(segment.id) ?? []).map((closure) => ({
        kind: "planned-closure" as const,
        cardId: closure.id,
        travelDirection: "bidirectional" as const,
        sourceAlertIds: [closure.id],
      })),
    ];

    for (const touch of touches) {
      for (const impact of impacts) {
        addStationImpact(impactsByStation, touch.stationId, touch.dotId, impact);
      }
    }
  }

  for (const impact of stationNodeImpacts) {
    addStationImpact(
      impactsByStation,
      impact.stationId,
      lineDot(impact.stationId, stationImpactLineId?.(impact)),
      {
        kind: impact.kind,
        cardId: impact.cardId,
        travelDirection: "bidirectional",
        sourceAlertIds: [impact.cardId],
      },
    );
  }

  return Array.from(impactsByStation.entries())
    .flatMap(([stationId, entries]) => {
      // Only a station drawn with more than one dot can split its alerts.
      const splitStation = (dotsByStation.get(stationId)?.size ?? 0) > 1;
      return clusterByStationDot(entries).map(({ items: impacts, dotIds }) => {
        if (!hasOverlappingImpacts(impacts)) return null;

        const signature = overlapBadgeSignature(impacts);
        if (suppressedSignatures.has(signature)) return null;

        return {
          signature,
          stationId,
          dotIds: splitStation ? dotIds : [],
          impacts,
          impactKinds: getUniqueImpactKinds(impacts),
        };
      });
    })
    .filter((group): group is StationOverlapBadgeGroup => Boolean(group))
    .sort((a, b) => a.stationId.localeCompare(b.stationId) || a.signature.localeCompare(b.signature));
}

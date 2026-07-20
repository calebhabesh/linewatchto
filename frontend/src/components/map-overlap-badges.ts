import type {
  MapImpact,
  MapImpactKind,
  NetworkSegment,
  PlannedClosure,
  StationNodeImpact,
} from "../app/linewatch-data";

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
};

export type OverlapBadgeKindCount = {
  kind: MapImpactKind;
  count: number;
};

export type OverlapChooserPoint = { x: number; y: number };
export type OverlapChooserSize = { width: number; height: number };
export type OverlapChooserBounds = OverlapChooserPoint & OverlapChooserSize;
export type OverlapChooserPosition = OverlapChooserPoint & { collisionAvoided: boolean };
export type PlacedOverlapBadge = {
  anchor: OverlapChooserPoint;
  position: OverlapChooserPoint;
  size: OverlapChooserSize;
};

export type SegmentOverlapBadgeCoverageGroup = {
  signature: string;
  impacts: Pick<MapImpact, "kind" | "cardId">[];
  segments: Pick<OverlapBadgeSourceSegment, "stationAId" | "stationBId">[];
};

type PlannedClosureSegmentSource = Pick<PlannedClosure, "id" | "previewSegmentIds">;

export function alignedOverlapBadgePositionCandidates({
  anchor,
  size,
  placedBadges,
  gap,
  maxAnchorDistance,
}: {
  anchor: OverlapChooserPoint;
  size: OverlapChooserSize;
  placedBadges: PlacedOverlapBadge[];
  gap: number;
  maxAnchorDistance: number;
}): OverlapChooserPoint[] {
  return placedBadges
    .map((badge) => ({
      badge,
      anchorDistance: Math.hypot(anchor.x - badge.anchor.x, anchor.y - badge.anchor.y),
    }))
    .filter(({ anchorDistance }) => anchorDistance > 0 && anchorDistance <= maxAnchorDistance)
    .sort((a, b) => a.anchorDistance - b.anchorDistance)
    .map(({ badge }) => {
      const deltaX = anchor.x - badge.anchor.x;
      const deltaY = anchor.y - badge.anchor.y;
      const followsVerticalLane = Math.abs(deltaY) >= Math.abs(deltaX);

      if (followsVerticalLane) {
        const direction = deltaY < 0 ? -1 : 1;
        const naturalY = badge.position.y + deltaY;
        const minimumY = badge.position.y + direction * (badge.size.height / 2 + size.height / 2 + gap);
        return {
          x: badge.position.x,
          y: direction < 0 ? Math.min(naturalY, minimumY) : Math.max(naturalY, minimumY),
        };
      }

      const direction = deltaX < 0 ? -1 : 1;
      const naturalX = badge.position.x + deltaX;
      const minimumX = badge.position.x + direction * (badge.size.width / 2 + size.width / 2 + gap);
      return {
        x: direction < 0 ? Math.min(naturalX, minimumX) : Math.max(naturalX, minimumX),
        y: badge.position.y,
      };
    });
}

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

function chooserBounds(position: OverlapChooserPoint, size: OverlapChooserSize): OverlapChooserBounds {
  return {
    x: position.x - size.width / 2,
    y: position.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

function expandedChooserBounds(bounds: OverlapChooserBounds, padding: number): OverlapChooserBounds {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };
}

function chooserIntersectionArea(a: OverlapChooserBounds, b: OverlapChooserBounds): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

function estimatedBlockedRatio(bounds: OverlapChooserBounds, blockedBoxes: OverlapChooserBounds[]): number {
  const columns = 14;
  const rows = 10;
  let blockedSamples = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const point = {
        x: bounds.x + bounds.width * ((column + 0.5) / columns),
        y: bounds.y + bounds.height * ((row + 0.5) / rows),
      };
      if (blockedBoxes.some((box) => (
        point.x >= box.x && point.x <= box.x + box.width &&
        point.y >= box.y && point.y <= box.y + box.height
      ))) {
        blockedSamples += 1;
      }
    }
  }

  return blockedSamples / (columns * rows);
}

function clampChooserPosition(
  position: OverlapChooserPoint,
  size: OverlapChooserSize,
  mapBounds: OverlapChooserBounds,
): OverlapChooserPoint {
  return {
    x: Math.min(mapBounds.x + mapBounds.width - size.width / 2, Math.max(mapBounds.x + size.width / 2, position.x)),
    y: Math.min(mapBounds.y + mapBounds.height - size.height / 2, Math.max(mapBounds.y + size.height / 2, position.y)),
  };
}

export function chooseOverlapChooserPosition({
  anchor,
  badgeSize,
  chooserSize,
  blockedBoxes,
  mapBounds,
  gap = 28,
}: {
  anchor: OverlapChooserPoint;
  badgeSize: OverlapChooserSize;
  chooserSize: OverlapChooserSize;
  blockedBoxes: OverlapChooserBounds[];
  mapBounds: OverlapChooserBounds;
  gap?: number;
}): OverlapChooserPosition {
  const horizontalOffset = badgeSize.width / 2 + gap + chooserSize.width / 2;
  const verticalOffset = badgeSize.height / 2 + gap + chooserSize.height / 2;
  const horizontalSlide = chooserSize.width * 0.46;
  const verticalSlide = chooserSize.height * 0.58;
  const offsets = [
    { x: 0, y: -verticalOffset },
    { x: horizontalOffset, y: 0 },
    { x: 0, y: verticalOffset },
    { x: -horizontalOffset, y: 0 },
    { x: horizontalSlide, y: -verticalOffset },
    { x: -horizontalSlide, y: -verticalOffset },
    { x: horizontalOffset, y: -verticalSlide },
    { x: horizontalOffset, y: verticalSlide },
    { x: horizontalSlide, y: verticalOffset },
    { x: -horizontalSlide, y: verticalOffset },
    { x: -horizontalOffset, y: verticalSlide },
    { x: -horizontalOffset, y: -verticalSlide },
    { x: horizontalOffset, y: -verticalOffset },
    { x: horizontalOffset, y: verticalOffset },
    { x: -horizontalOffset, y: verticalOffset },
    { x: -horizontalOffset, y: -verticalOffset },
  ];

  const seen = new Set<string>();
  const candidates = offsets.flatMap((offset, index) => {
    const position = clampChooserPosition(
      { x: anchor.x + offset.x, y: anchor.y + offset.y },
      chooserSize,
      mapBounds,
    );
    const key = `${Math.round(position.x)}:${Math.round(position.y)}`;
    if (seen.has(key)) return [];
    seen.add(key);

    const bounds = chooserBounds(position, chooserSize);
    const nearbyBounds = expandedChooserBounds(bounds, 72);
    const collisionAvoided = blockedBoxes.every((box) => chooserIntersectionArea(bounds, box) === 0);
    const blockedRatio = estimatedBlockedRatio(bounds, blockedBoxes);
    const nearbyBlockedRatio = estimatedBlockedRatio(nearbyBounds, blockedBoxes);
    const distance = Math.hypot(position.x - anchor.x, position.y - anchor.y);
    return [{
      position,
      collisionAvoided,
      score: (collisionAvoided ? 0 : 1_000_000_000) + blockedRatio * 100_000_000 + nearbyBlockedRatio * 100_000 + distance,
      index,
    }];
  });

  const best = candidates.sort((a, b) => a.score - b.score || a.index - b.index)[0];
  if (best) return { ...best.position, collisionAvoided: best.collisionAvoided };
  return { ...clampChooserPosition(anchor, chooserSize, mapBounds), collisionAvoided: false };
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

      return {
        signature,
        stationId,
        impacts,
        impactKinds,
      };
    })
    .filter((group): group is StationOverlapBadgeGroup => Boolean(group));
}

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
  placementAnchors?: OverlapChooserPoint[];
  position: OverlapChooserPoint;
  size: OverlapChooserSize;
};

export type ClusteredOverlapBadge = PlacedOverlapBadge & { id: string };
export type OrganizedOverlapBadge = ClusteredOverlapBadge & { layoutKey: string };
export type LockedOverlapBadgeLayouts = ReadonlyMap<
  string,
  ReadonlyMap<string, OverlapChooserPoint>
>;

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
  centerSpacing,
}: {
  anchor: OverlapChooserPoint;
  size: OverlapChooserSize;
  placedBadges: PlacedOverlapBadge[];
  gap: number;
  maxAnchorDistance: number;
  centerSpacing?: number;
}): OverlapChooserPoint[] {
  const nearbyBadges = placedBadges
    .map((badge) => ({
      badge,
      anchorDistance: Math.hypot(anchor.x - badge.anchor.x, anchor.y - badge.anchor.y),
    }))
    .filter(({ anchorDistance }) => anchorDistance > 0 && anchorDistance <= maxAnchorDistance)
    .sort((a, b) => a.anchorDistance - b.anchorDistance
      || a.badge.anchor.y - b.badge.anchor.y
      || a.badge.anchor.x - b.badge.anchor.x
      || a.badge.position.y - b.badge.position.y
      || a.badge.position.x - b.badge.position.x);

  const formationCandidates = centerSpacing
    ? nearbyBadges.flatMap(({ badge: first }, firstIndex) => (
        nearbyBadges.slice(firstIndex + 1).flatMap(({ badge: second }) => {
          const dx = second.position.x - first.position.x;
          const dy = second.position.y - first.position.y;
          const pairDistance = Math.hypot(dx, dy);
          if (pairDistance <= 0 || Math.abs(pairDistance - centerSpacing) > 2) return [];

          const midpoint = {
            x: (first.position.x + second.position.x) / 2,
            y: (first.position.y + second.position.y) / 2,
          };
          const height = Math.sqrt(Math.max(0, centerSpacing ** 2 - (pairDistance / 2) ** 2));
          const perpendicular = { x: -dy / pairDistance, y: dx / pairDistance };
          return [1, -1]
            .map((direction) => ({
              x: midpoint.x + perpendicular.x * height * direction,
              y: midpoint.y + perpendicular.y * height * direction,
            }))
            .sort((a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y)
              - Math.hypot(b.x - anchor.x, b.y - anchor.y));
        })
      ))
    : [];

  const axisCandidates = nearbyBadges.map(({ badge }) => {
      const deltaX = anchor.x - badge.anchor.x;
      const deltaY = anchor.y - badge.anchor.y;
      const followsVerticalLane = Math.abs(deltaY) >= Math.abs(deltaX);

      if (followsVerticalLane) {
        const direction = deltaY < 0 ? -1 : 1;
        const naturalY = badge.position.y + deltaY;
        const minimumDistance = badge.size.height / 2 + size.height / 2 + gap;
        const minimumY = badge.position.y + direction * (centerSpacing ?? minimumDistance);
        return {
          x: badge.position.x,
          y: centerSpacing == null
            ? direction < 0 ? Math.min(naturalY, minimumY) : Math.max(naturalY, minimumY)
            : minimumY,
        };
      }

      const direction = deltaX < 0 ? -1 : 1;
      const naturalX = badge.position.x + deltaX;
      const minimumDistance = badge.size.width / 2 + size.width / 2 + gap;
      const minimumX = badge.position.x + direction * (centerSpacing ?? minimumDistance);
      return {
        x: centerSpacing == null
          ? direction < 0 ? Math.min(naturalX, minimumX) : Math.max(naturalX, minimumX)
          : minimumX,
        y: badge.position.y,
      };
    });

  const seen = new Set<string>();
  return [...formationCandidates, ...axisCandidates].filter((candidate) => {
    const key = `${Math.round(candidate.x)}:${Math.round(candidate.y)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pointAverage(points: OverlapChooserPoint[]): OverlapChooserPoint {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function overlapBadgeComponents(
  badges: ClusteredOverlapBadge[],
  maxAnchorDistance: number,
): number[][] {
  const remaining = new Set(badges.map((_badge, index) => index));
  const components: number[][] = [];

  while (remaining.size > 0) {
    const first = Math.min(...remaining);
    remaining.delete(first);
    const component = [first];
    const queue = [first];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const candidate of [...remaining]) {
        const anchorDistance = Math.hypot(
          badges[current].anchor.x - badges[candidate].anchor.x,
          badges[current].anchor.y - badges[candidate].anchor.y,
        );
        if (anchorDistance > maxAnchorDistance) continue;
        remaining.delete(candidate);
        component.push(candidate);
        queue.push(candidate);
      }
    }

    components.push(component.sort((a, b) => badges[a].id.localeCompare(badges[b].id)));
  }

  return components.sort((a, b) => badges[a[0]].id.localeCompare(badges[b[0]].id));
}

function overlapBadgeComponentLayoutKey(cluster: ClusteredOverlapBadge[]): string {
  return JSON.stringify(cluster.map((badge) => [
    badge.id,
    badge.size.width,
    badge.size.height,
  ]));
}

function centeredFormation(positions: OverlapChooserPoint[]): OverlapChooserPoint[] {
  const center = pointAverage(positions);
  return positions.map((position) => ({
    x: position.x - center.x,
    y: position.y - center.y,
  }));
}

function twoBadgeFormations(
  cluster: ClusteredOverlapBadge[],
  gap: number,
): OverlapChooserPoint[][] {
  const formations: OverlapChooserPoint[][] = [];
  for (const [firstIndex, secondIndex] of [[0, 1], [1, 0]] as const) {
    const horizontalDistance = cluster[firstIndex].size.width / 2
      + gap
      + cluster[secondIndex].size.width / 2;
    const verticalDistance = cluster[firstIndex].size.height / 2
      + gap
      + cluster[secondIndex].size.height / 2;
    const horizontal = cluster.map(() => ({ x: 0, y: 0 }));
    horizontal[firstIndex] = { x: 0, y: 0 };
    horizontal[secondIndex] = { x: horizontalDistance, y: 0 };
    formations.push(centeredFormation(horizontal));

    const vertical = cluster.map(() => ({ x: 0, y: 0 }));
    vertical[firstIndex] = { x: 0, y: 0 };
    vertical[secondIndex] = { x: 0, y: verticalDistance };
    formations.push(centeredFormation(vertical));
  }
  return formations;
}

function threeBadgeFormation(
  cluster: ClusteredOverlapBadge[],
  gap: number,
  apexIndex: number,
  firstBaseIndex: number,
  secondBaseIndex: number,
  apexSide: "top" | "right" | "bottom" | "left",
): OverlapChooserPoint[] {
  const apex = cluster[apexIndex];
  const firstBase = cluster[firstBaseIndex];
  const secondBase = cluster[secondBaseIndex];
  const positions = cluster.map(() => ({ x: 0, y: 0 }));

  if (apexSide === "top" || apexSide === "bottom") {
    positions[firstBaseIndex] = { x: firstBase.size.width / 2, y: firstBase.size.height / 2 };
    positions[secondBaseIndex] = {
      x: firstBase.size.width + gap + secondBase.size.width / 2,
      y: secondBase.size.height / 2,
    };
    positions[apexIndex] = {
      x: firstBase.size.width + gap / 2,
      y: -gap - apex.size.height / 2,
    };
    if (apexSide === "bottom") {
      positions.forEach((position) => {
        position.y = -position.y;
      });
    }
  } else {
    positions[firstBaseIndex] = { x: firstBase.size.width / 2, y: firstBase.size.height / 2 };
    positions[secondBaseIndex] = {
      x: secondBase.size.width / 2,
      y: firstBase.size.height + gap + secondBase.size.height / 2,
    };
    positions[apexIndex] = {
      x: -gap - apex.size.width / 2,
      y: firstBase.size.height + gap / 2,
    };
    if (apexSide === "right") {
      positions.forEach((position) => {
        position.x = -position.x;
      });
    }
  }

  return centeredFormation(positions);
}

function threeBadgeFormations(
  cluster: ClusteredOverlapBadge[],
  gap: number,
): OverlapChooserPoint[][] {
  return cluster.flatMap((_badge, apexIndex) => {
    const baseIndexes = cluster
      .map((_candidate, index) => index)
      .filter((index) => index !== apexIndex);
    return ([baseIndexes, [...baseIndexes].reverse()] as number[][]).flatMap((orderedBaseIndexes) => (
      (["top", "right", "bottom", "left"] as const).map((apexSide) => threeBadgeFormation(
        cluster,
        gap,
        apexIndex,
        orderedBaseIndexes[0],
        orderedBaseIndexes[1],
        apexSide,
      ))
    ));
  });
}

function gridBadgeFormation(
  cluster: ClusteredOverlapBadge[],
  gap: number,
  columnCount: number,
  orderedIndexes: number[],
): OverlapChooserPoint[] {
  const rowCount = Math.ceil(cluster.length / columnCount);
  const slots = orderedIndexes.map((badgeIndex, slotIndex) => ({
    badgeIndex,
    column: slotIndex % columnCount,
    row: Math.floor(slotIndex / columnCount),
  }));
  const columnWidths = Array.from({ length: columnCount }, (_unused, column) => Math.max(
    ...slots.filter((slot) => slot.column === column).map((slot) => cluster[slot.badgeIndex].size.width),
    0,
  ));
  const rowHeights = Array.from({ length: rowCount }, (_unused, row) => Math.max(
    ...slots.filter((slot) => slot.row === row).map((slot) => cluster[slot.badgeIndex].size.height),
    0,
  ));
  const columnCenters = columnWidths.map((width, column) => (
    columnWidths.slice(0, column).reduce((sum, previousWidth) => sum + previousWidth + gap, 0) + width / 2
  ));
  const rowCenters = rowHeights.map((height, row) => (
    rowHeights.slice(0, row).reduce((sum, previousHeight) => sum + previousHeight + gap, 0) + height / 2
  ));
  const positions = cluster.map(() => ({ x: 0, y: 0 }));
  for (const slot of slots) {
    positions[slot.badgeIndex] = {
      x: columnCenters[slot.column],
      y: rowCenters[slot.row],
    };
  }
  return centeredFormation(positions);
}

function gridBadgeFormations(
  cluster: ClusteredOverlapBadge[],
  gap: number,
): OverlapChooserPoint[][] {
  const squareRoot = Math.sqrt(cluster.length);
  const columnCounts = Array.from(new Set([
    Math.ceil(squareRoot),
    Math.floor(squareRoot),
  ])).filter((columnCount) => columnCount > 1);
  const rowMajor = cluster
    .map((_badge, index) => index)
    .sort((left, right) => (
      cluster[left].anchor.y - cluster[right].anchor.y
      || cluster[left].anchor.x - cluster[right].anchor.x
      || cluster[left].id.localeCompare(cluster[right].id)
    ));
  const columnMajor = [...rowMajor].sort((left, right) => (
    cluster[left].anchor.x - cluster[right].anchor.x
    || cluster[left].anchor.y - cluster[right].anchor.y
    || cluster[left].id.localeCompare(cluster[right].id)
  ));
  const orders = [rowMajor, columnMajor];
  return columnCounts.flatMap((columnCount) => orders.map((order) => (
    gridBadgeFormation(cluster, gap, columnCount, order)
  )));
}

function overlapBadgeClusterFormations(
  cluster: ClusteredOverlapBadge[],
  gap: number,
): OverlapChooserPoint[][] {
  const formations = cluster.length === 1
    ? [[{ x: 0, y: 0 }]]
    : cluster.length === 2
      ? twoBadgeFormations(cluster, gap)
      : cluster.length === 3
        ? threeBadgeFormations(cluster, gap)
        : gridBadgeFormations(cluster, gap);
  const seen = new Set<string>();
  return formations.filter((formation) => {
    const key = formation
      .map((position) => `${position.x.toFixed(3)}:${position.y.toFixed(3)}`)
      .join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function* clusterTranslationRings(
  anchorCenters: OverlapChooserPoint[],
  currentCenter: OverlapChooserPoint,
  mapBounds: OverlapChooserBounds,
): Generator<OverlapChooserPoint[]> {
  const uniqueAnchorCenters = anchorCenters.filter((center, index) => anchorCenters.findIndex((candidate) => (
    Math.abs(candidate.x - center.x) < 0.001
    && Math.abs(candidate.y - center.y) < 0.001
  )) === index);
  yield uniqueAnchorCenters;
  const currentDistance = Math.min(...uniqueAnchorCenters.map((anchorCenter) => Math.hypot(
    currentCenter.x - anchorCenter.x,
    currentCenter.y - anchorCenter.y,
  )));
  let currentCenterAdded = currentDistance < 0.001;
  const maximumRadius = Math.hypot(mapBounds.width, mapBounds.height);

  // Map labels and icons can leave narrow, irregular pockets around an alert
  // corridor. Coarse 40-unit/15-degree rings skip those pockets and then admit
  // a much farther legacy fallback as soon as its radius is reached. Search at
  // roughly half a badge-stroke width instead so the first successful ring is
  // also a close approximation of the nearest genuinely clear region.
  for (let radius = 20; radius <= maximumRadius + 20; radius += 20) {
    const ring: OverlapChooserPoint[] = [];
    if (!currentCenterAdded && currentDistance <= radius) {
      ring.push(currentCenter);
      currentCenterAdded = true;
    }
    for (const anchorCenter of uniqueAnchorCenters) {
      for (let degrees = 0; degrees < 360; degrees += 5) {
        const radians = degrees * Math.PI / 180;
        ring.push({
          x: anchorCenter.x + Math.cos(radians) * radius,
          y: anchorCenter.y + Math.sin(radians) * radius,
        });
      }
    }
    yield ring;
  }
}

function badgeAttachmentDistance(
  position: OverlapChooserPoint,
  badge: ClusteredOverlapBadge,
): number {
  const anchors = badge.placementAnchors?.length ? badge.placementAnchors : [badge.anchor];
  return Math.min(...anchors.map((anchor) => Math.hypot(
    position.x - anchor.x,
    position.y - anchor.y,
  )));
}

export function organizeOverlapBadgeClusters({
  badges,
  blockedBoxes,
  mapBounds,
  gap,
  maxAnchorDistance,
  lockedLayouts = new Map(),
}: {
  badges: ClusteredOverlapBadge[];
  blockedBoxes: OverlapChooserBounds[];
  mapBounds: OverlapChooserBounds;
  gap: number;
  maxAnchorDistance: number;
  lockedLayouts?: LockedOverlapBadgeLayouts;
}): OrganizedOverlapBadge[] {
  const lockedPositionsById = new Map<string, OverlapChooserPoint>();
  for (const positions of lockedLayouts.values()) {
    for (const [badgeId, position] of positions) {
      lockedPositionsById.set(badgeId, position);
    }
  }
  const arranged = badges.map((badge) => ({
    ...badge,
    position: { ...(lockedPositionsById.get(badge.id) ?? badge.position) },
  }));
  const components = overlapBadgeComponents(arranged, maxAnchorDistance);
  const layoutKeyByBadgeIndex = new Map<number, string>();

  for (const component of components) {
    const cluster = component.map((index) => arranged[index]);
    const layoutKey = overlapBadgeComponentLayoutKey(cluster);
    component.forEach((badgeIndex) => layoutKeyByBadgeIndex.set(badgeIndex, layoutKey));
    const lockedLayout = lockedLayouts.get(layoutKey);
    if (lockedLayout && cluster.every((badge) => lockedLayout.has(badge.id))) {
      component.forEach((badgeIndex) => {
        arranged[badgeIndex] = {
          ...arranged[badgeIndex],
          position: { ...lockedLayout.get(arranged[badgeIndex].id)! },
        };
      });
      continue;
    }
    const currentCenter = pointAverage(cluster.map((badge) => badge.position));
    const anchorCenter = pointAverage(cluster.map((badge) => badge.anchor));
    const translationAnchors = cluster.length === 1 && cluster[0].placementAnchors?.length
      ? cluster[0].placementAnchors
      : [anchorCenter];
    const formations = overlapBadgeClusterFormations(cluster, gap);

    const componentSet = new Set(component);
    const outsideBadgeBoxes = arranged.flatMap((badge, index) => componentSet.has(index)
      ? []
      : [expandedChooserBounds(chooserBounds(badge.position, badge.size), 12)]);
    const obstacles = [...blockedBoxes, ...outsideBadgeBoxes];
    let best: { positions: OverlapChooserPoint[]; score: number; order: number } | null = null;
    let order = 0;

    for (const translationRing of clusterTranslationRings(translationAnchors, currentCenter, mapBounds)) {
      for (const center of translationRing) {
        for (const formation of formations) {
          order += 1;
          const positions = formation.map((position) => ({
            x: center.x + position.x,
            y: center.y + position.y,
          }));
          const boxes = positions.map((position, index) => (
            expandedChooserBounds(chooserBounds(position, cluster[index].size), 10)
          ));
          const staysInsideMap = boxes.every((box) => (
            box.x >= mapBounds.x
            && box.y >= mapBounds.y
            && box.x + box.width <= mapBounds.x + mapBounds.width
            && box.y + box.height <= mapBounds.y + mapBounds.height
          ));
          const clearsObstacles = boxes.every((box) => obstacles.every(
            (obstacle) => chooserIntersectionArea(box, obstacle) === 0,
          ));
          const clearsSiblings = boxes.every((box, index) => boxes.slice(index + 1).every(
            (sibling) => chooserIntersectionArea(box, sibling) === 0,
          ));
          if (!staysInsideMap || !clearsObstacles || !clearsSiblings) continue;

          const attachmentDistance = positions.reduce((sum, position, index) => (
            sum + badgeAttachmentDistance(position, cluster[index])
          ), 0);
          const midpointDistance = positions.reduce((sum, position, index) => sum + Math.hypot(
            position.x - cluster[index].anchor.x,
            position.y - cluster[index].anchor.y,
          ), 0);
          const movementDistance = positions.reduce((sum, position, index) => sum + Math.hypot(
            position.x - cluster[index].position.x,
            position.y - cluster[index].position.y,
          ), 0);
          const score = attachmentDistance + midpointDistance * 0.01 + movementDistance * 0.05;
          if (!best || score < best.score || (score === best.score && order < best.order)) {
            best = { positions, score, order };
          }
        }
      }
      if (best) break;
    }

    if (!best) continue;
    component.forEach((badgeIndex, index) => {
      arranged[badgeIndex] = {
        ...arranged[badgeIndex],
        position: best.positions[index],
      };
    });
  }

  return arranged.map((badge, index) => ({
    ...badge,
    layoutKey: layoutKeyByBadgeIndex.get(index) ?? overlapBadgeComponentLayoutKey([badge]),
  }));
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
    .filter((group): group is StationOverlapBadgeGroup => Boolean(group))
    .sort((a, b) => a.stationId.localeCompare(b.stationId) || a.signature.localeCompare(b.signature));
}

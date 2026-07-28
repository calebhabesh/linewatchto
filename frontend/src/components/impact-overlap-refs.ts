import type {
  ActiveAlert,
  DelayAlert,
  ImpactKind,
  ImpactSelection,
  MapImpact,
  NetworkSegment,
  PlannedClosure,
  ReducedSpeedZone,
  StationNodeImpact,
} from "../app/linewatch-data";

type CurrentImpact = {
  kind: ImpactKind;
  id: string;
  segmentIds: string[];
};

type OverlapSourceData = {
  networkSegments: NetworkSegment[];
  activeAlerts: ActiveAlert[];
  delays: DelayAlert[];
  reducedSpeedZones: ReducedSpeedZone[];
  plannedClosures: PlannedClosure[];
  stationNodeImpacts: StationNodeImpact[];
};

export type OverlappingImpactRef = {
  key: string;
  kind: ImpactKind;
  label: string;
  location: string;
  selection: NonNullable<ImpactSelection>;
};

function impactKindForActiveAlert(alert: ActiveAlert): ImpactKind {
  if (alert.severity === "delay") return "delay";
  return "suspension";
}

function labelForActiveAlert(alert: ActiveAlert): string {
  if (alert.severity === "delay") return "Delay";
  return "Active Alert";
}

function segmentsOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const aIds = new Set(a);
  return b.some((segmentId) => aIds.has(segmentId));
}

function idsOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const aIds = new Set(a);
  return b.some((id) => aIds.has(id));
}

function uniqueSegmentIds(segmentIds: string[]): string[] {
  return Array.from(new Set(segmentIds.filter(Boolean)));
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

function impactMatchesSelection(
  impact: Pick<MapImpact, "kind" | "cardId">,
  selection: NonNullable<ImpactSelection>,
) {
  if (impact.cardId !== selection.id) return false;
  if (impact.kind === selection.kind) return true;

  return (
    (impact.kind === "suspension" || impact.kind === "planned-closure") &&
    (selection.kind === "suspension" || selection.kind === "planned-closure")
  );
}

function mapSegmentIdsForSelection(
  selection: NonNullable<ImpactSelection>,
  networkSegments: NetworkSegment[],
): string[] {
  return networkSegments
    .filter((segment) => (segment.impacts ?? []).some((impact) => impactMatchesSelection(impact, selection)))
    .map((segment) => segment.id);
}

function segmentIdsForSelection(
  selection: NonNullable<ImpactSelection>,
  explicitSegmentIds: string[],
  networkSegments: NetworkSegment[],
): string[] {
  return uniqueSegmentIds([
    ...explicitSegmentIds,
    ...mapSegmentIdsForSelection(selection, networkSegments),
  ]);
}

function stationIdsForSegments(
  segmentIds: string[],
  networkSegments: NetworkSegment[],
): string[] {
  const selectedSegmentIds = new Set(segmentIds);
  return uniqueIds(
    networkSegments
      .filter((segment) => selectedSegmentIds.has(segment.id))
      .flatMap((segment) => [segment.stationAId, segment.stationBId].filter((stationId): stationId is string => Boolean(stationId))),
  );
}

function stationIdsForSelection(
  selection: NonNullable<ImpactSelection>,
  stationNodeImpacts: StationNodeImpact[],
): string[] {
  return uniqueIds(
    stationNodeImpacts
      .filter((impact) => impactMatchesSelection(impact, selection))
      .map((impact) => impact.stationId),
  );
}

function footprintForSelection(
  selection: NonNullable<ImpactSelection>,
  explicitSegmentIds: string[],
  data: Pick<OverlapSourceData, "networkSegments" | "stationNodeImpacts">,
): { segmentIds: string[]; stationIds: string[] } {
  const segmentIds = segmentIdsForSelection(selection, explicitSegmentIds, data.networkSegments);
  return {
    segmentIds,
    stationIds: uniqueIds([
      ...stationIdsForSegments(segmentIds, data.networkSegments),
      ...stationIdsForSelection(selection, data.stationNodeImpacts),
    ]),
  };
}

export function getOverlappingImpactRefs(
  currentImpact: CurrentImpact,
  data: OverlapSourceData,
): OverlappingImpactRef[] {
  const refs: OverlappingImpactRef[] = [];
  const seen = new Set<string>();
  const currentSelection = { kind: currentImpact.kind, id: currentImpact.id };
  const currentFootprint = footprintForSelection(
    currentSelection,
    currentImpact.segmentIds,
    data,
  );
  const currentActiveAlert = data.activeAlerts.find((alert) => alert.id === currentImpact.id);
  const relatedPlannedClosureId = currentActiveAlert?.relatedPlannedClosureId;
  const activePlannedClosureIds = new Set(
    data.activeAlerts
      .filter((alert) => alert.severity === "planned")
      .flatMap((alert) => [alert.id, alert.relatedPlannedClosureId])
      .filter((id): id is string => Boolean(id)),
  );

  const addRef = (ref: OverlappingImpactRef, segmentIds: string[]) => {
    if (ref.selection.id === currentImpact.id) {
      return;
    }
    const refFootprint = footprintForSelection(ref.selection, segmentIds, data);
    if (
      !segmentsOverlap(currentFootprint.segmentIds, refFootprint.segmentIds) &&
      !idsOverlap(currentFootprint.stationIds, refFootprint.stationIds)
    ) {
      return;
    }
    if (seen.has(ref.key)) {
      return;
    }
    seen.add(ref.key);
    refs.push(ref);
  };

  for (const alert of data.activeAlerts) {
    if (alert.relatedPlannedClosureId === currentImpact.id) {
      continue;
    }
    const kind = impactKindForActiveAlert(alert);
    addRef(
      {
        key: `${kind}-${alert.id}`,
        kind,
        label: labelForActiveAlert(alert),
        location: alert.location,
        selection: { kind, id: alert.id },
      },
      alert.affectedSegmentIds ?? [],
    );
  }

  for (const closure of data.plannedClosures) {
    if (closure.id === relatedPlannedClosureId || activePlannedClosureIds.has(closure.id)) {
      continue;
    }
    addRef(
      {
        key: `planned-closure-${closure.id}`,
        kind: "planned-closure",
        label: "Planned Closure",
        location: closure.location,
        selection: { kind: "planned-closure", id: closure.id },
      },
      closure.previewSegmentIds ?? [],
    );
  }

  for (const delay of data.delays) {
    addRef(
      {
        key: `delay-${delay.id}`,
        kind: "delay",
        label: "Delay",
        location: delay.location,
        selection: { kind: "delay", id: delay.id },
      },
      delay.affectedSegmentIds ?? [],
    );
  }

  for (const zone of data.reducedSpeedZones) {
    addRef(
      {
        key: `reduced-speed-zone-${zone.id}`,
        kind: "reduced-speed-zone",
        label: "Reduced Speed Zone",
        location: zone.location,
        selection: { kind: "reduced-speed-zone", id: zone.id },
      },
      zone.affectedSegmentIds ?? [],
    );
  }

  return refs;
}

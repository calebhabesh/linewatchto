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

const IMPACT_KIND_ORDER: ImpactKind[] = [
  "suspension",
  "delay",
  "reduced-speed-zone",
  "planned-closure",
];

type StationImpactTypeData = {
  networkSegments: NetworkSegment[];
  stationNodeImpacts: StationNodeImpact[];
};

type StationImpactSelectionData = {
  activeAlerts: ActiveAlert[];
  delays: DelayAlert[];
  plannedClosures: PlannedClosure[];
  reducedSpeedZones: ReducedSpeedZone[];
};

type StationImpactRouteData = StationImpactTypeData & StationImpactSelectionData;

export function distinctStationImpacts<T extends { id: string }>(
  impacts: T[],
  data: StationImpactSelectionData,
): T[] {
  const impactsByCanonicalSelection = new Map<string, T>();
  for (const impact of impacts) {
    const selection = stationImpactSelection(impact.id, data);
    const identity = selection
      ? `${selection.kind}|${selection.id}`
      : `source-alert|${impact.id}`;
    if (!impactsByCanonicalSelection.has(identity)) {
      impactsByCanonicalSelection.set(identity, impact);
    }
  }
  return [...impactsByCanonicalSelection.values()];
}

export function stationImpactSelection(
  impactId: string,
  data: StationImpactSelectionData,
): NonNullable<ImpactSelection> | null {
  const reducedSpeedZone = data.reducedSpeedZones.find(
    (impact) => impact.id === impactId || impact.sourceAlertIds.includes(impactId),
  );
  if (reducedSpeedZone) return { kind: "reduced-speed-zone", id: reducedSpeedZone.id };

  const activeAlert = data.activeAlerts.find(
    (impact) => impact.id === impactId || impact.relatedPlannedClosureId === impactId,
  );
  if (activeAlert) {
    const kind = activeAlert.severity === "planned"
      ? "planned-closure"
      : activeAlert.severity === "suspension"
        ? "suspension"
        : "delay";
    return { kind, id: activeAlert.id };
  }

  const delay = data.delays.find((impact) => impact.id === impactId);
  if (delay) return { kind: "delay", id: delay.id };

  const plannedClosure = data.plannedClosures.find((impact) => impact.id === impactId);
  if (plannedClosure) return { kind: "planned-closure", id: plannedClosure.id };

  return null;
}

export function stationImpactKindsByStation(data: StationImpactTypeData) {
  const kindsByStation = new Map<string, Set<ImpactKind>>();
  const add = (stationId: string | undefined, kind: ImpactKind) => {
    if (!stationId) return;
    const kinds = kindsByStation.get(stationId) ?? new Set<ImpactKind>();
    kinds.add(kind);
    kindsByStation.set(stationId, kinds);
  };

  for (const impact of data.stationNodeImpacts) {
    add(impact.stationId, impact.kind);
  }

  for (const segment of data.networkSegments) {
    for (const impact of segment.impacts ?? []) {
      add(segment.stationAId, impact.kind);
      add(segment.stationBId, impact.kind);
    }
  }

  return new Map(
    [...kindsByStation].map(([stationId, kinds]) => [
      stationId,
      IMPACT_KIND_ORDER.filter((kind) => kinds.has(kind)),
    ]),
  );
}

export function stationImpactSelectionsByStation(data: StationImpactRouteData) {
  const selectionsByStation = new Map<string, Map<string, NonNullable<ImpactSelection>>>();
  const add = (stationId: string | undefined, impactId: string) => {
    if (!stationId) return;
    const selection = stationImpactSelection(impactId, data);
    if (!selection) return;
    const selections = selectionsByStation.get(stationId) ?? new Map<string, NonNullable<ImpactSelection>>();
    selections.set(`${selection.kind}|${selection.id}`, selection);
    selectionsByStation.set(stationId, selections);
  };

  for (const impact of data.stationNodeImpacts) {
    add(impact.stationId, impact.cardId);
  }

  const segmentsById = new Map(data.networkSegments.map((segment) => [segment.id, segment]));
  for (const segment of data.networkSegments) {
    for (const impact of segment.impacts ?? []) {
      add(segment.stationAId, impact.cardId);
      add(segment.stationBId, impact.cardId);
    }
  }

  for (const closure of data.plannedClosures) {
    for (const segmentId of closure.previewSegmentIds) {
      const segment = segmentsById.get(segmentId);
      add(segment?.stationAId, closure.id);
      add(segment?.stationBId, closure.id);
    }
  }

  return new Map(
    [...selectionsByStation].map(([stationId, selections]) => [stationId, [...selections.values()]]),
  );
}

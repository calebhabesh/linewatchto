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

export function stationImpactSelection(
  impactId: string,
  data: StationImpactSelectionData,
): NonNullable<ImpactSelection> | null {
  const reducedSpeedZone = data.reducedSpeedZones.find(
    (impact) => impact.id === impactId || impact.sourceAlertIds.includes(impactId),
  );
  if (reducedSpeedZone) return { kind: "reduced-speed-zone", id: reducedSpeedZone.id };

  const activeAlert = data.activeAlerts.find((impact) => impact.id === impactId);
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

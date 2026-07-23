import type { ImpactKind, NetworkSegment, StationNodeImpact } from "./linewatch-data.ts";

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

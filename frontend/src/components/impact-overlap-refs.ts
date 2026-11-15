import { serviceEffectLabel } from "../app/alert-categories.ts";
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
import { stationImpactDirectionSource } from "./station-impact-direction.ts";
import {
  anyStationTouchesMeet,
  segmentStationTouches,
  stationLineDotLookup,
  type StationTouch,
} from "./station-dots.ts";

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
  return "Suspension";
}

function overlapPriority(kind: ImpactKind): number {
  switch (kind) {
    case "suspension":
      return 0;
    case "delay":
      return 1;
    case "reduced-speed-zone":
      return 2;
    case "planned-closure":
      return 3;
    default:
      return 4;
  }
}

function segmentsOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const aIds = new Set(a);
  return b.some((segmentId) => aIds.has(segmentId));
}

function uniqueSegmentIds(segmentIds: string[]): string[] {
  return Array.from(new Set(segmentIds.filter(Boolean)));
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

/** Where the selected segments end, each on the dot it is drawn on (station-dots.ts). */
function stationTouchesForSegments(
  segmentIds: string[],
  networkSegments: NetworkSegment[],
): StationTouch[] {
  const selectedSegmentIds = new Set(segmentIds);
  return networkSegments
    .filter((segment) => selectedSegmentIds.has(segment.id))
    .flatMap(segmentStationTouches);
}

/** A selection's station alerts, on their line's dot where the station has one per line. */
function stationTouchesForSelection(
  selection: NonNullable<ImpactSelection>,
  data: Pick<OverlapSourceData, "stationNodeImpacts" | "activeAlerts" | "delays" | "reducedSpeedZones" | "plannedClosures">,
  lineDot: (stationId: string, lineId: string | null | undefined) => string | null,
): StationTouch[] {
  return data.stationNodeImpacts
    .filter((impact) => impactMatchesSelection(impact, selection))
    .map((impact) => ({
      stationId: impact.stationId,
      dotId: lineDot(impact.stationId, stationImpactDirectionSource(impact, data)?.lineId),
    }));
}

function footprintForSelection(
  selection: NonNullable<ImpactSelection>,
  explicitSegmentIds: string[],
  data: OverlapSourceData,
  lineDot: (stationId: string, lineId: string | null | undefined) => string | null,
): { segmentIds: string[]; stationTouches: StationTouch[] } {
  const segmentIds = segmentIdsForSelection(selection, explicitSegmentIds, data.networkSegments);
  return {
    segmentIds,
    stationTouches: [
      ...stationTouchesForSegments(segmentIds, data.networkSegments),
      ...stationTouchesForSelection(selection, data, lineDot),
    ],
  };
}

/**
 * Alerts that share a stretch of line or meet at a station's drawn mark, as
 * the map's overlap badges count them: KI and UP alerts that only meet at
 * Bloor's separate KI and UP dots do not overlap.
 */
export function getOverlappingImpactRefs(
  currentImpact: CurrentImpact,
  data: OverlapSourceData,
): OverlappingImpactRef[] {
  const refs: OverlappingImpactRef[] = [];
  const seen = new Set<string>();
  const currentSelection = { kind: currentImpact.kind, id: currentImpact.id };
  const lineDot = stationLineDotLookup(data.networkSegments);
  const currentFootprint = footprintForSelection(
    currentSelection,
    currentImpact.segmentIds,
    data,
    lineDot,
  );
  const currentActiveAlert = data.activeAlerts.find((alert) => alert.id === currentImpact.id);
  const relatedPlannedClosureId = currentActiveAlert?.relatedPlannedClosureId
    ?? data.delays.find(delay => delay.id === currentImpact.id)?.relatedPlannedClosureId;
  const activePlannedClosureIds = new Set(
    [...data.activeAlerts
      .filter((alert) => alert.severity === "planned")
      .flatMap((alert) => [alert.id, alert.relatedPlannedClosureId])
      .filter((id): id is string => Boolean(id)),
    ...data.delays.flatMap(delay => delay.relatedPlannedClosureId ? [delay.relatedPlannedClosureId] : [])],
  );

  const addRef = (ref: OverlappingImpactRef, segmentIds: string[]) => {
    if (ref.selection.id === currentImpact.id) {
      return;
    }
    const refFootprint = footprintForSelection(ref.selection, segmentIds, data, lineDot);
    if (
      !segmentsOverlap(currentFootprint.segmentIds, refFootprint.segmentIds) &&
      !anyStationTouchesMeet(currentFootprint.stationTouches, refFootprint.stationTouches)
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
        label: serviceEffectLabel(closure, true),
        location: closure.location,
        selection: { kind: "planned-closure", id: closure.id },
      },
      closure.previewSegmentIds ?? [],
    );
  }

  for (const delay of data.delays) {
    if (delay.relatedPlannedClosureId === currentImpact.id) continue;
    addRef(
      {
        key: `delay-${delay.id}`,
        kind: "delay",
        label: serviceEffectLabel(delay),
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

  return refs
    .map((ref, index) => ({ ref, index }))
    .sort((a, b) => overlapPriority(a.ref.kind) - overlapPriority(b.ref.kind) || a.index - b.index)
    .map(({ ref }) => ref);
}

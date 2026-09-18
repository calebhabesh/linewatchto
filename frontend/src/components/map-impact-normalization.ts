import type {
  ActiveAlert,
  ImpactSelection,
  MapImpactKind,
} from "../app/linewatch-data";
import type { NetworkId } from "../app/regional-data";

export function resolveCommuteImpactMapSelection(
  impact: { id: string; kind: MapImpactKind },
  activeAlerts: ActiveAlert[],
  networkId: NetworkId = "ttc",
): NonNullable<ImpactSelection> {
  if (networkId !== "ttc" || impact.kind !== "planned-closure") {
    return { kind: impact.kind, id: impact.id };
  }

  const activeAlert = activeAlerts.find((alert) =>
    alert.id === impact.id || alert.relatedPlannedClosureId === impact.id,
  );

  return activeAlert
    ? { kind: "suspension", id: activeAlert.id }
    : { kind: "planned-closure", id: impact.id };
}

export {
  buildActiveClosureImpactCardIds,
  normalizeActiveClosureMapImpact,
  getEligiblePlannedClosures,
  selectUnifiedLogicalImpacts,
  countUniqueImpactsByKind,
} from "../app/map-alert-selector.ts";

import type {
  ActiveAlert,
  MapImpact,
  PlannedClosure,
} from "../app/linewatch-data";

export function buildActiveClosureImpactCardIds(
  activeAlerts: ActiveAlert[],
  plannedClosures: PlannedClosure[],
): Map<string, string> {
  const cardIds = new Map<string, string>();

  for (const closure of plannedClosures) {
    if (!closure.activeNow && closure.timingStatus !== "active-now") continue;
    const activeAlert = activeAlerts.find((alert) =>
      alert.id === closure.id || alert.relatedPlannedClosureId === closure.id,
    );
    cardIds.set(closure.id, activeAlert?.id ?? closure.id);
  }

  for (const alert of activeAlerts) {
    if (alert.severity !== "planned") continue;
    cardIds.set(alert.id, alert.id);
    if (alert.relatedPlannedClosureId) {
      cardIds.set(alert.relatedPlannedClosureId, alert.id);
    }
  }

  return cardIds;
}

export function normalizeActiveClosureMapImpact(
  impact: MapImpact,
  activeClosureImpactCardIds: Map<string, string>,
): MapImpact {
  if (impact.kind !== "planned-closure") return impact;
  const activeCardId = activeClosureImpactCardIds.get(impact.cardId);
  if (!activeCardId) return impact;

  return {
    ...impact,
    kind: "suspension",
    cardId: activeCardId,
    sourceAlertIds: [activeCardId],
  };
}

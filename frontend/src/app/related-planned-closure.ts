import type { ActiveAlert, PlannedClosure } from "./linewatch-data";

export function relatedPlannedClosureId(
  alert: Pick<ActiveAlert, "id" | "relatedPlannedClosureId">,
  closures: Pick<PlannedClosure, "id" | "activeNow">[],
): string | undefined {
  if (alert.relatedPlannedClosureId) {
    return closures.find((closure) => closure.id === alert.relatedPlannedClosureId)?.id;
  }
  return closures.find((closure) => closure.id === alert.id && closure.activeNow)?.id;
}

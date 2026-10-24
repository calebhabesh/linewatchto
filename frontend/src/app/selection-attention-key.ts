import type { ActiveAlert, DelayAlert, ImpactSelection, PlannedClosure } from "./linewatch-data";

type LinkedImpactData = {
  activeAlerts: Pick<ActiveAlert, "id" | "relatedPlannedClosureId">[];
  delays: Pick<DelayAlert, "id" | "relatedPlannedClosureId">[];
  plannedClosures: Pick<PlannedClosure, "id" | "activeNow">[];
};

export type SelectionAttentionAnchor = {
  selection: NonNullable<ImpactSelection>;
  generation: number;
  key: string;
};

/** True when one selection is a planned advisory and the other is the current impact it links to. */
export function isLinkedPlannedImpactHop(
  from: NonNullable<ImpactSelection>,
  to: NonNullable<ImpactSelection>,
  data: LinkedImpactData,
): boolean {
  const planned = from.kind === "planned-closure" ? from : to.kind === "planned-closure" ? to : null;
  const current = planned === from ? to : from;
  if (!planned || current.kind === "planned-closure" || current.kind === "reduced-speed-zone") return false;

  const closure = data.plannedClosures.find((item) => item.id === planned.id);
  if (!closure) return false;
  const impacts = current.kind === "delay" ? data.delays : data.activeAlerts;
  const impact = impacts.find((item) => item.id === current.id);
  return Boolean(impact && (
    impact.relatedPlannedClosureId === closure.id || (closure.activeNow && impact.id === closure.id)
  ));
}

/**
 * Key that restarts the map's fast selection intro when it changes. Hopping
 * between a planned advisory and its linked current impact highlights the same
 * service on the map, so the hop inherits the previous key and keeps breathing.
 * A `restored` selection (Back to an impact already shown) continues the same way.
 */
export function resolveSelectionAttentionAnchor(
  previous: SelectionAttentionAnchor | null,
  selection: ImpactSelection,
  generation: number,
  data: LinkedImpactData,
  restored = false,
): SelectionAttentionAnchor | null {
  if (!selection) return null;
  if (previous && previous.generation === generation
    && previous.selection.kind === selection.kind && previous.selection.id === selection.id) {
    return previous;
  }
  const key = previous && (restored || isLinkedPlannedImpactHop(previous.selection, selection, data))
    ? previous.key
    : `${selection.kind}:${selection.id}:${generation}`;
  return { selection, generation, key };
}

import type { MapImpactKind } from "../../app/linewatch-data";

/** An alert a side panel row is hovering or keyboard-focusing, so the map can raise it. */
export type PanelImpactHover = { kind: MapImpactKind; id: string };

type Listener = (impact: PanelImpactHover | null) => void;

let current: PanelImpactHover | null = null;
const listeners = new Set<Listener>();

function same(a: PanelImpactHover | null, b: PanelImpactHover | null) {
  return a?.kind === b?.kind && a?.id === b?.id;
}

/** Raises `impact` on the visible map as a hover would; null ends the panel hover. */
export function setPanelImpactHover(impact: PanelImpactHover | null) {
  const next = impact ? { kind: impact.kind, id: impact.id } : null;
  if (same(current, next)) return;
  current = next;
  listeners.forEach((listener) => listener(current));
}

/** Ends the panel hover only if `impact` still owns it (a later row may have taken over). */
export function endPanelImpactHover(impact: PanelImpactHover) {
  if (same(current, impact)) setPanelImpactHover(null);
}

/** Calls `listener` now and on every change; returns the unsubscribe. */
export function subscribePanelImpactHover(listener: Listener) {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}

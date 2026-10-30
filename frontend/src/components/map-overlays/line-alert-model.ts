import type { ImpactSelection, MapImpactKind, TravelDirection } from "../../app/linewatch-data.ts";
import { getImpactPriority } from "../../app/map-alert-selector.ts";

/** How a line alert is drawn. Each network maps its alerts to one of these. */
export type MapOverlayVisualState =
  | "suspension"
  | "delay-static"
  | "reduced-speed-zone"
  | "planned-preview";

/**
 * One line alert as both maps draw it: a tube over the line with the alert's
 * glyphs. Each network's adapter builds these from its own geometry.
 */
export type MapLineAlert = {
  /** Stable while the alert's drawing is unchanged; React keys on it. */
  key: string;
  kind: MapImpactKind;
  impactId: string;
  lineId: string;
  /** The tube's centre line, in overlay coordinates. */
  pathD: string;
  travelDirection: TravelDirection;
  visualState: MapOverlayVisualState;
  /** Accessible name of the alert's map target. */
  label: string;
  segmentIds: string[];
  /** Still drawn while it fades out after leaving the data. */
  exiting?: boolean;
};

export function isSelectedLineAlert(alert: Pick<MapLineAlert, "kind" | "impactId">, selection: ImpactSelection) {
  return selection?.kind === alert.kind && selection.id === alert.impactId;
}

/** Alerts paint by kind priority, so a suspension sits over a delay. */
export function lineAlertPaintOrder<T extends Pick<MapLineAlert, "kind">>(alerts: T[]): T[] {
  return [...alerts].sort((a, b) => getImpactPriority(a.kind) - getImpactPriority(b.kind));
}

/** Path data per alert (`kind:id`), for group previews that outline several alerts. */
export function lineAlertPathsByImpact(alerts: MapLineAlert[]): Map<string, string[]> {
  const paths = new Map<string, string[]>();
  for (const alert of alerts) {
    if (alert.exiting) continue;
    const key = `${alert.kind}:${alert.impactId}`;
    const list = paths.get(key);
    if (!list) paths.set(key, [alert.pathD]);
    else if (!list.includes(alert.pathD)) list.push(alert.pathD);
  }
  return paths;
}

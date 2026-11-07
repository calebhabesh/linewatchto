import type {
  ActiveAlert,
  DelayAlert,
  ImpactSelection,
  MapImpactKind,
  NetworkSegment,
  PlannedClosure,
  ReducedSpeedZone,
  StationNodeImpact,
} from "../../app/linewatch-data.ts";
import { getImpactPriority, plannedAdvisoryStationImpacts } from "../../app/map-alert-selector.ts";
import { activeImpactsForSegment, type OverlapBadgeSourceSegment } from "../map-overlap-badges.ts";

/*
 * Station alerts a map draws, for every map (TTC and GO/UP System Maps, Map
 * View): each map takes them from `mapStationAlertImpacts`. A station alert
 * whose stop already sits inside another alert's line overlay, on the same
 * line and at least as severe, adds nothing the line does not show: its ring and the overlap badge it would add are noise. Sources
 * (Metrolinx especially) publish station lists beside the line notice they
 * repeat, and ingestion cannot recognise every new shape of that, so the map
 * keeps such repeats from stacking. The alert stays in the lists, the station
 * details, and commute matching; selecting it draws it again.
 */

/** Cards with the line they belong to: active alerts, delays, Reduced Speed Zones, planned closures. */
export type StationImpactCards = readonly { id: string; lineId: string }[];

export type RedundantStationImpactSegment = Pick<NetworkSegment, "lineId"> & OverlapBadgeSourceSegment;

const coversStation = (kind: MapImpactKind) => kind !== "planned-closure";

/** Each card's line, by card id. */
export function stationImpactCardLines(...cardLists: (StationImpactCards | undefined)[]): Map<string, string> {
  const lines = new Map<string, string>();
  for (const cards of cardLists) {
    for (const card of cards ?? []) lines.set(card.id, card.lineId);
  }
  return lines;
}

/**
 * The station alerts to draw: all of them, except a current station alert at a
 * stop where every segment of its own line carries another card's current,
 * both-direction impact at least as severe. A selected alert is always drawn.
 */
export function withoutRedundantStationImpacts<I extends Pick<StationNodeImpact, "stationId" | "kind" | "cardId">>(
  stationImpacts: readonly I[],
  segments: readonly RedundantStationImpactSegment[],
  cardLines: ReadonlyMap<string, string>,
  selection?: ImpactSelection,
): I[] {
  if (stationImpacts.length === 0) return [...stationImpacts];
  const segmentsByStation = new Map<string, RedundantStationImpactSegment[]>();
  for (const segment of segments) {
    for (const stationId of [segment.stationAId, segment.stationBId]) {
      if (!stationId) continue;
      segmentsByStation.set(stationId, [...(segmentsByStation.get(stationId) ?? []), segment]);
    }
  }

  return stationImpacts.filter((impact) => {
    if (!coversStation(impact.kind) || selection?.id === impact.cardId) return true;
    const lineId = cardLines.get(impact.cardId);
    if (!lineId) return true;
    const ownLine = (segmentsByStation.get(impact.stationId) ?? []).filter((segment) => segment.lineId === lineId);
    if (ownLine.length === 0) return true;
    const severity = getImpactPriority(impact.kind);
    const covered = ownLine.every((segment) => activeImpactsForSegment(segment).some((other) => (
      other.cardId !== impact.cardId
      && coversStation(other.kind)
      && (other.travelDirection ?? "bidirectional") === "bidirectional"
      && getImpactPriority(other.kind) >= severity
    )));
    return !covered;
  });
}

/** What decides a map's station alerts, as each map receives it from the dashboard. */
export type MapStationAlertData = {
  networkSegments: readonly RedundantStationImpactSegment[];
  activeAlerts: ActiveAlert[];
  delays?: DelayAlert[];
  reducedSpeedZones?: ReducedSpeedZone[];
  plannedClosures: PlannedClosure[];
  /** Current station alerts from the dashboard. */
  stationNodeImpacts: readonly StationNodeImpact[];
  selection?: ImpactSelection;
};

/**
 * The station alerts every map draws: the current ones and station-only planned
 * advisories (upcoming ones always, a current one only while selected), each
 * once, less those another alert on their line already shows. Line alerts still
 * read the dashboard's full list, so a hidden station alert never becomes a
 * line-wide one.
 */
export function mapStationAlertImpacts(data: MapStationAlertData): StationNodeImpact[] {
  const seen = new Set<string>();
  const impacts = [
    ...data.stationNodeImpacts,
    ...plannedAdvisoryStationImpacts(data.plannedClosures, data.activeAlerts, data.delays, data.selection),
  ].filter((impact) => {
    const key = `${impact.kind}:${impact.cardId}:${impact.stationId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return withoutRedundantStationImpacts(
    impacts,
    data.networkSegments,
    stationImpactCardLines(data.activeAlerts, data.delays, data.reducedSpeedZones, data.plannedClosures),
    data.selection,
  );
}

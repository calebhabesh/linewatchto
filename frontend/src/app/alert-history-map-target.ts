import type { AlertHistoryIncident } from "./alert-history-data.ts";
import type { AccountCommutePathPreview } from "./commute-data.ts";
import type { DashboardData } from "./dashboard-contract.ts";
import type { ImpactSelection, NetworkSegment } from "./linewatch-data.ts";
import { stationImpactSelection } from "./station-impact-types.ts";

/**
 * Where Alert History's View goes. An alert still listed opens its live card,
 * as the alert menus' View does. Any other alert is drawn from the stations
 * history recorded for it: its line's stretch between the outermost of them
 * (one station's alert marks just that station), as a neutral route preview
 * that is never mistaken for a current disruption.
 */
export type AlertHistoryMapTarget =
  | { type: "live"; selection: NonNullable<ImpactSelection> }
  | { type: "path"; preview: AccountCommutePathPreview };

type MapTargetData = Pick<
  DashboardData,
  "activeAlerts" | "delays" | "plannedClosures" | "reducedSpeedZones" | "networkSegments"
>;

function liveSelection(alertId: string, data: MapTargetData): NonNullable<ImpactSelection> | null {
  const listed = stationImpactSelection(alertId, data);
  if (listed) return listed;
  // A card that folded this alert into another still names it on the map.
  for (const segment of data.networkSegments) {
    const impact = segment.impacts?.find((candidate) => candidate.cardId === alertId || candidate.sourceAlertIds.includes(alertId));
    if (impact) return { kind: impact.kind, id: impact.cardId };
  }
  return null;
}

/** Breadth-first distances and parent links from `start` over one line's segments. */
function walkLine(start: string, adjacency: Map<string, Array<{ station: string; segmentId: string }>>) {
  const previous = new Map<string, { station: string; segmentId: string } | null>([[start, null]]);
  const distance = new Map<string, number>([[start, 0]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const station = queue[index];
    for (const next of adjacency.get(station) ?? []) {
      if (distance.has(next.station)) continue;
      distance.set(next.station, (distance.get(station) ?? 0) + 1);
      previous.set(next.station, { station, segmentId: next.segmentId });
      queue.push(next.station);
    }
  }
  return { previous, distance };
}

function farthest(stations: string[], distance: Map<string, number>): string {
  return stations.reduce((best, station) => ((distance.get(station) ?? -1) > (distance.get(best) ?? -1) ? station : best));
}

/** The line's stations and segments spanning every named station it has, in line order from the first end found. */
export function alertHistoryLineSpan(
  lineId: string,
  stationIds: readonly string[],
  segments: readonly NetworkSegment[],
): { stationIds: string[]; segmentIds: string[] } | null {
  const adjacency = new Map<string, Array<{ station: string; segmentId: string }>>();
  for (const segment of segments) {
    if (segment.lineId !== lineId || !segment.stationAId || !segment.stationBId) continue;
    const { stationAId: a, stationBId: b, id } = segment;
    adjacency.set(a, [...(adjacency.get(a) ?? []), { station: b, segmentId: id }]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), { station: a, segmentId: id }]);
  }
  const named = [...new Set(stationIds)].filter((stationId) => adjacency.has(stationId));
  if (named.length === 0) return null;
  if (named.length === 1) return { stationIds: named, segmentIds: [] };

  // The outermost pair: the station farthest from any named one, then the one farthest from it.
  const firstEnd = farthest(named, walkLine(named[0], adjacency).distance);
  const fromFirstEnd = walkLine(firstEnd, adjacency);
  const reachable = named.filter((stationId) => fromFirstEnd.distance.has(stationId));
  const lastEnd = farthest(reachable, fromFirstEnd.distance);
  const pathStations = [lastEnd];
  const pathSegments: string[] = [];
  for (let step = fromFirstEnd.previous.get(lastEnd); step; step = fromFirstEnd.previous.get(step.station)) {
    pathSegments.push(step.segmentId);
    pathStations.push(step.station);
  }
  // pathStations runs from lastEnd back to firstEnd; read it in the source's order.
  if (named.indexOf(lastEnd) < named.indexOf(firstEnd)) return { stationIds: pathStations, segmentIds: pathSegments };
  return { stationIds: pathStations.reverse(), segmentIds: pathSegments.reverse() };
}

/** The id of the route preview drawn for a history incident. */
export function alertHistoryPreviewId(incident: Pick<AlertHistoryIncident, "incidentId" | "alertId">): string {
  return `alert-history-${incident.incidentId ?? incident.alertId}`;
}

function stationName(stationId: string, data: Pick<DashboardData, "stations">): string {
  return data.stations.find((station) => station.id === stationId)?.name ?? stationId;
}

export function alertHistoryMapTarget(
  incident: AlertHistoryIncident,
  data: MapTargetData & Pick<DashboardData, "stations">,
): AlertHistoryMapTarget | null {
  if (incident.status !== "cleared") {
    const selection = liveSelection(incident.alertId, data);
    if (selection) return { type: "live", selection };
  }
  if (!incident.lineId || !incident.stationIds?.length) return null;
  const span = alertHistoryLineSpan(incident.lineId, incident.stationIds, data.networkSegments);
  if (!span) return null;
  const first = stationName(span.stationIds[0], data);
  const last = stationName(span.stationIds[span.stationIds.length - 1], data);
  const id = alertHistoryPreviewId(incident);
  return {
    type: "path",
    preview: {
      id,
      commuteId: id,
      legId: "outbound",
      label: incident.title,
      routeLabel: span.stationIds.length === 1 ? first : `${first} to ${last}`,
      stationIds: span.stationIds,
      segmentIds: span.segmentIds,
      returnView: "alert-history",
      chipLabel: incident.status === "cleared" ? "Cleared Alert" : "Alert History",
    },
  };
}

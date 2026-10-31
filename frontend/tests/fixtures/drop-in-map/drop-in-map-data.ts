/*
 * Fixture service data for the drop-in map, in the TTC network's shape: a
 * suspension and a delay share Alder to Birch (one overlap badge), and a
 * second delay runs Birch to Elm. Fixture data, labelled as such.
 */
import { fallbackDashboardData } from "../../../src/app/dashboard-data";
import type { DashboardData } from "../../../src/app/DataContext";
import type { MapImpact, NetworkSegment, Station } from "../../../src/app/linewatch-data";
import type { StationSummary } from "../../../src/app/station-data";

const impact = (kind: MapImpact["kind"], cardId: string): MapImpact => ({
  kind, cardId, travelDirection: "bidirectional", sourceAlertIds: [cardId],
});

const STATIONS = [
  { id: "alder", name: "Alder", x: 200, y: 600, lineIds: ["line-a"] },
  { id: "birch", name: "Birch", x: 1000, y: 600, lineIds: ["line-a", "line-b"] },
  { id: "cedar", name: "Cedar", x: 1800, y: 600, lineIds: ["line-a"] },
  { id: "dogwood", name: "Dogwood", x: 1000, y: 180, lineIds: ["line-b"] },
  { id: "elm", name: "Elm", x: 1400, y: 1000, lineIds: ["line-b"] },
];

function segment(lineId: string, from: string, to: string, impacts: MapImpact[] = []): NetworkSegment {
  const a = STATIONS.find((station) => station.id === from)!;
  const b = STATIONS.find((station) => station.id === to)!;
  return {
    id: `${lineId}-${from}-${to}`,
    lineId,
    label: `${a.name} to ${b.name}`,
    stationAId: from,
    stationBId: to,
    stationAAnchorId: `station-${from}`,
    stationBAnchorId: `station-${to}`,
    pathD: `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
    overlay: impacts[0]?.kind === "suspension" ? "suspension" : impacts.length > 0 ? "delay" : "clear",
    impacts,
  };
}

const mapStations: Station[] = STATIONS.map(({ id, name, x, y }) => ({ id, name, x, y, interchange: id === "birch" }));

export const DROP_IN_STATION_LIST: StationSummary[] = STATIONS.map(({ id, name, x, y, lineIds }) => ({
  id, name, mapX: x, mapY: y, interchange: id === "birch", lineIds, hasActiveImpact: false, accessStatus: "normal",
}));

export function dropInDashboardData(): DashboardData {
  return {
    ...fallbackDashboardData(),
    message: "Drop-in fixture map test data.",
    networkSegments: [
      segment("line-a", "alder", "birch", [impact("suspension", "s1"), impact("delay", "d1")]),
      segment("line-a", "birch", "cedar"),
      segment("line-b", "dogwood", "birch"),
      segment("line-b", "birch", "elm", [impact("delay", "d2")]),
    ],
    stations: mapStations,
    activeAlerts: [{
      id: "s1", lineId: "line-a", lineNumber: "A", title: "No service", severity: "suspension", location: "Alder to Birch",
      description: "", affectedSegmentIds: ["line-a-alder-birch"], shuttle: true, source: "Fixture",
    }],
    delays: [
      {
        id: "d1", lineId: "line-a", lineNumber: "A", title: "Delay", location: "Alder to Birch", description: "",
        affectedSegmentIds: ["line-a-alder-birch"], source: "Fixture",
      },
      {
        id: "d2", lineId: "line-b", lineNumber: "B", title: "Delay", location: "Birch to Elm", description: "",
        affectedSegmentIds: ["line-b-birch-elm"], source: "Fixture",
      },
    ],
    reducedSpeedZones: [],
    plannedClosures: [],
    stationNodeImpacts: [],
  };
}

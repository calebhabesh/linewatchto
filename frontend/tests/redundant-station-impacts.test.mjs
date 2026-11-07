import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  mapStationAlertImpacts,
  stationImpactCardLines,
  withoutRedundantStationImpacts,
} from "../src/components/map-overlays/redundant-station-impacts.ts";

const impact = (kind, cardId, travelDirection = "bidirectional") => ({
  kind, cardId, travelDirection, sourceAlertIds: [cardId],
});
const segment = (lineId, stationAId, stationBId, impacts = []) => ({
  id: `${lineId}-${stationAId}-${stationBId}`,
  lineId,
  label: `${stationAId} to ${stationBId}`,
  stationAId,
  stationBId,
  impacts,
  overlay: impacts.length ? impacts[0].kind : "clear",
});
const station = (stationId, kind, cardId) => ({ stationId, kind, cardId, title: cardId });

// A line A - B - C (C its terminal), and line Y through B.
const lineClosure = [impact("suspension", "line-closure")];
const closedLine = [
  segment("x", "a", "b", lineClosure),
  segment("x", "b", "c", lineClosure),
  segment("y", "b", "z"),
];
const cardLines = stationImpactCardLines(
  [{ id: "line-closure", lineId: "x" }, { id: "station-list", lineId: "x" }, { id: "y-list", lineId: "y" }],
  [{ id: "line-delay", lineId: "x" }, { id: "station-delay", lineId: "x" }],
);

describe("redundant station alerts", () => {
  it("drops a station alert at stops another alert already closes on its line, terminals included", () => {
    const drawn = withoutRedundantStationImpacts(
      [station("a", "suspension", "station-list"), station("b", "suspension", "station-list"), station("c", "suspension", "station-list")],
      closedLine,
      cardLines,
    );
    assert.deepEqual(drawn, []);
  });

  it("keeps a station alert the line alert does not fully cover", () => {
    const partly = [segment("x", "a", "b", lineClosure), segment("x", "b", "c")];
    assert.deepEqual(
      withoutRedundantStationImpacts([station("b", "suspension", "station-list")], partly, cardLines).map((item) => item.stationId),
      ["b"],
      "a stop at the end of a closed stretch is not inside it",
    );
  });

  it("keeps a station alert on another line through the stop", () => {
    assert.equal(withoutRedundantStationImpacts([station("b", "suspension", "y-list")], closedLine, cardLines).length, 1);
  });

  it("keeps a station alert more severe than the line alert, or covered one way only", () => {
    const delayed = [segment("x", "a", "b", [impact("delay", "line-delay")]), segment("x", "b", "c", [impact("delay", "line-delay")])];
    assert.equal(withoutRedundantStationImpacts([station("b", "suspension", "station-list")], delayed, cardLines).length, 1);
    assert.equal(withoutRedundantStationImpacts([station("b", "delay", "station-delay")], delayed, cardLines).length, 0);
    const oneWay = [impact("suspension", "line-closure", "forward")];
    const oneWayLine = [segment("x", "a", "b", oneWay), segment("x", "b", "c", oneWay)];
    assert.equal(withoutRedundantStationImpacts([station("b", "suspension", "station-list")], oneWayLine, cardLines).length, 1);
  });

  it("keeps a card's own station alerts, planned previews, selected alerts, and alerts of unknown line", () => {
    const kept = [
      station("b", "suspension", "line-closure"),
      station("b", "planned-closure", "station-list"),
      station("b", "suspension", "unknown-card"),
    ];
    assert.equal(withoutRedundantStationImpacts(kept, closedLine, cardLines).length, kept.length);
    const previewOnly = [segment("x", "a", "b", [impact("planned-closure", "line-closure")]), segment("x", "b", "c", [impact("planned-closure", "line-closure")])];
    assert.equal(withoutRedundantStationImpacts([station("b", "suspension", "station-list")], previewOnly, cardLines).length, 1);
    assert.equal(
      withoutRedundantStationImpacts([station("b", "suspension", "station-list")], closedLine, cardLines, { kind: "suspension", id: "station-list" }).length,
      1,
      "selecting the alert draws it",
    );
  });
});

describe("every map's station alerts", () => {
  const data = (overrides = {}) => ({
    networkSegments: closedLine,
    activeAlerts: [
      { id: "line-closure", lineId: "x", severity: "suspension", affectedSegmentIds: ["x-a-b", "x-b-c"] },
      { id: "station-list", lineId: "x", severity: "suspension", affectedSegmentIds: [] },
      { id: "y-list", lineId: "y", severity: "suspension", affectedSegmentIds: [] },
    ],
    delays: [],
    reducedSpeedZones: [],
    plannedClosures: [],
    stationNodeImpacts: [
      station("a", "suspension", "station-list"),
      station("b", "suspension", "station-list"),
      station("b", "suspension", "station-list"),
      station("b", "suspension", "y-list"),
    ],
    selection: null,
    ...overrides,
  });

  it("draws each station alert once, less those a line alert on its line already shows", () => {
    assert.deepEqual(mapStationAlertImpacts(data()).map((item) => `${item.cardId}:${item.stationId}`), ["y-list:b"]);
    assert.deepEqual(
      mapStationAlertImpacts(data({ selection: { kind: "suspension", id: "station-list" } }))
        .map((item) => `${item.cardId}:${item.stationId}`),
      ["station-list:a", "station-list:b", "y-list:b"],
    );
  });

  it("is what the TTC and GO/UP System Maps and Map View draw station alerts from", () => {
    const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
    assert.match(source("app/ttc-map-content.ts"), /const stationNodeImpacts = mapStationAlertImpacts\(input\);/);
    assert.match(source("app/regional-map-content.ts"), /return mapStationAlertImpacts\(input\);/);
    assert.match(source("components/GeographicNetworkMap.tsx"), /projectImpactedStations\(catalog, mapStationAlertImpacts\(\{/);
    for (const path of ["app/ttc-map-content.ts", "app/regional-map-content.ts", "components/GeographicNetworkMap.tsx"]) {
      assert.doesNotMatch(source(path), /plannedAdvisoryStationImpacts\(/, `${path} builds its station alerts only through mapStationAlertImpacts`);
    }
  });
});

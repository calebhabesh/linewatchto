import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { regionalStationAlerts } from "../src/app/regional-station-alerts.ts";

import {
  STATION_ALERT_PILL_RING_GAP,
  isSelectedStationAlert,
  outsetStationPill,
  stationAlertAnchorReach,
  stationAlertColor,
  interchangeLineImpacts,
  stationDirectionGlyphs,
} from "../src/components/map-overlays/station-alert-model.ts";

const noDirections = { activeAlerts: [], delays: [], reducedSpeedZones: [], plannedClosures: [] };

describe("shared station alert model", () => {
  it("keeps TTC's colours: the stylesheet's red core and gold ring unless delay or planned", () => {
    assert.equal(stationAlertColor("suspension"), undefined);
    assert.equal(stationAlertColor("reduced-speed-zone"), undefined);
    assert.equal(stationAlertColor("delay"), "#f59e0b");
    assert.equal(stationAlertColor("planned-closure"), "var(--planned-preview-ink)");
  });

  it("matches a selection by kind and id", () => {
    const alert = { kind: "delay", impactId: "a" };
    assert.equal(isSelectedStationAlert(alert, { kind: "delay", id: "a" }), true);
    assert.equal(isSelectedStationAlert(alert, { kind: "suspension", id: "a" }), false);
    assert.equal(isSelectedStationAlert(alert, null), false);
  });

  it("grows a pill in overlay units, whatever its own scale", () => {
    const pill = { x: 0, y: 0, width: 100, height: 40, rx: 20, ry: 20, transform: "", scale: 2, stroke: "", strokeWidth: "" };
    const grown = outsetStationPill(pill, 10);
    assert.deepEqual([grown.x, grown.y, grown.width, grown.height, grown.rx], [-5, -5, 110, 50, 25]);
  });

  it("measures how far an anchor's drawing reaches, for badge placement", () => {
    const circle = { id: "a", center: { x: 0, y: 0 }, coreRadius: 26, ringRadius: 38, beaconRadius: 57.2 };
    assert.equal(stationAlertAnchorReach(circle, 1), 57.2);
    assert.equal(stationAlertAnchorReach({ ...circle, beaconRadius: 30 }, 1), 42);
    const pill = { x: 0, y: 0, width: 200, height: 80, rx: 40, ry: 40, transform: "", scale: 1, stroke: "", strokeWidth: "" };
    assert.equal(stationAlertAnchorReach({ ...circle, pill }, 2), 100 + STATION_ALERT_PILL_RING_GAP * 2);
  });

  it("draws one arrow per alerted dot, combining opposite one-way alerts", () => {
    const data = {
      ...noDirections,
      delays: [
        { id: "west", lineId: "line-2", displayDirection: "Westbound" },
        { id: "east", lineId: "line-2", displayDirection: "Eastbound" },
      ],
    };
    const anchor = { id: "dot", center: { x: 5, y: 6 }, badgeRadius: 24 };
    const glyphs = stationDirectionGlyphs([
      { impact: { stationId: "st-george", kind: "delay", cardId: "west" }, anchor },
      { impact: { stationId: "st-george", kind: "delay", cardId: "east" }, anchor },
    ], data);
    assert.equal(glyphs.length, 1);
    assert.equal(glyphs[0].direction, "horizontal-bidirectional");
    assert.equal(glyphs[0].anchorId, "dot");
    assert.deepEqual(glyphs[0].center, { x: 5, y: 6 });
  });

  it("draws no arrow for an alert without a direction", () => {
    const glyphs = stationDirectionGlyphs([
      { impact: { stationId: "x", kind: "suspension", cardId: "a" }, anchor: { id: "dot", center: { x: 0, y: 0 }, badgeRadius: 24 } },
    ], noDirections);
    assert.deepEqual(glyphs, []);
  });

  it("points an interchange along its line disruptions: Bloor-Yonge with Line 2 both ways and Line 1 northbound", () => {
    const data = {
      ...noDirections,
      activeAlerts: [{ id: "l2", lineId: "line-2", displayDirection: "Eastbound & Westbound" }],
      reducedSpeedZones: [{ id: "rsz", lineId: "line-1", displayDirection: "Northbound" }],
      plannedClosures: [{ id: "later", lineId: "line-1", displayDirection: "Southbound" }],
    };
    const segments = [
      { stationAId: "bay", stationBId: "bloor-yonge", impacts: [{ kind: "suspension", cardId: "l2" }] },
      { stationAId: "bloor-yonge", stationBId: "sherbourne", impacts: [{ kind: "suspension", cardId: "l2" }] },
      { stationAId: "rosedale", stationBId: "bloor-yonge", impacts: [{ kind: "reduced-speed-zone", cardId: "rsz" }] },
      // An upcoming closure is a planned preview, not current service.
      { stationAId: "bloor-yonge", stationBId: "wellesley", impacts: [{ kind: "planned-closure", cardId: "later" }] },
    ];
    const impacts = interchangeLineImpacts(segments, new Set(["bloor-yonge"]));
    assert.deepEqual(impacts, [
      { stationId: "bloor-yonge", kind: "suspension", cardId: "l2" },
      { stationId: "bloor-yonge", kind: "reduced-speed-zone", cardId: "rsz" },
    ]);
    const anchor = { id: "bloor-yonge", center: { x: 0, y: 0 }, badgeRadius: 40 };
    const glyphs = stationDirectionGlyphs(impacts.map((impact) => ({ impact, anchor })), data);
    assert.equal(glyphs.length, 1);
    assert.equal(glyphs[0].direction, "three-way-no-down");
  });

  it("gives GO/UP interchanges arrows, but leaves Union's hub without one", () => {
    const geometry = JSON.parse(readFileSync(new URL("../src/app/map-geometry/regional.json", import.meta.url), "utf8"));
    const data = {
      ...noDirections,
      activeAlerts: [{ id: "ki", lineId: "regional-ki", displayDirection: "bidirectional" }],
      stationNodeImpacts: [{ stationId: "union", kind: "suspension", cardId: "ki", title: "Union" }],
      stations: [
        { id: "union", name: "Union Station", interchange: true },
        { id: "bloor", name: "Bloor", interchange: true },
      ],
      networkSegments: [
        { stationAId: "union", stationBId: "bloor", impacts: [{ kind: "suspension", cardId: "ki" }] },
      ],
    };
    const { alerts, glyphs } = regionalStationAlerts(geometry, data, 1);
    assert.equal(alerts.length, 1, "Union keeps its station alert");
    assert.deepEqual(glyphs.map((glyph) => [glyph.anchorId, glyph.direction]), [["station-bloor-ki", "horizontal-bidirectional"]]);
  });
});

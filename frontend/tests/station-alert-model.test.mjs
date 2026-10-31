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

  it("draws arrows for station alerts only: a line alert through Bloor gives it none, and Union's hub keeps none", () => {
    const geometry = JSON.parse(readFileSync(new URL("../src/app/map-geometry/regional.json", import.meta.url), "utf8"));
    const data = {
      ...noDirections,
      activeAlerts: [{ id: "ki", lineId: "regional-ki", displayDirection: "bidirectional" }],
      stationNodeImpacts: [{ stationId: "union", kind: "suspension", cardId: "ki", title: "Union" }],
      stations: [
        { id: "union", name: "Union Station", interchange: true },
        { id: "bloor", name: "Bloor", interchange: true },
      ],
    };
    const { alerts, glyphs } = regionalStationAlerts(geometry, data, 1);
    assert.equal(alerts.length, 1, "Union keeps its station alert");
    assert.deepEqual(glyphs, []);
    // A station alert of its own at Bloor points along its line.
    const bloor = regionalStationAlerts(geometry, {
      ...data,
      stationNodeImpacts: [{ stationId: "bloor", kind: "suspension", cardId: "ki", title: "Bloor" }],
    }, 1);
    assert.deepEqual(bloor.glyphs.map((glyph) => [glyph.anchorId, glyph.direction]), [["station-bloor-ki", "horizontal-bidirectional"]]);
  });
});

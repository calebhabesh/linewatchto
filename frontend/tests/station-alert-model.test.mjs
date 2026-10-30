import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { alertHistoryLineSpan, alertHistoryMapTarget } from "../src/app/alert-history-map-target.ts";

const segment = (lineId, a, b, impacts = []) => ({
  id: `${lineId}-${a}-${b}`, lineId, label: "", stationAId: a, stationBId: b, pathD: "", overlay: "clear", impacts,
});
// Line 2 west to east, plus a crossing line that shares St George.
const segments = [
  segment("line-2", "kipling", "keele"),
  segment("line-2", "keele", "dundas-west"),
  segment("line-2", "dundas-west", "st-george"),
  segment("line-2", "st-george", "bay"),
  segment("line-1", "spadina", "st-george"),
];
const stations = [
  { id: "keele", name: "Keele" },
  { id: "dundas-west", name: "Dundas West" },
  { id: "st-george", name: "St George" },
  { id: "bay", name: "Bay" },
];
const emptyCards = { activeAlerts: [], delays: [], plannedClosures: [], reducedSpeedZones: [] };
const incident = (overrides = {}) => ({
  incidentId: "ttc-route-1:occurrence:4",
  alertId: "ttc-route-1",
  lineId: "line-2",
  title: "No service between Keele and St George",
  eventType: "planned-closure",
  status: "cleared",
  stationIds: ["keele", "st-george"],
  events: [],
  ...overrides,
});

describe("alert history map span", () => {
  it("walks the alert's own line between its ends, in the order history names them", () => {
    assert.deepEqual(alertHistoryLineSpan("line-2", ["keele", "st-george"], segments), {
      stationIds: ["keele", "dundas-west", "st-george"],
      segmentIds: ["line-2-keele-dundas-west", "line-2-dundas-west-st-george"],
    });
    assert.deepEqual(alertHistoryLineSpan("line-2", ["st-george", "keele"], segments).stationIds, ["st-george", "dundas-west", "keele"]);
  });

  it("spans every listed station, whatever order GO/UP lists them in", () => {
    const span = alertHistoryLineSpan("line-2", ["dundas-west", "bay", "keele"], segments);
    assert.deepEqual([...span.stationIds].sort(), ["bay", "dundas-west", "keele", "st-george"]);
    assert.equal(span.segmentIds.length, 3);
  });

  it("marks one station, and nothing for stations off the line", () => {
    assert.deepEqual(alertHistoryLineSpan("line-2", ["bay"], segments), { stationIds: ["bay"], segmentIds: [] });
    assert.equal(alertHistoryLineSpan("line-2", ["spadina"], segments), null);
  });
});

describe("alert history View target", () => {
  it("draws a cleared alert as a past route that returns to Alert History", () => {
    const target = alertHistoryMapTarget(incident(), { ...emptyCards, networkSegments: segments, stations });
    assert.equal(target.type, "path");
    assert.equal(target.preview.routeLabel, "Keele to St George");
    assert.equal(target.preview.chipLabel, "Cleared Alert");
    assert.equal(target.preview.returnView, "alert-history");
    assert.deepEqual(target.preview.segmentIds, ["line-2-keele-dundas-west", "line-2-dundas-west-st-george"]);
  });

  it("opens the live card of an alert that is still listed", () => {
    const plannedClosures = [{ id: "ttc-route-1", lineId: "line-2" }];
    assert.deepEqual(
      alertHistoryMapTarget(incident({ status: "active" }), { ...emptyCards, plannedClosures, networkSegments: segments, stations }),
      { type: "live", selection: { kind: "planned-closure", id: "ttc-route-1" } },
    );
    // A card that folded this alert in is found from the map's impacts.
    const folded = [segment("line-2", "keele", "dundas-west", [{ kind: "suspension", cardId: "card-9", travelDirection: "bidirectional", sourceAlertIds: ["ttc-route-1"] }])];
    assert.deepEqual(
      alertHistoryMapTarget(incident({ status: "active" }), { ...emptyCards, networkSegments: folded, stations }),
      { type: "live", selection: { kind: "suspension", id: "card-9" } },
    );
  });

  it("never opens a live card for a cleared occurrence, and draws an unlisted one from history", () => {
    const plannedClosures = [{ id: "ttc-route-1", lineId: "line-2" }];
    assert.equal(alertHistoryMapTarget(incident(), { ...emptyCards, plannedClosures, networkSegments: segments, stations }).type, "path");
    const unlisted = alertHistoryMapTarget(incident({ status: "active" }), { ...emptyCards, networkSegments: segments, stations });
    assert.equal(unlisted.preview.chipLabel, "Alert History");
  });

  it("offers nothing without recorded stations on the line", () => {
    assert.equal(alertHistoryMapTarget(incident({ stationIds: [] }), { ...emptyCards, networkSegments: segments, stations }), null);
    assert.equal(alertHistoryMapTarget(incident({ stationIds: undefined }), { ...emptyCards, networkSegments: segments, stations }), null);
  });
});

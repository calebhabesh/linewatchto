import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { impactDirectionLabel } from "../src/app/entire-line.ts";
import { dashboardDataFromApi } from "../src/app/dashboard-adapter.ts";
import { currentServiceSummary } from "../src/app/current-service.ts";
import { parseStationSpan } from "../src/app/station-span.ts";
import { upcomingAdvisoryPreview } from "../src/app/upcoming-advisory-preview.ts";
import * as fixture from "../src/app/linewatch-data.ts";

const both = { location: "Mount Dennis ⇄ Kennedy", displayDirection: "Eastbound & Westbound" };

describe("impactDirectionLabel", () => {
  it("leaves partial-line impacts as supplied", () => {
    assert.equal(impactDirectionLabel(both), "Eastbound & Westbound");
    assert.equal(impactDirectionLabel({ location: "Bloor-Yonge", displayDirection: null }), null);
  });

  it("says Entire Line and both directions", () => {
    assert.equal(impactDirectionLabel({ ...both, wholeLine: true }), "Entire Line · Eastbound & Westbound");
    const label = impactDirectionLabel({ ...both, location: "Mount Dennis to Kennedy", wholeLine: true });
    assert.equal(parseStationSpan("Mount Dennis to Kennedy", label).travel, "both-ways");
  });

  it("says which way a one-direction impact runs", () => {
    const label = impactDirectionLabel({ location: "Sheppard-Yonge → Don Mills", displayDirection: "Eastbound", wholeLine: true });
    assert.equal(label, "Entire Line · Eastbound");
    assert.equal(parseStationSpan("Finch to Vaughan Metropolitan Centre", "Entire Line · Northbound").travel, "unspecified");
  });

  it("names GO/UP directions from the span, never from an unspecified one", () => {
    const label = (lineId, location, displayDirection = null) =>
      impactDirectionLabel({ lineId, location, displayDirection, wholeLine: true });
    assert.equal(label("regional-le", "Union ⇄ Durham College Oshawa"), "Entire Line · Eastbound & Westbound");
    assert.equal(label("regional-st", "Union ⇄ Old Elm"), "Entire Line · Northbound & Southbound");
    assert.equal(label("regional-le", "Durham College Oshawa → Union", "Towards Union Station"), "Entire Line · Towards Union Station");
    assert.equal(label("regional-up", "Union to Pearson Airport"), "Entire Line");
    // Partial GO/UP spans keep their direction line as supplied.
    assert.equal(impactDirectionLabel({ lineId: "regional-le", location: "Union ⇄ Whitby", displayDirection: null }), null);
  });

  it("does not repeat a label saved in an older snapshot", () => {
    for (const displayDirection of ["Entire Line", "Entire Line · Towards Union Station"]) {
      assert.equal(impactDirectionLabel({ lineId: "regional-le", location: "Union ⇄ Durham College Oshawa", displayDirection, wholeLine: true }), displayDirection);
    }
  });
});

describe("TTC whole-line impacts", () => {
  const line5 = ["line-5-mount-dennis-keelesdale", "line-5-keelesdale-caledonia", "line-5-caledonia-kennedy"];
  const segments = [
    ...fixture.networkSegments.filter(({ lineId }) => lineId !== "line-5"),
    ...line5.map((id) => ({ ...fixture.networkSegments[0], id, lineId: "line-5" })),
  ];
  const common = {
    lineId: "line-5", lineNumber: "5", title: "Line 5", description: "", source: "TTC", shuttle: true,
    location: "Mount Dennis to Kennedy", displayLocation: "Mount Dennis ⇄ Kennedy", displayDirection: "Eastbound & Westbound",
  };
  const now = Date.parse("2026-11-24T17:00:00Z");
  const adapt = (impacts) => dashboardDataFromApi({
    map: { stations: fixture.stations, segments, stationNodeImpacts: [] },
    status: { generatedAt: { ...fixture.generatedAt, live: true }, lines: fixture.lineStatuses },
    activeAlerts: [], delays: [], reducedSpeedZones: [], plannedClosures: [], ...impacts,
  });
  const window = { window: "", nextWindowStart: "2026-12-06T03:00:00Z", nextWindowEnd: "2026-12-06T05:00:00Z" };

  it("labels an upcoming closure of every segment, and not one missing a segment", () => {
    const [whole, partial] = adapt({ plannedClosures: [
      { ...common, ...window, id: "whole", previewSegmentIds: line5 },
      { ...common, ...window, id: "partial", previewSegmentIds: line5.slice(1) },
    ] }).plannedClosures;
    assert.equal(upcomingAdvisoryPreview(whole, now).direction, "Entire Line · Eastbound & Westbound");
    assert.equal(upcomingAdvisoryPreview(partial, now).direction, "Eastbound & Westbound");
    // The supplied direction stays for code that reads it.
    assert.equal(whole.displayDirection, "Eastbound & Westbound");
  });

  it("labels active and delay cards, but never an impact without segments", () => {
    const data = adapt({
      activeAlerts: [{ ...common, id: "stop", severity: "suspension", affectedSegmentIds: line5 }],
      delays: [
        { ...common, id: "delay", affectedSegmentIds: [...line5].reverse() },
        { ...common, id: "oneWay", displayLocation: "Kennedy → Mount Dennis", displayDirection: "Westbound", affectedSegmentIds: line5 },
        { ...common, id: "none", affectedSegmentIds: [] },
        { ...common, id: "unknown", lineId: "line-9", affectedSegmentIds: [] },
      ],
    });
    const directions = Object.fromEntries(currentServiceSummary(data, now).rows.map((row) => [row.id, row.direction]));
    assert.deepEqual(directions, {
      stop: "Entire Line · Eastbound & Westbound", delay: "Entire Line · Eastbound & Westbound", oneWay: "Entire Line · Westbound", none: "Eastbound & Westbound", unknown: "Eastbound & Westbound",
    });
  });
});

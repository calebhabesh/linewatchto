import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  formatStationSpanText,
  parseStationSpan,
  stationSpanAccessibleText,
  withDisplayLocations,
} from "../src/app/station-span.ts";
import { countReducedSpeedZonesByDirection } from "../src/app/reduced-speed-zone-count.ts";
import { dashboardDataFromApi } from "../src/app/dashboard-adapter.ts";
import * as fixture from "../src/app/linewatch-data.ts";

describe("direction-aware station spans", () => {
  it("reads a single arrow as one direction in travel order", () => {
    assert.deepEqual(parseStationSpan("Jane → Kipling"), { from: "Jane", to: "Kipling", travel: "one-way" });
  });

  it("reads two-way connectors, including older payload spellings, as both directions", () => {
    for (const location of ["Kitchener ⇄ Stratford", "Kitchener ↔ Stratford", "Kitchener <-> Stratford"]) {
      assert.deepEqual(parseStationSpan(location), { from: "Kitchener", to: "Stratford", travel: "both-ways" });
    }
  });

  it("makes no travel claim for a plain 'to'", () => {
    assert.equal(parseStationSpan("Kipling to Jane").travel, "unspecified");
    assert.equal(parseStationSpan("Kipling To Jane", "Westbound").travel, "unspecified");
  });

  it("treats 'to' as both directions when the direction line says so", () => {
    for (const direction of ["Northbound & Southbound", "Eastbound & Westbound", "Both Ways", "Both directions"]) {
      assert.equal(parseStationSpan("York Mills to Eglinton", direction).travel, "both-ways");
    }
  });

  it("leaves single stations and section summaries without a span", () => {
    assert.equal(parseStationSpan("Bloor-Yonge"), null);
    assert.equal(parseStationSpan("Multiple affected sections"), null);
    assert.equal(parseStationSpan(""), null);
  });

  it("formats plain text and screen-reader wording", () => {
    assert.equal(formatStationSpanText(parseStationSpan("Jane → Kipling")), "Jane → Kipling");
    assert.equal(formatStationSpanText(parseStationSpan("Eglinton ↔ Lawrence")), "Eglinton ⇄ Lawrence");
    assert.equal(formatStationSpanText(parseStationSpan("Kipling to Jane")), "Kipling – Jane");
    assert.equal(stationSpanAccessibleText(parseStationSpan("Jane → Kipling")), "Jane to Kipling");
    assert.equal(stationSpanAccessibleText(parseStationSpan("Eglinton ⇄ Lawrence")), "Eglinton to Lawrence, both directions");
  });
});

describe("display location adapters", () => {
  it("prefers the backend span and keeps source text when it is absent", () => {
    const result = withDisplayLocations({
      activeAlerts: [{ location: "Kipling to Jane", displayLocation: "Jane → Kipling" }],
      delays: [{ location: "Kitchener ↔ Stratford" }],
      reducedSpeedZones: [{
        location: "Yorkdale <-> Wilson",
        displayLocation: "Yorkdale ⇄ Wilson",
        directionalDetails: [{ location: "Wilson to Yorkdale", displayLocation: "Yorkdale → Wilson" }],
      }],
      plannedClosures: [{ location: "St George to Spadina", displayLocation: "  " }],
    });

    assert.equal(result.activeAlerts[0].location, "Jane → Kipling");
    assert.equal(result.delays[0].location, "Kitchener ↔ Stratford");
    assert.equal(result.reducedSpeedZones[0].location, "Yorkdale ⇄ Wilson");
    assert.equal(result.reducedSpeedZones[0].directionalDetails[0].location, "Yorkdale → Wilson");
    assert.equal(result.plannedClosures[0].location, "St George to Spadina");
  });

  it("applies backend spans when TTC dashboard payloads are adapted", () => {
    const delay = { ...fixture.delays[0] ?? {
      id: "delay", lineId: "line-2", lineNumber: "2", title: "Delay", description: "", affectedSegmentIds: [], source: "TTC",
    }, location: "Jane to Runnymede", displayLocation: "Runnymede → Jane", displayDirection: "Westbound" };
    const data = dashboardDataFromApi({
      map: { stations: fixture.stations, segments: fixture.networkSegments, stationNodeImpacts: [] },
      status: { generatedAt: { ...fixture.generatedAt, live: true }, lines: fixture.lineStatuses },
      activeAlerts: [], delays: [delay], reducedSpeedZones: [], plannedClosures: [],
    });

    assert.equal(data.delays[0].location, "Runnymede → Jane");
  });

  it("reads a one-way slow zone's destination from its travel-ordered span", () => {
    const [count] = countReducedSpeedZonesByDirection({
      sourceAlertIds: ["west"],
      directionalDetails: [{ sourceAlertId: "west", displayDirection: "Westbound", location: "Runnymede → Jane" }],
    });

    assert.equal(count.direction, "westbound");
    assert.equal(count.destination, "Jane");
  });

  it("uses the two-stacked-arrow icon for both-way connectors and a dash, never \"to\", otherwise", () => {
    const span = readFileSync(new URL("../src/components/IncidentStationSpan.tsx", import.meta.url), "utf8");
    assert.match(span, /travel === "one-way" \? ArrowRight : travel === "both-ways" \? ArrowRightLeft : Minus/);
    assert.doesNotMatch(span, /MoveHorizontal/);
    assert.doesNotMatch(span, />to</);
  });
});

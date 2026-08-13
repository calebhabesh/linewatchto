import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const stationSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");
const listSource = readFileSync(new URL("../src/components/RegionalTripChangesList.tsx", import.meta.url), "utf8");
const logsSource = readFileSync(new URL("../src/components/LogsDropdown.tsx", import.meta.url), "utf8");

describe("regional trip changes UI", () => {
  it("annotates matching arrivals and exposes a station-scoped upcoming section", () => {
    assert.match(stationSource, /findRegionalArrivalTripChange/);
    assert.match(stationSource, /data-station-section="trip-changes"/);
    assert.match(stationSource, /Upcoming Trip Changes/);
    assert.match(stationSource, /regionalTripChangeLabel\(tripChange\.kind\)/);
    assert.match(stationSource, /`Train \$\{arrival\.tripNumber\}`/);
  });

  it("uses structured factual trip-change cards and source-honest guardrails", () => {
    assert.match(listSource, /Train \{change\.tripNumber \|\| change\.tripId\}/);
    assert.match(listSource, /Scheduled stops affected/);
    assert.match(listSource, /Only operational records confidently matched/);
    assert.doesNotMatch(listSource, /alternate route/i);
  });

  it("shows collection states and schedule lookahead in the source-status panel", () => {
    assert.match(logsSource, /\/api\/health\/regional-ingestion/);
    assert.match(logsSource, /\/api\/health\/regional-schedule/);
    assert.match(logsSource, /Collection coverage/);
    assert.match(logsSource, /collection\.recordsFetched/);
    assert.match(logsSource, /schedule\.requiredThrough/);
  });
});

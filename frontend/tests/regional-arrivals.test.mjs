import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emptyRegionalArrivalSnapshot,
  getRegionalStationArrivals,
  regionalArrivalMinuteLabel,
} from "../src/app/regional-arrivals.ts";

describe("regional station arrivals adapter", () => {
  it("returns source-labeled backend arrivals", async () => {
    const result = await getRegionalStationArrivals("union", {
      fetcher: async () => new Response(JSON.stringify({
        stationId: "union",
        stationName: "Union",
        availability: "available",
        generatedAt: "2026-07-28T19:48:00Z",
        sourceUpdatedAt: "2026-07-28T19:47:43Z",
        source: "Metrolinx GO Next Service",
        message: "Fresh Metrolinx regional train estimates.",
        arrivals: [{
          lineId: "regional-ki",
          lineNumber: "KI",
          lineName: "Kitchener",
          direction: "Kitchener GO",
          minutes: 7,
          predictedAt: "2026-07-28T19:55:00Z",
          scheduledAt: "2026-07-28T19:52:00Z",
          delayMinutes: 3,
          platform: "11",
          tripNumber: "3775",
          source: "Metrolinx GO Next Service",
          status: "live",
        }],
      }), { status: 200 }),
    });

    assert.equal(result.source, "backend");
    assert.equal(result.data.availability, "available");
    assert.equal(result.data.arrivals[0].platform, "11");
    assert.equal(result.data.arrivals[0].delayMinutes, 3);
  });

  it("falls back to an unavailable source-honest snapshot", async () => {
    const result = await getRegionalStationArrivals("bloor", {
      fetcher: async () => new Response("nope", { status: 503 }),
    });

    assert.equal(result.source, "fallback");
    assert.deepEqual(result.data, emptyRegionalArrivalSnapshot("bloor"));
  });

  it("formats due and minute labels", () => {
    assert.equal(regionalArrivalMinuteLabel(0), "Due");
    assert.equal(regionalArrivalMinuteLabel(1), "1 min");
    assert.equal(regionalArrivalMinuteLabel(12), "12 min");
  });
});

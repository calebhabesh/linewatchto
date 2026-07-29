import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emptyRegionalArrivalSnapshot,
  formatRegionalArrivalClockTime,
  getRegionalStationArrivals,
  groupRegionalStationArrivals,
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

  it("groups arrivals by travel direction and then platform", () => {
    const arrivals = [
      {
        lineId: "regional-br",
        lineNumber: "BR",
        lineName: "Barrie",
        direction: "Allandale Waterfront GO",
        minutes: 24,
        predictedAt: "2026-07-28T19:55:00Z",
        scheduledAt: "2026-07-28T19:52:00Z",
        delayMinutes: 3,
        platform: "1",
        tripNumber: "3775",
        source: "Metrolinx GO Next Service",
        status: "live",
      },
      {
        lineId: "regional-br",
        lineNumber: "BR",
        lineName: "Barrie",
        direction: "Allandale Waterfront GO",
        minutes: 39,
        predictedAt: "2026-07-28T20:10:00Z",
        scheduledAt: "2026-07-28T20:10:00Z",
        delayMinutes: 0,
        platform: "2",
        tripNumber: "3777",
        source: "Metrolinx GO Next Service",
        status: "live",
      },
      {
        lineId: "regional-br",
        lineNumber: "BR",
        lineName: "Barrie",
        direction: "Union Station",
        minutes: 84,
        predictedAt: "2026-07-28T20:55:00Z",
        scheduledAt: "2026-07-28T20:55:00Z",
        delayMinutes: 0,
        platform: "1",
        tripNumber: "3780",
        source: "Metrolinx GO Next Service",
        status: "live",
      },
    ];

    const groups = groupRegionalStationArrivals(arrivals, "downsview-park");
    assert.equal(groups.length, 2);
    assert.equal(groups[0].directionLabel, "Northbound");
    assert.equal(groups[0].destinationLabel, "To Allandale Waterfront GO");
    assert.deepEqual(groups[0].platforms.map((platform) => platform.label), ["Platform 1", "Platform 2"]);
    assert.equal(groups[1].directionLabel, "Southbound");
    assert.equal(groups[1].destinationLabel, "To Union Station");
  });

  it("formats regional prediction clock times in Toronto time", () => {
    assert.equal(formatRegionalArrivalClockTime("2026-07-28T19:55:00Z"), "3:55 PM");
    assert.equal(formatRegionalArrivalClockTime(""), "");
  });
});

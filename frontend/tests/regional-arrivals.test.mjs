import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emptyRegionalArrivalSnapshot,
  formatRegionalArrivalClockTime,
  getRegionalArrivalMinutes,
  getRegionalStationArrivals,
  groupRegionalStationArrivals,
  isRegionalArrivalDue,
  isRegionalArrivalSoon,
  regionalArrivalMinuteLabel,
  regionalArrivalTimeDisplay,
  shouldUseDetailedRegionalArrivalCountdown,
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

  it("evaluates due and soon arrival thresholds based on predicted time or minute count", () => {
    const now = new Date("2026-07-29T12:00:00-04:00");
    const dueArrival = { minutes: 0, predictedAt: "2026-07-29T12:00:00-04:00" };
    const soonArrival = { minutes: 3, predictedAt: "2026-07-29T12:03:00-04:00" };
    const distantArrival = { minutes: 15, predictedAt: "2026-07-29T12:15:00-04:00" };

    assert.equal(getRegionalArrivalMinutes(soonArrival, now), 3);
    assert.equal(isRegionalArrivalDue(dueArrival, now), true);
    assert.equal(isRegionalArrivalSoon(dueArrival, now), false);

    assert.equal(isRegionalArrivalDue(soonArrival, now), false);
    assert.equal(isRegionalArrivalSoon(soonArrival, now), true);

    assert.equal(isRegionalArrivalDue(distantArrival, now), false);
    assert.equal(isRegionalArrivalSoon(distantArrival, now), false);
  });

  it("uses a ticking range for the nearest live or scheduled arrival inside two minutes", () => {
    const now = new Date("2026-07-29T12:00:00-04:00");
    const liveArrival = { minutes: 1, predictedAt: "2026-07-29T12:00:42-04:00" };
    const scheduledArrival = { minutes: 1, predictedAt: "2026-07-29T12:01:51-04:00" };

    assert.equal(isRegionalArrivalDue(liveArrival, now), false);
    assert.equal(isRegionalArrivalSoon(liveArrival, now), true);
    assert.equal(shouldUseDetailedRegionalArrivalCountdown(liveArrival, now), true);
    assert.deepEqual(
      regionalArrivalTimeDisplay(liveArrival, now, { detailedCountdown: true }),
      { primary: "0:42 - 1:42", secondary: "12:00 PM" },
    );
    assert.equal(shouldUseDetailedRegionalArrivalCountdown(scheduledArrival, now), true);
    assert.deepEqual(
      regionalArrivalTimeDisplay(scheduledArrival, now, { detailedCountdown: true }),
      { primary: "1:51 - 2:51", secondary: "12:01 PM" },
    );
  });

  it("keeps countdowns to the final two minutes and marks passed predictions due", () => {
    const now = new Date("2026-07-29T12:00:00-04:00");
    assert.equal(
      shouldUseDetailedRegionalArrivalCountdown(
        { predictedAt: "2026-07-29T12:02:00-04:00" },
        now,
      ),
      false,
    );
    assert.equal(
      isRegionalArrivalDue(
        { minutes: 1, predictedAt: "2026-07-29T11:59:59-04:00" },
        now,
      ),
      true,
    );
  });

  it("switches hour-away arrivals from large minute counts to clock times", () => {
    const now = new Date("2026-07-29T12:00:00-04:00");
    assert.deepEqual(
      regionalArrivalTimeDisplay(
        { minutes: 59, predictedAt: "2026-07-29T12:59:00-04:00" },
        now,
      ),
      { primary: "59 min", secondary: "12:59 PM" },
    );
    assert.deepEqual(
      regionalArrivalTimeDisplay(
        { minutes: 60, predictedAt: "2026-07-29T13:00:00-04:00" },
        now,
      ),
      { primary: "1:00 PM", secondary: "Today" },
    );
    assert.deepEqual(
      regionalArrivalTimeDisplay(
        { minutes: 1_350, predictedAt: "2026-07-30T10:30:00-04:00" },
        now,
      ),
      { primary: "10:30 AM", secondary: "Tomorrow" },
    );
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

  it("distinguishes prefixed Milton headsigns as westbound and eastbound", () => {
    const base = {
      lineId: "regional-mi",
      lineNumber: "MI",
      lineName: "Milton",
      minutes: 90,
      predictedAt: "2026-07-29T17:30:00-04:00",
      scheduledAt: "2026-07-29T17:30:00-04:00",
      delayMinutes: 0,
      platform: "",
      source: "Metrolinx published schedule",
      status: "scheduled",
    };
    const groups = groupRegionalStationArrivals([
      { ...base, direction: "MI - Milton GO", tripNumber: "MI201" },
      { ...base, direction: "MI - Union Station GO", tripNumber: "MI100" },
    ], "milton");

    assert.deepEqual(
      groups.map((group) => [group.directionLabel, group.destinationLabel]),
      [
        ["Eastbound", "To Union Station GO"],
        ["Westbound", "To Milton GO"],
      ],
    );
  });

  it("groups and sorts arrival direction groups by transit line order and direction", () => {
    const kiBase = {
      lineId: "regional-ki",
      lineNumber: "KI",
      lineName: "Kitchener",
      predictedAt: "2026-07-29T17:30:00-04:00",
      scheduledAt: "2026-07-29T17:30:00-04:00",
      delayMinutes: 0,
      platform: "2",
      source: "Metrolinx GO Next Service",
      status: "live",
    };
    const upBase = {
      lineId: "regional-up",
      lineNumber: "UP",
      lineName: "Union Pearson Express",
      predictedAt: "2026-07-29T17:30:00-04:00",
      scheduledAt: "2026-07-29T17:30:00-04:00",
      delayMinutes: 0,
      platform: "",
      source: "Metrolinx UP Express GTFS-RT TripUpdates",
      status: "live",
    };

    // Intermixed input: KI Eastbound, UP Westbound, UP Eastbound, KI Westbound
    const arrivals = [
      { ...kiBase, direction: "KI - Union Station", tripNumber: "KI100", minutes: 2 },
      { ...upBase, direction: "UP - Pearson Airport", tripNumber: "UP200", minutes: 4 },
      { ...upBase, direction: "UP - Union Station", tripNumber: "UP100", minutes: 10 },
      { ...kiBase, direction: "KI - Mount Pleasant GO", tripNumber: "KI200", minutes: 11 },
    ];

    const groups = groupRegionalStationArrivals(arrivals, "weston");
    assert.equal(groups.length, 4);
    assert.deepEqual(
      groups.map((g) => [g.lineNumber, g.directionLabel]),
      [
        ["KI", "Eastbound"],
        ["KI", "Westbound"],
        ["UP", "Eastbound"],
        ["UP", "Westbound"],
      ],
    );
  });

  it("consolidates short-turn destinations into one corridor direction section", () => {
    const base = {
      lineId: "regional-ki",
      lineNumber: "KI",
      lineName: "Kitchener",
      minutes: 27,
      predictedAt: "2026-07-29T17:30:00-04:00",
      scheduledAt: "2026-07-29T17:30:00-04:00",
      delayMinutes: 0,
      platform: "",
      source: "Metrolinx published schedule",
      status: "scheduled",
    };
    const groups = groupRegionalStationArrivals([
      { ...base, direction: "KI - Bramalea GO", tripNumber: "KI201" },
      { ...base, direction: "KI - Mount Pleasant GO", tripNumber: "KI203", minutes: 57 },
      { ...base, direction: "KI - Kitchener GO", tripNumber: "KI205", minutes: 87 },
    ], "weston");

    assert.equal(groups.length, 1);
    assert.equal(groups[0].directionLabel, "Westbound");
    assert.equal(
      groups[0].destinationLabel,
      "Destinations: Bramalea GO / Mount Pleasant GO / Kitchener GO",
    );
    assert.equal(groups[0].platforms[0].arrivals.length, 3);
  });

  it("formats regional prediction clock times in Toronto time", () => {
    const now = new Date("2026-07-28T12:00:00-04:00");
    assert.equal(formatRegionalArrivalClockTime("2026-07-28T19:55:00Z", now), "3:55 PM");
    assert.equal(
      formatRegionalArrivalClockTime("2026-07-29T10:32:00-04:00", now),
      "Tomorrow, 10:32 AM",
    );
    assert.equal(formatRegionalArrivalClockTime(""), "");
  });
});

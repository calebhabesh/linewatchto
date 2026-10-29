import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emptyRegionalArrivalSnapshot,
  formatRegionalArrivalCoachCount,
  formatRegionalArrivalSourceSummary,
  formatRegionalArrivalClockTime,
  formatRegionalArrivalDelay,
  formatRegionalDestinationName,
  getRegionalArrivalMinutes,
  getRegionalArrivalDelayMinutes,
  getRegionalStationArrivals,
  groupRegionalStationArrivals,
  limitRegionalArrivalGroup,
  isRegionalArrivalDue,
  isRegionalArrivalSoon,
  preserveRegionalArrivalsOnRefresh,
  REGIONAL_ARRIVAL_COUNTDOWN_TICK_MS,
  regionalArrivalMinuteLabel,
  regionalArrivalTimeDisplay,
  shouldShowRegionalArrivalDelay,
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
          coachCount: 12,
          source: "Metrolinx GO Next Service",
          status: "live",
        }],
      }), { status: 200 }),
    });

    assert.equal(result.source, "backend");
    assert.equal(result.data.availability, "available");
    assert.equal(result.data.arrivals[0].platform, "11");
    assert.equal(result.data.arrivals[0].delayMinutes, 3);
    assert.equal(result.data.arrivals[0].coachCount, 12);
  });

  it("preserves the last backend regional snapshot through a transient browser request failure", () => {
    const backendSnapshot = {
      ...emptyRegionalArrivalSnapshot("bloor"),
      availability: "available",
      arrivals: [{ status: "live" }],
    };
    const current = { source: "backend", data: backendSnapshot, receivedAt: 1_000 };
    const failedRefresh = {
      source: "fallback",
      data: emptyRegionalArrivalSnapshot("bloor"),
      receivedAt: 16_000,
    };

    assert.equal(preserveRegionalArrivalsOnRefresh(current, failedRefresh, 16_000), current);
    assert.equal(
      preserveRegionalArrivalsOnRefresh(current, failedRefresh, 91_001),
      failedRefresh,
      "the browser grace window should expire instead of showing live data indefinitely",
    );
    assert.equal(
      preserveRegionalArrivalsOnRefresh(failedRefresh, current, 16_000),
      current,
      "a recovered backend response should replace an initial fallback",
    );
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

  it("formats clear rider-facing source summaries", () => {
    const goLive = { lineId: "regional-ki", status: "live" };
    const upLive = { lineId: "regional-up", status: "live" };
    const scheduled = { lineId: "regional-ki", status: "scheduled" };

    assert.equal(formatRegionalArrivalSourceSummary([goLive]), "Metrolinx GO live estimates");
    assert.equal(formatRegionalArrivalSourceSummary([upLive]), "Metrolinx UP Express live estimates");
    assert.equal(
      formatRegionalArrivalSourceSummary([goLive, upLive]),
      "Metrolinx GO + UP Express live estimates",
    );
    assert.equal(
      formatRegionalArrivalSourceSummary([goLive, upLive, scheduled]),
      "Metrolinx live estimates + published schedule",
    );
    assert.equal(formatRegionalArrivalSourceSummary([scheduled]), "Metrolinx published schedule");
    assert.equal(formatRegionalArrivalSourceSummary([]), "Metrolinx regional arrivals");
  });

  it("labels only source-backed live arrivals that are at least one minute late", () => {
    assert.equal(
      formatRegionalArrivalDelay({ status: "live", delayMinutes: 27 }),
      "27 Min Late",
    );
    assert.equal(getRegionalArrivalDelayMinutes({ status: "live", delayMinutes: 3.9 }), 3);
    assert.equal(formatRegionalArrivalDelay({ status: "live", delayMinutes: 0 }), null);
    assert.equal(formatRegionalArrivalDelay({ status: "scheduled", delayMinutes: 27 }), null);
  });

  it("formats only valid positive coach counts", () => {
    assert.equal(formatRegionalArrivalCoachCount({ coachCount: 12 }), "Coaches: 12");
    assert.equal(formatRegionalArrivalCoachCount({ coachCount: null }), null);
    assert.equal(formatRegionalArrivalCoachCount({ coachCount: 0 }), null);
    assert.equal(formatRegionalArrivalCoachCount({ coachCount: 10.5 }), null);
  });

  it("waits until a live regional train is within 30 minutes before surfacing its delay", () => {
    const now = new Date("2026-07-29T12:00:00-04:00");
    const delayed = {
      status: "live",
      delayMinutes: 12,
      minutes: 60,
      predictedAt: "2026-07-29T13:00:00-04:00",
    };

    assert.equal(shouldShowRegionalArrivalDelay(delayed, now), false);
    assert.equal(shouldShowRegionalArrivalDelay({
      ...delayed,
      minutes: 30,
      predictedAt: "2026-07-29T12:30:00-04:00",
    }, now), true);
    assert.equal(shouldShowRegionalArrivalDelay({
      ...delayed,
      delayMinutes: 41,
      minutes: 2,
      predictedAt: "2026-07-29T12:02:00-04:00",
    }, now), true);
  });

  it("treats GO and UP predictions within five minutes of schedule as on time", () => {
    const now = new Date("2026-07-29T12:00:00-04:00");
    const arrival = {
      status: "live",
      delayMinutes: 1,
      minutes: 10,
      predictedAt: "2026-07-29T12:10:00-04:00",
    };

    assert.equal(shouldShowRegionalArrivalDelay(arrival, now), false);
    assert.equal(shouldShowRegionalArrivalDelay({ ...arrival, delayMinutes: 5 }, now), false);
    assert.equal(shouldShowRegionalArrivalDelay({ ...arrival, delayMinutes: 6 }, now), true);
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

  it("uses a whole-minute range for the nearest live arrival and none for timetable rows", () => {
    const now = new Date("2026-07-29T12:00:00-04:00");
    const liveArrival = { minutes: 1, predictedAt: "2026-07-29T12:00:42-04:00", status: "live" };
    const laterLiveArrival = { minutes: 2, predictedAt: "2026-07-29T12:01:51-04:00", status: "live" };
    const scheduledArrival = { minutes: 2, predictedAt: "2026-07-29T12:01:51-04:00", status: "scheduled" };

    assert.equal(isRegionalArrivalDue(liveArrival, now), false);
    assert.equal(isRegionalArrivalSoon(liveArrival, now), true);
    assert.equal(shouldUseDetailedRegionalArrivalCountdown(liveArrival, now), true);
    assert.deepEqual(
      regionalArrivalTimeDisplay(liveArrival, now, { detailedCountdown: true }),
      { primary: "<1 min", secondary: "12:00 PM" },
    );
    assert.deepEqual(
      regionalArrivalTimeDisplay(laterLiveArrival, now, { detailedCountdown: true }),
      { primary: "1–2 min", secondary: "12:01 PM" },
    );
    assert.equal(shouldUseDetailedRegionalArrivalCountdown(scheduledArrival, now), false);
    assert.deepEqual(
      regionalArrivalTimeDisplay(scheduledArrival, now, { detailedCountdown: true }),
      { primary: "1 min", secondary: "12:01 PM" },
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
    assert.equal(groups[0].destinationLabel, "To Allandale Waterfront");
    assert.deepEqual(groups[0].platforms.map((platform) => platform.label), ["Platform 1", "Platform 2"]);
    assert.equal(groups[1].directionLabel, "Southbound");
    assert.equal(groups[1].destinationLabel, "To Union");
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
        ["Eastbound", "To Union"],
        ["Westbound", "To Milton"],
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
      source: "Metrolinx UP Express GTFS-RT Trip Updates",
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
    assert.equal(groups[0].destinationLabel, "To Bramalea, Mount Pleasant or Kitchener");
    assert.equal(groups[0].platforms[0].arrivals.length, 3);
  });

  it("names every short-turn destination in route order instead of only the line terminus", () => {
    const base = {
      lineId: "regional-lw",
      lineNumber: "LW",
      lineName: "Lakeshore West",
      predictedAt: "2026-07-29T17:30:00-04:00",
      scheduledAt: "2026-07-29T17:30:00-04:00",
      delayMinutes: 0,
      platform: "1",
      source: "Metrolinx GO Next Service",
      status: "live",
    };
    const groups = groupRegionalStationArrivals([
      { ...base, direction: "Niagara Falls GO (VIA Station)", tripNumber: "1977", minutes: 39 },
      { ...base, direction: "Hamilton GO Centre", tripNumber: "1875", minutes: 30 },
      { ...base, direction: "West Harbour GO", tripNumber: "1675", minutes: 2 },
      { ...base, direction: "Aldershot GO", tripNumber: "1075", minutes: 10 },
      { ...base, direction: "Oakville GO", tripNumber: "1325", minutes: 27, platform: "2" },
      { ...base, direction: "LW - Hamilton GO Centre", tripNumber: "20260729-LW-1877", minutes: 60, platform: "", status: "scheduled" },
      { ...base, direction: "Union Station", tripNumber: "1626", minutes: 23, platform: "3" },
    ], "clarkson");

    assert.deepEqual(
      groups.map((group) => [group.directionLabel, group.destinationLabel]),
      [
        ["Eastbound", "To Union"],
        ["Westbound", "To Oakville, Aldershot, West Harbour, Hamilton or Niagara Falls"],
      ],
    );
    // Direction comes from the resolved station, so a suffixed name past the
    // current station still reads as eastbound toward Union.
    const eastOfHamilton = groupRegionalStationArrivals([
      { ...base, direction: "Hamilton GO Centre", tripNumber: "1880", minutes: 5 },
    ], "st-catharines");
    assert.deepEqual(
      eastOfHamilton.map((group) => [group.directionLabel, group.destinationLabel]),
      [["Eastbound", "To Hamilton"]],
    );
  });

  it("correctly classifies terminating outward trains and uses canonical line terminus labels", () => {
    const base = {
      lineId: "regional-st",
      lineNumber: "ST",
      lineName: "Stouffville",
      minutes: 10,
      predictedAt: "2026-08-18T19:11:00-04:00",
      scheduledAt: "2026-08-18T19:11:00-04:00",
      delayMinutes: 0,
      platform: "",
      source: "Metrolinx published schedule",
      status: "scheduled",
    };

    // At Mount Joy:
    // 1. Train terminating at Mount Joy (arrived Northbound from Union)
    // 2. Trains departing Mount Joy towards Union (Southbound)
    const arrivals = [
      { ...base, direction: "ST - Mount Joy GO", tripNumber: "7428", minutes: 10 },
      { ...base, direction: "ST - Union Station GO", tripNumber: "7433", minutes: 25 },
      { ...base, direction: "ST - Union Station GO", tripNumber: "7435", minutes: 55 },
    ];

    const groups = groupRegionalStationArrivals(arrivals, "mount-joy");
    assert.equal(groups.length, 2);

    const northboundGroup = groups.find((g) => g.directionLabel === "Northbound");
    const southboundGroup = groups.find((g) => g.directionLabel === "Southbound");

    assert.ok(northboundGroup, "Northbound group must exist for terminating outward train");
    assert.ok(southboundGroup, "Southbound group must exist for Union-bound trains");

    // Outward arrivals heading to Mount Joy resolve dynamically to To Mount Joy
    assert.equal(northboundGroup.destinationLabel, "To Mount Joy");
    // Mount Joy is not the last station on ST, so this is NOT a terminal stop — it's an early-terminating trip
    assert.equal(northboundGroup.isTerminating, false);
    assert.equal(northboundGroup.platforms[0].arrivals.length, 1);
    assert.equal(northboundGroup.platforms[0].arrivals[0].tripNumber, "7428");

    // Canonical inward terminus for Stouffville line is Union
    assert.equal(southboundGroup.destinationLabel, "To Union");
    assert.equal(southboundGroup.isTerminating, false);
    assert.equal(southboundGroup.platforms[0].arrivals.length, 2);
  });

  it("flags isTerminating only at canonical terminal stations", () => {
    const upBase = {
      lineId: "regional-up",
      lineNumber: "UP",
      lineName: "UP Express",
      minutes: 10,
      predictedAt: "2026-08-18T23:10:00-04:00",
      scheduledAt: "2026-08-18T23:10:00-04:00",
      delayMinutes: 0,
      platform: "",
      source: "UP Express GTFS-RT",
      status: "live",
    };

    // At Union (index 0): Eastbound inward arrivals are terminating; Westbound outward departures are not
    const unionGroups = groupRegionalStationArrivals([
      { ...upBase, direction: "UP - Union Station", tripNumber: "UP100" },
      { ...upBase, direction: "UP - Pearson Airport", tripNumber: "UP200" },
    ], "union");

    const unionEastbound = unionGroups.find((g) => g.directionLabel === "Eastbound");
    const unionWestbound = unionGroups.find((g) => g.directionLabel === "Westbound");

    assert.ok(unionEastbound, "Eastbound group must exist at Union");
    assert.ok(unionWestbound, "Westbound group must exist at Union");
    assert.equal(unionEastbound.isTerminating, true, "Inward arrivals at Union are terminating");
    assert.equal(unionWestbound.isTerminating, false, "Outward departures from Union are not terminating");
    // Westbound departures must appear first; Eastbound terminating arrivals must appear last
    assert.equal(unionGroups[0].directionLabel, "Westbound", "Departing group sorts before terminating group at Union");
    assert.equal(unionGroups[1].directionLabel, "Eastbound", "Terminating group sorts after departing group at Union");

    // At Pearson Airport (last index): Westbound outward arrivals are terminating; Eastbound inward departures are not
    const pearsonGroups = groupRegionalStationArrivals([
      { ...upBase, direction: "UP - Pearson Airport", tripNumber: "UP300" },
      { ...upBase, direction: "UP - Union Station", tripNumber: "UP400" },
    ], "pearson-airport");

    const pearsonWestbound = pearsonGroups.find((g) => g.directionLabel === "Westbound");
    const pearsonEastbound = pearsonGroups.find((g) => g.directionLabel === "Eastbound");

    assert.ok(pearsonWestbound, "Westbound group must exist at Pearson Airport");
    assert.ok(pearsonEastbound, "Eastbound group must exist at Pearson Airport");
    assert.equal(pearsonWestbound.isTerminating, true, "Outward arrivals at Pearson Airport are terminating");
    assert.equal(pearsonEastbound.isTerminating, false, "Inward departures from Pearson Airport are not terminating");
    // Eastbound departures must appear first; Westbound terminating arrivals must appear last
    assert.equal(pearsonGroups[0].directionLabel, "Eastbound", "Departing group sorts before terminating group at Pearson Airport");
    assert.equal(pearsonGroups[1].directionLabel, "Westbound", "Terminating group sorts after departing group at Pearson Airport");

    // At Stratford (last index of KI line): Westbound outward arrivals terminate at Stratford
    const stratfordGroups = groupRegionalStationArrivals([
      {
        lineId: "regional-ki",
        lineNumber: "KI",
        lineName: "Kitchener",
        direction: "KI - Stratford GO",
        tripNumber: "7401",
        minutes: 15,
        predictedAt: "2026-08-18T19:28:00-04:00",
        scheduledAt: "2026-08-18T19:28:00-04:00",
        delayMinutes: 0,
        platform: "",
        source: "Metrolinx published schedule",
        status: "scheduled",
      },
      {
        lineId: "regional-ki",
        lineNumber: "KI",
        lineName: "Kitchener",
        direction: "KI - Union Station GO",
        tripNumber: "7402",
        minutes: 60,
        predictedAt: "2026-08-18T20:13:00-04:00",
        scheduledAt: "2026-08-18T20:13:00-04:00",
        delayMinutes: 0,
        platform: "",
        source: "Metrolinx published schedule",
        status: "scheduled",
      },
    ], "stratford");

    const stratfordWestbound = stratfordGroups.find((g) => g.directionLabel === "Westbound");
    const stratfordEastbound = stratfordGroups.find((g) => g.directionLabel === "Eastbound");

    assert.ok(stratfordWestbound, "Westbound group must exist at Stratford");
    assert.ok(stratfordEastbound, "Eastbound group must exist at Stratford");
    assert.equal(stratfordWestbound.destinationLabel, "To Stratford", "Westbound header at Stratford must say To Stratford");
    assert.equal(stratfordWestbound.isTerminating, true, "Westbound arrivals at Stratford are terminating");
    assert.equal(stratfordEastbound.destinationLabel, "To Union", "Eastbound departures from Stratford head To Union");
    assert.equal(stratfordEastbound.isTerminating, false, "Eastbound departures from Stratford are not terminating");
  });

  it("collapses a direction to its next trains across platforms and counts the rest", () => {
    const base = {
      lineId: "regional-lw",
      lineNumber: "LW",
      lineName: "Lakeshore West",
      scheduledAt: "2026-07-29T17:00:00-04:00",
      delayMinutes: 0,
      source: "Metrolinx GO Next Service",
      status: "live",
    };
    const at = (minutes) => new Date(Date.parse("2026-07-29T17:00:00-04:00") + minutes * 60_000).toISOString();
    const [group] = groupRegionalStationArrivals([
      { ...base, direction: "Hamilton GO Centre", tripNumber: "1", minutes: 16, predictedAt: at(16), platform: "1" },
      { ...base, direction: "Oakville GO", tripNumber: "2", minutes: 13, predictedAt: at(13), platform: "2" },
      { ...base, direction: "Niagara Falls GO", tripNumber: "3", minutes: 24, predictedAt: at(24), platform: "1" },
      { ...base, direction: "Oakville GO", tripNumber: "4", minutes: 39, predictedAt: at(39), platform: "2" },
      { ...base, direction: "Appleby GO", tripNumber: "5", minutes: 52, predictedAt: at(52), platform: "2" },
      { ...base, direction: "Hamilton GO Centre", tripNumber: "6", minutes: 80, predictedAt: at(80), platform: "3" },
    ], "clarkson");

    const collapsed = limitRegionalArrivalGroup(group, 4);
    assert.equal(collapsed.hiddenCount, 2);
    assert.deepEqual(
      collapsed.platforms.map((platform) => [platform.key, platform.arrivals.map((arrival) => arrival.tripNumber)]),
      [["1", ["1", "3"]], ["2", ["2", "4"]]],
      "Later trains and the platform they leave empty are hidden",
    );
    // The header still names every destination, including hidden ones.
    assert.equal(group.destinationLabel, "To Oakville, Appleby, Hamilton or Niagara Falls");

    const short = limitRegionalArrivalGroup(group, 10);
    assert.equal(short.hiddenCount, 0);
    assert.equal(short.platforms, group.platforms);
  });

  it("formats clean regional destination names across corridors", () => {
    assert.equal(formatRegionalDestinationName("KI - Kitchener GO", "KI"), "Kitchener");
    assert.equal(formatRegionalDestinationName("KI - Mount Pleasant GO", "KI"), "Mount Pleasant");
    assert.equal(formatRegionalDestinationName("KI - Bramalea GO", "KI"), "Bramalea");
    assert.equal(formatRegionalDestinationName("KI - Stratford GO", "KI"), "Stratford");
    assert.equal(formatRegionalDestinationName("LW - Aldershot GO", "LW"), "Aldershot");
    assert.equal(formatRegionalDestinationName("LW - Niagara Falls GO", "LW"), "Niagara Falls");
    assert.equal(formatRegionalDestinationName("UP - Pearson Airport", "UP"), "Pearson Airport");
    assert.equal(formatRegionalDestinationName("UP - Union Station", "UP"), "Union");
    assert.equal(formatRegionalDestinationName("ST - Old Elm GO", "ST"), "Old Elm");
    assert.equal(formatRegionalDestinationName("BR - Allandale Waterfront GO", "BR"), "Allandale Waterfront");
    assert.equal(formatRegionalDestinationName("LE - Durham College Oshawa GO", "LE"), "Durham College Oshawa");
    assert.equal(formatRegionalDestinationName("Hamilton GO Centre", "LW"), "Hamilton");
    assert.equal(formatRegionalDestinationName("LW - Hamilton GO Centre", "LW"), "Hamilton");
    assert.equal(formatRegionalDestinationName("Niagara Falls GO (VIA Station)", "LW"), "Niagara Falls");
    assert.equal(formatRegionalDestinationName("ST - Unionville GO", "ST"), "Unionville");
    assert.equal(formatRegionalDestinationName("Union Station", "ST"), "Union");
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

  it("exports a standardized 3-second countdown interval", () => {
    assert.equal(REGIONAL_ARRIVAL_COUNTDOWN_TICK_MS, 3000);
  });
});

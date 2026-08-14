import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ARRIVAL_COUNTDOWN_TICK_MS,
  formatArrivalDirection,
  formatArrivalClockTime,
  formatArrivalDisclaimer,
  formatArrivalSourceBadgeLabel,
  formatArrivalSourceSummary,
  formatArrivalTileLabel,
  groupStationArrivals,
  isArrivalDue,
  shouldUseDetailedArrivalCountdown,
} from "../src/app/station-arrivals.ts";

const line2 = {
  id: "line-2",
  number: "2",
  name: "Bloor-Danforth",
  color: "#00923F",
  platformLabel: "Eastbound / Westbound",
  wheelchairAccessible: true,
  hasElevator: true,
};

const line1 = {
  id: "line-1",
  number: "1",
  name: "Yonge-University",
  color: "#F8C300",
  platformLabel: "Northbound / Southbound",
  wheelchairAccessible: true,
  hasElevator: true,
};

describe("station arrival grouping", () => {
  it("groups scheduled arrivals by line and normalized direction", () => {
    const groups = groupStationArrivals([
      {
        lineId: "line-2",
        direction: "Bloor-Danforth Line towards Kipling Station",
        minutes: 8,
        predictedAt: "2026-06-04T22:00:00-04:00",
        label: "8 min",
        source: "TTC scheduled service",
        status: "scheduled",
      },
      {
        lineId: "line-2",
        direction: "Bloor-Danforth Line towards Kennedy Station",
        minutes: 1,
        predictedAt: "2026-06-04T21:53:00-04:00",
        label: "1 min",
        source: "TTC scheduled service",
        status: "scheduled",
      },
      {
        lineId: "line-2",
        direction: "Bloor-Danforth Line towards Kennedy Station",
        minutes: 4,
        predictedAt: "2026-06-04T21:57:00-04:00",
        label: "4 min",
        source: "TTC scheduled service",
        status: "scheduled",
      },
      {
        lineId: "line-2",
        direction: "Bloor-Danforth Line towards Kipling Station",
        minutes: 3,
        predictedAt: "2026-06-04T21:55:00-04:00",
        label: "3 min",
        source: "TTC scheduled service",
        status: "scheduled",
      },
    ], [line2]);

    assert.deepEqual(groups.map((group) => group.directionLabel), [
      "Eastbound to Kennedy",
      "Westbound to Kipling",
    ]);
    assert.deepEqual(groups[0].arrivals.map((arrival) => arrival.label), ["1 min", "4 min"]);
    assert.deepEqual(groups[1].arrivals.map((arrival) => arrival.label), ["3 min", "8 min"]);
  });

  it("limits each direction group to the next three arrivals", () => {
    const groups = groupStationArrivals([
      { lineId: "line-2", direction: "Bloor-Danforth Line towards Kennedy Station", minutes: 1, predictedAt: null, label: "1 min", source: "TTC scheduled service", status: "scheduled" },
      { lineId: "line-2", direction: "Bloor-Danforth Line towards Kennedy Station", minutes: 2, predictedAt: null, label: "2 min", source: "TTC scheduled service", status: "scheduled" },
      { lineId: "line-2", direction: "Bloor-Danforth Line towards Kennedy Station", minutes: 6, predictedAt: null, label: "6 min", source: "TTC scheduled service", status: "scheduled" },
      { lineId: "line-2", direction: "Bloor-Danforth Line towards Kennedy Station", minutes: 10, predictedAt: null, label: "10 min", source: "TTC scheduled service", status: "scheduled" },
    ], [line2]);

    assert.deepEqual(groups[0].arrivals.map((arrival) => arrival.label), ["1 min", "2 min", "6 min"]);
  });

  it("deduplicates identical schedule arrivals before rendering transfer station tiles", () => {
    const groups = groupStationArrivals([
      { lineId: "line-2", direction: "Bloor-Danforth Line towards Kennedy Station", minutes: 3, predictedAt: "2026-06-05T14:14:10-04:00", label: "3 min", source: "TTC scheduled service", status: "scheduled" },
      { lineId: "line-2", direction: "Bloor-Danforth Line towards Kennedy Station", minutes: 3, predictedAt: "2026-06-05T14:14:10-04:00", label: "3 min", source: "TTC scheduled service", status: "scheduled" },
      { lineId: "line-2", direction: "Bloor-Danforth Line towards Kennedy Station", minutes: 7, predictedAt: "2026-06-05T14:18:10-04:00", label: "7 min", source: "TTC scheduled service", status: "scheduled" },
    ], [line2]);

    assert.deepEqual(groups[0].arrivals.map((arrival) => arrival.label), ["3 min", "7 min"]);
  });

  it("does not infer a cardinal direction from a paired platform label", () => {
    const groups = groupStationArrivals([
      {
        lineId: "line-1",
        direction: "Yonge-University Line towards Vaughan Metropolitan Centre Station",
        minutes: 5,
        predictedAt: null,
        label: "5 min",
        source: "TTC scheduled service",
        status: "scheduled",
      },
    ], [line1]);

    assert.equal(groups[0].directionLabel, "To Vaughan Metropolitan Centre");
  });

  it("labels Line 1 destination directions by station side of the U", () => {
    assert.equal(
      formatArrivalDirection({
        lineId: "line-1",
        direction: "Yonge-University Line towards Vaughan Metropolitan Centre Station",
      }, line1, "museum"),
      "Northbound to Vaughan Metropolitan Centre",
    );
    assert.equal(
      formatArrivalDirection({
        lineId: "line-1",
        direction: "Yonge-University Line towards Finch Station",
      }, line1, "museum"),
      "Southbound to Finch",
    );
    assert.equal(
      formatArrivalDirection({
        lineId: "line-1",
        direction: "Yonge-University Line towards Finch Station",
      }, line1, "rosedale"),
      "Northbound to Finch",
    );
    assert.equal(
      formatArrivalDirection({
        lineId: "line-1",
        direction: "Yonge-University Line towards Vaughan Metropolitan Centre Station",
      }, line1, "rosedale"),
      "Southbound to Vaughan Metropolitan Centre",
    );
  });

  it("labels Union Line 1 arrivals with terminal-specific northbound platform directions", () => {
    const groups = groupStationArrivals([
      {
        lineId: "line-1",
        direction: "Northbound",
        minutes: 1,
        predictedAt: "2026-07-02T10:26:00Z",
        label: "1 min",
        source: "TTC GTFS-RT subway trip updates",
        status: "live",
      },
      {
        lineId: "line-1",
        direction: "Southbound",
        minutes: 2,
        predictedAt: "2026-07-02T10:27:00Z",
        label: "2 min",
        source: "TTC GTFS-RT subway trip updates",
        status: "live",
      },
    ], [line1], { stationId: "union" });

    assert.deepEqual(
      groups.map((group) => group.directionLabel),
      ["Northbound to Finch", "Northbound to Vaughan Metropolitan Centre"],
    );
    assert.equal(
      formatArrivalDirection({
        lineId: "line-1",
        direction: "Southbound to Vaughan Metropolitan Centre",
      }, line1, "union"),
      "Northbound to Vaughan Metropolitan Centre",
    );
  });

  it("resolves cardinal directions to terminal destinations when destination is omitted", () => {
    assert.equal(
      formatArrivalDirection({ lineId: "line-1", direction: "Northbound" }, line1, "museum"),
      "Northbound to Vaughan Metropolitan Centre"
    );
    assert.equal(
      formatArrivalDirection({ lineId: "line-1", direction: "Southbound" }, line1, "museum"),
      "Southbound to Finch"
    );

    assert.equal(
      formatArrivalDirection({ lineId: "line-1", direction: "Northbound" }, line1, "rosedale"),
      "Northbound to Finch"
    );
    assert.equal(
      formatArrivalDirection({ lineId: "line-1", direction: "Southbound" }, line1, "rosedale"),
      "Southbound to Vaughan Metropolitan Centre"
    );

    assert.equal(
      formatArrivalDirection({ lineId: "line-2", direction: "Eastbound" }, line2, "spadina"),
      "Eastbound to Kennedy"
    );
    assert.equal(
      formatArrivalDirection({ lineId: "line-2", direction: "Westbound" }, line2, "spadina"),
      "Westbound to Kipling"
    );

    assert.equal(
      formatArrivalDirection({ lineId: "line-4", direction: "Eastbound" }, null, "don-mills"),
      "Eastbound to Don Mills"
    );
    assert.equal(
      formatArrivalDirection({ lineId: "line-4", direction: "Westbound" }, null, "don-mills"),
      "Westbound to Sheppard-Yonge"
    );

    assert.equal(
      formatArrivalDirection({ lineId: "line-5", direction: "Eastbound" }, null, "mount-dennis"),
      "Eastbound to Kennedy"
    );
    assert.equal(
      formatArrivalDirection({ lineId: "line-5", direction: "Westbound" }, null, "mount-dennis"),
      "Westbound to Mount Dennis"
    );

    assert.equal(
      formatArrivalDirection({ lineId: "line-6", direction: "Eastbound" }, null, "finch-west"),
      "Eastbound to Finch West"
    );
    assert.equal(
      formatArrivalDirection({ lineId: "line-6", direction: "Westbound" }, null, "finch-west"),
      "Westbound to Humber College"
    );
  });

  it("builds empty platform groups for missing live arrival directions", () => {
    const groups = groupStationArrivals([
      {
        lineId: "line-1",
        direction: "Northbound",
        minutes: 2,
        predictedAt: "2026-07-03T10:27:00Z",
        label: "2 min",
        source: "TTC GTFS-RT subway trip updates",
        status: "live",
      },
    ], [line1], { stationId: "st-andrew", includeEmptyDirections: true });

    assert.deepEqual(
      groups.map((group) => [group.directionLabel, group.arrivals.map((arrival) => arrival.label)]),
      [
        ["Northbound to Vaughan Metropolitan Centre", ["2 min"]],
        ["Southbound to Finch", []],
      ],
    );
  });

  it("marks due arrivals from the label or zero-minute schedule", () => {
    assert.equal(isArrivalDue({ label: "Due", minutes: 1, status: "scheduled" }), true);
    assert.equal(isArrivalDue({ label: "1 min", minutes: 0, status: "scheduled" }), true);
    assert.equal(isArrivalDue({ label: "Unavailable", minutes: null, status: "unavailable" }), false);
  });

  it("formats predicted arrival clock times in Toronto time", () => {
    const now = new Date("2026-06-04T12:00:00-04:00");
    assert.equal(formatArrivalClockTime("2026-06-04T21:53:00-04:00", now), "9:53 PM");
    assert.equal(
      formatArrivalClockTime("2026-06-05T06:32:00-04:00", now),
      "Tomorrow, 6:32 AM",
    );
    assert.equal(formatArrivalClockTime(null), null);
  });

  it("uses compact labels for arrival tiles", () => {
    assert.equal(formatArrivalTileLabel({ label: "3 min", minutes: 3 }), "3m");
    assert.equal(formatArrivalTileLabel({ label: "Due", minutes: 0 }), "Due");
    assert.equal(formatArrivalTileLabel({ label: "Unavailable", minutes: null }), "Unavailable");
  });

  it("labels mixed live and scheduled arrival sources", () => {
    const liveArrival = {
      lineId: "line-2",
      direction: "Eastbound",
      minutes: 1,
      predictedAt: "2026-07-02T10:26:00Z",
      label: "1 min",
      source: "TTC GTFS-RT subway trip updates",
      status: "live",
    };
    const scheduledArrival = {
      lineId: "line-2",
      direction: "Westbound",
      minutes: 4,
      predictedAt: "2026-07-02T10:29:00Z",
      label: "4 min",
      source: "TTC scheduled service",
      status: "scheduled",
    };

    assert.equal(
      formatArrivalSourceSummary([liveArrival, scheduledArrival], "TTC GTFS-RT subway trip updates / TTC scheduled service"),
      "Mixed Live + Scheduled Fallback",
    );
    assert.equal(formatArrivalSourceBadgeLabel([liveArrival]), "Live");
    assert.equal(formatArrivalSourceBadgeLabel([scheduledArrival]), "Scheduled");
    assert.equal(formatArrivalSourceBadgeLabel([liveArrival, scheduledArrival]), "Mixed");
    assert.equal(formatArrivalSourceBadgeLabel([], { emptyLiveDirection: true }), "No live ETA");
    assert.equal(formatArrivalSourceBadgeLabel([]), "Unavailable");
    assert.equal(
      formatArrivalDisclaimer([liveArrival, scheduledArrival], null),
      "Live GTFS-RT rows are shown where available; scheduled rows fill missing directions.",
    );
  });

  it("updates live minute labels from predicted arrival time as time passes", () => {
    const liveArrival = {
      label: "6 min",
      minutes: 6,
      predictedAt: "2026-07-02T10:31:00Z",
      status: "live",
    };

    assert.equal(
      formatArrivalTileLabel(liveArrival, {
        now: new Date("2026-07-02T10:26:45Z"),
      }),
      "5m",
    );
    assert.equal(
      formatArrivalTileLabel(liveArrival, {
        now: new Date("2026-07-02T10:29:10Z"),
      }),
      "2m",
    );
  });

  it("keeps live arrivals due until the backend removes them from the station feed", () => {
    const liveArrival = {
      label: "Due",
      minutes: 0,
      predictedAt: "2026-07-02T10:26:00Z",
      status: "live",
    };

    assert.equal(isArrivalDue(liveArrival, new Date("2026-07-02T10:26:20Z")), true);
    assert.equal(isArrivalDue(liveArrival, new Date("2026-07-02T10:26:31Z")), true);
  });

  it("does not filter live arrivals client-side after predicted time passes", () => {
    const groups = groupStationArrivals([
      {
        lineId: "line-2",
        direction: "Bloor-Danforth Line towards Kennedy Station",
        minutes: 0,
        predictedAt: "2026-07-02T10:26:00Z",
        label: "Due",
        source: "TTC GTFS-RT subway trip updates",
        status: "live",
      },
      {
        lineId: "line-2",
        direction: "Bloor-Danforth Line towards Kennedy Station",
        minutes: 3,
        predictedAt: "2026-07-02T10:29:00Z",
        label: "3 min",
        source: "TTC GTFS-RT subway trip updates",
        status: "live",
      },
    ], [line2], { stationId: "high-park" });

    assert.equal(groups.length, 1);
    assert.deepEqual(
      groups[0].arrivals.map((arrival) => arrival.predictedAt),
      ["2026-07-02T10:26:00Z", "2026-07-02T10:29:00Z"],
    );
  });

  it("uses a ticking range label for the nearest live arrival tile", () => {
    const liveArrival = {
      label: "1 min",
      minutes: 1,
      predictedAt: "2026-07-02T10:26:28Z",
      status: "live",
    };

    assert.equal(
      formatArrivalTileLabel(liveArrival, {
        detailedCountdown: true,
        now: new Date("2026-07-02T10:25:46Z"),
      }),
      "0:42 - 1:42",
    );
    assert.equal(
      formatArrivalTileLabel(liveArrival, {
        detailedCountdown: true,
        now: new Date("2026-07-02T10:26:40Z"),
      }),
      "Due",
    );
    assert.equal(formatArrivalTileLabel(liveArrival), "1m");
  });

  it("uses the ticking range label for scheduled arrivals inside the final two minutes", () => {
    const scheduledArrival = {
      label: "1 min",
      minutes: 1,
      predictedAt: "2026-07-02T10:26:28Z",
      status: "scheduled",
    };

    assert.equal(
      shouldUseDetailedArrivalCountdown(scheduledArrival, new Date("2026-07-02T10:25:46Z")),
      true,
    );
    assert.equal(
      formatArrivalTileLabel(scheduledArrival, {
        detailedCountdown: true,
        now: new Date("2026-07-02T10:25:46Z"),
      }),
      "0:42 - 1:42",
    );
  });

  it("only uses the detailed countdown inside the final two minutes", () => {
    const liveArrival = {
      label: "3 min",
      minutes: 3,
      predictedAt: "2026-07-02T10:28:46Z",
      status: "live",
    };

    assert.equal(
      shouldUseDetailedArrivalCountdown(liveArrival, new Date("2026-07-02T10:25:46Z")),
      false,
    );
    assert.equal(
      formatArrivalTileLabel(liveArrival, {
        detailedCountdown: true,
        now: new Date("2026-07-02T10:25:46Z"),
      }),
      "3m",
    );
    assert.equal(
      shouldUseDetailedArrivalCountdown(liveArrival, new Date("2026-07-02T10:26:55Z")),
      true,
    );
    assert.equal(
      formatArrivalTileLabel(liveArrival, {
        detailedCountdown: true,
        now: new Date("2026-07-02T10:26:55Z"),
      }),
      "1:51 - 2:51",
    );
  });

  it("uses source-aware scheduled disclaimer text instead of stale demo copy", () => {
    const staleDisclaimer = "Station details use seeded backend data. Arrivals are demo placeholders, not live TTC predictions.";
    assert.equal(
      formatArrivalDisclaimer([
        {
          lineId: "line-1",
          direction: "Northbound to Finch",
          minutes: 3,
          predictedAt: null,
          label: "3 min",
          source: "TTC scheduled service",
          status: "scheduled",
        },
      ], staleDisclaimer),
      "Scheduled arrivals use TTC timetable data and are not live train predictions.",
    );
    assert.equal(
      formatArrivalDisclaimer([
        {
          lineId: "line-1",
          direction: "Northbound",
          minutes: 3,
          predictedAt: null,
          label: "3 min",
          source: "Demo estimates",
          status: "demo",
        },
      ], staleDisclaimer),
      staleDisclaimer,
    );
  });

  it("uses the mixed-source disclaimer when live arrivals have scheduled fallbacks", () => {
    assert.equal(
      formatArrivalDisclaimer([
        {
          lineId: "line-1",
          direction: "Northbound",
          minutes: 3,
          predictedAt: "2026-07-02T10:28:46Z",
          label: "3 min",
          source: "TTC GTFS-RT subway trip updates",
          status: "live",
        },
        {
          lineId: "line-6",
          direction: "Eastbound to Finch West",
          minutes: 8,
          predictedAt: "2026-07-02T10:33:46Z",
          label: "8 min",
          source: "TTC scheduled service",
          status: "scheduled",
        },
      ], "Scheduled arrivals use TTC timetable data and are not live train predictions."),
      "Live GTFS-RT rows are shown where available; scheduled rows fill missing directions.",
    );
  });

  it("exports a standardized 3-second countdown interval", () => {
    assert.equal(ARRIVAL_COUNTDOWN_TICK_MS, 3000);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fallbackStationDetails,
  fallbackStationSummaries,
  getStationDetail,
  getStationSummaries,
} from "../src/app/station-data.ts";

describe("station data adapter", () => {
  const stationById = (id) => fallbackStationSummaries.stations.find((station) => station.id === id);

  it("uses backend station summaries when fetch succeeds", async () => {
    const response = await getStationSummaries({
      fetcher: async () =>
        new Response(
          JSON.stringify({
            generatedAt: "seeded-demo",
            stations: [
              {
                id: "union",
                name: "Union",
                mapX: 4311,
                mapY: 3597,
                interchange: true,
                lineIds: ["line-1"],
                hasActiveImpact: true,
                accessStatus: "normal",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ),
    });

    assert.equal(response.source, "backend");
    assert.equal(response.data.stations[0].id, "union");
  });

  it("falls back to local station detail when backend fetch fails", async () => {
    const response = await getStationDetail("union", {
      fetcher: async () => {
        throw new Error("backend offline");
      },
    });

    assert.equal(response.source, "fallback");
    assert.equal(response.data.id, "union");
    assert.match(response.data.disclaimer, /demo placeholders/);
  });

  it("does not preserve the old misspelled eglinton id", () => {
    const ids = [
      ...fallbackStationSummaries.stations.map((station) => station.id),
      ...Object.keys(fallbackStationDetails),
    ];

    assert.ok(ids.includes("eglinton"));
    assert.ok(!ids.includes("eglington"));
  });

  it("does not invent active station impacts in fallback mode", () => {
    assert.ok(fallbackStationSummaries.stations.every((station) => !station.hasActiveImpact));
    assert.ok(Object.values(fallbackStationDetails).every((station) => station.impacts.length === 0));
  });

  it("provides zero accessibility outage counts in fallback summary mode", () => {
    assert.ok(fallbackStationSummaries.stations.every((station) => {
      return station.accessOutageCounts.elevator === 0 && station.accessOutageCounts.escalator === 0;
    }));
  });

  it("provides fallback details and correct line ids for every mapped station", () => {
    assert.equal(
      Object.keys(fallbackStationDetails).length,
      fallbackStationSummaries.stations.length
    );
    assert.deepEqual(stationById("kipling").lineIds, ["line-2"]);
    assert.deepEqual(stationById("castle-frank").lineIds, ["line-2"]);
    assert.deepEqual(stationById("don-mills").lineIds, ["line-4"]);
    assert.deepEqual(stationById("mount-dennis").lineIds, ["line-5"]);
    assert.deepEqual(stationById("humber-college").lineIds, ["line-6"]);
  });

  it("keeps Spadina accessibility distinct per line", () => {
    assert.deepEqual(
      fallbackStationDetails.spadina.lines.map(
        ({ id, wheelchairAccessible, hasElevator }) => ({
          id,
          wheelchairAccessible,
          hasElevator,
        })
      ),
      [
        { id: "line-1", wheelchairAccessible: false, hasElevator: false },
        { id: "line-2", wheelchairAccessible: true, hasElevator: true },
      ]
    );
  });

  it("labels fallback arrivals as demo and backend contract as schedule-aware", () => {
    const union = fallbackStationDetails.union;

    assert.equal(union.arrivalsSource, "Demo estimates");
    assert.ok(union.arrivals.every((arrival) => arrival.status === "demo"));
    assert.equal(union.arrivalContext.scheduleMayBeDisrupted, false);
    assert.equal(union.arrivalContext.message, "Schedule active");
  });
});

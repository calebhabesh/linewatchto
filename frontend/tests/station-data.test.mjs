import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fallbackStationDetails,
  fallbackStationSummaries,
  getStationDetail,
  getStationSummaries,
  isLrtOnlyLine,
  isLrtOnlyStation,
  isLrtOnlyStationId,
} from "../src/app/station-data.ts";
import { groupStationArrivals } from "../src/app/station-arrivals.ts";

describe("station data adapter", () => {
  const stationById = (id) => fallbackStationSummaries.stations.find((station) => station.id === id);

  it("uses backend station summaries when fetch succeeds", async () => {
    const requests = [];
    const response = await getStationSummaries({
      fetcher: async (input) => {
        requests.push(input);
        return new Response(
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
        );
      },
    });

    assert.equal(response.source, "backend");
    assert.equal(response.data.stations[0].id, "union");
    assert.equal(requests[0], "/api/stations");
  });

  it("uses same-origin API paths by default for station details", async () => {
    const requests = [];
    const response = await getStationDetail("union", {
      fetcher: async (input) => {
        requests.push(input);
        return new Response(
          JSON.stringify({
            id: "union",
            name: "Union",
            mapX: 4311,
            mapY: 3597,
            interchange: true,
            lines: [],
            access: { status: "normal", summary: "No active outages", outages: [] },
            impacts: [],
            arrivals: [],
            arrivalsSource: "TTC scheduled service",
            arrivalContext: { status: "scheduled", message: "Schedule active", scheduleMayBeDisrupted: false },
            dataMode: "seeded-demo",
            disclaimer: "Scheduled arrivals use TTC timetable data and are not live train predictions.",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    });

    assert.equal(response.source, "backend");
    assert.equal(response.data.id, "union");
    assert.equal(requests[0], "/api/stations/union");
  });

  it("still honors explicit non-local station API bases", async () => {
    const requests = [];
    await getStationSummaries({
      apiBaseUrl: "https://api.linewatch.example",
      fetcher: async (input) => {
        requests.push(input);
        return new Response(
          JSON.stringify({ generatedAt: "seeded-demo", stations: [] }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    });

    assert.equal(requests[0], "https://api.linewatch.example/api/stations");
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

  it("preserves canonical TTC station-name spelling and punctuation", () => {
    assert.equal(stationById("bloor-yonge").name, "Bloor-Yonge");
    assert.equal(stationById("sheppard-yonge").name, "Sheppard-Yonge");
    assert.equal(stationById("queens-park").name, "Queen's Park");
    assert.equal(stationById("st-patrick").name, "St Patrick");
    assert.equal(stationById("st-andrew").name, "St Andrew");
    assert.equal(stationById("st-clair-west").name, "St Clair West");
    assert.equal(stationById("o_connor").name, "O'Connor");
    assert.equal(stationById("aga-khan-park-and-museum").name, "Aga Khan Park & Museum");
    assert.equal(stationById("greenwoood").name, "Greenwood");
    assert.equal(stationById("st-george").name, "St George");
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

  it("fills each fallback arrival direction queue", () => {
    const union = fallbackStationDetails.union;
    const groups = groupStationArrivals(union.arrivals, union.lines, { stationId: union.id });

    assert.deepEqual(
      groups.map((group) => [group.directionLabel, group.arrivals.map((arrival) => arrival.label)]),
      [
        ["Northbound to Finch", ["3 min", "6 min", "9 min"]],
        ["Northbound to Vaughan Metropolitan Centre", ["6 min", "9 min", "12 min"]],
      ]
    );
  });

  it("keeps Cedarvale fallback coordinates aligned with the current SVG asset", () => {
    const cedarvale = fallbackStationSummaries.stations.find((station) => station.id === "cedarvale");
    assert.equal(cedarvale?.mapX, 2936);
    assert.equal(cedarvale?.mapY, 1810);
  });

  it("correctly identifies LRT-only lines and stations", () => {
    assert.equal(isLrtOnlyLine("line-5"), true);
    assert.equal(isLrtOnlyLine("line-6"), true);
    assert.equal(isLrtOnlyLine("5"), true);
    assert.equal(isLrtOnlyLine("6"), true);
    assert.equal(isLrtOnlyLine("line-1"), false);
    assert.equal(isLrtOnlyLine("line-2"), false);
    assert.equal(isLrtOnlyLine("line-4"), false);

    assert.equal(isLrtOnlyStation(["line-5"]), true);
    assert.equal(isLrtOnlyStation(["line-6"]), true);
    assert.equal(isLrtOnlyStation(["line-1"]), false);
    assert.equal(isLrtOnlyStation(["line-1", "line-5"]), false);
    assert.equal(isLrtOnlyStation(fallbackStationDetails["mount-dennis"].lines), true);
    assert.equal(isLrtOnlyStation(fallbackStationDetails["humber-college"].lines), true);
    assert.equal(isLrtOnlyStation(fallbackStationDetails.union.lines), false);
    assert.equal(isLrtOnlyStation(fallbackStationDetails.cedarvale.lines), false);

    assert.equal(isLrtOnlyStationId("mount-dennis"), true);
    assert.equal(isLrtOnlyStationId("humber-college"), true);
    assert.equal(isLrtOnlyStationId("union"), false);
    assert.equal(isLrtOnlyStationId("cedarvale"), false);
    assert.equal(isLrtOnlyStationId("eglinton"), false);
    assert.equal(isLrtOnlyStationId("finch-west"), false);
    assert.equal(isLrtOnlyStationId("kennedy"), false);
  });
});

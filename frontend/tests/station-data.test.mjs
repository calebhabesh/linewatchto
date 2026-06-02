import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fallbackStationDetails,
  fallbackStationSummaries,
  getStationDetail,
  getStationSummaries,
} from "../src/app/station-data.ts";

describe("station data adapter", () => {
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
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getSavedStations,
  removeSavedStation,
  saveStation,
} from "../src/app/saved-station-data.ts";

const savedStation = {
  networkId: "ttc",
  station: {
    id: "sheppard-yonge",
    name: "Sheppard-Yonge",
    mapX: 1,
    mapY: 2,
    interchange: true,
    lineIds: ["line-1", "line-4"],
    hasActiveImpact: false,
    accessStatus: "normal",
    accessOutageCounts: { elevator: 0, escalator: 0 },
  },
  savedAt: "2026-07-23T14:30:00Z",
};

describe("saved station data adapter", () => {
  it("loads account-owned station summaries with credentials", async () => {
    const requests = [];
    const result = await getSavedStations({
      fetcher: async (input, init) => {
        requests.push({ input, init });
        return new Response(JSON.stringify({ stations: [savedStation] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    assert.equal(result.source, "backend");
    assert.equal(result.stations[0].station.name, "Sheppard-Yonge");
    assert.equal(requests[0].input, "/api/account/stations");
    assert.equal(requests[0].init.credentials, "include");
  });

  it("uses idempotent encoded PUT and DELETE endpoints", async () => {
    const requests = [];
    const fetcher = async (input, init) => {
      requests.push({ input, init });
      return init.method === "PUT"
        ? new Response(JSON.stringify({ station: savedStation.station, savedAt: savedStation.savedAt }), {
            status: 201,
            headers: { "content-type": "application/json" },
          })
        : new Response(null, { status: 204 });
    };

    const saved = await saveStation("station/with slash", "regional", { fetcher });
    await removeSavedStation("station/with slash", "regional", { fetcher });

    assert.equal(saved.station.id, "sheppard-yonge");
    assert.equal(saved.networkId, "regional");
    assert.equal(requests[0].input, "/api/account/stations/station%2Fwith%20slash?network=regional");
    assert.equal(requests[0].init.method, "PUT");
    assert.equal(requests[1].init.method, "DELETE");
  });

  it("returns an unavailable list without inventing local saved relationships", async () => {
    const result = await getSavedStations({ fetcher: async () => { throw new Error("offline"); } });
    assert.equal(result.source, "unavailable");
    assert.deepEqual(result.stations, []);
  });

  it("surfaces backend error codes for mutations", async () => {
    await assert.rejects(
      saveStation("unknown", "ttc", {
        fetcher: async () => new Response(JSON.stringify({ error: "unknown_station", message: "Station was not found." }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      }),
      (error) => error.status === 404 && error.errorCode === "unknown_station",
    );
  });
});

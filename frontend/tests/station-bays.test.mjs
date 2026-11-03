import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bayNumberFromPlatform, stationBayStopCode } from "../src/app/station-bays.ts";
import { parseSurfaceRouteDetails } from "../src/app/surface-arrivals.ts";

const index = {
  schemaVersion: "1.0.0",
  network: "ttc",
  layer: "station-bays",
  stations: {
    jane: [{ bay: "1", stopCode: "15009" }, { bay: "2", stopCode: "14700" }],
    kipling: [{ bay: "6", stopCode: "1" }, { bay: "6", stopCode: "2" }],
  },
};

describe("station bay signs (plan 13, S7 review)", () => {
  it("signs only a plain bay number", () => {
    assert.equal(bayNumberFromPlatform("Bay 2"), "2");
    assert.equal(bayNumberFromPlatform("2"), "2");
    assert.equal(bayNumberFromPlatform("Bay 6a"), "6A");
    assert.equal(bayNumberFromPlatform("Streetcar Platform"), null);
    assert.equal(bayNumberFromPlatform("Platform 1"), null);
    assert.equal(bayNumberFromPlatform("Bay 2, Platform 1"), null);
    assert.equal(bayNumberFromPlatform(""), null);
  });

  it("links a bay to its stop only when exactly one stop has that number", () => {
    assert.equal(stationBayStopCode(index, "jane", "2"), "14700");
    assert.equal(stationBayStopCode(index, "jane", "9"), null);
    assert.equal(stationBayStopCode(index, "kipling", "6"), null, "two bay 6 stops: no guess");
    assert.equal(stationBayStopCode(null, "jane", "2"), null);
  });

  it("leaves the bay out of a row's meta line under a sign, and keeps it otherwise", () => {
    const details = parseSurfaceRouteDetails({ mode: "bus", route: "149", routeName: "Etobicoke-Bloor", destination: "West - 149 Etobicoke-Bloor towards Kipling Station", bayPlatform: "Bay 2" });
    assert.equal(details.metaSubtitle, "TTC Bus · West · Bay 2");
    assert.equal(details.metaSubtitleWithoutBay, "TTC Bus · West");
  });
});

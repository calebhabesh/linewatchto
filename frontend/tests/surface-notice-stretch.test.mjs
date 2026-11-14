import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { noticeStopRange, stretchPath, stretchStopCodes } from "../src/app/surface-notice-stretch.ts";

const notice = (extra) => ({
  id: "n", category: "detour", routeType: "Bus", routeIds: ["12"], title: "12 Kingston Rd: Detour", description: "",
  stopIds: ["4692", "4268"], updatedAt: "2026-11-14T00:00:00Z", source: "TTC",
  stops: [{ stopId: "4692", stopName: "Victoria Park Ave at Gerrard St East" }, { stopId: "4268", stopName: "Kingston Rd at Warden Ave" }],
  location: "Victoria Park Ave at Gerrard St East to Kingston Rd at Warden Ave",
  ...extra,
});

describe("noticeStopRange", () => {
  it("reads a run of stops only from the backend's endpoint form", () => {
    assert.equal(noticeStopRange(notice({}), "ttc")?.to.stopId, "4268");
    // A detour's two stops are where it leaves and rejoins the route.
    const twoStops = "Victoria Park Ave at Gerrard St East, Kingston Rd at Warden Ave";
    assert.equal(noticeStopRange(notice({ location: twoStops }), "ttc")?.to.stopId, "4268");
    // Any other notice's two stops may be separate poles: no stretch between them.
    assert.equal(noticeStopRange(notice({ category: "no-service", location: twoStops }), "ttc"), null);
    assert.equal(noticeStopRange(notice({ category: "service-change", location: twoStops }), "ttc"), null);
    assert.equal(noticeStopRange(notice({ stops: [], stopIds: ["4692"], location: "Stop 4692" }), "ttc"), null);
  });

  it("never draws a stretch for GO notices", () => {
    assert.equal(noticeStopRange(notice({ routeType: "GO Bus" }), "regional"), null);
    assert.equal(noticeStopRange(notice({}), "regional"), null);
  });
});

// A street grid near the origin: 0.001 degrees is roughly 80 to 110 metres.
const at = { A: [0, 0], B: [0, 0.001], C: [0, 0.002], D: [0.001, 0.002], X: [0.0001, 0.002], Z: [0.005, 0.005] };
const positionOf = (code) => at[code] ?? null;

describe("stretchStopCodes", () => {
  it("takes the stops between the ends on the busiest pattern passing both, in source order", () => {
    const patterns = [
      { direction: 0, headsign: "East", trips: 5, stops: ["A", "B", "C", "D"] },
      { direction: 1, headsign: "West", trips: 9, stops: ["D", "C", "B", "A"] },
    ];
    assert.deepEqual(stretchStopCodes(patterns, { from: ["A"], to: ["C"] }, positionOf), ["A", "B", "C"]);
  });

  it("matches an end named on the other side of the street to the pattern's pole there", () => {
    const patterns = [{ direction: 0, headsign: "East", trips: 5, stops: ["A", "B", "C", "D"] }];
    assert.deepEqual(stretchStopCodes(patterns, { from: ["A"], to: ["X"] }, positionOf), ["A", "B", "C"]);
  });

  it("gives nothing when no pattern passes both ends", () => {
    const patterns = [{ direction: 0, headsign: "East", trips: 5, stops: ["A", "B"] }];
    assert.equal(stretchStopCodes(patterns, { from: ["A"], to: ["Z"] }, positionOf), null);
  });
});

describe("stretchPath", () => {
  const corridor = (routes, coordinates) => ({ geometry: { coordinates }, properties: { routes } });

  it("follows the route's own streets around a corner, joining streets that only nearly meet", () => {
    const features = [
      corridor(["12"], [[0, 0], [0, 0.002]]),
      // Starts a few metres off the first street's end.
      corridor(["12"], [[0.00002, 0.002], [0.002, 0.002]]),
      corridor(["99"], [[0, 0], [0.002, 0.002]]),
    ];
    const path = stretchPath(features, "12", [[0, 0.0005], [0, 0.0015], [0.0015, 0.002]]);
    assert.ok(path);
    const near = (point, expected) => Math.abs(point[0] - expected[0]) < 1e-9 && Math.abs(point[1] - expected[1]) < 1e-9;
    assert.ok(near(path[0], [0, 0.0005]));
    assert.ok(near(path.at(-1), [0.0015, 0.002]));
    // Through the corner, never the other route's diagonal.
    assert.ok(path.some(([lon, lat]) => lon < 0.0001 && lat > 0.0019));
  });

  it("starts and ends on the end poles, off the street's centre line", () => {
    const features = [corridor(["12"], [[0, 0], [0, 0.002]])];
    const ends = [[0.0002, 0.0005], [0.0002, 0.0015]];
    const path = stretchPath(features, "12", ends);
    assert.deepEqual(path[0], ends[0]);
    assert.deepEqual(path.at(-1), ends[1]);
    // In between, it runs down the street.
    assert.ok(path.slice(1, -1).every(([lon]) => lon === 0));
  });

  it("gives nothing when a stop is off the route's streets or a hop cannot be traced", () => {
    const features = [corridor(["12"], [[0, 0], [0, 0.001]]), corridor(["12"], [[0.01, 0.01], [0.011, 0.01]])];
    assert.equal(stretchPath(features, "12", [[0, 0], [0.003, 0.003]]), null);
    assert.equal(stretchPath(features, "12", [[0, 0], [0.0105, 0.01]]), null);
  });
});

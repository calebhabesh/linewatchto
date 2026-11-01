import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mapCorridors, mapCommutePreview } from "../src/app/map-corridors.ts";

// A line drawn west to east: union – exhibition – mimico – long-branch, and a
// branch from mimico north to etobicoke.
const segment = (id, stationAId, stationBId, pathD, extra = {}) => ({
  id, lineId: "regional-lw", label: `${stationAId} to ${stationBId}`, stationAId, stationBId,
  stationAAnchorId: `station-${stationAId}`, stationBAnchorId: `station-${stationBId}`, pathD, overlay: "clear", impacts: [],
  ...extra,
});
const s1 = segment("s1", "union", "exhibition", "M 0 0 L 10 0");
const s2 = segment("s2", "exhibition", "mimico", "M 10 0 L 20 0");
const s3 = segment("s3", "mimico", "long-branch", "M 20 0 L 30 0");
const branch = segment("b1", "mimico", "etobicoke", "M 20 0 L 20 10");
const far = segment("f1", "clarkson", "oakville", "M 50 0 L 60 0");

const shape = (corridors) => corridors.map(({ segments, pathD, travelDirection }) => ({
  segments: segments.map((item) => item.id), pathD, travelDirection,
}));

describe("shared map corridors", () => {
  it("draws nothing for no segments, or none with a path", () => {
    assert.deepEqual(mapCorridors([], "bidirectional"), []);
    assert.deepEqual(mapCorridors([{ ...s1, pathD: "" }], "bidirectional"), []);
  });

  it("joins segments that meet at a station into one path, in travel order", () => {
    assert.deepEqual(shape(mapCorridors([s2, s1, s3], "forward")), [
      { segments: ["s1", "s2", "s3"], pathD: "M 0 0 L 10 0 L 20 0 L 30 0", travelDirection: "forward" },
    ]);
  });

  it("keeps segments that don't meet as separate corridors (no chord across the gap)", () => {
    assert.deepEqual(shape(mapCorridors([s1, far], "bidirectional")).map(({ segments }) => segments), [["s1"], ["f1"]]);
  });

  it("draws a branching stretch as one corridor: the line runs on, the branch is its own subpath", () => {
    assert.deepEqual(shape(mapCorridors([s1, s2, s3, branch], "bidirectional")), [
      { segments: ["s1", "s2", "s3", "b1"], pathD: "M 0 0 L 10 0 L 20 0 L 30 0 M 20 0 L 20 10", travelDirection: "bidirectional" },
    ]);
  });

  it("draws a closed loop as one path", () => {
    const loop = [
      segment("l1", "a", "b", "M 0 0 L 10 0"),
      segment("l2", "b", "c", "M 10 0 L 10 10"),
      segment("l3", "c", "a", "M 10 10 L 0 0"),
    ];
    assert.deepEqual(shape(mapCorridors(loop, "bidirectional")).map(({ segments }) => segments), [["l1", "l2", "l3"]]);
  });

  it("heads the alert's way when its first segment is drawn the other way", () => {
    // A segment drawn from B to A (its guide runs backwards).
    const reversed = { ...s1, pathD: "M 10 0 L 0 0", guidePathReversed: true };
    const [corridor] = mapCorridors([reversed, s2], "forward");
    assert.equal(corridor.pathD, "M 0 0 L 10 0 L 20 0");
    assert.equal(corridor.travelDirection, "forward");
    // Every subpath of a branching corridor runs the alert's way (A to B).
    const backBranch = { ...branch, pathD: "M 20 10 L 20 0", guidePathReversed: true };
    assert.equal(mapCorridors([s1, s2, s3, backBranch], "forward")[0].pathD, "M 0 0 L 10 0 L 20 0 L 30 0 M 20 0 L 20 10");
  });
});

describe("shared commute preview", () => {
  const dots = (stationId, routeAnchorId) => [{
    id: routeAnchorId ?? `station-${stationId}`, center: { x: 0, y: 0 }, dot: { radius: 32, outline: 8 },
  }];
  const preview = (overrides = {}) => ({
    id: "c1", commuteId: "commute-1", legId: "outbound", label: "Home", routeLabel: "LW",
    segmentIds: ["s1", "s2"], stationIds: ["union", "exhibition", "mimico"], ...overrides,
  });

  it("composes the route in its order as one path and ends on the dots it uses", () => {
    const commute = mapCommutePreview(preview(), [s2, s1], dots);
    assert.equal(commute.pathD, "M 0 0 L 10 0 L 20 0");
    assert.deepEqual(commute.endpoints.map(({ key, dotRadius, flashRadius }) => [key, dotRadius, flashRadius]), [
      ["origin:union:station-union", 34, 38],
      ["destination:mimico:station-mimico", 34, 38],
    ]);
  });

  it("still flashes its ends when the route has no drawable path", () => {
    const commute = mapCommutePreview(preview({ segmentIds: [] }), [s1, s2], dots);
    assert.equal(commute.pathD, "");
    assert.equal(commute.endpoints.length, 2);
    assert.equal(mapCommutePreview(null, [s1], dots), null);
  });
});

describe("hover outline groups", () => {
  it("outlines each alert once, around all of its stretches", async () => {
    const { lineAlertHoverOutlineGroups } = await import("../src/components/map-overlays/line-alert-model.ts");
    const alert = (key, kind, impactId, lineId, extra = {}) => ({
      key, kind, impactId, lineId, pathD: `M 0 0 L ${key.length} 0`, travelDirection: "forward",
      visualState: "delay-static", label: key, segmentIds: [], ...extra,
    });
    const groups = lineAlertHoverOutlineGroups([
      alert("a-lw", "delay", "a", "lw"),
      alert("b-lw", "suspension", "b", "lw"),
      alert("a-ki", "delay", "a", "ki"),
      // The same id as another kind (a closure's current effect and its preview) is its own alert.
      alert("b-preview", "planned-closure", "b", "lw", { visualState: "planned-preview" }),
      alert("a-gone", "delay", "a", "le", { exiting: true }),
      alert("a-empty", "delay", "a", "mi", { pathD: "" }),
    ]);
    assert.deepEqual(groups.map(({ key, stretches }) => [key, stretches.map((item) => item.key)]), [
      ["delay:a", ["a-lw", "a-ki"]],
      ["suspension:b", ["b-lw"]],
      ["planned-closure:b", ["b-preview"]],
    ]);
  });
});

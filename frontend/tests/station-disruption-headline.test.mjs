import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupStationDisruptions } from "../src/components/station-disruption-headline.ts";

describe("station disruption badge groups", () => {
  const describeImpact = (impact) => ({ key: impact.icon ?? impact.label, label: impact.label, tone: impact.tone });

  it("groups impacts by classification so duplicate types share one badge", () => {
    const groups = groupStationDisruptions([
      { id: "a", label: "Planned Advisory", tone: "planned" },
      { id: "b", label: "Reduced Speed Zone", tone: "reduced-speed-zone" },
      { id: "c", label: "Planned Advisory", tone: "planned" },
    ], describeImpact);

    assert.deepEqual(groups.map((group) => [group.label, group.items.map((item) => item.id)]), [
      ["Reduced Speed Zone", ["b"]],
      ["Planned Advisory", ["a", "c"]],
    ]);
  });

  it("merges classifications that share an icon into one badge", () => {
    const groups = groupStationDisruptions([
      { label: "Active Closure", tone: "active", icon: "alert" },
      { label: "Suspension", tone: "active", icon: "alert" },
      { label: "Suspension", tone: "active", icon: "alert" },
    ], describeImpact);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].label, "Active Closure, Suspension");
    assert.equal(groups[0].items.length, 3);
  });

  it("orders active service changes ahead of delays, slow zones, and planned work", () => {
    const groups = groupStationDisruptions([
      { label: "Planned Advisory", tone: "planned" },
      { label: "Reduced Speed Zone", tone: "reduced-speed-zone" },
      { label: "Delay", tone: "delay" },
      { label: "Suspension", tone: "active" },
    ], describeImpact);

    assert.deepEqual(groups.map((group) => group.label), ["Suspension", "Delay", "Reduced Speed Zone", "Planned Advisory"]);
  });

  it("returns no groups without impacts", () => {
    assert.deepEqual(groupStationDisruptions([], describeImpact), []);
  });
});

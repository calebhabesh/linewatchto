import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLinkedPlannedImpactHop, resolveSelectionAttentionAnchor } from "../src/app/selection-attention-key.ts";

const data = {
  activeAlerts: [
    { id: "child-alert", relatedPlannedClosureId: "parent" },
    { id: "projected" },
    { id: "unrelated" },
  ],
  delays: [{ id: "child-delay", relatedPlannedClosureId: "parent" }],
  plannedClosures: [
    { id: "parent", activeNow: true },
    { id: "projected", activeNow: true },
    { id: "upcoming", activeNow: false },
  ],
};

const planned = (id) => ({ kind: "planned-closure", id });
const suspension = (id) => ({ kind: "suspension", id });

describe("linked planned impact hops", () => {
  it("links a planned advisory with its current suspension or delay in either direction", () => {
    assert.equal(isLinkedPlannedImpactHop(planned("parent"), suspension("child-alert"), data), true);
    assert.equal(isLinkedPlannedImpactHop(suspension("child-alert"), planned("parent"), data), true);
    assert.equal(isLinkedPlannedImpactHop(planned("parent"), { kind: "delay", id: "child-delay" }, data), true);
    assert.equal(isLinkedPlannedImpactHop(planned("projected"), suspension("projected"), data), true);
  });

  it("does not link unrelated impacts, sibling advisories, or inactive same-ID closures", () => {
    assert.equal(isLinkedPlannedImpactHop(planned("parent"), suspension("unrelated"), data), false);
    assert.equal(isLinkedPlannedImpactHop(planned("parent"), planned("upcoming"), data), false);
    assert.equal(isLinkedPlannedImpactHop(planned("upcoming"), suspension("upcoming"), data), false);
  });
});

describe("selection attention anchor", () => {
  it("keeps the intro key across a linked hop and restarts it otherwise", () => {
    const first = resolveSelectionAttentionAnchor(null, planned("parent"), 1, data);
    assert.equal(first.key, "planned-closure:parent:1");

    const linked = resolveSelectionAttentionAnchor(first, suspension("child-alert"), 2, data);
    assert.equal(linked.key, first.key);

    const unrelated = resolveSelectionAttentionAnchor(linked, suspension("unrelated"), 3, data);
    assert.equal(unrelated.key, "suspension:unrelated:3");
  });

  it("keeps the intro key when Back restores an unrelated impact the rider already saw", () => {
    const overlap = resolveSelectionAttentionAnchor(null, planned("upcoming"), 4, data);
    assert.equal(resolveSelectionAttentionAnchor(overlap, suspension("unrelated"), 4, data, true).key, overlap.key);
    assert.equal(resolveSelectionAttentionAnchor(overlap, suspension("unrelated"), 5, data).key, "suspension:unrelated:5");
  });

  it("restarts after the selection clears and when the same impact is reselected", () => {
    const first = resolveSelectionAttentionAnchor(null, planned("parent"), 1, data);
    assert.equal(resolveSelectionAttentionAnchor(first, null, 1, data), null);
    assert.equal(resolveSelectionAttentionAnchor(first, planned("parent"), 2, data).key, "planned-closure:parent:2");
    assert.equal(resolveSelectionAttentionAnchor(first, planned("parent"), 1, data), first);
  });
});

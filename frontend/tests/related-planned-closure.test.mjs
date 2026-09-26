import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { relatedPlannedClosureId } from "../src/app/related-planned-closure.ts";

describe("active alert's related planned closure", () => {
  const closures = [
    { id: "parent", activeNow: true },
    { id: "upcoming", activeNow: false },
  ];

  it("links a standalone active child to its explicit parent", () => {
    assert.equal(relatedPlannedClosureId({ id: "child", relatedPlannedClosureId: "parent" }, closures), "parent");
  });

  it("links a projected active alert to the canonical closure with the same ID", () => {
    assert.equal(relatedPlannedClosureId({ id: "parent" }, closures), "parent");
  });

  it("does not infer links from an inactive closure or an unrelated alert", () => {
    assert.equal(relatedPlannedClosureId({ id: "upcoming" }, closures), undefined);
    assert.equal(relatedPlannedClosureId({ id: "unrelated" }, closures), undefined);
  });

  it("omits unavailable parents rather than navigating to a missing card", () => {
    assert.equal(relatedPlannedClosureId({ id: "parent", relatedPlannedClosureId: "missing" }, closures), undefined);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { plannedAdvisoryEffect } from "../src/app/alert-categories.ts";

describe("planned advisory effect", () => {
  it("distinguishes closures from limited service", () => {
    assert.equal(plannedAdvisoryEffect({ serviceEffect: "suspension" }), "closure");
    assert.equal(plannedAdvisoryEffect({ serviceEffect: "limited-service" }), "limited-service");
    assert.equal(plannedAdvisoryEffect({ serviceEffect: null }), null);
    assert.equal(plannedAdvisoryEffect({}), null);
  });
});

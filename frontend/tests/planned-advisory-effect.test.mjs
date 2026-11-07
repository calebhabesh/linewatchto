import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { plannedAdvisoryCause, plannedAdvisoryEffect } from "../src/app/alert-categories.ts";

describe("planned advisory effect", () => {
  it("distinguishes closures from limited service", () => {
    assert.equal(plannedAdvisoryEffect({ serviceEffect: "suspension" }), "closure");
    assert.equal(plannedAdvisoryEffect({ serviceEffect: "limited-service" }), "limited-service");
    assert.equal(plannedAdvisoryEffect({ serviceEffect: null }), null);
    assert.equal(plannedAdvisoryEffect({}), null);
  });

  it("drops TTC's closure category prefix from the cause", () => {
    assert.equal(plannedAdvisoryCause("CLOSURE - Structural Maintenance"), "Structural Maintenance");
    assert.equal(plannedAdvisoryCause("Closure - Planned Track Work"), "Planned Track Work");
    assert.equal(plannedAdvisoryCause("Planned Track Work"), "Planned Track Work");
    assert.equal(plannedAdvisoryCause("Closure"), "Closure");
    assert.equal(plannedAdvisoryCause(null), null);
  });
});

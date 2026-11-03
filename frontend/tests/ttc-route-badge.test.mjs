import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isTtcNightRoute, ttcRouteBadgeColors, ttcRouteBadgeStyle, ttcRouteFamily } from "../src/app/ttc-route-badge.ts";

describe("TTC route badges", () => {
  it("sort routes into the families the published GTFS colours", () => {
    const cases = {
      regular: ["7", "29", "52F", "504", "506", "511"],
      night: ["300", "306", "320", "385", "306A"],
      community: ["400", "402", "406"],
      express: ["900", "927", "939", "985B"],
      "line-5": ["5"],
      "line-6": ["6"],
    };
    for (const [family, routes] of Object.entries(cases)) {
      for (const route of routes) assert.equal(ttcRouteFamily(route), family, route);
    }
    assert.equal(isTtcNightRoute("306"), true);
    assert.equal(isTtcNightRoute("3000"), false);
  });

  it("use the GTFS route colours: red, night blue on white, Community grey, Express green", () => {
    assert.deepEqual(ttcRouteBadgeColors("506"), { fill: "#ED1C24", text: "#FFFFFF", edge: null });
    assert.deepEqual(ttcRouteBadgeColors("306"), { fill: "#FFFFFF", text: "#0054A6", edge: "#0054A6" });
    assert.deepEqual(ttcRouteBadgeColors("403"), { fill: "#6D6E71", text: "#FFFFFF", edge: null });
    assert.deepEqual(ttcRouteBadgeColors("939"), { fill: "#00A651", text: "#FFFFFF", edge: null });
    assert.equal(ttcRouteBadgeColors("6").fill, "#969594");
    assert.deepEqual(ttcRouteBadgeStyle("306"), {
      backgroundColor: "#FFFFFF", color: "#0054A6", border: "2.5px solid #0054A6",
    });
    assert.deepEqual(ttcRouteBadgeStyle("939"), { backgroundColor: "#00A651", color: "#FFFFFF" });
  });
});

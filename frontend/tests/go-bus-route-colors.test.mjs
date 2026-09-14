import assert from "node:assert/strict";
import { test } from "node:test";
import { goBusRouteColor, goBusRouteTextColor } from "../src/app/go-bus-route-colors.ts";
test("GO bus badges retain corridor and independent bus-group identities", () => {
  assert.equal(goBusRouteColor("31"), "#00853e");
  assert.equal(goBusRouteColor("52"), "#6f298d");
  assert.equal(goBusRouteColor("94"), "#a11984");
  assert.equal(goBusRouteColor("65"), "#003767");
  assert.equal(goBusRouteColor("31A"), goBusRouteColor("31"));
  assert.equal(goBusRouteColor("999"), "#52616b");
  assert.equal(goBusRouteColor("unknown"), "#52616b");
  assert.equal(goBusRouteTextColor("21"), "#101820");
});

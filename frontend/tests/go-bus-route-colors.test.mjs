import assert from "node:assert/strict";
import { test } from "node:test";
import {
  goBusRouteColor,
  goBusRouteTextColor,
  goNoticeRouteColor,
  goNoticeRouteTextColor,
  goNoticeRouteBadgeStyle,
  goNoticeRouteLabel,
} from "../src/app/go-bus-route-colors.ts";

test("GO bus badges retain corridor and independent bus-group identities", () => {
  assert.equal(goBusRouteColor("31"), "#00853e");
  assert.equal(goBusRouteColor("32"), "#00853e");
  assert.equal(goBusRouteColor("36"), "#00853e");
  assert.equal(goBusRouteColor("52"), "#6f298d");
  assert.equal(goBusRouteColor("94"), "#a11984");
  assert.equal(goBusRouteColor("65"), "#003767");
  assert.equal(goBusRouteColor("31A"), goBusRouteColor("31"));
  assert.equal(goBusRouteColor("32B"), goBusRouteColor("32"));
  assert.equal(goBusRouteColor("999"), "#52616b");
  assert.equal(goBusRouteColor("unknown"), "#52616b");
  assert.equal(goBusRouteTextColor("21"), "#101820");
});

test("GO notice route badges support train lines, bus routes, and fallbacks", () => {
  // Bus routes match goBusRouteColor / goBusRouteTextColor
  assert.equal(goNoticeRouteColor("31"), "#00853e");
  assert.equal(goNoticeRouteTextColor("31"), "#ffffff");
  assert.deepEqual(goNoticeRouteBadgeStyle("31"), { backgroundColor: "#00853e", color: "#ffffff" });
  assert.equal(goNoticeRouteLabel("31"), "GO Bus 31");

  assert.equal(goNoticeRouteColor("21"), "#f78025");
  assert.equal(goNoticeRouteTextColor("21"), "#101820");
  assert.deepEqual(goNoticeRouteBadgeStyle("21"), { backgroundColor: "#f78025", color: "#101820" });

  assert.equal(goNoticeRouteColor("40"), "#a11984");
  assert.equal(goNoticeRouteTextColor("40"), "#ffffff");

  // Train lines use line identity colors with white text
  assert.equal(goNoticeRouteColor("BR"), "#155ba0");
  assert.equal(goNoticeRouteTextColor("BR"), "#ffffff");
  assert.deepEqual(goNoticeRouteBadgeStyle("BR"), { backgroundColor: "#155ba0", color: "#ffffff" });
  assert.equal(goNoticeRouteLabel("BR"), "Barrie Line");

  assert.equal(goNoticeRouteColor("LW"), "#8b0a31");
  assert.equal(goNoticeRouteTextColor("LW"), "#ffffff");
  assert.equal(goNoticeRouteLabel("LW"), "Lakeshore West Line");

  assert.equal(goNoticeRouteColor("LE"), "#ee2722");
  assert.equal(goNoticeRouteTextColor("LE"), "#ffffff");
  assert.equal(goNoticeRouteLabel("LE"), "Lakeshore East Line");

  assert.equal(goNoticeRouteColor("KI"), "#138336");
  assert.equal(goNoticeRouteColor("GT"), "#138336");
  assert.equal(goNoticeRouteTextColor("KI"), "#ffffff");
  assert.equal(goNoticeRouteLabel("KI"), "Kitchener Line");

  assert.equal(goNoticeRouteColor("MI"), "#f47216");
  assert.equal(goNoticeRouteColor("RH"), "#27adea");
  assert.equal(goNoticeRouteColor("ST"), "#774111");
  assert.equal(goNoticeRouteColor("UP"), "#4084cd");
  assert.equal(goNoticeRouteLabel("UP"), "UP Express");

  // Fallback "GO" and unknown
  assert.equal(goNoticeRouteColor("GO"), "#52616b");
  assert.equal(goNoticeRouteTextColor("GO"), "#ffffff");
  assert.equal(goNoticeRouteLabel("GO"), "GO Transit");

  assert.equal(goNoticeRouteColor("999"), "#52616b");
  assert.equal(goNoticeRouteTextColor("999"), "#ffffff");
});


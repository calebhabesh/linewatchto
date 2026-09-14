import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesNoticeFilters } from "../src/app/notice-filters.ts";
import { compareSurfaceNotices } from "../src/app/surface-notice-groups.ts";
const notice = { id: "a", routeIds: ["GT", "LW"], routeType: "GO Train", category: "notice",
 title: "Platform change", description: "Use east entrance", stopIds: ["123"], stops: [{ stopId: "123", stopName: "Union" }],
 source: "Metrolinx", startAt: "2026-09-14T12:00:00Z", updatedAt: "2026-09-14T10:00:00Z" };
const now = Date.parse("2026-09-14T13:00:00Z");
test("route filtering uses exact membership and canonical Kitchener identity", () => {
 assert.equal(matchesNoticeFilters(notice, { route: "KI" }, now), true);
 assert.equal(matchesNoticeFilters(notice, { route: "LW" }, now), true);
 assert.equal(matchesNoticeFilters(notice, { route: "W" }, now), false);
 assert.equal(matchesNoticeFilters(notice, { route: "unspecified" }, now), false);
});
test("filters compose and search finds source station and stop metadata", () => {
 assert.equal(matchesNoticeFilters(notice, { route: "KI", query: "union 123 east", timing: "ongoing" }, now), true);
 assert.equal(matchesNoticeFilters(notice, { service: "GO Bus" }, now), false);
 assert.equal(matchesNoticeFilters(notice, { timing: "upcoming" }, now), false);
 assert.equal(matchesNoticeFilters({ ...notice, startAt: null }, { timing: "unknown" }, now), true);
 assert.equal(matchesNoticeFilters({ ...notice, endAt: "2026-09-14T12:30:00Z" }, { timing: "ongoing" }, now), false);
});
test("route sorting is numeric and missing start dates sort last", () => {
 assert.ok(compareSurfaceNotices({ ...notice, routeIds: ["9"] }, { ...notice, routeIds: ["100"] }, "route") < 0);
 assert.ok(compareSurfaceNotices(notice, { ...notice, startAt: null }, "start") < 0);
});

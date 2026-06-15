import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveSurfaceNoticeCause,
  groupSurfaceNoticesByRoute,
} from "../src/app/surface-notice-groups.ts";

const baseNotice = {
  id: "notice-1",
  category: "bypass",
  routeType: "Streetcar",
  routeIds: ["509"],
  title: "Streetcars are not stopping at Exhibition Loop due to FIFA World Cup route adjustments.",
  description: "509 Harbourfront: Streetcars are not stopping at Exhibition Loop due to FIFA World Cup route adjustments.",
  location: "Exhibition Loop at Manitoba Dr",
  stopIds: ["13366"],
  startAt: "2026-06-12T08:52:00Z",
  endAt: null,
  updatedAt: "2026-06-12T20:56:58Z",
  url: "",
  source: "TTC Live Alerts",
};

describe("surface notice route grouping", () => {
  it("groups multiple bypass notices under one route header with stop rows", () => {
    const groups = groupSurfaceNoticesByRoute([
      baseNotice,
      {
        ...baseNotice,
        id: "notice-2",
        location: "Manitoba Dr at Strachan Ave West Side",
        stopIds: ["1063"],
      },
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].routeIdsLabel, "509");
    assert.equal(groups[0].routeName, "Harbourfront");
    assert.equal(groups[0].notices.length, 2);
    assert.deepEqual(
      groups[0].notices.map((notice) => [notice.primaryStopId, notice.location]),
      [
        ["13366", "Exhibition Loop at Manitoba Dr"],
        ["1063", "Manitoba Dr at Strachan Ave West Side"],
      ],
    );
  });

  it("keeps multi-route service changes under a combined route header", () => {
    const groups = groupSurfaceNoticesByRoute([
      {
        ...baseNotice,
        id: "notice-3",
        category: "service-change",
        routeType: "Bus",
        routeIds: ["71", "79"],
        title: "71 79 Temporary route change due to road work",
        location: "",
        stopIds: [],
      },
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].routeIdsLabel, "71 / 79");
    assert.equal(groups[0].category, "service-change");
  });

  it("extracts the high-signal cause instead of repeating the full notice text", () => {
    assert.equal(
      deriveSurfaceNoticeCause(baseNotice),
      "FIFA World Cup route adjustments.",
    );
  });
});

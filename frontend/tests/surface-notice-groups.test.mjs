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

  it("keeps route branch labels in route chips and derives concise route-specific info", () => {
    const groups = groupSurfaceNoticesByRoute([
      {
        ...baseNotice,
        id: "notice-branch",
        category: "service-change",
        routeType: "Bus",
        routeIds: ["51A"],
        title: "To Leslie Station Via Laird Station - Temporary route change due to bridge work",
        description: "",
        location: "",
        stopIds: [],
      },
    ]);

    assert.deepEqual(groups[0].routeIds, ["51A"]);
    assert.equal(groups[0].routeIdsLabel, "51A");
    assert.equal(groups[0].routeName, "To Leslie Station Via Laird Station");
  });

  it("does not use cause-heavy GTFS route text as the route header", () => {
    const groups = groupSurfaceNoticesByRoute([
      {
        ...baseNotice,
        id: "notice-long-branch",
        category: "service-change",
        routeType: "Streetcar",
        routeIds: ["501", "301", "507"],
        title: "301507 508 Long Branch Loop Streetcar Track Renewal Work",
        description: "",
        location: "",
        stopIds: [],
      },
    ]);

    assert.equal(groups[0].routeName, "Long Branch Loop");
  });

  it("extracts the high-signal cause instead of repeating the full notice text", () => {
    assert.equal(
      deriveSurfaceNoticeCause(baseNotice),
      "FIFA World Cup route adjustments.",
    );
  });

  it("keeps a single stop id beside the rider-facing stop name", () => {
    const groups = groupSurfaceNoticesByRoute([
      {
        ...baseNotice,
        id: "notice-4",
        location: "Manitoba Dr at Strachan Ave West Side",
        stopIds: ["1063"],
        stops: [
          {
            stopId: "1063",
            stopName: "Manitoba Dr at Strachan Ave West Side",
          },
        ],
      },
    ]);

    const notice = groups[0].notices[0];
    assert.equal(notice.displayLocation, "Manitoba Dr at Strachan Ave West Side");
    assert.deepEqual(notice.displayStops, [
      {
        stopId: "1063",
        stopName: "Manitoba Dr at Strachan Ave West Side",
      },
    ]);
  });

  it("summarizes long stop lists as start and end stops", () => {
    const groups = groupSurfaceNoticesByRoute([
      {
        ...baseNotice,
        id: "notice-5",
        category: "no-service",
        routeType: "Bus",
        routeIds: ["925"],
        title: "925 Don Mills: No service due to police activity.",
        location: "Pape Ave at O'Connor Dr to Don Mills Rd at Gateway Blvd (North)",
        stopIds: ["5989", "1935"],
        stops: [
          {
            stopId: "5989",
            stopName: "Pape Ave at O'Connor Dr",
          },
          {
            stopId: "1935",
            stopName: "Don Mills Rd at Gateway Blvd (North)",
          },
        ],
      },
    ]);

    const notice = groups[0].notices[0];
    assert.equal(
      notice.displayLocation,
      "Pape Ave at O'Connor Dr to Don Mills Rd at Gateway Blvd (North)",
    );
    assert.deepEqual(
      notice.displayStops.map((stop) => [stop.stopId, stop.stopName]),
      [
        ["5989", "Pape Ave at O'Connor Dr"],
        ["1935", "Don Mills Rd at Gateway Blvd (North)"],
      ],
    );
  });
});

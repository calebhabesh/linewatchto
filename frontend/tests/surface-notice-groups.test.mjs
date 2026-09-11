import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveSurfaceNoticeCause,
  compareSurfaceNotices,
  surfaceNoticeEmphasis,
  groupSurfaceNoticesByRoute,
  hasExactRouteMatch,
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

  it("keeps multi-route service changes under a combined route header with comma-separated route names", () => {
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
    assert.equal(groups[0].routeName, "Runnymede, Scarlett Rd");
  });

  it("lists multiple routes in a comma-separated list when extracted from description or catalog", () => {
    const groups = groupSurfaceNoticesByRoute([
      {
        ...baseNotice,
        id: "notice-multi-20-113",
        category: "service-change",
        routeType: "Bus",
        routeIds: ["20", "113"],
        title: "20 - 113 - Road work",
        description: "road work 20 Cliffside and 113 Danforth eastbound buses will divert south on Main Street, east on Gerrard Street East, north on Victoria Park Avenue, and east on Danforth Avenue, to regular route.",
        location: "",
        stopIds: [],
      },
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].routeIdsLabel, "20 / 113");
    assert.equal(groups[0].routeName, "Cliffside, Danforth");
  });

  it("deduplicates identical route names across multiple route IDs and strips redundant streetcar/bus suffixes", () => {
    const groupsSpadina = groupSurfaceNoticesByRoute([
      {
        ...baseNotice,
        id: "notice-multi-510-310",
        category: "service-change",
        routeType: "Streetcar",
        routeIds: ["510", "310"],
        title: "510 Spadina streetcars Canadian National Exhibition Daily, August 21 to September 7, 2026, 9:30 a.",
        description: "",
        location: "",
        stopIds: [],
      },
    ]);

    assert.equal(groupsSpadina.length, 1);
    assert.equal(groupsSpadina[0].routeIdsLabel, "510 / 310");
    assert.equal(groupsSpadina[0].routeName, "Spadina");

    const groupsBathurst = groupSurfaceNoticesByRoute([
      {
        ...baseNotice,
        id: "notice-multi-511-307",
        category: "service-change",
        routeType: "Surface",
        routeIds: ["511", "307"],
        title: "511 Bathurst streetcar service change",
        description: "end of FIFA World Cup 2026™ Temporary service on 311 Bathurst will be removed with the end of FIFA World Cup 2026™.",
        location: "",
        stopIds: [],
      },
    ]);

    assert.equal(groupsBathurst.length, 1);
    assert.equal(groupsBathurst[0].routeIdsLabel, "511 / 307");
    assert.equal(groupsBathurst[0].routeName, "Bathurst");
  });

  it("cleans trailing restoration and verb phrases so route is Spadina instead of Spadina will be restored", () => {
    const groups = groupSurfaceNoticesByRoute([
      {
        ...baseNotice,
        id: "notice-spadina-restored",
        category: "service-change",
        routeType: "Streetcar",
        routeIds: ["510A"],
        title: "510 Spadina – Service change, due to end of FIFA World Cup 2026™",
        description: "Service on the 510 Spadina streetcar will be adjusted in all time periods on weekdays and weekends with the end of FIFA World Cup 2026™. Regular service to Union Station on 510A Spadina will be restored.",
        location: "",
        stopIds: [],
      },
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].routeIdsLabel, "510A");
    assert.equal(groups[0].routeName, "Spadina");
  });

  it("never returns a standalone dash or hyphen as the route name", () => {
    const groups = groupSurfaceNoticesByRoute([
      {
        ...baseNotice,
        id: "notice-dash-only",
        category: "service-change",
        routeType: "Bus",
        routeIds: ["9999"],
        title: "- - -",
        description: "-",
        location: "",
        stopIds: [],
      },
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].routeName, null);
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

  it("uses title case for route-wide notice fallbacks", () => {
    const groups = groupSurfaceNoticesByRoute([
      {
        ...baseNotice,
        id: "notice-route-wide",
        category: "service-change",
        location: "",
        stopIds: [],
      },
    ]);

    assert.equal(groups[0].notices[0].displayLocation, "Route-wide Notice");
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


it("uses the backend schedule classification without inferring affected corridors from prose", () => {
  const notice = {
    ...baseNotice,
    category: "service-change",
    routeType: "GO / UP",
    routeIds: ["LE"],
    title: "We are running on a Saturday schedule",
    description: "No GO train service on Richmond Hill or Milton lines.",
    location: "",
    stopIds: [],
    scheduleAnnouncement: true,
  };
  const [group] = groupSurfaceNoticesByRoute([notice]);
  assert.deepEqual(group.routeIds, ["LE"]);
  assert.equal(group.notices[0].displayLocation, "Schedule announcement");
  assert.equal(group.notices[0].scheduleAnnouncement, true);
  const [ordinary] = groupSurfaceNoticesByRoute([{ ...notice, scheduleAnnouncement: false }]);
  assert.equal(ordinary.notices[0].displayLocation, "Route-wide Notice");
});


it("prioritizes explicit no-service schedule notices, then newest updates", () => {
  const announcement = { ...baseNotice, id: "schedule", category: "service-change", scheduleAnnouncement: true,
    title: "Holiday schedule", description: "There will be no GO train service on Milton.",
    updatedAt: "2026-06-10T10:00:00Z" };
  const recent = { ...baseNotice, id: "recent", updatedAt: "2026-06-12T10:00:00Z" };
  assert.equal(surfaceNoticeEmphasis(announcement), "no-service");
  assert.ok(compareSurfaceNotices(announcement, recent) < 0);
  assert.ok(compareSurfaceNotices(announcement, recent, "recent") > 0);
  assert.equal(surfaceNoticeEmphasis({ ...announcement, description: "No service changes are planned." }), "schedule");
  assert.ok(compareSurfaceNotices(recent, { ...recent, id: "old", updatedAt: "invalid" }) < 0);
});

describe("surface notice route search relevance", () => {
  it("hasExactRouteMatch matches normalized route IDs accurately", () => {
    const single = { ...baseNotice, routeIds: ["8"] };
    const multi = { ...baseNotice, routeIds: ["8", "88", "501"] };
    const unrelated = { ...baseNotice, routeIds: ["88"] };
    const proseOnly = { ...baseNotice, routeIds: ["501"], title: "Route 8 detour at 8pm" };

    assert.equal(hasExactRouteMatch(single, "8"), true);
    assert.equal(hasExactRouteMatch(single, " 8 "), true);
    assert.equal(hasExactRouteMatch(single, "route 8"), true);
    assert.equal(hasExactRouteMatch(single, "Route 8"), true);
    assert.equal(hasExactRouteMatch(single, "#8"), true);
    assert.equal(hasExactRouteMatch(single, "Line 8"), true);
    assert.equal(hasExactRouteMatch(multi, "8"), true);
    assert.equal(hasExactRouteMatch(multi, "88"), true);
    assert.equal(hasExactRouteMatch(unrelated, "8"), false);
    assert.equal(hasExactRouteMatch(proseOnly, "8"), false);
    assert.equal(hasExactRouteMatch(single, ""), false);
    assert.equal(hasExactRouteMatch(single, "   "), false);
  });

  it("ranks exact route matches first before loose matches regardless of severity or recency", () => {
    const route8Notice = {
      ...baseNotice,
      id: "route-8-notice",
      routeIds: ["8"],
      category: "bypass",
      updatedAt: "2026-06-01T10:00:00Z",
    };
    const route88Notice = {
      ...baseNotice,
      id: "route-88-notice",
      routeIds: ["88"],
      category: "no-service",
      updatedAt: "2026-06-15T10:00:00Z",
    };

    // When query is "8", route 8 notice should come FIRST despite lower severity and older date
    assert.ok(compareSurfaceNotices(route8Notice, route88Notice, "importance", "8") < 0);
    assert.ok(compareSurfaceNotices(route88Notice, route8Notice, "importance", "8") > 0);

    // Even with "recent" sort, route 8 notice should come FIRST
    assert.ok(compareSurfaceNotices(route8Notice, route88Notice, "recent", "8") < 0);
    assert.ok(compareSurfaceNotices(route88Notice, route8Notice, "recent", "8") > 0);

    // When query is empty, regular importance sort applies (no-service route 88 ranks before bypass route 8)
    assert.ok(compareSurfaceNotices(route8Notice, route88Notice, "importance", "") > 0);
    assert.ok(compareSurfaceNotices(route88Notice, route8Notice, "importance", "") < 0);
  });

  it("orders within the same relevance tier by selected sort order", () => {
    const route8Older = {
      ...baseNotice,
      id: "route-8-old",
      routeIds: ["8"],
      category: "bypass",
      updatedAt: "2026-06-01T10:00:00Z",
    };
    const route8Newer = {
      ...baseNotice,
      id: "route-8-new",
      routeIds: ["8"],
      category: "no-service",
      updatedAt: "2026-06-15T10:00:00Z",
    };

    // Both match route 8: importance sort puts no-service before bypass
    assert.ok(compareSurfaceNotices(route8Older, route8Newer, "importance", "8") > 0);
    assert.ok(compareSurfaceNotices(route8Newer, route8Older, "importance", "8") < 0);

    // Both match route 8: recent sort puts newer update first
    assert.ok(compareSurfaceNotices(route8Older, route8Newer, "recent", "8") > 0);
    assert.ok(compareSurfaceNotices(route8Newer, route8Older, "recent", "8") < 0);
  });
});

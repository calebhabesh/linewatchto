import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  matchGlobalDestinations,
  searchSavedCommutes,
  searchSurfaceNotices,
  searchTransitLines,
} from "../src/app/unified-search.ts";

describe("unified global search", () => {
  it("finds transit lines by number, name, and regional abbreviation", () => {
    assert.equal(searchTransitLines(["line-1", "line-2"], "line 1")[0].line.id, "line-1");
    assert.equal(searchTransitLines(["line-1", "line-2"], "bloor danforth")[0].line.id, "line-2");
    assert.equal(searchTransitLines(["regional-up"], "up express")[0].line.id, "regional-up");
  });

  it("matches app destinations without treating the menu as one flat result list", () => {
    assert.deepEqual(
      matchGlobalDestinations("accessibility").map((result) => result.view),
      ["accessibility-outages"],
    );
    assert.deepEqual(
      matchGlobalDestinations("saved").map((result) => result.view),
      ["commutes", "my-stations"],
    );
    assert.deepEqual(
      matchGlobalDestinations("streetcar").map((result) => result.view),
      ["surface-notices"],
    );
  });

  it("searches saved commute labels and endpoints", () => {
    const commutes = [
      {
        id: "work",
        label: "Morning office",
        originStationName: "Kipling",
        destinationStationName: "Union",
        routeLabel: "Line 2, Line 1",
        impact: { statusLabel: "Clear" },
      },
      {
        id: "school",
        label: "Campus",
        originStationName: "Finch",
        destinationStationName: "Queen's Park",
        routeLabel: "Line 1",
        impact: { statusLabel: "Affected" },
      },
    ];

    assert.deepEqual(searchSavedCommutes(commutes, "union").map((result) => result.commute.id), ["work"]);
    assert.deepEqual(searchSavedCommutes(commutes, "campus").map((result) => result.commute.id), ["school"]);
  });

  it("searches surface notices by route, stop, category, and notice copy", () => {
    const notices = [
      {
        id: "notice-504",
        category: "detour",
        routeType: "streetcar",
        routeIds: ["504"],
        title: "504 King detour",
        description: "Streetcars divert around construction.",
        location: "King Street West",
        stopIds: ["1234"],
        stops: [{ stopId: "1234", stopName: "King St West at Spadina Ave" }],
        updatedAt: "2026-07-26T12:00:00Z",
        source: "TTC Live Alerts",
      },
    ];

    assert.equal(searchSurfaceNotices(notices, "504")[0].notice.id, "notice-504");
    assert.equal(searchSurfaceNotices(notices, "spadina")[0].notice.id, "notice-504");
    assert.equal(searchSurfaceNotices(notices, "detour construction")[0].notice.id, "notice-504");
  });
});

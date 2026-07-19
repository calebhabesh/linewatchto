import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  matchImpactCategories,
  searchDashboardImpacts,
} from "../src/app/alert-search.ts";
import {
  filterAndSortImpacts,
} from "../src/app/impact-list-controls.ts";

const stations = [
  { id: "bloor-yonge", name: "Bloor-Yonge", lineIds: ["line-1", "line-2"] },
  { id: "sherbourne", name: "Sherbourne", lineIds: ["line-2"] },
];

const data = {
  activeAlerts: [
    {
      id: "suspension-1",
      lineId: "line-2",
      lineNumber: "2",
      title: "No service",
      severity: "suspension",
      location: "Bloor-Yonge to Sherbourne",
      description: "Trains are not operating due to a security incident.",
      affectedSegmentIds: ["line-2-bloor-sherbourne"],
      shuttle: true,
      source: "TTC Live Alerts",
      updatedAt: "2026-07-18T14:30:00Z",
    },
  ],
  delays: [
    {
      id: "delay-1",
      lineId: "line-1",
      lineNumber: "1",
      title: "Longer than normal travel times",
      location: "Bloor-Yonge",
      description: "Northbound trains are delayed.",
      displayDirection: "Northbound",
      affectedSegmentIds: [],
      source: "TTC Live Alerts",
      updatedAt: "2026-07-18T14:00:00Z",
    },
    {
      id: "delay-2",
      lineId: "line-2",
      lineNumber: "2",
      title: "Minor delay",
      location: "Sherbourne",
      description: "Eastbound trains are delayed.",
      affectedSegmentIds: [],
      source: "TTC Live Alerts",
      updatedAt: "2026-07-18T15:00:00Z",
    },
  ],
  reducedSpeedZones: [
    {
      id: "rsz-1",
      lineId: "line-2",
      lineNumber: "2",
      title: "Reduced Speed Zone",
      location: "Bloor-Yonge to Sherbourne",
      displayDirection: "Both ways",
      description: "Trains are operating at reduced speed.",
      affectedSegmentIds: ["line-2-bloor-sherbourne"],
      sourceAlertIds: [],
      directionalDetails: [],
      source: "TTC Live Alerts",
    },
  ],
  plannedClosures: [
    {
      id: "closure-1",
      lineId: "line-2",
      lineNumber: "2",
      title: "Weekend closure",
      window: "Saturday and Sunday",
      location: "Bloor-Yonge to Sherbourne",
      description: "Line 2 will be closed for planned work.",
      previewSegmentIds: ["line-2-bloor-sherbourne"],
      shuttle: true,
      source: "TTC Live Alerts",
      nextWindowStart: "2026-07-20T06:00:00Z",
    },
  ],
  networkSegments: [
    {
      id: "line-2-bloor-sherbourne",
      lineId: "line-2",
      label: "Bloor-Yonge to Sherbourne",
      stationAId: "bloor-yonge",
      stationBId: "sherbourne",
      pathD: "M 0 0 L 1 1",
      overlay: "clear",
    },
  ],
  stationNodeImpacts: [],
};

describe("dashboard impact search", () => {
  it("groups station-related impacts without inventing geography", () => {
    const groups = searchDashboardImpacts(data, stations, "bloor yonge");

    assert.deepEqual(groups.map((group) => group.kind), [
      "suspension",
      "delay",
      "reduced-speed-zone",
      "planned-closure",
    ]);
    assert.equal(groups[0].results[0].selection.id, "suspension-1");
    assert.ok(groups.every((group) => group.results.length === 1));
  });

  it("recognizes rider-facing alert type aliases", () => {
    assert.deepEqual(
      matchImpactCategories("rsz").map((category) => category.kind),
      ["reduced-speed-zone"],
    );
    assert.deepEqual(
      matchImpactCategories("shutdown").map((category) => category.kind),
      ["suspension", "planned-closure"],
    );

    const groups = searchDashboardImpacts(data, stations, "slow zone");
    assert.deepEqual(groups.map((group) => group.kind), ["reduced-speed-zone"]);
  });

  it("matches line names, directions, causes, and descriptions", () => {
    assert.equal(searchDashboardImpacts(data, stations, "line 1 northbound")[0].results[0].selection.id, "delay-1");
    assert.equal(searchDashboardImpacts(data, stations, "bloor danforth security")[0].results[0].selection.id, "suspension-1");
    assert.equal(searchDashboardImpacts(data, stations, "security")[0].results[0].selection.id, "suspension-1");
  });
});

describe("impact list filtering and sorting", () => {
  it("filters a category by line", () => {
    const result = filterAndSortImpacts(data.delays, { lineId: "line-2", sort: "updated" });
    assert.deepEqual(result.map((item) => item.id), ["delay-2"]);
  });

  it("sorts updated records newest first", () => {
    const result = filterAndSortImpacts(data.delays, { lineId: "all", sort: "updated" });
    assert.deepEqual(result.map((item) => item.id), ["delay-2", "delay-1"]);
  });

  it("filters within a category by rider-facing text", () => {
    const result = filterAndSortImpacts(data.delays, { lineId: "all", sort: "updated", query: "northbound bloor" });
    assert.deepEqual(result.map((item) => item.id), ["delay-1"]);
  });

  it("sorts closures by active state and next occurrence", () => {
    const closures = [
      { ...data.plannedClosures[0], id: "later", nextWindowStart: "2026-07-22T06:00:00Z" },
      { ...data.plannedClosures[0], id: "active", activeNow: true },
      { ...data.plannedClosures[0], id: "sooner", nextWindowStart: "2026-07-19T06:00:00Z" },
    ];
    const result = filterAndSortImpacts(closures, { lineId: "all", sort: "soonest" });
    assert.deepEqual(result.map((item) => item.id), ["active", "sooner", "later"]);
  });
});

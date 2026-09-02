import { describe, expect, it } from "@jest/globals";

import type { Dashboard } from "@/api/dashboard-schema";
import {
  filterImpacts,
  findImpactInDashboard,
  getAvailableFilters,
} from "@/features/alerts/impact-types";

const mockDashboard: Dashboard = {
  networkId: "ttc",
  availability: "available",
  sourceSystems: ["ttc-live-alerts"],
  message: "TTC live data active",
  status: {
    generatedAt: {
      time: "11:00 PM",
      date: "Sep 1, 2026",
      live: true,
      lastPoll: "1m ago",
    },
    lines: [
      {
        id: "line-1",
        number: "1",
        name: "Line 1 (Yonge-University)",
        route: "Finch to Vaughan",
        color: "#f8c300",
        status: "delay",
        statusLabel: "Delays",
        summary: "Track work delay",
        updatedAgo: "2m ago",
      },
      {
        id: "line-2",
        number: "2",
        name: "Line 2 (Bloor-Danforth)",
        route: "Kipling to Kennedy",
        color: "#00a54f",
        status: "normal",
        statusLabel: "Normal",
        summary: "Normal service",
        updatedAgo: "2m ago",
      },
    ],
  },
  map: {
    stations: [],
    segments: [],
    stationNodeImpacts: [],
  },
  activeAlerts: [
    {
      id: "susp-1",
      lineId: "line-1",
      lineNumber: "1",
      title: "No service between Bloor and Eglinton",
      location: "Bloor-Yonge to Eglinton",
      displayDirection: "Both ways",
      description: "Signal problem at St Clair",
      startedAt: "10:30 PM",
      updatedAt: "10:45 PM",
      source: "TTC Live Alerts",
      cause: "Signal issue",
      severity: "suspension",
      affectedSegmentIds: ["seg-1"],
      shuttle: true,
      resolution: null,
      relatedPlannedClosureId: null,
    },
  ],
  delays: [
    {
      id: "delay-1",
      lineId: "line-1",
      lineNumber: "1",
      title: "Delays up to 10 mins northbound",
      location: "Bloor-Yonge",
      displayDirection: "Northbound",
      description: "Mechanical issue",
      startedAt: "10:50 PM",
      updatedAt: "10:55 PM",
      source: "TTC Live Alerts",
      cause: "Mechanical",
      affectedSegmentIds: [],
    },
  ],
  reducedSpeedZones: [
    {
      id: "rsz-1",
      lineId: "line-1",
      lineNumber: "1",
      title: "Reduced Speed Zone near Davisville",
      location: "Davisville",
      displayDirection: "Southbound",
      description: "Track maintenance speed restriction",
      startedAt: "Aug 20",
      updatedAt: "Sep 1",
      source: "TTC Track Geometry",
      cause: "Track Maintenance",
      affectedSegmentIds: ["seg-2"],
      sourceAlertIds: ["alert-rsz-1"],
      directionalDetails: [],
      resolution: null,
      rszLength: "350m",
      stationDistance: "200m from Davisville",
      trackPercent: "1.2%",
      reducedSpeed: "15 km/h",
      averageSpeed: "45 km/h",
    },
  ],
  plannedClosures: [
    {
      id: "closure-1",
      lineId: "line-2",
      lineNumber: "2",
      title: "Weekend closure St George to Broadview",
      location: "St George to Broadview",
      displayDirection: "Both ways",
      description: "Track renewal",
      startedAt: null,
      updatedAt: null,
      source: "TTC Planned Closures",
      cause: null,
      window: "Saturday & Sunday",
      previewSegmentIds: ["seg-3"],
      shuttle: true,
      resolution: null,
      activeNow: false,
      timingStatus: "upcoming",
      nightly: false,
      activeWindowStart: null,
      activeWindowEnd: null,
      activeWindowLabel: null,
      nextWindowStart: null,
      nextWindowEnd: null,
      nextWindowLabel: null,
      windowHours: "All day",
      windowDates: "Sep 5-6",
      travelDirection: "bidirectional",
    },
  ],
  performance: null,
};

describe("Impact Filtering & Lookup", () => {
  it("computes TTC filter options including Reduced Speed Zones with accurate counts", () => {
    const filters = getAvailableFilters(mockDashboard, "ttc");
    expect(filters.map((f) => f.key)).toEqual([
      "all",
      "suspension",
      "delay",
      "reduced-speed-zone",
      "planned-closure",
    ]);

    const countMap = Object.fromEntries(filters.map((f) => [f.key, f.count]));
    expect(countMap.all).toBe(4);
    expect(countMap.suspension).toBe(1);
    expect(countMap.delay).toBe(1);
    expect(countMap["reduced-speed-zone"]).toBe(1);
    expect(countMap["planned-closure"]).toBe(1);
  });

  it("excludes Reduced Speed Zones filter in regional mode", () => {
    const filters = getAvailableFilters(mockDashboard, "regional");
    expect(filters.map((f) => f.key)).toEqual(["all", "suspension", "delay", "planned-closure"]);
    const countMap = Object.fromEntries(filters.map((f) => [f.key, f.count]));
    expect(countMap.all).toBe(3); // 1 susp + 1 delay + 1 closure (no rsz)
  });

  it("filters impacts by category correctly", () => {
    const all = filterImpacts(mockDashboard, "all", "ttc");
    expect(all).toHaveLength(4);

    const suspensions = filterImpacts(mockDashboard, "suspension", "ttc");
    expect(suspensions).toHaveLength(1);
    expect(suspensions[0]?.data.id).toBe("susp-1");

    const delays = filterImpacts(mockDashboard, "delay", "ttc");
    expect(delays).toHaveLength(1);
    expect(delays[0]?.data.id).toBe("delay-1");

    const rszs = filterImpacts(mockDashboard, "reduced-speed-zone", "ttc");
    expect(rszs).toHaveLength(1);
    expect(rszs[0]?.data.id).toBe("rsz-1");

    const closures = filterImpacts(mockDashboard, "planned-closure", "ttc");
    expect(closures).toHaveLength(1);
    expect(closures[0]?.data.id).toBe("closure-1");
  });

  it("does not return RSZ impacts in regional mode even if requested", () => {
    const regionalRszs = filterImpacts(mockDashboard, "reduced-speed-zone", "regional");
    expect(regionalRszs).toHaveLength(0);
  });

  it("finds specific impact by kind and id", () => {
    const foundSusp = findImpactInDashboard(mockDashboard, "suspension", "susp-1");
    expect(foundSusp?.data.title).toBe("No service between Bloor and Eglinton");
    expect(foundSusp?.kind).toBe("suspension");

    const foundRsz = findImpactInDashboard(mockDashboard, "reduced-speed-zone", "rsz-1");
    expect(foundRsz?.data.title).toBe("Reduced Speed Zone near Davisville");

    const foundClosure = findImpactInDashboard(mockDashboard, "planned-closure", "closure-1");
    expect(foundClosure?.data.title).toBe("Weekend closure St George to Broadview");
  });

  it("falls back gracefully when searching across kinds or for non-existent IDs", () => {
    const foundFallback = findImpactInDashboard(mockDashboard, "unknown-kind", "delay-1");
    expect(foundFallback?.data.id).toBe("delay-1");

    const notFound = findImpactInDashboard(mockDashboard, "delay", "non-existent");
    expect(notFound).toBeNull();
  });
});

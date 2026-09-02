import { dashboardSchema } from "@/api/dashboard-schema";
import { describe, expect, it } from "@jest/globals";

const dashboardPayload = {
  networkId: "ttc",
  availability: "available",
  sourceSystems: ["ttc-live-alerts"],
  message: "Freshness-gated dashboard data.",
  map: {
    stations: [{ id: "union", name: "Union", x: 4311, y: 3597, interchange: true }],
    segments: [
      {
        id: "line-1-union-king",
        lineId: "line-1",
        label: "Union to King",
        stationAId: "union",
        stationBId: "king",
        stationAAnchorId: null,
        stationBAnchorId: null,
        guidePathId: null,
        guidePathReversed: false,
        pathD: "M 4311 3597 L 4547 3362",
        impacts: [],
        overlay: "clear",
        travelDirection: "bidirectional",
        sourceAlertIds: [],
        reducedSpeedZoneIds: [],
        alertId: null,
      },
    ],
    stationNodeImpacts: [],
  },
  status: {
    generatedAt: { time: "9:41 AM", date: "Sep 1, 2026", live: true, lastPoll: "succeeded just now" },
    lines: [
      {
        id: "line-1",
        number: "1",
        name: "Yonge-University",
        route: "Finch - Vaughan Metropolitan Centre",
        color: "#F8C300",
        status: "normal",
        statusLabel: "Normal",
        summary: "No active service impacts reported.",
        updatedAgo: "Updated recently",
      },
    ],
  },
  activeAlerts: [],
  delays: [],
  reducedSpeedZones: [],
  plannedClosures: [],
  performance: { status: "available" },
};

describe("dashboardSchema", () => {
  it("accepts the aggregate backend contract used by the mobile shell", () => {
    const parsed = dashboardSchema.parse(dashboardPayload);
    expect(parsed.networkId).toBe("ttc");
    expect(parsed.status.generatedAt.live).toBe(true);
    expect(parsed.map.segments[0]?.impacts).toEqual([]);
  });

  it("rejects an unsupported network before it reaches the UI", () => {
    expect(() => dashboardSchema.parse({ ...dashboardPayload, networkId: "bus" })).toThrow();
  });

  it("rejects a non-boolean live marker to preserve source honesty", () => {
    const invalid = structuredClone(dashboardPayload);
    invalid.status.generatedAt.live = "yes" as unknown as boolean;
    expect(() => dashboardSchema.parse(invalid)).toThrow();
  });
});

import { describe, expect, it } from "@jest/globals";

import {
  regionalArrivalSnapshotSchema,
  surfaceArrivalSnapshotSchema,
  ttcStationDetailSchema,
} from "@/api/station-detail-schema";

const mockTtcStationDetailPayload = {
  id: "union",
  name: "Union",
  mapX: 4311,
  mapY: 3597,
  interchange: true,
  lines: [
    {
      id: "line-1",
      number: "1",
      name: "Yonge-University",
      color: "#F8C300",
      platformLabel: "Northbound / Southbound",
      wheelchairAccessible: true,
      hasElevator: true,
    },
  ],
  access: {
    status: "normal",
    summary: "All elevators and escalators are in service.",
    updatedAgo: "10m ago",
    outages: [],
  },
  impacts: [
    {
      id: "alert-1",
      type: "active-alert",
      severity: "delay",
      title: "Line 1: Longer than normal travel times",
      summary: "Trains moving slowly near King due to track work.",
      updatedAgo: "5m ago",
      updatedAt: "2026-09-01T14:30:00Z",
      source: "TTC Live Alerts",
    },
  ],
  notices: [
    {
      id: "notice-1",
      category: "construction",
      title: "Platform Elevator Maintenance",
      summary: "Scheduled maintenance starting next week.",
      sourceUrl: "https://ttc.ca/notices/union",
      effectiveStart: "2026-09-05",
      effectiveEnd: "2026-09-12",
      sourceUpdatedAt: "2026-09-01T10:00:00Z",
      lastVerifiedAt: "2026-09-01T12:00:00Z",
      source: "TTC",
    },
  ],
  arrivals: [
    {
      lineId: "line-1",
      direction: "Northbound towards Vaughan Metropolitan Centre",
      minutes: 2,
      predictedAt: "2026-09-01T14:32:00Z",
      label: "2 min",
      source: "TTC GTFS-RT",
      status: "live",
    },
  ],
  arrivalsSource: "TTC live subway predictions",
  arrivalContext: {
    scheduleMayBeDisrupted: false,
    message: "",
    reason: "",
    severity: "normal",
    source: "TTC",
  },
  dataMode: "seeded-demo",
  disclaimer: "Unofficial transit reliability dashboard.",
  hasWashroom: true,
  hasParking: false,
  hasBicycleLockup: true,
  hasBicycleRepair: true,
  hasBikeShare: true,
  hasPpudo: true,
};

const mockRegionalArrivalSnapshotPayload = {
  stationId: "union",
  stationName: "Union Station",
  availability: "available",
  generatedAt: "2026-09-01T14:30:00Z",
  sourceUpdatedAt: "2026-09-01T14:29:45Z",
  source: "Metrolinx",
  message: "Live train estimates available",
  arrivals: [
    {
      lineId: "regional-lw",
      lineNumber: "LW",
      lineName: "Lakeshore West",
      direction: "Westbound to Niagara Falls",
      minutes: 4,
      predictedAt: "2026-09-01T14:34:00Z",
      scheduledAt: "2026-09-01T14:30:00Z",
      delayMinutes: 4,
      platform: "3",
      tripNumber: "1234",
      coachCount: 12,
      source: "Metrolinx",
      status: "live",
    },
  ],
};

const mockSurfaceArrivalSnapshotPayload = {
  networkId: "ttc",
  stationId: "union",
  stationName: "Union",
  availability: "available",
  generatedAt: "2026-09-01T14:30:00Z",
  sourceUpdatedAt: "2026-09-01T14:29:30Z",
  source: "TTC GTFS-RT",
  message: "Surface predictions available",
  arrivals: [
    {
      agency: "TTC",
      mode: "streetcar",
      route: "509",
      routeName: "Harbourfront",
      destination: "Exhibition Loop",
      minutes: 3,
      predictedAt: "2026-09-01T14:33:00Z",
      scheduledAt: "2026-09-01T14:30:00Z",
      bayPlatform: "Streetcar Platform",
      stopName: "Union Station Loop",
      tripId: "trip-9988",
      source: "TTC GTFS-RT",
      status: "live",
    },
  ],
};

describe("stationDetailSchemas", () => {
  it("parses valid TTC station detail payload matching Spring Boot StationController contract", () => {
    const parsed = ttcStationDetailSchema.parse(mockTtcStationDetailPayload);
    expect(parsed.id).toBe("union");
    expect(parsed.name).toBe("Union");
    expect(parsed.interchange).toBe(true);
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0]?.number).toBe("1");
    expect(parsed.impacts).toHaveLength(1);
    expect(parsed.notices).toHaveLength(1);
    expect(parsed.arrivals).toHaveLength(1);
    expect(parsed.hasWashroom).toBe(true);
    expect(parsed.hasParking).toBe(false);
  });

  it("handles TTC station detail with elevator/escalator outages and advisory access", () => {
    const payload = {
      ...mockTtcStationDetailPayload,
      access: {
        status: "outage",
        summary: "Platform elevator out of service.",
        updatedAgo: "15m ago",
        outages: [
          {
            id: "outage-1",
            assetType: "elevator",
            title: "Line 1 Southbound Elevator Out of Service",
            description: "Mechanical repair in progress.",
            cause: "Routine maintenance",
            updatedAt: "2026-09-01T14:00:00Z",
            source: "TTC Live Alerts",
          },
        ],
      },
    };
    const parsed = ttcStationDetailSchema.parse(payload);
    expect(parsed.access.status).toBe("outage");
    expect(parsed.access.outages).toHaveLength(1);
    expect(parsed.access.outages[0]?.assetType).toBe("elevator");
  });

  it("parses valid Regional train arrivals payload matching Spring Boot RegionalArrivalController contract", () => {
    const parsed = regionalArrivalSnapshotSchema.parse(mockRegionalArrivalSnapshotPayload);
    expect(parsed.stationId).toBe("union");
    expect(parsed.availability).toBe("available");
    expect(parsed.arrivals).toHaveLength(1);
    expect(parsed.arrivals[0]?.lineNumber).toBe("LW");
    expect(parsed.arrivals[0]?.platform).toBe("3");
    expect(parsed.arrivals[0]?.coachCount).toBe(12);
  });

  it("parses valid Surface arrivals payload matching Spring Boot SurfaceArrivalController contract", () => {
    const parsed = surfaceArrivalSnapshotSchema.parse(mockSurfaceArrivalSnapshotPayload);
    expect(parsed.stationId).toBe("union");
    expect(parsed.arrivals).toHaveLength(1);
    expect(parsed.arrivals[0]?.route).toBe("509");
    expect(parsed.arrivals[0]?.mode).toBe("streetcar");
  });

  it("rejects invalid payloads missing required station ID or coordinates", () => {
    expect(() =>
      ttcStationDetailSchema.parse({
        name: "Missing ID Station",
        mapX: 100,
        mapY: 200,
      }),
    ).toThrow();
  });
});

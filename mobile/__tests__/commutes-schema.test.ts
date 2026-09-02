import { describe, expect, it } from "@jest/globals";

import {
  createSavedCommuteInputSchema,
  savedCommuteListSchema,
  savedCommuteSchema,
} from "@/api/commutes-schema";

describe("commutes schema contract", () => {
  it("parses valid saved commute entry", () => {
    const parsed = savedCommuteSchema.parse({
      id: "commute_1",
      label: "Work Commute",
      networkId: "ttc",
      originStationId: "finch",
      originStationName: "Finch",
      destinationStationId: "union",
      destinationStationName: "Union",
      routeLabel: "Line 1 Southbound",
      watchReturnTrip: true,
      path: {
        status: "available",
        stationIds: ["finch", "north-york-centre", "sheppard-yonge", "union"],
        segmentIds: ["seg-1", "seg-2", "seg-3"],
        estimatedTravelSeconds: 1680,
      },
      impact: {
        status: "impacted",
        severity: "delay",
        statusLabel: "Delay",
        matchedImpacts: [
          {
            id: "alert-1",
            kind: "delay",
            status: "active",
            severity: "delay",
            title: "Line 1 Minor Delay",
            lineId: "line-1",
            lineNumber: "1",
          },
        ],
        travelTimeEstimate: {
          status: "estimated",
          baselineSeconds: 1680,
          estimatedLowSeconds: 1980,
          estimatedHighSeconds: 2280,
          summary: "+5–10 min delay",
        },
      },
      notificationRule: {
        enabled: true,
        dayMask: 62,
        outboundEnabled: true,
        returnEnabled: true,
      },
      createdAt: "2026-09-02T00:00:00Z",
      updatedAt: "2026-09-02T00:00:00Z",
    });

    expect(parsed.id).toBe("commute_1");
    expect(parsed.label).toBe("Work Commute");
    expect(parsed.watchReturnTrip).toBe(true);
    expect(parsed.impact?.severity).toBe("delay");
    expect(parsed.impact?.matchedImpacts).toHaveLength(1);
    expect(parsed.impact?.travelTimeEstimate?.summary).toBe("+5–10 min delay");
  });

  it("parses valid saved commute list response", () => {
    const parsed = savedCommuteListSchema.parse({
      commutes: [
        {
          id: "commute_2",
          label: "Lakeshore West Morning",
          networkId: "regional",
          originStationId: "oakville",
          originStationName: "Oakville",
          destinationStationId: "union",
          destinationStationName: "Union",
          routeLabel: "Lakeshore West Eastbound",
          watchReturnTrip: false,
          createdAt: "2026-09-02T00:00:00Z",
          updatedAt: "2026-09-02T00:00:00Z",
        },
      ],
    });

    expect(parsed.commutes).toHaveLength(1);
    expect(parsed.commutes[0]?.networkId).toBe("regional");
    expect(parsed.commutes[0]?.originStationName).toBe("Oakville");
  });

  it("parses create commute input schema", () => {
    const parsed = createSavedCommuteInputSchema.parse({
      networkId: "ttc",
      fromStationId: "bloor-yonge",
      toStationId: "st-george",
      customLabel: "Quick Transfer",
      includeReturnTrip: true,
    });

    expect(parsed.fromStationId).toBe("bloor-yonge");
    expect(parsed.toStationId).toBe("st-george");
    expect(parsed.includeReturnTrip).toBe(true);
  });
});

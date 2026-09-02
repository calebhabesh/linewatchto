import { describe, expect, it } from "@jest/globals";

import {
  savedStationListSchema,
  savedStationSchema,
} from "@/api/saved-stations-schema";

describe("saved-stations schema contract", () => {
  it("parses valid saved station entry", () => {
    const parsed = savedStationSchema.parse({
      networkId: "ttc",
      station: {
        id: "bloor-yonge",
        name: "Bloor-Yonge",
        mapX: 500,
        mapY: 400,
        interchange: true,
        lineIds: ["line-1", "line-2"],
        hasActiveImpact: false,
        accessStatus: "accessible",
        accessOutageCounts: { elevator: 0, escalator: 0 },
        wheelchairAccessible: true,
        hasElevator: true,
      },
      savedAt: "2026-09-02T00:00:00Z",
    });

    expect(parsed.networkId).toBe("ttc");
    expect(parsed.station.id).toBe("bloor-yonge");
    expect(parsed.station.interchange).toBe(true);
    expect(parsed.station.wheelchairAccessible).toBe(true);
  });

  it("parses valid saved station list response", () => {
    const parsed = savedStationListSchema.parse({
      stations: [
        {
          networkId: "regional",
          station: {
            id: "union-station",
            name: "Union Station",
            mapX: 500,
            mapY: 600,
            interchange: true,
          },
          savedAt: "2026-09-02T00:00:00Z",
        },
      ],
    });

    expect(parsed.stations).toHaveLength(1);
    expect(parsed.stations[0]?.networkId).toBe("regional");
    expect(parsed.stations[0]?.station.name).toBe("Union Station");
  });
});

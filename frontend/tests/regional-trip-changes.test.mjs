import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  emptyRegionalTripChangeResponse,
  findRegionalArrivalTripChange,
  getRegionalTripChanges,
  regionalTripChangeLabel,
} from "../src/app/regional-trip-changes.ts";

const cancellation = {
  id: "regional-trip-change-2026-07-31-MI100-cancellation",
  kind: "cancellation",
  tripId: "MI100",
  tripNumber: "681",
  lineId: "regional-mi",
  lineNumber: "MI",
  lineName: "Milton",
  destination: "Union Station",
  serviceDate: "2026-07-31",
  scheduledStartAt: "2026-07-31T15:00:00-04:00",
  updatedAt: "2026-07-31T11:58:00-04:00",
  scheduleMatched: true,
  title: "Train cancelled",
  description: "",
  cause: "",
  sourceSystems: ["metrolinx-go-train-exceptions", "metrolinx-go-gtfs-trip-updates"],
  affectedStops: [{
    stationId: "kipling",
    stationName: "Kipling",
    kind: "cancellation",
    scheduledAt: "2026-07-31T15:50:00-04:00",
    platform: "2",
  }],
};

describe("regional trip changes adapter", () => {
  it("requests station and search filters from the purpose-built endpoint", async () => {
    let requested = "";
    const result = await getRegionalTripChanges({
      stationId: "kipling",
      query: "681",
      fetcher: async (input) => {
        requested = String(input);
        return new Response(JSON.stringify({
          generatedAt: "2026-07-31T12:00:00-04:00",
          fresh: true,
          source: "Metrolinx GO operational trip updates",
          sourceUpdatedAt: "2026-07-31T11:58:00-04:00",
          totalCount: 1,
          changes: [cancellation],
        }), { status: 200 });
      },
    });

    assert.equal(requested, "/api/regional/trip-changes?stationId=kipling&query=681");
    assert.equal(result.source, "backend");
    assert.equal(result.data.changes[0].tripNumber, "681");
  });

  it("falls back to an empty, explicitly stale response", async () => {
    const result = await getRegionalTripChanges({
      fetcher: async () => new Response("nope", { status: 503 }),
    });

    assert.equal(result.source, "fallback");
    assert.deepEqual(result.data, emptyRegionalTripChangeResponse);
  });

  it("matches a cancellation to an arrival using trip number, service date, and station", () => {
    const arrival = {
      tripNumber: "681",
      scheduledAt: "2026-07-31T15:50:00-04:00",
    };

    assert.equal(findRegionalArrivalTripChange(arrival, [cancellation], "kipling")?.id, cancellation.id);
    assert.equal(findRegionalArrivalTripChange(arrival, [cancellation], "milton"), undefined);
    assert.equal(findRegionalArrivalTripChange(
      arrival,
      [{ ...cancellation, scheduleMatched: false }],
      "kipling",
    ), undefined);
  });

  it("uses short factual labels for supported change kinds", () => {
    assert.equal(regionalTripChangeLabel("cancellation"), "Cancelled");
    assert.equal(regionalTripChangeLabel("skipped-stop"), "Not stopping");
    assert.equal(regionalTripChangeLabel("added-stop"), "Additional stop");
  });
});

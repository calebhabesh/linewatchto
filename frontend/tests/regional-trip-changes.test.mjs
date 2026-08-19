import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cleanRegionalDestinationText,
  cleanRegionalTripNumber,
  emptyRegionalTripChangeResponse,
  findRegionalArrivalTripChange,
  formatRegionalTripDisplayName,
  formatRegionalTripSubtitle,
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

  it("extracts clean front-facing train numbers and destination names", () => {
    assert.equal(cleanRegionalTripNumber("20260818-LE-9626"), "9626");
    assert.equal(cleanRegionalTripNumber("20260818-ST-7129"), "7129");
    assert.equal(cleanRegionalTripNumber("20260818-ST-7428"), "7428");
    assert.equal(cleanRegionalTripNumber("20260728-4323"), "4323");
    assert.equal(cleanRegionalTripNumber("681"), "681");
    assert.equal(cleanRegionalTripNumber("LE-9626"), "9626");
    assert.equal(cleanRegionalTripNumber("notice-cancellation-123"), "");
    assert.equal(cleanRegionalTripNumber(""), "");
    assert.equal(cleanRegionalTripNumber(null), "");

    assert.equal(cleanRegionalDestinationText("LE - Whitby GO"), "Whitby");
    assert.equal(cleanRegionalDestinationText("ST - Union Station GO"), "Union");
    assert.equal(cleanRegionalDestinationText("ST - Mount Joy GO"), "Mount Joy");
    assert.equal(cleanRegionalDestinationText("Union Station"), "Union");
    assert.equal(cleanRegionalDestinationText(""), "");

    assert.equal(formatRegionalTripDisplayName({ tripNumber: "20260818-LE-9626" }), "Train 9626");
    assert.equal(formatRegionalTripDisplayName({ tripId: "20260818-ST-7129" }), "Train 7129");
    assert.equal(formatRegionalTripDisplayName({ tripNumber: "681" }), "Train 681");
    assert.equal(formatRegionalTripDisplayName({ tripNumber: "notice-abc", tripId: "notice-abc" }), "Train");

    assert.equal(
      formatRegionalTripSubtitle({
        lineName: "Stouffville",
        lineNumber: "ST",
        destination: "ST - Mount Joy GO",
        affectedStops: [{ stationName: "Union" }, { stationName: "Kennedy" }, { stationName: "Mount Joy" }],
      }),
      "Stouffville Line · Union to Mount Joy",
    );

    assert.equal(
      formatRegionalTripSubtitle({
        lineName: "Lakeshore East",
        lineNumber: "LE",
        destination: "Whitby GO",
        affectedStops: [{ stationName: "Union" }, { stationName: "Whitby" }],
      }),
      "Lakeshore East Line · Union to Whitby",
    );

    assert.equal(
      formatRegionalTripSubtitle({
        lineName: "UP Express",
        lineNumber: "UP",
        destination: "Pearson Airport",
        affectedStops: [{ stationName: "Union" }, { stationName: "Pearson Airport" }],
      }),
      "UP Express · Union to Pearson Airport",
    );

    assert.equal(
      formatRegionalTripSubtitle({
        lineName: "Kitchener",
        destination: "Mount Pleasant GO",
      }),
      "Kitchener Line · To Mount Pleasant",
    );
  });
});

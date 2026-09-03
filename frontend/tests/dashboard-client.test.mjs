import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getDashboardRefresh,
  retryDashboardRefresh,
} from "../src/app/dashboard-client.ts";
import { dashboardDataFromApi } from "../src/app/dashboard-adapter.ts";

function dashboardPayload() {
  return {
    networkId: "ttc",
    availability: "available",
    message: "Fresh dashboard",
    map: { stations: [], segments: [], stationNodeImpacts: [] },
    status: {
      generatedAt: { time: "8:00 AM", date: "Sep 3, 2026", live: true, lastPoll: "succeeded just now" },
      lines: [],
    },
    activeAlerts: [],
    delays: [],
    reducedSpeedZones: [],
    plannedClosures: [],
    performance: {},
  };
}

describe("dashboard refresh continuity", () => {
  it("retries transient failures without requiring callers to clear their snapshot", async () => {
    let attempts = 0;
    const retries = [];
    const waits = [];

    const result = await retryDashboardRefresh(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("temporary outage");
        return "recovered";
      },
      (attempt) => retries.push(attempt),
      [10, 20],
      async (milliseconds) => { waits.push(milliseconds); },
    );

    assert.equal(result, "recovered");
    assert.equal(attempts, 3);
    assert.deepEqual(retries, [1, 2]);
    assert.deepEqual(waits, [10, 20]);
  });

  it("returns a valid dashboard even when the optional reliability request fails", async () => {
    const result = await getDashboardRefresh("ttc", async (input) => {
      const url = String(input);
      if (url.includes("/api/reliability/")) throw new Error("reliability unavailable");
      return new Response(JSON.stringify(dashboardPayload()), { status: 200 });
    });

    assert.equal(result.payload.message, "Fresh dashboard");
    assert.equal(result.reliability, null);
  });

  it("rejects incomplete dashboard responses instead of replacing last-known-good data", async () => {
    await assert.rejects(
      getDashboardRefresh("ttc", async (input) => {
        const url = String(input);
        return url.includes("/api/reliability/")
          ? new Response("{}", { status: 503 })
          : new Response(JSON.stringify({ availability: "available", activeAlerts: [] }), { status: 200 });
      }),
      /incomplete payload/,
    );
  });

  it("retains degraded backend overlays and labels a confirmed source outage separately", () => {
    const degradedPayload = dashboardPayload();
    degradedPayload.availability = "degraded";
    degradedPayload.activeAlerts = [{ id: "retained-alert" }];

    const degraded = dashboardDataFromApi(degradedPayload);
    assert.equal(degraded.dataSource, "backend");
    assert.equal(degraded.availability, "degraded");
    assert.equal(degraded.activeAlerts[0].id, "retained-alert");

    const unavailablePayload = dashboardPayload();
    unavailablePayload.availability = "unavailable";
    unavailablePayload.status.generatedAt.live = false;
    const unavailable = dashboardDataFromApi(unavailablePayload);
    assert.equal(unavailable.dataSource, "fallback");
    assert.equal(unavailable.availability, "unavailable");
  });
});

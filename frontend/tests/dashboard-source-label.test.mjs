import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dashboardImpactSourceLabel,
  normalizeDashboardSourceLabel,
} from "../src/app/dashboard-source-label.ts";

describe("dashboard source labels", () => {
  it("uses one user-facing label for TTC Live Alerts feed records", () => {
    assert.equal(normalizeDashboardSourceLabel("TTC Live Alert"), "TTC Live Alerts");
    assert.equal(normalizeDashboardSourceLabel("TTC Live Alerts"), "TTC Live Alerts");
    assert.equal(normalizeDashboardSourceLabel("TTC Service Advisory"), "TTC Live Alerts");
  });

  it("preserves genuinely different dashboard sources", () => {
    assert.equal(normalizeDashboardSourceLabel("TTC GTFS-RT"), "TTC GTFS-RT");
    assert.equal(normalizeDashboardSourceLabel("Metrolinx GTFS-RT"), "Metrolinx GTFS-RT");
  });

  it("normalizes item sources selected by desktop category headers", () => {
    assert.equal(
      dashboardImpactSourceLabel(
        { networkId: "ttc", dataSource: "backend" },
        "TTC Service Advisory",
      ),
      "TTC Live Alerts",
    );
  });
});

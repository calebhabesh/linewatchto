import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dashboardImpactSourceLabel,
  dashboardImpactSourcesLabel,
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

  it("uses a compact label for TTC.ca service advisory records", () => {
    assert.equal(
      normalizeDashboardSourceLabel("TTC.ca Subway Service Advisories"),
      "TTC.ca Advisories",
    );
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

  it("identifies a category containing both TTC alert sources", () => {
    assert.equal(
      dashboardImpactSourcesLabel(
        { networkId: "ttc", dataSource: "backend" },
        ["TTC Service Advisory", "TTC.ca Subway Service Advisories"],
      ),
      "TTC Live Alerts + TTC.ca",
    );
  });

  it("does not treat aliases of one source as a mixed category", () => {
    assert.equal(
      dashboardImpactSourcesLabel(
        { networkId: "ttc", dataSource: "backend" },
        ["TTC Service Advisory", "TTC Live Alert"],
      ),
      "TTC Live Alerts",
    );
  });
});

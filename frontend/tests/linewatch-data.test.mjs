import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activeAlerts,
  commuteImpacts,
  delays,
  findAlertBySegmentId,
  generatedAt,
  ingestionHealth,
  lineStatuses,
  mapAsset,
  networkSegments,
  plannedClosures,
  reducedSpeedZones,
  reliabilitySummaries,
  stations,
  stationNodeImpacts,
  ttcPerformanceSnapshot,
} from "../src/app/linewatch-data.ts";

describe("LineWatch dashboard fixture data", () => {
  it("labels local fixture metadata as demo data", () => {
    assert.equal(generatedAt.live, false);
  });

  it("does not invent current disruption overlays in fixture mode", () => {
    const disruptedSegments = networkSegments.filter((segment) => segment.alertId);

    assert.equal(disruptedSegments.length, 0);
    assert.ok(networkSegments.every((segment) => segment.pathD.startsWith("M ")));
    assert.ok(networkSegments.every((segment) => segment.overlay === "clear"));
    assert.equal(findAlertBySegmentId("line-2-jane-ossington"), undefined);
    assert.equal(findAlertBySegmentId("line-1-finch-eglinton"), undefined);
  });

  it("uses the custom TTC SVG asset as the map base", () => {
    assert.equal(mapAsset.src, "/assets/linewatch/ttc-subway-map-custom.svg");
    assert.deepEqual(mapAsset.viewBox, [0, 0, 8250, 4000]);
    assert.ok(mapAsset.legendIcons["line-1"].endsWith("line-1-legend.svg"));
    assert.ok(mapAsset.legendIcons["line-6"].endsWith("line-6-legend.svg"));
  });

  it("uses station ids that match the station detail adapter", () => {
    const stationIds = stations.map((station) => station.id);

    assert.ok(stationIds.includes("eglinton"));
    assert.ok(!stationIds.includes("eglington"));
  });

  it("does not expose stale current or planned service impacts in fixture mode", () => {
    assert.equal(activeAlerts.length, 0);
    assert.ok(activeAlerts.every((alert) => alert.severity === "suspension"));
    assert.ok(Array.isArray(delays));
    assert.equal(delays.length, 0);
    assert.equal(reducedSpeedZones.length, 0);
    assert.equal(plannedClosures.length, 0);
    assert.ok(Array.isArray(stationNodeImpacts));
    assert.equal(stationNodeImpacts.length, 0);
    assert.ok(lineStatuses.every((line) => ["normal", "ready"].includes(line.status)));
    assert.ok(commuteImpacts.every((commute) => commute.impact === "clear"));
    assert.equal(
      ingestionHealth.find((item) => item.label === "Service alerts")?.value,
      "0 active in fixture mode",
    );
    assert.equal(
      ingestionHealth.find((item) => item.label === "Planned closures")?.value,
      "0 upcoming in fixture mode",
    );
  });

  it("includes commute impact and reliability metrics for portfolio storytelling", () => {
    assert.ok(commuteImpacts.every((commute) => commute.route.includes("->")));
    assert.ok(lineStatuses.every((line) => line.statusLabel.length > 0));
    assert.ok(reliabilitySummaries.every((summary) => summary.score >= 0 && summary.score <= 100));
  });

  it("labels TTC performance fallback as available official metrics in fixture mode", () => {
    assert.equal(ttcPerformanceSnapshot.status, "available");
    assert.equal(ttcPerformanceSnapshot.source, "TTC.ca");
    assert.equal(ttcPerformanceSnapshot.metrics.length, 8);
    assert.match(ttcPerformanceSnapshot.message, /loaded in fixture mode/i);
  });
});

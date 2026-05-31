import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  activeAlerts,
  commuteImpacts,
  findAlertBySegmentId,
  lineStatuses,
  mapAsset,
  networkSegments,
  plannedClosures,
  reliabilitySummaries,
} from "../src/app/linewatch-data.ts";

describe("LineWatch dashboard fixture data", () => {
  it("marks disrupted network segments as clickable alert overlays", () => {
    const disruptedSegments = networkSegments.filter((segment) => segment.alertId);

    assert.ok(disruptedSegments.length >= 3);
    assert.ok(disruptedSegments.every((segment) => segment.pathD.startsWith("M ")));
    assert.ok(disruptedSegments.every((segment) => segment.overlay !== "clear"));
    assert.ok(disruptedSegments.every((segment) => findAlertBySegmentId(segment.id)));
  });

  it("uses the edited TTC SVG asset as the map base", () => {
    assert.equal(mapAsset.src, "/assets/linewatch/ttc-subway-map-edited.svg");
    assert.deepEqual(mapAsset.viewBox, [0, 0, 8250, 4000]);
    assert.ok(mapAsset.legendIcons["line-1"].endsWith("line-1-legend.svg"));
    assert.ok(mapAsset.legendIcons["line-6"].endsWith("line-6-legend.svg"));
  });

  it("separates live alerts from planned closures with source and shuttle metadata", () => {
    assert.ok(activeAlerts.some((alert) => alert.severity === "suspension"));
    assert.ok(activeAlerts.some((alert) => alert.severity === "delay"));
    assert.ok(plannedClosures.some((closure) => closure.shuttle === true));
    assert.ok(plannedClosures.every((closure) => closure.previewSegmentIds.length > 0));
  });

  it("includes commute impact and reliability metrics for portfolio storytelling", () => {
    assert.ok(commuteImpacts.some((commute) => commute.impact !== "clear"));
    assert.ok(lineStatuses.some((line) => line.status !== "normal"));
    assert.ok(reliabilitySummaries.every((summary) => summary.score >= 0 && summary.score <= 100));
  });
});

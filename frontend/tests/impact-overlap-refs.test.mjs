import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getOverlappingImpactRefs } from "../src/components/impact-overlap-refs.ts";

const janeRunnymedeSegment = {
  id: "jane-runnymede",
  lineId: "line-2",
  label: "Jane to Runnymede",
  stationAId: "jane",
  stationBId: "runnymede",
  pathD: "",
  overlay: "delay",
  impacts: [
    {
      kind: "delay",
      cardId: "segment-delay-jane-runnymede",
      travelDirection: "bidirectional",
      sourceAlertIds: ["segment-delay-jane-runnymede"],
    },
    {
      kind: "reduced-speed-zone",
      cardId: "rsz-jane-runnymede",
      travelDirection: "bidirectional",
      sourceAlertIds: ["rsz-jane-runnymede"],
    },
  ],
};

const overlapData = {
  networkSegments: [janeRunnymedeSegment],
  activeAlerts: [
    {
      id: "station-delay-jane",
      lineId: "line-2",
      lineNumber: "2",
      title: "Delay at Jane Station",
      severity: "delay",
      location: "Jane Station",
      description: "Station-level delay at Jane.",
      affectedSegmentIds: [],
      shuttle: false,
      source: "Test",
    },
  ],
  delays: [
    {
      id: "segment-delay-jane-runnymede",
      lineId: "line-2",
      lineNumber: "2",
      title: "Delay from Jane to Runnymede",
      location: "Jane to Runnymede",
      description: "Segment delay.",
      affectedSegmentIds: ["jane-runnymede"],
      source: "Test",
    },
  ],
  reducedSpeedZones: [
    {
      id: "rsz-jane-runnymede",
      lineId: "line-2",
      lineNumber: "2",
      title: "Reduced Speed Zone",
      location: "Jane to Runnymede",
      displayDirection: "Eastbound & Westbound",
      description: "Reduced speed on the same segment.",
      affectedSegmentIds: ["jane-runnymede"],
      sourceAlertIds: ["rsz-jane-runnymede"],
      directionalDetails: [],
      source: "Test",
    },
  ],
  plannedClosures: [],
  stationNodeImpacts: [
    {
      stationId: "jane",
      kind: "delay",
      cardId: "station-delay-jane",
      title: "Delay at Jane Station",
    },
  ],
};

describe("overlapping impact refs", () => {
  it("includes station-node alerts on segment alert cards that touch the same station", () => {
    const refs = getOverlappingImpactRefs(
      {
        kind: "delay",
        id: "segment-delay-jane-runnymede",
        segmentIds: ["jane-runnymede"],
      },
      overlapData,
    );

    assert.ok(refs.some((ref) => ref.selection.id === "station-delay-jane"));
  });

  it("includes segment alert types on station-node alert cards that touch the same station", () => {
    const refs = getOverlappingImpactRefs(
      {
        kind: "delay",
        id: "station-delay-jane",
        segmentIds: [],
      },
      overlapData,
    );

    assert.ok(refs.some((ref) => ref.selection.id === "segment-delay-jane-runnymede"));
    assert.ok(refs.some((ref) => ref.selection.id === "rsz-jane-runnymede"));
  });
});

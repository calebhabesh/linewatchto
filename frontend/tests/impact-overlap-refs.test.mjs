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

  it("does not present a linked closure parent and child as overlapping incidents", () => {
    const linkedData = {
      ...overlapData,
      activeAlerts: [{
        id: "active-child",
        lineId: "line-2",
        lineNumber: "2",
        title: "No service",
        severity: "planned",
        location: "Jane to Runnymede",
        description: "Current closure wording.",
        affectedSegmentIds: ["jane-runnymede"],
        shuttle: true,
        source: "Test",
        relatedPlannedClosureId: "closure-parent",
      }],
      plannedClosures: [{
        id: "closure-parent",
        lineId: "line-2",
        lineNumber: "2",
        title: "Planned closure",
        window: "Nightly",
        location: "Jane to Runnymede",
        description: "Canonical schedule.",
        previewSegmentIds: ["jane-runnymede"],
        shuttle: true,
        source: "Test",
      }],
    };

    const childRefs = getOverlappingImpactRefs(
      { kind: "suspension", id: "active-child", segmentIds: ["jane-runnymede"] },
      linkedData,
    );
    const parentRefs = getOverlappingImpactRefs(
      { kind: "planned-closure", id: "closure-parent", segmentIds: ["jane-runnymede"] },
      linkedData,
    );

    assert.ok(!childRefs.some((ref) => ref.selection.id === "closure-parent"));
    assert.ok(!parentRefs.some((ref) => ref.selection.id === "active-child"));
  });

  it("orders overlaps by immediate rider impact while preserving source order within a type", () => {
    const refs = getOverlappingImpactRefs(
      {
        kind: "delay",
        id: "unrelated-current-impact",
        segmentIds: ["jane-runnymede"],
      },
      {
        ...overlapData,
        activeAlerts: [{
          ...overlapData.activeAlerts[0],
          id: "active-suspension",
          severity: "suspension",
          affectedSegmentIds: ["jane-runnymede"],
        }],
        plannedClosures: [{
          id: "upcoming-closure",
          lineId: "line-2",
          lineNumber: "2",
          title: "Upcoming closure",
          window: "Next weekend",
          location: "Jane to Runnymede",
          previewSegmentIds: ["jane-runnymede"],
          source: "Test",
        }],
      },
    );

    assert.deepEqual(
      refs.map((ref) => ref.kind),
      ["suspension", "delay", "reduced-speed-zone", "planned-closure"],
    );
  });

  describe("at stations drawn with a dot per line", () => {
    // GO/UP: KI and UP each have their own dot at Bloor, Mount Dennis and
    // Weston, and share Union's pill.
    const card = (id, lineNumber, severity = "suspension") => ({
      id,
      lineId: `regional-${lineNumber.toLowerCase()}`,
      lineNumber,
      title: id,
      severity,
      location: id,
      description: id,
      affectedSegmentIds: [],
      shuttle: false,
      source: "Test",
    });
    const segment = (line, stationAId, stationBId, cardId) => ({
      id: `${line}-${stationAId}-${stationBId}`,
      lineId: `regional-${line}`,
      label: `${stationAId} to ${stationBId}`,
      stationAId,
      stationBId,
      stationAAnchorId: ["bloor", "mount-dennis", "weston"].includes(stationAId)
        ? `station-${stationAId}-${line}` : `station-${stationAId}`,
      stationBAnchorId: ["bloor", "mount-dennis", "weston"].includes(stationBId)
        ? `station-${stationBId}-${line}` : `station-${stationBId}`,
      pathD: "",
      overlay: cardId ? "suspension" : "clear",
      impacts: cardId
        ? [{ kind: "suspension", cardId, travelDirection: "bidirectional", sourceAlertIds: [cardId] }]
        : [],
    });
    const data = (networkSegments, activeAlerts, stationNodeImpacts = []) => ({
      networkSegments,
      activeAlerts,
      delays: [],
      reducedSpeedZones: [],
      plannedClosures: [],
      stationNodeImpacts,
    });
    const overlaps = (id, source) => getOverlappingImpactRefs({ kind: "suspension", id, segmentIds: [] }, source)
      .map((ref) => ref.selection.id);

    const kiBloorWeston = [segment("ki", "bloor", "mount-dennis", "ki-alert"), segment("ki", "mount-dennis", "weston", "ki-alert")];
    const upBloorWeston = [segment("up", "bloor", "mount-dennis", "up-alert"), segment("up", "mount-dennis", "weston", "up-alert")];

    it("does not list KI and UP alerts that only meet at Bloor, Mount Dennis and Weston", () => {
      const source = data([...kiBloorWeston, ...upBloorWeston], [card("ki-alert", "KI"), card("up-alert", "UP")]);
      assert.deepEqual(overlaps("ki-alert", source), []);
      assert.deepEqual(overlaps("up-alert", source), []);
    });

    it("lists them when they meet at Union", () => {
      const source = data(
        [segment("ki", "union", "bloor", "ki-alert"), segment("up", "union", "bloor", "up-alert")],
        [card("ki-alert", "KI"), card("up-alert", "UP")],
      );
      assert.deepEqual(overlaps("ki-alert", source), ["up-alert"]);
    });

    it("lists a station alert only beside its own line's alerts, or beside both when its line is unknown", () => {
      const stationAlert = (cardId) => ({ stationId: "bloor", kind: "suspension", cardId, title: cardId });
      const segments = [segment("ki", "union", "bloor"), ...kiBloorWeston, segment("up", "union", "bloor"), ...upBloorWeston];
      const upStation = data(segments, [card("ki-alert", "KI"), card("up-alert", "UP"), card("up-bloor", "UP")], [stationAlert("up-bloor")]);
      assert.deepEqual(overlaps("ki-alert", upStation), []);
      assert.deepEqual(overlaps("up-alert", upStation), ["up-bloor"]);

      const unknown = data(segments, [card("ki-alert", "KI"), card("up-alert", "UP")], [stationAlert("bloor-notice")]);
      assert.deepEqual(overlaps("ki-alert", unknown), []);
      assert.deepEqual(overlaps("bloor-notice", unknown).sort(), ["ki-alert", "up-alert"]);
    });
  });
});

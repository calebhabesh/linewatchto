import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CONNECTOR_DETOUR_RATIO, badgeConnectorKeepOut, overlapBadgeConnector } from "../src/components/overlap-badge-connector.ts";
import { BADGE_FEATURE_GAPS } from "../src/components/overlap-badge-placement.ts";

const ROUND = { width: 135, height: 135 };
// A vertical overlay 102 units wide along x = 1000, with a station dot at y = 600.
const overlay = { polyline: [{ x: 1000, y: 200 }, { x: 1000, y: 1000 }], halfWidth: 51 };
const stationDot = { center: { x: 1000, y: 600 }, radius: 50 };

describe("overlap badge connector", () => {
  it("ends on the overlay's outline, not its centreline", () => {
    const connector = overlapBadgeConnector({
      position: { x: 700, y: 400 },
      size: ROUND,
      outlines: [overlay],
      minimumLength: 24,
    });

    assert.ok(connector);
    assert.ok(Math.abs(connector.to.x - (1000 - 51)) < 0.001, JSON.stringify(connector.to));
    assert.ok(Math.abs(connector.to.y - 400) < 8);
    // Starts on the badge's edge, facing the overlay.
    assert.ok(Math.abs(connector.from.x - (700 + 67.5)) < 0.001);
  });

  it("places its end dot outside the outline, touching it", () => {
    const connector = overlapBadgeConnector({
      position: { x: 700, y: 400 },
      size: ROUND,
      outlines: [overlay],
      minimumLength: 24,
      endRadius: 9,
    });

    assert.ok(connector);
    // Dot centre is one dot radius outside the overlay edge at x = 949.
    assert.ok(Math.abs(connector.to.x - (1000 - 51 - 9)) < 0.001, JSON.stringify(connector.to));
  });

  it("keeps its end off station dots on the overlay", () => {
    const connector = overlapBadgeConnector({
      position: { x: 700, y: 600 },
      size: ROUND,
      outlines: [overlay],
      minimumLength: 24,
      avoid: [stationDot],
    });

    assert.ok(connector);
    assert.ok(
      Math.hypot(connector.to.x - stationDot.center.x, connector.to.y - stationDot.center.y) >= stationDot.radius,
      JSON.stringify(connector.to),
    );
  });

  it("only reaches overlays next to the station for a station badge", () => {
    const connector = overlapBadgeConnector({
      position: { x: 700, y: 250 },
      size: ROUND,
      outlines: [overlay],
      minimumLength: 24,
      within: { center: { x: 1000, y: 700 }, radius: 200 },
    });

    assert.ok(connector);
    // The end sits on the outline of an overlay point within 200 of the station.
    const fromStation = Math.hypot(connector.to.x - 1000, connector.to.y - 700);
    assert.ok(fromStation <= 200 + overlay.halfWidth, `connector ended ${fromStation} from the station`);
  });

  it("skips the line when the badge already touches its overlay", () => {
    const connector = overlapBadgeConnector({
      position: { x: 1000 - 51 - 67.5 - 10, y: 400 },
      size: ROUND,
      outlines: [overlay],
      minimumLength: 24,
    });
    assert.equal(connector, null);
  });

  it("connects a pill from its nearest straight edge", () => {
    const connector = overlapBadgeConnector({
      position: { x: 1000, y: 0 },
      size: { width: 255, height: 135 },
      outlines: [{ center: { x: 1080, y: 300 }, radius: 40 }],
      minimumLength: 24,
    });

    assert.ok(connector);
    // The spine runs from x = 940 to 1060, so the line leaves the pill's bottom edge.
    assert.ok(connector.from.x > 1000 && connector.from.x <= 1060 + 67.5);
    assert.ok(connector.from.y > 0);
  });

  // A label box between the badge and the nearest part of the overlay.
  const labelBetween = { polygon: [
    { x: 800, y: 360 }, { x: 900, y: 360 }, { x: 900, y: 440 }, { x: 800, y: 440 },
  ], padding: 4 };
  const segmentHitsBox = (connector, box) => {
    for (let t = 0; t <= 1; t += 0.01) {
      const x = connector.from.x + (connector.to.x - connector.from.x) * t;
      const y = connector.from.y + (connector.to.y - connector.from.y) * t;
      if (x >= box.polygon[0].x && x <= box.polygon[1].x && y >= box.polygon[0].y && y <= box.polygon[2].y) return true;
    }
    return false;
  };

  it("lands further along the overlay so the line never runs through a station name", () => {
    const direct = overlapBadgeConnector({ position: { x: 700, y: 400 }, size: ROUND, outlines: [overlay], minimumLength: 24 });
    const connector = overlapBadgeConnector({
      position: { x: 700, y: 400 },
      size: ROUND,
      outlines: [overlay],
      minimumLength: 24,
      keepOut: [labelBetween],
    });

    assert.ok(direct && segmentHitsBox(direct, labelBetween), "the shortest line would cross the label");
    assert.ok(connector);
    assert.equal(segmentHitsBox(connector, labelBetween), false, JSON.stringify(connector));
    // Ends on the overlay's edge (51 units from its centreline at a sampled point), outside it.
    assert.ok(connector.to.x >= 949 - 0.001 && connector.to.x < 1000, JSON.stringify(connector.to));
  });

  it("draws no line rather than one through a name when every nearby landing is blocked", () => {
    const wall = { polygon: [
      { x: 780, y: 0 }, { x: 860, y: 0 }, { x: 860, y: 1200 }, { x: 780, y: 1200 },
    ], padding: 4 };
    assert.equal(overlapBadgeConnector({
      position: { x: 700, y: 400 },
      size: ROUND,
      outlines: [overlay],
      minimumLength: 24,
      keepOut: [wall],
    }), null);
  });

  it("does not swing far along the overlay to dodge a name", () => {
    // Blocks every landing within the detour budget but not the far end.
    const tall = { polygon: [
      { x: 800, y: 0 }, { x: 900, y: 0 }, { x: 900, y: 900 }, { x: 800, y: 900 },
    ], padding: 4 };
    const connector = overlapBadgeConnector({
      position: { x: 700, y: 400 },
      size: ROUND,
      outlines: [overlay],
      minimumLength: 24,
      keepOut: [tall],
    });
    if (connector) {
      const shortest = 1000 - 51 - (700 + 67.5);
      const length = Math.hypot(connector.to.x - connector.from.x, connector.to.y - connector.from.y);
      assert.ok(length <= shortest * CONNECTOR_DETOUR_RATIO + ROUND.height + 1, String(length));
    }
  });

  it("avoids crossing another transit line when a clear line is close by", () => {
    // A horizontal line crossing the shortest path just before the overlay.
    const otherLine = { polyline: [{ x: 600, y: 400 }, { x: 900, y: 400 }], radius: 20 };
    const connector = overlapBadgeConnector({
      position: { x: 700, y: 470 },
      size: ROUND,
      outlines: [overlay],
      minimumLength: 24,
      crossings: [otherLine],
    });
    assert.ok(connector);
    const minY = Math.min(connector.from.y, connector.to.y);
    assert.ok(minY > 420, `line should stay below the other line: ${JSON.stringify(connector)}`);
  });

  it("draws no line rather than cross another transit line", () => {
    // The overlay's only reachable part lies across a horizontal line from the badge.
    const otherLine = { polyline: [{ x: 0, y: 500 }, { x: 2000, y: 500 }], radius: 20 };
    const shortOverlay = { polyline: [{ x: 1000, y: 200 }, { x: 1000, y: 420 }], halfWidth: 51 };
    assert.equal(overlapBadgeConnector({
      position: { x: 900, y: 700 },
      size: ROUND,
      outlines: [shortOverlay],
      minimumLength: 24,
      crossings: [otherLine],
    }), null);
  });

  it("goes around other badges", () => {
    const otherBadge = badgeConnectorKeepOut({ x: 860, y: 400 }, ROUND, 9);
    const connector = overlapBadgeConnector({
      position: { x: 600, y: 400 },
      size: ROUND,
      outlines: [overlay],
      minimumLength: 24,
      keepOut: [otherBadge],
    });
    assert.ok(connector);
    assert.equal(segmentHitsBox(connector, otherBadge), false, JSON.stringify(connector));
  });

  it("allows a longer detour when the shortest line is very short", () => {
    // A name sits right in front of a badge close to its overlay; the clear
    // line further along is well over 1.75x the tiny shortest line.
    const name = { polygon: [
      { x: 820, y: 330 }, { x: 930, y: 330 }, { x: 930, y: 470 }, { x: 820, y: 470 },
    ], padding: 4 };
    const connector = overlapBadgeConnector({
      position: { x: 780, y: 400 },
      size: ROUND,
      outlines: [overlay],
      minimumLength: 24,
      keepOut: [name],
    });
    assert.ok(connector);
    assert.equal(segmentHitsBox(connector, name), false, JSON.stringify(connector));
  });

  it("keeps the end dot outside the outline when the line meets the overlay at a slant", () => {
    // A name straight across from the badge pushes the line to land at an angle.
    const name = { x: 800, y: 360, width: 120, height: 80 };
    const connector = overlapBadgeConnector({
      position: { x: 700, y: 400 },
      size: ROUND,
      outlines: [overlay],
      minimumLength: 24,
      endRadius: 9,
      keepOut: [name],
    });

    assert.ok(connector);
    assert.ok(Math.abs(connector.to.y - 400) > 40, JSON.stringify(connector));
    // The dot touches the outline from outside: one dot radius past x = 949.
    const fromOverlay = 1000 - connector.to.x;
    assert.ok(fromOverlay >= 51 + 9 - 0.5 && fromOverlay <= 51 + 9 + 1, JSON.stringify(connector.to));
  });

  it("gives a badge at its closest allowed spot a visible line", () => {
    const dot = 9;
    const connector = overlapBadgeConnector({
      position: { x: 1000 - 51 - BADGE_FEATURE_GAPS.alertOverlay - 67.5, y: 400 },
      size: ROUND,
      outlines: [overlay],
      minimumLength: 12,
      endRadius: dot,
    });

    assert.ok(connector);
    // Some line shows between the badge edge and the dot.
    assert.ok(connector.to.x - dot - connector.from.x > 0, JSON.stringify(connector));
  });
});

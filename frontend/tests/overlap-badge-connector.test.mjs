import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { overlapBadgeConnector } from "../src/components/overlap-badge-connector.ts";

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
});

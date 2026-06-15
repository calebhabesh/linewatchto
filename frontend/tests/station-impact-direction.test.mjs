import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  stationImpactDirectionArrow,
  stationImpactDirectionForImpact,
} from "../src/components/station-impact-direction.ts";

describe("station impact map direction arrows", () => {
  it("maps Line 2 cardinal directions to horizontal station-dot arrows", () => {
    assert.equal(stationImpactDirectionArrow("line-2", "Westbound")?.direction, "left");
    assert.equal(stationImpactDirectionArrow("line-2", "Eastbound")?.direction, "right");
    assert.equal(
      stationImpactDirectionArrow("line-2", "Eastbound & Westbound")?.direction,
      "horizontal-bidirectional",
    );
  });

  it("maps Line 1 cardinal directions to vertical station-dot arrows", () => {
    assert.equal(stationImpactDirectionArrow("line-1", "Northbound")?.direction, "up");
    assert.equal(stationImpactDirectionArrow("line-1", "Southbound")?.direction, "down");
    assert.equal(
      stationImpactDirectionArrow("line-1", "Both ways")?.direction,
      "vertical-bidirectional",
    );
  });

  it("uses the linked alert card direction for station-node impacts", () => {
    const details = stationImpactDirectionForImpact(
      {
        stationId: "jane",
        kind: "delay",
        cardId: "delay-at-jane",
        title: "Delay at Jane",
      },
      {
        activeAlerts: [],
        delays: [
          {
            id: "delay-at-jane",
            lineId: "line-2",
            displayDirection: "Westbound",
          },
        ],
        reducedSpeedZones: [],
        plannedClosures: [],
      },
    );

    assert.equal(details?.displayDirection, "Westbound");
    assert.equal(details?.arrow.direction, "left");
  });

  it("does not invent an arrow when the source direction is unavailable", () => {
    assert.equal(stationImpactDirectionArrow("line-1", null), null);
    assert.equal(stationImpactDirectionArrow("line-1", "Direction not specified"), null);
  });
});

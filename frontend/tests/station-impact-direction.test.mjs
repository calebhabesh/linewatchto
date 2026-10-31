import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  stationImpactDirectionArrow,
  stationImpactDirectionForImpact,
  stationImpactDirectionForStationImpacts,
  stationImpactDirectionPath,
  stationImpactDirectionStrokeWidth,
} from "../src/components/station-impact-direction.ts";

const ARROW_DIRECTIONS = [
  "left", "right", "up", "down",
  "up-left", "up-right", "down-left", "down-right",
  "horizontal-bidirectional", "vertical-bidirectional",
  "three-way-no-left", "three-way-no-right", "three-way-no-up", "three-way-no-down",
  "four-way",
];

/** A glyph path's strokes as point lists (it uses only M and L). */
function pathStrokes(d) {
  return d.split("M").slice(1).map((stroke) => {
    const numbers = stroke.replaceAll("L", " ").trim().split(/\s+/).map(Number);
    return Array.from({ length: numbers.length / 2 }, (_, index) => [numbers[2 * index], numbers[2 * index + 1]]);
  });
}

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
      stationImpactDirectionArrow("line-1", "Both Ways")?.direction,
      "vertical-bidirectional",
    );
  });

  it("maps bidirectional regional corridor alerts to readable station-dot arrows", () => {
    for (const lineId of ["regional-ki", "regional-le", "regional-lw", "regional-mi", "regional-up"]) {
      assert.equal(
        stationImpactDirectionArrow(lineId, "Both Directions")?.direction,
        "horizontal-bidirectional",
      );
    }
    for (const lineId of ["regional-br", "regional-rh", "regional-st"]) {
      assert.equal(
        stationImpactDirectionArrow(lineId, "Both Directions")?.direction,
        "vertical-bidirectional",
      );
    }
  });

  it("omits regional station arrows when the source does not specify a direction", () => {
    for (const displayDirection of [undefined, null, "", " ", "Unknown", "Direction Not Specified"]) {
      const details = stationImpactDirectionForImpact(
        { stationId: "bloor", kind: "delay", cardId: "regional-bloor-delay" },
        {
          activeAlerts: [],
          delays: [{
            id: "regional-bloor-delay",
            lineId: "regional-up",
            displayDirection,
          }],
          reducedSpeedZones: [],
          plannedClosures: [],
        },
      );

      assert.equal(details, null, `Unexpected arrow for ${displayDirection}`);
    }
  });

  it("keeps explicit regional directions from the linked source card", () => {
    for (const [displayDirection, expected] of [["Westbound", "left"], ["Both Directions", "horizontal-bidirectional"]]) {
      const details = stationImpactDirectionForImpact(
        { stationId: "bloor", kind: "delay", cardId: "regional-bloor-delay" },
        {
          activeAlerts: [],
          delays: [{ id: "regional-bloor-delay", lineId: "regional-up", displayDirection }],
          reducedSpeedZones: [],
          plannedClosures: [],
        },
      );
      assert.equal(details?.displayDirection, displayDirection);
      assert.equal(details?.arrow.direction, expected);
    }
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

  it("uses Union terminal labels for Line 1 station-dot arrows", () => {
    const data = {
      activeAlerts: [],
      delays: [
        {
          id: "delay-at-union-vaughan",
          lineId: "line-1",
          displayDirection: "Northbound (to Vaughan Metropolitan Centre)",
        },
        {
          id: "delay-at-union-finch",
          lineId: "line-1",
          displayDirection: "Northbound (to Finch)",
        },
      ],
      reducedSpeedZones: [],
      plannedClosures: [],
    };

    assert.equal(
      stationImpactDirectionForImpact(
        {
          stationId: "union",
          kind: "delay",
          cardId: "delay-at-union-vaughan",
          title: "Delay at Union",
        },
        data,
      )?.arrow.direction,
      "left",
    );
    assert.equal(
      stationImpactDirectionForImpact(
        {
          stationId: "union",
          kind: "delay",
          cardId: "delay-at-union-finch",
          title: "Delay at Union",
        },
        data,
      )?.arrow.direction,
      "right",
    );
    assert.equal(
      stationImpactDirectionArrow("line-1", "Northbound (to Finch)")?.direction,
      "up",
    );
  });

  it("does not invent an arrow when the source direction is unavailable", () => {
    assert.equal(stationImpactDirectionArrow("line-1", null), null);
    assert.equal(stationImpactDirectionArrow("line-1", "Direction Not Specified"), null);
  });

  it("combines junction station card directions into a four-way arrow", () => {
    const details = stationImpactDirectionForStationImpacts(
      [
        {
          stationId: "bloor-yonge",
          kind: "delay",
          cardId: "delay-at-bloor-yonge-line-1",
        },
        {
          stationId: "bloor-yonge",
          kind: "delay",
          cardId: "delay-at-bloor-yonge-line-2",
        },
      ],
      {
        activeAlerts: [],
        delays: [
          {
            id: "delay-at-bloor-yonge-line-1",
            lineId: "line-1",
            displayDirection: "Northbound & Southbound",
          },
          {
            id: "delay-at-bloor-yonge-line-2",
            lineId: "line-2",
            displayDirection: "Eastbound & Westbound",
          },
        ],
        reducedSpeedZones: [],
        plannedClosures: [],
      },
    );

    assert.equal(details?.arrow.direction, "four-way");
    assert.equal(details?.displayDirection, "Northbound & Southbound; Eastbound & Westbound");
  });

  it("combines junction station card directions into adjacent two-way and three-way arrows", () => {
    const data = {
      activeAlerts: [],
      delays: [
        {
          id: "northbound",
          lineId: "line-1",
          displayDirection: "Northbound",
        },
        {
          id: "eastbound",
          lineId: "line-2",
          displayDirection: "Eastbound",
        },
        {
          id: "southbound",
          lineId: "line-1",
          displayDirection: "Southbound",
        },
      ],
      reducedSpeedZones: [],
      plannedClosures: [],
    };

    assert.equal(
      stationImpactDirectionForStationImpacts(
        [
          {
            stationId: "bloor-yonge",
            kind: "delay",
            cardId: "northbound",
          },
          {
            stationId: "bloor-yonge",
            kind: "delay",
            cardId: "eastbound",
          },
        ],
        data,
      )?.arrow.direction,
      "up-right",
    );

    assert.equal(
      stationImpactDirectionForStationImpacts(
        [
          {
            stationId: "bloor-yonge",
            kind: "delay",
            cardId: "northbound",
          },
          {
            stationId: "bloor-yonge",
            kind: "delay",
            cardId: "eastbound",
          },
          {
            stationId: "bloor-yonge",
            kind: "delay",
            cardId: "southbound",
          },
        ],
        data,
      )?.arrow.direction,
      "three-way-no-left",
    );
  });

  it("maps Line 1 Spadina delays to standard vertical arrows", () => {
    const data = {
      activeAlerts: [],
      delays: [
        { id: "spadina-sb", lineId: "line-1", displayDirection: "Southbound" },
        { id: "spadina-nb", lineId: "line-1", displayDirection: "Northbound" },
        { id: "spadina-bw", lineId: "line-1", displayDirection: "Both Ways" },
      ],
      reducedSpeedZones: [],
      plannedClosures: [],
    };

    assert.equal(
      stationImpactDirectionForImpact(
        { stationId: "spadina", kind: "delay", cardId: "spadina-sb" },
        data,
      )?.arrow.direction,
      "down",
    );
    assert.equal(
      stationImpactDirectionForImpact(
        { stationId: "spadina", kind: "delay", cardId: "spadina-nb" },
        data,
      )?.arrow.direction,
      "up",
    );
    assert.equal(
      stationImpactDirectionForImpact(
        { stationId: "spadina", kind: "delay", cardId: "spadina-bw" },
        data,
      )?.arrow.direction,
      "vertical-bidirectional",
    );
  });
});

describe("GO/UP trip direction arrows", () => {
  const empty = { activeAlerts: [], delays: [], reducedSpeedZones: [], plannedClosures: [] };
  const directionAt = (stationId, lineId, displayDirection, kind = "delay") => stationImpactDirectionForImpact(
    { stationId, kind, cardId: "go-trip" },
    { ...empty, [kind === "delay" ? "delays" : "activeAlerts"]: [{ id: "go-trip", lineId, displayDirection }] },
  )?.arrow.direction ?? null;

  it("points a trip heading for Union the way Union lies on each line", () => {
    assert.equal(directionAt("weston", "regional-ki", "Towards Union Station"), "right");
    assert.equal(directionAt("oakville", "regional-lw", "Towards Union Station"), "right");
    assert.equal(directionAt("cooksville", "regional-mi", "Towards Union Station"), "right");
    assert.equal(directionAt("weston", "regional-up", "Towards Union Station"), "right");
    assert.equal(directionAt("pickering", "regional-le", "Towards Union Station"), "left");
    assert.equal(directionAt("aurora", "regional-br", "Towards Union Station"), "down");
    assert.equal(directionAt("langstaff", "regional-rh", "Towards Union Station"), "down");
    assert.equal(directionAt("markham", "regional-st", "Towards Union Station", "suspension"), "down");
  });

  it("points a trip heading out of Union, or to a farther stop, away from Union", () => {
    assert.equal(directionAt("weston", "regional-ki", "Towards Kitchener"), "left");
    assert.equal(directionAt("pickering", "regional-le", "Towards Durham College Oshawa"), "right");
    assert.equal(directionAt("burlington", "regional-lw", "Towards St. Catharines"), "left");
    assert.equal(directionAt("weston", "regional-up", "Towards Pearson Airport"), "left");
    assert.equal(directionAt("union", "regional-br", "Towards Barrie South"), "up");
    // An inbound trip that ends short of Union still points towards Union.
    assert.equal(directionAt("georgetown", "regional-ki", "Towards Bramalea"), "right");
  });

  it("draws no arrow without a trip direction it can place", () => {
    assert.equal(directionAt("weston", "regional-ki", null), null);
    assert.equal(directionAt("weston", "regional-ki", "Towards Somewhere Else"), null);
    assert.equal(directionAt("union", "regional-ki", "Towards Union Station"), null);
    // A destination off the alerted line cannot be placed.
    assert.equal(directionAt("weston", "regional-ki", "Towards Pickering"), null);
  });

  it("centres every arrow configuration in its station dot, three-way arrows optically", () => {
    // TTC's regular and large badges, and a GO/UP badge scaled from its dot.
    for (const radius of [24, 40, 17.25]) {
      for (const direction of ARROW_DIRECTIONS) {
        const strokes = pathStrokes(stationImpactDirectionPath(direction, radius));
        const points = strokes.flat();
        const xs = points.map(([x]) => x);
        const ys = points.map(([, y]) => y);
        const box = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
        if (direction.startsWith("three-way")) {
          // Halfway between the junction and the bounding box's centre.
          const junction = strokes[0][0];
          assert.ok(Math.abs(junction[0] + box[0]) <= 0.02 && Math.abs(junction[1] + box[1]) <= 0.02, `${direction} at r${radius}: junction ${junction}, box ${box}`);
          assert.ok(Math.hypot(...box) > 0, `${direction} at r${radius} is shifted from its box`);
        } else {
          assert.ok(Math.abs(box[0]) <= 0.01 && Math.abs(box[1]) <= 0.01, `${direction} at r${radius} centres at ${box}`);
        }
      }
    }
  });

  it("keeps every arrowhead clear of the others at large and small sizes", () => {
    for (const radius of [24, 40, 17.25]) {
      const strokeWidth = stationImpactDirectionStrokeWidth(radius);
      for (const direction of ARROW_DIRECTIONS) {
        const heads = pathStrokes(stationImpactDirectionPath(direction, radius)).filter((stroke) => stroke.length === 3);
        for (let a = 0; a < heads.length; a += 1) {
          for (let b = a + 1; b < heads.length; b += 1) {
            const gap = Math.min(...heads[a].flatMap((p) => heads[b].map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))));
            assert.ok(gap >= strokeWidth * 1.5, `${direction} at r${radius}: heads ${gap.toFixed(1)} apart, stroke ${strokeWidth}`);
          }
        }
      }
    }
  });
});

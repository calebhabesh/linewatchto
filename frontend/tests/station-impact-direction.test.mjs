import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  stationImpactDirectionArrow,
  stationImpactDirectionForImpact,
  stationImpactDirectionForStationImpacts,
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
    assert.equal(stationImpactDirectionArrow("line-1", "Direction not specified"), null);
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
        { id: "spadina-bw", lineId: "line-1", displayDirection: "Both ways" },
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

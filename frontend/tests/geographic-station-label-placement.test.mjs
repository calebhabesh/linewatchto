import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_STATION_LABEL_PLACEMENT,
  chooseStationLabelPlacements,
  stationLabelPlacements,
  variableAnchorOffset,
} from "../src/app/geographic-station-label-placement.ts";

// Directions are in screen axes: x right, y down.
const NORTH = [0, -1];
const SOUTH = [0, 1];
const EAST = [1, 0];
const WEST = [-1, 0];

describe("Map View station name placement", () => {
  it("keeps names below a station no line passes", () => {
    assert.deepEqual(chooseStationLabelPlacements([])[0], DEFAULT_STATION_LABEL_PLACEMENT);
  });

  it("puts a north-south station's name beside the line, never above or below it", () => {
    const placements = chooseStationLabelPlacements([NORTH, SOUTH]);
    assert.ok(["left", "right"].includes(placements[0].anchor));
    assert.ok(placements.every(({ anchor }) => anchor !== "top" && anchor !== "bottom"));
  });

  it("puts an east-west station's name below or above the line", () => {
    const placements = chooseStationLabelPlacements([EAST, WEST]);
    assert.ok(["top", "bottom"].includes(placements[0].anchor));
    assert.ok(placements.every(({ anchor }) => anchor !== "left" && anchor !== "right"));
  });

  it("ends with farther versions of the two best sides, to clear a badge on the station", () => {
    const placements = chooseStationLabelPlacements([NORTH, SOUTH]);
    const [first, second] = placements;
    const far = placements.slice(-2);
    assert.equal(far[0].anchor, first.anchor);
    assert.equal(far[1].anchor, second.anchor);
    assert.ok(Math.hypot(...far[0].offset) > Math.hypot(...first.offset));
  });

  it("flattens placements into MapLibre's text-variable-anchor-offset form", () => {
    assert.deepEqual(
      variableAnchorOffset([{ anchor: "left", offset: [0.8, 0] }, { anchor: "top", offset: [0, 1.2] }]),
      ["left", [0.8, 0], "top", [0, 1.2]],
    );
  });

  it("reads line directions from the catalog: a north-south line puts names beside it", () => {
    const station = (stationId, lat) => ({
      type: "Feature",
      id: stationId,
      geometry: { type: "Point", coordinates: [-79.4, lat] },
      properties: { featureType: "station", stationId, name: stationId, network: "ttc", lineIds: ["line-1"], gtfsStopId: "" },
    });
    const link = (segmentId, from, to) => ({
      type: "Feature",
      id: segmentId,
      geometry: { type: "LineString", coordinates: [[-79.4, from], [-79.4, to]] },
      properties: { featureType: "link", segmentId, lineId: "line-1", network: "ttc", stationAId: "", stationBId: "" },
    });
    const catalog = {
      type: "FeatureCollection",
      features: [
        station("north", 43.72),
        station("middle", 43.71),
        station("south", 43.70),
        link("a", 43.72, 43.71),
        link("b", 43.71, 43.70),
      ],
    };
    const placements = stationLabelPlacements(catalog);
    assert.ok(["left", "right"].includes(placements.get("middle")[0].anchor));
    // A terminal's line leaves one way only; its name still keeps off it.
    assert.notEqual(placements.get("north")[0].anchor, "top");
    assert.equal(stationLabelPlacements(catalog), placements, "computed once per catalog");
  });
});

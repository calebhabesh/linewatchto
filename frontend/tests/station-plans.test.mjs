import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildStationPlanFeatures,
  busBayNumber,
  cleanRing,
  entranceArrow,
  mergeNearbyPoints,
} from "../../scripts/lib/station-plans.mjs";

const ring = [[-79.48, 43.65], [-79.479, 43.65], [-79.479, 43.651], [-79.48, 43.651], [-79.48, 43.65]];
const label = (code, name) => ({ type: "Feature", geometry: { type: "Point", coordinates: [-79.48, 43.65] }, properties: { icon_name: "none", stop_code: code, stop_name: name } });
const point = (props, coordinates = [-79.4795, 43.6505]) => ({ type: "Feature", geometry: { type: "Point", coordinates }, properties: { stop_code: "1167", ...props } });

describe("station plans (plan 13, S7)", () => {
  it("reads entrance bearings and lettered exits", () => {
    assert.deepEqual(entranceArrow("exit", 255), { bearing: 255, letter: null });
    assert.deepEqual(entranceArrow("exit_left_A2", 349), { bearing: 270, letter: "A2" });
    assert.deepEqual(entranceArrow("exit_upright_F", 349), { bearing: 45, letter: "F" });
    assert.equal(entranceArrow("stairs_up", 0), null);
  });

  it("drops repeated vertices and rejects degenerate rings", () => {
    assert.equal(cleanRing([[0, 0], [0, 0], [1, 1], [0, 0]]), null);
    assert.equal(cleanRing([[0, 0], [1, 0], [1, 1]]).length, 4);
  });

  it("merges one elevator shaft's floors into one point", () => {
    assert.equal(mergeNearbyPoints([[-79.48, 43.65], [-79.48001, 43.65001], [-79.47, 43.65]]).length, 2);
  });

  it("joins stations by name, sorts deepest first, and keeps no service state", () => {
    const { features, stats } = buildStationPlanFeatures({
      stations: [{ name: "Jane", stationId: "jane" }, { name: "Jane And Finch", stationId: "jane-and-finch" }],
      areas: [
        { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: { stop_code: 1167, floor: 0, building_name: "B" } },
        { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: { stop_code: 1167, floor: -2, building_name: "A" } },
      ],
      points: [
        label("1167", "Jane"), label("16824", "Jane & Finch"),
        point({ icon_name: "exit", exit_direction: 160, description: "Bloor St Entrance" }),
        point({ icon_name: "elevator", floor: 0 }), point({ icon_name: "elevator", floor: -1 }),
        point({ icon_name: "stairs_up" }),
      ],
    });
    assert.deepEqual(features.filter((f) => f.properties.featureType === "station-area").map((f) => f.properties.floor), [-2, 0]);
    assert.equal(stats.entrances, 1);
    assert.equal(stats.elevators, 1);
    for (const feature of features) {
      assert.deepEqual(Object.keys(feature.properties).filter((key) => /status|working|outage/i.test(key)), []);
    }
  });

  it("reads bay numbers from GTFS stop names, not the Bay or Bayview stations", () => {
    assert.equal(busBayNumber("Jane Station at Bus Bay 2"), "2");
    assert.equal(busBayNumber("Pape Station at Temporary Bus Bay 3"), "3");
    assert.equal(busBayNumber("Kipling Station at Lower Bus Bay 6A"), "6A");
    assert.equal(busBayNumber("Bay Station - Eastbound Platform"), null);
    assert.equal(busBayNumber("Bayview Station - Westbound Platform"), null);
  });

  it("adds stairs and escalators with their direction, and GTFS bus bays", () => {
    const { features, stats } = buildStationPlanFeatures({
      stations: [{ name: "Jane", stationId: "jane" }],
      areas: [],
      points: [
        label("1167", "Jane"),
        point({ icon_name: "stairs_up", floor: -1 }), point({ icon_name: "stairs_up", floor: -2 }),
        point({ icon_name: "stairs_down", floor: 0 }),
        point({ icon_name: "escalator_up" }, [-79.479, 43.6505]),
      ],
      gtfsStops: [
        { stopCode: "14700", name: "Jane Station at Bus Bay 2", lat: 43.649937, lon: -79.484094, parentStopCode: "1167" },
        { stopCode: "13777", name: "Jane Station - Eastbound Platform", lat: 43.65, lon: -79.48, parentStopCode: "1167" },
        { stopCode: "99", name: "Elsewhere at Bus Bay 1", lat: 43.7, lon: -79.4, parentStopCode: "0000" },
      ],
    });
    assert.equal(stats.stairs, 2, "one direction's points at one spot merge; up and down stay apart");
    assert.deepEqual(features.filter((f) => f.properties.featureType === "station-stairs").map((f) => f.properties.direction).sort(), ["down", "up"]);
    assert.equal(stats.escalators, 1);
    assert.equal(features.find((f) => f.properties.featureType === "station-escalator").properties.direction, "up");
    assert.deepEqual(features.filter((f) => f.properties.featureType === "station-bay").map((f) => f.properties),
      [{ featureType: "station-bay", stationId: "jane", stopCode: "14700", bay: "2" }]);
  });

  it("refuses a service station missing from the catalog", () => {
    assert.throws(() => buildStationPlanFeatures({ stations: [], areas: [], points: [label("1", "New Station")] }), /New Station/);
  });
});

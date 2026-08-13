import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  orientedEstimatedTrainMarkerAngle,
  resolveEstimatedTrainMarkerSegmentDirection,
} from "../src/app/train-markers.ts";

const regionalMapSource = readFileSync(
  new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url),
  "utf8",
);
const ttcMapSource = readFileSync(
  new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url),
  "utf8",
);

describe("regional estimated train marker rendering", () => {
  it("uses the TTC vehicle glyph for regional corridor-coloured markers", () => {
    assert.match(ttcMapSource, /TRAIN_MARKER_BODY_PATH/);
    assert.match(regionalMapSource, /TRAIN_MARKER_BODY_PATH/);
    assert.match(regionalMapSource, /estimated-train-marker-outline/);
    assert.match(regionalMapSource, /estimated-train-marker-window/);
    assert.match(regionalMapSource, /estimated-train-marker-arrow/);
  });

  it("projects regional markers onto the authored segment path in root coordinates", () => {
    assert.match(regionalMapSource, /corridorSegmentPathInRootCoordinates\(documentNode, segment\)/);
    assert.match(regionalMapSource, /getPointAtLength/);
    assert.match(regionalMapSource, /getTotalLength/);
    assert.match(regionalMapSource, /REGIONAL_TRAIN_MARKER_LAYER_ID/);
    assert.doesNotMatch(regionalMapSource, /const x = from\.x \+ \(to\.x - from\.x\) \* progress/);
    assert.doesNotMatch(regionalMapSource, /documentNode\.documentElement\.append\(markerLayer\)/);
  });

  it("updates regional markers without rebuilding the map or replaying marker motion", () => {
    assert.match(regionalMapSource, /existingMarkersByKey/);
    assert.match(regionalMapSource, /estimatedTrainMarkerRenderKey\(marker\)/);
    assert.match(regionalMapSource, /existingMarkersByKey\.delete\(markerKey\)/);
    assert.doesNotMatch(regionalMapSource, /markerLayer\.replaceChildren\(\)/);
    assert.match(
      regionalMapSource,
      /\}, \[estimatedTrainMarkers, estimatedTrainsEnabled, networkSegments, svgMarkup\]\);/,
    );
    assert.doesNotMatch(
      regionalMapSource,
      /\}, \[activeAlerts, commutePathPreview, estimatedTrainMarkers, estimatedTrainsEnabled,/,
    );
  });

  it("orients an UP marker only from a validated adjacent station pair", () => {
    const segment = {
      stationAId: "mount-dennis",
      stationBId: "weston",
      stationAAnchorId: "station-mount-dennis-up",
      stationBAnchorId: "station-weston-up",
    };
    const eastbound = {
      fromStationId: "weston",
      toStationId: "mount-dennis",
      nextStationId: "mount-dennis",
    };

    assert.deepEqual(
      resolveEstimatedTrainMarkerSegmentDirection(eastbound, segment),
      {
        fromStationId: "weston",
        toStationId: "mount-dennis",
        fromAnchorId: "station-weston-up",
        toAnchorId: "station-mount-dennis-up",
      },
    );
    assert.equal(orientedEstimatedTrainMarkerAngle(32, true), 32);
    assert.equal(orientedEstimatedTrainMarkerAngle(32, false), 212);
    assert.equal(
      resolveEstimatedTrainMarkerSegmentDirection(
        { ...eastbound, toStationId: "weston" },
        segment,
      ),
      null,
    );
  });
});

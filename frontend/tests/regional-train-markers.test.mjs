import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

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

  it("projects regional markers onto the authored segment path in station-layer coordinates", () => {
    assert.match(regionalMapSource, /resolvedRegionalSegmentPath\(documentNode, segment\)/);
    assert.match(regionalMapSource, /getPointAtLength/);
    assert.match(regionalMapSource, /getTotalLength/);
    assert.match(regionalMapSource, /stationsLayer\.append\(markerLayer\)/);
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
      /\}, \[activeAlerts, commutePathPreview, delays, networkSegments, plannedClosures, reducedMotion, reducedSpeedZones, stationNodeImpacts\]\);/,
    );
    assert.doesNotMatch(
      regionalMapSource,
      /\}, \[activeAlerts, commutePathPreview, estimatedTrainMarkers, estimatedTrainsEnabled,/,
    );
  });
});

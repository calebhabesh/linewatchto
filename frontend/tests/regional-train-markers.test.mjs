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
const regionalGeometrySource = readFileSync(
  new URL("../src/app/regional-map-geometry.ts", import.meta.url),
  "utf8",
);
// The marker motion runtime, shared by both System Map renderers.
const regionalMotionSource = readFileSync(
  new URL("../src/app/regional-train-marker-motion.ts", import.meta.url),
  "utf8",
);
const ttcTrainMarkerLayerSource = readFileSync(
  new URL("../src/components/TtcTrainMarkerLayer.tsx", import.meta.url),
  "utf8",
);

describe("regional estimated train marker rendering", () => {
  it("uses the TTC vehicle glyph for regional corridor-coloured markers", () => {
    assert.match(ttcTrainMarkerLayerSource, /TRAIN_MARKER_BODY_PATH/);
    assert.match(regionalMapSource, /TRAIN_MARKER_BODY_PATH/);
    assert.match(regionalMapSource, /estimated-train-marker-outline/);
    assert.match(regionalMapSource, /estimated-train-marker-window/);
    assert.match(regionalMapSource, /estimated-train-marker-arrow/);
  });

  // Behaviour on the prepared corridors: regional-map-geometry.test.mjs.
  it("projects regional markers onto the authored segment path in root coordinates", () => {
    assert.match(regionalGeometrySource, /\["regional-route-up-path", "regional-route-up-airport-path"\]/);
    assert.match(regionalGeometrySource, /estimatedTrainMarkerLanePoint/);
    assert.match(regionalGeometrySource, /REGIONAL_TRAIN_MARKER_LANE_OFFSET/);
    assert.match(regionalMapSource, /REGIONAL_TRAIN_MARKER_LAYER_ID/);
    assert.doesNotMatch(regionalMapSource, /const x = from\.x \+ \(to\.x - from\.x\) \* progress/);
    assert.doesNotMatch(regionalGeometrySource, /const x = from\.x \+ \(to\.x - from\.x\) \* progress/);
    assert.doesNotMatch(regionalMapSource, /documentNode\.documentElement\.append\(markerLayer\)/);
  });

  it("uses path-relative directional lanes on both map modes", () => {
    assert.match(ttcTrainMarkerLayerSource, /estimatedTrainMarkerLanePoint/);
    assert.match(ttcTrainMarkerLayerSource, /TTC_TRAIN_MARKER_LANE_OFFSET/);
    assert.match(regionalGeometrySource, /pathStartsAtFrom \? "forward" : "reverse"/);
  });

  it("updates regional markers without rebuilding the map or replaying marker motion", () => {
    assert.match(regionalMapSource, /existingMarkersByKey/);
    assert.match(regionalMapSource, /estimatedTrainMarkerRenderKey\(marker\)/);
    assert.match(regionalMapSource, /existingMarkersByKey\.delete\(markerKey\)/);
    assert.doesNotMatch(regionalMapSource, /markerLayer\.replaceChildren\(\)/);
    assert.match(
      regionalMapSource,
      /\}, \[estimatedTrainMarkers, estimatedTrainsEnabled, mapEffectMotionPaused, networkSegments, svgMarkup\]\);/,
    );
    assert.match(regionalMapSource, /animateRegionalTrainMarker\(/);
    assert.match(regionalMotionSource, /estimatedTrainMarkerMotionWaypoints/);
    assert.match(regionalMotionSource, /targetObservationKey/);
    assert.match(regionalMapSource, /!mapEffectMotionPaused,/);
    assert.match(regionalMotionSource, /scheduleEstimatedTrainMarkerAnimation\(update\)/);
    assert.doesNotMatch(regionalMotionSource, /requestAnimationFrame\(update\)/);
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

describe("estimated train markers on the MapLibre System Map and Map View", async () => {
  const { regionalTrainMarkerRings, TRAIN_MARKER_SCALE } = await import("../src/app/regional-train-marker-shapes.ts");
  const {
    estimatedTrainMarkerZoomRange,
    trainMarkerIconSizeExpression,
    trainMarkerImageExpression,
    TRAIN_MARKER_IMAGE_LENGTHS,
  } = await import("../src/components/geographic-map-operations.ts");
  const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);
  const farthest = (ring, point) => ring.reduce((best, p) => (Math.hypot(p.x - point.x, p.y - point.y) > Math.hypot(best.x - point.x, best.y - point.y) ? p : best));

  it("places the glyph like the SVG transform: nose ahead of the point, rotated clockwise", () => {
    const point = { x: 1000, y: 500 };
    const east = regionalTrainMarkerRings(point, 0);
    const nose = farthest(east.body.slice(0, 5), point);
    near(nose.x, point.x + 36 * TRAIN_MARKER_SCALE, "east nose x");
    near(nose.y, point.y, "east nose y");
    // rotate(90) in SVG (y down) turns the nose to point down the screen.
    const south = farthest(regionalTrainMarkerRings(point, 90).body.slice(0, 5), point);
    near(south.x, point.x, "south nose x");
    near(south.y, point.y + 36 * TRAIN_MARKER_SCALE, "south nose y");
  });

  it("draws the body, three windows and the arrow as closed rings", () => {
    const rings = regionalTrainMarkerRings({ x: 0, y: 0 }, 30);
    assert.equal(rings.windows.length, 3);
    for (const ring of [rings.body, rings.arrow, ...rings.windows]) {
      assert.deepEqual(ring.at(-1), ring[0]);
      assert.ok(ring.length >= 4);
    }
  });

  it("shows GO/UP trains in Map View at the network's fitted zoom, and TTC's once the city is zoomed in", () => {
    assert.ok(estimatedTrainMarkerZoomRange("regional").minZoom <= 9, "GO/UP Map View opens near zoom 9");
    assert.equal(estimatedTrainMarkerZoomRange("ttc").minZoom, 10.5);
  });

  it("never shrinks a Map View train image below 75% of its drawn size, and grows it steadily", () => {
    for (const network of ["regional", "ttc"]) {
      const { minZoom, lengths } = estimatedTrainMarkerZoomRange(network);
      const [, , , ...sizeStops] = trainMarkerIconSizeExpression(lengths);
      const [, , firstImage, ...imageStops] = trainMarkerImageExpression(lengths);
      const imageAt = (zoom) => {
        let image = firstImage;
        for (let index = 0; index < imageStops.length; index += 2) if (zoom >= imageStops[index]) image = imageStops[index + 1];
        return Number(image.at(-1).slice(1));
      };
      const sizeAt = (zoom) => {
        for (let index = 2; index < sizeStops.length; index += 2) {
          const [z0, s0, z1, s1] = sizeStops.slice(index - 2, index + 2);
          if (zoom <= z1) return s0 + ((zoom - z0) / (z1 - z0)) * (s1 - s0);
        }
        return sizeStops.at(-1);
      };
      let previousLength = 0;
      for (let zoom = minZoom; zoom <= 18; zoom += 0.05) {
        const size = sizeAt(zoom);
        assert.ok(size >= 0.75 && size <= 1.0001, `${network} z${zoom.toFixed(2)} icon-size ${size}`);
        const length = size * imageAt(zoom);
        assert.ok(length >= previousLength - 0.05, `${network} marker shrinks at z${zoom.toFixed(2)}`);
        previousLength = length;
      }
      assert.deepEqual([...TRAIN_MARKER_IMAGE_LENGTHS], [26, 34, 42]);
    }
  });
});

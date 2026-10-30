import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  MAP_GEOMETRY_FORMAT,
  MAP_GEOMETRY_SOURCES,
  stationLabelCenter,
  stationLabelPolygon,
} from "../src/app/map-geometry-data.ts";
import { trackGuideKey } from "../src/app/map-geometry.ts";
import {
  ttcGuidePaths,
  ttcStationCenters,
  ttcStationLabelPolygons,
} from "../src/app/ttc-map-geometry.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));

describe("prepared System Map geometry", () => {
  for (const [map, source] of Object.entries(MAP_GEOMETRY_SOURCES)) {
    it(`${map} geometry matches its authored SVG (npm run prepare:map-geometry after changing it)`, () => {
      const geometry = JSON.parse(read(source.geometry).toString("utf8"));
      assert.equal(geometry.format, MAP_GEOMETRY_FORMAT);
      assert.equal(geometry.map, map);
      assert.equal(geometry.source.sha256, createHash("sha256").update(read(source.svg)).digest("hex"));
    });
  }

  it("holds every station's dots, name and the routes in both maps", () => {
    for (const source of Object.values(MAP_GEOMETRY_SOURCES)) {
      const geometry = JSON.parse(read(source.geometry).toString("utf8"));
      const stationIds = geometry.stations.map((station) => station.id.replace(/^station-/, ""));
      assert.ok(geometry.stations.every((station) => station.anchors.length > 0));
      // A name labels its station, or each of its dots (TTC's Spadina-1 and -2).
      const labelled = (stationId) => stationIds.some((id) => id === stationId || id.startsWith(`${stationId}-`));
      assert.ok(geometry.labels.every((label) => labelled(label.stationId)), source.geometry);
      assert.ok(geometry.lines.length > 0);
      assert.ok(geometry.artwork.labels.length > 0 && geometry.artwork.boxes.length > 0);
    }
  });
});

describe("station name boxes", () => {
  // Two names along one 45° line, and a level name whose own box would sit
  // just after the first if frames were mixed up.
  const rotated = [Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2, Math.SQRT1_2, 0, 0];
  const labels = [
    { stationId: "a", name: "A", box: { x: 0, y: 0, width: 100, height: 20 }, matrix: rotated },
    { stationId: "b", name: "B", box: { x: 130, y: 0, width: 100, height: 20 }, matrix: rotated },
    { stationId: "c", name: "C", box: { x: 110, y: 0, width: 100, height: 20 }, matrix: [1, 0, 0, 1, 5000, 5000] },
  ];
  const padding = { leading: 0, trailing: 80, y: 10 };
  const widthOf = (polygon) => Math.hypot(polygon[1].x - polygon[0].x, polygon[1].y - polygon[0].y);

  it("leaves trailing room only up to the next name along its line, read in the name's own frame", () => {
    // B starts 30 after A ends, so A keeps 28 of its 80.
    assert.ok(Math.abs(widthOf(stationLabelPolygon(labels, "a", padding)) - 128) < 1e-9);
    // Nothing follows B; C is far away on the map although its own box is near.
    assert.ok(Math.abs(widthOf(stationLabelPolygon(labels, "b", padding)) - 180) < 1e-9);
    assert.equal(stationLabelPolygon(labels, "missing", padding), null);
  });

  it("centres a name on its box", () => {
    const center = stationLabelCenter(labels, "c");
    assert.deepEqual(center, { x: 5160, y: 5010 });
  });
});

describe("TTC prepared geometry", () => {
  const geometry = JSON.parse(read(MAP_GEOMETRY_SOURCES.ttc.geometry).toString("utf8"));

  it("holds each line's track and the non-linear guides as root paths", () => {
    const guides = ttcGuidePaths(geometry);
    for (const lineId of ["line-1", "line-2", "line-4", "line-5", "line-6"]) {
      assert.match(guides.get(trackGuideKey(lineId)) ?? "", /^M [\d.]+ [\d.]+ L /);
    }
    assert.ok(guides.has("seg-line-1-st-andrew-union"));
  });

  it("finds station centres and every station name's box", () => {
    assert.deepEqual(ttcStationCenters(geometry, ["union", "missing"]), new Map([["union", geometry.anchors["station-union"]]]));
    const stationIds = geometry.labels.map((label) => label.stationId);
    const polygons = ttcStationLabelPolygons(geometry, stationIds);
    assert.equal(polygons.size, stationIds.length);
    assert.ok([...polygons.values()].every((polygon) => polygon.length === 4));
  });
});

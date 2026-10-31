import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { MAP_MANIFESTS } from "../src/app/map-manifests.ts";
import {
  mapStationArtwork,
  mapStationHoverShapes,
  mapStationSelectionShapes,
  mapStationShapeAnchorId,
  placeMapStations,
} from "../src/app/map-station-artwork.ts";

const geometry = (map) => JSON.parse(readFileSync(new URL(`../src/app/map-geometry/${map}.json`, import.meta.url), "utf8"));
const artworkFor = (map) => mapStationArtwork(geometry(map), MAP_MANIFESTS[map].stationPartSuffixes);
const near = (actual, expected, tolerance = 1) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `${actual} should be within ${tolerance} of ${expected}`,
);

describe("TTC station artwork", () => {
  const artwork = artworkFor("ttc");
  const station = (id) => artwork.find((candidate) => candidate.id === id);

  it("folds Spadina's two drawn dots into one station, each dot keeping its placement", () => {
    assert.equal(artwork.length, 109);
    assert.ok(!artwork.some((candidate) => /-[12]$/.test(candidate.id)));
    const spadina = station("spadina");
    assert.equal(spadina.transform, "");
    assert.deepEqual(spadina.shapes.map(mapStationShapeAnchorId), ["spadina-2", "spadina-1"]);
    assert.ok(spadina.shapes.every((shape) => /^matrix\(1\.102459 0 0 1\.102459 /.test(shape.transform)));
  });

  it("tells large stations from the artwork: terminals and interchanges, not Union or Spadina", () => {
    const large = artwork.filter((candidate) => candidate.large).map((candidate) => candidate.id).sort();
    assert.deepEqual(large, [
      "bloor-yonge", "cedarvale", "don-mills", "eglinton", "finch", "finch-west", "humber-college",
      "kennedy", "kipling", "mount-dennis", "sheppard-yonge", "st-george", "vaughan-metropolitan-centre",
    ]);
    assert.equal(station("union").large, false);
    assert.equal(station("spadina").large, false);
  });

  it("keeps TTC's hover and selection sizes", () => {
    // Formerly fixed radii: hover 46 (78 large), selection 38 (56 large).
    near(mapStationHoverShapes(station("museum"))[0].r, 46);
    near(mapStationSelectionShapes(station("museum"))[0].r, 38);
    near(mapStationHoverShapes(station("kipling"))[0].r, 78, 2);
    near(mapStationSelectionShapes(station("kipling"))[0].r, 56, 3);
  });

  it("keeps Spadina's two hover rings and selection markers apart", () => {
    const spadina = station("spadina");
    const [a, b] = geometry("ttc").stations
      .filter((candidate) => /^station-spadina-/.test(candidate.id))
      .map((candidate) => candidate.anchors[0]);
    const gap = Math.hypot(a.x - b.x, a.y - b.y);
    const scale = 1.102459;
    for (const shapes of [mapStationHoverShapes(spadina), mapStationSelectionShapes(spadina)]) {
      assert.equal(shapes.length, 2);
      // Prepared radii and centres are rounded to 0.01.
      assert.ok(shapes[0].r * scale + shapes[1].r * scale <= gap + 0.05, "the two dots' rings must not overlap");
    }
  });
});

describe("GO/UP station artwork", () => {
  const artwork = artworkFor("regional");
  const station = (id) => artwork.find((candidate) => candidate.id === id);

  it("reads each station's shapes from the prepared map, keeping a junction's authored transforms", () => {
    // A junction's own dots are part of its group, never stations of their own.
    assert.equal(artwork.length, geometry("regional").labels.length);
    assert.ok(!artwork.some((candidate) => /-(?:ki|up)$/.test(candidate.id)));
    const pickering = station("pickering");
    assert.equal(pickering.large, false);
    assert.match(pickering.transform, /^matrix\(1 0 0 1 /);
    assert.deepEqual(pickering.shapes.map((shape) => shape.tag), ["circle"]);
    assert.equal(station("union").large, true);
    assert.equal(station("niagara-falls").large, true);
    // Bloor's group is rotated; its connector bars keep their own rotation.
    const bloor = station("bloor");
    assert.doesNotMatch(bloor.transform, /^matrix\(1 0 0 1 /);
    assert.deepEqual(bloor.shapes.map((shape) => [shape.tag, Boolean(shape.transform), Boolean(shape.join)]), [
      ["rect", true, true],
      ["rect", true, true],
      ["circle", false, false],
      ["ellipse", false, false],
    ]);
  });

  it("grows hover rings and selection markers from the dots, without junction bars", () => {
    const pickering = station("pickering");
    const union = station("union");
    const bloor = station("bloor");
    const [dot] = pickering.shapes;
    assert.equal(mapStationHoverShapes(pickering)[0].r, dot.r * 1.45);
    assert.equal(mapStationSelectionShapes(pickering)[0].r, dot.r * 1.2);
    // Union's pill grows by one margin on every side and keeps its authored size when selected.
    const [pill] = union.shapes;
    const hover = mapStationHoverShapes(union)[0];
    const pad = pill.x - hover.x;
    near(pad, 81);
    const expected = [pill.y - pad, pill.width + pad * 2, pill.height + pad * 2, pill.rx + pad];
    [hover.y, hover.width, hover.height, hover.rx].forEach((value, index) => near(value, expected[index], 1e-6));
    assert.deepEqual(mapStationSelectionShapes(union)[0], pill);
    assert.deepEqual(mapStationHoverShapes(bloor).map((shape) => shape.tag), ["circle", "ellipse"]);
    assert.deepEqual(mapStationSelectionShapes(bloor).map((shape) => shape.tag), ["circle", "ellipse"]);
    assert.deepEqual(bloor.shapes.map(mapStationShapeAnchorId), [null, null, "bloor-ki", "bloor-up"]);
  });
});

describe("placing stations", () => {
  const artwork = artworkFor("ttc");

  it("draws targets only for stations with data, reusing the artwork objects", () => {
    const placed = placeMapStations(artwork, [{ id: "museum", name: "Museum" }, { id: "nowhere", name: "Nowhere" }]);
    assert.deepEqual(placed.map(({ artwork: station, name }) => [station.id, name]), [["museum", "Museum"]]);
    assert.equal(placed[0].artwork, artwork.find((station) => station.id === "museum"));
  });

  it("places a station the artwork lacks at its data position, as a regular dot", () => {
    const [placed] = placeMapStations(artwork, [{ id: "stub", name: "Stub", fallbackPoint: { x: 10, y: 20 } }]);
    assert.equal(placed.artwork.large, false);
    assert.deepEqual(placed.artwork.shapes, [{ tag: "circle", id: "station-stub", cx: 10, cy: 20, r: placed.artwork.dotRadius }]);
    near(placed.artwork.dotRadius, 32);
  });
});

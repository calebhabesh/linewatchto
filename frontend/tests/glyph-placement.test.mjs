import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cutoutStopsAlong, dotStopsAlong, glyphDistances, laneGlyphs } from "../src/components/map-overlays/glyph-placement.ts";

const round = (values) => values.map((value) => Math.round(value * 100) / 100);
const dot = (x, y, radius = 20) => ({ x, y, radius });

describe("alert glyph placement", () => {
  const stops = (...alongs) => alongs.map((along) => ({ along, radius: 0 }));

  it("centres glyphs in each gap between stops, never on a stop or past an end", () => {
    // Stations at 0, 93, 186 and 279: one glyph in each gap, midway.
    assert.deepEqual(round(glyphDistances(279, stops(93, 186), 88)), [46.5, 139.5, 232.5]);
    // A long gap is cut into equal slots about a step long.
    assert.deepEqual(round(glyphDistances(400, [], 88)), [40, 120, 200, 280, 360]);
    for (const distance of glyphDistances(1000, stops(130, 470, 610), 88)) {
      assert.ok(distance > 0 && distance < 1000);
      for (const stop of [0, 130, 470, 610, 1000]) assert.ok(Math.abs(distance - stop) >= 88 / 3);
    }
  });

  it("keeps glyphs clear of each station dot's edge", () => {
    // Line 1's U: stations 137 apart, dots 36 across their radius. Glyphs
    // spaced from the dots' centres sat two to a gap, half under the dots.
    const yonge = [0, 137, 274, 411].map((along) => ({ along, radius: 36 }));
    assert.deepEqual(round(glyphDistances(411, yonge, 88)), [68.5, 205.5, 342.5]);
    // GO/UP: stations about 486 apart, dots 73 across their radius, a 180 step.
    const lakeshore = [0, 486].map((along) => ({ along, radius: 73 }));
    const glyphs = glyphDistances(486, lakeshore, 180);
    assert.equal(glyphs.length, 2);
    for (const distance of glyphs) assert.ok(distance - 73 >= 80 && 486 - 73 - distance >= 80);
  });

  it("spaces glyphs by their stations, not by where the alert starts", () => {
    // Two alerts over the same stations, one starting a station earlier
    // (Line 1's two suspensions down the Yonge side of the U): where they
    // overlap, their glyphs coincide instead of doubling up.
    const dot = (along) => ({ along, radius: 36 });
    const longer = glyphDistances(548, [0, 137, 274, 411, 548].map(dot), 88);
    const shorter = glyphDistances(411, [0, 137, 274, 411].map(dot), 88).map((distance) => distance + 137);
    assert.deepEqual(round(longer.slice(1)), round(shorter));
  });

  it("leaves the stretch between a station's two dots empty, but always shows a short alert", () => {
    const twoDots = [{ along: 90, radius: 20 }, { along: 110, radius: 20 }];
    assert.deepEqual(round(glyphDistances(200, twoDots, 88)), [35, 165]);
    assert.deepEqual(glyphDistances(30, [], 88), [15]);
    assert.deepEqual(glyphDistances(60, [{ along: 0, radius: 36 }, { along: 60, radius: 36 }], 88), [30]);
    assert.deepEqual(glyphDistances(0, [], 88), []);
  });

  it("puts whole icon-and-arrow pairs in every gap", () => {
    assert.deepEqual(round(glyphDistances(224, [], 112, [0.25, 0.75])), [28, 84, 140, 196]);
    assert.deepEqual(round(glyphDistances(186, stops(93), 112, [0.25, 0.75])), [23.25, 69.75, 116.25, 162.75]);
  });

  it("finds the station dots a path passes through", () => {
    const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const dots = [dot(50, 3), dot(100, 60), dot(50, 60), dot(300, 0)];
    assert.deepEqual(dotStopsAlong(points, dots), [{ along: 50, radius: 20 }, { along: 160, radius: 20 }]);
  });

  it("lets a terminal dot past the path's end reach in only as far as its edge", () => {
    // Finch: the track stops 53 short of a 66-unit dot's centre.
    const points = [{ x: 0, y: 53 }, { x: 0, y: 300 }];
    assert.deepEqual(dotStopsAlong(points, [dot(0, 0, 66)]), [{ along: 6.5, radius: 6.5 }]);
    assert.deepEqual(dotStopsAlong(points, [dot(0, 353, 66)]), [{ along: 240.5, radius: 6.5 }]);
  });

  it("treats the stretch inside a pill station as one stop", () => {
    // GO/UP's Union: a 60 x 200 pill with a 10-unit border, crossed and entered.
    const pill = { x: 100, y: -100, width: 60, height: 200, rx: 30, ry: 30, strokeWidth: 10 };
    assert.deepEqual(cutoutStopsAlong([{ x: 0, y: 0 }, { x: 300, y: 0 }], [pill]), [{ along: 130, radius: 35 }]);
    assert.deepEqual(cutoutStopsAlong([{ x: 0, y: 0 }, { x: 130, y: 0 }], [pill]), [{ along: 112.5, radius: 17.5 }]);
    assert.deepEqual(cutoutStopsAlong([{ x: 0, y: 200 }, { x: 300, y: 200 }], [pill]), []);
    const glyphs = laneGlyphs("M 0 0 L 130 0", { step: 40, cutouts: [pill] });
    assert.ok(glyphs.every(({ x }) => x < 95));
  });

  it("lays a lane out between the dots it passes, heading the travel way", () => {
    const path = "M 0 0 L 186 0";
    const forward = laneGlyphs(path, { step: 88, dots: [dot(93, 0, 13)] });
    assert.deepEqual(forward.map(({ x, y, rotation }) => [x, y, rotation]), [[40, 0, 0], [146, 0, 0]]);
    const reverse = laneGlyphs(path, { step: 88, dots: [dot(93, 0, 13)], direction: "reverse" });
    assert.deepEqual(reverse.map(({ x, rotation }) => [x, rotation]), [[146, 180], [40, 180]]);
  });

  it("reads paired lanes icon first in travel order, both ways", () => {
    const forward = laneGlyphs("M 0 0 L 112 0", { step: 112, pattern: [0.25, 0.75] });
    assert.deepEqual(forward.map(({ x }) => x), [28, 84]);
    const reverse = laneGlyphs("M 0 0 L 112 0", { step: 112, pattern: [0.25, 0.75], direction: "reverse" });
    assert.deepEqual(reverse.map(({ x }) => x), [84, 28]);
  });

  it("lays each subpath out on its own, with nothing across the jump between them", () => {
    const glyphs = laneGlyphs("M 0 0 L 100 0 M 50 50 L 50 150", { step: 100 });
    assert.deepEqual(glyphs.map(({ x, y }) => [x, y]), [[50, 0], [50, 100]]);
  });

  it("keeps a branch's glyphs and its trunk's clear of the fork between them", () => {
    // The trunk turns east at (0, 200); the branch carries on south from there.
    const trunk = "M 0 0 L 0 200 L 200 200";
    const branch = "M 0 200 L 0 400";
    const glyphs = laneGlyphs(`${trunk} ${branch}`, { step: 100 });
    for (const { x, y } of glyphs) assert.ok(Math.hypot(x, y - 200) >= 60, `${x}, ${y} crowds the fork`);
    for (const [index, a] of glyphs.entries()) {
      for (const b of glyphs.slice(index + 1)) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 70);
    }
  });

  it("stands glyphs off a sharp corner, but not off a curve's small turns", () => {
    // A right angle: spaced only along the path, the two glyphs either side
    // of it sat 0.7 of a step apart.
    const corner = laneGlyphs("M 0 0 L 0 300 L 300 300", { step: 100 });
    for (const [index, a] of corner.entries()) {
      for (const b of corner.slice(index + 1)) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 90);
    }
    // A gentle bend in 10-degree steps lays out as one stretch.
    const points = Array.from({ length: 10 }, (_, index) => {
      const angle = index * Math.PI / 18;
      return `${index === 0 ? "M" : "L"} ${100 * Math.sin(angle)} ${100 - 100 * Math.cos(angle)}`;
    }).join(" ");
    const curve = laneGlyphs(points, { step: 50 });
    const gaps = curve.slice(1).map((glyph, index) => Math.hypot(glyph.x - curve[index].x, glyph.y - curve[index].y));
    assert.ok(Math.max(...gaps) - Math.min(...gaps) < 1);
  });

  it("puts a two-way lane's rows side by side, either side of the rail", () => {
    const forward = laneGlyphs("M 0 0 L 112 0", { step: 56, offset: -18 });
    const reverse = laneGlyphs("M 0 0 L 112 0", { step: 56, offset: 18, direction: "reverse" });
    assert.deepEqual(forward.map(({ x, y }) => [x, y]), [[28, -18], [84, -18]]);
    assert.deepEqual(reverse.map(({ x, y }) => [x, y]), [[84, 18], [28, 18]]);
  });
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createSdfImageData } from "../src/components/map-sprite-sdf.ts";
import { generateOverlapBadgeSvg } from "../src/components/map-overlap-svg.ts";

const frontendRoot = fileURLToPath(new URL("..", import.meta.url));

describe("geographic map sprite sharpness", () => {
  it("feeds genuine distance fields to MapLibre for recolourable arrows", async () => {
    const source = await readFile(
      `${frontendRoot}/src/components/geographic-map-operations.ts`,
      "utf8",
    );

    assert.match(
      source,
      /map\.addImage\("direction-arrow", createSdfImageData\(imgData\), \{ sdf: true, pixelRatio: 2 \}\)/,
    );
    assert.match(
      source,
      /map\.addImage\("direction-arrow-bidirectional", createSdfImageData\(imgData\), \{ sdf: true, pixelRatio: 2 \}\)/,
    );
  });

  it("encodes a smooth signed-distance gradient instead of a binary alpha mask", () => {
    const width = 17;
    const height = 17;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 5; y <= 11; y += 1) {
      for (let x = 5; x <= 11; x += 1) data[(y * width + x) * 4 + 3] = 255;
    }

    const sdf = createSdfImageData({ width, height, data });
    const alphaAt = (x, y) => sdf.data[(y * width + x) * 4 + 3];
    const uniqueAlphas = new Set(Array.from(sdf.data.filter((_value, index) => index % 4 === 3)));

    assert.ok(alphaAt(0, 0) < alphaAt(4, 8));
    assert.ok(alphaAt(4, 8) < alphaAt(8, 8));
    assert.ok(uniqueAlphas.size > 8, "SDF should contain a useful interpolation gradient");
  });

  it("registers alert badges at their final logical size and the screen's density", async () => {
    const source = await readFile(
      `${frontendRoot}/src/components/geographic-map-operations.ts`,
      "utf8",
    );

    // A 3x image shrunk to a 1x screen samples unevenly: the outline looked grainy.
    assert.match(source, /const pixelRatio = mapBadgePixelRatio\(\);\s+const svg = generateOverlapBadgeSvg\(badgeInfo, pixelRatio\);/);
    assert.match(source, /map\.addImage\(key, img, \{ pixelRatio \}\)/);
    assert.match(source, /"icon-size": 1/);
    assert.doesNotMatch(source, /"icon-size": 0\.25/);
  });

  it("draws a badge image with room for its whole outline, at the given density", () => {
    const badge = { kindCounts: [{ kind: "suspension", count: 1 }], isSelected: true };
    const size = (svg) => {
      const [, width, height] = svg.match(/^<svg[^>]* width="(\d+)" height="(\d+)" viewBox="([^"]+)"/);
      const [x, y, viewWidth, viewHeight] = svg.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
      return { width: Number(width), height: Number(height), x, y, viewWidth, viewHeight };
    };
    const atOne = size(generateOverlapBadgeSvg(badge, 1));
    const atThree = size(generateOverlapBadgeSvg(badge, 3));
    // The pill is 135 units across; its 6-unit outline reaches 3 units past it.
    assert.ok(atOne.viewWidth >= 135 + 6 && atOne.x <= -(135 / 2 + 3));
    assert.equal(atOne.width, Math.round(atOne.viewWidth * 0.25));
    assert.equal(atThree.width, Math.round(atThree.viewWidth * 0.75));
  });
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createSdfImageData } from "../src/components/map-sprite-sdf.ts";

const frontendRoot = fileURLToPath(new URL("..", import.meta.url));

describe("geographic map sprite sharpness", () => {
  it("feeds genuine distance fields to MapLibre for recolourable arrows", async () => {
    const source = await readFile(
      `${frontendRoot}/src/components/GeographicNetworkMap.tsx`,
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
    assert.match(
      source,
      /map\.addImage\("train-arrow", createSdfImageData\(imgData\), \{ sdf: true, pixelRatio: 3 \}\)/,
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

  it("registers alert badges at their final logical size", async () => {
    const source = await readFile(
      `${frontendRoot}/src/components/GeographicNetworkMap.tsx`,
      "utf8",
    );

    assert.match(source, /pixelRatio: MAP_BADGE_PIXEL_RATIO/);
    assert.match(source, /"icon-size": 1/);
    assert.doesNotMatch(source, /"icon-size": 0\.25/);
  });
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";

const moduleUrl = new URL("../src/components/station-map-visuals.ts", import.meta.url);

async function loadStationMapVisuals() {
  assert.equal(
    existsSync(moduleUrl),
    true,
    "station-map-visuals.ts must define logical-to-visual station anchors",
  );
  return import(moduleUrl.href);
}

describe("station map visuals", () => {
  it("maps Spadina to its separate Line 1 and Line 2 SVG anchors", async () => {
    const { stationVisualAnchorIds, stationVisualCenterIds } = await loadStationMapVisuals();

    assert.deepEqual(stationVisualAnchorIds("spadina"), ["spadina-1", "spadina-2"]);
    assert.deepEqual(stationVisualCenterIds([{ id: "union" }, { id: "spadina" }]), [
      "union",
      "spadina-1",
      "spadina-2",
    ]);
  });

  it("resolves both Spadina points without changing its logical station ID", async () => {
    const { stationVisualAnchorsFor } = await loadStationMapVisuals();
    const centers = new Map([
      ["spadina-1", { x: 3740, y: 2524 }],
      ["spadina-2", { x: 3740, y: 2603 }],
    ]);

    assert.deepEqual(
      stationVisualAnchorsFor(
        { id: "spadina", mapX: 3740, mapY: 2564 },
        centers,
      ),
      [
        { id: "spadina-1", point: { x: 3740, y: 2524 } },
        { id: "spadina-2", point: { x: 3740, y: 2603 } },
      ],
    );
  });

  it("keeps ordinary stations on one anchor and safely falls back when special geometry is incomplete", async () => {
    const { stationVisualAnchorIds, stationVisualAnchorsFor } = await loadStationMapVisuals();

    assert.deepEqual(stationVisualAnchorIds("union"), ["union"]);
    assert.deepEqual(
      stationVisualAnchorsFor(
        { id: "union", mapX: 4311, mapY: 3597 },
        new Map([["union", { x: 4311, y: 3597 }]]),
      ),
      [{ id: "union", point: { x: 4311, y: 3597 } }],
    );
    assert.deepEqual(
      stationVisualAnchorsFor(
        { id: "spadina", mapX: 3740, mapY: 2564 },
        new Map([["spadina-1", { x: 3740, y: 2524 }]]),
      ),
      [{ id: "spadina", point: { x: 3740, y: 2564 } }],
    );
  });
});

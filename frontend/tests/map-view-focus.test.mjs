import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mapViewFocusKey } from "../src/app/map-view-focus.ts";

const nothing = { network: "ttc", selection: null, selectedStationId: null, selectionAttentionGeneration: 0 };
const alert = { kind: "delay", id: "delay-1" };

describe("mapViewFocusKey", () => {
  it("is null with nothing focused", () => {
    assert.equal(mapViewFocusKey(nothing), null);
  });

  it("stays the same for an unchanged focus", () => {
    const state = { ...nothing, selection: alert, selectionAttentionGeneration: 3 };
    assert.equal(mapViewFocusKey(state), mapViewFocusKey({ ...state, selection: { ...alert } }));
  });

  it("differs for every kind of focus, for View pressed again, and per network", () => {
    const route = { stopCodes: [], routes: [{ layer: "bus", route: "29" }] };
    const keys = [
      { ...nothing, selection: alert },
      { ...nothing, selection: alert, selectionAttentionGeneration: 1 },
      { ...nothing, selection: alert, network: "regional" },
      { ...nothing, selectedStationId: "union" },
      { ...nothing, commutePathPreview: { id: "c", legId: "l" } },
      { ...nothing, selectedSurfaceStopCode: "465" },
      { ...nothing, surfaceSelection: route },
      { ...nothing, selectedSurfaceStopCode: "465", surfaceSelection: route },
    ].map(mapViewFocusKey);
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(keys.every(Boolean));
  });
});

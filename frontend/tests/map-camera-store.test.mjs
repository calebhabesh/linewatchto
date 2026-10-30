import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMapCameraStore } from "../src/components/map-camera/camera-store.ts";

describe("map camera store", () => {
  it("notifies readers once per changed commit and keeps the snapshot stable", () => {
    const store = createMapCameraStore({ x: 0, y: 0, scale: 1 });
    const first = store.get();
    let notified = 0;
    const unsubscribe = store.subscribe(() => { notified += 1; });

    store.set({ x: 0, y: 0, scale: 1 });
    assert.equal(notified, 0, "an unchanged camera is not a commit");
    assert.equal(store.get(), first, "the snapshot keeps its identity");

    store.set({ x: 10, y: 0, scale: 1 });
    assert.equal(notified, 1);
    assert.deepEqual(store.get(), { x: 10, y: 0, scale: 1 });

    unsubscribe();
    store.set({ x: 20, y: 0, scale: 1 });
    assert.equal(notified, 1);
  });
});

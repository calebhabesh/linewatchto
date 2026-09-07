import assert from "node:assert/strict";
import { test } from "node:test";
import { startMapSurfaceTransition } from "../src/app/map-surface-transition.ts";

function mapSurface() {
  const animations = [];
  const surface = {
    dataset: {},
    animate(keyframes, options) {
      const completion = Promise.withResolvers();
      const animation = {
        keyframes, options,
        finished: completion.promise,
        complete: completion.resolve,
        cancel: () => completion.reject(new Error("cancelled")),
      };
      animations.push(animation);
      return animation;
    },
  };
  return { surface, animations };
}

test("map entrance waits for readiness and preserves both slide directions", async () => {
  for (const direction of ["forward", "back"]) {
    const { surface, animations } = mapSurface();
    let updates = 0;
    const transition = startMapSurfaceTransition(surface, direction, () => updates++);
    transition.mapReady(); // An outgoing map's late ready callback is irrelevant.
    animations[0].complete();
    await Promise.resolve();
    assert.equal(updates, 1);
    assert.equal(surface.dataset.mapSurfaceTransition, "loading");
    assert.equal(animations.length, 1);
    transition.mapReady();
    await Promise.resolve();
    assert.equal(surface.dataset.mapSurfaceTransition, "entering");
    assert.equal(animations[1].keyframes[0].transform,
      `translate3d(${direction === "forward" ? "100%" : "-100%"}, 0, 0)`);
    animations[1].complete();
    await transition.finished;
    assert.deepEqual(surface.dataset, {});
  }
});

test("cancellation before the fade completes cannot commit a stale network", async () => {
  const { surface } = mapSurface();
  let updates = 0;
  const transition = startMapSurfaceTransition(surface, "forward", () => updates++);
  transition.cancel();
  await transition.finished;
  assert.equal(updates, 0);
  assert.deepEqual(surface.dataset, {});
});

test("cancelling while assets load releases the hidden surface without a late entrance", async () => {
  const { surface, animations } = mapSurface();
  const transition = startMapSurfaceTransition(surface, "forward", () => {});
  animations[0].complete();
  await Promise.resolve();
  transition.cancel();
  await transition.finished;
  transition.mapReady();
  assert.equal(animations.length, 1);
  assert.deepEqual(surface.dataset, {});
});

test("an unavailable map cannot leave the surface hidden indefinitely", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { surface, animations } = mapSurface();
  const transition = startMapSurfaceTransition(surface, "forward", () => {});
  animations[0].complete();
  await Promise.resolve();
  t.mock.timers.tick(4000);
  await Promise.resolve();
  assert.equal(surface.dataset.mapSurfaceTransition, "entering");
  animations[1].complete();
  await transition.finished;
  assert.deepEqual(surface.dataset, {});
});

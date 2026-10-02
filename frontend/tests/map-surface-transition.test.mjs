import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startMapSurfaceTransition } from '../src/app/map-surface-transition.ts';

function mapSurface() {
  const animations = [];
  const surface = {
    dataset: {},
    animate() { throw new Error('Shared controls must never fade'); },
    querySelector() { return artwork; },
  };
  const artwork = {
    animate(keyframes, options) {
      const completion = Promise.withResolvers();
      const animation = { keyframes, options, finished: completion.promise,
        complete: completion.resolve, cancel: () => completion.reject(new Error('cancelled')) };
      animations.push(animation);
      return animation;
    },
  };
  return { surface, animations };
}
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('keeps the current map visible until preparation finishes, then fades without translation', async () => {
  const { surface, animations } = mapSurface();
  const preparation = Promise.withResolvers();
  let updates = 0;
  const transition = startMapSurfaceTransition(surface, {
    prepare: () => preparation.promise, update: () => updates++,
  });
  assert.equal(surface.dataset.mapSurfaceTransition, 'loading');
  assert.equal(animations.length, 0);
  assert.equal(updates, 0);
  preparation.resolve();
  await tick();
  assert.deepEqual(animations[0].keyframes, [{ opacity: 1 }, { opacity: 0 }]);
  assert.equal(animations[0].options.duration, 100);
  animations[0].complete();
  await tick();
  assert.equal(updates, 1);
  assert.deepEqual(animations[1].keyframes, [{ opacity: 0 }, { opacity: 1 }]);
  assert.equal(animations[1].options.duration, 150);
  animations[1].complete();
  await transition.finished;
  assert.deepEqual(surface.dataset, {});
});

test('cancelling preparation cannot commit a stale choice or erase a replacement transition', async () => {
  const { surface, animations } = mapSurface();
  let updates = 0;
  const first = startMapSurfaceTransition(surface, { prepare: () => new Promise(() => {}), update: () => updates++ });
  first.cancel();
  const second = startMapSurfaceTransition(surface, { prepare: () => new Promise(() => {}), update: () => updates++ });
  await first.finished;
  assert.equal(updates, 0);
  assert.equal(animations.length, 0);
  assert.equal(surface.dataset.mapSurfaceTransition, 'loading');
  second.cancel();
  await second.finished;
  assert.deepEqual(surface.dataset, {});
});

test('a preparation failure retains the current network and releases the transition', async () => {
  const { surface, animations } = mapSurface();
  let updates = 0;
  const transition = startMapSurfaceTransition(surface, {
    prepare: () => Promise.reject(new Error('unavailable')), update: () => updates++,
  });
  await assert.rejects(transition.finished, /unavailable/);
  assert.equal(updates, 0);
  assert.equal(animations.length, 0);
  assert.deepEqual(surface.dataset, {});
});

test('preparation has a bounded timeout without hiding or committing the destination', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { surface, animations } = mapSurface();
  let updates = 0;
  const transition = startMapSurfaceTransition(surface, { prepare: () => new Promise(() => {}), update: () => updates++ });
  const result = assert.rejects(transition.finished, /timed out/);
  t.mock.timers.tick(12000);
  await result;
  assert.equal(updates, 0);
  assert.equal(animations.length, 0);
  assert.deepEqual(surface.dataset, {});
});

test('reduced motion still prepares the map but commits without animations', async () => {
  const { surface, animations } = mapSurface();
  let updates = 0;
  const transition = startMapSurfaceTransition(surface, { prepare: async () => {}, update: () => updates++, reducedMotion: true });
  await transition.finished;
  assert.equal(updates, 1);
  assert.equal(animations.length, 0);
  assert.deepEqual(surface.dataset, {});
});

test('geographic layer replacement waits for rendered sources before fading in', async () => {
  const { surface, animations } = mapSurface();
  const fades = [];
  const transition = startMapSurfaceTransition(surface, {
    prepare: async () => {}, update: () => {}, waitForReady: true,
    fade: { fade: async opacity => { fades.push(opacity); }, reset() {} },
  });
  transition.mapReady(); // An outgoing map's readiness is irrelevant.
  await tick();
  assert.deepEqual(fades, [0]);
  transition.mapReady();
  await transition.finished;
  assert.deepEqual(fades, [0, 1]);
  assert.equal(animations.length, 0);
});

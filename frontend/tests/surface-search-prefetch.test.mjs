import assert from "node:assert/strict";
import { test } from "node:test";
import { prefetchSurfaceSearchIndexes } from "../src/app/surface-search-index.ts";

function environment(overrides = {}) {
  const calls = { loads: [], idle: null };
  return {
    calls,
    env: {
      onLine: true, saveData: false, effectiveType: "4g",
      whenIdle: (task) => { calls.idle = task; return () => { calls.idle = null; }; },
      load: async (network) => { calls.loads.push(network); },
      ...overrides,
    },
  };
}

test("search indexes load at idle, the selected network first", async () => {
  const { calls, env } = environment();
  prefetchSurfaceSearchIndexes("regional", env);
  assert.deepEqual(calls.loads, [], "nothing before the page is idle");
  calls.idle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls.loads, ["regional", "ttc"]);
});

test("a failed index does not stop the other", async () => {
  const { calls, env } = environment({ load: async (network) => { calls.loads.push(network); throw new Error("offline"); } });
  prefetchSurfaceSearchIndexes("ttc", env);
  calls.idle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls.loads, ["ttc", "regional"]);
});

test("no prefetch offline, with Save-Data, or on 2G", () => {
  for (const overrides of [{ onLine: false }, { saveData: true }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }]) {
    const { calls, env } = environment(overrides);
    prefetchSurfaceSearchIndexes("ttc", env);
    assert.equal(calls.idle, null, JSON.stringify(overrides));
  }
});

test("cancelling before idle loads nothing", async () => {
  const { calls, env } = environment();
  let task;
  env.whenIdle = (t) => { task = t; return () => {}; };
  const cancel = prefetchSurfaceSearchIndexes("ttc", env);
  cancel();
  task();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(calls.loads, []);
});

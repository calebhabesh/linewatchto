import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createNewEndpointVerifier,
  MAX_NEW_ENDPOINT_VERIFICATIONS,
  NEW_ENDPOINT_VERIFICATION_DELAYS_MS,
} from "../src/app/push-endpoint-verification.ts";

function fakeScheduler() {
  const pending = new Map();
  let next = 0;
  return {
    schedule: (callback, delay) => {
      next += 1;
      pending.set(next, { callback, delay });
      return next;
    },
    cancel: (timer) => pending.delete(timer),
    delays: () => [...pending.values()].map((entry) => entry.delay),
    runAll: () => {
      const entries = [...pending.values()];
      pending.clear();
      entries.forEach((entry) => entry.callback());
    },
  };
}

describe("new push endpoint verification", () => {
  it("re-checks an endpoint the page obtained after catch-up has had time to test it", async () => {
    const timers = fakeScheduler();
    let verified = 0;
    const verifier = createNewEndpointVerifier({ verify: async () => { verified += 1; }, ...timers });

    verifier.endpointSaved("restored-missing");
    assert.deepEqual(timers.delays(), [...NEW_ENDPOINT_VERIFICATION_DELAYS_MS]);
    timers.runAll();
    await Promise.resolve();
    assert.equal(verified, NEW_ENDPOINT_VERIFICATION_DELAYS_MS.length);
  });

  it("does not re-check plain refreshes or a rider's own enable", () => {
    const timers = fakeScheduler();
    const verifier = createNewEndpointVerifier({ verify: async () => undefined, ...timers });
    verifier.endpointSaved("refreshed");
    verifier.endpointSaved("user-enabled");
    assert.deepEqual(timers.delays(), []);
  });

  it("lets a replacement supersede earlier checks, up to a bounded number of endpoints", () => {
    const timers = fakeScheduler();
    const verifier = createNewEndpointVerifier({ verify: async () => undefined, ...timers });
    verifier.endpointSaved("restored-missing");
    verifier.endpointSaved("invalid-endpoint-replacement");
    assert.equal(timers.delays().length, NEW_ENDPOINT_VERIFICATION_DELAYS_MS.length);
    for (let index = 2; index < MAX_NEW_ENDPOINT_VERIFICATIONS; index += 1) {
      verifier.endpointSaved("invalid-endpoint-replacement");
    }
    timers.runAll();
    verifier.endpointSaved("invalid-endpoint-replacement");
    assert.deepEqual(timers.delays(), []);
  });

  it("stops when disposed and survives a failed check", async () => {
    const timers = fakeScheduler();
    const warn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args);
    try {
      const verifier = createNewEndpointVerifier({ verify: async () => { throw new Error("offline"); }, ...timers });
      verifier.endpointSaved("endpoint-replaced");
      timers.runAll();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(warnings.length, NEW_ENDPOINT_VERIFICATION_DELAYS_MS.length);

      verifier.endpointSaved("endpoint-replaced");
      verifier.dispose();
      assert.deepEqual(timers.delays(), []);
    } finally {
      console.warn = warn;
    }
  });
});

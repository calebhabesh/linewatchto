import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getCurrentPushSubscription,
  unregisterServiceWorkersWithoutPushSubscriptions,
} from "../src/app/push-browser-state.ts";

describe("browser push subscription state", () => {
  it("waits for service worker readiness before treating browser push as off", async () => {
    const subscription = { endpoint: "https://push.example/subscription" };
    const readyRegistration = {
      pushManager: {
        getSubscription: async () => subscription,
      },
    };
    const serviceWorker = {
      getRegistration: async () => undefined,
      ready: Promise.resolve(readyRegistration),
      register: async () => {
        throw new Error("should not register when an existing worker becomes ready");
      },
    };

    const result = await getCurrentPushSubscription(serviceWorker, { readyTimeoutMs: 50 });

    assert.equal(result, subscription);
  });

  it("does not unregister a service worker that still owns a push subscription", async () => {
    let subscribedWorkerUnregistered = false;
    let emptyWorkerUnregistered = false;

    await unregisterServiceWorkersWithoutPushSubscriptions([
      {
        pushManager: {
          getSubscription: async () => ({ endpoint: "https://push.example/subscription" }),
        },
        unregister: async () => {
          subscribedWorkerUnregistered = true;
          return true;
        },
      },
      {
        pushManager: {
          getSubscription: async () => null,
        },
        unregister: async () => {
          emptyWorkerUnregistered = true;
          return true;
        },
      },
    ]);

    assert.equal(subscribedWorkerUnregistered, false);
    assert.equal(emptyWorkerUnregistered, true);
  });
});

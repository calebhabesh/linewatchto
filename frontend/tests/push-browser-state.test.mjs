import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as pushBrowserState from "../src/app/push-browser-state.ts";

const {
  getCurrentPushSubscription,
  unregisterServiceWorkersWithoutPushSubscriptions,
} = pushBrowserState;

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

  it("detects whether an existing push subscription uses the current VAPID public key", () => {
    assert.equal(typeof pushBrowserState.base64UrlToUint8Array, "function");
    assert.equal(typeof pushBrowserState.pushSubscriptionUsesApplicationServerKey, "function");

    const currentKey = "BCdkU2P1dFN0YWJsZUtleUZvckxpbmVXYXRjaFRPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const differentKey = "BJ9sZ21Ob3RUaGVTYW1lS2V5Rm9yTGhpbmVXYXRjaFRPAAAAAAAAAAAAAAAAAAAAAAA";
    const subscription = {
      options: {
        applicationServerKey: pushBrowserState.base64UrlToUint8Array(currentKey),
      },
    };

    assert.equal(pushBrowserState.pushSubscriptionUsesApplicationServerKey(subscription, currentKey), true);
    assert.equal(pushBrowserState.pushSubscriptionUsesApplicationServerKey(subscription, differentKey), false);
  });
});

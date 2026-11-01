import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { runInNewContext } from "node:vm";

import * as page from "../src/app/push-subscription-check.ts";

// The worker loads public/push-subscription-check.js with importScripts; the
// page uses the TypeScript twin. Both must decide every case the same way.
function loadWorkerCheck() {
  const context = { self: {}, TextEncoder, Uint8Array, Array, Number };
  context.self.crypto = globalThis.crypto;
  runInNewContext(
    readFileSync(new URL("../public/push-subscription-check.js", import.meta.url), "utf8"),
    context,
    { filename: "push-subscription-check.js" },
  );
  return context.self.LineWatchPushSubscriptionCheck;
}

const worker = loadWorkerCheck();

describe("push subscription check", () => {
  it("names each save by what the device last saved", () => {
    const cases = [
      [{ savedEndpointHash: "aaa", currentEndpointHash: "aaa", subscribedAnew: false }, "refreshed"],
      [{ savedEndpointHash: undefined, currentEndpointHash: "aaa", subscribedAnew: false }, "refreshed"],
      [{ savedEndpointHash: "aaa", currentEndpointHash: "bbb", subscribedAnew: false }, "endpoint-replaced"],
      [{ savedEndpointHash: "aaa", currentEndpointHash: "bbb", subscribedAnew: true }, "restored-missing"],
      [{ savedEndpointHash: undefined, currentEndpointHash: "bbb", subscribedAnew: true }, "restored-missing"],
    ];
    for (const [input, expected] of cases) {
      assert.equal(page.registrationReasonFor(input), expected, JSON.stringify(input));
      assert.equal(worker.registrationReasonFor(input), expected, JSON.stringify(input));
    }
  });

  it("acts in the background only on a replaced or dropped subscription this device saved", () => {
    const cases = [
      [{ hasSubscription: true, savedEndpointHash: "aaa", currentEndpointHash: "aaa" }, "none"],
      [{ hasSubscription: true, savedEndpointHash: "aaa", currentEndpointHash: "bbb" }, "save"],
      // First enablement belongs to the page, not the worker.
      [{ hasSubscription: true, savedEndpointHash: undefined, currentEndpointHash: "bbb" }, "none"],
      [{ hasSubscription: false, savedEndpointHash: "aaa", currentEndpointHash: null }, "restore"],
      // A rider who turned the device off cleared the saved hash: never restore.
      [{ hasSubscription: false, savedEndpointHash: undefined, currentEndpointHash: null }, "none"],
    ];
    for (const [input, expected] of cases) {
      assert.equal(page.subscriptionCheckAction(input), expected, JSON.stringify(input));
      assert.equal(worker.subscriptionCheckAction(input), expected, JSON.stringify(input));
    }
  });

  it("reads the browser major version from client hints or the user agent", () => {
    const cases = [
      ["Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36", undefined, 156],
      ["Mozilla/5.0 (Linux; Android 10; K) Chrome/156.0.0.0", { brands: [{ brand: "Not.A/Brand", version: "99" }, { brand: "Google Chrome", version: "157" }] }, 157],
      ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1", undefined, 18],
      ["Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0", undefined, 140],
      ["Service Worker", undefined, null],
    ];
    for (const [userAgent, data, expected] of cases) {
      assert.equal(page.browserMajorVersion(userAgent, data), expected, userAgent);
      assert.equal(worker.browserMajorVersion(userAgent, data), expected, userAgent);
    }
  });

  it("hashes endpoints the way the server does and shares one storage location", async () => {
    const endpoint = " https://fcm.googleapis.com/fcm/send/abc ";
    const pageHash = await page.endpointHash(endpoint);
    assert.match(pageHash, /^[0-9a-f]{64}$/);
    assert.equal(await worker.endpointHash(endpoint), pageHash);
    assert.equal(worker.DB_NAME, page.PUSH_STATE_DB_NAME);
    assert.equal(worker.STORE, page.PUSH_STATE_STORE);
    assert.equal(worker.KEY, page.PUSH_STATE_KEY);
  });

  it("uses the periodic sync tag the worker listens for", () => {
    const serviceWorkerSource = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
    assert.equal(page.SUBSCRIPTION_CHECK_SYNC_TAG, "linewatch-subscription-check");
    assert.match(serviceWorkerSource, /SUBSCRIPTION_CHECK_SYNC_TAG = "linewatch-subscription-check"/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getOrCreatePushInstallationId,
  validPushInstallationId,
} from "../src/app/push-installation-identity.ts";

describe("push installation identity", () => {
  it("persists one stable browser installation id outside the app shell cache", async () => {
    let storedResponse = null;
    let openedCacheName = null;
    const cacheStorage = {
      open: async (cacheName) => {
        openedCacheName = cacheName;
        return {
          match: async () => storedResponse,
          put: async (_key, response) => {
            storedResponse = response;
          },
        };
      },
    };
    const cryptoSource = {
      randomUUID: () => "6d0e67af-4971-4e9c-98a2-c0b3dc6cf324",
      getRandomValues: () => {
        throw new Error("randomUUID should be used");
      },
    };

    const installationId = await getOrCreatePushInstallationId(cacheStorage, cryptoSource);

    assert.equal(installationId, "6d0e67af-4971-4e9c-98a2-c0b3dc6cf324");
    assert.equal(openedCacheName, "linewatch-push-identity-v1");
    assert.equal(await storedResponse.text(), installationId);
    assert.equal(validPushInstallationId(installationId), true);
    assert.equal(validPushInstallationId("short"), false);
  });
});

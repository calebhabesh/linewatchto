import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

import {
  DEFAULT_REGIONAL_MAP_SOURCE,
  REGIONAL_DYNAMIC_PLANNED_STATION_LAYER_ID,
  clearRegionalMapMarkupCache,
  getRegionalMapMarkup,
  preloadRegionalMapMarkup,
  regionalMapMarkupCache,
} from "../src/app/regional-map-asset.ts";

describe("regional map asset loader and lifecycle", () => {
  beforeEach(() => {
    clearRegionalMapMarkupCache();
  });

  it("exports the planned-station layer ID required by regional renderers", () => {
    assert.equal(REGIONAL_DYNAMIC_PLANNED_STATION_LAYER_ID, "regional-dynamic-planned-station-layer");
    assert.equal(DEFAULT_REGIONAL_MAP_SOURCE, "/assets/linewatch/regional-rail-map.svg");
  });

  it("safely handles server-side execution without throwing DOMParser errors", async () => {
    // In Node.js, typeof window is undefined.
    assert.equal(typeof window, "undefined");
    const result = await preloadRegionalMapMarkup();
    assert.equal(result, "");
    assert.equal(getRegionalMapMarkup(), "");
  });

  it("deduplicates in-flight requests and shares completed cache in browser environments", async () => {
    let fetchCount = 0;
    const fakeMarkup = "<svg id=\"prepared-test-map\"><g id=\"regional-stations-layer\"></g></svg>";

    // Mock browser environment
    globalThis.window = {};
    globalThis.fetch = async () => {
      fetchCount++;
      return {
        ok: true,
        text: async () => fakeMarkup,
      };
    };

    // Mock DOMParser and XMLSerializer
    globalThis.DOMParser = class MockDOMParser {
      parseFromString() {
        return {
          documentElement: {
            removeAttribute: () => {},
            setAttribute: () => {},
            prepend: () => {},
          },
          querySelector: () => null,
          querySelectorAll: () => [],
          getElementById: (id) => {
            if (id === "regional-stations-layer") {
              return {
                querySelector: () => null,
                insertBefore: () => {},
                append: () => {},
              };
            }
            return null;
          },
          createElementNS: (_ns, tag) => ({
            tagName: tag,
            setAttribute: () => {},
            classList: { add: () => {} },
            style: { setProperty: () => {} },
          }),
        };
      }
    };

    globalThis.XMLSerializer = class MockXMLSerializer {
      serializeToString() {
        return fakeMarkup;
      }
    };

    try {
      // 1. Concurrent calls return the exact same promise instance and fetch once
      const promise1 = preloadRegionalMapMarkup("/assets/test-map.svg");
      const promise2 = preloadRegionalMapMarkup("/assets/test-map.svg");
      assert.strictEqual(promise1, promise2, "Concurrent preload calls must share the identical in-flight promise");

      const [res1, res2] = await Promise.all([promise1, promise2]);
      assert.equal(res1, fakeMarkup);
      assert.equal(res2, fakeMarkup);
      assert.equal(fetchCount, 1, "Only one fetch should be performed across concurrent calls");

      // 2. Completed cache hit returns immediately without extra fetch
      assert.equal(getRegionalMapMarkup("/assets/test-map.svg"), fakeMarkup);
      const promise3 = preloadRegionalMapMarkup("/assets/test-map.svg");
      const res3 = await promise3;
      assert.equal(res3, fakeMarkup);
      assert.equal(fetchCount, 1, "Warm cache hit should not trigger fetch");

      // 3. Clear cache works
      clearRegionalMapMarkupCache();
      assert.equal(getRegionalMapMarkup("/assets/test-map.svg"), "");
      assert.equal(regionalMapMarkupCache.size, 0);
    } finally {
      delete globalThis.window;
      delete globalThis.fetch;
      delete globalThis.DOMParser;
      delete globalThis.XMLSerializer;
    }
  });

  it("retries fetch after a failure rather than caching rejected promises", async () => {
    let attempts = 0;
    const fakeMarkup = "<svg id=\"prepared-retry-map\"></svg>";

    globalThis.window = {};
    globalThis.fetch = async () => {
      attempts++;
      if (attempts === 1) {
        return {
          ok: false,
          status: 503,
          text: async () => "Unavailable",
        };
      }
      return {
        ok: true,
        text: async () => fakeMarkup,
      };
    };

    globalThis.DOMParser = class MockDOMParser {
      parseFromString() {
        return {
          documentElement: {
            removeAttribute: () => {},
            setAttribute: () => {},
            prepend: () => {},
          },
          querySelector: () => null,
          querySelectorAll: () => [],
          getElementById: () => ({
            querySelector: () => null,
            querySelectorAll: () => [],
            insertBefore: () => {},
            append: () => {},
          }),
          createElementNS: () => ({
            setAttribute: () => {},
            classList: { add: () => {} },
            style: { setProperty: () => {} },
          }),
        };
      }
    };

    globalThis.XMLSerializer = class MockXMLSerializer {
      serializeToString() {
        return fakeMarkup;
      }
    };

    try {
      // First attempt fails
      await assert.rejects(
        () => preloadRegionalMapMarkup("/assets/fail-first.svg"),
        /Regional map unavailable/,
      );

      assert.equal(attempts, 1);
      assert.equal(getRegionalMapMarkup("/assets/fail-first.svg"), "");

      // Second attempt retries and succeeds
      const result = await preloadRegionalMapMarkup("/assets/fail-first.svg");
      assert.equal(attempts, 2, "Second call should retry the request");
      assert.equal(result, fakeMarkup);
      assert.equal(getRegionalMapMarkup("/assets/fail-first.svg"), fakeMarkup);
    } finally {
      delete globalThis.window;
      delete globalThis.fetch;
      delete globalThis.DOMParser;
      delete globalThis.XMLSerializer;
    }
  });
});

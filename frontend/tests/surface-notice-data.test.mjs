import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getSurfaceNotices,
  fallbackSurfaceNotices,
} from "../src/app/surface-notice-data.ts";

describe("surface notice data adapter", () => {
  it("uses same-origin API by default", async () => {
    const requests = [];
    const response = await getSurfaceNotices({
      fetcher: async (input) => {
        requests.push(input);
        return new Response(
          JSON.stringify({
            generatedAt: "2026-06-14T15:40:00Z",
            fresh: true,
            source: "TTC Live Alerts",
            categories: [],
            notices: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    });

    assert.equal(response.source, "backend");
    assert.equal(response.data.fresh, true);
    assert.equal(requests[0], "/api/surface-notices");
  });

  it("appends category and query when requested", async () => {
    const requests = [];
    const response = await getSurfaceNotices({
      category: "bypass",
      query: "509",
      fetcher: async (input) => {
        requests.push(input);
        return new Response(
          JSON.stringify({
            generatedAt: "2026-06-14T15:40:00Z",
            fresh: true,
            source: "TTC Live Alerts",
            categories: [],
            notices: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    });

    assert.equal(response.source, "backend");
    assert.equal(requests[0], "/api/surface-notices?category=bypass&query=509");
  });

  it("falls back empty when fetch throws", async () => {
    const response = await getSurfaceNotices({
      fetcher: async () => {
        throw new Error("Network error");
      },
    });

    assert.equal(response.source, "fallback");
    assert.equal(response.data.fresh, false);
    assert.equal(response.data.categories.length, 0);
    assert.equal(response.data.notices.length, 0);
  });

  it("does not invent notice counts in fallback mode", () => {
    assert.equal(fallbackSurfaceNotices.fresh, false);
    assert.equal(fallbackSurfaceNotices.categories.length, 0);
    assert.equal(fallbackSurfaceNotices.notices.length, 0);
  });
});

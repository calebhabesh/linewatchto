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

  it("requests the regional notice collection when GO/UP mode is active", async () => {
    const requests = [];
    await getSurfaceNotices({
      networkId: "regional",
      fetcher: async (input) => {
        requests.push(input);
        return new Response(JSON.stringify({
          generatedAt: "2026-07-30T14:00:00Z",
          fresh: true,
          source: "Metrolinx GO information + marketing alerts",
          categories: [],
          notices: [],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    assert.equal(requests[0], "/api/surface-notices?network=regional");
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

it("keeps complete public notices searchable offline without persisting queries", async () => {
  const previousWindow = globalThis.window;
  const rows = new Map();
  globalThis.window = { localStorage: { getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value) } };
  try {
    const data = { generatedAt: '2026-09-11T12:00:00Z', fresh: true, source: 'TTC', categories: [], notices: [{ id: '1', title: '501 detour', description: 'Queen Street', category: 'detour', routeType: 'streetcar', routeIds: ['501'], stopIds: [], updatedAt: '2026-09-11T12:00:00Z', source: 'TTC' }] };
    await getSurfaceNotices({ fetcher: async () => new Response(JSON.stringify(data)) });
    const offline = async () => { throw new Error('offline'); };
    const saved = await getSurfaceNotices({ query: 'Queen', fetcher: offline });
    assert.equal(saved.data.fresh, false);
    assert.ok(saved.data.savedAt);
    assert.equal(saved.data.notices.length, 1);
    assert.equal((await getSurfaceNotices({ query: 'missing', fetcher: offline })).data.notices.length, 0);
    assert.equal((await getSurfaceNotices({ networkId: 'regional', fetcher: offline })).data.notices.length, 0);
    assert.equal(rows.size, 1);
    await getSurfaceNotices({ query: 'private query', fetcher: async () => new Response(JSON.stringify({ ...data, notices: [] })) });
    assert.equal((await getSurfaceNotices({ fetcher: offline })).data.notices.length, 1);
  } finally { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
});

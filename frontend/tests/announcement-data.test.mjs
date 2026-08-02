import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fallbackTtcAnnouncements,
  getTtcAnnouncements,
} from "../src/app/announcement-data.ts";

describe("TTC announcement data adapter", () => {
  it("loads announcements from the same-origin API", async () => {
    const requests = [];
    const result = await getTtcAnnouncements({
      fetcher: async (input) => {
        requests.push(input);
        return new Response(JSON.stringify({
          generatedAt: "2026-08-01T12:00:00Z",
          fresh: true,
          source: "TTC Live Alerts announcements",
          announcements: [{ id: "one", scope: "site-wide", title: "Notice", description: "Details", source: "TTC Live Alerts announcements" }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    assert.equal(requests[0], "/api/announcements");
    assert.equal(result.source, "backend");
    assert.equal(result.data.announcements.length, 1);
  });

  it("adds search and limit parameters", async () => {
    const requests = [];
    await getTtcAnnouncements({
      query: "station entrance",
      limit: 5,
      fetcher: async (input) => {
        requests.push(input);
        return new Response(JSON.stringify(fallbackTtcAnnouncements), { status: 200 });
      },
    });

    assert.equal(requests[0], "/api/announcements?query=station+entrance&limit=5");
  });

  it("uses an empty stale fallback without inventing announcements", async () => {
    const result = await getTtcAnnouncements({ fetcher: async () => { throw new Error("offline"); } });

    assert.equal(result.source, "fallback");
    assert.equal(result.data.fresh, false);
    assert.deepEqual(result.data.announcements, []);
  });
});

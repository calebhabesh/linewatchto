import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getAccessibilityOutages,
  fallbackAccessibilityOutages,
} from "../src/app/accessibility-outage-data.ts";

describe("accessibility outage data adapter", () => {
  it("uses same-origin API by default", async () => {
    const requests = [];
    const response = await getAccessibilityOutages(undefined, {
      fetcher: async (input) => {
        requests.push(input);
        return new Response(
          JSON.stringify({
            generatedAt: "2026-06-14T15:40:00Z",
            fresh: true,
            source: "TTC Live Alerts",
            assetTypes: [],
            groups: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    });

    assert.equal(response.source, "backend");
    assert.equal(response.data.fresh, true);
    assert.equal(requests[0], "/api/accessibility-outages");
  });

  it("appends ?asset=elevator when requested", async () => {
    const requests = [];
    const response = await getAccessibilityOutages("elevator", {
      fetcher: async (input) => {
        requests.push(input);
        return new Response(
          JSON.stringify({
            generatedAt: "2026-06-14T15:40:00Z",
            fresh: true,
            source: "TTC Live Alerts",
            assetTypes: [],
            groups: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    });

    assert.equal(response.source, "backend");
    assert.equal(requests[0], "/api/accessibility-outages?asset=elevator");
  });

  it("falls back empty when fetch throws", async () => {
    const response = await getAccessibilityOutages(undefined, {
      fetcher: async () => {
        throw new Error("Network error");
      },
    });

    assert.equal(response.source, "fallback");
    assert.equal(response.data.fresh, false);
    assert.equal(response.data.assetTypes.length, 0);
    assert.equal(response.data.groups.length, 0);
  });

  it("does not invent outage counts in fallback mode", () => {
    assert.equal(fallbackAccessibilityOutages.fresh, false);
    assert.equal(fallbackAccessibilityOutages.assetTypes.length, 0);
    assert.equal(fallbackAccessibilityOutages.groups.length, 0);
  });
});

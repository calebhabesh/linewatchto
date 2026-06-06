import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createSavedCommute,
  getCurrentAccount,
  getSavedCommutes,
  loginDemoAccount,
  logoutAccount,
} from "../src/app/account-data.ts";

describe("account data adapter", () => {
  it("defines saved commute weighted path and impact contracts", () => {
    const source = readFileSync(new URL("../src/app/account-data.ts", import.meta.url), "utf8");
    assert.match(source, /export type AccountCommutePath/);
    assert.match(source, /estimatedTravelSeconds: number/);
    assert.match(source, /weightSource: "gtfs-scheduled-median" \| "mixed-scheduled-fallback" \| "topology-fallback" \| "unavailable"/);
    assert.match(source, /export type AccountCommuteImpact/);
    assert.match(source, /path: AccountCommutePath/);
    assert.match(source, /impact: AccountCommuteImpact/);
  });

  it("maps signed-out current account responses", async () => {
    const result = await getCurrentAccount({
      fetcher: async () =>
        new Response(JSON.stringify({ authenticated: false, user: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    assert.equal(result.source, "backend");
    assert.equal(result.authenticated, false);
    assert.equal(result.user, null);
  });

  it("falls back to unavailable account state when backend cannot be reached", async () => {
    const result = await getCurrentAccount({
      fetcher: async () => {
        throw new Error("offline");
      },
    });

    assert.equal(result.source, "unavailable");
    assert.equal(result.authenticated, false);
    assert.equal(result.user, null);
  });

  it("posts demo login with credentials included", async () => {
    const requests = [];
    const result = await loginDemoAccount({
      fetcher: async (input, init) => {
        requests.push({ input, init });
        return new Response(
          JSON.stringify({
            authenticated: true,
            user: { id: "user_demo", email: "demo@linewatch.local", displayName: "Demo Rider", demo: true },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    });

    assert.equal(result.authenticated, true);
    assert.equal(result.user.email, "demo@linewatch.local");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.credentials, "include");
  });

  it("loads account saved commutes", async () => {
    const result = await getSavedCommutes({
      fetcher: async () =>
        new Response(
          JSON.stringify({
            commutes: [
              {
                id: "commute_1",
                label: "Morning commute",
                originStationId: "finch",
                originStationName: "Finch",
                destinationStationId: "union",
                destinationStationName: "Union",
                routeLabel: "Finch -> Union",
                path: {
                  status: "available",
                  stationIds: ["finch", "union"],
                  segmentIds: ["line-1-finch-union"],
                  lineIds: ["line-1"],
                  transferStationIds: [],
                  estimatedTravelSeconds: 300,
                  weightSource: "gtfs-scheduled-median",
                  summary: "Default scheduled route: 2 stations on Line 1, about 5 min",
                },
                impact: {
                  status: "clear",
                  severity: "clear",
                  statusLabel: "Clear",
                  detail: "No active or planned LineWatch impacts match this route.",
                  matchedImpacts: [],
                },
                createdAt: "2026-06-05T14:30:00Z",
                updatedAt: "2026-06-05T14:30:00Z",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ),
    });

    assert.equal(result.source, "backend");
    assert.equal(result.commutes[0].routeLabel, "Finch -> Union");
    assert.equal(result.commutes[0].path.estimatedTravelSeconds, 300);
    assert.equal(result.commutes[0].impact.statusLabel, "Clear");
  });

  it("creates and logs out through account endpoints", async () => {
    const requests = [];
    await createSavedCommute(
      { label: "Home", originStationId: "finch", destinationStationId: "union" },
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });
          return new Response(
            JSON.stringify({
              id: "commute_1",
              label: "Home",
              originStationId: "finch",
              originStationName: "Finch",
              destinationStationId: "union",
              destinationStationName: "Union",
              routeLabel: "Finch -> Union",
              path: {
                status: "available",
                stationIds: ["finch", "union"],
                segmentIds: ["line-1-finch-union"],
                lineIds: ["line-1"],
                transferStationIds: [],
                estimatedTravelSeconds: 300,
                weightSource: "gtfs-scheduled-median",
                summary: "Default scheduled route: 2 stations on Line 1, about 5 min",
              },
              impact: {
                status: "clear",
                severity: "clear",
                statusLabel: "Clear",
                detail: "No active or planned LineWatch impacts match this route.",
                matchedImpacts: [],
              },
              createdAt: "2026-06-05T14:30:00Z",
              updatedAt: "2026-06-05T14:30:00Z",
            }),
            { status: 201, headers: { "content-type": "application/json" } }
          );
        },
      }
    );
    await logoutAccount({
      fetcher: async (input, init) => {
        requests.push({ input, init });
        return new Response(JSON.stringify({ authenticated: false, user: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[1].init.method, "POST");
    assert.equal(requests[1].init.credentials, "include");
  });
});

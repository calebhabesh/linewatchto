import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  AccountRequestError,
  confirmPasswordReset,
  createSavedCommute,
  getCurrentAccount,
  getSavedCommutes,
  loginDemoAccount,
  logoutAccount,
  registerAccount,
  requestPasswordReset,
} from "../src/app/account-data.ts";

describe("account data adapter", () => {
  it("defines saved commute weighted path and impact contracts", () => {
    const source = readFileSync(new URL("../src/app/account-data.ts", import.meta.url), "utf8");
    assert.match(source, /export type AccountCommutePath/);
    assert.match(source, /estimatedTravelSeconds: number/);
    assert.match(source, /export type AccountCommutePathSegmentHop/);
    assert.match(source, /segmentHops: AccountCommutePathSegmentHop\[\]/);
    assert.match(source, /weightSource: "gtfs-scheduled-median" \| "mixed-scheduled-fallback" \| "seeded-fallback" \| "topology-fallback" \| "unavailable"/);
    assert.match(source, /export type AccountCommuteImpact/);
    assert.match(source, /export type AccountCommuteLeg/);
    assert.match(source, /watchReturnTrip: boolean/);
    assert.match(source, /outboundLeg: AccountCommuteLeg/);
    assert.match(source, /returnLeg: AccountCommuteLeg \| null/);
    assert.match(source, /path: AccountCommutePath/);
    assert.match(source, /impact: AccountCommuteImpact/);
    assert.match(source, /export type AccountCommutePathPreview/);
    assert.match(source, /commutePathPreviewFromCommute/);
    assert.match(source, /export type AccountCommuteLegId = "outbound" \| "return"/);
    assert.match(source, /legId: AccountCommuteLegId/);
    assert.match(source, /commutePathPreviewFromCommute\(commute: AccountSavedCommute, legId/);
    assert.match(source, /segmentIds: leg\.path\.segmentIds/);
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

  it("uses same-origin API paths by default for browser account requests", async () => {
    const requests = [];
    const result = await getCurrentAccount({
      fetcher: async (input, init) => {
        requests.push({ input, init });
        return new Response(JSON.stringify({ authenticated: false, user: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    assert.equal(result.source, "backend");
    assert.equal(requests[0].input, "/api/auth/me");
    assert.equal(requests[0].init.credentials, "include");
  });

  it("still honors explicit non-local account API bases", async () => {
    const requests = [];
    await loginDemoAccount({
      apiBaseUrl: "https://api.linewatch.example",
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

    assert.equal(requests[0].input, "https://api.linewatch.example/api/auth/demo");
    assert.equal(requests[0].init.credentials, "include");
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

  it("posts registration with normalized payload and credentials included", async () => {
    const requests = [];
    const result = await registerAccount(
      { email: "rider@example.com", password: "correct horse battery staple", displayName: "Rider" },
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });
          return new Response(
            JSON.stringify({
              authenticated: true,
              user: { id: "user_1", email: "rider@example.com", displayName: "Rider", demo: false },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        },
      }
    );

    assert.equal(result.authenticated, true);
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.body, JSON.stringify({
      email: "rider@example.com",
      password: "correct horse battery staple",
      displayName: "Rider",
    }));
  });

  it("surfaces backend account error messages", async () => {
    await assert.rejects(
      () => registerAccount(
        { email: "rider@example.com", password: "correct horse battery staple", displayName: "Rider" },
        {
          fetcher: async () =>
            new Response(
              JSON.stringify({ error: "email_exists", message: "An account with that email already exists." }),
              { status: 409, headers: { "content-type": "application/json" } }
            ),
        }
      ),
      (error) => {
        assert.equal(error instanceof AccountRequestError, true);
        assert.equal(error.status, 409);
        assert.equal(error.errorCode, "email_exists");
        assert.equal(error.message, "An account with that email already exists.");
        return true;
      }
    );
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
                  segmentHops: [{
                    segmentId: "line-1-finch-union",
                    lineId: "line-1",
                    fromStationId: "finch",
                    toStationId: "union",
                    travelDirection: "forward",
                  }],
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
                segmentHops: [{
                  segmentId: "line-1-finch-union",
                  lineId: "line-1",
                  fromStationId: "finch",
                  toStationId: "union",
                  travelDirection: "forward",
                }],
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

  it("requests password reset with credentials included", async () => {
    const requests = [];
    const result = await requestPasswordReset(
      { email: "rider@example.com" },
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });
          return new Response(
            JSON.stringify({
              accepted: true,
              message: "If an account exists for that email, a password reset link has been sent.",
              devResetToken: "dev-token",
              expiresAt: "2026-06-05T15:00:00Z",
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        },
      }
    );

    assert.equal(result.accepted, true);
    assert.equal(result.devResetToken, "dev-token");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.body, JSON.stringify({ email: "rider@example.com" }));
  });

  it("confirms password reset and returns authenticated user", async () => {
    const requests = [];
    const result = await confirmPasswordReset(
      { token: "dev-token", password: "new correct horse 2" },
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });
          return new Response(
            JSON.stringify({
              authenticated: true,
              user: { id: "user_1", email: "rider@example.com", displayName: "Rider", demo: false },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        },
      }
    );

    assert.equal(result.authenticated, true);
    assert.equal(result.user.email, "rider@example.com");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.body, JSON.stringify({ token: "dev-token", password: "new correct horse 2" }));
  });
});

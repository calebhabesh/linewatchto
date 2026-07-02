import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  AccountRequestError,
  confirmPasswordReset,
  createSavedCommute,
  disablePushDevice,
  disablePushSubscription,
  getLatestPushNotificationForSubscription,
  getAuthConfig,
  getCurrentAccount,
  getPushDeliveryDiagnostics,
  getPushDevices,
  getPushNotificationConfig,
  getSavedCommutes,
  googleAuthStartUrl,
  loginDemoAccount,
  loginWithGoogle,
  linkGoogleAccount,
  logoutAccount,
  registerAccount,
  requestPasswordReset,
  savePushSubscription,
  updatePushPreferences,
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
            user: { id: "user_demo", email: "demo@linewatch.local", displayName: "Demo Rider", demo: true, googleLinked: false },
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
            user: { id: "user_demo", email: "demo@linewatch.local", displayName: "Demo Rider", demo: true, googleLinked: false },
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
              user: { id: "user_1", email: "rider@example.com", displayName: "Rider", demo: false, googleLinked: false },
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
              user: { id: "user_1", email: "rider@example.com", displayName: "Rider", demo: false, googleLinked: false },
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

  it("loads push notification config for the current account", async () => {
    const requests = [];
    const result = await getPushNotificationConfig({
      fetcher: async (input, init) => {
        requests.push({ input, init });
        return new Response(
          JSON.stringify({
            webPushAvailable: true,
            vapidPublicKey: "BPublicVapidKey",
            preferences: {
              commuteNotificationsEnabled: true,
              plannedClosureNotificationsEnabled: true,
              savedCommutes: {
                currentDisruptions: true,
                plannedClosureReminders: true,
                eventTypes: {
                  suspensions: true,
                  delays: true,
                  reducedSpeedZones: true,
                  plannedClosures: true,
                  serviceRestored: true,
                },
              },
              lineSubscriptions: {
                lines: [
                  { lineId: "line-1", lineNumber: "1", label: "Yonge-University", subscribed: false },
                  { lineId: "line-2", lineNumber: "2", label: "Bloor-Danforth", subscribed: false },
                  { lineId: "line-4", lineNumber: "4", label: "Sheppard", subscribed: false },
                  { lineId: "line-5", lineNumber: "5", label: "Eglinton", subscribed: false },
                  { lineId: "line-6", lineNumber: "6", label: "Finch West", subscribed: false },
                ],
                eventTypes: {
                  suspensions: true,
                  delays: true,
                  reducedSpeedZones: true,
                  plannedClosures: true,
                  serviceRestored: true,
                },
              },
              reminderTiming: {
                onChange: true,
                closure24h: true,
                closureMorning: true,
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    });

    assert.equal(result.source, "backend");
    assert.equal(result.config.webPushAvailable, true);
    assert.equal(result.config.vapidPublicKey, "BPublicVapidKey");
    assert.equal(result.config.preferences.savedCommutes.currentDisruptions, true);
    assert.equal(result.config.preferences.savedCommutes.plannedClosureReminders, true);
    assert.equal(result.config.preferences.savedCommutes.eventTypes.reducedSpeedZones, true);
    assert.equal(result.config.preferences.lineSubscriptions.lines.length, 5);
    assert.equal(result.config.preferences.lineSubscriptions.lines[0].lineId, "line-1");
    assert.equal(result.config.preferences.lineSubscriptions.lines[0].subscribed, false);
    assert.equal(result.config.preferences.lineSubscriptions.eventTypes.reducedSpeedZones, true);
    assert.equal(result.config.preferences.reminderTiming.closure24h, true);
    assert.equal(result.config.preferences.reminderTiming.closureMorning, true);
    assert.equal(requests[0].input, "/api/account/push/config");
    assert.equal(requests[0].init.credentials, "include");
  });

  it("saves, updates, reads, and disables browser push subscriptions", async () => {
    const requests = [];
    await savePushSubscription(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/subscription",
        keys: {
          p256dh: "p256dh-key",
          auth: "auth-secret",
        },
        userAgent: "Mobile Safari",
      },
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });
          return new Response(
            JSON.stringify({
              id: "push_subscription_1",
              enabled: true,
              commuteNotificationsEnabled: true,
              plannedClosureNotificationsEnabled: true,
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        },
      }
    );
    const fullPrefs = {
      commuteNotificationsEnabled: true,
      plannedClosureNotificationsEnabled: false,
      savedCommutes: {
        currentDisruptions: true,
        plannedClosureReminders: false,
        eventTypes: {
          suspensions: true,
          delays: true,
          reducedSpeedZones: true,
          plannedClosures: true,
          serviceRestored: true,
        },
      },
      lineSubscriptions: {
        lines: [
          { lineId: "line-1", lineNumber: "1", label: "Yonge-University", subscribed: false },
          { lineId: "line-2", lineNumber: "2", label: "Bloor-Danforth", subscribed: false },
          { lineId: "line-4", lineNumber: "4", label: "Sheppard", subscribed: false },
          { lineId: "line-5", lineNumber: "5", label: "Eglinton", subscribed: false },
          { lineId: "line-6", lineNumber: "6", label: "Finch West", subscribed: false },
        ],
        eventTypes: {
          suspensions: true,
          delays: true,
          reducedSpeedZones: false,
          plannedClosures: true,
          serviceRestored: true,
                },
      },
      reminderTiming: {
        onChange: true,
        closure24h: true,
        closureMorning: true,
      },
    };
    await updatePushPreferences(
      fullPrefs,
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });
          return new Response(
            JSON.stringify(fullPrefs),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        },
      }
    );
    const latest = await getLatestPushNotificationForSubscription(
      "https://fcm.googleapis.com/fcm/send/subscription",
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });
          return new Response(
            JSON.stringify({
              notification: {
                title: "Morning commute affected",
                body: "Delay on Line 1: Finch to Union",
                url: "/?panel=commutes&commute=commute_1",
                tag: "saved-commute-impact|commute_1|delay-line-1",
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        },
      }
    );
    await disablePushSubscription(
      "https://fcm.googleapis.com/fcm/send/subscription",
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });
          return new Response(null, { status: 204 });
        },
      }
    );

    assert.equal(latest.notification.title, "Morning commute affected");
    assert.equal(requests[0].input, "/api/account/push/subscription");
    assert.equal(requests[0].init.method, "PUT");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[1].input, "/api/account/push/preferences");
    assert.equal(requests[1].init.method, "PUT");
    assert.deepEqual(JSON.parse(requests[1].init.body), fullPrefs);
    assert.equal(JSON.parse(requests[1].init.body).savedCommutes.plannedClosureReminders, false);
    assert.equal(requests[2].input, "/api/account/push/latest");
    assert.equal(requests[2].init.method, "POST");
    assert.equal(requests[2].init.body, JSON.stringify({
      endpoint: "https://fcm.googleapis.com/fcm/send/subscription",
    }));
    assert.equal(requests[3].input, "/api/account/push/subscription/disable");
    assert.equal(requests[3].init.method, "POST");
  });

  it("loads per-device push delivery diagnostics", async () => {
    const requests = [];
    const result = await getPushDeliveryDiagnostics({
      fetcher: async (input, init) => {
        requests.push({ input, init });
        return new Response(
          JSON.stringify({
            notifications: [
              {
                id: "push_event_1",
                title: "Line 2 Bloor-Danforth Suspension",
                tag: "line-current|line-2|alert-1|active",
                notificationKey: "line-current|line-2|suspension|ttc-route-70610",
                sourceIncidentKey: "line-current|line-2|ttc-route-70610",
                notificationState: "ACTIVE",
                category: "line-current",
                eventType: "SUSPENSION",
                lineId: "line-2",
                lineNumber: "2",
                eventCreatedAt: "2026-07-01T14:00:00Z",
                attempts: [
                  {
                    id: "delivery_1",
                    title: "Line 2 Bloor-Danforth Suspension",
                    tag: "line-current|line-2|alert-1|active",
                    notificationState: "ACTIVE",
                    category: "line-current",
                    eventType: "SUSPENSION",
                    lineId: "line-2",
                    lineNumber: "2",
                    eventCreatedAt: "2026-07-01T14:00:00Z",
                    deviceLabel: "Android Chrome",
                    userAgent: "Mozilla/5.0 Android Chrome",
                    endpointHashPrefix: "abc12345",
                    subscriptionEnabled: true,
                    deliveryStatus: "ACCEPTED",
                    httpStatus: 201,
                    deliveryMessage: "Created",
                    lastAttemptAt: "2026-07-01T14:01:00Z",
                    displayedAt: null,
                    attemptCount: 2,
                    clientEvents: [
                      {
                        stage: "push_received",
                        message: null,
                        occurredAt: "2026-07-01T14:01:05Z",
                      },
                    ],
                  },
                ],
              },
            ],
            deliveries: [
              {
                id: "delivery_1",
                title: "Line 2 Bloor-Danforth Suspension",
                tag: "line-current|line-2|alert-1|active",
                notificationState: "ACTIVE",
                category: "line-current",
                eventType: "SUSPENSION",
                lineId: "line-2",
                lineNumber: "2",
                eventCreatedAt: "2026-07-01T14:00:00Z",
                deviceLabel: "Android Chrome",
                userAgent: "Mozilla/5.0 Android Chrome",
                endpointHashPrefix: "abc12345",
                subscriptionEnabled: true,
                deliveryStatus: "ACCEPTED",
                httpStatus: 201,
                deliveryMessage: "Created",
                lastAttemptAt: "2026-07-01T14:01:00Z",
                displayedAt: null,
                attemptCount: 2,
                clientEvents: [
                  {
                    stage: "push_received",
                    message: null,
                    occurredAt: "2026-07-01T14:01:05Z",
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    });

    assert.equal(result.source, "backend");
    assert.equal(result.notifications.length, 1);
    assert.equal(result.notifications[0].sourceIncidentKey, "line-current|line-2|ttc-route-70610");
    assert.equal(result.notifications[0].attempts[0].deviceLabel, "Android Chrome");
    assert.equal(result.deliveries.length, 1);
    assert.equal(result.deliveries[0].deviceLabel, "Android Chrome");
    assert.equal(result.deliveries[0].attemptCount, 2);
    assert.equal(result.deliveries[0].clientEvents[0].stage, "push_received");
    assert.equal(requests[0].input, "/api/account/push/diagnostics");
    assert.equal(requests[0].init.method, "GET");
    assert.equal(requests[0].init.credentials, "include");
  });

  it("loads and disables account push devices by subscription id", async () => {
    const requests = [];
    const result = await getPushDevices({
      fetcher: async (input, init) => {
        requests.push({ input, init });
        return new Response(
          JSON.stringify({
            devices: [
              {
                id: "push_subscription_ios",
                deviceLabel: "iOS Safari",
                userAgent: "Mobile Safari iPhone",
                endpointHashPrefix: "606a0b3ed936",
                enabled: true,
                createdAt: "2026-07-01T12:00:00Z",
                updatedAt: "2026-07-01T12:00:00Z",
                lastSeenAt: "2026-07-01T12:00:00Z",
                disabledAt: null,
                lastAttemptAt: "2026-07-02T04:17:00Z",
                lastAcceptedAt: "2026-07-02T04:17:00Z",
                lastDisplayedAt: null,
                acceptedWithoutDisplayCount: 3,
                deliveryHealth: "accepted-no-display",
                staleCandidate: true,
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    });

    await disablePushDevice("push_subscription_ios", {
      fetcher: async (input, init) => {
        requests.push({ input, init });
        return new Response(null, { status: 204 });
      },
    });

    assert.equal(result.source, "backend");
    assert.equal(result.devices.length, 1);
    assert.equal(result.devices[0].deviceLabel, "iOS Safari");
    assert.equal(result.devices[0].endpointHashPrefix, "606a0b3ed936");
    assert.equal(result.devices[0].deliveryHealth, "accepted-no-display");
    assert.equal(result.devices[0].staleCandidate, true);
    assert.equal(requests[0].input, "/api/account/push/devices");
    assert.equal(requests[0].init.method, "GET");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[1].input, "/api/account/push/devices/push_subscription_ios/disable");
    assert.equal(requests[1].init.method, "POST");
    assert.equal(requests[1].init.credentials, "include");
  });

  it("loads auth configuration", async () => {
    const result = await getAuthConfig({
      fetcher: async (input, init) => {
        assert.equal(input, "/api/auth/config");
        assert.equal(init.method, "GET");
        assert.equal(init.credentials, "include");
        return new Response(
          JSON.stringify({
            googleSignInAvailable: true,
            googleClientId: "client-123.apps.googleusercontent.com",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    });

    assert.equal(result.source, "backend");
    assert.equal(result.config.googleSignInAvailable, true);
    assert.equal(result.config.googleClientId, "client-123.apps.googleusercontent.com");
  });

  it("falls back to unavailable auth config when backend cannot be reached", async () => {
    const result = await getAuthConfig({
      fetcher: async () => {
        throw new Error("offline");
      },
    });

    assert.equal(result.source, "unavailable");
    assert.equal(result.config.googleSignInAvailable, false);
    assert.equal(result.config.googleClientId, "");
  });

  it("builds Google OAuth redirect start URLs for custom provider buttons", () => {
    assert.equal(
      googleAuthStartUrl({ mode: "login", returnTo: "/?panel=commutes" }),
      "/api/auth/google/start?mode=login&returnTo=%2F%3Fpanel%3Dcommutes"
    );
    assert.equal(
      googleAuthStartUrl({ mode: "link", returnTo: "/account" }, { apiBaseUrl: "https://api.linewatch.example" }),
      "https://api.linewatch.example/api/auth/google/start?mode=link&returnTo=%2Faccount"
    );
  });

  it("posts Google credential with credentials included", async () => {
    const requests = [];
    const result = await loginWithGoogle(
      { credential: "google-id-token" },
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });
          return new Response(
            JSON.stringify({
              authenticated: true,
              user: { id: "user_google", email: "rider@example.com", displayName: "Transit Rider", demo: false, googleLinked: true },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        },
      }
    );

    assert.equal(result.authenticated, true);
    assert.equal(requests[0].input, "/api/auth/google");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.body, JSON.stringify({ credential: "google-id-token" }));
  });

  it("posts Google credential to link the current account", async () => {
    const requests = [];
    const result = await linkGoogleAccount(
      { credential: "google-id-token" },
      {
        fetcher: async (input, init) => {
          requests.push({ input, init });
          return new Response(
            JSON.stringify({
              authenticated: true,
              user: { id: "user_1", email: "rider@example.com", displayName: "Rider", demo: false, googleLinked: true },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        },
      }
    );

    assert.equal(result.authenticated, true);
    assert.equal(result.user.googleLinked, true);
    assert.equal(requests[0].input, "/api/auth/google/link");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.credentials, "include");
    assert.equal(requests[0].init.body, JSON.stringify({ credential: "google-id-token" }));
  });
});

import { createServer } from "node:http";
import {
  activeAlertsResponse,
  delaysResponse,
  mapAuthoritativeActiveAlertsResponse,
  mapAuthoritativeDelaysResponse,
  mapAuthoritativeOverlapResponse,
  mapAuthoritativePlannedClosuresResponse,
  mapAuthoritativeReducedSpeedZonesResponse,
  mapResponse,
  plannedClosuresResponse,
  reducedSpeedZonesResponse,
  stationDetailResponse,
  stationSummariesResponse,
  statusResponse,
  rawAlertsResponse,
  estimatedTrainsResponse,
} from "./api-stub-data.mjs";

const port = Number(process.env.LINEWATCH_STUB_PORT ?? "4174");
let mode = "seeded";
let demoSessionActive = false;
let demoSavedStations = [];

const defaultPushNotificationPreferences = {
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
  plannedClosureFollowUp: "smart",
};

let pushPreferences = JSON.parse(JSON.stringify(defaultPushNotificationPreferences));

const defaultSavedCommuteNotificationRule = {
  enabled: true,
  dayMask: 62,
  startMinute: 390,
  endMinute: 570,
  outboundEnabled: true,
  returnEnabled: true,
  eventTypes: {
    suspensions: true,
    delays: true,
    reducedSpeedZones: true,
    plannedClosures: true,
    serviceRestored: true,
  },
  outboundSchedule: {
    dayMask: 62,
    startMinute: 390,
    endMinute: 570,
  },
  returnSchedule: {
    dayMask: 62,
    startMinute: 900,
    endMinute: 1140,
  },
};

const demoUser = {
  id: "user_demo",
  email: "demo@linewatch.local",
  displayName: "Demo Rider",
  demo: true,
};

const demoOutboundPath = {
  status: "available",
  stationIds: ["stub-station", "stub-eglinton", "stub-davisville", "stub-king", "stub-union"],
  segmentIds: ["stub-line-1-segment", "stub-line-1-eglinton-davisville", "stub-line-1-king-union"],
  segmentHops: [
    {
      segmentId: "stub-line-1-segment",
      lineId: "line-1",
      fromStationId: "stub-station",
      toStationId: "stub-eglinton",
      travelDirection: "forward",
    },
    {
      segmentId: "stub-line-1-eglinton-davisville",
      lineId: "line-1",
      fromStationId: "stub-eglinton",
      toStationId: "stub-davisville",
      travelDirection: "forward",
    },
    {
      segmentId: "stub-line-1-king-union",
      lineId: "line-1",
      fromStationId: "stub-king",
      toStationId: "stub-union",
      travelDirection: "forward",
    },
  ],
  lineIds: ["line-1"],
  transferStationIds: [],
  estimatedTravelSeconds: 780,
  weightSource: "gtfs-scheduled-median",
  summary: "Default scheduled route: 5 stations on Line 1, about 13 min",
};

const demoReturnPath = {
  status: "available",
  stationIds: ["stub-union", "stub-king", "stub-davisville", "stub-eglinton", "stub-station"],
  segmentIds: ["stub-line-1-king-union", "stub-line-1-eglinton-davisville", "stub-line-1-segment"],
  segmentHops: [
    {
      segmentId: "stub-line-1-king-union",
      lineId: "line-1",
      fromStationId: "stub-union",
      toStationId: "stub-king",
      travelDirection: "reverse",
    },
    {
      segmentId: "stub-line-1-eglinton-davisville",
      lineId: "line-1",
      fromStationId: "stub-davisville",
      toStationId: "stub-eglinton",
      travelDirection: "reverse",
    },
    {
      segmentId: "stub-line-1-segment",
      lineId: "line-1",
      fromStationId: "stub-eglinton",
      toStationId: "stub-station",
      travelDirection: "reverse",
    },
  ],
  lineIds: ["line-1"],
  transferStationIds: [],
  estimatedTravelSeconds: 780,
  weightSource: "gtfs-scheduled-median",
  summary: "Default scheduled route: 5 stations on Line 1, about 13 min",
};

const demoOutboundImpact = {
  status: "affected",
  severity: "suspended",
  statusLabel: "Affected now",
  detail: "2 current impacts match this route.",
  matchedImpacts: [
    {
      id: "stub-alert-line-1",
      kind: "suspension",
      status: "current",
      severity: "suspended",
      title: "Stub API signal problem",
      lineId: "line-1",
      lineNumber: "1",
      location: "Stub Station to Stub Terminal",
      displayDirection: "Northbound & Southbound",
      source: "Playwright API stub",
      matchedSegmentIds: ["stub-line-1-segment"],
      matchedStationIds: [],
      startedAt: "2026-06-05T14:30:00Z",
      updatedAt: "2026-06-05T14:35:00Z",
      window: null,
      timingStatus: "active-now",
    },
    {
      id: "stub-active-closure-child-line-1",
      kind: "planned-closure",
      status: "current",
      severity: "major",
      title: "Stub API active planned closure",
      lineId: "line-1",
      lineNumber: "1",
      location: "Stub Station to Stub Terminal",
      displayDirection: "Northbound & Southbound",
      source: "Playwright API stub",
      matchedSegmentIds: ["stub-line-1-segment"],
      matchedStationIds: [],
      startedAt: "2026-06-05T14:30:00Z",
      updatedAt: "2026-06-05T14:35:00Z",
      window: "Active closure window",
      timingStatus: "active-now",
    },
  ],
  travelTimeEstimate: {
    status: "unreliable",
    baselineSeconds: 780,
    estimatedLowSeconds: null,
    estimatedHighSeconds: null,
    extraLowSeconds: null,
    extraHighSeconds: null,
    confidence: "low",
    summary: "Typical commute: about 13 min. Major disruption on this route; travel time is not reliable.",
  },
};

const demoReturnImpact = {
  status: "clear",
  severity: "clear",
  statusLabel: "Clear",
  detail: "No active or planned LineWatch impacts match this route.",
  matchedImpacts: [],
  travelTimeEstimate: {
    status: "standard",
    baselineSeconds: 780,
    estimatedLowSeconds: 780,
    estimatedHighSeconds: 780,
    extraLowSeconds: 0,
    extraHighSeconds: 0,
    confidence: "high",
    summary: "Typical commute: about 13 min. No extra time estimated.",
  },
};

const demoCommutes = [
  {
    id: "commute_demo_finch_union",
    label: "Morning commute",
    originStationId: "stub-station",
    originStationName: "Stub Station",
    destinationStationId: "stub-union",
    destinationStationName: "Union",
    routeLabel: "Stub Station -> Union",
    watchReturnTrip: true,
    outboundLeg: {
      id: "outbound",
      routeLabel: "Stub Station -> Union",
      fromStationId: "stub-station",
      fromStationName: "Stub Station",
      toStationId: "stub-union",
      toStationName: "Union",
      path: demoOutboundPath,
      impact: demoOutboundImpact,
    },
    returnLeg: {
      id: "return",
      routeLabel: "Union -> Stub Station",
      fromStationId: "stub-union",
      fromStationName: "Union",
      toStationId: "stub-station",
      toStationName: "Stub Station",
      path: demoReturnPath,
      impact: demoReturnImpact,
    },
    path: demoOutboundPath,
    impact: demoOutboundImpact,
    notificationRule: defaultSavedCommuteNotificationRule,
    createdAt: "2026-06-05T14:30:00Z",
    updatedAt: "2026-06-05T14:30:00Z",
  },
];

function corsHeaders(request, extra = {}) {
  const origin = request.headers.origin;
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    ...extra,
  };
}

function sendJson(request, response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    ...corsHeaders(request, extraHeaders),
    "content-type": "application/json",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(request));
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/__test/health") {
    sendJson(request, response, 200, { mode });
    return;
  }

  if (request.method === "POST" && url.pathname === "/__test/mode") {
    const body = await readJson(request);
    if (!["seeded", "unavailable", "map-authoritative-overlap"].includes(body.mode)) {
      sendJson(request, response, 400, { error: "Unsupported smoke stub mode" });
      return;
    }
    mode = body.mode;
    demoSessionActive = false;
    demoSavedStations = [];
    pushPreferences = JSON.parse(JSON.stringify(defaultPushNotificationPreferences));
    sendJson(request, response, 200, { mode });
    return;
  }

  if (mode === "unavailable" && url.pathname.startsWith("/api/")) {
    sendJson(request, response, 503, { error: "Smoke stub unavailable mode" });
    return;
  }

  // Account & Auth Stubs
  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    sendJson(request, response, 200, demoSessionActive
      ? { authenticated: true, user: demoUser }
      : { authenticated: false, user: null }
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/demo") {
    demoSessionActive = true;
    sendJson(request, response, 200, { authenticated: true, user: demoUser }, {
      "set-cookie": "linewatch_session=smoke-demo-session; Path=/; HttpOnly; SameSite=Lax",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    demoSessionActive = false;
    sendJson(request, response, 200, { authenticated: false, user: null }, {
      "set-cookie": "linewatch_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/password-reset/request") {
    sendJson(request, response, 200, {
      accepted: true,
      message: "If an account exists for that email, a password reset link has been sent.",
      devResetToken: "smoke-reset-token",
      expiresAt: "2026-06-05T15:00:00Z",
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/password-reset/confirm") {
    demoSessionActive = true;
    sendJson(request, response, 200, {
      authenticated: true,
      user: {
        id: "user_1",
        email: "rider@example.com",
        displayName: "Rider",
        demo: false,
      },
    }, {
      "set-cookie": "linewatch_session=smoke-reset-session; Path=/; HttpOnly; SameSite=Lax",
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/account/commutes") {
    if (!demoSessionActive) {
      sendJson(request, response, 401, { error: "not_authenticated", message: "Sign in to use My Commutes." });
      return;
    }
    sendJson(request, response, 200, { commutes: demoCommutes });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/account/stations") {
    if (!demoSessionActive) {
      sendJson(request, response, 401, { error: "not_authenticated", message: "Sign in to use account features." });
      return;
    }
    sendJson(request, response, 200, { stations: demoSavedStations });
    return;
  }

  if (request.method === "PUT" && /^\/api\/account\/stations\/[^/]+$/.test(url.pathname)) {
    if (!demoSessionActive) {
      sendJson(request, response, 401, { error: "not_authenticated", message: "Sign in to use account features." });
      return;
    }
    const stationId = decodeURIComponent(url.pathname.split("/").at(-1));
    const station = stationSummariesResponse.stations.find((item) => item.id === stationId);
    if (!station) {
      sendJson(request, response, 404, { error: "unknown_station", message: "Station was not found." });
      return;
    }
    const existing = demoSavedStations.find((item) => item.station.id === stationId);
    if (existing) {
      sendJson(request, response, 200, existing);
      return;
    }
    const saved = { station, savedAt: "2026-07-23T14:30:00Z" };
    demoSavedStations = [saved, ...demoSavedStations];
    sendJson(request, response, 201, saved);
    return;
  }

  if (request.method === "DELETE" && /^\/api\/account\/stations\/[^/]+$/.test(url.pathname)) {
    if (!demoSessionActive) {
      sendJson(request, response, 401, { error: "not_authenticated", message: "Sign in to use account features." });
      return;
    }
    const stationId = decodeURIComponent(url.pathname.split("/").at(-1));
    demoSavedStations = demoSavedStations.filter((item) => item.station.id !== stationId);
    response.writeHead(204, corsHeaders(request));
    response.end();
    return;
  }

  if (request.method === "PATCH" && /^\/api\/account\/commutes\/[^/]+\/notification-rule$/.test(url.pathname)) {
    if (!demoSessionActive) {
      sendJson(request, response, 401, { error: "not_authenticated", message: "Sign in to use My Commutes." });
      return;
    }
    const body = await readJson(request);
    const commuteId = url.pathname.split("/")[4];
    const commute = demoCommutes.find((item) => item.id === commuteId);
    if (!commute) {
      sendJson(request, response, 404, { error: "not_found", message: "Commute not found." });
      return;
    }
    commute.notificationRule = {
      ...defaultSavedCommuteNotificationRule,
      ...body,
      eventTypes: {
        ...defaultSavedCommuteNotificationRule.eventTypes,
        ...(body.eventTypes ?? {}),
      },
    };
    commute.updatedAt = "2026-06-05T14:45:00Z";
    sendJson(request, response, 200, commute);
    return;
  }

  // Push Notification Stubs
  if (url.pathname.startsWith("/api/account/push/")) {
    if (!demoSessionActive) {
      sendJson(request, response, 401, { error: "not_authenticated", message: "Sign in to manage notifications." });
      return;
    }
  }

  if (request.method === "GET" && url.pathname === "/api/account/push/config") {
    sendJson(request, response, 200, {
      webPushAvailable: true,
      vapidPublicKey: "BStubVapidKey",
      preferences: pushPreferences,
      deviceSummary: {
        enabledDeviceCount: 1,
        hasEnabledDevices: true,
      },
    });
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/account/push/preferences") {
    const body = await readJson(request);
    if (body.commuteNotificationsEnabled !== undefined) pushPreferences.commuteNotificationsEnabled = body.commuteNotificationsEnabled;
    if (body.plannedClosureNotificationsEnabled !== undefined) pushPreferences.plannedClosureNotificationsEnabled = body.plannedClosureNotificationsEnabled;
    if (body.savedCommutes) {
      if (body.savedCommutes.currentDisruptions !== undefined) pushPreferences.savedCommutes.currentDisruptions = body.savedCommutes.currentDisruptions;
      if (body.savedCommutes.plannedClosureReminders !== undefined) pushPreferences.savedCommutes.plannedClosureReminders = body.savedCommutes.plannedClosureReminders;
      if (body.savedCommutes.eventTypes) {
        pushPreferences.savedCommutes.eventTypes = {
          ...pushPreferences.savedCommutes.eventTypes,
          ...body.savedCommutes.eventTypes,
        };
      }
    }
    if (body.lineSubscriptions) {
      if (body.lineSubscriptions.lines) {
        for (const lineSelect of body.lineSubscriptions.lines) {
          const l = pushPreferences.lineSubscriptions.lines.find(x => x.lineId === lineSelect.lineId);
          if (l && lineSelect.subscribed !== undefined) {
            l.subscribed = lineSelect.subscribed;
          }
        }
      }
      if (body.lineSubscriptions.eventTypes) {
        pushPreferences.lineSubscriptions.eventTypes = {
          ...pushPreferences.lineSubscriptions.eventTypes,
          ...body.lineSubscriptions.eventTypes,
        };
      }
    }
    if (body.plannedClosureFollowUp) {
      pushPreferences.plannedClosureFollowUp = body.plannedClosureFollowUp;
    }

    sendJson(request, response, 200, pushPreferences);
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/account/push/subscription") {
    sendJson(request, response, 200, {
      id: "smoke_stub_sub_1",
      enabled: true,
      commuteNotificationsEnabled: pushPreferences.commuteNotificationsEnabled,
      plannedClosureNotificationsEnabled: pushPreferences.plannedClosureNotificationsEnabled,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/account/push/subscription/disable") {
    response.writeHead(204, corsHeaders(request));
    response.end();
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/account/push/latest") {
    sendJson(request, response, 200, { notification: null });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/account/push/active") {
    sendJson(request, response, 200, { activeTags: [], retainedTags: [] });
    return;
  }

  // Public Dashboard APIs
  if (request.method === "GET" && url.pathname === "/api/map") {
    sendJson(request, response, 200, mode === "map-authoritative-overlap" ? mapAuthoritativeOverlapResponse : mapResponse);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/performance") {
    sendJson(request, response, 200, {
      status: "available",
      source: "TTC.ca",
      sourceUrl: "https://www.ttc.ca/",
      title: "On-time performance and elevator/escalator status",
      updatedLabel: "June 7, 2026 7:00 AM",
      fetchedAt: "2026-06-07T12:00:00Z",
      stale: false,
      message: "Official TTC performance metrics loaded from TTC.ca.",
      metrics: [
        { id: "line-1", label: "Line 1", category: "subway", percentage: 94, target: 90, valueLabel: "94%", note: null },
        { id: "line-2", label: "Line 2", category: "subway", percentage: 91, target: 90, valueLabel: "91%", note: null },
        { id: "elevators", label: "Elevators", category: "accessibility", percentage: 99, target: 98, valueLabel: "99%", note: null }
      ]
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/status") {
    sendJson(request, response, 200, statusResponse);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/alerts") {
    const type = url.searchParams.get("type");
    if (type === "planned") {
      sendJson(request, response, 200, mode === "map-authoritative-overlap" ? mapAuthoritativePlannedClosuresResponse : plannedClosuresResponse);
      return;
    }
    if (type === "slowdown") {
      sendJson(request, response, 200, mode === "map-authoritative-overlap" ? mapAuthoritativeReducedSpeedZonesResponse : reducedSpeedZonesResponse);
      return;
    }
    if (type === "delay") {
      sendJson(request, response, 200, mode === "map-authoritative-overlap" ? mapAuthoritativeDelaysResponse : delaysResponse);
      return;
    }
    if (type === "raw") {
      sendJson(request, response, 200, rawAlertsResponse);
      return;
    }
    sendJson(request, response, 200, mode === "map-authoritative-overlap" ? mapAuthoritativeActiveAlertsResponse : activeAlertsResponse);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/trains") {
    sendJson(request, response, 200, estimatedTrainsResponse);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/stations") {
    sendJson(request, response, 200, stationSummariesResponse);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/stations/stub-station") {
    sendJson(request, response, 200, stationDetailResponse);
    return;
  }

  sendJson(request, response, 404, { error: "Unknown smoke API route" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`LineWatch smoke API stub listening on http://127.0.0.1:${port}`);
});

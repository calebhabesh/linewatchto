import { createServer } from "node:http";
import { regionalDashboardDataForScenario, regionalStationSummaries } from "../../src/app/regional-data.ts";
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
  regionalRawAlertsResponse,
  estimatedTrainsResponse,
  regionalEstimatedTrainsResponse,
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
      { lineId: "regional-br", lineNumber: "BR", label: "Barrie", subscribed: false },
      { lineId: "regional-ki", lineNumber: "KI", label: "Kitchener", subscribed: false },
      { lineId: "regional-le", lineNumber: "LE", label: "Lakeshore East", subscribed: false },
      { lineId: "regional-lw", lineNumber: "LW", label: "Lakeshore West", subscribed: false },
      { lineId: "regional-mi", lineNumber: "MI", label: "Milton", subscribed: false },
      { lineId: "regional-rh", lineNumber: "RH", label: "Richmond Hill", subscribed: false },
      { lineId: "regional-st", lineNumber: "ST", label: "Stouffville", subscribed: false },
      { lineId: "regional-up", lineNumber: "UP", label: "Union Pearson Express", subscribed: false },
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
    if (!["seeded", "diagnostics-disabled", "unavailable", "map-authoritative-overlap", "regional-live"].includes(body.mode)) {
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

  if (request.method === "GET" && url.pathname === "/api/dashboard" && url.searchParams.get("network") === "regional") {
    if (mode !== "regional-live") {
      sendJson(request, response, 503, { error: "Regional smoke source unavailable" });
      return;
    }
    const regional = regionalDashboardDataForScenario("all-impact-types");
    sendJson(request, response, 200, {
      networkId: "regional",
      availability: "available",
      sourceSystems: ["Metrolinx Open API"],
      message: "Fresh Metrolinx rail alerts loaded.",
      map: {
        stations: regional.stations,
        segments: regional.networkSegments,
        stationNodeImpacts: regional.stationNodeImpacts,
      },
      status: {
        generatedAt: {
          time: "12:00 PM",
          date: "Thursday, June 4, 2026",
          live: true,
          lastPoll: "Metrolinx smoke poll",
        },
        lines: regional.lineStatuses,
      },
      activeAlerts: regional.activeAlerts,
      delays: regional.delays,
      reducedSpeedZones: regional.reducedSpeedZones,
      plannedClosures: regional.plannedClosures,
      performance: regional.ttcPerformance,
    });
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
    const networkId = url.searchParams.get("network") === "regional" ? "regional" : "ttc";
    const stationCatalog = networkId === "regional" ? regionalStationSummaries : stationSummariesResponse;
    const station = stationCatalog.stations.find((item) => item.id === stationId);
    if (!station) {
      sendJson(request, response, 404, { error: "unknown_station", message: "Station was not found." });
      return;
    }
    const existing = demoSavedStations.find((item) => item.networkId === networkId && item.station.id === stationId);
    if (existing) {
      sendJson(request, response, 200, existing);
      return;
    }
    const saved = { networkId, station, savedAt: "2026-07-23T14:30:00Z" };
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
    const networkId = url.searchParams.get("network") === "regional" ? "regional" : "ttc";
    demoSavedStations = demoSavedStations.filter((item) => item.networkId !== networkId || item.station.id !== stationId);
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
    sendJson(request, response, 200, mode === "map-authoritative-overlap" ? mapAuthoritativeActiveAlertsResponse : activeAlertsResponse);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/diagnostics/capabilities") {
    sendJson(request, response, 200, { rawAlertsEnabled: mode !== "diagnostics-disabled" }, { "cache-control": "no-store" });
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/diagnostics/raw-alerts/")) {
    const records = url.pathname.endsWith("/regional") ? regionalRawAlertsResponse : rawAlertsResponse;
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? "50")));
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0"));
    sendJson(request, response, 200, {
      items: records.slice(offset, offset + limit),
      limit,
      offset,
      hasMore: offset + limit < records.length,
    }, { "cache-control": "no-store" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health/ingestion") {
    sendJson(request, response, 200, {
      status: "success",
      dashboardLive: true,
      startedAt: "2026-06-02T18:11:58Z",
      completedAt: "2026-06-02T18:12:00Z",
      recordsFetched: 44,
      recordsStaged: 44,
      recordsNormalized: 12,
      recordsUnmatched: 32,
      sourceFeedUpdatedAt: "2026-06-02T18:11:30Z",
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health/regional-ingestion") {
    sendJson(request, response, 200, {
      source: "Metrolinx Open API",
      enabled: true,
      configured: true,
      fresh: true,
      status: "success",
      startedAt: "2026-07-29T15:59:58Z",
      completedAt: "2026-07-29T16:00:00Z",
      sourceUpdatedAt: "2026-07-29T15:59:30Z",
      recordsFetched: 31,
      recordsNormalized: 2,
      collections: [
        { sourceSystem: "go-service-alerts", label: "GO service alerts", kind: "rider-alert", required: true, status: "complete", recordsFetched: 6, sourceUpdatedAt: "2026-07-29T15:59:30Z" },
        { sourceSystem: "up-gtfs-alerts", label: "UP rail service alerts", kind: "rider-alert", required: true, status: "complete", recordsFetched: 1, sourceUpdatedAt: "2026-07-29T15:59:25Z" },
      ],
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health/regional-schedule") {
    sendJson(request, response, 200, {
      status: "healthy",
      scheduleActive: true,
      lookaheadCovered: true,
      requiredThrough: "2026-08-05",
      mappedStationLines: 90,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/trains") {
    sendJson(request, response, 200, estimatedTrainsResponse);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/accessibility-outages") {
    const regional = url.searchParams.get("network") === "regional";
    const hasRegionalOutage = regional && mode === "regional-live";
    sendJson(request, response, 200, {
      generatedAt: "2026-07-28T19:48:00Z",
      fresh: hasRegionalOutage,
      source: regional ? "Metrolinx Open API" : "TTC Live Alerts",
      assetTypes: hasRegionalOutage ? [{
        assetType: "elevator",
        label: "Elevator outages",
        count: 1,
        lines: [{
          lineId: "regional-le",
          lineNumber: "LE",
          lineName: "Lakeshore East",
          color: "#ee2722",
          count: 1,
        }],
      }, {
        assetType: "escalator",
        label: "Escalator outages",
        count: 0,
        lines: [],
      }] : [],
      groups: hasRegionalOutage ? [{
        lineId: "regional-le",
        lineNumber: "LE",
        lineName: "Lakeshore East",
        color: "#ee2722",
        stations: [{
          stationId: "eglinton",
          stationName: "Eglinton",
          count: 1,
          outages: [{
            id: "regional-accessibility-smoke",
            assetType: "elevator",
            title: "Elevator out of service",
            description: "The east tunnel elevator is out of service.",
            cause: "Elevator-Escalator Disruption",
            updatedAt: "2026-07-28T18:50:33Z",
            source: "Metrolinx Open API",
          }],
        }],
      }] : [],
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/surface-notices") {
    const regional = url.searchParams.get("network") === "regional";
    const fresh = regional ? mode === "regional-live" : mode !== "unavailable";
    const notices = fresh && regional ? [{
      id: "regional-notice-smoke",
      category: "service-change",
      routeType: "GO / UP",
      routeIds: ["BR"],
      title: "Barrie station construction notice",
      description: "Use the temporary station entrance during construction.",
      location: "Aurora GO",
      stopIds: ["AU"],
      stops: [{ stopId: "AU", stopName: "Aurora GO" }],
      direction: null,
      cause: "Station General Information",
      startAt: null,
      endAt: null,
      updatedAt: "2026-07-30T13:55:00Z",
      url: null,
      source: "Metrolinx GO information, marketing + GTFS-RT bus alerts",
    }, {
      id: "regional-go-bus-notice-smoke",
      category: "detour",
      routeType: "GO Bus",
      routeIds: ["31"],
      title: "Route 31 buses are detouring",
      description: "Use temporary stops.",
      location: "",
      stopIds: [],
      stops: [],
      direction: null,
      cause: "Construction",
      startAt: null,
      endAt: null,
      updatedAt: "2026-07-30T13:56:00Z",
      url: null,
      source: "Metrolinx GO information, marketing + GTFS-RT bus alerts",
    }] : [];
    sendJson(request, response, 200, {
      generatedAt: "2026-07-30T14:00:00Z",
      fresh,
      source: regional ? "Metrolinx GO information, marketing + GTFS-RT bus alerts" : "TTC Live Alerts + GTFS-RT",
      categories: [
        { category: "service-change", label: "Service changes", count: notices.filter((notice) => notice.category === "service-change").length },
        { category: "bypass", label: "Bypasses", count: 0 },
        { category: "detour", label: "Detours", count: notices.filter((notice) => notice.category === "detour").length },
        { category: "no-service", label: "No service", count: 0 },
        { category: "notice", label: "Notices", count: 0 },
      ],
      notices: url.searchParams.get("limit") === "0" ? [] : notices,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/regional/trip-changes") {
    const fresh = mode === "regional-live";
    const stationId = url.searchParams.get("stationId");
    const query = (url.searchParams.get("query") ?? "").toLowerCase();
    const change = {
      id: "regional-trip-change-2026-06-04-BR681-cancellation",
      kind: "cancellation",
      tripId: "BR681",
      tripNumber: "681",
      lineId: "regional-br",
      lineNumber: "BR",
      lineName: "Barrie",
      destination: "Allandale Waterfront GO",
      serviceDate: "2026-06-04",
      scheduledStartAt: "2026-06-04T16:03:00Z",
      updatedAt: "2026-06-04T15:58:00Z",
      scheduleMatched: true,
      title: "Train cancelled",
      description: "Train 681 has been cancelled.",
      cause: "Operational issue",
      sourceSystems: ["metrolinx-go-train-exceptions", "metrolinx-go-gtfs-trip-updates"],
      affectedStops: [{
        stationId: "union",
        stationName: "Union Station",
        kind: "cancellation",
        scheduledAt: "2026-06-04T16:03:00Z",
        platform: "4",
      }],
    };
    const matchesStation = !stationId || change.affectedStops.some((stop) => stop.stationId === stationId);
    const matchesQuery = !query || [
      change.tripNumber,
      change.lineName,
      change.destination,
      ...change.affectedStops.map((stop) => stop.stationName),
    ].join(" ").toLowerCase().includes(query);
    sendJson(request, response, 200, {
      generatedAt: "2026-06-04T16:00:00Z",
      fresh,
      source: "Metrolinx GO trip-change feeds",
      sourceUpdatedAt: fresh ? "2026-06-04T15:58:00Z" : null,
      totalCount: fresh && matchesStation && matchesQuery ? 1 : 0,
      changes: fresh && matchesStation && matchesQuery ? [change] : [],
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/regional/trains") {
    sendJson(request, response, 200, regionalEstimatedTrainsResponse);
    return;
  }

  const regionalArrivalMatch = url.pathname.match(/^\/api\/regional\/stations\/([^/]+)\/arrivals$/);
  if (request.method === "GET" && regionalArrivalMatch) {
    const stationId = decodeURIComponent(regionalArrivalMatch[1]);
    if (mode !== "regional-live") {
      sendJson(request, response, 200, {
        stationId,
        stationName: stationId,
        availability: "disabled",
        generatedAt: "2026-07-28T19:48:00Z",
        sourceUpdatedAt: null,
        source: "Metrolinx",
        message: "Regional station arrivals are disabled.",
        arrivals: [],
      });
      return;
    }
    sendJson(request, response, 200, {
      stationId,
      stationName: "Union",
      availability: "available",
      generatedAt: "2026-06-04T16:00:00Z",
      sourceUpdatedAt: "2026-06-04T15:59:43Z",
      source: "Metrolinx GO Next Service",
      message: "Fresh Metrolinx regional train estimates.",
      arrivals: [{
        lineId: "regional-ki",
        lineNumber: "KI",
        lineName: "Kitchener",
        direction: "Kitchener GO",
        minutes: 7,
        predictedAt: "2026-06-04T16:07:00Z",
        scheduledAt: "2026-06-04T16:04:00Z",
        delayMinutes: 3,
        platform: "11",
        tripNumber: "3775",
        source: "Metrolinx GO Next Service",
        status: "live",
      }],
    });
    return;
  }

  const surfaceConnectionMatch = url.pathname.match(/^\/api\/(regional\/)?stations\/([^/]+)\/surface-connections$/);
  if (request.method === "GET" && surfaceConnectionMatch) {
    const regional = Boolean(surfaceConnectionMatch[1]);
    const stationId = decodeURIComponent(surfaceConnectionMatch[2]);
    sendJson(request, response, 200, {
      networkId: regional ? "regional" : "ttc",
      stationId,
      stationName: regional ? "Weston" : "Stub Station",
      availability: "available",
      generatedAt: "2026-08-14T13:00:00Z",
      sourceUpdatedAt: "2026-08-14T12:59:50Z",
      source: regional ? "Metrolinx GO Next Service" : "TTC GTFS-RT bus and streetcar trip updates",
      message: "Fresh station surface connections.",
      arrivals: [{
        agency: regional ? "GO Transit" : "TTC",
        mode: regional ? "bus" : "streetcar",
        route: regional ? "31" : "504",
        routeName: regional ? "Georgetown" : "King",
        destination: regional ? "Guelph" : "Dundas West Station",
        minutes: 5,
        predictedAt: "2026-08-14T13:05:00Z",
        scheduledAt: "2026-08-14T13:04:00Z",
        bayPlatform: regional ? "" : "Bay 7",
        stopName: regional ? "Weston GO" : "Stub Station at Bay 7",
        tripId: regional ? "go-bus-31" : "ttc-504",
        source: regional ? "Metrolinx GO Next Service" : "TTC GTFS-RT bus and streetcar trip updates",
        status: "live",
      }],
    });
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

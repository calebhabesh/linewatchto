import { createServer } from "node:http";
import {
  activeAlertsResponse,
  delaysResponse,
  mapResponse,
  plannedClosuresResponse,
  reducedSpeedZonesResponse,
  stationDetailResponse,
  stationSummariesResponse,
  statusResponse,
  rawAlertsResponse,
} from "./api-stub-data.mjs";

const port = Number(process.env.LINEWATCH_STUB_PORT ?? "4174");
let mode = "seeded";
let demoSessionActive = false;

const demoUser = {
  id: "user_demo",
  email: "demo@linewatch.local",
  displayName: "Demo Rider",
  demo: true,
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
    path: {
      status: "available",
      stationIds: ["stub-station", "stub-eglinton", "stub-davisville", "stub-king", "stub-union"],
      segmentIds: ["stub-line-1-segment", "stub-line-1-eglinton-davisville", "stub-line-1-king-union"],
      lineIds: ["line-1"],
      transferStationIds: [],
      estimatedTravelSeconds: 780,
      weightSource: "gtfs-scheduled-median",
      summary: "Default scheduled route: 5 stations on Line 1, about 13 min",
    },
    impact: {
      status: "affected",
      severity: "suspended",
      statusLabel: "Affected now",
      detail: "1 current impact matches this route.",
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
      ],
    },
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
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
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
    if (!["seeded", "unavailable"].includes(body.mode)) {
      sendJson(request, response, 400, { error: "Unsupported smoke stub mode" });
      return;
    }
    mode = body.mode;
    demoSessionActive = false;
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
      sendJson(request, response, 401, { error: "not_authenticated", message: "Sign in to use saved commute preferences." });
      return;
    }
    sendJson(request, response, 200, { commutes: demoCommutes });
    return;
  }

  // Public Dashboard APIs
  if (request.method === "GET" && url.pathname === "/api/map") {
    sendJson(request, response, 200, mapResponse);
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
        { id: "line-1", label: "Line 1", category: "subway", percentage: 94, target: 96, valueLabel: "94%", note: null },
        { id: "line-2", label: "Line 2", category: "subway", percentage: 91, target: 96, valueLabel: "91%", note: null },
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
      sendJson(request, response, 200, plannedClosuresResponse);
      return;
    }
    if (type === "slowdown") {
      sendJson(request, response, 200, reducedSpeedZonesResponse);
      return;
    }
    if (type === "delay") {
      sendJson(request, response, 200, delaysResponse);
      return;
    }
    if (type === "raw") {
      sendJson(request, response, 200, rawAlertsResponse);
      return;
    }
    sendJson(request, response, 200, activeAlertsResponse);
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

import { createServer } from "node:http";
import {
  activeAlertsResponse,
  delaysResponse,
  mapResponse,
  plannedClosuresResponse,
  reducedSpeedZonesResponse,
  stationSummariesResponse,
  statusResponse,
} from "./api-stub-data.mjs";

const port = Number(process.env.LINEWATCH_STUB_PORT ?? "4174");
let mode = "seeded";

function sendJson(response, status, body) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
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
    response.writeHead(204, {
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-origin": "*",
    });
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/__test/health") {
    sendJson(response, 200, { mode });
    return;
  }

  if (request.method === "POST" && url.pathname === "/__test/mode") {
    const body = await readJson(request);
    if (!["seeded", "unavailable"].includes(body.mode)) {
      sendJson(response, 400, { error: "Unsupported smoke stub mode" });
      return;
    }
    mode = body.mode;
    sendJson(response, 200, { mode });
    return;
  }

  if (mode === "unavailable" && url.pathname.startsWith("/api/")) {
    sendJson(response, 503, { error: "Smoke stub unavailable mode" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/map") {
    sendJson(response, 200, mapResponse);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/status") {
    sendJson(response, 200, statusResponse);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/alerts") {
    const type = url.searchParams.get("type");
    if (type === "planned") {
      sendJson(response, 200, plannedClosuresResponse);
      return;
    }
    if (type === "slowdown") {
      sendJson(response, 200, reducedSpeedZonesResponse);
      return;
    }
    if (type === "delay") {
      sendJson(response, 200, delaysResponse);
      return;
    }
    sendJson(response, 200, activeAlertsResponse);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/stations") {
    sendJson(response, 200, stationSummariesResponse);
    return;
  }

  sendJson(response, 404, { error: "Unknown smoke API route" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`LineWatch smoke API stub listening on http://127.0.0.1:${port}`);
});

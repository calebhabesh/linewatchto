#!/usr/bin/env node
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildScenarioFeed, scenarioNames } from "./alert-scenario-catalog.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const port = Number(process.env.LINEWATCH_ALERT_SCENARIO_PORT ?? "8081");
const scenario = process.env.LINEWATCH_ALERT_SCENARIO ?? process.argv[2] ?? "all-alert-types";

if (!scenarioNames.includes(scenario)) {
  console.error(`Unknown scenario: ${scenario}`);
  console.error(`Available scenarios: ${scenarioNames.join(", ")}`);
  process.exit(2);
}

const activeScenarioFeed = buildScenarioFeed(scenario, { now: new Date() });

function sendJson(response, status, body) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "content-type": "application/json",
  });
  response.end(JSON.stringify(body, null, 2));
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);

  if (request.method === "GET" && url.pathname === "/__scenarios") {
    sendJson(response, 200, { active: scenario, scenarios: scenarioNames });
    return;
  }

  if (request.method === "GET" && url.pathname === "/live-alerts") {
    sendJson(response, 200, activeScenarioFeed);
    return;
  }

  if (request.method === "GET" && url.pathname === "/performance-mock") {
    try {
      const htmlPath = join(__dirname, "../backend/src/test/resources/fixtures/ttc-performance-homepage.html");
      const html = readFileSync(htmlPath, "utf8");
      response.writeHead(200, {
        "access-control-allow-origin": "*",
        "content-type": "text/html; charset=utf-8",
      });
      response.end(html);
    } catch (err) {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end("Failed to read performance mock HTML");
    }
    return;
  }

  sendJson(response, 404, { error: "Unknown mock TTC alert route" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`LineWatch alert scenario server listening on http://127.0.0.1:${port}`);
  console.log(`Scenario: ${scenario}`);
  console.log(`Feed: http://127.0.0.1:${port}/live-alerts`);
});

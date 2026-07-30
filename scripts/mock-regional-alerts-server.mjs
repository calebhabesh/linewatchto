import { createServer } from "node:http";
import {
  buildRegionalScenario,
  regionalScenarioNames,
} from "./regional-alert-scenario-catalog.mjs";

const scenario = process.env.LINEWATCH_REGIONAL_ALERT_SCENARIO ?? process.argv[2] ?? "all-alert-types";
const port = Number(process.env.LINEWATCH_REGIONAL_ALERT_SCENARIO_PORT ?? 8083);
if (!regionalScenarioNames.includes(scenario)) {
  throw new Error(`Unknown scenario "${scenario}". Available: ${regionalScenarioNames.join(", ")}`);
}
const payload = buildRegionalScenario(scenario, { now: new Date() });
const emptyGoAlerts = {
  Metadata: payload.go.Metadata,
  Messages: { Message: [] },
};
const emptyGoGtfsAlerts = {
  header: payload.up.header,
  entity: [],
};
const emptyGoTrainExceptions = {
  Metadata: payload.go.Metadata,
  Trip: [],
};

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(body)}\n`);
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (request.method === "GET" && url.pathname === "/__scenarios") {
    json(response, 200, { active: scenario, scenarios: regionalScenarioNames });
  } else if (
    request.method === "GET"
    && url.pathname === "/OpenDataAPI/api/V1/ServiceUpdate/ServiceAlert/All"
  ) {
    json(response, 200, payload.go);
  } else if (
    request.method === "GET"
    && [
      "/OpenDataAPI/api/V1/ServiceUpdate/InformationAlert/All",
      "/OpenDataAPI/api/V1/ServiceUpdate/MarketingAlert/All",
    ].includes(url.pathname)
  ) {
    json(response, 200, emptyGoAlerts);
  } else if (
    request.method === "GET"
    && [
      "/OpenDataAPI/api/V1/Gtfs/Feed/Alerts",
      "/OpenDataAPI/api/V1/Gtfs/Feed/TripUpdates",
    ].includes(url.pathname)
  ) {
    json(response, 200, emptyGoGtfsAlerts);
  } else if (
    request.method === "GET"
    && url.pathname === "/OpenDataAPI/api/V1/ServiceUpdate/Exceptions/Train"
  ) {
    json(response, 200, emptyGoTrainExceptions);
  } else if (
    request.method === "GET"
    && url.pathname === "/OpenDataAPI/api/V1/UP/Gtfs/Feed/Alerts"
  ) {
    json(response, 200, payload.up);
  } else {
    json(response, 404, { error: "Not found" });
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Regional alert scenario "${scenario}" listening on http://127.0.0.1:${port}`);
});

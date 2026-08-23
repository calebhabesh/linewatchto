#!/usr/bin/env node

const frontendUrl = process.env.LINEWATCH_DEPLOY_FRONTEND_URL;
const backendUrl = process.env.LINEWATCH_DEPLOY_BACKEND_URL;

if (!frontendUrl || !backendUrl) {
  console.error("Set LINEWATCH_DEPLOY_FRONTEND_URL and LINEWATCH_DEPLOY_BACKEND_URL before running deployment smoke checks.");
  process.exit(1);
}

async function checkJson(label, url, predicate) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
  const body = await response.json();
  if (!predicate(body)) {
    throw new Error(`${label} returned an unexpected response: ${JSON.stringify(body).slice(0, 500)}`);
  }
  console.log(`ok - ${label}`);
}

async function checkHtml(label, url, expectedText) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
  const text = await response.text();
  if (!text.includes(expectedText)) {
    throw new Error(`${label} did not include expected text: ${expectedText}`);
  }
  console.log(`ok - ${label}`);
}

await checkJson("backend health", `${backendUrl}/api/health`, body => body.status === "ok");
await checkJson("ingestion health", `${backendUrl}/api/health/ingestion`, body => typeof body.status === "string" && typeof body.dashboardLive === "boolean");
await checkJson("schedule health", `${backendUrl}/api/health/schedule`, body => typeof body.status === "string" && typeof body.scheduleActive === "boolean" && Object.hasOwn(body, "serviceDaysRemaining") && Object.hasOwn(body, "refreshStatus") && Object.hasOwn(body, "refreshStartedAt") && Object.hasOwn(body, "refreshCompletedAt") && Object.hasOwn(body, "refreshErrorMessage"));
await checkJson("status", `${backendUrl}/api/status`, body => Array.isArray(body.lines) && body.generatedAt);
await checkJson("map", `${backendUrl}/api/map`, body => Array.isArray(body.stations) && Array.isArray(body.segments));
await checkJson("performance", `${backendUrl}/api/performance`, body => typeof body.status === "string" && body.source === "TTC.ca" && Array.isArray(body.metrics));
await checkJson("TTC reliability", `${backendUrl}/api/reliability/lines?network=ttc`, body => body.networkId === "ttc" && body.period === "30d" && Array.isArray(body.metrics));
await checkJson("regional reliability", `${backendUrl}/api/reliability/lines?network=regional`, body => body.networkId === "regional" && body.period === "30d" && Array.isArray(body.metrics));
await checkHtml("frontend", frontendUrl, "LineWatchTO");

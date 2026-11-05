#!/usr/bin/env node
/**
 * schedule-assets (plan 16): keeps the schedule-derived Map View and search
 * files in a shared volume current with the published TTC and GO GTFS.
 * Caddy serves the volume's manifest.json and files/ at /data/schedule/; the
 * backend reads the GO stop list and status.json from it read-only.
 *
 * Environment (defaults in brackets):
 *   SCHEDULE_ASSETS_DIR            volume root [/srv/schedule]
 *   SCHEDULE_ASSETS_BAKED_DIR      the release's copies [/app/baked]
 *   SCHEDULE_ASSETS_SCRIPTS_DIR    the generators [/app/scripts]
 *   SCHEDULE_ASSETS_NETWORKS       networks to check [ttc,go]
 *   SCHEDULE_ASSETS_TTC_INTERVAL_SECONDS [3600]   (the backend's TTC check cadence)
 *   SCHEDULE_ASSETS_GO_INTERVAL_SECONDS  [21600]
 *   SCHEDULE_ASSETS_TTC_PACKAGE_URL, SCHEDULE_ASSETS_GO_GTFS_URL  feed overrides (file: allowed)
 *   SCHEDULE_ASSETS_PORT           internal health port [8095]
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createScheduleAssetService, NETWORKS } from "./lib/service.mjs";

const env = process.env;
const root = env.SCHEDULE_ASSETS_DIR || "/srv/schedule";
const config = {
  networks: (env.SCHEDULE_ASSETS_NETWORKS || "ttc,go").split(",").map(value => value.trim()).filter(value => NETWORKS.includes(value)),
  intervals: {
    ttc: Math.max(60, Number(env.SCHEDULE_ASSETS_TTC_INTERVAL_SECONDS || 3600)),
    go: Math.max(60, Number(env.SCHEDULE_ASSETS_GO_INTERVAL_SECONDS || 21600)),
  },
  ttcPackageUrl: env.SCHEDULE_ASSETS_TTC_PACKAGE_URL
    || "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=merged-gtfs-ttc-routes-and-schedules",
  goGtfsUrl: env.SCHEDULE_ASSETS_GO_GTFS_URL
    || "https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip",
  userAgent: "LineWatchTO schedule-assets (+https://linewatchto.ca)",
};

/** One JSON line per event on stdout, which Alloy ships with the container logs. */
function log(event, fields = {}, level = "info") {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), level, service: "schedule-assets", event, ...fields })}\n`);
}

const service = createScheduleAssetService({
  root,
  bakedDir: env.SCHEDULE_ASSETS_BAKED_DIR || "/app/baked",
  scriptsDir: env.SCHEDULE_ASSETS_SCRIPTS_DIR || "/app/scripts",
  config,
  log,
});

let ready = false;
const port = Number(env.SCHEDULE_ASSETS_PORT || 8095);
createServer(async (request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(ready ? 200 : 503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ service: "schedule-assets", status: ready ? "ok" : "starting" }));
    return;
  }
  if (request.url === "/status") {
    const body = await readFile(join(root, "status.json"), "utf8").catch(() => "{}");
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(body);
    return;
  }
  response.writeHead(404).end();
}).listen(port, "0.0.0.0");

const sleep = ms => new Promise(done => setTimeout(done, ms));
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    log("stopping", { signal });
    stopping = true;
    // A generator run in progress is abandoned; its work directory is cleared on the next run.
    setTimeout(() => process.exit(0), 200);
  });
}

try {
  await service.bootstrap();
  ready = true;
  log("started", { networks: config.networks, intervals: config.intervals });
} catch (error) {
  log("bootstrap-failed", { message: error.message }, "error");
  process.exit(1);
}

// Checks run one at a time, each network on its own interval, first at start.
const due = Object.fromEntries(config.networks.map(network => [network, 0]));
while (!stopping) {
  for (const network of config.networks) {
    if (stopping || Date.now() < due[network]) continue;
    await service.check(network);
    due[network] = Date.now() + config.intervals[network] * 1000;
  }
  await sleep(15_000);
}

#!/usr/bin/env node
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

const output = resolve(process.argv[2] ?? "/tmp/ttc-merged-gtfs.zip");
const packageUrl = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=merged-gtfs-ttc-routes-and-schedules";

const packageResponse = await fetch(packageUrl);
if (!packageResponse.ok) {
  throw new Error(`CKAN package request failed: ${packageResponse.status}`);
}

const payload = await packageResponse.json();
const resources = payload?.result?.resources ?? [];
const zipResource = resources.find((resource) => {
  const url = String(resource.url ?? "");
  const format = String(resource.format ?? "").toLowerCase();
  return url.endsWith(".zip") || format.includes("zip");
});

if (!zipResource?.url) {
  throw new Error("No GTFS zip resource found in CKAN package.");
}

await mkdir(dirname(output), { recursive: true });
const gtfsResponse = await fetch(zipResource.url);
if (!gtfsResponse.ok || !gtfsResponse.body) {
  throw new Error(`GTFS download failed: ${gtfsResponse.status}`);
}

await pipeline(gtfsResponse.body, createWriteStream(output));
console.log(output);

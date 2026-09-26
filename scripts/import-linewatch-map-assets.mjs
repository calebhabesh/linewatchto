#!/usr/bin/env node

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { normalizeRegionalMapSvg, normalizeUpExpressLogoSvg } from "./lib/regional-map-normalizer.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourceRoot = process.argv[2] ?? process.env.LINEWATCH_MAP_SOURCE_DIR;

if (!sourceRoot) {
  console.error("Usage: node scripts/import-linewatch-map-assets.mjs <source-directory> [airport-source.svg]");
  console.error("Or configure via LINEWATCH_MAP_SOURCE_DIR environment variable.");
  process.exit(1);
}

const resolvedSourceRoot = resolve(sourceRoot);
const airportSource = process.argv[3]
  ?? process.env.LINEWATCH_AIRPORT_SOURCE
  ?? resolve(resolvedSourceRoot, "airport.svg");
const assetRoot = resolve(repositoryRoot, "frontend/public/assets/linewatch");
const connectionsRoot = resolve(assetRoot, "connections");

const TTC_SOURCE = resolve(resolvedSourceRoot, "TTC_Subway_Map_Custom_Edited.svg");
const REGIONAL_SOURCE = resolve(resolvedSourceRoot, "Metrolinx_Custom_Map.svg");

mkdirSync(connectionsRoot, { recursive: true });
execFileSync(process.execPath, [
  resolve(repositoryRoot, "scripts/prepare-ttc-map-asset.mjs"),
  TTC_SOURCE,
  resolve(assetRoot, "ttc-subway-map-custom.svg"),
], { stdio: "inherit" });

writeFileSync(
  resolve(assetRoot, "regional-rail-map.svg"),
  normalizeRegionalMapSvg(readFileSync(REGIONAL_SOURCE, "utf8")),
);

copyFileSync(resolve(resolvedSourceRoot, "via-rail-logo.svg"), resolve(connectionsRoot, "via-rail-logo.svg"));
copyFileSync(resolve(resolvedSourceRoot, "go-logo.svg"), resolve(connectionsRoot, "go-logo.svg"));
writeFileSync(
  resolve(connectionsRoot, "up-express-logo.svg"),
  normalizeUpExpressLogoSvg(readFileSync(resolve(resolvedSourceRoot, "up-express-logo.svg"), "utf8")),
);
copyFileSync(airportSource, resolve(connectionsRoot, "airport.svg"));

console.log(`Imported and normalized LineWatchTO maps from ${resolvedSourceRoot}`);

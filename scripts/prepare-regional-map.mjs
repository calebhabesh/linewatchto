#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { normalizeRegionalMapSvg } from "./lib/regional-map-normalizer.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const DEFAULT_TARGET = path.resolve(repositoryRoot, "frontend/public/assets/linewatch/regional-rail-map.svg");

const sourceArgument = process.argv[2]
  ?? process.env.LINEWATCH_REGIONAL_MAP_SOURCE
  ?? (process.env.LINEWATCH_MAP_SOURCE_DIR ? path.resolve(process.env.LINEWATCH_MAP_SOURCE_DIR, "Metrolinx_Custom_Map.svg") : null);

if (!sourceArgument) {
  console.error("Usage: node scripts/prepare-regional-map.mjs <source.svg> [output.svg]");
  console.error("Or configure via LINEWATCH_REGIONAL_MAP_SOURCE or LINEWATCH_MAP_SOURCE_DIR environment variables.");
  process.exit(1);
}

const sourcePath = path.resolve(sourceArgument);
const targetPath = path.resolve(process.argv[3] ?? process.env.LINEWATCH_REGIONAL_MAP_TARGET ?? DEFAULT_TARGET);

const source = await readFile(sourcePath, "utf8");
const prepared = normalizeRegionalMapSvg(source);
await writeFile(targetPath, prepared, "utf8");
console.log(`Prepared regional map: ${targetPath}`);

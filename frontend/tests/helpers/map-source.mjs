import { readFileSync } from "node:fs";

// Each System Map's component and the content it draws (plan 10 phase 3:
// app/*-map-content.ts). Source checks about what a map draws read all of
// them, so moving code between these files does not hide it from a check.
const SHARED_MAP_SOURCE_FILES = [
  "../../src/app/map-content.ts",
  "../../src/components/map-overlays/useRetainedMapItems.ts",
];

export const TTC_MAP_SOURCE_FILES = [
  "../../src/components/InteractiveTtcMap.tsx",
  "../../src/app/ttc-map-content.ts",
  ...SHARED_MAP_SOURCE_FILES,
];

export const REGIONAL_MAP_SOURCE_FILES = [
  "../../src/components/InteractiveRegionalMap.tsx",
  "../../src/app/regional-map-content.ts",
  ...SHARED_MAP_SOURCE_FILES,
];

const read = (files) => files.map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

export function readTtcMapSource() {
  return read(TTC_MAP_SOURCE_FILES);
}

export function readRegionalMapSource() {
  return read(REGIONAL_MAP_SOURCE_FILES);
}

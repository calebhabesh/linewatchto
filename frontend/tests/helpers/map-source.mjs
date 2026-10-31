import { readFileSync } from "node:fs";

// Each System Map: the engine (plan 10 phase 4: components/system-map/),
// the map's definition and its network's content adapter (app/*-map-content.ts).
// Source checks about what a map draws read all of them, so moving code
// between these files does not hide it from a check.
const SHARED_MAP_SOURCE_FILES = [
  "../../src/components/system-map/SystemMap.tsx",
  "../../src/components/system-map/system-map-definition.ts",
  "../../src/app/map-manifests.ts",
  "../../src/app/map-content.ts",
  "../../src/components/map-overlays/useRetainedMapItems.ts",
];

export const TTC_MAP_SOURCE_FILES = [
  "../../src/components/system-map/ttc-system-map.ts",
  "../../src/components/InteractiveTtcMap.tsx",
  "../../src/app/ttc-map-content.ts",
  ...SHARED_MAP_SOURCE_FILES,
];

export const REGIONAL_MAP_SOURCE_FILES = [
  "../../src/components/system-map/regional-system-map.ts",
  "../../src/components/InteractiveRegionalMap.tsx",
  "../../src/app/regional-map-content.ts",
  ...SHARED_MAP_SOURCE_FILES,
];

/** The engine alone: what every System Map does. */
export function readSystemMapSource() {
  return readFileSync(new URL("../../src/components/system-map/SystemMap.tsx", import.meta.url), "utf8");
}

const read = (files) => files.map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

export function readTtcMapSource() {
  return read(TTC_MAP_SOURCE_FILES);
}

export function readRegionalMapSource() {
  return read(REGIONAL_MAP_SOURCE_FILES);
}

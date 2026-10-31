#!/usr/bin/env node
/*
 * Checks an authored System Map SVG against its manifest
 * (frontend/src/app/map-manifests.ts) before it replaces the served asset.
 * The contract is docs/map-asset-contract.md.
 *
 *   node scripts/validate-map-asset.mjs <map id> [path/to/map.svg]
 *   node scripts/validate-map-asset.mjs --manifest <module> [path/to/map.svg]
 *
 * A map id names a manifest in MAP_MANIFESTS; --manifest takes the manifest a
 * module exports by default (a map not shipped yet, or a test fixture).
 * Without a path it checks the manifest's SVG. Exits 1 when the SVG breaks the
 * contract; warnings alone exit 0.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { MAP_MANIFESTS } from "../frontend/src/app/map-manifests.ts";
import { RASTER_MAP_DENSITIES, RASTER_MAP_THEMES } from "../frontend/src/app/map-raster-manifest.ts";
import { descendants, parseSvg, querySelector, textContent } from "./lib/svg-scan.mjs";


const normalized = (value) => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** The raster files a manifest's planes need, by file name. */
export function expectedRasterFiles(manifest) {
  return manifest.rasterPlanes.flatMap((plane) => RASTER_MAP_THEMES.flatMap((theme) => (
    RASTER_MAP_DENSITIES.map((density) => `${manifest.id}-${plane}-${theme}-${density}.png`)
  )));
}

/**
 * Checks SVG markup against a manifest. `rasterFileExists` answers for each
 * expected raster file name; omit it to skip the raster check.
 */
export function validateMapAsset(manifest, markup, rasterFileExists = null) {
  const errors = [];
  const warnings = [];
  let document;
  try {
    document = parseSvg(markup);
  } catch (error) {
    return { errors: [`The SVG does not parse: ${error.message}`], warnings };
  }
  const root = document.children.find((element) => element.tag === "svg");
  if (!root) return { errors: ["There is no root <svg> element."], warnings };

  // One coordinate space: the manifest's view box.
  const viewBox = (root.attributes.viewBox ?? "").trim().split(/[\s,]+/).map(Number);
  const expected = manifest.viewBox;
  if (viewBox.length !== 4 || [expected.x, expected.y, expected.width, expected.height]
    .some((value, index) => !(Math.abs(value - viewBox[index]) < 1e-3))) {
    errors.push(`The root view box is "${root.attributes.viewBox ?? ""}"; the manifest expects "${expected.x} ${expected.y} ${expected.width} ${expected.height}".`);
  }

  const layers = {};
  for (const [name, selector] of Object.entries(manifest.layers)) {
    layers[name] = querySelector(root, selector);
    if (!layers[name]) errors.push(`The ${name} layer (${selector}) is missing.`);
  }

  // Stations: unique ids, each a station or a part of one.
  const stationIds = [];
  if (layers.stations) {
    const seen = new Set();
    for (const element of descendants(layers.stations)) {
      const id = element.attributes.id;
      if (!id?.startsWith("station-")) continue;
      if (seen.has(id)) errors.push(`Station id ${id} is used twice.`);
      seen.add(id);
      stationIds.push(id);
    }
    if (stationIds.length === 0) errors.push(`The stations layer has no station-… elements.`);
  }
  // A part drawn for a station (TTC's station-spadina-1, GO/UP's station-union-up)
  // belongs to it, by the manifest's part suffixes.
  const stationOf = (id) => {
    const suffix = (manifest.stationPartSuffixes ?? []).find((part) => id.endsWith(part));
    return suffix ? id.slice(0, -suffix.length) : id;
  };
  const stations = [...new Set(stationIds.map(stationOf))];
  const knownStations = new Set(stations);

  // Station names: real <text>, each linked to one station.
  if (layers.stationLabels) {
    const labels = [...descendants(layers.stationLabels)].filter((element) => element.tag === "text");
    if (labels.length === 0) errors.push("The station labels layer has no <text> names.");
    const byName = new Map(stations.map((id) => [normalized(id.replace(/^station-/, "")), id]));
    const labelled = new Map();
    for (const label of labels) {
      const name = textContent(label);
      const stationId = manifest.stationLabelLink.kind === "attribute"
        ? (label.attributes[manifest.stationLabelLink.attribute]
          ? `station-${label.attributes[manifest.stationLabelLink.attribute]}`
          : null)
        : byName.get(normalized(name)) ?? null;
      if (!stationId) {
        errors.push(manifest.stationLabelLink.kind === "attribute"
          ? `Station name "${name}" has no ${manifest.stationLabelLink.attribute}.`
          : `Station name "${name}" matches no station id.`);
        continue;
      }
      if (!knownStations.has(stationId)) errors.push(`Station name "${name}" points at ${stationId}, which is not in the stations layer.`);
      if (labelled.has(stationId)) errors.push(`${stationId} has two names: "${labelled.get(stationId)}" and "${name}".`);
      labelled.set(stationId, name);
    }
    // A name lifted with a `use` cutout is drawn out of its layer, so it must
    // set its own font: a `<use>` copy does not inherit the layer's styles.
    if (manifest.stationLabels?.cutout.kind === "use") {
      const fontOf = (element) => ["font-size", "font-family"].filter((property) => (
        element.attributes[property] !== undefined || new RegExp(`(^|;)\\s*${property}\\s*:`).test(element.attributes.style ?? "")
      ));
      for (const label of labels) {
        const tspans = [...descendants(label)].filter((element) => element.tag === "tspan");
        const missing = ["font-size", "font-family"].filter((property) => !fontOf(label).includes(property)
          && !(tspans.length > 0 && tspans.every((tspan) => fontOf(tspan).includes(property))));
        if (missing.length > 0) errors.push(`Station name "${textContent(label)}" does not set its own ${missing.join(" and ")}; its lifted copy would lose the layer's.`);
      }
    }
    const unnamed = stations.filter((id) => !labelled.has(id));
    if (unnamed.length > 0) warnings.push(`Stations without a drawn name: ${unnamed.join(", ")}.`);
  }

  // Lines the overlays follow, by id or Inkscape label.
  if (layers.lines) {
    const paths = [...descendants(layers.lines)].filter((element) => element.tag === "path");
    const names = new Set(paths.flatMap((path) => [path.attributes.id, path.attributes["inkscape:label"]].filter(Boolean)));
    for (const lineId of manifest.lineIds) {
      if (!names.has(lineId)) errors.push(`Line path ${lineId} is missing from the lines layer.`);
    }
  }
  if (layers.guides) {
    const labels = new Set([...descendants(layers.guides)].map((element) => element.attributes["inkscape:label"]).filter(Boolean));
    for (const guideId of manifest.guideIds ?? []) {
      if (!labels.has(guideId)) errors.push(`Guide ${guideId} is missing from the guides layer.`);
    }
  }

  if (rasterFileExists) {
    const missing = expectedRasterFiles(manifest).filter((file) => !rasterFileExists(file));
    if (missing.length > 0) errors.push(`Raster planes are missing (run npm --prefix frontend run generate:map-rasters): ${missing.join(", ")}.`);
  }
  return { errors, warnings };
}

async function main() {
  const args = process.argv.slice(2);
  const fromModule = args[0] === "--manifest" && args[1];
  const manifest = fromModule
    ? (await import(pathToFileURL(resolve(args[1])).href)).default
    : MAP_MANIFESTS[args[0]];
  const svgPath = args[fromModule ? 2 : 1];
  if (!manifest) {
    console.error(`Usage: validate-map-asset.mjs <${Object.keys(MAP_MANIFESTS).join("|")}> [map.svg]`);
    console.error("       validate-map-asset.mjs --manifest <module> [map.svg]");
    process.exit(2);
  }
  const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "../frontend");
  const source = svgPath ? resolve(svgPath) : join(frontend, manifest.svg);
  const rasterDirectory = join(frontend, "public/assets/linewatch/raster-maps");
  const { errors, warnings } = validateMapAsset(
    manifest,
    readFileSync(source, "utf8"),
    (file) => existsSync(join(rasterDirectory, file)),
  );
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  for (const error of errors) console.error(`error: ${error}`);
  console.log(`${source}: ${errors.length} error(s), ${warnings.length} warning(s)`);
  if (errors.length > 0) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

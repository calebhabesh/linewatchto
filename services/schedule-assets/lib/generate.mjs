/**
 * Runs the existing generators (scripts/generate-surface-catalog.mjs,
 * generate-go-bus-catalog.mjs, which run generate-search-index.mjs) into a
 * work directory and returns the network's set (plan 16). The generators are
 * not changed: they are pointed at the work directory with --output.
 */

import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { scheduleAssetNames } from "../../../scripts/lib/schedule-asset-validation.mjs";
import { sha256 } from "./files.mjs";
import { FeedError } from "./feeds.mjs";

/** Release files the TTC search index reads; they stay per release (plan 16). */
export const TTC_BAKED_INPUTS = ["ttc-catalog.json", "ttc-station-bays.json"];
const GENERATOR_TIMEOUT_MS = 20 * 60 * 1000;
const HEAP_MB = Number(process.env.SCHEDULE_ASSETS_GENERATOR_HEAP_MB || 2048);

function run(script, args, { cwd, log, timeoutMs = GENERATOR_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`--max-old-space-size=${HEAP_MB}`, script, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = [];
    const keep = chunk => {
      output.push(...chunk.toString("utf8").split("\n").filter(Boolean));
      if (output.length > 400) output.splice(0, output.length - 400);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", reject);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      // The generators print one summary line per catalog; keep those for the logs.
      for (const line of output.filter(line => line.startsWith("["))) log?.("generator", { line });
      if (code === 0) resolve(output);
      else reject(new FeedError("generate", `${script.split("/").pop()} ${args.slice(0, 2).join(" ")} failed (${signal ?? code}): ${output.slice(-3).join(" | ").slice(0, 400)}`));
    });
  });
}

async function readSet(network, dir) {
  const files = {};
  for (const name of scheduleAssetNames(network)) files[name] = await readFile(join(dir, name));
  return files;
}

/**
 * TTC: streetcar, bus, then night (night reads the first two's stop files).
 * The work directory is seeded with the release's copies: every mode reruns
 * the TTC search index, which reads all of them, and the final run (after
 * night) reads only files this run wrote plus the baked station inputs.
 */
export async function generateTtc({ scriptsDir, bakedDir, archive, workDir, log }) {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  for (const name of [...TTC_BAKED_INPUTS, ...scheduleAssetNames("ttc")]) await copyFile(join(bakedDir, name), join(workDir, name));
  for (const mode of ["streetcar", "bus", "night"]) {
    await run(join(scriptsDir, "generate-surface-catalog.mjs"), [
      "--mode", mode, "--ttc-gtfs", archive, "--output", join(workDir, `ttc-surface-${mode}.json`),
    ], { cwd: workDir, log });
  }
  return readSet("ttc", workDir);
}

export async function generateGo({ scriptsDir, archive, workDir, log }) {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });
  await run(join(scriptsDir, "generate-go-bus-catalog.mjs"), [
    "--go-gtfs", archive, "--output", join(workDir, "go-surface-bus.json"), "--backend-stops", join(workDir, "go-bus-stops.csv"),
  ], { cwd: workDir, log });
  return readSet("go", workDir);
}

/** The release's own copies of a network's set: the bootstrap generation. */
export async function bakedSet(network, bakedDir) {
  return readSet(network, bakedDir);
}

/**
 * Hash of what a network's output depends on besides the feed: the generator
 * code and, for TTC, the baked station inputs. A release that changes either
 * regenerates from the cached archive.
 */
export async function generatorFingerprint(network, { scriptsDir, bakedDir }) {
  const sources = [
    network === "ttc" ? "generate-surface-catalog.mjs" : "generate-go-bus-catalog.mjs",
    "generate-search-index.mjs",
    ...(await readdir(join(scriptsDir, "lib"))).filter(name => name.endsWith(".mjs")).sort().map(name => `lib/${name}`),
  ];
  const parts = [];
  for (const name of sources) parts.push(`${name}\0${sha256(await readFile(join(scriptsDir, name)))}`);
  if (network === "ttc") {
    for (const name of TTC_BAKED_INPUTS) parts.push(`${name}\0${sha256(await readFile(join(bakedDir, name)))}`);
  }
  return sha256(parts.join("\n"));
}

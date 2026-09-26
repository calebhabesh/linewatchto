#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import {
  measureHttpEndpoint,
  parsePositiveInteger,
  renderPerformanceMarkdown,
  summarizeDurations,
} from "./lib/performance-measurements.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");

const endpointCatalog = [
  { id: "health", path: "api/health" },
  { id: "dashboard-ttc", path: "api/dashboard?network=ttc" },
  { id: "dashboard-regional", path: "api/dashboard?network=regional" },
  { id: "map", path: "api/map" },
  { id: "status", path: "api/status" },
  { id: "alerts-live", path: "api/alerts?type=live" },
];

const commandCatalog = [
  {
    id: "backend-tests",
    category: "test",
    command: "mvn",
    args: ["-f", "backend/pom.xml", "test"],
  },
  {
    id: "frontend-fixture-tests",
    category: "test",
    command: "npm",
    args: ["--prefix", "frontend", "run", "test:fixtures"],
  },
  {
    id: "frontend-scripts-tests",
    category: "test",
    command: "npm",
    args: ["--prefix", "frontend", "run", "test:scripts"],
  },
  {
    id: "frontend-typecheck",
    category: "verification",
    command: "npm",
    args: ["--prefix", "frontend", "run", "typecheck"],
  },
  {
    id: "frontend-lint",
    category: "verification",
    command: "npm",
    args: ["--prefix", "frontend", "run", "lint"],
  },
  {
    id: "frontend-build",
    category: "build",
    command: "npm",
    args: ["--prefix", "frontend", "run", "build"],
  },
  {
    id: "frontend-smoke-suite",
    category: "test",
    command: "npm",
    args: ["--prefix", "frontend", "run", "test:smoke"],
  },
  {
    id: "frontend-offline-suite",
    category: "test",
    command: "npm",
    args: ["--prefix", "frontend", "run", "test:offline"],
  },
  {
    id: "frontend-shell-desktop",
    category: "test",
    command: "npm",
    args: ["--prefix", "frontend", "run", "test:shell:desktop"],
  },
  {
    id: "frontend-shell-mobile",
    category: "test",
    command: "npm",
    args: ["--prefix", "frontend", "run", "test:shell:mobile"],
  },
];

function usage() {
  return `Usage:
  node scripts/measure-portfolio-performance.mjs api [options]
  node scripts/measure-portfolio-performance.mjs commands [options]
  node scripts/measure-portfolio-performance.mjs all [options]

Options:
  --base-url URL       API origin (default: LINEWATCH_PERF_BASE_URL or http://localhost:8080)
  --requests NUMBER    Measured sequential requests per endpoint (default: 50)
  --warmup NUMBER      Warm-up requests per endpoint (default: 5)
  --timeout-ms NUMBER  Per-request timeout (default: 5000)
  --endpoint ID=PATH   Replace the default endpoint set; repeatable
  --runs NUMBER        Runs per build/test command (default: 1)
  --command ID         Select catalog command; repeatable
  --label TEXT         Environment label stored in the report
  --output PATH        JSON report path; a Markdown sibling is also written
  --help               Show this help

Command IDs:
  ${commandCatalog.map((entry) => entry.id).join("\n  ")}`;
}

function readOptionValue(argumentsList, index, optionName) {
  const value = argumentsList[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

function parseEndpoint(value) {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    throw new Error("--endpoint must use ID=PATH format.");
  }

  return {
    id: value.slice(0, separatorIndex),
    path: value.slice(separatorIndex + 1),
  };
}

function parseArguments(argumentsList) {
  if (argumentsList.includes("--help")) {
    return { help: true };
  }

  const mode = argumentsList[0];
  if (!["api", "commands", "all"].includes(mode)) {
    throw new Error("Choose one measurement mode: api, commands, or all.");
  }

  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const options = {
    help: false,
    mode,
    baseUrl: process.env.LINEWATCH_PERF_BASE_URL ?? "http://localhost:8080",
    requests: 50,
    warmup: 5,
    timeoutMs: 5_000,
    runs: 1,
    endpoints: [],
    commandIds: [],
    label: "local",
    output: path.join(
      repositoryRoot,
      "artifacts",
      "performance",
      `linewatch-performance-${timestamp}.json`,
    ),
  };

  for (let index = 1; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--base-url") {
      options.baseUrl = readOptionValue(argumentsList, index, argument);
      index += 1;
    } else if (argument === "--requests") {
      options.requests = parsePositiveInteger(
        readOptionValue(argumentsList, index, argument),
        argument,
      );
      index += 1;
    } else if (argument === "--warmup") {
      options.warmup = parsePositiveInteger(
        readOptionValue(argumentsList, index, argument),
        argument,
      );
      index += 1;
    } else if (argument === "--timeout-ms") {
      options.timeoutMs = parsePositiveInteger(
        readOptionValue(argumentsList, index, argument),
        argument,
      );
      index += 1;
    } else if (argument === "--runs") {
      options.runs = parsePositiveInteger(
        readOptionValue(argumentsList, index, argument),
        argument,
      );
      index += 1;
    } else if (argument === "--endpoint") {
      options.endpoints.push(
        parseEndpoint(readOptionValue(argumentsList, index, argument)),
      );
      index += 1;
    } else if (argument === "--command") {
      options.commandIds.push(readOptionValue(argumentsList, index, argument));
      index += 1;
    } else if (argument === "--label") {
      options.label = readOptionValue(argumentsList, index, argument);
      index += 1;
    } else if (argument === "--output") {
      options.output = path.resolve(
        repositoryRoot,
        readOptionValue(argumentsList, index, argument),
      );
      index += 1;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

function commandOutput(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function environmentMetadata(label) {
  const cpu = os.cpus()[0];
  return {
    label,
    platform: process.platform,
    release: os.release(),
    architecture: process.arch,
    logicalCpuCount: os.cpus().length,
    cpuModel: cpu?.model ?? null,
    totalMemoryBytes: os.totalmem(),
    nodeVersion: process.version,
    javaVersion: commandOutput("java", ["--version"])?.split("\n")[0] ?? null,
    mavenVersion: commandOutput("mvn", ["--version"])?.split("\n")[0] ?? null,
  };
}

function sourceMetadata() {
  return {
    commit: commandOutput("git", ["rev-parse", "HEAD"]),
    branch: commandOutput("git", ["branch", "--show-current"]),
    dirty: Boolean(commandOutput("git", ["status", "--porcelain"])),
  };
}

function runCommand(entry) {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const child = spawn(entry.command, entry.args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "inherit",
    });

    child.on("error", (error) => {
      resolve({
        durationMs: performance.now() - startedAt,
        exitCode: null,
        error: error.message,
      });
    });
    child.on("close", (exitCode, signal) => {
      resolve({
        durationMs: performance.now() - startedAt,
        exitCode,
        error: signal ? `Terminated by ${signal}` : null,
      });
    });
  });
}

async function measureCommands(options) {
  const unknownIds = options.commandIds.filter(
    (id) => !commandCatalog.some((entry) => entry.id === id),
  );
  if (unknownIds.length > 0) {
    throw new Error(`Unknown command ID: ${unknownIds.join(", ")}`);
  }

  const entries = options.commandIds.length === 0
    ? commandCatalog
    : commandCatalog.filter((entry) => options.commandIds.includes(entry.id));
  const results = [];

  for (const entry of entries) {
    const samples = [];
    for (let run = 1; run <= options.runs; run += 1) {
      console.log(`\n[${entry.id}] run ${run}/${options.runs}`);
      samples.push(await runCommand(entry));
    }

    const successfulSamples = samples.filter(
      (sample) => sample.exitCode === 0 && sample.error === null,
    );
    results.push({
      id: entry.id,
      category: entry.category,
      command: [entry.command, ...entry.args].join(" "),
      runs: options.runs,
      successfulRuns: successfulSamples.length,
      timings: successfulSamples.length === 0
        ? null
        : summarizeDurations(
            successfulSamples.map((sample) => sample.durationMs),
          ),
      attemptTimings: summarizeDurations(
        samples.map((sample) => sample.durationMs),
      ),
      exitCodes: samples.map((sample) => sample.exitCode),
      errors: [...new Set(
        samples
          .map((sample) => sample.error)
          .filter((error) => error !== null),
      )],
    });
  }

  return results;
}

async function measureApi(options) {
  const endpoints = options.endpoints.length === 0
    ? endpointCatalog
    : options.endpoints;
  const results = [];

  for (const endpoint of endpoints) {
    console.log(
      `[${endpoint.id}] ${options.warmup} warm-up + ${options.requests} measured requests`,
    );
    results.push(await measureHttpEndpoint({
      baseUrl: options.baseUrl,
      endpoint,
      requests: options.requests,
      warmup: options.warmup,
      timeoutMs: options.timeoutMs,
    }));
  }

  return {
    baseUrl: options.baseUrl,
    methodology: "sequential requests from one client; warm-up excluded",
    timeoutMs: options.timeoutMs,
    endpoints: results,
  };
}

async function writeReport(outputPath, report) {
  const jsonPath = outputPath.endsWith(".json")
    ? outputPath
    : `${outputPath}.json`;
  const markdownPath = jsonPath.replace(/\.json$/, ".md");

  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, renderPerformanceMarkdown(report));
  return { jsonPath, markdownPath };
}

function reportHasFailures(report) {
  return (
    report.api?.endpoints.some((endpoint) => endpoint.failedRequests > 0)
    || report.commands?.some(
      (command) => command.successfulRuns !== command.runs,
    )
    || false
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: environmentMetadata(options.label),
    source: sourceMetadata(),
  };

  if (options.mode === "api" || options.mode === "all") {
    report.api = await measureApi(options);
  }
  if (options.mode === "commands" || options.mode === "all") {
    report.commands = await measureCommands(options);
  }

  const paths = await writeReport(options.output, report);
  console.log(`\nJSON report: ${paths.jsonPath}`);
  console.log(`Markdown report: ${paths.markdownPath}`);

  if (reportHasFailures(report)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error(usage());
  process.exitCode = 1;
});

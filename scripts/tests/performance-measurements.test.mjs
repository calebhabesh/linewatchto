import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEndpointUrl,
  measureHttpEndpoint,
  parsePositiveInteger,
  renderPerformanceMarkdown,
  summarizeDurations,
} from "../lib/performance-measurements.mjs";

test("summarizeDurations reports stable percentile and mean values", () => {
  assert.deepEqual(summarizeDurations([40, 10, 30, 20]), {
    count: 4,
    minMs: 10,
    medianMs: 25,
    p95Ms: 38.5,
    p99Ms: 39.7,
    maxMs: 40,
    meanMs: 25,
  });
});

test("summarizeDurations rejects an empty sample", () => {
  assert.throws(
    () => summarizeDurations([]),
    /at least one duration sample/,
  );
});

test("buildEndpointUrl preserves the base path and endpoint query", () => {
  assert.equal(
    buildEndpointUrl(
      "https://linewatchto.ca/api/",
      "dashboard?network=regional",
    ),
    "https://linewatchto.ca/api/dashboard?network=regional",
  );
});

test("buildEndpointUrl rejects endpoints outside the benchmark origin", () => {
  assert.throws(
    () => buildEndpointUrl("https://linewatchto.ca/api", "https://example.com"),
    /relative endpoint path/,
  );
  assert.throws(
    () => buildEndpointUrl("https://linewatchto.ca/api", "\\\\example.com/path"),
    /benchmark origin/,
  );
});

test("buildEndpointUrl rejects unsupported protocols and embedded credentials", () => {
  assert.throws(
    () => buildEndpointUrl("file:///tmp/report", "api/health"),
    /HTTP or HTTPS/,
  );
  assert.throws(
    () => buildEndpointUrl(
      "https://portfolio-user:secret@linewatchto.ca",
      "api/health",
    ),
    /must not contain credentials/,
  );
});

test("parsePositiveInteger validates command-line sample sizes", () => {
  assert.equal(parsePositiveInteger("25", "--requests"), 25);
  assert.throws(
    () => parsePositiveInteger("0", "--requests"),
    /positive integer/,
  );
  assert.throws(
    () => parsePositiveInteger("2.5", "--requests"),
    /positive integer/,
  );
});

test("measureHttpEndpoint excludes warm-up requests and records response health", async () => {
  let callCount = 0;
  const fetchImplementation = async () => {
    callCount += 1;
    return new Response(JSON.stringify({ status: "ok" }), {
      status: callCount === 3 ? 503 : 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await measureHttpEndpoint({
    baseUrl: "http://localhost:8080",
    endpoint: { id: "health", path: "api/health" },
    requests: 3,
    warmup: 1,
    timeoutMs: 1_000,
    fetchImplementation,
  });

  assert.equal(callCount, 4);
  assert.equal(result.requests, 3);
  assert.equal(result.warmupRequests, 1);
  assert.equal(result.successfulRequests, 2);
  assert.equal(result.failedRequests, 1);
  assert.deepEqual(result.statusCounts, { 200: 2, 503: 1 });
  assert.deepEqual(result.errors, ["HTTP 503"]);
  assert.equal(result.latency.count, 2);
  assert.equal(result.attemptLatency.count, 3);
});

test("measureHttpEndpoint retains the network failure cause", async () => {
  const fetchImplementation = async () => {
    throw new TypeError("fetch failed", {
      cause: new Error("connect ECONNREFUSED 127.0.0.1:8080"),
    });
  };

  const result = await measureHttpEndpoint({
    baseUrl: "http://localhost:8080",
    endpoint: { id: "health", path: "api/health" },
    requests: 1,
    warmup: 1,
    timeoutMs: 1_000,
    fetchImplementation,
  });

  assert.deepEqual(result.errors, [
    "fetch failed: connect ECONNREFUSED 127.0.0.1:8080",
  ]);
  assert.equal(result.latency, null);
  assert.equal(result.attemptLatency.count, 1);
});

test("renderPerformanceMarkdown retains reproducibility and failure details", () => {
  const markdown = renderPerformanceMarkdown({
    generatedAt: "2026-07-29T12:00:00.000Z",
    environment: {
      label: "sandbox",
      platform: "linux",
      release: "6.0",
      architecture: "x64",
      logicalCpuCount: 8,
      cpuModel: "Example CPU",
      totalMemoryBytes: 16_000_000_000,
      nodeVersion: "v24.0.0",
      javaVersion: "openjdk 21",
      mavenVersion: "Apache Maven 3.9",
    },
    source: {
      commit: "abc123",
      branch: "main",
      dirty: true,
    },
    api: {
      baseUrl: "http://localhost:8080",
      methodology: "sequential requests from one client; warm-up excluded",
      timeoutMs: 1_000,
      endpoints: [{
        path: "api/health",
        requests: 2,
        warmupRequests: 1,
        successfulRequests: 1,
        failedRequests: 1,
        statusCounts: { 200: 1, 503: 1 },
        latency: {
          medianMs: 10,
          p95Ms: 10,
          p99Ms: 10,
          meanMs: 10,
        },
        responseBytes: { mean: 42 },
        errors: ["HTTP 503"],
      }],
    },
    commands: [{
      command: "npm --prefix frontend run build",
      runs: 1,
      successfulRuns: 0,
      timings: null,
      exitCodes: [1],
      errors: [],
    }],
  });

  assert.match(markdown, /Timeout: 1000 ms/);
  assert.match(markdown, /branch `main`; worktree dirty/);
  assert.match(markdown, /### API failures/);
  assert.match(markdown, /statuses \{"200":1,"503":1\}/);
  assert.match(markdown, /errors: HTTP 503/);
  assert.match(markdown, /### Command failures/);
  assert.match(markdown, /exit codes \[1\]/);
});

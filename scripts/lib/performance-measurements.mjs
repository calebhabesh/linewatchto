import { performance } from "node:perf_hooks";

function round(value) {
  return Number(value.toFixed(3));
}

function percentile(sortedValues, percentage) {
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const rank = (percentage / 100) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const weight = rank - lowerIndex;

  return (
    sortedValues[lowerIndex] * (1 - weight)
    + sortedValues[upperIndex] * weight
  );
}

export function summarizeDurations(durations) {
  if (!Array.isArray(durations) || durations.length === 0) {
    throw new Error("Expected at least one duration sample.");
  }

  const sorted = durations.toSorted((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);

  return {
    count: sorted.length,
    minMs: round(sorted[0]),
    medianMs: round(percentile(sorted, 50)),
    p95Ms: round(percentile(sorted, 95)),
    p99Ms: round(percentile(sorted, 99)),
    maxMs: round(sorted.at(-1)),
    meanMs: round(total / sorted.length),
  };
}

export function parsePositiveInteger(value, optionName) {
  if (!/^[1-9]\d*$/.test(value ?? "")) {
    throw new Error(`${optionName} must be a positive integer.`);
  }

  return Number.parseInt(value, 10);
}

export function buildEndpointUrl(baseUrl, endpointPath) {
  if (/^[a-z][a-z\d+.-]*:/i.test(endpointPath)) {
    throw new Error("Expected a relative endpoint path, not an absolute URL.");
  }

  const parsedBase = new URL(baseUrl);
  if (!["http:", "https:"].includes(parsedBase.protocol)) {
    throw new Error("The benchmark base URL must use HTTP or HTTPS.");
  }
  if (parsedBase.username || parsedBase.password) {
    throw new Error("The benchmark base URL must not contain credentials.");
  }

  const normalizedBase = `${parsedBase.toString().replace(/\/+$/, "")}/`;
  const normalizedEndpoint = endpointPath.replace(/^\/+/, "");
  const resolvedEndpoint = new URL(normalizedEndpoint, normalizedBase);
  if (resolvedEndpoint.origin !== parsedBase.origin) {
    throw new Error("Expected an endpoint path on the benchmark origin.");
  }

  return resolvedEndpoint.toString();
}

function formatErrors(errors) {
  return errors.length === 0 ? "none" : errors.join("; ");
}

export function renderPerformanceMarkdown(report) {
  const lines = [
    "# LineWatchTO performance measurement",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Environment: ${report.environment.label}; ${report.environment.platform} ${report.environment.release}; ${report.environment.architecture}; ${report.environment.logicalCpuCount} logical CPUs (${report.environment.cpuModel ?? "unknown model"}); ${report.environment.totalMemoryBytes} bytes memory.`,
    "",
    `Runtimes: Node ${report.environment.nodeVersion}; Java ${report.environment.javaVersion ?? "unknown"}; Maven ${report.environment.mavenVersion ?? "unknown"}.`,
    "",
    `Source: \`${report.source.commit ?? "unknown"}\`; branch \`${report.source.branch ?? "unknown"}\`; worktree ${report.source.dirty ? "dirty" : "clean"}.`,
    "",
  ];

  if (report.api) {
    lines.push(
      "## API latency",
      "",
      `${report.api.methodology}. Base URL: \`${report.api.baseUrl}\`. Timeout: ${report.api.timeoutMs} ms.`,
      "",
      "| Endpoint | Warm-up | Measured | Success | Median | p95 | p99 | Mean | Response bytes (mean) |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...report.api.endpoints.map((endpoint) =>
        `| \`${endpoint.path}\` | ${endpoint.warmupRequests} | ${endpoint.requests} | ${endpoint.successfulRequests}/${endpoint.requests} | ${endpoint.latency ? `${endpoint.latency.medianMs} ms` : "n/a"} | ${endpoint.latency ? `${endpoint.latency.p95Ms} ms` : "n/a"} | ${endpoint.latency ? `${endpoint.latency.p99Ms} ms` : "n/a"} | ${endpoint.latency ? `${endpoint.latency.meanMs} ms` : "n/a"} | ${endpoint.responseBytes?.mean ?? "n/a"} |`
      ),
      "",
    );

    const failedEndpoints = report.api.endpoints.filter(
      (endpoint) => endpoint.failedRequests > 0,
    );
    if (failedEndpoints.length > 0) {
      lines.push(
        "### API failures",
        "",
        ...failedEndpoints.map((endpoint) =>
          `- \`${endpoint.path}\`: ${endpoint.failedRequests} failed; statuses ${JSON.stringify(endpoint.statusCounts)}; errors: ${formatErrors(endpoint.errors)}.`
        ),
        "",
      );
    }
  }

  if (report.commands) {
    lines.push(
      "## Build and test timings",
      "",
      "Commands ran against the existing checkout and dependency caches; no cache directories were cleared.",
      "",
      "| Command | Runs | Success | Median | Min | Max |",
      "| --- | ---: | ---: | ---: | ---: | ---: |",
      ...report.commands.map((command) =>
        `| \`${command.command}\` | ${command.runs} | ${command.successfulRuns}/${command.runs} | ${command.timings ? `${command.timings.medianMs} ms` : "n/a"} | ${command.timings ? `${command.timings.minMs} ms` : "n/a"} | ${command.timings ? `${command.timings.maxMs} ms` : "n/a"} |`
      ),
      "",
    );

    const failedCommands = report.commands.filter(
      (command) => command.successfulRuns !== command.runs,
    );
    if (failedCommands.length > 0) {
      lines.push(
        "### Command failures",
        "",
        ...failedCommands.map((command) =>
          `- \`${command.command}\`: exit codes ${JSON.stringify(command.exitCodes)}; errors: ${formatErrors(command.errors)}.`
        ),
        "",
      );
    }
  }

  lines.push(
    "These measurements describe one environment and are not service-level objectives or capacity claims.",
    "",
  );
  return lines.join("\n");
}

async function requestSample(url, timeoutMs, fetchImplementation) {
  const startedAt = performance.now();

  try {
    const response = await fetchImplementation(url, {
      headers: {
        accept: "application/json",
        "cache-control": "no-cache",
      },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.arrayBuffer();
    return {
      durationMs: performance.now() - startedAt,
      status: response.status,
      bytes: body.byteLength,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    const primaryMessage = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error && error.cause instanceof Error
      ? error.cause.message
      : null;
    return {
      durationMs: performance.now() - startedAt,
      status: null,
      bytes: 0,
      error: cause ? `${primaryMessage}: ${cause}` : primaryMessage,
    };
  }
}

export async function measureHttpEndpoint({
  baseUrl,
  endpoint,
  requests,
  warmup,
  timeoutMs,
  fetchImplementation = fetch,
}) {
  const url = buildEndpointUrl(baseUrl, endpoint.path);

  for (let index = 0; index < warmup; index += 1) {
    await requestSample(url, timeoutMs, fetchImplementation);
  }

  const samples = [];
  for (let index = 0; index < requests; index += 1) {
    samples.push(await requestSample(url, timeoutMs, fetchImplementation));
  }

  const statusCounts = {};
  for (const sample of samples) {
    const key = sample.status === null ? "network-error" : String(sample.status);
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }

  const successfulSamples = samples.filter((sample) => sample.error === null);
  const responseBytes = successfulSamples.map((sample) => sample.bytes);

  return {
    id: endpoint.id,
    path: endpoint.path,
    requests,
    warmupRequests: warmup,
    successfulRequests: successfulSamples.length,
    failedRequests: samples.length - successfulSamples.length,
    statusCounts,
    latency: successfulSamples.length === 0
      ? null
      : summarizeDurations(
          successfulSamples.map((sample) => sample.durationMs),
        ),
    attemptLatency: summarizeDurations(
      samples.map((sample) => sample.durationMs),
    ),
    responseBytes: responseBytes.length === 0
      ? null
      : {
          min: Math.min(...responseBytes),
          max: Math.max(...responseBytes),
          mean: round(
            responseBytes.reduce((sum, value) => sum + value, 0)
            / responseBytes.length,
          ),
        },
    errors: [...new Set(
      samples
        .map((sample) => sample.error)
        .filter((error) => error !== null),
    )],
  };
}

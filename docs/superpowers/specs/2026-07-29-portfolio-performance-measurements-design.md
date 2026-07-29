# Portfolio Performance Measurements Design

Date: 2026-07-29

## Goal

Give LineWatchTO a dependency-free, repeatable way to measure its primary
read-only API boundaries and the wall-clock cost of its build and verification
commands. The workflow should produce evidence that can be attached to a
portfolio review without turning one developer-machine result into a production
capacity claim.

## Measurement boundary

The runner has two independent modes:

- `api` sends sequential `GET` requests from one client to a configured
  LineWatchTO origin. It warms each endpoint first, excludes warm-up requests,
  consumes each full response body, and reports success counts, response sizes,
  and min, median, p95, p99, max, and mean successful-response latency. Failed
  attempt duration is retained separately and cannot distort successful latency.
- `commands` runs catalogued backend and frontend build, test, and verification
  commands as child processes. It records wall-clock duration and exit status
  for every run without deleting dependency or build caches.

`all` combines both modes when a backend is already available. API measurements
are intentionally sequential. Load, saturation, and concurrency testing remains
the separate production runbook's responsibility.

## Reproducibility

Every report records:

- UTC generation time and a caller-supplied environment label;
- OS, architecture, CPU model/count, memory, Node, Java, and Maven metadata;
- Git commit, branch, and whether the worktree was dirty;
- exact endpoint paths, request and warm-up counts, timeout, command text, run
  counts, exit statuses, and failures.

The tool writes equivalent JSON and Markdown reports beneath
`artifacts/performance/` by default. That directory is ignored because results
depend on the machine, cache state, database contents, ingestion freshness, and
network path. A reviewer can retain or publish a chosen report alongside the
environment description instead of silently replacing a source-controlled
"latest" number.

For fair comparisons, use the same host, power profile, source state,
dependency-cache state, backend profile, database snapshot, request counts, and
endpoint set. Run production API measurements from a separate client and
identify whether Cloudflare/Caddy caching is in the path.

## Failure semantics

The report is written even when an HTTP request or command fails. The process
then exits nonzero. API status counts and unique errors remain visible, and
command results retain exit codes. Failed attempts are not included in the
headline successful latency or timing summary. This prevents a partial run from
looking like a successful benchmark.

The default API set is read-only and unauthenticated:

- health;
- TTC and regional dashboard boundaries;
- TTC map and line status;
- current TTC alert cards.

Custom endpoint paths are accepted, but absolute URLs are rejected so a single
run cannot accidentally send requests to an unrelated origin.

## Verification

Pure measurement behavior is covered with Node's built-in test runner. Tests
verify percentile interpolation, input validation, endpoint URL resolution,
warm-up exclusion, response status accounting, and failure reporting.

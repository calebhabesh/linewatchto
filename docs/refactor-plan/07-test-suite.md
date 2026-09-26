# Test-suite cleanup after the application refactor

Use the [index](README.md) and [verification policy](01-verification.md).
Implement T1–T5 after the backend, frontend, map and CSS work has stabilized,
before final publication checks. Gemini should handle one reviewed chunk at
a time. Existing implementation chunks must continue adding/moving their
regression coverage; this final pass reconciles the complete suite.

The goal is a suite whose tests have clear owners, exercise current behavior,
fail usefully, and run at an appropriate cost. Fewer tests or higher coverage
percentages are not completion targets. This plan is based on repository
inspection; no new test timing or flakiness measurements were taken for it.

## Evidence to recheck after refactoring

- [Frontend package scripts](../../frontend/package.json) discover fast tests
  with `tests/*.test.mjs` and select E2E files explicitly. Moving a test into a
  subdirectory can silently exclude it unless discovery changes with the move.
- [Playwright configuration](../../frontend/playwright.config.ts) places browser
  specs under `tests/smoke`, including broader regression tests; it uses shared
  fixed app/stub ports and an absolute output directory. One worker deliberately
  protects mutable scenario state, and CI retries once. These are constraints
  to investigate, not proof of unnecessary configuration or flaky tests.
- [Testing guidance](../testing.md) describes separate shell suites and retired
  centering expectations. Recheck whether earlier chunks already resolved them.
- [Verification](01-verification.md) identifies source-string assertions tied to
  original component locations. Earlier chunks should replace affected cases;
  the final pass must find any survivors and transitional duplicates.
- Backend tests include both behavioral tests and migration/repository tests
  that inspect SQL text. B6 requires real PostgreSQL activation/rollback
  coverage; a source assertion cannot replace it during cleanup.

## T1 — Inventory final behavior coverage and test ownership

Start from the final application commit and V1's coverage map. Inventory
frontend fast tests, browser/visual/compatibility suites, backend tests,
database integration checks, generator/script tests, and separate screenshot
or account-edit configurations. Record which commands and CI jobs discover
each test, including intentional manual-only tooling checks.

For each behavior family, record its current production owner, test interface,
covered conditions, layer, fixture owner, command and disposition: retain,
move, replace, merge, delete, or gap. Keep this in a compact inventory artifact
linked from the handoff, using one row per behavior family rather than a
permanent duplicate listing of every test function.

Distinguish overlapping assertions from distinct protection. A pure freshness
test and a browser offline flow can legitimately cover the same rule at
different integration points. Different networks, failure conditions, browser
engines, stored-data versions and account owners are not interchangeable.

**Done:** every test file is accounted for by a behavior/tooling owner and a
discovery path; exclusions and gaps are explicit. Tests left behind by moved
or deleted production modules have a justified disposition.

## T2 — Align tests with the final interfaces

Work one behavior family at a time, starting with owners extracted in B/F/M.
Move focused logic tests to those public interfaces. Keep orchestration tests
that prove the callers are wired correctly, and retain browser coverage for
integrated rider flows and DOM/browser behavior.

Replace remaining source-text assertions of handler locations, exact JSX,
incidental declarations, or private helper names with observable behavior.
Keep intentional structural contracts such as SVG IDs, stylesheet order,
private endpoint blocking and dependency direction where those are the rule
being tested. Backend SQL text checks may retain a narrow migration contract,
but label them accurately and preserve real database execution coverage.

Merge tests only when setup, input condition, boundary and failure detected
are genuinely equivalent. For each removed test, identify the retained test
that detects its regression, or the proven retired feature/code path. Historical
compatibility cases stay while supported stored data, API shapes or clients
depend on them. Re-baselining snapshots is not a substitute for investigating
changed behavior.

Use domain-scoped fixture builders only for repeated meaningful setup. Reuse
existing helpers first; make important values explicit at the test site. Avoid
a universal fixture with many flags, production algorithms copied into expected
results, or broad mocks that bypass the behavior under test. Keep generated
scenario catalogs authoritative and fixture/demo labels intact.

**Done:** tests follow the new interfaces, removed assertions have accounted-for
protection, and no old/new test pair remains solely to bridge an extraction.
Run the affected family and its required layer gate once stable.

## T3 — Organize suites and make discovery explicit

Choose grouping by behavior and execution layer from T1's actual inventory.
Backend test packages should track domain ownership; frontend groups should
make a test for a module or rider flow easy to find. File/folder moves are
optional when current organization is already clear.

Update discovery atomically with moves: Node test globs, Maven naming/plugin
selection, Playwright `testDir`/`testMatch`, project restrictions, package
commands, snapshot paths, CI, and tooling configurations. Account for shell,
account, offline and geographic specs outside the current E2E catalog. Keep
smoke small and separate from full regression even if they share helpers.

Compare discovered test identities before/after, not just passing counts.
Use Playwright's test listing and the relevant runner reports to catch files
silently omitted by a new pattern. Record intentional additions/removals and
project differences. If introducing a separate Maven integration-test phase,
make its CI/local invocation explicit; moving a test to an undiscovered naming
pattern must never masquerade as a faster suite.

**Done:** each retained test is selected by a documented command; CI and release
coverage are intentional; moved snapshots still cover the same states and
are reviewed. Update [testing](../testing.md) with final commands and purpose,
then have P4 consume that routing rather than duplicate it.

## T4 — Reliability, isolation and meaningful failure evidence

Inspect shared stub scenarios, fake clocks/timers, module caches, database rows,
local/session storage, service workers, mock resets and test output directories.
Confirm teardown after success and failure. Tests must not depend on order,
leftover state, a developer's running server or live provider credentials.

Replace fixed sleeps where a visible state, event, controlled clock or bounded
poll can prove readiness. Record retry-dependent failures as such; adding
retries or timeouts is not a flakiness fix. Preserve screenshots/traces and
diagnostic output that identify the failed behavior without logging secrets.

If measurements justify browser parallelism, first isolate scenarios per
worker/context through the real request path. Browser request interception
alone may not isolate server-side Next.js fetches to the shared backend stub.
Account for database state, ports, output directories and service workers.
Otherwise retain the existing serial execution. Do not enable parallel tests
against a mutable shared scenario server.

**Acceptance:** selected stateful cases pass alone and in reordered/repeated
runs; parallel execution is tested only if isolation changed. Use bounded
repeats to investigate a specific race rather than repeatedly running every
suite. Record failures and environment limitations, including supported WebKit
execution, instead of hiding them with skips.

**Done:** identified order/race failures are resolved or explicitly tracked,
fixture state has a clear lifetime, and failures retain useful evidence.

## T5 — Measure execution cost and close the suite pass

Measure the post-application-refactor suite before test optimization. Separate
install/build/server startup from test execution; record commit, environment,
selected tests/projects, discovered/pass/skip counts, retries, elapsed time and
slowest groups. Use existing performance tooling where applicable and runner
reports for finer timing. Compare equivalent workloads with matching builds.

Optimize demonstrated costs: repeated setup, duplicate parsing/compilation,
unnecessary full browser flows for pure rules, redundant server/build starts,
and expensive fixtures. Reuse immutable fixtures and matching build artifacts
where safe; preserve per-test mutable-state isolation. Change concurrency only
after T4 proves isolation. No test-framework migration is required by this plan.

After final changes, run the affected complete tiers and required integration
gates from the verification policy. Compare T1/T3 coverage/discovery with the
final reports. For critical replacement tests, demonstrate that a representative
wrong result is detected where practical; a broad mutation-testing rollout is
not required. Coordinate CI execution with P4 and reuse unchanged results.

**Done:** deliver a concise before/after report of structure, removed/replaced
coverage, runtime, retry/failure observations and remaining gaps. Every deletion
is justified, essential invariants remain covered, and documented commands
run the intended suite. Report maintainability improvements separately when
no speedup is measured. Record completion in the main handoff for final V2/P4.

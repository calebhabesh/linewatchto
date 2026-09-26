# Verification and baseline

Use with the [index](README.md). This file owns verification policy for these
plans; [testing](../testing.md) and scoped guides define the actual gates.
No application suite or runtime benchmark was run during planning.

## V1 — Establish a trustworthy baseline

**Evidence.** [Frontend scripts](../../frontend/package.json) enumerate E2E
specs explicitly. [CI](../../.github/workflows/ci.yml), lines 44–79 at the
baseline, runs fast tests, typecheck, lint, build, smoke, browser geometry, and
mobile map fit. It does not run all shell, account, offline, or geographic
lifecycle flows. [Testing guidance](../testing.md) already identifies obsolete
floating-control expectations in `vertical-centering-and-switch.spec.ts`.

1. Record HEAD, dirty files, environment/tool versions, and enabled fixture
   configuration. Start with the affected layer's existing gates once. Reuse a
   matching production build as documented; run mutable-stub suites serially.
2. Record each failure as pre-existing, introduced, or unresolved. Correct the
   obsolete centering expectations against current sidebar/workspace behavior
   before relying on those cases. Preserve actual map centering coverage.
3. Build a compact coverage map: public entry point → behavior → existing test
   → meaningful gap. Cover backend packages, frontend routes/hooks/data modules,
   renderers, service worker, generators and CSS owners. Inspect areas outside
   the named hotspots and record retain/change/investigate with a reason; this
   closes the targeted audit's coverage gap without demanding a rewrite.
4. For the selected chunk, add only missing high-value characterization. Use
   fixed clocks/fixtures and controllable response order. Correctness includes
   disabled, stale, offline, partial, and failure paths, not just fresh data.

**Done:** the next chunk has an interpretable baseline and a behavioral oracle;
known unrelated failures are documented rather than hidden or broadly fixed.

## Replace assertions at the affected seam

Examples of migration debt:

- [account-ui-source.test.mjs](../../frontend/tests/account-ui-source.test.mjs),
  lines 24 and 93, depends on handlers/JSX physically staying in the shell.
- [desktop-content-migration.test.mjs](../../frontend/tests/desktop-content-migration.test.mjs),
  line 75, checks component placement/control-flow text.
- [map-layering.test.mjs](../../frontend/tests/map-layering.test.mjs), lines 6
  and 41, inspects the older `transit-map.tsx` renderer.
- [my-commutes-console-ui.test.mjs](../../frontend/tests/my-commutes-console-ui.test.mjs)
  asserts literal CSS declarations.

Replace a brittle assertion with a test of the behavior it was intended to
protect before deleting it. Pure rules should be imported by fast tests;
browser APIs, SVG DOM geometry, gestures, focus, and history belong in focused
browser checks. Do not move string matching to the new filename and call that
behavioral coverage. Keep tests for intentional import order, private endpoint
blocking, asset layer IDs, and other real structural contracts.

Use the existing test harness first. A new test framework/dependency requires
a demonstrated gap; Node's lack of SVG DOM APIs can be addressed with the
existing browser harness. Fake repository calls and SQL substring tests do
not demonstrate a real transaction rollback.

## Required final checks by changed surface

| Surface | Gate when stable |
| --- | --- |
| Frontend behavior/TypeScript | `npm --prefix frontend run test:fast`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run lint` |
| Rendering, imports/bundling, routing, dependencies, Server/Client boundaries | Above plus `npm --prefix frontend run build` and relevant smoke/E2E |
| Broad shell/navigation/map interaction | Above plus full smoke/E2E; explicitly run affected shell/account/offline/geographic specs missing from the catalog |
| Map geometry/viewport | Browser compatibility and map-fit checks where geometry, gestures, rotation, or fit changed |
| Shared global styling/design system | Full visual suite, with reviewed differences |
| Local CSS removal | Diff and affected view; focused browser inspection for cascade/layout uncertainty |
| Backend | Targeted tests during work, then `mvn -f backend/pom.xml test`; real integration checks for affected persistence/security/contracts |
| Docs only | Diff and link review |

For explicit browser specs, use the existing Playwright configuration from
`frontend/` and select only applicable projects. Relevant non-default paths:

- `tests/smoke/offline-dashboard.spec.ts`
- `tests/smoke/account-view-transitions.spec.ts`
- `tests/smoke/geographic-map-lifecycle.spec.ts`
- `test:shell:desktop` and `test:shell:mobile` package commands

Consult [testing](../testing.md) for platform support before Playwright. Local
WebKit limitations are not a pass; record the gap and use the supported CI
environment for the required check. Once covered code is unchanged, reuse
passing results. Do not repeat the full suite after every extraction.

## Performance evidence

Use [existing measurement tooling](../../scripts/measure-portfolio-performance.mjs)
for its supported API/build/test workloads; use browser profiling for map and
React work. Record the baseline commit, workload/scenario, hardware/browser,
cache state, repetitions, successful/failed requests, and before/after values.
Compare equivalent production builds rather than development-mode timings.

| Candidate | Evidence to collect |
| --- | --- |
| M1 shared map loader | Network requests, parser invocations, cold/warm switch duration |
| M3/M4 map lifecycle | Long tasks/frame timing, listener/observer lifetime, source-update counts under repeated selection/pan/network switch |
| F1/F5 reads | Requests and overlapping responses under tab visibility, reconnect, and N saved stations |
| B5 dashboard assembly | Repository/query counts on cache miss, cache hit behavior, latency with identical data |
| B6 importer | Peak heap and bounded departure batches on a documented schedule size, plus activation correctness |
| C1–C3 CSS | Authored import-graph metrics and built CSS bytes from the matching build; no inferred smoothness claim |

A structural improvement can be accepted without a speedup. Record that
honestly. If an optimization regresses correctness, revert only that chunk's
change and retain the measurement as a reason to choose another design.

## V2 — Close the coverage inventory

After the application/CSS work, complete the dedicated
[test-suite cleanup](07-test-suite.md) before final V2 sign-off. This document
defines verification gates; that workstream owns restructuring and optimizing
the suite itself. Tests needed to protect individual refactors still move
with those refactors.

At each workstream's completion, check all touched public entry points and
failure paths against V1. Run missing affected gates, remove temporary facades,
and reconcile deleted code with tests, styles, scripts, and guidance. Record
remaining candidates with their evidence status. At final review, rerun only
checks invalidated by later changes and the required final integration gate.

**Done:** every changed behavior has applicable passing evidence or an explicit
unresolved gap; current commands/docs agree; no unmeasured performance claim,
silently discarded regression, or unresolved compatibility migration is
presented as complete.

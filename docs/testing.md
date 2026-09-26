# Testing LineWatchTO

LineWatchTO uses several test tiers with different purposes. Keep the smallest
tier that can prove a behavior; browser tests should cover integrated rider
flows, not repeat every data-shape or styling assertion from the fast suite.

## Frontend tiers

| Tier | Command | Purpose |
| --- | --- | --- |
| Fast | `npm --prefix frontend run test:fast` | Fixture contracts, pure logic, adapters, source guardrails, and CSS architecture checks. |
| Scripts | `npm --prefix frontend run test:scripts` | Benchmark measurements, OG image generator, and regional map normalizer CLI tests. |
| All script tools | `npm --prefix frontend run test:scripts:all` | Node script tool tests plus operational shell suites (production release, staging, AWS lab). Run in CI. |
| Smoke | `npm --prefix frontend run test:smoke` | A small Chromium desktop/mobile release gate: dashboard boot, map-to-detail flow, cross-network search, and source-honest fallback. |
| Offline snapshot gate | `npm --prefix frontend run test:offline` | PWA offline dashboard fallback, snapshot hydration, and independent network retention on mobile Chromium. Also run in CI. |
| Lifecycle | `npm --prefix frontend run test:lifecycle` | Focused account dialog transitions, service badges, and geographic map camera/instance lifecycle checks. |
| Desktop shell | `npm --prefix frontend run test:shell:desktop` | Focused sidebar sizing, docking/overlay, station detail, collapse/restore, search entry, more navigation, and cross-network layout checks. |
| Mobile shell | `npm --prefix frontend run test:shell:mobile` | Focused pull-up sheet gestures, touch friction, overview scroll, legend pill, default framing, and notice layout checks. |
| Full shell | `npm --prefix frontend run test:shell` | Runs both desktop and mobile shell suites sequentially. |
| E2E regression | `npm --prefix frontend run test:e2e` | Chromium desktop/mobile interaction and layout coverage across core user journeys; stops after five failures. |
| Visual | `npm --prefix frontend run test:visual` | Deliberate screenshot baselines only (`visual-baselines.spec.ts`, `desktop-visual-acceptance.spec.ts`, `opaque-surfaces.spec.ts`). |
| Browser compatibility | `npm --prefix frontend run test:browser-compat` | One focused SVG/map geometry contract in Chrome, Firefox, and WebKit. |
| Mobile map fit | `npm --prefix frontend run test:map-fit` | Both rotated maps in mobile Chromium/WebKit: compact and changing viewports, safe areas, deferred gesture resizing, browser page zoom, and physical rotation. Also included in E2E and CI. |
| Full release gate | `npm --prefix frontend run test:release` | Consolidated release candidate verification: runs fast tests, all script tools, typecheck, lint, build, smoke, browser-compat, map-fit, offline, and lifecycle gates. |

`test:fixtures` remains as a backwards-compatible alias for `test:fast`, and
`test:regression` aliases `test:e2e`.

When a complete failure inventory is specifically needed, run
`npm --prefix frontend run test:e2e:full`. A healthy `test:e2e` run executes the
catalog without capping; its failure cap matters only when the suite is already
broken.

For sidebar or mobile sheet iteration, select the corresponding shell command
instead of starting the full regression catalog. These commands use existing
specs and stop after three failures. They still start a production app by
default; use the build-reuse procedure below only when the build matches the
code being tested.

CI runs fast frontend tests, operational script tool tests (`test:scripts:all`), smoke gate, browser compatibility,
mobile map fit, and the offline snapshot gate. After backend and frontend jobs pass on a `main` push,
CI builds and publishes native ARM64 production images and checks the published frontend `/healthz` endpoint.

The smoke suite stays intentionally small. Add a scenario only when its failure means
the deployed dashboard is broadly unusable and the behavior is not already
represented by an existing smoke flow. Feature-specific browser coverage
belongs in the E2E regression suite. Pixel-level expectations belong in the
visual suite.

## Choosing the right layer

- Put data transformation, validation, matching, timing, and fallback rules in
  fast tests that import the production function.
- Use source/CSS guardrails sparingly for architecture rules that cannot be
  observed through a stable public function. Do not use source-string matching
  as a substitute for behavioral coverage.
- Use Playwright for integrated navigation, browser APIs, responsive layout,
  accessibility roles, and map gestures.
- Avoid fixed sleeps. Prefer a visible element, an attribute, or `expect.poll`
  tied to the state that the rider actually depends on.
- Keep each test independent. The shared API stub is mutable, so Playwright is
  intentionally limited to one worker until scenarios are isolated by browser
  context.

## Build reuse

Playwright builds a production Next.js application by default. When a matching
test build already exists, skip the rebuild explicitly:

```bash
BACKEND_URL=http://127.0.0.1:4174 \
NEXT_PUBLIC_LINEWATCH_API_BASE_URL=http://127.0.0.1:4174 \
npm --prefix frontend run build

LINEWATCH_PLAYWRIGHT_REUSE_BUILD=true \
npm --prefix frontend run test:smoke
```

Only reuse a build compiled with the API base URL shown above. CI uses this
path so its build validation, smoke gate, and compatibility check share one
artifact.

## Local browser support

`playwright install-deps` targets supported Debian/Ubuntu environments and
invokes `apt-get`; it is not an Arch Linux dependency installer. On Arch, run
the Chromium and Firefox projects locally and let the Ubuntu CI job provide
the WebKit compatibility gate. Do not symlink newer ICU or libxml2 libraries
to the older ABI names expected by Playwright's Ubuntu WebKit build. Use a
supported Ubuntu environment or the official Playwright container only when
local WebKit debugging is necessary.

## Broader checks

Backend verification remains separate from frontend verification:

```bash
mvn -f backend/pom.xml test
```

The native `mobile/` workspace has no app or checks yet. Add platform-specific
checks when an Android or iOS project is created.

## Validation policy

The [root guide](../AGENTS.md) defines proportional iteration and honest reporting.
The [frontend](../frontend/AGENTS.md) and [backend](../backend/AGENTS.md)
guides define final checks for their layers. The [mobile guide](../mobile/AGENTS.md)
describes the empty native workspace.
Validate once when stable, unless the user explicitly defers validation. Cross-stack
changes need affected-layer and integration coverage, not unrelated platform suites.

Reuse passing checks when their covered code has not changed. After a fix, rerun
failed checks and those affected by the fix, rather than restarting all suites.
Read final results once; open detailed logs/traces only to investigate a failure or
uncertainty. Run suites sharing mutable stub services serially.

Review image differences before updating visual baselines. Reserve full browser
compatibility sweeps for affected environments or release validation. A small CSS
change does not require a production build just to inspect it; an existing dev
server and focused browser inspection are sufficient for the local feedback loop.

Report checked behavior, failures, and material untested areas concisely. A design
iteration can be ready for review with final validation pending; do not claim
checks passed when skipped, blocked, or invalidated by subsequent edits.

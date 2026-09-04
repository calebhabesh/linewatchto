# Testing LineWatchTO

LineWatchTO uses several test tiers with different purposes. Keep the smallest
tier that can prove a behavior; browser tests should cover integrated rider
flows, not repeat every data-shape or styling assertion from the fast suite.

## Frontend tiers

| Tier | Command | Purpose |
| --- | --- | --- |
| Fast | `npm --prefix frontend run test:fast` | Fixture contracts, pure logic, adapters, source guardrails, and CSS architecture checks. |
| Smoke | `npm --prefix frontend run test:smoke` | A small Chromium desktop/mobile release gate: dashboard boot, map-to-detail flow, cross-network search, and source-honest fallback. |
| E2E regression | `npm --prefix frontend run test:e2e` | Chromium desktop/mobile interaction and layout coverage; stops after five failures to avoid wasting a feedback cycle. |
| Visual | `npm --prefix frontend run test:visual` | Deliberate screenshot baselines only. |
| Browser compatibility | `npm --prefix frontend run test:browser-compat` | One focused SVG/map geometry contract in Chrome, Firefox, and WebKit. |

`test:fixtures` remains as a backwards-compatible alias for `test:fast`, and
`test:regression` aliases `test:e2e`.

When a complete failure inventory is specifically needed, run
`npm --prefix frontend run test:e2e:full`. A healthy `test:e2e` run still
executes the entire catalog; its cap matters only when the suite is already
broken.

The smoke suite should stay small. Add a scenario only when its failure means
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

Backend and mobile verification remain separate:

```bash
mvn -f backend/pom.xml test
npm --prefix mobile run typecheck
npm --prefix mobile run lint
npm --prefix mobile test
```

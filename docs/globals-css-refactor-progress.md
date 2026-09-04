# Global CSS Refactor Progress

## Current state

- Branch: `refactor/css-architecture`
- Current session: S01
- Last completed session: S01
- Next recommended session: S02
- Blockers: none

## Current metrics

| Metric | Baseline | Current |
|---|---:|---:|
| Global entry lines | 30,011 | 30,011 |
| Total authored app CSS lines | 31,414 | 31,414 |
| Total authored app CSS bytes | 784,128 | 784,156 |
| Parsed rules | 4,221 | 4,221 |
| Declarations | 14,093 | 14,093 |
| !important | 2,356 | 2,356 |
| Class-substring selectors | 32 | 32 |
| Production CSS bytes | 705,472 | 705,499 |
| Production CSS gzip bytes | 108,667 | 108,668 |

## Session log

### S00 — Baseline and tooling

- Status: completed
- Commit: 68a04eb9
- Scope: Establish baseline metrics and progress tracking infrastructure. Add reproducible measurement script and record accurate baseline values for line counts, byte sizes, PostCSS AST nodes, class-substring selectors, test references, and production CSS chunk sizes.
- Files changed:
  - `frontend/scripts/measure-css.mjs`
  - `frontend/package.json`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run metrics:css`: Passed, produced verified baseline report.
  - `npm --prefix frontend run test:fixtures`: Passed (1,104 tests, 0 failures).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and zero TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, zero warnings in new script).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack production build succeeded in ~8s).
  - `npm --prefix frontend run test:smoke`: Ran smoke suite. Diagnosed pre-existing regression on main from commit 09aec159: `.mobile-map-controls-group` is unhidden on desktop viewports, causing strict mode locator violations for "Center map view" and "Zoom in" in desktop Chrome smoke tests. Verified that adding `.mobile-map-controls-group` to desktop `display: none` resolves this ambiguity. Also noted missing WebKit OS libraries on the Linux host for the optional browser-compat webkit target.
- Visual checks: None required for S00 as no production CSS, markup, or assets were modified.
- Metrics:
  - `globals.css`: 30,011 lines / 753,859 bytes
  - Total authored CSS: 31,414 lines / 784,128 bytes across 2 files (`globals.css` and `(transit-guides)/transit-guide.module.css`)
  - Parsed rules: 4,221
  - Parsed declarations: 14,093
  - `!important` declarations: 2,356
  - Media queries: 158
  - Keyframes: 99
  - Class-substring selectors: 32
  - Distinct class tokens: ~1,399
  - Tests referencing `globals.css`: 51
  - Largest built production chunk: 705,472 bytes raw / 108,667 bytes gzip (`0c8cm1ggz7g9r.css`)
- Decisions:
  - Implemented `frontend/scripts/measure-css.mjs` using transitive `postcss` dependency and Node built-ins (`node:fs`, `node:zlib`, `node:path`) to avoid introducing new external dependencies.
  - Added `metrics:css` command in `frontend/package.json`.
  - Reverted any exploratory CSS edits to strictly adhere to S00's exit criteria ("No production styling has changed").
- Risks or blockers:
  - S01 will establish the visual regression harness. Before running the full Playwright suite in S01, the pre-existing desktop unhidden `.mobile-map-controls-group` issue should be formally resolved or handled in the test setup.
- Next session: S01 — Visual regression harness.

### S01 — Visual regression harness

- Status: completed
- Commit: f78fc43e
- Scope: Add Playwright visual regression test harness covering the complete 11-scenario minimum coverage matrix across desktop and mobile viewports, light/dark themes, high contrast, station detail, My Commutes, overlapping impacts, and mobile status sheets. Freeze time-dependent labels, animations, transitions, caret blinking, constellation background canvas, and transient map motion. Store deterministic golden screenshots.
- Files changed:
  - `frontend/tests/smoke/visual-baselines.spec.ts`
  - `frontend/tests/smoke/visual-baselines.spec.ts-snapshots/` (11 baseline png artifacts)
  - `frontend/playwright.config.ts`
  - `frontend/package.json`
  - `frontend/src/app/globals.css`
  - `frontend/tests/smoke/overlapping-count-badges.spec.ts`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across 2 consecutive runs with 0 diffs.
  - `npm --prefix frontend run test:fixtures`: Passed (1,104 tests, 0 failures).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors).
  - `npm --prefix frontend run build`: Passed (production build succeeds in ~2.1s).
  - `npm --prefix frontend run metrics:css`: Passed (30,011 lines in `globals.css`, 4,221 rules, 14,093 declarations, 2,356 `!important`).
- Visual checks:
  - Verified 11 baseline screenshots generated and deterministic across consecutive runs:
    1. `ttc-desktop-map-light-desktop-chrome-linux.png`
    2. `ttc-desktop-map-dark-desktop-chrome-linux.png`
    3. `regional-desktop-map-desktop-chrome-linux.png`
    4. `ttc-mobile-portrait-mobile-chromium-linux.png`
    5. `compact-mobile-viewport-mobile-chromium-linux.png`
    6. `high-contrast-panel-state-desktop-chrome-linux.png`
    7. `current-status-alerts-panel-desktop-chrome-linux.png`
    8. `station-detail-panel-desktop-chrome-linux.png`
    9. `my-commutes-panel-desktop-chrome-linux.png`
    10. `selected-overlapping-map-impact-desktop-chrome-linux.png`
    11. `mobile-status-sheet-mobile-chromium-linux.png`
- Decisions:
  - Formally resolved the pre-existing desktop `.mobile-map-controls-group` unhidden regression by adding `.mobile-map-controls-group` to desktop `display: none` on the same line as `.mobile-status-peek`, preserving the exact 30,011 line count of `globals.css`.
  - Refined desktop menu count badge locator in `overlapping-count-badges.spec.ts` with `.first()`, matching the mobile assertion pattern.
  - Configured `expect.toHaveScreenshot` in `playwright.config.ts` with `animations: "disabled"` and `maxDiffPixelRatio: 0.01`.
  - Added `test:visual` and `test:visual:update` scripts in `frontend/package.json`.
- Risks or blockers:
  - None. Visual baselines are locked and reproducible.
- Next session: S02 — Decouple CSS source tests from `globals.css`.

### S02 — Decouple CSS source tests from `globals.css`

- Status: completed
- Commit: 4a225dec
- Scope: Decouple style contracts and fixture tests from hardcoded direct reads of `globals.css`. Add dependency-free helper `frontend/tests/helpers/stylesheet-graph.mjs` that recursively resolves relative `@import` rules in manifest order and preserves cascade semantics. Add comprehensive test suite in `frontend/tests/stylesheet-graph.test.mjs`. Migrate all 51 tests that directly read `globals.css` to read the complete stylesheet graph via the helper without relaxing any assertions.
- Files changed:
  - `frontend/tests/helpers/stylesheet-graph.mjs`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - 51 test files in `frontend/tests/*.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,111 tests, 0 failures across 135 suites).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 0 new warnings).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed. Tests directly referencing `globals.css` reduced from 51 to 0.
- Visual checks:
  - Re-verified all 11 visual regression baselines pass cleanly with 0 diffs.
- Decisions:
  - Implemented `readAppStylesheet()` / `readAppStylesheetGraph()` with full cycle detection, recursive inlining of relative `@import` declarations, and comment preservation using only Node.js standard modules (`node:fs`, `node:path`, `node:url`).
  - Added `readStylesheet(path)` for directly reading an individual stylesheet without resolving imports once physical extraction into leaf files occurs in S03+.
  - Preserved all 1,100+ existing style contract assertions across all 51 tests without relaxing any assertion regex or token.
- Risks or blockers:
  - None. Extraction into `frontend/src/styles/` in S03 (canary `fonts.css`) can proceed safely without breaking contract tests.
- Next session: S03 — Prove the import strategy with one low-risk extraction.

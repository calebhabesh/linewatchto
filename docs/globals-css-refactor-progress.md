# Global CSS Refactor Progress

## Current state

- Branch: `refactor/css-architecture`
- Current session: S07
- Last completed session: S07
- Next recommended session: S08
- Blockers: none

## Current metrics

| Metric | Baseline | Current |
|---|---:|---:|
| Global entry lines | 30,011 | 25,127 |
| Total authored app CSS lines | 31,414 | 31,427 |
| Total authored app CSS bytes | 784,128 | 784,858 |
| Parsed rules | 4,221 | 3,543 |
| Declarations | 14,093 | 11,850 |
| !important | 2,356 | 1,974 |
| Class-substring selectors | 32 | 32 |
| Production CSS bytes | 705,472 | 705,456 |
| Production CSS gzip bytes | 108,667 | 107,558 |

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

### S03 — Prove the import strategy with one low-risk extraction

- Status: completed
- Commit: 9a8fcba3
- Scope: Canary extraction of contiguous font definitions from `globals.css` into `frontend/src/styles/foundation/fonts.css`. Add relative `@import "../styles/foundation/fonts.css";` to `globals.css` in top manifest order. Validate Next.js Turbopack build, PostCSS cascade ordering, stylesheet-graph resolution, and visual regression baselines across all 11 scenarios.
- Files changed:
  - `frontend/src/styles/foundation/fonts.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,112 tests, 0 failures across 135 suites in ~921ms).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 0 new warnings).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.1s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 30,011 to 29,671; total rules 4,221 preserved; production bundle size unchanged).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across light/dark themes, high contrast, station detail, My Commutes, and mobile views.
- Decisions:
  - Manifest Placement: Standard CSS requires `@import` statements to precede regular style rules. Placed `@import "../styles/foundation/fonts.css";` at the top of `globals.css` directly following `@import "tailwindcss" source("../");`. Next.js Turbopack and `@tailwindcss/postcss` resolve the relative import cleanly.
  - Granular Leaf Reads: Updated `frontend/tests/stylesheet-graph.test.mjs` with an explicit test verifying `fonts.css` presence in the app stylesheet graph and validating direct reading via `readStylesheet()`.
  - Zero Semantic Alterations: All 46 `@font-face` definitions were extracted verbatim with their existing asset URLs (`/assets/fonts/*.woff2`) and font weights/styles preserved character-for-character.
- Risks or blockers:
  - None. The import strategy is proven and production-ready for the foundation extractions in S04.
- Next session: S04 — Extract foundation styles (tokens, reset, themes, accessibility).

### S04 — Extract foundation styles

- Status: completed
- Commit: 432469cd
- Scope: Extract foundation styles from `globals.css` into dedicated files in `frontend/src/styles/foundation/`: `tokens.css`, `reset.css`, `themes.css`, and `accessibility.css`. Add relative `@import` directives in top manifest order. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, unit tests, and Playwright visual regression baselines across all 11 scenarios.
- Files changed:
  - `frontend/src/styles/foundation/tokens.css`
  - `frontend/src/styles/foundation/reset.css`
  - `frontend/src/styles/foundation/themes.css`
  - `frontend/src/styles/foundation/accessibility.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,116 tests, 0 failures across 135 suites in ~926ms).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.1s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 29,671 to 29,347; production chunk raw bytes unchanged at 705,499; gzip bytes improved by 79 bytes to 108,590).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across light/dark themes, high contrast, station detail, My Commutes, and mobile views.
- Decisions:
  - Preserved exact declaration and token values without selector renaming, specificity alterations, or `!important` removals.
  - Placed `@import` directives in top manifest order right after `fonts.css` (`tokens.css`, `reset.css`, `themes.css`, `accessibility.css`) to guarantee standard CSS cascade ordering and clean Turbopack / PostCSS bundling.
  - Added dedicated unit tests in `frontend/tests/stylesheet-graph.test.mjs` verifying that all extracted foundation files resolve in the app stylesheet graph and are readable directly via `readStylesheet()`.
  - Scoped high-contrast overrides (`.linewatch-shell.high-contrast .panel`, etc.) deferred to utilities session (`utilities/high-contrast.css`) per playbook architecture.
- Risks or blockers:
  - None. Foundation styles are successfully extracted and verified.
- Next session: S05 — Extract base map and rendering styles (`map/base-map.css`).

### S05 — Extract base map and rendering styles

- Status: completed
- Commit: 693e3a9d
- Scope: Extract base map canvas, viewport, raster planes, authored SVG visibility, single-paint-source opacity, pan/zoom interaction, camera wash, mobile-performance mode raster rules, and shared rendering styles from `globals.css` into dedicated `frontend/src/styles/map/base-map.css`. Add relative `@import "../styles/map/base-map.css";` in top manifest order. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, unit tests, and Playwright visual regression baselines across all 11 scenarios.
- Files changed:
  - `frontend/src/styles/map/base-map.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,117 tests, 0 failures across 135 suites in ~955ms).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.1s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 29,347 to 29,041; production chunk raw bytes unchanged at 705,499; gzip bytes improved by 45 bytes to 108,545).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across light/dark themes, high contrast, station detail, My Commutes, and mobile views.
- Decisions:
  - Extracted contiguous base map and rendering block (306 lines) into `frontend/src/styles/map/base-map.css` preserving exact declaration values, comments, and selector syntax.
  - Placed `@import "../styles/map/base-map.css";` right after `@import "../styles/foundation/accessibility.css";` at top of manifest order.
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` verifying that `base-map.css` resolves in the app stylesheet graph and reads directly via `readStylesheet()`.
  - Kept alert path overrides and overlap chooser rules with their respective feature extraction sessions (S06) to preserve exact late-file cascade specificity.
- Next session: S06A — Extract TTC impact overlays (`map/impact-overlays.css`).

### S06A — Extract TTC impact overlays

- Status: completed
- Commit: 5aec7df2
- Scope: Extract contiguous TTC impact overlay styles (SVG frames, alert path glows, aura pulses, candy paths, delay static base, planned preview rails and markers, suspension masks, RSZ chevron lanes, hover boundaries, mobile performance mode overlay rules, and geometricPrecision rendering attributes) from `globals.css` (766 lines) into dedicated `frontend/src/styles/map/impact-overlays.css`. Add relative `@import "../styles/map/impact-overlays.css";` in top manifest order. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, unit tests, and Playwright visual regression baselines across all 11 scenarios.
- Files changed:
  - `frontend/src/styles/map/impact-overlays.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,118 tests, 0 failures across 135 suites in ~972ms).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.3s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 29,041 to 28,275; production chunk raw bytes unchanged at 705,499; gzip bytes improved by 436 bytes to 108,109).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across light/dark themes, high contrast, station detail, My Commutes, and mobile views.
- Decisions:
  - Extracted contiguous TTC impact overlays block (766 lines) into `frontend/src/styles/map/impact-overlays.css` preserving exact declaration values, comments, keyframes, and selector syntax.
  - Placed `@import "../styles/map/impact-overlays.css";` right after `@import "../styles/map/base-map.css";` at top of manifest order.
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` verifying that `impact-overlays.css` resolves in the app stylesheet graph and reads directly via `readStylesheet()`.
  - Preserved late overlap chooser rules (`.overlap-indicator`, `.overlap-chooser-*`), station selection attention keyframes, train markers, and commute path previews in `globals.css` for subsequent sub-sessions (S06B through S06E) to preserve exact cascade specificity and avoid accidental overrides.
- Risks or blockers:
  - None. TTC impact overlay extraction is clean and verified.
- Next session: S06B — Extract regional impact overlays (`map/regional-map.css`).

### S06B — Extract regional impact overlays

- Status: completed
- Commit: 7e24997f
- Scope: Extract regional impact overlay styles (regional station hit targets, hover indicators, regional segment groups, impact paths, glows, auras, delay glyphs and direction arrows, reduced speed zones, suspensions, planned closures, rail pulse keyframes, hover boundaries and foreground layers, station impact rings, direction glyphs, selection ring keyframes, and motion-paused / prefers-reduced-motion regional rules) from `globals.css` (474 lines across regional blocks) into dedicated `frontend/src/styles/map/regional-map.css`. Add relative `@import "../styles/map/regional-map.css";` in top manifest order. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, unit tests, and Playwright visual regression baselines across all 11 scenarios.
- Files changed:
  - `frontend/src/styles/map/regional-map.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,119 tests, 0 failures across 135 suites in ~1033ms).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.2s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 28,275 to 27,800; production chunk raw bytes unchanged at 705,499; gzip bytes 108,175).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across light/dark themes, GO/UP desktop map, high contrast, station detail, My Commutes, and mobile views.
- Decisions:
  - Extracted regional impact overlay blocks (474 lines total) into `frontend/src/styles/map/regional-map.css` preserving exact declaration values, comments, keyframes, and selector syntax.
  - Placed `@import "../styles/map/regional-map.css";` right after `@import "../styles/map/impact-overlays.css";` at top of manifest order.
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` verifying that `regional-map.css` resolves in the app stylesheet graph and reads directly via `readStylesheet()`.
  - Preserved `.ttc-impact-hover-foreground` and `.ttc-impact-hover-outline` in `globals.css` for extraction in S06C alongside selection attention keyframes and selection foreground overlays.
- Risks or blockers:
  - None. Regional impact overlay extraction is clean and verified.
- Next session: S06C — Extract selection and hover foregrounds (`map/map-selection.css`).

### S06C — Extract selection and hover foregrounds

- Status: completed
- Commit: d3af7f25
- Scope: Extract selection and hover foreground styles (TTC impact hover foreground layers, outlines, masks, selection attention keyframes and lifecycle, regional top-plane copy attention, segment selection flash, desktop reduced-motion opacity, station selection flash, foreground flash active suppression, regional station selection source artwork suppression, motion-paused and mobile-performance-mode selection overrides) from `globals.css` (238 lines across hover outline and selection blocks) into dedicated `frontend/src/styles/map/map-selection.css`. Add relative `@import "../styles/map/map-selection.css";` in top manifest order immediately following `regional-map.css`. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, unit tests, and Playwright visual regression baselines across all 11 scenarios.
- Files changed:
  - `frontend/src/styles/map/map-selection.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,120 tests, 0 failures across 135 suites in ~940ms).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.2s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 27,800 to 27,563; production chunk raw bytes unchanged at 705,499; gzip bytes improved by 257 bytes to 107,918).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across light/dark themes, GO/UP desktop map, high contrast, station detail, My Commutes, and mobile views.
- Decisions:
  - Extracted contiguous TTC hover foreground block (56 lines) and selection attention/flash block (182 lines) into `frontend/src/styles/map/map-selection.css` (238 lines total), preserving exact declaration values, comments, keyframes, and selector syntax.
  - Placed `@import "../styles/map/map-selection.css";` right after `@import "../styles/map/regional-map.css";` in top manifest order.
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` verifying that `map-selection.css` resolves in the app stylesheet graph and reads directly via `readStylesheet()`.
  - Preserved overlap badges and chooser (`.overlap-indicator`, `.overlap-chooser-*`), train markers, and commute path previews in `globals.css` for subsequent sessions (S06D and S06E).
- Risks or blockers:
  - None. Selection and hover foreground extraction is clean and verified.
- Next session: S06D — Extract overlap badges and chooser (`map/overlap-chooser.css` or `map/overlap-indicators.css`).

### S06D — Extract overlap badges and chooser

- Status: completed
- Commit: 0adf0b39
- Scope: Extract overlap indicator badges and chooser popup styles (`.overlap-indicator`, `.overlap-chooser-*`, popup enter keyframes, theme overrides, list/choices by kind, icon, hover/focus/selected states, max-width: 640px mobile responsive overrides, motion paused rules, `.overlap-indicator-pill`, `.overlap-indicator-badge`, `.impact-type-icon`, delay exclamation badge glyphs, `.overlap-indicator-type-icon`, `.overlap-indicator-vector-label`, `.overlap-indicator-count-badge`, `.impact-overlap-refs`, `.overlap-impact-ref`) from `globals.css` (790 lines) into dedicated `frontend/src/styles/map/overlap-chooser.css`. Add relative `@import "../styles/map/overlap-chooser.css";` in top manifest order immediately following `map-selection.css`. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, unit tests, and Playwright visual regression baselines across all 11 scenarios.
- Files changed:
  - `frontend/src/styles/map/overlap-chooser.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,121 tests, 0 failures across 135 suites in ~1000ms).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.3s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 27,563 to 26,774; parsed rules -117; parsed declarations -347; `!important` -81; production chunk raw bytes unchanged at 705,499; gzip bytes improved by 90 bytes to 107,828).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across light/dark themes, GO/UP desktop map, high contrast, station detail, My Commutes, selected/overlapping map impact, and mobile views.
- Decisions:
  - Extracted contiguous overlap badges, indicator pills, chooser modal surface, choices by impact kind, exclamation glyphs, type icons, and impact reference links into `frontend/src/styles/map/overlap-chooser.css` (790 lines total), preserving exact declaration values, comments, keyframes, and selector syntax.
  - Placed `@import "../styles/map/overlap-chooser.css";` right after `@import "../styles/map/map-selection.css";` in top manifest order to preserve the cascade hierarchy where overlap badges and popup surfaces paint above map rails and selections.
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` verifying that `overlap-chooser.css` resolves in the app stylesheet graph and reads directly via `readStylesheet()`.
  - Preserved late mobile inspector media-query rule in `globals.css` line 19,553 (`.overlap-impact-ref`) for S08 responsive density extraction.
  - Left train markers and commute path previews for the final sub-session S06E.
- Risks or blockers:
  - None. Overlap badges and chooser extraction is clean and verified.
- Next session: S06E — Extract train markers and commute path previews (`map/train-markers.css` or `map/commute-preview.css`).

### S06E — Extract train markers and commute path previews

- Status: completed
- Commit: cf8f01ff
- Scope: Extract commute path preview geometry and chip styles (`.commute-path-preview-layer`, `.commute-path-preview-glow`, `.commute-path-preview-path`, `.commute-path-preview-endpoint`, regional pulse keyframe `@keyframes regional-commute-path-pulse`, regional stroke overrides, performance mode and motion-paused rules, chip entrance keyframes `@keyframes commute-preview-chip-enter`, `@keyframes commute-preview-embedded-enter`, `@keyframes commute-preview-mobile-enter`, `.commute-path-preview-chip`, dark and high-contrast themes, mobile viewports, embedded chip, motion-paused, prefers-reduced-motion, and mobile inspector margin) from `globals.css` (301 lines) into dedicated `frontend/src/styles/map/commute-preview.css`. Extract estimated train marker styles (`.estimated-train-marker-layer`, pointer events, muted state, `.estimated-train-marker`, outline, core, arrow, window, light theme `:not(.dark)`, line colors Line 1-6 and regional corridors BR, KI, LE, LW, MI, RH, ST, UP, high contrast, motion-paused, mobile performance mode) from `globals.css` (159 lines) into dedicated `frontend/src/styles/map/train-markers.css`. Add relative imports `@import "../styles/map/commute-preview.css";` and `@import "../styles/map/train-markers.css";` immediately after `overlap-chooser.css` in top manifest order. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, unit tests, and Playwright visual regression baselines across all 11 scenarios.
- Files changed:
  - `frontend/src/styles/map/commute-preview.css`
  - `frontend/src/styles/map/train-markers.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,123 tests, 0 failures across 135 suites in ~976ms).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.3s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 26,774 to 26,316; parsed rules -80; parsed declarations -214; `!important` -19; media queries -4; keyframe blocks -4; production chunk raw bytes unchanged at 705,499; gzip bytes improved by 173 bytes to 107,655).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across light/dark themes, GO/UP desktop map, high contrast, station detail, My Commutes, selected/overlapping map impact, and mobile views.
- Decisions:
  - Extracted commute path previews into dedicated `frontend/src/styles/map/commute-preview.css` (301 lines) and estimated train markers into dedicated `frontend/src/styles/map/train-markers.css` (159 lines), maintaining single-responsibility modular stylesheets rather than convolving train blips with commute route polyline geometry.
  - Placed `@import "../styles/map/commute-preview.css";` and `@import "../styles/map/train-markers.css";` right after `@import "../styles/map/overlap-chooser.css";` at lines 13 and 14 in `globals.css` to complete the map layer cascade.
  - Added unit tests in `frontend/tests/stylesheet-graph.test.mjs` verifying that both `commute-preview.css` and `train-markers.css` resolve in the app stylesheet graph and read directly via `readStylesheet()`.
  - Preserved multi-selector global camera gesture performance blocks (`:is(.map-gesture-active, ...)` and `:is([data-map-gesture-active="true"], ...)`) in late `globals.css` for S08 / late-file performance consolidation.
  - Completed the S06 family (S06A through S06E).
- Risks or blockers:
  - None. S06 family is fully complete and verified.
- Next session: S07 — Extract shell and desktop chrome (`shell/dashboard-shell.css`, `shell/desktop-chrome.css`, `shell/map-controls.css`, `shell/floating-panels.css`).

### S07 — Extract shell and desktop chrome

- Status: completed
- Commit: pending
- Scope: Extract shell container, desktop chrome, floating panels, and map controls from `globals.css` (1,189 lines total) into four dedicated stylesheets in `frontend/src/styles/shell/`: `dashboard-shell.css` (wordmark, shell custom property), `desktop-chrome.css` (network selector capsule and glider, top chrome elevation, desktop status capsule anchor and rows, live indicator dot, polling badge, train switch, impact status chips with all color/contrast modes, responsive breakpoints, main menu pin button), `floating-panels.css` (panel surface bases, mobile sheet icon button, floating panel shell, scroll frame, panel header, shared panel scrolling containers, enter keyframes, motion-paused, 640px and pinned-menu 768px overrides), and `map-controls.css` (regional map controls, desktop map control rail 1024px positioning, map control rail base and dark/high-contrast themes, dividers, button and slider controls, regional map rail, zoom group contents, and desktop recenter container and icon styles). Add relative imports `@import "../styles/shell/dashboard-shell.css";`, `@import "../styles/shell/desktop-chrome.css";`, `@import "../styles/shell/floating-panels.css";`, and `@import "../styles/shell/map-controls.css";` to `globals.css` lines 15-18. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, unit tests, and Playwright visual regression baselines across all 11 scenarios.
- Files changed:
  - `frontend/src/styles/shell/dashboard-shell.css`
  - `frontend/src/styles/shell/desktop-chrome.css`
  - `frontend/src/styles/shell/floating-panels.css`
  - `frontend/src/styles/shell/map-controls.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,127 tests, 0 failures across 135 suites in ~1169ms).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.4s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 26,316 to 25,127; parsed rules -179; parsed declarations -584; `!important` -110; media queries -9; keyframes -2; production chunk raw bytes 705,456; gzip bytes improved to 107,558).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across light/dark themes, GO/UP desktop map, high contrast, station detail, My Commutes, selected/overlapping map impact, and mobile views.
- Decisions:
  - Extracted 4 modular stylesheets into `frontend/src/styles/shell/`: `dashboard-shell.css` (11 lines), `desktop-chrome.css` (817 lines), `floating-panels.css` (148 lines), and `map-controls.css` (220 lines), reducing `globals.css` by 1,189 lines.
  - Consolidated network selector capsule, desktop status capsule, and impact chip states into `desktop-chrome.css` to keep all desktop header chrome together.
  - Placed `@import "../styles/shell/..."` immediately following `@import "../styles/map/train-markers.css";` at lines 15-18 in `globals.css` to preserve the cascade hierarchy where shell chrome and floating panels sit above map layers.
  - Preserved mobile-specific overrides (sheets, bottom nav, mobile action clusters, narrow viewports) in late `globals.css` for S08 to avoid fracturing late-file media queries and cascade order.
  - Added unit tests in `frontend/tests/stylesheet-graph.test.mjs` verifying that all four extracted stylesheets resolve in the app stylesheet graph and read directly via `readStylesheet()`.
- Risks or blockers:
  - None. S07 is fully verified and visual baselines match identically.
- Next session: S08 — Extract mobile shell and responsive-density styles (`shell/mobile-chrome.css`, `utilities/responsive-density.css`) covering bottom navigation, Status/More sheets, draggable sheets, safe-area handling, rotated-map mode, mobile action clusters, and compact-phone/narrow viewport rules.

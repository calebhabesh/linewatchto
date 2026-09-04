# Global CSS Refactor Progress

## Current state

- Branch: `refactor/css-architecture`
- Current session: S11A
- Last completed session: S11A
- Next recommended session: S11B
- Blockers: none

## Current metrics

| Metric | Baseline | Current |
|---|---:|---:|
| Global entry lines | 30,011 | 9,696 |
| Total authored app CSS lines | 31,414 | 31,987 |
| Total authored app CSS bytes | 784,128 | 815,150 |
| Parsed rules | 4,221 | 1,372 |
| Declarations | 14,093 | 4,143 |
| !important | 2,356 | 849 |
| Class-substring selectors | 32 | 22 |
| Production CSS bytes | 705,472 | 707,988 |
| Production CSS gzip bytes | 108,667 | 106,466 |



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
- Commit: aa2764b2
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
- Next session: S08A — Extract common mobile chrome and safe areas (`shell/mobile-chrome.css`).

### S08A — Extract common mobile chrome and safe areas

- Status: completed
- Commit: 145b68c7
- Scope: Extract common mobile chrome, safe areas, bottom navigation, PWA install nudge, mobile status peek, detached map controls, and mobile top chrome action cluster from `globals.css` (1,246 lines total) into dedicated `frontend/src/styles/shell/mobile-chrome.css`. Add relative import `@import "../styles/shell/mobile-chrome.css";` to `globals.css` line 19. Ensure `.mobile-status-sheet` remains cleanly enclosed in `@media (max-width: 767px)` in `globals.css`. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, unit tests, and Playwright visual regression baselines across all 11 scenarios.
- Files changed:
  - `frontend/src/styles/shell/mobile-chrome.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,128 tests across 135 suites, 0 failures in ~1046ms).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.4s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 25,127 to 23,882 (-1,245 lines); parsed rules -158; parsed declarations -678; `!important` -174; media queries -3; production chunk raw bytes 705,456; gzip bytes improved to 107,222 (-336 B)).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across desktop, mobile portrait (`TTC mobile portrait`), compact/short mobile viewport, high contrast, station detail, My Commutes, and mobile Status or More sheet.
- Decisions:
  - Extracted 1,256 lines into dedicated `frontend/src/styles/shell/mobile-chrome.css`: root mobile CSS variables (`--mobile-safe-top`, `--mobile-bottom-nav-*`, etc.), mobile bottom navigation (`.mobile-bottom-nav`, gliders, active key transforms, badges, themes), PWA install nudge, mobile status peek bar (`.mobile-status-peek`, count badges, category themes, live dot pulse), mobile detached map controls cluster (`.mobile-map-controls-group`, recenter button, zoom capsule), and mobile top chrome header & action cluster (`.linewatch-shell > header` padding, `.map-utility-cluster`, `.network-selector--compact-vertical`, `.rotate-map-btn`, action buttons, zoom rail hide).
  - Maintained cascade hierarchy by importing `mobile-chrome.css` at line 19 immediately following `map-controls.css`.
  - Wrapped `.mobile-status-sheet` cleanly in `@media (max-width: 767px)` in `globals.css` to keep all sheet styling valid and unperturbed.
  - Preserved mobile sheets (Status sheet, More sheet, mobile impact inspector, draggable sheets) for S08B; rotated-map mode for S08C; and compact phone / narrow desktop density passes for S08D.
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` asserting resolution of `mobile-chrome.css` in the application stylesheet graph.
- Risks or blockers:
  - None. S08A is fully complete and verified.
- Next session: S08B — Extract mobile sheets and navigation (`shell/mobile-sheets.css`) covering Status sheet, More sheet, floating panel shell mobile layout, and mobile impact inspector / draggable sheets.

### S08B — Extract mobile sheets and navigation

- Status: completed
- Commit: 27f13311
- Scope: Extract Status sheet (`.mobile-status-sheet`, `.mobile-line-status-*`), More sheet (`.mobile-more-sheet`, `.mobile-more-*`), floating panel shell mobile layout (`.floating-panel-shell` mobile, `@keyframes floating-mobile-sheet-enter`), fixed panel headers, thin scrollbars, and mobile map inspector (`.linewatch-shell.mobile-map-inspector`, `.mobile-impact-inspector`, `@keyframes mobile-impact-inspector-enter`, `@keyframes mobile-impact-inspector-content-in`, `@keyframes mobile-impact-inspector-meta-enter`) from `globals.css` (1,777 lines total) into dedicated `frontend/src/styles/shell/mobile-sheets.css`. Add relative import `@import "../styles/shell/mobile-sheets.css";` to `globals.css` line 20. Ensure remaining mobile station search rules stay cleanly enclosed in `@media (max-width: 767px)` in `globals.css`. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, unit tests, and Playwright visual regression baselines across all 11 scenarios.
- Files changed:
  - `frontend/src/styles/shell/mobile-sheets.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,129 tests across 135 suites, 0 failures in ~999ms).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.3s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 23,882 to 22,114 (-1,768 lines); parsed rules -238; parsed declarations -877; `!important` -202; media queries -5; keyframes -4; production chunk raw bytes 705,456; gzip bytes improved to 107,138 (-84 B)).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across desktop, mobile portrait (`TTC mobile portrait`), compact/short mobile viewport, high contrast, station detail, My Commutes, and mobile Status or More sheet (`mobile Status or More sheet`).
- Decisions:
  - Extracted 1,777 lines into dedicated `frontend/src/styles/shell/mobile-sheets.css`: Status sheet (`.mobile-status-sheet`, `.mobile-sheet-heading`, `.mobile-status-actions`, `.mobile-line-status-row`, line status indicators and impact badges), More sheet (`.mobile-more-sheet`, `.mobile-more-accent-strip`, `.mobile-more-brand`, `.mobile-more-account`, `.mobile-more-row`, `.default-map-mode-control.is-compact`, `.mobile-more-health-grid`, `.mobile-more-install-help`, push diagnostics, android notification help, share row, map attribution), floating panel shell mobile layout (`.floating-panel-shell` mobile geometry, `.floating-panel-scroll` base, visual keyboard overrides, `@keyframes floating-mobile-sheet-enter`), fixed panel headers and thin scrollbars (`.floating-panel-scroll` fixed header flex layout, scroll containers with thin custom thumb, padding insets, header clamp sizing), and mobile map inspector & impact inspector (`.linewatch-shell.mobile-map-inspector`, `.mobile-impact-inspector`, enter keyframes, headers, action buttons, overlap references, badges).
  - Maintained cascade hierarchy by importing `mobile-sheets.css` at line 20 immediately following `mobile-chrome.css`.
  - Wrapped remaining station search rules in `globals.css` cleanly in `@media (max-width: 767px)` to keep station search functioning pending S09A.
  - Preserved rotated-map mode for S08C; compact phone / narrow desktop density passes for S08D; and station search/detail for S09.
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` asserting resolution of `mobile-sheets.css` in the application stylesheet graph.
- Next session: S08C — Extract rotated-map and landscape mode (`shell/mobile-landscape.css` / rotated-map rules).

### S08C — Extract rotated-map and landscape mode

- Status: completed
- Commit: f8522dc0
- Scope: Extract mobile map controls (`.mobile-map-controls`, `.mobile-map-control-button`, `.mobile-map-controls[data-mode="rotated-landscape"]`), rotated mobile map shell layout (`.linewatch-shell.mobile-map-rotated`, viewport isolation, rotated UI surface), rotated map HUD and selection HUD (`.rotated-map-hud`, `.rotated-map-selection-hud`), and rotated map selection card (`.rotated-map-selection-card`, action column, portrait cue button, title groups, severity card themes) from `globals.css` (613 lines total) into dedicated `frontend/src/styles/shell/mobile-landscape.css`. Add relative import `@import "../styles/shell/mobile-landscape.css";` to `globals.css` line 21. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, unit tests, and Playwright visual regression baselines across all 11 scenarios.
- Files changed:
  - `frontend/src/styles/shell/mobile-landscape.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,130 tests across 135 suites, 0 failures in ~1001ms).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.3s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 22,114 to 21,501 (-613 lines); parsed rules -74; parsed declarations -323; `!important` -60; media queries -4; production chunk raw bytes 705,482; gzip bytes improved to 107,005 (-133 B)).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across desktop, mobile portrait (`TTC mobile portrait`), compact/short mobile viewport, high contrast, station detail, My Commutes, and mobile Status or More sheet.
- Decisions:
  - Extracted 613 lines into dedicated `frontend/src/styles/shell/mobile-landscape.css`: Mobile map controls (`.mobile-map-controls`, `.mobile-map-control-button`, `.mobile-map-control-button-strong`, active state, themes), Rotated mobile map shell layout (`.linewatch-shell.mobile-map-rotated`, suppression of non-map mobile chrome, isolated viewport, 90deg transformed controls surface `.rotated-map-ui-surface`), Rotated map HUD & selection HUD (`.rotated-map-hud`, `.rotated-map-selection-hud`, station/impact positioning, keepout styling), and Rotated map selection card (`.rotated-map-selection-card`, two-column action layout, close button, portrait rotation cue, line badge, meta text, and full critical/warning/rsz/delay/planned/normal color borders and background gradients across dark and high-contrast modes).
  - Maintained cascade hierarchy by importing `mobile-landscape.css` at line 21 immediately following `mobile-sheets.css`.
  - Preserved compact phone and narrow desktop density passes for S08D, and station search/detail for S09.
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` asserting resolution of `mobile-landscape.css` in the application stylesheet graph.
- Risks or blockers:
  - None. S08C is fully complete and verified.
- Next session: S08D — Extract compact phone and narrow desktop density styles (`shell/responsive-density.css` / compact phone and short landscape queries).

### S08D — Extract compact phone and narrow desktop density styles

- Status: completed
- Commit: c676e702
- Scope: Extract narrow phone button clamp rules (`@media (max-width: 480px)`), compact-phone density pass (`@media (max-width: 400px), (orientation: landscape) and (max-height: 520px)`), and narrow desktop window top-chrome reflow rules (`@media (min-width: 768px) and (max-width: 1099px)`, `@media (min-width: 768px) and (max-width: 899px)`) from `globals.css` (886 lines removed, 891 lines total authored with header) into dedicated `frontend/src/styles/shell/responsive-density.css`. Add relative import `@import "../styles/shell/responsive-density.css";` to `globals.css` line 22. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, unit tests, and Playwright visual regression baselines across all 11 scenarios.
- Files changed:
  - `frontend/src/styles/shell/responsive-density.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,131 tests across 135 suites, 0 failures in ~970ms).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings in unrelated files).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.1s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 21,501 to 20,616 (-885 lines); parsed rules -163; parsed declarations -297; `!important` -72; media queries -5; production chunk raw bytes 705,482; gzip bytes improved to 106,876 (-129 B)).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across desktop, mobile portrait (`TTC mobile portrait`), compact/short mobile viewport (`compact or short mobile viewport`), high contrast, station detail, My Commutes, and mobile Status or More sheet.
- Decisions:
  - Extracted 886 lines from `globals.css` into dedicated `frontend/src/styles/shell/responsive-density.css`:
    1. Narrow phone button clamps (`@media (max-width: 480px)`: `.rotate-map-btn` width, padding, gap, and text clamp; `.mobile-legend-pill--expanded` max-width and z-index).
    2. Compact phone & short landscape density pass (`@media (max-width: 400px), (orientation: landscape) and (max-height: 520px)`: `--mobile-edge-inset`, `--mobile-bottom-nav-height`, `--mobile-bottom-nav-side-inset`, `--mobile-status-peek-height`; welcome & first-run dialogs; closed-hours cards; persistent bottom navigation grid & status peek count badge clamp; floating panel shell and scroll insets; alert, closure, reliability, notification, and commute card compact padding; station search panel bounds and touch row heights; station detail and impact inspector compact layout; physical landscape mobile orientation overrides).
    3. Narrow desktop window top-chrome reflow rules (`@media (min-width: 768px) and (max-width: 1099px)` & `@media (min-width: 768px) and (max-width: 899px)`: header padding, two-row `.desktop-status-capsule-anchor` reflow, rail positioning, floating panel width clamps, and `.header-search-bar` width clamp).
  - Maintained cascade hierarchy by importing `responsive-density.css` at line 22 immediately following `mobile-landscape.css`.
  - Concluded S08 series (mobile shell and responsive density). S09 will proceed with station experience styles (`station-search.css`, `station-detail.css`, arrivals, surface connections).
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` asserting resolution of `responsive-density.css` in the application stylesheet graph.
- Risks or blockers:
  - None. S08D is fully complete and verified.
- Next session: S09A — Extract station search styles (`station/station-search.css` / station search panel, input row, filter toolbar, and search results).

### S09A — Extract station search styles

- Status: completed
- Commit: c899168c
- Scope: Extract station search panel container, input and clear controls, amenity filter toolbar and chips, global search results list and category shortcuts, resource/impact result items, browse alerts sections, lines and stations split columns, line triggers and chevrons, station rows, bookmarks, impact and outage badges, motion/high-contrast preferences, and mobile search layout, animations, flipping, and control suppression from `globals.css` (1,530 lines removed, 1,544 lines total authored with header) into dedicated `frontend/src/styles/station/station-search.css`. Add relative import `@import "../styles/station/station-search.css";` to `globals.css` line 23. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, unit tests, and Playwright visual regression baselines across all 11 scenarios.
- Files changed:
  - `frontend/src/styles/station/station-search.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,132 tests across 135 suites, 0 failures in ~965ms).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings in unrelated files).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.2s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 20,616 to 19,086 (-1,530 lines); parsed rules -202; parsed declarations -796; `!important` -121; media queries -2; keyframe blocks -3; production chunk raw bytes 705,508; gzip bytes improved to 106,712 (-164 B)).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across desktop, mobile portrait (`TTC mobile portrait`), compact/short mobile viewport (`compact or short mobile viewport`), high contrast, station detail, My Commutes, and mobile Status or More sheet.
- Decisions:
  - Extracted 1,530 lines from `globals.css` into dedicated `frontend/src/styles/station/station-search.css`:
    1. Desktop search panel shell, search input row, icon, clear button, and amenity filter toolbar (`.station-search-panel`, `.station-search-input-row`, `.station-search-amenity-toolbar`, `.station-search-amenity-chips`, `.station-search-amenity-chip`, `.station-search-amenity-clear`).
    2. Global search results, impact results, and resource results (`.global-search-results-list`, `.global-search-group`, `.global-search-impact-result`, `.global-search-resource-result`, `.global-search-category-shortcuts`, `.global-search-browse-alerts`).
    3. Split-column browse view (`.station-search-browse-container`, `.station-search-lines-column`, `.station-search-stations-column`, `@keyframes station-search-list-slide-in`, `.station-search-network-heading`).
    4. Line triggers and station items (`.station-search-line-trigger`, `.station-search-station-row`, `.station-search-station`, `.station-search-bookmark`, `.station-search-line-badges`, `.station-impact-type-badges`, `.station-search-outage-badge`, `.station-search-outage-count`).
    5. High-contrast and reduced-motion states (`.motion-paused`, `.high-contrast`, `@media (max-width: 640px)`).
    6. Mobile station search layout and behavior (`.station-search-mobile-back`, `@media (max-width: 767px)` mobile station search panel geometry, full viewport anchoring, hiding non-search controls and bottom nav, slide-in/back column animations, and search UI flipping).
  - Maintained cascade hierarchy by importing `station-search.css` at line 23 immediately following `responsive-density.css`.
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` asserting resolution of `station/station-search.css` in the application stylesheet graph.
- Risks or blockers:
  - None. S09A is fully complete and verified.
- Next session: S09B — Extract shared station-detail shell and header styles (`station/station-detail.css` / station detail panel shell, drag handling, headers, actions, and map buttons).

### S09B — Extract shared station-detail shell and header styles

- Status: completed
- Commit: 4beea985
- Scope: Extract station detail panel container and right dock, mobile bottom sheet geometry and dragging state containment, drag handle pill and ridges, sheet entrance animations, updating indicator, scroll container, body transitions, content swap animations, sheet exit animations, header actions (save control and close button), tactile panel and header overrides, transit line header rows, station line direction pills, quick jump navigation buttons, and circular "View on Map" jump button from `globals.css` (636 lines removed, 718 lines total authored with header) into dedicated `frontend/src/styles/station/station-detail.css`. Add relative import `@import "../styles/station/station-detail.css";` to `globals.css` line 24. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, unit tests, and Playwright visual regression baselines across all 11 scenarios.
- Files changed:
  - `frontend/src/styles/station/station-detail.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,133 tests across 135 suites, 0 failures in ~1039ms).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings in unrelated files).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.3s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 19,086 to 18,450 (-636 lines); parsed rules -93; parsed declarations -281; `!important` -110; media queries -12; keyframe blocks -7; production chunk raw bytes 705,951; gzip bytes 106,759).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across desktop, mobile portrait (`TTC mobile portrait`), compact/short mobile viewport (`compact or short mobile viewport`), high contrast, station detail, My Commutes, and mobile Status or More sheet.
- Decisions:
  - Extracted 636 lines from `globals.css` into dedicated `frontend/src/styles/station/station-detail.css`:
    1. Header actions (`.station-detail-header-actions`, `.station-detail-save-control`, `.station-detail-close-button`, save states, save spinner, and `@keyframes saved-station-spin`).
    2. Header line rows and quick jump controls (`.station-header-line-row`, `.station-header-line-badge`, `.station-header-line-name`, `.station-line-directions`, `.station-submenu-nav-btn`, `.station-detail-panel [data-station-submenu-nav] button`).
    3. View on map button (`.station-detail-map-button`, dual-tone icon styles, hover, active, dark, and high-contrast rules).
    4. Station detail panel shell & dragging (`.station-detail-panel`, mobile sheet translate, sheet dragging containment, `.station-sheet-drag-handle-container`, drag pill, drag ridges, and `.station-detail-updating`).
    5. Tactile container and header overrides (`.station-detail-panel`, desktop/mobile box-shadows, `.station-detail-save-control button`, `.station-detail-close-button`).
    6. Scroll, body wrapper, content swap & motion preferences (`.station-detail-scroll`, `.station-detail-body-wrapper`, `.station-detail-content-swap`, `@keyframes station-detail-content-in`, `.motion-paused`, `@media (prefers-reduced-motion: reduce)`).
    7. Station detail panel exit animations (`.station-detail-panel.station-detail-closing`, `.station-detail-panel[data-closing="true"]`, `@keyframes station-detail-exit-mobile`, `@keyframes station-detail-exit-desktop`).
  - Maintained cascade hierarchy by importing `station-detail.css` at line 24 immediately following `station-search.css`.
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` asserting resolution of `station/station-detail.css` in the application stylesheet graph and selector coverage.
- Risks or blockers:
  - None. S09B is fully complete and verified.
- Next session: S09C — Extract TTC and regional arrival groups (`station/station-arrivals.css` / TTC direction arrival groups, platform track spine, track nodes, regional departure tiles, and timetable tabs).

### S09C — Extract TTC and regional arrival groups

- Status: completed
- Commit: 6b1c3dfc
- Scope: Extract TTC direction arrival groups (`[data-arrival-group]`), platform track spine (`.station-arrival-track-spine`), platform track nodes (`.station-arrival-track-node`), regional departure tiles (`[data-regional-arrival-direction]`, `[class*="min-h-[74px]"]`), inter-line arrival divider (`.station-arrival-line-divider`), and high-contrast tile overrides from `globals.css` (87 lines removed, 131 lines total authored with header) into dedicated `frontend/src/styles/station/station-arrivals.css`. Add relative import `@import "../styles/station/station-arrivals.css";` to `globals.css` line 25. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, unit tests, and Playwright visual regression baselines across all 11 scenarios.
- Files changed:
  - `frontend/src/styles/station/station-arrivals.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,134 tests across 135 suites, 0 failures in ~1004ms).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings in unrelated files).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.3s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 18,450 to 18,363 (-87 lines); parsed rules -10; parsed declarations -39; `!important` -19; class-substring selectors in `globals.css` reduced from 32 to 28 (-4); production chunk raw bytes 706,597; gzip bytes 106,825).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across desktop, mobile portrait (`TTC mobile portrait`), compact/short mobile viewport (`compact or short mobile viewport`), high contrast, station detail, My Commutes, and mobile Status or More sheet.
- Decisions:
  - Extracted 87 lines from `globals.css` into dedicated `frontend/src/styles/station/station-arrivals.css`:
    1. Station arrival line divider (`.station-arrival-line-divider`, light, dark, and high-contrast gradients).
    2. Direction arrival groups container overrides (`.station-detail-panel [data-arrival-group]`).
    3. Station arrivals transit track spine & platform nodes (`.station-arrival-track-spine`, `.station-arrival-track-node`, light, dark, and high-contrast definitions).
    4. Departure tiles (`.station-detail-panel [data-arrival-group] [class*="min-h-[74px]"]`, `.station-detail-panel [data-regional-arrival-direction] [class*="min-h-[74px]"]`, light, dark, and high-contrast rules).
    5. Preserved `.station-detail-panel [data-surface-route] [class*="min-h-[74px]"]` in `globals.css` for S09D (surface connections).
  - Maintained cascade hierarchy by importing `station-arrivals.css` at line 25 immediately following `station-detail.css`.
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` asserting resolution of `station/station-arrivals.css` in the application stylesheet graph and selector coverage.
- Risks or blockers:
  - None. S09C is fully complete and verified.
- Next session: S09D — Extract station accessibility notices and surface connection cards (`station/station-accessibility.css` & `station/surface-connections.css` or combined S09D module).

### S09D — Extract station accessibility notices and surface connection cards

- Status: completed
- Commit: 245af8e9
- Scope: Extract station accessibility accordion (`.station-accessibility-details`, `.station-accessibility-summary`, `.station-accessibility-chevron`, `.station-accessibility-content-wrapper`, `.station-accessibility-content`), station notices accordion (`.station-notices-details`, `.station-notices-summary`, `.station-notices-chevron`, `.station-notices-content-wrapper`, `.station-notices-content`), access outage badge and count (`.station-access-outage-badge`, `.station-access-outage-count`), access outage summary banner button (`[data-station-access-outage-summary]`), station notices & accessibility item card styles, and high-contrast overrides into `frontend/src/styles/station/station-accessibility.css`. Extract surface connections accordion (`.surface-connections-details`, `.surface-connections-summary`, `.surface-connections-chevron`, `.surface-connections-content`, `.surface-connections-collapsed-pinned`, `.saved-station-arrival-group.is-surface-group`), connected networks cards (`.station-connections-card`, `.station-connections-title`, `.station-connection-list`, `.station-connection-row`, `.station-connection-icon`), tactile connection row overrides, surface route departure tiles (`.station-detail-panel [data-surface-route] [class*="min-h-[74px]"]`), and high-contrast overrides into `frontend/src/styles/station/surface-connections.css`. Add relative imports to `globals.css` lines 26 and 27. Remove 412 lines from `globals.css`. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, fixture unit tests (1,136 passing), and Playwright visual regression baselines across all 11 scenarios with 0 pixel diffs.
- Files changed:
  - `frontend/src/styles/station/station-accessibility.css`
  - `frontend/src/styles/station/surface-connections.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,136 tests across 135 suites, 0 failures in ~960ms; +2 tests for new stylesheets).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings in unrelated files).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~2.0s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 18,363 to 17,951 (-412 lines); parsed rules -62; parsed declarations -201; `!important` -31; class-substring selectors in `globals.css` reduced from 28 to 22 (-6); production chunk raw bytes 707,463; gzip bytes 106,877).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across desktop, mobile portrait (`TTC mobile portrait`), compact/short mobile viewport (`compact or short mobile viewport`), high contrast, station detail, My Commutes, and mobile Status or More sheet.
- Decisions:
  - Created two dedicated, modular stylesheets for clean architectural separation:
    1. `frontend/src/styles/station/station-accessibility.css` (233 lines) isolating station accessibility details, station notices details, elevator/escalator outage badges and count, access outage summary banner button, item card box-shadow/borders, and high-contrast overrides.
    2. `frontend/src/styles/station/surface-connections.css` (264 lines) isolating surface connections details, surface departure tiles, connected network cards and icons, tactile overrides, and high-contrast rules.
  - Removed 412 lines from `globals.css`:
    1. Top surface connection details block (lines 27 to 91 in `globals.css`).
    2. Connected network cards and rows (lines 199 to 326 in `globals.css`).
    3. Station accessibility & notices details accordion, chevrons, and outage badges/count (lines 3086-3096 and lines 3122-3254 in `globals.css`), while preserving station impacts and trip changes accordion styles (`.station-impacts-...`, `.station-trip-changes-...`) in `globals.css` for S11.
    4. Access outage summary banner button (`[data-station-access-outage-summary]`, lines 14341-14364 in `globals.css`).
    5. Tactile connection rows (`.station-connection-row`, lines 14366-14382 in `globals.css`), while preserving `.station-impact-jump-button` in `globals.css`.
    6. Surface route departure tiles (`.station-detail-panel [data-surface-route] [class*="min-h-[74px]"]`, lines 14402-14414 in `globals.css`).
    7. Station notices & accessibility cards (`.station-notices-details [class*="rounded-md border"]`, `.station-accessibility-details [class*="rounded-md border"]`, lines 14416-14431 in `globals.css`).
  - Class-substring selectors in `globals.css` reduced from 28 to 22 (-6 class-substring selectors extracted).
  - Maintained cascade hierarchy by importing `station-accessibility.css` and `surface-connections.css` at lines 26 and 27 immediately following `station-arrivals.css`.
  - Added unit tests in `frontend/tests/stylesheet-graph.test.mjs` asserting resolution of `station/station-accessibility.css` and `station/surface-connections.css` in the application stylesheet graph and validating selector matches.
- Risks or blockers:
  - None. S09 (all phases S09A, S09B, S09C, S09D) is fully completed and verified.
- Next session: S10A — Extract account dialogs and signed-out previews (`account/account-dialogs.css`).

### S10A — Extract account dialogs and signed-out previews

- Status: completed
- Commit: 1e8123f9
- Scope: Extract account modal dialogs (`.account-dialog`, `.account-dialog-backdrop`, `.account-dialog-header`, `.account-dialog-intro`, `.account-dialog-description`, `.account-dialog-close`), entrance animations (`linewatch-dialog-enter`, `linewatch-backdrop-enter`, `linewatch-dialog-content-enter`), auth choices and provider stack (`.account-choice-primary`, `.account-choice-google-custom`, `.account-choice-google-icon`, `.account-provider-stack`, `.account-auth-divider`), account form fields (`.account-field`, `.account-field span`, `.account-field input`), auth action buttons and links (`.account-primary-button`, `.account-link-button`), validation/status badges and helper notes (`.account-linked-status`, `.account-reset-status`, `.account-reset-dev-note`, `.account-reset-hint`), and signed-out feature previews (`.account-feature-preview`, `.account-action-row`, `.saved-commute-account-prompt`, `.saved-commute-account-prompt button`, `.notification-settings-prompt button`, `.saved-commute-signup-btn`) from `globals.css` into dedicated `frontend/src/styles/account/account-dialogs.css` (538 lines). Add relative import `@import "../styles/account/account-dialogs.css";` to `globals.css` at line 28. Remove 471 lines from `globals.css`. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, fixture unit tests (1,137 passing), and Playwright visual regression baselines across all 11 scenarios with 0 pixel diffs.
- Files changed:
  - `frontend/src/styles/account/account-dialogs.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,137 tests across 135 suites, 0 failures in ~984ms; +1 test for new stylesheet).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings in unrelated files).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in ~1.9s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 17,951 to 17,480 (-471 lines); parsed rules -63; parsed declarations -223; `!important` -12; media queries -1; keyframe blocks -3; class-substring selectors in `globals.css` steady at 22; production chunk raw bytes 707,717; gzip bytes 107,246).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across desktop, mobile portrait (`TTC mobile portrait`), compact/short mobile viewport (`compact or short mobile viewport`), high contrast, station detail, My Commutes (signed-out preview test), and mobile Status or More sheet.
- Decisions:
  - Created dedicated domain stylesheet `frontend/src/styles/account/account-dialogs.css` (538 lines) isolating account modal dialogs, animations, auth provider buttons, input fields, action buttons, validation badges, and signed-out preview prompts.
  - Removed 471 lines from `globals.css`:
    1. Account action row, dialog structure, header, close button, provider stack, Google sign-in custom button, auth divider, and account field labels (lines 7794-8049 in original `globals.css`).
    2. Separated `.account-field input` from `.saved-commute-form input, select` at line 8050, moving `.account-field input` (light, dark, high-contrast) to `account-dialogs.css` while leaving commute form inputs in `globals.css` for S10C/D.
    3. Separated `.account-primary-button`, `.saved-commute-account-prompt button`, and `.notification-settings-prompt button` from `.saved-commute-primary-button` at lines 8286-8344, leaving `.saved-commute-primary-button` in `globals.css` for S10C/D.
    4. Signed-out preview green create-account buttons (`.saved-commute-account-prompt button.saved-commute-signup-btn`, `.notification-settings-prompt button.saved-commute-signup-btn`, light, dark, high-contrast) from lines 8500-8531.
    5. Account link buttons (`.account-link-button`, light, dark, high-contrast) from lines 8533-8565.
    6. Account reset status and validation hints (`.account-reset-status`, `.account-reset-dev-note`, `.account-reset-hint`) from lines 8567-8599.
    7. Signed-out preview base container (`.saved-commute-account-prompt`, light, dark, high-contrast) from lines 8601-8608 and 8619-8627, while preserving `.saved-commute-form` in `globals.css`.
    8. Unified signed-out feature preview card treatment (`.account-feature-preview`, light, dark, high-contrast) from lines 9763-9784.
    9. Account dialog entrance animations and keyframes (`.account-dialog-backdrop`, `.account-dialog`, `.account-dialog [data-account-dialog-view]`, `@keyframes linewatch-backdrop-enter`, `@keyframes linewatch-dialog-enter`, `@keyframes linewatch-dialog-content-enter`) from lines 17691-17728.
  - Maintained cascade hierarchy by importing `account-dialogs.css` at line 28 immediately following `surface-connections.css`.
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` asserting resolution of `account/account-dialogs.css` in the application stylesheet graph and validating selector matches.
- Risks or blockers:
  - None. S10A is fully completed and verified.
- Next session: S10B — Extract My Stations (`account/my-stations.css`).

### S10B — Extract My Stations

- Status: completed
- Commit: 0bc8dfaa
- Scope: Extract account-backed station watchlist panel (`.my-stations-panel`, `.my-stations-heading`, `.my-stations-title`, `.my-stations-title-icon`, `.my-stations-bookmark`, `.my-stations-picker-action`), controls and mode toggles (`.my-stations-count`, `.my-stations-body`, `.my-stations-controls`, `.my-stations-controls-top`, `.my-stations-search`, `.my-stations-add`, `.my-stations-done`, `.my-stations-mode-action`, `.my-stations-mode-action-content`, `.my-stations-selects`), picker sections (`.my-stations-picker-list`, `.my-stations-picker-section`, `.my-stations-picker-section-heading`, `.my-stations-picker-line-number`, `.my-stations-picker-section-count`, `.my-stations-picker-section-rows`), watchlist rows (`.my-stations-row`, `.my-stations-picker-row`, `.my-stations-row-main`, `.my-stations-row-copy`, `.my-stations-row-heading`, `.my-stations-row-badges`, `.my-stations-line-badges`, `.my-stations-state`, `.my-stations-picker-conditions`), saved station rich card rows (`.saved-station-list-slot`, `.saved-station-rich-row`, `.saved-station-rich-heading`, `.saved-station-open-action`, `.saved-station-detail-loading`, `.saved-station-rich-content`), station disruption disclosures and chips (`.saved-station-disruption-disclosure`, `.saved-station-disruption-summary`, `.saved-station-disruption-heading`, `.saved-station-clear-dot`, `.saved-station-disruption-total`, `.saved-station-disruption-chips`, `.saved-station-disruption-action`, `.saved-station-disruption-clear-copy`, `.saved-station-disruption-list`), saved station arrivals (`.saved-station-arrivals`, `.saved-station-section-divider`, `.saved-station-surface-divider`, `.saved-station-line-divider`, `.saved-station-arrivals-heading`, `.saved-station-arrival-groups`, `.saved-station-arrival-line-section`, `.saved-station-arrival-line-header`, `.saved-station-arrival-group`, `.saved-station-arrival-line-badge`, `.saved-station-arrival-line`, `.saved-station-arrival-direction`, `.saved-station-arrival-destination`, `.saved-station-arrival-source`, `.saved-station-arrival-times`, `.saved-station-arrivals-empty`, `.saved-station-source-note`), inline undo banners and toasts (`.saved-station-inline-undo`, `.my-stations-empty`, `.my-stations-undo`, `.saved-station-global-notice`, `.saved-station-notice-action`), account network filter tabs and badges (`.account-network-filter`, `.account-network-glider`, `.account-network-badge`), animations (`@keyframes my-stations-mode-swap`, `@keyframes my-stations-search-nudge`), and high-contrast / mobile responsive overrides from `globals.css` into dedicated `frontend/src/styles/account/my-stations.css` (1,680 lines). Add relative import `@import "../styles/account/my-stations.css";` to `globals.css` at line 29. Remove 1,631 lines from `globals.css`. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, fixture unit tests (1,138 passing), and Playwright visual regression baselines across all 11 scenarios with 0 pixel diffs.
- Files changed:
  - `frontend/src/styles/account/my-stations.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,138 tests across 135 suites, 0 failures in ~909ms; +1 test for new stylesheet).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings in unrelated files).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in 2.1s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 17,480 to 15,849 (-1,631 lines); parsed rules -234; parsed declarations -856; `!important` -41; media queries -6; keyframe blocks -2; class-substring selectors in `globals.css` steady at 22; production chunk raw bytes 707,717; gzip bytes 107,179 (-67 B)).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across desktop, mobile portrait (`TTC mobile portrait`), compact/short mobile viewport (`compact or short mobile viewport`), high contrast, station detail, My Commutes, and mobile Status or More sheet.
- Decisions:
  - Created dedicated domain stylesheet `frontend/src/styles/account/my-stations.css` (1,680 lines) isolating account-backed station watchlist panel, controls, station picker sections, watchlist rows, disruption disclosures, saved station arrival platform tiles, inline undo banners, empty states, network filter tabs, and network badges.
  - Removed 1,631 lines from `globals.css`:
    1. Account-backed station watchlist panel shell and header (lines 495-540 in original `globals.css`).
    2. Watchlist controls, search input, mode action, picker sections, rows, disruption disclosure, and arrival groups (lines 746-1684 in original `globals.css`).
    3. Saved station arrival line badges, directions, sources, and heading media queries (lines 1819-1956 in original `globals.css`).
    4. Saved station arrival times, inline undo, empty state, undo banner, global notice toast, high-contrast, motion-paused, and mobile adaptation (lines 2051-2368 in original `globals.css`).
    5. Account network filter tabs, glider, and network badges (`.account-network-filter`, `.account-network-glider`, `.account-network-badge`, lines 17272-17461 in original `globals.css`).
  - Preserved shared `.arrival-line-pin` and `.live-signal-icon` in `globals.css` as shared cross-component indicators across station detail, surface connections, and my-stations, deferred to S11.
  - Preserved cross-component elevation lists and container navigation transitions in `globals.css` for S11.
  - Maintained cascade hierarchy by importing `my-stations.css` at line 29 immediately following `account-dialogs.css`.
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` asserting resolution of `account/my-stations.css` in the application stylesheet graph and validating selector matches.
- Risks or blockers:
  - None. S10B is fully completed and verified.
- Next session: S10C — Extract My Commutes cards and route display (`account/saved-commutes.css`).

### S10C — Extract My Commutes Cards and Route Display

- Status: completed
- Commit: 66bad503
- Scope: Extract saved commute cards (`.commute-card`, `.commute-card h3`, `.commute-card .status-pill`, `.commute-card.danger`, `.commute-card.warning`, `.commute-card.ok`, `.commute-card.filtered`), panel body container (`.commute-grid`), card header and identity (`.saved-commute-card-header`, `.saved-commute-card-identity`, `.saved-commute-title-icon`, `.saved-commute-current-impact-badge`), route endpoints and animated station swap (`.saved-commute-endpoints`, `.saved-commute-endpoint-row`, `.saved-commute-endpoint-connector`, `.saved-commute-endpoint-icon-col`, `.saved-commute-endpoint-content`, `.saved-commute-endpoint-prefix`, `.saved-commute-endpoint-station`, `.saved-commute-station-text`, `.saved-commute-origin-swap`, `.saved-commute-dest-swap`, `@keyframes commuteOriginSwapIn`, `@keyframes commuteDestSwapIn`), active commute disruption disclosures, summary chips, and matched impact rows (`.saved-commute-impact-disclosure`, `.saved-commute-impact-summary`, `.saved-commute-impact-summary-heading`, `.saved-commute-impact-summary-icon`, `.saved-commute-impact-total`, `.saved-commute-impact-summary-chips`, `.saved-commute-impact-summary-chip`, `.saved-commute-impact-summary-action`, `.saved-commute-impact-content-wrapper`, `.saved-commute-impact-content`, `.saved-commute-impact-list`, `.saved-commute-impact-icon`, `.saved-commute-impact-copy`, `.saved-commute-impact-details`, `.saved-commute-impact-heading`, `.saved-commute-impact-filter-note`, `.saved-commute-impact-ignored`), route actions, stop toggle, edit button, and map actions (`.commute-route-actions`, `.commute-route-stop-toggle`, `.commute-route-edit-button`, `.saved-commute-map-action`), leg monitoring toggle, glider, and direction banners (`.commute-leg-toggle`, `.commute-leg-glider`, `.commute-single-leg-container`, `.commute-single-leg-banner`, `.leg-btn-clear`, `.leg-btn-affected`, `.leg-btn-filtered`), direction-aware travel-time estimates (`.saved-commute-leg-list`, `.saved-commute-time-estimate`, `.saved-commute-time-estimate-heading`, `.saved-commute-time-estimate-grid`, `.saved-commute-time-verdict`, `.saved-commute-time-status-value`, `.saved-commute-time-headline-clock`), leg rows and tints (`.saved-commute-leg-row`, `.saved-commute-leg-row.clear-tint`, `.saved-commute-leg-row.affected-tint`), route stops list (`.commute-route-stop-list`, `.commute-route-stop-index`), saved route delete actions (`.commute-route-delete-confirm-button`, `.commute-route-delete-button`, `.commute-route-delete-confirmation`, `.commute-route-delete-cancel-button`), routing boundary disclaimers (`.saved-commute-routing-boundary-disclosure`, `.saved-commute-routing-boundary-trigger`, `.saved-commute-routing-boundary-label`, `.saved-commute-routing-boundary-static`), add route action (`.saved-commute-add-btn`), cancel button (`.saved-commute-cancel-button`), commute toast confirmation (`.commute-toast-success`), and responsive/motion/high-contrast overrides from `globals.css` into dedicated `frontend/src/styles/account/saved-commutes.css` (1,984 lines). Add relative import `@import "../styles/account/saved-commutes.css";` to `globals.css` at line 30 immediately following `my-stations.css`. Remove 1,932 lines from `globals.css`. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, fixture unit tests (1,139 passing), and Playwright visual regression baselines across all 11 scenarios with 0 pixel diffs.
- Files changed:
  - `frontend/src/styles/account/saved-commutes.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,139 tests across 135 suites, 0 failures in ~1.1s; +1 test for new stylesheet).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings in unrelated files).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in 2.3s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 15,849 to 13,917 (-1,932 lines); parsed rules -279; parsed declarations -982; `!important` -116; media queries -9; keyframe blocks -2; class-substring selectors in `globals.css` steady at 22; production chunk raw bytes 707,742; gzip bytes 106,884 (-295 B)).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across desktop, mobile portrait (`TTC mobile portrait`), compact/short mobile viewport (`compact or short mobile viewport`), high contrast, station detail, My Commutes, and mobile Status or More sheet.
- Decisions:
  - Created dedicated domain stylesheet `frontend/src/styles/account/saved-commutes.css` (1,984 lines) isolating saved commute cards, body container, route headers, animated station swap, disruption disclosures, route actions, leg monitoring toggle and glider, travel-time estimates, leg rows, route stop lists, delete confirmations, routing boundary notices, CTA add button, and toast confirmations.
  - Removed 1,932 lines from `globals.css`:
    1. Saved commutes panel body container (`.commute-grid`, lines 2865-2883 in original `globals.css`).
    2. Saved commute cards shell, header, identity, tones, endpoints, swap animations, disruption disclosure, summary chips, impact list items, and responsive/motion overrides (lines 2899-3586 in original `globals.css`).
    3. Commute route actions, stop toggle, edit button, map action, leg monitoring toggle/glider/banners, travel-time estimates, severity clocks, leg rows, and route stop list (lines 8406-9205 in original `globals.css`).
    4. Saved route delete buttons, delete confirmation, prompt, cancel, dark/high-contrast modes, and responsive `@media (max-width: 30rem)` (lines 9353-9574 in original `globals.css`).
    5. Commute toast success confirmation, routing boundary disclaimers, CTA add button, and cancel button (lines 15096-15303 in original `globals.css`).
  - Preserved `.motion-paused .saved-station-global-notice` in `globals.css` to maintain station toast motion cancellation.
  - Preserved saved commute rule editor, notification schedules, and create form (`.saved-commute-form`, `.saved-commute-rule-editor`, `.saved-commute-schedule-...`, `.commute-station-popover`) in `globals.css` for S10D.
  - Preserved cross-component elevation lists and container navigation transitions in `globals.css` for S11.
  - Maintained cascade hierarchy by importing `saved-commutes.css` at line 30 immediately following `my-stations.css`.
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` asserting resolution of `account/saved-commutes.css` in the application stylesheet graph and validating selector matches.
- Risks or blockers:
  - None. S10C is fully completed and verified.
- Next session: S10D — Extract My Commutes rule editor and notification schedule picker (`account/saved-commute-rules.css`).

### S10D — Extract My Commutes Route Editor & Notification Rules

- Status: completed
- Commit: c6318b1a
- Scope: Extract My Commutes route creation/editing form, station picker popover, sort controls, danger zone / delete controls, switch and slider controls, notification rule editor, and notification schedules into a dedicated domain stylesheet `frontend/src/styles/account/saved-commute-rules.css` (1,767 lines). Add relative import `@import "../styles/account/saved-commute-rules.css";` to `globals.css` at line 31 immediately following `saved-commutes.css`. Remove 1,679 lines from `globals.css`. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, fixture unit tests (1,140 passing), and Playwright visual regression baselines across all 11 scenarios with 0 pixel diffs.
- Files changed:
  - `frontend/src/styles/account/saved-commute-rules.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,140 tests across 135 suites, 0 failures in ~918ms; +1 test for new stylesheet).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings in unrelated files).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in 2.0s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 13,917 to 12,238 (-1,679 lines); parsed rules -222; parsed declarations -888; `!important` -49; media queries -5; keyframe blocks -5; class-substring selectors in `globals.css` steady at 22; production chunk raw bytes 707,988; gzip bytes 106,791 (-93 B)).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across desktop, mobile portrait (`TTC mobile portrait`), compact/short mobile viewport (`compact or short mobile viewport`), high contrast, station detail, My Commutes, and mobile Status or More sheet.
- Decisions:
  - Created dedicated domain stylesheet `frontend/src/styles/account/saved-commute-rules.css` (1,767 lines) isolating route creation/editing form, station picker popover with animated line expansion and green flash indicators, sort controls, delete confirmation box, slider switches, return leg toggles, notification rule editor, master toggles, notification schedules, day buttons, custom time windows, and event checkboxes.
  - Removed 1,679 lines from `globals.css`:
    1. Saved commute form inputs, sort control dropdowns, sort options, primary CTA button, danger zone, and delete confirmation box (lines 5649-6072 in original `globals.css`).
    2. Commute station picker trigger, label, search row, line filter chips, station list, options, and green flash anim (lines 6183-6448 in original `globals.css`).
    3. Saved commute notification rule editor, master row, schedule list, schedule card, leg toggles, day grid, time window, and event checkboxes (lines 6531-7093 in original `globals.css`).
    4. Dark and high-contrast overrides for saved commute rules, switches, sliders, day buttons, and schedule headers (lines 7388-7580 in original `globals.css`).
    5. Spin animations, station browse columns, slide-in animations, line chevron, and green flash beacon (lines 14210-14371 in original `globals.css`).
    6. Saved commute customize toggle and dark mode styles (lines 14815-14852 in original `globals.css`).
  - Preserved `.impact-list-select-trigger` under `@media (max-width: 767px)` in `globals.css` to retain touch targets for impact dropdowns.
  - Split shared selectors between saved commute notification summaries and notification settings (`.notification-settings-row-main`, `.notification-settings-row-label`, `.notification-settings-prompt`), keeping notification settings in `globals.css` for S10E.
  - Preserved cross-component elevation lists (`.mobile-more-account, .mobile-more-row, .notification-settings-card, .saved-commute-notification-summary`) and `.saved-commute-sort-options` in scrollbar lists in `globals.css` for S11.
  - Maintained cascade hierarchy by importing `saved-commute-rules.css` at line 31 immediately following `saved-commutes.css`.
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` asserting resolution of `account/saved-commute-rules.css` in the application stylesheet graph and validating selector matches.
- Risks or blockers:
  - None. S10D is fully completed and verified.
- Next session: S10E — Extract push notification settings and prompt cards (`account/notification-settings.css`).

### S10E — Extract Push Notification Settings & Push Diagnostics

- Status: completed
- Commit: 57256554
- Scope: Extract Web Push subscription toggle, status card, prompt banner, notification settings section, follow-up preferences, corridor/line subscriptions, and push delivery diagnostics panel from `globals.css` into a dedicated domain stylesheet `frontend/src/styles/account/notification-settings.css` (1,042 lines). Add relative import `@import "../styles/account/notification-settings.css";` to `globals.css` at line 32 immediately following `saved-commute-rules.css`. Remove 1,012 lines from `globals.css`. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, fixture unit tests (1,141 passing), and Playwright visual regression baselines across all 11 scenarios with 0 pixel diffs.
- Files changed:
  - `frontend/src/styles/account/notification-settings.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,141 tests across 135 suites, 0 failures in ~916ms; +1 test for new stylesheet).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings in unrelated files).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in 1.95s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 12,238 to 11,227 (-1,011 lines, -8.3%); parsed rules -148; parsed declarations -516; `!important` -12; media queries steady at 75; keyframe blocks steady at 50; class-substring selectors in `globals.css` steady at 22; production chunk raw bytes 707,988; gzip bytes 106,516 (-275 B)).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across desktop, mobile portrait (`TTC mobile portrait`), compact/short mobile viewport (`compact or short mobile viewport`), high contrast, station detail, My Commutes, and mobile Status or More sheet.
- Decisions:
  - Created dedicated domain stylesheet `frontend/src/styles/account/notification-settings.css` (1,042 lines) isolating Web Push status card, prompt banner, notification settings section, follow-up schedule options, corridor/line subscriptions, notification event type grids, dark and high-contrast theme overrides, and push delivery diagnostics panel with device listings, attempt history, recipient delivery statuses, and event logs.
  - Removed 1,012 lines from `globals.css`:
    1. Push settings card, heading, message, toggle, notification settings panel, scroll container, sections, headers, cards, rows, icons, options, notes, badges, and event type grids (lines 5766-6206 in original `globals.css`).
    2. Selected follow-up schedule option overrides (`.notification-follow-up-option[data-selected="true"]` across default, dark, and high-contrast modes; lines 6997-7007 in original `globals.css`).
    3. Push delivery diagnostics details, summary, panel, header, devices section, device row, hash/health badges, attempt list, recipient statuses, and client event logs (lines 7049-7605 in original `globals.css`).
  - Preserved cross-component elevation lists (`.notification-settings-card`, `.notification-event-type-grid`, `.notification-settings-row`, `.notification-settings-prompt`, `.notification-follow-up-option`) and `.notification-settings-scroll` in scrollbar lists in `globals.css` for S11.
  - Maintained cascade hierarchy by importing `notification-settings.css` at line 32 immediately following `saved-commute-rules.css`.
  - Completed Phase 10 (all account feature styles isolated: account dialogs, My Stations, My Commutes cards/editor, and notification settings & push diagnostics).
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` asserting resolution of `account/notification-settings.css` in the application stylesheet graph and validating selector matches.
- Risks or blockers:
  - None. S10E is fully completed and verified.
- Next session: S11A — Extract active alerts, delay submenus, Reduced Speed Zone lists, and planned closures (`panels/alerts.css`).

### S11A — Extract Active Alerts, Delay Submenus, Reduced Speed Zones & Planned Closures

- Status: completed
- Commit: 5259aecc
- Scope: Extract active alert cards, delay submenus, Reduced Speed Zone lists, planned closures, line impact panels, compact impact list items, impact list toolbars, station impact jump buttons, and empty stack states from `globals.css` into a dedicated domain stylesheet `frontend/src/styles/panels/alerts.css` (1,553 lines). Add relative import `@import "../styles/panels/alerts.css";` to `globals.css` at line 33 immediately following `notification-settings.css`. Remove 1,532 lines from `globals.css`. Validate Next.js Turbopack build, PostCSS cascade handling, stylesheet-graph resolution, fixture unit tests (1,142 passing), and Playwright visual regression baselines across all 11 scenarios with 0 pixel diffs.
- Files changed:
  - `frontend/src/styles/panels/alerts.css`
  - `frontend/src/app/globals.css`
  - `frontend/tests/stylesheet-graph.test.mjs`
  - `docs/globals-css-refactor-progress.md`
- Verification:
  - `npm --prefix frontend run test:fixtures`: Passed (1,142 tests across 135 suites, 0 failures in ~916ms; +1 test for new stylesheet).
  - `npm --prefix frontend run typecheck`: Passed (clean route types and 0 TypeScript errors).
  - `npm --prefix frontend run lint`: Passed (0 errors, 3 pre-existing warnings in unrelated files).
  - `npm --prefix frontend run build`: Passed (Next.js Turbopack build succeeded in 1.89s, 208/208 static routes).
  - `npm --prefix frontend run test:visual`: Passed 11/11 tests across desktop and mobile viewports with 0 diffs.
  - `npm --prefix frontend run metrics:css`: Passed (`globals.css` lines reduced from 11,227 to 9,696 (-1,531 lines, -13.6%); parsed rules -225; parsed declarations -750; `!important` -106; media queries -9; keyframe blocks -1; class-substring selectors in `globals.css` steady at 22; production chunk raw bytes 707,988; gzip bytes 106,466 (-50 B)).
  - `git diff --check`: Passed (0 whitespace/formatting errors).
- Visual checks:
  - Re-verified all 11 visual regression scenarios with Playwright against production build: 0 diffs across desktop, mobile portrait (`TTC mobile portrait`), compact/short mobile viewport (`compact or short mobile viewport`), high contrast, station detail, My Commutes, and mobile Status or More sheet.
- Decisions:
  - Created dedicated domain stylesheet `frontend/src/styles/panels/alerts.css` (1,553 lines) isolating circle "View on Map" buttons and dual-tone jump icons, alert/planned closure card shells, active/danger/warning card borders, preview buttons, impact card route bounds, direction, metadata grids, RSZ timing and resolution breakdowns, impact timestamps, related planned closure buttons and active status buttons, impact list toolbars, category filters, total count badges, line impact panel stacks, embedded impact panel sizing, search inputs, view toggles, compact impact list items, station impact jump buttons, pulse animation, status tones, count badges, card borders, legend buttons, and empty stack alignment overrides.
  - Removed 1,532 lines across 8 contiguous blocks from `globals.css`:
    1. Circle "View on Map" buttons and JumpToLocationIcon dual-tone styling (lines 500-703 in original `globals.css`).
    2. Alert card, closure card base styling, active/danger/warning states, and preview button (lines 2806-2860 in original `globals.css`).
    3. Impact card heading, route bounds, direction, metadata grid, RSZ breakdowns, impact timestamps, related planned closures, closure window formatting, and closure status buttons (lines 3427-3768 in original `globals.css`).
    4. Impact list toolbar, category filters, total badge, line impact panel stack, embedded impact panel, search input, selects, view toggle, and compact impact list items (lines 4762-5428 in original `globals.css`).
    5. Station impact jump actions, jump button states, and card highlight pulse animation (lines 5486-5601 in original `globals.css`).
    6. RSZ, delay, suspension, and planned closure status tones, badges, card borders, and legend buttons (lines 5650-5766 in original `globals.css`).
    7. Compact impact location arrow styling (lines 9503-9514 in original `globals.css`).
    8. Empty state alignment overrides for alert and closure stacks (lines 10682-10700 in original `globals.css`).
  - Preserved cross-component elevation lists (`.alert-card`, `.closure-card`, `.compact-impact-list-item`, `.commute-card`, etc.) and shared scrollbar lists (`.alert-stack::-webkit-scrollbar`, `.closure-stack::-webkit-scrollbar`) in `globals.css` for S11E / utilities.
  - Preserved shared typography reset (`.panel-title-row span, .closure-heading p, ...`) and panel heading tone alignment (`.panel-heading h2 > .delay-tone, ...`) in `globals.css`.
  - Maintained cascade hierarchy by importing `panels/alerts.css` at line 33 immediately following `account/notification-settings.css`.
  - Added unit test in `frontend/tests/stylesheet-graph.test.mjs` asserting resolution of `panels/alerts.css` in the application stylesheet graph and validating selector matches.
- Risks or blockers:
  - None. S11A is fully completed and verified.
- Next session: S11B — Extract accessibility outages and surface connection notices (`panels/accessibility-outages.css` and `panels/surface-notices.css` or combined notices stylesheet).

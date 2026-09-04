# Global CSS Refactor Progress

## Current state

- Branch: `refactor/css-architecture`
- Current session: S00
- Last completed session: S00
- Next recommended session: S01
- Blockers: none

## Current metrics

| Metric | Baseline | Current |
|---|---:|---:|
| Global entry lines | 30,011 | 30,011 |
| Total authored app CSS lines | 31,414 | 31,414 |
| Total authored app CSS bytes | 784,128 | 784,128 |
| Parsed rules | 4,221 | 4,221 |
| Declarations | 14,093 | 14,093 |
| `!important` | 2,356 | 2,356 |
| Class-substring selectors | 32 | 32 |
| Production CSS bytes | 705,472 | 705,472 |
| Production CSS gzip bytes | 108,667 | 108,667 |

## Session log

### S00 — Baseline and tooling

- Status: completed
- Commit: 88de7082
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

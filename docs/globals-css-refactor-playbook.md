# LineWatchTO Global CSS Refactor Playbook

Last updated: 2026-09-03

## Purpose

This document is the durable handoff for reducing and reorganizing
`frontend/src/app/globals.css`. The work is intentionally divided into short,
independently verifiable sessions so an AI agent does not need the history of
earlier chats.

The objective is not merely to make `globals.css` display a smaller line count.
The objective is to:

- make every style family have an obvious owner;
- preserve the current TTC and GO/UP user experience;
- reduce cascade conflicts and `!important` usage;
- remove genuinely dead or superseded CSS;
- keep map, theme, responsive, reduced-motion, and high-contrast behavior intact;
- leave every completed session in a deployable state.

This is a refactor. Do not redesign the interface while doing it.

## Verified starting point

These measurements were taken on 2026-09-03. Re-measure them on the refactor
branch before editing because the application is still changing.

| Metric | Starting value |
|---|---:|
| `globals.css` lines | 30,011 |
| `globals.css` bytes | 753,859 |
| Parsed CSS rules | 4,221 |
| Parsed declarations | 14,093 |
| `!important` declarations | 2,356 |
| Media-query blocks | 158 |
| Keyframe blocks | 99 |
| Distinct CSS class tokens | approximately 1,398 |
| Tests referring directly to `globals.css` | 51 |
| Largest observed production CSS chunk | approximately 705 KB raw / 109 KB gzip |

Important findings:

- Repeated selectors are not necessarily duplicated rules. A PostCSS parse found
  only one exactly duplicated rule at the starting point.
- There were 32 selectors matching substrings of `class` attributes.
- Approximately 126 CSS class tokens were not found as plain text in `src`, but
  those are only review candidates. Runtime and SVG code can construct classes.
- The keyframe names `station-detail-enter` and
  `station-detail-content-in` each appeared twice and require investigation.
- Existing smoke tests cover many interactions, but there was no substantial
  Playwright screenshot-baseline suite. Passing behavioral tests alone does not
  establish visual parity.

## Non-negotiable rules

Every session must follow the repository `AGENTS.md` and `GEMINI.md` instructions.
In addition:

1. Start with `git status --short`. Preserve all unrelated user changes.
2. Work on the dedicated refactor branch/worktree, not `main`.
3. Complete one bounded session only. Do not opportunistically continue into the
   next session.
4. Do not mix refactoring with visual redesign.
5. Do not rename selectors during the initial file split.
6. Do not remove `!important`, combine rules, reorder rules, or introduce cascade
   layers during the initial file split.
7. Treat CSS source order as behavior. Imported files must preserve the original
   effective order.
8. Never delete a selector solely because a text search cannot find it. Check
   dynamic class construction, SVG code, state modifiers, tests, and browser
   coverage first.
9. Do not migrate the interactive maps to CSS Modules during this project unless
   a later, explicitly approved task calls for it. Their runtime SVG selectors
   are intentionally global.
10. Do not weaken or delete a test simply because it blocks the refactor. Move
    the assertion to the owning stylesheet or make the test read the ordered
    stylesheet graph.
11. Stop if verification fails and the cause cannot be resolved within the
    current session. Record the exact failure in the progress log.
12. Never report a phase complete until its exit criteria and required checks
    have passed.

## Worktree setup

A worktree and a branch are used together. From a clean primary checkout:

Commit this playbook and the short agent brief before creating the worktree so
both files are present in the branch's starting commit.

```bash
git worktree add ../linewatchto-css-refactor \
  -b refactor/css-architecture main
npm --prefix ../linewatchto-css-refactor/frontend ci
```

`node_modules` and `.next` are ignored and are not automatically present in the
new worktree. Do not share `.next` between concurrently running checkouts.

For side-by-side comparison:

```bash
# Primary checkout
npm --prefix frontend run dev

# Refactor worktree
npm --prefix ../linewatchto-css-refactor/frontend run dev -- --port 3001
```

## Target structure

The first structural milestone should use ordinary global CSS files. CSS Modules
come later for suitable leaf components.

```text
frontend/src/styles/
  foundation/
    fonts.css
    tokens.css
    reset.css
    themes.css
    accessibility.css
  shell/
    dashboard-shell.css
    desktop-chrome.css
    mobile-chrome.css
    floating-panels.css
    transitions.css
  map/
    base-map.css
    impact-overlays.css
    map-selection.css
    train-markers.css
    map-controls.css
    regional-map.css
  panels/
    shared-panel.css
    status.css
    station-detail.css
    station-search.css
    alerts.css
    accessibility-outages.css
    reliability.css
    alert-history.css
  account/
    account-dialog.css
    saved-commutes.css
    saved-stations.css
    notifications.css
  utilities/
    motion.css
    high-contrast.css
    responsive-density.css
```

This is a target ownership model, not a requirement to create every file at
once. If preserving source order requires temporary numbered files or fewer,
larger files, preserve behavior first and improve names in a later session.

`globals.css` should eventually be a short, deliberately ordered manifest:

```css
@import "tailwindcss" source("../");

@import "../styles/foundation/fonts.css";
@import "../styles/foundation/tokens.css";
/* Remaining imports in documented cascade order. */
```

Confirm through a production build that relative imports are flattened and
ordered as expected before relying on this arrangement.

## Standard session protocol

Each Gemini session follows this exact lifecycle.

### 1. Orient

Read, in order:

1. `AGENTS.md`
2. `GEMINI.md`
3. this playbook
4. `docs/globals-css-refactor-progress.md`, once it exists
5. the most recent relevant Git commits

Then run:

```bash
git status --short
git branch --show-current
git log -5 --oneline
```

Do not edit until the current session named in the progress log is understood.

### 2. State the boundary

Before editing, state:

- the one session being performed;
- the files expected to change;
- what is explicitly out of scope;
- the checks that will be run.

### 3. Make the smallest coherent change

Prefer mechanical moves and narrow transformations. Use `apply_patch` for
manual edits. Use formatting or purpose-built scripts only for mechanical bulk
work that is easy to review.

### 4. Inspect the diff before testing

Run:

```bash
git diff --stat
git diff --check
git diff -- frontend/src/app/globals.css frontend/src/styles frontend/tests
```

For mechanical moves, confirm that selectors, declarations, at-rules, and source
order were not accidentally changed.

### 5. Verify

Unless a session specifies a smaller intermediate check, its completion gate is:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

Read the complete result of every command. A command merely being invoked does
not count as verification.

### 6. Commit atomically

Commit only files belonging to the session. Never sweep unrelated working-tree
changes into the commit.

### 7. Update the durable handoff and stop

Update `docs/globals-css-refactor-progress.md` with:

- session identifier and status;
- commit SHA;
- files changed;
- before/after metrics;
- verification commands and outcomes;
- visual comparisons performed;
- unresolved concerns;
- exact next recommended session.

Then stop. The next chat starts from that record.

## Progress file template

Create `docs/globals-css-refactor-progress.md` in Session 00 using this format:

```markdown
# Global CSS Refactor Progress

## Current state

- Branch: `refactor/css-architecture`
- Current session: S00
- Last completed session: none
- Next recommended session: S01
- Blockers: none

## Current metrics

| Metric | Baseline | Current |
|---|---:|---:|
| Global entry lines | 30,011 | 30,011 |
| Total authored app CSS lines | TBD | TBD |
| Total authored app CSS bytes | TBD | TBD |
| Parsed rules | 4,221 | 4,221 |
| Declarations | 14,093 | 14,093 |
| `!important` | 2,356 | 2,356 |
| Class-substring selectors | 32 | 32 |
| Production CSS bytes | TBD | TBD |
| Production CSS gzip bytes | approximately 108,796 | TBD |

## Session log

### S00 — Baseline and tooling

- Status: pending
- Commit: none
- Scope:
- Files changed:
- Verification:
- Visual checks:
- Metrics:
- Decisions:
- Risks or blockers:
- Next session:
```

Do not store transient `.next` paths as durable identifiers because chunk names
change between builds.

## Session plan

### S00 — Baseline metrics and progress infrastructure

Goal: make future progress measurable and reproducible.

Tasks:

- Re-measure the stylesheet on the refactor branch.
- Add a dependency-free metrics script under `frontend/scripts/` or `scripts/`.
- Report source lines/bytes, total authored CSS, parsed rules/declarations,
  `!important`, media queries, keyframes, substring selectors, and built CSS
  raw/gzip size.
- Create the progress file from the template above.
- Add a package script only if it makes the measurement repeatable.

The script may use PostCSS already installed transitively, but prefer Node-only
logic or explicitly handle the dependency resolution. Do not add a new package
only for metrics.

Exit criteria:

- One command produces the baseline report.
- The progress file records the exact baseline.
- No production styling has changed.

Suggested commit:

```text
chore(frontend): add global css refactor metrics
```

### S01 — Visual regression harness

Goal: establish visual evidence before moving cascade-sensitive rules.

Tasks:

- Add stable Playwright screenshot assertions using the existing stub server.
- Freeze time-dependent labels, animations, polling, and transient map motion.
- Start with a small high-value matrix rather than every permutation.

Minimum coverage:

- TTC desktop map, light and dark;
- GO/UP desktop map;
- TTC mobile portrait;
- compact or short mobile viewport;
- high-contrast panel state;
- current-status or alerts panel;
- station detail;
- My Commutes;
- selected/overlapping map impact;
- mobile Status or More sheet.

If one session cannot stabilize all of these, split this into S01A and S01B and
record that decision. Do not generate baselines from an already modified
stylesheet.

Exit criteria:

- Baselines are deterministic across two consecutive runs.
- Failure artifacts make regressions reviewable.
- Existing smoke tests still pass.

Suggested commit:

```text
test(frontend): add css refactor visual baselines
```

### S02 — Decouple CSS source tests from `globals.css`

Goal: allow physical file movement without weakening style-contract tests.

Tasks:

- Inventory the 51 tests that directly read `globals.css`.
- Add a dependency-free helper that reads relative stylesheet imports in the
  order declared by the app stylesheet manifest.
- Migrate tests to either:
  - read the owning stylesheet when ownership is already clear; or
  - read the complete ordered app stylesheet graph.
- Preserve all existing assertions.

It is acceptable to divide this into S02A/S02B if the diff becomes too large.

Exit criteria:

- Tests do not require all application rules to exist physically in one file.
- No assertion was silently relaxed.
- Fixture tests pass before structural extraction begins.

Suggested commit:

```text
test(frontend): decouple style contracts from globals css
```

### S03 — Prove the import strategy with one low-risk extraction

Goal: validate build behavior and cascade preservation before a large split.

Tasks:

- Extract one contiguous, low-risk style family such as font definitions into
  `frontend/src/styles/foundation/fonts.css`.
- Add its import in the correct manifest position.
- Compare compiled output, screenshots, and behavior.
- Document any Tailwind/PostCSS import-order findings.

Do not extract tokens and themes in the same session. This session is a canary.

Exit criteria:

- Production build resolves the import.
- The effective CSS order is preserved.
- Visual baselines pass.

Suggested commit:

```text
refactor(frontend): extract global font definitions
```

### S04 — Extract foundation styles

Goal: isolate tokens, reset/base rules, theme roots, and accessibility-wide
contracts without semantic changes.

Potential files:

- `foundation/tokens.css`
- `foundation/reset.css`
- `foundation/themes.css`
- `foundation/accessibility.css`

Keep responsive feature rules with their features. Keep broad high-contrast
overrides intact if separating them would change order; they can remain in a
temporary compatibility file.

Exit criteria:

- Exact declarations and ordering are preserved.
- No `!important` cleanup is mixed into the move.
- Full frontend verification passes.

### S05 — Extract base map and rendering styles

Goal: move the map foundation without changing SVG behavior.

Include only base map canvas, raster-plane, authored SVG visibility, pan/zoom,
and shared rendering rules. Do not combine or simplify animations.

Specific risks to inspect:

- TTC and GO/UP authored asset visibility;
- raster/SVG single-paint-source behavior;
- Chromium compositor workarounds;
- mobile performance mode;
- direct-pan and programmatic-flight states;
- stacking of labels, station markers, overlays, and hit targets.

If this is too large, use S05A for base/raster styles and S05B for camera and
performance-state styles.

### S06 — Extract map impact and selection styles

Goal: isolate alert rails, station rings, planned previews, overlap indicators,
selection, hover, commute previews, and estimated train markers.

This is a high-risk session family and may be divided into:

- S06A: TTC impact overlays;
- S06B: regional impact overlays;
- S06C: selection and hover foregrounds;
- S06D: overlap badges and chooser;
- S06E: train markers and commute path previews.

Each sub-session must run the relevant map contract tests and visual baselines.

### S07 — Extract shell and desktop chrome

Goal: isolate dashboard shell, header/status capsule, desktop navigation, map
controls, floating-panel shell, and shared panel scrolling.

Keep mobile-specific rules for the next session if they can be separated without
reordering the cascade.

### S08 — Extract mobile shell and responsive-density styles

Goal: isolate bottom navigation, Status/More sheets, draggable sheets, safe-area
handling, rotated-map mode, mobile action clusters, and compact-phone/narrow
viewport rules.

This section includes late-file overrides and is especially order-sensitive.
Preserve late override ordering before attempting consolidation.

Potential split:

- S08A: common mobile chrome and safe areas;
- S08B: sheets and navigation;
- S08C: rotated/landscape mode;
- S08D: compact phone and narrow desktop density.

### S09 — Extract station experience styles

Goal: isolate station search, TTC station detail, regional station detail,
arrivals, accessibility notices, and surface connections.

Potential split:

- S09A: station search;
- S09B: shared station-detail shell/header;
- S09C: TTC and regional arrival groups;
- S09D: accessibility and surface connections.

Do not yet replace selectors such as `[class*="min-h-[74px]"]`. Preserve them
until the semantic-selector cleanup phase.

### S10 — Extract account feature styles

Goal: isolate account dialogs, My Stations, My Commutes, and Notifications.

This should almost certainly be divided:

- S10A: account dialogs and signed-out previews;
- S10B: My Stations;
- S10C/S10D: My Commutes, split by cards/route display and rule editor;
- S10E: notification settings and push diagnostics.

`SavedCommutesPanel.tsx` is one of the largest style consumers. Do not attempt
its extraction and cleanup in a single session.

### S11 — Extract remaining panels and utilities

Goal: give all remaining feature styles an owner.

Likely groups:

- alerts, delays, reduced-speed zones, and closures;
- accessibility outages and surface notices;
- reliability and alert history;
- feedback, privacy, release notes, site guide, and opening disclaimer;
- shared motion and scroll affordances.

Split this session whenever a group exceeds a comfortably reviewable diff.

### S12 — Add architecture guardrails

Goal: prevent the monolith from returning.

Add dependency-free checks that enforce agreed constraints, for example:

- `globals.css` contains only approved Tailwind setup/imports and comments;
- new class-substring selectors cannot increase the baseline count;
- `!important` cannot increase above the recorded migration ceiling;
- imported files exist and are not imported twice;
- stylesheet imports follow the documented order.

The initial guardrail should freeze debt, not demand that old debt disappear in
one commit.

Suggested commit:

```text
test(frontend): enforce global css architecture boundaries
```

### S13 — Replace class-substring selectors

Goal: remove selectors that depend on the textual spelling of Tailwind utility
classes.

Work one component family per sub-session. Replace fragile matching with an
explicit semantic class or existing `data-*` state.

Example:

```css
/* Before */
.station-detail-panel [class*="min-h-[74px]"] { ... }

/* After */
.station-detail-panel .station-arrival-tile { ... }
```

The TSX and CSS change must happen together. Verify light, dark, high contrast,
desktop, and mobile states for each family.

Treat broad high-contrast selectors separately from station-detail selectors.

### S14 — Resolve duplicate keyframe names

Goal: determine whether the two duplicate station-detail keyframe names are
intentional responsive definitions or accidental overrides.

Inspect computed behavior before changing them. Then rename, scope, or
consolidate them with explicit tests.

Do not combine this with general animation cleanup.

### S15 onward — Consolidate by feature

Goal: achieve real line-count and specificity reduction after ownership is
clear.

Use one feature family per session. The recommended order is:

1. shared panel and card surfaces;
2. shared count badges and action buttons;
3. small leaf panels and dialogs;
4. station detail;
5. My Stations;
6. My Commutes;
7. mobile shell;
8. map styles last.

For each family:

- identify base rules and later overrides;
- use browser-computed styles to determine which declarations actually win;
- consolidate repeated concepts using semantic classes and custom properties;
- remove superseded declarations in small batches;
- reduce `!important` only after the competing declaration is understood;
- re-measure and record the result;
- commit and stop.

Extract CSS Modules only for leaf components with clearly bounded markup.
Reasonable early candidates include:

- `OpeningDisclaimer`;
- `AppUpdateBanner`;
- `ReleaseNotesNotice`;
- `FeedbackPanel`;
- `SiteGuideDropdown`;
- standalone dialogs and small status chips.

CSS Modules are an ownership tool, not proof of payload reduction.

### Optional final phase — Cascade layers

Consider cascade layers only after the rules are organized and most accidental
specificity conflicts are gone.

```css
@layer reset, tokens, base, components, utilities, overrides;
```

Introducing layers changes precedence independently of selector specificity.
It is not part of the lossless split and must have its own visual-regression
phase. The final `overrides` layer should remain small.

## Practical targets

These are directional targets, not reasons to delete valid behavior.

| Milestone | Global entry | Total authored CSS | `!important` |
|---|---:|---:|---:|
| Starting point | 30,011 lines | approximately 31,400 lines | 2,356 |
| Lossless structural split | under 200 lines | approximately unchanged | approximately unchanged |
| Ownership cleanup | under 200 lines | 20,000–24,000 lines | below 1,500 |
| Healthy medium-term result | under 200 lines | 12,000–18,000 lines | below 500 |
| Stretch result | under 200 lines | 8,000–12,000 lines | below 150 |

The total CSS matters more than the entry-file line count. A map-heavy,
responsive dashboard can legitimately have thousands of purposeful CSS lines.

## AI-assisted time expectation

Gemini can materially reduce the implementation time because extraction,
reference migration, inventories, and repetitive verification are well suited to
an agent. Verification and visual judgment remain the bottleneck.

A reasonable supervised estimate is:

- baseline, test seam, and lossless structural split: 5–10 hours across roughly
  6–10 short sessions;
- meaningful selector and specificity cleanup: another 12–25 hours across
  roughly 10–20 short sessions;
- aggressive redesign into Tailwind/CSS Modules: not recommended, but likely
  25–50 or more hours even with AI assistance.

These are elapsed working estimates, not promises. Build and browser-test time,
flaky screenshots, and unexpected source-order dependencies can dominate an
individual session.

## Starting a fresh Gemini session

Use the compact instructions and copy-paste prompt in
`docs/globals-css-refactor-agent-brief.md`. The agent should read this full
playbook during the initial planning session. In later sessions, it should read
the brief, the progress log, and the section for its assigned session so the
roadmap does not consume unnecessary context.

## Completion definition

The project is complete when:

- `globals.css` is a small, intentional entry manifest;
- all application styles have documented ownership;
- no tests assume unrelated styles share one physical file;
- new CSS debt is prevented by automated guardrails;
- fragile class-substring selectors are removed or explicitly justified;
- `!important` is uncommon and documented where retained;
- dead CSS removals were validated rather than guessed;
- TTC and GO/UP maps, responsive layouts, themes, high contrast, reduced motion,
  panels, and account features pass behavioral and visual regression checks;
- source and production metrics are recorded before and after;
- every required frontend verification command passes.

Do not declare completion solely because `globals.css` itself is short.

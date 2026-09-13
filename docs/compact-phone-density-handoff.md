# Compact phone PWA layout — Gemini 3.8 Flash handoff

Implement a focused frontend accommodation for narrow/short phones. The user's
iPhone SE screenshots show overpowering map chrome, poorly centered nav counts,
and the third My Commutes footer action wrapping. Preserve the good Pixel 6a
experience. This document is a proposed implementation, not a verified UI fix.

## Start from the current workspace

Read AGENTS.md and check git status. There are already uncommitted changes across
the shell, current-service.css, mobile-chrome.css, responsive-density.css, sheets,
station panels, maps, and browser tests. Preserve these changes. Do not revert or
replace those files wholesale. Scope this task to web/PWA; no native or backend work.

Observed code:

- `frontend/src/styles/shell/responsive-density.css` already has a compact pass at
  max-width 400px and landscape max-height 520px. Extend/reconcile it; do not add a
  second competing compact system.
- `frontend/src/app/globals.css` imports `current-service.css` last. Its scoped
  `.linewatch-shell` selectors override some older compact rules, including nav
  icon sizing. Audit computed styles before changing import order; moving the
  whole density stylesheet could unintentionally change many screens.
- `mobile-chrome.css` defines `.mobile-bottom-nav-badge` at 16px high with 11px type,
  weight 1000, and separate single-digit sizing. `current-service.css` repositions
  the badge against a 64px-wide icon wrapper. The exact iOS numeral-centering cause
  is unverified: inspect the nested count renderer and inherited styles too.
- `frontend/src/styles/account/saved-commutes.css` near lines 2065–2135 uses wrapped
  flex rows, nonshrinking buttons, and 28px minimum action heights. Long labels
  exhaust the available card width.
- `frontend/src/components/SavedCommutesPanel.tsx` near lines 1920–1935 renders
  “View N Stops” and “View path on map” / “Viewing path”.
- Existing `frontend/tests/smoke/compact-mobile.spec.ts` exercises 375×667, both
  networks, controls, and sheets. Some assertions pin old exact dimensions.

## Design decision

Use shared compact spacing/control tokens plus component reflow. Do not scale the
app root, use CSS zoom, shrink all fonts, disable browser zoom, or change map SVG
coordinates. A proportional shrink would also shrink already-small type and touch
targets. Aim for roughly 10–15% less decorative footprint where space permits;
that is a visual target, not a universal scale factor.

Use CSS viewport dimensions, not physical resolution, DPR, or device detection.
Keep the existing <=400px narrow breakpoint. Add short-portrait accommodations
only within the mobile layout (suggest <=700px viewport height), reducing vertical
gaps and panel padding rather than shrinking text. Keep landscape rules separately
scoped; avoid changing a wide desktop simply because its window is short.

Proposed compact tokens: edge inset 8–10px, control hit box 44px, control glyph
20–22px, gap 6px. Reuse existing token names where available. Preserve larger
defaults outside compact conditions. Do not force a currently smaller control to
look bigger: a smaller visual surface can sit inside a transparent 44px button.
Do not overlap invisible hit regions between neighboring controls.

## Required changes

1. Map chrome: inspect `shell/map-controls.css`, `map/map-legends.css`,
   `shell/map-mode-control.css`, `mobile-chrome.css`, and `current-service.css`.
   Apply tokens to information, recenter, zoom, train toggle, and network controls.
   Reduce surface padding, glyph size, radius, and inter-control gaps where useful.
   Keep the legend's route identities readable; reduce its container decoration
   before reducing badges. Inspect whether it is one disclosure target or separate
   interactive rows before modifying hit areas. Keep expanded legend usable and
   all controls clear of search, status sheet, and safe areas in both networks.
2. Nav badges: fix alignment independently of compact mode. Use a centered
   inline-flex/grid inner count, explicit line-height:1, border-box sizing,
   nonshrinking content, and tabular numerals. Try 18px minimum height/width,
   11px type, weight 700, and 3–4px horizontal padding for multiple digits.
   Single digits may be circular; multiple digits should be a pill. Anchor to the
   actual icon region. Verify nested animated/count components do not carry a
   conflicting line height or transform. Avoid device-specific baseline nudges.
3. Commute actions: use a named inline-size container on the card and adapt the
   footer to its actual available width. At narrow card widths (start around
   360px), show “Edit”, “N stops” / “Hide stops”, and “Map” / “Viewing map”, retaining
   icons and descriptive accessible names. Prefer three equal minmax(0,1fr) grid
   columns, small gaps, and >=44px action heights. Preserve selected, expanded,
   disabled, and focus states. Test the longest supported stop count. Do not use
   nowrap or overflow:hidden to conceal a failure. At exceptionally narrow widths
   or enlarged text, allow an intentional two-column row with a full-width map
   action; readable reflow takes priority over one-row purity.
4. Keep body text and search input font sizes readable; do not reduce input text
   below its current 16px sizing if present. Preserve safe-area env() offsets,
   dynamic viewport units, and existing visual-viewport keyboard handling. Short
   viewports must leave sheet content scrollable and close actions reachable.
5. Scope new selectors to these components. Reconcile obsolete overrides instead
   of stacking more !important declarations. Do not redesign current service,
   change data/freshness behavior, or remove actions to gain space.

Container queries respond to available component space, including narrow desktop
panels: [MDN container queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries).
Use a readable wrapping base layout as the fallback.

## Verification and acceptance

Capture before/after views from the current checkout. Cover 320×568 (older SE),
375×667 (newer SE), 390×844, 412×915 (representative taller Android; confirm actual
Pixel CSS viewport if available), 667×375 landscape, and desktop. Exercise both
TTC and GO/UP. Verify dark and high contrast plus a light-mode spot check.

- No document horizontal overflow, clipped action labels, or control collisions.
- Default-text 375px commute footer fits one row with all three actions usable;
  320px and enlarged text may deliberately reflow.
- Counts 1, 2, 9, 20, 99, and the renderer's supported overflow representation are
  visibly centered; test both static and updating counts in WebKit and Chromium.
- Compact map chrome occupies less space without losing usable hit targets.
- Normal Android and desktop layouts remain stable except corrected count alignment.
- Sheets work with keyboard visible, larger text, and scrolling; map controls do
  not jump into sheets when the viewport shortens.
- Route editing, stop expansion, and map path selection still work for both networks.

Extend existing compact-mobile and overlapping-count-badges browser scenarios with
behavioral geometry/overflow assertions; avoid testing only token strings. Follow
AGENTS.md for final verification: fast tests, typecheck, lint for TSX changes;
focused WebKit/Chromium browser checks; full visual suite if shared global styling
changes. Inspect image differences before updating baselines. Run shared-stub
suites serially. Physical iPhone Safari and installed-PWA inspection is still needed
to confirm the original platform-specific appearance; emulation is not that check.

Deliver the implementation, concise before/after findings, commands/results, and
remaining device checks. Do not deploy or modify existing unrelated work.

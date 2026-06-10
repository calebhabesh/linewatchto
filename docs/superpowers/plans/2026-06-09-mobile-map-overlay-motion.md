# Mobile Map Overlay Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore safe, visible mobile web motion for map alert overlays, station focus flashes, and mobile menu interactions without bringing back the expensive desktop SVG paint stack.

**Architecture:** Keep the shared `InteractiveTtcMap` renderer for desktop and mobile. Adjust mobile-specific CSS guardrails so mobile gets short focus flashes, lightweight unblurred overlay pulses, larger Reduced Speed Zone arrows, and compositor-friendly menu/sheet transitions while heavy blur, drop-shadow, mask-size, and noise/static effects remain desktop-only.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS in `frontend/src/app/globals.css`, Node built-in fixture/source tests, Playwright smoke tests.

---

## Current Context

Mobile and desktop already render the same map overlay React from `frontend/src/components/InteractiveTtcMap.tsx`. The mobile difference comes from `.linewatch-shell.mobile-performance-mode` rules in `frontend/src/app/globals.css`.

`useMobilePerformanceMode` enables the mobile guardrail for `(max-width: 767px), (pointer: coarse)`. That currently disables too much:

- It disables `asset-alert-path.map-selection-flash`, so alert "Show on Map" focus no longer visibly flashes.
- It disables `station-selection-flash`, so station taps do not flash.
- It disables all `asset-alert-path-glow` animation, so alert corridors become much less noticeable on mobile.
- It hides `.interactive-glow`, so selected corridor emphasis is weaker.
- It disables station search transitions wholesale, even though those are mostly transform/opacity/color transitions and are safe.

Preserve the performance goal. Do not restore desktop-only effects:

- No blurred SVG glow filters on mobile.
- No heavy drop-shadows on long SVG paths.
- No animated `feTurbulence`/static noise effects on mobile.
- No continuous mask-size or stroke-width pulse across every alert layer.
- No station radar ping/drop-shadow animations for all station impacts.
- No layout-heavy menu transitions on width, height, padding, top, bottom, or max-height.

Safe to restore on mobile:

- Short alert corridor focus flash after "Show on Map".
- Short station dot focus flash after station selection.
- Selected station dot pulse, with `filter: none`.
- Lightweight alert corridor aura pulse using opacity only, with `filter: none`.
- Selected corridor emphasis through an unblurred, static or lightly animated stroke.
- Larger/thicker RSZ chevrons and a stronger amber base.
- Transform/opacity mobile sheet transitions.
- Bottom nav, submenu, and station search transitions using `transform`, `opacity`, `background-color`, `border-color`, and `color`.

Before editing, run:

```bash
git status --short
```

Expected: there may be existing uncommitted frontend changes. Do not revert unrelated work.

## File Map

- Modify `frontend/src/app/globals.css`
  - Owns mobile performance-mode CSS, map overlay animation styles, station flash styles, and mobile menu/sheet transitions.

- Modify `frontend/tests/mobile-performance-guardrails.test.mjs`
  - Source-level tests for mobile performance policy: safe animations enabled, heavy effects still disabled.

- Modify `frontend/tests/map-layering.test.mjs`
  - Source-level tests for map overlay and station flash semantics.

- Modify `frontend/tests/smoke/dashboard.spec.ts`
  - Mobile Playwright smoke coverage for computed animation names and mobile menu transition properties.

---

### Task 1: Add Failing Mobile Motion Policy Tests

**Files:**
- Modify: `frontend/tests/mobile-performance-guardrails.test.mjs`
- Modify: `frontend/tests/map-layering.test.mjs`

- [ ] **Step 1: Add source tests for safe mobile map motion**

In `frontend/tests/mobile-performance-guardrails.test.mjs`, after the existing test named `"has mobile-only paint simplification rules for the SVG map"`, add:

```js
  it("keeps short map and station focus flashes enabled in mobile performance mode", () => {
    const disabledAnimationBlock =
      globalCss.match(
        /\.linewatch-shell\.mobile-performance-mode \.station-impact-ring,[\s\S]*?\.commute-path-preview-glow\s*\{[^}]*\}/,
      )?.[0] ?? "";

    assert.doesNotMatch(disabledAnimationBlock, /station-selection-flash/);
    assert.doesNotMatch(disabledAnimationBlock, /asset-alert-path\.map-selection-flash/);
    assert.doesNotMatch(disabledAnimationBlock, /station-selected-indicator/);

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path\.map-selection-flash\s*\{[^}]*filter:\s*none\s*!important;[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-selection-flash\s*\{[^}]*filter:\s*none\s*!important;[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-selected-indicator\s*\{[^}]*filter:\s*none\s*!important;[^}]*\}/s,
    );
  });

  it("restores lightweight mobile overlay emphasis while keeping heavy paint effects disabled", () => {
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow\s*\{[^}]*filter:\s*none\s*!important;[^}]*opacity:\s*0\.28;[^}]*stroke-width:\s*132;[^}]*\}/s,
    );
    assert.doesNotMatch(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow\s*\{[^}]*animation:\s*none\s*!important;/s,
    );
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.interactive-glow\s*\{[^}]*display:\s*block;[^}]*filter:\s*none\s*!important;[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.interactive-glow\.selected\s*\{[^}]*opacity:\s*0\.48;[^}]*stroke-width:\s*162;[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.rsz-chevron\s*\{[^}]*stroke-width:\s*10;[^}]*transform:\s*scale\(1\.45\);[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.delay-hourglass-mask-path,[\s\S]*?\.rsz-chevron-mask-path\s*\{[^}]*animation:\s*none\s*!important;[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-impact-dot-red-glow,[\s\S]*?\.station-impact-dot-red-ping[\s\S]*?\{[^}]*animation:\s*none\s*!important;[^}]*\}/s,
    );
  });
```

- [ ] **Step 2: Add source tests for mobile menu motion boundaries**

In `frontend/tests/mobile-performance-guardrails.test.mjs`, after the existing test named `"does not animate search expansion with layout properties"`, add:

```js
  it("keeps mobile menu transitions compositor-friendly", () => {
    assert.match(
      globalCss,
      /\.mobile-bottom-nav-item\s*\{[^}]*transition:\s*background-color 150ms ease,\s*border-color 150ms ease,\s*color 150ms ease,\s*transform 120ms ease;[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.mobile-bottom-nav-item:active\s*\{[^}]*transform:\s*translateY\(1px\) scale\(0\.98\);[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.mobile-status-actions button\s*\{[^}]*transition:\s*background-color 150ms ease,\s*border-color 150ms ease,\s*color 150ms ease,\s*transform 120ms ease;[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.station-search-panel\s*\{[^}]*transition:\s*[\s\S]*opacity 220ms[\s\S]*transform 220ms[\s\S]*\}/s,
    );
    assert.doesNotMatch(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-search-panel,[\s\S]*?transition:\s*none\s*!important;/s,
    );
  });
```

- [ ] **Step 3: Add map layering tests for existing station flash hooks**

In `frontend/tests/map-layering.test.mjs`, after the existing test named `"uses resolved SVG station centers for station flashes and hit targets"`, add:

```js
  it("keeps alert and station focus flash elements wired for mobile-safe animation", () => {
    assert.match(interactiveMapSource, /flashSelection/);
    assert.match(interactiveMapSource, /flashStationId/);
    assert.match(interactiveMapSource, /data-map-highlight-id=\{flashSelection\.id\}/);
    assert.match(interactiveMapSource, /data-map-highlight-id=\{station\.id\}/);
    assert.match(interactiveMapSource, /className="asset-alert-path map-selection-flash pointer-events-none"/);
    assert.match(interactiveMapSource, /className="station-selection-flash"/);
    assert.match(globalCss, /@keyframes map-selection-flash/);
    assert.match(globalCss, /@keyframes station-selection-flash/);
  });
```

- [ ] **Step 4: Run source tests and confirm failure**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: FAIL. The new tests should fail because mobile performance mode currently disables the focus flash animations, hides selected interactive glow, and disables station search transitions.

- [ ] **Step 5: Commit failing tests if working branch policy allows**

If the user wants task-by-task commits, run:

```bash
git add frontend/tests/mobile-performance-guardrails.test.mjs frontend/tests/map-layering.test.mjs
git commit -m "test: define mobile overlay motion policy"
```

If the worktree already has unrelated uncommitted changes, skip the commit and continue without staging unrelated files.

---

### Task 2: Restore Safe Mobile Map Overlay Motion

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Edit the mobile performance-mode map block**

In `frontend/src/app/globals.css`, find the block that starts with:

```css
.linewatch-shell.mobile-performance-mode .asset-alert-path-glow {
  animation: none !important;
  filter: none !important;
  opacity: 0.24;
  stroke-width: 122;
  transition: none !important;
}
```

Replace it with:

```css
.linewatch-shell.mobile-performance-mode .asset-alert-path-glow {
  filter: none !important;
  opacity: 0.28;
  stroke-width: 132;
  transition: none !important;
}
```

This keeps the desktop blur filter off, but allows the existing subclass opacity pulse on `.asset-alert-path-glow.suspension`, `.delay`, `.delay-static`, and `.reduced-speed-zone` to run on mobile.

- [ ] **Step 2: Restore selected corridor emphasis without blur**

Find:

```css
.linewatch-shell.mobile-performance-mode .interactive-glow {
  display: none;
}
```

Replace it with:

```css
.linewatch-shell.mobile-performance-mode .interactive-glow {
  display: block;
  filter: none !important;
  opacity: 0;
}

.linewatch-shell.mobile-performance-mode .interactive-glow.selected {
  opacity: 0.48;
  stroke-width: 162;
}
```

This keeps the selected path visible after a user taps "Show on Map" without restoring desktop blur.

- [ ] **Step 3: Keep heavy path/mask animations disabled**

Leave this block in place:

```css
.linewatch-shell.mobile-performance-mode .asset-alert-path.delay-candy,
.linewatch-shell.mobile-performance-mode .asset-alert-path.suspension-candy,
.linewatch-shell.mobile-performance-mode .asset-alert-path.delay-static-base,
.linewatch-shell.mobile-performance-mode .delay-hourglass-mask-path,
.linewatch-shell.mobile-performance-mode .suspension-mask-path,
.linewatch-shell.mobile-performance-mode .rsz-chevron-mask-path {
  animation: none !important;
  transition: none !important;
}
```

Add static width tuning directly after it:

```css
.linewatch-shell.mobile-performance-mode .asset-alert-path.delay-candy,
.linewatch-shell.mobile-performance-mode .asset-alert-path.suspension-candy,
.linewatch-shell.mobile-performance-mode .asset-alert-path.delay-static-base {
  stroke-width: 112;
}

.linewatch-shell.mobile-performance-mode .delay-hourglass-mask-path,
.linewatch-shell.mobile-performance-mode .suspension-mask-path,
.linewatch-shell.mobile-performance-mode .rsz-chevron-mask-path {
  stroke-width: 108 !important;
}
```

This makes mobile corridors easier to read while keeping mask-size/stroke-width pulse animations off.

- [ ] **Step 4: Re-enable alert and station focus flashes**

Find the block that currently includes these selectors:

```css
.linewatch-shell.mobile-performance-mode .station-selected-indicator,
.linewatch-shell.mobile-performance-mode .station-impact-ring,
.linewatch-shell.mobile-performance-mode .station-impact-dot-red-glow,
.linewatch-shell.mobile-performance-mode .station-impact-dot-red-ping,
.linewatch-shell.mobile-performance-mode .station-selection-flash,
.linewatch-shell.mobile-performance-mode .asset-alert-path.map-selection-flash,
.linewatch-shell.mobile-performance-mode .station-commute-green-flash,
.linewatch-shell.mobile-performance-mode .commute-path-preview-glow {
  animation: none !important;
  filter: none !important;
}
```

Replace it with:

```css
.linewatch-shell.mobile-performance-mode .station-impact-ring,
.linewatch-shell.mobile-performance-mode .station-impact-dot-red-glow,
.linewatch-shell.mobile-performance-mode .station-impact-dot-red-ping,
.linewatch-shell.mobile-performance-mode .station-commute-green-flash,
.linewatch-shell.mobile-performance-mode .commute-path-preview-glow {
  animation: none !important;
  filter: none !important;
}

.linewatch-shell.mobile-performance-mode .station-selected-indicator,
.linewatch-shell.mobile-performance-mode .station-selection-flash,
.linewatch-shell.mobile-performance-mode .asset-alert-path.map-selection-flash {
  filter: none !important;
}
```

This restores:

- `map-selection-flash` for alert "Show on Map".
- `station-selection-flash` for tapped station dots.
- `station-selected-pulse` for the selected station dot.

It keeps these disabled:

- Station impact ring pulse.
- Station red glow.
- Station radar ping.
- Commute path glow pulse.

- [ ] **Step 5: Make RSZ chevrons legible on mobile**

After the existing `.rsz-chevron` rule, add:

```css
.linewatch-shell.mobile-performance-mode .rsz-chevron {
  stroke-width: 10;
  transform: scale(1.45);
  transform-box: fill-box;
  transform-origin: center;
}
```

Do not change `AnimatedChevronLane` in `InteractiveTtcMap.tsx` for this task. The lane movement already runs unless the user enables reduced motion. The problem is mobile visual size and contrast, so CSS is sufficient.

- [ ] **Step 6: Preserve reduced-motion behavior**

After the existing `.motion-paused .asset-alert-path.map-selection-flash` and `.motion-paused .station-selection-flash` rules, add:

```css
.motion-paused.linewatch-shell.mobile-performance-mode .asset-alert-path-glow,
.motion-paused.linewatch-shell.mobile-performance-mode .interactive-glow,
.motion-paused.linewatch-shell.mobile-performance-mode .station-selected-indicator,
.motion-paused.linewatch-shell.mobile-performance-mode .station-selection-flash,
.motion-paused.linewatch-shell.mobile-performance-mode .asset-alert-path.map-selection-flash {
  animation: none !important;
}
```

Inside the existing `@media (prefers-reduced-motion: reduce)` section near the map overlay rules, make sure these selectors are covered:

```css
@media (prefers-reduced-motion: reduce) {
  .asset-alert-path-glow,
  .asset-alert-path.delay-candy,
  .asset-alert-path.suspension-candy,
  .asset-alert-path.delay-static-base,
  .delay-static-path,
  .station-selected-indicator,
  .station-selection-flash,
  .asset-alert-path.map-selection-flash {
    animation: none !important;
  }
}
```

If the block already exists, merge the missing selectors into it rather than duplicating the whole media query.

- [ ] **Step 7: Run source tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: the mobile motion tests from Task 1 now pass. If unrelated tests fail, read and report the exact failing tests before changing more code.

- [ ] **Step 8: Commit map overlay CSS changes if working branch policy allows**

```bash
git add frontend/src/app/globals.css frontend/tests/mobile-performance-guardrails.test.mjs frontend/tests/map-layering.test.mjs
git commit -m "fix: restore lightweight mobile map focus motion"
```

Skip the commit if the worktree has unrelated user changes that should not be staged.

---

### Task 3: Restore Safe Mobile Menu and Submenu Motion

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Remove the mobile-performance transition kill switch for station search**

Find:

```css
.linewatch-shell.mobile-performance-mode .station-search-panel,
.linewatch-shell.mobile-performance-mode .station-search-stations-column,
.linewatch-shell.mobile-performance-mode .station-search-line-trigger,
.linewatch-shell.mobile-performance-mode .station-search-station {
  transition: none !important;
}
```

Delete that block.

The existing station search transitions use opacity, transform, color, background, and border-color. The tests already guard against `width`, `padding-left`, and `padding-right` transition regressions.

- [ ] **Step 2: Add bottom nav tap feedback**

In the `.mobile-bottom-nav-item` rule inside `@media (max-width: 767px)`, add this exact transition line:

```css
    transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, transform 120ms ease;
```

After `.mobile-bottom-nav-item[data-active="true"]`, add:

```css
  .mobile-bottom-nav-item:active {
    transform: translateY(1px) scale(0.98);
  }
```

- [ ] **Step 3: Replace broad mobile action transitions with specific transitions**

Find the `.mobile-status-actions button` rule. It currently uses:

```css
    transition: all 0.2s ease;
```

Replace that line with:

```css
    transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, transform 120ms ease;
```

Do not animate layout properties for status buttons.

- [ ] **Step 4: Keep mobile sheets transform/opacity based**

Confirm this existing mobile sheet animation remains unchanged:

```css
@keyframes floating-mobile-sheet-enter {
  from {
    opacity: 0;
    transform: translateY(22px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Do not add backdrop-filter animation or animated box-shadow to `.floating-panel-shell` or `.floating-panel-scroll`.

- [ ] **Step 5: Run source tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 6: Commit menu motion CSS changes if working branch policy allows**

```bash
git add frontend/src/app/globals.css frontend/tests/mobile-performance-guardrails.test.mjs
git commit -m "fix: keep mobile menu motion lightweight"
```

Skip the commit if the worktree has unrelated user changes that should not be staged.

---

### Task 4: Add Mobile Smoke Coverage for Flashes and Menu Motion

**Files:**
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Add a mobile-only smoke test**

In `frontend/tests/smoke/dashboard.spec.ts`, after the existing test named `"map overlays open the corresponding submenu cards"`, add:

```ts
test("mobile keeps lightweight map focus flashes and menu transitions", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only motion smoke");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await openServiceCategory(page, isMobile, /Reduced Speed Zone/);
  await page
    .locator(".alert-card")
    .filter({ hasText: "Eglinton" })
    .getByRole("button", { name: "Show on Map" })
    .click();

  const mapFlash = page.locator('[data-map-highlight-id="reduced-speed-zone-stub-zone-south-source"]').first();
  await expect(mapFlash).toBeAttached();
  await expect
    .poll(async () => mapFlash.evaluate((element) => getComputedStyle(element).animationName))
    .toContain("map-selection-flash");
  await expect
    .poll(async () => mapFlash.evaluate((element) => getComputedStyle(element).filter))
    .toBe("none");

  await page.locator('[data-mobile-impact-inspector]').getByRole("button", { name: "Unfocus impact" }).click();
  await page.getByRole("button", { name: "Stub Station station details" }).click();

  const stationFlash = page.locator('[data-map-highlight-id="stub-station"]').first();
  await expect(stationFlash).toBeAttached();
  await expect
    .poll(async () => stationFlash.evaluate((element) => getComputedStyle(element).animationName))
    .toContain("station-selection-flash");
  await expect
    .poll(async () => stationFlash.evaluate((element) => getComputedStyle(element).filter))
    .toBe("none");

  await page.getByRole("button", { name: "Search", exact: true }).click();
  const searchPanel = page.locator("[data-station-search-panel]");
  await expect(searchPanel).toBeVisible();
  const searchTransitionProperty = await searchPanel.evaluate((element) => getComputedStyle(element).transitionProperty);
  expect(searchTransitionProperty).toContain("opacity");
  expect(searchTransitionProperty).toContain("transform");
  expect(searchTransitionProperty).not.toContain("width");

  const searchNavItem = page.getByRole("button", { name: "Search", exact: true });
  const navTransitionProperty = await searchNavItem.evaluate((element) => getComputedStyle(element).transitionProperty);
  expect(navTransitionProperty).toContain("transform");
  expect(navTransitionProperty).not.toContain("width");
});
```

- [ ] **Step 2: Run the smoke test in mobile mode**

Run:

```bash
npm --prefix frontend run test:smoke -- --grep "mobile keeps lightweight map focus flashes and menu transitions"
```

Expected: PASS in the mobile project. If the local Playwright setup runs all projects and desktop skips the test, that is acceptable.

If the command does not accept `-- --grep`, run the project smoke command:

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS, or report the exact failing test and browser project.

- [ ] **Step 3: Commit smoke coverage if working branch policy allows**

```bash
git add frontend/tests/smoke/dashboard.spec.ts
git commit -m "test: cover mobile map focus motion"
```

Skip the commit if unrelated user changes make a focused commit unsafe.

---

### Task 5: Manual Visual Verification

**Files:**
- No code changes unless a test exposes a defect.

- [ ] **Step 1: Start the frontend dev server**

Run:

```bash
npm --prefix frontend run dev
```

Expected: Next.js dev server starts and prints a local URL, usually `http://localhost:3000`.

- [ ] **Step 2: Open mobile viewport in browser automation or Playwright UI**

Use a mobile viewport around `390x844`.

Verify:

- Bottom nav active state animates/taps subtly.
- Status sheet enters with a short upward slide/fade.
- Alert submenu buttons still respond quickly.
- "Show on Map" for a Reduced Speed Zone zooms the map and flashes the selected corridor.
- RSZ chevrons are visibly larger than before and direction is readable.
- Station tap flashes the station dot.
- Selected station dot pulse is visible but not glow-heavy.
- High contrast mode still keeps all focus states readable.
- Reduced motion mode disables the restored animations.

- [ ] **Step 3: Inspect computed styles for mobile map effects**

In browser devtools or Playwright evaluate:

```js
getComputedStyle(document.querySelector('[data-map-highlight-id="reduced-speed-zone-stub-zone-south-source"]')).animationName
```

Expected during the flash window:

```text
map-selection-flash
```

Evaluate:

```js
getComputedStyle(document.querySelector('[data-map-highlight-id="stub-station"]')).animationName
```

Expected during the flash window:

```text
station-selection-flash
```

- [ ] **Step 4: Watch for performance regressions**

On a mobile viewport, pan and pinch the map while a Reduced Speed Zone and a station inspector are visible.

Acceptable:

- Brief flash/pulse remains smooth.
- Panning does not hitch more than before.
- Bottom sheets and nav feel responsive.

Not acceptable:

- Sustained jank while overlays are idle.
- Any long-path SVG blur visible on mobile.
- Alert masks pulsing wider/narrower continuously.
- Station impact radar pings running for every station impact.

---

### Task 6: Final Verification

**Files:**
- No code changes unless verification fails.

- [ ] **Step 1: Run frontend fixture/source tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 4: Run smoke tests for substantial frontend motion changes**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS. If smoke requires browsers or local services that are unavailable, report the exact command and failure output.

- [ ] **Step 5: Check final diff**

Run:

```bash
git diff -- frontend/src/app/globals.css frontend/tests/mobile-performance-guardrails.test.mjs frontend/tests/map-layering.test.mjs frontend/tests/smoke/dashboard.spec.ts
```

Expected:

- CSS changes are scoped to mobile performance-mode map overlay rules and mobile menu transitions.
- Tests describe the intended mobile behavior.
- No backend, data contract, or unrelated UI refactor changes.

---

## Self-Review

Spec coverage:

- Alert "Show on Map" mobile flash restored: Task 1, Task 2, Task 4.
- Station dot flash restored: Task 1, Task 2, Task 4.
- RSZ visibility improved: Task 1, Task 2.
- Lightweight mobile overlay pulse restored: Task 1, Task 2.
- Heavy desktop-only effects remain disabled: Task 1, Task 2, Task 5.
- General mobile menu/submenu motion restored safely: Task 1, Task 3, Task 4.
- Reduced motion respected: Task 2, Task 5.
- Verification commands included: Task 6.

Placeholder scan:

- No placeholder tasks are left.
- All code snippets use concrete selectors and file paths.

Type and selector consistency:

- CSS selectors match existing classes in `globals.css` and `InteractiveTtcMap.tsx`.
- Smoke selectors use existing fixture ids: `reduced-speed-zone-stub-zone-south-source` and `stub-station`.
- The plan avoids adding new React props or changing map data contracts.

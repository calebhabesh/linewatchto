# Mobile Map Animation Flicker Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate Pixel/mobile map flicker during pan, pinch, drag, and alert focus by making expensive SVG map animation effects static on mobile while preserving desktop visual richness and source-backed map interactions.

**Architecture:** Keep the existing `InteractiveTtcMap` renderer and data flow. Treat `.linewatch-shell.mobile-performance-mode` as the mobile default for static map effects: no continuous SVG pulse, blur, drop-shadow, stroke-width, dash-offset, or transform animations on map overlays. Desktop keeps the current animation language; mobile uses static high-contrast strokes, fills, and selected states, with Reduced Motion remaining an explicit accessibility override for the whole app.

**Tech Stack:** Next.js App Router, React, TypeScript, plain CSS in `frontend/src/app/globals.css`, source-level tests with Node's built-in test runner, Playwright smoke tests, Chrome DevTools Performance traces on Pixel 6a.

---

## Diagnosis Summary

The bug is now isolated enough to fix without more trace precision.

Evidence:

- On Pixel 6a mobile Chrome, enabling the app/browser Reduced Motion mode stops all map flicker and re-rendering artifacts.
- Chrome DevTools Performance `Animations` track shows repeated `aura-pulse` blocks, plus `transform` and occasional `background-color` chunks.
- The local trace summary at `traces/Trace-20260610T231031-summary.md` shows:
  - `DroppedFrame` markers: `323`
  - `FireAnimationFrame`: `1,269.6ms`
  - `PageAnimator::serviceScriptedAnimations`: `1,387.2ms`
  - Paint/raster/composite inclusive work: `4,192.5ms`
  - Layout/style self time: `1,867.8ms`
  - Scripting self time: `4,637.9ms`
- The code maps `aura-pulse` directly to `frontend/src/app/globals.css`.
- `LineWatchShell` applies:
  - `motion-paused` when `prefers-reduced-motion: reduce` or the Reduced Motion toggle is active.
  - `mobile-performance-mode` from `useMobilePerformanceMode()` on `(max-width: 767px), (pointer: coarse)`.
- Current `mobile-performance-mode` removes some filters and some animations, but it still allows expensive continuous mobile map animations, especially `aura-pulse` on `.asset-alert-path-glow`.

Root cause hypothesis to implement against:

> Mobile flicker is caused by continuous SVG overlay animation invalidating a complex transformed SVG scene during pan/pinch/drag. The worst offenders are animated SVG glow/stroke/filter/transform effects over the large TTC map, not ordinary React re-rendering.

This implementation should not chase minified JS source maps first. Source maps are useful only if a later trace still shows unexplained JS long tasks after CSS animation is disabled.

## Non-Goals

- Do not remove desktop visual effects.
- Do not redesign the map UI.
- Do not replace the base SVG with raster tiles in this pass.
- Do not add dependencies.
- Do not claim live TTC data or unrelated product changes.
- Do not remove the Reduced Motion toggle; it remains a user-visible accessibility control.

## File Map

- Modify `frontend/src/app/globals.css`
  - Primary fix. Add static mobile map effect rules under `.linewatch-shell.mobile-performance-mode`.
  - Disable continuous map overlay animations on mobile.
  - Preserve desktop keyframes and desktop animation declarations.

- Modify `frontend/src/hooks/usePanZoom.ts`
  - Add a `disableProgrammaticMotion` option so mobile can avoid animated recenter/zoom transforms without pretending the entire app is in Reduced Motion.

- Modify `frontend/src/components/InteractiveTtcMap.tsx`
  - Accept a `mobilePerformanceMode` prop.
  - Pass `disableProgrammaticMotion: mobilePerformanceMode` into `usePanZoom`.
  - Use static transition behavior for the transformed map layer on mobile performance mode.

- Modify `frontend/src/components/LineWatchShell.tsx`
  - Pass the existing `mobilePerformanceMode` value into `InteractiveTtcMap`.

- Modify `frontend/tests/mobile-performance-guardrails.test.mjs`
  - Replace older tests that expected lightweight mobile animation restoration with tests that require static mobile map effects.
  - Add source-level tests for the new `disableProgrammaticMotion` boundary.

- Modify `frontend/tests/map-layering.test.mjs`
  - Update expectations so desktop animation still exists, but mobile performance mode explicitly disables it.

- Modify `frontend/tests/smoke/dashboard.spec.ts`
  - Add or update mobile smoke assertions for computed animation names on mobile map overlay elements.

---

### Task 1: Update Source Tests To Capture The New Diagnosis

**Files:**

- Modify: `frontend/tests/mobile-performance-guardrails.test.mjs`
- Modify: `frontend/tests/map-layering.test.mjs`

- [ ] **Step 1: Inspect current test expectations**

Run:

```bash
git status --short
rg -n "restores lightweight mobile overlay emphasis|keeps short map and station focus flashes|mobile-performance-mode|aura-pulse|disableProgrammaticMotion" frontend/tests frontend/src
```

Expected:

- `frontend/tests/mobile-performance-guardrails.test.mjs` currently contains tests that expect some mobile map animation to remain enabled.
- Those expectations are now stale because Reduced Motion fully resolving the issue means mobile should default to static map effects.

- [ ] **Step 2: Replace the stale lightweight-motion test**

In `frontend/tests/mobile-performance-guardrails.test.mjs`, replace the entire test named:

```js
it("restores lightweight mobile overlay emphasis while keeping heavy paint effects disabled", () => {
  // old assertions
});
```

with:

```js
  it("disables continuous SVG map overlay animations in mobile performance mode", () => {
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow,[\s\S]*?\.linewatch-shell\.mobile-performance-mode \.asset-alert-path\.map-selection-flash,[\s\S]*?\.linewatch-shell\.mobile-performance-mode \.station-selection-flash\s*\{[^}]*animation:\s*none\s*!important;[^}]*filter:\s*none\s*!important;[^}]*transition:\s*none\s*!important;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow\s*\{[^}]*opacity:\s*0\.34;[^}]*stroke-width:\s*132;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow\.selected\s*\{[^}]*opacity:\s*0\.54;[^}]*stroke-width:\s*162;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path\.map-selection-flash\s*\{[^}]*opacity:\s*0\.95;[^}]*stroke-width:\s*140;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-selection-flash\s*\{[^}]*opacity:\s*0\.9;[^}]*\}/s,
    );

    assert.doesNotMatch(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow\s*\{[^}]*animation:\s*aura-pulse/s,
    );
  });
```

- [ ] **Step 3: Replace the stale short-focus-flash test**

In `frontend/tests/mobile-performance-guardrails.test.mjs`, replace the test named:

```js
it("keeps short map and station focus flashes enabled in mobile performance mode", () => {
  // old assertions
});
```

with:

```js
  it("keeps map and station focus indicators visible but static on mobile", () => {
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path\.map-selection-flash\s*\{[^}]*animation:\s*none\s*!important;[^}]*filter:\s*none\s*!important;[^}]*opacity:\s*0\.95;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-selection-flash\s*\{[^}]*animation:\s*none\s*!important;[^}]*filter:\s*none\s*!important;[^}]*opacity:\s*0\.9;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-selected-indicator\s*\{[^}]*animation:\s*none\s*!important;[^}]*filter:\s*none\s*!important;[^}]*opacity:\s*0\.85;[^}]*\}/s,
    );
  });
```

- [ ] **Step 4: Add tests for static station and commute map effects**

In `frontend/tests/mobile-performance-guardrails.test.mjs`, after the new `"keeps map and station focus indicators visible but static on mobile"` test, add:

```js
  it("disables continuous station and commute map animations on mobile", () => {
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-impact-ring,[\s\S]*?\.linewatch-shell\.mobile-performance-mode \.commute-path-preview-glow\s*\{[^}]*animation:\s*none\s*!important;[^}]*filter:\s*none\s*!important;[^}]*transition:\s*none\s*!important;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-impact-ring\s*\{[^}]*stroke-width:\s*5;[^}]*opacity:\s*0\.95;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-impact-dot-red-glow\s*\{[^}]*transform:\s*scale\(1\);[^}]*opacity:\s*0\.95;[^}]*\}/s,
    );

    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-impact-dot-red-ping\s*\{[^}]*display:\s*none;[^}]*\}/s,
    );
  });
```

- [ ] **Step 5: Add tests for mobile programmatic transform motion**

In `frontend/tests/mobile-performance-guardrails.test.mjs`, add this near the existing pan/zoom tests:

```js
  it("uses static programmatic map transforms in mobile performance mode", () => {
    assert.match(
      panZoomSource,
      /disableProgrammaticMotion\?:\s*boolean/,
    );
    assert.match(
      panZoomSource,
      /disableProgrammaticMotion\s*=\s*false/,
    );
    assert.match(
      panZoomSource,
      /const shouldAnimateProgrammaticTransform = !reducedMotion && !disableProgrammaticMotion/,
    );
    assert.match(
      mapSource,
      /mobilePerformanceMode\?:\s*boolean/,
    );
    assert.match(
      mapSource,
      /usePanZoom\(\{\s*reducedMotion,\s*viewportOrientation,\s*disableProgrammaticMotion:\s*mobilePerformanceMode,\s*\}\)/s,
    );
    assert.match(
      shellSource,
      /mobilePerformanceMode=\{mobilePerformanceMode\}/,
    );
  });
```

- [ ] **Step 6: Update map layering test to preserve desktop effects while requiring mobile disablement**

In `frontend/tests/map-layering.test.mjs`, keep the existing desktop animation assertions in `"renders animated visual effects for delays, closures, and station impacts"`. After the existing assertion:

```js
assert.match(globalCss, /@keyframes station-selected-pulse/);
```

add:

```js
    assert.match(globalCss, /@keyframes aura-pulse/);
    assert.match(globalCss, /\.asset-alert-path-glow\.delay\s*\{[^}]*animation:\s*aura-pulse 1\.2s infinite alternate ease-in-out;/s);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow,[\s\S]*animation:\s*none\s*!important;/s);
```

- [ ] **Step 7: Run the source tests and verify they fail for the right reason**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected:

- FAIL.
- Failures should mention missing static mobile animation rules and missing `disableProgrammaticMotion`.
- Do not change implementation until this failure is observed.

---

### Task 2: Disable Continuous Mobile SVG Map Effects In CSS

**Files:**

- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Replace the mobile performance map effect block**

In `frontend/src/app/globals.css`, find the block that starts near `.linewatch-shell.mobile-performance-mode .asset-alert-path-glow`.

Replace the mobile map-effect rules from:

```css
.linewatch-shell.mobile-performance-mode .asset-alert-path-glow {
  filter: none !important;
  opacity: 0.28;
  stroke-width: 132;
  transition: none !important;
}
```

through the rule ending with:

```css
.linewatch-shell.mobile-performance-mode .ttc-svg-container svg,
.linewatch-shell.mobile-performance-mode .asset-alert-path,
.linewatch-shell.mobile-performance-mode .asset-alert-path-glow {
  shape-rendering: auto;
  text-rendering: optimizeLegibility;
}
```

with this exact block:

```css
/* Mobile map stability: keep expensive SVG overlay effects static.
   Pixel traces showed aura-pulse / transform animation invalidating the large SVG scene. */
.linewatch-shell.mobile-performance-mode .asset-alert-path-glow,
.linewatch-shell.mobile-performance-mode .asset-alert-path.delay-candy,
.linewatch-shell.mobile-performance-mode .asset-alert-path.suspension-candy,
.linewatch-shell.mobile-performance-mode .asset-alert-path.delay-static-base,
.linewatch-shell.mobile-performance-mode .delay-hourglass-mask-path,
.linewatch-shell.mobile-performance-mode .suspension-mask-path,
.linewatch-shell.mobile-performance-mode .delay-static-path,
.linewatch-shell.mobile-performance-mode .asset-alert-path.map-selection-flash,
.linewatch-shell.mobile-performance-mode .station-selection-flash {
  animation: none !important;
  filter: none !important;
  transition: none !important;
}

.linewatch-shell.mobile-performance-mode .station-selected-indicator,
.linewatch-shell.mobile-performance-mode .station-impact-ring,
.linewatch-shell.mobile-performance-mode .station-impact-dot-red-glow,
.linewatch-shell.mobile-performance-mode .station-impact-dot-red-ping,
.linewatch-shell.mobile-performance-mode .station-commute-green-flash,
.linewatch-shell.mobile-performance-mode .commute-path-preview-glow {
  animation: none !important;
  filter: none !important;
  transition: none !important;
}

.linewatch-shell.mobile-performance-mode .asset-alert-path-glow {
  filter: none !important;
  opacity: 0.34;
  stroke-width: 132;
}

.linewatch-shell.mobile-performance-mode .asset-alert-path-glow.selected {
  filter: none !important;
  opacity: 0.54;
  stroke-width: 162;
}

.linewatch-shell.mobile-performance-mode .interactive-glow {
  display: block;
  filter: none !important;
  opacity: 0;
}

.linewatch-shell.mobile-performance-mode .interactive-glow.selected {
  opacity: 0.52;
  stroke-width: 162;
}

.linewatch-shell.mobile-performance-mode .asset-alert-path.delay-candy,
.linewatch-shell.mobile-performance-mode .asset-alert-path.suspension-candy,
.linewatch-shell.mobile-performance-mode .asset-alert-path.delay-static-base {
  stroke-width: 112;
}

.linewatch-shell.mobile-performance-mode .delay-hourglass-mask-path,
.linewatch-shell.mobile-performance-mode .suspension-mask-path {
  stroke-width: 108 !important;
}

.linewatch-shell.mobile-performance-mode .delay-static-path {
  opacity: 0.92;
  stroke-dasharray: 7 7;
  stroke-dashoffset: 0;
}

.linewatch-shell.mobile-performance-mode .asset-alert-path.map-selection-flash {
  animation: none !important;
  filter: none !important;
  opacity: 0.95;
  stroke-width: 140;
}

.linewatch-shell.mobile-performance-mode .station-selection-flash {
  animation: none !important;
  filter: none !important;
  opacity: 0.9;
}

.linewatch-shell.mobile-performance-mode .station-selected-indicator {
  animation: none !important;
  filter: none !important;
  opacity: 0.85;
  transform: scale(1);
}

.linewatch-shell.mobile-performance-mode .station-impact-ring {
  animation: none !important;
  filter: none !important;
  opacity: 0.95;
  stroke-width: 5;
}

.linewatch-shell.mobile-performance-mode .station-impact-dot-red-glow {
  animation: none !important;
  filter: none !important;
  opacity: 0.95;
  transform: scale(1);
}

.linewatch-shell.mobile-performance-mode .station-impact-dot-red-ping {
  animation: none !important;
  display: none;
  filter: none !important;
}

.linewatch-shell.mobile-performance-mode .station-commute-green-flash,
.linewatch-shell.mobile-performance-mode .commute-path-preview-glow {
  animation: none !important;
  filter: none !important;
}

.linewatch-shell.mobile-performance-mode .station-hit-target {
  transition: none !important;
}

.linewatch-shell.mobile-performance-mode .overlap-indicator {
  filter: none !important;
}

.linewatch-shell.mobile-performance-mode .ttc-svg-container svg,
.linewatch-shell.mobile-performance-mode .asset-alert-path,
.linewatch-shell.mobile-performance-mode .asset-alert-path-glow {
  shape-rendering: auto;
  text-rendering: optimizeLegibility;
}
```

- [ ] **Step 2: Remove the infinite mobile selected corridor flash**

Find:

```css
@media (max-width: 767px) {
  .asset-alert-path.map-selection-flash {
    animation: map-selection-flash 1.2s ease-in-out infinite;
  }
}
```

Replace it with:

```css
@media (max-width: 767px) {
  .asset-alert-path.map-selection-flash {
    animation: map-selection-flash 0.6s ease-in-out 2 forwards;
  }
}
```

Reason:

- Desktop can keep the existing flash behavior.
- Mobile must not run an infinite SVG stroke-width animation after selecting an alert.
- The mobile-performance rule from Step 1 still makes it static when `mobile-performance-mode` is active.

- [ ] **Step 3: Strengthen gesture-active fallback without making it the primary fix**

Find the existing `.map-gesture-active` block near the bottom of `globals.css`.

Ensure it contains this complete selector list:

```css
.map-gesture-active .asset-alert-path-glow,
.map-gesture-active .interactive-glow,
.map-gesture-active .asset-alert-path.delay-candy,
.map-gesture-active .asset-alert-path.suspension-candy,
.map-gesture-active .asset-alert-path.delay-static-base,
.map-gesture-active .delay-hourglass-mask-path,
.map-gesture-active .suspension-mask-path,
.map-gesture-active .delay-static-path,
.map-gesture-active .station-impact-ring,
.map-gesture-active .station-impact-dot-red-glow,
.map-gesture-active .station-impact-dot-red-ping,
.map-gesture-active .station-commute-green-flash,
.map-gesture-active .commute-path-preview-glow,
.map-gesture-active .asset-alert-path.map-selection-flash,
.map-gesture-active .station-selection-flash {
  animation: none !important;
  filter: none !important;
  transition: none !important;
}
```

If the block already exists, update it rather than duplicating it.

- [ ] **Step 4: Run CSS-related source tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected:

- Some tests may still fail because `usePanZoom` has not yet been updated.
- CSS-specific assertions added in Task 1 should now pass.

---

### Task 3: Disable Programmatic Map Transform Animation On Mobile Performance Mode

**Files:**

- Modify: `frontend/src/hooks/usePanZoom.ts`
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`

- [ ] **Step 1: Add a pan/zoom option**

In `frontend/src/hooks/usePanZoom.ts`, change:

```ts
type UsePanZoomOptions = {
  reducedMotion?: boolean;
  viewportOrientation?: MapViewportOrientation;
};
```

to:

```ts
type UsePanZoomOptions = {
  reducedMotion?: boolean;
  viewportOrientation?: MapViewportOrientation;
  disableProgrammaticMotion?: boolean;
};
```

Change:

```ts
export function usePanZoom({
  reducedMotion = false,
  viewportOrientation = "standard",
}: UsePanZoomOptions = {}) {
```

to:

```ts
export function usePanZoom({
  reducedMotion = false,
  viewportOrientation = "standard",
  disableProgrammaticMotion = false,
}: UsePanZoomOptions = {}) {
```

Immediately after the refs are declared, add:

```ts
  const shouldAnimateProgrammaticTransform = !reducedMotion && !disableProgrammaticMotion;
```

- [ ] **Step 2: Use the new option for idle and programmatic transitions**

In `frontend/src/hooks/usePanZoom.ts`, replace:

```ts
const restoreIdleMapTransition = useCallback(() => {
  setMapTransition(reducedMotion ? "none" : "transform 0.1s ease-out");
}, [reducedMotion, setMapTransition]);
```

with:

```ts
const restoreIdleMapTransition = useCallback(() => {
  setMapTransition(shouldAnimateProgrammaticTransform ? "transform 0.1s ease-out" : "none");
}, [setMapTransition, shouldAnimateProgrammaticTransform]);
```

In `animateTransformTo`, replace:

```ts
if (!mapRef.current || reducedMotion) {
```

with:

```ts
if (!mapRef.current || !shouldAnimateProgrammaticTransform) {
```

Replace:

```ts
setMapTransition(reducedMotion ? "none" : "transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)");
```

with:

```ts
setMapTransition("transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)");
```

Update the dependency list of `animateTransformTo`: remove `reducedMotion` if no longer used inside that callback and add `shouldAnimateProgrammaticTransform`.

- [ ] **Step 3: Add prop to `InteractiveTtcMap`**

In `frontend/src/components/InteractiveTtcMap.tsx`, change the function props destructuring from:

```ts
  reducedMotion,
  commutePathPreview,
```

to:

```ts
  reducedMotion,
  mobilePerformanceMode = false,
  commutePathPreview,
```

In the prop type object, add:

```ts
  mobilePerformanceMode?: boolean;
```

Change the `usePanZoom` call from:

```ts
  } = usePanZoom({ reducedMotion, viewportOrientation });
```

to:

```ts
  } = usePanZoom({
    reducedMotion,
    viewportOrientation,
    disableProgrammaticMotion: mobilePerformanceMode,
  });
```

- [ ] **Step 4: Make the map layer transition static on mobile performance mode**

In `frontend/src/components/InteractiveTtcMap.tsx`, find the map layer style:

```tsx
transition: reducedMotion
  ? "none"
  : isDragging
    ? "none"
    : "transform 0.1s ease-out",
```

Replace it with:

```tsx
transition: reducedMotion || mobilePerformanceMode
  ? "none"
  : isDragging
    ? "none"
    : "transform 0.1s ease-out",
```

- [ ] **Step 5: Pass the prop from `LineWatchShell`**

In `frontend/src/components/LineWatchShell.tsx`, find the `InteractiveTtcMap` usage. Add:

```tsx
mobilePerformanceMode={mobilePerformanceMode}
```

The resulting prop list should include both:

```tsx
reducedMotion={reducedMotion}
mobilePerformanceMode={mobilePerformanceMode}
```

- [ ] **Step 6: Run source tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected:

- PASS for the new source tests.
- If another source test still expects mobile animation restoration, update it to the new static mobile policy instead of weakening the new tests.

---

### Task 4: Add Mobile Smoke Coverage For Static Computed Animation

**Files:**

- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Add a helper for computed styles**

Near the existing helpers in `frontend/tests/smoke/dashboard.spec.ts`, add:

```ts
async function expectStaticMobileMapEffects(page: Page) {
  const shell = page.locator(".linewatch-shell");
  await expect(shell).toHaveClass(/mobile-performance-mode/);

  const glow = page.locator(".asset-alert-path-glow").first();
  await expect(glow).toBeAttached();
  await expect(glow).toHaveCSS("animation-name", "none");
  await expect(glow).toHaveCSS("filter", "none");

  const mapFlash = page.locator(".asset-alert-path.map-selection-flash").first();
  await expect(mapFlash).toBeAttached();
  await expect(mapFlash).toHaveCSS("animation-name", "none");
  await expect(mapFlash).toHaveCSS("filter", "none");

  const mapLayer = page.locator(".ttc-svg-container").locator("xpath=..").first();
  await expect(mapLayer).toHaveCSS("transition-property", "none");
}
```

Note:

- The `mapLayer` selector intentionally targets the transformed parent of `.ttc-svg-container`.
- If this selector is brittle in practice, add a stable `data-testid="interactive-map-transform-layer"` to the map layer in `InteractiveTtcMap.tsx` and use `page.getByTestId("interactive-map-transform-layer")` instead. If you add that test id, also add a source test assertion for it in `mobile-performance-guardrails.test.mjs`.

- [ ] **Step 2: Call the helper in an existing mobile path**

In the test `"renders the seeded dashboard API payload"`, after this existing line:

```ts
await page.locator('.alert-card').filter({ hasText: 'Eglinton' }).getByRole("button", { name: "Show on Map" }).click();
```

and after:

```ts
await expect(page.locator('[data-map-highlight-id="reduced-speed-zone-stub-zone-south-source"]')).toBeAttached();
```

add:

```ts
  if (isMobile) {
    await expectStaticMobileMapEffects(page);
  }
```

If that test already has an `if (isMobile)` block immediately after, put the helper call at the top of that block.

- [ ] **Step 3: Run targeted fixture and type checks**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
```

Expected:

- Both commands pass.

---

### Task 5: Verify On Browser And Pixel

**Files:**

- No source changes unless verification reveals a gap.

- [ ] **Step 1: Run frontend static checks**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected:

- All pass.

- [ ] **Step 2: Run production build**

Run:

```bash
npm --prefix frontend run build
```

Expected:

- Build completes successfully.
- No new hydration, type, or CSS-module errors.

- [ ] **Step 3: Run smoke tests if local services are available**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected:

- PASS.
- If this fails because required local services or browsers are unavailable, record the exact failure and continue to manual Pixel verification.

- [ ] **Step 4: Manual Pixel 6a verification**

Use the same USB debugging workflow that reproduced the issue.

Steps:

1. Run the production app or production preview on the LAN-accessible host.
2. Open the app on Pixel 6a Chrome.
3. Confirm the shell has `mobile-performance-mode` in DevTools Elements.
4. Leave Reduced Motion OFF.
5. Pan the map slowly.
6. Pan the map quickly.
7. Pinch zoom in and out.
8. Tap `Show on Map` for a delay or Reduced Speed Zone.
9. Open a station detail and tap station markers.
10. Repeat with mobile rotated-map mode if that mode was involved in the original glitch.

Expected:

- No SVG map flicker.
- No transient blank map.
- No repeated re-raster shimmer while dragging.
- Alert corridors remain visible as static overlays.
- Selected alert/station remains visible without pulsing.
- Reduced Motion ON still works and should look similar or even calmer.

- [ ] **Step 5: Capture a short comparison trace**

In Chrome DevTools Performance:

- Keep `Compress with gzip` enabled.
- `Include resource content`: leave OFF.
- `Include script source maps`: leave OFF unless JS long tasks remain the top unresolved issue.
- Record 8-12 seconds of the same pan/pinch/select interaction.

Save the trace under:

```text
traces/Trace-20260611-mobile-static-map-effects.json.gz
```

Run:

```bash
python3 scripts/summarize-chrome-trace.py traces/Trace-20260611-mobile-static-map-effects.json.gz --top 15 --output traces/Trace-20260611-mobile-static-map-effects-summary.md
```

Expected:

- The Animations track should no longer show repeated `aura-pulse` chunks during idle/mobile interaction.
- `DroppedFrame` count should be materially lower than the previous `323` count for a similar capture window.
- Paint/raster/composite work should drop or become less bursty.

---

### Task 6: Decide Whether To Continue To Raster Base Map

**Files:**

- Possibly create a follow-up plan only. Do not implement raster base in this task unless the user explicitly asks.

- [ ] **Step 1: Compare before/after evidence**

Use:

```text
traces/Trace-20260610T231031-summary.md
traces/Trace-20260611-mobile-static-map-effects-summary.md
```

Compare:

- `DroppedFrame`
- `FireAnimationFrame`
- `PageAnimator::serviceScriptedAnimations`
- `Paint`
- `RasterTask`
- `Layerize`
- `UpdateLayoutTree`
- Longest renderer main-thread events

- [ ] **Step 2: Make the architecture call**

If flicker is gone and dropped frames are acceptable:

- Stop here.
- Keep the SVG base map.
- Do not add raster-base-map complexity yet.

If flicker is gone but panning still feels heavy:

- Plan a separate mobile raster-base-map slice.
- Keep the interactive overlays as SVG/HTML above the raster base.
- Do not animate the raster base.

If flicker remains even after static mobile map effects:

- Treat this as a broader mobile SVG compositing issue.
- Proceed with mobile raster-base-map architecture.
- Keep this static-effect fix anyway, because it removes a confirmed source of invalidation.

---

## Final Verification Checklist

Before claiming completion, run and read:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
```

For substantial confidence, also run:

```bash
npm --prefix frontend run test:smoke
```

Manual verification must include Pixel 6a Chrome with Reduced Motion OFF.

## Expected Final Behavior

- Desktop map keeps visual richness.
- Mobile map keeps alert/station status visible without continuous overlay animation.
- Reduced Motion still disables broader app animation.
- Mobile pan, pinch, drag, and selected-alert focus no longer flicker.
- `aura-pulse` should not appear as repeated mobile animation chunks in the Performance panel while `mobile-performance-mode` is active.

## Notes For Gemini

- Do not paste the whole trace into context.
- Do not use source maps for CSS animation diagnosis; CSS keyframe names are already enough.
- Do not weaken tests to preserve the old mobile animation restoration behavior. That behavior is now known to be risky on Pixel/mobile Chrome.
- Prefer static, readable map state on mobile over animated ornamentation.
- Keep changes scoped to frontend CSS, map pan/zoom wiring, and tests.

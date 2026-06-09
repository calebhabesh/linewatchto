# Mobile Performance First Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LineWatch TO's mobile web experience noticeably more responsive by isolating map renders, mounting less hidden UI, reducing mobile-only paint/animation cost, and adding custom pinch zoom without changing the desktop layout or rewriting the map.

**Architecture:** Keep the existing SVG map and dashboard structure, but put the expensive map behind a memoized boundary with stable props. Replace always-mounted hidden submenu panels with one active floating panel, add a mobile performance mode that disables the live Vanta background and simplifies expensive map effects, and extend the existing pan/zoom hook with two-pointer pinch handling using small pure geometry helpers.

**Tech Stack:** Next.js App Router, React 19, TypeScript, CSS in `frontend/src/app/globals.css`, Node built-in test runner for source/logic tests, Playwright mobile Chromium smoke tests.

---

## Scope And Constraints

This is a first pass. Do not rewrite `InteractiveTtcMap.tsx`, do not replace the SVG map with PNG assets, do not add a PWA or service worker, and do not change backend APIs.

Preserve desktop behavior and visual identity. Desktop can receive the same render isolation improvements, but desktop layout must stay map-first with the same floating menu/panel positions.

Keep changes reviewable. The most important success criterion is that opening menu/search/submenu UI does not make the SVG map redo expensive React work.

Do not add dependencies. Use existing React, TypeScript, CSS, Node tests, and Playwright.

Before implementation, run `git status --short` and preserve user changes.

## Files To Modify Or Create

- Create: `frontend/src/hooks/useMobilePerformanceMode.ts`
  - Detects mobile/coarse-pointer viewport in client code and returns a boolean.
- Modify: `frontend/src/hooks/panZoomMath.ts`
  - Adds pure helper functions for pointer midpoint, distance, map-point conversion, scale clamping, and transform calculation.
- Modify: `frontend/src/hooks/usePanZoom.ts`
  - Adds two-pointer pinch zoom while preserving existing one-pointer drag and wheel zoom.
- Modify: `frontend/src/components/DynamicBackground.tsx`
  - Accepts `disabled` and skips/destroys Vanta on mobile performance mode.
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
  - Wraps map in `React.memo`.
  - Adds pointer cancel handler.
  - Keeps existing map behavior intact.
- Create: `frontend/src/components/FloatingPanelShell.tsx`
  - Shared active-panel wrapper replacing repeated always-mounted submenu wrappers.
- Modify: `frontend/src/components/LineWatchShell.tsx`
  - Stabilizes callbacks passed into the memoized map.
  - Uses mobile performance mode class.
  - Renders only the active floating submenu panel.
  - Passes `disabled` to `DynamicBackground`.
- Modify: `frontend/src/app/globals.css`
  - Adds mobile performance-mode CSS that reduces costly map filters/animations only on mobile.
  - Removes layout-property animation from station search expansion.
  - Adds active floating panel entry animation for conditionally mounted panels.
- Create: `frontend/tests/mobile-performance-guardrails.test.mjs`
  - Source/logic guardrails for memoized map, stable callbacks, conditional panel mounting, disabled Vanta, mobile CSS simplification, and pinch helpers.
- Modify: `frontend/tests/pan-zoom-behavior.test.mjs`
  - Adds pure tests for new pan/zoom math helpers.
- Modify: `frontend/tests/drawer-layout.test.mjs`
  - Updates expectations that relied on always-mounted hidden submenu wrappers.
- Optional Modify: `frontend/tests/smoke/dashboard.spec.ts`
  - Add one mobile-only smoke test for pinch gesture if Playwright support is reliable locally. If not reliable, leave this as manual verification and rely on unit/source guardrails.

---

## Task 1: Add Mobile Performance And Render Isolation Guardrail Tests

**Files:**
- Create: `frontend/tests/mobile-performance-guardrails.test.mjs`
- Modify: `frontend/tests/pan-zoom-behavior.test.mjs`

- [ ] **Step 1: Create source guardrail test file**

Create `frontend/tests/mobile-performance-guardrails.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const backgroundSource = readFileSync(new URL("../src/components/DynamicBackground.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("mobile performance guardrails", () => {
  it("keeps the expensive SVG map behind a memoized boundary", () => {
    assert.match(mapSource, /import\s+\{[^}]*memo[^}]*\}\s+from "react"/);
    assert.match(mapSource, /function InteractiveTtcMapComponent\(/);
    assert.match(mapSource, /export const InteractiveTtcMap = memo\(InteractiveTtcMapComponent\)/);
    assert.match(mapSource, /InteractiveTtcMap\.displayName = "InteractiveTtcMap"/);
  });

  it("passes stable handlers into the memoized map", () => {
    assert.match(shellSource, /import\s+\{[^}]*useCallback[^}]*\}\s+from "react"/);
    assert.match(shellSource, /const handleMapSelectImpact = useCallback/);
    assert.match(shellSource, /const handleSelectStationId = useCallback/);
    assert.match(shellSource, /const handleClearCommutePathPreview = useCallback/);
    assert.match(shellSource, /const handleToggleTheme = useCallback/);
    assert.match(shellSource, /onToggleTheme=\{handleToggleTheme\}/);
    assert.match(shellSource, /onClearCommutePathPreview=\{handleClearCommutePathPreview\}/);
    assert.doesNotMatch(shellSource, /onToggleTheme=\{\(\) => setIsDark/);
    assert.doesNotMatch(shellSource, /onClearCommutePathPreview=\{\(\) => handleClearCommutePathPreview\(\)\}/);
  });

  it("renders only the active floating submenu panel", () => {
    assert.match(shellSource, /FloatingPanelShell/);
    assert.match(shellSource, /const activeFloatingPanel = /);
    assert.match(shellSource, /activeView === "alerts"/);
    assert.match(shellSource, /activeView === "delays"/);
    assert.match(shellSource, /activeView === "reduced-speed-zones"/);
    assert.match(shellSource, /activeView === "closures"/);
    assert.match(shellSource, /activeView === "commutes"/);
    assert.match(shellSource, /activeView === "analytics"/);
    assert.doesNotMatch(shellSource, /opacity-0 -translate-x-8 pointer-events-none/);
  });

  it("disables the animated background in mobile performance mode", () => {
    assert.match(shellSource, /useMobilePerformanceMode/);
    assert.match(shellSource, /mobilePerformanceMode/);
    assert.match(shellSource, /mobile-performance-mode/);
    assert.match(backgroundSource, /disabled/);
    assert.match(backgroundSource, /if \(reducedMotion \|\| disabled\)/);
    assert.match(shellSource, /<DynamicBackground[^>]*disabled=\{mobilePerformanceMode\}/s);
  });

  it("has mobile-only paint simplification rules for the SVG map", () => {
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.station-impact-ring/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.station-impact-dot-red-glow/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.station-impact-dot-red-ping/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.overlap-indicator/);
    assert.match(globalCss, /filter:\s*none\s*!important/);
  });

  it("does not animate search expansion with layout properties", () => {
    assert.doesNotMatch(globalCss, /width 300ms cubic-bezier/);
    assert.doesNotMatch(globalCss, /padding-left 300ms cubic-bezier/);
    assert.doesNotMatch(globalCss, /padding-right 300ms cubic-bezier/);
  });

  it("tracks two active pointers for custom pinch zoom", () => {
    assert.match(mapSource, /onPointerCancel=\{handlePointerCancel\}/);
    assert.match(mapSource, /touch-none/);
  });
});
```

- [ ] **Step 2: Extend pan/zoom behavior test imports**

Modify the import block in `frontend/tests/pan-zoom-behavior.test.mjs`:

```js
import {
  distanceBetweenPoints,
  mapPointFromViewportPoint,
  midpointBetweenPoints,
  snapToDevicePixel,
  snapTransformToDevicePixels,
  transformForMapPointAtViewportPoint,
} from "../src/hooks/panZoomMath.ts";
```

- [ ] **Step 3: Add pan/zoom math tests**

Append this test block inside `describe("pan zoom behavior guardrails", () => { ... })`:

```js
  it("computes two-pointer pinch geometry without DOM access", () => {
    assert.deepEqual(
      midpointBetweenPoints({ x: 10, y: 20 }, { x: 30, y: 60 }),
      { x: 20, y: 40 },
    );
    assert.equal(distanceBetweenPoints({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  });

  it("keeps the same map point under the pinch midpoint when scale changes", () => {
    const start = { x: -100, y: -50, scale: 2 };
    const viewportPoint = { x: 300, y: 250 };
    const mapPoint = mapPointFromViewportPoint(start, viewportPoint);

    assert.deepEqual(mapPoint, { x: 200, y: 150 });

    const next = transformForMapPointAtViewportPoint(mapPoint, viewportPoint, 3);

    assert.deepEqual(next, { x: -300, y: -200, scale: 3 });
    assert.deepEqual(mapPointFromViewportPoint(next, viewportPoint), mapPoint);
  });

  it("uses active pointer bookkeeping for pinch zoom", () => {
    assert.match(hookSource, /activePointersRef/);
    assert.match(hookSource, /pinchGestureRef/);
    assert.match(hookSource, /pointerPointFromEvent/);
    assert.match(hookSource, /handlePointerCancel/);
    assert.match(hookSource, /distanceBetweenPoints/);
    assert.match(hookSource, /transformForMapPointAtViewportPoint/);
  });
```

- [ ] **Step 4: Run tests and verify they fail**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: FAIL. The new guardrails should fail because the memoized map, mobile performance mode, conditional panels, search CSS changes, and pinch helpers are not implemented yet.

- [ ] **Step 5: Commit failing tests**

```bash
git add frontend/tests/mobile-performance-guardrails.test.mjs frontend/tests/pan-zoom-behavior.test.mjs
git commit -m "test: add mobile performance guardrails"
```

---

## Task 2: Memoize The Map And Stabilize Map Props

**Files:**
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`

- [ ] **Step 1: Wrap the map component in React memo**

In `frontend/src/components/InteractiveTtcMap.tsx`, change the React import:

```ts
import { memo, useEffect, useState, useMemo, useLayoutEffect, useRef, useCallback } from "react";
```

Rename the exported function:

```ts
function InteractiveTtcMapComponent({
  selection,
  onSelectImpact,
  stations,
  selectedStationId,
  onSelectStationId,
  isDark,
  onToggleTheme,
  layoutResetSignal,
  reducedMotion,
  commutePathPreview,
  onClearCommutePathPreview,
}: {
```

At the end of the file, after all component/helper declarations, add:

```ts
export const InteractiveTtcMap = memo(InteractiveTtcMapComponent);
InteractiveTtcMap.displayName = "InteractiveTtcMap";
```

Do not memoize `OverlaySegment` yet. This first pass isolates menu/view state from the top-level map component. Deeper map layer memoization can happen after profiling proves it is needed.

- [ ] **Step 2: Import `useCallback` in shell**

In `frontend/src/components/LineWatchShell.tsx`, change:

```ts
import { useState, useEffect, useRef, useMemo } from "react";
```

to:

```ts
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
```

- [ ] **Step 3: Stabilize station selection handler**

Replace the existing `handleSelectStationId` function with:

```ts
  const handleSelectStationId = useCallback((id: string | null) => {
    setSelectedStationId(id);
    setSelection(null);
    setCommutePathPreview(null);
    if (id) {
      setActiveView("map");
    }
  }, []);
```

- [ ] **Step 4: Stabilize view selection helpers**

Replace `viewForImpactKind` and `viewForImpactSelection` with callback-backed versions:

```ts
  const viewForImpactKind = useCallback((kind: ImpactKind): ActiveView => {
    switch (kind) {
      case "suspension":
        return "alerts";
      case "delay":
        return "delays";
      case "reduced-speed-zone":
        return "reduced-speed-zones";
      case "planned-closure":
        return "closures";
    }
  }, []);

  const viewForImpactSelection = useCallback((nextSelection: NonNullable<ImpactSelection>): ActiveView => {
    if (
      nextSelection.kind === "planned-closure" &&
      activeAlerts.some((alert) => alert.id === nextSelection.id)
    ) {
      return "alerts";
    }
    return viewForImpactKind(nextSelection.kind);
  }, [activeAlerts, viewForImpactKind]);
```

- [ ] **Step 5: Stabilize map impact handler**

Replace `handleMapSelectImpact` with:

```ts
  const handleMapSelectImpact = useCallback((nextSelection: ImpactSelection) => {
    setSelectedStationId(null);
    setCommutePathPreview(null);
    if (!nextSelection) {
      setSelection(null);
      return;
    }
    setActiveView(viewForImpactSelection(nextSelection));
    setSelection(nextSelection);
  }, [viewForImpactSelection]);
```

- [ ] **Step 6: Stabilize commute clear handler**

Wrap the existing `handleClearCommutePathPreview` in `useCallback` before adding the theme handler:

```ts
  const handleClearCommutePathPreview = useCallback((commuteId?: string) => {
    setCommutePathPreview((current) => {
      if (!current) return null;
      if (commuteId && current.id !== commuteId) {
        return current;
      }
      window.setTimeout(() => {
        setActiveView((view) => (view === "map" ? "commutes" : view));
      }, 0);
      return null;
    });
  }, []);
```

Delete the previous non-callback `handleClearCommutePathPreview` declaration.

- [ ] **Step 7: Stabilize theme handler**

Add before the return:

```ts
  const handleToggleTheme = useCallback(() => {
    setIsDark((current) => !current);
  }, []);
```

Update the map prop:

```tsx
          onToggleTheme={handleToggleTheme}
```

- [ ] **Step 8: Pass stable clear handler to map**

Replace:

```tsx
          onClearCommutePathPreview={() => handleClearCommutePathPreview()}
```

with:

```tsx
          onClearCommutePathPreview={handleClearCommutePathPreview}
```

The existing `handleClearCommutePathPreview(commuteId?: string)` is assignable to the map's `() => void` prop because the argument is optional.

- [ ] **Step 9: Run focused tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: still FAIL because later mobile performance tasks are not complete, but the memo/stable handler assertions should now pass.

- [ ] **Step 10: Commit map render isolation**

```bash
git add frontend/src/components/InteractiveTtcMap.tsx frontend/src/components/LineWatchShell.tsx
git commit -m "perf: isolate map from menu rerenders"
```

---

## Task 3: Render Only The Active Floating Submenu Panel

**Files:**
- Create: `frontend/src/components/FloatingPanelShell.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/drawer-layout.test.mjs`

- [ ] **Step 1: Create shared floating panel wrapper**

Create `frontend/src/components/FloatingPanelShell.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";

export function FloatingPanelShell({
  children,
  panel,
}: {
  children: ReactNode;
  panel: string;
}) {
  return (
    <div className="floating-panel-shell" data-floating-panel={panel}>
      <div className="floating-panel-scroll">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for conditionally mounted panels**

Add near the panel styles in `frontend/src/app/globals.css`:

```css
.floating-panel-shell {
  animation: floating-panel-enter 180ms cubic-bezier(0.22, 1, 0.36, 1);
  display: flex;
  flex-direction: column;
  left: 1rem;
  position: absolute;
  top: 88px;
  width: min(calc(100vw - 32px), 680px);
  z-index: 30;
}

.floating-panel-scroll {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: min(85vh, calc(100vh - 112px));
  overflow-y: auto;
  padding-bottom: 1rem;
  padding-right: 0.25rem;
}

@keyframes floating-panel-enter {
  from {
    opacity: 0;
    transform: translateX(-16px);
  }

  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.motion-paused .floating-panel-shell {
  animation: none !important;
}

@media (prefers-reduced-motion: reduce) {
  .floating-panel-shell {
    animation: none !important;
  }
}

@media (min-width: 640px) {
  .floating-panel-shell {
    left: 1.5rem;
    top: 104px;
  }
}
```

- [ ] **Step 3: Import wrapper in shell**

In `frontend/src/components/LineWatchShell.tsx`, add:

```ts
import { FloatingPanelShell } from "./FloatingPanelShell";
```

- [ ] **Step 4: Build one active panel variable**

Before `let actionIndex = 0;`, add this JSX variable:

```tsx
  const activeFloatingPanel = !showClosedScreen ? (
    activeView === "alerts" ? (
      <FloatingPanelShell panel="alerts">
        <ActiveAlertsPanel
          selection={selection}
          onSelectImpact={handleMapSelectImpact}
          onBack={() => { setActiveView("menu"); setSelection(null); }}
          onClose={() => { setActiveView("map"); setSelection(null); }}
        />
      </FloatingPanelShell>
    ) : activeView === "delays" ? (
      <FloatingPanelShell panel="delays">
        <DelaysPanel
          selection={selection}
          onSelectImpact={handleMapSelectImpact}
          onBack={() => { setActiveView("menu"); setSelection(null); }}
          onClose={() => { setActiveView("map"); setSelection(null); }}
        />
      </FloatingPanelShell>
    ) : activeView === "reduced-speed-zones" ? (
      <FloatingPanelShell panel="reduced-speed-zones">
        <ReducedSpeedZonesPanel
          selection={selection}
          onSelectImpact={handleMapSelectImpact}
          onBack={() => { setActiveView("menu"); setSelection(null); }}
          onClose={() => { setActiveView("map"); setSelection(null); }}
        />
      </FloatingPanelShell>
    ) : activeView === "closures" ? (
      <FloatingPanelShell panel="closures">
        <PlannedClosuresPanel
          selection={selection}
          onSelectImpact={handleMapSelectImpact}
          onBack={() => { setActiveView("menu"); setSelection(null); }}
          onClose={() => { setActiveView("map"); setSelection(null); }}
        />
      </FloatingPanelShell>
    ) : activeView === "commutes" ? (
      <FloatingPanelShell panel="commutes">
        <SavedCommutesPanel
          accountState={accountState}
          accountCommutes={accountCommutes}
          setAccountCommutes={setAccountCommutes}
          stationSummaries={stationSummaries}
          viewedCommuteId={commutePathPreview?.id ?? null}
          onViewPath={handleViewCommutePath}
          onClearViewedPath={handleClearCommutePathPreview}
          onBack={() => setActiveView("menu")}
          onClose={() => { setActiveView("map"); setSelection(null); }}
          onRequestSignIn={() => setAccountDialogMode("login")}
          onRequestCreateAccount={() => setAccountDialogMode("register")}
        />
      </FloatingPanelShell>
    ) : activeView === "analytics" ? (
      <FloatingPanelShell panel="analytics">
        <ReliabilityPanel
          onBack={() => setActiveView("menu")}
          onClose={() => { setActiveView("map"); setSelection(null); }}
        />
      </FloatingPanelShell>
    ) : null
  ) : null;
```

- [ ] **Step 5: Replace always-mounted submenu wrappers**

Delete the existing `Floating Submenus` block that starts with:

```tsx
      {!showClosedScreen && (
      <>
      {/* Floating Submenus (Alerts, Closures, Commutes, Analytics) */}
```

and ends with:

```tsx
      </>
      )}
```

Replace it with:

```tsx
      {/* Floating Submenus (Alerts, Delays, Closures, Commutes, Analytics) */}
      {activeFloatingPanel}
```

- [ ] **Step 6: Update drawer layout source expectations**

In `frontend/tests/drawer-layout.test.mjs`, update the test that currently expects hidden opacity/translate wrappers. Add these assertions inside `"keeps the map first while exposing floating menu and submenu states"`:

```js
    assert.match(shellSource, /FloatingPanelShell/);
    assert.match(shellSource, /const activeFloatingPanel = /);
    assert.doesNotMatch(shellSource, /opacity-0 -translate-x-8 pointer-events-none/);
    assert.match(globalCss, /\.floating-panel-shell/);
```

Do not remove existing assertions that verify the active views exist.

- [ ] **Step 7: Run tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: remaining failures should be from mobile performance mode, search CSS, and pinch zoom tasks only.

- [ ] **Step 8: Commit conditional panel mounting**

```bash
git add frontend/src/components/FloatingPanelShell.tsx frontend/src/components/LineWatchShell.tsx frontend/src/app/globals.css frontend/tests/drawer-layout.test.mjs
git commit -m "perf: mount only active floating panel"
```

---

## Task 4: Add Mobile Performance Mode And Disable Vanta On Mobile

**Files:**
- Create: `frontend/src/hooks/useMobilePerformanceMode.ts`
- Modify: `frontend/src/components/DynamicBackground.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add mobile performance hook**

Create `frontend/src/hooks/useMobilePerformanceMode.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

const MOBILE_PERFORMANCE_QUERY = "(max-width: 767px), (pointer: coarse)";

export function useMobilePerformanceMode() {
  const [mobilePerformanceMode, setMobilePerformanceMode] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_PERFORMANCE_QUERY);

    const sync = () => setMobilePerformanceMode(mediaQuery.matches);
    sync();

    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  return mobilePerformanceMode;
}
```

- [ ] **Step 2: Allow DynamicBackground to be disabled**

In `frontend/src/components/DynamicBackground.tsx`, change the prop type and function signature:

```ts
export function DynamicBackground({
  reducedMotion,
  isDark,
  disabled = false,
}: {
  reducedMotion: boolean;
  isDark: boolean;
  disabled?: boolean;
}) {
```

Change the early return condition in the initialization effect:

```ts
    if (reducedMotion || disabled) {
      if (vantaEffectRef.current) {
        vantaEffectRef.current.destroy();
        vantaEffectRef.current = null;
      }
      return;
    }
```

Update the dependency list for that effect:

```ts
  }, [reducedMotion, disabled]);
```

Keep the `isDark` color update effect unchanged.

- [ ] **Step 3: Use mobile performance mode in shell**

In `frontend/src/components/LineWatchShell.tsx`, add:

```ts
import { useMobilePerformanceMode } from "../hooks/useMobilePerformanceMode";
```

After reduced motion state:

```ts
  const mobilePerformanceMode = useMobilePerformanceMode();
```

Add the class to the shell root:

```tsx
      <div className={`linewatch-shell relative w-full h-screen overflow-hidden transition-colors duration-500 ${(isDark || highContrast) ? "dark bg-[#0d0808] text-slate-100" : "bg-slate-50 text-slate-900"} ${highContrast ? "high-contrast" : ""} ${reducedMotion ? "motion-paused" : ""} ${mobilePerformanceMode ? "mobile-performance-mode" : ""}`}>
```

Pass the disabled prop:

```tsx
      <DynamicBackground reducedMotion={reducedMotion} isDark={isDark || highContrast} disabled={mobilePerformanceMode} />
```

- [ ] **Step 4: Add mobile paint simplification CSS**

Add near the map animation CSS in `frontend/src/app/globals.css`:

```css
.linewatch-shell.mobile-performance-mode .asset-alert-path-glow {
  animation: none !important;
  filter: none !important;
  opacity: 0.24;
  stroke-width: 122;
  transition: none !important;
}

.linewatch-shell.mobile-performance-mode .interactive-glow {
  display: none;
}

.linewatch-shell.mobile-performance-mode .asset-alert-path.delay-candy,
.linewatch-shell.mobile-performance-mode .asset-alert-path.suspension-candy,
.linewatch-shell.mobile-performance-mode .asset-alert-path.delay-static-base,
.linewatch-shell.mobile-performance-mode .delay-hourglass-mask-path,
.linewatch-shell.mobile-performance-mode .suspension-mask-path,
.linewatch-shell.mobile-performance-mode .rsz-chevron-mask-path {
  animation: none !important;
  transition: none !important;
}

.linewatch-shell.mobile-performance-mode .station-hit-target {
  transition: none !important;
}

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

This does not remove alert overlays. It removes mobile-only live paint costs while keeping desktop effects untouched.

- [ ] **Step 5: Run tests**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
```

Expected: fixture tests may still fail from pinch/search tasks, but the mobile mode guardrails should pass. Typecheck must pass.

- [ ] **Step 6: Commit mobile performance mode**

```bash
git add frontend/src/hooks/useMobilePerformanceMode.ts frontend/src/components/DynamicBackground.tsx frontend/src/components/LineWatchShell.tsx frontend/src/app/globals.css
git commit -m "perf: add mobile performance mode"
```

---

## Task 5: Remove Layout-Property Animation From Search Expansion

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Replace station search panel transition**

In `.station-search-panel`, replace:

```css
  transition:
    opacity 300ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 300ms cubic-bezier(0.23, 1, 0.32, 1),
    width 300ms cubic-bezier(0.23, 1, 0.32, 1);
```

with:

```css
  transition:
    opacity 220ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 220ms cubic-bezier(0.23, 1, 0.32, 1);
```

- [ ] **Step 2: Replace station column transition**

In `.station-search-stations-column`, replace:

```css
  transition:
    width 300ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 250ms cubic-bezier(0.23, 1, 0.32, 1),
    padding-left 300ms cubic-bezier(0.23, 1, 0.32, 1),
    padding-right 300ms cubic-bezier(0.23, 1, 0.32, 1),
    border-color 300ms cubic-bezier(0.23, 1, 0.32, 1);
```

with:

```css
  transform: translateX(-8px);
  transition:
    opacity 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 180ms cubic-bezier(0.23, 1, 0.32, 1),
    border-color 180ms cubic-bezier(0.23, 1, 0.32, 1);
```

In `.station-search-panel[data-expanded="true"] .station-search-stations-column`, add:

```css
  transform: translateX(0);
```

- [ ] **Step 3: Disable search expansion animation in mobile performance mode**

Add:

```css
.linewatch-shell.mobile-performance-mode .station-search-panel,
.linewatch-shell.mobile-performance-mode .station-search-stations-column,
.linewatch-shell.mobile-performance-mode .station-search-line-trigger,
.linewatch-shell.mobile-performance-mode .station-search-station {
  transition: none !important;
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: search layout guardrail should pass. Remaining failures should only be pinch-related if Task 6 is not complete.

- [ ] **Step 5: Commit search animation cleanup**

```bash
git add frontend/src/app/globals.css
git commit -m "perf: avoid layout animation in station search"
```

---

## Task 6: Add Custom Two-Finger Pinch Zoom

**Files:**
- Modify: `frontend/src/hooks/panZoomMath.ts`
- Modify: `frontend/src/hooks/usePanZoom.ts`
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`

- [ ] **Step 1: Add pure pan/zoom math helpers**

In `frontend/src/hooks/panZoomMath.ts`, keep existing exports and add:

```ts
export type PanZoomPoint = {
  x: number;
  y: number;
};

export function midpointBetweenPoints(a: PanZoomPoint, b: PanZoomPoint): PanZoomPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function distanceBetweenPoints(a: PanZoomPoint, b: PanZoomPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function mapPointFromViewportPoint(
  transform: PanZoomTransform,
  viewportPoint: PanZoomPoint,
): PanZoomPoint {
  return {
    x: (viewportPoint.x - transform.x) / transform.scale,
    y: (viewportPoint.y - transform.y) / transform.scale,
  };
}

export function transformForMapPointAtViewportPoint(
  mapPoint: PanZoomPoint,
  viewportPoint: PanZoomPoint,
  scale: number,
): PanZoomTransform {
  return {
    x: viewportPoint.x - mapPoint.x * scale,
    y: viewportPoint.y - mapPoint.y * scale,
    scale,
  };
}

export function clampPanZoomScale(scale: number, fitScale: number): number {
  return Math.min(Math.max(0.2 * fitScale, scale), 5 * fitScale);
}
```

- [ ] **Step 2: Update hook imports**

In `frontend/src/hooks/usePanZoom.ts`, change the import:

```ts
import {
  clampPanZoomScale,
  currentDevicePixelRatio,
  distanceBetweenPoints,
  mapPointFromViewportPoint,
  midpointBetweenPoints,
  snapTransformToDevicePixels,
  transformForMapPointAtViewportPoint,
  type PanZoomPoint,
  type PanZoomTransform,
} from "./panZoomMath";
```

- [ ] **Step 3: Add pointer refs and fit scale ref**

Inside `usePanZoom`, after existing refs:

```ts
  const activePointersRef = useRef(new Map<number, PanZoomPoint>());
  const pinchGestureRef = useRef<{
    startDistance: number;
    startScale: number;
    mapPointAtMidpoint: PanZoomPoint;
  } | null>(null);
  const fitScaleRef = useRef(1);
  const activeDragPointerIdRef = useRef<number | null>(null);
```

Add this effect after the fitScale state declaration:

```ts
  useEffect(() => {
    fitScaleRef.current = fitScale;
  }, [fitScale]);
```

- [ ] **Step 4: Add helper functions inside hook**

Inside `usePanZoom`, before `handlePointerDown`:

```ts
  const pointerPointFromEvent = useCallback((event: PointerEvent<HTMLDivElement>): PanZoomPoint => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: event.clientX, y: event.clientY };
    }
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, []);

  const pointersArray = useCallback(() => {
    return Array.from(activePointersRef.current.values());
  }, []);

  const beginPinchGesture = useCallback(() => {
    const pointers = pointersArray();
    if (pointers.length < 2) return;

    const [first, second] = pointers;
    const midpoint = midpointBetweenPoints(first, second);
    const distance = distanceBetweenPoints(first, second);
    if (distance <= 0) return;

    pinchGestureRef.current = {
      startDistance: distance,
      startScale: transformRef.current.scale,
      mapPointAtMidpoint: mapPointFromViewportPoint(transformRef.current, midpoint),
    };
  }, [pointersArray]);

  const applyPinchGesture = useCallback(() => {
    const gesture = pinchGestureRef.current;
    const pointers = pointersArray();
    if (!gesture || pointers.length < 2) return;

    const [first, second] = pointers;
    const midpoint = midpointBetweenPoints(first, second);
    const distance = distanceBetweenPoints(first, second);
    if (distance <= 0) return;

    const nextScale = clampPanZoomScale(
      gesture.startScale * (distance / gesture.startDistance),
      fitScaleRef.current,
    );
    const next = snapTransform(
      transformForMapPointAtViewportPoint(gesture.mapPointAtMidpoint, midpoint, nextScale),
    );

    transformRef.current = next;
    if (mapRef.current) {
      mapRef.current.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
    }
  }, [pointersArray, snapTransform]);
```

- [ ] **Step 5: Replace pointer down logic**

Replace `handlePointerDown` with:

```ts
  const handlePointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    cancelAnimation();
    const point = pointerPointFromEvent(e);
    activePointersRef.current.set(e.pointerId, point);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (activePointersRef.current.size >= 2) {
      activeDragPointerIdRef.current = null;
      lastMoveEvent.current = null;
      beginPinchGesture();
      setIsDragging(true);
      return;
    }

    activeDragPointerIdRef.current = e.pointerId;
    pinchGestureRef.current = null;
    setIsDragging(true);
    startPos.current = {
      x: point.x - transformRef.current.x,
      y: point.y - transformRef.current.y,
    };
  }, [beginPinchGesture, cancelAnimation, pointerPointFromEvent]);
```

- [ ] **Step 6: Replace pointer move logic**

Replace `handlePointerMove` with:

```ts
  const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    if (!activePointersRef.current.has(e.pointerId)) return;

    const point = pointerPointFromEvent(e);
    activePointersRef.current.set(e.pointerId, point);

    if (activePointersRef.current.size >= 2) {
      if (dragRafRef.current === null) {
        dragRafRef.current = requestAnimationFrame(() => {
          applyPinchGesture();
          dragRafRef.current = null;
        });
      }
      return;
    }

    if (activeDragPointerIdRef.current !== e.pointerId) return;

    lastMoveEvent.current = { clientX: point.x, clientY: point.y };

    if (dragRafRef.current === null) {
      dragRafRef.current = requestAnimationFrame(() => {
        if (!isDragging || !lastMoveEvent.current) {
          dragRafRef.current = null;
          return;
        }

        const { clientX, clientY } = lastMoveEvent.current;
        const newX = clientX - startPos.current.x;
        const newY = clientY - startPos.current.y;

        transformRef.current.x = newX;
        transformRef.current.y = newY;

        if (mapRef.current) {
          mapRef.current.style.transform = `translate(${newX}px, ${newY}px) scale(${transformRef.current.scale})`;
        }

        dragRafRef.current = null;
      });
    }
  }, [applyPinchGesture, isDragging, pointerPointFromEvent]);
```

- [ ] **Step 7: Add shared pointer end helper**

Replace `handlePointerUp` with this helper plus handlers:

```ts
  const finishPointerInteraction = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }

    activePointersRef.current.delete(e.pointerId);

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Browser may release capture during touch cancellation.
    }

    if (pinchGestureRef.current) {
      commitTransformRef(transformRef.current);
      pinchGestureRef.current = null;
    } else if (isDragging && lastMoveEvent.current) {
      const { clientX, clientY } = lastMoveEvent.current;
      const newX = clientX - startPos.current.x;
      const newY = clientY - startPos.current.y;
      commitTransformRef({ ...transformRef.current, x: newX, y: newY });
      lastMoveEvent.current = null;
    }

    const remainingPointers = Array.from(activePointersRef.current.entries());
    if (remainingPointers.length === 1) {
      const [pointerId, point] = remainingPointers[0];
      activeDragPointerIdRef.current = pointerId;
      startPos.current = {
        x: point.x - transformRef.current.x,
        y: point.y - transformRef.current.y,
      };
      setTransform({ ...transformRef.current });
      setIsDragging(true);
      return;
    }

    activeDragPointerIdRef.current = null;
    activePointersRef.current.clear();
    setIsDragging(false);
    setTransform({ ...transformRef.current });
  }, [commitTransformRef, isDragging]);

  const handlePointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    finishPointerInteraction(e);
  }, [finishPointerInteraction]);

  const handlePointerCancel = useCallback((e: PointerEvent<HTMLDivElement>) => {
    finishPointerInteraction(e);
  }, [finishPointerInteraction]);
```

- [ ] **Step 8: Simplify wheel scale clamp**

In `handleWheel`, replace:

```ts
      const minScale = 0.2 * fitScale;
      const maxScale = 5 * fitScale;
      newScale = Math.min(Math.max(minScale, newScale), maxScale);
```

with:

```ts
      newScale = clampPanZoomScale(newScale, fitScale);
```

- [ ] **Step 9: Export pointer cancel handler**

In the return object from `usePanZoom`, add:

```ts
    handlePointerCancel,
```

- [ ] **Step 10: Wire pointer cancel in map component**

In `frontend/src/components/InteractiveTtcMap.tsx`, destructure:

```ts
    handlePointerCancel,
```

from `usePanZoom()`.

On the map viewport div, add:

```tsx
        onPointerCancel={handlePointerCancel}
```

- [ ] **Step 11: Run pan/zoom tests**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
```

Expected: all fixture tests and typecheck should pass.

- [ ] **Step 12: Commit pinch zoom**

```bash
git add frontend/src/hooks/panZoomMath.ts frontend/src/hooks/usePanZoom.ts frontend/src/components/InteractiveTtcMap.tsx
git commit -m "feat: support pinch zoom on mobile map"
```

---

## Task 7: Verification And Manual Mobile Profiling

**Files:**
- Optional Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Run required frontend verification**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: all pass.

- [ ] **Step 2: Run production build**

Run:

```bash
npm --prefix frontend run build
```

Expected: build succeeds.

- [ ] **Step 3: Run smoke tests including mobile Chromium**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: desktop Chrome and mobile Chromium projects pass.

- [ ] **Step 4: Manual mobile test on real phone or Chrome remote device**

Start production server:

```bash
BACKEND_URL=http://127.0.0.1:4174 NEXT_PUBLIC_LINEWATCH_API_BASE_URL=http://127.0.0.1:4174 npm --prefix frontend run start -- --hostname 0.0.0.0 --port 4173
```

Manual checklist:

- Open the dashboard on a mobile browser.
- Open and close the main menu 10 times.
- Open Search, Delays, Reduced Speed Zones, Closures, Commutes, and Analytics.
- Confirm each menu opens quickly and no tap feels ignored.
- Pan the map with one finger.
- Pinch zoom in and out with two fingers.
- Tap a delay overlay and confirm the Delays panel opens.
- Tap a station ring and confirm the relevant panel opens.
- Tap a station and confirm station detail opens as a bottom sheet.
- Toggle reduced motion and confirm mobile performance mode still keeps interactions usable.
- Confirm desktop Chrome layout still looks like the previous desktop dashboard.

- [ ] **Step 5: React Profiler acceptance check**

Use React DevTools Profiler in a production-like local build.

Acceptance criteria:

- Opening and closing the main menu should not show `InteractiveTtcMap` rendering.
- Opening Search should not show `InteractiveTtcMap` rendering unless station selection changes.
- Switching between menu and submenu panels should not render hidden inactive panels.
- If `InteractiveTtcMap` still renders on plain menu toggles, inspect props in React DevTools and stabilize the changed prop before continuing.

- [ ] **Step 6: Chrome Performance acceptance check**

Use Chrome DevTools Performance on mobile or emulated Pixel 5.

Acceptance criteria:

- Menu open/close has fewer long tasks than before this first pass.
- Vanta/Three animation is absent in mobile performance mode.
- SVG paint cost during idle mobile map view is lower because glows/pulses are simplified.
- Pinch gesture does not trigger full React renders on every pointer move.

- [ ] **Step 7: Optional Playwright pinch smoke**

Only add this if Playwright pointer/touch behavior is reliable in the local environment. If it flakes, skip it and document manual pinch verification in the final handoff.

Append to `frontend/tests/smoke/dashboard.spec.ts`:

```ts
test("mobile map accepts pinch-like touch gestures", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "mobile-only gesture smoke");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const zoomBefore = await page.getByText(/%$/).first().textContent();
  const viewport = page.locator(".touch-none").first();
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();

  const centerX = box!.x + box!.width / 2;
  const centerY = box!.y + box!.height / 2;

  await page.touchscreen.tap(centerX - 30, centerY);
  await page.touchscreen.tap(centerX + 30, centerY);

  const zoomAfter = await page.getByText(/%$/).first().textContent();
  expect(zoomAfter).toBeTruthy();
  expect(zoomBefore).toBeTruthy();
});
```

This optional test is intentionally weak because Playwright touchscreen APIs do not consistently model true multi-touch pinch across all environments. Do not block the first pass on this optional test.

- [ ] **Step 8: Commit final verification adjustment if optional smoke was added**

```bash
git add frontend/tests/smoke/dashboard.spec.ts
git commit -m "test: add mobile map gesture smoke"
```

Skip this commit if no optional smoke test was added.

---

## Final Verification Commands

Run all of these before calling the first pass complete:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

If any command fails because of sandboxing, missing Chrome, missing production browser channel, or port conflicts, record the exact command and exact failure output in the handoff.

## Expected Outcome

After this first pass:

- Menu and submenu opens should stop causing full SVG map React work.
- Mobile mounts fewer hidden dashboard panels.
- Mobile no longer runs the Vanta/Three background by default.
- Mobile map overlays keep TTC visual identity but avoid the most expensive glow/pulse/filter work.
- Search expansion avoids animated width/padding layout work.
- One-finger pan remains intact.
- Two-finger pinch zoom works through custom pointer handling.
- Desktop layout and dashboard behavior remain intact.

## Out Of Scope For This Plan

- PWA manifest, service worker, offline caching, install prompts.
- Replacing the SVG map with PNG or canvas.
- Rebuilding the map renderer.
- Deep virtualization of alert cards.
- Backend API changes.
- Live TTC station arrival work.

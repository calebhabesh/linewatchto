# Mobile Rotated Map And Gesture Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-only rotated landscape map mode and reduce touch-pan, pinch-zoom, and `Show on Map` rendering glitches on mobile.

**Architecture:** Keep the SVG map, overlay geometry, station hit targets, and selected-impact focus logic in the existing coordinate system. Add a shell-level mobile map presentation mode that rotates the map viewport shell into a virtual landscape layout, then teach the pan/zoom hook how to translate pointer coordinates in that rotated viewport. While touch gestures are active, pause expensive overlay paint effects and defer programmatic focus animations until the gesture ends.

**Tech Stack:** Next.js App Router, React, TypeScript, `lucide-react`, CSS in `frontend/src/app/globals.css`, Node built-in source/fixture tests, Playwright Chromium smoke tests.

---

## Gemini 3.5 Flash Handoff Prompt

Use this exact prompt when starting a fresh Gemini implementation session:

```text
You are working in ~/dev/ttc-reliability-navigator on LineWatchTO, an unofficial TTC reliability dashboard. Read AGENTS.md, GEMINI.md, README.md, and docs/superpowers/plans/2026-06-10-mobile-rotated-map-and-gesture-stability.md before editing. Implement the plan task-by-task. Preserve user changes, do not revert unrelated files, do not claim the dashboard is official or live unless fresh ingestion is active, and run the verification commands listed at the end before saying work is complete.
```

## Read This First

Before editing, run:

```bash
git status --short
```

Current known dirty files at plan creation time:

```text
frontend/src/app/globals.css
frontend/src/components/DynamicBackground.tsx
frontend/src/components/MobileStatusPeek.tsx
frontend/public/assets/linewatch/alert-noti.svg
```

Preserve those changes. Do not revert unrelated edits. This plan intentionally touches `frontend/src/app/globals.css`, so inspect its current contents before patching and merge around existing user changes.

## Product Behavior

- Mobile gets a visible `Rotate map` button while the user is on the map.
- Tapping `Rotate map` enters an immersive rotated landscape map mode inside the web app. This does not rely on device orientation or system auto-rotate.
- Rotated mode is map-first:
  - Hide the bottom nav, status peek, mobile sheets, mobile legend, desktop header chrome, and desktop legend.
  - Show a compact fixed control strip with `Exit rotated map`, `Center map`, and `Details` when an impact or station is selected.
  - Keep the selected overlay or station highlighted.
  - Do not open mobile inspector sheets on top of the rotated map.
- `Show on Map` behavior:
  - In standard portrait mode, keep the current behavior: open the mobile inspector split view and focus the selected map target.
  - In rotated mode, tapping a map overlay or station keeps rotated mode active, highlights/focuses the target, and exposes `Details`.
  - Tapping `Details` exits rotated mode and opens the existing impact/station inspector.
  - Do not auto-enter rotated mode from every `Show on Map` card button. Rotation is an explicit user-selected map mode.
- Gesture stability behavior:
  - Finger drag and pinch use direct DOM transforms as they do now.
  - While a gesture is active, expensive animated overlay effects pause.
  - Programmatic focus animations from `Show on Map`, inspector layout changes, or recenter signals do not fight an active touch gesture.
  - When the gesture ends, normal focus and overlay emphasis can resume.

## Non-Goals

- Do not redesign desktop.
- Do not change backend APIs.
- Do not add dependencies.
- Do not rewrite map geometry, station seed data, or SVG overlay coordinate generation.
- Do not persist rotated mode in local storage in this slice.
- Do not claim live TTC status when fixture/fallback/stale data is shown.

## File Structure

- Create `frontend/src/components/MobileMapControls.tsx`
  - Mobile-only map control strip for standard and rotated map modes.
  - Owns button labels, icons, and accessible names for rotate/exit/center/details.

- Modify `frontend/src/components/LineWatchShell.tsx`
  - Owns `mapPresentationMode`.
  - Adds shell classes for rotated mode.
  - Hides mobile nav/status/inspector while rotated.
  - Passes `viewportOrientation` into `InteractiveTtcMap`.
  - Triggers `mapLayoutSignal` after rotate mode changes.

- Modify `frontend/src/components/InteractiveTtcMap.tsx`
  - Accepts `viewportOrientation`.
  - Passes it to `usePanZoom`.
  - Adds a gesture-active class/data attribute for CSS.
  - Defers selected-target focus while a gesture is active.

- Modify `frontend/src/hooks/panZoomMath.ts`
  - Adds reusable viewport-orientation types and rotated pointer-coordinate math.

- Modify `frontend/src/hooks/usePanZoom.ts`
  - Uses logical viewport dimensions in standard and rotated modes.
  - Remaps pointer/wheel coordinates when the viewport is rotated.
  - Exposes `isGestureActive`.
  - Prevents programmatic animations while a gesture is active.

- Modify `frontend/src/app/globals.css`
  - Adds rotated map shell layout.
  - Adds mobile map control styles.
  - Adds gesture-active overlay simplification rules.

- Create `frontend/tests/mobile-rotated-map-mode.test.mjs`
  - Source and math guardrails for rotated mode.

- Modify `frontend/tests/pan-zoom-behavior.test.mjs`
  - Adds pan/zoom guardrails for gesture-active state and deferred focus.

- Modify `frontend/tests/mobile-bottom-sheet-ux.test.mjs`
  - Adds assertions that rotated mode hides competing mobile chrome.

- Modify `frontend/tests/mobile-performance-guardrails.test.mjs`
  - Adds assertions that gesture-active mode pauses expensive map paint effects.

- Modify `frontend/tests/smoke/dashboard.spec.ts`
  - Adds mobile smoke coverage for rotated viewport mode and selected-target details.

---

## Task 1: Add Failing Source And Math Tests

**Files:**
- Create: `frontend/tests/mobile-rotated-map-mode.test.mjs`
- Modify: `frontend/tests/pan-zoom-behavior.test.mjs`
- Modify: `frontend/tests/mobile-bottom-sheet-ux.test.mjs`
- Modify: `frontend/tests/mobile-performance-guardrails.test.mjs`

- [ ] **Step 1: Create `mobile-rotated-map-mode.test.mjs`.**

Create `frontend/tests/mobile-rotated-map-mode.test.mjs` with this content:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { clientPointToLogicalViewportPoint } from "../src/hooks/panZoomMath.ts";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const controlsSource = readFileSync(new URL("../src/components/MobileMapControls.tsx", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../src/hooks/usePanZoom.ts", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("mobile rotated map mode", () => {
  it("maps visual pointer coordinates into the logical landscape viewport", () => {
    const visualRect = { left: 0, top: 0, width: 390, height: 844 };

    assert.deepEqual(
      clientPointToLogicalViewportPoint(
        { x: 20, y: 300 },
        visualRect,
        "rotated-landscape",
      ),
      { x: 300, y: 370 },
    );

    assert.deepEqual(
      clientPointToLogicalViewportPoint(
        { x: 20, y: 300 },
        visualRect,
        "standard",
      ),
      { x: 20, y: 300 },
    );
  });

  it("adds shell-owned map presentation mode and rotated mode classes", () => {
    assert.match(controlsSource, /export type MapPresentationMode = "standard" \| "rotated-landscape"/);
    assert.match(shellSource, /mapPresentationMode/);
    assert.match(shellSource, /setMapPresentationMode\("rotated-landscape"\)/);
    assert.match(shellSource, /setMapPresentationMode\("standard"\)/);
    assert.match(shellSource, /mobile-map-rotated/);
    assert.match(shellSource, /mapPresentationMode === "standard"/);
    assert.match(shellSource, /mapPresentationMode === "rotated-landscape"/);
  });

  it("renders mobile map controls with explicit rotate, exit, center, and details actions", () => {
    assert.match(shellSource, /MobileMapControls/);
    assert.match(controlsSource, /Rotate map/);
    assert.match(controlsSource, /Exit rotated map/);
    assert.match(controlsSource, /Center map/);
    assert.match(controlsSource, /Details/);
    assert.match(controlsSource, /aria-label="Rotate map"/);
    assert.match(controlsSource, /aria-label="Exit rotated map"/);
    assert.match(controlsSource, /aria-label="Center map"/);
  });

  it("passes viewport orientation into the pan zoom hook without rotating map data", () => {
    assert.match(mapSource, /viewportOrientation/);
    assert.match(mapSource, /usePanZoom\(\{ reducedMotion, viewportOrientation \}\)/);
    assert.match(hookSource, /viewportOrientation = "standard"/);
    assert.match(hookSource, /clientPointToLogicalViewportPoint/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated > main/);
    assert.doesNotMatch(mapSource, /rotate\(90deg\).*ttc-svg-container/s);
  });
});
```

- [ ] **Step 2: Extend `pan-zoom-behavior.test.mjs`.**

Add these tests inside the existing `describe("pan zoom behavior guardrails", ...)` block:

```js
  it("exposes gesture-active state without depending on every pointer move", () => {
    assert.match(hookSource, /const \[isGestureActive, setIsGestureActive\] = useState\(false\)/);
    assert.match(hookSource, /setIsGestureActive\(true\)/);
    assert.match(hookSource, /setIsGestureActive\(false\)/);
    assert.match(hookSource, /isGestureActive,/);
    assert.match(mapSource, /map-gesture-active/);
  });

  it("defers programmatic selected-target focus while the user is gesturing", () => {
    assert.match(mapSource, /if \(isGestureActive\) return/);
    assert.match(mapSource, /isGestureActive,/);
    assert.match(hookSource, /if \(isGestureActiveRef\.current\) \{\s*return;\s*\}/s);
  });

  it("uses logical viewport dimensions for rotated map recenter and zoom", () => {
    assert.match(hookSource, /const logicalViewportSize = useCallback/);
    assert.match(hookSource, /clientWidth/);
    assert.match(hookSource, /clientHeight/);
    assert.match(hookSource, /viewportOrientation/);
  });
```

- [ ] **Step 3: Extend `mobile-bottom-sheet-ux.test.mjs`.**

Add this test near the existing mobile map and inspector assertions:

```js
  it("hides competing mobile chrome while the rotated map mode is active", () => {
    assert.match(shellSource, /mobile-map-rotated/);
    assert.match(shellSource, /MobileMapControls/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated \.mobile-bottom-nav/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated \.mobile-status-peek/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated \.floating-panel-shell/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated \.mobile-legend-pill/);
  });
```

- [ ] **Step 4: Extend `mobile-performance-guardrails.test.mjs`.**

Add this test inside the existing `describe("mobile performance guardrails", ...)` block:

```js
  it("pauses expensive overlay paint effects only while map gestures are active", () => {
    assert.match(globalCss, /\.map-gesture-active \.asset-alert-path-glow/);
    assert.match(globalCss, /\.map-gesture-active \.interactive-glow/);
    assert.match(globalCss, /\.map-gesture-active \.station-impact-ring/);
    assert.match(globalCss, /\.map-gesture-active \.station-impact-dot-red-glow/);
    assert.match(globalCss, /\.map-gesture-active \.station-impact-dot-red-ping/);
    assert.match(globalCss, /animation:\s*none\s*!important/);
    assert.match(globalCss, /transition:\s*none\s*!important/);
    assert.match(globalCss, /filter:\s*none\s*!important/);
  });
```

- [ ] **Step 5: Run the focused failing tests.**

Run:

```bash
node --test frontend/tests/mobile-rotated-map-mode.test.mjs frontend/tests/pan-zoom-behavior.test.mjs frontend/tests/mobile-bottom-sheet-ux.test.mjs frontend/tests/mobile-performance-guardrails.test.mjs
```

Expected: FAIL. The new `MobileMapControls.tsx`, `clientPointToLogicalViewportPoint`, rotated shell classes, and gesture-active wiring do not exist yet.

- [ ] **Step 6: Commit only the failing tests if working branch policy allows.**

```bash
git add frontend/tests/mobile-rotated-map-mode.test.mjs frontend/tests/pan-zoom-behavior.test.mjs frontend/tests/mobile-bottom-sheet-ux.test.mjs frontend/tests/mobile-performance-guardrails.test.mjs
git commit -m "test: define mobile rotated map mode guardrails"
```

If the worktree contains unrelated dirty files, skip the commit and continue without staging unrelated changes.

---

## Task 2: Add Rotated Pointer Math And Gesture State

**Files:**
- Modify: `frontend/src/hooks/panZoomMath.ts`
- Modify: `frontend/src/hooks/usePanZoom.ts`
- Test: `frontend/tests/mobile-rotated-map-mode.test.mjs`
- Test: `frontend/tests/pan-zoom-behavior.test.mjs`

- [ ] **Step 1: Add orientation math to `panZoomMath.ts`.**

In `frontend/src/hooks/panZoomMath.ts`, add these exports after `PanZoomPoint`:

```ts
export type MapViewportOrientation = "standard" | "rotated-landscape";

export type ViewportClientRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function clientPointToLogicalViewportPoint(
  clientPoint: PanZoomPoint,
  rect: ViewportClientRect,
  orientation: MapViewportOrientation = "standard",
): PanZoomPoint {
  const visualX = clientPoint.x - rect.left;
  const visualY = clientPoint.y - rect.top;

  if (orientation === "rotated-landscape") {
    return {
      x: visualY,
      y: rect.width - visualX,
    };
  }

  return {
    x: visualX,
    y: visualY,
  };
}
```

- [ ] **Step 2: Update `usePanZoom` imports and options.**

In `frontend/src/hooks/usePanZoom.ts`, update the import from `panZoomMath` to include:

```ts
  clientPointToLogicalViewportPoint,
  type MapViewportOrientation,
```

Update the options type:

```ts
type UsePanZoomOptions = {
  reducedMotion?: boolean;
  viewportOrientation?: MapViewportOrientation;
};
```

Update the hook signature:

```ts
export function usePanZoom({
  reducedMotion = false,
  viewportOrientation = "standard",
}: UsePanZoomOptions = {}) {
```

- [ ] **Step 3: Add gesture-active React state.**

Near the existing `isDragging` state in `usePanZoom`, add:

```ts
  const [isGestureActive, setIsGestureActive] = useState(false);
```

Update `startGestureInteraction` so it sets this state once at gesture start:

```ts
  const startGestureInteraction = useCallback((pointerType: string) => {
    isGestureActiveRef.current = true;
    setIsGestureActive(true);
    setMapTransition("none");
    if (pointerType === "mouse") {
      setIsDragging(true);
    }
  }, [setMapTransition]);
```

In `finishPointerInteraction`, when no pointers remain and before `restoreIdleMapTransition()`, add:

```ts
    setIsGestureActive(false);
```

Leave the cleanup effect's existing ref cleanup in place. Do not call `setIsGestureActive(false)` from the unmount cleanup.

Return it from the hook:

```ts
    isGestureActive,
```

- [ ] **Step 4: Add logical viewport helpers.**

In `usePanZoom`, replace `pointerPointFromEvent` with these helpers:

```ts
  const logicalViewportSize = useCallback(() => {
    const element = containerRef.current;
    if (!element) return { width: 0, height: 0 };
    return {
      width: element.clientWidth,
      height: element.clientHeight,
    };
  }, []);

  const pointFromClientPoint = useCallback((clientX: number, clientY: number): PanZoomPoint => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: clientX, y: clientY };
    }

    return clientPointToLogicalViewportPoint(
      { x: clientX, y: clientY },
      rect,
      viewportOrientation,
    );
  }, [viewportOrientation]);

  const pointerPointFromEvent = useCallback((event: PointerEvent<HTMLDivElement>): PanZoomPoint => {
    return pointFromClientPoint(event.clientX, event.clientY);
  }, [pointFromClientPoint]);
```

- [ ] **Step 5: Use logical viewport dimensions in zoom helpers.**

In `handleWheel`, replace the `getBoundingClientRect()` coordinate math with:

```ts
    const { x: mouseX, y: mouseY } = pointFromClientPoint(e.clientX, e.clientY);
```

In `recenter`, replace `const rect = containerRef.current.getBoundingClientRect();` and all `rect.width` / `rect.height` references with:

```ts
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
```

Then use `width` and `height` in the scale and offset calculations:

```ts
    const scale = Math.min(width / mapWidth, height / mapHeight);
    const x = width / 2 - (mapWidth / 2) * scale;
    const y = height / 2 - (mapHeight * 0.435) * scale;
```

In `zoomIn`, `zoomOut`, `zoomToScale`, and `zoomToPoint`, replace `getBoundingClientRect()` center calculations with:

```ts
    const { width, height } = logicalViewportSize();
    if (width <= 0 || height <= 0) return;
    const centerX = width / 2;
    const centerY = height / 2;
```

- [ ] **Step 6: Prevent programmatic animations during gestures.**

At the start of `animateTransformTo`, after calculating `snapped` is not required. Put this guard as the first statement in the callback:

```ts
    if (isGestureActiveRef.current) {
      return;
    }
```

This keeps layout and focus effects from fighting active touch gestures. The selected-target focus effect in `InteractiveTtcMap` will rerun after `isGestureActive` becomes false in a later task.

- [ ] **Step 7: Run focused tests.**

Run:

```bash
node --test frontend/tests/mobile-rotated-map-mode.test.mjs frontend/tests/pan-zoom-behavior.test.mjs
```

Expected: `panZoomMath` orientation math passes. Some tests still fail because the map and shell are not wired yet.

- [ ] **Step 8: Commit the hook/math slice if working branch policy allows.**

```bash
git add frontend/src/hooks/panZoomMath.ts frontend/src/hooks/usePanZoom.ts frontend/tests/mobile-rotated-map-mode.test.mjs frontend/tests/pan-zoom-behavior.test.mjs
git commit -m "feat: support rotated map pointer coordinates"
```

---

## Task 3: Add Mobile Map Controls And Shell Presentation State

**Files:**
- Create: `frontend/src/components/MobileMapControls.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Test: `frontend/tests/mobile-rotated-map-mode.test.mjs`
- Test: `frontend/tests/mobile-bottom-sheet-ux.test.mjs`

- [ ] **Step 1: Create `MobileMapControls.tsx`.**

Create `frontend/src/components/MobileMapControls.tsx`:

```tsx
"use client";

import { Info, Locate, RotateCw, X } from "lucide-react";

export type MapPresentationMode = "standard" | "rotated-landscape";

type Props = {
  presentationMode: MapPresentationMode;
  hasSelection: boolean;
  onEnterRotated: () => void;
  onExitRotated: () => void;
  onRecenter: () => void;
  onOpenDetails: () => void;
};

export function MobileMapControls({
  presentationMode,
  hasSelection,
  onEnterRotated,
  onExitRotated,
  onRecenter,
  onOpenDetails,
}: Props) {
  const rotated = presentationMode === "rotated-landscape";

  return (
    <div className="mobile-map-controls" data-mode={presentationMode}>
      {rotated ? (
        <button
          type="button"
          className="mobile-map-control-button mobile-map-control-button-strong"
          aria-label="Exit rotated map"
          onClick={onExitRotated}
        >
          <X size={18} aria-hidden="true" />
          <span>Exit</span>
        </button>
      ) : (
        <button
          type="button"
          className="mobile-map-control-button mobile-map-control-button-strong"
          aria-label="Rotate map"
          onClick={onEnterRotated}
        >
          <RotateCw size={18} aria-hidden="true" />
          <span>Rotate map</span>
        </button>
      )}

      <button
        type="button"
        className="mobile-map-control-button"
        aria-label="Center map"
        onClick={onRecenter}
      >
        <Locate size={18} aria-hidden="true" />
        <span>Center</span>
      </button>

      {rotated && hasSelection ? (
        <button
          type="button"
          className="mobile-map-control-button"
          aria-label="Details"
          onClick={onOpenDetails}
        >
          <Info size={18} aria-hidden="true" />
          <span>Details</span>
        </button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Import controls and type in `LineWatchShell.tsx`.**

Add this import:

```ts
import { MobileMapControls, type MapPresentationMode } from "./MobileMapControls";
```

- [ ] **Step 3: Add shell state.**

Near `mobileInspectorDetent` and `mapLayoutSignal`, add:

```ts
  const [mapPresentationMode, setMapPresentationMode] = useState<MapPresentationMode>("standard");
```

Add this derived state near `mobileInspectorOpen`:

```ts
  const rotatedMapMode =
    isMobile &&
    mapPresentationMode === "rotated-landscape" &&
    !showClosedScreen;
```

- [ ] **Step 4: Reset rotated mode outside mobile map contexts.**

Add these effects after the existing visual viewport effect:

```ts
  useEffect(() => {
    if (!isMobile && mapPresentationMode !== "standard") {
      setMapPresentationMode("standard");
    }
  }, [isMobile, mapPresentationMode]);

  useEffect(() => {
    if (!isMobile) return;
    const timer = window.setTimeout(() => {
      setMapLayoutSignal((current) => current + 1);
    }, mapPresentationMode === "rotated-landscape" ? 90 : 50);

    return () => window.clearTimeout(timer);
  }, [isMobile, mapPresentationMode]);
```

- [ ] **Step 5: Keep mobile inspectors out of rotated mode.**

Update `mobileImpactInspectorOpen` to include standard mode:

```ts
  const mobileImpactInspectorOpen =
    isMobile &&
    mapPresentationMode === "standard" &&
    activeView === "map" &&
    Boolean(selection) &&
    !selectedStationId &&
    !accountDialogMode &&
    !commutePathPreview &&
    !showClosedScreen;
```

Update `mobileStationInspectorOpen` the same way:

```ts
  const mobileStationInspectorOpen =
    isMobile &&
    mapPresentationMode === "standard" &&
    activeView === "map" &&
    Boolean(selectedStationId) &&
    !accountDialogMode &&
    !showClosedScreen;
```

- [ ] **Step 6: Add rotated shell classes.**

Replace the current `shellInspectorClasses` expression with:

```ts
  const shellInspectorClasses = [
    mobileInspectorOpen
      ? [
          "mobile-map-inspector",
          mobileImpactInspectorOpen ? "mobile-map-inspector-impact" : "mobile-map-inspector-station",
          `mobile-map-inspector-${mobileInspectorDetent}`,
        ].join(" ")
      : "",
    rotatedMapMode ? "mobile-map-rotated" : "",
  ].filter(Boolean).join(" ");
```

- [ ] **Step 7: Reset rotated mode when mobile nav opens another workflow.**

At the start of `onMobileNavSelect`, after clearing selection/station/commute state, add:

```ts
    setMapPresentationMode("standard");
```

In `handleMobileSheetClose`, add:

```ts
    setMapPresentationMode("standard");
```

In `handlePeekClosedMap`, add:

```ts
    setMapPresentationMode("standard");
```

- [ ] **Step 8: Add an open-details handler.**

Add this callback near `handleMapSelectImpact`:

```ts
  const handleOpenRotatedSelectionDetails = useCallback(() => {
    setMapPresentationMode("standard");
    setMobileInspectorDetent("details-focus");
    setActiveView("map");
    window.setTimeout(() => {
      setMapLayoutSignal((current) => current + 1);
    }, 60);
  }, [setActiveView, setMapLayoutSignal, setMobileInspectorDetent, setMapPresentationMode]);
```

- [ ] **Step 9: Pass orientation to the map.**

In the `InteractiveTtcMap` props, add:

```tsx
          viewportOrientation={rotatedMapMode ? "rotated-landscape" : "standard"}
```

- [ ] **Step 10: Render `MobileMapControls`.**

Render this before `MobileStatusPeek`:

```tsx
      {!showClosedScreen && isMobile && activeView === "map" && !accountDialogMode && !mobileInspectorOpen ? (
        <MobileMapControls
          presentationMode={rotatedMapMode ? "rotated-landscape" : "standard"}
          hasSelection={Boolean(selection || selectedStationId)}
          onEnterRotated={() => {
            setMapPresentationMode("rotated-landscape");
            setActiveView("map");
          }}
          onExitRotated={() => setMapPresentationMode("standard")}
          onRecenter={() => setRecenterSignal((prev) => prev + 1)}
          onOpenDetails={handleOpenRotatedSelectionDetails}
        />
      ) : null}
```

- [ ] **Step 11: Hide mobile bottom nav while rotated.**

Update the existing bottom nav render condition by adding `!rotatedMapMode`:

```tsx
      {!showClosedScreen && !rotatedMapMode && !mobileInspectorOpen && !selectedStationId && !accountDialogMode ? (
```

- [ ] **Step 12: Hide `MobileStatusPeek` while rotated.**

Update the status peek render condition by adding `!rotatedMapMode`:

```tsx
      {!showClosedScreen && !rotatedMapMode && activeView === "map" && !selection && !selectedStationId && !accountDialogMode && !commutePathPreview ? (
```

- [ ] **Step 13: Run focused tests.**

Run:

```bash
node --test frontend/tests/mobile-rotated-map-mode.test.mjs frontend/tests/mobile-bottom-sheet-ux.test.mjs
```

Expected: Some CSS assertions still fail until the rotated mode styles are added.

- [ ] **Step 14: Commit the shell/control slice if working branch policy allows.**

```bash
git add frontend/src/components/MobileMapControls.tsx frontend/src/components/LineWatchShell.tsx frontend/tests/mobile-rotated-map-mode.test.mjs frontend/tests/mobile-bottom-sheet-ux.test.mjs
git commit -m "feat: add mobile rotated map controls"
```

---

## Task 4: Wire Map Orientation And Gesture Classes

**Files:**
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Test: `frontend/tests/mobile-rotated-map-mode.test.mjs`
- Test: `frontend/tests/pan-zoom-behavior.test.mjs`

- [ ] **Step 1: Import the orientation type.**

In `frontend/src/components/InteractiveTtcMap.tsx`, add:

```ts
import type { MapViewportOrientation } from "../hooks/panZoomMath";
```

- [ ] **Step 2: Add a prop.**

In the component props object, add:

```ts
  viewportOrientation?: MapViewportOrientation;
```

In the destructuring parameter list, add a default:

```ts
  viewportOrientation = "standard",
```

- [ ] **Step 3: Pass orientation to `usePanZoom`.**

Update the hook call:

```ts
  } = usePanZoom({ reducedMotion, viewportOrientation });
```

Also destructure:

```ts
    isGestureActive,
```

- [ ] **Step 4: Defer selected-target focus while gesturing.**

At the start of the selected-target focus `useEffect`, after the `loadState` check, add:

```ts
    if (isGestureActive) return;
```

Add `isGestureActive` to that effect dependency list.

- [ ] **Step 5: Add class and data attribute to the map root.**

Replace the root div:

```tsx
    <div ref={mapRootRef} className="relative w-full h-full flex flex-col overflow-hidden bg-transparent">
```

with:

```tsx
    <div
      ref={mapRootRef}
      className={`relative w-full h-full flex flex-col overflow-hidden bg-transparent ${isGestureActive ? "map-gesture-active" : ""}`}
      data-map-viewport-orientation={viewportOrientation}
      data-map-gesture-active={isGestureActive ? "true" : "false"}
    >
```

- [ ] **Step 6: Run focused tests.**

Run:

```bash
node --test frontend/tests/mobile-rotated-map-mode.test.mjs frontend/tests/pan-zoom-behavior.test.mjs
```

Expected: Source tests pass except CSS assertions that are completed in the next task.

- [ ] **Step 7: Commit the map wiring slice if working branch policy allows.**

```bash
git add frontend/src/components/InteractiveTtcMap.tsx frontend/tests/mobile-rotated-map-mode.test.mjs frontend/tests/pan-zoom-behavior.test.mjs
git commit -m "feat: wire map viewport orientation"
```

---

## Task 5: Add Rotated Mode And Gesture Stability CSS

**Files:**
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/tests/mobile-rotated-map-mode.test.mjs`
- Test: `frontend/tests/mobile-bottom-sheet-ux.test.mjs`
- Test: `frontend/tests/mobile-performance-guardrails.test.mjs`

- [ ] **Step 1: Add gesture-active paint simplification rules.**

In `frontend/src/app/globals.css`, near the existing mobile performance map rules, add:

```css
.map-gesture-active .asset-alert-path-glow,
.map-gesture-active .interactive-glow,
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

.map-gesture-active .asset-alert-path-glow {
  opacity: 0.22;
  stroke-width: 118;
}

.map-gesture-active .interactive-glow.selected {
  opacity: 0.36;
  stroke-width: 138;
}

.map-gesture-active .ttc-svg-container svg,
.map-gesture-active .asset-alert-path,
.map-gesture-active .asset-alert-path-glow {
  shape-rendering: auto;
  text-rendering: optimizeLegibility;
}
```

- [ ] **Step 2: Add base mobile map control styles.**

Near the existing mobile nav/status styles, add:

```css
.mobile-map-controls {
  display: none;
}

@media (max-width: 767px) {
  .mobile-map-controls {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    pointer-events: auto;
    position: fixed;
    right: 12px;
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    z-index: 70;
  }

  .mobile-map-controls[data-mode="rotated-landscape"] {
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid rgba(15, 23, 42, 0.16);
    border-radius: 8px;
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.24);
    left: 12px;
    padding: 6px;
    right: 12px;
  }

  .dark .mobile-map-controls[data-mode="rotated-landscape"],
  .high-contrast .mobile-map-controls[data-mode="rotated-landscape"] {
    background: rgba(10, 12, 16, 0.94);
    border-color: rgba(255, 255, 255, 0.18);
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.42);
  }

  .mobile-map-control-button {
    align-items: center;
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid rgba(15, 23, 42, 0.14);
    border-radius: 8px;
    color: #0f172a;
    display: inline-flex;
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 950;
    gap: 6px;
    justify-content: center;
    min-height: 42px;
    padding: 8px 10px;
    transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, transform 120ms ease;
  }

  .mobile-map-controls[data-mode="rotated-landscape"] .mobile-map-control-button {
    flex: 1 1 0;
  }

  .dark .mobile-map-control-button,
  .high-contrast .mobile-map-control-button {
    background: rgba(10, 12, 16, 0.94);
    border-color: rgba(255, 255, 255, 0.18);
    color: #ffffff;
  }

  .mobile-map-control-button-strong {
    background: #dc2626;
    border-color: rgba(127, 29, 29, 0.45);
    color: #ffffff;
  }

  .dark .mobile-map-control-button-strong,
  .high-contrast .mobile-map-control-button-strong {
    background: #ef4444;
    border-color: rgba(254, 202, 202, 0.5);
    color: #ffffff;
  }

  .mobile-map-control-button:active {
    transform: translateY(1px) scale(0.98);
  }
}
```

- [ ] **Step 3: Add rotated map shell layout.**

After the mobile map control styles, add:

```css
@media (max-width: 767px) {
  .linewatch-shell.mobile-map-rotated {
    background: #05070b;
  }

  .linewatch-shell.mobile-map-rotated > header,
  .linewatch-shell.mobile-map-rotated .mobile-bottom-nav,
  .linewatch-shell.mobile-map-rotated .mobile-status-peek,
  .linewatch-shell.mobile-map-rotated .floating-panel-shell,
  .linewatch-shell.mobile-map-rotated .mobile-legend-pill,
  .linewatch-shell.mobile-map-rotated .desktop-map-legend {
    display: none !important;
  }

  .linewatch-shell.mobile-map-rotated > main {
    bottom: auto !important;
    height: 100vw;
    left: 50%;
    overflow: hidden;
    position: fixed;
    right: auto !important;
    top: 50%;
    transform: translate(-50%, -50%) rotate(90deg);
    transform-origin: center center;
    width: var(--visual-viewport-height, 100dvh);
    z-index: 55;
  }

  .linewatch-shell.mobile-map-rotated .map-control-rail {
    display: none !important;
  }

  .linewatch-shell.mobile-map-rotated .mobile-map-controls {
    display: flex;
  }
}
```

- [ ] **Step 4: Run focused tests.**

Run:

```bash
node --test frontend/tests/mobile-rotated-map-mode.test.mjs frontend/tests/mobile-bottom-sheet-ux.test.mjs frontend/tests/mobile-performance-guardrails.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the CSS slice if working branch policy allows.**

```bash
git add frontend/src/app/globals.css frontend/tests/mobile-rotated-map-mode.test.mjs frontend/tests/mobile-bottom-sheet-ux.test.mjs frontend/tests/mobile-performance-guardrails.test.mjs
git commit -m "style: add rotated mobile map mode"
```

---

## Task 6: Add Mobile Rotated Mode Smoke Coverage

**Files:**
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Add a mobile smoke test.**

In `frontend/tests/smoke/dashboard.spec.ts`, after the existing `mobile keeps lightweight map focus flashes and menu transitions` test, add:

```ts
test("mobile rotated map mode uses a landscape viewport and keeps map details reachable", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only rotated map smoke");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Rotate map" }).click();
  const shell = page.locator(".linewatch-shell");
  await expect(shell).toHaveClass(/mobile-map-rotated/);
  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toHaveCount(0);
  await expect(page.locator(".mobile-status-peek")).toHaveCount(0);

  const mainDimensions = await page.locator(".linewatch-shell > main").evaluate((element) => ({
    clientWidth: element.clientWidth,
    clientHeight: element.clientHeight,
    visualWidth: element.getBoundingClientRect().width,
    visualHeight: element.getBoundingClientRect().height,
  }));
  expect(mainDimensions.clientWidth).toBeGreaterThan(mainDimensions.clientHeight);
  expect(mainDimensions.visualHeight).toBeGreaterThan(mainDimensions.visualWidth);

  await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" }).dispatchEvent("click");
  await expect(page.locator('[data-map-highlight-id="stub-delay-line-4"]')).toBeAttached();
  await expect(page.locator("[data-mobile-impact-inspector]")).toHaveCount(0);

  await page.getByRole("button", { name: "Details" }).click();
  await expect(shell).not.toHaveClass(/mobile-map-rotated/);
  const inspector = page.locator("[data-mobile-impact-inspector]");
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText("Delay");
  await expect(inspector).toContainText("Sheppard-Yonge");
});
```

- [ ] **Step 2: Run source tests before smoke.**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 3: Run smoke tests if local Playwright services are available.**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS. If this fails because local stub/preview services are unavailable, record the exact failure and run the source tests, typecheck, and lint instead.

- [ ] **Step 4: Commit the smoke test if working branch policy allows.**

```bash
git add frontend/tests/smoke/dashboard.spec.ts
git commit -m "test: cover mobile rotated map mode"
```

---

## Task 7: Final Verification And Polish

**Files:**
- Read: all modified files
- Modify: only files with verification failures

- [ ] **Step 1: Run all frontend source tests.**

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript.**

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint.**

```bash
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 4: Run production build for substantial frontend UI changes.**

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 5: Run smoke tests when services are available.**

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS. If unavailable, report the exact service or environment failure.

- [ ] **Step 6: Manual mobile checks in browser.**

Start the frontend if needed:

```bash
npm --prefix frontend run dev
```

Use a mobile viewport and verify:

```text
1. Map opens in standard portrait mode with bottom nav/status peek visible.
2. Rotate map enters rotated mode.
3. Bottom nav, status peek, mobile sheets, and mobile legend are hidden in rotated mode.
4. Exit returns to standard portrait mode.
5. Center recenters in both standard and rotated modes.
6. Dragging and pinch zooming do not visibly flash blank SVG regions.
7. Tapping an overlay in rotated mode keeps rotated mode active and shows Details.
8. Details exits rotated mode and opens the existing inspector.
9. Show on Map from alert, delay, RSZ, and closure cards still works in standard mode.
10. Station taps still open station details in standard mode.
```

- [ ] **Step 7: Final git status.**

```bash
git status --short
```

Expected: only intended files are modified, plus any unrelated user changes that were already present.

## Verification Commands Summary

Minimum required for this frontend-only work:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Because this is substantial mobile UI and map interaction work, also run when the environment supports it:

```bash
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

## Expected Changed Files

```text
frontend/src/components/MobileMapControls.tsx
frontend/src/components/LineWatchShell.tsx
frontend/src/components/InteractiveTtcMap.tsx
frontend/src/hooks/panZoomMath.ts
frontend/src/hooks/usePanZoom.ts
frontend/src/app/globals.css
frontend/tests/mobile-rotated-map-mode.test.mjs
frontend/tests/pan-zoom-behavior.test.mjs
frontend/tests/mobile-bottom-sheet-ux.test.mjs
frontend/tests/mobile-performance-guardrails.test.mjs
frontend/tests/smoke/dashboard.spec.ts
```

Do not edit backend files for this plan.

# Rotated Map Selection Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make rotated mobile map presentation mode feel coherent by replacing portrait-oriented station/impact panels with a rotated lightweight selection preview and an explicit Details handoff.

**Architecture:** Keep rotated mode as a map presentation state owned by `LineWatchShell`. In rotated mode, station and overlay taps only update map selection state and render a small HUD inside the rotated `<main>` so the controls and preview share the map's landscape orientation. Full details remain the existing portrait station detail and mobile impact inspector, opened only after the user taps Details.

**Tech Stack:** Next.js App Router, React, TypeScript, `lucide-react`, CSS in `frontend/src/app/globals.css`, Node built-in source tests, Playwright Chromium smoke tests.

---

## Gemini 3.5 Flash Handoff Prompt

Use this exact prompt when starting implementation:

```text
You are working in ~/dev/ttc-reliability-navigator on LineWatch TO, an unofficial TTC reliability dashboard. Read AGENTS.md, GEMINI.md, README.md, docs/superpowers/plans/2026-06-10-mobile-rotated-map-and-gesture-stability.md, and docs/superpowers/plans/2026-06-10-rotated-map-selection-preview.md before editing. Implement the plan task-by-task. Preserve user changes, do not revert unrelated files, do not claim the dashboard is official or live unless fresh ingestion is active, and run the verification commands listed at the end before saying work is complete.
```

## Current Problem

Gemini's first rotated-mode implementation added a useful presentation mode, but it still lets the portrait station detail surface render in rotated mode:

```tsx
{!showClosedScreen && selectedStationId && (
  <StationDetailPanel ... />
)}
```

That panel is outside the rotated `<main>`, so it opens in portrait orientation and appears visually disconnected from the rotated map. Impact selections avoid `MobileImpactInspector` because it is gated to `mapPresentationMode === "standard"`, but station selections are not gated the same way.

The rotated mode controls also render outside the rotated `<main>`, so they are screen-fixed portrait UI while the map is landscape-oriented. The desired behavior is one coordinate system: map, controls, and intermediate selected-item preview all share the rotated landscape presentation.

## Product Behavior

- Standard portrait mobile mode remains unchanged:
  - bottom nav and status peek still appear.
  - station taps open `StationDetailPanel`.
  - alert/overlay taps open the existing mobile impact inspector.
  - `Show on Map` card actions continue to use the existing mobile inspector split view.
- Rotated mobile presentation mode changes:
  - station taps do not open `StationDetailPanel`.
  - overlay taps do not open `MobileImpactInspector`.
  - station and overlay taps update selected map state and show a compact rotated preview card below the rotated controls.
  - the preview heading uses `Selected`, not `You Clicked`.
  - the preview includes enough context to confirm what was tapped.
  - the preview has `Details` and `Clear` actions.
  - `Details` exits rotated mode and opens the existing portrait details surface.
  - `Clear` clears selection and leaves rotated mode active.
- The `Exit` and `Center` controls and the preview card must be visually in the same rotated landscape orientation as the map.
- Avoid duplicated `Details` buttons: remove Details from the top rotated control rail and put it only in the preview card.

## Non-Goals

- Do not change backend APIs.
- Do not redesign the normal portrait mobile inspector or station panel.
- Do not change map SVG geometry, station coordinate extraction, or overlay rendering.
- Do not persist rotated mode or selected preview state in local storage.
- Do not add dependencies.

## Files To Create

- `frontend/src/components/RotatedMapSelectionCard.tsx`
  - Renders the rotated-mode selected station or selected impact preview.
  - Reuses `getSelectedImpactDetails` from `MobileImpactInspector`.
  - Reads line status metadata from `useDashboardData`.

## Files To Modify

- `frontend/src/components/MobileMapControls.tsx`
  - Keep `Exit` and `Center`.
  - Remove top-rail `Details`.
  - Keep `PhoneRotateLandscapeIcon` export because `LineWatchShell` uses it for the standard portrait rotate button.

- `frontend/src/components/LineWatchShell.tsx`
  - Gate portrait station detail with `!rotatedMapMode`.
  - Render a rotated HUD inside `<main>` when `rotatedMapMode` is active.
  - Move `MobileMapControls` into that rotated HUD.
  - Render `RotatedMapSelectionCard` inside that rotated HUD.
  - Add clear and details handlers for rotated selection preview.

- `frontend/src/app/globals.css`
  - Add `.rotated-map-hud` layout inside the rotated `<main>`.
  - Restyle `.mobile-map-controls` when it is inside `.rotated-map-hud`.
  - Add `.rotated-map-selection-card` styles.
  - Hide portrait station detail and portrait impact inspector while rotated as a CSS safety net.

- `frontend/tests/mobile-rotated-map-mode.test.mjs`
  - Add source guardrails for the rotated preview, station-panel gating, and in-main HUD.

- `frontend/tests/mobile-bottom-sheet-ux.test.mjs`
  - Add a source assertion that rotated mode owns selection preview instead of mobile sheets.

- `frontend/tests/smoke/dashboard.spec.ts`
  - Update rotated-mode smoke tests to assert preview behavior for overlay and station taps.

---

## Task 1: Add Failing Source Tests

**Files:**
- Modify: `frontend/tests/mobile-rotated-map-mode.test.mjs`
- Modify: `frontend/tests/mobile-bottom-sheet-ux.test.mjs`

- [ ] **Step 1: Extend `mobile-rotated-map-mode.test.mjs` file reads.**

Add this source read near the existing source constants:

```js
const rotatedSelectionSource = readFileSync(new URL("../src/components/RotatedMapSelectionCard.tsx", import.meta.url), "utf8");
```

- [ ] **Step 2: Update the controls source test to remove top-level Details.**

Replace the current controls test with:

```js
  it("renders rotated map controls with explicit exit and center actions", () => {
    assert.match(shellSource, /MobileMapControls/);
    assert.match(shellSource, /Rotate map/);
    assert.match(controlsSource, /Exit/);
    assert.match(controlsSource, /Center/);
    assert.doesNotMatch(controlsSource, /Details/);
    assert.match(shellSource, /aria-label="Rotate map"/);
    assert.match(controlsSource, /aria-label="Exit rotated map"/);
    assert.match(controlsSource, /aria-label="Center map"/);
  });
```

- [ ] **Step 3: Add a test for the rotated selection card.**

Add this test inside `describe("mobile rotated map mode", ...)`:

```js
  it("renders selected stations and impacts in a rotated in-map preview card", () => {
    assert.match(shellSource, /RotatedMapSelectionCard/);
    assert.match(shellSource, /rotated-map-hud/);
    assert.match(rotatedSelectionSource, /data-rotated-map-selection-card/);
    assert.match(rotatedSelectionSource, /Selected/);
    assert.match(rotatedSelectionSource, /Station/);
    assert.match(rotatedSelectionSource, /Service Impact/);
    assert.match(rotatedSelectionSource, /getSelectedImpactDetails/);
    assert.match(rotatedSelectionSource, /onOpenDetails/);
    assert.match(rotatedSelectionSource, /onClearSelection/);
    assert.match(globalCss, /\.rotated-map-hud/);
    assert.match(globalCss, /\.rotated-map-selection-card/);
  });
```

- [ ] **Step 4: Add a test that portrait panels are gated during rotated mode.**

Add this test inside `describe("mobile rotated map mode", ...)`:

```js
  it("does not render portrait mobile detail surfaces while rotated mode is active", () => {
    assert.match(shellSource, /!rotatedMapMode && selectedStationId/);
    assert.match(shellSource, /mapPresentationMode === "standard"/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated \.station-detail-panel/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-rotated \.mobile-impact-inspector/);
  });
```

- [ ] **Step 5: Extend `mobile-bottom-sheet-ux.test.mjs`.**

Add this test near the existing rotated-mode assertion:

```js
  it("keeps rotated-map selections in a rotated preview instead of portrait sheets", () => {
    assert.match(shellSource, /RotatedMapSelectionCard/);
    assert.match(shellSource, /rotated-map-hud/);
    assert.match(shellSource, /!rotatedMapMode && selectedStationId/);
    assert.match(globalCss, /\.rotated-map-selection-card/);
  });
```

- [ ] **Step 6: Run the focused source tests and confirm failure.**

Run:

```bash
node --test frontend/tests/mobile-rotated-map-mode.test.mjs frontend/tests/mobile-bottom-sheet-ux.test.mjs
```

Expected: FAIL because `RotatedMapSelectionCard.tsx`, `rotated-map-hud`, station-panel gating, and CSS are not implemented yet.

- [ ] **Step 7: Commit the failing tests if working branch policy allows.**

```bash
git add frontend/tests/mobile-rotated-map-mode.test.mjs frontend/tests/mobile-bottom-sheet-ux.test.mjs
git commit -m "test: define rotated map selection preview"
```

If the worktree has unrelated dirty files, skip the commit and continue without staging unrelated changes.

---

## Task 2: Create `RotatedMapSelectionCard`

**Files:**
- Create: `frontend/src/components/RotatedMapSelectionCard.tsx`
- Test: `frontend/tests/mobile-rotated-map-mode.test.mjs`

- [ ] **Step 1: Create the component.**

Create `frontend/src/components/RotatedMapSelectionCard.tsx`:

```tsx
"use client";

import { AlertTriangle, Accessibility, ExternalLink, MapPin, X } from "lucide-react";
import type { DashboardData } from "../app/DataContext";
import { useDashboardData } from "../app/DataContext";
import type { ImpactSelection } from "../app/linewatch-data";
import type { StationSummary } from "../app/station-data";
import { getSelectedImpactDetails } from "./MobileImpactInspector";
import { DelayIcon } from "./DelayIcon";

type Props = {
  selection: ImpactSelection;
  selectedStationId: string | null;
  stations: StationSummary[];
  onOpenDetails: () => void;
  onClearSelection: () => void;
};

function accessLabel(station: StationSummary) {
  if (station.accessStatus === "outage") return "Accessibility outage";
  if (station.accessStatus === "advisory") return "Accessibility advisory";
  return "Accessibility normal";
}

function accessTone(station: StationSummary) {
  if (station.accessStatus === "outage") return "critical";
  if (station.accessStatus === "advisory") return "warning";
  return "normal";
}

function impactToneClass(kind: NonNullable<ImpactSelection>["kind"]) {
  switch (kind) {
    case "suspension":
      return "critical";
    case "delay":
      return "warning";
    case "reduced-speed-zone":
      return "rsz";
    case "planned-closure":
      return "planned";
  }
}

function stationLineNumbers(station: StationSummary, lineStatuses: DashboardData["lineStatuses"]) {
  return station.lineIds
    .map((lineId) => lineStatuses.find((line) => line.id === lineId)?.number ?? lineId.replace("line-", ""))
    .join(" / ");
}

export function RotatedMapSelectionCard({
  selection,
  selectedStationId,
  stations,
  onOpenDetails,
  onClearSelection,
}: Props) {
  const data = useDashboardData();

  if (selection) {
    const details = getSelectedImpactDetails(selection, data);
    if (!details) return null;

    const tone = impactToneClass(selection.kind);

    return (
      <section
        className={`rotated-map-selection-card rotated-map-selection-card-${tone}`}
        data-rotated-map-selection-card
        data-selection-kind={selection.kind}
        aria-label="Selected map item"
      >
        <div className="rotated-map-selection-card-header">
          <div className="rotated-map-selection-card-title-group">
            <span className="rotated-map-selection-card-kicker">Selected Service Impact</span>
            <h2>{details.title}</h2>
          </div>
          <button type="button" className="rotated-map-selection-icon-button" aria-label="Clear selected map item" onClick={onClearSelection}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="rotated-map-selection-card-meta">
          <span className="rotated-map-selection-line-badge">Line {details.lineNumber}</span>
          <span>{details.categoryLabel}</span>
          {selection.kind === "delay" ? <span aria-hidden="true"><DelayIcon size={14} /></span> : <AlertTriangle size={14} aria-hidden="true" />}
        </div>

        <p className="rotated-map-selection-card-location">{details.location}</p>
        {details.displayDirection ? <p className="rotated-map-selection-card-direction">{details.displayDirection}</p> : null}

        <div className="rotated-map-selection-card-actions">
          <button type="button" className="rotated-map-selection-action secondary" onClick={onClearSelection}>
            Clear
          </button>
          <button type="button" className="rotated-map-selection-action primary" onClick={onOpenDetails}>
            <ExternalLink size={15} aria-hidden="true" />
            Details
          </button>
        </div>
      </section>
    );
  }

  if (selectedStationId) {
    const station = stations.find((item) => item.id === selectedStationId);
    if (!station) return null;

    return (
      <section
        className={`rotated-map-selection-card rotated-map-selection-card-station rotated-map-selection-card-${accessTone(station)}`}
        data-rotated-map-selection-card
        data-selection-kind="station"
        aria-label="Selected map item"
      >
        <div className="rotated-map-selection-card-header">
          <div className="rotated-map-selection-card-title-group">
            <span className="rotated-map-selection-card-kicker">Selected Station</span>
            <h2>{station.name}</h2>
          </div>
          <button type="button" className="rotated-map-selection-icon-button" aria-label="Clear selected map item" onClick={onClearSelection}>
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="rotated-map-selection-card-meta">
          <span className="rotated-map-selection-line-badge">Line {stationLineNumbers(station, data.lineStatuses)}</span>
          {station.interchange ? <span>Interchange</span> : <span>Station</span>}
          <MapPin size={14} aria-hidden="true" />
        </div>

        <p className="rotated-map-selection-card-location">
          {station.hasActiveImpact ? "Current service impacts may affect this station." : "No active station impact shown on the map."}
        </p>
        <p className="rotated-map-selection-card-direction">
          <Accessibility size={14} aria-hidden="true" />
          {accessLabel(station)}
        </p>

        <div className="rotated-map-selection-card-actions">
          <button type="button" className="rotated-map-selection-action secondary" onClick={onClearSelection}>
            Clear
          </button>
          <button type="button" className="rotated-map-selection-action primary" onClick={onOpenDetails}>
            <ExternalLink size={15} aria-hidden="true" />
            Details
          </button>
        </div>
      </section>
    );
  }

  return null;
}
```

- [ ] **Step 2: Run focused test and confirm partial progress.**

Run:

```bash
node --test frontend/tests/mobile-rotated-map-mode.test.mjs
```

Expected: The component source assertions pass. Shell and CSS assertions still fail.

- [ ] **Step 3: Commit the component if working branch policy allows.**

```bash
git add frontend/src/components/RotatedMapSelectionCard.tsx frontend/tests/mobile-rotated-map-mode.test.mjs
git commit -m "feat: add rotated map selection preview"
```

---

## Task 3: Move Rotated Controls Into The Rotated Map HUD

**Files:**
- Modify: `frontend/src/components/MobileMapControls.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Test: `frontend/tests/mobile-rotated-map-mode.test.mjs`

- [ ] **Step 1: Simplify `MobileMapControls` props.**

In `frontend/src/components/MobileMapControls.tsx`, replace the lucide import:

```ts
import { Locate, X } from "lucide-react";
```

Replace the props type with:

```ts
type Props = {
  presentationMode: MapPresentationMode;
  onExitRotated: () => void;
  onRecenter: () => void;
};
```

Replace the function signature with:

```tsx
export function MobileMapControls({
  presentationMode,
  onExitRotated,
  onRecenter,
}: Props) {
```

Remove `hasSelection`, `onOpenDetails`, and the conditional Details button block.

- [ ] **Step 2: Import the rotated selection card.**

In `frontend/src/components/LineWatchShell.tsx`, add:

```ts
import { RotatedMapSelectionCard } from "./RotatedMapSelectionCard";
```

- [ ] **Step 3: Add a clear-selection handler.**

Near `handleOpenRotatedSelectionDetails`, add:

```ts
  const handleClearRotatedSelection = useCallback(() => {
    setSelection(null);
    setSelectedStationId(null);
    setMobileInspectorDetent("map-focus");
  }, [setMobileInspectorDetent, setSelectedStationId, setSelection]);
```

- [ ] **Step 4: Gate station detail out of rotated mode.**

Replace:

```tsx
      {!showClosedScreen && selectedStationId && (
```

with:

```tsx
      {!showClosedScreen && !rotatedMapMode && selectedStationId && (
```

This exact condition is required by the source test.

- [ ] **Step 5: Move rotated controls into `<main>`.**

Inside `<main>`, immediately after the closed-screen peek chip block and before `</main>`, add:

```tsx
        {rotatedMapMode ? (
          <div className="rotated-map-hud" aria-label="Rotated map controls">
            <MobileMapControls
              presentationMode="rotated-landscape"
              onExitRotated={() => setMapPresentationMode("standard")}
              onRecenter={() => setRecenterSignal((prev) => prev + 1)}
            />
            <RotatedMapSelectionCard
              selection={selection}
              selectedStationId={selectedStationId}
              stations={stationSummaries}
              onOpenDetails={handleOpenRotatedSelectionDetails}
              onClearSelection={handleClearRotatedSelection}
            />
          </div>
        ) : null}
```

Because this HUD is inside the rotated `<main>`, it inherits the map's landscape orientation.

- [ ] **Step 6: Remove the old rotated controls render outside `<main>`.**

Delete this block from below the mobile impact inspector:

```tsx
      {!showClosedScreen && isMobile && activeView === "map" && !accountDialogMode && !mobileInspectorOpen ? (
        <MobileMapControls
          presentationMode={rotatedMapMode ? "rotated-landscape" : "standard"}
          hasSelection={Boolean(selection || selectedStationId)}
          onExitRotated={() => setMapPresentationMode("standard")}
          onRecenter={() => setRecenterSignal((prev) => prev + 1)}
          onOpenDetails={handleOpenRotatedSelectionDetails}
        />
      ) : null}
```

The standard portrait `Rotate map` button in the header stays unchanged.

- [ ] **Step 7: Run focused source tests.**

Run:

```bash
node --test frontend/tests/mobile-rotated-map-mode.test.mjs
```

Expected: Shell and controls source tests pass except any remaining CSS assertions.

- [ ] **Step 8: Commit the shell/control changes if working branch policy allows.**

```bash
git add frontend/src/components/MobileMapControls.tsx frontend/src/components/LineWatchShell.tsx frontend/tests/mobile-rotated-map-mode.test.mjs
git commit -m "feat: render rotated map controls inside map stage"
```

---

## Task 4: Style The Rotated HUD And Preview Card

**Files:**
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/tests/mobile-rotated-map-mode.test.mjs`
- Test: `frontend/tests/mobile-bottom-sheet-ux.test.mjs`

- [ ] **Step 1: Replace fixed rotated controls behavior.**

In `frontend/src/app/globals.css`, find the mobile `.mobile-map-controls` block. Keep the base `.mobile-map-controls { display: none; }`, but replace any fixed positioning for `.mobile-map-controls[data-mode="rotated-landscape"]` with HUD-scoped styles:

```css
@media (max-width: 767px) {
  .rotated-map-hud {
    display: none;
  }

  .linewatch-shell.mobile-map-rotated .rotated-map-hud {
    display: flex;
    flex-direction: column;
    gap: 8px;
    left: max(10px, env(safe-area-inset-left, 0px));
    pointer-events: none;
    position: absolute;
    right: max(10px, env(safe-area-inset-right, 0px));
    top: max(10px, env(safe-area-inset-top, 0px));
    z-index: 80;
  }

  .linewatch-shell.mobile-map-rotated .rotated-map-hud > * {
    pointer-events: auto;
  }

  .linewatch-shell.mobile-map-rotated .rotated-map-hud .mobile-map-controls {
    align-items: center;
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid rgba(15, 23, 42, 0.16);
    border-radius: 8px;
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.24);
    display: flex;
    gap: 8px;
    justify-content: stretch;
    padding: 6px;
    position: static;
    width: 100%;
  }

  .dark .linewatch-shell.mobile-map-rotated .rotated-map-hud .mobile-map-controls,
  .high-contrast .linewatch-shell.mobile-map-rotated .rotated-map-hud .mobile-map-controls {
    background: rgba(10, 12, 16, 0.94);
    border-color: rgba(255, 255, 255, 0.18);
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.42);
  }

  .linewatch-shell.mobile-map-rotated .rotated-map-hud .mobile-map-control-button {
    flex: 1 1 0;
  }
}
```

- [ ] **Step 2: Add preview card styles.**

Add these styles after the rotated HUD styles:

```css
@media (max-width: 767px) {
  .rotated-map-selection-card {
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid rgba(15, 23, 42, 0.16);
    border-left: 5px solid #64748b;
    border-radius: 8px;
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.24);
    color: #0f172a;
    display: flex;
    flex-direction: column;
    gap: 7px;
    max-width: min(560px, 100%);
    padding: 10px;
  }

  .dark .rotated-map-selection-card,
  .high-contrast .rotated-map-selection-card {
    background: rgba(10, 12, 16, 0.95);
    border-color: rgba(255, 255, 255, 0.18);
    color: #ffffff;
  }

  .rotated-map-selection-card-critical {
    border-left-color: #ef4444;
  }

  .rotated-map-selection-card-warning {
    border-left-color: #f59e0b;
  }

  .rotated-map-selection-card-rsz {
    border-left-color: #f97316;
  }

  .rotated-map-selection-card-planned {
    border-left-color: #3b82f6;
  }

  .rotated-map-selection-card-normal {
    border-left-color: #10b981;
  }

  .rotated-map-selection-card-header {
    align-items: flex-start;
    display: flex;
    gap: 10px;
    justify-content: space-between;
    min-width: 0;
  }

  .rotated-map-selection-card-title-group {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .rotated-map-selection-card-kicker {
    color: #64748b;
    font-size: 10px;
    font-weight: 950;
    text-transform: uppercase;
  }

  .dark .rotated-map-selection-card-kicker,
  .high-contrast .rotated-map-selection-card-kicker {
    color: rgba(226, 232, 240, 0.74);
  }

  .rotated-map-selection-card h2 {
    font-size: 15px;
    font-weight: 950;
    line-height: 1.14;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .rotated-map-selection-icon-button {
    align-items: center;
    border: 1px solid rgba(15, 23, 42, 0.14);
    border-radius: 8px;
    display: inline-flex;
    flex: 0 0 auto;
    height: 34px;
    justify-content: center;
    width: 34px;
  }

  .dark .rotated-map-selection-icon-button,
  .high-contrast .rotated-map-selection-icon-button {
    border-color: rgba(255, 255, 255, 0.18);
  }

  .rotated-map-selection-card-meta,
  .rotated-map-selection-card-direction {
    align-items: center;
    color: #475569;
    display: flex;
    flex-wrap: wrap;
    font-size: 11px;
    font-weight: 850;
    gap: 7px;
  }

  .dark .rotated-map-selection-card-meta,
  .high-contrast .rotated-map-selection-card-meta,
  .dark .rotated-map-selection-card-direction,
  .high-contrast .rotated-map-selection-card-direction {
    color: rgba(226, 232, 240, 0.78);
  }

  .rotated-map-selection-line-badge {
    background: rgba(15, 23, 42, 0.08);
    border-radius: 6px;
    color: #0f172a;
    padding: 3px 6px;
  }

  .dark .rotated-map-selection-line-badge,
  .high-contrast .rotated-map-selection-line-badge {
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
  }

  .rotated-map-selection-card-location {
    color: #1e293b;
    font-size: 12px;
    font-weight: 750;
    line-height: 1.25;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .dark .rotated-map-selection-card-location,
  .high-contrast .rotated-map-selection-card-location {
    color: rgba(248, 250, 252, 0.9);
  }

  .rotated-map-selection-card-actions {
    display: grid;
    gap: 8px;
    grid-template-columns: 1fr 1.25fr;
    margin-top: 2px;
  }

  .rotated-map-selection-action {
    align-items: center;
    border-radius: 8px;
    display: inline-flex;
    font-size: 12px;
    font-weight: 950;
    gap: 6px;
    justify-content: center;
    min-height: 38px;
    padding: 8px 10px;
  }

  .rotated-map-selection-action.secondary {
    border: 1px solid rgba(15, 23, 42, 0.14);
    color: #334155;
  }

  .rotated-map-selection-action.primary {
    background: #2563eb;
    color: #ffffff;
  }

  .dark .rotated-map-selection-action.secondary,
  .high-contrast .rotated-map-selection-action.secondary {
    border-color: rgba(255, 255, 255, 0.18);
    color: rgba(248, 250, 252, 0.9);
  }
}
```

- [ ] **Step 3: Add CSS safety gates for portrait detail surfaces.**

Add:

```css
@media (max-width: 767px) {
  .linewatch-shell.mobile-map-rotated .station-detail-panel,
  .linewatch-shell.mobile-map-rotated .mobile-impact-inspector {
    display: none !important;
  }
}
```

- [ ] **Step 4: Run focused source tests.**

Run:

```bash
node --test frontend/tests/mobile-rotated-map-mode.test.mjs frontend/tests/mobile-bottom-sheet-ux.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit CSS if working branch policy allows.**

```bash
git add frontend/src/app/globals.css frontend/tests/mobile-rotated-map-mode.test.mjs frontend/tests/mobile-bottom-sheet-ux.test.mjs
git commit -m "style: add rotated map selection HUD"
```

---

## Task 5: Update Mobile Rotated Smoke Coverage

**Files:**
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Replace the rotated smoke test.**

In `frontend/tests/smoke/dashboard.spec.ts`, replace the current test named `"mobile rotated map mode uses a landscape viewport and keeps map details reachable"` with:

```ts
test("mobile rotated map mode keeps station and impact selections in the rotated HUD", async ({ page, request, isMobile }) => {
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
  await expect(page.locator("[data-rotated-map-selection-card]")).toBeVisible();
  await expect(page.locator("[data-rotated-map-selection-card]")).toContainText("Selected Service Impact");
  await expect(page.locator("[data-rotated-map-selection-card]")).toContainText("Sheppard-Yonge");

  await page.locator("[data-rotated-map-selection-card]").getByRole("button", { name: "Details" }).click();
  await expect(shell).not.toHaveClass(/mobile-map-rotated/);
  const inspector = page.locator("[data-mobile-impact-inspector]");
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText("Delay");

  await inspector.getByRole("button", { name: "Unfocus impact" }).click();
  await page.getByRole("button", { name: "Rotate map" }).click();
  await page.getByRole("button", { name: "Stub Station station details" }).click();
  await expect(page.locator("[data-rotated-map-selection-card]")).toBeVisible();
  await expect(page.locator("[data-rotated-map-selection-card]")).toContainText("Selected Station");
  await expect(page.locator("[data-rotated-map-selection-card]")).toContainText("Stub Station");
  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toHaveCount(0);

  await page.locator("[data-rotated-map-selection-card]").getByRole("button", { name: "Details" }).click();
  await expect(shell).not.toHaveClass(/mobile-map-rotated/);
  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toBeVisible();
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

Expected: PASS. If this fails because preview/stub services are not running, record the exact failure and still run `test:fixtures`, `typecheck`, and `lint`.

- [ ] **Step 4: Commit the smoke update if working branch policy allows.**

```bash
git add frontend/tests/smoke/dashboard.spec.ts
git commit -m "test: cover rotated map selection HUD"
```

---

## Task 6: Final Verification

**Files:**
- Read: all modified frontend files
- Modify: only files with verification failures

- [ ] **Step 1: Run frontend fixture/source tests.**

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

- [ ] **Step 4: Run production build because this changes substantial mobile UI.**

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 5: Run smoke tests when services are available.**

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS. If unavailable, report the exact service/environment failure.

- [ ] **Step 6: Manual mobile verification.**

Start the app if needed:

```bash
npm --prefix frontend run dev
```

Check a mobile viewport:

```text
1. Standard portrait mode still shows bottom nav and status peek.
2. Standard station tap still opens the portrait station detail panel.
3. Standard impact tap or Show on Map still opens the mobile impact inspector.
4. Rotate map enters rotated presentation mode.
5. Rotated Exit and Center controls are visually oriented with the rotated map.
6. Rotated station tap shows only the rotated selection preview, not StationDetailPanel.
7. Rotated impact tap shows only the rotated selection preview, not MobileImpactInspector.
8. Rotated preview Clear clears the selection and stays rotated.
9. Rotated preview Details exits rotated mode and opens the correct portrait detail surface.
10. No translucent portrait station/detail menu appears over the rotated map.
```

- [ ] **Step 7: Final status.**

```bash
git status --short
```

Expected: only intended changes plus any unrelated user changes that were already present.

## Verification Commands Summary

Minimum required:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Also run for this mobile UI work when available:

```bash
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

## Expected Changed Files

```text
frontend/src/components/RotatedMapSelectionCard.tsx
frontend/src/components/MobileMapControls.tsx
frontend/src/components/LineWatchShell.tsx
frontend/src/app/globals.css
frontend/tests/mobile-rotated-map-mode.test.mjs
frontend/tests/mobile-bottom-sheet-ux.test.mjs
frontend/tests/smoke/dashboard.spec.ts
```

Do not edit backend files for this plan.

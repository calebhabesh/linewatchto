# Mobile Show On Map Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mobile `Show on Map` functional by opening a focused split view: the selected issue or station remains visible on the map while a scrollable detail sheet stays available below it.

**Architecture:** Keep `LineWatchShell` as the orchestration boundary and keep desktop behavior unchanged. Add a mobile-only inspector state and component for selected impacts, reuse the existing `StationDetailPanel` for selected stations, and resize the actual map viewport while the inspector is open so map centering targets the visible area. Update `InteractiveTtcMap` to re-run selected-target focusing when the inspector detent changes.

**Tech Stack:** Next.js App Router, React, TypeScript, existing Tailwind utility classes, CSS in `frontend/src/app/globals.css`, Node built-in fixture/source tests, Playwright Chromium smoke tests.

---

## Read This First

The working tree may already contain mobile-bottom-sheet changes. Preserve them. Do not revert unrelated edits in these files:

```text
frontend/src/components/LineWatchShell.tsx
frontend/src/components/InteractiveTtcMap.tsx
frontend/src/components/SelectedImpactPeek.tsx
frontend/src/components/ActiveAlertsPanel.tsx
frontend/src/components/DelaysPanel.tsx
frontend/src/components/ReducedSpeedZonesPanel.tsx
frontend/src/components/PlannedClosuresPanel.tsx
frontend/src/components/StationDetailPanel.tsx
frontend/src/app/globals.css
frontend/tests/drawer-layout.test.mjs
frontend/tests/mobile-bottom-sheet-ux.test.mjs
frontend/tests/smoke/dashboard.spec.ts
```

Current mobile behavior is close but incomplete:

- Impact cards call `onSelectImpact(...)` from `Show on Map`.
- `LineWatchShell.handleMapSelectImpact` keeps mobile users on `activeView === "map"`.
- `InteractiveTtcMap` already zooms to `selection` or `selectedStationId`.
- `SelectedImpactPeek` shows a compact mobile card, but it does not provide enough scrollable detail and does not reshape the map viewport.
- `StationDetailPanel` already behaves like a mobile bottom sheet, but it should participate in the same inspector layout and hide bottom nav/status controls while open.

## Product Behavior

Mobile `Show on Map` should work like this:

- Impact selected from a card, overlap ref, or map overlay:
  - Enter mobile inspector mode.
  - Default split is map-focused: about 55% map and 45% detail sheet.
  - Hide bottom nav, status peek, and mobile legend.
  - Keep the selected map overlay highlighted and zoomed into view.
  - Show a scrollable impact detail sheet with title, route, description, source, started/updated timing, overlaps, and actions.

- Station selected from map or search:
  - Enter mobile inspector mode.
  - Default split is station-detail-focused: about 45% map and 55% station sheet.
  - Reuse `StationDetailPanel` and override only its mobile layout through shell classes.

- Full detail action:
  - Impact inspector has `View Full Details`.
  - This opens the existing category sheet (`Active Alerts`, `Delays`, `Reduced Speed Zones`, or `Upcoming Closures`) with the selected card highlighted.
  - Desktop remains unchanged.

## Non-Goals

- Do not redesign desktop.
- Do not change backend APIs.
- Do not add dependencies.
- Do not rewrite map geometry or SVG overlay rendering.
- Do not claim live TTC status when fixture/fallback/stale data is shown.
- Do not implement draggable sheet gestures in this slice. Use explicit buttons.

## Files To Create

- `frontend/src/components/MobileImpactInspector.tsx`
  - Mobile-only selected-impact detail sheet.
- `frontend/tests/mobile-show-on-map-inspector.test.mjs`
  - Source-level guardrails for the inspector state, component, CSS, and map focus signal.

## Files To Modify

- `frontend/src/components/LineWatchShell.tsx`
  - Add mobile inspector detent state.
  - Replace `SelectedImpactPeek` usage with `MobileImpactInspector`.
  - Add shell classes for inspector mode.
  - Hide bottom nav/status peek/mobile legend during inspector mode.
  - Send a layout signal to the map when inspector state or detent changes.

- `frontend/src/components/InteractiveTtcMap.tsx`
  - Re-run focus-to-selection when `layoutResetSignal` changes.
  - Avoid recentering away from a selected impact/station during inspector layout changes.

- `frontend/src/app/globals.css`
  - Add mobile inspector split-view layout.
  - Override `StationDetailPanel` only while shell is in mobile station inspector mode.
  - Style `MobileImpactInspector`.

- `frontend/tests/mobile-bottom-sheet-ux.test.mjs`
  - Add source assertions that inspector mode hides mobile nav/peek and preserves map-first flow.

- `frontend/tests/drawer-layout.test.mjs`
  - Update assertions from compact peek-only behavior to inspector behavior.

- `frontend/tests/smoke/dashboard.spec.ts`
  - Update mobile expectations for map overlay taps and `Show on Map`.
  - Add assertions that map highlight and detail sheet are visible at the same time.

## Task 1: Add Failing Source Tests

**Files:**
- Create: `frontend/tests/mobile-show-on-map-inspector.test.mjs`
- Modify: `frontend/tests/mobile-bottom-sheet-ux.test.mjs`
- Modify: `frontend/tests/drawer-layout.test.mjs`

- [ ] **Step 1: Create the inspector source test**

Create `frontend/tests/mobile-show-on-map-inspector.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const inspectorSource = readFileSync(new URL("../src/components/MobileImpactInspector.tsx", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("mobile Show on Map inspector", () => {
  it("adds explicit mobile inspector state in the shell", () => {
    assert.match(shellSource, /MobileImpactInspector,\s*type MobileInspectorDetent/);
    assert.match(inspectorSource, /export type MobileInspectorDetent = "map-focus" \| "details-focus"/);
    assert.match(shellSource, /mobileInspectorDetent/);
    assert.match(shellSource, /setMobileInspectorDetent\("map-focus"\)/);
    assert.match(shellSource, /setMobileInspectorDetent\("details-focus"\)/);
    assert.match(shellSource, /mobileImpactInspectorOpen/);
    assert.match(shellSource, /mobileStationInspectorOpen/);
    assert.match(shellSource, /mobileInspectorOpen/);
    assert.match(shellSource, /mobile-map-inspector/);
    assert.match(shellSource, /mobile-map-inspector-impact/);
    assert.match(shellSource, /mobile-map-inspector-station/);
  });

  it("renders the selected impact in a mobile-only inspector instead of a tiny peek", () => {
    assert.match(shellSource, /MobileImpactInspector/);
    assert.match(shellSource, /onViewFullDetails=\{\(\) => setActiveView\(viewForImpactSelection\(selection\)\)\}/);
    assert.match(inspectorSource, /data-mobile-impact-inspector/);
    assert.match(inspectorSource, /aria-label="Selected map impact details"/);
    assert.match(inspectorSource, /getSelectedImpactDetails/);
    assert.match(inspectorSource, /View Full Details/);
    assert.match(inspectorSource, /Show more details/);
    assert.match(inspectorSource, /Show more map/);
    assert.match(inspectorSource, /Overlapping:/);
    assert.match(inspectorSource, /MetadataGrid/);
    assert.match(inspectorSource, /ImpactRouteHeader/);
  });

  it("resizes the actual mobile map viewport while preserving focused selection", () => {
    assert.match(shellSource, /mapLayoutSignal/);
    assert.match(shellSource, /layoutResetSignal=\{mapLayoutSignal\}/);
    assert.match(mapSource, /lastFocusLayoutSignalRef/);
    assert.match(mapSource, /layoutResetSignal \?\? 0/);
    assert.match(mapSource, /lastFocusLayoutSignalRef\.current === currentLayoutSignal/);
    assert.match(mapSource, /focusTargetKey/);
  });

  it("defines mobile split-view CSS for impact and station inspectors", () => {
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector/);
    assert.match(globalCss, /--mobile-inspector-height/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector > main/);
    assert.match(globalCss, /\.mobile-impact-inspector/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector-station \.station-detail-panel/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector \.mobile-bottom-nav/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector \.mobile-status-peek/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector \.mobile-legend-pill/);
  });
});
```

- [ ] **Step 2: Extend mobile bottom-sheet UX source assertions**

In `frontend/tests/mobile-bottom-sheet-ux.test.mjs`, add this test near the existing mobile sheet tests:

```js
  it("keeps Show on Map as a split inspector instead of a competing mobile sheet", () => {
    assert.match(shellSource, /MobileImpactInspector/);
    assert.match(shellSource, /mobileInspectorOpen/);
    assert.match(shellSource, /!mobileInspectorOpen && !selectedStationId && !accountDialogMode/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector > main/);
    assert.match(globalCss, /\.mobile-impact-inspector/);
  });
```

- [ ] **Step 3: Update drawer layout assertions**

In `frontend/tests/drawer-layout.test.mjs`, keep existing `Show on Map` and `Unfocus` assertions. Add these assertions to the test that checks card action naming:

```js
    assert.match(shellSource, /MobileImpactInspector/);
    assert.match(shellSource, /mobileImpactInspectorOpen/);
    assert.match(shellSource, /mobileStationInspectorOpen/);
```

- [ ] **Step 4: Run the failing tests**

Run:

```bash
npm --prefix frontend run test:fixtures -- mobile-show-on-map-inspector
```

Expected result before implementation: failure because `MobileImpactInspector.tsx`, inspector state, and CSS do not exist yet.

If the script does not accept a file filter, run:

```bash
npm --prefix frontend run test:fixtures
```

Expected result before implementation: failure in `mobile-show-on-map-inspector.test.mjs`.

## Task 2: Create `MobileImpactInspector`

**Files:**
- Create: `frontend/src/components/MobileImpactInspector.tsx`

- [ ] **Step 1: Add the component**

Create `frontend/src/components/MobileImpactInspector.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Calendar, ChevronDown, ChevronUp, Construction, ExternalLink, X } from "lucide-react";
import type { DashboardData } from "../app/DataContext";
import { useDashboardData } from "../app/DataContext";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import { DelayIcon } from "./DelayIcon";
import { CardSource, ImpactRouteHeader, LineBadge, MetadataGrid } from "./ImpactCardFields";
import { getOverlappingImpactRefs, OverlappingImpactRefs } from "./ImpactOverlapRefs";

export type MobileInspectorDetent = "map-focus" | "details-focus";

type SelectedImpactDetails = {
  id: string;
  kind: ImpactKind;
  categoryLabel: string;
  tone: "suspension" | "delay" | "reduced-speed-zone" | "planned-closure";
  icon: ReactNode;
  lineId: string;
  lineNumber: string;
  title: string;
  location: string;
  displayDirection?: string | null;
  description?: string;
  source: string;
  shuttle?: boolean;
  activeNow?: boolean;
  window?: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  updatedAgo?: string | null;
  cause?: string | null;
  resolution?: string | null;
  reason?: string | null;
  targetRemoval?: string | null;
  extraRows?: Array<{ label: string; value?: string | null }>;
  segmentIds: string[];
};

type Props = {
  selection: NonNullable<ImpactSelection>;
  detent: MobileInspectorDetent;
  onChangeDetent: (detent: MobileInspectorDetent) => void;
  onUnfocus: () => void;
  onViewFullDetails: () => void;
  onSelectImpact: (selection: ImpactSelection) => void;
};

function formatSpeed(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.toLowerCase().includes("km/h") ? value : `${value} km/h`;
}

function fallbackLineNumber(lineId: string) {
  return lineId.replace("line-", "");
}

export function getSelectedImpactDetails(
  selection: NonNullable<ImpactSelection>,
  data: Pick<DashboardData, "activeAlerts" | "delays" | "reducedSpeedZones" | "plannedClosures">,
): SelectedImpactDetails | null {
  if (selection.kind === "suspension") {
    const alert = data.activeAlerts.find((item) => item.id === selection.id);
    if (!alert) return null;
    return {
      id: alert.id,
      kind: "suspension",
      categoryLabel: alert.severity === "planned" ? "Active Closure" : "Active Alert",
      tone: "suspension",
      icon: <AlertTriangle size={16} className="text-red-500" />,
      lineId: alert.lineId,
      lineNumber: alert.lineNumber,
      title: alert.title,
      location: alert.location,
      displayDirection: alert.displayDirection,
      description: alert.description,
      source: alert.source,
      shuttle: alert.shuttle,
      startedAt: alert.startedAt,
      updatedAt: alert.updatedAt,
      updatedAgo: alert.updatedAgo,
      cause: alert.cause,
      resolution: alert.resolution,
      reason: alert.reason,
      targetRemoval: alert.targetRemoval,
      segmentIds: alert.affectedSegmentIds ?? [],
    };
  }

  if (selection.kind === "delay") {
    const delay = data.delays.find((item) => item.id === selection.id);
    if (delay) {
      return {
        id: delay.id,
        kind: "delay",
        categoryLabel: "Delay",
        tone: "delay",
        icon: <DelayIcon size={16} className="text-amber-500" />,
        lineId: delay.lineId,
        lineNumber: delay.lineNumber,
        title: delay.title,
        location: delay.location,
        displayDirection: delay.displayDirection,
        description: delay.description,
        source: delay.source,
        startedAt: delay.startedAt,
        updatedAt: delay.updatedAt,
        cause: delay.cause,
        segmentIds: delay.affectedSegmentIds ?? [],
      };
    }

    const alertDelay = data.activeAlerts.find((item) => item.id === selection.id && item.severity === "delay");
    if (!alertDelay) return null;
    return {
      id: alertDelay.id,
      kind: "delay",
      categoryLabel: "Delay",
      tone: "delay",
      icon: <DelayIcon size={16} className="text-amber-500" />,
      lineId: alertDelay.lineId,
      lineNumber: alertDelay.lineNumber,
      title: alertDelay.title,
      location: alertDelay.location,
      displayDirection: alertDelay.displayDirection,
      description: alertDelay.description,
      source: alertDelay.source,
      shuttle: alertDelay.shuttle,
      startedAt: alertDelay.startedAt,
      updatedAt: alertDelay.updatedAt,
      updatedAgo: alertDelay.updatedAgo,
      cause: alertDelay.cause,
      resolution: alertDelay.resolution,
      reason: alertDelay.reason,
      targetRemoval: alertDelay.targetRemoval,
      segmentIds: alertDelay.affectedSegmentIds ?? [],
    };
  }

  if (selection.kind === "reduced-speed-zone") {
    const zone = data.reducedSpeedZones.find((item) => item.id === selection.id);
    if (!zone) return null;
    return {
      id: zone.id,
      kind: "reduced-speed-zone",
      categoryLabel: "Reduced Speed Zone",
      tone: "reduced-speed-zone",
      icon: <Construction size={16} className="rsz-tone" />,
      lineId: zone.lineId,
      lineNumber: zone.lineNumber,
      title: zone.title,
      location: zone.location,
      displayDirection: zone.displayDirection,
      description: zone.description,
      source: zone.source,
      startedAt: zone.startedAt,
      updatedAt: zone.updatedAt,
      updatedAgo: zone.updatedAgo,
      cause: zone.cause,
      resolution: zone.resolution,
      reason: zone.reason,
      targetRemoval: zone.targetRemoval,
      extraRows: [
        { label: "Reduced speed", value: formatSpeed(zone.reducedSpeed) },
        { label: "Average speed", value: formatSpeed(zone.averageSpeed) },
      ],
      segmentIds: zone.affectedSegmentIds ?? [],
    };
  }

  const activeClosure = data.activeAlerts.find((item) => item.id === selection.id);
  if (activeClosure) {
    return {
      id: activeClosure.id,
      kind: "planned-closure",
      categoryLabel: "Active Closure",
      tone: "suspension",
      icon: <AlertTriangle size={16} className="text-red-500" />,
      lineId: activeClosure.lineId,
      lineNumber: activeClosure.lineNumber,
      title: activeClosure.title,
      location: activeClosure.location,
      displayDirection: activeClosure.displayDirection,
      description: activeClosure.description,
      source: activeClosure.source,
      shuttle: activeClosure.shuttle,
      startedAt: activeClosure.startedAt,
      updatedAt: activeClosure.updatedAt,
      updatedAgo: activeClosure.updatedAgo,
      cause: activeClosure.cause,
      resolution: activeClosure.resolution,
      reason: activeClosure.reason,
      targetRemoval: activeClosure.targetRemoval,
      segmentIds: activeClosure.affectedSegmentIds ?? [],
    };
  }

  const closure = data.plannedClosures.find((item) => item.id === selection.id);
  if (!closure) return null;
  return {
    id: closure.id,
    kind: "planned-closure",
    categoryLabel: closure.activeNow ? "Active Closure Window" : "Upcoming Closure",
    tone: "planned-closure",
    icon: <Calendar size={16} className="text-blue-500" />,
    lineId: closure.lineId,
    lineNumber: closure.lineNumber,
    title: closure.title,
    location: closure.location,
    displayDirection: closure.displayDirection,
    description: closure.description,
    source: closure.source,
    shuttle: closure.shuttle,
    activeNow: closure.activeNow,
    window: closure.window,
    startedAt: closure.startedAt,
    updatedAt: closure.updatedAt,
    updatedAgo: closure.updatedAgo,
    cause: closure.cause,
    resolution: closure.resolution,
    reason: closure.reason,
    targetRemoval: closure.targetRemoval,
    segmentIds: closure.previewSegmentIds ?? [],
  };
}

function toneClassName(tone: SelectedImpactDetails["tone"]) {
  switch (tone) {
    case "suspension":
      return "mobile-impact-inspector-suspension";
    case "delay":
      return "mobile-impact-inspector-delay";
    case "reduced-speed-zone":
      return "mobile-impact-inspector-rsz";
    case "planned-closure":
      return "mobile-impact-inspector-planned";
  }
}

export function MobileImpactInspector({
  selection,
  detent,
  onChangeDetent,
  onUnfocus,
  onViewFullDetails,
  onSelectImpact,
}: Props) {
  const data = useDashboardData();
  const details = getSelectedImpactDetails(selection, data);

  if (!details) return null;

  const overlappingImpacts = getOverlappingImpactRefs(
    { kind: details.kind, id: details.id, segmentIds: details.segmentIds },
    data,
  );
  const expanded = detent === "details-focus";

  return (
    <aside
      className={`mobile-impact-inspector ${toneClassName(details.tone)} mobile-impact-inspector-${detent}`}
      data-mobile-impact-inspector
      role="complementary"
      aria-label="Selected map impact details"
    >
      <div className="mobile-impact-inspector-header">
        <div className="mobile-impact-inspector-title-row">
          <LineBadge lineId={details.lineId} lineNumber={details.lineNumber || fallbackLineNumber(details.lineId)} />
          <div className="mobile-impact-inspector-title-copy">
            <span className="mobile-impact-inspector-kicker">
              {details.icon}
              {details.categoryLabel}
            </span>
            <h2>{details.title}</h2>
          </div>
        </div>
        <button type="button" onClick={onUnfocus} className="mobile-impact-inspector-icon-button" aria-label="Unfocus impact">
          <X size={20} />
        </button>
      </div>

      <div className="mobile-impact-inspector-scroll">
        <ImpactRouteHeader location={details.location} direction={details.displayDirection} />

        {details.window ? (
          <p className="mobile-impact-inspector-window">{details.window}</p>
        ) : null}

        {details.description ? (
          <p className="mobile-impact-inspector-description">{details.description}</p>
        ) : null}

        <div className="mobile-impact-inspector-badges">
          <CardSource source={details.source} />
          {details.shuttle ? <span className="mobile-impact-inspector-badge shuttle">Shuttle</span> : null}
          {details.activeNow ? <span className="mobile-impact-inspector-badge active-now">Active now</span> : null}
        </div>

        <OverlappingImpactRefs
          overlaps={overlappingImpacts}
          onSelectImpact={onSelectImpact}
          label="Overlapping:"
        />

        <MetadataGrid
          className="mobile-impact-inspector-metadata"
          cause={details.cause}
          resolution={details.resolution}
          reason={details.reason}
          targetRemoval={details.targetRemoval}
          startedAt={details.startedAt}
          updatedAt={details.updatedAt}
          updatedAgo={details.updatedAgo}
          extraRows={details.extraRows}
        />
      </div>

      <div className="mobile-impact-inspector-actions">
        <button
          type="button"
          onClick={() => onChangeDetent(expanded ? "map-focus" : "details-focus")}
          className="mobile-impact-inspector-action secondary"
          aria-label={expanded ? "Show more map" : "Show more details"}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          {expanded ? "More Map" : "More Details"}
        </button>
        <button
          type="button"
          onClick={onViewFullDetails}
          className="mobile-impact-inspector-action primary"
        >
          <ExternalLink size={16} />
          View Full Details
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Run type-aware tests enough to catch syntax issues**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected at this point: the new component should parse, but source tests still fail until shell, map, and CSS changes are added.

## Task 3: Wire Inspector State In `LineWatchShell`

**Files:**
- Modify: `frontend/src/components/LineWatchShell.tsx`

- [ ] **Step 1: Replace the compact selected peek import**

Change imports:

```tsx
-import { SelectedImpactPeek } from "./SelectedImpactPeek";
+import { MobileImpactInspector, type MobileInspectorDetent } from "./MobileImpactInspector";
```

Do not delete `SelectedImpactPeek.tsx` in this task. Leaving it unused is lower risk than removing a file during this mobile behavior slice.

- [ ] **Step 2: Add inspector state near other mobile state**

After the `lastActiveViewRef` declaration, add:

```tsx
  const [mobileInspectorDetent, setMobileInspectorDetent] = useState<MobileInspectorDetent>("map-focus");
  const [mapLayoutSignal, setMapLayoutSignal] = useState(0);
```

- [ ] **Step 3: Set the correct default detent from navigation handlers**

Update `handleMapSelectImpact` so mobile impact selection enters map-focused inspector mode:

```tsx
  const handleMapSelectImpact = useCallback((nextSelection: ImpactSelection) => {
    setSelectedStationId(null);
    setCommutePathPreview(null);
    if (!nextSelection) {
      setSelection(null);
      return;
    }
    setSelection(nextSelection);
    if (isMobile) {
      setMobileInspectorDetent("map-focus");
      setActiveView("map");
      return;
    }
    setActiveView(viewForImpactSelection(nextSelection));
  }, [setSelectedStationId, setCommutePathPreview, setSelection, setActiveView, viewForImpactSelection, isMobile]);
```

Update `handleSelectStationId` so mobile station selection enters detail-focused inspector mode:

```tsx
  const handleSelectStationId = useCallback((id: string | null) => {
    setSelectedStationId(id);
    setSelection(null);
    setCommutePathPreview(null);
    if (id) {
      if (isMobile) {
        setMobileInspectorDetent("details-focus");
      }
      setActiveView("map");
    }
  }, [setSelectedStationId, setSelection, setCommutePathPreview, setActiveView, isMobile]);
```

Update `onMobileNavSelect` so it closes inspector state:

```tsx
  const onMobileNavSelect = useCallback((key: MobileNavKey) => {
    setSelection(null);
    setSelectedStationId(null);
    setCommutePathPreview(null);
    setMobileInspectorDetent("map-focus");
    switch (key) {
      case "status":
        setActiveView("status");
        return;
      case "search":
        setActiveView("search");
        return;
      case "commutes":
        setActiveView("commutes");
        return;
      case "more":
        setActiveView("more");
        return;
      case "map":
      default:
        setActiveView("map");
    }
  }, [setActiveView, setCommutePathPreview, setSelectedStationId, setSelection]);
```

Update `handleMobileSheetClose`:

```tsx
  const handleMobileSheetClose = useCallback(() => {
    setActiveView("map");
    setSelection(null);
    setMobileInspectorDetent("map-focus");
  }, [setActiveView, setSelection]);
```

- [ ] **Step 4: Define inspector booleans and shell classes**

After `activeFloatingPanel`, add:

```tsx
  const mobileImpactInspectorOpen =
    isMobile &&
    activeView === "map" &&
    Boolean(selection) &&
    !selectedStationId &&
    !accountDialogMode &&
    !commutePathPreview &&
    !showClosedScreen;

  const mobileStationInspectorOpen =
    isMobile &&
    activeView === "map" &&
    Boolean(selectedStationId) &&
    !accountDialogMode &&
    !showClosedScreen;

  const mobileInspectorOpen = mobileImpactInspectorOpen || mobileStationInspectorOpen;

  const shellInspectorClasses = mobileInspectorOpen
    ? [
        "mobile-map-inspector",
        mobileImpactInspectorOpen ? "mobile-map-inspector-impact" : "mobile-map-inspector-station",
        `mobile-map-inspector-${mobileInspectorDetent}`,
      ].join(" ")
    : "";
```

- [ ] **Step 5: Trigger map layout refocus on inspector changes**

Add this effect after the inspector booleans:

```tsx
  useEffect(() => {
    if (!mobileInspectorOpen) return;

    const timer = window.setTimeout(() => {
      setMapLayoutSignal((current) => current + 1);
    }, 40);

    return () => window.clearTimeout(timer);
  }, [
    mobileInspectorOpen,
    mobileInspectorDetent,
    selection?.kind,
    selection?.id,
    selectedStationId,
  ]);
```

- [ ] **Step 6: Add shell classes to the root**

Change the root `linewatch-shell` class from:

```tsx
<div className={`linewatch-shell relative w-full h-screen overflow-hidden transition-colors duration-500 ${(isDark || highContrast) ? "dark bg-[#0d0808] text-slate-100" : "bg-slate-50 text-slate-900"} ${highContrast ? "high-contrast" : ""} ${reducedMotion ? "motion-paused" : ""} ${mobilePerformanceMode ? "mobile-performance-mode" : ""}`}>
```

to:

```tsx
<div className={`linewatch-shell relative w-full h-screen overflow-hidden transition-colors duration-500 ${(isDark || highContrast) ? "dark bg-[#0d0808] text-slate-100" : "bg-slate-50 text-slate-900"} ${highContrast ? "high-contrast" : ""} ${reducedMotion ? "motion-paused" : ""} ${mobilePerformanceMode ? "mobile-performance-mode" : ""} ${shellInspectorClasses}`}>
```

- [ ] **Step 7: Pass layout signal to the map**

Change:

```tsx
          layoutResetSignal={0}
```

to:

```tsx
          layoutResetSignal={mapLayoutSignal}
```

- [ ] **Step 8: Render `MobileLegend` only when inspector is not open**

Change:

```tsx
        {!showClosedScreen && <MobileLegend />}
```

to:

```tsx
        {!showClosedScreen && !mobileInspectorOpen && <MobileLegend />}
```

- [ ] **Step 9: Replace `SelectedImpactPeek` usage**

Replace the current mobile status/selected peek block:

```tsx
      {!showClosedScreen && activeView === "map" && !selectedStationId && !accountDialogMode && !commutePathPreview ? (
        selection ? (
          <SelectedImpactPeek
            selection={selection}
            dashboardData={displayData}
            onUnfocus={() => setSelection(null)}
            onViewDetails={() => setActiveView(viewForImpactSelection(selection))}
          />
        ) : (
          <MobileStatusPeek
            lineStatuses={lineStatuses}
            activeAlertCount={activeAlerts.length}
            delayCount={delays.length}
            reducedSpeedZoneCount={reducedSpeedZones.length}
            plannedClosureCount={plannedClosures.length}
            pollText={pollText}
            dataSource={displayData.dataSource}
            onOpenStatus={() => setActiveView("status")}
            onOpenCategory={(view) => {
              setSelection(null);
              setActiveView(view);
            }}
            onRecenter={() => setRecenterSignal((prev) => prev + 1)}
          />
        )
      ) : null}
```

with:

```tsx
      {!showClosedScreen && mobileImpactInspectorOpen && selection ? (
        <MobileImpactInspector
          selection={selection}
          detent={mobileInspectorDetent}
          onChangeDetent={setMobileInspectorDetent}
          onUnfocus={() => {
            setSelection(null);
            setMobileInspectorDetent("map-focus");
          }}
          onViewFullDetails={() => setActiveView(viewForImpactSelection(selection))}
          onSelectImpact={handleMapSelectImpact}
        />
      ) : null}

      {!showClosedScreen && activeView === "map" && !selection && !selectedStationId && !accountDialogMode && !commutePathPreview ? (
        <MobileStatusPeek
          lineStatuses={lineStatuses}
          activeAlertCount={activeAlerts.length}
          delayCount={delays.length}
          reducedSpeedZoneCount={reducedSpeedZones.length}
          plannedClosureCount={plannedClosures.length}
          pollText={pollText}
          dataSource={displayData.dataSource}
          onOpenStatus={() => setActiveView("status")}
          onOpenCategory={(view) => {
            setSelection(null);
            setActiveView(view);
          }}
          onRecenter={() => setRecenterSignal((prev) => prev + 1)}
        />
      ) : null}
```

- [ ] **Step 10: Hide bottom nav during inspector mode**

Change:

```tsx
      {!showClosedScreen && !selectedStationId && !accountDialogMode ? (
```

to:

```tsx
      {!showClosedScreen && !mobileInspectorOpen && !selectedStationId && !accountDialogMode ? (
```

- [ ] **Step 11: Run tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected at this point: shell/source assertions may pass; CSS and map refocus assertions may still fail until later tasks.

## Task 4: Re-Focus The Map When Inspector Layout Changes

**Files:**
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`

- [ ] **Step 1: Track the layout signal used for the last focus**

Find:

```tsx
  const lastFocusedTargetKeyRef = useRef<string | null>(null);
```

Add immediately after it:

```tsx
  const lastFocusLayoutSignalRef = useRef(0);
```

- [ ] **Step 2: Do not recenter away from an active focus target during layout reset**

Change the layout reset effect from:

```tsx
  useEffect(() => {
    if (!layoutResetSignal || loadState !== "ready") return;

    const resetTimer = window.setTimeout(() => recenter(), 320);
    return () => window.clearTimeout(resetTimer);
  }, [layoutResetSignal, loadState, recenter]);
```

to:

```tsx
  useEffect(() => {
    if (!layoutResetSignal || loadState !== "ready" || focusTargetKey) return;

    const resetTimer = window.setTimeout(() => recenter(), 320);
    return () => window.clearTimeout(resetTimer);
  }, [layoutResetSignal, loadState, recenter, focusTargetKey]);
```

- [ ] **Step 3: Include layout signal in the focus effect**

Inside the large focus effect that zooms to `selection` or `selectedStationId`, add this after `if (loadState !== "ready") return;`:

```tsx
    const currentLayoutSignal = layoutResetSignal ?? 0;
```

Change the no-target branch from:

```tsx
    if (!focusTargetKey) {
      if (lastFocusedTargetKeyRef.current !== null) {
        lastFocusedTargetKeyRef.current = null;
        recenter();
      }
      return;
    }

    if (lastFocusedTargetKeyRef.current === focusTargetKey) {
      return;
    }
```

to:

```tsx
    if (!focusTargetKey) {
      if (lastFocusedTargetKeyRef.current !== null) {
        lastFocusedTargetKeyRef.current = null;
        lastFocusLayoutSignalRef.current = currentLayoutSignal;
        recenter();
      }
      return;
    }

    if (
      lastFocusedTargetKeyRef.current === focusTargetKey &&
      lastFocusLayoutSignalRef.current === currentLayoutSignal
    ) {
      return;
    }
```

Everywhere the effect currently sets:

```tsx
            lastFocusedTargetKeyRef.current = focusTargetKey;
```

or:

```tsx
          lastFocusedTargetKeyRef.current = focusTargetKey;
```

also set:

```tsx
            lastFocusLayoutSignalRef.current = currentLayoutSignal;
```

Use the same indentation as the surrounding block. There are three success paths: station-node fallback, segment center, and selected station.

Add `layoutResetSignal` to the dependency array for this focus effect.

- [ ] **Step 4: Run tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: source tests for `lastFocusLayoutSignalRef` now pass. CSS tests still fail until the next task.

## Task 5: Add Mobile Inspector CSS

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add split-view CSS after the existing mobile bottom-sheet CSS**

Add this block after the `@keyframes floating-mobile-sheet-enter` block or near the existing mobile bottom nav/status CSS:

```css
@media (max-width: 767px) {
  .linewatch-shell.mobile-map-inspector {
    --mobile-inspector-height: clamp(300px, 45dvh, 430px);
    --mobile-inspector-total-height: calc(var(--mobile-inspector-height) + var(--mobile-safe-bottom));
  }

  .linewatch-shell.mobile-map-inspector-impact.mobile-map-inspector-map-focus {
    --mobile-inspector-height: clamp(300px, 45dvh, 430px);
  }

  .linewatch-shell.mobile-map-inspector-impact.mobile-map-inspector-details-focus {
    --mobile-inspector-height: clamp(380px, 60dvh, 560px);
  }

  .linewatch-shell.mobile-map-inspector-station.mobile-map-inspector-map-focus {
    --mobile-inspector-height: clamp(330px, 52dvh, 500px);
  }

  .linewatch-shell.mobile-map-inspector-station.mobile-map-inspector-details-focus {
    --mobile-inspector-height: clamp(360px, 55dvh, 540px);
  }

  .linewatch-shell.mobile-map-inspector > main {
    bottom: var(--mobile-inspector-total-height);
    transition: bottom 180ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .motion-paused.linewatch-shell.mobile-map-inspector > main {
    transition: none;
  }

  .linewatch-shell.mobile-map-inspector .mobile-bottom-nav,
  .linewatch-shell.mobile-map-inspector .mobile-status-peek,
  .linewatch-shell.mobile-map-inspector .mobile-legend-pill {
    display: none !important;
  }

  .mobile-impact-inspector,
  .linewatch-shell.mobile-map-inspector-station .station-detail-panel {
    bottom: 0;
    left: 0;
    max-height: var(--mobile-inspector-total-height);
    min-height: 0;
    overflow-y: auto;
    position: fixed;
    right: 0;
    top: auto;
    width: 100%;
    z-index: 45;
    border-radius: 8px 8px 0 0;
    box-shadow: 0 -18px 44px rgba(0, 0, 0, 0.38);
  }

  .mobile-impact-inspector {
    background: var(--panel);
    border: 1px solid var(--border);
    color: var(--text);
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: var(--mobile-inspector-total-height);
    padding: 12px 12px calc(12px + var(--mobile-safe-bottom));
  }

  .linewatch-shell.mobile-map-inspector-station .station-detail-panel {
    height: var(--mobile-inspector-total-height);
    padding-bottom: calc(16px + var(--mobile-safe-bottom));
  }

  .mobile-impact-inspector-header {
    align-items: flex-start;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex: 0 0 auto;
    gap: 10px;
    justify-content: space-between;
    padding-bottom: 10px;
  }

  .mobile-impact-inspector-title-row {
    align-items: flex-start;
    display: flex;
    gap: 9px;
    min-width: 0;
  }

  .mobile-impact-inspector-title-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .mobile-impact-inspector-kicker {
    align-items: center;
    color: var(--quiet);
    display: flex;
    font-size: 10px;
    font-weight: 950;
    gap: 5px;
    text-transform: uppercase;
  }

  .mobile-impact-inspector-title-copy h2 {
    color: var(--text);
    font-size: 15px;
    font-weight: 950;
    line-height: 1.18;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .mobile-impact-inspector-icon-button {
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    display: inline-flex;
    flex: 0 0 auto;
    height: 44px;
    justify-content: center;
    width: 44px;
  }

  .mobile-impact-inspector-scroll {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    overflow-y: auto;
    padding-right: 2px;
  }

  .mobile-impact-inspector-description {
    color: var(--muted);
    font-size: 13px;
    font-weight: 650;
    line-height: 1.45;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .mobile-impact-inspector-window {
    align-self: flex-start;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.25);
    border-radius: 6px;
    color: #60a5fa;
    font-size: 11px;
    font-weight: 900;
    margin: 0;
    padding: 5px 7px;
  }

  .mobile-impact-inspector-badges {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .mobile-impact-inspector-badge {
    border-radius: 5px;
    font-size: 10px;
    font-weight: 950;
    padding: 4px 6px;
    text-transform: uppercase;
  }

  .mobile-impact-inspector-badge.shuttle {
    background: rgba(59, 130, 246, 0.12);
    color: #60a5fa;
  }

  .mobile-impact-inspector-badge.active-now {
    background: rgba(239, 68, 68, 0.14);
    color: #f87171;
  }

  .mobile-impact-inspector .impact-route {
    margin-top: 0;
  }

  .mobile-impact-inspector-metadata {
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }

  .mobile-impact-inspector-actions {
    display: grid;
    flex: 0 0 auto;
    gap: 8px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .mobile-impact-inspector-action {
    align-items: center;
    border-radius: 8px;
    display: inline-flex;
    font-size: 12px;
    font-weight: 950;
    gap: 7px;
    justify-content: center;
    min-height: 44px;
    padding: 8px;
  }

  .mobile-impact-inspector-action.secondary {
    background: var(--panel-soft);
    border: 1px solid var(--border);
    color: var(--text);
  }

  .mobile-impact-inspector-action.primary {
    background: rgba(59, 130, 246, 0.14);
    border: 1px solid rgba(59, 130, 246, 0.34);
    color: var(--text);
  }

  .mobile-impact-inspector-suspension {
    border-top-color: rgba(239, 68, 68, 0.62);
  }

  .mobile-impact-inspector-delay {
    border-top-color: rgba(245, 158, 11, 0.62);
  }

  .mobile-impact-inspector-rsz {
    border-top-color: var(--impact-rsz-border);
  }

  .mobile-impact-inspector-planned {
    border-top-color: rgba(59, 130, 246, 0.62);
  }

  .high-contrast .mobile-impact-inspector-action.primary {
    background: #ffffff;
    border-color: #ffffff;
    color: #000000;
  }
}
```

- [ ] **Step 2: Run source tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: all source/fixture tests should pass, or failures should identify smoke/source expectations that still reference old peek-only behavior.

## Task 6: Update Mobile Smoke Tests

**Files:**
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Update `Show on Map` expectation in the Reduced Speed Zone flow**

Find the test section containing:

```ts
  await page.locator('.alert-card').filter({ hasText: 'Eglinton' }).getByRole("button", { name: "Show on Map" }).click();
  await expect(page.locator('[data-map-highlight-id="reduced-speed-zone-stub-zone-south-source"]')).toBeAttached();
```

Replace it with:

```ts
  await page.locator('.alert-card').filter({ hasText: 'Eglinton' }).getByRole("button", { name: "Show on Map" }).click();
  await expect(page.locator('[data-map-highlight-id="reduced-speed-zone-stub-zone-south-source"]')).toBeAttached();

  if (isMobile) {
    const inspector = page.locator('[data-mobile-impact-inspector]');
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText("Reduced Speed Zone");
    await expect(inspector).toContainText("Eglinton");
    await expect(page.getByRole("button", { name: "Map", exact: true })).toHaveCount(0);
    await inspector.getByRole("button", { name: "Show more details" }).click();
    await expect(inspector).toContainText("Started");
    await inspector.getByRole("button", { name: "View Full Details" }).click();
    await expect(page.getByRole("heading", { name: "Reduced Speed Zones" })).toBeVisible();
    await expect(page.locator('[data-impact-card-id="stub-zone-south-source"]')).toHaveClass(/highlight-active-card/);
  }
```

If the seeded RSZ card id differs locally, use the exact id already present in the test fixture. Do not broaden the assertion to any `.highlight-active-card`; assert the selected card id.

- [ ] **Step 2: Update `map overlays open the corresponding submenu cards` for mobile**

Find:

```ts
  await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" }).click();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  const delayCard = page.locator('[data-impact-card-id="stub-delay-line-4"]');
  await expect(delayCard).toBeVisible();
  await expect(delayCard).toHaveClass(/highlight-active-card/);
```

Replace with:

```ts
  await page.getByRole("button", { name: "delay: Sheppard-Yonge to Don Mills" }).click();

  if (isMobile) {
    const inspector = page.locator('[data-mobile-impact-inspector]');
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText("Delay");
    await expect(inspector).toContainText("Sheppard-Yonge");
    await expect(page.locator('[data-map-highlight-id="stub-delay-line-4"]')).toBeAttached();
    await inspector.getByRole("button", { name: "View Full Details" }).click();
  }

  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  const delayCard = page.locator('[data-impact-card-id="stub-delay-line-4"]');
  await expect(delayCard).toBeVisible();
  await expect(delayCard).toHaveClass(/highlight-active-card/);
```

Then update the second half of the same test. Find:

```ts
  await clickSvgRingStroke(page, /Stub API signal problem: Stub Station/);
  await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
  const activeAlertCard = page.locator('[data-impact-card-id="stub-alert-line-1"]');
  await expect(activeAlertCard).toBeVisible();
  await expect(activeAlertCard).toHaveClass(/highlight-active-card/);
```

Replace with:

```ts
  await clickSvgRingStroke(page, /Stub API signal problem: Stub Station/);

  if (isMobile) {
    const inspector = page.locator('[data-mobile-impact-inspector]');
    await expect(inspector).toBeVisible();
    await expect(inspector).toContainText("Active Alert");
    await expect(inspector).toContainText("Stub API signal problem");
    await inspector.getByRole("button", { name: "View Full Details" }).click();
  }

  await expect(page.getByRole("heading", { name: "Active Alerts" })).toBeVisible();
  const activeAlertCard = page.locator('[data-impact-card-id="stub-alert-line-1"]');
  await expect(activeAlertCard).toBeVisible();
  await expect(activeAlertCard).toHaveClass(/highlight-active-card/);
```

- [ ] **Step 3: Add mobile station inspector assertions**

Change the test signature from:

```ts
test("station detail shows accessibility facilities and active outage warning", async ({ page, request }) => {
```

to:

```ts
test("station detail shows accessibility facilities and active outage warning", async ({ page, request, isMobile }) => {
```

Then, after:

```ts
  const stationPanel = page.getByRole("complementary", { name: "Stub Station station details" });
  await expect(stationPanel).toBeVisible();
```

add:

```ts
  if (isMobile) {
    await expect(page.locator(".linewatch-shell.mobile-map-inspector-station")).toBeVisible();
    await expect(page.getByRole("button", { name: "Map", exact: true })).toHaveCount(0);
  }
```

- [ ] **Step 4: Run the smoke test subset if supported**

Run:

```bash
npm --prefix frontend run test:smoke -- --grep "map overlays open|station detail shows|supported API surfaces"
```

If the script does not pass arguments to Playwright, run the full smoke command:

```bash
npm --prefix frontend run test:smoke
```

Expected: mobile and desktop smoke flows pass. If the exact `data-map-highlight-id` differs, inspect the rendered DOM and update the test to the exact selected overlay id. Do not remove the overlay assertion.

## Task 7: Typecheck, Lint, Build

**Files:**
- No new files.

- [ ] **Step 1: Run frontend required verification**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: all pass.

- [ ] **Step 2: Run substantial frontend verification**

Run:

```bash
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

Expected: all pass.

If Playwright fails because a service or browser dependency is missing, report the exact command and failure. Do not claim smoke coverage passed unless the command completed successfully.

## Task 8: Manual Mobile UX Check

**Files:**
- No new files.

- [ ] **Step 1: Start the frontend**

Run:

```bash
npm --prefix frontend run dev
```

Open the local URL printed by Next.js.

- [ ] **Step 2: Check mobile viewport behavior**

Use browser dev tools mobile emulation around `390x844` and verify:

- Default mobile view shows the map, compact status peek, bottom nav, and mobile legend.
- Opening `Status -> Reduced Speed Zones -> Show on Map` hides bottom nav/status peek/mobile legend.
- The top visible map area is actually resized, not merely covered by a sheet.
- The selected issue is visible in the top map region after auto-zoom.
- The lower inspector sheet scrolls independently.
- `More Details` increases the lower sheet height and triggers map refocus.
- `More Map` returns to the 55/45-ish impact layout.
- `View Full Details` opens the existing category sheet with the selected card highlighted.
- Selecting a station opens station details with the map still visible above.
- Closing the station or unfocusing an impact restores bottom nav/status peek.

## Acceptance Criteria

- Desktop behavior remains unchanged:
  - Card `Show on Map` opens the relevant desktop floating panel and highlights the card.
  - Desktop map overlay clicks still open the corresponding category panel.

- Mobile impact behavior:
  - `Show on Map` opens the mobile inspector, not only a small peek.
  - The map highlight and detail sheet are visible at the same time.
  - Bottom nav, status peek, and mobile legend are hidden in inspector mode.
  - The selected impact remains highlighted.
  - `More Details` and `More Map` change the split without losing the map focus.
  - `View Full Details` opens the correct category sheet and selected card.

- Mobile station behavior:
  - Station selection opens station details in the same inspector layout family.
  - Map remains visible above the station details.
  - Station accessibility, outages, station impacts, and scheduled-source labeling remain intact.

- Verification:
  - `npm --prefix frontend run test:fixtures` passes.
  - `npm --prefix frontend run typecheck` passes.
  - `npm --prefix frontend run lint` passes.
  - `npm --prefix frontend run build` passes.
  - `npm --prefix frontend run test:smoke` passes, or exact local-environment failure is reported.

## Self-Review Notes For Implementer

- Keep the user-facing product name as `LineWatchTO`.
- Do not call fixture data live.
- Do not introduce a marketing/landing page.
- Do not add dependencies.
- Keep cards/sheets at 8px radius.
- Do not make a second mobile navigation model.
- Do not solve this by merely placing a sheet over a full-screen map; resize `main` while inspector mode is open so selected geometry is centered in the visible region.

# Mobile Bottom Sheet UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert LineWatch TO mobile from a squeezed desktop menu/dashboard into a mobile-native map plus bottom-sheet experience while preserving desktop behavior.

**Architecture:** Keep `LineWatchShell` as the orchestration boundary and keep the existing desktop floating panels. Add mobile-only bottom navigation, mobile status peek/sheet components, and a mobile More sheet. Use CSS media queries and a small number of new React components so desktop remains unchanged and the expensive SVG map stays isolated behind the existing mobile performance work.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind utility classes, CSS in `frontend/src/app/globals.css`, Node built-in tests, Playwright Chromium smoke tests.

---

## Read This First

This plan is written for Gemini 3.5 Flash. Follow it literally and keep changes small.

Do not start this plan until the mobile performance first pass is either completed or consciously merged into this work. That pass is documented at:

```text
docs/superpowers/plans/2026-06-08-mobile-performance-first-pass.md
```

Current related files may already be dirty:

```text
frontend/src/components/InteractiveTtcMap.tsx
frontend/src/hooks/usePanZoom.ts
frontend/tests/mobile-performance-guardrails.test.mjs
frontend/tests/pan-zoom-behavior.test.mjs
```

Preserve those changes. Do not revert them. If they are incomplete, finish or reconcile them before applying this plan.

## Scope

Implement mobile UX only. Desktop should look and behave as it does now:

- Desktop top-left menu remains.
- Desktop left floating panels remain.
- Desktop top-center map controls remain.
- Desktop top-right utility cluster remains.
- Desktop station detail remains right-docked.

Mobile behavior changes:

- Add bottom nav: `Map`, `Status`, `Search`, `Commutes`, `More`.
- Add compact status peek above bottom nav.
- Convert floating panels into bottom sheets on mobile through CSS.
- Add mobile-specific `Status` and `More` sheets.
- Restyle station search as a bottom sheet on mobile.
- Simplify mobile map controls and hide desktop utility/legend chrome on mobile.

Do not add dependencies.

## Files To Create

- `frontend/src/components/MobileBottomNav.tsx`
  - Mobile-only bottom navigation.
- `frontend/src/components/MobileStatusPeek.tsx`
  - Compact current-service summary above bottom nav.
- `frontend/src/components/MobileStatusSheet.tsx`
  - Mobile current-service overview and category drill-in buttons.
- `frontend/src/components/MobileMoreSheet.tsx`
  - Mobile account/settings/guide/logs/analytics/health sheet.
- `frontend/tests/mobile-bottom-sheet-ux.test.mjs`
  - Source guardrails for the new mobile UX structure.

## Files To Modify

- `frontend/src/components/LineWatchShell.tsx`
  - Add `status` and `more` active views.
  - Render mobile bottom nav, status peek, status sheet, and more sheet.
  - Hide mobile bottom nav when station detail/account/closed screen needs focus.
- `frontend/src/components/FloatingPanelShell.tsx`
  - Add optional mobile sheet metadata and detent classes.
- `frontend/src/components/InteractiveTtcMap.tsx`
  - Add stable class names around utility cluster and zoom-control group.
  - Keep desktop controls but allow mobile CSS to hide/demote parts.
- `frontend/src/components/StationSearchPanel.tsx`
  - Add mobile drill-in/back affordance if needed and stable data attributes.
- `frontend/src/app/globals.css`
  - Add mobile bottom nav, status peek, bottom sheet, search sheet, map control, and safe-area CSS.
- `frontend/tests/drawer-layout.test.mjs`
  - Update source assertions for bottom nav/status/more.
- `frontend/tests/keyboard-accessibility.test.mjs`
  - Add source assertions for mobile nav and sheet controls.
- `frontend/tests/map-controls.test.mjs`
  - Add source assertions for mobile control simplification.
- `frontend/tests/smoke/dashboard.spec.ts`
  - Update mobile flows to use bottom nav/status/more instead of the desktop hamburger.

## Task 1: Add Mobile UX Guardrail Tests

**Files:**
- Create: `frontend/tests/mobile-bottom-sheet-ux.test.mjs`
- Modify: `frontend/tests/drawer-layout.test.mjs`
- Modify: `frontend/tests/keyboard-accessibility.test.mjs`
- Modify: `frontend/tests/map-controls.test.mjs`

- [ ] **Step 1: Create the mobile UX source test**

Create `frontend/tests/mobile-bottom-sheet-ux.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const bottomNavSource = readFileSync(new URL("../src/components/MobileBottomNav.tsx", import.meta.url), "utf8");
const statusPeekSource = readFileSync(new URL("../src/components/MobileStatusPeek.tsx", import.meta.url), "utf8");
const statusSheetSource = readFileSync(new URL("../src/components/MobileStatusSheet.tsx", import.meta.url), "utf8");
const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const floatingPanelSource = readFileSync(new URL("../src/components/FloatingPanelShell.tsx", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const searchSource = readFileSync(new URL("../src/components/StationSearchPanel.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("mobile bottom sheet UX", () => {
  it("adds mobile primary navigation without removing desktop active views", () => {
    assert.match(shellSource, /type ActiveView = .*"status".*"more"/s);
    assert.match(shellSource, /MobileBottomNav/);
    assert.match(shellSource, /MobileStatusPeek/);
    assert.match(shellSource, /MobileStatusSheet/);
    assert.match(shellSource, /MobileMoreSheet/);
    assert.match(bottomNavSource, /role="navigation"/);
    assert.match(bottomNavSource, /aria-label="Primary mobile navigation"/);
    assert.match(bottomNavSource, /Map/);
    assert.match(bottomNavSource, /Status/);
    assert.match(bottomNavSource, /Search/);
    assert.match(bottomNavSource, /Commutes/);
    assert.match(bottomNavSource, /More/);
  });

  it("keeps a compact status answer above mobile bottom navigation", () => {
    assert.match(statusPeekSource, /mobile-status-peek/);
    assert.match(statusPeekSource, /lineStatuses\.map/);
    assert.match(statusPeekSource, /title=\{`Line \$\{line\.number\}`\}/);
    assert.match(statusPeekSource, /Reduced Speed Zones/);
    assert.match(statusPeekSource, /onOpenStatus/);
    assert.match(statusPeekSource, /aria-label="Open current service status"/);
    assert.match(globalCss, /\.mobile-status-peek/);
    assert.match(globalCss, /--mobile-bottom-nav-height/);
  });

  it("renders a mobile-specific status sheet that drills into existing alert categories", () => {
    assert.match(statusSheetSource, /System Status/);
    assert.match(statusSheetSource, /onOpenCategory/);
    assert.match(statusSheetSource, /"alerts"/);
    assert.match(statusSheetSource, /"delays"/);
    assert.match(statusSheetSource, /"reduced-speed-zones"/);
    assert.match(statusSheetSource, /"closures"/);
    assert.match(statusSheetSource, /Good Service/);
    assert.match(statusSheetSource, /useDashboardData/);
  });

  it("moves secondary mobile utilities into More", () => {
    assert.match(moreSheetSource, /LineWatch TO/);
    assert.match(moreSheetSource, /Sign In/);
    assert.match(moreSheetSource, /Create Account/);
    assert.match(moreSheetSource, /Demo Account/);
    assert.match(moreSheetSource, /High Contrast Mode/);
    assert.match(moreSheetSource, /Reduced Motion/);
    assert.match(moreSheetSource, /Reliability Analytics/);
    assert.match(moreSheetSource, /LogsDropdown/);
    assert.match(moreSheetSource, /SiteGuideDropdown/);
  });

  it("turns floating panels into mobile bottom sheets only below tablet width", () => {
    assert.match(floatingPanelSource, /mobileSheetLabel/);
    assert.match(floatingPanelSource, /data-mobile-sheet-label/);
    assert.match(globalCss, /@media \(max-width:\s*767px\)/);
    assert.match(globalCss, /\.floating-panel-shell/);
    assert.match(globalCss, /bottom:\s*calc\(var\(--mobile-bottom-nav-height\)/);
    assert.match(globalCss, /border-radius:\s*8px 8px 0 0/);
  });

  it("simplifies mobile map controls and hides desktop map utilities on phones", () => {
    assert.match(mapSource, /map-utility-cluster/);
    assert.match(mapSource, /map-control-zoom-group/);
    assert.match(globalCss, /\.map-utility-cluster/);
    assert.match(globalCss, /\.map-control-zoom-group/);
    assert.match(globalCss, /display:\s*none\s*!important/);
  });

  it("makes station search a mobile bottom sheet with single-column browse behavior", () => {
    assert.match(searchSource, /data-station-search-panel/);
    assert.match(globalCss, /\.station-search-panel/);
    assert.match(globalCss, /\.station-search-browse-container/);
    assert.match(globalCss, /flex-direction:\s*column/);
    assert.match(globalCss, /\.station-search-stations-column/);
  });

  it("hides desktop-only chrome on mobile without deleting it", () => {
    assert.match(shellSource, /desktop-top-chrome/);
    assert.match(shellSource, /desktop-map-legend/);
    assert.match(globalCss, /\.desktop-top-chrome/);
    assert.match(globalCss, /\.desktop-map-legend/);
  });
});
```

- [ ] **Step 2: Add source assertions to existing tests**

In `frontend/tests/drawer-layout.test.mjs`, add assertions in the first test:

```js
assert.match(shellSource, /"status"/);
assert.match(shellSource, /"more"/);
assert.match(shellSource, /MobileBottomNav/);
assert.match(shellSource, /MobileStatusSheet/);
assert.match(shellSource, /MobileMoreSheet/);
assert.match(globalCss, /\.mobile-bottom-nav/);
assert.match(globalCss, /\.mobile-status-peek/);
```

In `frontend/tests/keyboard-accessibility.test.mjs`, add a new test:

```js
it("keeps mobile navigation and sheets keyboard accessible", () => {
  assert.match(shellSource, /MobileBottomNav/);
  assert.match(shellSource, /aria-label="Primary mobile navigation"/);
  assert.match(shellSource, /onMobileNavSelect/);
  assert.match(shellSource, /handleMobileSheetClose/);
});
```

In `frontend/tests/map-controls.test.mjs`, add assertions:

```js
assert.match(mapSource, /map-utility-cluster/);
assert.match(mapSource, /map-control-zoom-group/);
assert.match(globalCss, /\.map-control-zoom-group/);
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: FAIL because the new mobile components and CSS do not exist yet.

- [ ] **Step 4: Commit only the failing tests**

If you are committing during execution, stage only the files touched in this task:

```bash
git add frontend/tests/mobile-bottom-sheet-ux.test.mjs frontend/tests/drawer-layout.test.mjs frontend/tests/keyboard-accessibility.test.mjs frontend/tests/map-controls.test.mjs
git commit -m "test: add mobile bottom sheet UX guardrails"
```

## Task 2: Add Mobile Bottom Navigation

**Files:**
- Create: `frontend/src/components/MobileBottomNav.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Create `MobileBottomNav`**

Create `frontend/src/components/MobileBottomNav.tsx`:

```tsx
"use client";

import { AlertTriangle, Map as MapIcon, MoreHorizontal, Navigation, Search } from "lucide-react";

export type MobileNavKey = "map" | "status" | "search" | "commutes" | "more";

type MobileBottomNavProps = {
  activeKey: MobileNavKey;
  alertCount: number;
  delayCount: number;
  reducedSpeedZoneCount: number;
  commuteAffectedCount: number;
  onSelect: (key: MobileNavKey) => void;
};

const ITEMS: Array<{
  key: MobileNavKey;
  label: string;
  Icon: typeof MapIcon;
}> = [
  { key: "map", label: "Map", Icon: MapIcon },
  { key: "status", label: "Status", Icon: AlertTriangle },
  { key: "search", label: "Search", Icon: Search },
  { key: "commutes", label: "Commutes", Icon: Navigation },
  { key: "more", label: "More", Icon: MoreHorizontal },
];

export function MobileBottomNav({
  activeKey,
  alertCount,
  delayCount,
  reducedSpeedZoneCount,
  commuteAffectedCount,
  onSelect,
}: MobileBottomNavProps) {
  const statusCount = alertCount + delayCount + reducedSpeedZoneCount;

  function badgeFor(key: MobileNavKey) {
    if (key === "status" && statusCount > 0) return statusCount;
    if (key === "commutes" && commuteAffectedCount > 0) return commuteAffectedCount;
    return null;
  }

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
      {ITEMS.map(({ key, label, Icon }) => {
        const selected = activeKey === key;
        const badge = badgeFor(key);
        return (
          <button
            key={key}
            type="button"
            className="mobile-bottom-nav-item"
            aria-current={selected ? "page" : undefined}
            aria-label={label}
            data-active={selected ? "true" : "false"}
            onClick={() => onSelect(key)}
          >
            <span className="mobile-bottom-nav-icon">
              <Icon size={21} aria-hidden="true" />
              {badge ? <span className="mobile-bottom-nav-badge" aria-hidden="true">{badge}</span> : null}
            </span>
            <span className="mobile-bottom-nav-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Add mobile nav CSS**

Append to `frontend/src/app/globals.css` near existing mobile/floating panel CSS:

```css
:root {
  --mobile-bottom-nav-height: 74px;
  --mobile-status-peek-height: 98px;
  --mobile-safe-bottom: env(safe-area-inset-bottom, 0px);
}

.mobile-bottom-nav {
  display: none;
}

@media (max-width: 767px) {
  .mobile-bottom-nav {
    align-items: stretch;
    background: rgba(10, 12, 16, 0.96);
    border-top: 1px solid rgba(255, 255, 255, 0.14);
    bottom: 0;
    box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.34);
    display: grid;
    gap: 2px;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    left: 0;
    min-height: calc(var(--mobile-bottom-nav-height) + var(--mobile-safe-bottom));
    padding: 7px 8px calc(7px + var(--mobile-safe-bottom));
    position: fixed;
    right: 0;
    z-index: 45;
  }

  .mobile-bottom-nav-item {
    align-items: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    color: rgba(248, 250, 252, 0.72);
    display: flex;
    flex-direction: column;
    font-size: 10px;
    font-weight: 900;
    gap: 3px;
    justify-content: center;
    min-height: 56px;
    min-width: 0;
    padding: 5px 2px;
  }

  .mobile-bottom-nav-item[data-active="true"] {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.16);
    color: #ffffff;
  }

  .mobile-bottom-nav-icon {
    display: inline-flex;
    position: relative;
  }

  .mobile-bottom-nav-badge {
    align-items: center;
    background: #ef4444;
    border: 1px solid rgba(255, 255, 255, 0.86);
    border-radius: 999px;
    color: #ffffff;
    display: inline-flex;
    font-size: 9px;
    font-weight: 1000;
    height: 17px;
    justify-content: center;
    min-width: 17px;
    padding: 0 4px;
    position: absolute;
    right: -12px;
    top: -8px;
  }

  .mobile-bottom-nav-label {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
```

- [ ] **Step 3: Import and render nav in `LineWatchShell`**

In `frontend/src/components/LineWatchShell.tsx`, import:

```tsx
import { MobileBottomNav, type MobileNavKey } from "./MobileBottomNav";
```

Extend `ActiveView`:

```tsx
type ActiveView = "map" | "menu" | "search" | "status" | "alerts" | "delays" | "reduced-speed-zones" | "closures" | "commutes" | "analytics" | "more";
```

Add helper callbacks after `handleToggleSearch`:

```tsx
  const mobileNavKey = useMemo<MobileNavKey>(() => {
    if (activeView === "status" || activeView === "alerts" || activeView === "delays" || activeView === "reduced-speed-zones" || activeView === "closures") {
      return "status";
    }
    if (activeView === "search") return "search";
    if (activeView === "commutes") return "commutes";
    if (activeView === "more" || activeView === "analytics") return "more";
    return "map";
  }, [activeView]);

  const onMobileNavSelect = useCallback((key: MobileNavKey) => {
    setSelection(null);
    setSelectedStationId(null);
    setCommutePathPreview(null);
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
  }, []);
```

Render the nav near the end of the shell, after the desktop legend and before account dialog:

```tsx
      {!showClosedScreen && !selectedStationId && !accountDialogMode ? (
        <MobileBottomNav
          activeKey={mobileNavKey}
          alertCount={activeAlerts.length}
          delayCount={delays.length}
          reducedSpeedZoneCount={reducedSpeedZones.length}
          commuteAffectedCount={commuteAffectedCount}
          onSelect={onMobileNavSelect}
        />
      ) : null}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: still FAIL because status/more components and CSS are not complete.

## Task 3: Add Mobile Status Peek And Status Sheet

**Files:**
- Create: `frontend/src/components/MobileStatusPeek.tsx`
- Create: `frontend/src/components/MobileStatusSheet.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Create `MobileStatusPeek`**

Create `frontend/src/components/MobileStatusPeek.tsx`:

```tsx
"use client";

import { AlertTriangle, Calendar, Construction } from "lucide-react";
import { DelayIcon } from "./DelayIcon";
import type { LineStatus } from "../app/linewatch-data";

type Props = {
  lineStatuses: LineStatus[];
  activeAlertCount: number;
  delayCount: number;
  reducedSpeedZoneCount: number;
  plannedClosureCount: number;
  pollText: string;
  dataSource: "backend" | "fallback";
  onOpenStatus: () => void;
};

export function MobileStatusPeek({
  lineStatuses,
  activeAlertCount,
  delayCount,
  reducedSpeedZoneCount,
  plannedClosureCount,
  pollText,
  dataSource,
  onOpenStatus,
}: Props) {
  const impactCount = activeAlertCount + delayCount + reducedSpeedZoneCount + plannedClosureCount;
  const sourceLabel = dataSource === "backend" ? `Updated ${pollText}` : "Fixture mode";

  return (
    <button
      type="button"
      className="mobile-status-peek"
      onClick={onOpenStatus}
      aria-label="Open current service status"
    >
      <span className="mobile-status-peek-main">
        <span className="mobile-status-peek-title">
          {impactCount > 0 ? `${impactCount} current ${impactCount === 1 ? "impact" : "impacts"}` : "Good service on mapped lines"}
        </span>
        <span className="mobile-status-peek-source">{sourceLabel}</span>
      </span>
      <span className="mobile-status-peek-lines" aria-hidden="true">
        {lineStatuses.map((line) => (
          <span
            key={line.id}
            className="mobile-status-line-chip"
            style={{ backgroundColor: line.color, color: line.id === "line-1" || line.id === "line-6" ? "#111827" : "#ffffff" }}
            title={`Line ${line.number}`}
          >
            {line.number}
          </span>
        ))}
      </span>
      <span className="mobile-status-peek-counts" aria-hidden="true">
        {activeAlertCount > 0 ? <span><AlertTriangle size={12} />{activeAlertCount}</span> : null}
        {delayCount > 0 ? <span><DelayIcon size={12} />{delayCount}</span> : null}
        {reducedSpeedZoneCount > 0 ? <span><Construction size={12} />{reducedSpeedZoneCount}</span> : null}
        {plannedClosureCount > 0 ? <span><Calendar size={12} />{plannedClosureCount}</span> : null}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Create `MobileStatusSheet`**

Create `frontend/src/components/MobileStatusSheet.tsx`:

```tsx
"use client";

import { AlertTriangle, Calendar, Construction, X } from "lucide-react";
import { useDashboardData } from "../app/DataContext";
import { DelayIcon } from "./DelayIcon";

type StatusCategory = "alerts" | "delays" | "reduced-speed-zones" | "closures";

type Props = {
  pollText: string;
  dataSource: "backend" | "fallback";
  onOpenCategory: (view: StatusCategory) => void;
  onClose: () => void;
};

export function MobileStatusSheet({ pollText, dataSource, onOpenCategory, onClose }: Props) {
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures, lineStatuses } = useDashboardData();
  const sourceLabel = dataSource === "backend" ? `Updated ${pollText}` : "Backend offline. Fixture mode.";

  return (
    <section className="mobile-status-sheet panel" aria-label="Current service status">
      <div className="mobile-sheet-heading">
        <div>
          <p className="mobile-sheet-kicker">Current TTC rapid transit</p>
          <h2>System Status</h2>
          <p>{sourceLabel}</p>
        </div>
        <button type="button" className="mobile-sheet-icon-button" onClick={onClose} aria-label="Close status">
          <X size={20} />
        </button>
      </div>

      <div className="mobile-status-actions" aria-label="Service impact categories">
        <button type="button" onClick={() => onOpenCategory("alerts")}>
          <AlertTriangle size={16} />
          <span>Active Alerts</span>
          <strong>{activeAlerts.length}</strong>
        </button>
        <button type="button" onClick={() => onOpenCategory("delays")}>
          <DelayIcon size={16} />
          <span>Delays</span>
          <strong>{delays.length}</strong>
        </button>
        <button type="button" onClick={() => onOpenCategory("reduced-speed-zones")}>
          <Construction size={16} />
          <span>Reduced Speed Zones</span>
          <strong>{reducedSpeedZones.length}</strong>
        </button>
        <button type="button" onClick={() => onOpenCategory("closures")}>
          <Calendar size={16} />
          <span>Closures</span>
          <strong>{plannedClosures.length}</strong>
        </button>
      </div>

      <div className="mobile-line-status-list">
        {lineStatuses.map((line) => {
          const lineAlerts = activeAlerts.filter((alert) => alert.lineId === line.id);
          const lineDelays = delays.filter((delay) => delay.lineId === line.id);
          const lineRsz = reducedSpeedZones.filter((zone) => zone.lineId === line.id);
          const lineClosures = plannedClosures.filter((closure) => closure.lineId === line.id);
          const clear = lineAlerts.length === 0 && lineDelays.length === 0 && lineRsz.length === 0 && lineClosures.length === 0;

          return (
            <article key={line.id} className="mobile-line-status-row">
              <span
                className="mobile-line-status-number"
                style={{ backgroundColor: line.color, color: line.id === "line-1" || line.id === "line-6" ? "#111827" : "#ffffff" }}
              >
                {line.number}
              </span>
              <span className="mobile-line-status-copy">
                <strong>{line.name}</strong>
                {clear ? <em>Good Service</em> : null}
                {!clear ? (
                  <span className="mobile-line-status-impacts">
                    {lineAlerts.length > 0 ? <button type="button" onClick={() => onOpenCategory("alerts")}>Alert {lineAlerts.length}</button> : null}
                    {lineDelays.length > 0 ? <button type="button" onClick={() => onOpenCategory("delays")}>Delay {lineDelays.length}</button> : null}
                    {lineRsz.length > 0 ? <button type="button" onClick={() => onOpenCategory("reduced-speed-zones")}>RSZ {lineRsz.length}</button> : null}
                    {lineClosures.length > 0 ? <button type="button" onClick={() => onOpenCategory("closures")}>Closure {lineClosures.length}</button> : null}
                  </span>
                ) : null}
              </span>
            </article>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Keep status category types local**

Do not export `ActiveView` only for `MobileStatusSheet`. Keep this local type inside `MobileStatusSheet.tsx`:

```tsx
type StatusCategory = "alerts" | "delays" | "reduced-speed-zones" | "closures";
```

- [ ] **Step 4: Import and integrate the status components**

In `LineWatchShell.tsx`, import:

```tsx
import { MobileStatusPeek } from "./MobileStatusPeek";
import { MobileStatusSheet } from "./MobileStatusSheet";
```

Add a mobile close helper near the mobile nav callback:

```tsx
  const handleMobileSheetClose = useCallback(() => {
    setActiveView("map");
    setSelection(null);
  }, []);
```

Add `status` to `activeFloatingPanel` before the existing alert-category cases:

```tsx
    activeView === "status" ? (
      <FloatingPanelShell panel="status" mobileSheetLabel="Current service status">
        <MobileStatusSheet
          pollText={pollText}
          dataSource={displayData.dataSource}
          onOpenCategory={(view) => {
            setSelection(null);
            setActiveView(view);
          }}
          onClose={handleMobileSheetClose}
        />
      </FloatingPanelShell>
    ) : activeView === "alerts" ? (
```

Render `MobileStatusPeek` before `MobileBottomNav`:

```tsx
      {!showClosedScreen && activeView === "map" && !selectedStationId && !accountDialogMode && !commutePathPreview ? (
        <MobileStatusPeek
          lineStatuses={lineStatuses}
          activeAlertCount={activeAlerts.length}
          delayCount={delays.length}
          reducedSpeedZoneCount={reducedSpeedZones.length}
          plannedClosureCount={plannedClosures.length}
          pollText={pollText}
          dataSource={displayData.dataSource}
          onOpenStatus={() => setActiveView("status")}
        />
      ) : null}
```

- [ ] **Step 5: Add status CSS**

Append to `frontend/src/app/globals.css`:

```css
.mobile-status-peek {
  display: none;
}

@media (max-width: 767px) {
  .mobile-status-peek {
    align-items: center;
    background: rgba(10, 12, 16, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    bottom: calc(var(--mobile-bottom-nav-height) + var(--mobile-safe-bottom) + 10px);
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.34);
    color: #ffffff;
    display: grid;
    gap: 7px;
    grid-template-columns: minmax(0, 1fr) auto;
    left: 10px;
    min-height: 82px;
    padding: 10px;
    position: fixed;
    right: 10px;
    text-align: left;
    z-index: 42;
  }

  .mobile-status-peek-main {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .mobile-status-peek-title {
    font-size: 13px;
    font-weight: 950;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-status-peek-source {
    color: rgba(226, 232, 240, 0.74);
    font-size: 10px;
    font-weight: 800;
    margin-top: 2px;
  }

  .mobile-status-peek-lines,
  .mobile-status-peek-counts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .mobile-status-peek-lines {
    grid-column: 1 / -1;
  }

  .mobile-status-line-chip {
    align-items: center;
    border-radius: 999px;
    display: inline-flex;
    font-size: 10px;
    font-weight: 1000;
    height: 21px;
    justify-content: center;
    min-width: 21px;
    padding: 0 7px;
  }

  .mobile-status-peek-counts span {
    align-items: center;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    display: inline-flex;
    font-size: 11px;
    font-weight: 900;
    gap: 3px;
    min-height: 24px;
    padding: 0 7px;
  }

  .mobile-status-sheet {
    border-radius: 8px;
    color: var(--text);
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }

  .mobile-sheet-heading {
    align-items: flex-start;
    border-bottom: 1px solid var(--border);
    display: flex;
    gap: 12px;
    justify-content: space-between;
    padding-bottom: 10px;
  }

  .mobile-sheet-heading h2 {
    font-size: 18px;
    font-weight: 950;
    line-height: 1.1;
    margin: 2px 0;
  }

  .mobile-sheet-heading p {
    color: var(--muted);
    font-size: 11px;
    font-weight: 750;
    margin: 0;
  }

  .mobile-sheet-kicker {
    color: var(--quiet) !important;
    font-size: 10px !important;
    font-weight: 950 !important;
    letter-spacing: 0 !important;
    text-transform: uppercase;
  }

  .mobile-sheet-icon-button {
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 8px;
    display: inline-flex;
    height: 44px;
    justify-content: center;
    width: 44px;
  }

  .mobile-status-actions {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .mobile-status-actions button,
  .mobile-line-status-impacts button {
    align-items: center;
    background: var(--panel-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    display: flex;
    font-size: 11px;
    font-weight: 900;
    gap: 7px;
    min-height: 44px;
    padding: 8px;
  }

  .mobile-status-actions button strong {
    margin-left: auto;
  }

  .mobile-line-status-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .mobile-line-status-row {
    align-items: flex-start;
    background: var(--panel-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    gap: 10px;
    padding: 10px;
  }

  .mobile-line-status-number {
    align-items: center;
    border-radius: 999px;
    display: inline-flex;
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 1000;
    height: 28px;
    justify-content: center;
    min-width: 28px;
    padding: 0 8px;
  }

  .mobile-line-status-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .mobile-line-status-copy strong {
    font-size: 13px;
    line-height: 1.2;
  }

  .mobile-line-status-copy em {
    color: var(--ok);
    font-size: 10px;
    font-style: normal;
    font-weight: 950;
    text-transform: uppercase;
  }

  .mobile-line-status-impacts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .mobile-line-status-impacts button {
    min-height: 32px;
    padding: 5px 8px;
  }
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: remaining failures for More sheet, floating sheet metadata, map/search CSS.

## Task 4: Add Mobile More Sheet

**Files:**
- Create: `frontend/src/components/MobileMoreSheet.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`

- [ ] **Step 1: Create `MobileMoreSheet`**

Create `frontend/src/components/MobileMoreSheet.tsx`:

```tsx
"use client";

import { BarChart3, LogIn, LogOut, Moon, ShieldCheck, Sun, UserPlus, UserRound, X } from "lucide-react";
import Image from "next/image";
import type { AccountState } from "../app/account-data";
import type { DashboardData } from "../app/DataContext";
import { LogsDropdown } from "./LogsDropdown";
import { SiteGuideDropdown } from "./SiteGuideDropdown";

type Props = {
  accountState: AccountState;
  accountBusy: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  isDark: boolean;
  ingestionHealth: DashboardData["ingestionHealth"];
  onClose: () => void;
  onRequestSignIn: () => void;
  onRequestCreateAccount: () => void;
  onDemoAccount: () => void;
  onSignOut: () => void;
  onToggleHighContrast: () => void;
  onToggleReducedMotion: () => void;
  onToggleTheme: () => void;
  onOpenAnalytics: () => void;
};

export function MobileMoreSheet({
  accountState,
  accountBusy,
  highContrast,
  reducedMotion,
  isDark,
  ingestionHealth,
  onClose,
  onRequestSignIn,
  onRequestCreateAccount,
  onDemoAccount,
  onSignOut,
  onToggleHighContrast,
  onToggleReducedMotion,
  onToggleTheme,
  onOpenAnalytics,
}: Props) {
  return (
    <section className="mobile-more-sheet panel" aria-label="More LineWatch TO options">
      <div className="mobile-sheet-heading">
        <div className="mobile-more-brand">
          <Image src="/assets/linewatch/logo.svg" alt="" width={28} height={28} aria-hidden="true" />
          <span>
            <p className="mobile-sheet-kicker">LineWatch TO</p>
            <h2>More</h2>
          </span>
        </div>
        <button type="button" className="mobile-sheet-icon-button" onClick={onClose} aria-label="Close more options">
          <X size={20} />
        </button>
      </div>

      <div className="mobile-more-section">
        <h3>Account</h3>
        {accountState.authenticated && accountState.user ? (
          <>
            <div className="mobile-more-account">
              <UserRound size={18} />
              <span>{accountState.user.displayName || accountState.user.email}</span>
              {accountState.user.demo ? <strong>Demo</strong> : null}
            </div>
            <button type="button" className="mobile-more-row" disabled={accountBusy} onClick={onSignOut}>
              <LogOut size={18} />
              Sign Out
            </button>
          </>
        ) : (
          <>
            <button type="button" className="mobile-more-row" onClick={onRequestSignIn}>
              <LogIn size={18} />
              Sign In
            </button>
            <button type="button" className="mobile-more-row" onClick={onRequestCreateAccount}>
              <UserPlus size={18} />
              Create Account
            </button>
            <button type="button" className="mobile-more-row" disabled={accountBusy} onClick={onDemoAccount}>
              <UserRound size={18} />
              Demo Account
            </button>
          </>
        )}
      </div>

      <div className="mobile-more-section">
        <h3>Display</h3>
        <button type="button" className="mobile-more-row" onClick={onToggleTheme}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
          {isDark ? "Light Theme" : "Dark Theme"}
        </button>
        <button type="button" className="mobile-more-row" aria-pressed={highContrast} onClick={onToggleHighContrast}>
          <ShieldCheck size={18} />
          High Contrast Mode
          <strong>{highContrast ? "On" : "Off"}</strong>
        </button>
        <button type="button" className="mobile-more-row" aria-pressed={reducedMotion} onClick={onToggleReducedMotion}>
          <ShieldCheck size={18} />
          Reduced Motion
          <strong>{reducedMotion ? "On" : "Off"}</strong>
        </button>
      </div>

      <div className="mobile-more-section">
        <h3>Tools</h3>
        <button type="button" className="mobile-more-row" onClick={onOpenAnalytics}>
          <BarChart3 size={18} />
          Reliability Analytics
        </button>
        <div className="mobile-more-utility-row">
          <SiteGuideDropdown />
          <LogsDropdown />
        </div>
      </div>

      <div className="mobile-more-section">
        <h3>Source Health</h3>
        <div className="mobile-more-health-grid">
          {ingestionHealth.map((health, index) => (
            <div key={`${health.label}-${index}`}>
              <span>{health.label}</span>
              <strong>{health.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Import and integrate More in `LineWatchShell`**

Import:

```tsx
import { MobileMoreSheet } from "./MobileMoreSheet";
```

Add the `more` branch in `activeFloatingPanel` before `analytics`:

```tsx
    ) : activeView === "more" ? (
      <FloatingPanelShell panel="more" mobileSheetLabel="More options">
        <MobileMoreSheet
          accountState={accountState}
          accountBusy={accountBusy}
          highContrast={highContrast}
          reducedMotion={reducedMotion}
          isDark={isDark}
          ingestionHealth={ingestionHealth}
          onClose={handleMobileSheetClose}
          onRequestSignIn={() => { resetAccountForm(); setAccountDialogMode("login"); }}
          onRequestCreateAccount={() => { resetAccountForm(); setAccountDialogMode("register"); }}
          onDemoAccount={handleDemoAccount}
          onSignOut={handleSignOut}
          onToggleHighContrast={() => setHighContrast((current) => !current)}
          onToggleReducedMotion={() => setReducedMotion((current) => !current)}
          onToggleTheme={handleToggleTheme}
          onOpenAnalytics={() => setActiveView("analytics")}
        />
      </FloatingPanelShell>
```

- [ ] **Step 3: Add More CSS**

Append to the mobile CSS area in `globals.css`:

```css
@media (max-width: 767px) {
  .mobile-more-sheet {
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }

  .mobile-more-brand {
    align-items: center;
    display: flex;
    gap: 10px;
  }

  .mobile-more-section {
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
  }

  .mobile-more-section h3 {
    color: var(--quiet);
    font-size: 10px;
    font-weight: 950;
    margin: 0 0 2px;
    text-transform: uppercase;
  }

  .mobile-more-row,
  .mobile-more-account {
    align-items: center;
    background: var(--panel-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    display: flex;
    font-size: 13px;
    font-weight: 850;
    gap: 9px;
    min-height: 46px;
    padding: 9px 10px;
    text-align: left;
  }

  .mobile-more-row strong,
  .mobile-more-account strong {
    margin-left: auto;
  }

  .mobile-more-utility-row {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .mobile-more-health-grid {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .mobile-more-health-grid div {
    background: var(--panel-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    padding: 8px;
  }

  .mobile-more-health-grid span {
    color: var(--quiet);
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .mobile-more-health-grid strong {
    color: var(--text);
    font-size: 12px;
    line-height: 1.25;
  }
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: failures only for floating shell/map/search/smoke until later tasks are complete.

## Task 5: Convert Floating Panels To Mobile Bottom Sheets

**Files:**
- Modify: `frontend/src/components/FloatingPanelShell.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add mobile metadata to `FloatingPanelShell`**

Replace `frontend/src/components/FloatingPanelShell.tsx` with:

```tsx
"use client";

import type { ReactNode } from "react";

export function FloatingPanelShell({
  children,
  panel,
  mobileSheetLabel,
}: {
  children: ReactNode;
  panel: string;
  mobileSheetLabel?: string;
}) {
  return (
    <div
      className="floating-panel-shell"
      data-floating-panel={panel}
      data-mobile-sheet-label={mobileSheetLabel ?? panel}
    >
      <div className="mobile-sheet-grabber" aria-hidden="true" />
      <div className="floating-panel-scroll">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Pass labels from `LineWatchShell`**

Update each `FloatingPanelShell` call:

```tsx
<FloatingPanelShell panel="alerts" mobileSheetLabel="Active alerts">
<FloatingPanelShell panel="delays" mobileSheetLabel="Delays">
<FloatingPanelShell panel="reduced-speed-zones" mobileSheetLabel="Reduced Speed Zones">
<FloatingPanelShell panel="closures" mobileSheetLabel="Upcoming closures">
<FloatingPanelShell panel="commutes" mobileSheetLabel="Saved commutes">
<FloatingPanelShell panel="analytics" mobileSheetLabel="Reliability analytics">
```

Keep the `status` and `more` labels from earlier tasks.

- [ ] **Step 3: Add mobile bottom-sheet CSS**

Append or merge into `globals.css`:

```css
.mobile-sheet-grabber {
  display: none;
}

@media (max-width: 767px) {
  .floating-panel-shell {
    animation: floating-mobile-sheet-enter 180ms cubic-bezier(0.22, 1, 0.36, 1);
    bottom: calc(var(--mobile-bottom-nav-height) + var(--mobile-safe-bottom));
    left: 0;
    max-height: min(88vh, calc(100vh - var(--mobile-bottom-nav-height) - var(--mobile-safe-bottom) - 20px));
    padding: 0 8px 8px;
    position: fixed;
    right: 0;
    top: auto;
    width: 100%;
    z-index: 44;
  }

  .floating-panel-scroll {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px 8px 0 0;
    box-shadow: 0 -18px 44px rgba(0, 0, 0, 0.38);
    gap: 0;
    max-height: inherit;
    overflow-y: auto;
    padding: 8px 8px 12px;
  }

  .mobile-sheet-grabber {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 999px;
    display: block;
    height: 4px;
    left: 50%;
    position: absolute;
    top: 8px;
    transform: translateX(-50%);
    width: 44px;
    z-index: 1;
  }

  .floating-panel-shell .panel,
  .floating-panel-shell .commute-panel,
  .floating-panel-shell .analytics-panel {
    border-radius: 8px;
    box-shadow: none;
  }
}

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

- [ ] **Step 4: Run tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: fewer failures; continue.

## Task 6: Simplify Mobile Map Chrome

**Files:**
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add class names in `InteractiveTtcMap`**

Find the top-right utility wrapper:

```tsx
<div className="absolute top-4 sm:top-6 right-4 sm:right-6 z-20 flex items-center gap-2 pointer-events-auto">
```

Change it to:

```tsx
<div className="map-utility-cluster absolute top-4 sm:top-6 right-4 sm:right-6 z-20 flex items-center gap-2 pointer-events-auto">
```

Find the map control rail. Wrap zoom controls in a group:

```tsx
<div className="map-control-zoom-group">
  <button
    onClick={zoomOut}
    className="map-control-button group"
    title="Zoom out"
    aria-label="Zoom out"
  >
    <ZoomOut size={20} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
    <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Out</span>
  </button>

  <div className="map-control-divider" aria-hidden="true" />

  <div className="map-control-slider flex flex-col items-center justify-center gap-1.5 mx-0.5 sm:mx-1">
    <input
      type="range"
      min="0.2"
      max="5"
      step="0.05"
      value={relativeScale}
      onChange={(e) => zoomToScale(parseFloat(e.target.value))}
      className="w-16 md:w-20 accent-slate-900 dark:accent-white hover:accent-blue-600 dark:hover:accent-blue-400 cursor-pointer h-1.5 rounded-lg appearance-none bg-slate-900/20 dark:bg-white/30 transition-all outline-none"
      title="Zoom level"
      aria-label="Zoom level slider"
    />
    <span className="text-[10px] font-mono font-black select-none tracking-wider">
      {Math.round(relativeScale * 100)}%
    </span>
  </div>

  <button
    onClick={zoomIn}
    className="map-control-button group"
    title="Zoom in"
    aria-label="Zoom in"
  >
    <ZoomIn size={20} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
    <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">In</span>
  </button>
</div>
```

The final rail structure should be:

```tsx
<div className="map-control-rail absolute top-14 sm:top-[92px] left-1/2 -translate-x-1/2 z-30 flex flex-row items-center justify-center gap-1 sm:gap-2 pointer-events-auto">
  <button
    onClick={recenter}
    className="map-control-button group"
    title="Center view"
    aria-label="Center map view"
  >
    <Locate size={20} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
    <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Center</span>
  </button>

  <div className="map-control-zoom-group">
    <button onClick={zoomOut} className="map-control-button group" title="Zoom out" aria-label="Zoom out">
      <ZoomOut size={20} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
      <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Out</span>
    </button>
    <div className="map-control-divider" aria-hidden="true" />
    <div className="map-control-slider flex flex-col items-center justify-center gap-1.5 mx-0.5 sm:mx-1">
      <input
        type="range"
        min="0.2"
        max="5"
        step="0.05"
        value={relativeScale}
        onChange={(e) => zoomToScale(parseFloat(e.target.value))}
        className="w-16 md:w-20 accent-slate-900 dark:accent-white hover:accent-blue-600 dark:hover:accent-blue-400 cursor-pointer h-1.5 rounded-lg appearance-none bg-slate-900/20 dark:bg-white/30 transition-all outline-none"
        title="Zoom level"
        aria-label="Zoom level slider"
      />
      <span className="text-[10px] font-mono font-black select-none tracking-wider">
        {Math.round(relativeScale * 100)}%
      </span>
    </div>
    <button onClick={zoomIn} className="map-control-button group" title="Zoom in" aria-label="Zoom in">
      <ZoomIn size={20} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
      <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">In</span>
    </button>
  </div>
</div>
```

Use `display: contents` on desktop for the group so desktop visuals do not change.

- [ ] **Step 2: Hide desktop top chrome and legend on mobile**

In `LineWatchShell.tsx`, add `desktop-top-chrome` to the header class:

```tsx
<header className={`desktop-top-chrome absolute top-0 left-0 w-full p-4 sm:p-6 z-40 flex justify-between items-start pointer-events-none`}>
```

Add `desktop-map-legend` to the legend aside:

```tsx
<aside className="desktop-map-legend fixed bottom-6 right-6 z-20 pointer-events-none">
```

- [ ] **Step 3: Add mobile map chrome CSS**

Append to `globals.css`:

```css
.map-control-zoom-group {
  display: contents;
}

@media (max-width: 767px) {
  .desktop-top-chrome,
  .desktop-map-legend,
  .map-utility-cluster {
    display: none !important;
  }

  .map-control-rail {
    bottom: calc(var(--mobile-bottom-nav-height) + var(--mobile-safe-bottom) + var(--mobile-status-peek-height) + 18px);
    left: auto;
    right: 12px;
    top: auto !important;
    transform: none;
  }

  .map-control-zoom-group {
    display: none !important;
  }

  .map-control-button {
    height: 48px;
    min-width: 48px;
    width: 48px;
  }

  .map-control-button span {
    display: none;
  }
}
```

- [ ] **Step 4: Verify desktop source remains**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: source tests pass or fail only on search/smoke updates.

## Task 7: Make Station Search Mobile-Native

**Files:**
- Modify: `frontend/src/components/StationSearchPanel.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add stable mobile attributes and optional line back button**

Ensure the root panel already has `data-station-search-panel`. If not, add it to the root element:

```tsx
data-station-search-panel
data-open={open ? "true" : "false"}
data-expanded={isExpanded ? "true" : "false"}
```

Inside the stations column, add a mobile-only back button above the station list:

```tsx
{expandedLineId ? (
  <button
    type="button"
    className="station-search-mobile-back"
    onClick={() => setExpandedLineId(null)}
  >
    Back to lines
  </button>
) : null}
```

Do not remove existing keyboard logic.

- [ ] **Step 2: Add mobile search sheet CSS**

Append or merge:

```css
.station-search-mobile-back {
  display: none;
}

@media (max-width: 767px) {
  .station-search-panel {
    border-radius: 8px 8px 0 0;
    bottom: calc(var(--mobile-bottom-nav-height) + var(--mobile-safe-bottom));
    left: 8px;
    max-height: min(82vh, calc(100vh - var(--mobile-bottom-nav-height) - var(--mobile-safe-bottom) - 18px));
    position: fixed;
    right: 8px;
    top: auto;
    transform: translateY(20px);
    transform-origin: bottom center;
    width: auto;
    z-index: 44;
  }

  .station-search-panel.open {
    transform: translateY(0);
  }

  .station-search-panel[data-expanded="true"] {
    width: auto;
  }

  .station-search-browse-container {
    flex-direction: column;
    gap: 10px;
  }

  .station-search-lines-column {
    flex: 0 0 auto;
    max-height: 46vh;
    padding-right: 0;
  }

  .station-search-panel[data-expanded="true"] .station-search-lines-column {
    display: none;
  }

  .station-search-stations-column {
    border-left: 0;
    opacity: 1;
    overflow-y: auto;
    padding-left: 0;
    padding-right: 0;
    transform: none;
    width: auto;
  }

  .station-search-panel:not([data-expanded="true"]) .station-search-stations-column {
    display: none;
  }

  .station-search-mobile-back {
    align-items: center;
    background: var(--panel-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    display: flex;
    font-size: 12px;
    font-weight: 900;
    min-height: 42px;
    padding: 8px 10px;
  }
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: fixture/source tests pass before smoke updates, or failures clearly point to source assertions that need exact regex correction.

## Task 8: Update Mobile Smoke Tests

**Files:**
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Add mobile-aware helpers**

Replace `openDashboardMenu` with:

```ts
async function openDashboardMenu(page: Page, isMobile = false) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  if (isMobile) {
    await page.getByRole("button", { name: "More" }).click();
  } else {
    await page.getByRole("button", { name: "Toggle menu" }).click();
  }
}

async function openServiceCategory(page: Page, isMobile: boolean, name: RegExp | string) {
  if (isMobile) {
    await page.getByRole("button", { name: "Status" }).click();
    await page.getByRole("button", { name }).click();
  } else {
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await page.getByRole("menuitem", { name }).click();
  }
}
```

- [ ] **Step 2: Pass `isMobile` into helper call sites**

For tests that currently call `openDashboardMenu(page)`, change the function signature to include `isMobile` and call:

```ts
await openDashboardMenu(page, isMobile);
```

For tests that open service categories through the desktop menu, use `openServiceCategory(page, isMobile, /Delays/)` or the matching label.

Examples:

```ts
test("renders the seeded dashboard API payload", async ({ page, request, isMobile }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "Status" }).click();
  } else {
    await page.getByRole("button", { name: "Toggle menu" }).click();
  }

  await expect(page.getByText("Stub API Yonge-University", { exact: true })).toBeVisible();
});
```

- [ ] **Step 3: Add a dedicated mobile UX smoke test**

Add:

```ts
test("mobile uses bottom navigation and status sheets", async ({ page, request, isMobile }) => {
  test.skip(!isMobile, "mobile-only bottom navigation smoke");
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await expect(page.getByRole("navigation", { name: "Primary mobile navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle menu" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open current service status" })).toBeVisible();

  await page.getByRole("button", { name: "Status" }).click();
  await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
  await page.getByRole("button", { name: /Delays/ }).click();
  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();

  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("searchbox", { name: "Search mapped stations" })).toBeFocused();

  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("heading", { name: "More" })).toBeVisible();
  await expect(page.getByText("High Contrast Mode")).toBeVisible();
});
```

- [ ] **Step 4: Run smoke tests**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: pass after updating mobile-specific expectations.

## Task 9: Final Verification And Polish

**Files:**
- Modify as needed based on test output.

- [ ] **Step 1: Run frontend fixture tests**

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint**

```bash
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 4: Run build**

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 5: Run smoke tests**

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS for desktop and mobile Chromium.

- [ ] **Step 6: Manual mobile viewport check**

Start the dev server:

```bash
npm --prefix frontend run dev
```

Open `http://localhost:3000` with a mobile viewport and verify:

- First screen shows map, status peek, and bottom nav.
- Top-left hamburger is hidden on mobile.
- Status opens the status sheet.
- Category drill-ins open bottom sheets.
- Search opens as a bottom sheet.
- Station details still open as a station bottom sheet.
- More opens account/settings/tools.
- Map recenter control does not overlap the bottom nav or status peek.
- Desktop viewport still shows existing desktop controls and layout.

## Completion Criteria

Do not call the work complete until all relevant frontend checks have run and passed:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

If any command cannot run because of local environment, sandboxing, missing browsers, or server port conflicts, report the exact command and failure.

## Handoff Notes For Gemini

- Keep edits scoped to frontend mobile UX.
- Do not rewrite `InteractiveTtcMap`.
- Do not remove desktop menu, desktop legend, or desktop map controls.
- Do not modify backend API contracts.
- Do not add dependencies.
- Use the existing TTC line colors.
- Do not claim LineWatch TO is official TTC software.
- Do not claim live station arrivals.
- Preserve fixture fallback copy.
- If a source guardrail regex fails because implementation names differ, either align names with this plan or update the regex only if the behavior is genuinely implemented.

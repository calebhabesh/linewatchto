# Alert History Search And Line Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a simple search field and transit-line selector to Alert History, and fix the lifecycle chips so `Alerts` shows the opened or updated alert event instead of a clearance row.

**Architecture:** Keep this frontend-only. The existing `/api/alert-history?period=...&limit=300` response already includes the incident, line, location, source, cause, and lifecycle-event fields needed for client-side search and line selection. Move display-event selection and filtering into a small pure helper so the broken `Alerts` lifecycle behavior is covered by real fixture tests instead of source-only assertions.

**Tech Stack:** Next.js App Router, React, TypeScript, plain CSS in `frontend/src/app/globals.css`, Node built-in test runner.

---

## Product Contract

- Preserve the existing period chips: `Today`, `7 days`, `30 days`.
- Preserve the lifecycle chips: `All`, `Alerts`, `Clearances`.
- Fix `Alerts` so a cleared incident with both `cleared` and `opened` events renders the latest non-cleared event, such as `Alert opened` or `Alert updated`.
- Fix `Clearances` so it renders the clearance event and uses cleared styling.
- Add a compact search input with `aria-label="Search alert history"`.
- Search should match line number, line name, title, location, direction, cause, source, alert id, source id, and lifecycle event text.
- Add a dropdown with `aria-label="Transit line"` and options sorted in TTC line order.
- Treat the requested "sort by transit line" as a line selector/filter dropdown. Within the selected line, keep the backend's newest-first lifecycle order so the history remains chronological.
- The dropdown should include `All lines` and one option per line present in the loaded period. If history contains a record without line metadata, include `Line unavailable` after known lines.
- Changing period should keep the selected line only when that line exists in the newly loaded period; otherwise reset to `All lines`.
- Keep this scoped to Alert History. Do not change backend API parameters, dashboard alert cards, active alerts, notification settings, or mobile navigation.

## Current Code Context

- `frontend/src/components/AlertHistoryTimeline.tsx` currently owns period state, lifecycle-filter state, API loading, and rendering.
- `frontend/src/app/alert-history-data.ts` defines `AlertHistoryIncident` and `AlertHistoryEvent`.
- `frontend/tests/alert-history-ui.test.mjs` mostly verifies source contracts by reading component and CSS files.
- `frontend/src/app/globals.css` contains Alert History styles around `.alert-history-timeline`.
- The bug is caused by incident-level filtering plus `incident.events[0]` rendering. Backend rows are newest-first, so a cleared incident can have `events[0].state === "cleared"` even when the `Alerts` chip includes that incident because it also has an older `opened` event.

## File Map

### Create

- `frontend/src/components/alert-history-filters.ts`
  - Pure helper functions for lifecycle display-event selection, text search, line option generation, and visible item construction.
- `frontend/tests/alert-history-filters.test.mjs`
  - Functional tests for the lifecycle bug, search, and line selector behavior.

### Modify

- `frontend/src/components/AlertHistoryTimeline.tsx`
  - Use the helper, add search state, add line-selector state, render new controls, and render the selected lifecycle event.
- `frontend/src/app/globals.css`
  - Add scoped styles for the search field and line dropdown.
- `frontend/tests/alert-history-ui.test.mjs`
  - Add source-contract checks for the new controls and helper usage.

---

## Task 1: Add Focused Failing Tests For Alert History Filtering

**Files:**

- Create: `frontend/tests/alert-history-filters.test.mjs`

- [ ] **Step 1: Confirm worktree state**

Run:

```bash
git status --short
```

Expected: this repository currently has unrelated uncommitted frontend and backend changes. Do not reset, checkout, or revert any user-owned changes.

- [ ] **Step 2: Create the focused test file**

Create `frontend/tests/alert-history-filters.test.mjs` with this content:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALL_LINES_VALUE,
  buildAlertHistoryLineOptions,
  filterAndSortAlertHistory,
  selectDisplayEvent,
} from "../src/components/alert-history-filters.ts";

function event(overrides) {
  return {
    id: overrides.id,
    state: overrides.state,
    label: overrides.label,
    happenedAt: overrides.happenedAt,
    title: overrides.title ?? "Line 2 delay",
    description: overrides.description ?? "Delay at Warden while crews respond.",
    location: overrides.location ?? "Warden",
    displayDirection: overrides.displayDirection ?? "Westbound",
    cause: overrides.cause ?? "Mechanical Problem",
    source: overrides.source ?? "TTC Live Alerts",
  };
}

function incident(overrides) {
  return {
    alertId: overrides.alertId,
    sourceId: overrides.sourceId ?? `${overrides.alertId}-source`,
    lineId: overrides.lineId,
    lineNumber: overrides.lineNumber,
    lineName: overrides.lineName,
    eventType: overrides.eventType ?? "delay",
    title: overrides.title,
    location: overrides.location,
    displayDirection: overrides.displayDirection ?? null,
    source: overrides.source ?? "TTC Live Alerts",
    cause: overrides.cause ?? null,
    status: overrides.status,
    firstSeenAt: overrides.firstSeenAt ?? "2026-06-23T12:05:00-04:00",
    lastUpdatedAt: overrides.lastUpdatedAt ?? null,
    clearedAt: overrides.clearedAt ?? null,
    durationMinutes: overrides.durationMinutes ?? null,
    events: overrides.events,
  };
}

const clearedLine2Incident = incident({
  alertId: "ttc-route-2-warden",
  lineId: "line-2",
  lineNumber: "2",
  lineName: "Bloor-Danforth",
  title: "Line 2 delay at Warden",
  location: "Warden",
  displayDirection: "Westbound",
  cause: "Mechanical Problem",
  status: "cleared",
  clearedAt: "2026-06-23T12:20:00-04:00",
  durationMinutes: 15,
  events: [
    event({
      id: 2,
      state: "cleared",
      label: "Service restored",
      happenedAt: "2026-06-23T12:20:00-04:00",
    }),
    event({
      id: 1,
      state: "opened",
      label: "Alert opened",
      happenedAt: "2026-06-23T12:05:00-04:00",
    }),
  ],
});

const activeLine5Incident = incident({
  alertId: "ttc-route-5-avenue",
  lineId: "line-5",
  lineNumber: "5",
  lineName: "Eglinton",
  title: "Line 5 reduced speed zone",
  location: "Avenue to Mount Pleasant",
  displayDirection: "Eastbound",
  cause: "Track Work",
  status: "active",
  events: [
    event({
      id: 3,
      state: "updated",
      label: "Alert updated",
      happenedAt: "2026-06-23T12:25:00-04:00",
      title: "Line 5 reduced speed zone",
      description: "Reduced speed zone eastbound near Avenue.",
      location: "Avenue to Mount Pleasant",
      displayDirection: "Eastbound",
      cause: "Track Work",
    }),
  ],
});

const unknownLineIncident = incident({
  alertId: "ttc-route-unknown",
  lineId: null,
  lineNumber: null,
  lineName: null,
  title: "TTC service alert",
  location: "",
  status: "active",
  events: [
    event({
      id: 4,
      state: "opened",
      label: "Alert opened",
      happenedAt: "2026-06-23T12:10:00-04:00",
      title: "TTC service alert",
      location: "",
    }),
  ],
});

describe("alert history filtering", () => {
  it("selects the opened event for the Alerts chip when a clearance is newest", () => {
    const selected = selectDisplayEvent(clearedLine2Incident, "alerts");

    assert.equal(selected?.state, "opened");
    assert.equal(selected?.label, "Alert opened");
  });

  it("selects the clearance event for the Clearances chip", () => {
    const selected = selectDisplayEvent(clearedLine2Incident, "clearances");

    assert.equal(selected?.state, "cleared");
    assert.equal(selected?.label, "Service restored");
  });

  it("filters search text across incident and lifecycle event fields", () => {
    const visible = filterAndSortAlertHistory(
      [clearedLine2Incident, activeLine5Incident],
      {
        lifecycleFilter: "alerts",
        lineId: ALL_LINES_VALUE,
        searchQuery: "warden mechanical opened",
      },
    );

    assert.equal(visible.length, 1);
    assert.equal(visible[0].incident.alertId, "ttc-route-2-warden");
    assert.equal(visible[0].displayEvent?.state, "opened");
  });

  it("filters by selected transit line while preserving chronological input order", () => {
    const visible = filterAndSortAlertHistory(
      [activeLine5Incident, clearedLine2Incident],
      {
        lifecycleFilter: "all",
        lineId: "line-2",
        searchQuery: "",
      },
    );

    assert.deepEqual(
      visible.map((item) => item.incident.alertId),
      ["ttc-route-2-warden"],
    );
  });

  it("builds line selector options in TTC line order with unknown lines last", () => {
    const options = buildAlertHistoryLineOptions([
      activeLine5Incident,
      unknownLineIncident,
      clearedLine2Incident,
    ]);

    assert.deepEqual(
      options.map((option) => option.label),
      ["All lines", "Line 2 Bloor-Danforth", "Line 5 Eglinton", "Line unavailable"],
    );
  });
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
node --test frontend/tests/alert-history-filters.test.mjs
```

Expected: FAIL with a module-not-found error for `frontend/src/components/alert-history-filters.ts`.

---

## Task 2: Add Pure Alert History Filter Helpers

**Files:**

- Create: `frontend/src/components/alert-history-filters.ts`

- [ ] **Step 1: Create the helper file**

Create `frontend/src/components/alert-history-filters.ts` with this content:

```ts
import type {
  AlertHistoryEvent,
  AlertHistoryIncident,
} from "../app/alert-history-data";

export type AlertHistoryLifecycleFilter = "all" | "alerts" | "clearances";

export type AlertHistoryLineOption = {
  value: string;
  label: string;
  sortKey: number;
};

export type AlertHistoryViewItem = {
  incident: AlertHistoryIncident;
  displayEvent: AlertHistoryEvent | null;
  cleared: boolean;
};

export type AlertHistoryFilterControls = {
  lifecycleFilter: AlertHistoryLifecycleFilter;
  lineId: string;
  searchQuery: string;
};

export const ALL_LINES_VALUE = "all";
export const UNKNOWN_LINE_VALUE = "__unknown";

const TTC_LINE_ORDER = new Map<string, number>([
  ["line-1", 1],
  ["line-2", 2],
  ["line-4", 4],
  ["line-5", 5],
  ["line-6", 6],
]);

export function filterAndSortAlertHistory(
  incidents: AlertHistoryIncident[],
  controls: AlertHistoryFilterControls,
): AlertHistoryViewItem[] {
  const query = normalizeSearchText(controls.searchQuery);

  return incidents.flatMap((incident) => {
    const displayEvent = selectDisplayEvent(incident, controls.lifecycleFilter);
    if (!displayEvent) {
      return [];
    }

    if (
      controls.lineId !== ALL_LINES_VALUE &&
      lineValue(incident) !== controls.lineId
    ) {
      return [];
    }

    if (query && !incidentMatchesSearch(incident, query)) {
      return [];
    }

    return [{
      incident,
      displayEvent,
      cleared: displayEvent.state === "cleared",
    }];
  });
}

export function selectDisplayEvent(
  incident: AlertHistoryIncident,
  filter: AlertHistoryLifecycleFilter,
): AlertHistoryEvent | null {
  if (filter === "clearances") {
    return incident.events.find((event) => event.state === "cleared") ?? null;
  }

  if (filter === "alerts") {
    return incident.events.find((event) => event.state !== "cleared") ?? null;
  }

  return incident.events[0] ?? null;
}

export function buildAlertHistoryLineOptions(
  incidents: AlertHistoryIncident[],
): AlertHistoryLineOption[] {
  const byValue = new Map<string, AlertHistoryLineOption>();

  for (const incident of incidents) {
    const value = lineValue(incident);
    if (byValue.has(value)) {
      continue;
    }
    byValue.set(value, {
      value,
      label: lineOptionLabel(incident),
      sortKey: lineSortKey(incident),
    });
  }

  return [
    { value: ALL_LINES_VALUE, label: "All lines", sortKey: -1 },
    ...Array.from(byValue.values()).sort((a, b) => {
      if (a.sortKey !== b.sortKey) {
        return a.sortKey - b.sortKey;
      }
      return a.label.localeCompare(b.label);
    }),
  ];
}

function incidentMatchesSearch(
  incident: AlertHistoryIncident,
  normalizedQuery: string,
): boolean {
  const searchable = normalizeSearchText([
    incident.alertId,
    incident.sourceId,
    incident.lineId,
    incident.lineNumber,
    incident.lineName,
    incident.eventType,
    incident.title,
    incident.location,
    incident.displayDirection,
    incident.source,
    incident.cause,
    incident.status,
    ...incident.events.flatMap((event) => [
      event.state,
      event.label,
      event.title,
      event.description,
      event.location,
      event.displayDirection,
      event.cause,
      event.source,
    ]),
  ].filter(Boolean).join(" "));

  return normalizedQuery
    .split(" ")
    .every((token) => searchable.includes(token));
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function lineValue(incident: AlertHistoryIncident): string {
  return incident.lineId || UNKNOWN_LINE_VALUE;
}

function lineOptionLabel(incident: AlertHistoryIncident): string {
  if (!incident.lineNumber) {
    return "Line unavailable";
  }
  return incident.lineName
    ? `Line ${incident.lineNumber} ${incident.lineName}`
    : `Line ${incident.lineNumber}`;
}

function lineSortKey(incident: AlertHistoryIncident): number {
  if (incident.lineId) {
    const knownOrder = TTC_LINE_ORDER.get(incident.lineId);
    if (knownOrder !== undefined) {
      return knownOrder;
    }
  }

  const parsedLineNumber = Number.parseInt(incident.lineNumber ?? "", 10);
  if (Number.isFinite(parsedLineNumber)) {
    return parsedLineNumber;
  }

  return 999;
}
```

- [ ] **Step 2: Run the focused helper test and verify GREEN**

Run:

```bash
node --test frontend/tests/alert-history-filters.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Commit the helper and test**

Run:

```bash
git add frontend/src/components/alert-history-filters.ts frontend/tests/alert-history-filters.test.mjs
git commit -m "test: cover alert history search and line filters"
```

Expected: commit succeeds. If the user asked not to commit in this session, skip this step and keep the files staged or unstaged according to their instruction.

---

## Task 3: Wire Search, Line Selector, And Event-Aware Rendering

**Files:**

- Modify: `frontend/src/components/AlertHistoryTimeline.tsx`

- [ ] **Step 1: Update imports and lifecycle filter type**

In `frontend/src/components/AlertHistoryTimeline.tsx`, replace the lucide import and local filter type with this:

```ts
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clock3, Loader2, Search } from "lucide-react";
import {
  getAlertHistory,
  type AlertHistoryIncident,
  type AlertHistoryPeriod,
} from "../app/alert-history-data";
import { formatRelativeImpactTime } from "../app/impact-time";
import { formatCause, formatCompactLocation, lineColor } from "./ImpactCardFields";
import {
  ALL_LINES_VALUE,
  buildAlertHistoryLineOptions,
  filterAndSortAlertHistory,
  type AlertHistoryLifecycleFilter,
  type AlertHistoryViewItem,
} from "./alert-history-filters";
```

Then delete this local type:

```ts
type Filter = "all" | "alerts" | "clearances";
```

Change the `FILTERS` constant to:

```ts
const FILTERS: Array<{ value: AlertHistoryLifecycleFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "alerts", label: "Alerts" },
  { value: "clearances", label: "Clearances" },
];
```

- [ ] **Step 2: Add state for search and line selection**

Inside `AlertHistoryTimeline`, replace:

```ts
const [filter, setFilter] = useState<Filter>("all");
```

with:

```ts
const [filter, setFilter] = useState<AlertHistoryLifecycleFilter>("all");
const [searchQuery, setSearchQuery] = useState("");
const [selectedLineId, setSelectedLineId] = useState(ALL_LINES_VALUE);
```

- [ ] **Step 3: Replace visible incident filtering with helper-driven items**

Replace the existing `visibleIncidents` `useMemo` block with:

```ts
const lineOptions = useMemo(() => buildAlertHistoryLineOptions(history), [history]);

useEffect(() => {
  if (!lineOptions.some((option) => option.value === selectedLineId)) {
    setSelectedLineId(ALL_LINES_VALUE);
  }
}, [lineOptions, selectedLineId]);

const visibleItems = useMemo(() => filterAndSortAlertHistory(history, {
  lifecycleFilter: filter,
  lineId: selectedLineId,
  searchQuery,
}), [filter, history, searchQuery, selectedLineId]);
```

- [ ] **Step 4: Add search and line selector controls**

In the controls block, immediately after the lifecycle chip group, add:

```tsx
<div className="alert-history-search-row" aria-label="Alert history search and line selector">
  <label className="alert-history-search-field">
    <Search size={14} aria-hidden="true" />
    <input
      type="search"
      value={searchQuery}
      onChange={(event) => setSearchQuery(event.target.value)}
      placeholder="Search history"
      aria-label="Search alert history"
    />
  </label>
  <label className="alert-history-line-filter">
    <span>Line</span>
    <select
      value={selectedLineId}
      onChange={(event) => setSelectedLineId(event.target.value)}
      aria-label="Transit line"
    >
      {lineOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
</div>
```

The full controls section should now contain period chips, divider, lifecycle chips, then the search row.

- [ ] **Step 5: Render visible items instead of raw incidents**

Replace:

```tsx
) : visibleIncidents.length === 0 ? (
  <p className="notification-settings-note alert-history-empty">
    No alert lifecycle events found for this period.
  </p>
) : (
  <ol className="alert-history-list">
    {visibleIncidents.map((incident) => (
      <HistoryIncident key={`${incident.alertId}-${incident.clearedAt ?? incident.firstSeenAt ?? incident.title}`} incident={incident} />
    ))}
  </ol>
)}
```

with:

```tsx
) : visibleItems.length === 0 ? (
  <p className="notification-settings-note alert-history-empty">
    No alert lifecycle events match the selected filters.
  </p>
) : (
  <ol className="alert-history-list">
    {visibleItems.map((item) => (
      <HistoryIncident
        key={`${item.incident.alertId}-${item.displayEvent?.id ?? item.incident.clearedAt ?? item.incident.firstSeenAt ?? item.incident.title}`}
        item={item}
      />
    ))}
  </ol>
)}
```

- [ ] **Step 6: Render the selected lifecycle event**

Replace the `HistoryIncident` function signature and first lines:

```tsx
function HistoryIncident({ incident }: { incident: AlertHistoryIncident }) {
  const primaryEvent = incident.events[0];
  const cleared = incident.status === "cleared";
  const time = primaryEvent?.happenedAt ?? incident.clearedAt ?? incident.firstSeenAt ?? "";
  const title = compactHistoryTitle(incident);
  const statusLabel = cleared ? "Cleared" : formatHistoryStatusLabel(primaryEvent?.label);
```

with:

```tsx
function HistoryIncident({ item }: { item: AlertHistoryViewItem }) {
  const { incident, displayEvent, cleared } = item;
  const time = displayEvent?.happenedAt ?? incident.clearedAt ?? incident.firstSeenAt ?? "";
  const title = compactHistoryTitle(incident);
  const statusLabel = cleared ? "Cleared" : formatHistoryStatusLabel(displayEvent?.label);
```

Do not change the `facts` array or the `details` list. The details list should continue showing the full lifecycle trail for the incident.

- [ ] **Step 7: Run focused frontend tests**

Run:

```bash
node --test frontend/tests/alert-history-filters.test.mjs frontend/tests/alert-history-ui.test.mjs
```

Expected: `alert-history-filters.test.mjs` passes. `alert-history-ui.test.mjs` may fail until Task 5 adds source-contract assertions for the new controls.

- [ ] **Step 8: Commit the component wiring**

Run:

```bash
git add frontend/src/components/AlertHistoryTimeline.tsx
git commit -m "feat: add alert history search and line selector"
```

Expected: commit succeeds. If the user asked not to commit in this session, skip this step.

---

## Task 4: Add Scoped Alert History Control Styles

**Files:**

- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add search and dropdown styles**

In `frontend/src/app/globals.css`, after the `.alert-history-chip-group` block, add:

```css
.alert-history-search-row {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: minmax(10rem, 1fr) minmax(8.5rem, auto);
  width: 100%;
}

.alert-history-search-field,
.alert-history-line-filter {
  align-items: center;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 0.5rem;
  background: rgba(15, 23, 42, 0.04);
  color: rgb(51, 65, 85);
  display: flex;
  min-height: 2.25rem;
  min-width: 0;
}

.alert-history-search-field {
  gap: 0.4rem;
  padding: 0 0.65rem;
}

.alert-history-search-field input,
.alert-history-line-filter select {
  background: transparent;
  border: 0;
  color: inherit;
  font-size: 0.78rem;
  font-weight: 750;
  min-width: 0;
  outline: 0;
  width: 100%;
}

.alert-history-search-field input::placeholder {
  color: rgb(100, 116, 139);
}

.alert-history-line-filter {
  gap: 0.35rem;
  padding: 0 0.55rem;
}

.alert-history-line-filter span {
  color: rgb(100, 116, 139);
  font-size: 0.62rem;
  font-weight: 900;
  text-transform: uppercase;
}

.alert-history-line-filter select {
  cursor: pointer;
}

.dark .alert-history-search-field,
.dark .alert-history-line-filter,
.high-contrast .alert-history-search-field,
.high-contrast .alert-history-line-filter {
  background: rgba(15, 23, 42, 0.75);
  color: rgb(226, 232, 240);
}

.dark .alert-history-search-field input::placeholder,
.dark .alert-history-line-filter span,
.high-contrast .alert-history-search-field input::placeholder,
.high-contrast .alert-history-line-filter span {
  color: rgb(148, 163, 184);
}
```

- [ ] **Step 2: Add mobile stacking for the new controls**

Inside the existing `@media (max-width: 480px)` block for Alert History controls, after `.alert-history-divider`, add:

```css
  .alert-history-search-row {
    grid-template-columns: minmax(0, 1fr);
  }
```

- [ ] **Step 3: Run focused source tests**

Run:

```bash
node --test frontend/tests/alert-history-ui.test.mjs
```

Expected before Task 5: PASS if no new assertions have been added yet.

- [ ] **Step 4: Commit CSS**

Run:

```bash
git add frontend/src/app/globals.css
git commit -m "style: refine alert history controls"
```

Expected: commit succeeds. If the user asked not to commit in this session, skip this step.

---

## Task 5: Update UI Source-Contract Tests

**Files:**

- Modify: `frontend/tests/alert-history-ui.test.mjs`

- [ ] **Step 1: Add helper source loading**

After the existing `timelineSource` constant, add:

```js
const filterSource = readFileSync(
  new URL("../src/components/alert-history-filters.ts", import.meta.url),
  "utf8",
);
```

- [ ] **Step 2: Add assertions for search and line controls**

Inside the existing `describe("alert history timeline UI", () => { ... })`, add:

```js
it("renders search and transit line selector controls", () => {
  assert.match(timelineSource, /Search alert history/);
  assert.match(timelineSource, /Transit line/);
  assert.match(timelineSource, /Search\s+size=\{14\}/);
  assert.match(timelineSource, /buildAlertHistoryLineOptions/);
  assert.match(timelineSource, /filterAndSortAlertHistory/);
  assert.match(cssSource, /\.alert-history-search-row/);
  assert.match(cssSource, /\.alert-history-search-field/);
  assert.match(cssSource, /\.alert-history-line-filter/);
});
```

- [ ] **Step 3: Add assertions for event-aware lifecycle filtering**

Inside the same `describe` block, add:

```js
it("uses event-aware lifecycle filtering instead of incident-only filtering", () => {
  assert.match(filterSource, /selectDisplayEvent/);
  assert.match(filterSource, /filter === "alerts"/);
  assert.match(filterSource, /event\.state !== "cleared"/);
  assert.match(filterSource, /filter === "clearances"/);
  assert.match(filterSource, /event\.state === "cleared"/);
  assert.doesNotMatch(timelineSource, /history\.filter\(\(incident\) => incident\.status === "cleared"\)/);
  assert.doesNotMatch(timelineSource, /incident\.events\.some\(\(event\) => event\.state !== "cleared"\)/);
});
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
node --test frontend/tests/alert-history-filters.test.mjs frontend/tests/alert-history-ui.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit test updates**

Run:

```bash
git add frontend/tests/alert-history-ui.test.mjs
git commit -m "test: assert alert history controls"
```

Expected: commit succeeds. If the user asked not to commit in this session, skip this step.

---

## Task 6: Final Verification

**Files:**

- Verify only; no files should be edited in this task.

- [ ] **Step 1: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 2: Run frontend typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run frontend lint**

Run:

```bash
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 4: Run frontend build because this changes user-visible UI**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 5: Manual browser check**

Run:

```bash
npm --prefix frontend run dev
```

Open the local frontend URL printed by Next.js. Navigate to `More` then `Alert History`.

Expected browser behavior:

- The top row still shows `Today`, `7 days`, `30 days`, `All`, `Alerts`, and `Clearances`.
- The new search input and line dropdown fit without overlap at desktop and mobile widths.
- Selecting `Alerts` shows an alert-opened or alert-updated status when the incident also has a later clearance.
- Selecting `Clearances` shows cleared rows.
- Searching for a station, line name, cause, or source narrows the visible list.
- Selecting a line shows only incidents from that line.
- Selecting a period that does not contain the selected line resets the dropdown to `All lines`.

- [ ] **Step 6: Stop the dev server**

Stop the Next.js dev server with `Ctrl-C` in the terminal where it is running.

- [ ] **Step 7: Report changed files and verification**

Final response should list:

- `frontend/src/components/alert-history-filters.ts`
- `frontend/src/components/AlertHistoryTimeline.tsx`
- `frontend/src/app/globals.css`
- `frontend/tests/alert-history-filters.test.mjs`
- `frontend/tests/alert-history-ui.test.mjs`

Final response should include the exact verification commands and whether each passed. If a command fails because of the current dirty worktree, missing dependencies, or local environment issues, include the exact failure and do not claim completion.

---

## Self-Review Notes For Gemini

- This plan intentionally avoids backend changes. The requested search and line selector operate over the current period's loaded incidents.
- This plan fixes the `Alerts` chip by selecting the display event before rendering, not by changing the backend event order.
- The line dropdown is a filter with sorted options, while rows remain newest-first. Reordering all rows by line would make lifecycle history less useful because it would break chronology.
- The helper tests are the most important part of the change. Do not replace them with regex-only tests.

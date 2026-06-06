# Saved Commute Route UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Saved Commutes feel like a real route tool: searchable station picking, visible plotting progress, expandable route stops, map path preview, and cheaper weighted route computation.

**Architecture:** Keep the account DTO contract from Gemini's first pass: saved commutes already return `path.stationIds` and `path.segmentIds`. Reuse the existing station-search helper functions for the compact picker, reuse the existing SVG segment-composition pipeline for map previews, and cache the backend weighted graph snapshot so each save does not re-run the median GTFS travel-time query.

**Tech Stack:** Spring Boot, Java 21, JUnit/Mockito, Next.js App Router, React, TypeScript, Tailwind/global CSS, Playwright smoke tests, Node built-in test runner.

---

## Current Context

- `frontend/src/components/SavedCommutesPanel.tsx` currently uses native `<select>` controls for origin and destination.
- `frontend/src/app/station-search.ts` already exposes `searchStations(...)`, `buildStationLineGroups(...)`, and `STATION_SEARCH_LINES`.
- `frontend/src/components/StationSearchPanel.tsx` already proves the desired interaction model: search first, browse by expandable line groups when the search field is empty.
- `frontend/src/app/account-data.ts` already defines `AccountSavedCommute.path.stationIds` and `AccountSavedCommute.path.segmentIds`.
- `frontend/src/components/InteractiveTtcMap.tsx` already resolves authored map segments and composes adjacent segment IDs into one corridor path for alerts and planned closures.
- `backend/src/main/java/com/calebhabesh/linewatch/commute/CommutePathService.java` currently calls `lineSegmentRepository.findAllByOrderBySortOrderAsc()` and `travelTimeRepository.findActiveScheduledSegmentWeights()` inside each `path(...)` call.
- Dijkstra on this graph is cheap. The likely save delay is the repeated weighted-graph setup, especially `percentile_cont(0.5)` across GTFS stop times in `CommuteTravelTimeRepository`.

## File Structure

- Modify `backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteTravelTimeRepository.java`
  - Add a cheap active-GTFS signature query used for in-memory graph cache invalidation.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/commute/CommutePathService.java`
  - Cache the weighted graph snapshot keyed by active-GTFS signature.
- Modify `backend/src/test/java/com/calebhabesh/linewatch/commute/CommutePathServiceTest.java`
  - Prove multiple path requests reuse the expensive graph snapshot.
- Create `frontend/src/components/SavedCommuteStationPicker.tsx`
  - Compact dropdown picker for saved commute origin/destination using existing station search utilities.
- Modify `frontend/src/components/SavedCommutesPanel.tsx`
  - Replace native selects, add plotting button state, add route stop disclosure, add map-preview actions.
- Modify `frontend/src/app/account-data.ts`
  - Add a small `AccountCommutePathPreview` type and conversion helper for map preview state.
- Modify `frontend/src/components/LineWatchShell.tsx`
  - Own selected commute path preview state and pass it to the map.
- Modify `frontend/src/components/InteractiveTtcMap.tsx`
  - Render a non-interactive saved-commute corridor overlay from `segmentIds`.
- Modify `frontend/src/app/globals.css`
  - Add compact picker, plotting, stop-list, route-preview, and map-chip styling.
- Modify `frontend/tests/account-ui-source.test.mjs`
  - Source-level checks for the picker, loading state, stop disclosure, and view-path action.
- Modify `frontend/tests/account-data.test.mjs`
  - Source-level check for the commute path preview helper.
- Modify `frontend/tests/map-layering.test.mjs`
  - Source-level checks for the saved commute map overlay and its layering.
- Modify `frontend/tests/smoke/dashboard.spec.ts`
  - Extend the demo-account smoke test to open route stops and view the route on the map.

---

### Task 1: Cache the Backend Weighted Commute Graph

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteTravelTimeRepository.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/commute/CommutePathService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/commute/CommutePathServiceTest.java`

- [ ] **Step 1: Write the failing cache reuse test**

In `backend/src/test/java/com/calebhabesh/linewatch/commute/CommutePathServiceTest.java`, add these static imports:

```java
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
```

Add this test before the helper methods:

```java
@Test
void reusesWeightedGraphSnapshotAcrossMultiplePathRequestsForSameScheduleSignature() {
    when(lineSegmentRepository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(
        segment("line-1-a-b", "line-1", "a", "b", 101),
        segment("line-1-b-c", "line-1", "b", "c", 102)
    ));
    when(travelTimeRepository.activeScheduleSignature()).thenReturn("active-import-42");
    when(travelTimeRepository.findActiveScheduledSegmentWeights()).thenReturn(Map.of(
        "line-1-a-b", weight("line-1-a-b", 90),
        "line-1-b-c", weight("line-1-b-c", 110)
    ));

    CommuteResponses.PathResponse outbound = service.path("a", "c");
    CommuteResponses.PathResponse inbound = service.path("c", "a");

    assertThat(outbound.status()).isEqualTo("available");
    assertThat(outbound.estimatedTravelSeconds()).isEqualTo(200);
    assertThat(inbound.status()).isEqualTo("available");
    assertThat(inbound.estimatedTravelSeconds()).isEqualTo(200);
    verify(travelTimeRepository, times(2)).activeScheduleSignature();
    verify(lineSegmentRepository, times(1)).findAllByOrderBySortOrderAsc();
    verify(travelTimeRepository, times(1)).findActiveScheduledSegmentWeights();
}
```

- [ ] **Step 2: Run the failing backend test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=CommutePathServiceTest test
```

Expected: FAIL because `CommuteTravelTimeRepository.activeScheduleSignature()` does not exist.

- [ ] **Step 3: Add active schedule signature lookup**

In `backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteTravelTimeRepository.java`, add this method above `findActiveScheduledSegmentWeights()`:

```java
public String activeScheduleSignature() {
    List<String> signatures = jdbc.query("""
        select coalesce(
            (
                select id::text || ':' || extract(epoch from imported_at)::bigint::text
                from gtfs_schedule_imports
                where active = true
                order by imported_at desc
                limit 1
            ),
            'no-active-gtfs-import'
        ) as signature
        """, Map.of(), (rs, rowNum) -> rs.getString("signature"));

    return signatures.isEmpty() ? "no-active-gtfs-import" : signatures.getFirst();
}
```

- [ ] **Step 4: Cache the built graph snapshot in `CommutePathService`**

In `backend/src/main/java/com/calebhabesh/linewatch/commute/CommutePathService.java`, add this field:

```java
private volatile GraphSnapshot graphSnapshot;
```

Replace this block inside `path(...)`:

```java
List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc().stream()
    .sorted(Comparator.comparingInt(LineSegmentEntity::getSortOrder).thenComparing(LineSegmentEntity::getId))
    .toList();
Map<String, CommuteTravelTimeRepository.SegmentTravelTime> weights =
    travelTimeRepository.findActiveScheduledSegmentWeights();
Map<String, List<Edge>> graph = graph(segments, weights);
```

with:

```java
Map<String, List<Edge>> graph = graphSnapshot().graph();
```

Add these methods below `path(...)`:

```java
private GraphSnapshot graphSnapshot() {
    String signature = normalizedScheduleSignature();
    GraphSnapshot current = graphSnapshot;
    if (current != null && current.signature().equals(signature)) {
        return current;
    }

    synchronized (this) {
        current = graphSnapshot;
        if (current != null && current.signature().equals(signature)) {
            return current;
        }

        List<LineSegmentEntity> segments = lineSegmentRepository.findAllByOrderBySortOrderAsc().stream()
            .sorted(Comparator.comparingInt(LineSegmentEntity::getSortOrder).thenComparing(LineSegmentEntity::getId))
            .toList();
        Map<String, CommuteTravelTimeRepository.SegmentTravelTime> weights =
            travelTimeRepository.findActiveScheduledSegmentWeights();
        GraphSnapshot next = new GraphSnapshot(signature, graph(segments, weights));
        graphSnapshot = next;
        return next;
    }
}

private String normalizedScheduleSignature() {
    String signature = travelTimeRepository.activeScheduleSignature();
    return signature == null || signature.isBlank() ? "no-active-gtfs-import" : signature;
}
```

Add this record near the existing private records:

```java
private record GraphSnapshot(String signature, Map<String, List<Edge>> graph) {}
```

- [ ] **Step 5: Run the backend path tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=CommutePathServiceTest test
```

Expected: PASS. The new test proves only the cheap signature query runs per `path(...)` call; segment loading and median travel-time lookup run once per active schedule signature.

- [ ] **Step 6: Commit backend cache change**

Run:

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteTravelTimeRepository.java backend/src/main/java/com/calebhabesh/linewatch/commute/CommutePathService.java backend/src/test/java/com/calebhabesh/linewatch/commute/CommutePathServiceTest.java
git commit -m "perf: cache saved commute route graph"
```

---

### Task 2: Add Compact Saved Commute Station Picker

**Files:**
- Create: `frontend/src/components/SavedCommuteStationPicker.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/account-ui-source.test.mjs`

- [ ] **Step 1: Add failing source checks for the compact picker**

In `frontend/tests/account-ui-source.test.mjs`, add this source read near the existing reads:

```js
const savedCommutePickerSource = readFileSync(new URL("../src/components/SavedCommuteStationPicker.tsx", import.meta.url), "utf8");
```

Add this test:

```js
it("defines a compact saved-commute station picker using station search helpers", () => {
  assert.match(savedCommutePickerSource, /searchStations/);
  assert.match(savedCommutePickerSource, /buildStationLineGroups/);
  assert.match(savedCommutePickerSource, /commute-station-picker/);
  assert.match(savedCommutePickerSource, /role="searchbox"/);
  assert.match(savedCommutePickerSource, /aria-haspopup="listbox"/);
  assert.match(globalCss, /\.commute-station-picker/);
  assert.match(globalCss, /\.commute-station-popover/);
});
```

- [ ] **Step 2: Run the failing frontend fixture test**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: FAIL because `SavedCommuteStationPicker.tsx` does not exist.

- [ ] **Step 3: Create `SavedCommuteStationPicker.tsx`**

Create `frontend/src/components/SavedCommuteStationPicker.tsx`:

```tsx
"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import {
  buildStationLineGroups,
  searchStations,
  STATION_SEARCH_LINES,
  type StationSearchLine,
} from "../app/station-search";
import type { StationSummary } from "../app/station-data";

type Props = {
  label: string;
  placeholder: string;
  value: string;
  stations: StationSummary[];
  blockedStationId?: string;
  blockedLabel?: string;
  onChange: (stationId: string) => void;
};

function lineTextColor(lineId: string) {
  return lineId === "line-1" ? "#111827" : "#ffffff";
}

function lineById(lineId: string) {
  return STATION_SEARCH_LINES.find((line) => line.id === lineId);
}

function StationLineBadge({ line }: { line: StationSearchLine }) {
  return (
    <span
      className="commute-station-line-badge"
      style={{ backgroundColor: line.color, color: lineTextColor(line.id) }}
      aria-hidden="true"
    >
      {line.number}
    </span>
  );
}

function StationOption({
  station,
  selected,
  disabled,
  disabledReason,
  onChoose,
}: {
  station: StationSummary;
  selected: boolean;
  disabled: boolean;
  disabledReason: string;
  onChoose: (stationId: string) => void;
}) {
  const lines = station.lineIds
    .map((lineId) => lineById(lineId))
    .filter((line): line is StationSearchLine => Boolean(line));

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled}
      className={`commute-station-option ${selected ? "selected" : ""}`}
      onClick={() => onChoose(station.id)}
      title={disabled ? disabledReason : station.name}
    >
      <span className="commute-station-option-name">{station.name}</span>
      <span className="commute-station-line-badges">
        {lines.map((line) => (
          <StationLineBadge key={line.id} line={line} />
        ))}
      </span>
    </button>
  );
}

export function SavedCommuteStationPicker({
  label,
  placeholder,
  value,
  stations,
  blockedStationId,
  blockedLabel = "Already selected",
  onChange,
}: Props) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);

  const selectedStation = useMemo(
    () => stations.find((station) => station.id === value) ?? null,
    [stations, value],
  );
  const results = useMemo(() => searchStations(stations, query, 8), [stations, query]);
  const lineGroups = useMemo(() => buildStationLineGroups(stations), [stations]);

  useEffect(() => {
    if (!open) return;

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 40);
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  function chooseStation(stationId: string) {
    if (stationId === blockedStationId) return;
    onChange(stationId);
    setOpen(false);
    setQuery("");
    setExpandedLineId(null);
  }

  function clearSearchOrClose() {
    if (query.trim()) {
      setQuery("");
      return;
    }
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="commute-station-picker" data-open={open ? "true" : "false"}>
      <span className="commute-station-label">{label}</span>
      <button
        type="button"
        className="commute-station-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedStation?.name ?? placeholder}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {open ? (
        <div id={panelId} className="commute-station-popover" role="listbox" aria-label={`${label} station choices`}>
          <div className="commute-station-search-row">
            <Search size={15} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              role="searchbox"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  clearSearchOrClose();
                }
              }}
              placeholder="Search stations"
              aria-label={`Search ${label.toLowerCase()} stations`}
            />
            <button type="button" onClick={clearSearchOrClose} aria-label={query ? "Clear station search" : "Close station choices"}>
              <X size={15} />
            </button>
          </div>

          {query.trim() ? (
            <div className="commute-station-options">
              {results.length > 0 ? (
                results.map((result) => (
                  <StationOption
                    key={result.station.id}
                    station={result.station}
                    selected={result.station.id === value}
                    disabled={result.station.id === blockedStationId}
                    disabledReason={blockedLabel}
                    onChoose={chooseStation}
                  />
                ))
              ) : (
                <p className="commute-station-empty">No mapped station matches.</p>
              )}
            </div>
          ) : (
            <div className="commute-station-lines">
              {lineGroups.map((group) => {
                const expanded = expandedLineId === group.line.id;
                return (
                  <div key={group.line.id} className="commute-station-line-group">
                    <button
                      type="button"
                      className="commute-station-line-trigger"
                      aria-expanded={expanded}
                      onClick={() => setExpandedLineId((current) => current === group.line.id ? null : group.line.id)}
                    >
                      <span>
                        <StationLineBadge line={group.line} />
                        Line {group.line.number} {group.line.name}
                      </span>
                      <ChevronRight size={15} aria-hidden="true" />
                    </button>
                    {expanded ? (
                      <div className="commute-station-options">
                        {group.stations.map((station) => (
                          <StationOption
                            key={`${group.line.id}-${station.id}`}
                            station={station}
                            selected={station.id === value}
                            disabled={station.id === blockedStationId}
                            disabledReason={blockedLabel}
                            onChoose={chooseStation}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Add compact picker styling**

Append this CSS near the existing saved-commute form styles in `frontend/src/app/globals.css`:

```css
.commute-station-picker {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
  position: relative;
}

.commute-station-label {
  color: rgb(71, 85, 105);
  font-size: 0.62rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.dark .commute-station-label,
.high-contrast .commute-station-label {
  color: rgb(203, 213, 225);
}

.commute-station-trigger,
.commute-station-search-row,
.commute-station-popover {
  border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 8px;
}

.commute-station-trigger {
  align-items: center;
  background: rgba(255, 255, 255, 0.92);
  color: rgb(15, 23, 42);
  display: flex;
  font-size: 0.78rem;
  font-weight: 800;
  justify-content: space-between;
  min-height: 40px;
  min-width: 0;
  padding: 0.5rem 0.625rem;
  text-align: left;
  width: 100%;
}

.commute-station-trigger span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.commute-station-popover {
  background: rgba(248, 250, 252, 0.98);
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.2);
  display: grid;
  gap: 0.45rem;
  left: 0;
  max-height: 320px;
  overflow: auto;
  padding: 0.5rem;
  position: absolute;
  right: 0;
  top: calc(100% + 0.35rem);
  z-index: 50;
}

.commute-station-search-row {
  align-items: center;
  background: rgba(255, 255, 255, 0.95);
  display: grid;
  gap: 0.35rem;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 36px;
  padding: 0 0.45rem;
}

.commute-station-search-row input {
  background: transparent;
  border: 0;
  color: inherit;
  font-size: 0.78rem;
  min-height: 34px;
  outline: 0;
  padding: 0;
}

.commute-station-search-row button {
  align-items: center;
  background: transparent;
  color: inherit;
  display: inline-flex;
  justify-content: center;
  min-height: 28px;
  padding: 0;
  width: 28px;
}

.commute-station-lines,
.commute-station-options {
  display: grid;
  gap: 0.3rem;
}

.commute-station-line-trigger,
.commute-station-option {
  align-items: center;
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 7px;
  color: rgb(15, 23, 42);
  display: flex;
  font-size: 0.74rem;
  font-weight: 800;
  justify-content: space-between;
  min-height: 34px;
  min-width: 0;
  padding: 0.4rem 0.5rem;
  text-align: left;
  width: 100%;
}

.commute-station-line-trigger span,
.commute-station-option-name {
  align-items: center;
  display: flex;
  gap: 0.35rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.commute-station-line-trigger[aria-expanded="true"],
.commute-station-option:hover,
.commute-station-option:focus-visible,
.commute-station-option.selected {
  border-color: rgba(14, 165, 233, 0.42);
  background: rgba(14, 165, 233, 0.1);
}

.commute-station-option:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.commute-station-line-badges {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 0.2rem;
}

.commute-station-line-badge {
  align-items: center;
  border-radius: 999px;
  display: inline-flex;
  font-size: 0.62rem;
  font-weight: 950;
  height: 18px;
  justify-content: center;
  min-width: 18px;
  padding: 0 0.28rem;
}

.commute-station-empty {
  color: rgb(100, 116, 139);
  font-size: 0.74rem;
  font-weight: 700;
  margin: 0;
  padding: 0.45rem;
}

.dark .commute-station-trigger,
.high-contrast .commute-station-trigger,
.dark .commute-station-popover,
.high-contrast .commute-station-popover,
.dark .commute-station-search-row,
.high-contrast .commute-station-search-row,
.dark .commute-station-line-trigger,
.high-contrast .commute-station-line-trigger,
.dark .commute-station-option,
.high-contrast .commute-station-option {
  background: rgba(15, 23, 42, 0.94);
  border-color: rgba(255, 255, 255, 0.14);
  color: rgb(248, 250, 252);
}
```

- [ ] **Step 5: Run fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS for the new compact picker source test.

- [ ] **Step 6: Commit compact picker**

Run:

```bash
git add frontend/src/components/SavedCommuteStationPicker.tsx frontend/src/app/globals.css frontend/tests/account-ui-source.test.mjs
git commit -m "feat: add compact saved commute station picker"
```

---

### Task 3: Upgrade Saved Commute Form and Route Cards

**Files:**
- Modify: `frontend/src/components/SavedCommutesPanel.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/account-ui-source.test.mjs`

- [ ] **Step 1: Add failing source checks for form/card behavior**

In the existing `"renders signed-out, demo, and account-backed saved commute states"` test in `frontend/tests/account-ui-source.test.mjs`, add:

```js
assert.match(savedCommutesSource, /SavedCommuteStationPicker/);
assert.doesNotMatch(savedCommutesSource, /<select/);
assert.match(savedCommutesSource, /Plotting route/);
assert.match(savedCommutesSource, /Loader2/);
assert.match(savedCommutesSource, /commute-route-stop-list/);
assert.match(savedCommutesSource, /commute\.path\.stationIds/);
assert.match(savedCommutesSource, /onViewPath/);
assert.match(savedCommutesSource, /View path on map/);
```

- [ ] **Step 2: Run the failing frontend fixture test**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: FAIL because `SavedCommutesPanel.tsx` still uses native selects and lacks the new route controls.

- [ ] **Step 3: Update imports and props in `SavedCommutesPanel.tsx`**

Change the imports:

```tsx
import { useEffect, useMemo, useState } from "react";
import { Navigation, ChevronDown, ChevronLeft, Loader2, MapPinned } from "lucide-react";
import { SavedCommuteStationPicker } from "./SavedCommuteStationPicker";
```

Extend `Props`:

```tsx
interface Props {
  onBack?: () => void;
  accountState: AccountState;
  accountCommutes: AccountSavedCommute[];
  setAccountCommutes: (commutes: AccountSavedCommute[]) => void;
  stationSummaries: StationSummary[];
  viewedCommuteId?: string | null;
  onViewPath: (commute: AccountSavedCommute) => void;
  onClearViewedPath: (commuteId: string) => void;
  onRequestSignIn: () => void;
  onRequestCreateAccount: () => void;
}
```

Update the component parameter list to include the new props.

- [ ] **Step 4: Add station lookup and expanded-card state**

Inside `SavedCommutesPanel`, after existing state declarations, add:

```tsx
const [expandedCommuteId, setExpandedCommuteId] = useState<string | null>(null);
```

Replace `stationOptions` with:

```tsx
const stationById = useMemo(() => {
  return new Map(stationSummaries.map((station) => [station.id, station]));
}, [stationSummaries]);

function stationNameFor(stationId: string) {
  return stationById.get(stationId)?.name ?? stationId;
}
```

- [ ] **Step 5: Strengthen create validation and plotting state**

Inside `handleCreateCommute`, after the existing origin/destination blank check, add:

```tsx
if (originStationId === destinationStationId) {
  setCommuteError("Choose two different stations.");
  return;
}
```

Replace the save button with:

```tsx
<button
  type="button"
  className="saved-commute-primary-button"
  onClick={handleCreateCommute}
  disabled={saving}
  aria-busy={saving}
>
  {saving ? (
    <>
      <Loader2 size={15} className="saved-commute-loading-icon" aria-hidden="true" />
      Plotting route
    </>
  ) : (
    "Save commute"
  )}
</button>
```

- [ ] **Step 6: Replace native selects with compact pickers**

Replace the current two `<select>` controls with:

```tsx
<div className="saved-commute-station-grid">
  <SavedCommuteStationPicker
    label="Origin"
    placeholder="Origin station"
    value={originStationId}
    stations={stationSummaries}
    blockedStationId={destinationStationId || undefined}
    blockedLabel="Already selected as destination"
    onChange={setOriginStationId}
  />
  <SavedCommuteStationPicker
    label="Destination"
    placeholder="Destination station"
    value={destinationStationId}
    stations={stationSummaries}
    blockedStationId={originStationId || undefined}
    blockedLabel="Already selected as origin"
    onChange={setDestinationStationId}
  />
</div>
```

- [ ] **Step 7: Add stop disclosure and map path action to each card**

Inside each commute card, after the impact list, add:

```tsx
const stopsExpanded = expandedCommuteId === commute.id;
const routeStops = commute.path.stationIds;
const canViewPath = commute.path.status === "available" && commute.path.segmentIds.length > 0;
const viewingPath = viewedCommuteId === commute.id;
```

If the map callback body is currently inline inside `accountCommutes.map(...)`, convert it to a block-bodied map so those constants can be declared:

```tsx
accountCommutes.map((commute) => {
  const stopsExpanded = expandedCommuteId === commute.id;
  const routeStops = commute.path.stationIds;
  const canViewPath = commute.path.status === "available" && commute.path.segmentIds.length > 0;
  const viewingPath = viewedCommuteId === commute.id;

  return (
    <div key={commute.id} className={`commute-card ${commuteTone(commute)} min-w-0 rounded-lg border border-black/10 !bg-slate-50 p-3 dark:border-white/10 dark:!bg-[#12151c]`}>
      {/* existing card content stays here */}
    </div>
  );
})
```

Add this action row below the impact list:

```tsx
<div className="commute-route-actions">
  <button
    type="button"
    className="commute-route-stop-toggle"
    onClick={() => setExpandedCommuteId((current) => current === commute.id ? null : commute.id)}
    aria-expanded={stopsExpanded}
    aria-controls={`commute-stops-${commute.id}`}
    disabled={routeStops.length === 0}
  >
    <ChevronDown size={14} aria-hidden="true" />
    {stopsExpanded ? "Hide stops" : `View ${routeStops.length} stops`}
  </button>
  <button
    type="button"
    className="commute-route-map-button"
    onClick={() => onViewPath(commute)}
    disabled={!canViewPath}
    aria-pressed={viewingPath}
  >
    <MapPinned size={14} aria-hidden="true" />
    {viewingPath ? "Viewing path" : "View path on map"}
  </button>
</div>
{stopsExpanded ? (
  <ol id={`commute-stops-${commute.id}`} className="commute-route-stop-list" aria-label={`Stops for ${commute.label}`}>
    {routeStops.map((stationId, index) => (
      <li key={`${commute.id}-${stationId}-${index}`}>
        <span className="commute-route-stop-index">{index + 1}</span>
        <span>{stationNameFor(stationId)}</span>
        {commute.path.transferStationIds.includes(stationId) ? (
          <strong>Transfer</strong>
        ) : null}
      </li>
    ))}
  </ol>
) : null}
```

- [ ] **Step 8: Clear route preview when deleting the visible commute**

Update `handleDeleteCommute`:

```tsx
const handleDeleteCommute = async (id: string) => {
  try {
    await deleteSavedCommute(id);
    setAccountCommutes(accountCommutes.filter((commute) => commute.id !== id));
    onClearViewedPath(id);
    setExpandedCommuteId((current) => current === id ? null : current);
  } catch {
    setCommuteError("Could not delete that commute.");
  }
};
```

- [ ] **Step 9: Add saved commute route-card styling**

Append this CSS near the saved-commute styles in `frontend/src/app/globals.css`:

```css
.saved-commute-station-grid {
  display: grid;
  gap: 0.55rem;
  grid-template-columns: minmax(0, 1fr);
}

@media (min-width: 640px) {
  .saved-commute-station-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.saved-commute-primary-button,
.commute-route-actions button {
  align-items: center;
  display: inline-flex;
  gap: 0.35rem;
  justify-content: center;
}

.saved-commute-primary-button[aria-busy="true"] {
  cursor: wait;
  opacity: 0.82;
}

.saved-commute-loading-icon {
  animation: saved-commute-spin 0.85s linear infinite;
}

@keyframes saved-commute-spin {
  to {
    transform: rotate(360deg);
  }
}

.commute-route-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.75rem;
}

.commute-route-actions button {
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 8px;
  font-size: 0.68rem;
  font-weight: 900;
  min-height: 30px;
  padding: 0.35rem 0.55rem;
  text-transform: uppercase;
}

.commute-route-map-button[aria-pressed="true"] {
  background: rgba(34, 211, 238, 0.14);
  border-color: rgba(8, 145, 178, 0.38);
  color: rgb(14, 116, 144);
}

.commute-route-stop-list {
  border-top: 1px solid rgba(15, 23, 42, 0.1);
  display: grid;
  gap: 0.28rem;
  margin: 0.7rem 0 0;
  max-height: 220px;
  overflow: auto;
  padding: 0.6rem 0 0;
}

.commute-route-stop-list li {
  align-items: center;
  color: rgb(51, 65, 85);
  display: grid;
  font-size: 0.75rem;
  gap: 0.45rem;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-width: 0;
}

.commute-route-stop-index {
  align-items: center;
  background: rgba(14, 165, 233, 0.12);
  border-radius: 999px;
  color: rgb(14, 116, 144);
  display: inline-flex;
  font-size: 0.62rem;
  font-weight: 950;
  height: 20px;
  justify-content: center;
  width: 20px;
}

.commute-route-stop-list strong {
  color: rgb(14, 116, 144);
  font-size: 0.62rem;
  letter-spacing: 0.06em;
  margin: 0;
  text-transform: uppercase;
}

.dark .commute-route-stop-list,
.high-contrast .commute-route-stop-list {
  border-top-color: rgba(255, 255, 255, 0.12);
}

.dark .commute-route-stop-list li,
.high-contrast .commute-route-stop-list li {
  color: rgb(203, 213, 225);
}
```

- [ ] **Step 10: Run fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 11: Commit saved commute UI card upgrade**

Run:

```bash
git add frontend/src/components/SavedCommutesPanel.tsx frontend/src/app/globals.css frontend/tests/account-ui-source.test.mjs
git commit -m "feat: improve saved commute route cards"
```

---

### Task 4: Add Saved Commute Path Preview on the Map

**Files:**
- Modify: `frontend/src/app/account-data.ts`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/account-data.test.mjs`
- Modify: `frontend/tests/map-layering.test.mjs`

- [ ] **Step 1: Add failing account-data source checks**

In `frontend/tests/account-data.test.mjs`, extend `"defines saved commute weighted path and impact contracts"`:

```js
assert.match(source, /export type AccountCommutePathPreview/);
assert.match(source, /commutePathPreviewFromCommute/);
assert.match(source, /segmentIds: commute\.path\.segmentIds/);
```

- [ ] **Step 2: Add failing map-layering source checks**

In `frontend/tests/map-layering.test.mjs`, add:

```js
it("renders saved commute path previews underneath active disruption overlays", () => {
  assert.match(interactiveMapSource, /commutePathPreview/);
  assert.match(interactiveMapSource, /aria-label="Saved commute route preview"/);
  assert.match(interactiveMapSource, /CommutePathOverlay/);
  assert.match(interactiveMapSource, /data-commute-path-preview/);
  assert.match(globalCss, /\.commute-path-preview-path/);
  assert.match(globalCss, /\.commute-path-preview-chip/);

  const previewGroupIndex = interactiveMapSource.indexOf('aria-label="Saved commute route preview"');
  const impactLayerIndex = interactiveMapSource.indexOf("retainedImpactLayers.map", previewGroupIndex);

  assert.ok(previewGroupIndex > -1, "saved commute preview group must exist");
  assert.ok(
    impactLayerIndex > previewGroupIndex,
    "active disruption overlays must render after commute previews so disruptions remain visually dominant",
  );
});
```

- [ ] **Step 3: Run failing frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: FAIL because the preview type and map layer do not exist.

- [ ] **Step 4: Add path preview type and helper**

In `frontend/src/app/account-data.ts`, add below `AccountSavedCommute`:

```ts
export type AccountCommutePathPreview = {
  id: string;
  label: string;
  routeLabel: string;
  stationIds: string[];
  segmentIds: string[];
};

export function commutePathPreviewFromCommute(commute: AccountSavedCommute): AccountCommutePathPreview | null {
  if (commute.path.status !== "available" || commute.path.segmentIds.length === 0) {
    return null;
  }

  return {
    id: commute.id,
    label: commute.label,
    routeLabel: commute.routeLabel,
    stationIds: commute.path.stationIds,
    segmentIds: commute.path.segmentIds,
  };
}
```

- [ ] **Step 5: Wire preview state in `LineWatchShell.tsx`**

Update the account-data import:

```tsx
import {
  commutePathPreviewFromCommute,
  getCurrentAccount,
  loginAccount,
  loginDemoAccount,
  logoutAccount,
  registerAccount,
  type AccountState,
  type AccountSavedCommute,
  type AccountCommutePathPreview,
} from "../app/account-data";
```

Add state next to `accountCommutes`:

```tsx
const [commutePathPreview, setCommutePathPreview] = useState<AccountCommutePathPreview | null>(null);
```

Add handlers near the account handlers:

```tsx
const handleViewCommutePath = (commute: AccountSavedCommute) => {
  const preview = commutePathPreviewFromCommute(commute);
  if (!preview) return;

  setCommutePathPreview(preview);
  setSelection(null);
  setSelectedStationId(null);
  setActiveView("map");
};

const handleClearCommutePathPreview = (commuteId?: string) => {
  setCommutePathPreview((current) => {
    if (!current) return null;
    return commuteId && current.id !== commuteId ? current : null;
  });
};
```

In `handleSignOut`, add:

```tsx
setCommutePathPreview(null);
```

When passing props to `SavedCommutesPanel`, add:

```tsx
viewedCommuteId={commutePathPreview?.id ?? null}
onViewPath={handleViewCommutePath}
onClearViewedPath={handleClearCommutePathPreview}
```

When rendering `InteractiveTtcMap`, add:

```tsx
commutePathPreview={commutePathPreview}
onClearCommutePathPreview={() => handleClearCommutePathPreview()}
```

In `handleMapSelectImpact` and `handleSelectStationId`, clear the commute preview when the user actively selects another map object:

```tsx
setCommutePathPreview(null);
```

- [ ] **Step 6: Extend `InteractiveTtcMap` props**

In `frontend/src/components/InteractiveTtcMap.tsx`, add this import:

```tsx
import type { AccountCommutePathPreview } from "../app/account-data";
```

Add props to the function signature:

```tsx
commutePathPreview,
onClearCommutePathPreview,
```

Add prop types:

```tsx
commutePathPreview?: AccountCommutePathPreview | null;
onClearCommutePathPreview?: () => void;
```

- [ ] **Step 7: Reuse the rendered segment pipeline for all network segments**

Above `renderedOverlaySegments`, add:

```tsx
const renderedNetworkSegments = useMemo(() => {
  const stationById = new Map(mapStations.map((station) => [station.id, station]));

  return networkSegments
    .map((segment) => {
      const stationA = segment.stationAId ? stationById.get(segment.stationAId) : undefined;
      const stationB = segment.stationBId ? stationById.get(segment.stationBId) : undefined;
      const pointA = (segment.stationAAnchorId && anchorPoints.get(segment.stationAAnchorId)) ?? (stationA ? { x: stationA.x, y: stationA.y } : undefined);
      const pointB = (segment.stationBAnchorId && anchorPoints.get(segment.stationBAnchorId)) ?? (stationB ? { x: stationB.x, y: stationB.y } : undefined);

      let angle = 0;
      let originX = 0;
      let originY = 0;
      if (pointA && pointB) {
        angle = Math.atan2(pointB.y - pointA.y, pointB.x - pointA.x) * (180 / Math.PI);
        originX = pointA.x;
        originY = pointA.y;
      } else {
        const nums = segment.pathD.match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
        originX = nums[0] || 0;
        originY = nums[1] || 0;
      }

      return {
        ...segment,
        pathD: resolveNetworkSegmentPath(segment, mapStations, anchorPoints, guidePaths),
        patternOriginX: originX,
        patternOriginY: originY,
        patternAngle: angle,
      };
    })
    .filter((segment): segment is RenderedNetworkSegment => Boolean(segment.pathD));
}, [networkSegments, mapStations, anchorPoints, guidePaths]);
```

Replace the existing `renderedOverlaySegments` mapping block with:

```tsx
const renderedOverlaySegments = useMemo(() => {
  return renderedNetworkSegments.filter((segment) => {
    const isClosurePreview = plannedPreviewSegmentIds.has(segment.id);
    return Boolean(segment.impacts?.length) || segment.overlay !== "clear" || isClosurePreview;
  });
}, [renderedNetworkSegments, plannedPreviewSegmentIds]);
```

- [ ] **Step 8: Compose commute preview corridor**

Add after `plannedPreviewLayers`:

```tsx
const commutePreviewLayer = useMemo(() => {
  if (!commutePathPreview || commutePathPreview.segmentIds.length === 0) {
    return null;
  }

  const previewSegmentIds = new Set(commutePathPreview.segmentIds);
  const orderedSegments = orderSegmentsByIds(
    renderedNetworkSegments.filter((segment) => previewSegmentIds.has(segment.id)),
    commutePathPreview.segmentIds,
  );
  const corridor = composeNetworkSegmentPath(orderedSegments, "bidirectional");
  if (!corridor.pathD) {
    return null;
  }

  return {
    preview: commutePathPreview,
    segment: compositeSegment(
      `commute-preview-${commutePathPreview.id}`,
      orderedSegments,
      corridor.pathD,
      corridor.travelDirection,
      corridor.segmentIds,
      commutePathPreview.routeLabel,
    ),
  };
}, [commutePathPreview, renderedNetworkSegments]);

const commutePreviewEndpointPoints = useMemo(() => {
  if (!commutePathPreview || commutePathPreview.stationIds.length === 0) {
    return [];
  }

  const stationById = new Map(mapStations.map((station) => [station.id, station]));
  const endpointIds = [
    commutePathPreview.stationIds[0],
    commutePathPreview.stationIds.at(-1),
  ].filter((stationId): stationId is string => Boolean(stationId));

  return endpointIds
    .map((stationId) => {
      const station = stationById.get(stationId);
      return station ? stationPointFor(station) : null;
    })
    .filter((point): point is MapPoint => Boolean(point));
}, [commutePathPreview, mapStations, stationPointFor]);
```

- [ ] **Step 9: Render the commute preview under active disruptions**

Inside the SVG, before `retainedPlannedPreviewLayers.map(...)`, add:

```tsx
<g aria-label="Saved commute route preview">
  {commutePreviewLayer ? (
    <CommutePathOverlay
      segment={commutePreviewLayer.segment}
      endpointPoints={commutePreviewEndpointPoints}
      preview={commutePreviewLayer.preview}
    />
  ) : null}
</g>
```

Add this component before `OverlaySegment`:

```tsx
function CommutePathOverlay({
  segment,
  endpointPoints,
  preview,
}: {
  segment: RenderedNetworkSegment;
  endpointPoints: MapPoint[];
  preview: AccountCommutePathPreview;
}) {
  if (!segment.pathD) return null;

  return (
    <g className="commute-path-preview-layer" data-commute-path-preview={preview.id}>
      <path className="commute-path-preview-glow" d={segment.pathD} />
      <path className="commute-path-preview-path" d={segment.pathD} />
      {endpointPoints.map((point, index) => (
        <circle
          key={`${preview.id}-${index}`}
          className="commute-path-preview-endpoint"
          cx={point.x}
          cy={point.y}
          r={34}
        />
      ))}
    </g>
  );
}
```

- [ ] **Step 10: Add visible map chip with clear action**

Inside the map container JSX, near the other map controls but outside the SVG, add:

```tsx
{commutePathPreview ? (
  <div className="commute-path-preview-chip" role="status" aria-live="polite">
    <span>
      Viewing <strong>{commutePathPreview.routeLabel}</strong>
    </span>
    <button type="button" onClick={onClearCommutePathPreview}>
      Clear
    </button>
  </div>
) : null}
```

- [ ] **Step 11: Add commute preview map styling**

Append to `frontend/src/app/globals.css` near the map overlay styles:

```css
.commute-path-preview-layer {
  pointer-events: none;
}

.commute-path-preview-glow,
.commute-path-preview-path {
  fill: none;
  pointer-events: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.commute-path-preview-glow {
  opacity: 0.7;
  stroke: rgba(255, 255, 255, 0.82);
  stroke-width: 122;
}

.commute-path-preview-path {
  opacity: 0.92;
  stroke: #22d3ee;
  stroke-width: 74;
}

.commute-path-preview-endpoint {
  fill: #f8fafc;
  pointer-events: none;
  stroke: #0891b2;
  stroke-width: 12;
}

.commute-path-preview-chip {
  align-items: center;
  background: rgba(248, 250, 252, 0.94);
  border: 1px solid rgba(8, 145, 178, 0.28);
  border-radius: 8px;
  bottom: 1rem;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.22);
  color: rgb(15, 23, 42);
  display: flex;
  gap: 0.65rem;
  left: 50%;
  max-width: min(420px, calc(100vw - 2rem));
  min-height: 42px;
  padding: 0.55rem 0.65rem;
  position: absolute;
  transform: translateX(-50%);
  z-index: 35;
}

.commute-path-preview-chip span {
  font-size: 0.75rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.commute-path-preview-chip strong {
  color: rgb(14, 116, 144);
}

.commute-path-preview-chip button {
  background: rgb(15, 23, 42);
  border-radius: 7px;
  color: white;
  flex: 0 0 auto;
  font-size: 0.68rem;
  font-weight: 900;
  min-height: 30px;
  padding: 0.35rem 0.55rem;
  text-transform: uppercase;
}

.dark .commute-path-preview-chip,
.high-contrast .commute-path-preview-chip {
  background: rgba(15, 23, 42, 0.94);
  border-color: rgba(34, 211, 238, 0.34);
  color: rgb(248, 250, 252);
}

.dark .commute-path-preview-chip button,
.high-contrast .commute-path-preview-chip button {
  background: rgb(226, 232, 240);
  color: rgb(15, 23, 42);
}
```

- [ ] **Step 12: Run fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 13: Commit commute map preview**

Run:

```bash
git add frontend/src/app/account-data.ts frontend/src/components/LineWatchShell.tsx frontend/src/components/InteractiveTtcMap.tsx frontend/src/app/globals.css frontend/tests/account-data.test.mjs frontend/tests/map-layering.test.mjs
git commit -m "feat: preview saved commute paths on map"
```

---

### Task 5: Smoke Test the Route Review Flow

**Files:**
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Extend the demo-account saved commute smoke test**

In `frontend/tests/smoke/dashboard.spec.ts`, extend `test("demo account shows account-backed saved commutes", ...)` after the existing expectations:

```ts
await page.getByRole("button", { name: /View 5 stops/ }).click();
await expect(page.getByRole("list", { name: "Stops for Morning commute" })).toBeVisible();
await expect(page.getByText("Stub Station", { exact: true })).toBeVisible();
await expect(page.getByText("Union", { exact: true })).toBeVisible();

await page.getByRole("button", { name: "View path on map" }).click();
await expect(page.locator("[data-commute-path-preview]")).toBeVisible();
await expect(page.getByRole("status").filter({ hasText: "Viewing" })).toBeVisible();
await page.getByRole("button", { name: "Clear" }).click();
await expect(page.locator("[data-commute-path-preview]")).toHaveCount(0);
```

- [ ] **Step 2: Run the smoke test**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS. If the command starts local services internally, wait for the full Playwright result and read the final status.

- [ ] **Step 3: Commit smoke coverage**

Run:

```bash
git add frontend/tests/smoke/dashboard.spec.ts
git commit -m "test: cover saved commute route preview flow"
```

---

### Task 6: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run backend verification**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 2: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run frontend lint**

Run:

```bash
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 5: Run production build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 6: Run smoke tests**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS.

- [ ] **Step 7: Manual browser check**

Run the app, sign into the demo account, open Saved Commutes, and verify:

- Origin and Destination use compact searchable pickers.
- Search results appear while typing station names.
- Empty search allows expanding line groups.
- Save button changes to `Plotting route` with a spinner while the create request is in flight.
- Existing route cards can expand a stop list.
- `View path on map` closes the commute submenu, shows a cyan route corridor on the map, and displays a clearable preview chip.
- Active alert overlays remain visually stronger than the saved commute path preview.
- The commute preview has no pointer interaction that blocks map pan, station taps, or alert overlay taps.

---

## Implementation Notes

- Do not replace the weighted pathfinder with manual station selection in this pass. The DTO already supports route stops and segment IDs, and weighted routing is the correct default.
- Do not introduce Redis for commute route caching. The weighted graph is small and an in-memory snapshot keyed by active schedule signature is enough.
- Keep the saved commute path preview non-interactive. It is a reference overlay, not an alert surface.
- Use teal/cyan for the saved commute preview. Red remains reserved for suspensions/closures, orange for delays/RSZ, and blue for planned closure previews.
- If `Save commute` still takes multiple seconds after Task 1, profile `CommuteImpactService.impactFor(...)` next. The first likely fix there is caching the current dashboard alert DTOs for the duration of one saved-commute list/create response instead of invoking each dashboard method repeatedly per commute.

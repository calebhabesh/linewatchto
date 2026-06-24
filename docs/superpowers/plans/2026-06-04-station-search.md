# Station Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a map-bounded station search that opens from a magnifying-glass button, dynamically fuzzy-matches mapped TTC subway/LRT stations while typing, supports line-by-line station browsing, and opens the existing station detail panel through the same interaction path as a map station click.

**Architecture:** Keep the feature entirely frontend-side and reuse existing `stationSummaries`, `selectedStationId`, map zoom, and `StationDetailPanel` behavior. Add one pure station-search helper for deterministic grouping/scoring and one client `StationSearchPanel` component that switches between fuzzy results and line browse based on the query.

**Tech Stack:** Next.js App Router, React client components, TypeScript, lucide-react icons, plain CSS in `frontend/src/app/globals.css`, Node built-in tests, Playwright smoke tests.

---

## Source And Scope Notes

- Product name stays **LineWatchTO**. Do not present this as an official TTC search.
- Search is bounded to stations already returned by `/api/stations` or the local fallback station summaries.
- Do not add a fuzzy-search dependency. The station list is small enough for local deterministic scoring on each keystroke.
- Reuse the existing station detail behavior: selecting a search result sets `selectedStationId`, clears any selected disruption, closes search, zooms the map to the station, and opens `StationDetailPanel`.
- Do not add backend endpoints in this slice.
- There are known uncommitted local changes in `frontend/src/components/InteractiveTtcMap.tsx` and `frontend/src/hooks/usePanZoom.ts` as of plan creation. Preserve them. This feature should not require editing `usePanZoom.ts`, and any `InteractiveTtcMap.tsx` touch should be avoided unless the current station-selection contract has changed.

## Desired UX

- A magnifying-glass button sits beside the hamburger menu in the top-left header.
- Pressing the button opens a floating search panel under the top-left controls.
- The search input autofocuses when the panel opens.
- Results update dynamically while the user types.
- Fuzzy behavior ranks matches in this order:
  - Exact normalized station name.
  - Exact acronym/initials, such as `vmc` for `Vaughan Metropolitan Centre`.
  - Prefix or compact prefix, such as `bloor` or `bloory`.
  - Token-prefix query, such as `blo yo` for `Bloor-Yonge`.
  - Substring or compact substring.
  - Loose subsequence, such as `egltn` for `Eglinton`.
- When the query is empty, show line entries similar to the legend. Clicking a line expands an ordered station list for that line.
- Hover may preview a line expansion on pointer devices, but click/focus is the primary accessible interaction.
- Interchange stations appear under each relevant line in line browsing, but only once in fuzzy search results.
- Pressing `Enter` with a query selects the top ranked result.
- Pressing `Escape` clears a non-empty query; pressing `Escape` again closes the panel.
- Selecting a station closes the search panel, preserves the last query/expanded line in React state for quick reopening, and opens station detail.

## Files

- Create: `frontend/src/app/station-search.ts`
- Create: `frontend/src/components/StationSearchPanel.tsx`
- Create: `frontend/tests/station-search.test.mjs`
- Modify: `frontend/src/app/station-data.ts`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/drawer-layout.test.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

---

### Task 1: Export Station Line Ordering Data

**Files:**
- Modify: `frontend/src/app/station-data.ts`

- [ ] **Step 1: Inspect the current constants**

Run:

```bash
rg -n "FALLBACK_LINE_DEFINITIONS|FALLBACK_LINE_STATION_IDS|fallbackLineIdsByStationId|toFallbackStationLine" frontend/src/app/station-data.ts
```

Expected: output includes the existing private constants and their internal references.

- [ ] **Step 2: Export the line definitions**

In `frontend/src/app/station-data.ts`, replace:

```ts
const FALLBACK_LINE_DEFINITIONS: Record<string, Omit<StationLine, "wheelchairAccessible" | "hasElevator">> = {
```

with:

```ts
export const STATION_LINE_DEFINITIONS: Record<string, Omit<StationLine, "wheelchairAccessible" | "hasElevator">> = {
```

- [ ] **Step 3: Export the authored line station order**

In `frontend/src/app/station-data.ts`, replace:

```ts
const FALLBACK_LINE_STATION_IDS: Record<string, string[]> = {
```

with:

```ts
export const STATION_LINE_STATION_IDS: Record<string, string[]> = {
```

- [ ] **Step 4: Update internal references**

In `frontend/src/app/station-data.ts`, replace every remaining `FALLBACK_LINE_DEFINITIONS` reference with `STATION_LINE_DEFINITIONS`, and replace every remaining `FALLBACK_LINE_STATION_IDS` reference with `STATION_LINE_STATION_IDS`.

The affected code should include these exact shapes after the change:

```ts
const fallbackLineIdsByStationId = Object.entries(STATION_LINE_STATION_IDS)
  .reduce<Record<string, string[]>>((lineIdsByStation, [lineId, stationIds]) => {
    for (const stationId of stationIds) {
      lineIdsByStation[stationId] = [...(lineIdsByStation[stationId] ?? []), lineId];
    }
    return lineIdsByStation;
  }, {});
```

and:

```ts
function toFallbackStationLine(stationId: string, lineId: string): StationLine {
  const line = STATION_LINE_DEFINITIONS[lineId];
  const stationLineId = `${stationId}:${lineId}`;
  return {
    ...line,
    wheelchairAccessible: !FALLBACK_NOT_WHEELCHAIR_ACCESSIBLE.has(stationLineId),
    hasElevator: !FALLBACK_WITHOUT_ELEVATOR.has(stationLineId),
  };
}
```

- [ ] **Step 5: Run the existing station data tests**

```bash
npm --prefix frontend run test:fixtures -- station-data.test.mjs
```

Expected: PASS. The export-only change must not alter fallback data behavior.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/station-data.ts
git commit -m "refactor: expose station line ordering"
```

---

### Task 2: Add Pure Station Search Helpers

**Files:**
- Create: `frontend/tests/station-search.test.mjs`
- Create: `frontend/src/app/station-search.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `frontend/tests/station-search.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildStationLineGroups,
  normalizeStationQuery,
  searchStations,
} from "../src/app/station-search.ts";
import { fallbackStationSummaries } from "../src/app/station-data.ts";

describe("station search helpers", () => {
  const stations = fallbackStationSummaries.stations;

  it("normalizes TTC station names and user input consistently", () => {
    assert.equal(normalizeStationQuery(" St. George  "), "saint george");
    assert.equal(normalizeStationQuery("Bloor-Yonge"), "bloor yonge");
    assert.equal(normalizeStationQuery("VMC"), "vmc");
  });

  it("groups stations by authored line order", () => {
    const groups = buildStationLineGroups(stations);
    const line1 = groups.find((group) => group.line.id === "line-1");
    const line2 = groups.find((group) => group.line.id === "line-2");

    assert.ok(line1);
    assert.ok(line2);
    assert.equal(line1.stations[0].id, "vaughan-metropolitan-centre");
    assert.equal(line2.stations[0].id, "kipling");
    assert.ok(line1.stations.some((station) => station.id === "spadina"));
    assert.ok(line2.stations.some((station) => station.id === "spadina"));
  });

  it("appends backend-only stations to the matching line group alphabetically", () => {
    const groups = buildStationLineGroups([
      ...stations,
      {
        id: "backend-only-a",
        name: "Backend Alpha",
        mapX: 10,
        mapY: 10,
        interchange: false,
        lineIds: ["line-1"],
        hasActiveImpact: false,
        accessStatus: "normal",
      },
      {
        id: "backend-only-z",
        name: "Backend Zeta",
        mapX: 20,
        mapY: 20,
        interchange: false,
        lineIds: ["line-1"],
        hasActiveImpact: false,
        accessStatus: "normal",
      },
    ]);

    const line1 = groups.find((group) => group.line.id === "line-1");
    assert.ok(line1);
    assert.deepEqual(
      line1.stations.slice(-2).map((station) => station.id),
      ["backend-only-a", "backend-only-z"]
    );
  });

  it("ranks exact, acronym, token-prefix, and subsequence fuzzy matches", () => {
    assert.equal(searchStations(stations, "Union")[0].station.id, "union");
    assert.equal(searchStations(stations, "vmc")[0].station.id, "vaughan-metropolitan-centre");
    assert.equal(searchStations(stations, "blo yo")[0].station.id, "bloor-yonge");
    assert.equal(searchStations(stations, "egltn")[0].station.id, "eglinton");
  });

  it("returns no results for an empty query", () => {
    assert.deepEqual(searchStations(stations, ""), []);
    assert.deepEqual(searchStations(stations, "   "), []);
  });
});
```

- [ ] **Step 2: Run the helper tests to verify they fail**

```bash
npm --prefix frontend run test:fixtures -- station-search.test.mjs
```

Expected: FAIL because `frontend/src/app/station-search.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `frontend/src/app/station-search.ts`:

```ts
import {
  STATION_LINE_DEFINITIONS,
  STATION_LINE_STATION_IDS,
  type StationSummary,
} from "./station-data";

type MatchKind = "exact" | "acronym" | "prefix" | "token-prefix" | "substring" | "subsequence";

export type StationSearchLine = {
  id: string;
  number: string;
  name: string;
  color: string;
  icon: string;
};

export type StationLineGroup = {
  line: StationSearchLine;
  stations: StationSummary[];
};

export type StationSearchResult = {
  station: StationSummary;
  score: number;
  matchKind: MatchKind;
  lineIds: string[];
};

export const STATION_SEARCH_LINES: StationSearchLine[] = Object.values(STATION_LINE_DEFINITIONS).map((line) => ({
  id: line.id,
  number: line.number,
  name: line.name,
  color: line.color,
  icon: `/assets/linewatch/${line.id}-legend.svg?v=2`,
}));

export function normalizeStationQuery(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bst\.?(?=\s|$)/g, "saint")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compact(value: string) {
  return value.replace(/\s+/g, "");
}

function acronym(value: string) {
  return normalizeStationQuery(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => token[0])
    .join("");
}

function tokenPrefixScore(queryTokens: string[], targetTokens: string[]) {
  let cursor = 0;

  for (const queryToken of queryTokens) {
    const nextIndex = targetTokens.findIndex((targetToken, index) => {
      return index >= cursor && targetToken.startsWith(queryToken);
    });

    if (nextIndex === -1) {
      return null;
    }

    cursor = nextIndex + 1;
  }

  return cursor;
}

function subsequencePenalty(query: string, target: string) {
  let cursor = -1;
  let gaps = 0;

  for (const character of query) {
    const nextIndex = target.indexOf(character, cursor + 1);
    if (nextIndex === -1) {
      return null;
    }

    if (cursor >= 0) {
      gaps += nextIndex - cursor - 1;
    }
    cursor = nextIndex;
  }

  return gaps + Math.max(0, target.length - query.length);
}

function scoreStation(station: StationSummary, query: string): Pick<StationSearchResult, "score" | "matchKind"> | null {
  const normalizedName = normalizeStationQuery(station.name);
  const normalizedQuery = normalizeStationQuery(query);
  const compactName = compact(normalizedName);
  const compactQuery = compact(normalizedQuery);

  if (!compactQuery) {
    return null;
  }

  const stationAcronym = acronym(station.name);

  if (normalizedName === normalizedQuery || compactName === compactQuery) {
    return { score: 0, matchKind: "exact" };
  }

  if (stationAcronym === compactQuery) {
    return { score: 2, matchKind: "acronym" };
  }

  if (normalizedName.startsWith(normalizedQuery) || compactName.startsWith(compactQuery)) {
    return { score: 8, matchKind: "prefix" };
  }

  if (stationAcronym.startsWith(compactQuery)) {
    return { score: 12, matchKind: "acronym" };
  }

  const tokenScore = tokenPrefixScore(normalizedQuery.split(" "), normalizedName.split(" "));
  if (tokenScore !== null) {
    return { score: 20 + tokenScore, matchKind: "token-prefix" };
  }

  if (normalizedName.includes(normalizedQuery) || compactName.includes(compactQuery)) {
    return { score: 40, matchKind: "substring" };
  }

  const penalty = subsequencePenalty(compactQuery, compactName);
  if (penalty !== null) {
    return { score: 80 + penalty, matchKind: "subsequence" };
  }

  return null;
}

export function buildStationLineGroups(stations: StationSummary[]): StationLineGroup[] {
  const stationById = new Map(stations.map((station) => [station.id, station]));

  return STATION_SEARCH_LINES.map((line) => {
    const orderedIds = STATION_LINE_STATION_IDS[line.id] ?? [];
    const orderedStations = orderedIds
      .map((stationId) => stationById.get(stationId))
      .filter((station): station is StationSummary => Boolean(station));
    const orderedStationIds = new Set(orderedStations.map((station) => station.id));
    const appendedStations = stations
      .filter((station) => station.lineIds.includes(line.id) && !orderedStationIds.has(station.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      line,
      stations: [...orderedStations, ...appendedStations],
    };
  }).filter((group) => group.stations.length > 0);
}

export function searchStations(stations: StationSummary[], query: string, limit = 12): StationSearchResult[] {
  return stations
    .map((station) => {
      const scored = scoreStation(station, query);
      if (!scored) {
        return null;
      }

      return {
        station,
        score: scored.score,
        matchKind: scored.matchKind,
        lineIds: station.lineIds,
      };
    })
    .filter((result): result is StationSearchResult => Boolean(result))
    .sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }

      return a.station.name.localeCompare(b.station.name);
    })
    .slice(0, limit);
}
```

- [ ] **Step 4: Run the helper tests**

```bash
npm --prefix frontend run test:fixtures -- station-search.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/station-search.ts frontend/tests/station-search.test.mjs
git commit -m "feat: add station search helpers"
```

---

### Task 3: Add The Station Search Panel Component

**Files:**
- Create: `frontend/src/components/StationSearchPanel.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/StationSearchPanel.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AlertTriangle, ChevronDown, Search, X } from "lucide-react";
import {
  buildStationLineGroups,
  searchStations,
  STATION_SEARCH_LINES,
  type StationSearchLine,
} from "../app/station-search";
import type { StationSummary } from "../app/station-data";

type Props = {
  open: boolean;
  stations: StationSummary[];
  selectedStationId: string | null;
  onSelectStation: (stationId: string) => void;
  onClose: () => void;
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
      className="station-search-line-badge"
      style={{ backgroundColor: line.color, color: lineTextColor(line.id) }}
      aria-label={`Line ${line.number}`}
      title={`Line ${line.number} ${line.name}`}
    >
      {line.number}
    </span>
  );
}

function StationMetaFlags({ station }: { station: StationSummary }) {
  if (!station.hasActiveImpact && station.accessStatus === "normal") {
    return null;
  }

  return (
    <span className="station-search-flags">
      {station.hasActiveImpact ? (
        <span className="station-search-flag station-search-flag-impact">
          <AlertTriangle size={12} />
          Impact
        </span>
      ) : null}
      {station.accessStatus !== "normal" ? (
        <span className={`station-search-flag station-search-flag-access access-${station.accessStatus}`}>
          Access
        </span>
      ) : null}
    </span>
  );
}

function StationButton({
  station,
  selected,
  onSelect,
}: {
  station: StationSummary;
  selected: boolean;
  onSelect: (stationId: string) => void;
}) {
  const lines = station.lineIds
    .map((lineId) => lineById(lineId))
    .filter((line): line is StationSearchLine => Boolean(line));

  return (
    <button
      type="button"
      className={`station-search-station ${selected ? "selected" : ""}`}
      onClick={() => onSelect(station.id)}
      aria-current={selected ? "true" : undefined}
      aria-label={`${station.name} station search result`}
    >
      <span className="min-w-0">
        <span className="station-search-station-name">{station.name}</span>
        <StationMetaFlags station={station} />
      </span>
      <span className="station-search-line-badges" aria-hidden="true">
        {lines.map((line) => (
          <StationLineBadge key={line.id} line={line} />
        ))}
      </span>
    </button>
  );
}

export function StationSearchPanel({ open, stations, selectedStationId, onSelectStation, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const results = useMemo(() => searchStations(stations, query), [query, stations]);
  const lineGroups = useMemo(() => buildStationLineGroups(stations), [stations]);
  const activeLineId = hoveredLineId ?? expandedLineId;

  useEffect(() => {
    if (!open) {
      return;
    }

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  function chooseStation(stationId: string) {
    onSelectStation(stationId);
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (query.trim()) {
        setQuery("");
      } else {
        onClose();
      }
      return;
    }

    if (event.key === "Enter" && query.trim() && results[0]) {
      event.preventDefault();
      chooseStation(results[0].station.id);
    }
  }

  return (
    <section
      className={`station-search-panel panel-strong ${open ? "open" : ""}`}
      aria-label="Station search"
      aria-hidden={!open}
      inert={!open ? true : undefined}
      data-station-search-panel
      data-open={open ? "true" : "false"}
    >
      <div className="station-search-input-row">
        <Search size={18} className="station-search-input-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="searchbox"
          aria-label="Search mapped stations"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search stations"
          className="station-search-input"
        />
        <button
          type="button"
          className="station-search-clear"
          onClick={() => (query ? setQuery("") : onClose())}
          aria-label={query ? "Clear station search" : "Close station search"}
        >
          <X size={18} />
        </button>
      </div>

      <div className="station-search-content">
        {query.trim() ? (
          <div className="station-search-results" aria-label="Station search results">
            {results.length > 0 ? (
              results.map((result) => (
                <StationButton
                  key={result.station.id}
                  station={result.station}
                  selected={selectedStationId === result.station.id}
                  onSelect={chooseStation}
                />
              ))
            ) : (
              <div className="station-search-empty" role="status">
                No mapped station matches.
              </div>
            )}
          </div>
        ) : (
          <div className="station-search-lines" aria-label="Browse stations by line">
            {lineGroups.map((group) => {
              const expanded = activeLineId === group.line.id;

              return (
                <div
                  key={group.line.id}
                  className={`station-search-line-group ${expanded ? "expanded" : ""}`}
                  onMouseEnter={() => setHoveredLineId(group.line.id)}
                  onMouseLeave={() => setHoveredLineId(null)}
                >
                  <button
                    type="button"
                    className="station-search-line-trigger"
                    onClick={() => setExpandedLineId((current) => current === group.line.id ? null : group.line.id)}
                    aria-expanded={expanded}
                    aria-controls={`station-search-${group.line.id}`}
                  >
                    <Image src={group.line.icon} alt="" width={34} height={34} aria-hidden="true" />
                    <span className="station-search-line-copy">
                      <span className="station-search-line-title">Line {group.line.number}</span>
                      <span className="station-search-line-name">{group.line.name}</span>
                    </span>
                    <ChevronDown size={17} className="station-search-line-chevron" aria-hidden="true" />
                  </button>

                  <div
                    id={`station-search-${group.line.id}`}
                    className="station-search-line-branch"
                    hidden={!expanded}
                  >
                    {group.stations.map((station) => (
                      <StationButton
                        key={`${group.line.id}-${station.id}`}
                        station={station}
                        selected={selectedStationId === station.id}
                        onSelect={chooseStation}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Run typecheck to expose component issues**

```bash
npm --prefix frontend run typecheck
```

Expected: PASS. Type errors in the new component must be fixed before moving on.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StationSearchPanel.tsx
git commit -m "feat: add station search panel"
```

---

### Task 4: Wire Search Into The App Shell

**Files:**
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/tests/drawer-layout.test.mjs`

- [ ] **Step 1: Update the source assertion test**

In `frontend/tests/drawer-layout.test.mjs`, add this import beside the existing component source reads:

```js
const stationSearchSource = readFileSync(new URL("../src/components/StationSearchPanel.tsx", import.meta.url), "utf8");
```

Replace the `ActiveView` assertion with:

```js
assert.match(shellSource, /type ActiveView = "map" \| "menu" \| "search" \| "alerts" \| "delays" \| "reduced-speed-zones" \| "closures" \| "commutes" \| "analytics"/);
```

Add these assertions inside `keeps the map first while exposing floating menu and submenu states`:

```js
assert.match(shellSource, /handleToggleSearch/);
assert.match(shellSource, /Search stations/);
assert.match(shellSource, /StationSearchPanel/);
assert.match(shellSource, /activeView === "search"/);
assert.match(stationSearchSource, /searchStations/);
assert.match(stationSearchSource, /buildStationLineGroups/);
assert.match(stationSearchSource, /onSelectStation/);
```

- [ ] **Step 2: Run the source assertion test to verify it fails**

```bash
npm --prefix frontend run test:fixtures -- drawer-layout.test.mjs
```

Expected: FAIL because the shell does not include the search view yet.

- [ ] **Step 3: Import the component and icon**

In `frontend/src/components/LineWatchShell.tsx`, add:

```ts
import { StationSearchPanel } from "./StationSearchPanel";
```

Update the lucide import so it includes `Search`:

```ts
import { Menu, X, Map as MapIcon, AlertTriangle, Calendar, Navigation, ShieldCheck, BarChart3, Construction, Search } from "lucide-react";
```

- [ ] **Step 4: Add the search view to the union**

Replace:

```ts
type ActiveView = "map" | "menu" | "alerts" | "delays" | "reduced-speed-zones" | "closures" | "commutes" | "analytics";
```

with:

```ts
type ActiveView = "map" | "menu" | "search" | "alerts" | "delays" | "reduced-speed-zones" | "closures" | "commutes" | "analytics";
```

- [ ] **Step 5: Add shared station selection and search toggle handlers**

Add these functions after `handleToggleMenu`:

```ts
  const handleToggleSearch = () => {
    setActiveView((prev) => {
      if (prev !== "search" && prev !== "map") {
        setSelection(null);
        setSelectedStationId(null);
      }

      return prev === "search" ? "map" : "search";
    });
  };

  const handleSelectStationId = (id: string | null) => {
    setSelectedStationId(id);
    setSelection(null);
    if (id) {
      setActiveView("map");
    }
  };
```

- [ ] **Step 6: Add the search button beside the hamburger**

In the header button group, immediately after the menu toggle button, add:

```tsx
          <button
            onClick={handleToggleSearch}
            className={`panel relative flex items-center justify-center w-14 h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-100 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer ${activeView === "search" ? "ring-2 ring-blue-500/40" : ""}`}
            aria-label="Search stations"
            aria-expanded={activeView === "search"}
          >
            <Search
              className={`text-slate-800 dark:text-white transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeView === "search" ? "scale-110 text-blue-600 dark:text-blue-300" : ""}`}
              size={25}
            />
          </button>
```

- [ ] **Step 7: Render the station search panel**

Inside the same `div` that contains the menu button and floating dropdown, after the floating dropdown menu block, add:

```tsx
          <StationSearchPanel
            open={activeView === "search"}
            stations={stationSummaries}
            selectedStationId={selectedStationId}
            onSelectStation={(id) => handleSelectStationId(id)}
            onClose={() => setActiveView("map")}
          />
```

- [ ] **Step 8: Reuse the shared station selection handler for map station clicks**

Replace the inline `onSelectStationId` prop passed to `InteractiveTtcMap`:

```tsx
          onSelectStationId={(id) => {
            setSelectedStationId(id);
            setSelection(null);
          }}
```

with:

```tsx
          onSelectStationId={handleSelectStationId}
```

- [ ] **Step 9: Run the source assertion test**

```bash
npm --prefix frontend run test:fixtures -- drawer-layout.test.mjs
```

Expected: PASS.

- [ ] **Step 10: Run typecheck**

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/LineWatchShell.tsx frontend/tests/drawer-layout.test.mjs
git commit -m "feat: wire station search into shell"
```

---

### Task 5: Add Search Panel Styling

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Append search CSS**

Append this CSS to `frontend/src/app/globals.css`:

```css
.station-search-panel {
  position: absolute;
  top: 72px;
  left: 0;
  width: min(calc(100vw - 32px), 390px);
  max-height: min(72vh, 680px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
  transform-origin: top left;
  transform: translateY(-16px) scale(0.94);
  opacity: 0;
  pointer-events: none;
  transition: opacity 220ms ease, transform 220ms cubic-bezier(0.23, 1, 0.32, 1);
}

.station-search-panel.open {
  transform: translateY(0) scale(1);
  opacity: 1;
  pointer-events: auto;
}

.station-search-input-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 38px;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.12);
  background: rgba(255, 255, 255, 0.5);
}

.dark .station-search-input-row {
  border-bottom-color: rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.18);
}

.station-search-input-icon {
  color: rgb(100, 116, 139);
}

.station-search-input {
  min-width: 0;
  height: 42px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  padding: 0 12px;
  color: rgb(15, 23, 42);
  font-size: 14px;
  font-weight: 700;
  outline: none;
}

.dark .station-search-input {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(10, 12, 16, 0.94);
  color: white;
}

.station-search-input:focus {
  border-color: rgba(37, 99, 235, 0.7);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.16);
}

.station-search-clear {
  display: flex;
  height: 38px;
  width: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: rgb(71, 85, 105);
  transition: background 160ms ease, color 160ms ease;
}

.station-search-clear:hover,
.station-search-clear:focus-visible {
  background: rgba(15, 23, 42, 0.08);
  color: rgb(15, 23, 42);
  outline: none;
}

.dark .station-search-clear {
  color: rgb(203, 213, 225);
}

.dark .station-search-clear:hover,
.dark .station-search-clear:focus-visible {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.station-search-content {
  overflow-y: auto;
  padding: 10px;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.28) transparent;
}

.station-search-results,
.station-search-lines {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.station-search-empty {
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.1);
  padding: 12px;
  color: rgb(146, 64, 14);
  font-size: 13px;
  font-weight: 700;
}

.dark .station-search-empty {
  color: rgb(252, 211, 77);
}

.station-search-line-group {
  border-radius: 8px;
}

.station-search-line-trigger {
  display: grid;
  width: 100%;
  grid-template-columns: 38px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 10px;
  border-radius: 8px;
  padding: 9px;
  text-align: left;
  color: rgb(30, 41, 59);
  transition: background 160ms ease, transform 160ms ease;
}

.station-search-line-trigger:hover,
.station-search-line-trigger:focus-visible,
.station-search-line-group.expanded .station-search-line-trigger {
  background: rgba(15, 23, 42, 0.07);
  outline: none;
}

.dark .station-search-line-trigger {
  color: rgb(226, 232, 240);
}

.dark .station-search-line-trigger:hover,
.dark .station-search-line-trigger:focus-visible,
.dark .station-search-line-group.expanded .station-search-line-trigger {
  background: rgba(255, 255, 255, 0.08);
}

.station-search-line-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.station-search-line-title {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
  color: rgb(100, 116, 139);
}

.station-search-line-name {
  overflow-wrap: anywhere;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.15;
}

.station-search-line-chevron {
  justify-self: center;
  color: rgb(100, 116, 139);
  transition: transform 180ms ease;
}

.station-search-line-group.expanded .station-search-line-chevron {
  transform: rotate(180deg);
}

.station-search-line-branch {
  position: relative;
  margin: 6px 0 10px 26px;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.station-search-line-branch::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 14px;
  left: 0;
  width: 2px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.55);
}

.station-search-line-branch .station-search-station::before {
  content: "";
  position: absolute;
  left: -18px;
  top: 50%;
  width: 14px;
  height: 2px;
  background: rgba(148, 163, 184, 0.55);
}

.station-search-station {
  position: relative;
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.66);
  padding: 10px;
  color: rgb(15, 23, 42);
  text-align: left;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.station-search-station:hover,
.station-search-station:focus-visible,
.station-search-station.selected {
  border-color: rgba(37, 99, 235, 0.52);
  background: rgba(219, 234, 254, 0.9);
  outline: none;
}

.dark .station-search-station {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(18, 21, 28, 0.92);
  color: white;
}

.dark .station-search-station:hover,
.dark .station-search-station:focus-visible,
.dark .station-search-station.selected {
  border-color: rgba(96, 165, 250, 0.65);
  background: rgba(30, 58, 138, 0.42);
}

.station-search-station-name {
  display: block;
  overflow-wrap: anywhere;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.16;
}

.station-search-line-badges,
.station-search-flags {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.station-search-line-badge {
  display: inline-flex;
  min-width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(0, 0, 0, 0.28);
  border-radius: 999px;
  padding: 0 7px;
  font-size: 11px;
  font-weight: 950;
}

.station-search-flags {
  margin-top: 5px;
}

.station-search-flag {
  display: inline-flex;
  min-height: 18px;
  align-items: center;
  gap: 3px;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
}

.station-search-flag-impact {
  background: rgba(239, 68, 68, 0.12);
  color: rgb(185, 28, 28);
}

.station-search-flag-access {
  background: rgba(245, 158, 11, 0.14);
  color: rgb(146, 64, 14);
}

.dark .station-search-flag-impact {
  color: rgb(252, 165, 165);
}

.dark .station-search-flag-access {
  color: rgb(252, 211, 77);
}

.motion-paused .station-search-panel,
.motion-paused .station-search-line-chevron,
.motion-paused .station-search-station,
.motion-paused .station-search-line-trigger {
  transition: none;
}

.high-contrast .station-search-panel,
.high-contrast .station-search-input,
.high-contrast .station-search-station,
.high-contrast .station-search-line-trigger {
  border-color: #ffffff;
}

@media (max-width: 640px) {
  .station-search-panel {
    width: min(calc(100vw - 32px), 420px);
    max-height: 68vh;
  }
}
```

- [ ] **Step 2: Run lint**

```bash
npm --prefix frontend run lint
```

Expected: PASS. CSS class additions do not affect lint, but this catches component issues introduced in previous tasks.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "style: add station search panel styling"
```

---

### Task 6: Add Browser Smoke Coverage

**Files:**
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Add dynamic fuzzy search smoke test**

Append this test to `frontend/tests/smoke/dashboard.spec.ts`:

```ts
test("station search dynamically filters mapped stations and opens station details", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Search stations" }).click();
  await expect(page.getByRole("searchbox", { name: "Search mapped stations" })).toBeFocused();

  await page.getByRole("searchbox", { name: "Search mapped stations" }).fill("stub");
  await expect(page.getByRole("button", { name: "Stub Station station search result" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search mapped stations" }).fill("stb stn");
  await expect(page.getByRole("button", { name: "Stub Station station search result" })).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toBeVisible();
  await expect(page.locator('[data-station-search-panel][data-open="false"]')).toBeVisible();
});
```

- [ ] **Step 2: Add fallback line-browse smoke test**

Append this test to `frontend/tests/smoke/dashboard.spec.ts` after the dynamic search test:

```ts
test("station search browses fallback station lists by line", async ({ page, request }) => {
  await setStubMode(request, "unavailable");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  await page.getByRole("button", { name: "Search stations" }).click();
  await page.getByRole("button", { name: /Line 5\s+Eglinton Crosstown/ }).click();
  await expect(page.getByRole("button", { name: "Mount Dennis station search result" })).toBeVisible();

  await page.getByRole("button", { name: "Mount Dennis station search result" }).click();
  await expect(page.getByRole("complementary", { name: "Mount Dennis station details" })).toBeVisible();
  await expect(page.getByText("Backend unavailable. Showing local fallback station data.")).toBeVisible();
});
```

- [ ] **Step 3: Run the smoke tests**

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS. If Playwright browsers are missing, run `npm --prefix frontend run test:smoke:install` only with user approval because it downloads browser binaries.

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/smoke/dashboard.spec.ts
git commit -m "test: cover station search interactions"
```

---

### Task 7: Run Full Frontend Verification

**Files:**
- No file edits.

- [ ] **Step 1: Run fixture tests**

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

- [ ] **Step 4: Run production build**

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 5: Run smoke tests**

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS.

- [ ] **Step 6: Commit verification-only fixes if any were required**

If verification required code changes, commit the changed files with a focused message:

```bash
git add frontend/src/app/station-search.ts frontend/src/components/StationSearchPanel.tsx frontend/src/components/LineWatchShell.tsx frontend/src/app/globals.css frontend/tests/station-search.test.mjs frontend/tests/drawer-layout.test.mjs frontend/tests/smoke/dashboard.spec.ts frontend/src/app/station-data.ts
git commit -m "fix: stabilize station search verification"
```

If no verification fixes were required, do not create an empty commit.

---

## Execution Notes

- Keep the search panel mounted even when closed so query and expanded line state persist during the session.
- Do not keep search visually open after selecting a station. The station detail panel and map focus should take over.
- Do not add route, bus, streetcar, or GO search in this feature.
- Do not claim live station arrivals or official TTC search.
- Preserve unrelated local modifications. Start implementation with `git status --short` and inspect diffs before editing files that already have changes.

## Verification Commands Summary

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

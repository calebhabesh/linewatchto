# Map Interaction Stability Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LineWatchTO map focus animations one-shot, keep overlay updates seamless during dashboard refreshes, align station selection flashes to the actual SVG station geometry, and make map controls readable over dense SVG content.

**Architecture:** Keep the current SVG-backed map and React-rendered overlay architecture. Treat focus zoom as a transient command, not a persistent side effect of selected state; retain the last good dashboard payload across transient refresh failures; derive visual station hit geometry from the loaded SVG whenever possible; and give the top-center controls a stable high-contrast rail.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind utility classes, plain CSS in `frontend/src/app/globals.css`, Node built-in test runner, Playwright smoke tests, Java 21/Spring Boot only if station coordinate persistence is included.

---

## Gemini 3.5 Flash High Handoff Prompt

Use this exact prompt if starting a fresh Gemini session:

```text
You are working in ~/dev/ttc-reliability-navigator on LineWatchTO, an unofficial TTC reliability dashboard. Read AGENTS.md, GEMINI.md, README.md, and docs/superpowers/plans/2026-06-05-map-interaction-stability-polish.md before editing. Implement the plan task-by-task. Preserve user changes, do not touch unrelated files, do not claim the dashboard is live unless fresh ingestion is active, and run the verification commands listed at the end before saying work is complete.
```

## Current Diagnosis

- `frontend/src/components/InteractiveTtcMap.tsx:241-303` calls `zoomToPoint(...)` from a `useEffect` tied to persistent `selection`, `selectedStationId`, geometry maps, and refreshed dashboard arrays. The same selected item can refocus the map after data refresh or geometry recomputation.
- `frontend/src/hooks/usePanZoom.ts` keeps `isAnimating` true for 1000 ms, while the map style in `InteractiveTtcMap.tsx:558-564` checks `isAnimating` before `isDragging`. If the user drags during a focus animation, transform updates can still use the animation transition, making drag feel slow.
- `frontend/src/hooks/usePanZoom.ts` updates `transformRef` mostly from effects or drag events. Programmatic transforms such as `zoomToPoint` and `recenter` should commit to both state and ref synchronously so a pointer-down immediately after an animation starts does not use stale coordinates.
- `frontend/src/app/page.tsx:59` uses all-or-nothing fallback. One transient failed endpoint can swap the entire dashboard to local fixtures for a refresh.
- `frontend/src/components/InteractiveTtcMap.tsx:705-779` renders station flash, selected rings, hit targets, and station impact rings from `StationSummary.mapX/mapY`, not from actual SVG dot geometry.
- The checked-in map asset `frontend/public/assets/linewatch/ttc-subway-map-edited.svg` is byte-identical to `~/Pictures/Assets/LineWatch/TTC_Subway_Map_Edited.svg`, so reimporting that file alone will not fix Cedarvale.
- Cedarvale's SVG path is inside a transformed group around `frontend/public/assets/linewatch/ttc-subway-map-edited.svg:7721-7726`. The visual center is affected by `transform="translate(0,7.70436)"`, while fallback/backend seed data currently uses `cedarvale` as `mapY: 1802`.
- The top-center map controls in `InteractiveTtcMap.tsx:479-526` rely on text/drop shadows over the SVG. They need an actual rail/background, not dynamic intersection detection.

## Acceptance Criteria

- Clicking a station, station impact ring, alert overlay, delay overlay, RSZ overlay, or card "show/highlight on map" action may animate focus once.
- After that focus animation finishes, normal click-drag pan uses immediate pointer movement and never gets pulled back to the selected item unless the user selects the item again or selects a different item.
- Starting a drag during an in-progress focus animation cancels the animation transition immediately.
- Routine `router.refresh()` updates do not replace visible backend overlays with fixture overlays when one backend endpoint briefly times out.
- Legitimate alert resolution or new alert appearance transitions without a blank map-overlay frame.
- Station hit targets, station flashes, selected indicators, and station impact rings use the actual SVG station center when an SVG element exists.
- Cedarvale's selection flash is centered on the Cedarvale station dot in the current checked-in SVG.
- Reimporting `~/Pictures/Assets/LineWatch/TTC_Subway_Map_Edited.svg` is not required unless that external file later differs from the checked-in asset.
- The "Center", "Out", zoom slider, and "In" controls remain readable over station names, route lines, overlays, and high-contrast mode.

## File Structure

- Modify `frontend/src/hooks/usePanZoom.ts`
  - Owns transform state, transform refs, animation cancellation, drag/wheel handlers, and programmatic zoom helpers.
- Modify `frontend/src/components/InteractiveTtcMap.tsx`
  - Owns map focus commands, render layering, station geometry usage, overlay transition retention, and map control presentation.
- Modify `frontend/src/app/map-geometry.ts`
  - Add reusable SVG station-center extraction beside the existing SVG anchor/guide extraction.
- Modify `frontend/src/app/DataContext.tsx`
  - Add a dashboard data source/mode field so the shell can distinguish backend payloads from local fixture fallback.
- Modify `frontend/src/app/page.tsx`
  - Populate the dashboard data source/mode and avoid hiding a partial backend fetch failure behind indistinguishable fallback data.
- Modify `frontend/src/components/LineWatchShell.tsx`
  - Use a stable display-data state that retains the last good backend payload across transient fallback refreshes.
- Modify `frontend/src/app/globals.css`
  - Add map control rail styles and overlay exit/enter transition classes.
- Modify or create frontend tests under `frontend/tests/`
  - Prefer targeted source-level tests for the interaction guardrails plus Playwright smoke coverage for visual behavior.
- Optional backend persistence:
  - Create `backend/src/main/resources/db/migration/V17__station_map_coordinate_alignment.sql`
  - Modify `frontend/src/app/station-data.ts`
  - Only include this if you decide to persist updated station coordinates in API seed/fallback data in addition to runtime SVG geometry.

---

## Task 1: Baseline And Reproduction Notes

**Files:**
- Read: `frontend/src/hooks/usePanZoom.ts`
- Read: `frontend/src/components/InteractiveTtcMap.tsx`
- Read: `frontend/src/app/page.tsx`
- Read: `frontend/src/app/map-geometry.ts`
- Read: `frontend/src/app/globals.css`

- [ ] **Step 1: Check the working tree.**

Run:

```bash
git status --short
```

Expected: Preserve existing user changes. Do not revert unrelated files.

- [ ] **Step 2: Run the current focused frontend tests before editing.**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: Existing fixture/source tests pass before behavior changes. If they fail, record the failing test names and inspect whether the failure is unrelated.

- [ ] **Step 3: Confirm the map asset identity if needed.**

Run:

```bash
sha256sum frontend/public/assets/linewatch/ttc-subway-map-edited.svg ~/Pictures/Assets/LineWatch/TTC_Subway_Map_Edited.svg
```

Expected: The hashes currently match. Do not reimport the SVG unless the hashes differ in a future run.

---

## Task 2: Make Pan/Zoom Animations Cancellable And Ref-Safe

**Files:**
- Modify: `frontend/src/hooks/usePanZoom.ts`
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Test: `frontend/tests/map-layering.test.mjs` or create `frontend/tests/pan-zoom-behavior.test.mjs`

- [ ] **Step 1: Add a failing source test for drag overriding animation.**

Create or extend `frontend/tests/pan-zoom-behavior.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const hookSource = readFileSync(new URL("../src/hooks/usePanZoom.ts", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");

describe("pan zoom behavior guardrails", () => {
  it("cancels focus animation as soon as a drag starts", () => {
    assert.match(hookSource, /const cancelAnimation = useCallback/);
    assert.match(hookSource, /cancelAnimation\(\);\s*setIsDragging\(true\)/s);
  });

  it("commits programmatic transforms to the ref synchronously", () => {
    assert.match(hookSource, /function commitTransform|const commitTransform = useCallback/);
    assert.match(hookSource, /transformRef\.current = next/);
    assert.match(hookSource, /setTransform\(next\)/);
  });

  it("dragging disables transform transitions before animation state is considered", () => {
    assert.match(mapSource, /isDragging\s*\?\s*"none"\s*:\s*isAnimating/s);
  });
});
```

Run:

```bash
node --test frontend/tests/pan-zoom-behavior.test.mjs
```

Expected: Fails until the hook and transition order are changed.

- [ ] **Step 2: Update `usePanZoom` with synchronous transform commits.**

In `frontend/src/hooks/usePanZoom.ts`, add a helper after the refs:

```ts
const commitTransform = useCallback((next: { x: number; y: number; scale: number }) => {
  transformRef.current = next;
  setTransform(next);
}, []);
```

Use `commitTransform(next)` instead of bare `setTransform(next)` in:

- the initial resize centering branch
- resize proportional scaling branch
- `recenter`
- `zoomToPoint`

For updater-style calls such as wheel and zoom buttons, return through a helper pattern that updates the ref before returning:

```ts
setTransform((prev) => {
  const next = { x: newX, y: newY, scale: newScale };
  transformRef.current = next;
  return next;
});
```

- [ ] **Step 3: Add animation cancellation.**

In `frontend/src/hooks/usePanZoom.ts`, add:

```ts
const cancelAnimation = useCallback(() => {
  if (animTimeoutRef.current) {
    window.clearTimeout(animTimeoutRef.current);
    animTimeoutRef.current = null;
  }
  setIsAnimating(false);
}, []);
```

Update `startAnimation` so it clears the previous timeout and resets the ref to `null` when done:

```ts
const startAnimation = useCallback(() => {
  setIsAnimating(true);
  if (animTimeoutRef.current) window.clearTimeout(animTimeoutRef.current);
  animTimeoutRef.current = window.setTimeout(() => {
    animTimeoutRef.current = null;
    setIsAnimating(false);
  }, 850);
}, []);
```

In `handlePointerDown`, call `cancelAnimation()` before `setIsDragging(true)`.

In the cleanup effect, also clear `animTimeoutRef.current`.

Return `cancelAnimation` from the hook.

- [ ] **Step 4: Make dragging override animation transitions.**

In `frontend/src/components/InteractiveTtcMap.tsx`, change the transition expression so `isDragging` wins:

```tsx
transition: reducedMotion
  ? "none"
  : isDragging
    ? "none"
    : isAnimating
      ? "transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)"
      : "transform 0.1s ease-out",
```

- [ ] **Step 5: Run the focused test.**

Run:

```bash
node --test frontend/tests/pan-zoom-behavior.test.mjs
```

Expected: Passes.

---

## Task 3: Make Selection Focus A One-Shot Command

**Files:**
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Test: `frontend/tests/pan-zoom-behavior.test.mjs`

- [ ] **Step 1: Add failing tests for one-shot focus.**

Extend `frontend/tests/pan-zoom-behavior.test.mjs`:

```js
it("guards focus zoom by selected target key instead of every data refresh", () => {
  assert.match(mapSource, /lastFocusedTargetKeyRef/);
  assert.match(mapSource, /focusTargetKey/);
  assert.match(mapSource, /lastFocusedTargetKeyRef\.current === focusTargetKey/);
});
```

Run:

```bash
node --test frontend/tests/pan-zoom-behavior.test.mjs
```

Expected: Fails until focus gating is added.

- [ ] **Step 2: Add a target-key helper.**

In `InteractiveTtcMap.tsx`, add near the selection memo:

```ts
const focusTargetKey = useMemo(() => {
  if (selection) return `${selection.kind}:${selection.id}`;
  if (selectedStationId) return `station:${selectedStationId}`;
  return null;
}, [selection, selectedStationId]);

const lastFocusedTargetKeyRef = useRef<string | null>(null);
```

- [ ] **Step 3: Gate the focus effect.**

In the current focus effect at `InteractiveTtcMap.tsx:241-303`, keep dependencies needed to calculate the current point, but start with:

```ts
if (loadState !== "ready") return;

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

When a `zoomToPoint(...)` call actually happens, set:

```ts
lastFocusedTargetKeyRef.current = focusTargetKey;
```

Important: only set `lastFocusedTargetKeyRef.current` after a valid focus point exists and the zoom command is issued. If geometry is not available yet, leave it unset so the first ready geometry can still focus once.

- [ ] **Step 4: Do not recenter repeatedly on refresh.**

Remove or stop relying on `prevSelectionRef` and `prevSelectedStationIdRef` for data-refresh recentering. Clearing the target key should cause one recenter. Keeping the same selected item should never trigger another focus zoom simply because `networkSegments`, `anchorPoints`, `guidePaths`, or dashboard arrays got new identities.

- [ ] **Step 5: Run the focused tests.**

Run:

```bash
node --test frontend/tests/pan-zoom-behavior.test.mjs frontend/tests/map-layering.test.mjs
```

Expected: Passes.

---

## Task 4: Retain Last Good Dashboard Data Across Transient Fallback Refreshes

**Files:**
- Modify: `frontend/src/app/DataContext.tsx`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Test: `frontend/tests/page-data.test.mjs`

- [ ] **Step 1: Add a failing data-mode test.**

Extend `frontend/tests/page-data.test.mjs`:

```js
it("marks dashboard payloads as backend or fallback and lets the shell retain backend data", () => {
  assert.match(pageSource, /dataSource:\s*useFallback \? "fallback" : "backend"/);
  assert.match(shellSource, /displayData/);
  assert.match(shellSource, /setDisplayData\(initialData\)/);
  assert.match(shellSource, /initialData\.dataSource === "backend"/);
});
```

Run:

```bash
node --test frontend/tests/page-data.test.mjs
```

Expected: Fails until the data source is added.

- [ ] **Step 2: Add `dataSource` to `DashboardData`.**

In `frontend/src/app/DataContext.tsx`:

```ts
export interface DashboardData {
  dataSource: "backend" | "fallback";
  networkSegments: NetworkSegment[];
  stations: Station[];
  // keep existing fields unchanged
}
```

- [ ] **Step 3: Populate `dataSource` in `page.tsx`.**

In `frontend/src/app/page.tsx`, add to `initialData`:

```ts
dataSource: useFallback ? "fallback" as const : "backend" as const,
```

Keep the existing fixture-mode `generatedAt` copy for visible user messaging.

- [ ] **Step 4: Use stable display data in `LineWatchShell`.**

In `frontend/src/components/LineWatchShell.tsx`, create:

```ts
const [displayData, setDisplayData] = useState(initialData);

useEffect(() => {
  if (initialData.dataSource === "backend") {
    setDisplayData(initialData);
    return;
  }

  setDisplayData((previous) => {
    if (previous.dataSource === "backend") {
      return previous;
    }
    return initialData;
  });
}, [initialData]);
```

Then replace top-level destructuring and `DataProvider data={initialData}` with `displayData`:

```ts
const {
  generatedAt,
  activeAlerts,
  delays,
  reducedSpeedZones,
  lineStatuses,
  ingestionHealth,
  plannedClosures,
} = displayData;
```

```tsx
<DataProvider data={displayData}>
```

This prevents a single failed refresh from swapping visible backend overlays to fixture overlays. A legitimate backend response with no current alerts still uses `dataSource: "backend"` and updates immediately.

- [ ] **Step 5: Run the page-data tests.**

Run:

```bash
node --test frontend/tests/page-data.test.mjs
```

Expected: Passes.

---

## Task 5: Fade Overlay Layer Changes Instead Of Blank Unmounts

**Files:**
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/tests/map-layering.test.mjs`

- [ ] **Step 1: Add failing tests for retained overlay layers.**

Extend `frontend/tests/map-layering.test.mjs`:

```js
it("retains disappearing map overlays long enough to fade out", () => {
  assert.match(interactiveMapSource, /useRetainedMapLayers/);
  assert.match(interactiveMapSource, /map-layer-exiting/);
  assert.match(globalCss, /\.map-layer-exiting/);
});
```

Run:

```bash
node --test frontend/tests/map-layering.test.mjs
```

Expected: Fails until layer retention is added.

- [ ] **Step 2: Add a small retained-layer helper in `InteractiveTtcMap.tsx`.**

Add near the local types:

```ts
type RetainedLayer<T> = {
  key: string;
  item: T;
  exiting: boolean;
};

function useRetainedMapLayers<T>(
  items: T[],
  keyForItem: (item: T) => string,
  exitMs = 240,
) {
  const [retained, setRetained] = useState<RetainedLayer<T>[]>(() =>
    items.map((item) => ({ key: keyForItem(item), item, exiting: false })),
  );

  useEffect(() => {
    const nextByKey = new Map(items.map((item) => [keyForItem(item), item]));

    setRetained((previous) => {
      const previousByKey = new Map(previous.map((layer) => [layer.key, layer]));
      const nextLayers: RetainedLayer<T>[] = [];

      for (const item of items) {
        const key = keyForItem(item);
        nextLayers.push({ key, item, exiting: false });
        previousByKey.delete(key);
      }

      for (const oldLayer of previousByKey.values()) {
        nextLayers.push({ ...oldLayer, exiting: true });
      }

      return nextLayers;
    });

    const timer = window.setTimeout(() => {
      setRetained((current) => current.filter((layer) => !layer.exiting || nextByKey.has(layer.key)));
    }, exitMs);

    return () => window.clearTimeout(timer);
  }, [items, keyForItem, exitMs]);

  return retained;
}
```

If `keyForItem` causes dependency churn, wrap each key function in `useCallback`.

- [ ] **Step 3: Apply retained layers to planned previews and impact layers.**

Create retained versions:

```ts
const retainedPlannedPreviewLayers = useRetainedMapLayers(
  plannedPreviewLayers,
  ({ segment, closure }) => `${segment.id}:${closure.id}`,
);

const retainedImpactLayers = useRetainedMapLayers(
  renderedImpactLayers,
  ({ segment, impact }) => `${segment.id}:${impact.kind}:${impact.cardId}:${impact.travelDirection}`,
);
```

Render retained layers instead of raw arrays. Pass an `exiting` prop into `OverlaySegment`, and include `map-layer-exiting` in the wrapping group or path class when true. Exiting layers must use `pointer-events: none` so stale overlays cannot be clicked during fade-out.

- [ ] **Step 4: Apply retained layers to station impact rings.**

Create:

```ts
const retainedStationNodeImpacts = useRetainedMapLayers(
  stationNodeImpacts,
  (impact) => `${impact.kind}:${impact.cardId}:${impact.stationId}`,
);
```

Render retained station impacts. Add `map-layer-exiting` to the `<g>` or ring classes while `exiting` is true, and block pointer events on exiting rings.

- [ ] **Step 5: Add CSS for no-blank transitions.**

In `frontend/src/app/globals.css`:

```css
.map-layer-entering,
.map-layer-current {
  opacity: 1;
  transition: opacity 180ms ease;
}

.map-layer-exiting {
  opacity: 0;
  pointer-events: none !important;
  transition: opacity 240ms ease;
}

.motion-paused .map-layer-entering,
.motion-paused .map-layer-current,
.motion-paused .map-layer-exiting {
  transition: none !important;
}
```

- [ ] **Step 6: Run the layering tests.**

Run:

```bash
node --test frontend/tests/map-layering.test.mjs
```

Expected: Passes.

---

## Task 6: Use Actual SVG Station Centers For Visual Hit Geometry

**Files:**
- Modify: `frontend/src/app/map-geometry.ts`
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Test: `frontend/tests/map-geometry.test.mjs`
- Test: `frontend/tests/map-layering.test.mjs`

- [ ] **Step 1: Add failing source tests for station-center extraction.**

Extend `frontend/tests/map-geometry.test.mjs` or create a source assertion if DOM geometry is unavailable in Node:

```js
const mapGeometrySource = readFileSync(new URL("../src/app/map-geometry.ts", import.meta.url), "utf8");

it("exposes SVG station center extraction for visual hit targets", () => {
  assert.match(mapGeometrySource, /readSvgStationCenters/);
  assert.match(mapGeometrySource, /station-\$\{stationId\}/);
  assert.match(mapGeometrySource, /getBBox\(\)/);
  assert.match(mapGeometrySource, /getScreenCTM\(\)/);
});
```

Extend `frontend/tests/map-layering.test.mjs`:

```js
it("uses resolved SVG station centers for station flashes and hit targets", () => {
  assert.match(interactiveMapSource, /stationCenterPoints/);
  assert.match(interactiveMapSource, /stationPointFor/);
  assert.match(interactiveMapSource, /readSvgStationCenters/);
});
```

Run:

```bash
node --test frontend/tests/map-geometry.test.mjs frontend/tests/map-layering.test.mjs
```

Expected: Fails until implementation is added.

- [ ] **Step 2: Add station-center extraction to `map-geometry.ts`.**

Add:

```ts
export function readSvgStationCenters(
  root: SVGSVGElement,
  stationIds: string[],
): Map<string, MapPoint> {
  const centers = new Map<string, MapPoint>();

  for (const stationId of stationIds) {
    const element = root.querySelector<SVGGraphicsElement>(`#${CSS.escape(`station-${stationId}`)}`);
    if (!element) continue;

    const box = element.getBBox();
    const point = root.createSVGPoint();
    point.x = box.x + box.width / 2;
    point.y = box.y + box.height / 2;

    const elementMatrix = element.getScreenCTM();
    const rootMatrix = root.getScreenCTM();
    let resolved = point;

    if (elementMatrix && rootMatrix) {
      const relativeMatrix = rootMatrix.inverse().multiply(elementMatrix);
      resolved = point.matrixTransform(relativeMatrix);
    } else if (elementMatrix) {
      resolved = point.matrixTransform(elementMatrix);
    }

    centers.set(stationId, { x: resolved.x, y: resolved.y });
  }

  return centers;
}
```

If Spadina or another interchange uses multiple SVG elements without a direct `station-${id}` element, leave it on fallback coordinates in this task unless a visible misalignment is observed. Do not invent multi-anchor averaging unless a test/screenshot requires it.

- [ ] **Step 3: Wire station centers into `InteractiveTtcMap.tsx`.**

Import `readSvgStationCenters`.

Add state:

```ts
const [stationCenterPoints, setStationCenterPoints] = useState(new Map<string, MapPoint>());
```

Inside the existing `useLayoutEffect` after `readSvgGeometry(...)`:

```ts
setStationCenterPoints(readSvgStationCenters(
  mapSvgRef.current,
  stations.map((station) => station.id),
));
```

Make sure `stations` is in that effect dependency list.

Add:

```ts
const stationPointFor = useCallback((station: StationSummary): MapPoint => {
  return stationCenterPoints.get(station.id) ?? { x: station.mapX, y: station.mapY };
}, [stationCenterPoints]);
```

- [ ] **Step 4: Replace station visual coordinates.**

In station hit targets, selected indicators, station selection flash, station impact rings, and station impact red glow, calculate once per station:

```tsx
const point = stationPointFor(station);
```

Use:

```tsx
cx={point.x}
cy={point.y}
```

For station-specific zoom focus, use:

```ts
const point = stationPointFor(station);
zoomToPoint(point.x * scaleFactor, point.y * scaleFactor, 1.2);
```

Only keep `station.mapX/mapY` as fallback.

- [ ] **Step 5: Run focused tests.**

Run:

```bash
node --test frontend/tests/map-geometry.test.mjs frontend/tests/map-layering.test.mjs
```

Expected: Passes.

---

## Task 7: Optional Persisted Coordinate Hygiene For Cedarvale

**Files:**
- Optional create: `backend/src/main/resources/db/migration/V17__station_map_coordinate_alignment.sql`
- Optional modify: `frontend/src/app/station-data.ts`
- Optional test: `frontend/tests/station-data.test.mjs`
- Optional backend verification: `mvn -f backend/pom.xml test`

Only do this task after Task 6. Runtime SVG geometry is the real visual fix. This task keeps API/fallback coordinates closer to the current asset for data hygiene.

- [ ] **Step 1: Add a migration instead of editing old migrations.**

Create `backend/src/main/resources/db/migration/V17__station_map_coordinate_alignment.sql`:

```sql
update stations
set map_y = 1810
where id = 'cedarvale';
```

Use the exact center rounded from the current SVG. The current Cedarvale path center is approximately `x = 2935.6`, `y = 1810.2` after the group transform.

- [ ] **Step 2: Update frontend fallback data.**

In `frontend/src/app/station-data.ts`, update the `cedarvale` fallback seed entry:

```ts
mapX: 2936,
mapY: 1810,
```

- [ ] **Step 3: Add a regression assertion.**

Extend `frontend/tests/station-data.test.mjs`:

```js
it("keeps Cedarvale fallback coordinates aligned with the current SVG asset", () => {
  const cedarvale = fallbackStationSummaries.stations.find((station) => station.id === "cedarvale");
  assert.equal(cedarvale?.mapX, 2936);
  assert.equal(cedarvale?.mapY, 1810);
});
```

- [ ] **Step 4: Run optional backend/frontend coordinate checks.**

Run:

```bash
node --test frontend/tests/station-data.test.mjs
mvn -f backend/pom.xml test
```

Expected: Both pass. If Maven needs Postgres/Redis, report the exact failure and start required services only if allowed by the user/project workflow.

---

## Task 8: Add A Stable High-Contrast Rail Behind Map Controls

**Files:**
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/tests/map-layering.test.mjs` or create `frontend/tests/map-controls.test.mjs`

- [ ] **Step 1: Add failing control style tests.**

Create `frontend/tests/map-controls.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("map controls", () => {
  it("renders the zoom controls inside a readable control rail", () => {
    assert.match(mapSource, /map-control-rail/);
    assert.match(mapSource, /map-control-button/);
    assert.match(mapSource, /map-control-slider/);
  });

  it("styles the control rail for dark and high contrast map content", () => {
    assert.match(globalCss, /\.map-control-rail/);
    assert.match(globalCss, /\.high-contrast \.map-control-rail/);
    assert.match(globalCss, /\.map-control-button/);
  });
});
```

Run:

```bash
node --test frontend/tests/map-controls.test.mjs
```

Expected: Fails until the classes/styles are added.

- [ ] **Step 2: Update the controls markup.**

In `InteractiveTtcMap.tsx:479-526`, keep the same control order, but wrap them in a rail with real contrast:

```tsx
<div className="map-control-rail absolute top-14 sm:top-[92px] left-1/2 -translate-x-1/2 z-30 flex flex-row items-center justify-center gap-1 sm:gap-2 pointer-events-auto">
```

Change each button class to include `map-control-button` and reduce reliance on drop shadows:

```tsx
className="map-control-button group"
```

Change the slider wrapper to:

```tsx
<div className="map-control-slider flex flex-col items-center justify-center gap-1.5 mx-0.5 sm:mx-1">
```

Keep the existing accessible `aria-label` and `title` attributes.

- [ ] **Step 3: Add CSS for the rail.**

In `frontend/src/app/globals.css`:

```css
.map-control-rail {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(15, 23, 42, 0.16);
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.18);
  color: #0f172a;
  padding: 4px;
}

.dark .map-control-rail {
  background: rgba(10, 12, 16, 0.9);
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.42);
  color: #ffffff;
}

.high-contrast .map-control-rail {
  background: #000000;
  border-color: #ffffff;
  box-shadow: 0 0 0 2px #000000;
  color: #ffffff;
}

.map-control-button {
  align-items: center;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 56px;
  justify-content: center;
  outline: none;
  transition: background-color 150ms ease, color 150ms ease, transform 120ms ease;
  width: 64px;
}

.map-control-button:hover,
.map-control-button:focus-visible {
  background: rgba(37, 99, 235, 0.12);
  color: #2563eb;
}

.dark .map-control-button:hover,
.dark .map-control-button:focus-visible,
.high-contrast .map-control-button:hover,
.high-contrast .map-control-button:focus-visible {
  background: rgba(96, 165, 250, 0.18);
  color: #93c5fd;
}

.map-control-button:active {
  transform: scale(0.97);
}

.map-control-slider {
  min-width: 72px;
}
```

If Tailwind utility classes conflict with these classes, remove the redundant utilities from those four controls and keep the CSS classes as the source of truth.

- [ ] **Step 4: Run the control tests.**

Run:

```bash
node --test frontend/tests/map-controls.test.mjs
```

Expected: Passes.

---

## Task 9: Playwright Visual/Interaction Verification

**Files:**
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Add a smoke test for drag-after-focus.**

Add a Playwright test that:

- opens the dashboard with seeded API data
- clicks a known station such as Cedarvale or Union
- waits slightly longer than the focus animation duration
- drags the map
- asserts the map transform changed and stays changed after 500 ms

Use existing smoke-test setup patterns in `frontend/tests/smoke/dashboard.spec.ts`. Do not add new test infrastructure.

- [ ] **Step 2: Add a smoke assertion for the control rail.**

In an existing desktop smoke test, assert `.map-control-rail` is visible and has a non-transparent background:

```ts
const rail = page.locator(".map-control-rail");
await expect(rail).toBeVisible();
await expect(rail).toHaveCSS("border-radius", "8px");
```

For background alpha, use `evaluate` if direct CSS matching is brittle.

- [ ] **Step 3: Add a Cedarvale flash alignment check if practical.**

If Playwright can reliably locate the station SVG element and flash circle, compare their bounding boxes:

```ts
const stationBox = await page.locator("#station-cedarvale").boundingBox();
const flashBox = await page.locator('[data-map-highlight-id="cedarvale"]').boundingBox();
```

Assert the centers differ by no more than 4 CSS pixels. If transforms make this flaky, skip this assertion and rely on Task 6 plus manual screenshot verification.

---

## Task 10: Full Verification

Run these commands from the repository root after implementation:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Because this is substantial frontend interaction work, also run:

```bash
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

If Task 7 added a backend migration, also run:

```bash
mvn -f backend/pom.xml test
```

Manual browser checks:

- Click Cedarvale and confirm the blue station flash is centered on the Cedarvale dot.
- Click an alert/delay/RSZ overlay, wait for the focus animation to finish, then drag the map; it should move immediately and not snap back.
- Start dragging during the focus animation; dragging should cancel the animated transition.
- Trigger a dashboard refresh while overlays are visible; the base SVG and overlay layer should not blank.
- Let an alert resolve or switch to a scenario with no matching overlays; existing overlays should fade out instead of disappearing in one blank frame.
- Pan map labels under the top-center controls; the controls should remain readable in dark, light, and high-contrast modes.

## Self-Review Notes

- This plan intentionally does not recommend reimporting `~/Pictures/Assets/LineWatch/TTC_Subway_Map_Edited.svg` because it currently matches the checked-in asset exactly.
- Runtime SVG station-center extraction is the primary fix for off-center flashes because the rendered SVG is the visual source of truth.
- Persisted coordinate updates are optional and should be additive through `V17`, not by editing old migrations.
- The overlay-refresh fix has two layers: retain last good backend payload across transient fallback refreshes, then fade real overlay diffs for legitimate alert changes.

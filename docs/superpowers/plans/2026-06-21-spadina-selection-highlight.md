# Spadina Selection Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Spadina as one logical station with two synchronized circular map targets and highlights aligned to its Line 1 and Line 2 SVG dots.

**Architecture:** Keep `spadina` as the only station ID used by frontend state, APIs, and backend data. Add a small pure helper that maps a logical station to one or more SVG visual anchors; all stations retain one anchor except Spadina, which resolves to `station-spadina-1` and `station-spadina-2`. `InteractiveTtcMap` will use those anchors for pointer targets, hover/focus feedback, selection flashes, selected indicators, and commute endpoint markers while retaining one accessible tab stop and one station submenu.

**Tech Stack:** Next.js App Router, React 19, TypeScript, inline SVG, CSS in `frontend/src/app/globals.css`, Node built-in test runner, Playwright Chromium.

---

## Gemini 3.5 Flash Handoff Prompt

Use this prompt when starting implementation:

```text
You are working in . on LineWatchTO, an unofficial TTC reliability dashboard.

Read these files before editing:
- AGENTS.md
- GEMINI.md
- docs/superpowers/specs/2026-06-21-spadina-selection-highlight-design.md
- docs/superpowers/plans/2026-06-21-spadina-selection-highlight.md

Implement the plan task-by-task using test-driven development. Preserve all existing user changes and do not revert unrelated files. This is a frontend-only visual interaction change: do not modify station IDs, interchange booleans, fixture/domain metadata, backend code, database migrations, or API contracts. Spadina must remain one logical station and both visual dots must open the same Spadina submenu.

Run every verification command listed in the plan and read the output before claiming completion. Summarize changed files and commands run.
```

## Product Behavior

- Spadina remains one station with ID `spadina`.
- The Line 1 dot and Line 2 dot each receive a circular pointer target.
- Hovering either target on pointer-capable devices highlights both dots.
- Keyboard focus on the single accessible Spadina control highlights both dots.
- Clicking either dot opens the same Spadina station submenu.
- Selecting Spadina displays one blue selected indicator over each dot.
- Spadina selection and commute flashes render over both dots.
- Saved-commute endpoint markers render over both dots when Spadina is an endpoint.
- The existing white pill connector remains unchanged and receives no additional highlight.
- Other stations retain their current hit targets and visual sizing.
- Station-level impact rings remain centered on the logical station point.

## Non-Goals

- Do not change `interchange` values.
- Do not split Spadina into separate frontend or backend station records.
- Do not modify the map SVG.
- Do not change alert-to-station matching.
- Do not create line-specific Spadina station-detail panels.
- Do not add dependencies.

## Files

- Create: `frontend/src/components/station-map-visuals.ts`
  - Pure mapping from logical station IDs to SVG visual anchor IDs and resolved points.
- Create: `frontend/tests/station-map-visuals.test.mjs`
  - Unit coverage for Spadina's two anchors, ordinary stations, and geometry fallback.
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
  - Load Spadina's two SVG centers and render synchronized target/highlight circles.
- Modify: `frontend/src/app/globals.css`
  - Add synchronized hover styling and suppress the oversized native hover circle for multi-anchor stations.
- Modify: `frontend/tests/map-layering.test.mjs`
  - Source guardrails for multi-anchor integration and single-tab-stop accessibility.
- Modify: `frontend/tests/smoke/dashboard.spec.ts`
  - Browser verification that both dots select the same Spadina station and produce two indicators.

---

### Task 1: Establish the Failing Geometry and Integration Tests

**Files:**
- Create: `frontend/tests/station-map-visuals.test.mjs`
- Modify: `frontend/tests/map-layering.test.mjs`

- [ ] **Step 1: Check the working tree before editing.**

Run:

```bash
git status --short
```

Expected: Note existing changes and preserve them. Do not stage, overwrite, or revert unrelated files.

- [ ] **Step 2: Create the geometry behavior test.**

Create `frontend/tests/station-map-visuals.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, it } from "node:test";

const moduleUrl = new URL("../src/components/station-map-visuals.ts", import.meta.url);

async function loadStationMapVisuals() {
  assert.equal(
    existsSync(moduleUrl),
    true,
    "station-map-visuals.ts must define logical-to-visual station anchors",
  );
  return import(moduleUrl.href);
}

describe("station map visuals", () => {
  it("maps Spadina to its separate Line 1 and Line 2 SVG anchors", async () => {
    const { stationVisualAnchorIds, stationVisualCenterIds } = await loadStationMapVisuals();

    assert.deepEqual(stationVisualAnchorIds("spadina"), ["spadina-1", "spadina-2"]);
    assert.deepEqual(stationVisualCenterIds([{ id: "union" }, { id: "spadina" }]), [
      "union",
      "spadina-1",
      "spadina-2",
    ]);
  });

  it("resolves both Spadina points without changing its logical station ID", async () => {
    const { stationVisualAnchorsFor } = await loadStationMapVisuals();
    const centers = new Map([
      ["spadina-1", { x: 3740, y: 2524 }],
      ["spadina-2", { x: 3740, y: 2603 }],
    ]);

    assert.deepEqual(
      stationVisualAnchorsFor(
        { id: "spadina", mapX: 3740, mapY: 2564 },
        centers,
      ),
      [
        { id: "spadina-1", point: { x: 3740, y: 2524 } },
        { id: "spadina-2", point: { x: 3740, y: 2603 } },
      ],
    );
  });

  it("keeps ordinary stations on one anchor and safely falls back when special geometry is incomplete", async () => {
    const { stationVisualAnchorIds, stationVisualAnchorsFor } = await loadStationMapVisuals();

    assert.deepEqual(stationVisualAnchorIds("union"), ["union"]);
    assert.deepEqual(
      stationVisualAnchorsFor(
        { id: "union", mapX: 4311, mapY: 3597 },
        new Map([["union", { x: 4311, y: 3597 }]]),
      ),
      [{ id: "union", point: { x: 4311, y: 3597 } }],
    );
    assert.deepEqual(
      stationVisualAnchorsFor(
        { id: "spadina", mapX: 3740, mapY: 2564 },
        new Map([["spadina-1", { x: 3740, y: 2524 }]]),
      ),
      [{ id: "spadina", point: { x: 3740, y: 2564 } }],
    );
  });
});
```

- [ ] **Step 3: Add an integration guardrail to `map-layering.test.mjs`.**

Add this test inside `describe("asset-backed map layering", ...)`:

```js
  it("renders Spadina as two synchronized visual anchors for one station control", () => {
    assert.match(interactiveMapSource, /stationVisualCenterIds/);
    assert.match(interactiveMapSource, /stationVisualAnchorsFor/);
    assert.match(interactiveMapSource, /data-station-id=\{station\.id\}/);
    assert.match(interactiveMapSource, /data-station-anchor-id=\{anchorId\}/);
    assert.match(interactiveMapSource, /data-station-primary-target=\{anchorIndex === 0 \? "true" : "false"\}/);
    assert.match(interactiveMapSource, /data-station-hover-id=\{station\.id\}/);
    assert.match(interactiveMapSource, /data-station-selected-id=\{station\.id\}/);
    assert.match(interactiveMapSource, /tabIndex=\{anchorIndex === 0 \? 0 : -1\}/);
    assert.match(globalCss, /\.station-hover-indicator/);
    assert.match(globalCss, /\.station-hit-target\.multi-anchor:hover/);
  });
```

- [ ] **Step 4: Run the focused tests and verify the expected failure.**

Run:

```bash
node --test frontend/tests/station-map-visuals.test.mjs frontend/tests/map-layering.test.mjs
```

Expected: FAIL because `station-map-visuals.ts` does not exist and `InteractiveTtcMap` does not yet contain the multi-anchor integration.

- [ ] **Step 5: Commit the failing tests if branch policy allows test-only commits.**

```bash
git add frontend/tests/station-map-visuals.test.mjs frontend/tests/map-layering.test.mjs
git commit -m "test: define Spadina multi-anchor selection"
```

If unrelated changes are present, stage only these two files.

---

### Task 2: Add the Logical-to-Visual Station Anchor Helper

**Files:**
- Create: `frontend/src/components/station-map-visuals.ts`
- Test: `frontend/tests/station-map-visuals.test.mjs`

- [ ] **Step 1: Create the pure helper.**

Create `frontend/src/components/station-map-visuals.ts`:

```ts
import type { MapPoint } from "../app/map-geometry";
import type { StationSummary } from "../app/station-data";

export type StationVisualAnchor = {
  id: string;
  point: MapPoint;
};

type StationIdentity = Pick<StationSummary, "id">;
type StationPosition = Pick<StationSummary, "id" | "mapX" | "mapY">;

const SPECIAL_STATION_VISUAL_ANCHORS: Partial<Record<string, readonly string[]>> = {
  spadina: ["spadina-1", "spadina-2"],
};

export function stationVisualAnchorIds(stationId: string): string[] {
  return [...(SPECIAL_STATION_VISUAL_ANCHORS[stationId] ?? [stationId])];
}

export function stationVisualCenterIds(stations: readonly StationIdentity[]): string[] {
  return [...new Set(stations.flatMap((station) => stationVisualAnchorIds(station.id)))];
}

export function stationVisualAnchorsFor(
  station: StationPosition,
  stationCenterPoints: ReadonlyMap<string, MapPoint>,
): StationVisualAnchor[] {
  const anchorIds = stationVisualAnchorIds(station.id);
  const resolved = anchorIds.flatMap((anchorId) => {
    const point = stationCenterPoints.get(anchorId);
    return point ? [{ id: anchorId, point }] : [];
  });

  if (resolved.length === anchorIds.length) {
    return resolved;
  }

  return [{
    id: station.id,
    point: stationCenterPoints.get(station.id) ?? {
      x: station.mapX,
      y: station.mapY,
    },
  }];
}
```

The all-or-one fallback is intentional. If either special SVG anchor is missing, render one safe logical-station target instead of a partially split Spadina control.

- [ ] **Step 2: Run the helper test.**

Run:

```bash
node --test frontend/tests/station-map-visuals.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run type checking for the helper.**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit the helper.**

```bash
git add frontend/src/components/station-map-visuals.ts frontend/tests/station-map-visuals.test.mjs
git commit -m "feat: resolve multi-anchor station visuals"
```

---

### Task 3: Load and Render Both Spadina SVG Anchors

**Files:**
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Test: `frontend/tests/map-layering.test.mjs`

- [ ] **Step 1: Import the visual-anchor helpers.**

Add beside the other component helper imports:

```ts
import {
  stationVisualAnchorsFor,
  stationVisualCenterIds,
} from "./station-map-visuals";
```

- [ ] **Step 2: Add synchronized hover state.**

Add beside the existing map state:

```ts
const [hoveredStationId, setHoveredStationId] = useState<string | null>(null);
```

- [ ] **Step 3: Load the correct SVG IDs.**

In the existing `useLayoutEffect`, replace:

```ts
setStationCenterPoints(readSvgStationCenters(mapSvgRef.current, stations.map((s) => s.id)));
```

with:

```ts
setStationCenterPoints(
  readSvgStationCenters(mapSvgRef.current, stationVisualCenterIds(stations)),
);
```

This causes the existing SVG geometry reader to query `#station-spadina-1` and `#station-spadina-2`. Do not change `readSvgStationCenters`.

- [ ] **Step 4: Add a memoized visual-anchor resolver.**

Immediately after the existing `stationPointFor` callback, add:

```ts
const visualAnchorsForStation = useCallback(
  (station: Pick<StationSummary, "id" | "mapX" | "mapY">) =>
    stationVisualAnchorsFor(station, stationCenterPoints),
  [stationCenterPoints],
);
```

Keep `stationPointFor` unchanged. It remains the logical center used for map focusing, station-level alert rings, badges, and other one-point behavior.

- [ ] **Step 5: Expand saved-commute endpoint markers.**

In `commutePreviewEndpointPoints`, replace the current `.map(...)` chain with:

```ts
return endpointIds.flatMap((stationId) => {
  const station = stationById.get(stationId);
  return station
    ? visualAnchorsForStation(station).map((anchor) => anchor.point)
    : [];
});
```

Update the dependency array to:

```ts
}, [commutePathPreview, stations, visualAnchorsForStation]);
```

- [ ] **Step 6: Replace the station hit-target rendering block.**

Inside `<g aria-label="Station hit targets">`, replace the existing `stations.map(...)` body with:

```tsx
{stations.map((station) => {
  const selected = selectedStationId === station.id;
  const isLarge = isStationVisuallyLarge(station);
  const visualAnchors = visualAnchorsForStation(station);
  const hasMultipleVisualAnchors = visualAnchors.length > 1;
  const hitRadius = hasMultipleVisualAnchors ? 76 : isLarge ? 96 : 76;
  const highlightRadius = hasMultipleVisualAnchors ? 38 : isLarge ? 48 : 38;
  const showSynchronizedHover =
    hasMultipleVisualAnchors &&
    hoveredStationId === station.id &&
    !selected;

  return (
    <g
      key={station.id}
      onPointerEnter={() => {
        if (hasMultipleVisualAnchors) setHoveredStationId(station.id);
      }}
      onPointerLeave={() => {
        if (hasMultipleVisualAnchors) {
          setHoveredStationId((current) => current === station.id ? null : current);
        }
      }}
      onFocus={() => {
        if (hasMultipleVisualAnchors) setHoveredStationId(station.id);
      }}
      onBlur={() => {
        if (hasMultipleVisualAnchors) {
          setHoveredStationId((current) => current === station.id ? null : current);
        }
      }}
    >
      {visualAnchors.map(({ id: anchorId, point }, anchorIndex) => (
        <g key={`${station.id}:${anchorId}`}>
          {showSynchronizedHover && (
            <circle
              data-station-hover-id={station.id}
              data-station-anchor-id={anchorId}
              className="station-hover-indicator"
              cx={point.x}
              cy={point.y}
              r={highlightRadius}
              pointerEvents="none"
            />
          )}
          {flashStationId === station.id && (
            <circle
              data-map-highlight-id={station.id}
              data-station-anchor-id={anchorId}
              className="station-selection-flash"
              cx={point.x}
              cy={point.y}
              r={highlightRadius}
              pointerEvents="none"
            />
          )}
          {commuteFlashStationIds.includes(station.id) && (
            <circle
              data-map-highlight-id={station.id}
              data-station-anchor-id={anchorId}
              className="station-commute-green-flash"
              cx={point.x}
              cy={point.y}
              r={highlightRadius}
              pointerEvents="none"
            />
          )}
          {selected && (
            <circle
              data-station-selected-id={station.id}
              data-station-anchor-id={anchorId}
              className="station-selected-indicator"
              cx={point.x}
              cy={point.y}
              r={highlightRadius}
              pointerEvents="none"
            />
          )}
          <circle
            aria-hidden={anchorIndex === 0 ? undefined : true}
            aria-label={anchorIndex === 0 ? `${station.name} station details` : undefined}
            data-station-id={station.id}
            data-station-anchor-id={anchorId}
            data-station-primary-target={anchorIndex === 0 ? "true" : "false"}
            className={`station-hit-target ${
              hasMultipleVisualAnchors ? "multi-anchor" : ""
            } ${selected ? "selected" : ""} ${
              station.hasActiveImpact ? "has-impact" : ""
            } access-${station.accessStatus}`}
            cx={point.x}
            cy={point.y}
            r={hitRadius}
            onClick={(event) => {
              event.stopPropagation();
              onSelectStationId(selected ? null : station.id);
            }}
            onKeyDown={(event) => {
              if (anchorIndex !== 0) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectStationId(selected ? null : station.id);
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            role="button"
            tabIndex={anchorIndex === 0 ? 0 : -1}
          />
        </g>
      ))}
    </g>
  );
})}
```

Important details:

- Both circles dispatch `station.id`, so both open `spadina`.
- Only the first circle has an accessible name and `tabIndex={0}`.
- The second circle remains pointer-clickable but is `aria-hidden` and not tabbable.
- Spadina uses `highlightRadius = 38`, matching each standard-size dot instead of using the interchange radius.
- Ordinary and large stations still resolve to one anchor and retain their existing radii.

- [ ] **Step 7: Leave station impact rings unchanged.**

Confirm the station impact-ring block still uses:

```ts
const point = stationPointFor(station);
```

Do not convert station-level alert rings or direction badges to multiple Spadina anchors. The approved design keeps them at the logical station center.

- [ ] **Step 8: Run the source and helper tests.**

Run:

```bash
node --test frontend/tests/station-map-visuals.test.mjs frontend/tests/map-layering.test.mjs
```

Expected: The helper tests pass. The map-layering test still fails only for missing `.station-hover-indicator` CSS until Task 4.

---

### Task 4: Style the Synchronized Hover Without an Oversized Capsule

**Files:**
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/tests/map-layering.test.mjs`

- [ ] **Step 1: Include the hover indicator in SVG precision styling.**

Find:

```css
.station-hit-target,
.station-selected-indicator,
.station-impact-ring {
  shape-rendering: geometricPrecision;
}
```

Change it to:

```css
.station-hit-target,
.station-hover-indicator,
.station-selected-indicator,
.station-impact-ring {
  shape-rendering: geometricPrecision;
}
```

- [ ] **Step 2: Add synchronized hover styling after the existing station hit-target hover rule.**

Add:

```css
.station-hover-indicator {
  fill: rgba(59, 130, 246, 0.15);
  pointer-events: none;
  stroke: rgba(59, 130, 246, 0.6);
  stroke-width: 10;
}

.station-hit-target.multi-anchor:hover,
.station-hit-target.multi-anchor:focus-visible {
  fill: transparent;
  stroke: transparent;
}
```

The override must appear after:

```css
.station-hit-target:hover,
.station-hit-target:focus-visible
```

This prevents each large transparent hit target from drawing its own oversized hover circle. The two `station-hover-indicator` circles provide the visible feedback instead.

- [ ] **Step 3: Run the focused tests.**

Run:

```bash
node --test frontend/tests/station-map-visuals.test.mjs frontend/tests/map-layering.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Run typecheck and lint.**

Run:

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS. If lint flags the pointer-clickable secondary SVG circle, retain `role="button"` but keep `aria-hidden={true}` and `tabIndex={-1}`; do not create a second accessible tab stop.

- [ ] **Step 5: Commit the component and styles.**

```bash
git add frontend/src/components/InteractiveTtcMap.tsx frontend/src/app/globals.css frontend/tests/map-layering.test.mjs
git commit -m "feat: synchronize Spadina map highlights"
```

---

### Task 5: Add Browser Coverage for Both Spadina Dots

**Files:**
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Add a Playwright test using fixture fallback mode.**

Add near the other station interaction tests:

```ts
test("Spadina uses two visual dots for one station selection", async ({ page, request }) => {
  await setStubMode(request, "unavailable");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();

  const spadinaTargets = page.locator('[data-station-id="spadina"]');
  const line1Target = page.locator(
    '[data-station-id="spadina"][data-station-anchor-id="spadina-1"]',
  );
  const line2Target = page.locator(
    '[data-station-id="spadina"][data-station-anchor-id="spadina-2"]',
  );

  await expect(spadinaTargets).toHaveCount(2);
  await expect(line1Target).toHaveCount(1);
  await expect(line2Target).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Spadina station details" }),
  ).toHaveCount(1);

  await line1Target.dispatchEvent("pointerover");
  await expect(page.locator('[data-station-hover-id="spadina"]')).toHaveCount(2);

  await line2Target.dispatchEvent("click");
  await expect(page.locator('[data-station-selected-id="spadina"]')).toHaveCount(2);
  await expect(
    page.getByRole("complementary", { name: "Spadina station details" }),
  ).toBeVisible();
});
```

This test runs in both configured Playwright projects. `dispatchEvent` avoids ambiguity from the intentionally overlapping touch-friendly hit areas while still exercising each SVG target's handler.

- [ ] **Step 2: Run the focused smoke test.**

Run:

```bash
npm --prefix frontend run test:smoke -- --grep "Spadina uses two visual dots"
```

Expected: PASS for desktop Chrome and mobile Chromium.

- [ ] **Step 3: Commit the smoke test.**

```bash
git add frontend/tests/smoke/dashboard.spec.ts
git commit -m "test: cover Spadina dual-dot selection"
```

---

### Task 6: Full Frontend Verification

**Files:**
- Verify all files changed above.

- [ ] **Step 1: Run all fixture and source tests.**

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript checks.**

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint.**

```bash
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 4: Run the production build.**

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 5: Run the full smoke suite.**

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS.

- [ ] **Step 6: Review the final diff for scope.**

Run:

```bash
git diff --check
git status --short
git diff -- frontend/src/components/station-map-visuals.ts frontend/src/components/InteractiveTtcMap.tsx frontend/src/app/globals.css frontend/tests/station-map-visuals.test.mjs frontend/tests/map-layering.test.mjs frontend/tests/smoke/dashboard.spec.ts
```

Confirm:

- No backend files changed.
- No station fixture metadata changed.
- No `interchange` booleans changed.
- No SVG asset changed.
- Spadina still dispatches only `station.id === "spadina"`.
- The secondary target is not a second tab stop.
- Ordinary station and terminal sizing logic remains intact.

- [ ] **Step 7: Make a final commit only if earlier task commits were skipped.**

```bash
git add frontend/src/components/station-map-visuals.ts frontend/src/components/InteractiveTtcMap.tsx frontend/src/app/globals.css frontend/tests/station-map-visuals.test.mjs frontend/tests/map-layering.test.mjs frontend/tests/smoke/dashboard.spec.ts
git commit -m "feat: align Spadina dual-dot selection"
```

Do not stage unrelated files.

## Completion Summary Required From Implementer

Report:

- The exact files changed.
- That Spadina remains one logical station ID.
- That both SVG dots are pointer-selectable and synchronized.
- That only one accessible tab stop exists.
- Every verification command run and whether it passed.
- Any command that could not run, including the exact failure.

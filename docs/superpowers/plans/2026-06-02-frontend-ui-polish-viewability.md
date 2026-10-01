# Frontend UI Polish And Viewability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the LineWatchTO dashboard header, poll copy, Reduced Speed Zone iconography, submenu-card hierarchy, map-highlight behavior, and TTC Live Alerts metadata display without overclaiming live data.

**Architecture:** Keep the existing map-first Next.js shell and backend dashboard API boundaries. Split "open a submenu" from "select/highlight a specific map item", add a small shared frontend card-field layer for repeated alert/closure/zone card presentation, and extend the backend alert DTOs only for TTC fields that already exist in the Live Alerts payload or normalized alert table. Preserve fixture fallback and stale-ingestion suppression.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind utility classes, plain CSS in `frontend/src/app/globals.css`, lucide-react, Java 21, Spring Boot, Flyway, PostgreSQL, JUnit 5, Node built-in test runner, Playwright.

---

## Gemini 3.1 Pro Handoff Prompt

Use this exact prompt if starting a fresh Gemini session:

```text
You are working in . on LineWatchTO, an unofficial TTC reliability dashboard. Read AGENTS.md, GEMINI.md, README.md, and docs/superpowers/plans/2026-06-02-frontend-ui-polish-viewability.md before editing. Implement the plan task-by-task. Preserve user changes, do not touch unrelated files, do not claim the dashboard is live unless fresh ingestion is active, and run the verification commands listed at the end before saying work is complete.
```

## Current Code Surfaces

- `frontend/src/components/LineWatchShell.tsx`
  - Owns `activeView`, `selectedAlertId`, `selectedClosureId`, station state, floating menu, top header capsule, and bottom-right legend callbacks.
  - Current top-center capsule displays `Last poll: {generatedAt.lastPoll}`.
  - Current menu health heading displays `Ingestion Health (Poll: {generatedAt.lastPoll})`.
  - Current legend handlers set selected IDs, which causes card highlighting and map selection.

- `frontend/src/components/InteractiveTtcMap.tsx`
  - Owns top-right theme toggle.
  - Renders existing orange delay / Reduced Speed Zone overlays and blue planned-preview overlays.
  - Uses `selectedAlertId` and `selectedClosureId` for map selection state.

- `frontend/src/components/LineLegend.tsx`
  - Uses `AlertTriangle` for both active alerts and Reduced Speed Zones.
  - Uses `.find(...)` per line and passes one item ID to the shell, which is why legend clicks focus one card.

- `frontend/src/components/ActiveAlertsPanel.tsx`
  - Card button currently says `Preview on Map` / `Hide Map Preview`.
  - Card highlighting is driven by `selectedAlertId`.

- `frontend/src/components/ReducedSpeedZonesPanel.tsx`
  - Header badge currently says `{count} Degraded`.
  - Card button currently says `Preview Reduced Speed Zone` / `Hide Map Preview`.
  - Card path and direction hierarchy is weak: title, direction, location, description, tiny footer.

- `frontend/src/components/PlannedClosuresPanel.tsx`
  - Card button currently says `Preview on Map` / `Hide Map Preview`.
  - Uses `selectedClosureId` for card active state and planned-preview map overlay.

- `frontend/src/app/linewatch-data.ts`
  - Frontend API shape seam. Update this first when adding DTO fields.

- `backend/src/main/java/com/calebhabesh/linewatch/status/StatusController.java`
  - Generates `generatedAt.time`, `generatedAt.date`, `generatedAt.live`, and `generatedAt.lastPoll`.
  - Current `lastPollLabel()` appends `" ago"` after `durationLabel()`, producing `TTC poll succeeded just now ago`.
  - Current `durationLabel()` only returns minutes.

- `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java`
  - Builds active alert, planned closure, and Reduced Speed Zone DTOs.
  - Current DTOs do not expose `reason` or `targetRemoval`.
  - `causeDescription`, `effectDescription`, `activePeriodEnd`, and `sourceUpdatedAt` are available through `AlertEntity`.

- `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertRecord.java`
  - Add the TTC Live Alerts `targetRemoval` field here. The live payload includes `targetRemoval` for Reduced Speed Zone records, with values such as `TBD` or `Mid-June`.

- `backend/src/main/resources/db/migration/`
  - Current latest migration is `V7__adjacent_rapid_transit_topology.sql`. Add `V8__alert_target_removal.sql`; do not edit old migrations.

## Design Decisions

1. **Top-center display becomes the current Toronto time.**
   - Display `8:47 PM`, no seconds, 12-hour format, uppercase AM/PM.
   - Use Toronto time, not the browser locale timezone, because this is a TTC dashboard.
   - Label it `Toronto time`.
   - It should be visible on desktop and mobile unless it causes overlap; use a compact pill on narrow screens.

2. **Last-poll display moves left of the theme toggle.**
   - The theme toggle lives inside `InteractiveTtcMap.tsx`, so pass a concise poll label from `LineWatchShell` into `InteractiveTtcMap`.
   - Render a small chip immediately left of the theme toggle in the top-right control cluster.
   - Copy should be concise:
     - `Last poll: succeeded just now`
     - `Last poll: succeeded 1 min ago`
     - `Last poll: succeeded 2 hr ago`
     - `Last poll: failed`
     - `Last poll: running`
     - `Last poll: not run`

3. **Menu ingestion heading becomes short.**
   - Replace `Ingestion Health (Poll: TTC Poll Succeeded Just Now Ago)` with `Ingestion`.
   - Place the poll chip and data-mode chip on the same row below or beside it:
     - `Poll: succeeded just now`
     - `Live status` or `Demo status`
   - The heading should not wrap at the current 360px menu width.

4. **Use construction-barricade iconography for Reduced Speed Zones.**
   - Prefer lucide-react `Construction` if available in the installed package.
   - If typecheck shows `Construction` is unavailable, use `TrafficCone`.
   - Do not add a new icon dependency.
   - Replace the Reduced Speed Zone `AlertTriangle` icon in:
     - `LineLegend.tsx`
     - `ReducedSpeedZonesPanel.tsx`
     - `LineWatchShell.tsx` menu nav item

5. **Legend icon clicks open submenus only.**
   - A legend click must not set `selectedAlertId` or `selectedClosureId`.
   - A card should become active or flash only when the user clicks a card's `Highlight on Map` button or clicks the matching map overlay.
   - Opening a Reduced Speed Zone or closure submenu from the legend must not glow/flash the first card.

6. **Button language becomes simpler and consistent.**
   - Use `Highlight on Map` for inactive card actions.
   - Use `Clear Highlight` for active card actions.
   - Remove `Preview Reduced Speed Zone`, `Preview on Map`, and `Hide Map Preview`.
   - Do not use `Jump To Map` unless the implementation actually recenters/scrolls the viewport.

7. **Selected overlays get a temporary blue flash.**
   - When a card action selects an active alert, Reduced Speed Zone, or planned closure, render a blue flash over the exact affected path for about 2.5 seconds.
   - For Reduced Speed Zones, the blue flash must sit on top of the existing orange slowdown overlay and match `affectedSegmentIds`.
   - For planned closures, it should flash on `previewSegmentIds`.
   - For active alerts, apply it to `affectedSegmentIds` where applicable.
   - Respect reduced-motion mode by avoiding pulsing/looping animation; a static blue outline for the same duration is acceptable.

8. **Submenu cards get a clearer route-first hierarchy.**
   - Make the station pair/path the visual headline, centered and larger than metadata.
   - Use an arrow glyph between stations, for example `Dupont -> St Clair West`.
   - Keep ASCII in code. Use `->` in JSX text, or render a lucide `ArrowRight` icon between two spans.
   - Put `Northbound`, `Southbound`, `Eastbound`, `Westbound`, or `Both directions` directly under the station pair.
   - Show `Reason` and `Target removal` fields where backend data exists.
   - Keep source and updated age visible but less dominant.
   - Avoid nested decorative cards; use a simple metadata grid inside the card.

9. **Relative time should scale beyond minutes.**
   - `Updated 6607 min ago` should become a useful label:
     - `Updated just now`
     - `Updated 1 min ago`
     - `Updated 42 min ago`
     - `Updated 2 hr ago`
     - `Updated 3 days ago`
   - Apply this to backend `updatedAgo` and `lastPoll` labels.

## Data Contract Changes

Update `frontend/src/app/linewatch-data.ts` and matching backend DTO records:

```ts
export type AlertMetadata = {
  reason?: string;
  targetRemoval?: string;
};

export type ActiveAlert = {
  id: string;
  lineId: string;
  lineNumber: string;
  title: string;
  severity: AlertSeverity;
  location: string;
  description: string;
  updatedAgo: string;
  affectedSegmentIds: string[];
  shuttle: boolean;
  source: string;
  reason?: string;
  targetRemoval?: string;
};

export type ReducedSpeedZone = {
  id: string;
  lineId: string;
  lineNumber: string;
  title: string;
  location: string;
  displayDirection: string;
  description: string;
  updatedAgo: string;
  affectedSegmentIds: string[];
  sourceAlertIds: string[];
  directionalDetails: DirectionalDetail[];
  source: string;
  reason?: string;
  targetRemoval?: string;
};

export type PlannedClosure = {
  id: string;
  lineId: string;
  lineNumber: string;
  title: string;
  window: string;
  location: string;
  description: string;
  previewSegmentIds: string[];
  shuttle: boolean;
  source: string;
  updatedAgo?: string;
  reason?: string;
  targetRemoval?: string;
};
```

Backend DTO record updates should mirror these optional fields. Because JSON omits no fields by default, returning `null` is acceptable, but the frontend should only render rows with non-empty values.

## Task 1: Backend Poll And Updated-Age Copy

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/status/StatusController.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/status/StatusControllerTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertDashboardServiceTest.java`

- [ ] Add tests in `StatusControllerTest` for concise poll copy:

```java
assertThat(response.generatedAt().lastPoll()).isEqualTo("succeeded 1 min ago");
```

Add separate tests for:

```java
"succeeded just now"
"succeeded 2 hr ago"
"succeeded 3 days ago"
"failed"
"running"
"not run"
```

- [ ] Replace `lastPollLabel()` with status-only copy:

```java
private String lastPollLabel(IngestionRunSnapshot run) {
    if ("running".equalsIgnoreCase(run.status())) {
        return "running";
    }
    if ("failed".equalsIgnoreCase(run.status())) {
        return "failed";
    }
    OffsetDateTime completedAt = run.completedAt();
    if (completedAt == null) {
        return "status unknown";
    }
    return "succeeded " + relativeAge(completedAt);
}
```

- [ ] Change the empty latest-run case:

```java
latestRun.map(this::lastPollLabel).orElse("not run")
```

- [ ] Add a shared backend-style relative age helper in both touched classes or extract a tiny package-private utility if duplication becomes annoying:

```java
private String relativeAge(OffsetDateTime timestamp) {
    long minutes = Math.max(0, Duration.between(timestamp, OffsetDateTime.now(clock)).toMinutes());
    if (minutes == 0) {
        return "just now";
    }
    if (minutes == 1) {
        return "1 min ago";
    }
    if (minutes < 60) {
        return minutes + " min ago";
    }
    long hours = minutes / 60;
    if (hours == 1) {
        return "1 hr ago";
    }
    if (hours < 24) {
        return hours + " hr ago";
    }
    long days = hours / 24;
    return days == 1 ? "1 day ago" : days + " days ago";
}
```

- [ ] Update `updatedAgo(...)` in `StatusController` and `AlertDashboardService` to return `"Updated " + relativeAge(updatedAt)`.

- [ ] Run:

```bash
mvn -f backend/pom.xml -Dtest=StatusControllerTest,AlertDashboardServiceTest test
```

Expected: PASS.

## Task 2: Ingest And Expose Target Removal / Reason Metadata

**Files:**
- Create: `backend/src/main/resources/db/migration/V8__alert_target_removal.sql`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertRecord.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/NormalizedRouteAlert.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizer.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertStore.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertEntity.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertNormalizerTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertStoreTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertDashboardServiceTest.java`
- Modify constructor call sites in backend tests that instantiate `TtcAlertRecord` or `NormalizedRouteAlert`.

- [ ] Add migration:

```sql
alter table alerts
    add column target_removal varchar(120);
```

- [ ] Add `String targetRemoval` to `TtcAlertRecord`. Place it near existing TTC payload detail fields and update all test constructors.

- [ ] Add `String targetRemoval` to `NormalizedRouteAlert` and pass `record.targetRemoval()` from `TtcAlertNormalizer`.

- [ ] Persist `target_removal` in `TtcAlertStore` insert/update SQL:

```sql
target_removal = excluded.target_removal
```

- [ ] Add `@Column(name = "target_removal") private String targetRemoval;` and `getTargetRemoval()` to `AlertEntity`.

- [ ] In `AlertDashboardService`, expose:

```java
private String reason(AlertEntity alert) {
    if (!isBlank(alert.getCauseDescription())) {
        return cleanMetadataValue(alert.getCauseDescription());
    }
    if (!isBlank(alert.getEffectDescription())) {
        return cleanMetadataValue(alert.getEffectDescription());
    }
    return null;
}

private String targetRemoval(AlertEntity alert) {
    if (!isBlank(alert.getTargetRemoval())) {
        return cleanMetadataValue(alert.getTargetRemoval());
    }
    return null;
}

private String cleanMetadataValue(String value) {
    if (value == null) {
        return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
}
```

Keep this conservative: do not invent a target removal from stale text. For planned closures, `window` already covers service timing; `targetRemoval` can stay null unless the source field is present.

- [ ] For grouped Reduced Speed Zones, choose metadata from source alerts:
  - `reason`: first distinct non-empty `causeDescription`, preferring values that are not generic if a more specific one exists.
  - `targetRemoval`: if all non-empty source values match, use that value. If there are multiple values, use `Multiple dates`.
  - If all values are blank, return null.

- [ ] Update DTO records:

```java
public record ActiveAlertDto(..., String source, String reason, String targetRemoval) {}
public record PlannedClosureDto(..., String source, String updatedAgo, String reason, String targetRemoval) {}
public record ReducedSpeedZoneDto(..., String source, String reason, String targetRemoval) {}
```

- [ ] Update tests to assert a Reduced Speed Zone with `causeDescription = "Track issue"` and `targetRemoval = "Mid-June"` returns those values.

- [ ] Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

## Task 3: Frontend Clock And Poll Chip

**Files:**
- Create: `frontend/src/hooks/useTorontoClock.ts`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/tests/drawer-layout.test.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] Create `useTorontoClock.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

const formatter = new Intl.DateTimeFormat("en-CA", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "America/Toronto",
});

export function formatTorontoClock(date: Date): string {
  return formatter.format(date).replace(/\s/g, " ").toUpperCase();
}

export function useTorontoClock(initialTime: string): string {
  const [time, setTime] = useState(initialTime);

  useEffect(() => {
    const update = () => setTime(formatTorontoClock(new Date()));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return time;
}
```

- [ ] In `LineWatchShell.tsx`, import the hook and replace the top-center `Last poll` capsule content with:
  - logo
  - `Toronto time`
  - current time from `useTorontoClock(generatedAt.time)`
  - data-mode chip can stay there or move to the poll cluster, but avoid duplication.

- [ ] Pass `generatedAt.lastPoll` to `InteractiveTtcMap`:

```tsx
<InteractiveTtcMap
  ...
  lastPoll={generatedAt.lastPoll}
  dataModeLabel={dataModeLabel}
/>
```

- [ ] In `InteractiveTtcMap.tsx`, add props:

```ts
lastPoll: string;
dataModeLabel: string;
```

- [ ] Replace the single top-right theme button with a cluster:

```tsx
<div className="absolute top-4 sm:top-6 right-4 sm:right-6 z-20 flex items-center gap-2 pointer-events-auto">
  <div className="panel hidden min-h-10 max-w-[min(52vw,240px)] items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs font-bold shadow-lg dark:border-white/10 sm:flex">
    <span className="text-slate-500 dark:text-slate-400">Last poll:</span>
    <span className="truncate text-slate-800 dark:text-white">{lastPoll}</span>
  </div>
  <button ... aria-label="Toggle theme">...</button>
</div>
```

For mobile, either show a shorter chip under the theme toggle or make the chip visible with `max-w-[44vw]`; verify it does not overlap map controls.

- [ ] In the menu health block, change the title row to `Ingestion` and render `Poll: {generatedAt.lastPoll}` as a chip.

- [ ] Update tests:
  - No exact string `Ingestion Health (Poll:` remains.
  - `Toronto time` appears in shell source or smoke screen.
  - Smoke tests expect `Ingestion` and `Poll: Stub API poll` or updated stub copy, not the old heading.

- [ ] Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS.

## Task 4: Reduced Speed Zone Copy And Icon

**Files:**
- Modify: `frontend/src/components/ReducedSpeedZonesPanel.tsx`
- Modify: `frontend/src/components/LineLegend.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/tests/drawer-layout.test.mjs`

- [ ] Import the barricade-style icon:

```ts
import { Construction } from "lucide-react";
```

If `npm --prefix frontend run typecheck` fails because `Construction` does not exist in this lucide version, switch to:

```ts
import { TrafficCone } from "lucide-react";
```

- [ ] Replace Reduced Speed Zone `AlertTriangle` uses with the chosen icon.

- [ ] Change the panel header count from:

```tsx
{reducedSpeedZones.length} Degraded
```

to:

```tsx
{reducedSpeedZones.length} {reducedSpeedZones.length === 1 ? "Zone" : "Zones"}
```

- [ ] Update tests to assert:
  - `Degraded` is not present in `ReducedSpeedZonesPanel.tsx`.
  - The chosen icon name is present in `LineLegend.tsx` and `ReducedSpeedZonesPanel.tsx`.

- [ ] Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS.

## Task 5: Split Submenu Open State From Map Highlight State

**Files:**
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/components/LineLegend.tsx`
- Modify: `frontend/src/components/ActiveAlertsPanel.tsx`
- Modify: `frontend/src/components/ReducedSpeedZonesPanel.tsx`
- Modify: `frontend/src/components/PlannedClosuresPanel.tsx`
- Modify: `frontend/tests/drawer-layout.test.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] Change `LineLegend` callback signatures to line/view intent instead of item selection:

```ts
onAlertClick?: (lineId: string) => void;
onClosureClick?: (lineId: string) => void;
onReducedSpeedZoneClick?: (lineId: string) => void;
```

- [ ] In `LineLegend`, keep `.find(...)` only to decide whether an icon should appear, but pass `line.id`, not an alert/closure/zone id:

```tsx
onClick={(e) => {
  e.stopPropagation();
  onReducedSpeedZoneClick?.(line.id);
}}
```

- [ ] In `LineWatchShell`, legend handlers should only open views and clear selected IDs:

```tsx
onAlertClick={() => {
  setActiveView("alerts");
  setSelectedAlertId(null);
  setSelectedClosureId(null);
}}
onReducedSpeedZoneClick={() => {
  setActiveView("reduced-speed-zones");
  setSelectedAlertId(null);
  setSelectedClosureId(null);
}}
onClosureClick={() => {
  setActiveView("closures");
  setSelectedAlertId(null);
  setSelectedClosureId(null);
}}
```

- [ ] Keep card buttons and map overlay clicks as the only paths that set `selectedAlertId` or `selectedClosureId`.

- [ ] Remove or simplify `internalClickRef`/`flashId` behavior from panels if it only exists to suppress legend-driven flashes. After legend clicks stop setting selected IDs, card active state can be based directly on selected ID.

- [ ] Tests:
  - Add a source test that `LineLegend` calls `onReducedSpeedZoneClick?.(line.id)` and does not call it with `rsz.id`.
  - Add a Playwright smoke check:

```ts
await page.getByTitle(/View reduced speed zones/i).click();
await expect(page.getByRole("heading", { name: "Reduced Speed Zones" })).toBeVisible();
await expect(page.locator(".highlight-active-card")).toHaveCount(0);
await expect(page.locator(".alert-card").first()).not.toHaveClass(/!bg-amber-950|highlight-active-card/);
```

Adjust class assertion to the actual final class names.

- [ ] Run frontend checks.

## Task 6: Rename Card Actions

**Files:**
- Modify: `frontend/src/components/ActiveAlertsPanel.tsx`
- Modify: `frontend/src/components/ReducedSpeedZonesPanel.tsx`
- Modify: `frontend/src/components/PlannedClosuresPanel.tsx`
- Modify: `frontend/tests/drawer-layout.test.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] Replace inactive action labels with:

```tsx
Highlight on Map
```

- [ ] Replace active action labels with:

```tsx
Clear Highlight
```

- [ ] Keep `Eye` / `EyeOff` icons if desired, or switch to `MapPinned` / `X` if lucide supports them. Do not add dependencies.

- [ ] Tests:
  - Assert old strings do not exist:

```js
assert.doesNotMatch(activeAlertsSource, /Preview on Map|Hide Map Preview/);
assert.doesNotMatch(reducedSpeedZonesSource, /Preview Reduced Speed Zone|Hide Map Preview/);
assert.doesNotMatch(plannedClosuresSource, /Preview on Map|Hide Map Preview/);
```

  - Assert `Highlight on Map` and `Clear Highlight` exist in all three panel files.

- [ ] Run frontend checks.

## Task 7: Exact Map Overlay Flash

**Files:**
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/map-layering.test.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] Add local flash state in `InteractiveTtcMap`:

```ts
const [flashSelection, setFlashSelection] = useState<{ type: "alert" | "closure"; id: string } | null>(null);

useEffect(() => {
  if (selectedAlertId) {
    setFlashSelection({ type: "alert", id: selectedAlertId });
    const timer = window.setTimeout(() => setFlashSelection(null), 2500);
    return () => window.clearTimeout(timer);
  }
  if (selectedClosureId) {
    setFlashSelection({ type: "closure", id: selectedClosureId });
    const timer = window.setTimeout(() => setFlashSelection(null), 2500);
    return () => window.clearTimeout(timer);
  }
  setFlashSelection(null);
}, [selectedAlertId, selectedClosureId]);
```

- [ ] Pass `flashSelection` into `OverlaySegment`.

- [ ] In `OverlaySegment`, compute:

```ts
const isFlashingAlert =
  flashSelection?.type === "alert" &&
  selectedAlert?.id === flashSelection.id &&
  selectedAlert.affectedSegmentIds.includes(segment.id);

const isFlashingClosure =
  flashSelection?.type === "closure" &&
  selectedClosure?.id === flashSelection.id &&
  selectedClosure.previewSegmentIds.includes(segment.id);

const isMapFlash = isFlashingAlert || isFlashingClosure;
```

- [ ] Render an extra path after the candy/preview path so it appears on top:

```tsx
{isMapFlash && (
  <path
    data-map-highlight-id={flashSelection.id}
    className="asset-alert-path map-selection-flash pointer-events-none"
    d={segment.pathD}
  />
)}
```

- [ ] Add CSS:

```css
@keyframes map-selection-flash {
  0% {
    opacity: 0;
    stroke-width: 100;
  }
  18% {
    opacity: 1;
    stroke-width: 132;
  }
  100% {
    opacity: 0;
    stroke-width: 118;
  }
}

.asset-alert-path.map-selection-flash {
  fill: none;
  stroke: #38bdf8;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-opacity: 0.95;
  stroke-width: 118;
  filter: drop-shadow(0 0 16px rgba(56, 189, 248, 0.9));
  animation: map-selection-flash 2.5s ease-out forwards;
}

.motion-paused .asset-alert-path.map-selection-flash {
  animation: none;
  opacity: 0.95;
}
```

- [ ] Tests:
  - Source test asserts `data-map-highlight-id`, `map-selection-flash`, and `setTimeout(...2500...)`.
  - Playwright smoke clicks a Reduced Speed Zone `Highlight on Map` button and expects:

```ts
await expect(page.locator('[data-map-highlight-id="reduced-speed-zone-stub-zone-south-source"]')).toBeVisible();
```

Use exact stub ID from `frontend/tests/smoke/api-stub-data.mjs`.

- [ ] Run frontend checks.

## Task 8: Shared Card Presentation Helpers

**Files:**
- Create: `frontend/src/components/ImpactCardFields.tsx`
- Modify: `frontend/src/components/ActiveAlertsPanel.tsx`
- Modify: `frontend/src/components/ReducedSpeedZonesPanel.tsx`
- Modify: `frontend/src/components/PlannedClosuresPanel.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/drawer-layout.test.mjs`
- Modify: `frontend/tests/smoke/api-stub-data.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] Create `ImpactCardFields.tsx`:

```tsx
import { ArrowRight, ArrowLeftRight } from "lucide-react";

export function lineColor(lineId: string) {
  switch (lineId) {
    case "line-1":
      return { backgroundColor: "#f4c430", color: "#000000" };
    case "line-2":
      return { backgroundColor: "#14a44d", color: "#ffffff" };
    case "line-4":
      return { backgroundColor: "#b84ed8", color: "#ffffff" };
    case "line-5":
      return { backgroundColor: "#f57c00", color: "#ffffff" };
    case "line-6":
      return { backgroundColor: "#969594", color: "#ffffff" };
    default:
      return { backgroundColor: "#64748b", color: "#ffffff" };
  }
}

export function LineBadge({ lineId, lineNumber }: { lineId: string; lineNumber: string }) {
  return (
    <span className="line-badge small shrink-0" style={lineColor(lineId)}>
      {lineNumber}
    </span>
  );
}

function splitLocation(location: string): { from: string; to: string; twoWay: boolean } | null {
  if (!location) return null;
  if (location.includes(" <-> ")) {
    const [from, to] = location.split(" <-> ", 2);
    return { from, to, twoWay: true };
  }
  if (location.includes(" to ")) {
    const [from, to] = location.split(" to ", 2);
    return { from, to, twoWay: false };
  }
  return null;
}

export function ImpactRouteHeader({
  location,
  direction,
}: {
  location: string;
  direction?: string;
}) {
  const bounds = splitLocation(location);
  return (
    <div className="impact-route">
      {bounds ? (
        <div className="impact-route__bounds">
          <span>{bounds.from}</span>
          {bounds.twoWay ? <ArrowLeftRight size={17} /> : <ArrowRight size={17} />}
          <span>{bounds.to}</span>
        </div>
      ) : (
        <div className="impact-route__bounds">
          <span>{location || "Affected segment unavailable"}</span>
        </div>
      )}
      {direction && <div className="impact-route__direction">{direction}</div>}
    </div>
  );
}

export function MetadataGrid({
  reason,
  targetRemoval,
  source,
  updatedAgo,
}: {
  reason?: string | null;
  targetRemoval?: string | null;
  source?: string | null;
  updatedAgo?: string | null;
}) {
  const rows = [
    reason ? ["Reason", reason] as const : null,
    targetRemoval ? ["Target removal", targetRemoval] as const : null,
    source ? ["Source", source] as const : null,
    updatedAgo ? ["Updated", updatedAgo.replace(/^Updated\s+/i, "")] as const : null,
  ].filter(Boolean);

  if (rows.length === 0) return null;

  return (
    <dl className="impact-metadata-grid">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] Add CSS:

```css
.impact-route {
  align-items: center;
  display: grid;
  gap: 4px;
  justify-items: center;
  margin-top: 10px;
  text-align: center;
}

.impact-route__bounds {
  align-items: center;
  color: var(--text);
  display: flex;
  flex-wrap: wrap;
  font-size: 1rem;
  font-weight: 850;
  gap: 8px;
  justify-content: center;
  line-height: 1.25;
}

.impact-route__direction {
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 800;
}

.impact-metadata-grid {
  border-top: 1px solid var(--border);
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 12px;
  padding-top: 10px;
}

.impact-metadata-grid div {
  min-width: 0;
}

.impact-metadata-grid dt {
  color: var(--quiet);
  font-size: 0.64rem;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.impact-metadata-grid dd {
  color: var(--text);
  font-size: 0.78rem;
  font-weight: 700;
  margin: 2px 0 0;
  overflow-wrap: break-word;
}
```

- [ ] Use `LineBadge`, `ImpactRouteHeader`, and `MetadataGrid` in all three panel card components.

- [ ] Reduced Speed Zone cards:
  - Keep `title` small above or next to line badge.
  - Make `ImpactRouteHeader location={zone.location} direction={zone.displayDirection}` the center focus.
  - Render `zone.description` below the route header only if non-empty.
  - Render directional details only for multi-source / multi-direction groups.
  - Render metadata with `reason`, `targetRemoval`, `source`, and `updatedAgo`.

- [ ] Active alert cards:
  - Use `ImpactRouteHeader location={alert.location}`.
  - Use metadata with `reason`, `targetRemoval`, `source`, and `updatedAgo`.

- [ ] Planned closure cards:
  - Use `ImpactRouteHeader location={closure.location}`.
  - Keep `window` prominent near the title.
  - Use metadata with `reason`, `targetRemoval`, `source`, and `updatedAgo`.

- [ ] Update `frontend/tests/smoke/api-stub-data.mjs` to include:

```js
reason: "Track issue",
targetRemoval: "Mid-June",
updatedAgo: "Updated 2 hr ago"
```

for the reduced-speed stub, and analogous fields for active alert and closure where applicable.

- [ ] Smoke expectations:
  - `Track issue` visible in Reduced Speed Zones panel.
  - `Mid-June` visible in Reduced Speed Zones panel.
  - Path bounds visible as station names; if arrow is an icon, do not assert the arrow text.

- [ ] Run frontend checks.

## Task 9: Frontend Type And API Stub Alignment

**Files:**
- Modify: `frontend/src/app/linewatch-data.ts`
- Modify: `frontend/src/app/page.tsx` if needed for inferred types
- Modify: `frontend/tests/linewatch-data.test.mjs`
- Modify: `frontend/tests/smoke/api-stub-data.mjs`

- [ ] Add optional fields to TypeScript types exactly as listed in "Data Contract Changes".

- [ ] Ensure empty fixture arrays remain empty. Do not invent live fixture Reduced Speed Zones just to show the new card design.

- [ ] Keep fallback `generatedAt.lastPoll` concise:

```ts
lastPoll: "backend offline"
```

or:

```ts
lastPoll: "fixture mode"
```

Use the same casing style as live labels. Avoid `"Backend offline (Fixture mode)"` in compact poll chips if it causes wrapping; the demo/live status chip already communicates mode.

- [ ] Update smoke stubs to use concise poll copy:

```js
lastPoll: "succeeded just now"
```

- [ ] Update tests to assert fallback does not claim live status.

- [ ] Run frontend checks.

## Task 10: Visual Verification And Responsive Cleanup

**Files:**
- Modify frontend CSS/components only as needed based on verification.

- [ ] Start the frontend dev server:

```bash
npm --prefix frontend run dev
```

If port 3000 is busy, Next will choose another port or ask. Use the shown local URL.

- [ ] With backend unavailable, verify fixture fallback:
  - Top-center shows Toronto time in 12-hour format.
  - Top-right poll chip does not overlap the theme toggle, map controls, or mobile menu.
  - Menu ingestion section is one-line heading plus compact chips.
  - No official TTC language is introduced.

- [ ] Run Playwright smoke:

```bash
npm --prefix frontend run test:smoke
```

- [ ] If smoke requires the production build, run:

```bash
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

- [ ] With live backend optional:

```bash
docker compose up -d postgres redis
scripts/dev-backend-live.sh
```

Then visit:

```text
http://localhost:3000
```

Verify only if a fresh successful ingestion run is present:

```bash
curl http://localhost:8080/api/health/ingestion
```

- [ ] Validate live Reduced Speed Zone card:
  - Header badge says `N Zones`.
  - Icon looks like a barricade/construction marker.
  - Station pair is centered and larger.
  - Direction appears under the route.
  - `Reason: Track issue` appears when source provides it.
  - `Target removal: Mid-June` or `TBD` appears when source provides it.
  - `Updated 6607 min ago` never appears; hours/days are used.
  - `Highlight on Map` flashes the exact orange slowdown overlay blue for about 2.5 seconds.

## Required Verification Before Completion

Run from repo root:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Because this is a visual/interaction polish change, also run:

```bash
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

If any command cannot run because of sandboxing, missing services, missing browsers, or port conflicts, report the exact command and exact failure.

## Acceptance Checklist

- [ ] The front page shows current time in 12-hour Toronto format.
- [ ] Last poll appears left of the theme toggle, not in the top-center time capsule.
- [ ] No UI text says `TTC poll succeeded just now ago`.
- [ ] Menu ingestion heading is succinct and does not wrap awkwardly.
- [ ] Reduced Speed Zone submenu badge says `1 Zone` / `N Zones`, not `Degraded`.
- [ ] Reduced Speed Zone icons use a construction/barricade-like icon.
- [ ] Legend alert/zone/closure icons open the correct submenu without selecting or flashing the first card.
- [ ] Card action text says `Highlight on Map` / `Clear Highlight`.
- [ ] Reduced Speed Zone card selection flashes the matching SVG slowdown overlay blue for about 2.5 seconds.
- [ ] Planned closure card selection still highlights the actual planned path.
- [ ] Active alert card selection still highlights the affected alert path where applicable.
- [ ] Cards show a centered route/path header with directional text underneath.
- [ ] Cards show `Reason` and `Target removal` when the backend/source provides them.
- [ ] Relative update labels use minutes, hours, or days appropriately.
- [ ] Fixture fallback still works and does not claim live TTC data.
- [ ] All required frontend and backend checks pass or have documented failures.

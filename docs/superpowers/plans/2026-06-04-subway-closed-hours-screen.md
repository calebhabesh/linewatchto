# Subway Closed Hours Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an overnight "Subway closed" screen for LineWatchTO that hides the service feed during TTC subway non-operating hours while still letting users peek at the current map and station accessibility state.

**Architecture:** Add a pure Toronto-time operating-hours helper, a small client hook, and a dedicated closed-hours overlay component. Keep the existing dashboard and map mounted underneath so the background map can be blurred/tinted and the user can reveal the normal map view on demand.

**Tech Stack:** Next.js App Router, React client components, TypeScript, plain CSS in `frontend/src/app/globals.css`, Node built-in tests, Playwright smoke tests.

---

## Source And Scope Notes

- Use the current project name: **LineWatchTO**. Do not present this as an official TTC product.
- TTC's own service details page says subway first/last train times vary by station, and gives approximate subway hours of 6:00 a.m. to 2:00 a.m. Monday through Saturday and 8:00 a.m. to 2:00 a.m. Sundays. It also notes Blue Night overnight service from about 1:30 a.m. to 5:30 a.m. Source: `https://www.ttc.ca/routes-and-schedules/Service-details-and-holidays-OLD`
- Implement the schedule as a product heuristic for this portfolio app. Do not claim exact station-level first/last trains.
- Do not implement holiday-specific starts in this slice. Add copy saying exact times vary by station.
- Do not change backend APIs. The map still needs data available for "Peek at map."
- Do not hide station accessibility details after the user chooses to peek at the map.
- There are known local modifications in `frontend/src/app/globals.css` and `frontend/src/components/InteractiveTtcMap.tsx` as of plan creation. Preserve all user changes. This plan modifies `globals.css`; append new CSS rather than replacing existing CSS.

## Desired UX

Default closed-hours state:

- The first screen says **Subway closed overnight**.
- It shows:
  - Current closed state.
  - General operating hours.
  - When subway service resumes.
  - Blue Night note.
  - A "Peek at map" button.
- It uses `/assets/linewatch/closed-alert.svg`, with the moon purple and the Z marks golden.
- The subway map remains faintly visible behind the screen, tinted and blurred.
- Active alerts, delays, reduced speed zones, closures, commute cards, analytics, legend, menu, logs, and top controls are not visible or keyboard-focusable until the user peeks.

Peek state:

- The normal map becomes visible and interactive.
- The user can pan/zoom, click reduced speed zones, delays, suspensions, closure previews, station hit targets, and station accessibility/outage details.
- A compact "Subway closed" chip stays visible with the resume time and a "Closed screen" button.
- Returning to the closed screen hides the feed again.

Open-hours state:

- The dashboard behaves exactly as it does now.
- No closed screen or closed chip appears.

## Files

- Create: `frontend/public/assets/linewatch/closed-alert.svg`
- Create: `frontend/src/app/subway-hours.ts`
- Create: `frontend/src/hooks/useSubwayOperatingState.ts`
- Create: `frontend/src/components/SubwayClosedScreen.tsx`
- Create: `frontend/tests/subway-hours.test.mjs`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`
- Modify: `frontend/tests/drawer-layout.test.mjs`
- Modify: `README.md`

---

### Task 1: Add The Closed Alert Asset

**Files:**
- Create: `frontend/public/assets/linewatch/closed-alert.svg`

- [ ] **Step 1: Copy the source SVG into the repo**

Run from repo root:

```bash
cp ${LINEWATCH_ASSET_DIR}/closed-alert.svg frontend/public/assets/linewatch/closed-alert.svg
```

Expected: `frontend/public/assets/linewatch/closed-alert.svg` exists.

- [ ] **Step 2: Recolor the SVG**

Replace the copied file contents with this exact SVG:

```xml
<?xml version="1.0" encoding="utf-8"?>
<svg width="800" height="800" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M13.5 8H16.5L13.5 11H16.5" stroke="#FACC15" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M18 2H22L18 6H22" stroke="#FACC15" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M21.0672 11.8568L20.4253 11.469L21.0672 11.8568ZM12.1432 2.93276L11.7553 2.29085V2.29085L12.1432 2.93276ZM21.25 12C21.25 17.1086 17.1086 21.25 12 21.25V22.75C17.9371 22.75 22.75 17.9371 22.75 12H21.25ZM12 21.25C6.89137 21.25 2.75 17.1086 2.75 12H1.25C1.25 17.9371 6.06294 22.75 12 22.75V21.25ZM2.75 12C2.75 6.89137 6.89137 2.75 12 2.75V1.25C6.06294 1.25 1.25 6.06294 1.25 12H2.75ZM15.5 14.25C12.3244 14.25 9.75 11.6756 9.75 8.5H8.25C8.25 12.5041 11.4959 15.75 15.5 15.75V14.25ZM20.4253 11.469C19.4172 13.1373 17.5882 14.25 15.5 14.25V15.75C18.1349 15.75 20.4407 14.3439 21.7092 12.2447L20.4253 11.469ZM9.75 8.5C9.75 6.41182 10.8627 4.5828 12.531 3.57467L11.7553 2.29085C9.65609 3.5593 8.25 5.86509 8.25 8.5H9.75ZM12 2.75C11.9115 2.75 11.8077 2.71008 11.7324 2.63168C11.6686 2.56527 11.6538 2.50244 11.6503 2.47703C11.6461 2.44587 11.6482 2.35557 11.7553 2.29085L12.531 3.57467C13.0342 3.27065 13.196 2.71398 13.1368 2.27627C13.0754 1.82126 12.7166 1.25 12 1.25V2.75ZM21.7092 12.2447C21.6444 12.3518 21.5541 12.3539 21.523 12.3497C21.4976 12.3462 21.4347 12.3314 21.3683 12.2676C21.2899 12.1923 21.25 12.0885 21.25 12H22.75C22.75 11.2834 22.1787 10.9246 21.7237 10.8632C21.286 10.804 20.7293 10.9658 20.4253 11.469L21.7092 12.2447Z" fill="#8B5CF6"/>
</svg>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/public/assets/linewatch/closed-alert.svg
git commit -m "feat: add closed subway alert asset"
```

---

### Task 2: Add Toronto Subway Hours Logic

**Files:**
- Create: `frontend/tests/subway-hours.test.mjs`
- Create: `frontend/src/app/subway-hours.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/subway-hours.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatResumeDuration,
  formatSubwayClock,
  getSubwayOperatingState,
  isSubwayClosed,
} from "../src/app/subway-hours.ts";

describe("subway operating hours", () => {
  it("closes after 2 a.m. on weekdays until the 6 a.m. start", () => {
    const state = getSubwayOperatingState(new Date("2026-06-04T03:15:00-04:00"));

    assert.equal(state.status, "closed");
    assert.equal(state.title, "Subway closed overnight");
    assert.equal(state.nextResumeLabel, "today at 6:00 a.m.");
    assert.equal(state.nextResumeTime, "6:00 a.m.");
    assert.equal(state.minutesUntilResume, 165);
    assert.equal(isSubwayClosed(new Date("2026-06-04T03:15:00-04:00")), true);
  });

  it("keeps service open before 2 a.m. because the previous service day is still ending", () => {
    const state = getSubwayOperatingState(new Date("2026-06-04T01:45:00-04:00"));

    assert.equal(state.status, "open");
    assert.equal(state.nextResumeLabel, null);
    assert.equal(state.minutesUntilResume, null);
  });

  it("uses the later Sunday start", () => {
    const closedState = getSubwayOperatingState(new Date("2026-06-07T07:30:00-04:00"));
    const openState = getSubwayOperatingState(new Date("2026-06-07T08:05:00-04:00"));

    assert.equal(closedState.status, "closed");
    assert.equal(closedState.nextResumeLabel, "today at 8:00 a.m.");
    assert.equal(closedState.minutesUntilResume, 30);
    assert.equal(openState.status, "open");
  });

  it("shows Monday early morning as open before 2 a.m. and closed after 2 a.m.", () => {
    assert.equal(getSubwayOperatingState(new Date("2026-06-08T01:10:00-04:00")).status, "open");
    assert.equal(getSubwayOperatingState(new Date("2026-06-08T05:55:00-04:00")).status, "closed");
    assert.equal(getSubwayOperatingState(new Date("2026-06-08T05:55:00-04:00")).nextResumeLabel, "today at 6:00 a.m.");
  });

  it("exposes exact copy used by the closed screen", () => {
    const state = getSubwayOperatingState(new Date("2026-06-04T03:15:00-04:00"));

    assert.equal(formatSubwayClock(360), "6:00 a.m.");
    assert.equal(formatSubwayClock(120), "2:00 a.m.");
    assert.equal(formatResumeDuration(165), "2 hr 45 min");
    assert.equal(state.operatingHours.weekdaySaturday, "Mon-Sat: about 6:00 a.m. to 2:00 a.m.");
    assert.equal(state.operatingHours.sunday, "Sun: about 8:00 a.m. to 2:00 a.m.");
    assert.match(state.operatingHours.caveat, /Exact first and last train times vary by station/);
    assert.match(state.operatingHours.overnight, /Blue Night Network/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm --prefix frontend run test:fixtures -- subway-hours.test.mjs
```

Expected: FAIL because `../src/app/subway-hours.ts` does not exist yet.

- [ ] **Step 3: Implement the helper**

Create `frontend/src/app/subway-hours.ts`:

```ts
export type SubwayOperatingStatus = "open" | "closed";

export type SubwayOperatingState = {
  status: SubwayOperatingStatus;
  title: string;
  summary: string;
  nowLabel: string;
  nextResumeLabel: string | null;
  nextResumeTime: string | null;
  minutesUntilResume: number | null;
  isSundaySchedule: boolean;
  operatingHours: {
    weekdaySaturday: string;
    sunday: string;
    caveat: string;
    overnight: string;
  };
};

const TORONTO_TIME_ZONE = "America/Toronto";
const CLOSE_MINUTES = 2 * 60;
const WEEKDAY_SATURDAY_OPEN_MINUTES = 6 * 60;
const SUNDAY_OPEN_MINUTES = 8 * 60;

const WEEKDAY_INDEX_BY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const TORONTO_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  hourCycle: "h23",
  minute: "2-digit",
  timeZone: TORONTO_TIME_ZONE,
  weekday: "short",
});

export function formatSubwayClock(minutesAfterMidnight: number) {
  const hour24 = Math.floor(minutesAfterMidnight / 60) % 24;
  const minute = minutesAfterMidnight % 60;
  const hour12 = hour24 % 12 || 12;
  const period = hour24 < 12 ? "a.m." : "p.m.";

  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

export function formatResumeDuration(minutes: number) {
  if (minutes <= 0) {
    return "now";
  }

  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainderMinutes} min`;
  }

  if (remainderMinutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainderMinutes} min`;
}

export function getSubwayOperatingState(now = new Date()): SubwayOperatingState {
  const { weekdayIndex, minutesAfterMidnight } = getTorontoLocalTimeParts(now);
  const openingMinutes = openingMinutesForDay(weekdayIndex);
  const closed = minutesAfterMidnight >= CLOSE_MINUTES && minutesAfterMidnight < openingMinutes;
  const nextResumeTime = closed ? formatSubwayClock(openingMinutes) : null;
  const minutesUntilResume = closed ? openingMinutes - minutesAfterMidnight : null;

  return {
    status: closed ? "closed" : "open",
    title: closed ? "Subway closed overnight" : "Subway operating",
    summary: closed
      ? "Regular subway service is outside operating hours. The live feed is hidden until service resumes."
      : "Regular subway service is inside the general operating window.",
    nowLabel: formatSubwayClock(minutesAfterMidnight),
    nextResumeLabel: nextResumeTime ? `today at ${nextResumeTime}` : null,
    nextResumeTime,
    minutesUntilResume,
    isSundaySchedule: weekdayIndex === 0,
    operatingHours: {
      weekdaySaturday: "Mon-Sat: about 6:00 a.m. to 2:00 a.m.",
      sunday: "Sun: about 8:00 a.m. to 2:00 a.m.",
      caveat: "Exact first and last train times vary by station. Check the TTC station page for a specific stop.",
      overnight: "The Blue Night Network covers many major routes overnight until regular subway service begins.",
    },
  };
}

export function isSubwayClosed(now = new Date()) {
  return getSubwayOperatingState(now).status === "closed";
}

function getTorontoLocalTimeParts(date: Date) {
  const parts = TORONTO_PARTS_FORMATTER.formatToParts(date);
  const getPart = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = getPart("weekday");
  const hour = Number(getPart("hour"));
  const minute = Number(getPart("minute"));

  return {
    weekdayIndex: WEEKDAY_INDEX_BY_SHORT[weekday] ?? 0,
    minutesAfterMidnight: hour * 60 + minute,
  };
}

function openingMinutesForDay(weekdayIndex: number) {
  return weekdayIndex === 0 ? SUNDAY_OPEN_MINUTES : WEEKDAY_SATURDAY_OPEN_MINUTES;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm --prefix frontend run test:fixtures -- subway-hours.test.mjs
```

Expected: PASS for `subway-hours.test.mjs`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/subway-hours.ts frontend/tests/subway-hours.test.mjs
git commit -m "feat: add subway operating hours helper"
```

---

### Task 3: Add The Client Hook

**Files:**
- Create: `frontend/src/hooks/useSubwayOperatingState.ts`
- Modify: `frontend/tests/subway-hours.test.mjs`

- [ ] **Step 1: Add a source-level test for the hook**

Append this test block to `frontend/tests/subway-hours.test.mjs`:

```js
import { readFileSync } from "node:fs";

describe("subway operating state hook source", () => {
  it("refreshes the closed-hours state on a timer", () => {
    const hookSource = readFileSync(new URL("../src/hooks/useSubwayOperatingState.ts", import.meta.url), "utf8");

    assert.match(hookSource, /"use client"/);
    assert.match(hookSource, /getSubwayOperatingState/);
    assert.match(hookSource, /window\.setInterval/);
    assert.match(hookSource, /30_000/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm --prefix frontend run test:fixtures -- subway-hours.test.mjs
```

Expected: FAIL because `frontend/src/hooks/useSubwayOperatingState.ts` does not exist yet.

- [ ] **Step 3: Create the hook**

Create `frontend/src/hooks/useSubwayOperatingState.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

import { getSubwayOperatingState, type SubwayOperatingState } from "../app/subway-hours";

const SUBWAY_OPERATING_STATE_REFRESH_MS = 30_000;

export function useSubwayOperatingState(): SubwayOperatingState {
  const [state, setState] = useState(() => getSubwayOperatingState());

  useEffect(() => {
    const refresh = () => setState(getSubwayOperatingState());

    refresh();
    const timer = window.setInterval(refresh, SUBWAY_OPERATING_STATE_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, []);

  return state;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm --prefix frontend run test:fixtures -- subway-hours.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useSubwayOperatingState.ts frontend/tests/subway-hours.test.mjs
git commit -m "feat: refresh subway operating state on client"
```

---

### Task 4: Build The Closed Screen Component

**Files:**
- Create: `frontend/src/components/SubwayClosedScreen.tsx`
- Modify: `frontend/tests/drawer-layout.test.mjs`

- [ ] **Step 1: Write the source-level component test**

Add these constants near the top of `frontend/tests/drawer-layout.test.mjs`:

```js
const subwayClosedSource = readFileSync(new URL("../src/components/SubwayClosedScreen.tsx", import.meta.url), "utf8");
const subwayHoursSource = readFileSync(new URL("../src/app/subway-hours.ts", import.meta.url), "utf8");
```

Add this test inside `describe("floating menu layout", () => { ... })`:

```js
  it("defines a closed-hours screen with schedule, resume copy, and map peek action", () => {
    assert.match(subwayClosedSource, /SubwayClosedScreen/);
    assert.match(subwayClosedSource, /\/assets\/linewatch\/closed-alert\.svg/);
    assert.match(subwayClosedSource, /Subway closed overnight/);
    assert.match(subwayClosedSource, /operatingHours\.weekdaySaturday/);
    assert.match(subwayClosedSource, /operatingHours\.sunday/);
    assert.match(subwayClosedSource, /nextResumeLabel/);
    assert.match(subwayClosedSource, /Peek at map/);
    assert.match(subwayClosedSource, /Blue Night Network/);
    assert.match(subwayHoursSource, /Exact first and last train times vary by station/);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm --prefix frontend run test:fixtures -- drawer-layout.test.mjs
```

Expected: FAIL because `SubwayClosedScreen.tsx` does not exist.

- [ ] **Step 3: Create the component**

Create `frontend/src/components/SubwayClosedScreen.tsx`:

```tsx
"use client";

import Image from "next/image";
import { BusFront, Clock3, Map, Moon } from "lucide-react";

import { formatResumeDuration, type SubwayOperatingState } from "../app/subway-hours";

export function SubwayClosedScreen({
  operatingState,
  onPeekMap,
}: {
  operatingState: SubwayOperatingState;
  onPeekMap: () => void;
}) {
  const resumeLabel = operatingState.nextResumeLabel ?? "soon";
  const resumeDuration = operatingState.minutesUntilResume === null
    ? null
    : formatResumeDuration(operatingState.minutesUntilResume);

  return (
    <section className="subway-closed-screen" aria-labelledby="subway-closed-title">
      <div className="subway-closed-content">
        <div className="subway-closed-icon-shell" aria-hidden="true">
          <Image
            src="/assets/linewatch/closed-alert.svg"
            alt=""
            width={112}
            height={112}
            priority
          />
        </div>

        <div className="subway-closed-copy">
          <p className="subway-closed-kicker">LineWatchTO overnight mode</p>
          <h1 id="subway-closed-title">Subway closed overnight</h1>
          <p>
            Regular subway service is outside operating hours. The feed is hidden for now, but the map
            remains available if you want to check current overlays or station accessibility details.
          </p>
        </div>

        <div className="subway-closed-resume" role="status" aria-live="polite">
          <Clock3 size={22} aria-hidden="true" />
          <span>Service resumes</span>
          <strong>{resumeLabel}</strong>
          {resumeDuration ? <small>in {resumeDuration}</small> : null}
        </div>

        <dl className="subway-closed-hours" aria-label="General TTC subway operating hours">
          <div>
            <dt>Operating hours</dt>
            <dd>{operatingState.operatingHours.weekdaySaturday}</dd>
          </div>
          <div>
            <dt>Sunday start</dt>
            <dd>{operatingState.operatingHours.sunday}</dd>
          </div>
          <div>
            <dt><BusFront size={16} aria-hidden="true" /> Overnight</dt>
            <dd>{operatingState.operatingHours.overnight}</dd>
          </div>
        </dl>

        <p className="subway-closed-caveat">
          {operatingState.operatingHours.caveat}
        </p>

        <div className="subway-closed-actions">
          <button type="button" className="subway-closed-primary-action" onClick={onPeekMap}>
            <Map size={19} aria-hidden="true" />
            Peek at map
          </button>
          <span className="subway-closed-status-note">
            <Moon size={16} aria-hidden="true" />
            Subway lines reopen with regular morning service.
          </span>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm --prefix frontend run test:fixtures -- drawer-layout.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SubwayClosedScreen.tsx frontend/tests/drawer-layout.test.mjs
git commit -m "feat: add closed subway screen component"
```

---

### Task 5: Integrate Closed Mode In The Shell

**Files:**
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/tests/drawer-layout.test.mjs`
- Modify: `frontend/tests/page-data.test.mjs`

- [ ] **Step 1: Add failing source tests**

In `frontend/tests/drawer-layout.test.mjs`, extend the closed-hours test from Task 4 with these assertions:

```js
    assert.match(shellSource, /useSubwayOperatingState/);
    assert.match(shellSource, /showClosedScreen/);
    assert.match(shellSource, /closedMapPeek/);
    assert.match(shellSource, /handlePeekClosedMap/);
    assert.match(shellSource, /SubwayClosedScreen/);
    assert.match(shellSource, /subway-closed-map-backdrop/);
    assert.match(shellSource, /subway-closed-peek-chip/);
    assert.match(shellSource, /Closed screen/);
```

In `frontend/tests/page-data.test.mjs`, add this test inside the existing `describe`:

```js
  it("pauses dashboard refresh while the closed screen covers the feed", () => {
    assert.match(shellSource, /subwayOperatingState\.status === "closed" && !closedMapPeek/);
    assert.match(shellSource, /return;/);
    assert.match(shellSource, /router\.refresh\(\)/);
  });
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm --prefix frontend run test:fixtures -- drawer-layout.test.mjs page-data.test.mjs
```

Expected: FAIL because the shell is not integrated yet.

- [ ] **Step 3: Add imports in `LineWatchShell.tsx`**

Add these imports:

```tsx
import { SubwayClosedScreen } from "./SubwayClosedScreen";
import { useSubwayOperatingState } from "../hooks/useSubwayOperatingState";
```

- [ ] **Step 4: Add state and handlers inside `LineWatchShell`**

Place these lines after the existing `useState` calls for `activeView`:

```tsx
  const subwayOperatingState = useSubwayOperatingState();
  const [closedMapPeek, setClosedMapPeek] = useState(false);
  const showClosedScreen = subwayOperatingState.status === "closed" && !closedMapPeek;
```

Place this effect after the reduced-motion effect:

```tsx
  useEffect(() => {
    if (subwayOperatingState.status === "open") {
      setClosedMapPeek(false);
    }
  }, [subwayOperatingState.status]);
```

Place this handler near `handleToggleMenu`:

```tsx
  const handlePeekClosedMap = () => {
    setClosedMapPeek(true);
    setActiveView("map");
    setSelection(null);
    setSelectedStationId(null);
    router.refresh();
  };
```

- [ ] **Step 5: Pause automatic refresh while closed screen is covering the feed**

Change the dashboard refresh effect from this shape:

```tsx
  useEffect(() => {
    const refreshDashboardData = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      router.refresh();
    };

    const interval = window.setInterval(refreshDashboardData, dashboardRefreshIntervalMs());
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router]);
```

To this:

```tsx
  useEffect(() => {
    if (subwayOperatingState.status === "closed" && !closedMapPeek) {
      return;
    }

    const refreshDashboardData = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      router.refresh();
    };

    const interval = window.setInterval(refreshDashboardData, dashboardRefreshIntervalMs());
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [closedMapPeek, router, subwayOperatingState.status]);
```

- [ ] **Step 6: Hide feed controls while the closed screen is visible**

Keep `<main>` mounted. Wrap the existing header, every floating submenu, the station detail panel, and the legend with `!showClosedScreen`.

The final JSX shape should be:

```tsx
      {!showClosedScreen && (
        <header className="absolute top-0 left-0 w-full p-4 sm:p-6 z-40 flex justify-between items-start pointer-events-none">
          {/* keep the existing header contents exactly as they are */}
        </header>
      )}

      {!showClosedScreen && (
        <>
          {/* keep the existing Floating Submenus blocks exactly as they are */}
        </>
      )}

      <main className={`absolute inset-0 z-10 ${showClosedScreen ? "subway-closed-map-backdrop" : ""}`}>
        <InteractiveTtcMap
          selection={selection}
          selectedStationId={selectedStationId}
          stations={stationSummaries}
          onSelectImpact={handleMapSelectImpact}
          onSelectStationId={(id) => {
            setSelectedStationId(id);
            setSelection(null);
          }}
          isDark={isDark}
          onToggleTheme={() => setIsDark(!isDark)}
          layoutResetSignal={0}
          reducedMotion={reducedMotion}
        />
      </main>

      {!showClosedScreen && selectedStationId && (
        <StationDetailPanel
          stationResult={stationResult}
          loading={stationLoading}
          selectedStationName={stationSummaries.find((station) => station.id === selectedStationId)?.name}
          onClose={() => setSelectedStationId(null)}
        />
      )}

      {showClosedScreen ? (
        <SubwayClosedScreen
          operatingState={subwayOperatingState}
          onPeekMap={handlePeekClosedMap}
        />
      ) : null}

      {subwayOperatingState.status === "closed" && closedMapPeek ? (
        <div className="subway-closed-peek-chip" role="status" aria-live="polite">
          <span>Subway closed. Resumes {subwayOperatingState.nextResumeLabel}.</span>
          <button type="button" onClick={() => setClosedMapPeek(false)}>
            Closed screen
          </button>
        </div>
      ) : null}

      {!showClosedScreen && (
        <aside className="fixed bottom-6 right-6 z-20 pointer-events-auto">
          {/* keep the existing LineLegend block exactly as it is */}
        </aside>
      )}
```

Do not duplicate `InteractiveTtcMap`. Do not remove `DataProvider`.

- [ ] **Step 7: Run tests to verify pass**

```bash
npm --prefix frontend run test:fixtures -- drawer-layout.test.mjs page-data.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/LineWatchShell.tsx frontend/tests/drawer-layout.test.mjs frontend/tests/page-data.test.mjs
git commit -m "feat: gate dashboard feed during subway closed hours"
```

---

### Task 6: Add Closed Screen Styling

**Files:**
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/drawer-layout.test.mjs`

- [ ] **Step 1: Add failing CSS source assertions**

Add these assertions to the closed-hours test in `frontend/tests/drawer-layout.test.mjs`:

```js
    assert.match(globalCss, /\.subway-closed-screen/);
    assert.match(globalCss, /\.subway-closed-map-backdrop/);
    assert.match(globalCss, /filter:\s*blur\(9px\) saturate\(0\.72\) brightness\(0\.42\)/);
    assert.match(globalCss, /\.subway-closed-peek-chip/);
    assert.match(globalCss, /#8B5CF6/);
    assert.match(globalCss, /#FACC15/);
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm --prefix frontend run test:fixtures -- drawer-layout.test.mjs
```

Expected: FAIL because the CSS is not added yet.

- [ ] **Step 3: Append CSS**

Append this to the end of `frontend/src/app/globals.css`. Preserve existing dirty changes above it.

```css
.subway-closed-map-backdrop {
  filter: blur(9px) saturate(0.72) brightness(0.42);
  opacity: 0.62;
  transform: scale(1.025);
  transform-origin: center;
  transition: filter 220ms ease, opacity 220ms ease, transform 220ms ease;
}

.subway-closed-screen {
  align-items: center;
  background: rgba(5, 7, 12, 0.72);
  color: #f8fafc;
  display: grid;
  inset: 0;
  justify-items: center;
  padding: 24px;
  position: fixed;
  z-index: 60;
}

.subway-closed-content {
  background: rgba(8, 10, 16, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.48);
  display: grid;
  gap: 18px;
  max-height: min(760px, calc(100vh - 48px));
  overflow-y: auto;
  padding: 32px;
  width: min(100%, 640px);
}

.subway-closed-icon-shell {
  align-items: center;
  background: rgba(139, 92, 246, 0.12);
  border: 1px solid rgba(250, 204, 21, 0.24);
  border-radius: 8px;
  display: grid;
  height: 132px;
  justify-items: center;
  width: 132px;
}

.subway-closed-icon-shell img {
  filter: drop-shadow(0 0 22px rgba(139, 92, 246, 0.35));
  height: 112px;
  width: 112px;
}

.subway-closed-copy {
  display: grid;
  gap: 10px;
}

.subway-closed-kicker {
  color: #FACC15;
  font-size: 0.78rem;
  font-weight: 850;
  letter-spacing: 0;
  margin: 0;
  text-transform: uppercase;
}

.subway-closed-copy h1 {
  color: #ffffff;
  font-size: 2.65rem;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1;
  margin: 0;
}

.subway-closed-copy p,
.subway-closed-caveat,
.subway-closed-status-note {
  color: rgba(226, 232, 240, 0.82);
  font-size: 0.98rem;
  line-height: 1.5;
  margin: 0;
}

.subway-closed-resume {
  align-items: center;
  background: rgba(250, 204, 21, 0.1);
  border: 1px solid rgba(250, 204, 21, 0.22);
  border-radius: 8px;
  color: #FACC15;
  display: grid;
  gap: 4px 12px;
  grid-template-columns: auto minmax(0, 1fr);
  padding: 14px 16px;
}

.subway-closed-resume svg {
  grid-row: 1 / 4;
}

.subway-closed-resume span,
.subway-closed-resume small {
  color: rgba(254, 240, 138, 0.84);
  font-size: 0.82rem;
  font-weight: 800;
}

.subway-closed-resume strong {
  color: #ffffff;
  font-size: 1.2rem;
  line-height: 1.2;
}

.subway-closed-hours {
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  display: grid;
  gap: 0;
  margin: 0;
}

.subway-closed-hours div {
  align-items: start;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(118px, 0.38fr) minmax(0, 1fr);
  padding: 12px 0;
}

.subway-closed-hours dt {
  align-items: center;
  color: #FACC15;
  display: flex;
  font-size: 0.82rem;
  font-weight: 850;
  gap: 6px;
  letter-spacing: 0;
  margin: 0;
  text-transform: uppercase;
}

.subway-closed-hours dd {
  color: #f8fafc;
  font-size: 0.95rem;
  line-height: 1.4;
  margin: 0;
}

.subway-closed-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: space-between;
}

.subway-closed-primary-action {
  align-items: center;
  background: #FACC15;
  border: 1px solid rgba(250, 204, 21, 0.9);
  border-radius: 8px;
  color: #111827;
  display: inline-flex;
  font-size: 0.95rem;
  font-weight: 900;
  gap: 8px;
  min-height: 44px;
  padding: 0 18px;
}

.subway-closed-primary-action:hover,
.subway-closed-primary-action:focus-visible {
  background: #fde047;
  outline: 3px solid rgba(250, 204, 21, 0.28);
  outline-offset: 3px;
}

.subway-closed-status-note {
  align-items: center;
  display: inline-flex;
  gap: 8px;
}

.subway-closed-status-note svg {
  color: #8B5CF6;
  flex: 0 0 auto;
}

.subway-closed-peek-chip {
  align-items: center;
  background: rgba(8, 10, 16, 0.94);
  border: 1px solid rgba(250, 204, 21, 0.26);
  border-radius: 8px;
  bottom: 18px;
  box-shadow: 0 18px 52px rgba(0, 0, 0, 0.38);
  color: #f8fafc;
  display: flex;
  flex-wrap: wrap;
  font-size: 0.9rem;
  gap: 10px;
  left: 50%;
  max-width: min(560px, calc(100vw - 32px));
  padding: 10px 12px;
  position: fixed;
  transform: translateX(-50%);
  z-index: 50;
}

.subway-closed-peek-chip span {
  min-width: 0;
}

.subway-closed-peek-chip button {
  background: rgba(250, 204, 21, 0.12);
  border: 1px solid rgba(250, 204, 21, 0.28);
  border-radius: 8px;
  color: #FACC15;
  font-size: 0.84rem;
  font-weight: 850;
  min-height: 34px;
  padding: 0 10px;
}

.subway-closed-peek-chip button:hover,
.subway-closed-peek-chip button:focus-visible {
  background: rgba(250, 204, 21, 0.2);
  outline: 3px solid rgba(250, 204, 21, 0.2);
  outline-offset: 2px;
}

.high-contrast .subway-closed-screen {
  background: rgba(0, 0, 0, 0.88);
}

.high-contrast .subway-closed-content,
.high-contrast .subway-closed-peek-chip {
  background: #000000;
  border-color: #ffffff;
}

@media (max-width: 640px) {
  .subway-closed-screen {
    align-items: end;
    padding: 14px;
  }

  .subway-closed-content {
    max-height: calc(100vh - 28px);
    padding: 22px;
  }

  .subway-closed-copy h1 {
    font-size: 2rem;
    line-height: 1.05;
  }

  .subway-closed-icon-shell {
    height: 104px;
    width: 104px;
  }

  .subway-closed-icon-shell img {
    height: 88px;
    width: 88px;
  }

  .subway-closed-hours div {
    grid-template-columns: 1fr;
  }

  .subway-closed-primary-action {
    justify-content: center;
    width: 100%;
  }

  .subway-closed-status-note {
    align-items: flex-start;
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm --prefix frontend run test:fixtures -- drawer-layout.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/globals.css frontend/tests/drawer-layout.test.mjs
git commit -m "style: add subway closed screen visuals"
```

---

### Task 7: Add Smoke Coverage For Closed Screen And Map Peek

**Files:**
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Add helper to freeze browser time**

Add this helper near the other test helpers in `frontend/tests/smoke/dashboard.spec.ts`:

```ts
async function freezeBrowserTime(page: Page, isoTime: string) {
  await page.addInitScript(`
    {
      const fixedTime = new Date("${isoTime}").getTime();
      const RealDate = Date;
      class MockDate extends RealDate {
        constructor(...args) {
          if (args.length === 0) {
            super(fixedTime);
          } else {
            super(...args);
          }
        }
        static now() {
          return fixedTime;
        }
      }
      MockDate.UTC = RealDate.UTC;
      MockDate.parse = RealDate.parse;
      window.Date = MockDate;
    }
  `);
}
```

- [ ] **Step 2: Add the closed-screen smoke test**

Add this test before the existing seeded dashboard test:

```ts
test("shows subway closed screen overnight and lets riders peek at the map", async ({ page, request }) => {
  await setStubMode(request, "seeded");
  await freezeBrowserTime(page, "2026-06-04T03:20:00-04:00");
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Subway closed overnight" })).toBeVisible();
  await expect(page.getByText("Mon-Sat: about 6:00 a.m. to 2:00 a.m.")).toBeVisible();
  await expect(page.getByText("Sun: about 8:00 a.m. to 2:00 a.m.")).toBeVisible();
  await expect(page.getByText(/Service resumes/i)).toBeVisible();
  await expect(page.getByText(/today at 6:00 a\.m\./i)).toBeVisible();
  await expect(page.getByText(/Blue Night Network/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle menu" })).toHaveCount(0);

  await page.getByRole("button", { name: "Peek at map" }).click();

  await expect(page.getByRole("button", { name: "Center map view" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Toggle menu" })).toBeVisible();
  await expect(page.getByText(/Subway closed\. Resumes today at 6:00 a\.m\./i)).toBeVisible();

  await page.getByRole("button", { name: "Stub Station station details" }).click();
  await expect(page.getByRole("complementary", { name: "Stub Station station details" })).toBeVisible();

  await page.getByRole("button", { name: "Closed screen" }).click();
  await expect(page.getByRole("heading", { name: "Subway closed overnight" })).toBeVisible();
});
```

- [ ] **Step 3: Run smoke test**

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS for desktop and mobile Chromium projects.

If Chromium is missing, run:

```bash
npm --prefix frontend run test:smoke:install
npm --prefix frontend run test:smoke
```

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/smoke/dashboard.spec.ts
git commit -m "test: cover subway closed screen map peek"
```

---

### Task 8: Update README Claims

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the implemented feature to Current Status**

In `README.md`, under `Implemented now:`, add this bullet near the other frontend UI bullets:

```markdown
- Overnight subway-closed screen that hides the feed during general non-operating hours while allowing a map peek for current overlays and station accessibility details.
```

- [ ] **Step 2: Add the operating-hours caveat**

In the README data/source limitations area, add this bullet:

```markdown
- Overnight closed-mode uses general TTC subway operating hours; exact first and last trains vary by station, holidays, and service changes.
```

If there is no dedicated limitations list yet, add the bullet near the "Not implemented yet" or data-source discussion without creating a large new docs section.

- [ ] **Step 3: Run fixture tests**

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document subway closed screen"
```

---

### Task 9: Full Verification

**Files:**
- No file changes unless verification reveals a bug.

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

Expected: PASS.

- [ ] **Step 6: Manual visual check**

Run:

```bash
npm --prefix frontend run dev
```

Open `http://localhost:3000`.

Manual check with normal current time:

- If current Toronto time is inside operating hours, the normal dashboard appears.
- No closed screen appears.

Manual closed-mode check:

- Temporarily use browser devtools or the Playwright test to validate closed mode at `2026-06-04T03:20:00-04:00`.
- Confirm the map is faint, tinted, and blurred behind the message.
- Confirm the icon has a purple moon and golden Z marks.
- Confirm "Peek at map" reveals the normal map and station detail clicks.
- Confirm "Closed screen" returns to the overnight screen.

- [ ] **Step 7: Final status**

Report:

- Files changed.
- Verification commands and pass/fail results.
- Any commands that could not run and exact failures.
- Whether smoke tests covered desktop and mobile.

---

## Self-Review

Spec coverage:

- Shows operating hours: Task 2 helper copy and Task 4 component.
- Shows when resuming: Task 2 `nextResumeLabel`, Task 4 resume row, Task 7 smoke assertion.
- Allows map peek: Task 5 shell state, Task 7 smoke test.
- Uses requested icon with purple moon and golden Z marks: Task 1 asset, Task 4 component.
- Background map tinted and blurred while map is not in view: Task 5 shell class and Task 6 CSS.
- Hides feed during closed mode: Task 5 conditional rendering and refresh pause.
- Keeps station accessibility details available after peek: Task 7 station detail smoke assertion.

Placeholder scan:

- No banned placeholder tokens or deferred implementation steps are present.
- Known excluded scope is explicit: holidays, station-specific schedules, backend API changes.

Type consistency:

- `SubwayOperatingState` is defined in `frontend/src/app/subway-hours.ts`.
- `useSubwayOperatingState` returns `SubwayOperatingState`.
- `SubwayClosedScreen` accepts `operatingState: SubwayOperatingState` and `onPeekMap`.
- `LineWatchShell` uses `subwayOperatingState`, `closedMapPeek`, and `showClosedScreen`.

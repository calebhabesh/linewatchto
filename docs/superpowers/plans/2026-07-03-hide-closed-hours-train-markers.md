# Hide Closed-Hours Train Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide estimated subway train markers whenever LineWatchTO considers subway service closed, even if TTC continues publishing fresh GTFS-RT subway Trip Updates overnight.

**Architecture:** Add a backend subway operating-window gate so `/api/trains` is the source of truth and returns no markers during closed hours. Add a frontend gate that stops polling, clears the SVG marker layer immediately, and labels the control as estimated markers rather than exact live train locations.

**Tech Stack:** Java 21, Spring Boot, JUnit 5, AssertJ, Mockito, Next.js 16, React 19, TypeScript, Node test runner.

---

## Context For Gemini

TTC may continue serving fresh subway GTFS-RT Trip Updates after the public subway operating window closes. A sample taken on `2026-07-03 02:20 EDT` returned a fresh feed timestamp and `41` trip updates. These are not GTFS-RT `VehiclePosition` GPS records; the current LineWatchTO markers are schematic estimates derived from `TripUpdate` stop-time predictions.

Do not try to infer yard moves or physical train positions. The product rule is simple: if the app's general subway operating state is closed, train markers must not be shown until service resumes.

The working tree may already have unrelated local modifications in `frontend/src/app/station-arrivals.ts`, `frontend/src/components/StationDetailPanel.tsx`, and related frontend tests. Do not revert or reformat those files unless this plan explicitly touches them.

## File Structure

- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/SubwayOperatingWindow.java`
  - Backend helper for the same general operating window as the frontend closed-hours screen.
- Create: `backend/src/test/java/com/calebhabesh/linewatch/arrival/live/SubwayOperatingWindowTest.java`
  - Unit coverage for weekday, Sunday, and pre-2 AM behavior.
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayTrainMarkerService.java`
  - Return unavailable marker snapshots before reading cached GTFS-RT rows when subway service is closed.
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayTrainMarkerServiceTest.java`
  - Add closed-hours behavior coverage and update the constructor wiring.
- Modify: `frontend/src/components/LineWatchShell.tsx`
  - Stop polling estimated trains when closed, clear visible markers, pass the closed gate to the map, and update desktop control copy/status.
- Modify: `frontend/src/components/MobileMoreSheet.tsx`
  - Rename mobile control copy from "Live Train Locations" to "Estimated Train Markers".
- Modify: `frontend/tests/map-layering.test.mjs`
  - Source-level guardrails for closed-hours suppression and copy.
- Modify: `GEMINI.md`
  - Keep project truthfulness guidance aligned with the new behavior.

---

### Task 1: Backend Subway Operating Window Helper

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/SubwayOperatingWindow.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/arrival/live/SubwayOperatingWindowTest.java`

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/calebhabesh/linewatch/arrival/live/SubwayOperatingWindowTest.java`:

```java
package com.calebhabesh.linewatch.arrival.live;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class SubwayOperatingWindowTest {

    @Test
    void keepsServiceOpenBeforeTwoAmBecausePreviousServiceDayIsStillEnding() {
        SubwayOperatingWindow window = windowAt("2026-07-03T05:45:00Z"); // 1:45 AM EDT

        assertThat(window.isOpen()).isTrue();
    }

    @Test
    void closesAfterTwoAmUntilWeekdayStart() {
        assertThat(windowAt("2026-07-03T06:20:00Z").isOpen()).isFalse(); // 2:20 AM EDT
        assertThat(windowAt("2026-07-03T09:55:00Z").isOpen()).isFalse(); // 5:55 AM EDT
        assertThat(windowAt("2026-07-03T10:00:00Z").isOpen()).isTrue(); // 6:00 AM EDT
    }

    @Test
    void usesLaterSundayStart() {
        assertThat(windowAt("2026-07-05T11:30:00Z").isOpen()).isFalse(); // Sunday 7:30 AM EDT
        assertThat(windowAt("2026-07-05T12:00:00Z").isOpen()).isTrue(); // Sunday 8:00 AM EDT
    }

    private SubwayOperatingWindow windowAt(String instant) {
        return new SubwayOperatingWindow(Clock.fixed(Instant.parse(instant), ZoneOffset.UTC));
    }
}
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=SubwayOperatingWindowTest test
```

Expected: compilation fails because `SubwayOperatingWindow` does not exist.

- [ ] **Step 3: Implement the helper**

Create `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/SubwayOperatingWindow.java`:

```java
package com.calebhabesh.linewatch.arrival.live;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.springframework.stereotype.Component;

@Component
public class SubwayOperatingWindow {
    private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
    private static final int CLOSE_MINUTES = 2 * 60;
    private static final int WEEKDAY_SATURDAY_OPEN_MINUTES = 6 * 60;
    private static final int SUNDAY_OPEN_MINUTES = 8 * 60;

    private final Clock clock;

    public SubwayOperatingWindow(Clock clock) {
        this.clock = clock;
    }

    public boolean isOpen() {
        return isOpenAt(Instant.now(clock));
    }

    boolean isOpenAt(Instant instant) {
        ZonedDateTime torontoNow = instant.atZone(TORONTO_ZONE);
        int minutesAfterMidnight = torontoNow.getHour() * 60 + torontoNow.getMinute();
        int openingMinutes = openingMinutesFor(torontoNow.getDayOfWeek());
        return minutesAfterMidnight < CLOSE_MINUTES || minutesAfterMidnight >= openingMinutes;
    }

    private int openingMinutesFor(DayOfWeek dayOfWeek) {
        return dayOfWeek == DayOfWeek.SUNDAY ? SUNDAY_OPEN_MINUTES : WEEKDAY_SATURDAY_OPEN_MINUTES;
    }
}
```

- [ ] **Step 4: Run the helper test and verify it passes**

Run:

```bash
mvn -f backend/pom.xml -Dtest=SubwayOperatingWindowTest test
```

Expected: `BUILD SUCCESS`.

- [ ] **Step 5: Commit this task if committing is part of the workflow**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/arrival/live/SubwayOperatingWindow.java \
  backend/src/test/java/com/calebhabesh/linewatch/arrival/live/SubwayOperatingWindowTest.java
git commit -m "feat: add subway operating window helper"
```

---

### Task 2: Backend Train Marker Closed-Hours Gate

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayTrainMarkerService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayTrainMarkerServiceTest.java`

- [ ] **Step 1: Write the failing service test**

In `backend/src/test/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayTrainMarkerServiceTest.java`, add this static import:

```java
import static org.mockito.Mockito.verifyNoInteractions;
```

Update the `setUp()` constructor call to pass the new helper:

```java
service = new GtfsRtSubwayTrainMarkerService(
    cache,
    lineSegmentRepository,
    travelTimeRepository,
    properties,
    CLOCK,
    new SubwayOperatingWindow(CLOCK)
);
```

Add this test method after `returnsNoMarkersWhenLiveProviderIsDisabled()`:

```java
@Test
void returnsNoMarkersWhileSubwayOperatingWindowIsClosed() {
    Clock closedClock = Clock.fixed(Instant.parse("2026-07-03T06:20:00Z"), ZoneOffset.UTC);
    GtfsRtSubwayArrivalCache closedCache = new GtfsRtSubwayArrivalCache(properties, closedClock);
    OffsetDateTime now = OffsetDateTime.now(closedClock);
    closedCache.replace(new GtfsRtSubwayArrivalSnapshot(now.minusSeconds(10), now.minusSeconds(8), List.of(
        new GtfsRtSubwayStationArrival(
            "bay",
            "line-2",
            "Eastbound",
            now.plusSeconds(80),
            null,
            "232",
            "126789",
            "13753",
            19,
            16
        )
    )));
    GtfsRtSubwayTrainMarkerService closedService = new GtfsRtSubwayTrainMarkerService(
        closedCache,
        lineSegmentRepository,
        travelTimeRepository,
        properties,
        closedClock,
        new SubwayOperatingWindow(closedClock)
    );

    EstimatedTrainMarkerSnapshot snapshot = closedService.estimatedMarkers();

    assertThat(snapshot.fresh()).isFalse();
    assertThat(snapshot.markers()).isEmpty();
    assertThat(snapshot.message()).isEqualTo(
        "Subway service is outside scheduled operating hours; estimated train markers are hidden until service resumes."
    );
    verifyNoInteractions(lineSegmentRepository, travelTimeRepository);
}
```

- [ ] **Step 2: Run the service test and verify it fails**

Run:

```bash
mvn -f backend/pom.xml -Dtest=GtfsRtSubwayTrainMarkerServiceTest test
```

Expected: compilation fails because the `GtfsRtSubwayTrainMarkerService` constructor does not accept `SubwayOperatingWindow`.

- [ ] **Step 3: Implement the closed-hours gate**

In `backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayTrainMarkerService.java`, add a field:

```java
private final SubwayOperatingWindow operatingWindow;
```

Update the constructor signature and assignment:

```java
public GtfsRtSubwayTrainMarkerService(
    GtfsRtSubwayArrivalCache cache,
    LineSegmentRepository lineSegmentRepository,
    CommuteTravelTimeRepository travelTimeRepository,
    ArrivalProperties properties,
    Clock clock,
    SubwayOperatingWindow operatingWindow
) {
    this.cache = cache;
    this.lineSegmentRepository = lineSegmentRepository;
    this.travelTimeRepository = travelTimeRepository;
    this.properties = properties;
    this.clock = clock;
    this.operatingWindow = operatingWindow;
}
```

Inside `estimatedMarkers()`, immediately after the existing provider-disabled check and before `cache.freshSnapshot()`, add:

```java
if (!operatingWindow.isOpen()) {
    return EstimatedTrainMarkerSnapshot.unavailable(
        source,
        "Subway service is outside scheduled operating hours; estimated train markers are hidden until service resumes.",
        DISCLAIMER,
        generatedAt
    );
}
```

Do not change the existing stale-feed `maxAge` logic. It still matters when the subway is open and TTC stops updating the feed.

- [ ] **Step 4: Run the service tests and verify they pass**

Run:

```bash
mvn -f backend/pom.xml -Dtest=SubwayOperatingWindowTest,GtfsRtSubwayTrainMarkerServiceTest test
```

Expected: `BUILD SUCCESS`.

- [ ] **Step 5: Commit this task if committing is part of the workflow**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayTrainMarkerService.java \
  backend/src/test/java/com/calebhabesh/linewatch/arrival/live/GtfsRtSubwayTrainMarkerServiceTest.java
git commit -m "fix: hide train markers during subway closed hours"
```

---

### Task 3: Frontend Polling, Rendering, And Copy Gate

**Files:**
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/components/MobileMoreSheet.tsx`
- Modify: `frontend/tests/map-layering.test.mjs`

- [ ] **Step 1: Update the source-level frontend test first**

In `frontend/tests/map-layering.test.mjs`, replace the existing test named `"keeps estimated train markers opt-in and independently polled"` with:

```javascript
it("keeps estimated train markers opt-in and suppresses them while subway is closed", () => {
  const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
  const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");

  assert.match(shellSource, /linewatch-estimated-trains-enabled-v1/);
  assert.match(shellSource, /getEstimatedTrainMarkers/);
  assert.match(shellSource, /estimatedTrainMarkerRefreshMs/);
  assert.match(shellSource, /const estimatedTrainMarkersVisible = estimatedTrainsEnabled && subwayOperatingState\.status === "open";/);
  assert.match(shellSource, /if \(!estimatedTrainMarkersVisible \|\| document\.visibilityState !== "visible"\)/);
  assert.match(shellSource, /estimatedTrainsEnabled=\{estimatedTrainMarkersVisible\}/);
  assert.match(shellSource, /estimatedTrainMarkers=\{estimatedTrainMarkersVisible \? estimatedTrainSnapshot\.markers : \[\]\}/);
  assert.match(shellSource, /Estimated Train Markers/);
  assert.match(moreSheetSource, /Estimated Train Markers/);
  assert.doesNotMatch(shellSource, /Live Train Locations/);
  assert.doesNotMatch(moreSheetSource, /Live Train Locations/);
});
```

- [ ] **Step 2: Run the frontend source test and verify it fails**

Run:

```bash
cd frontend && node --test tests/map-layering.test.mjs
```

Expected: FAIL because `estimatedTrainMarkersVisible` and the new copy do not exist yet.

- [ ] **Step 3: Move the subway operating hook above the train polling effect**

In `frontend/src/components/LineWatchShell.tsx`, immediately after the existing estimated train state declarations:

```tsx
const [estimatedTrainsEnabled, setEstimatedTrainsEnabled] = useState(false);
const [estimatedTrainSnapshot, setEstimatedTrainSnapshot] = useState<EstimatedTrainSnapshot>(EMPTY_ESTIMATED_TRAIN_SNAPSHOT);
```

add:

```tsx
const subwayOperatingState = useSubwayOperatingState();
const estimatedTrainMarkersVisible = estimatedTrainsEnabled && subwayOperatingState.status === "open";
```

Then remove the later duplicate declaration:

```tsx
const subwayOperatingState = useSubwayOperatingState();
```

Keep `const [closedMapPeek, setClosedMapPeek] = useState(false);` where it is.

- [ ] **Step 4: Gate the train polling effect**

In the train marker polling effect in `frontend/src/components/LineWatchShell.tsx`, change:

```tsx
if (!estimatedTrainsEnabled || document.visibilityState !== "visible") {
  return;
}
```

to:

```tsx
if (!estimatedTrainMarkersVisible || document.visibilityState !== "visible") {
  return;
}
```

Change:

```tsx
if (estimatedTrainsEnabled) {
  refresh();
  intervalId = window.setInterval(refresh, estimatedTrainMarkerRefreshMs());
} else {
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setEstimatedTrainSnapshot(EMPTY_ESTIMATED_TRAIN_SNAPSHOT);
}
```

to:

```tsx
if (estimatedTrainMarkersVisible) {
  refresh();
  intervalId = window.setInterval(refresh, estimatedTrainMarkerRefreshMs());
} else {
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setEstimatedTrainSnapshot(EMPTY_ESTIMATED_TRAIN_SNAPSHOT);
}
```

Change the dependency array from:

```tsx
}, [estimatedTrainsEnabled]);
```

to:

```tsx
}, [estimatedTrainMarkersVisible]);
```

- [ ] **Step 5: Gate the status label**

In `frontend/src/components/LineWatchShell.tsx`, replace:

```tsx
const estimatedTrainStatusLabel = estimatedTrainsEnabled
  ? estimatedTrainSnapshot.fresh
    ? `${estimatedTrainSnapshot.markers.length} shown`
    : "Waiting"
  : "Off";
```

with:

```tsx
const estimatedTrainStatusLabel = subwayOperatingState.status === "closed"
  ? "Closed"
  : estimatedTrainsEnabled
    ? estimatedTrainSnapshot.fresh
      ? `${estimatedTrainSnapshot.markers.length} shown`
      : "Waiting"
    : "Off";
```

- [ ] **Step 6: Rename the desktop control and show the status**

In the desktop Display menu block in `frontend/src/components/LineWatchShell.tsx`, replace the current label span:

```tsx
<span className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-3">
  <Train size={18} className="text-slate-500 dark:text-slate-400" /> Live Train Locations
</span>
```

with:

```tsx
<span className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-3">
  <Train size={18} className="text-slate-500 dark:text-slate-400" />
  <span className="flex flex-col leading-tight">
    <span>Estimated Train Markers</span>
    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{estimatedTrainStatusLabel}</span>
  </span>
</span>
```

Change the button label from:

```tsx
aria-label="Toggle live train locations"
```

to:

```tsx
aria-label="Toggle estimated train markers"
```

- [ ] **Step 7: Rename the mobile control**

In `frontend/src/components/MobileMoreSheet.tsx`, replace:

```tsx
<span>Live Train Locations</span>
```

with:

```tsx
<span>Estimated Train Markers</span>
```

- [ ] **Step 8: Gate map rendering props**

In the `InteractiveTtcMap` props inside `frontend/src/components/LineWatchShell.tsx`, replace:

```tsx
estimatedTrainsEnabled={estimatedTrainsEnabled}
estimatedTrainMarkers={estimatedTrainSnapshot.markers}
```

with:

```tsx
estimatedTrainsEnabled={estimatedTrainMarkersVisible}
estimatedTrainMarkers={estimatedTrainMarkersVisible ? estimatedTrainSnapshot.markers : []}
```

This clears the layer immediately when the clock flips to closed, even if the user's preference remains enabled in local storage.

- [ ] **Step 9: Run the frontend source test and verify it passes**

Run:

```bash
cd frontend && node --test tests/map-layering.test.mjs
```

Expected: PASS.

- [ ] **Step 10: Commit this task if committing is part of the workflow**

```bash
git add frontend/src/components/LineWatchShell.tsx \
  frontend/src/components/MobileMoreSheet.tsx \
  frontend/tests/map-layering.test.mjs
git commit -m "fix: suppress train marker polling when subway is closed"
```

---

### Task 4: Documentation Truthfulness Update

**Files:**
- Modify: `GEMINI.md`

- [ ] **Step 1: Update the implemented-state note**

In `GEMINI.md`, find the existing sentence:

```markdown
- Opt-in schematic train markers, derived from the GTFS-RT subway arrival cache and mapped onto rapid-transit segment topology, are served at `/api/trains` and rendered on the SVG map.
```

Replace it with:

```markdown
- Opt-in schematic train markers, derived from the GTFS-RT subway arrival cache and mapped onto rapid-transit segment topology, are served at `/api/trains` and rendered on the SVG map only while the general subway operating window is open. During closed hours, markers are suppressed even if TTC continues publishing fresh subway Trip Updates.
```

- [ ] **Step 2: Update the claim guardrail**

In `GEMINI.md`, find the paragraph beginning:

```markdown
Do not claim that the visible dashboard is live unless there is a fresh successful ingestion run.
```

In that paragraph, after:

```markdown
Do not claim estimated train markers are exact physical train positions or reflect real-time physical movement; always refer to them as estimated train markers or schematic placements.
```

append this sentence:

```markdown
Do not claim overnight subway Trip Updates represent in-service trains; the app hides estimated markers during closed hours.
```

- [ ] **Step 3: Verify the docs contain the new truthfulness language**

Run:

```bash
rg -n "closed hours|overnight subway Trip Updates|general subway operating window" GEMINI.md
```

Expected: output includes the two updated locations.

- [ ] **Step 4: Commit this task if committing is part of the workflow**

```bash
git add GEMINI.md
git commit -m "docs: document closed-hours train marker policy"
```

---

### Task 5: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused backend verification**

Run:

```bash
mvn -f backend/pom.xml -Dtest=SubwayOperatingWindowTest,GtfsRtSubwayTrainMarkerServiceTest,TrainControllerTest test
```

Expected: `BUILD SUCCESS`.

- [ ] **Step 2: Run focused frontend verification**

Run:

```bash
cd frontend && node --test tests/subway-hours.test.mjs tests/train-markers.test.mjs tests/map-layering.test.mjs
```

Expected: all selected tests pass.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: type generation and TypeScript check complete without errors.

- [ ] **Step 4: Check formatting-sensitive diff issues**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 5: Review behavior manually if a dev server is already being used**

Use a local preview URL with closed time:

```text
http://localhost:3000/?previewTime=2026-07-03T03:15:00-04:00
```

Expected:
- The train marker control says `Estimated Train Markers`.
- The status says `Closed`.
- No train markers are visible on the SVG map.
- Browser devtools Network should not show repeated `/api/trains` polling while closed.

Use an open time:

```text
http://localhost:3000/?previewTime=2026-07-03T10:00:00-04:00
```

Expected:
- If the user preference is enabled, `/api/trains` polling resumes.
- Markers render only when `/api/trains` returns `fresh: true` with non-empty markers.

## Self-Review

- Spec coverage: Backend source of truth, frontend immediate suppression, copy truthfulness, and docs are all covered.
- Placeholder scan: No `TBD`, `TODO`, or vague "handle edge cases" instructions remain.
- Type consistency: `SubwayOperatingWindow`, `estimatedTrainMarkersVisible`, and `estimatedTrainStatusLabel` names are used consistently across tasks.

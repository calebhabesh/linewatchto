# Gemini Remaining Slices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the remaining LineWatch TO backend/product slices from the current `main` baseline without reintroducing stale fixture claims or overclaiming live transit data.

**Architecture:** Keep LineWatch TO map-first and backend-owned: Spring Boot normalizes and serves live read models, PostgreSQL/PostGIS stores source data and geometry, Redis is added only after live contracts are stable, and Next.js remains a thin typed consumer with fixture fallback. Implement one slice at a time, keep every slice shippable, and update documentation only to match verified code.

**Tech Stack:** Java 21, Spring Boot 3.5, Spring Data JPA/JDBC, Spring Data Redis, PostgreSQL/PostGIS, Flyway, Maven, Next.js App Router, React, TypeScript, Node test runner, Playwright Chromium.

---

## Gemini 3.5 Flash High Prompt

Use this prompt in a fresh Gemini session:

```text
You are working in ~/dev/ttc-reliability-navigator on LineWatch TO, an unofficial TTC reliability dashboard. Read AGENTS.md, GEMINI.md, README.md, REMAINING_TASKS.md, and docs/superpowers/plans/2026-06-03-gemini-remaining-slices.md before editing.

Current target baseline from Codex review: main at 7e91c5b style(frontend): layout cause field inline to prevent wrapping. The old REMAINING_TASKS.md section about an uncommitted UI batch is stale if git status is clean; the UI batch has been committed on main. Start with Slice 1: nightly closure active-window gating.

Implement exactly one task group at a time. Before each group, inspect current code and write the smallest meaningful failing test. Preserve user changes. Do not reset, checkout, or delete unrelated work. Do not claim live arrivals, imported GTFS geometry, production geospatial matching, Redis-backed status, commute impact, or real reliability analytics until the relevant task group has passing verification. Run the verification commands listed in this plan before saying a group is complete.
```

## Current State Summary

Confirmed from the checkout on 2026-06-03:

- Branch: `main`
- Upstream: `origin/main`
- Head: `7e91c5b style(frontend): layout cause field inline to prevent wrapping`
- Recent completed work:
  - Station detail enrichment is merged.
  - Accessibility outage cause display is implemented.
  - UI polish batch is committed.
  - No dirty tracked or untracked changes appeared in `git status --short --branch`.
- `REMAINING_TASKS.md` still contains a stale warning about an uncommitted Gemini UI batch. Treat that warning as historical unless `git status` proves otherwise.
- Current latest migration: `V13__add_cause_to_accessibility_outages.sql`
- `alert_active_periods` already exists and is populated by `TtcAlertStore`, but no dashboard read layer consumes it yet.

## Global Rules

- Implement slices in order.
- Commit after each task group.
- Keep fixture fallback available.
- Keep `README.md`, `AGENTS.md`, and `GEMINI.md` aligned when product claims change.
- For every public data source, document the source URL, attribution, limitations, freshness rule, and failure behavior.
- Prefer additive migrations. Do not edit old migrations.
- Do not add dependencies unless the slice clearly needs one and all verification still runs.

## Task 0: Baseline And Handoff Cleanup

**Files:**
- Modify: `REMAINING_TASKS.md`
- Inspect: `AGENTS.md`
- Inspect: `GEMINI.md`
- Inspect: `README.md`

- [ ] **Step 1: Confirm the clean baseline**

Run:

```bash
git status --short --branch
git log --oneline --decorate -5
```

Expected:

```text
## main...origin/main
7e91c5b (HEAD -> main, origin/main, origin/HEAD) style(frontend): layout cause field inline to prevent wrapping
```

If local changes exist, preserve them and include them in the handoff cleanup instead of resetting.

- [ ] **Step 2: Update `REMAINING_TASKS.md` stale baseline copy**

Replace the old `fix/ui-iteration` snapshot with the current `main` snapshot:

```markdown
## Snapshot Baseline

At the time this handoff was refreshed:

- Working branch: `main`
- Committed baseline: `7e91c5b style(frontend): layout cause field inline to prevent wrapping`
- The previous Gemini UI-polish batch has been reviewed and committed.
- The next incomplete product slice is nightly closure active-window gating.
```

Replace the old "Preserve The Current UI Batch" and "Slice 0" sections with:

```markdown
## Current Local-Change Policy

The previous uncommitted UI batch has been committed on `main`. Still run
`git status --short --branch` before edits and preserve any new local user work.
Do not use reset or checkout to clean the tree unless the user explicitly asks.
```

- [ ] **Step 3: Run a documentation hygiene check**

Run:

```bash
git diff --check
```

Expected: no whitespace errors from the handoff edit.

- [ ] **Step 4: Commit**

Run:

```bash
git add REMAINING_TASKS.md
git commit -m "docs: refresh remaining slices handoff"
```

Expected: a docs-only commit.

## Task 1: Nightly Closure Active-Window Gating

**Goal:** Planned closure cards remain visible as upcoming notices, but map/status/commute current-impact behavior appears only during an actual active closure window.

**Design decision:** Active nightly closures remain semantically `planned-closure`. During an active window they are exposed as current impacts that click back to the Closures submenu card. They are not recategorized as ordinary active alerts.

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertActivePeriodRepository.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/map/MapController.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/status/StatusController.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertDashboardServiceTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/map/MapControllerTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/status/StatusControllerTest.java`
- Modify: `frontend/src/app/linewatch-data.ts`
- Modify: `frontend/src/components/InteractiveTtcMap.tsx`
- Modify: `frontend/src/components/PlannedClosuresPanel.tsx`
- Modify: `frontend/tests/linewatch-data.test.mjs`
- Modify: `frontend/tests/smoke/api-stub-data.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

### Task 1.1: Backend Period Read Model

- [ ] **Step 1: Write failing service tests**

In `AlertDashboardServiceTest`, add tests proving:

```java
@Test
void plannedClosuresExposeNightlyWindowStateBeforeDuringAndAfterChildPeriods() {
    // fixed service clock is 2026-06-01T12:00:00Z in this test class
    // create one planned closure with parent range 2026-06-01 to 2026-06-05
    // mock child periods:
    //   2026-06-01T02:00:00Z -> 2026-06-01T06:00:00Z ended
    //   2026-06-02T02:00:00Z -> 2026-06-02T06:00:00Z upcoming
    // assert dto.nightly() is true
    // assert dto.activeNow() is false
    // assert dto.timingStatus() is "upcoming"
    // assert dto.nextWindowStart() is 2026-06-02T02:00:00Z
}
```

Add a second test where the fixed clock is inside a child period and assert:

```java
assertThat(dto.activeNow()).isTrue();
assertThat(dto.timingStatus()).isEqualTo("active-now");
assertThat(dto.activeWindowStart()).isEqualTo(OffsetDateTime.parse("2026-06-01T11:00:00Z"));
assertThat(dto.activeWindowEnd()).isEqualTo(OffsetDateTime.parse("2026-06-01T13:00:00Z"));
```

Expected before implementation: the test fails because `AlertDashboardService` has no period repository and `PlannedClosureDto` has no window-state fields.

- [ ] **Step 2: Create the period repository**

Create `AlertActivePeriodRepository.java`:

```java
package com.calebhabesh.linewatch.alert;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class AlertActivePeriodRepository {
    private final NamedParameterJdbcTemplate jdbc;

    public AlertActivePeriodRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<String, List<AlertPeriod>> findByAlertIds(Collection<String> alertIds) {
        if (alertIds == null || alertIds.isEmpty()) {
            return Map.of();
        }
        return jdbc.query("""
            select alert_id, source_period_id, starts_at, ends_at, sort_order
            from alert_active_periods
            where alert_id in (:alertIds)
            order by alert_id asc, sort_order asc
            """, new MapSqlParameterSource("alertIds", alertIds), (rs, rowNum) ->
            new AlertPeriod(
                rs.getString("alert_id"),
                rs.getString("source_period_id"),
                rs.getObject("starts_at", OffsetDateTime.class),
                rs.getObject("ends_at", OffsetDateTime.class),
                rs.getInt("sort_order")
            )
        ).stream().collect(Collectors.groupingBy(AlertPeriod::alertId));
    }

    public record AlertPeriod(
        String alertId,
        String sourcePeriodId,
        OffsetDateTime startsAt,
        OffsetDateTime endsAt,
        int sortOrder
    ) {}
}
```

- [ ] **Step 3: Inject the repository into `AlertDashboardService`**

Add a constructor parameter and field:

```java
private final AlertActivePeriodRepository periodRepository;
```

Update all tests that instantiate `AlertDashboardService` to pass a mock repository.

- [ ] **Step 4: Extend planned closure DTO**

Change `PlannedClosureDto` to include:

```java
boolean activeNow,
String timingStatus,
boolean nightly,
OffsetDateTime activeWindowStart,
OffsetDateTime activeWindowEnd,
String activeWindowLabel,
OffsetDateTime nextWindowStart,
OffsetDateTime nextWindowEnd,
String nextWindowLabel,
```

Use wire values:

```text
active-now
upcoming
unknown
```

Do not return ended closures from `plannedClosures()`.

- [ ] **Step 5: Add window-state helpers**

Add helper methods in `AlertDashboardService`:

```java
private WindowState windowState(AlertEntity alert, List<AlertActivePeriodRepository.AlertPeriod> periods) {
    OffsetDateTime now = OffsetDateTime.now(clock);
    List<AlertActivePeriodRepository.AlertPeriod> usablePeriods = periods == null || periods.isEmpty()
        ? List.of(new AlertActivePeriodRepository.AlertPeriod(
            alert.getId(),
            "parent",
            alert.getActivePeriodStart(),
            alert.getActivePeriodEnd(),
            0
        ))
        : periods;

    Optional<AlertActivePeriodRepository.AlertPeriod> active = usablePeriods.stream()
        .filter(period -> startsAtOrBefore(period.startsAt(), now))
        .filter(period -> endsAfter(period.endsAt(), now))
        .findFirst();

    if (active.isPresent()) {
        AlertActivePeriodRepository.AlertPeriod period = active.orElseThrow();
        return new WindowState(true, "active-now", isNightly(usablePeriods),
            period.startsAt(), period.endsAt(), window(period.startsAt(), period.endsAt()),
            null, null, null);
    }

    Optional<AlertActivePeriodRepository.AlertPeriod> next = usablePeriods.stream()
        .filter(period -> period.startsAt() == null || period.startsAt().isAfter(now))
        .min(Comparator.comparing(
            AlertActivePeriodRepository.AlertPeriod::startsAt,
            Comparator.nullsLast(Comparator.naturalOrder())
        ));

    if (next.isPresent()) {
        AlertActivePeriodRepository.AlertPeriod period = next.orElseThrow();
        return new WindowState(false, "upcoming", isNightly(usablePeriods),
            null, null, null,
            period.startsAt(), period.endsAt(), window(period.startsAt(), period.endsAt()));
    }

    return new WindowState(false, "unknown", isNightly(usablePeriods),
        null, null, null, null, null, null);
}
```

Define `startsAtOrBefore`, `endsAfter`, `isNightly`, and `WindowState` in the same class. Treat a null start as active if the end is future. Treat a null end as active after the start. Treat multiple child rows or a non-`parent` `sourcePeriodId` as nightly.

- [ ] **Step 6: Filter planned closures using period rows**

In `plannedClosures()`:

1. Fetch active planned closure alerts.
2. Query period rows by alert ID.
3. Keep alerts with `timingStatus` of `active-now` or `upcoming`.
4. Map with `toPlannedClosure(alert, segments, windowState)`.

- [ ] **Step 7: Add active planned closure impacts**

Add a service method:

```java
public List<PlannedClosureDto> activePlannedClosures()
```

It returns only planned closures with `activeNow() == true`.

In `activeSegmentImpacts()`, append `SegmentImpact` rows for active planned closures:

```java
new SegmentImpact(
    PLANNED_CLOSURE_KIND,
    closure.id(),
    "bidirectional",
    List.of(closure.id())
)
```

Set planned closure impact priority higher than delay and lower than suspension, or equal to suspension if the UX treats it as closed service. Keep the `kind` as `planned-closure` so map clicks open the closure card.

- [ ] **Step 8: Update status reads**

Inject `AlertDashboardService` into `StatusController`. Use `activePlannedClosures()` to mark affected lines as:

```text
status: planned
statusLabel: Closure active
summary: active planned closure title
updatedAgo: Updated 2 min ago
```

Suspensions still outrank active planned closures. Active planned closures outrank ordinary delays.

- [ ] **Step 9: Run focused backend tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=AlertDashboardServiceTest,MapControllerTest,StatusControllerTest test
```

Expected: PASS.

### Task 1.2: Frontend Closure State And Active Overlay

- [ ] **Step 1: Update frontend types**

In `frontend/src/app/linewatch-data.ts`, change:

```ts
export type MapImpactKind = Exclude<ImpactKind, "planned-closure">;
```

to:

```ts
export type MapImpactKind = ImpactKind;
```

Add fields to `PlannedClosure`:

```ts
activeNow?: boolean;
timingStatus?: "active-now" | "upcoming" | "unknown";
nightly?: boolean;
activeWindowStart?: string | null;
activeWindowEnd?: string | null;
activeWindowLabel?: string | null;
nextWindowStart?: string | null;
nextWindowEnd?: string | null;
nextWindowLabel?: string | null;
```

- [ ] **Step 2: Render active planned closure overlays**

In `InteractiveTtcMap.tsx`, update the impact-kind visual mapping so `planned-closure` renders as a closed-service visual state when it arrives through `segment.impacts`.

Use red/closed-service treatment for active closure impacts. Keep manual selected closure previews blue.

Expected behavior:

- `segment.impacts[].kind === "planned-closure"` renders a current overlay.
- Clicking that overlay calls `onSelectImpact({ kind: "planned-closure", id })`.
- Manual closure card highlighting still uses `previewSegmentIds` and the blue preview path.

- [ ] **Step 3: Update `PlannedClosuresPanel.tsx`**

Show badges:

```tsx
{closure.activeNow && <span>Active now</span>}
{closure.nightly && <span>Nightly</span>}
```

Show timing copy:

```tsx
{closure.activeNow && closure.activeWindowLabel && (
  <p>Current window: {closure.activeWindowLabel}</p>
)}
{!closure.activeNow && closure.nextWindowLabel && (
  <p>Next window: {closure.nextWindowLabel}</p>
)}
```

Keep `Highlight on Map` for manual preview. Do not rename it to "Active" unless the user action actually changes the map selection.

- [ ] **Step 4: Update smoke stubs and tests**

In `frontend/tests/smoke/api-stub-data.mjs`, make one closure active:

```js
activeNow: true,
timingStatus: "active-now",
nightly: true,
activeWindowLabel: "Now until 2:00 AM",
nextWindowLabel: null,
```

Add a `planned-closure` impact to the matching stub map segment.

In `dashboard.spec.ts`, assert:

```ts
await page.getByRole("button", { name: /planned closure/i }).click();
await expect(page.getByRole("heading", { name: "Upcoming Closures" })).toBeVisible();
await expect(page.locator('[data-impact-card-id="stub-closure-line-1"]')).toHaveClass(/highlight-active-card/);
await expect(page.getByText("Active now", { exact: true })).toBeVisible();
```

- [ ] **Step 5: Run frontend verification**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

Expected: PASS.

- [ ] **Step 6: Update docs and commit**

Update `README.md`, `AGENTS.md`, and `GEMINI.md` to state that nightly closure active-window gating is implemented and live station arrivals remain demo-only.

Run:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
git add backend frontend README.md AGENTS.md GEMINI.md
git commit -m "feat: gate nightly closure active windows"
```

Expected: all checks pass before commit.

## Task 2: Public Live Station Arrivals

**Goal:** Replace station-panel demo estimates with source-labeled live predictions only after confirming a reliable public machine-readable source.

**Data-source gate:** Before coding the provider, research the current public source. Use official or clearly public documentation. Record the source URL, request format, attribution text, rate limits if published, and known limitations in `docs/superpowers/specs/2026-06-03-live-station-arrivals-design.md`. If no reliable source is confirmed, implement only the unavailable-state path and keep demo estimates labeled.

**Files:**
- Create: `docs/superpowers/specs/2026-06-03-live-station-arrivals-design.md`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/ArrivalProvider.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/ArrivalPrediction.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/ArrivalService.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/ArrivalProperties.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/ArrivalConfiguration.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/arrival/PublicArrivalClient.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/arrival/PublicArrivalClientTest.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/arrival/ArrivalServiceTest.java`
- Create: `backend/src/main/resources/arrival/ttc-arrival-stop-map.csv`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/station/StationService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/station/StationResponses.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/station/StationServiceTest.java`
- Modify: `frontend/src/app/station-data.ts`
- Modify: `frontend/src/components/StationDetailPanel.tsx`
- Modify: `frontend/tests/station-data.test.mjs`
- Modify: `frontend/tests/smoke/api-stub-data.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

### Task 2.1: Source Research And Contract

- [ ] **Step 1: Research the public source**

Confirm:

- base URL
- query parameters
- stop or station identifiers
- response fields for prediction time, route/line, direction, and timestamp
- attribution requirements
- freshness and failure behavior

Do not use guessed endpoints.

- [ ] **Step 2: Write the design spec**

Document:

```markdown
# Live Station Arrivals Design

## Source
Name the confirmed public source, URL, attribution text, request format, and rate limits if published.

## Contract
Describe the backend arrival response fields and freshness threshold.

## Failure Behavior
Describe disabled-source, stale-source, malformed-payload, and upstream-failure behavior.

## Station Mapping
Describe how `ttc-arrival-stop-map.csv` maps LineWatch station IDs and line IDs to provider stop identifiers.

## Testing
List backend client, service, station API, frontend fixture, and smoke-test coverage.
```

- [ ] **Step 3: Commit the design**

Run:

```bash
git add docs/superpowers/specs/2026-06-03-live-station-arrivals-design.md
git commit -m "docs: design live station arrivals"
```

### Task 2.2: Backend Arrival Service

- [ ] **Step 1: Add arrival response fields**

Change `StationResponses.StationArrivalResponse` to:

```java
public record StationArrivalResponse(
    String lineId,
    String direction,
    Integer minutes,
    OffsetDateTime predictedAt,
    String label,
    String source,
    String status
) {}
```

Use `status` values:

```text
live
unavailable
demo
```

- [ ] **Step 2: Create provider interfaces**

Create:

```java
public interface ArrivalProvider {
    List<ArrivalPrediction> arrivalsFor(String stationId, List<StationResponses.StationLineResponse> lines);
}
```

Create:

```java
public record ArrivalPrediction(
    String lineId,
    String direction,
    Integer minutes,
    OffsetDateTime predictedAt,
    String source
) {}
```

- [ ] **Step 3: Implement `ArrivalService`**

Behavior:

- If provider is disabled or fails, return clearly labeled unavailable rows or the existing demo estimates.
- If provider returns predictions, sort by line and minutes.
- Do not cache in PostgreSQL.
- Keep each response source-labeled.

- [ ] **Step 4: Wire `StationService`**

Inject `ArrivalService` and replace the hard-coded demo arrivals with:

```java
arrivalService.arrivalsFor(station.getId(), lines)
```

Set `arrivalsSource` to:

- confirmed provider attribution when live predictions exist
- `Arrival source unavailable` when provider is unavailable
- `Demo estimates` when fallback is intentionally demo

- [ ] **Step 5: Test provider success and failure**

Use `MockRestServiceServer` as in `TtcAlertClientTest`.

Tests must cover:

- successful parse
- malformed payload
- upstream HTTP failure
- stale prediction filtering
- disabled provider fallback

- [ ] **Step 6: Frontend station panel**

Update `StationDetailPanel`:

- heading should be `Arrivals` instead of `Demo arrivals` when any row has `status === "live"`
- show provider source
- show unavailable copy when `status === "unavailable"`
- continue showing demo copy when `status === "demo"`

- [ ] **Step 7: Verify and commit**

Run:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
git add backend frontend docs README.md AGENTS.md GEMINI.md
git commit -m "feat: add source-labeled station arrivals"
```

Expected: PASS. If live source cannot be confirmed, use commit message:

```bash
git commit -m "feat: add station arrival unavailable state"
```

## Task 3: Static GTFS Import And PostGIS Geometry

**Goal:** Import static TTC GTFS data for supported rapid-transit routes and populate geographic geometry used by production matching.

**Scope split:** Implement this as four commits. Do not try to replace every matcher in the first commit.

**Files:**
- Create package: `backend/src/main/java/com/calebhabesh/linewatch/gtfs/`
- Create: `backend/src/main/resources/db/migration/V14__gtfs_static_import.sql`
- Create: `backend/src/main/resources/db/migration/V15__gtfs_geometry.sql`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/station/`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertSegmentMatcher.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

### Task 3.1: GTFS Schema And Importer

- [ ] **Step 1: Write migration tests**

Add a migration test asserting tables exist in the migration SQL:

```text
gtfs_import_runs
gtfs_routes
gtfs_stops
gtfs_trips
gtfs_stop_times
gtfs_shapes
```

Expected before implementation: FAIL.

- [ ] **Step 2: Add schema migration**

Add tables with source IDs, line IDs, sequence/order fields, and timestamps. Include unique keys on source IDs and indexes on line/shape/stop IDs.

- [ ] **Step 3: Add parser records**

Create records for:

```java
GtfsRoute
GtfsStop
GtfsTrip
GtfsStopTime
GtfsShapePoint
```

- [ ] **Step 4: Add idempotent importer**

Create `GtfsImportService` that:

- accepts a local GTFS ZIP path or configured URL
- reads required text files
- filters to supported rapid-transit routes
- upserts records
- records run status in `ingestion_runs` with run type `gtfs-static`

- [ ] **Step 5: Test importer**

Use a small test GTFS ZIP under `backend/src/test/resources/fixtures/gtfs-mini.zip`.

Assert:

- importer only stores supported routes
- repeated import does not duplicate rows
- malformed required files fail the import run clearly

- [ ] **Step 6: Verify and commit**

Run:

```bash
mvn -f backend/pom.xml -Dtest=*Gtfs* test
git add backend
git commit -m "feat: import static GTFS rapid transit data"
```

### Task 3.2: PostGIS Geometry Population

- [ ] **Step 1: Add geometry columns**

Add migration fields:

```sql
alter table stations add column geom geometry(Point, 4326);
alter table line_segments add column geom geometry(LineString, 4326);
```

Only add columns if they do not already exist. Add GiST indexes.

- [ ] **Step 2: Populate station geometry**

Map existing station IDs to GTFS stop IDs. Use direct station-line mapping where possible and explicit alias mapping where TTC stop names differ.

- [ ] **Step 3: Populate segment geometry**

For each adjacent rapid-transit topology link, derive a LineString from the relevant GTFS shape points between the two station stops.

- [ ] **Step 4: Test geometry**

Assert:

- mapped stations have non-null point geometry
- adjacent line segments have non-null LineString geometry
- Line 1 nonlinear guide areas still keep authored SVG guide IDs for rendering
- fixture mode works without a completed GTFS import

- [ ] **Step 5: Verify and commit**

Run:

```bash
mvn -f backend/pom.xml test
git add backend
git commit -m "feat: populate rapid transit geometry"
```

### Task 3.3: Production Alert Matching

- [ ] **Step 1: Add matcher confidence model**

Create:

```java
public record AlertMatchResult(
    List<String> segmentIds,
    List<String> stationIds,
    String confidence,
    String reason
) {}
```

Confidence values:

```text
exact-station-bounds
station-list
line-only
unmatched
```

- [ ] **Step 2: Extend matcher tests**

Cover:

- exact adjacent bounds
- multi-segment bounded corridor
- station-list-only alert
- unresolved station name
- line-only fallback

- [ ] **Step 3: Implement matcher**

Keep existing authored SVG segment IDs as output IDs. Use PostGIS geometry and GTFS topology for matching decisions, but keep UI rendering tied to `line_segments.svg_path`, `stationAAnchorId`, `stationBAnchorId`, and `guidePathId`.

- [ ] **Step 4: Surface uncertainty**

Add match confidence to backend DTOs where useful. Do not show scary UI copy for normal exact matches. For low-confidence matches, use source wording in cards and avoid claiming exact segment precision.

- [ ] **Step 5: Verify and commit**

Run:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
git add backend frontend README.md AGENTS.md GEMINI.md
git commit -m "feat: match alerts with GTFS-backed topology"
```

## Task 4: Saved Commute Impact API

**Goal:** Replace fixture-only saved commute impact cards with backend route-impact evaluation for an origin and destination.

**Files:**
- Create package: `backend/src/main/java/com/calebhabesh/linewatch/commute/`
- Create tests: `backend/src/test/java/com/calebhabesh/linewatch/commute/`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/linewatch-data.ts`
- Modify: `frontend/src/components/SavedCommutesPanel.tsx`
- Modify: `frontend/tests/page-data.test.mjs`
- Modify: `frontend/tests/smoke/api-stub.mjs`
- Modify: `frontend/tests/smoke/api-stub-data.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Define API request and response**

Create:

```java
public record CommuteImpactRequest(String originStationId, String destinationStationId) {}
public record CommuteImpactResponse(
    String originStationId,
    String destinationStationId,
    String impact,
    String statusLabel,
    String detail,
    List<String> affectedSegmentIds,
    List<String> sourceAlertIds
) {}
```

Impact values:

```text
clear
minor
major
suspended
planned
```

- [ ] **Step 2: Write service tests**

Cover:

- clear route
- route affected by delay
- route affected by Reduced Speed Zone
- route affected by suspension
- route affected by active planned closure
- invalid station IDs return validation errors

- [ ] **Step 3: Implement `CommuteImpactService`**

Use GTFS-backed topology from Task 3 to compute corridor segment IDs. Compare corridor segments against `AlertDashboardService.activeSegmentImpacts()`.

Severity precedence:

```text
suspended > planned > major > minor > clear
```

- [ ] **Step 4: Add controller**

Expose:

```text
POST /api/commutes/impact
```

Validate request body with Bean Validation.

- [ ] **Step 5: Wire frontend fetch**

Keep fixture fallback if the backend route fails. The current saved routes in `linewatch-data.ts` may stay as default examples.

- [ ] **Step 6: Verify and commit**

Run:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
git add backend frontend README.md AGENTS.md GEMINI.md
git commit -m "feat: evaluate saved commute impacts"
```

## Task 5: Reliability Aggregation

**Goal:** Replace fixture reliability rows with measured line and station summaries derived from persisted alert snapshots.

**Files:**
- Create package: `backend/src/main/java/com/calebhabesh/linewatch/reliability/`
- Create tests: `backend/src/test/java/com/calebhabesh/linewatch/reliability/`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/linewatch-data.ts`
- Modify: `frontend/src/components/ReliabilityPanel.tsx`
- Modify: `frontend/tests/page-data.test.mjs`
- Modify: `frontend/tests/smoke/api-stub.mjs`
- Modify: `frontend/tests/smoke/api-stub-data.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Define formulas in docs**

Add a spec describing:

- 7-day incident count
- median active duration
- reliability score calculation
- insufficient-history state

Use a simple score:

```text
score = max(0, 100 - incidents7d * 3 - medianDurationMinutes / 3)
```

Round to the nearest integer. Document that this is an early portfolio metric, not an official TTC performance measure.

- [ ] **Step 2: Add repository queries**

Create queries over `snapshots` and `alerts` that group by line and station. Use source update timestamps when available; otherwise use snapshot timestamps.

- [ ] **Step 3: Create endpoints**

Expose:

```text
GET /api/reliability/lines
GET /api/reliability/stations/{id}
```

- [ ] **Step 4: Update frontend**

Fetch `/api/reliability/lines` in `page.tsx`. Fall back to fixture `reliabilitySummaries` when unavailable. Keep insufficient-history copy visible instead of fake metrics.

- [ ] **Step 5: Verify and commit**

Run:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
git add backend frontend docs README.md AGENTS.md GEMINI.md
git commit -m "feat: aggregate reliability summaries"
```

## Task 6: Redis-Backed Dashboard Cache

**Goal:** Cache current dashboard read models without serving stale live impacts past the ingestion freshness window.

**Files:**
- Create package: `backend/src/main/java/com/calebhabesh/linewatch/cache/`
- Create tests: `backend/src/test/java/com/calebhabesh/linewatch/cache/`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/map/MapController.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/status/StatusController.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertFeedApplicationService.java`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Add cache properties**

Create:

```java
@ConfigurationProperties("linewatch.cache.dashboard")
public class DashboardCacheProperties {
    private boolean enabled = true;
    private Duration ttl = Duration.ofMinutes(2);
}
```

Cap the effective TTL to the ingestion freshness window.

- [ ] **Step 2: Add cache service**

Create `DashboardCacheService` with:

```java
<T> Optional<T> get(String key, Class<T> type)
void put(String key, Object value, Duration ttl)
void evictDashboard()
```

If Redis throws, log at warning level and return cache miss. Do not fail user-facing endpoints because Redis is down.

- [ ] **Step 3: Wrap read models**

Cache:

- `/api/status`
- `/api/map`
- `/api/alerts` by type
- `/api/reliability/lines` if Task 5 is complete

Never cache station-detail arrivals longer than their source freshness window.

- [ ] **Step 4: Invalidate after ingestion**

After a successful TTC alert feed application, evict dashboard cache keys. Do not evict on failed ingestion.

- [ ] **Step 5: Test cache behavior**

Cover:

- hit
- miss
- TTL expiry
- invalidation after successful ingestion
- Redis unavailable fallback
- no stale impacts beyond freshness window

- [ ] **Step 6: Verify and commit**

Run:

```bash
mvn -f backend/pom.xml test
docker compose up -d redis
mvn -f backend/pom.xml test
git add backend README.md AGENTS.md GEMINI.md
git commit -m "feat: cache dashboard read models in redis"
```

If Docker is unavailable locally, report the exact failure and still run `mvn -f backend/pom.xml test`.

## Task 7: Secondary UX Backlog

Implement these only after Tasks 1-6, or if the user reprioritizes them:

- line-status drawer with an extended stop list
- static help widget for map effects and cardinal directions
- search stops functionality beyond current clickable map stations
- high-contrast and dark-mode toggle independence audit
- improved upcoming-closure date hierarchy after active-window gating lands
- TTC Reduced Speed Zones webpage ingestion if Live Alerts proves incomplete
- deployment and published verification metrics

For each item, write a separate spec and plan before implementation.

## Final Full Verification

After all selected slices are complete, run:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
git status --short --branch
```

Expected:

- backend tests pass
- frontend fixture tests pass
- typecheck passes
- lint passes
- production build passes
- Playwright smoke tests pass
- worktree contains only intentional committed work or clearly reported user-owned local changes

## Self-Review Checklist For Gemini

Before marking any task group complete:

- [ ] Did I run the exact relevant verification commands?
- [ ] Did I preserve fixture fallback?
- [ ] Did I avoid claiming live data without a fresh source?
- [ ] Did I keep `README.md`, `AGENTS.md`, and `GEMINI.md` aligned?
- [ ] Did I avoid broad unrelated refactors?
- [ ] Did I commit only the files that belong to this task group?
- [ ] Did I leave the repo in a state another clean session can understand?

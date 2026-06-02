# Station Detail Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich every mapped station detail with correct line tags, line-specific wheelchair/elevator metadata, fresh TTC accessibility outages, fresh directly linked station alerts, authored accessibility icons, and an explicit demo-arrivals source boundary.

**Architecture:** Extend `station_lines` with static accessibility booleans and complete its mapped stop coverage in Flyway. Add one JDBC station live-read repository over the existing normalized alert tables, then let `StationService` select fresh dynamic station records or fixture fallback records through the existing ingestion freshness gate. Keep the frontend API adapter fixture-capable and generate complete fallback station detail from the station catalog rather than maintaining a partial hand-written subset.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, Spring JDBC, Flyway, PostgreSQL, Next.js App Router, React, TypeScript, Node test runner, Playwright.

---

## File Structure

### Backend

- Create `backend/src/main/resources/db/migration/V10__station_line_accessibility.sql`: add line-specific facility columns, upsert complete mapped station-line membership, and encode reviewed CSV accessibility metadata.
- Create `backend/src/test/java/com/calebhabesh/linewatch/station/StationLineAccessibilityMigrationTest.java`: protect V10 coverage and Spadina differentiation.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/station/StationLineEntity.java`: map static accessibility columns.
- Create `backend/src/main/java/com/calebhabesh/linewatch/station/StationLiveReadRepository.java`: query active linked TTC outages and route alerts.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/station/StationResponses.java`: extend the station detail API projection.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/station/StationService.java`: freshness-gated live station assembly and complete source labeling.
- Modify `backend/src/test/java/com/calebhabesh/linewatch/station/StationServiceTest.java`: cover static metadata, fresh reads, stale suppression, and summary flags.
- Modify `backend/src/test/java/com/calebhabesh/linewatch/station/StationControllerTest.java`: keep the controller stub aligned with the response contract.

### Frontend

- Copy `frontend/public/assets/linewatch/wheel-chair-symbol.svg`: authored wheelchair asset.
- Copy `frontend/public/assets/linewatch/elevator-icon.svg`: authored elevator asset.
- Modify `frontend/src/app/station-data.ts`: add enriched types, fix all station line IDs, and generate detail fallback for every summary station.
- Modify `frontend/src/components/StationDetailPanel.tsx`: line-level facility rows, warning-state elevator icon, outage rows, direct station impact timestamps, and demo source label.
- Modify `frontend/tests/station-data.test.mjs`: cover complete fallback details and Spadina metadata.
- Modify `frontend/tests/station-panel-layout.test.mjs`: protect icon accessibility and warning markup.
- Modify `frontend/tests/smoke/api-stub-data.mjs`: add enriched station detail fixture.
- Modify `frontend/tests/smoke/api-stub.mjs`: serve `GET /api/stations/stub-station`.
- Modify `frontend/tests/smoke/dashboard.spec.ts`: verify station panel facilities and harden SVG ring stroke sampling.

### Documentation

- Modify `README.md`: describe implemented station enrichment and remaining demo-arrival boundary.
- Modify `AGENTS.md`: update current reality and suggested implementation order.
- Modify `GEMINI.md`: mirror `AGENTS.md`.

## Task 1: Add Complete Station-Line Accessibility Migration

**Files:**
- Create: `backend/src/test/java/com/calebhabesh/linewatch/station/StationLineAccessibilityMigrationTest.java`
- Create: `backend/src/main/resources/db/migration/V10__station_line_accessibility.sql`

- [ ] **Step 1: Write the failing migration contract test**

Create `StationLineAccessibilityMigrationTest` with assertions that V10:

```java
assertThat(sql).contains("add column wheelchair_accessible");
assertThat(sql).contains("add column has_elevator");
assertThat(sql).contains("on conflict (station_id, line_id) do update");
assertThat(sql).contains("('spadina', 'line-1', 'Northbound / Southbound', 1, false, false)");
assertThat(sql).contains("('spadina', 'line-2', 'Eastbound / Westbound', 2, true, true)");
assertThat(sql).contains("('kipling', 'line-2'");
assertThat(sql).contains("('don-mills', 'line-4'");
assertThat(sql).contains("('mount-dennis', 'line-5'");
assertThat(sql).contains("('humber-college', 'line-6'");
```

Count explicit tuples and assert the migration contains exactly `117` reviewed
mapped station-line rows, including both Spadina rows and all interchange rows.

- [ ] **Step 2: Run the migration test and verify RED**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=StationLineAccessibilityMigrationTest
```

Expected: FAIL because `V10__station_line_accessibility.sql` does not exist.

- [ ] **Step 3: Add V10**

Add:

```sql
alter table station_lines
    add column wheelchair_accessible boolean not null default false,
    add column has_elevator boolean not null default false;

insert into station_lines (
    station_id, line_id, platform_label, sort_order,
    wheelchair_accessible, has_elevator
) values
    ('spadina', 'line-1', 'Northbound / Southbound', 1, false, false),
    ('spadina', 'line-2', 'Eastbound / Westbound', 2, true, true)
on conflict (station_id, line_id) do update set
    platform_label = excluded.platform_label,
    sort_order = excluded.sort_order,
    wheelchair_accessible = excluded.wheelchair_accessible,
    has_elevator = excluded.has_elevator;
```

Expand that `values` clause to exactly `117` explicit tuples from
`~/Pictures/Assets/LineWatch/ttc_station_accessibility_lines_1_2_4_5_6.csv`
using station IDs already seeded in V1 and line membership authored in V7.
Use `Northbound / Southbound` for every Line 1 row and `Eastbound / Westbound`
for every Line 2, 4, 5, and 6 row. Duplicate the station-level CSV value across
interchange rows except for the two explicitly distinct Spadina records.
Do not read the CSV at application runtime.

- [ ] **Step 4: Run the migration test and verify GREEN**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=StationLineAccessibilityMigrationTest
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V10__station_line_accessibility.sql backend/src/test/java/com/calebhabesh/linewatch/station/StationLineAccessibilityMigrationTest.java
git commit -m "feat: seed station line accessibility"
```

## Task 2: Extend The Static Station API Contract

**Files:**
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/station/StationServiceTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/station/StationControllerTest.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/station/StationLineEntity.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/station/StationResponses.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/station/StationService.java`

- [ ] **Step 1: Write failing static accessibility tests**

Extend `StationServiceTest` so a constructed line:

```java
new StationLineEntity(
    1L, "union", "line-1", "Northbound / Southbound", 1, true, true
)
```

produces:

```java
assertThat(response.lines().getFirst().wheelchairAccessible()).isTrue();
assertThat(response.lines().getFirst().hasElevator()).isTrue();
assertThat(response.arrivalsSource()).isEqualTo("Demo estimates");
```

Update `StationControllerTest` stub expectations for the same response fields.

- [ ] **Step 2: Run station tests and verify RED**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=StationServiceTest,StationControllerTest
```

Expected: compilation FAIL because the entity constructor and response records do
not expose the new fields.

- [ ] **Step 3: Implement the minimal static contract**

Extend `StationLineEntity`:

```java
@Column(name = "wheelchair_accessible")
private boolean wheelchairAccessible;
@Column(name = "has_elevator")
private boolean hasElevator;
```

Add constructor parameters and getters. Extend `StationLineResponse`:

```java
boolean wheelchairAccessible,
boolean hasElevator
```

Add an empty outage list to `StationAccessResponse`, nullable `updatedAt` to
`StationImpactResponse`, and `arrivalsSource` to `StationDetailResponse`.

Update `StationService` mapping and controller test stubs. Existing fixture
responses use `List.of()` outages, `null` dynamic timestamps, and
`"Demo estimates"`.

- [ ] **Step 4: Run station tests and verify GREEN**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=StationServiceTest,StationControllerTest
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/station backend/src/test/java/com/calebhabesh/linewatch/station/StationServiceTest.java backend/src/test/java/com/calebhabesh/linewatch/station/StationControllerTest.java
git commit -m "feat: expose station line accessibility"
```

## Task 3: Add Fresh Dynamic Station Reads

**Files:**
- Create: `backend/src/main/java/com/calebhabesh/linewatch/station/StationLiveReadRepository.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/station/StationServiceTest.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/station/StationResponses.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/station/StationService.java`

- [ ] **Step 1: Write failing live-read service tests**

Mock `StationLiveReadRepository` and `IngestionFreshness`. Add focused tests:

```java
when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
when(liveReadRepository.findActiveOutagesByStationId("union")).thenReturn(List.of(
    new StationLiveReadRepository.FacilityOutage(
        "outage-union-elevator", "elevator", "Elevator outage",
        "Elevator is unavailable.", UPDATED_AT
    )
));
when(liveReadRepository.findActiveAlertsByStationId("union")).thenReturn(List.of(
    new StationLiveReadRepository.LinkedAlert(
        "ttc-route-union", "active-alert", "delay", "Station delay",
        "Trains are delayed at Union.", UPDATED_AT
    )
));
```

Assert:

```java
assertThat(response.access().status()).isEqualTo("outage");
assertThat(response.access().outages()).hasSize(1);
assertThat(response.impacts()).extracting(StationImpactResponse::id)
    .containsExactly("ttc-route-union");
```

Add a stale-ingestion test:

```java
when(ingestionFreshness.isDashboardFresh()).thenReturn(false);
```

Assert that no dynamic repository methods are invoked and fixture rows remain
the fallback source.

- [ ] **Step 2: Run station service tests and verify RED**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=StationServiceTest
```

Expected: compilation FAIL because `StationLiveReadRepository` and live response
types do not exist.

- [ ] **Step 3: Add the focused JDBC repository**

Create `StationLiveReadRepository` with `NamedParameterJdbcTemplate` and these
methods:

```java
List<FacilityOutage> findActiveOutagesByStationId(String stationId)
List<LinkedAlert> findActiveAlertsByStationId(String stationId)
Set<String> findStationIdsWithActiveOutages()
Set<String> findStationIdsWithActiveAlerts()
```

Query active rows joined through `accessibility_outage_stations` and
`alert_stations`. Project `coalesce(source_updated_at, updated_at)` as
`updated_at`. Sort by update time descending and then ID for deterministic
output.

- [ ] **Step 4: Assemble freshness-gated station details**

Inject `StationLiveReadRepository` and `IngestionFreshness` into
`StationService`.

When fresh:

```java
List<FacilityOutage> outages =
    liveReadRepository.findActiveOutagesByStationId(id);
List<LinkedAlert> alerts =
    liveReadRepository.findActiveAlertsByStationId(id);
```

Map outages to:

```java
new StationFacilityOutageResponse(
    outage.id(), outage.assetType(), outage.title(), outage.description(),
    outage.updatedAt(), "TTC Live Alerts"
)
```

Map linked alerts to dynamic station impacts with source `"TTC Live Alerts"`,
ISO `updatedAt`, and no stored relative label. When stale, preserve legacy
fixture repository reads and suppress all normalized live rows.

For summaries, use live repository station-ID sets while fresh and legacy
repositories while stale.

- [ ] **Step 5: Run station tests and verify GREEN**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=StationServiceTest,StationControllerTest
```

Expected: PASS.

- [ ] **Step 6: Run the backend suite**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/station backend/src/test/java/com/calebhabesh/linewatch/station
git commit -m "feat: read fresh station disruptions and outages"
```

## Task 4: Make Frontend Station Fallback Complete

**Files:**
- Modify: `frontend/tests/station-data.test.mjs`
- Modify: `frontend/src/app/station-data.ts`

- [ ] **Step 1: Write failing adapter tests**

Add assertions:

```js
assert.equal(
  Object.keys(fallbackStationDetails).length,
  fallbackStationSummaries.stations.length
);
assert.deepEqual(stationById("kipling").lineIds, ["line-2"]);
assert.deepEqual(stationById("don-mills").lineIds, ["line-4"]);
assert.deepEqual(stationById("mount-dennis").lineIds, ["line-5"]);
assert.deepEqual(stationById("humber-college").lineIds, ["line-6"]);

const spadina = fallbackStationDetails.spadina;
assert.deepEqual(
  spadina.lines.map(({ id, wheelchairAccessible, hasElevator }) => ({
    id, wheelchairAccessible, hasElevator
  })),
  [
    { id: "line-1", wheelchairAccessible: false, hasElevator: false },
    { id: "line-2", wheelchairAccessible: true, hasElevator: true },
  ]
);
```

- [ ] **Step 2: Run fixture tests and verify RED**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: FAIL because fallback detail is partial and lines lack accessibility
flags.

- [ ] **Step 3: Extend station types**

Add:

```ts
export type StationFacilityOutage = {
  id: string;
  assetType: "elevator" | "escalator";
  title: string;
  description: string;
  updatedAt: string;
  source: string;
};
```

Extend `StationLine` with `wheelchairAccessible` and `hasElevator`, extend
`StationAccess` with `outages`, extend `StationImpact` with optional
`updatedAt`, and add `arrivalsSource: "Demo estimates"` to `StationDetail`.

- [ ] **Step 4: Correct summaries and generate complete fallback detail**

Correct the summary line IDs for all mapped stops. Replace the partial hand
written `fallbackStationDetails` with a generated record derived from
`fallbackStationSummaries.stations`, a line-definition map, and reviewed
facility metadata keyed by `${stationId}:${lineId}`.

Generate:

```ts
export const fallbackStationDetails = Object.fromEntries(
  fallbackStationSummaries.stations.map((station) => [
    station.id,
    toFallbackStationDetail(station),
  ])
);
```

Every generated access object uses `outages: []`; every detail uses
`arrivalsSource: "Demo estimates"` and clearly labeled demo arrivals.

- [ ] **Step 5: Run fixture tests and verify GREEN**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/station-data.ts frontend/tests/station-data.test.mjs
git commit -m "feat: complete station fallback metadata"
```

## Task 5: Render Station Accessibility Icons And Outages

**Files:**
- Copy: `frontend/public/assets/linewatch/wheel-chair-symbol.svg`
- Copy: `frontend/public/assets/linewatch/elevator-icon.svg`
- Modify: `frontend/tests/station-panel-layout.test.mjs`
- Modify: `frontend/src/components/StationDetailPanel.tsx`

- [ ] **Step 1: Write failing panel tests**

Protect authored assets and accessible UI strings:

```js
assert.match(panelSource, /wheel-chair-symbol\.svg/);
assert.match(panelSource, /elevator-icon\.svg/);
assert.match(panelSource, /Wheelchair accessible/);
assert.match(panelSource, /Elevator available/);
assert.match(panelSource, /data-facility-warning/);
assert.match(panelSource, /formatRelativeImpactTime/);
```

- [ ] **Step 2: Run panel tests and verify RED**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: FAIL because the panel does not render the authored assets.

- [ ] **Step 3: Copy authored SVG assets**

Run:

```bash
cp ~/Pictures/Assets/LineWatch/wheel-chair-symbol.svg frontend/public/assets/linewatch/wheel-chair-symbol.svg
cp ~/Pictures/Assets/LineWatch/elevator-icon.svg frontend/public/assets/linewatch/elevator-icon.svg
```

- [ ] **Step 4: Update the station panel**

Render each served line as a line row with facility labels. Render authored SVG
icons only for available facilities. If any access outage has
`assetType === "elevator"`, add:

```tsx
data-facility-warning="elevator"
```

to visible elevator icons and use an amber warning treatment. Render each
facility outage with title, description, source, and:

```tsx
formatRelativeImpactTime(outage.updatedAt)
```

Use the same timestamp formatter for live station impacts when `updatedAt`
exists, otherwise preserve fixture `updatedAgo`. Keep the explicit
`station.arrivalsSource` label.

- [ ] **Step 5: Run frontend checks and verify GREEN**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/public/assets/linewatch frontend/src/components/StationDetailPanel.tsx frontend/tests/station-panel-layout.test.mjs
git commit -m "feat: show station accessibility facilities"
```

## Task 6: Cover Station Panel With Playwright

**Files:**
- Modify: `frontend/tests/smoke/api-stub-data.mjs`
- Modify: `frontend/tests/smoke/api-stub.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Write the enriched smoke fixture and failing smoke assertion**

Add `stationDetailResponse` with one wheelchair-accessible Line 1 row, one
elevator facility, one active elevator outage, and `"Demo estimates"`. Serve it:

```js
if (request.method === "GET" && url.pathname === "/api/stations/stub-station") {
  sendJson(response, 200, stationDetailResponse);
  return;
}
```

In `dashboard.spec.ts`, click `Stub Station station details` and assert:

```ts
await expect(page.getByLabel("Stub Station station details")).toBeVisible();
await expect(page.getByText("Wheelchair accessible", { exact: true })).toBeVisible();
await expect(page.getByText("Elevator available", { exact: true })).toBeVisible();
await expect(page.locator('[data-facility-warning="elevator"]')).toBeVisible();
await expect(page.getByText("Demo estimates", { exact: true })).toBeVisible();
```

- [ ] **Step 2: Run smoke tests and verify RED**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: FAIL before the fixture route or panel UI is complete.

- [ ] **Step 3: Harden ring test sampling**

The dashed SVG ring smoke helper is intermittently sparse at mobile scale.
Replace eight fixed angles with five-degree sampling:

```ts
const candidates = Array.from({ length: 72 }, (_, index) => index * 5)
  .flatMap((degrees) => {
    const radians = degrees * Math.PI / 180;
    return [0.72, 0.84, 0.96].map((scale) => ({
      x: center.x + Math.cos(radians) * box!.width * scale / 2,
      y: center.y + Math.sin(radians) * box!.height * scale / 2,
    }));
  });
```

- [ ] **Step 4: Run smoke tests and verify GREEN**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS on desktop and mobile projects.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/smoke
git commit -m "test: cover enriched station panel"
```

## Task 7: Align Documentation

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Update current-reality documentation**

Document:

- Every mapped Line 1, 2, 4, 5, and 6 stop has a station-line tag.
- Station detail shows reviewed wheelchair/elevator metadata with authored icons.
- Fresh directly linked TTC station alerts and accessibility outages are visible.
- Stale ingestion suppresses normalized station reads.
- Arrivals remain demo-only estimates.
- Nightly closure active-window gating is the next feature slice.

Keep `AGENTS.md` and `GEMINI.md` identical.

- [ ] **Step 2: Verify instruction mirror**

Run:

```bash
cmp -s AGENTS.md GEMINI.md
```

Expected: exit code `0`.

- [ ] **Step 3: Commit**

```bash
git add README.md AGENTS.md GEMINI.md
git commit -m "docs: describe enriched station detail"
```

## Task 8: Full Verification

- [ ] **Step 1: Run backend suite**

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 2: Run frontend fixture checks**

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 3: Build frontend**

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 4: Run browser smoke tests**

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS on desktop and mobile projects.

- [ ] **Step 5: Inspect worktree**

```bash
git status --short
git log --oneline --decorate -12
```

Expected: clean worktree with focused commits for this slice.

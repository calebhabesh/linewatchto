# LineWatchTO Remaining Slices Handoff (Historical Archive)

> [!NOTE]
> **Historical Archive (June 2, 2026)**
> This handoff document records the remaining feature slice plan as established on **June 2, 2026**.
> All core slices described here (Nightly closure active-window gating, Live rapid transit arrivals, GTFS geometry matching, Commute impact matching, and Redis caching) plus account authentication, Web Push, and regional GO/UP expansion have been fully implemented, verified, and integrated into the application.
>
> **Active Entry Points:**
> - [README.md](README.md) — Current product capabilities, architecture, and quickstart.
> - [AGENTS.md](AGENTS.md) — Unified agent guide and task routing.
> - [docs/refactor-plan/README.md](docs/refactor-plan/README.md) — Current refactoring plan, architecture cleanup, and handoffs.
> - [docs/feature-reference.md](docs/feature-reference.md) — Comprehensive feature reference.

## Historical Session Prompt (Archived)

The prompt below is preserved for historical reference only. Current development should consult [AGENTS.md](AGENTS.md) and [docs/refactor-plan/README.md](docs/refactor-plan/README.md).

```text
You are working on LineWatchTO, an unofficial transit reliability dashboard.
Read AGENTS.md, README.md, and docs/refactor-plan/README.md.
Run git status --short --branch before editing. Preserve all existing user changes.
Follow the active plan chunk in docs/refactor-plan/ and verify with the documented suites.
```

## Snapshot Baseline

At the time this handoff was refreshed:

- Working branch: `main`
- Committed baseline: `7e91c5b style(frontend): layout cause field inline to prevent wrapping`
- The previous Gemini UI-polish batch has been reviewed and committed.
- The next incomplete product slice is nightly closure active-window gating.

## Current Local-Change Policy

The previous uncommitted UI batch has been committed on `main`. Still run
`git status --short --branch` before edits and preserve any new local user work.
Do not use reset or checkout to clean the tree unless the user explicitly asks.

## Already Completed

Do not reimplement these original-request items:

- [x] Separate ordinary delays from explicit Reduced Speed Zones.
- [x] Add the delay submenu and orange static-effect map overlay.
- [x] Use source `activePeriod.start` and TTC `lastUpdated` timestamps.
- [x] Interpret `Both ways` case-insensitively with line-aware cardinal labels.
- [x] Make segment overlays and single-station impact rings clickable/tappable.
- [x] Verify nonlinear SVG guides and single-station overlay interactions.
- [x] Add richer alert and Reduced Speed Zone card metadata.
- [x] Populate every mapped stop with line-specific accessibility metadata.
- [x] Distinguish Line 1 and Line 2 Spadina accessibility values.
- [x] Show authored wheelchair and elevator icons in station details.
- [x] Show fresh directly linked TTC station alerts and elevator/escalator
      outages while suppressing stale ingestion data.

## Remaining Slice Order

### Slice 1: Nightly Closure Active-Window Gating

Priority: next backend feature slice.

Goal: keep planned nightly closure cards visible as upcoming notices, but only
treat a nightly closure as currently active during its actual child-period
window. Outside that window, it must not appear as a current commute disruption
or automatic active overlay. A deliberate user-triggered blue map preview may
still show the planned path before the window begins.

Existing foundation:

- `TtcAlertNormalizer` already maps `childAlerts` into
  `NormalizedAlertPeriod`.
- `TtcAlertStore` already persists those rows in `alert_active_periods`.
- `AlertDashboardService.plannedClosures()` currently checks only the parent
  `activePeriodEnd`; it does not evaluate child periods against the current
  clock.

Likely code surfaces:

```text
backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java
backend/src/main/java/com/calebhabesh/linewatch/alert/AlertEntity.java
backend/src/main/java/com/calebhabesh/linewatch/alert/AlertRepository.java
backend/src/main/java/com/calebhabesh/linewatch/ingestion/NormalizedAlertPeriod.java
backend/src/main/java/com/calebhabesh/linewatch/ingestion/TtcAlertStore.java
backend/src/main/resources/db/migration/
frontend/src/app/linewatch-data.ts
frontend/src/components/PlannedClosuresPanel.tsx
frontend/src/components/InteractiveTtcMap.tsx
frontend/tests/smoke/
```

Acceptance criteria:

- [ ] Persisted child periods are queryable from the dashboard read layer.
- [ ] Closure DTOs distinguish upcoming, active-now, and nightly notices.
- [ ] Nightly cards expose a clear active or next-window label.
- [ ] Current-status consumers use active child periods, not the broad parent
      date range.
- [ ] Automatic closure indicators appear only during an active child period.
- [ ] Manual closure preview remains available for upcoming cards.
- [ ] Clock-based backend tests cover before, during, between, and after nightly
      windows.
- [ ] Fixture and smoke coverage protect the card and map behavior.
- [ ] README claims reflect working code; agent guidance changes only when durable rules change.

### Slice 2: Public Live Station Arrivals

Dependency: complete Slice 1 first. Research the provider at implementation time
because availability, terms, and payloads can change.

Goal: replace station-panel demo estimates with source-labeled predictions from
a public provider while retaining an honest fallback when the provider is
missing, stale, or unavailable.

Existing foundation:

- `GET /api/stations/{id}` already returns `arrivals` and `arrivalsSource`.
- `StationService` currently constructs explicitly labeled demo estimates.
- `StationDetailPanel` visibly labels the source boundary.

Likely code surfaces:

```text
backend/src/main/java/com/calebhabesh/linewatch/station/StationService.java
backend/src/main/java/com/calebhabesh/linewatch/station/StationResponses.java
backend/src/main/java/com/calebhabesh/linewatch/arrival/
backend/src/test/java/com/calebhabesh/linewatch/station/
frontend/src/app/station-data.ts
frontend/src/components/StationDetailPanel.tsx
```

Acceptance criteria:

- [ ] Document the selected public source, attribution, limitations, and stale
      threshold.
- [ ] Add a focused provider adapter behind a station-arrival service.
- [ ] Map provider stop identifiers to existing mapped station-line rows.
- [ ] Return prediction timestamps or minutes, direction, line, source, and
      freshness metadata.
- [ ] Keep demo or unavailable-state fallback visibly labeled; never present
      estimates as TTC predictions.
- [ ] Add provider success, stale, malformed-response, and outage tests.
- [ ] Add station-panel fixture and smoke coverage.

### Slice 3: Static GTFS Import And Production Segment Matching

Dependency: may begin after Slice 2, but split this into multiple focused plans.

Goal: replace seeded topology-only matching with imported static TTC GTFS route,
stop, trip, and shape data plus populated PostGIS geometry. Keep authored SVG
anchors for rendering while using imported data for production matching.

Recommended sub-slices:

1. GTFS schema and idempotent importer for supported rapid-transit routes.
2. PostGIS station, segment, and shape geometry population.
3. Alert-to-station and alert-to-segment production matcher with explicit
   confidence/fallback behavior.
4. Rendering projection from production segment matches to authored SVG paths.

Likely code surfaces:

```text
backend/src/main/java/com/calebhabesh/linewatch/gtfs/
backend/src/main/java/com/calebhabesh/linewatch/alert/AlertSegmentMatcher.java
backend/src/main/java/com/calebhabesh/linewatch/station/
backend/src/main/resources/db/migration/
frontend/src/app/map-geometry.ts
frontend/src/app/transit-map.tsx
```

Acceptance criteria:

- [ ] Import is repeatable and scoped to supported Lines 1, 2, 4, 5, and 6.
- [ ] Geographic geometry is populated and queryable in PostGIS.
- [ ] Existing nonlinear SVG guides continue to render correctly.
- [ ] Segment inference reports uncertainty instead of inventing precision.
- [ ] Seeded fixture mode remains available for tests and offline demos.
- [ ] Importer, migration, matcher, and map smoke tests pass.

### Slice 4: Saved Commute Impact API

Dependency: implement after production segment matching so route impact answers
are based on stable topology.

Goal: replace fixture-only saved commute cards with backend impact evaluation for
an origin and destination.

Planned boundary:

```text
POST /api/commutes/impact
```

Likely code surfaces:

```text
backend/src/main/java/com/calebhabesh/linewatch/commute/
frontend/src/app/page.tsx
frontend/src/app/linewatch-data.ts
frontend/src/components/SavedCommutesPanel.tsx
```

Acceptance criteria:

- [ ] Evaluate active suspensions, delays, Reduced Speed Zones, and active
      nightly closure windows along a commute corridor.
- [ ] Return affected segments, source alert IDs, severity, and an explanation.
- [ ] Keep saved commute persistence out of scope unless separately designed.
- [ ] Preserve fixture fallback when the backend request fails.
- [ ] Add backend service tests and frontend smoke coverage.

### Slice 5: Reliability Aggregation

Dependency: alert snapshots already exist; production matching improves the
quality of corridor metrics.

Goal: replace fixture reliability rows with measured line and station summaries
derived from historical snapshots.

Planned boundaries:

```text
GET /api/reliability/lines
GET /api/reliability/stations/{id}
```

Likely code surfaces:

```text
backend/src/main/java/com/calebhabesh/linewatch/reliability/
backend/src/main/resources/db/migration/
frontend/src/app/page.tsx
frontend/src/components/ReliabilityPanel.tsx
```

Acceptance criteria:

- [ ] Define metric formulas and time windows in documentation.
- [ ] Aggregate disruption frequency and duration from persisted snapshots.
- [ ] Separate suspensions, ordinary delays, Reduced Speed Zones, and planned
      closures where the metric requires it.
- [ ] Expose line summaries and station history through the planned endpoints.
- [ ] Label insufficient-history states honestly.
- [ ] Add deterministic aggregation tests and frontend fallback coverage.

### Slice 6: Redis-Backed Live Status Cache

Dependency: add after live read contracts are stable.

Goal: cache frequently requested current dashboard reads without weakening stale
ingestion suppression or database fallback.

Likely code surfaces:

```text
backend/src/main/java/com/calebhabesh/linewatch/cache/
backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java
backend/src/main/java/com/calebhabesh/linewatch/status/StatusController.java
backend/src/main/java/com/calebhabesh/linewatch/map/MapController.java
backend/src/main/resources/application.yml
docker-compose.yml
```

Acceptance criteria:

- [ ] Cache status, alert, and map read models with bounded TTLs.
- [ ] Invalidate or replace cached reads after successful ingestion writes.
- [ ] Never serve cached impacts beyond the dashboard freshness window.
- [ ] Continue serving database-backed reads when Redis is unavailable.
- [ ] Add hit, miss, expiry, invalidation, and Redis-outage tests.

## Secondary Backlog

Design these after the core slices unless a user explicitly reprioritizes them:

- [ ] Improve upcoming-closure card date hierarchy and closure-overlay visual
      clarity after nightly gating lands.
- [ ] Add a line-status drawer with an extended stop list.
- [ ] Add an integrated static help/legend widget for map effects and cardinal
      direction interpretation.
- [ ] Classify station emergencies only when a public source explicitly
      provides the category. Keep source wording intact; do not infer police,
      fire, or track incidents from vague text.
- [ ] Evaluate TTC Reduced Speed Zones webpage ingestion only if the Live Alerts
      feed proves incomplete.
- [ ] Add deployment, published build/test metrics, and production environment
      documentation.
- [ ] Treat authentication as post-v1 unless a separate product requirement
      introduces user-owned saved commutes or preferences. The current README
      intentionally lists user accounts and passwords as out of scope for v1.

## Verification Gates

Frontend-only slice:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Substantial frontend slice:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

Backend slice:

```bash
mvn -f backend/pom.xml test
```

Cross-stack slice:

```bash
mvn -f backend/pom.xml test
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:smoke
```

## Slice Completion Rules

For every slice:

- [ ] Preserve unrelated local changes.
- [ ] Create a focused design spec under `docs/superpowers/specs/`.
- [ ] Create a focused implementation plan under `docs/superpowers/plans/`.
- [ ] Use a dedicated worktree after Slice 0 has been checkpointed.
- [ ] Write the smallest meaningful failing test before behavior changes where
      practical.
- [ ] Run and read the relevant verification gate.
- [ ] Keep `README.md` claims aligned with working code; update scoped `AGENTS.md` only for durable rule changes.
- [ ] Merge the verified slice, remove its temporary worktree, and delete the
      merged feature branch.
- [ ] Refresh this handoff baseline and mark the completed slice before starting
      the next clean-context session.

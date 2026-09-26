# Backend refactor chunks

Read the [index](README.md), [backend guide](../../backend/AGENTS.md), and the
affected section of [domain invariants](../domain-invariants.md). All evidence
is from the baseline commit. Java paths below link to their actual owners.
Use [verification](01-verification.md) for common gates.

## B1 — One owner for push candidate routing

**Evidence:** [PushNotificationService](../../backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java),
lines 584–613, and [PushNotificationDispatchService](../../backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDispatchService.java),
lines 346–375, duplicate commute planner selection, TTC/regional line
partitioning, and null/explicit planned-closure follow-up policy handling.
The first path supports active-notification cleanup; the second sends them.

**Change:** extract a small `PushCandidateResolver` with methods for a commute
and an account's subscribed lines. Move the duplicated policy routing into it
and use it from both callers. Retain planners as distinct implementations;
freshness checks, preference filters, observation state, and delivery transport
remain with their existing owners.

**Acceptance:** TTC-only, regional-only and mixed subscriptions produce the
same candidate identities and ordering. Null policy and each explicit policy
preserve current defaults. Cleanup and dispatch resolve equivalent inputs the
same way. Run `PushNotificationServiceTest`,
`PushNotificationDispatchServiceTest`, `SavedCommutePushPlannerTest`,
`LineSubscriptionPushPlannerTest`, and `RegionalLineSubscriptionPushPlannerTest`.

**Done:** both callers use one routing implementation; no new generic push
framework or changes to notification eligibility. Risk: moderate.

## B2 — Remove test-created missing-dependency states

Depends on B1. **Evidence:** package constructors in the same service (line 94)
and dispatch service (line 104) pass null regional/lifecycle collaborators.
Tests call these constructors, while Spring uses full construction. Runtime
branches accommodate these nulls, including service lines 542/559/603 and
dispatch lines 190/218/771.

**Change:** first inventory constructor callers, Spring wiring, conditional
beans, and configuration. If absence is unsupported, use complete construction
and update test fixtures to supply explicit fakes/mocks. Remove only null
fallbacks justified by that proof. A configured but disabled provider still
needs its normal disabled/freshness behavior.

**Acceptance:** verify Spring wiring and push tests with TTC stale/regional
fresh, the reverse, both stale, lifecycle persistence, invalid subscription,
ownership, and receipt-token checks. Test fixtures must exercise production
construction. Existing stored preference defaults and retained notification
identities remain compatible.

**Done:** supported construction paths are explicit and tests no longer force
impossible production states. If conditional wiring proves absence legitimate,
retain that case and document it. Risk: moderate; conditional cleanup.

## B3 — Extract the bounded push diagnostics read

**Evidence:** [PushNotificationService](../../backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java),
line 363, loads 50 deliveries, joins client events and groups recipients;
lines 672/713/747/808 build diagnostic timelines and explanations. Registration,
receipts, preferences, device health, and cleanup also live in this class.

**Change:** a `PushDeliveryDiagnosticsService.forAccount(accountId)` owns the
bounded queries and read projection. Keep mutation and dispatch untouched in
this chunk. Move helpers only if their callers belong to the diagnostic read;
retain shared device-health rules in one existing owner.

**Acceptance:** preserve response fields, account scoping, 50-delivery cap,
ordering, missing recipients, lifecycle information and unattempted reasons.
Move/reuse the behavior cases in `PushNotificationServiceTest` around lines
590/678/760; ensure a different account cannot read these records.

**Done:** diagnostic reads have a cohesive owner and callers delegate without
duplicating projection logic. Risk: low to moderate.

## B4 — Isolate canonical TTC closure projection

**Evidence:** [AlertDashboardService](../../backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java),
line 172, loads canonical parents/periods and resolves exact child identities;
line 407 evaluates time windows; line 505 onward formats display text;
lines 768/825 construct DTOs and titles. Active cards, map impacts, status,
station details and full dashboard assembly consume this work.

**Change:** introduce a pure `TtcClosureProjector` accepting loaded records,
periods, reviewed segment inputs, and an explicit evaluation time. Return
canonical projections with temporal state and active-child identity sufficient
for current/planned output. Repository access and provider freshness remain
outside the calculation. Keep tightly related formatting together rather than
creating one class per formatter.

First characterize current outputs at a fixed clock; then extract, preserving
ordering and JSON. Moving clock reads to one supplied instant needs explicit
start/end boundary tests so a cleaner interface does not conceal a temporal
behavior change.

**Acceptance:** exact parent-period matching; standalone child vs projected
child; canonical parent link; overlapping/nightly windows; start/end instants;
restoration and malformed/publication-envelope filtering; direction and ordering.
Reuse `AlertDashboardServiceTest` cases around lines 785/892/1070/1139/1275/1408/1785.
Compare dashboard/map/status output from the same fixtures and clock.

**Done:** closure identity and temporal projection can be tested without HTTP
or repository mocks, and surfaces consume the same rules. Risk: high semantic
sensitivity; this is not a change to source interpretation.

## B5 — Service ownership for TTC dashboard assembly

Depends on B4 for shared evaluation. **Evidence:**
[DashboardController](../../backend/src/main/java/com/calebhabesh/linewatch/dashboard/DashboardController.java),
line 93, calls other controllers plus four alert projections.
[MapController](../../backend/src/main/java/com/calebhabesh/linewatch/map/MapController.java),
line 76, reads segment and station impacts separately;
[StatusController](../../backend/src/main/java/com/calebhabesh/linewatch/status/StatusController.java),
line 75, reads freshness and alerts again. `AlertDashboardService` lines 260/323
repeat alert/segment loading. Existing controller caches have separate policies.

Split implementation into two reviewed chunks:

1. Move map/status/performance response assembly behind application service
   methods. Both standalone endpoints and the full-dashboard owner call those
   methods. Preserve cache placement, keys, TTLs, invalidation, and JSON first.
   **Done:** controllers no longer act as each other's internal service.
2. Introduce an evaluation-scoped TTC input/read model: captured time/freshness,
   loaded alerts/segments/periods, reusable B4 projections. Reuse it within a
   full-dashboard cache miss. Measure repeated repository reads before and
   after. Retain standalone endpoint behavior. **Done:** repeated projection
   work is removed without promoting request data to a stale global cache.

Reuse evaluation inputs only for builders actually recomputed on cache misses.
Preserve nested map/status cache hits rather than bypassing them to force a
unified snapshot. If useful reuse requires different cache semantics, complete
the service extraction and defer shared evaluation for that separate decision.

**Acceptance:** `DashboardControllerTest`, `MapControllerTest`,
`StatusControllerTest`, alert projection and `DashboardCacheServiceTest`;
available/degraded/stale/disabled modes, closure boundaries, cache hit/miss,
Redis outage fallback, and successful-ingestion invalidation. Capture fixed
input JSON parity and query counts. Latency claims need actual measurements.

Cache-policy changes or a new consistency guarantee are a separate decision.
Do not collapse TTC/regional freshness or independently configured lifetimes
as a side effect. Risk: high across public read surfaces.

## B6 — Stream regional schedule departures into persistence

Independent corrective checkpoint. **Evidence:**
[RegionalGtfsScheduleImportService](../../backend/src/main/java/com/calebhabesh/linewatch/regional/RegionalGtfsScheduleImportService.java),
lines 46/102/113, retains every departure before constructing the import;
[RegionalGtfsScheduleImport](../../backend/src/main/java/com/calebhabesh/linewatch/regional/RegionalGtfsScheduleImport.java)
copies the list. [RegionalGtfsScheduleRepository](../../backend/src/main/java/com/calebhabesh/linewatch/regional/RegionalGtfsScheduleRepository.java),
lines 25/66, batches an already materialized list. The documented import
memory bound is therefore not enforced for departure rows; no OOM was observed.

**Change:** retain necessary mapped metadata, stream departures through a
regional writer in batches of at most 1,000, validate counts/coverage, and
activate only after successful completion. Use the transactional pattern in
[GtfsScheduleImportWriter](../../backend/src/main/java/com/calebhabesh/linewatch/arrival/schedule/GtfsScheduleImportWriter.java),
including rollback on checked parse failures. Keep GO/UP source scopes and
existing retention/activation semantics. Expose read queries separately only
where needed to make write ownership clear; a universal GTFS importer is not
justified.

**Acceptance:** GO filtering, UP directions, trip numbers, ordered stops,
parent stops, exceptions, >24:00 departures; a generated fixture with more than
2,000 mapped departures verifies bounded batches and output equivalence. A
documented realistic import must fit the 1 GB heap requirement.

Inject late parsing and database failures against isolated PostgreSQL. Prove
the old active import remains readable, partial rows are not activated, and
the other source is untouched. Test success and competing refresh/activation
behavior if the current job can overlap. Preserve Flyway history; this design
should not need a schema change merely to stream rows.

Existing `RegionalGtfsScheduleImportServiceTest` captures whole-list `replace`
arguments; `RegionalGtfsScheduleMigrationTest` checks SQL strings. Neither is
the required rollback gate. Add a real integration check and document its
reproducible command/isolated database setup. A passing mock suite is insufficient.

**Done:** bounded departure retention plus verified atomic activation. Risk:
high persistence sensitivity; review separately from structural cleanup.

## Retain unless new evidence warrants work

TTC's existing streaming importer, Flyway history, provider-specific
normalizers, independent freshness, and last-good data behavior already encode
useful constraints. Push observation/baseline state, identity migration,
accepted retries and legacy display tags protect installed behavior. Large
regional catalogs or reliability SQL are not bloat merely because they are
long. Query/index/concurrency changes need workload and query-plan evidence.

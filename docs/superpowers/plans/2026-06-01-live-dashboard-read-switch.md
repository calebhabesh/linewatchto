# Live Dashboard Read Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch `/api/alerts`, `/api/status`, and `/api/map` to normalized TTC alert records while keeping fixture fallback available for demos and offline backend rendering.

**Architecture:** Add a focused dashboard read service in the alert package that maps active `alerts` rows into the frontend DTO contract and computes affected map segments once. Controllers delegate to that service instead of parsing station IDs or duplicating type logic. The ingestion foundation continues to write `active-alert` and `planned-closure`; the dashboard layer translates those internal types into active alert and planned closure responses.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA repositories, JUnit 5, AssertJ, Mockito.

---

## Scope Guardrails

Do not change TTC feed polling, raw staging, accessibility outage normalization, station-detail APIs, frontend UX, GTFS import, Redis caching, or reliability aggregation in this slice.

Preserve existing uncommitted work in the checkout. Where current controller edits are replaced, keep the intended behavior but move it behind tested services.

## File Map

- Create `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertDashboardService.java`: maps normalized `AlertEntity` records to active-alert and planned-closure DTOs.
- Create `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertSegmentMatcher.java`: converts alert line/station bounds to seeded map segment IDs.
- Create `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertSegmentMatcherTest.java`: proves direct and bounded segment matching behavior.
- Create or modify `backend/src/test/java/com/calebhabesh/linewatch/alert/AlertDashboardServiceTest.java`: proves `active-alert` and `planned-closure` records produce frontend DTOs.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/alert/AlertController.java`: delegate to the dashboard service.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/map/MapController.java`: delegate overlay assignment to the dashboard service.
- Modify `backend/src/main/java/com/calebhabesh/linewatch/status/StatusController.java`: query `active-alert`, not `live`, and avoid claiming live ingestion when there is no successful ingestion metadata.
- Modify `backend/src/test/java/com/calebhabesh/linewatch/status/StatusControllerTest.java`: align status expectations with normalized live-read behavior.

## Task 1: Segment Matching

- [ ] Write `AlertSegmentMatcherTest` first.
- [ ] Verify it fails because `AlertSegmentMatcher` does not exist.
- [ ] Implement `AlertSegmentMatcher` with exact adjacent matching and ordered bounded matching across seeded segments on the same line.
- [ ] Verify the matcher test passes.

## Task 2: Alert Dashboard DTO Mapping

- [ ] Write `AlertDashboardServiceTest` for active alerts and planned closures using mocked repositories.
- [ ] Verify it fails because `AlertDashboardService` does not exist.
- [ ] Implement `AlertDashboardService` with fixture fallback only when explicitly asked by controllers.
- [ ] Verify the service test passes.

## Task 3: Controller Wiring

- [ ] Update `AlertController` to return service DTOs for default and `type=planned`.
- [ ] Update `MapController` to apply active-alert overlays from service segment impact data.
- [ ] Update `StatusController` to classify lines from active normalized records.
- [ ] Run focused controller/service tests and fix regressions.

## Task 4: Verification

- [ ] Run `mvn -f backend/pom.xml test`.
- [ ] Run frontend fixture/type/lint checks only if frontend files change.
- [ ] Report exact commands and any failures.

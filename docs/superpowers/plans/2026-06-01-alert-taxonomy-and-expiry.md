# Alert Taxonomy And Expiry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate no-service disruptions from slowdowns and stop showing expired scheduled closures in dashboard and station detail surfaces.

**Architecture:** Keep the normalized backend schema unchanged. Add dashboard read filters so `/api/alerts` returns only active no-service alerts, `/api/alerts?type=slowdown` returns degraded-service alerts, and `/api/alerts?type=planned` excludes expired planned closures. Add a small frontend Slowdowns panel wired to the new endpoint and update fixture station impacts to avoid stale Jane/Ossington closure data.

**Tech Stack:** Java 21, Spring Boot, JUnit 5, AssertJ, Mockito, Next.js App Router, React, TypeScript, Node test runner.

---

## Task 1: Backend Alert Taxonomy

- [ ] Add failing tests in `AlertDashboardServiceTest` proving active alerts exclude `delay`, slowdowns include `delay`, and expired planned closures are filtered by `activePeriodEnd`.
- [ ] Add failing `AlertControllerTest` coverage for `type=slowdown`.
- [ ] Implement `slowdowns()` and active/planned filtering in `AlertDashboardService`.
- [ ] Wire `AlertController` to return `slowdowns()` for `type=slowdown`.

## Task 2: Backend Map And Status Semantics

- [ ] Update map impact tests so delay overlays come from slowdowns and suspensions remain active-alert overlays.
- [ ] Keep status line classification using normalized `active-alert`, but verify delay status still appears from slowdown records.
- [ ] Run focused backend tests.

## Task 3: Frontend Slowdowns Surface

- [ ] Add fixture and type support for `slowdowns`.
- [ ] Add `SlowdownsPanel` with amber styling based on the active-alert panel pattern.
- [ ] Add a `Slowdowns` menu item and fetch `/api/alerts?type=slowdown`.
- [ ] Update map overlay composition so active alerts and slowdowns can both paint segments.

## Task 4: Stale Station Impact Cleanup

- [ ] Remove stale Jane/Ossington scheduled weekend closure language from seeded/fallback station impacts.
- [ ] Keep active station-impact examples limited to current no-service demo data or clearly labeled fallback demo data.

## Task 5: Verification

- [ ] Run `mvn -f backend/pom.xml test`.
- [ ] Run `npm --prefix frontend run test:fixtures`.
- [ ] Run `npm --prefix frontend run typecheck`.
- [ ] Run `npm --prefix frontend run lint`.

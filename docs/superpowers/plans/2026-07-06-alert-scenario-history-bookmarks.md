# Alert Scenario History Bookmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `all-alert-types` scenario use curated real TTC Live Alerts payloads where available, with modeled gap-fill records only for alert shapes not covered by history.

**Architecture:** Keep the dev/test scenario server deterministic by using committed bookmark fixtures and rebasing timestamps once per server process. Preserve the existing generated TTC-shaped feed files and add metadata outside the feed payload so tests can distinguish synthetic-template coverage from modeled gap-fill coverage.

**Tech Stack:** Node.js ESM scripts, Java 21/Spring Boot ingestion tests, Node built-in test runner, JSON fixtures.

---

### Task 1: Catalog Contract Tests

**Files:**
- Modify: `frontend/tests/alert-scenario-catalog.test.mjs`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/ingestion/TtcAlertScenarioCatalogTest.java`

- [ ] Add frontend assertions that `all-alert-types` exposes a `coverageMatrix`, contains both `synthetic-template` and `modeled-gap-fill` source kinds, and maps required alert shapes to source IDs.
- [ ] Add backend assertions that every generated scenario record parses and normalizes after timestamp rebasing.
- [ ] Run `npm --prefix frontend run test:fixtures` and confirm the new frontend catalog assertions fail before implementation.

### Task 2: Historical Bookmark Fixtures

**Files:**
- Create: `scripts/alert-scenario-templates.mjs`
- Modify: `scripts/alert-scenario-catalog.mjs`

- [ ] Move the current sample real TTC records into `alert-scenario-templates.mjs` as typed exported objects.
- [ ] Add metadata for source kind, coverage tags, and source IDs.
- [ ] Add modeled gap-fill helpers that copy the real TTC field shape and override only the coverage-specific fields.

### Task 3: Stable Timestamp Rebasing

**Files:**
- Modify: `scripts/alert-scenario-catalog.mjs`
- Modify: `scripts/mock-alerts-server.mjs`

- [ ] Add a rebase helper that shifts `lastUpdated`, parent `activePeriod`, and `childAlerts` relative to a fixed or startup `now`.
- [ ] Make generated fixtures use the existing fixed `now`.
- [ ] Make the mock server build its scenario feed once at startup and serve that stable payload for every `/live-alerts` request.

### Task 4: Fixture Regeneration And Documentation

**Files:**
- Regenerate: `backend/src/test/resources/fixtures/ttc-alert-scenarios/*.json`
- Modify: `README.md`

- [ ] Run `node scripts/generate-alert-scenarios.mjs`.
- [ ] Update README scenario harness wording to describe curated synthetic-template bookmarks and modeled gap-fill records.
- [ ] Run backend and frontend fixture checks.

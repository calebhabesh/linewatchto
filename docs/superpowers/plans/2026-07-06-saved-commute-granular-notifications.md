# Saved Commute Granular Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add account-backed per-saved-commute notification rules for selected days, time windows, event types, and monitored route sections.

**Architecture:** Store notification rules on each saved commute so the Saved Commutes feature owns granular targeting. Keep global push preferences as account/device master controls. The saved-commute planner must continue observing all route-visible current impacts for lifecycle correctness, but only deliver new active notifications when the commute rule allows the current event.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, Flyway, PostgreSQL, Next.js App Router, React, TypeScript, Node built-in tests, Maven.

---

### Task 1: Backend Rule Contract And Persistence

**Files:**
- Create: `backend/src/main/resources/db/migration/V36__saved_commute_notification_rules.sql`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteEntity.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/AccountResponses.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/account/SavedCommuteController.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/account/SavedCommuteServiceTest.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/account/SavedCommuteControllerTest.java`

- [ ] Write failing tests proving saved commute responses include a default all-days/all-day notification rule.
- [ ] Write failing tests proving create accepts a notification rule with weekday/time/event filters.
- [ ] Write failing tests proving an authenticated account can update an existing commute notification rule without changing the route.
- [ ] Add the Flyway migration columns on `saved_commutes`.
- [ ] Add entity fields, default rule response mapping, validation, create request support, and update service/controller endpoint.
- [ ] Run `mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.account.SavedCommuteServiceTest,com.calebhabesh.linewatch.account.SavedCommuteControllerTest'`.

### Task 2: Push Planner Filtering Without False Clearances

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationCandidate.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/SavedCommutePushPlanner.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlanner.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDispatchService.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/push/SavedCommutePushPlannerTest.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java`

- [ ] Write failing tests proving a current impact outside the commute time window is still represented as a route-visible candidate, but has `deliveryAllowed=false`.
- [ ] Write failing tests proving a monitored section suppresses delivery for impacts outside that section.
- [ ] Write failing tests proving disabled event types suppress delivery.
- [ ] Write failing tests proving dispatch uses all route-visible saved-commute current keys for clearance detection, preventing false service-restored notifications when a rule suppresses active delivery.
- [ ] Add a defaulted `deliveryAllowed` field to `PushNotificationCandidate`.
- [ ] Gate saved-commute delivery in the planner using Toronto local day/time, event type toggles, outbound/return toggles, and monitored route section intersection.
- [ ] Keep line-subscription candidates delivery-allowed by default.
- [ ] Change dispatch saved-commute lifecycle key tracking to use all current saved-commute candidates, while sending only globally allowed and delivery-allowed candidates.
- [ ] Run `mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.SavedCommutePushPlannerTest,com.calebhabesh.linewatch.push.PushNotificationDispatchServiceTest'`.

### Task 3: Frontend Adapter And Saved Commute UI

**Files:**
- Modify: `frontend/src/app/account-data.ts`
- Modify: `frontend/src/components/SavedCommutesPanel.tsx`
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/tests/account-data.test.mjs`
- Test: `frontend/tests/account-ui-source.test.mjs`
- Test: `frontend/tests/smoke/api-stub.mjs`
- Test: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] Write failing adapter tests for `AccountSavedCommuteNotificationRule`, create payload rules, and update endpoint payloads.
- [ ] Write failing UI source tests for route-level notification controls, day buttons, time inputs, event toggles, and monitored-section controls.
- [ ] Add TypeScript rule types, default rule helpers, create payload support, and `updateSavedCommuteNotificationRule`.
- [ ] Add compact rule controls to the create route panel for enabled/days/time/event toggles.
- [ ] Add per-card rule summary and edit controls for saved routes, including whole-route vs selected-section controls based on the route stops.
- [ ] Add restrained dashboard styling for the new controls without nesting decorative cards.
- [ ] Update smoke stubs and smoke expectations for visible saved-commute rule summaries.
- [ ] Run `npm --prefix frontend run test:fixtures`.
- [ ] Run `npm --prefix frontend run typecheck`.
- [ ] Run `npm --prefix frontend run lint`.

### Task 4: Documentation And Full Verification

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] Update documentation to state that saved commutes support account-backed granular push targeting by route, day/time window, event type, and optional route section.
- [ ] Keep limitations explicit: global push/device setup is still required; global accessibility/surface notices are not included; route rules do not send email or recommend alternate routes.
- [ ] Run `mvn -f backend/pom.xml test`.
- [ ] Run `npm --prefix frontend run test:fixtures`.
- [ ] Run `npm --prefix frontend run typecheck`.
- [ ] Run `npm --prefix frontend run lint`.

# Push Notification Identity Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add first-class push `sourceIncidentKey` identity and grouped per-device diagnostics without changing Web Push display tags, retry policy, or notification eligibility.

**Architecture:** Keep `notificationKey` as the OS display/lifecycle key and add `sourceIncidentKey` as the backend incident correlation key. Persist the new key on notification events and line observations, match observations and clearances by source incident, and return diagnostics grouped by logical notification with nested delivery attempts. Update the More diagnostics panel to filter attempts by device label/hash.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, Flyway SQL, JUnit 5, Mockito, AssertJ, Next.js App Router, TypeScript, React, Node built-in test runner.

---

## File Structure

Create:

- `backend/src/main/resources/db/migration/V34__push_source_incident_keys.sql`
  Adds and backfills `source_incident_key` on push notification events and line event observations.
- `docs/superpowers/plans/2026-07-02-push-notification-identity-diagnostics.md`
  This implementation plan.

Modify:

- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationCandidate.java`
  Adds the `sourceIncidentKey` record field.
- `backend/src/main/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlanner.java`
  Produces line-scoped source incident keys without event type.
- `backend/src/main/java/com/calebhabesh/linewatch/push/SavedCommutePushPlanner.java`
  Produces saved-commute source incident keys without event type.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationEventEntity.java`
  Persists and copies source incident keys.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationEntity.java`
  Persists source incident keys and builds ids from them.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationRepository.java`
  Finds active observations by account and source incident key.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationService.java`
  Observes by source incident key.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDispatchService.java`
  Matches current incidents and clearances by source incident key.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java`
  Adds grouped diagnostics response records while preserving the legacy delivery list.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java`
  Builds grouped diagnostics and includes source incident keys in diagnostic rows.
- `frontend/src/app/account-data.ts`
  Adds grouped diagnostics types and backward-compatible parsing.
- `frontend/src/components/PushDeliveryDiagnosticsPanel.tsx`
  Renders notification-first grouped diagnostics and a device filter.
- `frontend/src/app/globals.css`
  Adds small styles for the diagnostics device filter and nested attempts.
- `README.md`
  Documents the grouped diagnostics interpretation and best-effort delivery limits.

Test:

- `backend/src/test/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlannerTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/SavedCommutePushPlannerTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushLineEventObservationServiceTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushLineEventObservationSchemaMigrationTest.java`
- `frontend/tests/account-data.test.mjs`
- `frontend/tests/notification-settings-navigation.test.mjs`

---

### Task 1: Add Source Incident Keys To Planner Contracts

**Files:**
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlannerTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/SavedCommutePushPlannerTest.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationCandidate.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlanner.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/SavedCommutePushPlanner.java`

- [x] **Step 1: Write failing planner assertions**

Add assertions like:

```java
assertThat(c.sourceIncidentKey()).isEqualTo("line-current|line-1|alert-1");
assertThat(c.notificationKey()).isEqualTo("line-current|line-1|suspension|alert-1");
```

For saved commutes, assert:

```java
assertThat(candidate.sourceIncidentKey()).isEqualTo("saved-commute-current|commute_1|outbound|delay-line-1");
assertThat(candidate.notificationKey()).isEqualTo("saved-commute-current|commute_1|outbound|delay|delay-line-1");
```

- [x] **Step 2: Run focused backend planner tests and verify RED**

Run:

```bash
mvn -f backend/pom.xml -Dtest=LineSubscriptionPushPlannerTest,SavedCommutePushPlannerTest test
```

Expected before implementation: compilation fails because `sourceIncidentKey()` does not exist.

- [x] **Step 3: Implement candidate and planner fields**

Add `String sourceIncidentKey` to `PushNotificationCandidate` immediately before `notificationKey`.

In `LineSubscriptionPushPlanner.createLineCandidate(...)`, compute:

```java
String sourceIncidentKey = String.join("|", category, lineId, sourceId);
String notificationKey = String.join("|", category, lineId, eventType, sourceId);
```

In `SavedCommutePushPlanner.candidateFor(...)`, compute:

```java
String stableImpactPart = stableImpactPart(match);
String sourceIncidentKey = String.join("|", category, commute.getId(), legId, stableImpactPart);
String notificationKey = String.join("|", category, commute.getId(), legId, eventType, stableImpactPart);
```

Pass `sourceIncidentKey` to all `PushNotificationCandidate` constructors, including test helpers.

- [x] **Step 4: Run focused backend planner tests and verify GREEN**

Run:

```bash
mvn -f backend/pom.xml -Dtest=LineSubscriptionPushPlannerTest,SavedCommutePushPlannerTest test
```

Expected after implementation: tests pass.

---

### Task 2: Persist Source Incident Keys And Observe By Incident

**Files:**
- Create: `backend/src/main/resources/db/migration/V34__push_source_incident_keys.sql`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationEventEntity.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationEntity.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationRepository.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineEventObservationService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushLineEventObservationServiceTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushLineEventObservationSchemaMigrationTest.java`

- [x] **Step 1: Write failing observation test**

Add a test proving a changed event type refreshes the same observation when `sourceIncidentKey` matches:

```java
when(observationRepository.findByAccountIdAndSourceIncidentKeyAndClearedAtIsNull(
    "user_1",
    "line-current|line-5|ttc-route-71001"
)).thenReturn(Optional.of(existing));
```

Assert `firstObserved()` is false, `shouldSendActive()` is false, and `existing.getNotificationKey()` updates to the delay variant.

- [x] **Step 2: Write failing migration assertions**

Assert `V34__push_source_incident_keys.sql` contains:

```text
source_incident_key
push_notification_events
push_line_event_observations
idx_push_notification_events_source_incident
idx_push_line_event_observations_source_incident_active
```

- [x] **Step 3: Run focused observation and migration tests and verify RED**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushLineEventObservationServiceTest,PushLineEventObservationSchemaMigrationTest test
```

Expected before implementation: repository method or migration assertions fail.

- [x] **Step 4: Implement persistence and repository changes**

Migration `V34__push_source_incident_keys.sql` should:

```sql
alter table push_notification_events add column source_incident_key varchar(512);
alter table push_line_event_observations add column source_incident_key varchar(512);
```

Backfill known key shapes by dropping event type from existing line and saved-commute notification keys. Fall back to `notification_key`, then mark both columns not null and add indexes.

Entity changes:

```java
@Column(name = "source_incident_key")
private String sourceIncidentKey;
```

Observation repository change:

```java
Optional<PushLineEventObservationEntity> findByAccountIdAndSourceIncidentKeyAndClearedAtIsNull(
    String accountId,
    String sourceIncidentKey
);
```

- [x] **Step 5: Run focused observation and migration tests and verify GREEN**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushLineEventObservationServiceTest,PushLineEventObservationSchemaMigrationTest test
```

Expected after implementation: tests pass.

---

### Task 3: Match Clearances By Source Incident Key

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDispatchService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java`

- [x] **Step 1: Write failing dispatch regression**

Change `doesNotSendLineObservationClearanceWhenSameSourceAlertChangesEventType` so the previous and current candidates share:

```text
sourceIncidentKey = line-current|line-5|ttc-route-71001
```

Assert:

```java
verify(eventRepository, never()).save(argThat(event -> "CLEARED".equals(event.getNotificationState())));
verify(lineEventObservationService, never()).markCleared(previousObservation, clock.instant());
```

- [x] **Step 2: Run focused dispatch test and verify RED**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationDispatchServiceTest#doesNotSendLineObservationClearanceWhenSameSourceAlertChangesEventType test
```

Expected before implementation: the test fails because the dispatch service still clears the previous notification-key variant.

- [x] **Step 3: Implement source incident matching**

In `evaluateSavedCommuteNotifications()`, collect:

```java
Set<String> currentLineSourceIncidentKeys = new HashSet<>();
Set<String> savedCurrentSourceIncidentKeys = new HashSet<>();
```

Use `candidate.sourceIncidentKey()` for active-presence checks. In clearance methods, skip clearing when the active event or observation source incident key is still current. Keep old equivalence checks only as fallback.

- [x] **Step 4: Run focused dispatch test and verify GREEN**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationDispatchServiceTest#doesNotSendLineObservationClearanceWhenSameSourceAlertChangesEventType test
```

Expected after implementation: the regression passes.

---

### Task 4: Return Grouped Backend Diagnostics

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`

- [x] **Step 1: Write failing grouped diagnostics test**

Add or update a test so two deliveries for one event return one notification group:

```java
assertThat(response.notifications()).hasSize(1);
assertThat(response.notifications().getFirst().sourceIncidentKey())
    .isEqualTo("line-current|line-2|ttc-route-70610");
assertThat(response.notifications().getFirst().attempts())
    .extracting(PushResponses.PushDeliveryDiagnosticResponse::deviceLabel)
    .containsExactly("Android Chrome", "iOS Safari");
assertThat(response.deliveries()).hasSize(2);
```

- [x] **Step 2: Run focused service diagnostics test and verify RED**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationServiceTest#deliveryDiagnosticsReturnsGroupedNotificationAttempts test
```

Expected before implementation: grouped `notifications()` does not exist.

- [x] **Step 3: Implement grouped response records**

Add:

```java
public record PushNotificationDiagnosticGroupResponse(
    String id,
    String title,
    String tag,
    String notificationKey,
    String sourceIncidentKey,
    String notificationState,
    String category,
    String eventType,
    String lineId,
    String lineNumber,
    String eventCreatedAt,
    List<PushDeliveryDiagnosticResponse> attempts
) {}
```

Change `PushDeliveryDiagnosticsResponse` to:

```java
public record PushDeliveryDiagnosticsResponse(
    List<PushNotificationDiagnosticGroupResponse> notifications,
    List<PushDeliveryDiagnosticResponse> deliveries
) {
    public PushDeliveryDiagnosticsResponse(List<PushDeliveryDiagnosticResponse> deliveries) {
        this(List.of(), deliveries);
    }
}
```

- [x] **Step 4: Group deliveries by event id in the service**

Build flat rows as today, then group source delivery entities by `delivery.getEvent().getId()`. Sort groups and attempts by newest `lastAttemptAt`.

- [x] **Step 5: Run focused diagnostics test and verify GREEN**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationServiceTest#deliveryDiagnosticsReturnsGroupedNotificationAttempts test
```

Expected after implementation: test passes.

---

### Task 5: Update Frontend Diagnostics Types And Panel

**Files:**
- Modify: `frontend/src/app/account-data.ts`
- Modify: `frontend/src/components/PushDeliveryDiagnosticsPanel.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/account-data.test.mjs`
- Modify: `frontend/tests/notification-settings-navigation.test.mjs`

- [x] **Step 1: Write failing account-data test**

Update the diagnostics fixture to return:

```json
{
  "notifications": [
    {
      "id": "push_event_1",
      "sourceIncidentKey": "line-current|line-2|ttc-route-70610",
      "attempts": []
    }
  ],
  "deliveries": []
}
```

Assert:

```js
assert.equal(result.notifications.length, 1);
assert.equal(result.notifications[0].sourceIncidentKey, "line-current|line-2|ttc-route-70610");
```

- [x] **Step 2: Write failing panel source assertions**

Assert `PushDeliveryDiagnosticsPanel.tsx` contains:

```text
selectedDeviceKey
diagnosticDeviceOptions
notification.attempts
sourceIncidentKey
```

- [x] **Step 3: Run focused frontend tests and verify RED**

Run:

```bash
npm --prefix frontend run test:fixtures -- account-data notification-settings-navigation
```

If the npm script does not accept name filters, run:

```bash
npm --prefix frontend run test:fixtures
```

Expected before implementation: grouped diagnostics assertions fail.

- [x] **Step 4: Implement frontend grouped diagnostics**

Add `PushNotificationDiagnosticGroup` type with an `attempts: PushDeliveryDiagnostic[]` field.

Change `PushDeliveryDiagnosticsResult` to include:

```ts
notifications: PushNotificationDiagnosticGroup[];
deliveries: PushDeliveryDiagnostic[];
```

In `getPushDeliveryDiagnostics()`, read both `notifications` and `deliveries`, and adapt legacy `deliveries` into groups only when `notifications` is absent.

In `PushDeliveryDiagnosticsPanel`, render `diagnostics.notifications`, derive device options from attempts, and filter nested attempts by selected device key. Use `deviceLabel` plus `endpointHashPrefix` for duplicate labels.

- [x] **Step 5: Run focused frontend tests and verify GREEN**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected after implementation: fixture tests pass.

---

### Task 6: Documentation And Full Verification

**Files:**
- Modify: `README.md`

- [x] **Step 1: Update README push diagnostics text**

Add text explaining that diagnostics are grouped by logical notification, one notification can fan out to multiple per-device attempts, accepted Apple/FCM responses are not display guarantees, and device filters distinguish Android Chrome from iOS Safari endpoint hashes.

- [x] **Step 2: Run backend verification**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: all backend tests pass.

- [x] **Step 3: Run frontend verification**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: all frontend checks pass.

- [x] **Step 4: Run frontend build if diagnostics UI changes are substantial**

Run:

```bash
npm --prefix frontend run build
```

Expected: build exits 0.

- [x] **Step 5: Review git diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: changed files match this plan and no unrelated files are modified.

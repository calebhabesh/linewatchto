# Notifications Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete LineWatch TO notifications by making `More -> Notifications` the canonical settings surface, adding persisted saved-commute, line-wide, event-type, and reminder-timing preferences, and wiring those preferences into Web Push delivery.

**Architecture:** Keep the existing browser Web Push subscription, delivery, service-worker fetch, stale-notification cleanup, and saved-commute impact planner. Add account-level notification preferences separate from device subscriptions, then extend notification candidate planning so saved-commute notifications remain high-signal while line-wide notifications are explicitly opt-in and filtered by line, event type, and reminder bucket.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, Flyway, PostgreSQL, Next.js App Router, React, TypeScript, service worker Web Push APIs, Node built-in tests, Playwright.

---

## Product Decisions

- Notifications stay under `More`, not as a sixth mobile bottom-nav item.
- `More -> Notifications` is the single canonical preferences screen.
- `Saved Commutes` keeps only a contextual summary row with a `Manage` action.
- Device push is browser/device-specific. All alert preferences are account-level.
- Saved-commute alerts default to high-signal settings:
  - Current disruptions affecting saved commutes: on.
  - Saved-commute planned closure reminders: on.
  - Reduced Speed Zones affecting saved commutes: on, state-change only.
  - Service-restored updates for saved commutes: on as quiet same-tag replacements.
- Line-wide alerts are opt-in:
  - No line is subscribed by default.
  - Line-wide suspensions, delays, planned closures, and service-restored updates are enabled once a line is selected.
  - Line-wide Reduced Speed Zone alerts default off because they can be long-running and noisy.
- Reminder timing supports:
  - Event starts/changes.
  - 24h before a planned closure.
  - Morning of a planned closure.
- Quiet hours, commute windows, email, alternate-route recommendations, per-commute notification rules, and accessibility-personalized matching are out of scope for this plan.

## Current Repo Context

The worktree already contains a partially built notification feature. Preserve it and build forward:

- Existing backend package: `backend/src/main/java/com/calebhabesh/linewatch/push/`.
- Existing push migration: `backend/src/main/resources/db/migration/V22__push_notifications.sql`.
- Existing lifecycle migration in worktree: `backend/src/main/resources/db/migration/V23__push_notification_lifecycle.sql`.
- Existing frontend notification panel: `frontend/src/components/NotificationSettingsPanel.tsx`.
- Existing More entry: `frontend/src/components/MobileMoreSheet.tsx`.
- Existing Saved Commutes summary row: `frontend/src/components/SavedCommutesPanel.tsx`.
- Existing service worker push fetch/cleanup: `frontend/public/sw.js`.
- Existing source-level notification tests: `frontend/tests/notification-settings-navigation.test.mjs`, `frontend/tests/account-data.test.mjs`, `frontend/tests/pwa.test.mjs`.

Do not revert unrelated dirty files. Start by reading `git status --short`.

## Files

Backend create:

- `backend/src/main/resources/db/migration/V24__notification_preferences.sql`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceEntity.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineSubscriptionEntity.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceRepository.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineSubscriptionRepository.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceService.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlanner.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceServiceTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlannerTest.java`

Backend modify:

- `backend/src/main/java/com/calebhabesh/linewatch/push/PushRequests.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationCandidate.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationEventEntity.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationEventRepository.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushSubscriptionRepository.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDispatchService.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/SavedCommutePushPlanner.java`
- `backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteResponses.java`
- `backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteImpactService.java`
- Existing backend push tests in `backend/src/test/java/com/calebhabesh/linewatch/push/`.

Frontend create:

- `frontend/src/hooks/usePushNotificationSettings.ts`
- `frontend/tests/push-notification-preferences.test.mjs`

Frontend modify:

- `frontend/src/app/account-data.ts`
- `frontend/src/components/LineWatchShell.tsx`
- `frontend/src/components/NotificationSettingsPanel.tsx`
- `frontend/src/components/SavedCommutesPanel.tsx`
- `frontend/src/components/MobileMoreSheet.tsx`
- `frontend/src/app/globals.css`
- `frontend/public/sw.js`
- `frontend/tests/account-data.test.mjs`
- `frontend/tests/notification-settings-navigation.test.mjs`
- `frontend/tests/pwa.test.mjs`
- `frontend/tests/smoke/api-stub.mjs`
- `frontend/tests/smoke/dashboard.spec.ts`

Docs modify:

- `README.md`
- `AGENTS.md`
- `GEMINI.md`

## API Shape

Use this account-level preference shape in backend responses and frontend types. Keep `commuteNotificationsEnabled` and `plannedClosureNotificationsEnabled` as derived compatibility aliases through this slice.

```json
{
  "webPushAvailable": true,
  "vapidPublicKey": "BPublicVapidKey",
  "preferences": {
    "commuteNotificationsEnabled": true,
    "plannedClosureNotificationsEnabled": true,
    "savedCommutes": {
      "currentDisruptions": true,
      "plannedClosureReminders": true,
      "eventTypes": {
        "suspensions": true,
        "delays": true,
        "reducedSpeedZones": true,
        "plannedClosures": true,
        "serviceRestored": true
      }
    },
    "lineSubscriptions": {
      "lines": [
        { "lineId": "line-1", "lineNumber": "1", "label": "Yonge-University", "subscribed": false },
        { "lineId": "line-2", "lineNumber": "2", "label": "Bloor-Danforth", "subscribed": false },
        { "lineId": "line-4", "lineNumber": "4", "label": "Sheppard", "subscribed": false },
        { "lineId": "line-5", "lineNumber": "5", "label": "Eglinton", "subscribed": false },
        { "lineId": "line-6", "lineNumber": "6", "label": "Finch West", "subscribed": false }
      ],
      "eventTypes": {
        "suspensions": true,
        "delays": true,
        "reducedSpeedZones": false,
        "plannedClosures": true,
        "serviceRestored": true
      }
    },
    "reminderTiming": {
      "onChange": true,
      "closure24h": true,
      "closureMorning": true
    }
  }
}
```

## Task 1: Guardrails And Baseline

**Files:**

- Read: `AGENTS.md`
- Read: `GEMINI.md`
- Read: `README.md`
- Read: `backend/src/main/java/com/calebhabesh/linewatch/push/*`
- Read: `frontend/src/components/NotificationSettingsPanel.tsx`
- Read: `frontend/src/components/MobileMoreSheet.tsx`
- Read: `frontend/src/components/SavedCommutesPanel.tsx`

- [ ] **Step 1: Check worktree state**

Run:

```bash
git status --short
```

Expected: existing modified notification files are present. Treat them as user-owned context. Do not revert them.

- [ ] **Step 2: Run current backend push tests**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.*Test'
```

Expected before this plan is implemented: current push tests pass or expose existing WIP failures. If there are failures, write the failure names into the commit message or handoff note before changing behavior.

- [ ] **Step 3: Run current frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected before this plan is implemented: current fixture tests pass or expose existing WIP failures. If there are failures, preserve the failure output and continue with the tests in this plan.

## Task 2: Add Account-Level Preference Schema

**Files:**

- Create: `backend/src/main/resources/db/migration/V24__notification_preferences.sql`

- [ ] **Step 1: Add the migration**

Create `V24__notification_preferences.sql` with this SQL:

```sql
create table push_notification_preferences (
    account_id varchar(80) primary key references accounts(id) on delete cascade,
    saved_commute_current_enabled boolean not null default true,
    saved_commute_planned_enabled boolean not null default true,
    saved_commute_suspension_enabled boolean not null default true,
    saved_commute_delay_enabled boolean not null default true,
    saved_commute_reduced_speed_zone_enabled boolean not null default true,
    saved_commute_planned_closure_enabled boolean not null default true,
    saved_commute_restored_enabled boolean not null default true,
    line_suspension_enabled boolean not null default true,
    line_delay_enabled boolean not null default true,
    line_reduced_speed_zone_enabled boolean not null default false,
    line_planned_closure_enabled boolean not null default true,
    line_restored_enabled boolean not null default true,
    reminder_on_change_enabled boolean not null default true,
    reminder_closure_24h_enabled boolean not null default true,
    reminder_closure_morning_enabled boolean not null default true,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null
);

insert into push_notification_preferences (
    account_id,
    saved_commute_current_enabled,
    saved_commute_planned_enabled,
    created_at,
    updated_at
)
select
    account_id,
    bool_or(commute_notifications_enabled),
    bool_or(planned_closure_notifications_enabled),
    min(created_at),
    max(updated_at)
from push_subscriptions
group by account_id
on conflict (account_id) do nothing;

create table push_line_subscriptions (
    id varchar(120) primary key,
    account_id varchar(80) not null references accounts(id) on delete cascade,
    line_id varchar(32) not null,
    enabled boolean not null default false,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    unique (account_id, line_id)
);

alter table push_notification_events
    alter column leg_id drop not null;

alter table push_notification_events
    add column line_id varchar(32);

alter table push_notification_events
    add column event_type varchar(40);

alter table push_notification_events
    add column reminder_bucket varchar(40);

update push_notification_events
set event_type = case
    when category = 'saved-commute-planned' then 'planned-closure'
    else 'service-impact'
end
where event_type is null;

update push_notification_events
set reminder_bucket = 'on-change'
where reminder_bucket is null;

alter table push_notification_events
    alter column event_type set not null;

alter table push_notification_events
    alter column reminder_bucket set not null;

create index idx_push_line_subscriptions_account_enabled
    on push_line_subscriptions(account_id, enabled);

create index idx_push_notification_preferences_updated
    on push_notification_preferences(updated_at desc);

create index idx_push_notification_events_line_state
    on push_notification_events(account_id, line_id, notification_state, created_at desc);
```

- [ ] **Step 2: Run backend tests to verify Flyway loads**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.PushNotificationControllerTest'
```

Expected: PASS after the migration is syntactically valid.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V24__notification_preferences.sql
git commit -m "feat: add notification preference schema"
```

## Task 3: Add Preference Entities And DTOs

**Files:**

- Create: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceEntity.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineSubscriptionEntity.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceRepository.java`
- Create: `backend/src/main/java/com/calebhabesh/linewatch/push/PushLineSubscriptionRepository.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushRequests.java`

- [ ] **Step 1: Add entity classes**

`PushNotificationPreferenceEntity` should map every column from `push_notification_preferences`, expose getters, and have:

```java
public static PushNotificationPreferenceEntity create(AccountEntity account, Instant now)
public void updateFrom(PushRequests.UpdatePushPreferencesRequest request, Instant now)
```

Use primitive booleans for stored values and default all values in `create()` exactly as the product decisions specify.

`PushLineSubscriptionEntity` should use a simple string primary key to avoid composite-key boilerplate:

```java
public static String idFor(String accountId, String lineId) {
    return accountId + ":" + lineId;
}
```

It should store `account`, `lineId`, `enabled`, `createdAt`, and `updatedAt`, with methods:

```java
public static PushLineSubscriptionEntity create(AccountEntity account, String lineId, boolean enabled, Instant now)
public void setEnabled(boolean enabled, Instant now)
```

- [ ] **Step 2: Add repositories**

`PushNotificationPreferenceRepository`:

```java
public interface PushNotificationPreferenceRepository extends JpaRepository<PushNotificationPreferenceEntity, String> {}
```

`PushLineSubscriptionRepository`:

```java
public interface PushLineSubscriptionRepository extends JpaRepository<PushLineSubscriptionEntity, String> {
    List<PushLineSubscriptionEntity> findByAccountIdOrderByLineIdAsc(String accountId);
}
```

- [ ] **Step 3: Expand response DTOs**

Update `PushResponses.java` with nested records:

```java
public record EventTypePreferencesResponse(
    boolean suspensions,
    boolean delays,
    boolean reducedSpeedZones,
    boolean plannedClosures,
    boolean serviceRestored
) {}

public record SavedCommutePreferencesResponse(
    boolean currentDisruptions,
    boolean plannedClosureReminders,
    EventTypePreferencesResponse eventTypes
) {}

public record LineSubscriptionResponse(
    String lineId,
    String lineNumber,
    String label,
    boolean subscribed
) {}

public record LineSubscriptionPreferencesResponse(
    List<LineSubscriptionResponse> lines,
    EventTypePreferencesResponse eventTypes
) {}

public record ReminderTimingPreferencesResponse(
    boolean onChange,
    boolean closure24h,
    boolean closureMorning
) {}

public record PushPreferencesResponse(
    boolean commuteNotificationsEnabled,
    boolean plannedClosureNotificationsEnabled,
    SavedCommutePreferencesResponse savedCommutes,
    LineSubscriptionPreferencesResponse lineSubscriptions,
    ReminderTimingPreferencesResponse reminderTiming
) {}
```

Add a temporary two-argument compatibility constructor to `PushPreferencesResponse` so the existing `PushNotificationService` and controller tests keep compiling until Task 4 rewires config:

```java
public PushPreferencesResponse(boolean commuteNotificationsEnabled, boolean plannedClosureNotificationsEnabled) {
    this(
        commuteNotificationsEnabled,
        plannedClosureNotificationsEnabled,
        new SavedCommutePreferencesResponse(
            commuteNotificationsEnabled,
            plannedClosureNotificationsEnabled,
            new EventTypePreferencesResponse(true, true, true, true, true)
        ),
        new LineSubscriptionPreferencesResponse(
            List.of(
                new LineSubscriptionResponse("line-1", "1", "Yonge-University", false),
                new LineSubscriptionResponse("line-2", "2", "Bloor-Danforth", false),
                new LineSubscriptionResponse("line-4", "4", "Sheppard", false),
                new LineSubscriptionResponse("line-5", "5", "Eglinton", false),
                new LineSubscriptionResponse("line-6", "6", "Finch West", false)
            ),
            new EventTypePreferencesResponse(true, true, false, true, true)
        ),
        new ReminderTimingPreferencesResponse(true, true, true)
    );
}
```

Keep `PushSubscriptionResponse` compatibility fields for now:

```java
public record PushSubscriptionResponse(
    String id,
    boolean enabled,
    boolean commuteNotificationsEnabled,
    boolean plannedClosureNotificationsEnabled
) {}
```

- [ ] **Step 4: Expand request DTOs**

Update `PushRequests.java` with nullable wrapper booleans so partial compatibility requests can be accepted:

```java
public record EventTypePreferencesRequest(
    Boolean suspensions,
    Boolean delays,
    Boolean reducedSpeedZones,
    Boolean plannedClosures,
    Boolean serviceRestored
) {}

public record SavedCommutePreferencesRequest(
    Boolean currentDisruptions,
    Boolean plannedClosureReminders,
    EventTypePreferencesRequest eventTypes
) {}

public record LineSubscriptionSelectionRequest(String lineId, Boolean subscribed) {}

public record LineSubscriptionPreferencesRequest(
    java.util.List<LineSubscriptionSelectionRequest> lines,
    EventTypePreferencesRequest eventTypes
) {}

public record ReminderTimingPreferencesRequest(
    Boolean onChange,
    Boolean closure24h,
    Boolean closureMorning
) {}

public record UpdatePushPreferencesRequest(
    Boolean commuteNotificationsEnabled,
    Boolean plannedClosureNotificationsEnabled,
    SavedCommutePreferencesRequest savedCommutes,
    LineSubscriptionPreferencesRequest lineSubscriptions,
    ReminderTimingPreferencesRequest reminderTiming
) {}
```

- [ ] **Step 5: Compile the DTO/entity slice**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.PushNotificationControllerTest'
```

Expected: PASS after DTO and entity references compile with the current controller tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceEntity.java backend/src/main/java/com/calebhabesh/linewatch/push/PushLineSubscriptionEntity.java backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceRepository.java backend/src/main/java/com/calebhabesh/linewatch/push/PushLineSubscriptionRepository.java backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java backend/src/main/java/com/calebhabesh/linewatch/push/PushRequests.java
git commit -m "feat: define notification preference contract"
```

## Task 4: Implement Preference Service And Wire Config

**Files:**

- Create: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationController.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushSubscriptionRepository.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceServiceTest.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationControllerTest.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`

- [ ] **Step 1: Write failing tests for defaults and updates**

Create `PushNotificationPreferenceServiceTest.java` with tests for:

- A new account receives saved-commute current/planned defaults enabled.
- Line subscriptions for Lines 1, 2, 4, 5, and 6 default unsubscribed.
- Line-wide Reduced Speed Zones default disabled.
- Updating line selections and event types persists.
- An unsupported line id such as `line-3` is rejected with `AccountException` status 400 and error `invalid_line_subscription`.

Use assertions matching this expected response shape:

```java
assertThat(response.savedCommutes().currentDisruptions()).isTrue();
assertThat(response.savedCommutes().plannedClosureReminders()).isTrue();
assertThat(response.savedCommutes().eventTypes().reducedSpeedZones()).isTrue();
assertThat(response.lineSubscriptions().lines())
    .extracting(PushResponses.LineSubscriptionResponse::lineId)
    .containsExactly("line-1", "line-2", "line-4", "line-5", "line-6");
assertThat(response.lineSubscriptions().lines())
    .allSatisfy(line -> assertThat(line.subscribed()).isFalse());
assertThat(response.lineSubscriptions().eventTypes().reducedSpeedZones()).isFalse();
assertThat(response.reminderTiming().closure24h()).isTrue();
assertThat(response.reminderTiming().closureMorning()).isTrue();
```

- [ ] **Step 2: Run the new test and verify failure**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.PushNotificationPreferenceServiceTest'
```

Expected: FAIL because the preference service does not exist.

- [ ] **Step 3: Implement supported line metadata**

Inside `PushNotificationPreferenceService`, define:

```java
private static final List<LineMetadata> SUPPORTED_LINES = List.of(
    new LineMetadata("line-1", "1", "Yonge-University"),
    new LineMetadata("line-2", "2", "Bloor-Danforth"),
    new LineMetadata("line-4", "4", "Sheppard"),
    new LineMetadata("line-5", "5", "Eglinton"),
    new LineMetadata("line-6", "6", "Finch West")
);
```

Use this same ordering for the API response.

- [ ] **Step 4: Implement get-or-create and update**

`PushNotificationPreferenceService` should expose:

```java
@Transactional
public PushResponses.PushPreferencesResponse preferencesFor(AccountEntity account)

@Transactional
public PushResponses.PushPreferencesResponse updatePreferences(AccountEntity account, PushRequests.UpdatePushPreferencesRequest request)

@Transactional(readOnly = true)
public boolean allows(PushNotificationPreferenceEntity preferences, PushNotificationCandidate candidate)

@Transactional(readOnly = true)
public List<String> subscribedLineIds(String accountId)

@Transactional(readOnly = true)
public PushNotificationPreferenceEntity preferenceEntityForAccountId(String accountId)
```

Inject `AccountRepository` so `preferenceEntityForAccountId()` can create a missing preference row from an account id owned by an enabled push subscription.

Rules:

- Create a preference row when one does not exist.
- Create missing `push_line_subscriptions` rows lazily for all supported lines.
- Reject unsupported line ids.
- Compatibility request aliases map to:
  - `commuteNotificationsEnabled` -> `savedCommutes.currentDisruptions`
  - `plannedClosureNotificationsEnabled` -> `savedCommutes.plannedClosureReminders`
- `allows()` returns false for:
  - Saved-commute current candidates when `saved_commute_current_enabled` is false.
  - Saved-commute planned candidates when `saved_commute_planned_enabled` is false.
  - Candidate event types disabled in the matching saved-commute or line-wide scope.
  - Line-wide candidates for unsubscribed lines.
  - `closure-24h` candidates when `reminder_closure_24h_enabled` is false.
  - `closure-morning` candidates when `reminder_closure_morning_enabled` is false.
  - `on-change` candidates when `reminder_on_change_enabled` is false.

- [ ] **Step 5: Wire `PushNotificationService.config()`**

Change config to use the preference service response instead of reading the first subscription's booleans.

`PushNotificationService` constructor should accept `PushNotificationPreferenceService preferenceService`.

`config()` should return:

```java
return new PushResponses.PushConfigResponse(
    properties.webPushConfigured(),
    properties.getVapidPublicKey() == null ? "" : properties.getVapidPublicKey().trim(),
    preferenceService.preferencesFor(account)
);
```

- [ ] **Step 6: Wire `updatePreferences()`**

Remove the current requirement that a browser subscription exists before preference changes. `updatePreferences()` should update account preferences and return a `PushSubscriptionResponse` compatibility response with the current browser subscription state if one exists, or `id=""` and `enabled=false` if none exists.

The compatibility booleans in `PushSubscriptionResponse` should mirror:

- `preferences.commuteNotificationsEnabled()`
- `preferences.plannedClosureNotificationsEnabled()`

- [ ] **Step 7: Simplify enabled account query**

Change `PushSubscriptionRepository.findEnabledAccountIds()` so it returns distinct accounts with at least one enabled device:

```java
@Query("""
    select distinct subscription.account.id
    from PushSubscriptionEntity subscription
    where subscription.enabled = true
    """)
List<String> findEnabledAccountIds();
```

Preference filtering belongs in the dispatch service, not this repository.

- [ ] **Step 8: Update tests**

Update controller/service tests to assert:

- `config()` includes nested preferences and line rows.
- Updating preferences does not require an existing push subscription.
- Legacy request fields still update saved-commute master toggles.

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.PushNotificationPreferenceServiceTest,com.calebhabesh.linewatch.push.PushNotificationControllerTest,com.calebhabesh.linewatch.push.PushNotificationServiceTest'
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push backend/src/test/java/com/calebhabesh/linewatch/push
git commit -m "feat: persist account notification preferences"
```

## Task 5: Extend Candidate Metadata And Saved-Commute Planning

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationCandidate.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationEventEntity.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/SavedCommutePushPlanner.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteResponses.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteImpactService.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/push/SavedCommutePushPlannerTest.java`

- [ ] **Step 1: Update `PushNotificationCandidate`**

Replace the record with:

```java
public record PushNotificationCandidate(
    String accountId,
    String commuteId,
    String legId,
    String lineId,
    String category,
    String eventType,
    String reminderBucket,
    String notificationKey,
    String dedupeKey,
    String title,
    String body,
    String url
) {
    public boolean savedCommuteScoped() {
        return commuteId != null && !commuteId.isBlank();
    }

    public boolean lineScoped() {
        return lineId != null && !lineId.isBlank() && !savedCommuteScoped();
    }

    public boolean clearedUpdate() {
        return "service-restored".equals(eventType);
    }
}
```

Update every constructor call in tests and production.

- [ ] **Step 2: Add event metadata to event entity**

`PushNotificationEventEntity` should copy these fields from candidate:

- `lineId`
- `eventType`
- `reminderBucket`

`cleared()` should set:

```java
event.eventType = "service-restored";
event.reminderBucket = "on-change";
```

For saved-commute cleared notifications, preserve `commuteId`, `legId`, and `notificationKey`.

For line-wide cleared notifications, preserve `lineId` and `notificationKey`.

- [ ] **Step 3: Extend `CommuteResponses.MatchedImpactResponse`**

Add a final nullable field:

```java
OffsetDateTime eventStartAt
```

Update every backend constructor call. For current impacts, use the existing `startedAt`. For planned closures, use:

```java
closure.nextWindowStart() != null
    ? closure.nextWindowStart()
    : closure.activeWindowStart() != null
        ? closure.activeWindowStart()
        : closure.startedAt()
```

This gives reminder buckets a stable planned-closure start instant without changing current frontend display.

- [ ] **Step 4: Add saved-commute reminder bucket logic**

Inject `Clock` into `SavedCommutePushPlanner`. Use:

```java
private static final ZoneId TORONTO_ZONE = ZoneId.of("America/Toronto");
```

For current impacts, create one candidate:

- `category`: `saved-commute-current`
- `eventType`: match kind, except suspensions stay `suspension`
- `reminderBucket`: `on-change`

For planned closure matches, create candidates:

- `saved-commute-planned` + `planned-closure` + `on-change`
- `saved-commute-planned` + `planned-closure` + `closure-24h` when `now >= eventStartAt - 24h` and `now < eventStartAt`
- `saved-commute-planned` + `planned-closure` + `closure-morning` when Toronto local date equals event local date and `now` is at or after 06:00 Toronto time

Include `reminderBucket` in the dedupe key so the three planned closure reminder types send at most once each:

```java
String.join(
    "|",
    accountId,
    commuteId,
    legId,
    eventType,
    reminderBucket,
    impactId,
    "segments:" + segmentIds,
    "stations:" + stationIds
)
```

Keep the notification key stable without timing bucket for active notification cleanup when the same impact is visible:

```java
String.join("|", category, commuteId, legId, eventType, stableImpactPart(match))
```

- [ ] **Step 5: Update saved-commute planner tests**

Add tests:

- Current Reduced Speed Zone affecting a saved commute creates a `saved-commute-current` candidate with event type `reduced-speed-zone`.
- Planned closure inside the 24h window creates `on-change` and `closure-24h` candidates.
- Planned closure on the same Toronto local date at 07:00 creates a `closure-morning` candidate.
- Return-trip behavior still produces candidates for the `return` leg only when `watchReturnTrip` is true.

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.SavedCommutePushPlannerTest'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationCandidate.java backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationEventEntity.java backend/src/main/java/com/calebhabesh/linewatch/push/SavedCommutePushPlanner.java backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteResponses.java backend/src/main/java/com/calebhabesh/linewatch/commute/CommuteImpactService.java backend/src/test/java/com/calebhabesh/linewatch/push/SavedCommutePushPlannerTest.java
git commit -m "feat: add saved commute notification reminder buckets"
```

## Task 6: Add Line-Wide Notification Planning

**Files:**

- Create: `backend/src/main/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlanner.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlannerTest.java`

- [ ] **Step 1: Write failing planner tests**

Create tests that mock `AlertDashboardService` and assert:

- A subscribed Line 1 suspension creates a `line-current` candidate.
- A subscribed Line 2 delay creates a `line-current` candidate.
- A subscribed Line 1 Reduced Speed Zone candidate is created by the planner, but filtering by preferences will later suppress it by default.
- A planned closure inside the 24h window creates `line-planned` candidates for `on-change` and `closure-24h`.
- An unsubscribed line is not handled by this planner because the planner receives only subscribed line ids.

- [ ] **Step 2: Run the failing test**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.LineSubscriptionPushPlannerTest'
```

Expected: FAIL because `LineSubscriptionPushPlanner` does not exist.

- [ ] **Step 3: Implement `LineSubscriptionPushPlanner`**

Constructor dependencies:

```java
public LineSubscriptionPushPlanner(AlertDashboardService dashboardService, Clock clock)
```

Public method:

```java
public List<PushNotificationCandidate> candidatesFor(String accountId, List<String> subscribedLineIds)
```

Candidate rules:

- `activeAlerts()` with severity `suspension` -> event type `suspension`, category `line-current`, URL `/?panel=alerts`.
- `delays()` -> event type `delay`, category `line-current`, URL `/?panel=delays`.
- `reducedSpeedZones()` -> event type `reduced-speed-zone`, category `line-current`, URL `/?panel=reduced-speed-zones`.
- `plannedClosures()` -> event type `planned-closure`, category `line-planned`, URL `/?panel=closures`.
- Planned closures use the same `on-change`, `closure-24h`, and `closure-morning` timing rules as saved commutes.

Line-wide notification key format:

```java
String.join("|", category, lineId, eventType, sourceId)
```

Line-wide dedupe key format:

```java
String.join("|", accountId, "line", lineId, eventType, reminderBucket, sourceId)
```

Title examples:

- `Line 1 service alert`
- `Line 2 delay`
- `Line 1 planned closure`

Body examples:

- `Suspension on Line 1: St George to Sheppard West`
- `Delay on Line 2: Keele to Jane`
- `Reduced Speed Zone on Line 1: Eglinton to Davisville`
- `Planned Closure on Line 1: St George to Sheppard West`

- [ ] **Step 4: Run planner test**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.LineSubscriptionPushPlannerTest'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlanner.java backend/src/test/java/com/calebhabesh/linewatch/push/LineSubscriptionPushPlannerTest.java
git commit -m "feat: plan line subscription notifications"
```

## Task 7: Wire Dispatch Filtering, Active Tags, And Cleared Updates

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDispatchService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationEventRepository.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`

- [ ] **Step 1: Add event repository query**

Add:

```java
List<PushNotificationEventEntity> findByAccountIdAndCategoryInAndNotificationState(
    String accountId,
    List<String> categories,
    String notificationState
);
```

Keep the existing category-specific query if tests still use it.

- [ ] **Step 2: Update dispatch service dependencies**

`PushNotificationDispatchService` constructor should accept:

- `PushNotificationPreferenceService preferenceService`
- `LineSubscriptionPushPlanner lineSubscriptionPushPlanner`

- [ ] **Step 3: Build candidates per account**

For each account id from `subscriptionRepository.findEnabledAccountIds()`:

1. Load `PushNotificationPreferenceEntity preferences`.
2. Build saved-commute candidates from all saved commutes.
3. Build line-wide candidates from `lineSubscriptionPushPlanner.candidatesFor(accountId, preferenceService.subscribedLineIds(accountId))`.
4. Filter every candidate with `preferenceService.allows(preferences, candidate)`.
5. Send only allowed candidates.

- [ ] **Step 4: Preserve high-signal dedupe**

`sendIfNew(candidate)` should still skip existing dedupe keys. This preserves the product rule that long-running Reduced Speed Zones affecting a saved commute do not repeatedly notify unless the state changes enough to produce a new dedupe key.

- [ ] **Step 5: Send cleared updates for saved-commute and line current notifications**

Current notification categories are:

```java
List.of("saved-commute-current", "saved-commute-impact", "line-current")
```

Build `currentNotificationKeys` from allowed current candidates. For existing active events in those categories whose key is absent:

- Send cleared if the event is saved-commute scoped and `saved_commute_restored_enabled` is true.
- Send cleared if the event is line scoped and `line_restored_enabled` is true.
- Do not send cleared for planned closure reminder categories.
- Continue using same notification key so service workers replace/close stale notifications cleanly.

- [ ] **Step 6: Update active notification tags**

`PushNotificationService.activeNotifications()` should return active tags for both saved-commute and line-wide candidates allowed by preferences. It should not include planned reminder tags that are no longer active.

- [ ] **Step 7: Add dispatch tests**

Add tests:

- Line-wide delay sends only when line is subscribed.
- Line-wide Reduced Speed Zone does not send by default.
- Enabling line-wide Reduced Speed Zones allows that candidate.
- Disabling saved-commute current disruptions suppresses saved-commute current candidates.
- Disabling saved-commute service-restored suppresses saved-commute cleared notifications.
- Enabling line service-restored sends a line-wide cleared notification when a previous line-current event no longer matches.

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.PushNotificationDispatchServiceTest,com.calebhabesh.linewatch.push.PushNotificationServiceTest'
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push backend/src/test/java/com/calebhabesh/linewatch/push
git commit -m "feat: filter push delivery by notification preferences"
```

## Task 8: Update Frontend Data Contract Tests

**Files:**

- Modify: `frontend/src/app/account-data.ts`
- Modify: `frontend/tests/account-data.test.mjs`
- Create: `frontend/tests/push-notification-preferences.test.mjs`

- [ ] **Step 1: Write failing data adapter assertions**

Update `account-data.test.mjs` so `getPushNotificationConfig()` expects nested preferences. Assert at least:

```js
assert.equal(result.config.preferences.savedCommutes.currentDisruptions, true);
assert.equal(result.config.preferences.savedCommutes.plannedClosureReminders, true);
assert.equal(result.config.preferences.savedCommutes.eventTypes.reducedSpeedZones, true);
assert.equal(result.config.preferences.lineSubscriptions.lines.length, 5);
assert.equal(result.config.preferences.lineSubscriptions.lines[0].lineId, "line-1");
assert.equal(result.config.preferences.lineSubscriptions.lines[0].subscribed, false);
assert.equal(result.config.preferences.lineSubscriptions.eventTypes.reducedSpeedZones, false);
assert.equal(result.config.preferences.reminderTiming.closure24h, true);
assert.equal(result.config.preferences.reminderTiming.closureMorning, true);
```

Add an `updatePushPreferences()` assertion that the request body contains the nested preference object, not only the old two booleans.

- [ ] **Step 2: Add preference helper tests**

Create `push-notification-preferences.test.mjs` to read `account-data.ts` and assert:

- `PushNotificationPreferences` includes `savedCommutes`.
- `PushNotificationPreferences` includes `lineSubscriptions`.
- `PushNotificationPreferences` includes `reminderTiming`.
- There is a fallback preference object with Line 1, 2, 4, 5, and 6 all unsubscribed.

- [ ] **Step 3: Run failing frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: FAIL because frontend types still use the two-boolean preference shape.

- [ ] **Step 4: Update `account-data.ts` types**

Add:

```ts
export type PushNotificationEventTypePreferences = {
  suspensions: boolean;
  delays: boolean;
  reducedSpeedZones: boolean;
  plannedClosures: boolean;
  serviceRestored: boolean;
};

export type PushNotificationSavedCommutePreferences = {
  currentDisruptions: boolean;
  plannedClosureReminders: boolean;
  eventTypes: PushNotificationEventTypePreferences;
};

export type PushNotificationLinePreference = {
  lineId: "line-1" | "line-2" | "line-4" | "line-5" | "line-6";
  lineNumber: string;
  label: string;
  subscribed: boolean;
};

export type PushNotificationLineSubscriptionPreferences = {
  lines: PushNotificationLinePreference[];
  eventTypes: PushNotificationEventTypePreferences;
};

export type PushNotificationReminderTimingPreferences = {
  onChange: boolean;
  closure24h: boolean;
  closureMorning: boolean;
};

export type PushNotificationPreferences = {
  commuteNotificationsEnabled: boolean;
  plannedClosureNotificationsEnabled: boolean;
  savedCommutes: PushNotificationSavedCommutePreferences;
  lineSubscriptions: PushNotificationLineSubscriptionPreferences;
  reminderTiming: PushNotificationReminderTimingPreferences;
};
```

Add an exported `defaultPushNotificationPreferences` constant matching the API shape and conservative defaults.

Also add this optional field to `AccountMatchedImpact` because Task 5 extends the backend commute impact record:

```ts
eventStartAt?: string | null;
```

- [ ] **Step 5: Normalize fallback responses**

When `getPushNotificationConfig()` fails, return:

```ts
{
  webPushAvailable: false,
  vapidPublicKey: "",
  preferences: defaultPushNotificationPreferences
}
```

Keep `PendingPushNotification` updated with `state?: "ACTIVE" | "CLEARED"` and `timestamp?: string`.

- [ ] **Step 6: Run tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/account-data.ts frontend/tests/account-data.test.mjs frontend/tests/push-notification-preferences.test.mjs
git commit -m "feat: add frontend notification preference contract"
```

## Task 9: Add Shared Notification Settings Hook

**Files:**

- Create: `frontend/src/hooks/usePushNotificationSettings.ts`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Modify: `frontend/src/components/NotificationSettingsPanel.tsx`
- Modify: `frontend/src/components/SavedCommutesPanel.tsx`
- Modify: `frontend/src/components/MobileMoreSheet.tsx`

- [ ] **Step 1: Create the hook**

`usePushNotificationSettings(accountState)` should own:

```ts
type BrowserPushStatus =
  | "signed-out"
  | "unsupported"
  | "not-configured"
  | "blocked"
  | "checking"
  | "off"
  | "on";
```

Return:

```ts
{
  supported,
  config,
  preferences,
  subscribed,
  busy,
  message,
  browserStatus,
  reload,
  enableDeviceNotifications,
  disableDeviceNotifications,
  updatePreferences
}
```

Move these existing helpers from `NotificationSettingsPanel.tsx` into the hook:

- `base64UrlToUint8Array`
- `serviceWorkerRegistrationForPush`
- `pushSubscriptionKeys`

Rules:

- Fetch `/api/account/push/config` when the account is authenticated.
- Determine current browser subscription from `navigator.serviceWorker.getRegistration("/")`.
- Allow `updatePreferences()` even when this browser is not subscribed.
- `enableDeviceNotifications()` still requires configured VAPID keys and browser permission.
- `disableDeviceNotifications()` disables only the current browser subscription.

- [ ] **Step 2: Wire the hook in `LineWatchShell`**

Inside `LineWatchShell`, call:

```ts
const pushSettings = usePushNotificationSettings(accountState);
```

Pass `pushSettings` to:

- `NotificationSettingsPanel`
- `SavedCommutesPanel`
- `MobileMoreSheet`

- [ ] **Step 3: Refactor `NotificationSettingsPanel` props**

Replace internal fetch/subscription state with the hook result:

```ts
type Props = {
  accountState: AccountState;
  pushSettings: UsePushNotificationSettingsResult;
  onBack?: () => void;
  onClose?: () => void;
  onRequestSignIn: () => void;
  onRequestCreateAccount: () => void;
};
```

- [ ] **Step 4: Add summary props**

`SavedCommutesPanel` should accept:

```ts
notificationSummary: {
  label: string;
  detail: string;
  tone: "on" | "off" | "unavailable";
};
```

`MobileMoreSheet` should accept:

```ts
notificationStatusLabel: string;
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/usePushNotificationSettings.ts frontend/src/components/LineWatchShell.tsx frontend/src/components/NotificationSettingsPanel.tsx frontend/src/components/SavedCommutesPanel.tsx frontend/src/components/MobileMoreSheet.tsx
git commit -m "refactor: share notification settings state"
```

## Task 10: Build The Full Notifications Screen

**Files:**

- Modify: `frontend/src/components/NotificationSettingsPanel.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/tests/notification-settings-navigation.test.mjs`

- [ ] **Step 1: Update source-level UI tests**

Change the second test in `notification-settings-navigation.test.mjs` so it no longer expects `Line-wide alerts are planned` or `Coming later` for line subscriptions. It should assert the real controls exist:

```js
assert.match(notificationPanelSource, /Device notifications/);
assert.match(notificationPanelSource, /Push for this browser/);
assert.match(notificationPanelSource, /Saved commute alerts/);
assert.match(notificationPanelSource, /Current disruptions affecting saved commutes/);
assert.match(notificationPanelSource, /Planned closure reminders/);
assert.match(notificationPanelSource, /Line subscriptions/);
assert.match(notificationPanelSource, /Line 1/);
assert.match(notificationPanelSource, /Line 2/);
assert.match(notificationPanelSource, /Line 4/);
assert.match(notificationPanelSource, /Line 5/);
assert.match(notificationPanelSource, /Line 6/);
assert.match(notificationPanelSource, /Event types/);
assert.match(notificationPanelSource, /Suspensions \/ closures/);
assert.match(notificationPanelSource, /Delays/);
assert.match(notificationPanelSource, /Reduced Speed Zones/);
assert.match(notificationPanelSource, /Planned closures/);
assert.match(notificationPanelSource, /Service restored updates/);
assert.match(notificationPanelSource, /Reminder timing/);
assert.match(notificationPanelSource, /Event starts\/changes/);
assert.match(notificationPanelSource, /24h before closure/);
assert.match(notificationPanelSource, /Morning of closure/);
assert.doesNotMatch(notificationPanelSource, /Coming later/);
assert.doesNotMatch(notificationPanelSource, /Line-wide alerts are planned/);
```

- [ ] **Step 2: Run failing fixture test**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: FAIL because the panel still shows planned-only rows.

- [ ] **Step 3: Replace planned-only line rows with switches**

For each line from `preferences.lineSubscriptions.lines`, render a stable row:

- TTC-colored line badge.
- `Line N`.
- Line label.
- Switch bound to `line.subscribed`.

On toggle, call `pushSettings.updatePreferences()` with a new preferences object where only that line's `subscribed` changes.

- [ ] **Step 4: Add saved-commute master switches**

Render switches for:

- `preferences.savedCommutes.currentDisruptions`
- `preferences.savedCommutes.plannedClosureReminders`

Do not disable these switches when the browser is unsubscribed. Instead show copy: `Inactive until device notifications are enabled for at least one browser.`

- [ ] **Step 5: Add event-type controls**

Render an event-type grid with saved-commute and line-wide columns. Use switches for:

- Suspensions / closures.
- Delays.
- Reduced Speed Zones.
- Planned closures.
- Service restored updates.

The Reduced Speed Zones row should show saved-commute on by default and line-wide off by default.

On toggle, update either:

```ts
preferences.savedCommutes.eventTypes[eventKey]
```

or:

```ts
preferences.lineSubscriptions.eventTypes[eventKey]
```

- [ ] **Step 6: Add reminder timing controls**

Render switches for:

- `preferences.reminderTiming.onChange`
- `preferences.reminderTiming.closure24h`
- `preferences.reminderTiming.closureMorning`

Use display labels:

- `Event starts/changes`
- `24h before closure`
- `Morning of closure`

- [ ] **Step 7: Improve status copy**

Use `pushSettings.browserStatus`:

- `signed-out`: account prompt.
- `unsupported`: `Push unavailable on this browser.`
- `not-configured`: `Push not configured for this environment.`
- `blocked`: `Notifications are blocked in browser settings.`
- `checking`: `Checking push support...`
- `off`: `Push for this browser is off.`
- `on`: `Push for this browser is enabled.`

- [ ] **Step 8: Update CSS**

Add or update selectors:

- `.notification-settings-control-grid`
- `.notification-event-type-grid`
- `.notification-event-type-header`
- `.notification-line-badge`
- `.notification-settings-row-actions`
- `.notification-settings-muted-warning`

CSS constraints:

- Rows must not overflow on mobile.
- Switch columns stack under 420px width.
- Cards remain at 8px radius or less.
- No nested decorative card styling.
- Dark/high-contrast variants must preserve readable borders and text.

- [ ] **Step 9: Run frontend checks**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/NotificationSettingsPanel.tsx frontend/src/app/globals.css frontend/tests/notification-settings-navigation.test.mjs
git commit -m "feat: complete notification settings screen"
```

## Task 11: Polish More And Saved Commutes Discoverability

**Files:**

- Modify: `frontend/src/components/MobileMoreSheet.tsx`
- Modify: `frontend/src/components/SavedCommutesPanel.tsx`
- Modify: `frontend/tests/notification-settings-navigation.test.mjs`

- [ ] **Step 1: Update source tests**

Assert:

- `MobileBottomNav` has no notification nav key.
- `MobileMoreSheet` renders Notifications under its own section.
- `SavedCommutesPanel` includes `Notifications:` summary copy.
- `SavedCommutesPanel` includes a `Manage` button.
- `SavedCommutesPanel` does not contain notification toggle switches.

- [ ] **Step 2: Update Saved Commutes row**

Display:

```text
Notifications: On
Saved commute alerts and closure reminders
Manage
```

Status label rules:

- `On`: at least one device is subscribed and saved-commute current or planned is enabled.
- `Device Off`: preferences are enabled but this browser is not subscribed.
- `Off`: saved-commute current and planned are both disabled.
- `Unavailable`: signed out, unsupported, or backend unavailable.

The action button text should be `Manage`, not `Manage notifications`, to avoid a long mobile row.

- [ ] **Step 3: Update More row**

Show a compact status chip in the More sheet row:

- `On`
- `Device Off`
- `Off`
- `Unavailable`

Do not add Notifications to `MobileBottomNav`.

- [ ] **Step 4: Run tests**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MobileMoreSheet.tsx frontend/src/components/SavedCommutesPanel.tsx frontend/tests/notification-settings-navigation.test.mjs
git commit -m "feat: surface notification status in more and commutes"
```

## Task 12: Update Service Worker Push Categories And Notification URLs

**Files:**

- Modify: `frontend/public/sw.js`
- Modify: `frontend/tests/pwa.test.mjs`
- Modify: `frontend/src/components/LineWatchShell.tsx`

- [ ] **Step 1: Update service worker categories**

Change:

```js
const LINEWATCH_PUSH_CATEGORIES = new Set(["saved-commute-impact", "saved-commute-planned"]);
```

to include:

```js
const LINEWATCH_PUSH_CATEGORIES = new Set([
  "saved-commute-impact",
  "saved-commute-current",
  "saved-commute-planned",
  "line-current",
  "line-planned",
]);
```

- [ ] **Step 2: Add URL panel handling in shell**

In `LineWatchShell`, add a mount-only effect that reads `window.location.search`:

```ts
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const panel = params.get("panel");
  const panelToView: Record<string, ActiveView> = {
    status: "status",
    alerts: "alerts",
    delays: "delays",
    "reduced-speed-zones": "reduced-speed-zones",
    closures: "closures",
    commutes: "commutes",
    notifications: "notifications",
  };
  if (panel && panelToView[panel]) {
    setActiveView(panelToView[panel]);
    window.history.replaceState(null, "", window.location.pathname);
  }
}, []);
```

This makes notification clicks land on the matching panel without replaying the panel every refresh.

- [ ] **Step 3: Update PWA tests**

Add assertions that `sw.js` includes `line-current`, `line-planned`, `saved-commute-current`, and still posts `/api/account/push/active`.

Add a source assertion that `LineWatchShell.tsx` reads `URLSearchParams` and supports `panel=notifications`, `panel=commutes`, `panel=alerts`, `panel=delays`, `panel=reduced-speed-zones`, and `panel=closures`.

- [ ] **Step 4: Run tests**

Run:

```bash
npm --prefix frontend run test:fixtures
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/public/sw.js frontend/src/components/LineWatchShell.tsx frontend/tests/pwa.test.mjs
git commit -m "feat: support notification categories and panel deep links"
```

## Task 13: Add Smoke Stub Push Endpoints And Browser Test

**Files:**

- Modify: `frontend/tests/smoke/api-stub.mjs`
- Modify: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Add push preference state to the stub**

In `api-stub.mjs`, add an in-memory `pushPreferences` object matching the API shape. Use the same conservative defaults as `defaultPushNotificationPreferences`.

- [ ] **Step 2: Add stub endpoints**

Add:

- `GET /api/account/push/config`
- `PUT /api/account/push/preferences`
- `PUT /api/account/push/subscription`
- `POST /api/account/push/subscription/disable`
- `POST /api/account/push/latest`
- `POST /api/account/push/active`

Behavior:

- If `demoSessionActive` is false, return 401.
- Config returns `webPushAvailable: true`, `vapidPublicKey: "BStubVapidKey"`, and current `pushPreferences`.
- Preferences merges and stores the request body, then returns a compatibility subscription response.
- Subscription returns `enabled: true`.
- Disable returns 204.
- Latest returns `{ notification: null }`.
- Active returns `{ activeTags: [] }`.

- [ ] **Step 3: Add Playwright test**

Add a mobile smoke test:

1. Set stub mode `seeded`.
2. Open `/`.
3. Tap `More`.
4. Tap `Demo Account`.
5. Tap `More`.
6. Tap `Notifications`.
7. Assert heading `Notifications`.
8. Assert `Push for this browser`.
9. Assert `Line subscriptions`.
10. Toggle `Line 1`.
11. Assert `Line 1` remains selected after the request completes.
12. Toggle line-wide `Reduced Speed Zones`.
13. Assert row status changes from off to on.
14. Tap back to `More`.
15. Assert More nav remains active and there is no bottom-nav `Notifications` button.

Use role selectors where possible. Add `aria-label` values in `NotificationSettingsPanel` if needed:

- `Line 1 notifications`
- `Line-wide Reduced Speed Zones`
- `Saved commute Reduced Speed Zones`
- `24h before closure reminders`

- [ ] **Step 4: Run smoke test**

Run:

```bash
npm --prefix frontend run test:smoke -- --grep "notification"
```

Expected: PASS after the frontend and stub are wired.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/smoke/api-stub.mjs frontend/tests/smoke/dashboard.spec.ts frontend/src/components/NotificationSettingsPanel.tsx
git commit -m "test: cover mobile notification preferences"
```

## Task 14: Update Documentation And Agent Guides

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Update README current status**

Replace the old limitation:

```text
Line-wide or all-map push alert subscriptions are not implemented; push notifications are scoped to account saved commutes.
```

with:

```text
Line-wide Web Push subscriptions are implemented for Lines 1, 2, 4, 5, and 6, but they are opt-in and filtered by selected line, event type, and reminder timing. Reduced Speed Zone line-wide alerts default off to avoid noisy long-running notifications.
```

Keep this limitation:

```text
Email commute notifications are not implemented.
```

- [ ] **Step 2: Update API table**

Change `/api/account/push/config` description to:

```text
Account push availability, VAPID public key, account-level notification preferences, line subscriptions, event-type filters, and reminder timing.
```

Change `/api/account/push/preferences` description to:

```text
Update account-level saved-commute, line subscription, event-type, and reminder timing notification preferences.
```

- [ ] **Step 3: Update push testing docs**

Add a note:

```text
Device push enablement is per browser/device. Saved-commute, line-wide, event-type, and reminder preferences are account-level and can be changed before a browser subscription exists, but delivery requires at least one enabled browser subscription plus configured VAPID keys.
```

- [ ] **Step 4: Update AGENTS and GEMINI current reality**

In both files, replace statements saying line-wide push subscriptions are not implemented with a truthful current-state statement:

```text
Account-backed Web Push subscription, preference, dedupe, delivery, service-worker display plumbing, saved-commute impact notifications, opt-in line-wide subscriptions for Lines 1, 2, 4, 5, and 6, event-type filters, and planned-closure reminder buckets are implemented. Delivery is inactive unless browser permission is granted, VAPID keys are configured, `linewatch.push.enabled` is true, and fresh dashboard-visible impacts exist.
```

Keep email, alternate-route recommendations, quiet hours, commute windows, per-commute notification rules, and accessibility-personalized matching out of current reality.

- [ ] **Step 5: Commit**

```bash
git add README.md AGENTS.md GEMINI.md
git commit -m "docs: document completed notification preferences"
```

## Task 15: Full Verification

**Files:**

- All changed files.

- [ ] **Step 1: Backend verification**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 2: Frontend fixture verification**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 3: Frontend typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 4: Frontend lint**

Run:

```bash
npm --prefix frontend run lint
```

Expected: PASS.

- [ ] **Step 5: Frontend build**

Run:

```bash
npm --prefix frontend run build
```

Expected: PASS.

- [ ] **Step 6: Smoke tests**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: PASS. If browser dependencies are missing, run `npm --prefix frontend run test:smoke:install` only with user approval if the environment requires network or system writes.

- [ ] **Step 7: Final status**

Run:

```bash
git status --short
```

Expected: only intentional changed files are present if commits were not made; otherwise the worktree is clean except unrelated user changes that existed before implementation.

## Self-Review Checklist For Gemini

- [ ] Notifications are reachable through `More -> Notifications`.
- [ ] Notifications are not a mobile bottom-nav item.
- [ ] Saved Commutes contains only summary plus `Manage`, not duplicate controls.
- [ ] Device push enable/disable remains per browser/device.
- [ ] Saved-commute preferences are account-level and high-signal by default.
- [ ] Line-wide subscriptions are account-level, off by default, and require explicit line selection.
- [ ] Line-wide Reduced Speed Zones default off.
- [ ] Saved-commute Reduced Speed Zones default on and are deduped by state change.
- [ ] Service-restored updates use quiet same-tag replacements.
- [ ] 24h and morning planned-closure reminder buckets are deduped separately.
- [ ] Stale notification cleanup still uses `/api/account/push/active`.
- [ ] README, AGENTS, and GEMINI do not claim email notifications, quiet hours, commute-window reminders, per-commute rules, live station arrivals, or alternate-route recommendations.
- [ ] All required backend and frontend verification commands have been run and read.

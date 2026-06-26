# Split Push Lifecycle Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show LineWatchTO active disruption notifications and service-restored notifications as separate visible OS notification entries, while keeping one backend lifecycle correlation key and suppressing routine update noise.

**Architecture:** Keep `PushNotificationEventEntity.notificationKey` as the stable incident/lifecycle correlation key used for matching active alerts to clearances. Add state-specific browser display tags (`<notificationKey>|active`, `<notificationKey>|cleared`) and use those tags for `showNotification`, cleanup retention, and Web Push topics. Drain pending delivery rows in chronological batches so a device can display an initial alert and its clearance separately even when only one push wake reaches the service worker.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, Web Push, Next.js PWA service worker JavaScript, Node built-in tests, Maven, JUnit 5, Mockito, AssertJ.

---

## Product Policy

- Initial active alert: one push notification when a fresh dashboard-visible impact first becomes notification-eligible.
- Routine active updates: no additional OS push just because TTC feed text, updated time, or still-active polling changed.
- Clearance: one separate quiet push notification when LineWatch detects that the corresponding alert cleared.
- Display behavior: active and cleared notifications must not replace each other in the OS notification tray.
- Correlation behavior: backend dedupe, clearance matching, observation matching, and saved-commute/line-stream semantics continue using the existing base `notificationKey`.
- Retention: retain both visible lifecycle entries through LineWatch cleanup for a bounded long window, default `PT24H`. This is the practical substitute for "until dismissed"; PWA APIs do not provide reliable cross-platform dismissal state.
- Cleanup: after retention expires, LineWatch cleanup may close old active/cleared visible notifications. Android/iOS may still independently rank, age, group, or remove PWA notifications.
- In-app Alert History remains the permanent lifecycle record.
- Do not add push notifications for global accessibility outages or surface notices.

## Existing State To Preserve

- `PushNotificationEventEntity.notificationKey` is the base lifecycle key.
- ACTIVE and CLEARED events currently share the same base `notificationKey`.
- `PushNotificationEventEntity.dedupeKey` already prevents routine active resend for the same saved-commute or line event.
- `PushLineEventObservationEntity` already lets line-wide clearances send even when active pushes were suppressed or failed.
- `/api/account/push/active` already returns `activeTags`, `retainedTags`, and `cleanupAllowed`.
- `frontend/public/sw.js` already uses `activeTags` for stale ACTIVE suppression and `retainedTags` for cleanup.
- Existing worktree may contain unrelated frontend edits. Preserve them.

## File Structure

Create:

- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDisplayTags.java`
  Owns display-tag construction and legacy-tag helpers.
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDisplayTagsTest.java`
  Unit coverage for display tag formats and retained-tag expansion.

Modify:

- `backend/src/main/java/com/calebhabesh/linewatch/push/PushProperties.java`
  Change cleared notification retention default from 4 hours to 24 hours.
- `backend/src/main/resources/application.yml`
  Change env fallback from `PT4H` to `PT24H`.
- `.env.production.example`
  Change documented retention from `PT4H` to `PT24H`.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java`
  Add a batched `notifications` field to pending notification responses while preserving the single `notification` field.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDeliveryRepository.java`
  Add an oldest-first pending batch query and keep the retained-clearance query returning base lifecycle keys.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java`
  Return display tags to the service worker and batch pending notifications.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDispatchService.java`
  Use state-specific display tags for Web Push topics.
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`
  Update active/retained tag expectations, pending batch expectations, and retention tests.
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java`
  Update exact Web Push topic expectations and add active-vs-cleared topic separation coverage.
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationControllerTest.java`
  Update pending response and retained display-tag expectations.
- `frontend/public/sw.js`
  Display all pending notifications in chronological order and use display-tag-aware stale checks.
- `frontend/tests/pwa.test.mjs`
  Add regression coverage for split active/cleared notifications, batch draining, stale active suppression, and cleanup retention.
- `frontend/tests/smoke/api-stub.mjs`
  Update push active stub tags to display-tag shape.
- `README.md`
  Document split lifecycle notifications and the bounded retention policy.
- `AGENTS.md`
  Update current reality and guardrails.
- `GEMINI.md`
  Mirror `AGENTS.md`.

Do not change notification copy, push preferences, saved-commute matching, line observation matching, or alert history rendering in this slice.

---

### Task 1: Establish Baseline

**Files:**

- Read: `AGENTS.md`
- Read: `GEMINI.md`
- Read: `README.md`
- Read: `docs/superpowers/plans/2026-06-26-cleared-push-notification-retention.md`
- Read: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java`
- Read: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDispatchService.java`
- Read: `frontend/public/sw.js`
- Read: `frontend/tests/pwa.test.mjs`

- [ ] **Step 1: Confirm current worktree**

Run:

```bash
git status --short
```

Expected: any existing unrelated edits are noted and preserved. Do not reset files outside this plan.

- [ ] **Step 2: Run focused backend baseline**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationServiceTest,PushNotificationControllerTest,PushNotificationDispatchServiceTest test
```

Expected: PASS before behavior changes.

- [ ] **Step 3: Run focused service-worker baseline**

Run:

```bash
node --test frontend/tests/pwa.test.mjs
```

Expected: PASS before behavior changes.

- [ ] **Step 4: Record current replacement behavior**

Confirm:

```text
PushNotificationService.tagFor(event) returns event.getNotificationKey()
PushNotificationDispatchService.sendEventToSubscriptions uses topicFor(event.getNotificationKey())
sw.js passes notification.tag directly to showNotification
ACTIVE and CLEARED events share event.getNotificationKey()
```

Expected: these facts explain why active and cleared currently replace each other.

---

### Task 2: Add Display Tag Helper

**Files:**

- Create: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDisplayTags.java`
- Create: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDisplayTagsTest.java`

- [ ] **Step 1: Write display-tag tests**

Create `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDisplayTagsTest.java`:

```java
package com.calebhabesh.linewatch.push;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class PushNotificationDisplayTagsTest {
    private static final String BASE_KEY = "saved-commute-impact|commute_1|outbound|delay|delay-line-1";

    @Test
    void buildsStateSpecificDisplayTagsFromTheStableLifecycleKey() {
        assertThat(PushNotificationDisplayTags.active(BASE_KEY))
            .isEqualTo(BASE_KEY + "|active");
        assertThat(PushNotificationDisplayTags.cleared(BASE_KEY))
            .isEqualTo(BASE_KEY + "|cleared");
        assertThat(PushNotificationDisplayTags.forState(BASE_KEY, "ACTIVE"))
            .isEqualTo(BASE_KEY + "|active");
        assertThat(PushNotificationDisplayTags.forState(BASE_KEY, "CLEARED"))
            .isEqualTo(BASE_KEY + "|cleared");
    }

    @Test
    void expandsClearedLifecycleKeyToBothVisibleRowsPlusLegacyTag() {
        assertThat(PushNotificationDisplayTags.retainedTagsForClearedLifecycleKey(BASE_KEY))
            .containsExactly(BASE_KEY + "|active", BASE_KEY + "|cleared", BASE_KEY);
    }

    @Test
    void keepsDisplayTagListsDistinctAndBlankSafe() {
        assertThat(PushNotificationDisplayTags.active(null)).isEmpty();
        assertThat(PushNotificationDisplayTags.cleared(" ")).isEmpty();
        assertThat(PushNotificationDisplayTags.distinctNonBlank(List.of(
            BASE_KEY + "|active",
            "",
            BASE_KEY + "|active",
            BASE_KEY + "|cleared",
            " "
        ))).containsExactly(BASE_KEY + "|active", BASE_KEY + "|cleared");
    }
}
```

- [ ] **Step 2: Run failing display-tag test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationDisplayTagsTest test
```

Expected before implementation: FAIL because `PushNotificationDisplayTags` does not exist.

- [ ] **Step 3: Create display-tag helper**

Create `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDisplayTags.java`:

```java
package com.calebhabesh.linewatch.push;

import java.util.ArrayList;
import java.util.List;

final class PushNotificationDisplayTags {
    private static final String ACTIVE_SUFFIX = "|active";
    private static final String CLEARED_SUFFIX = "|cleared";

    private PushNotificationDisplayTags() {}

    static String active(String notificationKey) {
        String normalized = normalize(notificationKey);
        return normalized.isEmpty() ? "" : normalized + ACTIVE_SUFFIX;
    }

    static String cleared(String notificationKey) {
        String normalized = normalize(notificationKey);
        return normalized.isEmpty() ? "" : normalized + CLEARED_SUFFIX;
    }

    static String forState(String notificationKey, String state) {
        return "CLEARED".equalsIgnoreCase(normalize(state))
            ? cleared(notificationKey)
            : active(notificationKey);
    }

    static String forEvent(PushNotificationEventEntity event) {
        if (event == null) {
            return "";
        }
        return forState(event.getNotificationKey(), event.getNotificationState());
    }

    static List<String> retainedTagsForClearedLifecycleKey(String notificationKey) {
        String normalized = normalize(notificationKey);
        if (normalized.isEmpty()) {
            return List.of();
        }
        return List.of(active(normalized), cleared(normalized), normalized);
    }

    static List<String> distinctNonBlank(List<String> tags) {
        if (tags == null || tags.isEmpty()) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        for (String tag : tags) {
            String normalized = normalize(tag);
            if (!normalized.isEmpty() && !result.contains(normalized)) {
                result.add(normalized);
            }
        }
        return result;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
```

- [ ] **Step 4: Run display-tag test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationDisplayTagsTest test
```

Expected: PASS.

- [ ] **Step 5: Check helper diff**

Run:

```bash
git diff -- backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDisplayTags.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDisplayTagsTest.java
```

Expected: only the new helper and focused unit test are present. Do not commit unless the user explicitly asks for commits.

---

### Task 3: Batch Pending Notifications

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDeliveryRepository.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationControllerTest.java`

- [ ] **Step 1: Update pending response test for display tags**

In `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`, change the active tag assertion in `latestPendingNotificationUsesStableTagAndLifecycleState` to:

```java
assertThat(response.notification()).isNotNull();
assertThat(response.notification().tag()).isEqualTo("saved-commute-impact|commute_1|outbound|delay|delay-line-1|active");
assertThat(response.notifications()).extracting(PushResponses.PendingPushNotification::tag)
    .containsExactly("saved-commute-impact|commute_1|outbound|delay|delay-line-1|active");
```

- [ ] **Step 2: Add pending batch test**

Add this test to `PushNotificationServiceTest` before the helper method:

```java
@Test
void latestPendingNotificationReturnsPendingBatchInChronologicalOrderWithDisplayTags() {
    String endpoint = "https://fcm.googleapis.com/fcm/send/subscription";
    String endpointHash = PushNotificationService.hashEndpoint(endpoint);
    PushSubscriptionEntity subscription = PushSubscriptionEntity.create(
        "push_subscription_1",
        account,
        endpoint,
        endpointHash,
        "p256dh-key",
        "auth-secret",
        "Chrome Android",
        Instant.parse("2026-06-05T14:45:00Z")
    );
    PushNotificationCandidate candidate = candidate(
        "commute_1",
        "outbound",
        "line-1",
        "1",
        "saved-commute-impact",
        "delay",
        "on-change",
        "saved-commute-impact|commute_1|outbound|delay|delay-line-1",
        "dedupe-1",
        "Finch to Union",
        "Morning commute",
        Instant.parse("2026-06-05T14:20:00Z"),
        "/?panel=commutes&commute=commute_1"
    );
    PushNotificationEventEntity activeEvent = PushNotificationEventEntity.create(
        "push_event_active",
        candidate,
        Instant.parse("2026-06-05T15:00:00Z")
    );
    PushNotificationEventEntity clearedEvent = PushNotificationEventEntity.cleared(
        "push_event_cleared",
        activeEvent,
        Instant.parse("2026-06-05T15:20:00Z"),
        formatter
    );
    PushNotificationDeliveryEntity activeDelivery = PushNotificationDeliveryEntity.create(
        "push_delivery_active",
        activeEvent,
        subscription,
        PushDeliveryResult.accepted(202),
        Instant.parse("2026-06-05T15:00:30Z")
    );
    PushNotificationDeliveryEntity clearedDelivery = PushNotificationDeliveryEntity.create(
        "push_delivery_cleared",
        clearedEvent,
        subscription,
        PushDeliveryResult.accepted(202),
        Instant.parse("2026-06-05T15:20:30Z")
    );
    when(deliveryRepository.findPendingBatchForSubscription("user_1", endpointHash, PageRequest.of(0, 5)))
        .thenReturn(List.of(activeDelivery, clearedDelivery));

    PushResponses.PendingPushNotificationResponse response = service.latestPendingNotification(
        account,
        new PushRequests.SubscriptionEndpointRequest(endpoint)
    );

    assertThat(response.notifications()).extracting(PushResponses.PendingPushNotification::tag)
        .containsExactly(
            "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
            "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared"
        );
    assertThat(response.notification().tag())
        .isEqualTo("saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared");
    assertThat(activeDelivery.getDisplayedAt()).isEqualTo(clock.instant());
    assertThat(clearedDelivery.getDisplayedAt()).isEqualTo(clock.instant());
}
```

- [ ] **Step 3: Run failing service test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationServiceTest test
```

Expected before implementation: FAIL because the batched response and repository method do not exist.

- [ ] **Step 4: Add batched response shape**

In `PushResponses.java`, replace:

```java
public record PendingPushNotificationResponse(PendingPushNotification notification) {}
```

with:

```java
public record PendingPushNotificationResponse(
    PendingPushNotification notification,
    List<PendingPushNotification> notifications
) {
    public PendingPushNotificationResponse(PendingPushNotification notification) {
        this(notification, notification == null ? List.of() : List.of(notification));
    }
}
```

`PushResponses.java` already imports `java.util.List`; keep that import.

- [ ] **Step 5: Add oldest-first pending batch query**

In `PushNotificationDeliveryRepository.java`, add below `findPendingForSubscription(...)`:

```java
@Query("""
    select delivery
    from PushNotificationDeliveryEntity delivery
    join fetch delivery.event event
    join fetch delivery.subscription subscription
    where subscription.account.id = :accountId
      and subscription.endpointHash = :endpointHash
      and subscription.enabled = true
      and delivery.displayedAt is null
    order by delivery.createdAt asc
    """)
List<PushNotificationDeliveryEntity> findPendingBatchForSubscription(
    @Param("accountId") String accountId,
    @Param("endpointHash") String endpointHash,
    Pageable pageable
);
```

Leave the existing newest-first `findPendingForSubscription(...)` in place only if other tests still use it. The service should switch to the batch query.

- [ ] **Step 6: Implement pending batch mapping**

In `PushNotificationService.latestPendingNotification(...)`, replace the current `findPendingForSubscription(...).stream().findFirst()` pipeline with:

```java
List<PushNotificationDeliveryEntity> deliveries = deliveryRepository.findPendingBatchForSubscription(
    account.getId(),
    endpointHash,
    PageRequest.of(0, 5)
);
if (deliveries.isEmpty()) {
    return new PushResponses.PendingPushNotificationResponse(null, List.of());
}

List<PushResponses.PendingPushNotification> notifications = deliveries.stream()
    .map(delivery -> {
        delivery.markDisplayed(clock.instant());
        PushNotificationEventEntity event = delivery.getEvent();
        return new PushResponses.PendingPushNotification(
            event.getTitle(),
            event.getBody(),
            event.getUrl(),
            tagFor(event),
            event.getNotificationState(),
            event.getCreatedAt().toString()
        );
    })
    .toList();

return new PushResponses.PendingPushNotificationResponse(
    notifications.get(notifications.size() - 1),
    notifications
);
```

In `tagFor(PushNotificationEventEntity event)`, return:

```java
return PushNotificationDisplayTags.forEvent(event);
```

Keep `tagFor(PushNotificationCandidate candidate)` returning the base `candidate.notificationKey()` for internal correlation if it is still used.

- [ ] **Step 7: Update controller test**

In `PushNotificationControllerTest.returnsLatestPendingNotificationForCurrentSubscription`, update the expected notification tag to:

```java
"saved-commute-impact|commute_1|outbound|delay|delay-line-1|active"
```

Construct the response with:

```java
new PushResponses.PendingPushNotificationResponse(notification)
```

Expected: the constructor still populates `notifications` with that single notification.

- [ ] **Step 8: Run focused backend tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationServiceTest,PushNotificationControllerTest test
```

Expected: PASS.

- [ ] **Step 9: Check pending batch diff**

Run:

```bash
git diff -- backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDeliveryRepository.java backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationControllerTest.java
```

Expected: pending delivery draining is batched, chronological, and backwards-compatible through the single `notification` field. Do not commit unless the user explicitly asks for commits.

---

### Task 4: Return Display Tags For Active And Retained Cleanup

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushProperties.java`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `.env.production.example`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationControllerTest.java`

- [ ] **Step 1: Update active/retained expectations**

In `PushNotificationServiceTest.activeNotificationsReturnsCurrentSavedCommuteTagsAllowedBySubscriptionPreferences`, update expectations to display tags:

```java
assertThat(response.activeTags()).containsExactly(
    "saved-commute-impact|commute_1|outbound|reduced-speed-zone|rsz-line-1|active"
);
assertThat(response.retainedTags()).containsExactly(
    "saved-commute-impact|commute_1|outbound|reduced-speed-zone|rsz-line-1|active",
    "saved-commute-impact|commute_1|outbound|reduced-speed-zone|rsz-line-1"
);
```

The base tag in `retainedTags` is a one-release compatibility bridge for notifications displayed by the previous same-tag implementation.

- [ ] **Step 2: Update retained-clearance expectation**

In `activeNotificationsRetainsDisplayedClearedNotificationsForConfiguredGracePeriod`, update:

```java
assertThat(response.retainedTags())
    .containsExactly(
        "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
        "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared",
        "saved-commute-impact|commute_1|outbound|delay|delay-line-1"
    );
```

- [ ] **Step 3: Update controller retained-tag expectation**

In `PushNotificationControllerTest.returnsActiveNotificationTagsForCurrentSubscription`, change:

```java
assertThat(response.retainedTags()).containsExactly("saved-commute-impact|commute_1|delay-line-1");
```

to:

```java
assertThat(response.retainedTags()).containsExactly("saved-commute-impact|commute_1|delay-line-1|active");
```

Also update the constructed expected response to use display tags:

```java
new PushResponses.ActivePushNotificationsResponse(
    java.util.List.of("saved-commute-impact|commute_1|delay-line-1|active")
)
```

- [ ] **Step 4: Run failing service/controller tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationServiceTest,PushNotificationControllerTest test
```

Expected before implementation: FAIL because backend still returns base tags.

- [ ] **Step 5: Map active candidate keys to display tags**

In `PushNotificationService.activeNotifications(...)`, replace:

```java
List<String> activeTags = allCandidates.stream()
    .filter(candidate -> preferenceService.allows(preferences, candidate))
    .map(PushNotificationCandidate::notificationKey)
    .distinct()
    .toList();
```

with:

```java
List<String> activeNotificationKeys = allCandidates.stream()
    .filter(candidate -> preferenceService.allows(preferences, candidate))
    .map(PushNotificationCandidate::notificationKey)
    .distinct()
    .toList();

List<String> activeTags = activeNotificationKeys.stream()
    .map(PushNotificationDisplayTags::active)
    .toList();

List<String> retainedTags = retainedNotificationTags(account.getId(), endpointHash, activeNotificationKeys);
return new PushResponses.ActivePushNotificationsResponse(activeTags, retainedTags, true);
```

- [ ] **Step 6: Expand retained tags**

Change `retainedNotificationTags(...)` signature to:

```java
private List<String> retainedNotificationTags(String accountId, String endpointHash, List<String> activeNotificationKeys)
```

Replace its body with:

```java
List<String> retainedTags = new ArrayList<>();
for (String notificationKey : activeNotificationKeys) {
    retainedTags.add(PushNotificationDisplayTags.active(notificationKey));
    retainedTags.add(notificationKey);
}

Duration retention = properties.getClearedNotificationRetention();
if (retention == null || retention.isZero() || retention.isNegative()) {
    return PushNotificationDisplayTags.distinctNonBlank(retainedTags);
}

Instant displayedAtAfter = clock.instant().minus(retention);
List<String> recentlyDisplayedClearedKeys = deliveryRepository.findRecentlyDisplayedClearedNotificationKeys(
    accountId,
    endpointHash,
    RETAINED_CLEARED_CATEGORIES,
    displayedAtAfter
);
if (recentlyDisplayedClearedKeys != null) {
    for (String notificationKey : recentlyDisplayedClearedKeys) {
        retainedTags.addAll(PushNotificationDisplayTags.retainedTagsForClearedLifecycleKey(notificationKey));
    }
}

return PushNotificationDisplayTags.distinctNonBlank(retainedTags);
```

- [ ] **Step 7: Change retention default to 24 hours**

In `PushProperties.java`, change:

```java
private Duration clearedNotificationRetention = Duration.ofHours(4);
```

to:

```java
private Duration clearedNotificationRetention = Duration.ofHours(24);
```

In `backend/src/main/resources/application.yml`, change fallback:

```yaml
cleared-notification-retention: ${LINEWATCH_PUSH_CLEARED_NOTIFICATION_RETENTION:PT24H}
```

In `.env.production.example`, change:

```bash
LINEWATCH_PUSH_CLEARED_NOTIFICATION_RETENTION=PT24H
```

- [ ] **Step 8: Run focused backend tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationServiceTest,PushNotificationControllerTest test
```

Expected: PASS.

- [ ] **Step 9: Check active endpoint diff**

Run:

```bash
git diff -- backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java backend/src/main/java/com/calebhabesh/linewatch/push/PushProperties.java backend/src/main/resources/application.yml .env.production.example backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationControllerTest.java
```

Expected: `/api/account/push/active` returns display tags, active cleanup keeps the legacy base tag during migration, and default retention is `PT24H`. Do not commit unless the user explicitly asks for commits.

---

### Task 5: Split Web Push Topics By Lifecycle State

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDispatchService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java`

- [ ] **Step 1: Add topic separation test**

Add this focused unit test to `PushNotificationDispatchServiceTest` near the existing `topicFor` coverage or before helper methods:

```java
@Test
void topicsDifferForActiveAndClearedDisplayTagsOfTheSameLifecycleKey() {
    String lifecycleKey = "line-current|line-1|delay|delay-1";

    String activeTopic = PushNotificationDispatchService.topicFor(
        PushNotificationDisplayTags.active(lifecycleKey)
    );
    String clearedTopic = PushNotificationDispatchService.topicFor(
        PushNotificationDisplayTags.cleared(lifecycleKey)
    );

    assertThat(activeTopic).isNotEqualTo(clearedTopic);
    assertThat(activeTopic).hasSizeLessThanOrEqualTo(32);
    assertThat(clearedTopic).hasSizeLessThanOrEqualTo(32);
}
```

- [ ] **Step 2: Update exact topic stubs**

Where tests currently stub the old topic for the base key:

```java
when(webPushClient.send(subscription, "AVEPD-AuDIedMxfArNYRpmed5ppkzhC3"))
```

replace exact hashes with computed values:

```java
when(webPushClient.send(
    eq(subscription),
    eq(PushNotificationDispatchService.topicFor(PushNotificationDisplayTags.active(
        "saved-commute-impact|commute_1|outbound|delay|delay-line-1"
    )))
)).thenReturn(PushDeliveryResult.accepted(202));
```

Use the exact notification key from each test. This avoids brittle hard-coded hash changes.

- [ ] **Step 3: Run failing dispatch tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationDispatchServiceTest test
```

Expected before implementation: FAIL where the dispatch service still sends the base-key topic.

- [ ] **Step 4: Use display tag for Web Push topic**

In `PushNotificationDispatchService.sendEventToSubscriptions(...)`, replace:

```java
PushDeliveryResult result = webPushClient.send(subscription, topicFor(event.getNotificationKey()));
```

with:

```java
PushDeliveryResult result = webPushClient.send(subscription, topicFor(PushNotificationDisplayTags.forEvent(event)));
```

Keep `topicFor(String notificationKey)` as a static method, but its argument should now be understood as the display tag string.

- [ ] **Step 5: Run dispatch tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationDispatchServiceTest test
```

Expected: PASS.

- [ ] **Step 6: Check lifecycle topic diff**

Run:

```bash
git diff -- backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDispatchService.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java
```

Expected: Web Push topics are derived from lifecycle display tags, not the base notification key. Do not commit unless the user explicitly asks for commits.

---

### Task 6: Display Split Lifecycle Notifications In The Service Worker

**Files:**

- Modify: `frontend/public/sw.js`
- Modify: `frontend/tests/pwa.test.mjs`
- Modify: `frontend/tests/smoke/api-stub.mjs`

- [ ] **Step 1: Update default PWA fixture tags**

In `frontend/tests/pwa.test.mjs`, update the default `serviceWorkerPush` fixture:

```js
tag: "saved-commute-impact|commute_1|dedupe-1|active",
```

and:

```js
activeTags: ["saved-commute-impact|commute_1|dedupe-1|active"],
retainedTags: ["saved-commute-impact|commute_1|dedupe-1|active"],
```

In `serviceWorkerMessage`, update default retained values the same way:

```js
activeTags: ["saved-commute-impact|commute_1|dedupe-1|active"],
retainedTags: ["saved-commute-impact|commute_1|dedupe-1|active"],
```

- [ ] **Step 2: Add split display test**

Add this test after the existing active notification display test:

```js
it("shows active and cleared lifecycle notifications as separate browser notifications", async () => {
  const { shownNotifications } = await serviceWorkerPush({
    fetchBody: {
      notification: {
        title: "✅ Line 1 Yonge-University Delay Cleared",
        body: "Service between Finch and Union stations has resumed.\n🕗 Jun 5, 11:00 AM",
        url: "/",
        tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared",
        state: "CLEARED",
        timestamp: "2026-06-05T15:20:00Z",
      },
      notifications: [
        {
          title: "⚠️ Line 1 Yonge-University Delay",
          body: "Finch to Union.\n🕗 Jun 5, 10:20 AM",
          url: "/?panel=commutes&commute=commute_1",
          tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
          state: "ACTIVE",
          timestamp: "2026-06-05T15:00:00Z",
        },
        {
          title: "✅ Line 1 Yonge-University Delay Cleared",
          body: "Service between Finch and Union stations has resumed.\n🕗 Jun 5, 11:00 AM",
          url: "/",
          tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared",
          state: "CLEARED",
          timestamp: "2026-06-05T15:20:00Z",
        },
      ],
      activeTags: [],
      retainedTags: [
        "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
        "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared",
      ],
    },
  });

  assert.equal(shownNotifications.length, 2);
  assert.equal(shownNotifications[0].options.tag, "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active");
  assert.equal(shownNotifications[1].options.tag, "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared");
  assert.equal(shownNotifications[0].options.silent, undefined);
  assert.equal(shownNotifications[1].options.silent, true);
});
```

- [ ] **Step 3: Update stale active retained test**

Update `does not show a stale active notification just because a cleared tag is retained` so the active notification tag ends with `|active`, and retained tags include only the cleared display tag:

```js
tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
activeTags: [],
retainedTags: ["saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared"],
```

Expected assertion remains:

```js
assert.equal(shownNotifications.length, 0);
```

- [ ] **Step 4: Add retained active partner test**

Add:

```js
it("allows a pending active notification when the same batch also contains its clearance", async () => {
  const { shownNotifications } = await serviceWorkerPush({
    fetchBody: {
      notification: null,
      notifications: [
        {
          title: "⚠️ Line 1 Yonge-University Delay",
          body: "Finch to Union.\n🕗 Jun 5, 10:20 AM",
          url: "/?panel=commutes&commute=commute_1",
          tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
          state: "ACTIVE",
          timestamp: "2026-06-05T15:00:00Z",
        },
        {
          title: "✅ Line 1 Yonge-University Delay Cleared",
          body: "Service between Finch and Union stations has resumed.\n🕗 Jun 5, 11:00 AM",
          url: "/",
          tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared",
          state: "CLEARED",
          timestamp: "2026-06-05T15:20:00Z",
        },
      ],
      activeTags: [],
      retainedTags: [
        "saved-commute-impact|commute_1|outbound|delay|delay-line-1|active",
        "saved-commute-impact|commute_1|outbound|delay|delay-line-1|cleared",
      ],
    },
  });

  assert.equal(shownNotifications.length, 2);
});
```

- [ ] **Step 5: Run failing PWA test**

Run:

```bash
node --test frontend/tests/pwa.test.mjs
```

Expected before implementation: FAIL because `sw.js` only shows one `notification` and does not process `notifications`.

- [ ] **Step 6: Add display-tag helpers to service worker**

In `frontend/public/sw.js`, add these helper functions near `shouldShowFallbackPushNotification(...)`:

```js
function normalizePendingNotifications(body) {
  if (Array.isArray(body?.notifications)) {
    return body.notifications.filter((notification) => notification && typeof notification.tag === "string");
  }
  return body?.notification && typeof body.notification.tag === "string" ? [body.notification] : [];
}

function notificationStateFor(notification) {
  return notification.state === "CLEARED" ? "CLEARED" : "ACTIVE";
}

function baseLifecycleTag(tag) {
  if (typeof tag !== "string") return "";
  if (tag.endsWith("|active")) return tag.slice(0, -"|active".length);
  if (tag.endsWith("|cleared")) return tag.slice(0, -"|cleared".length);
  return tag;
}

function batchHasClearedPartner(notification, pendingNotifications) {
  const baseTag = baseLifecycleTag(notification.tag);
  if (!baseTag) return false;
  return pendingNotifications.some((candidate) => (
    candidate !== notification
    && notificationStateFor(candidate) === "CLEARED"
    && baseLifecycleTag(candidate.tag) === baseTag
  ));
}

function shouldShowPendingNotification(notification, pendingNotifications, tagState) {
  const notificationState = notificationStateFor(notification);
  if (
    notificationState !== "CLEARED"
    && Array.isArray(tagState?.activeTags)
    && !tagState.activeTags.includes(notification.tag)
  ) {
    return Array.isArray(tagState?.retainedTags)
      && tagState.retainedTags.includes(notification.tag)
      && batchHasClearedPartner(notification, pendingNotifications);
  }

  if (
    notificationState === "CLEARED"
    && Array.isArray(tagState?.retainedTags)
    && !tagState.retainedTags.includes(notification.tag)
  ) {
    return false;
  }

  return true;
}
```

- [ ] **Step 7: Display all pending notifications**

In `showPendingPushNotification()`, replace:

```js
const notification = body.notification;
const tagState = await reconcilePushNotifications();
if (!notification) {
  return;
}
const notificationState = notification.state === "CLEARED" ? "CLEARED" : "ACTIVE";
// Existing stale active and stale cleared checks are replaced by shouldShowPendingNotification.
await self.registration.showNotification(notification.title, options);
```

with:

```js
const pendingNotifications = normalizePendingNotifications(body);
const tagState = await reconcilePushNotifications();
if (pendingNotifications.length === 0) {
  return;
}

for (const notification of pendingNotifications) {
  if (!shouldShowPendingNotification(notification, pendingNotifications, tagState)) {
    continue;
  }

  const notificationState = notificationStateFor(notification);
  const options = {
    body: notification.body,
    tag: notification.tag,
    icon: NOTIFICATION_ICON_URL,
    badge: NOTIFICATION_BADGE_URL,
    renotify: false,
    requireInteraction: true,
    data: {
      state: notificationState,
      url: notification.url || "/",
    },
  };
  if (notificationState === "CLEARED") {
    options.silent = true;
  }
  const timestamp = Date.parse(notification.timestamp);
  if (Number.isFinite(timestamp)) {
    options.timestamp = timestamp;
  }

  await self.registration.showNotification(notification.title, options);
}
```

Keep fallback behavior unchanged when `/api/account/push/latest` fails.

- [ ] **Step 8: Update smoke API stub tags**

In `frontend/tests/smoke/api-stub.mjs`, change:

```js
sendJson(request, response, 200, { activeTags: [], retainedTags: [] });
```

to remain empty for the default stub. No display tag is needed when the smoke stub has no notifications.

- [ ] **Step 9: Run focused frontend tests**

Run:

```bash
node --test frontend/tests/pwa.test.mjs
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 10: Check service worker split diff**

Run:

```bash
git diff -- frontend/public/sw.js frontend/tests/pwa.test.mjs frontend/tests/smoke/api-stub.mjs
```

Expected: the service worker processes `notifications` in order, still supports the legacy single `notification` response, and only changes the smoke stub if it needs display-tag shaped push data. Do not commit unless the user explicitly asks for commits.

---

### Task 7: Protect No-Routine-Update Semantics

**Files:**

- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java`

- [ ] **Step 1: Add no-routine-update assertion**

Add this test to `PushNotificationDispatchServiceTest` near `doesNotSendCandidateAgainWhenDedupeKeyAlreadyExists`:

```java
@Test
void doesNotSendRoutineUpdateWhenLifecycleNotificationAlreadyExists() {
    SavedCommuteEntity commute = SavedCommuteEntity.create(
        "commute_1",
        account,
        "Morning commute",
        "finch",
        "union",
        true,
        Instant.parse("2026-06-05T14:30:00Z")
    );
    PushNotificationCandidate candidate = candidate(
        "commute_1",
        "outbound",
        "line-1",
        "1",
        "saved-commute-impact",
        "delay",
        "on-change",
        "saved-commute-impact|commute_1|outbound|delay|delay-line-1",
        "dedupe-1",
        "Finch to Union",
        "Morning commute",
        Instant.parse("2026-06-05T14:20:00Z"),
        "/?panel=commutes&commute=commute_1"
    );
    PushNotificationPreferenceEntity preferences = PushNotificationPreferenceEntity.create(account, Instant.parse("2026-06-05T14:00:00Z"));
    when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
    when(preferenceService.allows(any(), any())).thenReturn(true);
    when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
    when(lineSubscriptionPushPlanner.candidatesFor(anyString(), anyList())).thenReturn(List.of());
    when(subscriptionRepository.findEnabledAccountIds()).thenReturn(List.of("user_1"));
    when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of(commute));
    when(planner.candidatesFor(commute)).thenReturn(List.of(candidate));
    when(eventRepository.existsByDedupeKey("dedupe-1")).thenReturn(true);

    service.evaluateSavedCommuteNotifications();

    verify(webPushClient, never()).send(any(), anyString());
    verify(deliveryRepository, never()).save(any(PushNotificationDeliveryEntity.class));
}
```

- [ ] **Step 2: Run dispatch tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationDispatchServiceTest test
```

Expected: PASS. This should pass without implementation changes because existing dedupe behavior already suppresses routine updates.

- [ ] **Step 3: Check regression-test diff**

Run:

```bash
git diff -- backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationDispatchServiceTest.java
```

Expected: no-routine-update behavior is explicitly covered. If Task 5 already added equivalent coverage, note that the requirement is covered and avoid duplicate tests.

---

### Task 8: Update Documentation

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Update README Web Push behavior**

Replace the current sentence that says LineWatch sends a quiet same-tag cleared replacement with:

```text
When a current disruption clears, LineWatch sends a quiet `✅ Line {N} {Line Name} {Event Type} Cleared` notification with a separate browser display tag, so the initial alert and the clearance can both remain visible where the browser/OS allows it. Routine TTC feed updates while the same alert remains active are kept in the app and alert history; they do not create additional OS pushes.
```

In the same paragraph, update retention wording to:

```text
LineWatch retains both visible lifecycle entries from cleanup for `LINEWATCH_PUSH_CLEARED_NOTIFICATION_RETENTION`, default `PT24H`, before cleanup may close them.
```

Keep the platform limitation wording:

```text
Android and iOS may still age, rank, group, or remove PWA notifications according to browser and OS policy; in-app Alert History is the reliable history surface.
```

- [ ] **Step 2: Update API table**

Update `/api/account/push/latest` row to:

```text
Let the service worker fetch and mark displayed the current batch of pending notification payloads for the current subscription.
```

Update `/api/account/push/active` row to:

```text
Return active display tags and retained lifecycle display tags so the service worker can close stale LineWatch notifications without removing recent active/cleared lifecycle entries too early.
```

- [ ] **Step 3: Update AGENTS.md and GEMINI.md together**

In both files, replace the push current-reality sentence about silent same-tag clearance replacements with:

```text
Supported rapid-transit push titles identify the line, official line name, and event type; active bodies show the source start time when available. Service-restored Web Push notifications are sent as separate quiet lifecycle entries rather than replacing the initial alert, and routine still-active feed updates do not create new OS pushes. Displayed lifecycle push entries are retained from LineWatch cleanup for the configured cleared-notification retention window, but Android/iOS browser policy can still age or remove PWA notifications.
```

- [ ] **Step 4: Run docs guard search**

Run:

```bash
rg -n "same-tag|replacement|retained from LineWatch cleanup|notification history|guaranteed|surface.*push|accessibility.*push|email notifications" README.md AGENTS.md GEMINI.md
```

Expected:

- `same-tag` no longer describes current service-restored push display behavior.
- Any `guaranteed` reference is a limitation, not a product claim.
- Surface notices, accessibility outages, and email remain explicitly outside push.

- [ ] **Step 5: Check docs diff**

Run:

```bash
git diff -- README.md AGENTS.md GEMINI.md
```

Expected: documentation describes split lifecycle notifications, bounded cleanup retention, and platform limits without claiming guaranteed OS persistence. Do not commit unless the user explicitly asks for commits.

---

### Task 9: Full Verification

**Files:** no edits unless verification exposes a defect.

- [ ] **Step 1: Run backend tests**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: PASS.

- [ ] **Step 2: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: PASS.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run frontend lint**

Run:

```bash
npm --prefix frontend run lint
```

Expected: exit code 0. Existing warnings may remain if unrelated; report exact warnings.

- [ ] **Step 5: Run focused PWA test**

Run:

```bash
node --test frontend/tests/pwa.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Optional manual mobile verification**

Use a configured mobile push environment:

```bash
scripts/dev-cloudflare-push.sh
```

Manual expectations:

- When a fresh eligible impact starts, one active notification appears.
- Routine feed refreshes for the same still-active impact do not create additional OS notifications.
- When the impact clears, a separate quiet cleared notification appears instead of replacing the active notification.
- Opening the app or receiving later pushes does not close either visible lifecycle notification during the configured retention window.
- After retention expires, LineWatch cleanup may close stale lifecycle notifications.
- In-app Alert History still shows the lifecycle regardless of OS notification behavior.

- [ ] **Step 7: Final worktree review**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intended files changed. No secrets or generated credentials are present. Any unrelated pre-existing user edits remain untouched.

---

## Acceptance Criteria

- ACTIVE and CLEARED events for the same base `notificationKey` use different browser notification tags.
- The active display tag format is `<notificationKey>|active`.
- The cleared display tag format is `<notificationKey>|cleared`.
- Backend dedupe and clearance matching still use the base `notificationKey`.
- `/api/account/push/latest` can return multiple pending notifications in chronological display order.
- The service worker displays all pending notifications returned in `notifications`.
- A pending active notification is suppressed when stale unless it is paired with a cleared notification in the same pending batch and retained by the backend.
- Routine still-active feed updates do not create additional OS push notifications.
- Web Push topics differ for active and cleared lifecycle notifications.
- `/api/account/push/active` returns display tags in `activeTags` and `retainedTags`.
- Recent cleared lifecycle retention preserves both active and cleared display tags, plus the legacy base tag for one-release compatibility.
- Default cleanup retention is `PT24H`.
- README, AGENTS, and GEMINI describe split lifecycle notifications without claiming guaranteed OS tray persistence.

## Gemini 3.5 Flash Notes

- Preserve unrelated worktree changes. Do not reset `frontend/src/app/globals.css`, `frontend/src/components/MobileBottomNav.tsx`, or mobile tests if they are already modified.
- Do not change user-visible notification copy in this slice.
- Do not change push preference defaults in this slice.
- Do not change `PushNotificationEventEntity.notificationKey` persistence or migration schema.
- Prefer the shared `PushNotificationDisplayTags` helper over ad hoc string concatenation in backend code.
- Keep service-worker display-tag parsing local to `sw.js`; do not add frontend dependencies.
- If a test already covers one of the added assertions after an earlier task, update the existing test rather than duplicating it.

# Cleared Push Notification Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep LineWatchTO service-restored Web Push notifications visible through LineWatch cleanup for a bounded grace period, while still closing genuinely stale active alerts.

**Architecture:** Keep the OS notification tray as a best-effort delivery surface and make LineWatch cleanup smarter. The backend will return two tag sets from `/api/account/push/active`: `activeTags` for currently active impact notifications and `retainedTags` for notifications the service worker should keep visible, including recently displayed cleared replacements. The service worker will close only tags absent from `retainedTags`, but it will still suppress stale pending ACTIVE notifications unless their tag appears in `activeTags`.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, PostgreSQL/Flyway schema already present, Next.js PWA service worker JavaScript, Node built-in tests, Maven, JUnit 5, Mockito, AssertJ.

---

## Root Cause

LineWatch already sends service-restored notifications as quiet same-tag replacements. The problem is later cleanup.

Current flow:

1. A push event calls `showPendingPushNotification()` in `frontend/public/sw.js`.
2. The service worker fetches `/api/account/push/latest`.
3. It then calls `reconcilePushNotifications()`, which fetches `/api/account/push/active`.
4. `/api/account/push/active` currently returns only currently active impact tags.
5. `closeInactivePushNotifications(activeTags)` closes any LineWatch notification whose tag is not in that active list.

That is correct for stale ACTIVE disruption notifications, but too aggressive for CLEARED replacements. A cleared notification is intentionally no longer active, so it disappears from `activeTags` and can be closed later when the app foregrounds or another push arrives.

Platform constraint:

- Web Push/PWA notifications cannot reliably use native Android notification groups or guarantee iOS Notification Center persistence.
- `requireInteraction` can request sticky behavior where supported, but support is limited and browser/OS policy can still rank, age, or remove notifications.
- Therefore the product fix is not "make OS notifications permanent"; it is "stop LineWatch from closing useful clearance notifications too early, and keep in-app Alert History as the reliable history surface."

## Product Policy

- ACTIVE disruption notifications remain cleanup-controlled and must close when they are no longer dashboard-visible.
- CLEARED/service-restored notifications remain same-tag replacements and stay quiet (`silent: true`, `renotify: false`).
- CLEARED notifications should be retained by LineWatch cleanup for a configurable TTL, default `PT4H`.
- After the TTL, the next cleanup may close the cleared notification.
- Cleanup remains disabled when dashboard ingestion freshness is stale.
- If the user disables the browser subscription, cleanup can close all LineWatch notifications for that subscription.
- This does not add push notifications for accessibility outages or surface notices.
- This does not claim guaranteed Android/iOS notification persistence.
- In-app Alert History remains the authoritative place to review older clearances.

## Approach Decision

Recommended: backend-retained tags plus service-worker split handling.

Rejected alternatives:

- `requireInteraction` only: too browser-dependent and does not fix LineWatch's own cleanup path.
- Service-worker-only local TTL: easier, but fragile across service-worker restarts, multiple devices, browser storage clearing, and old delivered events.
- Never close cleared notifications: reduces the complaint but creates stale notification clutter and weakens trust.

The selected approach uses durable backend delivery state. `push_notification_events` already records `notification_state = 'CLEARED'`, and `push_notification_deliveries.displayed_at` already records when a subscription fetched a pending payload for display. No schema change is required.

## File Structure

Modify:

- `backend/src/main/java/com/calebhabesh/linewatch/push/PushProperties.java`
  Adds the configurable cleared-notification retention duration.
- `backend/src/main/resources/application.yml`
  Binds `LINEWATCH_PUSH_CLEARED_NOTIFICATION_RETENTION`, default `PT4H`.
- `.env.production.example`
  Documents the production environment variable.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java`
  Adds `retainedTags` while preserving existing constructors.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDeliveryRepository.java`
  Adds a query for recently displayed cleared tags for the current subscription endpoint.
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java`
  Builds `activeTags` and `retainedTags` separately.
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`
  Covers retention, cutoff, stale freshness, and response semantics.
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationControllerTest.java`
  Updates active response construction where needed.
- `frontend/public/sw.js`
  Uses retained tags for cleanup and active tags for stale ACTIVE suppression; requests sticky display where supported.
- `frontend/tests/pwa.test.mjs`
  Adds service-worker regression tests for retained cleared notifications.
- `frontend/tests/smoke/api-stub.mjs`
  Keeps the stubbed active endpoint aligned with the new response shape.
- `README.md`
  Documents behavior and limitations.
- `AGENTS.md`
  Updates current reality/guardrails.
- `GEMINI.md`
  Mirrors the same agent-guidance update as `AGENTS.md`.

Do not create a new table. Do not add a native grouping abstraction. Do not change notification keys, Web Push topics, dedupe keys, or notification copy.

---

### Task 1: Establish The Baseline

**Files:**

- Read: `AGENTS.md`
- Read: `GEMINI.md`
- Read: `README.md`
- Read: `docs/superpowers/specs/2026-06-22-mobile-push-notification-content-design.md`
- Read: `docs/superpowers/plans/2026-06-26-line-wide-notification-stream-observations.md`
- Read: `frontend/public/sw.js`
- Read: `frontend/tests/pwa.test.mjs`
- Read: `backend/src/main/java/com/calebhabesh/linewatch/push/`
- Read: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`

- [ ] **Step 1: Confirm worktree state**

Run:

```bash
git status --short
```

Expected: no unexpected edits. If there are user edits, preserve them and do not reset unrelated files.

- [ ] **Step 2: Run focused backend baseline**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationServiceTest,PushNotificationControllerTest test
```

Expected: PASS before behavior changes. If it fails, stop and record the exact failing tests before editing.

- [ ] **Step 3: Run focused frontend baseline**

Run:

```bash
node --test frontend/tests/pwa.test.mjs
```

Expected: PASS before service-worker behavior changes.

- [ ] **Step 4: Confirm the existing cleanup behavior**

Verify these facts in `frontend/public/sw.js`:

```text
showPendingPushNotification() calls reconcilePushNotifications()
reconcilePushNotifications() calls fetchActivePushNotificationTags()
fetchActivePushNotificationTags() reads body.activeTags
closeInactivePushNotifications(activeTags) closes LineWatch tags not present in activeTags
```

Expected: this confirms the behavior this plan changes.

---

### Task 2: Add Backend Retention Tests

**Files:**

- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`

- [ ] **Step 1: Broaden Mockito imports**

In `PushNotificationServiceTest.java`, replace the current Mockito static imports with:

```java
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
```

Add:

```java
import java.time.Duration;
```

- [ ] **Step 2: Add default repository stubbing**

In `setUp()`, add a default empty retained-clearance query:

```java
@BeforeEach
void setUp() {
    properties.setClearedNotificationRetention(Duration.ofHours(4));
    when(ingestionFreshness.isDashboardFresh()).thenReturn(true);
    when(deliveryRepository.findRecentlyDisplayedClearedNotificationKeys(
        anyString(),
        anyString(),
        anyList(),
        any(Instant.class)
    )).thenReturn(List.of());
}
```

- [ ] **Step 3: Update the existing active-tag test expectation**

In `activeNotificationsReturnsCurrentSavedCommuteTagsAllowedBySubscriptionPreferences`, after the `activeTags()` assertion, add:

```java
assertThat(response.retainedTags()).containsExactly(
    "saved-commute-impact|commute_1|outbound|reduced-speed-zone|rsz-line-1"
);
```

- [ ] **Step 4: Update the stale-ingestion test expectation**

In `activeNotificationsDisablesCleanupWhenDashboardIngestionIsStale`, after the `activeTags()` assertion, add:

```java
assertThat(response.retainedTags()).isEmpty();
```

- [ ] **Step 5: Add the retained-clearance test**

Add this test before `latestPendingNotificationUsesStableTagAndLifecycleState()`:

```java
@Test
void activeNotificationsRetainsDisplayedClearedNotificationsForConfiguredGracePeriod() {
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
    when(subscriptionRepository.findByAccountIdAndEndpointHash("user_1", endpointHash))
        .thenReturn(Optional.of(subscription));
    when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of());
    PushNotificationPreferenceEntity preferences = mock(PushNotificationPreferenceEntity.class);
    when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
    when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
    when(lineSubscriptionPushPlanner.candidatesFor(eq("user_1"), anyList())).thenReturn(List.of());
    when(deliveryRepository.findRecentlyDisplayedClearedNotificationKeys(
        eq("user_1"),
        eq(endpointHash),
        eq(List.of("saved-commute-current", "saved-commute-impact", "line-current")),
        eq(Instant.parse("2026-06-05T11:00:00Z"))
    )).thenReturn(List.of("saved-commute-impact|commute_1|outbound|delay|delay-line-1"));

    PushResponses.ActivePushNotificationsResponse response = service.activeNotifications(
        account,
        new PushRequests.SubscriptionEndpointRequest(endpoint)
    );

    assertThat(response.activeTags()).isEmpty();
    assertThat(response.retainedTags())
        .containsExactly("saved-commute-impact|commute_1|outbound|delay|delay-line-1");
    assertThat(response.cleanupAllowed()).isTrue();
}
```

- [ ] **Step 6: Add the disabled-retention test**

Add:

```java
@Test
void activeNotificationsDoesNotRetainClearedNotificationsWhenRetentionIsDisabled() {
    properties.setClearedNotificationRetention(Duration.ZERO);
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
    when(subscriptionRepository.findByAccountIdAndEndpointHash("user_1", endpointHash))
        .thenReturn(Optional.of(subscription));
    when(savedCommuteRepository.findByAccountIdOrderByCreatedAtAsc("user_1")).thenReturn(List.of());
    PushNotificationPreferenceEntity preferences = mock(PushNotificationPreferenceEntity.class);
    when(preferenceService.preferenceEntityForAccountId("user_1")).thenReturn(preferences);
    when(preferenceService.subscribedLineIds("user_1")).thenReturn(List.of());
    when(lineSubscriptionPushPlanner.candidatesFor(eq("user_1"), anyList())).thenReturn(List.of());

    PushResponses.ActivePushNotificationsResponse response = service.activeNotifications(
        account,
        new PushRequests.SubscriptionEndpointRequest(endpoint)
    );

    assertThat(response.activeTags()).isEmpty();
    assertThat(response.retainedTags()).isEmpty();
    verify(deliveryRepository, never()).findRecentlyDisplayedClearedNotificationKeys(
        anyString(),
        anyString(),
        anyList(),
        any(Instant.class)
    );
}
```

- [ ] **Step 7: Run the failing backend test**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationServiceTest test
```

Expected before implementation: FAIL because `retainedTags()`, `setClearedNotificationRetention(...)`, and/or `findRecentlyDisplayedClearedNotificationKeys(...)` do not exist.

---

### Task 3: Implement Backend Retained Tags

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushProperties.java`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `.env.production.example`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDeliveryRepository.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java`
- Modify: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationControllerTest.java`

- [ ] **Step 1: Add retention property**

In `PushProperties.java`, add:

```java
import java.time.Duration;
```

Add the field near `evaluationDelayMs`:

```java
private Duration clearedNotificationRetention = Duration.ofHours(4);
```

Add getters and setters:

```java
public Duration getClearedNotificationRetention() {
    return clearedNotificationRetention;
}

public void setClearedNotificationRetention(Duration clearedNotificationRetention) {
    this.clearedNotificationRetention = clearedNotificationRetention;
}
```

- [ ] **Step 2: Bind retention in application config**

In `backend/src/main/resources/application.yml`, under `linewatch.push`, add:

```yaml
    cleared-notification-retention: ${LINEWATCH_PUSH_CLEARED_NOTIFICATION_RETENTION:PT4H}
```

Keep indentation aligned with `evaluation-delay-ms`.

- [ ] **Step 3: Document production env knob**

In `.env.production.example`, near `LINEWATCH_PUSH_EVALUATION_DELAY_MS`, add:

```bash
LINEWATCH_PUSH_CLEARED_NOTIFICATION_RETENTION=PT4H
```

- [ ] **Step 4: Extend active push response**

Replace `ActivePushNotificationsResponse` in `PushResponses.java` with:

```java
public record ActivePushNotificationsResponse(
    List<String> activeTags,
    List<String> retainedTags,
    boolean cleanupAllowed
) {
    public ActivePushNotificationsResponse(List<String> activeTags) {
        this(activeTags, activeTags, true);
    }

    public ActivePushNotificationsResponse(List<String> activeTags, boolean cleanupAllowed) {
        this(activeTags, activeTags, cleanupAllowed);
    }
}
```

This preserves source compatibility for existing Java callers while adding a JSON `retainedTags` field for the service worker.

- [ ] **Step 5: Add delivery repository query**

In `PushNotificationDeliveryRepository.java`, add:

```java
import java.time.Instant;
```

Add this method below `findPendingForSubscription(...)`:

```java
@Query("""
    select distinct event.notificationKey
    from PushNotificationDeliveryEntity delivery
    join delivery.event event
    join delivery.subscription subscription
    where subscription.account.id = :accountId
      and subscription.endpointHash = :endpointHash
      and subscription.enabled = true
      and delivery.displayedAt is not null
      and event.notificationState = 'CLEARED'
      and event.category in :categories
      and event.createdAt >= :createdAtAfter
    """)
List<String> findRecentlyDisplayedClearedNotificationKeys(
    @Param("accountId") String accountId,
    @Param("endpointHash") String endpointHash,
    @Param("categories") List<String> categories,
    @Param("createdAtAfter") Instant createdAtAfter
);
```

- [ ] **Step 6: Add constants and imports in service**

In `PushNotificationService.java`, add imports:

```java
import java.time.Duration;
import java.util.ArrayList;
```

Add constants inside the class:

```java
private static final String CLEARED_STATE = "CLEARED";
private static final List<String> RETAINED_CLEARED_CATEGORIES = List.of(
    "saved-commute-current",
    "saved-commute-impact",
    "line-current"
);
```

- [ ] **Step 7: Return active and retained tags separately**

Inside `activeNotifications(...)`, keep existing active candidate calculation. Replace:

```java
return new PushResponses.ActivePushNotificationsResponse(activeTags);
```

with:

```java
List<String> retainedTags = retainedNotificationTags(account.getId(), endpointHash, activeTags);
return new PushResponses.ActivePushNotificationsResponse(activeTags, retainedTags, true);
```

For stale freshness, prefer the explicit constructor:

```java
return new PushResponses.ActivePushNotificationsResponse(List.of(), List.of(), false);
```

- [ ] **Step 8: Add retained tag helper**

Add this private method near `activeNotifications(...)`:

```java
private List<String> retainedNotificationTags(String accountId, String endpointHash, List<String> activeTags) {
    List<String> retainedTags = new ArrayList<>(activeTags);
    Duration retention = properties.getClearedNotificationRetention();
    if (retention == null || retention.isZero() || retention.isNegative()) {
        return retainedTags.stream()
            .filter(tag -> tag != null && !tag.isBlank())
            .distinct()
            .toList();
    }

    Instant createdAtAfter = clock.instant().minus(retention);
    List<String> recentlyDisplayedClearedTags = deliveryRepository.findRecentlyDisplayedClearedNotificationKeys(
        accountId,
        endpointHash,
        RETAINED_CLEARED_CATEGORIES,
        createdAtAfter
    );
    if (recentlyDisplayedClearedTags != null) {
        retainedTags.addAll(recentlyDisplayedClearedTags);
    }

    return retainedTags.stream()
        .filter(tag -> tag != null && !tag.isBlank())
        .distinct()
        .toList();
}
```

- [ ] **Step 9: Update controller test construction if needed**

In `PushNotificationControllerTest.java`, the existing constructor call can remain:

```java
new PushResponses.ActivePushNotificationsResponse(
    java.util.List.of("saved-commute-impact|commute_1|delay-line-1")
)
```

Add this assertion after `assertThat(response).isEqualTo(expected);`:

```java
assertThat(response.retainedTags()).containsExactly("saved-commute-impact|commute_1|delay-line-1");
```

- [ ] **Step 10: Run backend focused tests**

Run:

```bash
mvn -f backend/pom.xml -Dtest=PushNotificationServiceTest,PushNotificationControllerTest test
```

Expected: PASS.

- [ ] **Step 11: Commit backend retained-tag work**

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push/PushProperties.java backend/src/main/resources/application.yml .env.production.example backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDeliveryRepository.java backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationControllerTest.java
git commit -m "feat: retain cleared push notifications during cleanup"
```

---

### Task 4: Add Service Worker Regression Tests

**Files:**

- Modify: `frontend/tests/pwa.test.mjs`

- [ ] **Step 1: Update default push fixture**

In the default `fetchBody` inside `serviceWorkerPush(...)`, add `retainedTags`:

```js
activeTags: ["saved-commute-impact|commute_1|dedupe-1"],
retainedTags: ["saved-commute-impact|commute_1|dedupe-1"],
```

In the default `fetchBody` inside `serviceWorkerMessage(...)`, add:

```js
retainedTags: ["saved-commute-impact|commute_1|dedupe-1"],
```

- [ ] **Step 2: Assert active notifications request sticky display**

In `shows commute push notifications with the Android badge and the app icon`, add:

```js
assert.equal(shownNotifications[0].options.requireInteraction, true);
```

- [ ] **Step 3: Add retained-cleared cleanup test**

Add after `does not close notifications when backend cleanup is not allowed`:

```js
it("keeps displayed cleared notifications while the backend retains the tag", async () => {
  const clearedNotification = {
    tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1",
    closed: false,
    close() {
      this.closed = true;
    },
  };

  const { fetchRequests } = await serviceWorkerMessage({
    fetchBody: {
      activeTags: [],
      retainedTags: ["saved-commute-impact|commute_1|outbound|delay|delay-line-1"],
    },
    existingNotifications: [clearedNotification],
  });

  assert.equal(fetchRequests.at(-1).url, "/api/account/push/active");
  assert.equal(clearedNotification.closed, false);
});
```

- [ ] **Step 4: Add expired-cleared cleanup test**

Add:

```js
it("closes cleared notifications after the backend retention window expires", async () => {
  const expiredClearedNotification = {
    tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1",
    closed: false,
    close() {
      this.closed = true;
    },
  };

  const { fetchRequests } = await serviceWorkerMessage({
    fetchBody: {
      activeTags: [],
      retainedTags: [],
    },
    existingNotifications: [expiredClearedNotification],
  });

  assert.equal(fetchRequests.at(-1).url, "/api/account/push/active");
  assert.equal(expiredClearedNotification.closed, true);
});
```

- [ ] **Step 5: Add stale-active guard test**

Add:

```js
it("does not show a stale active notification just because a cleared tag is retained", async () => {
  const { shownNotifications } = await serviceWorkerPush({
    fetchBody: {
      notification: {
        title: "⚠️ Line 1 Yonge-University Delay",
        body: "Finch to Union.\n🕗 Jun 5, 10:20 AM",
        url: "/?panel=commutes&commute=commute_1",
        tag: "saved-commute-impact|commute_1|outbound|delay|delay-line-1",
        state: "ACTIVE",
        timestamp: "2026-06-05T15:00:00Z",
      },
      activeTags: [],
      retainedTags: ["saved-commute-impact|commute_1|outbound|delay|delay-line-1"],
    },
  });

  assert.equal(shownNotifications.length, 0);
});
```

- [ ] **Step 6: Update cleared-notification display fixture**

In `shows a cleared saved-commute push as a quiet replacement even when the tag is no longer active`, add `retainedTags`:

```js
retainedTags: ["saved-commute-impact|commute_1|outbound|delay-line-1"],
```

Change:

```js
assert.equal(shownNotifications[0].options.requireInteraction, false);
```

to:

```js
assert.equal(shownNotifications[0].options.requireInteraction, true);
```

- [ ] **Step 7: Run the failing frontend test**

Run:

```bash
node --test frontend/tests/pwa.test.mjs
```

Expected before implementation: FAIL at least on the retained-cleared cleanup test and `requireInteraction` assertions.

---

### Task 5: Implement Service Worker Retention Handling

**Files:**

- Modify: `frontend/public/sw.js`
- Modify: `frontend/tests/smoke/api-stub.mjs`

- [ ] **Step 1: Split active and retained tag handling**

In `showPendingPushNotification()`, replace:

```js
const activeTags = await reconcilePushNotifications();
```

with:

```js
const tagState = await reconcilePushNotifications();
```

Replace the ACTIVE stale check with:

```js
if (
  notificationState !== "CLEARED"
  && Array.isArray(tagState?.activeTags)
  && !tagState.activeTags.includes(notification.tag)
) {
  return;
}
```

Add this CLEARED stale check immediately after it:

```js
if (
  notificationState === "CLEARED"
  && Array.isArray(tagState?.retainedTags)
  && !tagState.retainedTags.includes(notification.tag)
) {
  return;
}
```

- [ ] **Step 2: Request sticky notifications where supported**

In the notification `options`, replace:

```js
requireInteraction: false,
```

with:

```js
requireInteraction: true,
```

Keep:

```js
renotify: false,
```

and keep cleared notifications silent:

```js
if (notificationState === "CLEARED") {
  options.silent = true;
}
```

- [ ] **Step 3: Replace active-tag fetch with tag-state fetch**

Replace `reconcilePushNotifications()` and `fetchActivePushNotificationTags()` with:

```js
async function reconcilePushNotifications() {
  try {
    const tagState = await fetchPushNotificationTagState();
    if (!tagState) return null;
    await closeInactivePushNotifications(tagState.retainedTags);
    return tagState;
  } catch {
    // Notification cleanup is best-effort; failed cleanup must not hide new alerts.
    return null;
  }
}

async function fetchPushNotificationTagState() {
  const subscription = await self.registration.pushManager.getSubscription();
  if (!subscription) return { activeTags: [], retainedTags: [] };

  const response = await fetch("/api/account/push/active", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!response.ok) return null;

  const body = await response.json();
  if (body?.cleanupAllowed === false) return null;
  const activeTags = Array.isArray(body.activeTags) ? body.activeTags : [];
  const retainedTags = Array.isArray(body.retainedTags) ? body.retainedTags : activeTags;
  return { activeTags, retainedTags };
}
```

Do not change `closeInactivePushNotifications(...)` except for parameter naming if desired. It should receive retained tags, build a set, and close LineWatch notifications not present in that set.

- [ ] **Step 4: Update smoke API stub**

In `frontend/tests/smoke/api-stub.mjs`, change the active push endpoint response from:

```js
sendJson(request, response, 200, { activeTags: [] });
```

to:

```js
sendJson(request, response, 200, { activeTags: [], retainedTags: [] });
```

- [ ] **Step 5: Run focused frontend tests**

Run:

```bash
node --test frontend/tests/pwa.test.mjs
npm --prefix frontend run test:fixtures
```

Expected: both commands pass.

- [ ] **Step 6: Commit service worker work**

```bash
git add frontend/public/sw.js frontend/tests/pwa.test.mjs frontend/tests/smoke/api-stub.mjs
git commit -m "fix: keep cleared push notifications through retention window"
```

---

### Task 6: Update Documentation And Guardrails

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Update README push behavior**

In the Web Push paragraph around the current text beginning `The browser still controls permission prompts and delivery`, replace the cleanup sentences with:

```text
The browser still controls permission prompts, notification ranking, and delivery. Local HTTP development works only where the browser treats the origin as trustworthy, such as `localhost`; production should use HTTPS. Notification bodies are fetched by the service worker from the signed-in account endpoint, so stale service data is not cached into offline notifications. Saved-commute disruption notifications use stable tags and Web Push topics. Notification titles use the controlled format `⚠️ Line {N} {Line Name} {Event Type}`. When a current disruption clears, LineWatch sends a quiet same-tag `✅ Line {N} {Line Name} {Event Type} Cleared` replacement where delivery is allowed. Active bodies include the TTC-provided start time in `America/Toronto` when available; cleared bodies include the LineWatch clearance-detection time. The clock line uses `🕗 MMM d, h:mm AM/PM` without an additional Started/Cleared label. When the app opens or receives another push event, the service worker asks the backend which notification tags should remain visible. Active impacts are removed when they are no longer dashboard-visible, while displayed service-restored notifications are retained for `LINEWATCH_PUSH_CLEARED_NOTIFICATION_RETENTION` before cleanup may close them. Android and iOS may still age, rank, or remove PWA notifications according to browser and OS policy; in-app Alert History is the reliable history surface. Line-wide current alerts use a stream-observation layer: LineWatch records eligible subscribed-line events separately from delivered push events, so a clearance can be sent for an event observed while subscribed even if the active push was suppressed as catch-up or failed delivery.
```

- [ ] **Step 2: Update README API table**

Change the `/api/account/push/active` row from:

```text
Return currently active saved-commute notification tags so the service worker can close stale notifications.
```

to:

```text
Return currently active notification tags and short-lived retained clearance tags so the service worker can close stale LineWatch notifications without immediately removing service-restored replacements.
```

- [ ] **Step 3: Update AGENTS.md and GEMINI.md together**

In both files, update the current-reality push paragraph so it includes:

```text
Displayed service-restored Web Push replacements are retained from LineWatch cleanup for the configured cleared-notification retention window, but Android/iOS browser policy can still age or remove PWA notifications.
```

Keep the statement that delivery requires browser permission, VAPID keys, push enabled, and fresh dashboard-visible impacts.

- [ ] **Step 4: Run documentation guard search**

Run:

```bash
rg -n "notification history|cleared-notification|retained clearance|active saved-commute notification tags|guarantee|guaranteed" README.md AGENTS.md GEMINI.md
```

Expected:

- No claim that OS notification persistence is guaranteed.
- `/api/account/push/active` is no longer documented as only saved-commute active tags.
- AGENTS and GEMINI contain matching current-reality wording.

- [ ] **Step 5: Commit docs**

```bash
git add README.md AGENTS.md GEMINI.md
git commit -m "docs: document cleared push notification retention"
```

---

### Task 7: Full Verification

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

Expected: PASS.

- [ ] **Step 5: Run the focused service-worker test directly**

Run:

```bash
node --test frontend/tests/pwa.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Optional manual mobile verification**

For faster local TTL verification, temporarily set:

```bash
LINEWATCH_PUSH_CLEARED_NOTIFICATION_RETENTION=PT1M
```

Then use the existing push-enabled live/scenario scripts:

```bash
scripts/dev-backend-live-push.sh
scripts/dev-cloudflare-push.sh
```

Manual expectations:

- Android Chrome installed PWA: active alert appears; cleared alert replaces it quietly; app focus/cleanup within the TTL does not close it; cleanup after TTL may close it or move it to notification history depending on OS.
- iOS/iPadOS Home Screen PWA: active alert appears where Web Push is supported; cleared alert replaces it quietly where delivery is allowed; LineWatch does not close it within TTL, but iOS may still manage Notification Center visibility.
- In-app Alert History shows the lifecycle regardless of OS notification center retention.

Do not commit temporary TTL changes.

- [ ] **Step 7: Final worktree review**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intended files changed. No secrets or generated credentials are present.

---

## Acceptance Criteria

- `/api/account/push/active` returns `activeTags`, `retainedTags`, and `cleanupAllowed`.
- `activeTags` contains only currently active, preference-allowed dashboard-visible push notification tags.
- `retainedTags` contains all `activeTags` plus recently displayed CLEARED tags for the current subscription endpoint within `LINEWATCH_PUSH_CLEARED_NOTIFICATION_RETENTION`.
- Stale ACTIVE notifications still close when absent from `activeTags`/`retainedTags`.
- Pending stale ACTIVE notifications are not shown just because their tag is retained for a cleared replacement.
- CLEARED notifications remain same-tag, silent, non-renotify replacements.
- CLEARED notifications are not closed by LineWatch cleanup until the backend retention window expires.
- Cleanup remains disabled when dashboard ingestion freshness is stale.
- The service worker requests `requireInteraction: true` for LineWatch push notifications, with docs clearly stating this is best-effort and not guaranteed on every platform.
- README, AGENTS, and GEMINI do not claim native grouping, guaranteed tray persistence, live station arrivals, surface-notice push, accessibility-outage push, or email notifications.

## Notes For Gemini 3.5 Flash

- Keep this scoped. Do not redesign push preferences, notification copy, account auth, alert history, or delivery scheduling.
- Preserve stable notification keys. Same-tag replacement is part of the product behavior.
- Use backend delivery state, not service-worker local storage, for retained clearance tags.
- Do not add a Flyway migration unless a test proves a new index is required. The existing tables already have the data needed for this slice.
- If JPQL query syntax fails, fix the repository query directly and keep the service contract unchanged.
- If a browser ignores `requireInteraction`, that is acceptable. The reliable behavior is LineWatch not closing retained tags during cleanup.

# Account And Device Notification State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make notification intent account-level while keeping Web Push delivery device-level, so reinstalling the PWA preserves the user's notification preferences and clearly guides or restores this device's push subscription.

**Architecture:** Keep account notification preferences in `push_notification_preferences` and line subscriptions, keep browser push endpoints in `push_subscriptions`, and stop treating a missing device subscription as account notifications being off. Extend the push config API with an account device summary, refactor frontend state into explicit account intent plus current-device setup state, and auto-restore the current device only when browser permission is already granted and the user has not disabled this device locally.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, Flyway-managed PostgreSQL schema, Next.js App Router, React, TypeScript, browser Web Push APIs, Node built-in tests, Playwright smoke tests.

---

## Product Contract

- Account-level state answers: "Does this signed-in user want LineWatchTO notifications?"
- Device-level state answers: "Can this browser/PWA install receive push notifications right now?"
- Disabling "this device" must not change saved commute, line subscription, event type, or reminder preferences.
- Updating notification preferences must not require an active browser push subscription.
- Reinstalling the app should preserve account preferences after sign-in.
- If browser notification permission is still `granted`, the app may silently recreate the current device subscription.
- If browser permission is `default`, the app must show a clear current-device enable action and request permission only from user action.
- If browser permission is `denied`, the app must show a blocked state and must not keep retrying subscription creation.
- Service-worker delivery remains inactive unless Web Push is configured, browser permission is granted, a valid enabled subscription exists, and fresh dashboard-visible impacts exist.

## Current Repo Context

- Existing backend preferences live in `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationPreferenceEntity.java`.
- Existing backend browser/device subscriptions live in `backend/src/main/java/com/calebhabesh/linewatch/push/PushSubscriptionEntity.java`.
- Existing push config endpoint is `GET /api/account/push/config` in `PushNotificationController`.
- Existing frontend push hook is `frontend/src/hooks/usePushNotificationSettings.ts`.
- Existing frontend data adapter and types are in `frontend/src/app/account-data.ts`.
- Existing browser push helpers are in `frontend/src/app/push-browser-state.ts`.
- Existing settings UI is `frontend/src/components/NotificationSettingsPanel.tsx`.
- Existing saved commute notification summary is in `frontend/src/components/LineWatchShell.tsx`.
- Existing README already says: "Device push enablement is per browser/device. Saved-commute, line-wide, event-type, and reminder preferences are account-level..."
- Do not change the existing line-wide Reduced Speed Zone default in this slice. Current docs and tests expect it to be enabled for new notification preferences.

## Files

Backend modify:

- `backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushSubscriptionRepository.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java`
- `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationController.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationControllerTest.java`
- `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`

Frontend create:

- `frontend/src/app/push-notification-state.ts`
- `frontend/tests/push-notification-state.test.mjs`

Frontend modify:

- `frontend/src/app/account-data.ts`
- `frontend/src/hooks/usePushNotificationSettings.ts`
- `frontend/src/components/NotificationSettingsPanel.tsx`
- `frontend/src/components/LineWatchShell.tsx`
- `frontend/tests/account-data.test.mjs`
- `frontend/tests/push-notification-preferences.test.mjs`
- `frontend/tests/notification-settings-navigation.test.mjs`
- `frontend/tests/smoke/api-stub.mjs`
- `frontend/tests/smoke/dashboard.spec.ts`

Docs modify:

- `README.md`
- `AGENTS.md`
- `GEMINI.md`

Do not edit migrations for this slice. The schema already has account-level preferences and device-level subscriptions. Leave the legacy `push_subscriptions.commute_notifications_enabled` and `push_subscriptions.planned_closure_notifications_enabled` columns in place for now, but stop using them as the source of truth.

## Target API Shape

`GET /api/account/push/config` returns the existing config plus a device summary:

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
        "reducedSpeedZones": true,
        "plannedClosures": true,
        "serviceRestored": true
      }
    },
    "reminderTiming": {
      "onChange": true,
      "closure24h": true,
      "closureMorning": true
    }
  },
  "deviceSummary": {
    "enabledDeviceCount": 1,
    "hasEnabledDevices": true
  }
}
```

`PUT /api/account/push/preferences` returns the updated account preferences, not a subscription response:

```json
{
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
      "reducedSpeedZones": true,
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
```

## Task 1: Baseline And Guardrails

**Files:**

- Read: `AGENTS.md`
- Read: `GEMINI.md`
- Read: `README.md`
- Read: `docs/superpowers/plans/2026-06-14-notifications-feature.md`
- Read: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java`
- Read: `frontend/src/hooks/usePushNotificationSettings.ts`
- Read: `frontend/src/components/NotificationSettingsPanel.tsx`

- [ ] **Step 1: Check the worktree**

Run:

```bash
git status --short
```

Expected: There may be unrelated modified frontend files. Treat existing changes as user-owned. Do not revert unrelated work.

- [ ] **Step 2: Run backend push tests before changing behavior**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.*Test'
```

Expected: Push tests pass. If they fail before edits, copy the failing test names into the handoff note and continue with narrowly scoped changes.

- [ ] **Step 3: Run frontend fixture tests before changing behavior**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: Fixture tests pass. If they fail before edits, copy the failing test names into the handoff note and continue only if failures are unrelated to notifications.

- [ ] **Step 4: Commit the baseline only if the worktree is already clean**

If `git status --short` is empty after the baseline checks, run:

```bash
git commit --allow-empty -m "chore: record notification state baseline"
```

Expected: Empty commit succeeds. If the worktree is dirty, skip this step and do not commit unrelated changes.

## Task 2: Backend Config Device Summary

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushSubscriptionRepository.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationControllerTest.java`

- [ ] **Step 1: Add a failing service test for device summary**

Add this test to `PushNotificationServiceTest`:

```java
@Test
void configIncludesAccountDeviceSummaryWithoutChangingPreferences() {
    properties.setEnabled(true);
    properties.setVapidPublicKey("BPublicVapidKey");
    PushResponses.PushPreferencesResponse preferences = new PushResponses.PushPreferencesResponse(true, true);
    when(preferenceService.preferencesFor(account)).thenReturn(preferences);
    when(subscriptionRepository.countByAccountIdAndEnabledTrue("user_1")).thenReturn(2L);

    PushResponses.PushConfigResponse response = service.config(account);

    assertThat(response.webPushAvailable()).isTrue();
    assertThat(response.vapidPublicKey()).isEqualTo("BPublicVapidKey");
    assertThat(response.preferences()).isEqualTo(preferences);
    assertThat(response.deviceSummary().enabledDeviceCount()).isEqualTo(2);
    assertThat(response.deviceSummary().hasEnabledDevices()).isTrue();
}
```

- [ ] **Step 2: Run the failing service test**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=PushNotificationServiceTest#configIncludesAccountDeviceSummaryWithoutChangingPreferences
```

Expected: Fails because `deviceSummary` and `countByAccountIdAndEnabledTrue` do not exist.

- [ ] **Step 3: Add backend response type**

In `PushResponses.java`, add `PushDeviceSummaryResponse` and replace `PushConfigResponse` with this version:

```java
public record PushDeviceSummaryResponse(
    int enabledDeviceCount,
    boolean hasEnabledDevices
) {
    public static PushDeviceSummaryResponse none() {
        return new PushDeviceSummaryResponse(0, false);
    }
}

public record PushConfigResponse(
    boolean webPushAvailable,
    String vapidPublicKey,
    PushPreferencesResponse preferences,
    PushDeviceSummaryResponse deviceSummary
) {
    public PushConfigResponse(
        boolean webPushAvailable,
        String vapidPublicKey,
        PushPreferencesResponse preferences
    ) {
        this(webPushAvailable, vapidPublicKey, preferences, PushDeviceSummaryResponse.none());
    }
}
```

- [ ] **Step 4: Add repository count method**

In `PushSubscriptionRepository.java`, add:

```java
long countByAccountIdAndEnabledTrue(String accountId);
```

- [ ] **Step 5: Populate summary in config**

In `PushNotificationService.config`, replace the return statement with:

```java
long enabledDeviceCount = subscriptionRepository.countByAccountIdAndEnabledTrue(account.getId());
int safeDeviceCount = enabledDeviceCount > Integer.MAX_VALUE
    ? Integer.MAX_VALUE
    : (int) enabledDeviceCount;
return new PushResponses.PushConfigResponse(
    properties.webPushConfigured(),
    properties.getVapidPublicKey() == null ? "" : properties.getVapidPublicKey().trim(),
    preferenceService.preferencesFor(account),
    new PushResponses.PushDeviceSummaryResponse(safeDeviceCount, safeDeviceCount > 0)
);
```

- [ ] **Step 6: Run the service test**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=PushNotificationServiceTest#configIncludesAccountDeviceSummaryWithoutChangingPreferences
```

Expected: Passes.

- [ ] **Step 7: Update controller config test**

In `PushNotificationControllerTest.configUsesCurrentSessionAccount`, construct the expected config with the new constructor or explicit summary. Use this exact expected object:

```java
PushResponses.PushConfigResponse expected = new PushResponses.PushConfigResponse(
    true,
    "BPublicVapidKey",
    new PushResponses.PushPreferencesResponse(true, true),
    new PushResponses.PushDeviceSummaryResponse(1, true)
);
```

- [ ] **Step 8: Run controller push tests**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=PushNotificationControllerTest
```

Expected: Passes.

- [ ] **Step 9: Commit backend config summary**

Run:

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java backend/src/main/java/com/calebhabesh/linewatch/push/PushSubscriptionRepository.java backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationControllerTest.java
git commit -m "feat: expose push device summary"
```

Expected: Commit succeeds if no unrelated changes are staged. If unrelated user changes exist in these files, do not commit; leave a handoff note with the staged-file conflict.

## Task 3: Backend Preference Update Response

**Files:**

- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationController.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationControllerTest.java`

- [ ] **Step 1: Add a failing service test that preferences update without a subscription**

Add this test to `PushNotificationServiceTest`:

```java
@Test
void updatePreferencesReturnsAccountPreferencesAndDoesNotRequireDeviceSubscription() {
    PushRequests.UpdatePushPreferencesRequest request = new PushRequests.UpdatePushPreferencesRequest(
        true,
        false,
        null,
        null,
        null
    );
    PushResponses.PushPreferencesResponse updated = new PushResponses.PushPreferencesResponse(true, false);
    when(preferenceService.updatePreferences(account, request)).thenReturn(updated);

    PushResponses.PushPreferencesResponse response = service.updatePreferences(account, request);

    assertThat(response).isEqualTo(updated);
    verify(subscriptionRepository, never()).findByAccountIdAndEnabledTrue(anyString());
    verify(subscriptionRepository, never()).save(any());
}
```

- [ ] **Step 2: Run the failing service test**

Run:

```bash
mvn -f backend/pom.xml test -Dtest=PushNotificationServiceTest#updatePreferencesReturnsAccountPreferencesAndDoesNotRequireDeviceSubscription
```

Expected: Fails because `updatePreferences` still returns `PushSubscriptionResponse` and looks for an enabled subscription.

- [ ] **Step 3: Change service method return type and implementation**

In `PushNotificationService.java`, replace the whole `updatePreferences` method with:

```java
@Transactional
public PushResponses.PushPreferencesResponse updatePreferences(
    AccountEntity account,
    PushRequests.UpdatePushPreferencesRequest request
) {
    return preferenceService.updatePreferences(account, request);
}
```

- [ ] **Step 4: Change controller return type**

In `PushNotificationController.java`, change the `updatePreferences` method signature from `PushSubscriptionResponse` to `PushPreferencesResponse`:

```java
@PutMapping("/preferences")
public PushResponses.PushPreferencesResponse updatePreferences(
    @CookieValue(name = AuthCookieFactory.COOKIE_NAME, required = false) String rawSessionToken,
    @RequestBody PushRequests.UpdatePushPreferencesRequest request
) {
    AccountEntity account = accountService.requireAccount(rawSessionToken);
    return pushNotificationService.updatePreferences(account, request);
}
```

- [ ] **Step 5: Add a controller test for preference response**

Add this test to `PushNotificationControllerTest`:

```java
@Test
void updatesAccountNotificationPreferencesWithoutDeviceSubscription() {
    PushRequests.UpdatePushPreferencesRequest request = new PushRequests.UpdatePushPreferencesRequest(
        true,
        false,
        null,
        null,
        null
    );
    PushResponses.PushPreferencesResponse expected = new PushResponses.PushPreferencesResponse(true, false);
    when(accountService.requireAccount("raw-token")).thenReturn(account);
    when(pushNotificationService.updatePreferences(account, request)).thenReturn(expected);

    PushResponses.PushPreferencesResponse response = controller.updatePreferences("raw-token", request);

    assertThat(response).isEqualTo(expected);
    verify(pushNotificationService).updatePreferences(account, request);
}
```

- [ ] **Step 6: Run focused backend tests**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='PushNotificationServiceTest#updatePreferencesReturnsAccountPreferencesAndDoesNotRequireDeviceSubscription,PushNotificationControllerTest#updatesAccountNotificationPreferencesWithoutDeviceSubscription'
```

Expected: Passes.

- [ ] **Step 7: Run all backend push tests**

Run:

```bash
mvn -f backend/pom.xml test -Dtest='com.calebhabesh.linewatch.push.*Test'
```

Expected: Passes. If existing tests expected `PushSubscriptionResponse` from preferences updates, update those assertions to expect `PushPreferencesResponse`.

- [ ] **Step 8: Commit backend preference response split**

Run:

```bash
git add backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationController.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationControllerTest.java
git commit -m "fix: keep push preferences account scoped"
```

Expected: Commit succeeds if no unrelated changes are staged.

## Task 4: Frontend Types And Account Intent Helpers

**Files:**

- Create: `frontend/src/app/push-notification-state.ts`
- Modify: `frontend/src/app/account-data.ts`
- Test: `frontend/tests/push-notification-state.test.mjs`
- Test: `frontend/tests/account-data.test.mjs`
- Test: `frontend/tests/push-notification-preferences.test.mjs`

- [ ] **Step 1: Add failing tests for account intent and auto-restore eligibility**

Create `frontend/tests/push-notification-state.test.mjs`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  accountNotificationsDesired,
  canAutoRestoreDevicePush,
  pushDeviceDisabledStorageKey,
} from "../src/app/push-notification-state.ts";
import { defaultPushNotificationPreferences } from "../src/app/account-data.ts";

describe("push notification account and device state", () => {
  it("treats saved commute notification preferences as account-level intent", () => {
    assert.equal(accountNotificationsDesired(defaultPushNotificationPreferences), true);
  });

  it("treats notification intent as off when saved commute and line streams are all disabled", () => {
    const preferences = {
      ...defaultPushNotificationPreferences,
      savedCommutes: {
        ...defaultPushNotificationPreferences.savedCommutes,
        currentDisruptions: false,
        plannedClosureReminders: false,
      },
      lineSubscriptions: {
        ...defaultPushNotificationPreferences.lineSubscriptions,
        lines: defaultPushNotificationPreferences.lineSubscriptions.lines.map((line) => ({
          ...line,
          subscribed: false,
        })),
      },
    };

    assert.equal(accountNotificationsDesired(preferences), false);
  });

  it("treats any line subscription as account-level notification intent", () => {
    const preferences = {
      ...defaultPushNotificationPreferences,
      savedCommutes: {
        ...defaultPushNotificationPreferences.savedCommutes,
        currentDisruptions: false,
        plannedClosureReminders: false,
      },
      lineSubscriptions: {
        ...defaultPushNotificationPreferences.lineSubscriptions,
        lines: defaultPushNotificationPreferences.lineSubscriptions.lines.map((line, index) => ({
          ...line,
          subscribed: index === 0,
        })),
      },
    };

    assert.equal(accountNotificationsDesired(preferences), true);
  });

  it("allows silent device push restore only when permission is granted and the user did not disable this device", () => {
    assert.equal(canAutoRestoreDevicePush({
      authenticated: true,
      supported: true,
      webPushAvailable: true,
      hasVapidPublicKey: true,
      accountNotificationsDesired: true,
      notificationPermission: "granted",
      hasCurrentSubscription: false,
      currentSubscriptionUsesVapidKey: false,
      deviceDisabledByUser: false,
    }), true);

    assert.equal(canAutoRestoreDevicePush({
      authenticated: true,
      supported: true,
      webPushAvailable: true,
      hasVapidPublicKey: true,
      accountNotificationsDesired: true,
      notificationPermission: "default",
      hasCurrentSubscription: false,
      currentSubscriptionUsesVapidKey: false,
      deviceDisabledByUser: false,
    }), false);

    assert.equal(canAutoRestoreDevicePush({
      authenticated: true,
      supported: true,
      webPushAvailable: true,
      hasVapidPublicKey: true,
      accountNotificationsDesired: true,
      notificationPermission: "granted",
      hasCurrentSubscription: false,
      currentSubscriptionUsesVapidKey: false,
      deviceDisabledByUser: true,
    }), false);
  });

  it("keys device-disabled state by account id", () => {
    assert.equal(pushDeviceDisabledStorageKey("user_1"), "linewatch.push.device-disabled.user_1");
  });
});
```

- [ ] **Step 2: Run the failing helper test**

Run:

```bash
npm --prefix frontend run test:fixtures -- --test-name-pattern="push notification account and device state"
```

Expected: Fails because `push-notification-state.ts` does not exist. If the test runner does not support `--test-name-pattern`, run `npm --prefix frontend run test:fixtures` and confirm this new test fails.

- [ ] **Step 3: Create account/device helper module**

Create `frontend/src/app/push-notification-state.ts`:

```ts
import { type PushNotificationPreferences } from "./account-data.ts";

export type DevicePushSetupState =
  | "signed-out"
  | "unsupported"
  | "not-configured"
  | "blocked"
  | "checking"
  | "enabled"
  | "account-off"
  | "needs-permission"
  | "needs-device-enable"
  | "restoring";

export type AutoRestoreDevicePushInput = {
  authenticated: boolean;
  supported: boolean;
  webPushAvailable: boolean;
  hasVapidPublicKey: boolean;
  accountNotificationsDesired: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  hasCurrentSubscription: boolean;
  currentSubscriptionUsesVapidKey: boolean;
  deviceDisabledByUser: boolean;
};

export function accountNotificationsDesired(preferences: PushNotificationPreferences): boolean {
  const savedCommuteDesired =
    preferences.savedCommutes.currentDisruptions ||
    preferences.savedCommutes.plannedClosureReminders;
  const lineSubscriptionDesired = preferences.lineSubscriptions.lines.some((line) => line.subscribed);
  return savedCommuteDesired || lineSubscriptionDesired;
}

export function pushDeviceDisabledStorageKey(accountId: string): string {
  return `linewatch.push.device-disabled.${accountId}`;
}

export function canAutoRestoreDevicePush(input: AutoRestoreDevicePushInput): boolean {
  return input.authenticated &&
    input.supported &&
    input.webPushAvailable &&
    input.hasVapidPublicKey &&
    input.accountNotificationsDesired &&
    input.notificationPermission === "granted" &&
    !input.hasCurrentSubscription &&
    !input.currentSubscriptionUsesVapidKey &&
    !input.deviceDisabledByUser;
}

export function setupStateForDevicePush(input: AutoRestoreDevicePushInput): DevicePushSetupState {
  if (!input.authenticated) return "signed-out";
  if (!input.supported) return "unsupported";
  if (!input.webPushAvailable || !input.hasVapidPublicKey) return "not-configured";
  if (input.notificationPermission === "denied") return "blocked";
  if (input.hasCurrentSubscription && input.currentSubscriptionUsesVapidKey) return "enabled";
  if (!input.accountNotificationsDesired) return "account-off";
  if (input.notificationPermission === "default") return "needs-permission";
  return "needs-device-enable";
}
```

- [ ] **Step 4: Add frontend config device summary types**

In `frontend/src/app/account-data.ts`, add these types near `PushNotificationConfig`:

```ts
export type PushDeviceSummary = {
  enabledDeviceCount: number;
  hasEnabledDevices: boolean;
};

export const defaultPushDeviceSummary: PushDeviceSummary = {
  enabledDeviceCount: 0,
  hasEnabledDevices: false,
};
```

Change `PushNotificationConfig` to:

```ts
export type PushNotificationConfig = {
  webPushAvailable: boolean;
  vapidPublicKey: string;
  preferences: PushNotificationPreferences;
  deviceSummary: PushDeviceSummary;
};
```

Add this helper near `readJson`:

```ts
function normalizePushNotificationConfig(config: PushNotificationConfig & { deviceSummary?: PushDeviceSummary }): PushNotificationConfig {
  return {
    ...config,
    deviceSummary: config.deviceSummary ?? defaultPushDeviceSummary,
  };
}
```

In `getPushNotificationConfig`, replace:

```ts
const config = await readJson<PushNotificationConfig>(response);
return { source: "backend", config };
```

with:

```ts
const config = normalizePushNotificationConfig(await readJson<PushNotificationConfig & { deviceSummary?: PushDeviceSummary }>(response));
return { source: "backend", config };
```

In the unavailable fallback config, add:

```ts
deviceSummary: defaultPushDeviceSummary,
```

- [ ] **Step 5: Change preference update adapter return type**

In `frontend/src/app/account-data.ts`, change `updatePushPreferences` to return `PushNotificationPreferences`:

```ts
export async function updatePushPreferences(input: PushNotificationPreferences, options: AdapterOptions = {}) {
  return authJsonRequest<PushNotificationPreferences>(
    "/api/account/push/preferences",
    { method: "PUT", body: JSON.stringify(input) },
    options
  );
}
```

Leave `savePushSubscription` returning `PushSubscriptionResponse`.

- [ ] **Step 6: Update account-data tests**

In `frontend/tests/account-data.test.mjs`, update push config fixture responses to include:

```js
deviceSummary: {
  enabledDeviceCount: 1,
  hasEnabledDevices: true,
},
```

Add assertions:

```js
assert.equal(result.config.deviceSummary.enabledDeviceCount, 1);
assert.equal(result.config.deviceSummary.hasEnabledDevices, true);
```

In the test that calls `updatePushPreferences`, change the fake response body from subscription fields to the full preference object:

```js
return new Response(
  JSON.stringify(fullPrefs),
  { status: 200, headers: { "content-type": "application/json" } }
);
```

Then assert:

```js
assert.equal(requests[1].input, "/api/account/push/preferences");
assert.equal(JSON.parse(requests[1].init.body).savedCommutes.plannedClosureReminders, false);
```

- [ ] **Step 7: Update source-level preferences test**

In `frontend/tests/push-notification-preferences.test.mjs`, keep the default line-wide Reduced Speed Zone expectation as `true`:

```js
assert.equal(defaultPushNotificationPreferences.lineSubscriptions.eventTypes.reducedSpeedZones, true);
```

Add source assertions:

```js
assert.match(hookSource, /accountNotificationsDesired/);
assert.match(hookSource, /deviceSetupState/);
assert.match(notificationPanelSource, /Account notifications are on/);
```

- [ ] **Step 8: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: Fails only because the hook/UI do not yet use the new helper and message. The new pure helper tests should pass.

- [ ] **Step 9: Commit frontend types and helper**

Run:

```bash
git add frontend/src/app/account-data.ts frontend/src/app/push-notification-state.ts frontend/tests/account-data.test.mjs frontend/tests/push-notification-state.test.mjs frontend/tests/push-notification-preferences.test.mjs
git commit -m "feat: model account and device push state"
```

Expected: Commit succeeds if no unrelated changes are staged.

## Task 5: Hook Reinstall Restore And Device State

**Files:**

- Modify: `frontend/src/hooks/usePushNotificationSettings.ts`
- Test: `frontend/tests/push-notification-preferences.test.mjs`
- Test: `frontend/tests/push-browser-state.test.mjs`

- [ ] **Step 1: Extend hook result type**

In `usePushNotificationSettings.ts`, import helpers:

```ts
import {
  accountNotificationsDesired as deriveAccountNotificationsDesired,
  canAutoRestoreDevicePush,
  pushDeviceDisabledStorageKey,
  setupStateForDevicePush,
  type DevicePushSetupState,
} from "../app/push-notification-state";
```

Add these fields to `UsePushNotificationSettingsResult`:

```ts
accountNotificationsDesired: boolean;
deviceSetupState: DevicePushSetupState;
```

Add state:

```ts
const [deviceSetupState, setDeviceSetupState] = useState<DevicePushSetupState>("checking");
const [autoRestoreAttemptedFor, setAutoRestoreAttemptedFor] = useState<string | null>(null);
```

Add derived account intent:

```ts
const accountNotificationsDesired = useMemo(
  () => deriveAccountNotificationsDesired(preferences),
  [preferences]
);
```

- [ ] **Step 2: Add local disabled marker helpers inside the hook file**

Add these functions below `pushSubscriptionKeys`:

```ts
function readDeviceDisabledByUser(accountId: string | undefined): boolean {
  if (!accountId || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(pushDeviceDisabledStorageKey(accountId)) === "true";
  } catch {
    return false;
  }
}

function writeDeviceDisabledByUser(accountId: string | undefined, disabled: boolean): void {
  if (!accountId || typeof window === "undefined") return;
  try {
    const key = pushDeviceDisabledStorageKey(accountId);
    if (disabled) {
      window.localStorage.setItem(key, "true");
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Browser storage can be unavailable in private browsing modes.
  }
}
```

- [ ] **Step 3: Extract subscription creation into a reusable helper**

Inside the hook, before `fetchConfigAndSubscription`, add:

```ts
const createOrRefreshDeviceSubscription = useCallback(async (currentConfig: PushNotificationConfig) => {
  const registration = await serviceWorkerRegistrationForPush();
  const existing = await registration.pushManager.getSubscription();
  let subscription = existing;
  if (subscription && !pushSubscriptionUsesApplicationServerKey(subscription, currentConfig.vapidPublicKey)) {
    try {
      await disablePushSubscription(subscription.endpoint);
    } catch {
      // The backend may not know this stale endpoint. Continue with browser cleanup.
    }
    const unsubscribed = await subscription.unsubscribe();
    if (!unsubscribed) {
      throw new Error("Could not refresh stale push subscription.");
    }
    subscription = null;
  }
  subscription = subscription ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(currentConfig.vapidPublicKey),
  });
  await savePushSubscription({
    endpoint: subscription.endpoint,
    keys: pushSubscriptionKeys(subscription),
    userAgent: navigator.userAgent,
  });
  return subscription;
}, []);
```

- [ ] **Step 4: Use explicit setup state while loading config**

In the start of `fetchConfigAndSubscription`, after `setSubscriptionChecked(false);`, add:

```ts
setDeviceSetupState("checking");
```

When config cannot be loaded from backend, also set:

```ts
setDeviceSetupState("not-configured");
```

When unauthenticated or unsupported in the `useEffect` else branch, set:

```ts
setDeviceSetupState(accountState.authenticated ? "unsupported" : "signed-out");
```

- [ ] **Step 5: Auto-restore if permission is already granted**

In `fetchConfigAndSubscription`, after `setPreferences(result.config.preferences);`, compute the device state before returning:

```ts
const desired = deriveAccountNotificationsDesired(result.config.preferences);
const accountId = accountState.user?.id;
const disabledByUser = readDeviceDisabledByUser(accountId);
const permission: NotificationPermission | "unsupported" = supported ? Notification.permission : "unsupported";
```

Replace the existing subscription handling block with this flow:

```ts
if (!result.config.webPushAvailable || !result.config.vapidPublicKey) {
  setSubscribed(false);
  setSubscriptionChecked(true);
  setDeviceSetupState("not-configured");
  return;
}

let subscription = await getCurrentPushSubscription(navigator.serviceWorker);
let subscriptionUsesCurrentKey = subscription
  ? pushSubscriptionUsesApplicationServerKey(subscription, result.config.vapidPublicKey)
  : false;

const restoreKey = `${accountId ?? "unknown"}:${result.config.vapidPublicKey}`;
if (canAutoRestoreDevicePush({
  authenticated: accountState.authenticated,
  supported,
  webPushAvailable: result.config.webPushAvailable,
  hasVapidPublicKey: Boolean(result.config.vapidPublicKey),
  accountNotificationsDesired: desired,
  notificationPermission: permission,
  hasCurrentSubscription: Boolean(subscription),
  currentSubscriptionUsesVapidKey: subscriptionUsesCurrentKey,
  deviceDisabledByUser: disabledByUser,
}) && autoRestoreAttemptedFor !== restoreKey) {
  setAutoRestoreAttemptedFor(restoreKey);
  setDeviceSetupState("restoring");
  try {
    subscription = await createOrRefreshDeviceSubscription(result.config);
    subscriptionUsesCurrentKey = true;
    writeDeviceDisabledByUser(accountId, false);
  } catch (err) {
    console.error("Failed to restore device push subscription", err);
    setMessage("Account notifications are on. Enable this device to receive them here.");
  }
}

if (!isMounted()) return;
setSubscribed(Boolean(subscription && subscriptionUsesCurrentKey));
setSubscriptionChecked(true);
setDeviceSetupState(setupStateForDevicePush({
  authenticated: accountState.authenticated,
  supported,
  webPushAvailable: result.config.webPushAvailable,
  hasVapidPublicKey: Boolean(result.config.vapidPublicKey),
  accountNotificationsDesired: desired,
  notificationPermission: permission,
  hasCurrentSubscription: Boolean(subscription),
  currentSubscriptionUsesVapidKey: subscriptionUsesCurrentKey,
  deviceDisabledByUser: disabledByUser,
}));
if (subscription && !subscriptionUsesCurrentKey) {
  setMessage("Push for this browser needs to be re-enabled.");
}
```

- [ ] **Step 6: Update manual enable and disable**

In `enableDeviceNotifications`, replace the duplicate subscription creation code with:

```ts
const subscription = await createOrRefreshDeviceSubscription(config);
writeDeviceDisabledByUser(accountState.user?.id, false);
setSubscribed(Boolean(subscription));
setSubscriptionChecked(true);
setDeviceSetupState("enabled");
setMessage(null);
```

Keep the existing permission prompt flow before this replacement.

In `disableDeviceNotifications`, after backend/browser unsubscribe succeeds, add:

```ts
writeDeviceDisabledByUser(accountState.user?.id, true);
setDeviceSetupState(accountNotificationsDesired ? "needs-device-enable" : "account-off");
```

- [ ] **Step 7: Update preference saves to use returned account preferences**

In `updatePreferences`, replace the success branch with:

```ts
const response = await updatePushPreferences(next);
setPreferences(response);
setDeviceSetupState((current) => {
  if (subscribed) return "enabled";
  return deriveAccountNotificationsDesired(response) ? current : "account-off";
});
setMessage("Notification preferences updated.");
```

Do not read `response.commuteNotificationsEnabled` or `response.plannedClosureNotificationsEnabled` from a subscription response anymore.

- [ ] **Step 8: Return new hook fields**

In the hook return object, add:

```ts
accountNotificationsDesired,
deviceSetupState,
```

- [ ] **Step 9: Run frontend source tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: Any hook source assertions pass. UI tests may still fail until Task 6.

- [ ] **Step 10: Commit hook state split**

Run:

```bash
git add frontend/src/hooks/usePushNotificationSettings.ts frontend/tests/push-notification-preferences.test.mjs frontend/tests/push-browser-state.test.mjs
git commit -m "fix: restore device push without changing account intent"
```

Expected: Commit succeeds if no unrelated changes are staged.

## Task 6: UI Copy And Status Semantics

**Files:**

- Modify: `frontend/src/components/NotificationSettingsPanel.tsx`
- Modify: `frontend/src/components/LineWatchShell.tsx`
- Test: `frontend/tests/notification-settings-navigation.test.mjs`
- Test: `frontend/tests/push-notification-preferences.test.mjs`
- Test: `frontend/tests/smoke/dashboard.spec.ts`

- [ ] **Step 1: Add source-level UI assertions**

In `frontend/tests/notification-settings-navigation.test.mjs`, add assertions against `NotificationSettingsPanel.tsx` and `LineWatchShell.tsx` source:

```js
assert.match(notificationPanelSource, /Account notifications are on/);
assert.match(notificationPanelSource, /This device is receiving notifications/);
assert.match(notificationPanelSource, /Enable on This Device/);
assert.match(shellSource, /Device Setup Needed/);
```

- [ ] **Step 2: Run the failing UI source test**

Run:

```bash
npm --prefix frontend run test:fixtures -- --test-name-pattern="notification"
```

Expected: Fails until the UI strings and states are updated. If the test runner does not support this filter, run `npm --prefix frontend run test:fixtures`.

- [ ] **Step 3: Update NotificationSettingsPanel destructuring**

In `NotificationSettingsPanel.tsx`, include new hook fields:

```ts
accountNotificationsDesired,
deviceSetupState,
```

- [ ] **Step 4: Replace device status message logic**

In `NotificationSettingsPanel.tsx`, replace the `statusMessage` switch with:

```ts
const statusMessage = useMemo(() => {
  if (message) return message;
  switch (deviceSetupState) {
    case "unsupported":
      return "Push unavailable on this browser.";
    case "not-configured":
      return "Push not configured for this environment.";
    case "blocked":
      return "Notifications are blocked in browser settings.";
    case "checking":
      return "Checking push support...";
    case "restoring":
      return "Restoring notifications on this device...";
    case "needs-permission":
    case "needs-device-enable":
      return "Account notifications are on. Enable this device to receive them here.";
    case "account-off":
      return "Account notification preferences are off.";
    case "enabled":
    case "signed-out":
    default:
      return null;
  }
}, [message, deviceSetupState]);
```

- [ ] **Step 5: Update device section header**

Change the device section header status span to:

```tsx
<span>{
  deviceSetupState === "enabled" ? "Enabled" :
  deviceSetupState === "restoring" ? "Restoring" :
  deviceSetupState === "blocked" ? "Blocked" :
  accountNotificationsDesired ? "Setup Needed" :
  "Off"
}</span>
```

Change the device row copy from only "Controls whether this phone or browser can display LineWatchTO notifications." to:

```tsx
<strong>{deviceSetupState === "enabled" ? "This Device" : "Enable on This Device"}</strong>
<em>
  {deviceSetupState === "enabled"
    ? "This device is receiving notifications for the account preferences below."
    : "Your account preferences are saved separately from this browser's push subscription."}
</em>
```

- [ ] **Step 6: Update inactive warnings under preference sections**

Replace repeated `!subscribed` warnings with:

```tsx
{!subscribed && accountNotificationsDesired ? (
  <p className="notification-settings-muted-warning text-xs text-slate-400 dark:text-slate-500 italic mt-1.5">
    Account notifications are on. Enable this device to receive pushes here.
  </p>
) : null}
```

For account preferences off, use:

```tsx
{!accountNotificationsDesired ? (
  <p className="notification-settings-muted-warning text-xs text-slate-400 dark:text-slate-500 italic mt-1.5">
    Turn on at least one account notification stream to receive pushes.
  </p>
) : null}
```

- [ ] **Step 7: Update saved commute summary label in LineWatchShell**

In `LineWatchShell.tsx`, replace the `notificationStatusLabel` logic with:

```ts
const notificationStatusLabel = useMemo(() => {
  if (
    !accountState.authenticated ||
    pushSettings.browserStatus === "signed-out" ||
    pushSettings.browserStatus === "unsupported" ||
    pushSettings.browserStatus === "not-configured" ||
    pushSettings.browserStatus === "checking"
  ) {
    return "Unavailable";
  }
  if (!pushSettings.accountNotificationsDesired) {
    return "Off";
  }
  if (pushSettings.subscribed) {
    return "On";
  }
  return "Device Setup Needed";
}, [
  accountState.authenticated,
  pushSettings.browserStatus,
  pushSettings.accountNotificationsDesired,
  pushSettings.subscribed,
]);
```

Change `notificationSummary.detail` to:

```ts
detail: notificationStatusLabel === "Device Setup Needed"
  ? "Preferences saved; enable this device for push delivery"
  : "Saved commute alerts and closure reminders",
```

Change tone calculation so `"Device Setup Needed"` maps to `"off"`:

```ts
const tone: "on" | "off" | "unavailable" =
  notificationStatusLabel === "On" ? "on" :
  notificationStatusLabel === "Device Setup Needed" || notificationStatusLabel === "Off" ? "off" :
  "unavailable";
```

- [ ] **Step 8: Update smoke test expectations**

In `frontend/tests/smoke/dashboard.spec.ts`, keep existing notifications panel smoke coverage and add an expectation after opening the notifications panel:

```ts
await expect(page.getByText("Device Notifications")).toBeVisible();
await expect(page.getByText(/Account notifications are on|This device is receiving notifications|Push not configured/)).toBeVisible();
```

Use the existing stubbed auth/push setup in the smoke file. Do not require real browser notification permission in Playwright.

- [ ] **Step 9: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: Passes.

- [ ] **Step 10: Commit UI state semantics**

Run:

```bash
git add frontend/src/components/NotificationSettingsPanel.tsx frontend/src/components/LineWatchShell.tsx frontend/tests/notification-settings-navigation.test.mjs frontend/tests/push-notification-preferences.test.mjs frontend/tests/smoke/dashboard.spec.ts
git commit -m "fix: show account notification intent separately from device setup"
```

Expected: Commit succeeds if no unrelated changes are staged.

## Task 7: Smoke Stub And API Compatibility

**Files:**

- Modify: `frontend/tests/smoke/api-stub.mjs`
- Test: `frontend/tests/smoke/dashboard.spec.ts`
- Test: `frontend/tests/account-data.test.mjs`

- [ ] **Step 1: Update smoke API stub config response**

In `frontend/tests/smoke/api-stub.mjs`, update the `/api/account/push/config` response to include:

```js
deviceSummary: {
  enabledDeviceCount: pushSubscriptions.size,
  hasEnabledDevices: pushSubscriptions.size > 0,
},
```

If the stub stores subscriptions in an array instead of a `Map` or `Set`, use that collection's length.

- [ ] **Step 2: Update smoke API stub preference response**

In the `/api/account/push/preferences` handler, return the updated `pushPreferences` object directly:

```js
return jsonResponse(pushPreferences);
```

Do not return `{ id, enabled, commuteNotificationsEnabled, plannedClosureNotificationsEnabled }` from the preferences endpoint.

- [ ] **Step 3: Keep subscription response unchanged**

In the `/api/account/push/subscription` handler, keep returning:

```js
return jsonResponse({
  id: "push_subscription_stub",
  enabled: true,
  commuteNotificationsEnabled: pushPreferences.commuteNotificationsEnabled,
  plannedClosureNotificationsEnabled: pushPreferences.plannedClosureNotificationsEnabled,
});
```

This response still represents the current browser endpoint save result.

- [ ] **Step 4: Run adapter and smoke-related tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: Passes.

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: Passes. If browser permission APIs are unavailable in the smoke environment, the smoke should still pass by accepting `Push not configured` or the account/device explanatory text.

- [ ] **Step 5: Commit stub compatibility**

Run:

```bash
git add frontend/tests/smoke/api-stub.mjs frontend/tests/smoke/dashboard.spec.ts frontend/tests/account-data.test.mjs
git commit -m "test: align push stubs with account preferences"
```

Expected: Commit succeeds if no unrelated changes are staged.

## Task 8: Documentation And Agent Instructions

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `GEMINI.md`

- [ ] **Step 1: Update README notification behavior**

In the README Web Push section around the existing device/account sentence, replace that paragraph with:

```md
Device push enablement is per browser/device. Saved-commute, line-wide, event-type, and reminder preferences are account-level and can be changed before a browser subscription exists. Reinstalling the PWA or switching browsers does not turn account notification preferences off, but the current device must have browser notification permission and a valid Web Push subscription before it can receive pushes. When browser permission is already granted, LineWatchTO attempts to recreate the current device subscription after sign-in; when permission is not granted, the Notifications panel shows an "enable this device" state.
```

- [ ] **Step 2: Update README API table**

In the API table, change the `GET /api/account/push/config` description to:

```md
Account push availability, VAPID public key, account-level notification preferences, line subscriptions, event-type filters, reminder timing, and enabled-device summary.
```

Change the `PUT /api/account/push/preferences` description to:

```md
Update account-level saved-commute, line subscription, event-type, and reminder timing notification preferences. This does not enable or disable the current browser subscription.
```

- [ ] **Step 3: Update AGENTS.md and GEMINI.md together**

In both files, adjust the Web Push current reality bullet so it includes:

```md
Device push enablement is per browser/device. Account notification preferences remain account-level across PWA reinstall or browser changes; the Notifications panel distinguishes account intent from current-device setup and can restore a device subscription when browser permission is already granted.
```

Keep the warning that push delivery is inactive unless browser permission is granted, VAPID keys are configured, `linewatch.push.enabled` is true, and fresh dashboard-visible impacts exist.

- [ ] **Step 4: Run docs consistency search**

Run:

```bash
rg -n "Device push enablement|push preferences|subscription response|preferences endpoint|reinstall" README.md AGENTS.md GEMINI.md docs frontend/src backend/src
```

Expected: No docs claim that uninstalling/reinstalling turns account notifications off. No docs claim the app can bypass browser/OS permission policy.

- [ ] **Step 5: Commit docs**

Run:

```bash
git add README.md AGENTS.md GEMINI.md
git commit -m "docs: clarify account and device notification state"
```

Expected: Commit succeeds if no unrelated changes are staged.

## Task 9: Full Verification

**Files:**

- Verify: backend, frontend, docs

- [ ] **Step 1: Run backend tests**

Run:

```bash
mvn -f backend/pom.xml test
```

Expected: Passes.

- [ ] **Step 2: Run frontend fixture tests**

Run:

```bash
npm --prefix frontend run test:fixtures
```

Expected: Passes.

- [ ] **Step 3: Run frontend typecheck**

Run:

```bash
npm --prefix frontend run typecheck
```

Expected: Passes.

- [ ] **Step 4: Run frontend lint**

Run:

```bash
npm --prefix frontend run lint
```

Expected: Passes.

- [ ] **Step 5: Run frontend build**

Run:

```bash
npm --prefix frontend run build
```

Expected: Passes.

- [ ] **Step 6: Run frontend smoke tests**

Run:

```bash
npm --prefix frontend run test:smoke
```

Expected: Passes.

- [ ] **Step 7: Manual browser check with a local backend**

Start the backend with push enabled if local VAPID helpers are available:

```bash
scripts/dev-backend-live-push.sh
```

Start the frontend:

```bash
npm --prefix frontend run dev
```

Open the local URL printed by Next.js. Sign in, open `More -> Notifications`, and verify these states:

- Account preferences can be toggled while device push is off.
- Turning off "this device" does not turn off saved commute or line subscription preferences.
- With permission `default`, the panel says account notifications are on and asks to enable this device.
- With permission `granted` and no local subscription, the app attempts to restore the device subscription.
- With permission `denied`, the panel shows blocked and does not keep retrying.

- [ ] **Step 8: Final status**

Run:

```bash
git status --short
```

Expected: Only intentional commits or intentional uncommitted changes remain. If user-owned dirty files existed before this plan, they may still be present and must not be reverted.

## Acceptance Criteria

- `GET /api/account/push/config` includes `deviceSummary.enabledDeviceCount` and `deviceSummary.hasEnabledDevices`.
- `PUT /api/account/push/preferences` returns account preferences and does not inspect or mutate browser subscriptions.
- `POST /api/account/push/subscription/disable` disables only the current browser endpoint.
- Frontend hook exposes both `accountNotificationsDesired` and `deviceSetupState`.
- Reinstall/no-subscription state no longer reads as account notifications being off when account preferences are on.
- If permission is already granted, the hook attempts one silent restore for the signed-in account and VAPID key.
- If permission is default or denied, the hook does not auto-prompt and the UI shows the correct device setup state.
- Saved commute summary can show `Device Setup Needed`.
- README, AGENTS.md, and GEMINI.md all describe account-level preferences and device-level push enablement consistently.
- Backend, frontend fixture, typecheck, lint, build, and smoke verification commands pass or have exact environment failures documented.

## Gemini 3.5 Handoff Notes

- Read `AGENTS.md` and `GEMINI.md` first. They contain project-specific claims that must stay accurate.
- Prefer test-first changes. Each task above has a failing test before implementation.
- Use `rg` for search and keep edits scoped to notification state.
- Do not add dependencies.
- Do not remove legacy subscription preference columns in this slice.
- Do not claim live TTC notification delivery unless Web Push is configured and fresh dashboard-visible impacts exist.
- Do not describe scenario or fallback data as live TTC service.

## Self-Review

- Spec coverage: The plan covers account preference ownership, device subscription ownership, reinstall restoration, blocked/default permission handling, UI wording, backend API shape, docs, and verification.
- Placeholder scan: No task relies on unspecified work. Every code-changing task names concrete files, commands, expected results, and code snippets.
- Type consistency: Backend response names are `PushDeviceSummaryResponse`, `PushConfigResponse`, and `PushPreferencesResponse`. Frontend names are `PushDeviceSummary`, `DevicePushSetupState`, `accountNotificationsDesired`, `canAutoRestoreDevicePush`, and `deviceSetupState`.
- Scope check: This plan does not add quiet hours, email, alternate routes, accessibility-personalized matching, or a migration to drop legacy subscription preference columns.

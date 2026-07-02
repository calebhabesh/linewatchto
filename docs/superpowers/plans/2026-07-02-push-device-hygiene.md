# Push Device Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in account see enabled push endpoints, identify stale/no-ack devices, and manually disable old endpoints without auto-deleting accepted subscriptions.

**Architecture:** Add an account-owned device summary API beside existing push diagnostics. The backend derives device status from `push_subscriptions` plus recent delivery/display evidence, and the frontend renders those summaries inside the More diagnostics panel with a disable action per enabled endpoint.

**Tech Stack:** Spring Boot, Spring Data JPA, Java records, Next.js/React/TypeScript, Node test runner, Maven.

---

### Task 1: Backend Device Summary

**Files:**
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushResponses.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushSubscriptionRepository.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationDeliveryRepository.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationService.java`
- Modify: `backend/src/main/java/com/calebhabesh/linewatch/push/PushNotificationController.java`
- Test: `backend/src/test/java/com/calebhabesh/linewatch/push/PushNotificationServiceTest.java`

- [ ] Write a failing service test that returns enabled devices with endpoint hash prefix, label, last seen, last attempted, last displayed, stale status, and accepted-without-display count.
- [ ] Write a failing service test that disables a subscription by id only when it belongs to the signed-in account.
- [ ] Implement `PushDeviceResponse` and `PushDevicesResponse`.
- [ ] Add repository methods for account subscriptions and recent deliveries by subscription id.
- [ ] Add `devices(account)` and `disableDevice(account, subscriptionId)` to `PushNotificationService`.
- [ ] Add `GET /api/account/push/devices` and `POST /api/account/push/devices/{subscriptionId}/disable`.
- [ ] Run `mvn -f backend/pom.xml -Dtest=PushNotificationServiceTest test`.

### Task 2: Frontend Adapter And UI

**Files:**
- Modify: `frontend/src/app/account-data.ts`
- Modify: `frontend/src/components/PushDeliveryDiagnosticsPanel.tsx`
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/tests/account-data.test.mjs`
- Test: `frontend/tests/notification-settings-navigation.test.mjs`

- [ ] Write failing adapter tests for loading push devices and disabling by subscription id.
- [ ] Write failing source-shape tests that the diagnostics panel uses `getPushDevices`, renders stale status, and calls `disablePushDevice`.
- [ ] Add `PushDevice`, `PushDevicesResult`, `getPushDevices`, and `disablePushDevice`.
- [ ] Load devices with diagnostics and render an enabled-device hygiene section above recent attempts.
- [ ] Add a disable button for enabled stale/no-ack endpoints, with loading/error state and refresh after success.
- [ ] Add compact responsive CSS for device rows and actions.
- [ ] Run `npm --prefix frontend run test:fixtures`.

### Task 3: Verification

**Files:**
- No additional source files.

- [ ] Run `mvn -f backend/pom.xml test`.
- [ ] Run `npm --prefix frontend run test:fixtures`.
- [ ] Run `npm --prefix frontend run typecheck`.
- [ ] Run `npm --prefix frontend run lint`.
- [ ] Run `npm --prefix frontend run build`.
- [ ] Summarize changed behavior and any existing warnings.

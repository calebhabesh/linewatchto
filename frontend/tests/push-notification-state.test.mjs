import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  accountNotificationsDesired,
  canAutoRestoreDevicePush,
  pushDeviceDisabledStorageKey,
  setupStateAfterPreferenceUpdate,
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

  it("moves from account-off to device setup when preferences are re-enabled without a subscription", () => {
    assert.equal(setupStateAfterPreferenceUpdate({
      currentlySubscribed: false,
      authenticated: true,
      supported: true,
      webPushAvailable: true,
      hasVapidPublicKey: true,
      accountNotificationsDesired: true,
      notificationPermission: "granted",
      hasCurrentSubscription: false,
      currentSubscriptionUsesVapidKey: false,
      deviceDisabledByUser: false,
    }), "needs-device-enable");
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { defaultPushNotificationPreferences } from "../src/app/account-data.ts";

const hookSource = readFileSync(new URL("../src/hooks/usePushNotificationSettings.ts", import.meta.url), "utf8");
const notificationPanelSource = readFileSync(new URL("../src/components/NotificationSettingsPanel.tsx", import.meta.url), "utf8");

describe("push notification preferences schema", () => {
  it("defines nested preferences structure in account-data.ts", () => {
    const source = readFileSync(new URL("../src/app/account-data.ts", import.meta.url), "utf8");
    assert.match(source, /savedCommutes/);
    assert.match(source, /lineSubscriptions/);
    assert.match(source, /reminderTiming/);
  });

  it("exports default push notification preferences with all lines unsubscribed", () => {
    assert.equal(defaultPushNotificationPreferences.commuteNotificationsEnabled, true);
    assert.equal(defaultPushNotificationPreferences.plannedClosureNotificationsEnabled, true);
    assert.equal(defaultPushNotificationPreferences.savedCommutes.currentDisruptions, true);
    assert.equal(defaultPushNotificationPreferences.savedCommutes.plannedClosureReminders, true);
    assert.equal(defaultPushNotificationPreferences.savedCommutes.eventTypes.reducedSpeedZones, true);
    assert.equal(defaultPushNotificationPreferences.lineSubscriptions.lines.length, 5);
    
    // All lines must be unsubscribed by default
    for (const line of defaultPushNotificationPreferences.lineSubscriptions.lines) {
      assert.equal(line.subscribed, false);
    }
    
    // Line-wide Reduced Speed Zones must be enabled by default
    assert.equal(defaultPushNotificationPreferences.lineSubscriptions.eventTypes.reducedSpeedZones, true);
    
    assert.equal(defaultPushNotificationPreferences.reminderTiming.closure24h, true);
    assert.equal(defaultPushNotificationPreferences.reminderTiming.closureMorning, true);
  });

  it("does not save fallback notification defaults before backend preferences load", () => {
    assert.match(hookSource, /preferencesLoaded/);
    assert.match(hookSource, /result\.source !== "backend"/);
    assert.match(hookSource, /setPreferencesLoaded\(false\)/);
    assert.match(hookSource, /if \(!preferencesLoaded\)/);
    assert.match(notificationPanelSource, /disabled=\{busy \|\| !preferencesLoaded\}/);
    assert.match(hookSource, /accountNotificationsDesired/);
    assert.match(hookSource, /deviceSetupState/);
    assert.match(notificationPanelSource, /Account notifications are on/);
  });
});

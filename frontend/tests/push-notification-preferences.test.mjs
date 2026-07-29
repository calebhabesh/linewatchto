import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  defaultPushNotificationPreferences,
  normalizePlannedClosureFollowUpPolicy,
} from "../src/app/account-data.ts";

const hookSource = readFileSync(new URL("../src/hooks/usePushNotificationSettings.ts", import.meta.url), "utf8");
const notificationPanelSource = readFileSync(new URL("../src/components/NotificationSettingsPanel.tsx", import.meta.url), "utf8");
const accountDataSource = readFileSync(new URL("../src/app/account-data.ts", import.meta.url), "utf8");

describe("push notification preferences schema", () => {
  it("defines nested preferences structure in account-data.ts", () => {
    assert.match(accountDataSource, /savedCommutes/);
    assert.match(accountDataSource, /lineSubscriptions/);
    assert.match(accountDataSource, /plannedClosureFollowUp/);
  });

  it("maps legacy reminder switches to the new single follow-up policy", () => {
    assert.equal(normalizePlannedClosureFollowUpPolicy(undefined, {
      closure24h: true,
      closureMorning: true,
    }), "smart");
    assert.equal(normalizePlannedClosureFollowUpPolicy(undefined, {
      closure24h: true,
      closureMorning: false,
    }), "within-24-hours");
    assert.equal(normalizePlannedClosureFollowUpPolicy(undefined, {
      closure24h: false,
      closureMorning: true,
    }), "day-of");
    assert.equal(normalizePlannedClosureFollowUpPolicy(undefined, {
      closure24h: false,
      closureMorning: false,
    }), "announcements-only");
  });

  it("exports default push notification preferences with all TTC lines and regional corridors unsubscribed", () => {
    assert.equal(defaultPushNotificationPreferences.commuteNotificationsEnabled, true);
    assert.equal(defaultPushNotificationPreferences.plannedClosureNotificationsEnabled, true);
    assert.equal(defaultPushNotificationPreferences.savedCommutes.currentDisruptions, true);
    assert.equal(defaultPushNotificationPreferences.savedCommutes.plannedClosureReminders, true);
    assert.equal(defaultPushNotificationPreferences.savedCommutes.eventTypes.reducedSpeedZones, true);
    assert.equal(defaultPushNotificationPreferences.lineSubscriptions.lines.length, 13);
    assert.equal(
      defaultPushNotificationPreferences.lineSubscriptions.lines.filter((line) => line.lineId.startsWith("regional-")).length,
      8,
    );
    
    // All lines must be unsubscribed by default
    for (const line of defaultPushNotificationPreferences.lineSubscriptions.lines) {
      assert.equal(line.subscribed, false);
    }
    
    // Line-wide Reduced Speed Zones must be enabled by default
    assert.equal(defaultPushNotificationPreferences.lineSubscriptions.eventTypes.reducedSpeedZones, true);
    
    assert.equal(defaultPushNotificationPreferences.plannedClosureFollowUp, "smart");
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

  it("keeps the frontend notification state surface lean", () => {
    assert.doesNotMatch(hookSource, /BrowserPushStatus/);
    assert.doesNotMatch(hookSource, /browserStatus/);
    assert.match(hookSource, /deviceSetupState/);
    assert.doesNotMatch(accountDataSource, /defaultPushDeviceSummary/);
    assert.doesNotMatch(accountDataSource, /deviceSummary:\s*PushDeviceSummary/);
  });
});

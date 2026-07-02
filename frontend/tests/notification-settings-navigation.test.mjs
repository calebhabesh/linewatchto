import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const savedCommutesSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const notificationPanelSource = readFileSync(new URL("../src/components/NotificationSettingsPanel.tsx", import.meta.url), "utf8");
const diagnosticsPanelSource = readFileSync(new URL("../src/components/PushDeliveryDiagnosticsPanel.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("notification settings navigation", () => {
  it("centralizes notification settings behind More without adding a mobile nav item", () => {
    assert.match(shellSource, /type ActiveView = .*"notifications".*"more"/s);
    assert.match(shellSource, /<NotificationSettingsPanel/);
    assert.match(shellSource, /case "notifications": return "Notifications"/);
    assert.match(shellSource, /activeView === "notifications"/);
    assert.match(shellSource, /mobileNavKey.*activeView === "notifications".*"more"/s);

    assert.match(moreSheetSource, /onOpenNotifications/);
    assert.match(moreSheetSource, /<Bell/);
    assert.match(moreSheetSource, />\s*Notifications\s*</);
    assert.match(moreSheetSource, /!accountState\.authenticated/);
    assert.match(moreSheetSource, />\s*Sign In\s*</);

    assert.match(savedCommutesSource, /onOpenNotificationSettings/);
    assert.match(savedCommutesSource, /Notifications:/);
    assert.match(savedCommutesSource, /\bManage\b/);
    assert.doesNotMatch(savedCommutesSource, /function PushNotificationSettings/);
  });

  it("shows real saved-commute push controls plus conservative future notification sections", () => {
    assert.match(notificationPanelSource, /Device Notifications/);
    assert.match(notificationPanelSource, /Push for this browser/);
    assert.match(notificationPanelSource, /Account notifications are on/);
    assert.match(notificationPanelSource, /This device is receiving notifications/);
    assert.match(notificationPanelSource, /Enable on This Device/);
    assert.match(shellSource, /Device Setup Needed/);
    assert.match(notificationPanelSource, /Saved Commute Alerts/);
    assert.match(notificationPanelSource, /Current Disruptions Affecting Saved Commutes/);
    assert.match(notificationPanelSource, /Planned Closure Reminders/);
    assert.match(notificationPanelSource, /Line Subscriptions/);
    assert.match(notificationPanelSource, /Line 1/);
    assert.match(notificationPanelSource, /Line 2/);
    assert.match(notificationPanelSource, /Line 4/);
    assert.match(notificationPanelSource, /Line 5/);
    assert.match(notificationPanelSource, /Line 6/);
    assert.match(notificationPanelSource, /Event Types/);
    assert.match(notificationPanelSource, /Suspensions \/ Closures/);
    assert.match(notificationPanelSource, /Delays/);
    assert.match(notificationPanelSource, /Reduced Speed Zones/);
    assert.match(notificationPanelSource, /Planned Closures/);
    assert.match(notificationPanelSource, /Service Restored Updates/);
    assert.match(notificationPanelSource, /Reminder Timing/);
    assert.match(notificationPanelSource, /Event Starts\/Changes/);
    assert.match(notificationPanelSource, /24h Before Closure/);
    assert.match(notificationPanelSource, /Morning of Closure/);
    assert.doesNotMatch(notificationPanelSource, /Coming later/);
    assert.doesNotMatch(notificationPanelSource, /Line-wide alerts are planned/);
    assert.match(globalCss, /\.notification-settings-panel/);
    assert.match(globalCss, /\.saved-commute-notification-summary/);
  });

  it("surfaces recent push delivery diagnostics from More instead of notification settings", () => {
    assert.match(moreSheetSource, /PushDeliveryDiagnosticsPanel/);
    assert.match(diagnosticsPanelSource, /Notification Diagnostics/);
    assert.match(diagnosticsPanelSource, /getPushDeliveryDiagnostics/);
    assert.match(diagnosticsPanelSource, /Recent Push Attempts/);
    assert.match(diagnosticsPanelSource, /selectedDeviceKey/);
    assert.match(diagnosticsPanelSource, /diagnosticDeviceOptions/);
    assert.match(diagnosticsPanelSource, /notification\.attempts/);
    assert.match(diagnosticsPanelSource, /sourceIncidentKey/);
    assert.doesNotMatch(notificationPanelSource, /getPushDeliveryDiagnostics/);
    assert.doesNotMatch(notificationPanelSource, /Delivery Diagnostics/);
    assert.match(globalCss, /\.push-diagnostics-scroll/);
    assert.match(globalCss, /\.push-diagnostics-details/);
  });
});

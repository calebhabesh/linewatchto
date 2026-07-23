import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const savedCommutesSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const notificationPanelSource = readFileSync(new URL("../src/components/NotificationSettingsPanel.tsx", import.meta.url), "utf8");
const diagnosticsPanelSource = readFileSync(new URL("../src/components/PushDeliveryDiagnosticsPanel.tsx", import.meta.url), "utf8");
const diagnosticsStateSource = readFileSync(new URL("../src/app/push-diagnostics-state.ts", import.meta.url), "utf8");
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
    assert.match(notificationPanelSource, /TransitLineBadge/);
    assert.match(notificationPanelSource, /lineId=\{line\.lineId\}/);
    assert.match(notificationPanelSource, /lineNumber=\{line\.lineNumber\}/);
    assert.match(notificationPanelSource, /Event Types/);
    assert.match(notificationPanelSource, /Suspensions \/ Closures/);
    assert.match(notificationPanelSource, /Delays/);
    assert.match(notificationPanelSource, /Reduced Speed Zones/);
    assert.match(notificationPanelSource, /Planned Closures/);
    assert.match(notificationPanelSource, /Service Restored Updates/);
    assert.match(notificationPanelSource, /Planned Closure Follow-ups/);
    assert.match(notificationPanelSource, /Smart/);
    assert.match(notificationPanelSource, /Within 24 Hours/);
    assert.match(notificationPanelSource, /Day Of/);
    assert.match(notificationPanelSource, /Announcements Only/);
    assert.doesNotMatch(notificationPanelSource, /Event Starts\/Changes/);
    assert.doesNotMatch(notificationPanelSource, /Coming later/);
    assert.doesNotMatch(notificationPanelSource, /Line-wide alerts are planned/);
    assert.match(globalCss, /\.notification-settings-panel/);
    assert.match(globalCss, /\.saved-commute-notification-summary/);
  });

  it("surfaces recent push delivery diagnostics from More instead of notification settings", () => {
    assert.match(moreSheetSource, /PushDeliveryDiagnosticsPanel/);
    assert.match(diagnosticsPanelSource, /Notification Diagnostics/);
    assert.match(diagnosticsPanelSource, /getPushDeliveryDiagnostics/);
    assert.match(diagnosticsPanelSource, /getPushDevices/);
    assert.match(diagnosticsPanelSource, /disablePushDevice/);
    assert.match(diagnosticsPanelSource, /sendPushDeviceTestNotification/);
    assert.match(diagnosticsPanelSource, /Recent Push Attempts/);
    assert.match(diagnosticsPanelSource, /Active Browser Installations/);
    assert.match(diagnosticsPanelSource, /Endpoint expired/);
    assert.match(diagnosticsPanelSource, /Replaced expired endpoint/);
    assert.match(diagnosticsPanelSource, /earlier .*endpoint/);
    assert.match(diagnosticsPanelSource, /acceptedWithoutDisplayCount/);
    assert.match(diagnosticsPanelSource, /Endpoint \{device\.endpointHashPrefix\}/);
    assert.match(diagnosticsPanelSource, /Installation \{device\.installationIdPrefix/);
    assert.match(diagnosticsPanelSource, /Endpoint hashes can rotate/);
    assert.match(diagnosticsPanelSource, /Installation first registered/);
    assert.match(diagnosticsPanelSource, /Current endpoint registered/);
    assert.match(diagnosticsPanelSource, /VAPID key/);
    assert.match(diagnosticsPanelSource, /Service worker reported display/);
    assert.match(diagnosticsPanelSource, /staleCandidate/);
    assert.match(diagnosticsPanelSource, /selectedDeviceKey/);
    assert.match(diagnosticsPanelSource, /diagnosticDeviceOptions/);
    assert.match(diagnosticsPanelSource, /notification\.recipients/);
    assert.match(diagnosticsPanelSource, /recipient\.reason/);
    assert.match(diagnosticsPanelSource, /showArchivedDevices/);
    assert.match(diagnosticsPanelSource, /Show archived devices/);
    assert.match(diagnosticsStateSource, /Current and delivered endpoints/);
    assert.match(diagnosticsPanelSource, /sourceIncidentKey/);
    assert.doesNotMatch(notificationPanelSource, /getPushDeliveryDiagnostics/);
    assert.doesNotMatch(notificationPanelSource, /Delivery Diagnostics/);
    assert.match(globalCss, /\.push-diagnostics-scroll/);
    assert.match(globalCss, /\.push-diagnostics-details/);
    assert.match(globalCss, /\.push-devices-section/);
    assert.match(globalCss, /\.push-device-row/);
    assert.match(globalCss, /\.push-device-main/);
    assert.match(globalCss, /\.push-device-meta/);
    assert.match(globalCss, /\.push-device-disable/);
    assert.match(globalCss, /\.push-device-test/);
    assert.match(globalCss, /\.push-diagnostics-recipient/);
    assert.match(globalCss, /\.push-diagnostics-archive-toggle/);
  });

  it("offers Android battery guidance without promising reliable delivery", () => {
    assert.match(moreSheetSource, /Android Notification Reliability/);
    assert.match(moreSheetSource, /Unrestricted/);
    assert.match(moreSheetSource, /Chrome/);
    assert.match(moreSheetSource, /more battery/);
    assert.match(moreSheetSource, /cannot guarantee immediate delivery/);
    assert.match(moreSheetSource, /android-notification-steps/);
    assert.match(moreSheetSource, /Remove the battery restriction/);
    assert.match(moreSheetSource, /Allow visible alerts/);
    assert.match(globalCss, /\.android-notification-caution/);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const savedCommutesSource = readFileSync(new URL("../src/components/SavedCommutesPanel.tsx", import.meta.url), "utf8");
const notificationPanelSource = readFileSync(new URL("../src/components/NotificationSettingsPanel.tsx", import.meta.url), "utf8");
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

    assert.match(savedCommutesSource, /onOpenNotificationSettings/);
    assert.match(savedCommutesSource, /Notifications:/);
    assert.match(savedCommutesSource, /\bManage\b/);
    assert.doesNotMatch(savedCommutesSource, /function PushNotificationSettings/);
  });

  it("shows real saved-commute push controls plus conservative future notification sections", () => {
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
    assert.match(globalCss, /\.notification-settings-panel/);
    assert.match(globalCss, /\.saved-commute-notification-summary/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  diagnosticDeviceOptions,
  selectedDeviceKeyForCurrentEndpoint,
  visibleRecipientsForNotification,
} from "../src/app/push-diagnostics-state.ts";

const enabledAndroid = {
  subscriptionId: "push_subscription_android_current",
  deviceLabel: "Android Chrome",
  userAgent: "Mozilla/5.0 Android Chrome",
  endpointHashPrefix: "b04ccb88a6d8",
  subscriptionEnabled: true,
  enabledAt: "2026-07-07T20:54:00Z",
  disabledAt: null,
  status: "attempted",
  reasonCode: "attempted",
  reason: "Delivery was attempted for this device.",
  delivery: null,
};

const enabledIos = {
  subscriptionId: "push_subscription_ios_current",
  deviceLabel: "iOS Safari",
  userAgent: "Mobile Safari iPhone",
  endpointHashPrefix: "c82849f75b33",
  subscriptionEnabled: true,
  enabledAt: "2026-07-07T14:32:00Z",
  disabledAt: null,
  status: "attempted",
  reasonCode: "attempted",
  reason: "Delivery was attempted for this device.",
  delivery: null,
};

const archivedAndroid = {
  subscriptionId: "push_subscription_android_old",
  deviceLabel: "Android Chrome",
  userAgent: "Mozilla/5.0 Android Chrome",
  endpointHashPrefix: "80fb015e36c1",
  subscriptionEnabled: false,
  enabledAt: "2026-07-07T12:00:00Z",
  disabledAt: "2026-07-07T13:00:00Z",
  status: "not-attempted",
  reasonCode: "subscription-disabled-before-event",
  reason: "Device was disabled before this notification was created.",
  delivery: null,
};

const notification = {
  id: "push_event_1",
  title: "Line 1 Delay",
  tag: "line-current|line-1|delay|ttc-route-71768|active",
  notificationKey: "line-current|line-1|delay|ttc-route-71768",
  sourceIncidentKey: "line-current|line-1|ttc-route-71768",
  notificationState: "ACTIVE",
  category: "line-current",
  eventType: "delay",
  lineId: "line-1",
  lineNumber: "1",
  eventCreatedAt: "2026-07-07T20:30:00Z",
  attempts: [],
  recipients: [enabledAndroid, enabledIos, archivedAndroid],
};

describe("push diagnostics state", () => {
  it("hides archived device recipients from current diagnostics by default", () => {
    const recipients = visibleRecipientsForNotification(notification, false);

    assert.deepEqual(
      recipients.map((recipient) => recipient.endpointHashPrefix),
      ["b04ccb88a6d8", "c82849f75b33"],
    );
  });

  it("keeps archived devices available only when archive mode is enabled", () => {
    const currentOptions = diagnosticDeviceOptions([notification], false);
    const archiveOptions = diagnosticDeviceOptions([notification], true);

    assert.deepEqual(
      currentOptions.map((option) => option.label),
      ["Current and delivered endpoints", "Android Chrome", "iOS Safari"],
    );
    assert.deepEqual(
      archiveOptions.map((option) => option.label),
      ["All endpoints", "Android Chrome - b04ccb88a6d8", "iOS Safari", "Android Chrome - 80fb015e36c1"],
    );
  });

  it("defaults the selected filter to the current browser push endpoint when it is present", () => {
    const options = diagnosticDeviceOptions([notification], false);

    assert.equal(
      selectedDeviceKeyForCurrentEndpoint("b04ccb88a6d8", options),
      "Android Chrome|b04ccb88a6d8",
    );
    assert.equal(selectedDeviceKeyForCurrentEndpoint("missing", options), "all");
  });
});

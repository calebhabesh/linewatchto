import { type PushNotificationPreferences } from "./push-data.ts";

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

export type PreferenceUpdateDeviceStateInput = AutoRestoreDevicePushInput & {
  currentlySubscribed: boolean;
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
    (!input.hasCurrentSubscription || !input.currentSubscriptionUsesVapidKey) &&
    !input.deviceDisabledByUser;
}

export function deviceNotificationSwitchChecked(input: AutoRestoreDevicePushInput): boolean {
  if (!input.authenticated) return false;
  if (!input.supported) return false;
  if (!input.webPushAvailable || !input.hasVapidPublicKey) return false;
  if (input.notificationPermission === "denied") return false;
  if (input.deviceDisabledByUser) return false;
  if (input.hasCurrentSubscription && input.currentSubscriptionUsesVapidKey) return true;
  return input.accountNotificationsDesired && input.notificationPermission === "granted";
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

export function setupStateAfterPreferenceUpdate(input: PreferenceUpdateDeviceStateInput): DevicePushSetupState {
  if (input.currentlySubscribed) return "enabled";
  return setupStateForDevicePush(input);
}

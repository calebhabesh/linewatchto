import { useEffect, useMemo, useState, useCallback } from "react";
import {
  disablePushSubscription,
  getPushNotificationConfig,
  savePushSubscription,
  updatePushPreferences,
  defaultPushNotificationPreferences,
  type AccountState,
  type PushNotificationConfig,
  type PushNotificationPreferences,
} from "../app/account-data";
import {
  base64UrlToUint8Array,
  getCurrentPushSubscription,
  getPushServiceWorkerRegistration,
  pushSubscriptionUsesApplicationServerKey,
} from "../app/push-browser-state";
import {
  accountNotificationsDesired as deriveAccountNotificationsDesired,
  canAutoRestoreDevicePush,
  deviceNotificationSwitchChecked,
  pushDeviceDisabledStorageKey,
  setupStateAfterPreferenceUpdate,
  setupStateForDevicePush,
  type DevicePushSetupState,
} from "../app/push-notification-state";

export type UsePushNotificationSettingsResult = {
  supported: boolean;
  config: PushNotificationConfig | null;
  preferences: PushNotificationPreferences;
  subscribed: boolean;
  deviceNotificationsEnabled: boolean;
  busy: boolean;
  message: string | null;
  preferencesLoaded: boolean;
  reload: () => Promise<void>;
  enableDeviceNotifications: () => Promise<void>;
  disableDeviceNotifications: () => Promise<void>;
  updatePreferences: (next: PushNotificationPreferences) => Promise<void>;
  accountNotificationsDesired: boolean;
  deviceSetupState: DevicePushSetupState;
};

async function serviceWorkerRegistrationForPush() {
  const existing = await getPushServiceWorkerRegistration(navigator.serviceWorker);
  if (existing) return existing;
  const devFlag = process.env.NODE_ENV !== "production" ? "?env=dev" : "";
  return navigator.serviceWorker.register(`/sw.js${devFlag}`, {
    scope: "/",
    updateViaCache: "none",
  });
}

function pushSubscriptionKeys(subscription: PushSubscription) {
  const serialized = subscription.toJSON() as { keys?: { p256dh?: string; auth?: string } };
  return {
    p256dh: serialized.keys?.p256dh ?? "",
    auth: serialized.keys?.auth ?? "",
  };
}

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

export function usePushNotificationSettings(accountState: AccountState): UsePushNotificationSettingsResult {
  const supported = useMemo(() => (
    typeof window !== "undefined"
      && "Notification" in window
      && "serviceWorker" in navigator
      && "PushManager" in window
  ), []);

  const [config, setConfig] = useState<PushNotificationConfig | null>(null);
  const [preferences, setPreferences] = useState<PushNotificationPreferences>(defaultPushNotificationPreferences);
  const [subscribed, setSubscribed] = useState(false);
  const [deviceNotificationsEnabled, setDeviceNotificationsEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [deviceSetupState, setDeviceSetupState] = useState<DevicePushSetupState>("checking");
  const [autoRestoreAttemptedFor, setAutoRestoreAttemptedFor] = useState<string | null>(null);

  const accountNotificationsDesired = useMemo(
    () => deriveAccountNotificationsDesired(preferences),
    [preferences]
  );

  const saveDeviceSubscription = useCallback(async (subscription: PushSubscription) => {
    await savePushSubscription({
      endpoint: subscription.endpoint,
      keys: pushSubscriptionKeys(subscription),
      userAgent: navigator.userAgent,
      reason: "app-refresh",
    });
    return subscription;
  }, []);

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
    return await saveDeviceSubscription(subscription);
  }, [saveDeviceSubscription]);

  const fetchConfigAndSubscription = useCallback(async (isMounted: () => boolean) => {
    if (!accountState.authenticated || !supported) {
      setDeviceSetupState(accountState.authenticated ? "unsupported" : "signed-out");
      setDeviceNotificationsEnabled(false);
      return;
    }
    try {
      setDeviceSetupState("checking");
      const result = await getPushNotificationConfig();
      if (!isMounted()) return;
      if (result.source !== "backend") {
        setConfig(null);
        setPreferencesLoaded(false);
        setDeviceSetupState("not-configured");
        setDeviceNotificationsEnabled(false);
        setMessage(result.message ?? "Could not load notification preferences.");
        return;
      }
      setConfig(result.config);
      setPreferences(result.config.preferences);
      setPreferencesLoaded(true);
      setMessage(null);

      if (!result.config.webPushAvailable || !result.config.vapidPublicKey) {
        setSubscribed(false);
        setDeviceSetupState("not-configured");
        setDeviceNotificationsEnabled(false);
        return;
      }

      let subscription = await getCurrentPushSubscription(navigator.serviceWorker);
      let subscriptionUsesCurrentKey = subscription
        ? pushSubscriptionUsesApplicationServerKey(subscription, result.config.vapidPublicKey)
        : false;

      const desired = deriveAccountNotificationsDesired(result.config.preferences);
      const accountId = accountState.user?.id;
      let disabledByUser = readDeviceDisabledByUser(accountId);
      const permission: NotificationPermission | "unsupported" = supported ? Notification.permission : "unsupported";
      let subscriptionSavedDuringRestore = false;

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
        setDeviceSetupState("restoring");
        try {
          subscription = await createOrRefreshDeviceSubscription(result.config);
          subscriptionUsesCurrentKey = true;
          subscriptionSavedDuringRestore = true;
          writeDeviceDisabledByUser(accountId, false);
          disabledByUser = false;
          setAutoRestoreAttemptedFor(restoreKey);
        } catch (err) {
          console.error("Failed to restore device push subscription", err);
          setMessage("Notifications are on, but this device could not refresh its push registration.");
        }
      }

      if (subscription && subscriptionUsesCurrentKey && permission === "granted" && !disabledByUser && !subscriptionSavedDuringRestore) {
        try {
          await saveDeviceSubscription(subscription);
        } catch (err) {
          console.error("Failed to refresh device push subscription", err);
          setMessage("Notifications are on, but this device could not refresh its push registration.");
        }
      }

      if (!isMounted()) return;
      const stateInput = {
        authenticated: accountState.authenticated,
        supported,
        webPushAvailable: result.config.webPushAvailable,
        hasVapidPublicKey: Boolean(result.config.vapidPublicKey),
        accountNotificationsDesired: desired,
        notificationPermission: permission,
        hasCurrentSubscription: Boolean(subscription),
        currentSubscriptionUsesVapidKey: subscriptionUsesCurrentKey,
        deviceDisabledByUser: disabledByUser,
      };
      setSubscribed(Boolean(subscription && subscriptionUsesCurrentKey));
      setDeviceNotificationsEnabled(deviceNotificationSwitchChecked(stateInput));
      setDeviceSetupState(setupStateForDevicePush(stateInput));
      if (subscription && !subscriptionUsesCurrentKey) {
        setMessage("Push for this browser needs to be re-enabled.");
      }
    } catch (err) {
      console.error("Failed to load push notification config", err);
      if (isMounted()) {
        setPreferencesLoaded(false);
        setDeviceSetupState("not-configured");
        setDeviceNotificationsEnabled(false);
        setMessage("Could not load notification preferences.");
      }
    }
  }, [accountState.authenticated, accountState.user, supported, createOrRefreshDeviceSubscription, saveDeviceSubscription, autoRestoreAttemptedFor]);

  useEffect(() => {
    let mounted = true;
    const checkMounted = () => mounted;
    if (accountState.authenticated && supported) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchConfigAndSubscription(checkMounted);
    } else {
      setConfig(null);
      setPreferences(defaultPushNotificationPreferences);
      setPreferencesLoaded(false);
      setSubscribed(false);
      setDeviceNotificationsEnabled(false);
      setDeviceSetupState(accountState.authenticated ? "unsupported" : "signed-out");
    }
    return () => {
      mounted = false;
    };
  }, [accountState.authenticated, accountState.user?.id, supported, fetchConfigAndSubscription]);

  const reload = useCallback(async () => {
    const mounted = true;
    const checkMounted = () => mounted;
    await fetchConfigAndSubscription(checkMounted);
  }, [fetchConfigAndSubscription]);

  const enableDeviceNotifications = async () => {
    if (!config?.webPushAvailable || !config.vapidPublicKey) {
      setMessage("Push not configured for this environment.");
      return;
    }
    if (Notification.permission === "denied") {
      setMessage("Notifications are blocked in browser settings.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        setSubscribed(false);
        setDeviceNotificationsEnabled(false);
        setMessage("Notifications not enabled.");
        return;
      }
      const subscription = await createOrRefreshDeviceSubscription(config);
      writeDeviceDisabledByUser(accountState.user?.id, false);
      setSubscribed(Boolean(subscription));
      setDeviceNotificationsEnabled(Boolean(subscription));
      setDeviceSetupState("enabled");
      setMessage(null);
    } catch (err) {
      console.error("Failed to enable notifications", err);
      setSubscribed(false);
      setDeviceNotificationsEnabled(false);
      setMessage("Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  };

  const disableDeviceNotifications = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await getPushServiceWorkerRegistration(navigator.serviceWorker);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await disablePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      writeDeviceDisabledByUser(accountState.user?.id, true);
      setSubscribed(false);
      setDeviceNotificationsEnabled(false);
      setDeviceSetupState(accountNotificationsDesired ? "needs-device-enable" : "account-off");
      setMessage(null);
    } catch (err) {
      console.error("Failed to disable notifications", err);
      setMessage("Could not disable notifications.");
    } finally {
      setBusy(false);
    }
  };

  const updatePreferences = async (next: PushNotificationPreferences) => {
    if (!preferencesLoaded) {
      setMessage("Notification preferences are still loading.");
      return;
    }
    const previous = preferences;
    setPreferences(next);
    setMessage(null);
    try {
      const response = await updatePushPreferences(next);
      setPreferences(response);
      const notificationPermission: NotificationPermission | "unsupported" = supported ? Notification.permission : "unsupported";
      const stateInput = {
        authenticated: accountState.authenticated,
        supported,
        webPushAvailable: Boolean(config?.webPushAvailable),
        hasVapidPublicKey: Boolean(config?.vapidPublicKey),
        accountNotificationsDesired: deriveAccountNotificationsDesired(response),
        notificationPermission,
        hasCurrentSubscription: subscribed,
        currentSubscriptionUsesVapidKey: subscribed,
        deviceDisabledByUser: readDeviceDisabledByUser(accountState.user?.id),
      };
      setDeviceNotificationsEnabled(deviceNotificationSwitchChecked(stateInput));
      setDeviceSetupState(setupStateAfterPreferenceUpdate({
        currentlySubscribed: subscribed,
        ...stateInput,
      }));
      setMessage("Notification preferences updated.");
    } catch (err) {
      console.error("Failed to update preferences", err);
      setPreferences(previous);
      setMessage("Could not update notification preferences.");
    }
  };

  return {
    supported,
    config,
    preferences,
    subscribed,
    deviceNotificationsEnabled,
    busy,
    message,
    preferencesLoaded,
    reload,
    enableDeviceNotifications,
    disableDeviceNotifications,
    updatePreferences,
    accountNotificationsDesired,
    deviceSetupState,
  };
}

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
  getCurrentPushSubscription,
  getPushServiceWorkerRegistration,
} from "../app/push-browser-state";

export type BrowserPushStatus =
  | "signed-out"
  | "unsupported"
  | "not-configured"
  | "blocked"
  | "checking"
  | "off"
  | "on";

export type UsePushNotificationSettingsResult = {
  supported: boolean;
  config: PushNotificationConfig | null;
  preferences: PushNotificationPreferences;
  subscribed: boolean;
  busy: boolean;
  message: string | null;
  browserStatus: BrowserPushStatus;
  preferencesLoaded: boolean;
  reload: () => Promise<void>;
  enableDeviceNotifications: () => Promise<void>;
  disableDeviceNotifications: () => Promise<void>;
  updatePreferences: (next: PushNotificationPreferences) => Promise<void>;
};

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);

  const fetchConfigAndSubscription = useCallback(async (isMounted: () => boolean) => {
    if (!accountState.authenticated || !supported) return;
    try {
      setSubscriptionChecked(false);
      const result = await getPushNotificationConfig();
      if (!isMounted()) return;
      if (result.source !== "backend") {
        setConfig(null);
        setPreferencesLoaded(false);
        setSubscriptionChecked(true);
        setMessage(result.message ?? "Could not load notification preferences.");
        return;
      }
      setConfig(result.config);
      setPreferences(result.config.preferences);
      setPreferencesLoaded(true);
      setMessage(null);

      if (!result.config.webPushAvailable) {
        setSubscribed(false);
        setSubscriptionChecked(true);
        return;
      }

      const subscription = await getCurrentPushSubscription(navigator.serviceWorker);
      if (isMounted()) {
        setSubscribed(Boolean(subscription));
        setSubscriptionChecked(true);
      }
    } catch (err) {
      console.error("Failed to load push notification config", err);
      if (isMounted()) {
        setPreferencesLoaded(false);
        setSubscriptionChecked(true);
        setMessage("Could not load notification preferences.");
      }
    }
  }, [accountState.authenticated, supported]);

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
      setSubscriptionChecked(true);
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
        setSubscriptionChecked(true);
        setMessage("Notifications not enabled.");
        return;
      }
      const registration = await serviceWorkerRegistrationForPush();
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey),
      });
      await savePushSubscription({
        endpoint: subscription.endpoint,
        keys: pushSubscriptionKeys(subscription),
        userAgent: navigator.userAgent,
      });
      setSubscribed(true);
      setSubscriptionChecked(true);
      setMessage("Push for this browser is enabled.");
    } catch (err) {
      console.error("Failed to enable notifications", err);
      setSubscribed(false);
      setSubscriptionChecked(true);
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
      setSubscribed(false);
      setSubscriptionChecked(true);
      setMessage("Push for this browser is disabled.");
    } catch (err) {
      console.error("Failed to disable notifications", err);
      setSubscriptionChecked(true);
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
      setPreferences({
        ...next,
        commuteNotificationsEnabled: response.commuteNotificationsEnabled,
        plannedClosureNotificationsEnabled: response.plannedClosureNotificationsEnabled,
      });
      setMessage("Notification preferences updated.");
    } catch (err) {
      console.error("Failed to update preferences", err);
      setPreferences(previous);
      setMessage("Could not update notification preferences.");
    }
  };

  const browserStatus = useMemo<BrowserPushStatus>(() => {
    if (!accountState.authenticated) return "signed-out";
    if (!supported) return "unsupported";
    if (config && !config.webPushAvailable) return "not-configured";
    if (Notification.permission === "denied") return "blocked";
    if (!config || !subscriptionChecked) return "checking";
    return subscribed ? "on" : "off";
  }, [accountState.authenticated, supported, config, subscribed, subscriptionChecked]);

  return {
    supported,
    config,
    preferences,
    subscribed,
    busy,
    message,
    browserStatus,
    preferencesLoaded,
    reload,
    enableDeviceNotifications,
    disableDeviceNotifications,
    updatePreferences,
  };
}

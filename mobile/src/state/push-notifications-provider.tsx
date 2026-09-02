import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import {
  fetchPushConfig,
  updatePushPreferences as apiUpdatePushPreferences,
} from "@/api/push";
import type {
  EventTypePreferences,
  PushConfig,
  PushPreferences,
  UpdatePushPreferencesInput,
} from "@/api/push-schema";
import { useAuth } from "@/state/auth-provider";

export type PushNotificationsContextValue = {
  config: PushConfig | null;
  preferences: PushPreferences | null;
  loading: boolean;
  updating: boolean;
  updatePreferences: (input: UpdatePushPreferencesInput) => Promise<PushPreferences>;
  toggleLineSubscription: (lineId: string, subscribed: boolean) => Promise<void>;
  toggleEventType: (eventType: keyof EventTypePreferences, enabled: boolean) => Promise<void>;
  toggleCommuteNotifications: (enabled: boolean) => Promise<void>;
  togglePlannedClosureNotifications: (enabled: boolean) => Promise<void>;
  setPlannedClosureFollowUp: (policy: string) => Promise<void>;
  refetch: () => Promise<void>;
};

const PushNotificationsContext = createContext<PushNotificationsContextValue | null>(null);

export function PushNotificationsProvider({ children }: PropsWithChildren) {
  const { user, sessionToken, status } = useAuth();
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [preferences, setPreferences] = useState<PushPreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  const loadConfig = useCallback(async () => {
    if (!sessionToken || status !== "authenticated") {
      setConfig(null);
      setPreferences(null);
      return;
    }
    setLoading(true);
    try {
      const response = await fetchPushConfig(sessionToken);
      setConfig(response);
      setPreferences(response.preferences);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [sessionToken, status]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      if (!sessionToken || status !== "authenticated") {
        setConfig(null);
        setPreferences(null);
        return;
      }
      setLoading(true);
      try {
        const response = await fetchPushConfig(sessionToken);
        if (active) {
          setConfig(response);
          setPreferences(response.preferences);
        }
      } catch {
        // ignore
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
    };
  }, [sessionToken, status, user?.id]);

  const updatePreferences = useCallback(
    async (input: UpdatePushPreferencesInput): Promise<PushPreferences> => {
      if (!sessionToken) {
        throw new Error("You must be signed in to update notification settings.");
      }
      setUpdating(true);
      try {
        const updated = await apiUpdatePushPreferences(sessionToken, input);
        setPreferences(updated);
        setConfig((prev) => (prev ? { ...prev, preferences: updated } : null));
        return updated;
      } finally {
        setUpdating(false);
      }
    },
    [sessionToken],
  );

  const toggleLineSubscription = useCallback(
    async (lineId: string, subscribed: boolean) => {
      if (!preferences) return;
      const currentLines = preferences.lineSubscriptions.lines;
      const updatedLines = currentLines.map((l) =>
        l.lineId === lineId ? { ...l, subscribed } : l,
      );
      // Optimistic update
      setPreferences((prev) =>
        prev
          ? {
              ...prev,
              lineSubscriptions: { ...prev.lineSubscriptions, lines: updatedLines },
            }
          : null,
      );

      try {
        await updatePreferences({
          lineSubscriptions: {
            lines: updatedLines.map((l) => ({ lineId: l.lineId, subscribed: l.subscribed })),
          },
        });
      } catch (err) {
        void loadConfig();
        throw err;
      }
    },
    [preferences, updatePreferences, loadConfig],
  );

  const toggleEventType = useCallback(
    async (eventType: keyof EventTypePreferences, enabled: boolean) => {
      if (!preferences) return;
      const updatedEventTypes = {
        ...preferences.savedCommutes.eventTypes,
        [eventType]: enabled,
      };

      try {
        await updatePreferences({
          savedCommutes: {
            eventTypes: updatedEventTypes,
          },
          lineSubscriptions: {
            eventTypes: updatedEventTypes,
          },
        });
      } catch (err) {
        void loadConfig();
        throw err;
      }
    },
    [preferences, updatePreferences, loadConfig],
  );

  const toggleCommuteNotifications = useCallback(
    async (enabled: boolean) => {
      await updatePreferences({ commuteNotificationsEnabled: enabled });
    },
    [updatePreferences],
  );

  const togglePlannedClosureNotifications = useCallback(
    async (enabled: boolean) => {
      await updatePreferences({ plannedClosureNotificationsEnabled: enabled });
    },
    [updatePreferences],
  );

  const setPlannedClosureFollowUp = useCallback(
    async (policy: string) => {
      await updatePreferences({ plannedClosureFollowUp: policy });
    },
    [updatePreferences],
  );

  const value = useMemo<PushNotificationsContextValue>(
    () => ({
      config,
      preferences,
      loading,
      updating,
      updatePreferences,
      toggleLineSubscription,
      toggleEventType,
      toggleCommuteNotifications,
      togglePlannedClosureNotifications,
      setPlannedClosureFollowUp,
      refetch: loadConfig,
    }),
    [
      config,
      preferences,
      loading,
      updating,
      updatePreferences,
      toggleLineSubscription,
      toggleEventType,
      toggleCommuteNotifications,
      togglePlannedClosureNotifications,
      setPlannedClosureFollowUp,
      loadConfig,
    ],
  );

  return (
    <PushNotificationsContext.Provider value={value}>
      {children}
    </PushNotificationsContext.Provider>
  );
}

export function usePushNotifications(): PushNotificationsContextValue {
  const context = useContext(PushNotificationsContext);
  if (!context) {
    throw new Error(
      "usePushNotifications must be used within a PushNotificationsProvider",
    );
  }
  return context;
}

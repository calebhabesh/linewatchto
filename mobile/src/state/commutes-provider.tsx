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
  createSavedCommute as apiCreateSavedCommute,
  deleteSavedCommute as apiDeleteSavedCommute,
  fetchSavedCommutes,
  updateSavedCommute as apiUpdateSavedCommute,
  updateSavedCommuteNotificationRule as apiUpdateSavedCommuteNotificationRule,
} from "@/api/commutes";
import type {
  CreateSavedCommuteInput,
  NotificationRule,
  SavedCommute,
  UpdateSavedCommuteInput,
} from "@/api/commutes-schema";
import { useAuth } from "@/state/auth-provider";

export type CommutesContextValue = {
  commutes: SavedCommute[];
  loading: boolean;
  error: string | null;
  createCommute: (input: CreateSavedCommuteInput) => Promise<SavedCommute>;
  updateCommute: (id: string, input: UpdateSavedCommuteInput) => Promise<SavedCommute>;
  updateNotificationRule: (id: string, rule: NotificationRule) => Promise<SavedCommute>;
  deleteCommute: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
};

const CommutesContext = createContext<CommutesContextValue | null>(null);

export function CommutesProvider({ children }: PropsWithChildren) {
  const { user, sessionToken, status } = useAuth();
  const [commutes, setCommutes] = useState<SavedCommute[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCommutes = useCallback(async () => {
    if (!sessionToken || status !== "authenticated") {
      setCommutes([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetchSavedCommutes(sessionToken);
      setCommutes(response.commutes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load commutes.");
    } finally {
      setLoading(false);
    }
  }, [sessionToken, status]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      if (!sessionToken || status !== "authenticated") {
        setCommutes([]);
        setError(null);
        return;
      }
      setLoading(true);
      try {
        const response = await fetchSavedCommutes(sessionToken);
        if (active) {
          setCommutes(response.commutes);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load commutes.");
        }
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

  const createCommute = useCallback(
    async (input: CreateSavedCommuteInput): Promise<SavedCommute> => {
      if (!sessionToken) {
        throw new Error("You must be signed in to save a commute.");
      }
      const created = await apiCreateSavedCommute(sessionToken, input);
      setCommutes((prev) => [created, ...prev]);
      return created;
    },
    [sessionToken],
  );

  const updateCommute = useCallback(
    async (id: string, input: UpdateSavedCommuteInput): Promise<SavedCommute> => {
      if (!sessionToken) {
        throw new Error("You must be signed in to update a commute.");
      }
      const updated = await apiUpdateSavedCommute(sessionToken, id, input);
      setCommutes((prev) => prev.map((c) => (c.id === id ? updated : c)));
      return updated;
    },
    [sessionToken],
  );

  const updateNotificationRule = useCallback(
    async (id: string, rule: NotificationRule): Promise<SavedCommute> => {
      if (!sessionToken) {
        throw new Error("You must be signed in to update commute notifications.");
      }
      const updated = await apiUpdateSavedCommuteNotificationRule(sessionToken, id, rule);
      setCommutes((prev) => prev.map((c) => (c.id === id ? updated : c)));
      return updated;
    },
    [sessionToken],
  );

  const deleteCommute = useCallback(
    async (id: string): Promise<void> => {
      if (!sessionToken) {
        throw new Error("You must be signed in to delete a commute.");
      }
      // Optimistic delete
      setCommutes((prev) => prev.filter((c) => c.id !== id));
      try {
        await apiDeleteSavedCommute(sessionToken, id);
      } catch (err) {
        void loadCommutes();
        throw err;
      }
    },
    [sessionToken, loadCommutes],
  );

  const value = useMemo<CommutesContextValue>(
    () => ({
      commutes,
      loading,
      error,
      createCommute,
      updateCommute,
      updateNotificationRule,
      deleteCommute,
      refetch: loadCommutes,
    }),
    [
      commutes,
      loading,
      error,
      createCommute,
      updateCommute,
      updateNotificationRule,
      deleteCommute,
      loadCommutes,
    ],
  );

  return <CommutesContext.Provider value={value}>{children}</CommutesContext.Provider>;
}

export function useCommutes(): CommutesContextValue {
  const context = useContext(CommutesContext);
  if (!context) {
    throw new Error("useCommutes must be used within a CommutesProvider");
  }
  return context;
}

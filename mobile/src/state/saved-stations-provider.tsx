import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { Alert } from "react-native";

import {
  deleteSavedStation as apiDeleteSavedStation,
  fetchSavedStations,
  saveStation as apiSaveStation,
} from "@/api/saved-stations";
import type { SavedStation } from "@/api/saved-stations-schema";
import { useAuth } from "@/state/auth-provider";

export type SavedStationsContextValue = {
  savedStations: SavedStation[];
  isSaved: (stationId: string, network: "ttc" | "regional") => boolean;
  toggleSaved: (stationId: string, network: "ttc" | "regional") => Promise<boolean>;
  loading: boolean;
  refetch: () => Promise<void>;
};

const SavedStationsContext = createContext<SavedStationsContextValue | null>(null);

export function SavedStationsProvider({ children }: PropsWithChildren) {
  const { user, sessionToken, status } = useAuth();
  const [savedStations, setSavedStations] = useState<SavedStation[]>([]);
  const [loading, setLoading] = useState(false);

  const loadStations = useCallback(async () => {
    if (!sessionToken || status !== "authenticated") {
      setSavedStations([]);
      return;
    }
    setLoading(true);
    try {
      const response = await fetchSavedStations(sessionToken);
      setSavedStations(response.stations);
    } catch {
      // ignore network errors
    } finally {
      setLoading(false);
    }
  }, [sessionToken, status]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      if (!sessionToken || status !== "authenticated") {
        setSavedStations([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetchSavedStations(sessionToken);
        if (active) {
          setSavedStations(res.stations);
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

  const isSaved = useCallback(
    (stationId: string, network: "ttc" | "regional") => {
      return savedStations.some(
        (s) => s.station.id === stationId && s.networkId === network,
      );
    },
    [savedStations],
  );

  const toggleSaved = useCallback(
    async (stationId: string, network: "ttc" | "regional"): Promise<boolean> => {
      if (status !== "authenticated" || !sessionToken) {
        Alert.alert(
          "Sign In Required",
          "Sign in or try a demo account in the More tab to save stations to your watchlist.",
        );
        return false;
      }

      const currentlySaved = isSaved(stationId, network);
      if (currentlySaved) {
        // Optimistic delete
        setSavedStations((prev) =>
          prev.filter((s) => !(s.station.id === stationId && s.networkId === network)),
        );
        try {
          await apiDeleteSavedStation(sessionToken, stationId, network);
          return false;
        } catch (err) {
          // Rollback
          void loadStations();
          throw err;
        }
      } else {
        try {
          const saved = await apiSaveStation(sessionToken, stationId, network);
          setSavedStations((prev) => [...prev, saved]);
          return true;
        } catch (err) {
          void loadStations();
          throw err;
        }
      }
    },
    [status, sessionToken, isSaved, loadStations],
  );

  const value = useMemo<SavedStationsContextValue>(
    () => ({
      savedStations,
      isSaved,
      toggleSaved,
      loading,
      refetch: loadStations,
    }),
    [savedStations, isSaved, toggleSaved, loading, loadStations],
  );

  return (
    <SavedStationsContext.Provider value={value}>
      {children}
    </SavedStationsContext.Provider>
  );
}

export function useSavedStations(): SavedStationsContextValue {
  const context = useContext(SavedStationsContext);
  if (!context) {
    throw new Error("useSavedStations must be used within a SavedStationsProvider");
  }
  return context;
}

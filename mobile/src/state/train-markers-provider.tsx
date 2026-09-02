import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

const STORAGE_KEY = "linewatch.estimated-trains-enabled";

type TrainMarkersContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
};

const TrainMarkersContext = createContext<TrainMarkersContextValue | null>(null);

export function TrainMarkersProvider({ children }: PropsWithChildren) {
  const [enabled, setEnabledState] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === "true") {
        setEnabledState(true);
      }
    });
  }, []);

  const setEnabled = useCallback((nextEnabled: boolean) => {
    setEnabledState(nextEnabled);
    void AsyncStorage.setItem(STORAGE_KEY, nextEnabled ? "true" : "false");
  }, []);

  const toggleEnabled = useCallback(() => {
    setEnabledState((prev) => {
      const next = !prev;
      void AsyncStorage.setItem(STORAGE_KEY, next ? "true" : "false");
      return next;
    });
  }, []);

  const value = useMemo<TrainMarkersContextValue>(
    () => ({
      enabled,
      setEnabled,
      toggleEnabled,
    }),
    [enabled, setEnabled, toggleEnabled],
  );

  return (
    <TrainMarkersContext.Provider value={value}>
      {children}
    </TrainMarkersContext.Provider>
  );
}

const defaultTrainMarkersContextValue: TrainMarkersContextValue = {
  enabled: false,
  setEnabled: () => undefined,
  toggleEnabled: () => undefined,
};

export function useTrainMarkersPreference() {
  const context = useContext(TrainMarkersContext);
  return context ?? defaultTrainMarkersContextValue;
}

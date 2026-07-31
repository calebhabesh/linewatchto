"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  ARRIVAL_PINS_CHANGED_EVENT,
  ARRIVAL_PINS_STORAGE_KEY,
  pinnedLineIdsForStation,
  readArrivalLinePins,
  toggleArrivalLinePin,
} from "../app/arrival-pins";
import type { NetworkId } from "../app/regional-data";

function currentSerializedPins() {
  try {
    return window.localStorage.getItem(ARRIVAL_PINS_STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function subscribeToArrivalPins(onStoreChange: () => void) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === ARRIVAL_PINS_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(ARRIVAL_PINS_CHANGED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(ARRIVAL_PINS_CHANGED_EVENT, onStoreChange);
  };
}

export function useArrivalLinePins(networkId: NetworkId, stationId: string | null) {
  const serializedPins = useSyncExternalStore(
    subscribeToArrivalPins,
    currentSerializedPins,
    () => "[]",
  );
  const pinnedLineIds = useMemo(() => {
    if (!stationId) return [];
    const pins = readArrivalLinePins({
      getItem: (key) => key === ARRIVAL_PINS_STORAGE_KEY ? serializedPins : null,
    });
    return pinnedLineIdsForStation(pins, networkId, stationId);
  }, [networkId, serializedPins, stationId]);

  const togglePin = useCallback((lineId: string) => {
    if (!stationId) return;
    try {
      toggleArrivalLinePin(window.localStorage, { networkId, stationId, lineId });
      window.dispatchEvent(new Event(ARRIVAL_PINS_CHANGED_EVENT));
    } catch {
      // Browser privacy settings can reject localStorage writes; keep the arrivals board usable.
    }
  }, [networkId, stationId]);

  return { pinnedLineIds, togglePin };
}

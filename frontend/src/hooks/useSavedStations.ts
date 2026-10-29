"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from "react";
import type { AccountState } from "../app/auth-data";
import type { NetworkId } from "../app/dashboard-contract";
import {
  getSavedStations,
  removeSavedStation,
  saveStation,
  type AccountSavedStation,
} from "../app/saved-station-data";
import type { StationSummary } from "../app/station-data";
import { warmSavedStationCaches } from "../app/station-request-lifecycle";
import type { AccountEntryIntent } from "../components/AccountDialog";
import type { ActiveView } from "../components/LineWatchShell";

type SavedStationNotice = {
  message: string;
  linksToMyStations?: boolean;
};

// Under the 60s recent-result reuse window, so warmed saved-station results never expire before use.
const SAVED_STATION_WARM_INTERVAL_MS = 45_000;

/**
 * The signed-in rider's saved stations: loading, warming their details, saving
 * and removing with optimistic updates, and the brief confirmation toast.
 */
export function useSavedStations({
  selectedNetwork,
  accountState,
  userGeneration,
  userGenerationRef,
  activeViewRef,
  openAuthChoice,
  stationCatalogs,
}: {
  selectedNetwork: NetworkId;
  accountState: AccountState;
  userGeneration: number;
  userGenerationRef: MutableRefObject<number>;
  activeViewRef: RefObject<ActiveView>;
  openAuthChoice: (intent: AccountEntryIntent) => void;
  stationCatalogs: Record<NetworkId, StationSummary[]>;
}) {
  const [savedStations, setSavedStations] = useState<AccountSavedStation[]>([]);
  const [savedStationsLoading, setSavedStationsLoading] = useState(false);
  const [savedStationsError, setSavedStationsError] = useState<string | null>(null);
  const [pendingSavedStationIds, setPendingSavedStationIds] = useState<Set<string>>(() => new Set());
  const [savedStationNotice, setSavedStationNotice] = useState<SavedStationNotice | null>(null);
  const [savedStationNoticeKey, setSavedStationNoticeKey] = useState(0);
  const savedStationNoticeTimerRef = useRef<number | null>(null);

  const refreshSavedStations = useCallback(async () => {
    const currentGeneration = userGeneration;
    if (!accountState.authenticated) {
      setSavedStations([]);
      setSavedStationsError(null);
      setSavedStationsLoading(false);
      return;
    }

    setSavedStationsLoading(true);
    const result = await getSavedStations();
    if (userGenerationRef.current !== currentGeneration) {
      return;
    }
    if (result.source === "backend") {
      setSavedStations(result.stations);
      setSavedStationsError(null);
    } else {
      setSavedStationsError(result.message ?? "Saved stations are unavailable.");
    }
    setSavedStationsLoading(false);
  }, [accountState.authenticated, userGeneration, userGenerationRef]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSavedStations();
  }, [accountState.user?.id, refreshSavedStations]);

  const savedStationWarmKey = useMemo(
    () => savedStations.map((saved) => `${saved.networkId}:${saved.station.id}`).sort().join(","),
    [savedStations],
  );

  // Keep saved-station details warm in the shared recent-result caches so My Stations and
  // saved station panels open without a fetch wait. The open My Stations panel refreshes itself.
  useEffect(() => {
    if (!accountState.authenticated || !savedStationWarmKey) return;
    const stations = savedStationWarmKey.split(",").map((entry) => {
      const [networkId, stationId] = entry.split(":") as [NetworkId, string];
      return { networkId, stationId };
    });
    let controller: AbortController | null = null;
    const warm = () => {
      if (document.visibilityState !== "visible" || activeViewRef.current === "my-stations") return;
      controller?.abort();
      controller = new AbortController();
      void warmSavedStationCaches(stations, { signal: controller.signal }).catch(() => undefined);
    };

    warm();
    const interval = window.setInterval(warm, SAVED_STATION_WARM_INTERVAL_MS);
    document.addEventListener("visibilitychange", warm);
    return () => {
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", warm);
    };
  }, [accountState.authenticated, savedStationWarmKey, activeViewRef]);

  useEffect(() => () => {
    if (savedStationNoticeTimerRef.current !== null) {
      window.clearTimeout(savedStationNoticeTimerRef.current);
    }
  }, []);

  const showSavedStationNotice = useCallback((message: string, linksToMyStations = false) => {
    if (savedStationNoticeTimerRef.current !== null) {
      window.clearTimeout(savedStationNoticeTimerRef.current);
    }
    setSavedStationNotice({ message, linksToMyStations });
    setSavedStationNoticeKey((current) => current + 1);
    savedStationNoticeTimerRef.current = window.setTimeout(() => {
      setSavedStationNotice(null);
      savedStationNoticeTimerRef.current = null;
    }, 3200);
  }, []);

  const clearSavedStationNotice = useCallback(() => {
    if (savedStationNoticeTimerRef.current !== null) {
      window.clearTimeout(savedStationNoticeTimerRef.current);
      savedStationNoticeTimerRef.current = null;
    }
    setSavedStationNotice(null);
  }, []);

  // Sign-out clears the rider's saved stations.
  const resetSavedStations = useCallback(() => {
    setSavedStations([]);
    setPendingSavedStationIds(new Set());
    setSavedStationsError(null);
  }, []);

  const setSavedStationPending = useCallback((stationId: string, pending: boolean) => {
    setPendingSavedStationIds((current) => {
      const next = new Set(current);
      if (pending) next.add(stationId);
      else next.delete(stationId);
      return next;
    });
  }, []);

  const handleSaveStation = useCallback(async (stationId: string, networkId: NetworkId = selectedNetwork) => {
    if (accountState.source === "unavailable") {
      showSavedStationNotice("Account connection interrupted. Retrying automatically");
      return false;
    }
    if (!accountState.authenticated) {
      openAuthChoice("register");
      return false;
    }
    if (savedStations.some((saved) => saved.networkId === networkId && saved.station.id === stationId)) return true;
    const station = stationCatalogs[networkId].find((candidate) => candidate.id === stationId);
    if (!station || pendingSavedStationIds.has(stationId)) return false;

    const optimistic: AccountSavedStation = {
      networkId,
      station,
      savedAt: new Date().toISOString(),
    };
    setSavedStationPending(stationId, true);
    setSavedStations((current) => [
      optimistic,
      ...current.filter((saved) => saved.networkId !== networkId || saved.station.id !== stationId),
    ]);
    try {
      const saved = await saveStation(stationId, networkId);
      setSavedStations((current) => [
        saved,
        ...current.filter((item) => item.networkId !== networkId || item.station.id !== stationId),
      ]);
      showSavedStationNotice(`${station.name} added to`, true);
      return true;
    } catch (error) {
      setSavedStations((current) => current.filter(
        (saved) => saved.networkId !== networkId || saved.station.id !== stationId,
      ));
      showSavedStationNotice(error instanceof Error ? error.message : "Could not save station");
      return false;
    } finally {
      setSavedStationPending(stationId, false);
    }
  }, [accountState.authenticated, accountState.source, openAuthChoice, pendingSavedStationIds, savedStations, selectedNetwork, setSavedStationPending, showSavedStationNotice, stationCatalogs]);

  const handleRemoveSavedStation = useCallback(async (stationId: string, networkId: NetworkId = selectedNetwork) => {
    if (accountState.source === "unavailable") {
      showSavedStationNotice("Account connection interrupted. Retrying automatically");
      return false;
    }
    if (!accountState.authenticated || pendingSavedStationIds.has(stationId)) return false;
    const previous = savedStations.find(
      (saved) => saved.networkId === networkId && saved.station.id === stationId,
    );
    if (!previous) return true;

    setSavedStationPending(stationId, true);
    setSavedStations((current) => current.filter(
      (saved) => saved.networkId !== networkId || saved.station.id !== stationId,
    ));
    try {
      await removeSavedStation(stationId, networkId);
      showSavedStationNotice(`${previous.station.name} removed from My Stations`);
      return true;
    } catch (error) {
      setSavedStations((current) => [
        previous,
        ...current.filter((saved) => saved.networkId !== networkId || saved.station.id !== stationId),
      ]);
      showSavedStationNotice(error instanceof Error ? error.message : "Could not remove station");
      return false;
    } finally {
      setSavedStationPending(stationId, false);
    }
  }, [accountState.authenticated, accountState.source, pendingSavedStationIds, savedStations, selectedNetwork, setSavedStationPending, showSavedStationNotice]);

  const handleToggleSavedStation = useCallback((stationId: string, networkId: NetworkId = selectedNetwork) => {
    if (savedStations.some((saved) => saved.networkId === networkId && saved.station.id === stationId)) {
      void handleRemoveSavedStation(stationId, networkId);
    } else {
      void handleSaveStation(stationId, networkId);
    }
  }, [handleRemoveSavedStation, handleSaveStation, savedStations, selectedNetwork]);

  return {
    savedStations,
    savedStationsLoading,
    savedStationsError,
    pendingSavedStationIds,
    savedStationNotice,
    savedStationNoticeKey,
    refreshSavedStations,
    clearSavedStationNotice,
    resetSavedStations,
    handleSaveStation,
    handleRemoveSavedStation,
    handleToggleSavedStation,
  };
}

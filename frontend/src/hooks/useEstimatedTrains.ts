"use client";

import { useEffect, useRef, useState } from "react";
import type { NetworkId } from "../app/dashboard-contract";
import {
  EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
  EMPTY_REGIONAL_TRAIN_SNAPSHOT,
  createEstimatedTrainMarkerContinuityState,
  estimatedTrainMarkerRefreshMs,
  getEstimatedTrainMarkers,
  reconcileEstimatedTrainSnapshot,
  type EstimatedTrainSnapshot,
} from "../app/train-markers";

type EstimatedTrainRequestState = "idle" | "loading" | "ready" | "reconnecting";

/**
 * Polls estimated train markers for the selected network while they are
 * enabled, the network is running, and live (not saved) data is showing, and
 * describes their state for the train-marker control.
 */
export function useEstimatedTrains({
  selectedNetwork,
  estimatedTrainsEnabled,
  trainNetworkOpen,
  viewingSnapshot,
}: {
  selectedNetwork: NetworkId;
  estimatedTrainsEnabled: boolean;
  trainNetworkOpen: boolean;
  viewingSnapshot: boolean;
}) {
  const [estimatedTrainSnapshot, setEstimatedTrainSnapshot] = useState<EstimatedTrainSnapshot>(EMPTY_ESTIMATED_TRAIN_SNAPSHOT);
  const [estimatedTrainRequestState, setEstimatedTrainRequestState] = useState<EstimatedTrainRequestState>("idle");
  const estimatedTrainConnectedRef = useRef({ ttc: false, regional: false });
  const trainMarkerContinuityRef = useRef({
    ttc: createEstimatedTrainMarkerContinuityState(),
    regional: createEstimatedTrainMarkerContinuityState(),
  });
  const estimatedTrainMarkersVisible = estimatedTrainsEnabled && trainNetworkOpen && !viewingSnapshot;

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;
    let trainMarkerRefreshInFlight = false;

    const refresh = async () => {
      if (!estimatedTrainMarkersVisible || document.visibilityState !== "visible") {
        return;
      }
      if (trainMarkerRefreshInFlight) {
        return;
      }
      trainMarkerRefreshInFlight = true;
      try {
        const result = await getEstimatedTrainMarkers({ network: selectedNetwork });
        if (!cancelled) {
          const reconciled = reconcileEstimatedTrainSnapshot(
            trainMarkerContinuityRef.current[selectedNetwork],
            result.data,
            selectedNetwork,
          );
          setEstimatedTrainSnapshot(reconciled);
          if (result.source === "backend") {
            estimatedTrainConnectedRef.current[selectedNetwork] = true;
            setEstimatedTrainRequestState("ready");
          } else {
            setEstimatedTrainRequestState(estimatedTrainConnectedRef.current[selectedNetwork]
              ? "reconnecting"
              : "loading");
          }
        }
      } finally {
        trainMarkerRefreshInFlight = false;
      }
    };

    if (estimatedTrainMarkersVisible) {
      setEstimatedTrainRequestState(estimatedTrainConnectedRef.current[selectedNetwork]
        ? "reconnecting"
        : "loading");
      setEstimatedTrainSnapshot(selectedNetwork === "regional"
        ? EMPTY_REGIONAL_TRAIN_SNAPSHOT
        : EMPTY_ESTIMATED_TRAIN_SNAPSHOT);
      refresh();
      intervalId = window.setInterval(
        refresh,
        estimatedTrainMarkerRefreshMs(selectedNetwork),
      );
      const refreshAfterResume = () => {
        if (document.visibilityState === "visible") void refresh();
      };
      document.addEventListener("visibilitychange", refreshAfterResume);
      window.addEventListener("online", refreshAfterResume);

      return () => {
        cancelled = true;
        if (intervalId !== null) {
          window.clearInterval(intervalId);
        }
        document.removeEventListener("visibilitychange", refreshAfterResume);
        window.removeEventListener("online", refreshAfterResume);
      };
    } else {
      trainMarkerContinuityRef.current[selectedNetwork] = createEstimatedTrainMarkerContinuityState();
      setEstimatedTrainSnapshot(selectedNetwork === "regional"
        ? EMPTY_REGIONAL_TRAIN_SNAPSHOT
        : EMPTY_ESTIMATED_TRAIN_SNAPSHOT);
      setEstimatedTrainRequestState("idle");
    }

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [estimatedTrainMarkersVisible, selectedNetwork]);

  const estimatedTrainStatusLabel = !trainNetworkOpen
    ? "Closed"
    : estimatedTrainsEnabled
      ? estimatedTrainSnapshot.markers.length > 0
        ? estimatedTrainSnapshot.fresh
          ? `${estimatedTrainSnapshot.markers.length} shown`
          : `${estimatedTrainSnapshot.markers.length} held`
        : estimatedTrainRequestState === "reconnecting"
          ? "Reconnecting"
          : estimatedTrainRequestState === "loading"
            ? "Connecting"
            : estimatedTrainSnapshot.availability === "disabled"
              || estimatedTrainSnapshot.availability === "unavailable"
              ? "Unavailable"
              : "Waiting"
      : "Off";
  const estimatedTrainControlUnavailableReason = !trainNetworkOpen
    ? "Estimated train markers are unavailable while rail service is closed"
    : viewingSnapshot
      ? "Estimated train markers are unavailable while viewing saved data"
      : null;

  const estimatedTrainDisplayPending = estimatedTrainMarkersVisible
    && estimatedTrainSnapshot.markers.length === 0
    && (estimatedTrainRequestState === "loading"
      || estimatedTrainRequestState === "reconnecting"
      || (estimatedTrainSnapshot.availability !== "disabled"
        && estimatedTrainSnapshot.availability !== "unavailable"));
  const estimatedTrainPendingLabel = estimatedTrainRequestState === "reconnecting"
    ? "Estimated train markers reconnecting"
    : "Waiting for estimated train markers";

  return {
    estimatedTrainSnapshot,
    estimatedTrainMarkersVisible,
    estimatedTrainStatusLabel,
    estimatedTrainControlUnavailableReason,
    estimatedTrainDisplayPending,
    estimatedTrainPendingLabel,
  };
}

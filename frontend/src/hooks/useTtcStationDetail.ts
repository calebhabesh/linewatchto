"use client";

import { useEffect, useState } from "react";
import type { NetworkId } from "../app/dashboard-contract";
import {
  getStationDetail,
  preserveStationDetailOnRefresh,
  type StationDataResult,
  type StationDetail,
} from "../app/station-data";
import {
  recentTtcStationDetails,
  rememberTtcStationDetail,
  ttcStationDetailKey,
} from "../app/station-request-lifecycle";

const STATION_DETAIL_REFRESH_MS = 15_000;

/** Loads and keeps refreshing the selected TTC station's detail while it is open. */
export function useTtcStationDetail(selectedNetwork: NetworkId, selectedStationId: string | null) {
  const [visibleStationResult, setVisibleStationResult] = useState<StationDataResult<StationDetail | null> | null>(null);
  const [stationLoading, setStationLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let requestId = 0;
    let controller: AbortController | null = null;

    if (!selectedStationId || selectedNetwork !== "ttc") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisibleStationResult(null);
      setStationLoading(false);
      return () => {
        cancelled = true;
        controller?.abort();
      };
    }

    const fetchStationDetail = (showLoading: boolean) => {
      controller?.abort();
      controller = new AbortController();
      const activeRequestId = ++requestId;
      if (showLoading) {
        setStationLoading(true);
      }
      getStationDetail(selectedStationId, { signal: controller.signal })
        .then((result) => {
          rememberTtcStationDetail(ttcStationDetailKey(selectedStationId), result);
          if (!cancelled && activeRequestId === requestId) {
            setVisibleStationResult((current) => preserveStationDetailOnRefresh(current, result));
          }
        })
        .catch((error) => {
          if (
            (error instanceof DOMException && error.name === "AbortError")
            || (typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError")
          ) {
            return;
          }
        })
        .finally(() => {
          if (!cancelled && activeRequestId === requestId) {
            setStationLoading(false);
          }
        });
    };

    // A recent result from My Stations or the saved-station warm-up paints first; the fetch still refreshes it.
    const recent = recentTtcStationDetails.get(ttcStationDetailKey(selectedStationId));
    if (recent) {
      setVisibleStationResult(recent);
    }
    fetchStationDetail(!recent);

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      fetchStationDetail(false);
    }, STATION_DETAIL_REFRESH_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchStationDetail(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [selectedNetwork, selectedStationId]);

  return { visibleStationResult, setVisibleStationResult, stationLoading };
}

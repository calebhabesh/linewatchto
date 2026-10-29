"use client";

import { useCallback, useEffect, useState } from "react";
import type { NetworkId } from "../app/dashboard-contract";
import {
  type AccessibilityOutageResponse,
  getAccessibilityOutages,
} from "../app/accessibility-outage-data";
import { getTtcAnnouncements } from "../app/announcement-data";
import { getRegionalTripChanges } from "../app/regional-trip-changes";
import {
  fallbackStationSummaries,
  getStationSummaries,
  type StationSummary,
} from "../app/station-data";
import { getSurfaceNotices, type SurfaceNoticeResponse } from "../app/surface-notice-data";
import { dashboardRefreshIntervalMs } from "./useDashboardSession";

type OperatingStatus = "open" | "closed" | "unknown";

/**
 * Per-network service feeds beside the dashboard: accessibility outages, surface
 * notices, GO trip-change and TTC announcement counts, and the TTC station list.
 * They refresh on the dashboard cadence and pause while a closed network's
 * closed screen is showing.
 */
export function useNetworkServiceFeeds({
  selectedNetwork,
  closedMapPeek,
  subwayStatus,
  regionalStatus,
}: {
  selectedNetwork: NetworkId;
  closedMapPeek: boolean;
  subwayStatus: OperatingStatus;
  regionalStatus: OperatingStatus;
}) {
  const [ttcStationSummaries, setTtcStationSummaries] = useState<StationSummary[]>(fallbackStationSummaries.stations);
  const [accessibilityOutageState, setAccessibilityOutageState] = useState<{
    networkId: NetworkId;
    data: AccessibilityOutageResponse;
  } | null>(null);
  const [currentServiceNotices, setCurrentServiceNotices] = useState<{ networkId: NetworkId; data: SurfaceNoticeResponse } | null>(null);
  const [surfaceNoticeCount, setSurfaceNoticeCount] = useState<number | null>(null);
  const [regionalTripChangeCount, setRegionalTripChangeCount] = useState<number | null>(null);
  const [announcementCount, setAnnouncementCount] = useState<number | null>(null);

  const fetchAccessibilityOutages = useCallback(async () => {
    const networkId = selectedNetwork;
    try {
      const res = await getAccessibilityOutages(undefined, { networkId });
      setAccessibilityOutageState({ networkId, data: res.data });
    } catch (err) {
      console.error("Failed to fetch accessibility outages:", err);
    }
  }, [selectedNetwork]);

  const fetchSurfaceNoticesCount = useCallback(async () => {
    try {
      const res = await getSurfaceNotices({ networkId: selectedNetwork });
      setCurrentServiceNotices({ networkId: selectedNetwork, data: res.data });
      if (res.source === "backend" && res.data.fresh) {
        setSurfaceNoticeCount(res.data.categories.reduce((total, category) => total + category.count, 0));
      } else {
        setSurfaceNoticeCount(null);
      }
    } catch (err) {
      console.error("Failed to fetch surface notices count:", err);
    }
  }, [selectedNetwork]);

  const fetchRegionalTripChangeCount = useCallback(async () => {
    if (selectedNetwork !== "regional") {
      setRegionalTripChangeCount(null);
      return;
    }
    try {
      const res = await getRegionalTripChanges({ limit: 0 });
      setRegionalTripChangeCount(res.source === "backend" && res.data.fresh ? res.data.totalCount : null);
    } catch (err) {
      console.error("Failed to fetch regional trip change count:", err);
      setRegionalTripChangeCount(null);
    }
  }, [selectedNetwork]);

  const fetchAnnouncementCount = useCallback(async () => {
    if (selectedNetwork !== "ttc") {
      setAnnouncementCount(null);
      return;
    }
    try {
      const res = await getTtcAnnouncements({ limit: 0 });
      if (res.source === "backend" && res.data.fresh) {
        setAnnouncementCount(res.data.announcements.length);
      } else {
        setAnnouncementCount(null);
      }
    } catch (err) {
      console.error("Failed to fetch TTC announcements count:", err);
    }
  }, [selectedNetwork]);

  useEffect(() => {
    if (selectedNetwork === "ttc" && subwayStatus === "closed" && !closedMapPeek) {
      return;
    }
    if (selectedNetwork === "regional" && regionalStatus === "closed" && !closedMapPeek) {
      return;
    }

    const refreshDashboardData = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      fetchAccessibilityOutages();
      fetchSurfaceNoticesCount();
      fetchRegionalTripChangeCount();
      fetchAnnouncementCount();
    };

    const interval = window.setInterval(refreshDashboardData, dashboardRefreshIntervalMs());
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchAccessibilityOutages();
        fetchSurfaceNoticesCount();
        fetchRegionalTripChangeCount();
        fetchAnnouncementCount();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [closedMapPeek, selectedNetwork, subwayStatus, regionalStatus, fetchAccessibilityOutages, fetchSurfaceNoticesCount, fetchRegionalTripChangeCount, fetchAnnouncementCount]);


  useEffect(() => {
    let cancelled = false;

    if (selectedNetwork === "regional") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAccessibilityOutageState(null);
      setSurfaceNoticeCount(null);
      setRegionalTripChangeCount(null);
      setAnnouncementCount(null);
      const timer = window.setTimeout(() => {
        if (!cancelled) {
          fetchAccessibilityOutages();
          fetchSurfaceNoticesCount();
          fetchRegionalTripChangeCount();
        }
      }, 300);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      getStationSummaries().then((result) => {
        if (!cancelled) {
          setTtcStationSummaries(result.data.stations);
        }
      });

      fetchAccessibilityOutages();
      fetchSurfaceNoticesCount();
      fetchRegionalTripChangeCount();
      fetchAnnouncementCount();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedNetwork, fetchAccessibilityOutages, fetchSurfaceNoticesCount, fetchRegionalTripChangeCount, fetchAnnouncementCount]);

  return {
    ttcStationSummaries,
    accessibilityOutageState,
    currentServiceNotices,
    surfaceNoticeCount,
    regionalTripChangeCount,
    announcementCount,
  };
}

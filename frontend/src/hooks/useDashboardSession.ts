import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DashboardData } from "../app/dashboard-contract.ts";
import { dashboardDataFromApi } from "../app/dashboard-adapter.ts";
import {
  getDashboardRefresh,
  retryDashboardRefresh,
  getReliabilitySnapshot,
} from "../app/dashboard-client.ts";
import {
  canSaveDashboard,
  DASHBOARD_VERIFICATION_MS,
  SNAPSHOT_RETENTION_MS,
  readDashboardSnapshot,
  saveDashboardSnapshot,
  snapshotDashboard,
  snapshotNotice,
} from "../app/dashboard-snapshot.ts";
import {
  type NetworkId,
  regionalDashboardData,
  regionalDashboardDataForScenario,
  regionalDashboardDataFromApi,
  type RegionalDashboardApiResponse,
  type RegionalScenarioId,
} from "../app/regional-data.ts";

export const DEFAULT_DASHBOARD_REFRESH_MS = 30_000;
export const MIN_DASHBOARD_REFRESH_MS = 10_000;

export function dashboardRefreshIntervalMs(): number {
  const configured = Number(process.env.NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_DASHBOARD_REFRESH_MS;
  }
  return Math.max(configured, MIN_DASHBOARD_REFRESH_MS);
}

export type DashboardRequestState = "ready" | "reconnecting";

const SUPPORTED_REGIONAL_SCENARIOS: readonly RegionalScenarioId[] = [
  "none",
  "all-impact-types",
  "shared-station",
  "stale-source",
];

export function getRequestedRegionalScenario(
  search?: string,
  hostname?: string,
): RegionalScenarioId | null {
  if (typeof window === "undefined" && !search) return null;
  const host = hostname ?? (typeof window !== "undefined" ? window.location.hostname : "");
  if (host !== "localhost" && host !== "127.0.0.1") return null;
  const query = search ?? (typeof window !== "undefined" ? window.location.search : "");
  const requested = new URLSearchParams(query).get("regionalScenario");
  return requested && (SUPPORTED_REGIONAL_SCENARIOS as readonly string[]).includes(requested)
    ? (requested as RegionalScenarioId)
    : null;
}

export function computeLastVerified(
  storedVerifiedAt: number | null,
  snapshotClock: number,
  retentionMs = SNAPSHOT_RETENTION_MS,
): number | null {
  return storedVerifiedAt !== null && snapshotClock - storedVerifiedAt <= retentionMs
    ? storedVerifiedAt
    : null;
}

export function computeSnapshotReason({
  connectionOffline,
  requestState,
  sessionVerified,
  storedVerifiedAt,
  snapshotClock,
  offlineShell = false,
  lastVerified,
}: {
  connectionOffline: boolean;
  requestState: DashboardRequestState;
  sessionVerified: boolean;
  storedVerifiedAt: number | null;
  snapshotClock: number;
  offlineShell?: boolean;
  lastVerified: number | null;
}): NonNullable<DashboardData["snapshot"]>["reason"] | null {
  if (connectionOffline) return "offline";
  if (requestState === "reconnecting") return "reconnecting";
  if (!sessionVerified) return "refreshing";
  if (storedVerifiedAt !== null && snapshotClock - storedVerifiedAt >= DASHBOARD_VERIFICATION_MS) {
    return "stale";
  }
  if (offlineShell && lastVerified === null) return "reconnecting";
  return null;
}

export function computeDashboardAvailabilityNotice(
  displayData: DashboardData,
  requestState: DashboardRequestState,
  snapshotClock: number,
): string | null {
  if (displayData.snapshot) {
    return snapshotNotice(displayData.snapshot, snapshotClock);
  }
  if (requestState === "reconnecting") {
    return "Connection Issue — Showing latest dashboard snapshot while LineWatchTO reconnects.";
  }
  if (displayData.availability === "degraded") {
    return "Source Refresh Issue — Showing the last successful fresh update.";
  }
  if (displayData.availability === "unavailable") {
    return "Live service data is unavailable — Showing the fallback dashboard.";
  }
  return null;
}

export function computeEffectiveDashboards({
  ttcData,
  regionalData,
  verifiedAt,
  dashboardRequestStates,
  connectionOffline,
}: {
  ttcData: DashboardData;
  regionalData: DashboardData;
  verifiedAt: Record<NetworkId, number | null>;
  dashboardRequestStates: Record<NetworkId, DashboardRequestState>;
  connectionOffline: boolean;
}): Record<NetworkId, DashboardData> {
  return {
    ttc: connectionOffline || dashboardRequestStates.ttc === "reconnecting"
      ? snapshotDashboard(ttcData, verifiedAt.ttc, connectionOffline ? "offline" : "reconnecting")
      : ttcData,
    regional: connectionOffline || dashboardRequestStates.regional === "reconnecting"
      ? snapshotDashboard(regionalData, verifiedAt.regional, connectionOffline ? "offline" : "reconnecting")
      : regionalData,
  };
}

export type RestoredDashboardSnapshots = {
  verifiedAt: Record<NetworkId, number | null>;
  ttcData?: DashboardData;
  regionalData?: DashboardData;
};

export function restoreDashboardSnapshots({
  storage,
  initialData,
  offlineShell = false,
  isOnline = true,
  regionalScenarioActive = false,
  now = Date.now(),
}: {
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  initialData: DashboardData;
  offlineShell?: boolean;
  isOnline?: boolean;
  regionalScenarioActive?: boolean;
  now?: number;
}): RestoredDashboardSnapshots {
  const restored: Record<NetworkId, number | null> = { ttc: null, regional: null };
  let restoredTtc: DashboardData | undefined;
  let restoredRegional: DashboardData | undefined;

  for (const network of ["ttc", "regional"] as const) {
    let saved = null;
    if (storage) {
      try {
        saved = readDashboardSnapshot(storage, network, now);
      } catch {
        /* Storage denied. */
      }
    }

    if (network === "ttc" && canSaveDashboard(initialData) && !offlineShell && isOnline) {
      if (storage) {
        try {
          saveDashboardSnapshot(storage, initialData, now);
        } catch {
          /* Storage denied. */
        }
      }
      restored.ttc = now;
      restoredTtc = initialData;
    } else if (saved && !(network === "regional" && regionalScenarioActive)) {
      restored[network] = saved.savedAt;
      if (network === "ttc") {
        restoredTtc = saved.data;
      } else {
        restoredRegional = saved.data;
      }
    }
  }

  return {
    verifiedAt: restored,
    ttcData: restoredTtc,
    regionalData: restoredRegional,
  };
}

export type UseDashboardSessionOptions = {
  initialData: DashboardData;
  selectedNetwork: NetworkId;
  offlineShell?: boolean;
  regionalScenario?: RegionalScenarioId | null;
};

export type DashboardSession = {
  displayData: DashboardData;
  rawDisplayData: DashboardData;
  ttcData: DashboardData;
  regionalData: DashboardData;
  dashboards: Record<NetworkId, DashboardData>;
  dashboardRequestState: DashboardRequestState;
  dashboardRequestStates: Record<NetworkId, DashboardRequestState>;
  dashboardAvailabilityNotice: string | null;
  snapshotClock: number;
  connectionOffline: boolean;
  verifiedAt: Record<NetworkId, number | null>;
  lastVerified: number | null;
  snapshotReason: NonNullable<DashboardData["snapshot"]>["reason"] | null;
  sessionVerified: Record<NetworkId, boolean>;
  fetchDashboard: (networkId: NetworkId) => Promise<void>;
};

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function useDashboardSession({
  initialData,
  selectedNetwork,
  offlineShell = false,
  regionalScenario,
}: UseDashboardSessionOptions): DashboardSession {
  const [ttcData, setTtcData] = useState(initialData);
  const [regionalData, setRegionalData] = useState(regionalDashboardData);
  const [dashboardRequestStates, setDashboardRequestStates] = useState<Record<NetworkId, DashboardRequestState>>({
    ttc: "ready",
    regional: "ready",
  });
  const [sessionVerified, setSessionVerified] = useState<Record<NetworkId, boolean>>({
    ttc: false,
    regional: false,
  });
  const sessionVerifiedRef = useRef(sessionVerified);
  useEffect(() => {
    sessionVerifiedRef.current = sessionVerified;
  }, [sessionVerified]);

  const dashboardRefreshInFlightRef = useRef<Record<NetworkId, boolean>>({ ttc: false, regional: false });
  const regionalScenarioActiveRef = useRef(Boolean(regionalScenario && regionalScenario !== "none"));
  const [connectionOffline, setConnectionOffline] = useState(offlineShell);
  const [snapshotClock, setSnapshotClock] = useState(() => Date.now());
  const [verifiedAt, setVerifiedAt] = useState<Record<NetworkId, number | null>>({ ttc: null, regional: null });
  const verifiedAtRef = useRef(verifiedAt);

  // Connectivity tracking and snapshot clock tick.
  useEffect(() => {
    const tick = () => setSnapshotClock(Date.now());
    const online = () => {
      setConnectionOffline(false);
      tick();
    };
    const offline = () => {
      setConnectionOffline(true);
      tick();
    };

    if (!navigator.onLine) offline();
    else online();

    const interval = window.setInterval(tick, 15_000);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  // Regional scenario initialization.
  useEffect(() => {
    const scenario = regionalScenario !== undefined
      ? regionalScenario
      : getRequestedRegionalScenario();

    if (scenario) {
      regionalScenarioActiveRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRegionalData(regionalDashboardDataForScenario(scenario));
    }
  }, [regionalScenario]);

  // Snapshot restoration on startup or configuration changes.
  useIsomorphicLayoutEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      /* Storage denied. */
    }

    const { verifiedAt: restored, ttcData: restoredTtc, regionalData: restoredRegional } = restoreDashboardSnapshots({
      storage,
      initialData,
      offlineShell,
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
      regionalScenarioActive: regionalScenarioActiveRef.current,
      now: Date.now(),
    });

    if (restoredTtc) {
      setTtcData(restoredTtc);
    }
    if (restoredRegional) {
      setRegionalData(restoredRegional);
    }

    verifiedAtRef.current = restored;
    setVerifiedAt(restored);
  }, [initialData, offlineShell]);

  const fetchDashboard = useCallback(async (networkId: NetworkId) => {
    if (
      (typeof document !== "undefined" && document.visibilityState !== "visible")
      || dashboardRefreshInFlightRef.current[networkId]
      || (networkId === "regional" && regionalScenarioActiveRef.current)
    ) {
      return;
    }

    dashboardRefreshInFlightRef.current[networkId] = true;
    const isInitial = !sessionVerifiedRef.current[networkId];

    try {
      const { payload, reliability } = await retryDashboardRefresh(
        () => isInitial
          ? getDashboardRefresh(networkId, { deferReliability: true })
          : getDashboardRefresh(networkId),
        () => setDashboardRequestStates((current) => ({ ...current, [networkId]: "reconnecting" })),
      );

      // An in-flight response can finish after connectivity was lost. It must
      // not re-verify the view or recreate a snapshot cleared while offline.
      if (typeof navigator !== "undefined" && !navigator.onLine) return;

      const next = networkId === "regional"
        ? regionalDashboardDataFromApi(payload as RegionalDashboardApiResponse, reliability ?? undefined)
        : dashboardDataFromApi(payload, reliability ?? undefined);

      if (canSaveDashboard(next)) {
        const now = Date.now();
        try {
          if (typeof window !== "undefined") {
            saveDashboardSnapshot(window.localStorage, next, now);
          }
        } catch {
          /* Storage denied. */
        }

        verifiedAtRef.current = { ...verifiedAtRef.current, [networkId]: now };
        setVerifiedAt(verifiedAtRef.current);
        setSnapshotClock(now);
        setSessionVerified((current) => ({ ...current, [networkId]: true }));
        if (networkId === "regional") setRegionalData(next);
        else setTtcData(next);
        setDashboardRequestStates((current) => ({ ...current, [networkId]: "ready" }));

        if (isInitial) {
          void getReliabilitySnapshot(networkId).then((deferredReliability) => {
            if (!deferredReliability) return;
            const update = (current: DashboardData): DashboardData => ({
              ...current,
              reliability: deferredReliability,
            });
            if (networkId === "regional") setRegionalData(update);
            else setTtcData(update);
          });
        }
      } else if (verifiedAtRef.current[networkId] !== null) {
        // A valid unavailable response must not overwrite the last real observation.
        setDashboardRequestStates((current) => ({ ...current, [networkId]: "reconnecting" }));
      } else {
        setSessionVerified((current) => ({ ...current, [networkId]: true }));
        if (networkId === "regional") setRegionalData(next);
        else setTtcData(next);
        setDashboardRequestStates((current) => ({ ...current, [networkId]: "ready" }));
      }
    } catch {
      setDashboardRequestStates((current) => ({ ...current, [networkId]: "reconnecting" }));
    } finally {
      dashboardRefreshInFlightRef.current[networkId] = false;
    }
  }, []);

  // Single consolidated network polling effect.
  useEffect(() => {
    if (selectedNetwork === "regional" && regionalScenarioActiveRef.current) return;

    const refresh = () => {
      void fetchDashboard(selectedNetwork);
    };

    refresh();
    const interval = window.setInterval(refresh, dashboardRefreshIntervalMs());
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("online", refresh);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchDashboard, selectedNetwork]);

  const rawDisplayData = selectedNetwork === "regional" ? regionalData : ttcData;
  const storedVerifiedAt = verifiedAt[selectedNetwork];
  const lastVerified = computeLastVerified(storedVerifiedAt, snapshotClock);
  const snapshotReason = computeSnapshotReason({
    connectionOffline,
    requestState: dashboardRequestStates[selectedNetwork],
    sessionVerified: sessionVerified[selectedNetwork],
    storedVerifiedAt,
    snapshotClock,
    offlineShell,
    lastVerified,
  });

  const displayData = useMemo(() => snapshotReason
    ? snapshotDashboard(rawDisplayData, lastVerified, snapshotReason)
    : rawDisplayData, [rawDisplayData, lastVerified, snapshotReason]);

  const dashboardRequestState = dashboardRequestStates[selectedNetwork];

  const dashboardAvailabilityNotice = useMemo(() => computeDashboardAvailabilityNotice(
    displayData,
    dashboardRequestState,
    snapshotClock,
  ), [displayData, dashboardRequestState, snapshotClock]);

  const dashboards = useMemo(() => computeEffectiveDashboards({
    ttcData,
    regionalData,
    verifiedAt,
    dashboardRequestStates,
    connectionOffline,
  }), [ttcData, regionalData, verifiedAt, dashboardRequestStates, connectionOffline]);

  return {
    displayData,
    rawDisplayData,
    ttcData,
    regionalData,
    dashboards,
    dashboardRequestState,
    dashboardRequestStates,
    dashboardAvailabilityNotice,
    snapshotClock,
    connectionOffline,
    verifiedAt,
    lastVerified,
    snapshotReason,
    sessionVerified,
    fetchDashboard,
  };
}

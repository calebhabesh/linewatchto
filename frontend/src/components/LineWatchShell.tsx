"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { DynamicBackground } from "./DynamicBackground";
import { BACKGROUND_PREFERENCE_LABEL } from "../app/background-preference";
import { preloadRegionalMapMarkup } from "./InteractiveRegionalMap";
import { preloadTtcMapMarkup } from "./InteractiveTtcMap";
import { preloadRasterMapSource, rasterMapSource } from "./RasterMapPlane";
import { startMapSurfaceTransition } from "../app/map-surface-transition";
import { NetworkMap } from "./NetworkMap";
import { NetworkSelector } from "./NetworkSelector";
import { DefaultMapModeControl } from "./DefaultMapModeControl";
import { RegionalStationDetailPanel } from "./RegionalStationDetailPanel";
import { DelayIcon } from "./DelayIcon";
import { ActiveAlertsPanel } from "./ActiveAlertsPanel";
import { DelaysPanel } from "./DelaysPanel";
import { ReducedSpeedZonesPanel } from "./ReducedSpeedZonesPanel";
import { PlannedClosuresPanel } from "./PlannedClosuresPanel";
import { LineImpactsPanel } from "./LineImpactsPanel";
import {
  SavedCommutesPanel,
  persistedExpandedImpactDisclosures,
  persistedCommuteDraftStore,
  clearPersistedCommuteDraft,
  type AccountNetworkFilter,
  type SavedCommuteDraft,
} from "./SavedCommutesPanel";
import { MyStationsPanel } from "./MyStationsPanel";
import { NotificationSettingsPanel } from "./NotificationSettingsPanel";
import { ReliabilityPanel } from "./ReliabilityPanel";
import { AlertHistoryPanel } from "./AlertHistoryPanel";
import { FeedbackPanel } from "./FeedbackPanel";
import { PrivacyAcknowledgementsPanel } from "./PrivacyAcknowledgementsPanel";
import { ReleaseNotesNotice } from "./ReleaseNotesNotice";
import { ReleaseNotesPanel } from "./ReleaseNotesPanel";
import { FloatingPanelShell } from "./FloatingPanelShell";
import { MobileBottomNav, type MobileNavKey } from "./MobileBottomNav";
import { OverlappingCountBadge } from "./OverlappingCountBadge";
import { CurrentServicePanel } from "./CurrentServicePanel";
import { MobileStatusPeek, type MobileOperatingNotice, type MobileConnectionNotice } from "./MobileStatusPeek";
import { MobileMapControls, PhoneRotateLandscapeIcon, type MapPresentationMode } from "./MobileMapControls";
import { RotatedMapSelectionCard } from "./RotatedMapSelectionCard";
import { MobileImpactInspector, type MobileInspectorDetent } from "./MobileImpactInspector";
import { MobileStatusSheet } from "./MobileStatusSheet";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { DesktopNavRail } from "./DesktopNavRail";
import { DesktopStatusOverview } from "./DesktopStatusOverview";
import { DesktopMorePanel } from "./DesktopMorePanel";
import {
  computeDesktopLayoutMetrics,
  desktopRailDestinationForView,
  type DesktopRailDestination,
} from "../app/desktop-sidebar-state";
import { PwaInstallNudge } from "./PwaInstallNudge";
import { usePwaInstallPrompt } from "../hooks/usePwaInstallPrompt";
import { TransitLineBadge } from "./TransitLineBadge";
import { PanelHeader } from "./PanelHeader";
import { LogsDropdown, SourceDiagnosticsBody, SourceStatusRefreshButton } from "./LogsDropdown";
import { SiteGuideDropdown } from "./SiteGuideDropdown";
import { ScrollOverflowAffordances } from "./ScrollOverflowAffordances";
import { DataProvider, DashboardData } from "../app/DataContext";
import { dashboardDataFromApi } from "../app/dashboard-adapter";
import { getDashboardRefresh, retryDashboardRefresh } from "../app/dashboard-client";
import { canSaveDashboard, DASHBOARD_VERIFICATION_MS, SNAPSHOT_RETENTION_MS, readDashboardSnapshot, saveDashboardSnapshot, snapshotDashboard, snapshotNotice } from "../app/dashboard-snapshot";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import { countReducedSpeedZones } from "../app/reduced-speed-zone-count";
import { stationImpactSelectionsByStation } from "../app/station-impact-types";
import {
  type AccessibilityOutageResponse,
  getAccessibilityOutages,
} from "../app/accessibility-outage-data";
import { AccessibilityOutagesPanel, type AccessibilityOutageTarget } from "./AccessibilityOutagesPanel";
import { getSurfaceNotices, type SurfaceNoticeResponse, type SurfaceNoticeDetail } from "../app/surface-notice-data";
import { SurfaceNoticesPanel } from "./SurfaceNoticesPanel";
import { getRegionalTripChanges } from "../app/regional-trip-changes";
import { getTtcAnnouncements } from "../app/announcement-data";
import { TtcAnnouncementsPanel } from "./TtcAnnouncementsPanel";
import {
  fallbackStationSummaries,
  getStationDetail,
  getStationSummaries,
  preserveStationDetailOnRefresh,
  type StationDataResult,
  type StationDetail,
  type StationSummary,
} from "../app/station-data";
import { StationDetailPanel } from "./StationDetailPanel";
import {
  EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
  EMPTY_REGIONAL_TRAIN_SNAPSHOT,
  createEstimatedTrainMarkerContinuityState,
  estimatedTrainMarkerRefreshMs,
  getEstimatedTrainMarkers,
  reconcileEstimatedTrainSnapshot,
  type EstimatedTrainSnapshot,
} from "../app/train-markers";
import { useTorontoClock } from "../hooks/useTorontoClock";
import { MOBILE_VIEWPORT_QUERY, useMobilePerformanceMode } from "../hooks/useMobilePerformanceMode";
import { usePushNotificationSettings } from "../hooks/usePushNotificationSettings";
import { Accessibility, Activity, Menu, X, Map as MapIcon, Train, AlertTriangle, Bookmark, MapPin, Navigation, ShieldCheck, BarChart3, Bell, Construction, Search, LogIn, LogOut, UserPlus, UserRound, Sun, Moon, Bus, Mail, Contrast, Pause, History, MessageSquareText, FileText, HeartHandshake, Sparkles, Pin, PinOff, Megaphone, Loader2, BookOpen, ChevronRight, CircleCheck, Clock3 } from "lucide-react";
import { SubwayClosedScreen } from "./SubwayClosedScreen";
import { useSubwayOperatingState } from "../hooks/useSubwayOperatingState";
import { GoUpClosedScreen } from "./GoUpClosedScreen";
import { useRegionalRailOperatingState } from "../hooks/useRegionalRailOperatingState";
import { StationSearchPanel } from "./StationSearchPanel";
import { OpeningDisclaimer } from "./OpeningDisclaimer";
import { formatResumeDuration } from "../app/subway-hours";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import {
  MOBILE_SHEET_DEFAULT_RATIO,
  MOBILE_STATION_SHEET_RESIZE_EVENT,
  readStoredSheetHeightRatio,
} from "../hooks/useMobileDraggableSheet";
import {
  AccountRequestError,
  confirmEmailVerification,
  confirmPasswordReset,
  commutePathPreviewFromCommute,
  getAuthConfig,
  getCurrentAccountWithRetry,
  getSavedCommutes,
  loginAccount,
  loginDemoAccount,
  loginWithGoogle,
  linkGoogleAccount,
  logoutAccount,
  registerAccount,
  requestEmailVerification,
  requestPasswordReset,
  preserveAccountStateDuringOutage,
  summarizeSavedCommuteStatuses,
  unavailableAuthConfig,
  type AccountState,
  type AccountSavedCommute,
  type AccountCommutePathPreview,
  type AccountCommuteLegId,
  type AccountMatchedImpact,
  type AuthConfig,
  type SavedCommuteSort,
} from "../app/account-data";
import { AccountAvailabilityNotice } from "./AccountAvailabilityNotice";
import {
  getSavedStations,
  removeSavedStation,
  saveStation,
  type AccountSavedStation,
} from "../app/saved-station-data";
import { summarizeSavedStationStatuses } from "../app/saved-stations";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { accountOAuthErrorState } from "../app/account-oauth-error";
import { normalizeAccountEmail, validateAccountCredentials, validateAccountEmail } from "../app/account-validation";
import { getCurrentPushSubscription } from "../app/push-browser-state";
import { hasReleaseNotes } from "../app/release-notes";
import { lineWatchAppVersionLabel } from "../app/app-build";
import { clearServiceStatusLabel } from "../app/network-presentation";
import { resolveCommuteImpactMapSelection } from "./map-impact-normalization";
import {
  buildVisualPreferencesCookie,
  defaultVisualPreferences,
  readVisualPreferencesFromStorage,
  resolveReducedMotionPreference,
  writeVisualPreferencesToStorage,
  type InitialVisualPreferences,
} from "../app/visual-preferences";
import {
  regionalDashboardData,
  regionalDashboardDataFromApi,
  regionalDashboardDataForScenario,
  regionalStationSummaries,
  type NetworkId,
  type RegionalDashboardApiResponse,
  type RegionalScenarioId,
} from "../app/regional-data";
import { popViewHistory, pushViewHistory, resolveInAppBackAction } from "../app/view-navigation";


type ActiveView = "map" | "menu" | "search" | "status" | "line-impacts" | "alerts" | "delays" | "reduced-speed-zones" | "closures" | "commutes" | "notifications" | "analytics" | "more" | "my-stations" | "accessibility-outages" | "surface-notices" | "announcements" | "alert-history" | "feedback" | "privacy-acknowledgements" | "release-notes" | "source-status";
type ImpactCategoryView = "alerts" | "delays" | "reduced-speed-zones" | "closures";
type AccountDialogMode = "auth-choice" | "login" | "register" | "verify-email" | "forgot-password" | "reset-password" | "link-google";
type AccountEntryIntent = "login" | "register";
type EstimatedTrainRequestState = "idle" | "loading" | "ready" | "reconnecting";
type DashboardRequestState = "ready" | "reconnecting";
type SavedStationNotice = {
  message: string;
  linksToMyStations?: boolean;
};

const VIEW_SCROLL_SELECTORS: Partial<Record<ActiveView, string>> = {
  menu: "#linewatch-main-menu-scroll",
  status: ".mobile-status-content-scroll",
  more: ".mobile-more-content-scroll",
};

const DEFAULT_DASHBOARD_REFRESH_MS = 30_000;
const MIN_DASHBOARD_REFRESH_MS = 10_000;
const STATION_DETAIL_REFRESH_MS = 15_000;
const GOOGLE_LINK_SUCCESS_PARAM = "account_linked";
const GOOGLE_LINK_SUCCESS_VALUE = "google";
const GOOGLE_LINK_SUCCESS_MESSAGE = "Google sign-in has been linked to your account.";
const BROWSER_NAVIGATION_STATE_KEY = "linewatchNavigation";

type BrowserNavigationState = {
  sessionId: string;
  depth: number;
};

function dashboardRefreshIntervalMs() {
  const configured = Number(process.env.NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS);

  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_DASHBOARD_REFRESH_MS;
  }

  return Math.max(configured, MIN_DASHBOARD_REFRESH_MS);
}

function replaceBrowserSearchParams(params: URLSearchParams) {
  const search = params.toString();
  const nextUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

function resolveLineDeepLink(rawLine: string | null): { lineId: string; network: NetworkId } | null {
  if (!rawLine) return null;
  const normalized = rawLine.trim().toLowerCase();

  // TTC matching
  if (normalized === "line-1" || normalized === "1" || normalized === "1-yonge-university" || normalized === "yonge-university") {
    return { lineId: "line-1", network: "ttc" };
  }
  if (normalized === "line-2" || normalized === "2" || normalized === "2-bloor-danforth" || normalized === "bloor-danforth") {
    return { lineId: "line-2", network: "ttc" };
  }
  if (normalized === "line-4" || normalized === "4" || normalized === "4-sheppard" || normalized === "sheppard") {
    return { lineId: "line-4", network: "ttc" };
  }
  if (normalized === "line-5" || normalized === "5" || normalized === "5-eglinton" || normalized === "eglinton") {
    return { lineId: "line-5", network: "ttc" };
  }
  if (normalized === "line-6" || normalized === "6" || normalized === "6-finch-west" || normalized === "finch-west") {
    return { lineId: "line-6", network: "ttc" };
  }

  // Regional matching
  const regionalMap: Record<string, string> = {
    "regional-lw": "regional-lw",
    "lw": "regional-lw",
    "lakeshore-west": "regional-lw",
    "regional-le": "regional-le",
    "le": "regional-le",
    "lakeshore-east": "regional-le",
    "regional-ki": "regional-ki",
    "ki": "regional-ki",
    "kitchener": "regional-ki",
    "regional-mi": "regional-mi",
    "mi": "regional-mi",
    "milton": "regional-mi",
    "regional-st": "regional-st",
    "st": "regional-st",
    "stouffville": "regional-st",
    "regional-rh": "regional-rh",
    "rh": "regional-rh",
    "richmond-hill": "regional-rh",
    "regional-br": "regional-br",
    "br": "regional-br",
    "barrie": "regional-br",
    "regional-up": "regional-up",
    "up": "regional-up",
    "up-express": "regional-up",
  };

  if (regionalMap[normalized]) {
    return { lineId: regionalMap[normalized], network: "regional" };
  }

  return null;
}

function currentBrowserLocalPath() {
  if (typeof window === "undefined") {
    return "/";
  }
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function googleLinkSuccessReturnTo() {
  const currentPath = currentBrowserLocalPath();
  if (!currentPath.startsWith("/") || currentPath.startsWith("//") || currentPath.includes("\n") || currentPath.includes("\r")) {
    return `/?${GOOGLE_LINK_SUCCESS_PARAM}=${GOOGLE_LINK_SUCCESS_VALUE}`;
  }

  const url = new URL(currentPath, "https://linewatch.local");
  url.searchParams.delete("account_error");
  url.searchParams.set(GOOGLE_LINK_SUCCESS_PARAM, GOOGLE_LINK_SUCCESS_VALUE);
  return `${url.pathname}${url.search}${url.hash}`;
}

function viewForSavedCommuteImpact(
  impact: AccountMatchedImpact,
  activeAlerts: DashboardData["activeAlerts"],
): ActiveView {
  if (impact.kind === "planned-closure") {
    return activeAlerts.some((alert) => alert.id === impact.id) ? "alerts" : "closures";
  }
  if (impact.kind === "suspension") return "alerts";
  if (impact.kind === "delay") return "delays";
  return "reduced-speed-zones";
}

export function LineWatchShell({
  initialData,
  initialEmailVerificationToken = "",
  initialPasswordResetToken = "",
  initialVisualPreferences = defaultVisualPreferences,
  offlineShell = false,
}: {
  initialData: DashboardData;
  offlineShell?: boolean;
  initialEmailVerificationToken?: string;
  initialPasswordResetToken?: string;
  initialVisualPreferences?: InitialVisualPreferences;
}) {
  const router = useRouter();
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkId>(initialVisualPreferences.defaultNetwork);
  const [defaultNetworkPreference, setDefaultNetworkPreference] = useState<NetworkId>(initialVisualPreferences.defaultNetwork);
  const [ttcData, setTtcData] = useState(initialData);
  const [regionalData, setRegionalData] = useState(regionalDashboardData);
  const [dashboardRequestStates, setDashboardRequestStates] = useState<Record<NetworkId, DashboardRequestState>>({
    ttc: "ready",
    regional: "ready",
  });
  const dashboardRefreshInFlightRef = useRef<Record<NetworkId, boolean>>({ ttc: false, regional: false });
  const regionalScenarioActiveRef = useRef(false);
  const [connectionOffline, setConnectionOffline] = useState(offlineShell);
  const [snapshotClock, setSnapshotClock] = useState(() => Date.now());
  const [verifiedAt, setVerifiedAt] = useState<Record<NetworkId, number | null>>({ ttc: null, regional: null });
  const verifiedAtRef = useRef(verifiedAt);
  const rawDisplayData = selectedNetwork === "regional" ? regionalData : ttcData;
  const storedVerifiedAt = verifiedAt[selectedNetwork];
  const lastVerified = storedVerifiedAt !== null && snapshotClock - storedVerifiedAt <= SNAPSHOT_RETENTION_MS ? storedVerifiedAt : null;
  const snapshotReason = connectionOffline ? "offline"
    : dashboardRequestStates[selectedNetwork] === "reconnecting" ? "reconnecting"
    : storedVerifiedAt !== null && snapshotClock - storedVerifiedAt >= DASHBOARD_VERIFICATION_MS ? "stale"
    : offlineShell && lastVerified === null ? "reconnecting" : null;
  const displayData = useMemo(() => snapshotReason
    ? snapshotDashboard(rawDisplayData, lastVerified, snapshotReason)
    : rawDisplayData, [rawDisplayData, lastVerified, snapshotReason]);

  useEffect(() => {
    const tick = () => setSnapshotClock(Date.now());
    const online = () => { setConnectionOffline(false); tick(); };
    const offline = () => { setConnectionOffline(true); tick(); };
    // Browser connectivity is only a hint; successful requests still decide freshness.
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
  const networkTransitionTargetRef = useRef<NetworkId | null>(null);
  const networkFadeAnimationRef = useRef<Animation | null>(null);
  const mobileNetworkTransitionRef = useRef<ReturnType<typeof startMapSurfaceTransition> | null>(null);
  const networkMapSurfaceRef = useRef<HTMLElement | null>(null);
  const networkViewTransitionRef = useRef<{
    finished: Promise<void>;
    skipTransition: () => void;
  } | null>(null);
  const crossNetworkStationSelectionRef = useRef<{ networkId: NetworkId; stationId: string } | null>(null);

  useEffect(() => () => {
    mobileNetworkTransitionRef.current?.cancel();
    networkFadeAnimationRef.current?.cancel();
    networkViewTransitionRef.current?.skipTransition();
    delete document.documentElement.dataset.networkTransitionPhase;
    delete document.documentElement.dataset.networkTransitionDirection;
  }, []);

  useEffect(() => {
    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") return;
    const requestedScenario = new URLSearchParams(window.location.search).get("regionalScenario");
    const supportedScenarios: RegionalScenarioId[] = [
      "none",
      "all-impact-types",
      "shared-station",
      "stale-source",
    ];
    if (requestedScenario && supportedScenarios.includes(requestedScenario as RegionalScenarioId)) {
      regionalScenarioActiveRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRegionalData(regionalDashboardDataForScenario(requestedScenario as RegionalScenarioId));
    }
  }, []);

  useEffect(() => {
    const restored: Record<NetworkId, number | null> = { ...verifiedAtRef.current };
    for (const network of ["ttc", "regional"] as const) {
      let saved = null;
      try { saved = readDashboardSnapshot(window.localStorage, network); } catch { /* Storage denied. */ }
      if (network === "ttc" && canSaveDashboard(initialData) && !offlineShell && navigator.onLine) {
        const now = Date.now();
        try { saveDashboardSnapshot(window.localStorage, initialData, now); } catch { /* Storage denied. */ }
        restored.ttc = now;
        // Restore browser storage only after hydration; the server cannot read it.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTtcData(initialData);
      } else if (saved && restored[network] === null && !(network === "regional" && regionalScenarioActiveRef.current)) {
        restored[network] = saved.savedAt;
        if (network === "ttc") setTtcData(saved.data);
        else setRegionalData(saved.data);
        setDashboardRequestStates((current) => ({ ...current, [network]: "reconnecting" }));
      }
    }
    verifiedAtRef.current = restored;
    setVerifiedAt(restored);
  }, [initialData, offlineShell]);

  const fetchDashboard = useCallback(async (networkId: NetworkId) => {
    if (
      document.visibilityState !== "visible"
      || dashboardRefreshInFlightRef.current[networkId]
      || (networkId === "regional" && regionalScenarioActiveRef.current)
    ) return;

    dashboardRefreshInFlightRef.current[networkId] = true;
    try {
      const { payload, reliability } = await retryDashboardRefresh(
        () => getDashboardRefresh(networkId),
        () => setDashboardRequestStates((current) => ({ ...current, [networkId]: "reconnecting" })),
      );
      // An in-flight response can finish after connectivity was lost. It must
      // not re-verify the view or recreate a snapshot cleared while offline.
      if (!navigator.onLine) return;
      const next = networkId === "regional"
        ? regionalDashboardDataFromApi(payload as RegionalDashboardApiResponse, reliability ?? undefined)
        : dashboardDataFromApi(payload, reliability ?? undefined);
      if (canSaveDashboard(next)) {
        const now = Date.now();
        try { saveDashboardSnapshot(window.localStorage, next, now); } catch { /* Storage denied. */ }
        verifiedAtRef.current = { ...verifiedAtRef.current, [networkId]: now };
        setVerifiedAt(verifiedAtRef.current);
        setSnapshotClock(now);
        if (networkId === "regional") setRegionalData(next);
        else setTtcData(next);
        setDashboardRequestStates((current) => ({ ...current, [networkId]: "ready" }));
      } else if (verifiedAtRef.current[networkId] !== null) {
        // A valid unavailable response must not overwrite the last real observation.
        setDashboardRequestStates((current) => ({ ...current, [networkId]: "reconnecting" }));
      } else {
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

  useEffect(() => {
    if (selectedNetwork !== "regional" || regionalScenarioActiveRef.current) return;
    const refresh = () => { void fetchDashboard("regional"); };
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

  useEffect(() => {
    if (selectedNetwork !== "ttc") return;
    const refresh = () => { void fetchDashboard("ttc"); };
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

  const {
    generatedAt,
    activeAlerts,
    delays,
    reducedSpeedZones,
    lineStatuses,
    plannedClosures,
  } = displayData;
  const reducedSpeedZoneCount = countReducedSpeedZones(reducedSpeedZones);
  const totalAlertCount =
    activeAlerts.length
    + delays.length
    + reducedSpeedZoneCount
    + plannedClosures.length;
  const pollText = generatedAt.lastPoll.replace(/succeeded\s*/i, "");
  const dashboardRequestState = dashboardRequestStates[selectedNetwork];
  const dashboardAvailabilityNotice = displayData.snapshot ? snapshotNotice(displayData.snapshot, snapshotClock)
    : dashboardRequestState === "reconnecting"
    ? "Connection Issue — Showing latest dashboard snapshot while LineWatchTO reconnects."
    : displayData.availability === "degraded"
      ? "Source Refresh Issue — Showing the last successful fresh update."
      : displayData.availability === "unavailable"
        ? "Live service data is unavailable — Showing the fallback dashboard."
        : null;
  const isLive = displayData.generatedAt.live && displayData.availability !== "unavailable" && displayData.availability !== "fixture";
  const isConnectionIssue = Boolean(displayData.snapshot) || dashboardRequestState === "reconnecting" || displayData.availability === "degraded";
  const [isDark, setIsDark] = useState(initialVisualPreferences.theme === "dark");
  const [highContrast, setHighContrast] = useState(initialVisualPreferences.highContrast);
  const [reducedMotion, setReducedMotion] = useState(initialVisualPreferences.reducedMotion);
  const [reducedMotionOverride, setReducedMotionOverride] = useState(initialVisualPreferences.reducedMotionOverride);
  const [dotBackgroundEnabled, setDotBackgroundEnabled] = useState(initialVisualPreferences.dotBackgroundEnabled);
  const [visualPreferencesReady, setVisualPreferencesReady] = useState(false);
  const mobilePerformanceMode = useMobilePerformanceMode();
  const [activeView, setActiveView] = useState<ActiveView>("map");
  const lastSavedViewRef = useRef<"my-stations" | "commutes">("my-stations");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("linewatch-last-saved-view-v1");
      if (stored === "my-stations" || stored === "commutes") {
        lastSavedViewRef.current = stored;
      }
    } catch {
      // Keep the default when browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    if (activeView !== "my-stations" && activeView !== "commutes") return;
    lastSavedViewRef.current = activeView;
    try {
      window.localStorage.setItem("linewatch-last-saved-view-v1", activeView);
    } catch {
      // Remember the selection for this session even if storage is unavailable.
    }
  }, [activeView]);
  const [initialMapReady, setInitialMapReady] = useState(false);
  useEffect(() => {
    if (!initialMapReady) return;
    // Warm only the other network's current visual variant after the entrance.
    const timer = window.setTimeout(() => {
      const network = selectedNetwork === "ttc" ? "regional" : "ttc";
      const theme = highContrast ? "high-contrast" : isDark ? "dark" : "light";
      const density = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches ? "mobile" : "balanced";
      void Promise.allSettled([
        network === "regional" ? preloadRegionalMapMarkup() : preloadTtcMapMarkup("/assets/linewatch/ttc-subway-map-custom.svg"),
        ...(["background", "foreground", "labels"] as const).map((plane) =>
          preloadRasterMapSource(rasterMapSource(network, plane, theme, density))),
      ]);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [initialMapReady, selectedNetwork, highContrast, isDark]);

  const [impactListLaunch, setImpactListLaunch] = useState({ lineId: null as string | null, requestId: 0 });
  const [lineImpactLaunch, setLineImpactLaunch] = useState({ lineId: null as string | null, requestId: 0 });
  const [navDirection, setNavDirection] = useState<"root" | "forward" | "back">("root");
  const [menuPinned, setMenuPinned] = useState(false);
  const [menuPinPreferenceReady, setMenuPinPreferenceReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState<boolean>(false);
  const [windowWidth, setWindowWidth] = useState<number>(1200);
  const activeViewRef = useRef<ActiveView>("map");
  const viewHistoryRef = useRef<ActiveView[]>([]);
  const viewScrollPositionsRef = useRef<Partial<Record<ActiveView, number>>>({});
  const browserNavigationSessionRef = useRef("");
  const browserNavigationDepthRef = useRef(0);
  const suppressedPopstateCountRef = useRef(0);
  interface SearchReturnContext {
    activeView: ActiveView;
    selectedStationId: string | null;
    selectedNetwork: NetworkId;
    commutesActiveTab?: "create" | "saved";
    focusedElement?: HTMLElement | null;
  }
  const searchReturnContextRef = useRef<SearchReturnContext | null>(null);
  const [searchReturnDestination, setSearchReturnDestination] = useState("status");
  const [searchReturnLabel, setSearchReturnLabel] = useState("Back to Status");
  const [commutePathPreview, setCommutePathPreview] = useState<AccountCommutePathPreview | null>(null);
  const commutePathPreviewRef = useRef<AccountCommutePathPreview | null>(null);
  const stationDrilldownOriginRef = useRef<string | null>(null);
  const [mobileInspectorDetent, setMobileInspectorDetent] = useState<MobileInspectorDetent>("details-focus");
  const [mapLayoutSignal, setMapLayoutSignal] = useState(0);
  const [mapPresentationMode, setMapPresentationMode] = useState<MapPresentationMode>("standard");
  const [rotatedMapViewportFrame, setRotatedMapViewportFrame] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [pwaEngagementSignal, setPwaEngagementSignal] = useState(0);
  const [estimatedTrainsEnabled, setEstimatedTrainsEnabled] = useState(initialVisualPreferences.estimatedTrainsEnabled);
  const [estimatedTrainSnapshot, setEstimatedTrainSnapshot] = useState<EstimatedTrainSnapshot>(EMPTY_ESTIMATED_TRAIN_SNAPSHOT);
  const [estimatedTrainRequestState, setEstimatedTrainRequestState] = useState<EstimatedTrainRequestState>("idle");
  const estimatedTrainConnectedRef = useRef({ ttc: false, regional: false });
  const trainMarkerContinuityRef = useRef({
    ttc: createEstimatedTrainMarkerContinuityState(),
    regional: createEstimatedTrainMarkerContinuityState(),
  });
  const subwayOperatingState = useSubwayOperatingState();
  const regionalRailOperatingState = useRegionalRailOperatingState();
  const trainNetworkOpen = selectedNetwork === "ttc"
    ? subwayOperatingState.status === "open"
    : regionalRailOperatingState.status === "open";
  const estimatedTrainMarkersVisible = estimatedTrainsEnabled && trainNetworkOpen && !displayData.snapshot;

  const [accountState, setAccountState] = useState<AccountState>({
    source: "unavailable",
    authenticated: false,
    user: null,
  });
  const [accountDialogMode, setAccountDialogMode] = useState<AccountDialogMode | null>(
    initialEmailVerificationToken.trim()
      ? "verify-email"
      : initialPasswordResetToken.trim()
        ? "reset-password"
        : null
  );
  const [isClosingAccount, setIsClosingAccount] = useState(false);
  const isClosingAccountRef = useRef(false);
  const closingAccountTimeoutRef = useRef<number | null>(null);
  const [accountEntryIntent, setAccountEntryIntent] = useState<AccountEntryIntent>("login");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirmation, setAccountPasswordConfirmation] = useState("");
  const [accountResetToken, setAccountResetToken] = useState(initialPasswordResetToken.trim());
  const [accountResetMessage, setAccountResetMessage] = useState<string | null>(null);
  const [accountDevResetToken, setAccountDevResetToken] = useState<string | null>(null);
  const [accountVerificationToken, setAccountVerificationToken] = useState(initialEmailVerificationToken.trim());
  const [accountVerificationMessage, setAccountVerificationMessage] = useState<string | null>(null);
  const [accountDevVerificationToken, setAccountDevVerificationToken] = useState<string | null>(null);
  const [accountDisplayName, setAccountDisplayName] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountSuccessMessage, setAccountSuccessMessage] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountCommutes, setAccountCommutes] = useState<AccountSavedCommute[]>([]);
  const [savedStations, setSavedStations] = useState<AccountSavedStation[]>([]);
  const [savedStationsLoading, setSavedStationsLoading] = useState(false);
  const [savedStationsError, setSavedStationsError] = useState<string | null>(null);
  const [pendingSavedStationIds, setPendingSavedStationIds] = useState<Set<string>>(() => new Set());
  const [savedStationNotice, setSavedStationNotice] = useState<SavedStationNotice | null>(null);
  const [savedStationNoticeKey, setSavedStationNoticeKey] = useState(0);
  const savedStationNoticeTimerRef = useRef<number | null>(null);
  const [myStationsListModeEpoch, setMyStationsListModeEpoch] = useState(0);
  const [commutesActiveTab, setCommutesActiveTab] = useState<"create" | "saved">("saved");
  const [commutesDraft, setCommutesDraft] = useState<SavedCommuteDraft | null>(() => persistedCommuteDraftStore.current);
  const [commutesFocusedCommuteId, setCommutesFocusedCommuteId] = useState<string | null>(null);
  const [commutesSortBy, setCommutesSortBy] = useState<SavedCommuteSort>("impact");
  const [commutesNetworkFilter, setCommutesNetworkFilter] = useState<AccountNetworkFilter>("all");
  const [commutesSelectedLegIds, setCommutesSelectedLegIds] = useState<Record<string, AccountCommuteLegId>>({});
  const [commutesExpandedCommuteId, setCommutesExpandedCommuteId] = useState<string | null>(null);
  const [commutesExpandedImpactDisclosures, setCommutesExpandedImpactDisclosures] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const key of persistedExpandedImpactDisclosures) {
      initial[key] = true;
    }
    return initial;
  });

  const handleCommutesToggleImpactDisclosure = useCallback((key: string, isOpen: boolean) => {
    if (isOpen) {
      persistedExpandedImpactDisclosures.add(key);
    } else {
      persistedExpandedImpactDisclosures.delete(key);
    }
    setCommutesExpandedImpactDisclosures((prev) => ({ ...prev, [key]: isOpen }));
  }, []);
  const [authConfig, setAuthConfig] = useState<AuthConfig>(unavailableAuthConfig);
  const selectedStationIdRef = useRef<string | null>(null);
  const selectionRef = useRef<ImpactSelection>(null);
  const selectionBackBehaviorRef = useRef<"clear" | "restore-view">("clear");
  const accountDialogModeRef = useRef<AccountDialogMode | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMenuPinned(window.localStorage.getItem("linewatch-menu-pinned") === "true");
    setMenuPinPreferenceReady(true);
  }, []);

  useEffect(() => {
    if (!menuPinPreferenceReady || typeof window === "undefined") return;
    window.localStorage.setItem("linewatch-menu-pinned", String(menuPinned));
  }, [menuPinPreferenceReady, menuPinned]);

  const recordPwaInstallEngagement = useCallback(() => {
    if (!isMobile) return;
    setPwaEngagementSignal((current) => current + 1);
  }, [isMobile]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = readVisualPreferencesFromStorage(window.localStorage);
    const reducedMotionMediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const storedReducedMotion = stored.reducedMotion;
    const hasReducedMotionOverride = storedReducedMotion !== null || initialVisualPreferences.reducedMotionOverride;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark((stored.theme ?? initialVisualPreferences.theme) === "dark");
    setHighContrast(stored.highContrast ?? initialVisualPreferences.highContrast);
    setEstimatedTrainsEnabled(stored.estimatedTrainsEnabled ?? initialVisualPreferences.estimatedTrainsEnabled);
    setDotBackgroundEnabled(stored.dotBackgroundEnabled ?? initialVisualPreferences.dotBackgroundEnabled);
    const preferredNetwork = stored.defaultNetwork ?? initialVisualPreferences.defaultNetwork;
    setDefaultNetworkPreference(preferredNetwork);
    setSelectedNetwork(preferredNetwork);
    setReducedMotionOverride(hasReducedMotionOverride);
    setReducedMotion(
      resolveReducedMotionPreference(
        storedReducedMotion ?? (initialVisualPreferences.reducedMotionOverride ? initialVisualPreferences.reducedMotion : null),
        reducedMotionMediaQuery.matches,
      ),
    );
    setVisualPreferencesReady(true);
  }, [
    initialVisualPreferences.estimatedTrainsEnabled,
    initialVisualPreferences.dotBackgroundEnabled,
    initialVisualPreferences.defaultNetwork,
    initialVisualPreferences.highContrast,
    initialVisualPreferences.reducedMotion,
    initialVisualPreferences.reducedMotionOverride,
    initialVisualPreferences.theme,
  ]);

  useEffect(() => {
    if (!visualPreferencesReady || typeof window === "undefined") return;

    const preferences = {
      theme: isDark ? "dark" as const : "light" as const,
      highContrast,
      reducedMotion: reducedMotionOverride ? reducedMotion : null,
      estimatedTrainsEnabled,
      dotBackgroundEnabled,
      defaultNetwork: defaultNetworkPreference,
    };

    writeVisualPreferencesToStorage(window.localStorage, preferences);
    document.cookie = buildVisualPreferencesCookie(preferences, window.location.protocol);
  }, [defaultNetworkPreference, dotBackgroundEnabled, estimatedTrainsEnabled, highContrast, isDark, reducedMotion, reducedMotionOverride, visualPreferencesReady]);

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


  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY);
    const sync = () => {
      const mobile = mediaQuery.matches;
      setIsMobile(mobile);
      if (!mobile) {
        setActiveView((curr) => (curr === "map" ? "status" : curr));
      }
    };
    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const visualViewport = window.visualViewport;
    let viewportUpdatePending = false;
    let viewportUpdateTimer: number | null = null;

    const mapCameraInteractionActive = () => Boolean(document.querySelector(
      '[data-map-gesture-active="true"], [data-map-zoom-active="true"]',
    ));

    const updateViewportHeight = (force = false) => {
      // Mobile browsers can emit visualViewport resize/scroll noise while two
      // fingers are manipulating the custom map camera. Resizing the shell in
      // the middle of that gesture also resizes the map viewport, causing its
      // ResizeObserver to refit against a moving target. Keep the fixed map
      // frame atomic and reconcile any legitimate browser-chrome change after
      // the final pointer is released.
      if (!force && mapCameraInteractionActive()) {
        viewportUpdatePending = true;
        if (viewportUpdateTimer === null) {
          viewportUpdateTimer = window.setTimeout(() => {
            viewportUpdateTimer = null;
            updateViewportHeight();
          }, 160);
        }
        return;
      }

      const height = visualViewport ? visualViewport.height : window.innerHeight;
      const width = visualViewport ? visualViewport.width : window.innerWidth;
      const offsetTop = visualViewport ? visualViewport.offsetTop : 0;
      const offsetLeft = visualViewport ? visualViewport.offsetLeft : 0;
      const scale = visualViewport ? visualViewport.scale : 1;
      const pageZoomed = Math.abs(scale - 1) > 0.01;
      // visualViewport dimensions shrink during browser page zoom. Feeding
      // those dimensions back into the app shell double-applies that zoom and
      // makes every fixed map layer jump. Keyboard resizing occurs at scale 1
      // and still uses the true visual viewport dimensions.
      const layoutHeight = pageZoomed ? window.innerHeight : height;
      const layoutWidth = pageZoomed ? window.innerWidth : width;
      const keyboardInset = pageZoomed
        ? 0
        : Math.max(0, window.innerHeight - height - offsetTop);
      const keyboardOpen = !pageZoomed
        && (keyboardInset > 120 || height < window.innerHeight * 0.78);
      const root = document.documentElement;

      root.style.setProperty("--visual-viewport-height", `${Math.round(layoutHeight)}px`);
      root.style.setProperty("--visual-viewport-width", `${Math.round(layoutWidth)}px`);
      root.style.setProperty("--visual-viewport-offset-top", `${Math.round(offsetTop)}px`);
      root.style.setProperty("--visual-viewport-offset-left", `${Math.round(offsetLeft)}px`);
      root.style.setProperty("--visual-viewport-scale", String(scale));
      root.style.setProperty("--visual-keyboard-inset", `${Math.round(keyboardInset)}px`);
      root.dataset.visualKeyboard = keyboardOpen ? "open" : "closed";
      // Rotated mode shares this gesture-gated viewport reconciliation. Keep
      // its camera and controls fitted after browser chrome or window changes,
      // without consuming transient pinch dimensions during a map gesture.
      setRotatedMapViewportFrame((current) => {
        if (!current) return current;
        const width = Math.max(1, Math.round(layoutWidth));
        const height = Math.max(1, Math.round(layoutHeight));
        return current.width === width && current.height === height
          ? current
          : { width, height };
      });
      viewportUpdatePending = false;
      if (viewportUpdateTimer !== null) {
        window.clearTimeout(viewportUpdateTimer);
        viewportUpdateTimer = null;
      }
    };

    const flushPendingViewportUpdate = () => {
      if (!viewportUpdatePending) return;
      window.requestAnimationFrame(() => updateViewportHeight());
    };
    const handleViewportChange = () => updateViewportHeight();

    updateViewportHeight(true);
    window.addEventListener("pointerup", flushPendingViewportUpdate);
    window.addEventListener("pointercancel", flushPendingViewportUpdate);

    if (visualViewport) {
      visualViewport.addEventListener("resize", handleViewportChange);
      visualViewport.addEventListener("scroll", handleViewportChange);
      return () => {
        visualViewport.removeEventListener("resize", handleViewportChange);
        visualViewport.removeEventListener("scroll", handleViewportChange);
        window.removeEventListener("pointerup", flushPendingViewportUpdate);
        window.removeEventListener("pointercancel", flushPendingViewportUpdate);
        if (viewportUpdateTimer !== null) window.clearTimeout(viewportUpdateTimer);
        delete document.documentElement.dataset.visualKeyboard;
      };
    } else {
      window.addEventListener("resize", handleViewportChange);
      return () => {
        window.removeEventListener("resize", handleViewportChange);
        window.removeEventListener("pointerup", flushPendingViewportUpdate);
        window.removeEventListener("pointercancel", flushPendingViewportUpdate);
        if (viewportUpdateTimer !== null) window.clearTimeout(viewportUpdateTimer);
        delete document.documentElement.dataset.visualKeyboard;
      };
    }
  }, []);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    const selector = VIEW_SCROLL_SELECTORS[activeView];
    const savedScrollTop = viewScrollPositionsRef.current[activeView];
    if (!selector || savedScrollTop === undefined) return;

    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const scrollElement = document.querySelector<HTMLElement>(selector);
        if (scrollElement) scrollElement.scrollTop = savedScrollTop;
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [activeView]);

  const pushBrowserNavigationEntry = useCallback(() => {
    if (typeof window === "undefined" || !browserNavigationSessionRef.current) return;
    const depth = browserNavigationDepthRef.current + 1;
    browserNavigationDepthRef.current = depth;
    window.history.pushState({
      ...window.history.state,
      [BROWSER_NAVIGATION_STATE_KEY]: {
        sessionId: browserNavigationSessionRef.current,
        depth,
      } satisfies BrowserNavigationState,
    }, "", currentBrowserLocalPath());
  }, []);

  const consumeBrowserNavigationEntries = useCallback((requestedCount = 1) => {
    if (typeof window === "undefined" || !browserNavigationSessionRef.current) return;
    const count = Math.min(requestedCount, browserNavigationDepthRef.current);
    if (count <= 0) return;
    browserNavigationDepthRef.current -= count;
    suppressedPopstateCountRef.current += 1;
    window.history.go(-count);
  }, []);

  const navigateForward = useCallback((nextView: ActiveView) => {
    const currentView = activeViewRef.current;
    if (currentView === nextView) return;
    const scrollSelector = VIEW_SCROLL_SELECTORS[currentView];
    const scrollElement = scrollSelector ? document.querySelector<HTMLElement>(scrollSelector) : null;
    if (scrollElement) {
      viewScrollPositionsRef.current[currentView] = scrollElement.scrollTop;
    }
    pushBrowserNavigationEntry();
    viewHistoryRef.current = pushViewHistory(viewHistoryRef.current, currentView, nextView);
    if (nextView !== "search") {
      searchReturnContextRef.current = null;
    }
    activeViewRef.current = nextView;
    setNavDirection("forward");
    setActiveView(nextView);
  }, [pushBrowserNavigationEntry, setActiveView]);

  const [isClosingSearch, setIsClosingSearch] = useState(false);
  const searchClosingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (searchClosingTimeoutRef.current) {
        window.clearTimeout(searchClosingTimeoutRef.current);
      }
    };
  }, []);

  const navigateRoot = useCallback((nextView: ActiveView) => {
    if (searchClosingTimeoutRef.current) {
      window.clearTimeout(searchClosingTimeoutRef.current);
      searchClosingTimeoutRef.current = null;
    }
    setIsClosingSearch(false);
    const currentView = activeViewRef.current;
    if (currentView === nextView) return;
    if (nextView === "map") {
      consumeBrowserNavigationEntries(browserNavigationDepthRef.current);
    } else if (currentView === "map") {
      pushBrowserNavigationEntry();
    } else if (browserNavigationDepthRef.current > 1) {
      consumeBrowserNavigationEntries(browserNavigationDepthRef.current - 1);
    }
    viewHistoryRef.current = [];
    stationDrilldownOriginRef.current = null;
    if (nextView !== "search") {
      searchReturnContextRef.current = null;
    }
    activeViewRef.current = nextView;
    setNavDirection("root");
    setActiveView(nextView);
  }, [consumeBrowserNavigationEntries, pushBrowserNavigationEntry, setActiveView]);

  const navigateToMapDrilldown = useCallback(() => {
    const currentView = activeViewRef.current;
    if (currentView === "map") {
      setActiveView("map");
      return;
    }
    viewHistoryRef.current = pushViewHistory(viewHistoryRef.current, currentView, "map" as ActiveView);
    activeViewRef.current = "map";
    setActiveView("map");
  }, [setActiveView]);

  const restorePreviousView = useCallback(() => {
    const fallback: ActiveView = commutePathPreviewRef.current
      ? "commutes"
      : isMobile
        ? "map"
        : "status";
    const previous = popViewHistory(viewHistoryRef.current, fallback);
    viewHistoryRef.current = previous.history;
    activeViewRef.current = previous.view;
    if (commutePathPreviewRef.current && previous.view === "commutes") {
      setCommutesFocusedCommuteId(commutePathPreviewRef.current.commuteId ?? commutePathPreviewRef.current.id);
      commutePathPreviewRef.current = null;
      setCommutePathPreview(null);
    }
    setActiveView(previous.view);
    return previous.view;
  }, [isMobile, setActiveView, setCommutePathPreview, setCommutesFocusedCommuteId]);

  const restoreMapDrilldownOrigin = useCallback(() => {
    if (activeViewRef.current !== "map") return;
    restorePreviousView();
  }, [restorePreviousView]);

  useEffect(() => {
    if (
      activeView !== "alerts"
      && activeView !== "delays"
      && activeView !== "reduced-speed-zones"
      && activeView !== "closures"
    ) {
      // The line focus is navigation context, not a saved filter preference.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setImpactListLaunch((current) => current.lineId === null ? current : { ...current, lineId: null });
    }
  }, [activeView]);

  useEffect(() => {
    const isPhysicalLandscape = typeof window !== "undefined" && window.matchMedia("(orientation: landscape) and (max-height: 520px)").matches;
    if ((!isMobile || isPhysicalLandscape) && mapPresentationMode !== "standard") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMapPresentationMode("standard");
    }
  }, [isMobile, mapPresentationMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const orientationQuery = window.matchMedia("(orientation: landscape)");
    const handleOrientationChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches && window.matchMedia("(max-height: 520px)").matches && mapPresentationMode !== "standard") {
        setMapPresentationMode("standard");
      }
    };
    orientationQuery.addEventListener("change", handleOrientationChange);
    return () => orientationQuery.removeEventListener("change", handleOrientationChange);
  }, [mapPresentationMode]);

  const previousMapPresentationModeRef = useRef(mapPresentationMode);
  useEffect(() => {
    const changed = previousMapPresentationModeRef.current !== mapPresentationMode;
    previousMapPresentationModeRef.current = mapPresentationMode;
    if (!isMobile || !changed) return;
    const timer = window.setTimeout(() => {
      setMapLayoutSignal((current) => current + 1);
    }, mapPresentationMode === "rotated-landscape" ? 90 : 50);

    return () => window.clearTimeout(timer);
  }, [isMobile, mapPresentationMode]);

  const clock = useTorontoClock(generatedAt.time);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [zoomInSignal, setZoomInSignal] = useState(0);
  const [zoomOutSignal, setZoomOutSignal] = useState(0);

  const [closedMapPeek, setClosedMapPeek] = useState(false);
  const [closedScreenAcknowledged, setClosedScreenAcknowledged] = useState(false);
  const [isClosedScreenExiting, setIsClosedScreenExiting] = useState(false);
  const [isExitingPeekChip, setIsExitingPeekChip] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [disclaimerVisible, setDisclaimerVisible] = useState(true);

  const showTtcClosedScreen = selectedNetwork === "ttc" && subwayOperatingState.status === "closed"
    && !closedScreenAcknowledged
    && !disclaimerVisible;
  const showRegionalClosedScreen = selectedNetwork === "regional"
    && regionalRailOperatingState.status === "closed"
    && !closedScreenAcknowledged
    && !disclaimerVisible;
  const showClosedScreen = showTtcClosedScreen || showRegionalClosedScreen;


  // Interactive linking state
  const [selection, setSelection] = useState<ImpactSelection>(null);
  const openImpactCategory = useCallback((view: ImpactCategoryView, lineId?: string) => {
    setImpactListLaunch((current) => ({
      lineId: lineId ?? null,
      requestId: current.requestId + 1,
    }));
    setSelection(null);
    navigateForward(view);
  }, [navigateForward, setSelection]);
  const openLineImpacts = useCallback((lineId: string) => {
    setLineImpactLaunch((current) => ({ lineId, requestId: current.requestId + 1 }));
    setSelection(null);
    navigateForward("line-impacts");
  }, [navigateForward, setSelection]);
  const openLegendImpactCategory = useCallback((view: ImpactCategoryView, lineId: string) => {
    openImpactCategory(view, lineId);
  }, [openImpactCategory]);
  const legendProps = useMemo(() => ({
    expanded: legendExpanded,
    onToggleExpanded: () => setLegendExpanded((prev) => !prev),
    onLineClick: (lineId: string) => {
      setLegendExpanded(false);
      openLineImpacts(lineId);
    },
    onAlertClick: (lineId: string) => openLegendImpactCategory("alerts", lineId),
    onDelayClick: (lineId: string) => openLegendImpactCategory("delays", lineId),
    onReducedSpeedZoneClick: (lineId: string) => openLegendImpactCategory("reduced-speed-zones", lineId),
    onClosureClick: (lineId: string) => openLegendImpactCategory("closures", lineId),
  }), [legendExpanded, openLegendImpactCategory, openLineImpacts]);
  const [ttcStationSummaries, setTtcStationSummaries] = useState<StationSummary[]>(fallbackStationSummaries.stations);
  const stationCatalogs = useMemo(
    () => ({
      ttc: ttcStationSummaries,
      regional: regionalStationSummaries.stations,
    }),
    [ttcStationSummaries],
  );
  const stationSummaries = stationCatalogs[selectedNetwork];
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  const desktopMetrics = useMemo(() => {
    return computeDesktopLayoutMetrics({ windowWidth, isMobile, activeView, selectedStationId });
  }, [windowWidth, isMobile, activeView, selectedStationId]);
  const [searchExpandedLineId, setSearchExpandedLineId] = useState<string | null>(null);
  const [stationSheetRatio, setStationSheetRatio] = useState<number>(() => {
    if (typeof window === "undefined") return MOBILE_SHEET_DEFAULT_RATIO;
    return readStoredSheetHeightRatio(window.localStorage);
  });

  useEffect(() => {
    const handleSheetResize = (e: Event) => {
      const customEvent = e as CustomEvent<{ ratio: number }>;
      if (customEvent.detail && typeof customEvent.detail.ratio === "number") {
        setStationSheetRatio(customEvent.detail.ratio);
      }
    };
    window.addEventListener(MOBILE_STATION_SHEET_RESIZE_EVENT, handleSheetResize);
    return () => window.removeEventListener(MOBILE_STATION_SHEET_RESIZE_EVENT, handleSheetResize);
  }, []);
  const [stationPanelActivationKey, setStationPanelActivationKey] = useState(0);
  const [visibleStationResult, setVisibleStationResult] = useState<StationDataResult<StationDetail | null> | null>(null);
  const [stationLoading, setStationLoading] = useState(false);
  const [desktopLiveAnnouncement, setDesktopLiveAnnouncement] = useState("");
  const announceDesktop = useCallback((message: string) => {
    setDesktopLiveAnnouncement(message);
  }, []);
  const [accessibilityOutageState, setAccessibilityOutageState] = useState<{
    networkId: NetworkId;
    data: AccessibilityOutageResponse;
  } | null>(null);
  const accessibilityOutageResult = accessibilityOutageState?.networkId === selectedNetwork
    ? accessibilityOutageState.data
    : null;
  const [accessibilityOutageTarget, setAccessibilityOutageTarget] = useState<AccessibilityOutageTarget | null>(null);
  const [expandedMyStationDisruptionIds, setExpandedMyStationDisruptionIds] = useState<Set<string>>(() => new Set());
  const [currentServiceNotices, setCurrentServiceNotices] = useState<{ networkId: NetworkId; data: SurfaceNoticeResponse } | null>(null);
  const [surfaceNoticeCount, setSurfaceNoticeCount] = useState<number | null>(null);
  const [regionalTripChangeCount, setRegionalTripChangeCount] = useState<number | null>(null);
  const [announcementCount, setAnnouncementCount] = useState<number | null>(null);
  const [surfaceNoticeInitialQuery, setSurfaceNoticeInitialQuery] = useState("");
  const [surfaceNoticeInitialContent, setSurfaceNoticeInitialContent] = useState<"notices" | "trip-changes">("notices");

  useEffect(() => {
    if (activeView !== "accessibility-outages" && accessibilityOutageTarget) {
      // The target only describes a direct My Stations drill-down and must not
      // leak into a later visit from the normal Status navigation.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAccessibilityOutageTarget(null);
    }
  }, [accessibilityOutageTarget, activeView]);

  useEffect(() => {
    if (activeView !== "surface-notices" && surfaceNoticeInitialQuery) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSurfaceNoticeInitialQuery("");
    }
  }, [activeView, surfaceNoticeInitialQuery]);

  const [isClosingPanel, setIsClosingPanel] = useState(false);
  const closingTimeoutRef = useRef<number | null>(null);

  const handleClosePanel = useCallback(() => {
    if (isClosingPanel) return;
    consumeBrowserNavigationEntries(browserNavigationDepthRef.current);
    setIsClosingPanel(true);
    viewHistoryRef.current = [];
    setSelectedStationId(null);
    commutePathPreviewRef.current = null;
    setCommutePathPreview(null);
    setCommutesActiveTab("saved");
    setCommutesDraft(null);
    clearPersistedCommuteDraft();
    if (closingTimeoutRef.current) {
      window.clearTimeout(closingTimeoutRef.current);
    }
    closingTimeoutRef.current = window.setTimeout(() => {
      activeViewRef.current = "map";
      setActiveView("map");
      setIsClosingPanel(false);
      setSelection(null);
      setMapPresentationMode("standard");
      setMobileInspectorDetent("map-focus");
      setAccessibilityOutageTarget(null);
    }, reducedMotion ? 0 : isMobile ? 240 : 380);
  }, [consumeBrowserNavigationEntries, isClosingPanel, isMobile, reducedMotion, setActiveView, setSelection, setSelectedStationId, setMapPresentationMode, setMobileInspectorDetent, setCommutePathPreview]);

  const [isGoingBack, setIsGoingBack] = useState(false);
  const backTimeoutRef = useRef<number | null>(null);

  const handleSubmenuBack = useCallback(() => {
    if (isGoingBack) return;
    consumeBrowserNavigationEntries();
    setNavDirection("back");
    if (backTimeoutRef.current) {
      window.clearTimeout(backTimeoutRef.current);
    }

    const stationOriginId = stationDrilldownOriginRef.current;
    const isStatusView =
      activeView === "alerts" ||
      activeView === "delays" ||
      activeView === "reduced-speed-zones" ||
      activeView === "closures" ||
      activeView === "line-impacts" ||
      activeView === "accessibility-outages" ||
      activeView === "surface-notices" ||
      activeView === "announcements" ||
      activeView === "source-status" ||
      activeView === "analytics";
    const desktopFallback: ActiveView = isStatusView ? "status" : "more";
    const mobileFallback: ActiveView = isStatusView
      ? "status"
      : activeView === "commutes"
        ? "map"
        : "more";
    const fallback: ActiveView = commutePathPreviewRef.current
      ? "commutes"
      : isMobile
        ? mobileFallback
        : desktopFallback;
    const previous = stationOriginId
      ? { history: [] as ActiveView[], view: "map" as ActiveView }
      : popViewHistory(viewHistoryRef.current, fallback);
    const targetView: ActiveView = commutePathPreviewRef.current
      ? "commutes"
      : previous.view;
    const returningToCommutesFromPreview = Boolean(commutePathPreviewRef.current) && targetView === "commutes";
    const returningToSelectedMap = targetView === "map" && Boolean(selectionRef.current) && !stationOriginId;

    const finishBackNavigation = () => {
      backTimeoutRef.current = null;
      if (stationOriginId) {
        stationDrilldownOriginRef.current = null;
        viewHistoryRef.current = [];
        activeViewRef.current = "map";
        setActiveView("map");
        setIsGoingBack(false);
        selectionRef.current = null;
        selectionBackBehaviorRef.current = "clear";
        setSelection(null);
        setAccessibilityOutageTarget(null);
        selectedStationIdRef.current = stationOriginId;
        setSelectedStationId(stationOriginId);
        return;
      }
      if (returningToCommutesFromPreview) {
        if (commutePathPreviewRef.current) {
          setCommutesFocusedCommuteId(commutePathPreviewRef.current.commuteId ?? commutePathPreviewRef.current.id);
        }
        commutePathPreviewRef.current = null;
        setCommutePathPreview(null);
      }
      viewHistoryRef.current = previous.history.length > 0
        ? previous.history
        : returningToCommutesFromPreview
          ? (isMobile ? ["more"] : ["status"])
          : [];
      activeViewRef.current = targetView;
      setActiveView(targetView);
      setIsGoingBack(false);
      if (!returningToSelectedMap) {
        selectionRef.current = null;
        selectionBackBehaviorRef.current = "clear";
        setSelection(null);
      }
      setAccessibilityOutageTarget(null);
    };

    // Desktop Back commits the destination immediately so incoming content animates once.
    // A mobile panel-to-panel Back also swaps content immediately without dismissing the sheet.
    if (reducedMotion || !isMobile || (isMobile && targetView !== "map")) {
      finishBackNavigation();
      return;
    }

    setIsGoingBack(true);
    backTimeoutRef.current = window.setTimeout(
      finishBackNavigation,
      240,
    );
  }, [activeView, consumeBrowserNavigationEntries, isGoingBack, isMobile, reducedMotion, setActiveView, setCommutePathPreview, setCommutesFocusedCommuteId, setSelectedStationId, setSelection]);

  const reducedMotionRef = useRef(reducedMotion);

  useEffect(() => {
    selectedStationIdRef.current = selectedStationId;
    selectionRef.current = selection;
    accountDialogModeRef.current = accountDialogMode;
    commutePathPreviewRef.current = commutePathPreview;
    reducedMotionRef.current = reducedMotion;
  }, [accountDialogMode, commutePathPreview, reducedMotion, selectedStationId, selection]);

  useEffect(() => {
    const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    browserNavigationSessionRef.current = sessionId;
    browserNavigationDepthRef.current = 0;
    window.history.replaceState({
      ...window.history.state,
      [BROWSER_NAVIGATION_STATE_KEY]: { sessionId, depth: 0 } satisfies BrowserNavigationState,
    }, "", currentBrowserLocalPath());
    if (accountDialogModeRef.current) {
      pushBrowserNavigationEntry();
    }

    const handlePopState = (event: PopStateEvent) => {
      const navigationState = event.state?.[BROWSER_NAVIGATION_STATE_KEY] as BrowserNavigationState | undefined;
      browserNavigationDepthRef.current = navigationState?.sessionId === sessionId
        ? navigationState.depth
        : 0;

      if (suppressedPopstateCountRef.current > 0) {
        suppressedPopstateCountRef.current -= 1;
        return;
      }

      setNavDirection("back");
      setMapPresentationMode("standard");
      setMobileInspectorDetent("map-focus");

      const action = resolveInAppBackAction({
        accountDialogOpen: Boolean(accountDialogModeRef.current),
        stationOpen: Boolean(selectedStationIdRef.current),
        commutePreviewOpen: Boolean(commutePathPreviewRef.current),
        viewOpen: activeViewRef.current !== "map",
        impactOpen: Boolean(selectionRef.current),
      });
      switch (action) {
        case "close-account-dialog":
          if (isClosingAccountRef.current) return;
          accountDialogModeRef.current = null;
          isClosingAccountRef.current = true;
          setIsClosingAccount(true);
          if (closingAccountTimeoutRef.current) {
            window.clearTimeout(closingAccountTimeoutRef.current);
          }
          closingAccountTimeoutRef.current = window.setTimeout(() => {
            setAccountDialogMode(null);
            isClosingAccountRef.current = false;
            setIsClosingAccount(false);
          }, reducedMotionRef.current ? 0 : 180);
          return;
        case "close-station":
          selectedStationIdRef.current = null;
          setSelectedStationId(null);
          restoreMapDrilldownOrigin();
          return;
        case "close-commute-preview":
          if (commutePathPreviewRef.current) {
            setCommutesFocusedCommuteId(commutePathPreviewRef.current.commuteId ?? commutePathPreviewRef.current.id);
          }
          commutePathPreviewRef.current = null;
          setCommutePathPreview(null);
          selectionRef.current = null;
          setSelection(null);
          setActiveView("commutes");
          return;
        case "navigate-view": {
          if (stationDrilldownOriginRef.current) {
            const originStationId = stationDrilldownOriginRef.current;
            stationDrilldownOriginRef.current = null;
            viewHistoryRef.current = [];
            activeViewRef.current = "map";
            setActiveView("map");
            selectionRef.current = null;
            selectionBackBehaviorRef.current = "clear";
            setSelection(null);
            setAccessibilityOutageTarget(null);
            selectedStationIdRef.current = originStationId;
            setSelectedStationId(originStationId);
            return;
          }
          if (selectionRef.current && selectionBackBehaviorRef.current === "clear" && !commutePathPreviewRef.current) {
            selectionRef.current = null;
            setSelection(null);
            return;
          }
          if (commutePathPreviewRef.current) {
            setCommutesFocusedCommuteId(commutePathPreviewRef.current.commuteId ?? commutePathPreviewRef.current.id);
            commutePathPreviewRef.current = null;
            setCommutePathPreview(null);
            setActiveView("commutes");
            selectionRef.current = null;
            selectionBackBehaviorRef.current = "clear";
            setSelection(null);
            setAccessibilityOutageTarget(null);
            return;
          }
          const restoredView = restorePreviousView();
          if (restoredView !== "map") {
            selectionRef.current = null;
            selectionBackBehaviorRef.current = "clear";
            setSelection(null);
          }
          setAccessibilityOutageTarget(null);
          return;
        }
        case "clear-impact":
          selectionRef.current = null;
          setSelection(null);
          if (selectionBackBehaviorRef.current === "restore-view") {
            restoreMapDrilldownOrigin();
          }
          selectionBackBehaviorRef.current = "clear";
          return;
        case "none":
          return;
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      browserNavigationSessionRef.current = "";
    };
  }, [pushBrowserNavigationEntry, restoreMapDrilldownOrigin, restorePreviousView, setAccountDialogMode]);

  useEffect(() => {
    return () => {
      if (closingAccountTimeoutRef.current) {
        window.clearTimeout(closingAccountTimeoutRef.current);
      }
    };
  }, []);

  const openAccountDialog = useCallback((mode: AccountDialogMode) => {
    if (closingAccountTimeoutRef.current) {
      window.clearTimeout(closingAccountTimeoutRef.current);
      closingAccountTimeoutRef.current = null;
    }
    isClosingAccountRef.current = false;
    setIsClosingAccount(false);
    if (!accountDialogModeRef.current) {
      pushBrowserNavigationEntry();
    }
    accountDialogModeRef.current = mode;
    setAccountDialogMode(mode);
  }, [pushBrowserNavigationEntry]);

  useEffect(() => {
    if (initialEmailVerificationToken.trim() || window.location.pathname !== "/verify-email") {
      return;
    }
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("token")?.trim() ?? "";
    if (!fragmentToken) {
      return;
    }
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    const openTimer = window.setTimeout(() => {
      setAccountVerificationToken(fragmentToken);
      openAccountDialog("verify-email");
    }, 0);
    return () => window.clearTimeout(openTimer);
  }, [initialEmailVerificationToken, openAccountDialog]);

  const closeAccountDialog = useCallback(() => {
    if (!accountDialogModeRef.current && !accountDialogMode) return;
    if (isClosingAccountRef.current) return;
    consumeBrowserNavigationEntries();
    accountDialogModeRef.current = null;
    isClosingAccountRef.current = true;
    setIsClosingAccount(true);
    if (closingAccountTimeoutRef.current) {
      window.clearTimeout(closingAccountTimeoutRef.current);
    }
    closingAccountTimeoutRef.current = window.setTimeout(() => {
      setAccountDialogMode(null);
      isClosingAccountRef.current = false;
      setIsClosingAccount(false);
    }, reducedMotion ? 0 : 180);
  }, [accountDialogMode, consumeBrowserNavigationEntries, reducedMotion, setAccountDialogMode]);

  const closeSelectedStation = useCallback((expectedStationId: string) => {
    if (selectedStationIdRef.current !== expectedStationId) return;
    consumeBrowserNavigationEntries();
    stationDrilldownOriginRef.current = null;
    selectedStationIdRef.current = null;
    setSelectedStationId((current) => current === expectedStationId ? null : current);
    announceDesktop("Station details closed");
  }, [consumeBrowserNavigationEntries, setSelectedStationId, announceDesktop]);

  const currentSavedStations = useMemo(
    () => savedStations.filter((saved) => saved.networkId === selectedNetwork),
    [savedStations, selectedNetwork],
  );
  const savedStationIds = useMemo(
    () => new Set(currentSavedStations.map((saved) => saved.station.id)),
    [currentSavedStations],
  );
  const savedStationKeys = useMemo(
    () => new Set(savedStations.map((saved) => `${saved.networkId}:${saved.station.id}`)),
    [savedStations],
  );

  const pushSettings = usePushNotificationSettings(accountState);
  const supportUrl = process.env.NEXT_PUBLIC_LINEWATCH_SUPPORT_URL?.trim() ?? "";
  const [shareStatusLabel, setShareStatusLabel] = useState<string | null>(null);
  const shareStatusTimerRef = useRef<number | null>(null);

  const setTemporaryShareStatus = useCallback((label: string) => {
    if (shareStatusTimerRef.current !== null) {
      window.clearTimeout(shareStatusTimerRef.current);
    }

    setShareStatusLabel(label);
    shareStatusTimerRef.current = window.setTimeout(() => {
      setShareStatusLabel(null);
      shareStatusTimerRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (shareStatusTimerRef.current !== null) {
        window.clearTimeout(shareStatusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeView !== "commutes" && activeView !== "notifications") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCommutesActiveTab("saved");
      setCommutesDraft(null);
      clearPersistedCommuteDraft();
    }
  }, [activeView]);

  const notificationStatusLabel = useMemo(() => {
    if (
      !accountState.authenticated ||
      pushSettings.deviceSetupState === "signed-out" ||
      pushSettings.deviceSetupState === "unsupported" ||
      pushSettings.deviceSetupState === "not-configured" ||
      pushSettings.deviceSetupState === "checking"
    ) {
      return "Unavailable";
    }
    if (!pushSettings.accountNotificationsDesired) {
      return "Off";
    }
    if (pushSettings.subscribed) {
      return "On";
    }
    return "Device Setup Needed";
  }, [
    accountState.authenticated,
    pushSettings.deviceSetupState,
    pushSettings.accountNotificationsDesired,
    pushSettings.subscribed,
  ]);

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

  const estimatedTrainDisplayPending = estimatedTrainMarkersVisible
    && estimatedTrainSnapshot.markers.length === 0
    && (estimatedTrainRequestState === "loading"
      || estimatedTrainRequestState === "reconnecting"
      || (estimatedTrainSnapshot.availability !== "disabled"
        && estimatedTrainSnapshot.availability !== "unavailable"));
  const estimatedTrainPendingLabel = estimatedTrainRequestState === "reconnecting"
    ? "Estimated train markers reconnecting"
    : "Waiting for estimated train markers";

  const notificationSummary = useMemo(() => {
    const tone: "on" | "off" | "unavailable" =
      notificationStatusLabel === "On" ? "on" :
      notificationStatusLabel === "Device Setup Needed" || notificationStatusLabel === "Off" ? "off" :
      "unavailable";
    return {
      label: notificationStatusLabel,
      detail: notificationStatusLabel === "Device Setup Needed"
        ? "Preferences saved. Enable notifications for push delivery"
        : "My Commutes alerts and closure reminders",
      tone,
    };
  }, [notificationStatusLabel]);

  const { clear: commuteClearCount, affectedNow: commuteAffectedCount } = useMemo(
    () => summarizeSavedCommuteStatuses(accountCommutes),
    [accountCommutes]
  );

  const stationImpactSelections = useMemo(
    () => ({
      ttc: stationImpactSelectionsByStation(ttcData),
      regional: stationImpactSelectionsByStation(regionalData),
    }),
    [ttcData, regionalData],
  );

  const { clear: savedStationsClearCount, affectedNow: savedStationsAffectedCount } = useMemo(
    () => summarizeSavedStationStatuses(savedStations, stationCatalogs, stationImpactSelections),
    [savedStations, stationCatalogs, stationImpactSelections],
  );

  useEffect(() => {
    let cancelled = false;
    let request: Promise<void> | null = null;
    const refreshAccount = () => {
      if (request) return request;
      request = getCurrentAccountWithRetry()
        .then((state) => {
          if (!cancelled) {
            setAccountState((current) => preserveAccountStateDuringOutage(current, state));
          }
        })
        .finally(() => {
          request = null;
        });
      return request;
    };
    const handleOnline = () => { void refreshAccount(); };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshAccount();
    };

    void refreshAccount();
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAuthConfig().then((result) => {
      if (!cancelled) {
        setAuthConfig(result.config);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // supports panel=notifications, panel=commutes, panel=alerts, panel=delays, panel=reduced-speed-zones, panel=closures, panel=release-notes
    const params = new URLSearchParams(window.location.search);
    const nextParams = new URLSearchParams(params);
    let shouldReplaceUrl = false;
    const requestedNetwork = params.get("network");
    if (requestedNetwork === "ttc" || requestedNetwork === "regional") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedNetwork(requestedNetwork);
    }

    const accountLinkedValue = params.get(GOOGLE_LINK_SUCCESS_PARAM);
    if (accountLinkedValue === GOOGLE_LINK_SUCCESS_VALUE) {
      openAccountDialog("link-google");
      setAccountError(null);
      setAccountSuccessMessage("Google sign-in has been linked to your account.");
      nextParams.delete("account_error");
      nextParams.delete(GOOGLE_LINK_SUCCESS_PARAM);
      shouldReplaceUrl = true;
    } else {
      const accountErrorCode = params.get("account_error");
      if (accountErrorCode !== null) {
        const oauthErrorState = accountOAuthErrorState(accountErrorCode);
        if (oauthErrorState) {
          setAccountEntryIntent(oauthErrorState.entryIntent);
          openAccountDialog(oauthErrorState.dialogMode);
          setAccountError(oauthErrorState.message);
          setAccountSuccessMessage(null);
        }
        nextParams.delete("account_error");
        shouldReplaceUrl = true;
      }
    }

    const panel = params.get("panel");
    const panelToView: Record<string, ActiveView> = {
      status: "status",
      alerts: "alerts",
      delays: "delays",
      "reduced-speed-zones": "reduced-speed-zones",
      closures: "closures",
      commutes: "commutes",
      notifications: "notifications",
      analytics: "analytics",
      "trip-changes": "surface-notices",
    };
    if (panel === "trip-changes") {
      setSurfaceNoticeInitialContent("trip-changes");
    }
    if (hasReleaseNotes) {
      panelToView["release-notes"] = "release-notes";
    }
    const impactKind = params.get("impactKind") as ImpactKind;
    const impactId = params.get("impactId");
    const impactSelection = impactKind && impactId
      ? { kind: impactKind, id: impactId } as const
      : null;
    const requestedStationId = params.get("station");
    const validStationDeepLink =
      (requestedNetwork === "ttc" || requestedNetwork === "regional")
      && requestedStationId !== null
      && /^[a-z0-9_-]{1,80}$/.test(requestedStationId);

    const requestedLineParam = params.get("line") || params.get("lineId");
    const resolvedLineDeepLink = resolveLineDeepLink(requestedLineParam);

    if (impactSelection) {
      // Notification URLs include their category panel as a fallback. A concrete
      // impact should instead take the same focused map path as View on Map, where
      // mobile reserves a real viewport above the selected impact details.
      pushBrowserNavigationEntry();
      selectionBackBehaviorRef.current = "clear";
      selectionRef.current = impactSelection;
      setSelection(impactSelection);
      setMobileInspectorDetent("details-focus");
      setActiveView("map");
      if (panel) {
        nextParams.delete("panel");
        shouldReplaceUrl = true;
      }
    } else if (validStationDeepLink) {
      selectedStationIdRef.current = requestedStationId;
      setSelectedStationId(requestedStationId);
      setStationPanelActivationKey((current) => current + 1);
      setMobileInspectorDetent("details-focus");
      if (!isMobile) {
        setDesktopSidebarCollapsed(false);
      }
      setActiveView("map");
    } else if (resolvedLineDeepLink) {
      if (resolvedLineDeepLink.network !== requestedNetwork) {
        setSelectedNetwork(resolvedLineDeepLink.network);
      }
      if (!isMobile) {
        setDesktopSidebarCollapsed(false);
      }
      openLineImpacts(resolvedLineDeepLink.lineId);
      nextParams.delete("line");
      nextParams.delete("lineId");
      if (panel) nextParams.delete("panel");
      shouldReplaceUrl = true;
    } else if (panel && panelToView[panel]) {
      const targetView = panelToView[panel];
      if (!isMobile) {
        setDesktopSidebarCollapsed(false);
      }
      navigateForward(targetView);
      nextParams.delete("panel");
      shouldReplaceUrl = true;
    }

    if (shouldReplaceUrl) {
      replaceBrowserSearchParams(nextParams);
    }
  }, [isMobile, navigateForward, openAccountDialog, openLineImpacts, pushBrowserNavigationEntry]);

  useEffect(() => {
    let cancelled = false;

    if (!accountState.authenticated) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAccountCommutes([]);
      return () => {
        cancelled = true;
      };
    }

    getSavedCommutes().then((result) => {
      if (!cancelled) {
        setAccountCommutes(result.commutes);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [accountState.authenticated, accountState.user?.id]);

  const refreshSavedStations = useCallback(async () => {
    if (!accountState.authenticated) {
      setSavedStations([]);
      setSavedStationsError(null);
      setSavedStationsLoading(false);
      return;
    }

    setSavedStationsLoading(true);
    const result = await getSavedStations();
    if (result.source === "backend") {
      setSavedStations(result.stations);
      setSavedStationsError(null);
    } else {
      setSavedStationsError(result.message ?? "Saved stations are unavailable.");
    }
    setSavedStationsLoading(false);
  }, [accountState.authenticated]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSavedStations();
  }, [accountState.user?.id, refreshSavedStations]);

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

  const openMyStations = () => {
    if (savedStationNoticeTimerRef.current !== null) {
      window.clearTimeout(savedStationNoticeTimerRef.current);
      savedStationNoticeTimerRef.current = null;
    }
    setSavedStationNotice(null);
    setSelection(null);
    setSelectedStationId(null);
    setCommutePathPreview(null);
    setMyStationsListModeEpoch((e) => e + 1);
    navigateForward("my-stations");
  };

  const openMyCommutes = () => {
    setSelection(null);
    setSelectedStationId(null);
    setCommutePathPreview(null);
    setCommutesActiveTab("saved");
    setCommutesDraft(null);
    clearPersistedCommuteDraft();
    navigateForward("commutes");
  };

  const resetAccountForm = () => {
    setAccountEmail("");
    setAccountPassword("");
    setAccountPasswordConfirmation("");
    setAccountDisplayName("");
    setAccountResetToken("");
    setAccountResetMessage(null);
    setAccountDevResetToken(null);
    setAccountVerificationToken("");
    setAccountVerificationMessage(null);
    setAccountDevVerificationToken(null);
    setAccountError(null);
    setAccountSuccessMessage(null);
  };

  const openAuthChoice = (intent: AccountEntryIntent) => {
    resetAccountForm();
    setAccountEntryIntent(intent);
    openAccountDialog("auth-choice");
  };

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
      setAccountEntryIntent("register");
      openAccountDialog("auth-choice");
      setAccountError(null);
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
  }, [accountState.authenticated, accountState.source, openAccountDialog, pendingSavedStationIds, savedStations, selectedNetwork, setAccountEntryIntent, setAccountError, setSavedStationPending, showSavedStationNotice, stationCatalogs]);

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

  const openEmailAuth = () => {
    setAccountError(null);
    setAccountSuccessMessage(null);
    openAccountDialog(accountEntryIntent);
  };

  const openGoogleLinkDialog = () => {
    resetAccountForm();
    openAccountDialog("link-google");
  };

  const accountDialogTitle = () => {
    switch (accountDialogMode) {
      case "auth-choice":
        return accountEntryIntent === "register" ? "Create Account" : "Sign In";
      case "link-google":
        return "Link Google";
      case "register":
        return "Create Account";
      case "verify-email":
        return "Verify Email";
      case "forgot-password":
        return "Reset password";
      case "reset-password":
        return "Choose new password";
      case "login":
      default:
        return "Sign In";
    }
  };

  const accountDialogAriaLabel = () => {
    switch (accountDialogMode) {
      case "auth-choice":
        return accountEntryIntent === "register" ? "Choose how to create a LineWatchTO account" : "Choose how to sign in to LineWatchTO";
      case "link-google":
        return "Link Google sign-in to LineWatchTO account";
      case "register":
        return "Create LineWatchTO account";
      case "verify-email":
        return "Verify your email for LineWatchTO";
      case "forgot-password":
        return "Reset LineWatchTO password";
      case "reset-password":
        return "Choose a new LineWatchTO password";
      case "login":
      default:
        return "Sign in to LineWatchTO";
    }
  };

  const accountDialogDescription = () => {
    if (accountDialogMode === "auth-choice" && accountEntryIntent === "login") {
      return "Sign in to access your saved stations and commutes, notification settings, and disruption impacts.";
    }
    if (accountDialogMode === "verify-email") {
      return "Email verification protects account-owned commutes, stations, and notification settings.";
    }
    return "Create a free account to save stations and commutes, get push notifications, and track disruption impacts. All features are free.";
  };

  const handleSubmitAccount = async () => {
    if (!accountDialogMode) return;

    if (accountDialogMode === "auth-choice") {
      return;
    }

    if (accountDialogMode === "link-google") {
      return;
    }
    if (accountDialogMode === "verify-email") {
      if (accountVerificationToken.trim()) {
        await handleConfirmEmailVerification();
      } else {
        await handleRequestEmailVerification();
      }
      return;
    }
    if (accountDialogMode === "forgot-password") {
      handleRequestPasswordReset();
      return;
    }
    if (accountDialogMode === "reset-password") {
      handleConfirmPasswordReset();
      return;
    }
    if (accountDialogMode !== "login" && accountDialogMode !== "register") {
      return;
    }

    const validation = accountDialogMode === "register"
      ? validateAccountEmail(accountEmail)
      : validateAccountCredentials({
          mode: "login",
          email: accountEmail,
          password: accountPassword,
        });

    if (!validation.valid) {
      setAccountError(validation.message);
      return;
    }

    setAccountBusy(true);
    setAccountError(null);
    setAccountSuccessMessage(null);
    try {
      const normalizedEmail = validation.normalizedEmail;
      if (accountDialogMode === "login") {
        const response = await loginAccount({ email: normalizedEmail, password: accountPassword });
        setAccountState({ source: "backend", authenticated: response.authenticated, user: response.user });
        closeAccountDialog();
        resetAccountForm();
      } else {
        const response = await registerAccount({
          email: normalizedEmail,
          displayName: accountDisplayName.trim(),
        });
        setAccountEmail(normalizedEmail);
        setAccountPassword("");
        setAccountPasswordConfirmation("");
        setAccountVerificationMessage(response.message);
        setAccountDevVerificationToken(response.devVerificationToken ?? null);
        setAccountVerificationToken(response.devVerificationToken ?? "");
        openAccountDialog("verify-email");
      }
    } catch (error) {
      if (error instanceof AccountRequestError) {
        if (accountDialogMode === "login" && error.errorCode === "email_not_verified") {
          setAccountVerificationMessage(error.message);
          setAccountDevVerificationToken(null);
          setAccountVerificationToken("");
          openAccountDialog("verify-email");
        } else {
          setAccountError(error.message);
        }
      } else {
        setAccountError(accountDialogMode === "login" ? "Incorrect Email or Password." : "Could not create that account.");
      }
    } finally {
      setAccountBusy(false);
    }
  };

  const handleRequestPasswordReset = async () => {
    const normalizedEmail = normalizeAccountEmail(accountEmail);
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setAccountError("Enter a valid email address.");
      return;
    }

    setAccountBusy(true);
    setAccountError(null);
    setAccountResetMessage(null);
    setAccountDevResetToken(null);
    try {
      const response = await requestPasswordReset({ email: normalizedEmail });
      setAccountEmail(normalizedEmail);
      setAccountResetMessage(response.message);
      setAccountDevResetToken(response.devResetToken ?? null);
    } catch (error) {
      if (error instanceof AccountRequestError) {
        setAccountError(error.message);
      } else {
        setAccountError("Password reset is unavailable.");
      }
    } finally {
      setAccountBusy(false);
    }
  };

  const handleRequestEmailVerification = async () => {
    const normalizedEmail = normalizeAccountEmail(accountEmail);
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setAccountError("Enter a valid email address.");
      return;
    }

    setAccountBusy(true);
    setAccountError(null);
    setAccountSuccessMessage(null);
    try {
      const response = await requestEmailVerification({ email: normalizedEmail });
      setAccountEmail(normalizedEmail);
      setAccountVerificationMessage(response.message);
      setAccountDevVerificationToken(response.devVerificationToken ?? null);
      setAccountVerificationToken(response.devVerificationToken ?? "");
    } catch (error) {
      if (error instanceof AccountRequestError) {
        setAccountError(error.message);
      } else {
        setAccountError("Email verification is unavailable.");
      }
    } finally {
      setAccountBusy(false);
    }
  };

  const handleConfirmEmailVerification = async (rawToken = accountVerificationToken) => {
    const token = rawToken.trim();
    if (!token) {
      setAccountError("Open the verification link from your email or request a new one.");
      return;
    }

    const passwordValidation = validateAccountCredentials({
      mode: "register",
      email: accountEmail || "verification@example.com",
      password: accountPassword,
    });
    if (!passwordValidation.valid && passwordValidation.message !== "Enter a valid email address.") {
      setAccountError(passwordValidation.message);
      return;
    }
    if (accountPassword !== accountPasswordConfirmation) {
      setAccountError("Passwords do not match.");
      return;
    }

    setAccountBusy(true);
    setAccountError(null);
    try {
      const response = await confirmEmailVerification({ token, password: accountPassword });
      setAccountState({ source: "backend", authenticated: response.authenticated, user: response.user });
      setAccountVerificationToken("");
      setAccountDevVerificationToken(null);
      setAccountVerificationMessage(null);
      setAccountSuccessMessage("Email verified. You are now signed in.");
      router.replace("/");
    } catch (error) {
      if (error instanceof AccountRequestError) {
        setAccountError(error.message);
      } else {
        setAccountError("Could not verify that email.");
      }
    } finally {
      setAccountBusy(false);
    }
  };

  const handleConfirmPasswordReset = async () => {
    if (!accountResetToken.trim()) {
      setAccountError("Enter the reset token.");
      return;
    }
    const validation = validateAccountCredentials({
      mode: "register",
      email: accountEmail || "reset@example.com",
      password: accountPassword,
    });
    if (!validation.valid && validation.message !== "Enter a valid email address.") {
      setAccountError(validation.message);
      return;
    }
    if (accountPassword !== accountPasswordConfirmation) {
      setAccountError("Passwords do not match.");
      return;
    }

    setAccountBusy(true);
    setAccountError(null);
    try {
      const response = await confirmPasswordReset({
        token: accountResetToken.trim(),
        password: accountPassword,
      });
      setAccountState({ source: "backend", authenticated: response.authenticated, user: response.user });
      if (typeof window !== "undefined" && window.location.pathname === "/reset-password") {
        accountDialogModeRef.current = null;
        setAccountDialogMode(null);
        resetAccountForm();
        router.replace("/");
      } else {
        closeAccountDialog();
        resetAccountForm();
      }
    } catch (error) {
      if (error instanceof AccountRequestError) {
        setAccountError(error.message);
      } else {
        setAccountError("Could not reset that password.");
      }
    } finally {
      setAccountBusy(false);
    }
  };

  const handleDemoAccount = async () => {
    setAccountBusy(true);
    setAccountError(null);
    try {
      const response = await loginDemoAccount();
      setAccountState({ source: "backend", authenticated: response.authenticated, user: response.user });
      setActiveView("commutes");
    } catch {
      setAccountError("Demo account is unavailable.");
    } finally {
      setAccountBusy(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleGoogleCredential = async (credential: string) => {
    setAccountBusy(true);
    setAccountError(null);
    try {
      const response = await loginWithGoogle({ credential });
      setAccountState({ source: "backend", authenticated: response.authenticated, user: response.user });
      closeAccountDialog();
      resetAccountForm();
      setActiveView("commutes");
    } catch (error) {
      if (error instanceof AccountRequestError) {
        setAccountError(error.message);
      } else {
        setAccountError("Google sign-in is unavailable.");
      }
    } finally {
      setAccountBusy(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleLinkGoogleCredential = async (credential: string) => {
    setAccountBusy(true);
    setAccountError(null);
    setAccountSuccessMessage(null);
    try {
      const response = await linkGoogleAccount({ credential });
      setAccountState({ source: "backend", authenticated: response.authenticated, user: response.user });
      openAccountDialog("link-google");
      setAccountSuccessMessage(GOOGLE_LINK_SUCCESS_MESSAGE);
    } catch (error) {
      if (error instanceof AccountRequestError) {
        setAccountError(error.message);
      } else {
        setAccountError("Could not link Google sign-in.");
      }
    } finally {
      setAccountBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAccountBusy(true);
    try {
      let pushEndpoint: string | null = null;
      try {
        const pushSubscription = pushSettings.supported
          ? await getCurrentPushSubscription(navigator.serviceWorker)
          : null;
        pushEndpoint = pushSubscription?.endpoint ?? null;
      } catch {
        pushEndpoint = null;
      }
      await logoutAccount({ pushEndpoint });
      setAccountState({ source: "backend", authenticated: false, user: null });
      setAccountCommutes([]);
      setSavedStations([]);
      setPendingSavedStationIds(new Set());
      setSavedStationsError(null);
      setCommutePathPreview(null);
    } finally {
      setAccountBusy(false);
    }
  };

  const handleShareLineWatchApp = useCallback(async () => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;

    const shareUrl = `${window.location.origin}/`;
    const shareData: ShareData = {
      title: "LineWatchTO",
      text: "Check TTC subway and LRT service with LineWatchTO.",
      url: shareUrl,
    };

    setShareStatusLabel(null);

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setTemporaryShareStatus("Share opened");
        return;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
      }
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }

      await navigator.clipboard.writeText(shareUrl);
      setTemporaryShareStatus("Link copied");
    } catch {
      setTemporaryShareStatus("Copy unavailable");
    }
  }, [setTemporaryShareStatus]);

  const handleViewCommutePath = (commute: AccountSavedCommute, legId: AccountCommuteLegId = "outbound") => {
    const preview = commutePathPreviewFromCommute(commute, legId);
    if (!preview) return;

    setCommutesFocusedCommuteId(commute.id);
    const commuteNetwork = commute.networkId ?? "ttc";
    if (commuteNetwork !== selectedNetwork) {
      mobileNetworkTransitionRef.current?.cancel();
      mobileNetworkTransitionRef.current = null;
      networkTransitionTargetRef.current = null;
      networkFadeAnimationRef.current?.cancel();
      networkFadeAnimationRef.current = null;
      networkViewTransitionRef.current?.skipTransition();
      networkViewTransitionRef.current = null;
      delete document.documentElement.dataset.networkTransitionPhase;
      delete document.documentElement.dataset.networkTransitionDirection;
      setClosedScreenAcknowledged(true);
      setClosedMapPeek(true);
      setSelectedNetwork(commuteNetwork);
    }
    pushBrowserNavigationEntry();
    commutePathPreviewRef.current = preview;
    setCommutePathPreview(preview);
    setSelection(null);
    setSelectedStationId(null);
    if (isMobile) {
      navigateToMapDrilldown();
    } else if (desktopMetrics.mode === "overlay") {
      setDesktopSidebarCollapsed(true);
      requestAnimationFrame(() => {
        desktopRailToggleRef.current?.focus();
      });
    } else {
      setMapLayoutSignal((prev) => prev + 1);
    }
  };

  const handleViewCommuteImpactOnPath = (
    commute: AccountSavedCommute,
    legId: AccountCommuteLegId,
    impact: AccountMatchedImpact,
  ) => {
    const preview = commutePathPreviewFromCommute(commute, legId);
    if (!preview) return;

    setCommutesFocusedCommuteId(commute.id);
    const commuteNetwork = commute.networkId ?? "ttc";
    const commuteDashboard = commuteNetwork === "regional" ? regionalData : ttcData;
    if (commuteNetwork !== selectedNetwork) {
      mobileNetworkTransitionRef.current?.cancel();
      mobileNetworkTransitionRef.current = null;
      networkTransitionTargetRef.current = null;
      networkFadeAnimationRef.current?.cancel();
      networkFadeAnimationRef.current = null;
      networkViewTransitionRef.current?.skipTransition();
      networkViewTransitionRef.current = null;
      delete document.documentElement.dataset.networkTransitionPhase;
      delete document.documentElement.dataset.networkTransitionDirection;
      setClosedScreenAcknowledged(true);
      setClosedMapPeek(true);
      setSelectedNetwork(commuteNetwork);
    }
    const impactSelection = resolveCommuteImpactMapSelection(
      impact,
      commuteDashboard.activeAlerts,
      commuteNetwork,
    );
    commutePathPreviewRef.current = preview;
    setCommutePathPreview(preview);
    setSelection(impactSelection);
    setSelectedStationId(null);
    setMobileInspectorDetent("details-focus");
    if (isMobile) {
      pushBrowserNavigationEntry();
      navigateToMapDrilldown();
    } else {
      navigateForward(viewForSavedCommuteImpact(
        { ...impact, kind: impactSelection.kind, id: impactSelection.id },
        commuteDashboard.activeAlerts,
      ));
    }
  };

  const handleClearCommutePathPreview = useCallback((commuteIdOrEvent?: string | unknown) => {
    const commuteId = typeof commuteIdOrEvent === "string" ? commuteIdOrEvent : undefined;
    if (commuteId && (!commutePathPreviewRef.current || (commutePathPreviewRef.current.id !== commuteId && commutePathPreviewRef.current.commuteId !== commuteId))) {
      return;
    }
    if (activeViewRef.current === "commutes") {
      commutePathPreviewRef.current = null;
      setCommutePathPreview(null);
      selectionRef.current = null;
      setSelection(null);
      setSelectedStationId(null);
      setAccessibilityOutageTarget(null);
      return;
    }
    if (commutePathPreviewRef.current) {
      setCommutesFocusedCommuteId(commutePathPreviewRef.current.commuteId ?? commutePathPreviewRef.current.id);
    }
    consumeBrowserNavigationEntries();
    setNavDirection("back");
    setIsGoingBack(true);
    if (backTimeoutRef.current) {
      window.clearTimeout(backTimeoutRef.current);
    }
    backTimeoutRef.current = window.setTimeout(() => {
      if (commutePathPreviewRef.current) {
        setCommutesFocusedCommuteId(commutePathPreviewRef.current.commuteId ?? commutePathPreviewRef.current.id);
      }
      commutePathPreviewRef.current = null;
      setCommutePathPreview(null);
      selectionRef.current = null;
      setSelection(null);
      setSelectedStationId(null);
      setAccessibilityOutageTarget(null);
      viewHistoryRef.current = isMobile ? ["more"] : ["status"];
      activeViewRef.current = "commutes";
      setActiveView("commutes");
      setIsGoingBack(false);
    }, reducedMotion ? 0 : 380);
  }, [consumeBrowserNavigationEntries, isMobile, reducedMotion, setActiveView, setCommutePathPreview, setCommutesFocusedCommuteId, setSelection, setSelectedStationId]);

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const stationSearchInputRef = useRef<HTMLInputElement>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const desktopRailToggleRef = useRef<HTMLButtonElement>(null);
  const searchOriginRef = useRef<ActiveView>("status");
  const searchSessionActiveRef = useRef<boolean>(false);
  const suppressSearchReopenRef = useRef<boolean>(false);

  const captureSearchReturnContext = useCallback(() => {
    if (activeView === "search") return;
    if (!searchReturnContextRef.current) {
      const labels: Record<string, string> = {
        status: "Status",
        map: "Status",
      more: "More",
      "my-stations": "My Stations",
      commutes: "My Commutes",
      "source-status": "Source Status",
      alerts: "Active Alerts",
      delays: "Delays",
      closures: "Planned Closures",
      "reduced-speed-zones": "Reduced Speed Zones",
      "alert-history": "Alert History",
      "line-impacts": "Line Impacts",
      "accessibility-outages": "Accessibility",
      "surface-notices": "Service Notices",
      announcements: "Announcements",
      analytics: "Analytics",
      notifications: "Notifications",
      "release-notes": "Release Notes",
      "privacy-acknowledgements": "Privacy",
      feedback: "Feedback",
    };
    const dest = selectedStationId ? "my-stations" : activeView;
    setSearchReturnDestination(dest);
    setSearchReturnLabel(selectedStationId ? "Back to station details" : `Back to ${labels[activeView] ?? "previous page"}`);
    searchReturnContextRef.current = {
      activeView,
      selectedStationId,
      selectedNetwork,
      commutesActiveTab: activeView === "commutes" ? commutesActiveTab : undefined,
      focusedElement: (typeof document !== "undefined" ? (document.activeElement as HTMLElement) : null),
    };
    }
  }, [activeView, commutesActiveTab, selectedNetwork, selectedStationId]);
  const headerSearchBarRef = useRef<HTMLDivElement>(null);
  const stationKeyDownHandlerRef = useRef<((event: KeyboardEvent<HTMLInputElement>) => void) | null>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  type MainMenuActionElement = HTMLButtonElement | HTMLAnchorElement;
  const menuActionRefs = useRef<Array<MainMenuActionElement | null>>([]);

  const registerMenuAction = (index: number) => (element: MainMenuActionElement | null) => {
    // eslint-disable-next-line react-hooks/refs
    menuActionRefs.current[index] = element;
  };

  const focusMenuAction = useCallback((index: number) => {
    const actions = menuActionRefs.current.filter((element): element is MainMenuActionElement =>
      element !== null && (!(element instanceof HTMLButtonElement) || !element.disabled)
    );
    if (actions.length === 0) return;
    const nextIndex = Math.max(0, Math.min(index, actions.length - 1));
    actions[nextIndex]?.focus();
  }, []);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const actions = menuActionRefs.current.filter((element): element is MainMenuActionElement =>
      element !== null && (!(element instanceof HTMLButtonElement) || !element.disabled)
    );
    const currentIndex = actions.findIndex((element) => element === document.activeElement);

    if (event.key === "Escape") {
      event.preventDefault();
      setMenuPinned(false);
      setActiveView("map");
      menuButtonRef.current?.focus();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusMenuAction(currentIndex < 0 ? 0 : (currentIndex + 1) % actions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusMenuAction(currentIndex < 0 ? actions.length - 1 : (currentIndex - 1 + actions.length) % actions.length);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      focusMenuAction(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      focusMenuAction(actions.length - 1);
    }
  };

  useEffect(() => {
    if (activeView === "menu") {
      if (viewScrollPositionsRef.current.menu !== undefined) return;
      const timer = window.setTimeout(() => focusMenuAction(0), 40);
      return () => window.clearTimeout(timer);
    }
  }, [activeView, focusMenuAction]);

  useEffect(() => {
    if (reducedMotionOverride) return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    Promise.resolve().then(() => setReducedMotion(mediaQuery.matches));
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [reducedMotionOverride]);

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
    if (selectedNetwork === "ttc" && subwayOperatingState.status === "closed" && !closedMapPeek) {
      return;
    }
    if (selectedNetwork === "regional" && regionalRailOperatingState.status === "closed" && !closedMapPeek) {
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
  }, [closedMapPeek, selectedNetwork, subwayOperatingState.status, regionalRailOperatingState.status, fetchAccessibilityOutages, fetchSurfaceNoticesCount, fetchRegionalTripChangeCount, fetchAnnouncementCount]);


  useEffect(() => {
    let cancelled = false;

    if (selectedNetwork === "regional") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAccessibilityOutageState(null);
      setSurfaceNoticeCount(null);
      setRegionalTripChangeCount(null);
      setAnnouncementCount(null);
      fetchAccessibilityOutages();
      fetchSurfaceNoticesCount();
      fetchRegionalTripChangeCount();
      return () => { cancelled = true; };
    }

    getStationSummaries().then((result) => {
      if (!cancelled) {
        setTtcStationSummaries(result.data.stations);
      }
    });

    fetchAccessibilityOutages();
    fetchSurfaceNoticesCount();
    fetchRegionalTripChangeCount();
    fetchAnnouncementCount();

    return () => {
      cancelled = true;
    };
  }, [selectedNetwork, fetchAccessibilityOutages, fetchSurfaceNoticesCount, fetchRegionalTripChangeCount, fetchAnnouncementCount]);

  useEffect(() => {
    let cancelled = false;
    let requestId = 0;

    if (!selectedStationId || selectedNetwork !== "ttc") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisibleStationResult(null);
      setStationLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const fetchStationDetail = (showLoading: boolean) => {
      const activeRequestId = ++requestId;
      if (showLoading) {
        setStationLoading(true);
      }
      getStationDetail(selectedStationId).then((result) => {
        if (!cancelled && activeRequestId === requestId) {
          setVisibleStationResult((current) => preserveStationDetailOnRefresh(current, result));
        }
      }).finally(() => {
        if (!cancelled && activeRequestId === requestId) {
          setStationLoading(false);
        }
      });
    };

    fetchStationDetail(true);

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
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [selectedNetwork, selectedStationId]);

  const handleToggleMenu = () => {
    if (menuPinned) {
      setMenuPinned(false);
      navigateRoot("map");
      return;
    }
    const nextView = activeViewRef.current === "menu" ? "map" : "menu";
    if (activeViewRef.current !== "menu" && activeViewRef.current !== "map") {
      setSelection(null);
      setSelectedStationId(null);
    }
    navigateRoot(nextView);
  };

  const menuVisible = activeView === "menu" || menuPinned;

  const [stationSearchQuery, setStationSearchQuery] = useState("");

  const handleNetworkChange = (network: NetworkId) => {
    if (network === selectedNetwork || networkTransitionTargetRef.current !== null) return;

    networkTransitionTargetRef.current = network;

    const applyNetworkChange = () => {
      const pendingStationSelection = crossNetworkStationSelectionRef.current?.networkId === network
        ? crossNetworkStationSelectionRef.current
        : null;
      crossNetworkStationSelectionRef.current = null;
      setClosedScreenAcknowledged(true);
      setClosedMapPeek(true);
      setIsClosedScreenExiting(false);
      setSelectedNetwork(network);
      setSelection(null);
      setCommutePathPreview(null);
      setSelectedStationId(pendingStationSelection?.stationId ?? null);
      setVisibleStationResult(null);
      setStationSearchQuery("");
      if (!isMobile) {
        announceDesktop(
          network === "regional"
            ? "Switched to GO Transit and UP Express network"
            : "Switched to TTC Subway and LRT network",
        );
        if (
          activeView === "search" ||
          activeView === "my-stations" ||
          activeView === "commutes" ||
          activeView === "more"
        ) {
          // Keep active top-level rail section
        } else {
          setActiveView("status");
        }
      } else {
        setActiveView("map");
      }
      setMapPresentationMode("standard");
      setMobileInspectorDetent(pendingStationSelection ? "details-focus" : "map-focus");
    };
    if (mobilePerformanceMode && !reducedMotion && networkMapSurfaceRef.current) {
      const transition = startMapSurfaceTransition(
        networkMapSurfaceRef.current,
        network === "regional" ? "forward" : "back",
        () => flushSync(applyNetworkChange),
      );
      mobileNetworkTransitionRef.current = transition;
      const finish = () => {
        if (mobileNetworkTransitionRef.current !== transition) return;
        mobileNetworkTransitionRef.current = null;
        networkTransitionTargetRef.current = null;
      };
      void transition.finished.then(finish, finish);
      return;
    }

    const transitionDocument = document as Document & {
      startViewTransition?: (update: () => void) => {
        finished: Promise<void>;
        skipTransition: () => void;
      };
    };

    if (reducedMotion || !transitionDocument.startViewTransition) {
      applyNetworkChange();
      networkTransitionTargetRef.current = null;
      return;
    }

    networkViewTransitionRef.current?.skipTransition();
    document.documentElement.dataset.networkTransitionPhase = "fade-out";

    const startNetworkSlide = () => {
      if (networkTransitionTargetRef.current !== network) return;
      document.documentElement.dataset.networkTransitionDirection =
        network === "regional" ? "forward" : "back";
      const transition = transitionDocument.startViewTransition?.(() => {
        networkFadeAnimationRef.current?.cancel();
        networkFadeAnimationRef.current = null;
        delete document.documentElement.dataset.networkTransitionPhase;
        flushSync(applyNetworkChange);
        networkTransitionTargetRef.current = null;
      });

      if (!transition) {
        networkFadeAnimationRef.current?.cancel();
        networkFadeAnimationRef.current = null;
        delete document.documentElement.dataset.networkTransitionPhase;
        delete document.documentElement.dataset.networkTransitionDirection;
        applyNetworkChange();
        networkTransitionTargetRef.current = null;
        return;
      }

      networkViewTransitionRef.current = transition;
      const finishNetworkTransition = () => {
        if (networkViewTransitionRef.current !== transition) return;
        networkViewTransitionRef.current = null;
        delete document.documentElement.dataset.networkTransitionPhase;
        delete document.documentElement.dataset.networkTransitionDirection;
      };
      void transition.finished.then(finishNetworkTransition, finishNetworkTransition);
    };

    const fadeAnimation = networkMapSurfaceRef.current?.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      {
        duration: 80,
        easing: "cubic-bezier(0.3, 0, 0.7, 1)",
        fill: "forwards",
      },
    );
    networkFadeAnimationRef.current = fadeAnimation ?? null;
    if (!fadeAnimation) {
      startNetworkSlide();
      return;
    }
    void fadeAnimation.finished.then(startNetworkSlide, startNetworkSlide);
  };

  const handleDefaultNetworkChange = (network: NetworkId) => {
    setDefaultNetworkPreference(network);
  };

  const handleCloseSearch = useCallback(() => {
    if (isClosingSearch) return;
    stationSearchInputRef.current?.blur();
    desktopSearchInputRef.current?.blur();
    suppressSearchReopenRef.current = true;
    searchSessionActiveRef.current = false;

    const returnCtx = searchReturnContextRef.current;
    searchReturnContextRef.current = null;

    const destination = !isMobile ? (returnCtx?.activeView || searchOriginRef.current || "status") : "map";
    let stationToRestore = (returnCtx && returnCtx.selectedNetwork === selectedNetwork)
      ? returnCtx.selectedStationId
      : null;

    if (destination === "commutes" && returnCtx?.commutesActiveTab) {
      setCommutesActiveTab(returnCtx.commutesActiveTab);
    }
    if (destination === "commutes" && !accountState.authenticated && accountState.source !== "unavailable") {
      setCommutesActiveTab("saved");
    }
    if (stationToRestore) {
      const currentCatalog = stationCatalogs[selectedNetwork] || [];
      if (!currentCatalog.some((s) => s.id === stationToRestore)) {
        stationToRestore = null;
      }
    }

    const finishClose = () => {
      setIsClosingSearch(false);
      setSearchExpandedLineId(null);
      if (stationToRestore) {
        setSelectedStationId(stationToRestore);
      }
      navigateRoot(destination);
      if (returnCtx?.focusedElement && typeof document !== "undefined" && document.contains(returnCtx.focusedElement)) {
        returnCtx.focusedElement.focus();
      }
    };

    if (reducedMotion) {
      if (searchClosingTimeoutRef.current) {
        window.clearTimeout(searchClosingTimeoutRef.current);
        searchClosingTimeoutRef.current = null;
      }
      finishClose();
      return;
    }
    setIsClosingSearch(true);
    if (searchClosingTimeoutRef.current) {
      window.clearTimeout(searchClosingTimeoutRef.current);
    }
    searchClosingTimeoutRef.current = window.setTimeout(() => {
      finishClose();
      searchClosingTimeoutRef.current = null;
    }, isMobile ? 220 : 200);
  }, [accountState.authenticated, accountState.source, isClosingSearch, isMobile, navigateRoot, reducedMotion, selectedNetwork, stationCatalogs]);

  // Desktop keyboard shortcuts (Escape key navigation)
  useEffect(() => {
    if (isMobile) return;

    const handleDesktopKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;

      // If an active modal dialog is open, let the modal handle its own Escape
      if (document.querySelector("[role='dialog'][aria-modal='true'], [role='alertdialog'][aria-modal='true']")) {
        return;
      }

      // If search query is active or search input is focused / activeView === 'search'
      if (activeView === "search" || document.activeElement === desktopSearchInputRef.current) {
        if (event.defaultPrevented) return;
        event.preventDefault();
        desktopSearchInputRef.current?.blur();
        suppressSearchReopenRef.current = true;
        searchSessionActiveRef.current = false;
        handleCloseSearch();
        return;
      }

      // If a station is selected on desktop
      if (selectedStationId) {
        event.preventDefault();
        closeSelectedStation(selectedStationId);
        return;
      }

      // If map selection is active
      if (selection) {
        event.preventDefault();
        setSelection(null);
        return;
      }

      // If in a subpanel view
      const subviews: ActiveView[] = [
        "alerts",
        "delays",
        "reduced-speed-zones",
        "closures",
        "line-impacts",
        "accessibility-outages",
        "surface-notices",
        "announcements",
        "analytics",
        "alert-history",
        "notifications",
        "feedback",
        "privacy-acknowledgements",
        "release-notes",
      ];
      if (subviews.includes(activeView)) {
        event.preventDefault();
        handleSubmenuBack();
      }
    };

    window.addEventListener("keydown", handleDesktopKeyDown);
    return () => window.removeEventListener("keydown", handleDesktopKeyDown);
  }, [
    isMobile,
    activeView,
    selectedStationId,
    selection,
    handleCloseSearch,
    closeSelectedStation,
    handleSubmenuBack,
  ]);

  const handleOpenSearch = useCallback(() => {
    if (!isMobile) {
      captureSearchReturnContext();
      if (desktopSidebarCollapsed) {
        setDesktopSidebarCollapsed(false);
      }
      setSelectedStationId(null);
      setCommutePathPreview(null);
      setSelection(null);
      window.setTimeout(() => desktopSearchInputRef.current?.focus({ preventScroll: true }), 0);
    } else {
      setSelection(null);
      setSelectedStationId(null);
      setCommutePathPreview(null);
      window.setTimeout(() => stationSearchInputRef.current?.focus({ preventScroll: true }), 0);
    }
    navigateRoot("search");
  }, [captureSearchReturnContext, desktopSidebarCollapsed, isMobile, navigateRoot, setCommutePathPreview, setSelectedStationId, setSelection]);

  // Dismiss search when clicking outside the header bar and the search panel
  useEffect(() => {
    if (activeView !== "search") return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const barEl = headerSearchBarRef.current;
      const panelEl = document.getElementById("station-search-panel");
      const sidebarEl = document.getElementById("desktop-sidebar-container");
      const railEl = document.querySelector(".desktop-nav-rail");

      if (barEl?.contains(target)) return;
      if (panelEl?.contains(target)) return;
      if (sidebarEl?.contains(target)) return;
      if (railEl?.contains(target)) return;
      if (target instanceof Element && target.closest(".mobile-bottom-nav, .mobile-app-topbar")) return;

      handleCloseSearch();
    };

    // Use a rAF so the opening click itself doesn't immediately dismiss
    const raf = requestAnimationFrame(() => {
      document.addEventListener("pointerdown", handleClickOutside);
    });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointerdown", handleClickOutside);
    };
  }, [activeView, handleCloseSearch]);

  const handleSelectStationId = useCallback((id: string | null) => {
    const currentId = selectedStationIdRef.current;
    if (id && !currentId) {
      pushBrowserNavigationEntry();
    } else if (!id && currentId) {
      consumeBrowserNavigationEntries();
    }
    selectedStationIdRef.current = id;
    stationDrilldownOriginRef.current = null;
    if (id) {
      setStationSheetRatio(readStoredSheetHeightRatio(typeof window !== "undefined" ? window.localStorage : null));
      setStationPanelActivationKey((current) => current + 1);
    }
    setSelectedStationId(id);
    setSelection(null);
    setCommutePathPreview(null);
    if (id) {
      if (!isMobile && desktopSidebarCollapsed) {
        setDesktopSidebarCollapsed(false);
      }
      if (!isMobile) {
        announceDesktop("Station details opened");
      }
      recordPwaInstallEngagement();
      if (isMobile) {
        setMobileInspectorDetent("details-focus");
      }
      navigateToMapDrilldown();
    }
  }, [consumeBrowserNavigationEntries, navigateToMapDrilldown, pushBrowserNavigationEntry, setSelectedStationId, setSelection, setCommutePathPreview, setMobileInspectorDetent, isMobile, recordPwaInstallEngagement, desktopSidebarCollapsed, announceDesktop]);


  const openMobileShortcut = (view: ActiveView, noticeContent?: "notices" | "trip-changes") => {
    setSelection(null);
    setSelectedStationId(null);
    setCommutePathPreview(null);
    setImpactListLaunch((current) => ({ lineId: null, requestId: current.requestId + 1 }));
    if (noticeContent) {
      setSurfaceNoticeInitialQuery("");
      setSurfaceNoticeInitialContent(noticeContent);
    }
    navigateRoot(view);
  };

  const mobileNavKey = useMemo<MobileNavKey>(() => {
    if (activeView === "status" || activeView === "line-impacts" || activeView === "alerts" || activeView === "delays" || activeView === "reduced-speed-zones" || activeView === "closures") {
      return "status";
    }
    if (activeView === "search") return "map";
    if (activeView === "commutes" || activeView === "my-stations") return "saved";
    if (activeView === "accessibility-outages" || activeView === "surface-notices") return "status";
    if (activeView === "notifications" || activeView === "more" || activeView === "analytics" || activeView === "alert-history" || activeView === "announcements" || activeView === "feedback" || activeView === "privacy-acknowledgements" || activeView === "release-notes") return "more";
    return "map";
  }, [activeView]);

  const onMobileNavSelect = useCallback((key: MobileNavKey) => {
    setSelection(null);
    setSelectedStationId(null);
    setCommutePathPreview(null);
    setMobileInspectorDetent("map-focus");
    setMapPresentationMode("standard");
    recordPwaInstallEngagement();
    switch (key) {
      case "status":
        navigateRoot("status");
        return;
      case "saved":
        navigateRoot(lastSavedViewRef.current);
        return;
      case "more":
        navigateRoot("more");
        return;
      case "map":
      default:
        navigateRoot("map");
    }
  }, [navigateRoot, setCommutePathPreview, setMapPresentationMode, setMobileInspectorDetent, setSelectedStationId, setSelection, recordPwaInstallEngagement]);


  const viewForImpactKind = useCallback((kind: ImpactKind): ActiveView => {
    switch (kind) {
      case "suspension":
        return "alerts";
      case "delay":
        return "delays";
      case "reduced-speed-zone":
        return "reduced-speed-zones";
      case "planned-closure":
        return "closures";
    }
  }, []);

  const viewForImpactSelection = useCallback((nextSelection: NonNullable<ImpactSelection>): ActiveView => {
    if (
      nextSelection.kind === "planned-closure" &&
      activeAlerts.some((alert) => alert.id === nextSelection.id)
    ) {
      return "alerts";
    }
    return viewForImpactKind(nextSelection.kind);
  }, [activeAlerts, viewForImpactKind]);

  const handleSearchSelectImpact = useCallback((nextSelection: NonNullable<ImpactSelection>) => {
    if (searchClosingTimeoutRef.current) {
      window.clearTimeout(searchClosingTimeoutRef.current);
      searchClosingTimeoutRef.current = null;
    }
    setIsClosingSearch(false);
    stationSearchInputRef.current?.blur();
    setSelectedStationId(null);
    setCommutePathPreview(null);
    selectionBackBehaviorRef.current = "restore-view";
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
    setMobileInspectorDetent("details-focus");
    navigateForward(viewForImpactSelection(nextSelection));
  }, [navigateForward, setCommutePathPreview, setMobileInspectorDetent, setSelectedStationId, setSelection, viewForImpactSelection]);

  const handleSearchSelectStation = (stationId: string, networkId: NetworkId) => {
    if (searchClosingTimeoutRef.current) {
      window.clearTimeout(searchClosingTimeoutRef.current);
      searchClosingTimeoutRef.current = null;
    }
    setIsClosingSearch(false);
    stationSearchInputRef.current?.blur();
    desktopSearchInputRef.current?.blur();
    suppressSearchReopenRef.current = true;
    searchSessionActiveRef.current = false;
    if (networkId === selectedNetwork) {
      handleSelectStationId(stationId);
      return;
    }

    pushBrowserNavigationEntry();
    navigateToMapDrilldown();
    crossNetworkStationSelectionRef.current = { networkId, stationId };
    recordPwaInstallEngagement();
    handleNetworkChange(networkId);
  };

  const handleSearchOpenImpactCategory = useCallback((kind: ImpactKind) => {
    if (searchClosingTimeoutRef.current) {
      window.clearTimeout(searchClosingTimeoutRef.current);
      searchClosingTimeoutRef.current = null;
    }
    setIsClosingSearch(false);
    stationSearchInputRef.current?.blur();
    desktopSearchInputRef.current?.blur();
    suppressSearchReopenRef.current = true;
    searchSessionActiveRef.current = false;
    setSelectedStationId(null);
    setCommutePathPreview(null);
    setSelection(null);
    navigateForward(viewForImpactKind(kind));
  }, [navigateForward, setCommutePathPreview, setSelectedStationId, setSelection, viewForImpactKind]);

  const handleSearchOpenSurfaceNotice = useCallback((notice: SurfaceNoticeDetail) => {
    if (searchClosingTimeoutRef.current) {
      window.clearTimeout(searchClosingTimeoutRef.current);
      searchClosingTimeoutRef.current = null;
    }
    stationSearchInputRef.current?.blur();
    desktopSearchInputRef.current?.blur();
    suppressSearchReopenRef.current = true;
    searchSessionActiveRef.current = false;
    setIsClosingSearch(false);
    const targetQuery = notice.routeIds[0]
      ?? notice.stops?.[0]?.stopName
      ?? notice.stopIds[0]
      ?? notice.title;
    setSurfaceNoticeInitialQuery(targetQuery);
    setSurfaceNoticeInitialContent("notices");
    navigateForward("surface-notices");
  }, [navigateForward]);

  const openRegionalTripChanges = useCallback(() => {
    setSurfaceNoticeInitialQuery("");
    setSurfaceNoticeInitialContent("trip-changes");
    navigateForward("surface-notices");
  }, [navigateForward]);

  const openServiceNotices = useCallback(() => {
    setSurfaceNoticeInitialQuery("");
    setSurfaceNoticeInitialContent("notices");
    navigateForward("surface-notices");
  }, [navigateForward]);

  const handleMyStationsSelectImpactDetails = useCallback((
    nextSelection: NonNullable<ImpactSelection>,
    networkId: NetworkId,
  ) => {
    const targetDashboard = networkId === "regional" ? regionalData : ttcData;
    if (networkId !== selectedNetwork) {
      setClosedScreenAcknowledged(true);
      setClosedMapPeek(true);
      setSelectedNetwork(networkId);
    }
    setSelectedStationId(null);
    setCommutePathPreview(null);
    selectionBackBehaviorRef.current = "restore-view";
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
    setMobileInspectorDetent("details-focus");
    const targetView = nextSelection.kind === "planned-closure"
      && targetDashboard.activeAlerts.some((alert) => alert.id === nextSelection.id)
      ? "alerts"
      : viewForImpactKind(nextSelection.kind);
    navigateForward(targetView);
  }, [navigateForward, regionalData, selectedNetwork, setCommutePathPreview, setMobileInspectorDetent, setSelectedStationId, setSelection, ttcData, viewForImpactKind]);

  const handleMyStationsSelectAccessibilityOutageDetails = useCallback((
    assetType: AccessibilityOutageTarget["assetType"],
    stationId: string,
    networkId: NetworkId,
  ) => {
    if (networkId !== selectedNetwork) {
      setClosedScreenAcknowledged(true);
      setClosedMapPeek(true);
      setSelectedNetwork(networkId);
    }
    setSelection(null);
    setSelectedStationId(null);
    setCommutePathPreview(null);
    setAccessibilityOutageTarget({ assetType, stationId });
    navigateForward("accessibility-outages");
  }, [navigateForward, selectedNetwork, setCommutePathPreview, setSelectedStationId, setSelection]);

  const handleMyStationsDisruptionExpandedChange = useCallback((stationId: string, expanded: boolean) => {
    setExpandedMyStationDisruptionIds((current) => {
      const next = new Set(current);
      if (expanded) next.add(stationId);
      else next.delete(stationId);
      return next;
    });
  }, []);

  const handleMapSelectImpact = useCallback((nextSelection: ImpactSelection) => {
    setSelectedStationId(null);
    if (!commutePathPreviewRef.current) {
      setCommutePathPreview(null);
    }
    if (!nextSelection) {
      if (selectionRef.current) consumeBrowserNavigationEntries();
      selectionRef.current = null;
      selectionBackBehaviorRef.current = "clear";
      setSelection(null);
      return;
    }
    if (!selectionRef.current) pushBrowserNavigationEntry();
    const currentView = activeViewRef.current;
    const targetView = viewForImpactSelection(nextSelection);
    if (isMobile) {
      selectionBackBehaviorRef.current = currentView === "map" ? "clear" : "restore-view";
    } else if (currentView === targetView) {
      selectionBackBehaviorRef.current = "clear";
    } else {
      selectionBackBehaviorRef.current = "restore-view";
      viewHistoryRef.current = pushViewHistory(viewHistoryRef.current, currentView, targetView);
    }
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
    if (isMobile) {
      recordPwaInstallEngagement();
      setMobileInspectorDetent("details-focus");
      navigateToMapDrilldown();
      return;
    }
    if (desktopSidebarCollapsed) {
      setDesktopSidebarCollapsed(false);
    }
    activeViewRef.current = targetView;
    setActiveView(targetView);
  }, [consumeBrowserNavigationEntries, navigateToMapDrilldown, pushBrowserNavigationEntry, setSelectedStationId, setCommutePathPreview, setMobileInspectorDetent, setSelection, setActiveView, viewForImpactSelection, isMobile, recordPwaInstallEngagement, desktopSidebarCollapsed]);

  const handleStationSelectImpact = useCallback((nextSelection: ImpactSelection) => {
    if (selectedStationIdRef.current) {
      stationDrilldownOriginRef.current = selectedStationIdRef.current;
    }
    handleMapSelectImpact(nextSelection);
  }, [handleMapSelectImpact]);

  const handlePeekClosedMap = () => {
    if (isClosedScreenExiting) return;
    setIsClosedScreenExiting(true);
    setClosedScreenAcknowledged(true);
    setClosedMapPeek(true);
    setActiveView("map");
    setSelection(null);
    setSelectedStationId(null);
    setMapPresentationMode("standard");
  };

  const handleOpenClosedScreen = useCallback(() => {
    if (isExitingPeekChip) return;
    setIsExitingPeekChip(true);
    setTimeout(() => {
      setClosedScreenAcknowledged(false);
      setClosedMapPeek(false);
      setIsExitingPeekChip(false);
    }, 50);
  }, [isExitingPeekChip]);


  const handleToggleTheme = useCallback(() => {
    setIsDark((current) => !current);
  }, [setIsDark]);

  const handleToggleHighContrast = useCallback(() => {
    setHighContrast((current) => !current);
  }, [setHighContrast]);

  const handleToggleReducedMotion = useCallback(() => {
    setReducedMotionOverride(true);
    setReducedMotion((current) => !current);
  }, [setReducedMotion, setReducedMotionOverride]);

  const handleToggleDotBackground = useCallback(() => {
    setDotBackgroundEnabled((current) => !current);
  }, []);

  // Live Train Markers toggle handler
  const handleToggleEstimatedTrains = useCallback(() => {
    setEstimatedTrainsEnabled((current) => !current);
  }, [setEstimatedTrainsEnabled]);

  const handleOpenRotatedMap = useCallback(() => {
    const visualViewport = window.visualViewport;
    const pageZoomed = Math.abs((visualViewport?.scale ?? 1) - 1) > 0.01;
    setRotatedMapViewportFrame({
      width: Math.max(1, Math.round(pageZoomed ? window.innerWidth : visualViewport?.width ?? window.innerWidth)),
      height: Math.max(1, Math.round(pageZoomed ? window.innerHeight : visualViewport?.height ?? window.innerHeight)),
    });
    setMapPresentationMode("rotated-landscape");
    setActiveView("map");
  }, [setActiveView, setMapPresentationMode]);

  const handleOpenRotatedSelectionDetails = useCallback(() => {
    setMapPresentationMode("standard");
    setMobileInspectorDetent("details-focus");
    setActiveView("map");
    window.setTimeout(() => {
      setMapLayoutSignal((current) => current + 1);
    }, 60);
  }, [setActiveView, setMapLayoutSignal, setMobileInspectorDetent, setMapPresentationMode]);

  const handleClearMobileImpactSelection = useCallback(() => {
    if (selectionRef.current) consumeBrowserNavigationEntries();
    selectionRef.current = null;
    selectionBackBehaviorRef.current = "clear";
    setSelection(null);
    setMobileInspectorDetent("map-focus");
  }, [consumeBrowserNavigationEntries, setMobileInspectorDetent, setSelection]);

  const handleClearRotatedSelection = useCallback(() => {
    if (selectionRef.current || selectedStationIdRef.current) consumeBrowserNavigationEntries();
    selectionRef.current = null;
    selectionBackBehaviorRef.current = "clear";
    selectedStationIdRef.current = null;
    setSelection(null);
    setSelectedStationId(null);
    setMobileInspectorDetent("map-focus");
  }, [consumeBrowserNavigationEntries, setMobileInspectorDetent, setSelectedStationId, setSelection]);

  const rotatedMapMode =
    isMobile &&
    mapPresentationMode === "rotated-landscape" &&
    !showClosedScreen;

  const mobileImpactInspectorOpen =
    isMobile &&
    mapPresentationMode === "standard" &&
    activeView === "map" &&
    Boolean(selection) &&
    !selectedStationId &&
    !showClosedScreen;

  const mobileStationInspectorOpen =
    isMobile &&
    mapPresentationMode === "standard" &&
    activeView === "map" &&
    Boolean(selectedStationId) &&
    !showClosedScreen;

  const mobileInspectorOpen = mobileImpactInspectorOpen || mobileStationInspectorOpen;

  const pwaInstallPrompt = usePwaInstallPrompt({
    activeView,
    blockedByOverlay:
      showClosedScreen ||
      rotatedMapMode ||
      mobileInspectorOpen ||
      Boolean(selectedStationId) ||
      Boolean(accountDialogMode) ||
      Boolean(commutePathPreview),
    engagementSignal: pwaEngagementSignal,
    isMobile,
  });

  const showPwaInstallNudge =
    !showClosedScreen &&
    !rotatedMapMode &&
    pwaInstallPrompt.shouldShowNudge;

  const isMobilePanel = isMobile && (
    activeView === "status" ||
    activeView === "line-impacts" ||
    activeView === "alerts" ||
    activeView === "delays" ||
    activeView === "reduced-speed-zones" ||
    activeView === "closures" ||
    activeView === "commutes" ||
    activeView === "my-stations" ||
    activeView === "notifications" ||
    activeView === "more" ||
    activeView === "analytics" ||
    activeView === "accessibility-outages" ||
    activeView === "surface-notices" ||
    activeView === "alert-history" ||
    activeView === "announcements" ||
    activeView === "feedback" ||
    activeView === "privacy-acknowledgements" ||
    activeView === "release-notes"
  );

  const getMobileSheetLabel = () => {
    switch (activeView) {
      case "status": return "Current service status";
      case "line-impacts": return "Line service impacts";
      case "alerts": return "Active alerts";
      case "delays": return "Delays";
      case "reduced-speed-zones": return "Reduced Speed Zones";
      case "closures": return "Planned closures";
      case "commutes": return "My Commutes";
      case "my-stations": return "My Stations";
      case "notifications": return "Notifications";
      case "more": return "More options";
      case "analytics": return "Reliability analytics";
      case "alert-history": return "Alert History";
      case "feedback": return "Leave Feedback";
      case "privacy-acknowledgements": return "Privacy & Acknowledgements";
      case "release-notes": return "What's New";
      case "accessibility-outages": return "Accessibility outages";
      case "surface-notices": return selectedNetwork === "regional" ? "GO / UP Notices" : "Streetcar & Bus Notices";
      case "announcements": return "TTC Announcements";
      default: return "";
    }
  };

  const handleFocusMapFromPanel = useCallback(() => {
    if (isMobile) {
      setActiveView("map");
      return;
    }
    if (desktopMetrics.mode === "overlay") {
      setDesktopSidebarCollapsed(true);
      requestAnimationFrame(() => {
        desktopRailToggleRef.current?.focus();
      });
    }
    setMapLayoutSignal((prev) => prev + 1);
  }, [isMobile, desktopMetrics.mode]);

  const renderPanelContent = () => {
    switch (activeView) {
      case "status":
        return isMobile ? (
          <MobileStatusSheet
            pollText={pollText}
            dataSource={displayData.dataSource}
            networkId={selectedNetwork}
            onOpenCategory={(view, lineId) => {
              if (view === "line-impacts" && lineId) {
                openLineImpacts(lineId);
                return;
              }
              if (
                view === "alerts"
                || view === "delays"
                || view === "reduced-speed-zones"
                || view === "closures"
              ) {
                openImpactCategory(view, lineId);
                return;
              }
              if (view === "trip-changes") {
                openRegionalTripChanges();
                return;
              }
              setSelection(null);
              navigateForward(view);
            }}
            onClose={handleClosePanel}
            accessibilityOutageCount={
              accessibilityOutageResult?.assetTypes.reduce((acc, curr) => acc + curr.count, 0) ?? 0
            }
            surfaceNoticeCount={surfaceNoticeCount ?? 0}
            tripChangeCount={regionalTripChangeCount ?? 0}
          />
        ) : null;
      case "line-impacts":
        return lineImpactLaunch.lineId ? (
          <LineImpactsPanel
            key={`line-impacts-${lineImpactLaunch.lineId}-${lineImpactLaunch.requestId}`}
            lineId={lineImpactLaunch.lineId}
            selection={selection}
            onSelectImpact={handleMapSelectImpact}
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
            onFocusMap={handleFocusMapFromPanel}
          />
        ) : null;
      case "alerts":
        return (
          <ActiveAlertsPanel
            key={`alerts-${impactListLaunch.requestId}`}
            selection={selection}
            onSelectImpact={handleMapSelectImpact}
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
            onFocusMap={handleFocusMapFromPanel}
            initialLineId={impactListLaunch.lineId}
            commutePathPreview={commutePathPreview}
            onClearCommutePathPreview={handleClearCommutePathPreview}
          />
        );
      case "delays":
        return (
          <DelaysPanel
            key={`delays-${impactListLaunch.requestId}`}
            selection={selection}
            onSelectImpact={handleMapSelectImpact}
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
            onFocusMap={handleFocusMapFromPanel}
            initialLineId={impactListLaunch.lineId}
            commutePathPreview={commutePathPreview}
            onClearCommutePathPreview={handleClearCommutePathPreview}
          />
        );
      case "reduced-speed-zones":
        return (
          <ReducedSpeedZonesPanel
            key={`reduced-speed-zones-${impactListLaunch.requestId}`}
            selection={selection}
            onSelectImpact={handleMapSelectImpact}
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
            onFocusMap={handleFocusMapFromPanel}
            initialLineId={impactListLaunch.lineId}
            commutePathPreview={commutePathPreview}
            onClearCommutePathPreview={handleClearCommutePathPreview}
          />
        );
      case "closures":
        return (
          <PlannedClosuresPanel
            key={`closures-${impactListLaunch.requestId}`}
            selection={selection}
            onSelectImpact={handleMapSelectImpact}
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
            onFocusMap={handleFocusMapFromPanel}
            initialLineId={impactListLaunch.lineId}
            commutePathPreview={commutePathPreview}
            onClearCommutePathPreview={handleClearCommutePathPreview}
          />
        );
      case "commutes":
        return (
          <SavedCommutesPanel
            accountState={accountState}
            accountCommutes={accountCommutes}
            setAccountCommutes={setAccountCommutes}
            stationCatalogs={stationCatalogs}
            networkId={selectedNetwork}
            focusedCommuteId={commutesFocusedCommuteId}
            onFocusedCommuteIdChange={setCommutesFocusedCommuteId}
            viewedCommuteId={commutesFocusedCommuteId ?? commutePathPreview?.commuteId ?? commutePathPreview?.id ?? null}
            onViewPath={handleViewCommutePath}
            onViewImpactOnPath={handleViewCommuteImpactOnPath}
            onClearViewedPath={handleClearCommutePathPreview}
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
            onRequestSignIn={() => openAuthChoice("login")}
            onRequestCreateAccount={() => openAuthChoice("register")}
            onOpenNotificationSettings={() => navigateForward("notifications")}
            notificationSummary={notificationSummary}
            activeView={commutesActiveTab}
            onActiveViewChange={setCommutesActiveTab}
            draft={commutesDraft}
            onDraftChange={setCommutesDraft}
            sortBy={commutesSortBy}
            onSortByChange={setCommutesSortBy}
            networkFilter={commutesNetworkFilter}
            onNetworkFilterChange={setCommutesNetworkFilter}
            selectedLegIds={commutesSelectedLegIds}
            onSelectedLegIdsChange={setCommutesSelectedLegIds}
            expandedCommuteId={commutesExpandedCommuteId}
            onExpandedCommuteIdChange={setCommutesExpandedCommuteId}
            expandedImpactDisclosures={commutesExpandedImpactDisclosures}
            onToggleImpactDisclosure={handleCommutesToggleImpactDisclosure}
          />
        );
      case "my-stations":
        return (
          <MyStationsPanel
            accountState={accountState}
            savedStations={savedStations}
            stationCatalogs={stationCatalogs}
            dashboards={{ ttc: connectionOffline || dashboardRequestStates.ttc === "reconnecting" ? snapshotDashboard(ttcData, verifiedAt.ttc, connectionOffline ? "offline" : "reconnecting") : ttcData, regional: connectionOffline || dashboardRequestStates.regional === "reconnecting" ? snapshotDashboard(regionalData, verifiedAt.regional, connectionOffline ? "offline" : "reconnecting") : regionalData }}
            activeNetwork={selectedNetwork}
            loading={savedStationsLoading}
            error={savedStationsError}
            pendingStationIds={pendingSavedStationIds}
            onSave={handleSaveStation}
            onRemove={handleRemoveSavedStation}
            onSelectStation={handleSearchSelectStation}
            onSelectImpactDetails={handleMyStationsSelectImpactDetails}
            onSelectAccessibilityOutageDetails={handleMyStationsSelectAccessibilityOutageDetails}
            expandedDisruptionStationIds={expandedMyStationDisruptionIds}
            onDisruptionExpandedChange={handleMyStationsDisruptionExpandedChange}
            onRetry={() => { void refreshSavedStations(); }}
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
            onRequestSignIn={() => openAuthChoice("login")}
            onRequestCreateAccount={() => openAuthChoice("register")}
            listModeEpoch={myStationsListModeEpoch}
          />
        );
      case "notifications":
        return (
          <NotificationSettingsPanel
            key={selectedNetwork}
            accountState={accountState}
            networkId={selectedNetwork}
            pushSettings={pushSettings}
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
            onRequestSignIn={() => openAuthChoice("login")}
            onRequestCreateAccount={() => openAuthChoice("register")}
          />
        );
      case "accessibility-outages":
        return (
          <AccessibilityOutagesPanel
            accessibilityOutageResult={accessibilityOutageResult}
            networkId={selectedNetwork}
            initialTarget={accessibilityOutageTarget}
            onSelectStation={(stationId) => {
              if (isMobile) {
                handleSelectStationId(stationId);
                return;
              }
              if (!selectedStationIdRef.current) {
                pushBrowserNavigationEntry();
              }
              selectedStationIdRef.current = stationId;
              setSelectedStationId(stationId);
              setMobileInspectorDetent("details-focus");
            }}
            onBack={handleSubmenuBack}
            /* setActiveView(isMobile ? "status" : "menu") */
            onClose={handleClosePanel}
          />
        );
      case "surface-notices":
        return (
          <SurfaceNoticesPanel
            initialQuery={surfaceNoticeInitialQuery}
            initialRegionalContent={surfaceNoticeInitialContent}
            networkId={selectedNetwork}
            onBack={handleSubmenuBack}
            /* setActiveView(isMobile ? "status" : "menu") */
            onClose={handleClosePanel}
          />
        );
      case "announcements":
        return (
          <TtcAnnouncementsPanel
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
          />
        );
      case "more":
        return (
          <MobileMoreSheet
            accountState={accountState}
            accountBusy={accountBusy}
            highContrast={highContrast}
            reducedMotion={reducedMotion}
            dotBackgroundEnabled={dotBackgroundEnabled}
            onClose={handleClosePanel}
            onRequestSignIn={() => openAuthChoice("login")}
            onRequestCreateAccount={() => openAuthChoice("register")}
            onDemoAccount={handleDemoAccount}
            onSignOut={handleSignOut}
            googleSignInAvailable={authConfig.googleSignInAvailable}
            onLinkGoogleAccount={openGoogleLinkDialog}
            onToggleHighContrast={handleToggleHighContrast}
            onToggleReducedMotion={handleToggleReducedMotion}
            onToggleDotBackground={handleToggleDotBackground}
            onOpenNotifications={() => navigateForward("notifications")}
            onOpenCommutes={() => navigateForward("commutes")}
            commuteClearCount={commuteClearCount}
            commuteAffectedCount={commuteAffectedCount}
            onOpenMyStations={() => navigateForward("my-stations")}
            savedStationCount={savedStations.length}
            savedStationClearCount={savedStationsClearCount}
            savedStationAffectedCount={savedStationsAffectedCount}
            defaultNetwork={defaultNetworkPreference}
            currentNetwork={selectedNetwork}
            onDefaultNetworkChange={handleDefaultNetworkChange}
            onOpenAnalytics={() => navigateForward("analytics")}
            onOpenAlertHistory={() => navigateForward("alert-history")}
            onOpenAnnouncements={() => navigateForward("announcements")}
            onOpenFeedback={() => navigateForward("feedback")}
            supportUrl={supportUrl}
            onOpenPrivacyAcknowledgements={() => navigateForward("privacy-acknowledgements")}
            onOpenReleaseNotes={() => navigateForward("release-notes")}
            onShareApp={handleShareLineWatchApp}
            shareStatusLabel={shareStatusLabel}
            notificationStatusLabel={notificationStatusLabel}
            canOfferPwaInstall={pwaInstallPrompt.canOfferInstall}
            canShowPwaInstallHelp={pwaInstallPrompt.canShowInstallHelp}
            onRequestPwaInstall={pwaInstallPrompt.requestInstall}
            pwaInstallBusy={pwaInstallPrompt.installing}
            pwaInstallPlatform={pwaInstallPrompt.platform}
          />
        );
      case "feedback":
        return (
          <FeedbackPanel
            dataSource={displayData.dataSource}
            supportUrl={supportUrl}
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
          />
        );
      case "privacy-acknowledgements":
        return (
          <PrivacyAcknowledgementsPanel
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
          />
        );
      case "release-notes":
        return (
          <ReleaseNotesPanel
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
          />
        );
      case "analytics":
        return (
          <ReliabilityPanel
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
          />
        );
      case "alert-history":
        return (
          <AlertHistoryPanel
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
            network={selectedNetwork}
          />
        );
      case "source-status":
        return (
          <div className="panel desktop-source-status-panel" aria-label={selectedNetwork === "regional" ? "GO / UP Source Status" : "TTC Source Status"}>
            <PanelHeader
              title={selectedNetwork === "regional" ? "GO / UP Source Status" : "TTC Source Status"}
              titleCompact
              icon={<Activity className={`w-5 h-5 shrink-0 ${selectedNetwork === "regional" ? "text-emerald-500" : "text-red-500 dark:text-red-400"}`} aria-hidden="true" />}
              onBack={handleSubmenuBack}
              onClose={handleClosePanel}
              actions={<SourceStatusRefreshButton network={selectedNetwork} />}
            />
            <div className="desktop-source-status-content">
              <SourceDiagnosticsBody network={selectedNetwork} />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const handleToggleDesktopSidebar = useCallback(() => {
    setDesktopSidebarCollapsed((prev) => !prev);
  }, []);

  const prevSidebarCollapsedRef = useRef(desktopSidebarCollapsed);
  useEffect(() => {
    if (isMobile) return;
    if (prevSidebarCollapsedRef.current !== desktopSidebarCollapsed) {
      prevSidebarCollapsedRef.current = desktopSidebarCollapsed;
      announceDesktop(desktopSidebarCollapsed ? "Sidebar collapsed" : "Sidebar expanded");
    }
  }, [desktopSidebarCollapsed, isMobile, announceDesktop]);

  const handleSelectRailDestination = useCallback((dest: DesktopRailDestination) => {
    if (desktopSidebarCollapsed) {
      setDesktopSidebarCollapsed(false);
      announceDesktop("Sidebar expanded");
    }
    setSelection(null);
    setSelectedStationId(null);
    setCommutePathPreview(null);
    searchReturnContextRef.current = null;
    switch (dest) {
      case "status":
        navigateRoot("status");
        announceDesktop("System status overview");
        return;
      case "alerts":
      case "delays":
      case "reduced-speed-zones":
      case "closures":
        setImpactListLaunch((current) => ({ lineId: null, requestId: current.requestId + 1 }));
        navigateRoot(dest);
        announceDesktop(
          dest === "alerts"
            ? "Active Alerts"
            : dest === "delays"
              ? "Delays"
              : dest === "reduced-speed-zones"
                ? "Reduced Speed Zones"
                : "Planned Closures",
        );
        return;
      case "trip-changes":
        setSurfaceNoticeInitialQuery("");
        setSurfaceNoticeInitialContent("trip-changes");
        navigateRoot("surface-notices");
        announceDesktop("Trip Changes");
        return;
      case "stations":
        navigateRoot("my-stations");
        announceDesktop("My Stations");
        return;
      case "commutes":
        navigateRoot("commutes");
        announceDesktop("My Commutes");
        return;
      case "alert-history":
        navigateRoot("alert-history");
        announceDesktop("Alert History");
        return;
      case "more":
        navigateRoot("more");
        announceDesktop("More options and settings");
        return;
      case "source-status":
        navigateRoot("source-status");
        announceDesktop("Source Status");
        return;
      case "analytics":
        navigateRoot("analytics");
        announceDesktop("Reliability Analytics");
        return;
    }
  }, [desktopSidebarCollapsed, navigateRoot, setCommutePathPreview, setSelectedStationId, setSelection, announceDesktop]);

  type DesktopNotice =
    | {
        kind: "connection";
        message: string;
        snapshot?: boolean;
        showSpinner?: boolean;
      }
    | {
        kind: "closing-soon" | "closed";
        title: string;
        details?: string;
        action?: () => void;
      };

  const desktopNotice: DesktopNotice | null = useMemo(() => {
    if (showClosedScreen) {
      return null;
    }

    // Priority 1: Connection notice
    if (displayData.snapshot) {
      return {
        kind: "connection",
        message: snapshotNotice(displayData.snapshot, snapshotClock),
        snapshot: true,
        showSpinner: !connectionOffline,
      };
    }
    if (dashboardRequestState === "reconnecting") {
      return {
        kind: "connection",
        message: "Connection issue — Showing cached snapshot",
        showSpinner: true,
      };
    }
    if (displayData.availability === "degraded") {
      return {
        kind: "connection",
        message: "Source refresh issue — Showing last successful update",
        showSpinner: false,
      };
    }
    if (displayData.availability === "unavailable") {
      return {
        kind: "connection",
        message: "Service unavailable — Showing fallback data",
        showSpinner: false,
      };
    }

    // Priority 2: Operating notice
    if (selectedNetwork === "ttc") {
      if (subwayOperatingState.status === "closed") {
        return {
          kind: "closed",
          title: "Subway Closed",
          details: `Resumes ${(subwayOperatingState.nextResumeLabel ?? "")
            .replace(/^(Today|Tomorrow)/, (day) => day.toLowerCase())
            .replace(/\.$/, "")}.`,
          action: handleOpenClosedScreen,
        };
      }
    }
    if (
      selectedNetwork === "ttc" && subwayOperatingState.closingSoon &&
      subwayOperatingState.minutesUntilClose !== null &&
      subwayOperatingState.nextCloseLabel
    ) {
      const durationText = formatResumeDuration(subwayOperatingState.minutesUntilClose);
      const timeText = subwayOperatingState.nextCloseLabel.replace(/^(Today|Tomorrow) /, "");
      return {
        kind: "closing-soon",
        title: "Subway Closing Soon",
        details: `Closes in ${durationText} · ${timeText}`,
      };
    }
    if (selectedNetwork === "regional") {
      if (regionalRailOperatingState.status === "closed") {
        return {
          kind: "closed",
          title: "GO & UP Rail Closed",
          details: `Trains return ${(regionalRailOperatingState.nextResumeLabel ?? "")
            .replace(/^(Today|Tomorrow)/, (day) => day.toLowerCase())
            .replace(/\.$/, "")}.`,
          action: handleOpenClosedScreen,
        };
      }
    }
    if (
      selectedNetwork === "regional" && regionalRailOperatingState.closingSoon &&
      regionalRailOperatingState.minutesUntilClose !== null &&
      regionalRailOperatingState.nextCloseLabel
    ) {
      const durationText = formatResumeDuration(regionalRailOperatingState.minutesUntilClose);
      const timeText = regionalRailOperatingState.nextCloseLabel.replace(/^(Today|Tomorrow) /, "");
      const formattedTime = timeText.startsWith("at ") ? timeText : `at ${timeText}`;
      return {
        kind: "closing-soon",
        title: "GO & UP Closing Soon",
        details: `Broad close ${formattedTime} (${durationText})`,
      };
    }

    return null;
  }, [
    showClosedScreen,
    displayData.snapshot,
    displayData.availability,
    snapshotClock,
    connectionOffline,
    dashboardRequestState,
    selectedNetwork,
    subwayOperatingState.status,
    subwayOperatingState.closingSoon,
    subwayOperatingState.minutesUntilClose,
    subwayOperatingState.nextCloseLabel,
    subwayOperatingState.nextResumeLabel,
    regionalRailOperatingState.status,
    regionalRailOperatingState.closingSoon,
    regionalRailOperatingState.minutesUntilClose,
    regionalRailOperatingState.nextCloseLabel,
    regionalRailOperatingState.nextResumeLabel,
    handleOpenClosedScreen,
  ]);

  const renderDesktopNoticeBanner = (notice: DesktopNotice) => {
    if (notice.kind === "connection") {
      return (
        <div
          className="mobile-service-sheet-notice-row mobile-service-sheet-notice-row--connection"
          data-snapshot={notice.snapshot ? "true" : undefined}
          role="status"
          aria-live="polite"
          onClick={(e) => e.stopPropagation()}
          aria-label={notice.message}
        >
          <AlertTriangle size={13} className="dashboard-availability-notice-icon shrink-0" aria-hidden="true" />
          <span className="mobile-service-sheet-notice-message">{notice.message}</span>
          {notice.showSpinner !== false && (
            <Loader2 size={12} className="dashboard-availability-notice-spinner shrink-0" aria-hidden="true" />
          )}
        </div>
      );
    }

    if (notice.action) {
      return (
        <div
          role="status"
          aria-live="polite"
          className={`mobile-service-sheet-notice-row mobile-service-sheet-notice-row--${notice.kind}`}
          onClick={(e) => {
            e.stopPropagation();
            notice.action?.();
          }}
          style={{ cursor: "pointer" }}
        >
          <span className="mobile-service-sheet-notice-left">
            <span className="mobile-service-sheet-notice-icon shrink-0" aria-hidden="true">
              {notice.kind === "closing-soon" ? (
                <Clock3 size={13} strokeWidth={2.5} />
              ) : (
                <Moon size={13} strokeWidth={1} fill="currentColor" />
              )}
            </span>
            <strong className="mobile-service-sheet-notice-title">{notice.title}</strong>
          </span>
          {notice.details && (
            <span className="mobile-service-sheet-notice-right">
              <span className="mobile-service-sheet-notice-details">{notice.details}</span>
              <ChevronRight size={12} strokeWidth={2.5} className="mobile-service-sheet-notice-chevron" aria-hidden="true" />
            </span>
          )}
          <button
            type="button"
            className="mobile-service-sheet-notice-action"
            onClick={(e) => {
              e.stopPropagation();
              notice.action?.();
            }}
          >
            Closed Screen
          </button>
        </div>
      );
    }

    return (
      <div
        role="status"
        aria-live="polite"
        className={`mobile-service-sheet-notice-row mobile-service-sheet-notice-row--${notice.kind}`}
      >
        <span className="mobile-service-sheet-notice-left">
          <span className="mobile-service-sheet-notice-icon shrink-0" aria-hidden="true">
            <Clock3 size={13} strokeWidth={2.5} />
          </span>
          <strong className="mobile-service-sheet-notice-title">{notice.title}</strong>
        </span>
        {notice.details && (
          <span className="mobile-service-sheet-notice-right">
            <span className="mobile-service-sheet-notice-details">{notice.details}</span>
          </span>
        )}
      </div>
    );
  };

  const renderDesktopSidebarContent = () => {
    const renderDesktopActivePanel = () => {
      if (selectedStationId) {
        if (selectedNetwork === "ttc") {
          return (
            <StationDetailPanel
              key={`${selectedStationId}:${stationPanelActivationKey}`}
              stationResult={visibleStationResult}
              loading={stationLoading}
              updating={stationLoading && Boolean(visibleStationResult?.data)}
              selectedStationName={stationSummaries.find((station) => station.id === selectedStationId)?.name}
              onClose={() => closeSelectedStation(selectedStationId)}
              onSelectImpact={handleStationSelectImpact}
              reducedMotion={reducedMotion}
              authenticated={accountState.authenticated || accountState.source === "unavailable"}
              saved={savedStationIds.has(selectedStationId)}
              savePending={pendingSavedStationIds.has(selectedStationId)}
              onToggleSaved={handleToggleSavedStation}
              onRequestSignIn={() => {
                setAccountEntryIntent("register");
                openAccountDialog("auth-choice");
                setAccountError(null);
              }}
            />
          );
        }
        return (
          <RegionalStationDetailPanel
            key={`${selectedStationId}:${stationPanelActivationKey}`}
            station={stationSummaries.find((station) => station.id === selectedStationId) ?? regionalStationSummaries.stations[0]}
            accessibilityOutages={Array.from(new Map(
              (accessibilityOutageResult?.groups ?? [])
                .flatMap((group) => group.stations)
                .filter((station) => station.stationId === selectedStationId)
                .flatMap((station) => station.outages)
                .map((outage) => [outage.id, outage]),
            ).values())}
            accessibilityFresh={!displayData.snapshot && accessibilityOutageResult?.fresh === true}
            onClose={() => closeSelectedStation(selectedStationId)}
            onSelectImpact={handleStationSelectImpact}
            authenticated={accountState.authenticated || accountState.source === "unavailable"}
            saved={savedStationIds.has(selectedStationId)}
            savePending={pendingSavedStationIds.has(selectedStationId)}
            onToggleSaved={handleToggleSavedStation}
            onRequestSignIn={() => {
              setAccountEntryIntent("register");
              openAccountDialog("auth-choice");
              setAccountError(null);
            }}
          />
        );
      }

      if (activeView === "search") {
        return (
          <StationSearchPanel
            open
            isClosing={isClosingSearch}
            stationCatalogs={stationCatalogs}
            currentNetwork={selectedNetwork}
            selectedStationId={selectedStationId}
            onSelectStation={handleSearchSelectStation}
            onSelectImpact={handleSearchSelectImpact}
            onOpenImpactCategory={handleSearchOpenImpactCategory}
            onClose={handleCloseSearch}
            desktopReturnLabel={searchReturnLabel}
            desktopReturnDestination={searchReturnDestination}
            onDismiss={handleCloseSearch}
            query={stationSearchQuery}
            onQueryChange={setStationSearchQuery}
            expandedLineId={searchExpandedLineId}
            onExpandedLineIdChange={setSearchExpandedLineId}
            inputRef={desktopSearchInputRef}
            keyDownHandlerRef={stationKeyDownHandlerRef}
            isMobile={false}
            externalMobileInput
            authenticated={accountState.authenticated || accountState.source === "unavailable"}
            savedStationKeys={savedStationKeys}
            pendingSavedStationIds={pendingSavedStationIds}
            onToggleSavedStation={handleToggleSavedStation}
            onRequestSignIn={() => {
              setAccountEntryIntent("register");
              openAccountDialog("auth-choice");
              setAccountError(null);
            }}
            savedCommutes={accountCommutes}
            surfaceSearchEnabled
            onOpenDestination={(view) => {
              if (view === "commutes") {
                setCommutesActiveTab("saved");
                setCommutesDraft(null);
                clearPersistedCommuteDraft();
              }
              navigateForward(view);
            }}
            onOpenSavedCommute={() => {
              setCommutesActiveTab("saved");
              setCommutesDraft(null);
              clearPersistedCommuteDraft();
              navigateForward("commutes");
            }}
            onOpenSurfaceNotice={handleSearchOpenSurfaceNotice}
          />
        );
      }

      if (activeView === "status" || activeView === "map") {
        return (
          <DesktopStatusOverview
            pollText={pollText}
            dataSource={displayData.dataSource}
            networkId={selectedNetwork}
            snapshot={displayData.snapshot}
            accessibilityOutageCount={
              accessibilityOutageResult?.assetTypes.reduce((acc, curr) => acc + curr.count, 0) ?? 0
            }
            surfaceNoticeCount={surfaceNoticeCount ?? 0}
            tripChangeCount={regionalTripChangeCount ?? 0}
            surfaceNotices={!displayData.snapshot && currentServiceNotices?.networkId === selectedNetwork ? currentServiceNotices.data : null}
            operatingState={selectedNetwork === "ttc" ? subwayOperatingState : regionalRailOperatingState}
            notice={!desktopSidebarCollapsed && desktopNotice ? renderDesktopNoticeBanner(desktopNotice) : null}
            onOpenCategory={(view, lineId) => {
              if (view === "line-impacts" && lineId) {
                openLineImpacts(lineId);
                return;
              }
              if (
                view === "alerts"
                || view === "delays"
                || view === "reduced-speed-zones"
                || view === "closures"
              ) {
                openImpactCategory(view, lineId);
                return;
              }
              if (view === "trip-changes") {
                openRegionalTripChanges();
                return;
              }
              setSelection(null);
              navigateForward(view);
            }}
            onSelectImpact={(impactSelection) => {
              handleMapSelectImpact(impactSelection);
            }}
            onSelectSurfaceNotice={handleSearchOpenSurfaceNotice}
          />
        );
      }

      if (activeView === "source-status") {
        return (
          <div className="panel desktop-source-status-panel" aria-label={selectedNetwork === "regional" ? "GO / UP Source Status" : "TTC Source Status"}>
            <PanelHeader
              title={selectedNetwork === "regional" ? "GO / UP Source Status" : "TTC Source Status"}
              titleCompact
              icon={<Activity className={`w-5 h-5 shrink-0 ${selectedNetwork === "regional" ? "text-emerald-500" : "text-red-500 dark:text-red-400"}`} aria-hidden="true" />}
              onBack={handleSubmenuBack}
              onClose={handleClosePanel}
              actions={<SourceStatusRefreshButton network={selectedNetwork} />}
            />
            <div className="desktop-source-status-content">
              <SourceDiagnosticsBody network={selectedNetwork} />
            </div>
          </div>
        );
      }

      if (activeView === "more") {
        return (
          <DesktopMorePanel
            accountState={accountState}
            accountBusy={accountBusy}
            highContrast={highContrast}
            reducedMotion={reducedMotion}
            dotBackgroundEnabled={dotBackgroundEnabled}
            isDark={isDark}
            defaultNetwork={defaultNetworkPreference}
            currentNetwork={selectedNetwork}
            shareStatusLabel={shareStatusLabel}
            onToggleTheme={handleToggleTheme}
            onRequestSignIn={() => openAuthChoice("login")}
            onRequestCreateAccount={() => openAuthChoice("register")}
            onDemoAccount={handleDemoAccount}
            onSignOut={handleSignOut}
            onToggleHighContrast={handleToggleHighContrast}
            onToggleReducedMotion={handleToggleReducedMotion}
            onToggleDotBackground={handleToggleDotBackground}
            onDefaultNetworkChange={handleDefaultNetworkChange}
            onOpenAnalytics={() => navigateForward("analytics")}
            onOpenAlertHistory={() => navigateForward("alert-history")}
            onOpenAnnouncements={() => navigateForward("announcements")}
            onOpenAccessibilityOutages={() => navigateForward("accessibility-outages")}
            onOpenSurfaceNotices={() => navigateForward("surface-notices")}
            onOpenFeedback={() => navigateForward("feedback")}
            onOpenPrivacyAcknowledgements={() => navigateForward("privacy-acknowledgements")}
            onOpenReleaseNotes={() => navigateForward("release-notes")}
            onOpenGuide={() => setGuideOpen(true)}
            onShareApp={handleShareLineWatchApp}
          />
        );
      }

      return renderPanelContent();
    };

    const desktopKey = selectedStationId ? `station-${selectedStationId}` : (activeView === "map" ? "status" : activeView);

    return (
      <div key={desktopKey} className="desktop-view-content-wrapper" data-active-view={activeView} data-nav-direction={navDirection}>
        {renderDesktopActivePanel()}
      </div>
    );
  };

  const isDesktopPanel = activeView !== "map" && activeView !== "search" && activeView !== "menu" && activeView !== "status";
  const showMenuAttention = !menuVisible && !isDesktopPanel;

  const activeFloatingPanel = (!showClosedScreen && (isDesktopPanel || isMobilePanel || isClosingPanel || isGoingBack)) ? (
    isMobilePanel || (isMobile && (isGoingBack || isClosingPanel)) ? (
      <FloatingPanelShell panel="mobile-panel" mobileSheetLabel={getMobileSheetLabel()} navDirection={navDirection} isClosing={isClosingPanel} isGoingBack={isGoingBack}>
        {(activeView === "my-stations" || activeView === "commutes") && (
          <nav className="mobile-saved-sections" aria-label="Saved sections">
            <button
              type="button"
              aria-current={activeView === "my-stations" ? "page" : undefined}
              onClick={() => navigateRoot("my-stations")}
            >
              <MapPin size={17} aria-hidden="true" />
              <span>My Stations</span>
              {savedStationsAffectedCount > 0 ? (
                <span
                  className="mobile-saved-section-badge"
                  data-count="positive"
                  data-single-digit={savedStationsAffectedCount < 10 ? "true" : "false"}
                  aria-label={`${savedStationsAffectedCount} saved station alerts`}
                >
                  {savedStationsAffectedCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              aria-current={activeView === "commutes" ? "page" : undefined}
              onClick={() => navigateRoot("commutes")}
            >
              <Navigation size={17} aria-hidden="true" />
              <span>My Commutes</span>
              {commuteAffectedCount > 0 ? (
                <span
                  className="mobile-saved-section-badge"
                  data-count="positive"
                  data-single-digit={commuteAffectedCount < 10 ? "true" : "false"}
                  aria-label={`${commuteAffectedCount} commute alerts`}
                >
                  {commuteAffectedCount}
                </span>
              ) : null}
            </button>
          </nav>
        )}
        <div key={activeView} className="mobile-view-content-wrapper" data-active-view={activeView} data-nav-direction={navDirection} data-closing={isClosingPanel ? "true" : undefined} data-going-back={isGoingBack ? "true" : undefined}>
          {renderPanelContent()}
        </div>
      </FloatingPanelShell>
    ) : (isMobile && (isDesktopPanel || isGoingBack || isClosingPanel)) ? (
      <FloatingPanelShell key="desktop-panel" panel={activeView} mobileSheetLabel={getMobileSheetLabel()} navDirection={navDirection} isClosing={isClosingPanel} isGoingBack={isGoingBack}>
        <div key={activeView} className="desktop-view-content-wrapper" data-active-view={activeView} data-nav-direction={navDirection} data-closing={isClosingPanel ? "true" : undefined} data-going-back={isGoingBack ? "true" : undefined}>
          {renderPanelContent()}
        </div>
      </FloatingPanelShell>
    ) : null
  ) : null;


  const shellInspectorClasses = [
    mobileInspectorOpen
      ? [
          "mobile-map-inspector",
          mobileImpactInspectorOpen ? "mobile-map-inspector-impact" : "mobile-map-inspector-station",
          `mobile-map-inspector-${mobileInspectorDetent}`,
        ].join(" ")
      : "",
    rotatedMapMode ? "mobile-map-rotated" : "",
  ].filter(Boolean).join(" ");

  const rotatedSelectionVisible = Boolean(selection || selectedStationId);
  const rotatedMapSelectionHudClassName = [
    "rotated-map-selection-hud",
    selectedStationId ? "rotated-map-selection-hud-station-selection" : "",
    selection ? "rotated-map-selection-hud-impact-selection" : "",
  ].filter(Boolean).join(" ");

  useEffect(() => {
    if (!mobileInspectorOpen) return;

    const timer = window.setTimeout(() => {
      setMapLayoutSignal((current) => current + 1);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    mobileInspectorOpen,
    mobileInspectorDetent,
    selection?.kind,
    selection?.id,
    selectedStationId,
  ]);

  const showMobileStatusPeek = !showClosedScreen && !rotatedMapMode && !showPwaInstallNudge && activeView === "map" && !selection && !selectedStationId && !commutePathPreview;

  const [hasLeftMap, setHasLeftMap] = useState(false);
  if (!showMobileStatusPeek && !hasLeftMap) {
    setHasLeftMap(true);
  }

  const mobileOperatingNotice: MobileOperatingNotice | null = useMemo(() => {
    if (selectedNetwork === "ttc") {
      if (subwayOperatingState.status === "closed" && closedMapPeek) {
        return {
          kind: "closed",
          title: "Subway Closed",
          details: `Resumes ${(subwayOperatingState.nextResumeLabel ?? "")
            .replace(/^(Today|Tomorrow)/, (day) => day.toLowerCase())
            .replace(/\.$/, "")}.`,
          action: handleOpenClosedScreen,
        };
      }
      if (
        subwayOperatingState.closingSoon &&
        subwayOperatingState.minutesUntilClose !== null &&
        subwayOperatingState.nextCloseLabel
      ) {
        const durationText = formatResumeDuration(subwayOperatingState.minutesUntilClose);
        const timeText = subwayOperatingState.nextCloseLabel.replace(/^(Today|Tomorrow) /, "");
        return {
          kind: "closing-soon",
          title: "Subway Closing Soon",
          details: `Closes in ${durationText} · ${timeText}`,
        };
      }
    } else if (selectedNetwork === "regional") {
      if (regionalRailOperatingState.status === "closed" && closedMapPeek) {
        return {
          kind: "closed",
          title: "GO & UP Rail Closed",
          details: `Trains return ${(regionalRailOperatingState.nextResumeLabel ?? "")
            .replace(/^(Today|Tomorrow)/, (day) => day.toLowerCase())
            .replace(/\.$/, "")}.`,
          action: handleOpenClosedScreen,
        };
      }
      if (
        regionalRailOperatingState.closingSoon &&
        regionalRailOperatingState.minutesUntilClose !== null &&
        regionalRailOperatingState.nextCloseLabel
      ) {
        const durationText = formatResumeDuration(regionalRailOperatingState.minutesUntilClose);
        const timeText = regionalRailOperatingState.nextCloseLabel.replace(/^(Today|Tomorrow) /, "");
        const formattedTime = timeText.startsWith("at ") ? timeText : `at ${timeText}`;
        return {
          kind: "closing-soon",
          title: "GO & UP Closing Soon",
          details: `Broad close ${formattedTime} (${durationText})`,
        };
      }
    }
    return null;
  }, [
    selectedNetwork,
    subwayOperatingState.status,
    subwayOperatingState.closingSoon,
    subwayOperatingState.minutesUntilClose,
    subwayOperatingState.nextCloseLabel,
    subwayOperatingState.nextResumeLabel,
    regionalRailOperatingState.status,
    regionalRailOperatingState.closingSoon,
    regionalRailOperatingState.minutesUntilClose,
    regionalRailOperatingState.nextCloseLabel,
    regionalRailOperatingState.nextResumeLabel,
    closedMapPeek,
    handleOpenClosedScreen,
  ]);

  const mobileConnectionNotice: MobileConnectionNotice | null = useMemo(() => {
    if (displayData.snapshot) return { snapshot: true, hasSavedSnapshot: displayData.snapshot.savedAt !== null, message: snapshotNotice(displayData.snapshot, snapshotClock), showSpinner: !connectionOffline };
    if (dashboardRequestState === "reconnecting") {
      return {
        message: "Connection issue — Showing cached snapshot",
        showSpinner: true,
      };
    }
    if (displayData.availability === "degraded") {
      return {
        message: "Source refresh issue — Showing last successful update",
        showSpinner: false,
      };
    }
    if (displayData.availability === "unavailable") {
      return {
        message: "Service unavailable — Showing fallback data",
        showSpinner: false,
      };
    }
    return null;
  }, [dashboardRequestState, displayData.availability, displayData.snapshot, snapshotClock, connectionOffline]);

  const mobileMapPerformanceMode = mobilePerformanceMode || rotatedMapMode;

  const handleMapReady = useCallback(() => {
    setInitialMapReady(true);
    if (networkTransitionTargetRef.current === selectedNetwork) {
      mobileNetworkTransitionRef.current?.mapReady();
    }
  }, [selectedNetwork]);
  const shellViewportStyle = {
    height: rotatedMapMode && rotatedMapViewportFrame
      ? `${rotatedMapViewportFrame.height}px`
      : "var(--visual-viewport-height, 100dvh)",
    width: rotatedMapMode && rotatedMapViewportFrame
      ? `${rotatedMapViewportFrame.width}px`
      : undefined,
    ...(rotatedMapViewportFrame ? {
      "--rotated-map-viewport-width": `${rotatedMapViewportFrame.width}px`,
      "--rotated-map-viewport-height": `${rotatedMapViewportFrame.height}px`,
    } : {}),
    ...(isMobile && selectedStationId ? {
      "--mobile-station-sheet-height": `${Math.round(stationSheetRatio * 100)}dvh`,
    } : {}),
  } as CSSProperties;

  let actionIndex = 0;
  return (
    <DataProvider data={displayData}>
      <div
        style={shellViewportStyle}
        data-active-view={activeView}
        data-network={selectedNetwork}
        data-menu-pinned={menuPinned ? "true" : undefined}
        className={`linewatch-shell relative w-full overflow-hidden transition-colors duration-500 ${(isDark || highContrast) ? (highContrast ? "dark bg-[#000000] text-slate-100" : "dark bg-[#0e1622] text-slate-100") : "bg-slate-50 text-slate-900"} ${highContrast ? "high-contrast" : ""} ${reducedMotion ? "motion-paused" : ""} ${mobileMapPerformanceMode ? "mobile-performance-mode" : ""} ${shellInspectorClasses}`}
      >
        <ScrollOverflowAffordances />
        <h1 className="sr-only">
          {selectedNetwork === "ttc" ? "LineWatchTO TTC subway and LRT reliability dashboard" : "LineWatchTO GO and UP regional rail reliability dashboard"}
        </h1>
        {/* Background */}
        <DynamicBackground reducedMotion={reducedMotion} isDark={isDark || highContrast} disabled={!dotBackgroundEnabled} />

      {isMobile && !showClosedScreen && !rotatedMapMode && (
        <div className="mobile-app-topbar" data-map-chooser-keepout data-searching={activeView === "search" || isClosingSearch} data-closing-search={isClosingSearch ? "true" : undefined}>
          <div className="mobile-app-search" role="search" aria-label="Search LineWatchTO">
            <Image src="/assets/linewatch/logo.svg" width={30} height={30} alt="" className="mobile-app-logo" />
            <input
              ref={stationSearchInputRef}
              type="search"
              aria-label="Station Search"
              aria-controls="station-search-panel"
              placeholder="Search all stations and alerts..."
              value={stationSearchQuery}
              onFocus={handleOpenSearch}
              onChange={(event) => setStationSearchQuery(event.target.value)}
              onKeyDown={(event) => stationKeyDownHandlerRef.current?.(event)}
            />
            {activeView === "search" || isClosingSearch ? (
              <button
                type="button"
                aria-label="Close search"
                onClick={handleCloseSearch}
                disabled={isClosingSearch}
                className={isClosingSearch ? "opacity-50 transition-opacity" : undefined}
              >
                <X size={21} />
              </button>
            ) : (
              <button type="button" className="mobile-app-account" data-authenticated={accountState.authenticated} aria-label="Account" onClick={() => { if (accountState.authenticated) navigateRoot("more"); else openAccountDialog("auth-choice"); }}><UserRound size={22} /></button>
            )}
          </div>
          {activeView !== "search" && !isClosingSearch && (
            <div className="mobile-app-shortcuts">
              <nav className="mobile-app-chip-scroll" aria-label="Dashboard shortcuts">
                <button type="button" aria-current={activeView === "alert-history" ? "page" : undefined} onClick={() => openMobileShortcut("alert-history")}><History className="text-emerald-500" size={16} aria-hidden="true" />Alert History</button>
                <button type="button" aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"} title={isDark ? "Light theme" : "Dark theme"} onClick={handleToggleTheme}>{isDark ? <Sun className="text-yellow-400" size={19} aria-hidden="true" /> : <Moon className="text-purple-500" size={19} aria-hidden="true" />}</button>
                <SiteGuideDropdown onOpenChange={setGuideOpen} variant="chip" />
                <button type="button" onClick={handleOpenRotatedMap}><PhoneRotateLandscapeIcon size={18} />Rotate Map</button>
                <button type="button" aria-current={activeView === "analytics" ? "page" : undefined} onClick={() => openMobileShortcut("analytics")}><BarChart3 className="text-purple-500 dark:text-purple-400" size={16} aria-hidden="true" />Reliability Analytics</button>
                {selectedNetwork === "ttc" && <button type="button" aria-current={activeView === "announcements" ? "page" : undefined} onClick={() => openMobileShortcut("announcements")}><Megaphone className="text-sky-600 dark:text-sky-400" size={16} aria-hidden="true" />TTC Announcements</button>}
                <button type="button" aria-current={activeView === "accessibility-outages" ? "page" : undefined} onClick={() => openMobileShortcut("accessibility-outages")}><Accessibility className="text-sky-600 dark:text-sky-400" size={16} aria-hidden="true" />Accessibility</button>
                <button type="button" onClick={() => openMobileShortcut("surface-notices", "notices")}><FileText className="text-emerald-600 dark:text-emerald-400" size={16} aria-hidden="true" />Service Notices</button>
              </nav>
            </div>
          )}
        </div>
      )}

      {!showClosedScreen && (
      <header
        className="absolute top-0 left-0 w-full p-4 sm:p-5 flex justify-between items-start pointer-events-none"
        style={{ zIndex: guideOpen ? 68 : 40 }}
      >
        {isMobile && (
        <div className="flex items-start gap-3 pointer-events-auto relative">
          <div className="flex flex-col items-center gap-2">
            {/* Menu Toggle Button */}
            <button
              ref={menuButtonRef}
              onClick={handleToggleMenu}
              className={`menu-toggle-btn menu-attention-beam desktop-top-chrome panel relative flex items-center justify-center w-14 h-14 rounded-xl shadow-lg hover:!bg-slate-200 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer`}
              aria-label={totalAlertCount > 0
                ? `Toggle menu, ${totalAlertCount} total ${totalAlertCount === 1 ? "alert" : "alerts"}`
                : "Toggle menu"}
              aria-controls="linewatch-main-menu"
              aria-expanded={menuVisible}
              data-menu-attention={showMenuAttention ? "true" : "false"}
            >
              <div className="relative w-7 h-7 flex items-center justify-center">
                 <Menu
                    className={`absolute text-slate-800 dark:text-white transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${menuVisible ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"}`}
                    size={26}
                 />
                 <X
                    className={`absolute text-slate-800 dark:text-white transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${menuVisible ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"}`}
                    size={26}
                 />
              </div>
              {totalAlertCount > 0 && !menuVisible && (
                <OverlappingCountBadge
                  className="desktop-menu-count-badge absolute -top-2.5 -right-2.5 flex h-[26px] min-w-[26px] items-center justify-center rounded-full bg-red-500 px-1 text-white shadow-md border border-white dark:border-[#12151c]"
                  count={totalAlertCount}
                />
              )}
            </button>

            {/* Desktop Quick-Jump Shortcuts (My Commutes & My Stations) */}
            <div
              className={`desktop-quick-shortcuts hidden md:flex flex-col items-center gap-3.5 transition-all duration-200 ${
                menuVisible || isDesktopPanel || showClosedScreen ? "opacity-0 pointer-events-none -translate-y-2" : "opacity-100 translate-y-0"
              }`}
              role="group"
              aria-label="Saved transit shortcuts"
            >
              <button
                type="button"
                onClick={openMyCommutes}
                className="desktop-quick-action-btn desktop-quick-action-btn--commutes group/quick"
                aria-label={
                  commuteAffectedCount > 0
                    ? `My Commutes, ${commuteAffectedCount} ${commuteAffectedCount === 1 ? "commute affected" : "commutes affected"}`
                    : "My Commutes"
                }
                title="My Commutes"
              >
                <Navigation size={24} className="shrink-0" aria-hidden="true" />
                {commuteAffectedCount > 0 && (
                  <span className="desktop-quick-action-badge desktop-quick-action-badge--alert" aria-hidden="true">
                    {commuteAffectedCount}
                  </span>
                )}
                <span className="desktop-quick-action-tooltip">My Commutes</span>
              </button>

              <button
                type="button"
                onClick={openMyStations}
                className="desktop-quick-action-btn desktop-quick-action-btn--stations group/quick"
                aria-label={
                  savedStationsAffectedCount > 0
                    ? `My Stations, ${savedStationsAffectedCount} ${savedStationsAffectedCount === 1 ? "station affected" : "stations affected"}`
                    : savedStations.length > 0
                      ? `My Stations, ${savedStations.length} ${savedStations.length === 1 ? "saved station" : "saved stations"}`
                      : "My Stations"
                }
                title="My Stations"
              >
                <MapPin size={24} className="shrink-0" aria-hidden="true" />
                {savedStationsAffectedCount > 0 ? (
                  <span className="desktop-quick-action-badge desktop-quick-action-badge--alert" aria-hidden="true">
                    {savedStationsAffectedCount}
                  </span>
                ) : savedStations.length > 0 ? (
                  <span className="desktop-quick-action-badge desktop-quick-action-badge--stations" aria-hidden="true">
                    {savedStations.length}
                  </span>
                ) : null}
                <span className="desktop-quick-action-tooltip">My Stations</span>
              </button>
            </div>
          </div>

          {/* Header station search input — replaces the old static button */}
          <div
            ref={headerSearchBarRef}
            className="header-search-bar desktop-top-chrome panel relative flex items-center gap-2 px-3 h-14 rounded-xl shadow-lg hover:!bg-slate-200 dark:hover:!bg-[#1a1e28] cursor-text outline-none"
            data-active={activeView === "search" ? "true" : undefined}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              if (activeView !== "search") handleOpenSearch();
              if (event.target !== stationSearchInputRef.current) {
                window.setTimeout(() => stationSearchInputRef.current?.focus(), 0);
              }
            }}
            onClick={() => {
              stationSearchInputRef.current?.focus();
              if (activeView !== "search") handleOpenSearch();
            }}
            role="search"
            aria-label="Global LineWatchTO search"
          >
            <Search
              className={`shrink-0 transition-colors duration-200 ${
                activeView === "search" ? "text-blue-500 dark:text-blue-400" : "text-slate-400 dark:text-slate-400"
              }`}
              size={21}
            />
            <input
              ref={isMobile ? undefined : stationSearchInputRef}
              type="search"
              value={stationSearchQuery}
              onChange={(e) => {
                setStationSearchQuery(e.target.value);
                if (activeView !== "search") setActiveView("search");
              }}
              onFocus={() => {
                if (activeView !== "search") handleOpenSearch();
              }}
              onKeyDown={(e) => {
                stationKeyDownHandlerRef.current?.(e);
              }}
              placeholder="Search all stations and alerts..."
              aria-label="Station Search"
              aria-controls="station-search-panel"
              className="header-search-input min-w-0 flex-1 bg-transparent border-none outline-none text-sm font-semibold text-slate-700 dark:text-white placeholder:font-semibold placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:placeholder:text-transparent caret-blue-500"
            />
            {stationSearchQuery && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setStationSearchQuery(""); stationSearchInputRef.current?.focus(); }}
                className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Floating Dropdown Menu */}
          <div
            ref={menuPanelRef}
            id="linewatch-main-menu"
            role="menu"
            onKeyDown={handleMenuKeyDown}
            className={`desktop-top-chrome panel-strong absolute top-[72px] left-0 w-[min(calc(100vw-32px),360px)] max-h-[calc(var(--visual-viewport-height,100dvh)-96px)] overflow-hidden border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl flex flex-col origin-top-left transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${menuVisible ? "opacity-100 scale-100 translate-y-0 pointer-events-auto" : "opacity-0 scale-90 -translate-y-4 pointer-events-none"}`}
            aria-hidden={!menuVisible}
          >
            <div
              className={`linewatch-transit-accent-strip shrink-0${selectedNetwork === "regional" ? " linewatch-transit-accent-strip--regional" : ""}`}
              data-network={selectedNetwork}
              aria-hidden="true"
            >
              {selectedNetwork === "regional" ? (
                <>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </>
              ) : (
                <>
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </>
              )}
            </div>
            <div id="linewatch-main-menu-scroll" className="flex-1 overflow-y-auto stealth-scrollbar flex flex-col">
               {/* Branding */}
                <div className="flex items-center gap-3 p-4 border-b border-black/10 dark:border-white/10 bg-white/40 dark:bg-black/20">
                  <div className="flex items-center justify-center shrink-0 w-8 h-8 rounded-lg shadow-sm border border-black/10 dark:border-white/10 bg-white dark:bg-white/10 p-1">
                     <Image src="/assets/linewatch/logo.svg" alt="LineWatchTO Logo" width={24} height={24} className="drop-shadow-sm" />
                  </div>
                  <strong className="linewatch-wordmark -ml-1 text-slate-900 dark:text-white">LineWatchTO</strong>
                  <div className="ml-auto hidden md:flex items-center gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400/80 dark:text-slate-500/80 drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)] dark:drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)] select-none whitespace-nowrap">
                      Pin Menu
                    </span>
                    <button
                      type="button"
                      onClick={() => setMenuPinned((current) => !current)}
                      className="main-menu-pin flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-blue-500/10 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-300 transition-colors shrink-0"
                      aria-label={menuPinned ? "Unpin main menu" : "Pin main menu open"}
                      aria-pressed={menuPinned}
                      title={menuPinned ? "Unpin main menu" : "Keep main menu open"}
                    >
                      {menuPinned ? <PinOff size={19} /> : <Pin size={19} />}
                    </button>
                  </div>
                </div>

                <div className="account-menu-block flex flex-col px-2 py-2 border-b border-black/10 dark:border-white/10 gap-0.5">
                  <div className="px-3 pt-2 pb-2 select-none">
                    <div className="station-subsection-header flex items-center gap-2">
                      <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
                      <span className="text-[12px] uppercase font-bold text-slate-700 dark:text-slate-300 tracking-wider">Account</span>
                    </div>
                  </div>
                  {accountState.source === "unavailable" ? (
                    <AccountAvailabilityNotice
                      compact
                      knownAccountLabel={accountState.user?.displayName || accountState.user?.email || null}
                    />
                  ) : accountState.authenticated && accountState.user ? (
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2 min-w-0 text-sm text-slate-700 dark:text-slate-200 px-3 py-2">
                        <UserRound size={17} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="min-w-0 truncate font-bold">{accountState.user.displayName || accountState.user.email}</span>
                        {accountState.user.demo ? (
                          <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                            Demo
                          </span>
                        ) : null}
                      </div>
                      <button
                        ref={registerMenuAction(actionIndex++)}
                        role="menuitem"
                        type="button"
                        onClick={handleSignOut}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors w-full"
                        disabled={accountBusy}
                      >
                        <LogOut size={18} className="text-slate-500 dark:text-slate-400" />
                        Sign Out
                      </button>
                      {authConfig.googleSignInAvailable && !accountState.user.demo ? (
                        accountState.user.googleLinked ? (
                          <div className="account-linked-status" aria-label="Google sign-in linked">
                            <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
                            Google Linked
                          </div>
                        ) : (
                          <button
                            ref={registerMenuAction(actionIndex++)}
                            role="menuitem"
                            type="button"
                            onClick={openGoogleLinkDialog}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors w-full"
                            disabled={accountBusy}
                          >
                            <ShieldCheck size={18} className="text-slate-500 dark:text-slate-400" />
                            Link Google
                          </button>
                        )
                      ) : null}
                      <button
                        ref={registerMenuAction(actionIndex++)}
                        role="menuitem"
                        onClick={() => navigateForward("commutes")}
                        aria-current={activeView === "commutes" ? "page" : undefined}
                        className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors w-full"
                      >
                        <div className="flex items-center gap-3">
                          <Navigation size={18} className="text-slate-500 dark:text-slate-400" />
                          My Commutes
                        </div>
                        {accountCommutes.length > 0 && (
                          <div className="flex items-center gap-1.5 shrink-0" data-testid="commute-status-badges">
                            <span
                              className={`desktop-menu-count-badge desktop-menu-count-commutes-clear flex h-6 ${
                                commuteClearCount < 10 ? "w-6" : "min-w-[24px] px-1.5"
                              } items-center justify-center rounded-full text-[11px] font-bold`}
                              aria-label={`${commuteClearCount} clear commutes`}
                            >
                              {commuteClearCount}
                            </span>
                            <span
                              className={`desktop-menu-count-badge desktop-menu-count-commutes-affected flex h-6 ${
                                commuteAffectedCount < 10 ? "w-6" : "min-w-[24px] px-1.5"
                              } items-center justify-center rounded-full text-[11px] font-bold`}
                              aria-label={`${commuteAffectedCount} affected commutes`}
                            >
                              {commuteAffectedCount}
                            </span>
                          </div>
                        )}
                      </button>
                      <button
                        ref={registerMenuAction(actionIndex++)}
                        role="menuitem"
                        onClick={() => navigateForward("my-stations")}
                        aria-current={activeView === "my-stations" ? "page" : undefined}
                        className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors w-full"
                      >
                        <span className="flex items-center gap-3">
                          <MapPin size={18} className="text-slate-500 dark:text-slate-400" />
                          My Stations
                        </span>
                        {savedStations.length > 0 && (
                          <div className="flex items-center gap-1.5 shrink-0" data-testid="station-status-badges">
                            <span
                              className={`desktop-menu-count-badge desktop-menu-count-stations-clear flex h-6 ${
                                savedStationsClearCount < 10 ? "w-6" : "min-w-[24px] px-1.5"
                              } items-center justify-center rounded-full text-[11px] font-bold`}
                              aria-label={`${savedStationsClearCount} clear stations`}
                            >
                              {savedStationsClearCount}
                            </span>
                            <span
                              className={`desktop-menu-count-badge desktop-menu-count-stations-affected flex h-6 ${
                                savedStationsAffectedCount < 10 ? "w-6" : "min-w-[24px] px-1.5"
                              } items-center justify-center rounded-full text-[11px] font-bold`}
                              aria-label={`${savedStationsAffectedCount} affected stations`}
                            >
                              {savedStationsAffectedCount}
                            </span>
                          </div>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="account-action-row">
                      <button
                        ref={registerMenuAction(actionIndex++)}
                        role="menuitem"
                        type="button"
                        onClick={() => openAuthChoice("login")}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors w-full"
                      >
                        <LogIn size={18} className="text-slate-500 dark:text-slate-400" />
                        Sign In
                      </button>
                      <button
                        ref={registerMenuAction(actionIndex++)}
                        role="menuitem"
                        type="button"
                        onClick={() => openAuthChoice("register")}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors w-full"
                      >
                        <UserPlus size={18} className="text-slate-500 dark:text-slate-400" />
                        Create Account
                      </button>
                      <button
                        ref={registerMenuAction(actionIndex++)}
                        role="menuitem"
                        type="button"
                        onClick={handleDemoAccount}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors w-full"
                        disabled={accountBusy}
                      >
                        <UserRound size={18} className="text-emerald-600 dark:text-emerald-400" />
                        Demo Account
                      </button>
                      <button
                        ref={registerMenuAction(actionIndex++)}
                        role="menuitem"
                        onClick={() => navigateForward("commutes")}
                        aria-current={activeView === "commutes" ? "page" : undefined}
                        className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors w-full"
                      >
                        <div className="flex items-center gap-3">
                          <Navigation size={18} className="text-slate-500 dark:text-slate-400" />
                          My Commutes
                        </div>
                        {accountCommutes.length > 0 && (
                          <div className="flex items-center gap-1.5 shrink-0" data-testid="commute-status-badges">
                            <span
                              className={`desktop-menu-count-badge desktop-menu-count-commutes-clear flex h-6 ${
                                commuteClearCount < 10 ? "w-6" : "min-w-[24px] px-1.5"
                              } items-center justify-center rounded-full text-[11px] font-bold`}
                              aria-label={`${commuteClearCount} clear commutes`}
                            >
                              {commuteClearCount}
                            </span>
                            <span
                              className={`desktop-menu-count-badge desktop-menu-count-commutes-affected flex h-6 ${
                                commuteAffectedCount < 10 ? "w-6" : "min-w-[24px] px-1.5"
                              } items-center justify-center rounded-full text-[11px] font-bold`}
                              aria-label={`${commuteAffectedCount} affected commutes`}
                            >
                              {commuteAffectedCount}
                            </span>
                          </div>
                        )}
                      </button>
                      <button
                        ref={registerMenuAction(actionIndex++)}
                        role="menuitem"
                        onClick={() => navigateForward("my-stations")}
                        aria-current={activeView === "my-stations" ? "page" : undefined}
                        className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors w-full"
                      >
                        <span className="flex items-center gap-3">
                          <MapPin size={18} className="text-slate-500 dark:text-slate-400" />
                          My Stations
                        </span>
                        {savedStations.length > 0 && (
                          <div className="flex items-center gap-1.5 shrink-0" data-testid="station-status-badges">
                            <span
                              className={`desktop-menu-count-badge desktop-menu-count-stations-clear flex h-6 ${
                                savedStationsClearCount < 10 ? "w-6" : "min-w-[24px] px-1.5"
                              } items-center justify-center rounded-full text-[11px] font-bold`}
                              aria-label={`${savedStationsClearCount} clear stations`}
                            >
                              {savedStationsClearCount}
                            </span>
                            <span
                              className={`desktop-menu-count-badge desktop-menu-count-stations-affected flex h-6 ${
                                savedStationsAffectedCount < 10 ? "w-6" : "min-w-[24px] px-1.5"
                              } items-center justify-center rounded-full text-[11px] font-bold`}
                              aria-label={`${savedStationsAffectedCount} affected stations`}
                            >
                              {savedStationsAffectedCount}
                            </span>
                          </div>
                        )}
                      </button>
                    </div>
                  )}
                  <DefaultMapModeControl
                    value={defaultNetworkPreference}
                    onChange={handleDefaultNetworkChange}
                  />
                  {accountError ? <p className="px-2 pb-2 text-xs font-semibold text-red-600 dark:text-red-300">{accountError}</p> : null}
                </div>

                {/* Maps & Alerts */}
                <div className="flex flex-col px-2 py-2 border-b border-black/10 dark:border-white/10 gap-0.5">
                  <div className="px-3 pt-2 pb-2 select-none">
                    <div className="station-subsection-header flex items-center gap-2">
                      <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
                      <span className="text-[12px] uppercase font-bold text-slate-700 dark:text-slate-300 tracking-wider">Maps & Alerts</span>
                    </div>
                  </div>
                  <button
                    ref={registerMenuAction(actionIndex++)}
                    role="menuitem"
                    onClick={() => { setActiveView("map"); setSelection(null); }}
                    aria-current={activeView === "map" ? "page" : undefined}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                  >
                    <MapIcon size={18} className="text-slate-500 dark:text-slate-400" /> Map
                  </button>
                  <button
                    ref={registerMenuAction(actionIndex++)}
                    role="menuitem"
                    onClick={() => openImpactCategory("alerts")}
                    aria-current={activeView === "alerts" ? "page" : undefined}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <AlertTriangle size={18} className="text-slate-500 dark:text-slate-400" /> Active Alerts
                    </div>
                    {activeAlerts.length > 0 && (
                      <span
                        className={`desktop-menu-count-badge desktop-menu-count-alerts flex h-6 ${
                          activeAlerts.length < 10 ? "w-6" : "min-w-[24px] px-1.5"
                        } items-center justify-center rounded-full text-[11px] font-bold`}
                      >
                        {activeAlerts.length}
                      </span>
                    )}
                  </button>
                  <button
                    ref={registerMenuAction(actionIndex++)}
                    role="menuitem"
                    onClick={() => openImpactCategory("delays")}
                    aria-current={activeView === "delays" ? "page" : undefined}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <DelayIcon size={18} className="text-slate-500 dark:text-slate-400" filled={false} /> Delays
                    </div>
                    {delays.length > 0 && (
                      <span
                        className={`desktop-menu-count-badge desktop-menu-count-delays flex h-6 ${
                          delays.length < 10 ? "w-6" : "min-w-[24px] px-1.5"
                        } items-center justify-center rounded-full text-[11px] font-bold`}
                      >
                        {delays.length}
                      </span>
                    )}
                  </button>
                  {selectedNetwork === "ttc" ? <button
                    ref={registerMenuAction(actionIndex++)}
                    role="menuitem"
                    onClick={() => openImpactCategory("reduced-speed-zones")}
                    aria-current={activeView === "reduced-speed-zones" ? "page" : undefined}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Construction size={18} className="text-slate-500 dark:text-slate-400" /> Reduced Speed Zones
                    </div>
                    {reducedSpeedZones.length > 0 && (
                      <span
                        className={`desktop-menu-count-badge desktop-menu-count-rsz flex h-6 ${
                          reducedSpeedZoneCount < 10 ? "w-6" : "min-w-[24px] px-1.5"
                        } items-center justify-center rounded-full text-[11px] font-bold`}
                      >
                        {reducedSpeedZoneCount}
                      </span>
                    )}
                  </button> : null}
                  <button
                    ref={registerMenuAction(actionIndex++)}
                    role="menuitem"
                    onClick={() => openImpactCategory("closures")}
                    aria-current={activeView === "closures" ? "page" : undefined}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <PlannedClosureIcon size={18} className="text-slate-500 dark:text-slate-400" /> Planned Closures
                    </div>
                    {plannedClosures.length > 0 && (
                      <span
                        className={`desktop-menu-count-badge desktop-menu-count-closures flex h-6 ${
                          plannedClosures.length < 10 ? "w-6" : "min-w-[24px] px-1.5"
                        } items-center justify-center rounded-full text-[11px] font-bold`}
                      >
                        {plannedClosures.length}
                      </span>
                    )}
                  </button>
                  {selectedNetwork === "regional" ? <button
                    ref={registerMenuAction(actionIndex++)}
                    role="menuitem"
                    onClick={openRegionalTripChanges}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Train size={18} className="text-slate-500 dark:text-slate-400" /> Trip Changes
                    </div>
                    {regionalTripChangeCount !== null && regionalTripChangeCount > 0 ? (
                      <span
                        className={`desktop-menu-count-badge desktop-menu-count-trip-changes trip-change-count-badge flex h-6 ${
                          regionalTripChangeCount < 10 ? "w-6" : "min-w-[24px] px-1.5"
                        } items-center justify-center rounded-full text-[11px] font-bold`}
                      >
                        {regionalTripChangeCount}
                      </span>
                    ) : null}
                  </button> : null}
                  <button
                    ref={registerMenuAction(actionIndex++)}
                    role="menuitem"
                    onClick={() => navigateForward("accessibility-outages")}
                    aria-current={activeView === "accessibility-outages" ? "page" : undefined}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="w-[18px] h-[18px] shrink-0 text-slate-500 dark:text-slate-400"
                      >
                        <path
                          fill="currentColor"
                          d="M11.468 6.403a1.5 1.5 0 1 1 1.064 0a2.25 2.25 0 0 1-1.064 0M9 5q.001.202.026.399L6.15 4.178a2.266 2.266 0 0 0-2.96 1.184a2.24 2.24 0 0 0 1.18 2.954l3.634 1.542v3.701l-1.88 5.458a2.25 2.25 0 1 0 4.256 1.465l.145-.422a6.5 6.5 0 0 1-.496-3.169L8.96 19.993a.75.75 0 0 1-1.418-.488l1.893-5.497a1.3 1.3 0 0 0 .068-.407V9.693c0-.502-.3-.955-.762-1.151L4.956 6.935a.74.74 0 0 1-.39-.977a.766 2.266 0 0 1 .998-.4l4.971 2.11q.24.102.487.169a3 3 0 0 0 1.956 0q.248-.066.488-.168l4.97-2.11a.766 2.266 0 0 1 1 .399a.74.74 0 0 1-.391.977l-3.78 1.605a1.25 1.25 0 0 0-.762 1.15v1.623a6.5 6.5 0 0 1 1.5-.294V9.856l3.628-1.54a2.24 2.24 0 0 0 1.18-2.954a2.266 2.266 0 0 0-2.96-1.184l-2.877 1.22Q15 5.204 15 5a3 3 0 1 0-6 0"
                        />
                        <path
                          fill="currentColor"
                          d="M22 17.5a5.5 5.5 0 1 1-11 0a5.5 5.5 0 0 1 11 0M16.5 14a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 1 0v-4a.5.5 0 0 0-.5-.5m0 7.125a.625.625 0 1 0 0-1.25a.625.625 0 0 0 0 1.25"
                        />
                      </svg>
                      Accessibility Outages
                    </div>
                    {accessibilityOutageResult && accessibilityOutageResult.assetTypes.reduce((acc, curr) => acc + curr.count, 0) > 0 && (
                      <span
                        className={`desktop-menu-count-badge desktop-menu-count-accessibility flex h-6 ${
                          accessibilityOutageResult.assetTypes.reduce((acc, curr) => acc + curr.count, 0) < 10 ? "w-6" : "min-w-[24px] px-1.5"
                        } items-center justify-center rounded-full text-[11px] font-bold`}
                      >
                        {accessibilityOutageResult.assetTypes.reduce((acc, curr) => acc + curr.count, 0)}
                      </span>
                    )}
                  </button>
                  <button
                    ref={registerMenuAction(actionIndex++)}
                    role="menuitem"
                    onClick={openServiceNotices}
                    aria-current={activeView === "surface-notices" ? "page" : undefined}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {selectedNetwork === "regional" ? (
                        <Megaphone size={18} className="text-slate-500 dark:text-slate-400" />
                      ) : (
                        <Bus size={18} className="text-slate-500 dark:text-slate-400" />
                      )} {selectedNetwork === "regional" ? "Service Notices" : "Streetcar & Bus Notices"}
                    </div>
                    {surfaceNoticeCount !== null && surfaceNoticeCount > 0 && (
                      <span
                        className={`desktop-menu-count-badge desktop-menu-count-surface flex h-6 ${
                          surfaceNoticeCount < 10 ? "w-6" : "min-w-[24px] px-1.5"
                        } items-center justify-center rounded-full text-[11px] font-bold`}
                      >
                        {surfaceNoticeCount}
                      </span>
                    )}
                  </button>
                  <button
                    ref={registerMenuAction(actionIndex++)}
                    role="menuitem"
                    onClick={() => navigateForward("alert-history")}
                    aria-current={activeView === "alert-history" ? "page" : undefined}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                  >
                    <History size={18} className="text-slate-500 dark:text-slate-400" /> Alert History
                  </button>
                  {selectedNetwork === "ttc" ? <button
                    ref={registerMenuAction(actionIndex++)}
                    role="menuitem"
                    onClick={() => navigateForward("announcements")}
                    aria-current={activeView === "announcements" ? "page" : undefined}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Megaphone size={18} className="text-slate-500 dark:text-slate-400" /> TTC Announcements
                    </div>
                    {announcementCount !== null && announcementCount > 0 && (
                      <span
                        className={`desktop-menu-count-badge desktop-menu-count-announcements flex h-6 ${
                          announcementCount < 10 ? "w-6" : "min-w-[24px] px-1.5"
                        } items-center justify-center rounded-full text-[11px] font-bold`}
                      >
                        {announcementCount}
                      </span>
                    )}
                  </button> : null}
                </div>

                {/* Line Status */}
                <div className="flex flex-col px-2 py-2 border-b border-black/10 dark:border-white/10 gap-0.5">
                  <div className="px-3 pt-2 pb-2 select-none">
                    <div className="station-subsection-header flex items-center gap-2">
                      <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
                      <span className="text-[12px] uppercase font-bold text-slate-700 dark:text-slate-300 tracking-wider">Line Status</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {lineStatuses.map(l => {
                      const hasAlert = activeAlerts.some(a => a.lineId === l.id);
                      const hasDelay = delays.some(delay => delay.lineId === l.id);
                      const hasRSZ = reducedSpeedZones.some(z => z.lineId === l.id);
                      const hasClosure = plannedClosures.some(c => c.lineId === l.id);
                      const isClear = !hasAlert && !hasDelay && !hasRSZ && !hasClosure;
                      
                      return (
                        <button
                          key={l.id}
                          ref={registerMenuAction(actionIndex++)}
                          role="menuitem"
                          type="button"
                          onClick={() => openLineImpacts(l.id)}
                          aria-label={`View all service impacts for ${l.name}`}
                          className="desktop-line-status-row group/line-status flex items-center gap-3 px-2 py-2 rounded-lg !bg-white dark:!bg-[#12151c] border border-black/5 dark:border-white/5 shadow-sm text-left hover:border-blue-500/30 hover:bg-blue-500/5 transition-colors"
                        >
                           <TransitLineBadge lineId={l.id} lineNumber={l.number} lineName={l.name} size={24} className="flex-shrink-0" />
                           <div className="flex min-w-0 flex-1 flex-col justify-center">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="min-w-0 truncate text-sm font-bold text-slate-800 dark:text-slate-200">{l.name}</span>
                                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                                  {hasAlert && <AlertTriangle size={14} className="text-red-500 dark:text-red-400" />}
                                  {hasDelay && <DelayIcon size={14} className="delay-tone" /> /* /assets/linewatch/delay-icon.svg */}
                                  {hasRSZ && <Construction size={14} className="rsz-tone" />}
                                  {hasClosure && <PlannedClosureIcon size={14} className="text-blue-500 dark:text-blue-400" />}
                                </div>
                                {isClear && (
                                  <CircleCheck
                                    size={16}
                                    strokeWidth={2.7}
                                    className="good-service-check-badge ml-1 shrink-0 text-emerald-600 dark:text-emerald-400"
                                    aria-label={clearServiceStatusLabel({
                                      networkId: selectedNetwork,
                                      dataSource: displayData.dataSource,
                                    })}
                                  />
                                )}
                              </div>
                           </div>
                           <ChevronRight size={19} strokeWidth={2.8} className="shrink-0 text-slate-500 dark:text-slate-300 transition-transform duration-200 ease-out group-hover/line-status:translate-x-[3px]" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                </div>

               {/* Notifications */}
               <div className="flex flex-col px-2 py-2 border-b border-black/10 dark:border-white/10 gap-0.5">
                 <div className="px-3 pt-2 pb-2 select-none">
                   <div className="station-subsection-header flex items-center gap-2">
                     <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
                     <span className="text-[12px] uppercase font-bold text-slate-700 dark:text-slate-300 tracking-wider">Notifications</span>
                   </div>
                 </div>
                 <button
                   ref={registerMenuAction(actionIndex++)}
                   role="menuitem"
                   onClick={() => navigateForward("notifications")}
                   aria-current={activeView === "notifications" ? "page" : undefined}
                   className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                 >
                   <Bell size={18} className="text-slate-500 dark:text-slate-400" /> Notifications
                 </button>
               </div>

               {/* Operations */}
               <div className="flex flex-col px-2 py-2 border-b border-black/10 dark:border-white/10 gap-0.5">
                 <div className="px-3 pt-2 pb-2 select-none">
                    <div className="station-subsection-header flex items-center gap-2">
                      <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
                      <span className="text-[12px] uppercase font-bold text-slate-700 dark:text-slate-300 tracking-wider">Operations</span>
                    </div>
                 </div>
                 <button
                   ref={registerMenuAction(actionIndex++)}
                   role="menuitem"
                   onClick={() => navigateForward("analytics")}
                   aria-current={activeView === "analytics" ? "page" : undefined}
                   className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                 >
                   <BarChart3 size={18} className="text-slate-500 dark:text-slate-400" /> Reliability Analytics
                 </button>
                </div>

               {/* Display */}
               <div className="flex flex-col px-2 py-2 border-b border-black/10 dark:border-white/10 gap-0.5">
                 <div className="px-3 pt-2 pb-2 select-none">
                    <div className="station-subsection-header flex items-center gap-2">
                      <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
                      <span className="text-[12px] uppercase font-bold text-slate-700 dark:text-slate-300 tracking-wider">Display</span>
                    </div>
                 </div>
                 <div className="flex items-center justify-between px-3 py-2.5">
                   <span className="main-menu-display-label text-slate-700 dark:text-slate-200 flex items-center gap-3">
                     <Contrast size={18} className="text-slate-500 dark:text-slate-400" /> High Contrast Mode
                   </span>
                   <button
                      ref={registerMenuAction(actionIndex++)}
                      role="menuitemcheckbox"
                      aria-checked={highContrast}
                      aria-label="Toggle high contrast mode"
                      onClick={handleToggleHighContrast}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${highContrast ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                   >
                     <span className={`absolute left-1 top-1 h-3 w-3 transform rounded-full bg-white transition-transform ${highContrast ? 'translate-x-4' : 'translate-x-0'}`} />
                   </button>
                 </div>
                 <div className="flex items-center justify-between px-3 py-2.5">
                   <span className="main-menu-display-label text-slate-700 dark:text-slate-200 flex items-center gap-3">
                     <Pause size={18} className="text-slate-500 dark:text-slate-400" /> Reduced Motion
                   </span>
                   <button
                      ref={registerMenuAction(actionIndex++)}
                      role="menuitemcheckbox"
                      aria-checked={reducedMotion}
                      aria-label="Toggle reduced motion"
                      onClick={handleToggleReducedMotion}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${reducedMotion ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                   >
                     <span className={`absolute left-1 top-1 h-3 w-3 transform rounded-full bg-white transition-transform ${reducedMotion ? 'translate-x-4' : 'translate-x-0'}`} />
                   </button>
                 </div>
                 <div className="flex items-center justify-between px-3 py-2.5">
                   <span className="main-menu-display-label text-slate-700 dark:text-slate-200 flex items-center gap-3">
                     <Sparkles size={18} className="text-slate-500 dark:text-slate-400" /> {BACKGROUND_PREFERENCE_LABEL}
                   </span>
                   <button
                      ref={registerMenuAction(actionIndex++)}
                      role="menuitemcheckbox"
                      aria-checked={dotBackgroundEnabled}
                      aria-label={`Toggle ${BACKGROUND_PREFERENCE_LABEL.toLowerCase()}`}
                      onClick={handleToggleDotBackground}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${dotBackgroundEnabled ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                   >
                     <span className={`absolute left-1 top-1 h-3 w-3 transform rounded-full bg-white transition-transform ${dotBackgroundEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                   </button>
                 </div>
               </div>

               {/* Support & About */}
               <div className="flex flex-col px-2 pt-2 pb-0.5 gap-0.5">
                 <div className="px-3 pt-2 pb-2 select-none">
                    <div className="station-subsection-header flex items-center gap-2">
                      <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
                      <span className="text-[12px] uppercase font-bold text-slate-700 dark:text-slate-300 tracking-wider">Support & About</span>
                    </div>
                 </div>
                 <button
                   ref={registerMenuAction(actionIndex++)}
                   role="menuitem"
                   onClick={() => navigateForward("feedback")}
                   aria-current={activeView === "feedback" ? "page" : undefined}
                   className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                 >
                   <MessageSquareText size={18} className="text-slate-500 dark:text-slate-400" /> Leave Feedback
                 </button>
                 {supportUrl ? (
                   <button
                     ref={registerMenuAction(actionIndex++)}
                     role="menuitem"
                     onClick={() => window.open(supportUrl, "_blank", "noopener,noreferrer")}
                     className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                   >
                     <HeartHandshake size={18} className="text-slate-500 dark:text-slate-400" /> Support
                   </button>
                 ) : null}
                 <button
                   ref={registerMenuAction(actionIndex++)}
                   role="menuitem"
                   onClick={() => navigateForward("privacy-acknowledgements")}
                   aria-current={activeView === "privacy-acknowledgements" ? "page" : undefined}
                   className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                 >
                   <FileText size={18} className="text-slate-500 dark:text-slate-400" /> Privacy & Acknowledgements
                 </button>
                 {hasReleaseNotes ? (
                   <button
                     ref={registerMenuAction(actionIndex++)}
                     role="menuitem"
                     onClick={() => navigateForward("release-notes")}
                     aria-current={activeView === "release-notes" ? "page" : undefined}
                     className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                   >
                     <Sparkles size={18} className="text-slate-500 dark:text-slate-400" /> {"What's New"}
                   </button>
                 ) : null}
                 <a
                   ref={registerMenuAction(actionIndex++)}
                   role="menuitem"
                   href="/explore"
                   className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors w-full"
                 >
                   <BookOpen size={18} className="text-slate-500 dark:text-slate-400 shrink-0" /> Transit Guides
                 </a>
               </div>

               <div className="pt-0.5 pb-3 text-center">
                 <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 select-none" aria-label={`App version ${lineWatchAppVersionLabel}`}>
                   {lineWatchAppVersionLabel}
                 </span>
               </div>
              </div>
            </div>
          <StationSearchPanel
            open={activeView === "search" || isClosingSearch}
            isClosing={isClosingSearch}
            stationCatalogs={stationCatalogs}
            currentNetwork={selectedNetwork}
            selectedStationId={selectedStationId}
            onSelectStation={handleSearchSelectStation}
            onSelectImpact={handleSearchSelectImpact}
            onOpenImpactCategory={handleSearchOpenImpactCategory}
            onClose={() => {
              if (searchClosingTimeoutRef.current) {
                window.clearTimeout(searchClosingTimeoutRef.current);
                searchClosingTimeoutRef.current = null;
              }
              setIsClosingSearch(false);
              setActiveView("map");
              setStationSearchQuery("");
            }}
            onDismiss={handleCloseSearch}
            onClosedFocusTarget={() => { if (!isMobile) stationSearchInputRef.current?.focus(); }}
            query={stationSearchQuery}
            onQueryChange={setStationSearchQuery}
            inputRef={stationSearchInputRef}
            keyDownHandlerRef={stationKeyDownHandlerRef}
            isMobile={isMobile}
            externalMobileInput
            authenticated={accountState.authenticated || accountState.source === "unavailable"}
            savedStationKeys={savedStationKeys}
            pendingSavedStationIds={pendingSavedStationIds}
            onToggleSavedStation={handleToggleSavedStation}
            onRequestSignIn={() => {
              setAccountEntryIntent("register");
              openAccountDialog("auth-choice");
              setAccountError(null);
            }}
            savedCommutes={accountCommutes}
            surfaceSearchEnabled
            onOpenDestination={(view) => {
              if (view === "commutes") {
                setCommutesActiveTab("saved");
                setCommutesDraft(null);
                clearPersistedCommuteDraft();
              }
              navigateForward(view);
            }}
            onOpenSavedCommute={() => {
              setCommutesActiveTab("saved");
              setCommutesDraft(null);
              clearPersistedCommuteDraft();
              navigateForward("commutes");
            }}
            onOpenSurfaceNotice={handleSearchOpenSurfaceNotice}
          />
        </div>
        )}

        {/* Desktop Collapsed Map Notice (Top Center) */}
        {!isMobile && desktopSidebarCollapsed && desktopNotice ? (
          <div className="desktop-collapsed-map-notice-anchor">
            {renderDesktopNoticeBanner(desktopNotice)}
          </div>
        ) : null}

        <div className="map-utility-cluster ml-auto pointer-events-auto flex items-center gap-2" data-map-chooser-keepout>
          {isMobile && <LogsDropdown network={selectedNetwork} />}
          {isMobile && (
            <button
              type="button"
              onClick={() => navigateForward("alert-history")}
              className="alert-history-shortcut panel hidden md:flex items-center justify-center w-14 h-14 rounded-xl shadow-lg hover:!bg-slate-200 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10]"
              aria-label="Open Alert History"
              aria-expanded={activeView === "alert-history"}
              title="Alert History"
            >
              <History className="alert-history-shortcut-icon text-emerald-500" size={23} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleEstimatedTrains}
            disabled={!trainNetworkOpen}
            className="desktop-train-toggle-btn panel flex items-center gap-3 px-3.5 h-10 sm:h-14 rounded-xl shadow-lg hover:!bg-slate-200 dark:hover:!bg-[#1a1e28] hover:scale-[1.02] active:scale-[0.98] outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10] select-none text-left"
            aria-pressed={estimatedTrainsEnabled}
            aria-busy={estimatedTrainDisplayPending}
            aria-label={`Toggle estimated train markers (${estimatedTrainStatusLabel})`}
            title={`Estimated Train Markers (${estimatedTrainStatusLabel})`}
          >
            <div className="shrink-0 flex items-center justify-center">
              {estimatedTrainDisplayPending ? (
                <Loader2 className="animate-spin text-blue-500" size={21} aria-hidden="true" />
              ) : (
                <Train
                  size={21}
                  className={
                    estimatedTrainsEnabled
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-slate-500 dark:text-slate-400"
                  }
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="hidden sm:flex flex-col items-start leading-tight min-w-0 pr-0.5">
              <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                Train Markers
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {!trainNetworkOpen ? "Closed" : estimatedTrainStatusLabel ?? (estimatedTrainsEnabled ? "On" : "Off")}
              </span>
            </div>
            <div
              className="desktop-status-train-switch pointer-events-none hidden sm:flex shrink-0"
              aria-hidden="true"
            >
              <span />
            </div>
          </button>
          <button
            onClick={handleToggleTheme}
            className="theme-toggle-btn panel flex items-center justify-center w-10 sm:w-14 h-10 sm:h-14 rounded-xl shadow-lg hover:!bg-slate-200 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10]"
            aria-label="Toggle theme"
          >
            {isDark ? (
              <Sun size={24} className="text-yellow-500 fill-yellow-500" />
            ) : (
              <Moon size={24} className="text-purple-500 fill-purple-500" />
            )}
          </button>
          <button
            onClick={handleOpenRotatedMap}
            className="rotate-map-btn panel flex items-center justify-center gap-1.5 px-2.5 rounded-xl shadow-lg hover:!bg-slate-200 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10] h-10 md:hidden"
            aria-label="Rotate map"
          >
            <PhoneRotateLandscapeIcon size={24} />
            <span className="text-[10px] font-black leading-[1.1] text-left uppercase tracking-wider text-slate-800 dark:text-white">
              Rotate<br />Map
            </span>
          </button>
          {isMobile && (
            <div className="site-guide-network-stack">
              <SiteGuideDropdown onOpenChange={setGuideOpen} />
              <div className="mobile-network-selector-slot">
                <NetworkSelector
                  network={selectedNetwork}
                  onChange={handleNetworkChange}
                  compactVertical
                />
              </div>
              {activeView === "map" && !selection && !selectedStationId && !commutePathPreview ? (
                <>
                  <button
                    type="button"
                    onClick={() => navigateForward("alert-history")}
                    className="mobile-alert-history-shortcut md:hidden"
                    aria-label="Open Alert History"
                    title="Alert History"
                  >
                    <History className="alert-history-shortcut-icon" size={19} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={openMyStations}
                    className="mobile-my-stations-shortcut md:hidden"
                    aria-label="Open My Stations"
                    title="My Stations"
                  >
                    <MapPin className="mobile-my-stations-shortcut-icon" size={19} aria-hidden="true" />
                  </button>
                </>
              ) : null}
            </div>
          )}
        </div>
      </header>
      )}

      {/* Floating Submenus (Alerts, Delays, Closures, Commutes, Analytics) */}
      {activeFloatingPanel}

      {/* Main Viewport (TTC Map Front & Center, Borderless) */}
      {!isMobile ? (
        <div className="linewatch-desktop-layout">
          <div
            className={`linewatch-transit-accent-strip desktop-sidebar-accent-strip${selectedNetwork === "regional" ? " linewatch-transit-accent-strip--regional" : ""}`}
            data-network={selectedNetwork}
            data-collapsed={desktopSidebarCollapsed ? "true" : "false"}
            style={{
              "--desktop-sidebar-width": `${desktopMetrics.sidebarWidth}px`,
            } as React.CSSProperties}
            aria-hidden="true"
          >
            {selectedNetwork === "regional" ? (
              <>
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </>
            ) : (
              <>
                <span />
                <span />
                <span />
                <span />
                <span />
              </>
            )}
          </div>
          <DesktopNavRail
            activeDestination={
              activeView === "surface-notices"
                && selectedNetwork === "regional"
                && surfaceNoticeInitialContent === "trip-changes"
                ? "trip-changes"
                : desktopRailDestinationForView(activeView)
            }
            collapsed={desktopSidebarCollapsed}
            onToggleCollapse={handleToggleDesktopSidebar}
            onSelectDestination={handleSelectRailDestination}
            statusAlertCount={totalAlertCount}
            activeAlertCount={activeAlerts.length}
            delayCount={delays.length}
            reducedSpeedZoneCount={reducedSpeedZoneCount}
            plannedClosureCount={plannedClosures.length}
            tripChangeCount={regionalTripChangeCount ?? 0}
            commuteAffectedCount={commuteAffectedCount}
            savedStationsAffectedCount={savedStationsAffectedCount}
            toggleButtonRef={desktopRailToggleRef}
            selectedNetwork={selectedNetwork}
            onNetworkChange={handleNetworkChange}
            authenticated={accountState.authenticated}
            onRequestSignIn={() => {
              if (accountState.authenticated) {
                handleSelectRailDestination("more");
              } else {
                openAccountDialog("auth-choice");
              }
            }}
          />
          <aside
            id="desktop-sidebar-container"
            className={`desktop-sidebar-container ${
              desktopMetrics.mode === "docked"
                ? "desktop-sidebar-container--docked"
                : "desktop-sidebar-container--overlay"
            } ${desktopSidebarCollapsed ? "desktop-sidebar-container--collapsed" : ""}`}
            style={{
              width: `${desktopMetrics.sidebarWidth}px`,
              maxWidth: `${desktopMetrics.sidebarWidth}px`,
            }}
            aria-hidden={desktopSidebarCollapsed ? "true" : undefined}
            aria-label="Sidebar navigation and details"
          >
            <header className="desktop-sidebar-header">
              <div className="desktop-sidebar-header-top">
                <div className="desktop-sidebar-brand-group">
                  <Image src="/assets/linewatch/logo.svg" alt="LineWatchTO Logo" width={28} height={28} className="desktop-sidebar-logo shrink-0 drop-shadow-sm" />
                  <strong className="linewatch-wordmark desktop-sidebar-wordmark text-slate-800 dark:text-white">LineWatchTO</strong>
                </div>
                {clock && (
                  <div
                    className="desktop-sidebar-clock"
                    aria-label={`Current time ${clock.time} ${clock.zone}, ${clock.date}`}
                  >
                    <div className="desktop-sidebar-clock-time-row">
                      <span className="desktop-sidebar-clock-time">{clock.time}</span>
                      {clock.zone && <span className="desktop-sidebar-clock-zone">{clock.zone}</span>}
                    </div>
                    {clock.date && <span className="desktop-sidebar-clock-date">{clock.date}</span>}
                  </div>
                )}
              </div>
              <div className="desktop-sidebar-search-row">
                <div
                  className="desktop-sidebar-search-input"
                  data-active={activeView === "search" ? "true" : undefined}
                  onClick={(e) => {
                    if (activeView !== "search") handleOpenSearch();
                    if (e.target !== desktopSearchInputRef.current) {
                      desktopSearchInputRef.current?.focus();
                    }
                  }}
                >
                  <Search
                    size={20}
                    className={`shrink-0 transition-colors duration-200 ${
                      activeView === "search"
                        ? "text-blue-500 dark:text-blue-400"
                        : "text-slate-400 dark:text-slate-400"
                    }`}
                    aria-hidden="true"
                  />
                  <input
                    ref={desktopSearchInputRef}
                    type="search"
                    value={stationSearchQuery}
                    onClick={() => {
                      if (activeView !== "search") handleOpenSearch();
                    }}
                    onChange={(e) => {
                      setStationSearchQuery(e.target.value);
                      if (activeView !== "search") {
                        handleOpenSearch();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        if (activeView !== "search") {
                          e.preventDefault();
                          handleOpenSearch();
                          return;
                        }
                      }
                      stationKeyDownHandlerRef.current?.(e);
                    }}
                    placeholder="Search all stations and alerts..."
                    aria-label="Station Search"
                    aria-controls="station-search-panel"
                    className="desktop-sidebar-search-field"
                  />
                  {stationSearchQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        setStationSearchQuery("");
                        desktopSearchInputRef.current?.focus();
                      }}
                      className="desktop-sidebar-search-clear"
                      aria-label="Clear search"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>
            </header>
            <div className="desktop-sidebar-content">
              {renderDesktopSidebarContent()}
            </div>
          </aside>
          <div className="desktop-map-workspace">
            <main
              ref={networkMapSurfaceRef}
              className={`network-map-transition-surface absolute inset-0 z-auto md:z-10 ${showClosedScreen ? "subway-closed-map-backdrop" : ""}`}
            >
              <NetworkMap
                network={selectedNetwork}
                isMapActive={!showClosedScreen}
                animateInitialEntrance={!initialMapReady && !mobileMapPerformanceMode}
                deferInitialEntrance={disclaimerVisible
                  || (selectedNetwork === "ttc" && subwayOperatingState.status === "closed" && !closedScreenAcknowledged)
                  || (selectedNetwork === "regional" && regionalRailOperatingState.status === "closed" && !closedScreenAcknowledged)}
                onMapReady={handleMapReady}
                mobileAnnouncementVisible={selectedNetwork === "ttc"
                  ? subwayOperatingState.closingSoon
                    || (subwayOperatingState.status === "closed" && closedMapPeek)
                  : regionalRailOperatingState.closingSoon
                    || (regionalRailOperatingState.status === "closed" && closedMapPeek)}
                legendProps={legendProps}
                mapChromeVisible={!showClosedScreen}
                selection={selection}
                selectedStationId={selectedStationId}
                stations={stationSummaries}
                onSelectImpact={handleMapSelectImpact}
                onSelectStationId={handleSelectStationId}
                isDark={isDark}
                highContrast={highContrast}
                onToggleTheme={handleToggleTheme}
                layoutResetSignal={mapLayoutSignal}
                recenterSignal={recenterSignal}
                zoomInSignal={zoomInSignal}
                zoomOutSignal={zoomOutSignal}
                reducedMotion={reducedMotion}
                mobilePerformanceMode={mobileMapPerformanceMode}
                desktopMenuPinned={menuPinned}
                preserveCameraOnSelectionClear
                commutePathPreview={commutePathPreview}
                onClearCommutePathPreview={handleClearCommutePathPreview}
                viewportOrientation={rotatedMapMode ? "rotated-landscape" : "standard"}
                estimatedTrainsEnabled={estimatedTrainMarkersVisible}
                estimatedTrainMarkers={estimatedTrainMarkersVisible ? estimatedTrainSnapshot.markers : []}
              />
            </main>
          </div>
        </div>
      ) : (
        <main
          ref={networkMapSurfaceRef}
          className={`network-map-transition-surface absolute inset-0 z-auto md:z-10 ${showClosedScreen ? "subway-closed-map-backdrop" : ""}`}
        >
          <NetworkMap
            network={selectedNetwork}
            isMapActive={activeView === "map" && !isClosingSearch}
            animateInitialEntrance={!initialMapReady && !mobileMapPerformanceMode}
            deferInitialEntrance={disclaimerVisible
              || (selectedNetwork === "ttc" && subwayOperatingState.status === "closed" && !closedScreenAcknowledged)
              || (selectedNetwork === "regional" && regionalRailOperatingState.status === "closed" && !closedScreenAcknowledged)}
            onMapReady={handleMapReady}
            mobileAnnouncementVisible={selectedNetwork === "ttc"
              ? subwayOperatingState.closingSoon
                || (subwayOperatingState.status === "closed" && closedMapPeek)
              : regionalRailOperatingState.closingSoon
                || (regionalRailOperatingState.status === "closed" && closedMapPeek)}
            legendProps={legendProps}
            mapChromeVisible={!showClosedScreen}
            selection={selection}
            selectedStationId={selectedStationId}
            stations={stationSummaries}
            onSelectImpact={handleMapSelectImpact}
            onSelectStationId={handleSelectStationId}
            isDark={isDark}
            highContrast={highContrast}
            onToggleTheme={handleToggleTheme}
            layoutResetSignal={mapLayoutSignal}
            recenterSignal={recenterSignal}
            zoomInSignal={zoomInSignal}
            zoomOutSignal={zoomOutSignal}
            reducedMotion={reducedMotion}
            mobilePerformanceMode={mobileMapPerformanceMode}
            desktopMenuPinned={menuPinned}
            preserveCameraOnSelectionClear
            commutePathPreview={commutePathPreview}
            onClearCommutePathPreview={handleClearCommutePathPreview}
            viewportOrientation={rotatedMapMode ? "rotated-landscape" : "standard"}
            estimatedTrainsEnabled={estimatedTrainMarkersVisible}
            estimatedTrainMarkers={estimatedTrainMarkersVisible ? estimatedTrainSnapshot.markers : []}
          />

          {selectedNetwork === "ttc" && (!initialMapReady || mobileMapPerformanceMode) ? (
            <div
              className={`ttc-map-entrance-reveal${initialMapReady ? " ttc-map-entrance-reveal--ready" : ""}`}
              aria-hidden="true"
            />
          ) : null}

          {rotatedMapMode ? (
            <div className="rotated-map-ui-surface">
              <div className="rotated-map-hud" aria-label="Rotated map controls" data-map-chooser-keepout>
                <MobileMapControls
                  presentationMode="rotated-landscape"
                  onExitRotated={() => {
                    setMapPresentationMode("standard");
                  }}
                  onRecenter={() => setRecenterSignal((prev) => prev + 1)}
                />
              </div>
              {rotatedSelectionVisible && !mobileInspectorOpen ? (
                <div className={rotatedMapSelectionHudClassName} aria-label="Selected rotated map item" data-map-chooser-keepout>
                  <RotatedMapSelectionCard
                    selection={selection}
                    selectedStationId={selectedStationId}
                    stations={stationSummaries}
                    onOpenDetails={handleOpenRotatedSelectionDetails}
                    onClearSelection={handleClearRotatedSelection}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </main>
      )}

      {!showClosedScreen && !rotatedMapMode && (
        <button
          type="button"
          onClick={handleToggleEstimatedTrains}
          disabled={!trainNetworkOpen}
          className={`mobile-train-toggle md:hidden ${
            selectedNetwork === "regional" ? "mobile-train-toggle--regional" : ""
          } ${estimatedTrainsEnabled ? "active" : ""} ${
            estimatedTrainDisplayPending ? "mobile-train-toggle--loading" : ""
          }`}
          data-map-chooser-keepout
          aria-pressed={estimatedTrainsEnabled}
          aria-busy={estimatedTrainDisplayPending}
          aria-label={`Toggle estimated train markers (${estimatedTrainStatusLabel})`}
        >
          <Train size={16} />
          <span>
            View<br />Trains
          </span>
          {estimatedTrainDisplayPending ? (
            <Loader2
              className="mobile-train-pending-spinner animate-spin"
              size={18}
              role="status"
              aria-label={estimatedTrainPendingLabel}
            />
          ) : null}
        </button>
      )}

      {isMobile && !showClosedScreen && !rotatedMapMode && selectedNetwork === "ttc" && selectedStationId && (
        <StationDetailPanel
          key={`${selectedStationId}:${stationPanelActivationKey}`}
          stationResult={visibleStationResult}
          loading={stationLoading}
          updating={stationLoading && Boolean(visibleStationResult?.data)}
          selectedStationName={stationSummaries.find((station) => station.id === selectedStationId)?.name}
          onClose={() => closeSelectedStation(selectedStationId)}
          onSelectImpact={handleStationSelectImpact}
          reducedMotion={reducedMotion}
          authenticated={accountState.authenticated || accountState.source === "unavailable"}
          saved={savedStationIds.has(selectedStationId)}
          savePending={pendingSavedStationIds.has(selectedStationId)}
          onToggleSaved={handleToggleSavedStation}
          onRequestSignIn={() => {
            setAccountEntryIntent("register");
            openAccountDialog("auth-choice");
            setAccountError(null);
          }}
        />
      )}

      {isMobile && !showClosedScreen && !rotatedMapMode && selectedNetwork === "regional" && selectedStationId ? (
        <RegionalStationDetailPanel
          key={`${selectedStationId}:${stationPanelActivationKey}`}
          station={stationSummaries.find((station) => station.id === selectedStationId) ?? regionalStationSummaries.stations[0]}
          accessibilityOutages={Array.from(new Map(
            (accessibilityOutageResult?.groups ?? [])
              .flatMap((group) => group.stations)
              .filter((station) => station.stationId === selectedStationId)
              .flatMap((station) => station.outages)
              .map((outage) => [outage.id, outage]),
          ).values())}
          accessibilityFresh={!displayData.snapshot && accessibilityOutageResult?.fresh === true}
          onClose={() => closeSelectedStation(selectedStationId)}
          onSelectImpact={handleStationSelectImpact}
          authenticated={accountState.authenticated || accountState.source === "unavailable"}
          saved={savedStationIds.has(selectedStationId)}
          savePending={pendingSavedStationIds.has(selectedStationId)}
          onToggleSaved={handleToggleSavedStation}
          onRequestSignIn={() => {
            setAccountEntryIntent("register");
            openAccountDialog("auth-choice");
            setAccountError(null);
          }}
        />
      ) : null}

      {selectedNetwork === "ttc" && (showTtcClosedScreen || isClosedScreenExiting) ? (
        <SubwayClosedScreen
          operatingState={subwayOperatingState}
          isExiting={isClosedScreenExiting}
          onPeekMap={handlePeekClosedMap}
          onExitComplete={() => setIsClosedScreenExiting(false)}
        />
      ) : null}

      {selectedNetwork === "regional" && (showRegionalClosedScreen || isClosedScreenExiting) ? (
        <GoUpClosedScreen
          operatingState={regionalRailOperatingState}
          isExiting={isClosedScreenExiting}
          onPeekMap={handlePeekClosedMap}
          onExitComplete={() => setIsClosedScreenExiting(false)}
        />
      ) : null}



      {/* Fixed borderless legend at the bottom right */}
      {!showClosedScreen && (
      <>
        <aside
          className={`desktop-status-chip-row-container fixed bottom-6 left-6 z-20 pointer-events-auto transition-opacity duration-200 ${menuVisible ? "opacity-0 pointer-events-none" : "opacity-100"}`}
          aria-hidden={menuVisible ? "true" : undefined}
        >
          {!isMobile && !menuVisible && !rotatedMapMode && !showPwaInstallNudge && !commutePathPreview && (activeView === "map" || activeView === "search") && <CurrentServicePanel
              overlapSelectors={[
                activeView === "search" || isClosingSearch ? "#station-search-panel" : "",
                selectedStationId ? ".station-detail-panel" : "",
              ].filter(Boolean).join(",")}
              data={displayData}
              notices={!displayData.snapshot && currentServiceNotices?.networkId === selectedNetwork ? currentServiceNotices.data : null}
              onNotice={handleSearchOpenSurfaceNotice}
              onImpact={handleSearchSelectImpact}
              onStatus={() => navigateForward("status")}
              onNotices={openServiceNotices}
            />}
          <div className="desktop-status-chip-row desktop-header-impact-chips" aria-label="Open impact categories">
            <button
              type="button"
              className="desktop-status-chip desktop-status-chip--alerts"
              data-count={activeAlerts.length === 0 ? "zero" : "positive"}
              onClick={() => openImpactCategory("alerts")}
              aria-label={`${activeAlerts.length} ${activeAlerts.length === 1 ? "active alert" : "active alerts"}`}
              title={`${activeAlerts.length} ${activeAlerts.length === 1 ? "Active Alert" : "Active Alerts"}`}
            >
              <AlertTriangle size={18} aria-hidden="true" />
              <span className="desktop-status-chip-count" data-digit-count={activeAlerts.length >= 10 ? "multiple" : "single"}>
                <span className="desktop-status-chip-count-value">{activeAlerts.length}</span>
              </span>
              <span className="desktop-status-chip-label">{activeAlerts.length === 1 ? "Active Alert" : "Active Alerts"}</span>
            </button>
            <button
              type="button"
              className="desktop-status-chip desktop-status-chip--delays"
              data-count={delays.length === 0 ? "zero" : "positive"}
              onClick={() => openImpactCategory("delays")}
              aria-label={`${delays.length} ${delays.length === 1 ? "delay" : "delays"}`}
              title={`${delays.length} ${delays.length === 1 ? "Delay" : "Delays"}`}
            >
              <DelayIcon size={18} aria-hidden="true" />
              <span className="desktop-status-chip-count" data-digit-count={delays.length >= 10 ? "multiple" : "single"}>
                <span className="desktop-status-chip-count-value">{delays.length}</span>
              </span>
              <span className="desktop-status-chip-label">{delays.length === 1 ? "Delay" : "Delays"}</span>
            </button>
            <button
              type="button"
              className="desktop-status-chip desktop-status-chip--closures"
              data-count={plannedClosures.length === 0 ? "zero" : "positive"}
              onClick={() => openImpactCategory("closures")}
              aria-label={`${plannedClosures.length} ${plannedClosures.length === 1 ? "planned closure" : "planned closures"}`}
              title={`${plannedClosures.length} ${plannedClosures.length === 1 ? "Planned Closure" : "Planned Closures"}`}
            >
              <PlannedClosureIcon size={18} aria-hidden="true" />
              <span className="desktop-status-chip-count" data-digit-count={plannedClosures.length >= 10 ? "multiple" : "single"}>
                <span className="desktop-status-chip-count-value">{plannedClosures.length}</span>
              </span>
              <span className="desktop-status-chip-label">{plannedClosures.length === 1 ? "Planned Closure" : "Planned Closures"}</span>
            </button>
            {selectedNetwork === "ttc" ? <button
              type="button"
              className="desktop-status-chip desktop-status-chip--reduced-speed-zone"
              data-count={reducedSpeedZoneCount === 0 ? "zero" : "positive"}
              onClick={() => openImpactCategory("reduced-speed-zones")}
              aria-label={`${reducedSpeedZoneCount} ${reducedSpeedZoneCount === 1 ? "reduced speed zone" : "reduced speed zones"}`}
              title={`${reducedSpeedZoneCount} ${reducedSpeedZoneCount === 1 ? "Reduced Speed Zone" : "Reduced Speed Zones"}`}
            >
              <Construction size={18} aria-hidden="true" />
              <span className="desktop-status-chip-count" data-digit-count={reducedSpeedZoneCount >= 10 ? "multiple" : "single"}>
                <span className="desktop-status-chip-count-value">{reducedSpeedZoneCount}</span>
              </span>
              <span className="desktop-status-chip-label">
                {reducedSpeedZoneCount === 1 ? "Reduced Speed Zone" : "Reduced Speed Zones"}
              </span>
            </button> : null}
            {selectedNetwork === "regional" ? <button
              type="button"
              className="desktop-status-chip desktop-status-chip--trip-changes"
              data-count={(regionalTripChangeCount ?? 0) === 0 ? "zero" : "positive"}
              onClick={openRegionalTripChanges}
              aria-label={`${regionalTripChangeCount ?? 0} ${(regionalTripChangeCount ?? 0) === 1 ? "trip change" : "trip changes"}`}
              title={`${regionalTripChangeCount ?? 0} ${(regionalTripChangeCount ?? 0) === 1 ? "Trip Change" : "Trip Changes"}`}
            >
              <Train size={18} aria-hidden="true" />
              <span className="desktop-status-chip-count" data-digit-count={(regionalTripChangeCount ?? 0) >= 10 ? "multiple" : "single"}>
                <span className="desktop-status-chip-count-value">{regionalTripChangeCount ?? 0}</span>
              </span>
              <span className="desktop-status-chip-label">{(regionalTripChangeCount ?? 0) === 1 ? "Trip Change" : "Trip Changes"}</span>
            </button> : null}
          </div>
        </aside>

      </>
      )}

      {!showClosedScreen && mobileImpactInspectorOpen && selection ? (
        <MobileImpactInspector
          selection={selection}
          detent={mobileInspectorDetent}
          onChangeDetent={setMobileInspectorDetent}
          onUnfocus={handleClearMobileImpactSelection}
          onViewFullDetails={() => navigateForward(viewForImpactSelection(selection))}
          onSelectImpact={handleMapSelectImpact}
          commutePathPreview={commutePathPreview}
          onClearCommutePathPreview={handleClearCommutePathPreview}
        />
      ) : null}


      {showPwaInstallNudge ? (
        <PwaInstallNudge
          hasNativePrompt={pwaInstallPrompt.hasNativePrompt}
          installing={pwaInstallPrompt.installing}
          onDismiss={pwaInstallPrompt.dismissInstallPrompt}
          onRequestInstall={pwaInstallPrompt.requestInstall}
          platform={pwaInstallPrompt.platform}
        />
      ) : null}

      <ReleaseNotesNotice
        blocked={
          showClosedScreen ||
          rotatedMapMode ||
          showPwaInstallNudge ||
          activeView !== "map" ||
          Boolean(selection) ||
          Boolean(selectedStationId) ||
          Boolean(accountDialogMode) ||
          Boolean(commutePathPreview)
        }
        onViewReleaseNotes={() => {
          setSelection(null);
          setSelectedStationId(null);
          navigateForward("release-notes");
        }}
      />

      {isMobile && showMobileStatusPeek && (
        <div
          id="mobile-app-info-slot"
          className="mobile-app-info"
          data-guide-open={guideOpen ? "true" : undefined}
        />
      )}

      {isMobile && showMobileStatusPeek && (
        <div className="mobile-map-network-switch mobile-network-selector-slot" data-map-chooser-keepout>
          <NetworkSelector network={selectedNetwork} onChange={handleNetworkChange} compactVertical />
        </div>
      )}

      {isMobile && showMobileStatusPeek ? (
        <MobileStatusPeek
          fresh={isLive}
          isConnectionIssue={isConnectionIssue}
          isReturningToMap={hasLeftMap}
          lineStatuses={lineStatuses}
          activeAlertCount={activeAlerts.length}
          delayCount={delays.length}
          reducedSpeedZoneCount={reducedSpeedZoneCount}
          plannedClosureCount={plannedClosures.length}
          tripChangeCount={selectedNetwork === "regional" ? regionalTripChangeCount ?? 0 : 0}
          pollText={pollText}
          dataSource={displayData.dataSource}
          networkId={selectedNetwork}
          operatingNotice={mobileOperatingNotice}
          connectionNotice={mobileConnectionNotice}
          onOpenStatus={() => navigateForward("status")}
          onOpenCategory={(view) => {
            setSelection(null);
            if (view === "trip-changes") {
              openRegionalTripChanges();
              return;
            }
            navigateForward(view);
          }}
          onRecenter={() => setRecenterSignal((prev) => prev + 1)}
          onZoomIn={() => setZoomInSignal((prev) => prev + 1)}
          onZoomOut={() => setZoomOutSignal((prev) => prev + 1)}
        >
          {isMobile && <CurrentServicePanel
              data={displayData}
              notices={!displayData.snapshot && currentServiceNotices?.networkId === selectedNetwork ? currentServiceNotices.data : null}
              onNotice={handleSearchOpenSurfaceNotice}
              onImpact={handleSearchSelectImpact}
              onStatus={() => navigateForward("status")}
              onNotices={openServiceNotices}
            />}
        </MobileStatusPeek>
      ) : null}

      {!showClosedScreen && !rotatedMapMode && !mobileInspectorOpen && !selectedStationId ? (
        /* aria-label="Primary mobile navigation" */
        <MobileBottomNav
          activeKey={mobileNavKey}
          alertCount={activeAlerts.length}
          delayCount={delays.length}
          reducedSpeedZoneCount={reducedSpeedZoneCount}
          plannedClosureCount={plannedClosures.length}
          tripChangeCount={selectedNetwork === "regional" ? regionalTripChangeCount ?? 0 : 0}
          commuteAffectedCount={commuteAffectedCount}
          onSelect={onMobileNavSelect}
        />
      ) : null}
      {savedStationNotice ? (
        <div key={savedStationNoticeKey} className="saved-station-global-notice" role="status" aria-live="polite">
          <Bookmark size={16} fill="currentColor" aria-hidden="true" />
          <span>{savedStationNotice.message}</span>
          {savedStationNotice.linksToMyStations ? (
            <button type="button" className="saved-station-notice-action" onClick={openMyStations}>
              My Stations
            </button>
          ) : null}
        </div>
      ) : null}
      {accountDialogMode || isClosingAccount ? (
        <div
          className={`account-dialog-backdrop ${isClosingAccount ? "account-dialog-backdrop--closing" : ""}`}
          role="presentation"
          onMouseDown={closeAccountDialog}
        >
          <section
            className={`account-dialog ${isClosingAccount ? "account-dialog--closing" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={accountDialogAriaLabel()}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                closeAccountDialog();
              }
            }}
          >
            <div className="account-dialog-header">
              <div
                key={`intro-${accountDialogMode}-${accountEntryIntent}`}
                className="account-dialog-intro"
              >
                <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {accountDialogTitle()}
                </h2>
                <p className="account-dialog-description">{accountDialogDescription()}</p>
              </div>
              <button type="button" className="account-dialog-close" onClick={closeAccountDialog} aria-label="Close account dialog">
                <X size={20} />
              </button>
            </div>
            <form
              key={`${accountDialogMode}-${accountEntryIntent}`}
              data-account-dialog-view={accountDialogMode}
              data-account-dialog-intent={accountEntryIntent}
              className="flex flex-col gap-3 px-5 py-4"
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmitAccount();
              }}
            >
              {accountDialogMode === "auth-choice" ? (
                <>
                  <div className="account-provider-stack">
                    {authConfig.googleSignInAvailable ? (
                      <>
                        <div aria-label="Continue With Google">
                          <GoogleSignInButton
                            disabled={accountBusy}
                            mode="login"
                            onError={setAccountError}
                          />
                        </div>
                        <div className="account-auth-divider" aria-hidden="true">
                          <span>Or</span>
                        </div>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="account-choice-primary"
                      onClick={openEmailAuth}
                      disabled={accountBusy}
                    >
                      <Mail size={18} />
                      Continue With Email
                    </button>
                  </div>
                  {accountError ? (
                    <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
                      {accountError}
                    </p>
                  ) : null}
                  <div className="account-dialog-footer">
                    <button
                      type="button"
                      className="account-switch-button"
                      onClick={() => {
                        setAccountError(null);
                        setAccountEntryIntent(accountEntryIntent === "login" ? "register" : "login");
                      }}
                    >
                      {accountEntryIntent === "login" ? (
                        <>
                          <span className="account-switch-text">Don&apos;t have an account?</span>{" "}
                          <span className="account-switch-link">Sign Up</span>
                        </>
                      ) : (
                        <span className="account-switch-link">Already Have an Account?</span>
                      )}
                    </button>
                  </div>
                </>
              ) : accountDialogMode === "link-google" ? (
                <>
                  {accountSuccessMessage ? (
                    <div className="account-reset-status" role="status">
                      <p>{accountSuccessMessage}</p>
                    </div>
                  ) : (
                    <>
                      <p className="account-reset-hint">
                        Link Google sign-in to {accountState.user?.email}. The Google account email must match this LineWatch account.
                      </p>
                      {authConfig.googleSignInAvailable ? (
                        <div aria-label="Link Google">
                          <GoogleSignInButton
                            disabled={accountBusy}
                            mode="link"
                            returnTo={googleLinkSuccessReturnTo()}
                            onError={setAccountError}
                          />
                        </div>
                      ) : (
                        <p className="account-reset-hint">Google sign-in is not configured for this environment.</p>
                      )}
                    </>
                  )}
                  {accountError ? (
                    <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
                      {accountError}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="account-link-button"
                    onClick={() => {
                      setAccountError(null);
                      closeAccountDialog();
                    }}
                  >
                    Back To Account
                  </button>
                </>
              ) : accountDialogMode === "verify-email" ? (
                <>
                  {accountSuccessMessage ? (
                    <div className="account-reset-status" role="status">
                      <p>{accountSuccessMessage}</p>
                    </div>
                  ) : (
                    <>
                      {accountVerificationMessage ? (
                        <div className="account-reset-status" role="status">
                          <p>{accountVerificationMessage}</p>
                        </div>
                      ) : accountBusy ? (
                        <p className="account-reset-hint" role="status">Creating your verified account…</p>
                      ) : (
                        <p className="account-reset-hint">Use the secure link sent to your email address. Verification links expire after 24 hours.</p>
                      )}
                      {accountEmail ? (
                        <p className="account-reset-hint">Verification address: <strong>{accountEmail}</strong></p>
                      ) : !accountVerificationToken || accountError ? (
                        <label className="account-field">
                          <span>{accountVerificationToken ? "Email for a new link" : "Email"}</span>
                          <input
                            type="email"
                            value={accountEmail}
                            autoComplete="email"
                            onBlur={() => setAccountEmail((current) => normalizeAccountEmail(current))}
                            onChange={(event) => setAccountEmail(event.target.value)}
                          />
                        </label>
                      ) : null}
                      {accountVerificationToken ? (
                        <>
                          <p className="account-reset-hint">Choose the password you will use after verification. It was intentionally not accepted before mailbox ownership was proven.</p>
                          <label className="account-field">
                            <span>Password</span>
                            <input
                              type="password"
                              value={accountPassword}
                              autoComplete="new-password"
                              aria-describedby="account-verification-password-help"
                              onChange={(event) => setAccountPassword(event.target.value)}
                            />
                          </label>
                          <label className="account-field">
                            <span>Confirm password</span>
                            <input
                              type="password"
                              value={accountPasswordConfirmation}
                              autoComplete="new-password"
                              onChange={(event) => setAccountPasswordConfirmation(event.target.value)}
                            />
                          </label>
                          <p id="account-verification-password-help" className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                            Use at least 8 characters with a letter and a number, symbol, or space.
                          </p>
                        </>
                      ) : null}
                      {accountDevVerificationToken ? (
                        <>
                          <p className="account-reset-dev-note">Local dev mode: no email was sent. Use this one-time token to test account verification.</p>
                          <button
                            type="button"
                            className="account-primary-button"
                            onClick={() => void handleConfirmEmailVerification(accountDevVerificationToken)}
                            disabled={accountBusy}
                          >
                            Verify Local Account
                          </button>
                        </>
                      ) : null}
                    </>
                  )}
                  {accountError ? (
                    <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
                      {accountError}
                    </p>
                  ) : null}
                  {accountSuccessMessage ? (
                    <button
                      type="button"
                      className="account-primary-button"
                      onClick={() => {
                        closeAccountDialog();
                        resetAccountForm();
                      }}
                    >
                      Continue
                    </button>
                  ) : (
                    <>
                      {accountVerificationToken && !accountDevVerificationToken && !accountBusy ? (
                        <button
                          type="button"
                          className="account-primary-button"
                          onClick={() => void handleConfirmEmailVerification()}
                        >
                          Verify Email
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="account-link-button"
                        onClick={() => void handleRequestEmailVerification()}
                        disabled={accountBusy || !accountEmail.trim()}
                      >
                        Send New Verification Link
                      </button>
                      <button
                        type="button"
                        className="account-link-button"
                        onClick={() => {
                          setAccountError(null);
                          setAccountVerificationMessage(null);
                          setAccountDevVerificationToken(null);
                          openAccountDialog("login");
                        }}
                      >
                        Back To Sign In
                      </button>
                    </>
                  )}
                </>
              ) : accountDialogMode === "forgot-password" ? (
                <>
                  <label className="account-field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={accountEmail}
                      autoComplete="email"
                      onBlur={() => setAccountEmail((current) => normalizeAccountEmail(current))}
                      onChange={(event) => setAccountEmail(event.target.value)}
                    />
                  </label>
                  {accountResetMessage ? (
                    <div className="account-reset-status" role="status">
                      <p>{accountResetMessage}</p>
                      {accountDevResetToken ? (
                        <>
                          <p className="account-reset-dev-note">Local dev mode: no email was sent. Use this generated token to test recovery.</p>
                          <button
                            type="button"
                            className="account-link-button"
                            onClick={() => {
                              setAccountResetToken(accountDevResetToken);
                              setAccountPassword("");
                              setAccountPasswordConfirmation("");
                              setAccountError(null);
                              openAccountDialog("reset-password");
                            }}
                          >
                            Open Local Reset Form
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {accountError ? (
                    <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
                      {accountError}
                    </p>
                  ) : null}
                  <button type="button" className="account-primary-button" onClick={handleRequestPasswordReset} disabled={accountBusy}>
                    Send Reset Link
                  </button>
                  <button
                    type="button"
                    className="account-link-button"
                    onClick={() => {
                      setAccountError(null);
                      setAccountResetMessage(null);
                      setAccountDevResetToken(null);
                      openAccountDialog("login");
                    }}
                  >
                    Back To Sign In
                  </button>
                </>
              ) : accountDialogMode === "reset-password" ? (
                <>
                  {accountResetToken.trim() ? (
                    <p className="account-reset-hint">Enter a new password to finish recovery.</p>
                  ) : (
                    <label className="account-field">
                      <span>Reset token</span>
                      <input
                        value={accountResetToken}
                        autoComplete="one-time-code"
                        onChange={(event) => setAccountResetToken(event.target.value)}
                      />
                    </label>
                  )}
                  <label className="account-field">
                    <span>New password</span>
                    <input
                      type="password"
                      value={accountPassword}
                      autoComplete="new-password"
                      aria-describedby="account-password-help"
                      onChange={(event) => setAccountPassword(event.target.value)}
                    />
                  </label>
                  <label className="account-field">
                    <span>Confirm password</span>
                    <input
                      type="password"
                      value={accountPasswordConfirmation}
                      autoComplete="new-password"
                      onChange={(event) => setAccountPasswordConfirmation(event.target.value)}
                    />
                  </label>
                  <p id="account-password-help" className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                    Use at least 8 characters with a letter and a number, symbol, or space.
                  </p>
                  {accountError ? (
                    <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
                      {accountError}
                    </p>
                  ) : null}
                  <button type="button" className="account-primary-button" onClick={handleConfirmPasswordReset} disabled={accountBusy}>
                    Reset Password
                  </button>
                  <button
                    type="button"
                    className="account-link-button"
                    onClick={() => {
                      setAccountError(null);
                      openAccountDialog("login");
                    }}
                  >
                    Back To Sign In
                  </button>
                </>
              ) : (
                <>
                  {accountDialogMode === "register" ? (
                    <label className="account-field">
                      <span>Display name</span>
                      <input value={accountDisplayName} onChange={(event) => setAccountDisplayName(event.target.value)} />
                    </label>
                  ) : null}
                  <label className="account-field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={accountEmail}
                      autoComplete="email"
                      aria-invalid={Boolean(accountError && accountDialogMode === "register")}
                      onBlur={() => setAccountEmail((current) => normalizeAccountEmail(current))}
                      onChange={(event) => setAccountEmail(event.target.value)}
                    />
                  </label>
                  {accountDialogMode === "login" ? (
                    <label className="account-field">
                      <span>Password</span>
                      <input
                        type="password"
                        value={accountPassword}
                        autoComplete="current-password"
                        onChange={(event) => setAccountPassword(event.target.value)}
                      />
                    </label>
                  ) : null}
                  {accountDialogMode === "login" ? (
                    <button
                      type="button"
                      className="account-link-button justify-self-start"
                      onClick={() => {
                        setAccountError(null);
                        setAccountResetMessage(null);
                        setAccountDevResetToken(null);
                        openAccountDialog("forgot-password");
                      }}
                    >
                      Forgot Password?
                    </button>
                  ) : null}
                  {accountDialogMode === "register" ? (
                    <p className="account-reset-hint">
                      We will email a one-time link. You will choose your password only after opening it, so nobody else can pre-register a password for your address.
                    </p>
                  ) : null}
                  {accountError ? (
                    <p id="account-error-live" role="alert" className="text-xs font-semibold text-red-600 dark:text-red-300">
                      {accountError}
                    </p>
                  ) : null}
                  <button type="submit" className="account-primary-button" disabled={accountBusy}>
                    {accountDialogMode === "login" ? "Sign In" : "Create Account"}
                  </button>
                  <button
                    type="button"
                    className="account-link-button"
                    onClick={() => {
                      setAccountError(null);
                      openAccountDialog("auth-choice");
                    }}
                  >
                    Back To Options
                  </button>
                </>
              )}
            </form>
          </section>
        </div>
      ) : null}
      {isMobile && (!showClosedScreen || displayData.snapshot) && dashboardAvailabilityNotice ? (
        <div
          className={`dashboard-availability-notice ${isMobile && (!displayData.snapshot || showMobileStatusPeek && !showClosedScreen) ? "dashboard-availability-notice--mobile-hidden" : ""}`}
          data-state={dashboardRequestState === "reconnecting" ? "reconnecting" : displayData.availability}
          role="status"
          aria-live="polite"
        >
          <AlertTriangle className="dashboard-availability-notice-icon" aria-hidden="true" />
          <span>
            {dashboardAvailabilityNotice}
            {dashboardRequestState === "reconnecting" && (
              <Loader2
                className="dashboard-availability-notice-spinner"
                size={12}
                aria-hidden="true"
              />
            )}
          </span>
        </div>
      ) : null}
      <OpeningDisclaimer
        onVisibilityChange={setDisclaimerVisible}
        onOpenCreateAccount={() => openAuthChoice("register")}
        onOpenSignIn={() => openAuthChoice("login")}
        hideNoticeOnMobile={isMobile && !showMobileStatusPeek}
      />
      {/* Desktop live region for screen reader announcements */}
      <div
        className="desktop-live-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {desktopLiveAnnouncement}
      </div>
    </div>
    </DataProvider>
  );
}

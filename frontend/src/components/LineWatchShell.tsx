"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { DynamicBackground } from "./DynamicBackground";
import { BACKGROUND_PREFERENCE_LABEL } from "../app/background-preference";
import { NetworkMap } from "./NetworkMap";
import { NetworkSelector } from "./NetworkSelector";
import { DefaultMapModeControl } from "./DefaultMapModeControl";
import { RegionalStationDetailPanel } from "./RegionalStationDetailPanel";
import { DelayIcon } from "./DelayIcon";
import { ActiveAlertsPanel } from "./ActiveAlertsPanel";
import { DelaysPanel } from "./DelaysPanel";
import { ReducedSpeedZonesPanel } from "./ReducedSpeedZonesPanel";
import { PlannedClosuresPanel } from "./PlannedClosuresPanel";
import { SavedCommutesPanel } from "./SavedCommutesPanel";
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
import { MobileStatusPeek } from "./MobileStatusPeek";
import { MobileMapControls, PhoneRotateLandscapeIcon, type MapPresentationMode } from "./MobileMapControls";
import { RotatedMapSelectionCard } from "./RotatedMapSelectionCard";
import { MobileImpactInspector, type MobileInspectorDetent } from "./MobileImpactInspector";
import { MobileStatusSheet } from "./MobileStatusSheet";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { PwaInstallNudge } from "./PwaInstallNudge";
import { usePwaInstallPrompt } from "../hooks/usePwaInstallPrompt";
import { TransitLineBadge } from "./TransitLineBadge";
import { LogsDropdown } from "./LogsDropdown";
import { SiteGuideDropdown } from "./SiteGuideDropdown";
import { ScrollOverflowAffordances } from "./ScrollOverflowAffordances";
import { DataProvider, DashboardData } from "../app/DataContext";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import {
  type AccessibilityOutageResponse,
  getAccessibilityOutages,
} from "../app/accessibility-outage-data";
import { AccessibilityOutagesPanel, type AccessibilityOutageTarget } from "./AccessibilityOutagesPanel";
import { getSurfaceNotices, type SurfaceNoticeDetail } from "../app/surface-notice-data";
import { SurfaceNoticesPanel } from "./SurfaceNoticesPanel";
import {
  fallbackStationSummaries,
  getStationDetail,
  getStationSummaries,
  type StationDataResult,
  type StationDetail,
  type StationSummary,
} from "../app/station-data";
import { StationDetailPanel } from "./StationDetailPanel";
import {
  EMPTY_ESTIMATED_TRAIN_SNAPSHOT,
  EMPTY_REGIONAL_TRAIN_SNAPSHOT,
  estimatedTrainMarkerRefreshMs,
  getEstimatedTrainMarkers,
  type EstimatedTrainSnapshot,
} from "../app/train-markers";
import { useTorontoClock } from "../hooks/useTorontoClock";
import { useMobilePerformanceMode } from "../hooks/useMobilePerformanceMode";
import { usePushNotificationSettings } from "../hooks/usePushNotificationSettings";
import { Menu, X, Map as MapIcon, Train, AlertTriangle, Bookmark, Navigation, ShieldCheck, BarChart3, Bell, Construction, Search, LogIn, LogOut, UserPlus, UserRound, Sun, Moon, Bus, Mail, Contrast, Pause, History, MessageSquareText, FileText, Sparkles, Pin, PinOff } from "lucide-react";
import { SubwayClosedScreen } from "./SubwayClosedScreen";
import { useSubwayOperatingState } from "../hooks/useSubwayOperatingState";
import { GoUpClosedScreen } from "./GoUpClosedScreen";
import { GoUpClosingSoonChip } from "./GoUpClosingSoonChip";
import { useRegionalRailOperatingState } from "../hooks/useRegionalRailOperatingState";
import { StationSearchPanel } from "./StationSearchPanel";
import { OpeningDisclaimer } from "./OpeningDisclaimer";
import { SubwayClosingSoonChip } from "./SubwayClosingSoonChip";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import {
  AccountRequestError,
  confirmPasswordReset,
  commutePathPreviewFromCommute,
  getAuthConfig,
  getCurrentAccount,
  getSavedCommutes,
  loginAccount,
  loginDemoAccount,
  loginWithGoogle,
  linkGoogleAccount,
  logoutAccount,
  registerAccount,
  requestPasswordReset,
  summarizeSavedCommuteStatuses,
  unavailableAuthConfig,
  type AccountState,
  type AccountSavedCommute,
  type AccountCommutePathPreview,
  type AccountCommuteLegId,
  type AccountMatchedImpact,
  type AuthConfig,
} from "../app/account-data";
import {
  getSavedStations,
  removeSavedStation,
  saveStation,
  type AccountSavedStation,
} from "../app/saved-station-data";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { accountOAuthErrorState } from "../app/account-oauth-error";
import { normalizeAccountEmail, validateAccountCredentials } from "../app/account-validation";
import { getCurrentPushSubscription } from "../app/push-browser-state";
import { hasReleaseNotes } from "../app/release-notes";
import { lineWatchAppVersionLabel } from "../app/app-build";
import { clearServiceStatusLabel } from "../app/network-presentation";
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
import { apiUrl } from "../app/api-client";
import { popViewHistory, pushViewHistory } from "../app/view-navigation";


type ActiveView = "map" | "menu" | "search" | "status" | "alerts" | "delays" | "reduced-speed-zones" | "closures" | "commutes" | "notifications" | "analytics" | "more" | "my-stations" | "accessibility-outages" | "surface-notices" | "alert-history" | "feedback" | "privacy-acknowledgements" | "release-notes";
type ImpactCategoryView = "alerts" | "delays" | "reduced-speed-zones" | "closures";
type AccountDialogMode = "auth-choice" | "login" | "register" | "forgot-password" | "reset-password" | "link-google";
type AccountEntryIntent = "login" | "register";
type SavedStationNotice = {
  message: string;
  linksToMyStations?: boolean;
};

const DEFAULT_DASHBOARD_REFRESH_MS = 30_000;
const MIN_DASHBOARD_REFRESH_MS = 10_000;
const STATION_DETAIL_REFRESH_MS = 15_000;
const GOOGLE_LINK_SUCCESS_PARAM = "account_linked";
const GOOGLE_LINK_SUCCESS_VALUE = "google";
const GOOGLE_LINK_SUCCESS_MESSAGE = "Google sign-in has been linked to your account.";

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
  initialPasswordResetToken = "",
  initialVisualPreferences = defaultVisualPreferences,
}: {
  initialData: DashboardData;
  initialPasswordResetToken?: string;
  initialVisualPreferences?: InitialVisualPreferences;
}) {
  const router = useRouter();
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkId>(initialVisualPreferences.defaultNetwork);
  const [initialMapReady, setInitialMapReady] = useState(false);
  const [defaultNetworkPreference, setDefaultNetworkPreference] = useState<NetworkId>(initialVisualPreferences.defaultNetwork);
  const [ttcData, setTtcData] = useState(initialData);
  const [regionalData, setRegionalData] = useState(regionalDashboardData);
  const regionalScenarioActiveRef = useRef(false);
  const displayData = selectedNetwork === "regional" ? regionalData : ttcData;
  const networkViewTransitionRef = useRef<{
    finished: Promise<void>;
    skipTransition: () => void;
  } | null>(null);
  const crossNetworkStationSelectionRef = useRef<{ networkId: NetworkId; stationId: string } | null>(null);

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
    if (initialData.dataSource === "backend") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTtcData(initialData);
      return;
    }

    setTtcData((previous) => {
      if (previous.dataSource === "backend") {
        return previous;
      }
      return initialData;
    });
  }, [initialData]);

  const fetchRegionalDashboard = useCallback(async () => {
    if (regionalScenarioActiveRef.current || document.visibilityState !== "visible") return;
    try {
      const [response, reliabilityResponse] = await Promise.all([
        fetch(apiUrl("/api/dashboard?network=regional"), {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        }),
        fetch(apiUrl("/api/reliability/lines?network=regional"), {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        }),
      ]);
      if (!response.ok) throw new Error(`Regional dashboard request failed (${response.status})`);
      const payload = await response.json() as RegionalDashboardApiResponse;
      const reliability = reliabilityResponse.ok
        ? await reliabilityResponse.json() as DashboardData["reliability"]
        : regionalDashboardData.reliability;
      setRegionalData(regionalDashboardDataFromApi(payload));
      setRegionalData((current) => ({ ...current, reliability }));
    } catch {
      setRegionalData(regionalDashboardData);
    }
  }, []);

  useEffect(() => {
    if (selectedNetwork !== "regional" || regionalScenarioActiveRef.current) return;
    void fetchRegionalDashboard();
    const interval = window.setInterval(fetchRegionalDashboard, dashboardRefreshIntervalMs());
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void fetchRegionalDashboard();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchRegionalDashboard, selectedNetwork]);

  const {
    generatedAt,
    activeAlerts,
    delays,
    reducedSpeedZones,
    lineStatuses,
    ingestionHealth,
    plannedClosures,
  } = displayData;
  const totalAlertCount =
    activeAlerts.length
    + delays.length
    + reducedSpeedZones.length
    + plannedClosures.length;
  const pollText = generatedAt.lastPoll.replace(/succeeded\s*/i, "");
  const [isDark, setIsDark] = useState(initialVisualPreferences.theme === "dark");
  const [highContrast, setHighContrast] = useState(initialVisualPreferences.highContrast);
  const [reducedMotion, setReducedMotion] = useState(initialVisualPreferences.reducedMotion);
  const [reducedMotionOverride, setReducedMotionOverride] = useState(initialVisualPreferences.reducedMotionOverride);
  const [dotBackgroundEnabled, setDotBackgroundEnabled] = useState(initialVisualPreferences.dotBackgroundEnabled);
  const [visualPreferencesReady, setVisualPreferencesReady] = useState(false);
  const mobilePerformanceMode = useMobilePerformanceMode();
  const [activeView, setActiveView] = useState<ActiveView>("map");
  const [impactListLaunch, setImpactListLaunch] = useState({ lineId: null as string | null, requestId: 0 });
  const [navDirection, setNavDirection] = useState<"root" | "forward" | "back">("root");
  const [menuPinned, setMenuPinned] = useState(false);
  const [menuPinPreferenceReady, setMenuPinPreferenceReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const activeViewRef = useRef<ActiveView>("map");
  const viewHistoryRef = useRef<ActiveView[]>([]);
  const [mobileInspectorDetent, setMobileInspectorDetent] = useState<MobileInspectorDetent>("details-focus");
  const [mapLayoutSignal, setMapLayoutSignal] = useState(0);
  const [mapPresentationMode, setMapPresentationMode] = useState<MapPresentationMode>("standard");
  const [pwaEngagementSignal, setPwaEngagementSignal] = useState(0);
  const [estimatedTrainsEnabled, setEstimatedTrainsEnabled] = useState(initialVisualPreferences.estimatedTrainsEnabled);
  const [estimatedTrainSnapshot, setEstimatedTrainSnapshot] = useState<EstimatedTrainSnapshot>(EMPTY_ESTIMATED_TRAIN_SNAPSHOT);
  const subwayOperatingState = useSubwayOperatingState();
  const regionalRailOperatingState = useRegionalRailOperatingState();
  const trainNetworkOpen = selectedNetwork === "ttc"
    ? subwayOperatingState.status === "open"
    : regionalRailOperatingState.status === "open";
  const estimatedTrainMarkersVisible = estimatedTrainsEnabled && trainNetworkOpen;

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
          setEstimatedTrainSnapshot(result.data);
        }
      } finally {
        trainMarkerRefreshInFlight = false;
      }
    };

    if (estimatedTrainMarkersVisible) {
      refresh();
      intervalId = window.setInterval(refresh, estimatedTrainMarkerRefreshMs());
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEstimatedTrainSnapshot(selectedNetwork === "regional"
        ? EMPTY_REGIONAL_TRAIN_SNAPSHOT
        : EMPTY_ESTIMATED_TRAIN_SNAPSHOT);
    }

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [estimatedTrainMarkersVisible, selectedNetwork]);


  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const visualViewport = window.visualViewport;

    const updateViewportHeight = () => {
      const height = visualViewport ? visualViewport.height : window.innerHeight;
      const width = visualViewport ? visualViewport.width : window.innerWidth;
      const offsetTop = visualViewport ? visualViewport.offsetTop : 0;
      const offsetLeft = visualViewport ? visualViewport.offsetLeft : 0;
      const scale = visualViewport ? visualViewport.scale : 1;
      const keyboardInset = Math.max(0, window.innerHeight - height - offsetTop);
      const keyboardOpen = keyboardInset > 120 || height < window.innerHeight * 0.78;
      const root = document.documentElement;

      root.style.setProperty("--visual-viewport-height", `${Math.round(height)}px`);
      root.style.setProperty("--visual-viewport-width", `${Math.round(width)}px`);
      root.style.setProperty("--visual-viewport-offset-top", `${Math.round(offsetTop)}px`);
      root.style.setProperty("--visual-viewport-offset-left", `${Math.round(offsetLeft)}px`);
      root.style.setProperty("--visual-viewport-scale", String(scale));
      root.style.setProperty("--visual-keyboard-inset", `${Math.round(keyboardInset)}px`);
      root.dataset.visualKeyboard = keyboardOpen ? "open" : "closed";
    };

    updateViewportHeight();

    if (visualViewport) {
      visualViewport.addEventListener("resize", updateViewportHeight);
      visualViewport.addEventListener("scroll", updateViewportHeight);
      return () => {
        visualViewport.removeEventListener("resize", updateViewportHeight);
        visualViewport.removeEventListener("scroll", updateViewportHeight);
        delete document.documentElement.dataset.visualKeyboard;
      };
    } else {
      window.addEventListener("resize", updateViewportHeight);
      return () => {
        window.removeEventListener("resize", updateViewportHeight);
        delete document.documentElement.dataset.visualKeyboard;
      };
    }
  }, []);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  const navigateForward = useCallback((nextView: ActiveView) => {
    const currentView = activeViewRef.current;
    viewHistoryRef.current = pushViewHistory(viewHistoryRef.current, currentView, nextView);
    activeViewRef.current = nextView;
    setNavDirection("forward");
    setActiveView(nextView);
  }, [setActiveView]);

  const navigateRoot = useCallback((nextView: ActiveView) => {
    viewHistoryRef.current = [];
    activeViewRef.current = nextView;
    setNavDirection("root");
    setActiveView(nextView);
  }, [setActiveView]);

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
    if (!isMobile && mapPresentationMode !== "standard") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMapPresentationMode("standard");
    }
  }, [isMobile, mapPresentationMode]);

  useEffect(() => {
    if (!isMobile) return;
    const timer = window.setTimeout(() => {
      setMapLayoutSignal((current) => current + 1);
    }, mapPresentationMode === "rotated-landscape" ? 90 : 50);

    return () => window.clearTimeout(timer);
  }, [isMobile, mapPresentationMode]);

  const clock = useTorontoClock(generatedAt.time);
  const [recenterSignal, setRecenterSignal] = useState(0);

  const [closedMapPeek, setClosedMapPeek] = useState(false);
  const [closedScreenAcknowledged, setClosedScreenAcknowledged] = useState(false);
  const [isClosedScreenExiting, setIsClosedScreenExiting] = useState(false);
  const [isExitingPeekChip, setIsExitingPeekChip] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [disclaimerVisible, setDisclaimerVisible] = useState(true);

  const selectedNetworkIsClosed = selectedNetwork === "ttc"
    ? subwayOperatingState.status === "closed"
    : regionalRailOperatingState.status === "closed";

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
  const openLegendImpactCategory = useCallback((view: ImpactCategoryView, lineId: string) => {
    navigateForward("menu");
    openImpactCategory(view, lineId);
  }, [navigateForward, openImpactCategory]);
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
  const [stationPanelActivationKey, setStationPanelActivationKey] = useState(0);
  const [visibleStationResult, setVisibleStationResult] = useState<StationDataResult<StationDetail | null> | null>(null);
  const [stationLoading, setStationLoading] = useState(false);
  const [accessibilityOutageState, setAccessibilityOutageState] = useState<{
    networkId: NetworkId;
    data: AccessibilityOutageResponse;
  } | null>(null);
  const accessibilityOutageResult = accessibilityOutageState?.networkId === selectedNetwork
    ? accessibilityOutageState.data
    : null;
  const [accessibilityOutageTarget, setAccessibilityOutageTarget] = useState<AccessibilityOutageTarget | null>(null);
  const [expandedMyStationDisruptionIds, setExpandedMyStationDisruptionIds] = useState<Set<string>>(() => new Set());
  const [surfaceNoticeCount, setSurfaceNoticeCount] = useState<number | null>(null);
  const [surfaceNoticeInitialQuery, setSurfaceNoticeInitialQuery] = useState("");

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
    setIsClosingPanel(true);
    viewHistoryRef.current = [];
    setSelectedStationId(null);
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
    }, reducedMotion ? 0 : 200);
  }, [isClosingPanel, reducedMotion, setActiveView, setSelection, setSelectedStationId, setMapPresentationMode, setMobileInspectorDetent]);

  const [isGoingBack, setIsGoingBack] = useState(false);
  const backTimeoutRef = useRef<number | null>(null);

  const handleSubmenuBack = useCallback(() => {
    setNavDirection("back");
    setIsGoingBack(true);
    if (backTimeoutRef.current) {
      window.clearTimeout(backTimeoutRef.current);
    }
    backTimeoutRef.current = window.setTimeout(() => {
      const mobileFallback = activeView === "alerts"
        || activeView === "delays"
        || activeView === "reduced-speed-zones"
        || activeView === "closures"
        || activeView === "accessibility-outages"
        || activeView === "surface-notices"
          ? "status"
          : activeView === "commutes"
            ? "map"
            : "more";
      const fallback: ActiveView = isMobile ? mobileFallback : "menu";
      const previous = popViewHistory(viewHistoryRef.current, fallback);
      viewHistoryRef.current = previous.history;
      activeViewRef.current = previous.view;
      setActiveView(previous.view);
      setIsGoingBack(false);
      setSelection(null);
      setAccessibilityOutageTarget(null);
    }, reducedMotion ? 0 : 180);
  }, [activeView, isMobile, reducedMotion, setActiveView, setSelection]);

  const [accountState, setAccountState] = useState<AccountState>({
    source: "unavailable",
    authenticated: false,
    user: null,
  });
  const [accountDialogMode, setAccountDialogMode] = useState<AccountDialogMode | null>(initialPasswordResetToken.trim() ? "reset-password" : null);
  const [accountEntryIntent, setAccountEntryIntent] = useState<AccountEntryIntent>("login");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirmation, setAccountPasswordConfirmation] = useState("");
  const [accountResetToken, setAccountResetToken] = useState(initialPasswordResetToken.trim());
  const [accountResetMessage, setAccountResetMessage] = useState<string | null>(null);
  const [accountDevResetToken, setAccountDevResetToken] = useState<string | null>(null);
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
  const [commutesActiveTab, setCommutesActiveTab] = useState<"create" | "saved">("saved");
  const [commutePathPreview, setCommutePathPreview] = useState<AccountCommutePathPreview | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig>(unavailableAuthConfig);

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
    if (activeView !== "commutes") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCommutesActiveTab("saved");
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
      ? estimatedTrainSnapshot.fresh
        ? `${estimatedTrainSnapshot.markers.length} shown`
        : "Waiting"
      : "Off";

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
    () => summarizeSavedCommuteStatuses(
      accountCommutes.filter((commute) => (commute.networkId ?? "ttc") === selectedNetwork)
    ),
    [accountCommutes, selectedNetwork]
  );

  useEffect(() => {
    let cancelled = false;
    getCurrentAccount().then((state) => {
      if (!cancelled) {
        setAccountState(state);
      }
    });
    return () => {
      cancelled = true;
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
      setAccountDialogMode("link-google");
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
          setAccountDialogMode(oauthErrorState.dialogMode);
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
    };
    if (hasReleaseNotes) {
      panelToView["release-notes"] = "release-notes";
    }
    const impactKind = params.get("impactKind") as ImpactKind;
    const impactId = params.get("impactId");
    const impactSelection = impactKind && impactId
      ? { kind: impactKind, id: impactId } as const
      : null;

    if (impactSelection) {
      // Notification URLs include their category panel as a fallback. A concrete
      // impact should instead take the same focused map path as Show on Map, where
      // mobile reserves a real viewport above the selected impact details.
      setSelection(impactSelection);
      setMobileInspectorDetent("details-focus");
      setActiveView("map");
      if (panel) {
        nextParams.delete("panel");
        shouldReplaceUrl = true;
      }
    } else if (panel && panelToView[panel]) {
      setActiveView(panelToView[panel]);
      nextParams.delete("panel");
      shouldReplaceUrl = true;
    }

    if (shouldReplaceUrl) {
      replaceBrowserSearchParams(nextParams);
    }
  }, []);

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
    navigateForward("my-stations");
  };

  const resetAccountForm = () => {
    setAccountEmail("");
    setAccountPassword("");
    setAccountPasswordConfirmation("");
    setAccountDisplayName("");
    setAccountResetToken("");
    setAccountResetMessage(null);
    setAccountDevResetToken(null);
    setAccountError(null);
    setAccountSuccessMessage(null);
  };

  const openAuthChoice = (intent: AccountEntryIntent) => {
    resetAccountForm();
    setAccountEntryIntent(intent);
    setAccountDialogMode("auth-choice");
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
    if (!accountState.authenticated) {
      setAccountEntryIntent("register");
      setAccountDialogMode("auth-choice");
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
  }, [accountState.authenticated, pendingSavedStationIds, savedStations, selectedNetwork, setAccountDialogMode, setAccountEntryIntent, setAccountError, setSavedStationPending, showSavedStationNotice, stationCatalogs]);

  const handleRemoveSavedStation = useCallback(async (stationId: string, networkId: NetworkId = selectedNetwork) => {
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
  }, [accountState.authenticated, pendingSavedStationIds, savedStations, selectedNetwork, setSavedStationPending, showSavedStationNotice]);

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
    setAccountDialogMode(accountEntryIntent);
  };

  const openGoogleLinkDialog = () => {
    resetAccountForm();
    setAccountDialogMode("link-google");
  };

  const accountDialogTitle = () => {
    switch (accountDialogMode) {
      case "auth-choice":
        return accountEntryIntent === "register" ? "Create Account" : "Sign In";
      case "link-google":
        return "Link Google";
      case "register":
        return "Create Account";
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
    if (accountDialogMode === "forgot-password") {
      handleRequestPasswordReset();
      return;
    }
    if (accountDialogMode === "reset-password") {
      handleConfirmPasswordReset();
      return;
    }

    const validation = validateAccountCredentials({
      mode: accountDialogMode,
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
      const response = accountDialogMode === "login"
        ? await loginAccount({ email: normalizedEmail, password: accountPassword })
        : await registerAccount({
            email: normalizedEmail,
            password: accountPassword,
            displayName: accountDisplayName.trim(),
          });
      setAccountState({ source: "backend", authenticated: response.authenticated, user: response.user });
      setAccountDialogMode(null);
      resetAccountForm();
    } catch (error) {
      if (error instanceof AccountRequestError) {
        setAccountError(error.message);
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
      setAccountDialogMode(null);
      resetAccountForm();
      router.replace("/");
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
      setAccountDialogMode(null);
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
      setAccountDialogMode("link-google");
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

    setCommutePathPreview(preview);
    setSelection(null);
    setSelectedStationId(null);
    setActiveView("map");
  };

  const handleViewCommuteImpactOnPath = (
    commute: AccountSavedCommute,
    legId: AccountCommuteLegId,
    impact: AccountMatchedImpact,
  ) => {
    const preview = commutePathPreviewFromCommute(commute, legId);
    if (!preview) return;

    const impactSelection = { kind: impact.kind, id: impact.id } satisfies NonNullable<ImpactSelection>;
    setCommutePathPreview(preview);
    setSelection(impactSelection);
    setSelectedStationId(null);
    setMobileInspectorDetent("details-focus");
    setActiveView(isMobile ? "map" : viewForSavedCommuteImpact(impact, activeAlerts));
  };

  const handleClearCommutePathPreview = useCallback((commuteIdOrEvent?: string | unknown) => {
    const commuteId = typeof commuteIdOrEvent === "string" ? commuteIdOrEvent : undefined;
    setCommutePathPreview((current) => {
      if (!current) return null;
      if (commuteId && current.id !== commuteId && current.commuteId !== commuteId) {
        return current;
      }
      window.setTimeout(() => {
        setSelection(null);
        setSelectedStationId(null);
        setActiveView("commutes");
      }, 0);
      return null;
    });
  }, [setCommutePathPreview, setSelection, setSelectedStationId, setActiveView]);

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const stationSearchInputRef = useRef<HTMLInputElement>(null);
  const headerSearchBarRef = useRef<HTMLDivElement>(null);
  const stationKeyDownHandlerRef = useRef<((event: KeyboardEvent<HTMLInputElement>) => void) | null>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const menuActionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const registerMenuAction = (index: number) => (element: HTMLButtonElement | null) => {
    // eslint-disable-next-line react-hooks/refs
    menuActionRefs.current[index] = element;
  };

  const focusMenuAction = (index: number) => {
    const actions = menuActionRefs.current.filter((element): element is HTMLButtonElement => element !== null && !element.disabled);
    if (actions.length === 0) return;
    const nextIndex = Math.max(0, Math.min(index, actions.length - 1));
    actions[nextIndex]?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const actions = menuActionRefs.current.filter((element): element is HTMLButtonElement => element !== null && !element.disabled);
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
      const timer = window.setTimeout(() => focusMenuAction(0), 40);
      return () => window.clearTimeout(timer);
    }
  }, [activeView]);

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
      const res = await getSurfaceNotices({ limit: 0 });
      if (res.source === "backend" && res.data.fresh) {
        const scCount = res.data.categories.find(c => c.category === "service-change")?.count ?? 0;
        const bpCount = res.data.categories.find(c => c.category === "bypass")?.count ?? 0;
        setSurfaceNoticeCount(scCount + bpCount);
      } else {
        setSurfaceNoticeCount(null);
      }
    } catch (err) {
      console.error("Failed to fetch surface notices count:", err);
    }
  }, []);

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

      if (selectedNetwork === "ttc") router.refresh();
      fetchAccessibilityOutages();
      if (selectedNetwork === "ttc") fetchSurfaceNoticesCount();
    };

    const interval = window.setInterval(refreshDashboardData, dashboardRefreshIntervalMs());
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (selectedNetwork === "ttc") router.refresh();
        fetchAccessibilityOutages();
        if (selectedNetwork === "ttc") fetchSurfaceNoticesCount();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [closedMapPeek, router, selectedNetwork, subwayOperatingState.status, regionalRailOperatingState.status, fetchAccessibilityOutages, fetchSurfaceNoticesCount]);


  useEffect(() => {
    let cancelled = false;

    if (selectedNetwork === "regional") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAccessibilityOutageState(null);
      setSurfaceNoticeCount(null);
      fetchAccessibilityOutages();
      return () => { cancelled = true; };
    }

    getStationSummaries().then((result) => {
      if (!cancelled) {
        setTtcStationSummaries(result.data.stations);
      }
    });

    fetchAccessibilityOutages();
    fetchSurfaceNoticesCount();

    return () => {
      cancelled = true;
    };
  }, [selectedNetwork, fetchAccessibilityOutages, fetchSurfaceNoticesCount]);

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
          setVisibleStationResult(result);
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
    if (network === selectedNetwork) return;

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
      setActiveView("map");
      setMapPresentationMode("standard");
      setMobileInspectorDetent(pendingStationSelection ? "details-focus" : "map-focus");
    };
    const transitionDocument = document as Document & {
      startViewTransition?: (update: () => void) => {
        finished: Promise<void>;
        skipTransition: () => void;
      };
    };

    if (reducedMotion || !transitionDocument.startViewTransition) {
      applyNetworkChange();
      return;
    }

    networkViewTransitionRef.current?.skipTransition();
    document.documentElement.dataset.networkTransitionDirection =
      network === "regional" ? "forward" : "back";

    const transition = transitionDocument.startViewTransition(() => {
      flushSync(applyNetworkChange);
    });
    networkViewTransitionRef.current = transition;
    const finishNetworkTransition = () => {
      if (networkViewTransitionRef.current !== transition) return;
      networkViewTransitionRef.current = null;
      delete document.documentElement.dataset.networkTransitionDirection;
    };
    void transition.finished.then(finishNetworkTransition, finishNetworkTransition);
  };

  const handleDefaultNetworkChange = (network: NetworkId) => {
    setDefaultNetworkPreference(network);
  };

  const handleInitialMapReady = useCallback(() => {
    setInitialMapReady(true);
  }, []);

  const handleOpenSearch = () => {
    if (activeViewRef.current !== "search" && activeViewRef.current !== "map") {
      setSelection(null);
      setSelectedStationId(null);
    }
    window.setTimeout(() => stationSearchInputRef.current?.focus(), 0);
    navigateRoot("search");
  };

  // Dismiss search when clicking outside the header bar and the search panel
  useEffect(() => {
    if (activeView !== "search") return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const barEl = headerSearchBarRef.current;
      const panelEl = document.getElementById("station-search-panel");

      if (barEl?.contains(target)) return;
      if (panelEl?.contains(target)) return;
      if (target instanceof Element && target.closest(".mobile-bottom-nav")) return;

      setActiveView("map");
      setStationSearchQuery("");
      stationSearchInputRef.current?.blur();
    };

    // Use a rAF so the opening click itself doesn't immediately dismiss
    const raf = requestAnimationFrame(() => {
      document.addEventListener("pointerdown", handleClickOutside);
    });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointerdown", handleClickOutside);
    };
  }, [activeView]);

  const handleSelectStationId = useCallback((id: string | null) => {
    if (id) {
      setStationPanelActivationKey((current) => current + 1);
    }
    setSelectedStationId(id);
    setSelection(null);
    setCommutePathPreview(null);
    if (id) {
      recordPwaInstallEngagement();
      if (isMobile) {
        setMobileInspectorDetent("details-focus");
      }
      setActiveView("map");
    }
  }, [setSelectedStationId, setSelection, setCommutePathPreview, setMobileInspectorDetent, setActiveView, isMobile, recordPwaInstallEngagement]);


  const mobileNavKey = useMemo<MobileNavKey>(() => {
    if (activeView === "status" || activeView === "alerts" || activeView === "delays" || activeView === "reduced-speed-zones" || activeView === "closures") {
      return "status";
    }
    if (activeView === "search") return "search";
    if (activeView === "commutes") return "commutes";
    if (activeView === "my-stations" || activeView === "notifications" || activeView === "more" || activeView === "analytics" || activeView === "alert-history" || activeView === "feedback" || activeView === "privacy-acknowledgements" || activeView === "release-notes") return "more";
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
      case "search":
        navigateRoot("search");
        return;
      case "commutes":
        navigateRoot("commutes");
        return;
      case "more":
        navigateRoot("more");
        return;
      case "map":
      default:
        navigateRoot("map");
    }
  }, [navigateRoot, setCommutePathPreview, setMapPresentationMode, setMobileInspectorDetent, setSelectedStationId, setSelection, recordPwaInstallEngagement]);


  const handleMobileSheetClose = useCallback(() => {
    navigateRoot("map");
    setSelection(null);
    setMapPresentationMode("standard");
    setMobileInspectorDetent("map-focus");
  }, [navigateRoot, setMapPresentationMode, setMobileInspectorDetent, setSelection]);

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
    setSelectedStationId(null);
    setCommutePathPreview(null);
    setSelection(nextSelection);
    setMobileInspectorDetent("details-focus");
    navigateForward(viewForImpactSelection(nextSelection));
  }, [navigateForward, setCommutePathPreview, setMobileInspectorDetent, setSelectedStationId, setSelection, viewForImpactSelection]);

  const handleSearchSelectStation = (stationId: string, networkId: NetworkId) => {
    if (networkId === selectedNetwork) {
      handleSelectStationId(stationId);
      return;
    }

    crossNetworkStationSelectionRef.current = { networkId, stationId };
    recordPwaInstallEngagement();
    handleNetworkChange(networkId);
  };

  const handleSearchOpenImpactCategory = useCallback((kind: ImpactKind) => {
    setSelectedStationId(null);
    setCommutePathPreview(null);
    setSelection(null);
    navigateForward(viewForImpactKind(kind));
  }, [navigateForward, setCommutePathPreview, setSelectedStationId, setSelection, viewForImpactKind]);

  const handleSearchOpenSurfaceNotice = useCallback((notice: SurfaceNoticeDetail) => {
    const targetQuery = notice.routeIds[0]
      ?? notice.stops?.[0]?.stopName
      ?? notice.stopIds[0]
      ?? notice.title;
    setSurfaceNoticeInitialQuery(targetQuery);
    navigateForward("surface-notices");
  }, [navigateForward]);

  const handleMyStationsSelectImpactDetails = useCallback((nextSelection: NonNullable<ImpactSelection>) => {
    setSelectedStationId(null);
    setCommutePathPreview(null);
    setSelection(nextSelection);
    setMobileInspectorDetent("details-focus");
    navigateForward(viewForImpactSelection(nextSelection));
  }, [navigateForward, setCommutePathPreview, setMobileInspectorDetent, setSelectedStationId, setSelection, viewForImpactSelection]);

  const handleMyStationsSelectAccessibilityOutageDetails = useCallback((
    assetType: AccessibilityOutageTarget["assetType"],
    stationId: string,
  ) => {
    setSelection(null);
    setSelectedStationId(null);
    setCommutePathPreview(null);
    setAccessibilityOutageTarget({ assetType, stationId });
    navigateForward("accessibility-outages");
  }, [navigateForward, setCommutePathPreview, setSelectedStationId, setSelection]);

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
    setCommutePathPreview(null);
    if (!nextSelection) {
      setSelection(null);
      return;
    }
    setSelection(nextSelection);
    if (isMobile) {
      recordPwaInstallEngagement();
      setMobileInspectorDetent("details-focus");
      setActiveView("map");
      return;
    }
    setActiveView(viewForImpactSelection(nextSelection));
  }, [setSelectedStationId, setCommutePathPreview, setMobileInspectorDetent, setSelection, setActiveView, viewForImpactSelection, isMobile, recordPwaInstallEngagement]);

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

  const handleOpenRotatedSelectionDetails = useCallback(() => {
    setMapPresentationMode("standard");
    setMobileInspectorDetent("details-focus");
    setActiveView("map");
    window.setTimeout(() => {
      setMapLayoutSignal((current) => current + 1);
    }, 60);
  }, [setActiveView, setMapLayoutSignal, setMobileInspectorDetent, setMapPresentationMode]);

  const handleClearRotatedSelection = useCallback(() => {
    setSelection(null);
    setSelectedStationId(null);
    setMobileInspectorDetent("map-focus");
  }, [setMobileInspectorDetent, setSelectedStationId, setSelection]);

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
    !accountDialogMode &&
    !showClosedScreen;

  const mobileStationInspectorOpen =
    isMobile &&
    mapPresentationMode === "standard" &&
    activeView === "map" &&
    Boolean(selectedStationId) &&
    !accountDialogMode &&
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
    activeView === "feedback" ||
    activeView === "privacy-acknowledgements" ||
    activeView === "release-notes"
  );

  const getMobileSheetLabel = () => {
    switch (activeView) {
      case "status": return "Current service status";
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
      case "feedback": return "Leave Feedback / Support";
      case "privacy-acknowledgements": return "Privacy & Acknowledgements";
      case "release-notes": return "What's New";
      case "accessibility-outages": return "Accessibility outages";
      case "surface-notices": return "Streetcar & Bus Notices";
      default: return "";
    }
  };

  const renderPanelContent = () => {
    switch (activeView) {
      case "status":
        return (
          <MobileStatusSheet
            pollText={pollText}
            dataSource={displayData.dataSource}
            networkId={selectedNetwork}
            onOpenCategory={(view, lineId) => {
              if (
                view === "alerts"
                || view === "delays"
                || view === "reduced-speed-zones"
                || view === "closures"
              ) {
                openImpactCategory(view, lineId);
                return;
              }
              setSelection(null);
              navigateForward(view);
            }}
            onClose={handleMobileSheetClose}
            accessibilityOutageCount={
              accessibilityOutageResult?.assetTypes.reduce((acc, curr) => acc + curr.count, 0) ?? 0
            }
            surfaceNoticeCount={surfaceNoticeCount ?? 0}
          />
        );
      case "alerts":
        return (
          <ActiveAlertsPanel
            key={`alerts-${impactListLaunch.requestId}`}
            selection={selection}
            onSelectImpact={handleMapSelectImpact}
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
            onFocusMap={isMobile ? () => setActiveView("map") : undefined}
            initialLineId={impactListLaunch.lineId}
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
            onFocusMap={isMobile ? () => setActiveView("map") : undefined}
            initialLineId={impactListLaunch.lineId}
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
            onFocusMap={isMobile ? () => setActiveView("map") : undefined}
            initialLineId={impactListLaunch.lineId}
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
            onFocusMap={isMobile ? () => setActiveView("map") : undefined}
            initialLineId={impactListLaunch.lineId}
          />
        );
      case "commutes":
        return (
          <SavedCommutesPanel
            accountState={accountState}
            accountCommutes={accountCommutes}
            setAccountCommutes={setAccountCommutes}
            stationSummaries={stationSummaries}
            networkId={selectedNetwork}
            viewedCommuteId={commutePathPreview?.id ?? null}
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
          />
        );
      case "my-stations":
        return (
          <MyStationsPanel
            accountState={accountState}
            savedStations={currentSavedStations}
            stations={stationSummaries}
            loading={savedStationsLoading}
            error={savedStationsError}
            pendingStationIds={pendingSavedStationIds}
            onSave={handleSaveStation}
            onRemove={handleRemoveSavedStation}
            onSelectStation={(stationId) => {
              handleSelectStationId(stationId);
            }}
            onSelectImpactDetails={handleMyStationsSelectImpactDetails}
            onSelectAccessibilityOutageDetails={handleMyStationsSelectAccessibilityOutageDetails}
            expandedDisruptionStationIds={expandedMyStationDisruptionIds}
            onDisruptionExpandedChange={handleMyStationsDisruptionExpandedChange}
            onRetry={() => { void refreshSavedStations(); }}
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
            onRequestSignIn={() => openAuthChoice("login")}
            onRequestCreateAccount={() => openAuthChoice("register")}
          />
        );
      case "notifications":
        return (
          <NotificationSettingsPanel
            accountState={accountState}
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
              setSelectedStationId(stationId);
              setMobileInspectorDetent("details-focus");
              if (isMobile) {
                setActiveView("map");
              }
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
            onBack={handleSubmenuBack}
            /* setActiveView(isMobile ? "status" : "menu") */
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
            ingestionHealth={ingestionHealth}
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
            onOpenMyStations={() => navigateForward("my-stations")}
            savedStationCount={currentSavedStations.length}
            defaultNetwork={defaultNetworkPreference}
            currentNetwork={selectedNetwork}
            onDefaultNetworkChange={handleDefaultNetworkChange}
            onOpenAnalytics={() => navigateForward("analytics")}
            onOpenAlertHistory={() => navigateForward("alert-history")}
            onOpenFeedback={() => navigateForward("feedback")}
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
          />
        );
      default:
        return null;
    }
  };

  const isDesktopPanel = activeView !== "map" && activeView !== "search" && activeView !== "menu";
  const showMenuAttention = !menuVisible && !isDesktopPanel;

  const activeFloatingPanel = (!showClosedScreen && (isDesktopPanel || isMobilePanel || isClosingPanel || isGoingBack)) ? (
    isMobilePanel || (isMobile && (isGoingBack || isClosingPanel)) ? (
      <FloatingPanelShell panel="mobile-panel" mobileSheetLabel={getMobileSheetLabel()} navDirection={navDirection} isClosing={isClosingPanel} isGoingBack={isGoingBack}>
        <div key={activeView} className="mobile-view-content-wrapper" data-active-view={activeView} data-nav-direction={navDirection} data-closing={isClosingPanel ? "true" : undefined} data-going-back={isGoingBack ? "true" : undefined}>
          {renderPanelContent()}
        </div>
      </FloatingPanelShell>
    ) : (isDesktopPanel || isGoingBack || isClosingPanel) ? (
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
    }, 40);

    return () => window.clearTimeout(timer);
  }, [
    mobileInspectorOpen,
    mobileInspectorDetent,
    selection?.kind,
    selection?.id,
    selectedStationId,
  ]);

  let actionIndex = 0;
  return (
    <DataProvider data={displayData}>
      <div
        style={{ height: "var(--visual-viewport-height, 100dvh)" }}
        data-active-view={activeView}
        data-network={selectedNetwork}
        data-menu-pinned={menuPinned ? "true" : undefined}
        className={`linewatch-shell relative w-full overflow-hidden transition-colors duration-500 ${(isDark || highContrast) ? "dark bg-[#0d0808] text-slate-100" : "bg-slate-50 text-slate-900"} ${highContrast ? "high-contrast" : ""} ${reducedMotion ? "motion-paused" : ""} ${mobilePerformanceMode ? "mobile-performance-mode" : ""} ${shellInspectorClasses}`}
      >
        <ScrollOverflowAffordances />
        <h1 className="sr-only">
          {selectedNetwork === "ttc" ? "LineWatchTO TTC subway and LRT reliability dashboard" : "LineWatchTO GO and UP regional rail reliability dashboard"}
        </h1>
        {/* Background */}
        <DynamicBackground reducedMotion={reducedMotion} isDark={isDark || highContrast} disabled={!dotBackgroundEnabled} />

      {!showClosedScreen && (
      <header
        className="absolute top-0 left-0 w-full p-4 sm:p-6 flex justify-between items-start pointer-events-none"
        style={{ zIndex: guideOpen ? 60 : 40 }}
      >
        <div className="flex items-start gap-3 pointer-events-auto relative">
          {/* Menu Toggle Button */}
          <button
            ref={menuButtonRef}
            onClick={handleToggleMenu}
            className={`menu-toggle-btn menu-attention-beam desktop-top-chrome panel relative flex items-center justify-center w-14 h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-200 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer`}
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
              <span
                aria-hidden="true"
                className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white shadow-md border border-white dark:border-[#12151c]"
              >
                {totalAlertCount}
              </span>
            )}
          </button>

          {/* Header station search input — replaces the old static button */}
          <div
            ref={headerSearchBarRef}
            className="header-search-bar desktop-top-chrome panel relative flex items-center gap-2 px-3 h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-200 dark:hover:!bg-[#1a1e28] cursor-text outline-none"
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
              ref={stationSearchInputRef}
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
              placeholder="Search Stations and Alerts..."
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

          {selectedNetwork === "ttc" && subwayOperatingState.closingSoon && subwayOperatingState.minutesUntilClose !== null && subwayOperatingState.nextCloseLabel && isMobile ? (
            <SubwayClosingSoonChip
              minutesUntilClose={subwayOperatingState.minutesUntilClose}
              nextCloseLabel={subwayOperatingState.nextCloseLabel}
            />
          ) : null}

          {selectedNetwork === "regional" && regionalRailOperatingState.closingSoon && regionalRailOperatingState.minutesUntilClose !== null && regionalRailOperatingState.nextCloseLabel && isMobile ? (
            <GoUpClosingSoonChip
              minutesUntilClose={regionalRailOperatingState.minutesUntilClose}
              nextCloseLabel={regionalRailOperatingState.nextCloseLabel}
            />
          ) : null}

          {selectedNetworkIsClosed && closedMapPeek && isMobile ? (
            <div
              className={`${
                selectedNetwork === "regional" ? "go-up-closed-peek-chip" : "subway-closed-peek-chip"
              } ${isExitingPeekChip ? "subway-closed-peek-chip--exiting" : ""}`}
              role="status"
              aria-live="polite"
            >
              <Moon className="subway-closed-peek-icon shrink-0" size={18} strokeWidth={2.4} aria-hidden="true" />
              <div className="subway-closed-peek-text">
                <strong className="subway-closed-peek-title">
                  {selectedNetwork === "ttc" ? "Subway Closed" : "GO & UP Rail Closed"}
                </strong>
                <span className="subway-closed-peek-subtitle">
                  {selectedNetwork === "ttc" ? "Resumes" : "Trains return"}{" "}
                  {(selectedNetwork === "ttc"
                    ? subwayOperatingState.nextResumeLabel
                    : regionalRailOperatingState.nextResumeLabel)
                    ?.replace(/^(Today|Tomorrow)/, (day) => day.toLowerCase())
                    .replace(/\.$/, "")}.
                </span>
              </div>
              <button type="button" onClick={handleOpenClosedScreen}>
                Closed Screen
              </button>
            </div>
          ) : null}

          {/* Floating Dropdown Menu */}
          <div
            ref={menuPanelRef}
            id="linewatch-main-menu"
            role="menu"
            onKeyDown={handleMenuKeyDown}
            className={`desktop-top-chrome panel-strong absolute top-[72px] left-0 w-[min(calc(100vw-32px),360px)] max-h-[calc(var(--visual-viewport-height,100dvh)-96px)] overflow-hidden border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl flex flex-col origin-top-left transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${menuVisible ? "opacity-100 scale-100 translate-y-0 pointer-events-auto" : "opacity-0 scale-90 -translate-y-4 pointer-events-none"}`}
            aria-hidden={!menuVisible}
          >
            <div className="linewatch-transit-accent-strip shrink-0" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div id="linewatch-main-menu-scroll" className="flex-1 overflow-y-auto stealth-scrollbar flex flex-col">
               {/* Branding */}
                <div className="flex items-center gap-3 p-4 border-b border-black/10 dark:border-white/10 bg-white/40 dark:bg-black/20">
                  <div className="flex items-center justify-center shrink-0 w-8 h-8 rounded-lg shadow-sm border border-black/10 dark:border-white/10 bg-white dark:bg-white/10 p-1">
                     <Image src="/assets/linewatch/logo.svg" alt="LineWatchTO Logo" width={24} height={24} className="drop-shadow-sm dark:brightness-200" />
                  </div>
                  <strong className="text-slate-900 dark:text-white font-bold tracking-wide">LineWatchTO</strong>
                  <div className="ml-auto hidden md:flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400/80 dark:text-slate-500/80 drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)] dark:drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)] select-none whitespace-nowrap">
                      Pin Main Menu
                    </span>
                    <button
                      type="button"
                      onClick={() => setMenuPinned((current) => !current)}
                      className="main-menu-pin flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-300 hover:bg-blue-500/10 transition-colors shrink-0"
                      aria-label={menuPinned ? "Unpin main menu" : "Pin main menu open"}
                      aria-pressed={menuPinned}
                      title={menuPinned ? "Unpin main menu" : "Keep main menu open"}
                    >
                      {menuPinned ? <PinOff size={19} /> : <Pin size={19} />}
                    </button>
                  </div>
                </div>

                <div className="account-menu-block flex flex-col px-2 py-2 border-b border-black/10 dark:border-white/10 gap-0.5">
                  <div className="flex items-center gap-2 px-3 pt-2 pb-1 select-none">
                    <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
                    <span className="text-[12px] uppercase font-bold text-slate-700 dark:text-slate-300 tracking-wider">Account</span>
                  </div>
                  {accountState.authenticated && accountState.user ? (
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
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-600 dark:text-emerald-400" aria-label={`${commuteClearCount} clear commutes`}>
                              {commuteClearCount}
                            </span>
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-700 dark:text-amber-400" aria-label={`${commuteAffectedCount} affected commutes`}>
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
                          <Bookmark size={18} className="text-slate-500 dark:text-slate-400" />
                          My Stations
                        </span>
                        {currentSavedStations.length > 0 ? (
                          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-sky-500/15 px-2 text-[11px] font-bold text-sky-700 dark:text-sky-300" aria-label={`${currentSavedStations.length} saved stations`}>
                            {currentSavedStations.length}
                          </span>
                        ) : null}
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
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-600 dark:text-emerald-400" aria-label={`${commuteClearCount} clear commutes`}>
                              {commuteClearCount}
                            </span>
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-700 dark:text-amber-400" aria-label={`${commuteAffectedCount} affected commutes`}>
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
                          <Bookmark size={18} className="text-slate-500 dark:text-slate-400" />
                          My Stations
                        </span>
                        {currentSavedStations.length > 0 ? (
                          <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-sky-500/15 px-2 text-[11px] font-bold text-sky-700 dark:text-sky-300" aria-label={`${currentSavedStations.length} saved stations`}>
                            {currentSavedStations.length}
                          </span>
                        ) : null}
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
                 <div className="flex items-center gap-2 px-3 pt-2 pb-1 select-none">
                   <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
                   <span className="text-[12px] uppercase font-bold text-slate-700 dark:text-slate-300 tracking-wider">Maps & Alerts</span>
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
                     <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-red-500/20 px-2 text-[11px] font-bold text-red-600 dark:text-red-400">
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
                     <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full delay-count-badge px-2 text-[11px] font-bold">
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
                     <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full rsz-count-badge px-2 text-[11px] font-bold">
                       {reducedSpeedZones.length}
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
                     <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-blue-500/20 px-2 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                       {plannedClosures.length}
                     </span>
                   )}
                 </button>
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
                     <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-red-500/20 px-2 text-[11px] font-bold text-red-600 dark:text-red-400">
                       {accessibilityOutageResult.assetTypes.reduce((acc, curr) => acc + curr.count, 0)}
                     </span>
                   )}
                 </button>
                 {selectedNetwork === "ttc" ? <button
                   ref={registerMenuAction(actionIndex++)}
                   role="menuitem"
                   onClick={() => navigateForward("surface-notices")}
                   aria-current={activeView === "surface-notices" ? "page" : undefined}
                   className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                 >
                   <div className="flex items-center gap-3">
                     <Bus size={18} className="text-slate-500 dark:text-slate-400" /> Streetcar & Bus Notices
                   </div>
                   {surfaceNoticeCount !== null && surfaceNoticeCount > 0 && (
                     <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-blue-500/20 px-2 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                       {surfaceNoticeCount}
                     </span>
                   )}
                 </button> : null}
               </div>

               {/* Notifications */}
               {selectedNetwork === "ttc" ? <div className="flex flex-col px-2 py-2 border-b border-black/10 dark:border-white/10 gap-0.5">
                 <div className="flex items-center gap-2 px-3 pt-2 pb-1 select-none">
                   <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
                   <span className="text-[12px] uppercase font-bold text-slate-700 dark:text-slate-300 tracking-wider">Notifications</span>
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
                 <button
                   ref={registerMenuAction(actionIndex++)}
                   role="menuitem"
                   onClick={() => navigateForward("alert-history")}
                   aria-current={activeView === "alert-history" ? "page" : undefined}
                   className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                 >
                   <History size={18} className="text-slate-500 dark:text-slate-400" /> Alert History
                 </button>
               </div> : null}

               {/* Operations */}
               {selectedNetwork === "ttc" ? <div className="flex flex-col px-2 py-2 border-b border-black/10 dark:border-white/10 gap-0.5">
                 <div className="flex items-center gap-2 px-3 pt-2 pb-1 select-none">
                   <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
                   <span className="text-[12px] uppercase font-bold text-slate-700 dark:text-slate-300 tracking-wider">Operations</span>
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
               </div> : null}

               {/* Display */}
               <div className="flex flex-col px-2 py-2 border-b border-black/10 dark:border-white/10 gap-0.5">
                 <div className="flex items-center gap-2 px-3 pt-2 pb-1 select-none">
                   <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
                   <span className="text-[12px] uppercase font-bold text-slate-700 dark:text-slate-300 tracking-wider">Display</span>
                 </div>
                 <div className="flex items-center justify-between px-3 py-2.5">
                   <span className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-3">
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
                   <span className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-3">
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
                   <span className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-3">
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
               <div className="flex flex-col px-2 py-2 border-b border-black/10 dark:border-white/10 gap-0.5">
                 <div className="flex items-center gap-2 px-3 pt-2 pb-1 select-none">
                   <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
                   <span className="text-[12px] uppercase font-bold text-slate-700 dark:text-slate-300 tracking-wider">Support & About</span>
                 </div>
                 <button
                   ref={registerMenuAction(actionIndex++)}
                   role="menuitem"
                   onClick={() => navigateForward("feedback")}
                   aria-current={activeView === "feedback" ? "page" : undefined}
                   className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                 >
                   <MessageSquareText size={18} className="text-slate-500 dark:text-slate-400" /> Leave Feedback / Support
                 </button>
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
               </div>

               {/* At-A-Glance Integrated Sub-panels */}
               <div className="flex flex-col p-4 gap-4">
                 <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 px-1 select-none">
                      <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
                      <span className="text-[12px] uppercase font-bold text-slate-700 dark:text-slate-300 tracking-wider">Line Status</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {lineStatuses.map(l => {
                        const hasAlert = activeAlerts.some(a => a.lineId === l.id);
                        const hasDelay = delays.some(delay => delay.lineId === l.id);
                        const hasRSZ = reducedSpeedZones.some(z => z.lineId === l.id);
                        const hasClosure = plannedClosures.some(c => c.lineId === l.id);
                        const isClear = !hasAlert && !hasDelay && !hasRSZ && !hasClosure;
                        
                        return (
                          <div key={l.id} className="flex items-center gap-3 px-2 py-2 rounded-lg !bg-white dark:!bg-[#12151c] border border-black/5 dark:border-white/5 shadow-sm">
                             <TransitLineBadge lineId={l.id} lineNumber={l.number} lineName={l.name} size={24} className="flex-shrink-0" />
                             <div className="flex flex-col justify-center">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{l.name}</span>
                                  <div className="flex items-center gap-1.5 ml-1">
                                    {hasAlert && <AlertTriangle size={14} className="text-red-500 dark:text-red-400" />}
                                    {hasDelay && <DelayIcon size={14} className="delay-tone" /> /* /assets/linewatch/delay-icon.svg */}
                                    {hasRSZ && <Construction size={14} className="rsz-tone" />}
                                    {hasClosure && <PlannedClosureIcon size={14} className="text-blue-500 dark:text-blue-400" />}
                                  </div>
                                  {isClear && (
                                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider ml-1">
                                      {clearServiceStatusLabel({
                                        networkId: selectedNetwork,
                                        dataSource: displayData.dataSource,
                                      })}
                                    </span>
                                  )}
                                </div>
                             </div>
                          </div>
                        );
                      })}
                   </div>
                 </div>

                 <div className="flex flex-col mt-2 pt-3 border-t border-black/10 dark:border-white/10">
                     <div className="flex flex-wrap items-center gap-1.5 text-emerald-600 dark:text-emerald-400 mb-2">
                       <ShieldCheck size={16} />
                       <span className="text-[11px] font-bold uppercase tracking-wider">Ingestion Status</span>
                     </div>
                    <div className="grid grid-cols-2 gap-2">
                      {ingestionHealth.map((health, idx) => (
                        <div key={idx} className="flex flex-col !bg-white dark:!bg-[#12151c] p-2 rounded-lg border border-black/5 dark:border-white/5">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{health.label}</span>
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-300 leading-tight mt-1">{health.value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 text-center">
                       <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 select-none" aria-label={`App version ${lineWatchAppVersionLabel}`}>
                         {lineWatchAppVersionLabel}
                       </span>
                    </div>
                 </div>
                </div>
              </div>
            </div>
          <StationSearchPanel
            open={activeView === "search"}
            stationCatalogs={stationCatalogs}
            currentNetwork={selectedNetwork}
            selectedStationId={selectedStationId}
            onSelectStation={handleSearchSelectStation}
            onSelectImpact={handleSearchSelectImpact}
            onOpenImpactCategory={handleSearchOpenImpactCategory}
            onClose={() => { setActiveView("map"); setStationSearchQuery(""); }}
            onClosedFocusTarget={() => stationSearchInputRef.current?.focus()}
            query={stationSearchQuery}
            onQueryChange={setStationSearchQuery}
            inputRef={stationSearchInputRef}
            keyDownHandlerRef={stationKeyDownHandlerRef}
            isMobile={isMobile}
            authenticated={accountState.authenticated}
            savedStationKeys={savedStationKeys}
            pendingSavedStationIds={pendingSavedStationIds}
            onToggleSavedStation={handleToggleSavedStation}
            onRequestSignIn={() => {
              setAccountEntryIntent("register");
              setAccountDialogMode("auth-choice");
              setAccountError(null);
            }}
            savedCommutes={accountCommutes}
            surfaceSearchEnabled={selectedNetwork === "ttc"}
            onOpenDestination={(view) => {
              if (view === "commutes") {
                setCommutesActiveTab("saved");
              }
              navigateForward(view);
            }}
            onOpenSavedCommute={() => {
              setCommutesActiveTab("saved");
              navigateForward("commutes");
            }}
            onOpenSurfaceNotice={handleSearchOpenSurfaceNotice}
          />
        </div>

        {/* Floating Desktop Status Capsule (Top Center) */}
        <div className="desktop-status-capsule-anchor hidden sm:flex absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto items-center gap-3">
          <div className="desktop-status-stack">
            <div className="desktop-status-capsule desktop-top-chrome" aria-label="Current dashboard status summary">
              <div className="desktop-status-primary-row">
                <div className="flex items-center justify-center shrink-0 w-10 h-10 rounded-xl shadow-sm border border-black/10 dark:border-white/10 bg-slate-50 dark:bg-white/10 p-1">
                 <Image src="/assets/linewatch/logo.svg" alt="LineWatchTO Logo" width={32} height={32} className="drop-shadow-sm dark:brightness-200" />
                </div>
                <span className="desktop-status-divider" />
                <div className="desktop-status-time">
                  {clock.date ? (
                    <div className="flex flex-col">
                      <strong className="text-sm font-bold text-slate-800 dark:text-white leading-none mb-1">
                        {clock.time} <span className="text-[10px] text-slate-400 font-medium tracking-wider ml-0.5">{clock.zone}</span>
                      </strong>
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-none">{clock.date}</span>
                    </div>
                  ) : (
                    <strong className="text-sm font-bold text-slate-800 dark:text-white">{clock.time}</strong>
                  )}
                </div>
                <span className="desktop-status-divider" />
                <div className="desktop-status-train-control">
                    <Train size={24} className="desktop-status-train-icon" aria-hidden="true" />
                    <span className="desktop-status-train-copy">
                      <strong>Estimated Train Markers</strong>
                      <span>{estimatedTrainStatusLabel}</span>
                    </span>
                    <span className="desktop-status-train-copy desktop-status-train-copy--compact" aria-hidden="true">
                      <strong>Trains</strong>
                      <span>{estimatedTrainStatusLabel}</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleToggleEstimatedTrains}
                      disabled={!trainNetworkOpen}
                      className="desktop-status-train-switch"
                      aria-pressed={estimatedTrainsEnabled}
                      aria-label={`Toggle estimated train markers (${estimatedTrainStatusLabel})`}
                    >
                      <span aria-hidden="true" />
                    </button>
                </div>
                <span className="desktop-status-divider" />
                <div className="desktop-status-poll">
                   <div className="desktop-status-live-dot" />
                   <span>
                      Last Polled: {pollText.toLowerCase() === "just now" ? "Just Now" : pollText}
                   </span>
                </div>
                <span className="desktop-status-divider" />
                <NetworkSelector network={selectedNetwork} onChange={handleNetworkChange} />
              </div>
            </div>
          </div>

          {selectedNetwork === "ttc" && subwayOperatingState.closingSoon && subwayOperatingState.minutesUntilClose !== null && subwayOperatingState.nextCloseLabel && !isMobile ? (
            <SubwayClosingSoonChip
              minutesUntilClose={subwayOperatingState.minutesUntilClose}
              nextCloseLabel={subwayOperatingState.nextCloseLabel}
            />
          ) : null}

          {selectedNetwork === "regional" && regionalRailOperatingState.closingSoon && regionalRailOperatingState.minutesUntilClose !== null && regionalRailOperatingState.nextCloseLabel && !isMobile ? (
            <GoUpClosingSoonChip
              minutesUntilClose={regionalRailOperatingState.minutesUntilClose}
              nextCloseLabel={regionalRailOperatingState.nextCloseLabel}
            />
          ) : null}

          {selectedNetworkIsClosed && closedMapPeek && !isMobile ? (
            <div
              className={`${
                selectedNetwork === "regional" ? "go-up-closed-peek-chip" : "subway-closed-peek-chip"
              } ${isExitingPeekChip ? "subway-closed-peek-chip--exiting" : ""}`}
              role="status"
              aria-live="polite"
            >
              <Moon className="subway-closed-peek-icon shrink-0" size={18} strokeWidth={2.4} aria-hidden="true" />
              <div className="subway-closed-peek-text">
                <strong className="subway-closed-peek-title">
                  {selectedNetwork === "ttc" ? "Subway Closed" : "GO & UP Rail Closed"}
                </strong>
                <span className="subway-closed-peek-subtitle">
                  {selectedNetwork === "ttc" ? "Resumes" : "Trains return"}{" "}
                  {(selectedNetwork === "ttc"
                    ? subwayOperatingState.nextResumeLabel
                    : regionalRailOperatingState.nextResumeLabel)
                    ?.replace(/^(Today|Tomorrow)/, (day) => day.toLowerCase())
                    .replace(/\.$/, "")}.
                </span>
              </div>
              <button type="button" onClick={handleOpenClosedScreen}>
                Closed Screen
              </button>
            </div>
          ) : null}
        </div>

        <div className="map-utility-cluster pointer-events-auto flex items-center gap-2">
          <LogsDropdown network={selectedNetwork} />
          <button
            onClick={handleToggleTheme}
            className="theme-toggle-btn panel flex items-center justify-center w-10 sm:w-14 h-10 sm:h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-200 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10]"
            aria-label="Toggle theme"
          >
            {isDark ? (
              <Sun size={24} className="text-yellow-500 fill-yellow-500" />
            ) : (
              <Moon size={24} className="text-purple-500 fill-purple-500" />
            )}
          </button>
          <button
            onClick={() => {
              setMapPresentationMode("rotated-landscape");
              setActiveView("map");
            }}
            className="rotate-map-btn panel flex items-center justify-center gap-1.5 px-2.5 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-200 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10] h-10 md:hidden"
            aria-label="Rotate map"
          >
            <PhoneRotateLandscapeIcon size={20} />
            <span className="text-[9px] font-black leading-[1.1] text-left uppercase tracking-wider text-slate-800 dark:text-white">
              Rotate<br />Map
            </span>
          </button>
          <div className="site-guide-network-stack">
            <SiteGuideDropdown onOpenChange={setGuideOpen} />
            <div className="mobile-network-selector-slot">
              <NetworkSelector
                network={selectedNetwork}
                onChange={handleNetworkChange}
                compactVertical
              />
            </div>
            {activeView === "map" && !selection && !selectedStationId && !accountDialogMode && !commutePathPreview ? (
              <button
                type="button"
                onClick={openMyStations}
                className="mobile-my-stations-shortcut md:hidden"
                aria-label="Open My Stations"
                title="My Stations"
              >
                <Bookmark size={19} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </header>
      )}

      {/* Floating Submenus (Alerts, Delays, Closures, Commutes, Analytics) */}
      {activeFloatingPanel}

      {/* Main Viewport (TTC Map Front & Center, Borderless) */}
      <main className={`network-map-transition-surface absolute inset-0 z-auto md:z-10 ${showClosedScreen ? "subway-closed-map-backdrop" : ""}`}>
        <NetworkMap
          network={selectedNetwork}
          animateInitialEntrance={!initialMapReady}
          deferInitialEntrance={disclaimerVisible
            || (selectedNetwork === "ttc" && subwayOperatingState.status === "closed" && !closedScreenAcknowledged)
            || (selectedNetwork === "regional" && regionalRailOperatingState.status === "closed" && !closedScreenAcknowledged)}
          onInitialMapReady={handleInitialMapReady}
          mobileAnnouncementVisible={selectedNetwork === "ttc"
            ? subwayOperatingState.closingSoon
              || (subwayOperatingState.status === "closed" && closedMapPeek)
            : regionalRailOperatingState.closingSoon
              || (regionalRailOperatingState.status === "closed" && closedMapPeek)}
          legendProps={{
            expanded: legendExpanded,
            onToggleExpanded: () => setLegendExpanded(!legendExpanded),
            onAlertClick: (lineId) => openLegendImpactCategory("alerts", lineId),
            onDelayClick: (lineId) => openLegendImpactCategory("delays", lineId),
            onReducedSpeedZoneClick: (lineId) => openLegendImpactCategory("reduced-speed-zones", lineId),
            onClosureClick: (lineId) => openLegendImpactCategory("closures", lineId),
          }}
          selection={selection}
          selectedStationId={selectedStationId}
          stations={stationSummaries}
          onSelectImpact={handleMapSelectImpact}
          onSelectStationId={handleSelectStationId}
          isDark={isDark}
          onToggleTheme={handleToggleTheme}
          layoutResetSignal={mapLayoutSignal}
          recenterSignal={recenterSignal}
          reducedMotion={reducedMotion}
          mobilePerformanceMode={mobilePerformanceMode}
          desktopMenuPinned={menuPinned}
          preserveCameraOnSelectionClear={isMobile}
          commutePathPreview={commutePathPreview}
          onClearCommutePathPreview={handleClearCommutePathPreview}
          viewportOrientation={rotatedMapMode ? "rotated-landscape" : "standard"}
          estimatedTrainsEnabled={estimatedTrainMarkersVisible}
          estimatedTrainMarkers={estimatedTrainMarkersVisible ? estimatedTrainSnapshot.markers : []}
        />

        {rotatedMapMode ? (
          <>
            <div className="rotated-map-hud" aria-label="Rotated map controls">
              <MobileMapControls
                presentationMode="rotated-landscape"
                onExitRotated={() => {
                  setMapPresentationMode("standard");
                }}
                onRecenter={() => setRecenterSignal((prev) => prev + 1)}
              />
            </div>
            {rotatedSelectionVisible ? (
              <div className={rotatedMapSelectionHudClassName} aria-label="Selected rotated map item">
                <RotatedMapSelectionCard
                  selection={selection}
                  selectedStationId={selectedStationId}
                  stations={stationSummaries}
                  onOpenDetails={handleOpenRotatedSelectionDetails}
                  onClearSelection={handleClearRotatedSelection}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </main>

      {!showClosedScreen && !rotatedMapMode && (
        <button
          type="button"
          onClick={handleToggleEstimatedTrains}
          disabled={!trainNetworkOpen}
          className={`mobile-train-toggle md:hidden ${
            selectedNetwork === "regional" ? "mobile-train-toggle--regional" : ""
          } ${
            (selectedNetwork === "ttc"
              ? subwayOperatingState.closingSoon || (subwayOperatingState.status === "closed" && closedMapPeek)
              : regionalRailOperatingState.closingSoon || (regionalRailOperatingState.status === "closed" && closedMapPeek))
              ? "mobile-train-toggle--announcement"
              : ""
          } ${estimatedTrainsEnabled ? "active" : ""}`}
          aria-pressed={estimatedTrainsEnabled}
          aria-label={`Toggle estimated train markers (${estimatedTrainStatusLabel})`}
        >
          <Train size={16} />
          <span>
            View<br />Trains
          </span>
        </button>
      )}

      {!showClosedScreen && !rotatedMapMode && selectedNetwork === "ttc" && selectedStationId && (
        <StationDetailPanel
          key={`${selectedStationId}:${stationPanelActivationKey}`}
          stationResult={visibleStationResult}
          loading={stationLoading}
          updating={stationLoading && Boolean(visibleStationResult?.data)}
          selectedStationName={stationSummaries.find((station) => station.id === selectedStationId)?.name}
          onClose={() => setSelectedStationId((current) => current === selectedStationId ? null : current)}
          onSelectImpact={handleMapSelectImpact}
          reducedMotion={reducedMotion}
          authenticated={accountState.authenticated}
          saved={savedStationIds.has(selectedStationId)}
          savePending={pendingSavedStationIds.has(selectedStationId)}
          onToggleSaved={handleToggleSavedStation}
          onRequestSignIn={() => {
            setAccountEntryIntent("register");
            setAccountDialogMode("auth-choice");
            setAccountError(null);
          }}
        />
      )}

      {!showClosedScreen && !rotatedMapMode && selectedNetwork === "regional" && selectedStationId ? (
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
          accessibilityFresh={accessibilityOutageResult?.fresh === true}
          onClose={() => setSelectedStationId((current) => current === selectedStationId ? null : current)}
          onSelectImpact={handleMapSelectImpact}
          authenticated={accountState.authenticated}
          saved={savedStationIds.has(selectedStationId)}
          savePending={pendingSavedStationIds.has(selectedStationId)}
          onToggleSaved={handleToggleSavedStation}
          onRequestSignIn={() => {
            setAccountEntryIntent("register");
            setAccountDialogMode("auth-choice");
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
        <aside className={`desktop-status-chip-row-container fixed bottom-6 left-6 z-20 pointer-events-auto transition-opacity duration-200 ${activeView === "menu" ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
          <div className="desktop-status-chip-row desktop-header-impact-chips" aria-label="Open impact categories">
            <button
              type="button"
              className="desktop-status-chip desktop-status-chip--alerts"
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
            {selectedNetwork === "ttc" ? <button
              type="button"
              className="desktop-status-chip desktop-status-chip--reduced-speed-zone"
              onClick={() => openImpactCategory("reduced-speed-zones")}
              aria-label={`${reducedSpeedZones.length} ${reducedSpeedZones.length === 1 ? "reduced speed zone" : "reduced speed zones"}`}
              title={`${reducedSpeedZones.length} ${reducedSpeedZones.length === 1 ? "Reduced Speed Zone" : "Reduced Speed Zones"}`}
            >
              <Construction size={18} aria-hidden="true" />
              <span className="desktop-status-chip-count" data-digit-count={reducedSpeedZones.length >= 10 ? "multiple" : "single"}>
                <span className="desktop-status-chip-count-value">{reducedSpeedZones.length}</span>
              </span>
              <span className="desktop-status-chip-label">
                {reducedSpeedZones.length === 1 ? "Reduced Speed Zone" : "Reduced Speed Zones"}
              </span>
            </button> : null}
            <button
              type="button"
              className="desktop-status-chip desktop-status-chip--closures"
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
          </div>
        </aside>

      </>
      )}

      {!showClosedScreen && mobileImpactInspectorOpen && selection ? (
        <MobileImpactInspector
          selection={selection}
          detent={mobileInspectorDetent}
          onChangeDetent={setMobileInspectorDetent}
          onUnfocus={() => {
            setSelection(null);
            setMobileInspectorDetent("map-focus");
            setRecenterSignal((current) => current + 1);
          }}
          onViewFullDetails={() => setActiveView(viewForImpactSelection(selection))}
          onSelectImpact={handleMapSelectImpact}
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

      {!showClosedScreen && !rotatedMapMode && !showPwaInstallNudge && activeView === "map" && !selection && !selectedStationId && !accountDialogMode && !commutePathPreview ? (
        <MobileStatusPeek
          lineStatuses={lineStatuses}
          activeAlertCount={activeAlerts.length}
          delayCount={delays.length}
          reducedSpeedZoneCount={reducedSpeedZones.length}
          plannedClosureCount={plannedClosures.length}
          pollText={pollText}
          dataSource={displayData.dataSource}
          networkId={selectedNetwork}
          onOpenStatus={() => navigateForward("status")}
          onOpenCategory={(view) => {
            setSelection(null);
            navigateForward(view);
          }}
          onRecenter={() => setRecenterSignal((prev) => prev + 1)}
        />
      ) : null}

      {!showClosedScreen && !rotatedMapMode && !mobileInspectorOpen && !selectedStationId && !accountDialogMode ? (
        /* aria-label="Primary mobile navigation" */
        <MobileBottomNav
          activeKey={mobileNavKey}
          alertCount={activeAlerts.length}
          delayCount={delays.length}
          reducedSpeedZoneCount={reducedSpeedZones.length}
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
      {accountDialogMode ? (
        <div className="account-dialog-backdrop" role="presentation" onMouseDown={() => setAccountDialogMode(null)}>
          <section
            className="account-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={accountDialogAriaLabel()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="account-dialog-header">
              <div className="account-dialog-intro">
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  {accountDialogTitle()}
                </h2>
                <p className="account-dialog-description">{accountDialogDescription()}</p>
              </div>
              <button type="button" className="account-dialog-close" onClick={() => setAccountDialogMode(null)} aria-label="Close account dialog">
                <X size={18} />
              </button>
            </div>
            <form
              key={accountDialogMode}
              data-account-dialog-view={accountDialogMode}
              className="flex flex-col gap-3 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmitAccount();
              }}
            >
              {accountDialogMode === "auth-choice" ? (
                <>
                  <div className="account-provider-stack">
                    <button
                      type="button"
                      className="account-choice-primary"
                      onClick={openEmailAuth}
                      disabled={accountBusy}
                    >
                      <Mail size={18} />
                      Continue With Email
                    </button>
                    {authConfig.googleSignInAvailable ? (
                      <>
                        <div className="account-auth-divider" aria-hidden="true">
                          <span>Or</span>
                        </div>
                        <div aria-label="Continue With Google">
                          <GoogleSignInButton
                            disabled={accountBusy}
                            mode="login"
                            onError={setAccountError}
                          />
                        </div>
                      </>
                    ) : null}
                  </div>
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
                      setAccountEntryIntent(accountEntryIntent === "login" ? "register" : "login");
                    }}
                  >
                    {accountEntryIntent === "login" ? "Create Account" : "Already Have Account?"}
                  </button>
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
                      setAccountDialogMode(null);
                    }}
                  >
                    Back To Account
                  </button>
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
                              setAccountDialogMode("reset-password");
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
                      setAccountDialogMode("login");
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
                      setAccountDialogMode("login");
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
                  <label className="account-field">
                    <span>Password</span>
                    <input
                      type="password"
                      value={accountPassword}
                      autoComplete={accountDialogMode === "login" ? "current-password" : "new-password"}
                      aria-describedby={accountDialogMode === "register" ? "account-password-help" : undefined}
                      aria-invalid={Boolean(accountError && accountDialogMode === "register")}
                      onChange={(event) => setAccountPassword(event.target.value)}
                    />
                  </label>
                  {accountDialogMode === "login" ? (
                    <button
                      type="button"
                      className="account-link-button justify-self-start"
                      onClick={() => {
                        setAccountError(null);
                        setAccountResetMessage(null);
                        setAccountDevResetToken(null);
                        setAccountDialogMode("forgot-password");
                      }}
                    >
                      Forgot Password?
                    </button>
                  ) : null}
                  {accountDialogMode === "register" ? (
                    <p id="account-password-help" className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                      Use at least 8 characters with a letter and a number, symbol, or space.
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
                      setAccountDialogMode("auth-choice");
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
      <OpeningDisclaimer onVisibilityChange={setDisclaimerVisible} />
    </div>
    </DataProvider>
  );
}

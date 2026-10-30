"use client";

import { startTransition, useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import type { ComponentProps, CSSProperties, Dispatch, KeyboardEvent, SetStateAction } from "react";
import { flushSync } from "react-dom";
import { preloadablePanel } from "./preloadable-panel";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { DynamicBackground } from "./DynamicBackground";
import { startMapSurfaceTransition, type MapFadeController } from "../app/map-surface-transition";
import { NetworkMap, prepareNetworkMap } from "./NetworkMap";
import { resolveSelectionAttentionAnchor, type SelectionAttentionAnchor } from "../app/selection-attention-key";
import { NetworkSelector, NetworkSwitchContext } from "./NetworkSelector";
import SquishSwitch from "./SquishSwitch";
const RegionalStationDetailPanel = preloadablePanel(() => import("./RegionalStationDetailPanel").then((mod) => mod.RegionalStationDetailPanel));
const ActiveAlertsPanel = preloadablePanel(() => import("./ActiveAlertsPanel").then((mod) => mod.ActiveAlertsPanel));
const DelaysPanel = preloadablePanel(() => import("./DelaysPanel").then((mod) => mod.DelaysPanel));
const ReducedSpeedZonesPanel = preloadablePanel(() => import("./ReducedSpeedZonesPanel").then((mod) => mod.ReducedSpeedZonesPanel));
const PlannedClosuresPanel = preloadablePanel(() => import("./PlannedClosuresPanel").then((mod) => mod.PlannedClosuresPanel));
const LineImpactsPanel = preloadablePanel(() => import("./LineImpactsPanel").then((mod) => mod.LineImpactsPanel));
const SavedCommutesPanel = preloadablePanel(() => import("./SavedCommutesPanel").then((mod) => mod.SavedCommutesPanel));
import {
  persistedExpandedImpactDisclosures,
  persistedCommuteDraftStore,
  clearPersistedCommuteDraft,
  type SavedCommuteDraft,
} from "../app/commute-draft-state";
import type { AccountNetworkFilter } from "./SavedCommutesPanel";
const MyStationsPanel = preloadablePanel(() => import("./MyStationsPanel").then((mod) => mod.MyStationsPanel));
const NotificationSettingsPanel = preloadablePanel(() => import("./NotificationSettingsPanel").then((mod) => mod.NotificationSettingsPanel));
const ReliabilityPanel = preloadablePanel<NonNullable<ComponentProps<typeof import("./ReliabilityPanel").ReliabilityPanel>>>(() => import("./ReliabilityPanel").then((mod) => mod.ReliabilityPanel));
const AlertHistoryPanel = preloadablePanel(() => import("./AlertHistoryPanel").then((mod) => mod.AlertHistoryPanel));
const FeedbackPanel = preloadablePanel(() => import("./FeedbackPanel").then((mod) => mod.FeedbackPanel));
const PrivacyAcknowledgementsPanel = preloadablePanel(() => import("./PrivacyAcknowledgementsPanel").then((mod) => mod.PrivacyAcknowledgementsPanel));
const ReleaseNotesPanel = preloadablePanel(() => import("./ReleaseNotesPanel").then((mod) => mod.ReleaseNotesPanel));
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
import { PanelHeader } from "./PanelHeader";
import { LogsDropdown, SourceDiagnosticsBody, SourceStatusRefreshButton } from "./LogsDropdown";
import { SiteGuideDropdown } from "./SiteGuideDropdown";
import { ScrollOverflowAffordances } from "./ScrollOverflowAffordances";
import { DataProvider, DashboardData } from "../app/DataContext";
import { DecorativeMotionPausedContext } from "./DecorativeMotionContext";
import { serviceConnectionNotice, serviceOperatingNotice } from "../app/shell-service-notices";
import { DesktopNoticeBanner, type DesktopNotice } from "./DesktopNoticeBanner";
import { MainMenu, type MainMenuActionElement } from "./MainMenu";
import { DesktopImpactChips } from "./DesktopImpactChips";
import {
  useDashboardSession,
  dashboardRefreshIntervalMs,
} from "../hooks/useDashboardSession";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import { countReducedSpeedZones } from "../app/reduced-speed-zone-count";
import { stationImpactSelectionsByStation } from "../app/station-impact-types";
import type { AccessibilityOutageTarget } from "./AccessibilityOutagesPanel";
const AccessibilityOutagesPanel = preloadablePanel(() => import("./AccessibilityOutagesPanel").then((mod) => mod.AccessibilityOutagesPanel));
import type { SurfaceNoticeDetail } from "../app/surface-notice-data";
const SurfaceNoticesPanel = preloadablePanel(() => import("./SurfaceNoticesPanel").then((mod) => mod.SurfaceNoticesPanel));
const TtcAnnouncementsPanel = preloadablePanel(() => import("./TtcAnnouncementsPanel").then((mod) => mod.TtcAnnouncementsPanel));
const StationDetailPanel = preloadablePanel(() => import("./StationDetailPanel").then((mod) => mod.StationDetailPanel));

import { useEstimatedTrains } from "../hooks/useEstimatedTrains";
import { useSavedStations } from "../hooks/useSavedStations";
import { useTtcStationDetail } from "../hooks/useTtcStationDetail";
import { useNetworkServiceFeeds } from "../hooks/useNetworkServiceFeeds";
import { useTorontoClock } from "../hooks/useTorontoClock";
import { MOBILE_PERFORMANCE_QUERY, MOBILE_VIEWPORT_QUERY, useMobilePerformanceMode } from "../hooks/useMobilePerformanceMode";
import { usePushNotificationSettings } from "../hooks/usePushNotificationSettings";
import { Accessibility, Activity, Menu, X, Train, AlertTriangle, Bookmark, MapPin, Navigation, BarChart3, Search, UserRound, Sun, Moon, History, FileText, Megaphone, Loader2 } from "lucide-react";
import { SubwayClosedScreen } from "./SubwayClosedScreen";
import { useSubwayOperatingState } from "../hooks/useSubwayOperatingState";
import { GoUpClosedScreen } from "./GoUpClosedScreen";
import { useRegionalRailOperatingState } from "../hooks/useRegionalRailOperatingState";
import { StationSearchPanel } from "./StationSearchPanel";
import { OpeningDisclaimer } from "./OpeningDisclaimer";
import {
  MOBILE_SHEET_DEFAULT_RATIO,
  MOBILE_STATION_SHEET_RESIZE_EVENT,
  readStoredSheetHeightRatio,
} from "../hooks/useMobileDraggableSheet";
import {
  type AccountState,
} from "../app/auth-data";
import { useAccountSession } from "../hooks/useAccountSession";
import {
  AccountDialog,
  type AccountDialogMode,
  type AccountEntryIntent,
  type AccountDialogIntentOptions,
  GOOGLE_LINK_SUCCESS_MESSAGE,
} from "./AccountDialog";
import {
  commutePathPreviewFromCommute,
  getSavedCommutes,
  summarizeSavedCommuteStatuses,
  type AccountSavedCommute,
  type AccountCommuteLegId,
  type AccountMatchedImpact,
  type SavedCommuteSort,
} from "../app/commute-data";
import { summarizeSavedStationStatuses } from "../app/saved-stations";
import { getCurrentPushSubscription } from "../app/push-browser-state";
import { hasReleaseNotes } from "../app/release-notes";
import { resolveCommuteImpactMapSelection } from "./map-impact-normalization";
import {
  persistVisualPreferencesCookie,
  defaultVisualPreferences,
  readVisualPreferencesFromStorage,
  resolveReducedMotionPreference,
  writeVisualPreferencesToStorage,
  type InitialVisualPreferences,
  type MapViewPreference,
} from "../app/visual-preferences";
import { MapViewSelector } from "./MapViewSelector";
import {
  regionalStationSummaries,
  type NetworkId,
} from "../app/regional-data";
import {
  type ImpactCategoryView,
  parseNavigationDeepLinks,
  replaceBrowserSearchParams,
} from "../app/navigation-transitions";
import {
  NOTIFICATION_OPEN_MESSAGE,
  NOTIFICATION_TARGET_PARAMS,
  NOTIFICATION_TARGET_WAIT_MS,
  parseNotificationTarget,
  resolveNotificationTarget,
  type NotificationDestination,
  type NotificationTapNotice as NotificationTapNoticeValue,
  type NotificationTarget,
} from "../app/notification-target";
import type { AlertHistoryFocus } from "./AlertHistoryTimeline";

export type ActiveView = "map" | "menu" | "search" | "status" | "line-impacts" | "alerts" | "delays" | "reduced-speed-zones" | "closures" | "commutes" | "notifications" | "analytics" | "more" | "my-stations" | "accessibility-outages" | "surface-notices" | "announcements" | "alert-history" | "feedback" | "privacy-acknowledgements" | "release-notes" | "source-status";
import {
  useNavigationTransitions,
} from "../hooks/useNavigationTransitions";


// Panels are code-split. Load them once the map is usable and the browser is idle, so a
// panel's first open renders at once instead of an empty, collapsed sheet.
function preloadPanelModules() {
  void Promise.allSettled([
    RegionalStationDetailPanel.preload(),
    ActiveAlertsPanel.preload(),
    DelaysPanel.preload(),
    ReducedSpeedZonesPanel.preload(),
    PlannedClosuresPanel.preload(),
    LineImpactsPanel.preload(),
    SavedCommutesPanel.preload(),
    MyStationsPanel.preload(),
    NotificationSettingsPanel.preload(),
    ReliabilityPanel.preload(),
    AlertHistoryPanel.preload(),
    FeedbackPanel.preload(),
    PrivacyAcknowledgementsPanel.preload(),
    ReleaseNotesPanel.preload(),
    AccessibilityOutagesPanel.preload(),
    SurfaceNoticesPanel.preload(),
    TtcAnnouncementsPanel.preload(),
    StationDetailPanel.preload(),
  ]);
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

function focusStationDetailWhenOpen() {
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    const panel = document.querySelector<HTMLElement>(".station-detail-panel:not([data-closing])");
    if (panel && (document.activeElement === document.body || document.activeElement === null)) {
      panel.focus({ preventScroll: true });
    }
  }));
}

// Closing the account dialog steps back over its history entry, which lands on
// the emailed verification or reset link again. Once that step settles, swap
// the address for the dashboard so a reload cannot replay a spent token.
function leaveEmailedLinkRoute() {
  const leave = () => {
    window.clearTimeout(fallback);
    window.removeEventListener("popstate", leave);
    if (["/verify-email", "/reset-password"].includes(window.location.pathname)) {
      window.history.replaceState(window.history.state, "", "/");
    }
  };
  window.addEventListener("popstate", leave);
  const fallback = window.setTimeout(leave, 250);
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
  useRouter();
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkId>(initialVisualPreferences.defaultNetwork);
  const [defaultNetworkPreference, setDefaultNetworkPreference] = useState<NetworkId>(initialVisualPreferences.defaultNetwork);

  const {
    displayData,
    ttcData,
    regionalData,
    dashboards: effectiveDashboards,
    dashboardRequestState,
    dashboardRequestStates,
    dashboardAvailabilityNotice,
    snapshotClock,
    connectionOffline,
    snapshotReason,
    syncing,
    verifiedAt,
    sessionVerified,
    fetchDashboard,
  } = useDashboardSession({
    initialData,
    selectedNetwork,
    offlineShell,
  });

  const networkTransitionTargetRef = useRef<NetworkId | null>(null);
  const networkMapTransitionRef = useRef<ReturnType<typeof startMapSurfaceTransition> | null>(null);
  const networkMapSurfaceRef = useRef<HTMLElement | null>(null);
  const geographicFadeRef = useRef<MapFadeController | null>(null);
  const preparedMapReadyRef = useRef<{ network: NetworkId; resolve: () => void } | null>(null);
  const [warmingNetwork, setWarmingNetwork] = useState<NetworkId | null>(null);
  const [preparingNetwork, setPreparingNetwork] = useState<NetworkId | null>(null);
  const [networkSwitchTarget, setNetworkSwitchTarget] = useState<NetworkId | null>(null);
  const [networkSwitchError, setNetworkSwitchError] = useState<NetworkId | null>(null);

  const cancelNetworkTransition = useCallback(() => {
    networkMapTransitionRef.current?.cancel();
    networkMapTransitionRef.current = null;
    networkTransitionTargetRef.current = null;
    preparedMapReadyRef.current = null;
    setPreparingNetwork(null);
    setNetworkSwitchTarget(null);
  }, []);

  useEffect(() => () => {
    networkMapTransitionRef.current?.cancel();
  }, []);

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
  const isLive = displayData.generatedAt.live && displayData.availability !== "unavailable" && displayData.availability !== "fixture";
  const isConnectionIssue = snapshotReason !== "refreshing" && (
    Boolean(displayData.snapshot) || dashboardRequestState === "reconnecting" || displayData.availability === "degraded"
  );
  const [desktopLiveAnnouncement, setDesktopLiveAnnouncement] = useState("");
  const announceDesktop = useCallback((message: string) => {
    setDesktopLiveAnnouncement(message);
  }, []);

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
      !plannedClosures.some((closure) => closure.id === nextSelection.id) &&
      activeAlerts.some((alert) => alert.id === nextSelection.id)
    ) {
      return "alerts";
    }
    return viewForImpactKind(nextSelection.kind);
  }, [activeAlerts, plannedClosures, viewForImpactKind]);

  const [isDark, setIsDark] = useState(initialVisualPreferences.theme === "dark");
  const [highContrast, setHighContrast] = useState(initialVisualPreferences.highContrast);
  const [reducedMotion, setReducedMotion] = useState(initialVisualPreferences.reducedMotion);
  const [reducedMotionOverride, setReducedMotionOverride] = useState(initialVisualPreferences.reducedMotionOverride);
  const [dotBackgroundEnabled, setDotBackgroundEnabled] = useState(initialVisualPreferences.dotBackgroundEnabled);
  const [mapViewPreference, setMapViewPreference] = useState<MapViewPreference>(initialVisualPreferences.mapView ?? "diagram");
  const [visualPreferencesReady, setVisualPreferencesReady] = useState(false);
  const mobilePerformanceMode = useMobilePerformanceMode();
  const isFirstMountRef = useRef(true);
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    cancelNetworkTransition();
  }, [mapViewPreference, isDark, highContrast, reducedMotion, cancelNetworkTransition]);
  const lastSavedViewRef = useRef<"my-stations" | "commutes">("my-stations");

  const [initialMapReady, setInitialMapReady] = useState(false);
  useEffect(() => {
    if (!initialMapReady) return;
    // Cache resources first. On phones, prepare only the static diagram and
    // wait for a gap in gestures before mounting it; live overlays stay deferred.
    const mobile = window.matchMedia(MOBILE_PERFORMANCE_QUERY).matches;
    let cancelled = false;
    let resourcesReady = false;
    let mounted = false;
    let mountCallback: number | null = null;
    const network = selectedNetwork === "ttc" ? "regional" : "ttc";
    const surface = networkMapSurfaceRef.current;
    const mountOtherNetwork = () => {
      mountCallback = null;
      if (cancelled || mounted || surface?.querySelector('[data-map-gesture-active="true"]')) return;
      mounted = true;
      startTransition(() => setWarmingNetwork(network));
    };
    const scheduleMount = () => {
      if (cancelled || mounted || !resourcesReady || mountCallback !== null
        || surface?.querySelector('[data-map-gesture-active="true"]')) return;
      mountCallback = typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(mountOtherNetwork)
        : window.setTimeout(mountOtherNetwork, 100);
    };
    const gestureObserver = mobile ? new MutationObserver(scheduleMount) : null;
    if (gestureObserver && surface) gestureObserver.observe(surface, {
      subtree: true, attributes: true, attributeFilter: ["data-map-gesture-active"],
    });
    // Prepare the other network once the current map is usable and the browser is idle.
    const warmOtherNetwork = () => {
      const theme = highContrast ? "high-contrast" : isDark ? "dark" : "light";
      const density = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches ? "mobile" : "balanced";
      void prepareNetworkMap(network, mapViewPreference, theme, density).then(() => {
        if (cancelled || mapViewPreference !== "diagram") return;
        resourcesReady = true;
        if (mobile) scheduleMount();
        else mountOtherNetwork();
      }, () => undefined);
    };
    const idleCallback = typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback(warmOtherNetwork, { timeout: 300 }) : null;
    const timer = idleCallback === null ? window.setTimeout(warmOtherNetwork, 100) : null;
    return () => {
      cancelled = true;
      gestureObserver?.disconnect();
      if (mountCallback !== null) {
        if (typeof window.requestIdleCallback === "function") window.cancelIdleCallback(mountCallback);
        else window.clearTimeout(mountCallback);
      }
      if (idleCallback !== null) window.cancelIdleCallback(idleCallback);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [initialMapReady, selectedNetwork, highContrast, isDark, mapViewPreference, mobilePerformanceMode]);

  useEffect(() => {
    if (!initialMapReady) return;
    const idleCallback = typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback(preloadPanelModules, { timeout: 2_000 }) : null;
    const timer = idleCallback === null ? window.setTimeout(preloadPanelModules, 500) : null;
    return () => {
      if (idleCallback !== null) window.cancelIdleCallback(idleCallback);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [initialMapReady]);

  const [menuPinned, setMenuPinned] = useState(false);
  const [menuPinPreferenceReady, setMenuPinPreferenceReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState<boolean>(false);
  const [windowWidth, setWindowWidth] = useState<number>(1200);
  const [mobileInspectorDetent, setMobileInspectorDetent] = useState<MobileInspectorDetent>("details-focus");
  const [mapLayoutSignal, setMapLayoutSignal] = useState(0);
  const [mapPresentationMode, setMapPresentationMode] = useState<MapPresentationMode>("standard");
  const [rotatedMapViewportFrame, setRotatedMapViewportFrame] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [pwaEngagementSignal, setPwaEngagementSignal] = useState(0);
  const [estimatedTrainsEnabled, setEstimatedTrainsEnabled] = useState(initialVisualPreferences.estimatedTrainsEnabled);
  const subwayOperatingState = useSubwayOperatingState();
  const regionalRailOperatingState = useRegionalRailOperatingState();
  const trainNetworkOpen = selectedNetwork === "ttc"
    ? subwayOperatingState.status === "open"
    : regionalRailOperatingState.status === "open";
  const {
    estimatedTrainSnapshot,
    estimatedTrainMarkersVisible,
    estimatedTrainStatusLabel,
    estimatedTrainControlUnavailableReason,
    estimatedTrainDisplayPending,
    estimatedTrainPendingLabel,
  } = useEstimatedTrains({
    selectedNetwork,
    estimatedTrainsEnabled,
    trainNetworkOpen,
    viewingSnapshot: Boolean(displayData.snapshot),
  });

  const onSignOutCommuteResetRef = useRef<() => void>(() => {});
  const onSignOutSavedStationsResetRef = useRef<() => void>(() => {});

  const accountSession = useAccountSession({
    onSignOut: () => {
      setAccountCommutes([]);
      onSignOutSavedStationsResetRef.current();
      onSignOutCommuteResetRef.current();
    },
  });
  const { accountState, setAccountState, userGeneration, userGenerationRef, authConfig } = accountSession;

  const [accountActionError, setAccountActionError] = useState<string | null>(null);
  const [isActionBusy, setIsActionBusy] = useState(false);
  const accountBusy = accountSession.isSigningOut || isActionBusy;

  const [accountDialogRequest, setAccountDialogRequest] = useState<AccountDialogIntentOptions | null>(() => {
    if (initialEmailVerificationToken.trim()) {
      return { mode: "verify-email", initialToken: initialEmailVerificationToken.trim() };
    }
    if (initialPasswordResetToken.trim()) {
      return { mode: "reset-password", initialToken: initialPasswordResetToken.trim() };
    }
    return null;
  });
  const accountDialogOpenRef = useRef(Boolean(accountDialogRequest));
  const [accountCommutes, setAccountCommutes] = useState<AccountSavedCommute[]>([]);
  const [myStationsListModeEpoch, setMyStationsListModeEpoch] = useState(0);
  const [commutesActiveTab, setCommutesActiveTab] = useState<"create" | "saved">("saved");
  const [commutesDraft, setCommutesDraft] = useState<SavedCommuteDraft | null>(() => persistedCommuteDraftStore.current);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Desktop collapse is page-lifetime UI state. Remove the retired durable
    // preference so an older visit cannot affect this or future releases.
    window.localStorage.removeItem("linewatch-desktop-sidebar-collapsed");
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

  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const handleCloseSearchRef = useRef<() => void>(() => {});

  const nav = useNavigationTransitions({
    isMobile,
    reducedMotion,
    selectedNetwork,
    accountDialogOpen: Boolean(accountDialogRequest),
    onCloseAccountDialog: () => {
      accountDialogOpenRef.current = false;
      setAccountDialogRequest(null);
    },
    onNetworkChange: (networkId) => {
      handleNetworkChange(networkId);
    },
    onClearPersistedCommuteDraft: () => {
      setCommutesActiveTab("saved");
      setCommutesDraft(null);
      clearPersistedCommuteDraft();
    },
    onResetMapPresentation: () => {
      setMapPresentationMode("standard");
    },
    onSetMobileInspectorDetent: (detent) => {
      setMobileInspectorDetent(detent);
    },
    getMobileInspectorDetent: () => mobileInspectorDetent,
    onRecordPwaEngagement: () => {
      recordPwaInstallEngagement();
    },
    onDesktopSidebarEnsureOpen: () => {
      if (!isMobile && desktopSidebarCollapsed) {
        setDesktopSidebarCollapsed(false);
      }
    },
    onAnnounceDesktop: (msg) => {
      announceDesktop(msg);
    },
    onDesktopEscapeSearch: () => {
      handleCloseSearchRef.current();
    },
    isSearchFocused: () => Boolean(desktopSearchInputRef.current && document.activeElement === desktopSearchInputRef.current),
    viewForImpactSelection,
  });

  const {
    activeView,
    navDirection,
    selectedStationId,
    selection,
    commutePathPreview,
    commutesFocusedCommuteId,
    searchReturnDestination,
    searchReturnLabel,
    stationPanelActivationKey,
    selectionAttentionGeneration,
    restoredSelection,
    mobileImpactReturnView,
    impactBackContext,
    handleSelectImpactDetails,
    dismissImpactNavigation,
    impactListLaunch,
    lineImpactLaunch,
    accessibilityOutageTarget,
    surfaceNoticeInitialQuery,
    surfaceNoticeInitialId,
    surfaceNoticeInitialContent,
    isClosingPanel,
    isGoingBack,
    isClosingSearch,
    activeViewRef,
    selectedStationIdRef,
    stationDrilldownOriginRef,
    selectionRef,
    selectionBackBehaviorRef,
    commutePathPreviewRef,
    searchReturnContextRef,
    crossNetworkStationSelectionRef,
    viewScrollPositionsRef,
    navigateRoot,
    navigateForward,
    handleClosePanel,
    handleSubmenuBack,
    handleImpactStepBack,
    handleSelectStationId: navSelectStationId,
    closeSelectedStation,
    handleMapSelectImpact: navMapSelectImpact,
    handleStationSelectImpact: navStationSelectImpact,
    clearCommutePreview,
    openImpactCategory,
    openLineImpacts,
    captureSearchReturnContext,
    navigateToMapDrilldown,
    restoreMapDrilldownOrigin,
    pushBrowserNavigationEntry,
    consumeBrowserNavigationEntries,
    setActiveView,
    setSelectedStationId,
    setSelection,
    setCommutePathPreview,
    setCommutesFocusedCommuteId,
    setStationPanelActivationKey,
    setSelectionAttentionGeneration,
    setImpactListLaunch,
    setIsClosingSearch,
    searchClosingTimeoutRef,
    setAccessibilityOutageTarget,
    setSurfaceNoticeInitialQuery,
    setSurfaceNoticeInitialId,
    setSurfaceNoticeInitialContent,
    setMobileImpactReturnView,
  } = nav;

  useEffect(() => {
    onSignOutCommuteResetRef.current = () => {
      setCommutePathPreview(null);
    };
  }, [setCommutePathPreview]);

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

  const openAccountDialog = useCallback((options: AccountDialogIntentOptions | AccountDialogMode) => {
    const next: AccountDialogIntentOptions = typeof options === "string" ? { mode: options } : options;
    if (!accountDialogOpenRef.current) {
      pushBrowserNavigationEntry();
    }
    accountDialogOpenRef.current = true;
    setAccountDialogRequest(next);
  }, [pushBrowserNavigationEntry, setAccountDialogRequest]);

  const closeAccountDialog = useCallback(() => {
    if (!accountDialogOpenRef.current && !accountDialogRequest) return;
    consumeBrowserNavigationEntries();
    accountDialogOpenRef.current = false;
    setAccountDialogRequest(null);
  }, [accountDialogRequest, consumeBrowserNavigationEntries, setAccountDialogRequest]);

  const openAuthChoice = useCallback((intent: AccountEntryIntent) => {
    openAccountDialog({ mode: "auth-choice", entryIntent: intent });
  }, [openAccountDialog]);

  const openGoogleLinkDialog = useCallback(() => {
    openAccountDialog({ mode: "link-google" });
  }, [openAccountDialog]);

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
      openAccountDialog({
        mode: "verify-email",
        initialToken: fragmentToken,
      });
    }, 0);
    return () => window.clearTimeout(openTimer);
  }, [initialEmailVerificationToken, openAccountDialog]);

  const [stationSheetRatio, setStationSheetRatio] = useState<number>(() => {
    if (typeof window === "undefined") return MOBILE_SHEET_DEFAULT_RATIO;
    return readStoredSheetHeightRatio(window.localStorage);
  });

  const [desktopMapFocus, setDesktopMapFocus] = useState<{
    selection: NonNullable<ImpactSelection>;
    attentionGeneration: number;
    network: NetworkId;
  } | null>(null);

  const handleMapSelectImpact = useCallback((
    nextSelection: ImpactSelection,
    { focusOnMap = true, related = false }: { focusOnMap?: boolean; related?: boolean } = {},
  ) => {
    if (!isMobile) {
      setDesktopMapFocus(nextSelection && focusOnMap ? {
        selection: nextSelection,
        attentionGeneration: selectionAttentionGeneration + 1,
        network: selectedNetwork,
      } : null);
    }
    if (nextSelection && isMobile) {
      setMobileInspectorDetent("details-focus");
    }
    navMapSelectImpact(nextSelection, { related });
  }, [isMobile, navMapSelectImpact, selectedNetwork, selectionAttentionGeneration, setMobileInspectorDetent]);

  const handleSelectStationId = useCallback((id: string | null) => {
    navSelectStationId(id);
    if (id) {
      setStationSheetRatio(readStoredSheetHeightRatio(typeof window !== "undefined" ? window.localStorage : null));
    }
  }, [navSelectStationId]);

  const handleStationSelectImpact = useCallback((nextSelection: ImpactSelection) => {
    if (stationDrilldownOriginRef.current) {
      // Station drilldown origin is preserved for back navigation
    }
    navStationSelectImpact(nextSelection);
  }, [navStationSelectImpact, stationDrilldownOriginRef]);

  useLayoutEffect(() => {
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
    setMapViewPreference(stored.mapView ?? initialVisualPreferences.mapView ?? "diagram");
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
    initialVisualPreferences.mapView,
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
      mapView: mapViewPreference,
    };

    writeVisualPreferencesToStorage(window.localStorage, preferences);
    persistVisualPreferencesCookie(preferences, window.location.protocol);
  }, [defaultNetworkPreference, dotBackgroundEnabled, estimatedTrainsEnabled, highContrast, isDark, mapViewPreference, reducedMotion, reducedMotionOverride, visualPreferencesReady]);


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
      // visualViewport dimensions shrink during browser page zoom or when iOS
      // WebKit excludes bottom safe-areas / dynamic chrome. Only contract the
      // layout shell when the software keyboard is active, keeping full window
      // height for edge-to-edge chrome and preventing floating nav gaps on iOS.
      const effectiveViewportHeight = pageZoomed || !keyboardOpen
        ? Math.max(window.innerHeight, Math.round(layoutHeight))
        : layoutHeight;
      const root = document.documentElement;

      root.style.setProperty("--visual-viewport-height", `${Math.round(effectiveViewportHeight)}px`);
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
    if (
      activeView !== "alerts"
      && activeView !== "delays"
      && activeView !== "reduced-speed-zones"
      && activeView !== "closures"
    ) {
      // The line focus is navigation context, not a saved filter preference.
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
  // While a network switch runs, the outgoing map is still the active one, so
  // a Center or zoom press would move the map the rider is leaving.
  const sendMapCameraCommand = useCallback((send: Dispatch<SetStateAction<number>>) => {
    if (networkTransitionTargetRef.current) return;
    send((prev) => prev + 1);
  }, []);

  // Start with the map available overnight; the closed notice opens details on demand.
  const [closedMapPeek, setClosedMapPeek] = useState(true);
  const [closedScreenAcknowledged, setClosedScreenAcknowledged] = useState(true);
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




  const openLegendImpactCategory = useCallback((view: ImpactCategoryView, lineId: string) => {
    setLegendExpanded(false);
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
  const {
    ttcStationSummaries,
    accessibilityOutageState,
    currentServiceNotices,
    surfaceNoticeCount,
    regionalTripChangeCount,
    announcementCount,
  } = useNetworkServiceFeeds({
    selectedNetwork,
    closedMapPeek,
    subwayStatus: subwayOperatingState.status,
    regionalStatus: regionalRailOperatingState.status,
  });
  const stationCatalogs = useMemo(
    () => ({
      ttc: ttcStationSummaries,
      regional: regionalStationSummaries.stations,
    }),
    [ttcStationSummaries],
  );
  const stationSummaries = stationCatalogs[selectedNetwork];
  const {
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
  } = useSavedStations({
    selectedNetwork,
    accountState,
    userGeneration,
    userGenerationRef,
    activeViewRef,
    openAuthChoice,
    stationCatalogs,
  });
  useEffect(() => {
    onSignOutSavedStationsResetRef.current = resetSavedStations;
  }, [resetSavedStations]);

  const desktopMetrics = useMemo(() => {
    return computeDesktopLayoutMetrics({ windowWidth, isMobile, activeView, selectedStationId });
  }, [windowWidth, isMobile, activeView, selectedStationId]);
  const [searchExpandedLineId, setSearchExpandedLineId] = useState<string | null>(null);

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
  const { visibleStationResult, setVisibleStationResult, stationLoading } = useTtcStationDetail(selectedNetwork, selectedStationId);
  useEffect(() => {
    if (selection?.kind !== "planned-closure") return;
    if (displayData.plannedClosures.some((closure) => closure.id === selection.id)) return;
    selectionRef.current = null;
    // The notice can disappear on refresh or after its final window closes.
    setSelection(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMobileInspectorDetent("map-focus");
    announceDesktop("Selected planned advisory is no longer available");
  }, [announceDesktop, displayData.plannedClosures, selection, setMobileInspectorDetent]);
  const accessibilityOutageResult = accessibilityOutageState?.networkId === selectedNetwork
    ? accessibilityOutageState.data
    : null;
  const [expandedMyStationDisruptionIds, setExpandedMyStationDisruptionIds] = useState<Set<string>>(() => new Set());


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

  const [pendingNotificationTarget, setPendingNotificationTarget] = useState<{
    target: NotificationTarget;
    receivedAt: number;
  } | null>(null);
  const [notificationTargetWaitTick, setNotificationTargetWaitTick] = useState(0);
  const notificationDestinationRequestRef = useRef(0);
  const [alertHistoryFocus, setAlertHistoryFocus] = useState<(AlertHistoryFocus & { requestId: number }) | null>(null);
  const [lineImpactTapNotice, setLineImpactTapNotice] = useState<{ lineId: string; notice: NotificationTapNoticeValue } | null>(null);
  const [focusTripChangeId, setFocusTripChangeId] = useState<string | null>(null);

  const selectedNetworkRef = useRef(selectedNetwork);
  useEffect(() => {
    selectedNetworkRef.current = selectedNetwork;
  }, [selectedNetwork]);

  const switchNetworkForDeepLink = useCallback((network: NetworkId) => {
    if (network === selectedNetworkRef.current) return;
    cancelNetworkTransition();
    setClosedScreenAcknowledged(true);
    setClosedMapPeek(true);
    setSelectedNetwork(network);
  }, [cancelNetworkTransition]);

  // Handles launch URLs and notification taps delivered to an already-open app.
  // supports panel=notifications, panel=commutes, panel=alerts, panel=delays, panel=reduced-speed-zones, panel=closures, panel=release-notes
  const applyDeepLinkParams = useCallback((params: URLSearchParams) => {
    const deepLink = parseNavigationDeepLinks(params, { hasReleaseNotes });
    const nextParams = deepLink.cleanedParams;
    let shouldReplaceUrl = deepLink.shouldReplaceUrl;
    if (deepLink.requestedNetwork) {
      switchNetworkForDeepLink(deepLink.requestedNetwork);
    }

    if (deepLink.accountLinked) {
      openAccountDialog({
        mode: "link-google",
        successMessage: GOOGLE_LINK_SUCCESS_MESSAGE,
      });
    } else if (deepLink.accountError) {
      openAccountDialog({
        mode: deepLink.accountError.dialogMode,
        entryIntent: deepLink.accountError.entryIntent,
        error: deepLink.accountError.message,
      });
    }

    if (deepLink.surfaceNoticeInitialContent) {
      setSurfaceNoticeInitialContent(deepLink.surfaceNoticeInitialContent);
    }

    const notificationTarget = parseNotificationTarget(params);
    if (notificationTarget) {
      // The destination is decided once the target network's data can answer for it.
      if (notificationTarget.network) switchNetworkForDeepLink(notificationTarget.network);
      setPendingNotificationTarget({ target: notificationTarget, receivedAt: Date.now() });
      for (const key of NOTIFICATION_TARGET_PARAMS) nextParams.delete(key);
      nextParams.delete("panel");
      shouldReplaceUrl = true;
    } else if (deepLink.stationDeepLink) {
      selectedStationIdRef.current = deepLink.stationDeepLink.stationId;
      setSelectedStationId(deepLink.stationDeepLink.stationId);
      setStationPanelActivationKey((current) => current + 1);
      setMobileInspectorDetent("details-focus");
      if (!isMobile) {
        setDesktopSidebarCollapsed(false);
      }
      setActiveView("map");
    } else if (deepLink.lineDeepLink) {
      switchNetworkForDeepLink(deepLink.lineDeepLink.network);
      if (!isMobile) {
        setDesktopSidebarCollapsed(false);
      }
      openLineImpacts(deepLink.lineDeepLink.lineId);
    } else if (deepLink.panelView) {
      if (!isMobile) {
        setDesktopSidebarCollapsed(false);
      }
      navigateForward(deepLink.panelView);
    }

    if (shouldReplaceUrl) {
      replaceBrowserSearchParams(nextParams);
    }
  }, [isMobile, navigateForward, openAccountDialog, openLineImpacts, setActiveView, setSelectedStationId, setStationPanelActivationKey, setSurfaceNoticeInitialContent, selectedStationIdRef, switchNetworkForDeepLink]);

  const launchDeepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (launchDeepLinkHandledRef.current) return;
    launchDeepLinkHandledRef.current = true;
    applyDeepLinkParams(new URLSearchParams(window.location.search));
  }, [applyDeepLinkParams]);

  const applyDeepLinkParamsRef = useRef(applyDeepLinkParams);
  useEffect(() => {
    applyDeepLinkParamsRef.current = applyDeepLinkParams;
  }, [applyDeepLinkParams]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== NOTIFICATION_OPEN_MESSAGE || typeof event.data.url !== "string") return;
      const target = new URL(event.data.url, window.location.origin);
      if (target.origin !== window.location.origin) return;
      // Acknowledge first so the worker does not also navigate this window.
      event.ports[0]?.postMessage({ type: `${NOTIFICATION_OPEN_MESSAGE}-ack` });
      applyDeepLinkParamsRef.current(target.searchParams);
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, []);

  const applyNotificationDestination = useCallback((destination: Exclude<NotificationDestination, { type: "wait" }>) => {
    setClosedScreenAcknowledged(true);
    setClosedMapPeek(true);
    const requestId = ++notificationDestinationRequestRef.current;
    if (destination.type === "impact") {
      pushBrowserNavigationEntry();
      setSelectedStationId(null);
      setCommutePathPreview(null);
      selectionBackBehaviorRef.current = "clear";
      selectionRef.current = destination.selection;
      setSelection(destination.selection);
      setMobileInspectorDetent("details-focus");
      setActiveView("map");
      return;
    }
    if (!isMobile) {
      setDesktopSidebarCollapsed(false);
    }
    switch (destination.type) {
      case "alert-history":
        setAlertHistoryFocus({
          requestId,
          alertId: destination.alertId,
          lineId: destination.lineId,
          impactKind: destination.impactKind,
          notice: destination.notice,
        });
        navigateForward("alert-history");
        return;
      case "line-impacts":
        setLineImpactTapNotice({ lineId: destination.lineId, notice: destination.notice });
        openLineImpacts(destination.lineId);
        return;
      case "trip-changes":
        setSurfaceNoticeInitialContent("trip-changes");
        setFocusTripChangeId(destination.tripChangeId);
        navigateForward("surface-notices");
        return;
      case "commutes":
        setCommutesFocusedCommuteId(destination.commuteId);
        navigateForward("commutes");
        return;
    }
  }, [isMobile, navigateForward, openLineImpacts, pushBrowserNavigationEntry, selectionBackBehaviorRef, selectionRef, setActiveView, setCommutePathPreview, setCommutesFocusedCommuteId, setMobileInspectorDetent, setSelectedStationId, setSelection, setSurfaceNoticeInitialContent]);

  useEffect(() => {
    if (!pendingNotificationTarget) return;
    const { target, receivedAt } = pendingNotificationTarget;
    // Resolve against the network the destination will render, never a neighbour's data.
    // Re-assert it too: restoring the stored default network can land after the launch link.
    if (target.network && target.network !== selectedNetwork) {
      switchNetworkForDeepLink(target.network);
      return;
    }
    const network = target.network ?? selectedNetwork;
    const elapsed = Date.now() - receivedAt;
    const destination = resolveNotificationTarget(target, {
      dashboard: effectiveDashboards[network],
      verified: sessionVerified[network],
      waitExpired: connectionOffline || elapsed >= NOTIFICATION_TARGET_WAIT_MS,
    });
    if (destination.type === "wait") {
      const timer = window.setTimeout(
        () => setNotificationTargetWaitTick((tick) => tick + 1),
        NOTIFICATION_TARGET_WAIT_MS - elapsed,
      );
      return () => window.clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingNotificationTarget(null);
    applyNotificationDestination(destination);
  }, [applyNotificationDestination, connectionOffline, effectiveDashboards, notificationTargetWaitTick, pendingNotificationTarget, selectedNetwork, sessionVerified, switchNetworkForDeepLink]);

  // Destination context belongs to the view it explained; leaving that view retires it.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (activeView !== "alert-history") setAlertHistoryFocus(null);
    if (activeView !== "line-impacts") setLineImpactTapNotice(null);
    if (activeView !== "surface-notices") setFocusTripChangeId(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [activeView]);

  useEffect(() => {
    let cancelled = false;

    if (!accountState.authenticated) {
      setAccountCommutes([]);
      return () => {
        cancelled = true;
      };
    }

    const currentGeneration = userGeneration;
    getSavedCommutes().then((result) => {
      if (!cancelled && userGenerationRef.current === currentGeneration) {
        setAccountCommutes(result.commutes);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [accountState.authenticated, accountState.user?.id, userGeneration, userGenerationRef]);

  const openMyStations = () => {
    clearSavedStationNotice();
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

  const handleDemoAccount = useCallback(async () => {
    setIsActionBusy(true);
    setAccountActionError(null);
    try {
      await accountSession.loginDemo();
      setActiveView("commutes");
    } catch {
      setAccountActionError("Demo account is unavailable.");
    } finally {
      setIsActionBusy(false);
    }
  }, [accountSession, setActiveView, setAccountActionError, setIsActionBusy]);

  const handleSignOut = useCallback(async () => {
    setIsActionBusy(true);
    setAccountActionError(null);
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
      await accountSession.signOut({ pushEndpoint });
    } catch {
      setAccountActionError("Sign out failed.");
    } finally {
      setIsActionBusy(false);
    }
  }, [accountSession, pushSettings.supported, setAccountActionError, setIsActionBusy]);

  const handleAuthenticated = useCallback((nextState: AccountState) => {
    setAccountState(nextState);
    const onEmailedLinkRoute = ["/verify-email", "/reset-password"].includes(window.location.pathname);
    closeAccountDialog();
    setActiveView("commutes");
    if (onEmailedLinkRoute) leaveEmailedLinkRoute();
  }, [closeAccountDialog, setAccountState, setActiveView]);


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
      cancelNetworkTransition();
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
    } else if (desktopMetrics.mode === "overlay" && !desktopSidebarCollapsed) {
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
      cancelNetworkTransition();
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
    setSelectionAttentionGeneration((current) => current + 1);
    setSelection(impactSelection);
    setSelectedStationId(null);
    setMobileInspectorDetent("details-focus");
    if (isMobile) {
      setMobileImpactReturnView(null);
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
    clearCommutePreview(commuteIdOrEvent);
  }, [clearCommutePreview]);

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const stationSearchInputRef = useRef<HTMLInputElement>(null);
  const desktopRailToggleRef = useRef<HTMLButtonElement>(null);
  const searchOriginRef = useRef<ActiveView>("status");
  const searchSessionActiveRef = useRef<boolean>(false);
  const suppressSearchReopenRef = useRef<boolean>(false);
  const headerSearchBarRef = useRef<HTMLDivElement>(null);
  const stationKeyDownHandlerRef = useRef<((event: KeyboardEvent<HTMLInputElement>) => void) | null>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const menuActionRefs = useRef<Array<MainMenuActionElement | null>>([]);

  const registerMenuAction = (index: number) => (element: MainMenuActionElement | null) => {
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
    if (network === networkTransitionTargetRef.current) return;
    cancelNetworkTransition();
    setNetworkSwitchError(null);
    if (network === selectedNetwork) return;
    const previousNetwork = selectedNetwork;
    networkTransitionTargetRef.current = network;
    setNetworkSwitchTarget(network);

    const applyNetworkChange = () => {
      const pendingStationSelection = crossNetworkStationSelectionRef.current?.networkId === network
        ? crossNetworkStationSelectionRef.current
        : null;
      crossNetworkStationSelectionRef.current = null;
      setClosedScreenAcknowledged(true);
      setClosedMapPeek(true);
      setIsClosedScreenExiting(false);
      setSelectedNetwork(network);
      setPreparingNetwork(null);
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
    const surface = networkMapSurfaceRef.current;
    if (!surface) {
      applyNetworkChange();
      networkTransitionTargetRef.current = null;
      setNetworkSwitchTarget(null);
      return;
    }
    let applied = false;
    const geographic = mapViewPreference === "geographic";
    const transition = startMapSurfaceTransition(surface, {
      reducedMotion,
      waitForReady: geographic,
      fade: geographic ? {
        fade: (...args) => geographicFadeRef.current?.fade(...args) ?? Promise.resolve(),
        reset: () => geographicFadeRef.current?.reset(),
      } : undefined,
      prepare: async signal => {
        // Verify the destination while its map is being prepared. A slow or
        // unavailable source still switches with honest unknown-status ribs.
        const statusReady = new Promise<void>(resolve => {
          // A known unavailable source remains explicitly unknown while its
          // retry runs; it should not hold up every return to a prepared map.
          if (dashboardRequestStates[network] === "reconnecting") {
            void fetchDashboard(network);
            resolve();
            return;
          }
          const checkedAt = verifiedAt[network];
          if (sessionVerified[network] && checkedAt !== null
            && Date.now() - checkedAt < dashboardRefreshIntervalMs()) {
            resolve();
            return;
          }
          const timer = window.setTimeout(resolve, 400);
          void fetchDashboard(network).finally(() => {
            window.clearTimeout(timer);
            resolve();
          });
        });
        const theme = highContrast ? "high-contrast" : isDark ? "dark" : "light";
        const density = mobileMapPerformanceMode ? "mobile" : "balanced";
        if (!geographic && surface.querySelector(
          `.network-diagram-layer[data-network-map-layer="${network}"][data-map-ready="true"][data-map-variant="${theme}:${density}"] :is(.ttc-map-stage, .regional-map-stage)[data-raster-map-ready="true"]`,
        )) {
          await statusReady;
          return;
        }
        await prepareNetworkMap(network, mapViewPreference, theme, density);
        if (signal.aborted) throw signal.reason;
        if (!geographic) {
          await new Promise<void>((resolve, reject) => {
            const fallbackTimer = window.setTimeout(() => {
              signal.removeEventListener("abort", abort);
              resolve();
            }, 400);
            const abort = () => {
              window.clearTimeout(fallbackTimer);
              signal.removeEventListener("abort", abort);
              reject(signal.reason);
            };
            signal.addEventListener("abort", abort, { once: true });
            preparedMapReadyRef.current = { network, resolve: () => {
              window.clearTimeout(fallbackTimer);
              signal.removeEventListener("abort", abort);
              resolve();
            } };
            setPreparingNetwork(network);
          });
        }
        await statusReady;
      },
      update: () => {
        applied = true;
        flushSync(applyNetworkChange);
      },
    });
    networkMapTransitionRef.current = transition;
    const finish = (failed: boolean) => {
      if (networkMapTransitionRef.current !== transition) return;
      if (failed && applied) setSelectedNetwork(previousNetwork);
      networkMapTransitionRef.current = null;
      networkTransitionTargetRef.current = null;
      preparedMapReadyRef.current = null;
      setPreparingNetwork(null);
      setNetworkSwitchTarget(null);
      if (failed) setNetworkSwitchError(network);
    };
    void transition.finished.then(() => finish(false), () => finish(true));
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

  useEffect(() => {
    handleCloseSearchRef.current = handleCloseSearch;
  }, [handleCloseSearch]);

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

  const handleSearchSelectImpact = useCallback((nextSelection: NonNullable<ImpactSelection>) => {
    if (searchClosingTimeoutRef.current) {
      window.clearTimeout(searchClosingTimeoutRef.current);
      searchClosingTimeoutRef.current = null;
    }
    setIsClosingSearch(false);
    stationSearchInputRef.current?.blur();
    handleSelectImpactDetails(nextSelection);
  }, [handleSelectImpactDetails, searchClosingTimeoutRef, setIsClosingSearch]);

  const [selectionAttentionAnchor, setSelectionAttentionAnchor] = useState<SelectionAttentionAnchor | null>(null);
  const resolvedSelectionAttentionAnchor = resolveSelectionAttentionAnchor(
    selectionAttentionAnchor,
    selection,
    selectionAttentionGeneration,
    displayData,
    Boolean(selection) && selection === restoredSelection,
  );
  if (resolvedSelectionAttentionAnchor !== selectionAttentionAnchor) {
    setSelectionAttentionAnchor(resolvedSelectionAttentionAnchor);
  }
  const selectionIntroKey = resolvedSelectionAttentionAnchor?.key ?? null;

  const handleRelatedImpact = useCallback((nextSelection: ImpactSelection) => {
    if (!nextSelection) return;
    if (isMobile && activeView === "map") {
      handleMapSelectImpact(nextSelection, { related: true });
    } else {
      handleSelectImpactDetails(nextSelection);
    }
  }, [activeView, handleMapSelectImpact, handleSelectImpactDetails, isMobile]);

  const desktopImpactIsMapFocused = !isMobile
    && desktopMapFocus?.network === selectedNetwork
    && desktopMapFocus.attentionGeneration === selectionAttentionGeneration
    && desktopMapFocus.selection.kind === selection?.kind
    && desktopMapFocus.selection.id === selection?.id;
  const handleReturnImpactToMap = desktopImpactIsMapFocused
    ? () => handleMapSelectImpact(null)
    : impactBackContext ? handleImpactStepBack : undefined;

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
      // The search panel closes under the focused result; keep keyboard users
      // on the station details that open in its place.
      focusStationDetailWhenOpen();
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
    setSurfaceNoticeInitialId(notice.id);
    setSurfaceNoticeInitialContent("notices");
    navigateForward("surface-notices");
  }, [navigateForward]);

  const openRegionalTripChanges = useCallback(() => {
    setSurfaceNoticeInitialQuery("");
    setSurfaceNoticeInitialId(null);
    setSurfaceNoticeInitialContent("trip-changes");
    navigateForward("surface-notices");
  }, [navigateForward]);

  const openServiceNotices = useCallback(() => {
    setSurfaceNoticeInitialQuery("");
    setSurfaceNoticeInitialId(null);
    setSurfaceNoticeInitialContent("notices");
    navigateForward("surface-notices");
  }, [navigateForward]);

  const handleMyStationsSelectImpactDetails = useCallback((
    nextSelection: NonNullable<ImpactSelection>,
    networkId: NetworkId,
  ) => {
    cancelNetworkTransition();
    const targetDashboard = networkId === "regional" ? regionalData : ttcData;
    if (networkId !== selectedNetwork) {
      setClosedScreenAcknowledged(true);
      setClosedMapPeek(true);
      setSelectedNetwork(networkId);
    }
    setSelectedStationId(null);
    setCommutePathPreview(null);
    setSelectionAttentionGeneration((current) => current + 1);
    selectionBackBehaviorRef.current = "restore-view";
    selectionRef.current = nextSelection;
    setSelection(nextSelection);
    setMobileInspectorDetent("details-focus");
    const targetView = nextSelection.kind === "planned-closure"
      && targetDashboard.activeAlerts.some((alert) => alert.id === nextSelection.id)
      ? "alerts"
      : viewForImpactKind(nextSelection.kind);
    if (isMobile) {
      setMobileImpactReturnView("my-stations");
      pushBrowserNavigationEntry();
      navigateToMapDrilldown();
      return;
    }
    navigateForward(targetView);
  }, [cancelNetworkTransition, isMobile, navigateForward, navigateToMapDrilldown, pushBrowserNavigationEntry, regionalData, selectedNetwork, setCommutePathPreview, setMobileInspectorDetent, setSelectedStationId, setSelection, ttcData, viewForImpactKind]);

  const handleMyStationsSelectAccessibilityOutageDetails = useCallback((
    assetType: AccessibilityOutageTarget["assetType"],
    stationId: string,
    networkId: NetworkId,
  ) => {
    cancelNetworkTransition();
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
  }, [cancelNetworkTransition, navigateForward, selectedNetwork, setCommutePathPreview, setSelectedStationId, setSelection]);

  const handleMyStationsDisruptionExpandedChange = useCallback((stationId: string, expanded: boolean) => {
    setExpandedMyStationDisruptionIds((current) => {
      const next = new Set(current);
      if (expanded) next.add(stationId);
      else next.delete(stationId);
      return next;
    });
  }, []);

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
    // An impact opened from My Stations returns there, whatever history led to it.
    if (mobileImpactReturnView === "my-stations") {
      if (selectionRef.current) consumeBrowserNavigationEntries();
      selectionRef.current = null;
      selectionBackBehaviorRef.current = "clear";
      setMobileImpactReturnView(null);
      setSelection(null);
      setMobileInspectorDetent("map-focus");
      navigateRoot("my-stations");
      return;
    }
    if (dismissImpactNavigation()) {
      setMobileInspectorDetent("map-focus");
      return;
    }
    if (selectionRef.current) consumeBrowserNavigationEntries();
    selectionRef.current = null;
    const shouldRestoreOrigin = selectionBackBehaviorRef.current === "restore-view";
    selectionBackBehaviorRef.current = "clear";
    setMobileImpactReturnView(null);
    setSelection(null);
    setMobileInspectorDetent("map-focus");
    if (shouldRestoreOrigin) {
      restoreMapDrilldownOrigin();
    }
  }, [consumeBrowserNavigationEntries, dismissImpactNavigation, mobileImpactReturnView, navigateRoot, restoreMapDrilldownOrigin, selectionBackBehaviorRef, selectionRef, setMobileImpactReturnView, setMobileInspectorDetent, setSelection]);

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
      Boolean(accountDialogRequest) ||
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
      case "alerts": return "Suspensions";
      case "delays": return "Delays";
      case "reduced-speed-zones": return "Reduced Speed Zones";
      case "closures": return "Planned Advisories";
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
    if (desktopMetrics.mode === "overlay" && !desktopSidebarCollapsed) {
      setDesktopSidebarCollapsed(true);
      requestAnimationFrame(() => {
        desktopRailToggleRef.current?.focus();
      });
    }
    setMapLayoutSignal((prev) => prev + 1);
  }, [isMobile, desktopMetrics.mode, desktopSidebarCollapsed]);

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
            onSelectRelatedImpact={handleRelatedImpact}
            onReturnToMap={handleReturnImpactToMap}
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
            onFocusMap={handleFocusMapFromPanel}
            tapNotice={lineImpactTapNotice?.lineId === lineImpactLaunch.lineId ? lineImpactTapNotice.notice : null}
          />
        ) : null;
      case "alerts":
        return (
          <ActiveAlertsPanel
            key={`alerts-${impactListLaunch.requestId}`}
            selection={selection}
            onSelectImpact={handleMapSelectImpact}
            onSelectRelatedImpact={handleRelatedImpact}
            onReturnToMap={handleReturnImpactToMap}
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
            onSelectRelatedImpact={handleRelatedImpact}
            onReturnToMap={handleReturnImpactToMap}
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
            onSelectRelatedImpact={handleRelatedImpact}
            onReturnToMap={handleReturnImpactToMap}
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
            onSelectRelatedImpact={handleRelatedImpact}
            onReturnToMap={handleReturnImpactToMap}
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
            dashboards={effectiveDashboards}
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
            key={focusTripChangeId ? `trip-change-${focusTripChangeId}` : "surface-notices"}
            initialQuery={surfaceNoticeInitialQuery}
            initialNoticeId={surfaceNoticeInitialId}
            initialRegionalContent={surfaceNoticeInitialContent}
            focusTripChangeId={focusTripChangeId}
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
            key={alertHistoryFocus ? `alert-history-focus-${alertHistoryFocus.requestId}` : "alert-history"}
            onBack={handleSubmenuBack}
            onClose={handleClosePanel}
            network={selectedNetwork}
            destination={alertHistoryFocus}
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
            ? "Suspensions"
            : dest === "delays"
              ? "Delays"
              : dest === "reduced-speed-zones"
                ? "Reduced Speed Zones"
                : "Planned Advisories",
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
      case "accessibility-outages":
        navigateRoot("accessibility-outages");
        announceDesktop("Accessibility Outages");
        return;
      case "surface-notices":
        setSurfaceNoticeInitialQuery("");
        setSurfaceNoticeInitialContent("notices");
        navigateRoot("surface-notices");
        announceDesktop(selectedNetwork === "regional" ? "Service Notices" : "Streetcar & Bus");
        return;
      case "announcements":
        navigateRoot("announcements");
        announceDesktop("TTC Announcements");
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
      case "feedback":
        navigateRoot("feedback");
        announceDesktop("Leave Feedback");
        return;
    }
  }, [desktopSidebarCollapsed, navigateRoot, setCommutePathPreview, setSelectedStationId, setSelection, announceDesktop, selectedNetwork]);

  const desktopNotice: DesktopNotice | null = useMemo(() => {
    if (showClosedScreen) return null;
    const connection = serviceConnectionNotice({
      snapshot: displayData.snapshot,
      availability: displayData.availability,
      requestState: dashboardRequestState,
      snapshotClock,
      offline: connectionOffline,
    });
    if (connection) {
      return {
        kind: "connection",
        message: connection.message,
        snapshot: connection.snapshot,
        showSpinner: connection.showSpinner,
      };
    }
    return serviceOperatingNotice({
      network: selectedNetwork,
      subway: subwayOperatingState,
      regional: regionalRailOperatingState,
      showClosed: true,
      onOpenClosed: handleOpenClosedScreen,
    });
  }, [
    showClosedScreen,
    displayData.snapshot,
    displayData.availability,
    snapshotClock,
    connectionOffline,
    dashboardRequestState,
    selectedNetwork,
    subwayOperatingState,
    regionalRailOperatingState,
    handleOpenClosedScreen,
  ]);


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
              onRequestSignIn={() => openAuthChoice("register")}
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
            reducedMotion={reducedMotion}
            onClose={() => closeSelectedStation(selectedStationId)}
            onSelectImpact={handleStationSelectImpact}
            authenticated={accountState.authenticated || accountState.source === "unavailable"}
            saved={savedStationIds.has(selectedStationId)}
            savePending={pendingSavedStationIds.has(selectedStationId)}
            onToggleSaved={handleToggleSavedStation}
            onRequestSignIn={() => openAuthChoice("register")}
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
            onRequestSignIn={() => openAuthChoice("register")}
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
            dataSource={displayData.dataSource}
            networkId={selectedNetwork}
            snapshot={displayData.snapshot}
            syncing={syncing}
            accessibilityOutageCount={
              accessibilityOutageResult?.assetTypes.reduce((acc, curr) => acc + curr.count, 0) ?? 0
            }
            surfaceNoticeCount={surfaceNoticeCount ?? 0}
            tripChangeCount={regionalTripChangeCount ?? 0}
            surfaceNotices={!displayData.snapshot && currentServiceNotices?.networkId === selectedNetwork ? currentServiceNotices.data : null}
            operatingState={selectedNetwork === "ttc" ? subwayOperatingState : regionalRailOperatingState}
            notice={!desktopSidebarCollapsed && desktopNotice ? <DesktopNoticeBanner notice={desktopNotice} /> : null}
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
              handleMapSelectImpact(impactSelection, { focusOnMap: false });
            }}
            onSelectSurfaceNotice={handleSearchOpenSurfaceNotice}
            onNetworkChange={handleNetworkChange}
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
            onOpenNotifications={() => navigateForward("notifications")}
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
            supportUrl={supportUrl}
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
    stationSheetRatio,
  ]);

  const showMobileStatusPeek = !showClosedScreen && !rotatedMapMode && !showPwaInstallNudge && activeView === "map" && !selection && !selectedStationId && !commutePathPreview;

  const [hasLeftMap, setHasLeftMap] = useState(false);
  if (!showMobileStatusPeek && !hasLeftMap) {
    setHasLeftMap(true);
  }

  const mobileOperatingNotice: MobileOperatingNotice | null = useMemo(() => serviceOperatingNotice({
    network: selectedNetwork,
    subway: subwayOperatingState,
    regional: regionalRailOperatingState,
    showClosed: closedMapPeek,
    onOpenClosed: handleOpenClosedScreen,
  }), [selectedNetwork, subwayOperatingState, regionalRailOperatingState, closedMapPeek, handleOpenClosedScreen]);

  const mobileConnectionNotice: MobileConnectionNotice | null = useMemo(() => serviceConnectionNotice({
    snapshot: displayData.snapshot,
    availability: displayData.availability,
    requestState: dashboardRequestState,
    snapshotClock,
    offline: connectionOffline,
  }), [dashboardRequestState, displayData.availability, displayData.snapshot, snapshotClock, connectionOffline]);

  const mobileMapPerformanceMode = mobilePerformanceMode || rotatedMapMode;

  const handleMapReady = useCallback(() => {
    setInitialMapReady(true);
    if (networkTransitionTargetRef.current === selectedNetwork) {
      networkMapTransitionRef.current?.mapReady();
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

  return (
    <DataProvider data={displayData}>
      <DecorativeMotionPausedContext.Provider value={reducedMotion || highContrast}>
      <NetworkSwitchContext.Provider value={networkSwitchTarget ?? selectedNetwork}>
      <div
        style={shellViewportStyle}
        data-active-view={activeView}
        data-network={selectedNetwork}
        data-network-switch-target={networkSwitchTarget ?? undefined}
        data-menu-pinned={menuPinned ? "true" : undefined}
        className={`linewatch-shell relative w-full overflow-hidden transition-colors duration-500 ${(isDark || highContrast) ? (highContrast ? "dark bg-[#000000] text-slate-100" : "dark bg-[#0e1622] text-slate-100") : "bg-slate-50 text-slate-900"} ${highContrast ? "high-contrast" : ""} ${reducedMotion ? "motion-paused" : ""} ${mobileMapPerformanceMode ? "mobile-performance-mode" : ""} ${shellInspectorClasses}`}
      >
        <ScrollOverflowAffordances />
        {networkSwitchError && (
          <div className="network-switch-notice panel" role="status" aria-live="polite">
            <span>{`Couldn’t load the ${networkSwitchError === "regional" ? "GO/UP" : "TTC"} map. Your current map is still available.`}</span>
            <button type="button" onClick={() => handleNetworkChange(networkSwitchError)}>Retry</button>
          </div>
        )}
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
          <MainMenu
            accessibilityOutageResult={accessibilityOutageResult}
            accountActionError={accountActionError}
            accountBusy={accountBusy}
            accountCommutes={accountCommutes}
            accountState={accountState}
            activeAlerts={activeAlerts}
            activeView={activeView}
            announcementCount={announcementCount}
            authConfig={authConfig}
            commuteAffectedCount={commuteAffectedCount}
            commuteClearCount={commuteClearCount}
            defaultNetworkPreference={defaultNetworkPreference}
            delays={delays}
            displayData={displayData}
            dotBackgroundEnabled={dotBackgroundEnabled}
            handleDefaultNetworkChange={handleDefaultNetworkChange}
            handleDemoAccount={handleDemoAccount}
            handleMenuKeyDown={handleMenuKeyDown}
            handleSignOut={handleSignOut}
            handleToggleDotBackground={handleToggleDotBackground}
            handleToggleHighContrast={handleToggleHighContrast}
            handleToggleReducedMotion={handleToggleReducedMotion}
            highContrast={highContrast}
            lineStatuses={lineStatuses}
            menuPanelRef={menuPanelRef}
            menuPinned={menuPinned}
            menuVisible={menuVisible}
            navigateForward={navigateForward}
            openAuthChoice={openAuthChoice}
            openGoogleLinkDialog={openGoogleLinkDialog}
            openImpactCategory={openImpactCategory}
            openLineImpacts={openLineImpacts}
            openRegionalTripChanges={openRegionalTripChanges}
            openServiceNotices={openServiceNotices}
            plannedClosures={plannedClosures}
            reducedMotion={reducedMotion}
            reducedSpeedZoneCount={reducedSpeedZoneCount}
            reducedSpeedZones={reducedSpeedZones}
            regionalTripChangeCount={regionalTripChangeCount}
            registerMenuAction={registerMenuAction}
            savedStations={savedStations}
            savedStationsAffectedCount={savedStationsAffectedCount}
            savedStationsClearCount={savedStationsClearCount}
            selectedNetwork={selectedNetwork}
            setActiveView={setActiveView}
            setMenuPinned={setMenuPinned}
            setSelection={setSelection}
            supportUrl={supportUrl}
            surfaceNoticeCount={surfaceNoticeCount}
          />
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
            onRequestSignIn={() => openAuthChoice("register")}
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
          <div
            className="desktop-train-toggle-btn panel flex items-center gap-3 px-3.5 h-10 sm:h-14 rounded-xl shadow-lg hover:!bg-slate-200 dark:hover:!bg-[#1a1e28] hover:scale-[1.02] active:scale-[0.98] outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10] select-none text-left"
          >
            <div className="shrink-0 flex items-center justify-center">
              {estimatedTrainDisplayPending ? (
                <Loader2 className="estimated-train-pending-indicator animate-spin text-blue-500" size={21} aria-hidden="true" />
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
            <label htmlFor="desktop-train-markers-switch" className="hidden sm:flex flex-col items-start leading-tight min-w-0 pr-0.5 cursor-pointer">
              <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                Train Markers
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {!trainNetworkOpen ? "Closed" : estimatedTrainStatusLabel ?? (estimatedTrainsEnabled ? "On" : "Off")}
              </span>
            </label>
            <SquishSwitch
              id="desktop-train-markers-switch"
              checked={estimatedTrainsEnabled}
              disabled={!trainNetworkOpen}
              ariaBusy={estimatedTrainDisplayPending}
              ariaLabel={`Toggle estimated train markers (${estimatedTrainStatusLabel})`}
              className="hidden sm:inline-flex shrink-0"
              trackOnColor="#10b981"
              onChange={handleToggleEstimatedTrains}
              title={`Estimated Train Markers (${estimatedTrainStatusLabel})`}
            />
          </div>
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
          {!isMobile && (
            <SiteGuideDropdown
              open={guideOpen}
              onOpenChange={setGuideOpen}
            />
          )}
          {mapViewPreference !== "geographic" && (
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
          )}
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
            accessibilityOutageCount={
              accessibilityOutageResult?.assetTypes.reduce((acc, curr) => acc + curr.count, 0) ?? 0
            }
            surfaceNoticeCount={surfaceNoticeCount ?? 0}
            announcementCount={announcementCount ?? 0}
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
              "--desktop-sidebar-width": `${desktopMetrics.sidebarWidth}px`,
            } as React.CSSProperties}
            aria-hidden={desktopSidebarCollapsed ? "true" : undefined}
            inert={desktopSidebarCollapsed ? true : undefined}
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
          <div
            className="desktop-map-workspace"
            style={{ "--commute-preview-left-inset": `${desktopSidebarCollapsed ? 0 : desktopMetrics.sidebarWidth}px` } as React.CSSProperties}
          >
            <main
              ref={networkMapSurfaceRef}
              className={`network-map-transition-surface absolute inset-0 z-auto md:z-10 ${showClosedScreen ? "subway-closed-map-backdrop" : ""}`}
            >
              <NetworkMap
                network={selectedNetwork}
                preparingNetwork={preparingNetwork}
                diagramData={{ ttc: ttcData, regional: regionalData }}
                diagramStations={stationCatalogs}
                warmingNetwork={warmingNetwork}
                onPreparedMapReady={() => preparedMapReadyRef.current?.resolve()}
                geographicFadeRef={geographicFadeRef}
                isMapActive={!showClosedScreen}
                animateInitialEntrance={false}
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
                onNetworkChange={handleNetworkChange}
                mapView={mapViewPreference}
                onMapViewChange={setMapViewPreference}
                selectionAttentionGeneration={selectionAttentionGeneration}
                selectionIntroKey={selectionIntroKey}
              />
            </main>
            {/* Desktop Collapsed Map Notice (Bottom Center) */}
            {desktopSidebarCollapsed && desktopNotice ? (
              <div className="desktop-collapsed-map-notice-anchor">
                {<DesktopNoticeBanner notice={desktopNotice} />}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <main
          ref={networkMapSurfaceRef}
          className={`network-map-transition-surface absolute inset-0 z-auto md:z-10 ${showClosedScreen ? "subway-closed-map-backdrop" : ""}`}
        >
          <NetworkMap
            network={selectedNetwork}
            preparingNetwork={preparingNetwork}
            diagramData={{ ttc: ttcData, regional: regionalData }}
            diagramStations={stationCatalogs}
            warmingNetwork={warmingNetwork}
            onPreparedMapReady={() => preparedMapReadyRef.current?.resolve()}
            geographicFadeRef={geographicFadeRef}
            isMapActive={activeView === "map" && !isClosingSearch}
            animateInitialEntrance={false}
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
            mapView={mapViewPreference}
            onMapViewChange={setMapViewPreference}
            selectionAttentionGeneration={selectionAttentionGeneration}
            selectionIntroKey={selectionIntroKey}
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
                  onRecenter={() => sendMapCameraCommand(setRecenterSignal)}
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
        <div className="mobile-train-left-cluster md:hidden" data-map-chooser-keepout>
          <button
            type="button"
            onClick={handleToggleEstimatedTrains}
            disabled={estimatedTrainControlUnavailableReason !== null}
            className={`mobile-train-toggle ${
              selectedNetwork === "regional" ? "mobile-train-toggle--regional" : ""
            } ${estimatedTrainsEnabled ? "active" : ""} ${
              estimatedTrainDisplayPending ? "mobile-train-toggle--loading" : ""
            } ${estimatedTrainControlUnavailableReason ? "opacity-40 cursor-not-allowed" : ""}`}
            aria-pressed={estimatedTrainsEnabled}
            aria-busy={estimatedTrainDisplayPending}
            aria-label={estimatedTrainControlUnavailableReason
              ?? `Toggle estimated train markers (${estimatedTrainStatusLabel})`}
            title={estimatedTrainControlUnavailableReason ?? undefined}
          >
            <Train size={16} />
            <span>
              {estimatedTrainsEnabled ? "Viewing" : "View"}<br />Trains
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
          {showMobileStatusPeek && (
            <MapViewSelector
              view={mapViewPreference}
              onChange={setMapViewPreference}
              compactVertical
              className="mobile-map-view-toggle"
            />
          )}
        </div>
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
          onRequestSignIn={() => openAuthChoice("register")}
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
          reducedMotion={reducedMotion}
          onClose={() => closeSelectedStation(selectedStationId)}
          onSelectImpact={handleStationSelectImpact}
          authenticated={accountState.authenticated || accountState.source === "unavailable"}
          saved={savedStationIds.has(selectedStationId)}
          savePending={pendingSavedStationIds.has(selectedStationId)}
          onToggleSaved={handleToggleSavedStation}
          onRequestSignIn={() => openAuthChoice("register")}
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
              onCategory={(view, lineId) => openImpactCategory(view, lineId)}
              onNotices={openServiceNotices}
            />}
          <DesktopImpactChips
            selectedNetwork={selectedNetwork}
            suspensionCount={activeAlerts.length}
            delayCount={delays.length}
            plannedAdvisoryCount={plannedClosures.length}
            reducedSpeedZoneCount={reducedSpeedZoneCount}
            regionalTripChangeCount={regionalTripChangeCount}
            openImpactCategory={openImpactCategory}
            openRegionalTripChanges={openRegionalTripChanges}
          />
        </aside>

      </>
      )}

      {!showClosedScreen && mobileImpactInspectorOpen && selection ? (
        <MobileImpactInspector
          selection={selection}
          detent={mobileInspectorDetent}
          onChangeDetent={setMobileInspectorDetent}
          onUnfocus={handleClearMobileImpactSelection}
          onBack={impactBackContext ? handleSubmenuBack : undefined}
          backLabel={impactBackContext?.origin.selection ? "Back to previous impact" : impactBackContext?.origin.activeView === "map" ? "Back to map" : "Back"}
          unfocusLabel={mobileImpactReturnView === "my-stations" ? "Back to My Stations" : undefined}
          onViewFullDetails={() => navigateForward(viewForImpactSelection(selection))}
          onSelectImpact={handleRelatedImpact}
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
          syncing={syncing}
          isConnectionIssue={isConnectionIssue}
          snapshot={displayData.snapshot}
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
          onRecenter={() => sendMapCameraCommand(setRecenterSignal)}
          onZoomIn={() => sendMapCameraCommand(setZoomInSignal)}
          onZoomOut={() => sendMapCameraCommand(setZoomOutSignal)}
        >
          {isMobile && <CurrentServicePanel
              data={displayData}
              notices={!displayData.snapshot && currentServiceNotices?.networkId === selectedNetwork ? currentServiceNotices.data : null}
              onNotice={handleSearchOpenSurfaceNotice}
              onImpact={handleMapSelectImpact}
              onStatus={() => navigateForward("status")}
              onCategory={(view, lineId) => openImpactCategory(view, lineId)}
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
      <AccountDialog
        isOpen={Boolean(accountDialogRequest)}
        request={accountDialogRequest}
        accountState={accountState}
        authConfig={authConfig}
        reducedMotion={reducedMotion}
        onClose={closeAccountDialog}
        onAuthenticated={handleAuthenticated}
      />
      {isMobile && (!showClosedScreen || displayData.snapshot) && dashboardAvailabilityNotice ? (
        <div
          className={`dashboard-availability-notice ${isMobile && (!displayData.snapshot || showMobileStatusPeek && !showClosedScreen) ? "dashboard-availability-notice--mobile-hidden" : ""}`}
          data-state={dashboardRequestState === "reconnecting" ? "reconnecting" : displayData.availability}
          role="status"
          aria-live="polite"
        >
          {displayData.snapshot?.reason === "refreshing" ? (
            <Loader2 className="dashboard-availability-notice-spinner animate-spin" size={13} aria-hidden="true" />
          ) : (
            <AlertTriangle className="dashboard-availability-notice-icon" aria-hidden="true" />
          )}
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
      </NetworkSwitchContext.Provider>
      </DecorativeMotionPausedContext.Provider>
    </DataProvider>
  );
}

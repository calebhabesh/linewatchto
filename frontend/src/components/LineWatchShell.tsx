"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { KeyboardEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { DynamicBackground } from "./DynamicBackground";
import { InteractiveTtcMap } from "./InteractiveTtcMap";
import type { MapOverlapSelection } from "./map-overlap-badges";
import { DelayIcon } from "./DelayIcon";
import { ActiveAlertsPanel } from "./ActiveAlertsPanel";
import { DelaysPanel } from "./DelaysPanel";
import { ReducedSpeedZonesPanel } from "./ReducedSpeedZonesPanel";
import { PlannedClosuresPanel } from "./PlannedClosuresPanel";
import { SavedCommutesPanel } from "./SavedCommutesPanel";
import { NotificationSettingsPanel } from "./NotificationSettingsPanel";
import { ReliabilityPanel } from "./ReliabilityPanel";
import { FloatingPanelShell } from "./FloatingPanelShell";
import { MobileBottomNav, type MobileNavKey } from "./MobileBottomNav";
import { MobileStatusPeek } from "./MobileStatusPeek";
import { MobileMapControls, PhoneRotateLandscapeIcon, type MapPresentationMode } from "./MobileMapControls";
import { RotatedMapSelectionCard } from "./RotatedMapSelectionCard";
import { MobileImpactInspector, type MobileInspectorDetent } from "./MobileImpactInspector";
import { MobileStatusSheet } from "./MobileStatusSheet";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { LineLegend } from "./LineLegend";
import { MobileLegend } from "./MobileLegend";
import { LogsDropdown } from "./LogsDropdown";
import { SiteGuideDropdown } from "./SiteGuideDropdown";
import { DataProvider, DashboardData } from "../app/DataContext";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
import {
  type AccessibilityOutageResponse,
  getAccessibilityOutages,
} from "../app/accessibility-outage-data";
import { AccessibilityOutagesPanel } from "./AccessibilityOutagesPanel";
import { getSurfaceNotices } from "../app/surface-notice-data";
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
import { useTorontoClock } from "../hooks/useTorontoClock";
import { useMobilePerformanceMode } from "../hooks/useMobilePerformanceMode";
import { usePushNotificationSettings } from "../hooks/usePushNotificationSettings";
import { Menu, X, Map as MapIcon, AlertTriangle, Calendar, Navigation, ShieldCheck, BarChart3, Bell, Construction, Search, LogIn, LogOut, UserPlus, UserRound, Sun, Moon, Bus } from "lucide-react";
import { SubwayClosedScreen } from "./SubwayClosedScreen";
import { useSubwayOperatingState } from "../hooks/useSubwayOperatingState";
import { StationSearchPanel } from "./StationSearchPanel";
import { OpeningDisclaimer } from "./OpeningDisclaimer";
import { SubwayClosingSoonChip } from "./SubwayClosingSoonChip";
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
  type AuthConfig,
} from "../app/account-data";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { normalizeAccountEmail, validateAccountCredentials } from "../app/account-validation";


type ActiveView = "map" | "menu" | "search" | "status" | "alerts" | "delays" | "reduced-speed-zones" | "closures" | "commutes" | "notifications" | "analytics" | "more" | "accessibility-outages" | "surface-notices";
type AccountDialogMode = "login" | "register" | "forgot-password" | "reset-password" | "link-google";

const DEFAULT_DASHBOARD_REFRESH_MS = 5_000;
const MIN_DASHBOARD_REFRESH_MS = 2_000;

function dashboardRefreshIntervalMs() {
  const configured = Number(process.env.NEXT_PUBLIC_LINEWATCH_DASHBOARD_REFRESH_MS);

  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_DASHBOARD_REFRESH_MS;
  }

  return Math.max(configured, MIN_DASHBOARD_REFRESH_MS);
}

export function LineWatchShell({
  initialData,
  initialPasswordResetToken = "",
}: {
  initialData: DashboardData;
  initialPasswordResetToken?: string;
}) {
  const router = useRouter();
  const [displayData, setDisplayData] = useState(initialData);

  useEffect(() => {
    if (initialData.dataSource === "backend") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayData(initialData);
      return;
    }

    setDisplayData((previous) => {
      if (previous.dataSource === "backend") {
        return previous;
      }
      return initialData;
    });
  }, [initialData]);

  const {
    generatedAt,
    activeAlerts,
    delays,
    reducedSpeedZones,
    lineStatuses,
    ingestionHealth,
    plannedClosures,
  } = displayData;
  const pollText = generatedAt.lastPoll.replace(/succeeded\s*/i, "");
  const [isDark, setIsDark] = useState(true);
  const [highContrast, setHighContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const mobilePerformanceMode = useMobilePerformanceMode();
  const [activeView, setActiveView] = useState<ActiveView>("map");
  const [previousView, setPreviousView] = useState<ActiveView>("status");
  const [isMobile, setIsMobile] = useState(false);
  const lastActiveViewRef = useRef<ActiveView>("map");
  const [mobileInspectorDetent, setMobileInspectorDetent] = useState<MobileInspectorDetent>("map-focus");
  const [mapLayoutSignal, setMapLayoutSignal] = useState(0);
  const [mapPresentationMode, setMapPresentationMode] = useState<MapPresentationMode>("standard");

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
      document.documentElement.style.setProperty("--visual-viewport-height", `${height}px`);
    };

    updateViewportHeight();

    if (visualViewport) {
      visualViewport.addEventListener("resize", updateViewportHeight);
      visualViewport.addEventListener("scroll", updateViewportHeight);
      return () => {
        visualViewport.removeEventListener("resize", updateViewportHeight);
        visualViewport.removeEventListener("scroll", updateViewportHeight);
      };
    } else {
      window.addEventListener("resize", updateViewportHeight);
      return () => {
        window.removeEventListener("resize", updateViewportHeight);
      };
    }
  }, []);

  useEffect(() => {
    const prev = lastActiveViewRef.current;
    if (prev !== activeView) {
      const isSubmenu = (view: ActiveView) =>
        view === "alerts" || view === "delays" || view === "reduced-speed-zones" || view === "closures";
      
      if (isSubmenu(activeView) && !isSubmenu(prev)) {
        setPreviousView(prev);
      }
      lastActiveViewRef.current = activeView;
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

  const subwayOperatingState = useSubwayOperatingState();
  const [closedMapPeek, setClosedMapPeek] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  if (subwayOperatingState.status === "open" && closedMapPeek) {
    setClosedMapPeek(false);
  }

  const showClosedScreen = subwayOperatingState.status === "closed" && !closedMapPeek;


  // Interactive linking state
  const [selection, setSelection] = useState<ImpactSelection>(null);
  const [overlapSelection, setOverlapSelection] = useState<MapOverlapSelection | null>(null);
  const [stationSummaries, setStationSummaries] = useState<StationSummary[]>(fallbackStationSummaries.stations);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [visibleStationResult, setVisibleStationResult] = useState<StationDataResult<StationDetail | null> | null>(null);
  const [stationLoading, setStationLoading] = useState(false);
  const [accessibilityOutageResult, setAccessibilityOutageResult] = useState<AccessibilityOutageResponse | null>(null);
  const [surfaceNoticeCount, setSurfaceNoticeCount] = useState<number | null>(null);

  const handleSubmenuBack = useCallback(() => {
    setActiveView(() => {
      if (isMobile) {
        return previousView || "status";
      }
      return "menu";
    });
    setSelection(null);
    setOverlapSelection(null);
  }, [isMobile, previousView, setActiveView, setSelection]);

  const [accountState, setAccountState] = useState<AccountState>({
    source: "unavailable",
    authenticated: false,
    user: null,
  });
  const [accountDialogMode, setAccountDialogMode] = useState<AccountDialogMode | null>(initialPasswordResetToken.trim() ? "reset-password" : null);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirmation, setAccountPasswordConfirmation] = useState("");
  const [accountResetToken, setAccountResetToken] = useState(initialPasswordResetToken.trim());
  const [accountResetMessage, setAccountResetMessage] = useState<string | null>(null);
  const [accountDevResetToken, setAccountDevResetToken] = useState<string | null>(null);
  const [accountDisplayName, setAccountDisplayName] = useState("");
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountCommutes, setAccountCommutes] = useState<AccountSavedCommute[]>([]);
  const [commutePathPreview, setCommutePathPreview] = useState<AccountCommutePathPreview | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig>(unavailableAuthConfig);

  const pushSettings = usePushNotificationSettings(accountState);

  const notificationStatusLabel = useMemo(() => {
    if (!accountState.authenticated || pushSettings.browserStatus === "signed-out" || pushSettings.browserStatus === "unsupported" || pushSettings.browserStatus === "not-configured" || pushSettings.browserStatus === "checking") {
      return "Unavailable";
    }
    const currentEnabled = pushSettings.preferences.savedCommutes.currentDisruptions;
    const plannedEnabled = pushSettings.preferences.savedCommutes.plannedClosureReminders;
    if (!currentEnabled && !plannedEnabled) {
      return "Off";
    }
    if (pushSettings.subscribed) {
      return "On";
    }
    return "Device Off";
  }, [accountState.authenticated, pushSettings.browserStatus, pushSettings.subscribed, pushSettings.preferences]);

  const notificationSummary = useMemo(() => {
    const tone: "on" | "off" | "unavailable" =
      notificationStatusLabel === "On" ? "on" :
      notificationStatusLabel === "Device Off" || notificationStatusLabel === "Off" ? "off" :
      "unavailable";
    return {
      label: notificationStatusLabel,
      detail: "Saved commute alerts and closure reminders",
      tone,
    };
  }, [notificationStatusLabel]);

  const { clear: commuteClearCount, affectedNow: commuteAffectedCount } = useMemo(
    () => summarizeSavedCommuteStatuses(accountCommutes),
    [accountCommutes]
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
    // supports panel=notifications, panel=commutes, panel=alerts, panel=delays, panel=reduced-speed-zones, panel=closures
    const params = new URLSearchParams(window.location.search);
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
    if (panel && panelToView[panel]) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveView(panelToView[panel]);
      window.history.replaceState(null, "", window.location.pathname);
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

  const resetAccountForm = () => {
    setAccountEmail("");
    setAccountPassword("");
    setAccountPasswordConfirmation("");
    setAccountDisplayName("");
    setAccountResetToken("");
    setAccountResetMessage(null);
    setAccountDevResetToken(null);
    setAccountError(null);
  };

  const accountDialogTitle = () => {
    switch (accountDialogMode) {
      case "link-google":
        return "Link Google";
      case "register":
        return "Create account";
      case "forgot-password":
        return "Reset password";
      case "reset-password":
        return "Choose new password";
      case "login":
      default:
        return "Sign in";
    }
  };

  const accountDialogAriaLabel = () => {
    switch (accountDialogMode) {
      case "link-google":
        return "Link Google sign-in to LineWatch TO account";
      case "register":
        return "Create LineWatch TO account";
      case "forgot-password":
        return "Reset LineWatch TO password";
      case "reset-password":
        return "Choose a new LineWatch TO password";
      case "login":
      default:
        return "Sign in to LineWatch TO";
    }
  };

  const handleSubmitAccount = async () => {
    if (!accountDialogMode) return;

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

  const handleLinkGoogleCredential = async (credential: string) => {
    setAccountBusy(true);
    setAccountError(null);
    try {
      const response = await linkGoogleAccount({ credential });
      setAccountState({ source: "backend", authenticated: response.authenticated, user: response.user });
      setAccountDialogMode(null);
      resetAccountForm();
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
      await logoutAccount();
      setAccountState({ source: "backend", authenticated: false, user: null });
      setAccountCommutes([]);
      setCommutePathPreview(null);
    } finally {
      setAccountBusy(false);
    }
  };

  const handleViewCommutePath = (commute: AccountSavedCommute, legId: AccountCommuteLegId = "outbound") => {
    const preview = commutePathPreviewFromCommute(commute, legId);
    if (!preview) return;

    setCommutePathPreview(preview);
    setSelection(null);
    setSelectedStationId(null);
    setActiveView("map");
  };

  const handleClearCommutePathPreview = useCallback((commuteIdOrEvent?: string | unknown) => {
    const commuteId = typeof commuteIdOrEvent === "string" ? commuteIdOrEvent : undefined;
    setCommutePathPreview((current) => {
      if (!current) return null;
      if (commuteId && current.id !== commuteId && current.commuteId !== commuteId) {
        return current;
      }
      window.setTimeout(() => {
        setActiveView((view) => (view === "map" ? "commutes" : view));
      }, 0);
      return null;
    });
  }, [setCommutePathPreview, setActiveView]);

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
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
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    Promise.resolve().then(() => setReducedMotion(mediaQuery.matches));
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const fetchAccessibilityOutages = useCallback(async () => {
    try {
      const res = await getAccessibilityOutages();
      setAccessibilityOutageResult(res.data);
    } catch (err) {
      console.error("Failed to fetch accessibility outages:", err);
    }
  }, []);

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
    if (subwayOperatingState.status === "closed" && !closedMapPeek) {
      return;
    }

    const refreshDashboardData = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      router.refresh();
      fetchAccessibilityOutages();
      fetchSurfaceNoticesCount();
    };

    const interval = window.setInterval(refreshDashboardData, dashboardRefreshIntervalMs());
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        fetchAccessibilityOutages();
        fetchSurfaceNoticesCount();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [closedMapPeek, router, subwayOperatingState.status, fetchAccessibilityOutages, fetchSurfaceNoticesCount]);


  useEffect(() => {
    let cancelled = false;

    getStationSummaries().then((result) => {
      if (!cancelled) {
        setStationSummaries(result.data.stations);
      }
    });

    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAccessibilityOutages();
    fetchSurfaceNoticesCount();

    return () => {
      cancelled = true;
    };
  }, [fetchAccessibilityOutages, fetchSurfaceNoticesCount]);

  useEffect(() => {
    let cancelled = false;

    if (!selectedStationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisibleStationResult(null);
      setStationLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setStationLoading(true);
    getStationDetail(selectedStationId).then((result) => {
      if (!cancelled) {
        setVisibleStationResult(result);
        setStationLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedStationId]);

  const handleToggleMenu = () => {
    setActiveView(prev => {
      if (prev !== "menu" && prev !== "map") {
        setSelection(null);
        setOverlapSelection(null);
        setSelectedStationId(null);
      }
      return prev === "menu" ? "map" : "menu";
    });
  };

  const handleToggleSearch = () => {
    setActiveView((prev) => {
      if (prev !== "search" && prev !== "map") {
        setSelection(null);
        setOverlapSelection(null);
        setSelectedStationId(null);
      }

      return prev === "search" ? "map" : "search";
    });
  };

  const handleSelectStationId = useCallback((id: string | null) => {
    setSelectedStationId(id);
    setSelection(null);
    setOverlapSelection(null);
    setCommutePathPreview(null);
    if (id) {
      if (isMobile) {
        setMobileInspectorDetent("details-focus");
      }
      setActiveView("map");
    }
  }, [setSelectedStationId, setSelection, setCommutePathPreview, setActiveView, isMobile]);

  const mobileNavKey = useMemo<MobileNavKey>(() => {
    if (activeView === "status" || activeView === "alerts" || activeView === "delays" || activeView === "reduced-speed-zones" || activeView === "closures") {
      return "status";
    }
    if (activeView === "search") return "search";
    if (activeView === "commutes") return "commutes";
    if (activeView === "notifications" || activeView === "more" || activeView === "analytics") return "more";
    return "map";
  }, [activeView]);

  const onMobileNavSelect = useCallback((key: MobileNavKey) => {
    setSelection(null);
    setOverlapSelection(null);
    setSelectedStationId(null);
    setCommutePathPreview(null);
    setMobileInspectorDetent("map-focus");
    setMapPresentationMode("standard");
    switch (key) {
      case "status":
        setActiveView("status");
        return;
      case "search":
        setActiveView("search");
        return;
      case "commutes":
        setActiveView("commutes");
        return;
      case "more":
        setActiveView("more");
        return;
      case "map":
      default:
        setActiveView("map");
    }
  }, [setActiveView, setCommutePathPreview, setSelectedStationId, setSelection]);

  const handleMobileSheetClose = useCallback(() => {
    setActiveView("map");
    setSelection(null);
    setOverlapSelection(null);
    setMapPresentationMode("standard");
    setMobileInspectorDetent("map-focus");
  }, [setActiveView, setSelection]);

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

  const handleMapSelectImpact = useCallback((nextSelection: ImpactSelection) => {
    setSelectedStationId(null);
    setCommutePathPreview(null);
    setOverlapSelection(null);
    if (!nextSelection) {
      setSelection(null);
      return;
    }
    setSelection(nextSelection);
    if (isMobile) {
      setMobileInspectorDetent("map-focus");
      setActiveView("map");
      return;
    }
    setActiveView(viewForImpactSelection(nextSelection));
  }, [setSelectedStationId, setCommutePathPreview, setSelection, setActiveView, viewForImpactSelection, isMobile]);

  const handleMapSelectOverlap = useCallback((nextOverlap: MapOverlapSelection) => {
    setSelectedStationId(null);
    setSelection(null);
    setCommutePathPreview(null);
    setOverlapSelection(nextOverlap);
    setMobileInspectorDetent("map-focus");
    setActiveView("map");
  }, [setActiveView, setCommutePathPreview, setMobileInspectorDetent, setSelectedStationId, setSelection]);

  const handleRotatedOverlapImpactSelect = useCallback((nextSelection: ImpactSelection) => {
    setOverlapSelection(null);
    handleMapSelectImpact(nextSelection);
  }, [handleMapSelectImpact]);

  const handlePeekClosedMap = () => {
    setClosedMapPeek(true);
    setActiveView("map");
    setSelection(null);
    setOverlapSelection(null);
    setSelectedStationId(null);
    setMapPresentationMode("standard");
    router.refresh();
  };


  const handleToggleTheme = useCallback(() => {
    setIsDark((current) => !current);
  }, [setIsDark]);

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
    setOverlapSelection(null);
    setSelectedStationId(null);
    setMobileInspectorDetent("map-focus");
  }, [setMobileInspectorDetent, setSelectedStationId, setSelection]);

  const isMobilePanel = isMobile && (
    activeView === "status" ||
    activeView === "alerts" ||
    activeView === "delays" ||
    activeView === "reduced-speed-zones" ||
    activeView === "closures" ||
    activeView === "commutes" ||
    activeView === "notifications" ||
    activeView === "more" ||
    activeView === "analytics" ||
    activeView === "accessibility-outages" ||
    activeView === "surface-notices"
  );

  const getMobileSheetLabel = () => {
    switch (activeView) {
      case "status": return "Current service status";
      case "alerts": return "Active alerts";
      case "delays": return "Delays";
      case "reduced-speed-zones": return "Reduced Speed Zones";
      case "closures": return "Upcoming closures";
      case "commutes": return "Saved commutes";
      case "notifications": return "Notifications";
      case "more": return "More options";
      case "analytics": return "Reliability analytics";
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
            onOpenCategory={(view) => {
              setSelection(null);
              setActiveView(view);
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
            selection={selection}
            onSelectImpact={handleMapSelectImpact}
            onBack={handleSubmenuBack}
            onClose={() => { setActiveView("map"); setSelection(null); }}
            onFocusMap={() => { if (isMobile) setActiveView("map"); }}
          />
        );
      case "delays":
        return (
          <DelaysPanel
            selection={selection}
            onSelectImpact={handleMapSelectImpact}
            onBack={handleSubmenuBack}
            onClose={() => { setActiveView("map"); setSelection(null); }}
            onFocusMap={() => { if (isMobile) setActiveView("map"); }}
          />
        );
      case "reduced-speed-zones":
        return (
          <ReducedSpeedZonesPanel
            selection={selection}
            onSelectImpact={handleMapSelectImpact}
            onBack={handleSubmenuBack}
            onClose={() => { setActiveView("map"); setSelection(null); }}
            onFocusMap={() => { if (isMobile) setActiveView("map"); }}
          />
        );
      case "closures":
        return (
          <PlannedClosuresPanel
            selection={selection}
            onSelectImpact={handleMapSelectImpact}
            onBack={handleSubmenuBack}
            onClose={() => { setActiveView("map"); setSelection(null); }}
            onFocusMap={() => { if (isMobile) setActiveView("map"); }}
          />
        );
      case "commutes":
        return (
          <SavedCommutesPanel
            accountState={accountState}
            accountCommutes={accountCommutes}
            setAccountCommutes={setAccountCommutes}
            stationSummaries={stationSummaries}
            viewedCommuteId={commutePathPreview?.id ?? null}
            onViewPath={handleViewCommutePath}
            onClearViewedPath={handleClearCommutePathPreview}
            onBack={() => setActiveView("menu")}
            onClose={() => { setActiveView("map"); setSelection(null); }}
            onRequestSignIn={() => setAccountDialogMode("login")}
            onRequestCreateAccount={() => setAccountDialogMode("register")}
            onOpenNotificationSettings={() => setActiveView("notifications")}
            notificationSummary={notificationSummary}
          />
        );
      case "notifications":
        return (
          <NotificationSettingsPanel
            accountState={accountState}
            pushSettings={pushSettings}
            onBack={() => setActiveView(isMobile ? "more" : "menu")}
            onClose={() => { setActiveView("map"); setSelection(null); }}
            onRequestSignIn={() => { resetAccountForm(); setAccountDialogMode("login"); }}
            onRequestCreateAccount={() => { resetAccountForm(); setAccountDialogMode("register"); }}
          />
        );
      case "accessibility-outages":
        return (
          <AccessibilityOutagesPanel
            accessibilityOutageResult={accessibilityOutageResult}
            onSelectStation={(stationId) => {
              setSelectedStationId(stationId);
              setMobileInspectorDetent("details-focus");
              if (isMobile) {
                setActiveView("map");
              }
            }}
            onBack={() => {
              setActiveView(isMobile ? "status" : "menu");
            }}
            onClose={() => {
              setActiveView("map");
              setSelection(null);
            }}
          />
        );
      case "surface-notices":
        return (
          <SurfaceNoticesPanel
            onBack={() => {
              setActiveView(isMobile ? "status" : "menu");
            }}
            onClose={() => {
              setActiveView("map");
              setSelection(null);
            }}
          />
        );
      case "more":
        return (
          <MobileMoreSheet
            accountState={accountState}
            accountBusy={accountBusy}
            highContrast={highContrast}
            reducedMotion={reducedMotion}
            ingestionHealth={ingestionHealth}
            onClose={handleMobileSheetClose}
            onRequestSignIn={() => { resetAccountForm(); setAccountDialogMode("login"); }}
            onRequestCreateAccount={() => { resetAccountForm(); setAccountDialogMode("register"); }}
            onDemoAccount={handleDemoAccount}
            onSignOut={handleSignOut}
            onToggleHighContrast={() => setHighContrast((current) => !current)}
            onToggleReducedMotion={() => setReducedMotion((current) => !current)}
            onOpenNotifications={() => setActiveView("notifications")}
            onOpenAnalytics={() => setActiveView("analytics")}
            notificationStatusLabel={notificationStatusLabel}
          />
        );
      case "analytics":
        return (
          <ReliabilityPanel
            onBack={() => setActiveView("menu")}
            onClose={() => { setActiveView("map"); setSelection(null); }}
          />
        );
      default:
        return null;
    }
  };

  const activeFloatingPanel = !showClosedScreen ? (
    isMobilePanel ? (
      <FloatingPanelShell panel="mobile-panel" mobileSheetLabel={getMobileSheetLabel()}>
        <div key={activeView} className="mobile-view-content-wrapper">
          {renderPanelContent()}
        </div>
      </FloatingPanelShell>
    ) : activeView === "status" ? (
      <FloatingPanelShell panel="status" mobileSheetLabel="Current service status">
        <MobileStatusSheet
          pollText={pollText}
          dataSource={displayData.dataSource}
          onOpenCategory={(view) => {
            setSelection(null);
            setActiveView(view);
          }}
          onClose={handleMobileSheetClose}
          accessibilityOutageCount={
            accessibilityOutageResult?.assetTypes.reduce((acc, curr) => acc + curr.count, 0) ?? 0
          }
          surfaceNoticeCount={surfaceNoticeCount ?? 0}
        />
      </FloatingPanelShell>
    ) : activeView === "alerts" ? (
      <FloatingPanelShell panel="alerts" mobileSheetLabel="Active alerts">
        <ActiveAlertsPanel
          selection={selection}
          onSelectImpact={handleMapSelectImpact}
          onBack={handleSubmenuBack}
          onClose={() => { setActiveView("map"); setSelection(null); }}
          onFocusMap={() => { if (isMobile) setActiveView("map"); }}
        />
      </FloatingPanelShell>
    ) : activeView === "delays" ? (
      <FloatingPanelShell panel="delays" mobileSheetLabel="Delays">
        <DelaysPanel
          selection={selection}
          onSelectImpact={handleMapSelectImpact}
          onBack={handleSubmenuBack}
          onClose={() => { setActiveView("map"); setSelection(null); }}
          onFocusMap={() => { if (isMobile) setActiveView("map"); }}
        />
      </FloatingPanelShell>
    ) : activeView === "reduced-speed-zones" ? (
      <FloatingPanelShell panel="reduced-speed-zones" mobileSheetLabel="Reduced Speed Zones">
        <ReducedSpeedZonesPanel
          selection={selection}
          onSelectImpact={handleMapSelectImpact}
          onBack={handleSubmenuBack}
          onClose={() => { setActiveView("map"); setSelection(null); }}
          onFocusMap={() => { if (isMobile) setActiveView("map"); }}
        />
      </FloatingPanelShell>
    ) : activeView === "closures" ? (
      <FloatingPanelShell panel="closures" mobileSheetLabel="Upcoming closures">
        <PlannedClosuresPanel
          selection={selection}
          onSelectImpact={handleMapSelectImpact}
          onBack={handleSubmenuBack}
          onClose={() => { setActiveView("map"); setSelection(null); }}
          onFocusMap={() => { if (isMobile) setActiveView("map"); }}
        />
      </FloatingPanelShell>
    ) : activeView === "commutes" ? (
      <FloatingPanelShell panel="commutes" mobileSheetLabel="Saved commutes">
        <SavedCommutesPanel
          accountState={accountState}
          accountCommutes={accountCommutes}
          setAccountCommutes={setAccountCommutes}
          stationSummaries={stationSummaries}
          viewedCommuteId={commutePathPreview?.id ?? null}
          onViewPath={handleViewCommutePath}
          onClearViewedPath={handleClearCommutePathPreview}
          onBack={() => setActiveView("menu")}
          onClose={() => { setActiveView("map"); setSelection(null); }}
          onRequestSignIn={() => setAccountDialogMode("login")}
          onRequestCreateAccount={() => setAccountDialogMode("register")}
          onOpenNotificationSettings={() => setActiveView("notifications")}
          notificationSummary={notificationSummary}
        />
      </FloatingPanelShell>
    ) : activeView === "notifications" ? (
      <FloatingPanelShell panel="notifications" mobileSheetLabel="Notifications">
        <NotificationSettingsPanel
          accountState={accountState}
          pushSettings={pushSettings}
          onBack={() => setActiveView("menu")}
          onClose={() => { setActiveView("map"); setSelection(null); }}
          onRequestSignIn={() => { resetAccountForm(); setAccountDialogMode("login"); }}
          onRequestCreateAccount={() => { resetAccountForm(); setAccountDialogMode("register"); }}
        />
      </FloatingPanelShell>
    ) : activeView === "accessibility-outages" ? (
      <FloatingPanelShell panel="accessibility-outages" mobileSheetLabel="Accessibility outages">
        <AccessibilityOutagesPanel
          accessibilityOutageResult={accessibilityOutageResult}
          onSelectStation={(stationId) => {
            setSelectedStationId(stationId);
            setMobileInspectorDetent("details-focus");
          }}
          onBack={() => setActiveView("menu")}
          onClose={() => {
            setActiveView("map");
            setSelection(null);
          }}
        />
      </FloatingPanelShell>
    ) : activeView === "surface-notices" ? (
      <FloatingPanelShell panel="surface-notices" mobileSheetLabel="Streetcar & Bus Notices">
        <SurfaceNoticesPanel
          onBack={() => setActiveView("menu")}
          onClose={() => {
            setActiveView("map");
            setSelection(null);
          }}
        />
      </FloatingPanelShell>
    ) : activeView === "more" ? (
      <FloatingPanelShell panel="more" mobileSheetLabel="More options">
        <MobileMoreSheet
          accountState={accountState}
          accountBusy={accountBusy}
          highContrast={highContrast}
          reducedMotion={reducedMotion}
          ingestionHealth={ingestionHealth}
          onClose={handleMobileSheetClose}
          onRequestSignIn={() => { resetAccountForm(); setAccountDialogMode("login"); }}
          onRequestCreateAccount={() => { resetAccountForm(); setAccountDialogMode("register"); }}
          onDemoAccount={handleDemoAccount}
          onSignOut={handleSignOut}
          onToggleHighContrast={() => setHighContrast((current) => !current)}
          onToggleReducedMotion={() => setReducedMotion((current) => !current)}
          onOpenNotifications={() => setActiveView("notifications")}
          onOpenAnalytics={() => setActiveView("analytics")}
          notificationStatusLabel={notificationStatusLabel}
        />
      </FloatingPanelShell>
    ) : activeView === "analytics" ? (
      <FloatingPanelShell panel="analytics" mobileSheetLabel="Reliability analytics">
        <ReliabilityPanel
          onBack={() => setActiveView("menu")}
          onClose={() => { setActiveView("map"); setSelection(null); }}
        />
      </FloatingPanelShell>
    ) : null
  ) : null;

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
    !commutePathPreview &&
    !showClosedScreen;

  const mobileStationInspectorOpen =
    isMobile &&
    mapPresentationMode === "standard" &&
    activeView === "map" &&
    Boolean(selectedStationId) &&
    !accountDialogMode &&
    !showClosedScreen;

  const mobileInspectorOpen = mobileImpactInspectorOpen || mobileStationInspectorOpen;

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
        className={`linewatch-shell relative w-full overflow-hidden transition-colors duration-500 ${(isDark || highContrast) ? "dark bg-[#0d0808] text-slate-100" : "bg-slate-50 text-slate-900"} ${highContrast ? "high-contrast" : ""} ${reducedMotion ? "motion-paused" : ""} ${mobilePerformanceMode ? "mobile-performance-mode" : ""} ${shellInspectorClasses}`}
      >
      {/* Background */}
      <DynamicBackground reducedMotion={reducedMotion} isDark={isDark || highContrast} />

      {!showClosedScreen && (
      <header
        className="absolute top-0 left-0 w-full p-4 sm:p-6 flex justify-between items-start pointer-events-none transition-all duration-300"
        style={{ zIndex: guideOpen ? 42 : 40 }}
      >
        <div className="flex items-start gap-3 pointer-events-auto relative">
          {/* Menu Toggle Button */}
          <button
            ref={menuButtonRef}
            onClick={handleToggleMenu}
            className={`desktop-top-chrome panel relative flex items-center justify-center w-14 h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-100 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer`}
            aria-label={"Toggle menu"}
            aria-controls="linewatch-main-menu"
            aria-expanded={activeView === "menu"}
          >
            <div className="relative w-7 h-7 flex items-center justify-center">
               <Menu
                  className={`absolute text-slate-800 dark:text-white transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeView === "menu" ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"}`}
                  size={26}
               />
               <X
                  className={`absolute text-slate-800 dark:text-white transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeView === "menu" ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"}`}
                  size={26}
               />
            </div>
            {activeAlerts.length > 0 && activeView !== "menu" && (
              <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white shadow-md border border-white dark:border-[#12151c]">
                {activeAlerts.length}
              </span>
            )}
          </button>

          <button
            ref={searchButtonRef}
            onClick={handleToggleSearch}
            className={`desktop-top-chrome panel relative flex items-center justify-center w-14 h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-100 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer ${activeView === "search" ? "ring-2 ring-blue-500/40" : ""}`}
            aria-label="Search stations"
            aria-controls="station-search-panel"
            aria-expanded={activeView === "search"}
          >
            <Search
              className={`text-slate-800 dark:text-white transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeView === "search" ? "scale-110 text-blue-600 dark:text-blue-300" : ""}`}
              size={25}
            />
          </button>

          {subwayOperatingState.closingSoon && subwayOperatingState.minutesUntilClose !== null && subwayOperatingState.nextCloseLabel ? (
            <SubwayClosingSoonChip
              minutesUntilClose={subwayOperatingState.minutesUntilClose}
              nextCloseLabel={subwayOperatingState.nextCloseLabel}
            />
          ) : null}

          {/* Floating Dropdown Menu */}
          <div
            ref={menuPanelRef}
            id="linewatch-main-menu"
            role="menu"
            onKeyDown={handleMenuKeyDown}
            className={`desktop-top-chrome panel-strong absolute top-[72px] left-0 w-[min(calc(100vw-32px),360px)] max-h-[calc(var(--visual-viewport-height,100dvh)-96px)] overflow-y-auto stealth-scrollbar border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl flex flex-col origin-top-left transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeView === "menu" ? "opacity-100 scale-100 translate-y-0 pointer-events-auto" : "opacity-0 scale-90 -translate-y-4 pointer-events-none"}`}
            aria-hidden={activeView !== "menu"}
          >
               {/* Branding */}
                <div className="flex items-center gap-3 p-4 border-b border-black/10 dark:border-white/10 bg-white/40 dark:bg-black/20">
                  <div className="flex items-center justify-center shrink-0 w-8 h-8 rounded-lg shadow-sm border border-black/10 dark:border-white/10 bg-white dark:bg-white/10 p-1">
                     <Image src="/assets/linewatch/logo.svg" alt="LineWatch TO Logo" width={24} height={24} className="drop-shadow-sm dark:brightness-200" />
                  </div>
                  <strong className="text-slate-900 dark:text-white font-bold tracking-wide">LineWatch TO</strong>
                </div>

                <div className="account-menu-block border-b border-black/10 dark:border-white/10 p-2">
                  {accountState.authenticated && accountState.user ? (
                    <div className="flex flex-col gap-2 px-2 py-2">
                      <div className="flex items-center gap-2 min-w-0 text-sm text-slate-700 dark:text-slate-200">
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
                        className="menu-action-row"
                        disabled={accountBusy}
                      >
                        <LogOut size={17} className="text-slate-500 dark:text-slate-400" />
                        Sign Out
                      </button>
                      {authConfig.googleSignInAvailable && !accountState.user.demo ? (
                        accountState.user.googleLinked ? (
                          <div className="account-linked-status" aria-label="Google sign-in linked">
                            <ShieldCheck size={17} className="text-emerald-600 dark:text-emerald-400" />
                            Google Linked
                          </div>
                        ) : (
                          <button
                            ref={registerMenuAction(actionIndex++)}
                            role="menuitem"
                            type="button"
                            onClick={() => {
                              resetAccountForm();
                              setAccountDialogMode("link-google");
                            }}
                            className="menu-action-row"
                            disabled={accountBusy}
                          >
                            <ShieldCheck size={17} className="text-slate-500 dark:text-slate-400" />
                            Link Google
                          </button>
                        )
                      ) : null}
                      <button
                        ref={registerMenuAction(actionIndex++)}
                        role="menuitem"
                        onClick={() => setActiveView("commutes")}
                        aria-current={activeView === "commutes" ? "page" : undefined}
                        className={`menu-action-row justify-between ${activeView === "commutes" ? "bg-black/5 dark:bg-white/5" : ""}`}
                      >
                        <div className="flex items-center gap-3">
                          <Navigation size={17} className="text-slate-500 dark:text-slate-400" />
                          <span>Saved Commutes</span>
                        </div>
                        {accountCommutes.length > 0 && (
                          <div className="flex items-center gap-1.5 shrink-0" data-testid="commute-status-badges">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-600 dark:text-emerald-400" aria-label={`${commuteClearCount} clear commutes`}>
                              {commuteClearCount}
                            </span>
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-700 dark:text-amber-400" aria-label={`${commuteAffectedCount} affected commutes`}>
                              {commuteAffectedCount}
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
                        onClick={() => { resetAccountForm(); setAccountDialogMode("login"); }}
                        className="menu-action-row"
                      >
                        <LogIn size={17} className="text-slate-500 dark:text-slate-400" />
                        Sign In
                      </button>
                      <button
                        ref={registerMenuAction(actionIndex++)}
                        role="menuitem"
                        type="button"
                        onClick={() => { resetAccountForm(); setAccountDialogMode("register"); }}
                        className="menu-action-row"
                      >
                        <UserPlus size={17} className="text-slate-500 dark:text-slate-400" />
                        Create Account
                      </button>
                      <button
                        ref={registerMenuAction(actionIndex++)}
                        role="menuitem"
                        type="button"
                        onClick={handleDemoAccount}
                        className="menu-action-row"
                        disabled={accountBusy}
                      >
                        <UserRound size={17} className="text-emerald-600 dark:text-emerald-400" />
                        Demo Account
                      </button>
                      <button
                        ref={registerMenuAction(actionIndex++)}
                        role="menuitem"
                        onClick={() => setActiveView("commutes")}
                        aria-current={activeView === "commutes" ? "page" : undefined}
                        className={`menu-action-row justify-between ${activeView === "commutes" ? "bg-black/5 dark:bg-white/5" : ""}`}
                      >
                        <div className="flex items-center gap-3">
                          <Navigation size={17} className="text-slate-500 dark:text-slate-400" />
                          <span>Saved Commutes</span>
                        </div>
                        {accountCommutes.length > 0 && (
                          <div className="flex items-center gap-1.5 shrink-0" data-testid="commute-status-badges">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-600 dark:text-emerald-400" aria-label={`${commuteClearCount} clear commutes`}>
                              {commuteClearCount}
                            </span>
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-700 dark:text-amber-400" aria-label={`${commuteAffectedCount} affected commutes`}>
                              {commuteAffectedCount}
                            </span>
                          </div>
                        )}
                      </button>
                    </div>
                  )}
                  {accountError ? <p className="px-2 pb-2 text-xs font-semibold text-red-600 dark:text-red-300">{accountError}</p> : null}
                </div>

               {/* Nav Links */}
               <div className="flex flex-col p-2 border-b border-black/10 dark:border-white/10">
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
                   onClick={() => setActiveView("alerts")}
                   aria-current={activeView === "alerts" ? "page" : undefined}
                   className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                 >
                   <div className="flex items-center gap-3">
                     <AlertTriangle size={18} className="text-slate-500 dark:text-slate-400" /> Active Alerts
                   </div>
                   {activeAlerts.length > 0 && (
                     <span className="flex h-5 items-center justify-center rounded-full bg-red-500/20 px-2 text-[10px] font-bold text-red-600 dark:text-red-400">
                       {activeAlerts.length}
                     </span>
                   )}
                 </button>
                 <button
                   ref={registerMenuAction(actionIndex++)}
                   role="menuitem"
                   onClick={() => setActiveView("delays")}
                   aria-current={activeView === "delays" ? "page" : undefined}
                   className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                 >
                  <div className="flex items-center gap-3">
                     <DelayIcon size={18} className="text-slate-500 dark:text-slate-400" filled={false} /> Delays
                  </div>
                   {delays.length > 0 && (
                     <span className="flex h-5 items-center justify-center rounded-full delay-count-badge px-2 text-[10px] font-bold">
                       {delays.length}
                     </span>
                   )}
                 </button>
                 <button
                   ref={registerMenuAction(actionIndex++)}
                   role="menuitem"
                   onClick={() => setActiveView("reduced-speed-zones")}
                   aria-current={activeView === "reduced-speed-zones" ? "page" : undefined}
                   className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                 >
                    <div className="flex items-center gap-3">
                      <Construction size={18} className="text-slate-500 dark:text-slate-400" /> Reduced Speed Zones
                    </div>
                    {reducedSpeedZones.length > 0 && (
                      <span className="flex h-5 items-center justify-center rounded-full rsz-count-badge px-2 text-[10px] font-bold">
                        {reducedSpeedZones.length}
                      </span>
                    )}
                 </button>
                  <button
                    ref={registerMenuAction(actionIndex++)}
                    role="menuitem"
                    onClick={() => setActiveView("closures")}
                    aria-current={activeView === "closures" ? "page" : undefined}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar size={18} className="text-slate-500 dark:text-slate-400" /> Upcoming Closures
                    </div>
                    {plannedClosures.length > 0 && (
                      <span className="flex h-5 items-center justify-center rounded-full bg-blue-500/20 px-2 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                        {plannedClosures.length}
                      </span>
                    )}
                  </button>
                  <button
                    ref={registerMenuAction(actionIndex++)}
                    role="menuitem"
                    onClick={() => setActiveView("accessibility-outages")}
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
                      <span className="flex h-5 items-center justify-center rounded-full bg-red-500/20 px-2 text-[10px] font-bold text-red-600 dark:text-red-400">
                        {accessibilityOutageResult.assetTypes.reduce((acc, curr) => acc + curr.count, 0)}
                      </span>
                    )}
                  </button>
                  <button
                    ref={registerMenuAction(actionIndex++)}
                    role="menuitem"
                    onClick={() => setActiveView("surface-notices")}
                    aria-current={activeView === "surface-notices" ? "page" : undefined}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Bus size={18} className="text-slate-500 dark:text-slate-400" /> Streetcar & Bus Notices
                    </div>
                    {surfaceNoticeCount !== null && surfaceNoticeCount > 0 && (
                      <span className="flex h-5 items-center justify-center rounded-full bg-blue-500/20 px-2 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                        {surfaceNoticeCount}
                      </span>
                    )}
                  </button>
                 <button
                   ref={registerMenuAction(actionIndex++)}
                   role="menuitem"
                   onClick={() => setActiveView("notifications")}
                   aria-current={activeView === "notifications" ? "page" : undefined}
                   className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                 >
                   <Bell size={18} className="text-slate-500 dark:text-slate-400" /> Notifications
                 </button>
                 <button
                   ref={registerMenuAction(actionIndex++)}
                   role="menuitem"
                   onClick={() => setActiveView("analytics")}
                   aria-current={activeView === "analytics" ? "page" : undefined}
                   className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                 >
                   <BarChart3 size={18} className="text-slate-500 dark:text-slate-400" /> Reliability Analytics
                 </button>
               </div>

               {/* Toggles */}
               <div className="flex flex-col p-2 border-b border-black/10 dark:border-white/10">
                 <div className="flex items-center justify-between px-3 py-2.5">
                   <span className="text-sm font-medium text-slate-700 dark:text-slate-200">High Contrast Mode</span>
                   <button
                      ref={registerMenuAction(actionIndex++)}
                      role="menuitemcheckbox"
                      aria-checked={highContrast}
                      aria-label="Toggle high contrast mode"
                      onClick={() => setHighContrast(!highContrast)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${highContrast ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                   >
                     <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${highContrast ? 'translate-x-4' : 'translate-x-1'}`} />
                   </button>
                 </div>
                 <div className="flex items-center justify-between px-3 py-2.5">
                   <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Reduced Motion</span>
                   <button
                      ref={registerMenuAction(actionIndex++)}
                      role="menuitemcheckbox"
                      aria-checked={reducedMotion}
                      aria-label="Toggle reduced motion"
                      onClick={() => setReducedMotion(!reducedMotion)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${reducedMotion ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                   >
                     <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${reducedMotion ? 'translate-x-4' : 'translate-x-1'}`} />
                   </button>
                 </div>
               </div>

               {/* At-A-Glance Integrated Sub-panels */}
               <div className="flex flex-col p-4 gap-4">
                 <div className="flex flex-col gap-2">
                   <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">Line Status</span>
                   <div className="flex flex-col gap-2">
                      {lineStatuses.map(l => {
                        const hasAlert = activeAlerts.some(a => a.lineId === l.id);
                        const hasDelay = delays.some(delay => delay.lineId === l.id);
                        const hasRSZ = reducedSpeedZones.some(z => z.lineId === l.id);
                        const hasClosure = plannedClosures.some(c => c.lineId === l.id);
                        const isClear = !hasAlert && !hasDelay && !hasRSZ && !hasClosure;
                        
                        return (
                          <div key={l.id} className="flex items-center gap-3 px-2 py-2 rounded-lg !bg-white dark:!bg-[#12151c] border border-black/5 dark:border-white/5 shadow-sm">
                             <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shadow-sm border border-black dark:border-white/30" style={{ backgroundColor: l.color, color: l.id === "line-1" ? "#000" : "#fff" }}>
                               {l.number}
                             </span>
                             <div className="flex flex-col justify-center">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{l.name}</span>
                                  <div className="flex items-center gap-1.5 ml-1">
                                    {hasAlert && <AlertTriangle size={14} className="text-red-500 dark:text-red-400" />}
                                    {hasDelay && <DelayIcon size={14} className="delay-tone" /> /* /assets/linewatch/delay-icon.svg */}
                                    {hasRSZ && <Construction size={14} className="rsz-tone" />}
                                    {hasClosure && <Calendar size={14} className="text-blue-500 dark:text-blue-400" />}
                                  </div>
                                  {isClear && <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider ml-1">Good Service</span>}
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
                 </div>
                </div>
             </div>
          <StationSearchPanel
            open={activeView === "search"}
            stations={stationSummaries}
            selectedStationId={selectedStationId}
            onSelectStation={(id) => handleSelectStationId(id)}
            onClose={() => setActiveView("map")}
            onClosedFocusTarget={() => searchButtonRef.current?.focus()}
          />
        </div>

        {/* Floating Time Capsule (Top Center) */}
        <div className="hidden sm:flex absolute top-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto items-center">
          <div className="bg-white dark:bg-[#0a0c10] border border-black/10 dark:border-white/10 shadow-lg rounded-2xl p-1.5 flex items-center pr-4 transition-transform hover:scale-105 h-[54px]">
            <div className="flex items-center justify-center shrink-0 w-10 h-10 rounded-xl shadow-sm border border-black/10 dark:border-white/10 bg-slate-50 dark:bg-white/10 p-1 ml-0.5 mr-3">
               <Image src="/assets/linewatch/logo.svg" alt="LineWatch TO Logo" width={32} height={32} className="drop-shadow-sm dark:brightness-200" />
            </div>
            <span className="h-6 w-px bg-slate-300 dark:bg-white/10 mr-3" />
            <div className="flex items-center mr-3 min-w-[90px]">
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
            <span className="h-6 w-px bg-slate-300 dark:bg-white/10 mr-3" />
            <div className="flex items-center justify-center gap-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">
               <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse shrink-0" />
               <span className="text-[10px] font-bold whitespace-nowrap tracking-wider">
                  Last Polled: {pollText.toLowerCase() === "just now" ? "Just Now" : pollText}
               </span>
            </div>
          </div>
        </div>

        <div className="map-utility-cluster pointer-events-auto flex items-center gap-2">
          <LogsDropdown />
          <button
            onClick={handleToggleTheme}
            className="theme-toggle-btn panel flex items-center justify-center w-10 sm:w-14 h-10 sm:h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-100 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10]"
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
            className="rotate-map-btn panel flex items-center justify-center gap-1.5 px-2.5 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-100 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer bg-white dark:bg-[#0a0c10] h-10 md:hidden"
            aria-label="Rotate map"
          >
            <PhoneRotateLandscapeIcon size={20} />
            <span className="text-[9px] font-black leading-[1.1] text-left uppercase tracking-wider text-slate-800 dark:text-white">
              Rotate<br />Map
            </span>
          </button>
          <SiteGuideDropdown onOpenChange={setGuideOpen} />
        </div>
      </header>
      )}

      {/* Floating Submenus (Alerts, Delays, Closures, Commutes, Analytics) */}
      {activeFloatingPanel}

      {/* Main Viewport (TTC Map Front & Center, Borderless) */}
      <main className={`absolute inset-0 z-auto md:z-10 ${showClosedScreen ? "subway-closed-map-backdrop" : ""}`}>
        <InteractiveTtcMap
          selection={selection}
          selectedStationId={selectedStationId}
          stations={stationSummaries}
          onSelectImpact={handleMapSelectImpact}
          onSelectOverlap={rotatedMapMode ? handleMapSelectOverlap : undefined}
          onSelectStationId={handleSelectStationId}
          isDark={isDark}
          onToggleTheme={handleToggleTheme}
          layoutResetSignal={mapLayoutSignal}
          recenterSignal={recenterSignal}
          reducedMotion={reducedMotion}
          mobilePerformanceMode={mobilePerformanceMode}
          preserveCameraOnSelectionClear={isMobile}
          commutePathPreview={commutePathPreview}
          onClearCommutePathPreview={handleClearCommutePathPreview}
          viewportOrientation={rotatedMapMode ? "rotated-landscape" : "standard"}
        />

        {subwayOperatingState.status === "closed" && closedMapPeek ? (
          <div className="subway-closed-peek-chip" role="status" aria-live="polite">
            <Moon className="subway-closed-peek-icon shrink-0" size={18} strokeWidth={2.4} aria-hidden="true" />
            <div className="subway-closed-peek-text">
              <strong className="subway-closed-peek-title">Subway Closed</strong>
              <span className="subway-closed-peek-subtitle">Resumes {subwayOperatingState.nextResumeLabel?.endsWith(".") ? subwayOperatingState.nextResumeLabel : `${subwayOperatingState.nextResumeLabel}.`}</span>
            </div>
            <button type="button" onClick={() => setClosedMapPeek(false)}>
              Closed Screen
            </button>
          </div>
        ) : null}

        {rotatedMapMode ? (
          <div className="rotated-map-hud" aria-label="Rotated map controls">
            <MobileMapControls
              presentationMode="rotated-landscape"
              onExitRotated={() => {
                setOverlapSelection(null);
                setMapPresentationMode("standard");
              }}
              onRecenter={() => setRecenterSignal((prev) => prev + 1)}
            />
            <RotatedMapSelectionCard
              selection={selection}
              overlapSelection={overlapSelection}
              selectedStationId={selectedStationId}
              stations={stationSummaries}
              onSelectImpact={handleRotatedOverlapImpactSelect}
              onOpenDetails={handleOpenRotatedSelectionDetails}
              onClearSelection={handleClearRotatedSelection}
            />
          </div>
        ) : null}
      </main>

      {!showClosedScreen && (
        <MobileLegend
          closingSoon={subwayOperatingState.closingSoon || (subwayOperatingState.status === "closed" && closedMapPeek)}
          expanded={legendExpanded}
          onToggleExpanded={() => setLegendExpanded(!legendExpanded)}
        />
      )}

      {!showClosedScreen && !rotatedMapMode && selectedStationId && (
        <StationDetailPanel
          stationResult={visibleStationResult}
          loading={stationLoading}
          updating={stationLoading && Boolean(visibleStationResult?.data)}
          selectedStationName={stationSummaries.find((station) => station.id === selectedStationId)?.name}
          onClose={() => setSelectedStationId(null)}
          onSelectImpact={handleMapSelectImpact}
        />
      )}

      {showClosedScreen ? (
        <SubwayClosedScreen
          operatingState={subwayOperatingState}
          onPeekMap={handlePeekClosedMap}
        />
      ) : null}



      {/* Fixed borderless legend at the bottom right */}
      {!showClosedScreen && (
      <>
        <aside className="desktop-map-legend fixed bottom-6 right-6 z-20 pointer-events-none">
          <LineLegend
            onAlertClick={() => {
              setActiveView("alerts");
              setSelection(null);
            }}
            onDelayClick={() => {
              setActiveView("delays");
              setSelection(null);
            }}
            onReducedSpeedZoneClick={() => {
              setActiveView("reduced-speed-zones");
              setSelection(null);
            }}
            onClosureClick={() => {
              setActiveView("closures");
              setSelection(null);
            }}
          />
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
          }}
          onViewFullDetails={() => setActiveView(viewForImpactSelection(selection))}
          onSelectImpact={handleMapSelectImpact}
        />
      ) : null}


      {!showClosedScreen && !rotatedMapMode && activeView === "map" && !selection && !selectedStationId && !accountDialogMode && !commutePathPreview ? (
        <MobileStatusPeek
          lineStatuses={lineStatuses}
          activeAlertCount={activeAlerts.length}
          delayCount={delays.length}
          reducedSpeedZoneCount={reducedSpeedZones.length}
          plannedClosureCount={plannedClosures.length}
          pollText={pollText}
          dataSource={displayData.dataSource}
          onOpenStatus={() => setActiveView("status")}
          onOpenCategory={(view) => {
            setSelection(null);
            setActiveView(view);
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
      {accountDialogMode ? (
        <div className="account-dialog-backdrop" role="presentation" onMouseDown={() => setAccountDialogMode(null)}>
          <section
            className="account-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={accountDialogAriaLabel()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-black/10 p-3 dark:border-white/10">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  {accountDialogTitle()}
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Save commute preferences across demos.</p>
              </div>
              <button type="button" className="station-search-clear" onClick={() => setAccountDialogMode(null)} aria-label="Close account dialog">
                <X size={18} />
              </button>
            </div>
            <form
              className="flex flex-col gap-3 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmitAccount();
              }}
            >
              {accountDialogMode === "link-google" ? (
                <>
                  <p className="account-reset-hint">
                    Link Google sign-in to {accountState.user?.email}. The Google account email must match this LineWatch account.
                  </p>
                  {authConfig.googleSignInAvailable ? (
                    <div aria-label="Link Google">
                      <GoogleSignInButton
                        clientId={authConfig.googleClientId}
                        disabled={accountBusy}
                        onCredential={handleLinkGoogleCredential}
                        onError={setAccountError}
                      />
                    </div>
                  ) : (
                    <p className="account-reset-hint">Google sign-in is not configured for this environment.</p>
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
                  {authConfig.googleSignInAvailable ? (
                    <>
                      <div aria-label="Continue With Google">
                        <GoogleSignInButton
                          clientId={authConfig.googleClientId}
                          disabled={accountBusy}
                          onCredential={handleGoogleCredential}
                          onError={setAccountError}
                        />
                      </div>
                      <div className="account-auth-divider" aria-hidden="true">
                        <span>{accountDialogMode === "login" ? "Or use email" : "Or create with email"}</span>
                      </div>
                    </>
                  ) : null}
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
                </>
              )}
            </form>
          </section>
        </div>
      ) : null}
      <OpeningDisclaimer />
    </div>
    </DataProvider>
  );
}

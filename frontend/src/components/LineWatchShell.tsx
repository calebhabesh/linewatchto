"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { KeyboardEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { DynamicBackground } from "./DynamicBackground";
import { InteractiveTtcMap } from "./InteractiveTtcMap";
import { DelayIcon } from "./DelayIcon";
import { ActiveAlertsPanel } from "./ActiveAlertsPanel";
import { DelaysPanel } from "./DelaysPanel";
import { ReducedSpeedZonesPanel } from "./ReducedSpeedZonesPanel";
import { PlannedClosuresPanel } from "./PlannedClosuresPanel";
import { SavedCommutesPanel } from "./SavedCommutesPanel";
import { ReliabilityPanel } from "./ReliabilityPanel";
import { FloatingPanelShell } from "./FloatingPanelShell";
import { LineLegend } from "./LineLegend";
import { DataProvider, DashboardData } from "../app/DataContext";
import type { ImpactKind, ImpactSelection } from "../app/linewatch-data";
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
import { Menu, X, Map as MapIcon, AlertTriangle, Calendar, Navigation, ShieldCheck, BarChart3, Construction, Search, LogIn, LogOut, UserPlus, UserRound } from "lucide-react";
import { SubwayClosedScreen } from "./SubwayClosedScreen";
import { useSubwayOperatingState } from "../hooks/useSubwayOperatingState";
import { StationSearchPanel } from "./StationSearchPanel";
import { OpeningDisclaimer } from "./OpeningDisclaimer";
import { SubwayClosingSoonChip } from "./SubwayClosingSoonChip";
import {
  AccountRequestError,
  confirmPasswordReset,
  commutePathPreviewFromCommute,
  getCurrentAccount,
  loginAccount,
  loginDemoAccount,
  logoutAccount,
  registerAccount,
  requestPasswordReset,
  type AccountState,
  type AccountSavedCommute,
  type AccountCommutePathPreview,
} from "../app/account-data";
import { normalizeAccountEmail, validateAccountCredentials } from "../app/account-validation";


type ActiveView = "map" | "menu" | "search" | "alerts" | "delays" | "reduced-speed-zones" | "closures" | "commutes" | "analytics";
type AccountDialogMode = "login" | "register" | "forgot-password" | "reset-password";

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
  const clock = useTorontoClock(generatedAt.time);

  const subwayOperatingState = useSubwayOperatingState();
  const [closedMapPeek, setClosedMapPeek] = useState(false);

  if (subwayOperatingState.status === "open" && closedMapPeek) {
    setClosedMapPeek(false);
  }

  const showClosedScreen = subwayOperatingState.status === "closed" && !closedMapPeek;


  // Interactive linking state
  const [selection, setSelection] = useState<ImpactSelection>(null);
  const [stationSummaries, setStationSummaries] = useState<StationSummary[]>(fallbackStationSummaries.stations);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [visibleStationResult, setVisibleStationResult] = useState<StationDataResult<StationDetail | null> | null>(null);
  const [stationLoading, setStationLoading] = useState(false);

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

  const { commuteClearCount, commuteAffectedCount } = useMemo(() => {
    let clear = 0;
    let affected = 0;
    for (const commute of accountCommutes) {
      if (commute.impact.status === "clear") {
        clear++;
      } else if (commute.impact.status === "affected" || commute.impact.status === "planned") {
        affected++;
      }
    }
    return { commuteClearCount: clear, commuteAffectedCount: affected };
  }, [accountCommutes]);

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

  const handleViewCommutePath = (commute: AccountSavedCommute) => {
    const preview = commutePathPreviewFromCommute(commute);
    if (!preview) return;

    setCommutePathPreview(preview);
    setSelection(null);
    setSelectedStationId(null);
    setActiveView("map");
  };

  const handleClearCommutePathPreview = useCallback((commuteId?: string) => {
    setCommutePathPreview((current) => {
      if (!current) return null;
      if (commuteId && current.id !== commuteId) {
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

  useEffect(() => {
    if (subwayOperatingState.status === "closed" && !closedMapPeek) {
      return;
    }

    const refreshDashboardData = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      router.refresh();
    };

    const interval = window.setInterval(refreshDashboardData, dashboardRefreshIntervalMs());
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [closedMapPeek, router, subwayOperatingState.status]);


  useEffect(() => {
    let cancelled = false;

    getStationSummaries().then((result) => {
      if (!cancelled) {
        setStationSummaries(result.data.stations);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

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
        setSelectedStationId(null);
      }
      return prev === "menu" ? "map" : "menu";
    });
  };

  const handleToggleSearch = () => {
    setActiveView((prev) => {
      if (prev !== "search" && prev !== "map") {
        setSelection(null);
        setSelectedStationId(null);
      }

      return prev === "search" ? "map" : "search";
    });
  };

  const handleSelectStationId = useCallback((id: string | null) => {
    setSelectedStationId(id);
    setSelection(null);
    setCommutePathPreview(null);
    if (id) {
      setActiveView("map");
    }
  }, [setSelectedStationId, setSelection, setCommutePathPreview, setActiveView]);

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
    if (!nextSelection) {
      setSelection(null);
      return;
    }
    setActiveView(viewForImpactSelection(nextSelection));
    setSelection(nextSelection);
  }, [setSelectedStationId, setCommutePathPreview, setSelection, setActiveView, viewForImpactSelection]);

  const handlePeekClosedMap = () => {
    setClosedMapPeek(true);
    setActiveView("map");
    setSelection(null);
    setSelectedStationId(null);
    router.refresh();
  };


  const handleToggleTheme = useCallback(() => {
    setIsDark((current) => !current);
  }, [setIsDark]);

  const activeFloatingPanel = !showClosedScreen ? (
    activeView === "alerts" ? (
      <FloatingPanelShell panel="alerts">
        <ActiveAlertsPanel
          selection={selection}
          onSelectImpact={handleMapSelectImpact}
          onBack={() => { setActiveView("menu"); setSelection(null); }}
          onClose={() => { setActiveView("map"); setSelection(null); }}
        />
      </FloatingPanelShell>
    ) : activeView === "delays" ? (
      <FloatingPanelShell panel="delays">
        <DelaysPanel
          selection={selection}
          onSelectImpact={handleMapSelectImpact}
          onBack={() => { setActiveView("menu"); setSelection(null); }}
          onClose={() => { setActiveView("map"); setSelection(null); }}
        />
      </FloatingPanelShell>
    ) : activeView === "reduced-speed-zones" ? (
      <FloatingPanelShell panel="reduced-speed-zones">
        <ReducedSpeedZonesPanel
          selection={selection}
          onSelectImpact={handleMapSelectImpact}
          onBack={() => { setActiveView("menu"); setSelection(null); }}
          onClose={() => { setActiveView("map"); setSelection(null); }}
        />
      </FloatingPanelShell>
    ) : activeView === "closures" ? (
      <FloatingPanelShell panel="closures">
        <PlannedClosuresPanel
          selection={selection}
          onSelectImpact={handleMapSelectImpact}
          onBack={() => { setActiveView("menu"); setSelection(null); }}
          onClose={() => { setActiveView("map"); setSelection(null); }}
        />
      </FloatingPanelShell>
    ) : activeView === "commutes" ? (
      <FloatingPanelShell panel="commutes">
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
        />
      </FloatingPanelShell>
    ) : activeView === "analytics" ? (
      <FloatingPanelShell panel="analytics">
        <ReliabilityPanel
          onBack={() => setActiveView("menu")}
          onClose={() => { setActiveView("map"); setSelection(null); }}
        />
      </FloatingPanelShell>
    ) : null
  ) : null;

  let actionIndex = 0;
  return (
    <DataProvider data={displayData}>
      <div className={`linewatch-shell relative w-full h-screen overflow-hidden transition-colors duration-500 ${(isDark || highContrast) ? "dark bg-[#0d0808] text-slate-100" : "bg-slate-50 text-slate-900"} ${highContrast ? "high-contrast" : ""} ${reducedMotion ? "motion-paused" : ""} ${mobilePerformanceMode ? "mobile-performance-mode" : ""}`}>
      {/* Background */}
      <DynamicBackground reducedMotion={reducedMotion} isDark={isDark || highContrast} disabled={mobilePerformanceMode} />

      {!showClosedScreen && (
      <header className={`absolute top-0 left-0 w-full p-4 sm:p-6 z-40 flex justify-between items-start pointer-events-none`}>
        <div className="flex items-start gap-3 pointer-events-auto relative">
          {/* Menu Toggle Button */}
          <button
            ref={menuButtonRef}
            onClick={handleToggleMenu}
            className={`panel relative flex items-center justify-center w-14 h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-100 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer`}
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
            className={`panel relative flex items-center justify-center w-14 h-14 rounded-xl border border-black/10 dark:border-white/10 shadow-lg hover:!bg-slate-100 dark:hover:!bg-[#1a1e28] hover:scale-105 active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-black/10 dark:focus-visible:ring-white/10 transition-all cursor-pointer ${activeView === "search" ? "ring-2 ring-blue-500/40" : ""}`}
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
            className={`panel-strong absolute top-[72px] left-0 w-[min(calc(100vw-32px),360px)] border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col origin-top-left transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeView === "menu" ? "opacity-100 scale-100 translate-y-0 pointer-events-auto" : "opacity-0 scale-90 -translate-y-4 pointer-events-none"}`}
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
                     <span className="flex h-5 items-center justify-center rounded-full bg-amber-500/20 px-2 text-[10px] font-bold text-amber-700 dark:text-amber-400">
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
                   onClick={() => setActiveView("commutes")}
                   aria-current={activeView === "commutes" ? "page" : undefined}
                   className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors"
                 >
                   <div className="flex items-center gap-3">
                     <Navigation size={18} className="text-slate-500 dark:text-slate-400" /> Saved Commutes
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
                                    {hasDelay && <DelayIcon size={14} className="text-amber-500 dark:text-amber-400" /> /* /assets/linewatch/delay-icon.svg */}
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

        <div className="w-12 h-12" />
      </header>
      )}

      {/* Floating Submenus (Alerts, Delays, Closures, Commutes, Analytics) */}
      {activeFloatingPanel}

      {/* Main Viewport (TTC Map Front & Center, Borderless) */}
      <main className={`absolute inset-0 z-10 ${showClosedScreen ? "subway-closed-map-backdrop" : ""}`}>
        <InteractiveTtcMap
          selection={selection}
          selectedStationId={selectedStationId}
          stations={stationSummaries}
          onSelectImpact={handleMapSelectImpact}
          onSelectStationId={handleSelectStationId}
          isDark={isDark}
          onToggleTheme={handleToggleTheme}
          layoutResetSignal={0}
          reducedMotion={reducedMotion}
          commutePathPreview={commutePathPreview}
          onClearCommutePathPreview={handleClearCommutePathPreview}
        />
      </main>

      {!showClosedScreen && selectedStationId && (
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

      {subwayOperatingState.status === "closed" && closedMapPeek ? (
        <div className="subway-closed-peek-chip" role="status" aria-live="polite">
          <span>Subway closed. Resumes {subwayOperatingState.nextResumeLabel?.endsWith(".") ? subwayOperatingState.nextResumeLabel : `${subwayOperatingState.nextResumeLabel}.`}</span>
          <button type="button" onClick={() => setClosedMapPeek(false)}>
            Closed Screen
          </button>
        </div>
      ) : null}

      {/* Fixed borderless legend at the bottom right */}
      {!showClosedScreen && (
      <aside className="fixed bottom-6 right-6 z-20 pointer-events-none">
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
      )}
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
              {accountDialogMode === "forgot-password" ? (
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

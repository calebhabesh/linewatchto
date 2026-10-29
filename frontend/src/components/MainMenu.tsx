import Image from "next/image";
import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from "react";
import { AlertTriangle, BarChart3, Bell, BookOpen, Bus, ChevronRight, CircleCheck, Construction, Contrast, FileText, HeartHandshake, History, LogIn, LogOut, Map as MapIcon, MapPin, Megaphone, MessageSquareText, Navigation, Pause, Pin, PinOff, ShieldCheck, Sparkles, Train, UserPlus, UserRound } from "lucide-react";
import type { AccessibilityOutageResponse } from "../app/accessibility-outage-data";
import { lineWatchAppVersionLabel } from "../app/app-build";
import type { AccountState, AuthConfig } from "../app/auth-data";
import { BACKGROUND_PREFERENCE_LABEL } from "../app/background-preference";
import type { AccountSavedCommute } from "../app/commute-data";
import type { DashboardData } from "../app/DataContext";
import type { ActiveAlert, DelayAlert, ImpactSelection, LineStatus, PlannedClosure, ReducedSpeedZone } from "../app/linewatch-data";
import type { ImpactCategoryView } from "../app/navigation-transitions";
import { clearServiceStatusLabel } from "../app/network-presentation";
import type { NetworkId } from "../app/regional-data";
import { hasReleaseNotes } from "../app/release-notes";
import type { AccountSavedStation } from "../app/saved-station-data";
import { AccountAvailabilityNotice } from "./AccountAvailabilityNotice";
import type { AccountEntryIntent } from "./AccountDialog";
import { DefaultMapModeControl } from "./DefaultMapModeControl";
import { DelayIcon } from "./DelayIcon";
import type { ActiveView } from "./LineWatchShell";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import SquishSwitch from "./SquishSwitch";
import { TransitLineBadge } from "./TransitLineBadge";

export type MainMenuActionElement = HTMLButtonElement | HTMLAnchorElement;

export type MainMenuProps = {
  accessibilityOutageResult: AccessibilityOutageResponse | null;
  accountActionError: string | null;
  accountBusy: boolean;
  accountCommutes: AccountSavedCommute[];
  accountState: AccountState;
  activeAlerts: ActiveAlert[];
  activeView: ActiveView;
  announcementCount: number | null;
  authConfig: AuthConfig;
  commuteAffectedCount: number;
  commuteClearCount: number;
  defaultNetworkPreference: NetworkId;
  delays: DelayAlert[];
  displayData: DashboardData;
  dotBackgroundEnabled: boolean;
  handleDefaultNetworkChange: (network: NetworkId) => void;
  handleDemoAccount: () => Promise<void>;
  handleMenuKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  handleSignOut: () => Promise<void>;
  handleToggleDotBackground: () => void;
  handleToggleHighContrast: () => void;
  handleToggleReducedMotion: () => void;
  highContrast: boolean;
  lineStatuses: LineStatus[];
  menuPanelRef: RefObject<HTMLDivElement | null>;
  menuPinned: boolean;
  menuVisible: boolean;
  navigateForward: (nextView: ActiveView) => void;
  openAuthChoice: (intent: AccountEntryIntent) => void;
  openGoogleLinkDialog: () => void;
  openImpactCategory: (view: ImpactCategoryView, lineId?: string) => void;
  openLineImpacts: (lineId: string) => void;
  openRegionalTripChanges: () => void;
  openServiceNotices: () => void;
  plannedClosures: PlannedClosure[];
  reducedMotion: boolean;
  reducedSpeedZoneCount: number;
  reducedSpeedZones: ReducedSpeedZone[];
  regionalTripChangeCount: number | null;
  registerMenuAction: (index: number) => (element: MainMenuActionElement | null) => void;
  savedStations: AccountSavedStation[];
  savedStationsAffectedCount: number;
  savedStationsClearCount: number;
  selectedNetwork: NetworkId;
  setActiveView: Dispatch<SetStateAction<ActiveView>>;
  setMenuPinned: Dispatch<SetStateAction<boolean>>;
  setSelection: Dispatch<SetStateAction<ImpactSelection>>;
  supportUrl: string;
  surfaceNoticeCount: number | null;
};

/** The floating main menu: network status, My LineWatch, account, display, and app links. */
export function MainMenu({
  accessibilityOutageResult,
  accountActionError,
  accountBusy,
  accountCommutes,
  accountState,
  activeAlerts,
  activeView,
  announcementCount,
  authConfig,
  commuteAffectedCount,
  commuteClearCount,
  defaultNetworkPreference,
  delays,
  displayData,
  dotBackgroundEnabled,
  handleDefaultNetworkChange,
  handleDemoAccount,
  handleMenuKeyDown,
  handleSignOut,
  handleToggleDotBackground,
  handleToggleHighContrast,
  handleToggleReducedMotion,
  highContrast,
  lineStatuses,
  menuPanelRef,
  menuPinned,
  menuVisible,
  navigateForward,
  openAuthChoice,
  openGoogleLinkDialog,
  openImpactCategory,
  openLineImpacts,
  openRegionalTripChanges,
  openServiceNotices,
  plannedClosures,
  reducedMotion,
  reducedSpeedZoneCount,
  reducedSpeedZones,
  regionalTripChangeCount,
  registerMenuAction,
  savedStations,
  savedStationsAffectedCount,
  savedStationsClearCount,
  selectedNetwork,
  setActiveView,
  setMenuPinned,
  setSelection,
  supportUrl,
  surfaceNoticeCount,
}: MainMenuProps) {
  // Menu items register in render order so arrow keys move between them.
  let actionIndex = 0;
  return (
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
            {accountActionError ? <p className="px-2 pb-2 text-xs font-semibold text-red-600 dark:text-red-300">{accountActionError}</p> : null}
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
                <AlertTriangle size={18} className="text-slate-500 dark:text-slate-400" /> Suspensions
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
                <PlannedClosureIcon size={18} className="text-slate-500 dark:text-slate-400" /> Planned Advisories
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
             <SquishSwitch
                ref={registerMenuAction(actionIndex++)}
                role="menuitemcheckbox"
                checked={highContrast}
                ariaLabel="Toggle high contrast mode"
                onChange={handleToggleHighContrast}
             />
           </div>
           <div className="flex items-center justify-between px-3 py-2.5">
             <span className="main-menu-display-label text-slate-700 dark:text-slate-200 flex items-center gap-3">
               <Pause size={18} className="text-slate-500 dark:text-slate-400" /> Reduced Motion
             </span>
             <SquishSwitch
                ref={registerMenuAction(actionIndex++)}
                role="menuitemcheckbox"
                checked={reducedMotion}
                ariaLabel="Toggle reduced motion"
                onChange={handleToggleReducedMotion}
             />
           </div>
           <div className="flex items-center justify-between px-3 py-2.5">
             <span className="main-menu-display-label text-slate-700 dark:text-slate-200 flex items-center gap-3">
               <Sparkles size={18} className="text-slate-500 dark:text-slate-400" /> {BACKGROUND_PREFERENCE_LABEL}
             </span>
             <SquishSwitch
                ref={registerMenuAction(actionIndex++)}
                role="menuitemcheckbox"
                checked={dotBackgroundEnabled}
                ariaLabel={`Toggle ${BACKGROUND_PREFERENCE_LABEL.toLowerCase()}`}
                onChange={handleToggleDotBackground}
             />
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
  );
}

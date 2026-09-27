/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { BarChart3, Bell, BatteryCharging, MapPin, BookOpen, Download, FileText, HeartHandshake, LogIn, LogOut, Megaphone, MessageSquareText, Navigation, RefreshCcw, Contrast, Pause, Share2, ShieldCheck, Sparkles, TriangleAlert, UserPlus, UserRound, X, History, Map as MapIcon } from "lucide-react";
import Image from "next/image";
import type { AccountState } from "../app/auth-data";
import { BACKGROUND_PREFERENCE_LABEL } from "../app/background-preference";
import { lineWatchAppVersionLabel } from "../app/app-build";
import type { NetworkId } from "../app/regional-data";
import { resetLineWatchLocalAppState } from "../app/local-app-reset";
import { LogsDropdown } from "./LogsDropdown";
import { PushDeliveryDiagnosticsPanel } from "./PushDeliveryDiagnosticsPanel";
import { DefaultMapModeControl } from "./DefaultMapModeControl";
import { AccountAvailabilityNotice } from "./AccountAvailabilityNotice";
import SquishSwitch from "./SquishSwitch";
import {
  getPwaInstallHeading,
  getPwaInstallInstructionText,
  type PwaInstallPlatform,
} from "../app/pwa-install-state";


type Props = {
  accountState: AccountState;
  accountBusy: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  dotBackgroundEnabled: boolean;
  onClose: () => void;
  onRequestSignIn: () => void;
  onRequestCreateAccount: () => void;
  onDemoAccount: () => void;
  onSignOut: () => void;
  googleSignInAvailable: boolean;
  onLinkGoogleAccount: () => void;
  onToggleHighContrast: () => void;
  onToggleReducedMotion: () => void;
  onToggleDotBackground: () => void;
  onOpenNotifications: () => void;
  onOpenCommutes: () => void;
  commuteClearCount: number;
  commuteAffectedCount: number;
  onOpenMyStations: () => void;
  savedStationCount: number;
  savedStationClearCount?: number;
  savedStationAffectedCount?: number;
  defaultNetwork: NetworkId;
  currentNetwork: NetworkId;
  onDefaultNetworkChange: (network: NetworkId) => void;
  onOpenAlertHistory: () => void;
  onOpenAnnouncements?: () => void;
  onOpenAnalytics: () => void;
  onOpenFeedback: () => void;
  supportUrl: string;
  onOpenPrivacyAcknowledgements: () => void;
  onOpenReleaseNotes: () => void;
  onShareApp: () => void;
  shareStatusLabel: string | null;
  notificationStatusLabel: string;
  canOfferPwaInstall: boolean;
  canShowPwaInstallHelp: boolean;
  onRequestPwaInstall: () => void;
  pwaInstallBusy: boolean;
  pwaInstallPlatform: PwaInstallPlatform;
};

export function MobileMoreSheet({
  accountState,
  accountBusy,
  highContrast,
  reducedMotion,
  dotBackgroundEnabled,
  onClose,
  onRequestSignIn,
  onRequestCreateAccount,
  onDemoAccount,
  onSignOut,
  googleSignInAvailable,
  onLinkGoogleAccount,
  onToggleHighContrast,
  onToggleReducedMotion,
  onToggleDotBackground,
  onOpenNotifications,
  onOpenCommutes,
  commuteClearCount,
  commuteAffectedCount,
  onOpenMyStations,
  savedStationCount,
  savedStationClearCount,
  savedStationAffectedCount,
  defaultNetwork,
  currentNetwork,
  onDefaultNetworkChange,
  onOpenAlertHistory,
  onOpenAnnouncements,
  onOpenAnalytics,
  onOpenFeedback,
  supportUrl,
  onOpenPrivacyAcknowledgements,
  onOpenReleaseNotes,
  onShareApp,
  shareStatusLabel,
  notificationStatusLabel,
  canOfferPwaInstall,
  canShowPwaInstallHelp,
  onRequestPwaInstall,
  pwaInstallBusy,
  pwaInstallPlatform,
}: Props) {

  const canResetLocalAppCache = process.env.NODE_ENV !== "production";
  const [isAndroid, setIsAndroid] = useState(false);
  const [motionPreferenceChanged, setMotionPreferenceChanged] = useState(false);
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setIsAndroid(/Android/i.test(navigator.userAgent));
    }
  }, []);
  const canUseNativeInstallPrompt =
    canOfferPwaInstall &&
    (pwaInstallPlatform === "android-chrome" || pwaInstallPlatform === "android-chromium");
  const installHelpHeading = getPwaInstallHeading(pwaInstallPlatform);
  const installInstructionText = getPwaInstallInstructionText({
    platform: pwaInstallPlatform,
    nativePromptAvailable: canUseNativeInstallPrompt,
  });

  return (
    <section className="mobile-more-sheet panel" data-motion-preference-changed={motionPreferenceChanged ? "true" : undefined} aria-label="More LineWatchTO options">
      <div className="mobile-more-content-scroll">
        <div className="mobile-sheet-heading">
          <div className="mobile-more-brand">
            <Image src="/assets/linewatch/logo.svg" alt="" width={28} height={28} aria-hidden="true" />
            <div className="mobile-more-title-block">
              <div className="mobile-more-kicker-row">
                <p className="mobile-sheet-kicker linewatch-wordmark mobile-more-wordmark">LineWatchTO</p>
                <span className="mobile-more-build-label" aria-label={`App version ${lineWatchAppVersionLabel}`}>
                  {lineWatchAppVersionLabel}
                </span>
              </div>
              <h2>More</h2>
            </div>
          </div>
          <button type="button" className="mobile-sheet-icon-button" onClick={onClose} aria-label="Close more options">
            <X size={20} />
          </button>
        </div>

        {canShowPwaInstallHelp ? (
          <div className="mobile-more-section mobile-more-install-section">
            <div className="station-subsection-header flex items-center gap-2 px-0 pt-1.5 pb-2 mb-0.5 select-none">
              <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
              <h3>{installHelpHeading}</h3>
            </div>
            {canUseNativeInstallPrompt ? (
              <button
                type="button"
                className="mobile-more-row mobile-more-install-row"
                disabled={pwaInstallBusy}
                onClick={onRequestPwaInstall}
              >
                <Download size={18} className="text-slate-500 dark:text-slate-400" />
                <span className="mobile-more-install-copy">
                  <span>Install LineWatchTO</span>
                  <span>{installInstructionText}</span>
                </span>
              </button>
            ) : (
              <div className="mobile-more-row mobile-more-install-row" role="note">
                <Download size={18} className="text-slate-500 dark:text-slate-400" />
                <span className="mobile-more-install-copy">
                  <span>Install LineWatchTO</span>
                  <span>{installInstructionText}</span>
                </span>
              </div>
            )}
          </div>
        ) : null}

        <div className="mobile-more-section">
          <div className="station-subsection-header flex items-center gap-2 px-0 pt-1.5 pb-2 mb-0.5 select-none">
            <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
            <h3>Account</h3>
          </div>
          {accountState.source === "unavailable" ? (
            <AccountAvailabilityNotice
              compact
              knownAccountLabel={accountState.user?.displayName || accountState.user?.email || null}
            />
          ) : accountState.authenticated && accountState.user ? (
            <>
              <div className="mobile-more-account">
                <UserRound size={18} />
                <span>{accountState.user.displayName || accountState.user.email}</span>
                {accountState.user.demo ? <strong>Demo</strong> : null}
              </div>
              <button type="button" className="mobile-more-row" disabled={accountBusy} onClick={onSignOut}>
                <LogOut size={18} />
                Sign Out
              </button>
              {googleSignInAvailable && !accountState.user.demo ? (
                accountState.user.googleLinked ? (
                  <div className="mobile-more-row mobile-more-linked-status" aria-label="Google sign-in linked">
                    <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
                    Google Linked
                  </div>
                ) : (
                  <button type="button" className="mobile-more-row" disabled={accountBusy} onClick={onLinkGoogleAccount}>
                    <ShieldCheck size={18} className="text-slate-500 dark:text-slate-400" />
                    Link Google
                  </button>
                )
              ) : null}
              <button type="button" className="mobile-more-row w-full flex items-center justify-between" onClick={onOpenCommutes}>
                <span className="flex items-center gap-[9px]">
                  <Navigation size={18} className="text-slate-500 dark:text-slate-400" />
                  My Commutes
                </span>
                {commuteClearCount + commuteAffectedCount > 0 ? (
                  <span className="flex items-center gap-1.5 shrink-0" data-testid="mobile-commute-status-badges">
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
                  </span>
                ) : null}
              </button>
              <button type="button" className="mobile-more-row w-full flex items-center justify-between" onClick={onOpenMyStations}>
                <span className="flex items-center gap-[9px]">
                  <MapPin size={18} className="text-slate-500 dark:text-slate-400" />
                  My Stations
                </span>
                {savedStationCount > 0 ? (
                  <span className="flex items-center gap-1.5 shrink-0" data-testid="mobile-station-status-badges">
                    <span
                      className={`desktop-menu-count-badge desktop-menu-count-stations-clear flex h-6 ${
                        (savedStationClearCount ?? savedStationCount) < 10 ? "w-6" : "min-w-[24px] px-1.5"
                      } items-center justify-center rounded-full text-[11px] font-bold`}
                      aria-label={`${savedStationClearCount ?? savedStationCount} clear stations`}
                    >
                      {savedStationClearCount ?? savedStationCount}
                    </span>
                    <span
                      className={`desktop-menu-count-badge desktop-menu-count-stations-affected flex h-6 ${
                        (savedStationAffectedCount ?? 0) < 10 ? "w-6" : "min-w-[24px] px-1.5"
                      } items-center justify-center rounded-full text-[11px] font-bold`}
                      aria-label={`${savedStationAffectedCount ?? 0} affected stations`}
                    >
                      {savedStationAffectedCount ?? 0}
                    </span>
                  </span>
                ) : null}
              </button>
              <button type="button" className="mobile-more-row" onClick={onOpenAlertHistory}>
                <History size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
                Alert History
              </button>
              {currentNetwork === "ttc" ? (
                <button type="button" className="mobile-more-row" onClick={onOpenAnnouncements}>
                  <Megaphone size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
                  TTC Announcements
                </button>
              ) : null}
            </>
          ) : (
            <>
              <button type="button" className="mobile-more-row" onClick={onRequestSignIn}>
                <LogIn size={18} />
                Sign In
              </button>
              <button type="button" className="mobile-more-row" onClick={onRequestCreateAccount}>
                <UserPlus size={18} />
                Create Account
              </button>
              <button type="button" className="mobile-more-row" disabled={accountBusy} onClick={onDemoAccount}>
                <UserRound size={18} />
                Demo Account
              </button>
              <button type="button" className="mobile-more-row w-full flex items-center justify-between" onClick={onOpenCommutes}>
                <span className="flex items-center gap-[9px]">
                  <Navigation size={18} className="text-slate-500 dark:text-slate-400" />
                  My Commutes
                </span>
                {commuteClearCount + commuteAffectedCount > 0 ? (
                  <span className="flex items-center gap-1.5 shrink-0" data-testid="mobile-commute-status-badges">
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
                  </span>
                ) : null}
              </button>
              <button type="button" className="mobile-more-row w-full flex items-center justify-between" onClick={onOpenMyStations}>
                <span className="flex items-center gap-[9px]">
                  <MapPin size={18} className="text-slate-500 dark:text-slate-400" />
                  My Stations
                </span>
                {savedStationCount > 0 ? (
                  <span className="flex items-center gap-1.5 shrink-0" data-testid="mobile-station-status-badges">
                    <span
                      className={`desktop-menu-count-badge desktop-menu-count-stations-clear flex h-6 ${
                        (savedStationClearCount ?? savedStationCount) < 10 ? "w-6" : "min-w-[24px] px-1.5"
                      } items-center justify-center rounded-full text-[11px] font-bold`}
                      aria-label={`${savedStationClearCount ?? savedStationCount} clear stations`}
                    >
                      {savedStationClearCount ?? savedStationCount}
                    </span>
                    <span
                      className={`desktop-menu-count-badge desktop-menu-count-stations-affected flex h-6 ${
                        (savedStationAffectedCount ?? 0) < 10 ? "w-6" : "min-w-[24px] px-1.5"
                      } items-center justify-center rounded-full text-[11px] font-bold`}
                      aria-label={`${savedStationAffectedCount ?? 0} affected stations`}
                    >
                      {savedStationAffectedCount ?? 0}
                    </span>
                  </span>
                ) : null}
              </button>
              <button type="button" className="mobile-more-row" onClick={onOpenAlertHistory}>
                <History size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
                Alert History
              </button>
              {currentNetwork === "ttc" ? (
                <button type="button" className="mobile-more-row" onClick={onOpenAnnouncements}>
                  <Megaphone size={18} className="text-slate-500 dark:text-slate-400" />
                  TTC Announcements
                </button>
              ) : null}
            </>
          )}
          <DefaultMapModeControl
            compact
            value={defaultNetwork}
            onChange={onDefaultNetworkChange}
          />
        </div>

        <div className="mobile-more-section">
          <div className="station-subsection-header flex items-center gap-2 px-0 pt-1.5 pb-2 mb-0.5 select-none">
            <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
            <h3>Notifications</h3>
          </div>
          <button type="button" className="mobile-more-row w-full flex items-center justify-between gap-[9px]" onClick={onOpenNotifications}>
            <div className="flex items-center gap-[9px] min-w-0 flex-1">
              <div className="shrink-0">
                <Bell size={18} className="text-slate-500 dark:text-slate-400" />
              </div>
              <div className="flex-1 flex flex-col min-w-0">
                <span>Notifications</span>
                <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400 mt-0.5">
                  Press to Configure
                </span>
              </div>
            </div>
            <div className="shrink-0 flex items-center">
              {accountState.source === "unavailable" ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  Checking
                </span>
              ) : !accountState.authenticated ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-blue-500 text-white dark:bg-blue-600">
                  Sign In
                </span>
              ) : notificationStatusLabel === "On" ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-500 text-white dark:bg-emerald-600/80">
                  ON
                </span>
              ) : notificationStatusLabel === "Off" ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  OFF
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-600">
                  {notificationStatusLabel}
                </span>
              )}
            </div>
          </button>
        </div>

        <div className="mobile-more-section">
          <div className="station-subsection-header flex items-center gap-2 px-0 pt-1.5 pb-2 mb-0.5 select-none">
            <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
            <h3>Operations</h3>
          </div>
          <button type="button" className="mobile-more-row" onClick={onOpenAnalytics}>
            <BarChart3 size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
            Reliability Analytics
          </button>

        </div>

        <div className="mobile-more-section">
          <div className="station-subsection-header flex items-center gap-2 px-0 pt-1.5 pb-2 mb-0.5 select-none">
            <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
            <h3>Display</h3>
          </div>
          <div className="mobile-more-row mobile-more-toggle-row">
            <Contrast size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
            <label htmlFor="mobile-high-contrast-switch">High Contrast Mode</label>
            <SquishSwitch id="mobile-high-contrast-switch" checked={highContrast} ariaLabel="High Contrast Mode" className="ml-auto shrink-0" onChange={onToggleHighContrast} />
          </div>
          <div className="mobile-more-row mobile-more-toggle-row">
            <Pause size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
            <label htmlFor="mobile-reduced-motion-switch">Reduced Motion</label>
            <SquishSwitch id="mobile-reduced-motion-switch" checked={reducedMotion} ariaLabel="Reduced Motion" className="ml-auto shrink-0" onChange={() => {
              setMotionPreferenceChanged(true);
              onToggleReducedMotion();
            }} />
          </div>
          <div className="mobile-more-row mobile-more-toggle-row">
            <Sparkles size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
            <label htmlFor="mobile-background-switch">{BACKGROUND_PREFERENCE_LABEL}</label>
            <SquishSwitch id="mobile-background-switch" checked={dotBackgroundEnabled} ariaLabel={BACKGROUND_PREFERENCE_LABEL} className="ml-auto shrink-0" onChange={onToggleDotBackground} />
          </div>
          {/* Note: Live Train Markers toggle has been moved to the map front page on mobile (under the legend). */}
        </div>

        <div className="mobile-more-section">
          <div className="station-subsection-header flex items-center gap-2 px-0 pt-1.5 pb-2 mb-0.5 select-none">
            <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
            <h3>{"Support & About"}</h3>
          </div>
          <button type="button" className="mobile-more-row mobile-more-share-row" onClick={onShareApp}>
            <Share2 size={18} className="text-slate-500 dark:text-slate-400" />
            <span className="mobile-more-share-copy">
              <span>Share LineWatchTO</span>
              <span>Send app link to friends</span>
            </span>
            {shareStatusLabel ? (
              <strong className="mobile-more-share-status" aria-live="polite">
                {shareStatusLabel}
              </strong>
            ) : null}
          </button>
          <button type="button" className="mobile-more-row" onClick={onOpenFeedback}>
            <MessageSquareText size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
            Leave Feedback
          </button>
          {supportUrl ? (
            <a href={supportUrl} target="_blank" rel="noreferrer" className="mobile-more-row">
              <HeartHandshake size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
              Support
            </a>
          ) : null}
          <button type="button" className="mobile-more-row" onClick={onOpenPrivacyAcknowledgements}>
            <FileText size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
            Privacy &amp; Acknowledgements
          </button>
          <button type="button" className="mobile-more-row" onClick={onOpenReleaseNotes}>
            <FileText size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
            Release Notes
          </button>
          <a href="/explore" className="mobile-more-row">
            <BookOpen size={18} className="text-slate-500 dark:text-slate-400 shrink-0" />
            Transit Guides
          </a>
          <div className="mobile-more-row mobile-more-map-attribution" role="note" aria-label="Map Attribution">
            <MapIcon size={18} className="text-slate-500 dark:text-slate-400" />
            <div className="mobile-more-map-attribution-copy">
              <span className="mobile-more-map-attribution-title">Map Attribution</span>
              <span className="mobile-more-map-attribution-summary">Diagram and geographic map sources</span>
              <dl className="mobile-more-map-attribution-sources">
                <div>
                  <dt>TTC</dt>
                  <dd>
                    Diagram based on the TTC route map · Geographic shapes{` `}
                    <a href="https://open.toronto.ca/" target="_blank" rel="noreferrer">© City of Toronto</a>
                  </dd>
                </div>
                <div>
                  <dt>GO/UP</dt>
                  <dd>
                    Diagram based on the Metrolinx system map · Geographic shapes{` `}
                    <a href="https://www.gotransit.com/" target="_blank" rel="noreferrer">© Metrolinx</a>
                  </dd>
                </div>
                <div>
                  <dt>Base</dt>
                  <dd>
                    <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a>
                    {` · `}
                    <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a>
                    {` · `}
                    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
                  </dd>
                </div>
              </dl>
              <span className="mobile-more-map-attribution-note">Diagrams independently re-created in Inkscape · Derivative replicas · Not downloaded originals · Not to scale</span>
            </div>
          </div>
          <LogsDropdown isMobileMore={true} network={currentNetwork} />
          {canResetLocalAppCache ? (
            <button type="button" className="mobile-more-row" onClick={() => { void resetLineWatchLocalAppState(); }}>
              <RefreshCcw size={18} className="text-slate-500 dark:text-slate-400" />
              Reset Local App Cache
            </button>
          ) : null}
        </div>

        <div className="mobile-more-section">
          <div className="station-subsection-header flex items-center gap-2 px-0 pt-1.5 pb-2 mb-0.5 select-none">
            <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
            <h3>Notifications Help</h3>
          </div>
          <PushDeliveryDiagnosticsPanel
            key={accountState.user?.id ?? "signed-out"}
            accountState={accountState}
          />
          {isAndroid && (
            <div className="mobile-more-install-help android-notification-help" role="note">
              <div className="android-notification-help-heading">
                <BatteryCharging size={18} aria-hidden="true" />
                <div>
                  <span>Android Notification Reliability</span>
                  <strong>Help alerts arrive while your phone is idle</strong>
                </div>
              </div>

              <ol className="android-notification-steps" aria-label="Android notification setup steps">
                <li>
                  <b>1</b>
                  <div>
                    <strong>Open the app settings</strong>
                    <p>Settings <i>›</i> Apps <i>›</i> LineWatchTO</p>
                  </div>
                </li>
                <li>
                  <b>2</b>
                  <div>
                    <strong>Remove the battery restriction</strong>
                    <p>App battery usage <i>›</i> <em>Unrestricted</em></p>
                  </div>
                </li>
                <li>
                  <b>3</b>
                  <div>
                    <strong>Allow visible alerts</strong>
                    <p>Notifications <i>›</i> LineWatchTO <i>›</i> Pop on screen</p>
                  </div>
                </li>
              </ol>

              <p className="android-notification-fallback">
                Don&apos;t see LineWatchTO in Apps? Apply the battery setting to <strong>Chrome</strong> instead.
              </p>

              <div className="android-notification-caution">
                <TriangleAlert size={15} aria-hidden="true" />
                <p>
                  Unrestricted access can use more battery and improves the odds, but Android and Chrome policy still cannot guarantee immediate delivery. Do not rely on PWA push as the only channel for safety-critical alerts.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

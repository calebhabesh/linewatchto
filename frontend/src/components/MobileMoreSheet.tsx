/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { BarChart3, Bell, BatteryCharging, Bookmark, BookOpen, Download, FileText, HeartHandshake, LogIn, LogOut, Megaphone, MessageSquareText, Navigation, RefreshCcw, Contrast, Pause, Share2, ShieldCheck, Sparkles, TriangleAlert, UserPlus, UserRound, X, History, Map as MapIcon } from "lucide-react";
import Image from "next/image";
import type { AccountState } from "../app/account-data";
import { BACKGROUND_PREFERENCE_LABEL } from "../app/background-preference";
import { lineWatchAppVersionLabel } from "../app/app-build";
import type { DashboardData } from "../app/DataContext";
import type { NetworkId } from "../app/regional-data";
import { resetLineWatchLocalAppState } from "../app/local-app-reset";
import { hasReleaseNotes } from "../app/release-notes";
import { LogsDropdown } from "./LogsDropdown";
import { PushDeliveryDiagnosticsPanel } from "./PushDeliveryDiagnosticsPanel";
import { DefaultMapModeControl } from "./DefaultMapModeControl";
import { AccountAvailabilityNotice } from "./AccountAvailabilityNotice";
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
  ingestionHealth: DashboardData["ingestionHealth"];
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
  ingestionHealth,
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
    <section className="mobile-more-sheet panel" aria-label="More LineWatchTO options">
      <div className="linewatch-transit-accent-strip mobile-more-accent-strip" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="mobile-sheet-heading">
        <div className="mobile-more-brand">
          <Image src="/assets/linewatch/logo.svg" alt="" width={28} height={28} aria-hidden="true" />
          <span>
            <p className="mobile-sheet-kicker">LineWatchTO</p>
            <h2>More</h2>
            <p className="mobile-more-build-label" aria-label={`App version ${lineWatchAppVersionLabel}`}>
              {lineWatchAppVersionLabel}
            </p>
          </span>
        </div>
        <button type="button" className="mobile-sheet-icon-button" onClick={onClose} aria-label="Close more options">
          <X size={20} />
        </button>
      </div>

      <div className="mobile-more-content-scroll">
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
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-600 dark:text-emerald-400" aria-label={`${commuteClearCount} clear commutes`}>
                      {commuteClearCount}
                    </span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-700 dark:text-amber-400" aria-label={`${commuteAffectedCount} affected commutes`}>
                      {commuteAffectedCount}
                    </span>
                  </span>
                ) : null}
              </button>
              <button type="button" className="mobile-more-row w-full flex items-center justify-between" onClick={onOpenMyStations}>
                <span className="flex items-center gap-[9px]">
                  <Bookmark size={18} className="text-slate-500 dark:text-slate-400" />
                  My Stations
                </span>
                {savedStationCount > 0 ? (
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-sky-500/15 px-2 text-[11px] font-bold text-sky-700 dark:text-sky-300">
                    {savedStationCount}
                  </span>
                ) : null}
              </button>
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
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-600 dark:text-emerald-400" aria-label={`${commuteClearCount} clear commutes`}>
                      {commuteClearCount}
                    </span>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-700 dark:text-amber-400" aria-label={`${commuteAffectedCount} affected commutes`}>
                      {commuteAffectedCount}
                    </span>
                  </span>
                ) : null}
              </button>
              <button type="button" className="mobile-more-row w-full flex items-center justify-between" onClick={onOpenMyStations}>
                <span className="flex items-center gap-[9px]">
                  <Bookmark size={18} className="text-slate-500 dark:text-slate-400" />
                  My Stations
                </span>
                {savedStationCount > 0 ? (
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-sky-500/15 px-2 text-[11px] font-bold text-sky-700 dark:text-sky-300">
                    {savedStationCount}
                  </span>
                ) : null}
              </button>
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
          <button type="button" className="mobile-more-row" onClick={onOpenAlertHistory}>
            <History size={18} className="text-slate-500 dark:text-slate-400" />
            Alert History
          </button>
          {currentNetwork === "ttc" ? <button type="button" className="mobile-more-row" onClick={onOpenAnnouncements}>
            <Megaphone size={18} className="text-slate-500 dark:text-slate-400" />
            TTC Announcements
          </button> : null}
        </div>

        <div className="mobile-more-section">
          <div className="station-subsection-header flex items-center gap-2 px-0 pt-1.5 pb-2 mb-0.5 select-none">
            <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
            <h3>Operations</h3>
          </div>
          <button type="button" className="mobile-more-row" onClick={onOpenAnalytics}>
            <BarChart3 size={18} className="text-slate-500 dark:text-slate-400" />
            Reliability Analytics
          </button>
          <div className="mobile-more-health-grid" aria-label="Source Health">
            {ingestionHealth.map((health, index) => (
              <div key={`${health.label}-${index}`}>
                <span>{health.label}</span>
                <strong>{health.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="mobile-more-section">
          <div className="station-subsection-header flex items-center gap-2 px-0 pt-1.5 pb-2 mb-0.5 select-none">
            <span className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]" />
            <h3>Display</h3>
          </div>
          <button type="button" className="mobile-more-row" aria-pressed={highContrast} onClick={onToggleHighContrast}>
            <Contrast size={18} className="text-slate-500 dark:text-slate-400" />
            High Contrast Mode
            <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ml-auto shrink-0 ${highContrast ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`} >
              <span className={`absolute left-1 top-1 h-3 w-3 transform rounded-full bg-white transition-transform ${highContrast ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
          </button>
          <button type="button" className="mobile-more-row" aria-pressed={reducedMotion} onClick={onToggleReducedMotion}>
            <Pause size={18} className="text-slate-500 dark:text-slate-400" />
            Reduced Motion
            <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ml-auto shrink-0 ${reducedMotion ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`} >
              <span className={`absolute left-1 top-1 h-3 w-3 transform rounded-full bg-white transition-transform ${reducedMotion ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
          </button>
          <button type="button" className="mobile-more-row" aria-pressed={dotBackgroundEnabled} onClick={onToggleDotBackground}>
            <Sparkles size={18} className="text-slate-500 dark:text-slate-400" />
            {BACKGROUND_PREFERENCE_LABEL}
            <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ml-auto shrink-0 ${dotBackgroundEnabled ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`} >
              <span className={`absolute left-1 top-1 h-3 w-3 transform rounded-full bg-white transition-transform ${dotBackgroundEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
            </div>
          </button>
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
          <a href="/explore" className="mobile-more-row">
            <BookOpen size={18} className="text-slate-500 dark:text-slate-400" />
            Transit Guides
          </a>
          <button type="button" className="mobile-more-row" onClick={onOpenFeedback}>
            <MessageSquareText size={18} className="text-slate-500 dark:text-slate-400" />
            Leave Feedback
          </button>
          {supportUrl ? (
            <a href={supportUrl} target="_blank" rel="noreferrer" className="mobile-more-row">
              <HeartHandshake size={18} className="text-slate-500 dark:text-slate-400" />
              Support
            </a>
          ) : null}
          <button type="button" className="mobile-more-row" onClick={onOpenPrivacyAcknowledgements}>
            <FileText size={18} className="text-slate-500 dark:text-slate-400" />
            Privacy & Acknowledgements
          </button>
          <div className="mobile-more-row mobile-more-map-attribution" role="note" aria-label="Map Attribution">
            <MapIcon size={18} className="text-slate-500 dark:text-slate-400" />
            <div className="mobile-more-map-attribution-copy">
              <span className="mobile-more-map-attribution-title">Map Attribution</span>
              <span className="mobile-more-map-attribution-summary">Independently re-created in Inkscape</span>
              <dl className="mobile-more-map-attribution-sources">
                <div><dt>TTC</dt><dd>Based on the TTC route map</dd></div>
                <div><dt>GO/UP</dt><dd>Based on the Metrolinx system map</dd></div>
              </dl>
              <span className="mobile-more-map-attribution-note">Derivative replicas · Not downloaded originals · Not to scale</span>
            </div>
          </div>
          {hasReleaseNotes ? (
            <button type="button" className="mobile-more-row" onClick={onOpenReleaseNotes}>
              <Sparkles size={18} className="text-slate-500 dark:text-slate-400" />
              {"What's New"}
            </button>
          ) : null}
          <LogsDropdown isMobileMore={true} network={currentNetwork} />
          {canResetLocalAppCache ? (
            <button type="button" className="mobile-more-row" onClick={() => { void resetLineWatchLocalAppState(); }}>
              <RefreshCcw size={18} className="text-slate-500 dark:text-slate-400" />
              Reset Local App Cache
            </button>
          ) : null}
        </div>

        {currentNetwork === "ttc" ? <div className="mobile-more-section">
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
        </div> : null}
      </div>
    </section>
  );
}

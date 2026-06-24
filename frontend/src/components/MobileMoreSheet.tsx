"use client";

import { BarChart3, Bell, Download, FileText, LogIn, LogOut, MessageSquareText, RefreshCcw, Contrast, Pause, ShieldCheck, Sparkles, UserPlus, UserRound, X, History } from "lucide-react";
import Image from "next/image";
import type { AccountState } from "../app/account-data";
import { lineWatchAppVersionLabel } from "../app/app-build";
import type { DashboardData } from "../app/DataContext";
import { resetLineWatchLocalAppState } from "../app/local-app-reset";
import { hasReleaseNotes } from "../app/release-notes";
import { LogsDropdown } from "./LogsDropdown";
import type { PwaInstallPlatform } from "../app/pwa-install-state";


type Props = {
  accountState: AccountState;
  accountBusy: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
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
  onOpenNotifications: () => void;
  onOpenAlertHistory: () => void;
  onOpenAnalytics: () => void;
  onOpenFeedback: () => void;
  onOpenPrivacyAcknowledgements: () => void;
  onOpenReleaseNotes: () => void;
  notificationStatusLabel: string;
  canOfferPwaInstall: boolean;
  canShowPwaInstallHelp: boolean;
  onDismissPwaInstall: () => void;
  onRequestPwaInstall: () => void;
  pwaInstallBusy: boolean;
  pwaInstallPlatform: PwaInstallPlatform;
};

export function MobileMoreSheet({
  accountState,
  accountBusy,
  highContrast,
  reducedMotion,
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
  onOpenNotifications,
  onOpenAlertHistory,
  onOpenAnalytics,
  onOpenFeedback,
  onOpenPrivacyAcknowledgements,
  onOpenReleaseNotes,
  notificationStatusLabel,
  canOfferPwaInstall,
  canShowPwaInstallHelp,
  onDismissPwaInstall,
  onRequestPwaInstall,
  pwaInstallBusy,
  pwaInstallPlatform,
}: Props) {

  const canResetLocalAppCache = process.env.NODE_ENV !== "production";
  const isIosPwaInstall = pwaInstallPlatform === "ios";
  const androidInstallHelpOnly = pwaInstallPlatform === "android-chromium" && !canOfferPwaInstall;
  const installRowDescription = isIosPwaInstall
    ? "Share, then Add to Home Screen."
    : androidInstallHelpOnly
      ? "Chrome menu, then Add to Home screen."
      : "Open as a full-screen app.";

  return (
    <section className="mobile-more-sheet panel" aria-label="More LineWatchTO options">
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
        <div className="mobile-more-section">
          <h3>Account</h3>
          {accountState.authenticated && accountState.user ? (
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
            </>
          )}
        </div>

        {canShowPwaInstallHelp ? (
          <div className="mobile-more-section mobile-more-install-section">
            <h3>Home screen app</h3>
            {androidInstallHelpOnly ? (
              <div className="mobile-more-row mobile-more-install-row" role="note">
                <Download size={18} className="text-slate-500 dark:text-slate-400" />
                <span className="mobile-more-install-copy">
                  <span>Install LineWatchTO</span>
                  <span>{installRowDescription}</span>
                </span>
              </div>
            ) : (
              <button
                type="button"
                className="mobile-more-row mobile-more-install-row"
                disabled={pwaInstallBusy}
                onClick={isIosPwaInstall ? onDismissPwaInstall : onRequestPwaInstall}
              >
                <Download size={18} className="text-slate-500 dark:text-slate-400" />
                <span className="mobile-more-install-copy">
                  <span>Install LineWatchTO</span>
                  <span>{installRowDescription}</span>
                </span>
              </button>
            )}
            {isIosPwaInstall ? (
              <div className="mobile-more-install-help" role="note">
                <span>iPhone Safari</span>
                <strong>Tap Share, then Add to Home Screen.</strong>
              </div>
            ) : null}
            {androidInstallHelpOnly ? (
              <div className="mobile-more-install-help" role="note">
                <span>Android Chrome</span>
                <strong>Open the three-dot menu, then Add to Home screen.</strong>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mobile-more-section">
          <h3>Notifications</h3>
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
              {!accountState.authenticated ? (
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
        </div>

        <div className="mobile-more-section">
          <h3>Display</h3>
          <button type="button" className="mobile-more-row" aria-pressed={highContrast} onClick={onToggleHighContrast}>
            <Contrast size={18} className="text-slate-500 dark:text-slate-400" />
            High Contrast Mode
            <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ml-auto shrink-0 ${highContrast ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${highContrast ? 'translate-x-4' : 'translate-x-1'}`} />
            </div>
          </button>
          <button type="button" className="mobile-more-row" aria-pressed={reducedMotion} onClick={onToggleReducedMotion}>
            <Pause size={18} className="text-slate-500 dark:text-slate-400" />
            Reduced Motion
            <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ml-auto shrink-0 ${reducedMotion ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${reducedMotion ? 'translate-x-4' : 'translate-x-1'}`} />
            </div>
          </button>
        </div>

        <div className="mobile-more-section">
          <h3>Tools</h3>
          <button type="button" className="mobile-more-row" onClick={onOpenAnalytics}>
            <BarChart3 size={18} className="text-slate-500 dark:text-slate-400" />
            Reliability Analytics
          </button>
          <button type="button" className="mobile-more-row" onClick={onOpenFeedback}>
            <MessageSquareText size={18} className="text-slate-500 dark:text-slate-400" />
            Leave Feedback / Support
          </button>
          <button type="button" className="mobile-more-row" onClick={onOpenPrivacyAcknowledgements}>
            <FileText size={18} className="text-slate-500 dark:text-slate-400" />
            Privacy & Acknowledgements
          </button>
          {hasReleaseNotes ? (
            <button type="button" className="mobile-more-row" onClick={onOpenReleaseNotes}>
              <Sparkles size={18} className="text-slate-500 dark:text-slate-400" />
              {"What's New"}
            </button>
          ) : null}
          <LogsDropdown isMobileMore={true} />
          {canResetLocalAppCache ? (
            <button type="button" className="mobile-more-row" onClick={() => { void resetLineWatchLocalAppState(); }}>
              <RefreshCcw size={18} className="text-slate-500 dark:text-slate-400" />
              Reset Local App Cache
            </button>
          ) : null}
        </div>

        <div className="mobile-more-section">
          <h3>Source Health</h3>
          <div className="mobile-more-health-grid">
            {ingestionHealth.map((health, index) => (
              <div key={`${health.label}-${index}`}>
                <span>{health.label}</span>
                <strong>{health.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

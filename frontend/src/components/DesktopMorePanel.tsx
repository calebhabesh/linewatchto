"use client";

import {
  BarChart3,
  Bell,
  BookOpen,
  Bus,
  ChevronRight,
  Contrast,
  FileText,
  HeartHandshake,
  History,
  LogIn,
  LogOut,
  MapPinCheck,
  Megaphone,
  MessageSquareText,
  Moon,
  Pause,
  Share2,
  ShieldCheck,
  Sparkles,
  UserPlus,
  UserRound,
} from "lucide-react";
import { AccessibilityMenuIcon } from "./AccessibilityMenuIcon";
import type { AccountState } from "../app/account-data";
import { lineWatchAppVersionLabel } from "../app/app-build";
import type { NetworkId } from "../app/regional-data";

type Props = {
  accountState: AccountState;
  accountBusy: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  dotBackgroundEnabled: boolean;
  isDark: boolean;
  defaultNetwork: NetworkId;
  currentNetwork: NetworkId;
  shareStatusLabel: string | null;
  onToggleTheme: () => void;
  onRequestSignIn: () => void;
  onRequestCreateAccount: () => void;
  onDemoAccount: () => void;
  onSignOut: () => void;
  onToggleHighContrast: () => void;
  onToggleReducedMotion: () => void;
  onToggleDotBackground: () => void;
  onDefaultNetworkChange: (network: NetworkId) => void;
  onOpenNotifications: () => void;
  onOpenAnalytics: () => void;
  onOpenAlertHistory: () => void;
  onOpenAnnouncements?: () => void;
  onOpenAccessibilityOutages: () => void;
  onOpenSurfaceNotices: () => void;
  onOpenFeedback: () => void;
  onOpenPrivacyAcknowledgements: () => void;
  onOpenReleaseNotes: () => void;
  onOpenGuide: () => void;
  onShareApp: () => void;
  supportUrl: string;
};

export function DesktopMorePanel({
  accountState,
  accountBusy,
  highContrast,
  reducedMotion,
  dotBackgroundEnabled,
  isDark,
  defaultNetwork,
  currentNetwork,
  shareStatusLabel,
  onToggleTheme,
  onRequestSignIn,
  onRequestCreateAccount,
  onDemoAccount,
  onSignOut,
  onToggleHighContrast,
  onToggleReducedMotion,
  onToggleDotBackground,
  onDefaultNetworkChange,
  onOpenNotifications,
  onOpenAnalytics,
  onOpenAlertHistory,
  onOpenAnnouncements,
  onOpenAccessibilityOutages,
  onOpenSurfaceNotices,
  onOpenFeedback,
  onOpenPrivacyAcknowledgements,
  onOpenReleaseNotes,
  onOpenGuide,
  onShareApp,
  supportUrl,
}: Props) {
  return (
    <div className="desktop-more-panel" aria-label="Settings and more options">
      {/* Account Section */}
      <section className="desktop-more-section" aria-label="Account">
        <div className="desktop-more-section-header">
          <span className="desktop-status-section-bar bg-logo-blue" aria-hidden="true" />
          <h3 className="desktop-more-section-title">Account</h3>
        </div>
        <div className="desktop-more-account-card">
          <div className="desktop-more-account-info">
            <div className="desktop-more-account-avatar">
              <UserRound size={20} className="text-slate-500 dark:text-slate-400" aria-hidden="true" />
            </div>
            <div className="desktop-more-account-details">
              {accountState.authenticated && accountState.user ? (
                <>
                  <strong className="desktop-more-account-name">
                    {accountState.user.displayName || accountState.user.email}
                  </strong>
                  <span className="desktop-more-account-sub">
                    {accountState.user.displayName ? accountState.user.email : "Signed In"}
                  </span>
                </>
              ) : (
                <>
                  <strong className="desktop-more-account-name">Guest Rider</strong>
                  <span className="desktop-more-account-sub">Sign in to sync saved stations & commutes</span>
                </>
              )}
            </div>
          </div>

          <div className="desktop-more-card desktop-more-account-actions">
            {accountState.authenticated ? (
              <button
                type="button"
                className="desktop-more-nav-item"
                onClick={onSignOut}
                disabled={accountBusy}
              >
                <div className="desktop-more-nav-item-main">
                  <LogOut size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
                  <span>Sign Out</span>
                </div>
                <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="desktop-more-nav-item"
                  onClick={onRequestSignIn}
                  disabled={accountBusy}
                >
                  <div className="desktop-more-nav-item-main">
                    <LogIn size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
                    <span>Sign In</span>
                  </div>
                  <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="desktop-more-nav-item"
                  onClick={onRequestCreateAccount}
                  disabled={accountBusy}
                >
                  <div className="desktop-more-nav-item-main">
                    <UserPlus size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
                    <span>Register</span>
                  </div>
                  <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="desktop-more-nav-item"
                  onClick={onDemoAccount}
                  disabled={accountBusy}
                >
                  <div className="desktop-more-nav-item-main">
                    <UserRound size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
                    <span>Demo Account</span>
                  </div>
                  <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Preferences & Appearance */}
      <section className="desktop-more-section" aria-label="Appearance & Preferences">
        <div className="desktop-more-section-header">
          <span className="desktop-status-section-bar bg-logo-blue" aria-hidden="true" />
          <h3 className="desktop-more-section-title">Appearance</h3>
        </div>
        <div className="desktop-more-card">
          <div className="desktop-more-setting-row">
            <div className="desktop-more-setting-label">
              <Moon size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              <span>Dark Mode</span>
            </div>
            <button
              type="button"
              className="desktop-more-theme-switch"
              role="switch"
              aria-checked={isDark}
              aria-label="Toggle dark mode"
              onClick={onToggleTheme}
            >
              <span className="desktop-more-theme-switch-thumb">
                {isDark ? (
                  <Moon size={11} className="desktop-more-theme-thumb-icon text-purple-500 fill-purple-500" />
                ) : null}
              </span>
            </button>
          </div>

          <div className="desktop-more-setting-row">
            <div className="desktop-more-setting-label">
              <Contrast size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              <span>High Contrast</span>
            </div>
            <button
              type="button"
              className="desktop-more-switch"
              role="switch"
              aria-checked={highContrast}
              onClick={onToggleHighContrast}
            >
              <span className="desktop-more-switch-knob" />
            </button>
          </div>

          <div className="desktop-more-setting-row">
            <div className="desktop-more-setting-label">
              <Pause size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              <span>Reduced Motion</span>
            </div>
            <button
              type="button"
              className="desktop-more-switch"
              role="switch"
              aria-checked={reducedMotion}
              onClick={onToggleReducedMotion}
            >
              <span className="desktop-more-switch-knob" />
            </button>
          </div>

          <div className="desktop-more-setting-row">
            <div className="desktop-more-setting-label">
              <Sparkles size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              <span>Dot Background</span>
            </div>
            <button
              type="button"
              className="desktop-more-switch"
              role="switch"
              aria-checked={dotBackgroundEnabled}
              onClick={onToggleDotBackground}
            >
              <span className="desktop-more-switch-knob" />
            </button>
          </div>
        </div>
      </section>

      {/* Default Network */}
      <section className="desktop-more-section desktop-more-section--default-map" aria-label="Default Network">
        <div className="desktop-more-section-header">
          <span className="desktop-status-section-bar bg-logo-blue" aria-hidden="true" />
          <h3 className="desktop-more-section-title">Default Map</h3>
        </div>
        <p className="desktop-more-section-caption">
          <MapPinCheck size={13} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
          <span>Loaded on launch</span>
        </p>
        <div
          className="default-map-mode-options desktop-more-default-map-options"
          role="radiogroup"
          aria-label="Default map network"
          data-network={defaultNetwork}
        >
          <span className="default-map-mode-glider" aria-hidden="true" />
          <button
            type="button"
            className={`default-map-mode-btn default-map-mode-btn-ttc ${defaultNetwork === "ttc" ? "is-selected" : ""}`}
            aria-pressed={defaultNetwork === "ttc"}
            onClick={() => onDefaultNetworkChange("ttc")}
          >
            TTC
          </button>
          <button
            type="button"
            className={`default-map-mode-btn default-map-mode-btn-regional ${defaultNetwork === "regional" ? "is-selected" : ""}`}
            aria-pressed={defaultNetwork === "regional"}
            onClick={() => onDefaultNetworkChange("regional")}
          >
            GO &amp; UP
          </button>
        </div>
      </section>

      {/* Notifications */}
      <section className="desktop-more-section" aria-label="Notifications">
        <div className="desktop-more-section-header">
          <span className="desktop-status-section-bar bg-logo-blue" aria-hidden="true" />
          <h3 className="desktop-more-section-title">Notifications</h3>
        </div>
        <div className="desktop-more-card desktop-more-links-card">
          <button type="button" className="desktop-more-nav-item" onClick={onOpenNotifications}>
            <div className="desktop-more-nav-item-main">
              <Bell size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              <span>Notifications</span>
            </div>
            <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* Navigation & Tools */}
      <section className="desktop-more-section" aria-label="Tools and Guides">
        <div className="desktop-more-section-header">
          <span className="desktop-status-section-bar bg-logo-blue" aria-hidden="true" />
          <h3 className="desktop-more-section-title">Navigation & Tools</h3>
        </div>
        <div className="desktop-more-card desktop-more-links-card">
          <button type="button" className="desktop-more-nav-item" onClick={onOpenAnalytics}>
            <div className="desktop-more-nav-item-main">
              <BarChart3 size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              <span>Reliability Analytics</span>
            </div>
            <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
          </button>
          <button type="button" className="desktop-more-nav-item" onClick={onOpenAlertHistory}>
            <div className="desktop-more-nav-item-main">
              <History size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              <span>Alert History</span>
            </div>
            <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
          </button>
          <button type="button" className="desktop-more-nav-item" onClick={onOpenAccessibilityOutages}>
            <div className="desktop-more-nav-item-main">
              <AccessibilityMenuIcon size={18} />
              <span>Accessibility Outages</span>
            </div>
            <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
          </button>
          <button type="button" className="desktop-more-nav-item" onClick={onOpenSurfaceNotices}>
            <div className="desktop-more-nav-item-main">
              {currentNetwork === "regional" ? (
                <Megaphone size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              ) : (
                <Bus size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              )}
              <span>{currentNetwork === "regional" ? "Service Notices" : "Streetcar & Bus"}</span>
            </div>
            <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
          </button>
          {currentNetwork === "ttc" && onOpenAnnouncements && (
            <button type="button" className="desktop-more-nav-item" onClick={onOpenAnnouncements}>
              <div className="desktop-more-nav-item-main">
                <Megaphone size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
                <span>TTC Announcements</span>
              </div>
              <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
            </button>
          )}
          <button type="button" className="desktop-more-nav-item" onClick={onOpenGuide}>
            <div className="desktop-more-nav-item-main">
              <BookOpen size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              <span>Site Guide</span>
            </div>
            <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* Info & Legal */}
      <section className="desktop-more-section" aria-label="Information and Feedback">
        <div className="desktop-more-section-header">
          <span className="desktop-status-section-bar bg-logo-blue" aria-hidden="true" />
          <h3 className="desktop-more-section-title">About</h3>
        </div>
        <div className="desktop-more-card desktop-more-links-card">
          <button type="button" className="desktop-more-nav-item" onClick={onOpenFeedback}>
            <div className="desktop-more-nav-item-main">
              <MessageSquareText size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              <span>Leave Feedback</span>
            </div>
            <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
          </button>
          {supportUrl ? (
            <a
              href={supportUrl}
              target="_blank"
              rel="noreferrer"
              className="desktop-more-nav-item"
            >
              <div className="desktop-more-nav-item-main">
                <HeartHandshake size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
                <span>Support</span>
              </div>
              <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
            </a>
          ) : null}
          <button type="button" className="desktop-more-nav-item" onClick={onOpenPrivacyAcknowledgements}>
            <div className="desktop-more-nav-item-main">
              <ShieldCheck size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              <span>Privacy & Acknowledgements</span>
            </div>
            <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
          </button>
          <button type="button" className="desktop-more-nav-item" onClick={onOpenReleaseNotes}>
            <div className="desktop-more-nav-item-main">
              <FileText size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              <span>Release Notes</span>
            </div>
            <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
          </button>
          <a href="/explore" className="desktop-more-nav-item">
            <div className="desktop-more-nav-item-main">
              <BookOpen size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              <span>Transit Guides</span>
            </div>
            <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
          </a>
          <button type="button" className="desktop-more-nav-item" onClick={onShareApp}>
            <div className="desktop-more-nav-item-main">
              <Share2 size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              <span>{shareStatusLabel ?? "Share LineWatchTO"}</span>
            </div>
            <ChevronRight size={16} className="desktop-more-nav-item-chevron" aria-hidden="true" />
          </button>
        </div>
      </section>

      <div className="desktop-more-footer">
        <span className="desktop-more-version" aria-label={`App version ${lineWatchAppVersionLabel}`}>
          LineWatchTO {lineWatchAppVersionLabel}
        </span>
      </div>
    </div>
  );
}

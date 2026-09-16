"use client";

import {
  BarChart3,
  Contrast,
  FileText,
  HeartHandshake,
  History,
  LogIn,
  LogOut,
  Megaphone,
  Moon,
  Pause,
  Share2,
  ShieldCheck,
  Sparkles,
  Sun,
  UserPlus,
  UserRound,
  BookOpen,
} from "lucide-react";
import Image from "next/image";
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
}: Props) {
  return (
    <div className="desktop-more-panel" aria-label="Settings and more options">
      {/* Account Section */}
      <section className="desktop-more-section" aria-label="Account">
        <div className="desktop-more-section-header">
          <span className="desktop-status-section-bar" aria-hidden="true" />
          <h3 className="desktop-more-section-title">Account</h3>
        </div>
        <div className="desktop-more-card desktop-more-account-card">
          <div className="desktop-more-account-info">
            <div className="desktop-more-account-avatar">
              <UserRound size={20} aria-hidden="true" />
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

          <div className="desktop-more-account-actions">
            {accountState.authenticated ? (
              <button
                type="button"
                className="desktop-more-btn desktop-more-btn--danger"
                onClick={onSignOut}
                disabled={accountBusy}
              >
                <LogOut size={16} aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            ) : (
              <div className="desktop-more-auth-row">
                <button
                  type="button"
                  className="desktop-more-btn desktop-more-btn--primary"
                  onClick={onRequestSignIn}
                  disabled={accountBusy}
                >
                  <LogIn size={16} aria-hidden="true" />
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  className="desktop-more-btn"
                  onClick={onRequestCreateAccount}
                  disabled={accountBusy}
                >
                  <UserPlus size={16} aria-hidden="true" />
                  <span>Register</span>
                </button>
                <button
                  type="button"
                  className="desktop-more-btn desktop-more-btn--ghost"
                  onClick={onDemoAccount}
                  disabled={accountBusy}
                >
                  <span>Demo</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Preferences & Appearance */}
      <section className="desktop-more-section" aria-label="Appearance & Preferences">
        <div className="desktop-more-section-header">
          <span className="desktop-status-section-bar" aria-hidden="true" />
          <h3 className="desktop-more-section-title">Appearance</h3>
        </div>
        <div className="desktop-more-card">
          <div className="desktop-more-setting-row">
            <div className="desktop-more-setting-label">
              {isDark ? <Moon size={18} aria-hidden="true" /> : <Sun size={18} aria-hidden="true" />}
              <span>Theme</span>
            </div>
            <button
              type="button"
              className="desktop-more-toggle-btn"
              onClick={onToggleTheme}
              aria-label={`Switch to ${isDark ? "light" : "dark"} theme`}
            >
              <span>{isDark ? "Dark" : "Light"}</span>
            </button>
          </div>

          <div className="desktop-more-setting-row">
            <div className="desktop-more-setting-label">
              <Contrast size={18} aria-hidden="true" />
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
              <Pause size={18} aria-hidden="true" />
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
              <Sparkles size={18} aria-hidden="true" />
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
      <section className="desktop-more-section" aria-label="Default Network">
        <div className="desktop-more-section-header">
          <span className="desktop-status-section-bar" aria-hidden="true" />
          <h3 className="desktop-more-section-title">Default Map</h3>
        </div>
        <div className="desktop-more-card">
          <div className="desktop-more-network-pills" role="radiogroup" aria-label="Default map network">
            <button
              type="button"
              role="radio"
              aria-checked={defaultNetwork === "ttc"}
              className={`desktop-more-network-pill ${defaultNetwork === "ttc" ? "active" : ""}`}
              onClick={() => onDefaultNetworkChange("ttc")}
            >
              TTC Subway & LRT
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={defaultNetwork === "regional"}
              className={`desktop-more-network-pill ${defaultNetwork === "regional" ? "active" : ""}`}
              onClick={() => onDefaultNetworkChange("regional")}
            >
              GO & UP Rail
            </button>
          </div>
        </div>
      </section>

      {/* Navigation & Tools */}
      <section className="desktop-more-section" aria-label="Tools and Guides">
        <div className="desktop-more-section-header">
          <span className="desktop-status-section-bar" aria-hidden="true" />
          <h3 className="desktop-more-section-title">Navigation & Tools</h3>
        </div>
        <div className="desktop-more-card desktop-more-links-card">
          <button type="button" className="desktop-more-nav-item" onClick={onOpenAnalytics}>
            <BarChart3 size={18} className="text-purple-500" aria-hidden="true" />
            <span>Reliability Analytics</span>
          </button>
          <button type="button" className="desktop-more-nav-item" onClick={onOpenAlertHistory}>
            <History size={18} className="text-emerald-500" aria-hidden="true" />
            <span>Alert History</span>
          </button>
          <button type="button" className="desktop-more-nav-item" onClick={onOpenAccessibilityOutages}>
            <Image
              src="/assets/linewatch/accessibility-alert.svg"
              alt=""
              width={18}
              height={18}
              className="w-[18px] h-[18px] shrink-0"
            />
            <span>Accessibility Outages</span>
          </button>
          <button type="button" className="desktop-more-nav-item" onClick={onOpenSurfaceNotices}>
            <FileText size={18} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>{currentNetwork === "regional" ? "GO / UP Notices" : "Service Notices"}</span>
          </button>
          {currentNetwork === "ttc" && onOpenAnnouncements && (
            <button type="button" className="desktop-more-nav-item" onClick={onOpenAnnouncements}>
              <Megaphone size={18} className="text-sky-600 dark:text-sky-400" aria-hidden="true" />
              <span>TTC Announcements</span>
            </button>
          )}
          <button type="button" className="desktop-more-nav-item" onClick={onOpenGuide}>
            <BookOpen size={18} className="text-blue-500" aria-hidden="true" />
            <span>Site Guide</span>
          </button>
        </div>
      </section>

      {/* Info & Legal */}
      <section className="desktop-more-section" aria-label="Information and Feedback">
        <div className="desktop-more-section-header">
          <span className="desktop-status-section-bar" aria-hidden="true" />
          <h3 className="desktop-more-section-title">About</h3>
        </div>
        <div className="desktop-more-card desktop-more-links-card">
          <button type="button" className="desktop-more-nav-item" onClick={onOpenFeedback}>
            <HeartHandshake size={18} className="text-rose-500" aria-hidden="true" />
            <span>Feedback & Support</span>
          </button>
          <button type="button" className="desktop-more-nav-item" onClick={onOpenPrivacyAcknowledgements}>
            <ShieldCheck size={18} className="text-teal-500" aria-hidden="true" />
            <span>Privacy & Acknowledgements</span>
          </button>
          <button type="button" className="desktop-more-nav-item" onClick={onOpenReleaseNotes}>
            <FileText size={18} className="text-amber-500" aria-hidden="true" />
            <span>Release Notes</span>
          </button>
          <button type="button" className="desktop-more-nav-item" onClick={onShareApp}>
            <Share2 size={18} className="text-indigo-500" aria-hidden="true" />
            <span>{shareStatusLabel ?? "Share LineWatchTO"}</span>
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

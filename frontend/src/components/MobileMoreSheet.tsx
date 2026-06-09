"use client";

import { BarChart3, LogIn, LogOut, ShieldCheck, UserPlus, UserRound, X } from "lucide-react";
import Image from "next/image";
import type { AccountState } from "../app/account-data";
import type { DashboardData } from "../app/DataContext";
import { LogsDropdown } from "./LogsDropdown";

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
  onToggleHighContrast: () => void;
  onToggleReducedMotion: () => void;
  onOpenAnalytics: () => void;
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
  onToggleHighContrast,
  onToggleReducedMotion,
  onOpenAnalytics,
}: Props) {
  return (
    <section className="mobile-more-sheet panel" aria-label="More LineWatch TO options">
      <div className="mobile-sheet-heading">
        <div className="mobile-more-brand">
          <Image src="/assets/linewatch/logo.svg" alt="" width={28} height={28} aria-hidden="true" />
          <span>
            <p className="mobile-sheet-kicker">LineWatch TO</p>
            <h2>More</h2>
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

        <div className="mobile-more-section">
          <h3>Display</h3>
          <button type="button" className="mobile-more-row" aria-pressed={highContrast} onClick={onToggleHighContrast}>
            <ShieldCheck size={18} />
            High Contrast Mode
            <strong>{highContrast ? "On" : "Off"}</strong>
          </button>
          <button type="button" className="mobile-more-row" aria-pressed={reducedMotion} onClick={onToggleReducedMotion}>
            <ShieldCheck size={18} />
            Reduced Motion
            <strong>{reducedMotion ? "On" : "Off"}</strong>
          </button>
        </div>

        <div className="mobile-more-section">
          <h3>Tools</h3>
          <button type="button" className="mobile-more-row" onClick={onOpenAnalytics}>
            <BarChart3 size={18} />
            Reliability Analytics
          </button>
          <LogsDropdown isMobileMore={true} />
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

"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AlertTriangle, Info, Menu, MoreHorizontal } from "lucide-react";

export const DISCLAIMER_ACK_STORAGE_KEY = "linewatch-disclaimer-ack-v1";

function hasAcknowledgedDisclaimer() {
  try {
    return window.localStorage.getItem(DISCLAIMER_ACK_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function storeDisclaimerAcknowledgement() {
  try {
    window.localStorage.setItem(DISCLAIMER_ACK_STORAGE_KEY, "true");
  } catch {
    // The acknowledgement still dismisses for this page view if storage is unavailable.
  }
}

export function OpeningDisclaimer({
  onVisibilityChange,
  onOpenCreateAccount,
}: {
  onVisibilityChange?: (visible: boolean) => void;
  onOpenCreateAccount?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (!cancelled) {
        const show = !hasAcknowledgedDisclaimer();
        setVisible(show);
        if (onVisibilityChange) {
          onVisibilityChange(show);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [onVisibilityChange]);

  if (!visible) {
    return null;
  }

  const handleAcknowledge = () => {
    storeDisclaimerAcknowledgement();
    setIsExiting(true);
  };

  const handleCreateAccountClick = (event: React.MouseEvent) => {
    event.preventDefault();
    storeDisclaimerAcknowledgement();
    setIsExiting(true);
    if (onOpenCreateAccount) {
      onOpenCreateAccount();
    }
  };

  const handleAnimationEnd = (event: React.AnimationEvent<HTMLElement>) => {
    if (
      isExiting &&
      event.target === event.currentTarget &&
      event.animationName === "opening-disclaimer-modal-exit"
    ) {
      setVisible(false);
      if (onVisibilityChange) {
        onVisibilityChange(false);
      }
    }
  };

  return (
    <div
      className={`opening-disclaimer-backdrop ${isExiting ? "opening-disclaimer-backdrop--exiting" : ""}`}
      role="presentation"
    >
      <section
        aria-describedby="opening-disclaimer-copy"
        aria-label="Unofficial dashboard"
        aria-modal="true"
        className={`opening-disclaimer-panel ${isExiting ? "opening-disclaimer-panel--exiting" : ""}`}
        role="dialog"
        onAnimationEnd={handleAnimationEnd}
      >
        <div className="linewatch-transit-accent-strip opening-disclaimer-strip" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="opening-disclaimer-content">
          <header className="opening-disclaimer-welcome">
            <Image
              className="opening-disclaimer-logo"
              src="/assets/linewatch/logo.svg"
              alt=""
              width={112}
              height={112}
              priority
            />
            <h1>
              <span>Welcome to</span>{" "}
              <strong>LineWatchTO</strong>
            </h1>
            <p>Toronto rapid transit service information, all in one place.</p>
            <div className="opening-disclaimer-nudge">
              <p className="opening-disclaimer-nudge-desktop">
                <button
                  type="button"
                  className="opening-disclaimer-account-link"
                  onClick={handleCreateAccountClick}
                >
                  <span>Create a free account</span>
                </button>{" "}
                to access <strong>all features at no cost</strong>, including real-time commute tracking and push notifications. Sign up with your Google account via the top-left <Menu size={16} className="inline-block align-middle mx-1 text-blue-600 dark:text-blue-400" /> icon or click above. Click the <Info size={16} className="inline-block align-middle mx-0.5 text-blue-600 dark:text-blue-400" /> info button in the top-right of your screen to find out how to use and navigate the app.
              </p>
              <p className="opening-disclaimer-nudge-mobile">
                <button
                  type="button"
                  className="opening-disclaimer-account-link"
                  onClick={handleCreateAccountClick}
                >
                  <span>Create a free account</span>
                </button>{" "}
                to access <strong>all features at no cost</strong>, including real-time commute tracking and push notifications. Sign up with your Google account via the bottom-right More (<MoreHorizontal size={16} className="inline-block align-middle mx-0.5 text-blue-600 dark:text-blue-400" />) button or click above. Click the <Info size={16} className="inline-block align-middle mx-0.5 text-blue-600 dark:text-blue-400" /> info button in the top-right of your screen to find out how to use and navigate the app.
              </p>
            </div>
          </header>
          <div className="station-arrival-line-divider opening-disclaimer-divider" aria-hidden="true" />
          <div className="opening-disclaimer-kicker">
            <AlertTriangle aria-hidden="true" size={18} strokeWidth={2.4} />
            <span>Unofficial dashboard</span>
          </div>
          <p id="opening-disclaimer-copy">
            LineWatchTO is a <strong className="opening-disclaimer-highlight">personal project</strong> that is <strong className="opening-disclaimer-highlight">not affiliated with, endorsed by, or operated by the TTC</strong>. Service alerts are fetched from TTC&apos;s public Live Alerts endpoint when live polling is enabled, with local fixture data used for offline demos and fallback mode.
          </p>
          <button type="button" onClick={handleAcknowledge}>
            I Understand
          </button>
        </div>
      </section>
    </div>
  );
}

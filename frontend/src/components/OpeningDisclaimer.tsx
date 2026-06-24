"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

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

export function OpeningDisclaimer() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(() => {
      if (!cancelled) {
        setVisible(!hasAcknowledgedDisclaimer());
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) {
    return null;
  }

  const handleAcknowledge = () => {
    storeDisclaimerAcknowledgement();
    setVisible(false);
  };

  return (
    <div className="opening-disclaimer-backdrop" role="presentation">
      <section
        aria-describedby="opening-disclaimer-copy"
        aria-label="Unofficial dashboard"
        aria-modal="true"
        className="opening-disclaimer-panel"
        role="dialog"
      >
        <div className="opening-disclaimer-kicker">
          <AlertTriangle aria-hidden="true" size={18} strokeWidth={2.4} />
          <span>Unofficial dashboard</span>
        </div>
        <p id="opening-disclaimer-copy">
          LineWatchTO is a <strong className="opening-disclaimer-highlight">personal project</strong> that is <strong className="opening-disclaimer-highlight">not affiliated with, endorsed by, or operated by the TTC</strong>. I am not affiliated with the TTC in any capacity. Service alerts are fetched from TTC&apos;s public Live Alerts endpoint when live polling is enabled, with local fixture data used for offline demos and fallback mode.
        </p>
        <button type="button" onClick={handleAcknowledge}>
          I Understand
        </button>
      </section>
    </div>
  );
}

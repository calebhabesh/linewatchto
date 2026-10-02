"use client";

import { createContext, startTransition, useContext, useState } from "react";
import { flushSync } from "react-dom";
import type { NetworkId } from "../app/regional-data";

export const NetworkSwitchContext = createContext<NetworkId | null>(null);

export function NetworkSelector({
  network,
  onChange,
  compactVertical = false,
  stretched = false,
  className = "",
  ariaLabel = "Select transit network",
}: {
  network: NetworkId;
  onChange: (network: NetworkId) => void;
  compactVertical?: boolean;
  stretched?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const requestedNetwork = useContext(NetworkSwitchContext);
  const externalNetwork = requestedNetwork ?? network;
  const [choice, setChoice] = useState({ externalNetwork, displayedNetwork: externalNetwork });
  if (choice.externalNetwork !== externalNetwork) {
    setChoice({ externalNetwork, displayedNetwork: externalNetwork });
  }
  const displayedNetwork = choice.externalNetwork === externalNetwork ? choice.displayedNetwork : externalNetwork;
  const chooseNetwork = (next: NetworkId) => {
    // Paint the small control independently of the map's React work.
    flushSync(() => setChoice({ externalNetwork, displayedNetwork: next }));
    startTransition(() => onChange(next));
  };
  return (
    <div
      className={`network-selector panel${compactVertical ? " network-selector--compact-vertical" : ""}${stretched ? " network-selector--stretched" : ""}${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={ariaLabel}
      data-network={displayedNetwork}
    >
      <div className="network-selector-glider" aria-hidden="true" />
      <button
        type="button"
        aria-pressed={displayedNetwork === "ttc"}
        onClick={() => chooseNetwork("ttc")}
        className="network-selector-btn network-btn-ttc"
      >
        <span className="network-indicator-dot network-dot-ttc" aria-hidden="true" />
        <span className="network-btn-text">TTC</span>
        <span className="network-accent-ridges" aria-hidden="true"><span /><span /></span>
      </button>
      <button
        type="button"
        aria-pressed={displayedNetwork === "regional"}
        onClick={() => chooseNetwork("regional")}
        className="network-selector-btn network-btn-regional"
      >
        <span className="network-indicator-dot network-dot-regional" aria-hidden="true" />
        <span className="network-btn-text">GO/UP</span>
        <span className="network-accent-ridges" aria-hidden="true"><span /><span /></span>
      </button>
    </div>
  );
}

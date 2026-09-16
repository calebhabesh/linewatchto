"use client";

import { useEffect, useRef, useState } from "react";
import type { NetworkId } from "../app/regional-data";

const NETWORK_SELECTOR_ANIMATION_MS = 480;

export function NetworkSelector({
  network,
  onChange,
  compactVertical = false,
}: {
  network: NetworkId;
  onChange: (network: NetworkId) => void;
  compactVertical?: boolean;
}) {
  const [pendingNetwork, setPendingNetwork] = useState<NetworkId | null>(null);
  const [lastPropNetwork, setLastPropNetwork] = useState<NetworkId>(network);
  const pendingTargetRef = useRef<NetworkId | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const transitionFrameRef = useRef<number | null>(null);

  if (lastPropNetwork !== network) {
    setLastPropNetwork(network);
    setPendingNetwork(null);
  }

  useEffect(() => {
    pendingTargetRef.current = null;
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    if (transitionFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionFrameRef.current);
      transitionFrameRef.current = null;
    }
  }, [network]);

  const isTransitioning = pendingNetwork !== null && pendingNetwork !== network;
  const displayedNetwork = isTransitioning ? pendingNetwork : network;

  const requestNetworkChange = (nextNetwork: NetworkId) => {
    if (nextNetwork === displayedNetwork || isTransitioning) return;

    pendingTargetRef.current = nextNetwork;
    setPendingNetwork(nextNetwork);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onChange(nextNetwork);
      return;
    }

    // Keep the switch outside the document View Transition capture window.
    // Paint its landed state before handing off to the map swap.
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null;
      transitionFrameRef.current = window.requestAnimationFrame(() => {
        transitionFrameRef.current = window.requestAnimationFrame(() => {
          transitionFrameRef.current = null;
          if (pendingTargetRef.current === nextNetwork) {
            onChange(nextNetwork);
          }
        });
      });
    }, NETWORK_SELECTOR_ANIMATION_MS);
  };

  useEffect(() => () => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
    }
    if (transitionFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionFrameRef.current);
    }
  }, []);

  return (
    <div
      className={`network-selector panel${compactVertical ? " network-selector--compact-vertical" : ""}`}
      role="group"
      aria-label="Select transit network"
      aria-busy={isTransitioning}
      data-network={displayedNetwork}
      data-transitioning={isTransitioning ? "true" : undefined}
    >
      <div className="network-selector-glider" aria-hidden="true" />
      <button
        type="button"
        aria-pressed={displayedNetwork === "ttc"}
        disabled={isTransitioning}
        onClick={() => requestNetworkChange("ttc")}
        className="network-selector-btn network-btn-ttc"
      >
        <span className="network-accent-ridges" aria-hidden="true"><span /><span /></span>
        <span className="network-btn-text">TTC</span>
      </button>
      <button
        type="button"
        aria-pressed={displayedNetwork === "regional"}
        disabled={isTransitioning}
        onClick={() => requestNetworkChange("regional")}
        className="network-selector-btn network-btn-regional"
      >
        <span className="network-accent-ridges" aria-hidden="true"><span /><span /></span>
        <span className="network-btn-text">GO/UP</span>
      </button>
    </div>
  );
}

"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { NetworkId } from "../app/regional-data";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function NetworkSelector({ network, onChange }: { network: NetworkId; onChange: (network: NetworkId) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ttcRef = useRef<HTMLButtonElement>(null);
  const regionalRef = useRef<HTMLButtonElement>(null);

  useIsomorphicLayoutEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current || !ttcRef.current || !regionalRef.current) return;
      const ttcW = ttcRef.current.offsetWidth;
      const regW = regionalRef.current.offsetWidth;
      const equalW = Math.max(ttcW, regW);
      containerRef.current.style.setProperty("--ttc-width", `${equalW}px`);
      containerRef.current.style.setProperty("--regional-width", `${equalW}px`);
      containerRef.current.style.setProperty("--glider-offset", `${equalW + 4}px`);
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    if (ttcRef.current) observer.observe(ttcRef.current);
    if (regionalRef.current) observer.observe(regionalRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="network-selector panel"
      role="group"
      aria-label="Select transit network"
      data-network={network}
    >
      <div className="network-selector-glider" aria-hidden="true" />
      <button
        ref={ttcRef}
        type="button"
        aria-pressed={network === "ttc"}
        onClick={() => onChange("ttc")}
        className="network-selector-btn network-btn-ttc"
      >
        <span className="network-indicator-dot network-dot-ttc" aria-hidden="true" />
        <span className="network-btn-text">TTC</span>
        <span className="network-accent-ridges" aria-hidden="true" />
      </button>
      <button
        ref={regionalRef}
        type="button"
        aria-pressed={network === "regional"}
        onClick={() => onChange("regional")}
        className="network-selector-btn network-btn-regional"
      >
        <span className="network-indicator-dot network-dot-regional" aria-hidden="true" />
        <span className="network-btn-text">GO/UP</span>
        <span className="network-accent-ridges" aria-hidden="true" />
      </button>
    </div>
  );
}




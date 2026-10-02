"use client";

import { useEffect, useRef, useState } from "react";
import { Map } from "lucide-react";
import type { MapViewPreference } from "../app/visual-preferences";

const MAP_VIEW_SELECTOR_ANIMATION_MS = 160;

function EarthViewIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      className="map-view-toggle-icon map-view-toggle-icon--earth"
      aria-hidden="true"
    >
      <circle className="map-view-earth-ocean" cx="12" cy="12" r="10" />
      <g className="map-view-earth-land" strokeLinejoin="round">
        <path d="M4.3 5.6 6.6 3.7 9.1 3 11.5 4.3 10.6 6.4 8.6 7.1 9.3 9.2 8.1 11.1 9.5 12.5 8.5 13.3 6.8 11.2 5.1 10.5 4 8.2Z" />
        <path d="m9.3 13 2.2.2 2.8 1.8-.7 2.4-1.5 1.6-.9 2.6-1.1-1.3-.3-2.7-1.3-2.1Z" />
        <path d="m17 4.4 2.3 1.3 1.6 2.5-2 .8-2.2-.5-.5 1.9 2.2 1.4.5 2-1.5 3-1.4.3-1.3-2.7.3-2.5-1.4-1.6.6-2.3 1.8-.6Z" />
      </g>
      <path className="map-view-earth-shade" d="M18.2 4.2a10 10 0 0 1-14 14A10 10 0 0 0 18.2 4.2Z" />
      <path className="map-view-earth-highlight" d="M5.5 6.1A8.5 8.5 0 0 1 12 3.5" />
    </svg>
  );
}

function SystemMapViewIcon() {
  return (
    <Map size={20} className="map-view-toggle-icon map-view-toggle-icon--system" aria-hidden="true">
      <path className="map-view-system-route map-view-system-route--yellow" d="m6 8 3-1.5 6 3L18 8" />
      <path className="map-view-system-route map-view-system-route--green" d="m6 15 3-1.5 6 3 3-1.5" />
      <path className="map-view-system-route map-view-system-route--purple" d="M12 9v6" />
      <g className="map-view-system-station" strokeWidth="1">
        <circle cx="9" cy="6.5" r="1" />
        <circle cx="12" cy="9" r="1.2" />
        <circle cx="12" cy="15" r="1.2" />
        <circle cx="18" cy="15" r="1" />
      </g>
    </Map>
  );
}

export function MapViewSelector({
  view,
  onChange,
  compactVertical = false,
  className = "",
  disabled = false,
  ariaLabel,
}: {
  view: MapViewPreference;
  onChange: (view: MapViewPreference) => void;
  compactVertical?: boolean;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [pendingView, setPendingView] = useState<MapViewPreference | null>(null);
  const [lastPropView, setLastPropView] = useState<MapViewPreference>(view);
  const transitionTimerRef = useRef<number | null>(null);

  if (lastPropView !== view) {
    setLastPropView(view);
    setPendingView(null);
  }

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  const isTransitioning = pendingView !== null && pendingView !== view;
  const displayedView = isTransitioning ? pendingView : view;
  const nextView: MapViewPreference = displayedView === "diagram" ? "geographic" : "diagram";

  const requestToggle = () => {
    if (isTransitioning || disabled) return;

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onChange(nextView);
      return;
    }

    setPendingView(nextView);
    transitionTimerRef.current = window.setTimeout(() => {
      transitionTimerRef.current = null;
      onChange(nextView);
    }, MAP_VIEW_SELECTOR_ANIMATION_MS);
  };

  const targetTitle =
    displayedView === "diagram"
      ? "Switch to geographic map view"
      : "Switch to schematic system map";

  const buttonAriaLabel = ariaLabel ?? targetTitle;

  if (compactVertical) {
    return (
      <button
        type="button"
        onClick={requestToggle}
        disabled={disabled || isTransitioning}
        className={`map-view-toggle-btn map-view-toggle-btn--compact panel group${className ? ` ${className}` : ""}`}
        title={targetTitle}
        aria-label={buttonAriaLabel}
        data-view={displayedView}
        data-transitioning={isTransitioning ? "true" : undefined}
      >
        {displayedView === "diagram" ? (
          <>
            <EarthViewIcon />
            <span className="map-view-toggle-label text-[9px] font-black uppercase tracking-wider leading-none">
              Map
            </span>
          </>
        ) : (
          <>
            <SystemMapViewIcon />
            <span className="map-view-toggle-label text-[9px] font-black uppercase tracking-wider leading-none">
              System
            </span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={requestToggle}
      disabled={disabled || isTransitioning}
      className={`map-control-button map-view-toggle-btn group${className ? ` ${className}` : ""}`}
      title={targetTitle}
      aria-label={buttonAriaLabel}
      data-view={displayedView}
      data-transitioning={isTransitioning ? "true" : undefined}
    >
      {displayedView === "diagram" ? (
        <>
          <EarthViewIcon />
          <span className="map-view-toggle-label text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            Map View
          </span>
        </>
      ) : (
        <>
          <SystemMapViewIcon />
          <span className="map-view-toggle-label text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            System Map
          </span>
        </>
      )}
    </button>
  );
}

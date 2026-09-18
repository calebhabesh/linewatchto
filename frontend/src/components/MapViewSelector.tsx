"use client";

import { useEffect, useRef, useState } from "react";
import { Earth, Map } from "lucide-react";
import type { MapViewPreference } from "../app/visual-preferences";

const MAP_VIEW_SELECTOR_ANIMATION_MS = 160;

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
            <Earth size={20} className="map-view-toggle-icon" />
            <span className="map-view-toggle-label text-[9px] font-black uppercase tracking-wider leading-none">
              Map
            </span>
          </>
        ) : (
          <>
            <Map size={20} className="map-view-toggle-icon" />
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
          <Earth
            size={20}
            className="map-view-toggle-icon group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
          />
          <span className="map-view-toggle-label text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            Map View
          </span>
        </>
      ) : (
        <>
          <Map
            size={20}
            className="map-view-toggle-icon group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
          />
          <span className="map-view-toggle-label text-[10px] font-black uppercase tracking-widest group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            System Map
          </span>
        </>
      )}
    </button>
  );
}

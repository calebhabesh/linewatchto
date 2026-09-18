"use client";

import { useEffect, useRef, useState } from "react";
import type { MapViewPreference } from "../app/visual-preferences";

const MAP_VIEW_SELECTOR_ANIMATION_MS = 250;

export function MapViewSelector({
  view,
  onChange,
  compactVertical = false,
  className = "",
  disabled = false,
  ariaLabel = "Select map presentation",
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

  const requestViewChange = (nextView: MapViewPreference) => {
    if (nextView === displayedView || isTransitioning || disabled) return;

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

  return (
    <div
      className={`map-view-selector panel${compactVertical ? " map-view-selector--compact-vertical" : ""}${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={ariaLabel}
      aria-busy={isTransitioning}
      data-view={displayedView}
      data-transitioning={isTransitioning ? "true" : undefined}
    >
      <div className="map-view-selector-glider" aria-hidden="true" />
      <button
        type="button"
        aria-pressed={displayedView === "diagram"}
        disabled={disabled || isTransitioning}
        onClick={() => requestViewChange("diagram")}
        className="map-view-selector-btn map-view-btn-diagram"
        title="Schematic transit diagram"
      >
        <span className="map-view-btn-text">Diagram</span>
      </button>
      <button
        type="button"
        aria-pressed={displayedView === "geographic"}
        disabled={disabled || isTransitioning}
        onClick={() => requestViewChange("geographic")}
        className="map-view-selector-btn map-view-btn-geographic"
        title="Geographic street map"
      >
        <span className="map-view-btn-text">Map</span>
      </button>
    </div>
  );
}

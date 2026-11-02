"use client";

import { useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";
import { useFollowedChooserPortal } from "./MapOverlapChooser";
import type { ChooserFollowAnchor, MapChooserFollower } from "./map-chooser-follow";
import { OVERLAP_CHOOSER_MOBILE_BREAKPOINT } from "./map-chooser-layout";
import type { OverlapChooserScreenLayout } from "./map-chooser-placement";
import type { StreetcarCardRow } from "../app/geographic-surface-catalog";

/**
 * What a press on a streetcar line shows: the routes on that street and the
 * schedule period the line is drawn from. Not live service (plan 13, S2).
 */
export function GeographicStreetcarCard({
  rows,
  periodLabel,
  selectionKey,
  layout,
  follower,
  followAnchor,
  viewportSize,
  reducedMotion,
  onClose,
}: {
  rows: StreetcarCardRow[];
  periodLabel: string;
  selectionKey: string | null;
  layout: OverlapChooserScreenLayout;
  follower: MapChooserFollower;
  followAnchor: ChooserFollowAnchor;
  viewportSize: { width: number; height: number };
  reducedMotion: boolean;
  onClose: (restoreFocus: boolean) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const size = { width: layout.width, height: layout.height };
  const { attachPortal, portalStyle } = useFollowedChooserPortal({
    follower,
    followAnchor,
    layout,
    size,
    viewportOrientation: "standard",
    viewportSize,
    reducedMotion,
  });

  // A new map selection replaces the card, as it does the alert chooser.
  const openedWith = useRef(selectionKey);
  useLayoutEffect(() => {
    if (selectionKey && selectionKey !== openedWith.current) onClose(false);
  }, [onClose, selectionKey]);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    const compact = viewportSize.width <= OVERLAP_CHOOSER_MOBILE_BREAKPOINT;
    const animation = reducedMotion ? undefined : surfaceRef.current?.animate([
      { opacity: 0, transform: "scale(0.98)" },
      { opacity: 1, transform: "scale(1)" },
    ], { duration: compact ? 100 : 140, easing: "ease-out" });
    return () => {
      window.cancelAnimationFrame(frame);
      animation?.cancel();
    };
  }, [reducedMotion, viewportSize.width]);

  const title = rows.length === 1 ? "Streetcar Route" : "Streetcar Routes";

  return (
    <div
      ref={attachPortal}
      className="overlap-chooser-portal overlap-chooser-object open"
      style={portalStyle}
      data-streetcar-card
    >
      <div
        ref={surfaceRef}
        className="overlap-chooser-surface streetcar-card-surface"
        style={{ maxHeight: size.height }}
        role="dialog"
        aria-label={`${title}: ${rows.map((row) => `${row.route} ${row.name}`).join(", ")}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          onClose(true);
        }}
      >
        <div className="overlap-chooser-header">
          <div className="overlap-chooser-header-title">
            <strong>{title}</strong>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="overlap-chooser-close"
            aria-label="Close streetcar routes"
            onClick={() => onClose(true)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <ul className="streetcar-card-list">
          {rows.map((row) => (
            <li key={row.route} className="streetcar-card-row" data-streetcar-route={row.route}>
              <span
                className="streetcar-card-badge"
                style={{ backgroundColor: row.color, color: row.textColor }}
                aria-hidden="true"
              >
                {row.route}
              </span>
              <span className="streetcar-card-copy">
                <strong>{row.name}</strong>
                {row.replacementBuses ? (
                  <span className="streetcar-card-note">Some trips run as replacement buses.</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <p className="streetcar-card-source">
          Weekday schedule, {periodLabel}. Not live service.
        </p>
      </div>
    </div>
  );
}

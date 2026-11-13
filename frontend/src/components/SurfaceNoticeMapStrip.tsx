"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { goBusRouteColor, goBusRouteTextColor } from "../app/go-bus-route-colors";
import type { SurfaceNoticeDetail } from "../app/surface-notice-data";
import { ttcRouteBadgeStyle } from "../app/ttc-route-badge";

export function NoticeRouteBadge({ routeId, regional }: { routeId: string; regional: boolean }) {
  return (
    <span
      aria-label={regional ? `GO Bus ${routeId}` : `Route ${routeId}`}
      className="notice-route-badge route-code-badge"
      style={regional
        ? { backgroundColor: goBusRouteColor(routeId), color: goBusRouteTextColor(routeId) }
        : ttcRouteBadgeStyle(routeId)}
    >
      {routeId}
    </span>
  );
}

const STRIP_BADGES = 2;

/**
 * A notice's View on a phone (plan 15, L4): the list has closed to the map, and
 * this names what is selected and goes back to the list. The route badges are
 * the notice's identity in this strip; nothing marks the map.
 */
export function SurfaceNoticeMapStrip({ notice, routeIds, regional, onBack }: {
  notice: SurfaceNoticeDetail;
  routeIds: readonly string[];
  regional: boolean;
  onBack: () => void;
}) {
  const more = routeIds.length - STRIP_BADGES;
  const backRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    // The card's button has gone with the list.
    backRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <aside className="surface-notice-map-strip" data-surface-notice-strip aria-label="Notice shown on map">
      {routeIds.slice(0, STRIP_BADGES).map((routeId) => (
        <NoticeRouteBadge key={routeId} routeId={routeId} regional={regional} />
      ))}
      {more > 0 ? <span className="surface-notice-map-strip-more" aria-label={`and ${more} more ${more === 1 ? "route" : "routes"}`}>+{more}</span> : null}
      <p className="surface-notice-map-strip-title">{notice.title}</p>
      <button
        ref={backRef}
        type="button"
        className="surface-notice-map-strip-back"
        onClick={onBack}
        aria-label={`Back to notices: ${notice.title}`}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        <span>Back</span>
      </button>
    </aside>
  );
}

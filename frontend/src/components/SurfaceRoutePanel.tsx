"use client";

import { useEffect, useRef, useState } from "react";
import type { SurfaceSearchRoute } from "../app/surface-search";
import { streetcarSchedulePeriodLabel } from "../app/geographic-surface-catalog";
import { useMobileDraggableSheet } from "../hooks/useMobileDraggableSheet";
import { MobileSheetDragHandle } from "./MobileSheetDragHandle";
import { StationDetailHeader } from "./StationDetailHeader";
import { surfaceRouteBadgeStyle, surfaceRouteKindLabel } from "./SurfaceSearchResults";

/**
 * A surface route opened from search (plan 14, U3), in the stop panel's
 * place: desktop sidebar, phone sheet. It names the route and the published
 * schedule it comes from, and never says whether it is running. Notices,
 * stops by direction and View on Map come in U5.
 */
export function SurfaceRoutePanel({
  route,
  onClose,
  reducedMotion,
}: {
  route: SurfaceSearchRoute;
  onClose: () => void;
  reducedMotion: boolean;
}) {
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const { sheetRef, isDragging, isExpanded, dragHandleProps, sheetStyle } = useMobileDraggableSheet();

  useEffect(() => () => {
    if (closeTimeoutRef.current !== null) window.clearTimeout(closeTimeoutRef.current);
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    const duration = reducedMotion ? 0 : window.innerWidth < 768 ? 240 : 180;
    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      onClose();
    }, duration);
  };

  const kind = surfaceRouteKindLabel(route);
  const night = route.period.servicePattern === "weekday-night";
  const period = streetcarSchedulePeriodLabel(route.period);

  return (
    <aside
      ref={sheetRef}
      style={sheetStyle}
      className={`station-detail-panel surface-stop-panel surface-route-panel ${isClosing ? "station-detail-closing" : ""} ${isDragging ? "station-detail-sheet-dragging" : ""} fixed left-0 right-0 bottom-0 z-45 max-h-[calc(var(--visual-viewport-height,100dvh)*0.64)] flex flex-col overflow-hidden rounded-t-lg bg-[var(--panel)] pt-1.5 pb-4 px-4 text-slate-900 shadow-2xl dark:text-white md:left-auto md:right-6 md:top-[104px] md:bottom-auto md:w-[min(calc(100vw-48px),460px)] md:max-h-[calc(var(--visual-viewport-height,100dvh)-128px)] md:rounded-none md:p-0 md:bg-transparent md:shadow-none`}
      data-closing={isClosing ? "true" : undefined}
      data-surface-route-panel={`${route.network}:${route.route}`}
      aria-label={`${kind} route ${route.route} ${route.name}`}
      tabIndex={-1}
      data-sheet-expanded={isExpanded ? "true" : undefined}
    >
      <MobileSheetDragHandle dragHandleProps={dragHandleProps} isDragging={isDragging} isExpanded={isExpanded} />
      <StationDetailHeader
        onPointerDown={dragHandleProps.onPointerDown}
        eyebrow={`${kind} Route`}
        stationName={`${route.route} ${route.name}`}
        updating={false}
        onClose={handleClose}
        closeLabel="Close route"
      />
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto mt-2 md:mt-3.5 pb-3 station-detail-scroll">
        <div className="surface-route-panel-summary">
          <span className="surface-stop-route-badge" style={surfaceRouteBadgeStyle(route)} aria-hidden="true">{route.route}</span>
          <p>
            {night ? "Weekday night schedule" : "Weekday schedule"}, {period}. Not live service.
            {route.drawn ? null : " Not on the map: no trips of this route are drawn this schedule period."}
          </p>
        </div>
      </div>
    </aside>
  );
}

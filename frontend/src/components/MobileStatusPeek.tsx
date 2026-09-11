"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Construction, Locate, ArrowRight, TrainFront, Plus, Minus, Clock, ChevronRight, Clock3, Moon } from "lucide-react";
import { reserveSheetMotionBudget } from "./sheet-motion-budget";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { DelayIcon } from "./DelayIcon";
import type { LineStatus } from "../app/linewatch-data";
import type { NetworkId } from "../app/regional-data";
import { dashboardStatusSourceLabel } from "../app/network-presentation";

function BellFilledIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M20,18H4l2-2V10a6,6,0,0,1,5-5.91V3a1,1,0,0,1,2,0V4.09a5.9,5.9,0,0,1,1.3.4A3.992,3.992,0,0,0,18,10v6Zm-8,4a2,2,0,0,0,2-2H10A2,2,0,0,0,12,22ZM18,4a2,2,0,1,0,2,2A2,2,0,0,0,18,4Z" />
    </svg>
  );
}

type CategoryView = "alerts" | "delays" | "reduced-speed-zones" | "closures" | "trip-changes";

export type MobileOperatingNotice = {
  kind: "closing-soon" | "closed";
  title: string;
  details?: string;
  action?: () => void;
};

type Props = {
  children?: ReactNode;
  fresh?: boolean;
  isConnectionIssue?: boolean;
  lineStatuses: LineStatus[];
  activeAlertCount: number;
  delayCount: number;
  reducedSpeedZoneCount: number;
  plannedClosureCount: number;
  tripChangeCount?: number;
  pollText: string;
  dataSource: "backend" | "fallback";
  networkId?: NetworkId;
  operatingNotice?: MobileOperatingNotice | null;
  onOpenStatus: () => void;
  onOpenCategory?: (view: CategoryView) => void;
  onRecenter?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
};

export function MobileStatusPeek({
  children,
  fresh = false,
  isConnectionIssue = false,
  lineStatuses,
  activeAlertCount,
  delayCount,
  reducedSpeedZoneCount,
  plannedClosureCount,
  tripChangeCount = 0,
  pollText,
  dataSource,
  networkId = "ttc",
  operatingNotice = null,
  onOpenStatus,
  onOpenCategory,
  onRecenter,
  onZoomIn,
  onZoomOut,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState<"overview" | "halfway" | "expanded">("overview");
  useEffect(() => {
    // Restore after hydration so server and client initially render the same position.
    const restore = requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem("linewatch-mobile-service-sheet-snap-v1");
        if (saved === "halfway" || saved === "expanded") setSnap(saved);
      } catch { /* Keep Overview if device storage is unavailable. */ }
    });
    return () => cancelAnimationFrame(restore);
  }, []);
  const expanded = snap === "expanded";
  const selectSnap = (next: typeof snap) => {
    setSnap(next);
    try { window.localStorage.setItem("linewatch-mobile-service-sheet-snap-v1", next); } catch { /* Storage may be unavailable. */ }
  };
  const stepSnap = (direction: number) => {
    const points = ["overview", "halfway", "expanded"] as const;
    selectSnap(points[Math.max(0, Math.min(2, points.indexOf(snap) + direction))]);
  };
  const [isDragging, setIsDragging] = useState(false);
  const frame = useRef<number | null>(null);
  const drag = useRef<{ y: number; height: number; currentHeight: number; maximum: number; minimum: number; middle: number; moved: boolean; pointerId: number } | null>(null);
  const suppressClick = useRef(false);
  const releaseMotion = useRef<ReturnType<typeof reserveSheetMotionBudget> | null>(null);
  const finishDrag = (cancelled = false) => {
    const session = drag.current;
    if (!session) return;
    suppressClick.current = session.moved;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (!cancelled && session.moved) {
      selectSnap(session.currentHeight < (session.minimum + session.middle) / 2 ? "overview" : session.currentHeight < (session.middle + session.maximum) / 2 ? "halfway" : "expanded");
    }
    drag.current = null;
    const element = containerRef.current;
    if (element) {
      element.style.transform = "";
      element.style.willChange = "";
    }
    setIsDragging(false);
    releaseMotion.current?.(240);
  };
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    releaseMotion.current?.();
  }, []);
  const impactCount = activeAlertCount + delayCount + reducedSpeedZoneCount + plannedClosureCount + (tripChangeCount ?? 0);
  const categoryCount = [activeAlertCount, delayCount, reducedSpeedZoneCount, plannedClosureCount, tripChangeCount ?? 0]
    .filter((count) => count > 0).length;
  const rawSourceLabel = dashboardStatusSourceLabel(
    { networkId, dataSource },
    pollText,
    "compact",
  );
  const isLive = fresh && !isConnectionIssue;
  const sourceLabel = isLive ? "Live" : isConnectionIssue ? "Cached" : rawSourceLabel;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateHeight = () => {
      const height = el.querySelector<HTMLElement>(".mobile-service-sheet-minimum")?.getBoundingClientRect().height ?? 0;
      if (height > 0) {
        document.documentElement.style.setProperty(
          "--mobile-status-peek-actual-height",
          `${Math.round(height)}px`
        );
      }
    };

    updateHeight();
    el.addEventListener("transitionend", updateHeight);
    window.addEventListener("resize", updateHeight);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateHeight();
      });
      resizeObserver.observe(el);
    }

    return () => {
      resizeObserver?.disconnect();
      el.removeEventListener("transitionend", updateHeight);
      window.removeEventListener("resize", updateHeight);
      document.documentElement.style.removeProperty("--mobile-status-peek-actual-height");
    };
  }, [categoryCount, impactCount, snap, operatingNotice]);

  const titleText = impactCount > 0
    ? `${impactCount} Impact${impactCount === 1 ? "" : "s"}`
    : "No Impacts";

  // Symmetrical 4-item grid: 2x2 layout matching desktop status chips
  const gridItems: Array<{
    key: CategoryView;
    count: number;
    badgeClass: string;
    icon: React.ReactNode;
    full: string;
  }> = networkId === "regional"
    ? [
        {
          key: "alerts",
          count: activeAlertCount,
          badgeClass: "mobile-status-peek-count-badge active-alerts",
          icon: <AlertTriangle size={13} />,
          full: activeAlertCount === 1 ? "Active Alert" : "Active Alerts",
        },
        {
          key: "delays",
          count: delayCount,
          badgeClass: "mobile-status-peek-count-badge delays",
          icon: <DelayIcon size={13} />,
          full: delayCount === 1 ? "Delay" : "Delays",
        },
        {
          key: "trip-changes",
          count: tripChangeCount,
          badgeClass: "mobile-status-peek-count-badge trip-changes",
          icon: <TrainFront size={13} />,
          full: tripChangeCount === 1 ? "Trip Change" : "Trip Changes",
        },
        {
          key: "closures",
          count: plannedClosureCount,
          badgeClass: "mobile-status-peek-count-badge planned-closures",
          icon: <PlannedClosureIcon size={13} />,
          full: plannedClosureCount === 1 ? "Planned Closure" : "Planned Closures",
        },
      ]
    : [
        {
          key: "alerts",
          count: activeAlertCount,
          badgeClass: "mobile-status-peek-count-badge active-alerts",
          icon: <AlertTriangle size={13} />,
          full: activeAlertCount === 1 ? "Active Alert" : "Active Alerts",
        },
        {
          key: "delays",
          count: delayCount,
          badgeClass: "mobile-status-peek-count-badge delays",
          icon: <DelayIcon size={13} />,
          full: delayCount === 1 ? "Delay" : "Delays",
        },
        {
          key: "reduced-speed-zones",
          count: reducedSpeedZoneCount,
          badgeClass: "mobile-status-peek-count-badge reduced-speed-zones",
          icon: <Construction size={13} />,
          full: reducedSpeedZoneCount === 1 ? "Reduced Speed Zone" : "Reduced Speed Zones",
        },
        {
          key: "closures",
          count: plannedClosureCount,
          badgeClass: "mobile-status-peek-count-badge planned-closures",
          icon: <PlannedClosureIcon size={13} />,
          full: plannedClosureCount === 1 ? "Planned Closure" : "Planned Closures",
        },
      ];

  return (
    <>
      {/* Detached map controls (recenter + zoom in/out capsule) on right side */}
      {(onRecenter || onZoomIn || onZoomOut) ? (
        <div className="mobile-map-controls-group" data-map-chooser-keepout>
          {onRecenter ? (
            <button
              type="button"
              className="mobile-status-peek-recenter-btn mobile-map-recenter-btn"
              onClick={onRecenter}
              aria-label="Center map view"
              title="Center map view"
              data-map-chooser-keepout
            >
              <Locate size={18} className="mobile-map-recenter-icon" />
              <span className="sr-only">Center</span>
            </button>
          ) : null}
          {(onZoomIn || onZoomOut) ? (
            <div className="mobile-map-zoom-capsule">
              {onZoomIn ? (
                <button
                  type="button"
                  className="mobile-map-zoom-btn mobile-map-zoom-in"
                  onClick={onZoomIn}
                  aria-label="Zoom in"
                  title="Zoom in"
                >
                  <Plus size={15} strokeWidth={2.5} />
                </button>
              ) : null}
              {onZoomIn && onZoomOut ? <div className="mobile-map-zoom-divider" /> : null}
              {onZoomOut ? (
                <button
                  type="button"
                  className="mobile-map-zoom-btn mobile-map-zoom-out"
                  onClick={onZoomOut}
                  aria-label="Zoom out"
                  title="Zoom out"
                >
                  <Minus size={15} strokeWidth={2.5} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Center Console with centered impacts count above and slim grid of 4 */}
      <div
        ref={containerRef}
        className="mobile-status-peek mobile-service-sheet"
        data-expanded={expanded}
        data-snap={snap}
        data-dragging={isDragging}
        data-category-count={categoryCount}
        data-has-notice={operatingNotice ? "true" : undefined}
        data-map-chooser-keepout
      >
        <div className="mobile-service-sheet-minimum" aria-hidden="true" />
        <div className="mobile-service-sheet-middle" aria-hidden="true" />
        <div className="mobile-service-sheet-drag-zone"
          onClickCapture={event => {
            if (suppressClick.current) {
              event.preventDefault();
              event.stopPropagation();
              suppressClick.current = false;
            }
          }}
          onPointerDown={event => {
            if (event.button !== 0 || drag.current) return;
            suppressClick.current = false;
            (event.target as Element).setPointerCapture(event.pointerId);
            const element = containerRef.current;
            if (!element) return;
            releaseMotion.current?.();
            releaseMotion.current = reserveSheetMotionBudget(element);
            const maximum = element.getBoundingClientRect().height;
            const minimum = element.querySelector<HTMLElement>(".mobile-service-sheet-minimum")!.getBoundingClientRect().height;
            const middle = element.querySelector<HTMLElement>(".mobile-service-sheet-middle")!.getBoundingClientRect().height;
            const offset = new DOMMatrixReadOnly(getComputedStyle(element).transform).m42;
            const height = maximum - offset;
            drag.current = { y: event.clientY, height, currentHeight: height, maximum, minimum, middle, moved: false, pointerId: event.pointerId };
          }}
          onPointerMove={event => {
            const session = drag.current;
            if (!session || session.pointerId !== event.pointerId) return;
            const delta = session.y - event.clientY;
            if (Math.abs(delta) > 5 && !session.moved) {
              session.moved = true;
              setIsDragging(true);
              if (containerRef.current) containerRef.current.style.willChange = "transform";
            }
            if (!session.moved) return;
            session.currentHeight = Math.max(session.minimum, Math.min(session.maximum, session.height + delta));
            if (frame.current === null) {
              frame.current = requestAnimationFrame(() => {
                frame.current = null;
                const latest = drag.current;
                if (latest && containerRef.current) {
                  containerRef.current.style.transform = `translate3d(0, ${latest.maximum - latest.currentHeight}px, 0)`;
                }
              });
            }
          }}
          onPointerUp={() => finishDrag()}
          onPointerCancel={() => finishDrag(true)}
          onLostPointerCapture={() => finishDrag(true)}
        >
        <button
          type="button"
          className="mobile-service-sheet-handle"
          aria-label={expanded ? "Collapse service sheet" : "Expand service sheet"}
          aria-expanded={snap !== "overview"}
          aria-describedby="mobile-service-sheet-position"
          aria-controls="mobile-service-sheet-details"
          onClick={() => {
            if (suppressClick.current) { suppressClick.current = false; return; }
            if (expanded) selectSnap("overview"); else stepSnap(1);
          }}
          onKeyDown={event => {
            if (event.key === "ArrowUp") { event.preventDefault(); stepSnap(1); }
            if (event.key === "ArrowDown") { event.preventDefault(); stepSnap(-1); }
            if (event.key === "Home" || event.key === "Escape") { event.preventDefault(); selectSnap("overview"); }
            if (event.key === "End") { event.preventDefault(); selectSnap("expanded"); }
          }}

        >
          <span id="mobile-service-sheet-position" className="sr-only">Current position: {snap}. Use arrow keys to adjust, Home for Overview, End for Expanded.</span>
          <span className="station-sheet-drag-pill" aria-hidden="true">
            <span className="station-sheet-drag-ridges"><span /><span /><span /></span>
          </span>
        </button>
        {isLive ? (
          <div className="mobile-service-sheet-recessed-badge" aria-label="Live">
            <span className="mobile-service-sheet-led-jewel" aria-hidden="true" />
            <span className="mobile-service-sheet-recessed-text" aria-hidden="true">LIVE</span>
          </div>
        ) : isConnectionIssue ? (
          <div className="mobile-service-sheet-recessed-badge mobile-service-sheet-recessed-badge--cached" aria-label="Cached">
            <Clock size={11} strokeWidth={2.5} className="mobile-service-sheet-badge-icon" aria-hidden="true" />
            <span className="mobile-service-sheet-recessed-text" aria-hidden="true">CACHED</span>
          </div>
        ) : (
          <div className="mobile-service-sheet-recessed-badge mobile-service-sheet-recessed-badge--source" aria-label={`Source: ${sourceLabel}`}>
            <span className="mobile-service-sheet-led-jewel mobile-service-sheet-led-jewel--muted" aria-hidden="true" />
            <span className="mobile-service-sheet-recessed-text" aria-hidden="true">{sourceLabel}</span>
          </div>
        )}
        <div className="mobile-service-sheet-heading">
          <strong>Current Service</strong>
          <button
            type="button"
            className="mobile-status-peek-info-btn"
            onClick={onOpenStatus}
            aria-label="Open current service status"
          >
            <span className="mobile-status-peek-main">
              <span className="mobile-status-peek-title">
                <span
                  className={`mobile-status-peek-alert-icon ${
                    impactCount === 0 ? "mobile-status-peek-alert-icon--muted" : ""
                  }`}
                  aria-hidden="true"
                >
                  <BellFilledIcon size={17} />
                </span>
                <span className="mobile-status-peek-title-text">{titleText}</span>
                <span className="sr-only">{impactCount} Current Impacts</span>
              </span>
              <span className="sr-only">
                Lines covered: {lineStatuses.map((line) => `Line ${line.number}`).join(", ")}
              </span>
            </span>
          </button>
        </div>
        {operatingNotice && (
          <button
            type="button"
            className={`mobile-service-sheet-notice-row mobile-service-sheet-notice-row--${operatingNotice.kind}`}
            onClick={(e) => {
              e.stopPropagation();
              operatingNotice.action?.();
            }}
            aria-label={`${operatingNotice.title}${operatingNotice.details ? ` · ${operatingNotice.details}` : ""}`}
          >
            <span className="mobile-service-sheet-notice-left">
              <span className="mobile-service-sheet-notice-icon" aria-hidden="true">
                {operatingNotice.kind === "closing-soon" ? (
                  <Clock3 size={13} strokeWidth={2.5} />
                ) : (
                  <Moon size={13} strokeWidth={1} fill="currentColor" />
                )}
              </span>
              <strong className="mobile-service-sheet-notice-title">{operatingNotice.title}</strong>
            </span>
            {operatingNotice.details && (
              <span className="mobile-service-sheet-notice-right">
                <span className="mobile-service-sheet-notice-details">{operatingNotice.details}</span>
                <ChevronRight size={12} strokeWidth={2.5} className="mobile-service-sheet-notice-chevron" aria-hidden="true" />
              </span>
            )}
          </button>
        )}
        </div>
        <div className="mobile-status-peek-counts mobile-status-peek-grid" role="toolbar" aria-label="Impact categories">
          {gridItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${item.badgeClass} ${
                item.count === 0 ? "mobile-status-peek-count-badge--empty" : ""
              } cursor-pointer`}
              title={`${item.count} ${item.full}`}
              aria-label={`${item.count} ${item.full}`}
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenCategory) {
                  onOpenCategory(item.key);
                } else {
                  onOpenStatus();
                }
              }}
            >
              <span className="mobile-status-peek-badge-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="mobile-status-peek-count-circle" data-digit-count={item.count >= 10 ? "multiple" : "single"}>
                <span className="mobile-status-peek-count-circle-value">{item.count}</span>
              </span>
              <span className="mobile-status-peek-badge-label">{item.full}</span>
              <ArrowRight size={10} strokeWidth={2.75} className="mobile-status-peek-chevron" aria-hidden="true" />
            </button>
          ))}
        </div>
        <div id="mobile-service-sheet-details" className="mobile-service-sheet-details" inert={snap === "overview" && !isDragging}>
          {children}
        </div>
      </div>
    </>
  );
}

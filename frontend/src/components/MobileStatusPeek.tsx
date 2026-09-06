"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Construction, Locate, ArrowRight, TrainFront, Plus, Minus } from "lucide-react";
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

type Props = {
  lineStatuses: LineStatus[];
  activeAlertCount: number;
  delayCount: number;
  reducedSpeedZoneCount: number;
  plannedClosureCount: number;
  tripChangeCount?: number;
  pollText: string;
  dataSource: "backend" | "fallback";
  networkId?: NetworkId;
  onOpenStatus: () => void;
  onOpenCategory?: (view: CategoryView) => void;
  onRecenter?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
};

export function MobileStatusPeek({
  lineStatuses,
  activeAlertCount,
  delayCount,
  reducedSpeedZoneCount,
  plannedClosureCount,
  tripChangeCount = 0,
  pollText,
  dataSource,
  networkId = "ttc",
  onOpenStatus,
  onOpenCategory,
  onRecenter,
  onZoomIn,
  onZoomOut,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const impactCount = activeAlertCount + delayCount + reducedSpeedZoneCount + plannedClosureCount + (tripChangeCount ?? 0);
  const categoryCount = [activeAlertCount, delayCount, reducedSpeedZoneCount, plannedClosureCount, tripChangeCount ?? 0]
    .filter((count) => count > 0).length;
  const rawSourceLabel = dashboardStatusSourceLabel(
    { networkId, dataSource },
    pollText,
    "compact",
  );
  const isLive = dataSource === "backend" || rawSourceLabel.startsWith("Updated") || rawSourceLabel === "Live";
  const sourceLabel = isLive ? "Live" : rawSourceLabel;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateHeight = () => {
      const height = el.getBoundingClientRect().height;
      if (height > 0) {
        document.documentElement.style.setProperty(
          "--mobile-status-peek-actual-height",
          `${Math.round(height)}px`
        );
      }
    };

    updateHeight();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateHeight();
      });
      resizeObserver.observe(el);
    }

    return () => {
      resizeObserver?.disconnect();
      document.documentElement.style.removeProperty("--mobile-status-peek-actual-height");
    };
  }, [categoryCount, impactCount]);

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
        className="mobile-status-peek"
        data-category-count={categoryCount}
        data-map-chooser-keepout
      >
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
                <BellFilledIcon size={14} />
              </span>
              <span className="mobile-status-peek-title-text">{titleText}</span>
              <span className="sr-only">{impactCount} Current Impacts</span>
            </span>
            {isLive ? (
              <span className="mobile-status-peek-source mobile-status-peek-source--updated">
                <span className="mobile-status-peek-live-dot" aria-hidden="true" />
                <span className="mobile-status-peek-source-text">Live</span>
              </span>
            ) : (
              <span className="mobile-status-peek-source">{sourceLabel}</span>
            )}
            <span className="sr-only">
              Lines covered: {lineStatuses.map((line) => `Line ${line.number}`).join(", ")}
            </span>
          </span>
        </button>

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
      </div>
    </>
  );
}

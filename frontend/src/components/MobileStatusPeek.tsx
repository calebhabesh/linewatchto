"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Construction, Locate, ArrowRight, TrainFront } from "lucide-react";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { DelayIcon } from "./DelayIcon";
import type { LineStatus } from "../app/linewatch-data";
import type { NetworkId } from "../app/regional-data";
import { dashboardStatusSourceLabel } from "../app/network-presentation";

function BellFilledIcon({ size = 12 }: { size?: number }) {
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
  onOpenCategory?: (view: "alerts" | "delays" | "reduced-speed-zones" | "closures" | "trip-changes") => void;
  onRecenter?: () => void;
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
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const impactCount = activeAlertCount + delayCount + reducedSpeedZoneCount + plannedClosureCount + tripChangeCount;
  const categoryCount = [activeAlertCount, delayCount, reducedSpeedZoneCount, plannedClosureCount, tripChangeCount]
    .filter((count) => count > 0).length;
  const sourceLabel = dashboardStatusSourceLabel(
    { networkId, dataSource },
    pollText,
    "compact",
  );

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
    ? `${impactCount} Current Impact${impactCount === 1 ? "" : "s"}`
    : "No Current Impacts";

  return (
    <div ref={containerRef} className="mobile-status-peek" data-category-count={categoryCount} data-map-chooser-keepout>
      <div
        className="mobile-status-peek-info-btn"
        role="button"
        tabIndex={0}
        onClick={onOpenStatus}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenStatus();
          }
        }}
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
              <BellFilledIcon size={18} />
            </span>
            {titleText}
          </span>
          {sourceLabel.startsWith("Updated") ? (
            <span className="mobile-status-peek-source mobile-status-peek-source--updated">
              <span className="mobile-status-peek-live-dot" aria-hidden="true" />
              {sourceLabel}
            </span>
          ) : (
            <span className="mobile-status-peek-source">{sourceLabel}</span>
          )}
          <span className="sr-only">
            Lines covered: {lineStatuses.map((line) => `Line ${line.number}`).join(", ")}
          </span>
        </span>
        <span className="mobile-status-peek-counts">
          {activeAlertCount > 0 ? (
            <span
              role="button"
              tabIndex={0}
              className="mobile-status-peek-count-badge active-alerts cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenCategory) {
                  onOpenCategory("alerts");
                } else {
                  onOpenStatus();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  if (onOpenCategory) {
                    onOpenCategory("alerts");
                  } else {
                    onOpenStatus();
                  }
                }
              }}
            >
              <AlertTriangle size={12} />
              <span>
                <strong className="mobile-status-peek-number">{activeAlertCount}</strong>
                {activeAlertCount === 1 ? "Active Alert" : "Active Alerts"}
              </span>
              <ArrowRight size={11} strokeWidth={2.75} className="mobile-status-peek-chevron" />
            </span>
          ) : null}
          {delayCount > 0 ? (
            <span
              role="button"
              tabIndex={0}
              className="mobile-status-peek-count-badge delays cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenCategory) {
                  onOpenCategory("delays");
                } else {
                  onOpenStatus();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  if (onOpenCategory) {
                    onOpenCategory("delays");
                  } else {
                    onOpenStatus();
                  }
                }
              }}
            >
              <DelayIcon size={12} />
              <span>
                <strong className="mobile-status-peek-number">{delayCount}</strong>
                {delayCount === 1 ? "Delay" : "Delays"}
              </span>
              <ArrowRight size={11} strokeWidth={2.75} className="mobile-status-peek-chevron" />
            </span>
          ) : null}
          {reducedSpeedZoneCount > 0 ? (
            <span
              role="button"
              tabIndex={0}
              className="mobile-status-peek-count-badge reduced-speed-zones cursor-pointer"
              title="Reduced Speed Zones"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenCategory) {
                  onOpenCategory("reduced-speed-zones");
                } else {
                  onOpenStatus();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  if (onOpenCategory) {
                    onOpenCategory("reduced-speed-zones");
                  } else {
                    onOpenStatus();
                  }
                }
              }}
            >
              <Construction size={12} />
              <span>
                <strong className="mobile-status-peek-number">{reducedSpeedZoneCount}</strong>
                {reducedSpeedZoneCount === 1 ? "Reduced Speed Zone" : "Reduced Speed Zones"}
              </span>
              <ArrowRight size={11} strokeWidth={2.75} className="mobile-status-peek-chevron" />
            </span>
          ) : null}
          {plannedClosureCount > 0 ? (
            <span
              role="button"
              tabIndex={0}
              className="mobile-status-peek-count-badge planned-closures cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenCategory) {
                  onOpenCategory("closures");
                } else {
                  onOpenStatus();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  if (onOpenCategory) {
                    onOpenCategory("closures");
                  } else {
                    onOpenStatus();
                  }
                }
              }}
            >
              <PlannedClosureIcon size={12} />
              <span>
                <strong className="mobile-status-peek-number">{plannedClosureCount}</strong>
                {plannedClosureCount === 1 ? "Planned Closure" : "Planned Closures"}
              </span>
              <ArrowRight size={11} strokeWidth={2.75} className="mobile-status-peek-chevron" />
            </span>
          ) : null}
          {tripChangeCount > 0 ? (
            <span
              role="button"
              tabIndex={0}
              className="mobile-status-peek-count-badge trip-changes cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenCategory) {
                  onOpenCategory("trip-changes");
                } else {
                  onOpenStatus();
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  if (onOpenCategory) {
                    onOpenCategory("trip-changes");
                  } else {
                    onOpenStatus();
                  }
                }
              }}
            >
              <TrainFront size={12} />
              <span>
                <strong className="mobile-status-peek-number">{tripChangeCount}</strong>
                {tripChangeCount === 1 ? "Trip Change" : "Trip Changes"}
              </span>
              <ArrowRight size={11} strokeWidth={2.75} className="mobile-status-peek-chevron" />
            </span>
          ) : null}
        </span>
      </div>

      {onRecenter && (
        <button
          type="button"
          className="mobile-status-peek-recenter-btn"
          onClick={onRecenter}
          aria-label="Center map view"
        >
          <Locate size={24} />
          <span>Center<br />Map</span>
        </button>
      )}
    </div>
  );
}

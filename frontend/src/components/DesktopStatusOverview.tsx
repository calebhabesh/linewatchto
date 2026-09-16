"use client";

import Image from "next/image";
import {
  AlertTriangle,
  ArrowRight,
  Bus,
  ChevronRight,
  CircleCheck,
  Clock,
  Construction,
  Megaphone,
  TrainFront,
} from "lucide-react";
import { useDashboardData } from "../app/DataContext";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { TransitLineBadge } from "./TransitLineBadge";
import type { NetworkId } from "../app/regional-data";
import type { ImpactSelection } from "../app/linewatch-data";
import { countReducedSpeedZones } from "../app/reduced-speed-zone-count";
import {
  clearServiceStatusLabel,
  networkStatusKicker,
} from "../app/network-presentation";

type StatusCategory =
  | "line-impacts"
  | "alerts"
  | "delays"
  | "reduced-speed-zones"
  | "closures"
  | "accessibility-outages"
  | "surface-notices"
  | "announcements"
  | "trip-changes";

type Props = {
  pollText?: string;
  dataSource?: "backend" | "fallback";
  networkId?: NetworkId;
  snapshot?: { savedAt: number | null } | null;
  accessibilityOutageCount?: number;
  surfaceNoticeCount?: number;
  tripChangeCount?: number;
  operatingState?: {
    status: "open" | "closed" | "unknown";
    closingSoon: boolean;
    minutesUntilClose: number | null;
    nextCloseLabel: string | null;
    nextResumeLabel: string | null;
  };
  onOpenCategory: (view: StatusCategory, lineId?: string) => void;
  onSelectImpact?: (selection: ImpactSelection) => void;
  onOpenMore?: () => void;
};

export function DesktopStatusOverview({
  pollText = "just now",
  dataSource = "backend",
  networkId = "ttc",
  snapshot,
  accessibilityOutageCount = 0,
  surfaceNoticeCount = 0,
  tripChangeCount = 0,
  operatingState,
  onOpenCategory,
  onSelectImpact,
  onOpenMore,
}: Props) {
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures, lineStatuses } =
    useDashboardData();
  const regional = networkId === "regional";
  const reducedSpeedZoneCount = countReducedSpeedZones(reducedSpeedZones);
  const presentationState = { networkId, dataSource } as const;

  const totalDisruptions = activeAlerts.length + delays.length;
  const isAllClear =
    totalDisruptions === 0 &&
    reducedSpeedZoneCount === 0 &&
    plannedClosures.length === 0;

  // Up to 3 highest-priority disruptions (alerts first, then delays)
  const priorityDisruptions = [
    ...activeAlerts.map((alert) => ({
      id: alert.id,
      lineId: alert.lineId,
      kind: "alert" as const,
      severity: alert.severity,
      title: alert.title || alert.description || "Active Alert",
      selection: { kind: alert.severity === "suspension" ? "suspension" : "alert", id: alert.id } as ImpactSelection,
    })),
    ...delays.map((delay) => ({
      id: delay.id,
      lineId: delay.lineId,
      kind: "delay" as const,
      severity: "delay",
      title: delay.title || delay.description || "Service Delay",
      selection: { kind: "delay", id: delay.id } as ImpactSelection,
    })),
  ].slice(0, 3);

  return (
    <div className="desktop-status-overview" aria-label="System status overview">
      {/* Network Service Summary Card */}
      <section className="desktop-status-summary-card" aria-label="Current status summary">
        <div className="desktop-status-summary-header">
          <div className="desktop-status-summary-meta">
            <span className="desktop-status-kicker">
              <span className="desktop-status-live-dot" aria-hidden="true" />
              <span>{networkStatusKicker(networkId)}</span>
            </span>
            <h2 className="desktop-status-title">System Status</h2>
          </div>
          <span
            className={`desktop-status-state-pill ${
              isAllClear
                ? "desktop-status-state-pill--good"
                : totalDisruptions > 0
                  ? "desktop-status-state-pill--disrupted"
                  : "desktop-status-state-pill--notice"
            }`}
          >
            {isAllClear ? (
              <>
                <CircleCheck size={14} aria-hidden="true" />
                <span>Good Service</span>
              </>
            ) : totalDisruptions > 0 ? (
              <>
                <AlertTriangle size={14} aria-hidden="true" />
                <span>
                  {totalDisruptions} {totalDisruptions === 1 ? "Disruption" : "Disruptions"}
                </span>
              </>
            ) : (
              <>
                <Construction size={14} aria-hidden="true" />
                <span>Planned Work</span>
              </>
            )}
          </span>
        </div>

        <div className="desktop-status-poll desktop-status-poll-row">
          <span>
            {snapshot
              ? snapshot.savedAt ? "Cached updates" : "Current status: Unknown"
              : dataSource === "fallback"
              ? "Current status: Unknown"
              : `Last polled: ${pollText.toLowerCase() === "just now" ? "Just now" : pollText}`}
          </span>
          {onOpenMore && (
            <button
              type="button"
              className="desktop-status-diagnostics-link"
              onClick={onOpenMore}
            >
              Data & diagnostics
            </button>
          )}
        </div>

        {/* Highest-Priority Current Disruptions within summary (up to 3) */}
        {priorityDisruptions.length > 0 && (
          <div className="desktop-status-priority-section desktop-status-priority-list desktop-status-priority-list--embedded">
            {priorityDisruptions.map((item) => (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                className="desktop-status-priority-item"
                onClick={() => {
                  if (item.selection && onSelectImpact) {
                    onSelectImpact(item.selection);
                  } else {
                    onOpenCategory("alerts", item.lineId);
                  }
                }}
              >
                <div className="desktop-status-priority-badge">
                  {item.kind === "alert" ? (
                    <AlertTriangle size={16} className="text-red-500 shrink-0" aria-hidden="true" />
                  ) : (
                    <DelayIcon size={16} className="delay-tone shrink-0" />
                  )}
                </div>
                <div className="desktop-status-priority-content">
                  <span className="desktop-status-priority-title">{item.title}</span>
                </div>
                <ChevronRight size={16} className="text-slate-400 shrink-0" aria-hidden="true" />
              </button>
            ))}
            {activeAlerts.length > 3 && (
              <button
                type="button"
                className="desktop-status-view-all-alerts-btn"
                onClick={() => onOpenCategory("alerts")}
              >
                <span>View all {activeAlerts.length} active alerts</span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </section>

      {/* Operating status banner if closing soon or closed */}
      {operatingState?.closingSoon && operatingState.minutesUntilClose !== null && operatingState.nextCloseLabel && (
        <div className="desktop-status-operating-banner desktop-status-operating-banner--closing" role="status">
          <Clock size={16} className="text-amber-500 shrink-0" aria-hidden="true" />
          <div className="desktop-status-operating-text">
            <strong>Closing Soon ({operatingState.minutesUntilClose}m)</strong>
            <span>Service ends at {operatingState.nextCloseLabel.replace(/^(Today|Tomorrow) /, "")}.</span>
          </div>
        </div>
      )}

      {operatingState?.status === "closed" && (
        <div className="desktop-status-operating-banner desktop-status-operating-banner--closed" role="status">
          <Clock size={16} className="text-purple-400 shrink-0" aria-hidden="true" />
          <div className="desktop-status-operating-text">
            <strong>{regional ? "GO & UP Rail Closed" : "Subway Closed"}</strong>
            <span>Resumes {operatingState.nextResumeLabel ?? "in the morning"}.</span>
          </div>
        </div>
      )}

      {/* Category Counts and Quick Links: Alerts & Notices */}
      <section className="desktop-status-categories-section" aria-label="Alerts and notices">
        <div className="desktop-status-section-header">
          <span className="desktop-status-section-bar bg-logo-blue" aria-hidden="true" />
          <h3 className="desktop-status-section-title">Alerts & Notices</h3>
        </div>
        <div className="desktop-status-categories-grid">
          <button
            type="button"
            className="desktop-status-cat-btn desktop-status-cat-btn--alerts"
            onClick={() => onOpenCategory("alerts")}
            data-count={activeAlerts.length > 0 ? "positive" : "zero"}
          >
            <div className="desktop-status-cat-label-group">
              <div className="desktop-status-cat-icon">
                <AlertTriangle size={17} className="text-red-500 shrink-0" aria-hidden="true" />
              </div>
              <span className="desktop-status-cat-label">Active Alerts</span>
            </div>
            <span
              className="desktop-status-cat-count"
              data-count={activeAlerts.length > 0 ? "positive" : "zero"}
            >
              {activeAlerts.length}
            </span>
          </button>

          <button
            type="button"
            className="desktop-status-cat-btn desktop-status-cat-btn--delays"
            onClick={() => onOpenCategory("delays")}
            data-count={delays.length > 0 ? "positive" : "zero"}
          >
            <div className="desktop-status-cat-label-group">
              <div className="desktop-status-cat-icon">
                <DelayIcon size={17} className="delay-tone shrink-0" />
              </div>
              <span className="desktop-status-cat-label">Delays</span>
            </div>
            <span
              className="desktop-status-cat-count"
              data-count={delays.length > 0 ? "positive" : "zero"}
            >
              {delays.length}
            </span>
          </button>

          {!regional ? (
            <button
              type="button"
              className="desktop-status-cat-btn desktop-status-cat-btn--rsz"
              onClick={() => onOpenCategory("reduced-speed-zones")}
              data-count={reducedSpeedZoneCount > 0 ? "positive" : "zero"}
            >
              <div className="desktop-status-cat-label-group">
                <div className="desktop-status-cat-icon">
                  <Construction size={17} className="rsz-tone shrink-0" />
                </div>
                <span className="desktop-status-cat-label">Speed Zones</span>
              </div>
              <span
                className="desktop-status-cat-count"
                data-count={reducedSpeedZoneCount > 0 ? "positive" : "zero"}
              >
                {reducedSpeedZoneCount}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="desktop-status-cat-btn desktop-status-cat-btn--trip-changes"
              onClick={() => onOpenCategory("trip-changes")}
              data-count={tripChangeCount > 0 ? "positive" : "zero"}
            >
              <div className="desktop-status-cat-label-group">
                <div className="desktop-status-cat-icon">
                  <TrainFront size={17} className="trip-change-tone shrink-0" />
                </div>
                <span className="desktop-status-cat-label">Trip Changes</span>
              </div>
              <span
                className="desktop-status-cat-count"
                data-count={tripChangeCount > 0 ? "positive" : "zero"}
              >
                {tripChangeCount}
              </span>
            </button>
          )}

          <button
            type="button"
            className="desktop-status-cat-btn desktop-status-cat-btn--closures"
            onClick={() => onOpenCategory("closures")}
            data-count={plannedClosures.length > 0 ? "positive" : "zero"}
          >
            <div className="desktop-status-cat-label-group">
              <div className="desktop-status-cat-icon">
                <PlannedClosureIcon size={17} className="text-blue-500 shrink-0" />
              </div>
              <span className="desktop-status-cat-label">Closures</span>
            </div>
            <span
              className="desktop-status-cat-count"
              data-count={plannedClosures.length > 0 ? "positive" : "zero"}
            >
              {plannedClosures.length}
            </span>
          </button>
        </div>

        {/* Informational Collections */}
        <div className="desktop-status-info-row">
          <button
            type="button"
            className="desktop-status-info-btn"
            onClick={() => onOpenCategory("accessibility-outages")}
          >
            <div className="desktop-status-info-main">
              <Image
                src="/assets/linewatch/accessibility-alert.svg"
                alt=""
                width={16}
                height={16}
                className="w-4 h-4 shrink-0"
              />
              <span className="desktop-status-info-label">Accessibility</span>
            </div>
            <span
              className="desktop-status-info-badge"
              data-count={accessibilityOutageCount > 0 ? "positive" : "zero"}
            >
              {accessibilityOutageCount}
            </span>
          </button>

          <button
            type="button"
            className="desktop-status-info-btn"
            onClick={() => onOpenCategory("surface-notices")}
          >
            <div className="desktop-status-info-main">
              {regional ? (
                <Megaphone size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <Bus size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              )}
              <span className="desktop-status-info-label">
                {regional ? "Service Notices" : "Surface Notices"}
              </span>
            </div>
            <span
              className="desktop-status-info-badge"
              data-count={surfaceNoticeCount > 0 ? "positive" : "zero"}
            >
              {surfaceNoticeCount}
            </span>
          </button>

          {!regional && (
            <button
              type="button"
              className="desktop-status-info-btn"
              onClick={() => onOpenCategory("announcements")}
            >
              <div className="desktop-status-info-main">
                <Megaphone size={16} className="text-sky-600 dark:text-sky-400 shrink-0" />
                <span className="desktop-status-info-label">Announcements</span>
              </div>
            </button>
          )}
        </div>
      </section>

      {/* Line Status Section */}
      <section className="desktop-status-lines-section" aria-label="Transit lines status">
        <div className="desktop-status-section-header">
          <span className="desktop-status-section-bar bg-logo-blue" aria-hidden="true" />
          <h3 className="desktop-status-section-title">Line Status</h3>
        </div>
        <div className="desktop-status-lines-list">
          {lineStatuses.map((line) => {
            const lineAlerts = activeAlerts.filter((alert) => alert.lineId === line.id);
            const lineDelays = delays.filter((delay) => delay.lineId === line.id);
            const lineRsz = reducedSpeedZones.filter((zone) => zone.lineId === line.id);
            const lineRszCount = countReducedSpeedZones(lineRsz);
            const lineClosures = plannedClosures.filter((closure) => closure.lineId === line.id);
            const clear =
              lineAlerts.length === 0 &&
              lineDelays.length === 0 &&
              lineRsz.length === 0 &&
              lineClosures.length === 0;

            return (
              <article key={line.id} className="desktop-status-line-card">
                <button
                  type="button"
                  className="desktop-status-line-trigger"
                  onClick={() => onOpenCategory("line-impacts", line.id)}
                  aria-label={`View service impacts for ${line.name}`}
                >
                  <div className="desktop-status-line-main">
                    <TransitLineBadge
                      lineId={line.id}
                      lineNumber={line.number}
                      lineName={line.name}
                      size={30}
                      className="desktop-status-line-badge"
                    />
                    <div className="desktop-status-line-meta">
                      <strong className="desktop-status-line-name">{line.name}</strong>
                      {clear ? (
                        <span
                          className="desktop-status-line-clear-badge"
                          aria-label={clearServiceStatusLabel(presentationState)}
                        >
                          <CircleCheck
                            size={14}
                            strokeWidth={2.5}
                            className="text-emerald-500 dark:text-emerald-400"
                            aria-hidden="true"
                          />
                          <span>Good Service</span>
                        </span>
                      ) : (
                        <div className="desktop-status-line-disruptions">
                          {lineAlerts.length > 0 && (
                            <span className="desktop-status-line-pill desktop-status-line-pill--alerts">
                              <AlertTriangle size={11} className="shrink-0" aria-hidden="true" />
                              <span>{lineAlerts.length} {lineAlerts.length === 1 ? "Alert" : "Alerts"}</span>
                            </span>
                          )}
                          {lineDelays.length > 0 && (
                            <span className="desktop-status-line-pill desktop-status-line-pill--delays">
                              <DelayIcon size={11} className="shrink-0" />
                              <span>{lineDelays.length} {lineDelays.length === 1 ? "Delay" : "Delays"}</span>
                            </span>
                          )}
                          {lineRsz.length > 0 && (
                            <span className="desktop-status-line-pill desktop-status-line-pill--rsz">
                              <Construction size={11} className="shrink-0" />
                              <span>{lineRszCount} {lineRszCount === 1 ? "Speed Zone" : "Speed Zones"}</span>
                            </span>
                          )}
                          {lineClosures.length > 0 && (
                            <span className="desktop-status-line-pill desktop-status-line-pill--closures">
                              <PlannedClosureIcon size={11} className="shrink-0" />
                              <span>{lineClosures.length} {lineClosures.length === 1 ? "Closure" : "Closures"}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={18} className="desktop-status-line-chevron" aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

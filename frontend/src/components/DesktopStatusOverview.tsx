"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  ArrowRight,
  Bus,
  ChevronRight,
  Clock,
  Construction,
  Megaphone,
  TrainFront,
} from "lucide-react";
import { useDashboardData } from "../app/DataContext";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { TransitLineBadge } from "./TransitLineBadge";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { SurfaceCategoryIcon } from "./SurfaceCategoryIcon";
import type { NetworkId } from "../app/regional-data";
import type { ImpactSelection } from "../app/linewatch-data";
import type { SurfaceNoticeResponse, SurfaceNoticeDetail } from "../app/surface-notice-data";
import { countReducedSpeedZones } from "../app/reduced-speed-zone-count";
import {
  currentServiceSummary,
  currentSurfaceNotices,
  getCanonicalAlertTitle,
} from "../app/current-service";
import { dashboardStatusSourceLabel } from "../app/network-presentation";

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
  surfaceNotices?: SurfaceNoticeResponse | null;
  operatingState?: {
    status: "open" | "closed" | "unknown";
    closingSoon: boolean;
    minutesUntilClose: number | null;
    nextCloseLabel: string | null;
    nextResumeLabel: string | null;
  };
  onOpenCategory: (view: StatusCategory, lineId?: string) => void;
  onSelectImpact?: (selection: ImpactSelection) => void;
  onSelectSurfaceNotice?: (notice: SurfaceNoticeDetail) => void;
};

const noticeLabels: Record<string, string> = {
  "no-service": "No Service",
  detour: "Detour",
  bypass: "Bypass",
  "service-change": "Service Change",
};

export function DesktopStatusOverview({
  pollText = "just now",
  dataSource = "backend",
  networkId = "ttc",
  snapshot,
  accessibilityOutageCount = 0,
  surfaceNoticeCount = 0,
  tripChangeCount = 0,
  surfaceNotices = null,
  operatingState,
  onOpenCategory,
  onSelectImpact,
  onSelectSurfaceNotice,
}: Props) {
  const dashboardData = useDashboardData();
  const {
    activeAlerts,
    delays,
    reducedSpeedZones,
    plannedClosures,
    lineStatuses,
    generatedAt,
    availability,
  } = dashboardData;

  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const regional = networkId === "regional";
  const reducedSpeedZoneCount = countReducedSpeedZones(reducedSpeedZones);

  const isLive =
    !snapshot &&
    dataSource === "backend" &&
    availability !== "fixture" &&
    availability !== "unavailable" &&
    generatedAt?.live !== false;

  const rawSourceLabel = dashboardStatusSourceLabel(
    { networkId, dataSource },
    pollText,
    "compact",
  );
  const cachedLabel = snapshot?.savedAt ? "Cached" : "Unknown";
  const sourceLabel = isLive
    ? "Live"
    : snapshot || dataSource === "fallback" || availability === "fixture" || availability === "unavailable"
    ? cachedLabel
    : rawSourceLabel;

  const summary = currentServiceSummary(dashboardData, now);
  const activeCount = summary.rows.length;

  const affectedLineIds = new Set(summary.rows.map((r) => r.lineId));
  const qualifyingLines = lineStatuses
    .map((line) => ({
      line,
      rows: summary.rows.filter((r) => r.lineId === line.id),
    }))
    .filter((item) => item.rows.length > 0);

  const remainingLines = lineStatuses.filter((line) => !affectedLineIds.has(line.id));

  const surfaceRows =
    surfaceNotices?.fresh && now > 0
      ? currentSurfaceNotices(surfaceNotices.notices, now)
      : [];
  const displayedNotices = surfaceRows.slice(0, 3);
  const remainingNoticeCount = surfaceRows.length - displayedNotices.length;

  return (
    <div className="desktop-status-overview" aria-label="Current Service status overview">
      {/* Header Row: Current Service + Live pill */}
      <div className="desktop-status-header-row">
        <h2 className="desktop-status-title">Current Service</h2>
        {isLive ? (
          <div className="mobile-service-sheet-recessed-badge" aria-label="Live">
            <span className="mobile-service-sheet-led-jewel" aria-hidden="true" />
            <span className="mobile-service-sheet-recessed-text" aria-hidden="true">
              LIVE
            </span>
          </div>
        ) : snapshot || dataSource === "fallback" || availability === "fixture" || availability === "unavailable" ? (
          <div
            className="mobile-service-sheet-recessed-badge mobile-service-sheet-recessed-badge--cached"
            aria-label={cachedLabel}
          >
            <Clock size={11} strokeWidth={2.5} className="mobile-service-sheet-badge-icon" aria-hidden="true" />
            <span className="mobile-service-sheet-recessed-text" aria-hidden="true">
              {cachedLabel.toUpperCase()}
            </span>
          </div>
        ) : (
          <div
            className="mobile-service-sheet-recessed-badge mobile-service-sheet-recessed-badge--source"
            aria-label={`Source: ${sourceLabel}`}
          >
            <span className="mobile-service-sheet-led-jewel mobile-service-sheet-led-jewel--muted" aria-hidden="true" />
            <span className="mobile-service-sheet-recessed-text" aria-hidden="true">
              {sourceLabel}
            </span>
          </div>
        )}
      </div>

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

      {/* Rail Incidents Overview (imminent within 24h) */}
      <section
        className="desktop-status-rail-section"
        aria-label={regional ? "GO & UP Rail current service" : "Subway & Light Rail current service"}
      >
        <div className="desktop-status-kicker-header">
          <span className="desktop-status-rail-kicker">
            Current alerts, delays & closures starting within 24h
          </span>
        </div>
        <div className="desktop-status-section-header">
          <span className="desktop-status-section-bar bg-logo-blue" aria-hidden="true" />
          <h3 className="desktop-status-section-title">
            {regional ? "GO & UP Rail" : "Subway & Light Rail"}
          </h3>
          <span
            className="current-service-active-count"
            data-count={activeCount > 0 ? "positive" : "zero"}
            data-single-digit={activeCount < 10 ? "true" : "false"}
            aria-label={`${activeCount} rail alerts, delays, and closures`}
          >
            {activeCount}
          </span>
        </div>

        {/* Incident List */}
        {qualifyingLines.length > 0 && (
          <div className="desktop-status-rail-incident-list">
            {qualifyingLines.map((item) => (
              <div className="desktop-status-rail-line-group" key={item.line.id}>
                <button
                  type="button"
                  className="desktop-status-line-badge-btn"
                  onClick={() => onOpenCategory("line-impacts", item.line.id)}
                  aria-label={`View ${item.line.name} line impacts`}
                  title={`View ${item.line.name} line impacts`}
                >
                  <TransitLineBadge
                    lineId={item.line.id}
                    lineNumber={item.line.number}
                    lineName={item.line.name}
                    size={28}
                  />
                </button>
                <div className="desktop-status-rail-impacts">
                  {item.rows.map((row) => {
                    const timingLabel = row.timing
                      ? (row.priority === 2 && !row.timing.startsWith("Starts ") && !row.timing.startsWith("Ends ")
                          ? "Starts "
                          : "") + row.timing
                      : null;
                    return (
                      <button
                        key={`${row.kind}:${row.id}`}
                        type="button"
                        className="desktop-status-incident-row"
                        onClick={() => {
                          if (onSelectImpact) {
                            onSelectImpact({ kind: row.kind, id: row.id });
                          } else {
                            onOpenCategory("alerts", row.lineId);
                          }
                        }}
                      >
                        <div className="desktop-status-incident-header">
                          <strong
                            className="desktop-status-incident-title"
                            data-kind={row.iconKind || row.kind}
                          >
                            <ImpactTypeIcon kind={row.iconKind || row.kind} size={15} />
                            <span>{getCanonicalAlertTitle(row)}</span>
                          </strong>
                        </div>
                        <div className="desktop-status-incident-location">
                          {row.condition} · {row.location}
                        </div>
                        {row.direction && (
                          <div className="desktop-status-incident-direction">{row.direction}</div>
                        )}
                        {timingLabel && (
                          <div className="desktop-status-incident-timing">{timingLabel}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Remaining lines without qualifying incidents */}
        {remainingLines.length > 0 && (
          <div
            className="desktop-status-remaining-group"
            aria-label={
              qualifyingLines.length > 0
                ? "No other imminent alerts on remaining lines"
                : "No imminent alerts"
            }
          >
            <div className="desktop-status-remaining-badges">
              {remainingLines.map((line) => (
                <button
                  key={line.id}
                  type="button"
                  className="desktop-status-line-badge-btn"
                  onClick={() => onOpenCategory("line-impacts", line.id)}
                  aria-label={`View ${line.name} menu`}
                  title={`View ${line.name} menu`}
                >
                  <TransitLineBadge
                    lineId={line.id}
                    lineNumber={line.number}
                    lineName={line.name}
                    size={22}
                  />
                </button>
              ))}
            </div>
            <span className="desktop-status-reassurance-text">
              {qualifyingLines.length > 0 ? "No other imminent alerts" : "No imminent alerts"}
            </span>
          </div>
        )}
      </section>

      {/* Surface Preview Section */}
      <section
        className="desktop-status-surface-section"
        aria-label={regional ? "Service Notices preview" : "Streetcar / Bus Alerts preview"}
      >
        <div className="desktop-status-section-header">
          <span className="desktop-status-section-bar bg-logo-blue" aria-hidden="true" />
          <h3 className="desktop-status-section-title">
            {regional ? "Service Notices" : "Streetcar / Bus Alerts"}
          </h3>
          {surfaceNotices?.fresh && now > 0 && (
            <span
              className="current-service-active-count"
              data-count={surfaceRows.length > 0 ? "positive" : "zero"}
              data-single-digit={surfaceRows.length > 3 ? "false" : Math.min(surfaceRows.length, 3) < 10 ? "true" : "false"}
              aria-label={`${Math.min(surfaceRows.length, 3)} notices shown${
                surfaceRows.length > 3 ? ", more available in all notices" : ""
              }`}
            >
              {Math.min(surfaceRows.length, 3)}
              {surfaceRows.length > 3 ? "+" : ""}
            </span>
          )}
        </div>

        <div className="desktop-status-surface-list">
          {displayedNotices.map((notice) => (
            <button
              key={notice.id}
              type="button"
              className="current-service-notice"
              onClick={() => {
                if (onSelectSurfaceNotice) {
                  onSelectSurfaceNotice(notice);
                } else {
                  onOpenCategory("surface-notices");
                }
              }}
            >
              <span className="current-service-routes">
                {(notice.routeIds.length ? notice.routeIds : [regional ? "GO" : "TTC"]).map(
                  (route) => (
                    <span className="current-service-route" key={route}>
                      {route}
                    </span>
                  ),
                )}
              </span>
              <span className="current-service-notice-copy">
                <strong data-category={notice.category}>
                  <SurfaceCategoryIcon category={notice.category} size={12} className="shrink-0" />
                  {noticeLabels[notice.category] || "Notice"}
                </strong>
                <span className="current-service-notice-text">
                  {notice.location || notice.title}
                </span>
              </span>
            </button>
          ))}

          {displayedNotices.length === 0 && (
            <p className="current-service-empty">
              {!surfaceNotices || (surfaceNotices.fresh && now === 0)
                ? "Loading notices…"
                : surfaceNotices.fresh
                ? "No current notices reported"
                : "Current notices unavailable"}
            </p>
          )}
        </div>

        <button
          type="button"
          className="current-service-all"
          onClick={() => onOpenCategory("surface-notices")}
        >
          {remainingNoticeCount > 0 ? `${remainingNoticeCount} more · ` : ""}
          All {regional ? "service notices" : "streetcar and bus notices"}
          <ArrowRight size={12} aria-hidden="true" />
        </button>
      </section>

      {/* ALERTS & NOTICES Categories */}
      <section className="desktop-status-categories-section" aria-label="Alerts and notices">
        <div className="desktop-status-section-header">
          <span className="desktop-status-section-bar bg-logo-blue" aria-hidden="true" />
          <h3 className="desktop-status-section-title">Alerts & Notices</h3>
        </div>
        <div className="desktop-status-categories-grid">
          <button
            type="button"
            className={`mobile-status-peek-count-badge active-alerts ${
              activeAlerts.length === 0 ? "mobile-status-peek-count-badge--empty" : ""
            } desktop-status-category-capsule`}
            onClick={() => onOpenCategory("alerts")}
            aria-label={`${activeAlerts.length} ${activeAlerts.length === 1 ? "Active Alert" : "Active Alerts"}`}
          >
            <span className="mobile-status-peek-badge-icon" aria-hidden="true">
              <AlertTriangle size={13} />
            </span>
            <span
              className="mobile-status-peek-count-circle"
              data-digit-count={activeAlerts.length >= 10 ? "multiple" : "single"}
            >
              <span className="mobile-status-peek-count-circle-value">{activeAlerts.length}</span>
            </span>
            <span className="mobile-status-peek-badge-label">
              {activeAlerts.length === 1 ? "Active Alert" : "Active Alerts"}
            </span>
            <ArrowRight size={10} strokeWidth={2.75} className="mobile-status-peek-chevron" aria-hidden="true" />
          </button>

          <button
            type="button"
            className={`mobile-status-peek-count-badge delays ${
              delays.length === 0 ? "mobile-status-peek-count-badge--empty" : ""
            } desktop-status-category-capsule`}
            onClick={() => onOpenCategory("delays")}
            aria-label={`${delays.length} ${delays.length === 1 ? "Delay" : "Delays"}`}
          >
            <span className="mobile-status-peek-badge-icon" aria-hidden="true">
              <DelayIcon size={13} />
            </span>
            <span
              className="mobile-status-peek-count-circle"
              data-digit-count={delays.length >= 10 ? "multiple" : "single"}
            >
              <span className="mobile-status-peek-count-circle-value">{delays.length}</span>
            </span>
            <span className="mobile-status-peek-badge-label">
              {delays.length === 1 ? "Delay" : "Delays"}
            </span>
            <ArrowRight size={10} strokeWidth={2.75} className="mobile-status-peek-chevron" aria-hidden="true" />
          </button>

          {!regional ? (
            <button
              type="button"
              className={`mobile-status-peek-count-badge reduced-speed-zones ${
                reducedSpeedZoneCount === 0 ? "mobile-status-peek-count-badge--empty" : ""
              } desktop-status-category-capsule`}
              onClick={() => onOpenCategory("reduced-speed-zones")}
              aria-label={`${reducedSpeedZoneCount} ${
                reducedSpeedZoneCount === 1 ? "Reduced Speed Zone" : "Reduced Speed Zones"
              }`}
            >
              <span className="mobile-status-peek-badge-icon" aria-hidden="true">
                <Construction size={13} />
              </span>
              <span
                className="mobile-status-peek-count-circle"
                data-digit-count={reducedSpeedZoneCount >= 10 ? "multiple" : "single"}
              >
                <span className="mobile-status-peek-count-circle-value">{reducedSpeedZoneCount}</span>
              </span>
              <span className="mobile-status-peek-badge-label">
                {reducedSpeedZoneCount === 1 ? "Reduced Speed Zone" : "Reduced Speed Zones"}
              </span>
              <ArrowRight size={10} strokeWidth={2.75} className="mobile-status-peek-chevron" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className={`mobile-status-peek-count-badge trip-changes ${
                tripChangeCount === 0 ? "mobile-status-peek-count-badge--empty" : ""
              } desktop-status-category-capsule`}
              onClick={() => onOpenCategory("trip-changes")}
              aria-label={`${tripChangeCount} ${
                tripChangeCount === 1 ? "Trip Change" : "Trip Changes"
              }`}
            >
              <span className="mobile-status-peek-badge-icon" aria-hidden="true">
                <TrainFront size={13} />
              </span>
              <span
                className="mobile-status-peek-count-circle"
                data-digit-count={tripChangeCount >= 10 ? "multiple" : "single"}
              >
                <span className="mobile-status-peek-count-circle-value">{tripChangeCount}</span>
              </span>
              <span className="mobile-status-peek-badge-label">
                {tripChangeCount === 1 ? "Trip Change" : "Trip Changes"}
              </span>
              <ArrowRight size={10} strokeWidth={2.75} className="mobile-status-peek-chevron" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            className={`mobile-status-peek-count-badge planned-closures ${
              plannedClosures.length === 0 ? "mobile-status-peek-count-badge--empty" : ""
            } desktop-status-category-capsule`}
            onClick={() => onOpenCategory("closures")}
            aria-label={`${plannedClosures.length} ${
              plannedClosures.length === 1 ? "Planned Closure" : "Planned Closures"
            }`}
          >
            <span className="mobile-status-peek-badge-icon" aria-hidden="true">
              <PlannedClosureIcon size={13} />
            </span>
            <span
              className="mobile-status-peek-count-circle"
              data-digit-count={plannedClosures.length >= 10 ? "multiple" : "single"}
            >
              <span className="mobile-status-peek-count-circle-value">{plannedClosures.length}</span>
            </span>
            <span className="mobile-status-peek-badge-label">
              {plannedClosures.length === 1 ? "Planned Closure" : "Planned Closures"}
            </span>
            <ArrowRight size={10} strokeWidth={2.75} className="mobile-status-peek-chevron" aria-hidden="true" />
          </button>
        </div>

        {/* Secondary Informational Collections */}
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
            <div className="desktop-status-info-end">
              <span
                className="desktop-status-info-badge"
                data-count={accessibilityOutageCount > 0 ? "positive" : "zero"}
              >
                {accessibilityOutageCount}
              </span>
              <ChevronRight size={16} className="desktop-status-info-chevron" aria-hidden="true" />
            </div>
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
            <div className="desktop-status-info-end">
              <span
                className="desktop-status-info-badge"
                data-count={surfaceNoticeCount > 0 ? "positive" : "zero"}
              >
                {surfaceNoticeCount}
              </span>
              <ChevronRight size={16} className="desktop-status-info-chevron" aria-hidden="true" />
            </div>
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
              <div className="desktop-status-info-end">
                <ChevronRight size={16} className="desktop-status-info-chevron" aria-hidden="true" />
              </div>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

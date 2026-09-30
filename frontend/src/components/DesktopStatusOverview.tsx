"use client";

import { IncidentStationSpan } from "./IncidentStationSpan";
import { RegionalIncidentDetails } from "./RegionalIncidentDetails";
import { IncidentTiming } from "./IncidentTiming";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeAlert,
  Bus,
  BusFront,
  ChevronRight,
  Clock,
  Construction,
  Info,
  Megaphone,
  TrainFront,
} from "lucide-react";
import { useDashboardData } from "../app/DataContext";
import { AccessibilityMenuIcon } from "./AccessibilityMenuIcon";
import { DelayIcon } from "./DelayIcon";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { TransitLineBadge } from "./TransitLineBadge";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { GoodServiceCheckIcon } from "./CurrentServicePanel";
import { LineAdvisorySummary, LineServiceStatus } from "./LineServiceStatus";
import { SurfaceCategoryIcon } from "./SurfaceCategoryIcon";
import { IncidentElectricBorder } from "./IncidentElectricBorder";
import { NetworkSelector } from "./NetworkSelector";
import { goNoticeRouteBadgeStyle, goNoticeRouteLabel } from "../app/go-bus-route-colors";
import { surfaceNoticePreviewLocation } from "../app/surface-notice-groups";

import type { NetworkId } from "../app/regional-data";
import type { ImpactSelection } from "../app/linewatch-data";
import { surfaceNoticeServiceLabel, type SurfaceNoticeResponse, type SurfaceNoticeDetail } from "../app/surface-notice-data";
import { countReducedSpeedZones } from "../app/reduced-speed-zone-count";
import {
  currentServiceSummary,
  currentSurfaceNotices,
  currentServiceIncidentPresentation,
  getLineStatusPresentation,
  lineStatusDescription,
  getPlannedClosureCountBadgeLabel,
} from "../app/current-service";

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
  notice?: React.ReactNode;
  onOpenCategory: (view: StatusCategory, lineId?: string) => void;
  onSelectImpact?: (selection: ImpactSelection) => void;
  onSelectSurfaceNotice?: (notice: SurfaceNoticeDetail) => void;
  onNetworkChange?: (network: NetworkId) => void;
};

const noticeLabels: Record<string, string> = {
  "no-service": "No Service",
  detour: "Detour",
  bypass: "Bypass",
  "service-change": "Service Change",
};

export function DesktopStatusOverview({
  dataSource = "backend",
  networkId = "ttc",
  snapshot,
  accessibilityOutageCount = 0,
  surfaceNoticeCount = 0,
  tripChangeCount = 0,
  surfaceNotices = null,
  notice,
  onOpenCategory,
  onSelectImpact,
  onSelectSurfaceNotice,
  onNetworkChange,
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

  const cachedLabel = snapshot?.savedAt ? "Cached" : "Unknown";

  const summary = currentServiceSummary(dashboardData, now);
  const activeCount = summary.rows.length;

  const affectedLineIds = new Set(summary.rows.map((r) => r.lineId));
  const qualifyingLines = lineStatuses
    .map((line) => {
      const rows = summary.rows.filter((r) => r.lineId === line.id);
      const closureCount = (summary.upcoming ?? []).filter((c) => c.lineId === line.id).length;
      const rszCount = countReducedSpeedZones(
        (dashboardData.reducedSpeedZones ?? []).filter((rsz) => rsz.lineId === line.id),
      );
      return {
        line,
        rows,
        closureCount,
        rszCount,
        advisoryCount: closureCount + rszCount,
      };
    })
    .filter((item) => item.rows.length > 0);

  const remainingLines = lineStatuses
    .filter((line) => !affectedLineIds.has(line.id))
    .map((line) => ({
      line,
      presentation: getLineStatusPresentation(line, dashboardData, summary),
      closureCount: (summary.upcoming ?? []).filter((c) => c.lineId === line.id).length,
    }));

  const surfaceRows =
    surfaceNotices?.fresh && now > 0
      ? currentSurfaceNotices(surfaceNotices.notices, now, !regional)
      : [];
  const displayedNotices = surfaceRows.slice(0, 3);
  const remainingNoticeCount = surfaceRows.length - displayedNotices.length;

  return (
    <div className="desktop-status-overview" aria-label="Current Service status overview">
      {onNetworkChange && (
        <div className="desktop-status-network-switcher">
          <NetworkSelector
            network={networkId}
            onChange={onNetworkChange}
            stretched
          />
        </div>
      )}

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
        ) : (
          <div
            className="mobile-service-sheet-recessed-badge mobile-service-sheet-recessed-badge--cached"
            aria-label={cachedLabel}
          >
            <Clock size={11} strokeWidth={2.5} className="mobile-service-sheet-badge-icon" aria-hidden="true" />
            <span className="mobile-service-sheet-recessed-text" aria-hidden="true">
              {cachedLabel.toUpperCase()}
            </span>
          </div>
        )}
      </div>

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
        {notice ? (
          <div className="desktop-status-notice-wrapper">
            {notice}
          </div>
        ) : null}
        <div className="desktop-status-section-header">
          <span className="desktop-status-section-bar bg-logo-blue" aria-hidden="true" />
          <h3 className="desktop-status-section-title">
            <TrainFront size={16} aria-hidden="true" className="shrink-0" />
            <span>{regional ? "GO & UP Rail" : "Subway & Light Rail"}</span>
          </h3>
          <span
            className="current-service-active-count"
            data-count={activeCount > 0 ? "positive" : "zero"}
            data-single-digit={activeCount < 10 ? "true" : "false"}
            aria-label={`${activeCount} rail suspensions, delays, and planned advisories`}
          >
            {activeCount}
          </span>
        </div>

        {/* Incident List */}
        {qualifyingLines.length > 0 && (
          <div className="desktop-status-rail-incident-list">
            {qualifyingLines.map((item) => (
              <div className="desktop-status-rail-line-group" data-has-advisories={item.closureCount > 0 || item.rszCount > 0} key={item.line.id}>
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
                  <div className="desktop-status-rail-impacts-main" data-has-impacts="true">
                    {item.rows.map((row) => {
                      const incident = currentServiceIncidentPresentation(row);
                      const alertKind = row.iconKind || row.kind;
                      return (
                        <IncidentElectricBorder key={`${row.kind}:${row.id}`} kind={alertKind}>
                          <button
                            type="button"
                            className="desktop-status-incident-row"
                            data-impact-kind={alertKind}
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
                                data-kind={alertKind}
                              >
                                <ImpactTypeIcon kind={alertKind} size={16} />
                                <span>{incident.title}</span>
                              </strong>
                            </div>
                            <div className="desktop-status-incident-location">
                              <IncidentStationSpan location={row.location} />
                            </div>
                            {row.direction && (
                              <div className="desktop-status-incident-direction">{row.direction}</div>
                            )}
                            {(incident.timing || row.shuttle) && (
                              <div className="desktop-status-incident-timing">
                                <IncidentTiming timing={incident.timing} target={row.timingTarget} now={now} shuttle={row.shuttle} />
                              </div>
                            )}
                            {regional && <RegionalIncidentDetails row={row} className="desktop-status-incident-timing" />}
                          </button>
                        </IncidentElectricBorder>
                      );
                    })}
                  </div>
                  {(item.closureCount > 0 || item.rszCount > 0) && (
                    <div className="desktop-status-sub-badges">
                      <LineAdvisorySummary count={item.advisoryCount} />
                      {item.closureCount > 0 && (
                        <button
                          type="button"
                          className="desktop-status-badge-incident-button"
                          onClick={() => onOpenCategory("closures", item.line.id)}
                          title={`View ${item.line.name} Planned Advisories`}
                          aria-label={`${item.line.name}: ${getPlannedClosureCountBadgeLabel(item.closureCount)}`}
                        >
                          <span className="desktop-status-planned-pill">
                            <ImpactTypeIcon kind="planned-closure" size={11} />
                            <span>{getPlannedClosureCountBadgeLabel(item.closureCount)}</span>
                          </span>
                        </button>
                      )}
                      {item.rszCount > 0 && (
                        <button
                          type="button"
                          className="desktop-status-badge-incident-button"
                          onClick={() => onOpenCategory("reduced-speed-zones", item.line.id)}
                          title={`View ${item.line.name} Reduced Speed Zones`}
                          aria-label={`${item.line.name}: ${item.rszCount} Reduced Speed ${item.rszCount === 1 ? "Zone" : "Zones"}`}
                        >
                          <span className="desktop-status-rsz-pill">
                            <ImpactTypeIcon kind="reduced-speed-zone" size={11} />
                            <span>
                              {`${item.rszCount} Reduced Speed ${item.rszCount === 1 ? "Zone" : "Zones"}`}
                            </span>
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Remaining lines without qualifying incidents */}
        {remainingLines.length > 0 && (
          <div className="desktop-status-remaining-list">
            {remainingLines.map(({ line, presentation, closureCount }) => (
              <div className="desktop-status-remaining-group" key={line.id}>
                <button
                  type="button"
                  className="desktop-status-remaining-row"
                  onClick={() => onOpenCategory("line-impacts", line.id)}
                  aria-label={`View ${line.name} line impacts: ${lineStatusDescription(presentation)}`}
                  title={`View ${line.name} menu: ${lineStatusDescription(presentation)}`}
                >
                  <div className="desktop-status-line-badge-btn" aria-hidden="true">
                    <TransitLineBadge
                      lineId={line.id}
                      lineNumber={line.number}
                      lineName={line.name}
                      size={28}
                    />
                  </div>
                  <div className="desktop-status-remaining-copy">
                    <div className="desktop-status-remaining-main">
                      {presentation.qualifiers?.length ? (
                        <LineServiceStatus presentation={presentation} />
                      ) : presentation.isNormal ? (
                        <span className="desktop-status-remaining-status desktop-status-remaining-status--normal">
                          <GoodServiceCheckIcon size={16} />
                          <strong>{presentation.label}</strong>
                        </span>
                      ) : presentation.state === "closed" ? (
                        <span className="desktop-status-remaining-status desktop-status-remaining-status--closed">
                          <Info size={16} aria-hidden="true" />
                          <strong>{presentation.label}</strong>
                        </span>
                      ) : (
                        <span className="desktop-status-remaining-status desktop-status-remaining-status--info">
                          <Info size={16} aria-hidden="true" />
                          <span>{presentation.label}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                {(closureCount > 0 || presentation.hasRsz) && (
                  <div className="desktop-status-sub-badges desktop-status-remaining-sub-badges">
                    {closureCount > 0 && (
                      <button
                        type="button"
                        className="desktop-status-badge-incident-button"
                        onClick={() => onOpenCategory("closures", line.id)}
                        title={`View ${line.name} Planned Advisories`}
                        aria-label={`${line.name}: ${getPlannedClosureCountBadgeLabel(closureCount)}`}
                      >
                        <span className="desktop-status-planned-pill">
                          <ImpactTypeIcon kind="planned-closure" size={11} />
                          <span>{getPlannedClosureCountBadgeLabel(closureCount)}</span>
                        </span>
                      </button>
                    )}
                    {presentation.hasRsz && (
                      <button
                        type="button"
                        className="desktop-status-badge-incident-button"
                        onClick={() => onOpenCategory("reduced-speed-zones", line.id)}
                        title={`View ${line.name} Reduced Speed Zones`}
                        aria-label={`${line.name}: ${presentation.rszCount} Reduced Speed ${presentation.rszCount === 1 ? "Zone" : "Zones"}`}
                      >
                        <span className="desktop-status-rsz-pill">
                          <ImpactTypeIcon kind="reduced-speed-zone" size={11} />
                          <span>
                            {`${presentation.rszCount} Reduced Speed ${presentation.rszCount === 1 ? "Zone" : "Zones"}`}
                          </span>
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
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
            <BusFront size={16} aria-hidden="true" className="shrink-0" />
            <span>{regional ? "Service Notices" : "Streetcar / Bus Alerts"}</span>
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
              {notice.routeIds.length ? <span className="current-service-routes">
                {notice.routeIds.map(
                  (route) => (
                    <span
                      className="current-service-route"
                      key={route}
                      style={regional ? goNoticeRouteBadgeStyle(route) : undefined}
                      aria-label={regional ? goNoticeRouteLabel(route) : undefined}
                    >
                      {route}
                    </span>
                  ),
                )}
              </span> : null}
              <span className="current-service-notice-copy" data-category={notice.category}>
                <span className="current-service-notice-heading">
                  <strong data-category={notice.category}>
                    <SurfaceCategoryIcon category={notice.category} size={13} className="shrink-0" />
                    {noticeLabels[notice.category] || "Notice"}
                  </strong>
                  {surfaceNoticeServiceLabel(notice) && <span className="current-service-notice-service">{surfaceNoticeServiceLabel(notice)}</span>}
                </span>
                <span className="current-service-notice-text">
                  {surfaceNoticePreviewLocation(notice, !regional)}
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
      <section className="desktop-status-categories-section" aria-label="All alerts and notices">
        <div className="desktop-status-section-header">
          <span className="desktop-status-section-bar bg-logo-blue" aria-hidden="true" />
          <h3 className="desktop-status-section-title">
            <BadgeAlert size={16} aria-hidden="true" className="shrink-0" />
            <span>All Alerts &amp; Notices</span>
          </h3>
        </div>

        <div className="desktop-status-categories-grid">
          <button
            type="button"
            className={`mobile-status-peek-count-badge active-alerts ${
              activeAlerts.length === 0 ? "mobile-status-peek-count-badge--empty" : ""
            } desktop-status-category-capsule`}
            onClick={() => onOpenCategory("alerts")}
            aria-label={`${activeAlerts.length} ${activeAlerts.length === 1 ? "Suspension" : "Suspensions"}`}
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
              {activeAlerts.length === 1 ? "Suspension" : "Suspensions"}
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
              plannedClosures.length === 1 ? "Planned Advisory" : "Planned Advisories"
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
              {plannedClosures.length === 1 ? "Planned Advisory" : "Planned Advisories"}
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
              <AccessibilityMenuIcon size={18} />
              <span className="desktop-status-info-label">Accessibility Outages</span>
            </div>
            <div className="desktop-status-info-end">
              <span
                className="desktop-status-info-badge desktop-status-info-badge--accessibility"
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
                <Megaphone size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              ) : (
                <Bus size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
              )}
              <span className="desktop-status-info-label">
                {regional ? "Service Notices" : "Streetcar & Bus"}
              </span>
            </div>
            <div className="desktop-status-info-end">
              <span
                className="desktop-status-info-badge desktop-status-info-badge--surface"
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
                <Megaphone size={18} className="text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
                <span className="desktop-status-info-label">TTC Announcements</span>
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

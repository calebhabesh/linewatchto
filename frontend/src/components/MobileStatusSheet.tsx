"use client";

import Image from "next/image";
import { AlertTriangle, ChevronRight, CircleCheck, Construction, Megaphone, X, Bus, TrainFront } from "lucide-react";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { useDashboardData } from "../app/DataContext";
import { DelayIcon } from "./DelayIcon";
import { TransitLineBadge } from "./TransitLineBadge";
import type { NetworkId } from "../app/regional-data";
import { countReducedSpeedZones } from "../app/reduced-speed-zone-count";
import {
  clearServiceStatusLabel,
  networkStatusKicker,
} from "../app/network-presentation";

type StatusCategory = "line-impacts" | "alerts" | "delays" | "reduced-speed-zones" | "closures" | "accessibility-outages" | "surface-notices" | "trip-changes";

type Props = {
  pollText?: string;
  dataSource?: "backend" | "fallback";
  onOpenCategory: (view: StatusCategory, lineId?: string) => void;
  onClose: () => void;
  accessibilityOutageCount?: number;
  surfaceNoticeCount?: number;
  tripChangeCount?: number;
  networkId?: NetworkId;
};

export function MobileStatusSheet({ dataSource = "backend", onOpenCategory, onClose, accessibilityOutageCount = 0, surfaceNoticeCount = 0, tripChangeCount = 0, networkId = "ttc" }: Props) {
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures, lineStatuses } = useDashboardData();
  const regional = networkId === "regional";
  const reducedSpeedZoneCount = countReducedSpeedZones(reducedSpeedZones);
  const presentationState = { networkId, dataSource } as const;

  return (
    <section className="mobile-status-sheet panel" aria-label="Current service status">
      <div className="mobile-sheet-heading">
        <div>
          <p className="mobile-sheet-kicker">
            <span className="mobile-status-sheet-live-blip" aria-hidden="true" />
            <span>{networkStatusKicker(networkId)}</span>
          </p>
          <h2 className="mobile-status-sheet-title">System Status</h2>
        </div>
        <button type="button" className="mobile-sheet-icon-button" onClick={onClose} aria-label="Close status">
          <X size={20} />
        </button>
      </div>

      <div className="mobile-status-content-scroll">
        <div className="mobile-status-section-heading">
          <span
            className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]"
            aria-hidden="true"
          />
          <h3>Alerts</h3>
        </div>
        <div className="mobile-status-actions" aria-label="Service impact categories">
          <button type="button" className="mobile-status-btn-alerts" onClick={() => onOpenCategory("alerts")} data-count={activeAlerts.length > 0 ? "positive" : "zero"}>
            <AlertTriangle size={16} className="text-red-500 dark:text-red-400 shrink-0" />
            <span className="mobile-status-btn-text">Active Alerts</span>
            <span className="mobile-status-btn-circle" data-count={activeAlerts.length > 0 ? "positive" : "zero"}>
              {activeAlerts.length}
            </span>
          </button>
          <button type="button" className="mobile-status-btn-delays" onClick={() => onOpenCategory("delays")} data-count={delays.length > 0 ? "positive" : "zero"}>
            <DelayIcon size={16} className="delay-tone shrink-0" />
            <span className="mobile-status-btn-text">Delays</span>
            <span className="mobile-status-btn-circle" data-count={delays.length > 0 ? "positive" : "zero"}>
              {delays.length}
            </span>
          </button>
          {!regional ? <button type="button" className="mobile-status-btn-rsz" onClick={() => onOpenCategory("reduced-speed-zones")} data-count={reducedSpeedZoneCount > 0 ? "positive" : "zero"}>
            <Construction size={16} className="rsz-tone shrink-0" />
            <span className="mobile-status-btn-text">Reduced Speed Zones</span>
            <span className="mobile-status-btn-circle" data-count={reducedSpeedZoneCount > 0 ? "positive" : "zero"}>
              {reducedSpeedZoneCount}
            </span>
          </button> : null}
          <button type="button" className="mobile-status-btn-closures" onClick={() => onOpenCategory("closures")} data-count={plannedClosures.length > 0 ? "positive" : "zero"}>
            <PlannedClosureIcon size={16} className="text-blue-500 dark:text-blue-400 shrink-0" />
            <span className="mobile-status-btn-text">Planned Closures</span>
            <span className="mobile-status-btn-circle" data-count={plannedClosures.length > 0 ? "positive" : "zero"}>
              {plannedClosures.length}
            </span>
          </button>
          {regional ? <button type="button" className="mobile-status-btn-trip-changes flex items-center justify-between" onClick={() => onOpenCategory("trip-changes")} data-count={tripChangeCount > 0 ? "positive" : "zero"}>
            <TrainFront size={16} className="trip-change-tone shrink-0" />
            <span className="mobile-status-btn-text">Trip Changes</span>
            <span className="mobile-status-btn-circle" data-count={tripChangeCount > 0 ? "positive" : "zero"}>
              {tripChangeCount}
            </span>
          </button> : null}
          <button type="button" className="mobile-status-btn-accessibility flex items-center justify-between" onClick={() => onOpenCategory("accessibility-outages")} data-count={accessibilityOutageCount > 0 ? "positive" : "zero"}>
            <Image
              src="/assets/linewatch/accessibility-alert.svg"
              alt=""
              width={16}
              height={16}
              className="w-4 h-4 shrink-0"
            />
            <span className="mobile-status-btn-text">Accessibility Outages</span>
            <span className="mobile-status-btn-circle" data-count={accessibilityOutageCount > 0 ? "positive" : "zero"}>
              {accessibilityOutageCount}
            </span>
          </button>
          <button type="button" className="mobile-status-btn-surface flex items-center justify-between" onClick={() => onOpenCategory("surface-notices")} data-count={surfaceNoticeCount > 0 ? "positive" : "zero"}>
            {regional ? (
              <Megaphone size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <Bus size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
            <span className="mobile-status-btn-text">{regional ? "Service Notices" : "Streetcar & Bus Notices"}</span>
            <span className="mobile-status-btn-circle" data-count={surfaceNoticeCount > 0 ? "positive" : "zero"}>
              {surfaceNoticeCount}
            </span>
          </button>
        </div>

        <div className="mobile-line-status-list">
          <div className="mobile-status-section-heading">
            <span
              className="w-1 h-4 rounded-full bg-logo-blue shrink-0 shadow-[0_0_4px_rgba(129,201,255,0.35)]"
              aria-hidden="true"
            />
            <h3>Line Status</h3>
          </div>
          {lineStatuses.map((line) => {
            const lineAlerts = activeAlerts.filter((alert) => alert.lineId === line.id);
            const lineDelays = delays.filter((delay) => delay.lineId === line.id);
            const lineRsz = reducedSpeedZones.filter((zone) => zone.lineId === line.id);
            const lineRszCount = countReducedSpeedZones(lineRsz);
            const lineClosures = plannedClosures.filter((closure) => closure.lineId === line.id);
            const clear = lineAlerts.length === 0 && lineDelays.length === 0 && lineRsz.length === 0 && lineClosures.length === 0;

            return (
              <article key={line.id} className="mobile-line-status-row">
                <button
                  type="button"
                  className="mobile-line-status-summary"
                  onClick={() => onOpenCategory("line-impacts", line.id)}
                  aria-label={`View all service impacts for ${line.name}`}
                >
                  <TransitLineBadge lineId={line.id} lineNumber={line.number} lineName={line.name} size={30} className="mobile-line-status-number" />
                  <span className="mobile-line-status-copy">
                    <strong>{line.name}</strong>
                    {clear ? (
                      <span className="mobile-line-status-clear" aria-label={clearServiceStatusLabel(presentationState)}>
                        <CircleCheck size={16} strokeWidth={2.7} aria-hidden="true" />
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight size={20} strokeWidth={2.8} className="mobile-line-status-chevron" aria-hidden="true" />
                </button>
                {!clear ? (
                  <span className="mobile-line-status-impacts" aria-label={`${line.name} impact counts`}>
                    {lineAlerts.length > 0 ? (
                      <span className="mobile-line-status-impact-label mobile-line-status-btn-alerts">
                        <AlertTriangle size={12} className="text-red-500 dark:text-red-400 shrink-0" />
                        <span><span className="mobile-line-status-impact-count">{lineAlerts.length}</span>{lineAlerts.length === 1 ? "Active Alert" : "Active Alerts"}</span>
                      </span>
                    ) : null}
                    {lineDelays.length > 0 ? (
                      <span className="mobile-line-status-impact-label mobile-line-status-btn-delays">
                        <DelayIcon size={12} className="delay-tone shrink-0" />
                        <span><span className="mobile-line-status-impact-count">{lineDelays.length}</span>{lineDelays.length === 1 ? "Delay" : "Delays"}</span>
                      </span>
                    ) : null}
                    {lineRsz.length > 0 ? (
                      <span className="mobile-line-status-impact-label mobile-line-status-btn-rsz">
                        <Construction size={12} className="text-amber-600 dark:text-amber-400 shrink-0" />
                        <span><span className="mobile-line-status-impact-count">{lineRszCount}</span>{lineRszCount === 1 ? "Reduced Speed Zone" : "Reduced Speed Zones"}</span>
                      </span>
                    ) : null}
                    {lineClosures.length > 0 ? (
                      <span className="mobile-line-status-impact-label mobile-line-status-btn-closures">
                        <PlannedClosureIcon size={12} className="text-blue-500 dark:text-blue-400 shrink-0" />
                        <span><span className="mobile-line-status-impact-count">{lineClosures.length}</span>{lineClosures.length === 1 ? "Planned Closure" : "Planned Closures"}</span>
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

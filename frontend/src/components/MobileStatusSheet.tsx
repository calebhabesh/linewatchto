"use client";

import Image from "next/image";
import { AlertTriangle, Calendar, Construction, X, Bus } from "lucide-react";
import { useDashboardData } from "../app/DataContext";
import { DelayIcon } from "./DelayIcon";
import { TransitLineBadge } from "./TransitLineBadge";
import type { NetworkId } from "../app/regional-data";

type StatusCategory = "alerts" | "delays" | "reduced-speed-zones" | "closures" | "accessibility-outages" | "surface-notices";

type Props = {
  pollText: string;
  dataSource: "backend" | "fallback";
  onOpenCategory: (view: StatusCategory) => void;
  onClose: () => void;
  accessibilityOutageCount?: number;
  surfaceNoticeCount?: number;
  networkId?: NetworkId;
};

export function MobileStatusSheet({ pollText, dataSource, onOpenCategory, onClose, accessibilityOutageCount = 0, surfaceNoticeCount = 0, networkId = "ttc" }: Props) {
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures, lineStatuses } = useDashboardData();
  const regional = networkId === "regional";
  const toTitleCase = (str: string) =>
    str.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const sourceLabel = dataSource === "backend"
    ? `Updated ${toTitleCase(pollText)}`
    : regional
      ? "Regional demo data — not live service information."
      : "Backend offline. Fixture mode.";

  return (
    <section className="mobile-status-sheet panel" aria-label="Current service status">
      <div className="mobile-sheet-heading">
        <div>
          <p className="mobile-sheet-kicker">{regional ? "GO & UP regional rail" : "Current TTC rapid transit"}</p>
          <h2>System Status</h2>
          <p>{sourceLabel}</p>
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
          <button type="button" className="mobile-status-btn-alerts" onClick={() => onOpenCategory("alerts")}>
            <AlertTriangle size={16} className="text-red-500 dark:text-red-400 shrink-0" />
            <span className="mobile-status-btn-text">Active Alerts</span>
            <span className="mobile-status-btn-circle">
              {activeAlerts.length}
            </span>
          </button>
          <button type="button" className="mobile-status-btn-delays" onClick={() => onOpenCategory("delays")}>
            <DelayIcon size={16} className="delay-tone shrink-0" />
            <span className="mobile-status-btn-text">Delays</span>
            <span className="mobile-status-btn-circle">
              {delays.length}
            </span>
          </button>
          {!regional ? <button type="button" className="mobile-status-btn-rsz" onClick={() => onOpenCategory("reduced-speed-zones")}>
            <Construction size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="mobile-status-btn-text">Reduced Speed Zones</span>
            <span className="mobile-status-btn-circle">
              {reducedSpeedZones.length}
            </span>
          </button> : null}
          <button type="button" className="mobile-status-btn-closures" onClick={() => onOpenCategory("closures")}>
            <Calendar size={16} className="text-blue-500 dark:text-blue-400 shrink-0" />
            <span className="mobile-status-btn-text">Planned Closures</span>
            <span className="mobile-status-btn-circle">
              {plannedClosures.length}
            </span>
          </button>
          {!regional ? <button type="button" className="mobile-status-btn-accessibility flex items-center justify-between" onClick={() => onOpenCategory("accessibility-outages")}>
            <Image
              src="/assets/linewatch/accessibility-alert.svg"
              alt=""
              width={16}
              height={16}
              className="w-4 h-4 shrink-0"
            />
            <span className="mobile-status-btn-text">Accessibility Outages</span>
            <span className="mobile-status-btn-circle">
              {accessibilityOutageCount}
            </span>
          </button> : null}
          {!regional ? <button type="button" className="mobile-status-btn-surface flex items-center justify-between" onClick={() => onOpenCategory("surface-notices")}>
            <Bus size={16} className="text-slate-500 dark:text-slate-400 shrink-0" />
            <span className="mobile-status-btn-text">Streetcar & Bus Notices</span>
            <span className="mobile-status-btn-circle">
              {surfaceNoticeCount}
            </span>
          </button> : null}
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
            const lineClosures = plannedClosures.filter((closure) => closure.lineId === line.id);
            const clear = lineAlerts.length === 0 && lineDelays.length === 0 && lineRsz.length === 0 && lineClosures.length === 0;

            return (
              <article key={line.id} className="mobile-line-status-row">
                <TransitLineBadge lineId={line.id} lineNumber={line.number} lineName={line.name} size={30} className="mobile-line-status-number" />
                <span className="mobile-line-status-copy">
                  <strong>{line.name}</strong>
                  {clear ? <em>{dataSource === "backend" ? "Good Service" : regional ? "Demo status unavailable" : "Fixture data"}</em> : null}
                  {!clear ? (
                    <span className="mobile-line-status-impacts">
                      {lineAlerts.length > 0 ? (
                        <button type="button" className="mobile-line-status-btn-alerts" onClick={() => onOpenCategory("alerts")}>
                          <AlertTriangle size={12} className="text-red-500 dark:text-red-400 shrink-0" />
                          <span><span className="mobile-line-status-impact-count">{lineAlerts.length}</span>{lineAlerts.length === 1 ? "Active Alert" : "Active Alerts"}</span>
                        </button>
                      ) : null}
                      {lineDelays.length > 0 ? (
                        <button type="button" className="mobile-line-status-btn-delays" onClick={() => onOpenCategory("delays")}>
                          <DelayIcon size={12} className="delay-tone shrink-0" />
                          <span><span className="mobile-line-status-impact-count">{lineDelays.length}</span>{lineDelays.length === 1 ? "Delay" : "Delays"}</span>
                        </button>
                      ) : null}
                      {lineRsz.length > 0 ? (
                        <button type="button" className="mobile-line-status-btn-rsz" onClick={() => onOpenCategory("reduced-speed-zones")}>
                          <Construction size={12} className="text-amber-600 dark:text-amber-400 shrink-0" />
                          <span><span className="mobile-line-status-impact-count">{lineRsz.length}</span>{lineRsz.length === 1 ? "Reduced Speed Zone" : "Reduced Speed Zones"}</span>
                        </button>
                      ) : null}
                      {lineClosures.length > 0 ? (
                        <span className="mobile-line-status-planned-row">
                          <button type="button" className="mobile-line-status-btn-closures" onClick={() => onOpenCategory("closures")}>
                            <Calendar size={12} className="text-blue-500 dark:text-blue-400 shrink-0" />
                            <span><span className="mobile-line-status-impact-count">{lineClosures.length}</span>{lineClosures.length === 1 ? "Planned Closure" : "Planned Closures"}</span>
                          </button>
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

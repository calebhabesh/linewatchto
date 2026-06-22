"use client";

import Image from "next/image";
import { AlertTriangle, Calendar, Construction, X, Bus } from "lucide-react";
import { useDashboardData } from "../app/DataContext";
import { DelayIcon } from "./DelayIcon";

type StatusCategory = "alerts" | "delays" | "reduced-speed-zones" | "closures" | "accessibility-outages" | "surface-notices";

type Props = {
  pollText: string;
  dataSource: "backend" | "fallback";
  onOpenCategory: (view: StatusCategory) => void;
  onClose: () => void;
  accessibilityOutageCount?: number;
  surfaceNoticeCount?: number;
};

export function MobileStatusSheet({ pollText, dataSource, onOpenCategory, onClose, accessibilityOutageCount = 0, surfaceNoticeCount = 0 }: Props) {
  const { activeAlerts, delays, reducedSpeedZones, plannedClosures, lineStatuses } = useDashboardData();
  const toTitleCase = (str: string) =>
    str.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const sourceLabel = dataSource === "backend" ? `Updated ${toTitleCase(pollText)}` : "Backend offline. Fixture mode.";

  return (
    <section className="mobile-status-sheet panel" aria-label="Current service status">
      <div className="mobile-sheet-heading">
        <div>
          <p className="mobile-sheet-kicker">Current TTC rapid transit</p>
          <h2>System Status</h2>
          <p>{sourceLabel}</p>
        </div>
        <button type="button" className="mobile-sheet-icon-button" onClick={onClose} aria-label="Close status">
          <X size={20} />
        </button>
      </div>

      <div className="mobile-status-content-scroll">
        <div className="mobile-status-actions" aria-label="Service impact categories">
          <button type="button" className="mobile-status-btn-alerts" onClick={() => onOpenCategory("alerts")}>
            <AlertTriangle size={16} className="text-red-500 dark:text-red-400 shrink-0" />
            <span className="mobile-status-btn-text">Active Alerts</span>
            <span className="mobile-status-btn-circle bg-red-500/20 text-red-600 dark:text-red-400">
              {activeAlerts.length}
            </span>
          </button>
          <button type="button" className="mobile-status-btn-delays" onClick={() => onOpenCategory("delays")}>
            <DelayIcon size={16} className="delay-tone shrink-0" />
            <span className="mobile-status-btn-text">Delays</span>
            <span className="mobile-status-btn-circle delay-count-badge">
              {delays.length}
            </span>
          </button>
          <button type="button" className="mobile-status-btn-rsz" onClick={() => onOpenCategory("reduced-speed-zones")}>
            <Construction size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="mobile-status-btn-text">Reduced Speed Zones</span>
            <span className="mobile-status-btn-circle rsz-count-badge">
              {reducedSpeedZones.length}
            </span>
          </button>
          <button type="button" className="mobile-status-btn-closures" onClick={() => onOpenCategory("closures")}>
            <Calendar size={16} className="text-blue-500 dark:text-blue-400 shrink-0" />
            <span className="mobile-status-btn-text">Upcoming Closures</span>
            <span className="mobile-status-btn-circle bg-blue-500/20 text-blue-600 dark:text-blue-400">
              {plannedClosures.length}
            </span>
          </button>
          <button type="button" className="mobile-status-btn-accessibility flex items-center justify-between" onClick={() => onOpenCategory("accessibility-outages")}>
            <Image
              src="/assets/linewatch/accessibility-alert.svg"
              alt=""
              width={16}
              height={16}
              className="w-4 h-4 shrink-0"
            />
            <span className="mobile-status-btn-text">Accessibility Outages</span>
            <span className="mobile-status-btn-circle bg-red-500/20 text-red-600 dark:text-red-400">
              {accessibilityOutageCount}
            </span>
          </button>
          <button type="button" className="mobile-status-btn-surface flex items-center justify-between" onClick={() => onOpenCategory("surface-notices")}>
            <Bus size={16} className="text-slate-500 dark:text-slate-400 shrink-0" />
            <span className="mobile-status-btn-text">Streetcar & Bus Notices</span>
            <span className="mobile-status-btn-circle bg-blue-500/20 text-blue-600 dark:text-blue-400">
              {surfaceNoticeCount}
            </span>
          </button>
        </div>

        <div className="mobile-line-status-list">
          {lineStatuses.map((line) => {
            const lineAlerts = activeAlerts.filter((alert) => alert.lineId === line.id);
            const lineDelays = delays.filter((delay) => delay.lineId === line.id);
            const lineRsz = reducedSpeedZones.filter((zone) => zone.lineId === line.id);
            const lineClosures = plannedClosures.filter((closure) => closure.lineId === line.id);
            const clear = lineAlerts.length === 0 && lineDelays.length === 0 && lineRsz.length === 0 && lineClosures.length === 0;

            return (
              <article key={line.id} className="mobile-line-status-row">
                <span
                  className="mobile-line-status-number"
                  style={{ backgroundColor: line.color, color: line.id === "line-1" || line.id === "line-6" ? "#111827" : "#ffffff" }}
                >
                  {line.number}
                </span>
                <span className="mobile-line-status-copy">
                  <strong>{line.name}</strong>
                  {clear ? <em>Good Service</em> : null}
                  {!clear ? (
                    <span className="mobile-line-status-impacts">
                      {lineAlerts.length > 0 ? (
                        <button type="button" className="mobile-line-status-btn-alerts" onClick={() => onOpenCategory("alerts")}>
                          <AlertTriangle size={12} className="text-red-500 dark:text-red-400 shrink-0" />
                          {lineAlerts.length} {lineAlerts.length === 1 ? "Active Alert" : "Active Alerts"}
                        </button>
                      ) : null}
                      {lineDelays.length > 0 ? (
                        <button type="button" className="mobile-line-status-btn-delays" onClick={() => onOpenCategory("delays")}>
                          <DelayIcon size={12} className="delay-tone shrink-0" />
                          {lineDelays.length} {lineDelays.length === 1 ? "Delay" : "Delays"}
                        </button>
                      ) : null}
                      {lineRsz.length > 0 ? (
                        <button type="button" className="mobile-line-status-btn-rsz" onClick={() => onOpenCategory("reduced-speed-zones")}>
                          <Construction size={12} className="text-amber-600 dark:text-amber-400 shrink-0" />
                          {lineRsz.length} {lineRsz.length === 1 ? "Reduced Speed Zone" : "Reduced Speed Zones"}
                        </button>
                      ) : null}
                      {lineClosures.length > 0 ? (
                        <button type="button" className="mobile-line-status-btn-closures" onClick={() => onOpenCategory("closures")}>
                          <Calendar size={12} className="text-blue-500 dark:text-blue-400 shrink-0" />
                          {lineClosures.length} {lineClosures.length === 1 ? "Closure" : "Closures"}
                        </button>
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

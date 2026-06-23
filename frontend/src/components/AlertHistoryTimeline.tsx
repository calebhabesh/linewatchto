"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import {
  getAlertHistory,
  type AlertHistoryIncident,
  type AlertHistoryPeriod,
} from "../app/alert-history-data";
import { formatRelativeImpactTime } from "../app/impact-time";

type Filter = "all" | "alerts" | "clearances";

const PERIODS: Array<{ value: AlertHistoryPeriod; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "alerts", label: "Alerts" },
  { value: "clearances", label: "Clearances" },
];

export function AlertHistoryTimeline() {
  const [period, setPeriod] = useState<AlertHistoryPeriod>("today");
  const [filter, setFilter] = useState<Filter>("all");
  const [history, setHistory] = useState<AlertHistoryIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"backend" | "fallback">("fallback");

  useEffect(() => {
    let cancelled = false;
    getAlertHistory(period).then((result) => {
      if (cancelled) return;
      setHistory(result.data.incidents);
      setSource(result.source);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const visibleIncidents = useMemo(() => {
    if (filter === "clearances") {
      return history.filter((incident) => incident.status === "cleared");
    }
    if (filter === "alerts") {
      return history.filter((incident) => incident.events.some((event) => event.state !== "cleared"));
    }
    return history;
  }, [filter, history]);

  return (
    <section className="alert-history-timeline notification-settings-section" aria-label="Alert history timeline">
      <div className="notification-settings-section-header">
        <h3>Service Alert History</h3>
        <span>{source === "backend" ? "Lifecycle" : "Unavailable"}</span>
      </div>

      <div className="alert-history-controls" aria-label="Alert history filters">
        <div className="alert-history-chip-group" aria-label="History period">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`alert-history-period-chip ${period === option.value ? "active" : ""}`}
              onClick={() => {
                setLoading(true);
                setPeriod(option.value);
              }}
              aria-pressed={period === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="alert-history-chip-group" aria-label="History event type">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`alert-history-filter-chip ${filter === option.value ? "active" : ""}`}
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="notification-settings-message alert-history-loading" role="status">
          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          Loading alert history...
        </p>
      ) : visibleIncidents.length === 0 ? (
        <p className="notification-settings-note alert-history-empty">
          No alert lifecycle events found for this period.
        </p>
      ) : (
        <ol className="alert-history-list">
          {visibleIncidents.map((incident) => (
            <HistoryIncident key={`${incident.alertId}-${incident.clearedAt ?? incident.firstSeenAt ?? incident.title}`} incident={incident} />
          ))}
        </ol>
      )}
    </section>
  );
}

function HistoryIncident({ incident }: { incident: AlertHistoryIncident }) {
  const primaryEvent = incident.events[0];
  const cleared = incident.status === "cleared";
  const time = primaryEvent?.happenedAt ?? incident.clearedAt ?? incident.firstSeenAt ?? "";
  return (
    <li className={`alert-history-item ${cleared ? "alert-history-event-cleared" : "alert-history-event-active"}`}>
      <div className="alert-history-icon" aria-hidden="true">
        {cleared ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      </div>
      <div className="alert-history-content">
        <div className="alert-history-title-row">
          <strong>{incident.title}</strong>
          {time ? <span>{formatRelativeImpactTime(time)}</span> : null}
        </div>
        <p className="alert-history-meta">
          {[
            incident.lineNumber ? `Line ${incident.lineNumber}` : null,
            incident.location || null,
            incident.displayDirection,
            incident.cause,
            incident.source,
          ].filter(Boolean).join(" · ")}
        </p>
        {cleared && incident.durationMinutes !== null ? (
          <p className="alert-history-duration">
            <Clock3 size={13} aria-hidden="true" />
            Cleared after {incident.durationMinutes} min
          </p>
        ) : null}
        <details className="alert-history-details">
          <summary>Lifecycle details</summary>
          <ol>
            {incident.events.map((event) => (
              <li key={event.id}>
                <span>{event.label}</span>
                <time dateTime={event.happenedAt}>{formatRelativeImpactTime(event.happenedAt)}</time>
              </li>
            ))}
          </ol>
        </details>
      </div>
    </li>
  );
}

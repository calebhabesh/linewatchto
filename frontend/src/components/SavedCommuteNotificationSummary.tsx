"use client";

import { Bell, ChevronDown, Info } from "lucide-react";

export function SavedCommuteNotificationSummary({
  onOpenNotificationSettings,
  notificationSummary,
}: {
  onOpenNotificationSettings: () => void;
  notificationSummary?: {
    label: string;
    detail: string;
    tone: "on" | "off" | "unavailable";
  };
}) {
  const summary = notificationSummary || {
    label: "Unavailable",
    detail: "My Commutes alerts and closure reminders",
    tone: "unavailable",
  };

  return (
    <div className="saved-commute-notification-summary">
      <div className="saved-commute-notification-summary-copy">
        <Bell
          size={15}
          className={`shrink-0 ${
            summary.tone === "on"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-slate-400 dark:text-slate-500"
          }`}
          aria-hidden="true"
        />
        <span>
          <strong>Notifications: {summary.label}</strong>
          <em>{summary.detail}</em>
        </span>
      </div>
      <button type="button" onClick={onOpenNotificationSettings}>
        Manage
      </button>
    </div>
  );
}

export function MonitoredRoutesDisclaimer({
  expanded,
  onToggle,
  contentId,
  message,
}: {
  expanded: boolean;
  onToggle: () => void;
  contentId: string;
  message: string;
}) {
  return (
    <div className="saved-commute-routing-boundary-disclosure">
      <button
        type="button"
        className="saved-commute-routing-boundary-trigger"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={onToggle}
        style={{
          alignItems: "center",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          width: "100%",
        }}
      >
        <span
          className="saved-commute-routing-boundary-label"
          style={{ alignItems: "center", display: "inline-flex" }}
        >
          <Info size={11} aria-hidden="true" />
          <span>Monitored Routes Disclaimer</span>
        </span>
        <ChevronDown className={expanded ? "is-open" : undefined} size={12} aria-hidden="true" />
      </button>
      {expanded ? <p id={contentId}>{message}</p> : null}
    </div>
  );
}

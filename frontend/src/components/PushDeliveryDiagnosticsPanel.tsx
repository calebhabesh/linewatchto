"use client";

import { useCallback, useMemo, useState, type SyntheticEvent } from "react";
import { Activity, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import {
  getPushDeliveryDiagnostics,
  type AccountState,
  type PushDeliveryDiagnostic,
} from "../app/account-data";

const LINE_COLORS: Record<string, string> = {
  "line-1": "#FBD13F",
  "line-2": "#00843D",
  "line-4": "#B241A1",
  "line-5": "#F58220",
  "line-6": "#969594",
};

const DIAGNOSTIC_STAGE_LABELS: Record<string, string> = {
  push_received: "Push received",
  displayed_acknowledged: "Display ack",
  ack_failed: "Ack failed",
  show_failed: "Display failed",
  notification_click: "Clicked",
  notification_close: "Closed",
  pending_skipped: "Skipped stale",
  fallback_shown: "Fallback shown",
};

type DiagnosticsLoadState = "idle" | "loading" | "backend" | "unavailable";

type Props = {
  accountState: AccountState;
};

function formatDiagnosticTimestamp(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function diagnosticStageLabel(stage: string) {
  return DIAGNOSTIC_STAGE_LABELS[stage] ?? stage.replaceAll("_", " ");
}

function diagnosticOutcome(delivery: PushDeliveryDiagnostic) {
  if (delivery.displayedAt) return "Displayed";
  if (delivery.clientEvents.some((event) => event.stage === "show_failed")) return "Display failed";
  if (delivery.clientEvents.some((event) => event.stage === "ack_failed")) return "Ack failed";
  if (delivery.clientEvents.some((event) => event.stage === "push_received")) return "Received";
  return delivery.deliveryStatus || "Queued";
}

export function PushDeliveryDiagnosticsPanel({ accountState }: Props) {
  const [open, setOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PushDeliveryDiagnostic[]>([]);
  const [diagnosticsState, setDiagnosticsState] = useState<DiagnosticsLoadState>("idle");
  const [diagnosticsMessage, setDiagnosticsMessage] = useState<string | null>(null);

  const loadDiagnostics = useCallback(async () => {
    if (!accountState.authenticated) {
      setDiagnostics([]);
      setDiagnosticsState("idle");
      setDiagnosticsMessage(null);
      return;
    }

    setDiagnosticsState("loading");
    const result = await getPushDeliveryDiagnostics();
    setDiagnostics(result.deliveries);
    setDiagnosticsState(result.source);
    setDiagnosticsMessage(result.message ?? null);
  }, [accountState.authenticated]);

  const handleToggle = useCallback((event: SyntheticEvent<HTMLDetailsElement>) => {
    const nextOpen = event.currentTarget.open;
    setOpen(nextOpen);
    if (nextOpen && diagnosticsState === "idle") {
      void loadDiagnostics();
    }
  }, [diagnosticsState, loadDiagnostics]);

  const diagnosticsStatusLabel = useMemo(() => {
    if (!accountState.authenticated) return "Sign In";
    if (diagnosticsState === "loading") return "Loading";
    if (diagnosticsState === "unavailable") return "Unavailable";
    if (diagnostics.length > 0) return `${diagnostics.length} Recent`;
    return "No Records";
  }, [accountState.authenticated, diagnostics.length, diagnosticsState]);

  return (
    <details
      className="push-diagnostics-details"
      open={open}
      onToggle={handleToggle}
    >
      <summary className="mobile-more-row push-diagnostics-summary">
        <Activity size={18} className="text-sky-600 dark:text-sky-400" aria-hidden="true" />
        <span className="push-diagnostics-summary-copy">
          <span>Notification Diagnostics</span>
          <span>Recent push attempts by device</span>
        </span>
        <span className="push-diagnostics-status">{diagnosticsStatusLabel}</span>
        <ChevronDown size={16} className="push-diagnostics-chevron" aria-hidden="true" />
      </summary>

      <div className="push-diagnostics-panel">
        {!accountState.authenticated ? (
          <p className="push-diagnostics-note" role="status">
            Sign in to view recent push attempts for this account.
          </p>
        ) : (
          <>
            <div className="push-diagnostics-header">
              <div>
                <strong>Recent Push Attempts</strong>
                <span>Accepted deliveries, service-worker receipt, display ack, and lifecycle events.</span>
              </div>
              <button
                type="button"
                onClick={() => void loadDiagnostics()}
                disabled={diagnosticsState === "loading"}
                aria-label="Refresh delivery diagnostics"
              >
                <RefreshCw size={15} className={diagnosticsState === "loading" ? "animate-spin" : ""} aria-hidden="true" />
              </button>
            </div>

            {diagnosticsState === "loading" ? (
              <p className="push-diagnostics-note" role="status">
                <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Loading delivery diagnostics...
              </p>
            ) : diagnosticsState === "unavailable" ? (
              <p className="push-diagnostics-note" role="status">
                {diagnosticsMessage ?? "Push delivery diagnostics are unavailable."}
              </p>
            ) : diagnostics.length === 0 ? (
              <p className="push-diagnostics-note">No recent push attempts recorded.</p>
            ) : (
              <div className="push-diagnostics-scroll" aria-label="Recent Push Attempts">
                {diagnostics.map((delivery) => {
                  const lineColor = delivery.lineId ? LINE_COLORS[delivery.lineId] : null;
                  const recentEvents = delivery.clientEvents.slice(-3);
                  return (
                    <div className="push-diagnostics-item" key={delivery.id}>
                      <div className="push-diagnostics-item-heading">
                        <div>
                          {delivery.lineNumber && lineColor ? (
                            <span
                              className="notification-line-badge"
                              style={{
                                backgroundColor: lineColor,
                                color: delivery.lineId === "line-1" ? "#111827" : "#ffffff",
                              }}
                            >
                              {delivery.lineNumber}
                            </span>
                          ) : null}
                          <strong>{delivery.title}</strong>
                        </div>
                        <span>{diagnosticOutcome(delivery)}</span>
                      </div>
                      <div className="push-diagnostics-meta">
                        <span>{delivery.deviceLabel}</span>
                        <span>{delivery.deliveryStatus}{delivery.httpStatus ? ` ${delivery.httpStatus}` : ""}</span>
                        <span>{delivery.attemptCount} {delivery.attemptCount === 1 ? "attempt" : "attempts"}</span>
                        <span>{delivery.displayedAt ? `Displayed ${formatDiagnosticTimestamp(delivery.displayedAt)}` : "No display ack"}</span>
                      </div>
                      {recentEvents.length > 0 ? (
                        <ol className="push-diagnostics-events">
                          {recentEvents.map((event) => (
                            <li key={`${delivery.id}-${event.stage}-${event.occurredAt}`}>
                              <span>{diagnosticStageLabel(event.stage)}</span>
                              <span>{formatDiagnosticTimestamp(event.occurredAt)}</span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="push-diagnostics-empty-events">No client events</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}

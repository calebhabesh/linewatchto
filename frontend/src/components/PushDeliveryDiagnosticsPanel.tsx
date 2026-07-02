"use client";

import { useCallback, useMemo, useState, type SyntheticEvent } from "react";
import { Activity, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import {
  disablePushDevice,
  getPushDeliveryDiagnostics,
  getPushDevices,
  type AccountState,
  type PushDeliveryDiagnostic,
  type PushDevice,
  type PushNotificationDiagnosticGroup,
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
  if (delivery.deliveryStatus?.toLowerCase() === "accepted") return "Accepted, no receipt";
  return delivery.deliveryStatus || "Queued";
}

function diagnosticDeviceKey(delivery: PushDeliveryDiagnostic) {
  return `${delivery.deviceLabel || "Unknown device"}|${delivery.endpointHashPrefix || ""}`;
}

function diagnosticDeviceLabel(delivery: PushDeliveryDiagnostic, duplicatedLabels: Set<string>) {
  const label = delivery.deviceLabel || "Unknown device";
  if (duplicatedLabels.has(label) && delivery.endpointHashPrefix) {
    return `${label} - ${delivery.endpointHashPrefix}`;
  }
  return label;
}

function deviceHealthLabel(device: PushDevice) {
  if (device.staleCandidate) {
    return "No display ack";
  }
  switch (device.deliveryHealth) {
    case "displayed":
      return "Displaying";
    case "accepted-no-display":
      return "Accepted, no display";
    case "sent-no-display":
      return "Sent, no display";
    case "registered":
      return "Registered";
    case "disabled":
      return "Disabled";
    default:
      return device.deliveryHealth || "Unknown";
  }
}

export function PushDeliveryDiagnosticsPanel({ accountState }: Props) {
  const [open, setOpen] = useState(false);
  const [diagnosticNotifications, setDiagnosticNotifications] = useState<PushNotificationDiagnosticGroup[]>([]);
  const [pushDevices, setPushDevices] = useState<PushDevice[]>([]);
  const [selectedDeviceKey, setSelectedDeviceKey] = useState("all");
  const [diagnosticsState, setDiagnosticsState] = useState<DiagnosticsLoadState>("idle");
  const [diagnosticsMessage, setDiagnosticsMessage] = useState<string | null>(null);
  const [deviceActionId, setDeviceActionId] = useState<string | null>(null);
  const [deviceActionMessage, setDeviceActionMessage] = useState<string | null>(null);

  const loadDiagnostics = useCallback(async () => {
    if (!accountState.authenticated) {
      setDiagnosticNotifications([]);
      setPushDevices([]);
      setSelectedDeviceKey("all");
      setDiagnosticsState("idle");
      setDiagnosticsMessage(null);
      setDeviceActionMessage(null);
      return;
    }

    setDiagnosticsState("loading");
    const [diagnosticsResult, devicesResult] = await Promise.all([
      getPushDeliveryDiagnostics(),
      getPushDevices(),
    ]);
    setDiagnosticNotifications(diagnosticsResult.notifications);
    setPushDevices(devicesResult.devices);
    setDiagnosticsState(diagnosticsResult.source === "backend" || devicesResult.source === "backend" ? "backend" : "unavailable");
    setDiagnosticsMessage(diagnosticsResult.message ?? devicesResult.message ?? null);
  }, [accountState.authenticated]);

  const handleDisableDevice = useCallback(async (subscriptionId: string) => {
    setDeviceActionId(subscriptionId);
    setDeviceActionMessage(null);
    try {
      await disablePushDevice(subscriptionId);
      setDeviceActionMessage("Device endpoint disabled.");
      await loadDiagnostics();
    } catch {
      setDeviceActionMessage("Could not disable this endpoint.");
    } finally {
      setDeviceActionId(null);
    }
  }, [loadDiagnostics]);

  const handleToggle = useCallback((event: SyntheticEvent<HTMLDetailsElement>) => {
    const nextOpen = event.currentTarget.open;
    setOpen(nextOpen);
    if (nextOpen && diagnosticsState === "idle") {
      void loadDiagnostics();
    }
  }, [diagnosticsState, loadDiagnostics]);

  const diagnosticDeviceOptions = useMemo(() => {
    const attempts = diagnosticNotifications.flatMap((notification) => notification.attempts);
    const labelCounts = new Map<string, number>();
    for (const attempt of attempts) {
      const label = attempt.deviceLabel || "Unknown device";
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    }
    const duplicatedLabels = new Set(
      [...labelCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([label]) => label)
    );
    const options = new Map<string, string>();
    for (const attempt of attempts) {
      options.set(diagnosticDeviceKey(attempt), diagnosticDeviceLabel(attempt, duplicatedLabels));
    }
    return [
      { key: "all", label: "All devices" },
      ...[...options.entries()].map(([key, label]) => ({ key, label })),
    ];
  }, [diagnosticNotifications]);

  const visibleNotifications = useMemo(() => diagnosticNotifications
    .map((notification) => ({
      ...notification,
      attempts: selectedDeviceKey === "all"
        ? notification.attempts
        : notification.attempts.filter((attempt) => diagnosticDeviceKey(attempt) === selectedDeviceKey),
    }))
    .filter((notification) => notification.attempts.length > 0), [diagnosticNotifications, selectedDeviceKey]);

  const diagnosticsStatusLabel = useMemo(() => {
    if (!accountState.authenticated) return "Sign In";
    if (diagnosticsState === "loading") return "Loading";
    if (diagnosticsState === "unavailable") return "Unavailable";
    if (diagnosticNotifications.length > 0) return `${diagnosticNotifications.length} Recent`;
    if (pushDevices.length > 0) return `${pushDevices.length} Devices`;
    return "No Records";
  }, [accountState.authenticated, diagnosticNotifications.length, diagnosticsState, pushDevices.length]);

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

            {diagnosticsState !== "loading" && diagnosticsState !== "unavailable" ? (
              <section className="push-devices-section" aria-label="Registered Devices">
                <div className="push-devices-header">
                  <strong>Registered Devices</strong>
                  <span>Enabled endpoints tied to this account.</span>
                </div>
                {deviceActionMessage ? (
                  <p className="push-diagnostics-note" role="status">{deviceActionMessage}</p>
                ) : null}
                {pushDevices.length === 0 ? (
                  <p className="push-diagnostics-note">No enabled push devices registered.</p>
                ) : (
                  <div className="push-devices-list">
                    {pushDevices.map((device) => (
                      <div className={`push-device-row${device.staleCandidate ? " stale" : ""}`} key={device.id}>
                        <div className="push-device-main">
                          <div>
                            <strong>{device.deviceLabel}</strong>
                            <span>{device.endpointHashPrefix}</span>
                          </div>
                          <span className="push-device-health">{deviceHealthLabel(device)}</span>
                        </div>
                        <div className="push-device-meta">
                          <span>Last seen {formatDiagnosticTimestamp(device.lastSeenAt)}</span>
                          <span>Last display {formatDiagnosticTimestamp(device.lastDisplayedAt)}</span>
                          <span>{device.acceptedWithoutDisplayCount} accepted without display</span>
                        </div>
                        <button
                          type="button"
                          className="push-device-disable"
                          disabled={!device.enabled || deviceActionId === device.id}
                          onClick={() => void handleDisableDevice(device.id)}
                        >
                          {deviceActionId === device.id ? "Disabling" : "Disable"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {diagnosticsState === "loading" ? (
              <p className="push-diagnostics-note" role="status">
                <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Loading delivery diagnostics...
              </p>
            ) : diagnosticsState === "unavailable" ? (
              <p className="push-diagnostics-note" role="status">
                {diagnosticsMessage ?? "Push delivery diagnostics are unavailable."}
              </p>
            ) : diagnosticNotifications.length === 0 ? (
              <p className="push-diagnostics-note">No recent push attempts recorded.</p>
            ) : (
              <div className="push-diagnostics-scroll" aria-label="Recent Push Attempts">
                {diagnosticDeviceOptions.length > 2 ? (
                  <div className="push-diagnostics-filter" role="group" aria-label="Filter notification diagnostics by device">
                    {diagnosticDeviceOptions.map((option) => (
                      <button
                        type="button"
                        key={option.key}
                        className={selectedDeviceKey === option.key ? "active" : ""}
                        onClick={() => setSelectedDeviceKey(option.key)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {visibleNotifications.map((notification) => {
                  const lineColor = notification.lineId ? LINE_COLORS[notification.lineId] : null;
                  return (
                    <div className="push-diagnostics-item" key={notification.id}>
                      <div className="push-diagnostics-item-heading">
                        <div>
                          {notification.lineNumber && lineColor ? (
                            <span
                              className="notification-line-badge"
                              style={{
                                backgroundColor: lineColor,
                                color: notification.lineId === "line-1" ? "#111827" : "#ffffff",
                              }}
                            >
                              {notification.lineNumber}
                            </span>
                          ) : null}
                          <strong>{notification.title}</strong>
                        </div>
                        <span>{notification.attempts.length} {notification.attempts.length === 1 ? "attempt" : "attempts"}</span>
                      </div>
                      <p className="push-diagnostics-source">
                        Incident: {notification.sourceIncidentKey ?? "Not recorded"}
                      </p>
                      <div className="push-diagnostics-attempts">
                        {notification.attempts.map((delivery) => {
                          const recentEvents = delivery.clientEvents.slice(-3);
                          return (
                            <div className="push-diagnostics-attempt" key={delivery.id}>
                              <div className="push-diagnostics-meta">
                                <span>{delivery.deviceLabel}</span>
                                <span>{delivery.endpointHashPrefix}</span>
                                <span>{delivery.deliveryStatus}{delivery.httpStatus ? ` ${delivery.httpStatus}` : ""}</span>
                                <span>{delivery.attemptCount} {delivery.attemptCount === 1 ? "attempt" : "attempts"}</span>
                                <span>{delivery.displayedAt ? `Displayed ${formatDiagnosticTimestamp(delivery.displayedAt)}` : "No display ack"}</span>
                                <span>{diagnosticOutcome(delivery)}</span>
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

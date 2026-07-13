"use client";

import { useCallback, useMemo, useState, type SyntheticEvent } from "react";
import { Activity, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import {
  disablePushDevice,
  getPushDeliveryDiagnostics,
  getPushDevices,
  sendPushDeviceTestNotification,
  type AccountState,
  type PushDeliveryDiagnostic,
  type PushDevice,
  type PushNotificationDiagnosticGroup,
} from "../app/account-data";
import {
  diagnosticDeviceKey,
  diagnosticDeviceOptions,
  recipientsForNotification,
  visibleRecipientsForNotification,
} from "../app/push-diagnostics-state";

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
  if (delivery.deliveryStatus?.toLowerCase() === "gone" || delivery.httpStatus === 404 || delivery.httpStatus === 410) {
    return "Invalid subscription";
  }
  if (delivery.clientEvents.some((event) => event.stage === "show_failed")) return "Display failed";
  if (delivery.clientEvents.some((event) => event.stage === "ack_failed")) return "Ack failed";
  if (delivery.clientEvents.some((event) => event.stage === "fallback_shown")) return "Fallback displayed";
  if (delivery.clientEvents.some((event) => event.stage === "push_received")) return "Received";
  if (delivery.deliveryStatus?.toLowerCase() === "accepted") return "Accepted, no receipt";
  return delivery.deliveryStatus || "Queued";
}

function displayEvidenceLabel(delivery: PushDeliveryDiagnostic) {
  if (delivery.displayedAt) return `Displayed ${formatDiagnosticTimestamp(delivery.displayedAt)}`;
  if (delivery.deliveryStatus?.toLowerCase() === "gone" || delivery.httpStatus === 404 || delivery.httpStatus === 410) {
    return "Endpoint expired";
  }
  if (delivery.clientEvents.some((event) => event.stage === "push_received")) {
    return "Received, no display ack";
  }
  if (delivery.deliveryStatus?.toLowerCase() === "accepted") return "No receipt or display ack";
  return "Not displayed";
}

function registrationReasonLabel(reason?: string | null) {
  switch (reason) {
    case "app-refresh": return "Refreshed when app opened";
    case "subscription-change": return "Rotated by browser";
    case "invalid-endpoint-replacement": return "Replaced expired endpoint";
    case "user-enabled": return "Enabled by user";
    case "legacy": return "Registered before lifecycle tracking";
    default: return reason ? reason.replaceAll("-", " ") : "Registration source not recorded";
  }
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
  const [showArchivedDevices, setShowArchivedDevices] = useState(false);
  const [diagnosticsState, setDiagnosticsState] = useState<DiagnosticsLoadState>("idle");
  const [diagnosticsMessage, setDiagnosticsMessage] = useState<string | null>(null);
  const [deviceActionId, setDeviceActionId] = useState<string | null>(null);
  const [deviceActionType, setDeviceActionType] = useState<"disable" | "test" | null>(null);
  const [deviceActionMessage, setDeviceActionMessage] = useState<string | null>(null);

  const loadDiagnostics = useCallback(async () => {
    if (!accountState.authenticated) {
      setDiagnosticNotifications([]);
      setPushDevices([]);
      setSelectedDeviceKey("all");
      setShowArchivedDevices(false);
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
    // Start with the full recipient timeline. Selecting only the current
    // endpoint hides the device that actually received an older push after a
    // browser rotates its subscription.
    setSelectedDeviceKey("all");
    setDiagnosticsState(diagnosticsResult.source === "backend" || devicesResult.source === "backend" ? "backend" : "unavailable");
    setDiagnosticsMessage(diagnosticsResult.message ?? devicesResult.message ?? null);
  }, [accountState.authenticated]);

  const handleDisableDevice = useCallback(async (subscriptionId: string, isDisplaying: boolean) => {
    if (isDisplaying) {
      if (!window.confirm("Are you sure?")) {
        return;
      }
    }
    setDeviceActionId(subscriptionId);
    setDeviceActionType("disable");
    setDeviceActionMessage(null);
    try {
      await disablePushDevice(subscriptionId);
      setDeviceActionMessage("Device endpoint disabled.");
      await loadDiagnostics();
    } catch {
      setDeviceActionMessage("Could not disable this endpoint.");
    } finally {
      setDeviceActionId(null);
      setDeviceActionType(null);
    }
  }, [loadDiagnostics]);

  const handleTestDevice = useCallback(async (subscriptionId: string) => {
    setDeviceActionId(subscriptionId);
    setDeviceActionType("test");
    setDeviceActionMessage(null);
    try {
      const result = await sendPushDeviceTestNotification(subscriptionId);
      const status = result.delivery.httpStatus
        ? `${result.delivery.deliveryStatus} ${result.delivery.httpStatus}`
        : result.delivery.deliveryStatus;
      setDeviceActionMessage(`Test notification sent: ${status}.`);
      await loadDiagnostics();
    } catch {
      setDeviceActionMessage("Could not send a test notification to this endpoint.");
    } finally {
      setDeviceActionId(null);
      setDeviceActionType(null);
    }
  }, [loadDiagnostics]);

  const handleToggle = useCallback((event: SyntheticEvent<HTMLDetailsElement>) => {
    const nextOpen = event.currentTarget.open;
    setOpen(nextOpen);
    if (nextOpen && diagnosticsState === "idle") {
      void loadDiagnostics();
    }
  }, [diagnosticsState, loadDiagnostics]);

  const diagnosticDeviceOptionsForView = useMemo(
    () => diagnosticDeviceOptions(diagnosticNotifications, showArchivedDevices),
    [diagnosticNotifications, showArchivedDevices]
  );

  const archivedRecipientCount = useMemo(() => diagnosticNotifications
    .flatMap(recipientsForNotification)
    .filter((recipient) => !recipient.subscriptionEnabled)
    .length, [diagnosticNotifications]);

  const visibleNotifications = useMemo(() => diagnosticNotifications
    .map((notification) => {
      const recipients = visibleRecipientsForNotification(notification, showArchivedDevices);
      return {
        ...notification,
        recipients: selectedDeviceKey === "all"
          ? recipients
          : recipients.filter((recipient) => diagnosticDeviceKey(recipient) === selectedDeviceKey),
      };
    })
    .filter((notification) => notification.recipients.length > 0), [diagnosticNotifications, selectedDeviceKey, showArchivedDevices]);

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
              <section className="push-devices-section" aria-label="Active Browser Installations">
                <div className="push-devices-header">
                  <strong>Active Browser Installations</strong>
                  <span>Current enabled push endpoint for each known browser installation.</span>
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
                        <div className="push-device-details">
                          <div className="push-device-main">
                            <strong>{device.deviceLabel}</strong>
                            <code className="push-device-hash">{device.endpointHashPrefix}</code>
                            <span className="push-device-health">{deviceHealthLabel(device)}</span>
                          </div>
                          <div className="push-device-meta">
                            <span>Last seen {formatDiagnosticTimestamp(device.lastSeenAt)}</span>
                            <span>Last display {formatDiagnosticTimestamp(device.lastDisplayedAt)}</span>
                            <span>{device.acceptedWithoutDisplayCount} accepted without display</span>
                            <span>{registrationReasonLabel(device.registrationReason)}</span>
                            {(device.previousEndpointCount ?? 0) > 0 ? (
                              <span>{device.previousEndpointCount} earlier {device.previousEndpointCount === 1 ? "endpoint" : "endpoints"} archived</span>
                            ) : null}
                          </div>
                        </div>
                        <div className="push-device-actions">
                          <button
                            type="button"
                            className="push-device-test"
                            disabled={!device.enabled || deviceActionId === device.id}
                            onClick={() => void handleTestDevice(device.id)}
                          >
                            {deviceActionId === device.id && deviceActionType === "test" ? "Testing" : "Test"}
                          </button>
                          <button
                            type="button"
                            className="push-device-disable"
                            disabled={!device.enabled || deviceActionId === device.id}
                            onClick={() => {
                              const isDisplaying = device.deliveryHealth === "displayed" && !device.staleCandidate;
                              void handleDisableDevice(device.id, isDisplaying);
                            }}
                          >
                            {deviceActionId === device.id && deviceActionType === "disable" ? "Disabling" : "Disable"}
                          </button>
                        </div>
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
                {archivedRecipientCount > 0 ? (
                  <label className="push-diagnostics-archive-toggle">
                    <input
                      type="checkbox"
                      checked={showArchivedDevices}
                      onChange={(event) => {
                        const nextShowArchived = event.currentTarget.checked;
                        setShowArchivedDevices(nextShowArchived);
                        if (!nextShowArchived) {
                          const currentOptions = diagnosticDeviceOptions(diagnosticNotifications, false);
                          if (!currentOptions.some((option) => option.key === selectedDeviceKey)) {
                            setSelectedDeviceKey("all");
                          }
                        }
                      }}
                    />
                    <span>Show archived devices</span>
                  </label>
                ) : null}
                {diagnosticDeviceOptionsForView.length > 2 ? (
                  <div className="push-diagnostics-filter" role="group" aria-label="Filter notification diagnostics by device">
                    {diagnosticDeviceOptionsForView.map((option) => (
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
                        <span>{notification.recipients.length} {notification.recipients.length === 1 ? "device" : "devices"}</span>
                      </div>
                      <p className="push-diagnostics-source">
                        Incident: {notification.sourceIncidentKey ?? "Not recorded"}
                      </p>
                      <div className="push-diagnostics-attempts">
                        {notification.recipients.map((recipient) => {
                          const delivery = recipient.delivery;
                          const recentEvents = delivery?.clientEvents.slice(-3) ?? [];
                          return (
                            <div className={`push-diagnostics-attempt push-diagnostics-recipient ${recipient.status}`} key={`${notification.id}-${recipient.subscriptionId}-${recipient.endpointHashPrefix}`}>
                              <div className="push-diagnostics-meta">
                                <span>{recipient.deviceLabel}</span>
                                <span>{recipient.endpointHashPrefix}</span>
                                <span>{delivery ? `${delivery.deliveryStatus}${delivery.httpStatus ? ` ${delivery.httpStatus}` : ""}` : "Not attempted"}</span>
                                {delivery ? (
                                  <span>{delivery.attemptCount} {delivery.attemptCount === 1 ? "attempt" : "attempts"}</span>
                                ) : null}
                                {delivery ? (
                                  <span>{displayEvidenceLabel(delivery)}</span>
                                ) : null}
                                <span>{delivery ? diagnosticOutcome(delivery) : recipient.reason}</span>
                              </div>
                              {!delivery ? (
                                <p className="push-diagnostics-empty-events">{recipient.reason}</p>
                              ) : recentEvents.length > 0 ? (
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

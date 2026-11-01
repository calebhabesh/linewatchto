"use client";

import { useCallback, useMemo, useState, type SyntheticEvent } from "react";
import { Activity, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import type { AccountState } from "../app/auth-data";
import {
  disablePushDevice,
  getPushDiagnostics,
  sendPushDeviceTestNotification,
  type PushDiagnosticsResult,
} from "../app/push-data";
import {
  deviceModeLabel,
  deviceNames,
  deviceReplacementSummary,
  deviceShownRate,
  deviceShownSummary,
  deviceStatusDetail,
  deviceStatusLabel,
  endpointHashPrefixForEndpoint,
  formatDiagnosticTime,
  isCurrentDevice,
  outcomeLabel,
} from "../app/push-diagnostics-state";
import { getCurrentPushSubscription } from "../app/push-browser-state";
import { TransitLineBadge } from "./TransitLineBadge";

type DiagnosticsLoadState = "idle" | "loading" | "backend" | "unavailable";

type Props = {
  accountState: AccountState;
};

const EMPTY_DIAGNOSTICS: PushDiagnosticsResult = {
  source: "unavailable",
  windowStart: null,
  devices: [],
  alerts: [],
  vapidKeyFingerprint: null,
  lifecycle: [],
};

async function currentEndpointHashPrefix(): Promise<string | null> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
    const subscription = await getCurrentPushSubscription(navigator.serviceWorker, { readyTimeoutMs: 1_000 });
    return subscription ? await endpointHashPrefixForEndpoint(subscription.endpoint) : null;
  } catch {
    return null;
  }
}

export function PushDeliveryDiagnosticsPanel({ accountState }: Props) {
  const [open, setOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PushDiagnosticsResult>(EMPTY_DIAGNOSTICS);
  const [currentPrefix, setCurrentPrefix] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<DiagnosticsLoadState>("idle");
  const [deviceActionId, setDeviceActionId] = useState<string | null>(null);
  const [deviceActionType, setDeviceActionType] = useState<"disable" | "test" | null>(null);
  const [deviceActionMessage, setDeviceActionMessage] = useState<string | null>(null);

  const loadDiagnostics = useCallback(async () => {
    if (!accountState.authenticated) {
      setDiagnostics(EMPTY_DIAGNOSTICS);
      setLoadState("idle");
      setDeviceActionMessage(null);
      return;
    }
    setLoadState("loading");
    const [result, prefix] = await Promise.all([getPushDiagnostics(), currentEndpointHashPrefix()]);
    setDiagnostics(result);
    setCurrentPrefix(prefix);
    setLoadState(result.source === "backend" ? "backend" : "unavailable");
  }, [accountState.authenticated]);

  const handleDisableDevice = useCallback(async (subscriptionId: string, name: string) => {
    if (!window.confirm(`Turn off notifications on ${name}?`)) return;
    setDeviceActionId(subscriptionId);
    setDeviceActionType("disable");
    setDeviceActionMessage(null);
    try {
      await disablePushDevice(subscriptionId);
      setDeviceActionMessage(`Notifications turned off on ${name}.`);
      await loadDiagnostics();
    } catch {
      setDeviceActionMessage(`Could not turn off notifications on ${name}.`);
    } finally {
      setDeviceActionId(null);
      setDeviceActionType(null);
    }
  }, [loadDiagnostics]);

  const handleTestDevice = useCallback(async (subscriptionId: string, name: string) => {
    setDeviceActionId(subscriptionId);
    setDeviceActionType("test");
    setDeviceActionMessage(null);
    try {
      const result = await sendPushDeviceTestNotification(subscriptionId);
      const gone = result.httpStatus === 404 || result.httpStatus === 410;
      setDeviceActionMessage(gone
        ? `${name} is unreachable. Open LineWatchTO on it to reconnect.`
        : result.deliveryStatus === "accepted"
          ? `Test sent to ${name}. It should appear within a minute.`
          : `The push service did not accept the test for ${name}.`);
      await loadDiagnostics();
    } catch {
      setDeviceActionMessage(`Could not send a test notification to ${name}.`);
    } finally {
      setDeviceActionId(null);
      setDeviceActionType(null);
    }
  }, [loadDiagnostics]);

  const handleToggle = useCallback((event: SyntheticEvent<HTMLDetailsElement>) => {
    const nextOpen = event.currentTarget.open;
    setOpen(nextOpen);
    if (nextOpen && loadState === "idle") {
      void loadDiagnostics();
    }
  }, [loadState, loadDiagnostics]);

  const names = useMemo(() => deviceNames(diagnostics.devices), [diagnostics.devices]);

  const statusLabel = useMemo(() => {
    if (!accountState.authenticated) return "Sign In";
    if (loadState === "loading") return "Loading";
    if (loadState === "unavailable") return "Unavailable";
    if (loadState === "idle") return "";
    const unreachable = diagnostics.devices.filter((device) => device.status === "unreachable").length;
    if (unreachable > 0) return `${unreachable} Unreachable`;
    const count = diagnostics.devices.length;
    return count === 0 ? "No Devices" : `${count} ${count === 1 ? "Device" : "Devices"}`;
  }, [accountState.authenticated, diagnostics.devices, loadState]);

  return (
    <details className="push-diagnostics-details" open={open} onToggle={handleToggle}>
      <summary className="mobile-more-row push-diagnostics-summary">
        <Activity size={18} className="text-sky-600 dark:text-sky-400" aria-hidden="true" />
        <span className="push-diagnostics-summary-copy">
          <span>Notification Diagnostics</span>
          <span>Delivery by Device, Last 7 Days</span>
        </span>
        <span className="push-diagnostics-status">{statusLabel}</span>
        <ChevronDown size={16} className="push-diagnostics-chevron" aria-hidden="true" />
      </summary>

      <div className="push-diagnostics-panel">
        {!accountState.authenticated ? (
          <p className="push-diagnostics-note" role="status">
            Sign in to see how notifications reach your devices.
          </p>
        ) : (
          <>
            <div className="push-diagnostics-header">
              <div>
                <strong>Your Devices</strong>
                <span>Whether each device can receive alerts now, and what it showed.</span>
              </div>
              <button
                type="button"
                onClick={() => void loadDiagnostics()}
                disabled={loadState === "loading"}
                aria-label="Refresh notification diagnostics"
              >
                <RefreshCw size={15} className={loadState === "loading" ? "animate-spin" : ""} aria-hidden="true" />
              </button>
            </div>

            {loadState === "loading" ? (
              <p className="push-diagnostics-note" role="status">
                <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Loading notification diagnostics...
              </p>
            ) : loadState === "unavailable" ? (
              <p className="push-diagnostics-note" role="status">
                {diagnostics.message ?? "Notification diagnostics are unavailable."}
              </p>
            ) : loadState === "backend" ? (
              <>
                <section className="push-devices-section" aria-label="Your Devices">
                  {deviceActionMessage ? (
                    <p className="push-diagnostics-note" role="status">{deviceActionMessage}</p>
                  ) : null}
                  {diagnostics.devices.length === 0 ? (
                    <p className="push-diagnostics-note">No devices have notifications on for this account.</p>
                  ) : (
                    <div className="push-devices-list">
                      {diagnostics.devices.map((device) => {
                        const name = names.get(device.key) ?? device.label;
                        const rate = deviceShownRate(device);
                        const mode = deviceModeLabel(device);
                        const replacements = deviceReplacementSummary(device);
                        const lastShown = formatDiagnosticTime(device.lastShownAt);
                        const busy = deviceActionId !== null && deviceActionId === device.currentSubscriptionId;
                        return (
                          <div className="push-device-row" data-status={device.status} key={device.key}>
                            <div className="push-device-details">
                              <div className="push-device-main">
                                <strong>{name}</strong>
                                {isCurrentDevice(device, currentPrefix) ? <span className="push-device-tag">This Device</span> : null}
                                {mode ? <span className="push-device-tag">{mode}</span> : null}
                                <span className="push-device-health">{deviceStatusLabel(device)}</span>
                              </div>
                              <div className="push-device-meta">
                                <span>{deviceStatusDetail(device)}</span>
                                <span>
                                  {rate !== null ? <b>{rate}% Shown. </b> : null}
                                  {deviceShownSummary(device)}
                                </span>
                                {lastShown ? (
                                  <span>Last shown {lastShown}{device.lastShownTitle ? `: ${device.lastShownTitle}` : ""}</span>
                                ) : null}
                                {replacements ? <span>{replacements}</span> : null}
                              </div>
                            </div>
                            {device.currentSubscriptionId ? (
                              <div className="push-device-actions">
                                <button
                                  type="button"
                                  className="push-device-test"
                                  disabled={busy}
                                  aria-label={`Send a test notification to ${name}`}
                                  onClick={() => void handleTestDevice(device.currentSubscriptionId!, name)}
                                >
                                  {busy && deviceActionType === "test" ? "Testing" : "Test"}
                                </button>
                                <button
                                  type="button"
                                  className="push-device-disable"
                                  disabled={busy}
                                  aria-label={`Turn off notifications on ${name}`}
                                  onClick={() => void handleDisableDevice(device.currentSubscriptionId!, name)}
                                >
                                  {busy && deviceActionType === "disable" ? "Turning Off" : "Turn Off"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {diagnostics.alerts.length === 0 ? (
                  <p className="push-diagnostics-note">No alerts in the last 7 days.</p>
                ) : (
                  <section className="push-diagnostics-scroll" aria-label="Recent Alerts">
                    <strong className="push-diagnostics-section-title">Recent Alerts</strong>
                    {diagnostics.alerts.map((alert) => (
                      <div className="push-diagnostics-item" key={alert.id}>
                        <div className="push-diagnostics-item-heading">
                          <div>
                            {alert.lineNumber && alert.lineId ? (
                              <TransitLineBadge lineId={alert.lineId} lineNumber={alert.lineNumber} size={26} className="notification-line-badge" />
                            ) : null}
                            <strong>{alert.title}</strong>
                          </div>
                          <span>{formatDiagnosticTime(alert.createdAt)}</span>
                        </div>
                        <ul className="push-diagnostics-outcomes">
                          {alert.outcomes.map((outcome) => (
                            <li key={`${alert.id}-${outcome.deviceKey}`} data-outcome={outcome.outcome}>
                              <span>{names.get(outcome.deviceKey) ?? "Device"}</span>
                              <span>{outcomeLabel(outcome)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </section>
                )}

                <details className="push-diagnostics-technical">
                  <summary>Technical Details</summary>
                  <div className="push-diagnostics-technical-body">
                    {diagnostics.vapidKeyFingerprint ? (
                      <p>VAPID key <code>{diagnostics.vapidKeyFingerprint}</code> should stay the same across deployments.</p>
                    ) : null}
                    {diagnostics.devices.map((device) => (
                      <p key={`technical-${device.key}`}>
                        <b>{names.get(device.key) ?? device.label}</b>
                        {device.installationIdPrefix ? <> · installation <code>{device.installationIdPrefix}</code></> : null}
                        {" "}· endpoint <code>{device.endpointHashPrefix}</code>
                        {device.registrationReason ? <> · {device.registrationReason}</> : null}
                        {device.browserMajorVersion ? <> · browser {device.browserMajorVersion}</> : null}
                        {device.displayMode ? <> · {device.displayMode}</> : null}
                        {" "}· {device.endpointCount} {device.endpointCount === 1 ? "endpoint" : "endpoints"}
                      </p>
                    ))}
                    {diagnostics.lifecycle.length > 0 ? (
                      <ol className="push-diagnostics-lifecycle" aria-label="Subscription history">
                        {diagnostics.lifecycle.map((record, index) => (
                          <li key={`${record.occurredAt}-${index}`}>
                            <span>{formatDiagnosticTime(record.occurredAt)}</span>
                            <span>
                              {record.deviceKey ? `${names.get(record.deviceKey) ?? record.deviceKey} · ` : ""}
                              {record.eventType}: {record.reason}
                              {record.endpointHashPrefix ? <> · <code>{record.endpointHashPrefix}</code></> : null}
                              {record.previousEndpointHashPrefix ? <> replaced <code>{record.previousEndpointHashPrefix}</code></> : null}
                              {record.browserMajorVersion ? <> · browser {record.browserMajorVersion}</> : null}
                              {record.displayMode ? <> · {record.displayMode}</> : null}
                              {record.detail ? <> · {record.detail}</> : null}
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : null}
                    {diagnostics.alerts.some((alert) => alert.outcomes.some((outcome) => outcome.technical)) ? (
                      <ol className="push-diagnostics-lifecycle" aria-label="Delivery details">
                        {diagnostics.alerts.flatMap((alert) => alert.outcomes
                          .filter((outcome) => outcome.technical)
                          .map((outcome) => (
                            <li key={`delivery-${alert.id}-${outcome.deviceKey}`}>
                              <span>{formatDiagnosticTime(alert.createdAt)}</span>
                              <span>{names.get(outcome.deviceKey) ?? "Device"} · {alert.title} · {outcome.technical}</span>
                            </li>
                          )))}
                      </ol>
                    ) : null}
                  </div>
                </details>
              </>
            ) : null}
          </>
        )}
      </div>
    </details>
  );
}

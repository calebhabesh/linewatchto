import type { PushAlertOutcome, PushDeviceDiagnostic } from "./push-data.ts";

// Plain-language model for the installation-centred Notification Diagnostics
// panel (plan 12). The backend decides each outcome; this module only words it.

const TORONTO_TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDiagnosticTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : TORONTO_TIME.format(date);
}

export function deviceStatusLabel(device: Pick<PushDeviceDiagnostic, "status">): string {
  switch (device.status) {
    case "reachable": return "Reachable";
    case "unreachable": return "Unreachable";
    default: return "Off";
  }
}

// en-CA times end in "a.m."/"p.m.", so time-ending lines carry no extra period.
export function deviceStatusDetail(device: Pick<PushDeviceDiagnostic, "status" | "statusSince">): string {
  const since = formatDiagnosticTime(device.statusSince);
  switch (device.status) {
    case "reachable":
      return since ? `Connected since ${since}` : "Connected";
    case "unreachable":
      return `${since ? `Since ${since}, the` : "The"} browser has had no working subscription. Opening LineWatchTO on this device reconnects it.`;
    default:
      return since ? `Notifications turned off ${since}` : "Notifications are off on this device";
  }
}

// Share of alerts the device showed out of those meant for it in the window:
// sent while reachable plus missed while unreachable.
export function deviceShownRate(device: Pick<PushDeviceDiagnostic, "shown" | "sentWhileReachable" | "missedWhileUnreachable">): number | null {
  const total = device.sentWhileReachable + device.missedWhileUnreachable;
  return total === 0 ? null : Math.round((device.shown / total) * 100);
}

export function deviceShownSummary(device: Pick<PushDeviceDiagnostic, "shown" | "sentWhileReachable" | "missedWhileUnreachable">): string {
  const total = device.sentWhileReachable + device.missedWhileUnreachable;
  if (total === 0) return "No alerts in the last 7 days.";
  const parts = [`Showed ${device.shown} of ${total} alerts in the last 7 days`];
  const unconfirmed = device.sentWhileReachable - device.shown;
  if (unconfirmed > 0) parts.push(`${unconfirmed} sent, not confirmed`);
  if (device.missedWhileUnreachable > 0) parts.push(`${device.missedWhileUnreachable} missed while unreachable`);
  return `${parts.join("; ")}.`;
}

export function deviceReplacementSummary(device: Pick<PushDeviceDiagnostic, "replacements">): string | null {
  if (device.replacements <= 0) return null;
  return device.replacements === 1
    ? "The browser replaced its subscription once in 7 days."
    : `The browser replaced its subscription ${device.replacements} times in 7 days.`;
}

export function deviceModeLabel(device: Pick<PushDeviceDiagnostic, "displayMode">): string | null {
  if (device.displayMode === "standalone") return "Installed App";
  if (device.displayMode === "browser") return "Browser Tab";
  return null;
}

export function isCurrentDevice(
  device: Pick<PushDeviceDiagnostic, "status" | "endpointHashPrefix">,
  currentEndpointHashPrefix: string | null,
): boolean {
  return Boolean(currentEndpointHashPrefix)
    && device.status === "reachable"
    && device.endpointHashPrefix === currentEndpointHashPrefix;
}

// Names two devices with the same browser and platform apart.
export function deviceNames(devices: Pick<PushDeviceDiagnostic, "key" | "label">[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const device of devices) counts.set(device.label, (counts.get(device.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  const names = new Map<string, string>();
  for (const device of devices) {
    if ((counts.get(device.label) ?? 0) < 2) {
      names.set(device.key, device.label);
      continue;
    }
    const index = (seen.get(device.label) ?? 0) + 1;
    seen.set(device.label, index);
    names.set(device.key, `${device.label} ${index}`);
  }
  return names;
}

// One plain outcome per alert per device.
export function outcomeLabel(outcome: Pick<PushAlertOutcome, "outcome" | "at" | "reason" | "catchUp">): string {
  switch (outcome.outcome) {
    case "shown": {
      const at = formatDiagnosticTime(outcome.at);
      const shown = at ? `Shown ${at}` : "Shown";
      return outcome.catchUp ? `${shown} (after reconnecting)` : shown;
    }
    case "sent":
      return "Sent, not confirmed";
    case "missed":
      return "Missed, device unreachable";
    default:
      return outcome.reason ? `Not sent: ${outcome.reason}` : "Not sent";
  }
}

export async function endpointHashPrefixForEndpoint(endpoint: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint.trim()));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

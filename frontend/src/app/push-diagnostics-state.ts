import type { PushNotificationDiagnosticGroup, PushRecipientDiagnostic } from "./account-data.ts";

export type PushDiagnosticDeviceOption = {
  key: string;
  label: string;
};

export function diagnosticDeviceKey(recipient: Pick<PushRecipientDiagnostic, "deviceLabel" | "endpointHashPrefix">) {
  return `${recipient.deviceLabel || "Unknown device"}|${recipient.endpointHashPrefix || ""}`;
}

export function recipientsForNotification(notification: PushNotificationDiagnosticGroup): PushRecipientDiagnostic[] {
  if (Array.isArray(notification.recipients) && notification.recipients.length > 0) {
    return notification.recipients;
  }
  return notification.attempts.map((delivery) => ({
    subscriptionId: delivery.id,
    deviceLabel: delivery.deviceLabel,
    userAgent: delivery.userAgent,
    endpointHashPrefix: delivery.endpointHashPrefix,
    subscriptionEnabled: delivery.subscriptionEnabled,
    enabledAt: null,
    disabledAt: null,
    status: "attempted",
    reasonCode: "attempted",
    reason: "Delivery was attempted for this device.",
    delivery,
  }));
}

export function visibleRecipientsForNotification(
  notification: PushNotificationDiagnosticGroup,
  showArchivedDevices: boolean,
): PushRecipientDiagnostic[] {
  const recipients = recipientsForNotification(notification);
  // Keep the actual recipient visible even after its browser endpoint has been
  // replaced. Hiding it turns a historical delivery into the misleading
  // "registered after" result for the current endpoint.
  return showArchivedDevices
    ? recipients
    : recipients.filter((recipient) => recipient.subscriptionEnabled || recipient.delivery !== null);
}

export function diagnosticDeviceOptions(
  notifications: PushNotificationDiagnosticGroup[],
  showArchivedDevices: boolean,
): PushDiagnosticDeviceOption[] {
  const recipients = notifications.flatMap((notification) => visibleRecipientsForNotification(notification, showArchivedDevices));
  const labelCounts = new Map<string, number>();
  for (const recipient of recipients) {
    const label = recipient.deviceLabel || "Unknown device";
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  const duplicatedLabels = new Set(
    [...labelCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([label]) => label),
  );
  const options = new Map<string, string>();
  for (const recipient of recipients) {
    options.set(diagnosticDeviceKey(recipient), diagnosticDeviceLabel(recipient, duplicatedLabels));
  }
  return [
    { key: "all", label: showArchivedDevices ? "All devices" : "Current and delivered devices" },
    ...[...options.entries()].map(([key, label]) => ({ key, label })),
  ];
}

export function selectedDeviceKeyForCurrentEndpoint(
  endpointHashPrefix: string | null,
  options: PushDiagnosticDeviceOption[],
) {
  if (!endpointHashPrefix) return "all";
  return options.find((option) => option.key.endsWith(`|${endpointHashPrefix}`))?.key ?? "all";
}

export async function endpointHashPrefixForEndpoint(endpoint: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint.trim()));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}

function diagnosticDeviceLabel(
  recipient: Pick<PushRecipientDiagnostic, "deviceLabel" | "endpointHashPrefix">,
  duplicatedLabels: Set<string>,
) {
  const label = recipient.deviceLabel || "Unknown device";
  if (duplicatedLabels.has(label) && recipient.endpointHashPrefix) {
    return `${label} - ${recipient.endpointHashPrefix}`;
  }
  return label;
}

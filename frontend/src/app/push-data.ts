import {
  apiUrl,
  accountJsonRequest,
  accountEmptyRequest,
  accountRequestError,
  readJson,
  type AdapterOptions,
} from "./account-transport.ts";

export type PushNotificationEventTypePreferences = {
  suspensions: boolean;
  delays: boolean;
  tripCancellations: boolean;
  reducedSpeedZones: boolean;
  plannedClosures: boolean;
  serviceRestored: boolean;
};

export type PushNotificationSavedCommutePreferences = {
  currentDisruptions: boolean;
  plannedClosureReminders: boolean;
  eventTypes: PushNotificationEventTypePreferences;
};

export type PushNotificationLinePreference = {
  lineId:
    | "line-1"
    | "line-2"
    | "line-4"
    | "line-5"
    | "line-6"
    | "regional-br"
    | "regional-ki"
    | "regional-le"
    | "regional-lw"
    | "regional-mi"
    | "regional-rh"
    | "regional-st"
    | "regional-up";
  lineNumber: string;
  label: string;
  subscribed: boolean;
};

export type PushNotificationLineSubscriptionPreferences = {
  lines: PushNotificationLinePreference[];
  eventTypes: PushNotificationEventTypePreferences;
};

export type PlannedClosureFollowUpPolicy =
  | "smart"
  | "within-24-hours"
  | "day-of"
  | "announcements-only";

export type PushNotificationPreferences = {
  commuteNotificationsEnabled: boolean;
  plannedClosureNotificationsEnabled: boolean;
  savedCommutes: PushNotificationSavedCommutePreferences;
  lineSubscriptions: PushNotificationLineSubscriptionPreferences;
  plannedClosureFollowUp: PlannedClosureFollowUpPolicy;
};

export const defaultPushNotificationPreferences: PushNotificationPreferences = {
  commuteNotificationsEnabled: true,
  plannedClosureNotificationsEnabled: true,
  savedCommutes: {
    currentDisruptions: true,
    plannedClosureReminders: true,
    eventTypes: {
      suspensions: true,
      delays: true,
      tripCancellations: true,
      reducedSpeedZones: true,
      plannedClosures: true,
      serviceRestored: true,
    },
  },
  lineSubscriptions: {
    lines: [
      { lineId: "line-1", lineNumber: "1", label: "Yonge-University", subscribed: false },
      { lineId: "line-2", lineNumber: "2", label: "Bloor-Danforth", subscribed: false },
      { lineId: "line-4", lineNumber: "4", label: "Sheppard", subscribed: false },
      { lineId: "line-5", lineNumber: "5", label: "Eglinton", subscribed: false },
      { lineId: "line-6", lineNumber: "6", label: "Finch West", subscribed: false },
      { lineId: "regional-br", lineNumber: "BR", label: "Barrie", subscribed: false },
      { lineId: "regional-ki", lineNumber: "KI", label: "Kitchener", subscribed: false },
      { lineId: "regional-le", lineNumber: "LE", label: "Lakeshore East", subscribed: false },
      { lineId: "regional-lw", lineNumber: "LW", label: "Lakeshore West", subscribed: false },
      { lineId: "regional-mi", lineNumber: "MI", label: "Milton", subscribed: false },
      { lineId: "regional-rh", lineNumber: "RH", label: "Richmond Hill", subscribed: false },
      { lineId: "regional-st", lineNumber: "ST", label: "Stouffville", subscribed: false },
      { lineId: "regional-up", lineNumber: "UP", label: "UP Express", subscribed: false },
    ],
    eventTypes: {
      suspensions: true,
      delays: true,
      tripCancellations: true,
      reducedSpeedZones: true,
      plannedClosures: true,
      serviceRestored: true,
    },
  },
  plannedClosureFollowUp: "smart",
};

export type LegacyReminderTimingPreferences = {
  closure24h?: boolean;
  closureMorning?: boolean;
};

function isPlannedClosureFollowUpPolicy(value: unknown): value is PlannedClosureFollowUpPolicy {
  return value === "smart"
    || value === "within-24-hours"
    || value === "day-of"
    || value === "announcements-only";
}

export function normalizePlannedClosureFollowUpPolicy(
  value: unknown,
  legacy?: LegacyReminderTimingPreferences,
): PlannedClosureFollowUpPolicy {
  if (isPlannedClosureFollowUpPolicy(value)) return value;
  const closure24h = legacy?.closure24h ?? true;
  const closureMorning = legacy?.closureMorning ?? true;
  if (closure24h && closureMorning) return "smart";
  if (closure24h) return "within-24-hours";
  if (closureMorning) return "day-of";
  return "announcements-only";
}

export function normalizePushNotificationPreferences(
  preferences: PushNotificationPreferences & {
    plannedClosureFollowUp?: unknown;
    reminderTiming?: LegacyReminderTimingPreferences;
  },
): PushNotificationPreferences {
  return {
    ...preferences,
    plannedClosureFollowUp: normalizePlannedClosureFollowUpPolicy(
      preferences.plannedClosureFollowUp,
      preferences.reminderTiming,
    ),
  };
}

export type PushNotificationConfig = {
  webPushAvailable: boolean;
  vapidPublicKey: string;
  preferences: PushNotificationPreferences;
};

export type PushNotificationConfigResult = {
  source: "backend" | "unavailable";
  config: PushNotificationConfig;
  message?: string;
};

export type SavePushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent: string;
  reason?: string;
  installationId?: string;
};

export type PushSubscriptionResponse = {
  id: string;
  enabled: boolean;
  commuteNotificationsEnabled: boolean;
  plannedClosureNotificationsEnabled: boolean;
};

export type PendingPushNotification = {
  title: string;
  body: string;
  url: string;
  tag: string;
  state?: "ACTIVE" | "CLEARED";
  timestamp?: string;
  sourceEventAt?: string;
  sentAt?: string;
  expiresAt?: string;
};

export type PendingPushNotificationResponse = {
  notification: PendingPushNotification | null;
};

export type PushClientEvent = {
  stage: string;
  message: string | null;
  occurredAt: string;
};

export type PushDeliveryDiagnostic = {
  id: string;
  title: string;
  tag: string;
  notificationState: string;
  category: string;
  eventType: string | null;
  lineId: string | null;
  lineNumber: string | null;
  eventCreatedAt: string | null;
  deviceLabel: string;
  userAgent: string;
  endpointHashPrefix: string;
  installationIdPrefix?: string | null;
  registrationReason?: string | null;
  subscriptionEnabled: boolean;
  deliveryStatus: string;
  httpStatus: number | null;
  deliveryMessage: string | null;
  lastAttemptAt: string | null;
  displayedAt: string | null;
  attemptCount: number;
  clientEvents: PushClientEvent[];
};

export type PushRecipientDiagnostic = {
  subscriptionId: string;
  deviceLabel: string;
  userAgent: string;
  endpointHashPrefix: string;
  installationIdPrefix?: string | null;
  registrationReason?: string | null;
  subscriptionEnabled: boolean;
  enabledAt: string | null;
  disabledAt: string | null;
  status: "attempted" | "not-attempted" | string;
  reasonCode: string;
  reason: string;
  delivery: PushDeliveryDiagnostic | null;
};

export type PushNotificationDiagnosticGroup = {
  id: string;
  title: string;
  tag: string;
  notificationKey: string;
  sourceIncidentKey: string | null;
  notificationState: string;
  category: string;
  eventType: string | null;
  lineId: string | null;
  lineNumber: string | null;
  eventCreatedAt: string | null;
  attempts: PushDeliveryDiagnostic[];
  recipients: PushRecipientDiagnostic[];
};

export type PushDeliveryDiagnosticsResult = {
  source: "backend" | "unavailable";
  notifications: PushNotificationDiagnosticGroup[];
  deliveries: PushDeliveryDiagnostic[];
  message?: string;
};

export type PushDevice = {
  id: string;
  deviceLabel: string;
  userAgent: string;
  endpointHashPrefix: string;
  installationIdPrefix?: string | null;
  registrationReason?: string | null;
  previousEndpointCount?: number;
  enabled: boolean;
  registrationInceptionAt?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastSeenAt: string | null;
  disabledAt: string | null;
  lastAttemptAt: string | null;
  lastAcceptedAt: string | null;
  lastDisplayedAt: string | null;
  acceptedWithoutDisplayCount: number;
  deliveryHealth: "displayed" | "accepted-no-display" | "sent-no-display" | "registered" | "disabled" | string;
  staleCandidate: boolean;
};

export type PushDevicesResult = {
  source: "backend" | "unavailable";
  devices: PushDevice[];
  vapidKeyFingerprint: string | null;
  message?: string;
};

export type PushDeviceTestResult = {
  delivery: PushDeliveryDiagnostic;
};

export async function getPushNotificationConfig(options: AdapterOptions = {}): Promise<PushNotificationConfigResult> {
  try {
    const fetcher = options.fetcher ?? fetch;
    const response = await fetcher(apiUrl("/api/account/push/config", options), {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      throw await accountRequestError(response, "Push config request failed");
    }
    const config = await readJson<PushNotificationConfig>(response);
    return {
      source: "backend",
      config: {
        ...config,
        preferences: normalizePushNotificationPreferences(config.preferences),
      },
    };
  } catch {
    return {
      source: "unavailable",
      config: {
        webPushAvailable: false,
        vapidPublicKey: "",
        preferences: defaultPushNotificationPreferences,
      },
      message: "Push notifications are unavailable.",
    };
  }
}

export async function getPushDeliveryDiagnostics(options: AdapterOptions = {}): Promise<PushDeliveryDiagnosticsResult> {
  try {
    const fetcher = options.fetcher ?? fetch;
    const response = await fetcher(apiUrl("/api/account/push/diagnostics", options), {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      throw await accountRequestError(response, "Push diagnostics request failed");
    }
    const body = await readJson<{
      notifications?: PushNotificationDiagnosticGroup[];
      deliveries?: PushDeliveryDiagnostic[];
    }>(response);
    const deliveries = Array.isArray(body.deliveries) ? body.deliveries : [];
    const notifications = Array.isArray(body.notifications)
      ? body.notifications.map((notification) => ({
          ...notification,
          recipients: Array.isArray(notification.recipients) ? notification.recipients : [],
        }))
      : deliveries.map((delivery) => ({
          id: delivery.id,
          title: delivery.title,
          tag: delivery.tag,
          notificationKey: delivery.tag.replace(/\|(active|cleared)$/i, ""),
          sourceIncidentKey: null,
          notificationState: delivery.notificationState,
          category: delivery.category,
          eventType: delivery.eventType,
          lineId: delivery.lineId,
          lineNumber: delivery.lineNumber,
          eventCreatedAt: delivery.eventCreatedAt,
          attempts: [delivery],
          recipients: [{
            subscriptionId: "",
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
          }],
        }));
    return { source: "backend", notifications, deliveries };
  } catch {
    return {
      source: "unavailable",
      notifications: [],
      deliveries: [],
      message: "Push delivery diagnostics are unavailable.",
    };
  }
}

export async function getPushDevices(options: AdapterOptions = {}): Promise<PushDevicesResult> {
  try {
    const fetcher = options.fetcher ?? fetch;
    const response = await fetcher(apiUrl("/api/account/push/devices", options), {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      throw await accountRequestError(response, "Push devices request failed");
    }
    const body = await readJson<{ devices?: PushDevice[]; vapidKeyFingerprint?: string | null }>(response);
    return {
      source: "backend",
      devices: Array.isArray(body.devices) ? body.devices : [],
      vapidKeyFingerprint: typeof body.vapidKeyFingerprint === "string" ? body.vapidKeyFingerprint : null,
    };
  } catch {
    return {
      source: "unavailable",
      devices: [],
      vapidKeyFingerprint: null,
      message: "Push devices are unavailable.",
    };
  }
}

export async function savePushSubscription(input: SavePushSubscriptionInput, options: AdapterOptions = {}) {
  return accountJsonRequest<PushSubscriptionResponse>(
    "/api/account/push/subscription",
    { method: "PUT", body: JSON.stringify(input) },
    options,
  );
}

export async function updatePushPreferences(input: PushNotificationPreferences, options: AdapterOptions = {}) {
  const preferences = await accountJsonRequest<PushNotificationPreferences>(
    "/api/account/push/preferences",
    { method: "PUT", body: JSON.stringify(input) },
    options,
  );
  return normalizePushNotificationPreferences(preferences);
}

export async function getLatestPushNotificationForSubscription(endpoint: string, options: AdapterOptions = {}) {
  return accountJsonRequest<PendingPushNotificationResponse>(
    "/api/account/push/latest",
    { method: "POST", body: JSON.stringify({ endpoint }) },
    options,
  );
}

export async function disablePushSubscription(endpoint: string, options: AdapterOptions = {}) {
  await accountJsonRequest<void>(
    "/api/account/push/subscription/disable",
    { method: "POST", body: JSON.stringify({ endpoint }) },
    options,
  );
}

export async function disablePushDevice(subscriptionId: string, options: AdapterOptions = {}) {
  await accountEmptyRequest(
    `/api/account/push/devices/${encodeURIComponent(subscriptionId)}/disable`,
    { method: "POST" },
    options,
  );
}

export async function sendPushDeviceTestNotification(subscriptionId: string, options: AdapterOptions = {}) {
  return accountJsonRequest<PushDeviceTestResult>(
    `/api/account/push/devices/${encodeURIComponent(subscriptionId)}/test`,
    { method: "POST" },
    options,
  );
}

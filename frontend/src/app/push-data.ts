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
  // Hash of the endpoint this device saved last; the server never sees it raw.
  previousEndpointHash?: string;
  browserMajorVersion?: number;
  displayMode?: "standalone" | "browser";
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

// Notification diagnostics around browser installations (plan 12). Hash and
// installation prefixes only; the backend never sends endpoints or keys.
export type PushDeviceStatus = "reachable" | "unreachable" | "off";

export type PushDeviceDiagnostic = {
  key: string;
  label: string;
  status: PushDeviceStatus;
  statusSince: string | null;
  currentSubscriptionId: string | null;
  shown: number;
  sentWhileReachable: number;
  missedWhileUnreachable: number;
  lastShownAt: string | null;
  lastShownTitle: string | null;
  replacements: number;
  browserMajorVersion: number | null;
  displayMode: string | null;
  installationIdPrefix: string | null;
  endpointHashPrefix: string;
  registrationReason: string | null;
  endpointCount: number;
};

export type PushAlertOutcome = {
  deviceKey: string;
  outcome: "shown" | "sent" | "missed" | "not-sent";
  at: string | null;
  reason: string | null;
  catchUp: boolean;
  technical: string | null;
};

export type PushAlertDiagnostic = {
  id: string;
  title: string;
  notificationState: string;
  category: string;
  lineId: string | null;
  lineNumber: string | null;
  createdAt: string | null;
  outcomes: PushAlertOutcome[];
};

export type PushLifecycleRecord = {
  occurredAt: string;
  deviceKey: string | null;
  eventType: string;
  reason: string;
  endpointHashPrefix: string | null;
  previousEndpointHashPrefix: string | null;
  browserMajorVersion: number | null;
  displayMode: string | null;
  detail: string | null;
};

export type PushDiagnosticsResult = {
  source: "backend" | "unavailable";
  windowStart: string | null;
  devices: PushDeviceDiagnostic[];
  alerts: PushAlertDiagnostic[];
  vapidKeyFingerprint: string | null;
  lifecycle: PushLifecycleRecord[];
  message?: string;
};

export type PushDeviceTestResult = {
  deliveryStatus: string;
  httpStatus: number | null;
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

export async function getPushDiagnostics(options: AdapterOptions = {}): Promise<PushDiagnosticsResult> {
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
      windowStart?: string | null;
      devices?: PushDeviceDiagnostic[];
      alerts?: PushAlertDiagnostic[];
      technical?: { vapidKeyFingerprint?: string | null; lifecycle?: PushLifecycleRecord[] };
    }>(response);
    return {
      source: "backend",
      windowStart: body.windowStart ?? null,
      devices: Array.isArray(body.devices) ? body.devices : [],
      alerts: Array.isArray(body.alerts)
        ? body.alerts.map((alert) => ({ ...alert, outcomes: Array.isArray(alert.outcomes) ? alert.outcomes : [] }))
        : [],
      vapidKeyFingerprint: body.technical?.vapidKeyFingerprint ?? null,
      lifecycle: Array.isArray(body.technical?.lifecycle) ? body.technical.lifecycle : [],
    };
  } catch {
    return {
      source: "unavailable",
      windowStart: null,
      devices: [],
      alerts: [],
      vapidKeyFingerprint: null,
      lifecycle: [],
      message: "Notification diagnostics are unavailable.",
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

// "user-disabled" ends the installation's enablement; "vapid-key-changed" is a
// replacement the next subscription continues.
export async function disablePushSubscription(
  endpoint: string,
  { reason = "user-disabled", ...options }: AdapterOptions & { reason?: "user-disabled" | "vapid-key-changed" } = {},
) {
  await accountJsonRequest<void>(
    "/api/account/push/subscription/disable",
    { method: "POST", body: JSON.stringify({ endpoint, reason }) },
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

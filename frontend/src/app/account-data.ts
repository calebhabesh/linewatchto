import { apiUrl as buildApiUrl } from "./api-client.ts";

type Fetcher = typeof fetch;

type AdapterOptions = {
  fetcher?: Fetcher;
  apiBaseUrl?: string;
};

export type AccountUser = {
  id: string;
  email: string;
  displayName: string;
  demo: boolean;
  googleLinked: boolean;
};

export type AccountState = {
  source: "backend" | "unavailable";
  authenticated: boolean;
  user: AccountUser | null;
  message?: string;
};

export type AuthResponse = {
  authenticated: boolean;
  user: AccountUser | null;
};

export type AuthConfig = {
  googleSignInAvailable: boolean;
  googleClientId: string;
};

export type GoogleAuthMode = "login" | "link";

export type AuthConfigResult = {
  source: "backend" | "unavailable";
  config: AuthConfig;
  message?: string;
};

export const unavailableAuthConfig: AuthConfig = {
  googleSignInAvailable: false,
  googleClientId: "",
};

export type PasswordResetRequestResponse = {
  accepted: boolean;
  message: string;
  devResetToken?: string | null;
  expiresAt?: string | null;
};

export type AccountCommutePath = {
  status: "available" | "unavailable";
  stationIds: string[];
  segmentIds: string[];
  segmentHops: AccountCommutePathSegmentHop[];
  lineIds: string[];
  transferStationIds: string[];
  estimatedTravelSeconds: number;
  weightSource: "gtfs-scheduled-median" | "mixed-scheduled-fallback" | "seeded-fallback" | "topology-fallback" | "unavailable";
  summary: string;
};

export type AccountCommutePathSegmentHop = {
  segmentId: string;
  lineId: string;
  fromStationId: string;
  toStationId: string;
  travelDirection: "forward" | "reverse" | "bidirectional";
};

export type AccountMatchedImpact = {
  id: string;
  kind: "suspension" | "delay" | "reduced-speed-zone" | "planned-closure";
  status: "current" | "planned";
  severity: "minor" | "major" | "suspended" | "planned";
  title: string;
  lineId: string | null;
  lineNumber: string | null;
  location: string | null;
  displayDirection: string | null;
  description?: string | null;
  source: string;
  matchedSegmentIds: string[];
  matchedStationIds: string[];
  startedAt?: string | null;
  updatedAt?: string | null;
  window?: string | null;
  timingStatus?: "active-now" | "upcoming" | "unknown" | null;
  eventStartAt?: string | null;
};

export type AccountCommuteTravelTimeEstimate = {
  status: "standard" | "estimated" | "unreliable" | "unavailable";
  baselineSeconds: number;
  estimatedLowSeconds: number | null;
  estimatedHighSeconds: number | null;
  extraLowSeconds: number | null;
  extraHighSeconds: number | null;
  confidence: "high" | "medium" | "low" | "none" | string;
  summary: string;
};

export type AccountCommuteImpact = {
  status: "clear" | "affected" | "planned" | "unavailable";
  severity: "clear" | "minor" | "major" | "suspended" | "planned" | "unavailable";
  statusLabel: string;
  detail: string;
  matchedImpacts: AccountMatchedImpact[];
  travelTimeEstimate?: AccountCommuteTravelTimeEstimate | null;
};

export type AccountCommuteLegId = "outbound" | "return";

export type AccountCommuteLeg = {
  id: AccountCommuteLegId;
  routeLabel: string;
  fromStationId: string;
  fromStationName: string;
  toStationId: string;
  toStationName: string;
  path: AccountCommutePath;
  impact: AccountCommuteImpact;
};

export type AccountSavedCommuteNotificationEventTypes = {
  suspensions: boolean;
  delays: boolean;
  reducedSpeedZones: boolean;
  plannedClosures: boolean;
  serviceRestored: boolean;
};

export type AccountSavedCommuteNotificationRule = {
  enabled: boolean;
  dayMask: number;
  startMinute: number | null;
  endMinute: number | null;
  sectionStartStationId: string | null;
  sectionEndStationId: string | null;
  outboundEnabled: boolean;
  returnEnabled: boolean;
  eventTypes: AccountSavedCommuteNotificationEventTypes;
};

export const defaultSavedCommuteNotificationRule: AccountSavedCommuteNotificationRule = {
  enabled: true,
  dayMask: 127,
  startMinute: null,
  endMinute: null,
  sectionStartStationId: null,
  sectionEndStationId: null,
  outboundEnabled: true,
  returnEnabled: true,
  eventTypes: {
    suspensions: true,
    delays: true,
    reducedSpeedZones: true,
    plannedClosures: true,
    serviceRestored: true,
  },
};

export type AccountSavedCommute = {
  id: string;
  label: string;
  originStationId: string;
  originStationName: string;
  destinationStationId: string;
  destinationStationName: string;
  routeLabel: string;
  watchReturnTrip: boolean;
  outboundLeg: AccountCommuteLeg;
  returnLeg: AccountCommuteLeg | null;
  path: AccountCommutePath;
  impact: AccountCommuteImpact;
  notificationRule: AccountSavedCommuteNotificationRule;
  createdAt: string;
  updatedAt: string;
};

export type AccountCommutePathPreview = {
  id: string;
  commuteId: string;
  legId: AccountCommuteLegId;
  label: string;
  routeLabel: string;
  stationIds: string[];
  segmentIds: string[];
};

export function commuteLegsForCommute(commute: AccountSavedCommute): AccountCommuteLeg[] {
  const outbound = commute.outboundLeg ?? {
    id: "outbound" as const,
    routeLabel: commute.routeLabel,
    fromStationId: commute.originStationId,
    fromStationName: commute.originStationName,
    toStationId: commute.destinationStationId,
    toStationName: commute.destinationStationName,
    path: commute.path,
    impact: commute.impact,
  };
  return commute.watchReturnTrip && commute.returnLeg ? [outbound, commute.returnLeg] : [outbound];
}

export type SavedCommuteStatusSummary = {
  clear: number;
  affectedNow: number;
};

export function summarizeSavedCommuteStatuses(commutes: AccountSavedCommute[]): SavedCommuteStatusSummary {
  return commutes.reduce<SavedCommuteStatusSummary>((summary, commute) => {
    const legs = commuteLegsForCommute(commute);
    if (legs.some((leg) => leg.impact.status === "affected" || leg.impact.matchedImpacts.some((impact) => impact.status === "current"))) {
      summary.affectedNow++;
      return summary;
    }
    if (legs.length > 0 && legs.every((leg) => leg.impact.status === "clear")) {
      summary.clear++;
    }
    return summary;
  }, { clear: 0, affectedNow: 0 });
}

export function commuteLegForCommute(commute: AccountSavedCommute, legId: AccountCommuteLegId = "outbound"): AccountCommuteLeg {
  return commuteLegsForCommute(commute).find((leg) => leg.id === legId) ?? commuteLegsForCommute(commute)[0];
}

export function commutePathPreviewFromCommute(commute: AccountSavedCommute, legId: AccountCommuteLegId = "outbound"): AccountCommutePathPreview | null {
  const leg = commuteLegForCommute(commute, legId);
  if (leg.path.status !== "available" || leg.path.segmentIds.length === 0) {
    return null;
  }

  return {
    id: `${commute.id}-${leg.id}`,
    commuteId: commute.id,
    legId: leg.id,
    label: commute.label,
    routeLabel: leg.routeLabel,
    stationIds: leg.path.stationIds,
    segmentIds: leg.path.segmentIds,
  };
}

export type AccountSavedCommuteResult = {
  source: "backend" | "unavailable";
  commutes: AccountSavedCommute[];
  message?: string;
};

export type CreateSavedCommuteInput = {
  label: string;
  originStationId: string;
  destinationStationId: string;
  watchReturnTrip?: boolean;
  notificationRule?: AccountSavedCommuteNotificationRule;
};

export type PushNotificationEventTypePreferences = {
  suspensions: boolean;
  delays: boolean;
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
  lineId: "line-1" | "line-2" | "line-4" | "line-5" | "line-6";
  lineNumber: string;
  label: string;
  subscribed: boolean;
};

export type PushNotificationLineSubscriptionPreferences = {
  lines: PushNotificationLinePreference[];
  eventTypes: PushNotificationEventTypePreferences;
};

export type PushNotificationReminderTimingPreferences = {
  onChange: boolean;
  closure24h: boolean;
  closureMorning: boolean;
};

export type PushNotificationPreferences = {
  commuteNotificationsEnabled: boolean;
  plannedClosureNotificationsEnabled: boolean;
  savedCommutes: PushNotificationSavedCommutePreferences;
  lineSubscriptions: PushNotificationLineSubscriptionPreferences;
  reminderTiming: PushNotificationReminderTimingPreferences;
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
    ],
    eventTypes: {
      suspensions: true,
      delays: true,
      reducedSpeedZones: true,
      plannedClosures: true,
      serviceRestored: true,
    },
  },
  reminderTiming: {
    onChange: true,
    closure24h: true,
    closureMorning: true,
  },
};

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
  subscriptionEnabled: boolean;
  deliveryStatus: string;
  httpStatus: number | null;
  deliveryMessage: string | null;
  lastAttemptAt: string | null;
  displayedAt: string | null;
  attemptCount: number;
  clientEvents: PushClientEvent[];
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
  enabled: boolean;
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
  message?: string;
};

function apiUrl(path: string, options: AdapterOptions = {}) {
  return buildApiUrl(path, options.apiBaseUrl);
}

async function readJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

export function normalizeSavedCommuteNotificationRule(
  rule?: Partial<AccountSavedCommuteNotificationRule> | null
): AccountSavedCommuteNotificationRule {
  return {
    ...defaultSavedCommuteNotificationRule,
    ...rule,
    startMinute: typeof rule?.startMinute === "number" ? rule.startMinute : null,
    endMinute: typeof rule?.endMinute === "number" ? rule.endMinute : null,
    sectionStartStationId: rule?.sectionStartStationId ?? null,
    sectionEndStationId: rule?.sectionEndStationId ?? null,
    eventTypes: {
      ...defaultSavedCommuteNotificationRule.eventTypes,
      ...(rule?.eventTypes ?? {}),
    },
  };
}

function normalizeSavedCommute(commute: AccountSavedCommute): AccountSavedCommute {
  return {
    ...commute,
    notificationRule: normalizeSavedCommuteNotificationRule(commute.notificationRule),
  };
}

export class AccountRequestError extends Error {
  status: number;
  errorCode: string | null;

  constructor(status: number, message: string, errorCode: string | null = null) {
    super(message);
    this.name = "AccountRequestError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

async function readAccountError(response: Response) {
  try {
    const body = await response.json() as { error?: string; message?: string };
    return {
      errorCode: body.error ?? null,
      message: body.message || `Account request failed with ${response.status}`,
    };
  } catch {
    return {
      errorCode: null,
      message: `Account request failed with ${response.status}`,
    };
  }
}

async function authJsonRequest<T>(path: string, init: RequestInit = {}, options: AdapterOptions = {}): Promise<T> {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(apiUrl(path, options), {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const error = await readAccountError(response);
    throw new AccountRequestError(response.status, error.message, error.errorCode);
  }
  return readJson<T>(response);
}

async function authRequest(path: string, init: RequestInit = {}, options: AdapterOptions = {}): Promise<AuthResponse> {
  return authJsonRequest<AuthResponse>(path, init, options);
}

export async function getAuthConfig(options: AdapterOptions = {}): Promise<AuthConfigResult> {
  try {
    const config = await authJsonRequest<AuthConfig>("/api/auth/config", { method: "GET", headers: {} }, options);
    return { source: "backend", config };
  } catch {
    return {
      source: "unavailable",
      config: unavailableAuthConfig,
      message: "Auth configuration unavailable.",
    };
  }
}

export function googleAuthStartUrl(input: { mode: GoogleAuthMode; returnTo?: string }, options: AdapterOptions = {}) {
  const params = new URLSearchParams({
    mode: input.mode,
    returnTo: normalizeGoogleReturnTo(input.returnTo),
  });
  return apiUrl(`/api/auth/google/start?${params.toString()}`, options);
}

export async function loginWithGoogle(input: { credential: string }, options: AdapterOptions = {}) {
  return authRequest("/api/auth/google", { method: "POST", body: JSON.stringify(input) }, options);
}

export async function linkGoogleAccount(input: { credential: string }, options: AdapterOptions = {}) {
  return authRequest("/api/auth/google/link", { method: "POST", body: JSON.stringify(input) }, options);
}

function normalizeGoogleReturnTo(returnTo?: string) {
  const candidate = returnTo ?? currentBrowserPath();
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\n") ||
    candidate.includes("\r")
  ) {
    return "/";
  }
  return candidate;
}

function currentBrowserPath() {
  if (typeof window === "undefined") {
    return "/";
  }
  return `${window.location.pathname}${window.location.search}${window.location.hash}` || "/";
}

export async function getCurrentAccount(options: AdapterOptions = {}): Promise<AccountState> {
  try {
    const response = await authRequest("/api/auth/me", { method: "GET", headers: {} }, options);
    return { source: "backend", authenticated: response.authenticated, user: response.user };
  } catch {
    return {
      source: "unavailable",
      authenticated: false,
      user: null,
      message: "Account service unavailable.",
    };
  }
}

export async function registerAccount(input: { email: string; password: string; displayName: string }, options: AdapterOptions = {}) {
  return authRequest("/api/auth/register", { method: "POST", body: JSON.stringify(input) }, options);
}

export async function loginAccount(input: { email: string; password: string }, options: AdapterOptions = {}) {
  return authRequest("/api/auth/login", { method: "POST", body: JSON.stringify(input) }, options);
}

export async function requestPasswordReset(input: { email: string }, options: AdapterOptions = {}) {
  return authJsonRequest<PasswordResetRequestResponse>(
    "/api/auth/password-reset/request",
    { method: "POST", body: JSON.stringify(input) },
    options
  );
}

export async function confirmPasswordReset(input: { token: string; password: string }, options: AdapterOptions = {}) {
  return authRequest(
    "/api/auth/password-reset/confirm",
    { method: "POST", body: JSON.stringify(input) },
    options
  );
}

export async function loginDemoAccount(options: AdapterOptions = {}) {
  return authRequest("/api/auth/demo", { method: "POST" }, options);
}

export async function loginDevAccount(options: AdapterOptions = {}) {
  return authRequest("/api/auth/dev", { method: "POST" }, options);
}

export async function logoutAccount(options: AdapterOptions = {}) {
  return authRequest("/api/auth/logout", { method: "POST" }, options);
}

export async function getSavedCommutes(options: AdapterOptions = {}): Promise<AccountSavedCommuteResult> {
  try {
    const fetcher = options.fetcher ?? fetch;
    const response = await fetcher(apiUrl("/api/account/commutes", options), {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`Saved commutes request failed with ${response.status}`);
    }
    const body = await readJson<{ commutes: AccountSavedCommute[] }>(response);
    return { source: "backend", commutes: body.commutes.map(normalizeSavedCommute) };
  } catch {
    return {
      source: "unavailable",
      commutes: [],
      message: "Saved commutes are unavailable.",
    };
  }
}

export async function createSavedCommute(input: CreateSavedCommuteInput, options: AdapterOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(apiUrl("/api/account/commutes", options), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Create saved commute failed with ${response.status}`);
  }
  return normalizeSavedCommute(await readJson<AccountSavedCommute>(response));
}

export async function updateSavedCommuteNotificationRule(
  id: string,
  notificationRule: AccountSavedCommuteNotificationRule,
  options: AdapterOptions = {}
) {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(apiUrl(`/api/account/commutes/${encodeURIComponent(id)}/notification-rule`, options), {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(notificationRule),
  });
  if (!response.ok) {
    throw new Error(`Update saved commute notification rule failed with ${response.status}`);
  }
  return normalizeSavedCommute(await readJson<AccountSavedCommute>(response));
}

export async function deleteSavedCommute(id: string, options: AdapterOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(apiUrl(`/api/account/commutes/${encodeURIComponent(id)}`, options), {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Delete saved commute failed with ${response.status}`);
  }
}

export async function getPushNotificationConfig(options: AdapterOptions = {}): Promise<PushNotificationConfigResult> {
  try {
    const fetcher = options.fetcher ?? fetch;
    const response = await fetcher(apiUrl("/api/account/push/config", options), {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(`Push config request failed with ${response.status}`);
    }
    const config = await readJson<PushNotificationConfig>(response);
    return { source: "backend", config };
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
      throw new Error(`Push diagnostics request failed with ${response.status}`);
    }
    const body = await readJson<{
      notifications?: PushNotificationDiagnosticGroup[];
      deliveries?: PushDeliveryDiagnostic[];
    }>(response);
    const deliveries = Array.isArray(body.deliveries) ? body.deliveries : [];
    const notifications = Array.isArray(body.notifications)
      ? body.notifications
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
      throw new Error(`Push devices request failed with ${response.status}`);
    }
    const body = await readJson<{ devices?: PushDevice[] }>(response);
    return { source: "backend", devices: Array.isArray(body.devices) ? body.devices : [] };
  } catch {
    return {
      source: "unavailable",
      devices: [],
      message: "Push devices are unavailable.",
    };
  }
}

export async function savePushSubscription(input: SavePushSubscriptionInput, options: AdapterOptions = {}) {
  return authJsonRequest<PushSubscriptionResponse>(
    "/api/account/push/subscription",
    { method: "PUT", body: JSON.stringify(input) },
    options
  );
}

export async function updatePushPreferences(input: PushNotificationPreferences, options: AdapterOptions = {}) {
  return authJsonRequest<PushNotificationPreferences>(
    "/api/account/push/preferences",
    { method: "PUT", body: JSON.stringify(input) },
    options
  );
}

export async function getLatestPushNotificationForSubscription(endpoint: string, options: AdapterOptions = {}) {
  return authJsonRequest<PendingPushNotificationResponse>(
    "/api/account/push/latest",
    { method: "POST", body: JSON.stringify({ endpoint }) },
    options
  );
}

export async function disablePushSubscription(endpoint: string, options: AdapterOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(apiUrl("/api/account/push/subscription/disable", options), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) {
    throw new Error(`Disable push subscription failed with ${response.status}`);
  }
}

export async function disablePushDevice(subscriptionId: string, options: AdapterOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(apiUrl(`/api/account/push/devices/${encodeURIComponent(subscriptionId)}/disable`, options), {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Disable push device failed with ${response.status}`);
  }
}

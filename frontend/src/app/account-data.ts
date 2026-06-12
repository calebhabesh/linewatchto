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
  source: string;
  matchedSegmentIds: string[];
  matchedStationIds: string[];
  startedAt?: string | null;
  updatedAt?: string | null;
  window?: string | null;
  timingStatus?: "active-now" | "upcoming" | "unknown" | null;
};

export type AccountCommuteImpact = {
  status: "clear" | "affected" | "planned" | "unavailable";
  severity: "clear" | "minor" | "major" | "suspended" | "planned" | "unavailable";
  statusLabel: string;
  detail: string;
  matchedImpacts: AccountMatchedImpact[];
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
  watchReturnTrip: boolean;
};

function apiUrl(path: string, options: AdapterOptions = {}) {
  return buildApiUrl(path, options.apiBaseUrl);
}

async function readJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
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
    return { source: "backend", commutes: body.commutes };
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
  return readJson<AccountSavedCommute>(response);
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

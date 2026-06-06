const DEFAULT_API_BASE_URL = process.env.NEXT_PUBLIC_LINEWATCH_API_BASE_URL ?? "http://localhost:8080";

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

export type AccountCommutePath = {
  status: "available" | "unavailable";
  stationIds: string[];
  segmentIds: string[];
  lineIds: string[];
  transferStationIds: string[];
  estimatedTravelSeconds: number;
  weightSource: "gtfs-scheduled-median" | "mixed-scheduled-fallback" | "topology-fallback" | "unavailable";
  summary: string;
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

export type AccountSavedCommute = {
  id: string;
  label: string;
  originStationId: string;
  originStationName: string;
  destinationStationId: string;
  destinationStationName: string;
  routeLabel: string;
  path: AccountCommutePath;
  impact: AccountCommuteImpact;
  createdAt: string;
  updatedAt: string;
};

export type AccountSavedCommuteResult = {
  source: "backend" | "unavailable";
  commutes: AccountSavedCommute[];
  message?: string;
};

export type CreateSavedCommuteInput = {
  label: string;
  originStationId: string;
  destinationStationId: string;
};

function apiUrl(path: string, options: AdapterOptions = {}) {
  return `${options.apiBaseUrl ?? DEFAULT_API_BASE_URL}${path}`;
}

async function readJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

async function authRequest(path: string, init: RequestInit = {}, options: AdapterOptions = {}): Promise<AuthResponse> {
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
    throw new Error(`Account request failed with ${response.status}`);
  }
  return readJson<AuthResponse>(response);
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

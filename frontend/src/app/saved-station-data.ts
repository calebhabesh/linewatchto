import { apiUrl } from "./api-client.ts";
import { AccountRequestError } from "./account-data.ts";
import type { StationSummary } from "./station-data.ts";

export type AccountSavedStation = {
  station: StationSummary;
  savedAt: string;
};

export type SavedStationResult = {
  source: "backend" | "unavailable";
  stations: AccountSavedStation[];
  message?: string;
};

type AdapterOptions = {
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  return await response.json() as T;
}

async function requestError(response: Response) {
  try {
    const body = await readJson<{ error?: string; message?: string }>(response);
    return new AccountRequestError(
      response.status,
      body.message || `Saved stations request failed with ${response.status}`,
      body.error ?? null,
    );
  } catch {
    return new AccountRequestError(response.status, `Saved stations request failed with ${response.status}`);
  }
}

export async function getSavedStations(options: AdapterOptions = {}): Promise<SavedStationResult> {
  try {
    const fetcher = options.fetcher ?? fetch;
    const response = await fetcher(apiUrl("/api/account/stations", options.apiBaseUrl), {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      throw await requestError(response);
    }
    const body = await readJson<{ stations: AccountSavedStation[] }>(response);
    return { source: "backend", stations: body.stations };
  } catch {
    return {
      source: "unavailable",
      stations: [],
      message: "Saved stations are unavailable.",
    };
  }
}

export async function saveStation(stationId: string, options: AdapterOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(
    apiUrl(`/api/account/stations/${encodeURIComponent(stationId)}`, options.apiBaseUrl),
    { method: "PUT", credentials: "include" },
  );
  if (!response.ok) {
    throw await requestError(response);
  }
  return readJson<AccountSavedStation>(response);
}

export async function removeSavedStation(stationId: string, options: AdapterOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(
    apiUrl(`/api/account/stations/${encodeURIComponent(stationId)}`, options.apiBaseUrl),
    { method: "DELETE", credentials: "include" },
  );
  if (!response.ok) {
    throw await requestError(response);
  }
}

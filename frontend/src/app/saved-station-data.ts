import {
  apiUrl,
  accountRequestError,
  accountEmptyRequest,
  readJson,
  AccountRequestError,
  type AdapterOptions,
} from "./account-transport.ts";
import type { StationSummary } from "./station-data.ts";
import type { NetworkId } from "./regional-data.ts";

export { AccountRequestError };

export type AccountSavedStation = {
  networkId: NetworkId;
  station: StationSummary;
  savedAt: string;
};

export type SavedStationResult = {
  source: "backend" | "unavailable";
  stations: AccountSavedStation[];
  message?: string;
};

export async function getSavedStations(options: AdapterOptions = {}): Promise<SavedStationResult> {
  try {
    const fetcher = options.fetcher ?? fetch;
    const response = await fetcher(apiUrl("/api/account/stations", options), {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) {
      throw await accountRequestError(response, "Saved stations request failed");
    }
    const body = await readJson<{ stations: Array<AccountSavedStation | Omit<AccountSavedStation, "networkId">> }>(response);
    return {
      source: "backend",
      stations: body.stations.map((saved) => ({
        ...saved,
        networkId: "networkId" in saved ? saved.networkId : "ttc",
      })),
    };
  } catch {
    return {
      source: "unavailable",
      stations: [],
      message: "Saved stations are unavailable.",
    };
  }
}

export async function saveStation(
  stationId: string,
  networkId: NetworkId = "ttc",
  options: AdapterOptions = {},
) {
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(
    apiUrl(`/api/account/stations/${encodeURIComponent(stationId)}?network=${networkId}`, options),
    { method: "PUT", credentials: "include" },
  );
  if (!response.ok) {
    throw await accountRequestError(response, "Saved stations request failed");
  }
  const saved = await readJson<AccountSavedStation | Omit<AccountSavedStation, "networkId">>(response);
  return {
    ...saved,
    networkId: "networkId" in saved ? saved.networkId : networkId,
  };
}

export async function removeSavedStation(
  stationId: string,
  networkId: NetworkId = "ttc",
  options: AdapterOptions = {},
) {
  await accountEmptyRequest(
    `/api/account/stations/${encodeURIComponent(stationId)}?network=${networkId}`,
    { method: "DELETE" },
    options,
  );
}

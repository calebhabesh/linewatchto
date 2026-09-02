import { deleteEmpty, getJson, putJson } from "./client";
import {
  savedStationListSchema,
  savedStationSchema,
  type SavedStation,
  type SavedStationList,
} from "./saved-stations-schema";

export async function fetchSavedStations(
  token: string,
  signal?: AbortSignal,
): Promise<SavedStationList> {
  return getJson("/api/account/stations", savedStationListSchema, {
    token,
    signal,
  });
}

export async function saveStation(
  token: string,
  stationId: string,
  network: "ttc" | "regional",
  signal?: AbortSignal,
): Promise<SavedStation> {
  return putJson(
    `/api/account/stations/${encodeURIComponent(stationId)}?network=${network}`,
    savedStationSchema,
    {},
    { token, signal },
  );
}

export async function deleteSavedStation(
  token: string,
  stationId: string,
  network: "ttc" | "regional",
  signal?: AbortSignal,
): Promise<void> {
  return deleteEmpty(
    `/api/account/stations/${encodeURIComponent(stationId)}?network=${network}`,
    { token, signal },
  );
}

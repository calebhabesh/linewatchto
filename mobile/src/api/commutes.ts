import { deleteEmpty, getJson, patchJson, postJson } from "./client";
import {
  savedCommuteListSchema,
  savedCommuteSchema,
  type CreateSavedCommuteInput,
  type NotificationRule,
  type SavedCommute,
  type SavedCommuteList,
  type UpdateSavedCommuteInput,
} from "./commutes-schema";

export async function fetchSavedCommutes(
  token: string,
  signal?: AbortSignal,
): Promise<SavedCommuteList> {
  return getJson("/api/account/commutes", savedCommuteListSchema, {
    token,
    signal,
  });
}

export async function createSavedCommute(
  token: string,
  input: CreateSavedCommuteInput,
  signal?: AbortSignal,
): Promise<SavedCommute> {
  return postJson(
    "/api/account/commutes",
    savedCommuteSchema,
    input,
    { token, signal },
  );
}

export async function updateSavedCommute(
  token: string,
  id: string,
  input: UpdateSavedCommuteInput,
  signal?: AbortSignal,
): Promise<SavedCommute> {
  return patchJson(
    `/api/account/commutes/${encodeURIComponent(id)}`,
    savedCommuteSchema,
    input,
    { token, signal },
  );
}

export async function updateSavedCommuteNotificationRule(
  token: string,
  id: string,
  rule: NotificationRule,
  signal?: AbortSignal,
): Promise<SavedCommute> {
  return patchJson(
    `/api/account/commutes/${encodeURIComponent(id)}/notification-rule`,
    savedCommuteSchema,
    rule,
    { token, signal },
  );
}

export async function deleteSavedCommute(
  token: string,
  id: string,
  signal?: AbortSignal,
): Promise<void> {
  return deleteEmpty(
    `/api/account/commutes/${encodeURIComponent(id)}`,
    { token, signal },
  );
}

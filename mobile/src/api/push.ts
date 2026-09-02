import { getJson, putJson } from "./client";
import {
  pushConfigSchema,
  pushPreferencesSchema,
  type PushConfig,
  type PushPreferences,
  type UpdatePushPreferencesInput,
} from "./push-schema";

export async function fetchPushConfig(
  token: string,
  signal?: AbortSignal,
): Promise<PushConfig> {
  return getJson("/api/account/push/config", pushConfigSchema, {
    token,
    signal,
  });
}

export async function updatePushPreferences(
  token: string,
  input: UpdatePushPreferencesInput,
  signal?: AbortSignal,
): Promise<PushPreferences> {
  return putJson(
    "/api/account/push/preferences",
    pushPreferencesSchema,
    input,
    { token, signal },
  );
}

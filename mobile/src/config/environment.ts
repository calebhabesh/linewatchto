import { Platform } from "react-native";

export type ApiConfiguration =
  | { ok: true; baseUrl: string }
  | { ok: false; message: string };

function normalizeBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function resolveApiConfiguration(
  configuredValue = process.env.EXPO_PUBLIC_LINEWATCH_API_BASE_URL,
  development = typeof __DEV__ !== "undefined" && __DEV__,
): ApiConfiguration {
  if (configuredValue) {
    const baseUrl = normalizeBaseUrl(configuredValue);
    return baseUrl
      ? { ok: true, baseUrl }
      : {
          ok: false,
          message: "EXPO_PUBLIC_LINEWATCH_API_BASE_URL must be a valid HTTP or HTTPS URL.",
        };
  }

  if (development) {
    return {
      ok: true,
      baseUrl: Platform.OS === "android" ? "http://10.0.2.2:8080" : "http://127.0.0.1:8080",
    };
  }

  return {
    ok: false,
    message: "This build has no LineWatchTO API URL configured.",
  };
}

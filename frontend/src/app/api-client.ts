const LOCAL_API_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isLocalAbsoluteApiBaseUrl(value: string) {
  try {
    const url = new URL(value);
    return LOCAL_API_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function resolveApiBaseUrl(configuredApiBaseUrl = process.env.NEXT_PUBLIC_LINEWATCH_API_BASE_URL) {
  const trimmed = configuredApiBaseUrl?.trim() ?? "";
  if (!trimmed || isLocalAbsoluteApiBaseUrl(trimmed)) {
    return "";
  }
  return stripTrailingSlash(trimmed);
}

export function apiUrl(path: string, configuredApiBaseUrl?: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${resolveApiBaseUrl(configuredApiBaseUrl)}${normalizedPath}`;
}

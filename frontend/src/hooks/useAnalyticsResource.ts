"use client";

import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "../app/api-client";
import type { AnalyticsError } from "./useReliabilityAnalytics";

const REQUEST_TIMEOUT_MS = 20_000;

class ResourceRequestError extends Error {
  constructor(readonly detail: AnalyticsError) {
    super(detail.message);
  }
}

export async function fetchAnalyticsJson<T>(path: string, signal: AbortSignal): Promise<T> {
  let response: Response;
  const request = new AbortController();
  const cancel = () => request.abort();
  const timeout = window.setTimeout(cancel, REQUEST_TIMEOUT_MS);
  signal.addEventListener("abort", cancel);
  try {
    response = await fetch(apiUrl(path), { cache: "no-store", signal: request.signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ResourceRequestError(navigator.onLine
      ? { kind: "unavailable", message: "Reliability data could not be reached." }
      : { kind: "offline", message: "You are offline. Analytics needs a connection." });
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
  if (response.ok) return await response.json() as T;
  if (response.status === 429) {
    throw new ResourceRequestError({ kind: "rate-limited", message: "Too many ranges were requested. Wait a few minutes, then try again." });
  }
  if (response.status >= 400 && response.status < 500) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new ResourceRequestError({ kind: "refused", message: body?.message ?? "This range could not be read." });
  }
  throw new ResourceRequestError({ kind: "unavailable", message: "Reliability data is unavailable right now." });
}

type Loaded<T> = { key: string; data: T };
type Failed = { key: string; attempt: number; error: AnalyticsError };

/**
 * Lazy-loaded analytics resource hook.
 * Never returns data for a previous path/range; stays idle until `enabled` is true.
 */
export function useAnalyticsResource<T>(
  path: string | null,
  enabled: boolean,
  demoData: T | null,
  isDemo: boolean,
): {
  data: T | null;
  loading: boolean;
  error: AnalyticsError | null;
  retry: () => void;
} {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);

  const retry = useCallback(() => setAttempt((v) => v + 1), []);

  useEffect(() => {
    if (isDemo || !enabled || !path) return;
    const controller = new AbortController();
    fetchAnalyticsJson<T>(path, controller.signal).then(
      (data) => {
        setLoaded({ key: path, data });
        setFailed(null);
      },
      (error) => {
        if (controller.signal.aborted) return;
        const detail: AnalyticsError = error instanceof ResourceRequestError
          ? error.detail
          : { kind: "unavailable", message: "Reliability data is unavailable right now." };
        setFailed({ key: path, attempt, error: detail });
      },
    );
    return () => controller.abort();
  }, [path, enabled, isDemo, attempt]);

  if (isDemo) {
    return { data: demoData, loading: false, error: null, retry };
  }
  if (!enabled || !path) {
    return { data: null, loading: false, error: null, retry };
  }
  const current = loaded?.key === path ? loaded.data : null;
  const error = failed?.key === path ? failed.error : null;
  return {
    data: current,
    loading: !current && !error,
    error,
    retry,
  };
}

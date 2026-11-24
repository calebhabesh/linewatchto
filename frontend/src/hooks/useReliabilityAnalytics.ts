"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { apiUrl } from "../app/api-client";
import type { AnalyticsAvailability, AnalyticsNetworkId, AnalyticsSummary } from "../app/reliability-analytics";
import { resolveAnalyticsRange, type AnalyticsLineOption, type AnalyticsQuery } from "../app/reliability-range";

export type AnalyticsErrorKind = "offline" | "rate-limited" | "refused" | "unavailable";
export type AnalyticsError = { kind: AnalyticsErrorKind; message: string };

/** Data this old is fetched again when the page is looked at again. */
const STALE_AFTER_MS = 60_000;
const REQUEST_TIMEOUT_MS = 20_000;

class AnalyticsRequestError extends Error {
  constructor(readonly detail: AnalyticsError) {
    super(detail.message);
  }
}

async function readJson<T>(path: string, signal: AbortSignal): Promise<T> {
  let response: Response;
  const request = new AbortController();
  const cancel = () => request.abort();
  const timeout = window.setTimeout(cancel, REQUEST_TIMEOUT_MS);
  signal.addEventListener("abort", cancel);
  try {
    response = await fetch(apiUrl(path), { cache: "no-store", signal: request.signal });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new AnalyticsRequestError(navigator.onLine
      ? { kind: "unavailable", message: "Reliability data could not be reached." }
      : { kind: "offline", message: "You are offline. Analytics needs a connection." });
  } finally {
    window.clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
  if (response.ok) return await response.json() as T;
  if (response.status === 429) {
    throw new AnalyticsRequestError({ kind: "rate-limited", message: "Too many ranges were requested. Wait a few minutes, then try again." });
  }
  if (response.status >= 400 && response.status < 500) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new AnalyticsRequestError({ kind: "refused", message: body?.message ?? "This range could not be read." });
  }
  throw new AnalyticsRequestError({ kind: "unavailable", message: "Reliability data is unavailable right now." });
}

function errorDetail(error: unknown): AnalyticsError {
  return error instanceof AnalyticsRequestError
    ? error.detail
    : { kind: "unavailable", message: "Reliability data is unavailable right now." };
}

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

type Loaded<T> = { key: string; data: T; loadedAt: number };
type Failed = { key: string; attempt: number; error: AnalyticsError };

function summaryPath(networkId: AnalyticsNetworkId, from: string, to: string, query: AnalyticsQuery) {
  const params = new URLSearchParams({ network: networkId, from, to });
  if (query.line) params.set("line", query.line);
  if (query.line && query.station) params.set("station", query.station);
  return `/api/reliability/summary?${params.toString()}`;
}

/**
 * Availability, then the summary for the resolved range. `query` is null until the URL is
 * known. The last summary stays available while another range loads; a failure never
 * shows one range's numbers under another range's dates.
 */
export function useReliabilityAnalytics(
  networkId: AnalyticsNetworkId,
  query: AnalyticsQuery | null,
  lines: readonly AnalyticsLineOption[],
) {
  const online = useOnline();
  const [attempt, setAttempt] = useState(0);
  const [availability, setAvailability] = useState<Loaded<AnalyticsAvailability> | null>(null);
  const [availabilityError, setAvailabilityError] = useState<Failed | null>(null);
  const [summary, setSummary] = useState<Loaded<AnalyticsSummary> | null>(null);
  const [summaryError, setSummaryError] = useState<Failed | null>(null);
  const [demo, setDemo] = useState<{ today: string; module: typeof import("../app/reliability-analytics-fixture") } | null>(null);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    readJson<AnalyticsAvailability>(`/api/reliability/availability?network=${networkId}`, controller.signal).then(
      (data) => {
        setAvailability({ key: networkId, data, loadedAt: Date.now() });
        setAvailabilityError(null);
      },
      (error) => {
        if (!controller.signal.aborted) setAvailabilityError({ key: networkId, attempt, error: errorDetail(error) });
      },
    );
    return () => controller.abort();
  }, [networkId, attempt, demo]);

  const shownAvailability = useMemo(
    () => demo ? demo.module.demoAvailability(networkId, demo.today) : availability?.data ?? null,
    [demo, networkId, availability],
  );
  const range = useMemo(
    () => query && shownAvailability ? resolveAnalyticsRange(query, shownAvailability) : null,
    [query, shownAvailability],
  );
  const path = query && range?.from && range.to ? summaryPath(networkId, range.from, range.to, query) : null;

  useEffect(() => {
    if (!path || demo) return;
    const controller = new AbortController();
    readJson<AnalyticsSummary>(path, controller.signal).then(
      (data) => {
        setSummary({ key: path, data, loadedAt: Date.now() });
        setSummaryError(null);
      },
      (error) => {
        if (!controller.signal.aborted) setSummaryError({ key: path, attempt, error: errorDetail(error) });
      },
    );
    return () => controller.abort();
  }, [path, attempt, demo]);

  const loadedAt = summary?.loadedAt ?? null;
  useEffect(() => {
    if (demo) return;
    const refreshIfStale = () => {
      if (document.visibilityState === "visible" && navigator.onLine
        && (loadedAt === null || Date.now() - loadedAt > STALE_AFTER_MS)) reload();
    };
    window.addEventListener("online", reload);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.removeEventListener("online", reload);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [demo, loadedAt, reload]);

  const demoSummary = useMemo(
    () => demo && query && range && shownAvailability
      ? demo.module.demoSummary(networkId, lines, query, range, shownAvailability)
      : null,
    [demo, lines, networkId, query, range, shownAvailability],
  );

  const showDemo = useCallback(async () => {
    const demoModule = await import("../app/reliability-analytics-fixture");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    setDemo({ today, module: demoModule });
  }, []);
  const hideDemo = useCallback(() => {
    setDemo(null);
    reload();
  }, [reload]);

  const isCurrent = Boolean(summary && summary.key === path);
  const failure = demo ? null : path
    ? summaryError?.key === path ? summaryError.error : availabilityError?.error ?? null
    : availabilityError?.error ?? null;
  const waiting = !demo && (!shownAvailability || (path !== null && !isCurrent)) && !failure;

  return {
    availability: shownAvailability,
    range,
    /** The summary for the current range, or while that loads, the one before it. */
    summary: demo ? demoSummary : isCurrent || waiting ? summary?.data ?? null : null,
    loadedAt: demo ? null : loadedAt,
    /** The first load, or another range loading over the last one. */
    loading: waiting,
    error: failure,
    online,
    demo: demo !== null,
    reload,
    showDemo,
    hideDemo,
  };
}

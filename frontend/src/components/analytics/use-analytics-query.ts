"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  parseAnalyticsQuery,
  serializeAnalyticsQuery,
  type AnalyticsLineOption,
  type AnalyticsQuery,
} from "../../app/reliability-range";

const QUERY_CHANGE_EVENT = "linewatch-analytics-query";

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(QUERY_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(QUERY_CHANGE_EVENT, listener);
  };
}

/** The page's filters, kept in the URL. Null in the prerendered page, which has no query. */
export function useAnalyticsQuery(lines: readonly AnalyticsLineOption[]) {
  const search = useSyncExternalStore<string | null>(subscribe, () => window.location.search, () => null);
  const query = useMemo(() => search === null ? null : parseAnalyticsQuery(search, lines), [search, lines]);
  const setQuery = useCallback((next: AnalyticsQuery) => {
    const url = `${window.location.pathname}${serializeAnalyticsQuery(next)}`;
    if (url === `${window.location.pathname}${window.location.search}`) return;
    window.history.pushState(null, "", url);
    window.dispatchEvent(new Event(QUERY_CHANGE_EVENT));
  }, []);
  return [query, setQuery] as const;
}

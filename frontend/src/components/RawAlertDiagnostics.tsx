"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronUp, Copy, RefreshCw, Terminal } from "lucide-react";
import { apiUrl } from "../app/api-client.ts";
import type { RawAlert } from "../app/mock-raw-alerts";
import type { NetworkId } from "../app/regional-data";

type Props = {
  network: NetworkId;
};

type RawAlertPage = {
  items: RawAlert[];
  limit: number;
  offset: number;
  hasMore: boolean;
};

const PAGE_SIZE = 50;

export function RawAlertDiagnostics({ network }: Props) {
  const [rawAlerts, setRawAlerts] = useState<RawAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(false);

    try {
      const endpoint = `/api/diagnostics/raw-alerts/${network}?limit=${PAGE_SIZE}&offset=${offset}`;
      const response = await fetch(apiUrl(endpoint), { cache: "no-store" });
      if (!response.ok) throw new Error(`Raw diagnostics request failed: ${response.status}`);
      const page = await response.json() as RawAlertPage;
      setRawAlerts((current) => append ? [...current, ...page.items] : page.items);
      setHasMore(page.hasMore);
      if (!append) setExpandedIds({});
    } catch {
      if (!append) setRawAlerts([]);
      setHasMore(false);
      setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [network]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchPage(0, false));
  }, [fetchPage]);

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  const filteredAlerts = useMemo(
    () => showActiveOnly ? rawAlerts.filter((alert) => alert.active) : rawAlerts,
    [rawAlerts, showActiveOnly],
  );
  const groups = useMemo(() => groupAlerts(filteredAlerts, network), [filteredAlerts, network]);

  const handleCopy = async (id: string, payload: string) => {
    let formatted = payload;
    try {
      formatted = JSON.stringify(JSON.parse(payload), null, 2);
    } catch {
      // Preserve non-JSON source text exactly as retained.
    }
    try {
      await navigator.clipboard.writeText(formatted);
    } catch {
      return;
    }
    setCopiedId(id);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedId(null);
      copyTimerRef.current = null;
    }, 2000);
  };

  return (
    <div className="flex flex-col gap-3" data-raw-alert-diagnostics>
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
        <strong className="block uppercase tracking-wider">Development / staging diagnostics</strong>
        Retained source records may have redistribution restrictions. Do not publish, mirror, or redistribute this view.
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Terminal size={15} className="shrink-0 text-slate-500 dark:text-slate-400" />
          <strong className="truncate text-xs">Retained source records</strong>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={showActiveOnly}
              onChange={(event) => setShowActiveOnly(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-black/20 text-blue-600 focus:ring-blue-500 dark:border-white/20"
            />
            Active only
          </label>
          <button
            onClick={() => void fetchPage(0, false)}
            disabled={loading || loadingMore}
            className="cursor-pointer rounded-lg p-1.5 transition-colors hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5"
            title="Refresh source records"
            aria-label="Refresh source records"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {loading && rawAlerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
          <span className="text-xs text-slate-500">Loading retained records...</span>
        </div>
      ) : error && rawAlerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-500">
          <AlertCircle className="h-6 w-6" />
          <span className="text-xs">Retained source records are unavailable.</span>
        </div>
      ) : filteredAlerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-500">
          <AlertCircle className="h-6 w-6" />
          <span className="text-xs">
            {showActiveOnly && rawAlerts.length > 0 ? "No active source records in this page." : "No source records retained."}
          </span>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="flex flex-col gap-2">
            <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-orange-600 dark:text-amber-400">
              {group.label} ({group.alerts.length})
            </h3>
            <div className="flex flex-col gap-2">
              {group.alerts.map((alert) => {
                const uniqueId = `${alert.sourceSection || alert.source_section}-${alert.sourceId}`;
                const expanded = Boolean(expandedIds[uniqueId]);
                const title = getAlertTitle(alert.payload, alert.sourceId);
                const badges = getAlertBadges(alert.payload);
                return (
                  <div key={uniqueId} className="flex w-full min-w-0 flex-col overflow-hidden rounded-lg border border-black/5 bg-white dark:border-white/5 dark:bg-[#12151c]">
                    <button
                      onClick={() => setExpandedIds((current) => ({ ...current, [uniqueId]: !current[uniqueId] }))}
                      className="flex w-full cursor-pointer items-start justify-between gap-3 p-3 text-left outline-none transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                      aria-expanded={expanded}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-xs font-bold text-slate-800 dark:text-slate-100">{title}</div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${alert.active
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "border-slate-500/10 bg-slate-500/10 text-slate-500"}`}
                          >
                            {alert.active ? "Active" : "Inactive"}
                          </span>
                          {badges.map((badge) => (
                            <span key={badge} className="rounded border border-slate-500/10 bg-slate-500/10 px-1.5 py-0.5 text-[9px] font-medium tracking-wide text-slate-600 dark:text-slate-400">
                              {badge}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="mt-0.5 shrink-0 text-slate-400">{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
                    </button>

                    {expanded ? (
                      <div className="relative flex w-full min-w-0 flex-col gap-2 overflow-hidden border-t border-black/5 bg-slate-50 p-3 dark:border-white/5 dark:bg-black/40">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Raw JSON payload</span>
                          <button
                            onClick={() => void handleCopy(uniqueId, alert.payload)}
                            className="flex cursor-pointer items-center gap-1 rounded border border-black/10 px-2 py-1 text-[10px] font-medium text-slate-500 transition-colors hover:bg-black/5 hover:text-slate-800 dark:border-white/10 dark:hover:bg-white/5 dark:hover:text-slate-100"
                            aria-label="Copy JSON"
                          >
                            {copiedId === uniqueId ? (
                              <><Check size={12} className="text-emerald-500" /><span className="font-semibold text-emerald-500">Copied!</span></>
                            ) : (
                              <><Copy size={12} /><span>Copy JSON</span></>
                            )}
                          </button>
                        </div>
                        <pre className="block max-h-[300px] w-full select-all overflow-x-auto whitespace-pre rounded-lg border border-black/20 bg-black/90 p-3 font-mono text-[10px] text-emerald-400 dark:border-white/5 dark:bg-[#050608]">
                          {prettify(alert.payload)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      {hasMore ? (
        <button
          onClick={() => void fetchPage(rawAlerts.length, true)}
          disabled={loadingMore}
          className="cursor-pointer rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-black/5 disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
        >
          {loadingMore ? "Loading more..." : "Load more records"}
        </button>
      ) : null}
    </div>
  );
}

function groupAlerts(alerts: RawAlert[], network: NetworkId) {
  if (network === "regional") {
    return [
      { label: "GO Rail", alerts: alerts.filter((alert) => section(alert) === "go") },
      { label: "UP Express", alerts: alerts.filter((alert) => section(alert) === "up") },
      { label: "Other", alerts: alerts.filter((alert) => !["go", "up"].includes(section(alert))) },
    ].filter((group) => group.alerts.length > 0);
  }
  return [
    { label: "Routes", alerts: alerts.filter((alert) => section(alert) === "routes") },
    { label: "Accessibility", alerts: alerts.filter((alert) => section(alert) === "accessibility") },
    { label: "Other", alerts: alerts.filter((alert) => !["routes", "accessibility"].includes(section(alert))) },
  ].filter((group) => group.alerts.length > 0);
}

function section(alert: RawAlert) {
  return alert.sourceSection || alert.source_section || "other";
}

function getAlertTitle(payload: string, sourceId: string) {
  try {
    const parsed = JSON.parse(payload);
    const translatedHeader = parsed.alert?.header_text?.translation?.find(
      (translation: { text?: string; language?: string }) => translation.language === "en",
    )?.text || parsed.alert?.header_text?.translation?.[0]?.text;
    return parsed.title
      || parsed.headerText
      || parsed.customHeaderText
      || parsed.SubjectEnglish
      || translatedHeader
      || `Record ID: ${sourceId}`;
  } catch {
    return `Record ID: ${sourceId}`;
  }
}

function getAlertBadges(payload: string): string[] {
  try {
    const parsed = JSON.parse(payload);
    return [
      parsed.alertType,
      parsed.severity,
      parsed.route ? `Route ${parsed.route}` : parsed.routeType,
      parsed.Category,
      parsed.alert?.effect?.replaceAll("_", " "),
    ].filter((value): value is string => typeof value === "string" && value.length > 0);
  } catch {
    return [];
  }
}

function prettify(payload: string) {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

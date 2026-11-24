"use client";

import { TriangleAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildEpisodesPath,
  describeDrilldown,
  formatMinutes,
  type AnalyticsAvailability,
  type AnalyticsEpisodeItem,
  type AnalyticsEpisodesResponse,
  type AnalyticsNetworkId,
} from "../../app/reliability-analytics";
import {
  activeDrilldown,
  emptyAnalyticsDrilldown,
  hasAnalyticsDrilldown,
  type AnalyticsDrilldown,
  type AnalyticsLineOption,
  type AnalyticsQuery,
  type ResolvedAnalyticsRange,
} from "../../app/reliability-range";
import { fetchAnalyticsJson } from "../../hooks/useAnalyticsResource";
import type { AnalyticsError } from "../../hooks/useReliabilityAnalytics";
import { TransitLineBadge } from "../TransitLineBadge";
import { useInView } from "./ChartFrame";
import styles from "./analytics.module.css";

type DemoModule = typeof import("../../app/reliability-analytics-fixture");

const PAGE_LIMIT = 25;
const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Toronto",
});

function formatTimestamp(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return iso;
  return TIMESTAMP_FORMAT.format(parsed).replace(/\./g, "");
}

export function EpisodesModule({
  networkId,
  lines,
  query,
  range,
  availability,
  demo,
  demoModule,
  onDrilldownChange,
  sectionRef,
}: {
  networkId: AnalyticsNetworkId;
  lines: readonly AnalyticsLineOption[];
  query: AnalyticsQuery;
  range: ResolvedAnalyticsRange;
  availability: AnalyticsAvailability;
  demo: boolean;
  demoModule: DemoModule | null;
  onDrilldownChange: (next: AnalyticsDrilldown) => void;
  sectionRef?: React.RefObject<HTMLElement | null>;
}) {
  const drilldown = activeDrilldown(query);
  const hasFilters = hasAnalyticsDrilldown(drilldown);
  const [inViewRef, inView] = useInView(hasFilters);
  const enabled = inView || hasFilters;

  const setRef = useCallback((node: HTMLElement | null) => {
    inViewRef.current = node;
    if (sectionRef) sectionRef.current = node;
  }, [inViewRef, sectionRef]);

  const basePath = useMemo(() => {
    if (!range.from || !range.to) return null;
    return buildEpisodesPath(networkId, range.from, range.to, query.line, query.station, drilldown, { limit: PAGE_LIMIT });
  }, [networkId, range.from, range.to, query.line, query.station, drilldown]);

  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    items: AnalyticsEpisodeItem[];
    totalCount: number;
    nextCursor: string | null;
    loadingMore: boolean;
    error: AnalyticsError | null;
  } | null>(null);
  const [demoExtraPages, setDemoExtraPages] = useState<{ key: string; count: number }>({ key: "", count: 1 });

  useEffect(() => {
    if (demo || !enabled || !basePath) return;
    const controller = new AbortController();
    fetchAnalyticsJson<AnalyticsEpisodesResponse>(basePath, controller.signal).then(
      (data) => {
        setState({
          key: basePath,
          items: data.episodes,
          totalCount: data.totalCount,
          nextCursor: data.nextCursor,
          loadingMore: false,
          error: null,
        });
      },
      (error) => {
        if (controller.signal.aborted) return;
        const detail: AnalyticsError = error && typeof error === "object" && "detail" in error
          ? (error as { detail: AnalyticsError }).detail
          : { kind: "unavailable", message: "Episodes could not be loaded right now." };
        setState({ key: basePath, items: [], totalCount: 0, nextCursor: null, loadingMore: false, error: detail });
      },
    );
    return () => controller.abort();
  }, [basePath, enabled, demo, attempt]);

  const demoResult = useMemo(() => {
    if (!demo || !demoModule) return null;
    const pages = demoExtraPages.key === basePath ? demoExtraPages.count : 1;
    return demoModule.demoEpisodes(networkId, lines, query, range, availability, drilldown, null, PAGE_LIMIT * pages);
  }, [demo, demoModule, demoExtraPages, basePath, networkId, lines, query, range, availability, drilldown]);

  const current = !demo && state?.key === basePath ? state : null;
  const items = demo ? (demoResult?.episodes ?? []) : (current?.items ?? []);
  const totalCount = demo ? (demoResult?.totalCount ?? 0) : (current?.totalCount ?? 0);
  const nextCursor = demo ? (demoResult?.nextCursor ?? null) : (current?.nextCursor ?? null);
  const loading = !demo && enabled && basePath !== null && !current;
  const loadingMore = Boolean(current?.loadingMore);
  const error = demo ? null : (current?.error ?? null);

  async function loadMore() {
    if (demo) {
      if (!basePath) return;
      setDemoExtraPages((prev) => ({ key: basePath, count: (prev.key === basePath ? prev.count : 1) + 1 }));
      return;
    }
    if (!range.from || !range.to || !basePath || !nextCursor || loadingMore) return;
    setState((prev) => prev && prev.key === basePath ? { ...prev, loadingMore: true } : prev);
    const nextPath = buildEpisodesPath(networkId, range.from, range.to, query.line, query.station, drilldown, {
      limit: PAGE_LIMIT,
      cursor: nextCursor,
    });
    const controller = new AbortController();
    try {
      const page = await fetchAnalyticsJson<AnalyticsEpisodesResponse>(nextPath, controller.signal);
      setState((prev) => prev && prev.key === basePath ? {
        ...prev,
        items: [...prev.items, ...page.episodes],
        totalCount: page.totalCount,
        nextCursor: page.nextCursor,
        loadingMore: false,
      } : prev);
    } catch (err) {
      const detail: AnalyticsError = err && typeof err === "object" && "detail" in err
        ? (err as { detail: AnalyticsError }).detail
        : { kind: "unavailable", message: "More episodes could not be loaded." };
      setState((prev) => prev && prev.key === basePath ? { ...prev, loadingMore: false, error: detail } : prev);
    }
  }

  const chips = useMemo(() => describeDrilldown(drilldown, networkId, lines), [drilldown, networkId, lines]);
  const stationNames = useMemo(
    () => new Map(lines.flatMap((l) => l.stations.map((s) => [s.id, s.name]))),
    [lines],
  );

  return (
    <section
      ref={setRef}
      id="episodes"
      className={styles.moduleCard}
      aria-labelledby="episodes-heading"
      data-analytics-module="episodes"
    >
      <div className={styles.moduleHeader}>
        <div className={styles.moduleTitleGroup}>
          <h2 id="episodes-heading">Counted Episodes</h2>
          <p className={styles.moduleSubtitle}>
            {loading
              ? "Loading counted episodes..."
              : error
                ? "Episodes could not be loaded."
                : `Showing ${items.length.toLocaleString("en-CA")} of ${totalCount.toLocaleString("en-CA")} counted ${totalCount === 1 ? "episode" : "episodes"} in this scope.`}
          </p>
        </div>
        <div className={styles.moduleActions}>
          <div className={styles.segmentedSmall} role="group" aria-label="Episode Sort">
            <button
              type="button"
              aria-pressed={drilldown.sort === "recent"}
              onClick={() => onDrilldownChange({ ...drilldown, sort: "recent" })}
            >
              Newest First
            </button>
            <button
              type="button"
              aria-pressed={drilldown.sort === "longest"}
              onClick={() => onDrilldownChange({ ...drilldown, sort: "longest" })}
            >
              Longest Counted
            </button>
          </div>
        </div>
      </div>

      {chips.length > 0 ? (
        <div className={styles.filterChips} role="region" aria-label="Active Episode Filters">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={styles.filterChip}
              onClick={() => onDrilldownChange(chip.clear(drilldown))}
              aria-label={`Remove filter ${chip.label}`}
            >
              <span>{chip.label}</span>
              <X size={13} aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            className={styles.clearFiltersBtn}
            onClick={() => onDrilldownChange(emptyAnalyticsDrilldown)}
          >
            Clear Filters
          </button>
        </div>
      ) : null}

      {error ? (
        <div className={styles.moduleNotice} role="status">
          <TriangleAlert size={16} aria-hidden="true" />
          <p>{error.message}</p>
          <button type="button" onClick={() => setAttempt((v) => v + 1)}>Try Again</button>
        </div>
      ) : loading || (!enabled && !demo) ? (
        <div className={styles.episodeSkeletonList} aria-busy="true" aria-label="Loading episodes">
          {Array.from({ length: 4 }, (_, idx) => (
            <div key={idx} className={styles.episodeSkeletonRow}>
              <span className={styles.skeleton} style={{ width: "62%" }} />
              <span className={styles.skeleton} style={{ width: "34%" }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className={styles.moduleEmpty}>
          No counted episodes match the current filters in this range.
        </p>
      ) : (
        <>
          <ul className={styles.episodeList} aria-label="Counted Episodes List">
            {items.map((ep) => {
              const stationLabels = ep.stationIds.slice(0, 4).map((id) => stationNames.get(id) ?? id);
              const extraStations = ep.stationIds.length - stationLabels.length;
              return (
                <li key={ep.id} className={styles.episodeItem} data-episode-id={ep.id}>
                  <div className={styles.episodeLeft}>
                    <TransitLineBadge lineId={ep.lineId} lineNumber={ep.lineNumber ?? undefined} size={24} decorative />
                    <div className={styles.episodeContent}>
                      <p className={styles.episodeTitle}>{ep.title}</p>
                      <div className={styles.episodeTags}>
                        <span className={styles.episodePill} data-class={ep.disruptionClass}>{ep.classLabel}</span>
                        <span className={styles.episodePill}>{ep.kindLabel}</span>
                        {ep.planned ? <span className={styles.episodePill} data-planned="true">Planned</span> : null}
                        {ep.causeLabel ? <span className={styles.episodePill}>{ep.causeLabel}</span> : null}
                        {ep.active ? <span className={styles.activeTag}>Active</span> : null}
                      </div>
                      <p className={styles.episodeMeta}>
                        Opened {formatTimestamp(ep.openedAt)}
                        {ep.closedAt ? ` · Cleared ${formatTimestamp(ep.closedAt)}` : ep.active ? " · Ongoing" : ""}
                        {stationLabels.length
                          ? ` · ${stationLabels.join(", ")}${extraStations > 0 ? ` +${extraStations} more` : ""}`
                          : ` · Entire ${networkId === "ttc" ? "Line" : "Corridor"}`}
                      </p>
                    </div>
                  </div>
                  <div className={styles.episodeRight}>
                    <strong>{formatMinutes(ep.countedMinutes)}</strong>
                    <span>Counted</span>
                  </div>
                </li>
              );
            })}
          </ul>
          {nextCursor ? (
            <div className={styles.loadMoreRow}>
              <button type="button" className={styles.loadMoreBtn} disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? "Loading..." : `Load More (${(totalCount - items.length).toLocaleString("en-CA")} Remaining)`}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

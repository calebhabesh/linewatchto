"use client";

import { CloudOff, FlaskConical, Info, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import {
  analyticsEmptyState,
  analyticsKpis,
  comparisonIsUneven,
  confidenceLabel,
  derivationIsBehind,
  formatPercentage,
  showsSlowZones,
  type AnalyticsNetworkId,
} from "../../app/reliability-analytics";
import {
  analyticsQueryForOtherNetwork,
  defaultAnalyticsQuery,
  emptyAnalyticsDrilldown,
  formatDatesInMessage,
  formatServiceDate,
  formatServiceDateRange,
  serializeAnalyticsQuery,
  withAnalyticsDrilldown,
  type AnalyticsDrilldown,
  type AnalyticsLineOption,
} from "../../app/reliability-range";
import { useReliabilityAnalytics } from "../../hooks/useReliabilityAnalytics";
import { AnalyticsControls } from "./AnalyticsControls";
import { AnalyticsKpis } from "./AnalyticsKpis";
import { AnalyticsTable } from "./AnalyticsTable";
import { CoverageStrip } from "./CoverageStrip";
import { EpisodesModule } from "./EpisodesModule";
import { ExportControl } from "./ExportButton";
import { CalendarModule, CancellationsModule, SlowZonesModule } from "./NetworkSpecificModules";
import { BreakdownModule, HowLongModule, TrendModule } from "./TrendAndBreakdownModules";
import { WhenModule, WhereModule } from "./WhenAndWhereModules";
import { useAnalyticsQuery } from "./use-analytics-query";
import styles from "./analytics.module.css";

const TIME_FORMAT = new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" });
const NETWORKS = [
  { id: "ttc", label: "TTC", path: "/ttc/analytics" },
  { id: "regional", label: "GO & UP", path: "/go-up/analytics" },
] as const;

function Notice({ tone, icon, children, actions }: {
  tone: "info" | "warning" | "demo";
  icon: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className={styles.notice} data-tone={tone}>
      {icon}
      <div className={styles.noticeBody}>{children}</div>
      {actions ? <div className={styles.noticeActions}>{actions}</div> : null}
    </div>
  );
}

export function AnalyticsDashboard({ networkId, title, lines }: {
  networkId: AnalyticsNetworkId;
  title: string;
  lines: AnalyticsLineOption[];
}) {
  const [query, setQuery] = useAnalyticsQuery(lines);
  const analytics = useReliabilityAnalytics(networkId, query, lines);
  const { availability, range, summary, loading, error, online, demo, demoModule, loadedAt } = analytics;
  const current = query ?? defaultAnalyticsQuery;
  const line = lines.find((candidate) => candidate.id === current.line);
  const station = line?.stations.find((candidate) => candidate.id === current.station);
  const ttc = networkId === "ttc";
  const slowZonesVisible = showsSlowZones(networkId, summary);
  const episodesRef = useRef<HTMLElement | null>(null);

  function handleChartDrilldown(patch: Partial<AnalyticsDrilldown>) {
    const next: AnalyticsDrilldown = { ...emptyAnalyticsDrilldown, ...patch };
    setQuery(withAnalyticsDrilldown(current, next));
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() => {
      episodesRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    });
  }

  // While another line or station loads, the last numbers keep their own labels.
  const shownLine = summary ? lines.find((candidate) => candidate.id === summary.lineId) : line;
  const shownStation = summary ? summary.stationId !== null : Boolean(station);
  const scope = summary?.scope ?? (line ? "stations" : "lines");
  const empty = range && !loading && !error ? analyticsEmptyState(range, summary) : null;
  const noHistory = empty === "not-enough-history";
  const kpis = useMemo(
    () => summary && analyticsKpis(summary, { networkId, line: Boolean(shownLine), station: shownStation }),
    [summary, networkId, shownLine, shownStation],
  );
  const previous = summary?.previous ?? null;
  const failed = error !== null && !summary;
  const coverage = summary?.coverage ?? null;

  const otherQuery = serializeAnalyticsQuery(analyticsQueryForOtherNetwork(current));
  const announcement = loading || !range || failed
    ? ""
    : `${title}, ${formatServiceDateRange(range.requestedFrom, range.requestedTo)}${
      station ? `, ${station.name}` : line ? `, ${ttc ? "Line " : ""}${line.number} ${line.name}` : ""}. ${
      noHistory ? "Not enough history." : empty === "no-disruptions" ? "No disruptions observed." : "Updated."}`;

  const retryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // "View Demo Data" replaces itself; keep the keyboard on the notice that replaced it.
    if (demo) retryRef.current?.focus();
  }, [demo]);

  return (
    <div className={styles.dashboard} data-analytics-network={networkId} data-analytics-state={
      loading ? "loading" : failed ? "error" : noHistory ? "no-history" : "ready"
    }>
      <header className={styles.heading}>
        <div>
          <p className={styles.kicker}>Reliability Analytics{demo ? <span className={styles.demoTag}>Demo Data</span> : null}</p>
          <h1>{title}</h1>
        </div>
        <div className={styles.headingActions}>
          <ExportControl
            networkId={networkId}
            from={range?.from ?? null}
            to={range?.to ?? null}
            line={current.line}
            station={current.station}
            disabled={loading || failed || noHistory || !range?.from}
            demo={demo}
          />
          <nav className={styles.networkSwitch} aria-label="Analytics Network">
            {NETWORKS.map((network) => (
              <a
                key={network.id}
                href={network.id === networkId ? `${network.path}${serializeAnalyticsQuery(current)}` : `${network.path}${otherQuery}`}
                aria-current={network.id === networkId ? "page" : undefined}
              >
                {network.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <AnalyticsControls
        networkId={networkId}
        lines={lines}
        query={current}
        range={range}
        bounds={availability}
        onChange={setQuery}
      />

      <p className="sr-only" aria-live="polite">{announcement}</p>

      {demo ? (
        <Notice
          tone="demo"
          icon={<FlaskConical size={18} aria-hidden="true" />}
          actions={<button ref={retryRef} type="button" onClick={analytics.hideDemo}>Try Live Data</button>}
        >
          <strong>Demo Data</strong>
          <p>These numbers are invented to show how the page works. They do not describe any service.</p>
        </Notice>
      ) : null}

      {!demo && error ? (
        <Notice
          tone="warning"
          icon={error.kind === "offline" ? <CloudOff size={18} aria-hidden="true" /> : <TriangleAlert size={18} aria-hidden="true" />}
          actions={(
            <>
              <button type="button" onClick={analytics.reload}><RefreshCw size={14} aria-hidden="true" />Try Again</button>
              {failed && error.kind === "unavailable" ? (
                <button type="button" onClick={() => void analytics.showDemo()}>View Demo Data</button>
              ) : null}
            </>
          )}
        >
          <strong>{error.kind === "offline" ? "Offline" : "Analytics Unavailable"}</strong>
          <p>
            {error.message}
            {!failed && loadedAt ? ` Showing numbers loaded at ${TIME_FORMAT.format(loadedAt)}.` : ""}
          </p>
        </Notice>
      ) : !demo && !online ? (
        <Notice tone="warning" icon={<CloudOff size={18} aria-hidden="true" />}>
          <strong>Offline</strong>
          <p>
            {loadedAt && summary
              ? `Showing numbers loaded at ${TIME_FORMAT.format(loadedAt)}. Other ranges need a connection.`
              : "Analytics needs a connection."}
          </p>
        </Notice>
      ) : null}

      {availability && range ? (
        <CoverageStrip range={range} availability={availability} />
      ) : !failed ? (
        <section className={styles.coverage} aria-hidden="true">
          <div className={styles.coverageHeading}><span className={styles.skeleton} /></div>
          <div className={styles.coverageBar}><span data-state="before-history" style={{ flexGrow: 1 }} /></div>
          <div className={styles.coverageFooter}><span className={styles.skeleton} /></div>
        </section>
      ) : null}

      {availability && derivationIsBehind(availability) && availability.derivedThrough ? (
        <Notice tone="warning" icon={<TriangleAlert size={18} aria-hidden="true" />}>
          <strong>History Is Behind</strong>
          <p>Completed days are processed through {formatServiceDate(availability.derivedThrough)}. Later days may be missing.</p>
        </Notice>
      ) : null}

      {noHistory && range ? (
        <section className={styles.empty}>
          <h2>Not enough history for this range</h2>
          <p>
            {!availability?.firstAnalyzableDate
              ? "History begins with the first day that has both a published schedule and successful polling."
              : range.from
                ? `No service from ${formatServiceDateRange(range.from, range.to ?? range.from)} has both a published schedule and successful polling, so nothing can be counted.`
                : `History starts ${formatServiceDate(availability.firstAnalyzableDate)}. Earlier days have no preserved coverage and are not counted.`}
          </p>
          {availability?.firstAnalyzableDate ? (
            <button type="button" onClick={() => setQuery({ ...current, preset: "all", from: null, to: null })}>Show All History</button>
          ) : null}
        </section>
      ) : failed ? null : (
        <div className={styles.results} data-loading={loading || undefined} aria-busy={loading || undefined}>
          {empty === "no-disruptions" ? (
            <Notice tone="info" icon={<Info size={18} aria-hidden="true" />}>
              <strong>No disruptions observed in this range</strong>
              <p>No counted disruption overlapped observed service. Days outside coverage are not counted as clear.</p>
            </Notice>
          ) : null}
          {coverage && coverage.confidence !== "high" ? (
            <Notice tone="warning" icon={<TriangleAlert size={18} aria-hidden="true" />}>
              <strong>Partial Coverage · {confidenceLabel(coverage.confidence)}</strong>
              <p>
                {formatPercentage(coverage.pollingPercentage)} of polling and {formatPercentage(coverage.schedulePercentage)} of
                schedule dates are covered. Disruptions in the gaps are not counted, so totals can read low.
              </p>
            </Notice>
          ) : null}
          {current.compare && summary ? (
            <p className={styles.compareNote}>
              {previous
                ? <>Compared with {formatServiceDateRange(previous.from, previous.to)} ({formatPercentage(previous.coverage.effectivePercentage)} coverage, {confidenceLabel(previous.coverage.confidence)}).{comparisonIsUneven(summary) ? " Coverage differs between the periods, so compare shares rather than counts and hours." : ""}</>
                : `No previous period to compare. ${formatDatesInMessage(summary.previousUnavailableReason ?? "")}`}
            </p>
          ) : null}
          <AnalyticsKpis kpis={kpis} compare={current.compare} compareUnavailable={Boolean(summary) && !previous} />
          <section className={styles.breakdown}>
            <h2>
              {scope === "stations"
                ? shownLine ? `${ttc ? `Line ${shownLine.number}` : shownLine.name} Stations` : "Stations"
                : ttc ? "By Line" : "By Corridor"}
            </h2>
            <AnalyticsTable
              key={scope}
              networkId={networkId}
              scope={scope}
              rows={summary?.rows ?? null}
              previousRows={previous?.rows ?? []}
              showSlowZones={slowZonesVisible}
              showChange={current.compare && scope === "lines"}
              placeholderRows={line ? (station ? 1 : line.stations.length) : lines.length}
            />
          </section>

          {availability && range && range.from && range.to ? (
            <>
              <TrendModule
                networkId={networkId}
                lines={lines}
                query={current}
                range={range}
                availability={availability}
                showSlowZones={slowZonesVisible}
                demo={demo}
                demoModule={demoModule}
                onDrilldown={handleChartDrilldown}
              />

              <div className={styles.moduleGrid}>
                <BreakdownModule
                  networkId={networkId}
                  summary={summary}
                  onDrilldown={handleChartDrilldown}
                />
                <HowLongModule
                  summary={summary}
                  onDrilldown={handleChartDrilldown}
                />
              </div>

              <WhenModule
                networkId={networkId}
                query={current}
                range={range}
                availability={availability}
                showSlowZones={slowZonesVisible}
                demo={demo}
                demoModule={demoModule}
                onDrilldown={handleChartDrilldown}
              />

              <div className={styles.moduleGrid}>
                <WhereModule
                  networkId={networkId}
                  lines={lines}
                  query={current}
                  range={range}
                  availability={availability}
                  showSlowZones={slowZonesVisible}
                  demo={demo}
                  demoModule={demoModule}
                  onDrilldown={handleChartDrilldown}
                />
                {ttc ? (
                  <SlowZonesModule
                    lines={lines}
                    query={current}
                    range={range}
                    availability={availability}
                    demo={demo}
                    demoModule={demoModule}
                    onDrilldown={handleChartDrilldown}
                  />
                ) : (
                  <CancellationsModule
                    lines={lines}
                    query={current}
                    range={range}
                    availability={availability}
                    demo={demo}
                    demoModule={demoModule}
                  />
                )}
              </div>

              <CalendarModule
                networkId={networkId}
                lines={lines}
                query={current}
                range={range}
                availability={availability}
                showSlowZones={slowZonesVisible}
                demo={demo}
                demoModule={demoModule}
                onDrilldown={handleChartDrilldown}
              />

              <EpisodesModule
                sectionRef={episodesRef}
                networkId={networkId}
                lines={lines}
                query={current}
                range={range}
                availability={availability}
                demo={demo}
                demoModule={demoModule}
                onDrilldownChange={(next) => setQuery(withAnalyticsDrilldown(current, next))}
              />
            </>
          ) : null}
        </div>
      )}

      <section className={styles.reading}>
        <p>
          Shares are station-weighted: a disruption counts by the part of the {ttc ? "line" : "corridor"} it affects. Minutes
          cover scheduled service during successful polling
          {summary?.range.includesToday ? ", and include Today So Far" : ""}. Train cancellations and general advisories are
          not counted. These are LineWatchTO observations, not official {ttc ? "TTC" : "Metrolinx"} performance figures.
        </p>
        <a href={ttc ? "/ttc/reliability" : "/go-up/reliability"}>How It Is Measured</a>
      </section>
    </div>
  );
}

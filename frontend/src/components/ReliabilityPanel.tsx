"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Image from "next/image";
import {
  Accessibility,
  ArrowUpRight,
  BarChart3,
  Bus,
  ChevronDown,
  Database,
  Info,
  ShieldCheck,
  TrainFront,
} from "lucide-react";
import { useDashboardData } from "../app/DataContext";
import type { AlertTypeBreakdownItem, DisruptionClassMetricItem } from "../app/linewatch-data";
import { analyticsKpis, type AnalyticsRow, type AnalyticsTrainCancellationSummary } from "../app/reliability-analytics";
import {
  collectionNotice,
  defaultAnalyticsQuery,
  formatServiceDateRange,
  presetHistory,
  serializeAnalyticsQuery,
  type AnalyticsLineOption,
  type AnalyticsPreset,
  type AnalyticsQuery,
} from "../app/reliability-range";
import { formatDisruptionDuration } from "../app/reliability-time";
import { useReliabilityAnalytics } from "../hooks/useReliabilityAnalytics";
import { ClassIcon, KindIcon, StatIcon } from "./analytics/AnalyticsIcons";
import { PanelHeader } from "./PanelHeader";
import { ReliabilityCard } from "./ReliabilityCard";
import { ReliabilityInsights } from "./ReliabilityInsights";
import { TransitLineBadge, transitLineBadgeColors } from "./TransitLineBadge";

interface ReliabilityProps {
  onBack?: () => void;
  onClose?: () => void;
}

function StreetcarIcon({ className }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18.5 3L17.5135 2.50675C17.1355 2.31776 16.9465 2.22326 16.7485 2.15662C16.5725 2.09744 16.3915 2.05471 16.2077 2.02897C16.0008 2 15.7895 2 15.3669 2H8.63313C8.21053 2 7.99923 2 7.79227 2.02897C7.60847 2.05471 7.42745 2.09744 7.25155 2.15662C7.05348 2.22326 6.86449 2.31776 6.4865 2.50675L5.5 3M11 6L9 2M13 6L15 2M4 13H20M17 20L18 22M7 20L6.00016 22M8.5 16.5H8.51M15.5 16.5H15.51M8.8 20H15.2C16.8802 20 17.7202 20 18.362 19.673C18.9265 19.3854 19.3854 18.9265 19.673 18.362C20 17.7202 20 16.8802 20 15.2V10.8C20 9.11984 20 8.27976 19.673 7.63803C19.3854 7.07354 18.9265 6.6146 18.362 6.32698C17.7202 6 16.8802 6 15.2 6H8.8C7.11984 6 6.27976 6 5.63803 6.32698C5.07354 6.6146 4.6146 7.07354 4.32698 7.63803C4 8.27976 4 9.11984 4 10.8V15.2C4 16.8802 4 17.7202 4.32698 18.362C4.6146 18.9265 5.07354 19.3854 5.63803 19.673C6.27976 20 7.11984 20 8.8 20ZM9 16.5C9 16.7761 8.77614 17 8.5 17C8.22386 17 8 16.7761 8 16.5C8 16.2239 8.22386 16 8.5 16C8.77614 16 9 16.2239 9 16.5ZM16 16.5C16 16.7761 15.7761 17 15.5 17C15.2239 17 15 16.7761 15 16.5C15 16.2239 15.2239 16 15.5 16C15.7761 16 16 16.2239 16 16.5Z" />
    </svg>
  );
}

function getMetricDetails(id: string, originalLabel: string) {
  switch (id) {
    case "line-1":
      return {
        label: "Line 1 Yonge-University",
        icon: (
          <Image
            src="/assets/linewatch/line-1-legend.svg?v=2"
            alt="Line 1 icon"
            width={24}
            height={24}
            className="shrink-0 object-contain"
          />
        ),
      };
    case "line-2":
      return {
        label: "Line 2 Bloor-Danforth",
        icon: (
          <Image
            src="/assets/linewatch/line-2-legend.svg?v=2"
            alt="Line 2 icon"
            width={24}
            height={24}
            className="shrink-0 object-contain"
          />
        ),
      };
    case "line-4":
      return {
        label: "Line 4 Sheppard",
        icon: (
          <Image
            src="/assets/linewatch/line-4-legend.svg?v=2"
            alt="Line 4 icon"
            width={24}
            height={24}
            className="shrink-0 object-contain"
          />
        ),
      };
    case "line-5":
      return {
        label: "Line 5 Eglinton",
        icon: (
          <Image
            src="/assets/linewatch/line-5-legend.svg?v=2"
            alt="Line 5 icon"
            width={24}
            height={24}
            className="shrink-0 object-contain"
          />
        ),
      };
    case "line-6":
      return {
        label: "Line 6 Finch West",
        icon: (
          <Image
            src="/assets/linewatch/line-6-legend.svg?v=2"
            alt="Line 6 icon"
            width={24}
            height={24}
            className="shrink-0 object-contain"
          />
        ),
      };
    case "bus":
      return {
        label: "Bus",
        icon: <Bus className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0" />,
      };
    case "streetcar":
      return {
        label: "Streetcar",
        icon: <StreetcarIcon className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0" />,
      };
    case "wheel-trans":
      return {
        label: "Wheel-Trans",
        icon: <Accessibility className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0" />,
      };
    case "elevators":
      return {
        label: "Elevators",
        icon: (
          <Image
            src="/assets/linewatch/outages/elevator.svg"
            alt="Elevators icon"
            width={20}
            height={20}
            className="shrink-0 object-contain"
          />
        ),
      };
    case "escalators":
      return {
        label: "Escalators",
        icon: (
          <Image
            src="/assets/linewatch/outages/escalator.svg"
            alt="Escalators icon"
            width={20}
            height={20}
            className="shrink-0 object-contain"
          />
        ),
      };
    default:
      if (id.startsWith("regional-") || id.startsWith("go-") || id === "up-express") {
        return {
          label: originalLabel,
          icon: (
            <TransitLineBadge
              lineId={id}
              size={24}
              className="shrink-0"
              decorative
            />
          ),
        };
      }
      return {
        label: originalLabel,
        icon: <BarChart3 className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0" />,
      };
  }
}

function DisruptionDuration({ minutes }: { minutes: number | null | undefined }) {
  const [precise, equivalent] = formatDisruptionDuration(minutes).split(" (");
  return (
    <>
      <span className="block">{precise}</span>
      {equivalent ? <small>({equivalent}</small> : null}
    </>
  );
}

function formatReliabilityRange(since: string, until: string): string {
  const start = new Date(since);
  const end = new Date(until);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Last 30 days";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "America/Toronto",
  });
  return `${formatter.format(start)}–${formatter.format(end)}`;
}

const DISRUPTION_CLASS_TONES: Record<string, string> = {
  "service-stopped": "stopped",
  delay: "delay",
  "slow-zone": "slow",
};

function visibleDisruptionClasses(
  classes: DisruptionClassMetricItem[] | undefined,
  networkId: "ttc" | "regional",
): DisruptionClassMetricItem[] {
  if (!classes || classes.length === 0) return [];
  return classes.filter(
    (cls) =>
      networkId === "ttc"
      || cls.disruptionClass !== "slow-zone"
      || cls.incidents > 0
      || cls.uniqueMinutes > 0,
  );
}

function formatReliabilityTitleCase(value: string): string {
  return value.replace(/\b[a-z]/g, character => character.toUpperCase());
}

/** The colours of the type's icon, so the bar needs no separate key. */
function getImpactKindColor(kind: string): string {
  switch (kind.toLowerCase().replace(/_/g, "-")) {
    case "limited-service":
    case "delay":
      return "var(--reliability-delay)";
    case "reduced-speed-zone":
    case "rsz":
      return "var(--reliability-slow)";
    case "planned-closure":
    case "closure":
      return "var(--reliability-planned)";
    default:
      return "var(--reliability-stopped)";
  }
}

function getImpactKindCanonicalLabel(kind: string, rawLabel?: string): string {
  switch (kind.toLowerCase().replace(/_/g, "-")) {
    case "limited-service":
    case "delay":
      return "Delays";
    case "reduced-speed-zone":
    case "rsz":
      return "Reduced Speed Zones";
    case "planned-closure":
    case "closure":
      return "Planned Advisories";
    case "suspension":
      return "Suspensions";
    case "cancellation":
      return "Train Cancellations";
    default:
      if (rawLabel === "Planned Advisories (Active Window Only)" || rawLabel === "Planned Closures (Active Window Only)") {
        return "Planned Advisories";
      }
      return rawLabel || "Service Notices";
  }
}

function AlertTypeBreakdownChart({
  breakdown,
  networkId,
}: {
  breakdown?: AlertTypeBreakdownItem[];
  networkId: "ttc" | "regional";
}) {
  if (!breakdown || breakdown.length === 0) {
    return <div className="reliability-insight-message">No counted alerts in this range.</div>;
  }

  const totalMinutes = breakdown.reduce((sum, item) => sum + item.incidentDisruptionMinutes, 0);
  const totalIncidents = breakdown.reduce((sum, item) => sum + item.incidents, 0);
  const slices = breakdown.map((item) => ({
    ...item,
    label: getImpactKindCanonicalLabel(item.impactKind, item.label),
    color: getImpactKindColor(item.impactKind),
  }));

  return (
    <div className="reliability-kinds">
      <p className="reliability-chart-readout">
        <strong>Share of Incident-Hours</strong> · Overlapping alerts counted separately. {totalIncidents.toLocaleString("en-CA")}{" "}
        {totalIncidents === 1 ? "incident" : "incidents"}, {formatDisruptionDuration(totalMinutes)}.
      </p>
      <div
        className="reliability-kinds-bar"
        role="img"
        aria-label="100% stacked bar showing proportion of incident-hours by alert category"
      >
        {slices.map((slice) => slice.percentage <= 0 && slice.incidentDisruptionMinutes <= 0 ? null : (
          <span
            key={slice.impactKind}
            style={{ width: `${Math.max(1, slice.percentage)}%`, backgroundColor: slice.color }}
            title={`${slice.label}: ${slice.percentage.toFixed(1)}%`}
          />
        ))}
      </div>
      <ul>
        {slices.map((slice) => (
          <li key={slice.impactKind}>
            <KindIcon kind={slice.impactKind} size={15} />
            <span className="reliability-kinds-label">
              {slice.label}
              {slice.impactKind.toLowerCase().includes("closure") ? (
                <small>{networkId === "ttc" ? "(During Active Subway Service Only)" : "(During Scheduled Train Service Only)"}</small>
              ) : null}
            </span>
            <span className="reliability-kinds-detail">
              {formatDisruptionDuration(slice.incidentDisruptionMinutes)} · {slice.incidents.toLocaleString("en-CA")}{" "}
              {slice.incidents === 1 ? "incident" : "incidents"}
            </span>
            <strong>{slice.percentage.toFixed(1)}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One line's or corridor's figures, from the dashboard snapshot or a range summary. */
type PanelRow = {
  id: string;
  number: string | null;
  label: string;
  incidents: number;
  activeIncidents: number;
  medianDurationMinutes: number | null;
  observedServiceMinutes: number;
  serviceImpactPercentage: number;
  serviceImpactMinutes: number;
  incidentDisruptionMinutes: number;
  classes: DisruptionClassMetricItem[];
};

function rangeRow(row: AnalyticsRow): PanelRow {
  return {
    id: row.id,
    number: row.number,
    label: row.label,
    incidents: row.incidents,
    activeIncidents: row.activeIncidents,
    medianDurationMinutes: row.medianTimeToClearMinutes,
    observedServiceMinutes: row.observedMinutes,
    serviceImpactPercentage: row.anyAlertPercentage,
    serviceImpactMinutes: row.uniqueMinutes,
    incidentDisruptionMinutes: row.incidentDisruptionMinutes,
    classes: row.classes,
  };
}

function Stat({ icon, label, title, children, detail }: { icon?: string; label: string; title: string; children: ReactNode; detail?: string }) {
  return (
    <div title={title}>
      <dt>{icon ? <StatIcon id={icon} size={13} /> : null}<span>{label}</span></dt>
      <dd>
        <strong>{children}</strong>
        {detail ? <small>{detail}</small> : null}
      </dd>
    </div>
  );
}

function LineCard({ row, networkId, href }: { row: PanelRow; networkId: "ttc" | "regional"; href: string }) {
  const details = getMetricDetails(row.id, row.label);
  const classItems = visibleDisruptionClasses(row.classes, networkId);
  const serviceStopped = classItems.find((cls) => cls.disruptionClass === "service-stopped");
  const where = networkId === "regional" ? "on corridor" : "on line";
  return (
    <ReliabilityCard
      tint={transitLineBadgeColors(row.id).backgroundColor}
      icon={details.icon}
      title={details.label}
      meta={(
        <>
          {row.activeIncidents > 0 ? <span className="reliability-card-active">{row.activeIncidents} Active</span> : null}
          <span>{row.incidents.toLocaleString("en-CA")} {row.incidents === 1 ? "incident" : "incidents"}</span>
        </>
      )}
      href={href}
      linkLabel="View Details"
    >
      {classItems.length > 0 ? (
        <>
          <p className="reliability-caption">
            <span><StatIcon id="share-affected" size={13} />Station-Weighted Share</span>
            <span>{formatDisruptionDuration(row.observedServiceMinutes)} Observed Service Time</span>
          </p>
          <ul className="reliability-classes">
            {classItems.map((cls) => (
              <li key={cls.disruptionClass}>
                <span className="reliability-class-label"><ClassIcon id={cls.disruptionClass} size={14} />{cls.label} <small>{cls.incidents}</small></span>
                <strong>{cls.weightedSharePercentage.toFixed(1)}%</strong>
                <ShareTrack tone={DISRUPTION_CLASS_TONES[cls.disruptionClass] ?? "accent"} percentage={cls.weightedSharePercentage} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <dl className="reliability-stats">
        {serviceStopped ? (
          <Stat icon="service-stopped-hours" label="Service-Stopped Hours" title="Unique stopped-service time">
            <DisruptionDuration minutes={serviceStopped.uniqueMinutes} />
          </Stat>
        ) : null}
        <Stat
          icon="any-alert"
          label="Time With Any Alert"
          title={`${formatDisruptionDuration(row.serviceImpactMinutes)} ${where}: unique wall-clock disruption during scheduled service`}
        >
          {row.serviceImpactPercentage.toFixed(1)}%
        </Stat>
        <Stat icon="incident-hours" label="Incident-Hours" title="Sum of durations across all concurrent alerts">
          <DisruptionDuration minutes={row.incidentDisruptionMinutes} />
        </Stat>
        <Stat icon="median-time-to-clear" label="Median Time to Clear" title="Half of completed incidents cleared within this time">
          {row.medianDurationMinutes != null ? <DisruptionDuration minutes={row.medianDurationMinutes} /> : "—"}
        </Stat>
      </dl>
    </ReliabilityCard>
  );
}

function ShareTrack({ tone, percentage }: { tone: string; percentage: number }) {
  return (
    <span className="reliability-track" aria-hidden="true">
      <span
        data-tone={tone}
        style={{ "--reliability-share": `${Math.min(100, Math.max(percentage > 0 ? 1 : 0, percentage))}%` } as CSSProperties}
      />
    </span>
  );
}

function CancellationTable({ cancellations }: { cancellations: AnalyticsTrainCancellationSummary }) {
  const most = Math.max(1, ...cancellations.corridors.map((corridor) => corridor.cancellations));
  const count = (value: number) => value.toLocaleString("en-CA");
  return (
    <table className="reliability-cancellations">
      <thead>
        <tr>
          <th scope="col">Corridor</th>
          <td className="reliability-cancellations-bar" />
          <th scope="col" title="Exact Schedule Matches">Matched</th>
          <th scope="col" title="Source-Labeled Unmatched">Unmatched</th>
          <th scope="col" title="Distinct Cancelled Trains Observed">Total</th>
        </tr>
      </thead>
      <tbody>
        {cancellations.corridors.map((corridor) => {
          const details = getMetricDetails(corridor.id, corridor.label);
          const unmatched = Math.max(0, corridor.cancellations - corridor.scheduleMatchedCancellations);
          return (
            <tr key={corridor.id}>
              <th scope="row"><span><TransitLineBadge lineId={corridor.id} size={20} decorative />{details.label}</span></th>
              <td className="reliability-cancellations-bar" aria-hidden="true">
                <span>
                  <i style={{ width: `${(corridor.scheduleMatchedCancellations / most) * 100}%` }} />
                  <i data-unmatched="true" style={{ width: `${(unmatched / most) * 100}%` }} />
                </span>
              </td>
              <td>{count(corridor.scheduleMatchedCancellations)}</td>
              <td>{count(unmatched)}</td>
              <td>{count(corridor.cancellations)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">All Corridors</th>
          <td className="reliability-cancellations-bar" />
          <td>{count(cancellations.scheduleMatchedCancellations)}</td>
          <td>{count(cancellations.sourceLabeledCancellations)}</td>
          <td>{count(cancellations.cancellations)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** Presets the sidebar offers; custom dates need the analytics page. */
const PANEL_PRESETS: { preset: AnalyticsPreset; label: string; title: string }[] = [
  { preset: "30d", label: "30D", title: "Last 30 days" },
  { preset: "90d", label: "90D", title: "Last 90 days" },
  { preset: "6m", label: "6M", title: "Last 6 months" },
  { preset: "ytd", label: "YTD", title: "Year to date" },
  { preset: "12m", label: "12M", title: "Last 12 months" },
  { preset: "all", label: "All", title: "All history" },
];
const NO_LINES: AnalyticsLineOption[] = [];
const KPI_PLACEHOLDERS = ["Service-Stopped Hours", "Delay Incidents", "Median Time to Clear", "Share Affected"];

function ObservedDisruptions() {
  const { networkId, reliability } = useDashboardData();
  const [preset, setPreset] = useState<AnalyticsPreset>("30d");
  const query = useMemo<AnalyticsQuery>(() => ({ ...defaultAnalyticsQuery, preset }), [preset]);
  const { availability, range, summary, loading, error, reload } = useReliabilityAnalytics(networkId, query, NO_LINES);
  // The dashboard already carries the default range, offline copies included.
  const snapshot = preset === "30d";
  const pagePath = networkId === "regional" ? "/go-up/analytics" : "/ttc/analytics";
  const collecting = availability ? collectionNotice(availability) : null;
  const kpis = summary
    ? analyticsKpis(summary, { networkId, line: false, station: false }).filter((kpi) => kpi.id !== "coverage")
    : null;
  const unavailable = error?.message ?? (range && !range.from ? "History has not started." : null);

  // The last summary stays up while another range loads, under its own dates.
  const shown = !snapshot && summary?.range.from ? summary.range : range;
  const dates = shown?.from && shown.to
    ? formatServiceDateRange(shown.from, shown.to)
    : snapshot ? formatReliabilityRange(reliability.since, reliability.until) : null;
  const rows: PanelRow[] = snapshot
    ? reliability.metrics.map((item) => ({ ...item, classes: reliability.methodologyVersion === 1 ? [] : item.classes ?? [] }))
    : (summary?.rows ?? []).map(rangeRow);
  const confidence = snapshot ? reliability.confidence : summary?.coverage?.confidence ?? null;
  const breakdown = snapshot ? reliability.breakdown : summary?.breakdown;
  const cancellations = snapshot ? reliability.trainCancellations : summary?.trainCancellations;

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="reliability-intro">
        <div className="min-w-0">
          <h3>Observed Disruptions</h3>
          <p>
            <span><StatIcon id="dates" size={12} /><strong>{dates ?? "Dates Unavailable"}</strong></span>
            {confidence ? <span><StatIcon id="coverage" size={12} />{formatReliabilityTitleCase(`${confidence} confidence`)}</span> : null}
          </p>
          <p>
            <span>
              <StatIcon id="source" size={12} />
              {snapshot ? `Source: ${formatReliabilityTitleCase(reliability.source.replace(/alert history/gi, "Alert History"))}` : "Source: LineWatchTO Range History"}
            </span>
          </p>
        </div>
        <a className="reliability-open-analytics" href={`${pagePath}${serializeAnalyticsQuery(query)}`}>
          Full Analytics Page
          <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </div>

      <div className="reliability-segments" data-emphasis="true" role="group" aria-label="Date Range">
        {PANEL_PRESETS.map((option) => {
          const history = availability && option.preset !== "all" ? presetHistory(option.preset, availability) : null;
          const filling = history && history.share < 1 ? history : null;
          const recorded = filling ? ` (${filling.recordedDays} of ${filling.days} days recorded so far)` : "";
          return (
            <button
              key={option.preset}
              type="button"
              title={`${option.title}${recorded}`}
              aria-label={`${option.title}${recorded}`}
              aria-pressed={preset === option.preset}
              onClick={() => setPreset(option.preset)}
            >
              {option.label}
              <span className="reliability-segment-fill" aria-hidden="true">
                {filling ? <span style={{ width: `${filling.share * 100}%` }} /> : null}
              </span>
            </button>
          );
        })}
      </div>

      {collecting ? (
        <div className="reliability-notice-banner">
          <Database size={15} aria-hidden="true" />
          <p><strong>{collecting.title}.</strong> {collecting.message}</p>
        </div>
      ) : null}

      <ReliabilityCard
        icon={<BarChart3 size={17} aria-hidden="true" />}
        title="Network Overview"
        meta={summary?.coverage ? <span>{summary.coverage.analyzableDays} of {summary.coverage.totalDays} Days Counted</span> : undefined}
      >
        <dl className="reliability-stats reliability-kpis" aria-busy={loading || undefined}>
          {kpis
            ? kpis.map((kpi) => (
              <Stat key={kpi.id} icon={kpi.id} label={kpi.label} title={kpi.detail} detail={kpi.detail}>
                {kpi.value}{kpi.unit ? ` ${kpi.unit}` : ""}
              </Stat>
            ))
            : KPI_PLACEHOLDERS.map((label) => (
              <Stat key={label} label={label} title={label}>{loading ? "…" : "—"}</Stat>
            ))}
        </dl>
        <ReliabilityInsights
          networkId={networkId}
          from={range?.from ?? null}
          to={range?.to ?? null}
          unavailable={unavailable}
          onRetry={error ? reload : null}
          kinds={<AlertTypeBreakdownChart breakdown={breakdown} networkId={networkId} />}
        />
      </ReliabilityCard>

      <div className="reliability-cards" data-loading={(!snapshot && loading) || undefined}>
        {rows.length > 0 ? rows.map((row) => (
          <LineCard
            key={row.id}
            row={row}
            networkId={networkId}
            href={`${pagePath}${serializeAnalyticsQuery({ ...query, line: row.id })}`}
          />
        )) : snapshot ? (
          <div className="reliability-row">
            <strong>{reliability.scheduleBacked ? "History is accumulating" : "Schedule coverage unavailable"}</strong>
            <p>{reliability.coverageLabel}</p>
          </div>
        ) : null}

        {networkId === "regional" && cancellations ? (
          <ReliabilityCard
            icon={<TrainFront size={17} aria-hidden="true" />}
            title="Train Cancellations"
            meta={dates ? <span>{dates}</span> : undefined}
          >
            {cancellations.observationMinutes > 0
              ? <CancellationTable cancellations={cancellations} />
              : <p className="reliability-chart-readout"><strong>No trip changes have been observed for this range yet.</strong></p>}
            <p className="reliability-chart-readout">
              Source: Recorded GO Trip Changes · {cancellations.coveragePercentage.toFixed(1)}% polling coverage since tracking began ·{" "}
              {formatReliabilityTitleCase(`${cancellations.confidence} confidence`)}
            </p>
          </ReliabilityCard>
        ) : null}
      </div>

      <details className="reliability-method">
        <summary>
          <Info size={15} aria-hidden="true" />
          How This Is Measured
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <p>{snapshot ? reliability.message : summary?.message ?? reliability.message}</p>
        {networkId === "regional" && cancellations ? <p><strong>Train Cancellations:</strong> {cancellations.message}</p> : null}
        <p>
          Confidence reflects how complete the records are, using the lower of polling and schedule-date coverage: low below
          75%, medium from 75% to below 95%, and high at 95% or above. Gaps can leave disruptions uncounted.
        </p>
        <p>
          <strong>Service Window:</strong> {formatReliabilityTitleCase(reliability.serviceWindowBasis)} ·{" "}
          {(reliability.scheduleCoveragePercentage ?? 0).toFixed(1)}% {networkId === "regional" ? "Minimum Date Coverage" : "Date Coverage"}
          {snapshot ? "" : " (Last 30 Days)"}
        </p>
        <p>
          <strong>Coverage:</strong>{" "}
          {snapshot
            ? formatReliabilityTitleCase(reliability.coverageLabel).replace(/\s*·\s*/g, ", ")
            : summary?.coverage ? formatReliabilityTitleCase(summary.coverage.label).replace(/\s*·\s*/g, ", ") : "Unavailable"}
        </p>
      </details>
    </div>
  );
}

function OfficialPerformance() {
  const { ttcPerformance } = useDashboardData();
  const metrics = ttcPerformance.metrics;
  const groups = [
    { title: "On-Time Performance", icon: "on-time", metrics: metrics.filter((metric) => metric.category !== "accessibility") },
    { title: "Availability", icon: "availability", metrics: metrics.filter((metric) => metric.category === "accessibility") },
  ].filter((group) => group.metrics.length > 0);

  return (
    <ReliabilityCard
      icon={<ShieldCheck size={17} aria-hidden="true" />}
      title="Official TTC Performance"
    >
      <p className="reliability-chart-readout">Source: {ttcPerformance.source} · Updated: {ttcPerformance.updatedLabel}</p>
      {metrics.length === 0 ? (
        <p className="reliability-chart-readout"><strong>Official Metrics Unavailable.</strong> {ttcPerformance.message}</p>
      ) : groups.map((group) => (
        <div key={group.title} className="reliability-official">
          <h5><StatIcon id={group.icon} size={15} />{group.title}</h5>
          {group.metrics.map((metric) => {
            const details = getMetricDetails(metric.id, metric.label);
            return (
              <div key={metric.id} className="reliability-official-row">
                {details.icon}
                <strong>{details.label}</strong>
                <span>{metric.target != null ? `Target ${metric.target}%` : ""}</span>
                <b>{metric.valueLabel}</b>
                {metric.percentage !== null ? (
                  <span
                    className="reliability-track reliability-track--official"
                    style={metric.target != null ? { "--reliability-target": `${metric.target}%` } as CSSProperties : undefined}
                    aria-hidden="true"
                  >
                    <span
                      style={{ "--reliability-share": `${Math.max(0, Math.min(100, metric.percentage))}%` } as CSSProperties}
                    />
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </ReliabilityCard>
  );
}

export function ReliabilityPanel({ onBack, onClose }: ReliabilityProps = {}) {
  const { networkId } = useDashboardData();
  return (
    <section className="panel analytics-panel min-w-0 max-w-full w-full border border-transparent rounded-2xl" aria-label="Reliability Analytics" style={{ WebkitBackfaceVisibility: "hidden", backfaceVisibility: "hidden" }}>
      <PanelHeader
        title="Reliability Analytics"
        titleCompact
        icon={<BarChart3 className="w-5 h-5 text-purple-500 shrink-0" aria-hidden="true" />}
        onBack={onBack}
        onClose={onClose}
      />
      <div className="reliability-list min-w-0 max-w-full w-full px-4 pt-1 pb-4 flex flex-col gap-2 overflow-x-hidden">
        {/* Remounted per network, so one network's range is never shown under the other. */}
        <ObservedDisruptions key={networkId} />
        {networkId === "ttc" ? <OfficialPerformance /> : null}
      </div>
    </section>
  );
}

export function IngestionHealthPanel() {
  const { ingestionHealth } = useDashboardData();
  return (
    <section className="health-panel min-w-0 border border-black/10 dark:border-white/10 rounded-lg shadow-xl">
      <PanelHeader
        title="Ingestion System Health"
        icon={<ShieldCheck size={20} className="text-emerald-500 shrink-0" aria-hidden="true" />}
      />
      <div className="health-grid min-w-0 p-3 grid grid-cols-1 gap-3">
        {ingestionHealth.map((health, idx) => (
          <div
            key={idx}
            className="health-item min-w-0 p-3 rounded-lg !bg-slate-50 dark:!bg-[#12151c] border border-black/5 dark:border-white/5 flex gap-3 items-start"
          >
            <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] mt-1.5" />
            <div className="min-w-0">
              <strong className="text-xs font-bold text-slate-800 dark:text-white whitespace-normal break-words">
                {health.label}
              </strong>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-normal break-words">
                {health.value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

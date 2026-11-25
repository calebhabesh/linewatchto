"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import {
  classMetric,
  defaultAnalyticsSort,
  formatHours,
  formatMinutes,
  formatPercentage,
  pointsChange,
  sortAnalyticsRows,
  type AnalyticsNetworkId,
  type AnalyticsRow,
  type AnalyticsSort,
  type AnalyticsSortKey,
} from "../../app/reliability-analytics";
import { TransitLineBadge } from "../TransitLineBadge";
import { ChangeText } from "./AnalyticsKpis";
import { ClassIcon } from "./AnalyticsIcons";
import styles from "./analytics.module.css";

type Column = {
  key: AnalyticsSortKey;
  label: string;
  title?: string;
  swatch?: "service-stopped" | "delay" | "slow-zone";
  cell: (row: AnalyticsRow) => React.ReactNode;
};

function ShareCell({ value }: { value: number }) {
  return (
    <span className={styles.shareCell}>
      <span>{formatPercentage(value)}</span>
      <span className={styles.shareTrack} aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </span>
    </span>
  );
}

export function AnalyticsTable({
  networkId,
  scope,
  rows,
  previousRows,
  showSlowZones,
  showChange,
  placeholderRows,
}: {
  networkId: AnalyticsNetworkId;
  scope: "lines" | "stations";
  /** Null while the first range loads. */
  rows: AnalyticsRow[] | null;
  previousRows: AnalyticsRow[];
  showSlowZones: boolean;
  showChange: boolean;
  placeholderRows: number;
}) {
  const [chosenSort, setSort] = useState<AnalyticsSort>(defaultAnalyticsSort);
  const sort = chosenSort.key === "change" && !showChange ? defaultAnalyticsSort : chosenSort;
  const sorted = useMemo(() => rows && sortAnalyticsRows(rows, sort, previousRows), [rows, sort, previousRows]);
  const previousById = useMemo(() => new Map(previousRows.map((row) => [row.id, row])), [previousRows]);
  const nameLabel = scope === "stations" ? "Station" : networkId === "ttc" ? "Line" : "Corridor";

  const share = (key: "service-stopped" | "delay" | "slow-zone") =>
    (row: AnalyticsRow) => formatPercentage(classMetric(row, key)?.weightedSharePercentage ?? 0);
  const columns: Column[] = [
    {
      key: "share",
      label: "Share Affected",
      title: "Share of observed service affected by any counted disruption, weighted by stations",
      cell: (row) => <ShareCell value={row.weightedImpactPercentage} />,
    },
    ...(showChange ? [{
      key: "change" as const,
      label: "Change",
      title: "Share Affected against the previous period",
      cell: (row: AnalyticsRow) => {
        const before = previousById.get(row.id);
        return before ? <ChangeText change={pointsChange(row.weightedImpactPercentage, before.weightedImpactPercentage)} /> : "—";
      },
    }] : []),
    { key: "service-stopped", label: "Service Stopped", swatch: "service-stopped", cell: share("service-stopped") },
    { key: "delay", label: "Delays", swatch: "delay", cell: share("delay") },
    ...(showSlowZones ? [{
      key: "slow-zone" as const, label: "Slow Zones", swatch: "slow-zone" as const, cell: share("slow-zone"),
    }] : []),
    {
      key: "stopped-hours",
      label: "Stopped Hours",
      title: "Hours with service stopped somewhere on it",
      cell: (row) => `${formatHours(classMetric(row, "service-stopped")?.uniqueMinutes ?? 0)} hr`,
    },
    {
      key: "incidents",
      label: "Incidents",
      cell: (row) => (
        <>
          {row.incidents.toLocaleString("en-CA")}
          {row.activeIncidents > 0 ? <span className={styles.activeTag}>{row.activeIncidents} Active</span> : null}
        </>
      ),
    },
    { key: "median", label: "Median Clear", title: "Median time to clear", cell: (row) => formatMinutes(row.medianTimeToClearMinutes) },
    { key: "p90", label: "P90 Clear", title: "9 in 10 incidents cleared within this time", cell: (row) => formatMinutes(row.p90TimeToClearMinutes) },
    {
      key: "any-alert",
      label: "Time With Any Alert",
      title: "Share of observed service with any counted alert, not weighted",
      cell: (row) => formatPercentage(row.anyAlertPercentage),
    },
  ];

  function toggle(key: AnalyticsSortKey) {
    setSort(sort.key === key ? { key, descending: !sort.descending } : { key, descending: key !== "name" });
  }

  function header(key: AnalyticsSortKey, label: string, title?: string, swatch?: Column["swatch"]) {
    const active = sort.key === key;
    const Icon = !active ? ChevronsUpDown : sort.descending ? ArrowDown : ArrowUp;
    return (
      <th key={key} scope="col" aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"}>
        <button type="button" title={title} onClick={() => toggle(key)}>
          {swatch ? <ClassIcon id={swatch} size={14} /> : null}
          <span>{label}</span>
          <Icon size={13} aria-hidden="true" data-active={active || undefined} />
        </button>
      </th>
    );
  }

  return (
    <div
      className={styles.tableScroll}
      role="region"
      aria-label={`${nameLabel} Breakdown`}
      tabIndex={0}
    >
      <table className={styles.table}>
        <thead>
          <tr>
            {header("name", nameLabel)}
            {columns.map((column) => header(column.key, column.label, column.title, column.swatch))}
          </tr>
        </thead>
        <tbody>
          {sorted ? sorted.map((row) => (
            <tr key={row.id}>
              <th scope="row">
                <span className={styles.rowName}>
                  {scope === "lines" ? (
                    <TransitLineBadge lineId={row.id} lineNumber={row.number ?? undefined} size={24} decorative />
                  ) : null}
                  <span>
                    {scope === "lines" && networkId === "ttc" ? <span className="sr-only">Line {row.number} </span> : null}
                    {row.label}
                  </span>
                </span>
              </th>
              {columns.map((column) => <td key={column.key}>{column.cell(row)}</td>)}
            </tr>
          )) : Array.from({ length: placeholderRows }, (_, index) => (
            <tr key={index} aria-hidden="true">
              <th scope="row"><span className={styles.skeleton} /></th>
              {columns.map((column) => <td key={column.key}><span className={styles.skeleton} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

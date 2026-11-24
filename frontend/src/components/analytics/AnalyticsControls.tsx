"use client";

import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";
import type { AnalyticsNetworkId } from "../../app/reliability-analytics";
import {
  activeDrilldown,
  isServiceDate,
  withAnalyticsDrilldown,
  type AnalyticsLineOption,
  type AnalyticsPreset,
  type AnalyticsQuery,
  type ResolvedAnalyticsRange,
} from "../../app/reliability-range";
import styles from "./analytics.module.css";

const PRESET_LABELS: { preset: AnalyticsPreset; label: string; title: string }[] = [
  { preset: "30d", label: "30 Days", title: "Last 30 days, including today so far" },
  { preset: "90d", label: "90 Days", title: "Last 90 days, including today so far" },
  { preset: "6m", label: "6 Months", title: "Last 6 months" },
  { preset: "ytd", label: "YTD", title: "Year to date" },
  { preset: "12m", label: "12 Months", title: "Last 12 months" },
  { preset: "all", label: "All", title: "All history" },
  { preset: "custom", label: "Custom", title: "The dates in From and To" },
];

type DateFieldProps = {
  label: string;
  value: string;
  min: string | undefined;
  max: string | undefined;
  disabled: boolean;
  onCommit: (value: string) => void;
};

/** Holds a half-typed date until it is a real one within the bounds; a picker without focus cannot leave one. */
function DateField({ label, value, min, max, disabled, onCommit }: DateFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <input
        type="date"
        value={draft ?? value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value;
          if (isServiceDate(next) && (!min || next >= min) && (!max || next <= max)) {
            setDraft(null);
            onCommit(next);
          } else if (document.activeElement === event.target) {
            setDraft(next);
          }
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  );
}

export function AnalyticsControls({
  networkId,
  lines,
  query,
  range,
  bounds,
  onChange,
}: {
  networkId: AnalyticsNetworkId;
  lines: readonly AnalyticsLineOption[];
  query: AnalyticsQuery;
  range: ResolvedAnalyticsRange | null;
  bounds: { firstAnalyzableDate: string | null; today: string } | null;
  onChange: (query: AnalyticsQuery) => void;
}) {
  const ttc = networkId === "ttc";
  const line = lines.find((candidate) => candidate.id === query.line);
  // Before history starts, the fields show the dates that are read.
  const from = range?.from ?? range?.requestedFrom ?? "";
  const to = range?.to ?? range?.requestedTo ?? "";

  function setCustom(nextFrom: string, nextTo: string) {
    const d = activeDrilldown(query);
    onChange(withAnalyticsDrilldown(
      { ...query, preset: "custom", from: nextFrom, to: nextTo },
      { ...d, from: null, to: null },
    ));
  }

  return (
    <section className={styles.controls} aria-label="Analytics Filters">
      <div className={styles.presets} role="group" aria-label="Date Range">
        {PRESET_LABELS.map(({ preset, label, title }) => (
          <button
            key={preset}
            type="button"
            title={title}
            aria-pressed={query.preset === preset}
            disabled={preset === "custom" && !from}
            onClick={() => preset === "custom"
              ? setCustom(from, to)
              : onChange(withAnalyticsDrilldown(
                { ...query, preset, from: null, to: null },
                { ...activeDrilldown(query), from: null, to: null },
              ))}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={styles.fields}>
        <DateField
          label="From"
          value={from}
          min={bounds?.firstAnalyzableDate ?? undefined}
          max={bounds?.today}
          disabled={!bounds?.firstAnalyzableDate}
          onCommit={(value) => setCustom(value, value > to ? value : to)}
        />
        <DateField
          label="To"
          value={to}
          min={bounds?.firstAnalyzableDate ?? undefined}
          max={bounds?.today}
          disabled={!bounds?.firstAnalyzableDate}
          onCommit={(value) => setCustom(value < from ? value : from, value)}
        />
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{ttc ? "Line" : "Corridor"}</span>
          <select
            value={query.line ?? ""}
            onChange={(event) => onChange(withAnalyticsDrilldown(
              { ...query, line: event.target.value || null, station: null },
              { ...activeDrilldown(query), line: null, station: null },
            ))}
          >
            <option value="">{ttc ? "All Lines" : "All Corridors"}</option>
            {lines.map((option) => (
              <option key={option.id} value={option.id}>
                {ttc ? `Line ${option.number} ${option.name}` : `${option.number} ${option.name}`}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Station</span>
          <select
            value={query.station ?? ""}
            disabled={!line}
            onChange={(event) => onChange(withAnalyticsDrilldown(
              { ...query, station: event.target.value || null },
              { ...activeDrilldown(query), station: null },
            ))}
          >
            <option value="">{line ? "All Stations" : ttc ? "Choose a Line First" : "Choose a Corridor First"}</option>
            {line?.stations.map((station) => (
              <option key={station.id} value={station.id}>{station.name}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={styles.compareToggle}
          aria-pressed={query.compare}
          title="Compare with the previous period of the same length"
          onClick={() => onChange({ ...query, compare: !query.compare })}
        >
          <ArrowLeftRight size={16} aria-hidden="true" />
          <span>Compare</span>
        </button>
      </div>
    </section>
  );
}

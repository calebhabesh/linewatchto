"use client";

import { ArrowLeftRight } from "lucide-react";
import type { AnalyticsNetworkId } from "../../app/reliability-analytics";
import {
  activeDrilldown,
  presetHistory,
  withAnalyticsDrilldown,
  type AnalyticsLineOption,
  type AnalyticsPreset,
  type AnalyticsQuery,
  type ResolvedAnalyticsRange,
} from "../../app/reliability-range";
import { TransitLineBadge } from "../TransitLineBadge";
import { DatePicker } from "./DatePicker";
import { SelectMenu } from "./SelectMenu";
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
        {PRESET_LABELS.map(({ preset, label, title }) => {
          const history = bounds && preset !== "all" && preset !== "custom" ? presetHistory(preset, bounds) : null;
          const filling = history && history.share < 1 ? history : null;
          return (
            <button
              key={preset}
              type="button"
              title={filling ? `${title} (${filling.recordedDays} of ${filling.days} days recorded so far)` : title}
              aria-pressed={query.preset === preset}
              disabled={preset === "custom" && !from}
              onClick={() => preset === "custom"
                ? setCustom(from, to)
                : onChange(withAnalyticsDrilldown(
                  { ...query, preset, from: null, to: null },
                  { ...activeDrilldown(query), from: null, to: null },
                ))}
            >
              <span>{label}</span>
              {filling ? (
                <>
                  <span className={styles.presetFill} aria-hidden="true"><span style={{ width: `${filling.share * 100}%` }} /></span>
                  <span className="sr-only">, {filling.recordedDays} of {filling.days} days recorded so far</span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className={styles.fields}>
        <DatePicker
          label="From"
          value={from}
          min={bounds?.firstAnalyzableDate ?? undefined}
          max={bounds?.today}
          rangeFrom={from}
          rangeTo={to}
          disabled={!bounds?.firstAnalyzableDate}
          onCommit={(value) => setCustom(value, value > to ? value : to)}
        />
        <DatePicker
          label="To"
          value={to}
          min={bounds?.firstAnalyzableDate ?? undefined}
          max={bounds?.today}
          rangeFrom={from}
          rangeTo={to}
          disabled={!bounds?.firstAnalyzableDate}
          onCommit={(value) => setCustom(value < from ? value : from, value)}
        />
        <SelectMenu
          label={ttc ? "Line" : "Corridor"}
          value={query.line ?? ""}
          options={[
            { value: "", label: ttc ? "All Lines" : "All Corridors" },
            ...lines.map((option) => ({
              value: option.id,
              label: ttc ? `Line ${option.number} ${option.name}` : option.name,
              icon: <TransitLineBadge lineId={option.id} lineNumber={option.number} size={20} decorative />,
            })),
          ]}
          onChange={(value) => onChange(withAnalyticsDrilldown(
            { ...query, line: value || null, station: null },
            { ...activeDrilldown(query), line: null, station: null },
          ))}
        />
        <SelectMenu
          label="Station"
          value={query.station ?? ""}
          disabled={!line}
          options={[
            { value: "", label: line ? "All Stations" : ttc ? "Choose a Line First" : "Choose a Corridor First" },
            ...(line?.stations ?? []).map((station) => ({ value: station.id, label: station.name })),
          ]}
          onChange={(value) => onChange(withAnalyticsDrilldown(
            { ...query, station: value || null },
            { ...activeDrilldown(query), station: null },
          ))}
        />
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

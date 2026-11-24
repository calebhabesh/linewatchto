import {
  coverageDayTotals,
  coverageSegments,
  segmentDates,
  type AnalyticsAvailability,
  type CoverageState,
} from "../../app/reliability-analytics";
import {
  formatServiceDate,
  formatServiceDateRange,
  serviceDayCount,
  type ResolvedAnalyticsRange,
} from "../../app/reliability-range";
import styles from "./analytics.module.css";

const STATE_LABELS: Record<CoverageState, string> = {
  counted: "Counted",
  partial: "Partly Observed",
  excluded: "Excluded",
  "before-history": "Before History",
  today: "Today So Far",
};
const STATE_ORDER: CoverageState[] = ["counted", "partial", "today", "excluded", "before-history"];

/** The range's days as one bar: counted, partly observed, excluded and before history. */
export function CoverageStrip({ range, availability }: {
  range: ResolvedAnalyticsRange;
  availability: AnalyticsAvailability;
}) {
  const segments = coverageSegments(range, availability);
  const totals = coverageDayTotals(segments);
  const days = serviceDayCount(range.requestedFrom, range.requestedTo);
  const counted = totals.counted + totals.partial + totals.today;
  const shown = STATE_ORDER.filter((state) => totals[state] > 0);
  const gaps = [
    { state: "excluded" as const, label: "Excluded, without a published schedule or successful polling" },
    { state: "partial" as const, label: "Partly observed, so some disruptions may be uncounted" },
  ].filter(({ state }) => totals[state] > 0);
  const summary = `${counted} of ${days} days counted from ${formatServiceDateRange(range.requestedFrom, range.requestedTo)}. ${
    shown.map((state) => `${STATE_LABELS[state]}: ${totals[state]}`).join(", ")}.`;

  return (
    <section className={styles.coverage} aria-label="Range Coverage">
      <div className={styles.coverageHeading}>
        <strong>{formatServiceDateRange(range.requestedFrom, range.requestedTo)}</strong>
        <span>{counted} of {days} {days === 1 ? "Day" : "Days"} Counted</span>
        <span>
          {availability.firstAnalyzableDate
            ? `History Starts ${formatServiceDate(availability.firstAnalyzableDate)}`
            : "History Has Not Started"}
        </span>
      </div>
      <div className={styles.coverageBar} role="img" aria-label={summary}>
        {segments.map((segment) => (
          <span
            key={segment.from}
            data-state={segment.state}
            style={{ flexGrow: segment.days }}
            title={`${formatServiceDateRange(segment.from, segment.to)}: ${STATE_LABELS[segment.state]}`}
          />
        ))}
      </div>
      <div className={styles.coverageFooter}>
        <ul className={styles.coverageLegend} aria-hidden="true">
          {shown.map((state) => (
            <li key={state}><span data-state={state} />{STATE_LABELS[state]} <b>{totals[state]}</b></li>
          ))}
        </ul>
        {gaps.length ? (
          <details className={styles.coverageDetails}>
            <summary>List Gaps</summary>
            {gaps.map(({ state, label }) => (
              <p key={state}><strong>{label}:</strong> {segmentDates(segments, state).join("; ")}.</p>
            ))}
          </details>
        ) : null}
      </div>
    </section>
  );
}

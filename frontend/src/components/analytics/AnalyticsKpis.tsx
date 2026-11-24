import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { AnalyticsChange, AnalyticsKpi } from "../../app/reliability-analytics";
import { StatIcon } from "./AnalyticsIcons";
import styles from "./analytics.module.css";

const CHANGE_ICONS = { up: ArrowUp, down: ArrowDown, same: Minus };
const CHANGE_WORDS = { up: "Up", down: "Down", same: "" };

export function ChangeText({ change }: { change: AnalyticsChange }) {
  const Icon = CHANGE_ICONS[change.direction];
  return (
    <span className={styles.change}>
      <Icon size={13} aria-hidden="true" />
      <span className="sr-only">{CHANGE_WORDS[change.direction]} </span>
      {change.text}
    </span>
  );
}

const PLACEHOLDER_LABELS = [
  "Service-Stopped Hours", "Delay Incidents", "Median Time to Clear", "Share Affected", "Coverage and Confidence",
];

/** Null KPIs keep the row's dimensions while the first range loads. */
export function AnalyticsKpis({ kpis, compare, compareUnavailable }: {
  kpis: AnalyticsKpi[] | null;
  compare: boolean;
  compareUnavailable: boolean;
}) {
  return (
    <dl className={styles.kpis} aria-busy={kpis === null || undefined}>
      {(kpis ?? PLACEHOLDER_LABELS).map((item) => {
        const kpi = typeof item === "string" ? null : item;
        return (
          <div key={kpi ? kpi.id : item as string} className={styles.kpi} data-kpi={kpi?.id}>
            <dt>{kpi ? <StatIcon id={kpi.id} size={15} /> : null}<span>{kpi ? kpi.label : item as string}</span></dt>
            <dd className={styles.kpiValue}>
              {kpi ? <>{kpi.value}{kpi.unit ? <small> {kpi.unit}</small> : null}</> : <span className={styles.skeleton} />}
            </dd>
            <dd className={styles.kpiDetail}>{kpi ? kpi.detail : " "}</dd>
            {compare ? (
              <dd className={styles.kpiChange}>
                {kpi?.change ? <ChangeText change={kpi.change} /> : kpi ? (compareUnavailable ? "No Previous Period" : "Not Comparable") : " "}
              </dd>
            ) : null}
          </div>
        );
      })}
    </dl>
  );
}

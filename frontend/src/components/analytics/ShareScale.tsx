import { formatPercentage, shareScaleSteps } from "../../app/reliability-analytics";
import styles from "./analytics.module.css";

/** One blue ramp for every filter: it says how much, and the filter says of what. What the cells' colour steps stand for: the largest share of service each one covers. */
export function ShareScale({ max, children }: {
  max: number;
  /** The chart's other keys. */
  children?: React.ReactNode;
}) {
  return (
    <ul className={styles.legendList}>
      <li><strong>Share of Service Affected</strong></li>
      <li><span className={styles.scaleSwatch} data-level="0" />0%</li>
      {shareScaleSteps(max).map((limit, index) => (
        <li key={index}>
          <span className={styles.scaleSwatch} data-level={index + 1} />
          Up to {formatPercentage(limit)}
        </li>
      ))}
      {children}
    </ul>
  );
}

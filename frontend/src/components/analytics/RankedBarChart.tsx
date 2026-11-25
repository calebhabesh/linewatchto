"use client";

import type { CSSProperties } from "react";
import styles from "./analytics.module.css";

export type RankedBarItem = {
  id: string;
  rank?: number;
  label: string;
  secondary?: string;
  badge?: React.ReactNode;
  value: number;
  valueText: string;
  detailText: string;
  tone?: "stopped" | "delay" | "slow" | "planned" | "accent" | "muted";
  ariaLabel: string;
};

/** Columns that leave no part-filled row where the count allows it. */
export function tileColumns(count: number): number {
  return [4, 3, 2].find((columns) => count % columns === 0) ?? (count > 4 ? 3 : Math.max(1, count));
}

/**
 * Shared horizontal ranked bar list primitive (Breakdown by Type/Cause, Hotspots).
 * Each row states its own figures, so it has no hover readout; selecting one drills down.
 */
export function RankedBarChart({
  accessibleName,
  items,
  layout = "list",
  onSelect,
}: {
  accessibleName: string;
  items: readonly RankedBarItem[];
  /** On wide cards: two columns read downwards, or equal tiles in full rows. */
  layout?: "list" | "columns" | "tiles";
  onSelect?: (item: RankedBarItem) => void;
}) {
  const max = items.reduce((highest, item) => Math.max(highest, item.value), 0) || 1;

  return (
    <ul
      className={styles.rankedList}
      data-layout={layout}
      style={{ "--ranked-rows": Math.ceil(items.length / 2), "--ranked-tiles": tileColumns(items.length) } as CSSProperties}
      aria-label={accessibleName}
    >
      {items.map((item) => {
        const pct = Math.max(0, Math.min(100, (item.value / max) * 100));
        return (
          <li key={item.id}>
            <button
              type="button"
              className={styles.rankedRow}
              aria-label={item.ariaLabel}
              disabled={!onSelect}
              onClick={() => onSelect?.(item)}
            >
              <span className={styles.rankedTop}>
                <span className={styles.rankedIdentity}>
                  {item.rank !== undefined ? <span className={styles.rankedNum}>{item.rank}</span> : null}
                  {item.badge}
                  <span className={styles.rankedLabel}>{item.label}</span>
                  {item.secondary ? <span className={styles.rankedSecondary}>{item.secondary}</span> : null}
                </span>
                <span className={styles.rankedValues}>
                  <strong>{item.valueText}</strong>
                  <span>{item.detailText}</span>
                </span>
              </span>
              <span className={styles.rankedTrack} aria-hidden="true">
                {pct > 0 ? (
                  <span className={styles.rankedFill} data-tone={item.tone ?? "accent"} style={{ width: `${Math.max(1, pct)}%` }} />
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

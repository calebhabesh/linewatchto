"use client";

import { useState } from "react";
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
  tone?: "stopped" | "delay" | "slow" | "accent" | "muted";
  ariaLabel: string;
  tooltip: React.ReactNode;
};

/**
 * Shared horizontal ranked bar list primitive (Breakdown by Kind/Cause, Hotspots).
 * Every row is a focusable button driving pointer/keyboard tooltips and episode drill-down.
 */
export function RankedBarChart({
  accessibleName,
  items,
  onSelect,
  onActiveChange,
}: {
  accessibleName: string;
  items: readonly RankedBarItem[];
  onSelect?: (item: RankedBarItem) => void;
  onActiveChange?: (item: RankedBarItem | null) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const max = items.reduce((highest, item) => Math.max(highest, item.value), 0) || 1;

  function activate(item: RankedBarItem | null) {
    setActiveId(item?.id ?? null);
    onActiveChange?.(item);
  }

  return (
    <ul className={styles.rankedList} aria-label={accessibleName}>
      {items.map((item) => {
        const pct = Math.max(0, Math.min(100, (item.value / max) * 100));
        const active = activeId === item.id;
        return (
          <li key={item.id}>
            <button
              type="button"
              className={styles.rankedRow}
              data-active={active || undefined}
              aria-label={item.ariaLabel}
              disabled={!onSelect}
              onMouseEnter={() => activate(item)}
              onMouseLeave={() => activate(null)}
              onFocus={() => activate(item)}
              onBlur={() => activate(null)}
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
              <svg className={styles.rankedBarSvg} viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
                <rect x={0} y={0} width={100} height={8} rx={3} className={styles.rankedTrack} />
                {pct > 0 ? (
                  <rect
                    x={0}
                    y={0}
                    width={Math.max(1.5, pct)}
                    height={8}
                    rx={3}
                    className={styles.barSegment}
                    data-tone={item.tone ?? "accent"}
                  />
                ) : null}
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

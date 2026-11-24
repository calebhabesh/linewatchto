"use client";

import { Table2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AnalyticsError } from "../../hooks/useReliabilityAnalytics";
import styles from "./analytics.module.css";

/** Triggers once when a module enters (or nears) the viewport, so below-the-fold charts load lazily. */
export function useInView(eager = false): [React.RefObject<HTMLElement | null>, boolean] {
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(() => eager || (typeof window !== "undefined" && typeof IntersectionObserver === "undefined"));

  useEffect(() => {
    if (seen || typeof IntersectionObserver === "undefined") return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: "260px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen]);

  return [ref, seen];
}

export type ChartTableColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
};

export type ChartTableRow = {
  id: string;
  cells: Record<string, React.ReactNode>;
};

export function ChartDataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: readonly ChartTableColumn[];
  rows: readonly ChartTableRow[];
}) {
  return (
    <div className={styles.tableScroll} role="region" aria-label={caption} tabIndex={0}>
      <table className={styles.chartTable}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" data-align={col.align ?? "right"}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((col, idx) => idx === 0
                ? <th key={col.key} scope="row" data-align={col.align ?? "left"}>{row.cells[col.key]}</th>
                : <td key={col.key} data-align={col.align ?? "right"}>{row.cells[col.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartFrame({
  id,
  title,
  subtitle,
  controls,
  legend,
  readout,
  defaultReadout,
  table,
  tableLabel,
  loading,
  error,
  onRetry,
  empty,
  emptyMessage,
  sectionRef,
  footer,
  children,
}: {
  id: string;
  title: string;
  subtitle?: React.ReactNode;
  controls?: React.ReactNode;
  legend?: React.ReactNode;
  readout?: React.ReactNode;
  defaultReadout?: string;
  table?: React.ReactNode;
  tableLabel?: string;
  loading?: boolean;
  error?: AnalyticsError | null;
  onRetry?: () => void;
  empty?: boolean;
  emptyMessage?: string;
  sectionRef?: React.RefObject<HTMLElement | null>;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const headingId = `${id}-heading`;

  return (
    <section
      ref={sectionRef}
      id={id}
      className={styles.moduleCard}
      aria-labelledby={headingId}
      data-analytics-module={id}
    >
      <div className={styles.moduleHeader}>
        <div className={styles.moduleTitleGroup}>
          <h2 id={headingId}>{title}</h2>
          {subtitle ? <p className={styles.moduleSubtitle}>{subtitle}</p> : null}
        </div>
        <div className={styles.moduleActions}>
          {controls}
          {table ? (
            <button
              type="button"
              className={styles.tableToggle}
              aria-pressed={showTable}
              aria-label={tableLabel ?? `Show Table for ${title}`}
              onClick={() => setShowTable((prev) => !prev)}
            >
              <Table2 size={14} aria-hidden="true" />
              <span>{showTable ? "Show Chart" : "Show Table"}</span>
            </button>
          ) : null}
        </div>
      </div>

      {legend ? <div className={styles.chartLegend}>{legend}</div> : null}

      {error ? (
        <div className={styles.moduleNotice} role="status">
          <TriangleAlert size={16} aria-hidden="true" />
          <p>{error.message}</p>
          {onRetry ? (
            <button type="button" onClick={onRetry}>Try Again</button>
          ) : null}
        </div>
      ) : loading ? (
        <div className={styles.chartSkeleton} aria-busy="true" aria-label={`Loading ${title}`}>
          <span className={styles.skeleton} style={{ width: "42%" }} />
          <div className={styles.chartSkeletonBars}>
            {Array.from({ length: 12 }, (_, idx) => (
              <span key={idx} style={{ height: `${28 + ((idx * 17) % 62)}%` }} />
            ))}
          </div>
        </div>
      ) : empty ? (
        <p className={styles.moduleEmpty}>{emptyMessage ?? "No observed data in this range."}</p>
      ) : showTable && table ? (
        table
      ) : (
        <>
          <div className={styles.chartReadout} aria-live="polite">
            {readout ?? <span className={styles.chartReadoutHint}>{defaultReadout ?? "Hover or focus a mark for details; select one to filter episodes."}</span>}
          </div>
          {children}
        </>
      )}

      {footer ? <div className={styles.moduleFooter}>{footer}</div> : null}
    </section>
  );
}

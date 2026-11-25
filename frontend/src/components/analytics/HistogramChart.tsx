"use client";

import { useId, useState } from "react";
import { useElementSize } from "../../hooks/useElementSize";
import type { AnalyticsDurationBucket } from "../../app/reliability-analytics";
import styles from "./analytics.module.css";

export type HistogramSelection = {
  bucket: AnalyticsDurationBucket;
  planned: boolean | null;
};

/**
 * Shared SVG histogram primitive for Time to Clear, split into Unplanned (solid) and Planned (hatched).
 */
export function HistogramChart({
  accessibleName,
  buckets,
  onSelect,
  onActiveChange,
}: {
  accessibleName: string;
  buckets: readonly AnalyticsDurationBucket[];
  onSelect?: (selection: HistogramSelection) => void;
  onActiveChange?: (selection: HistogramSelection | null) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const maxVal = buckets.reduce((max, b) => Math.max(max, b.unplanned, b.planned), 0) || 1;

  const [sizeRef, size] = useElementSize();
  const height = Math.max(220, size.height);
  const padTop = 42;
  const padBottom = 34;
  const padLeft = 44;
  const padRight = 4;
  const plotHeight = height - padTop - padBottom;
  const count = Math.max(1, buckets.length);
  const plotWidth = Math.max(count * 60, (size.width || 560) - padLeft - padRight);
  const groupW = plotWidth / count;
  const innerGap = 6;
  const barW = Math.min(40, Math.floor((groupW - innerGap) * 0.38));
  const width = padLeft + plotWidth + padRight;

  function activate(sel: HistogramSelection | null) {
    setActiveKey(sel ? `${sel.bucket.id}-${sel.planned}` : null);
    onActiveChange?.(sel);
  }

  return (
    <div ref={sizeRef} className={styles.chartScroll} data-fill="true" tabIndex={0} role="region" aria-label={`${accessibleName} Chart`}>
      <svg
        className={styles.chartSvg}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={accessibleName}
      >
        <defs>
          <pattern id={`${uid}-planned`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--analytics-planned-bg)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--analytics-planned)" strokeWidth="2.2" />
          </pattern>
        </defs>

        {[0, 0.5, 1].map((ratio) => {
          const y = padTop + plotHeight * (1 - ratio);
          return (
            <g key={ratio}>
              <line x1={padLeft} x2={padLeft + plotWidth} y1={y} y2={y} className={styles.chartGridLine} />
              <text x={padLeft - 8} y={y + 4} textAnchor="end" className={styles.chartAxisText}>
                {Math.round(maxVal * ratio)}
              </text>
            </g>
          );
        })}

        <text x={0} y={12} className={styles.chartAxisUnit}>Cleared Episodes</text>

        {buckets.map((bucket, idx) => {
          const groupX = padLeft + idx * groupW;
          const startX = groupX + (groupW - (barW * 2 + innerGap)) / 2;
          const uH = bucket.unplanned > 0 ? Math.max(3, (bucket.unplanned / maxVal) * plotHeight) : 0;
          const pH = bucket.planned > 0 ? Math.max(3, (bucket.planned / maxVal) * plotHeight) : 0;

          const bars = [
            { planned: false, count: bucket.unplanned, x: startX, h: uH, label: "Unplanned" },
            { planned: true, count: bucket.planned, x: startX + barW + innerGap, h: pH, label: "Planned" },
          ];

          return (
            <g key={bucket.id}>
              {bars.map((bar) => {
                const key = `${bucket.id}-${bar.planned}`;
                const clickable = Boolean(onSelect && bar.count > 0);
                const selection: HistogramSelection = { bucket, planned: bar.planned };
                const aria = `${bucket.label}, ${bar.label}: ${bar.count} cleared ${bar.count === 1 ? "episode" : "episodes"}`;
                return (
                  <g
                    key={key}
                    className={styles.chartMark}
                    data-active={activeKey === key || undefined}
                    data-clickable={clickable || undefined}
                    role={clickable ? "button" : "img"}
                    tabIndex={0}
                    aria-label={aria}
                    onMouseEnter={() => activate(selection)}
                    onMouseLeave={() => activate(null)}
                    onFocus={() => activate(selection)}
                    onBlur={() => activate(null)}
                    onClick={() => clickable && onSelect?.(selection)}
                    onKeyDown={(event) => {
                      if (clickable && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        onSelect?.(selection);
                      }
                    }}
                  >
                    <rect x={bar.x} y={padTop} width={barW} height={plotHeight} fill="transparent" />
                    {bar.h > 0 ? (
                      <>
                        <rect
                          x={bar.x}
                          y={padTop + plotHeight - bar.h}
                          width={barW}
                          height={bar.h}
                          rx={2}
                          fill={bar.planned ? `url(#${uid}-planned)` : "var(--analytics-counted)"}
                          stroke={bar.planned ? "var(--analytics-planned)" : "none"}
                          strokeWidth={bar.planned ? 1.2 : 0}
                        />
                        <text
                          x={bar.x + barW / 2}
                          y={padTop + plotHeight - bar.h - 4}
                          textAnchor="middle"
                          className={styles.chartBarValue}
                        >
                          {bar.count}
                        </text>
                      </>
                    ) : (
                      <line
                        x1={bar.x}
                        x2={bar.x + barW}
                        y1={padTop + plotHeight - 1}
                        y2={padTop + plotHeight - 1}
                        stroke="var(--analytics-zero-line)"
                        strokeWidth={1.5}
                      />
                    )}
                  </g>
                );
              })}

              <text x={groupX + groupW / 2} y={height - 10} textAnchor="middle" className={styles.chartAxisText}>
                {bucket.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

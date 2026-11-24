"use client";

import { useId, useState } from "react";
import styles from "./analytics.module.css";

export type StackedBarSegment = {
  key: string;
  label: string;
  value: number;
  tone: "stopped" | "delay" | "slow" | "accent" | "muted" | "corridor-a" | "corridor-b" | "corridor-c" | "corridor-d";
  pattern?: "solid" | "stripe" | "dots";
};

export type StackedBarItem = {
  id: string;
  label: string;
  shortLabel: string;
  /** Null when the bucket has no analyzable/tracked day: drawn hatched, never as zero. */
  total: number | null;
  segments: StackedBarSegment[];
  today?: boolean;
  partial?: boolean;
  ariaLabel: string;
  tooltip: React.ReactNode;
};

/**
 * Shared SVG bar / stacked-bar primitive.
 * Null totals render as full-height hatched coverage gaps; Today So Far gets a dashed outline.
 * Long series scroll inside `.chartScroll` on phones without widening the page.
 */
export function StackedBarChart({
  accessibleName,
  items,
  unitLabel,
  formatAxis,
  onSelect,
  onActiveChange,
  minBarWidth = 18,
}: {
  accessibleName: string;
  items: readonly StackedBarItem[];
  unitLabel: string;
  formatAxis: (value: number) => string;
  onSelect?: (item: StackedBarItem) => void;
  onActiveChange?: (item: StackedBarItem | null) => void;
  minBarWidth?: number;
}) {
  const uid = useId().replace(/:/g, "");
  const [activeId, setActiveId] = useState<string | null>(null);

  const maxTotal = items.reduce((max, item) => (item.total !== null && item.total > max ? item.total : max), 0);
  const scaleMax = maxTotal > 0 ? maxTotal : 1;

  const height = 220;
  const padTop = 18;
  const padBottom = 34;
  const padLeft = 52;
  const padRight = 14;
  const plotHeight = height - padTop - padBottom;
  const count = Math.max(1, items.length);
  const step = Math.max(minBarWidth, Math.min(44, Math.floor(680 / count)));
  const barWidth = Math.max(8, Math.min(30, Math.floor(step * 0.72)));
  const plotWidth = Math.max(320, count * step);
  const svgWidth = padLeft + plotWidth + padRight;

  const yTicks = [0, 0.5, 1];
  const labelStride = Math.max(1, Math.ceil(count / Math.max(4, Math.floor(plotWidth / 76))));

  function activate(item: StackedBarItem | null) {
    setActiveId(item?.id ?? null);
    onActiveChange?.(item);
  }

  return (
    <div className={styles.chartScroll} tabIndex={0} role="region" aria-label={`${accessibleName} Chart`}>
      <svg
        className={styles.chartSvg}
        width={svgWidth}
        height={height}
        viewBox={`0 0 ${svgWidth} ${height}`}
        role="img"
        aria-label={accessibleName}
      >
        <defs>
          <pattern id={`${uid}-gap`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="var(--analytics-gap-bg)" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="var(--analytics-gap)" strokeWidth="2.5" />
          </pattern>
          <pattern id={`${uid}-stripe`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--analytics-pattern-ink)" strokeWidth="1.5" />
          </pattern>
          <pattern id={`${uid}-dots`} width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.15" fill="var(--analytics-pattern-ink)" />
            <circle cx="5" cy="5" r="1.15" fill="var(--analytics-pattern-ink)" />
          </pattern>
        </defs>

        {yTicks.map((ratio) => {
          const y = padTop + plotHeight * (1 - ratio);
          return (
            <g key={ratio}>
              <line
                x1={padLeft}
                x2={padLeft + plotWidth}
                y1={y}
                y2={y}
                className={styles.chartGridLine}
              />
              <text x={padLeft - 8} y={y + 4} textAnchor="end" className={styles.chartAxisText}>
                {formatAxis(scaleMax * ratio)}
              </text>
            </g>
          );
        })}

        <text x={padLeft} y={11} className={styles.chartAxisUnit}>{unitLabel}</text>

        {items.map((item, idx) => {
          const x = padLeft + idx * step + (step - barWidth) / 2;
          const isGap = item.total === null;
          const isActive = activeId === item.id;
          const clickable = Boolean(onSelect && !isGap);

          let cursorY = padTop + plotHeight;
          const rects: Array<{ key: string; y: number; h: number; tone: StackedBarSegment["tone"]; pattern?: StackedBarSegment["pattern"] }> = [];
          if (!isGap) {
            for (const seg of item.segments) {
              if (seg.value <= 0) continue;
              const h = Math.max(1.5, (seg.value / scaleMax) * plotHeight);
              cursorY -= h;
              rects.push({ key: seg.key, y: Math.max(padTop, cursorY), h, tone: seg.tone, pattern: seg.pattern });
            }
          }

          return (
            <g
              key={item.id}
              className={styles.chartMark}
              data-active={isActive || undefined}
              data-gap={isGap || undefined}
              data-clickable={clickable || undefined}
              role={clickable ? "button" : "img"}
              tabIndex={0}
              aria-label={item.ariaLabel}
              onMouseEnter={() => activate(item)}
              onMouseLeave={() => activate(null)}
              onFocus={() => activate(item)}
              onBlur={() => activate(null)}
              onClick={() => clickable && onSelect?.(item)}
              onKeyDown={(event) => {
                if (clickable && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelect?.(item);
                }
              }}
            >
              {/* Invisible hit target covering full column for effortless hover/tap */}
              <rect x={padLeft + idx * step} y={padTop} width={step} height={plotHeight} fill="transparent" />

              {isGap ? (
                <rect
                  x={x}
                  y={padTop}
                  width={barWidth}
                  height={plotHeight}
                  rx={2}
                  fill={`url(#${uid}-gap)`}
                  stroke="var(--analytics-gap)"
                  strokeWidth={1}
                />
              ) : rects.length === 0 ? (
                <line
                  x1={x}
                  x2={x + barWidth}
                  y1={padTop + plotHeight - 1}
                  y2={padTop + plotHeight - 1}
                  stroke="var(--analytics-zero-line)"
                  strokeWidth={2}
                />
              ) : (
                rects.map((seg) => (
                  <g key={seg.key}>
                    <rect
                      x={x}
                      y={seg.y}
                      width={barWidth}
                      height={seg.h}
                      rx={1.5}
                      className={styles.barSegment}
                      data-tone={seg.tone}
                    />
                    {seg.pattern && seg.pattern !== "solid" ? (
                      <rect
                        x={x}
                        y={seg.y}
                        width={barWidth}
                        height={seg.h}
                        rx={1.5}
                        fill={`url(#${uid}-${seg.pattern})`}
                        pointerEvents="none"
                      />
                    ) : null}
                  </g>
                ))
              )}

              {item.today ? (
                <rect
                  x={x - 2}
                  y={padTop - 2}
                  width={barWidth + 4}
                  height={plotHeight + 4}
                  rx={3}
                  fill="none"
                  stroke="var(--guide-text)"
                  strokeWidth={1.5}
                  strokeDasharray="3 2"
                  pointerEvents="none"
                />
              ) : null}

              {item.partial && !isGap && !item.today ? (
                <circle
                  cx={x + barWidth / 2}
                  cy={padTop - 6}
                  r={2.5}
                  fill="var(--analytics-partial)"
                  stroke="var(--guide-text)"
                  strokeWidth={0.75}
                />
              ) : null}

              {(idx % labelStride === 0 && (idx === items.length - 1 || items.length - 1 - idx >= Math.max(2, Math.ceil(labelStride * 0.6))))
                || idx === items.length - 1 ? (
                  <text
                    x={x + barWidth / 2}
                    y={height - 10}
                    textAnchor={idx === 0 ? "start" : idx === items.length - 1 ? "end" : "middle"}
                    className={styles.chartAxisText}
                  >
                    {item.today ? "Today" : item.shortLabel}
                  </text>
                ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

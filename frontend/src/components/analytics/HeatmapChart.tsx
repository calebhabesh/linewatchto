"use client";

import { useId, useState } from "react";
import { useElementSize } from "../../hooks/useElementSize";
import { DAY_OF_WEEK_LABELS, formatHourLabel, intensityLevel } from "../../app/reliability-analytics";
import styles from "./analytics.module.css";

export type HeatmapCellItem = {
  dayOfWeek: number; // 1..7
  hour: number;      // 0..23
  observedMinutes: number;
  valueMinutes: number;
  sharePercentage: number;
  ariaLabel: string;
  tooltip: React.ReactNode;
};

/**
 * Shared 7x24 hour-of-week SVG heatmap primitive.
 * Four fill steps from faint to full, named by ShareScale and stated in every cell's label,
 * and diagonal hatching for hours with zero observed service.
 */
export function HeatmapChart({
  accessibleName,
  cells,
  onSelect,
  onActiveChange,
}: {
  accessibleName: string;
  cells: readonly HeatmapCellItem[];
  onSelect?: (cell: HeatmapCellItem) => void;
  onActiveChange?: (cell: HeatmapCellItem | null) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const maxShare = cells.reduce((max, c) => (c.observedMinutes > 0 ? Math.max(max, c.sharePercentage) : max), 0);

  const [sizeRef, size] = useElementSize();
  const cellH = 26;
  const gap = 3;
  const padLeft = 40;
  const padTop = 26;
  const padRight = 2;
  const cellW = Math.max(20, ((size.width || 690) - padLeft - padRight + gap) / 24 - gap);
  const padBottom = 10;
  const width = padLeft + 24 * (cellW + gap) - gap + padRight;
  const height = padTop + 7 * (cellH + gap) - gap + padBottom;

  function activate(cell: HeatmapCellItem | null) {
    setActiveKey(cell ? `${cell.dayOfWeek}-${cell.hour}` : null);
    onActiveChange?.(cell);
  }

  return (
    <div ref={sizeRef} className={styles.chartScroll} tabIndex={0} role="region" aria-label={`${accessibleName} Grid`}>
      <svg
        className={styles.chartSvg}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={accessibleName}
      >
        <defs>
          <pattern id={`${uid}-unobs`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--analytics-gap-bg)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--analytics-gap)" strokeWidth="2" />
          </pattern>
        </defs>

        {Array.from({ length: 24 }, (_, hour) => hour % 3 === 0 ? (
          <text
            key={hour}
            x={padLeft + hour * (cellW + gap) + cellW / 2}
            y={15}
            textAnchor="middle"
            className={styles.chartAxisText}
          >
            {formatHourLabel(hour)}
          </text>
        ) : null)}

        {DAY_OF_WEEK_LABELS.map((label, dowIdx) => (
          <text
            key={label}
            x={padLeft - 8}
            y={padTop + dowIdx * (cellH + gap) + cellH / 2 + 4}
            textAnchor="end"
            className={styles.chartAxisText}
          >
            {label}
          </text>
        ))}

        {cells.map((cell) => {
          const x = padLeft + cell.hour * (cellW + gap);
          const y = padTop + (cell.dayOfWeek - 1) * (cellH + gap);
          const key = `${cell.dayOfWeek}-${cell.hour}`;
          const unobserved = cell.observedMinutes <= 0;
          const level = unobserved ? 0 : intensityLevel(cell.sharePercentage, maxShare);
          const clickable = Boolean(onSelect && !unobserved && cell.valueMinutes > 0);

          return (
            <g
              key={key}
              className={styles.chartMark}
              data-active={activeKey === key || undefined}
              data-clickable={clickable || undefined}
              role={clickable ? "button" : "img"}
              tabIndex={0}
              aria-label={cell.ariaLabel}
              onMouseEnter={() => activate(cell)}
              onMouseLeave={() => activate(null)}
              onFocus={() => activate(cell)}
              onBlur={() => activate(null)}
              onClick={() => clickable && onSelect?.(cell)}
              onKeyDown={(event) => {
                if (clickable && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelect?.(cell);
                }
              }}
            >
              <rect
                x={x}
                y={y}
                width={cellW}
                height={cellH}
                rx={3}
                className={unobserved ? undefined : styles.heatCell}
                fill={unobserved ? `url(#${uid}-unobs)` : undefined}
                stroke={unobserved ? "var(--analytics-gap)" : undefined}
                strokeWidth={unobserved ? 0.8 : undefined}
                data-level={level}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

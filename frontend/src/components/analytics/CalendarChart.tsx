"use client";

import { useId, useState } from "react";
import { DAY_OF_WEEK_LABELS, intensityLevel } from "../../app/reliability-analytics";
import { TransitLineBadge } from "../TransitLineBadge";
import styles from "./analytics.module.css";

export type CalendarDayCell = {
  date: string;
  /** Monday=0 .. Sunday=6 */
  weekday: number;
  weekIndex: number;
  state: "gap" | "no-service" | "observed";
  today: boolean;
  sharePercentage: number | null;
  ariaLabel: string;
  tooltip: React.ReactNode;
};

export type CalendarLineRow = {
  lineId: string;
  number: string | null;
  label: string;
  days: CalendarDayCell[];
};

const MONTH_FORMAT = new Intl.DateTimeFormat("en-CA", { month: "short", timeZone: "UTC" });

/**
 * Shared SVG per-line calendar strip primitive.
 * Renders each line as a compact 7-row (Mon-Sun) week-column grid.
 * Coverage gaps are hatched, no-service days are dotted outlines, Today So Far is ringed,
 * and impact intensity uses both fill and proportional inner square size.
 */
export function CalendarChart({
  accessibleName,
  rows,
  weekCount,
  monthLabels,
  tone = "accent",
  onSelect,
  onActiveChange,
}: {
  accessibleName: string;
  rows: readonly CalendarLineRow[];
  weekCount: number;
  monthLabels: readonly { weekIndex: number; label: string }[];
  tone?: "accent" | "stopped" | "delay" | "slow";
  onSelect?: (lineId: string, cell: CalendarDayCell) => void;
  onActiveChange?: (active: { lineLabel: string; cell: CalendarDayCell } | null) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const maxShare = rows.reduce(
    (max, row) => row.days.reduce((m, d) => (d.sharePercentage !== null ? Math.max(m, d.sharePercentage) : m), max),
    0,
  );
  const scaleMax = Math.max(5, maxShare);

  const cellSize = 13;
  const gap = 3;
  const padLeft = 30;
  const padTop = 18;
  const padRight = 8;
  const padBottom = 6;
  const svgWidth = padLeft + Math.max(1, weekCount) * (cellSize + gap) - gap + padRight;
  const svgHeight = padTop + 7 * (cellSize + gap) - gap + padBottom;

  function activate(line: CalendarLineRow | null, cell: CalendarDayCell | null) {
    setActiveKey(line && cell ? `${line.lineId}-${cell.date}` : null);
    onActiveChange?.(line && cell ? { lineLabel: line.label, cell } : null);
  }

  return (
    <div className={styles.calendarStack} data-compact={weekCount <= 16 || undefined} aria-label={accessibleName}>
      {rows.map((row) => (
        <div key={row.lineId} className={styles.calendarRow}>
          <div className={styles.calendarLineHeader}>
            <TransitLineBadge lineId={row.lineId} lineNumber={row.number ?? undefined} size={22} decorative />
            <strong>{row.label}</strong>
          </div>
          <div className={styles.chartScroll} tabIndex={0} role="region" aria-label={`${row.label} Daily Calendar`}>
            <svg
              className={styles.chartSvg}
              width={svgWidth}
              height={svgHeight}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              role="img"
              aria-label={`${row.label} daily impact calendar`}
            >
              <defs>
                <pattern id={`${uid}-${row.lineId}-gap`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="5" height="5" fill="var(--analytics-gap-bg)" />
                  <line x1="0" y1="0" x2="0" y2="5" stroke="var(--analytics-gap)" strokeWidth="1.8" />
                </pattern>
              </defs>

              {monthLabels.map((m) => (
                <text
                  key={`${m.weekIndex}-${m.label}`}
                  x={padLeft + m.weekIndex * (cellSize + gap)}
                  y={12}
                  className={styles.chartAxisText}
                >
                  {m.label}
                </text>
              ))}

              {[0, 2, 4, 6].map((dow) => (
                <text
                  key={dow}
                  x={padLeft - 6}
                  y={padTop + dow * (cellSize + gap) + cellSize - 2}
                  textAnchor="end"
                  className={styles.chartAxisText}
                >
                  {DAY_OF_WEEK_LABELS[dow][0]}
                </text>
              ))}

              {row.days.map((cell) => {
                const x = padLeft + cell.weekIndex * (cellSize + gap);
                const y = padTop + cell.weekday * (cellSize + gap);
                const key = `${row.lineId}-${cell.date}`;
                const level = cell.state === "observed" && cell.sharePercentage !== null
                  ? intensityLevel(cell.sharePercentage, scaleMax)
                  : 0;
                const clickable = Boolean(onSelect && cell.state === "observed");
                const innerSize = level === 0 ? 0 : 2 + level * 1.5;

                return (
                  <g
                    key={key}
                    className={styles.chartMark}
                    data-active={activeKey === key || undefined}
                    data-clickable={clickable || undefined}
                    role={clickable ? "button" : "img"}
                    tabIndex={0}
                    aria-label={cell.ariaLabel}
                    onMouseEnter={() => activate(row, cell)}
                    onMouseLeave={() => activate(null, null)}
                    onFocus={() => activate(row, cell)}
                    onBlur={() => activate(null, null)}
                    onClick={() => clickable && onSelect?.(row.lineId, cell)}
                    onKeyDown={(event) => {
                      if (clickable && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        onSelect?.(row.lineId, cell);
                      }
                    }}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={cellSize}
                      height={cellSize}
                      rx={2.5}
                      className={cell.state === "observed" ? styles.heatCell : undefined}
                      fill={cell.state === "gap" ? `url(#${uid}-${row.lineId}-gap)` : cell.state === "no-service" ? "transparent" : undefined}
                      stroke={cell.today
                        ? "var(--guide-text)"
                        : cell.state === "gap"
                          ? "var(--analytics-gap)"
                          : cell.state === "no-service"
                            ? "var(--analytics-gap)"
                            : undefined}
                      strokeWidth={cell.today ? 1.8 : cell.state !== "observed" ? 1 : 0}
                      strokeDasharray={cell.state === "no-service" ? "2 1.5" : undefined}
                      data-tone={tone}
                      data-level={level}
                    />
                    {cell.state === "observed" && innerSize > 0 ? (
                      <rect
                        x={x + (cellSize - innerSize) / 2}
                        y={y + (cellSize - innerSize) / 2}
                        width={innerSize}
                        height={innerSize}
                        rx={1}
                        className={styles.heatDot}
                        data-level={level}
                        pointerEvents="none"
                      />
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Utility for building week indices and month labels from a sorted ISO date list. */
export function calendarGridDates(dates: readonly string[]): {
  weekByDate: Map<string, { weekday: number; weekIndex: number }>;
  weekCount: number;
  monthLabels: { weekIndex: number; label: string }[];
} {
  const weekByDate = new Map<string, { weekday: number; weekIndex: number }>();
  const monthLabels: { weekIndex: number; label: string }[] = [];
  if (!dates.length) return { weekByDate, weekCount: 0, monthLabels };
  const firstUtc = new Date(`${dates[0]}T00:00:00Z`);
  const firstWeekday = (firstUtc.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const startMs = firstUtc.getTime() - firstWeekday * 86_400_000;
  let lastMonth = "";
  let maxWeek = 0;

  for (const date of dates) {
    const utc = new Date(`${date}T00:00:00Z`);
    const weekday = (utc.getUTCDay() + 6) % 7;
    const weekIndex = Math.floor((utc.getTime() - startMs) / (7 * 86_400_000));
    maxWeek = Math.max(maxWeek, weekIndex);
    weekByDate.set(date, { weekday, weekIndex });
    const ym = date.slice(0, 7);
    if (ym !== lastMonth) {
      lastMonth = ym;
      monthLabels.push({
        weekIndex,
        label: MONTH_FORMAT.format(utc).replace(/\./g, ""),
      });
    }
  }
  return { weekByDate, weekCount: maxWeek + 1, monthLabels };
}

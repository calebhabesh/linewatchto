import type { CSSProperties } from "react";

type OverlappingCountBadgeProps = {
  className: string;
  count: number;
};

export function OverlappingCountBadge({ className, count }: OverlappingCountBadgeProps) {
  const label = String(count);
  const viewBoxWidth = Math.max(9, label.length * 7 + 2);
  const isSingleDigit = label.length <= 1;

  return (
    <span
      className={`overlapping-count-badge ${className}`}
      data-count-digits={label.length}
      data-single-digit={isSingleDigit ? "true" : "false"}
      style={
        {
          "--overlapping-count-viewbox-width": viewBoxWidth,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <svg
        className="overlapping-count-badge__svg"
        viewBox={`0 0 ${viewBoxWidth} 16`}
        width={viewBoxWidth}
        height="16"
        focusable="false"
        aria-hidden="true"
      >
        <text
          className="overlapping-count-badge__text"
          x={viewBoxWidth / 2}
          y="7.35"
          dominantBaseline="central"
          textAnchor="middle"
        >
          {label}
        </text>
      </svg>
    </span>
  );
}


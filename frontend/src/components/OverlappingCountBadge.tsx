type OverlappingCountBadgeProps = {
  className: string;
  count: number;
};

export function OverlappingCountBadge({ className, count }: OverlappingCountBadgeProps) {
  const label = String(count);
  const viewBoxWidth = Math.max(7, label.length * 5.5 + 1);

  return (
    <span className={`overlapping-count-badge ${className}`} aria-hidden="true">
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
          y="8"
          dominantBaseline="central"
          textAnchor="middle"
        >
          {label}
        </text>
      </svg>
    </span>
  );
}

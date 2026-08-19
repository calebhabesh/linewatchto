"use client";

import { Fragment } from "react";
import { transitLineBadgeColors } from "./TransitLineBadge";

type Props = {
  lineId: string;
  platformLabel: string;
  className?: string;
};

function parseDirections(label: string): string[] {
  const matches = label.match(/\b(Northbound|Southbound|Eastbound|Westbound|Both directions)\b/gi);
  if (!matches || matches.length === 0) {
    return [label];
  }
  return matches.map((m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
}

export function StationLineDirectionIndicator({
  lineId,
  platformLabel,
  className = "",
}: Props) {
  const lineColor = transitLineBadgeColors(lineId).backgroundColor;
  const directions = parseDirections(platformLabel);

  return (
    <div
      className={`station-line-directions inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wide text-slate-900 dark:text-white shrink-0 text-right backdrop-blur-xs transition-all ${className}`.trim()}
      style={{
        backgroundColor: `color-mix(in srgb, ${lineColor} 20%, transparent)`,
        borderColor: `color-mix(in srgb, ${lineColor} 75%, transparent)`,
        borderWidth: "1.5px",
        borderStyle: "solid",
        boxShadow: `0 0 10px -2px color-mix(in srgb, ${lineColor} 40%, transparent), inset 0 0 8px -2px color-mix(in srgb, ${lineColor} 20%, transparent)`,
      }}
      aria-label={platformLabel}
    >
      {directions.map((direction, idx) => (
        <Fragment key={`${direction}-${idx}`}>
          {idx > 0 && (
            <span
              className="font-bold select-none leading-none opacity-90"
              style={{ color: lineColor }}
              aria-hidden="true"
            >
              /
            </span>
          )}
          <span className="leading-none">{direction}</span>
        </Fragment>
      ))}
    </div>
  );
}

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
  const lineColors = transitLineBadgeColors(lineId);
  const lineColor = lineColors.backgroundColor;
  const textColor = lineColors.color;
  const directions = parseDirections(platformLabel);

  return (
    <div
      className={`station-line-directions inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-bold tracking-normal sm:tracking-wide shrink-0 text-right transition-all ${className}`.trim()}
      style={{
        ["--line-direction-color" as string]: lineColor,
        ["--line-direction-text" as string]: textColor,
      }}
      aria-label={platformLabel}
    >
      {directions.map((direction, idx) => (
        <Fragment key={`${direction}-${idx}`}>
          {idx > 0 && (
            <span
              className="station-line-directions-divider font-bold select-none leading-none opacity-60"
              aria-hidden="true"
            >
              /
            </span>
          )}
          <span className="leading-none whitespace-nowrap">{direction}</span>
        </Fragment>
      ))}
    </div>
  );
}

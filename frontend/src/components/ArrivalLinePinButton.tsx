"use client";

import { Star } from "lucide-react";

type Props = {
  pinned: boolean;
  lineLabel: string;
  stationName: string;
  onToggle: () => void;
  compact?: boolean;
  hovered?: boolean;
  onHoverChange?: (hovered: boolean) => void;
};

export function ArrivalLinePinButton({
  pinned,
  lineLabel,
  stationName,
  onToggle,
  compact = false,
  hovered = false,
  onHoverChange,
}: Props) {
  const action = pinned ? "Unpin" : "Pin";
  const starFill = pinned
    ? "currentColor"
    : hovered
      ? "rgba(251, 191, 36, 0.35)"
      : "none";

  return (
    <button
      type="button"
      className={`arrival-line-pin${pinned ? " is-pinned" : ""}${hovered ? " is-hovered" : ""}${compact ? " is-compact" : ""}`}
      onClick={onToggle}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onFocus={() => onHoverChange?.(true)}
      onBlur={() => onHoverChange?.(false)}
      aria-pressed={pinned}
      aria-label={`${action} ${lineLabel} arrivals at ${stationName}`}
      title={`${action} ${lineLabel} arrivals`}
    >
      <Star size={compact ? 20 : 27} fill={starFill} aria-hidden="true" strokeWidth={pinned ? 0 : 1.85} />
    </button>
  );
}

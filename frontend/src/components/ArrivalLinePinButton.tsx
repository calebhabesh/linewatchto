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
  const isFilled = pinned;
  const starFill = isFilled
    ? "currentColor"
    : "rgba(251, 191, 36, 0.15)";

  return (
    <button
      type="button"
      className={`arrival-line-pin${pinned ? " is-pinned" : ""}${hovered ? " is-hovered" : ""}${compact ? " is-compact" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.stopPropagation();
        }
      }}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") onHoverChange?.(true); }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") onHoverChange?.(false); }}
      aria-pressed={pinned}
      aria-label={`${action} ${lineLabel} arrivals at ${stationName}`}
      title={`${action} ${lineLabel} arrivals`}
    >
      <Star size={compact ? 20 : 27} fill={starFill} aria-hidden="true" strokeWidth={isFilled ? 0 : 1.85} />
    </button>
  );
}

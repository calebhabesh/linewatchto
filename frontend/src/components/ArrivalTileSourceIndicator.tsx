import { CalendarCheck2 } from "lucide-react";
import { LiveSignalIcon } from "./LiveSignalIcon";
import { arrivalTileSourceIndicatorData } from "../app/arrival-source-badge";

export { arrivalTileSourceIndicatorData };

type Props = {
  status: "live" | "scheduled" | "unavailable" | "demo" | string;
  isDue?: boolean;
  size?: number;
  className?: string;
  isCompact?: boolean;
};

/**
 * Top-right corner source indicator for arrival tiles within a mixed arrival group.
 * Displays an animated LiveSignalIcon for live predictions and a grey-shaded
 * CalendarCheck2 icon for scheduled timetable entries.
 */
export function ArrivalTileSourceIndicator({
  status,
  isDue = false,
  size,
  className = "",
  isCompact = false,
}: Props) {
  const data = arrivalTileSourceIndicatorData(status, isDue, isCompact);
  const iconSize = size ?? data.iconSize;
  const positionClass = isCompact ? "top-1 right-1.5" : "top-1 right-1.5";

  return (
    <span
      className={`absolute ${positionClass} flex items-center justify-center pointer-events-none ${className}`}
      title={data.title}
      aria-label={data.title}
      data-arrival-tile-source={data.source}
    >
      {data.isLive ? (
        <LiveSignalIcon
          size={iconSize}
          className={data.signalClass}
        />
      ) : (
        <CalendarCheck2
          size={iconSize}
          className={data.calendarClass}
          aria-hidden="true"
        />
      )}
    </span>
  );
}

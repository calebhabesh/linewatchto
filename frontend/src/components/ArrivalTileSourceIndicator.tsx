import { CalendarCheck2 } from "lucide-react";
import { LiveSignalIcon } from "./LiveSignalIcon";

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
  const isLive = status === "live";
  const iconSize = size ?? (isCompact ? 11.5 : 13);
  const positionClass = isCompact ? "top-1 right-1" : "top-1 right-1.5";

  return (
    <span
      className={`absolute ${positionClass} flex items-center justify-center pointer-events-none ${className}`}
      title={isLive ? "Live arrival estimate" : "Scheduled timetable"}
      aria-label={isLive ? "Live arrival estimate" : "Scheduled timetable"}
      data-arrival-tile-source={isLive ? "live" : "scheduled"}
    >
      {isLive ? (
        <LiveSignalIcon
          size={iconSize}
          className={isDue ? "text-emerald-400" : "text-emerald-600 dark:text-emerald-400"}
        />
      ) : (
        <CalendarCheck2
          size={iconSize}
          className={isDue ? "text-red-200/80" : "text-slate-400 dark:text-slate-500"}
          aria-hidden="true"
        />
      )}
    </span>
  );
}

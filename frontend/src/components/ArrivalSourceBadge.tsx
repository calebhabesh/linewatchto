import { CalendarCheck2, Layers, ArrowDownToLine } from "lucide-react";
import { LiveSignalIcon } from "./LiveSignalIcon";

import {
  arrivalSourceBadgeClassName,
  regionalArrivalSourceBadgeClassName,
} from "../app/arrival-source-badge.ts";

export { arrivalSourceBadgeClassName, regionalArrivalSourceBadgeClassName };

export type ArrivalSourceBadgeProps = {
  label: string;
  size?: "default" | "compact";
  title?: string;
  ariaLabel?: string;
  className?: string;
};

export function ArrivalSourceBadge({
  label,
  size = "default",
  title,
  ariaLabel,
  className = "",
}: ArrivalSourceBadgeProps) {
  const isCompact = size === "compact";
  const badgeClasses = arrivalSourceBadgeClassName(label, size);
  const combinedClass = className ? `${className} ${badgeClasses}` : badgeClasses;
  const effectiveAriaLabel = ariaLabel ?? title;

  return (
    <span
      className={combinedClass}
      data-arrival-source={label.toLowerCase()}
      title={title}
      aria-label={effectiveAriaLabel}
    >
      {label}
      {label === "Live" ? (
        <LiveSignalIcon
          className={
            isCompact
              ? "ml-1 inline-block shrink-0 text-emerald-600 dark:text-emerald-300"
              : "ml-1.5 inline-block shrink-0 text-emerald-600 dark:text-emerald-300"
          }
          size={isCompact ? 13 : 15.5}
        />
      ) : label === "Scheduled" ? (
        <CalendarCheck2
          className={
            isCompact
              ? "ml-1 inline-block shrink-0 text-slate-500 dark:text-slate-400 relative -top-px"
              : "ml-1.5 inline-block shrink-0 text-slate-500 dark:text-slate-400 relative -top-px"
          }
          size={isCompact ? 10.5 : 12}
          aria-hidden="true"
        />
      ) : label === "Mixed" ? (
        <Layers
          className={
            isCompact
              ? "ml-1 inline-block shrink-0 text-cyan-600 dark:text-cyan-400 relative -top-px"
              : "ml-1.5 inline-block shrink-0 text-cyan-600 dark:text-cyan-400 relative -top-px"
          }
          size={isCompact ? 10.5 : 12}
          aria-hidden="true"
        />
      ) : null}
    </span>
  );
}

export function ArrivalTerminatingBadge({
  className = "",
  size = 9,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={`animate-terminating-blink inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 ${className}`.trim()}
    >
      <ArrowDownToLine size={size} aria-hidden="true" className="shrink-0" />
      Terminating
    </span>
  );
}

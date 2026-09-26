export function arrivalSourceBadgeClassName(label: string, size: "default" | "compact" = "default"): string {
  if (size === "compact") {
    const base = "inline-flex h-[20px] shrink-0 items-center rounded border px-1.5 text-[9.5px] font-black uppercase tracking-wide leading-none";
    if (label === "Live") {
      return `${base} border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200`;
    }
    if (label === "Scheduled") {
      return "inline-flex h-[18.5px] shrink-0 items-center rounded border px-1.25 text-[8.5px] font-black uppercase tracking-wide leading-none border-slate-400/35 bg-slate-500/10 text-slate-600 dark:text-slate-300";
    }
    if (label === "Mixed") {
      return "inline-flex h-[18.5px] shrink-0 items-center rounded border px-1.25 text-[8.5px] font-black uppercase tracking-wide leading-none border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200";
    }
    if (label === "No live ETA") {
      return "inline-flex h-[18.5px] shrink-0 items-center rounded border px-1.25 text-[8.5px] font-black uppercase tracking-wide leading-none border-slate-400/35 bg-slate-500/10 text-slate-600 dark:text-slate-300";
    }
    if (label === "Demo") {
      return `${base} border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-200`;
    }
    return `${base} border-slate-400/30 bg-slate-500/5 text-slate-500 dark:text-slate-400`;
  }

  // Default / station detail size
  const base = "inline-flex h-[22px] shrink-0 items-center rounded border px-2 text-[10.5px] font-black uppercase tracking-wide leading-none";
  if (label === "Live") {
    return `${base} border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200`;
  }
  if (label === "Scheduled") {
    return "inline-flex h-[20px] shrink-0 items-center rounded border px-1.5 text-[9.5px] font-black uppercase tracking-wide leading-none border-slate-400/35 bg-slate-500/10 text-slate-600 dark:text-slate-300";
  }
  if (label === "Mixed") {
    return "inline-flex h-[20px] shrink-0 items-center rounded border px-1.5 text-[9.5px] font-black uppercase tracking-wide leading-none border-cyan-500/35 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200";
  }
  if (label === "No live ETA" || label === "Unavailable" || label === "None") {
    return "inline-flex h-[20px] shrink-0 items-center rounded border px-1.5 text-[9.5px] font-black uppercase tracking-wide leading-none border-slate-400/35 bg-slate-500/10 text-slate-600 dark:text-slate-300";
  }
  if (label === "Demo") {
    return `${base} border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-200`;
  }
  return `${base} border-slate-400/30 bg-slate-500/5 text-slate-500 dark:text-slate-400`;
}

export const regionalArrivalSourceBadgeClassName = arrivalSourceBadgeClassName;

export function arrivalTileSourceIndicatorData(status: string, isDue = false, isCompact = false) {
  const isLive = status === "live";
  return {
    isLive,
    source: isLive ? "live" : "scheduled",
    title: isLive ? "Live arrival estimate" : "Scheduled timetable",
    iconSize: isCompact ? 10.5 : 13,
    signalClass: isDue ? "text-emerald-400" : "text-emerald-600 dark:text-emerald-400",
    calendarClass: isDue ? "text-red-200/80" : "text-slate-400 dark:text-slate-500",
  };
}

import type { ReactNode } from "react";
import { ImpactTimestamp } from "./ImpactTimestamp";

export function formatCause(cause: string | null | undefined): string {
  if (!cause) return "";
  const commonWords = new Set(["CLOSURE", "DELAY", "SUSPENSION", "EMERGENCY", "ALARM", "SIGNAL", "PROBLEM", "TRACK", "WORK", "PLANNED", "ROUTE", "SERVICE", "ADVISORY"]);
  const minorWords = new Set(["AND", "OR", "FOR", "THE", "BUT", "NOR", "YET", "SO", "A", "AN", "OF", "IN", "ON", "AT", "TO", "BY", "WITH", "FROM"]);
  
  return cause.replace(/\b[A-Za-z0-9']+\b/g, (word) => {
    const upper = word.toUpperCase();
    if (word === upper) {
      if (commonWords.has(upper)) {
        return upper.charAt(0) + upper.slice(1).toLowerCase();
      }
      if (word.length >= 2 && word.length <= 4 && !minorWords.has(upper)) {
        return upper;
      }
      return upper.charAt(0) + upper.slice(1).toLowerCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

export function lineColor(lineId: string) {
  switch (lineId) {
    case "line-1":
      return { backgroundColor: "#F8C300", color: "#000000" };
    case "line-2":
      return { backgroundColor: "#00923F", color: "#ffffff" };
    case "line-4":
      return { backgroundColor: "#A21A68", color: "#ffffff" };
    case "line-5":
      return { backgroundColor: "#EB8738", color: "#ffffff" };
    case "line-6":
      return { backgroundColor: "#969594", color: "#ffffff" };
    default:
      return { backgroundColor: "#64748b", color: "#ffffff" };
  }
}

export function LineBadge({ lineId, lineNumber }: { lineId: string; lineNumber: string }) {
  return (
    <span className="line-badge small shrink-0" style={lineColor(lineId)}>
      {lineNumber}
    </span>
  );
}

function formatElapsed(timeStr: string) {
  const match = timeStr.match(/(\d+)\s+min/i);
  if (!match) return timeStr.replace(/^Updated\s+/i, "");

  const mins = parseInt(match[1], 10);
  if (mins < 60) {
    return `${mins} min ago`;
  } else if (mins < 24 * 60) {
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    return `${hrs} hr${hrs > 1 ? "s" : ""} ${m > 0 ? `${m} min ` : ""}ago`;
  } else if (mins < 7 * 24 * 60) {
    const days = Math.floor(mins / (24 * 60));
    const remainingHrs = Math.floor((mins % (24 * 60)) / 60);
    return `${days} day${days > 1 ? "s" : ""}${remainingHrs > 0 ? ` ${remainingHrs} hr${remainingHrs > 1 ? "s" : ""}` : ""} ago`;
  } else if (mins < 30 * 24 * 60) {
    const weeks = Math.floor(mins / (7 * 24 * 60));
    const remainingDays = Math.floor((mins % (7 * 24 * 60)) / (24 * 60));
    return `${weeks} week${weeks > 1 ? "s" : ""}${remainingDays > 0 ? ` ${remainingDays} day${remainingDays > 1 ? "s" : ""}` : ""} ago`;
  } else {
    const months = Math.floor(mins / (30 * 24 * 60));
    const remainingWeeks = Math.floor((mins % (30 * 24 * 60)) / (7 * 24 * 60));
    return `${months} month${months > 1 ? "s" : ""}${remainingWeeks > 0 ? ` ${remainingWeeks} week${remainingWeeks > 1 ? "s" : ""}` : ""} ago`;
  }
}

function LongArrowRight() {
  return (
    <svg width="32" height="16" viewBox="0 0 32 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mx-1 text-slate-800 dark:text-white">
      <path d="M0 8h30M23 1l7 7-7 7"/>
    </svg>
  );
}

function LongArrowLeftRight() {
  return (
    <svg width="32" height="16" viewBox="0 0 32 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mx-1 text-slate-800 dark:text-white">
      <path d="M2 8h28M9 1L2 8l7 7M23 1l7 7-7 7"/>
    </svg>
  );
}

function splitLocation(location: string): { from: string; to: string; twoWay: boolean } | null {
  if (!location) return null;
  if (location.includes(" ↔ ")) {
    const [from, to] = location.split(" ↔ ", 2);
    return { from, to, twoWay: true };
  }
  if (location.includes(" → ")) {
    const [from, to] = location.split(" → ", 2);
    return { from, to, twoWay: false };
  }
  if (location.includes(" <-> ")) {
    const [from, to] = location.split(" <-> ", 2);
    return { from, to, twoWay: true };
  }
  if (location.includes(" to ")) {
    const [from, to] = location.split(" to ", 2);
    return { from, to, twoWay: false };
  }
  return null;
}

function isBidirectionalRouteDirection(direction?: string | null): boolean {
  if (!direction) return false;
  const normalized = direction.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized === "bidirectional"
    || normalized === "both way"
    || normalized === "both ways"
    || normalized === "both directions"
    || normalized === "in both directions"
    || normalized === "northbound & southbound"
    || normalized === "southbound & northbound"
    || normalized === "eastbound & westbound"
    || normalized === "westbound & eastbound";
}

export function formatCompactLocation(location: string): string {
  const bounds = splitLocation(location);
  if (!bounds) return location || "Affected segment unavailable";
  return `${bounds.from} ${bounds.twoWay ? "↔" : "→"} ${bounds.to}`;
}

export function ImpactRouteHeader({
  location,
  direction,
}: {
  location: string;
  direction?: string | null;
}) {
  const bounds = splitLocation(location);
  const showTwoWay = bounds ? bounds.twoWay || isBidirectionalRouteDirection(direction) : false;
  return (
    <div className="impact-route">
      {bounds ? (
        <div className="impact-route__bounds">
          <span>{bounds.from}</span>
          {showTwoWay ? <LongArrowLeftRight /> : <LongArrowRight />}
          <span>{bounds.to}</span>
        </div>
      ) : (
        <div className="impact-route__bounds">
          <span>{location || "Affected segment unavailable"}</span>
        </div>
      )}
      {direction && <div className="impact-route__direction">{direction}</div>}
    </div>
  );
}

export function MetadataGrid({
  cause,
  resolution,
  reason,
  targetRemoval,
  startedAt,
  updatedAt,
  updatedAgo,
  extraRows,
  className = "",
}: {
  cause?: string | null;
  resolution?: string | null;
  reason?: string | null;
  targetRemoval?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  updatedAgo?: string | null;
  extraRows?: Array<{ label: string; value?: string | null }>;
  className?: string;
}) {
  const causeValue = formatCause(cause ?? reason);
  const resolutionValue = resolution ?? targetRemoval;
  const renderedExtraRows = (extraRows ?? [])
    .filter((row) => row.value && row.value.trim().length > 0)
    .map((row) => [row.label, row.value] as const);

  const rows = [
    causeValue ? ["Cause", causeValue] as const : null,
    resolutionValue ? ["Est.\u00A0\u00A0\u00A0Resolution", resolutionValue] as const : null,
    ...renderedExtraRows,
    ["Started", <ImpactTimestamp key="started" timestamp={startedAt} />] as const,
    [
      "Updated",
      updatedAt
        ? <ImpactTimestamp key="updated" timestamp={updatedAt} />
        : updatedAgo
          ? formatElapsed(updatedAgo)
          : <ImpactTimestamp key="updated" timestamp={updatedAt} />,
    ] as const,
  ].filter(Boolean) as Array<[string, ReactNode]>;

  if (rows.length === 0) return null;

  return (
    <dl className={`impact-metadata-grid ${className}`.trim()}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CardSource({ source }: { source: string }) {
  if (!source) return null;
  return (
    <span className="inline-flex items-center shrink-0 text-[7px] sm:text-[8px] text-slate-500/80 dark:text-slate-400/80 font-bold px-1 sm:px-1.5 py-0.5 rounded-[3px] border border-black/10 dark:border-white/10 uppercase tracking-wide sm:tracking-widest bg-black/5 dark:bg-white/5 whitespace-nowrap">
      Source: {source}
    </span>
  );
}

export function JumpToLocationIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* focus corners */}
      <path d="M4 8V5.5C4 4.67 4.67 4 5.5 4H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
      <path d="M16 4H18.5C19.33 4 20 4.67 20 5.5V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
      <path d="M20 16V18.5C20 19.33 19.33 20 18.5 20H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
      <path d="M8 20H5.5C4.67 20 4 19.33 4 18.5V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>

      {/* map pin */}
      <path d="M12 7.5C10.07 7.5 8.5 9.07 8.5 11C8.5 13.6 12 16.5 12 16.5C12 16.5 15.5 13.6 15.5 11C15.5 9.07 13.93 7.5 12 7.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
      <circle cx="12" cy="11" r="1.25" fill="currentColor"></circle>
    </svg>
  );
}

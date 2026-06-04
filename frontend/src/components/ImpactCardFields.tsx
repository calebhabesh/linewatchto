import type { ReactNode } from "react";
import { ImpactTimestamp } from "./ImpactTimestamp";

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

export function ImpactRouteHeader({
  location,
  direction,
}: {
  location: string;
  direction?: string;
}) {
  const bounds = splitLocation(location);
  return (
    <div className="impact-route">
      {bounds ? (
        <div className="impact-route__bounds">
          <span>{bounds.from}</span>
          {bounds.twoWay ? <LongArrowLeftRight /> : <LongArrowRight />}
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
  const causeValue = cause ?? reason;
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
    <svg className={className} viewBox="0 0 20 20" version="1.1" xmlns="http://www.w3.org/2000/svg">
      <g stroke="none" strokeWidth="1" fill="none" fillRule="evenodd">
        <g transform="translate(-300.000000, -4439.000000)" fill="currentColor">
          <g transform="translate(56.000000, 160.000000)">
            <path d="M264,4281 L264,4286 C264,4286.552 263.552,4287 263,4287 C262.448,4287 262,4286.552 262,4286 L262,4282 C262,4281.448 261.552,4281 261,4281 L257,4281 C256.448,4281 256,4280.552 256,4280 C256,4279.448 256.448,4279 257,4279 L262,4279 C263.105,4279 264,4279.895 264,4281 L264,4281 Z M262,4299 L257,4299 C256.448,4299 256,4298.552 256,4298 C256,4297.448 256.448,4297 257,4297 L261,4297 C261.552,4297 262,4296.552 262,4296 L262,4292 C262,4291.448 262.448,4291 263,4291 C263.552,4291 264,4291.448 264,4292 L264,4297 C264,4298.105 263.105,4299 262,4299 L262,4299 Z M244,4297 L244,4292 C244,4291.448 244.448,4291 245,4291 C245.552,4291 246,4291.448 246,4292 L246,4296 C246,4296.552 246.448,4297 247,4297 L251,4297 C251.552,4297 252,4297.448 252,4298 C252,4298.552 251.552,4299 251,4299 L246,4299 C244.895,4299 244,4298.105 244,4297 L244,4297 Z M244,4286 L244,4281 C244,4279.895 244.895,4279 246,4279 L251,4279 C251.552,4279 252,4279.448 252,4280 C252,4280.552 251.552,4281 251,4281 L247,4281 C246.448,4281 246,4281.448 246,4282 L246,4286 C246,4286.552 245.552,4287 245,4287 C244.448,4287 244,4286.552 244,4286 L244,4286 Z M244.01,4289 L244,4289.01 L244,4288.99 L244.01,4289 Z M254,4291 C252.897,4291 252,4290.103 252,4289 C252,4287.897 252.897,4287 254,4287 C255.103,4287 256,4287.897 256,4289 C256,4290.103 255.103,4291 254,4291 L254,4291 Z M257.859,4290 L259,4290 C259.552,4290 260,4289.552 260,4289 C260,4288.448 259.552,4288 259,4288 L257.859,4288 C257.496,4286.599 256.401,4285.504 255,4285.141 L255,4284 C255,4283.448 254.552,4283 254,4283 C253.448,4283 253,4283.448 253,4284 L253,4285.141 C251.599,4285.504 250.504,4286.599 250.141,4288 L249,4288 C248.448,4288 248,4288.448 248,4289 C248,4289.552 248.448,4290 249,4290 L250.141,4290 C250.504,4291.401 251.599,4292.496 253,4292.859 L253,4294 C253,4294.552 253.448,4295 254,4295 C254.552,4295 255,4294.552 255,4294 L255,4292.859 C256.401,4292.496 257.496,4291.401 257.859,4290 L257.859,4290 Z" />
          </g>
        </g>
      </g>
    </svg>
  );
}

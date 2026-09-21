import type { ReactNode } from "react";
import { ArrowLeft, MapPinned } from "lucide-react";
import type { AccountCommutePathPreview } from "../app/account-data";
import { normalizeDashboardSourceLabel } from "../app/dashboard-source-label";
import { ImpactTimestamp } from "./ImpactTimestamp";
import { PlannedClosureIcon } from "./PlannedClosureIcon";
import { TransitLineBadge } from "./TransitLineBadge";

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

export function LineBadge({ lineId, lineNumber, size = 28 }: { lineId: string; lineNumber: string; size?: number }) {
  return <TransitLineBadge lineId={lineId} lineNumber={lineNumber} size={size} className="impact-card-line-badge shrink-0" />;
}

export function RelatedPlannedClosureButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="related-planned-closure-button"
      onClick={onClick}
      aria-label="View related planned closure details"
    >
      <PlannedClosureIcon size={14} aria-hidden="true" />
      <span>View Details</span>
    </button>
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
    <svg width="32" height="16" viewBox="0 0 32 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="impact-route__arrow text-slate-800 dark:text-white" aria-hidden="true">
      <path d="M0 8h30M23 1l7 7-7 7"/>
    </svg>
  );
}

function LongArrowLeftRight() {
  return (
    <svg width="32" height="16" viewBox="0 0 32 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="impact-route__arrow text-slate-800 dark:text-white" aria-hidden="true">
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

export function CompactImpactLocation({ location }: { location: string }) {
  const bounds = splitLocation(location);
  if (!bounds) {
    return (
      <span className="compact-impact-location">
        <span className="compact-impact-location__station">{location || "Affected segment unavailable"}</span>
      </span>
    );
  }

  const formattedLocation = formatCompactLocation(location);
  return (
    <span className="compact-impact-location" aria-label={formattedLocation}>
      <span className="compact-impact-location__station">{bounds.from}</span>
      <svg
        className="compact-impact-location__arrow"
        viewBox="0 0 20 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {bounds.twoWay ? (
          <path d="M2 6h16M6 2 2 6l4 4m8-8 4 4-4 4" />
        ) : (
          <path d="M1 6h17m-5-4 5 4-5 4" />
        )}
      </svg>
      <span className="compact-impact-location__station">{bounds.to}</span>
    </span>
  );
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
        <div className="impact-route__bounds impact-route__bounds--segment">
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

export function renderClosureScheduleValue(value: ReactNode, isWindowField: boolean): ReactNode {
  if (!isWindowField || typeof value !== "string") {
    return value;
  }

  const rangeMatch = value.match(/^(.*?)\s+([\u2013\u2014-])\s+(.*?)$/);
  if (rangeMatch) {
    const [, rangeStart, separator, rangeEnd] = rangeMatch;

    return (
      <span className="closure-window-value">
        <span className="closure-window-date">{rangeStart} {separator}</span>
        <span className="closure-window-time">{rangeEnd}</span>
      </span>
    );
  }

  if (!value.includes("·")) {
    return value;
  }

  const dotIndex = value.indexOf("·");
  const datePart = value.slice(0, dotIndex).trim();
  const timePart = value.slice(dotIndex + 1).trim();

  return (
    <span className="closure-window-value">
      <span className="closure-window-date">{datePart}</span>
      <span className="closure-window-time">{timePart}</span>
    </span>
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
  startedValue,
  updatedValue,
  leadingRows,
  extraRows,
  trailingRows,
  className = "",
}: {
  cause?: string | null;
  resolution?: string | null;
  reason?: string | null;
  targetRemoval?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  updatedAgo?: string | null;
  startedValue?: ReactNode;
  updatedValue?: ReactNode;
  leadingRows?: Array<{ label: string; value?: ReactNode }>;
  extraRows?: Array<{ label: string; labelSuffix?: ReactNode; value?: ReactNode }>;
  trailingRows?: Array<{ label: string; value?: ReactNode }>;
  className?: string;
}) {
  const causeValue = formatCause(cause ?? reason);
  const resolutionValue = resolution ?? targetRemoval;
  const renderedLeadingRows = (leadingRows ?? [])
    .filter((row) => row.value !== null && row.value !== undefined && (typeof row.value !== "string" || row.value.trim().length > 0))
    .map((row) => [row.label, row.value, null] as const);
  const renderedExtraRows = (extraRows ?? [])
    .filter((row) => row.value !== null && row.value !== undefined && row.value !== "")
    .map((row) => [row.label, row.value, row.labelSuffix ?? null] as const);
  const renderedTrailingRows = (trailingRows ?? [])
    .filter((row) => row.value !== null && row.value !== undefined && row.value !== "")
    .map((row) => [row.label, row.value, null] as const);

  const rows = [
    ...renderedLeadingRows,
    causeValue ? ["Cause", causeValue, null] as const : null,
    resolutionValue ? ["Est. Resolution", resolutionValue, null] as const : null,
    ...renderedExtraRows,
    ["Started", startedValue ?? <ImpactTimestamp key="started" timestamp={startedAt} />, null] as const,
    [
      "Updated",
      updatedValue ?? (updatedAt
        ? <ImpactTimestamp key="updated" timestamp={updatedAt} />
        : updatedAgo
          ? formatElapsed(updatedAgo)
          : <ImpactTimestamp key="updated" timestamp={updatedAt} />),
      null,
    ] as const,
    ...renderedTrailingRows,
  ].filter(Boolean) as Array<[string, ReactNode, ReactNode | null]>;

  if (rows.length === 0) return null;

  return (
    <dl className={`impact-metadata-grid ${className}`.trim()}>
      {rows.map(([label, value, labelSuffix], index) => {
        const isWindowField = label.toLowerCase().includes("window");
        const isClosureSchedule =
          isWindowField ||
          label.toLowerCase().includes("closure date") ||
          label.toLowerCase().includes("closure hour") ||
          label.toLowerCase().includes("schedule");
        const isNarrativeOrLong =
          !isClosureSchedule &&
          !isWindowField &&
          label !== "Started" &&
          label !== "Updated" &&
          label !== "Zone Count" &&
          label !== "Est. Resolution" &&
          typeof value === "string" &&
          (
            (label.toLowerCase() === "cause" && value.length > 50) ||
            (label.toLowerCase() === "reason" && value.length > 50) ||
            (label.toLowerCase().includes("description") && value.length > 40) ||
            (label.toLowerCase().includes("notes") && value.length > 40)
          );

        return (
          <div
            key={label}
            className={[
              index < renderedLeadingRows.length ? "is-emphasized" + (isWindowField ? " is-window-row" : "") : "",
              isClosureSchedule && !isWindowField ? "is-closure-schedule-row" : "",
              label === "Planned Closure" ? "is-planned-closure-row" : "",
              label === "Status" ? "is-status-row" : "",
              (label === "Started" && startedValue) || (label === "Updated" && updatedValue)
                ? "has-directional-timing"
                : "",
              isNarrativeOrLong ? "is-span-columns is-narrative-row" : "",
            ].filter(Boolean).join(" ") || undefined}
          >
            <dt>{label}{labelSuffix}</dt>
            <dd>{renderClosureScheduleValue(value, isWindowField || isClosureSchedule)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export interface ImpactCardMapButtonProps {
  onClick: (e?: React.MouseEvent) => void;
  isActive: boolean;
  onFocusMap?: () => void;
  title: string;
  actionLabel?: string;
  variant?: "icon-only" | "labeled";
  className?: string;
  disabled?: boolean;
}

export function ImpactCardMapButton({
  onClick,
  isActive,
  title,
  actionLabel,
  variant = "labeled",
  className = "",
  disabled = false,
}: ImpactCardMapButtonProps) {
  const labelText = actionLabel ?? (isActive ? "Back" : "Map");
  const isBack = labelText.toLowerCase().includes("back") || labelText.toLowerCase().includes("unfocus");
  const ariaText = disabled
    ? `${title}: location unavailable on map`
    : isBack ? `Back: ${title} (unfocus)` : `View ${title} on map`;
  const tooltipText = isBack ? "Back (Unfocus)" : "View on Map";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={`impact-card-map-btn ${variant === "icon-only" ? "impact-card-map-btn--icon-only" : "impact-card-map-btn--labeled"} ${isActive ? "is-active" : ""} ${className}`.trim()}
      aria-label={ariaText}
      aria-pressed={isActive}
      title={disabled ? "Location unavailable on map" : tooltipText}
      disabled={disabled}
      data-variant={variant}
    >
      {isBack ? (
        <ArrowLeft size={18} className="impact-card-back-icon shrink-0" aria-hidden="true" />
      ) : (
        <MapPinned size={18} className="map-pinned-icon shrink-0" aria-hidden="true" />
      )}
      {variant !== "icon-only" ? (
        <span className="impact-card-map-btn__label">
          {labelText}
        </span>
      ) : null}
    </button>
  );
}

export function ImpactCardShell({
  lineId,
  lineNumber,
  lineBadgeSize,
  title,
  description,
  showNarrative = true,
  location,
  direction,
  isMapActive,
  onMapAction,
  onFocusMap,
  mapActionVariant,
  mapActionLabel,
  mapUnavailable = false,
  badges,
  overlaps,
}: {
  lineId: string;
  lineNumber: string;
  lineBadgeSize?: number;
  title: string;
  description?: string | null;
  showNarrative?: boolean;
  location: string;
  direction?: string | null;
  isMapActive: boolean;
  onMapAction: () => void;
  onFocusMap?: () => void;
  mapActionVariant?: "icon-only" | "labeled";
  mapActionLabel?: string;
  mapUnavailable?: boolean;
  badges?: ReactNode;
  overlaps?: ReactNode;
}) {
  const hasSecondaryDescription = Boolean(description && description !== title);

  return (
    <>
      <div className="impact-card-utility-row">
        <LineBadge lineId={lineId} lineNumber={lineNumber} size={lineBadgeSize} />
        <ImpactCardMapButton
          onClick={onMapAction}
          isActive={isMapActive}
          onFocusMap={onFocusMap}
          title={title}
          variant={mapActionVariant}
          actionLabel={mapActionLabel}
          disabled={mapUnavailable}
        />
      </div>

      <ImpactRouteHeader location={location} direction={direction} />

      {badges ? <div className="impact-card-badges">{badges}</div> : null}

      {showNarrative ? (
        <div className="impact-card-narrative">
          <strong className="impact-card-title">{title}</strong>
          {hasSecondaryDescription ? (
            <p className="impact-card-description">{description}</p>
          ) : null}
        </div>
      ) : (
        <span className="sr-only">{title}</span>
      )}

      {overlaps}
    </>
  );
}

export function CardSource({ source, className = "" }: { source: string; className?: string }) {
  if (!source) return null;
  const displaySource = normalizeDashboardSourceLabel(source);
  const sourceLabel = `Source: ${displaySource}`;
  return (
    <span
      className={`card-source inline-block shrink min-w-0 max-w-[min(14rem,46vw)] overflow-hidden text-ellipsis text-[7px] sm:text-[8px] text-slate-500/80 dark:text-slate-400/80 font-bold px-1 sm:px-1.5 py-0.5 rounded-full border-none uppercase tracking-wide sm:tracking-widest bg-black/5 dark:bg-white/5 whitespace-nowrap ${className}`.trim()}
      title={sourceLabel}
    >
      {sourceLabel}
    </span>
  );
}

export function JumpToLocationIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={`jump-to-location-icon ${className}`.trim()} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* focus corners */}
      <g className="jump-to-corners">
        <path d="M4 8V5.5C4 4.67 4.67 4 5.5 4H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 4H18.5C19.33 4 20 4.67 20 5.5V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 16V18.5C20 19.33 19.33 20 18.5 20H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 20H5.5C4.67 20 4 19.33 4 18.5V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* map pin */}
      <g className="jump-to-pin">
        <path d="M12 7.5C10.07 7.5 8.5 9.07 8.5 11C8.5 13.6 12 16.5 12 16.5C12 16.5 15.5 13.6 15.5 11C15.5 9.07 13.93 7.5 12 7.5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="11" r="1.25" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

export function CommutePathPreviewCardBanner({
  commutePathPreview,
  onClearCommutePathPreview,
  className = "",
}: {
  commutePathPreview: AccountCommutePathPreview;
  onClearCommutePathPreview?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`commute-path-preview-chip commute-path-preview-embedded ${className}`.trim()}
      role="status"
      aria-live="polite"
      data-commute-path-preview-embedded
    >
      <span>
        Viewing <strong>{commutePathPreview.routeLabel}</strong>
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClearCommutePathPreview?.();
        }}
        aria-label="Back to My Commutes"
      >
        Back
      </button>
    </div>
  );
}

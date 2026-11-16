"use client";

import type { PlannedClosure } from "../app/linewatch-data";
import { upcomingAdvisoryPreview } from "../app/upcoming-advisory-preview";
import { formatCause, formatClosureScheduleValue } from "./ImpactCardFields";
import { ImpactTypeIcon } from "./ImpactTypeIcon";
import { IncidentStationSpan } from "./IncidentStationSpan";
import { CardDetailsCue } from "./CardDetailsCue";
import { commutesByTripTimes, type ImpactCommute } from "../app/commute-data";
import { CommuteImpactTag } from "./CommuteImpactTag";
import type { PanelImpactHover } from "./map-overlays/panel-impact-hover";
import { usePanelImpactHover } from "../hooks/usePanelImpactHover";
import { useLayoutEffect, useRef, useState } from "react";

/**
 * Every planned advisory on a line that starts beyond the 24h Current Service
 * window, soonest first (any that cross a saved commute lead), so weekend
 * closures are seen before they become cards. Compact, since none is an
 * immediate concern: type and countdown, the stretch in the cards' shaded band,
 * its direction in their amber with the cause beside it on one line, one line
 * for when, and what replaces trains. Hovering a card raises
 * its planned preview on the map; pressing it opens the full card, as the
 * incident cards do, and "Details ›" says so.
 * Shared by the desktop sidebar and the mobile Current Service sheet.
 */
export function UpcomingAdvisoryCards({
  lineName,
  closures,
  now,
  commutesByImpact,
  onSelect,
}: {
  lineName: string;
  /** This line's upcoming advisories, soonest first (currentServiceSummary().upcoming). */
  closures: PlannedClosure[];
  now: number;
  /** Saved commutes each closure lies on, by closure id (impactCommutes). */
  commutesByImpact?: Map<string, ImpactCommute[]>;
  onSelect: (closureId: string) => void;
}) {
  const hoverProps = usePanelImpactHover();
  if (closures.length === 0) return null;

  // Cards on a commute during its trip times lead; work outside them keeps its date order.
  const onCommute = (closure: PlannedClosure) => commutesByTripTimes(commutesByImpact?.get(closure.id)).during.length > 0;
  const ordered = [...closures].sort((a, b) => Number(onCommute(b)) - Number(onCommute(a)));
  return (
    <div className="upcoming-advisories">
      <div className="line-service-advisory-summary upcoming-advisories-label">
        <span data-trunk-end="">Upcoming</span>
      </div>
      {ordered.map((closure) => {
        const preview = upcomingAdvisoryPreview(closure, now);
        const commutes = commutesByImpact?.get(closure.id) ?? [];
        const impact: PanelImpactHover = { kind: "planned-closure", id: preview.id };
        return (
          <button
            key={preview.id}
            type="button"
            className="upcoming-advisory"
            data-horizon={preview.horizon}
            data-on-commute={onCommute(closure) ? "true" : undefined}
            onClick={() => onSelect(preview.id)}
            {...hoverProps(impact)}
            title={`View ${lineName} ${preview.title} details`}
          >
            <span className="upcoming-advisory-head">
              <ImpactTypeIcon kind="planned-closure" size={13} />
              <strong>{preview.title}</strong>
              <CommuteImpactTag commutes={commutes} />
              {preview.countdown ? <span className="upcoming-advisory-countdown">{preview.countdown}</span> : null}
            </span>
            <span className="upcoming-advisory-span">
              <IncidentStationSpan location={preview.location} direction={preview.direction} />
            </span>
            {preview.direction || preview.cause ? (
              <DirectionAndCause direction={preview.direction} cause={preview.cause ? formatCause(preview.cause) : undefined} />
            ) : null}
            <span className="upcoming-advisory-line">{formatClosureScheduleValue(preview.when)}</span>
            {preview.replacement ? (
              <span className="upcoming-advisory-line upcoming-advisory-replacement">{preview.replacement}</span>
            ) : null}
            <CardDetailsCue />
          </button>
        );
      })}
    </div>
  );
}

/**
 * The direction in amber, a dot, then the cause, muted. The dot holds to the
 * direction (a no-break space), and the cause wraps as one unit: beside the
 * direction when it fits, else on its own line, where the dot would only trail
 * the amber line, so it hides.
 */
function DirectionAndCause({ direction, cause }: { direction?: string; cause?: string }) {
  const rowRef = useRef<HTMLSpanElement>(null);
  const causeRef = useRef<HTMLSpanElement>(null);
  const [causeWrapped, setCauseWrapped] = useState(false);
  const both = Boolean(direction && cause);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const causeElement = causeRef.current;
    if (!both || !row || !causeElement) return;
    // The row is the cause's offset parent (position: relative): 0 on its first line.
    const measure = () => setCauseWrapped(causeElement.offsetTop > 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [both, direction, cause]);

  return (
    <span ref={rowRef} className="upcoming-advisory-direction" data-cause-wrapped={both && causeWrapped ? "true" : undefined}>
      {direction}
      {both ? <span className="upcoming-advisory-cause-separator" aria-hidden="true">{"\u00a0·"}</span> : null}
      {both ? " " : null}
      {cause ? (
        <span ref={causeRef} className="upcoming-advisory-cause">
          <span className="sr-only">{direction ? ", cause: " : "Cause: "}</span>
          {cause}
        </span>
      ) : null}
    </span>
  );
}

"use client";

import { incidentFacts, type CurrentServiceRow } from "../app/current-service";
import { formatCause } from "./ImpactCardFields";
import { ImpactTimestamp } from "./ImpactTimestamp";

/** Source-reported cause and service facts, shared by TTC and GO/UP cards. */
export function IncidentFacts({ row, className }: { row: CurrentServiceRow; className: string }) {
  const facts = incidentFacts(row);
  return <>
    {facts.cause && <span className={className}>Cause: {formatCause(facts.cause)}</span>}
    {facts.service && <span className={className}>{facts.service}</span>}
  </>;
}

/** Quiet footer showing when an unplanned incident was posted and how long ago. */
export function IncidentPostedTime({ row, className, now, saved }: {
  row: CurrentServiceRow;
  className: string;
  now: number;
  saved: boolean;
}) {
  const { postedAt } = incidentFacts(row, now);
  if (!postedAt) return null;
  return (
    <span className={`${className} incident-posted-time`}>
      Posted: <ImpactTimestamp timestamp={postedAt} format="publication" elapsed={!saved} />
    </span>
  );
}

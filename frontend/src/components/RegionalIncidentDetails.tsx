"use client";

import { regionalIncidentFacts, type CurrentServiceRow } from "../app/current-service";
import { formatCause } from "./ImpactCardFields";
import { ImpactTimestamp } from "./ImpactTimestamp";

export function RegionalIncidentDetails({ row, className }: { row: CurrentServiceRow; className: string }) {
  const facts = regionalIncidentFacts(row);
  return <>
    {facts.cause && <span className={className}>Cause: {formatCause(facts.cause)}</span>}
    {facts.service && <span className={className}>{facts.service}</span>}
    {facts.publishedAt && <span className={`${className} regional-incident-update`}>
      Posted: <ImpactTimestamp timestamp={facts.publishedAt} format="publication" />
    </span>}
  </>;
}

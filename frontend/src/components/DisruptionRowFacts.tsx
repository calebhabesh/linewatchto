import { Bus, Clock } from "lucide-react";
import type { DisruptionRowFacts as Facts } from "../app/disruption-row-facts";
import { formatCause } from "./ImpactCardFields";

/**
 * The key facts under an Active Disruptions row (My Commutes and My Stations):
 * when, the reduced speed of a slow zone, the cause, and shuttle buses.
 */
export function DisruptionRowFacts({ facts }: { facts: Facts | null }) {
  if (!facts) return null;
  const cause = formatCause(facts.cause);
  return (
    <span className="disruption-row-facts">
      {facts.when ? (
        <span className="disruption-row-fact">
          <Clock size={11} aria-hidden="true" />
          {facts.when}
        </span>
      ) : null}
      {facts.reducedSpeed ? <span className="disruption-row-fact">Reduced Speed: {facts.reducedSpeed}</span> : null}
      {cause ? <span className="disruption-row-fact">Cause: {cause}</span> : null}
      {facts.shuttle ? (
        <span className="disruption-row-fact is-shuttle">
          <Bus size={11} aria-hidden="true" />
          Shuttle Buses
        </span>
      ) : null}
    </span>
  );
}

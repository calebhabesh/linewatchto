import type { RegionalArrival } from "../app/regional-arrivals";
import { getRegionalArrivalDelayMinutes, shouldShowRegionalArrivalDelay } from "../app/regional-arrivals";
import { ArrivalDelayBadge } from "./ArrivalDelayBadge";

type Props = {
  arrival: Pick<RegionalArrival, "delayMinutes" | "minutes" | "predictedAt" | "status">;
  now: Date | number;
  isDue?: boolean;
  isCompact?: boolean;
};

export function RegionalArrivalDelayBadge({ arrival, now, isDue = false, isCompact = false }: Props) {
  const delayMinutes = shouldShowRegionalArrivalDelay(arrival, now)
    ? getRegionalArrivalDelayMinutes(arrival)
    : null;
  if (delayMinutes === null) return null;

  return (
    <ArrivalDelayBadge delayMinutes={delayMinutes} isDue={isDue} isCompact={isCompact} />
  );
}

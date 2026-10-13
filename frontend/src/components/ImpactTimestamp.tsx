"use client";

import { useEffect, useState } from "react";
import { formatFullImpactTimestamp, formatImpactTimestamp, formatPublicationTimestamp } from "../app/impact-time";

export function ImpactTimestamp({ timestamp, format, elapsed = true }: {
  timestamp?: string | null;
  format?: "publication";
  /** Publication format only: false omits the age, e.g. for saved reports. */
  elapsed?: boolean;
}) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!timestamp) return <>Not Reported</>;

  return (
    <time
      className={format === "publication" ? "incident-publication-timestamp" : "impact-timestamp"}
      dateTime={timestamp}
      title={formatFullImpactTimestamp(timestamp)}
      suppressHydrationWarning
    >
      {format === "publication" ? formatPublicationTimestamp(timestamp, new Date(), { elapsed }) : formatImpactTimestamp(timestamp)}
    </time>
  );
}

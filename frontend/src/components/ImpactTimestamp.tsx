"use client";

import { useEffect, useState } from "react";
import { formatFullImpactTimestamp, formatImpactTimestamp, formatPublicationTimestamp } from "../app/impact-time";

export function ImpactTimestamp({ timestamp, format }: { timestamp?: string | null; format?: "publication" }) {
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
      {format === "publication" ? formatPublicationTimestamp(timestamp) : formatImpactTimestamp(timestamp)}
    </time>
  );
}
